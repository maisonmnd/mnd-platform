# Reprendre — état de la Maison

État au 6 août 2026. À lire en premier dans une nouvelle session.

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

La longueur **se choisit à la réservation**, pas sur la fiche cliente : le
calibre se constate une fois au KÒKÒ™ et ne bouge plus, la longueur repousse.
Elle s'inscrit sur le rendez-vous (`Appointment.longueur`), si bien que relire
un rituel de mars ne le retarife jamais à la longueur d'aujourd'hui.

Un prix par longueur est un prix SAISI : tant que ni le modèle ni le Juste Prix
ne le modulent, il sort au franc près, sans l'arrondi commercial au 500 F.

Le sélecteur paraît à la réservation et à la Caisse dès qu'une prestation
choisie s'y facture. **Ma Couronne ne le porte pas** — une cliente n'évalue pas
sa propre longueur ; le comptoir corrige à l'arrivée.

## Le piège à ne pas oublier

Un rendez-vous ne stocke ni la maison ni la catégorie de ses prestations, mais
leurs identifiants. La ventilation se recalcule à chaque affichage depuis le
catalogue courant : **déplacer une prestation reclasse tout l'historique**, et
mettre son prix à zéro vide sa part du chiffre sur les cartes du Catalogue
(le total du rituel, lui, ne bouge pas s'il est figé).

## Deux barèmes à revoir, sans urgence

- **YÈKPÈ™ Couleur · La Révélation Végétale** — saute de 15 000 à 65 000 F entre
  court et mi-long, et n'a pas de long.
- **Manucure** et **Pédicure** — leur prix suit une longueur de cheveux qui ne
  les concerne pas. Héritage de l'ancien catalogue, appliqué partout.

## Chantiers ouverts par ailleurs

- **Factures de reprise** : `supabase/0018_factures_reprise.sql` est prêt,
  jamais exécuté. 335 pièces, statut réel selon le règlement. Décision prise,
  exécution en attente.
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

**Toujours en attente** (inchangé) : `0027_rattachement_cliente.sql` et
`0018_factures_reprise.sql` jamais exécutés ; barèmes YÈKPÈ Couleur et
Manucure/Pédicure à revoir ; notification APDP de la fuite du 2 août.
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
