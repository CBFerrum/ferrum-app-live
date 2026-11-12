//! Who may present and who may watch. The rules are the platform's wherever it already decides: a
//! broadcast about a record is watched by those who can read that record, a broadcast of its own by those
//! who can read it; Live adds only the audience ladder (Members, Portal, Link, Public: each includes the ones
//! before it), the links, and the presenters a broadcast names.

use crate::s;
use ferrum_kernel::{Action, Ctx, Doc, Error, Kernel, Result, Tx};
use uuid::Uuid;

/// What a seat is kept under: who the viewer is, as far as the app needs to tell them apart.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Viewer {
    Person(Uuid),
    Link(Uuid),
    Browser,
}

/// The record a broadcast is about, when it names one.
pub fn reference(broadcast: &Doc) -> Option<(&str, Uuid)> {
    Some((s(broadcast, "reference_entity")?, s(broadcast, "reference_id")?.parse().ok()?))
}

/// Whether `ctx` may read this record, as the platform says. A refusal of any kind is "no"; a fault is a fault.
pub async fn can_read(k: &Kernel, ctx: &Ctx, tx: &mut Tx, entity: &str, id: Uuid) -> Result<bool> {
    if ctx.schema.entity(entity).is_none() {
        return Ok(false);
    }
    match k.get_tx(ctx, tx, entity, id, false).await {
        Ok(_) => Ok(true),
        Err(Error::NotFound(_) | Error::Forbidden(_) | Error::Invalid(_) | Error::Validation(_)) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Whether a signed-in person (a member or a portal person) may watch: by the platform's permissions on the record
/// or the broadcast, and for a portal person only when the audience reaches them.
pub async fn person_may_watch(k: &Kernel, ctx: &Ctx, tx: &mut Tx, broadcast: &Doc, level: u8, id: Uuid) -> Result<bool> {
    if level >= 3 {
        return Ok(true);
    }
    if ctx.outside && level < 1 {
        return Ok(false);
    }
    match reference(broadcast) {
        Some((entity, record)) => can_read(k, ctx, tx, entity, record).await,
        // A broadcast of its own: a member reads it as the platform lets them; a portal person has no record to read, the audience decides.
        None if ctx.outside => Ok(true),
        None => can_read(k, ctx, tx, "Broadcast", id).await,
    }
}

/// Whether a person may start (and renew, and end) this broadcast as a presenter: its owner, a person it names, or a holder of
/// the role it names. A portal person never.
pub fn may_present(ctx: &Ctx, broadcast: &Doc) -> bool {
    if ctx.outside || ctx.is_system {
        return false;
    }
    let me = ctx.email.trim().to_lowercase();
    let owner = s(broadcast, "owner_email").is_some_and(|o| o.trim().to_lowercase() == me);
    let named = crate::rows(broadcast, "publishers").iter().any(|p| s(p, "email").is_some_and(|e| e.trim().to_lowercase() == me));
    let role = s(broadcast, "publisher_role").is_some_and(|r| ctx.roles.iter().any(|x| x == r));
    owner || named || role
}

/// Whether a person may end it: a presenter, or someone who may change broadcasts and can see this one.
pub async fn may_end(k: &Kernel, ctx: &Ctx, tx: &mut Tx, broadcast: &Doc, id: Uuid) -> Result<bool> {
    if may_present(ctx, broadcast) {
        return Ok(true);
    }
    if ctx.outside || ctx.require("Broadcast", Action::Write).is_err() {
        return Ok(false);
    }
    can_read(k, ctx, tx, "Broadcast", id).await
}
