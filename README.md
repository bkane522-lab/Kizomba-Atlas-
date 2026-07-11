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
