// Small things every screen of Live uses: a status as a badge (from the status id, never from its label),
// the audience in words, a copyable address, and what a broadcast is about.

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { t, isolate } from "@ferrum/client";
import { Button, StatusBadge, toast, type Tone } from "@ferrum/kit";
import { useLinkTitle } from "@ferrum/records";
import type { Audience, Broadcast, Status } from "./model";

export const TONES: Readonly<Record<Status, Tone>> = { Scheduled: "blue", Live: "green", Ended: "neutral", Cancelled: "amber" };

export function statusLabel(s: Status): string {
  switch (s) {
    case "Scheduled":
      return t("Scheduled");
    case "Live":
      return t("Live");
    case "Ended":
      return t("Ended");
    case "Cancelled":
      return t("Cancelled");
  }
}

export const Badge = ({ status }: { status: Status }) => <StatusBadge value={status} tones={TONES} label={statusLabel(status)} />;

export function audienceLabel(a: Audience | null | undefined, fallback?: Audience | null): string {
  switch (a ?? fallback) {
    case "Portal":
      return t("Portal people");
    case "Link":
      return t("Anyone with a link");
    case "Public":
      return t("Anyone");
    default:
      return t("Signed-in people");
  }
}

export const AUDIENCES: Audience[] = ["Members", "Portal", "Link", "Public"];

/** The record a broadcast is about, by its title, opening where the person's apps show it; "On its own" when it names none. */
export function About({ b }: { b: Pick<Broadcast, "reference_entity" | "reference_id"> }) {
  const title = useLinkTitle(b.reference_entity ?? "", b.reference_id ?? null);
  if (!b.reference_entity || !b.reference_id) return <span className="faint">{t("On its own")}</span>;
  return (
    <a href={`/open/${encodeURIComponent(b.reference_entity)}/${encodeURIComponent(b.reference_id)}`}>
      <span className="faint">{isolate(b.reference_entity)} · </span>
      {title ? isolate(title) : "…"}
    </a>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** An address shown whole, selectable, with a button that copies it. */
export function Copyable({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="lv-copy">
      <input className="input mono" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button
        aria-label={t("Copy {what}", { what: label })}
        onClick={async () => {
          if (await copyText(value)) {
            setDone(true);
            toast(t("Copied"));
            setTimeout(() => setDone(false), 2500);
          } else toast(t("Select the address and copy it by hand"), "error");
        }}
      >
        {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {done ? t("Copied") : t("Copy")}
      </Button>
    </div>
  );
}

/** An address from the server that is safe to put in a link: http or https only. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
