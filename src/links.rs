//! Viewing and presenter links. A link is a random 256-bit secret in an address's fragment (the part a
//! browser never sends to a server or to a referrer); only its SHA-256 is kept, so nothing a database
//! holds can be used as a link. A link is a record: revoking it, ending the broadcast or letting it
//! expire stops it, and nobody can renew with it.

use crate::{PACKAGE, doc_id, elevated, s, ts};
use async_trait::async_trait;
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Duration, Utc};
use ferrum_kernel::{Ctx, Doc, DocHook, Error, HookCtx, Kernel, Result, Tx};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// The most days a link lives, and how long one lives when nobody says.
const MOST_DAYS: i64 = 90;
const USUAL_DAYS: i64 = 7;

#[derive(Debug, Clone)]
pub struct LinkRow {
    pub id: Uuid,
    pub presenter_name: Option<String>,
    pub presenter_email: Option<String>,
    pub used_at: Option<DateTime<Utc>>,
}

pub fn new_secret() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

pub fn hash(secret: &str) -> String {
    hex::encode(Sha256::digest(secret.trim().as_bytes()))
}

/// Whether `secret` has the shape of one this app makes, before the database is asked about it.
pub fn well_formed(secret: &str) -> bool {
    secret.len() == 43 && secret.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// The working link of `kind` that `secret` is, for this broadcast: not revoked, not expired. Anything else is nothing,
/// whatever the reason, so a stranger learns nothing of which links once existed.
pub async fn find(tx: &mut Tx, tenant: Uuid, broadcast: Uuid, kind: &str, secret: &str) -> Result<Option<LinkRow>> {
    if !well_formed(secret) {
        return Ok(None);
    }
    type Row = (Uuid, Option<String>, Option<String>, Option<DateTime<Utc>>);
    let row: Option<Row> = sqlx::query_as(
        "select id, presenter_name, presenter_email, used_at from e_broadcast_link \
         where tenant_id = $1 and token_hash = $2 and broadcast = $3 and kind = $4 and revoked_at is null and expires_at > now()",
    )
    .bind(tenant)
    .bind(hash(secret))
    .bind(broadcast)
    .bind(kind)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(|(id, presenter_name, presenter_email, used_at)| LinkRow { id, presenter_name, presenter_email, used_at }))
}

/// The address a link is sent at, from the workspace's public address; `None` when the server knows no address.
async fn address(k: &Kernel, tx: &mut Tx, tenant: Uuid, page: &str, broadcast: Uuid, secret: &str) -> Result<Option<String>> {
    let Some(base) = k.link_base(tenant).await else { return Ok(None) };
    let slug: String = sqlx::query_scalar("select slug from tenant where id = $1").bind(tenant).fetch_one(&mut **tx).await?;
    Ok(Some(format!("{}/api/site/{slug}/{PACKAGE}/{page}/{broadcast}#k={secret}", base.trim_end_matches('/'))))
}

/// Makes a link as `ctx` and gives its address, once. `params`: `label`, `days`, and for a presenter `presenter_name`, `presenter_email`.
pub async fn issue(k: &Kernel, ctx: &Ctx, tx: &mut Tx, broadcast: &Doc, kind: &str, params: &Value) -> Result<Value> {
    let id = doc_id(broadcast)?;
    if !matches!(s(broadcast, "status"), Some("Scheduled" | "Live")) {
        return Err(Error::invalid("a link is made for a broadcast that has not ended"));
    }
    let days = params.get("days").and_then(Value::as_i64).unwrap_or(USUAL_DAYS);
    if !(1..=MOST_DAYS).contains(&days) {
        return Err(Error::field("days", format!("1 to {MOST_DAYS}")));
    }
    let text = |name: &str| params.get(name).and_then(Value::as_str).map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let presenter = kind == "Presenter";
    if presenter && text("presenter_name").is_none() {
        return Err(Error::field("presenter_name", "who will present"));
    }
    let secret = new_secret();
    let expires = crate::now() + Duration::days(days);
    let owner = ctx.email.clone();
    let values = json!({
        "broadcast": id, "kind": kind, "label": text("label").or_else(|| text("presenter_name")), "presenter_name": text("presenter_name"),
        "presenter_email": text("presenter_email"), "token_hash": hash(&secret), "expires_at": ts(expires), "owner_email": owner,
    });
    let made = k.insert_tx(&elevated(ctx), tx, "BroadcastLink", values.as_object().cloned().unwrap_or_default()).await?;
    let url = address(k, tx, ctx.tenant, if presenter { "present" } else { "watch" }, id, &secret).await?;
    // Without a public address the secret is still given: the caller builds the address (README, "Links").
    Ok(json!({"link": doc_id(&made)?, "secret": secret, "url": url, "expires_at": ts(expires)}))
}

/// Revokes links of a broadcast (all of them), as the platform's action links are ended: at once, in the
/// transaction that asked. How many it ended.
pub async fn revoke_all(tx: &mut Tx, tenant: Uuid, broadcast: Uuid) -> Result<u64> {
    let n = sqlx::query("update e_broadcast_link set revoked_at = now() where tenant_id = $1 and broadcast = $2 and revoked_at is null")
        .bind(tenant)
        .bind(broadcast)
        .execute(&mut **tx)
        .await?
        .rows_affected();
    Ok(n)
}

/// A presenter link starts a broadcast once: the first start takes it and says who presented.
pub async fn take(tx: &mut Tx, tenant: Uuid, link: Uuid) -> Result<bool> {
    let n = sqlx::query("update e_broadcast_link set used_at = now() where tenant_id = $1 and id = $2 and used_at is null")
        .bind(tenant)
        .bind(link)
        .execute(&mut **tx)
        .await?
        .rows_affected();
    Ok(n == 1)
}

pub struct LinkHook;

#[async_trait]
impl DocHook for LinkHook {
    async fn action(&self, hc: &mut HookCtx<'_>, name: &str, doc: &Doc, _params: &Value) -> Result<Option<Value>> {
        if name != "revoke" {
            return Ok(None);
        }
        let n = sqlx::query("update e_broadcast_link set revoked_at = coalesce(revoked_at, now()) where tenant_id = $1 and id = $2")
            .bind(hc.ctx.tenant)
            .bind(doc_id(doc)?)
            .execute(&mut **hc.tx)
            .await?
            .rows_affected();
        Ok(Some(json!({"revoked": n})))
    }
}
