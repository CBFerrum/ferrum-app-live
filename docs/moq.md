# What Live was built against: Media over QUIC (moq)

Read on 13 November 2026, from the project's own repository and documentation, not from memory. Where the
documentation says nothing, this page says so, and the app keeps that part behind one interface
(`src/relay.rs`, the `Relay` trait) instead of guessing.

## The version pinned

| What | Version | Released | How checked |
|---|---|---|---|
| `moq-relay` | **0.17.16** (tag `moq-relay-v0.17.16`, commit `b1a90aa`) | 11 Nov 2026 | `gh release view`: binaries, `.deb`, `.rpm` and `SHA256SUMS` attached |
| `moq` (the CLI: `moq auth`, the gateways) | 0.14.16 (tag `moq-cli-v0.14.16`) | 11 Nov 2026 | `gh release view` |
| Docker images | `moqdev/moq-relay:0.17.16`, `moqdev/moq:0.14.16` | | Docker Hub tag listing |
| `@moq/watch` (`<moq-watch>`) | 0.6.6 | 23 Oct 2026 | npm registry: `latest`, `(MIT OR Apache-2.0)`, exports `./element` |
| `@moq/publish` (`<moq-publish>`) | 0.5.6 | 7 Nov 2026 | npm registry: `latest` |

The tag was cloned and its `doc/` and `rs/` read at that commit. The repository's own words: the relay is before
1.0 and "APIs may change between releases"; `main` is the trunk where breaking changes land, the `release`
branch is what gets published. The project is dual-licensed Apache-2.0 or MIT; its OBS plugin (`cpp/obs/`) is
GPL-2.0-or-later and is **not used**. No code of moq is copied into this repository: the app speaks to it over
HTTP and signs tokens it reads.

Pages read (the docs site is `https://doc.moq.dev`; the files below are `doc/**` in the tag, which that site
renders; the site's pages for the same topics are `/bin/relay/`, `/bin/relay/auth`, `/bin/relay/config`,
`/bin/relay/http`, `/bin/relay/cluster`, `/setup/prod`, `/setup/install`, `/lib/js/watch`, `/lib/js/publish`,
`/bin/hls`, `/bin/rtmp`, `/bin/srt`, `/bin/rtc`, `/concept/transport`, `/concept/hang`):

* `https://github.com/moq-dev/moq` (README), `doc/bin/relay/{index,auth,config,http,cluster}.md`
* `doc/setup/{prod,install}.md`, `doc/lib/js/{watch,publish}.md`
* `doc/bin/{hls,rtmp,srt,rtc,cli}.md`, `doc/concept/{transport,hang}.md`
* source: `rs/moq-auth/src/{claims,key,wire,serve}.rs` (token format and the reference auth server),
  `rs/moq-archive/README.md`, `.github/workflows/docker.yml` (image names and tags)

(Five of the page addresses first tried, such as `https://moq.dev/bin/relay/`, answered 404: the docs live on
`doc.moq.dev`. The repository files were read instead.)

## The relay

* `moq-relay relay.toml` (one TOML file; every key is also a `--flag` and a `MOQ_*` variable). Listeners:
  QUIC and WebTransport on UDP (`[listen] bind`, 443 in production), HTTPS plus the WebSocket fallback on TCP
  (`[web.https] listen`), optional plain HTTP, and a private `[internal]` listener (`/metrics`, `/sessions`,
  `/nodes`, no authentication: loopback or a private network only).
* TLS: `[listen.tls] cert`/`key` (or `generate` for development); certificate files are watched and reloaded.
  `GET /certificate.sha256` helps local browsers pin a self-signed certificate.
* Health: `GET /health` answers `200 ok`, unauthenticated, "for load balancers". **This is the check the app's
  doctor makes.**
* Host tuning: the relay asks for 8 MiB UDP buffers; on Linux set `net.core.rmem_max` and `wmem_max` to 8388608.
* Cache: `[cache] duration` (default 30 s) bounds how long non-latest groups are kept; the latest group of every
  track is always kept.
