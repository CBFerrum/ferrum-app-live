//! What the support report and the doctor say of Live in a workspace that has it: the counts, and in words what
//! stands between a presenter and the relay. Nothing here holds a key or an address of a person.

use crate::relay::Relay;
use crate::settings;
use ferrum_kernel::support::Health;
use ferrum_kernel::{Ctx, Kernel, Result, Tx};
use serde_json::{Value, json};
use std::sync::Arc;
use uuid::Uuid;

pub struct RelayHealth {
    pub relay: Arc<dyn Relay>,
}

#[async_trait::async_trait]
impl Health for RelayHealth {
    async fn health(&self, k: &Kernel, tx: &mut Tx, tenant: Uuid) -> Result<Value> {
        let sys = Ctx::system(tenant, k.registry.schema(tenant).await?);
        let set = settings::load(k, &sys, tx).await?;
        let mut problems: Vec<String> = Vec::new();
        let live: i64 =
            sqlx::query_scalar("select count(*) from e_broadcast where tenant_id = $1 and status = 'Live'").bind(tenant).fetch_one(&mut **tx).await?;
        match set.check_url() {
            None => problems.push("Live Settings names no relay address".into()),
            Some(url) => {
                if let Err(e) = self.relay.health(k, &url).await {
                    problems.push(format!("the relay does not answer: {e}"));
                }
            }
        }
        match settings::signing_key(k, tx, self.relay.as_ref(), tenant).await {
            Ok(Some(_)) => {}
            Ok(None) => problems.push("Live Settings holds no signing key: nobody can be given access".into()),
            Err(e) => problems.push(e.to_string()),
        }
        Ok(json!({"broadcasts_live": live, "problems": problems}))
    }
}
