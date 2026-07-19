-- Kizomba Atlas — Base de données, comptes organisateurs et modération
-- Ce script peut être exécuté sur une installation existante.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  organization_name text not null default '',
  plan text not null default 'free',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'pro'));

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title_fr text not null,
  title_en text not null,
  description_fr text default '',
  description_en text default '',
  category text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  address text not null,
  city text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  ticket_url text,
  price_text_fr text default '',
  price_text_en text default '',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events add column if not exists owner_id uuid;
alter table public.events add column if not exists styles text[] not null default ARRAY[]::text[];
alter table public.events add column if not exists logo_url text;
alter table public.events add column if not exists map_style text;
alter table public.events add column if not exists organizer_name text not null default '';
alter table public.events add column if not exists moderation_note text;
alter table public.events add column if not exists featured boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_owner_id_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events add constraint events_owner_id_fkey
      foreign key (owner_id) references public.profiles(user_id) on delete set null;
  end if;
end $$;

alter table public.events drop constraint if exists events_category_check;

-- Migration des anciennes catégories vers le nouveau modèle : type + styles.
update public.events
set styles = array[category], category = 'party'
where category in ('kizomba', 'urban-kiz', 'bachata', 'sbk', 'semba', 'tarraxo')
  and cardinality(styles) = 0;

alter table public.events add constraint events_category_check
  check (category in ('party', 'festival', 'workshop'));

alter table public.events drop constraint if exists events_map_style_check;
alter table public.events add constraint events_map_style_check
  check (
    map_style is null
    or map_style in ('kizomba', 'urban-kiz', 'bachata', 'sbk', 'semba', 'tarraxo')
  );

update public.events
set map_style = case
  when 'sbk' = any(styles) and cardinality(styles) > 1 then 'sbk'
  when cardinality(styles) > 0 then styles[1]
  else 'kizomba'
end
where map_style is null;

alter table public.events drop constraint if exists events_styles_check;
alter table public.events add constraint events_styles_check
  check (styles <@ ARRAY['kizomba', 'urban-kiz', 'bachata', 'sbk', 'semba', 'tarraxo']::text[]);

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'pending', 'published', 'changes_requested', 'rejected', 'cancelled', 'expired'));

alter table public.events drop constraint if exists events_latitude_check;
alter table public.events add constraint events_latitude_check check (latitude between -90 and 90);
alter table public.events drop constraint if exists events_longitude_check;
alter table public.events add constraint events_longitude_check check (longitude between -180 and 180);

create table if not exists public.live_news (
  id uuid primary key default gen_random_uuid(),
  text_fr text not null,
  text_en text not null,
  type text not null default 'info',
  priority integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_news drop constraint if exists live_news_type_check;
alter table public.live_news add constraint live_news_type_check
  check (type in ('info', 'urgent', 'new', 'cancelled', 'tickets'));
alter table public.live_news drop constraint if exists live_news_priority_check;
alter table public.live_news add constraint live_news_priority_check check (priority between 0 and 99);

create table if not exists public.pro_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.pro_requests drop constraint if exists pro_requests_status_check;
alter table public.pro_requests add constraint pro_requests_status_check
  check (status in ('pending', 'approved', 'declined'));
create unique index if not exists pro_requests_one_pending_per_user
  on public.pro_requests(user_id) where status = 'pending';

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at before update on public.events
for each row execute function public.set_updated_at();
drop trigger if exists set_live_news_updated_at on public.live_news;
create trigger set_live_news_updated_at before update on public.live_news
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.current_plan()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select plan from public.profiles where user_id = auth.uid()), 'free');
$$;

create or replace function public.monthly_submission_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from public.events
  where owner_id = auth.uid()
    and created_at >= date_trunc('month', now())
    and created_at < date_trunc('month', now()) + interval '1 month';
$$;

create or replace function public.can_submit_event()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.current_plan() = 'pro' or public.monthly_submission_count() < 2;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_plan() to authenticated;
grant execute on function public.monthly_submission_count() to authenticated;
grant execute on function public.can_submit_event() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, organization_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'organization_name', new.raw_user_meta_data ->> 'display_name', '')
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.plan := 'free';
    new.verified := false;
  else
    new.user_id := old.user_id;
    new.plan := old.plan;
    new.verified := old.verified;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges_trigger on public.profiles;
create trigger protect_profile_privileges_trigger before insert or update on public.profiles
for each row execute function public.protect_profile_privileges();

