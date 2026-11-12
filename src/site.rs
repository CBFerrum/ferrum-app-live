//! Routes at `/api/app/live/…` (signed in) and `/api/site/{workspace}/live/…` (public: a request carries no person,
//! only what its body says). `{id}` is a broadcast's id.
//!
//! * `POST /broadcasts/{id}/publish {link?}` starts presenting: → `{relay, path, name, token, url, element,
//!   expires_at, refresh_in, recording, status}`; `…/publish/refresh` renews (Live only); `…/end` ends it.
//! * `POST /broadcasts/{id}/watch {link?, seat?}` takes a seat: the same answer for viewers, or `{status, text, …}`
//!   while there is nothing to watch, or 503 `{error: "full"}`; `…/watch/refresh` renews it and is refused when the
//!   right is gone; `…/watch/leave` gives the seat up.
//! * `GET /broadcasts/{id}/embed`, `GET /embed?entity=&record=`: what another app needs to put the player
//!   beside its own content.
//! * `GET /watch/{id}`, `GET /present/{id}`: the pages. A link's secret is the address's fragment (`#k=`).

use crate::relay::Relay;
use crate::session::{self, Caller, Outcome};
use crate::{broadcast, doc_id, page, s, settings};
use async_trait::async_trait;
use ferrum_kernel::{Ctx, Error, Kernel, Result, Site, SiteRequest, SiteResponse};
use serde_json::{Map, Value, json};
use std::sync::Arc;
use uuid::Uuid;

pub struct LiveSite {
    pub relay: Arc<dyn Relay>,
}

fn body(req: &SiteRequest) -> Result<Map<String, Value>> {
    if req.body.iter().all(u8::is_ascii_whitespace) {
        return Ok(Map::new());
    }
    match serde_json::from_slice(&req.body) {
        Ok(Value::Object(m)) => Ok(m),
        _ => Err(Error::invalid("the body must be a JSON object")),
    }
}

fn uuid(seg: &str) -> Result<Uuid> {
    seg.parse().map_err(|_| Error::NotFound("broadcast".into()))
}

fn json_response(status: u16, v: &Value) -> SiteResponse {
    SiteResponse::json(status, v)
}

#[async_trait]
impl Site for LiveSite {
    async fn handle(&self, k: &Kernel, req: SiteRequest) -> Result<SiteResponse> {
        let path: Vec<&str> = req.path.split('/').filter(|p| !p.is_empty()).collect();
        let tenant = req.tenant;
        let mut resp = match (req.method.as_str(), path.as_slice()) {
            ("GET", ["watch", id]) => self.page(k, &req, false, id).await?,
            ("GET", ["present", id]) => self.page(k, &req, true, id).await?,
            ("GET", ["module", name]) => match crate::module::file(name) {
                Some((ct, bytes)) => {
                    let mut r = SiteResponse::text(200, ct, String::new());
                    r.body = bytes.to_vec();
                    r.headers.push(("cache-control".into(), "public, max-age=31536000, immutable".into()));
                    r
                }
                None => return Err(Error::NotFound("endpoint".into())),
            },
            ("GET", ["embed"]) => self.embed_for_record(k, &req).await?,
            ("GET", ["broadcasts", id, "embed"]) => {
                let link = req.query.get("link").and_then(Value::as_str);
                let who = Caller { ctx: req.user.as_ref(), link, nonce: None };
                let mut out = session::describe(k, tenant, uuid(id)?, &who).await?;
                self.add_embed(k, tenant, &mut out, link).await?;
                json_response(200, &out)
            }
            ("POST", ["broadcasts", id, rest @ ..]) => {
                let id = uuid(id)?;
                let b = body(&req)?;
                let text = |n: &str| b.get(n).and_then(Value::as_str).map(str::to_string);
                let (link, seat) = (text("link"), text("seat"));
                let who = Caller { ctx: req.user.as_ref(), link: link.as_deref(), nonce: seat.as_deref() };
                match rest {
                    ["watch"] | ["watch", "refresh"] => match session::watch(k, self.relay.as_ref(), tenant, id, &who, rest.len() == 2).await? {
                        Outcome::Offer(v) | Outcome::State(v) => json_response(200, &v),
                        Outcome::Full(text) => {
                            let mut r = json_response(503, &json!({"error": "full", "message": text}));
                            r.headers.push(("retry-after".into(), "15".into()));
                            r
                        }
                    },
                    ["watch", "leave"] => {
                        session::leave(k, tenant, id, &who).await?;
                        json_response(200, &json!({"left": true}))
                    }
                    ["publish"] | ["publish", "refresh"] => {
                        json_response(200, &session::present(k, self.relay.as_ref(), tenant, id, &who, rest.len() == 2).await?)
                    }
                    ["end"] => json_response(200, &session::end(k, tenant, id, &who).await?),
                    _ => return Err(Error::NotFound("endpoint".into())),
                }
            }
            _ => return Err(Error::NotFound("endpoint".into())),
        };
        for (k, v) in [("cache-control", "no-store"), ("x-content-type-options", "nosniff")] {
            if !resp.headers.iter().any(|(h, _)| h == k) {
                resp.headers.push((k.into(), v.into()));
            }
        }
        Ok(resp)
    }
}

