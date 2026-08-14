# Reprendre — état de la Maison

État au 14 août 2026. À lire en premier dans une nouvelle session.

## Le lien de famille se répare à chaque entrée — 14 août

Le piège de fond a REfrappé le jour même : la version du 14 était bien sur
l'appareil, la 0047 collée — et toujours aucun enfant chez Valerie. Cause
probable : les écritures froides rejouées au démarrage du téléphone
repoussent une copie de la fiche SANS familyId et effacent la soudure.
Triple ceinture posée : ① `tetesPortees` (shared/accounts) et
`clientFamily` (fiche 360) acceptent la famille dont on est PAYEUR même
sans lien sur la fiche — l'affichage ne dépend plus du champ effaçable ;
② MIGRATION 0048_le_lien_se_repare.sql (à coller) : `adopter_ma_fiche` —
appelée à CHAQUE entrée dans l'app — recoud familyId quand la fiche est
payeuse d'une famille (réparer à la main perd contre une file qui
rejoue ; le serveur répare au même rythme) ; ③ 0046 reposait déjà le lien
à chaque rattachement. Contrôle de la 0048 : compte des fiches payeuses
sans lien (0 ou 1 attendu au moment de coller).

## La mise à jour automatique enfin BRANCHÉE — 14 août

« Les écrans ne sont jamais publiés » (Yéman) alors que gh-pages ET le
bundle servi en ligne étaient à jour (vérifié par ls-remote + lecture HTTP
du HTML servi). Cause : `shared/version.ts` (écrit le 2 août — compare le
`version.json` déposé par build-sites au VITE_BUILD_ID compilé, recharge
une fois au démarrage/focus) n'était IMPORTÉ NULLE PART. Une app installée
repartait de sa copie d'index.html et ne voyait jamais un déploiement.
Branché dans LES SEPT entrées (`import '../../shared/version'` dans chaque
main.tsx + portal). L'empreinte se LIT désormais : Profil de Ma Couronne,
« Version du 14 août 2026 · 11:42 » (décodée de VITE_BUILD_ID
AAAAMMJJHHMMSS). CE déploiement est le dernier à exiger un
rafraîchissement manuel des appareils ; ensuite l'app se met à jour seule
(délai possible ≈ 10 min — cache CDN de GitHub Pages sur version.json).

## L'adoption passe par le serveur, la maison reste au Trône — 14 août

RACINE DES DOUBLONS (Merine 12 août, Valerie 14 août) : `cli_sel` (0036) ne
montre à une cliente que SES têtes — l'adoption par adresse, côté téléphone,
était AVEUGLE (la fiche de la maison qui porte son e-mail lui est invisible)
et l'app créait une fiche neuve, vide, à côté de la vraie. Deux comptes
peuvent en plus naître sur UNE MÊME adresse (mot de passe d'un côté, Google
de l'autre, tant que l'adresse n'est pas confirmée). MIGRATION
0045_adopter_ma_fiche.sql (à coller) : RPC security definer qui lit
l'adresse DU JETON et rend un verdict — `staff` (compte de la maison : le
Trône est sa porte, JAMAIS de fiche cliente — demande de Yéman), `ok`,
`adoptee` (fiche libre au même e-mail → authUserId posé), `occupee`
(l'adresse est au compte d'un AUTRE → pas de doublon), `aucune`. Côté app
(couronne/lib.ts) : `adopterMaFiche` (un appel par compte, verdict dans
`adoptionStore`) AVANT toute création dans `useEnsureClient` — `adoptee`
recharge une fois (les droits changent), `staff`/`occupee` ne créent rien ;
`useCompteEnDouble` et `useCompteMaison` commandent deux écrans de garde
dans App.tsx (« Cette adresse a déjà son espace. » / « Ce compte tient le
Trône. » avec lien vers /trone/). Sans la 0045 collée, l'erreur RPC retombe
sur le comportement d'avant. L'AUDIT VALERIE (14 août) a montré autre
chose que prévu : UN seul compte de connexion, mais la fiche parent avait
PERDU son familyId (copie froide poussée par le téléphone — l'écriture de
sa propre fiche lui est permise) → la 0044 ouvrait une SECONDE famille au
rattachement suivant, enfants éparpillés, plus rien de visible dans Ma
Couronne (tetesPortees exige le lien sur la fiche). MIGRATION
0046_famille_retrouvee.sql (à coller après la 0045) : `rattacher_enfant`
cherche la famille dont le parent est DÉJÀ payeur avant d'en ouvrir une,
et REPOSE `familyId` sur la fiche à chaque passage. Soudure Valerie :
supabase/local_valerie_soudure.sql (gitignoré) — garde fam-026504110d,
y range les 4 enfants, efface la famille vide. PIÈGE DE FOND documenté :
les poussées « ligne entière » d'une copie froide peuvent effacer des
champs posés par le serveur sur la fiche cliente — 0046 ne guérit que
familyId, par re-pose. DERNIER MUR TROUVÉ ENSUITE : `families` n'avait
QUE `staff_all` — zéro ligne côté cliente, donc `tetesPortees` ne trouvait
jamais la famille et Ma Couronne n'affichait aucun enfant (données bonnes,
porte de lecture absente). MIGRATION 0047_familles_lisibles.sql (à
coller) : `est_ma_famille(fam)` security definer + politique `fam_sel`
(SELECT) — une cliente lit LA famille que sa fiche pointe ou dont elle est
payeuse ; l'écriture reste staff + RPC.

## Le Trône REÇOIT — réservations en attente et enfants rattachés — 13 août

Deux files de réception dans « Ce qui presse » (Dashboard), en tête de
liste. ① RÉSERVATIONS À RECEVOIR : tout RDV `en attente` à venir, toutes
dates — il ne paraissait qu'à sa date au Calendrier, une réservation prise
pour dans trois semaines restait invisible trois semaines. « Recevoir »
ouvre la modale : chaque ligne (tête, date, prestations, maître) se
CONFIRME d'un geste (même écriture qu'au Calendrier) ou s'OUVRE (RdvModal).
② ENFANTS RATTACHÉS DEPUIS MA COURONNE : le journal `enfants_declares`
statut `accepté` (écrit par la RPC 0044), moins les arrivées déjà reçues
(`mnd_enfants_recus_vus`, mémoire LOCALE du poste comme la file des
compositions — le journal, lui, reste intact). « Voir » marque reçues et
ouvre les Clientes. Les enfants posés au comptoir (AjoutEnfantAuCompte)
n'écrivent pas de déclaration — la file ne montre que ce qui ARRIVE de Ma
Couronne.

## Les comptes enfants au visage — maquette du 9 août posée — 13 août

Les trois écrans de la maquette « Les comptes enfants » vivent. ① LE
SÉLECTEUR DE TÊTE : une seule ligne en haut de l'accueil de Ma Couronne
(App.tsx — chips `mc-pourqui`, « Vous » toujours premier, âge lu de la
naissance). Elle ne paraît que si `tetesPortees` (shared/accounts) rend des
mineurs — parent PAYEUR du compte famille, comme la RLS. Le sélecteur ne
change pas de session : il change la tête que l'application REGARDE. ② LA
COURONNE DE L'ENFANT (`HomeEnfant`, Tabs.tsx) : carte à son nom (« N ans ·
c'est vous qui réservez et réglez »), calibre compté + dernière venue +
reprise conseillée (même juge `predictNextVisit`), prochain rituel (« Son
fauteuil l'attend »), CTA QUI DIT LE NOM (« Réserver pour X » →
`BookingPrefill.pourId`, le tunnel arrive posé sur la tête — serviceId
devenu OPTIONNEL) et « Revenir à votre couronne ». Gamme et Cercle SE
FERMENT quand on regarde un enfant (rien à son nom) ; le SUIVI suit le
regard (`SuiviTab.regard` — parcours, timeline, re-réserver avec pourId ;
tiroirs « Mes rendez-vous/commandes » tus). Les juges
`useClientAppointments`/`useNextAppointment` (Tabs.tsx) acceptent une
cible. ③ LA FICHE 360 DU TRÔNE : le bloc compte famille porte la naissance
en clair sur chaque membre, le badge « Règle pour tous » sur le payeur, et
« + Ajouter un enfant à ce compte » (`AjoutEnfantAuCompte`, Customers.tsx)
— fiche réelle sans compte, mineur déduit de la naissance, mêmes gardes que
la RPC 0044 (tête déjà au carnet → refus, majeur → Finances › Comptes),
héritage ville/persona/coef du parent payeur.

## La page QR Codes : Wi-Fi et plein écran du comptoir — 13 août

La page QR Codes (`/qr-codes`) porte CINQ cartes : invitation Ma Couronne,
les DEUX réseaux Wi-Fi de la maison (« Installez-vous. Le réseau de la Maison
est à vous. » — gabarit `CarteWifi`, une carte par réseau), MoMoPay, code du
jour. CHAQUE code sait s'« Afficher au comptoir » : plein écran parchemin,
marque, code géant tourné vers la cliente — toucher ou Échap referme
(`AuComptoir`, QrCodes.tsx ; l'invitation reçoit le geste par la prop
`surComptoir` d'`InvitationCouronne`, la Vitrine ne change pas). Le Wi-Fi
encode `WIFI:T:WPA;S:…;P:…;;` (caractères réservés échappés) ; noms et mots
de passe vivent dans `autoConfigStore` (`wifiSsid`/`wifiPass`, second réseau
`wifi2Ssid`/`wifi2Pass`) — DANS LA BASE, jamais en dur dans le code : le
dépôt est public. Ils se saisissent sur la carte même ; tant qu'ils manquent,
la carte dit « à renseigner ». Face cliente (plein écran, carte imprimée),
les deux réseaux disent la MÊME phrase — l'accueil ne parle pas de boxes. Le
gabarit A5 est partagé (`carteA5`) — MoMo et Wi-Fi s'impriment pareil.

## Le calibre se compte, le style est retiré — 13 août

Décision Yéman : le champ « style de couronne » SORT du système. Le CALIBRE
(déduit du comptage par le barème — juge `calibreDe`, pricing.ts) s'affiche à
sa place partout : fiche 360 (déjà lu du comptage, sélecteur retiré),
formulaire nouvelle cliente (champ retiré), Consultations, accueil + Suivi +
Profil de Ma Couronne, miroir de la Vitrine. La carte Paramètres « styles de
couronne » est SUPPRIMÉE ; `crownStylesStore` et `Client.crownStyle` restent
en données (fiches anciennes) mais ne s'écrivent plus. SEEDS à SEPT calibres
(bornes revues par Yéman) : Jumbo 80 · Medium 150 · Mini 250 · Micro 350 ·
Nano 450 · PICO 550 (nouveau, coefs interpolés 2,5/2,6 — VÈKPÈ 3,75/2,75) ·
Galaxy SANS PLAFOND (demande « 551 à 650 » adaptée : une cliente réelle porte
700 locks, la dernière tranche reste infinie — la case ∞ des Paramètres pose
un plafond si la Maison y tient). « Rétablir » dit désormais 7.

## Le régime tarifaire se lit — 13 août (entame du Juste Prix)

Nouveau juge `regimeTarifaire(sv)` (pricing.ts) : CE QUI FAIT LE PRIX d'une
prestation, dit en une phrase dans l'ordre même de `personalPriceXof`
(prix ferme catalogue → composition de forfait → devis → grille longueur →
prix par calibre → comptage au lock → coef du modèle → fixe/variable), avec
`justePrix` qui dit si le coefficient personnel s'appliquera. Le Catalogue
l'affiche sur CHAQUE ligne (« Son prix · … · Juste Prix : oui/non ») et la
« Tarification avancée » relit le formulaire À CHAQUE FRAPPE avec le même
juge (« Ce qui fait son prix · … »). Le Juste Prix par cliente se règle dans
Finances › Le Juste Prix. RÈGLE DES MONDES (13 août, décision Yéman —
« Atelier seulement ») : le coefficient personnel ne touche QUE les
prestations dont le monde est l'ATELIER (`coefJustePrix`, pricing.ts, via
`mondeDeCat`) — plateau technique, Studio et Académie sont à ×1, et un monde
introuvable échoue fermé (×1). Un contexte SANS arbre de catégories garde le
comportement global d'avant (harnais, appels nus). Il ne s'applique pas non
plus aux prix fermes du catalogue, prix convenus de la fiche et montants sur
devis. LE MODÈLE DE PRIX EST EXCLUSIF au Catalogue (fixe / barème du modèle /
comptage / calibre / longueur) : enregistrer une prestation EFFACE les
systèmes des autres modèles. « Les systèmes de prix » (page Le Juste Prix)
donne les comptes et ouvre le Catalogue filtré (`?regime=`). Harnais
verifie-prix : 43/43 après chaque étape.

## Les envois automatiques — 13 août (chantier des trois canaux)

Vérité d'avant : les « automatisations » de Marketing étaient un registre
SANS émetteur — tout partait au tap (wa.me pré-rempli), seul le push
(`push-notify`, déployée hors dépôt) était réel. Yéman a choisi les trois
voies d'un coup : gratuit d'abord + WhatsApp API + SMS.

