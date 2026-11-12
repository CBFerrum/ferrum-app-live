// Time as the screens say it. Pure, so the words are tested without a clock; all on the workspace's clock.

import { formatMoment, t } from "@ferrum/client";

/** "13 Nov, 2:15 pm": a moment on the workspace's clock. */
export function moment(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return formatMoment(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** "2:15 pm": a time of day on the workspace's clock. */
export function clock(at: number | string | null | undefined): string {
  if (at === null || at === undefined) return "";
  const when = typeof at === "number" ? at : Date.parse(at);
  if (Number.isNaN(when)) return "";
  return formatMoment(when, { hour: "numeric", minute: "2-digit" });
}

/** "3 minutes" or "45 seconds": how long a renewal waits. */
export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return s === 1 ? t("1 second") : t("{n} seconds", { n: s });
  const m = Math.round(s / 60);
  return m === 1 ? t("1 minute") : t("{n} minutes", { n: m });
}

/** How long a broadcast has run, from its start: "1 h 12 min". */
export function running(from: string | null | undefined, now: number): string {
  const start = from ? Date.parse(from) : NaN;
  if (Number.isNaN(start) || now < start) return "";
  const minutes = Math.floor((now - start) / 60_000);
  const h = Math.floor(minutes / 60);
  return h > 0 ? t("{h} h {m} min", { h, m: minutes % 60 }) : t("{m} min", { m: minutes });
}
