//! Seats: the app's own count of who is watching, from the viewers' token renewals. A seat is a keyed hash
//! of who (a person, a link and a browser's random id, or a browser's random id alone), so the relay is
//! told nothing about anyone and the app keeps no name or address for a viewer. A seat is live while renewals
//! keep it fresh; a viewer who leaves without saying so frees theirs when their last token would have run out.
//!
//! Taking a seat is atomic: the broadcast's row is locked, then the live seats are counted and one is
//! added, in one transaction, so two viewers cannot both take the last one. Renewing a live seat takes no lock.

use ferrum_kernel::{Result, Tx};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

#[derive(Debug, PartialEq, Eq)]
pub enum Taken {
    /// The seat was live and is renewed.
    Kept,
    /// A seat was added (the number of live seats now).
    New {
        now: i64,
        first: bool,
    },
    Full,
}

/// The workspace's key for seat hashes, made on first use.
async fn secret(tx: &mut Tx, tenant: Uuid) -> Result<Vec<u8>> {
    sqlx::query("insert into live_secret (tenant_id, secret) values ($1, $2) on conflict do nothing")
        .bind(tenant)
        .bind(rand::random::<[u8; 32]>().to_vec())
        .execute(&mut **tx)
        .await?;
    Ok(sqlx::query_scalar("select secret from live_secret where tenant_id = $1").bind(tenant).fetch_one(&mut **tx).await?)
}

/// The seat of `who` (`person`, `link` or `browser`, and what names them) on one broadcast.
pub async fn key(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, kind: &str, who: &str) -> Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(&secret(tx, tenant).await?).expect("any key length");
    for part in [broadcast.as_bytes().as_slice(), kind.as_bytes(), who.as_bytes()] {
        mac.update(&(part.len() as u32).to_be_bytes());
        mac.update(part);
    }
    Ok(hex::encode(mac.finalize().into_bytes()))
}

/// Seats live within `window` seconds.
pub async fn live(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, window: i64) -> Result<i64> {
    Ok(sqlx::query_scalar("select count(*) from live_seat where tenant_id = $1 and broadcast = $2 and seen_at > now() - make_interval(secs => $3::float8)")
        .bind(tenant)
        .bind(broadcast)
        .bind(window as f64)
        .fetch_one(&mut **tx)
        .await?)
}

/// Renews a live seat, if `seat` is one.
pub async fn renew(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, seat: &str, window: i64) -> Result<bool> {
    let n = sqlx::query(
        "update live_seat set seen_at = now() where tenant_id = $1 and broadcast = $2 and seat = $3 and seen_at > now() - make_interval(secs => $4::float8)",
    )
    .bind(tenant)
    .bind(broadcast)
    .bind(seat)
    .bind(window as f64)
    .execute(&mut **tx)
    .await?
    .rows_affected();
    Ok(n == 1)
}

/// Takes a seat for `seat`: renews it when live, else adds one if fewer than `capacity` are live (0: no limit).
/// The caller has locked the broadcast's row.
pub async fn take(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, seat: &str, window: i64, capacity: i64) -> Result<Taken> {
    if renew(tx, tenant, broadcast, seat, window).await? {
        return Ok(Taken::Kept);
    }
    let now = live(tx, tenant, broadcast, window).await?;
    if capacity > 0 && now >= capacity {
        return Ok(Taken::Full);
    }
    let first: bool = sqlx::query_scalar(
        "insert into live_seat (tenant_id, broadcast, seat) values ($1, $2, $3) \
         on conflict (tenant_id, broadcast, seat) do update set seen_at = now(), taken_at = now() returning (xmax = 0)",
    )
    .bind(tenant)
    .bind(broadcast)
    .bind(seat)
    .fetch_one(&mut **tx)
    .await?;
    Ok(Taken::New { now: now + 1, first })
}

pub async fn leave(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, seat: &str) -> Result<()> {
    sqlx::query("delete from live_seat where tenant_id = $1 and broadcast = $2 and seat = $3")
        .bind(tenant)
        .bind(broadcast)
        .bind(seat)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn clear(tx: &mut Tx, tenant: Uuid, broadcast: Uuid) -> Result<u64> {
    Ok(sqlx::query("delete from live_seat where tenant_id = $1 and broadcast = $2").bind(tenant).bind(broadcast).execute(&mut **tx).await?.rows_affected())
}
