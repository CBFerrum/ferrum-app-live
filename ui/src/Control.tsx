// A broadcast's control page, for its presenter: check the camera and microphone, go live, see who is watching,
// and end it. The page keeps the presenter's access renewed (README, "Tokens": two thirds of its life) and says
// so when a renewal is refused, since the stream stops when the access it was given runs out.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Square } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router";
import { ApiError, isolate, t } from "@ferrum/client";
import { Alert, Button, confirmDialog, PageLoading, LoadFailed, StatePanel, toast, useLiveEntity, useShellTitle } from "@ferrum/kit";
import { About, audienceLabel, Badge, Copyable } from "./common";
import { DeviceCheck, useCapture, useSupport, whyNot, type Chosen } from "./Capture";
import { audienceQuery, broadcastQuery, describeQuery, refresh, viewersNow, watchAddress } from "./data";
import { LinkDialog, type Kind } from "./Links";
import { chooseDevices, type PublishElement } from "./moq";
import type { Broadcast } from "./model";
import type { SessionState } from "./session";
import { Stage } from "./Stage";
import { clock, moment, running, span } from "./time";
import { useSession } from "./useSession";

export function ControlRoute() {
  const { id = "" } = useParams();
  return <Control key={id} id={id} />;
}

/** What the renewal of the presenter's access is doing, in words, and whether it needs the presenter's attention. */
export function renewalNote(s: Pick<SessionState, "renewal" | "nextRenewal" | "expiresAt" | "message" | "reconnecting" | "link">, now: number): { tone: "info" | "warning" | "error"; title: string; text: string } | null {
  if (s.renewal === "refused") {
    return {
      tone: "error",
      title: t("Your access to this broadcast was not renewed"),
      text: `${s.message ? `${s.message} ` : ""}${t("The broadcast was ended, or you may no longer present it. The stream stops at {time}.", { time: clock(s.expiresAt) })}`,
    };
  }
  if (s.renewal === "retrying") {
    return { tone: "warning", title: t("The last renewal did not get through"), text: t("Trying again in {wait}. If it cannot, the stream stops at {time}.", { wait: span((s.nextRenewal ?? now) - now), time: clock(s.expiresAt) }) };
  }
  if (s.reconnecting || s.link === "disconnected") return { tone: "warning", title: t("Reconnecting to the relay"), text: t("The connection dropped. A new address is being asked for; the picture resumes when it is back.") };
  return null;
}

function Control({ id }: { id: string }) {
  const qc = useQueryClient();
  const rec = useQuery({ ...broadcastQuery(id), refetchInterval: (q) => (q.state.data?.status === "Live" ? 15_000 : false) });
  useShellTitle(rec.data?.title ?? t("Broadcast"));
  useLiveEntity("Broadcast", () => refresh(qc, id));

  const denied = rec.error instanceof ApiError && (rec.error.status === 403 || rec.error.status === 404);
  return (
    <div className="lv-page">
      <div className="crumbs">
        <Link to="/">{t("Live")}</Link>
      </div>
      {denied ? (
        <StatePanel kind="denied" title={t("This broadcast is not yours to control")}>
          {t("Only its presenters and the people who manage broadcasts can open its control page. To watch it, use its watch page.")}
          <br />
          <Link to={`/watch/${id}`}>{t("Open the watch page")}</Link>
        </StatePanel>
      ) : rec.error ? (
        <LoadFailed error={rec.error} onRetry={() => void rec.refetch()} />
      ) : !rec.data ? (
        <PageLoading />
      ) : (
        <View b={rec.data} />
      )}
    </div>
  );
}

