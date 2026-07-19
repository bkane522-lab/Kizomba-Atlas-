# Kizomba Atlas

Application bilingue français / anglais pour localiser les événements Kizomba et permettre aux organisateurs de proposer leurs propres dates.

## Ce qui est intégré

### Public

- carte avec position GPS exacte ;
- recherche et filtres ;
- itinéraires Google Maps et Waze ;
- favoris ;
- informations en direct ;
- bouton **Ajouter** vers l’espace organisateur.

### Organisateurs

- création de compte sécurisée ;
- **Atlas Gratuit** : 2 propositions par mois ;
- **Atlas Pro** : propositions illimitées ;
- ajout d’une affiche depuis le téléphone ;
- recherche d’adresse et correction manuelle du pin ;
- suivi du statut : en validation, publié, corrections demandées, refusé ou annulé ;
- demande Atlas Pro envoyée à l’administrateur.

### Administration

- validation ou refus des propositions ;
- message de correction envoyé à l’organisateur ;
- gestion des comptes Gratuit / Pro ;
- badge Organisateur vérifié ;
- gestion des événements et des informations en direct.

## Mise à jour du projet

1. Remplacez tous les fichiers de votre dépôt par ceux de ce dossier.
2. Conservez votre URL et votre clé publique dans `supabase-config.js`.
3. Ouvrez Supabase → **SQL Editor**.
4. Exécutez entièrement `supabase-schema.sql`.
5. Vérifiez que votre compte administrateur existe dans `public.admins`.
6. Redéployez sur Vercel.
7. Rechargez complètement le site pour supprimer l’ancien cache.

## Compte administrateur

Après avoir créé votre utilisateur dans Supabase Authentication, exécutez :

```sql
insert into public.admins (user_id)
values ('VOTRE-UUID-UTILISATEUR')
on conflict (user_id) do nothing;
```

## Atlas Pro

La séparation Gratuit / Pro est fonctionnelle :

- les comptes gratuits sont limités à 2 propositions mensuelles ;
- les comptes Pro sont illimités ;
- l’administrateur active ou désactive Pro depuis son tableau de bord.

Le paiement en ligne n’est pas encore inclus. L’activation est manuelle afin de tester l’offre avant de connecter Stripe.

## Images

Le script SQL crée un bucket `event-images` : JPG, PNG et WebP, 5 Mo maximum. Chaque organisateur peut gérer uniquement ses propres fichiers.

## Modération

Un événement proposé passe automatiquement en validation. L’administrateur peut le publier, demander une correction ou le refuser. Toute modification apportée par l’organisateur à un événement publié le remet en validation.


## Ajustements validés

- écran d’accueil minimal au premier lancement ;
- texte d’accueil : **KIZOMBA · URBAN KIZ · BACHATA** ;
- filtres principaux : Tout, Kizomba, Urban Kiz, Bachata, SBK, Festival, Workshop ;
- Semba et Tarraxo restent disponibles comme styles secondaires dans les fiches ;
- un événement peut désormais contenir plusieurs styles ;
- Dance Affinity est associé à Kizomba, Bachata et SBK ;
- le bandeau d’informations conserve son défilement ralenti.

Sans Supabase, les événements de démonstration restent visibles. Lors de la future activation de Supabase, exécutez le nouveau `supabase-schema.sql` afin d’ajouter les styles multiples.


## Couleurs, logos et style de carte

- Kizomba : orange / or
- Urban Kiz : vert émeraude
- Bachata : ivoire / jaune
- SBK : violet
- Semba : corail
- Tarraxo : framboise

Chaque événement possède désormais une **couleur principale sur la carte**.  
Il peut aussi recevoir un **logo carré**, affiché directement dans le pin.  
Sans logo, le pin conserve son abréviation automatique.

La carte publique permet de choisir **Clair**, **Sombre** ou **Auto**.  
Le choix est mémorisé sur le téléphone.

Pour Supabase, exécutez le nouveau `supabase-schema.sql`, qui ajoute `logo_url` et `map_style`.


## Lancement sans Supabase : formulaire de contact manuel

Le bouton public **Ajouter** est remplacé par **Contact**.

La page `contact.html` permet aux organisateurs de préparer une demande structurée :

- identité et organisation ;
- profil officiel ;
- nom, type et styles de l’événement ;
- dates, lieu et adresse ;
- billetterie, affiche et tarif ;
- demande standard, mise en avant ou Atlas Pro.

Aucun événement n’est publié automatiquement.

### Activer l’envoi vers votre adresse dédiée

Ouvrez `contact-config.js` et renseignez uniquement :

```js
EMAIL: "votre-adresse-kizomba-atlas@exemple.fr"
```

Utilisez une adresse créée spécialement pour Kizomba Atlas. Il n’est pas nécessaire d’afficher votre identité personnelle.

Tant que l’adresse n’est pas renseignée, le formulaire copie automatiquement la demande et permet également de la partager avec le menu Android.

L’ancien espace organisateur reste conservé pour une activation future avec Supabase. Sans Supabase, toute ouverture directe de `organizer.html` redirige maintenant vers `contact.html`.