- **Table `envois` (0043, PASSÉE — contrôle `envois · 0`)** : le journal,
  une ligne par personne et par canal, id DÉTERMINISTE `env-<apptId>-<canal>`
  (l'idempotence vit dans la clé). RLS personnel SEULEMENT — les lignes
  portent des téléphones. Magasin lié dans `equipe/data.ts` (type `Envoi`).
- **Fonction `rappels-j1`** (`supabase/functions/rappels-j1/index.ts`,
  fichier COMPLET à coller — règle maison) : réveillée par cron (17 h UTC =
  18 h Cotonou), lit les RDV de demain (fuseau salon), envoie ① le PUSH via
  `push-notify` appelée de l'intérieur (gratuit, marche dès le déploiement),
  ② WhatsApp par l'API Meta SI `WA_TOKEN`/`WA_PHONE_ID`/`WA_TEMPLATE` posés
  (modèle `rappel_rdv` fr, {{1}} prénom {{2}} heure), ③ SMS forme Twilio SI
  `SMS_TWILIO_SID`/`SMS_TWILIO_TOKEN`/`SMS_FROM` posés. Garde : n'accepte
  QUE la clé service. AUCUN secret dans le dépôt.
- **La tournée du matin** (Tableau de bord, après « Ce qui presse ») : les
  RDV de demain alignés, pastilles « Push parti seul / WhatsApp auto / SMS
  auto / Sans l'appli » lues du journal, et la `ReminderBell` existante pour
  finir à la main.
- **Guide complet : `docs/BRANCHER-ENVOIS.md`** — déploiement, cron,
  compte Meta (numéro DÉDIÉ obligatoire, modèle à faire approuver, tarif à
  la conversation à vérifier), fournisseur SMS (adapter le bloc ③ si autre
  que Twilio). RESTE À FAIRE PAR YÉMAN : déployer la fonction + poser le
  cron (étapes 1-2) ; comptes Meta/SMS quand elle veut (étapes 3-4).
- **Suivi du compte MoMoPay** (13 août, même journée) : le QR/USSD est un
  canal fermé MTN — la seule vue complète est le RELEVÉ marchand. Construit :
  Encaissements → « Pointer le relevé MoMo » (lecteur tolérant montant/date/
  réf, rapprochement contre `buildReceipts` + acomptes en attente ; verdicts
  Pointé / Acompte à confirmer [bouton → `depositConfirmed` daté du relevé] /
  Noté sous un autre moyen / Orphelin ; un encaissement ne se consomme
  qu'UNE fois ; rien ne persiste — recoller le relevé recalcule). Si le
  format réel lit mal : demander un échantillon et calibrer `lireReleve`.
  Voie B choisie aussi : MoMo Open API Collections (RequestToPay) — enrôle-
  ment MTN d'abord (guide, annexe B) ; le chantier `momo-collecte` + bouton
  Caisse s'écrira quand les clés existeront. KkiaPay NON retenu (rails
  dormants intacts dans `shared/kkiapay.ts`).

## Paramètres : l'audit du vrai et du décor — 13 août

La page réorganisée en sept familles (colonne unique, sommaire collant,
intertitres cuivre, zones sensibles À LA FIN — commit « la page se lit par
familles »). Puis l'audit de CHAQUE réglage, à la demande de Yéman :

- **Branché** : heures, journées exceptionnelles, calendrier de réservation,
  acomptes, devise étrangère, livraison, modes de paiement (Caisse, Factures,
  Académie, Abonnements), segments, styles de couronne (menu des fiches +
  affichage Ma Couronne), preuve de présence, automatisations IA, sauvegarde.
- **MORT — gardé, marqué « À venir », rendu INERTE** (décision de Yéman ;
  bascules `pointerEvents:none`, champs `disabled`, pastille) : « Durée
  standard d'un rituel », « Fenêtre d'annulation », les 8 interrupteurs
  (`settings.toggles.*` : rappel, 4 notifications, auth, sauvegarde, export —
  lus nulle part). Brancher l'un d'eux un jour = retirer sa marque ICI même.
- **L'IDENTITÉ DE LA MAISON EST BRANCHÉE** (13 août, sur demande) : le
  magasin `mnd_house_identity` vit désormais dans `shared/identite.ts`
  (même clé, rien à migrer). Le NOM signe la barre latérale, l'écran de
  connexion, l'entête ET l'en-tête WhatsApp des factures, les reçus PDF
  (`houseName`/pieds de page) et `houseSignature` ; la RAISON SOCIALE est la
  ligne légale au pied des factures (remplace un RCCM codé en dur qui
  CONTREDISAIT celui de la carte : CO-B-2024 vs COT-B-2021) ; le FUSEAU
  règle la date du bandeau du Trône (`fmtDate(…, fuseauIana())` — la
  Souveraine en voyage voit le jour du salon). Règle suivie : le nom ne
  s'insère que là où il se tient SEUL, jamais au milieu d'une phrase
  française (« Toute la Maison MND pense à vous » se briserait sur un autre
  nom). Le doc n'est PAS dans `docs_pub_read` : Ma Couronne et l'écran de
  connexion (avant session) retombent sur le cache local ou le défaut.
- Le bouton « Enregistrer » ne sauve rien (tout s'écrit à la frappe) — sa
  note dit désormais la vérité.
- **Styles de couronne réels** (v2, dictée par Yéman — la finesse des locks) :
  Jumbo · Traditionnelles · Medium · Mini · Micro · Nano · Galaxy. Graine
  dans `clients.ts` + `supabase/pose_styles_reels.sql` PASSÉ (contrôle : 7).
  Les fiches taguées d'un ancien style le gardent. Les listes styles et
  modes de paiement s'éditent EN LIGNE (LigneListe : frappe = sauvegarde,
  vide/doublon revient au blur, ▲▼ = ordre des menus et de la Caisse ;
  CLÉ PAR POSITION sinon le champ perd le focus à chaque lettre).
- **Le QR marchand MoMo vit aux Automatisations** (13 août) : décodé du
  document officiel de Yéman (« Scannez et payez ») — il encode
  `506846@momopay` — et redessiné par `qrMatrice`/`QrSvg` (Comptoir).
  Champs `AutoConfig.momoQr/momoUssd/momoMarchand` (défauts en code :
  l'affiche est posée au salon, publique par nature ; nom affiché
  « Ets ACIA1 », jamais le prénom). Chantier possible : insérer l'USSD dans
  les messages de rappel/relance.

## Le calendrier sait dire non — 12 août

Trois restrictions à la réservation, demandées après un RDV Micro/Nano/Galaxy
mal calibré. ⚠ MIGRATION **0042** À COLLER AVANT LA PROCHAINE PUBLICATION :
les deux apps se lient à la table `blocages` — sans elle, pastille rouge
(0037 reste RÉSERVÉ au réarmement de `clients_protege_tarif`).

- **Créneaux bloqués** (`shared/blocages.ts`, table `blocages`, doc
  Paramètres → « Le calendrier de réservation ») : une date, un maître (nom,
  comme les RDV ; vide = toute la Maison), une plage `debut`/`fin` en
  « 12h00 » ou la journée entière, un motif LISIBLE PAR LES CLIENTES (RLS :
  lecture à toute personne connectée — la réservation calcule côté cliente).
  `freeSlots` les traite comme des RDV qui occupent. Fermer une date entière
  à toute la Maison reste une JOURNÉE EXCEPTIONNELLE — une vérité par
  question.
- **Plafond de RDV par jour** (`Settings.maxRdvParJourMaitre` /
  `maxRdvParJourMaison`, 0 = illimité, même carte des Paramètres) : atteint,
  `freeSlots` ne rend plus rien ce jour-là. Le comptoir n'est PAS bridé.
- **Densité déclarée au tunnel** (`Client.lockCountDeclare`) : à l'étape du
  créneau, si la CIBLE n'a pas de comptage et qu'une prestation suit le
  modèle, des chips de tranches (barème par défaut) écrivent le plafond de la
  tranche sur SA fiche. DURÉE SEULEMENT (`pricingDuree` dans Booking) — le
  prix reste sur `pricing` : une cliente ne s'auto-tarife pas. La fiche
  du Trône affiche « Elle se déclare calibre X — compter au fauteuil ».
  ⚠ POUR LE RÉARMEMENT 0037 : `lockCountDeclare` doit RESTER écrivable par
  la cliente (champ non protégé), contrairement à `lockCount`.

Déménagements faits avec : les EXCEPTIONS D'HORAIRES vivent désormais dans
`shared/settings` (type + store + `horaireEffectif` ; `equipe/payroll`
re-exporte, aucun écran n'a bougé) parce que Ma Couronne ne peut pas importer
un module du Trône. `openingForIso` applique maintenant l'exception MAISON du
jour (fermée/décalée) — la réservation la respecte donc, et 0042 ajoute
`mnd_horaires_exceptions` à la liste blanche `docs_pub_read` (12 clés) : les
NOTES d'exceptions deviennent lisibles par les clientes, n'y écrire que ce qui
peut se dire.

## L'inscription ne double plus les fiches — 12 août (Merine)

Trois défauts vécus par une vraie cliente à son inscription Ma Couronne :
① `useEnsureClient` attendait l'hydratation des BRANCHES mais pas celle des
CLIENTES — inscrite avant la première lecture du CRM, elle recevait une fiche
DOUBLON pendant que sa fiche historique (famille, enfants, rituels) attendait
d'être adoptée par son adresse. Désormais : `tablePrete('clients')` requis
avant toute création, et `ensureClient` tente UNE DERNIÈRE ADOPTION par
l'adresse au moment même de créer. ② Le Profil « enregistrait » dans le vide
quand la fiche n'était pas née (le `map` ne touchait rien, le toast mentait) —
la fiche s'assure avant l'écriture, et si elle manque encore on le DIT.
③ Le formulaire du Profil s'amorçait sur une fiche pas encore arrivée (champs
vides, `useState` ne se rejoue pas) — il se ressème sur `client.id`.
RAPPEL du juge des enfants : `tetesPortees` exige que le parent soit le
PAYEUR de la famille ET que chaque enfant ait une DATE DE NAISSANCE (mineur
échoue fermé) — sans elles, rien ne s'affiche côté Ma Couronne. Les doublons
déjà nés se soudent par SQL clouée sur identifiants (motif
`supabase/local_*.sql`, gitignoré).

## La remise famille — 12 août

L'avantage du compte famille est un TAUX porté par le compte
(`Family.remisePct`, réglé dans Finances › Comptes : chips 15/18/20 + saisie
libre, défaut 15, 0 = coupée). LE juge est `remiseFamillePct` (shared/clients)
— compte muet → défaut de la Maison, pas de compte → 0. À la modale RDV :
choisir un membre d'un compte pose D'OFFICE « Remise » au taux du compte sur
un NOUVEAU rituel (effet sur le changement de tête, `famAuto` ; un choix
manuel du mode l'éteint, revenir à une tête sans compte la retire) ; un rituel
EXISTANT ne se réécrit jamais tout seul — la remise s'y propose d'un clic
(« Poser la remise famille · −X% », chip « Famille −X% » dans les
pourcentages). Le rituel enregistre `remiseFamille: true` quand le pourcentage
posé est celui du compte ; la modale récapitule « remise famille −X% » ; la
facture porte `Invoice.discountLabel` (« Remise famille ») écrit à
l'encaissement (actions.tsx) et à la reconformation (alignerFacturesDuRituel),
affiché sur la pièce à la place de « Remise manuelle ». La fiche cliente
(panneau compte famille) lit l'avantage. Le tunnel Ma Couronne n'applique PAS
la remise à la réservation (chantier possible : l'y afficher) — elle se pose
au Trône.

## Les mondes se disent — 12 août

Toutes les listes annoncent désormais le MONDE qu'on traverse : ATELIER MND™,
LE PLATEAU TECHNIQUE (commun aux deux maisons), STUDIO MND · ACƆ™, MND
ACADÉMIE. Le juge vit dans `catalog.ts` : `mondeDeCat` (remonte à la racine ;
`maison: 'atelier' | 'studio'` tranche, préfixe `aca-` → académie, sans maison
→ plateau — MÊME logique que `groupeDe` de l'écran Catalogue), `rangMonde`
(l'ordre 0–3) et `mondeLabel` (les intitulés). `catsDansLOrdre` trie ses
racines par monde PUIS par `order`. Quatre surfaces posent l'intertitre au
passage d'un monde : le sélecteur du RDV (`_shared.tsx`, `<optgroup>` vide
`━━ … ━━`), la Caisse (bandeau cuivre au-dessus des groupes ; produits =
« LA GAMME », formations = « MND ACADÉMIE »), les objectifs de la réservation
Ma Couronne (`Booking.tsx`) et la régie de la Vitrine. LEÇON GRAVÉE : ne
JAMAIS faire de remplacement de texte via PowerShell sur les sources
accentuées — un `-replace | Set-Content` a mojibaké 4 fichiers (é→Ã©),
récupérés par `git checkout --` puis ré-édités à l'outil.
Derniers chantiers : la longueur PAR DÉFAUT sur la fiche, le pourboire qui a
SA caisse, les PDF qui translittèrent le fon — puis la GRANDE REVUE DE CODE
du 12 août (voir « La revue du 12 août ») : 14 défauts confirmés corrigés
d'un bloc. L'HISTORIQUE LOCAL A ÉTÉ RÉÉCRIT ce jour-là avant première
publication du dépôt source : des prénoms de clientes s'étaient glissés dans
REPRENDRE et des commentaires de code — purgés des fichiers ET de l'historique
(les commits d'avant la purge n'ont jamais été poussés). Portail et LOKAA n'ont pas été republiés (rien de
fonctionnel pour eux). TOUTES les migrations jusqu'à 0034 sont PASSÉES, plus
0038–0041 (Salon & Foyer, caisses indépendantes, coffre, épargne au coffre) ;
0037 reste RÉSERVÉ au réarmement de `clients_protege_tarif`. Ne relancer
aucune migration.

## La revue du 12 août — 14 défauts confirmés, corrigés d'un bloc

Dix angles de détection, ~40 candidats, 12 contre-enquêtes adversariales.
Corrigé ce jour-là (chaque point a sa vérification au harnais quand il en
relève) :

- **`prixFerme` fermait les « sur devis »** → un rituel/une facture à 0 F
  possibles. Le mode du Catalogue prime : seul un prix FIXE peut être ferme
  (un prix convenu sur la fiche reste au-dessus). Harnais : 5 cas devis.
- **`alignerFacturesDuRituel`** effaçait les produits d'un ticket mixte et
  réécrivait aux prix de base. Désormais : une pièce dont une ligne n'est pas
  une prestation du catalogue ne se réécrit PAS, et l'appelant passe son
  contexte tarifaire (`priceOf`) — la modale passe le sien, longueur figée
  comprise. Le compteur `touchees` (jamais lu, impur) est mort.
- **Le seuil `desVenue` et les prix se calculent sur la TÊTE SERVIE** dans le
  tunnel Ma Couronne (`cible = beneficiaire ?? client`), et la reco de
  l'accueil passe par le juge unique **`estProposable`** (pricing.ts) — elle
  recommandait et laissait réserver le forfait 3ᵉ venue à la venue zéro via
  le prefill qui entrait après l'unique garde.
- **Le moteur des forfaits compte les PRODUITS** (`forfaitPriceXof` +
  `personalPriceXof(…, produits)`) ; Ma Couronne passe enfin le catalogue au
  moteur (sans lui, une composition ne se résolvait jamais là-bas) ; l'aperçu
  du Catalogue appelle le moteur au lieu d'additionner à la main.
- **La charge salaire** : constructeur UNIQUE `chargeSalaire()` (payroll.ts) —
  jour LOCAL (`jourLocalDe`, fini le UTC qui basculait la masse salariale de
  mois), plus JAMAIS les coordonnées MoMo de l'employé en nom de caisse
  (sans caisse = « Sans caisse · Autres »), libellé unique, et
  `Expense.source: 'run' | 'confirm'` — la resynchronisation automatique de
  Personnel ne réécrit plus une ligne d'un run payé ; seul un geste explicite
  reprend la main. ATTENTION : les DEUX formules de net (run = cotisations
  déduites ; Personnel = commissions/pourboires compris, brut de cotisations)
  existent toujours — chaque geste écrit la sienne ; l'unification de la
  formule reste un chantier à trancher par Yéman.
- **Salon & Foyer** : `!e.stopped` sur les charges du mois (le Partage
  divergeait de la Synthèse dès qu'on suspendait une dépense) ; identifiants
  de dotation et de prêt **par branche** (`dot-<branche>-…`,
  `pret-dep-<branche>-…`, anciens ids sans branche reconnus pour NOTRE
  branche) ; l'enveloppe d'une dotation ne se re-libelle plus
  (`modifieLigneEpargne` l'ignore sur les `dot-*` — le panneau détruisait la
  ligne re-libellée) ; `dotationInscrite` filtre enfin par branche.
- **Le pourboire d'un règlement en devise reste au tiroir devise** dans le
  registre (il vivait dans deux caisses à la fois) ; `CAISSE_POURBOIRES` en
  constante ; **`invoiceCashXof`** (finance.ts) remplace les trois copies de
  la formule « net encaissable ».
- **« Nouvelles » du Bilan mensuel = premières venues HONORÉES du mois** —
  l'ancienne règle (couronnée + fiche du mois) lisait ~0 pour les têtes du
  comptoir (nées de passage) et remplissait les mois rétroactivement.
- **La modale RDV accepte « 0 » comme montant convenu** (`amountNum ?? …`) —
  un 0 tapé n'est plus « rien saisi », et une part libre figée à 0 ne se
  regonfle plus au ré-enregistrement.
- **L'encaissement lit la longueur FIGÉE du rituel** (actions.tsx :
  `longueur: appt.longueur` posé sur le contexte) — plus de remise fantôme
  quand la fiche a changé de longueur depuis.
- Mémoïsations : venues de la tête (modale RDV, Caisse — `groups` ne dépend
  plus du carnet entier), aperçu par modèle du Catalogue, mouvements de
  caisse (une fois par rendu), noms des clientes (Map), compteurs Clientes,
  dépenses de la Paie (Map). `fmtCaisse` passe par `fmtIn`.

**Différé, assumé** : dédoublonnage des 4 paires de formulaires de
SalonFoyer, du panneau Dotations, de l'interrupteur CNSS/ITS, des badges de
prix, du lanceur esbuild ×5 des harnais ; la garde souverain de SalonFoyer
calcule encore le registre avant de refuser ; bulletin.html recalcule avec
ses propres tranches ITS (à faire suivre des Paramètres de paie un jour).

## L'équipe — construit le 6 août

**Les mains.** Chaque prestation d'un rendez-vous porte ceux qui l'ont exécutée
(`Appointment.mains`, tableau parallèle à `serviceIds`). Le `master` reste le
maître ASSIGNÉ, celui qui répond du rituel — il ne dit pas qui a travaillé. À
défaut de mains, tout retombe sur lui.

**Le pourboire se partage entre tous**, qu'on ait touché la tête ou non, selon
`StaffMember.partPourboire` — 1 par défaut, 0,5 pour le couple fondateur qui
n'en compte qu'une à deux. C'est un POIDS, jamais une division par quatre.

**La commission** est un réglage par personne (`commissionne`,
`commissionTauxPct`) : chez MND on ne commissionne pas les salariés. Elle ne
concerne que le maître recruté ponctuellement et le praticien devenu maître.
Elle va aux mains, à parts égales, et se calcule sur le NET facturé — plus sur
le prix catalogue.

**Production & primes de seuil** (onglet de Personnel & paie) : un barème par
famille, prestation, toutes prestations ou têtes, avec des paliers qui se
franchissent sans se proratiser. Un geste fait à deux vaut une demi-part de
chaque côté. La prime se propose, le gérant l'inscrit — et sa marque
`seuil:<regle>:<mois>` empêche tout doublon.

**Mon mois** (`/mon-mois`) : chacun pointe son arrivée et son départ, voit ses
points, ses pourboires, son rang, et complète les têtes dont les mains
manquent. La prime se gagne sur un SEUIL, pas sur un rang.

**Les accès.** Un maître n'atteint que Mon mois et le Calendrier, sans les
montants. On lui ouvre des domaines un à un depuis Système → Accès & personnel
(`staffAccessStore`) : c'est ainsi qu'une personne qui tient le secrétariat ET
le fauteuil garde un seul compte. Ouvrir Vente ou Finances lui rend les prix.
La migration `0026_pointage_par_chacun.sql` est PASSÉE — `attendance` est sous
`is_staff()`.

**Ce n'est qu'une garde d'écran.** Les rôles organisent l'interface, ils ne
cloisonnent pas les données : côté serveur, seule la paie est réservée au
souverain. Le bandeau d'Accès & personnel le dit.

## Le catalogue est replié — 5 août 2026

**147 → 74 prestations.** Deux mouvements, dans cet ordre :

1. `supabase/0023_repli_longueurs_catalogue.sql` — 92 variantes de longueur
   (« … · Court / Mi-Long / Long ou haute densité ») repliées en 31 gestes qui
   portent chacun ses trois prix et ses trois durées. 61 lignes retirées.
2. Le ménage, écrit par `menage-catalogue.html` (à la racine du dossier
   « Le Trone ») : 12 prestations jamais réservées, choisies une à une.

Contrôles passés : aucun rituel n'a changé de montant, aucun rendez-vous ne
pointe vers une prestation disparue. **Ne pas relancer ces scripts.**

`supabase/0022_soins_une_prestation_par_geste.sql` est REMPLACÉ par le 0023 et
ne doit jamais être exécuté.

### Les tables de secours

`repli_0023_services`, `repli_0023_appointments`, `repli_0025_services`. Elles
sont le seul retour en arrière. Ne pas les supprimer avant d'avoir travaillé
quelques jours avec le nouveau catalogue. Les blocs de rollback sont en fin des
fichiers correspondants.

## Comment la longueur fonctionne désormais

Une prestation porte `prixParLongueur` et `dureeParLongueur` — un prix et une
durée par longueur travaillée. `priceXof` reste le **prix de repli** : celui
qu'annonce la Vitrine (« dès ») et qui sort quand la longueur est inconnue.

**Depuis le 11 août, la fiche porte une longueur PAR DÉFAUT**
(`Client.longueur`, carte « La couronne » du Trône, « — à constater — » tant
qu'on ne sait pas). La doctrine du 6 août la refusait — « la longueur
repousse » — mais sans elle, Ma Couronne annonçait le prix de REPLI à une
cliente dont la Maison connaît la longueur. La synthèse : la fiche donne le
POINT DE DÉPART (`pricingOf` l'hérite), chaque rendez-vous **fige toujours la
sienne** (`Appointment.longueur`) — relire un rituel de mars ne le retarife
jamais à la longueur d'aujourd'hui — et le comptoir corrige à l'arrivée si
elle a poussé. Modale RDV et Caisse adoptent la fiche au changement de
cliente (au seul changement de tête : une synchro n'écrase pas une correction
faite au sélecteur) ; la longueur figée d'un rituel existant prime toujours.
La réservation Ma Couronne fige la longueur qui a fait le prix annoncé, et le
récap la dit en toutes lettres (« Vos prix — établis pour votre couronne
… · longueur Mi-Long. ») — personnaliser en silence ferait croire à une
erreur. À tenir à jour sur la fiche quand une couronne pousse.

Un prix par longueur est un prix SAISI : tant que le Juste Prix ne le module
pas, il sort au franc près, sans l'arrondi commercial au 500 F.
**Depuis le 11 août, LA GRILLE PAR LONGUEUR REMPLACE LE MODÈLE** : dès qu'une
prestation la porte, le coefficient de tranche ne s'applique plus — ni sur la
longueur choisie, ni sur le prix de repli. WÈWÈ™ (25 000 F Mi-Long, « suit le
modèle » coché) s'annonçait 62 500 F à une tête Nano : deux graduations de
taille empilées, alors que la grille EST celle du soin. Le Juste Prix
personnel, lui, s'applique toujours — un accord par CLIENTE, pas une taille.
`prixFerme` suit : une grille = prix connu, quel que soit le comptage.
(Harnais verifie-prix : 36 vérifications, dont « la fiche donne SON prix,
l'écran prime, la fiche muette retombe sur le repli ».)

Le sélecteur paraît à la réservation et à la Caisse dès qu'une prestation
choisie s'y facture. **Ma Couronne ne le porte toujours pas** — une cliente
n'évalue pas sa propre longueur ; elle hérite du défaut de sa fiche, et le
comptoir corrige à l'arrivée.

## Le piège à ne pas oublier

Un rendez-vous ne stocke ni la maison ni la catégorie de ses prestations, mais
leurs identifiants. La ventilation se recalcule à chaque affichage depuis le
catalogue courant : **déplacer une prestation reclasse tout l'historique**, et
mettre son prix à zéro vide sa part du chiffre sur les cartes du Catalogue
(le total du rituel, lui, ne bouge pas s'il est figé).

## Stock & Achats — construit le 9 août 2026, migration 0030 PASSÉE

La page Produits (`/home-rituals`) est devenue le module **Stock & Achats** :
cinq onglets — La Gamme (inchangée), Inventaire (4 familles : revente,
consommable, mèches, jetable), Achats (réappro → bons de commande → réception),
Recettes (ce qu'un service consomme + coût matière), Mouvements (le journal).

**Les règles qui ne bougent pas :**
- **Le stock ne se stocke pas.** Aucun champ « stock actuel » : la quantité est
  la somme des mouvements du journal (`shared/stock.ts`), l'inventaire initial
  est lui-même un mouvement. Le champ `stock` de `catalog_products` n'est plus
  qu'un **miroir** que le journal réécrit — Ma Couronne (« Dernières pièces »)
  et l'écran Gamme le lisent, personne ne l'écrit à la main.
- **Le prix d'achat ne vit jamais dans `catalog_products`** (lisible par les
  clientes) : l'inventaire est sous `is_staff()`, une fiche REVENTE pointe vers
  sa fiche Gamme qui garde seule le prix de vente.
- **La vente à la Caisse** écrit un `sortie_vente` (réf. facture) ; **le rituel
  honoré** consomme sa recette (`sortie_service`, réf. `rdv:<id>`, idempotent) ;
  **l'annulation d'encaissement rembobine** aussi le stock. Les +/− du Catalogue
  et de la Gamme deviennent des ajustements tracés dès que la fiche liée existe.
- Tests : `node scripts/verifie-stock.mjs` — 58 vérifications sur la boucle.

**État du 10 août :** ①② FAITS — `0030_stock_achats.sql` est PASSÉE et le Trône
publié. ③ **Reprendre la Gamme** (Inventaire) : à vérifier si pas déjà fait.
④ fournisseurs, consommables et recettes se saisissent au fil de l'eau —
c'est un chantier de DONNÉES, toujours ouvert ; la liste de ce qui manque
sort de `supabase/audit_saisie_stock_lab.sql` (10 août).

## Le Laboratoire branché au stock — 9 août 2026, migration 0031 PASSÉE

Le formulateur compose désormais POUR UNE CLIENTE, depuis la réserve réelle :

- **Chaque ingrédient des formules se lie à une fiche d'inventaire** (champ
  `labIngredient` de la fiche — pas de table de liaison). Lié → disponible si
  stock dérivé > 0 ; jamais lié → réputé disponible, marqué « à relier ».
  Onglet **La réserve** : lier, délier, ou créer la fiche (Consommable).
- **La préparation** (`shared/laboratoire.ts`, table `lab_preparations`) porte
  la cliente, le besoin, la formule figée (substitutions comprises), les
  quantités et le prix. **Fabriquer consomme le stock** au journal (type
  `fabrication`, réf. `prep:<id>`, idempotent) ; annuler rembobine — refusé si
  une facture existe (l'argent d'abord). Un stock trop court prévient AVANT et
  laisse un négatif qui dit la vérité.
- **Facture optionnelle** : « Facturer » crée une facture MND à son nom
  (statut envoyée) — impayés, encaissements, avoirs, tout le circuit commun.
  Sans facture, la préparation est « remise » — offerte.
- **L'onglet « La gamme & le stock » du Laboratoire est SUPPRIMÉ** : il écrivait
  `product.stock` à la main, le circuit que le 0030 a fermé. La Gamme se gère
  dans Stock & Achats. Les anciennes bascules de réserve (jamais persistées)
  ont disparu avec lui.
- Tests : `node scripts/verifie-laboratoire.mjs` — 32 vérifications.
- Reste à ouvrir plus tard : montrer à la cliente « sa » préparation sur
  Ma Couronne (demande une lecture RLS ciblée — pas avant d'en avoir besoin).

**FAIT : `0031_lab_preparations.sql` est PASSÉE** (état du 10 août) — ne pas la
relancer.

## Les formules maîtres — 9 août 2026, EN BASE, JAMAIS DANS LE CODE

Le classeur « Protocoles maîtres » (Shampoing Ritual 3 niveaux, Color Locks,
Aqua Locks Ritual — 14 formules, codebook d'ingrédients) vit dans la table
`lab_formules`, **réservée au personnel**. RÈGLE ABSOLUE : le dépôt est public
et le bundle JS se télécharge sans compte — **aucune formule réelle n'entre
jamais dans le code**, ni dans un commit. Elles s'insèrent par
`supabase/import_formules_maitres.sql`, fichier LOCAL et GITIGNORÉ (patron des
imports de clientes) ; se regénère par le script de session si perdu.
**Exécuté : les 14 formules sont en base (état du 10 août).**

- Migration `0032_lab_formules.sql` (structure seule) : PASSÉE le 9 août.
- Le Laboratoire a un onglet **Formules maîtres** : fiche complète (ingrédients
  codés + quantités + températures, protocole, contrôle qualité, notes),
  liaison au stock par nom canonique du codebook, et **Composer pour une
  cliente** avec les quantités du classeur pré-remplies.
- Les six formules « vitrine » de `lab.ts` restent dans le code : elles ne
  portent aucun secret.
- Aqua Locks Ritual porte ses tarifs en notes ; s'il doit devenir réservable,
  c'est une prestation du Catalogue (prix par longueur) — chantier séparé.

## Revue à dix angles du 10 août — corrigée en bloc, 0034 PASSÉE

Une revue multi-agents a relu Stock & Achats + Laboratoire. Corrigé :

- **`0034_realtime_stock_lab.sql` — PASSÉE le 10 août** : les 9 tables de
  0028/0030–0032 sont dans la publication Realtime ; l'inter-postes est
  rétabli, les fenêtres de double consommation refermées.
- **Le miroir suit le journal d'où qu'il change** (abonnement débounce 250 ms +
  recalcul ciblé aux écritures locales). `ecrireMouvements`/`retirerParReferences`
  sont les seules portes du journal — le Laboratoire les emprunte.
- **Rembobinage par référence partout** : facture supprimée (Caisse produits),
  annulation d'encaissement, reset, RDV dés-honoré/annulé/supprimé via la
  modale. `detacherFacture` libère les préparations d'une pièce disparue.
- **Le +/− des écrans Gamme est un DELTA** (`bougerStockGamme`) ; la cible du
  formulaire s'écrit contre le stock dérivé, jamais le miroir. Résolution
  fiche↔Gamme **par branche** et fiches actives seules.
- **`litQuantite`** partout : « 2,5 » et « 1 900 » se lisent enfin ; signe
  conservé ; stocks arrondis à 3 décimales (plus de 5e-17) ; `delaiJours: 0`
  survit ; `add()` de la Caisse garde le montant sur devis ; « Facturer » une
  préparation est verrouillé anti double-clic (garde côté magasin).
- Dates locales (plus d'UTC qui coupe la nuit comptable), numéros BC ancrés,
  garde anti-suppression de sync assouplie pour `stock_mouvements` (rembobinage
  légitime ≥ 10 lignes), marque remise (rayons 2–4, `--font-serif`, fmtMoney,
  icône Camera au lieu de l'émoji).
- Reste ouvert, documenté : mémoïsations des onglets. Harnais : 63 + 42
  vérifications. *(L'unification des factures et la fenêtre d'avant-hydratation
  sont FAITES le 10 août — sections suivantes.)*

## La facture se construit à un seul endroit — 10 août 2026

`nouvelleFacture` + `ligneFacture` (shared/finance.ts). La Caisse, l'encaissement
de rituel (ses deux pièces — règlement et pourboire seul), le brouillon de
l'écran Factures et le Laboratoire ne composent plus leur pièce à la main :
chaque écran ne dit que ce qui lui est propre, le constructeur impose le reste.

**Ce qu'il impose, partout :**

- **Le numéro se tire du magasin** (`invoicesStore.get()`), jamais d'une liste
  de rendu — la Caisse et le Laboratoire tiraient le leur d'une valeur qui
  datait de leur dernier rendu, et pouvait répéter le numéro qu'un autre poste
  venait d'écrire. Même correction sur la conversion devis→facture (Factures),
  qui renumérote une pièce existante.
- **La série F est toujours « payée »** — c'est le TYPE qui l'impose
  (`FactureNeuve`). La lecture des résidus (une F « envoyée » = un encaissement
  annulé, 9 août) reste vraie par construction.
- **« walkin » ne traverse aucun circuit** (traduit en `clientId: ''` +
  `clientName`) ; la garde de `saveDraft` reste pour les pièces ÉDITÉES.
- L'heure ne se pose que sur une pièce qui naît payée (c'est le journal de
  caisse) ; la date par défaut est LOCALE (la nuit comptable ne se coupe pas) ;
  identifiants uniformes (`inv-…`, lignes `il-…`).

**Ma Couronne reste à part, et c'est voulu** : sous RLS une cliente ne voit que
SES pièces — un compteur de série calculé chez elle répéterait les numéros des
autres. Sa commande de la Gamme garde sa série `CMD-` à numéro aléatoire
(couronne/Tabs.tsx).

Changements assumés, inertes à l'affichage : identifiants de pièce désormais
`inv-…` partout (opaques ; la reprise 0018 filtre sur `inv-rep-`, qu'un tirage
`inv-<uid>` ne peut pas produire — uid est sans tiret) ; `cashbox: ''` ne
s'écrit plus (`cashboxLabel` rendait déjà « Autres »). Typecheck 0 erreur,
harnais 63 + 42 verts.

## La fenêtre d'avant-hydratation est refermée — 10 août 2026

Entre l'ouverture d'un poste et la PREMIÈRE lecture d'une table, le magasin
local n'était que le cache d'hier : une écriture faite là n'était pas poussée
(`lu` faux), puis l'hydratation REMPLAÇAIT tout — une vente tapée dans cette
fenêtre disparaissait sans un mot, facture comprise ; une reprise
« réussissait » à l'écran puis la pièce revenait du serveur. Refermée en deux
couches :

**① sync.ts — la première lecture ne remplace plus, elle REJOUE.** Les gestes
locaux du froid s'enregistrent (dernière valeur par id, suppressions par id) et
se réappliquent sur l'état du serveur à la première lecture, puis partent par
la poussée normale (`premiereLecture`). Le serveur fait toujours foi sur les
lignes d'HIER — le cache cède, comme avant ; seuls les gestes de CETTE session
survivent : posés il y a quelques secondes, ils ne peuvent pas être périmés.
S'ajoutent `tablePrete(table)` et `quandTablePrete(table, fn)` : « prête » =
première lecture RÉSOLUE — réussie, refusée par les droits, ou échouée (un
poste hors ligne vit sur son cache). Sans backend, tout est prêt d'emblée.

**② stock.ts — les gestes qui DÉRIVENT du journal se diffèrent.** File
persistée PAR POSTE (`mnd_stock_attente`, jamais synchronisée), rejouée dès que
`stock_mouvements` et `stock_produits` sont prêtes — même après fermeture de
l'onglet :

- `retirerParReferences` retire ce qu'il voit ET repasse après la lecture — le
  serveur peut porter des mouvements sous ces références que le cache ignorait ;
- `consommerPourRituel` se diffère en bloc : son idempotence ne se vérifie pas
  contre un journal froid, écrire quand même doublerait la sortie ;
- `venteGamme` sans fiche en cache se diffère et rend VRAI — la Caisse n'écrit
  plus l'ancien compteur que le miroir aurait effacé ; le repli d'une Gamme
  jamais reprise se rejoue au même endroit ;
- `ajusterStock` (une CIBLE) garde la quantité constatée et écrit l'écart après
  la lecture — un écart contre un journal à moitié relu serait faux.

**Limite honnête :** les harnais tournent SANS backend (`tablePrete` y est
toujours vrai) — les chemins froids ne sont pas couverts par les 63 + 42
vérifications ; ils sont courts et repassent tous par les primitives testées.

## La saisie au fil de l'eau a sa liste — 10 août 2026

`supabase/audit_saisie_stock_lab.sql` — lecture seule, relançable, à lancer
avec un compte du personnel. Quatre listes : les compteurs de saisie · les
ingrédients des formules maîtres À RELIER (tant que non liés, ils sont réputés
disponibles et la fabrication ne décompte rien) · les services travaillés sur
90 jours SANS recette, les plus fréquents d'abord — l'ordre de saisie qui
rapporte le plus vite · les fiches sans prix d'achat ou sans fournisseur. La
saisie elle-même se fait à l'écran : Stock & Achats → Inventaire / Recettes,
Laboratoire → La réserve.

La section ④ lancée le 10 août a rendu **17 fiches revente** (toute la Gamme
reprise — trace normale de la bascule) sans prix d'achat ni fournisseur. Pour
les remplir en une passe : `supabase/import_prix_achats.sql`, fichier LOCAL et
GITIGNORÉ (il porte la marge de la Maison) — aperçu en étape 1, écriture
relançable en étape 2, fournisseurs créés au passage, et un prix déjà en base
ne s'écrase jamais par un 0. Doublon probable à trancher AVANT la saisie :
`Vapo Hydra Mist 1` / `2` / `350 ml`, trois fiches pour ce qui n'est peut-être
qu'un produit.

## Refonte UX validée — le tableau de bord est FAIT (10 août 2026)

Revue des deux interfaces + maquettes avant/après validées par Yéman
(artifact « MND — Maquettes avant / après »). Ordre convenu : ① tableau de
bord honnête → ② recherche globale → ③ menu à deux étages + posture mobile
de l'équipe (barre 4 gestes) → ④ accueil Ma Couronne (prénom vrai, prochaine
séance prédite + réserver, Cercle en chiffres, bilan de séance, reco réparée).

**① FAIT :**
- **Comparaisons À JOUR ÉGAL** : le mois précédent se borne au même jour
  (« ▲ 12 % vs 10 juillet · à jour égal »), fini le « ▼ 91 % » d'un mois
  entamé contre un mois plein. Dépenses à 0 → « rien de saisi ce mois » ;
  net sans dépense → « = revenus » — jamais un pourcentage fictif.
- **Une tuile par vérité** : la tuile « Revenu mois » (doublon) est retirée ;
  « RDV aujourd'hui » vit dans le titre du carnet ; « Têtes couronnées » sous
  le graphe 7 jours.
- **« Ce qui presse »** remplace la tuile « Alertes stock ». **Refondu le
  11 août à la demande de Yéman : LE RÉASSORT EN EST SORTI.** Il occupait
  jusqu'à quatre lignes sur cinq et repoussait l'argent en bas de la carte,
  alors qu'un manque de flacons se voit au comptoir et se traite dans Stock &
  Achats. Le panneau ne garde que ce qui presse le matin — **anniversaires
  sous 2 jours (12 août : une ligne par tête déjà venue, vœu WhatsApp prêt à
  partir, juge partagé `joursAvantAnniversaire` avec le badge de la liste
  des Clientes) · factures à régler · bilans à remettre · impayés échus** :
  · les FACTURES sont les pièces `envoyée`, **moins celles déjà comptées dans
    les impayés échus** (la même somme lue deux fois ferait croire à une dette
    double) ;
  · les BILANS sont les rituels honorés des 30 DERNIERS JOURS sans bilan
    portant leur `apptId` — au-delà le bilan a perdu son sens, et une liste
    sans fin ne se traite jamais ;
  · les impayés échus descendent, comme avant, à la section qui les encaisse.
  Le calcul `stockAlerts` (et `useProducts` avec lui) est retiré du tableau de
  bord : il ne servait plus qu'à lui.
- **L'état vide du carnet PROPOSE** : « N couronnes ont dépassé leur cadence —
  Voir les relances ». Le juge de cadence est extrait dans
  `clients/_shared.tsx` (`predictNextVisit`) — la fiche ET le tableau de bord
  lisent le même ; deux copies auraient fini par dire deux dates.
- **« Points cercle » de la fiche cliente** ne paraît que si `pointsEnabled`
  est allumé — un zéro d'un programme éteint se lit comme une panne.

**Décisions de Yéman à retenir :** le seuil du Cercle à 7 est un CHOIX D'ESSAI
(réglage, pas une erreur) ; des NIVEAUX d'appartenance au Cercle viendront
plus tard (chantier futur, rien à coder aujourd'hui). La reco de Ma Couronne
désigne bien une fiche d'inventaire (« Cheveux naturels ») — à re-désigner à
la Régie vers une prestation réelle au moment du chantier ④, pas avant.
À corriger en DONNÉES : le prénom du staff « Yeman » sans accent (Personnel &
paie → Équipe) — c'est lui que salue le tableau de bord.

**② FAIT — « Trouver », la recherche globale** (`shell/Trouver.tsx`) :
- Ctrl K (ou le bouton topbar — loupe seule au téléphone) depuis n'importe quel
  écran ; palette au clavier (flèches, Entrée, Échap), cinq résultats par
  groupe : Clientes · Factures & devis · Prestations · Écrans.
- **Les accès sont respectés groupe par groupe** — les MÊMES juges que la
  barre (`peutVoir`) et que les montants (`voitLesPrix`) : un maître sans
  domaine ouvert ne voit ni clientes, ni factures, ni prix. Chercher n'est
  pas une porte dérobée (et la vraie barrière reste la RLS).
- Accents et casse aplatis (« Aicha » trouve Aïcha), téléphone dès 4 chiffres ;
  les écrans hors menu (Comptoir) se retrouvent — joignables sans être affichés.
- **`?id=` ouvre la fiche à l'arrivée** : appris à Clientes (patron Factures),
  et les DEUX écrans réagissent désormais au changement du paramètre — chercher
  une pièce quand on est déjà sur Factures l'ouvre aussi (la lecture unique à
  l'état initial l'ignorait).
- Prestations : atterrissage sur le Catalogue (pas d'ouverture ciblée — l'écran
  ne lit pas de paramètre ; à faire si le besoin se sent).

**③ FAIT — le menu à deux étages + la posture mobile de l'équipe :**
- **« Le quotidien »** (Tableau de bord, Calendrier, Caisse, Clientes,
  Factures) toujours déplié ; les autres groupes REPLIÉS, mémorisés PAR POSTE
  (`mnd_trone_menu_deplie`, jamais synchronisé — l'habitude d'un écran n'est
  pas une donnée de la Maison). Le groupe de l'écran ouvert se déplie seul :
  arriver par Trouver ne cache pas où l'on est. Un menu déjà court (un
  maître : deux écrans) se rend À PLAT — le pli ne s'impose que s'il fait
  gagner quelque chose (seuil : > 8 entrées visibles).
- **`BarreEquipe`** (shell) : rôle `maitre` + téléphone (≤ 900 px) → barre
  basse de grandes cibles — Mon mois · Calendrier · Pointer · Caisse (si le
  domaine est ouvert). « Pointer » mène à la carte Aujourd'hui de Mon mois
  (`?pointer=1`, défilement, paramètre retiré de l'adresse comme le `code`).
  Le gérant garde sa barre latérale, même en mobilité.

**④ FAIT — l'accueil de Ma Couronne** (Tabs.tsx, HomeTab) :
- **Le prénom vrai, jamais un login** : un prénom ne porte ni chiffre ni
  arobase — « Yemanboya1 » rend « Bonjour. » tout court, sobre vaut mieux que
  faux. (Le vrai remède reste la fiche : son nom au CRM est le login.)
- **La séance prédite quand rien n'est pris** : « ≈ vendredi 28 août — d'après
  votre rythme, toutes les ~5 semaines · à confirmer ensemble » + « Réserver ce
  rituel » pré-rempli du dernier rituel honoré. LE JUGE A DÉMÉNAGÉ dans
  `shared/cadence.ts` (une vérité pour les trois écrans : fiche Trône, tableau
  de bord, accueil Couronne) — `trone/clients/_shared` ne fait que ré-exporter.
  Sous RLS la cliente ne voit que SES rendez-vous : c'est ce que la cadence
  regarde.
- **Le Cercle en chiffres** : « 5 passages sur 7 », un point cuivre par venue
  (barre conservée au-delà de dix points), et la phrase du reste. Plus de barre
  muette contre un seuil abstrait.
- **La reco n'invente plus** : l'ancien bloc repliait sur `products[0]` — le
  premier flacon de la Gamme (« Cheveux naturels ») se présentait en
  recommandation de la maison. Désormais : une PRESTATION désignée par le juge
  du quiz (`shared/reco.ts`, envie de la fiche + offre au calibre), au prix
  personnalisé, flèche = réserver ; le produit PRESCRIT sur la fiche
  (`recoProductId`) garde sa carte « Du Carnet de Suivi » ; sans désignation,
  RIEN. La carte ne paraît donc que si l'envie est connue (quiz répondu) et
  qu'une prestation est désignée (persona ou Régie).
- Non fait, assumé : la carte « dernier bilan de séance » attend un vrai
  registre des bilans remis (aujourd'hui le bilan est un lien généré au
  comptoir, rien n'atteste sa remise) — chantier données/produit, pas un
  affichage à inventer.

**LA REFONTE VALIDÉE EST COMPLÈTE (①②③④)** — publiée le 10 août (`4b06f34`).
Restent au fil de l'eau : renommer « Yeman » → « Yéman » (Personnel), désigner
les recos à la Régie, dates de naissance des 7 têtes.

**P1 RECHERCHE — LA CAISSE AU POUCE, construite le 10 août** (maquette écran 3
validée ; recherche sourcée dans l'artifact « MND — Recherche UX & direction ») :
- **Le total ancré en zone du pouce** (`trv-totalbar`, téléphone seul — sous
  1 100 px le ticket passait SOUS tout le catalogue) : net + remises déduites
  + moyen retenu + Encaisser (mêmes gardes que le bouton du ticket). Cohabite
  avec la barre de l'équipe (posée au-dessus quand `tr-shell--barre`).
- **« Les gestes de la maison »** : les ≤ 6 prestations les plus travaillées
  (carnet, 90 jours, hors annulés) épinglées en tête de l'offre ; n'apparaît
  qu'à partir de 3 candidates. Le catalogue se REPLIE alors par défaut, une
  fois, à l'arrivée (« Tout déplier » le rouvre).
- **Cibles au pouce** : − / + à 44 px (avant : ~4 mm), pills et chips de
  longueur majorées (`pointer: coarse` ou ≤ 1 100 px). Bureau inchangé.
- **La remise se replie dans la ligne** (au téléphone) : toucher la ligne
  ouvre les chips ; la remise active se lit dans la légende (« · remise
  −5 % ») ; la barre ancrée dit « remises −N F ». Bureau : chips visibles,
  comme avant.
- **La paire dangereuse du carnet du jour séparée** (Dashboard) : Honorer
  (état, indigo) d'abord, Encaisser (argent, cuivre) ferme la ligne à l'écart,
  cibles majorées.

La Caisse au pouce est PUBLIÉE le 10 août (`f97b5e1`, trone seul — rien de
partagé). **Maquette du tunnel FAITE** (écran 4 de l'artifact maquettes, soir
du 10 août) : récapitulatif persistant en barre indigo (prestations + durée +
total, « Continuer » dedans), 5–10 choix par écran, « Avec Brice — comme à
votre dernier passage » (SEULE mécanique nouvelle — aujourd'hui la maîtresse
découle de la prestation ; À VALIDER), acompte qui dit son pourquoi. Déjà
conforme, validé par la recherche : la progression « 2/6 », les prix
personnalisés dès le choix, le quiz contournable. **VALIDÉE puis CONSTRUITE le
10 août au soir — SANS le repère ③** (décision de Yéman : les mains sont
l'affaire de la maison — la cliente ne choisit NI ne voit qui officie). Fait :
- **BOGUE TROUVÉ ET CORRIGÉ en construisant** : le bouton d'objectif ne posait
  jamais `setCatId` — qui n'arrivait ni du quiz ni d'une offre pré-remplie
  tombait sur une liste de prestations VIDE. La réservation « Voir les
  rituels » n'a probablement jamais marché pour ce chemin.
- **La maîtresse retirée PARTOUT du tunnel** (7 mentions : cartes, créneaux,
  récapitulatif, confirmation, calendrier ICS). Le RDV, lui, porte toujours
  son maître côté Trône — rien ne change au Calendrier ni aux mains.
- **La barre-récap est indigo, COLLANTE, et suit la cliente** : prestations,
  durée, total (« Prix en salon » si masqué), « Continuer » cuivre dedans ;
  variante info (sans bouton) au créneau.
- **Poignées de choix** : au-delà de dix prestations, huit d'abord + « Voir
  les N autres » ; description sur UNE ligne (clamp CSS).
- **L'acompte dit son pourquoi** : « Il tient votre créneau — et se déduit le
  jour même. » (masqué si prix au salon ou règlement intégral).

## Le registre des bilans de séance — construit le 10 août au soir, 0035 PASSÉE

Le bilan n'était qu'une PAPETERIE (`bilan.html`) : pré-rempli par l'URL,
imprimé, oublié — aucun registre, rien à relire, rien pour Ma Couronne.
Désormais :

- **`supabase/migrations/0035_bilans.sql` — PASSÉE le 10 août au soir**
  (contrôle : `bilans · 0 lignes`). Ne pas relancer. RLS : personnel tout,
  la cliente LIT les siens (`clientId = auth.uid()`, patron des factures).
  Realtime inclus. Les deux sites publiés dans la foulée (`f8982cd`).
- **`shared/bilans.ts`** : le modèle (jauges, points clés, les Quatre Temps,
  prochaine visite), série ancrée `MND-BS-AAAA-NNNN`, `remettreBilan`,
  `dernierBilanDe`.
- **Le Trône** : la fiche cliente ouvre `BilanModal` — rédiger (pré-rempli du
  bilan PRÉCÉDENT : la couronne s'évalue dans la continuité), « Remettre »
  ENREGISTRE, « Imprimer / PDF » ouvre la papeterie qui porte exactement le
  contenu remis (nouveau param `b` de bilan.html — un lien abîmé retombe sur
  les semences). Le bouton dit la date du dernier remis.
- **Ma Couronne** : carte « Votre dernier bilan » sur l'accueil (repère 4 de
  la maquette, enfin allumé) + lecteur en surimpression (jauges, points,
  Quatre Temps, prochaine visite, signature). RLS : elle ne lit que les siens.

## La modale RDV simplifiée — 10 août au soir (`cdaaa58`)

Retour d'écran de Yéman : forfait, remise % et remise manuelle s'empilaient
comme trois réglages CUMULABLES — alors qu'un forfait EFFACE les remises
(règle du 8 août) — et le « rituel offert » s'étalait à chaque RDV pour un
cas d'exception. Corrigé dans `RdvModal` (clients/_shared) :
- **« Le prix » : UN choix, trois modes exclusifs** — Prix plein / Remise /
  Forfait. Choisir Forfait remet les remises à zéro ; Remise regroupe le % et
  les francs (cumulables entre eux, comme avant). Aucune donnée ne change de
  forme — `discountPct`/`discountXof`/`forfait` restent tels quels.
- **L'offert derrière un interrupteur** : décoché par défaut, décocher vide
  le champ. La règle payeuse/parcours ne bouge pas.

**Même cure à l'ENCAISSEMENT** (`PayAppointmentModal`, publié `686a34e`) :
- Le forfait n'encadre plus chaque encaissement — une ligne à cocher, le
  détail au geste ; le bandeau « la composition a bougé » reste.
- **Les deux dates se replient en une ligne** (« Facture au 20 août · argent
  entré le 10 août — Modifier ») : justes par défaut (jour du rituel /
  aujourd'hui), elles ne s'ouvrent que si on les change. La règle — c'est le
  PAIEMENT qui range le mois — tient en une phrase, dans le champ ouvert.

## La fiche née sur une branche fantôme — trouvé et corrigé le 10 août au soir

Premier vrai test d'inscription (Valerie Ahouansou, yemanboya2@) : la fiche et
sa déclaration d'enfant n'apparaissaient PAS au Trône. Cause :
`ensureClient` (couronne/lib) posait `branchesStore.get()[0]?.id ?? 'maison'` —
sur un téléphone PAS ENCORE HYDRATÉ, c'est la branche par défaut du code, pas
« L'atelier MND ». Le Trône filtre par la vraie : lignes en base, invisibles.
La déclaration d'enfant héritait du même branchId (celui du parent).

Corrigé :
- `useEnsureClient` ATTEND la première lecture des branches
  (`tablePrete('branches')`) avant de créer la fiche — plus jamais de branche
  devinée ; et une fiche existante dont la branche est INCONNUE du référentiel
  se réaligne d'elle-même sur la première branche réelle.
- **La saga de la branche fantôme — RÉSOLUE le 10 août au soir (v4).**
  `branches` portait DEUX lignes : la vraie et la semence du code (« maison »,
  résidu du 8 août) ; les fiches du froid s'y rangeaient. Quatre scripts pour
  en venir à bout, chaque échec ayant sa leçon :
  ① `repare_branches_orphelines` : 0·0 = FAUX CALME (la fantôme « existait »,
  son prédicat ne la voyait pas) ; ② v2 : rapport en RAISE NOTICE — invisibles
  dans l'éditeur Supabase, TOUJOURS rapporter en lignes de résultat ; ③ v3 :
  collision de clé sur `staff_branches` (le souverain déjà lié à la vraie
  branche) qui ANNULAIT toute la transaction — les « réussites » des rapports
  précédents n'avaient jamais été commitées ; ④ v4 : le vrai gardien était
  **`clients_protege_tarif`**, un DÉCLENCHEUR serveur qui réimposait les
  champs sensibles à tout écrivain non-staff — et `auth.uid()` est VIDE dans
  l'éditeur SQL, donc les réparations elles-mêmes étaient « suspectes ».
  L'éditeur n'affiche que le DERNIER résultat d'un script — une requête de
  diagnostic à la fois.

**⚠ TROIS DÉCLENCHEURS SERVEUR VIVENT HORS DES MIGRATIONS DU DÉPÔT** (posés
via l'assistant Supabase, découverts à la dure) :
- `clients_protege_tarif` (clients) — réimpose les champs sensibles (locks,
  coef…) aux écrivains non-staff. **DÉTACHÉ par la v4** pour libérer les
  fiches ; À RÉARMER corrigé (0037 : `auth.uid() is null` = confiance) — la
  fonction existe encore, seul le déclencheur est tombé.
- `avoir_solde_suffisant` (credit_movements) — refuse un usage d'avoir
  au-delà du solde. À GARDER.
- `invoice_trace_modif` (invoices) — trace toute modification d'une facture
  PAYÉE dans `invoice_audit` (table hors patron : pas de colonne `data`).
  À GARDER. Les scripts génériques qui balaient « toutes les tables à
  branch_id » doivent compter seulement, jamais écrire, sur les tables hors
  patron.

Rappel d'écran : la file des enfants déclarés vit sur CLIENTES (bouton
« Enfants déclarés », visible quand il y en a en attente) — c'est là que Keli
apparaîtra après la réparation.

## LE PARTAGE PORTE SUR LE BÉNÉFICE, PAS SUR L'ENCAISSÉ — 11 août

**Décision de Yéman, et c'est une correction de fond.** Le premier modèle
répartissait le REVENU en quatre enveloppes, dont une « Charges Salon » qui
n'était qu'un BUDGET : on partageait un argent dont une part était déjà partie
payer le loyer et les salaires. En août, les charges réelles (230 000 F)
dépassaient de trois fois leur enveloppe (75 000 F) — le foyer se voyait
promettre 65 625 F que le salon n'avait pas.

**Désormais : charges réelles d'abord, le RESTE se partage en trois** —
Réinvestissement · Réserve fiscale · Prélèvement, somme = 100.

- **Une perte ne se partage pas** : bénéfice ≤ 0 → les trois enveloppes valent
  ZÉRO, jamais un négatif. L'écran le dit en toutes lettres, ajoute que tout
  retrait du mois devient alors un PRÊT, et — si le mois est EN COURS —
  rappelle que des charges déjà réglées pèsent contre un revenu encore partiel.
- **`pctCharges` survit comme REPÈRE**, plus comme enveloppe : il ne prend rien
  au partage et sert à dire « vos charges pèsent 123 % du revenu, repère 40 % »
  (`poidsDesCharges`, `null` sans revenu — pas un infini trompeur).
- **Les règles d'avant se renormalisent** (`partageNormalise`) : 40·15·10·35
  laisse trois parts qui ne font que 60 ; les lire telles quelles amputerait le
  partage d'un tiers EN SILENCE. Ramenées à 100 en gardant les proportions
  (25·17·58), le prélèvement prenant le reste — comme pour les francs.
- **L'écran montre la cascade** : revenu encaissé → − charges réelles →
  = bénéfice → les trois parts. Les enveloppes sans leur origine laissaient
  croire qu'elles se prenaient sur l'encaissé.
- Nouveaux défauts : 20 · 20 · 60 sur le bénéfice, repère de charges 45 %.
- Harnais : 41 vérifications, dont « un bénéfice négatif rend trois zéros ».

## Salon & Foyer — construit le 10 août au soir, 0038 PASSÉE

Le module de séparation entreprise / foyer (spec `MND_Modele_Finances_SPEC.md`
de Yéman — le classeur Excel transposé). Quatre décisions prises à l'écran :
Partage sur les **encaissements réels** · module **réservé au souverain** ·
**Dépenses réutilisé** comme Charges Salon · départ à **45 · 10 · 10 · 35**.

- **`shared/foyer.ts`** — la règle du Partage (4 enveloppes, validée à 100 %,
  une par branche), l'annexe Prélèvements, les Prêts associés, les Réserves
  (réinvestissement · fiscale), et DEUX CAISSES ÉTANCHES (Succession, Devises
  multi-devises à contre-valeur indicative). L'étanchéité est structurelle :
  aucun autre écran n'importe ces tables.
- **Le revenu du Partage** = les encaissements du mois (mêmes sources que
  l'écran Encaissements, à l'identique) **HORS pourboires**
  (`revenuPartageDuMois` écarte les lignes `kind: 'pourboire'` du registre —
  depuis le 11 août le pourboire a SA ligne, voir « Le pourboire a sa caisse » ;
  l'ancienne soustraction de `tipXof` l'aurait retiré deux fois) — l'argent des
  maîtres ne se partage pas. Les charges du mois = le registre Dépenses
  (récurrentes comprises, même règle que Synthèse). **Bénéfice réel =
  revenu − charges salon** ; le prélèvement N'EST PAS une charge.
- **Rien ne s'écrit tout seul** (doctrine des primes) : les enveloppes se
  CALCULENT, la dotation des réserves et la conversion d'un dépassement en
  prêt s'INSCRIVENT d'un geste — identifiants déterministes
  (`dot-<env>-<mois>`, `pret-dep-<mois>`), donc idempotents.
- **Écran `/salon-foyer`** (Finances → Salon & Foyer), six onglets : Le mois ·
  Prélèvements · Prêts associés · Réserves · Caisses indépendantes · La règle.
  **Réservé au souverain** : `ROUTES_SOUVERAIN` dans `peutVoir` (garde d'écran,
  barre + Trouver) ET RLS `is_souverain()` (la vraie barrière). Pour un gérant,
  l'hydratation rend zéro ligne en silence — pastille verte, écran absent.
- **`0038_salon_foyer.sql` — PASSÉE le 10 août au soir** (contrôle : 6 tables,
  0 ligne). Ne pas la relancer. **Le numéro 0037 reste RÉSERVÉ au réarmement
  de `clients_protege_tarif`.**
- **PUBLIÉ le 11 août** (trone seul — la Couronne n'importe rien du module).
  L'entrée du menu ne paraît qu'au compte SOUVERAIN, dans le groupe Finances
  (replié par défaut).
- **Les quatre enveloppes se DÉFINISSENT à l'écran** (11 août) : leurs phrases
  étaient figées dans le code, or le « Divers » d'une maison n'est pas celui
  d'une autre, et une enveloppe dont personne n'a écrit le contenu finit par
  tout accueillir. `PartageConfig.dits` les porte, par branche ; un champ vidé
  retombe sur la phrase de départ (`PARTAGE_DITS`) — jamais de définition
  muette. Deux boutons distincts, et c'est voulu : changer un pourcentage est
  un acte financier, renommer une enveloppe n'en est pas un ; chacun préserve
  ce que l'autre a écrit. La définition se relit au SURVOL de l'enveloppe dans
  « Le mois », là où l'argent se regarde.
- Harnais : `node scripts/verifie-foyer.mjs` — 24 vérifications (répartition
  sans reste d'arrondi, pourboires retirés, dette jamais négative, caisses par
  branche et par devise). Typecheck 0 erreur.
- Pas de nouvelles catégories de dépenses : la nomenclature existante couvre
  le modèle (Loyer → Local, Produits & Stock → Matières premières…) — l'onglet
  « La règle » l'explique à l'écran. Les retraits du foyer ne se saisissent
  PLUS JAMAIS en dépense : ils vivent dans l'annexe.

### L'ÉPARGNE VIT AU COFFRE-FORT, EN UNE SEULE ÉTAPE — 11 août, 0040 et 0041 PASSÉES

**La Maison a eu DEUX registres d'épargne pendant une demi-journée** : le
Coffre-fort (0009 — épargne verrouillée, seule sortie un virement bancaire) et
une table de réserves propre au Partage (0038), reliées par un virement (0040).
Trois gestes pour une seule décision — inscrire, verser, relire à deux
endroits — et trois gestes pour une décision finissent par ne pas être faits.

**Les deux enveloppes ne sont donc plus un registre : ce sont une ÉTIQUETTE sur
les lignes du coffre** (`origine: 'reserve'` + `enveloppe`). Mettre de côté,
c'est déposer au coffre : l'argent est à l'abri au moment même où on décide de
l'épargner. « Les Réserves » ne sont plus qu'une LECTURE du coffre.

- **`0041_epargne_au_coffre.sql` — PASSÉE le 11 août** (contrôle : 0 partout,
  rien n'avait encore été inscrit — bascule sans risque). Sa reprise garde les
  identifiants tels quels : une dotation porte déjà `dot-<enveloppe>-<mois>`,
  la clé que l'écran recalcule. `reserves_mouvements` **n'est plus liée au
  code** mais reste en base comme retour en arrière.
- **Un seul geste** : « Mettre au coffre » écrit la dotation du mois
  directement au coffre. Réinscrire le même mois AJUSTE la ligne au lieu d'en
  créer une seconde (identifiant déterministe).
- **Un retrait est un VIREMENT** — la seule sortie que le coffre autorise — et
  **on ne retire jamais plus que l'enveloppe ne porte** ; le refus est motivé
  à l'écran, rien n'est écrit.
- **Supprimer une dotation dont une part a déjà été retirée laisse l'enveloppe
  NÉGATIVE, et c'est voulu** : un négatif dit « il manque tant », un zéro le
  cacherait. Même doctrine que le stock.
- Les lignes ORDINAIRES du coffre (mises de côté au comptoir) restent hors des
  enveloppes : le harnais le vérifie explicitement.
- **`0040_coffre_reserves_souverain.sql` — PASSÉE le 11 août** (contrôle :
  26 lignes ordinaires conservées, 0 venant des Réserves).
  `coffre_movements` est lisible par
  tout le personnel ayant Finances (0009), or l'épargne du Partage est
  l'affaire du couple. La politique ne ferme QUE les lignes
  `data->>'origine' = 'reserve'` — le reste du coffre ne bouge pas. Le
  `with check` porte la même règle : sans lui, un compte non souverain
  écrirait une ligne qu'il ne peut pas relire, et elle disparaîtrait sous ses
  yeux à la synchronisation suivante.
- **Conséquence assumée** : le solde du coffre affiché à un GÉRANT est plus bas
  que celui du souverain — il ne voit pas ces lignes. Ce n'est pas une panne,
  c'est la portée de son regard ; l'écran Salon & Foyer le dit au souverain,
  seul à pouvoir agir dessus.
- Harnais : 41 vérifications (`node scripts/verifie-foyer.mjs`), dont
  « réinscrire le même mois ajuste au lieu de doubler » et « la ligne ordinaire
  du coffre reste HORS des enveloppes ».

### Les caisses indépendantes sont un REGISTRE — 11 août, 0039 PASSÉE

0038 posait DEUX caisses écrites en dur (Succession, Devises). Limite
arbitraire : une maison tient une caisse par héritage, par projet, par
monnaie. Une caisse se crée, se nomme, porte sa devise et emporte son
registre — `caisses_indep` + `caisses_indep_mouvements` (`shared/foyer.ts`).

- **`0039_caisses_independantes.sql` — PASSÉE le 11 août**, puis publié dans
  la foulée. Contrôle : 0 · 0 · 0 · 0 — **les deux anciennes caisses n'avaient
  jamais servi**, il n'y avait rien à reprendre. Ne pas la relancer. La reprise
  reste incluse et idempotente (`cxi-…`, `cxim-…`) si un jour elle sert :
  une caisse Devises qui porterait plusieurs monnaies **se scinde en une
  caisse par devise** — un solde ne se compte que dans sa propre monnaie.
- **`caisse_succession` et `caisse_devises` NE SONT PAS SUPPRIMÉES** : elles
  sont le retour en arrière (patron des `repli_0023_`). Plus liées au code.
- **La devise se FIGE au premier mouvement** — la changer ensuite relirait des
  billets d'une monnaie dans une autre. Le sélecteur se désactive de lui-même.
- **Une caisse ne se supprime que VIDE** : on ne ferme pas une caisse sur son
  registre. Le solde s'arrondit à 2 décimales (les centimes d'une caisse en
  euros ne doivent pas dériver).
- L'étanchéité reste STRUCTURELLE : aucun autre écran n'importe ces magasins.
- Harnais : 29 vérifications (`node scripts/verifie-foyer.mjs`), dont « une
  caisse ne voit QUE ses mouvements ».

### La reprise du passé — FAITE le 11 août, 99 lignes

L'ancien ERP séparait déjà le foyer sous une rubrique **« 8. Dépenses foyer »**
— mais dans le registre des DÉPENSES, donc en charges du salon : le bénéfice
réel était sous-estimé d'autant, tous les mois. Ces lignes sont devenues des
prélèvements, à leur date d'origine, par
`supabase/local_reprise_depenses_foyer.sql` (LOCAL et GITIGNORÉ — il porte les
dépenses privées de la Maison ; **les montants et libellés du foyer restent
dans ce fichier, jamais dans le dépôt public**).

- **99 lignes, oct. 2025 → juil. 2026 — verdict ÉQUILIBRÉ** (99 sauvegardées,
  99 créées, 99 retirées). Identifiants `plv-rep-<idDépense>`, patron des
  `inv-rep-` de 0018. **Ne pas relancer.**
- **AUCUNE dette créée, et c'est un principe** : la règle du Partage n'existait
  pas sur cette période — convertir ces dépassements en prêts inventerait une
  dette que personne n'a contractée. La dette part de zéro en août 2026. Les
  mois repris AFFICHENT un dépassement en rouge : c'est un constat, pas une
  créance.
- **Table de secours `repli_reprise_foyer`** — le seul retour en arrière, avec
  le bloc de rollback en fin de script. Ne pas la supprimer avant d'avoir vécu
  quelques jours avec le nouveau registre (même règle que les `repli_0023_`).
- **Le motif est DÉDUIT du libellé**, par un dictionnaire écrit sur les vrais
  libellés de la Maison et qui n'existe qu'à UN endroit (l'étape 2 du script) —
  deux copies auraient divergé. Le libellé d'origine est conservé mot pour mot
  dans la note du retrait : chaque ligne remonte à sa source.
- **Aucune récurrente parmi les 99** — vérifié avant d'écrire. Une récurrente
  pèse sur chaque mois qu'elle traverse ; reprise en une ligne datée, elle
  aurait allégé les mois passés de plus que son montant facial.
- **TOUT SE CORRIGE EN PLACE dans Salon & Foyer** (11 août) : les retraits du
  foyer, les mouvements d'une caisse indépendante (taux compris, avec la
  contre-valeur qui se recalcule pendant la saisie), les lignes de Prêts
  associés (la dette cumulée se refait d'elle-même) et celles du registre de
  l'épargne. Ces dernières VIVENT AU COFFRE-FORT : les corriger ici les corrige
  là-bas, ce que l'écran dit.
  **Piège refermé au passage :** `dotationDuMois` vérifie désormais
  l'ENVELOPPE en plus de l'identifiant. Une dotation dont on change l'enveloppe
  à la main garde son id (`dot-<env>-<mois>`) ; s'en tenir à l'id faisait dire
  « dotation inscrite » pour une enveloppe qui ne la portait plus, pendant que
  le solde la comptait ailleurs.
- **Chaque retrait se CORRIGE en place** (11 août) — date, bénéficiaire,
  motif, note, montant. Une ligne fausse qu'on ne peut que supprimer pousse à
  effacer puis ressaisir, et l'on y perd la date, le motif, parfois la ligne.
  Les 99 reprises portent des motifs DÉDUITS d'un libellé : ce sont les
  premières à devoir se corriger. Les listes déroulantes n'AVALENT jamais la
  valeur affichée (`avecCourant`) — un motif venu d'ailleurs rendrait le champ
  vide, et enregistrer effacerait ce qu'on n'avait pas voulu toucher.
  Changer la date pour un autre mois déplace le retrait — et son budget.
- **Reste ouvert : 70 lignes SANS catégorie** dans `expenses` — elles mélangent
  salon et foyer et ne se déduisent pas (« Carburant Honda » peut être la moto
  de course ou un plein personnel). La requête qui les liste est en fin de
  script, commentée. C'est un tri à l'œil, par le souverain.

## CNSS et ITS s'éteignent, chacun de son côté — 11 août

Les employés de la Maison ne sont pas encore déclarés : retenir une cotisation
qu'aucune caisse ne reçoit ferait annoncer au bulletin un net INFÉRIEUR à ce
que l'employé touche vraiment. `PayrollParameters.cnssActive` (Personnel &
paie → Barèmes) éteint la cotisation ; publié le 11 août.

- **ABSENT = ALLUMÉE.** Une cotisation ne doit jamais disparaître par l'effet
  d'un champ manquant : seul `false` l'éteint. Même doctrine que
  `quizCouronne` (absent = l'état dans lequel la chose est née).
- **Les DEUX parts tombent ensemble** — salariale ET patronale : on ne déclare
  pas à moitié, et un coût employeur gonflé fausserait une décision d'embauche.
- **DEUX INTERRUPTEURS, PAS UN.** `itsActive` éteint l'ITS séparément (les
  employés n'y sont pas assujettis non plus, 11 août). L'ITS est un IMPÔT, la
  CNSS une COTISATION : un interrupteur commun ferait tomber l'un en croyant
  éteindre l'autre. Le harnais garde ce mur explicitement — éteindre la CNSS
  laisse l'ITS dû, et l'inverse.
- **Le bulletin DIT ce qui n'a pas été appliqué** (« suspendu — non appliqué »,
  « suspendue — non appliquée ») : un zéro sans explication se lit comme un
  oubli, et l'employé doit pouvoir vérifier son net.
- **Les taux restent saisis** : l'interrupteur les conserve intacts (grisés),
  les rallumer les retrouve. Mettre les taux à zéro aurait perdu des chiffres
  qu'il aurait fallu retrouver le jour de la déclaration.
- **LE PIÈGE, refermé : `bulletin.html` REFAIT le calcul de son côté** — il
  portait ses 3,6 % ET son propre barème ITS en dur, si bien que le bulletin
  imprimé aurait annoncé un autre net que le run, à un employé qui a reçu
  autre chose. Les deux voyagent désormais dans l'adresse (`&cnss=…&its=0|1`,
  `BulletinLink.cnssPct` / `itsActif`), et le taux se teste en `!= null` — pas
  `if (x)` — parce que **zéro est précisément la valeur à transmettre**. La
  page met aussi la charge patronale à zéro quand le taux salarial est nul.
- Harnais NOUVEAU : `node scripts/verifie-paie.mjs` — 28 vérifications (il
  n'en existait aucun pour la paie).

### « Enregistrer » ne doit JAMAIS refuser en silence — 11 août

**Le bouton de la modale Dépenses était réellement cassé**, et pour une raison
qu'aucun message ne disait : `save()` renvoyait sans rien faire dès qu'un champ
manquait — et il exigeait une CAISSE. Or la branche n'en a aucune de déclarée :
la section « Payer depuis quelle caisse » était VIDE, il n'y avait donc rien à
choisir, et **la dépense ne pouvait pas être enregistrée du tout**. On croyait
le bouton mort. Trouvé sur les salaires d'août (charge écrite avec
`cashbox: ''` par le run de paie).

- **La caisse devient FACULTATIVE** — sans elle la dépense se range sous
  « Autres », ce que `cashboxLabel` sait déjà faire. Une pastille « Sans caisse
  · Autres » l'assume, et un mot le dit quand aucune caisse n'existe.
- **Chaque refus est motivé à l'écran**, à côté du bouton (`saveErr`) :
  bénéficiaire manquant, montant nul, articles qui totalisent zéro.
- **Un enregistrement MUET se lit aussi comme une panne** : « Enregistrer
  l'identité » (fiche cliente) écrivait bien, mais ne disait rien — le bouton
  se grisait, on croyait le clic perdu. Il confirme désormais, brièvement.
- **La leçon, à appliquer partout** : un `return` nu dans un gestionnaire de
  bouton est un bug d'interface, même quand la donnée est bien protégée.

### Les tiroirs de Dépenses mènent à la fiche — 11 août

Les deux modales de détail (le tiroir d'une CATÉGORIE, le relevé d'une CAISSE)
n'étaient que des listes mortes. Or c'est là qu'on repère une ligne fausse :
on y arrive en cherchant « où sont passés ces 230 000 F ». Il fallait refermer,
retrouver la ligne dans le flux, et cliquer Modifier — on perdait le fil.
Chaque ligne de dépense ouvre désormais sa fiche (`openEdit`), la modale se
refermant derrière elle. Dans le relevé d'une caisse, un encaissement mène
toujours à sa FACTURE ; seule une ligne qui ne mène nulle part reste inerte.

### Un run de paie entre enfin dans les DÉPENSES — 11 août

**Un run pouvait être validé, payé, clôturé sans qu'un franc n'apparaisse aux
Dépenses.** La masse salariale sortait de la caisse et le résultat du salon
l'ignorait : le Partage croyait la Maison plus riche qu'elle n'est, exactement
du montant des salaires. Constaté sur le run d'août (230 000 F, clôturé, rien
d'inscrit). Corrigé :

- **Marquer un run « payé » inscrit les charges** (catégorie Salaires, une
  ligne par employé), après une confirmation qui annonce le montant. La charge
  est datée du jour du RÈGLEMENT — c'est ce jour-là que l'argent sort, et le
  Partage raisonne sur l'argent réellement sorti.
- **UNE SEULE CLÉ, `chargeSalaireId(mois, employeeId)` dans `payroll.ts`.** Les
  DEUX chemins l'utilisent — « Confirmer le règlement » (Personnel & paie) et
  le run (Paie) — donc passer par les deux n'écrit qu'une ligne. La formule
  était auparavant recopiée dans Personnel ; deux copies auraient fini par
  diverger, et chaque divergence aurait compté un salaire DEUX FOIS.
- **C'est le NET qui est la dépense** : c'est lui qui quitte la caisse. Les
  cotisations retenues ne deviennent une charge que le jour où elles sont
  versées, par leur propre ligne.
- **Un bandeau dans le run dit l'état** : rien d'inscrit (« ces salaires ne
  comptent nulle part »), inscrit et à jour, ou désynchronisé — avec
  « Inscrire », « Mettre à jour » et « Retirer ». **Il paraît aussi sur un run
  déjà CLÔTURÉ** : c'est ce qui permet de rattraper le passé sans rouvrir un
  run immuable.

**À savoir :** le « Confirmer le règlement » de Personnel & paie n'applique NI
CNSS NI ITS — son net est `salaire + commissions + primes + pourboires −
avances − retenues`. Le run, lui, passe par `computePay` (barèmes compris). Les
deux écrivent la même ligne : le dernier geste fait foi sur le montant.

### LE PRIX FERME PAR CLIENTE ET PAR PRESTATION — 11 août

**Le Juste Prix est un COEFFICIENT, et c'était sa limite** : il multiplie ce
que rend le barème, donc il ne savait pas dire « celle-ci paie 20 000 F, quoi
qu'annonce le catalogue ». Il s'applique en outre à TOUTES ses prestations — le
régler pour caler un seul geste déréglait les autres — et le prix « fixe »
bougeait dès que le catalogue bougeait, puisqu'il n'était que proportionnel.
Une dizaine de clientes de la Maison sont dans ce cas.

- **`Client.prixFixes?: Record<serviceId, number>`** — un montant convenu avec
  ELLE, geste par geste. Porté dans `PersonalPricing` par `pricingOf`, lu par
  `prixFixeDe`.
- **IL PASSE AVANT TOUT** dans `personalPriceXof` : avant le forfait, le
  calibre, le tarif au lock, le plancher, la longueur et le coefficient. Le
  laisser passer après le Juste Prix l'aurait MULTIPLIÉ — le montant écrit sur
  la fiche n'aurait plus été celui qu'elle paie.
- **`prixFerme` le reconnaît** : l'écran ne l'annonce jamais « dès X F » et ne
  réclame plus de montant au fauteuil (`estLibre` dans la modale RDV) — sans
  quoi le comptoir aurait pu en taper un autre et effacer l'accord.
- **`isPersonalized` l'inclut**, et ce point a failli manquer : une cliente
  sans modèle ni coefficient n'était pas « personnalisée », le rendez-vous
  retombait sur le prix CATALOGUE, et l'accord de sa fiche restait lettre morte
  au moment précis de s'appliquer.
- **Zéro et négatif ne sont pas des prix** : un rituel offert se dit « offert »
  sur le rendez-vous, il ne se déguise pas en prix fixe à 0 F — cela ferait
  disparaître le geste de tous les comptes en silence.
- Écran : fiche cliente → Profil → **« Ses prix fermes »** (poser, lire,
  **modifier en place**, retirer). Une prestation retirée du catalogue garde
  son accord et le dit. Les lignes ne s'appuient PAS sur `trf-tally` : la
  classe vit dans finances.css, que les écrans Clientes ne chargent pas — nom
  et prix s'affichaient collés. Le style se porte lui-même (leçon des
  pastilles de la modale RDV).
- **LA MARQUE SE VOIT AVANT TOUT LE RESTE** (11 août, même doctrine que « De
  passage ») : pastille « Prix convenus » dans la LISTE des clientes, badge
  « Prix convenus · N gestes » sur la COUVERTURE de la fiche, et au RENDEZ-VOUS
  le prix s'annonce « 20 000 F · convenu » en cuivre — sans la mention, le
  comptoir lit un montant qui ne colle pas au catalogue et « corrige »,
  c'est-à-dire efface l'accord.
- **Le JUSTE PRIX (coefficient) a les siennes aussi** : « Juste Prix ×0,8 »
  dans la liste, « Juste Prix ×0,8 · tous ses prix » sur la couverture. Les
  deux préférences se distinguent à l'œil : l'une dit UN geste, l'autre dit
  TOUS ses prix. Le coefficient continue de se régler dans Finances → Le
  Juste Prix.
- Harnais NOUVEAU : `node scripts/verifie-prix.mjs` — 15 vérifications (il n'en
  existait aucun pour le moteur tarifaire).

### Six forfaits composés + deux soins — CRÉÉS le 12 août

Politique commerciale (données LOCALES, script gitignoré
`supabase/local_forfaits_composes.sql`, repli `repli_forfaits_sources`) :

- **Deux soins à 15 000 F fixes** : `sv-gbeji-sublimation` (« GBÈJÍ™
  Sublimation · Le Renfort Durable », atelier GBÈJÍ) et `sv-finfin-legere`
  (« FÍNFÍN™ Légère · La Réparation Douce », atelier réparation).
- **Produit** `prod-trousse-mnd` « Trousse MND™ · Kit Home Rituals » 18 000 F
  — stock né à 0, à compter dans Stock & Achats.
- **Six prestations « jamais réservées » transformées en forfaits composés**
  (sources supprimées, ids `sv-forfait-<ancien id>`), échelle premium posée
  par la Maison : combinaisons en GRILLE FIXE ronde (WÈWÈ+DÀNDÀN
  38 500/46 000/51 500 ; YÈKPÈ Couleur+Lumière 37 000/55 000/64 500, durées
  par longueur conservées), cycles 3 mois composition −10 % (Trimestriel
  6 lignes, ×3 8 lignes), Initiation −12 % (4 lignes, trousse comprise),
  Annuel −15 % (25 lignes sur 52 semaines). Les échéances (`afterWeeks`)
  posent les rendez-vous de suite au carnet.
- **LEÇON SQL durement apprise** : un nom du catalogue portait un caractère
  SOSIE (lettre cyrillique dans « Trimestriel ») — ni unaccent ni la chasse
  aux espaces typographiques ne suffisaient. Une réparation de données se
  cloue sur les IDENTIFIANTS ; le nom ne sert qu'au diagnostic (et un garde
  qui échoue doit LISTER les candidats qu'il voit). Ne pas tester
  `branch_id` pour savoir si une ligne existe : il est NULL sur tout le
  catalogue.

### Le POURBOIRE se lit sur la facture — 11 août

Il était ENREGISTRÉ sur la pièce (`Invoice.tipXof`) mais muet partout :
Une cliente remettait 5 000 F et aucun document n'en gardait de trace lisible.
Affiché désormais — détail d'une pièce (écran Factures), PDF de Factures, PDF
du reçu de Caisse — en ligne « Pourboire — merci », cuivre, **SOUS le total et
HORS de lui** : il ne s'y additionne jamais (c'est l'argent des maîtres,
`invoiceTotal` l'exclut, la Synthèse aussi). Les pièces déjà émises l'affichent
rétroactivement : la donnée y était.

### Le POURBOIRE a sa caisse — et les PDF translittèrent le fon — 11 août

Un reçu d'encaissement (Encaissements → Reçu) montrait deux maux. **L'objet en
charabia** (« &K&L&†… ») : un SEUL caractère hors WinAnsi — le Ɔ de KLƆKLƆ™ —
bascule TOUTE la ligne jsPDF en 16 bits. Réglé dans `pdf.ts` (`pdfSafe`,
appliqué à chaque texte de chaque document) : les lettres fon se translittèrent
sur papier (KLƆKLƆ™ s'imprime KLOKLO™ — assumé, la graphie fon vit à l'écran),
les accents flottants se recomposent (ɔ́ → ó), l'inconnu sort en « ? » visible
plutôt qu'en ligne détruite.

**La somme qui bouleversait la caisse** : le registre créditait
`total + pourboire` (45 000) à la caisse de la facture, alors que 40 000 y
entrent et 5 000 vont dans la caisse pourboire de l'équipe. Désormais
(`receipts.ts`) la facture encaisse SON total et le pourboire paraît sur **sa
propre ligne** — nature « Pourboire », caisse « Pourboires », même jour, même
référence, libellé « Pourboire — merci des mains ». Encaissements gagne
l'onglet Pourboires et la carte « Par caisse » montre le bocal ; le reçu d'un
pourboire se numérote **RP-** (sans ce préfixe il portait le même numéro que
celui de la facture — mêmes 6 derniers caractères d'id). Le relevé de caisse
de Dépenses ne compte plus le pourboire et le dit sur la ligne
(« pourboire 5 000 → Pourboires »). Caisse en devise : les billets étrangers
reçus restent entiers (`fx.amount`), on ne découpe pas un billet. Attention
héritée : `revenuPartageDuMois` écarte maintenant les lignes `pourboire` par
leur NATURE — l'ancienne soustraction de `tipXof` aurait retiré le pourboire
DEUX fois (harnais foyer ajusté, tout au vert).

### GBÈJÍ™ FIDÉLITÉ — le forfait à seuil de venues — 11 août

Règle voulue par Yéman : les deux premières venues paient plein tarif ; dès la
3ᵉ, Reprise Essentielle + Shampoing Signature pris ensemble = **−15 %**. TOUS
les calibres (correction en cours de route — d'abord pensé Micro/Nano seuls).

- **`Service.desVenue`** : la prestation s'ouvre à partir de la Nᵉ venue
  honorée (`ouverteDesVenue` : acquises ≥ N−1 ; compteur `venuesHonorees`, le
  même que la marque de passage et le Cercle). Filtré dans la modale RDV ET la
  Caisse ; une vente SANS fiche ne voit jamais une prestation à seuil.
- **`Service.bandIds`** : calibres multiples explicites (gardé au moteur bien
  que ce forfait n'en ait plus besoin) — un modèle INCONNU ne passe pas.
- **L'aperçu du Catalogue dit le prix PAR MODÈLE** (11 août) : composer un
  forfait à remise n'annonçait qu'une fourchette basse-haute, le prix réel
  par calibre se découvrait à la réservation. L'encadré appelle maintenant le
  MOTEUR (`forfaitPriceXof` — le même juge que la modale RDV et Ma Couronne)
  avec une tête type par calibre (plafond de locks, barèmes par atelier
  compris) : pour chaque modèle, la composition barrée puis le prix après
  remise. Produits au prix ferme ajoutés à part (le moteur ne les résout
  pas). Le tableau ne paraît que si une remise est posée ET que les montants
  diffèrent — un prix fixe est le même pour toutes, le récapitulatif suffit.
- **Le forfait est une DONNÉE — CRÉÉ le 11 août** :
  `supabase/local_forfait_gbeji_fidelite.sql` (LOCAL, gitignoré — politique
  commerciale). Contrôle : « GBÈJÍ™ Fidélité · Reprise & Shampoing Signature »,
  15 %, dès la 3ᵉ venue, 2 prestations (SÍNSIN™ Essentielle · La Reprise +
  KLƆKLƆ™ Signature · L'Ancrage), 95 min. **L'aperçu a sauvé la composition** :
  la recherche par nom attrapait AUSSI « La Reprise Frontale · Essentielle »
  (le geste de niche) — exclue par `not ilike '%frontale%'`. Ne pas relancer
  (idempotent de toute façon, `sv-forfait-gbeji-fidelite`).
- **BUG PRÉEXISTANT ATTRAPÉ PAR LE HARNAIS : le Juste Prix s'appliquait DEUX
  FOIS sur les forfaits composés** — une fois dans la composition
  (`forfaitPriceXof` somme des `personalPriceXof`), une seconde sur le
  résultat. Une cliente à ×0,5 payait le QUART au lieu de la moitié. Corrigé
  dans `personalPriceXof` ; harnais verifie-prix : 34 vérifications.
- **Ma Couronne filtre AUSSI par `desVenue`** (fait dans la foulée, à la
  demande de Yéman) : le tunnel n'offre le forfait qu'à la 3ᵉ venue. Sous RLS
  la cliente ne lit que SES rendez-vous (et ses mineurs) — c'est ce que le
  compteur regarde : les venues de la tête pour qui l'on réserve, celle dont
  `pricing` porte le tarif. Une tête sans venue lisible = seuil fermé.

### LES FACTURES SUIVENT LE RITUEL — 11 août

Modifier un rituel DÉJÀ ENCAISSÉ laissait sa facture née des prestations du
jour de l'encaissement : deux documents pour la même séance, deux histoires
(demande de Yéman). `alignerFacturesDuRituel` (clients/_shared) tourne à
l'enregistrement de la modale RDV, sur toutes les pièces liées
(`invoiceId` + `payments[].invoiceId`, kind facture, statut payée) :

- **L'ARGENT REÇU NE BOUGE PAS** — le total de la pièce est intouchable (c'est
  ce qui est entré en caisse, le CA le lit). Seules les LIGNES se reconforment.
  **CORRIGÉ dans la foulée** : la première version répartissait le total AU
  PRORATA — 40 000 F sur deux gestes donnaient 9 697 et 30 303, « des prix
  bizarres qui ne veulent rien dire » (Yéman, pièce F-2026-0011). Désormais
  chaque prestation garde son PRIX PLEIN (`svcPriceForAppt`), l'écart se dit en
  REMISE visible (`globalDiscountXof`) ou en ligne « Ajustement · prix
  consenti » s'il joue dans l'autre sens (patron 0018). Rouvrir + enregistrer
  un rituel dont la pièce a été proratisée la remet d'aplomb. Un net qui
  dépasse le payé vit au RESTE dû du rituel, jamais dans une facture réécrite.
- Une pièce de règlement PARTIEL (« Règlement · … », une ligne) ne se
  détaille pas après coup — seul son libellé suit.
- **Un FORFAIT donne son nom à la pièce** (règle du 8 août) : pas de
  redétaillage — changer les gestes ne change pas ce qu'elle a accepté.
- Les remises globales tombent au réalignement (le total est déjà porté par
  les lignes) ; idempotent — mêmes prestations, mêmes montants → zéro
  écriture.
- **Un rituel RÉGLÉ ne propose plus « Encaisser ou poser un acompte »**
  (11 août) : le bouton semait la confusion sur un rituel payé. Il s'efface
  quand `apptPayState` dit « payé », remplacé par « Réglé — rien à encaisser
  sur ce rituel. » (doctrine : un refus se motive) ; il revient de lui-même si
  une modification ENREGISTRÉE crée un nouveau reste à payer.
- **Piège des vieux RDV sans longueur** (une facture réalignée, remise 18 000 au
  lieu de 20 000) : une pièce réalignée AVANT que le rendez-vous porte une
  longueur sort au prix de REPLI (shampoing 8 000 Court au lieu de 10 000
  Mi-Long). Le geste : poser la longueur sur la fiche, rouvrir le RDV,
  vérifier le sélecteur, Enregistrer — la pièce se réaligne, le total ne
  bouge pas. (Au passage : le signe moins typographique « − » de la remise
  sortait « ? » sur le PDF — translittéré en tiret dans `pdfSafe`.)

### « UN PRIX FIXE EST FIXE » — `prixFerme` corrigé à la racine — 11 août

Un RDV réclamait un montant pour un shampoing KLƆKLƆ dont le prix
s'affichait en clair. Cause : `prixFerme` déclarait « pas ferme » toute
prestation en mode calibre SANS grille par calibre — or un soin sans
`priceFloors` NI `ratePerLock` ne dépend de rien d'inconnu : son prix est
`base × coef de tranche × Juste Prix`, au franc près. Corrigé dans le juge
lui-même (pas à l'écran) : ferme dès que le coefficient est connu — modèle
renseigné, ou prestation qui ne suit pas le modèle. Conséquences partout où
`prixFerme` est lu : plus de champ à saisir dans la modale RDV, plus de
« dès » sur un prix exact (Trône, Vitrine, Ma Couronne — republiée aussi).
Harnais : 19 vérifications.

### SECOND BUG DE PRIX : la réouverture GONFLAIT le rituel — 11 août

Le champ « montant convenu » était SEEDÉ avec `appt.priceXof` — or le
rendez-vous ne stocke que le TOTAL (fixes + libre). À la réouverture, le champ
« sur mesure » affichait donc le total entier, et réenregistrer rajoutait les
prix fixes PAR-DESSUS : 8 000 → 13 000 → 18 000, un rituel qui enfle à chaque
ouverture. Corrigé :

- `amount` démarre à `null` (= « la Maison n'a pas touché au champ ») ; la
  valeur affichée se DÉRIVE : `libreFige = priceXof − grossFixe`, la part
  libre retrouvée en ôtant les prix fixes du total.
- **Invariant garanti : rouvrir puis enregistrer sans rien toucher redonne
  EXACTEMENT le même total** (`grossFixe + libreFige = priceXof`).
- Leçon (deux fois le même jour — voir le montant qui REMPLAÇAIT le rituel) :
  `priceXof` est un TOTAL ; tout écran qui le confond avec la part d'une seule
  prestation crée un bug d'argent silencieux.

### Le calendrier dit « · en cours » — 11 août

L'indigo profond d'un bloc du Calendrier voulait dire « au fauteuil en ce
moment » (aujourd'hui + heure courante dans la fenêtre + pas encore honoré) —
et il fallait le SAVOIR pour le comprendre : Yéman a demandé « pourquoi ce
RDV est en bleu ? ». Le bloc porte désormais « · en cours » après le nom,
en vue jour comme en vue liste (téléphone). Une couleur qui porte un sens
doit le dire en toutes lettres quelque part.

### Le Profil de la fiche parle en UNE ligne par bloc — 11 août

Retour de Yéman (« trop de texte ») : chaque bloc du Profil portait un
paragraphe de doctrine, la page se lisait comme une notice. Règle appliquée :
**l'état se dit en une phrase, la doctrine vit au survol** (`title`).

- « Sa place à la Maison » : « De passage — la marque se lève à sa 2ᵉ venue
  (1 à ce jour). » remplace quatre lignes ; pareil pour visiteur et relation.
- Le Cercle : « Cercle au 7ᵉ passage — elle en a 4. » — le solde d'explication
  est parti.
- « Ses prix fermes » : une ligne, le reste au survol du titre.
- Observations : le placeholder donne déjà les exemples — le mode d'emploi
  sous le champ est réduit à une ligne.

### La carte Couronne rangée, et « Ses locks » resynchronisé — 11 août

Retour d'écran de Yéman (« les cellules ne sont pas connectées ») :

- **Le vrai bug** : le champ « Ses locks » de la modale RDV (`LocksDeLaTete`)
  gardait son brouillon DE MONTAGE — changer de cliente dans la même modale
  montrait les locks de la précédente, et un comptage corrigé sur la fiche à
  côté n'y apparaissait jamais. Aligné sur le patron de la liste
  (`LocksCell`) : resynchronisation hors focus, jamais pendant la frappe.
- **La carte « La couronne » de la fiche** portait un EN-TÊTE RÉSUMÉ qui
  répétait les champs du dessous (« Style à définir », « 114 locks »,
  « naissance à renseigner ») — à dix centimètres des champs, l'œil le prenait
  pour un autre bloc jamais à jour. Parti. La carte ne dit plus que ce que les
  champs ne disent pas : **le CALIBRE que le comptage donne** (« Calibre
  Medium · 114 locks — c'est lui qui choisit ses créations et son barème »)
  et l'envie déclarée au quiz. Remplir les locks produit désormais une
  réponse visible — avant, la saisie semblait ne rien faire.

### BUG DE PRIX CORRIGÉ : le montant convenu REMPLAÇAIT le rituel — 11 août

**Le pire genre de bug : silencieux, et sur de l'argent.** Le montant saisi
pour une prestation à prix libre remplaçait le total du rendez-vous entier.
Une reprise SÍNSIN à 45 000 F posée à côté d'une prestation sur mesure
disparaissait dès qu'on saisissait 12 000 F pour celle-ci : le rituel valait
12 000 F au lieu de 57 000, et RIEN ne le disait. Le prix était figé sur le
rendez-vous, donc l'erreur suivait jusqu'à la facture, au chiffre d'affaires,
à la production et aux commissions.

- **Le montant ne vaut plus que pour le BLOC DES PRIX LIBRES** ; les
  prestations à prix fixe gardent le leur et s'ajoutent :
  `effGross = grossFixe + (montant saisi || grossLibre)`.
- Sans montant saisi, le bloc libre garde son prix de départ — **zéro** pour
  une prestation sur devis, le prix annoncé pour une variable.
- **Aucune régression sur l'ancien cas** : une seule prestation libre →
  `grossFixe = 0`, le montant fait le total, exactement comme avant.
- `priceXof` enregistré = `effGross`, **le même nombre que l'aperçu** : le
  recalculer à l'enregistrement ferait diverger ce qu'on lit de ce qu'on écrit.
- ⚠ **Les rendez-vous saisis AVANT ce correctif portent le prix faux** (figé
  dans `priceXof`). Les rouvrir et réenregistrer les remet d'aplomb.

### Le montant d'un rituel sur devis se saisit SUR SA LIGNE — 11 août

Le champ « Montant du rituel » vivait tout en bas de la modale RDV, sous la
note du carnet : on lisait « sur devis » à côté de la prestation sans voir où
le dire, et l'on enregistrait un rituel à 0 F sans s'en apercevoir. Il paraît
désormais **à côté de « sur devis »**, sur la ligne de la prestation.

**LE CHAMP NE S'OUVRE QUE LÀ OÙ LE PRIX EST VRAIMENT INCONNU** (corrigé dans la
foulée). Le critère n'est PAS « la prestation n'est pas à prix fixe » : une
SÍNSIN Élaborée est déclarée « variable », mais son prix est exactement connu
dès qu'on a le calibre ou le comptage — l'écran l'affiche « 35 000 F » et non
« dès 35 000 F ». Lui ouvrir un champ faisait redemander un montant déjà
calculé, sur une ligne qui affichait déjà son prix : deux nombres, et l'on ne
savait plus lequel comptait. Le prédicat est donc `!prixFerme(sv, pricing)` —
la question « son prix est-il exactement connu pour cette cliente ? » existait
déjà, et elle tient compte du prix convenu avec elle.

**UN SEUL MONTANT PAR RENDEZ-VOUS** : `Appointment.priceXof` porte le rituel
entier, pas la prestation. Le champ en ligne ne s'affiche donc que s'il n'y a
**qu'une** prestation à prix libre (`seulPrixLibre`) — au-delà, deux champs
réécriraient la même valeur l'un après l'autre, et c'est le bloc du bas, qui
dit « montant du rituel », qui reprend la main. Le jour où l'on voudra un prix
PAR prestation, il faudra un champ par ligne dans le modèle, pas un champ de
plus à l'écran.

## Une fiche qui « revient » après suppression — gabarit écrit le 10 août au soir

Supprimer une cliente au Trône n'efface que la FICHE ; ses documents restent,
et `useReconcileClients` recrée la fiche pour tout `clientId` encore référencé
par un RDV ou une facture — dans la seconde, sur n'importe quel poste ouvert.
Un compte Ma Couronne la recréerait aussi à sa connexion (`ensureClient`).
Le remède passe par le SQL : traiter les RÉFÉRENCES et le COMPTE, pas la fiche.
Gabarit : `supabase/local_supprime_cliente.sql` — LOCAL et GITIGNORÉ (motif
`supabase/local_*.sql`, ajouté ce jour) : étape 1 diagnostic lecture seule
(fiches, compte, chaque pièce avec statut et montant, références brutes),
étape 2A fusion vers la vraie fiche (l'histoire et le compte suivent, le
doublon meurt), étape 2B effacement total (les factures sortent des comptes).
Appliqué le 10 août : un doublon de comptoir (`MND-JTUG`, une seule pièce — un
devis brouillon) fusionné vers sa fiche d'import Firebase (`gvCbf…`) ; 1 pièce
reportée, doublon supprimé, plus rien ne le fait renaître.

### Retouches Post Reprise — créée le 12 août

L'atelier GBÈJÍ a reçu sa retouche, sur le patron de ses sœurs (VÈKPÈ ·
« Après une création », FÍNFÍN · « Après une restauration ») : famille
`cat-retouches-gbeji` « Retouches · Après une reprise » + prestation
`sv-retouches-post-reprise` « Retouches Post Reprise », calquée PAR CHOIX de
Yéman sur `sv-plt-50-ret-r-c` (Post Restauration) : 12 000 F · 45 min ·
Fondation. Script local gitignoré `local_retouche_post_reprise.sql` —
ancrages par identifiants, aperçu avant écriture (deux modèles existaient,
le limit 1 aurait choisi au hasard).

### Le sur-mesure boucle enfin — 12 août

« Vous composez » (Ma Couronne) transmettait au pont `mnd_couronne_compose`
que PERSONNE ne lisait — la promesse « la maison revient sur WhatsApp »
reposait sur rien — et affichait les prix CATALOGUE. Quatre chantiers d'un
coup (validés au sélecteur) :

- **Le Trône reçoit** : le Tableau de bord moissonne chaque payload du pont
  dans `compositionsRecuesStore` (file LOCALE persistante — v1 sans
  migration : le pont ne porte que la dernière composition, la moisson la
  garde ; si le volume grandit, une vraie table `compositions_queue`
  prendra le relais). Ligne dans « Ce qui presse », modale : WhatsApp
  pré-rempli pour sceller (via `clientId`, nouveau sur le payload) +
  « Marquée traitée ».
- **Notification poussée** à chaque envoi (pushNotifyStaff).
- **Ses prix** : personalPriceXof (catalogue + produits), même moteur que
  le tunnel Réserver.
- **Réglages au Trône** : Vitrine → carte « Le miroir · pour toutes les
  clientes » → bloc Sur-mesure — ponctuel −%, abonnement −%, minimum.
  `surMesureDe(cfg)` comble avec les défauts historiques (10/15/3,
  gbeji+finfin) ; les libellés de la page suivent.
- **PONCTUEL ET ABONNEMENT SONT SCINDÉS** (12 août) : chacun son ARBRE de
  cases (ateliers, familles, sous-familles — un parent coché couvre son
  sous-arbre via `sousArbreOf`, l'enfant couvert se montre inclus et non
  décochable). `ponctuelCats` VIDE = tout le catalogue visible ; `aboCats`
  vide = défaut historique. Changer de mode purge la composition dans les
  deux sens. Piège d'origine : comparer l'atelier coché aux catégories
  DIRECTES laissait GBÈJÍ vide — ses prestations vivent dans ses familles.

### Un membre de famille n'est JAMAIS un visiteur — 12 août

Les enfants déclarés (jamais assis, pas de passage) tombaient au registre
Visiteurs depuis la refonte du 11 août — « disparus du CRM ». `estVisiteur`
exclut désormais toute fiche rattachée à une famille (`familyId`), et le
registre La Maison liste `estDeLaMaison` = couronnées + membres de famille
pas encore venus. Le COMPTEUR des têtes couronnées reste `estCouronnee`
(les venues seulement) — la liste dit la relation, le compteur dit les
venues, et les deux peuvent différer.

### Le tapis de cuivre est INDIVIDUEL — 12 août

La régie de la Vitrine (« Choisis ce que Marie verra ») écrivait la config
GLOBALE du miroir : masquer pour une tête masquait pour toutes. Désormais :

- **Les masques vivent sur la fiche** (`Client.vitrineMasques` — catégories,
  prestations, produits) ; la régie écrit là.
- **Le juge unique est `catalogueVisiblePour`** (shared/bridges) : socle de la
  Maison (VitrineConfig — liste de catégories, masques globaux hérités,
  lecture auto/quiz/reco) PLUS les masques de la tête connectée. Utilisé par
  `useVisibleCatalog` (Ma Couronne) ET par l'aperçu de la régie. Une famille
  suit son atelier (l'arbre remonte) ; l'ordre rendu est celui du Catalogue
  (`catsDansLOrdre`). La reco de l'accueil ne pioche QUE dans le visible.
- **DEUX PORTÉES au même écran** (12 août, demande de Yéman) : le commutateur
  « Pour <prénom> / Pour toutes les clientes » écrit selon le cas sur SA
  fiche ou dans le socle (`VitrineConfig.hiddenCategories` — nouveau — +
  `hiddenServices`/`hiddenProducts`). En portée cliente, un masque Maison se
  voit éteint et dit pourquoi il ne se rallume pas d'ici. L'aperçu et le
  tapis suivent la portée choisie.
- **La liste blanche `visibleCategories` est RETIRÉE du juge** (12 août) :
  semée une fois au premier jour, entretenue par aucun écran, elle cachait
  sur Ma Couronne toute catégorie née après (les forfaits SÍNSIN/GBÈJÍ
  composés, les familles). Le réglage global d'une catégorie est « Visible
  aux clientes » au Catalogue (`enabled`, descendance coupée) — plus le
  masque global de la régie (portée Maison). Le champ reste dans le type
  pour les données déjà en base, mais ne juge plus rien.

### Les fiches « Cliente Ma Couronne » — baptême du 12 août

Une inscription Ma Couronne SANS nom (pas d'e-mail lisible, profil jamais
rempli) fait naître une fiche au nom de repli « Cliente Ma Couronne » — le
Calendrier et le Carnet, qui lisent le nom DE LA FICHE, n'affichent alors que
ce repli. Le 12 août : 5 fiches trouvées — 2 vraies clientes (rituels du 12,
renommées à leurs vrais prénoms par
`supabase/local_nomme_clientes_couronne.sql`, LOCAL gitignoré, repli
`repli_noms_couronne`) et 3 fantômes sans e-mail/téléphone/RDV
(`local_purge_fantomes_couronne.sql` : constat des références PUIS sortie,
repli `repli_fantomes_couronne`). Leçon en deux temps : (1) le nom figé d'un
RENDEZ-VOUS peut différer du nom de la FICHE — toute réparation se cloue sur
les IDENTIFIANTS, jamais sur un nom ; (2) une fiche ne sort que si AUCUNE
pièce ne la cite (leçon de la fiche ressuscitée). Si le motif revient, le vrai chantier
serait de demander le prénom à l'inscription Ma Couronne.

### Le compte famille ne s'affiche plus partout — 11 août

Demande de Yéman, et elle a raison sur les deux écrans : on proposait un foyer
à des clientes qui n'en ont pas.

- **Le Trône** : le bloc « Compte famille » de la fiche 360 s'affichait sur
  TOUTES les fiches, avec sa phrase « elle n'est rattachée à aucun compte » et
  son bouton d'ouverture — 178 fiches portaient un bloc qui ne concernait
  presque personne. Il ne paraît plus QUE si le compte existe. Le rattachement
  se fait là où il se décide, Finances › Comptes & Avoirs (`/comptes?parent=`).
- **Ma Couronne** : la section « Mes enfants » (titre, invitation, bouton
  « + Ajouter un enfant ») s'affichait sur chaque profil — on demandait
  quelque chose de très intime à qui n'avait rien demandé. Elle ne paraît en
  entier que pour un **parent connu** : une tête déjà ouverte, une demande en
  cours, ou un refus à lire.
- **La porte reste ouverte pour les autres, mais discrète** : une seule ligne,
  « Un enfant à inscrire ? », qui déplie le formulaire. C'était nécessaire —
  masquer tout aurait tué le TEMPS 2 (0036) du jour au lendemain : plus aucun
  parent n'aurait pu déclarer un PREMIER enfant depuis chez lui. Dès la
  demande envoyée, le compte devient « parent connu » et retrouve le bloc.
- **Un membre sans fiche se crée depuis la modale du compte** (11 août) : le
  champ « Ajouter une cliente au compte » porte `allowPassage` — l'option
  « ＋ Cliente de passage » (prénom + téléphone) crée la fiche et l'ajoute au
  compte dans le même geste, sans quitter Comptes & Avoirs. La fiche naît
  de passage, comme toute fiche créée depuis le Trône.

## TEMPS 2 des comptes enfants — CONSTRUIT ET OUVERT le 10 août au soir

Le chantier n° 1 de la liste du matin, bouclé le soir même :
- **`0036_acces_parents_temps2.sql` — PASSÉE** (le bloc commenté de 0028,
  sorti mot pour mot dans sa propre migration ; 0028 y renvoie). `est_ma_tete`
  ouvre au parent PAYEUR la lecture de ses MINEURS (clients, appointments,
  invoices, client_sessions) et l'écriture de leurs rendez-vous. Sans date de
  naissance : fermé — la minorité se prouve.
- **Ma Couronne** : sélecteur « Pour : Moi · Keli » dans le tunnel (visible
  seulement si la Maison a validé des mineurs sur le compte) — le RDV se pose
  au nom de l'enfant, le personnel est notifié « Keli · par Valerie ». « Mes
  rendez-vous » liste le FOYER entier (« — pour Keli » sur les rituels des
  têtes). Le prix de l'enfant = même calcul que le parent (coefficient hérité
  à la validation, pas de modèle au dossier).
- **Le contrôle de 0036** (relançable) a rendu l'état réel : 13 têtes
  rattachées, 4 visibles, **9 INVISIBLES sans date de naissance** — la liste
  nominative est au contrôle, pas ici (dépôt public). À réparer au comptoir :
  fiche → anniversaire, au fil des passages.

## Publier : `node scripts/publie.mjs` — jamais à la main

`dist-sites/` vit dans OneDrive, **qui verrouille un fichier le temps de le
synchroniser**. Le 9 août 2026, une copie manuelle a perdu un morceau partagé du
Trône — celui que presque tous les autres importent — et la publication est
partie quand même : site cassé en ligne, aucune commande en erreur. La
publication efface d'abord tout (`git rm -r .`), donc **un fichier manqué à la
copie disparaît aussi de la version en ligne** : il n'y a pas d'ancienne version
pour rattraper.

`scripts/publie.mjs` réessaie sur fichier verrouillé, puis **compare chaque
fichier par empreinte avant de pousser**. Un seul écart et le site n'est pas
publié du tout — l'ancienne version, elle, fonctionnait.

```bash
node scripts/build-sites.mjs
node scripts/publie.mjs trone couronne      # ou sans argument : les quatre
```

Le compte GitHub est lu depuis l'origine du dépôt — aucun domaine en dur.

**Le « publié @ xxxxxxx » ne désigne PAS la publication** (constaté le 11 août) :
c'est le HEAD du dépôt SOURCE, donc deux publications successives sans commit
entre elles portent le même libellé. Ce document cite ces empreintes comme
repères — les prendre pour des identifiants de déploiement induirait en erreur.
Pour savoir si quelque chose est parti, lire la ligne : « déjà à jour, rien à
pousser » ou « N fichiers vérifiés, publié ».

## Deux barèmes à revoir, sans urgence

- **YÈKPÈ™ Couleur · La Révélation Végétale** — saute de 15 000 à 65 000 F entre
  court et mi-long, et n'a pas de long.
- **Manucure** et **Pédicure** — leur prix suit une longueur de cheveux qui ne
  les concerne pas. Héritage de l'ancien catalogue, appliqué partout.

## Chantiers ouverts par ailleurs

- **Factures de reprise** : `supabase/0018_factures_reprise.sql` est **PASSÉ le
  9 août 2026** — 335 pièces écrites, 15 580 400 F. Ne jamais le relancer.
  Voir « 0018 — ÉTAPE 2 PASSÉE » plus bas.
- **Encaissements** : le registre date les règlements de rituels par leur
  facture, pas par le journal des versements — qui existe désormais et porte sa
  propre date. `buildReceipts` doit lire ce journal pour que la caisse tombe au
  bon mois.
- **Notification APDP** de la fuite du 2 août : à la charge de la Maison, hors
  code. La purge de l'historique Git ne la remplace pas.

## Historique

Les étapes 1 à 3 de la restructuration (plateau technique rangé dans les
ateliers, familles de catégories, section Forfaits) sont faites depuis le
5 août. Voir `supabase/0019_rangement_plateau.sql` et
`docs/reference_maisons_avant_restructuration.md` pour les chiffres d'avant.

---

## 7 août 2026 — pointage, vitrine, accès

**Le pointage a une preuve.** `PointageConfig` (payroll.ts) : position GPS d'abord
(rayon réglable, 150 m par défaut), code à quatre chiffres en secours. Le code se
**renouvelle seul** (`assurerCodeDuJour`) — le bouton du matin a été retiré, une
vérification suspendue à un geste quotidien finit par céder. Il s'affiche dans
« Mon mois » **pour le gérant seul**, avec un QR (`qrcode-generator`, rendu SVG à
la main) qui ouvre `#/mon-mois?code=XXXX`. L'écran `/comptoir` existe toujours
pour une tablette au salon mais est `horsMenu: true`.
→ **RESTE À FAIRE : enregistrer la position du salon** dans Paramètres, *depuis
le salon*. Tant que `lat`/`lng` sont vides, rien ne s'applique.

**Mon mois est devenu personnel.** Un maître ne voit que sa ligne (nom, points,
jours, heures au-delà, prime) ; ni les noms ni les chiffres des collègues. Le
rang « Tu es 2ᵉ sur 5 » a été retiré le 7 août — la prime se gagne au SEUIL, pas
au podium ; à sa place, « encore N points ». Titre conditionnel : « Mon mois en
chiffres » pour un maître, « Le mois de l'équipe » pour un gérant.
Têtes à compléter : liste déroulante (un rituel à la fois) + un seul bouton
« C'est moi ».

**L'ordre de l'équipe se commande.** `StaffMember.ordre` + `ordonneEquipe()`
(equipe/data.ts), flèches ↑↓ dans Personnel & paie → Équipe. Respecté par les
mains du RDV et Mon mois. Renumérotation complète à chaque déplacement.

**Attribution en masse SUPPRIMÉE** (Personnel & paie). Elle collait les 406 RDV
sans maître à UNE personne — faux par construction depuis les mains. Ne pas la
reconstruire : la raison est écrite dans le code. Les RDV de l'ancien carnet
restent sans mains, c'est la vérité.

**Les prix se masquent au fauteuil.** Même juge partout : `voitLesPrix(role,
domaines)` — c'est le DOMAINE ouvert qui tranche, pas le rôle (Gerard encaisse).
Calendrier : un maître peut désormais CRÉER un RDV, `sansPrix`. Le Carnet :
colonne Montant vidée, solde et bouton Encaisser cachés, `PayAppointmentModal`
fermée des deux côtés.

**Vitrine.** Les quatre rituels inventés (« Le Soin Allongement » 28 000 F…) sont
partis. `VitrineConfig.recoParEnvie` désigne une prestation RÉELLE du catalogue
par envie ; le prix affiché est `personalPriceXof` (coefficient cliente compris).
Le multiplicateur d'humeur Q2MULT est supprimé. L'Aperçu est intégré au bas de la
Régie pour essayer en direct.
**Le quiz a traversé le pont — 7 août 2026.** Les mots vivent désormais dans
`shared/quiz.ts` : mêmes envies, mêmes questions à rotation, en deux adresses
(`.tu` pour le miroir du salon, `.vous` pour l'application — une phrase par
voix, jamais deux jeux de mots).

Sur Ma Couronne, le quiz **ouvre le tunnel de réservation**, à l'index `QUIZ`
(−1) : les sept index existants ne bougent pas, et `rang()`/`total` comptent les
écrans réellement traversés (7 avec le quiz, 6 sans). Il se contourne d'un mot
(« Je sais déjà ce que je veux »), ne s'ouvre pas du tout si la Régie n'a rien
désigné, et saute pour une réservation préremplie (offre, re-réservation). La
reco se cherche dans `offre` — catalogue visible ET calibre de la cliente : une
prestation masquée ou taillée pour un autre modèle ne se propose pas.

**Deux surfaces, deux interrupteurs** (8 août) : `quizEnabled` commande le miroir
du salon, `quizCouronne` commande Ma Couronne. Un seul interrupteur obligeait à
choisir entre les deux — or au fauteuil la maîtresse est là pour expliquer ce
qui se propose, sur le téléphone la cliente est seule. `quizCouronne` absent =
allumé (l'état dans lequel le quiz est né côté cliente).

**La reco se choisit selon la cliente — 7 août 2026.** Un seul juge,
`shared/reco.ts`, lu par le miroir comme par l'app : deux surfaces qui
calculeraient chacune la leur diraient deux choses à la même tête. La cascade,
dans l'ordre :

1. **son histoire**, si « Son histoire tranche » est allumé à la Régie
   (`VitrineConfig.recoAuto`) et qu'elle a des rendez-vous — la prestation
   qu'elle reprend le plus, sinon un candidat de la maison qu'elle fréquente ;
2. **son persona** (`Persona.recoParEnvie`, désigné dans CRM → Les personas) ;
3. **le repli de la Maison** (`VitrineConfig.recoParEnvie`, la Régie) ;
4. **rien** — ce qui vaut mieux qu'une recommandation fausse.

Le mode automatique **n'invente rien** : il ne trie que des prestations déjà
désignées quelque part (tous personas + repli). Et à chaque cran, la prestation
doit être dans l'`offre` — catalogue visible ET calibre de la cliente : une
prestation qu'elle ne peut pas réserver ne se propose à aucun cran. La Régie
affiche, pour la cliente choisie, ce qui sortira et par quel cran.

**Sa réponse se range à deux endroits** : `Client.envie` + `envieAt` sur la
fiche (écrit dès qu'elle répond, même si la réservation n'aboutit pas ; la
dernière seulement, lisible en clair sur la fiche du Trône, bloc « La couronne »),
et `Envie · L'éclat` dans la note du rendez-vous, pour le maître au Calendrier.
Aucun SQL : les lignes sont du JSONB `data`. L'élan (2ᵉ question) ne se stocke
pas — rien n'agit dessus, et le Q2MULT est mort avec la Vitrine.

**Déploiement.** GitHub Pages sature vite : une publication à la fois par dépôt,
~10/heure. Le 6 août, quinze déploiements ont bloqué la file quatre heures
(builds marqués `errored` avec `duration: 0` = jamais démarrés). **GROUPER les
publications** — une par lot de travail, pas une par correction. Adresse de
secours disponible : `maisonmnd.github.io/mnd-platform` (non maintenue).

**Le registre lit le journal — 7 août 2026.** `buildReceipts` datait un
règlement de rituel par sa FACTURE, qui porte le jour du rituel : un rituel d'août
prépayé en juillet tombait dans la caisse d'août. Chaque
versement porte désormais `invoiceId` (écrit par `PayAppointmentModal`), et le
registre date la pièce par le versement qui l'a fait naître. Deux replis :
le DERNIER versement du rituel (journaux d'avant le lien), puis la date de la
pièce (ventes au comptoir, rituels sans journal — inchangés).

Conséquence à connaître : **la Synthèse ne bouge pas**, et c'est voulu. Elle
mesure le chiffre d'affaires, daté par la prestation ; le registre mesure la
trésorerie, datée par l'argent. Les deux totaux diffèrent légitimement.

Au passage, la suppression d'une facture reprend désormais SES versements (par
`invoiceId`) et non les plus récents, retrouve le rituel même quand la pièce
n'est pas la dernière du rendez-vous, et ne coupe le lien `invoiceId` que si
c'est bien cette pièce-là.

**Toujours en attente** : `0027_rattachement_cliente.sql` jamais exécuté ;
barèmes YÈKPÈ Couleur et Manucure/Pédicure à revoir ; notification APDP de la
fuite du 2 août. (`0018_factures_reprise.sql` est passé le 9 août.)
Un pourboire saisi SEUL (rituel déjà soldé) reste daté par la pièce — il
n'écrit pas au journal.

### L'archétype se lit dans le carnet — 8 août 2026

`shared/persona.ts` pèse les signaux d'une cliente et rend un **verdict motivé** ;
`usePersonaVivant` (shell du Trône) le déclenche à chaque mouvement du carnet et
écrit — quand, et seulement quand, la lecture est franche.

**La pesée**, plutôt qu'une cascade de `if` : chaque indice donne des points à un
archétype et dit pourquoi. Il faut **5 points et 2 d'avance** sur le suivant.
Sous ce seuil, ou à égalité, on ne tranche pas — la fiche ne bouge pas. Le
verdict nomme quand même son meilleur candidat, pour que le Trône puisse dire
« pressentie, pas encore sûre ».

**Quatre verrous** : sans session on n'écrit rien (un carnet vide ferait retomber
la Maison au seuil d'accueil) ; rien de chargé = on attend ; seul un verdict
confiant écrit, **jamais de rétrogradation** ; et `Client.personaFige` — choisir
à la main au CRM fige la fiche, un lien la rend à la lecture. Le calcul est
idempotent : une deuxième passe n'écrit rien.

**Deux corrections du modèle**, trouvées en le vérifiant :
- ÀLÀLÀ™ vit dans FÍNFÍN™ et comptait donc aussi comme une reconstruction —
  chaque audacieuse devenait convalescente. La Grande Renaissance ne dit pas une
  fibre qui souffre, elle dit une femme qui recommence.
- *La Souveraine* et *La Constante* s'annulaient (scores voisins, aucune marge) :
  la cliente la plus fidèle retombait au seuil d'accueil. Un archétype précis
  **mange** le plus général — souveraine et lointaine effacent constante.

**La durée des visites n'est plus pesée.** Les rendez-vous de l'ancien carnet ne
portent pas toutes leurs prestations : la moyenne tombait à 59 min pour une tête
de 600 locks. Cet indice mesurait une saisie incomplète, pas de la hâte — il
classait 25 clientes sur du vide. *La Pressée* reste un archétype, elle ne
s'attribue simplement plus toute seule.

`crownSince` étant vide sur toute la Maison, *La Souveraine* et *La Naissante* ne
peuvent pas se gagner aujourd'hui. C'est une donnée absente, pas un mauvais
seuil.

Dix-neuf cas vérifiés (les huit archétypes qui se gagnent, les cinq qui ne
doivent pas se gagner, l'égalité, la médiane de cadence, la résolution des
personas).

### Le forfait ponctuel est construit — 8 août 2026

**Un seul champ décide** : `Appointment.forfait` = `{ nom?, totalXof, baseXof,
poseAt }`, et `apptNetXof` le renvoie tel quel. Rien d'autre dans la Maison n'a
eu à changer : `splitByWeights(apptNetXof(a), poids)` était DÉJÀ la règle
partout (production et seuils, commissions, Synthèse, Tableau de bord). Chaque
prestation reçoit donc sa part du total au prorata de ce qu'elle vaut pour cette
tête — les mains, les primes, les commissions, la ventilation par maison et le
prix figé continuent de compter juste. **`serviceIds` n'est jamais touché**, et
le piège décrit ci-dessous est évité par construction.

Deux règles au-dessus du forfait : une **séance 2+ d'une série** vaut toujours 0
(sinon un forfait se compterait une fois par séance), et un forfait **efface les
remises** — on ne remise pas un prix déjà négocié (les champs sont masqués et
mis à `undefined`).

**Se pose aux deux bouts** : à la réservation (`RdvModal`) comme à l'encaissement
(`PayAppointmentModal`). Nom libre (« Forfait » à défaut), et **deux champs liés**
— taper le total remplit le taux, taper le taux remplit le total. Toucher au
forfait recale le montant proposé à l'encaissement, comme le fait l'acompte.

**Quand la composition bouge après la promesse**, le total tient — la Maison a
dit un prix. Le comptoir voit alors un bandeau (« il portait sur 76 000 F, le
rituel en vaut 91 000 F aujourd'hui ») et un bouton qui reporte le MÊME TAUX en
un geste. C'est à quoi sert `baseXof`.

**Sur la facture** : les prestations restent détaillées à leur prix plein, l'écart
paraît en remise visible, et la note porte « <nom> · 60 000 F au lieu de
100 000 F ». Une pièce à une seule ligne (règlement partiel, prestation unique)
prend le nom du forfait.

Vérifié sur seize scénarios (net, prix plein, remises qui ne s'empilent pas,
séries, ventilation par geste et par maison, forfait offert, prix figé).

<details><summary>La demande d'origine et son piège — conservés</summary>

### CHANTIER DEMANDÉ — forfait ponctuel à l'encaissement

**La demande.** Passer un ensemble de prestations en forfait AU MOMENT de
l'encaissement : la cliente a pris quatre gestes aujourd'hui, on les facture
comme un tout à un prix négocié.

**Ce qui existe déjà, et ne répond pas.** `Service.includes` + `forfaitRemisePct`
(catalog.ts) font un forfait DURABLE, qui vit dans le catalogue et se réserve
comme tel. Ce n'est pas la même chose : ici le forfait naît à la caisse, pour une
cliente et une fois.

**LE PIÈGE, à ne pas rater.** La tentation est d'effondrer les lignes en une
seule « Forfait — 60 000 F ». Il ne faut PAS. Le montant par prestation porte
tout le reste de la Maison :
- les **mains** et donc la production, les seuils et les primes ;
- les **commissions** des maîtres (`apptNetXof` × taux) ;
- la ventilation par maison / catégorie du Bilan mensuel ;
- le **prix figé** (`prix_fige`) qui protège l'historique d'un changement de
  catalogue.
Une ligne unique effacerait tout cela d'un coup — c'est exactement la faute
qu'on a évitée en repliant les longueurs le 6 août.

**La forme retenue.** Un forfait de caisse fixe un TOTAL VOULU et le
redistribue sur les lignes existantes au prorata de leur prix, en entiers XOF —
`splitByWeights` (shared/tips.ts) fait déjà exactement ce calcul, avec le plus
fort reste. Chaque prestation garde donc un montant propre, cohérent avec le
total, et toute la ventilation continue de fonctionner. La facture peut
présenter UNE ligne à la cliente tout en gardant le détail dessous.

**Décidé avec Yéman le 8 août** : nom libre (« Forfait » par défaut) · saisie en
montant ET en pourcentage, l'un remplissant l'autre · posable **aussi à la
réservation**, le total promis tenant si les prestations changent ensuite.

</details>

### CHANTIER DEMANDÉ — reprise des RDV pris ailleurs (8 août)

Les clientes réservent encore sur **Fresha** et sur **mnd-admin.vercel.app**
(ancienne app maison, encore en ligne) pendant que Le Trône se construit.

**RÈGLE ABSOLUE : un seul sens.** L'ancien écrit, Le Trône lit. Deux systèmes qui
écrivent le même RDV finissent par s'écraser — incidents du 23-07 et du 02-08. Un
doublon se voit et se corrige ; une écriture croisée efface en silence.

**Deux points durs.** (1) Rapprocher les clientes sur le TÉLÉPHONE normalisé, pas
sur le nom, sinon le CRM double. (2) Chaque RDV repris doit porter son
identifiant d'origine (`sourceRef`, à ajouter sur `Appointment`) pour qu'une
seconde reprise le reconnaisse au lieu d'en créer un second.

**mnd-admin.vercel.app — à vérifier EN PREMIER :** pointe-t-il sur le MÊME projet
Supabase, ou sur un autre ? Même projet = peut-être déjà les mêmes tables, et
alors il n'y a rien à reprendre, seulement une porte à fermer. Autre projet =
copie de base à base, faisable en SQL en une passe.

**Fresha :** pas d'interface publique ouverte aux salons à ma connaissance (à
revérifier). Voie réaliste : export CSV des rendez-vous → import, relançable
autant de fois qu'on veut grâce au `sourceRef`. Écrire le script dans
`scripts/`, sur le modèle de `import-genere.mjs`.

**LE VRAI CONSEIL, à donner avant de coder :** le problème n'est pas la synchro,
c'est d'avoir trois portes d'entrée. Une reprise est un pansement qu'il faudra
maintenir indéfiniment. Fermer mnd-admin et faire pointer le lien de réservation
Fresha vers Ma Couronne coûte moins cher, une fois, que de synchroniser à vie.

**RÉPONSE (8 août) : mnd-admin tourne sur FIREBASE**, pas sur Supabase. Ce n'est
donc pas un branchement mais une reprise entre deux bases de nature différente
(Firestore, orienté documents → Postgres, relationnel).

Voie : un script Node dans `scripts/` avec `firebase-admin`, qui lit les
collections (rendez-vous, clientes) et écrit un JSON ; un second qui mappe vers
la forme du Trône et insère dans Supabase. Relançable grâce au `sourceRef`.

**DANGER — LE DÉPÔT EST PUBLIC.** La clé de service Firebase (JSON de compte de
service) ne doit JAMAIS entrer dans un commit : elle ouvre la base entière en
écriture. Elle vit dans une variable d'environnement locale, pas dans un
fichier du dépôt. Les JSON exportés portent noms, téléphones et e-mails de
clientes : `.gitignore`, comme `import_v6*.sql` après la fuite du 2 août.

### CHANTIER DEMANDÉ — restrictions du calendrier (8 août)

**Le besoin.** Une tête très dense (350 locks et plus) ou une « pressée » doit
fermer le calendrier plus longtemps qu'une tête ordinaire. SÍNSIN Essentielle /
Élaborée et FÍNFÍN ne durent pas pareil d'une personne à l'autre.

**Ce qui existe.** `couronne/lib.ts:336` écarte déjà les créneaux qui chevauchent
un RDV (`busy.some(([s,e]) => m < e && m + durationMin > s)`). Le catalogue porte
`ratePerLock`, `priceFloors`, `durationMax` ; `personalDurationMin` (pricing.ts)
sait calculer une durée personnelle.

**Les deux manques.**
1. À la réservation en ligne, la cliente ne déclare pas sa DENSITÉ : le tunnel ne
   peut donc utiliser que la durée nominale du catalogue, jamais la durée réelle.
   → demander la densité en TRANCHES (pas au lock près) et brancher
   `personalDurationMin`, le même moteur que le prix.
2. Aucune notion de CAPACITÉ : le contrôle raisonne comme si la Maison n'avait
   qu'un poste. Ni les maîtres en parallèle, ni un rituel qui mobilise deux
   personnes (KLOKLO à deux, reprise à trois) ne sont modélisés.
   → capacité dans Paramètres + postes consommés par prestation.

Vérifier au passage QUELLE durée le tunnel passe réellement à `durationMin` —
non tranché faute de contexte le 8 août.

### 0018 factures de reprise — ✅ FAIT (exécuté dans une autre session)

Chiffres de la réconciliation conservés comme TRACE de ce qui a été écrit :

Résultat de l'aperçu, à ne pas refaire :

| | |
|---|---|
| factures_a_creer | **335** |
| chiffre_couvert | **15 517 600 F** |
| avec_remise_de_reprise | 239 |
| avec_ligne_d_ajustement | 63 |
| sans_ajustement | 33 |
| période | 15 oct. 2025 → 1 août 2026 |

Cohérence vérifiée : 239 + 63 + 33 = 335, aucune ligne perdue.

Les **63 lignes d'ajustement** (19 %, élevé mais attendu) viennent du REPLI DES
LONGUEURS du 6 août : leur prix figé — un DÀNDÀN Long à 28 000 F — dépasse le
prix de la prestation unique survivante. L'ajustement rétablit l'écart, ce qui
est le comportement voulu : la facture doit valoir le prix réellement payé.

**Porte franchie.** Yéman devait confirmer que 15 517 600 F sur cette période
correspond à ses relevés (~1 630 000 F/mois) — elle vérifie, réponse en
attente au 8 août. **Ne PAS lancer l'étape 2 sans ce feu vert** : dès qu'une
facture est rattachée, le rituel compte par elle et non plus par le Carnet ; un
écart deviendrait indémêlable sur 335 lignes (cf. les 330 000 F perdus le 4/08).

Si trop bas → chercher du côté des rituels écartés (séries, abonnements, RDV
jamais marqués honorés). Si trop haut → doublons et annulés.

**8 août — l'étape 2 manquait alors dans le fichier ; elle a été écrite et
exécutée dans une autre session. Historique :** *(Écrite et passée depuis, le
9 août — voir la section suivante. Conservé pour l'historique.)* Le fichier s'arrête ligne 191 sur
`-- pret as (` : pas d'INSERT, pas de rollback. Ne pas promettre qu'il suffit de
« décommenter ». Ce qui existe : deux aperçus (le second, ligne ~60, est le bon —
il gère `forfait`, `n_lignes = 0`, dates futures, et compte `deja_creees`) et la
construction des lignes avec `prixParLongueur` (`svcPriceForAppt` à l'identique).

**Yéman a donné son feu vert à l'écriture** après réconciliation :
17 195 100 (Analytics) vs 1 705 500 (36 factures payées) + 15 517 600 (à créer)
= 17 223 100, soit **28 000 F d'écart non expliqué (0,16 %)** — probablement une
valorisation qui diffère entre Analytics et la requête, du côté lecture.

**Ce qu'il fallait écrire (fait) :** l'INSERT dans `invoices` (série
MND-R-0001…, `id like 'inv-rep-%'` pour être repérable et annulable), l'UPDATE de
`appointments.data->>'invoiceId'`, le tout dans UNE transaction, plus le rollback
en fin de fichier. Le statut de la pièce suit `regle` (journal `payments` s'il
existe, sinon `paidXof`, + acompte confirmé) et `acompte` se déclare en
`depositCreditXof` pour ne pas encaisser deux fois.

### 0018 — ÉTAPE 2 PASSÉE le 9 août 2026. NE JAMAIS RELANCER.

**335 pièces écrites, 15 580 400 F**, du 15 oct. 2025 au 1ᵉʳ août 2026. Série
`MND-R-0001` → `MND-R-0335`, identifiants `inv-rep-<apptId>`.

| | |
|---|---|
| factures_creees | **335** |
| total_des_factures | **15 580 400 F** — identique au net des rituels, au franc près |
| payées | 308 — **14 239 400 F**, restent au chiffre d'affaires |
| envoyées | 27 — **1 341 000 F**, partis aux impayés |
| sans cliente au CRM | 0 |

**L'invariant a tenu** : la somme des pièces égale exactement le `chiffre_couvert`
de l'aperçu. Aucun rituel n'a changé de valeur en passant du Carnet à sa facture.

**Le chiffre validé le 8 août n'est pas celui qui a été écrit — et c'est normal.**
15 517 600 F attendus, 15 580 400 F écrits : **+62 800 F**, une seule pièce,
**MND-R-0330 — 31 juillet, KÒKÒ™ Suivi**. Yéman a fait passer ce
rituel en **mi-long** entre les deux exécutions : sa valeur au Carnet a changé,
la facture a suivi. Sans le correctif `prixParLongueur`, la requête l'aurait
compté au prix de repli et cette correction aurait DISPARU du chiffre d'affaires.
Vérifié après écriture : une ligne, remise de reprise à 0 — la pièce vaut le prix
mi-long au franc près. La réconciliation d'Analytics se refait sur 15 580 400.

**Quatre correctifs ont été portés avant l'écriture**, parce que 0018 datait
d'avant les mécanismes qu'il devait respecter. Mesurés à l'aperçu :

| Correctif | Lignes touchées | Sans lui |
|---|---|---|
| journal `payments` fait foi sur `paidXof` (`apptPaidXof`) | **20** | 20 pièces soldées seraient parties en impayés |
| `prixParLongueur` (`svcPriceForAppt`) | **1** | −62 800 F au chiffre d'affaires |
| `forfait.totalXof` fait foi (`apptNetXof`) | 0 | inerte ici, indispensable si 0018 est réutilisé |
| `depositCreditXof` sur acompte confirmé | 0 | idem — l'acompte serait encaissé deux fois |

Écartés sans dommage : 8 rituels à net nul, 0 sans lignes au catalogue, 0 datés
du futur.

**Conséquence attendue, à ne pas prendre pour une régression :** le registre des
encaissements ne lit que les factures (`buildReceipts` ①). Les mois d'octobre à
août gagnent rétroactivement les 14 239 400 F des pièces payées — cette recette
existait, elle n'avait aucun document pour la porter. La Synthèse, elle, ne
bouge pas d'un franc.

Le rollback complet (factures + liens `invoiceId`) est en fin de
`supabase/0018_factures_reprise.sql`. L'étape 2 y reste **commentée** : le
fichier ne doit jamais pouvoir s'exécuter d'un copier-coller distrait.

#### Les 27 impayés — examinés le 9 août, DÉCISION PRISE : ne rien changer

Dispersés sur dix mois, aucun schéma répété : **ce ne sont pas des lacunes de
saisie de l'ancien ERP, ce sont des cas individuels.** Pas de solde en masse —
la question a été posée et tranchée, ne pas la rouvrir.

**Cinq rituels ont reçu un acompte au comptoir — 155 000 F — qui ne compte plus
nulle part**, et c'est assumé. Le revenu se lit `apptRev` (rituels SANS facture)
+ `invRev` (factures **payées**) : une pièce `envoyée` ne compte ni au chiffre ni
à la caisse, même pour la part déjà versée. Ces 155 000 F reviendront quand le
comptoir soldera chaque rituel à la main — datés de ce jour-là, pas du rituel.
Proposition de scinder en deux pièces (une `payée` du reçu, une `envoyée` du
reste, comme le fait la Caisse) **écartée par Yéman**.

*(Dépôt PUBLIC : les pièces se désignent par leur NUMÉRO, jamais par le nom de
la cliente. La jointure `invoices` → `appointments` → `clients` le rend en une
requête, au comptoir, là où c'est légitime.)*

| Pièce | Dû | Reçu | Reste |
|---|---|---|---|
| MND-R-0220 | 92 000 | 50 000 | 42 000 |
| MND-R-0271 | 75 000 | 45 000 | 30 000 |
| MND-R-0252 | 42 000 | 30 000 | 12 000 |
| MND-R-0134 | 16 000 | 15 000 | 1 000 |
| MND-R-0232 | 16 000 | 15 000 | 1 000 |

L'affichage, lui, est juste : Dashboard et Comptes passent par `apptDueXof`
(net − encaissé − acompte) et montrent le RESTE, jamais le net plein. Aucun
risque de relancer sur un mauvais montant. Reste réellement dû : **1 186 000 F**.

**Quatre choses à vérifier avant toute relance** (aucune n'est faite) :

- **MND-R-0118 et MND-R-0121** — même cliente, même jour (20 mars), même montant
  (30 000). Doublon probable ; `supabase/audit_duplicate_appointments.sql`.
- **MND-R-0003, 0004 et 0005** — trois têtes d'une même famille le 19 décembre
  2025, **151 500 F**. Un payeur pour trois, réglé une fois et inscrit sur
  personne : c'est le motif classique, et les comptes famille existent au Trône.
- **MND-R-0170, 0208 et 0273** — une même cliente, trois rituels (avril, mai,
  juin), 132 000 F, pas un franc inscrit.
- **MND-R-0134 et MND-R-0232** — 15 000 versés sur 16 000, deux fois. Ce n'est
  pas une dette de 1 000 F, c'est un prix consenti à 15 000 que l'ancien ERP ne
  savait pas écrire.

**MND-R-0330, 313 000 F au 31 juillet**, pèse à elle seule 23 % des impayés.
C'est le rituel repassé en mi-long ci-dessus ; neuf jours d'ancienneté, sans
doute simplement pas encore réglé.

### Annuler un encaissement SUPPRIME sa pièce — corrigé le 9 août 2026

`cancelAppointmentPayment` (clients/actions.tsx) laissait deux fuites derrière
elle. Découvertes sur une fiche cliente qui portait **neuf factures pour trois
rituels**.

**① La pièce était abandonnée, pas supprimée.** L'annulation la basculait de
`payée` à `envoyée` et la laissait dans la base, détachée de son rituel. Résultat :
une créance fantôme qui gonfle les impayés, alerte sans fin dans le tiroir, et
s'offre au « Solder par l'avoir » que les pièces liées, elles, refusent. Un même
rituel repris **cinq fois** au comptoir le 8 août avait laissé quatre pièces
derrière lui — **212 000 F d'impayés qui n'existaient pas**.

**② Elle ne traitait que la DERNIÈRE facture.** Le rendez-vous ne retient qu'un
`invoiceId`, mais l'annulation efface le journal ENTIER (`payments` et `paidXof`
à zéro). Sur un rituel réglé en plusieurs fois, les pièces précédentes restaient
donc `payée` **et** orphelines : elles continuaient de compter au chiffre
d'affaires pendant que le rituel redevenait impayé. Jamais observé en vrai, mais
armé et prêt à partir.

Corrigé : toutes les pièces nommées par `invoiceId` **et** par
`payments[].invoiceId` sont supprimées, les avoirs consommés rendus d'abord.
La confirmation et le message le disent — la suppression est irréversible.

**Comment reconnaître les résidus déjà en base.** La série `F-AAAA-NNNN` n'est
émise que par la Caisse (`actions.tsx`, deux endroits), et la Caisse écrit
**toujours** `status: 'payée'`. Une pièce `F-` à l'état `envoyée` ne peut donc
être qu'un encaissement annulé ; orpheline de surcroît, c'est un résidu. La
requête de balayage est dans l'historique de la session du 9 août. **Le filtre
`F-%` est essentiel** : une `MND-AAAA-NNNN` en `envoyée` est une vraie facture en
attente, créée à la main depuis l'écran Factures.

Deux séries à ne pas confondre avec des doublons : **`MND-V-…` vient de l'ancien
ERP** (voir `nextInvoiceNumber`, finance.ts) — ventes au comptoir, sans rituel
par nature ; et `MND-R-…`, les 335 pièces de reprise du 9 août.

Le chiffre d'affaires n'a jamais été faussé par ① : `invRev` ne compte que les
`payée`. Ce sont les impayés, les notifications et la confiance qui l'étaient.

**③ Annuler un encaissement DÉS-HONORAIT le rituel** (honoré → confirmé) et
reprenait les points du Cercle. Il défaisait un geste qu'il n'avait jamais posé :
**encaisser n'honore pas** — c'est écrit dans la Caisse, on encaisse d'avance un
rituel qui n'a pas encore eu lieu, et l'honneur se donne par le geste dédié du
Carnet. L'annulation ne doit donc pas dés-honorer : un rituel a eu lieu ou non,
que la cliente ait payé n'y change rien.

Le prix de cette confusion était lourd et silencieux : le rituel dé-honoré ne
comptait **plus nulle part** — `apptRev` ne retient que les honorés SANS facture,
`invRev` que les pièces payées, et la pièce venait d'être supprimée. Le chiffre
d'affaires perdait le montant sans rien dire. Il revient désormais au Carnet, et
le rituel rejoint les impayés, ce qu'il est. Dés-honorer reste possible au
Carnet, à la main, quand c'est bien l'honneur qui était faux.

Même correction dans `rewindPaymentForDeletedInvoice` (suppression d'une pièce
depuis l'écran Factures) : mêmes causes, même remède. `resetAllPaidInvoices` est
laissée telle quelle — c'est une remise à zéro assumée, qui veut justement tout
rembobiner pour ressaisir chaque paiement à la main.

Les deux confirmations à l'écran disent maintenant ce qui se passe vraiment, y
compris que **le rituel reste honoré et garde ses points**.

### CHANTIER DEMANDÉ — second téléphone + diaspora automatique (9 août)

1. **Deux numéros par cliente.** `Client.phone` + `phone2`. Les deux doivent
   servir au rapprochement (import, reprise Firebase, recherche du Carnet) :
   normaliser AVANT de comparer, sinon on recrée des doublons.
2. **Numéro étranger → Diaspora.** Bénin = `+229`. Tout autre indicatif classe
   la fiche en diaspora. Vaut pour la saisie ET pour l'import.
3. **Repasser sur le CRM existant** (178 têtes) pour reclasser les fiches déjà
   saisies avec un numéro étranger.

**LE PIÈGE À NE PAS IGNORER.** « Diaspora » n'est pas une propriété du numéro
mais de la personne. Une cliente installée à Cotonou peut garder un numéro
français ; une cliente de Paris peut avoir gardé son 229. La déduction doit
donc rester **une suggestion écrasable** : marquer la fiche `diasporaAuto: true`
tant que personne n'a tranché à la main, et ne JAMAIS réécrire un classement
posé manuellement. Sinon la reclassification de masse effacera le travail de
Yéman à chaque import — c'est la même faute que l'attribution en masse des 406
RDV, retirée le 7 août.

Prévoir un aperçu avant écriture (combien de fiches basculent, lesquelles), au
même titre que 0018.

### Synchro en échec — instrumentée le 9 août, cause à confirmer en base

**La pastille dit désormais POURQUOI.** Nommer les tables (6 août) évitait
d'ouvrir la console pour savoir *lesquelles* ; le 9 août il a fallu la rouvrir
pour savoir *pourquoi*. Or la cause change tout : une migration jamais collée se
répare en trente secondes, un réseau coupé s'attend. `SyncState.failedWhy` porte
maintenant, par table, le message brut du serveur et sa traduction — table
absente · colonne manquante · contrainte · serveur injoignable · session
expirée. Les tables sont **groupées par cause** : trois tables absentes font une
phrase, pas trois.

**Rappel à ne pas perdre :** un refus de DROIT n'allume PAS le rouge
(`estRefusDeDroit` → `horsPortee`). Ce qui s'affiche est donc une vraie panne —
table absente, colonne absente, contrainte, réseau. C'est ce qui rend le
diagnostic possible : la cause est dans cette courte liste.

**`supabase/audit_synchro.sql`** — lecture seule, relançable. Pour les 33 tables
liées : existe-t-elle · a-t-elle `data` / `branch_id` / `updated_at` · RLS active
sans aucune politique (= tout refusé) · dans la publication Realtime · combien de
lignes CE compte voit · et ce que `is_staff()` répond pour lui. **À lancer avec
le compte qui voit le rouge.** Le verdict est écrit en clair sur chaque ligne.

Piste la plus probable, à confirmer : `academy_applications` vient de
`0013_payroll_academy.sql`, dont rien n'atteste le passage dans ce document —
alors que `0026` (qui suppose `attendance`, créée par 0013) est notée passée.

#### Deux documents que Ma Couronne lisait sans en avoir le droit

Trouvés en tirant ce fil — **`supabase/migrations/0029_documents_lisibles_couronne.sql`**
(**PASSÉE le 9 août**, sous le nom 0028 : une autre session écrivait au même
moment `0028_comptes_enfants.sql`, et deux 0028 dans le dossier auraient fini par
en faire sauter un. Renumérotée après coup, contenu inchangé, idempotente),
à coller. La liste blanche `docs_pub_read` (8 clés en 0006, 9 en 0011) en oubliait
deux :

- **`mnd_model_band_sets` — les barèmes par atelier.** Lu par la réservation de
  Ma Couronne (`useBandSets` → `pricingOf`). Son défaut de code n'est PAS vide :
  il porte `VEKPE_BANDS_SEED`. Une cliente ne lisait donc pas « rien », elle
  lisait **les coefficients d'origine**. C'est le bogue que 0011 a réparé pour
  `mnd_model_bands` ; celui-ci est né après, la liste n'a pas suivi.
- **`mnd_cercle_seuil`** — le seuil d'entrée au Cercle, lu par Ma Couronne pour
  dire « encore N passages ».

**VÉRIFIÉ, ET SANS DOMMAGE — 9 août.** La divergence était réelle : le serveur
porte VÈKPÈ™ Jumbo à coef 0,8 / durCoef 0,8 et Medium à 1,47 / 1,8, quand le seed
dit 0,53 / 0,74 et 1 / 1. Mini, Micro, Nano et Galaxy sont identiques.

Mais elle n'a **rien déplacé**, pour deux raisons qu'il faut retenir :

1. **Le coefficient ne touche pas le prix d'une création.** `personalPriceXof`
   n'utilise `bande.coef` qu'en DERNIER recours (pricing.ts:370-377) : une
   prestation qui porte un `ratePerLock` — VÈKPÈ™, 1 100 F le lock — se tarife
   avant, par le comptage ou par le plancher de son calibre. Pour le prix, seule
   compte l'IDENTITÉ de la tranche, donc les `maxLocks` — inchangés.
2. **La durée, elle, était bien sous-estimée** (`personalDurationMin` applique
   `durCoef` toujours, quel que soit le mode de tarif) : une création Medium
   réservée en ligne bloquait le fauteuil 1 fois la durée nominale au lieu de
   1,8. **Mais aucune n'a été réservée** : `audit_vekpe_couronne.sql` ④ rend
   **0 rendez-vous, 0 journée** depuis le 3 août. Les créations se prennent au
   comptoir, pas en ligne.

Rien à re-facturer, aucun créneau à reprendre. `supabase/audit_vekpe_couronne.sql`
est conservé : il se relancera tel quel si le doute revient.

**Ce que cet épisode apprend, et qui vaut au-delà :** `durCoef` agit sur TOUTES
les prestations, `coef` seulement sur celles qui n'ont ni tarif au lock ni
grille par calibre. Un écart de barème se lit donc d'abord au CALENDRIER, pas à
la caisse. À garder en tête pour le chantier « restrictions du calendrier »
(8 août), qui demandait précisément quelle durée le tunnel passe à `durationMin` :
la formule est bonne, c'est le barème qui ne lui parvenait pas.

**LE PIÈGE DE CETTE FAMILLE, à retenir :** la RLS ne rend pas d'erreur sur une
LECTURE, elle rend **zéro ligne**. Rien ne casse, la pastille reste verte, la
console est muette — le magasin garde sa valeur par défaut et l'écran l'affiche
avec le même aplomb que la vraie. Toute clé ajoutée à `documents` et lue côté
cliente doit entrer dans `docs_pub_read`, sans quoi elle ment en silence.
La section ⑤ de `audit_synchro.sql` liste la liste blanche courante.

### ⚠ SYNCHRO EN ÉCHEC, de nouveau (9 août) — constat d'origine
Vu sur la capture : `academy_applications`, `branches`, `client_sessions`, et
d'autres tronquées. Tables DIFFÉRENTES de celles corrigées le 6 août (la cause
racine d'alors — hydratation avant restauration de session — est réglée).
À diagnostiquer AVANT toute nouvelle fonctionnalité : tant que la pastille est
rouge, une saisie peut ne pas partir. Regarder d'abord si ce sont des refus RLS
(`estRefusDeDroit`) sur des tables sans politique pour ce rôle.

**DIASPORA — approche retenue avec Yéman (9 août).** Ne rien déduire
automatiquement. Le système ne sait presque rien : l'indicatif dit d'où vient la
ligne, pas où vit la personne, et `city` est vide sur la quasi-totalité des 178
fiches. Compteur « Diaspora 0 » aujourd'hui.

Le seul signal fort n'est pas dans les champs mais dans le RYTHME : la diaspora
vient en rafale (2-3 RDV en dix jours, parfois consécutifs), puis disparaît 6 à
12 mois, et réserve longtemps à l'avance. Cotonou revient toutes les 4-8
semaines. Ce dessin est déjà dans les 393 rendez-vous.

Donc : (1) DEMANDER — une question à la réservation Ma Couronne « Tu vis au
Bénin ou à l'étranger ? » et un bouton à deux états sur la fiche ; répondu une
fois, réglé pour toujours. (2) Les signaux ne servent qu'à dresser une LISTE À
RELIRE, jamais à écrire : un écran « ces N fiches ressemblent à de la diaspora »
que Yéman tranche en N clics, une fois.

**PREMIER PAS CONVENU, sans rien écrire :** sortir cette liste depuis l'agenda
(numéro étranger OU visites en rafale espacées de plus de 6 mois) pour voir
combien des 178 têtes portent la signature du voyage — et décider ensuite si le
chantier vaut la peine.

Le bénéfice visé n'est pas la statistique mais la RELANCE : « ta couronne a six
semaines » envoyé à quelqu'un qui vit à Paris est du bruit, et le bruit fait
ignorer tous les messages suivants.


---

## ▶ PRIORITÉ 1 — Les clientes de passage — ✅ CONSTRUIT le 9 août 2026

**Un champ, `Client.dePassage`, et un seul prédicat**, `estDePassage`
(shared/clients.ts). Pas un segment : un segment se renomme et s'efface depuis
la liste, et le prédicat casserait en silence — c'est déjà la fêlure de la
Diaspora, où `isDiaspora` lit le SEGMENT tandis que `litSignaux` lit le CHAMP
`diaspora`. Deux vérités pour une notion ; ici il n'y en a qu'une. Aucun SQL :
les fiches sont du JSONB `data`.

**La coupure, écran par écran.** DANS l'argent et le travail — Synthèse, Bilan,
registre, production, seuils, commissions : rien n'a bougé, et c'est voulu.
HORS des têtes : « Têtes couronnées » et « Nouvelles ce mois » (Customers),
« Têtes actives » et son dénominateur (Analytics), `heads` et `nouvelles`
(Bilan mensuel), les tailles et valeurs d'audience (Marketing), la prédiction de
cadence sur la fiche — celle qui disait « proposez le fauteuil » à qui n'avait
qu'une venue. Un RDV DÉJÀ PRIS s'affiche toujours : c'est un fait, pas une
prédiction.

**Le panier moyen n'était pas en cause** — il se calcule par rituel honoré, pas
par tête ; des fiches en plus ne le touchent pas. Ce qui se brouillait, c'est la
rétention et le rapport têtes actives / carnet.

**La saisie tient dans le sélecteur de cliente** (`ClientPicker`, deux nouveaux
drapeaux) : « ＋ Cliente de passage » ouvre deux champs — prénom, téléphone — et
reprend ce qui était déjà tapé (des chiffres vont au téléphone, des lettres au
prénom). Posé au RDV, à la Caisse et aux Factures. Troisième registre au CRM à
côté de La Maison et de la Diaspora, avec son bandeau qui dit sa propre règle.
Les registres sont disjoints et **la marque prime sur la Diaspora** — une
passante étrangère est d'abord une passante.

**La promotion se fait seule** (`usePassageVivant`, shell), verrous repris de
`usePersonaVivant` : sans session on n'écrit rien, rien de chargé = on attend, et
**le geste est à sens unique** — ce hook ne sait que RETIRER la marque, jamais en
poser une. Il compte les JOURS distincts honorés, pas les lignes : deux rituels
le même jour sont une seule visite, et un RDV manqué ne dit rien d'une relation.
La fiche affiche le même chiffre, sinon le comptoir voit « 2 séances » et
s'étonne qu'elle soit encore de passage.

**Le persona ne pouvait pas la porter**, vérifié avant d'écrire : `Client.persona`
est un slot unique qui dit un GOÛT (les dix archétypes sont tous des lectures du
*quoi*) ; il alimente le cran ② de `shared/reco.ts` ; et `usePersonaVivant` le
réécrit à chaque mouvement du carnet — le figer aurait gelé la lecture **à vie**.
Le statut vit donc à côté de l'archétype, sur la fiche, sous « Sa place à la
Maison ».

**« La Naissance » n'était pas une notion de cycle de vie.** La fiche affiche
`personaName(c.persona)` — donc un persona créé à la main. Le seul « La
Naissance » du code est le libellé de la catégorie `atl-i-vekpe` ; le seul
archétype voisin, `naissante`, se gagne sur `joursCouronne` — l'âge des LOCKS,
pas l'ancienneté de la cliente. L'import n'a semé qu'« Initiée ». Il n'y avait
rien à réutiliser.

### Le fantôme « walkin » — trouvé et refermé au passage

`ClientPicker` posait `clientId: 'walkin'`, un marqueur d'écran. La Caisse le
traduisait depuis toujours (`clientId: ''` + `clientName`), **mais pas les
Factures** : la pièce partait avec `walkin` en identifiant, et
`useReconcileClients` — qui ne sautait que `c-local` — y voyait un identifiant
orphelin et ouvrait **UNE fiche fourre-tout** où toutes les ventes sans cliente
venaient s'empiler. Corrigé aux deux bouts (traduction dans `saveDraft`, garde
dans `consider`).

L'option anonyme reste, et s'appelle désormais **« Vente au comptoir · sans
fiche »** : personne n'a à décliner son identité pour acheter un flacon. Elle ne
se confond plus avec la cliente de passage, qui reçoit un geste et doit donc
compter dans la production du maître.

### « TÊTE COURONNÉE » = VENUE AU MOINS UNE FOIS — 11 août

**Ouvrir un compte sur Ma Couronne créait une fiche pleine** (`ensureClient`) :
des gens inscrits qui n'étaient jamais venus comptaient parmi les têtes
couronnées, et chaque inscription écrasait un peu plus la rétention. Constaté
par Yéman (des comptes jamais venus) : **20 fiches sans AUCUN rendez-vous**, plus une
avec un RDV jamais honoré.

**On n'a posé aucune marque : on a corrigé la DÉFINITION.** Une tête est
couronnée quand la Maison l'a réellement couronnée — au moins une venue
honorée. Aucun champ, aucune migration, rien à entretenir ; un visiteur
devient une tête le jour où il s'assied.

- `tetesVenues(appts)` (shared/agenda.ts) — le SET des têtes venues, construit
  d'une passe ; `estCouronnee(c, venues)` et `estVisiteur(c, venues)`
  (shared/clients.ts). Le set se passe en ARGUMENT pour ne pas nouer les deux
  couches (clients.ts n'importe pas l'agenda).
- Appliqué à : la tuile « Têtes couronnées » (Dashboard), les registres et les
  compteurs de Clientes, « Têtes actives » et son dénominateur (Analytics),
  « Nouvelles » du Bilan mensuel.
- **Un 4ᵉ registre « Visiteurs »** dans Clientes, visible seulement s'il y en a.
- **UNE FICHE CRÉÉE AU COMPTOIR NAÎT « DE PASSAGE »** (décision de Yéman,
  11 août) : sans la marque, une tête créée avant sa première venue tombait
  chez les VISITEURS — pensé pour les comptes auto-inscrits de Ma Couronne,
  avec un bandeau qui le prétendait. La modale « Nouvelle tête couronnée » le
  dit avant d'enregistrer ; la 2ᵉ venue honorée lève la marque d'elle-même.
  Le bandeau des Visiteurs ne prétend plus qu'ils viennent tous de Ma
  Couronne (têtes déclarées pas encore passées, anciennes fiches comptoir).
- **« Sa place à la Maison » porte les TROIS places** (fiche → Profil) : Tête
  couronnée · Visiteur · De passage. **« Visiteur » ne se clique pas** — c'est
  un constat du carnet, pas un réglage : il n'y aurait rien à écrire, et un
  bouton qui ne fait rien se lit comme une panne. « Tête couronnée » est grisée
  tant qu'aucune venue n'est honorée, pour la même raison — c'est la venue qui
  couronne, pas le clic. « De passage » reste grisée au-delà de deux venues
  (la marque serait levée aussitôt).
- **MARKETING N'EST PAS TOUCHÉ, et c'est délibéré** : écrire à quelqu'un qui
  s'est inscrit sans venir, c'est justement l'inviter. Ce n'est pas du bruit,
  contrairement à une relance envoyée à une passante.
- Effet de bord assumé : une tête dont le PREMIER rendez-vous est pris mais pas
  encore honoré ne compte pas encore. C'est la vérité — elle
  comptera le jour où elle s'assied.
- **La racine n'est pas traitée** : `ensureClient` continue de créer une fiche
  à l'inscription. Ne la faire naître qu'au premier geste réel (réservation,
  commande, profil rempli) reste un chantier ouvert — il touche l'inscription,
  le profil et le tunnel.

### LE PASSÉ EST RECLASSÉ — 11 août 2026, 51 têtes marquées

Fait par `supabase/local_marque_de_passage.sql` (LOCAL et GITIGNORÉ — il sort
des noms). **64 des 178 fiches n'avaient qu'UNE venue, soit 36 % du CRM** :
c'est ce qui faussait la rétention et le compte des têtes actives.

- **Seuil retenu : 8 semaines** (51 têtes). Les 13 écartées sont des venues de
  moins de 56 jours — **des NOUVELLES, pas des passantes** : les marquer aurait
  fait taire la relance au moment précis où elle sert. Elles tomberont d'elles-
  mêmes si elles ne reviennent pas : **le script est RELANÇABLE**, à passer une
  fois par mois.
- **Deux exclusions non négociables** : toute tête qui a un rendez-vous À VENIR
  (elle revient, c'est un fait) — 0 dans ce lot — et celles déjà marquées.
- **Table de secours `repli_de_passage`** : le rollback ne défait QUE les
  fiches de ce script, jamais une marque posée à la main au comptoir.
- **Le filet tient** : `usePassageVivant` ne sait que RETIRER la marque, à la
  2ᵉ venue honorée. Une erreur se répare donc à la prochaine visite.
- Observations à garder : des FAMILLES entières y sont (trois Dossou-Yovo le
  même jour, trois Aïssi, deux Biao) — chaque tête n'est venue qu'une fois,
  mais c'est le PAYEUR qu'une relance devrait viser. Et une quinzaine de ces
  têtes sont celles de la liste diaspora (numéro étranger + une venue) : très
  probablement des passages pendant un séjour, ce qui réduit d'autant le
  chantier Diaspora.
*(La question des points Cercle a été tranchée le 9 août — voir juste en dessous.)*

### Le Cercle se gagne au 3ᵉ passage — 9 août 2026

**Décision de Yéman : un passage ne donne pas accès au Cercle. On y entre à
partir du 3ᵉ passage à la Maison MND.** Ce qui se donne à tout le monde ne
récompense personne.

**Le seuil est un réglage, pas une constante** : `cercleSeuilStore` (shared/
offers.ts), 3 par défaut, corrigé d'un champ au Trône → Le Cercle → Les paliers,
à côté du taux de points. Toute la Maison le lit par `estDuCercle(venues, seuil)`.

**À PARTIR DU 3ᵉ, sans rattrapage.** Les deux premières venues n'attribuent
aucun point et ne sont pas créditées après coup : elle entre ce jour-là et gagne
à partir de là. C'est aussi ce qui se dit le plus simplement au fauteuil — « le
Cercle s'ouvre à votre troisième venue ». *(Si la Maison préfère créditer les
trois d'un coup à l'entrée, c'est une seule ligne dans `honorAppointment`.)*

**La porte est à l'endroit exact où les points s'écrivent** (`honorAppointment`,
clients/actions.tsx) : on compte ses venues AVANT d'écrire — celle en cours
comprise, puisqu'elle a lieu — et on n'attribue rien sous le seuil. Rien
n'accumule en coulisses. `awardLoyalty` reste le bas niveau, et les ajustements
à la main du gérant ne sont pas bridés : c'est un geste, il répond de son geste.

**Un seul compteur de venues pour la Maison** : `venuesHonorees` (shared/
agenda.ts) — des JOURS distincts, et seulement de l'honoré. Deux gestes le même
jour font une visite ; un rendez-vous manqué n'en fait aucune. Les deux seuils
s'y adossent, et c'est pour cela qu'il est partagé : s'ils comptaient chacun à
leur façon, la fiche dirait deux chiffres pour la même personne.

**Deux seuils, et c'est voulu.** 2ᵉ venue → elle cesse d'être de passage (la
Maison la reconnaît comme une relation). 3ᵉ venue → elle entre au Cercle. Être
une cliente et être reconnue ne se gagnent pas au même prix.

**Le Cercle compte par la PAYEUSE** (`apptPayeurId`), la marque de passage par
celle qui S'EST ASSISE. C'est la même clé que les points : un rituel qu'on lui a
offert ne la fait pas entrer, sinon la Maison ouvrirait le Cercle à l'une et
créditerait l'autre.

**Ce que les écrans montrent désormais.** « Têtes dans le Cercle » comptait TOUTES
les clientes de la branche — un registre qui annonçait 186 membres d'un programme
où personne n'était entré. Il ne compte plus que les membres, et le registre des
soldes gagne une section **« Aux portes du Cercle »** (venues acquises, ce qu'il
reste), parce que c'est là que se lit ce dont on peut parler au fauteuil. Sur Ma
Couronne, une non-membre voit son chemin — « 1 passage sur 3 » — et non une barre
de paliers figée à zéro, qui se lit comme une panne. La fiche du Trône le dit
aussi, sous « Sa place à la Maison ».

**Sans effet sur les données** : `pointsEnabledStore` est encore à `false` — le
programme n'a jamais attribué un point, et Shell a déjà remis les soldes à zéro
(`points_reset_2026_07`). La règle s'appliquera dès le lancement.

<details><summary>La demande d'origine — conservée</summary>

**À faire AVANT les autres chantiers.** Demande explicite de Yéman.

**Le problème.** On ne peut pas ne pas les enregistrer : l'argent doit être tracé
et la prestation doit compter dans la production du maître. Mais leur ouvrir une
fiche pleine gonfle le CRM de poids mort — 178 têtes deviennent 400, la
rétention s'effondre sans que rien n'ait changé dans la maison, le panier moyen
se brouille, et les relances partent vers des gens qui ne reviendront pas.
Le tort n'est pas de les enregistrer, c'est de les COMPTER comme des clientes.

**La forme retenue.**
1. **Une seule mécanique.** Une fiche comme les autres, marquée « de passage ».
   Pas de registre parallèle : deux registres finissent toujours par diverger
   (cf. les deux cartes d'horaires, 6 août).
2. **Identité minimale** — prénom + téléphone. Rien d'autre. Demander une date de
   naissance à qui ne reviendra pas gaspille le seul moment où elle est là.
3. **Séparation nette dans les chiffres.** DANS le chiffre d'affaires et dans la
   production / les seuils du maître (argent et travail réels). HORS des têtes
   actives, de la rétention et des relances (ce n'est pas une relation).
   Même distinction qu'entre encaisser et honorer.
4. **Promotion automatique au 2ᵉ rendez-vous.** Elle cesse alors d'être de
   passage. Ici la déduction EST légitime — contrairement à la diaspora — parce
   qu'elle porte sur un fait observé (elle est revenue), pas sur une supposition
   quant à sa vie. Rien à entretenir à la main.

**À vérifier d'abord :** ce que portent déjà les PERSONAS et les segments. La
fiche d'une cliente affiche « La Naissance » — une notion de cycle de vie
existe donc. Un statut de passage y trouve peut-être sa place sans rien ajouter.

*(Vérifié le 9 août : non. « La Naissance » est un persona posé à la main, et les
dix archétypes disent un goût, pas un cycle de vie — voir plus haut.)*

</details>
