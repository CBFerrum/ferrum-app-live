// The player other apps' interfaces put beside their own content (README, "Putting the player beside other content"):
// a lesson, a product with its cart beside it, a meeting's audience view. Give it a broadcast, or the record a broadcast
// is about; it asks Live what the signed-in person may watch, draws the broadcast while it is on and says what
// the broadcast says while it is not. It has no code of the other app in it, and the other app none of Live's.
//
// By default it frames Live's public watch page (`mode="frame"`): the relay and its component then load under that page's
// own policy, not the host app's, and the host's interface needs no change to its Content-Security-Policy. The broadcast must name
// the host's origin among its frame origins. `mode="inline"` draws the player in the host's own page instead, which also
// plays a broadcast whose audience is Members; the host's manifest then has to allow the relay in `ui.csp.connect`.

import { useEffect, useRef, useState } from "react";
import { api, isolate, t } from "@ferrum/client";
import { Spinner } from "@ferrum/kit";
import { safeUrl } from "../common";
import { APP } from "../data";
import type { EmbedItem, Status } from "../model";
import { Viewer } from "../Watch";

export interface LivePlayerProps {
  /** A broadcast's id; or the record it is about (`entity` and `record`). */
  broadcast?: string;
  entity?: string;
  record?: string;
  /** A viewing link's secret, for a person with no account who holds one. */
  link?: string;
  /** `frame` (default): Live's public watch page in a frame. `inline`: the player in this page. */
  mode?: "frame" | "inline";
  /** The picture's shape as CSS `aspect-ratio`; `16 / 9` by default. Its width is always its container's. */
  aspect?: string;
  className?: string;
  /** Names the frame for assistive technology; the broadcast's title by default. */
  title?: string;
  /** How often to ask again, in seconds, until the broadcast has ended; 20 by default, 0 to ask once. */
  poll?: number;
  /** Called when what is shown changes: `none` when there is no broadcast the person may watch. */
  onStatus?: (status: Status | "none", broadcast: EmbedItem | null) => void;
  /** Called with every broadcast about the record, newest first (a lesson with several sessions). */
  onBroadcasts?: (broadcasts: EmbedItem[]) => void;
  onError?: (error: unknown) => void;
}

/** Which broadcast to show of those about a record: the one on now, else the soonest to come, else the latest. Pure. */
export function pick(list: EmbedItem[]): EmbedItem | null {
  const live = list.find((b) => b.status === "Live");
  if (live) return live;
  const next = list
    .filter((b) => b.status === "Scheduled")
    .sort((a, b) => (Date.parse(a.planned_start ?? "") || Infinity) - (Date.parse(b.planned_start ?? "") || Infinity))[0];
  return next ?? list.find((b) => b.status === "Ended") ?? list[0] ?? null;
}

type Load = { state: "loading" } | { state: "ready"; all: EmbedItem[]; shown: EmbedItem | null } | { state: "failed"; error: unknown };

export function LivePlayer({ broadcast, entity, record, link, mode = "frame", aspect = "16 / 9", className, title, poll = 20, onStatus, onBroadcasts, onError }: LivePlayerProps) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const events = useRef({ onStatus, onBroadcasts, onError });
  events.current = { onStatus, onBroadcasts, onError };
  const last = useRef<string>("");

  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      try {
        const all = broadcast
          ? [await api.get<EmbedItem>(`${APP}/broadcasts/${encodeURIComponent(broadcast)}/embed`, link ? { link } : undefined)]
          : (await api.get<{ broadcasts: EmbedItem[] }>(`${APP}/embed`, { entity, record })).broadcasts;
        if (dead) return;
        const shown = pick(all);
        setLoad({ state: "ready", all, shown });
        const key = `${shown?.id ?? ""}/${shown?.status ?? "none"}`;
        events.current.onBroadcasts?.(all);
        if (key !== last.current) {
          last.current = key;
          events.current.onStatus?.(shown?.status ?? "none", shown);
        }
        if (poll > 0 && shown?.status !== "Ended" && shown?.status !== "Cancelled") timer = setTimeout(() => void ask(), poll * 1000);
      } catch (e) {
        if (dead) return;
        setLoad({ state: "failed", error: e });
        events.current.onError?.(e);
        // A person who may not watch is told nothing exists: that is the same as none.
        if (last.current !== "/none") {
          last.current = "/none";
          events.current.onStatus?.("none", null);
        }
        if (poll > 0) timer = setTimeout(() => void ask(), poll * 1000 * 3);
      }
    };
    void ask();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, [broadcast, entity, record, link, poll]);

  const box = { aspectRatio: aspect };
  if (load.state === "loading") {
    return (
      <div className={`lv-embed ${className ?? ""}`} style={box} role="status" aria-busy="true">
        <Spinner small label={t("Loading…")} />
      </div>
    );
  }
  const b = load.state === "ready" ? load.shown : null;
  if (!b) return null;
  const page = safeUrl(b.page);
  if (b.status === "Live") {
    if (mode === "inline") return <div className={className}><Viewer id={b.id} /></div>;
    if (!page) return null;
    return (
      <iframe
        className={`lv-embed ${className ?? ""}`}
        style={{ ...box, border: 0, width: "100%" }}
        src={page}
        title={title ?? b.title ?? t("Live broadcast")}
        allow="autoplay; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  const replay = b.status === "Ended" ? safeUrl(b.replay_url) : null;
  return (
    <div className={`lv-embed lv-embed-words ${className ?? ""}`} style={box} role="status">
      <div>
        {b.title && <strong>{isolate(b.title)}</strong>}
        {b.text && <p>{isolate(b.text)}</p>}
        {replay && (
          <p>
            <a href={replay} target="_blank" rel="noopener noreferrer">
              {isolate(b.replay_text || t("Watch the replay"))}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
