<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img alt="Ferrum Live: live video to a large audience at low delay" src="docs/assets/banner-light.svg" width="100%">
</picture>

<br>

[![Version](https://img.shields.io/badge/version-0.1.1-be123c?style=flat-square)](CHANGELOG.md)
[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Ferrum platform](https://img.shields.io/badge/runs%20on-Ferrum-2f5bea?style=flat-square)](https://github.com/CBFerrum/Ferrum)
![Rust](https://img.shields.io/badge/Rust-server-b7410e?style=flat-square&logo=rust)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-data-336791?style=flat-square&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-TypeScript-0ea5e9?style=flat-square&logo=react&logoColor=white)
![Media over QUIC](https://img.shields.io/badge/Media%20over%20QUIC-moq--relay%200.17.16-be123c?style=flat-square)
![Tests](https://img.shields.io/badge/tests-5%20Rust%20%2B%20~90%20UI-16a34a?style=flat-square)

### Put one presenter in front of a large audience at low delay, about any record, with seats, links and replays you control.

Ferrum Live runs one-to-many live video through a [Media over QUIC](https://github.com/moq-dev/moq) relay that you run beside Ferrum. A broadcast stands alone or is about a lesson, a product, a campaign or a meeting with an audience, and the platform's own permissions on that record decide who may watch. It is for training, webinars, live shopping and town halls, instead of a third-party streaming service. Sound and pictures never pass through Ferrum: Live signs the access, counts the audience and serves the pages.

[💡 Why](#-why-live) · [📸 Screenshots](#-screenshots) · [✨ Features](#-features) · [📊 Compare](#-how-it-compares) · [📍 Roadmap](#-roadmap) · [🚀 Install](#-install) · [🔧 Develop](#-develop)

</div>

> [!IMPORTANT]
> **Nothing here has met a running relay.** The relay was read from its own documentation and source (pinned at `moq-relay` 0.17.16), and the suite runs against a fake behind one interface. [docs/moq.md](docs/moq.md) lists the pages read, and [What was not run](#what-was-not-run-against-a-real-relay) lists the paths no test could reach.

## 💡 Why Live

- 🎥 **Low delay, one to many.** Built on Media over QUIC (open source, MIT or Apache-2.0): a presenter and a large audience through a relay.
- 🔗 **About any record.** A broadcast can be about a lesson, a product or a calendar event, and who may watch follows who can read that record.
- 🪜 **A simple audience ladder.** Members, Portal, Link or Public, each including the ones before it.
- 🎟️ **Seats that count without names.** Capacity is enforced atomically, and viewers now and the peak come from keyed hashes, never names.
- 🔑 **Short-lived access.** A token is for one broadcast path, with one right and an expiry, and is re-decided on every renewal.
- 🧩 **Embeddable.** A player component and an embed description let other apps show a broadcast beside their own content, in a frame only the origins you name can use.
- 🔓 **Open source, self-hosted.** AGPL, with your own relay and no per-viewer fee.

## 🎯 At a glance

| | |
|---|---|
| 📦 Version | `0.1.1` |
| 🧱 Kind | Own interface at `/live/`, plus the app's own pages for people with no account |
| 🗃️ What it adds | 4 entities in the `live` package: Broadcast, Presenter (child), Broadcast Link, Live Settings |
| 👥 Roles | 2: Live User, Live Manager |
| 📊 Reports | 2: Broadcasts and Their Audience, Audience by Status |
| 📣 Events | 2: Broadcast started, Broadcast ended |
| ⏱️ Upkeep | every minute: ends broadcasts nobody presents, forgets old seats, clears replay links past retention |
| 🔗 Depends on | Ferrum `>=0.3.2, <0.4`; a relay you run (docs/deploy.md) |
| 🤝 Works with | LMS, Commerce, Comms (calendar events), and any app with records, through the embed |
| 🧱 Built against | `moq-relay` 0.17.16, `@moq/watch` 0.6.6 and `@moq/publish` 0.5.6 |
| 🌍 Languages | English only so far; every word goes through the translation function, and a workspace can translate them |
| 🧪 Tests | 5 Rust tests (one scenario against PostgreSQL), about 90 interface tests against faked routes and elements |
| 📄 Licence | AGPL-3.0-only |

## 📸 Screenshots

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-home-dark.webp">
  <img alt="Live broadcasts" src="docs/assets/screens/live-home-light.webp" width="100%">
</picture>

<p align="center"><b>📡 Broadcasts</b><br><sub>See what is live, what is coming up and how many watched, and start a new broadcast.</sub></p>

<table>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-new-dark.webp"><img alt="New broadcast" src="docs/assets/screens/live-new-light.webp"></picture>
<p><b>🗓️ New broadcast</b><br><sub>Plan a broadcast: when, who may watch, how many at once and who may present.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-control-dark.webp"><img alt="Presenter control" src="docs/assets/screens/live-control-light.webp"></picture>
<p><b>🎛️ Presenter control</b><br><sub>The presenter's page: check camera and microphone, go live, see viewers now and make links to share.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-watch-dark.webp"><img alt="Watch page" src="docs/assets/screens/live-watch-light.webp"></picture>
<p><b>👀 Watch page</b><br><sub>What viewers see before it starts: the waiting text, then the stream at low delay.</sub></p>
</td>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-settings-dark.webp"><img alt="Live settings" src="docs/assets/screens/live-settings-light.webp"></picture>
<p><b>⚙️ Settings</b><br><sub>Set the relay, token lifetimes, default audience and capacity, replay address and the words viewers see.</sub></p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/screens/live-broadcast-list-dark.webp"><img alt="Broadcasts list" src="docs/assets/screens/live-broadcast-list-light.webp"></picture>
<p><b>📋 All broadcasts</b><br><sub>Every broadcast with its status, planned start and audience peak, filterable and exportable.</sub></p>
</td>
<td width="50%" valign="top"></td>
</tr>
</table>

## ✨ Features

### 📡 Broadcasts

- **Broadcast.** A title, description, planned start and end, optionally the record it is about (`reference_entity` and `reference_id`), an audience, a capacity, a waiting text, the people and role who may present, whether it is recorded, and the sites that may frame its page.
- **Status that only the app moves.** Scheduled until a presenter starts; Live until a presenter or a manager ends it (or until nobody has renewed the presenter's token for its life and a minute, and upkeep ends it); then Ended. Cancelled is possible from Scheduled.
- **Actions.** End Broadcast (with a confirmation), Cancel Broadcast, Make a Viewing Link, Make a Presenter Link and Revoke All Links.
- **Results kept.** Who started it, when it started and ended, viewers peak and total, the replay address, and when the replay was cleared.
- **Events.** `live.broadcast_started` and `live.broadcast_ended` go out through the outbox for automations and processes, with the broadcast, its title, status and the record it is about.
- **Plan one from another app.** `/live/new?entity=Lesson&record={id}` opens the form with the record chosen.
- **Hand-over.** A person's open broadcasts (Scheduled or Live) are handed over with the rest of their work.

### 🎥 Presenting

- **Who may present.** The owner, the people the broadcast names, the holders of the role it names, or an outsider with a presenter link (one start, then renewals while Live). A portal person never presents.
- **Control page** (`/live/b/{id}`). Checks what the browser can do, with plain messages for one that cannot present. Choose camera and microphone with a preview that stays on the device. **Go live** takes the relay address, the path and a token; the picture sent, viewers now, the watch address, a viewing link and a one-time presenter link are shown.
- **Renewal.** The presenter's access renews at two thirds of its life, retried, with a visible state when it is refused (the broadcast was ended or the right was lost).
- **End.** After a confirmation.
- **Presenter links.** For someone with no account: a secret in the address's fragment (`#k=…`, which a browser never sends), kept only as a SHA-256 hash, shown once, valid 7 days by default and 90 at most, revocable at once.

### 👀 Watching

- **Audience ladder.** Each level includes the ones before it:

| Audience | Who may watch |
|---|---|
| **Members** | Signed-in people. For a broadcast about a record, those who can read that record; for one of its own, those who can read the broadcast |
| **Portal** | And portal people, by the record's portal permission when there is one |
| **Link** | And anyone holding a viewing link |
| **Public** | Anyone |

- **Same answer for "not there" and "not yours".** A broadcast that does not exist and one you may not watch look the same.
- **Watch page** (`/live/watch/{id}` in the shell, and the app's own public page). The waiting, live, ended and replay words; a full broadcast in the server's words with *Try again*; renewal; a new address when the connection drops; the seat given up on leaving (also by a request that outlives the page); pause, mute, volume, captions and full screen, with keys.
- **Public pages load no third-party script.** The two moq components are bundled and served by the app itself, and a workspace may name its own https address instead.
- **Viewing links.** One per guest, with a label, shown once, valid 7 days by default and 90 at most.

### 🎟️ Seats and counts

- **A seat** is a keyed hash of the person, or of the link and a browser's random id, or of the browser's random id. It holds no name or address, and is kept in PostgreSQL.
- **Capacity is atomic.** Taking a seat locks the broadcast's row, counts and adds, so two viewers cannot both take the last one. Renewing a live seat takes no lock.
- **Counts.** Viewers now, the peak and the total of different viewers come from the viewers' own token renewals. The relay is told nothing.
- **Upkeep** forgets seats a day old.

### 🔑 Access and keys

- **One interface to the relay.** `src/relay.rs` is the only place that knows the relay. A token is for exactly this broadcast's path, with one right and an expiry (10 minutes for viewers and 60 for presenters by default), and nothing else, since moq refuses a claim it does not know.
- **Re-decided each time.** Renewal re-decides every right from scratch, so a person who loses the right is stopped at their next renewal, and a revoked link or an ended broadcast cannot renew.
- **Signing key.** An HS256 key (a JWK from `moq auth generate`) set with **Set Signing Key**, sealed and never shown. Rotate without dropping anyone by adding a new key file beside the old one, then setting the new key.
- **Personal data.** A presenter's name and address, on a broadcast or a link, are found by address and blanked on erasure. Seats hold none.

### 🧩 Embedding in other apps

- **Embed description.** `GET /api/app/live/embed?entity=Lesson&record={id}` answers with the broadcasts about the record that the caller may watch (title, status, planned start, text, page and a ready `iframe`). One broadcast: `GET …/broadcasts/{id}/embed`, with `?link=` for a viewing link's secret. A person who may not watch a broadcast is not told it exists.
- **Frame origins.** The only sites that may frame the watch page are the origins the broadcast names (one `https://host` per line, at most ten). The page answers with its own `Content-Security-Policy: frame-ancestors …`. Empty means none.
- **`LivePlayer` component** (`ui/src/embed/`). Props for the record or one broadcast, a viewing link, `mode` (`frame` or `inline`), the picture's aspect ratio, a poll interval, and events `onStatus`, `onBroadcasts` and `onError`. It draws nothing when the person may watch nothing, shows the waiting, ended, cancelled and replay words, and never links or frames an address that is not `http(s)`. It is not yet published as a package: copy `ui/src/embed/`.
- **Three cases.** A **live class** in the LMS (a lesson gets a broadcast with audience Members or Portal); **live shopping** in Commerce (a product gets a public broadcast, with the shop's origin in its frame origins); a **meeting with an audience** in Comms (a calendar event gets a broadcast; two-way talk stays in its LiveKit meeting).

### ⚙️ Settings

Live Settings holds the relay address and health address, the path prefix and stream name, token lifetimes (viewer 1-60 minutes, presenter 5-720), default audience and capacity, whether recording is the default, the replay address and retention days (1-3650, 30 by default), the scripts the public pages load, and every word viewers see: waiting, ended, cancelled, full, not available and the replay link. Browsers inside Ferrum may connect only where the app setting *Relay address for browsers* names, which an administrator sets to the same address.

### 📊 Reports and health

- **Broadcasts and Their Audience** (parameters: from and to date) with status, start and end, viewers now, peak and total.
- **Audience by Status.**
- **Doctor check.** The support report and `ferrum task doctor` say, in words, when Live Settings names no relay, holds no usable signing key, or the relay's `/health` does not answer.
- **Home counts.** Live now, upcoming and ended, with viewers now and the peak.

### 🔐 Roles and fit

| Role | Can do |
|---|---|
| **Live User** | Plans broadcasts, presents the ones they are named on, and watches those they may see; reads Live Settings. Works on their own broadcasts and links. |
| **Live Manager** | Every broadcast and link, and Live Settings: the relay's address, signing key, token lifetimes and wording. |

- **Assistant.** Ferrum's assistant knows the states and audience ladder and suggests "Which broadcasts are live now?" and "How many people watched last week's webinar?".
- **Not recording.** moq documents no recorder, so Live does not record. It links a replay (the *Replay Address* plus the broadcast's path) and clears it after the retention days, saying when.

## 🧭 How it works

```mermaid
flowchart LR
    PR["Presenter's browser"] -- "publish: signed token" --> RL["moq-relay"]
    LV["Live app in Ferrum"] -- "signs short-lived tokens" --> PR
    LV -- "signs short-lived tokens" --> VW["Viewers' browsers"]
    VW -- "watch: signed token" --> RL
    RL -- "asks who may do what" --> AU["moq auth server"]
    LV -- "seats and counts" --> DB[("PostgreSQL")]
```

Live decides who may present or watch, and signs a token for exactly one broadcast's path. The relay carries sound and pictures; Ferrum never sees them. A relay with `--auth-url` asks the auth server, which verifies the token against the key files Live and it share.

```mermaid
flowchart TD
    S["Scheduled"] -- "presenter goes live" --> L["Live"]
    L -- "presenter or manager ends it" --> E["Ended"]
    L -- "nobody renews for a token's life and a minute" --> E
    S -- "cancel" --> C["Cancelled"]
    E --> R["Replay link, cleared after the retention days"]
```

A broadcast's status moves only through the app. Ended keeps its counts and an optional replay link.

## 🧱 Data model

| Entity | What it is | Key fields or states |
|---|---|---|
| Broadcast | One live video from a presenter to an audience | Scheduled / Live / Ended / Cancelled, audience, capacity, reference entity and id, presenters, frame origins, viewers peak and total |
| Presenter (child) | A person who may start a broadcast | email, name |
| Broadcast Link | A viewing or presenter link | Viewer / Presenter, expiry, used at, revoked at; only a hash of the secret is kept |
| Live Settings | The relay, tokens, defaults, replay and wording | relay address, signing key (sealed), lifetimes, retention |

Behind them, two tables hold seats (keyed hashes, no names) and the secret those hashes use, both with row-level security.

## 🔌 Integrations

| With | How | Needs |
|---|---|---|
| moq-relay and its auth server | Tokens for one path, health check, relay on UDP and TCP 443 | A relay you run (`moqdev/moq-relay:0.17.16`, `moqdev/moq:0.14.16`), a certificate for its name, and a key |
| LMS | A live class: a lesson's page calls the embed route | LMS installed |
| Commerce | Live shopping beside the cart, in a frame | Commerce installed |
| Comms | A meeting with an audience, from a calendar event | Comms installed |
| Any app with records | A broadcast is an ordinary record; any app may create one through the records API | Nothing extra |
| Ferrum automations | `live.broadcast_started` and `live.broadcast_ended` | Nothing extra |
| Kubernetes and Docker Compose | `deploy/k8s/live.yaml` and `deploy/live.yml` with `deploy/live/relay.toml` | A host with UDP buffers raised |
| RTMP, SRT, WebRTC and HLS gateways | moq's own CLI bridges one broadcast each | Not wired into Live yet |

## 📊 How it compares

The leaders are streaming and webinar products: YouTube Live, Vimeo Livestream, Zoom Webinars and Events and Restream, with Owncast as the open-source, self-hosted one. Live is new, small and unproven against a relay; its case is control and one data set.

| Capability | Ferrum Live | YouTube Live | Vimeo Livestream | Zoom Webinars / Events | Restream | Owncast |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Live to a large audience at low delay | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Proven with real audiences | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Browser-based presenter studio | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ |
| Encoder ingest (RTMP, SRT) | ❌ | ✅ | ✅ | 🟡 | ✅ | ✅ |
| Multistream to other platforms | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Members-only and private audiences | ✅ | 🟡 | ✅ | ✅ | ➖ | ❌ |
| Audience follows a business record's permissions | ✅ | ❌ | ❌ | ❌ | ➖ | ❌ |
| One viewing link per guest | ✅ | 🟡 | ✅ | ✅ | ➖ | ❌ |
| Presenter links for outsiders | ✅ | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Embed in your own site or app | ✅ | 🟡 | ✅ | 🟡 | 🟡 | ✅ |
| Embed only on named origins | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Registration, reminders and follow-up | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Chat, Q&A and polls | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hosted recording and replay | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Closed captions | 🟡 | ✅ | ✅ | ✅ | 🟡 | ❌ |
| Audience counts (now, peak, total) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Detailed analytics | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tickets, memberships or paywall | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Seats counted without names | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Mobile apps | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Same data as lessons, shop and calendar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Self-hosted | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

Notes: 🟡 for Ferrum on low delay and the presenter studio means they are built and tested against fakes, not yet against a real relay or a browser with a camera; the studio is camera and microphone with a device check, with no layouts or other sources. 🟡 for captions means the player shows what the broadcast's catalogue offers; Live makes none. 🟡 for leaders usually means a paid tier or a limited form. Owncast's delay is that of HLS.

### 🏆 Where Live stands out

- 🔗 **A broadcast about a record,** watched by whoever the platform lets read that record.
- 🔑 **Access you decide and renew,** short-lived and re-checked, with links that are hashed and revocable.
- 🎟️ **Seats counted without names,** and personal data limited to presenters.
- 🔒 **No third-party scripts** on the public pages, and frames only on origins you name.
- 🔓 **Open source and self-hosted,** on the same platform as lessons, shop and calendar.

### 🚧 Where the leaders are still ahead

- 🏭 **Proof.** They stream to real audiences every day; this has not met a relay.
- 💬 **Interaction.** Chat, Q&A, polls and registration.
- 🎬 **Recording, ingest and distribution.** Hosted replays, encoder ingest and multistreaming.
- 📈 **Analytics, monetisation and mobile apps.**

> [!NOTE]
> Leader columns are from public product information as of November 2026 and may change.

## 📍 Roadmap

### ✅ Recently shipped

- [x] **0.1.1** An interface of its own at `/live/`: broadcasts, planning, a presenter's control page, the watch page, settings and the `LivePlayer` component; the moq components bundled, so no page loads a third-party script.
- [x] **0.1.0** The first release: broadcasts about any record or alone, short-lived signed access, atomic seats, the audience ladder, viewing and presenter links, an embed description, counts, reports, replay links with retention, deploy files and a health check.

### 🔜 Next up

- [ ] **Run it against a real relay.** Confirm that `moq auth serve` accepts the tokens signed here, that a relay with `--auth-url` admits a session at `{relay}/{path}?jwt=…`, the WebSocket fallback, and key rotation with two key files.
- [ ] **Run the players in a browser with a camera.** That the bundled elements register and play under the shell's policy, that `<moq-publish>` takes the camera and microphone chosen, and the captions picker.
- [ ] **Sign in through a real portal.** Portal people were simulated, not signed in through a portal.
- [ ] **List Live in the platform's apps and server build,** so it installs from the store (docs/deploy.md says what the platform would add).
- [ ] **A recorder beside the relay,** so a replay exists to link.

### 🔭 Later

**Presenting and ingest**
- [ ] Wire moq's RTMP, SRT and WebRTC gateways, so an encoder such as OBS can feed a broadcast.
- [ ] Screen sharing and layouts in the presenter studio.

**Audience**
- [ ] Chat, Q&A and polls.
- [ ] Registration with reminders and follow-up.
- [ ] Watch time and geography analytics.
- [ ] Tickets or a paywall.

**Product**
- [ ] A calendar of broadcasts and a replay list.
- [ ] Choosing who may present from the interface (the records form does it today).
- [ ] The relay's health on the settings page (it shows only what the settings say).
- [ ] Publish `LivePlayer` as a package.
- [ ] More than one relay, with clustering in front.
- [ ] Languages: built-in translations (every word already goes through the translation function).
- [ ] Mobile presenting.

## 🚀 Install

Install the app from a Ferrum store, or by listing it in the server's build (docs/deploy.md, "What the platform would add"). Then:

1. Run the relay beside Ferrum (docs/deploy.md): `moq-relay` 0.17.16 and its auth server, with a publicly trusted certificate for its name (browsers do not accept a self-signed one for WebTransport unless pinned), UDP buffers raised on the host, and a key file `keys/<kid>.jwk` made with `moq auth generate`.
2. In **Live Settings**, give the relay address and health address, then **Set Signing Key** with the same key text.
3. Set the same address under the app's settings (*Relay address for browsers*), so the interface inside Ferrum may connect there.
4. Give people **Live User** to plan and present, and **Live Manager** for settings and every broadcast.
5. Plan a broadcast, open its control page, choose the camera and microphone, and go live.

Compose and Kubernetes files are in `deploy/` (`live.yml`, `live/relay.toml`, `k8s/live.yaml`).

### What was not run against a real relay

Every path to moq. The suite runs the fake behind `Relay`. Untested against the real thing: that `moq auth serve` accepts the tokens this app signs (only the signature scheme is checked, against a token moq's own JavaScript library signed); that a relay with `--auth-url` admits a session dialed at `{relay}/{path}?jwt=…`; the player and capture elements on these pages (including that the pinned script loads under the page's policy and that a changed `url` attribute reconnects); the WebSocket fallback; key rotation with two key files; the compose overlay and manifest; the relay's `/health` as the doctor asks it; that the platform lets a page set its own `Content-Security-Policy` on `/api/site/…`; and that the page, opened under `/api/app/live/…`, is identified as the signed-in person.

For the interface, no relay, no browser with a camera and no server were used: the two moq elements registering and playing under the shell's policy; `<moq-publish>` taking the chosen camera and microphone; the connection status reporting a drop; the Opus fallback; the captions picker; full screen and the keys; and the shell serving `/live/` from `ui/dist`. The tests fake the components, the relay and every route, at `fetch`.

## 🔧 Develop

```bash
export FERRUM_LIVE_TEST_DATABASE_URL=postgres://ferrum:ferrum@localhost:5432/ferrum_live_test
cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test
```

The tests need PostgreSQL with an ordinary (non-superuser) role, so row-level security applies. The app builds against the platform's main branch (`.cargo/config.toml` points a checkout at it, git-ignored).

The interface (`ui/`) builds with Ferrum-Frontend's packages from the sibling checkout (`../../ferrum/web`), as the other apps' do, and has moq's two components in `ui/node_modules`:

```bash
cd ui && npm ci --ignore-scripts && npm run check && npm run typecheck && npm test
npm run build        # rebuilds ui/dist, which is committed
```

CI runs formatting, clippy with warnings denied and the Rust tests against a PostgreSQL service, then the interface checks.

## 📂 Project layout

```text
app.yaml          the manifest: id, version, relay setting, what it adds to Ferrum
packages/live/    entities, roles, events, personal-data rules, SQL
src/              access, broadcast, health, links, page, relay (the one interface to moq), reports, seats, settings, site, upkeep
ui/               its own interface (React + Vite): home, new, control, watch, settings, and the embeddable LivePlayer in ui/src/embed
tests/            live_it.rs: one scenario against PostgreSQL
deploy/           Compose overlay, relay.toml and the Kubernetes manifest
docs/             deploy.md (running the relay), moq.md (what Live was built against)
```

## 📜 Changelog

Every version is in [CHANGELOG.md](CHANGELOG.md).

## 🤝 Contributing

Issues and pull requests are welcome at [github.com/CBFerrum/ferrum-app-live/issues](https://github.com/CBFerrum/ferrum-app-live/issues). Say whether a change was tried against a real relay.

## 📄 License

[AGPL-3.0-only](LICENSE), like the platform. moq is MIT or Apache-2.0; its OBS plugin (GPL-2.0-or-later) is not used.

<div align="center">

<sub>Part of <a href="https://github.com/CBFerrum/Ferrum">Ferrum</a>, the open business platform · Made with 🦀 Rust and 🐘 PostgreSQL</sub>

</div>
