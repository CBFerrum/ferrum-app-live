import { describe, expect, it } from "vitest";
import type { Offer } from "./model";
import { EVERY, type Call, type Reply, Session, type Timers } from "./session";

/** A clock that moves when told, and timers that fire when it reaches them. */
function clock(start = 1_000_000) {
  let now = start;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    now: () => now,
    set: (fn, ms) => {
      pending.set(next, { at: now + ms, fn });
      return next++;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const advance = async (ms: number) => {
    const to = now + ms;
    for (;;) {
      const due = [...pending.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    now = to;
  };
  return { timers, advance, pending: () => pending.size, now: () => now };
}

const offer = (over: Partial<Offer> = {}, token = "t1", life = 600): Offer => ({
  relay: "https://relay.example.com",
  path: "live/ws/b",
  name: "live.hang",
  token,
  url: `https://relay.example.com/live/ws/b?jwt=${token}`,
  element: { tag: "moq-watch", url_attr: "url", name_attr: "name", child: "canvas", attrs: [] },
  expires_at: new Date(1_000_000 + life * 1000).toISOString(),
  refresh_in: (life * 2) / 3,
  ...over,
});
const ok = (body: unknown): Reply => ({ ok: true, status: 200, body });
const no = (status: number, message: string, code = "error"): Reply => ({ ok: false, status, code, message });

/** A route that answers from a script, one reply per call, and remembers what it was asked. */
function script(replies: (Reply | ((path: string) => Reply))[]) {
  const asked: string[] = [];
  const call: Call = async (path) => {
    asked.push(path);
    const r = replies.shift();
    if (!r) throw new Error(`unexpected call ${path}`);
    return typeof r === "function" ? r(path) : r;
  };
  return { call, asked };
}

describe("a viewer's access", () => {
  it("takes a seat, renews at two thirds of the token's life and gives the new address to the player", async () => {
    const c = clock();
    const s = script([ok(offer()), ok(offer({ expires_at: new Date(1_000_000 + 400_000 + 600_000).toISOString() }, "t2"))]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("live");
    expect(session.state.offer?.url).toContain("jwt=t1");
    expect(session.state.nextRenewal).toBe(1_000_000 + 400_000);
    await c.advance(399_000);
    expect(s.asked).toEqual(["watch"]);
    await c.advance(2_000);
    expect(s.asked).toEqual(["watch", "watch/refresh"]);
    expect(session.state.offer?.url).toContain("jwt=t2");
    expect(session.state.renewal).toBe("ok");
    session.finish();
  });

  it("never asks later than half a minute before the token runs out", async () => {
    const c = clock();
    const s = script([ok(offer({ refresh_in: 590 }))]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.nextRenewal).toBe(1_000_000 + 570_000);
    session.finish();
  });

  it("sends a second press nowhere while the first is on its way", async () => {
    const c = clock();
    const s = script([ok(offer())]);
    const session = new Session("watch", s.call, c.timers);
    await Promise.all([session.start(), session.start(), session.start()]);
    expect(s.asked).toEqual(["watch"]);
    session.finish();
  });

  it("says the server's words when there is no seat, asks again later, and takes the seat when one is free", async () => {
    const c = clock();
    const s = script([no(503, "This broadcast is full. Try again in a moment.", "full"), ok(offer())]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("full");
    expect(session.state.message).toBe("This broadcast is full. Try again in a moment.");
    expect(session.state.retryAt).toBe(1_000_000 + EVERY.full);
    await session.retry();
    expect(session.state.phase).toBe("live");
    expect(c.pending()).toBeGreaterThan(0);
    session.finish();
  });

  it("asks a full broadcast again by itself", async () => {
    const c = clock();
    const s = script([no(503, "Full.", "full"), ok(offer())]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await c.advance(EVERY.full + 10);
    expect(session.state.phase).toBe("live");
    session.finish();
  });

  it("waits for a broadcast that has not started, asking every few seconds, and plays when it begins", async () => {
    const c = clock();
    const waiting = { status: "Scheduled", title: "Launch", text: "Starts soon.", planned_start: "2026-11-14T10:00:00Z" };
    const s = script([ok(waiting), ok(waiting), ok(offer())]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("waiting");
    expect(session.state.waiting?.text).toBe("Starts soon.");
    await c.advance(EVERY.waiting + 1);
    expect(session.state.phase).toBe("waiting");
    await c.advance(EVERY.waiting + 1);
    expect(session.state.phase).toBe("live");
    expect(s.asked).toEqual(["watch", "watch", "watch"]);
    session.finish();
  });

  it("shows an ended broadcast's words and replay, and does not ask again", async () => {
    const c = clock();
    const s = script([ok({ status: "Ended", title: "Launch", text: "This broadcast has ended.", replay_url: "https://replay.example.com/x/master.m3u8", replay_text: "Watch the replay" })]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("ended");
    expect(session.state.waiting?.replay_url).toContain("master.m3u8");
    expect(c.pending()).toBe(0);
  });

  it("tells a viewer who may not watch what the server says, and nothing more", async () => {
    const c = clock();
    const s = script([no(404, "broadcast not found", "not_found")]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("closed");
    expect(session.state.message).toBe("broadcast not found");
    expect(c.pending()).toBe(0);
  });

  it("keeps trying when nothing answers", async () => {
    const c = clock();
    const s = script([{ ok: false, status: 0, message: "Cannot reach the server." }, ok(offer())]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("offline");
    await c.advance(EVERY.offline + 1);
    expect(session.state.phase).toBe("live");
    session.finish();
  });

  it("shows a refused renewal, keeps the picture until the access runs out, then says the stream stopped", async () => {
    const c = clock();
    const s = script([ok(offer()), no(404, "broadcast not found", "not_found")]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await c.advance(401_000);
    expect(session.state.renewal).toBe("refused");
    expect(session.state.message).toBe("broadcast not found");
    expect(session.state.offer).not.toBeNull();
    expect(session.state.phase).toBe("live");
    // No more renewals are asked.
    await c.advance(100_000);
    expect(s.asked).toEqual(["watch", "watch/refresh"]);
    await c.advance(200_000);
    expect(session.state.phase).toBe("closed");
    expect(session.state.offer).toBeNull();
    expect(session.state.message).toBe("broadcast not found");
  });

  it("learns that the broadcast ended when a renewal says 409, and fetches its words and replay", async () => {
    const c = clock();
    const s = script([ok(offer()), no(409, "the broadcast is ended", "conflict"), ok({ status: "Ended", text: "This broadcast has ended.", replay_url: "https://r.example.com/m.m3u8", replay_text: "Replay" })]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await c.advance(401_000);
    expect(session.state.phase).toBe("ended");
    expect(session.state.offer).toBeNull();
    expect(session.state.waiting?.replay_url).toBe("https://r.example.com/m.m3u8");
    expect(s.asked).toEqual(["watch", "watch/refresh", "watch"]);
  });

  it("asks again when a renewal does not get through, before the access runs out", async () => {
    const c = clock();
    const s = script([ok(offer()), { ok: false, status: 0, message: "Cannot reach the server." }, ok(offer({}, "t2"))]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await c.advance(401_000);
    expect(session.state.renewal).toBe("retrying");
    expect(session.state.nextRenewal).toBe(1_000_000 + 400_000 + EVERY.retry);
    await c.advance(EVERY.retry + 1);
    expect(session.state.renewal).toBe("ok");
    expect(session.state.offer?.url).toContain("jwt=t2");
    session.finish();
  });

  it("asks for a new address when the connection is lost, but not oftener than every ten seconds", async () => {
    const c = clock();
    const s = script([ok(offer()), ok(offer({}, "t2")), ok(offer({}, "t3"))]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await session.linkChanged("disconnected");
    expect(session.state.offer?.url).toContain("jwt=t2");
    expect(session.state.reconnecting).toBe(false);
    await session.linkChanged("disconnected");
    expect(s.asked).toEqual(["watch", "watch/refresh"]);
    await c.advance(EVERY.reconnect + 1);
    await session.linkChanged("disconnected");
    expect(s.asked).toEqual(["watch", "watch/refresh", "watch/refresh"]);
    session.finish();
  });

  it("gives the seat up on leaving, only when it holds one", async () => {
    const c = clock();
    const s = script([ok(offer()), ok({})]);
    const session = new Session("watch", s.call, c.timers);
    await session.start();
    await session.leave();
    expect(s.asked).toEqual(["watch", "watch/leave"]);
    expect(session.state.phase).toBe("idle");
    const none = script([]);
    await new Session("watch", none.call, c.timers).leave();
    expect(none.asked).toEqual([]);
  });

  it("gives the seat up by a request that outlives the page", async () => {
    const c = clock();
    const sent: string[] = [];
    const s = script([ok(offer())]);
    const session = new Session("watch", s.call, c.timers, (p) => sent.push(p));
    session.pageHide();
    expect(sent).toEqual([]);
    await session.start();
    session.pageHide();
    expect(sent).toEqual(["watch/leave"]);
    session.finish();
  });
});

describe("a presenter's access", () => {
  const publish = (token = "p1") => offer({ element: { tag: "moq-publish", url_attr: "url", name_attr: "name", child: "video", attrs: [["source", "camera"]] }, recording: false, status: "Live" }, token, 3600);

  it("starts, renews at two thirds of an hour, and says nothing when all is well", async () => {
    const c = clock();
    const s = script([ok(publish()), ok(publish("p2"))]);
    const session = new Session("publish", s.call, c.timers);
    await session.start();
    expect(session.state.phase).toBe("live");
    expect(session.state.nextRenewal).toBe(1_000_000 + 2_400_000);
    await c.advance(2_401_000);
    expect(s.asked).toEqual(["publish", "publish/refresh"]);
    expect(session.state.offer?.url).toContain("jwt=p2");
    expect(session.state.renewal).toBe("ok");
    session.finish();
  });

  it("shows when the right was lost: the renewal is refused and the stream is said to stop when the access ends", async () => {
    const c = clock();
    const s = script([ok(publish()), no(404, "broadcast not found", "not_found")]);
    const session = new Session("publish", s.call, c.timers);
    await session.start();
    await c.advance(2_401_000);
    expect(session.state.renewal).toBe("refused");
    expect(session.state.message).toBe("broadcast not found");
    expect(session.state.expiresAt).toBe(1_000_000 + 3_600_000);
    expect(session.state.phase).toBe("live");
    session.finish();
  });

  it("stops at once when the broadcast was ended under it", async () => {
    const c = clock();
    const s = script([ok(publish()), no(409, "the broadcast is ended", "conflict")]);
    const session = new Session("publish", s.call, c.timers);
    await session.start();
    await c.advance(2_401_000);
    expect(session.state.phase).toBe("ended");
    expect(session.state.offer).toBeNull();
    expect(session.state.message).toBe("the broadcast is ended");
    expect(s.asked).toEqual(["publish", "publish/refresh"]);
  });

  it("is told the broadcast is over when it tries to start one that has ended", async () => {
    const s = script([no(409, "the broadcast is ended", "conflict")]);
    const session = new Session("publish", s.call, clock().timers);
    await session.start();
    expect(session.state.phase).toBe("ended");
    expect(session.state.message).toBe("the broadcast is ended");
  });

  it("ends the broadcast and stops renewing; a refusal comes back in the server's words", async () => {
    const c = clock();
    const s = script([ok(publish()), no(404, "broadcast not found", "not_found"), ok({ status: "Ended" })]);
    const session = new Session("publish", s.call, c.timers);
    await session.start();
    const refused = await session.end();
    expect(refused.ok).toBe(false);
    expect(refused.message).toBe("broadcast not found");
    expect(session.state.phase).toBe("live");
    const done = await session.end();
    expect(done.ok).toBe(true);
    expect(session.state.phase).toBe("ended");
    expect(session.state.offer).toBeNull();
    expect(c.pending()).toBe(0);
  });

  it("does not give a seat up on leaving: a presenter ends the broadcast on purpose", async () => {
    const c = clock();
    const s = script([ok(publish())]);
    const session = new Session("publish", s.call, c.timers);
    await session.start();
    await session.leave();
    expect(s.asked).toEqual(["publish"]);
  });
});
