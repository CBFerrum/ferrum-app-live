//! Live end to end against a real PostgreSQL (`FERRUM_LIVE_TEST_DATABASE_URL`, default
//! `postgres://ferrum:ferrum@localhost:5432/ferrum_live_test`; the database is reset first), with the relay behind
//! its interface replaced by the fake: there is no relay here (docs/moq.md says what that leaves untested).
//!
//! Covered: settings and the key that is never returned; presenting (who may, what state, the one-time link);
//! watching (the audience ladder, the platform's permission on the attached record, links, the open door); the
//! tokens each route asks the relay for (one path, one right, short lived); every refusal to renew; seats and the
//! last seat taken by two viewers at once; the page and its frame headers; the embed description; upkeep;
//! retention; replay; erasure of a presenter's name; reports and the health check.

use chrono::{DateTime, Duration, Utc};
use ferrum_app_live::relay::{Access, FakeRelay};
use ferrum_kernel::tenant::NewTenant;
use ferrum_kernel::{Ctx, Db, DbConfig, Doc, Error, HookRegistry, Kernel, KernelSettings, SiteRequest};
use ferrum_meta::Catalog;
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

const PASSWORD: &str = "Correct-Horse-9";

fn obj(v: Value) -> Doc {
    v.as_object().cloned().unwrap()
}

fn uid(v: &Doc) -> Uuid {
    v["id"].as_str().unwrap().parse().unwrap()
}

#[track_caller]
fn refused<T: std::fmt::Debug>(r: Result<T, Error>, kind: &str) -> String {
    let ok = matches!(
        (&r, kind),
        (Err(Error::NotFound(_)), "not found")
            | (Err(Error::Forbidden(_)), "forbidden")
            | (Err(Error::Invalid(_) | Error::Validation(_)), "invalid")
            | (Err(Error::Conflict(_)), "conflict")
            | (Err(Error::Unavailable(_)), "unavailable")
    );
    assert!(ok, "expected {kind}, got {r:?}");
    match r {
        Err(Error::Validation(v)) => v.iter().map(|f| f.message.clone()).collect::<Vec<_>>().join("; "),
        Err(e) => e.to_string(),
        Ok(_) => unreachable!(),
    }
}

struct T {
    k: Arc<Kernel>,
    relay: Arc<FakeRelay>,
}

struct Tenant {
    id: Uuid,
    admin: Ctx,
}

impl T {
    async fn tenant(&self, slug: &str) -> Tenant {
        let id = self
            .k
            .create_tenant(NewTenant {
                slug: slug.into(),
                name: format!("{slug} Corp"),
                admin_email: format!("admin@{slug}.test"),
                admin_password: PASSWORD.into(),
                admin_name: None,
                packages: vec!["live".into()],
                settings: Some(json!({"timezone": "UTC"})),
            })
            .await
            .expect("tenant");
        let session = self.k.login(slug, &format!("admin@{slug}.test"), PASSWORD).await.expect("login");
        let admin = self.k.load_ctx(id, session.user, Some(session.token_version), "it".into()).await.expect("ctx");
        Tenant { id, admin }
    }

    async fn user(&self, t: &Tenant, email: &str, name: &str, roles: &[&str]) -> Ctx {
        let roles: Vec<String> = roles.iter().map(|r| r.to_string()).collect();
        let id = self.k.create_user(&t.admin, email, name, Some(PASSWORD), &roles, false).await.expect("user");
        self.k.load_ctx(t.id, id, None, "it".into()).await.expect("ctx")
    }

    /// The person as the server would load them for the next request, after their roles changed.
    async fn reload(&self, t: &Tenant, who: &Ctx) -> Ctx {
        self.k.load_ctx(t.id, who.user, None, "it2".into()).await.expect("ctx")
    }

    async fn broadcast(&self, who: &Ctx, values: Value) -> Uuid {
        let mut v = obj(json!({"title": "Launch"}));
        v.extend(obj(values));
        uid(&self.k.insert(who, "Broadcast", v).await.unwrap_or_else(|e| panic!("broadcast: {e:?}")))
    }

    async fn get(&self, who: &Ctx, id: Uuid) -> Doc {
        self.k.get(who, "Broadcast", id, false).await.unwrap_or_else(|e| panic!("get: {e:?}"))
    }

    /// One call to the app's endpoints as the server hands it over: `(status, json)`.
    async fn call(&self, t: &Tenant, user: Option<&Ctx>, method: &str, path: &str, query: Value, body: Value) -> Result<(u16, Value), Error> {
        let resp = self.raw(t, user, method, path, query, body).await?;
        assert!(resp.headers.iter().any(|(k, v)| k == "cache-control" && v == "no-store"), "answers are never kept");
        Ok((resp.status, serde_json::from_slice(&resp.body).unwrap_or(Value::Null)))
    }

    async fn raw(&self, t: &Tenant, user: Option<&Ctx>, method: &str, path: &str, query: Value, body: Value) -> Result<ferrum_kernel::SiteResponse, Error> {
        let req = SiteRequest {
            tenant: t.id,
            user: user.cloned(),
            method: method.into(),
            path: path.into(),
            query: query.as_object().cloned().unwrap_or_default(),
            headers: Map::new(),
            body: if body.is_null() { vec![] } else { body.to_string().into_bytes() },
            client_ip: "203.0.113.7".into(),
        };
        self.k.hooks.site("live").expect("live site").handle(&self.k, req).await
    }

    async fn post(&self, t: &Tenant, user: Option<&Ctx>, id: Uuid, route: &str, body: Value) -> Result<(u16, Value), Error> {
        self.call(t, user, "POST", &format!("/broadcasts/{id}/{route}"), Value::Null, body).await
    }

    /// The relay asking Live about a session (`--auth-url`).
    async fn auth(&self, t: &Tenant, body: Value) -> Result<(u16, Value), Error> {
        self.call(t, None, "POST", "/relay/auth", Value::Null, body).await
    }

    /// A viewer's first call and its answer's token, as the page makes them.
    async fn watch(&self, t: &Tenant, user: Option<&Ctx>, id: Uuid, body: Value) -> Result<(u16, Value), Error> {
        self.post(t, user, id, "watch", body).await
    }

    async fn sql(&self, t: &Tenant, sql: &str, id: Uuid) -> u64 {
        let mut tx = self.k.db.tenant_tx(t.id).await.unwrap();
        let n = sqlx::query(sqlx::AssertSqlSafe(sql.to_string()))
            .bind(t.id)
            .bind(id)
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|e| panic!("{sql}: {e}"))
            .rows_affected();
        tx.commit().await.unwrap();
        n
    }

    async fn scalar<O: Send + Unpin + for<'r> sqlx::Decode<'r, sqlx::Postgres> + sqlx::Type<sqlx::Postgres>>(&self, t: &Tenant, sql: &str, id: Uuid) -> O {
        let mut tx = self.k.db.tenant_tx(t.id).await.unwrap();
        let v = sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_string())).bind(t.id).bind(id).fetch_one(&mut *tx).await.unwrap_or_else(|e| panic!("{sql}: {e}"));
        tx.commit().await.unwrap();
        v
    }

    fn minted(&self) -> Vec<(String, Access, DateTime<Utc>)> {
        self.relay.minted.lock().unwrap().clone()
    }
}

fn at(v: &Value) -> DateTime<Utc> {
    v.as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|| panic!("a time: {v}"))
}

/// Notes a rule that does not hold, so one run shows every one that fails.
fn expect(wrong: &mut Vec<String>, what: &str, ok: bool) {
    if !ok {
        wrong.push(what.to_string());
    }
}

fn nonce(n: u32) -> String {
    format!("browser-{n:04}-abcdefghijkl")
}

fn catalog() -> Catalog {
    let mut packages = ferrum_domain::packages().expect("platform packages");
    packages.extend(ferrum_app_live::packages().expect("app packages"));
    Catalog::from_packages(packages).expect("catalog")
}

fn kernel_settings() -> KernelSettings {
    KernelSettings { ctx_ttl: std::time::Duration::ZERO, ..Default::default() }
}

