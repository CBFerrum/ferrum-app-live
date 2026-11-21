# Changelog

## 0.5.0

Needs the same platform as 0.4.0. Database: two tables (`live_audience_minute`, `live_poll_vote`) and two entities (`BroadcastQuestion`, `BroadcastPoll`); package `live` 0.1.1. Deploy files change: the relay's auth server is Live.

**A pass stops working when the right does.** A pass is for one holder (`sub`: a person, a link, or a viewer's seat),
one broadcast's path and one right, and lets its holder connect for three minutes; the session it opens lasts the
token minutes in Live Settings, as before. The relay's `--auth-url` is now Live's public route `POST /relay/auth`: at
`connect` Live checks the signature, the expiry and the path, and at `connect` and every `revalidate` (30 seconds) that
the broadcast is Live and the holder still may present or watch (the same rules as renewal) with a live seat. Before,
`moq auth serve` admitted a pass until its expiry (up to 12 hours for a presenter) after the broadcast ended or the
right was gone. `moq auth serve` and the relay's key files are gone from the deploy files: the key lives in the vault
alone. Set Signing Key keeps the key before it, so sessions admitted under it go on; nothing new opens with it.

**Presenting and watching as operations.** `Broadcast.present` and `Broadcast.watch` (hidden from the record's screen)
do for a signed-in person, or their agent through the gate, what the presenter and watch pages do: the same rules,
seats and passes, the pass given once. Every action now has a contract.

**Screen sharing.** On air, a presenter switches what they send between the camera and a shared screen, on the same
stream.

**The audience minute by minute.** Upkeep counts each Live broadcast's live seats once a minute
(`live_audience_minute`, new table: no name, a number); the report *Audience Minute by Minute* gives them and the
viewer-minutes, to those who may read the broadcast.

**Questions and polls.** Viewers ask (one question every 20 seconds and five waiting at most, a seat) and vote (once a
seat in a poll) with the seat they watch from (`BroadcastQuestion`, `BroadcastPoll`, new entities; `live_poll_vote`,
new table holding a seat's keyed hash, no name). Presenters and managers list, show, answer and hide questions and
open and close polls with the broadcast's actions (`questions`, `moderate_question`, `open_poll`, `close_poll`), on the
presenter page while on air. Viewers see only shown and answered questions. They go with the links after the
retention days. The shell's watch page has them; the public page (`/api/site/…/watch`) does not yet.

**Erasing a presenter takes their recording's replay link.** The objects the link pointed to are the recorder's.

## 0.4.0

Needs Ferrum 0.4.0 (apps' upkeep runs one workspace at a time, on whichever replica is free). No database or interface change.

**Upkeep is one workspace's.** `maintenance(k, tenant)` ends broadcasts nobody presents, forgets seats and clears replay links past their retention in the one workspace the platform hands it; the list of workspaces and the installation check are the platform's.

## 0.3.1

Needs the same platform as 0.3.0. No database change. Interface only, `ui/dist` rebuilt with Ferrum-Frontend `06bd1a2`.

- The `LivePlayer` component (`ui/src/embed/`), offered for other apps' pages, is gone: no app's interface used it. The
  embed description (`GET /api/app/live/embed`, `GET …/broadcasts/{id}/embed`) and the frame origins stay; an app shows a
  broadcast with the description's `iframe`.
- The settings page no longer links to "the app's settings": that page only said it was not available. The relay
  address for browsers is set where the server is run, as the sentence there says.
- The two routes to the screens apps no longer have (`apps/:app/settings`, `x/:app/:page`) are gone. The page starts
  through the frontend's `mountApp`; the interface lint has no baseline file any more.
- The settings test reads Live Settings as it is since 0.3.0, without `signing_key`.

## 0.3.0

Needs the same platform as 0.2.2. No interface change. The package's SQL reads as its final schema: `live_secret` and
`002_keys.sql` are gone, and Live Settings no longer has the sealed field `signing_key`. No installation was ever made
from them, so a database is made afresh.

**The relay's key has one home.** 0.2 kept Live Settings' sealed `signing_key` for the build before it: Set Signing Key
wrote the field first, then the vault, and upkeep compared the two every minute under the settings' row lock (taken
without waiting and retried) and took the field's when they differed. No build before 0.2 runs anywhere, so the field
goes with that reconciliation: Set Signing Key writes the key's name in the settings and the key in the vault, and Live
reads it from the vault alone.

**Seats are hashed with the vault's key alone.** 0.2 moved the seats' key kept unsealed in `live_secret` into the vault
as `old-seat-key`, for two hours, so that someone watching across the upgrade kept their seat. No one was watching, so
the table, the move, its expiry, its upkeep step and the re-keying of a seat go.

Tests: the end-to-end suite sets a second relay key (the vault holds it, the settings name it, tokens are signed with it)
and makes a new version of Live's own key (the relay's key and its tokens stay as they were). The checks of the old seat
key and of the sealed field went with them.

## 0.2.2

Needs platform 0.3.9 (Ferrum `22d082f7` or later), whose vault never makes a workspace's keys inside a caller's
transaction. No database or interface change.

- **Set Signing Key no longer makes Live's key in the workspace first, on a connection of its own.** 0.2.1 did so to keep
  the action from waiting on itself; the platform now makes those keys on the vault's own connection wherever they are
  first needed, so the step is gone.

## 0.2.1

Needs a platform with the vault's field reader (0.3.8 on the platform's main from cdec881). No database or interface change.

- **Live reads Live Settings' sealed `signing_key` with its own handle on the vault**, in the same transaction as before, instead of the platform's reader that any app could use, which is deprecated.
- **Set Signing Key on a workspace where Live had used the vault for nothing yet** waited until its database lock timed out and said "its keys are unavailable", once the server says which app owns each package (the platform's main from cdec881 does): writing the field made Live's key in the workspace inside the action's transaction, and the vault's write beside it, on another connection, waited on that. Live's key is now made first, on its own.

## 0.2.0

Needs a platform with the vault (Ferrum `8e6b1f0` or later). A database change (`live/002_keys.sql`: the column
`live_secret.retired_at`) is applied at startup; nothing existing moves. No interface change.

**The relay's signing key has one home.** It was kept twice: sealed in Live Settings (`signing_key`) and as the file
`keys/{kid}.jwk` the relay's auth server reads, two copies typed in by hand that nothing compared. It now lives as
Live's secret `relay-signing-key` in the workspace's vault: the key exactly as given to Set Signing Key, which is the
JWK `moq auth generate` writes and the relay's key directory holds. Its rule lets it out (`reveal`), because the relay
must hold the same secret: Live reads it for each token, and only from there. A key from before moves from the field
into the vault the first time a token is needed or at the next upkeep, once. The build before this one still reads the
sealed field, so Set Signing Key still writes it, first, then the vault; upkeep compares the two each minute under the
settings' row lock and takes the field's when they differ (the build before set a key after a rollback, or an action
failed after its vault write), so they never differ for long; the release after this one stops writing the field.
**The relay's file** stays what
the relay reads: whatever gives companion programs their files from the vault at their start (the platform's
`ferrum render`, to come) writes, for each workspace with Live, `{kid}.jwk` in the relay's key directory with the
secret's value byte for byte (the auth server reads it per request: a new key needs no restart). Until then the
administrator writes it, with the same text given to Set Signing Key (docs/deploy.md). **The two cannot differ
silently under one name**: Set Signing Key refuses a key named as the one in use with another secret, since the relay
holds one file a name; a new key takes a new name (rotation without dropping anyone, as before).

**Seats are hashed with a key from the vault.** The seats' key was kept unsealed in `live_secret`. Seats are now keyed
hashes under a key derived from Live's own key in the vault (`seat-hashes`), made when needed and kept nowhere. A viewer
watching across the upgrade keeps their seat: the old key moves into the vault, sealed, as `old-seat-key`, and for two
hours after it stopped (`live_secret.retired_at`: a viewer's token lives an hour at most, the other hour covers the
upgrade rolling out) finds the seat it made, which then takes the new hash, counting once. It moves once, even with
replicas starting together (its row is locked without waiting). From then on this build never reads `live_secret`; the
build before still does, so its rows stay until the release after this one deletes them.

**When the vault is closed** (an installation with nothing to open its root with), watching, renewing, presenting and
leaving are refused with "Live cannot give access right now: its keys are unavailable", and the doctor says so. No
token is signed another way.

**A sandbox** has keys of its own: its seats are hashed with its own key, it never takes the old one, and the relay's
key is not copied there (a sandbox gets no sealed field of the live workspace, and the vault's keys do not travel), so
an administrator sets one before anyone watches in a copy.

**A workspace moved to another installation**: the platform's move copies the workspace's tables, not its keys in the
vault. Seats are counted again from the move on. The relay's key travels in Live Settings' sealed field (written
through this release) and moves into the new installation's vault at the first token there.

**For other apps' tests**: Live takes its vault handle as it registers, so register it as the server does,
`hooks.app("live", &[], ferrum_app_live::register)`; called outside that, the kernel refuses to boot.

Tests: the end-to-end suite opens the vault and registers Live as the server does. The relay's key is in the vault as
given, and in the field for the build before; a key in the field from before moves at the first token; another one the
build before writes after a rollback is taken once by upkeep, and this build's own changes nothing there; a seat the old
key made is kept by its viewer and counts once, for two hours and not after; seats are hashed and found with
`live_secret` out of reach; a sandbox never takes the old key; a replica whose vault is closed refuses plainly. A unit
test shows one name with two secrets told apart.

Not in this release: writing the relay's key file from the vault (the platform's `ferrum render`); an asymmetric key, so
that the relay would hold only a public key; the rows of `live_secret` and the sealed field's value (the release after
this one).

## 0.1.1

An interface of its own at `/live/` (`ui/`, built with Ferrum-Frontend's packages; `ui/dist` committed), all against routes and records
the server already had (README, "The interface"). No server change except that the crate now embeds `ui/dist` and the manifest declares it.

* **Broadcasts**: live now, upcoming and ended, each with its status, the record it is about, its audience, viewers now (from the audience report) and the peak; plan one (`/live/new`, also from another app with `?entity=&record=`); cancel a scheduled one.
* **Control page** (`/live/b/{id}`): what the browser can do and plain messages for one that cannot present; camera and microphone choice with a local preview that stays on the device; *Go live* (the start route's relay address, path and token); renewal of the presenter's access at two thirds of its life, retried, with a visible state when it is refused (the broadcast was ended or the right was lost); *End* after a confirmation; viewers now; the watch address; a viewing link and a one-time presenter link, shown once.
* **Watch page** (`/live/watch/{id}`): the player in the shell (the moq element, bundled); waiting words, live, ended and replay; a full broadcast in the server's words with *Try again*; renewal as for the presenter; a new address when the connection drops; the seat given up on leaving, also by a request that outlives the page; pause, mute, volume, captions and full screen, with keys; nothing personal in the relay address.
* **Player component** (`ui/src/embed/`): `LivePlayer` for other apps' interfaces, with props, events and sizing documented in the README; frames the public watch page by default, or plays inline.
* **Live Settings** (`/live/settings`): relay address and health address, the signing key (written, never read back), token lifetimes, default audience and capacity, recording, replay address and retention, the scripts the outside pages load; the state of the setup.
* **The public pages load no third-party script.** The two components are also emitted at version-named paths (`assets/moq-watch-0.6.6.js`, `assets/moq-publish-0.5.6.js`; the build fails without them) and served by the app at `module/{file}` (only those files and what they import). *Watch Component* and *Publish Component* default to empty, meaning these; a workspace may still name its own https address, and the page's Content-Security-Policy then lists that origin instead of `'self'`.
* **The two moq components are bundled** (`@moq/watch` 0.6.6, `@moq/publish` 0.5.6) as lazy chunks; nothing is loaded from a third-party address by the interface. The manifest allows the relay's address for the browser's connection through an app setting (*Relay address for browsers*).
* Tests: 88 in `ui/`, against the server's routes faked at `fetch` and moq's elements faked as custom elements; nothing ran against a relay.

## 0.1.0

The first release: one-to-many live video at low delay, built around the open-source Media over QUIC project
(`moq-dev/moq`, MIT or Apache-2.0), pinned at `moq-relay` 0.17.16 behind one interface (docs/moq.md).

* **A broadcast** (`Broadcast`) that stands alone or is about any record (`reference_entity`, `reference_id`), with a
  title, a planned start and end, a status the app alone moves (Scheduled, Live, Ended, Cancelled), who may present
  (its owner, people it names, the holders of a role, or a presenter link for an outsider), who may watch (an
  audience ladder: Members, Portal, Link, Public, each including the ones before it; signed-in people by the
  platform's permission on the attached record), a capacity, a waiting text, the sites that may frame its page and
  whether it is recorded.
* **Access through one interface** (`Relay`): short-lived tokens for exactly one broadcast's path, each with one right
  and an expiry and nothing else; a fake for tests. Routes to start presenting, renew, end, watch (a seat taken
  atomically against the capacity), renew a seat and leave. A person who loses the right, a revoked link or an ended
  broadcast cannot renew.
* **Settings** (`LiveSettings`): the relay's address, its signing key (sealed, never returned), key and token lifetimes,
  the defaults for audience, capacity and recording, the replay address and retention, the pinned player and capture
  scripts, and every word the pages show.
* **Links** (`BroadcastLink`): viewing and presenter links whose secret is shown once and kept only as a hash; revoked
  at once; a presenter link starts its broadcast once and then only renews.
* **A page and an embed description**: the watch page and the presenter's page, framed only by the origins a broadcast
  names; `GET /embed` and `GET /broadcasts/{id}/embed` give other apps what they need (README, "Putting the player
  beside other content").
* **Counts without personal data on the relay**: viewers now and the peak, from the viewers' own renewals, kept
  per broadcast; two reports.
* **Replay as far as moq documents**: no recording (moq documents none), but a replay link and retention days.
* **Running it**: `docs/deploy.md`, a compose overlay and a Kubernetes manifest in `deploy/`, a health source the doctor and the
  support report read.
* Tests: one scenario against PostgreSQL covering every refusal and two viewers asking for the last seat together,
  and a token test against a token moq's own JavaScript library signed.
