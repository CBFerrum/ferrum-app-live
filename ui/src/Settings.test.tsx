// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyOf, checks, draftOf, problems, Settings } from "./Settings";
import { fakeServer, json, mount, press, type } from "./testing";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const field = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: "data", ...extra });
const meta = {
  name: "LiveSettings",
  label: "Live Settings",
  kind: "settings",
  permissions: { read: "all", write: "all", create: "all" },
  fields: [field("watch_token_minutes", { default: 10 }), field("publish_token_minutes", { default: 60 }), field("default_audience", { default: "Members" }), field("retention_days", { default: 30 }), field("player_module_url", { default: "https://esm.sh/@moq/watch@0.6.6/element" })],
};
const saved = { id: "s1", version: 3, relay_url: "https://live.example.com", signing_key_id: "ferrum-1", key_changed_at: "2026-11-10T08:00:00.000Z", watch_token_minutes: 10, publish_token_minutes: 60, default_audience: "Members", default_capacity: 0, recording_default: false, retention_days: 30 };

describe("the settings as numbers and words", () => {
  it("starts from the package's defaults where nothing was saved", () => {
    const d = draftOf({}, { watch_token_minutes: 10, default_audience: "Members", player_module_url: "https://esm.sh/@moq/watch@0.6.6/element" });
    expect(d).toMatchObject({ watch_token_minutes: "10", publish_token_minutes: "60", default_audience: "Members", retention_days: "30", relay_url: "", player_module_url: "https://esm.sh/@moq/watch@0.6.6/element" });
  });

  it("holds each number to the range the server clamps to, and each address to https", () => {
    const d = draftOf({});
    expect(problems(d)).toEqual({});
    expect(problems({ ...d, watch_token_minutes: "61" }).watch_token_minutes).toBeTruthy();
    expect(problems({ ...d, publish_token_minutes: "4" }).publish_token_minutes).toBeTruthy();
    expect(problems({ ...d, retention_days: "0" }).retention_days).toBeTruthy();
    expect(problems({ ...d, default_capacity: "-1" }).default_capacity).toBeTruthy();
    expect(problems({ ...d, relay_url: "ftp://x" }).relay_url).toBeTruthy();
    expect(problems({ ...d, player_module_url: "http://cdn.example.com/p.js" }).player_module_url).toBeTruthy();
  });

  it("sends numbers as numbers and leaves empty addresses out", () => {
    expect(bodyOf({ ...draftOf({}), relay_url: " https://live.example.com ", capacity: "x" } as never)).toMatchObject({ relay_url: "https://live.example.com", watch_token_minutes: 10, publish_token_minutes: 60, replay_base_url: undefined });
  });

  it("says what is missing between a presenter and the relay, from what the settings hold", () => {
    expect(checks({}).map((c) => c.ok)).toEqual([false, false]);
    expect(checks({ relay_url: "https://r.example.com", signing_key_id: "k1" }).map((c) => c.ok)).toEqual([true, true]);
  });
});

