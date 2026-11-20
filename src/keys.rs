//! Live's keys, from its own key in the vault (Ferrum docs/operations.md, "The vault").
//!
//! * Seats are keyed hashes of who watches (`seats.rs`), under a key derived from Live's own key for that purpose
//!   (`seat-hashes`), made when needed and kept nowhere.
//! * The relay's signing key has one home: Live's secret `relay-signing-key` in the workspace, the JWK exactly as `moq
//!   auth generate` wrote it, which is what the relay's key directory holds as `{kid}.jwk` (docs/deploy.md). Its rule lets
//!   it out (`reveal`), because the relay must hold the same secret: Live reads it for each token, and so will whatever
//!   writes the relay's key files from the vault.

use ferrum_kernel::vault::{Derived, New, Rule, Scope, Vault, Zeroizing};
use ferrum_kernel::{Error, Kernel, Result};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::RwLock;
use uuid::Uuid;

/// The seats' hashes.
pub const SEATS: &str = "seat-hashes";
/// The relay's signing key.
pub const RELAY: &str = "relay-signing-key";

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

/// The key before the relay's signing key, kept by Set Signing Key so that sessions admitted under it go on.
pub const PREVIOUS: &str = "relay-signing-key-previous";

/// The relay's signing key in the workspace, as the relay's key directory holds it; none until one is set.
pub(crate) async fn relay_key(k: &Kernel, tenant: Uuid) -> Result<Option<Zeroizing<Vec<u8>>>> {
    revealed(k, tenant, RELAY).await
}

/// The signing key before the one in use; none when it was never changed.
pub(crate) async fn previous_relay_key(k: &Kernel, tenant: Uuid) -> Result<Option<Zeroizing<Vec<u8>>>> {
    revealed(k, tenant, PREVIOUS).await
}

async fn revealed(k: &Kernel, tenant: Uuid, name: &str) -> Result<Option<Zeroizing<Vec<u8>>>> {
    match handle()?.reveal(k, Scope::Workspace(tenant), name).await {
        Ok(key) => Ok(Some(key)),
        Err(Error::NotFound(_)) => Ok(None),
        Err(e) => Err(unavailable(e)),
    }
}

/// Sets the relay's signing key (Set Signing Key): its one home.
pub(crate) async fn set_relay(k: &Kernel, tenant: Uuid, material: &str) -> Result<()> {
    let rule = Rule { reveal: true, ..Default::default() };
    if let Some(before) = relay_key(k, tenant).await? {
        handle()?.set(k, Scope::Workspace(tenant), PREVIOUS, New::Value(before), rule.clone()).await.map_err(unavailable)?;
    }
    let value = New::Value(Zeroizing::new(material.as_bytes().to_vec()));
    handle()?.set(k, Scope::Workspace(tenant), RELAY, value, rule).await.map_err(unavailable).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seat_hashes_are_keyed() {
        assert_eq!(mac(b"key", b"message"), mac(b"key", b"message"));
        assert_ne!(mac(b"key", b"message"), mac(b"other", b"message"));
    }
}
