//! Questions and polls of a broadcast. A viewer asks and votes from the watch page with the seat they watch from
//! (a keyed hash: no name is needed, and none is kept but what the asker types); presenters and managers show, answer
//! or hide questions and open and close polls with the broadcast's actions. Only shown and answered questions reach
//! viewers. A seat votes once in a poll (the vote's key is the poll and the seat).

use crate::session::{self, Caller};
use crate::{broadcast, doc_id, keys, s, seats, settings};
use ferrum_kernel::{Ctx, Doc, Error, Kernel, Result, Tx};
use serde_json::{Value, json};
use uuid::Uuid;

/// A seat asks at most once in this many seconds, and has at most [`WAITING_PER_SEAT`] questions waiting.
const ASK_GAP_SECONDS: i64 = 20;
const WAITING_PER_SEAT: i64 = 5;
/// A poll has two to ten answers.
const MOST_OPTIONS: usize = 10;

/// The broadcast and the caller's live seat, when they may watch it, it is Live and they hold a seat now. `lock`: one
/// at a time on this broadcast (asking); votes need no lock, their key decides.
async fn seated(k: &Kernel, tx: &mut Tx, tenant: Uuid, id: Uuid, who: &Caller<'_>, lock: bool) -> Result<(Ctx, Doc, String)> {
    let seat_key = keys::current(k, tenant, keys::SEATS).await?;
    let sys = session::system(k, tenant).await?;
    let set = settings::load(k, &sys, tx).await?;
    let doc = if lock { broadcast::lock(k, &sys, tx, id).await? } else { session::read(k, &sys, tx, id).await? };
    let Some((viewer, ident)) = session::viewer(k, tx, &set, &doc, tenant, id, who).await? else { return Err(session::gone()) };
    if s(&doc, "status") != Some("Live") {
        return Err(Error::Conflict("the broadcast is not live".into()));
    }
    let seat = seats::key(seat_key.bytes(), &seats::message(id, session::seat_kind(&viewer), &ident));
    if !seats::held(tx, tenant, id, &seat, session::window(&set)).await? {
        return Err(Error::Forbidden("watch the broadcast to take part".into()));
    }
    Ok((sys, doc, seat))
}

fn words(value: Option<&str>, field: &str, most: usize, required: bool) -> Result<Option<String>> {
    let v = value.map(str::trim).filter(|v| !v.is_empty());
    match v {
        None if required => Err(Error::field(field, format!("1 to {most} characters"))),
        Some(v) if v.chars().count() > most || v.chars().any(|c| c.is_control() && c != '\n') => Err(Error::field(field, format!("1 to {most} characters"))),
        v => Ok(v.map(str::to_string)),
    }
}

/// A viewer asks: the question waits for a presenter.
pub async fn ask(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>, text: Option<&str>, name: Option<&str>) -> Result<Value> {
    let text = words(text, "text", 500, true)?;
    let name = words(name, "name", 80, false)?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let (sys, _, seat) = seated(k, &mut tx, tenant, id, who, true).await?;
    let (recent, waiting): (i64, i64) = sqlx::query_as(
        "select count(*) filter (where created_at > now() - make_interval(secs => $4::float8)), count(*) filter (where status = 'Waiting') \
         from e_broadcast_question where tenant_id = $1 and broadcast = $2 and seat = $3",
    )
    .bind(tenant)
    .bind(id)
    .bind(&seat)
    .bind(ASK_GAP_SECONDS as f64)
    .fetch_one(&mut *tx)
    .await?;
    if recent > 0 || waiting >= WAITING_PER_SEAT {
        return Err(Error::Conflict("wait a moment before asking again".into()));
    }
    let values = json!({"broadcast": id, "text": text, "asker_name": name, "seat": seat});
    let made = k.insert_tx(&sys, &mut tx, "BroadcastQuestion", values.as_object().cloned().unwrap_or_default()).await?;
    tx.commit().await?;
    Ok(json!({"question": doc_id(&made)?, "status": "Waiting"}))
}

