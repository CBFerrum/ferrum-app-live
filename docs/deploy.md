# Running Live: the relay beside the stack

Live signs the tokens and decides who may do what; sound and pictures never pass through Ferrum. A Media over QUIC
relay (`moq-relay`, pinned at 0.17.16: docs/moq.md) carries them, as LiveKit does for Comms' meetings
(`deploy/meet.yml`, Ferrum's docs/operations.md "Meetings"). Nothing in this page was run against a real relay.

## What runs

| Part | Image | Where it listens | Notes |
|---|---|---|---|
| Relay | `moqdev/moq-relay:0.17.16` | **UDP 443** (QUIC, WebTransport), **TCP 443** (HTTPS, WebSocket fallback), `8080` plain HTTP for `/health` | the only thing the internet reaches |
| Ferrum with Live | the platform's image | as before | asks `/health`; signs passes with the key in Live Settings and is the relay's auth server |

The relay verifies nothing itself in 0.17: it POSTs each session to its auth server (`[auth] url`) when it opens and
again while it lasts, and the answer is a grant or a refusal. **Live is that auth server**:
`https://<ferrum host>/api/site/<workspace>/live/relay/auth` (https: the relay takes `http://` for a loopback address
only). A pass is an HS256 JWT of `root` (this broadcast's path), `publish` or `subscribe` `["**"]`, `exp` (three
minutes: long enough to connect) and `sub` (whose it is). At `connect` Live checks the signature, the expiry, the path
and that the holder may present or watch now; at each `revalidate` (every 30 seconds) it checks the holder's right
again, so a session stops within half a minute of the broadcast ending, a link being revoked, a presenter being taken
off, a person losing the right or a seat going stale. `moq auth serve` is not used: it would admit a pass until its
expiry whatever happened since. One relay serves one workspace (its auth address names the workspace); a relay shared
by several workspaces needs an installation-wide route the platform does not have yet.

## Compose

`deploy/live.yml` in this repository is the overlay; the platform copies it to its `deploy/` beside `meet.yml`:

    docker compose -f deploy/docker-compose.yml -f deploy/live.yml --env-file deploy/.env up -d

Before the first start, in `deploy/live/` (the example `relay.toml` is there): `cert.pem` and `key.pem` for the
relay's public name, and the auth address in `relay.toml` (`[auth] url`, above).

1. **A key.** `docker run --rm -v "$PWD:/out" moqdev/moq:0.14.16 auth generate --id ferrum-1 --out-dir /out`
   writes `ferrum-1.jwk` (the JWK as base64url text). Paste the file's text into **Set Signing Key**, then delete the
   file: only Live signs and checks passes, so the key lives in the vault alone.
2. **Live Settings** (in the app): *Relay Address* `https://live.example.com`, *Relay Health Address*
   `http://live-relay:8080/health` (as the server reaches it), then **Set Signing Key** with the same key text. The
   app keeps it in the platform's vault, its one home, and never shows it again; it shows only the key's name. A key
   with the name of the one in use and another secret is refused. Then set the same address in the app's own
   settings (*Relay address for browsers*): the interface inside Ferrum may open its connection to the relay only
   at the address that setting names (the manifest's `ui.csp.connect`).
3. **Certificate.** A publicly trusted one for the name (browsers do not accept a self-signed certificate for
   WebTransport unless pinned). The relay watches the files and reloads them.
4. **Host.** Raise the UDP buffers on the Docker host (`net.core.rmem_max` and `wmem_max` = 8388608); the relay
   asks for 8 MiB and logs a warning when the kernel clamps it.

## Kubernetes

`deploy/k8s/live.yaml`: a ConfigMap (the same `relay.toml`), a Deployment (the relay, a probe on `/health`), a
LoadBalancer Service with **UDP and TCP on 443**, a ClusterIP Service for the health check and a NetworkPolicy.
Secret: `live-relay-tls`. The platform's chart
(`deploy/helm/ferrum`) lists no component of this kind today (meetings are "run LiveKit with its own Helm chart"
in operations.md); the same goes here.

## What the platform would add

Nothing in this repository edits the platform. Its changes, for whoever lands them:

* `server/Cargo.toml`: `live = ["dep:ferrum-app-live"]`, the dependency
  `ferrum-app-live = { git = "https://github.com/CBFerrum/ferrum-app-live", branch = "main", optional = true }`, and
  `"live"` in `default`; `server/src/packages.rs`: the line `"live" => ferrum_app_live,` in the native apps (the
  app has no `UI`, so no line in the interface list).
* `deploy/live.yml` (this repository's `deploy/live.yml` and `deploy/live/relay.toml`), a "Live video" section in
  `docs/operations.md` after "Meetings" (this page, shortened), `deploy/.env.example` (`FERRUM_LIVE_HOST`), and
  `docs/registry/apps.yaml` and `docs/registry/release-manifest.yaml` entries as for the other apps.
* `scripts/check_apps.py` reads the platform's lock: it checks this app only once the line above has made
  `cargo metadata` list `ferrum-app-live` from `github.com/CBFerrum/ferrum-app-live`.

## What scales and what fails over

* **Ferrum:** stateless as ever. Seats and counts are in PostgreSQL, taken under a row lock per broadcast; many
  replicas of Ferrum are fine. Upkeep runs on one replica at a time.
* **The relay:** a relay caches the groups its viewers need and forwards the rest, so cost grows with viewers and
  bitrate. For more than one relay, list peers in `[cluster] connect` (a viewer reaches the nearest relay, which pulls the
  broadcast from its peer and caches it) and put DNS, anycast or a UDP load balancer in front; the documentation
  leaves that choice to the operator. A broadcast's presenter and its viewers need not share a relay.
* **Failing over:** a relay that dies drops its sessions. Players reconnect (the components reconnect on their own, with
  the token they hold while it is valid; Live renews it before it runs out). A viewer on a failed relay is picked up by
  another if the cluster has it; the presenter's own relay failing interrupts the stream until the capture element
  reconnects. Every relay asks the same Live. `[quic] idle_timeout` (10 s) and
  `drain_timeout` (10 s) are the relay's own bounds.
* **Rotating the key without dropping anyone:** *Set Signing Key* with a new key (a new `kid`). New passes are signed
  with it; sessions admitted under the key before it go on (Live answers their revalidations under that key), and no
  new session opens with a pass signed by it, so a key replaced because it leaked mints nothing new. Rotate twice and
  sessions from two keys back stop at their next revalidation (the players reconnect with new passes).
* **A person who loses the right** is stopped at the relay's next question: within 30 seconds.

## The doctor check

Live registers a health source for the support report (`Support report` and `ferrum task doctor` read it): it says,
in words, when Live Settings names no relay address, holds no usable signing key, or the relay's health address does
not answer (`GET /health` must be `200`). It holds no key, address or person.

## Recording and replay

moq's documentation describes a live HLS output (`moq export hls`, served from the relay's 30 second cache) and
nothing that records. So Live does not record: see docs/moq.md ("HLS and recording"). A recorder, if you run one
(something that pulls `/{path}/master.m3u8` from the HLS gateway into storage), would sit beside the relay, write to
the address in *Replay Address*, and be told by the broadcast's `recording` setting whether to run; Live then links
the replay and clears the link after *Retention days* (`replay_cleared_at` says when; an automation on that field
can delete the objects).
