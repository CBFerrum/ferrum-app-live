// What the interface knows of Live: a broadcast as the records API gives it, and what the app's own
// routes answer (src/session.rs, src/site.rs of the server; the README's "Routes").

export type Status = "Scheduled" | "Live" | "Ended" | "Cancelled";
export type Audience = "Members" | "Portal" | "Link" | "Public";

export interface Broadcast {
  id: string;
  version: number;
  title: string;
  status: Status;
  description?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  reference_entity?: string | null;
  reference_id?: string | null;
  audience?: Audience | null;
  capacity?: number | null;
  waiting_text?: string | null;
  frame_origins?: string | null;
  owner_email?: string | null;
  presenter_name?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  viewers_peak?: number | null;
  viewers_total?: number | null;
  replay_url?: string | null;
  recording?: string | null;
}

/** The element a page draws (`Relay::element`): its tag, the attribute holding the address with the token, the one holding the stream's name, what it draws into, what it always has. */
export interface ElementSpec {
  tag: string;
  url_attr: string;
  name_attr: string;
  child: string;
  attrs: [string, string][];
}

/** What starting or renewing answers with access: `src/session.rs` `offer` (and `present` adds `recording` and `status`). */
export interface Offer {
  relay: string;
  path: string;
  name: string;
  token: string;
  url: string;
  element: ElementSpec;
  expires_at: string;
  /** Seconds until the token is renewed: two thirds of its life. */
  refresh_in: number;
  recording?: boolean;
  status?: Status;
}

/** What watching answers while there is nothing to watch (`session::state`). */
export interface Waiting {
  status: Status;
  title?: string | null;
  text?: string | null;
  planned_start?: string | null;
  replay_url?: string | null;
  replay_text?: string | null;
}

/** A broadcast in the embed description (`GET /embed`, `GET /broadcasts/{id}/embed`). */
export interface EmbedItem extends Waiting {
  id: string;
  /** The address of the watch page (a public page, framed under the broadcast's frame origins). */
  page: string;
  /** A complete `<iframe>` for pages that write HTML; the component builds its own from `page`. */
  iframe: string;
}

/** A link made by an action: the secret is shown once. */
export interface MadeLink {
  link: string;
  secret: string;
  url: string | null;
  expires_at: string;
}

/** One row of the report "Broadcasts and Their Audience" (`src/reports.rs`): it names no id. */
export interface AudienceRow {
  title: string;
  status: Status;
  started_at: string | null;
  ended_at: string | null;
  viewers_now: number;
  viewers_peak: number;
  viewers_total: number;
}

/** Live Settings as the records API gives them; the key is never in it. */
export interface Settings {
  id?: string;
  version?: number;
  relay_url?: string | null;
  relay_check_url?: string | null;
  signing_key_id?: string | null;
  key_changed_at?: string | null;
  watch_token_minutes?: number | null;
  publish_token_minutes?: number | null;
  default_audience?: Audience | null;
  default_capacity?: number | null;
  recording_default?: boolean | null;
  replay_base_url?: string | null;
  retention_days?: number | null;
  player_module_url?: string | null;
  publisher_module_url?: string | null;
}
