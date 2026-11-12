// Live Settings: the relay's address, its signing key (written, never read back), how long tokens live, the defaults for
// audience and capacity, and replay retention. The wording the pages show is edited in the records form (the link at
// the end): it is a dozen sentences, not a screen. What the server refuses on save shows under the setting it is about.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { api, ApiError, docPath, errorMessage, isolate, newKey, t } from "@ferrum/client";
import { Alert, Button, confirmDialog, Field, FormSkeleton, LoadFailed, StatePanel, toast, useShellTitle } from "@ferrum/kit";
import { can, useEntityMeta } from "@ferrum/records";
import { AUDIENCES, audienceLabel } from "./common";
import { settingsQuery } from "./data";
import type { Audience, Settings } from "./model";
import { moment } from "./time";

/** The package's own defaults (`packages/live/entities/live.yaml`): what applies while a setting is empty. */
export const DEFAULTS = { watch_token_minutes: 10, publish_token_minutes: 60, default_audience: "Members" as Audience, default_capacity: 0, recording_default: false, retention_days: 30 };

export interface Draft {
  relay_url: string;
  relay_check_url: string;
  watch_token_minutes: string;
  publish_token_minutes: string;
  default_audience: Audience;
  default_capacity: string;
  recording_default: boolean;
  replay_base_url: string;
  retention_days: string;
  player_module_url: string;
  publisher_module_url: string;
}

const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));

export function draftOf(s: Settings, defaults: Partial<Record<keyof Draft, unknown>> = {}): Draft {
  const d = (k: keyof Draft, own: unknown) => str(own, str(defaults[k]));
  return {
    relay_url: str(s.relay_url),
    relay_check_url: str(s.relay_check_url),
    watch_token_minutes: d("watch_token_minutes", s.watch_token_minutes ?? DEFAULTS.watch_token_minutes),
    publish_token_minutes: d("publish_token_minutes", s.publish_token_minutes ?? DEFAULTS.publish_token_minutes),
    default_audience: s.default_audience ?? ((defaults.default_audience as Audience | undefined) || DEFAULTS.default_audience),
    default_capacity: d("default_capacity", s.default_capacity ?? DEFAULTS.default_capacity),
    recording_default: s.recording_default ?? Boolean(defaults.recording_default ?? DEFAULTS.recording_default),
    replay_base_url: str(s.replay_base_url),
    retention_days: d("retention_days", s.retention_days ?? DEFAULTS.retention_days),
    player_module_url: d("player_module_url", s.player_module_url),
    publisher_module_url: d("publisher_module_url", s.publisher_module_url),
  };
}

