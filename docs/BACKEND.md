# Backend — Supabase (couche de synchronisation offline-first)

La plateforme fonctionne **sans backend** : tout vit en `localStorage` et les
5 surfaces se parlent via des ponts (mêmes clés que les prototypes). Cette couche
ajoute un backend **Supabase** optionnel : dès que les clés sont présentes, chaque
magasin s'hydrate depuis Postgres, pousse ses changements, et reçoit ceux des
autres postes en temps réel — sans rien casser du mode local.

## Architecture

```
  Route React ──useStore──▶ Store<T> (localStorage, rendu immédiat)
                                │
                                ├─ bindCollection / bindDocument  (src/shared/sync.ts)
                                │        │ actif seulement si supabase != null
                                ▼        ▼
                         localStorage   Supabase (Postgres + Realtime)
```

- **Seam unique** : toute la donnée passe par `createStore`/`useStore`
  (`src/shared/store.ts`). La sync se greffe là, dans chaque module d'entité —
  aucune route ni `main.tsx` n'a été touché.
- **Stockage** : une ligne = un enregistrement, charge utile complète dans
  `data jsonb` (formes camelCase du front, aucune traduction). `branch_id` est
  extrait en colonne réelle pour l'indexation et la RLS.
- **Singletons** (`mnd_settings`, `mnd_brand`, `mnd_vitrine_config`,
  `mnd_couronne_compose`) → table `documents` (une ligne par clé).
- **Non synchronisé** : `mnd_current_branch` (préférence par utilisateur/onglet).

## Mise en route

### 1. Créer le projet et appliquer le schéma
Dans le dashboard Supabase → **SQL Editor**, exécuter dans l'ordre :
1. `supabase/migrations/0001_init.sql` (tables, triggers `updated_at`)
2. `supabase/migrations/0002_rls_dev.sql` (RLS — **politiques de dev permissives**)

> Ou via la CLI : `supabase db push` (après `supabase link`).

### 2. Activer Realtime
Database → **Replication** → activer la publication `supabase_realtime` sur toutes
les tables `public.*` créées (ou `alter publication supabase_realtime add table …`).

### 3. Renseigner les clés
Copier `.env.example` → `.env.local` :
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```
Relancer `npm run dev`. Au premier lancement, chaque table vide est **amorcée**
avec les données de démonstration locales ; ensuite, la base fait foi.

## ⚠ Sécurité — à faire avant la production

`0002_rls_dev.sql` autorise **tout accès (anon + authenticated)** pour rendre la
base fonctionnelle avant l'authentification. **Ne pas déployer tel quel.**

Jalon suivant (« auth ») :
1. Authentification Supabase — OTP téléphone/WhatsApp pour Ma Couronne, comptes
   personnel pour Le Trône (voir `StaffMember` + accès par rubrique dans Paramètres).
2. Table `staff_branches` + fonction `can_see_branch()` — gabarit commenté en bas
   de `0002_rls_dev.sql`.
3. Remplacer la politique `dev_all` par des politiques lecture/écriture par branche
   et par rôle.

## Authentification (personnel Le Trône)

Couche `src/shared/auth.ts` au-dessus de Supabase Auth. **Non bloquante par défaut** :
l'ERP s'ouvre comme avant tant que l'enforcement n'est pas demandé.

- **Enforcement** : mettre `VITE_REQUIRE_AUTH=true` dans `.env.local`. Alors le
  Trône exige une connexion (`src/apps/trone/auth/AuthGate.tsx`). À coupler au
  durcissement RLS — les deux vont ensemble.
- **Fondateur** : le tout premier compte créé devient « souverain » (toutes rubriques,
  toutes branches) via la fonction serveur `provision_first_staff`. Ensuite, l'écran
  « Se connecter » suffit ; la création de comptes personnel se fait depuis Paramètres.
- **Modèle** : table `staff` (rôle souverain/gérant/maître + rubriques ERP) +
  `staff_branches`. Helpers RLS `is_staff()`, `has_rubric()`, `can_see_branch()`
  déjà en place pour le durcissement.

### La branche n'est PAS une frontière de sécurité (décision, 24 août 2026)

Les policies staff des tables métier sont gardées par `is_staff()` **global** :
un membre du personnel authentifié voit et écrit les données de **toutes** les
branches. `can_see_branch(branch_id)` existe mais n'est câblée sur **aucune**
policy active — c'est **volontaire**. `branch_id` organise l'INTERFACE (tout est
filtré par branche à l'affichage), il ne cloisonne pas les données au niveau
serveur.

Pourquoi : les branches de MND sont des lieux d'une **même maison, même
propriétaire** — pas des tenants indépendants. Câbler `can_see_branch` partout
serait invasif (il faudrait `staff_branches` parfaitement peuplée pour chacun,
sous peine d'enfermer un membre hors de sa branche) et casserait les gestes
inter-branches, pour un gain faible tant que c'est une seule maison. Le vrai
cloisonnement multi-tenant, c'est **LOKAA**, et il passera par un `org_id`
dédié (colonne + RLS), jamais par `can_see_branch`.

Corollaire de sécurité : **un seul compte staff compromis expose toutes les
branches.** C'est acceptable pour une maison unique ; ça ne le sera plus le jour
où deux gérants doivent être étanches l'un à l'autre — ce jour-là, ce sera
`org_id`, pas la branche.

### Mise en route auth
1. SQL Editor → exécuter `supabase/apply_auth.sql` (tables `staff`, RPC, helpers, RLS).
2. Auth → **Email** : pour un dev fluide, désactiver « Confirm email » (sinon le
   fondateur doit cliquer le lien de confirmation avant que la session s'ouvre —
   l'écran de connexion gère ce cas).
3. (Optionnel) `VITE_REQUIRE_AUTH=true` pour verrouiller l'accès.

### Ma Couronne — OTP téléphone (prêt, en attente de fournisseur)
`startPhoneOtp` / `verifyPhoneOtp` sont écrits et prêts. Ils n'enverront de code
qu'une fois un fournisseur configuré dans Supabase (Auth → Phone : Twilio,
MessageBird, ou WhatsApp). L'UI d'onboarding de Ma Couronne sera câblée à ce
moment-là.

> Sécurité : la clé `service_role` ne doit **jamais** entrer dans une variable
> `VITE_*` (elle serait embarquée dans le bundle navigateur). Seules `VITE_SUPABASE_URL`
> et `VITE_SUPABASE_ANON_KEY` sont publiques par conception.

## Prochaines briques backend (non incluses ici)

- **Paiements** : Edge Functions Supabase pour les webhooks KkiaPay (Mobile Money +
  carte) et PayPal → marquer `appointments`/`invoices`/consultation comme payés.
- **WhatsApp** : envoi des OTP, reçus et rappels (liens d'automatisation déjà
  configurables dans Paramètres).
- **Multi-tenant LOKAA** : ajouter `org_id` (colonne + RLS) pour le SaaS white-label.
- **Colonnes normalisées / vues** : le JSONB est requêtable ; des vues SQL pourront
  exposer des colonnes plates pour la BI si besoin.
