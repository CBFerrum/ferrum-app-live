# Changelog

## 0.1.1

An interface of its own at `/live/` (`ui/`, built with Ferrum-Frontend's packages; `ui/dist` committed), all against routes and records
the server already had (README, "The interface"). No server change except that the crate now embeds `ui/dist` and the manifest declares it.

* **Broadcasts**: live now, upcoming and ended, each with its status, the record it is about, its audience, viewers now (from the audience report) and the peak; plan one (`/live/new`, also from another app with `?entity=&record=`); cancel a scheduled one.
* **Control page** (`/live/b/{id}`): what the browser can do and plain messages for one that cannot present; camera and microphone choice with a local preview that stays on the device; *Go live* (the start route's relay address, path and token); renewal of the presenter's access at two thirds of its life, retried, with a visible state when it is refused (the broadcast was ended or the right was lost); *End* after a confirmation; viewers now; the watch address; a viewing link and a one-time presenter link, shown once.
* **Watch page** (`/live/watch/{id}`): the player in the shell (the moq element, bundled); waiting words, live, ended and replay; a full broadcast in the server's words with *Try again*; renewal as for the presenter; a new address when the connection drops; the seat given up on leaving, also by a request that outlives the page; pause, mute, volume, captions and full screen, with keys; nothing personal in the relay address.
* **Player component** (`ui/src/embed/`): `LivePlayer` for other apps' interfaces, with props, events and sizing documented in the README; frames the public watch page by default, or plays inline.
* **Live Settings** (`/live/settings`): relay address and health address, the signing key (written, never read back), token lifetimes, default audience and capacity, recording, replay address and retention, the scripts the outside pages load; the state of the setup.
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