describe("the settings screen", () => {
  it("shows the key's name and when it was set but never the key, and saves what was changed against the version it read", async () => {
    const server = fakeServer({
      "GET /api/v1/LiveSettings": () => ({ rows: [{ ...saved, signing_key: "SHOULD-NEVER-BE-SHOWN" }] }),
      "GET /api/meta/LiveSettings": () => meta,
      "PATCH /api/v1/LiveSettings/s1": () => ({ ...saved, version: 4 }),
    });
    const page = await mount(<Settings />);
    expect(page.text()).toContain("A key is set, named ferrum-1");
    expect(page.text()).not.toContain("SHOULD-NEVER-BE-SHOWN");
    expect(page.el.querySelector<HTMLTextAreaElement>("#lv-key")!.value).toBe("");
    expect(page.el.querySelector<HTMLInputElement>("#lv-relay")!.value).toBe("https://live.example.com");
    await type(page.el.querySelector<HTMLInputElement>("#lv-watch-min")!, "15");
    await press(page.button("Save settings"));
    const call = server.last("PATCH /api/v1/LiveSettings/s1")!;
    expect(call.body).toMatchObject({ watch_token_minutes: 15, relay_url: "https://live.example.com" });
    expect(call.body).not.toHaveProperty("signing_key");
    expect((fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find((c) => (c[1].method ?? "") === "PATCH")?.[1].headers).toMatchObject({ "if-match": '"v3"' });
    expect(document.body.textContent).toContain("Saved");
    await page.unmount();
  });

  it("writes a new key after asking, sends it once, and empties the field", async () => {
    const server = fakeServer({
      "GET /api/v1/LiveSettings": () => ({ rows: [saved] }),
      "GET /api/meta/LiveSettings": () => meta,
      "POST /api/v1/LiveSettings/s1/actions/set_signing_key": () => ({ key_id: "ferrum-2" }),
    });
    const page = await mount(<Settings />);
    expect((page.button("Replace the key") as HTMLButtonElement).disabled).toBe(true);
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-key")!, "  eyJrdHkiOiJvY3QifQ  ");
    await press(page.button("Replace the key"));
    expect(document.body.textContent).toContain("Replace the signing key?");
    expect(server.count("POST /api/v1/LiveSettings/s1/actions/set_signing_key")).toBe(0);
    await press(page.button("Set the key"));
    expect(server.last("POST /api/v1/LiveSettings/s1/actions/set_signing_key")?.body).toEqual({ key: "eyJrdHkiOiJvY3QifQ" });
    expect(page.el.querySelector<HTMLTextAreaElement>("#lv-key")!.value).toBe("");
    expect(document.body.textContent).toContain("The signing key was set");
    await page.unmount();
  });

  it("shows the server's refusal of a key under the key field", async () => {
    fakeServer({
      "GET /api/v1/LiveSettings": () => ({ rows: [saved] }),
      "GET /api/meta/LiveSettings": () => meta,
      "POST /api/v1/LiveSettings/s1/actions/set_signing_key": () => json({ error: "invalid", message: "the key must be an HS256 JWK of at least 32 bytes" }, 400),
    });
    const page = await mount(<Settings />);
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-key")!, "not a key");
    await press(page.button("Replace the key"));
    await press(page.button("Set the key"));
    expect(page.el.querySelector("#lv-key-error")?.textContent).toContain("HS256 JWK");
    await page.unmount();
  });

  it("makes the settings on the first save of a workspace that never had any, and shows what the server refuses under its field", async () => {
    let refuse = true;
    const server = fakeServer({
      "GET /api/v1/LiveSettings": () => ({ rows: [] }),
      "GET /api/meta/LiveSettings": () => meta,
      "POST /api/v1/LiveSettings": () => (refuse ? json({ error: "validation", message: "Please check your input.", fields: [{ field: "path_prefix", message: "letters, digits, dash and underscore" }, { field: "player_module_url", message: "an https address, without quotes, spaces or angle brackets" }] }, 422) : { id: "s1", version: 1 }),
    });
    const page = await mount(<Settings />);
    expect(page.text()).toContain("No key is set yet.");
    expect(page.text()).toContain("No relay address is set");
    await type(page.el.querySelector<HTMLInputElement>("#lv-relay")!, "https://live.example.com");
    await press(page.button("Save settings"));
    expect(page.el.querySelector("#lv-player-error")?.textContent).toContain("an https address");
    refuse = false;
    await press(page.button("Save settings"));
    expect(server.count("POST /api/v1/LiveSettings")).toBe(2);
    expect(server.last("POST /api/v1/LiveSettings")?.body).toMatchObject({ relay_url: "https://live.example.com" });
    await page.unmount();
  });

  it("does not send what the form says is wrong", async () => {
    const server = fakeServer({ "GET /api/v1/LiveSettings": () => ({ rows: [saved] }), "GET /api/meta/LiveSettings": () => meta });
    const page = await mount(<Settings />);
    await type(page.el.querySelector<HTMLInputElement>("#lv-pub-min")!, "2");
    await press(page.button("Save settings"));
    expect(page.text()).toContain("A whole number of minutes from 5 to 720.");
    expect(server.calls.some((c) => c.key.startsWith("PATCH"))).toBe(false);
    await page.unmount();
  });

  it("reads only, for a person without the right to change them, and says the doctor's check is not here", async () => {
    fakeServer({ "GET /api/v1/LiveSettings": () => ({ rows: [saved] }), "GET /api/meta/LiveSettings": () => ({ ...meta, permissions: { read: "all", write: "none", create: "none" } }) });
    const page = await mount(<Settings />);
    expect(page.text()).toContain("You can read these settings.");
    expect(page.button("Save settings")).toBeNull();
    expect(page.text()).toContain("This page cannot ask it.");
    await page.unmount();
  });

  it("says plainly when the person may not read them", async () => {
    fakeServer({ "GET /api/v1/LiveSettings": () => json({ error: "forbidden", message: "no" }, 403), "GET /api/meta/LiveSettings": () => meta });
    const page = await mount(<Settings />);
    expect(page.text()).toContain("Live settings are for people who manage broadcasts");
    await page.unmount();
  });
});
