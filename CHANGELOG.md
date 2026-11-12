# Changelog

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
