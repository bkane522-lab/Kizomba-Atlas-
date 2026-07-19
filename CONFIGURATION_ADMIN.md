# Configuration du backend privé Kizomba Atlas

L’application publique ne contient plus aucun formulaire organisateur.

Le fonctionnement est désormais :

- `/admin` : connexion privée ;
- ajout d’un événement ;
- enregistrement en brouillon ou publication immédiate ;
- modification, duplication, retrait de la carte ou suppression ;
- téléchargement d’une affiche et d’un logo depuis le téléphone ;
- l’application publique affiche uniquement les événements `published`.

## Étape 1 — Créer le projet Supabase

Créez un projet Supabase puis ouvrez **SQL Editor**.

Copiez-collez tout le contenu de `supabase-schema.sql`, puis exécutez-le.

Le script crée :

- la table `events` ;
- les règles de sécurité ;
- le stockage des affiches et logos ;
- les deux événements déjà présents dans Kizomba Atlas.

## Étape 2 — Créer le compte administrateur

Dans Supabase :

**Authentication → Users → Add user**

Utilisez :

- e-mail : `kizombaatlas.contact@gmail.com`
- mot de passe : un mot de passe fort et privé

Le backend n’autorise que cette adresse e-mail.

## Étape 3 — Relier l’application

Dans Supabase, récupérez :

- l’URL du projet ;
- la clé publique / anon.

Ouvrez `supabase-config.js` et remplacez :

```js
SUPABASE_URL: "YOUR_SUPABASE_URL",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
```

Ne placez jamais une clé `service_role` dans l’application.

## Étape 4 — Déployer

Remplacez les fichiers du dépôt, puis redéployez sur Vercel.

Ouvrez ensuite :

`https://votre-site.vercel.app/admin`

## Utilisation quotidienne

1. Connectez-vous.
2. Appuyez sur **Nouveau**.
3. Remplissez la date.
4. Localisez l’adresse.
5. Ajoutez l’affiche et le logo.
6. Choisissez :
   - **Enregistrer en brouillon** : invisible ;
   - **Publier maintenant** : visible immédiatement.
7. Dans la liste :
   - **Modifier** ;
   - **Dupliquer** ;
   - **Retirer de la carte** ;
   - **Supprimer**.
