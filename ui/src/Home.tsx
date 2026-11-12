// Live's home: the broadcasts that are on now, those still to come and those that have ended, each with where it
// stands, the record it is about, who may watch, how many are watching now and the most there were.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Radio } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, errorMessage, isolate, t } from "@ferrum/client";
import { Button, confirmDialog, ListSkeleton, ScrollRegion, LoadFailed, StatePanel, TabPanel, Tabs, toast, useLiveEntity, useShellTitle } from "@ferrum/kit";
import { can, useEntityMeta } from "@ferrum/records";
import { About, audienceLabel, Badge } from "./common";
import { act, audienceQuery, broadcastsQuery, refresh, viewersNow } from "./data";
import type { Broadcast } from "./model";
import { moment } from "./time";

export type Tab = "live" | "upcoming" | "ended";

const at = (iso: string | null | undefined, none: number) => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? none : n;
};

/** Which tab a broadcast is on, from its status (a cancelled one is over). */
export const tabOf = (b: Pick<Broadcast, "status">): Tab => (b.status === "Live" ? "live" : b.status === "Scheduled" ? "upcoming" : "ended");

/** The broadcasts of each tab in the order that helps: what is on, the soonest first, the latest ended first. */
export function split(rows: Broadcast[]): Record<Tab, Broadcast[]> {
  const out: Record<Tab, Broadcast[]> = { live: [], upcoming: [], ended: [] };
  for (const b of rows) out[tabOf(b)].push(b);
  out.live.sort((a, b) => at(b.started_at, 0) - at(a.started_at, 0));
  out.upcoming.sort((a, b) => at(a.planned_start, Infinity) - at(b.planned_start, Infinity));
  out.ended.sort((a, b) => at(b.ended_at ?? b.planned_start, 0) - at(a.ended_at ?? a.planned_start, 0));
  return out;
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));

