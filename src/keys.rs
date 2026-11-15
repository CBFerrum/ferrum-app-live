//! Live's keys, from its own key in the vault (Ferrum docs/operations.md, "The vault").
//!
//! * Seats are keyed hashes of who watches (`seats.rs`), under a key derived from Live's own key for that purpose
//!   (`seat-hashes`), made when needed and kept nowhere. Until 0.2 the key was kept unsealed in `live_secret`. It hashes
//!   nothing any more, except, through the vault, the seat of a viewer who was watching across the upgrade, so that they
//!   keep their seat: it moves into the vault, sealed, as Live's secret `old-seat-key`, and is used so until two hours
//!   after it stopped (`live_secret.retired_at`: a viewer's token lives an hour at most, and an hour more covers the
//!   upgrade rolling out). It moves the first time it is needed, or at Live's next upkeep, once: under its row's lock,
//!   taken without waiting. A sandbox never takes it. The previous build reads `live_secret` still; its rows go in the
//!   release after this one.
//! * The relay's signing key has one home: Live's secret `relay-signing-key` in the workspace, the JWK exactly as `moq
//!   auth generate` wrote it, which is what the relay's key directory holds as `{kid}.jwk` (docs/deploy.md). Its rule lets
//!   it out (`reveal`), because the relay must hold the same secret: Live reads it for each token, and so will whatever
//!   writes the relay's key files from the vault. Until 0.2 it was kept in Live Settings' sealed field `signing_key`,
//!   which the build before this one reads: this one still writes the field for it, and upkeep keeps the two equal (the
//!   field wins, see [`move_relay`]); the release after this one stops writing it.

use chrono::{DateTime, Duration, Utc};
use ferrum_kernel::vault::{Derived, New, Rule, Scope, Vault, Zeroizing};
use ferrum_kernel::{Error, Kernel, Result};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::RwLock;
use uuid::Uuid;

/// The seats' hashes.
pub const SEATS: &str = "seat-hashes";
/// The seats' key until 0.2, sealed in the vault while a seat it made can still be live.
const OLD: &str = "old-seat-key";
/// The relay's signing key.
pub const RELAY: &str = "relay-signing-key";
/// How long after it stopped hashing the old key still finds a seat it made: a viewer's token lives an hour at most
/// (and a minute and a half), and an hour more covers an upgrade rolling out.
fn old_for() -> Duration {
    Duration::hours(2)
}

/// Live's handle on the vault, from its registration.
static VAULT: RwLock<Option<Vault>> = RwLock::new(None);

/// Keeps the handle the registration gave Live.
// ponytail: the last registration's handle serves the whole process (`ferrum start` sets the server up twice and serves
// with the second); keep it in what is registered if one process ever serves two kernels at once.
pub(crate) fn remember(v: Vault) {
    *VAULT.write().unwrap_or_else(|e| e.into_inner()) = Some(v);
}

fn handle() -> Result<Vault> {
    VAULT.read().unwrap_or_else(|e| e.into_inner()).clone().ok_or_else(|| Error::Unavailable("Live was registered without its vault handle".into()))
}

/// What a person or a caller is told when the vault cannot be used; why goes to the log.
fn unavailable(e: Error) -> Error {
    match e {
        Error::Unavailable(why) | Error::Retryable(why) => {
            // The start's log and the doctor say why the vault is closed; this is the same reason, for each use.
            tracing::debug!("Live's keys: {why}");
            Error::Unavailable("Live cannot give access right now: its keys are unavailable".into())
        }
        e => e,
    }
}

/// The key for `purpose` in the workspace now, with the version it came from.
pub(crate) async fn current(k: &Kernel, tenant: Uuid, purpose: &str) -> Result<Derived> {
    handle()?.derive(k, Scope::Workspace(tenant), purpose).await.map_err(unavailable)
}

/// HMAC-SHA256 of `message` under `key`.
pub(crate) fn mac(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut m = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes keys of any length");
    m.update(message);
    m.finalize().into_bytes().to_vec()
}

