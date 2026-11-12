-- Live: seats, the app's own count of who is watching, kept out of every entity so no API, export or audit
-- trail shows it. A seat is a keyed hash (of the person or the link and a browser's random id), never a name,
-- an address or anything the relay sees. A viewer's seat lives as long as their token renewals keep it fresh.
create table live_seat (
  tenant_id uuid not null references tenant(id) on delete cascade,
  broadcast uuid not null,
  seat text not null check (length(seat) between 16 and 128),
  taken_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (tenant_id, broadcast, seat),
  foreign key (tenant_id, broadcast) references e_broadcast (tenant_id, id) on delete cascade
);
create index live_seat_seen on live_seat (tenant_id, broadcast, seen_at);

alter table live_seat enable row level security;
alter table live_seat force row level security;
create policy tenant_isolation on live_seat
  using (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()))
  with check (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()));

-- The workspace's key for the seats' hashes, made on first use (it is not the relay's key: replacing that must
-- not make every viewer a stranger to their own seat).
create table live_secret (
  tenant_id uuid primary key references tenant(id) on delete cascade,
  secret bytea not null check (length(secret) = 32)
);
alter table live_secret enable row level security;
alter table live_secret force row level security;
create policy tenant_isolation on live_secret
  using (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()))
  with check (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()));
