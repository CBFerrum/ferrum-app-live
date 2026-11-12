//! The routes' logic: starting and renewing a presenter's access, taking, renewing and leaving a viewer's seat,
//! ending a broadcast. Every route re-decides rights from scratch (the person's permissions now, the link as it
//! stands now, the broadcast's state now), so losing a right ends renewal at the next renewal and not before.

use crate::access::{self, Viewer};
use crate::relay::{Access, Relay};
use crate::{broadcast, doc_id, links, s, seats, settings, ts};
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

async fn offer(relay: &dyn Relay, k: &Kernel, tx: &mut Tx, set: &settings::Settings, tenant: Uuid, id: Uuid, access: Access) -> Result<Value> {
    let (Some(url), Some(key)) = (set.relay_url(), settings::signing_key(k, tx, relay, tenant).await?) else {
        return Err(Error::Unavailable("live video is not set up in this workspace".into()));
    };
    let minutes = if access == Access::Watch { set.watch_minutes() } else { set.publish_minutes() };
    let expires = crate::now() + Duration::minutes(minutes);
    let path = crate::path_of(&set.prefix(), tenant, id);
    let token = relay.token(&key, &path, access, expires)?;
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
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let doc = read(k, &sys, &mut tx, id).await?;
    let Some((viewer, ident)) = viewer(k, &mut tx, &set, &doc, tenant, id, who).await? else { return Err(gone()) };
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
    let seat = seats::key(&mut tx, tenant, id, seat_kind(&viewer), &ident).await?;
    let win = window(&set);
    if seats::renew(&mut tx, tenant, id, &seat, win).await? {
        let out = offer(relay, k, &mut tx, &set, tenant, id, Access::Watch).await?;
        tx.commit().await?;
        return Ok(Outcome::Offer(out));
    }
    if renew {
        return Err(gone());
    }
    // A new seat: one viewer at a time through here, so the last seat goes to one of two who ask for it together.
    let doc = broadcast::lock(k, &sys, &mut tx, id).await?;
    if s(&doc, "status") != Some("Live") {
        return Ok(Outcome::State(state(&set, &doc)));
    }
    match seats::take(&mut tx, tenant, id, &seat, win, set.capacity(&doc)).await? {
        seats::Taken::Full => Ok(Outcome::Full(set.text("text_full"))),
        taken => {
            if let seats::Taken::New { now, first } = taken {
                sqlx::query("update e_broadcast set viewers_peak = greatest(coalesce(viewers_peak, 0), $3), viewers_total = coalesce(viewers_total, 0) + $4 where tenant_id = $1 and id = $2")
                    .bind(tenant)
                    .bind(id)
                    .bind(now)
                    .bind(i64::from(first))
                    .execute(&mut *tx)
                    .await?;
            }
            let out = offer(relay, k, &mut tx, &set, tenant, id, Access::Watch).await?;
            tx.commit().await?;
            Ok(Outcome::Offer(out))
        }
    }
}

/// A viewer gives their seat up.
pub async fn leave(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<()> {
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let doc = read(k, &sys, &mut tx, id).await?;
    // Whoever the seat is of may give it up, as they are known now; a person who lost the right has nothing to ask for.
    let Some((viewer, ident)) = viewer(k, &mut tx, &set, &doc, tenant, id, who).await? else { return Err(gone()) };
    let seat = seats::key(&mut tx, tenant, id, seat_kind(&viewer), &ident).await?;
    seats::leave(&mut tx, tenant, id, &seat).await?;
    tx.commit().await?;
    Ok(())
}

/// A presenter's side. `renew`: only while Live (a presenter link renews after the one start it has).
pub async fn present(k: &Kernel, relay: &dyn Relay, tenant: Uuid, id: Uuid, who: &Caller<'_>, renew: bool) -> Result<Value> {
    let sys = system(k, tenant).await?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let set = settings::load(k, &sys, &mut tx).await?;
    let doc = broadcast::lock(k, &sys, &mut tx, id).await?;
    let (name, email, link) = match (who.ctx, who.link) {
        (Some(ctx), _) if access::may_present(ctx, &doc) => {
            let name = if ctx.full_name.trim().is_empty() { ctx.email.clone() } else { ctx.full_name.clone() };
            (name, Some(ctx.email.clone()), None)
        }
        (_, Some(secret)) => {
            let Some(link) = links::find(&mut tx, tenant, id, "Presenter", secret).await? else { return Err(gone()) };
            (link.presenter_name.clone().unwrap_or_default(), link.presenter_email.clone(), Some(link))
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
                links::take(&mut tx, tenant, link.id).await?;
            }
            (false, true) => return Err(Error::Conflict("this link has started its broadcast already: renew instead".into())),
            (true, false) => return Err(Error::Conflict("this link has not started the broadcast".into())),
            (true, true) => {}
        }
    }
    broadcast::go_live(k, &sys, &mut tx, &doc, (&name, email.as_deref())).await?;
    sqlx::query("update e_broadcast set last_publish_at = now() where tenant_id = $1 and id = $2").bind(tenant).bind(id).execute(&mut *tx).await?;
    let mut out = offer(relay, k, &mut tx, &set, tenant, id, Access::Publish).await?;
    out["recording"] = json!(set.recording(&doc));
    out["status"] = json!("Live");
    tx.commit().await?;
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