/// What viewers see: the shown and answered questions, and the open poll with its counts and the caller's vote.
pub async fn feed(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>) -> Result<Value> {
    let mut tx = k.db.tenant_tx(tenant).await?;
    let (_, _, seat) = seated(k, &mut tx, tenant, id, who, false).await?;
    let questions: Vec<(Uuid, String, Option<String>, String)> = sqlx::query_as(
        "select id, text, asker_name, status from e_broadcast_question where tenant_id = $1 and broadcast = $2 and status in ('Shown', 'Answered') \
         order by created_at limit 200",
    )
    .bind(tenant)
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let poll: Option<(Uuid, String, String)> = sqlx::query_as(
        "select id, question, options from e_broadcast_poll where tenant_id = $1 and broadcast = $2 and status = 'Open' order by created_at desc limit 1",
    )
    .bind(tenant)
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let poll = match poll {
        None => Value::Null,
        Some((pid, question, options)) => {
            let options = options_of(&options);
            let counted: Vec<(i32, i64)> = sqlx::query_as("select choice, count(*) from live_poll_vote where tenant_id = $1 and poll = $2 group by choice")
                .bind(tenant)
                .bind(pid)
                .fetch_all(&mut *tx)
                .await?;
            let mine: Option<i32> = sqlx::query_scalar("select choice from live_poll_vote where tenant_id = $1 and poll = $2 and seat = $3")
                .bind(tenant)
                .bind(pid)
                .bind(&seat)
                .fetch_optional(&mut *tx)
                .await?;
            let counts: Vec<i64> = (0..options.len()).map(|i| counted.iter().find(|(c, _)| *c as usize == i).map_or(0, |(_, n)| *n)).collect();
            json!({"id": pid, "question": question, "options": options, "counts": counts, "mine": mine})
        }
    };
    tx.commit().await?;
    let questions: Vec<Value> =
        questions.into_iter().map(|(qid, text, name, status)| json!({"id": qid, "text": text, "name": name, "status": status})).collect();
    Ok(json!({"questions": questions, "poll": poll}))
}

/// A viewer votes in the open poll: once a seat; a second vote changes nothing and says so.
pub async fn vote(k: &Kernel, tenant: Uuid, id: Uuid, who: &Caller<'_>, poll: Option<&str>, choice: Option<i64>) -> Result<Value> {
    let poll: Uuid = poll.and_then(|p| p.parse().ok()).ok_or_else(|| Error::field("poll", "the poll"))?;
    let mut tx = k.db.tenant_tx(tenant).await?;
    let (_, _, seat) = seated(k, &mut tx, tenant, id, who, false).await?;
    let options: Option<String> =
        sqlx::query_scalar("select options from e_broadcast_poll where tenant_id = $1 and id = $2 and broadcast = $3 and status = 'Open'")
            .bind(tenant)
            .bind(poll)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(options) = options else { return Err(Error::Conflict("the poll is closed".into())) };
    let n = options_of(&options).len() as i64;
    let choice = choice.filter(|c| (0..n).contains(c)).ok_or_else(|| Error::field("option", format!("0 to {}", n - 1)))?;
    let counted =
        sqlx::query("insert into live_poll_vote (tenant_id, poll, seat, choice) values ($1, $2, $3, $4) on conflict (tenant_id, poll, seat) do nothing")
            .bind(tenant)
            .bind(poll)
            .bind(&seat)
            .bind(choice as i32)
            .execute(&mut *tx)
            .await?
            .rows_affected()
            == 1;
    tx.commit().await?;
    Ok(json!({"counted": counted}))
}

fn options_of(text: &str) -> Vec<String> {
    text.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_string).collect()
}

