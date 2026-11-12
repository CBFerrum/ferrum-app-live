// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { View, renewalNote } from "./Control";
import { Preview, whyNot, type Env } from "./Capture";
import { paramsOf } from "./Links";
import type { Broadcast } from "./model";
import { advance, fakeServer, flush, json, mount, press, type } from "./testing";

vi.mock("./components", () => ({
  knows: (tag: string) => tag === "moq-watch" || tag === "moq-publish",
  define: () => Promise.resolve(),
  publishSupport: () => Promise.resolve({ webtransport: "full", audio: { capture: true }, video: { capture: "full", encoding: {} } }),
}));

const live = (over: Partial<Broadcast> = {}): Broadcast => ({ id: "b1", version: 1, title: "Launch day", status: "Scheduled", audience: "Public", ...over });

const offer = (life = 3600) => ({
  relay: "https://relay.example.com",
  path: "live/ws/b1",
  name: "live.hang",
  token: "tok1",
  url: "https://relay.example.com/live/ws/b1?jwt=tok1",
  element: { tag: "moq-publish", url_attr: "url", name_attr: "name", child: "video", attrs: [["source", "camera"]] },
  expires_at: new Date(Date.now() + life * 1000).toISOString(),
  refresh_in: (life * 2) / 3,
  recording: false,
  status: "Live",
});

const tracks = (id: string, kind: "video" | "audio") => ({ getSettings: () => ({ deviceId: id }), stop: vi.fn(), kind });
function camera() {
  const stream = { getTracks: () => [], getVideoTracks: () => [tracks("cam2", "video")], getAudioTracks: () => [tracks("mic1", "audio")] };
  const info = (deviceId: string, kind: string, label: string) => ({ deviceId, kind, label, groupId: "g" });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => [info("cam1", "videoinput", "Built-in camera"), info("cam2", "videoinput", "Desk camera"), info("mic1", "audioinput", "Desk microphone"), info("out", "audiooutput", "Speakers")]),
    },
  });
  vi.stubGlobal("VideoEncoder", class {});
  return navigator.mediaDevices as unknown as { getUserMedia: ReturnType<typeof vi.fn> };
}

const base = (over: Record<string, () => unknown> = {}) => ({
  "GET /api/reports/live_broadcasts": () => ({ rows: [{ title: "Launch day", status: "Live", started_at: "2026-11-13T09:00:00Z", ended_at: null, viewers_now: 23, viewers_peak: 40, viewers_total: 50 }] }),
  "GET /api/app/live/broadcasts/b1/embed": () => ({ id: "b1", status: "Scheduled", title: "Launch day", page: "https://acme.example.com/api/site/acme/live/watch/b1", iframe: "" }),
  ...over,
});

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("what this browser can do", () => {
  const env: Env = { secure: true, media: true, encoder: true };
  const full = { webtransport: "full", audio: { capture: true }, video: { capture: "full", encoding: {} } } as const;

  it("lets a modern browser present with nothing to say", () => {
    expect(whyNot(env, full)).toEqual({ blocks: [], notes: [] });
  });

  it("says in plain words what stops a browser: no secure page, no camera access, no video encoder", () => {
    expect(whyNot({ ...env, secure: false }, null).blocks[0]).toContain("secure connection");
    expect(whyNot({ ...env, media: false }, null).blocks[0]).toContain("does not let a page use a camera");
    expect(whyNot({ ...env, encoder: false }, null).blocks[0]).toContain("cannot encode video");
    expect(whyNot(env, { ...full, video: { capture: "none", encoding: undefined } }).blocks[0]).toContain("cannot encode video");
  });

  it("notes, without stopping, a browser that has no WebTransport or cannot capture sound", () => {
    const r = whyNot(env, { webtransport: "none", audio: { capture: false }, video: { capture: "full", encoding: {} } });
    expect(r.blocks).toEqual([]);
    expect(r.notes).toHaveLength(2);
  });

  it("draws the preview empty until a stream is given", () => {
    const el = document.createElement("div");
    document.body.append(el);
    expect(Preview).toBeTypeOf("function");
    el.remove();
  });
});

describe("what the renewal of a presenter's access says", () => {
  const ok = { renewal: "ok", nextRenewal: 5000, expiresAt: 9000, message: null, reconnecting: false, link: "connected" } as const;
  it("says nothing while all is well", () => expect(renewalNote(ok, 0)).toBeNull());
  it("says when the right was lost, in the server's words and with the time the stream stops", () => {
    const n = renewalNote({ ...ok, renewal: "refused", message: "broadcast not found" }, 0)!;
    expect(n.tone).toBe("error");
    expect(n.title).toBe("Your access to this broadcast was not renewed");
    expect(n.text).toContain("broadcast not found");
    expect(n.text).toContain("The stream stops at");
  });
  it("says a renewal is being retried, and a connection is being rebuilt", () => {
    expect(renewalNote({ ...ok, renewal: "retrying", nextRenewal: 10_000 }, 0)?.text).toContain("Trying again in 10 seconds");
    expect(renewalNote({ ...ok, link: "disconnected" }, 0)?.title).toBe("Reconnecting to the relay");
  });
});

