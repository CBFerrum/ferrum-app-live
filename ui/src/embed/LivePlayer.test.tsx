// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LivePlayer, pick } from "./LivePlayer";
import type { EmbedItem } from "../model";
import { advance, fakeServer, json, mount } from "../testing";

vi.mock("../components", () => ({ knows: () => true, define: () => Promise.resolve(), publishSupport: () => Promise.resolve({}) }));

const item = (over: Partial<EmbedItem> & { id: string }): EmbedItem => ({ status: "Scheduled", title: "Lesson 4", text: "Starts soon.", page: `https://acme.example.com/api/site/acme/live/watch/${over.id}`, iframe: "<iframe></iframe>", ...over });

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("which broadcast about a record is shown", () => {
  it("shows the one on now, else the soonest to come, else the latest that ended", () => {
    const later = item({ id: "a", planned_start: "2026-12-01T10:00:00Z" });
    const sooner = item({ id: "b", planned_start: "2026-11-20T10:00:00Z" });
    const ended = item({ id: "c", status: "Ended" });
    const on = item({ id: "d", status: "Live" });
    expect(pick([later, sooner, ended])?.id).toBe("b");
    expect(pick([ended, later, on])?.id).toBe("d");
    expect(pick([ended, item({ id: "e", status: "Cancelled" })])?.id).toBe("c");
    expect(pick([])).toBeNull();
  });
});

describe("the player another app puts beside its content", () => {
  it("frames the public watch page while the broadcast is on, sized by its container, and tells the host", async () => {
    const seen: [string, string | undefined][] = [];
    const server = fakeServer({ "GET /api/app/live/embed": () => ({ broadcasts: [item({ id: "x1", status: "Ended" }), item({ id: "x2", status: "Live" })] }) });
    const page = await mount(<LivePlayer entity="Lesson" record="r1" onStatus={(s, b) => seen.push([s, b?.id])} />);
    const frame = page.el.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://acme.example.com/api/site/acme/live/watch/x2");
    expect(frame.getAttribute("allow")).toBe("autoplay; fullscreen");
    expect(frame.style.aspectRatio).toBe("16 / 9");
    expect(frame.style.width).toBe("100%");
    expect(frame.getAttribute("title")).toBe("Lesson 4");
    expect(server.last("GET /api/app/live/embed")?.query).toBe("?entity=Lesson&record=r1");
    expect(seen).toEqual([["Live", "x2"]]);
    await page.unmount();
  });

  it("says what the broadcast says while it is not on, and the replay once it ended, asking again until then", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    let status: EmbedItem["status"] = "Scheduled";
    const seen: string[] = [];
    fakeServer({ "GET /api/app/live/broadcasts/x1/embed": () => item({ id: "x1", status, text: status === "Ended" ? "This broadcast has ended." : "Starts soon.", replay_url: "https://replay.example.com/m.m3u8", replay_text: "Watch the replay" }) });
    const page = await mount(<LivePlayer broadcast="x1" poll={5} aspect="4 / 3" onStatus={(s) => seen.push(s)} />);
    expect(page.text()).toContain("Starts soon.");
    expect(page.el.querySelector("iframe")).toBeNull();
    expect((page.el.querySelector(".lv-embed") as HTMLElement).style.aspectRatio).toBe("4 / 3");
    status = "Live";
    await advance(5_100);
    expect(page.el.querySelector("iframe")).not.toBeNull();
    status = "Ended";
    await advance(5_100);
    expect(page.el.querySelector("iframe")).toBeNull();
    expect(page.el.querySelector('a[href="https://replay.example.com/m.m3u8"]')?.textContent).toBe("Watch the replay");
    expect(seen).toEqual(["Scheduled", "Live", "Ended"]);
    // An ended broadcast is not asked about again.
    const asked = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await advance(30_000);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(asked);
    await page.unmount();
  });

  it("draws nothing, and says `none`, for a record with no broadcast the person may watch", async () => {
    const seen: string[] = [];
    fakeServer({ "GET /api/app/live/embed": () => ({ broadcasts: [] }) });
    const page = await mount(<LivePlayer entity="Lesson" record="r2" poll={0} onStatus={(s) => seen.push(s)} />);
    expect(page.el.querySelector(".lv-embed, iframe")).toBeNull();
    expect(seen).toEqual(["none"]);
    await page.unmount();
  });

  it("tells the host when Live refuses, and treats a broadcast the person may not see as none", async () => {
    const errors: unknown[] = [];
    const seen: string[] = [];
    fakeServer({ "GET /api/app/live/broadcasts/x9/embed": () => json({ error: "not_found", message: "not found" }, 404) });
    const page = await mount(<LivePlayer broadcast="x9" poll={0} onError={(e) => errors.push(e)} onStatus={(s) => seen.push(s)} />);
    expect(errors).toHaveLength(1);
    expect(seen).toEqual(["none"]);
    expect(page.el.querySelector("iframe")).toBeNull();
    await page.unmount();
  });

  it("never frames an address that is not a web address", async () => {
    fakeServer({ "GET /api/app/live/broadcasts/x1/embed": () => item({ id: "x1", status: "Live", page: "javascript:alert(1)" }) });
    const page = await mount(<LivePlayer broadcast="x1" poll={0} />);
    expect(page.el.querySelector("iframe")).toBeNull();
    await page.unmount();
  });

  it("passes a viewing link's secret to Live and nothing else about the person", async () => {
    const server = fakeServer({ "GET /api/app/live/broadcasts/x1/embed": () => item({ id: "x1", status: "Live" }) });
    const page = await mount(<LivePlayer broadcast="x1" link="SECRET" poll={0} />);
    expect(server.last("GET /api/app/live/broadcasts/x1/embed")?.query).toBe("?link=SECRET");
    await page.unmount();
  });
});