* Clustering: relays dial the peers listed in `[cluster] connect` (or `connect_api`, or LAN discovery); a viewer
  talks to the nearest relay, which pulls from a peer and caches. Hop lists pick the shortest route and catch loops.
  Failover routes must carry copies of the same broadcast (the document says how an incompatible source is
  refused). Which entry relay a client uses (DNS, anycast, a load balancer) is left to the operator.
  `[quic] idle_timeout` (default 10 s) bounds how long a vanished peer keeps its routes.
* Shutdown: `drain_timeout` (default 10 s) and a GOAWAY to sessions on SIGTERM.

## How it admits people (0.17.16: one auth contract)

A relay admits a session in exactly one of two ways: `--auth-url` (an auth server asked once per session event)
or `--auth-public` (a static anonymous grant). Setting both or neither fails at startup. **The relay no longer
verifies a token itself: the reference auth server `moq auth serve` does**, and the relay asks it.

* Request (relay to auth server): `id`, `event` (`connect`, `revalidate`, `end`), `path` as dialed, `query`,
  `token`, `transport`, `remote`, ... Grant (answer): `publish` and `subscribe` pattern unions, `root`, `mounts`,
  `expires` (unix seconds; the session closes then), `revalidate` (seconds until the relay asks again; needs
  `expires`), `tier`, `peer`. A 401 or 403 refuses; an unreachable server refuses (nothing is admitted because
  the server was down).
* `moq auth serve --listen 127.0.0.1:4440 --key-dir /etc/moq/keys` (or `--key FILE`) verifies a **JWT**
  presented as `?jwt=` on the URL or in a moq-transport SETUP token of type 0. Algorithms: HMAC
  (HS256/384/512), RSA, ECDSA (ES256/384), EdDSA. A key is a JWK file; with `--key-dir` the file `{kid}.jwk` is
  chosen by the token's `kid` header **and read per request, "so rotation needs no restart"**.
* Claims (`rs/moq-auth/src/wire.rs`): `root` (base path), `publish` and `subscribe` (pattern lists under the
  root: `**` is everything, `foo` is one broadcast, `foo/**` a subtree), `exp`, `iat`, `nbf`; `iss`, `sub`, `jti`
  are read and ignored; **any other claim refuses the token** (so a token cannot carry application data). The
  older `put`/`get` prefix form is still read. `exp` is enforced for the whole session, not only at connect, and
  exactly (no clock-skew grace).
* The session's root is the path the client dialed (`https://relay/{root}?jwt=...`); a token for root `r` is
  authorised at a dialed path that equals `r`, extends it (narrowing) or is a parent of it; an unrelated path is
  refused. **Live signs `root = {prefix}/{workspace}/{broadcast}` with `publish: ["**"]` (presenter) or
  `subscribe: ["**"]` (viewer) and an `exp`, and nothing else**; the client dials exactly that path.
* **Interop vector.** `src/relay.rs` has a test that verifies the HS256 token `@moq/auth` (JavaScript) signed
  in moq's own test suite (`rs/moq-auth/src/key.rs`, `JS_HS256_TOKEN`) with this app's verifier, which proves
  the header, the unpadded base64url and the signature are the same.
* **Rotation without dropping viewers.** Both keys are accepted for a window if both `{kid}.jwk` files are in the
  key directory: the app signs with the new one, tokens signed with the old one verify until they expire.
  Deleting or rotating a key does **not** close live sessions unless the auth server runs with `--revalidate`
  ("Without `--revalidate`, rotating or deleting a key does not close live sessions"). Live asks for no
  revalidation by default.
* Anonymous (`--auth-public`) and mTLS exist; **a session that presents a token while only public rules are
  configured is refused**, so the relay of a Live deployment runs with `--auth-url`.