create or replace function public.protect_organizer_event()
returns trigger language plpgsql security invoker set search_path = public as $$
declare profile_name text;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;

  select organization_name into profile_name from public.profiles where user_id = auth.uid();

  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.status := 'pending';
    new.featured := false;
    new.moderation_note := null;
    new.organizer_name := coalesce(nullif(new.organizer_name, ''), profile_name, '');
    return new;
  end if;

  if old.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  new.owner_id := old.owner_id;
  new.featured := old.featured;
  new.moderation_note := old.moderation_note;
  new.organizer_name := coalesce(nullif(new.organizer_name, ''), profile_name, old.organizer_name, '');
  if new.status = 'cancelled' then return new; end if;
  new.status := 'pending';
  return new;
end;
$$;

drop trigger if exists protect_organizer_event_trigger on public.events;
create trigger protect_organizer_event_trigger before insert or update on public.events
for each row execute function public.protect_organizer_event();

alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.live_news enable row level security;
alter table public.pro_requests enable row level security;

drop policy if exists "Admin can read own admin record" on public.admins;
create policy "Admin can read own admin record" on public.admins for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Profiles can be read by owner or admin" on public.profiles;
create policy "Profiles can be read by owner or admin" on public.profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile" on public.profiles for insert to authenticated
with check (user_id = auth.uid() and plan = 'free' and verified = false);
drop policy if exists "Profiles can be updated by owner or admin" on public.profiles;
create policy "Profiles can be updated by owner or admin" on public.profiles for update to authenticated
using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Public can read published events" on public.events;
drop policy if exists "Public and owners can read events" on public.events;
create policy "Public and owners can read events" on public.events for select to anon, authenticated
using (status = 'published' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "Admins can insert events" on public.events;
drop policy if exists "Admins and organizers can insert events" on public.events;
create policy "Admins and organizers can insert events" on public.events for insert to authenticated
with check (public.is_admin() or (owner_id = auth.uid() and status = 'pending' and public.can_submit_event()));

drop policy if exists "Admins can update events" on public.events;
drop policy if exists "Admins and owners can update events" on public.events;
create policy "Admins and owners can update events" on public.events for update to authenticated
using (public.is_admin() or owner_id = auth.uid())
with check (public.is_admin() or (owner_id = auth.uid() and status in ('pending', 'cancelled')));

drop policy if exists "Admins can delete events" on public.events;
drop policy if exists "Admins and owners can delete unpublished events" on public.events;
create policy "Admins and owners can delete unpublished events" on public.events for delete to authenticated
using (public.is_admin() or (owner_id = auth.uid() and status <> 'published'));

drop policy if exists "Public can read active live news" on public.live_news;
create policy "Public can read active live news" on public.live_news for select to anon, authenticated
using (active = true or public.is_admin());
drop policy if exists "Admins can insert live news" on public.live_news;
create policy "Admins can insert live news" on public.live_news for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins can update live news" on public.live_news;
create policy "Admins can update live news" on public.live_news for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins can delete live news" on public.live_news;
create policy "Admins can delete live news" on public.live_news for delete to authenticated using (public.is_admin());

drop policy if exists "Users and admins can read pro requests" on public.pro_requests;
create policy "Users and admins can read pro requests" on public.pro_requests for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Users can create pro requests" on public.pro_requests;
create policy "Users can create pro requests" on public.pro_requests for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "Admins can resolve pro requests" on public.pro_requests;
create policy "Admins can resolve pro requests" on public.pro_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view event images" on storage.objects;
create policy "Public can view event images" on storage.objects for select to public
using (bucket_id = 'event-images');
drop policy if exists "Users can upload own event images" on storage.objects;
create policy "Users can upload own event images" on storage.objects for insert to authenticated
with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update own event images" on storage.objects;
create policy "Users can update own event images" on storage.objects for update to authenticated
using (bucket_id = 'event-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
with check (bucket_id = 'event-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "Users can delete own event images" on storage.objects;
create policy "Users can delete own event images" on storage.objects for delete to authenticated
using (bucket_id = 'event-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='live_news') then
    alter publication supabase_realtime add table public.live_news;
  end if;
end $$;

-- Après avoir créé votre compte administrateur dans Authentication > Users :
-- insert into public.admins (user_id)
-- values ('VOTRE-UUID-UTILISATEUR')
-- on conflict (user_id) do nothing;
