// Planning a broadcast: its title, when it is planned, the record it is about (if any), who may watch and how many.
// What the server refuses on save shows under the field it is about. The status is the app's to move: it starts Scheduled.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, ApiError, docPath, errorMessage, fromZonedInput, isolate, newKey, t } from "@ferrum/client";
import { Alert, Button, Field, useShellTitle } from "@ferrum/kit";
import { LinkInput, useMetaIndex } from "@ferrum/records";
import { AUDIENCES, audienceLabel } from "./common";
import { settingsQuery } from "./data";
import type { Audience, Broadcast } from "./model";

export interface Draft {
  title: string;
  description: string;
  starts: string;
  ends: string;
  entity: string;
  record: string | null;
  audience: "" | Audience;
  capacity: string;
  waiting: string;
  frames: string;
}

export const EMPTY: Draft = { title: "", description: "", starts: "", ends: "", entity: "", record: null, audience: "", capacity: "", waiting: "", frames: "" };

/** The body of the create call; empty fields are left out, so Live Settings' defaults apply. */
export function bodyOf(d: Draft): Record<string, unknown> {
  const text = (v: string) => v.trim() || undefined;
  const capacity = d.capacity.trim() ? Number(d.capacity) : undefined;
  return {
    title: d.title.trim(),
    description: text(d.description),
    planned_start: d.starts ? (fromZonedInput(d.starts) ?? undefined) : undefined,
    planned_end: d.ends ? (fromZonedInput(d.ends) ?? undefined) : undefined,
    reference_entity: d.entity && d.record ? d.entity : undefined,
    reference_id: d.entity && d.record ? d.record : undefined,
    audience: d.audience || undefined,
    capacity,
    waiting_text: text(d.waiting),
    frame_origins: text(d.frames),
  };
}

/** What can be said before asking the server: the title, an end after the start, a whole capacity, a record chosen for a type chosen. */
export function problems(d: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  if (!d.title.trim()) out.title = t("Give the broadcast a title.");
  if (d.starts && d.ends && d.ends < d.starts) out.planned_end = t("The end must be after the start.");
  if (d.capacity.trim() && !/^\d+$/.test(d.capacity.trim())) out.capacity = t("A whole number of viewers, or leave it empty.");
  if (d.entity && !d.record) out.reference_id = t("Choose the record, or choose “Nothing” to plan a broadcast of its own.");
  return out;
}

export function NewBroadcast() {
  useShellTitle(t("New broadcast"));
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // Another app may send a person here with `?entity=Lesson&record={id}`: the broadcast is about that record.
  const [d, setD] = useState<Draft>({ ...EMPTY, entity: sp.get("entity") ?? "", record: sp.get("record") });
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [tried, setTried] = useState(false);
  const index = useMetaIndex().data;
  const settings = useQuery(settingsQuery).data;
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));

  const local = tried ? problems(d) : {};
  const fromServer: Record<string, string> = {};
  if (error instanceof ApiError) for (const f of error.fields) fromServer[f.field] = f.message;
  const err = (name: string) => local[name] ?? fromServer[name];
  const general = error && !(error instanceof ApiError && error.fields.length) ? (typeof error === "string" ? error : errorMessage(error)) : null;
  const entities = (index?.entities ?? []).filter((e) => (e.kind === "master" || e.kind === "document") && e.name !== "Broadcast" && e.name !== "BroadcastLink");

  const create = async () => {
    setTried(true);
    if (Object.keys(problems(d)).length) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api.post<Broadcast>(docPath("Broadcast"), bodyOf(d), { idempotencyKey: key });
      navigate(`/b/${made.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e : errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="lv-page lv-narrow">
      <div className="crumbs">
        <Link to="/">{t("Live")}</Link>
      </div>
      <h1 className="page-title">{t("New broadcast")}</h1>
      <p className="page-sub">{t("Plan it now; its presenter goes live from its page when the time comes.")}</p>

      <form
        className="card lv-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        {general && <Alert tone="error">{isolate(general)}</Alert>}
        <Field label={t("Title")} htmlFor="lv-title" required error={err("title")}>
          <input id="lv-title" className="input" value={d.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={t("What it is about")} htmlFor="lv-description" error={err("description")}>
          <textarea id="lv-description" className="textarea" rows={3} maxLength={5000} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="lv-two">
          <Field label={t("Starts")} htmlFor="lv-starts" error={err("planned_start")} hint={t("On the workspace’s clock. Leave it empty if the time is not fixed.")}>
            <input id="lv-starts" type="datetime-local" className="input" value={d.starts} onChange={(e) => set({ starts: e.target.value })} />
          </Field>
          <Field label={t("Ends")} htmlFor="lv-ends" error={err("planned_end")}>
            <input id="lv-ends" type="datetime-local" className="input" value={d.ends} onChange={(e) => set({ ends: e.target.value })} />
          </Field>
        </div>

        <fieldset className="lv-group">
          <legend>{t("Attached to a record")}</legend>
          <div className="lv-two">
            <Field label={t("Kind of record")} htmlFor="lv-entity" hint={t("A lesson, a product, a meeting. Who can watch follows who can read that record.")}>
              <select id="lv-entity" className="select" value={d.entity} onChange={(e) => set({ entity: e.target.value, record: null })}>
                <option value="">{t("Nothing: a broadcast of its own")}</option>
                {d.entity && !entities.some((e) => e.name === d.entity) && <option value={d.entity}>{isolate(d.entity)}</option>}
                {entities.map((e) => (
                  <option key={e.name} value={e.name}>
                    {isolate(e.label)}
                  </option>
                ))}
              </select>
            </Field>
            {d.entity && (
              <Field label={t("Record")} htmlFor="lv-record" error={err("reference_id")}>
                <LinkInput id="lv-record" to={d.entity} value={d.record} onChange={(id) => set({ record: id })} label={t("Record")} />
              </Field>
            )}
          </div>
        </fieldset>

        <div className="lv-two">
          <Field label={t("Who may watch")} htmlFor="lv-audience" error={err("audience")} hint={t("Each choice includes the ones before it.")}>
            <select id="lv-audience" className="select" value={d.audience} onChange={(e) => set({ audience: e.target.value as Draft["audience"] })}>
              <option value="">{t("As Live Settings say ({value})", { value: audienceLabel(settings?.default_audience) })}</option>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {audienceLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Most viewers at once")} htmlFor="lv-capacity" error={err("capacity")} hint={t("Empty: as Live Settings say. 0 means no limit.")}>
            <input id="lv-capacity" className="input" inputMode="numeric" value={d.capacity} onChange={(e) => set({ capacity: e.target.value })} />
          </Field>
        </div>
        <Field label={t("Words shown before it starts")} htmlFor="lv-waiting" error={err("waiting_text")} hint={t("Empty: the words in Live Settings.")}>
          <textarea id="lv-waiting" className="textarea" rows={2} maxLength={500} value={d.waiting} onChange={(e) => set({ waiting: e.target.value })} />
        </Field>
        <Field label={t("Sites that may show it in a frame")} htmlFor="lv-frames" error={err("frame_origins")} hint={t("One address per line, such as https://shop.example.com. Empty: it cannot be framed.")}>
          <textarea id="lv-frames" className="textarea mono" rows={2} maxLength={2000} value={d.frames} onChange={(e) => set({ frames: e.target.value })} />
        </Field>

        <div className="row">
          <Button variant="primary" type="submit" loading={busy}>
            {t("Create broadcast")}
          </Button>
          <Link className="btn btn-default btn-md" to="/">
            {t("Cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
