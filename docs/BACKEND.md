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

Avec ces clés, le Trône exige une connexion (voir « Authentification »). Pour
travailler en local sans se connecter, ajouter `VITE_ALLOW_OPEN=true` à
`.env.local`, et à lui seul.

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

Couche `src/shared/auth.ts` au-dessus de Supabase Auth. **Bloquante par défaut**
(17 novembre 2026, audit du 4 novembre) : avec un backend, le Trône exige une
connexion (`src/apps/trone/auth/AuthGate.tsx`). Sans backend, tout est local et
l'auth est inerte. À coupler au durcissement RLS — les deux vont ensemble.

- **Ouvrir sans connexion** : `VITE_ALLOW_OPEN=true` est le seul moyen. Il sert
  au travail local, dans `.env.local`. Les sites publiés l'épinglent à `'false'`
  (`scripts/build-sites.mjs`, pour tous les sites), et chaque build de banc qui a
  un backend pose sa propre valeur : une valeur égarée dans `.env.local` ou dans
  l'environnement ne change ni l'un ni l'autre.
- **Fondateur** : aucun compte ne devient souverain en s'inscrivant. Le fondateur
  crée son compte, puis s'inscrit souverain à la main dans le SQL Editor (voir
  « Mise en route auth »). La fonction `provision_first_staff`, qui le faisait au
  premier login, est supprimée par la migration 0213. Ensuite, l'écran
  « Se connecter » suffit ; les autres comptes sont rattachés par un souverain
  (« Accès & rôles », `authorize_staff`) ou entrent par la place que la direction
  leur a préparée (`rattacher_mon_compte`, 0109).
- **Deux tiroirs de session** : Ma Couronne garde sa session à part
  (`sb-mnd-couronne`) : `VITE_AUTH_SCOPE=couronne` au build publié, et à défaut
  la balise `<meta name="mnd-auth-scope" content="couronne">` de `couronne.html`,
  que lit `src/shared/supabase.ts`. La session du personnel au Trône et celle
  d'une cliente cohabitent donc sur localhost comme en ligne.
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
1. SQL Editor → exécuter `supabase/apply_auth.sql` (tables `staff` et
   `staff_branches`, helpers, RLS, déclencheur `staff_guard` ; supprime
   `provision_first_staff` si le projet la porte). Sur un projet qui a passé
   0109, ne pas le relancer : voir son en-tête.
2. Auth → **Email** : pour un dev fluide, désactiver « Confirm email » (sinon le
   fondateur doit cliquer le lien de confirmation avant que la session s'ouvre —
   l'écran de connexion gère ce cas).
3. **Créer le compte du fondateur, AVANT toute insertion** : au Trône, « Vous
   êtes de l'équipe ? Créer un compte » (ou Authentication → Users → Add user).
   Le Trône dit « Accès en attente » : c'est attendu, rien ne le rattache encore.
   Sans ce compte, l'étape 4 n'a personne à inscrire.
4. **L'inscrire souverain** : dans le SQL Editor (rôle postgres, celui par
   défaut), coller les lignes comprises entre « /* » et « */ » en tête de
   `supabase/apply_rls_prod.sql` (un bloc `do $$ … $$` et une lecture), l'e-mail
   remplacé. Le bloc s'arrête en nommant l'adresse si aucun compte ne la porte,
   refuse si `staff` n'est plus vide, et la lecture finit par afficher la ligne
   inscrite : aucune ligne affichée, rien n'est fait.
5. Recharger le Trône : le fondateur entre souverain. Les autres comptes se
   rattachent depuis le Trône (voir plus haut).

Pourquoi le SQL Editor passe et pas l'API. Le déclencheur `staff_guard` (0073,
repris en 0109) garde un cas « table vide », écrit pour l'ancienne fonction.
C'est par lui seul qu'entre l'inscription à la main : dans le SQL Editor,
`auth.uid()` est nul, aucun autre cas ne s'applique, d'où « une seule fois, pour
le premier membre ». Depuis l'API, il ne mène nulle part : la RLS de `staff`
refuse toute écriture directe d'un non-souverain (`staff_admin_write`, 0073), et
les fonctions qui écrivent `staff` se gardent elles-mêmes (`authorize_staff`
exige un souverain, `rattacher_mon_compte` n'écrit que `gerant` ou `maitre`). Le
déclencheur reste donc tel quel ; le détail est dans l'en-tête de la migration
0213.

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

## Les assistants reliés (31 octobre 2026, migration 0149)

Quatre tables réservées à la direction : `assistants` (select `is_souverain()` ; écrite par la fonction seule), `assistants_relais` (select, update, delete `is_souverain()` ; insert par la fonction), `assistants_decisions` (select et update du porteur seul : `assistants.porteur_user_id = auth.uid()` ; insert par la fonction), `assistants_prises` (aucune politique : service seule). La fonction `assistants-maison` (Verify JWT non) reconnaît un assistant à l'empreinte SHA-256 de son jeton d'appareil (en-tête `x-jeton-assistant`) et la direction à son JWT (`staff.role = 'souverain'`). Les notifications aux porteurs passent par `push-notify` mode `to-staff` (clé service ou JWT souverain) ; le chien de garde des assistants vit dans `staff-cron`.
