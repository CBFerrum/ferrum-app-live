-- Live 0.2: seats are hashed with a key derived from Live's own key in the vault, and the relay's signing key is
-- Live's secret in the vault (src/keys.rs). The workspace's key in live_secret hashes nothing any more: when it stopped,
-- so that a viewer watching across the upgrade keeps their seat (the vault, where it moves sealed, hashes their old
-- seat) for two hours, and not after. The build before this one still reads the table; its rows go in the release
-- after this one.
alter table live_secret add column if not exists retired_at timestamptz;
