// Before going live: what this browser can do, the camera and microphone to use, and a local preview of them.
// The preview is the browser's own (getUserMedia), nothing leaves the device until "Go live": the relay
// address and token only exist once the start route has answered. The preview is released before the capture
// element takes the devices, since some cameras can be opened once.

import { Mic, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isolate, t } from "@ferrum/client";
import { Alert, Button, Field } from "@ferrum/kit";
import { type PublishSupport, publishSupport } from "./components";

export interface Env {
  secure: boolean;
  media: boolean;
  encoder: boolean;
}

export const envNow = (): Env => ({
  secure: typeof window !== "undefined" && window.isSecureContext !== false,
  media: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
  encoder: typeof globalThis !== "undefined" && "VideoEncoder" in globalThis,
});

/** What stops this browser presenting, and what only costs quality, in plain words. `support` is moq's own probe, when it could be asked. */
export function whyNot(env: Env, support: PublishSupport | null): { blocks: string[]; notes: string[] } {
  const blocks: string[] = [];
  const notes: string[] = [];
  if (!env.secure) blocks.push(t("This page is not served over a secure connection (HTTPS), so the browser will not let it use a camera or microphone."));
  else if (!env.media) blocks.push(t("This browser does not let a page use a camera or microphone."));
  if (!env.encoder || (support && (support.video.capture === "none" || !support.video.encoding))) blocks.push(t("This browser cannot encode video for a live stream. Use a current Chrome, Edge or Firefox."));
  if (support && !support.audio.capture) notes.push(t("This browser cannot capture sound, so the broadcast would have no audio."));
  if (support && support.webtransport !== "full") notes.push(t("This browser has no WebTransport, so it connects to the relay over a WebSocket, which can add delay on a poor network."));
  return { blocks, notes };
}

export interface Devices {
  video: MediaDeviceInfo[];
  audio: MediaDeviceInfo[];
}

/** The cameras and microphones among the devices a browser lists (loudspeakers are not wanted here). */
export const inputs = (all: MediaDeviceInfo[]): Devices => ({ video: all.filter((d) => d.kind === "videoinput"), audio: all.filter((d) => d.kind === "audioinput") });

export const nameOf = (d: MediaDeviceInfo, i: number, what: string) => d.label || t("{what} {n}", { what, n: i + 1 });

/** What the person chose, for the capture element. */
export interface Chosen {
  video?: string;
  audio?: string;
}

export function useSupport(): { env: Env; support: PublishSupport | null; ready: boolean } {
  const [env] = useState(envNow);
  const [support, setSupport] = useState<PublishSupport | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    publishSupport().then(
      (s) => !dead && (setSupport(s), setReady(true)),
      () => !dead && setReady(true),
    );
    return () => {
      dead = true;
    };
  }, []);
  return { env, support, ready };
}

/** Device pickers and the preview. `onChoose` tells the page what to hand the capture element; `release` is called by the page before it goes live. */
export function useCapture(onChoose: (c: Chosen) => void) {
  const [devices, setDevices] = useState<Devices>({ video: [], audio: [] });
  const [chosen, setChosen] = useState<Chosen>({});
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    live.current?.getTracks().forEach((tr) => tr.stop());
    live.current = null;
    setStream(null);
  }, []);
  useEffect(() => release, [release]);

  const open = useCallback(
    async (pick: Chosen) => {
      setBusy(true);
      setError(null);
      live.current?.getTracks().forEach((tr) => tr.stop());
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: pick.video ? { deviceId: { exact: pick.video } } : true, audio: pick.audio ? { deviceId: { exact: pick.audio } } : true });
        live.current = media;
        setStream(media);
        // Names appear only once the person has allowed the devices.
        setDevices(inputs(await navigator.mediaDevices.enumerateDevices()));
        const next = { video: media.getVideoTracks()[0]?.getSettings().deviceId ?? pick.video, audio: media.getAudioTracks()[0]?.getSettings().deviceId ?? pick.audio };
        setChosen(next);
        onChoose(next);
      } catch (e) {
        live.current = null;
        setStream(null);
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        const missing = e instanceof DOMException && (e.name === "NotFoundError" || e.name === "OverconstrainedError");
        setError(
          denied
            ? t("The browser did not let this page use the camera and microphone. Allow them in the address bar, then turn the preview on again.")
            : missing
              ? t("No camera or microphone was found, or the one you chose is not there any more.")
              : t("The camera or microphone could not be opened: {reason}", { reason: e instanceof Error ? e.message : String(e) }),
        );
      } finally {
        setBusy(false);
      }
    },
    [onChoose],
  );

  return { devices, chosen, stream, error, busy, open, release };
}

export function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="lv-stage" role="group" aria-label={t("Your preview")}>
      {stream ? <video ref={ref} className="lv-preview" autoPlay muted playsInline aria-label={t("What the camera sees")} /> : <div className="lv-stage-note">{t("The preview shows here once you turn it on.")}</div>}
    </div>
  );
}

export function DeviceCheck({ capture, disabled }: { capture: ReturnType<typeof useCapture>; disabled?: boolean }) {
  const { devices, chosen, stream, error, busy, open } = capture;
  return (
    <section className="card lv-card" aria-labelledby="lv-check">
      <h2 id="lv-check" className="lv-h2">
        {t("Check your camera and microphone")}
      </h2>
      <p className="muted">{t("The preview stays on this device. Nothing is sent until you go live.")}</p>
      <Preview stream={stream} />
      {error && <Alert tone="error">{isolate(error)}</Alert>}
      <div className="lv-two">
        <Field label={t("Camera")} htmlFor="lv-camera">
          <div className="lv-pick">
            <Video size={16} aria-hidden="true" />
            <select id="lv-camera" className="select" value={chosen.video ?? ""} disabled={disabled || !devices.video.length || busy} onChange={(e) => void open({ ...chosen, video: e.target.value })}>
              {!devices.video.length && <option value="">{t("Turn the preview on to choose")}</option>}
              {devices.video.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {isolate(nameOf(d, i, t("Camera")))}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label={t("Microphone")} htmlFor="lv-mic">
          <div className="lv-pick">
            <Mic size={16} aria-hidden="true" />
            <select id="lv-mic" className="select" value={chosen.audio ?? ""} disabled={disabled || !devices.audio.length || busy} onChange={(e) => void open({ ...chosen, audio: e.target.value })}>
              {!devices.audio.length && <option value="">{t("Turn the preview on to choose")}</option>}
              {devices.audio.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {isolate(nameOf(d, i, t("Microphone")))}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>
      <div className="row">
        <Button loading={busy} disabled={disabled} onClick={() => void open(chosen)}>
          {stream ? t("Restart the preview") : t("Turn on the preview")}
        </Button>
      </div>
    </section>
  );
}