/// `message`'s hash under the old seat key, while a seat it made can still be live: moved into the vault first, if it
/// has not been yet. None after that, without one, or in a sandbox.
pub(crate) async fn old_hash(k: &Kernel, tenant: Uuid, message: &[u8]) -> Result<Option<Vec<u8>>> {
    let v = handle()?;
    let scope = Scope::Workspace(tenant);
    for first in [true, false] {
        match v.sign(k, scope, OLD, message).await {
            Ok(hash) => return Ok(Some(hash)),
            Err(Error::NotFound(_)) if first => {
                if !move_old(k, &v, tenant).await? {
                    return Ok(None);
                }
            }
            // Gone, or past its time ("… expired on …").
            Err(Error::NotFound(_) | Error::Forbidden(_)) => return Ok(None),
            Err(e) => return Err(unavailable(e)),
        }
    }
    Ok(None)
}

/// The relay's signing key in the workspace, as the relay's key directory holds it; none until one is set.
pub(crate) async fn relay_key(k: &Kernel, tenant: Uuid) -> Result<Option<Zeroizing<Vec<u8>>>> {
    let v = handle()?;
    let scope = Scope::Workspace(tenant);
    for first in [true, false] {
        match v.reveal(k, scope, RELAY).await {
            Ok(key) => return Ok(Some(key)),
            Err(Error::NotFound(_)) if first => {
                if !move_relay(k, &v, tenant).await? {
                    return Ok(None);
                }
            }
            Err(Error::NotFound(_)) => return Ok(None),
            Err(e) => return Err(unavailable(e)),
        }
    }
    Ok(None)
}

/// The relay's signing key the vault holds now, without moving one in (for Set Signing Key, which holds the settings'
/// row the move would lock).
pub(crate) async fn held_relay_key(k: &Kernel, tenant: Uuid) -> Result<Option<Zeroizing<Vec<u8>>>> {
    match handle()?.reveal(k, Scope::Workspace(tenant), RELAY).await {
        Ok(key) => Ok(Some(key)),
        Err(Error::NotFound(_)) => Ok(None),
        Err(e) => Err(unavailable(e)),
    }
}

/// Sets the relay's signing key (Set Signing Key): its one home.
pub(crate) async fn set_relay(k: &Kernel, tenant: Uuid, material: &str) -> Result<()> {
    let rule = Rule { reveal: true, ..Default::default() };
    let value = New::Value(Zeroizing::new(material.as_bytes().to_vec()));
    handle()?.set(k, Scope::Workspace(tenant), RELAY, value, rule).await.map_err(unavailable).map(|_| ())
}

/// What the vault's copy of the relay's key is checked against the sealed field's with (an HMAC under each).
const CHECK: &[u8] = b"ferrum-live: the relay's key";

/// Takes into the vault the relay's key that Live Settings keeps sealed, when the vault has none or another: before 0.2
/// the field was its home, and the build before this one still reads it, so this one writes it too (Set Signing Key),
/// field first and vault second, under the settings' row lock; here, under the same lock, a field that differs from the
/// vault (the build before set a key after a rollback, or a Set Signing Key failed after its vault write) wins. Whether
/// the vault holds a key now. One replica at a time: the row is locked without waiting, as [`move_old`] locks its own.
async fn move_relay(k: &Kernel, v: &Vault, tenant: Uuid) -> Result<bool> {
    let scope = Scope::Workspace(tenant);
    for _ in 0..50 {
        let mut tx = k.db.tenant_tx(tenant).await?;
        let row: std::result::Result<Option<Uuid>, sqlx::Error> =
            sqlx::query_scalar("select id from e_live_settings where tenant_id = $1 limit 1 for update nowait").bind(tenant).fetch_optional(&mut *tx).await;
        let id = match row {
            Ok(Some(id)) => id,
            Ok(None) => return Ok(false),
            Err(sqlx::Error::Database(d)) if d.code().as_deref() == Some("55P03") => {
                drop(tx);
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                continue;
            }
            Err(e) => return Err(e.into()),
        };
        let Some(material) = k.secret(&mut tx, tenant, "LiveSettings", id, "signing_key").await?.map(Zeroizing::new) else {
            return Ok(v.describe(k, scope, RELAY).await.map_err(unavailable)?.is_some());
        };
        let same = match v.verify(k, scope, RELAY, CHECK, &mac(material.trim().as_bytes(), CHECK)).await {
            Ok(same) => same,
            Err(Error::NotFound(_)) => false,
            Err(e) => return Err(unavailable(e)),
        };
        if !same {
            set_relay(k, tenant, material.trim()).await?;
        }
        tx.commit().await?;
        return Ok(true);
    }
    Err(Error::Unavailable("Live's relay key is being moved into the vault: try again in a moment".into()))
}

