// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home, split, tabOf } from "./Home";
import { viewersNow } from "./data";
import type { AudienceRow, Broadcast } from "./model";
import { advance, fakeServer, flush, json, mount, press } from "./testing";

const b = (over: Partial<Broadcast> & { id: string; title: string }): Broadcast => ({ version: 1, status: "Scheduled", ...over });

const rows: Broadcast[] = [
  b({ id: "l1", title: "Launch day", status: "Live", started_at: "2026-11-13T09:00:00.000Z", audience: "Public", viewers_peak: 41, reference_entity: "Product", reference_id: "p1" }),
  b({ id: "s2", title: "Later", status: "Scheduled", planned_start: "2026-11-20T09:00:00.000Z" }),
  b({ id: "s1", title: "Sooner", status: "Scheduled", planned_start: "2026-11-15T09:00:00.000Z", audience: "Members" }),
  b({ id: "e1", title: "Old talk", status: "Ended", ended_at: "2026-11-01T10:00:00.000Z", viewers_peak: 9, replay_url: "https://replay.example.com/x/master.m3u8" }),
  b({ id: "e2", title: "Called off", status: "Cancelled", planned_start: "2026-11-02T10:00:00.000Z" }),
];

const audience: AudienceRow[] = [
  { title: "Launch day", status: "Live", started_at: "2026-11-13T09:00:00Z", ended_at: null, viewers_now: 17, viewers_peak: 41, viewers_total: 60 },
  { title: "Old talk", status: "Ended", started_at: "2026-11-01T09:00:00Z", ended_at: "2026-11-01T10:00:00Z", viewers_now: 0, viewers_peak: 9, viewers_total: 12 },
];

const meta = { name: "Broadcast", label: "Broadcast", kind: "master", permissions: { read: "all", create: "all", write: "all" }, fields: [] };

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("which broadcasts are on which tab", () => {
  it("puts live ones, scheduled ones and over ones apart, each in the order that helps", () => {
    expect(rows.map(tabOf)).toEqual(["live", "upcoming", "upcoming", "ended", "ended"]);
    const s = split(rows);
    expect(s.upcoming.map((x) => x.id)).toEqual(["s1", "s2"]);
    expect(s.ended.map((x) => x.id)).toEqual(["e2", "e1"]);
  });

  it("matches viewers now to a broadcast by title and start, and says nothing when two are alike", () => {
    expect(viewersNow(audience, rows[0])).toBe(17);
    expect(viewersNow(audience, rows[1])).toBeNull();
    expect(viewersNow([...audience, { ...audience[0], viewers_now: 3 }], rows[0])).toBeNull();
    expect(viewersNow(undefined, rows[0])).toBeNull();
    // The same moment written two ways is the same moment.
    expect(viewersNow(audience, { ...rows[0], started_at: "2026-11-13T09:00:00.000Z" })).toBe(17);
  });
});

