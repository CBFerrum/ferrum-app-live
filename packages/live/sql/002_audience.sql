-- Live: the audience of a broadcast minute by minute, derived by upkeep from the seats live in that minute (never
-- typed, and holding no name: a number of seats). The sum of a broadcast's minutes is its viewer-minutes.
create table live_audience_minute (
  tenant_id uuid not null references tenant(id) on delete cascade,
  broadcast uuid not null,
  minute timestamptz not null,
  viewers integer not null check (viewers >= 0),
  primary key (tenant_id, broadcast, minute),
  foreign key (tenant_id, broadcast) references e_broadcast (tenant_id, id) on delete cascade
);

alter table live_audience_minute enable row level security;
alter table live_audience_minute force row level security;
create policy tenant_isolation on live_audience_minute
  using (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()))
  with check (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()));
