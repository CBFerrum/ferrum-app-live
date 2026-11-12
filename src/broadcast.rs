//! The broadcast record: checks on what people write, and the app's own moves of its status. Status is read only
//! to everyone; only the functions here (a presenter starting, ending, the upkeep) change it, in the transaction
//! that holds the broadcast's row.

use crate::{PACKAGE, doc_id, links, s, seats, settings, ts};
use async_trait::async_trait;
use ferrum_kernel::{Ctx, Doc, DocHook, Error, FieldError, HookCtx, Kernel, Result, Tx};
use serde_json::{Value, json};
use std::collections::HashSet;
use uuid::Uuid;

/// The origins listed in a broadcast's `frame_origins` (one per line), each checked as the platform checks them.
pub fn origins(text: &str) -> std::result::Result<Vec<String>, String> {
    let mut out = Vec::new();
    for line in text.split_whitespace() {
        out.push(ferrum_meta::published::frame_origin(line).ok_or_else(|| format!("{line} is not an origin (https://host, no path, no wildcard)"))?);
    }
    if out.len() > 10 {
        return Err("at most ten origins".into());
    }
    Ok(out)
}

pub struct BroadcastHook;

#[async_trait]
impl DocHook for BroadcastHook {
    async fn before_validate(&self, hc: &mut HookCtx<'_>, doc: &mut Doc) -> Result<()> {
        if !doc.contains_key("owner_email") && !hc.ctx.is_system {
            doc.insert("owner_email".into(), json!(hc.ctx.email));
        }
        Ok(())
    }

    async fn validate(&self, hc: &mut HookCtx<'_>, doc: &Doc) -> Result<()> {
        let mut errors = Vec::new();
        match (s(doc, "reference_entity"), s(doc, "reference_id")) {
            (None, None) => {}
            (Some(entity), Some(id)) => {
                if hc.ctx.schema.entity(entity).is_none() {
                    errors.push(FieldError::new("reference_entity", format!("there is no record type {entity}")));
                }
                if id.parse::<Uuid>().is_err() {
                    errors.push(FieldError::new("reference_id", "the id of the record"));
                }
            }
            _ => errors.push(FieldError::new("reference_id", "name both the record type and its id, or neither")),
        }
        if let (Some(from), Some(to)) = (crate::time(doc, "planned_start"), crate::time(doc, "planned_end"))
            && to < from
        {
            errors.push(FieldError::new("planned_end", "after the start"));
        }
        if let Some(text) = s(doc, "frame_origins")
            && let Err(m) = origins(text)
        {
            errors.push(FieldError::new("frame_origins", m));
        }
        let mut seen = HashSet::new();
        for (i, p) in crate::rows(doc, "publishers").iter().enumerate() {
            if let Some(e) = s(p, "email")
                && !seen.insert(e.trim().to_lowercase())
            {
                errors.push(FieldError::new("email", "named twice").in_row("publishers", i));
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(Error::Validation(errors)) }
    }

    async fn before_delete(&self, _hc: &mut HookCtx<'_>, doc: &Doc) -> Result<()> {
        if s(doc, "status") == Some("Live") {
            return Err(Error::invalid("end the broadcast before deleting it"));
        }
        Ok(())
    }

    async fn action(&self, hc: &mut HookCtx<'_>, name: &str, doc: &Doc, params: &Value) -> Result<Option<Value>> {
        let ctx = hc.ctx;
        let sys = Ctx::system(ctx.tenant, ctx.schema.clone());
        Ok(Some(match name {
            "end" => finish(hc.kernel, &sys, hc.tx, doc, "Ended").await?,
            "call_off" => finish(hc.kernel, &sys, hc.tx, doc, "Cancelled").await?,
            "issue_viewer_link" => links::issue(hc.kernel, ctx, hc.tx, doc, "Viewer", params).await?,
            "issue_publisher_link" => links::issue(hc.kernel, ctx, hc.tx, doc, "Presenter", params).await?,
            "revoke_links" => json!({"revoked": links::revoke_all(hc.tx, ctx.tenant, doc_id(doc)?).await?}),
            _ => return Ok(None),
        }))
    }
}

/// Locks a broadcast's row, then reads it in a statement of its own (a locking read alone shows the record as it was
/// before the wait for the lock).
pub async fn lock(k: &Kernel, sys: &Ctx, tx: &mut Tx, id: Uuid) -> Result<Doc> {
    let found: Option<Uuid> = sqlx::query_scalar("select id from e_broadcast where tenant_id = $1 and id = $2 for update")
        .bind(sys.tenant)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?;
    found.ok_or_else(|| Error::NotFound("Broadcast".into()))?;
    k.get_tx(sys, tx, "Broadcast", id, false).await
}

/// Scheduled becomes Live: a presenter started it. Starting a broadcast that is Live is the same broadcast.
pub async fn go_live(k: &Kernel, sys: &Ctx, tx: &mut Tx, doc: &Doc, presenter: (&str, Option<&str>)) -> Result<()> {
    if s(doc, "status") == Some("Live") {
        return Ok(());
    }
    let id = doc_id(doc)?;
    let patch = json!({"status": "Live", "started_at": ts(crate::now()), "presenter_name": presenter.0, "presenter_email": presenter.1});
    k.update_tx(sys, tx, "Broadcast", id, patch.as_object().cloned().unwrap_or_default(), None).await?;
    let payload = json!({"broadcast": id, "title": s(doc, "title"), "reference_entity": s(doc, "reference_entity"), "reference_id": s(doc, "reference_id")});
    ferrum_kernel::outbox::enqueue(tx, sys.tenant, &format!("{PACKAGE}.broadcast_started"), Some("Broadcast"), Some(id), payload).await
}

/// Live or Scheduled becomes Ended or Cancelled: seats are forgotten at once, and an ended broadcast that was recorded
/// gets its replay link from the settings' replay address.
pub async fn finish(k: &Kernel, sys: &Ctx, tx: &mut Tx, doc: &Doc, status: &str) -> Result<Value> {
    let id = doc_id(doc)?;
    let current = s(doc, "status").unwrap_or_default();
    if (status == "Ended" && current != "Live") || (status == "Cancelled" && current != "Scheduled") {
        return Err(Error::invalid(format!("a broadcast that is {current} cannot become {status}")));
    }
    let set = settings::load(k, sys, tx).await?;
    let mut patch = json!({"status": status, "ended_at": ts(crate::now())});
    if status == "Ended" && set.recording(doc) && s(doc, "replay_url").is_none() {
        let base = set.text("replay_base_url");
        if !base.trim().is_empty() {
            patch["replay_url"] = json!(format!("{}/{}/master.m3u8", base.trim().trim_end_matches('/'), crate::path_of(&set.prefix(), sys.tenant, id)));
        }
    }
    k.update_tx(sys, tx, "Broadcast", id, patch.as_object().cloned().unwrap_or_default(), None).await?;
    seats::clear(tx, sys.tenant, id).await?;
    let payload = json!({"broadcast": id, "title": s(doc, "title"), "status": status, "reference_entity": s(doc, "reference_entity"), "reference_id": s(doc, "reference_id")});
    ferrum_kernel::outbox::enqueue(tx, sys.tenant, &format!("{PACKAGE}.broadcast_ended"), Some("Broadcast"), Some(id), payload).await?;
    Ok(json!({"status": status}))
}
