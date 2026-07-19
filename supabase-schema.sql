-- KIZOMBA ATLAS — BACKEND PRIVÉ SIMPLIFIÉ
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Compte administrateur autorisé : kizombaatlas.contact@gmail.com

create extension if not exists pgcrypto;

create table if not exists public.events (
  id text primary key default gen_random_uuid()::text,
  title_fr text not null,
  title_en text not null default '',
  description_fr text not null default '',
  description_en text not null default '',
  organizer_name text not null default '',
  category text not null default 'party'
    check (category in ('party', 'festival', 'workshop')),
  styles text[] not null default array['kizomba']::text[],
  map_style text not null default 'kizomba'
    check (map_style in ('kizomba', 'urban-kiz', 'bachata', 'sbk', 'semba', 'tarraxo')),
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
  price_text_fr text not null default '',
  price_text_en text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'kizombaatlas.contact@gmail.com';
$$;

grant execute on function public.is_admin() to authenticated;

alter table public.events enable row level security;

drop policy if exists "Public reads published events" on public.events;
create policy "Public reads published events"
on public.events
for select
to anon, authenticated
using (status = 'published' or public.is_admin());

drop policy if exists "Admin inserts events" on public.events;
create policy "Admin inserts events"
on public.events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admin updates events" on public.events;
create policy "Admin updates events"
on public.events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin deletes events" on public.events;
create policy "Admin deletes events"
on public.events
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads event images" on storage.objects;
create policy "Public reads event images"
on storage.objects
for select
to public
using (bucket_id = 'event-images');

drop policy if exists "Admin uploads event images" on storage.objects;
create policy "Admin uploads event images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-images'
  and public.is_admin()
);

drop policy if exists "Admin updates event images" on storage.objects;
create policy "Admin updates event images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_admin()
)
with check (
  bucket_id = 'event-images'
  and public.is_admin()
);

drop policy if exists "Admin deletes event images" on storage.objects;
create policy "Admin deletes event images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_admin()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- Les deux événements actuellement visibles dans la version de démonstration.
insert into public.events (
  id, title_fr, title_en, description_fr, description_en,
  organizer_name, category, styles, map_style,
  starts_at, ends_at, venue_name, address, city, country,
  latitude, longitude, image_url, logo_url, ticket_url,
  price_text_fr, price_text_en, status
)
values
(
  'pkc-2026-hilton-cdg',
  'Paris Kizomba Congress 2026 — PKC',
  'Paris Kizomba Congress 2026 — PKC',
  'Événement international dédié à la Kizomba, au Semba, à la Tarraxinha et aux danses africaines.',
  'International event dedicated to Kizomba, Semba, Tarraxinha and African dances.',
  'Paris Kizomba Congress',
  'festival',
  array['kizomba','urban-kiz','semba'],
  'kizomba',
  '2026-11-20T20:00:00+01:00',
  '2026-11-23T07:00:00+01:00',
  'Hilton Paris Charles de Gaulle Airport',
  '8 Rue de Rome, 93290 Tremblay-en-France',
  'Tremblay-en-France',
  'France',
  49.010263,
  2.557379,
  null,
  null,
  'https://my.weezevent.com/paris-kizomba-congress-2026',
  'Voir la billetterie officielle',
  'See official ticketing',
  'published'
),
(
  'dance-affinity-2026-freiburg',
  'Dance Affinity Festival 2026',
  'Dance Affinity Festival 2026',
  'Festival à Fribourg-en-Brisgau réunissant Kizomba et Bachata.',
  'Festival in Freiburg im Breisgau bringing together Kizomba and Bachata.',
  'Dance Affinity Festival',
  'festival',
  array['kizomba','bachata','sbk'],
  'sbk',
  '2026-10-30T20:00:00+01:00',
  '2026-11-02T04:00:00+01:00',
  'M.A.K Studio',
  'Kaiser-Joseph-Straße 268, 79098 Freiburg im Breisgau',
  'Freiburg im Breisgau',
  'Allemagne',
  47.991997,
  7.848298,
  null,
  null,
  'https://my.weezevent.com/dance-affinity-2026',
  'Voir la billetterie officielle',
  'See official ticketing',
  'published'
)
on conflict (id) do nothing;
