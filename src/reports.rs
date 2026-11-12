//! Live reports: each broadcast with its audience, and the audience by status. Every query carries the caller's
//! record scope on Broadcast. Viewers now are the seats live at this moment; the peak and the total are what the
//! broadcast kept from its viewers' token renewals.

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use ferrum_domain::reports::{Params, ReportCompany, ReportSource, col, param_def, period, read_tx};
use ferrum_kernel::{Action, Ctx, Error, Kernel, Result, Tx, row_scope};
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder};
use std::collections::HashMap;
use uuid::Uuid;

pub struct LiveReports;

fn span(ctx: &Ctx, p: &Params<'_>) -> Result<(NaiveDate, NaiveDate)> {
    let co = ReportCompany { id: Uuid::nil(), name: String::new(), currency: String::new(), fy_month: ctx.fy_start_month, precision: 2 };
    period(p, &co)
}

/// `select <columns> from` the caller's visible broadcasts `a`, planned or created within the period (`$1` the tenant, `$2` the time zone).
fn broadcasts(ctx: &Ctx, columns: &str, (from, to): (NaiveDate, NaiveDate)) -> Result<QueryBuilder<Postgres>> {
    let ent = ctx.schema.entity("Broadcast").ok_or_else(|| Error::NotFound("Broadcast".into()))?;
    let scope = row_scope(ctx, ent, Action::Read)?;
    let mut qb = QueryBuilder::new(format!("select {columns} from e_broadcast a where a.tenant_id = "));
    qb.push_bind(ctx.tenant);
    qb.push(" and ").push_bind(ctx.schema.timezone.clone()).push("::text is not null");
    scope.push_sql(&mut qb, "a");
    qb.push(" and (coalesce(a.started_at, a.planned_start, a.created_at) at time zone $2)::date between ").push_bind(from).push(" and ").push_bind(to);
    Ok(qb)
}

type Row = (String, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, i64, i64, i64);

async fn list(k: &Kernel, ctx: &Ctx, p: &Params<'_>, tx: &mut Tx) -> Result<Value> {
    // A number the settings clamp, so it is spliced into the statement as one.
    let window = crate::settings::load(k, ctx, tx).await?.watch_minutes() * 60 + 90;
    let columns = format!(
        "a.title, a.status, a.started_at, a.ended_at, coalesce(a.viewers_peak, 0), coalesce(a.viewers_total, 0), \
         (select count(*) from live_seat s where s.tenant_id = a.tenant_id and s.broadcast = a.id and s.seen_at > now() - make_interval(secs => {window}::float8))"
    );
    let mut qb = broadcasts(ctx, &columns, span(ctx, p)?)?;
    qb.push(" order by coalesce(a.started_at, a.planned_start, a.created_at) desc limit 1000");
    let data: Vec<Row> = qb.build_query_as().fetch_all(&mut **tx).await?;
    let rows: Vec<Value> = data
        .into_iter()
        .map(|(title, status, started, ended, peak, total, now)| json!({"title": title, "status": status, "started_at": started, "ended_at": ended, "viewers_now": now, "viewers_peak": peak, "viewers_total": total}))
        .collect();
    Ok(json!({
        "columns": [col("title", "Broadcast", "data"), col("status", "Status", "data"), col("started_at", "Started", "datetime"), col("ended_at", "Ended", "datetime"),
            col("viewers_now", "Viewers Now", "int"), col("viewers_peak", "Peak", "int"), col("viewers_total", "Viewers", "int")],
        "rows": rows,
    }))
}

async fn audience(ctx: &Ctx, p: &Params<'_>, tx: &mut Tx) -> Result<Value> {
    let mut qb = broadcasts(ctx, "a.status, count(*), coalesce(sum(a.viewers_total), 0)::bigint, coalesce(max(a.viewers_peak), 0)::bigint", span(ctx, p)?)?;
    qb.push(" group by 1");
    let counts: HashMap<String, (i64, i64, i64)> =
        qb.build_query_as::<(String, i64, i64, i64)>().fetch_all(&mut **tx).await?.into_iter().map(|(s, n, t, m)| (s, (n, t, m))).collect();
    let rows: Vec<Value> = ["Scheduled", "Live", "Ended", "Cancelled"]
        .iter()
        .map(|st| {
            let (n, total, peak) = counts.get(*st).copied().unwrap_or_default();
            json!({"status": st, "broadcasts": n, "viewers_total": total, "best_peak": peak})
        })
        .collect();
    let all: i64 = counts.values().map(|c| c.0).sum();
    Ok(json!({
        "columns": [col("status", "Status", "data"), col("broadcasts", "Broadcasts", "int"), col("viewers_total", "Viewers", "int"), col("best_peak", "Best Peak", "int")],
        "rows": rows,
        "totals": {"broadcasts": all},
    }))
}

#[async_trait]
impl ReportSource for LiveReports {
    fn catalog(&self) -> Vec<Value> {
        let entry = |name: &str, label: &str| json!({"name": name, "label": label, "module": "live", "entity": "Broadcast", "params": [param_def("from_date"), param_def("to_date")]});
        vec![entry("live_broadcasts", "Broadcasts and Their Audience"), entry("live_audience", "Audience by Status")]
    }

    async fn run(&self, k: &Kernel, ctx: &Ctx, name: &str, params: &HashMap<String, String>) -> Result<Value> {
        let p = Params { raw: params };
        let mut tx = read_tx(k, ctx).await?;
        let out = match name {
            "live_broadcasts" => list(k, ctx, &p, &mut tx).await,
            "live_audience" => audience(ctx, &p, &mut tx).await,
            _ => Err(Error::NotFound(format!("report {name}"))),
        };
        tx.rollback().await?;
        out
    }
}