export function BroadcastTable({ rows, tab, now, onCancel, busy }: { rows: Broadcast[]; tab: Tab; now: Parameters<typeof viewersNow>[0]; onCancel: (b: Broadcast) => void; busy: string | null }) {
  const when = tab === "ended" ? t("Ended") : tab === "live" ? t("Started") : t("Planned for");
  return (
    <ScrollRegion label={t("Broadcasts")}>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t("Broadcast")}</th>
            <th scope="col">{t("Status")}</th>
            <th scope="col">{t("About")}</th>
            <th scope="col">{t("Audience")}</th>
            <th scope="col">{when}</th>
            {tab !== "upcoming" && <th scope="col" className="num">{t("Viewers now")}</th>}
            {tab !== "upcoming" && <th scope="col" className="num">{t("Peak")}</th>}
            <th scope="col">
              <span className="sr-only">{t("Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const shown = tab === "ended" ? b.ended_at ?? b.planned_start : tab === "live" ? b.started_at : b.planned_start;
            return (
              <tr key={b.id}>
                <th scope="row" className="lv-title">
                  <Link to={`/b/${b.id}`}>{isolate(b.title)}</Link>
                </th>
                <td>
                  <Badge status={b.status} />
                </td>
                <td>
                  <About b={b} />
                </td>
                <td>{audienceLabel(b.audience)}</td>
                <td>{moment(shown) || <span className="faint">{t("Not planned")}</span>}</td>
                {tab !== "upcoming" && <td className="num">{num(viewersNow(now, b))}</td>}
                {tab !== "upcoming" && <td className="num">{num(b.viewers_peak ?? 0)}</td>}
                <td>
                  <div className="row-actions">
                    {b.status === "Live" && (
                      <Link className="btn btn-default btn-sm" to={`/watch/${b.id}`}>
                        {t("Watch")}
                      </Link>
                    )}
                    {(b.status === "Live" || b.status === "Scheduled") && (
                      <Link className="btn btn-default btn-sm" to={`/b/${b.id}`}>
                        {b.status === "Live" ? t("Control") : t("Open")}
                      </Link>
                    )}
                    {b.status === "Ended" && b.replay_url && (
                      <a className="btn btn-default btn-sm" href={b.replay_url} target="_blank" rel="noopener noreferrer">
                        {t("Replay")}
                      </a>
                    )}
                    {b.status === "Scheduled" && (
                      <Button size="sm" loading={busy === b.id} disabled={busy !== null} onClick={() => onCancel(b)}>
                        {t("Cancel")}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function Home() {
  useShellTitle(t("Live"));
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const meta = useEntityMeta("Broadcast").data;
  const list = useQuery(broadcastsQuery);
  const rows = useMemo(() => split(list.data ?? []), [list.data]);
  const anyLive = rows.live.length > 0;
  // Viewers now is a bonus: the broadcasts are listed when it cannot be read; it is asked again while one is on.
  const audience = useQuery({ ...audienceQuery, enabled: anyLive, refetchInterval: anyLive ? 15_000 : false });
  useLiveEntity("Broadcast", () => refresh(qc));

  const tab = ((): Tab => {
    const asked = sp.get("tab");
    if (asked === "live" || asked === "upcoming" || asked === "ended") return asked;
    return anyLive ? "live" : rows.upcoming.length || !rows.ended.length ? "upcoming" : "ended";
  })();
  const [busy, setBusy] = useState<string | null>(null);

  const cancel = async (b: Broadcast) => {
    const ok = await confirmDialog({ title: t("Cancel “{value}”?", { value: b.title }), message: t("It will not take place, and nobody can watch it. A cancelled broadcast stays in the list."), confirmLabel: t("Cancel the broadcast"), cancelLabel: t("Keep it"), danger: true });
    if (!ok) return;
    setBusy(b.id);
    try {
      await act(b.id, "call_off");
      refresh(qc, b.id);
      toast(t("Cancelled"));
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const canCreate = can(meta?.permissions, "create");
  const denied = list.error instanceof ApiError && list.error.status === 403;
  const shown = rows[tab];
  const count = (k: Tab) => (list.data ? rows[k].length : undefined);

  return (
    <div className="lv-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{t("Live")}</h1>
          <p className="page-sub" aria-live="polite">
            {list.data ? (anyLive ? t("{n} on now", { n: rows.live.length }) : t("Nothing is on now")) : " "}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-default btn-md" to="/settings">
            {t("Settings")}
          </Link>
          {canCreate && (
            <Link className="btn btn-primary btn-md" to="/new">
              <Plus size={16} aria-hidden="true" />
              {t("New broadcast")}
            </Link>
          )}
        </div>
      </header>

      {denied ? (
        <StatePanel kind="denied" title={t("Broadcasts are for people with the Live User role")}>
          {t("If someone sent you the address of a broadcast, open it to watch. To plan broadcasts, ask an administrator of this workspace for the role.")}
        </StatePanel>
      ) : list.error ? (
        <LoadFailed error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <ListSkeleton rows={4} />
      ) : !list.data.length ? (
        <StatePanel
          kind="empty"
          title={t("No broadcasts yet")}
          action={
            canCreate && (
              <Link className="btn btn-primary btn-md" to="/new">
                <Plus size={16} aria-hidden="true" />
                {t("Plan your first broadcast")}
              </Link>
            )
          }
        >
          {t("Plan a broadcast, alone or about a record such as a lesson or a product, and go live from its page.")}
        </StatePanel>
      ) : (
        <>
          <Tabs
            id="lv-tabs"
            value={tab}
            onChange={(v) => setSp({ tab: v }, { replace: true })}
            tabs={[
              { id: "live", label: <TabLabel text={t("Live now")} n={count("live")} /> },
              { id: "upcoming", label: <TabLabel text={t("Upcoming")} n={count("upcoming")} /> },
              { id: "ended", label: <TabLabel text={t("Ended")} n={count("ended")} /> },
            ]}
          />
          <TabPanel id="lv-tabs" tab={tab}>
            {shown.length ? (
              <BroadcastTable rows={shown} tab={tab} now={audience.data} onCancel={(b) => void cancel(b)} busy={busy} />
            ) : (
              <StatePanel kind="empty" icon={Radio} title={emptyTitle(tab)}>
                {emptyHint(tab)}
              </StatePanel>
            )}
          </TabPanel>
        </>
      )}
    </div>
  );
}

function TabLabel({ text, n }: { text: string; n: number | undefined }) {
  return (
    <>
      {text}
      {n !== undefined && <span className="lv-count">{n}</span>}
    </>
  );
}

const emptyTitle = (tab: Tab) => (tab === "live" ? t("Nothing is on now") : tab === "upcoming" ? t("Nothing is planned") : t("Nothing has ended yet"));
const emptyHint = (tab: Tab) =>
  tab === "live" ? t("A broadcast shows here from the moment its presenter goes live.") : tab === "upcoming" ? t("Plan a broadcast to see it here until it starts.") : t("Broadcasts that have ended or were cancelled stay here, with their audience.");
