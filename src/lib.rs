//! Live: one-to-many live video at low delay, through a Media over QUIC relay beside the stack.
//!
//! * `Broadcast` is one live video from a presenter to an audience. It may be about any record
//!   (`reference_entity`, `reference_id`) or stand alone. Its status (Scheduled, Live, Ended, Cancelled)
//!   is moved only by this app.
//! * The relay admits people with short-lived signed tokens for one broadcast's path. Everything the app
//!   knows of the relay is behind [`relay::Relay`] ([`relay::MoqRelay`], [`relay::FakeRelay`]).
//! * Routes (`site.rs`): start publishing, renew, end; watch, renew, leave; the watch page and the embed
//!   description. Presenters and viewers are told apart by `access.rs`; seats, the app's own count of who
//!   is watching, are `seats.rs`.
//! * Upkeep ends broadcasts nobody presents, forgets old seats and clears old replay links.

mod access;
mod broadcast;
mod health;
mod links;
mod page;
pub mod relay;
mod reports;
mod seats;
mod session;
mod settings;
mod site;
mod upkeep;

use chrono::{DateTime, SecondsFormat, TimeZone, Utc};
use ferrum_domain::reports::ReportSource;
use ferrum_kernel::{Doc, HookRegistry, Kernel, Result};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

include!(concat!(env!("OUT_DIR"), "/packages.rs"));
include!(concat!(env!("OUT_DIR"), "/ui.rs"));

/// This app's manifest (`app.yaml`).
pub const MANIFEST: &str = include_str!("../app.yaml");

pub(crate) const PACKAGE: &str = "live";

/// This app's metadata packages, embedded at build time.
pub fn packages() -> std::result::Result<Vec<ferrum_meta::Package>, ferrum_meta::MetaError> {
    ferrum_meta::catalog::load_embedded(EMBEDDED)
}

/// Registers this app's hooks, its endpoints and its health check, for `moq-relay`.
pub fn register(hooks: &mut HookRegistry) {
    register_with(hooks, Arc::new(relay::MoqRelay));
}

/// [`register`] with another relay behind the interface (a test's).
pub fn register_with(hooks: &mut HookRegistry, relay: Arc<dyn relay::Relay>) {
    hooks
        .register("LiveSettings", Arc::new(settings::SettingsHook { relay: relay.clone() }))
        .register("Broadcast", Arc::new(broadcast::BroadcastHook))
        .register("BroadcastLink", Arc::new(links::LinkHook))
        .add_health(PACKAGE, Arc::new(health::RelayHealth { relay: relay.clone() }))
        .add_site(PACKAGE, Arc::new(site::LiveSite { relay }));
}

/// This app's reports.
pub fn reports() -> Vec<Arc<dyn ReportSource>> {
    vec![Arc::new(reports::LiveReports)]
}

/// Periodic upkeep, every minute on one replica at a time: ends broadcasts nobody presents, forgets seats and
/// clears replay links past their retention. Idempotent and cheap.
pub async fn maintenance(k: &Kernel) -> Result<()> {
    upkeep::run(k).await
}

// ───────────────────────────── shared helpers ─────────────────────────────

pub(crate) use ferrum_domain::util::{elevated, id, rows, s};

pub(crate) fn int(doc: &Doc, key: &str) -> i64 {
    doc.get(key).and_then(Value::as_i64).unwrap_or(0)
}

pub(crate) fn doc_id(doc: &Doc) -> Result<Uuid> {
    id(doc, "id").ok_or_else(|| ferrum_kernel::Error::internal("record without id"))
}

/// RFC 3339 UTC with milliseconds, the kernel's canonical date-time form.
pub(crate) fn ts(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Now, to the millisecond: the precision timestamps are stored with.
pub(crate) fn now() -> DateTime<Utc> {
    let n = Utc::now();
    Utc.timestamp_millis_opt(n.timestamp_millis()).single().unwrap_or(n)
}

pub(crate) fn time(doc: &Doc, key: &str) -> Option<DateTime<Utc>> {
    s(doc, key).and_then(|v| ferrum_kernel::value::parse_datetime(v).ok())
}

/// A broadcast's path on the relay: the workspace's prefix, the workspace and the broadcast (UUIDs without
/// hyphens), so workspaces sharing a relay stay apart and nothing a person typed is in it.
pub(crate) fn path_of(prefix: &str, tenant: Uuid, broadcast: Uuid) -> String {
    format!("{prefix}/{}/{}", tenant.simple(), broadcast.simple())
}
