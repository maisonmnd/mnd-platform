# Brancher les envois automatiques — push, WhatsApp, SMS

L'architecture est UNE : la fonction planifiée `rappels-j1` se réveille chaque
soir, lit les rendez-vous du lendemain, envoie ce que ses clés lui permettent,
et consigne chaque tentative dans la table `envois` (migration 0043). WhatsApp
et SMS s'allument le jour où leurs clés sont posées — sans retoucher le code.

> **LE PUSH N'EST PLUS DANS `rappels-j1` — 14 septembre 2026.** Le job horaire
> `mnd-push-rappels` (fonction `push-notify`, mode `reminders`) faisait DÉJÀ ce
> balayage, fenêtres 22-24 h et 2 h avant, avec son propre journal
> `push_reminders`. Deux chemins, deux journaux, aucun ne voyant l'autre : une
> cliente abonnée aurait reçu le rappel du soir deux fois. Le push reste au
> job ; `rappels-j1` ne fait plus que WhatsApp et SMS.

Aucun secret dans ce dépôt (il est public). Toutes les clés vivent dans les
« secrets » de Supabase, lus par la fonction à l'exécution.

> **LA CLÉ DES CRONS, depuis la rotation d'août 2026** : le projet vit sur la
> nouvelle famille (`sb_…`), la legacy `service_role` (eyJ…) ne prouve plus
> rien. La MÊME clé secrète `sb_secret_…` (Settings → API keys → onglet
> API Keys) se pose à trois endroits :
> ① secret de fonction **`CLE_SERVICE`** (Edge Functions → Secrets — un seul
> secret, il vaut pour toutes les fonctions) ; ② secret **`service_role_key`**
> du Vault (c'est lui que `appelle_fonction_edge` envoie) ; ③ l'en-tête
> `Authorization: Bearer …` des jobs créés au tableau de bord. Les gardes des
> quatre fonctions planifiées comparent à CLE_SERVICE d'abord, à la legacy en
> repli — sans CLE_SERVICE posée, l'ancien monde continue tel quel.

## Étape 1 — Déployer la fonction (une fois)

1. Supabase → **Edge Functions** → **Deploy a new function** → nom exact :
   `rappels-j1`.
2. Coller le contenu ENTIER de `supabase/functions/rappels-j1/index.ts`
   → **Deploy**.
3. Dans les réglages de la fonction, **désactiver « Verify JWT »** si l'option
   est proposée — la fonction fait sa propre garde (elle n'accepte que la clé
   service, celle du cron).

## Étape 2 — Poser le réveil (le cron)

Supabase → **Integrations** → **Cron** (activer si demandé) → **Create job** :

- **Name** : `rappels-j1-soir`
- **Schedule** : `0 17 * * *` — 17 h UTC = 18 h à Cotonou, l'heure où le
  carnet du lendemain est posé.
- **Type** : Edge Function → choisir `rappels-j1` · méthode POST.
- Si le formulaire demande un en-tête d'autorisation : `Authorization` =
  `Bearer <clé service_role>` (Settings → API → `service_role`). Le tableau
  de bord la propose souvent tout seul.

Essai immédiat sans attendre le soir : bouton **Run now** du job (ou
« Invoke » sur la fonction avec la clé service). Réponse attendue :
`{ "jour": "…", "rdv": N, "push": "au job mnd-push-rappels", "whatsapp": 0,
"sms": 0 }` — et les lignes apparaissent dans la table `envois` + la tournée
du matin du Trône.

**Les rappels PUSH partent seuls, par le job horaire `mnd-push-rappels`.**
Gratuit, pour toute cliente qui a installé Ma Couronne, la veille et deux
heures avant. Les autres restent servies par la tournée du matin (un tap par
cliente).

## Étape 3 — Allumer WhatsApp (API Meta, payant à la conversation)

Ce que la Maison doit obtenir (personne ne peut le faire à sa place) :

1. Un **compte Meta Business** (business.facebook.com) vérifié au nom de la
   maison.
2. Dans **WhatsApp Manager** : créer l'application WhatsApp Business API et y
   rattacher un **numéro dédié** — ⚠ un numéro ne peut pas être à la fois sur
   l'app WhatsApp d'un téléphone et sur l'API. Prendre un numéro neuf, ou
   migrer (le numéro perd alors l'app du téléphone).
3. Faire approuver un **modèle de message** (obligatoire pour écrire la
   première — catégorie « Utility ») nommé `rappel_rdv`, langue **fr**, corps :

   > Bonjour {{1}}, petit rappel de la maison : votre rendez-vous est prévu
   > demain à {{2}}. Merci de nous prévenir en cas d'empêchement. À très vite.

   ({{1}} = prénom, {{2}} = heure — c'est exactement ce que la fonction envoie.)
4. Relever trois valeurs : le **jeton d'accès permanent** (System user token),
   l'**identifiant du numéro** (Phone number ID), et le nom du modèle.
5. Le tarif est à la conversation, facturé par Meta — le vérifier sur la page
   « WhatsApp Business Platform pricing » pour le Bénin avant d'allumer.

Puis poser les clés (Supabase → Edge Functions → `rappels-j1` → **Secrets**,
ou par CLI `supabase secrets set`) :

```
WA_TOKEN=<jeton permanent>
WA_PHONE_ID=<identifiant du numéro>
WA_TEMPLATE=rappel_rdv
```

Au prochain réveil, les WhatsApp partent — et la tournée du matin montre
« WhatsApp auto » sur chaque ligne servie.

## Étape 3 bis — La confirmation à la prise du rendez-vous (28 août 2026)

« Je peux avoir une confirmation WhatsApp automatique pour tous les nouveaux
RDV ? » (Yéman). Oui : `supabase/functions/confirmation-rdv/index.ts`.

**ELLE BALAIE, ELLE N'ÉCOUTE PAS.** Un rendez-vous peut naître de quatre
endroits — le Calendrier, le bouton « + RDV », la modale d'appel reçu, et Ma
Couronne. Brancher l'envoi sur chaque écran, c'est quatre occasions de
l'oublier, et zéro confirmation le jour où une cliente ferme son téléphone
avant que la page ait fini. Le cron passe toutes les dix minutes et confirme ce
qui est neuf, d'où que ça vienne.

**L'IDEMPOTENCE EST DANS L'IDENTIFIANT** : `conf-<rdv>-<canal>` dans `envois`.
Le cron peut se réveiller cent fois, une cliente ne reçoit qu'une confirmation.

**NI LE PASSÉ NI L'ANNULÉ** : « votre rendez-vous est confirmé » sur un rituel
d'hier ferait douter de tout le reste.

### Poser la fonction

1. Supabase → Edge Functions → **New function** → `confirmation-rdv`, coller le
   fichier entier, Deploy.
2. Cron → **Name** `confirmation-rdv`, **Schedule** `*/10 * * * *` (toutes les
   dix minutes), **Type** Edge Function → `confirmation-rdv`, méthode POST,
   en-tête `Authorization: Bearer <clé service>`.

### Le modèle Meta, à faire approuver

Un modèle **à part** de celui du rappel : Meta approuve chaque modèle pour un
usage, et confirmer n'est pas rappeler. Nom : `confirmation_rdv`, catégorie
UTILITY, français.

> Bonjour {{1}}, c'est confirmé : votre rendez-vous est retenu {{2}}.
> Nous vous attendons. Merci de nous prévenir en cas d'empêchement.

({{1}} = prénom, {{2}} = le moment en clair — « vendredi 28 août à 14:00 ».)

Puis, dans les **Secrets** de la fonction :

```
WA_TOKEN=<le même jeton permanent>
WA_PHONE_ID=<le même identifiant de numéro>
WA_TEMPLATE_CONF=confirmation_rdv
```

**LE PUSH PART DÈS AUJOURD'HUI, SANS AUCUNE CLÉ META.** Toute cliente qui a
installé Ma Couronne reçoit sa confirmation immédiatement, gratuitement. Le
WhatsApp s'ajoutera le jour où la vérification Meta aboutira — sans qu'on
retouche une ligne de code.

### Depuis le 18 septembre 2026

Maquette `public/maquette-le-journal-des-envois.html`, arbitrages tranchés :

- **« C'est confirmé » ne part que pour un rendez-vous au statut
  « confirmé »**, d'où qu'il vienne. Un rendez-vous « en attente » attend ;
  il reçoit sa confirmation dans les dix minutes qui suivent sa validation.
- **L'identifiant Meta se garde** (journal `envois` et fil `messages_wa`) :
  « remis », « lu » et « non remis » se lisent dans le Trône, onglet
  Conversations › Envois automatiques, et la confirmation paraît dans le fil
  de la cliente.
- Recoller `confirmation-rdv` EN ENTIER. Sa réponse porte `version` :
  `2026-09-18-a`.

## Étape 3 ter — L'accusé d'une réservation du site (18 septembre 2026)

« Accusé tout de suite, puis confirmation » (Yéman). La visiteuse qui réserve
une place sur le site reçoit un mot sur WhatsApp dans la seconde, envoyé par
`demande-submit` lui-même. Seulement pour une place réservée : une demande
sans créneau n'en reçoit pas. Recoller `demande-submit` EN ENTIER.

### Le modèle Meta, à faire approuver

Nom : `demande_recue`, catégorie **UTILITY**, français.

> Bonjour {{1}}, la Maison MND a bien reçu votre demande de rendez-vous pour
> {{2}}. Nous vous confirmons très vite, sur ce numéro.

({{1}} = prénom, {{2}} = le moment en clair : « vendredi 20 septembre à 10 h ».)

Aucun nouveau secret : `WA_TOKEN` et `WA_PHONE_ID` sont déjà posés pour toutes
les fonctions. `WA_TEMPLATE_ACCUSE` n'est à poser que si le modèle porte un
autre nom. Tant que Meta ne l'a pas approuvé, l'accusé ne part pas, la place
reste réservée, et le journal dit « modèle pas encore approuvé chez Meta ».

## Étape 4 — Allumer les SMS (fournisseur à choisir)

Il faut un compte chez un fournisseur d'envoi SMS qui couvre le Bénin
(offre entreprise MTN/Moov, ou un agrégateur international type Twilio).
Tarif au SMS et enregistrement du nom d'expéditeur : à vérifier auprès du
fournisseur choisi.

La fonction parle nativement la forme Twilio :

```
SMS_TWILIO_SID=<Account SID>
SMS_TWILIO_TOKEN=<Auth token>
SMS_FROM=<numéro ou nom d'expéditeur approuvé>
```

Autre fournisseur = adapter le seul bloc « ③ SMS » de la fonction (le reste
ne bouge pas) — demander ce chantier quand le compte existe.

## Étape 5 — L'avis Google sans main (19 août 2026)

« Je veux l'envoi sans main » : la fonction planifiée `avis-google` écrit
elle-même à chaque **première venue soldée** — le modèle WhatsApp avec le
prénom et le lien d'avis. Elle réutilise les MÊMES clés Meta que l'étape 3 ;
si l'étape 3 est faite, il ne reste que quatre gestes.

1. **Déployer la fonction** : Edge Functions → New function → nom exact
   `avis-google` → coller le contenu ENTIER de
   `supabase/functions/avis-google/index.ts` → Deploy (désactiver
   « Verify JWT » si proposé — elle n'accepte que la clé service).

2. **Faire approuver le modèle** dans WhatsApp Manager — nom `avis_google`,
   langue **fr**, catégorie **Marketing** (une demande d'avis n'est pas de
   l'« utility » aux yeux de Meta), corps :

   > Merci pour votre passage à la maison, {{1}}. Si l'expérience vous a plu,
   > un avis nous aiderait beaucoup : {{2}}
   > À très vite, votre couronne nous tient à cœur.

   ({{1}} = prénom, {{2}} = le lien d'avis — c'est exactement ce que la
   fonction envoie.) Si Meta refuse un lien en variable de corps, refaire le
   modèle avec un **bouton URL** et demander l'adaptation de la fonction.

3. **Poser le secret du modèle** (les autres clés servent déjà à rappels-j1) :

   ```
   WA_TEMPLATE_AVIS=avis_google
   ```

4. **Poser le réveil** : Integrations → Cron → Create job :
   - **Name** : `avis-google-heures`
   - **Schedule** : `30 8-20 * * *` — toutes les heures, de 9 h 30 à 21 h 30
     à Cotonou : l'avis part dans l'heure qui suit le solde, jamais la nuit.
   - **Type** : Edge Function → `avis-google` · POST · en-tête
     `Authorization: Bearer <clé service_role>` comme à l'étape 2.

Puis, DANS LE TRÔNE : Paramètres → Automatisations → allumer
**« Avis Google sans main · API WhatsApp »**. Tant que l'interrupteur est
éteint, la fonction ne fait rien (`{ "actif": false }`) et le comptoir garde
son geste d'un tap ; allumé, la fonction écrit et le comptoir se tait — la
cliente n'est jamais relancée deux fois.

Garde-fous de la fonction : une seule fois par cliente (sa PREMIÈRE pièce
réglée, identifiant `env-<facture>-wa-avis` au journal), fenêtre de deux
jours (un solde du soir est rattrapé le matin, jamais un vieux passage),
fiche sans téléphone consignée « sans-abonnement » au lieu d'échouer.

## Étape 6 — La sauvegarde de nuit (19 août 2026)

Le serveur se photographie chaque nuit — toutes les tables, découvertes à
l'exécution — et range le cliché dans le compartiment privé `sauvegardes`
(60 jours de garde, un cliché par jour). C'est l'assurance contre le mal du
30 juillet : une table perdue au serveur disparaît de tous les postes, et
les exports d'après ne la portent plus.

1. **Exécuter la migration 0064** (SQL Editor) — la fonction
   `sauvegarde_maison()` et le coffre `sauvegardes`.
2. **Déployer la fonction** : Edge Functions → New function → nom exact
   `sauvegarde-nuit` → coller ENTIER
   `supabase/functions/sauvegarde-nuit/index.ts` → Deploy (désactiver
   « Verify JWT »).
3. **Poser le réveil** : Integrations → Cron → Create job :
   - **Name** : `sauvegarde-nuit` · **Schedule** : `0 2 * * *` (3 h à
     Cotonou, la maison dort)
   - **Type** : Edge Function → `sauvegarde-nuit` · POST · en-tête
     `Authorization: Bearer <clé service_role>`.
4. **Essai immédiat** : Run now — réponse attendue
   `{ "cliche": "maison-…", "octets": …, "lignes": …, "tables": … }`, et le
   fichier visible dans Storage → sauvegardes.

À la main, sans attendre la nuit : Paramètres → Sauvegarde de la Maison →
**« Photographie du serveur (complète) »** — le même cliché, téléchargé
(souverain seulement). Restaurer UNE table perdue depuis un cliché est un
geste guidé (le JSON porte tout, table par table) — demander ce chantier le
jour venu plutôt que d'improviser.

## Ce que le Trône montre

- **Tableau de bord → La tournée du matin** : les rendez-vous de demain, la
  pastille « Push parti seul » / « WhatsApp auto » / « SMS auto » / « Sans
  l'appli », et la cloche WhatsApp pré-remplie pour finir à la main.
- La table `envois` est le journal complet (une ligne par personne et par
  canal, avec le verdict et l'heure).

## Annexe — suivre les paiements du compte MoMoPay

Deux voies, choisies le 13 août :

### A. Le pointage du relevé (déjà construit — aucun compte à ouvrir)

Le QR du salon et l'USSD sont un canal fermé de MTN : le Trône ne voit pas
naître ces paiements. La seule vue COMPLÈTE du compte marchand est le relevé
du portail marchand MTN (ou l'historique de l'appli marchand).

Finances → Encaissements → **« Pointer le relevé MoMo »** : coller le relevé
tel quel, une opération par ligne. Le lecteur trouve montant, date et
référence où qu'ils soient sur la ligne, puis rapproche chaque entrée du
registre : *Pointé* (encaissement MoMo retrouvé) · *Acompte à confirmer*
(la preuve attendue vient d'arriver — un bouton confirme) · *Noté sous un
autre moyen* (l'argent est arrivé MoMo, le registre dit Espèces — à
corriger) · *Orphelin* (rien en face — à regarder).

Si le format du relevé réel lit mal, apporter un échantillon (quelques
lignes SANS les noms complets) — le lecteur se calibre en une retouche.

### B. L'API MoMo Collections — RequestToPay (la Caisse demande, la cliente valide)

Ce que la Maison doit obtenir auprès de MTN (rien ne se code avant) :

1. Un compte sur **momodeveloper.mtn.com** et l'abonnement au produit
   **Collections** (clé d'abonnement `Ocp-Apim-Subscription-Key`).
2. L'accès **production pour le Bénin** : il se demande à MTN (le bac à
   sable est ouvert à tous, la production passe par leur validation du
   marchand). Conditions, frais et devise de facturation : à vérifier avec
   MTN Bénin — ne rien signer sur la foi d'un souvenir.
3. À l'issue : un **API User** et une **API Key** de production, plus la clé
   d'abonnement.

Quand ces trois valeurs existent, demander le chantier : une fonction Edge
`momo-collecte` (RequestToPay + vérification du statut, secrets côté
Supabase), un bouton à la Caisse « Demander le paiement MoMo » (la cliente
reçoit la demande sur son téléphone et valide par PIN), et le journal des
demandes avec leur verdict. Le geste au comptoir change : c'est la Maison
qui tend la main, la cliente ne compose plus rien.

## Étape 6 — L'équipe et les prestataires sur WhatsApp (15 septembre 2026)

« How can this be done and arrive directly on the trone with employees and
prestataires » (Yéman). Maquette `public/maquette-lequipe-sur-whatsapp.html`,
validée. Le numéro de la Maison reconnaît désormais l'équipe, le répertoire
des prestataires et les fournisseurs ; leurs fils sont **réservés à la
direction** ; les pièces reçues sont gardées ; la Paie, Temps & absences et
les Engagements écrivent dans leurs fils. **Six gestes, dans cet ordre.**

### 1. Passer la migration 0102

Supabase → SQL Editor → coller `supabase/migrations/0102_lequipe_sur_whatsapp.sql`
en entier → Run. Le contrôle en bas doit rendre `6 · 2 · N · false · 2`.
**Elle passe avant tout le reste** : sans elle, un bulletin envoyé serait
lisible par tout le personnel dans les Conversations.

### 2. Recoller les deux fonctions, en entier

- `whatsapp-webhook` — coller le fichier ENTIER, Deploy, « Verify JWT »
  **décoché**. Le contrôle de santé (l'adresse dans un navigateur) doit dire
  `version: 2026-09-15-c` et `WA_TOKEN: <longueur>` : c'est lui qui va
  chercher les pièces chez Meta. S'il dit `ABSENT`, poser `WA_TOKEN` et
  `WA_PHONE_ID` dans les secrets (les mêmes que pour `whatsapp-envoi`).
- `whatsapp-envoi` — coller le fichier ENTIER, Deploy, « Verify JWT »
  **coché**. La sonde (`?sonde=1`) doit dire `version: 2026-09-15-c` et
  `migration0102: posée`.

### 3. Faire approuver les trois modèles (WhatsApp Manager → Modèles)

Tous en **français**, catégorie **UTILITY** : un bulletin, une décision, une
annonce de versement ne vendent rien. Un nom mal recopié = un envoi refusé.

**`bulletin_du_mois`** — en-tête : **Document** (un PDF d'exemple est demandé
à la création, n'importe lequel). Corps :

> Bonjour {{1}}, votre bulletin de paie de {{2}} est joint à ce message. Il
> vous est personnel : merci de ne pas le partager.

({{1}} = prénom, {{2}} = « octobre 2026 ». Le montant n'y est JAMAIS : il
vit dans le PDF, décision du 15 septembre.)

**`decision_conge`** — sans en-tête. Corps :

> Bonjour {{1}}, la direction a répondu à votre demande d'absence du {{2}}
> au {{3}} : {{4}}.

({{1}} = prénom, {{2}} et {{3}} = « 3 novembre », {{4}} = « accordée, il vous
restera 12 jours de congé » / « refusée » / « enregistrée ».)

**`versement_engagement`** — sans en-tête, **deux boutons de réponse rapide**
(Quick reply) : `Oui, bien reçu` et `Pas encore`, dans cet ordre. Corps :

> Bonjour, {{1}} vous a versé {{2}} pour {{3}}. L'avez-vous bien reçu ?

({{1}} = le nom de la Maison, {{2}} = « 150 000 F », {{3}} = l'objet du
dossier.) Le Trône pose sur chaque bouton l'identifiant du versement : la
réponse revient sur le versement, dans son dossier.

Tant qu'un modèle n'est pas approuvé, l'écran qui l'envoie dit le refus de
Meta tel quel, ligne par ligne ; rien ne se perd, on renvoie après.

### 4. Publier le formulaire de congé (WhatsApp Manager → Flows)

Créer un Flow, catégorie **Autre**, coller le contenu de
`docs/whatsapp-flows/demander-un-conge.json`, **Publier**, puis relever son
**identifiant** (dans l'adresse de la page, ou « Flow ID »). Le poser en
secret de la fonction `whatsapp-webhook` :

```
WA_FLOW_CONGE=<identifiant du Flow>
```

Sans lui, rien ne part : une employée qui parle de congé reçoit une réponse
de la direction, à la main. Avec lui, elle reçoit le formulaire, et sa
réponse devient une demande dans Temps & absences, « Demandée par WhatsApp ».

### 5. Les numéros

Le numéro reconnaît une personne par **le téléphone de sa fiche** : Personnel
& paie pour l'équipe, Prestataires pour le répertoire, la fiche fournisseur
pour un engagement (le dossier doit être **lié** à sa fiche fournisseur pour
que « Prévenir par WhatsApp » ait quelqu'un à qui écrire). Un numéro absent
de toute fiche reste « sans fiche », lisible du personnel, comme une cliente.

### 6. Ce qui se passe ensuite, sans rien faire

- Une employée qui est aussi cliente se lit dans **Équipe**.
- Une personne qui quitte l'équipe **garde un fil réservé** : ses bulletins ne
  s'ouvrent pas au personnel le jour où sa fiche disparaît.
- Un devis en photo d'un prestataire qui n'a **qu'un** dossier ouvert entre
  dans ce dossier, « à saisir » ; sinon il attend en tête des Engagements.
- Deux messages partent seuls, jamais deux fois en 24 heures : l'accusé d'une
  pièce reçue d'un prestataire, et le formulaire de congé.

## Étape 7 — La fin de paquet (15 septembre 2026)

« Il vous reste 2 soins, jusqu'au 12 juin » : le message qui rapporte le
plus. Maquette `public/maquette-la-fin-de-paquet.html`, validée. **Le Trône
juge et envoie lui-même** : rien à déployer côté serveur, aucun cron, aucune
migration. Un seul geste : faire approuver le modèle.

**`fin_de_paquet`** — WhatsApp Manager → Modèles, français, catégorie
**UTILITY**, sans en-tête. Corps :

> Bonjour {{1}}, il vous reste {{2}} sur votre {{3}}, {{4}}. Pensez à
> réserver : nous vous gardons votre place.

({{1}} = prénom, {{2}} = « 1 séance » ou « 2 séances », {{3}} = le nom de la
formule, {{4}} = « valable jusqu'au 12 juin » ou « sans date limite ».) Il
informe, il ne vend pas : c'est ce qui le garde utilitaire chez Meta. La suite
se propose au fauteuil.

**Quand il part** : à la dernière séance de la prestation la plus contrainte,
ou quinze jours avant la date limite s'il en reste plusieurs, le premier des
deux, une seule fois par paquet. Jamais un paquet expiré. Entre 9 h 30 et
21 h 30 à Cotonou, à l'ouverture du Trône par quelqu'un de la Maison (un
dimanche sans personne, il part le lendemain).

**Où le lire** : dans le fil de la cliente (Conversations), signé « la Maison,
automatiquement » ; sur son contrat (Abonnements, « prévenue par WhatsApp
le… ») ; à la cloche, qui dit surtout **qui n'a pas de numéro**, un appel à
passer. Le journal des envois porte une ligne `env-paquet-<contrat>` par
paquet : c'est le verrou qui empêche deux postes d'envoyer deux fois, et
c'est là que se lit un refus de Meta (modèle pas encore approuvé) — repris
seul le lendemain.

## Règles de la maison

- Jamais une clé dans le dépôt : les secrets vivent chez Supabase.
- Le téléphone d'une cliente ne sort jamais de la table `envois` (lecture
  personnel seulement — RLS de 0043).
- Un rappel ne part qu'UNE fois par canal et par rendez-vous, quel que soit
  le nombre de réveils du cron (identifiants déterministes `env-<rdv>-<canal>`).
