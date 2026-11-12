// One person's access to one broadcast, as a presenter or as a viewer: ask for it, keep it renewed, say
// plainly when it is refused, give it up. No React and no moq in here: the screens draw `state`, and the
// calls, the timers and the clock are handed in, so every rule below is tested with fakes.
//
// The rules come from the server (README "Routes", src/session.rs): a token's `refresh_in` is two thirds
// of its life; a renewal re-decides every right, so a 404 means the right is gone and a 409 that the
// broadcast has ended; a viewer who finds no seat is told in the server's words (503 `full`); a broadcast
// that has not started answers `{status, text}` instead of access, and is asked again.

import type { Offer, Waiting } from "./model";

export type Role = "watch" | "publish";

/** What a route answered: `ok` with its body, or a refusal with the server's own words. */
export interface Reply {
  ok: boolean;
  /** 0 when nothing answered. */
  status: number;
  /** The server's error code (`full`, `not_found`, `conflict`, …). */
  code?: string;
  message?: string;
  body?: unknown;
}

/** Calls `POST /api/app/live/broadcasts/{id}/{path}`. */
export type Call = (path: string) => Promise<Reply>;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  now(): number;
}

export const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as number), now: () => Date.now() };

export type Phase =
  /** Nothing asked yet (or given up). */
  | "idle"
  | "connecting"
  | "live"
  /** Scheduled: asked again until it starts. */
  | "waiting"
  | "ended"
  | "cancelled"
  /** No seat: the server's words, asked again. */
  | "full"
  /** Nothing to see for this person (not found, not allowed, not set up): the server's words. */
  | "closed"
  /** Nothing answered: asked again. */
  | "offline";

export type Renewal =
  /** Renewed on time (or not yet due). */
  | "ok"
  /** The last renewal did not get through: asked again before the access runs out. */
  | "retrying"
  /** Refused: the right is gone or the broadcast is over. The stream stops when the current access runs out. */
  | "refused";

/** The connection of the element to the relay, as the component reports it. */
export type Link = "connecting" | "connected" | "disconnected";

export interface SessionState {
  phase: Phase;
  offer: Offer | null;
  waiting: Waiting | null;
  /** The server's words for `full`, `closed`, `offline` and a refused renewal. */
  message: string | null;
  /** When `full`, `waiting` or `offline` ask again. */
  retryAt: number | null;
  renewal: Renewal;
  /** When the access is renewed next, and when it was last. */
  nextRenewal: number | null;
  lastRenewal: number | null;
  /** When the current access stops working. */
  expiresAt: number | null;
  link: Link | null;
  /** A reconnection under way: a new token is being asked for because the connection was lost. */
  reconnecting: boolean;
}

const INITIAL: SessionState = { phase: "idle", offer: null, waiting: null, message: null, retryAt: null, renewal: "ok", nextRenewal: null, lastRenewal: null, expiresAt: null, link: null, reconnecting: false };

/** How long to wait before asking again. */
export const EVERY = { waiting: 10_000, full: 15_000, offline: 5_000, retry: 10_000, reconnect: 10_000 };
/** A renewal is never later than this long before the access runs out. */
const MARGIN = 30_000;

const isState = (b: unknown): b is Waiting => !!b && typeof b === "object" && typeof (b as Waiting).status === "string" && !("token" in (b as object));
const isOffer = (b: unknown): b is Offer => !!b && typeof b === "object" && typeof (b as Offer).token === "string" && typeof (b as Offer).url === "string";

export class Session {
  private s: SessionState = INITIAL;
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private expiry: unknown = null;
  private busy = false;
  private closed = false;
  private lastReconnect = 0;

  constructor(
    readonly role: Role,
    private readonly call: Call,
    private readonly timers: Timers = realTimers,
    /** Gives a seat up when the page is going away (keepalive request), where a normal one may not finish. */
    private readonly beacon?: (path: string) => void,
  ) {}

  get state(): SessionState {
    return this.s;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<SessionState>) {
    this.s = { ...this.s, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  private first() {
    return this.role === "publish" ? "publish" : "watch";
  }
  private again() {
    return this.role === "publish" ? "publish/refresh" : "watch/refresh";
  }

  private stop() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
  private after(ms: number, fn: () => void) {
    this.stop();
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (!this.closed) fn();
    }, ms);
  }

  /** Asks for access: a presenter starts, a viewer takes a seat. A second press while one is on its way does nothing. */
  async start(): Promise<void> {
    if (this.busy || this.closed) return;
    this.busy = true;
    this.stop();
    this.set({ phase: this.s.offer ? this.s.phase : "connecting", message: null, retryAt: null });
    let reply: Reply;
    try {
      reply = await this.call(this.first());
    } finally {
      this.busy = false;
    }
    if (this.closed) return;
    this.take(reply, false);
  }

  /** "Try again" on a full broadcast, an offline page or a refusal. */
  retry(): Promise<void> {
    return this.start();
  }

