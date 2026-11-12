// The watch page inside the shell: the broadcast for people signed in here. Before the start it shows the broadcast's
// waiting words, while it is on the picture with its controls, and after it the ended words and the replay link. A
// viewer who finds no seat is told in the server's words and may try again; access is renewed as the server says, a
// refusal is shown, a dropped connection asks for a new address, and the seat is given up when the page goes away.
// Nothing about the person goes to the relay: the address carries a token for this broadcast and nothing else.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { isolate, t } from "@ferrum/client";
import { Alert, Button, Spinner, StatePanel, useShellTitle } from "@ferrum/kit";
import { safeUrl } from "./common";
import { Controls } from "./Controls";
import { describeQuery } from "./data";
import type { SessionState } from "./session";
import { Stage } from "./Stage";
import { clock, moment, span } from "./time";
import { useNow, useSession } from "./useSession";

export function WatchRoute() {
  const { id = "" } = useParams();
  return <Watch key={id} id={id} />;
}

/** What a refused renewal or a lost connection says to a viewer, in words; null when all is well. */
export function viewerNote(s: Pick<SessionState, "renewal" | "message" | "expiresAt" | "reconnecting" | "link" | "nextRenewal">, now: number): { tone: "warning" | "error"; text: string } | null {
  if (s.renewal === "refused") {
    return { tone: "error", text: `${s.message ? `${s.message} ` : ""}${t("Your access was not renewed, so the picture stops at {time}.", { time: clock(s.expiresAt) })}` };
  }
  if (s.renewal === "retrying") return { tone: "warning", text: t("Could not renew your access just now. Trying again in {wait}.", { wait: span((s.nextRenewal ?? now) - now) }) };
  if (s.reconnecting || s.link === "disconnected") return { tone: "warning", text: t("The connection dropped. Reconnecting…") };
  return null;
}

export function Watch({ id }: { id: string }) {
  const info = useQuery(describeQuery(id));
  useShellTitle(info.data?.title ?? t("Watch"));
  return (
    <div className="lv-page lv-watch">
      <div className="crumbs">
        <Link to="/">{t("Live")}</Link>
      </div>
      <header className="page-head">
        <div>
          <h1 className="page-title">{info.data?.title ? isolate(info.data.title) : t("Broadcast")}</h1>
        </div>
      </header>
      <Viewer id={id} />
    </div>
  );
}

/** The player and its states for one broadcast. Also what the embeddable component draws when it is asked to play inline. */
export function Viewer({ id }: { id: string }) {
  const { session, state } = useSession("watch", id, true);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const waiting = state.phase === "full" || state.phase === "waiting" || state.phase === "offline";
  const now = useNow(1000, waiting || state.renewal === "retrying");
  const note = state.offer ? viewerNote(state, now) : null;

  switch (state.phase) {
    case "idle":
    case "connecting":
      return (
        <div className="lv-stage" role="status" aria-busy="true">
          <div className="lv-stage-note">
            <Spinner small />
            <span>{t("Connecting…")}</span>
          </div>
        </div>
      );
    case "live":
      return state.offer ? (
        <div className="stack">
          <Controls el={el}>
            <Stage offer={state.offer} label={t("The broadcast")} onElement={setEl} onLink={(l) => void session.linkChanged(l)} />
          </Controls>
          {note && (
            <Alert tone={note.tone}>
              <span role={note.tone === "error" ? "alert" : "status"}>{isolate(note.text)}</span>
            </Alert>
          )}
        </div>
      ) : null;
    case "waiting":
      return (
        <StatePanel kind="empty" title={t("Waiting for the broadcast to start")}>
          {state.waiting?.text ? <p>{isolate(state.waiting.text)}</p> : null}
          {state.waiting?.planned_start ? <p>{t("Planned for {when}.", { when: moment(state.waiting.planned_start) })}</p> : null}
          <p className="faint">{t("This page starts the picture by itself when it begins.")}</p>
        </StatePanel>
      );
    case "ended":
    case "cancelled": {
      const replay = safeUrl(state.waiting?.replay_url);
      return (
        <StatePanel kind="empty" title={state.phase === "cancelled" ? t("This broadcast was cancelled") : t("This broadcast has ended")}>
          {state.waiting?.text ? <p>{isolate(state.waiting.text)}</p> : state.message ? <p>{isolate(state.message)}</p> : null}
          {replay && (
            <p>
              <a href={replay} target="_blank" rel="noopener noreferrer">
                {isolate(state.waiting?.replay_text || t("Watch the replay"))}
              </a>
            </p>
          )}
        </StatePanel>
      );
    }
    case "full":
      return (
        <StatePanel kind="empty" title={t("No seat is free")} action={<Button variant="primary" onClick={() => void session.retry()}>{t("Try again")}</Button>}>
          {state.message ? <p>{isolate(state.message)}</p> : null}
          <p className="faint">{t("Trying again by itself in {wait}.", { wait: span((state.retryAt ?? now) - now) })}</p>
        </StatePanel>
      );
    case "offline":
      return (
        <StatePanel kind="offline" onRetry={() => void session.retry()}>
          {state.message ? <p>{isolate(state.message)}</p> : null}
        </StatePanel>
      );
    case "closed":
      return (
        <StatePanel kind="denied" title={t("You cannot watch this broadcast")} action={<Button onClick={() => void session.retry()}>{t("Try again")}</Button>}>
          {state.message ? <p>{isolate(state.message)}</p> : null}
        </StatePanel>
      );
  }
}
