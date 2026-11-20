//! The routes' logic: starting and renewing a presenter's access, taking, renewing and leaving a viewer's seat,
//! ending a broadcast. Every route re-decides rights from scratch (the person's permissions now, the link as it
//! stands now, the broadcast's state now), so losing a right ends renewal at the next renewal and not before.

use crate::access::{self, Viewer};
use crate::relay::{Access, Event, Pass, Relay};
use crate::{broadcast, doc_id, keys, links, s, seats, settings, ts};
use chrono::Duration;
use ferrum_kernel::{Ctx, Doc, Error, Kernel, Result, Tx};
use serde_json::{Value, json};
use uuid::Uuid;

/// Who is asking: a signed-in person (a member or a portal person), a link's secret, a browser's random id.
#[derive(Default)]
pub struct Caller<'a> {
    pub ctx: Option<&'a Ctx>,
    pub link: Option<&'a str>,
    pub nonce: Option<&'a str>,
}

pub enum Outcome {
    /// Access: where to connect and with what.
    Offer(Value),
    /// Not yet or no longer: the broadcast's state, in words, and a replay when there is one.
    State(Value),
    Full(String),
}

/// How long a pass lets its holder connect: a few minutes. The session it opens lasts as long as the settings' token
/// minutes say, and Live is asked again every [`REVALIDATE`] seconds while it lasts.
const PASS_MINUTES: i64 = 3;
/// How often the relay asks Live again whether a session may go on.
pub const REVALIDATE: i64 = 30;

/// Seats stay live this long after their last renewal: a token's life and a minute and a half for a late one.
fn window(set: &settings::Settings) -> i64 {
    set.watch_minutes() * 60 + 90
}