export function View({ b }: { b: Broadcast }) {
  const qc = useQueryClient();
  const id = b.id;
  const { session, state } = useSession("publish", id, false);
  const { env, support, ready } = useSupport();
  const verdict = useMemo(() => whyNot(env, support), [env, support]);
  const chosen = useRef<Chosen>({});
  const stop = useRef<() => void>(() => undefined);
  const capture = useCapture(
    useCallback((c: Chosen) => {
      chosen.current = c;
    }, []),
  );
  const [asking, setAsking] = useState<Kind | null>(null);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const airHead = useRef<HTMLHeadingElement>(null);

  const over = b.status === "Ended" || b.status === "Cancelled";
  const onAir = state.phase === "live" && !!state.offer;
  const live = b.status === "Live";

  // The button that was pressed is gone once the picture is on: focus goes to what replaced it.
  useEffect(() => {
    if (onAir) airHead.current?.focus();
  }, [onAir]);

  // A clock for the "renews in" and "running for" words.
  useEffect(() => {
    if (!onAir && !live) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [onAir, live]);

  // Viewers now: the report counts live seats; asked again while the broadcast is on.
  const audience = useQuery({ ...audienceQuery, enabled: live, refetchInterval: live ? 15_000 : false });
  const watching = viewersNow(audience.data, b);
  const page = useQuery({ ...describeQuery(id), enabled: !over });

  // Leaving the page while on air stops the picture; the broadcast stays live until it is ended or its access runs out.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => onAir && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirmDialog({
      title: t("Leave while you are on air?"),
      message: t("Your picture stops when you leave this page. The broadcast stays live until you end it from here or its access runs out."),
      confirmLabel: t("Leave"),
      cancelLabel: t("Stay"),
      danger: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker]);

  useEffect(() => {
    if (state.phase === "ended") refresh(qc, id);
  }, [state.phase, qc, id]);

  const go = async () => {
    setStarting(true);
    setRefused(null);
    capture.release();
    await session.start();
    setStarting(false);
    refresh(qc, id);
  };
  const end = async () => {
    const ok = await confirmDialog({
      title: t("End “{value}”?", { value: b.title }),
      message: t("Viewers lose the stream when their access runs out, within minutes. This cannot be undone: a broadcast that has ended cannot be started again."),
      confirmLabel: t("End the broadcast"),
      cancelLabel: t("Keep going"),
      danger: true,
    });
    if (!ok) return;
    setEnding(true);
    const r = await session.end();
    setEnding(false);
    if (r.ok) {
      refresh(qc, id);
      toast(t("The broadcast has ended"));
    } else setRefused(r.message ?? t("The broadcast could not be ended. Try again."));
  };

  const note = onAir ? renewalNote(state, now) : null;
  const goNote = state.phase === "closed" || state.phase === "offline" || state.phase === "ended" ? state.message : null;
  const startLabel = live ? t("Reconnect and go live again") : t("Go live");
  const blocked = verdict.blocks.length > 0;
  const outside = page.data?.page;
  const reaches = b.audience === "Link" || b.audience === "Public" || b.audience === "Portal";

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">{isolate(b.title)}</h1>
          <p className="page-sub">
            <Badge status={b.status} /> <About b={b} />
            {b.planned_start && !live && !over ? ` · ${t("Planned for {when}", { when: moment(b.planned_start) })}` : ""}
          </p>
        </div>
        <div className="page-actions">
          {live && (
            <Link className="btn btn-default btn-md" to={`/watch/${id}`}>
              {t("Watch page")}
            </Link>
          )}
          {onAir && (
            <Button variant="danger" loading={ending} icon="x" onClick={() => void end()}>
              {t("End broadcast")}
            </Button>
          )}
        </div>
      </header>

      {refused && <Alert tone="error">{isolate(refused)}</Alert>}

      {over ? (
        <StatePanel kind="empty" icon={Square} title={b.status === "Ended" ? t("This broadcast has ended") : t("This broadcast was cancelled")}>
          {b.status === "Ended" && b.viewers_total !== undefined && b.viewers_total !== null
            ? t("{total} people watched it, at most {peak} at once.", { total: b.viewers_total ?? 0, peak: b.viewers_peak ?? 0 })
            : ""}
          {b.status === "Ended" && b.replay_url && (
            <>
              {" "}
              <a href={b.replay_url} target="_blank" rel="noopener noreferrer">
                {t("Watch the replay")}
              </a>
            </>
          )}
        </StatePanel>
      ) : (
        <div className="lv-grid">
          <div className="lv-main">
            {onAir && state.offer ? (
              <section className="card lv-card" aria-labelledby="lv-air">
                <h2 id="lv-air" className="lv-h2" tabIndex={-1} ref={airHead}>
                  <Radio size={16} aria-hidden="true" /> {t("You are on air")}
                </h2>
                <Stage
                  offer={state.offer}
                  label={t("What you are sending")}
                  onLink={(l) => void session.linkChanged(l)}
                  onElement={(el) => {
                    stop.current();
                    stop.current = el ? chooseDevices(el as PublishElement, chosen.current) : () => undefined;
                  }}
                />
                {note && (
                  <Alert tone={note.tone}>
                    <strong>{note.title}.</strong> {isolate(note.text)}
                  </Alert>
                )}
                {!note && state.nextRenewal && <p className="muted">{t("Your access renews itself at {time}. Leave this page open.", { time: clock(state.nextRenewal) })}</p>}
              </section>
            ) : (
              <>
                {blocked && (
                  <Alert tone="error">
                    <strong>{t("This browser cannot present.")}</strong>
                    <ul className="lv-list">
                      {verdict.blocks.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                    {t("Open this page in a current Chrome or Edge on a computer, or send the broadcast a presenter link to use elsewhere.")}
                  </Alert>
                )}
                {!blocked && verdict.notes.length > 0 && (
                  <Alert tone="warning">
                    <ul className="lv-list">
                      {verdict.notes.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <DeviceCheck capture={capture} disabled={blocked} />
                {goNote && <Alert tone="error">{isolate(goNote)}</Alert>}
                {state.phase === "ended" && !goNote && <Alert tone="info">{t("The broadcast has ended.")}</Alert>}
                <div className="row">
                  <Button variant="primary" loading={starting} disabled={blocked || !ready} onClick={() => void go()}>
                    {startLabel}
                  </Button>
                  {!ready && <span className="faint">{t("Checking this browser…")}</span>}
                </div>
              </>
            )}
          </div>

          <aside className="lv-side">
            <section className="card lv-card" aria-labelledby="lv-viewers">
              <h2 id="lv-viewers" className="lv-h2">
                {t("Viewers now")}
              </h2>
              <p className="lv-figure" aria-live="polite">
                {live ? (watching === null ? "—" : watching) : 0}
              </p>
              <p className="muted">
                {live ? t("Most at once: {n}. Counted from their renewals, so it lags by a minute or so.", { n: b.viewers_peak ?? 0 }) : t("Nobody can watch until you go live.")}
              </p>
              {live && b.started_at && <p className="faint">{t("Running for {time}", { time: running(b.started_at, now) || t("under a minute") })}</p>}
              <p className="faint">{t("Who may watch: {who}", { who: audienceLabel(b.audience) })}</p>
            </section>

            <section className="card lv-card" aria-labelledby="lv-share">
              <h2 id="lv-share" className="lv-h2">
                {t("Share it")}
              </h2>
              <Field2 label={t("Watch page for people signed in here")}>
                <Copyable value={watchAddress(id)} label={t("Watch address")} />
              </Field2>
              {reaches && outside && (
                <Field2 label={t("Public page, for people outside")}>
                  <Copyable value={outside} label={t("Public address")} />
                </Field2>
              )}
              <div className="row lv-wrap">
                <Button onClick={() => setAsking("Presenter")}>{t("Make a presenter link")}</Button>
                <Button onClick={() => setAsking("Viewer")}>{t("Make a viewing link")}</Button>
              </div>
              <p className="faint">{t("A presenter link lets someone with no account present: it starts the broadcast once. Links are shown once.")}</p>
            </section>
          </aside>
        </div>
      )}
      {asking && <LinkDialog id={id} kind={asking} open onClose={() => setAsking(null)} />}
    </>
  );
}

function Field2({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lv-field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
