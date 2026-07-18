-- Kizomba Atlas — schéma Supabase
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated, anon;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title_fr text not null,
  title_en text,
  description_fr text,
  description_en text,
  category text not null default 'party',
  styles text[] not null default array['kizomba']::text[],
  map_style text not null default 'kizomba',
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  address text not null,
  city text not null,
  country text not null default 'France',
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  logo_url text,
  ticket_url text,
  organizer_name text,
  price_text_fr text,
  price_text_en text,
  status text not null default 'pending' check (status in ('draft','pending','published','changes_requested','rejected','cancelled','expired')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_news (
  id uuid primary key default gen_random_uuid(),
  text_fr text not null,
  text_en text,
  type text not null default 'info',
  priority integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  organization_name text,
  plan text not null default 'free' check (plan in ('free','pro')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pro_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  organization_name text not null,
  contact_email text not null,
  official_url text,
  event_name text not null,
  event_type text not null default 'party',
  styles text[] not null default array['Kizomba']::text[],
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  address text,
  city text,
  country text default 'France',
  ticket_url text,
  poster_url text,
  price_text text,
  request_type text default 'standard',
  additional_info text,
  status text not null default 'pending' check (status in ('pending','processed','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.events enable row level security;
alter table public.live_news enable row level security;
alter table public.profiles enable row level security;
alter table public.pro_requests enable row level security;
alter table public.event_requests enable row level security;
alter table public.admin_users enable row level security;

-- Lecture publique uniquement des événements publiés et infos actives.
drop policy if exists "public read published events" on public.events;
create policy "public read published events" on public.events for select using (status = 'published' or public.is_admin());

drop policy if exists "admin manage events" on public.events;
create policy "admin manage events" on public.events for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read live news" on public.live_news;
create policy "public read live news" on public.live_news for select using (active = true or public.is_admin());

drop policy if exists "admin manage live news" on public.live_news;
create policy "admin manage live news" on public.live_news for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read profiles" on public.profiles;
create policy "admin read profiles" on public.profiles for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin manage pro requests" on public.pro_requests;
create policy "admin manage pro requests" on public.pro_requests for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public submit event requests" on public.event_requests;
create policy "public submit event requests" on public.event_requests for insert to anon, authenticated with check (status = 'pending');

drop policy if exists "admin manage event requests" on public.event_requests;
create policy "admin manage event requests" on public.event_requests for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read admin users" on public.admin_users;
create policy "admin read admin users" on public.admin_users for select using (public.is_admin());

-- À exécuter après création du compte administrateur dans Authentication > Users :
-- insert into public.admin_users(user_id) values ('UUID_DU_COMPTE_ADMIN');

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.live_news;
