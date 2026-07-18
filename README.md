# Kizomba Atlas

Application statique PWA avec carte Leaflet, formulaire public, espace `/admin` et backend Supabase.

## Mise en ligne

1. Créez un projet Supabase.
2. Dans l’éditeur SQL, exécutez `supabase-schema.sql`.
3. Créez votre compte administrateur dans **Authentication > Users**.
4. Copiez son UUID et exécutez :
   ```sql
   insert into public.admin_users(user_id) values ('UUID_DU_COMPTE_ADMIN');
   ```
5. Dans `supabase-config.js`, ajoutez l’URL du projet et la clé publique `anon`.
6. Déployez tout le dossier sur Vercel.
7. Ouvrez `/admin.html` pour gérer les demandes, événements et informations en direct.

## Flux des demandes

Le formulaire `contact.html` enregistre les demandes dans `event_requests`.
Dans l’administration : **Demandes > Préparer la fiche > vérifier l’adresse GPS > publier**.

L’adresse officielle configurée est `kizombaatlas.contact@gmail.com`.

## Signature visuelle de l’administration

L’image `assets/admin-atlas-hero.jpg` est utilisée uniquement sur l’espace privé afin de donner au tableau de bord une identité Atlas premium, sans modifier l’interface publique déjà validée.
