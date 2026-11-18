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

## Les assistants reliés (31 octobre 2026, migration 0149)

Quatre tables réservées à la direction : `assistants` (select `is_souverain()` ; écrite par la fonction seule), `assistants_relais` (select, update, delete `is_souverain()` ; insert par la fonction), `assistants_decisions` (select et update du porteur seul : `assistants.porteur_user_id = auth.uid()` ; insert par la fonction), `assistants_prises` (aucune politique : service seule). La fonction `assistants-maison` (Verify JWT non) reconnaît un assistant à l'empreinte SHA-256 de son jeton d'appareil (en-tête `x-jeton-assistant`) et la direction à son JWT (`staff.role = 'souverain'`). Les notifications aux porteurs passent par `push-notify` mode `to-staff` (clé service ou JWT souverain) ; le chien de garde des assistants vit dans `staff-cron`.

## La consultation en affiches (18 novembre 2026, migrations 0216, 0219, 0222 à 0224, 0226, 0231)

Une seule règle : le bilan (lecture, prix, devis) se remet AU rendez-vous, et une place prise en ligne se tient deux heures avant de se confirmer. Ce que la base et les fonctions tiennent :

- **`visios` (0216)** : dix colonnes (`deplacements`, `deplacee_le`, `deplacee_de`, `annulee_le`, `annulee_par`, `rdv_id`, `branch_id`, `lien_etat`, `suite_vue_le`, `billet_hash`), l'index `visios_par_numero_et_debut`, le déclencheur `la_visio_dit_quand_elle_est_annulee` (l'heure d'une annulation à l'horloge de la base). La fonction **`visio-salle`** (générée : `node scripts/visio-salle-serveur.mjs`, `--verifie`) tient la limite (une visio par numéro tous les 90 jours, manquées comprises, `{ ok: false, raison: 'limite', motif, prochaineLe }` en 409), le billet (`billet`, `chemin` = `/couronne/#/visio/<id>.<billet>` : la page de la visio, jamais la salle ; le lien d'entrée ne part que par WhatsApp), `deplacer` (2 h avant, deux fois ; la Maison sans compter), `moments-privee` et `reserver-privee` (la consultation privée réglée se pose au Carnet par `pose_si_libre`, rendez-vous `rdv-privee-<id>`, 60 min, sans prestation ni argent ; la consultation reçoit `rdvId`, `rdv`, `momentFixe`, ou `momentVoulu` + `momentRefuse`), `suite` et `suite-vue` (les affiches d'après la visio, modèles `reservation_preparee` et `consultation_privee_proposee`). Verify JWT éteint.
- **`push-notify` · `tunnel-submit`** : l'identifiant d'une consultation est fait par le serveur (`cg-` + vingt signes) et rendu (`{ ok, id }`) ; un dépôt s'insère, il n'écrase rien ; d'un dépôt public sortent, à toute profondeur, l'estimation, les fourchettes, la lecture, les points, les paliers, tout prix et tout ce que le serveur seul écrit (règle `shared/depot-de-la-consultation-pur.ts`, bloc ⟨depot-de-la-consultation⟩). La lecture se fait au Trône (`shared/lecture-de-la-maison-pur.ts`).
- **`invoices` (0219)** : `piece_lisible_par_elle(data)` et `devis_perime(data)` (jumeaux de `lisibleParElle` et `estPerime`, `shared/devis-remis-pur.ts`) ; la règle RESTRICTIVE `devis_remis_seulement` (une cliente ne lit que ses pièces remises) ; le déclencheur `garde_de_la_piece_cliente_biud` (sur un devis remis et valable, ses trois gestes seulement ; rien d'autre ne s'écrit, la pièce d'avant revient). L'équipe, le serveur et les fonctions passent comme avant. Au Trône, la règle `peutEtreRemis` (visio tenue, privée faite, cliente déjà venue).
- **`appointments`, le rendez-vous en attente (0222)** : `pose_si_libre` reçoit la demande et rejoue sous un verrou par numéro les plafonds (`plafond_des_poses` : trois places non confirmées, cinq poses par 24 h ; `debit_permis` pour l'adresse), refuse avant 08:30 ; `rdv_en_attente` ; la tâche pg_cron `libere-les-places-en-attente` (toutes les cinq minutes, `libere_les_places_en_attente`) passe « annulé » une place restée sans son oui (`attenduJusquAu`), avec `placeLibereeLe`. La place naît « confirmé » + `suggereLe` + `attenduJusquAu` ; FERME = son oui (`confirmeeParLaClienteLe`) et `depositConfirmed` quand elle porte un acompte (`shared/rendez-vous-en-attente-pur.ts`, bloc recopié dans `demande-submit` et `confirmation-rdv`). La bascule : rien ne change tant que le secret `WA_TEMPLATE_ATTENTE` manque ou que `mnd_modeles_meta` ne dit pas le modèle approuvé.
- **`deplace_si_libre` (0223)** : déplacer depuis le site, deux fois au plus, sous le verrou des poses ; le serveur refuse aussi une heure hors de la grille.
- **`garde_reservation_cliente` (0224)** : Ma Couronne pose par `demande-submit` `{ couronne: 'reserver' }` ; une écriture directe d'une cliente naît « en attente », au prix du serveur.
- **`a_eu_une_seance`, `signalement_de_cliente_valide` (0226)** : « Un souci avec vos locks ? » seulement après une séance faite (le personnel dépose toujours).
- **`documents` · `mnd_envies` (0231)** : lu par le site (anon), écrit par la direction seule (`est_direction()`, trois règles restrictives).
- **La porte du site** (`demande-submit`) juge sur `famillesDeLaPorteDuSite` : le défaisage (`cat-defaisage`, `plt-45`) s'y réserve, pas sur WhatsApp. Les ateliers qui se réservent en ligne (⟨place-du-serveur⟩) : l'Entretien, la Coloration, La Transformation (la décoloration).
- **« Rendez-vous pris »** (`shared/rendez-vous-pris-pur.ts`, recopié dans `whatsapp-automate` et `diagnostic-locks`) : confirmé, aujourd'hui ou plus tard, pas une suggestion sans son oui, et une place prise en ligne seulement une fois ferme. **`diagnostic-locks`** : 403 « rendez-vous » sans rendez-vous pris ni séance faite, 429 « plafond » au-delà du plafond par cliente (`mnd_auto_config.diagnosticPhotoPlafond`).
- **Réglages en base, hors migrations** : `supabase/reglage_la_decoloration_se_reserve_20261117.sql` (`mnd_besoins`, `mnd_vitrine_config`), `supabase/reglage_le_gbata_suit_le_nombre_de_locks_20261118.sql` (`catalog_services` `sv-plt-45-std` : `scalesWithModel`, `consultationAvant`), `supabase/reglage_plus_d_avis_sur_photo_20261117.sql`. Rejouables.
