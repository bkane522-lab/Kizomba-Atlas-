# Kizomba Atlas

La carte des soirées, festivals, workshops et cours réguliers de Kizomba, Urban Kiz, Bachata et SBK — avec adresse exacte et itinéraire direct.

🔗 [kizomba-atlas.vercel.app](https://kizomba-atlas.vercel.app)

## Côté visiteurs

- Carte interactive, positions GPS vérifiées par l'administrateur
- 7 filtres : Tout · Kizomba · Urban Kiz · Bachata · SBK · Festival · Workshop
- Filtres de date : Aujourd'hui / Ce week-end, compatibles avec les événements ponctuels et les cours hebdomadaires récurrents
- Recherche insensible aux accents et à la casse
- Fiche événement avec itinéraire Google Maps / Waze, favoris, partage
- Mode clair/sombre mémorisé
- Application installable (PWA)
- Bilingue français / anglais (français par défaut)

## Proposer un événement

Le formulaire public [`/contact.html`](https://kizomba-atlas.vercel.app/contact.html) permet à tout organisateur de soumettre une soirée, un festival ou un workshop. Chaque demande est vérifiée manuellement avant publication — aucune publication automatique.

- **Atlas Gratuit** : 2 propositions par mois
- **Atlas Pro** : publications illimitées (sur demande via le formulaire)

## Administration

Accès réservé (`/admin.html`), connexion Supabase obligatoire.

- Compteurs et onglets pour gérer les demandes en attente, publiées, brouillons, à venir et refusées
- Ajout et modification complets : styles, tags de cours pédagogiques, récurrence hebdomadaire, position sur carte interactive, géocodage automatique
- Téléversement d'affiche et de logo
- Examen des demandes reçues via le formulaire public : localiser, publier ou refuser

## Stack technique

- HTML / CSS / JavaScript pur, sans framework, sans étape de build
- Leaflet + Leaflet.MarkerCluster pour la carte
- Supabase : base de données, authentification, stockage de fichiers
- Une fonction serveur Vercel (`api/submit.js`) pour la réception sécurisée des demandes publiques
- Service worker pour le fonctionnement en application installable

## Structure du dépôt

Fichiers actifs, tous à la racine sauf indication contraire :

```
index.html           accueil public + carte
app.js                logique de la carte publique
style.css             feuille de style
sw.js                 service worker
admin.html            interface d'administration
admin.js              logique de l'administration
admin-manifest.json   manifeste PWA de l'espace admin
contact.html          formulaire public
contact.js            logique du formulaire
contact-config.js     adresse e-mail publique de contact
supabase-config.js    connexion au projet Supabase (clé publique)
i18n.js                textes bilingues FR/EN
manifest.json         manifeste PWA de l'application publique
assets/               logo, icônes, image de fond (seules images réellement utilisées)
api/submit.js         fonction serveur — reçoit les demandes publiques
```

D'autres fichiers présents à la racine du dépôt (anciens changelogs, doublons d'images, pages abandonnées) ne sont plus utilisés par le code.

## Statut

Projet solo, sans budget, en développement actif.
