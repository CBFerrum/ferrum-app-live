<div align="center">

# Ferrum Live

**A native app for [Ferrum](https://github.com/CBFerrum/Ferrum), the open-source, AI-first business platform.**

[Overview](#overview) · [How it works](#how-it-works) · [Putting the player beside other content](#putting-the-player-beside-other-content) · [The player component](#the-player-component) · [Routes](#routes) · [The interface](#the-interface) · [Install](#install) · [Develop](#develop) · [Changelog](#changelog)

</div>

---

## Overview

Ferrum Live is one-to-many live video at low delay: one presenter (or a few), a large audience, through a
[Media over QUIC](https://github.com/moq-dev/moq) relay that you run beside Ferrum. A broadcast stands alone or is
about any record (a lesson, a product, a campaign, a meeting with an audience), and the platform's own permissions on that
record decide who may watch it. Two-way meetings stay in Mail and Chat (Comms) on LiveKit; Live is for the other
shape. Live signs the access, counts the audience and serves the pages; sound and pictures never pass through Ferrum.

| At a glance | |
|---|---|
| Version | `0.1.1` |
| Platform | Ferrum `>=0.3.2, <0.4` |
| Requires | nothing else; a relay (docs/deploy.md) |
| Interface | its own at `/live/` (broadcasts, a presenter's control page, the watch page, planning, settings), Ferrum's records screens for links and reports, and the app's two pages for people with no account |
| Records | 4 entities in 1 package: Broadcast, Presenter (child), Broadcast Link, Live Settings |
| Roles | 2: Live User, Live Manager |
| Reports | 2: Broadcasts and Their Audience, Audience by Status |
| Built against | `moq-relay` 0.17.16 (docs/moq.md: what was read, what was not run) |

> [!IMPORTANT]
> Nothing here has met a running relay. docs/moq.md lists the pages read; "What was not run against a real relay" below lists the paths no test could reach.

## How it works

* **A broadcast** has a status that only the app moves: Scheduled until a presenter starts, Live until a presenter or a
  manager ends it (or until nobody has renewed the presenter's token for its life and a minute: upkeep ends it), then Ended;
  Cancelled from Scheduled.
* **Who may present:** its owner, the people it names, the holders of the role it names, or an outsider with a *presenter
  link* (one start, then renewals while Live). A portal person never presents.
* **Who may watch**, an audience ladder where each includes the ones before it: *Members* (signed-in people: for a
  broadcast about a record, those who can read that record; of its own, those who can read the broadcast), *Portal* (and portal
  people, by the record's portal permission when there is one), *Link* (and anyone holding a viewing link), *Public*
  (anyone). The answer for a broadcast that does not exist and one you may not watch is the same.
* **Tokens, one interface.** `src/relay.rs` is the only place that knows the relay. `Relay::token` mints a token for
  exactly this broadcast's path (`{prefix}/{workspace}/{broadcast}`) with one right and an expiry (viewers 10 minutes,
  presenters 60 by default; Live Settings) and nothing else, since moq refuses a claim it does not know. A
  player renews at two thirds of the life through the renewal route, which re-decides every right from scratch.
* **Capacity and counts.** A seat is a keyed hash (of the person, or of the link and a browser's random id, or of the
  browser's random id), never a name, kept in PostgreSQL; taking one locks the broadcast's row, counts, and adds, so two
  viewers cannot both take the last. Renewing a live seat takes no lock. Viewers now and the peak come from this; the relay is told nothing.
* **Links.** A secret is 256 random bits in an address's fragment (`#k=…`, which a browser never sends); only its
  SHA-256 is kept. Revoke at once, or by ending the broadcast, or by expiry (7 days by default, 90 at most).
* **Keys.** The relay's signing key is a Live Setting (*Set Signing Key*, sealed, never shown): an HS256 JWK from
  `moq auth generate`. Rotating without dropping anyone: docs/deploy.md.
* **Recording.** moq documents no recorder, so Live does not record; it links a replay (the *Replay Address* and the
  broadcast's path) and clears it after *Retention days*, saying when (docs/moq.md).
* **Wording.** The pages say only what the server answers: the broadcast's own waiting text, and Live Settings' words for
  ended, cancelled, full, not available and the replay link (defaults in the package). None is in the code.
* **Personal data.** A presenter's name and address (on a broadcast, on a presenter link, in its presenter table) are
  declared personal data: found by address, blanked on erasure. Seats hold none.

## Putting the player beside other content

Live builds no code in other apps; this is the contract they use.

1. **Make a broadcast about the record**: `reference_entity` and `reference_id` (the record's type and id), an audience, a
   capacity if wanted. A broadcast is an ordinary record: any app may create one through the records API.
2. **Ask for the embed**, signed in: `GET /api/app/live/embed?entity=Lesson&record={id}` →
   `{broadcasts: [{id, title, status, planned_start, text, page, iframe}]}`, newest first, only those the caller may watch (a person who may not
   is not told they exist). `iframe` is a complete `<iframe src=… allow="autoplay; fullscreen">`; `page` is the address.
   For one broadcast, `GET …/broadcasts/{id}/embed` (add `?link=` for a viewing link's secret).
3. **Allow the frame**: the broadcast's *frame origins* (one `https://host` per line, at most ten, checked as the
   platform checks them) are the only sites that may frame the page; empty means none. The page answers with its own
   `Content-Security-Policy: frame-ancestors …`.
4. **The three cases**
   * **LMS, a live class**: a lesson (or session) gets a broadcast about it with audience *Members* or *Portal*; the lesson page
     calls the embed route and draws `iframe` above its text and chat, and shows `text` (the waiting, ended or replay words)
     when `status` is not Live. People who may read the lesson may watch it; enrolled students on the portal need the portal role's read on the
     lesson. The teacher is named in *Presenters*.
   * **Commerce, live shopping**: a product or a collection gets a broadcast of audience *Public*, with the shop's origin in *frame origins*;
     the product page places `iframe` beside the cart. The page and the cart do not talk to each other (they are
     different origins); the cart stays the shop's.
   * **Comms, a meeting with an audience**: a calendar event gets a broadcast about it; the meeting page embeds the same
     `iframe`. Two-way talk stays in the event's LiveKit meeting; the audience watches here. A guest list is
     *Link*: one viewing link per guest (*Make a Viewing Link*), or the event's own permission as *Members*.
5. **A link for people with none**: the action *Make a Viewing Link* (`label`, `days`) gives a one-time address to send
   (`#k=` in its fragment). Append it to `page` or pass it as `link`.

## Routes

At `/api/app/live/…` (signed in) and `/api/site/{workspace}/live/…` (public: a request carries only what its body says).
Bodies are JSON; every answer is `no-store`.

| Route | What it does |
|---|---|
| `POST /broadcasts/{id}/publish` `{link?}` | Start presenting (a presenter, or a presenter link once) → `{relay, path, name, token, url, element, expires_at, refresh_in, recording, status}`. Scheduled becomes Live |
| `POST /broadcasts/{id}/publish/refresh` | Renew the presenter's token; only while Live |
| `POST /broadcasts/{id}/end` `{link?}` | End it: a presenter, a presenter link, or someone who may change broadcasts and see this one |
| `POST /broadcasts/{id}/watch` `{link?, seat?}` | A viewer's seat and token (same shape); or `{status, title, text, replay_url, replay_text}` while it is Scheduled, Ended or Cancelled; or `503 {error: "full", message}`. `seat` is a random id of 16 to 64 letters and digits made by the page (not for signed-in people) |
| `POST /broadcasts/{id}/watch/refresh` | Renew; refused (404) once the right is gone or the seat is not live, `409` once it has ended |
| `POST /broadcasts/{id}/watch/leave` | Give the seat up |
| `GET /embed?entity=&record=` and `GET /broadcasts/{id}/embed` | The embed description above |
| `GET /watch/{id}`, `GET /present/{id}` | The pages: one script, the pinned `<moq-watch>` or `<moq-publish>` element (Live Settings), CSP with the relay and that script's origin only |

## The player component

For the interfaces of other apps (a lesson, a product with its cart beside it, a meeting's audience view). Live builds no code in
those apps; the component is Live's, in `ui/src/embed/` (`import { LivePlayer, pick } from "./embed"`), and what it speaks is only the
embed routes above. An app that cannot import it implements the contract in a few lines, from the same routes.

```tsx
<LivePlayer entity="Lesson" record={lesson.id} onStatus={(status) => setLive(status === "Live")} />
<LivePlayer broadcast={id} link={secret} mode="inline" aspect="4 / 3" poll={10} />
```

| Prop | Meaning |
|---|---|
| `entity`, `record` | The record the broadcast is about. Of the broadcasts the person may watch, shows the one on now, else the soonest to come, else the latest that ended |
| `broadcast` | One broadcast's id, instead of a record |
| `link` | A viewing link's secret, for a person with no account who holds one (passed to the embed route only) |
| `mode` | `frame` (default): Live's public watch page in an `<iframe>` built from `page`, never from the server's HTML string. The relay and its component then load under that page's own policy and the host's Content-Security-Policy needs nothing; the broadcast must name the host's origin in its frame origins, and its audience must reach people without a session, since that page carries none. `inline`: the player is drawn in the host's page with the person's session (so *Members* works); the host's manifest then needs the relay in `ui.csp.connect`, and it carries the moq components in its own build |
| `aspect` | CSS `aspect-ratio` of the picture, `16 / 9` by default. The width is always the container's; the height follows |
| `poll` | Seconds between asking again until the broadcast has ended; `20`, or `0` to ask once |
| `title`, `className` | The frame's name for assistive technology (the broadcast's title by default); a class on the box |

| Event | When |
|---|---|
| `onStatus(status, broadcast)` | What is shown changes: `Scheduled`, `Live`, `Ended`, `Cancelled`, or `none` when the person may watch no broadcast about the record (Live does not say whether one exists) |
| `onBroadcasts(list)` | Each time the list is read, every broadcast about the record the person may watch, newest first |
| `onError(error)` | Live refused or did not answer |

It draws nothing for `none`; while there is nothing to watch it shows the broadcast's own words (waiting, ended, cancelled, and the replay
link once it ended); a replay or frame address that is not `http(s)` is never linked or framed. It sends nothing about the person to the relay. Exported, but not
yet published as a package: another app's repository takes it by copying `ui/src/embed/` (it needs `@ferrum/client`, `@ferrum/kit` and, for
`inline`, the rest of `ui/src`), or builds against this checkout.

## The interface

Live has an interface of its own at `/live/` for people who are signed in (`ui/`, built with Ferrum-Frontend's packages, `ui/dist` committed):

| Screen | Route | What it does |
|---|---|---|
| Broadcasts | `/live/` | Live now, upcoming and ended, with status, the record each is about, audience, viewers now and the peak; cancel a scheduled one |
| New broadcast | `/live/new` | Plan one (also `?entity=Lesson&record={id}`, so another app can send a person here with the record chosen) |
| Control page | `/live/b/{id}` | A presenter's page: camera and microphone check with a local preview, *Go live*, the picture sent, viewers now, access renewed on a timer and a visible state when a renewal is refused, *End*, the watch address, a viewing link and a one-time presenter link |
| Watch page | `/live/watch/{id}` | The player inside the shell: waiting, live, ended and replay words, a full broadcast in the server's words with *Try again*, renewal, reconnection, captions and keys |
| Live Settings | `/live/settings` | Relay address, the signing key (written, never read back), token lifetimes, default audience and capacity, replay and retention, the scripts the outside pages load |

Ferrum's records screens still carry Broadcast Link, Live Settings' wording and the two reports. The pages for people with no account (a viewing link, a presenter link, a public broadcast) stay the app's own (`GET /watch/{id}`, `GET /present/{id}`).

* **The moq components are bundled**: `@moq/watch` 0.6.6 and `@moq/publish` 0.5.6 (the versions docs/moq.md pins) are `ui/package.json`'s one dependency of its own and arrive as lazy chunks of the release, loaded when a watch or control page is first drawn; the list page loads none, and the entry script is about 1 KB. Nothing is fetched from another address at run time. (The pages for people outside load the player from the address in Live Settings, `https://esm.sh/...` by default: serve your own copy to keep third parties off them.)
* **The relay address, twice.** Browsers inside Ferrum may connect only where the app's manifest allows: `ui.csp.connect` names the app setting *Relay address for browsers* (`setting:relay_url`), which an administrator sets, under the app's settings, to the same address as Live Settings' *Relay Address*. The platform offers no way to read that from a Live Setting.
* **Viewers now** come from the report *Broadcasts and Their Audience*, whose rows name no id, so a row is matched by title and start; two broadcasts alike in both show a dash rather than a guess.
* **Health.** The doctor's check of the relay is in the support report (a support key) and `ferrum task doctor`; no route answers a signed-in person, so the settings page shows what the settings themselves say (address and key set) and states that.
* **Not built:** a calendar of broadcasts, a replay list, choosing who may present (the records form does), the wording of the pages (the records form does).
* **Words.** Every word is passed through `t()`; no language file is shipped, so all of them are English until a workspace translates them (`ui/dist/words.json`).

## What was not run against a real relay

Every path to moq. The suite runs the fake behind `Relay`. Untested against the real thing: that `moq auth serve` accepts
the tokens this app signs (only the signature scheme is checked, against a token moq's own JavaScript library signed);
that a relay with `--auth-url` admits a session dialed at `{relay}/{path}?jwt=…`; the player and capture elements on
these pages (including that the pinned script loads under the page's CSP and that a changed `url` attribute reconnects);
the WebSocket fallback; key rotation with two key files; the compose overlay and the manifest; the relay's `/health`
as the doctor asks it; that the platform lets a page set its own `Content-Security-Policy` on `/api/site/…`; and
that the page, opened under `/api/app/live/…`, is identified as the signed-in person by whatever the platform sends it
(the routes are tested with a person given; the page's own fetch was never run in a browser). And portal people
were simulated (an outside context), not signed in through a portal.

Not run for the interface (no relay, no browser with a camera, no server): that the two moq elements, bundled, register and play under
the shell's policy (`script-src 'self'`, `worker-src 'self' blob:`, `connect-src` from the app setting); that `<moq-publish>` takes the camera and
microphone chosen on the control page (it reads `device.preferred` of the camera and microphone it makes, which the page sets when they
appear); that the element's connection status reports a dropped connection as the page expects; the Opus fallback, whose two WebAssembly files
the build copies beside its chunk (a browser without WebCodecs audio); the captions picker (it lists what the broadcast's catalog
offers); full screen and the keys in a real browser; and that the shell serves `/live/` from `ui/dist` (the platform's list of app interfaces, `server/src/packages.rs`, does not name Live yet).
The tests fake the components (custom elements with moq's attributes and signals), the relay and every route, at `fetch`.

## Install

Install the app from a Ferrum store or by listing it in the server's build (docs/deploy.md, "What the platform would add").
Run the relay (docs/deploy.md), then in Live Settings give its address and *Set Signing Key*, and set the same address under the app's
settings (*Relay address for browsers*).

## Develop

    export FERRUM_LIVE_TEST_DATABASE_URL=postgres://ferrum:ferrum@localhost:5432/ferrum_live_test
    cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test

The app builds against the platform's main branch (`.cargo/config.toml` points a checkout at it, git-ignored).

The interface (`ui/`) builds with Ferrum-Frontend's packages from the sibling checkout (`../../ferrum/web`), as the other apps' do, and has moq's two
components in `ui/node_modules`:

    cd ui && npm ci --ignore-scripts && npm run check && npm run typecheck && npm test
    npm run build        # rebuilds ui/dist, which is committed

## Changelog

| Version | What changed |
|---|---|
| **0.1.1** | An interface of its own at `/live/`: the broadcasts (live now, upcoming, ended; cancel), planning one, a presenter's control page (device check and preview, go live, renewal with its refusals shown, end, viewers now, viewing and one-time presenter links), the watch page inside the shell (waiting, live, ended and replay, full with retry, renewal, reconnection, captions and keys, seat given up on leaving), an embeddable player component, and Live Settings (the key written, never read back). moq's two components bundled at their pinned versions. |
| **0.1.0** | The first release: broadcasts about any record or alone, access by short-lived signed tokens through one relay interface (moq-relay 0.17.16), seats counted atomically, an audience ladder, viewing and presenter links, a page and embed description, counts, reports, replay links with retention, deploy files and a health check. |
