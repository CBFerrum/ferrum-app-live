// What the screens' tests share: the routes of the server faked at `fetch`, a page to draw a screen in, and a way to let
// its requests and timers settle. Nothing here is part of the interface; no test touches a relay or a component of moq.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { ConfirmHost, Toaster } from "@ferrum/kit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export interface Req {
  url: URL;
  method: string;
  body: Record<string, unknown>;
  headers: Headers;
}
type Handler = (req: Req) => Response | unknown;

/** Answers `fetch` from a table of `METHOD /path` → body (or a Response). An address nobody listed is a 404, and is remembered. */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: { key: string; body: Record<string, unknown>; query: string }[] = [];
  const unhandled: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init.method ?? "GET").toUpperCase();
      const key = `${method} ${url.pathname}`;
      let body: Record<string, unknown> = {};
      try {
        body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      } catch {
        /* not JSON */
      }
      calls.push({ key, body, query: url.search });
      const handler = routes[key];
      if (!handler) {
        unhandled.push(key);
        return json({ error: "not_found", message: `no route ${key}` }, 404);
      }
      const out = handler({ url, method, body, headers: new Headers(init.headers) });
      return out instanceof Response ? out : json(out);
    }),
  );
  return { calls, unhandled, count: (key: string) => calls.filter((c) => c.key === key).length, last: (key: string) => calls.filter((c) => c.key === key).at(-1) };
}

/** Lets pending requests, state updates and zero-delay timers finish. */
export async function flush(times = 4) {
  for (let i = 0; i < times; i++) await act(async () => void (vi.isFakeTimers() ? await vi.advanceTimersByTimeAsync(0) : await new Promise((r) => setTimeout(r, 0))));
}

/** Moves faked time on (after `vi.useFakeTimers()`), letting what is due run and settle. */
export async function advance(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  await flush();
}

// jsdom has no modal dialogs: this is enough for the kit's Dialog and confirmDialog.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

/** Draws `ui` at `path` (a route pattern) as if opened at `at`, with a query client, a router, toasts and confirmations. */
export async function mount(ui: React.ReactNode, { path = "*", at = "/", client = new QueryClient({ defaultOptions: { queries: { retry: false } } }) } = {}) {
  const el = document.createElement("div");
  document.body.append(el);
  const router = createMemoryRouter([{ path, element: ui }, ...(path === "*" ? [] : [{ path: "*", element: <p>Elsewhere</p> }])], { initialEntries: [at] });
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
        <Toaster />
        <ConfirmHost />
      </QueryClientProvider>,
    );
  });
  await flush();
  return {
    el,
    router,
    client,
    text: () => el.textContent ?? "",
    /** The first button or link whose words are `name` (a part of them), anywhere on the page. */
    button: (name: string) => [...document.querySelectorAll<HTMLElement>("button, a")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").includes(name)) ?? null,
    unmount: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
  };
}

export async function press(el: HTMLElement | null) {
  if (!el) throw new Error("nothing to press");
  await act(async () => el.click());
  await flush();
}

export async function type(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    set?.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
