-- =========================================================
-- KIZOMBA ATLAS — Connexion Meta/Instagram (Autopilote réel)
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Idempotent : peut être relancé sans risque, ne supprime rien.
-- =========================================================

-- Compte(s) Instagram connecté(s). Le token n'est JAMAIS stocké en clair :
-- il est chiffré côté application (AES-256-GCM, clé META_TOKEN_ENCRYPTION_KEY)
-- avant d'arriver ici. Cette table n'est accessible que via la clé
-- service_role, donc jamais depuis le navigateur.
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  ig_user_id text not null,
  ig_username text,
  access_token_encrypted text not null,
  token_iv text not null,
  token_tag text not null,
  token_expires_at timestamptz,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, ig_user_id)
);

alter table public.social_accounts enable row level security;
-- Aucune policy publique créée volontairement : sans policy, RLS bloque
-- tout accès via la clé anon. Seule la clé service_role (utilisée uniquement
-- côté serveur, jamais dans le navigateur) peut lire/écrire cette table.

-- Journal des tentatives de publication (DRY RUN compris) — utile pour
-- déboguer sans avoir à deviner ce qui s'est passé.
create table if not exists public.autopilot_publish_log (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.autopilot_publish_log enable row level security;

-- Colonnes de suivi de publication sur la file existante.
alter table if exists public.social_autopilot_queue
  add column if not exists published_media_id text,
  add column if not exists published_at timestamptz;
