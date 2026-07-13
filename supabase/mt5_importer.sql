create table if not exists public.mt5_deals (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mt5_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket bigint not null,
  position_id bigint,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  volume numeric not null,
  price numeric not null,
  profit numeric not null default 0,
  commission numeric not null default 0,
  swap numeric not null default 0,
  fee numeric not null default 0,
  occurred_at timestamptz not null,
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (connection_id, ticket)
);

alter table public.mt5_deals enable row level security;

create policy "Users view their own MT5 deals"
on public.mt5_deals for select
using (user_id = auth.uid());

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.mt5_deals to service_role;
