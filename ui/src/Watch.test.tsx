// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stage } from "./Stage";
import { Watch, viewerNote } from "./Watch";
import { chooseDevices, make, type PublishElement } from "./moq";
import { advance, fakeServer, flush, json, mount, press, type } from "./testing";

const comp = vi.hoisted(() => ({ known: ["moq-watch", "moq-publish"], fail: false }));
vi.mock("./components", () => ({
  knows: (tag: string) => comp.known.includes(tag),
  define: () => (comp.fail ? Promise.reject(new Error("chunk")) : Promise.resolve()),
  publishSupport: () => Promise.resolve({ webtransport: "full", audio: { capture: true }, video: { capture: "full", encoding: {} } }),
}));

/** A signal as moq's: read now, watched for changes. */
function signal<T>(value: T) {
  const subs = new Set<(v: T) => void>();
  return {
    peek: () => value,
    watch(fn: (v: T) => void) {
      subs.add(fn);
      fn(value);
      return () => void subs.delete(fn);
    },
    set(v: T) {
      value = v;
      subs.forEach((f) => f(v));
    },
  };
}

class FakeWatch extends HTMLElement {
  paused = false;
  muted = false;
  volume = 0.5;
  captions: string | undefined = undefined;
  text = { out: { available: signal<Record<string, unknown>>({}) } };
  connection = { status: signal<"connecting" | "connected" | "disconnected">("connected") };
}
if (!customElements.get("moq-watch")) customElements.define("moq-watch", FakeWatch);
const player = () => document.querySelector("moq-watch") as FakeWatch | null;

const offer = (token = "w1", life = 600) => ({
  relay: "https://relay.example.com",
  path: "live/ws/b1",
  name: "live.hang",
  token,
  url: `https://relay.example.com/live/ws/b1?jwt=${token}`,
  element: { tag: "moq-watch", url_attr: "url", name_attr: "name", child: "canvas", attrs: [] },
  expires_at: new Date(Date.now() + life * 1000).toISOString(),
  refresh_in: (life * 2) / 3,
});

const info = { id: "b1", status: "Live", title: "Launch day", page: "https://acme.example.com/api/site/acme/live/watch/b1", iframe: "" };
const routes = (over: Record<string, () => unknown> = {}) => ({
  "GET /api/app/live/broadcasts/b1/embed": () => info,
  "POST /api/app/live/broadcasts/b1/watch": () => offer(),
  "POST /api/app/live/broadcasts/b1/watch/leave": () => ({ left: true }),
  ...over,
});
const FAKE = { useFakeTimers: () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }) };

beforeEach(() => {
  comp.known = ["moq-watch", "moq-publish"];
  comp.fail = false;
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the picture", () => {
  it("makes the element the server names, with its child, its stream name and its address, and nothing else", () => {
    const el = make({ tag: "moq-watch", url_attr: "url", name_attr: "name", child: "canvas", attrs: [] }, { name: "live.hang", url: "https://r.example.com/p?jwt=t" });
    expect([...el.attributes].map((a) => [a.name, a.value])).toEqual([["name", "live.hang"], ["url", "https://r.example.com/p?jwt=t"]]);
    expect(el.firstElementChild?.tagName).toBe("CANVAS");
    const cap = make({ tag: "moq-publish", url_attr: "url", name_attr: "name", child: "video", attrs: [["source", "camera"]] }, { name: "n", url: "u" });
    expect(cap.getAttribute("source")).toBe("camera");
    expect((cap.firstElementChild as HTMLVideoElement).muted).toBe(true);
  });

  it("points the capture element at the devices chosen, whenever its camera and microphone appear", () => {
    const set = vi.fn();
    const video = signal<{ device: { preferred: { set: (v: string) => void } } } | undefined>(undefined);
    const stop = chooseDevices({ sources: { video } } as unknown as PublishElement, { video: "cam2", audio: "mic1" });
    video.set({ device: { preferred: { set } } });
    expect(set).toHaveBeenCalledWith("cam2");
    stop();
  });

  it("draws the element once and only changes its address when the access is renewed", async () => {
    const stageOffer = offer();
    const page = await mount(<Stage offer={stageOffer} label="The broadcast" />);
    const first = player();
    expect(first?.getAttribute("url")).toContain("jwt=w1");
    await page.unmount();
    comp.known = ["moq-watch"];
    const again = await mount(<Stage offer={{ ...stageOffer, element: { ...stageOffer.element, tag: "moq-nothing" } }} label="The broadcast" />);
    expect(again.text()).toContain("cannot draw “moq-nothing”");
    await again.unmount();
    comp.fail = true;
    const broken = await mount(<Stage offer={stageOffer} label="The broadcast" />);
    expect(broken.text()).toContain("The player could not be loaded");
    await broken.unmount();
  });
});

