//! Upkeep, every minute: ends broadcasts nobody presents (a presenter's token has run out and nobody renewed it,
//! so the relay has already cut the stream), forgets seats nobody renews, and clears the replay link and the links of
//! broadcasts that ended more than the retention days ago. Each broadcast is handled under its row lock in a transaction of its
//! own, so what happens, happens once however often this runs.

use crate::{PACKAGE, broadcast, doc_id, s, settings, ts};
use ferrum_kernel::{Ctx, Kernel, Result};
use serde_json::json;
use uuid::Uuid;

pub async fn run(k: &Kernel) -> Result<()> {
    let mut tx = k.db.system_tx().await?;
    let tenants: Vec<Uuid> = sqlx::query_scalar("select id from tenant where status = 'active' order by id").fetch_all(&mut *tx).await?;
    tx.commit().await?;
    let mut first_error = None;
    for tenant in tenants {
        let schema = match k.registry.schema(tenant).await {
            Ok(s) => s,
            Err(e) => {
                first_error.get_or_insert(e);
                continue;
            }
        };
        if !schema.packages.iter().any(|p| p == PACKAGE) {
            continue;
        }
        let ctx = Ctx::system(tenant, schema);
        for (step, outcome) in [("silent", end_silent(k, &ctx).await), ("seats", forget_seats(k, &ctx).await), ("retention", retain(k, &ctx).await)] {
            match outcome {
                Ok(0) => {}
                Ok(n) => tracing::info!(%tenant, step, n, "live maintenance"),
                Err(e) => {
                    tracing::warn!(%tenant, step, "live maintenance failed: {e}");
                    first_error.get_or_insert(e);
                }
            }
        }
    }
    first_error.map_or(Ok(()), Err)
}

/// Live broadcasts whose presenter's last token ran out a minute ago: ended.
async fn end_silent(k: &Kernel, ctx: &Ctx) -> Result<usize> {
    let mut tx = k.db.tenant_tx(ctx.tenant).await?;
    let minutes = settings::load(k, ctx, &mut tx).await?.publish_minutes();
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "select id from e_broadcast where tenant_id = $1 and status = 'Live' and coalesce(last_publish_at, started_at, created_at) < now() - make_interval(mins => $2::int) - interval '1 minute' limit 100",
    )
    .bind(ctx.tenant)
    .bind(minutes as i32)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    let mut n = 0;
    for id in ids {
        let mut tx = k.db.tenant_tx(ctx.tenant).await?;
        let doc = broadcast::lock(k, ctx, &mut tx, id).await?;
        // Re-checked under the lock: a presenter may have renewed since.
        let still: bool = sqlx::query_scalar(
            "select coalesce(last_publish_at, started_at, created_at) < now() - make_interval(mins => $3::int) - interval '1 minute' from e_broadcast where tenant_id = $1 and id = $2",
        )
        .bind(ctx.tenant)
        .bind(id)
        .bind(minutes as i32)
        .fetch_one(&mut *tx)
        .await?;
        if s(&doc, "status") == Some("Live") && still {
            broadcast::finish(k, ctx, &mut tx, &doc, "Ended").await?;
            n += 1;
        }
        tx.commit().await?;
    }
    Ok(n)
}

/// Seats not renewed for a day, whatever the window: nothing keeps them.
async fn forget_seats(k: &Kernel, ctx: &Ctx) -> Result<usize> {
    let mut tx = k.db.tenant_tx(ctx.tenant).await?;
    let n = sqlx::query("delete from live_seat where tenant_id = $1 and seen_at < now() - interval '1 day'")
        .bind(ctx.tenant)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    tx.commit().await?;
    Ok(n as usize)
}

/// Ended or cancelled broadcasts past the retention days: their links go, and their replay link is cleared (what it
/// pointed to is for whoever runs the recorder to delete: `replay_cleared_at` says when, for an automation to hear).
async fn retain(k: &Kernel, ctx: &Ctx) -> Result<usize> {
    let mut tx = k.db.tenant_tx(ctx.tenant).await?;
    let days = settings::load(k, ctx, &mut tx).await?.number("retention_days").max(1);
    let old: Vec<Uuid> = sqlx::query_scalar(
        "select id from e_broadcast where tenant_id = $1 and status in ('Ended', 'Cancelled') and ended_at < now() - make_interval(days => $2::int) \
         and (replay_url is not null or exists (select 1 from e_broadcast_link l where l.tenant_id = e_broadcast.tenant_id and l.broadcast = e_broadcast.id)) limit 100",
    )
    .bind(ctx.tenant)
    .bind(days as i32)
    .fetch_all(&mut *tx)
    .await?;
    let mut n = 0;
    for id in old {
        let doc = k.get_tx(ctx, &mut tx, "Broadcast", id, true).await?;
        sqlx::query("delete from e_broadcast_link where tenant_id = $1 and broadcast = $2").bind(ctx.tenant).bind(id).execute(&mut *tx).await?;
        if s(&doc, "replay_url").is_some() {
            let patch = json!({"replay_url": null, "replay_cleared_at": ts(crate::now())});
            k.update_tx(ctx, &mut tx, "Broadcast", doc_id(&doc)?, patch.as_object().cloned().unwrap_or_default(), None).await?;
        }
        n += 1;
    }
    tx.commit().await?;
    Ok(n)
}
