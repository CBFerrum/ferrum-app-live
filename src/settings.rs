//! Live Settings: the relay's address, its signing key (a secret the app never returns), token lifetimes,
//! the default audience and capacity, recording, and the wording of the pages. A value nobody set is the
//! field's default from the package (`packages/live/entities/live.yaml`), so a workspace that never opened
//! its settings behaves as the defaults say and the code holds no wording of its own.

use crate::relay::{Relay, RelayKey};
use crate::{doc_id, s};
use async_trait::async_trait;
use ferrum_kernel::{Ctx, Doc, DocHook, Error, HookCtx, Kernel, Result, Tx};
use serde_json::{Value, json};
use std::sync::Arc;
use uuid::Uuid;

pub struct Settings {
    row: Doc,
    ctx: Ctx,
}

impl Settings {
    fn raw(&self, name: &str) -> Option<Value> {
        let set = self.row.get(name).filter(|v| !v.is_null() && v.as_str() != Some(""));
        set.cloned().or_else(|| self.ctx.schema.entity("LiveSettings").and_then(|e| e.field(name).and_then(|f| f.default.clone())))
    }

    pub fn text(&self, name: &str) -> String {
        self.raw(name).and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default()
    }

    pub fn number(&self, name: &str) -> i64 {
        self.raw(name).and_then(|v| v.as_i64()).unwrap_or(0)
    }

    pub fn flag(&self, name: &str) -> bool {
        self.raw(name).and_then(|v| v.as_bool()).unwrap_or(false)
    }

    /// The relay as browsers reach it, without a trailing slash; none until an administrator names it.
    pub fn relay_url(&self) -> Option<String> {
        let url = self.text("relay_url");
        let url = url.trim().trim_end_matches('/');
        (url.starts_with("https://") || url.starts_with("http://")).then(|| url.to_string())
    }

    /// Where the server asks whether the relay answers.
    pub fn check_url(&self) -> Option<String> {
        match self.text("relay_check_url").trim() {
            "" => self.relay_url().map(|u| format!("{u}/health")),
            url => Some(url.to_string()),
        }
    }

    pub fn prefix(&self) -> String {
        let p = self.text("path_prefix");
        let ok = !p.is_empty() && p.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_');
        if ok {
            p
        } else {
            self.ctx
                .schema
                .entity("LiveSettings")
                .and_then(|e| e.field("path_prefix").and_then(|f| f.default.clone()))
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default()
        }
    }

    pub fn watch_minutes(&self) -> i64 {
        self.number("watch_token_minutes").clamp(1, 60)
    }

    pub fn publish_minutes(&self) -> i64 {
        self.number("publish_token_minutes").clamp(5, 720)
    }

    /// The audience a broadcast has: its own, else the default's. Each level includes the ones before it.
    pub fn audience(&self, broadcast: &Doc) -> u8 {
        let name = s(broadcast, "audience").map(str::to_string).unwrap_or_else(|| self.text("default_audience"));
        ["Members", "Portal", "Link", "Public"].iter().position(|a| *a == name).unwrap_or(0) as u8
    }

    pub fn capacity(&self, broadcast: &Doc) -> i64 {
        match crate::int(broadcast, "capacity") {
            0 => self.number("default_capacity"),
            n => n,
        }
    }

    pub fn recording(&self, broadcast: &Doc) -> bool {
        match s(broadcast, "recording") {
            Some("On") => true,
            Some("Off") => false,
            _ => self.flag("recording_default"),
        }
    }
}

/// The workspace's settings, with the package's defaults where nothing was saved.
pub async fn load(k: &Kernel, ctx: &Ctx, tx: &mut Tx) -> Result<Settings> {
    let sys = Ctx::system(ctx.tenant, ctx.schema.clone());
    let row = k.find_tx(&sys, tx, "LiveSettings", &[] as &[ferrum_kernel::Filter], None, 1).await?.into_iter().next().unwrap_or_default();
    Ok(Settings { row, ctx: sys })
}

/// The signing key, opened. `None` until an administrator has set one.
pub async fn signing_key(k: &Kernel, tx: &mut Tx, relay: &dyn Relay, tenant: Uuid) -> Result<Option<RelayKey>> {
    let id: Option<Uuid> = sqlx::query_scalar("select id from e_live_settings where tenant_id = $1 limit 1").bind(tenant).fetch_optional(&mut **tx).await?;
    let Some(id) = id else { return Ok(None) };
    match k.secret(tx, tenant, "LiveSettings", id, "signing_key").await? {
        Some(material) => {
            relay.parse_key(&material).map(Some).map_err(|_| Error::Unavailable("the relay's signing key in Live Settings cannot be used: set it again".into()))
        }
        None => Ok(None),
    }
}

pub struct SettingsHook {
    pub relay: Arc<dyn Relay>,
}

#[async_trait]
impl DocHook for SettingsHook {
    async fn validate(&self, _hc: &mut HookCtx<'_>, doc: &Doc) -> Result<()> {
        if let Some(prefix) = s(doc, "path_prefix")
            && !prefix.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        {
            return Err(Error::field("path_prefix", "letters, digits, dash and underscore"));
        }
        for field in ["player_module_url", "publisher_module_url"] {
            if let Some(url) = s(doc, field)
                && !url.trim().is_empty()
                && !crate::page::module_ok(url)
            {
                return Err(Error::field(field, "an https address, without quotes, spaces or angle brackets"));
            }
        }
        if let Some(name) = s(doc, "stream_name")
            && (name.starts_with('.') || name.contains('/') || name.contains("..") || !name.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c)))
        {
            return Err(Error::field("stream_name", "letters, digits, dash, underscore and dots, no slash"));
        }
        Ok(())
    }

    /// `set_signing_key {key}`: checks the key and keeps it sealed, with its name; the key is never shown again.
    async fn action(&self, hc: &mut HookCtx<'_>, name: &str, doc: &Doc, params: &Value) -> Result<Option<Value>> {
        if name != "set_signing_key" {
            return Ok(None);
        }
        let material = params.get("key").and_then(Value::as_str).unwrap_or_default();
        let key = self.relay.parse_key(material)?;
        let values = json!({"signing_key": material.trim(), "signing_key_id": key.kid, "key_changed_at": crate::ts(crate::now())});
        let values = values.as_object().cloned().unwrap_or_default();
        hc.kernel.update_tx(&crate::elevated(hc.ctx), hc.tx, "LiveSettings", doc_id(doc)?, values, None).await?;
        Ok(Some(json!({"key_id": key.kid})))
    }
}
