// The queries and calls the screens share. Keys are listed here so a change anywhere refreshes everywhere
// a broadcast is shown (live events do the same from the other side).

import type { QueryClient } from "@tanstack/react-query";
import { api, ApiError, docPath, routeBase } from "@ferrum/client";
import type { AudienceRow, Broadcast, EmbedItem, MadeLink, Settings } from "./model";
import type { Call, Reply } from "./session";

/** The app's own routes for signed-in people (README, "Routes"). */
export const APP = "/api/app/live";

export const FIELDS =
  "title,status,description,planned_start,planned_end,reference_entity,reference_id,audience,capacity,waiting_text,frame_origins,owner_email,presenter_name,started_at,ended_at,viewers_peak,viewers_total,replay_url,recording";

export const broadcastsQuery = {
  queryKey: ["live", "broadcasts"],
  queryFn: ({ signal }: { signal?: AbortSignal }) => api.get<{ rows: Broadcast[] }>("/api/v1/Broadcast", { fields: FIELDS, sort: "planned_start desc", limit: 500 }, signal).then((r) => r.rows),
};

export const broadcastQuery = (id: string) => ({
  queryKey: ["live", "broadcast", id],
  queryFn: ({ signal }: { signal?: AbortSignal }) => api.get<Broadcast>(docPath("Broadcast", id), undefined, signal),
});

/** Viewers now come from the report "Broadcasts and Their Audience", the one place the app counts live seats; its rows name no id. */
export const audienceQuery = {
  queryKey: ["live", "audience"],
  queryFn: ({ signal }: { signal?: AbortSignal }) => api.get<{ rows: AudienceRow[] }>("/api/reports/live_broadcasts", undefined, signal).then((r) => r.rows),
  retry: false,
};

/** What the embed route says of one broadcast: its title and state for anyone who may watch it (the same answer as watching). */
export const describeQuery = (id: string) => ({
  queryKey: ["live", "describe", id],
  queryFn: ({ signal }: { signal?: AbortSignal }) => api.get<EmbedItem>(`${APP}/broadcasts/${encodeURIComponent(id)}/embed`, undefined, signal),
  retry: false,
});

export const settingsQuery = {
  queryKey: ["live", "settings"],
  queryFn: ({ signal }: { signal?: AbortSignal }) => api.get<{ rows: Settings[] }>("/api/v1/LiveSettings", { limit: 1 }, signal).then((r) => r.rows[0] ?? ({} as Settings)),
};

const same = (a: string | null | undefined, b: string | null | undefined) => {
  const [x, y] = [a ? Date.parse(a) : NaN, b ? Date.parse(b) : NaN];
  return Number.isNaN(x) && Number.isNaN(y) ? true : x === y;
};

/**
 * How many people are watching a broadcast now. The report names no id, so a row is the broadcast's when its title
 * and start match; two broadcasts alike in both are not told apart, and then nothing is said rather than a guess.
 */
export function viewersNow(rows: AudienceRow[] | undefined, b: Pick<Broadcast, "title" | "status" | "started_at">): number | null {
  if (!rows || b.status !== "Live") return null;
  const hits = rows.filter((r) => r.title === b.title && r.status === "Live" && same(r.started_at, b.started_at));
  return hits.length === 1 ? hits[0].viewers_now : null;
}

/** Calls one of a broadcast's routes (`watch`, `publish/refresh`, `end`, …) and says what it answered, refusals in the server's words. */
export const callRoute =
  (id: string): Call =>
  async (path): Promise<Reply> => {
    try {
      return { ok: true, status: 200, body: await api.post<unknown>(`${APP}/broadcasts/${encodeURIComponent(id)}/${path}`, {}) };
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, status: e.status, code: e.code, message: e.message };
      return { ok: false, status: 0, message: e instanceof Error ? e.message : undefined };
    }
  };

/** A request that outlives the page, to give a seat up as it closes. */
export const beaconRoute = (id: string) => (path: string) => {
  try {
    void fetch(`${APP}/broadcasts/${encodeURIComponent(id)}/${path}`, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  } catch {
    /* the page is going; nothing more can be done */
  }
};

/** Runs one of a broadcast's actions (`call_off`, `issue_viewer_link`, `issue_publisher_link`). */
export const act = <T>(id: string, action: string, params: object = {}, key?: string) => api.post<T>(docPath("Broadcast", id, "actions", action), params, key ? { idempotencyKey: key } : undefined);

export const makeLink = (id: string, kind: "Viewer" | "Presenter", params: object, key?: string) => act<MadeLink>(id, kind === "Presenter" ? "issue_publisher_link" : "issue_viewer_link", params, key);

/** The watch page inside Ferrum for signed-in people, as an address to send. */
export const watchAddress = (id: string) => `${window.location.origin}${routeBase("live")}watch/${encodeURIComponent(id)}`;

/** Everything about broadcasts shown anywhere is read again. */
export const refresh = (qc: QueryClient, id?: string) => {
  void qc.invalidateQueries({ queryKey: ["live", "broadcasts"] });
  void qc.invalidateQueries({ queryKey: ["live", "audience"] });
  if (id) {
    void qc.invalidateQueries({ queryKey: ["live", "broadcast", id] });
    void qc.invalidateQueries({ queryKey: ["live", "describe", id] });
  }
};
