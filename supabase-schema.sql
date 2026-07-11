-- Kizomba Atlas — Schéma Supabase sécurisé
-- À exécuter dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title_fr text not null,
  title_en text not null,
  description_fr text default '',
  description_en text default '',
  category text not null check (category in ('kizomba', 'urban-kiz', 'semba', 'tarraxo', 'festival', 'workshop')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  address text not null,
  city text not null,
  country text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  image_url text,
  ticket_url text,
  price_text_fr text default '',
  price_text_en text default '',
  status text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_news (
  id uuid primary key default gen_random_uuid(),
  text_fr text not null,
  text_en text not null,
  type text not null default 'info' check (type in ('info', 'urgent', 'new', 'cancelled', 'tickets')),
  priority integer not null default 0 check (priority between 0 and 99),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_live_news_updated_at on public.live_news;
create trigger set_live_news_updated_at
before update on public.live_news
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.live_news enable row level security;

drop policy if exists "Public can read published events" on public.events;
create policy "Public can read published events"
on public.events
for select
to anon, authenticated
using (status = 'published' or public.is_admin());

drop policy if exists "Admins can insert events" on public.events;
create policy "Admins can insert events"
on public.events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update events" on public.events;
create policy "Admins can update events"
on public.events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
on public.events
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read active live news" on public.live_news;
create policy "Public can read active live news"
on public.live_news
for select
to anon, authenticated
using (active = true or public.is_admin());

drop policy if exists "Admins can insert live news" on public.live_news;
create policy "Admins can insert live news"
on public.live_news
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update live news" on public.live_news;
create policy "Admins can update live news"
on public.live_news
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete live news" on public.live_news;
create policy "Admins can delete live news"
on public.live_news
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admin can read own admin record" on public.admins;
create policy "Admin can read own admin record"
on public.admins
for select
to authenticated
using (user_id = auth.uid());

-- Realtime
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.live_news;

-- APRÈS avoir créé votre compte dans Authentication > Users :
-- Remplacez le UUID ci-dessous par l'ID exact de votre utilisateur,
-- puis exécutez uniquement la ligne INSERT.
--
-- insert into public.admins (user_id)
-- values ('VOTRE-UUID-UTILISATEUR')
-- on conflict (user_id) do nothing;
