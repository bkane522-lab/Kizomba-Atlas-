# Kizomba Atlas

Application PWA bilingue français / anglais pour localiser les soirées, festivals et workshops Kizomba avec précision.

## Identité visuelle

Le dossier `assets` contient l’identité validée :

- `logo.svg` : symbole principal pour l’application
- `logo-lockup.svg` : logo horizontal avec le nom
- `icon-180.png` : icône Apple
- `icon-192.png` : icône Android / PWA
- `icon-512.png` : icône Android haute résolution
- `favicon-64.png` : favicon
- `logo-1024.png` : export haute résolution
- `logo-lockup.png` : export horizontal

## Fonctions intégrées

- carte OpenStreetMap / Leaflet ;
- points GPS exacts ;
- filtres de style et de date ;
- recherche par ville, lieu ou événement ;
- itinéraires Google Maps et Waze ;
- favoris ;
- informations en direct ;
- français et anglais ;
- espace administrateur privé ;
- publication et gestion des événements avec Supabase ;
- installation PWA Android.

## Mise en ligne

Remplacez tous les fichiers de l’ancien projet par ceux de ce dossier, en conservant exactement la structure :

```text
/
├── index.html
├── admin.html
├── style.css
├── app.js
├── admin.js
├── i18n.js
├── manifest.json
├── sw.js
├── supabase-config.js
├── supabase-schema.sql
└── assets/
```

Après le déploiement, rechargez complètement le site ou videz le cache du navigateur pour afficher la nouvelle identité.
