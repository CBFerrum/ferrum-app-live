// The two moq web components, bundled with this release as lazy chunks (the exact versions docs/moq.md
// pins, in ui/package.json) and never fetched from anywhere else. A page that only lists broadcasts loads
// none of this; the watch page loads the player, the control page the capture element, when first drawn.
// Which one a page needs is whatever element the server's offer names (`Offer.element.tag`).

const LOADERS: Record<string, () => Promise<unknown>> = {
  "moq-watch": () => import("@moq/watch/element"),
  "moq-publish": () => import("@moq/publish/element"),
};

const loaded = new Map<string, Promise<unknown>>();

/** Whether this release can draw the element a server names. */
export const knows = (tag: string): boolean => tag in LOADERS;

/** Registers an element's definition (once). Rejects for a tag this release does not ship, or when the chunk cannot be fetched. */
export function define(tag: string): Promise<unknown> {
  const load = LOADERS[tag];
  if (!load) return Promise.reject(new Error(`no component ${tag}`));
  let p = loaded.get(tag);
  if (!p) {
    p = load().catch((e: unknown) => {
      loaded.delete(tag);
      throw e;
    });
    loaded.set(tag, p);
  }
  return p;
}

/** What the browser can do for publishing, as moq's own probe finds it (a separate small chunk, asked on the control page only). */
export interface PublishSupport {
  webtransport: "full" | "partial" | "none";
  audio: { capture: boolean };
  video: { capture: "full" | "partial" | "none"; encoding: unknown };
}

export async function publishSupport(): Promise<PublishSupport> {
  const m = await import("@moq/publish/support");
  return (await m.isSupported()) as unknown as PublishSupport;
}
