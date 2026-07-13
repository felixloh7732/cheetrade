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

drop policy if exists "Users view their own MT5 deals" on public.mt5_deals;
create policy "Users view their own MT5 deals"
on public.mt5_deals for select
using (user_id = auth.uid());

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.mt5_deals to service_role;

create table if not exists public.mt5_positions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mt5_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket bigint not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  volume numeric not null,
  open_price numeric not null,
  current_price numeric not null,
  stop_loss numeric not null default 0,
  take_profit numeric not null default 0,
  profit numeric not null default 0,
  swap numeric not null default 0,
  opened_at timestamptz not null,
  synced_at timestamptz not null default now(),
  unique (connection_id, ticket)
);

alter table public.mt5_positions enable row level security;

drop policy if exists "Users view their own MT5 positions" on public.mt5_positions;
create policy "Users view their own MT5 positions"
on public.mt5_positions for select
using (user_id = auth.uid());

grant select, insert, update, delete on table public.mt5_positions to service_role;

create table if not exists public.mt5_account_snapshots (
  connection_id uuid primary key references public.mt5_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  balance numeric not null default 0,
  equity numeric not null default 0,
  margin numeric not null default 0,
  free_margin numeric not null default 0,
  currency text not null default 'USD',
  server text,
  synced_at timestamptz not null default now()
);

alter table public.mt5_account_snapshots enable row level security;

drop policy if exists "Users view their own MT5 account snapshots" on public.mt5_account_snapshots;
create policy "Users view their own MT5 account snapshots"
on public.mt5_account_snapshots for select
using (user_id = auth.uid());

grant select, insert, update, delete on table public.mt5_account_snapshots to service_role;