impl LiveSite {
    /// The page: the same for any id (nothing is looked up for a stranger but the sites that may frame it).
    async fn page(&self, k: &Kernel, req: &SiteRequest, present: bool, id: &str) -> Result<SiteResponse> {
        let tenant = req.tenant;
        let sys = Ctx::system(tenant, k.registry.schema(tenant).await?);
        let mut tx = k.db.tenant_tx(tenant).await?;
        let set = settings::load(k, &sys, &mut tx).await?;
        let frames = match id.parse::<Uuid>() {
            Ok(id) => match k.get_tx(&sys, &mut tx, "Broadcast", id, false).await {
                Ok(doc) => broadcast::origins(s(&doc, "frame_origins").unwrap_or_default()).unwrap_or_default(),
                Err(Error::NotFound(_)) => vec![],
                Err(e) => return Err(e),
            },
            Err(_) => return Err(Error::NotFound("broadcast".into())),
        };
        let module = set.text(if present { "publisher_module_url" } else { "player_module_url" });
        let bundled = crate::module::entry(if present { "publish" } else { "watch" });
        Ok(page::render(present, &module, bundled, set.relay_url().as_deref(), &frames))
    }

    /// Adds the page address and the frame other apps put beside their content.
    async fn add_embed(&self, k: &Kernel, tenant: Uuid, out: &mut Value, link: Option<&str>) -> Result<()> {
        let mut tx = k.db.tenant_tx(tenant).await?;
        let slug: String = sqlx_slug(&mut tx, tenant).await?;
        let base = k.link_base(tenant).await.unwrap_or_default();
        let id = out["id"].as_str().unwrap_or_default().to_string();
        let mut src = format!("{}/api/site/{slug}/live/watch/{id}", base.trim_end_matches('/'));
        if let Some(link) = link {
            src.push_str(&format!("#k={link}"));
        }
        out["page"] = json!(src);
        out["iframe"] = json!(format!(
            "<iframe src=\"{src}\" allow=\"autoplay; fullscreen\" allowfullscreen loading=\"lazy\" style=\"border:0;width:100%;aspect-ratio:16/9\"></iframe>"
        ));
        Ok(())
    }

    /// `GET /embed?entity=Lesson&record={id}`: the broadcasts about a record that the signed-in caller may watch, newest first.
    async fn embed_for_record(&self, k: &Kernel, req: &SiteRequest) -> Result<SiteResponse> {
        let Some(ctx) = req.user.as_ref() else { return Err(Error::NotFound("endpoint".into())) };
        let (Some(entity), Some(record)) = (req.query.get("entity").and_then(Value::as_str), req.query.get("record").and_then(Value::as_str)) else {
            return Err(Error::invalid("entity and record are needed"));
        };
        let sys = Ctx::system(ctx.tenant, ctx.schema.clone());
        let mut tx = k.db.tenant_tx(ctx.tenant).await?;
        let filters = ferrum_kernel::query::parse_filters(&json!([["reference_entity", "=", entity], ["reference_id", "=", record]]))
            .map_err(|e| Error::invalid(e.to_string()))?;
        let rows = k.find_tx(&sys, &mut tx, "Broadcast", &filters, Some("created_at desc"), 20).await?;
        tx.commit().await?;
        let mut out = Vec::new();
        for doc in rows {
            let id = doc_id(&doc)?;
            let who = Caller { ctx: Some(ctx), link: None, nonce: None };
            // The same decision as watching: a person who may not watch it is not told it exists.
            let Ok(mut one) = session::describe(k, ctx.tenant, id, &who).await else { continue };
            self.add_embed(k, ctx.tenant, &mut one, None).await?;
            out.push(one);
        }
        Ok(json_response(200, &json!({"broadcasts": out})))
    }
}

async fn sqlx_slug(tx: &mut ferrum_kernel::Tx, tenant: Uuid) -> Result<String> {
    Ok(sqlx::query_scalar("select slug from tenant where id = $1").bind(tenant).fetch_one(&mut **tx).await?)
}