describe("the broadcasts home", () => {
  it("opens on what is live, with its status, the record, audience, viewers now and peak", async () => {
    const server = fakeServer({
      "GET /api/v1/Broadcast": () => ({ rows }),
      "GET /api/reports/live_broadcasts": () => ({ rows: audience }),
      "GET /api/v1/Product/p1": () => ({ id: "p1", name: "Blue kettle" }),
      "GET /api/meta/Broadcast": () => meta,
    });
    const page = await mount(<Home />);
    const text = page.text();
    expect(text).toContain("1 on now");
    expect(text).toContain("Launch day");
    expect(text).toContain("Live now1");
    expect(text).toContain("Upcoming2");
    expect(text).toContain("Ended2");
    expect(text).toContain("Anyone");
    expect(page.el.querySelector("tbody tr")?.textContent).toContain("17");
    expect(page.el.querySelector("tbody tr")?.textContent).toContain("41");
    expect(page.el.querySelector('a[href="/open/Product/p1"]')).not.toBeNull();
    expect(server.count("GET /api/reports/live_broadcasts")).toBe(1);
    await page.unmount();
  });

  it("shows the upcoming broadcasts on their tab and cancels one after asking", async () => {
    const server = fakeServer({
      "GET /api/v1/Broadcast": () => ({ rows }),
      "GET /api/reports/live_broadcasts": () => ({ rows: audience }),
      "GET /api/meta/Broadcast": () => meta,
      "POST /api/v1/Broadcast/s1/actions/call_off": () => ({ status: "Cancelled" }),
    });
    const page = await mount(<Home />, { at: "/?tab=upcoming" });
    expect([...page.el.querySelectorAll("tbody th")].map((x) => x.textContent)).toEqual(["Sooner", "Later"]);
    await press(page.button("Cancel"));
    expect(document.body.textContent).toContain("Cancel “Sooner”?");
    expect(server.count("POST /api/v1/Broadcast/s1/actions/call_off")).toBe(0);
    await press(page.button("Cancel the broadcast"));
    expect(server.count("POST /api/v1/Broadcast/s1/actions/call_off")).toBe(1);
    expect(document.body.textContent).toContain("Cancelled");
    await page.unmount();
  });

  it("shows the server's refusal when a broadcast cannot be cancelled", async () => {
    fakeServer({
      "GET /api/v1/Broadcast": () => ({ rows }),
      "GET /api/meta/Broadcast": () => meta,
      "POST /api/v1/Broadcast/s1/actions/call_off": () => json({ error: "invalid", message: "a broadcast that is Live cannot become Cancelled" }, 400),
    });
    const page = await mount(<Home />, { at: "/?tab=upcoming" });
    await press(page.button("Cancel"));
    await press(page.button("Cancel the broadcast"));
    expect(document.body.textContent).toContain("a broadcast that is Live cannot become Cancelled");
    await page.unmount();
  });

  it("says it is offline when nothing answers, and reads again when asked", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    let down = true;
    fakeServer({
      "GET /api/v1/Broadcast": () => {
        if (down) throw new TypeError("Failed to fetch");
        return { rows };
      },
      "GET /api/meta/Broadcast": () => meta,
    });
    const page = await mount(<Home />);
    // A read is tried again a few times, with growing pauses, before the screen says so.
    await advance(8_000);
    expect(page.text()).toContain("You're offline");
    down = false;
    await press(page.button("Try again"));
    expect(page.text()).toContain("Launch day");
    await page.unmount();
  });

  it("lists the ended ones with their replay", async () => {
    fakeServer({ "GET /api/v1/Broadcast": () => ({ rows }), "GET /api/meta/Broadcast": () => meta });
    const page = await mount(<Home />, { at: "/?tab=ended" });
    expect(page.text()).toContain("Old talk");
    expect(page.text()).toContain("Called off");
    expect(page.el.querySelector('a[href="https://replay.example.com/x/master.m3u8"]')?.textContent).toBe("Replay");
    await page.unmount();
  });

  it("starts a workspace with none off: what a broadcast is, and the way to plan the first", async () => {
    fakeServer({ "GET /api/v1/Broadcast": () => ({ rows: [] }), "GET /api/meta/Broadcast": () => meta });
    const page = await mount(<Home />);
    expect(page.text()).toContain("No broadcasts yet");
    expect(page.text()).toContain("Plan your first broadcast");
    await page.unmount();
  });

  it("says plainly when the person has no role for it, and when the server fails", async () => {
    fakeServer({ "GET /api/v1/Broadcast": () => json({ error: "forbidden", message: "no" }, 403), "GET /api/meta/Broadcast": () => meta });
    const denied = await mount(<Home />);
    expect(denied.text()).toContain("Broadcasts are for people with the Live User role");
    await denied.unmount();
    fakeServer({ "GET /api/v1/Broadcast": () => json({ error: "unavailable", message: "The database is restarting." }, 500), "GET /api/meta/Broadcast": () => meta });
    const failed = await mount(<Home />);
    await flush();
    expect(failed.text()).toContain("The database is restarting.");
    expect(failed.button("Try again")).not.toBeNull();
    await failed.unmount();
  });
});
