-- =========================================================
-- KIZOMBA ATLAS — TAGS SECONDAIRES DE COURS
-- À exécuter dans Supabase > SQL Editor.
-- Aucune donnée existante n'est modifiée ni supprimée.
--
-- Ces tags ne sont JAMAIS des filtres publics.
-- Les 7 filtres de la carte restent inchangés :
--   Tout · Kizomba · Urban Kiz · Bachata · SBK · Festival · Workshop
-- =========================================================

alter table public.events
  add column if not exists course_tags text[] not null default '{}';

-- Valeurs autorisées, vérifiées en base pour éviter les fautes de saisie.
alter table public.events
  drop constraint if exists events_course_tags_check;

alter table public.events
  add constraint events_course_tags_check
  check (
    course_tags <@ ARRAY[
      'kizomba-traditionnelle',
      'urban-kiz',
      'tango-kiz',
      'kiz-fusion',
      'semba',
      'musicalite',
      'men-styling',
      'lady-styling',
      'cours-individuel',
      'cours-couple',
      'cours-collectif'
    ]::text[]
  );

-- Recherche rapide par tag.
create index if not exists events_course_tags_idx
  on public.events using gin (course_tags);

-- Vérification
select id, title_fr, course_tags, is_featured, status
from public.events
order by starts_at;
