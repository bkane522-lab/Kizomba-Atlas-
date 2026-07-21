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


-- KIZOMBA ATLAS — AJOUT DES 4 AFFICHES
-- À exécuter dans Supabase > SQL Editor.
-- Le 14 juillet 2026 étant passé, Saïda Kizomba est conservé en brouillon/archives.

insert into public.events (
  id, title_fr, title_en, description_fr, description_en,
  organizer_name, category, styles, map_style,
  starts_at, ends_at, venue_name, address, city, country,
  latitude, longitude, image_url, logo_url, ticket_url,
  price_text_fr, price_text_en, status
)
values
(
  'initiation-kizomba-rochecorbon-2026-07-28',
  'Initiation Kizomba — Guinguette de Rochecorbon',
  'Kizomba Introduction — Guinguette de Rochecorbon',
  'Initiation Kizomba à 19h30, démonstrations, renseignements et inscriptions pour la rentrée danse Kizomba 2026/27.',
  'Kizomba introduction at 7:30 pm, demonstrations, information and registration for the 2026/27 Kizomba season.',
  'Malembé Kizomba Academy',
  'workshop',
  array['kizomba'],
  'kizomba',
  timestamptz '2026-07-28 19:30:00 Europe/Paris',
  null,
  'La Guinguette de Rochecorbon',
  'Quai de la Loire, 37210 Rochecorbon',
  'Rochecorbon',
  'France',
  47.4080,
  0.7582,
  'https://kizomba-atlas.vercel.app/assets/events/guinguette-rochecorbon-28-juillet-2026.png',
  null,
  'https://www.instagram.com/p/DavR6IgoAiR/',
  '',
  '',
  'published'
),
(
  'saida-kizomba-2026-07-14',
  'Saïda Kizomba — 2 salles Kizomba & Konpa',
  'Saïda Kizomba — Kizomba & Konpa in 2 rooms',
  'Événement du mardi 14 juillet 2026 avec une salle Kizomba et une deuxième salle Konpa. Conservé dans les archives car la date est passée.',
  'Tuesday 14 July 2026 event with one Kizomba room and a second Konpa room. Kept in the archive because the date has passed.',
  'Saïda Kizomba',
  'party',
  array['kizomba'],
  'kizomba',
  timestamptz '2026-07-14 20:00:00 Europe/Paris',
  null,
  'Sensation Dance School',
  '105 Rue de Tolbiac, Dalle des Olympiades, 75013 Paris',
  'Paris',
  'France',
  48.82658,
  2.364743,
  'https://kizomba-atlas.vercel.app/assets/events/saida-kizomba-14-juillet-2026.jpg',
  null,
  'https://www.instagram.com/p/DabCasGM9pK/',
  '',
  '',
  'draft'
),
(
  'my-africana-vibes-kizomba-semba-2026-2027',
  'Cours Kizomba & Semba 2026–2027 — My Africana Vibes',
  'Kizomba & Semba Classes 2026–2027 — My Africana Vibes',
  'Cours tous les mardis : 19h45 Kizomba/Semba intermédiaire, 20h45 Kizomba/Semba débutant évolutif. Portes ouvertes les 15 et 22 septembre 2026.',
  'Classes every Tuesday: 7:45 pm intermediate Kizomba/Semba, 8:45 pm progressive beginner Kizomba/Semba. Open days on 15 and 22 September 2026.',
  'My Africana Vibes',
  'workshop',
  array['kizomba','semba'],
  'semba',
  timestamptz '2026-09-15 19:45:00 Europe/Paris',
  timestamptz '2027-06-15 22:00:00 Europe/Paris',
  'Salle Noël Marchand',
  '99 Boulevard Charles de Gaulle, 37540 Saint-Cyr-sur-Loire',
  'Saint-Cyr-sur-Loire',
  'France',
  47.413159,
  0.672493,
  'https://kizomba-atlas.vercel.app/assets/events/my-africana-vibes-2026-2027.png',
  null,
  'https://www.helloasso.com/associations/my-africana-vibes',
  'Inscriptions : voir la page officielle',
  'Registration: see official page',
  'published'
),
(
  'curtis-kelly-tous-les-jeudis-2026-2027',
  'Urban Kiz & Kizomba tous les jeudis — Curtis & Kelly',
  'Urban Kiz & Kizomba Every Thursday — Curtis & Kelly',
  'Tous les jeudis dès la rentrée de septembre 2026, de 20h30 à 2h, avec Curtis & Kelly. En partenariat avec Sensa’Kiz et KIZ.',
  'Every Thursday from September 2026, 8:30 pm to 2:00 am, with Curtis & Kelly. In partnership with Sensa’Kiz and KIZ.',
  'Curtis & Kelly / Sensa’Kiz',
  'party',
  array['urban-kiz','kizomba'],
  'urban-kiz',
  timestamptz '2026-09-03 20:30:00 America/Toronto',
  timestamptz '2027-06-25 02:00:00 America/Toronto',
  'L.E Mango — Espaces des Arts',
  '9 Rue Sainte-Catherine Est, 2e étage, Montréal, QC H2X 1K3',
  'Montréal',
  'Canada',
  45.5103209,
  -73.5637369,
  'https://kizomba-atlas.vercel.app/assets/events/curtis-kelly-jeudis-2026.png',
  null,
  null,
  '',
  '',
  'published'
)
on conflict (id) do update set
  title_fr = excluded.title_fr,
  title_en = excluded.title_en,
  description_fr = excluded.description_fr,
  description_en = excluded.description_en,
  organizer_name = excluded.organizer_name,
  category = excluded.category,
  styles = excluded.styles,
  map_style = excluded.map_style,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  venue_name = excluded.venue_name,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  image_url = excluded.image_url,
  logo_url = excluded.logo_url,
  ticket_url = excluded.ticket_url,
  price_text_fr = excluded.price_text_fr,
  price_text_en = excluded.price_text_en,
  status = excluded.status,
  updated_at = now();