/// Live registered as the server registers it (as itself, so that it takes its own vault handle), and its handle.
fn registered(relay: Arc<FakeRelay>) -> (HookRegistry, ferrum_kernel::vault::Vault) {
    let mut hooks = HookRegistry::default();
    ferrum_domain::register(&mut hooks);
    let mut vault = None;
    hooks.app("live", &[], |h| {
        ferrum_app_live::register_with(h, relay);
        vault = Some(h.vault());
    });
    // It owns its packages, as the server says: a secret field one of them declares is Live's.
    hooks.own("live", &ferrum_app_live::packages().unwrap().iter().map(|p| p.name().to_string()).collect::<Vec<_>>());
    (hooks, vault.expect("Live's handle"))
}

#[test]
fn live_end_to_end() {
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().thread_stack_size(16 << 20).build().unwrap();
    rt.block_on(async { tokio::spawn(scenario()).await.unwrap() });
}

async fn scenario() {
    let db_url = std::env::var("FERRUM_LIVE_TEST_DATABASE_URL").unwrap_or_else(|_| "postgres://ferrum:ferrum@localhost:5432/ferrum_live_test".into());
    let db = Db::connect(DbConfig { url: db_url.clone(), max_connections: 24, ..Default::default() }).await.expect("connect");
    sqlx::raw_sql("drop schema if exists vault cascade; drop schema if exists public cascade; create schema public;").execute(&db.pool).await.expect("reset");
    // The vault, opened as a server opens it (its credential slot, from the address's password), once migrated.
    let opener = ferrum_kernel::vault::Opener {
        database_url: db_url.clone(),
        file: "/nonexistent/root.key".into(),
        kdf: ferrum_kernel::vault::Kdf { m_kib: 64, t: 1, p: 1 },
        ..Default::default()
    };
    ferrum_kernel::vault::open(&db, opener, false).await.expect("the vault");
    let relay = Arc::new(FakeRelay::new());
    let (hooks, live_vault) = registered(relay.clone());
    let k = Kernel::boot(db, catalog(), hooks, kernel_settings(), None).await.expect("boot");
    let t = T { k: k.clone(), relay };

    let acme = t.tenant("acme").await;
    let asha = t.user(&acme, "asha@acme.test", "Asha Rao", &["Live User"]).await;
    let ravi = t.user(&acme, "ravi@acme.test", "Ravi Kumar", &["Live User"]).await;
    let mira = t.user(&acme, "mira@acme.test", "Mira Chen", &["Live Manager"]).await;
    let nobody = t.user(&acme, "nobody@acme.test", "No Role", &[]).await;

    // ───────────── nothing is set up: nobody is given access, and the broadcast keeps its state ─────────────
    let early = t.broadcast(&asha, json!({"title": "Early", "audience": "Public"})).await;
    refused(t.post(&acme, Some(&asha), early, "publish", Value::Null).await, "unavailable");
    assert_eq!(t.get(&asha, early).await["status"], "Scheduled", "a start that could not be given access did not make it Live");
    {
        let (id, mut tx) = (acme.id, k.db.system_tenant_tx(acme.id).await.unwrap());
        let health = k.hooks.health().iter().find(|(p, _)| p == "live").expect("registered health").1.clone();
        let said = health.health(&k, &mut tx, id).await.unwrap();
        let words = said["problems"].to_string();
        assert!(words.contains("no relay address") && words.contains("no signing key"), "{words}");
        tx.commit().await.unwrap();
    }

    // ───────────── settings: the key is checked, kept in the vault and never shown ─────────────
    let set = uid(&k
        .insert(&mira, "LiveSettings", obj(json!({"relay_url": "https://relay.example.com/", "replay_base_url": "https://replays.example.com"})))
        .await
        .unwrap());
    refused(k.run_action(&mira, "LiveSettings", set, "set_signing_key", json!({"key": "has spaces"})).await, "invalid");
    refused(k.run_action(&asha, "LiveSettings", set, "set_signing_key", json!({"key": "key-1"})).await, "forbidden");
    k.run_action(&mira, "LiveSettings", set, "set_signing_key", json!({"key": "key-1"})).await.unwrap();
    let shown = k.get(&mira, "LiveSettings", set, false).await.unwrap();
    assert_eq!(shown["signing_key_id"], "key-1");
    for bad in [
        json!({"path_prefix": "a/b"}),
        json!({"stream_name": "../x"}),
        json!({"player_module_url": "https://x.example.com/a\"+alert(1)+\""}),
        json!({"player_module_url": "http://x.example.com/a.js"}),
    ] {
        refused(k.update(&mira, "LiveSettings", set, obj(bad), None).await, "invalid");
    }
    {
        let (id, mut tx) = (acme.id, k.db.system_tenant_tx(acme.id).await.unwrap());
        let health = k.hooks.health().iter().find(|(p, _)| p == "live").unwrap().1.clone();
        *t.relay.up.lock().unwrap() = false;
        let down = health.health(&k, &mut tx, id).await.unwrap();
        assert!(down["problems"].to_string().contains("does not answer"), "{down}");
        *t.relay.up.lock().unwrap() = true;
        let up = health.health(&k, &mut tx, id).await.unwrap();
        assert_eq!(up["problems"], json!([]), "{up}");
        tx.commit().await.unwrap();
    }

    // ───────────── what people write ─────────────
    let m = refused(k.insert(&asha, "Broadcast", obj(json!({"title": "x", "reference_entity": "Broadcast"}))).await, "invalid");
    assert!(m.contains("both"), "{m}");
    refused(
        k.insert(&asha, "Broadcast", obj(json!({"title": "x", "reference_entity": "Nothing", "reference_id": Uuid::now_v7().to_string()}))).await,
        "invalid",
    );
    refused(
        k.insert(&asha, "Broadcast", obj(json!({"title": "x", "planned_start": "2030-01-02T10:00:00Z", "planned_end": "2030-01-02T09:00:00Z"}))).await,
        "invalid",
    );
    refused(k.insert(&asha, "Broadcast", obj(json!({"title": "x", "frame_origins": "https://ok.example.com *.evil.example"}))).await, "invalid");
    refused(k.insert(&asha, "Broadcast", obj(json!({"title": "x", "publishers": [{"email": "a@x.test"}, {"email": "A@X.test"}]}))).await, "invalid");
    // Status and the counts are the app's: a person's attempt to write them changes nothing.
    let tried = k.update(&asha, "Broadcast", early, obj(json!({"status": "Live", "viewers_peak": 99})), None).await;
    let kept = match tried {
        Ok(doc) => (doc["status"].clone(), doc["viewers_peak"].clone()),
        Err(_) => (json!("Scheduled"), json!(0)),
    };
    assert_eq!(kept, (json!("Scheduled"), json!(0)));
    assert_eq!(t.get(&asha, early).await["status"], "Scheduled");
    // Viewer counts are derived from seats, never typed: not by a manager either, nor through the gate an agent uses.
    let typed = json!({"viewers_peak": 50, "viewers_total": 70, "started_at": "2030-01-01T00:00:00Z", "presenter_name": "Someone"});
    let _ = k.update(&mira, "Broadcast", early, obj(typed.clone()), None).await;
    let through_gate =
        k.invoke(&mira, ferrum_kernel::capability::Invocation::new("live.broadcast.update", json!({"id": early, "values": typed})).key("typed-counts-1")).await;
    assert!(!matches!(through_gate, Err(Error::NotFound(_))), "the gate knows the operation: {through_gate:?}");
    let b = t.get(&mira, early).await;
    assert_eq!(
        (b["viewers_peak"].clone(), b["viewers_total"].clone(), b["started_at"].clone(), b["presenter_name"].clone()),
        (json!(0), json!(0), Value::Null, Value::Null),
        "{b:?}"
    );

    // ───────────── presenting ─────────────
    let live = t.broadcast(&asha, json!({"title": "Webinar", "audience": "Public", "capacity": 2, "waiting_text": "Starting at ten"})).await;
    let path = format!("live/{}/{}", acme.id.simple(), live.simple());
    refused(t.post(&acme, Some(&ravi), live, "publish", Value::Null).await, "not found");
    refused(t.post(&acme, None, live, "publish", Value::Null).await, "not found");
    refused(t.post(&acme, Some(&nobody), live, "publish", Value::Null).await, "not found");
    // Before it starts a viewer is told so, in the broadcast's own words, and is given neither a token nor a seat.
    let (st, waiting) = t.watch(&acme, None, live, json!({"seat": nonce(1)})).await.unwrap();
    assert_eq!((st, waiting["status"].as_str(), waiting["text"].as_str()), (200, Some("Scheduled"), Some("Starting at ten")));
    assert!(waiting.get("token").is_none() && t.minted().is_empty());
    let (_, offer) = t.post(&acme, Some(&asha), live, "publish", Value::Null).await.unwrap();
    assert_eq!(offer["status"], "Live");
    assert_eq!(offer["relay"], "https://relay.example.com");
    assert_eq!(offer["path"], path.as_str());
    assert_eq!(offer["name"], "live.hang");
    assert_eq!(offer["recording"], false);
    assert!(
        offer["token"].as_str().unwrap().contains("publish") && offer["url"].as_str().unwrap().starts_with(&format!("https://relay.example.com/{path}?t="))
    );
    let b = t.get(&asha, live).await;
    assert_eq!((b["status"].as_str(), b["presenter_name"].as_str(), b["presenter_email"].as_str()), (Some("Live"), Some("Asha Rao"), Some("asha@acme.test")));
    // The one token minted names this broadcast's path and the right to publish, and ends within the presenter's token life.
    let minted = t.minted();
    assert_eq!(minted.len(), 1);
    assert_eq!((minted[0].0.as_str(), minted[0].1), (path.as_str(), Access::Publish));
    // A pass lets its holder connect for a few minutes (the lead, 20 Nov: "a pass is for one person, one room, one role
    // and a few minutes"); the session it opens lasts the presenter's token minutes, and Live is asked again meanwhile.
    assert!((minted[0].2 - (Utc::now() + Duration::minutes(3))).num_seconds().abs() < 30);
    assert!((at(&offer["expires_at"]) - (Utc::now() + Duration::minutes(60))).num_seconds().abs() < 30);
    assert_eq!(offer["refresh_in"], 2400, "renewed at two thirds of the life");
    // Renewal: the presenter only, and only while Live.
    t.post(&acme, Some(&asha), live, "publish/refresh", Value::Null).await.unwrap();
    refused(t.post(&acme, Some(&ravi), live, "publish/refresh", Value::Null).await, "not found");
    refused(t.post(&acme, Some(&asha), early, "publish/refresh", Value::Null).await, "conflict");
    // A person the broadcast names, and a holder of the role it names, may present; Mira may end but not start.
    let team =
        t.broadcast(&asha, json!({"title": "Team", "publisher_role": "Live Manager", "publishers": [{"email": "ravi@acme.test", "name": "Ravi"}]})).await;
    t.post(&acme, Some(&mira), team, "publish", Value::Null).await.unwrap();
    t.post(&acme, Some(&ravi), team, "publish", Value::Null).await.unwrap();
    refused(t.post(&acme, Some(&nobody), team, "publish", Value::Null).await, "not found");
    refused(k.delete(&asha, "Broadcast", team, None).await, "invalid");
    t.post(&acme, Some(&ravi), team, "end", Value::Null).await.unwrap();

    // ───────────── watching: seats, tokens, and every refusal to renew ─────────────
    let (_, a) = t.watch(&acme, None, live, json!({"seat": nonce(1)})).await.unwrap();
    assert_eq!(a["status"], Value::Null, "an offer has no state word");
    let watching = t.minted().into_iter().filter(|m| m.1 == Access::Watch).collect::<Vec<_>>();
    assert_eq!(watching.len(), 1);
    assert_eq!(watching[0].0, path, "a viewer's token is for exactly this path");
    assert!((watching[0].2 - (Utc::now() + Duration::minutes(3))).num_seconds().abs() < 30, "a few minutes to connect");
    assert!((at(&a["expires_at"]) - (Utc::now() + Duration::minutes(10))).num_seconds().abs() < 30, "short lived");
    assert_eq!(a["refresh_in"], 400);
    let (_, _b) = t.watch(&acme, None, live, json!({"seat": nonce(2)})).await.unwrap();
    // The third finds no seat (capacity 2): a 503 in the settings' words, nothing minted for it.
    let before = t.minted().len();
    let (st, full) = t.watch(&acme, None, live, json!({"seat": nonce(3)})).await.unwrap();
    assert_eq!((st, full["error"].as_str(), full["message"].as_str()), (503, Some("full"), Some("This broadcast is full. Try again in a moment.")));
    assert_eq!(t.minted().len(), before);
    // A live seat renews without a new seat; a stranger's id cannot renew; leaving frees the seat.
    let (st, _) = t.post(&acme, None, live, "watch/refresh", json!({"seat": nonce(1)})).await.unwrap();
    assert_eq!(st, 200);
    refused(t.post(&acme, None, live, "watch/refresh", json!({"seat": nonce(3)})).await, "not found");
    t.post(&acme, None, live, "watch/leave", json!({"seat": nonce(1)})).await.unwrap();
    refused(t.post(&acme, None, live, "watch/refresh", json!({"seat": nonce(1)})).await, "not found");
    let (st, _) = t.watch(&acme, None, live, json!({"seat": nonce(3)})).await.unwrap();
    assert_eq!(st, 200, "the freed seat is taken");
    refused(t.watch(&acme, None, live, json!({"seat": "short"})).await, "invalid");
    let b = t.get(&asha, live).await;
    assert_eq!((b["viewers_peak"].as_i64(), b["viewers_total"].as_i64()), (Some(2), Some(3)), "peak and distinct viewers come from the renewals");

    // A seat that is not renewed within a token's life and a minute and a half no longer counts.
    t.sql(&acme, "update live_seat set seen_at = now() - interval '20 minutes' where tenant_id = $1 and broadcast = $2", live).await;
    let (st, _) = t.watch(&acme, None, live, json!({"seat": nonce(4)})).await.unwrap();
    assert_eq!(st, 200, "stale seats make room");
    refused(t.post(&acme, None, live, "watch/refresh", json!({"seat": nonce(3)})).await, "not found");

    // Two viewers asking for the last seat together: one gets it, in every round.
    for round in 0..6u32 {
        let one = t.broadcast(&asha, json!({"title": "Small", "audience": "Public", "capacity": 1})).await;
        t.post(&acme, Some(&asha), one, "publish", Value::Null).await.unwrap();
        let site = k.hooks.site("live").unwrap();
        let go = |n: u32| {
            let (k, site, tenant) = (k.clone(), site.clone(), acme.id);
            tokio::spawn(async move {
                let req = SiteRequest {
                    tenant,
                    user: None,
                    method: "POST".into(),
                    path: format!("/broadcasts/{one}/watch"),
                    query: Map::new(),
                    headers: Map::new(),
                    body: json!({"seat": nonce(100 + round * 2 + n)}).to_string().into_bytes(),
                    client_ip: "203.0.113.9".into(),
                };
                site.handle(&k, req).await.unwrap().status
            })
        };
        let (x, y) = (go(0), go(1));
        let mut got = vec![x.await.unwrap(), y.await.unwrap()];
        got.sort();
        assert_eq!(got, vec![200, 503], "round {round}");
        assert_eq!(t.scalar::<i64>(&acme, "select count(*) from live_seat where tenant_id = $1 and broadcast = $2", one).await, 1);
        assert_eq!(t.get(&asha, one).await["viewers_peak"], 1);
    }

    // ───────────── the audience ladder, the record's permission, links ─────────────
    let mut portal = ravi.clone();
    portal.outside = true;
    let private = t.broadcast(&asha, json!({"title": "Asha's record"})).await;
    // A broadcast of its own, for Members: whoever may read it (its owner, the manager); not the others, not strangers.
    let members = t.broadcast(&asha, json!({"title": "Members only", "audience": "Members"})).await;
    t.post(&acme, Some(&asha), members, "publish", Value::Null).await.unwrap();
    let w = |who: Option<&Ctx>, n: u32| json!({"seat": nonce(200 + n), "who": who.map(|c| c.email.clone())});
    t.watch(&acme, Some(&asha), members, w(Some(&asha), 1)).await.unwrap();
    t.watch(&acme, Some(&mira), members, w(Some(&mira), 2)).await.unwrap();
    for (who, why) in
        [(Some(&ravi), "a member who may not read it"), (Some(&nobody), "no role"), (None, "a stranger"), (Some(&portal), "a portal person, below Portal")]
    {
        let m = refused(t.watch(&acme, who, members, w(who, 3)).await, "not found");
        assert_eq!(
            m,
            refused(t.watch(&acme, None, Uuid::now_v7(), w(None, 4)).await, "not found"),
            "{why}: the same answer as for a broadcast that is not there"
        );
    }
    // Portal: members as before, and portal people.
    k.update(&asha, "Broadcast", members, obj(json!({"audience": "Portal"})), None).await.unwrap();
    t.watch(&acme, Some(&portal), members, w(Some(&portal), 5)).await.unwrap();
    refused(t.watch(&acme, None, members, w(None, 6)).await, "not found");
    // Link: anyone holding a viewing link; the secret is shown once and only its hash is kept.
    k.update(&asha, "Broadcast", members, obj(json!({"audience": "Link"})), None).await.unwrap();
    let made = k.run_action(&asha, "Broadcast", members, "issue_viewer_link", json!({"label": "Press", "days": 3})).await.unwrap();
    let secret = made["secret"].as_str().unwrap().to_string();
    assert_eq!(secret.len(), 43);
    assert!(
        !t.scalar::<String>(&acme, "select token_hash from e_broadcast_link where tenant_id = $1 and broadcast = $2", members).await.contains(&secret),
        "only its hash is kept"
    );
    let link = uid(&obj(json!({"id": made["link"]})));
    t.watch(&acme, None, members, json!({"link": secret, "seat": nonce(300)})).await.unwrap();
    refused(t.watch(&acme, None, members, json!({"link": "x".repeat(43), "seat": nonce(301)})).await, "not found");
    refused(t.watch(&acme, None, members, json!({"link": &secret[..42], "seat": nonce(301)})).await, "not found");
    // On a public broadcast a link is beside the point: the open door needs none, and a wrong one does no harm.
    assert_eq!(t.watch(&acme, None, live, json!({"link": "x".repeat(43), "seat": nonce(302)})).await.unwrap().0, 200);
    t.post(&acme, None, members, "watch/refresh", json!({"link": &secret, "seat": nonce(300)})).await.unwrap();
    // Revoked: renewal stops at the next renewal, and so does a new seat.
    k.run_action(&asha, "BroadcastLink", link, "revoke", Value::Null).await.unwrap();
    refused(t.post(&acme, None, members, "watch/refresh", json!({"link": &secret, "seat": nonce(300)})).await, "not found");
    refused(t.watch(&acme, None, members, json!({"link": &secret, "seat": nonce(303)})).await, "not found");
    // Expired links stop too; a viewing link is no presenter's.
    let again = k.run_action(&asha, "Broadcast", members, "issue_viewer_link", json!({})).await.unwrap();
    let secret2 = again["secret"].as_str().unwrap().to_string();
    t.watch(&acme, None, members, json!({"link": &secret2, "seat": nonce(304)})).await.unwrap();
    t.sql(&acme, "update e_broadcast_link set expires_at = now() - interval '1 minute' where tenant_id = $1 and broadcast = $2", members).await;
    refused(t.post(&acme, None, members, "watch/refresh", json!({"link": &secret2, "seat": nonce(304)})).await, "not found");
    let again = k.run_action(&asha, "Broadcast", members, "issue_viewer_link", json!({})).await.unwrap();
    refused(t.post(&acme, None, members, "publish", json!({"link": again["secret"]})).await, "not found");
    refused(k.run_action(&asha, "Broadcast", members, "issue_viewer_link", json!({"days": 91})).await, "invalid");
    // The audience is read again at every renewal: tightening it stops a renewal that was fine a moment ago.
    t.watch(&acme, None, members, json!({"link": again["secret"], "seat": nonce(305)})).await.unwrap();
    k.update(&asha, "Broadcast", members, obj(json!({"audience": "Members"})), None).await.unwrap();
    refused(t.post(&acme, None, members, "watch/refresh", json!({"link": again["secret"], "seat": nonce(305)})).await, "not found");

    // The platform's permission on the attached record decides for signed-in people; nothing else about the record is read.
    let about = t
        .broadcast(&asha, json!({"title": "About a record", "audience": "Members", "reference_entity": "Broadcast", "reference_id": private.to_string()}))
        .await;
    t.post(&acme, Some(&asha), about, "publish", Value::Null).await.unwrap();
    t.watch(&acme, Some(&asha), about, json!({})).await.unwrap();
    let mira_seat = t.watch(&acme, Some(&mira), about, json!({})).await.unwrap();
    assert_eq!(mira_seat.0, 200);
    refused(t.watch(&acme, Some(&ravi), about, json!({})).await, "not found");
    // Mira is made an ordinary user: she can no longer read the record, so her next renewal is refused ("removed from the record").
    k.set_user_roles(&acme.admin, mira.user, &["Live User".to_string()]).await.unwrap();
    let mira_now = t.reload(&acme, &mira).await;
    refused(t.post(&acme, Some(&mira_now), about, "watch/refresh", json!({})).await, "not found");
    refused(t.watch(&acme, Some(&mira_now), about, json!({})).await, "not found");
    k.set_user_roles(&acme.admin, mira.user, &["Live Manager".to_string()]).await.unwrap();
    let mira = t.reload(&acme, &mira).await;
    // Public needs no record at all.
    k.update(&asha, "Broadcast", about, obj(json!({"audience": "Public"})), None).await.unwrap();
    t.watch(&acme, None, about, json!({"seat": nonce(400)})).await.unwrap();

    // ───────────── a presenter from outside: one start, then renewals, then the end ─────────────
    let guest = t.broadcast(&asha, json!({"title": "Guest talk", "audience": "Public", "recording": "On"})).await;
    refused(k.run_action(&asha, "Broadcast", guest, "issue_publisher_link", json!({})).await, "invalid");
    let pl = k
        .run_action(&asha, "Broadcast", guest, "issue_publisher_link", json!({"presenter_name": "Pat Guest", "presenter_email": "pat@outside.test"}))
        .await
        .unwrap();
    let psecret = pl["secret"].as_str().unwrap().to_string();
    refused(t.post(&acme, None, guest, "publish/refresh", json!({"link": &psecret})).await, "conflict");
    refused(t.post(&acme, None, guest, "publish", json!({"link": "y".repeat(43)})).await, "not found");
    let (_, started) = t.post(&acme, None, guest, "publish", json!({"link": &psecret})).await.unwrap();
    assert_eq!((started["status"].as_str(), started["recording"].as_bool()), (Some("Live"), Some(true)));
    let g = t.get(&asha, guest).await;
    assert_eq!((g["presenter_name"].as_str(), g["presenter_email"].as_str()), (Some("Pat Guest"), Some("pat@outside.test")));
    refused(t.post(&acme, None, guest, "publish", json!({"link": &psecret})).await, "conflict");
    t.post(&acme, None, guest, "publish/refresh", json!({"link": &psecret})).await.unwrap();
    let guest_seat = t.watch(&acme, None, guest, json!({"seat": nonce(500)})).await.unwrap();
    assert_eq!(guest_seat.0, 200);
    // Ending: nobody renews after it, a recorded broadcast gets its replay link, and the seats are gone.
    k.run_action(&asha, "Broadcast", guest, "revoke_links", Value::Null).await.unwrap();
    refused(t.post(&acme, None, guest, "publish/refresh", json!({"link": &psecret})).await, "not found");
    refused(t.post(&acme, None, guest, "end", json!({"link": &psecret})).await, "not found");
    refused(t.post(&acme, Some(&ravi), guest, "end", Value::Null).await, "not found");
    k.run_action(&asha, "Broadcast", guest, "issue_publisher_link", json!({"presenter_name": "Pat Guest"})).await.unwrap();
    let ended = t.post(&acme, Some(&mira), guest, "end", Value::Null).await.unwrap();
    assert_eq!(ended.1["status"], "Ended");
    refused(t.post(&acme, None, guest, "watch/refresh", json!({"seat": nonce(500)})).await, "conflict");
    refused(t.post(&acme, Some(&asha), guest, "publish/refresh", Value::Null).await, "conflict");
    refused(t.post(&acme, Some(&asha), guest, "publish", Value::Null).await, "conflict");
    let g = t.get(&asha, guest).await;
    assert_eq!(g["status"], "Ended");
    assert_eq!(g["replay_url"], format!("https://replays.example.com/live/{}/{}/master.m3u8", acme.id.simple(), guest.simple()).as_str());
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from live_seat where tenant_id = $1 and broadcast = $2", guest).await, 0);
    let (_, over) = t.watch(&acme, None, guest, json!({"seat": nonce(501)})).await.unwrap();
    assert_eq!(
        (over["status"].as_str(), over["text"].as_str(), over["replay_text"].as_str()),
        (Some("Ended"), Some("This broadcast has ended."), Some("Watch the replay"))
    );
    assert!(over["replay_url"].as_str().unwrap().ends_with("master.m3u8"));
    refused(k.run_action(&asha, "Broadcast", guest, "issue_viewer_link", json!({})).await, "invalid");

    // Cancelling: only what has not started; nothing after.
    let called = t.broadcast(&asha, json!({"title": "Called off", "audience": "Public"})).await;
    k.run_action(&asha, "Broadcast", called, "call_off", Value::Null).await.unwrap();
    refused(t.post(&acme, Some(&asha), called, "publish", Value::Null).await, "conflict");
    let (_, off) = t.watch(&acme, None, called, json!({"seat": nonce(600)})).await.unwrap();
    assert_eq!(off["status"], "Cancelled");
    refused(k.run_action(&asha, "Broadcast", live, "call_off", Value::Null).await, "invalid");

    // ───────────── the pages, their frames and the embed description ─────────────
    let framed =
        t.broadcast(&asha, json!({"title": "Framed", "audience": "Public", "frame_origins": "https://shop.example.com\nhttps://School.example.org"})).await;
    let page = t.raw(&acme, None, "GET", &format!("/watch/{framed}"), Value::Null, Value::Null).await.unwrap();
    let header = |r: &ferrum_kernel::SiteResponse, name: &str| r.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone()).unwrap_or_default();
    let csp = header(&page, "content-security-policy");
    assert!(csp.contains("frame-ancestors https://shop.example.com https://school.example.org"), "{csp}");
    assert!(csp.contains("connect-src 'self' https://relay.example.com wss://relay.example.com"), "{csp}");
    // With default settings the page references no origin but its own and the relay's: the component is the app's own file.
    assert!(csp.contains("script-src 'nonce-") && csp.contains("'wasm-unsafe-eval' 'self';"), "{csp}");
    let origins: Vec<&str> = csp.split_whitespace().filter(|w| w.starts_with("http") || w.starts_with("ws")).collect();
    assert!(origins.iter().all(|o| o.contains("relay.example.com") || o.contains("shop.example.com") || o.contains("school.example.org")), "{csp}");
    assert!(!csp.contains('*') && !csp.contains("esm.sh"), "{csp}");
    assert!(csp.contains("default-src 'none'") && !csp.contains("'unsafe-eval'"), "{csp}");
    assert_eq!((header(&page, "cache-control").as_str(), header(&page, "referrer-policy").as_str()), ("no-store", "no-referrer"));
    let html = String::from_utf8(page.body.clone()).unwrap();
    assert!(
        html.contains("\"moq-watch-0.6.6.js\"") && !html.contains("esm.sh") && !html.contains("key-1"),
        "the page names the bundled player and holds no secret"
    );
    let module = t.raw(&acme, None, "GET", "/module/moq-watch-0.6.6.js", Value::Null, Value::Null).await.unwrap();
    assert_eq!((module.status, module.content_type.as_str()), (200, "text/javascript; charset=utf-8"));
    assert!(header(&module, "cache-control").contains("immutable") && !module.body.is_empty());
    assert!(
        String::from_utf8(t.raw(&acme, None, "GET", "/module/moq-publish-0.5.6.js", Value::Null, Value::Null).await.unwrap().body).unwrap().contains("import")
    );
    for other in ["index.html", "words.json", "../index.html", "main-nothing.js"] {
        refused(t.raw(&acme, None, "GET", &format!("/module/{other}"), Value::Null, Value::Null).await, "not found");
    }
    // A workspace may serve the component from elsewhere: then that origin, and only it, is allowed to run script.
    k.update(&mira, "LiveSettings", set, obj(json!({"player_module_url": "https://cdn.example.net/moq/watch.js"})), None).await.unwrap();
    let own = t.raw(&acme, None, "GET", &format!("/watch/{live}"), Value::Null, Value::Null).await.unwrap();
    assert!(header(&own, "content-security-policy").contains("'wasm-unsafe-eval' https://cdn.example.net;"), "{}", header(&own, "content-security-policy"));
    k.update(&mira, "LiveSettings", set, obj(json!({"player_module_url": null})), None).await.unwrap();
    let plain = t.raw(&acme, None, "GET", &format!("/watch/{live}"), Value::Null, Value::Null).await.unwrap();
    assert!(header(&plain, "content-security-policy").contains("frame-ancestors 'none'"), "no frames unless the broadcast names them");
    let stranger = t.raw(&acme, None, "GET", &format!("/watch/{}", Uuid::now_v7()), Value::Null, Value::Null).await.unwrap();
    assert_eq!(stranger.status, 200, "the page is the same for any id");
    assert!(header(&stranger, "content-security-policy").contains("frame-ancestors 'none'"));
    let presenter_page = t.raw(&acme, None, "GET", &format!("/present/{live}"), Value::Null, Value::Null).await.unwrap();
    assert!(String::from_utf8(presenter_page.body).unwrap().contains("moq-publish-0.5.6.js"));
    refused(t.raw(&acme, None, "GET", "/watch/not-an-id", Value::Null, Value::Null).await, "not found");
    // The embed description another app uses: a broadcast about its record, only for those who may watch.
    let (_, listed) = t.call(&acme, Some(&asha), "GET", "/embed", json!({"entity": "Broadcast", "record": private.to_string()}), Value::Null).await.unwrap();
    assert_eq!(listed["broadcasts"].as_array().map(Vec::len), Some(1), "{listed}");
    let first = &listed["broadcasts"][0];
    assert_eq!(first["id"], about.to_string().as_str());
    assert!(
        first["iframe"].as_str().unwrap().contains(&format!("/api/site/acme/live/watch/{about}"))
            || first["iframe"].as_str().unwrap().contains(&format!("/live/watch/{about}")),
        "{first}"
    );
    k.update(&asha, "Broadcast", about, obj(json!({"audience": "Members"})), None).await.unwrap();
    let (_, none) = t.call(&acme, Some(&ravi), "GET", "/embed", json!({"entity": "Broadcast", "record": private.to_string()}), Value::Null).await.unwrap();
    assert_eq!(none["broadcasts"], json!([]), "a person who may not watch is not told it exists");
    refused(t.call(&acme, None, "GET", "/embed", json!({"entity": "Broadcast", "record": private.to_string()}), Value::Null).await, "not found");
    let (_, one) = t.call(&acme, None, "GET", &format!("/broadcasts/{live}/embed"), Value::Null, Value::Null).await.unwrap();
    assert!(one["iframe"].as_str().unwrap().starts_with("<iframe src=\"") && one["status"] == "Live", "{one}");
    refused(t.call(&acme, None, "GET", &format!("/broadcasts/{members}/embed"), Value::Null, Value::Null).await, "not found");

    // ───────────── upkeep: a broadcast nobody presents ends; old things go ─────────────
    let quiet = t.broadcast(&asha, json!({"title": "Quiet", "audience": "Public"})).await;
    t.post(&acme, Some(&asha), quiet, "publish", Value::Null).await.unwrap();
    t.watch(&acme, None, quiet, json!({"seat": nonce(700)})).await.unwrap();
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    assert_eq!(t.get(&asha, quiet).await["status"], "Live", "a presenter whose token is still good keeps it");
    t.sql(&acme, "update e_broadcast set last_publish_at = now() - interval '3 hours' where tenant_id = $1 and id = $2", quiet).await;
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    let q = t.get(&asha, quiet).await;
    assert_eq!(q["status"], "Ended");
    assert!(q["ended_at"].is_string());
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from live_seat where tenant_id = $1 and broadcast = $2", quiet).await, 0);
    // Retention: the replay link and the links of an old broadcast are cleared, and it says when.
    k.update(&asha, "Broadcast", guest, obj(json!({"replay_url": "https://replays.example.com/old.m3u8"})), None).await.unwrap();
    t.sql(&acme, "update e_broadcast set ended_at = now() - interval '40 days' where tenant_id = $1 and id = $2", guest).await;
    assert!(t.scalar::<i64>(&acme, "select count(*) from e_broadcast_link where tenant_id = $1 and broadcast = $2", guest).await > 0);
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    let g = t.get(&asha, guest).await;
    assert_eq!(g["replay_url"], Value::Null);
    assert!(g["replay_cleared_at"].is_string());
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from e_broadcast_link where tenant_id = $1 and broadcast = $2", guest).await, 0);
    let (_, kept) = t.watch(&acme, None, quiet, json!({"seat": nonce(701)})).await.unwrap();
    assert!(kept["replay_url"].is_null(), "inside its retention days the quiet one keeps what it has");

    // ───────────── a presenter's name is personal data, found by address and erased ─────────────
    assert_eq!(g["presenter_email"], "pat@outside.test");
    k.update(&asha, "Broadcast", guest, obj(json!({"replay_url": "https://replays.example.com/again.m3u8"})), None).await.unwrap();
    k.erase_personal_data(&acme.admin, "pat@outside.test", "asked to").await.unwrap();
    let g = t.get(&asha, guest).await;
    assert_eq!((g["presenter_name"].clone(), g["presenter_email"].clone()), (Value::Null, Value::Null), "{g:?}");
    assert_eq!(g["replay_url"], Value::Null, "the recording of an erased presenter is not offered: {g:?}");
    // …and a person named on a broadcast's presenters.
    let named = t.broadcast(&asha, json!({"title": "Named", "publishers": [{"email": "lee@elsewhere.test", "name": "Lee"}]})).await;
    k.erase_personal_data(&acme.admin, "lee@elsewhere.test", "asked to").await.unwrap();
    assert_eq!(t.get(&asha, named).await["publishers"], json!([]));

    // ───────────── reports ─────────────
    let source = ferrum_app_live::reports().remove(0);
    let names: Vec<String> = source.catalog().iter().map(|e| e["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(names, ["live_broadcasts", "live_audience", "live_audience_curve"]);
    let rows = source.run(&k, &mira, "live_broadcasts", &HashMap::new()).await.unwrap();
    let all = rows["rows"].as_array().unwrap();
    let webinar = all.iter().find(|r| r["title"] == "Webinar").expect("the webinar");
    assert_eq!((webinar["viewers_peak"].as_i64(), webinar["viewers_total"].as_i64()), (Some(2), Some(5)));
    assert_eq!(webinar["viewers_now"], 2, "two seats are live now: the others left or went stale");
    let by_status = source.run(&k, &mira, "live_audience", &HashMap::new()).await.unwrap();
    let ended_row = by_status["rows"].as_array().unwrap().iter().find(|r| r["status"] == "Ended").unwrap();
    assert!(ended_row["broadcasts"].as_i64().unwrap() >= 2);
    // The audience minute by minute: upkeep counts the live seats of each Live broadcast once a minute (a second round in
    // the same minute keeps the larger count); nobody types it. Its sum is the viewer-minutes.
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    let of = |id: Uuid| HashMap::from([("broadcast".to_string(), id.to_string())]);
    let curve = source.run(&k, &mira, "live_audience_curve", &of(live)).await.unwrap();
    let minutes = curve["rows"].as_array().unwrap();
    // (Two rounds may fall either side of a minute's turn: one or two minutes, each of the two live seats.)
    assert!((1..=2).contains(&minutes.len()) && minutes.iter().all(|m| m["viewers"] == 2), "{curve}");
    assert_eq!(curve["totals"]["viewer_minutes"].as_i64(), Some(2 * minutes.len() as i64));
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from live_audience_minute where tenant_id = $1 and broadcast = $2", live).await, minutes.len() as i64);
    // Someone who may not read the broadcast gets no minutes of it.
    assert!(source.run(&k, &ravi, "live_audience_curve", &of(live)).await.unwrap()["rows"].as_array().unwrap().is_empty());
    refused(source.run(&k, &mira, "live_audience_curve", &HashMap::new()).await, "invalid");
    // Someone who may read only their own broadcasts sees only theirs.
    let ravi_rows = source.run(&k, &ravi, "live_broadcasts", &HashMap::new()).await.unwrap();
    assert!(ravi_rows["rows"].as_array().unwrap().iter().all(|r| r["title"] != "Webinar"));

    // ───────────── a second workspace shares nothing ─────────────
    let other = t.tenant("globex").await;
    refused(t.watch(&other, None, live, json!({"seat": nonce(900)})).await, "not found");

    // ───────────── passes: the relay asks Live when a session opens and every half minute while it lasts ─────────────
    // A pass is one subject's, for one broadcast's path, one right, and a few minutes to connect. The session stops at the
    // relay's next question once the broadcast ended or its holder lost the right (Live is the relay's auth server).
    let ask = |event: &str, offer: &Value| json!({"id": "s1", "event": event, "path": offer["path"], "query": format!("jwt={}", offer["token"].as_str().unwrap()), "transport": "webtransport"});
    let granted = |r: &Result<(u16, Value), Error>| matches!(r, Ok((200, g)) if g["root"].is_string());
    let no = |r: &Result<(u16, Value), Error>| matches!(r, Err(Error::Forbidden(_)));
    let passes = t.broadcast(&asha, json!({"title": "Passes", "audience": "Link", "publishers": [{"email": "ravi@acme.test", "name": "Ravi"}]})).await;
    let ppath = format!("live/{}/{}", acme.id.simple(), passes.simple());
    let (_, by_ravi) = t.post(&acme, Some(&ravi), passes, "publish", Value::Null).await.unwrap();
    let tok = by_ravi["token"].as_str().unwrap().to_string();
    assert!(tok.ends_with(&format!(".u:{}", ravi.user)), "the pass names its person: {tok}");
    let last = t.minted().last().cloned().unwrap();
    assert_eq!((last.0.as_str(), last.1), (ppath.as_str(), Access::Publish));
    assert!((last.2 - (Utc::now() + Duration::minutes(3))).num_seconds().abs() < 30, "a few minutes to connect");
    let g = t.auth(&acme, ask("connect", &by_ravi)).await.unwrap().1;
    assert_eq!((g["root"].as_str(), g["publish"].clone(), g.get("subscribe"), g["revalidate"].as_i64()), (Some(ppath.as_str()), json!(["**"]), None, Some(30)));
    assert!((g["expires"].as_i64().unwrap() - (Utc::now() + Duration::minutes(60)).timestamp()).abs() < 30, "{g}");
    // Not another path, not under another key, not in another workspace, not once its minutes to connect are over…
    let kid = tok.split('.').nth(1).unwrap().to_string();
    let elsewhere = json!({"event": "connect", "path": path, "token": tok});
    assert!(no(&t.auth(&acme, elsewhere).await), "another broadcast's path");
    assert!(no(&t.auth(&acme, json!({"event": "connect", "path": ppath, "token": tok.replacen(&kid, "nokey", 1)})).await), "another key");
    assert!(no(&t.auth(&other, ask("connect", &by_ravi)).await), "another workspace");
    let past = (Utc::now() - Duration::minutes(1)).timestamp();
    let stale = format!("fake.{kid}.publish.{ppath}.{past}.u:{}", ravi.user);
    assert!(no(&t.auth(&acme, json!({"event": "connect", "path": ppath, "token": stale})).await), "an expired pass opens nothing");
    // …but a session it opened goes on while its holder keeps the right: the relay asks again long after the pass's minutes.
    assert!(granted(&t.auth(&acme, json!({"event": "revalidate", "path": ppath, "token": stale})).await));
    assert_eq!(t.auth(&acme, ask("end", &by_ravi)).await.unwrap(), (200, json!({})));
    // Viewers: a link's, a member's, a browser's (each pass names its seat as well), each only subscribing.
    let vl = k.run_action(&asha, "Broadcast", passes, "issue_viewer_link", json!({"label": "Lee"})).await.unwrap();
    let (_, by_link) = t.watch(&acme, None, passes, json!({"link": vl["secret"], "seat": nonce(700)})).await.unwrap();
    let (_, by_mira) = t.watch(&acme, Some(&mira), passes, json!({})).await.unwrap();
    k.update(&asha, "Broadcast", passes, obj(json!({"audience": "Public"})), None).await.unwrap();
    let (_, by_browser) = t.watch(&acme, None, passes, json!({"seat": nonce(701)})).await.unwrap();
    for (who, offer) in [("link", &by_link), ("member", &by_mira), ("browser", &by_browser)] {
        let (_, g) = t.auth(&acme, ask("connect", offer)).await.unwrap_or_else(|e| panic!("{who}: {e}"));
        assert_eq!((g["subscribe"].clone(), g.get("publish")), (json!(["**"]), None), "{who}");
    }
    let pl = k.run_action(&asha, "Broadcast", passes, "issue_publisher_link", json!({"presenter_name": "Pat"})).await.unwrap();
    let (_, by_guest) = t.post(&acme, None, passes, "publish", json!({"link": pl["secret"]})).await.unwrap();
    assert!(granted(&t.auth(&acme, ask("connect", &by_guest)).await));
    // Each loses the right; the relay's next question is refused. (Collected, so one run shows every rule that fails.)
    let mut wrong = vec![];
    k.run_action(&asha, "BroadcastLink", uid(&obj(json!({"id": vl["link"]}))), "revoke", Value::Null).await.unwrap();
    expect(&mut wrong, "a revoked viewing link's session stops", no(&t.auth(&acme, ask("revalidate", &by_link)).await));
    k.update(&asha, "Broadcast", passes, obj(json!({"audience": "Link"})), None).await.unwrap();
    expect(&mut wrong, "the open door closed: a browser's session stops", no(&t.auth(&acme, ask("revalidate", &by_browser)).await));
    k.set_user_roles(&acme.admin, mira.user, &["Live User".to_string()]).await.unwrap();
    expect(&mut wrong, "a person who may no longer read it stops watching", no(&t.auth(&acme, ask("revalidate", &by_mira)).await));
    k.set_user_roles(&acme.admin, mira.user, &["Live Manager".to_string()]).await.unwrap();
    expect(&mut wrong, "given the right back, the same session goes on", granted(&t.auth(&acme, ask("revalidate", &by_mira)).await));
    k.update(&asha, "Broadcast", passes, obj(json!({"audience": "Public"})), None).await.unwrap();
    expect(&mut wrong, "the door open again", granted(&t.auth(&acme, ask("revalidate", &by_browser)).await));
    t.post(&acme, None, passes, "watch/leave", json!({"seat": nonce(701)})).await.unwrap();
    expect(&mut wrong, "a seat given up holds no session", no(&t.auth(&acme, ask("revalidate", &by_browser)).await));
    k.update(&asha, "Broadcast", passes, obj(json!({"publishers": []})), None).await.unwrap();
    expect(&mut wrong, "a presenter taken off the broadcast stops publishing", no(&t.auth(&acme, ask("revalidate", &by_ravi)).await));
    k.run_action(&asha, "Broadcast", passes, "revoke_links", Value::Null).await.unwrap();
    expect(&mut wrong, "a revoked presenter link stops publishing", no(&t.auth(&acme, ask("revalidate", &by_guest)).await));
    t.post(&acme, Some(&asha), passes, "end", Value::Null).await.unwrap();
    expect(&mut wrong, "the broadcast ended: its viewers stop", no(&t.auth(&acme, ask("revalidate", &by_mira)).await));
    expect(&mut wrong, "the broadcast ended: nothing connects", no(&t.auth(&acme, ask("connect", &by_mira)).await));
    assert!(wrong.is_empty(), "rules that do not hold: {wrong:#?}");

    // ───────────── questions and polls: by the seat a viewer watches from ─────────────
    let qa = t.broadcast(&asha, json!({"title": "Ask me", "audience": "Public"})).await;
    let qpost = |route: &'static str, body: Value| t.post(&acme, None, qa, route, body);
    refused(qpost("ask", json!({"seat": nonce(820), "text": "Too early?"})).await, "conflict");
    t.post(&acme, Some(&asha), qa, "publish", Value::Null).await.unwrap();
    t.watch(&acme, None, qa, json!({"seat": nonce(820)})).await.unwrap();
    t.watch(&acme, None, qa, json!({"seat": nonce(821)})).await.unwrap();
    refused(qpost("ask", json!({"seat": nonce(829), "text": "No seat?"})).await, "forbidden");
    refused(qpost("ask", json!({"seat": nonce(820), "text": "  "})).await, "invalid");
    refused(qpost("ask", json!({"seat": nonce(820), "text": "x".repeat(501)})).await, "invalid");
    let (_, asked) = qpost("ask", json!({"seat": nonce(820), "text": "When is the next one?", "name": "Lee"})).await.unwrap();
    assert_eq!(asked["status"], "Waiting");
    refused(qpost("ask", json!({"seat": nonce(820), "text": "And again?"})).await, "conflict");
    let (_, other_q) = qpost("ask", json!({"seat": nonce(821), "text": "Is it recorded?"})).await.unwrap();
    let (_, feed) = qpost("feed", json!({"seat": nonce(821)})).await.unwrap();
    assert_eq!((feed["questions"].clone(), feed["poll"].clone()), (json!([]), Value::Null), "waiting questions reach nobody");
    // The presenter's side: the broadcast's actions; someone who may not change the broadcast cannot.
    let listed = k.run_action(&asha, "Broadcast", qa, "questions", Value::Null).await.unwrap();
    assert_eq!(listed["questions"].as_array().unwrap().len(), 2);
    assert!(k.run_action(&ravi, "Broadcast", qa, "moderate_question", json!({"question": asked["question"], "to": "Shown"})).await.is_err());
    k.run_action(&asha, "Broadcast", qa, "moderate_question", json!({"question": asked["question"], "to": "Shown"})).await.unwrap();
    k.run_action(&asha, "Broadcast", qa, "moderate_question", json!({"question": other_q["question"], "to": "Hidden"})).await.unwrap();
    refused(k.run_action(&asha, "Broadcast", qa, "moderate_question", json!({"question": other_q["question"], "to": "Shown"})).await, "invalid");
    let elsewhere = k.run_action(&asha, "Broadcast", passes, "moderate_question", json!({"question": asked["question"], "to": "Answered"})).await;
    assert!(elsewhere.is_err(), "a question is moderated on its own broadcast only");
    let (_, feed) = qpost("feed", json!({"seat": nonce(820)})).await.unwrap();
    assert_eq!(feed["questions"], json!([{"id": asked["question"], "text": "When is the next one?", "name": "Lee", "status": "Shown"}]));
    // A poll: each seat votes once; a second vote changes nothing; a closed poll takes none.
    refused(k.run_action(&asha, "Broadcast", qa, "open_poll", json!({"question": "Which?", "options": "Only one"})).await, "invalid");
    let poll = k.run_action(&asha, "Broadcast", qa, "open_poll", json!({"question": "Which day?", "options": "Monday\nFriday\n"})).await.unwrap();
    let pid = poll["poll"].clone();
    assert_eq!(qpost("vote", json!({"seat": nonce(820), "poll": pid, "option": 1})).await.unwrap().1["counted"], true);
    assert_eq!(qpost("vote", json!({"seat": nonce(820), "poll": pid, "option": 0})).await.unwrap().1["counted"], false);
    assert_eq!(qpost("vote", json!({"seat": nonce(821), "poll": pid, "option": 1})).await.unwrap().1["counted"], true);
    refused(qpost("vote", json!({"seat": nonce(821), "poll": pid, "option": 2})).await, "invalid");
    refused(qpost("vote", json!({"seat": nonce(829), "poll": pid, "option": 0})).await, "forbidden");
    let (_, feed) = qpost("feed", json!({"seat": nonce(820)})).await.unwrap();
    assert_eq!(
        (feed["poll"]["options"].clone(), feed["poll"]["counts"].clone(), feed["poll"]["mine"].clone()),
        (json!(["Monday", "Friday"]), json!([0, 2]), json!(1))
    );
    assert_eq!(
        t.scalar::<i64>(&acme, "select count(*) from live_poll_vote where tenant_id = $1 and poll = $2", Uuid::parse_str(pid.as_str().unwrap()).unwrap()).await,
        2
    );
    k.run_action(&asha, "Broadcast", qa, "close_poll", json!({"poll": pid})).await.unwrap();
    refused(qpost("vote", json!({"seat": nonce(821), "poll": pid, "option": 0})).await, "conflict");
    // Ended: nobody asks; past the retention days what viewers wrote and voted goes.
    t.post(&acme, Some(&asha), qa, "end", Value::Null).await.unwrap();
    refused(qpost("ask", json!({"seat": nonce(820), "text": "Still there?"})).await, "conflict");
    t.sql(&acme, "update e_broadcast set ended_at = now() - interval '40 days' where tenant_id = $1 and id = $2", qa).await;
    ferrum_app_live::maintenance(&k, acme.id).await.unwrap();
    for table in ["e_broadcast_question", "e_broadcast_poll"] {
        let n: i64 = t.scalar(&acme, &format!("select count(*) from {table} where tenant_id = $1 and broadcast = $2"), qa).await;
        assert_eq!(n, 0, "{table}");
    }

    // ───────────── presenting and watching as operations, for signed-in people and their agents ─────────────
    let gated = t.broadcast(&asha, json!({"title": "Through the gate", "audience": "Members"})).await;
    let op = |name: &str, key: &str| {
        ferrum_kernel::capability::Invocation::new(format!("live.broadcast.{name}"), json!({"id": gated.to_string(), "params": {}})).key(key)
    };
    assert!(k.invoke(&ravi, op("present", "gate-1")).await.is_err(), "not his broadcast");
    assert!(k.invoke(&mira, op("present", "gate-2")).await.is_err(), "a manager who is not a presenter does not present");
    let started = k.invoke(&asha, op("present", "gate-3")).await.unwrap();
    assert_eq!(started.result["status"], "Live");
    assert!(started.result["token"].as_str().unwrap().ends_with(&format!(".u:{}", asha.user)), "{:?}", started.result);
    assert_eq!(t.get(&asha, gated).await["status"], "Live");
    // The pass is given once: a repeat under the same key does not hand it out again.
    let again = k.invoke(&asha, op("present", "gate-3")).await.unwrap();
    assert!(again.repeated && again.result.get("token").is_none() && again.answered_once.is_some(), "{again:?}");
    let seat = k.invoke(&mira, op("watch", "gate-4")).await.unwrap();
    assert!(seat.result["token"].as_str().unwrap().contains(&format!(".u:{}:", mira.user)), "{:?}", seat.result);
    assert!(t.auth(&acme, json!({"event": "connect", "path": seat.result["path"], "token": seat.result["token"]})).await.is_ok());
    assert!(k.invoke(&nobody, op("watch", "gate-5")).await.is_err(), "no right to read it, no seat");
    k.run_action(&asha, "Broadcast", gated, "end", Value::Null).await.unwrap();
    let over = k.invoke(&mira, op("watch", "gate-6")).await.unwrap();
    assert_eq!((over.result["status"].as_str(), over.result.get("token")), (Some("Ended"), None));

    // ───────────── keys in the vault (src/keys.rs) ─────────────
    let scope = ferrum_kernel::vault::Scope::Workspace(acme.id);
    // The relay's key has one home: Live's secret in the vault, the key as it was given (what the relay's key directory
    // holds). Set Signing Key replaces it there.
    let held = live_vault.describe(&k, scope, "relay-signing-key").await.unwrap().expect("the relay's key");
    assert!(held.rule.reveal && held.version == 1, "the relay holds the same secret: {held:?}");
    assert_eq!(&*live_vault.reveal(&k, scope, "relay-signing-key").await.unwrap(), b"key-1");
    // Sessions opened before a new key keep going: the relay's next questions about them are answered under the key
    // before it. A pass signed with that key opens nothing new.
    let turning = t.broadcast(&asha, json!({"title": "Turning", "audience": "Public"})).await;
    let (_, old_publish) = t.post(&acme, Some(&asha), turning, "publish", Value::Null).await.unwrap();
    let (_, old_watch) = t.watch(&acme, None, turning, json!({"seat": nonce(950)})).await.unwrap();
    k.run_action(&mira, "LiveSettings", set, "set_signing_key", json!({"key": "key-2"})).await.unwrap();
    for offer in [&old_publish, &old_watch] {
        let again = json!({"event": "revalidate", "path": offer["path"], "token": offer["token"]});
        assert!(matches!(t.auth(&acme, again).await, Ok((200, _))), "{offer}");
        let open = json!({"event": "connect", "path": offer["path"], "token": offer["token"]});
        refused(t.auth(&acme, open).await, "forbidden");
    }
    assert_eq!(live_vault.describe(&k, scope, "relay-signing-key").await.unwrap().map(|d| d.version), Some(2));
    assert_eq!(k.get(&mira, "LiveSettings", set, false).await.unwrap()["signing_key_id"], "key-2");
    // A new version of Live's own key leaves the relay's key as it was: tokens are signed with it as before.
    assert_eq!(k.rotate_owner_key(scope, "live").await.expect("a new version"), 2);
    let signed = t.broadcast(&asha, json!({"title": "Signed", "audience": "Public"})).await;
    let (_, started) = t.post(&acme, Some(&asha), signed, "publish", Value::Null).await.unwrap();
    assert!(started["token"].as_str().unwrap().starts_with("fake.key-2."), "{started}");
    assert_eq!(&*live_vault.reveal(&k, scope, "relay-signing-key").await.unwrap(), b"key-2");

    // ───────────── a replica whose vault is closed: Live refuses access, plainly ─────────────
    // (Last: registering Live again gives the process that kernel's handle.)
    let db = Db::connect(DbConfig { url: db_url, max_connections: 8, ..Default::default() }).await.expect("connect");
    let (hooks, _) = registered(t.relay.clone());
    let closed = Kernel::boot(db, catalog(), hooks, kernel_settings(), None).await.expect("it starts with the vault closed");
    let t = T { k: closed, relay: t.relay.clone() };
    for e in [
        refused(t.watch(&acme, None, signed, json!({"seat": nonce(960)})).await, "unavailable"),
        refused(t.post(&acme, Some(&asha), signed, "publish/refresh", Value::Null).await, "unavailable"),
    ] {
        assert_eq!(e, "Live cannot give access right now: its keys are unavailable");
    }
}