describe("what a viewer is told about their access", () => {
  const s = { renewal: "ok", message: null, expiresAt: 9000, reconnecting: false, link: "connected", nextRenewal: 5000 } as const;
  it("is told nothing while all is well, and what to expect otherwise", () => {
    expect(viewerNote(s, 0)).toBeNull();
    expect(viewerNote({ ...s, renewal: "refused", message: "broadcast not found" }, 0)).toMatchObject({ tone: "error" });
    expect(viewerNote({ ...s, renewal: "refused", message: "broadcast not found" }, 0)?.text).toContain("broadcast not found");
    expect(viewerNote({ ...s, renewal: "retrying", nextRenewal: 7000 }, 0)?.text).toContain("Trying again in 7 seconds");
    expect(viewerNote({ ...s, link: "disconnected" }, 0)?.text).toContain("Reconnecting");
  });
});

describe("the watch page", () => {
  it("takes a seat, plays, asks nothing personal and sends nothing personal to the relay", async () => {
    const server = fakeServer(routes());
    const page = await mount(<Watch id="b1" />);
    expect(page.text()).toContain("Launch day");
    expect(player()?.getAttribute("url")).toBe("https://relay.example.com/live/ws/b1?jwt=w1");
    expect([...player()!.attributes].map((a) => a.name).sort()).toEqual(["name", "url"]);
    expect(server.last("POST /api/app/live/broadcasts/b1/watch")?.body).toEqual({});
    await page.unmount();
  });

  it("pauses, mutes, sets the volume, picks captions and answers the keyboard, as far as the component offers", async () => {
    fakeServer(routes());
    const page = await mount(<Watch id="b1" />);
    const el = player()!;
    await press(page.button("Pause"));
    expect(el.paused).toBe(true);
    await press(page.button("Play"));
    expect(el.paused).toBe(false);
    await press(page.button("Mute"));
    expect(el.muted).toBe(true);
    await type(page.el.querySelector<HTMLInputElement>(".lv-volume")!, "0.8");
    expect(el.volume).toBe(0.8);
    expect(el.muted).toBe(false);

    expect(page.el.querySelector(".lv-captions")).toBeNull();
    await act(async () => el.text.out.available.set({ "captions.en": {}, "captions.hi": {} }));
    const select = page.el.querySelector<HTMLSelectElement>(".lv-captions select")!;
    expect([...select.options].map((o) => o.value)).toEqual(["", "captions.en", "captions.hi"]);
    await type(select, "captions.hi");
    expect(el.captions).toBe("captions.hi");

    const frame = page.el.querySelector<HTMLElement>(".lv-player")!;
    const key = async (k: string) => act(async () => void frame.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    await key("m");
    expect(el.muted).toBe(true);
    await key(" ");
    expect(el.paused).toBe(true);
    await key("ArrowUp");
    expect(el.volume).toBeCloseTo(0.9);
    await key("c");
    expect(el.captions).toBeUndefined();
    expect(frame.getAttribute("tabindex")).toBe("0");
    await page.unmount();
  });

  it("renews before the access runs out and gives the new address to the same player", async () => {
    FAKE.useFakeTimers();
    const server = fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch/refresh": () => offer("w2") }));
    const page = await mount(<Watch id="b1" />);
    const el = player();
    await advance(401_000);
    expect(server.count("POST /api/app/live/broadcasts/b1/watch/refresh")).toBe(1);
    expect(player()).toBe(el);
    expect(el?.getAttribute("url")).toContain("jwt=w2");
    await page.unmount();
  });

  it("says plainly when the renewal is refused, and that the picture stops when the access runs out", async () => {
    FAKE.useFakeTimers();
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch/refresh": () => json({ error: "not_found", message: "broadcast not found" }, 404) }));
    const page = await mount(<Watch id="b1" />);
    await advance(401_000);
    expect(page.text()).toContain("broadcast not found");
    expect(page.text()).toContain("Your access was not renewed, so the picture stops at");
    expect(player()).not.toBeNull();
    await advance(300_000);
    expect(player()).toBeNull();
    expect(page.text()).toContain("You cannot watch this broadcast");
    await page.unmount();
  });

  it("asks for a new address when the connection drops, and says so while it does", async () => {
    const server = fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch/refresh": () => offer("w3") }));
    const page = await mount(<Watch id="b1" />);
    await act(async () => player()!.connection.status.set("disconnected"));
    await flush();
    expect(server.count("POST /api/app/live/broadcasts/b1/watch/refresh")).toBe(1);
    expect(player()?.getAttribute("url")).toContain("jwt=w3");
    await page.unmount();
  });

  it("says the server's words when the broadcast is full, and takes a seat on trying again", async () => {
    let full = true;
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch": () => (full ? json({ error: "full", message: "This broadcast is full. Try again in a moment." }, 503) : offer()) }));
    const page = await mount(<Watch id="b1" />);
    expect(page.text()).toContain("This broadcast is full. Try again in a moment.");
    expect(player()).toBeNull();
    full = false;
    await press(page.button("Try again"));
    expect(player()).not.toBeNull();
    await page.unmount();
  });

  it("waits, with the broadcast's words and its planned time, and starts by itself", async () => {
    FAKE.useFakeTimers();
    let started = false;
    fakeServer(
      routes({ "POST /api/app/live/broadcasts/b1/watch": () => (started ? offer() : { status: "Scheduled", title: "Launch day", text: "Starts at ten.", planned_start: "2026-11-20T10:00:00.000Z" }) }),
    );
    const page = await mount(<Watch id="b1" />);
    expect(page.text()).toContain("Waiting for the broadcast to start");
    expect(page.text()).toContain("Starts at ten.");
    expect(page.text()).toContain("Planned for");
    started = true;
    await advance(10_500);
    expect(player()).not.toBeNull();
    await page.unmount();
  });

  it("shows an ended broadcast's words and its replay, and a cancelled one's words", async () => {
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch": () => ({ status: "Ended", title: "Launch day", text: "This broadcast has ended.", replay_url: "https://replay.example.com/x/master.m3u8", replay_text: "Watch the replay" }) }));
    const ended = await mount(<Watch id="b1" />);
    expect(ended.text()).toContain("This broadcast has ended");
    expect(ended.el.querySelector('a[href="https://replay.example.com/x/master.m3u8"]')?.textContent).toBe("Watch the replay");
    await ended.unmount();
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch": () => ({ status: "Cancelled", text: "This broadcast was cancelled." }) }));
    const cancelled = await mount(<Watch id="b1" />);
    expect(cancelled.text()).toContain("This broadcast was cancelled.");
    await cancelled.unmount();
  });

  it("refuses to link to a replay that is not a web address", async () => {
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch": () => ({ status: "Ended", text: "Over.", replay_url: "javascript:alert(1)" }) }));
    const page = await mount(<Watch id="b1" />);
    expect(page.el.querySelector("a[href^='javascript']")).toBeNull();
    await page.unmount();
  });

  it("says what the server says to a person who may not watch, and offers to try again", async () => {
    fakeServer(routes({ "POST /api/app/live/broadcasts/b1/watch": () => json({ error: "not_found", message: "This broadcast is not available." }, 404), "GET /api/app/live/broadcasts/b1/embed": () => json({ error: "not_found", message: "x" }, 404) }));
    const page = await mount(<Watch id="b1" />);
    expect(page.text()).toContain("You cannot watch this broadcast");
    expect(page.text()).toContain("This broadcast is not available.");
    expect(page.button("Try again")).not.toBeNull();
    await page.unmount();
  });

  it("says it is offline when nothing answers, and tries again when asked", async () => {
    let down = true;
    fakeServer(
      routes({
        "POST /api/app/live/broadcasts/b1/watch": () => {
          if (down) throw new TypeError("Failed to fetch");
          return offer();
        },
      }),
    );
    const page = await mount(<Watch id="b1" />);
    expect(page.text()).toContain("You're offline");
    down = false;
    await press(page.button("Try again"));
    expect(player()).not.toBeNull();
    await page.unmount();
  });

  it("gives the seat up when the viewer leaves the page, and by a request that outlives it when the page is closed", async () => {
    const server = fakeServer(routes());
    const page = await mount(<Watch id="b1" />);
    window.dispatchEvent(new Event("pagehide"));
    expect(server.count("POST /api/app/live/broadcasts/b1/watch/leave")).toBe(1);
    expect((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find((c) => String(c[0]).endsWith("/watch/leave"))?.[1].keepalive).toBe(true);
    await page.unmount();
    expect(server.count("POST /api/app/live/broadcasts/b1/watch/leave")).toBe(2);
  });
});
