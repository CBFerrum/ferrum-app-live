-- Live: poll votes. One a seat in a poll (the key), the seat being the keyed hash the viewer watches from: no name.
-- Not an entity, so no API, export or audit trail shows who voted how; counts are read from it.
create table live_poll_vote (
  tenant_id uuid not null references tenant(id) on delete cascade,
  poll uuid not null,
  seat text not null check (length(seat) between 16 and 128),
  choice integer not null check (choice between 0 and 9),
  voted_at timestamptz not null default now(),
  primary key (tenant_id, poll, seat),
  foreign key (tenant_id, poll) references e_broadcast_poll (tenant_id, id) on delete cascade
);

alter table live_poll_vote enable row level security;
alter table live_poll_vote force row level security;
create policy tenant_isolation on live_poll_vote
  using (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()))
  with check (tenant_id = (select ferrum_tenant()) or (select ferrum_is_system()));
