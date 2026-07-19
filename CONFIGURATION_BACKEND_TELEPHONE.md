# Kizomba Atlas — activer le backend depuis le téléphone

Le ZIP est prêt pour une gestion complète depuis `/admin`. La connexion réelle nécessite votre propre projet Supabase et trois réglages dans Vercel.

## 1. Créer le projet Supabase

Depuis le navigateur du téléphone :

1. créez un projet Supabase ;
2. ouvrez **SQL Editor** ;
3. copiez tout le fichier `supabase-schema.sql` ;
4. exécutez la requête.

Le script crée la table des événements, la sécurité, le stockage des affiches et les deux événements de démonstration.

## 2. Créer l’administrateur

Dans **Authentication → Users → Add user** :

- e-mail : `kizombaatlas.contact@gmail.com` ;
- mot de passe : choisissez un mot de passe fort et privé ;
- confirmez l’utilisateur lors de la création.

## 3. Récupérer les données publiques Supabase

Dans les paramètres API du projet, copiez :

- l’URL du projet ;
- la clé **Publishable** ou l’ancienne clé publique `anon`.

Ne copiez jamais une clé `secret` ou `service_role` dans l’application.

## 4. Configurer Vercel

Dans **Vercel → Kizomba Atlas → Settings → Environment Variables**, ajoutez :

- `SUPABASE_URL` : URL du projet Supabase ;
- `SUPABASE_PUBLISHABLE_KEY` : clé Publishable/anon ;
- `KIZOMBA_ATLAS_ADMIN_EMAIL` : `kizombaatlas.contact@gmail.com`.

Activez les variables pour **Production, Preview et Development**, puis relancez un déploiement.

## 5. Contrôler depuis le téléphone

Ouvrez :

`https://kizomba-atlas.vercel.app/admin`

Vous pourrez :

- ajouter une date ;
- joindre l’affiche et le logo depuis la galerie ;
- enregistrer en brouillon ;
- publier immédiatement ;
- rechercher une date ;
- modifier ou dupliquer ;
- retirer de la carte ;
- supprimer.

Le bouton **Installer** permet d’ajouter « Atlas Admin » à l’écran d’accueil lorsque le navigateur propose l’installation.

## Français et anglais

- le français est la langue par défaut ;
- le bouton `EN` passe toute l’application en anglais ;
- le bouton devient `FR` pour revenir en français ;
- le choix reste mémorisé sur le téléphone.
