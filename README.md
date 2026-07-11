# Kizomba Atlas V1

Application PWA bilingue **français / anglais** pour afficher des événements Kizomba sur une carte avec leur position GPS exacte.

## Ce qui fonctionne déjà

- Carte interactive OpenStreetMap / Leaflet
- Pins GPS exacts
- Filtres Kizomba, Urban Kiz, Semba, Tarraxo, Festival, Workshop
- Filtres Aujourd’hui / Ce week-end
- Recherche ville, lieu ou événement
- Liste des événements
- Favoris enregistrés sur le téléphone
- Fiche événement avec Google Maps, Waze, partage et billetterie
- Bandeau d’informations en direct
- Français / anglais
- Installation PWA Android
- Tableau de bord privé
- Création, modification et suppression des événements
- Recherche d’adresse + correction manuelle du pin
- Publication d’informations instantanées
- Mise à jour publique en temps réel avec Supabase Realtime
- Sécurité Supabase RLS : seul le compte présent dans `admins` peut écrire

## 1. Tester immédiatement

Ouvrez le dossier avec un petit serveur local, par exemple :

```bash
python -m http.server 8080
```

Puis ouvrez :

```text
http://localhost:8080
```

Sans configuration Supabase, l’accueil affiche des données de démonstration.  
L’administration reste volontairement bloquée : aucun mot de passe secret n’est placé dans le code public.

## 2. Créer le backend Supabase

1. Créez un projet Supabase.
2. Ouvrez **SQL Editor**.
3. Collez tout le contenu de `supabase-schema.sql`.
4. Exécutez le script.
5. Dans **Authentication > Users**, créez votre compte administrateur.
6. Copiez l’UUID de cet utilisateur.
7. Exécutez la ligne suivante dans SQL Editor :

```sql
insert into public.admins (user_id)
values ('VOTRE-UUID-UTILISATEUR')
on conflict (user_id) do nothing;
```

## 3. Relier l’application à Supabase

Dans `supabase-config.js`, remplacez :

```js
SUPABASE_URL: "YOUR_SUPABASE_URL",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
```

par les valeurs de **Project Settings > API**.

La clé `anon` peut être publique : la sécurité réelle est assurée par les règles RLS du fichier SQL.

## 4. Ouvrir l’administration

```text
/admin.html
```

Connectez-vous avec le compte créé dans Supabase.

## 5. Publier sur Vercel

- Déposez tous les fichiers à la racine du projet.
- Importez le dépôt dans Vercel.
- Aucun build n’est nécessaire.
- L’application doit être servie en HTTPS pour la géolocalisation et l’installation PWA.

## Exactitude des lieux

Chaque événement exige :

- une latitude ;
- une longitude ;
- une adresse complète.

Dans l’administration :

1. saisissez le lieu et l’adresse ;
2. cliquez sur **Trouver l’adresse** ;
3. vérifiez le pin ;
4. déplacez-le manuellement si nécessaire ;
5. publiez seulement après validation visuelle.

## Limite importante

Le géocodage de démonstration utilise le service public Nominatim d’OpenStreetMap. Pour un trafic important, utilisez un service de géocodage dédié ou votre propre instance afin de respecter les limites d’usage.

## Fichiers

- `index.html` : application publique
- `admin.html` : espace privé
- `style.css` : design premium
- `app.js` : carte, filtres, favoris, temps réel
- `admin.js` : authentification et gestion
- `i18n.js` : traductions FR / EN
- `supabase-config.js` : configuration
- `supabase-schema.sql` : base de données et sécurité
- `manifest.json` : PWA
- `sw.js` : cache de l’application
