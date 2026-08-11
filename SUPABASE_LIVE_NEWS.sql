-- Kizomba Atlas — module "Infos en direct" / bandeau
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Compatible avec la fonction public.is_admin() déjà utilisée par l'admin Kizomba Atlas.

create extension if not exists pgcrypto;

create table if not exists public.live_news (
  id uuid primary key default gen_random_uuid(),
  text_fr text not null check (char_length(text_fr) between 1 and 240),
  text_en text not null check (char_length(text_en) between 1 and 240),
  type text not null default 'info' check (type in ('info','new','important','urgent')),
  priority integer not null default 100,
  active boolean not null default true,
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_news_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.live_news enable row level security;

drop policy if exists "Public can read visible live news" on public.live_news;
create policy "Public can read visible live news"
on public.live_news for select
to anon, authenticated
using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists "Admins can read all live news" on public.live_news;
create policy "Admins can read all live news"
on public.live_news for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert live news" on public.live_news;
create policy "Admins can insert live news"
on public.live_news for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update live news" on public.live_news;
create policy "Admins can update live news"
on public.live_news for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete live news" on public.live_news;
create policy "Admins can delete live news"
on public.live_news for delete
to authenticated
using (public.is_admin());

-- Realtime : ajoute la table à la publication Supabase si nécessaire.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_news'
  ) then
    alter publication supabase_realtime add table public.live_news;
  end if;
end $$;