describe("the links for people with no account", () => {
  it("needs a name for a presenter and a sensible number of days", () => {
    expect(paramsOf("Presenter", { name: "", email: "", label: "", days: "" }).problems.presenter_name).toBeTruthy();
    expect(paramsOf("Viewer", { name: "", email: "", label: "", days: "91" }).problems.days).toBeTruthy();
    expect(paramsOf("Presenter", { name: " Mira ", email: "", label: "", days: "3" }).params).toEqual({ presenter_name: "Mira", presenter_email: undefined, days: 3 });
    expect(paramsOf("Viewer", { name: "", email: "", label: "Press", days: "" }).params).toEqual({ label: "Press", days: undefined });
  });
});

describe("the control page", () => {
  it("checks the camera, goes live, shows the picture, viewers now and the links, and renews on its own", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const media = camera();
    const server = fakeServer(
      base({
        "POST /api/app/live/broadcasts/b1/publish": () => offer(),
        "POST /api/app/live/broadcasts/b1/publish/refresh": () => ({ ...offer(), token: "tok2", url: "https://relay.example.com/live/ws/b1?jwt=tok2" }),
      }),
    );
    const page = await mount(<View b={live()} />);
    expect(page.text()).toContain("Check your camera and microphone");
    await press(page.button("Turn on the preview"));
    expect(media.getUserMedia).toHaveBeenCalled();
    expect([...page.el.querySelectorAll<HTMLOptionElement>("#lv-camera option")].map((o) => o.textContent)).toEqual(["Built-in camera", "Desk camera"]);
    expect(page.el.querySelector<HTMLSelectElement>("#lv-camera")!.value).toBe("cam2");
    expect(page.el.querySelector<HTMLSelectElement>("#lv-mic")!.value).toBe("mic1");

    const go = page.button("Go live");
    await press(go);
    await press(go);
    expect(server.count("POST /api/app/live/broadcasts/b1/publish")).toBe(1);
    expect(page.text()).toContain("You are on air");
    expect(document.activeElement?.id).toBe("lv-air");
    const el = page.el.querySelector("moq-publish");
    expect(el?.getAttribute("url")).toContain("jwt=tok1");
    expect(el?.getAttribute("name")).toBe("live.hang");
    expect(el?.getAttribute("source")).toBe("camera");
    expect(el?.querySelector("video")).not.toBeNull();
    expect(page.text()).toContain("renews itself at");

    // The access is renewed at two thirds of its hour, and the picture is pointed at the new address.
    await advance(2_401_000);
    expect(server.count("POST /api/app/live/broadcasts/b1/publish/refresh")).toBe(1);
    expect(page.el.querySelector("moq-publish")?.getAttribute("url")).toContain("jwt=tok2");
    expect(page.el.querySelector("moq-publish")).toBe(el);
    await page.unmount();
  });

  it("shows plainly when a renewal is refused, since the stream then stops when the access runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    camera();
    fakeServer(
      base({
        "POST /api/app/live/broadcasts/b1/publish": () => offer(),
        "POST /api/app/live/broadcasts/b1/publish/refresh": () => json({ error: "not_found", message: "broadcast not found" }, 404),
      }),
    );
    const page = await mount(<View b={live()} />);
    await press(page.button("Go live"));
    await advance(2_401_000);
    expect(page.text()).toContain("Your access to this broadcast was not renewed");
    expect(page.text()).toContain("broadcast not found");
    expect(page.el.querySelector("moq-publish")).not.toBeNull();
    await page.unmount();
  });

  it("asks before ending, ends once, and shows the server's refusal when it cannot", async () => {
    camera();
    let refuse = true;
    const server = fakeServer(
      base({
        "POST /api/app/live/broadcasts/b1/publish": () => offer(),
        "POST /api/app/live/broadcasts/b1/end": () => (refuse ? json({ error: "not_found", message: "broadcast not found" }, 404) : { status: "Ended" }),
      }),
    );
    const page = await mount(<View b={live({ status: "Live" })} />);
    await press(page.button("Reconnect and go live again"));
    await press(page.button("End broadcast"));
    expect(document.body.textContent).toContain("End “Launch day”?");
    expect(server.count("POST /api/app/live/broadcasts/b1/end")).toBe(0);
    await press(page.button("End the broadcast"));
    expect(server.count("POST /api/app/live/broadcasts/b1/end")).toBe(1);
    expect(page.text()).toContain("broadcast not found");
    refuse = false;
    await press(page.button("End broadcast"));
    await press(page.button("End the broadcast"));
    expect(page.el.querySelector("moq-publish")).toBeNull();
    expect(document.body.textContent).toContain("The broadcast has ended");
    await page.unmount();
  });

  it("shows viewers now from the report, and the watch links", async () => {
    camera();
    fakeServer(base());
    const page = await mount(<View b={live({ status: "Live", started_at: "2026-11-13T09:00:00.000Z", viewers_peak: 40 })} />);
    expect(page.el.querySelector(".lv-figure")?.textContent).toBe("23");
    expect(page.text()).toContain("Most at once: 40");
    const addresses = [...page.el.querySelectorAll<HTMLInputElement>(".lv-copy input")].map((i) => i.value);
    expect(addresses[0]).toMatch(/\/live\/watch\/b1$/);
    expect(addresses[1]).toBe("https://acme.example.com/api/site/acme/live/watch/b1");
    await page.unmount();
  });

  it("tells a browser that cannot present why, and does not offer to go live", async () => {
    fakeServer(base());
    const page = await mount(<View b={live()} />);
    expect(page.text()).toContain("This browser cannot present.");
    expect(page.text()).toContain("does not let a page use a camera or microphone");
    expect((page.button("Go live") as HTMLButtonElement).disabled).toBe(true);
    await page.unmount();
  });

  it("says what the camera refusal means, and lets the person try again", async () => {
    const media = camera();
    media.getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    fakeServer(base());
    const page = await mount(<View b={live()} />);
    await press(page.button("Turn on the preview"));
    expect(page.text()).toContain("did not let this page use the camera and microphone");
    await press(page.button("Turn on the preview"));
    expect(page.text()).not.toContain("did not let this page use");
    await page.unmount();
  });

  it("shows the server's words when starting is refused, and the page stays as it was", async () => {
    camera();
    fakeServer(base({ "POST /api/app/live/broadcasts/b1/publish": () => json({ error: "unavailable", message: "live video is not set up in this workspace" }, 503) }));
    const page = await mount(<View b={live()} />);
    await press(page.button("Go live"));
    expect(page.text()).toContain("live video is not set up in this workspace");
    expect(page.el.querySelector("moq-publish")).toBeNull();
    await page.unmount();
  });

  it("makes a presenter link once, shows it once, and forgets it", async () => {
    camera();
    const server = fakeServer(
      base({ "POST /api/v1/Broadcast/b1/actions/issue_publisher_link": () => ({ link: "l1", secret: "S".repeat(43), url: "https://acme.example.com/api/site/acme/live/present/b1#k=" + "S".repeat(43), expires_at: "2026-11-20T10:00:00.000Z" }) }),
    );
    const page = await mount(<View b={live()} />);
    await press(page.button("Make a presenter link"));
    await press(page.button("Make the link"));
    expect(document.body.textContent).toContain("Who will present?");
    expect(server.count("POST /api/v1/Broadcast/b1/actions/issue_publisher_link")).toBe(0);
    await type(document.querySelector<HTMLInputElement>("#lv-l-name")!, "Mira Shah");
    await press(page.button("Make the link"));
    expect(server.last("POST /api/v1/Broadcast/b1/actions/issue_publisher_link")?.body).toMatchObject({ presenter_name: "Mira Shah" });
    expect(document.body.textContent).toContain("This address is shown once");
    expect([...document.querySelectorAll<HTMLInputElement>("dialog input")].some((i) => i.value.includes("/present/b1#k="))).toBe(true);
    await press(page.button("Done"));
    expect(document.body.textContent).not.toContain("/present/b1#k=");
    await page.unmount();
  });

  it("shows the server's refusal when a link cannot be made", async () => {
    camera();
    fakeServer(base({ "POST /api/v1/Broadcast/b1/actions/issue_viewer_link": () => json({ error: "invalid", message: "a link is made for a broadcast that has not ended" }, 400) }));
    const page = await mount(<View b={live()} />);
    await press(page.button("Make a viewing link"));
    await press(page.button("Make the link"));
    expect(document.body.textContent).toContain("a link is made for a broadcast that has not ended");
    await page.unmount();
  });

  it("offers nothing to start once the broadcast is over, and points at the replay", async () => {
    fakeServer(base());
    const page = await mount(<View b={live({ status: "Ended", viewers_total: 50, viewers_peak: 40, replay_url: "https://replay.example.com/x/master.m3u8" })} />);
    expect(page.text()).toContain("This broadcast has ended");
    expect(page.text()).toContain("50 people watched it, at most 40 at once.");
    expect(page.button("Go live")).toBeNull();
    expect(page.el.querySelector('a[href="https://replay.example.com/x/master.m3u8"]')).not.toBeNull();
    await page.unmount();
    await flush();
  });
});
