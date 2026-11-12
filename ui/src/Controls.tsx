// The player's controls, for the parts `<moq-watch>` offers: pause, mute, volume, the caption renditions it
// finds in the broadcast, and full screen (the browser's, on the stage). Keyboard: space or K pause, M mute,
// the up and down arrows volume, C captions, F full screen; the stage takes focus for them.

import { Captions, Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { t } from "@ferrum/client";
import { Button } from "@ferrum/kit";
import { type WatchElement, watchCaptions } from "./moq";

const STEP = 0.1;
const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));

export function Controls({ el, children }: { el: HTMLElement | null; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const watch = el as WatchElement | null;
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [tracks, setTracks] = useState<string[]>([]);
  const [caption, setCaption] = useState<string>("");

  // The page asked for a seat with a button or by itself; whichever it was, focus is not left on nothing.
  useEffect(() => {
    if (document.activeElement === document.body) frame.current?.focus();
  }, []);

  useEffect(() => {
    if (!watch) {
      setTracks([]);
      return;
    }
    setPaused(!!watch.paused);
    setMuted(!!watch.muted);
    setVolume(typeof watch.volume === "number" ? watch.volume : 0.5);
    setCaption(watch.captions ?? "");
    return watchCaptions(watch, setTracks);
  }, [watch]);

  const pause = (v = !paused) => {
    if (!watch) return;
    watch.paused = v;
    setPaused(v);
  };
  const mute = (v = !muted) => {
    if (!watch) return;
    watch.muted = v;
    setMuted(v);
  };
  const level = (v: number) => {
    if (!watch) return;
    const next = clamp(v);
    watch.volume = next;
    setVolume(next);
    if (next > 0 && muted) mute(false);
  };
  const captions = (name: string) => {
    if (!watch) return;
    watch.captions = name || undefined;
    setCaption(name);
  };
  const full = () => {
    const f = frame.current;
    if (!f) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void f.requestFullscreen?.();
  };

  const keys = (e: KeyboardEvent) => {
    // A key that belongs to a control (a slider, a select) keeps its own meaning there.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if ((k === " " || k === "k") && tag !== "BUTTON") pause();
    else if (k === "m") mute();
    else if (k === "f") full();
    else if (k === "c" && tracks.length) captions(caption ? "" : tracks[0]);
    else if (k === "arrowup") level(volume + STEP);
    else if (k === "arrowdown") level(volume - STEP);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={frame} className="lv-player" role="group" aria-label={t("Player")} onKeyDown={keys} tabIndex={0}>
      {children}
      <div className="lv-controls" role="toolbar" aria-label={t("Player controls")} aria-describedby="lv-keys">
        <Button size="sm" disabled={!watch} aria-pressed={paused} aria-label={paused ? t("Play") : t("Pause")} title={paused ? t("Play") : t("Pause")} onClick={() => pause()}>
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </Button>
        <Button size="sm" disabled={!watch} aria-pressed={muted} aria-label={muted ? t("Unmute") : t("Mute")} title={muted ? t("Unmute") : t("Mute")} onClick={() => mute()}>
          {muted || volume === 0 ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </Button>
        <input
          type="range"
          className="lv-volume"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          disabled={!watch}
          aria-label={t("Volume")}
          aria-valuetext={t("{n} percent", { n: Math.round((muted ? 0 : volume) * 100) })}
          onChange={(e) => level(Number(e.target.value))}
        />
        {tracks.length > 0 && (
          <label className="lv-captions">
            <Captions size={16} aria-hidden="true" />
            <span className="sr-only">{t("Captions")}</span>
            <select className="select" value={caption} onChange={(e) => captions(e.target.value)}>
              <option value="">{t("Captions off")}</option>
              {tracks.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        <Button size="sm" aria-label={t("Full screen")} title={t("Full screen")} onClick={full}>
          <Maximize size={16} aria-hidden="true" />
        </Button>
      </div>
      <p id="lv-keys" className="lv-keys faint">
        {t("Keys: space pauses, M mutes, up and down change the volume, C turns captions on, F fills the screen.")}
      </p>
    </div>
  );
}
