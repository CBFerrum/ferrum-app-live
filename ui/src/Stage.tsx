// The picture: the element the server's offer names, drawn once per stream and given each renewed
// address as it comes (a changed `url` makes the component reconnect). The component's code is a lazy
// chunk of this release; until it is in, the stage is drawn at its final size.

import { useEffect, useRef, useState } from "react";
import { t } from "@ferrum/client";
import { Spinner } from "@ferrum/kit";
import { define, knows } from "./components";
import { make, watchLink } from "./moq";
import type { Offer } from "./model";
import type { Link } from "./session";

export interface StageProps {
  offer: Offer;
  /** Names the picture for assistive technology ("The broadcast", "What you are sending"). */
  label: string;
  onElement?: (el: HTMLElement | null) => void;
  onLink?: (link: Link) => void;
}

export function Stage({ offer, label, onElement, onLink }: StageProps) {
  const host = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLElement | null>(null);
  const latest = useRef({ offer, onElement, onLink });
  latest.current = { offer, onElement, onLink };
  const [state, setState] = useState<"loading" | "ready" | "unknown" | "failed">(knows(offer.element.tag) ? "loading" : "unknown");
  const { tag } = offer.element;
  const { name } = offer;

  // One element per stream: its tag and the stream's name. A renewed token changes only its address (below).
  useEffect(() => {
    if (!knows(tag)) {
      setState("unknown");
      return;
    }
    let dead = false;
    let stop = () => undefined as void;
    setState("loading");
    define(tag).then(
      () => {
        if (dead || !host.current) return;
        const made = make(latest.current.offer.element, latest.current.offer);
        host.current.append(made);
        el.current = made;
        stop = watchLink(made, (l) => latest.current.onLink?.(l));
        latest.current.onElement?.(made);
        setState("ready");
      },
      () => !dead && setState("failed"),
    );
    return () => {
      dead = true;
      stop();
      el.current?.remove();
      el.current = null;
      latest.current.onElement?.(null);
    };
  }, [tag, name]);

  useEffect(() => {
    el.current?.setAttribute(offer.element.url_attr, offer.url);
  }, [offer.url, offer.element.url_attr]);

  return (
    <div className="lv-stage" role="group" aria-label={label} aria-busy={state === "loading"}>
      <div ref={host} className="lv-stage-host" />
      {state === "loading" && (
        <div className="lv-stage-note" role="status">
          <Spinner small />
          <span>{t("Starting the player…")}</span>
        </div>
      )}
      {state === "unknown" && (
        <div className="lv-stage-note" role="alert">
          {t("This version of Live cannot draw “{tag}”, the element the server asked for.", { tag })}
        </div>
      )}
      {state === "failed" && (
        <div className="lv-stage-note" role="alert">
          {t("The player could not be loaded. Check your connection and reload the page.")}
        </div>
      )}
    </div>
  );
}
