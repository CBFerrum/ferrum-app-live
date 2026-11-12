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

fn nonce(n: u32) -> String {
    format!("browser-{n:04}-abcdefghijkl")
}

#[test]
fn live_end_to_end() {
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().thread_stack_size(16 << 20).build().unwrap();
    rt.block_on(async { tokio::spawn(scenario()).await.unwrap() });
}

async fn scenario() {
    let url = std::env::var("FERRUM_LIVE_TEST_DATABASE_URL").unwrap_or_else(|_| "postgres://ferrum:ferrum@localhost:5432/ferrum_live_test".into());
    let db = Db::connect(DbConfig { url, max_connections: 24, ..Default::default() }).await.expect("connect");
    sqlx::raw_sql("drop schema if exists public cascade; create schema public;").execute(&db.pool).await.expect("reset");
    let mut packages = ferrum_domain::packages().expect("platform packages");
    packages.extend(ferrum_app_live::packages().expect("app packages"));
    let catalog = Catalog::from_packages(packages).expect("catalog");
    let relay = Arc::new(FakeRelay::new());
    let mut hooks = HookRegistry::default();
    ferrum_domain::register(&mut hooks);
    ferrum_app_live::register_with(&mut hooks, relay.clone());
    let settings =
        KernelSettings { secret_key: Some(ferrum_kernel::secret::SecretKey::new([9u8; 32])), ctx_ttl: std::time::Duration::ZERO, ..Default::default() };
    let k = Kernel::boot(db, catalog, hooks, settings, None).await.expect("boot");
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

    // ───────────── settings: the key is checked, kept sealed and never shown ─────────────
    let set = uid(&k
        .insert(&mira, "LiveSettings", obj(json!({"relay_url": "https://relay.example.com/", "replay_base_url": "https://replays.example.com"})))
        .await
        .unwrap());
    refused(k.run_action(&mira, "LiveSettings", set, "set_signing_key", json!({"key": "has spaces"})).await, "invalid");
    refused(k.run_action(&asha, "LiveSettings", set, "set_signing_key", json!({"key": "key-1"})).await, "forbidden");
    k.run_action(&mira, "LiveSettings", set, "set_signing_key", json!({"key": "key-1"})).await.unwrap();
    let shown = k.get(&mira, "LiveSettings", set, false).await.unwrap();
    assert_eq!(shown["signing_key_id"], "key-1");
    assert_ne!(shown["signing_key"], "key-1", "the key is not returned: {shown:?}");
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
    assert!((minted[0].2 - (Utc::now() + Duration::minutes(60))).num_seconds().abs() < 30);
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
    assert!((watching[0].2 - (Utc::now() + Duration::minutes(10))).num_seconds().abs() < 30, "short lived");
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
    assert!(csp.contains("script-src 'nonce-") && csp.contains("https://esm.sh"), "{csp}");
    assert!(csp.contains("default-src 'none'") && !csp.contains("'unsafe-eval'"), "{csp}");
    assert_eq!((header(&page, "cache-control").as_str(), header(&page, "referrer-policy").as_str()), ("no-store", "no-referrer"));
    let html = String::from_utf8(page.body.clone()).unwrap();
    assert!(html.contains("@moq/watch@0.6.6/element") && !html.contains("key-1"), "the page names the pinned player and holds no secret");
    let plain = t.raw(&acme, None, "GET", &format!("/watch/{live}"), Value::Null, Value::Null).await.unwrap();
    assert!(header(&plain, "content-security-policy").contains("frame-ancestors 'none'"), "no frames unless the broadcast names them");
    let stranger = t.raw(&acme, None, "GET", &format!("/watch/{}", Uuid::now_v7()), Value::Null, Value::Null).await.unwrap();
    assert_eq!(stranger.status, 200, "the page is the same for any id");
    assert!(header(&stranger, "content-security-policy").contains("frame-ancestors 'none'"));
    let presenter_page = t.raw(&acme, None, "GET", &format!("/present/{live}"), Value::Null, Value::Null).await.unwrap();
    assert!(String::from_utf8(presenter_page.body).unwrap().contains("@moq/publish@0.5.6/element"));
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
    ferrum_app_live::maintenance(&k).await.unwrap();
    assert_eq!(t.get(&asha, quiet).await["status"], "Live", "a presenter whose token is still good keeps it");
    t.sql(&acme, "update e_broadcast set last_publish_at = now() - interval '3 hours' where tenant_id = $1 and id = $2", quiet).await;
    ferrum_app_live::maintenance(&k).await.unwrap();
    ferrum_app_live::maintenance(&k).await.unwrap();
    let q = t.get(&asha, quiet).await;
    assert_eq!(q["status"], "Ended");
    assert!(q["ended_at"].is_string());
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from live_seat where tenant_id = $1 and broadcast = $2", quiet).await, 0);
    // Retention: the replay link and the links of an old broadcast are cleared, and it says when.
    k.update(&asha, "Broadcast", guest, obj(json!({"replay_url": "https://replays.example.com/old.m3u8"})), None).await.unwrap();
    t.sql(&acme, "update e_broadcast set ended_at = now() - interval '40 days' where tenant_id = $1 and id = $2", guest).await;
    assert!(t.scalar::<i64>(&acme, "select count(*) from e_broadcast_link where tenant_id = $1 and broadcast = $2", guest).await > 0);
    ferrum_app_live::maintenance(&k).await.unwrap();
    let g = t.get(&asha, guest).await;
    assert_eq!(g["replay_url"], Value::Null);
    assert!(g["replay_cleared_at"].is_string());
    assert_eq!(t.scalar::<i64>(&acme, "select count(*) from e_broadcast_link where tenant_id = $1 and broadcast = $2", guest).await, 0);
    let (_, kept) = t.watch(&acme, None, quiet, json!({"seat": nonce(701)})).await.unwrap();
    assert!(kept["replay_url"].is_null(), "inside its retention days the quiet one keeps what it has");

    // ───────────── a presenter's name is personal data, found by address and erased ─────────────
    assert_eq!(g["presenter_email"], "pat@outside.test");
    k.erase_personal_data(&acme.admin, "pat@outside.test", "asked to").await.unwrap();
    let g = t.get(&asha, guest).await;
    assert_eq!((g["presenter_name"].clone(), g["presenter_email"].clone()), (Value::Null, Value::Null), "{g:?}");
    // …and a person named on a broadcast's presenters.
    let named = t.broadcast(&asha, json!({"title": "Named", "publishers": [{"email": "lee@elsewhere.test", "name": "Lee"}]})).await;
    k.erase_personal_data(&acme.admin, "lee@elsewhere.test", "asked to").await.unwrap();
    assert_eq!(t.get(&asha, named).await["publishers"], json!([]));

    // ───────────── reports ─────────────
    let source = ferrum_app_live::reports().remove(0);
    let names: Vec<String> = source.catalog().iter().map(|e| e["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(names, ["live_broadcasts", "live_audience"]);
    let rows = source.run(&k, &mira, "live_broadcasts", &HashMap::new()).await.unwrap();
    let all = rows["rows"].as_array().unwrap();
    let webinar = all.iter().find(|r| r["title"] == "Webinar").expect("the webinar");
    assert_eq!((webinar["viewers_peak"].as_i64(), webinar["viewers_total"].as_i64()), (Some(2), Some(5)));
    assert_eq!(webinar["viewers_now"], 2, "two seats are live now: the others left or went stale");
    let by_status = source.run(&k, &mira, "live_audience", &HashMap::new()).await.unwrap();
    let ended_row = by_status["rows"].as_array().unwrap().iter().find(|r| r["status"] == "Ended").unwrap();
    assert!(ended_row["broadcasts"].as_i64().unwrap() >= 2);
    // Someone who may read only their own broadcasts sees only theirs.
    let ravi_rows = source.run(&k, &ravi, "live_broadcasts", &HashMap::new()).await.unwrap();
    assert!(ravi_rows["rows"].as_array().unwrap().iter().all(|r| r["title"] != "Webinar"));

    // ───────────── a second workspace shares nothing ─────────────
    let other = t.tenant("globex").await;
    refused(t.watch(&other, None, live, json!({"seat": nonce(900)})).await, "not found");
}
