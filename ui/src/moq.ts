// Drawing the two elements and reaching into them. Everything the page knows about a component's insides
// (signals for the connection, the caption renditions, the devices) is read here, defensively: the
// component is before 1.0 and its attributes are the contract this app relies on (docs/moq.md).

import type { ElementSpec, Offer } from "./model";
import type { Link } from "./session";

/** The part of `<moq-watch>` the controls use (js/watch/element.d.ts at 0.6.6). */
export interface WatchElement extends HTMLElement {
  paused: boolean;
  muted: boolean;
  volume: number;
  captions: string | undefined;
  text?: { out?: { available?: Signal<Record<string, unknown>> } };
  connection?: { status?: Signal<Link> };
}

interface Signal<T> {
  peek(): T;
  watch(fn: (v: T) => void): () => void;
}

/** The part of `<moq-publish>` the control page uses. */
export interface PublishElement extends HTMLElement {
  connection?: { status?: Signal<Link> };
  sources?: Partial<Record<"video" | "audio", Signal<{ device?: { preferred?: { set(v: string | undefined): void } } } | undefined>>>;
}

/** Makes the element a server describes, with its child, its fixed attributes, the stream's name and the address with the token. */
export function make(spec: ElementSpec, offer: Pick<Offer, "name" | "url">): HTMLElement {
  const el = document.createElement(spec.tag);
  for (const [k, v] of spec.attrs) el.setAttribute(k, v);
  if (spec.child) {
    const child = document.createElement(spec.child.split(" ")[0]);
    if (child instanceof HTMLVideoElement) {
      child.muted = true;
      child.autoplay = true;
      child.playsInline = true;
    }
    el.append(child);
  }
  el.setAttribute(spec.name_attr, offer.name);
  el.setAttribute(spec.url_attr, offer.url);
  return el;
}

/** Reports the element's connection to the relay as it changes: connecting, connected, disconnected. Returns what stops it. */
export function watchLink(el: HTMLElement, on: (l: Link) => void): () => void {
  const status = (el as WatchElement).connection?.status;
  if (!status || typeof status.watch !== "function") return () => undefined;
  return status.watch((s) => on(s));
}

/** The caption renditions a broadcast offers, as they appear. */
export function watchCaptions(el: WatchElement, on: (tracks: string[]) => void): () => void {
  const available = el.text?.out?.available;
  if (!available || typeof available.watch !== "function") return () => undefined;
  return available.watch((v) => on(Object.keys(v ?? {})));
}

/** Points the capture element at the chosen devices. The component reads `device.preferred` of its camera and microphone once they exist. */
export function chooseDevices(el: PublishElement, chosen: { video?: string; audio?: string }): () => void {
  const stops = (["video", "audio"] as const).map((kind) => {
    const holder = el.sources?.[kind];
    const id = chosen[kind];
    if (!holder || typeof holder.watch !== "function" || !id) return () => undefined;
    return holder.watch((source) => source?.device?.preferred?.set(id));
  });
  return () => stops.forEach((s) => s());
}
