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
  premier login, est supprimée par la migration 0235. Ensuite, l'écran
  « Se connecter » suffit ; les autres comptes sont rattachés par un souverain
  (« Accès & rôles », `authorize_staff`) ou entrent par la place que la direction
  leur a préparée (`rattacher_mon_compte`, 0109).
- **Deux tiroirs de session** : Ma Couronne garde sa session à part
  (`sb-mnd-couronne`) : `VITE_AUTH_SCOPE=couronne` au build publié, et à défaut
  la balise `<meta name="mnd-auth-scope" content="couronne">` de `couronne.html`,
  que lit `src/shared/supabase.ts`. La session du personnel au Trône et celle
  d'une cliente cohabitent donc sur localhost comme en ligne. `build-sites.mjs`
  épingle la portée pour chaque site publié (18 novembre 2026) : `couronne`
  pour Ma Couronne, vide pour tous les autres. Une valeur vide compte pour
  absente : le Trône publié garde le tiroir par défaut, quoi que dise
  l'environnement du poste ou un `.env.local`.
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
   0109, il se refuse lui-même et ne touche à rien (voir son en-tête) : la
   migration 0235 suffit. Un projet monté en rejouant les migrations dans
   l'ordre passe 0235 à part, avant de créer le moindre compte (étape 0 de
   l'en-tête de `supabase/apply_rls_prod.sql`) ; le message d'arrêt de 0006,
   « le fondateur est provisionné automatiquement », est périmé depuis le
   17 novembre 2026.
2. Auth → **Email** : pour un dev fluide, désactiver « Confirm email » (sinon le
   fondateur saisit le code à 6 chiffres reçu par e-mail avant que la session
   s'ouvre — l'écran de connexion le demande).
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
0235.

Si `staff` n'est pas vide mais ne compte plus aucun souverain (son compte
supprimé, son rôle rétrogradé), le gabarit refuse, et ni le SQL Editor ni la
clé de service ne passent `staff_guard`, qui ne laisse écrire que dans une
table vide, un souverain connecté, ou une recrue à la place préparée pour elle.
Le recours est un SQL unique, écrit par la session pour ce cas et passé une
fois : remettre UN souverain choisi par la direction, dans une seule
transaction qui suspend puis rétablit le déclencheur, sans jamais le redéfinir
ni rouvrir une fonction qui se promeut elle-même.

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
- **`appointments`, le contrôle Sówà à J+7 (0245, 25 novembre 2026)** : la tâche pg_cron `pose-les-controles-sowa` (toutes les dix minutes, `pose_les_controles_sowa()`, SECURITY DEFINER, révoquée pour les rôles du navigateur) pose pour chaque Rituel Sówà™ ferme (`1740l5ysxj`, confirmé ou honoré, pas une place en attente de son oui) un `sv-sowa-controle` offert (0 F, 45 min) sept jours plus tard, à la même heure, chez Team : id `ctl-<rituel>`, `controleDe`, `controlePourLe`, `poseePar`. Jamais deux (un contrôle du rituel, même annulé ; un contrôle vivant de la cliente dans les trois semaines), jamais pour un essai ni dans le passé. Le contrôle suit son rituel (déplacé, annulé) tant qu'il est encore « confirmé » au septième jour du rituel tel qu'il était ; retouché à la main, il ne bouge plus. Écriture du serveur : `une_place_en_ligne` ne la juge pas, `pas_avant_l_ouverture` oui ; la confirmation et la veille partent comme pour tout rendez-vous. Banc `verifie-le-controle-sowa`.
- **`deplace_si_libre` (0223)** : déplacer depuis le site, deux fois au plus, sous le verrou des poses ; le serveur refuse aussi une heure hors de la grille.
- **`garde_reservation_cliente` (0224)** : Ma Couronne pose par `demande-submit` `{ couronne: 'reserver' }` ; une écriture directe d'une cliente naît « en attente », au prix du serveur.
- **`a_eu_une_seance`, `signalement_de_cliente_valide` (0226)** : « Un souci avec vos locks ? » seulement après une séance faite (le personnel dépose toujours).
- **`documents` · `mnd_envies` (0231)** : lu par le site (anon), écrit par la direction seule (`est_direction()`, trois règles restrictives).
- **`documents` · `mnd_fiches_de_procedure` (0244)** : les fiches de procédure des soins (brouillon et version validée). Lu par l'équipe (`docs_staff_all`), jamais par le site ; écrit par la direction seule (`est_direction()`, trois règles restrictives).
- **La porte du site** (`demande-submit`) juge sur `famillesDeLaPorteDuSite` : le défaisage (`cat-defaisage`, `plt-45`) s'y réserve, pas sur WhatsApp. Les ateliers qui se réservent en ligne (⟨place-du-serveur⟩) : l'Entretien, la Coloration, La Transformation (la décoloration).
- **« Rendez-vous pris »** (`shared/rendez-vous-pris-pur.ts`, recopié dans `whatsapp-automate` et `diagnostic-locks`) : confirmé, aujourd'hui ou plus tard, pas une suggestion sans son oui, et une place prise en ligne seulement une fois ferme. **`diagnostic-locks`** : 403 « rendez-vous » sans rendez-vous pris ni séance faite, 429 « plafond » au-delà du plafond par cliente (`mnd_auto_config.diagnosticPhotoPlafond`).
- **Réglages en base, hors migrations** : `supabase/reglage_la_decoloration_se_reserve_20261117.sql` (`mnd_besoins`, `mnd_vitrine_config`), `supabase/reglage_le_gbata_suit_le_nombre_de_locks_20261118.sql` (`catalog_services` `sv-plt-45-std` : `scalesWithModel`, `consultationAvant`), `supabase/reglage_plus_d_avis_sur_photo_20261117.sql`. Rejouables.