/// What `live_secret` holds for a workspace: its key, and when it stopped signing (now, if it has not yet).
type Row = (Vec<u8>, DateTime<Utc>);

/// Moves the workspace's old key into the vault, once, if it still checks anything: whether the vault holds it now. One
/// replica at a time: the row is locked without waiting, and one that finds it locked lets go of its connection and
/// asks again, so that no replica holds a connection while it waits for the one moving it, which needs a second one.
async fn move_old(k: &Kernel, v: &Vault, tenant: Uuid) -> Result<bool> {
    let scope = Scope::Workspace(tenant);
    let sandbox = k.outward(tenant).await.is_err();
    for _ in 0..50 {
        let mut tx = k.db.tenant_tx(tenant).await?;
        let row: std::result::Result<Option<Row>, sqlx::Error> =
            sqlx::query_as("select secret, coalesce(retired_at, now()) from live_secret where tenant_id = $1 for update nowait")
                .bind(tenant)
                .fetch_optional(&mut *tx)
                .await;
        let (secret, retired) = match row {
            Ok(Some(row)) => row,
            Ok(None) => return Ok(false),
            // Another replica is moving it.
            Err(sqlx::Error::Database(d)) if d.code().as_deref() == Some("55P03") => {
                drop(tx);
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                continue;
            }
            // The table is gone (a later release dropped it): nothing to move.
            Err(sqlx::Error::Database(d)) if d.code().as_deref() == Some("42P01") => return Ok(false),
            Err(e) => return Err(e.into()),
        };
        let secret = Zeroizing::new(secret);
        let until = retired + old_for();
        let held = if sandbox || until <= Utc::now() {
            false
        } else if v.describe(k, scope, OLD).await.map_err(unavailable)?.is_some() {
            true
        } else {
            let rule = Rule { expires_at: Some(until), ..Default::default() };
            v.set(k, scope, OLD, New::Value(secret), rule).await.map_err(unavailable)?;
            true
        };
        sqlx::query("update live_secret set retired_at = $2 where tenant_id = $1 and retired_at is null").bind(tenant).bind(retired).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(held);
    }
    Err(Error::Unavailable("Live's old key is being moved into the vault: try again in a moment".into()))
}

/// Upkeep: the old seat keys of workspaces where none has moved yet, and the relay's keys Live Settings keeps sealed
/// that the vault does not hold, or holds otherwise (see [`move_relay`]). Nothing while the vault is closed.
pub(crate) async fn move_waiting(k: &Kernel) -> Result<()> {
    let Ok(v) = handle() else { return Ok(()) };
    let waiting: Vec<Uuid> = {
        let mut tx = k.db.system_tx().await?;
        let found = sqlx::query_scalar("select tenant_id from live_secret where retired_at is null order by tenant_id limit 200").fetch_all(&mut *tx).await;
        tx.commit().await?;
        match found {
            Ok(found) => found,
            Err(sqlx::Error::Database(d)) if d.code().as_deref() == Some("42P01") => return Ok(()),
            Err(e) => return Err(e.into()),
        }
    };
    for tenant in waiting {
        match move_old(k, &v, tenant).await {
            Ok(_) => {}
            Err(Error::Unavailable(_)) => return Ok(()),
            Err(e) => tracing::warn!(%tenant, "moving Live's old seat key into the vault: {e}"),
        }
    }
    let keyed: Vec<Uuid> = {
        let mut tx = k.db.system_tx().await?;
        let found =
            sqlx::query_scalar("select distinct s.tenant_id from e_live_settings s where s.key_changed_at is not null order by 1").fetch_all(&mut *tx).await?;
        tx.commit().await?;
        found
    };
    for tenant in keyed {
        match move_relay(k, &v, tenant).await {
            Ok(_) => {}
            Err(Error::Unavailable(_)) => return Ok(()),
            Err(e) => tracing::warn!(%tenant, "moving the relay's key into the vault: {e}"),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_old_seat_key_finds_seats_for_longer_than_a_token_lives() {
        assert!(old_for() > Duration::minutes(61) + Duration::seconds(90));
        assert_eq!(mac(b"key", b"message"), mac(b"key", b"message"));
        assert_ne!(mac(b"key", b"message"), mac(b"other", b"message"));
    }
}
