// Questions and polls (src/qa.rs). A viewer asks and votes with the seat they watch from; only questions a presenter
// showed or answered come back. A presenter lists every question, shows, answers or hides it, and opens and closes a
// poll, through the broadcast's actions, so an agent does the same through the gate.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api, ApiError, isolate, t } from "@ferrum/client";
import { Alert, Button, Field, Spinner } from "@ferrum/kit";
import { act, APP } from "./data";

export interface Question {
  id: string;
  text: string;
  name: string | null;
  status: "Waiting" | "Shown" | "Answered" | "Hidden";
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  mine: number | null;
}

export interface Feed {
  questions: Question[];
  poll: Poll | null;
}

const route = (id: string, path: string) => `${APP}/broadcasts/${encodeURIComponent(id)}/${path}`;
const said = (e: unknown, otherwise: string) => (e instanceof ApiError && e.message ? e.message : otherwise);

/** The viewer's side, beside the picture while the broadcast is live. */
export function Ask({ id }: { id: string }) {
  const feed = useQuery({ queryKey: ["live", "feed", id], queryFn: () => api.post<Feed>(route(id, "feed"), {}), refetchInterval: 10_000 });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(route(id, "ask"), { text });
      setText("");
      setNote({ tone: "info", text: t("Your question was sent. The presenter decides whether to show it.") });
    } catch (err) {
      setNote({ tone: "error", text: said(err, t("Your question could not be sent.")) });
    } finally {
      setSending(false);
    }
  };

  const vote = async (poll: string, option: number) => {
    try {
      await api.post(route(id, "vote"), { poll, option });
      await feed.refetch();
    } catch (err) {
      setNote({ tone: "error", text: said(err, t("Your vote could not be counted.")) });
    }
  };

  const poll = feed.data?.poll;
  return (
    <section className="card lv-card" aria-labelledby="lv-qa">
      <h2 id="lv-qa" className="lv-h2">
        {t("Questions")}
      </h2>
      {feed.isPending && <Spinner small />}
      {feed.isError && <Alert tone="error">{said(feed.error, t("Questions cannot be shown right now."))}</Alert>}
      {poll && (
        <fieldset className="lv-poll">
          <legend>{isolate(poll.question)}</legend>
          {poll.options.map((o, i) => (
            <Button key={o} aria-pressed={poll.mine === i} disabled={poll.mine !== null} onClick={() => void vote(poll.id, i)}>
              {isolate(o)} {poll.mine !== null && <span className="muted">({poll.counts[i] ?? 0})</span>}
            </Button>
          ))}
        </fieldset>
      )}
      {feed.data && !feed.data.questions.length && <p className="muted">{t("No questions shown yet.")}</p>}
      {!!feed.data?.questions.length && (
        <ul className="lv-list">
          {feed.data.questions.map((q) => (
            <li key={q.id}>
              {isolate(q.text)} {q.name && <span className="muted">— {isolate(q.name)}</span>} {q.status === "Answered" && <span className="muted">({t("answered")})</span>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void send(e)}>
        <Field label={t("Ask a question")} htmlFor="lv-ask">
          <textarea id="lv-ask" className="input" maxLength={500} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button type="submit" loading={sending} disabled={!text.trim()}>
          {t("Send")}
        </Button>
      </form>
      {note && <Alert tone={note.tone}>{isolate(note.text)}</Alert>}
    </section>
  );
}

/** The presenter's side: every question with what may be done with it, and a poll to open or close. */
export function Moderate({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = ["live", "questions", id];
  const list = useQuery({ queryKey: key, queryFn: () => act<{ questions: Question[] }>(id, "questions"), refetchInterval: 5_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const run = async (what: string, action: string, params: object) => {
    setBusy(what);
    setError(null);
    try {
      return await act<Record<string, unknown>>(id, action, params);
    } catch (err) {
      setError(said(err, t("That could not be done.")));
      return null;
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: key });
    }
  };
  const next: Record<Question["status"], Question["status"][]> = { Waiting: ["Shown", "Answered", "Hidden"], Shown: ["Answered", "Hidden"], Answered: ["Hidden"], Hidden: [] };
  const words: Record<Question["status"], string> = { Waiting: t("Waiting"), Shown: t("Show"), Answered: t("Mark answered"), Hidden: t("Hide") };
  const seen: Record<Question["status"], string> = { Waiting: t("waiting"), Shown: t("shown"), Answered: t("answered"), Hidden: t("hidden") };

  return (
    <section className="card lv-card" aria-labelledby="lv-mod">
      <h2 id="lv-mod" className="lv-h2">
        {t("Questions from viewers")}
      </h2>
      {list.isPending && <Spinner small />}
      {list.isError && <Alert tone="error">{said(list.error, t("Questions cannot be shown right now."))}</Alert>}
      {error && <Alert tone="error">{isolate(error)}</Alert>}
      {list.data && !list.data.questions.length && <p className="muted">{t("No questions yet.")}</p>}
      {!!list.data?.questions.length && (
        <ul className="lv-list">
          {list.data.questions.map((q) => (
            <li key={q.id}>
              {isolate(q.text)} {q.name && <span className="muted">— {isolate(q.name)}</span>} <span className="muted">({seen[q.status]})</span>{" "}
              {next[q.status].map((to) => (
                <Button key={to} loading={busy === q.id + to} onClick={() => void run(q.id + to, "moderate_question", { question: q.id, to })}>
                  {words[to]}
                </Button>
              ))}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("poll", "open_poll", { question, options: answers }).then((made) => {
            if (made && typeof made.poll === "string") {
              setOpen(made.poll);
              setQuestion("");
              setAnswers("");
            }
          });
        }}
      >
        <Field label={t("Poll question")} htmlFor="lv-poll-q">
          <input id="lv-poll-q" className="input" maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </Field>
        <Field label={t("Answers, one a line")} htmlFor="lv-poll-a">
          <textarea id="lv-poll-a" className="input" rows={3} value={answers} onChange={(e) => setAnswers(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy === "poll"} disabled={!question.trim() || !answers.trim()}>
          {t("Open the poll")}
        </Button>
        {open && (
          <Button loading={busy === "close"} onClick={() => void run("close", "close_poll", { poll: open }).then((r) => r && setOpen(null))}>
            {t("Close the poll")}
          </Button>
        )}
      </form>
    </section>
  );
}
