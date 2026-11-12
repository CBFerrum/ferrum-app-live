// Links for people who are not signed in: a viewing link for a broadcast whose audience reaches anyone with one, and
// a presenter link for an outside presenter. The server keeps only a hash of the secret, so the address is shown
// once, here, as the answer comes back; closing the dialog forgets it.

import { useState } from "react";
import { ApiError, errorMessage, isolate, newKey, t } from "@ferrum/client";
import { Alert, Button, Dialog, Field } from "@ferrum/kit";
import { Copyable } from "./common";
import { makeLink } from "./data";
import type { MadeLink } from "./model";
import { moment } from "./time";

export type Kind = "Viewer" | "Presenter";

/** The body of the action: a presenter link needs a name; days are 1 to 90 (7 when empty). */
export function paramsOf(kind: Kind, f: { name: string; email: string; label: string; days: string }): { params?: Record<string, unknown>; problems: Record<string, string> } {
  const problems: Record<string, string> = {};
  const days = f.days.trim() ? Number(f.days) : undefined;
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 90)) problems.days = t("A whole number of days from 1 to 90.");
  if (kind === "Presenter" && !f.name.trim()) problems.presenter_name = t("Who will present?");
  if (Object.keys(problems).length) return { problems };
  const text = (v: string) => v.trim() || undefined;
  return { problems, params: kind === "Presenter" ? { presenter_name: f.name.trim(), presenter_email: text(f.email), days } : { label: text(f.label), days } };
}

export function LinkDialog({ id, kind, open, onClose }: { id: string; kind: Kind; open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: "", email: "", label: "", days: "" });
  const [made, setMade] = useState<MadeLink | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);
  const presenter = kind === "Presenter";

  const close = () => {
    setKey(newKey()); // the next link is a new request, not a repeat of this one
    setMade(null);
    setError(null);
    setF({ name: "", email: "", label: "", days: "" });
    onClose();
  };
  const make = async () => {
    const r = paramsOf(kind, f);
    setProblems(r.problems);
    if (!r.params) return;
    setBusy(true);
    setError(null);
    try {
      setMade(await makeLink(id, kind, r.params, key));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const fields: Record<string, string> = { ...problems };
  if (error instanceof ApiError) for (const x of error.fields) fields[x.field] = x.message;
  const general = error && !(error instanceof ApiError && error.fields.length) ? errorMessage(error) : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={presenter ? t("Make a presenter link") : t("Make a viewing link")}
      description={presenter ? t("For a presenter who has no account here: it starts this broadcast once, then renews while it is live.") : t("For people with no account here, when the audience is “Anyone with a link” or wider.")}
      footer={
        made ? (
          <Button variant="primary" onClick={close}>
            {t("Done")}
          </Button>
        ) : (
          <>
            <Button onClick={close}>{t("Cancel")}</Button>
            <Button variant="primary" loading={busy} onClick={() => void make()}>
              {t("Make the link")}
            </Button>
          </>
        )
      }
    >
      {made ? (
        <div className="stack">
          <Alert tone="warning">{t("This address is shown once. Copy it now: it cannot be shown again, only replaced by a new link.")}</Alert>
          {made.url ? <Copyable value={made.url} label={t("Address")} /> : <p>{t("This server knows no public address for the workspace, so the address cannot be built. The secret is below; put it after “#k=” on the page’s address.")}</p>}
          {!made.url && <Copyable value={made.secret} label={t("Secret")} />}
          <p className="muted">{t("It works until {when}, or until you revoke it.", { when: moment(made.expires_at) })}</p>
        </div>
      ) : (
        <div className="stack">
          {general && <Alert tone="error">{isolate(general)}</Alert>}
          {presenter ? (
            <>
              <Field label={t("Presenter")} htmlFor="lv-l-name" required error={fields.presenter_name}>
                <input id="lv-l-name" className="input" value={f.name} maxLength={140} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field label={t("Presenter’s address")} htmlFor="lv-l-email" error={fields.presenter_email} hint={t("Only to know who presented.")}>
                <input id="lv-l-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label={t("For")} htmlFor="lv-l-label" error={fields.label} hint={t("Who or what it is for, to find it again.")}>
              <input id="lv-l-label" className="input" value={f.label} maxLength={140} onChange={(e) => setF({ ...f, label: e.target.value })} />
            </Field>
          )}
          <Field label={t("Valid for (days)")} htmlFor="lv-l-days" error={fields.days} hint={t("Empty: 7 days. At most 90.")}>
            <input id="lv-l-days" className="input" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
