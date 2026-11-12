# Live (package)

Entities: **Broadcast** (with its **Presenter** table), **Broadcast Link**, **Live Settings**. Roles: Live User (their own
broadcasts and links), Live Manager (everything and the settings). The routes, the audience ladder, the embed contract and
what was not run against a real relay are in the repository's README; the relay and what was read of it are in
docs/moq.md and docs/deploy.md.

Events the outbox raises, for automations and processes: `live.broadcast_started` and `live.broadcast_ended`
(`{broadcast, title, status?, reference_entity, reference_id}`).

Database: `live_seat` (seats: keyed hashes, no names) and `live_secret` (the key those hashes use), both with row-level security;
upkeep forgets seats a day old, ends broadcasts nobody presents and clears replay links past the retention days.