* Key generation: `moq auth generate --id ferrum-1 --out-dir keys/` (HS256 by default; `--out FILE` for one file;
  `--algorithm ES256 --public public.jwk` for asymmetric). **The file holds the JWK as base64url text of its JSON**
  (`rs/moq-cli/src/auth.rs`: "Output is base64url-encoded JSON"); readers accept either form, and so does Live; `moq auth sign`, `moq auth verify`. A symmetric secret must be at least 32 bytes. **The app only
  supports HS256 (`kty oct`) keys**: the relay's verifying key and the app's signing key are one secret.
  (An asymmetric key would keep the signing key off the relay host; the `Relay` trait is where that would go.)

## The browser components

* `<moq-watch url="https://relay/{path}?jwt=..." name="live.hang">` with a `<canvas>` inside; attributes `url`,
  `name`, `paused`, `muted`, `volume`, `delay` (`auto`, a duration, or `instant`), `buffer`, `captions`,
  `visible`, `announced`, `catalog-format`. `import "@moq/watch/element"` registers it
  (`https://esm.sh/@moq/watch/element` for a no-build page).
* `<moq-publish url=... name=... source="camera|screen|file">` with a `<video muted autoplay>` inside; also
  `muted`, `invisible`, `preview`, `announce`. `@moq/publish/element`.
* The URL carries the token (`?jwt=`); changing the `url` attribute reconnects, which is how a renewed token is
  applied (a short interruption: the relay ends a session at its token's `exp`).
* Transport: WebTransport in Chrome, Edge and Firefox 153+; **Safari uses the WebSocket fallback** (`wss://`),
  which clients race automatically and the relay serves from `[web.https]` (TCP). The docs say it cannot escape
  head-of-line blocking.

## The gateways

All are the `moq` CLI, each bridging **one** broadcast (`--broadcast`) to a relay URL (`--connect`, whose path
and `?jwt=` are the auth path):

| Gateway | Command | Notes from the pages |
|---|---|---|
| RTMP ingest | `moq import rtmp --listen '[::]:1935'` | OBS, FFmpeg, hardware encoders; **ignores the stream key and the app**; "The CLI listener is unauthenticated; firewall it". Multi-tenant routing by key is "your own program" (the `moq-rtmp` library) |
| RTMP out | `moq export rtmp --connect rtmp://...` | restream to another service |
| SRT | `moq import srt --listen '[::]:9000'` / `export srt` | MPEG-TS contribution |
| WHIP/WHEP | `moq import rtc --listen` / `export rtc --listen` | browsers and WebRTC services |
| HLS out | `moq export hls --listen '[::]:8089'` | below |

### HLS and recording: what the documentation allows

* `moq export hls` serves a broadcast as HLS (and DASH `manifest.mpd`) over HTTP:
  `/{broadcast}/master.m3u8`, per-rendition playlists, CMAF init and `.m4s` segments, built **on demand from the
  relay's cache**: "a segment is servable for as long as the relay's cache retains it" (default 30 s). `--window`
  sets the playlist length (default 16 s). H.264/H.265 and AAC/Opus are served; LL-HLS parts are not implemented.
* **Nothing in the pages read says that moq records a broadcast or writes segments to storage.** The HLS
  gateway is live. The one related thing in the source is `moq-archive`, "versioned hang recordings on any
  `object_store::ObjectStore`", a Rust library with a layout and codecs (the catalog can advertise an `archive`
  entry); the docs describe no process that uses it.
* So Live **does not record**. What it has for replay: a `replay_url` on an ended broadcast (set from Live
  Settings' replay address and the broadcast's path, `{replay_base_url}/{path}/master.m3u8`, or by hand), the
  retention days after which upkeep clears it and says when (`replay_cleared_at`), and a setting for whether a
  broadcast is to be recorded (told to whatever records). The recorder itself (something that pulls the HLS output
  into storage) is the operator's; `docs/deploy.md` says where it would sit. Untested, undocumented by moq,
  and left out of the code.

## What could not be verified (nothing here had a relay)

Everything above is from documentation and source. No relay, auth server or browser was run for this slice. The
paths this app takes that have therefore **never met real moq** are listed in the README ("What was not run
against a real relay") and in the reply that came with this release.