  /** What an answer means, for the first call (`renewing` false) and for a renewal. */
  private take(r: Reply, renewing: boolean) {
    const now = this.timers.now();
    if (r.ok && isOffer(r.body)) return this.accept(r.body, now);
    if (r.ok && isState(r.body)) {
      const status = r.body.status;
      this.dropOffer();
      if (status === "Scheduled") {
        this.set({ phase: "waiting", waiting: r.body, message: null, retryAt: now + EVERY.waiting, renewal: "ok", nextRenewal: null });
        this.after(EVERY.waiting, () => void this.start());
      } else {
        this.set({ phase: status === "Cancelled" ? "cancelled" : status === "Live" ? "connecting" : "ended", waiting: r.body, message: null, retryAt: null, nextRenewal: null });
      }
      return;
    }
    if (renewing) return this.refusedRenewal(r);
    if (r.status === 0) {
      this.set({ phase: "offline", message: r.message ?? null, retryAt: now + EVERY.offline });
      this.after(EVERY.offline, () => void this.start());
      return;
    }
    if (r.status === 503 && r.code === "full") {
      this.set({ phase: "full", message: r.message ?? null, retryAt: now + EVERY.full });
      this.after(EVERY.full, () => void this.start());
      return;
    }
    // Not found, not allowed, not set up, or a presenter's start on a broadcast that is over: the server's words, as they are.
    this.set({ phase: r.status === 409 ? "ended" : "closed", message: r.message ?? null, retryAt: null });
  }

  private accept(o: Offer, now: number) {
    const expires = Date.parse(o.expires_at);
    const expiresAt = Number.isNaN(expires) ? now + Math.max(o.refresh_in, 60) * 1000 * 1.5 : expires;
    // Two thirds of the life, as the server says, but never later than half a minute before the end.
    const wait = Math.max(5_000, Math.min(o.refresh_in * 1000, expiresAt - now - MARGIN));
    this.set({ phase: "live", offer: o, waiting: null, message: null, retryAt: null, renewal: "ok", nextRenewal: now + wait, lastRenewal: now, expiresAt, reconnecting: false });
    this.after(wait, () => void this.renew());
    this.watchExpiry(expiresAt, now);
  }

  /** When a token that was not renewed runs out, the stream stops: the screen says so. */
  private watchExpiry(at: number, now: number) {
    if (this.expiry !== null) this.timers.clear(this.expiry);
    this.expiry = this.timers.set(() => {
      this.expiry = null;
      if (this.closed || this.s.expiresAt !== at) return;
      this.dropOffer();
      this.stop();
      this.set({ phase: "closed", message: this.s.message ?? null, nextRenewal: null });
    }, Math.max(0, at - now));
  }

  private dropOffer() {
    if (this.expiry !== null) this.timers.clear(this.expiry);
    this.expiry = null;
    this.set({ offer: null, expiresAt: null, reconnecting: false });
  }

  /** Renews the access: the element's address changes to the new token's. */
  async renew(): Promise<void> {
    if (this.busy || this.closed || !this.s.offer) return;
    this.busy = true;
    let reply: Reply;
    try {
      reply = await this.call(this.again());
    } finally {
      this.busy = false;
    }
    if (this.closed) return;
    this.take(reply, true);
  }

  private async refusedRenewal(r: Reply) {
    const now = this.timers.now();
    const until = this.s.expiresAt ?? now;
    // Nothing answered or the server faltered: asked again before the access runs out.
    if ((r.status === 0 || r.status >= 500 || r.status === 429) && until - now > EVERY.retry) {
      const wait = Math.min(EVERY.retry, Math.max(1_000, (until - now) / 2));
      this.set({ renewal: "retrying", message: r.message ?? null, nextRenewal: now + wait });
      this.after(wait, () => void this.renew());
      return;
    }
    this.stop();
    if (r.status === 409) {
      // The broadcast has ended (a viewer is told what it says now, with its replay); a presenter's stream is over.
      this.dropOffer();
      this.set({ phase: "ended", message: r.message ?? null, renewal: "refused", nextRenewal: null });
      if (this.role === "watch") {
        const again = await this.call("watch").catch((): Reply => ({ ok: false, status: 0 }));
        if (!this.closed && again.ok && isState(again.body)) this.set({ waiting: again.body, phase: again.body.status === "Cancelled" ? "cancelled" : "ended" });
      }
      return;
    }
    // 404: the right is gone (or the seat). The stream goes on until the current access runs out; the screen says so.
    this.set({ renewal: "refused", message: r.message ?? null, nextRenewal: null });
  }

  /** The element lost its relay: asked for a new token (a new address starts a new sequence of attempts), not oftener than every ten seconds. */
  async linkChanged(link: Link): Promise<void> {
    if (this.closed) return;
    this.set({ link });
    if (link !== "disconnected" || !this.s.offer || this.s.renewal === "refused" || this.busy) return;
    const now = this.timers.now();
    if (now - this.lastReconnect < EVERY.reconnect) return;
    this.lastReconnect = now;
    this.set({ reconnecting: true });
    await this.renew();
    if (!this.closed) this.set({ reconnecting: false });
  }

  /** A presenter ends the broadcast. The reply is the server's, for the screen to show when it refuses. */
  async end(): Promise<Reply> {
    const r = await this.call("end");
    if (r.ok && !this.closed) {
      this.stop();
      this.dropOffer();
      this.set({ phase: "ended", message: null, renewal: "ok", nextRenewal: null });
    }
    return r;
  }

  /** A viewer gives the seat up (leaving the page); the session is over. */
  async leave(): Promise<void> {
    const held = this.role === "watch" && (this.s.phase === "live" || !!this.s.offer);
    this.finish();
    if (held) await this.call("watch/leave").catch(() => undefined);
  }

  /** The page is going away: the seat is given up by a request that outlives it. */
  pageHide(): void {
    if (this.role === "watch" && this.s.offer && !this.closed) this.beacon?.("watch/leave");
  }

  /** Ready to ask again after a `finish` (React runs an effect, undoes it and runs it again). */
  open(): void {
    this.closed = false;
  }

  /** Stops every timer; nothing more is asked until `open`. */
  finish(): void {
    this.closed = true;
    this.stop();
    if (this.expiry !== null) this.timers.clear(this.expiry);
    this.expiry = null;
    this.set({ ...INITIAL, phase: "idle" });
  }
}
