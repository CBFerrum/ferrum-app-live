// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bodyOf, EMPTY, NewBroadcast, problems } from "./New";
import { fakeServer, json, mount, press, type } from "./testing";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const routes = {
  "GET /api/v1/LiveSettings": () => ({ rows: [{ id: "s", version: 1, default_audience: "Portal" }] }),
  "GET /api/meta": () => ({ entities: [{ name: "Lesson", label: "Lesson", kind: "master", permissions: {} }] }),
};

describe("what a new broadcast sends", () => {
  it("leaves out what is empty, so Live Settings' defaults apply, and names the record only when both parts are there", () => {
    expect(bodyOf({ ...EMPTY, title: "  Launch ", capacity: "" })).toEqual({ title: "Launch" });
    const b = bodyOf({ ...EMPTY, title: "Launch", entity: "Lesson", record: "r1", audience: "Public", capacity: "250", waiting: "Soon", frames: "https://shop.example.com" });
    expect(b).toMatchObject({ title: "Launch", reference_entity: "Lesson", reference_id: "r1", audience: "Public", capacity: 250, waiting_text: "Soon", frame_origins: "https://shop.example.com" });
    expect(bodyOf({ ...EMPTY, title: "x", entity: "Lesson", record: null }).reference_entity).toBeUndefined();
  });

  it("says what is wrong before asking the server", () => {
    expect(Object.keys(problems({ ...EMPTY }))).toEqual(["title"]);
    expect(problems({ ...EMPTY, title: "x", starts: "2026-11-14T10:00", ends: "2026-11-14T09:00" }).planned_end).toContain("after the start");
    expect(problems({ ...EMPTY, title: "x", capacity: "ten" }).capacity).toContain("whole number");
    expect(problems({ ...EMPTY, title: "x", entity: "Lesson" }).reference_id).toContain("Choose the record");
  });
});

describe("planning a broadcast", () => {
  it("creates it once, with its planned time on the workspace's clock, and opens its control page", async () => {
    const server = fakeServer({ ...routes, "POST /api/v1/Broadcast": () => json({ id: "b9", version: 1, status: "Scheduled" }, 201) });
    const page = await mount(<NewBroadcast />, { path: "/new", at: "/new" });
    expect(page.text()).toContain("As Live Settings say (Portal people)");
    await type(page.el.querySelector<HTMLInputElement>("#lv-title")!, "Spring launch");
    await type(page.el.querySelector<HTMLInputElement>("#lv-starts")!, "2026-11-20T10:30");
    await type(page.el.querySelector<HTMLSelectElement>("#lv-audience")!, "Public");
    const create = page.button("Create broadcast");
    await press(create);
    await press(create);
    expect(server.count("POST /api/v1/Broadcast")).toBe(1);
    const sent = server.last("POST /api/v1/Broadcast")!.body;
    expect(sent).toMatchObject({ title: "Spring launch", audience: "Public" });
    expect(String(sent.planned_start)).toMatch(/^2026-11-20T/);
    expect(page.router.state.location.pathname).toBe("/b/b9");
    await page.unmount();
  });

  it("asks for a title before sending anything", async () => {
    const server = fakeServer(routes);
    const page = await mount(<NewBroadcast />, { path: "/new", at: "/new" });
    await press(page.button("Create broadcast"));
    expect(page.text()).toContain("Give the broadcast a title.");
    expect(server.count("POST /api/v1/Broadcast")).toBe(0);
    await page.unmount();
  });

  it("shows the server's refusal under the field it is about, and keeps what was typed", async () => {
    fakeServer({ ...routes, "POST /api/v1/Broadcast": () => json({ error: "validation", message: "Please check your input.", fields: [{ field: "frame_origins", message: "ftp://x is not an origin (https://host, no path, no wildcard)" }] }, 422) });
    const page = await mount(<NewBroadcast />, { path: "/new", at: "/new" });
    await type(page.el.querySelector<HTMLInputElement>("#lv-title")!, "Spring launch");
    await type(page.el.querySelector<HTMLTextAreaElement>("#lv-frames")!, "ftp://x");
    await press(page.button("Create broadcast"));
    expect(page.el.querySelector("#lv-frames-error")?.textContent).toContain("is not an origin");
    expect(page.el.querySelector<HTMLInputElement>("#lv-title")!.value).toBe("Spring launch");
    expect(page.router.state.location.pathname).toBe("/new");
    await page.unmount();
  });

  it("takes the record from the address another app sends a person to", async () => {
    fakeServer(routes);
    const page = await mount(<NewBroadcast />, { path: "/new", at: "/new?entity=Lesson&record=r7" });
    expect(page.el.querySelector<HTMLSelectElement>("#lv-entity")!.value).toBe("Lesson");
    await page.unmount();
  });
});