/// The broadcast's actions: `moderate_question {question, to}`, `open_poll {question, options}`, `close_poll {poll}`,
/// `questions` (every question, for the presenter's console).
pub async fn action(k: &Kernel, sys: &Ctx, tx: &mut Tx, doc: &Doc, name: &str, params: &Value) -> Result<Option<Value>> {
    let id = doc_id(doc)?;
    let text = |n: &str| params.get(n).and_then(Value::as_str).map(str::trim).filter(|v| !v.is_empty());
    let uuid = |n: &str| text(n).and_then(|v| v.parse::<Uuid>().ok()).ok_or_else(|| Error::field(n, "the id"));
    Ok(Some(match name {
        "moderate_question" => {
            let qid = uuid("question")?;
            let to = text("to").unwrap_or_default();
            let q = match k.get_tx(sys, tx, "BroadcastQuestion", qid, true).await {
                Ok(q) if s(&q, "broadcast") == Some(id.to_string().as_str()) => q,
                Ok(_) | Err(Error::NotFound(_)) => return Err(Error::NotFound("question".into())),
                Err(e) => return Err(e),
            };
            // Forward only: Waiting, then Shown, then Answered; Hidden from any, and for good.
            let now = s(&q, "status").unwrap_or("Waiting");
            let ok = matches!((now, to), ("Waiting", "Shown" | "Answered" | "Hidden") | ("Shown", "Answered" | "Hidden") | ("Answered", "Hidden"));
            if !ok {
                return Err(Error::invalid(format!("a question that is {now} cannot become {to}")));
            }
            k.update_tx(sys, tx, "BroadcastQuestion", qid, json!({"status": to}).as_object().cloned().unwrap_or_default(), None).await?;
            json!({"question": qid, "status": to})
        }
        "open_poll" => {
            let question = words(text("question"), "question", 200, true)?;
            let options = options_of(text("options").unwrap_or_default());
            if !(2..=MOST_OPTIONS).contains(&options.len()) || options.iter().any(|o| o.chars().count() > 100) {
                return Err(Error::field("options", format!("2 to {MOST_OPTIONS} answers, one a line, each at most 100 characters")));
            }
            if s(doc, "status") != Some("Live") && s(doc, "status") != Some("Scheduled") {
                return Err(Error::invalid("a poll is opened on a broadcast that has not ended"));
            }
            // One open poll a broadcast: opening one closes the one before.
            sqlx::query("update e_broadcast_poll set status = 'Closed' where tenant_id = $1 and broadcast = $2 and status = 'Open'")
                .bind(sys.tenant)
                .bind(id)
                .execute(&mut **tx)
                .await?;
            let values = json!({"broadcast": id, "question": question, "options": options.join("\n"), "status": "Open"});
            let made = k.insert_tx(sys, tx, "BroadcastPoll", values.as_object().cloned().unwrap_or_default()).await?;
            json!({"poll": doc_id(&made)?, "status": "Open"})
        }
        "close_poll" => {
            let pid = uuid("poll")?;
            let n = sqlx::query("update e_broadcast_poll set status = 'Closed' where tenant_id = $1 and broadcast = $2 and id = $3 and status = 'Open'")
                .bind(sys.tenant)
                .bind(id)
                .bind(pid)
                .execute(&mut **tx)
                .await?
                .rows_affected();
            json!({"poll": pid, "closed": n == 1})
        }
        "questions" => {
            let rows: Vec<(Uuid, String, Option<String>, String)> = sqlx::query_as(
                "select id, text, asker_name, status from e_broadcast_question where tenant_id = $1 and broadcast = $2 order by created_at limit 500",
            )
            .bind(sys.tenant)
            .bind(id)
            .fetch_all(&mut **tx)
            .await?;
            json!({"questions": rows.into_iter().map(|(qid, text, name, status)| json!({"id": qid, "text": text, "name": name, "status": status})).collect::<Vec<_>>()})
        }
        _ => return Ok(None),
    }))
}