fn nonce_ok(n: &str) -> bool {
    (16..=64).contains(&n.len()) && n.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

fn gone() -> Error {
    Error::NotFound("broadcast".into())
}

async fn system(k: &Kernel, tenant: Uuid) -> Result<Ctx> {
    Ok(Ctx::system(tenant, k.registry.schema(tenant).await?))
}

async fn read(k: &Kernel, sys: &Ctx, tx: &mut Tx, id: Uuid) -> Result<Doc> {
    k.get_tx(sys, tx, "Broadcast", id, false).await.map_err(|e| if matches!(e, Error::NotFound(_)) { gone() } else { e })
}

/// What a person who may watch is told while there is nothing to watch.
fn state(set: &settings::Settings, doc: &Doc) -> Value {
    let status = s(doc, "status").unwrap_or_default();
    let text = match status {
        "Scheduled" => s(doc, "waiting_text").map(str::to_string).unwrap_or_else(|| set.text("text_waiting")),
        "Cancelled" => set.text("text_cancelled"),
        _ => set.text("text_ended"),
    };
    let replay = (status == "Ended").then(|| s(doc, "replay_url")).flatten();
    json!({"status": status, "title": s(doc, "title"), "text": text, "planned_start": s(doc, "planned_start"), "replay_url": replay, "replay_text": replay.map(|_| set.text("text_replay"))})
}

/// Access to the broadcast's path for `subject`, signed with the relay's key (`key`, as [`keys::relay_key`] gave it): a
/// pass to connect within a few minutes, to a session that lasts until `expires_at` unless Live refuses it before.
fn offer(relay: &dyn Relay, set: &settings::Settings, tenant: Uuid, id: Uuid, access: Access, key: Option<&[u8]>, subject: String) -> Result<Value> {
    let (Some(url), Some(key)) = (set.relay_url(), key) else {
        return Err(Error::Unavailable("live video is not set up in this workspace".into()));
    };
    let key = settings::relay_key(relay, key)?;
    let minutes = if access == Access::Watch { set.watch_minutes() } else { set.publish_minutes() };
    let now = crate::now();
    let expires = now + Duration::minutes(minutes);
    let path = crate::path_of(&set.prefix(), tenant, id);
    let pass = Pass { root: path.clone(), access, subject, expires: now + Duration::minutes(PASS_MINUTES) };
    let token = relay.token(&key, &pass)?;
    let el = relay.element(access);
    Ok(json!({
        "relay": url, "path": path, "name": set.text("stream_name"), "token": token, "url": relay.connect_url(&url, &path, &token),
        "element": {"tag": el.tag, "url_attr": el.url_attr, "name_attr": el.name_attr, "child": el.child, "attrs": el.attrs},
        "expires_at": ts(expires), "refresh_in": minutes * 60 * 2 / 3,
    }))
}

/// Who a watcher is, if they may watch: the platform's rights first, then a viewing link, then the open door.
async fn viewer(k: &Kernel, tx: &mut Tx, set: &settings::Settings, doc: &Doc, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<Option<(Viewer, String)>> {
    let level = set.audience(doc);
    let nonce = who.nonce.filter(|n| nonce_ok(n)).unwrap_or_default().to_string();
    if let Some(ctx) = who.ctx
        && access::person_may_watch(k, ctx, tx, doc, level, id).await?
    {
        return Ok(Some((Viewer::Person(ctx.user), ctx.user.to_string())));
    }
    if let (Some(secret), true) = (who.link, level >= 2)
        && let Some(link) = links::find(tx, tenant, id, "Viewer", secret).await?
    {
        return Ok(Some((Viewer::Link(link.id), format!("{}/{nonce}", link.id))));
    }
    Ok((level >= 3).then_some((Viewer::Browser, nonce)))
}

fn seat_kind(v: &Viewer) -> &'static str {
    match v {
        Viewer::Person(_) => "person",
        Viewer::Link(_) => "link",
        Viewer::Browser => "browser",
    }
}

/// `renew`: keep a seat that is live (and refuse when it is not); otherwise take one, if there is one to take.
pub async fn watch(k: &Kernel, relay: &dyn Relay, tenant: Uuid, id: Uuid, who: &Caller<'_>, renew: bool) -> Result<Outcome> {
    let mut tx = k.db.tenant_tx(tenant).await?;
    let out = watch_in(k, relay, &mut tx, tenant, id, who, renew).await?;
    tx.commit().await?;
    Ok(out)
}

/// The same in the caller's transaction (the `watch` action's).
pub async fn watch_in(k: &Kernel, relay: &dyn Relay, tx: &mut Tx, tenant: Uuid, id: Uuid, who: &Caller<'_>, renew: bool) -> Result<Outcome> {
    // Live's keys: the vault answers on a connection of its own.
    let seat_key = keys::current(k, tenant, keys::SEATS).await?;
    let relay_key = keys::relay_key(k, tenant).await?;
    let sys = system(k, tenant).await?;
    let set = settings::load(k, &sys, tx).await?;
    let doc = read(k, &sys, tx, id).await?;
    let Some((viewer, ident)) = viewer(k, tx, &set, &doc, tenant, id, who).await? else { return Err(gone()) };
    if !matches!(viewer, Viewer::Person(_)) && !who.nonce.is_some_and(nonce_ok) {
        return Err(Error::field("seat", "a random id of 16 to 64 letters and digits, made by the page"));
    }
    let status = s(&doc, "status").unwrap_or_default().to_string();
    if status != "Live" {
        if renew && matches!(status.as_str(), "Ended" | "Cancelled") {
            return Err(Error::Conflict(format!("the broadcast is {}", status.to_lowercase())));
        }
        return Ok(Outcome::State(state(&set, &doc)));
    }
    let seat = seats::key(seat_key.bytes(), &seats::message(id, seat_kind(&viewer), &ident));
    let subject = match &viewer {
        Viewer::Person(u) => format!("u:{u}:{seat}"),
        Viewer::Link(l) => format!("l:{l}:{seat}"),
        Viewer::Browser => format!("b:{seat}"),
    };
    let win = window(&set);
    if seats::renew(tx, tenant, id, &seat, win).await? {
        let out = offer(relay, &set, tenant, id, Access::Watch, relay_key.as_deref().map(|k| k.as_slice()), subject)?;
        return Ok(Outcome::Offer(out));
    }
    if renew {
        return Err(gone());
    }
    // A new seat: one viewer at a time through here, so the last seat goes to one of two who ask for it together.
    let doc = broadcast::lock(k, &sys, tx, id).await?;
    if s(&doc, "status") != Some("Live") {
        return Ok(Outcome::State(state(&set, &doc)));
    }
    match seats::take(tx, tenant, id, &seat, win, set.capacity(&doc)).await? {
        seats::Taken::Full => Ok(Outcome::Full(set.text("text_full"))),
        taken => {
            if let seats::Taken::New { now, first } = taken {
                sqlx::query("update e_broadcast set viewers_peak = greatest(coalesce(viewers_peak, 0), $3), viewers_total = coalesce(viewers_total, 0) + $4 where tenant_id = $1 and id = $2")
                    .bind(tenant)
                    .bind(id)
                    .bind(now)
                    .bind(i64::from(first))
                    .execute(&mut **tx)
                    .await?;
            }
            let out = offer(relay, &set, tenant, id, Access::Watch, relay_key.as_deref().map(|k| k.as_slice()), subject)?;
            Ok(Outcome::Offer(out))
        }
    }
}

/// A viewer gives their seat up.
pub async fn leave(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<()> {
    let seat_key = keys::current(k, tenant, keys::SEATS).await?;
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let doc = read(k, &sys, &mut tx, id).await?;
    // Whoever the seat is of may give it up, as they are known now; a person who lost the right has nothing to ask for.
    let Some((viewer, ident)) = viewer(k, &mut tx, &set, &doc, tenant, id, who).await? else { return Err(gone()) };
    let seat = seats::key(seat_key.bytes(), &seats::message(id, seat_kind(&viewer), &ident));
    seats::leave(&mut tx, tenant, id, &seat).await?;
    tx.commit().await?;
    Ok(())
}

/// A presenter's side. `renew`: only while Live (a presenter link renews after the one start it has).
pub async fn present(k: &Kernel, relay: &dyn Relay, tenant: Uuid, id: Uuid, who: &Caller<'_>, renew: bool) -> Result<Value> {
    let mut tx = k.db.tenant_tx(tenant).await?;
    let out = present_in(k, relay, &mut tx, tenant, id, who, renew).await?;
    tx.commit().await?;
    Ok(out)
}

/// The same in the caller's transaction (the `present` action's).
pub async fn present_in(k: &Kernel, relay: &dyn Relay, tx: &mut Tx, tenant: Uuid, id: Uuid, who: &Caller<'_>, renew: bool) -> Result<Value> {
    // The relay's key (the vault answers on a connection of its own).
    let relay_key = keys::relay_key(k, tenant).await?;
    let sys = system(k, tenant).await?;
    let set = settings::load(k, &sys, tx).await?;
    let doc = broadcast::lock(k, &sys, tx, id).await?;
    let (name, email, link, subject) = match (who.ctx, who.link) {
        (Some(ctx), _) if access::may_present(ctx, &doc) => {
            let name = if ctx.full_name.trim().is_empty() { ctx.email.clone() } else { ctx.full_name.clone() };
            (name, Some(ctx.email.clone()), None, format!("u:{}", ctx.user))
        }
        (_, Some(secret)) => {
            let Some(link) = links::find(tx, tenant, id, "Presenter", secret).await? else { return Err(gone()) };
            let subject = format!("l:{}", link.id);
            (link.presenter_name.clone().unwrap_or_default(), link.presenter_email.clone(), Some(link), subject)
        }
        _ => return Err(gone()),
    };
    let status = s(&doc, "status").unwrap_or_default().to_string();
    if !matches!(status.as_str(), "Scheduled" | "Live") || (renew && status != "Live") {
        return Err(Error::Conflict(format!("the broadcast is {}", status.to_lowercase())));
    }
    if let Some(link) = &link {
        // One start a link: the first takes it; after that it renews while Live, and starts nothing.
        match (renew, link.used_at.is_some()) {
            (false, false) => {
                links::take(tx, tenant, link.id).await?;
            }
            (false, true) => return Err(Error::Conflict("this link has started its broadcast already: renew instead".into())),
            (true, false) => return Err(Error::Conflict("this link has not started the broadcast".into())),
            (true, true) => {}
        }
    }
    broadcast::go_live(k, &sys, tx, &doc, (&name, email.as_deref())).await?;
    sqlx::query("update e_broadcast set last_publish_at = now() where tenant_id = $1 and id = $2").bind(tenant).bind(id).execute(&mut **tx).await?;
    let mut out = offer(relay, &set, tenant, id, Access::Publish, relay_key.as_deref().map(|k| k.as_slice()), subject)?;
    out["recording"] = json!(set.recording(&doc));
    out["status"] = json!("Live");
    Ok(out)
}

/// A presenter (or someone who runs broadcasts) ends it.
pub async fn end(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<Value> {
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let doc = broadcast::lock(k, &sys, &mut tx, id).await?;
    let allowed = match (who.ctx, who.link) {
        (Some(ctx), _) if access::may_end(k, ctx, &mut tx, &doc, id).await? => true,
        (_, Some(secret)) => links::find(&mut tx, tenant, id, "Presenter", secret).await?.is_some(),
        _ => false,
    };
    if !allowed {
        return Err(gone());
    }
    let out = broadcast::finish(k, &sys, &mut tx, &doc, "Ended").await?;
    tx.commit().await?;
    Ok(out)
}

/// What the embed description says of a broadcast the caller may watch, and the page's own first answer.
pub async fn describe(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<Value> {
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let doc = read(k, &sys, &mut tx, id).await?;
    if viewer(k, &mut tx, &set, &doc, tenant, id, who).await?.is_none() {
        return Err(gone());
    }
    let mut out = state(&set, &doc);
    out["id"] = json!(doc_id(&doc)?);
    Ok(out)
}

/// The relay asks whether a session may open (`connect`) or go on (`revalidate`, every [`REVALIDATE`] seconds): the
/// pass must be one Live signed for this workspace's broadcast at the path dialed, unexpired when it connects, and its
/// subject must hold the right now, as the routes decide it. Anything else is refused, in the same words.
pub async fn admit(k: &Kernel, relay: &dyn Relay, tenant: Uuid, body: &Value) -> Result<Value> {
    let refused = || Error::Forbidden("no access".into());
    let asked = relay.asked(body)?;
    if asked.event == Event::End {
        return Ok(json!({}));
    }
    let Some(material) = keys::relay_key(k, tenant).await? else { return Err(refused()) };
    let mut pass = relay.read(&settings::relay_key(relay, &material)?, &asked.token);
    // A new signing key drops nobody: a session admitted under the key before it is asked about under that key. Nothing
    // opens under it (a key replaced because it leaked mints no new session).
    if pass.is_err()
        && asked.event == Event::Revalidate
        && let Some(old) = keys::previous_relay_key(k, tenant).await?
        && let Ok(old) = settings::relay_key(relay, &old)
    {
        pass = relay.read(&old, &asked.token);
    }
    let pass = pass.map_err(|_| refused())?;
    if asked.event == Event::Connect && pass.expires <= crate::now() {
        return Err(refused());
    }
    if asked.path != pass.root && !asked.path.starts_with(&format!("{}/", pass.root)) {
        return Err(refused());
    }
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let id: Uuid = pass.root.rsplit('/').next().and_then(|i| i.parse().ok()).ok_or_else(refused)?;
    if crate::path_of(&set.prefix(), tenant, id) != pass.root {
        return Err(refused());
    }
    let doc = match k.get_tx(&sys, &mut tx, "Broadcast", id, false).await {
        Ok(doc) => doc,
        Err(Error::NotFound(_)) => return Err(refused()),
        Err(e) => return Err(e),
    };
    if s(&doc, "status") != Some("Live") || !holds(k, &mut tx, &set, &doc, tenant, id, &pass).await? {
        return Err(refused());
    }
    let minutes = if pass.access == Access::Watch { set.watch_minutes() } else { set.publish_minutes() };
    let out = relay.grant(&pass, crate::now() + Duration::minutes(minutes), REVALIDATE);
    tx.commit().await?;
    Ok(out)
}

/// The person `user` as the server would load them for a request now; none when they cannot be (gone, disabled, a fault:
/// a session is refused rather than kept on a guess).
async fn person(k: &Kernel, tenant: Uuid, user: Uuid) -> Option<Ctx> {
    k.load_ctx(tenant, user, None, "live-relay".into()).await.ok()
}

/// Whether a pass's subject (`u:{person}`, `l:{link}`, and for a viewer `:{seat}`; `b:{seat}` for a browser) holds its
/// right now, as the routes decide it, and for a viewer whether the seat it was given for is still live.
// ponytail: a member viewer's rights are loaded afresh at every revalidation (one context load per viewer every
// REVALIDATE seconds); cache them for the length of one revalidation if large member audiences make that matter.
async fn holds(k: &Kernel, tx: &mut Tx, set: &settings::Settings, doc: &Doc, tenant: Uuid, id: Uuid, pass: &Pass) -> Result<bool> {
    let mut parts = pass.subject.splitn(3, ':');
    let (kind, who, seat) = (parts.next(), parts.next(), parts.next());
    let named = who.and_then(|w| w.parse::<Uuid>().ok());
    let level = set.audience(doc);
    if pass.access == Access::Publish {
        return Ok(match (kind, named, seat) {
            (Some("u"), Some(user), None) => person(k, tenant, user).await.is_some_and(|ctx| access::may_present(&ctx, doc)),
            (Some("l"), Some(link), None) => links::by_id(tx, tenant, id, "Presenter", link).await?.is_some_and(|l| l.used_at.is_some()),
            _ => false,
        });
    }
    let (right, seat) = match (kind, named) {
        (Some("b"), _) => (level >= 3, who),
        (Some("u"), Some(user)) => match person(k, tenant, user).await {
            Some(ctx) => (access::person_may_watch(k, &ctx, tx, doc, level, id).await?, seat),
            None => (false, None),
        },
        (Some("l"), Some(link)) => (level >= 2 && links::by_id(tx, tenant, id, "Viewer", link).await?.is_some(), seat),
        _ => (false, None),
    };
    Ok(match (right, seat) {
        (true, Some(seat)) => seats::held(tx, tenant, id, seat, window(set)).await?,
        _ => false,
    })
}
