-- Cybervex Invoice: database schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it only creates what is missing.

-- One row per invoice. The full invoice is kept as JSON so the app can evolve
-- without database migrations; `number` is copied out to keep it unique.
create table if not exists public.invoices (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number      text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Invoice numbers are unique per account, ignoring case and spaces.
create unique index if not exists invoices_user_number_key
  on public.invoices (user_id, lower(btrim(number)));

-- One row per account: business profile, defaults and number counters.
create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Row Level Security: every signed-in user sees and changes only their own rows.
alter table public.invoices enable row level security;
alter table public.settings enable row level security;

drop policy if exists "Own invoices" on public.invoices;
create policy "Own invoices" on public.invoices
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own settings" on public.settings;
create policy "Own settings" on public.settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