const whole = (v: string, lo: number, hi: number) => /^\d+$/.test(v.trim()) && Number(v) >= lo && Number(v) <= hi;
const web = (v: string, https: boolean) => {
  try {
    const u = new URL(v.trim());
    return https ? u.protocol === "https:" : u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/** What can be said before asking the server. Limits are the ones the settings clamp to (src/settings.rs). */
export function problems(d: Draft): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {};
  if (d.relay_url.trim() && !web(d.relay_url, false)) out.relay_url = t("An address starting with https://, such as https://live.example.com.");
  if (d.relay_check_url.trim() && !web(d.relay_check_url, false)) out.relay_check_url = t("An address starting with https://, or leave it empty.");
  if (!whole(d.watch_token_minutes, 1, 60)) out.watch_token_minutes = t("A whole number of minutes from 1 to 60.");
  if (!whole(d.publish_token_minutes, 5, 720)) out.publish_token_minutes = t("A whole number of minutes from 5 to 720.");
  if (!whole(d.default_capacity, 0, 10_000_000)) out.default_capacity = t("A whole number of viewers, or 0 for no limit.");
  if (!whole(d.retention_days, 1, 3650)) out.retention_days = t("A whole number of days from 1 to 3650.");
  if (d.replay_base_url.trim() && !web(d.replay_base_url, false)) out.replay_base_url = t("An address starting with https://, or leave it empty.");
  for (const k of ["player_module_url", "publisher_module_url"] as const) if (d[k].trim() && !web(d[k], true)) out[k] = t("An https address, or leave it empty for the bundled copy.");
  return out;
}

/** The body of the save: numbers as numbers, empty addresses left out. */
export function bodyOf(d: Draft): Record<string, unknown> {
  const text = (v: string) => v.trim() || undefined;
  return {
    relay_url: text(d.relay_url),
    relay_check_url: text(d.relay_check_url),
    watch_token_minutes: Number(d.watch_token_minutes),
    publish_token_minutes: Number(d.publish_token_minutes),
    default_audience: d.default_audience,
    default_capacity: Number(d.default_capacity),
    recording_default: d.recording_default,
    replay_base_url: text(d.replay_base_url),
    retention_days: Number(d.retention_days),
    player_module_url: text(d.player_module_url),
    publisher_module_url: text(d.publisher_module_url),
  };
}

export interface Check {
  ok: boolean;
  text: string;
}

/** What stands between a presenter and the relay, as far as the settings themselves say (the server's doctor also asks the relay). */
export function checks(s: Pick<Settings, "relay_url" | "signing_key_id" | "key_changed_at">): Check[] {
  const relay = !!s.relay_url?.trim();
  const key = !!s.signing_key_id;
  return [
    { ok: relay, text: relay ? t("The relay’s address is set.") : t("No relay address is set: nobody can be given access.") },
    { ok: key, text: key ? t("A signing key is set (named {id}{when}).", { id: s.signing_key_id ?? "", when: s.key_changed_at ? `, ${t("changed {when}", { when: moment(s.key_changed_at) })}` : "" }) : t("No signing key is set: nobody can be given access.") },
  ];
}

export function Settings() {
  useShellTitle(t("Live settings"));
  const q = useQuery(settingsQuery);
  const meta = useEntityMeta("LiveSettings").data;
  const denied = q.error instanceof ApiError && q.error.status === 403;
  return (
    <div className="lv-page lv-narrow">
      <div className="crumbs">
        <Link to="/">{t("Live")}</Link>
      </div>
      <h1 className="page-title">{t("Live settings")}</h1>
      <p className="page-sub">{t("How this workspace reaches its relay, and what broadcasts do when they say nothing.")}</p>
      {denied ? (
        <StatePanel kind="denied" title={t("Live settings are for people who manage broadcasts")}>
          {t("Ask an administrator of this workspace for the Live Manager role.")}
        </StatePanel>
      ) : q.error ? (
        <LoadFailed error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data || !meta ? (
        <FormSkeleton fields={6} />
      ) : (
        <Form key={`${q.data.id ?? "new"}-${q.data.version ?? 0}`} row={q.data} defaults={Object.fromEntries((meta.fields ?? []).map((f) => [f.name, f.default]))} writable={can(meta.permissions, "write") || (!q.data.id && can(meta.permissions, "create"))} />
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = `lv-s-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className="card lv-card" aria-labelledby={id}>
      <h2 id={id} className="lv-h2">
        {title}
      </h2>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </section>
  );
}

function Form({ row, defaults, writable }: { row: Settings; defaults: Record<string, unknown>; writable: boolean }) {
  const qc = useQueryClient();
  const [d, setD] = useState(() => draftOf(row, defaults));
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tried, setTried] = useState(false);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));

  const local = tried ? problems(d) : {};
  const remote: Record<string, string> = {};
  if (error instanceof ApiError) for (const f of error.fields) remote[f.field] = f.message;
  const err = (name: keyof Draft) => local[name] ?? remote[name];
  const general = error && !(error instanceof ApiError && error.fields.length) ? errorMessage(error) : null;
  const health = checks(row);

  /** Saves the settings; the first save makes the record (a workspace has one). */
  const save = async (): Promise<string | null> => {
    setTried(true);
    if (Object.keys(problems(d)).length) return null;
    setBusy(true);
    setError(null);
    try {
      const saved = row.id
        ? await api.patch<Settings>(docPath("LiveSettings", row.id), bodyOf(d), { ifMatch: row.version })
        : await api.post<Settings>(docPath("LiveSettings"), bodyOf(d), { idempotencyKey: key });
      void qc.invalidateQueries({ queryKey: ["live", "settings"] });
      toast(t("Saved"));
      return saved.id ?? row.id ?? null;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {general && <Alert tone="error">{isolate(general)}</Alert>}

      <Section title={t("The relay")} hint={t("The Media over QUIC relay that carries sound and pictures. Ferrum signs access to it and counts the audience; the video never passes through Ferrum.")}>
        <Field label={t("Relay address")} htmlFor="lv-relay" error={err("relay_url")} hint={t("As browsers reach it, for example https://live.example.com.")}>
          <input id="lv-relay" className="input" type="url" value={d.relay_url} disabled={!writable} onChange={(e) => set({ relay_url: e.target.value })} />
        </Field>
        <Alert tone="info">
          {t("Screens inside Ferrum may connect only to the address named in this app’s own settings, under “Relay address for browsers”. Keep that the same address.")} <Link to="/apps/live/settings">{t("Open the app’s settings")}</Link>
        </Alert>
        <Field label={t("Health address")} htmlFor="lv-check" error={err("relay_check_url")} hint={t("Where this server asks whether the relay answers. Empty: the relay address followed by /health.")}>
          <input id="lv-check" className="input" type="url" value={d.relay_check_url} disabled={!writable} onChange={(e) => set({ relay_check_url: e.target.value })} />
        </Field>
        <Health checks={health} />
      </Section>

      <KeySection row={row} ensure={save} writable={writable} />

      <Section title={t("Access")} hint={t("A token lets one person in for one broadcast, and the relay ends the session when it expires. Players renew before then.")}>
        <div className="lv-two">
          <Field label={t("Viewers’ tokens last (minutes)")} htmlFor="lv-watch-min" error={err("watch_token_minutes")} hint={t("1 to 60.")}>
            <input id="lv-watch-min" className="input" inputMode="numeric" value={d.watch_token_minutes} disabled={!writable} onChange={(e) => set({ watch_token_minutes: e.target.value })} />
          </Field>
          <Field label={t("Presenters’ tokens last (minutes)")} htmlFor="lv-pub-min" error={err("publish_token_minutes")} hint={t("5 to 720. A presenter who stops renewing is ended a minute after.")}>
            <input id="lv-pub-min" className="input" inputMode="numeric" value={d.publish_token_minutes} disabled={!writable} onChange={(e) => set({ publish_token_minutes: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title={t("Defaults for new broadcasts")} hint={t("Used by a broadcast that names nothing of its own.")}>
        <div className="lv-two">
          <Field label={t("Who may watch")} htmlFor="lv-aud" error={err("default_audience")} hint={t("Each choice includes the ones before it.")}>
            <select id="lv-aud" className="select" value={d.default_audience} disabled={!writable} onChange={(e) => set({ default_audience: e.target.value as Audience })}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {audienceLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Most viewers at once")} htmlFor="lv-cap" error={err("default_capacity")} hint={t("0 means no limit.")}>
            <input id="lv-cap" className="input" inputMode="numeric" value={d.default_capacity} disabled={!writable} onChange={(e) => set({ default_capacity: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title={t("Replay")} hint={t("The relay does not record by itself. Live keeps a link to wherever your recorder puts the segments, and clears it after the retention period.")}>
        <label className="lv-check">
          <input type="checkbox" checked={d.recording_default} disabled={!writable} onChange={(e) => set({ recording_default: e.target.checked })} />
          <span>{t("Broadcasts are recorded unless they say otherwise")}</span>
        </label>
        <Field label={t("Replay address")} htmlFor="lv-replay" error={err("replay_base_url")} hint={t("Where recorded segments are served from. An ended broadcast’s replay link is this address, its path and master.m3u8.")}>
          <input id="lv-replay" className="input" type="url" value={d.replay_base_url} disabled={!writable} onChange={(e) => set({ replay_base_url: e.target.value })} />
        </Field>
        <Field label={t("Keep replay links for (days)")} htmlFor="lv-ret" error={err("retention_days")} hint={t("1 to 3650. After that the link and the broadcast’s links are cleared, and Live says when, so what they pointed to can be deleted.")}>
          <input id="lv-ret" className="input" inputMode="numeric" value={d.retention_days} disabled={!writable} onChange={(e) => set({ retention_days: e.target.value })} />
        </Field>
      </Section>

      <Section title={t("Pages for people outside")} hint={t("The pages sent to people with no account (a presenter link, a viewing link, a public broadcast) load the player from the copy bundled with this app, served from this app’s own address. Name an address below only to serve it from elsewhere you run.")}>
        <Field label={t("Player script")} htmlFor="lv-player" error={err("player_module_url")} hint={t("Empty: the bundled copy, at the version this app was built against. An https address replaces it, and the page then allows script from that address only.")}>
          <input id="lv-player" className="input mono" type="url" value={d.player_module_url} disabled={!writable} onChange={(e) => set({ player_module_url: e.target.value })} />
        </Field>
        <Field label={t("Presenter script")} htmlFor="lv-capture" error={err("publisher_module_url")}>
          <input id="lv-capture" className="input mono" type="url" value={d.publisher_module_url} disabled={!writable} onChange={(e) => set({ publisher_module_url: e.target.value })} />
        </Field>
        {row.id && (
          <p className="muted">
            <Link to={`/e/LiveSettings/${row.id}`}>{t("Edit the words the pages show")}</Link>
          </p>
        )}
      </Section>

      {writable ? (
        <div className="row">
          <Button variant="primary" type="submit" loading={busy}>
            {t("Save settings")}
          </Button>
        </div>
      ) : (
        <Alert tone="info">{t("You can read these settings. Changing them takes the Live Manager role.")}</Alert>
      )}
    </form>
  );
}

function Health({ checks: list }: { checks: Check[] }) {
  return (
    <div className="lv-health" role="group" aria-label={t("State of the setup")}>
      <ul className="lv-checks">
        {list.map((c) => (
          <li key={c.text} className={c.ok ? "lv-ok" : "lv-bad"}>
            {c.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
            <span>
              <span className="sr-only">{c.ok ? t("Fine: ") : t("Needs attention: ")}</span>
              {c.text}
            </span>
          </li>
        ))}
      </ul>
      <p className="faint">{t("Whether the relay answers is checked by this server’s doctor (the command ferrum task doctor, and the support report). This page cannot ask it.")}</p>
    </div>
  );
}

/** The signing key is written here and never read back: the page knows only its name and when it was set. */
function KeySection({ row, ensure, writable }: { row: Settings; ensure: () => Promise<string | null>; writable: boolean }) {
  const qc = useQueryClient();
  const [material, setMaterial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = row.signing_key_id;

  const set = async () => {
    if (!material.trim()) {
      setError(t("Paste the key: the output of moq auth generate."));
      return;
    }
    const ok = await confirmDialog({
      title: current ? t("Replace the signing key?") : t("Set the signing key?"),
      message: t("Tokens signed with the new key work only where the relay’s key directory holds it. Add the new key file there first; keep the old one until its tokens expire."),
      confirmLabel: t("Set the key"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      // A workspace that never saved its settings has no record for the action to run on: the first save makes it.
      const id = row.id ?? (await ensure());
      if (!id) {
        setBusy(false);
        return;
      }
      await api.post(docPath("LiveSettings", id, "actions", "set_signing_key"), { key: material.trim() });
      setMaterial("");
      toast(t("The signing key was set"));
      void qc.invalidateQueries({ queryKey: ["live", "settings"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t("Signing key")} hint={t("The secret that signs access. It is written here and never shown again, not even to you.")}>
      <p>{current ? t("A key is set, named {id}{when}.", { id: current, when: row.key_changed_at ? `, ${t("changed {when}", { when: moment(row.key_changed_at) })}` : "" }) : t("No key is set yet.")}</p>
      <Field label={current ? t("New key") : t("Key")} htmlFor="lv-key" error={error ?? undefined} hint={t("As moq auth generate writes it: an HS256 key with an id.")}>
        <textarea id="lv-key" className="textarea mono" rows={3} autoComplete="off" spellCheck={false} value={material} disabled={!writable} onChange={(e) => setMaterial(e.target.value)} />
      </Field>
      <div className="row">
        <Button loading={busy} disabled={!writable || !material.trim()} onClick={() => void set()}>
          {current ? t("Replace the key") : t("Set the key")}
        </Button>
      </div>
    </Section>
  );
}
