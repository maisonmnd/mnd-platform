# Reprendre — état de la Maison

État au 15 août 2026. À lire en premier dans une nouvelle session.

## Le choix d'une prestation, rangé par atelier — 28 août, PUBLIÉ

« Ça va dans tous les sens et je ne me retrouve pas facilement. Partout où je
dois sélectionner des prestations, assure-toi de bien organiser la sélection »
(Yéman).

Sept écrans offraient la même liste À PLAT, dans l'ordre où le catalogue les
rendait, c'est-à-dire aucun : une soixantaine de lignes où VÈKPÈ™, GBÈJÍ™ et le
styling se succédaient sans logique.

**LES ATELIERS SONT LA CARTE MENTALE DE LA MAISON** — ils nomment les
prestations, ils sont dans la bouche de l'équipe. Les `<optgroup>` sont donc les
ateliers, dans LEUR ordre (`order`), alphabétique à l'intérieur.

`OptionsPrestations` dans `routes/_ui.tsx`, **un seul composant pour les sept
écrans** : Abonnements, Factures, Marketing, Personas, Le Juste Prix, Le Cercle
(qui avait son tri à lui, du 25 août, désormais retiré). Sept tris copiés
auraient divergé au premier ajout de catégorie. Le Catalogue garde le sien, plus
riche (il groupe aussi par « monde »).

## Payer en 2 ou 4 fois — 28 août, PUBLIÉ

« Mets un système de paiements en 2 ou 4 fois pour les abonnements au-delà de
100 000 F » (Yéman). C'est un OUTIL DE VENTE avant d'être un outil comptable :
peu de têtes sortent 125 000 F d'un coup, et la Maison perdait la vente entière
faute d'avoir su la découper.

`src/shared/echeancier.ts`, pur, éprouvé par `node scripts/verifie-echeancier.mjs`
(31 assertions). **Trois règles qui ne se devinent pas** :

1. **LE SEUIL EST UNE PORTE, pas une obligation.** Sous 100 000 F on ne découpe
   pas : quatre échéances de 8 750 F coûtent plus cher à suivre qu'elles ne
   rapportent, et habituent la Maison à courir après des miettes.
2. **L'ARRONDI VA SUR LA PREMIÈRE.** 100 003 F en 2 fois donne 50 002 + 50 001,
   jamais deux fois 50 001. La somme des parts vaut EXACTEMENT le total : un
   franc perdu à l'arrondi devient un écart de caisse inexplicable un an plus
   tard.
3. **LES RÈGLEMENTS S'IMPUTENT DANS L'ORDRE**, la plus vieille échéance
   d'abord ; ce qui déborde coule sur la suivante. Sans cette règle, « deux
   échéances de retard » ne veut rien dire.

L'échéancier (dates + montants) s'écrit UNE FOIS à la signature, comme une
parole donnée. **L'état de chaque échéance ne se stocke jamais**, il se dérive
des règlements — un « payé » écrit à côté de ses versements finit toujours par
les contredire.

Il se lit à trois endroits : le tableau des abonnés (un retard qu'il faut ouvrir
une fiche pour voir n'est pas un retard vu), la modale de règlement (pastilles
vert / cuivre / brique, bouton « Encaisser ce montant » sur la prochaine), et le
montant proposé par défaut, qui est celui de la prochaine échéance et non du
cycle entier.

## CHAQUE TÊTE A SES PROPRES MOUVEMENTS — 28 août, PUBLIÉ

« Les mouvements des enfants dans un foyer portent tous les mouvements de leur
parent. Faire la distinction. Chloey et Kaitlyn doivent avoir des mouvements
propres à elles-mêmes » (Yéman).

Le relevé d'un foyer se lisait **entier sur la fiche de chaque tête** : la fille
voyait les rituels de sa sœur, et rien ne disait lesquels étaient les siens.

`EcritureCompte.pour` porte désormais la tête concernée : le rituel et ses
versements vont à `a.clientId`, la facture à **`i.forClientId ?? i.clientId`**
(une mère qui paie le rituel de sa fille reste la payeuse, mais le mouvement
appartient à la fille).

**LES AVOIRS RESTENT AU FOYER** — `pour` absent. Ils sont portés par le compte,
jamais par une personne : c'est la payeuse qui a déposé, et n'importe quelle
tête les consomme. Les attribuer à l'une d'elles serait faux.

L'écran ouvre sur **« Ses mouvements »** ; « Tout le foyer » se demande, et
chaque ligne y dit alors de qui elle est, ou « au foyer » pour les avoirs.

### L'ordre d'une même journée, corrigé au passage

Trouvé en éprouvant les foyers : les écritures se rangeaient par identifiant à
date égale, si bien qu'un règlement (`p-…`) passait **avant** le rituel (`r-…`)
qu'il paie. Le solde courant montrait la cliente en crédit avant que le service
existe. Ce qui est LIVRÉ vient d'abord, ce qui est VERSÉ ensuite —
`rituel · facture · avoir · règlement`.

`verifie-compte` monte à **68 assertions**.

## UN PAQUET NE SE MULTIPLIE PAS — 28 août, PUBLIÉ

« L'Éclosion est un abonnement annuel, pourquoi c'est écrit prix mensuel ? De
même pour tous les autres abonnements à l'année » (Yéman).

Le défaut allait plus loin que le libellé : **le sélecteur de cycle appliquait
la règle des cycles à TOUT**, paquets compris. L'Éclosion, 225 000 F pour douze
mois, s'affichait « 225 000 F /mois » en vue mensuelle et se serait affichée
**2 250 000 F** en vue annuelle. Le prix d'un paquet est son prix, entier, une
fois — un paquet n'a pas de cycle, il a une durée de vie.

`prixDeLaFormule(p, cycle)` dans `shared/abonnements.ts` rend le montant, la
période (« · 12 mois » ou « / mois »), les mois offerts, les mois couverts et
**le mot juste pour le formulaire** (« Prix du paquet » / « Prix mensuel »).
Il gouverne la carte de formule, la modale d'inscription, le menu déroulant,
l'échéancier, la modale de règlement, Ma Couronne et la Carte du comptoir.

`partMensuelleDeLaFormule` corrige le **MRR** : un paquet de 225 000 F sur
douze mois pèse 18 750 F par mois. Le compter entier gonflait le revenu
récurrent du mois de la signature, puis il disparaissait.

### Le mode devient éditable

Il ne l'était nulle part : **toute formule créée à l'écran était forcément un
abonnement**. Un paquet vendu comme abonnement se recharge tous les mois — la
Maison offrirait ses crédits à vie sans s'en apercevoir. Le formulaire porte
maintenant « Abonnement · il se recharge » / « Paquet de crédits · il s'épuise »
et, pour un paquet, ses mois de validité.

`verifie-formules` monte à **119 assertions**.

## UN SEUL JUGE DU DÛ — 28 août, PUBLIÉ

« Pourquoi quand je vais sur le compte de Merine ce n'est pas marqué qu'elle
doit à la Maison ? Aligner toutes les informations, rendre tout cohérent »
(Yéman). La Famille Zinsou devait **104 400 F** dans l'écran des Impayés et
**rien du tout** sur la fiche.

**TROIS ÉCRANS JUGEAIENT DIFFÉREMMENT :**

| Écran | Ce qu'il acceptait |
| --- | --- |
| Le Compte (fiche) | `status === 'honoré'` seulement |
| Les Impayés (Comptes & Avoirs) | tout ce qui n'est pas `annulé` |
| Les Créances | tout ce qui n'est pas `annulé` |

**« HONORÉ » NE PEUT PAS ÊTRE LE JUGE.** C'est un geste SÉPARÉ dans cette
Maison — « encaisser ≠ honorer », elle le dit elle-même — posé souvent en
retard, parfois jamais. Faire dépendre la dette d'un clic qu'on oublie, c'est
**cacher de l'argent dû** : la faute la plus grave des deux.

**« NON ANNULÉ » NE SUFFIT PAS NON PLUS** : un rituel prévu le mois prochain
n'est pas une dette d'aujourd'hui.

**LE JUGE EST DONC LA DATE.** `rituelAuCompte(a, aujourdhui)` dans
`shared/compte.ts` : le rituel entre quand il A EU LIEU, ou quand de l'argent a
déjà été posé dessus — sinon un acompte versé d'avance ferait un crédit sans le
débit qui lui répond.

Il gouverne désormais `ecrituresDuCompte`, `creancesDeLaMaison`, `duDeLaTete`,
`duDuCompte` et l'écran des Impayés. `duDeLaTete` et `duDuCompte` prennent un
argument de plus (`aujourdhui`) : le compilateur a trouvé l'appelant de
l'alerte au comptoir.

`verifie-compte` monte à **58 assertions**, dont une qui vérifie explicitement
que le relevé, les créances et le dû de la tête **disent le même chiffre**.

## Le carré de la carte des prix — 28 août, PUBLIÉ

« Dans QR code, crée-moi le QR code et le lien pour accéder à la page du
catalogue » (Yéman). Nouvelle carte dans **QR Codes › Elle arrive**, en tête.

L'écran du comptoir a une adresse ; elle méritait son carré. Ce n'est plus
seulement une tablette posée face à la cliente : **le lien s'envoie à celle qui
écrit « bonjour, c'est combien pour des locks ? »**, et elle lit la carte
entière sur son téléphone plutôt que de recevoir trois prix recopiés à la main.

**LES PRIX Y SONT TOUJOURS CEUX DU JOUR.** Un tarif recopié dans un message
vieillit dès la prochaine hausse et revient au comptoir comme une promesse ; ce
lien dit la vérité du moment.

Quatre gestes : afficher au comptoir, ouvrir la carte, copier le lien, copier le
message entier. L'adresse se construit sur l'origine COURANTE (`/trone/` en
ligne, la racine en développement), jamais un domaine en dur.

Elle compte dans la barre du haut : **sept codes**, et elle est toujours prête —
elle n'attend aucun réglage.

## La Carte : le glissement et le wifi — 28 août, PUBLIÉ

### Le doigt pousse, il ne vise plus

« Je préfère swiper sur l'écran et aller au suivant et revenir en arrière à ma
convenance » (Yéman). Les pastilles demandaient de viser ; le glissement ne vise
rien.

`directionDuGlisse(dx, dy)` dans `bridges.ts` — **le mouvement vertical ne
compte pas**. La carte défile de haut en bas : sans cette garde, chaque coup de
pouce ferait sauter une formule et personne ne comprendrait pourquoi l'écran
bouge tout seul. Un geste n'est retenu que s'il est franchement horizontal
(`|dx| >= |dy|`) et dépasse 48 px.

`indexSuivant` **boucle** : après la dernière revient la première. Un écran de
comptoir n'a pas de fin ; buter sur un bord donnerait l'impression qu'il est
cassé.

Le doigt glisse, les flèches servent la souris, les pastilles disent le rang, et
les flèches du clavier marchent aussi. `touch-action: pan-y` laisse le
défilement vertical intact.

### Le volet du wifi, après Réserver

**LE MOT DE PASSE NE S'AFFICHE PAS** — « le QR code suffit » (Yéman). Le carré
connecte le téléphone sans rien taper ; un mot de passe écrit en grand au
comptoir se recopie, se photographie, et vit ensuite loin du salon. Le nom du
réseau reste : il ne connecte personne et dit laquelle des deux box on a
rejointe.

**CE N'EST PAS UNE MESURE DE SÉCURITÉ, et il ne faut pas s'y tromper** : le
carré ENCODE le mot de passe, qui reste donc dans le document public. On retire
ce qui se lit d'un coup d'œil, pas ce qui existe. La Régie le dit en toutes
lettres.

`wifiPayload` est descendu dans `bridges.ts` et **éprouvé** : le format réserve
`;` `:` `,` `"` et l'antislash, et un mot de passe qui en porte un couperait la
chaîne. Le carré viserait alors un réseau au nom tronqué, et la panne serait
MUETTE — le téléphone dit « impossible de rejoindre », jamais pourquoi. C'est le
genre de défaut qu'on met un mois à comprendre parce qu'il ne touche qu'une
Maison sur vingt.


⚠️ **ALLUMER LE WIFI PUBLIE LE MOT DE PASSE dans un document lisible sans
compte.** La carte n'est personne : pour qu'elle affiche le réseau, il doit
vivre dans `mnd_vitrine_config`, qui est en lecture `anon`. Jusqu'ici le mot de
passe ne se voyait qu'au comptoir.

C'est pourquoi le volet est **éteint par défaut** et que la Régie l'écrit en
toutes lettres : le choix appartient à la Maison, pas au code. Un réseau invité,
séparé de celui de la caisse, reste le plus sage.

Le carré se scanne et connecte le téléphone sans rien taper ; le nom et le mot
de passe restent écrits en grand dessous, pour les téléphones qui ne lisent pas
les QR wifi. Un bouton « Reprendre le réseau des QR Codes » recopie ce qui est
déjà posé.

`verifie-formules` monte à **97 assertions**. Une attente était plus stricte que
le code sur le seuil de glissement : à 48 px pile le geste compte, et c'est la
bonne version — un doigt qui a parcouru la distance demandée ne doit pas se voir
refuser pour un pixel.

## DEUX DÉFAUTS DE COMPTE, corrigés — 28 août, PUBLIÉ

« Pourquoi la Maison doit à toutes ces clientes ? Pourquoi elles ont les mêmes
mouvements sur leurs comptes ? » (Yéman, trois fiches montrant toutes
« La Maison doit 346 000 F »).

### ① Les avoirs n'étaient filtrés par personne

Dans `ecrituresDuCompte`, les rituels étaient filtrés par tête
(`ids.has(a.clientId)`), les factures aussi (`ids.has(pour)`) — **la boucle des
avoirs n'avait aucun filtre**. Chaque fiche affichait les mouvements d'avoir de
la Maison ENTIÈRE : le même solde et les mêmes lignes sur toutes.

**Rien ne plantait.** L'écran répondait, avec assurance, la même chose à tout le
monde. Aucune exception, aucun typage ne rattrape ça : seule une vérification
qui MÉLANGE plusieurs porteurs pouvait le voir, et elle n'existait pas — le
harnais n'éprouvait qu'un seul client à la fois.

`CompteArgs.porteurs` est désormais **obligatoire**, pas facultatif : un champ
qu'on peut oublier se réoublie. Le compilateur a trouvé l'unique appelant.

### ② L'avoir consommé se comptait deux fois

Trouvé en cherchant le premier. Quand un rituel se règle par avoir,
l'encaissement inscrit **déjà** la somme entière dans les versements du
rendez-vous (`settleTotal`, avoir compris, voir `actions.tsx`). Le mouvement
`kind: 'usage'` la recréditait, et le solde enflait de la valeur de l'avoir à
chaque consommation.

**Seul le dépôt crédite.** L'usage et le remboursement SORTENT de l'avoir, donc
débitent. Le compte juste : dépôt +40 000, rituel −30 000, son versement
+30 000, usage −30 000 → reste 10 000.

La vérification d'origine sur les avoirs n'éprouvait que le dépôt et le
remboursement, **jamais l'usage**. Un cas non écrit est un cas non tenu.

`verifie-compte` passe de 35 à **46 assertions**.

## La Carte du comptoir — 28 août, PUBLIÉ

« Un catalogue des prix affiché sur un comptoir que le client peut faire défiler
en toute autonomie : nos offres, nos abonnements, avec réserver votre rituel »
(Yéman).

**UNE NEUVIÈME ENTRÉE, PUBLIQUE ET SANS COMPTE** : `carte.html` →
`src/apps/carte/`, livrée avec le site `trone` (donc `/trone/carte.html`). Ce
n'est PAS une page du Trône : la tablette reste sur le comptoir, parfois sans
surveillance, face à qui passe. Elle ne crée aucun dossier, n'ouvre aucune
fiche, ne connaît personne. Même laissée seule, il n'y a rien à y prendre.

Quatre volets : **Les rituels** (le catalogue par atelier, prix masqué = « sur
devis », jamais un chiffre inventé), **Les formules** (une à la fois, qui
défilent), **Care & Store**, **Réserver**.

**RÉSERVER SE FAIT SUR SON TÉLÉPHONE.** Sur une tablette partagée, se connecter
voudrait dire le faire devant tout le monde puis penser à se déconnecter, et la
cliente suivante hériterait du dossier de la précédente. Le QR déporte la
réservation là où elle est déjà connue.

**LES FORMULES DÉFILENT UNE À UNE.** Douze cartes entassées se lisent en petits
caractères, donc ne se lisent pas. Une seule, en grand, se lit. Neuf secondes
par défaut, réglable de 3 à 60 ; le doigt peut toujours devancer le rythme, et
tout geste remet le compteur à zéro.

**DEUX MINUTES SANS UN GESTE et la carte revient à son début** : la cliente
suivante la trouve au commencement, pas là où la précédente s'est arrêtée.

### Les réglages · Vitrine client › Régie

`VitrineConfig.carte` — logé là parce que **`mnd_vitrine_config` est déjà
lisible publiquement** : la carte n'est personne, elle doit lire ses réglages
sans compte. Un document neuf aurait demandé sa propre règle RLS et une
migration.

**ON MASQUE, ON NE SÉLECTIONNE PAS.** La liste dit ce qu'on RETIRE, jamais ce
qu'on garde : une liste blanche cache toute prestation née après elle, et la
Maison ne s'en aperçoit que le jour où une cliente demande pourquoi la nouveauté
n'est pas à la carte. C'est exactement ce qui est arrivé à `visibleCategories`,
resté vestige dans `Vitrine.tsx`.

**Les masques de la carte sont les siens**, distincts de ceux de Ma Couronne :
le comptoir et l'application cliente n'ont pas le même public.

**L'ABSENCE VAUT « TOUT MONTRER ».** Une Maison d'avant ce réglage n'a rien en
base : si le défaut masquait, sa carte s'ouvrirait vide sans que personne sache
pourquoi. `carteReglages` complète, et borne le défilement (un zéro seconde
ferait clignoter l'écran).

`verifie-formules` monte à **78 assertions**.

⚠️ Le tunnel du shell **avale un niveau d'échappement** dans les heredocs : un
`\n` écrit dans un script Python/Node y arrive en vrai retour à la ligne, ce qui
a cassé deux fois la conclusion d'un harnais. Construire la séquence avec
`chr(92) + 'n'`, ou passer par l'outil d'édition.

## L'Éclosion, les dates éditables, la porte du paiement — 28 août, PUBLIÉ

### L'Éclosion · le pack de la première création

« À la première création des locks, crée-moi le pack irrésistible avec 2 mois
offerts, des retouches post-création, le lavage et le resserrage, pour la
cliente qui doit se sentir suivie et en toute sécurité » (Yéman).

**LE MOMENT LE PLUS FRAGILE DE TOUTE LA VIE D'UNE COURONNE.** Les premières
semaines après une création, les locks bougent, la cliente doute, et c'est là
qu'on la perd — pas au bout d'un an. Ce pack achète cette peur et la remplace
par un calendrier.

**Il ne contient PAS la création** : une VÈKPÈ™ va de 80 000 à 385 000 F selon
le calibre, l'inclure rendrait le prix impossible à afficher. Il se vend AVEC
elle, au comptoir, le jour de la naissance.

225 000 F · 2 retouches offertes + 6 GBÈJÍ™ + 6 KLƆKLƆ™ · 12 mois. **Deux mois
offerts au sens exact de la Maison** : 270 000 F de rythme sur douze, dix payés
(270 000 × 10/12 = 225 000, le compte tombe juste et se vérifie devant elle).
Les retouches viennent EN PLUS — c'est ce qui rend l'offre irrésistible plutôt
que simplement avantageuse. Famille `naissance`, qui n'est donc plus vide.

⚠️ `sv-retouches-post-creation` est un identifiant SUPPOSÉ. S'il n'existe pas au
catalogue, le quota est filtré à la pose et il faut rattacher « Retouches Post
Création » à la main.

### Les dates d'échéance s'éditent

La vie ne suit pas le calendrier : un salaire qui tombe le 5, un voyage. **Une
date qu'on ne peut pas déplacer se contourne en ne payant pas**, et c'est la
Maison qui perd la trace. Champ date sur chaque ligne de la modale Régler.

`deplaceEcheance` — **l'ordre ne se casse jamais** : déplacer POUSSE les
suivantes (juste ce qu'il faut, une échéance déjà plus tardive garde sa date) et
une date antérieure à la précédente est BORNÉE plutôt que refusée. Les montants
ne bougent pas. Sans cet ordre, « deux échéances de retard » deviendrait
incalculable.

### La porte du rendez-vous

« Une cliente qui ne paie pas selon l'échéance ne peut pas prendre RDV sur la
plateforme » (Yéman). C'est la contrepartie honnête du paiement découpé : sans
elle, découper revenait à offrir le pack et espérer.

`peutReserver` + `JOURS_DE_GRACE = 7`. **Un seul jour de retard ne ferme rien** :
une échéance se règle rarement à l'heure dite, et bloquer au premier jour ferait
de la règle une punition plutôt qu'un cadre. Au huitième jour, Ma Couronne
remplace l'écran de réservation par le montant dû, un bouton WhatsApp, et la
phrase qui dit quoi faire.

**LA PORTE SE FERME SUR LA PLATEFORME, PAS AU COMPTOIR** : elle peut toujours
venir, appeler, régler et repartir avec son rendez-vous. L'écran cesse de servir
en libre accès celle qui doit, il ne la chasse pas. Régler rouvre aussitôt.

Le chiffre montré ne compte QUE ce qui est hors grâce : annoncer une échéance
qu'elle a encore le droit de devoir serait lui réclamer trop tôt.

`verifie-echeancier` monte à **51 assertions**. Sa conclusion s'imprimait elle
aussi au milieu du fichier — même défaut que `verifie-formules`, corrigé.

## Ma formule — l'abonnement vu par la cliente, 28 août, PUBLIÉ

« Build an interactive way for the clients to purchase and follow their packs
and memberships » (Yéman). Nouvel onglet dans Ma Couronne, entre le Suivi et la
Gamme.

### ⚠️ UNE MIGRATION À PASSER

`supabase/apply_demandes_formule.sql` — **tant qu'elle n'est pas passée**, le
bouton « Je veux cette formule » écrit en local sans jamais remonter : la
cliente croit avoir demandé, et la Maison ne voit rien. La RLS est dans le même
fichier — dépôt par `anon`, lecture réservée au personnel : sans elle, la clé
anon rendrait la liste des demandes de toutes les clientes, avec leurs noms.

### Le modèle est descendu dans `shared/`

`src/shared/abonnements.ts` porte désormais formules, abonnées, cycles et
consommation. **Ma Couronne n'importe RIEN du Trône** — cette séparation est ce
qui garde l'application cliente légère. `routes/equipe/data.ts` réexporte tout :
aucun des quarante imports existants n'a changé.

**Les deux magasins sont créés ET liés dans `shared/abonnements.ts`, une seule
fois.** Les créer des deux côtés aurait donné deux instances sur la même clé :
les lectures auraient concordé, les rendus non — un geste posé d'un côté ne
réveillant pas les écrans de l'autre. C'est le genre de désaccord qu'on met des
mois à voir.

### Trois états, trois écrans

1. **Elle a une formule** — ses crédits en JETONS (« 4 sur 6 » se lit, six
   pastilles se comptent ; le jeton pointillé est le prochain), son échéancier
   avec le retard en brique, et un bouton qui propose exactement la prochaine
   échéance. Le « il vous reste N séances » prend la prestation la PLUS
   CONTRAINTE : annoncer la plus généreuse ferait une promesse que la formule ne
   tient pas.
2. **Elle n'en a pas** — la vitrine rangée par les cinq moments, lue de la même
   source que Le Trône, ouverte sur une phrase calculée sur SES rendez-vous :
   « vos 3 derniers rituels vous auraient coûté 30 000 F de moins avec La
   Suite ». `formuleLaPlusUtile` ne compte QUE les rituels dont TOUTES les
   prestations sont incluses — à moitié couvert, il gonflerait l'économie, et
   elle le découvrirait à sa première facture.
3. **Elle a demandé** — l'attente porte une date, qui engage la Maison là où
   « en cours de traitement » n'engage personne.

### Deux règles qui tiennent tout

**LE BOUTON N'ACHÈTE RIEN, IL DEMANDE.** Laisser l'application créer des
abonnements que personne n'a validés deviendrait ingérable le jour où deux
clientes réservent le même créneau réservé — et un abonnement porte un créneau,
c'est sa promesse. Les demandes arrivent en tête de Abonnements › Les membres ;
« Inscrire » ouvre le formulaire déjà rempli, « Classer » fait taire la demande
**sans l'effacer** (même leçon que les abonnements résiliés du matin).

**L'ÉCRAN NE PRÉLÈVE PAS.** Le bouton écrit à la Maison sur WhatsApp avec le
montant ; c'est elle qui envoie le code MoMo et constate le règlement. Une
application qui prétendrait encaisser seule créerait des paiements que personne
n'a vus. *(Le lien MoMo direct demanderait de faire passer `momoUssd` par
`vitrineConfigStore` — pas fait, à décider.)*

`verifie-formules` monte à **61 assertions**. Au passage : sa conclusion
s'imprimait au MILIEU du fichier, si bien qu'un échec dans les assertions
ajoutées n'aurait plus fait sortir en erreur. Corrigé — une seule conclusion, en
toute fin.

## L'option couleur — les cheveux blancs, 28 août, PUBLIÉ

« J'ai de plus en plus de jeunes dames dans la quarantaine, cinquantaine, qui
bataillent avec leurs cheveux blancs ou gris. On doit créer l'option avec tous
les abonnements » (Yéman).

**CE N'EST PAS UNE FORMULE, C'EST UNE OPTION.** Elle vit sur l'ABONNÉE
(`Subscriber.couleur`), pas sur la formule : la même Année Sereine se prend avec
ou sans, et une dame change de voie sans résilier. Lui donner sa propre carte
l'aurait mise en concurrence avec les onze autres, alors qu'elle les accompagne.

**DEUX VOIES, parce qu'elles ne veulent pas toutes la même chose.**
`L'Ébène` — « Les blancs disparaissent » · `L'Argent` — « Le gris devient une
couleur choisie ». Celle qui cache aujourd'hui assume souvent deux ans plus
tard ; une option qui porte les deux voies la garde.

**DEUX RYTHMES** — `Régulière` (à chaque venue) et `Légère` (une sur deux),
parce que les blancs ne reviennent pas à la même vitesse chez toutes. En rythme
léger le compte s'arrondit **vers le haut** : sur cinq venues elle a trois
reprises, jamais deux. La Maison donne le passage de trop.

**LA COULEUR SUIT LE RESSERRAGE, JAMAIS LE LAVAGE.** Le nombre de reprises se
compte sur le quota de l'atelier d'entretien `atl-ii-gbeji`, pas sur le plus
gros quota de la formule — L'Année Fraîche porte 12 lavages et 6 resserrages,
elle donne 6 reprises et non 12.

**AUCUN PRIX N'EST ÉCRIT DANS LE CODE.** Le supplément se calcule sur le tarif
que la prestation porte AU CATALOGUE à l'instant du calcul, moins 15 %. Un tarif
recopié aurait vieilli au premier changement de prix, et la cliente aurait payé
l'ancien. La prestation elle-même **se choisit** dans la modale (atelier
`atl-iii-yekpe`) : une option accrochée à une prestation disparue se
facturerait zéro sans rien dire.

Le supplément entre dans le **total à découper** (elle se paie avec
l'abonnement, pas à côté) et dans le **MRR ramené au mois** — un supplément
annuel non normalisé gonflerait le revenu récurrent du mois de la signature puis
disparaîtrait.

`src/shared/couleur.ts` + `verifie-couleur` (32 assertions). Deux attentes du
harnais étaient fausses à la première exécution, pas le code : 3 × 25 000 × 0,85
fait 63 750 qui s'arrondit à 64 000, et une remise négative doit ramener à zéro
remise et non à la remise par défaut.

## Le parcours des formules — 28 août, PUBLIÉ

« Respecte la maquette avec le rangement du parcours des abonnements : le
prolongement, la porte d'entrée, le foyer, les Années » (Yéman).

Onze formules à plat dans une grille, c'était **le mal des sept carrés de la
page QR** : rien ne disait laquelle sert quand. L'onglet Les formules affiche
désormais quatre sections.

**LES FAMILLES SONT DES MOMENTS DU PARCOURS, pas des rayons de magasin.**
L'ordre est celui dans lequel une cliente les rencontre : elle entre par la
porte, elle prolonge, elle amène son foyer, et le jour où elle fait confiance
elle prend son année.

`FamilleFormule` + `FAMILLES_FORMULES` dans `equipe/data.ts` ; le champ
`famille?` vit sur `Plan`. Les formules SANS famille ne disparaissent pas —
elles se rangent en fin d'écran sous « Les autres formules », avec la phrase qui
dit comment les classer. Le formulaire de formule porte un champ **« Le moment
du parcours »** pour que les formules de la Maison rejoignent les sections.

Une section vide ne s'affiche pas : un titre sans rien dessous fait croire à un
chargement qui n'arrive jamais.

**Les classes CSS sont dupliquées à dessein** (`.tre-parcours*` dans
`equipe.css`, `.trq-sec*` dans `clients.css`) : l'écran des abonnements ne
charge pas `clients.css`. S'appuyer sur l'ordre du bundle marcherait aujourd'hui
et casserait le jour où une route bouge.

`verifie-formules` monte à **55 assertions** : les quatre moments, aucune
formule marketing sans famille, le compte par famille (2 · 1 · 2 · 6 = 11), et
`PACKS_ANNUELS` exactement égal à la famille « annees » — deux listes qui se
recoupent finissent toujours par diverger.

## Les Années — six packs annuels, 28 août, PUBLIÉ

« Pour les clientes qui font confiance, qui veulent prendre un pack annuel avec
leur lavage et resserrage, et un pour lavage resserrage et soin » (Yéman). Il a
voulu **les trois rythmes**, chacun en Duo et en Trio.

| Formule | Contenu | À la carte | Pack | Remise |
| --- | --- | --- | --- | --- |
| L'Année Sereine · Duo | 6 resserrages + 6 lavages | 270 000 | 215 000 | 20 % |
| L'Année Sereine · Trio | + 6 soins | 390 000 | 305 000 | 22 % |
| L'Année Fraîche · Duo | 6 resserrages + 12 lavages | 390 000 | 310 000 | 20 % |
| L'Année Fraîche · Trio | + 6 soins | 510 000 | 395 000 | 22 % |
| L'Année Nette · Duo | 8 resserrages + 8 lavages | 360 000 | 285 000 | 21 % |
| L'Année Nette · Trio | + 8 soins | 520 000 | 405 000 | 22 % |

**PAQUET DE CRÉDITS, PAS ABONNEMENT** (`mode: 'pack'`, `validityDays: 365`). Un
abonnement annuel ferait perdre à la tête le mois où elle voyage, et sur une
tête fidèle ça se retourne contre la Maison au moment de renouveler. Le crédit
dort, il ne s'évapore pas.

**LE TRIO GAGNE TOUJOURS PLUS QUE SON DUO** (22 % contre 20 %). Sans cet écart,
rien ne pousse à monter d'un cran et le soin ne se vendrait jamais. Même règle
que le Foyer à trois têtes. Mais **aucune remise ne dépasse 25 %** hors Foyer :
au-delà, elle cesse d'être un remerciement et devient un prix, celui que la tête
réclamera ensuite à la carte.

**TOUTES DÉPASSENT 100 000 F**, donc toutes s'ouvrent au paiement en 2 ou 4
fois. C'est ce qui les rend vendables : personne ne sort 405 000 F d'un coup.

`scripts/verifie-formules.mjs` — 43 assertions sur les onze formules. **Une
formule fausse ne plante pas, elle se vend** : elle part au comptoir, une tête
la paie, et l'erreur ne se découvre qu'au moment de compter. Le harnais tient
donc les prix à la carte ANNONCÉS dans les avantages (calculés sur resserrage
25 000 / lavage 20 000 / soin 20 000 — si la Maison les change, il tombe, et
c'est le but), l'écart Duo/Trio, le plafond de 25 %, la durée de vie des packs,
la concordance quota/promesse, et le fait que chaque Année franchit le seuil de
découpe : si un prix passait sous 100 000 F, l'offre de découpe disparaîtrait de
l'écran SANS RIEN DIRE.

## Cinq formules marketing — 28 août, PUBLIÉ

« Créer des abonnements marketing pour que mes clients les prennent massivement »
(Yéman), dans le style de VÈKPÈ™ · Les 4 Premiers Entretiens.

**CE QUI FAIT PRENDRE UN ABONNEMENT N'EST PAS SON PRIX, C'EST SON MOMENT.** Les
4 Premiers Entretiens marchent parce qu'ils arrivent quand la question se pose
déjà : elle vient de poser sa couronne. Chaque formule porte donc son moment de
vente, écrit dans `line` et dans le commentaire — c'est ce qu'on dit au
comptoir, pas un slogan.

| Formule | Mode | Prix | À la carte | Remise |
| --- | --- | --- | --- | --- |
| La Suite | cycle | 35 000 | 45 000 | 22 % |
| Le Carnet des Six | pack 365 j | 125 000 | 150 000 | 17 % |
| Le Lavage du Mois | cycle | 15 000 | 20 000 | 25 % |
| Le Foyer · Deux Têtes | cycle | 60 000 | 90 000 | 33 % |
| Le Foyer · Trois Têtes | cycle | 85 000 | 135 000 | 37 % |

**Les prix sont calculés sur le CATALOGUE RÉEL**, pas inventés : `sv-resserrage`
25 000, `sv-bain-vapeur` 20 000. Une remise qu'on ne peut pas justifier au
comptoir se retourne contre la Maison, la cliente finit toujours par demander
pourquoi.

**LE FOYER A DEUX TAILLES** parce qu'une taille unique obligerait la troisième
tête à payer un abonnement entier — exactement la tête qu'on veut faire entrer.
La remise CROÎT avec le nombre (33 % puis 37 %) : sinon rien ne pousse à monter.
C'est le seul levier qui amène des têtes neuves sans dépenser un franc.

`poseLesFormulesMarketing()` — idempotent PAR IDENTIFIANT, jamais par « la liste
est vide » : une formule déjà posée n'est pas réécrite même si son prix a été
retouché à l'écran. Le bouton « Poser les N formules marketing » disparaît quand
elles sont toutes là : une action qui ne fait plus rien ne doit plus s'offrir.

Maquette validée : https://claude.ai/code/artifact/6a4c37f8-a142-4b19-a357-ef98c923e3f3

## Les abonnements résiliés étaient devenus introuvables — 28 août, PUBLIÉ

« Peux-tu retrouver les abonnements que j'avais auparavant ? » (Yéman).

**Rien n'était perdu, tout était inatteignable.** « Résilier » basculait le
statut à `churn` d'un seul clic, sans confirmation ; le tableau ne lisait que
`status !== 'churn'` ; et le nombre de partis ne vivait qu'en chiffre au fond
de la carte Rétention. La ligne disparaissait sans dire où elle allait.

**La leçon** : un statut qui retire une ligne de la seule vue qui l'affiche
équivaut à une suppression pour qui tient le comptoir. Avant d'ajouter un
filtre `!== x`, il faut savoir où l'on voit les `x`.

Trois réparations :

1. **« Les partis »**, liste repliable sous le tableau des abonnés, avec
   *Reprendre l'abonnement* qui rend le statut `active` (jamais `new` : elle
   n'est pas une nouvelle tête, elle revient).
2. **Confirmation sur Résilier**, disant ce que la Maison perd en MRR et où
   l'abonnement va atterrir.
3. **Le compteur de la carte Rétention devient un lien** qui déplie la liste.

`supabase/voir_abonnements.sql` — cinq requêtes de LECTURE SEULE pour voir ce
que la base contient réellement (par branche, par statut, résiliés seuls). Le
second filtre qui peut cacher un abonnement est la BRANCHE : une tête posée sur
une autre branche est invisible depuis celle affichée en tête d'écran.

## Les codes de la Maison — rangés par moment de la visite, 27 août, PUBLIÉ

« Il y a trop de QR et je me mélange beaucoup » (Yéman). La page empilait sept
cartes IDENTIQUES : sept carrés noirs qui se ressemblent, les mêmes deux boutons
partout, rien pour dire lequel était lequel. **Le mélange venait de la
ressemblance, pas du nombre** — c'est la leçon transposable.

Trois choses distinguent désormais une carte :

1. **Son signe.** Un pictogramme (épingle, onde, téléphone, étoile, couronne,
   horloge) se reconnaît de loin ; un QR non, ils sont tous noirs et carrés.
2. **Sa phrase**, en petites capitales cuivre : « La cliente scanne · elle
   règle ». Le sujet et la conséquence, avant même la description.
3. **Son moment** : `Elle arrive` (où nous trouver, le wifi) · `Elle repart`
   (MoMoPay, l'avis) · `Elle reste avec nous` (Ma Couronne) · `L'équipe` (le
   code du jour).

**LE CODE DU JOUR EST À PART**, et pour une raison : c'est le seul carré de la
page que la cliente ne doit JAMAIS scanner. Le ranger avec les siens invitait la
confusion au comptoir.

**LES DEUX WIFI N'EN FONT PLUS QU'UN.** Ils étaient deux cartes jumelles avec
des noms presque identiques et le même mot de passe — une source de mélange à
eux seuls. Ce qui les sépare vraiment n'est pas leur nom mais leur portée : 5G
près du fauteuil, 2G jusqu'au fond. C'est ça qui s'écrit. Les champs de saisie
se replient derrière « Modifier » une fois le réseau posé.

Une barre en tête compte ce qui est **prêt** et ce qui **dort incomplet** : un
carré à moitié réglé n'a l'air de rien, il ressemble à un carré. Les cartes
incomplètes restent visibles en pointillé plutôt que masquées — masquées, on
saurait moins qu'elles existent.

`lienMaCouronne()` et `imprimeCarteCouronne()` sont sortis de `Vitrine.tsx` :
deux gabarits imprimés pour une seule carte finiraient par diverger, comme la
devise l'a fait avant d'avoir sa source unique.

## Le compte client — débit / crédit / créances, 26 août, PUBLIÉ

« Un vrai compte client pour mieux suivre les crédits », et « bien suivre les
mouvements impayés et depuis quand date une créance ». La Maison savait dire le
reste dû d'UN rituel ; elle ne savait pas répondre à « elle doit combien, en
tout, et depuis quand ».

Trois pièces, un seul cœur — `src/shared/compte.ts`, pur, éprouvé par
`node scripts/verifie-compte.mjs` (28 assertions) :

1. **Onglet Compte** sur la fiche 360 — le relevé chronologique, le solde qui
   court ligne à ligne, le plus vieil impayé, et le plafond éditable sur place.
2. **Écran Les créances** (`/creances`, menu Finances) — ce que la Maison
   attend, rangé par ÂGE en quatre tranches (0-30 / 30-60 / 60-90 / 90+), chaque
   tranche disant son poids et filtrant d'un clic, relance WhatsApp par ligne.
3. **Alerte au comptoir** — la modale d'encaissement compare le plafond au dû
   pour dire si elle peut partir en devant.

**Trois règles qui ne se devinent pas** :

- **RIEN N'EST STOCKÉ.** Tout se dérive des rituels, factures et avoirs. Un
  solde écrit à côté de ses écritures finit toujours par les contredire.
- **LE RITUEL FAIT FOI.** Une facture ATTACHÉE à un rituel (`invoiceId`) ne
  réécrit pas la dette, sinon la cliente doit deux fois ce qu'elle doit une
  fois. Seules les factures LIBRES (produits, caisse) entrent à leur tour.
  C'est le piège de cet écran, et la première chose qu'éprouve le harnais.
- **SANS PLAFOND, AUCUN CRÉDIT.** `plafondCreditXof` absent = elle règle avant
  de partir. Le crédit s'accorde nommément, il ne se suppose pas. Et le dû
  comparé est celui du FOYER ENTIER (`duDuCompte`) : dans une famille la dette
  naît sur le rituel de l'enfant tandis que le plafond est posé sur la payeuse.

La date qui fait foi est celle du RITUEL, jamais celle de la dernière relance :
une créance ne rajeunit pas parce qu'on en a reparlé. Un rituel `annulé` n'est
pas une créance — personne ne l'encaissera.

**La Maison avertit, elle ne bloque pas** : c'est Yéman qui tient le comptoir.
Un blocage dur ferait contourner la caisse, et la trace se perdrait — ce qu'on
cherche justement à éviter.

### L'onglet Compte refait le jour même, et pourquoi

La première version ouvrait sur trois cartouches et le relevé complet. Verdict
de Yéman, quelques heures après la mise en ligne : « je ne comprends rien au
compte crédit, c'est juste comme un relevé ». **Le reproche était juste** : un
relevé dit ce qui s'est PASSÉ, il ne dit pas quoi FAIRE, et il laissait faire
l'addition de tête. Tout était là, rien ne répondait.

L'ordre a donc été renversé, et c'est la leçon à retenir pour les prochains
écrans d'argent :

1. **La phrase d'abord.** « Faith doit 45 000 F à la Maison. Depuis 62 jours,
   sa Reprise du 25 juin, jamais soldée. » Puis les deux gestes : Encaisser,
   Relancer sur WhatsApp.
2. **Ce qui reste dû seulement** (`lignesImpayees`), une livraison par ligne, la
   plus vieille d'abord, avec l'âge en pastille (sable / cuivre / brique aux
   seuils 30 et 60 jours) et ce qui a déjà été versé dessus.
3. **La question du crédit**, puis le relevé entier REPLIÉ — il ne sert qu'à
   vérifier un versement, ce n'est pas une lecture d'ouverture.

**LE MOT « PLAFOND » A QUITTÉ L'ERP** (pour le crédit ; il reste légitime sur
les calibres et les RDV par jour). Il ne veut rien dire le tiroir à la main. À
sa place, la question qu'on se pose au comptoir : *« Faith peut partir sans
payer ? » → Non, règlement avant de partir / Oui, jusqu'à ___*. Le montant
n'apparaît qu'après un oui, et la conséquence s'écrit dessous en clair, jauge
comprise : « il lui reste 5 000 F avant que la Maison vous prévienne ».

**Les phrases portent le PRÉNOM, pas un pronom** : la Maison reçoit aussi des
hommes, et « peut-elle » se trompait une fois sur vingt.

L'alerte d'encaissement dit désormais la conséquence, pas la règle : « Faith
dépasserait de 10 000 F ce que vous l'autorisez à devoir. »

## Journal des appels — 25 août, PUBLIÉ

Suivre les appels des clientes (elles appellent pour un RDV, on oublie après avoir
raccroché). LIMITE ASSUMÉE : une app WEB ne peut PAS détecter l'appel (pas de
SYSTEM_ALERT_WINDOW ni d'état d'appel dans le navigateur ; seul un compagnon
Android natif le pourrait — projet à part, non fait). Ce qui est fait : saisie
instantanée + relance. Bouton « Appel reçu » dans l'en-tête (Shell.tsx, badge du
nombre en attente), `AppelRecuModal` (cliente connue via ClientPicker ou nouveau
nom+ChampTelephone, motif, choix « rappel » avec date / « RDV à caler »). Store
`shared/appels.ts` (`appelsStore` synchronisé, `appelsAActer`, `poserAppel`,
`marquerAppelFait`, `reporterAppel`). Liste « Appels à traiter » en haut du
Tableau de bord (Ouvrir la fiche `/customers?id=`, Demain, Fait). Gardé par
verifie-signature §⑨. SUITE possible : share_target « Partager → Le Trône » depuis
les appels récents (2 taps, pré-rempli) ; et l'app native pour le pop-up sur appel.

## Fidélité — Cercle par tête, Prix convenu, Foyer, 25 août, PUBLIÉ

Réforme validée par maquette (public/maquette-cercle-et-foyer.html). Le Cercle
récompensait la fidélité comptée PAR LA PAYEUSE : une famille l'ouvrait à trois
têtes une venue chacune, et un prix convenu y entrait par-dessus son tarif. On a
séparé, source unique `statutFidelite` (shared/accounts.ts), lue par le Trône ET
Ma Couronne :
- **Le Cercle** = SES propres venues honorées (`venuesHonorees(..., parPayeur=false`),
  ≥ seuil. Une tête à **prix convenu** (`aUnPrixConvenu`) ou **dépendante**
  (`estDependant` : une autre paie pour elle) n'y entre pas.
- **Points** (honorAppointment) : crédités seulement sur SA propre venue
  (`appt.clientId === beneficiaire`), jamais convenu/dépendant. Un rituel réglé
  pour un membre du foyer nourrit le Foyer, pas le Cercle de la payeuse.
- **Le Foyer** = dépense honorée CUMULÉE de toutes les têtes du foyer
  (`depenseFoyerXof`, par `clientId` des membres), seuil réglable
  `foyerSeuilStore` (défaut 300 000 F, éditable dans écran Le Cercle).
Écrans touchés : Cercle.tsx (liste par tête + exclusions + champ seuil Foyer),
Customers fiche (statut : Cercle / Prix convenu / Foyer), Ma Couronne CercleTab
(carte par genre + progression Foyer, échelle de points masquée pour convenu/
dépendant). Gardé par verifie-foyer.harnais (§ Cercle par tête).
PALIERS FOYER (25 août, fait) : comme les paliers du Cercle, mais franchis par la
dépense cumulée (`foyerTiersStore`, `meilleurPalierFoyer`, synchronisés). Gérés
dans l'écran Le Cercle (section « Les paliers du Foyer »), affichés « Offert / À
venir » sur Ma Couronne et « palier à offrir » sur la fiche dès le seuil passé —
le geste s'offre de lui-même. Le geste reste posé à la main au fauteuil (pas de
décompte, la dépense est un historique, pas un solde).


## Devise — séparateur harmonisé, 24 août, PUBLIÉ

`DEVISE_COMPLETE` passait de « mi nyɔ́ ɖɛkpɛ **•** la maison veille » (puce ronde)
à « mi nyɔ́ ɖɛkpɛ **·** la maison veille » (point médian), pour n'avoir qu'un seul
séparateur partout — comme « SÍNSÍN™ · La Reprise » et « Maison MND · … » : la
puce jurait dans les pieds de page de facture. Source unique dans
`shared/identite.ts` ; règle de marque de CLAUDE.md mise à jour en conséquence.
Le détecteur `porteLaDevise` (mot fon aplati `dekpe`) et le harnais signature
(qui n'assert que `DEVISE_MAISON`, le fon seul) sont insensibles au changement.

## Pied de page PDF — le nom dans la police de la devise, 24 août, PUBLIÉ

« Maison MND » sortait en **helvetica** (sans serif) à côté de la devise en
**EB Garamond** (serif) : ça jurait. Désormais `pieDeLaMaison` écrit le nom ET la
devise dans la même police (`DeviseFon`). Il a fallu **régénérer le sous-ensemble
EB Garamond** : il ne contenait pas le « D » de MND (bâti pour la devise, sans
majuscule latine). Nouveau `.ttf` (45 Ko) + `src/shared/devise-fon-b64.ts` avec
l'alphabet latin complet ; le **woff2 (écran) reste fon-seul** (l'écran écrit le
latin en Cormorant). Garde ajoutée au harnais signature (§⑥) : elle décode la
police embarquée et vérifie qu'elle porte chaque lettre du nom + les lettres fon,
pour attraper toute future régénération qui reperdrait une lettre.

## Tirets cadratins retirés du texte affiché — 24 août, PUBLIÉ

Décision : le tiret de prose « — » « fait trop IA ». Retiré de TOUT le texte
affiché de l'ERP (1055 occurrences, 88 fichiers), remplacé par une virgule
(deux-points là où la 2ᵉ partie explique la 1ʳᵉ n'a pas été automatisé — virgule
partout). Fait via un script AST (TypeScript compiler) qui ne touche QUE les
chaînes, gabarits et texte JSX — jamais les commentaires ni le code. Sur la
facture : « Momopay — 30 000 F » → « · », « Pourboire — merci » → virgule, et le
nom du Maître passe à la ligne (voir commit 478c26a).

RÉGRESSION ATTRAPÉE (même jour) : ce remplacement en masse avait corrompu la
constante `WINANSI_EXTRA` de `pdf.ts` — le « — » y est une DONNÉE (liste des
caractères que la police du PDF sait tracer), pas de la prose. Résultat : chaque
tiret cadratin d'un libellé saisi (« Hermine — Tracé… », « 10 000 F — Pourboires »)
sortait en « ? » sur les pièces PDF. Corrigé (U+2014 restauré). Garde ajoutée au
harnais signature (§⑦) : `pdfSafe('Hermine — Tracé')` doit rendre le tiret, pas
« ? ». `pdfSafe`/`pdfSafeGardeFon` sont désormais exportés et testés. Bonus :
un caractère non traçable qui n'est PAS une lettre (emoji, symbole, formatage)
est maintenant RETIRÉ proprement au lieu de sortir « ? » ; « ? » réservé aux
vraies lettres d'un autre alphabet (pour ne pas effacer un nom en silence).

CE QUI EST GARDÉ (volontairement, ~12) : les placeholders « — » (case vide dans
tableaux/champs), les défauts de menu « — aucune — » / « — choisir une
prestation — », les marqueurs de sous-ligne des bulletins PDF (« — ${prime} »,
tiret collé au backtick), et le toggle « Modèle — ». Le script de détection est
`scratchpad/scan-real.mjs` (hors dépôt) : il liste tout tiret restant dans une
chaîne/JSX, en excluant placeholders et décoratifs.

## Audit de sécurité et de fiabilité — 24 août, PUBLIÉ (front @ b524f22, gh-pages refondé)

Le dépôt est PUBLIC et a déjà fui (2 août). Audit complet mené avec vérification
adversariale de chaque trouvaille. Bonne nouvelle d'abord : AUCUN vrai secret
nulle part — ni `service_role`, ni JWT, ni token Meta, ni clé privée VAPID, dans
l'arbre suivi comme dans les 704 commits, toutes branches. La seule clé exposée
est la clé `publishable`/anon, publique par conception (protection = RLS). Donc
AUCUNE ROTATION DE CLÉ n'est nécessaire.

FRONT — CORRIGÉ ET PUBLIÉ EN LIGNE (main @ b524f22, gh-pages refondé le 24 août) :
- **Données personnelles retirées des fichiers suivis** : le nom complet d'une
  apprenante servait de valeur par défaut au Bilan et au Certificat (donc
  compilé et servi par GitHub Pages) — remplacé par une initiale. Idem : nom de
  cliente + prénom d'enfant dans un commentaire de `enfants.ts`, noms réels dans
  `scripts/import-analyse.mjs`, trois noms de famille dans ce fichier-ci, un
  patronyme dans `maquette-rapport-de-caisse.html`, l'adresse d'un compte
  employé dans `MonMois.tsx`, un couple prénom-enfant/prénom-parent ici même.
- **Verrous d'écran qui fuyaient** : le solde d'un tiroir à code s'imprimait en
  clair dans « reste en main » des Dépenses (`Depenses.tsx`) ; le solde du coffre
  se lisait hors de `CLE_COFFRE` par Salon & Foyer. Les deux se taisent
  désormais (helper partagé `coffreOuvert`).
- **Trois bugs d'argent, chacun tenu par une assertion neuve** : le Dashboard
  ignorait `expenseOccurrences` (Résultat net trop beau) — porte unique
  `depensesDuMois`, appelée aussi par la Synthèse ; le journal du jour de la
  Caisse sommait `invoiceTotal` (avoir/acompte compris, pièce en bloc) — il lit
  désormais les versements du jour ; les tuiles du Coffre gonflaient de chaque
  fléchage et devise — lectures partagées `coffreVerseXof`/`coffreSortiBanqueXof`.
- **Défense en profondeur injections** : échappement HTML de la carte A5
  (`QrCodes.tsx`), filtrage des caractères de contrôle dans les PDF (`pdf.ts`),
  contrôle de même origine dans `sw.js`.

Inclut aussi : le masquage des agrégats du coffre sur l'onglet Objectifs (hors
`CLE_COFFRE`), et `npm audit fix` non cassant (6 → 2 vulnérabilités ; les 2
restantes = jspdf→dompurify, cassant). Rituel passé ET publié : typecheck 0,
13 harnais, `build`, `build-sites`, grep du bundle (nom d'apprenante disparu,
aucun secret réel), `push origin main`, `MND_REFONDE=1 publie.mjs` — les 4 sites
refondés et servis (build 20260824015551).

APPLIQUÉ EN PROD LE 24 AOÛT (Supabase SQL Editor / redéploiement Edge) :
- **Migration 0073** appliquée et vérifiée : `staff_self_write` a disparu, seul
  `staff_admin_write` (`is_souverain()`) subsiste. Escalade fermée.
- **kkiapay-verify et kkiapay-webhook** redéployés avec le contrôle de montant
  côté serveur.
- **RLS de prod vérifiée** : AUCUN `dev_all` nulle part (durcissement bien en
  place) ; la clé anon ne lit que le catalogue, les branches, `blocages`,
  `personas` et la config vitrine — jamais clients/factures/finances, et aucune
  écriture anon.
- **FUITE TROUVÉE ET FERMÉE — 5 tables `repli_*` sans RLS.** `repli_de_passage`,
  `repli_fantomes_couronne`, `repli_forfaits_sources`, `repli_noms_couronne`,
  `repli_reprise_foyer` (créées par des `local_*.sql`) avaient RLS OFF + tous les
  GRANTs à `anon`/`authenticated` : lisibles ET effaçables par la clé anon
  publique. Corrigé par `enable row level security` (sans policy → deny-all ;
  service_role garde l'accès, données et rollback intacts). Voir [[supabase-repli-tables-need-rls]].

- **Migration 0074 — `garde_argent_cliente`** appliquée, les 4 déclencheurs
  confirmés (`appointments`/`invoices`, BEFORE INSERT/UPDATE). Neutralise, pour
  une écriture CLIENTE directe (sync), les champs d'argent qu'elle ne devrait pas
  poser — `depositConfirmed`, `depositXof`, `paidXof`, statut `payée` d'une
  facture. Staff et `service_role` (kkiapay) gardent plein droit. **Test comptoir
  OK (24 août)** : une vente s'encaisse normalement, staff non gêné (rollback
  restait `drop trigger garde_argent_cliente_biu`). NON couvert : le
  prix figé `priceXof`/`discountXof` (une cliente peut figer un prix de 0) —
  décision produit, demande un recalcul serveur du prix.

TRANCHÉ LE 24 AOÛT :
- **Isolation par branche** : on ACTE que `is_staff()` global est la garde — la
  branche est un filtre d'interface, pas une frontière de sécurité (maison
  unique ; le cloisonnement multi-tenant viendra avec l'`org_id` de LOKAA).
  Documenté dans `docs/BACKEND.md`. Aucun changement de policy en prod.
- **Purge d'historique git** : ON NE PURGE PAS — résidu assumé. Des noms de
  clientes restent dans les messages des commits `984b47d` (trois paires
  mère-enfant), `f2a6233` (deux clientes) et `358e9fa` (rétrogradé — un proche).
  Le dépôt a fui le 2 août et est déjà cloné : réécrire l'historique (force-push
  d'un dépôt public de 711 commits, tous les SHA changent, re-clone obligatoire)
  protégerait les futurs lecteurs, pas les copies déjà faites — bénéfice marginal
  faible pour un coût irréversible. GARDE-FOU POUR L'AVENIR : un message de commit
  est de l'HISTOIRE PUBLIQUE INEFFAÇABLE — mêmes initiales que le code, jamais un
  nom complet. Voir [[commit-messages-are-public]].

FAIT ET PUBLIÉ (main @ 7ef2c7d, gh-pages refondé) :
- **CA du mois unifié** (`revenuDuMois`, clients/_shared) : Synthèse, Dashboard,
  Analytics et Bilan comptent tous la même chose (abonnements COMPRIS) ; le Bilan
  seul écarte les caisses hors bilan (`exclureHorsBilan`). Assertion neuve.
- **Net de paie unifié côté Personnel** (`paieDuMois` → `computePay`) : une seule
  formule pour tableau + confirmation + resync + bulletins, cotisations comprises
  et overrides respectés. Personnel non déclaré : net inchangé, pas de ligne
  CNSS/ITS. Corrige le bug affiché≠enregistré.

PUBLIÉ (main @ e3afa17, gh-pages refondé) :
- **Les lettres fon restent sur les factures et reçus** — KLƆKLƆ™ garde son Ɔ
  (plus « KLOKLO™ »), règle de marque. Rendu PAR CARACTÈRE dans `pdf.ts`
  (`texteFon`/`pdfSafeGardeFon`/`assureFon`) : Ɔ ɔ Ɖ ɖ Ɛ ɛ dans la police fon
  (sous-ensemble EB Garamond), le reste dans la police du document ; les accents
  LATINS (Ì Í) intacts (Latin-1). La police est EMBARQUÉE EN DUR (`devise-fon-b64.ts`,
  base64) — le fetch au tracé échouait selon le serveur et sortait « KLOKLO™ » ;
  plus aucun réseau. Diag de session : le PDF sortait faux tant qu'on testait le
  site en ligne (code non poussé), pas un build local frais.
  RESTE (DONNÉE, pas rendu) : le service « SÍNSIN™ » est écrit avec UN seul
  accent dans le catalogue (S-Í-N-S-I-N) — pour « SÍNSÍN™», renommer le service
  dans le Catalogue (l'accent manque sur le 2e I ; le rendu, lui, préserve les
  accents).

TRANCHÉ :
- **jspdf RESTE en 2.5.2.** La montée en 4.2.1 a été tentée puis ANNULÉE : elle
  cassait le rendu (une facture sortait en 101 pages / 9,8 Mo) — les
  contournements de `pdf.ts` sont propres à jsPDF 2, et les réécrire ne se
  justifie pas puisque les chemins vulnérables (AcroForm, `.html()`) ne sont pas
  utilisés ici. `npm audit` garde donc 2 avis (jspdf→dompurify) ACCEPTÉS comme
  non exploitables. Ne pas relancer la migration sans réécrire toute la couche PDF.
- **Fiches-démo de `clients.ts` (2de1ba3)** : confirmées 100 % FICTIVES par la
  Maison. Rien à purger.
- **Moteur de commission de la paie : DÉTAILLÉ fait foi** (décision du 24 août).
  `commissionDetaillee` (clients/_shared, extraite de Personnel) est appelée par
  le tableau Personnel ET le run de Paie — plus de forfait `commissionPct`.
  CommRates + le store déplacés dans `payroll.ts`. Net Personnel = net run.
  Committé sur `main` (commit `5460572`) ; PAS ENCORE REPUBLIÉ sur les sites.
  MIGRATION à savoir : le run n'utilise plus `commissionPct` — un maître
  commissionné doit porter `commissionne=true` et le barème par palier
  (`CommRates`) doit être renseigné, sinon sa commission tombe à 0 (repli sur les
  montants saisis à la main). À vérifier côté dossiers du personnel avant le
  prochain run, PUIS republier.

L'AUDIT EST BOUCLÉ — plus aucune décision ouverte.

## « Suspendre » ne sert plus qu’aux prélèvements — 24 août, PUBLIÉ

« Le bouton suspendre une dépense sert à quoi ? A-t-elle toujours une utilité ? »

Il venait de l’onglet « Engagements à arbitrer », retiré le 22 août : on
signalait une dépense évitable, on la suspendait avant de la payer, l’écran
comptait l’économie. Le bouton avait survécu à son mécanisme.

IL EN GARDAIT UNE, D’UTILITÉ : arrêter un abonnement mensuel ou hebdomadaire
sans effacer les mois déjà payés. Supprimer emporterait l’histoire avec.

SUR UN ACHAT PONCTUEL, C’ÉTAIT UN PIÈGE. Suspendre sort la dépense de TOUS les
totaux — le solde de la caisse REMONTE alors que les billets sont sortis. Les
livres cessaient de correspondre au tiroir, sans un mot.

Le geste ne s’affiche donc plus que sur une dépense récurrente, et se nomme
« Arrêter le prélèvement ». « ↺ Rétablir » reste offert à toute dépense arrêtée,
ponctuelle comprise — celles d’avant ce jour doivent pouvoir revenir. La carte
« Économies réalisées » devient « Prélèvements arrêtés » : elle ne mesurait
jamais une économie décidée, seulement ce qui ne court plus.

## La caisse qui s’offre d’abord — 24 août, PUBLIÉ

« Je ne veux pas que ce soit la caisse Euro la première à apparaître. Je
voudrais que ce soit par défaut sur la caisse Real Money ou Caisse Principale. »

Le formulaire prenait la PREMIÈRE caisse de la liste — la plus anciennement
créée, le Tiroir EUR. Conséquence invisible : le montant s’annonçait en EUR, et
il fallait corriger la caisse à chaque dépense.

`caisseParDefaut(boxes, branchId, maison)` dans `src/shared/finance.ts` : la
monnaie de la Maison passe d’abord ; parmi ses caisses, c’est l’ordre voulu qui
tranche (« Ranger les caisses ») — donc la Souveraine décide, sans nom codé en
dur. À défaut de caisse dans la monnaie de la Maison, la première venue : mieux
vaut un tiroir en devise qu’un formulaire vide.

Posée aux QUATRE portes qui proposaient une caisse : la dépense
(`Depenses.tsx`), l’encaissement d’un rituel (`clients/actions.tsx`), le
versement au coffre (`objectifs.tsx`), la caisse du comptoir (`vente/Caisse.tsx`).
Six assertions dans `verifie-coffre`.

## La rangée d'une dépense, revue — 24 août, PUBLIÉ

« Revisiter l'UI/UX de la page des dépenses saisies. Le nom des caisses est
disproportionnellement écrit. »

IL L'ÉTAIT : une pastille indigo PLEINE, en capitales, sur chacune des
trente-et-une lignes — un mur sombre qui pesait plus lourd que le montant, et
le montant est ce qu'on vient lire. La caisse rejoint la ligne de détail, avec
la catégorie : toujours cliquable (elle ouvre son relevé), jamais criarde.

ET « SUSPENDRE » PORTAIT UN FOND ROUGE. Le geste le plus rare de la ligne
criait le plus fort, à côté de « Supprimer » qui, lui, est sans retour. L'œil
apprenait à ignorer la couleur d'alerte — le pire résultat possible pour une
alerte. Les trois gestes deviennent des liens discrets, et leur poids dit leur
fréquence : « Modifier » en cuivre, les deux autres en encre pâle, « Supprimer »
qui ne rougit qu'au survol.

La ligne de détail dit aussi, désormais, ce qu'elle taisait : le porteur
(« acheté par Sandrine ») et la présence d'une pièce jointe. Le bloc « Payée
par » s'allège — un filet à gauche plutôt qu'un cadre plein.

## « Les données ne changent pas d'une caisse à l'autre » — 24 août

Vérifié : LE FILTRE EST BIEN APPLIQUÉ (`e.cashbox === filterCaisse`, dans
`flow`). Ce qui manquait, c'est que LA BARRE NE DISAIT RIEN. Toutes les caisses
de la branche s'y alignaient, y compris celles qui n'ont pas vu une dépense du
mois — et sur les captures de Yéman, les trente-et-une dépenses d'août sortent
TOUTES de « Real Money ». Cliquer une autre caisse vidait donc l'écran, sans
qu'on sache si c'était un filtre efficace ou un écran cassé.

Chaque pastille porte maintenant ce qu'elle pèse sur la période, et celles à
zéro se voient AVANT d'être cliquées. Le vide, lui, se nomme : « Aucune dépense
payée depuis « Caisse Pilia » en août. Le filtre fonctionne — cette caisse n'a
simplement rien payé sur la période. »

UN CONTRÔLE QUI NE MONTRE PAS SON EFFET SE LIT COMME UNE PANNE.

## Les dépenses au mois ET à l'année — 23 août, PUBLIÉ

« Les dépenses doivent être au mois et à l'année. » L'écran ne savait lire qu'un
mois : pour répondre à « combien de local cette année ? », il fallait ouvrir
douze mois et additionner de tête.

Deux boutons à côté de la navigation : **Le mois** / **L'année**. Tout suit —
le total et son pourcentage du revenu, le flux par catégorie, revenu vs
dépenses, la liste, et le CSV (qui s'appelle alors `depenses-2026.csv`).

L'ANNÉE S'ARRÊTE AUJOURD'HUI. Une dépense mensuelle compte pour chaque mois
depuis son premier : étendre la portée jusqu'en décembre ferait payer au mois
d'août un loyer de novembre qui n'a pas eu lieu. L'année en cours se lit donc
jusqu'au mois courant — l'écran le dit, « 2026 · à ce jour » — et une année
passée, en entier.

LE REVENU SUIT SANS UNE LIGNE DE PLUS. Les filtres de versements travaillent
déjà par PRÉFIXE ISO (`invoiceRegleAu(i, '2026-07')`) : passer `'2026'` suffit.
C'est le genre de chose qu'on ne découvre qu'en lisant ce qui existe avant
d'écrire.

LES BUDGETS RESTENT AU MOIS, et c'est voulu : une enveloppe se tient par mois,
pas par an. L'onglet ne suit donc pas la portée.

## La caisse d'un porteur — 23 août, PUBLIÉ

Suite de « qui achète pour la Maison » : le panneau comptait ce qui avait été
acheté, mais pas CE QUI RESTE DANS LEURS MAINS. « Oui, prépare ça. »

`Cashbox.porteur?` — une caisse peut être TENUE PAR quelqu'un. Ce qu'on lui
confie n'est ni une dépense ni un prêt : c'est de l'argent de la Maison, dans
d'autres mains. C'est donc une caisse, et le nom du porteur la distingue d'un
tiroir du comptoir. L'argent y compte toujours dans la trésorerie — il n'a pas
quitté la Maison.

LA TENUE EN TROIS GESTES : on ouvre une caisse au nom de la personne, on lui
transfère (le geste existe), elle dépense depuis sa caisse. Le solde dit ce
qu'elle détient, le relevé dit tout l'historique, le rapport PDF s'édite.

PAYER DEPUIS SA CAISSE, C'EST LUI ATTRIBUER L'ACHAT. Choisir un tiroir tenu par
quelqu'un remplit le porteur de la dépense. Laisser les deux se remplir à la
main les ferait diverger au premier oubli : le tiroir dirait « Sandrine a
payé », le résumé dirait « la Maison ». Le porteur suit la caisse — et reste
modifiable.

Le panneau « Qui achète pour la Maison » affiche désormais, pour qui a une
caisse, son **reste en main** — la seule chose que le total des achats ne dit
pas.

## Qui achète pour la Maison — 23 août, PUBLIÉ

« Il y a des personnes à qui je remets tout le temps de l'argent pour effectuer
des dépenses. J'aimerais pouvoir les allouer directement sur la dépense et me
retrouver en un clic quand j'ai besoin d'un résumé de ce qu'ils ont acheté
durant l'année. »

À NE PAS CONFONDRE AVEC LE BÉNÉFICIAIRE, et c'est tout le point. L'écran avait
déjà « À qui la Maison paie » — qui REÇOIT l'argent : le fournisseur, le
bailleur. Ce qui manquait, c'est qui l'a DÉPENSÉ pour la Maison, avec l'argent
qu'on lui a confié. « Dada Sandrine · courses au marché » : le marché reçoit,
Sandrine porte. Les mêler donnait un « à qui je paie le plus » qui répondait à
côté — et c'est ce que faisait la saisie, le nom du porteur écrit dans le
libellé du bénéficiaire.

`Expense.porteur?` — et le champ « Qui a fait cet achat ? » sous le
bénéficiaire, avec « La Maison elle-même » par défaut. La liste des porteurs
vit dans un magasin synchronisé (`porteursStore`), comme les fonctions de
l'équipe : une faute de frappe ne doit pas fabriquer un second porteur, et le
résumé de l'année ne doit pas se casser sur « Sandrine » contre « sandrine ».

LE PANNEAU EST LE PENDANT EXACT DE CELUI DES BÉNÉFICIAIRES — même horizon de
douze mois, même barre, même clic qui ouvre toutes les lignes. Dans « Où va
l'argent » : chaque porteur, son nombre d'achats, son total, et la liste
complète en un clic. Le CSV emporte désormais une colonne « Acheté par ».

CE QUE ÇA NE FAIT PAS, ET QUI SE CONSTRUIT SI ELLE LE VEUT : suivre ce qui
reste dans leurs mains. Pour cela il faudrait une caisse au nom du porteur —
on lui transfère, il dépense depuis elle, et le solde dit ce qu'il détient
encore. La machinerie existe entièrement (transferts, relevé complet, rapport
PDF) ; c'est un choix de tenue, pas un développement.

## Les avances sur salaire n'étaient déduites de rien — 23 août, RÉPARÉ

« Comment gérer les prêts des employés avec leur contrepartie ? Comment
régulariser les avances sur salaire avec leur contrepartie ? » En vérifiant
pour répondre, j'ai trouvé une rupture.

IL Y AVAIT DEUX REGISTRES D'AVANCES, ET ILS NE SE PARLAIENT PAS.
`Personnel.tsx` écrivait dans `mnd_salary_advances` — un dictionnaire par
employé ; `Paie.tsx` DÉDUISAIT depuis `mnd_payroll_advances` — une liste avec
période et branche. Les deux clés avaient été séparées un jour pour qu'elles
cessent de s'écraser l'une l'autre (le commentaire de `payroll.ts` le raconte),
mais LES DEUX CHEMINS NE SE SONT JAMAIS REJOINTS. La modale promettait
« déduite du net à verser de août 2026 » — et aucune avance saisie là n'a
jamais été déduite d'un bulletin.

Un seul registre désormais : celui que la Paie lit. L'avance y porte sa
`period` (le mois de sa date, celui du bulletin qui la déduira), sa branche, et
sa CAISSE.

LA CONTREPARTIE, ELLE, N'EXISTAIT PAS DU TOUT. Ni caisse débitée le jour où les
billets sont tendus, ni charge aux Dépenses : le tiroir ignorait un
décaissement réel, la Synthèse ignorait la dépense.

UNE AVANCE EST UNE CHARGE DE SALAIRE PAYÉE D'AVANCE. Elle s'inscrit donc comme
telle — Dépenses · Salaires · « Avance sur salaire » — le jour de sa remise,
depuis la caisse choisie. La paie la déduit du net, si bien que la charge du
jour de paie ne porte que LE RESTE. Les deux additionnées font exactement ce
qui a été versé : rien n'est compté deux fois, rien n'est oublié. Identifiant
déterministe (`exp-av-<id>`) — et retirer l'avance retire sa charge.

DEUX CHEMINS POUR DEUX BESOINS, ET C'EST VOULU :
— **L'avance** est un à-valoir sur le mois en cours, déduit du bulletin suivant.
— **Le prêt** (écran Les prêts, genre « équipe ») est une dette qui court sur
  plusieurs mois, avec sa caisse, son échéancier et sa retenue mensuelle
  proposée au bulletin. C'est lui qu'il faut pour un dépannage remboursé en
  quatre fois.

## Les fonctions de la Maison s'ouvrent — 23 août, PUBLIÉ

« Rajouter des fonctions au salon. Rajouter du personnel comme le jardinier,
l'agent de nettoyage, la sécurité… »

ELLES ÉTAIENT ÉCRITES EN DUR dans `Personnel.tsx` : sept fonctions, toutes
tournées vers le fauteuil. Une maison n'est pas faite que de mains qui coiffent
— il y a celles qui ouvrent, qui nettoient, qui gardent, qui conduisent.

EN AJOUTER SEPT DE PLUS AURAIT REPOUSSÉ LE PROBLÈME D'UN AN. La liste vit
désormais dans un magasin (`fonctionsStore`, synchronisé), avec treize défauts
— les sept d'origine plus Agent d'entretien, Sécurité, Jardinier, Chauffeur,
Coursier, Assistant·e — et un bouton **« + Autre fonction »** qui en ajoute une
à la volée. Elle rejoint la Maison, pas l'appareil : ajoutée au comptoir, elle
existe sur le téléphone de la gérante.

CE QUI N'EST PAS AU FAUTEUIL NE COMMISSIONNE PAS. `FONCTIONS_AU_FAUTEUIL` ne
retient que maître, maîtresse, praticienne, praticien et maître fondateur :
choisir une autre fonction pose « hors fauteuil » d'office. On ne fait pas
semblant de calculer une commission sur un travail qui ne passe pas par le
fauteuil. C'est un défaut juste, pas une serrure — la case reste modifiable.

Le champ s'appelle maintenant « Fonction DANS LA MAISON » : « au salon »
excluait par son seul nom ceux qui n'y entrent pas.

RIEN À CONSTRUIRE POUR LE STUDIO : un studio est une BRANCHE. Système →
Branches → « Nouvelle branche », et il apparaît aussitôt dans le sélecteur
« Branche » du nouveau membre. Chaque branche porte sa devise, ses maîtres, ses
caisses et ses horaires ; l'équipe s'y rattache une par une.

## Le rythme se laisse mener — 23 août, CORRIGÉ

« Le calcul du rythme régulier ne fonctionne pas. Le montant est figé à
1 142 858. » Il l'était : le nombre de versements se déduisait TOUJOURS de
l'échéance (7 mois d'août à mars), et le montant de ce nombre-là. Passer de 7
à 12 versements laissait donc le montant sur sa division d'origine — l'aperçu
annonçait « 12 versements de 1 142 858 F », soit 13,7 millions pour une cible
de 8.

TROIS NOMBRES POUR DEUX LIBERTÉS. Le reste à trouver est fixe : poser le
NOMBRE décide du montant, poser le MONTANT décide du nombre, et ne rien poser
laisse l'échéance décider des deux. Ce qu'on tape mène, ce qu'on n'a pas tapé
suit — et l'écran vide l'autre champ pour que le dernier touché mène vraiment.

LE CALCUL VIVAIT DANS L'ÉCRAN — donc hors de portée d'un harnais, et c'est
exactement pourquoi il a pu être faux sans que rien ne le dise. Il est remonté
dans `finance.ts` (`rythmeDuPlan`), avec quatorze assertions : le nombre posé
mène, le montant posé mène, aucun des deux ne fige l'autre.

AU PASSAGE, CE QUE L'APERÇU TAISAIT : la date du DERNIER versement. Douze
versements à partir du 28 septembre finissent en août 2027 — cinq mois après
une échéance de mars. L'aperçu donne maintenant les deux bornes, et prévient
en cuivre quand le dernier tombe après l'échéance visée : « à ce rythme,
l'objectif ne sera pas prêt à temps ».

Et une seule vérité désormais : ce que l'aperçu montre est exactement ce qui
s'enregistre — l'enregistrement lisait ses propres valeurs, l'aperçu les
siennes.

## Flécher de l'argent déjà au coffre — 23 août, PUBLIÉ

« Pouvoir mettre à jour le montant de l'objectif. » Deux lectures possibles, et
LES DEUX MANQUAIENT :

① **Modifier la cible** était possible — en cliquant le nom — mais rien ne le
   disait. Les boutons proposaient « Verser », « Poser un plan », « Reprendre » ;
   aucun ne parlait de l'objectif lui-même. Un bouton **« Modifier l'objectif »**
   le dit maintenant.

② **Attribuer de l'argent DÉJÀ au coffre**, lui, était impossible. Le coffre
   tenait 14 918 000 F et les deux objectifs affichaient 0 F mis de côté : seul
   un NOUVEAU versement pouvait nommer un objectif. On préparait sans jamais
   pouvoir dire ce qui était déjà prêt.

DEUX LIGNES, ET LE TOTAL NE BOUGE PAS. `flecherVersObjectif` écrit un dépôt
fléché vers l'objectif et un retrait du disponible, du même montant : le coffre
contient exactement autant qu'avant, mais une part porte désormais un nom.
L'invariant de la Maison tient — somme des objectifs plus non-fléché fait
toujours le coffre, et le harnais le vérifie APRÈS fléchage.

ON NE RÉÉCRIT PAS L'HISTOIRE. Retaguer les anciens versements aurait été plus
court : un versement de mai serait devenu « pour les vacances », alors qu'il a
été fait sans intention. Une écriture dit ce qui a eu lieu ; flécher est un
geste d'aujourd'hui, il porte la date d'aujourd'hui.

Le registre du coffre les nomme justement : « Fléché vers un objectif » et
« Quitte le disponible ». « Repris du coffre » aurait menti — rien n'en est
sorti.

`flechableVers` borne le geste à ce que le disponible permet ET à ce qui manque
à l'objectif : on ne flèche jamais plus que la cible.

LE HARNAIS A ENCORE PRIS MON ÉCHAFAUDAGE EN DÉFAUT — deuxième fois dans la
journée. Mon montage de test écrasait l'identifiant passé par `'o1'`, et
interrogeait donc un objectif qui n'avait rien reçu. La faute était dans le
test, pas dans le code : c'est exactement pour ça qu'on écrit les deux côtés.

## Les objectifs ont un plan et des jalons — 23 août, PUBLIÉ

« Un objectif doit être clair, avoir des milestones, tout comme les programmes
de remboursement pour les prêts. Surtout atteindre les objectifs. » Maquette
validée (`public/maquette-les-objectifs.html`), deux arbitrages de Yéman.

UNE CIBLE SANS CHEMIN NE S'ATTEINT QUE PAR CHANCE. L'objectif disait ce qu'il
visait et ce qu'il manquait ; jamais COMMENT y arriver. Le prêt, lui, savait
déjà le dire. C'est la même figure retournée : un prêt se rembourse par
échéances, un objectif se remplit par jalons.

`ObjectifCoffre` gagne `plan?: { premier, nombre, montantXof }` et
`jalons?[]` (posés à la main, nommés — ils font foi sur le rythme).
LE PLAN PORTE SON MONTANT, il ne se déduit pas de cible ÷ nombre : après trois
versements irréguliers cette division ne veut plus rien dire. Ce qu'il faut
mettre chaque mois dépend de ce qui RESTE.

`etatDeLObjectif` porte tout le calcul dans finance.ts, éprouvé par
`verifie-coffre` (25 assertions neuves) : les jalons, leur état (versé,
partiel, attendu, manqué), le retard, l'effort pour tenir, l'arrivée projetée.
CE QUI EST VERSÉ COUVRE LE JALON LE PLUS ANCIEN D'ABORD — la règle du comptoir,
la même que pour les remboursements de prêt.

LE HARNAIS A PRIS MON PROPRE CALCUL EN DÉFAUT : j'avais écrit qu'un jalon au
30 août était « manqué » un 23 août. Il ne l'est pas — le dire ferait réclamer
un argent qui n'est pas encore dû. L'assertion tient désormais les deux jours,
le 23 et le 1er septembre.

L'ÉCRAN, en miroir des prêts : quatre chiffres dont un seul alarme, un rail de
filtres, et par objectif — la jauge AVEC SON REPÈRE (où le plan vous attendait
aujourd'hui), la phrase de verdict qui remplace le calcul mental (« il faut
désormais 878 572 F par mois au lieu de 500 000 »), les jalons datés avec leur
pastille, et un bouton principal QUI PORTE LE MONTANT.

LES DEUX ISSUES D'UN RETARD SE PROPOSENT CÔTE À CÔTE — arbitrage de Yéman
(« les deux, et je choisis au moment du retard ») : RATTRAPER réécrit le plan
sur les mois restants au nouvel effort, la date tient ; ACCEPTER garde le
rythme et fait glisser l'échéance à l'arrivée projetée. Aucune n'est meilleure
dans l'absolu : c'est une décision de trésorerie, elle appartient à la
Souveraine — on ne choisit pas pour elle.

LA TOURNÉE DU MATIN PRÉVIENT, comme pour les prêts : un jalon manqué ou attendu
sous 7 jours remonte au Tableau de bord.

## Les objectifs rejoignent les prêts — 23 août, PUBLIÉ

« Les objectifs devraient aller dans l'onglet des prêts, car il y a des apports
et des remboursements qui se font à ce niveau. » Elle a raison sur le fond : un
prêt et un objectif sont LA MÊME FIGURE — une cible, des mouvements dans le
temps, un reste à faire. L'écran des prêts les tient désormais tous les deux,
chacun sur son onglet. Choix de Yéman parmi trois formes proposées : un second
onglet, plutôt qu'un écran de plus ou une liste mêlée (« l'argent qu'on vous
doit et l'argent que vous mettez de côté se liraient dans la même colonne, et je
crains qu'un total ne finisse par les additionner »).

L'ARGENT, LUI, NE DÉMÉNAGE PAS. Un objectif flèche ce qui dort DANS LE COFFRE
(`recuParObjectif`, `coffreNonFleche`) : le détacher séparerait un but de ce qui
le remplit. Le modèle est intact ; seul l'endroit où on le lit a changé.

LES DEUX GESTES SUIVENT. « Verser au coffre » et « Reprendre du coffre »
n'auraient servi à rien restés au coffre : c'est en regardant un objectif qu'on
décide de l'alimenter. Les deux modales (`DepositModal`, `TransferModal`) ont
donc déménagé dans `finances/objectifs.tsx`, et le Coffre les IMPORTE de là —
l'inverse aurait fait dépendre les objectifs d'un écran qu'ils ont quitté.

LE COFFRE GARDE LE TIROIR : total, courbe depuis l'ouverture, mouvements,
compartiments en devise, verrou. À la place de la liste, une carte qui dit
combien d'objectifs flèchent cet argent-ci et ce qui reste non fléché, avec
« Les objectifs → » qui mène à `/prets?onglet=objectifs`. Le paramètre s'efface
au premier changement d'onglet : recharger ne doit pas ramener un onglet qu'on
vient de quitter.

AU PASSAGE, LE MASQUAGE DEMANDÉ LE MÊME JOUR : hors de l'écran des caisses, une
caisse à code ne dit plus son solde, ouverte ou non. Le code s'ouvre POUR LA
SÉANCE, et cette ouverture suivait la Souveraine partout — la caisse
déverrouillée aux Caisses annonçait son solde dans les trois menus des Dépenses.
L'autorisation vaut là où elle a été donnée, pas dans toute la maison.

## Joindre un fichier à une écriture — 23 août, PUBLIÉ

« Après note, j'aimerais attacher un fichier ou une photo. » Un reçu, un
bordereau, la capture d'un virement : la preuve de ce qui est écrit.

RIEN DE NEUF SOUS LA MAIN, ET C'EST LE POINT. Le Fil dépose des pièces depuis
le 18 août (migration 0059) dans un compartiment PRIVÉ, ouvert au seul
personnel connecté, chaque fichier servi par un jeton d'une heure. Les caisses
et les dépenses y rangent les leurs, sous leur propre dossier (`caisse/`,
`depense/`). AUCUNE MIGRATION À COLLER : un second compartiment aux politiques
identiques aurait doublé la surface à protéger sans rien gagner — et 0059 le dit
déjà : « ce que la Maison garde derrière une porte, elle le garde derrière LA
MÊME ».

SEULE L'ADRESSE EST ENREGISTRÉE, jamais le fichier. Les magasins vivent dans le
localStorage et passent en entier à la synchronisation : y glisser une photo
saturerait l'un et gonflerait l'autre — exactement ce qui avait vidé les fiches
du MacBook le 21 août. La ligne ne garde que `{ chemin, nom, type, taille }`,
et `data jsonb` l'accepte sans une ligne de SQL.

LE DÉPÔT SE FAIT AU CHOIX DU FICHIER, pas à l'enregistrement : sinon un
formulaire abandonné laisserait croire que la pièce est là. Conséquence assumée
— un fichier choisi puis abandonné reste dans le compartiment. Un octet oublié
coûte moins qu'une preuve perdue.

IL NE BLOQUE JAMAIS L'ÉCRITURE. Hors ligne, dépôt refusé, fichier au-dessus de
10 Mo : on le DIT, et la ligne s'enregistre sans sa pièce. Perdre une écriture
parce qu'une photo n'est pas passée serait le pire des échanges. Le poids se
vérifie AVANT le voyage — un refus du serveur trente secondes plus tard ne dit
rien d'utile.

Deux endroits, un seul champ (`ChampPieceJointe`, dans `finances/_shared`) :
l'apport ou le transfert d'une caisse, et la dépense — c'est là qu'il sert le
plus. Une ligne qui porte sa preuve le DIT dans le relevé (« · pièce jointe ») :
sinon il faudrait ouvrir chaque fiche pour savoir laquelle l'a.

## « Toutes les caisses sont au 23 août » — 23 août, CORRIGÉ

Elles ne l'étaient pas. Le relevé les DATAIT toutes d'aujourd'hui.

`fmtDay`, dans `tiroirs.tsx`, était écrit
`new Date().toLocaleDateString(...)` au lieu de `new Date(iso)` : il IGNORAIT
la date qu'on lui passait et rendait celle du jour, pour chaque ligne de chaque
caisse. La même écriture disait « 22 août » sur l'écran des prêts et « 23 août »
dans le relevé — deux vérités pour un seul fait, ce qui est toujours le signe.

FAUTE DE COPIE, ET ELLE EST DE MOI : née le 22 août en extrayant `tiroirs.tsx`
de Depenses.tsx. Les Dépenses et la Synthèse portaient chacune leur `fmtDay`,
correcte ; la troisième copie, non. Trois copies d'une même fonction, c'est
trois occasions d'en casser une sans que les autres le disent.

`fmtDay` vit maintenant dans `_shared.tsx`, une seule fois, et Depenses la lit
de là. (La Synthèse garde la sienne, en `2-digit`, pour l'alignement de ses
colonnes — c'est une décision, pas une copie.)

UN FORMATEUR QUI IGNORE SON ARGUMENT NE SE VOIT PAS À LA RELECTURE : il rend une
date plausible, tous les jours. Il se voit dans `verifie-coffre`, désormais :
le 22 août rend « 22 », le 5 mai rend « 5 mai », et surtout DEUX DATES
DIFFÉRENTES NE RENDENT PAS LE MÊME TEXTE — c'est cette assertion-là qui aurait
attrapé la faute.

Aucune donnée n'était touchée : les dates étaient justes en base, seul
l'affichage mentait. Rien à réparer à la main.

## Le relevé montre TOUT — 23 août, PUBLIÉ

« Quand je clique une caisse, j'aimerais toujours voir tout son historique sans
avoir à aller à une période précise. Les mouvements sont très importants depuis
là, quand on recherche rapidement une information. »

IL N'OUVRAIT QUE LE MOIS AFFICHÉ. Chercher un versement de mai depuis août
demandait de deviner le mois, de fermer, de naviguer, de rouvrir. Un relevé
qu'on doit chasser ne sert à rien. « Tout l'historique » est désormais la
porte ; le mois reste à un bouton.

`boxMoves(nom, { de: '1900-01-01', a: aujourd'hui })` — la période libre posée
le 22 août pour le rapport PDF sert ici sans une ligne de plus. Le solde de
départ devient alors l'OUVERTURE de la caisse : le seul chiffre qui ne vient
d'aucun mouvement.

LE SOLDE COURT À CHAQUE LIGNE, sous le montant. C'est lui qu'on cherche en
remontant un relevé — « combien restait-il ce jour-là ? ». Il se calcule du
plus ANCIEN au plus récent, puis la liste se retourne : l'inverse donnerait des
soldes à l'envers. Et le solde d'ouverture ferme la marche, en bas — en haut il
ne voudrait rien dire.

TROIS CHIFFRES EN TÊTE (solde à ce jour, entrées, sorties), SIX MOIS D'UN COUP
D'ŒIL (deux barres par mois, dessinées à la main — la Maison ne charge pas une
librairie de graphiques pour douze rectangles), et UNE RECHERCHE sur le libellé,
le détail et la date.

Le reste ne bouge pas : une caisse discrète fermée refuse toujours son relevé,
et chaque ligne mène toujours à sa facture ou à sa fiche de dépense.

## Les prêts, gestion sans faille — 23 août, PUBLIÉ

« Crée-moi une UI/UX bien en place pour une gestion sans faille des prêts. »
Maquette validée (`public/maquette-les-prets.html`), trois arbitrages de Yéman,
tous au recommandé.

CE QUI MANQUAIT N'ÉTAIT PAS UN ÉCRAN, C'ÉTAIT UNE DATE. Le Trône savait combien
la Maison avait prêté et combien était rentré ; il ne savait pas QUAND l'argent
devait revenir. Un prêt sans date de retour ne se réclame pas : il s'oublie.
Tout le reste — l'alerte, la relance, le tri — en découle.

`Pret` gagne trois champs : `echeance` (en une fois), `echeancier`
({ nombre, premier }, mensuel) et `retenueXof`. LES MONTANTS DES VERSEMENTS NE
SONT PAS STOCKÉS — `echeancesDuPret` les calcule, et le dernier porte l'arrondi
pour que leur somme fasse le prêt au franc près. Les stocker ferait deux vérités
le jour où le montant se corrige.

`etatsDesEmprunteurs(lignes, branchId, aujourdhui)` porte tout le calcul, dans
foyer.ts, éprouvé par `verifie-foyer` (18 assertions neuves). LE REMBOURSÉ
COUVRE LE PLUS ANCIEN D'ABORD — la règle du comptoir : l'imputer autrement
ferait apparaître un retard là où l'emprunteur a payé. Un remboursement partiel
ampute l'échéance sans la faire disparaître.

L'ORDRE DE LECTURE EST L'ORDRE DE L'URGENCE (`parUrgence`). Trié par date de
saisie, le prêt le plus RÉCENT montait en tête — c'est-à-dire le moins pressant.

LES ATTENTES NE SONT PAS DES ÉCRITURES. Elles s'affichent en italique pâle
au-dessus des vraies lignes ; rien ne bouge dans une caisse tant que l'argent
n'est pas revenu. Une attente qui débiterait un tiroir ferait mentir la
trésorerie.

TROIS ARBITRAGES :
① **La tournée du matin prévient** — retard, ou échéance sous 7 jours
   (`pretsASurveiller`), comme les anniversaires.
② **La retenue sur salaire est PROPOSÉE, jamais imposée.** Elle arrive
   pré-remplie dans « autres retenues » du bulletin et se corrige ligne à
   ligne : un mois difficile se gère à la main, sans défaire le prêt. Elle ne
   devient un remboursement QU'AU RÈGLEMENT du run — un run abandonné aurait
   soldé un prêt qui n'a rien reçu. SANS CAISSE, et c'est le point : l'argent
   n'est jamais sorti de la Maison. Identifiant déterministe
   (`prt-ret-<période>-<employé>`) : rejouer le règlement ne double rien.
③ **Un panneau de rattrapage** liste les prêts sans date, et disparaît de
   lui-même quand il n'y a plus rien à dater — sans réglage, sans « ne plus
   afficher ».

La relance WhatsApp part signée de la devise, courte : le montant, la date, rien
d'autre. Le numéro vient de la fiche cliente ou du dossier du personnel ; sans
numéro, pas de bouton.

## Le franc suit le tiroir — 23 août, PUBLIÉ

« Quand j'ai choisi la caisse, ça dit toujours montant XOF, qui devrait
normalement suivre le montant $ de la caisse choisie. » ELLE A RAISON, ET
J'AVAIS MIS LES DEUX CHAMPS DANS LE MAUVAIS ORDRE la veille.

Ce qu'on connaît, quand on sort de l'argent d'un tiroir en dollars, c'est le
nombre de DOLLARS. Le franc n'est qu'une valorisation. Le champ principal se dit
donc dans la monnaie du tiroir — « Montant · USD » — et la contrepartie en
francs se remplit toute seule avec `rateToXof`, le taux indicatif que
currency.ts porte depuis toujours et dont le commentaire disait déjà sa
vocation : « pré-remplir un champ, que le maître corrige au taux du jour ».

LA CONTREPARTIE RESTE MODIFIABLE, ET FAIT FOI DÈS QU'ON Y TOUCHE. Le change se
négocie au comptoir, pas dans une constante. Ce qui est inscrit, in fine, ce
sont les deux montants réellement convenus — jamais une conversion rejouée plus
tard, qui ferait bouger des soldes déjà arrêtés.

DEUX SITUATIONS, DEUX CHAMPS, et les confondre ferait mentir l'un des deux :
— `ContrepartieMaison` quand le montant en devise est la source (prêt, avoir,
  dépense sans articles) : on tape des dollars, le franc suit ;
— `MontantDuTiroir` quand le franc est DÉJÀ FIXÉ ailleurs (mission d'un
  prestataire convenue en francs, dépense détaillée en articles) : on ne
  renégocie pas la somme convenue au moment de la payer, on dit seulement ce qui
  sort du tiroir.

UNE VIEILLE FAUTE TROUVÉE AU PASSAGE : l'écran des Dépenses annonçait DÉJÀ la
devise de la caisse à côté du montant (`fCur`) alors que la saisie, elle, était
en francs. Il affichait « USD » sous un nombre de francs. Il dit vrai depuis
aujourd'hui.

Harnais `verifie-coffre` : le tiroir reçoit ses 4 000 dollars, le franc suit au
taux, l'écriture porte les deux, et une contrepartie corrigée à la main
l'emporte sur le taux figé.

## Multi-devise : le tiroir compte SES billets — 22 août, PUBLIÉ

« Ok pour multi-devise. » Né d'une question : « pourquoi je ne vois pas les
caisses USD ? » Quatre formulaires les écartaient, et l'écran des Dépenses,
lui, ne les écartait pas — il imputait des francs à un tiroir en dollars.

UNE SEULE RÈGLE, `surLeTiroir(écriture, deviseDuTiroir, maison)` dans
finance.ts. Toute écriture qui nomme une caisse porte DEUX montants :
`amountXof`, la seule base comptable de la Maison (dette, avoir, charge,
coffre), et `fx.amount`, ce qui a réellement quitté ou rejoint le tiroir. Même
contrat que `InvoicePayment.fx`, posé le 11 août : **on ne convertit jamais
après coup**, on inscrit ce qui a bougé — sinon un taux qui change ferait
bouger des soldes déjà arrêtés.

`fx?` ajouté à `Expense`, `CreditMovement` (avoirs) et `Pret`. Le coffre
l'avait déjà.

TOUTES LES SOMMES DE `tiroirs.tsx` Y PASSENT — solde (`boxBalanceWhere`), flux
du mois (`boxMonthFlux`), et chaque ligne du relevé (`boxMoves`) : dépenses,
avoirs, prêts, versements au coffre. Aucune ne lit plus `amountXof` en direct.

UNE ÉCRITURE SANS `fx` SUR UN TIROIR EN DEVISE NE PÈSE RIEN, et le relevé le
DIT ligne à ligne (« montant en USD non renseigné »). On ne devine pas à un
taux du jour : c'est réparable d'un clic, l'inventer ne l'est pas. C'est aussi
ce qui rattrape l'historique des dépenses imputées à un tiroir en devise — leur
solde était faux, il devient muet et signalé.

`MontantDuTiroir` (dans tiroirs.tsx) est le champ partagé par les quatre
formulaires : prêt, avoir, prestataire, dépense. Il n'apparaît QUE si la caisse
choisie tient une autre monnaie. LE TAUX EST DÉDUIT, PAS DEMANDÉ — une case de
plus pour un chiffre calculable serait une case de trop.

LE COFFRE RESTE FILTRÉ, ET C'EST VOLONTAIRE. Son `fx` désigne déjà la devise du
COMPARTIMENT (22 août, « il y a des coffres qui ont différentes devises ») ;
lui faire dire aussi la devise de la CAISSE ferait porter deux sens au même
champ — l'ambiguïté qui casse un registre. La phrase `motDesCaissesEnDevise` y
reste et nomme les caisses écartées.

Harnais `verifie-coffre` étendu : les francs ne tombent jamais dans un tiroir
en devise, ni les euros dans le tiroir en dollars, et l'écriture muette se
signale.

## Corriger un avoir, corriger ou effacer un prêt — 22 août, PUBLIÉ

« J'aimerais éditer l'avoir de 40 000 F de Ghislain. Je veux lui changer de
caisse. » Puis : « modifier ou supprimer un prêt ». Deux écritures que rien ne
permettait de reprendre — et une ligne posée sur la mauvaise caisse déplace de
l'argent qui n'a jamais bougé.

UNE SEULE MODALE, DANS LES DEUX CAS. `DepositModal` prend un `edite?` ;
la modale des prêts prend un `pretEdite`. Écrire un second formulaire aurait
été plus rapide, et il aurait dérivé du premier au premier champ ajouté : c'est
exactement la faute du registre des encaissements, refaite trois fois cette
semaine. Poser et reprendre sont le même geste, sur la même écriture.

L'IDENTIFIANT NE BOUGE JAMAIS. La ligne du registre des encaissements en est
dérivée (`r-cre-<id>`) et le journal des gestes suit la pièce par lui : une
correction doit rester la MÊME écriture, corrigée — pas une nouvelle qui
remplace l'ancienne.

DEUX GARDE-FOUS.
① Le solde de référence d'un avoir se calcule SANS le mouvement repris — sinon
   corriger un dépôt le compterait deux fois, une fois tel qu'il est et une
   fois tel qu'on le réécrit.
② On ne rabote pas un avoir déjà consommé : ramener un dépôt sous ce que la
   cliente a déjà utilisé rendrait son compte débiteur, un solde négatif
   qu'aucun écran ne sait lire. L'écran le refuse et dit pourquoi.

EFFACER UN PRÊT vit à GAUCHE dans la fiche, loin d'« Enregistrer » — un geste
sans retour ne voisine pas avec le geste courant (même règle que « Retirer
cette caisse », le matin même). Effacer REND l'argent à sa caisse : c'est bien
ce qu'on veut d'une ligne qui n'aurait jamais dû exister.

DEUX PORTES POUR L'AVOIR. Le registre du compte (Comptes & Avoirs → la fiche →
« Corriger »), et le registre des encaissements, où Yéman l'avait vue. Ce
dernier reste EN LECTURE SEULE : son bouton mène à `/comptes?avoir=<id>`, qui
ouvre la modale sur la pièce — plutôt que d'y dupliquer le formulaire. Le
paramètre s'efface aussitôt : recharger ne doit pas rouvrir une modale qu'on
vient de fermer.

Pour les prêts, chaque ligne de la fiche est elle-même le bouton : on clique la
ligne fausse, elle s'ouvre.

## La devise s'écrit en fon, partout — 22 août, PUBLIÉ

« S'écrit comme ça : mi nyɔ́ ɖɛkpɛ • la maison veille, au lieu de mi nyó dekpe.
Respectez les polices fon ! » Deux fautes en une, et la seconde était plus
profonde que je ne le croyais.

CE QUE J'AI DÉCOUVERT EN CHERCHANT LA POLICE : **ni Cormorant Garamond ni Jost
ne contiennent ɔ, ɖ, ɛ.** Vérifié en lisant leur table `cmap` — les trois
lettres manquent dans les deux familles de la Maison. À l'écran, depuis
toujours, la devise empruntait le dessin d'une police de secours choisie par la
machine : trois lettres étrangères au milieu de notre propre devise. Sur le
papier, on translittérait (« mi nyó dekpe »), et le fichier `pdf.ts` portait même
un commentaire assumant ce pis-aller.

LA POLICE. EB Garamond porte les trois lettres, l'accent flottant et les
capitales Ɔ Ɖ Ɛ — et c'est une Garamond, comme Cormorant : la parenté rend
l'emprunt invisible. Sous-ensemble Google réduit aux seuls caractères de la
devise : 21 ko en TTF pour les PDF, 11 ko en WOFF2 pour l'écran. Licence OFL,
provenance et charset dans `src/ds/fonts/LISEZ-MOI.md` — LE CHARSET EST FIGÉ :
changer le texte de la devise oblige à régénérer le fichier.

À L'ÉCRAN, `unicode-range` restreint `MND Fon` aux SEULES lettres manquantes
(U+0186, U+0189, U+0190, U+0254, U+025B, U+0256, U+0301) ; posée en tête des
piles `--font-serif` et `--font-sans`, elle ne prend rien aux polices de la
Maison.

SUR LE PAPIER, `pieDeLaMaison()` charge le TTF comme `loadSeal` charge le sceau,
l'embarque UNE fois par document, et écrit le nom dans la police du document
puis la devise dans la sienne, l'ensemble centré. Si le fichier manque (hors
ligne), on retombe sur la translittération : une devise approchée vaut mieux
qu'une ligne de carrés vides.

L'ACCENT SE POSE À LA MAIN. « ɔ́ » n'existe pas en un seul caractère : c'est ɔ
suivi d'un accent flottant que les navigateurs recalent par leurs tables de
composition. jsPDF n'a pas de moteur de composition — mesure faite, l'accent
d'EB Garamond est centré sur l'origine (xMin −78, xMax +79), il tomberait donc
à DROITE du ɔ, dans le blanc. On l'écrit séparément, reculé de 0,219 em : le ɔ
avance de 439 millièmes, son centre visuel est à 220.

CINQ PDF SIGNENT DÉSORMAIS EN FON — facture, reçu, résumé, bulletin de paie,
rapport de caisse. Le reçu disait explicitement « pas de devise en fon ici » :
c'était vrai des polices intégrées, ça ne l'est plus.

UNE SEULE SOURCE POUR LA GRAPHIE. `DEVISE_COMPLETE` remplace NEUF copies qui
avaient toutes divergé : « · nous sommes beaux, et nous le savons », « — la
maison veille. », « — « Nous sommes beaux, et nous le savons. » ». Portail,
Bilan, Certificat, Consultation, Ma Couronne, QR codes, Vitrine, facture à
l'écran, et le verbe par défaut du thème.

## Le trousseau, et le rapport corrigé — 22 août, PUBLIÉ

**LE TROUSSEAU.** « Un bouton pour ouvrir toutes les caisses qui ont un code
simultanément, et les refermer toutes simultanément. » Six tiroirs ouverts un à
un, six fois le même code : le verrou coûtait plus qu'il ne protège, et un
verrou qui coûte trop finit par être ôté.

UN CODE N'OUVRE QUE CE QU'IL OUVRE — rien ici ne contourne le sel : les
empreintes sont salées par l'identifiant de chaque caisse. Le code saisi est
essayé sur CHACUNE des caisses encore fermées ; celles qu'il ouvre s'ouvrent,
les autres gardent le leur, ET LE TROUSSEAU LE DIT (« 3 ouvertes — 1 garde son
propre code »). On peut enchaîner un second code sans fermer la modale. Refermer
ne demande rien : fermer une porte n'a jamais eu besoin de clé.

`ouvreLesCaisses(ids)` / `refermeLesCaisses(ids)` prennent des listes
EXPLICITES, jamais un vidage : le registre des ouvertures porte aussi les clés
des écrans (`CLE_ECRAN`, `CLE_COFFRE`). Tout effacer refermerait la porte sur la
Souveraine au moment même où elle range ses tiroirs.

**LE RAPPORT, TROIS DÉFAUTS VUS SUR LA PREMIÈRE FEUILLE ÉDITÉE.**

① **La ligne se datait de la FACTURE, pas du versement.** Une pièce du 20 juin
réglée en août s'inscrivait « 20 juin » au milieu du livre d'août : le solde
courant remontait le temps sous les yeux. Le compte était juste, la lecture
mentait. `jourDuCredit` prend le dernier versement retenu — celui qui a fini de
remplir le tiroir. **Corrige aussi le relevé à l'écran**, qui portait le même
défaut depuis toujours.

② **Le compte des mouvements chevauchait le nom** : il se calait sur
`getTextWidth(nom)`, et « Caisse Principale11 mouvements » se lisait en un seul
mot. Il passe DESSOUS, à la même abscisse — aucune longueur de nom ne peut plus
le heurter.

③ **Une caisse sans mouvement dressait un tableau vide** encadré de deux soldes
identiques. Elle le dit maintenant en une ligne.

**LES CAISSES SE COCHENT UNE À UNE** — « permets-moi de sélectionner les caisses
de manière individuelle ». Chaque tiroir avec sa devise, sa mention hors bilan,
son solde ; « Toutes » / « Aucune » en raccourci. Une seule caisse retenue rend
la feuille pleine page avec ses quatre cases de résumé ; plusieurs rendent le
rapport groupé par monnaie. Les quatre cases n'ont de sens que sur une monnaie
unique — à plusieurs, elles additionneraient ce qui ne s'additionne pas.

Le harnais `verifie-rapport` tient désormais aussi la ligne du livre vide, le
tableau qu'elle ne dresse pas, et le nom long qui ne heurte plus son compte.

## Le rapport de caisse en PDF — 22 août, PUBLIÉ

« Crée-moi des rapports de caisses en PDF de la même manière » — capture d'une
autre application à l'appui. Maquette validée
(`public/maquette-rapport-de-caisse.html`), période tranchée par Yéman : **le
mois par défaut, une période libre en option**.

IL NE RECALCULE RIEN. Chaque ligne, chaque solde vient de `boxMoves` — la
source même que lit le relevé à l'écran. Un rapport qui referait les additions
de son côté finirait par contredire l'écran, et c'est alors le PAPIER qu'on
croit. Le seul chiffre qu'il fabrique est le solde courant, par accumulation
depuis l'ouverture : s'il ne tombe pas sur la clôture, la source ment, et ça se
voit sur la feuille.

LA PÉRIODE LIBRE, sans nouveau modèle de temps. Tout `useCaisses` filtre par
CLÉ DE MOIS (`keep: (mk) => boolean`) : `boxMoves(name, periode?)` prend donc
les mois entiers que la période touche, puis coupe aux deux dates. Le solde de
départ se reprend au début du premier mois et se laisse pousser par ce qui
précède la date de début — sinon un rapport du 15 partirait du solde du 1er.
Le chemin SANS période est inchangé au caractère près : il rend toujours
`boxBalanceStart` et `boxBalance`, les deux valeurs que le relevé affiche.

TROIS REFUS ASSUMÉS, tous écrits sur la feuille :
① **le solde d'ouverture est la première ligne** — le rapport montré par Yéman
   part de zéro (sa première ligne « Solde caisse Mamou » est un solde
   d'ouverture déguisé en revenu) ; un livre qui part de zéro dit un solde faux
   jusqu'à la dernière ligne ;
② **une caisse discrète refermée ne s'imprime pas** — son livre dirait son
   solde ligne à ligne — mais elle est NOMMÉE comme absente : un document
   amputé en silence vaudrait pire ;
③ **les monnaies ne s'additionnent jamais** ; hors bilan à part, comme à
   l'écran depuis le matin.

`shared/pdf.ts` : `cashbookPdf` (six colonnes, en-tête repris à chaque page,
quatre cases de résumé sur une caisse seule, section « hors bilan », pied et
numérotation). `finances/Rapport.tsx` : le choix de la période et la
fabrication des livres. Boutons : en tête de l'écran des Caisses (toutes), et
dans le relevé d'un tiroir (celui-là) — le relevé reçoit `onRapport` en
propriété car Rapport.tsx lit déjà tiroirs.tsx, et l'importer en retour ferait
un cycle que React ne pardonne pas au montage.

TREIZIÈME HARNAIS, `verifie-rapport` — et il IMPRIME POUR DE VRAI : il remplace
`jsPDF.API.save` par une prise, produit le document et relit `output()`. Il
tient la translittération du fon (« mi nyó dekpe » et jamais « ? »), la
pagination d'un livre de 90 lignes, l'en-tête repris page 2, les rangées par
monnaie, le hors bilan, la caisse refusée nommée, et le livre vide qui
s'imprime quand même. Le patch se pose sur `jsPDF.API`, pas sur le prototype :
jsPDF recopie ses méthodes sur chaque instance à la construction.

## La devise signe ce que l'IA écrit — 22 août, POSÉ

« Quand l'IA répond aux messages, toujours avoir notre devise à la fin »
(Yéman). Aujourd'hui l'IA n'écrit AUCUN message : `suggest-client` propose un
persona, rien qui parte vers une cliente. La règle est donc posée d'avance,
pour l'écran des avis Google — et la mécanique avec elle, pour qu'elle ne
dépende pas de la mémoire de qui construira.

ELLE EST POSÉE PAR LE CODE, JAMAIS DEMANDÉE AU MODÈLE. C'est le seul point qui
compte. Une consigne dans l'instruction tient la plupart du temps : le modèle
oublie une fois sur vingt, paraphrase (« nous sommes beaux ! »), ou écorche les
diacritiques — et « mi nyo dekpe » sous un avis public se lit par tout le monde,
pour toujours. `signeLeMessage(texte)` concatène après coup. Une concaténation
n'oublie jamais.

`shared/identite.ts` accueille `DEVISE_MAISON`, `houseSignature`,
`porteLaDevise` et `signeLeMessage`. La signature VIVAIT dans
`routes/clients/_shared.tsx`, à côté du rappel WhatsApp — elle appartient à
l'identité de la Maison, là où vit déjà le nom qu'elle accompagne, et l'écran
des avis ne doit pas traverser le carnet des clientes pour signer.
`_shared.tsx` la re-exporte : rien à changer chez les appelants.

`porteLaDevise` reconnaît la devise ÉCORCHÉE — accents ôtés, ɖ→d, ɛ→e, ɔ→o :
« Mi Nyɔ́ Ɖɛkpɛ », « mi nyo dekpe » et la forme juste comptent toutes. Sans ça,
un modèle qui l'aurait écrite de lui-même la verrait posée une seconde fois.

Douzième harnais, `verifie-signature` : le texte du modèle conservé mot pour
mot, la devise en dernière ligne, JAMAIS deux fois, les blancs de fin qui ne
creusent pas le message, le picto de la branche à la place du monogramme (un
lien wa.me ne transporte que du texte).

LES CINQ MESSAGES ÉCRITS À LA MAIN SIGNENT AUSSI — arbitrage de Yéman le même
jour : « les signer, et ôter les vieilles chutes ». Facture et devis (Factures),
reçu (Caisse), résumé de consultation (Consultations), anniversaire et « sceller
un forfait » (Tableau de bord). Chacun finissait à sa façon — « La maison veille
sur votre couronne », « — Maison MND », « Votre couronne vous va à merveille ».
La devise ferme désormais, seule.

CE QUI TOMBE AVEC LES CHUTES, ET QU'ELLE A ACCEPTÉ : « Réglez d'un geste — MTN
MoMo · Moov Money » disparaît du message de facture. Il n'existe NULLE PART
ailleurs (ni sur le PDF, ni sur le reçu) — si la Maison le regrette, il revient
en ligne de corps, pas en chute. Sur le reçu de caisse il était de toute façon
faux : il réclamait un règlement DÉJÀ encaissé.

CE QUE JE M'ÉTAIS TROMPÉ DE CROIRE. J'ai d'abord noté « Maison MND codé en dur
dans l'anniversaire » comme un défaut. C'était une décision, écrite dans
`identite.ts` : le nom ne s'insère JAMAIS au milieu d'une phrase française —
« Toute la Maison MND pense à vous » se briserait sur une enseigne qui ne
commence pas par « Maison ». La phrase dit maintenant « Toute la Maison », et la
devise nomme la maison en signant : le nom en dur disparaît sans casser la règle.

## Répondre aux avis Google — 22 août, EN ATTENTE DE GOOGLE

« Comment connecter les avis Google et pouvoir répondre immédiatement avec
l'IA depuis l'ERP ? » Deux moitiés très inégales.

LA MOITIÉ IA EST DÉJÀ FAITE : `suggest-client` fait tourner Claude côté
serveur depuis des semaines — clé au coffre, garde « personnel connecté »,
appel depuis un paquet statique impossible autrement. Répondre à un avis suit
ce chemin exactement. Rien à inventer.

LA MOITIÉ GOOGLE ATTEND. Lire et répondre passe par UNE porte : l'API Business
Profile sur son ancien point d'entrée v4 (`…/reviews`, `PUT …/reviews/{id}/
reply`). Les API récentes — fiche, établissements, statistiques — ne couvrent
pas les avis. L'API Places ne rend que cinq avis, en lecture seule : elle ne
fait pas un écran. Et l'API n'est PAS ouverte par défaut — projet neuf, quota
zéro, refus. Il faut la demander, Google répond en jours ou en semaines.

ARBITRAGE DE YÉMAN, deux réponses :
① **Ne rien construire avant l'accès.** J'avais proposé un pont à la main
   (coller l'avis, l'IA rédige, copier chez Google) utilisable dès demain —
   écarté. On demande d'abord, on construit ensuite.
② **L'IA propose, la souveraine valide.** Aucun envoi sans lecture, même pour
   les cinq étoiles. Une réponse publique porte le nom de la Maison, et un
   avis à une étoile mal répondu se lit par tout le monde, pour toujours.

`docs/DEMANDER-ACCES-AVIS-GOOGLE.md` porte la démarche pas à pas — projet
Cloud, les quatre API, le formulaire d'accès (et ce qu'il faut y écrire :
usage propriétaire d'un seul établissement, jamais un service revendu à des
tiers, sous peine d'examen bien plus long), l'autorisation OAuth
`business.manage`, les trois secrets `GBP_*`. RIEN D'AUTRE À FAIRE d'ici la
réponse de Google.

À la reprise : maquette d'abord, comme tout module du Trône. L'écran prévu —
avis du plus récent au plus ancien, sans réponse en tête, lien vers la fiche
quand le nom correspond, l'IA lisant l'avis ET ce que la cliente est venue
faire. La boucle se refermerait : `avis-google` demande l'avis, l'écran le
reçoit et y répond.

## Les caisses, le coffre et leurs verrous — 22 août, PUBLIÉ

Un écran à elles (`finances/Caisses.tsx`), demandé au même titre que Dépenses.
Les cartes sont **groupées par devise** — XOF, EUR, USD — parce qu'un total de
colonne n'a de sens qu'entre montants de même nature ; le sous-total d'une
devise ne descend jamais dans une autre sans passer par `fmtMoney`.

LE CALCUL EST SORTI DE L'ÉCRAN. `finances/tiroirs.tsx` porte `useCaisses(month)`
— soldes, flux, mouvements, trésorerie, exclusions — et Dépenses comme Caisses
le lisent. Deux écrans qui recalculaient le même solde finissaient par se
contredire (leçon du registre des encaissements). *Le fichier ne s'appelle pas
`caisses.tsx` : sous Windows c'est le MÊME fichier que `Caisses.tsx`, et l'écran
avait écrasé le module.*

**La caisse discrète.** Solde masqué, ouverture par code. Le code n'est jamais
stocké : `empreinteDuCode(id, code)` en garde une empreinte SHA-256 salée par
l'identifiant de la caisse — deux caisses au même code n'ont pas la même
empreinte. L'écran DIT ce que ça protège et ce que ça ne protège pas : c'est un
paravent contre un regard par-dessus l'épaule, pas un chiffrement.

Trois portes, pas une : **voir**, **modifier**, **retirer**. La première version
n'en gardait qu'une, et une caisse fermée s'ouvrait quand même par le bouton
Modifier. `openEditBox` et `deleteBox` ont chacun leur ceinture — le code se
redemande avec l'intention (`aOuvrir.puis`), et l'action reprend après.
« Retirer cette caisse » a quitté le pied de carte pour le pied de la modale
d'édition : à portée de pouce d'une carte, il se pressait par mégarde.

**Les verrous d'écran** — caisses (21 août) puis coffre (22 août) — passent par
UNE seule mécanique : `EcranVerrouille` et `ReglerLeVerrou` dans tiroirs.tsx,
avec `CLE_ECRAN` / `CLE_COFFRE` posées dans le même jeu d'ouvertures que les
caisses, et les empreintes dans `Settings.codeCaissesHash` /
`codeCoffreHash`. Recopier aurait fait deux verrous à corriger le jour où l'un
se révèle troué. Vider le champ retire le verrou. Sans empreinte posée, la porte
reste ouverte — on n'enferme personne dehors par défaut.

DEUX BOGUES DE CE JOUR, tous deux instructifs. ① « Le bouton refermer marche une
fois sur deux » : le `Set` des caisses ouvertes était muté sur place, et
`useSyncExternalStore` compare des RÉFÉRENCES — remplacement immuable partout.
② « J'ai transféré 2000 $ mais je vois 2000 F » : la ligne de transfert affichait
la devise de la maison au lieu de celle de CHAQUE caisse. Un transfert a deux
bouts et parfois deux devises.

`horsBilan` exclut une caisse des totaux — et l'écran NOMME toujours ce qu'il
exclut. Un total silencieusement amputé ment ; un total qui dit « hors bilan :
deux caisses » informe.

## Le journal des gestes — 21 août, PUBLIÉ · migration 0070 À COLLER

« Je dois tracker systématiquement qui fait quoi et quand sur Le Trône. » Né
d'une question restée sans réponse : QUI a créé le rendez-vous de Diane C. du
18 août ? La base ne pouvait pas le dire — aucun champ d'auteur nulle part, et
`updated_at` ne parle que de la dernière écriture. RIEN D'AVANT N'EST
RÉCUPÉRABLE, et l'écran le dit lui-même sur un mois vide.

LA GREFFE EST UNIQUE : `pushDiff` dans sync.ts, le point par lequel passe toute
écriture de toute collection. Il sait déjà distinguer posé (absent d'avant) /
modifié / effacé — c'est le vocabulaire du journal. Instrumenter les 28 écrans
aurait laissé des trous, et un journal troué ment plus qu'il n'informe (leçon
du registre des encaissements, la veille).

TROIS PRÉCAUTIONS, dans cet ordre : ① la greffe ne s'exécute qu'APRÈS une
écriture réussie — les chemins bloqués par les garde-fous sortent plus haut ;
② elle n'attend rien (`void`) et avale ses erreurs — une trace manquée ne doit
JAMAIS faire échouer la vente qu'elle observe ; ③ elle ne connaît que
`CARTE_DES_TABLES` — une liste qui AUTORISE, jamais une liste d'exclusions,
pour qu'une collection nouvelle n'y tombe pas par accident.

`shared/journal.ts` : le type `Geste`, la carte des tables (écran + comment
nommer une pièce), `NOM_DES_CHAMPS` (sans lui le journal dirait
« priceXof: 60000 → 15000 »), `champsChanges`, et `poseLIdentite` — sync.ts vit
sous shared/ et ne peut pas lire l'annuaire (sous apps/trone/) : chaque app
POSE son identité. Le Trône dans useReconcileClients, Ma Couronne dans son App
(porte 'couronne', « Une cliente »). `parNom` est FIGÉ à l'inscription.

ARBITRAGES DE YÉMAN : lecture souveraine seulement · 12 mois glissants · ce
qu'une main touche (pas la mécanique) · les gestes des clientes inscrits sous
leur porte d'entrée.

0070 : table en AJOUT SEUL (aucune politique UPDATE/DELETE — le contrôle
compte `politiques_de_retouche` et doit rendre **0**), lecture `is_souverain()`,
hors Realtime, **journal exclu de `_photographie_maison()`** (sinon la
sauvegarde de 3,4 Mo doublait en semaines), purge des 12 mois ATTELÉE à
`sauvegarde_nuit_sql()` — aucun cron nouveau.

Écran : Système → Journal des gestes (`routes/systeme/Journal.tsx`), lu au
SERVEUR à chaque mois, jamais lié à un magasin local. Harnais
`verifie-journal` — dix harnais désormais ; son assertion la plus importante
est la dernière : une inscription qui échoue ne jette pas.

## L'argent a un nom — 21 août, PUBLIÉ

« Dans dépenses je veux voir le revenu de quelle cliente je suis en train de
dépenser. Quand j'ai entamé un autre revenu le savoir aussi. » Maquette
validée (`public/maquette-largent-a-un-nom.html`), attribution choisie par
Yéman : **elle désigne elle-même** (ni FIFO, ni par journée).

`Expense.sources?: DepenseSource[]` — `{ ref, nom, date, xof, clientId? }`.
`ref` pointe le registre (`Receipt.id`) ; `nom` et `date` sont **FIGÉS** à
l'enregistrement, comme `Appointment.priceXof` : une fiche renommée ou une
facture annulée ne réécrit pas une dépense d'hier. Trois fonctions pures dans
finance.ts : `partsPrisesParRevenu(expenses, sauf?)` (le `sauf` évite qu'une
dépense en cours d'édition se refuse sa propre part), `partNonNommee(e)`,
`entameLeRevenu(expenses, dep, ref)` — l'entame se tranche par date PUIS par
identifiant, pour que la pastille ne saute pas d'une ligne à l'autre selon
l'ordre d'arrivée des synchronisations. Harnais `verifie-provenance` (20
assertions) — neuf harnais désormais.

Le sélecteur (modale de dépense) ne propose que les revenus de la MÊME caisse
ayant du reste, du plus ancien au plus récent, **pourboires exclus** (l'argent
des mains, pas celui de la Maison). Remplissage en cascade, bandeau d'entame
avant d'enregistrer, part « sans nom » affichée sans alarme. Changer de caisse
vide les désignations. La provenance se relit à l'envers dans Encaissements
(« Cet argent a servi à »).

TROIS DÉFAUTS CORRIGÉS D'ABORD, trouvés en explorant le modèle :
1. **Renommer une caisse l'orphelinait** — `saveBox` réétiquetait `e.cashbox`
   et `i.cashbox` mais PAS `i.payments[].cashbox`, seul lu par `boxCredit`.
   Le solde chutait de tout ce que la caisse avait encaissé, sans un mot. Le
   coffre et les avoirs avaient le même angle mort.
2. **Le relevé de caisse ne tombait pas juste** — `boxBalanceWhere` retranchait
   les versements au coffre, `boxMoves` ne les listait pas.
3. **Les dépôts d'avoir perdaient caisse et moyen** dans `buildReceipts`
   (« Espèces » codé en dur) : Dépenses créditait le bon tiroir, Encaissements
   affichait « Hors caisse ». Deux écrans, une écriture, deux vérités.

Le registre des encaissements a désormais UNE porte :
`useRegistreEncaissements()` dans `routes/finances/_shared.tsx`, lue par
Encaissements ET Dépenses. Recopier l'assemblage aurait fabriqué le défaut n° 3
une seconde fois.

## Demander partout, compte-fiche, rappels sans clé — 20 août, PUBLIÉ

La DERNIÈRE pièce de la liste du Fil est posée : DemanderModal (composant
unique) sur le RITUEL (RdvModal) et la FICHE cliente (Customers), en plus de
la facture — destinataire ou à-prendre, échéance, priorité, pièce attachée.
Le lien compte-fiche : StaffMember.compteMail (« E-mail de connexion · si
différent », Personnel & paie) + adresseDe() qui fait foi partout (Fil,
Tableau, MonMois, Factures) — la racine de « Praticien », des signatures
d'adresse et des tête-à-tête invisibles. GESTE DE YÉMAN : renseigner le champ
sur les fiches dont le compte diffère (Gérard : locksmnd@).
0066 : la clé service quitte le job cron pour le VAULT. Les deux secrets
sont posés, et les DEUX jobs du soir tournent en SQL Snippet —
rappels-j1-soir (0 17 * * *) et sauvegarde-nuit (0 2 * * *), tous deux
actifs. RESTE : le 401 des rappels.

## Le 401 « réservé au cron » — 20 août, EN COURS (0067 puis 0068)

rappels-j1 répondait 401 « réservé au cron » à chaque appel — le même mal
qui avait fait échouer la voie Edge de la sauvegarde. LA CAUSE, trouvée en
lisant les 10 premiers caractères de la clé du Vault (`left(cle, 10)` — un
marqueur de format, pas un secret) : elle commençait par `sb_publishab…`.
C'était la clé PUBLIABLE. Les anciens jobs qui obtiennent des 200
(mnd-staff-rdv-1h toutes les 15 min, mnd-push-rappels chaque heure) la
portent aussi — leurs fonctions ne vérifient rien — mais rappels-j1 (comme
sauvegarde-nuit avant elle) compare l'Authorization à SA clé secrète et
refuse tout le reste. Depuis le début on présentait la clé publique.
LE REMÈDE : la clé SECRÈTE (`sb_secret_…`), Project Settings → API Keys →
Secret keys → Reveal, posée au Vault par vault.update_secret. Ni la
publiable, ni le vieux jeton `eyJ…` des Legacy keys.
LEÇON : ne jamais recopier une clé « depuis ce qui marche » sans savoir ce
qu'elle EST — deux fonctions peuvent réussir avec des clés de portée
opposée. Lire le préfixe coûte un caractère et tranche tout.

## Le push n'a jamais eu besoin de secret — 20 août (0069)

FIN DE LA CHASSE, et son démenti. push-notify contient DÉJÀ un mode
`reminders` qui fait les rappels J-1 (fenêtre 22–24 h avant, journal
push_reminders, idempotent) et NE DEMANDE AUCUN SECRET — seule la
passerelle exige une clé, et la publiable lui suffit. Le job
`mnd-push-rappels` l'appelle CHAQUE HEURE et répond 200 depuis toujours.
Son `{"sent":0}` n'était pas une panne : « aucun abonnement ne correspond ».
LA VRAIE CAUSE du « mon téléphone n'a pas vibré » : les abonnements
pendaient à des fiches clientes SUPPRIMÉES (comptes d'essai Ma Couronne
yemanboya1@/yemanboya2@ — 7 appareils au total). Remède : repointer
push_subscriptions.client_id vers la fiche gardée.
0069 ajoute un corps à appelle_fonction_edge(nom, corps) et
`pousse_les_rappels_sql()` pour déclencher le balayage à la demande.
rappels-j1 (le 401) ne sert plus qu'au WhatsApp et au SMS — en attente des
clés Meta/Twilio. Le PUSH ne l'a jamais attendue.
PIÈGE DE LA FENÊTRE : un rappel J-1 ne part qu'entre 22 et 24 h avant le
rendez-vous. Tester à 18 h sur un RDV du lendemain 09:00 ne déclenche
rien — sa fenêtre était le matin même. Poser le RDV d'essai à ~24 h.
LEÇON : avant de réparer un chemin, vérifier qu'un autre ne fait pas déjà
le travail. Trois migrations de clé pour un problème d'abonnement.
PROUVÉ le 20 août 18:27 : pousse_les_rappels_sql() → 200 {"sent":5}, cinq
appareils touchés, le téléphone a vibré.

ATTENTION LE JOUR DES CLÉS META. Si rappels-j1 se met à marcher (clé
secrète sb_secret_… au Vault), la Maison enverra DEUX push pour le même
rendez-vous : rappels-j1 pousse via push-notify mode `to-client` et tient
son journal `envois`, tandis que mnd-push-rappels pousse via le mode
`reminders` et tient le sien, `push_reminders` — les deux journaux
s'ignorent. AVANT de brancher le WhatsApp, choisir : soit retirer le bloc
① PUSH de rappels-j1 (il ne fera plus que WhatsApp + SMS), soit désactiver
le job mnd-push-rappels. NE PAS laisser les deux vivants.

DEUX MIGRATIONS POUR LA MÊME LEÇON, prise des deux côtés. 0067 élargit le
contrôle de forme (« ou sb_secret_… ») — et 0068 le SUPPRIME : un contrôle
de forme bénit les mauvaises clés (0067) et bloque les bonnes (0068). Le
seul juge est l'essai réel : la fonction répond 200 ou 401, et
net._http_response garde le verdict lisible. Le portier ne vérifie plus
que la PRÉSENCE des deux secrets ; délai d'appel porté à 15 s (5 s ne
suffisaient pas à trois rendez-vous).

LIRE LE VERDICT D'UN APPEL (le journal `envois` reste muet si l'appel n'a
pas abouti — c'est net._http_response qui parle) :
  select id, created, status_code, timed_out,
         left(coalesce(error_msg, content, ''), 300)
  from net._http_response order by id desc limit 5;

## La sauvegarde de la Maison — 20 août, EN SERVICE (0065, sans clé)

PREMIER CLICHÉ PRIS le 20 août 07:39 : 3 281 lignes, 91 tables, 3,4 Mo.
La voie Edge (0064 + fonction sauvegarde-nuit) échouait en 401 — la clé
service collée dans l'en-tête du cron casse pour un caractère invisible.
0065 supprime la clé de l'équation : le cron est un SQL SNIPPET interne
(`select public.sauvegarde_nuit_sql();`, 0 2 * * *) ; _photographie_maison()
découvre les tables et S'EXCLUT elle-même du cliché (l'œuf et la poule) ;
coffre = table sauvegardes_nuit, un cliché/jour, 14 j de garde, lecture
souveraine ; le bouton « Photographie du serveur » des Paramètres reste la
mémoire longue (télécharger chaque semaine, ranger hors Supabase). La
fonction Edge et le bucket restent déployés mais ne servent plus.
RESTAURER depuis un cliché : geste guidé à demander le jour venu.

## 0061 — les consultations reviennent · 19 août, À EXÉCUTER

Les trois consultations ÐÓTÓ™ (créées ensemble, sorties du catalogue le
30 juillet avec le débranchement des semences, non reprises par v6) :
Yéman en remet DEUX dans l'atelier KÒKÒ™ — Conseil & Diagnostic (5 000 F)
et Création — Première couronne (10 000 F). « Réparation & Amélioration »
n'est PAS recréée : « elle est devenue le KÒKÒ Suivi · Diagnostic Locks
Externes ». Migration 0061, idempotente, ids d'origine gardés (svc-doto-*)
pour que l'histoire les retrouve. Contrôle : revenus = 2.

## L'avis Google de la première venue — 18 août, PUBLIÉ

DEMANDE : « Je veux que mes nouvelles clientes de passage laissent un avis
Google une fois la prestation terminée. » Lien remis par Yéman :
`REVIEW_LINK_DEFAUT` (g.page/r/CYEt1s4BqvZDEBE/review) — public par nature,
corrigeable dans Paramètres › Automatisations (`autoConfigStore.reviewLink`,
le champ existait déjà, rien ne le lisait).

TROIS VOIES, deux construites :
- **WhatsApp à l'encaissement** (actions.tsx, fin de `confirm`) : rituel soldé
  + PREMIÈRE pièce réglée de cette tête + fiche avec téléphone → WhatsApp
  s'ouvre, message écrit, un tap pour envoyer. Une habituée n'est jamais
  relancée. Interrupteur : `automationsActiveStore['avis-premiere-venue']`
  (actif par défaut, convention Marketing).
- **QR « Laissez-nous un avis »** (QrCodes.tsx) : le carré ouvre le FORMULAIRE
  d'avis, pas la carte ; affichage comptoir + copie du lien.
- **Envoi vraiment automatique** : CONSTRUIT le 19 août — fonction planifiée
   (moule de rappels-j1 : clé
  service, journal envois idempotent , fenêtre 2
  jours, première pièce réglée seulement). Interrupteur
   (Paramètres › Automatisations) : éteint, la
  fonction rend { actif: false } et le comptoir garde le tap ; allumé, la
  fonction écrit et le comptoir se tait. RESTE À YÉMAN : dossier Meta +
  modèle  + secret WA_TEMPLATE_AVIS + cron — guide complet
  dans docs/BRANCHER-ENVOIS.md, étape 5. NE PAS allumer sans les clés.

## La devise vit au VERSEMENT — 18 août, PUBLIÉ

Les 100 € de Stevie A. (5 août) invisibles au tiroir EUR et muets sur le PDF :
`Invoice.fx` n'était écrit qu'à la CRÉATION d'une pièce, et un second versement
s'inscrit sur une pièce existante sans la réécrire. Depuis le 17 août (une pièce
par rituel, plusieurs règlements), c'est le cas NORMAL, pas l'exception.

- `InvoicePayment.fx` { code, rate, amount } — les billets réellement tendus,
  pourboire compris ; `amountXof` reste la seule base comptable.
- Le repli d'`invoiceReglements` descend le `fx` des pièces d'avant sur leur
  versement unique : une seule forme à lire partout.
- Le tiroir en devise (Depenses `boxCredit`) somme les versements, plus la pièce.
- Document + PDF : chaque ligne de règlement dit ses billets et son taux.
- RÉPARATION des versements d'avant : dans « Réglé — voir et corriger les
  règlements », un versement rangé dans un tiroir étranger a un champ « reçu …
  EUR » — on saisit les billets, le taux s'en déduit. C'est ainsi que Stevie
  se répare (saisir 100).

## La remise de ligne reste sur SA ligne — 18 août, PUBLIÉ

« Je dois voir la remise de 20 000 F sur la ligne de la prestation avec les
60 000 F barrés. » À l'émission, les remises de ligne du rituel étaient fondues
dans `globalDiscountXof` : total juste, ligne muette. Désormais
`lignesDuRituel()` écrit `discountPct`/`discountXof` sur chaque ligne (index par
`serviceIds`, même garde qu'`alignerFacturesDuRituel`) ; seule la part restante
va au global. Le document barre le prix plein et dit « remise −X % puis −Y F » ;
le PDF aussi — il IGNORAIT `discountXof` jusque dans le calcul de la ligne.
`totals` (Factures) passe par `ligneNetXof`. L'idempotence d'aligner compare
aussi la remise en francs.

## Effacer le terminé, et le soin du Fil — 18 août, PUBLIÉ

`puisJeEffacer` : un message par son auteur ; une demande OUVERTE par son auteur
seul ; TERMINÉE aussi par son destinataire ou le souverain (l'état « éteinte par
facture » se passe en paramètre). Bouton sur les cartes de « Terminé » et dans
le fil. Soin du Fil : défilement au dernier message, trait daté entre les jours,
Entrée envoie (Maj+Entrée à la ligne), survol signalé. Compositeur « Poser une
carte » en tête du Tableau. Le tout au téléphone : pastilles horizontales (Fil),
colonnes aimantées 82vw (Tableau).

## Le Tableau — 18 août, CONSTRUIT ET PUBLIÉ

DEMANDE (Yéman) : « Je veux une organisation avec chaque nom sous une colonne et
ses tâches, et pouvoir déplacer les tâches vers d'autres membres ou quand c'est
terminé. Comme Monday ou Asana. » Maquette `public/maquette-le-tableau.html`
validée le jour même : « construis tous les tableaux de la maquette. Le tableau
peut suivre le rang. C'est bon comme ça. » — ce qui tranche les quatre
arbitrages tels que proposés.

LE PARTI PRIS : **aucune table nouvelle, aucune migration**. Une carte EST une
demande de `fil_messages` ; la glisser sous un autre nom réécrit `demandePour`
(et pousse une trace dans `mouvements[]`), la déposer dans « Terminé » pose
`faitAt`, la ressortir rouvre. `echeance` facultative — le retard se CALCULE,
jamais ne se coche ; les sans-date se rangent sous un trait. « À prendre » est
la sentinelle `A_PRENDRE = '*'` (pas une adresse : ne tombe dans le « à
traiter » de personne). « Terminé » garde 7 jours (`faiteRecemment`) ; une
demande éteinte par sa facture soldée ne se rouvre pas à la main.

LE RANG (`demandesDuTableau`) : le souverain voit toutes les colonnes ; le
maître voit sa colonne, « ce que je demande », et l'à-prendre. Le boss-à-boss
reste hors de la vue du personnel. Une adresse orpheline (fiche supprimée)
garde SA colonne « sans fiche » chez le souverain — la faire tomber dans
à-prendre réécrirait son adresse en silence.

COLMATÉ EN CONSTRUISANT : `argent` était écrit à l'envoi et JAMAIS lu — un
maître sans prix voyait « 81 000 F » dans le fil. `messageVisible` /
`messagesDuCanal` / `demandesDuTableau` prennent `sansPrix`. Et `/fil` +
`/tableau` sont entrés dans `ROUTES_MAITRE` : le Fil a été construit POUR que
Gérard y pose ses comptages, mais sa porte dépendait d'une case de la matrice.

HUITIÈME HARNAIS : `verifie-fil` (46 assertions) — il REJOUE les deux fuites du
18 août (boss-à-boss public, argent non filtré) et éprouve rang, déplacement,
clôture, extinction par facture, échéance, 7 jours, expiration, comptages.
Leçon au passage : une facture d'essai sans `discountPct`/`globalDiscountPct`
fait un total NaN — jamais soldée.

Fil.tsx : le compositeur pose l'échéance (visible dès qu'on choisit un
destinataire) et « En faire une demande · à prendre ».

## Les maquettes étaient SERVIES en public — 18 août, CORRIGÉ

`public/` est recopié tel quel par Vite : `maquette-le-fil.html` se retrouvait en
ligne sur les QUATRE sites (vérifié : 200, et trois noms de clientes en clair),
et dans l'historique des dépôts `gh-pages`, qui sont publics. Le fichier n'était
pourtant suivi par aucun commit du dépôt source — d'où l'angle mort : la règle
gardait `supabase/import_v6*.sql`, pas ce qui sort par le BUILD.

`scripts/build-sites.mjs` retire désormais `maquette-*.html` de chaque `dist`
avant la copie. Elles restent lisibles en développement, là où elles servent.
La nouvelle maquette ne porte que des initiales.

FAIT le 18 août : `MND_REFONDE=1 node scripts/publie.mjs` — quatre branches
`gh-pages` reconstruites à neuf (dépôt vierge, un seul commit, poussée en force).
Vérifié : `maquette-le-fil.html` rend 404 sur les quatre sites, et chaque branche
ne porte plus qu'UN commit. Les anciens ne sont plus référencés ; GitHub les
ramasse de son côté, mais qui détenait déjà une empreinte peut encore l'atteindre
un temps.

RESTE : le dépôt SOURCE, lui, est public et porte des noms réels — une quinzaine
de fichiers suivis, presque tous en commentaire (« le 13 août, Hermine D. et
Élodie A. »), plus deux valeurs affichées en dur (`bulletin.html`,
`certificat/App.tsx`). Audit reproductible : extraire les `"name"` du bloc
`insert into public.clients` des imports, et les chercher dans `git ls-files`.

## Une pièce par rituel, plusieurs règlements — 17 août, ÉCRIT, PAS PUBLIÉ

**Le code est complet et vérifié ; rien n'est en ligne.** Typecheck 0, les SEPT
harnais au vert, dont 15 assertions neuves sur le journal des versements.

DEMANDE (Yéman, 17 août) : « Hermine D. devrait avoir tous ces règlements sur
une même facture avec différentes dates de paiement ou différents moyens de
paiement. Pas besoin de deux factures différentes le même jour. Ensuite besoin de
savoir le montant de chaque prestation. Je ne veux pas tout en un bloc. »
Décision complémentaire : **fusionner aussi les pièces déjà coupées**.

POURQUOI LES DEUX NE FONT QU'UN : un règlement partiel créait une pièce, et cette
pièce se réduisait à « Règlement · A + B + C ». Le bloc n'était pas un choix
d'affichage — une pièce qui ne vaut que 30 000 F sur un rituel de 81 000 ne peut
pas détailler les prestations sans les proratiser. **Le bloc était la conséquence
du découpage.**

FAIT :
- `finance.ts` — `InvoicePayment`, `Invoice.payments[]`, et les lectures
  `invoiceReglements` (repli rétro-compatible sur les pièces d'avant),
  `invoiceRegleXof`, `invoiceResteXof`, `invoiceSoldee`, `invoiceRegleAu`,
  `invoiceCaisseAu`. Additif : sans écriture, le comportement est inchangé.
- `actions.tsx` — l'encaissement inscrit le versement sur LA pièce du rituel au
  lieu d'en créer une seconde ; les prestations se détaillent TOUJOURS ; le
  statut suit l'argent (`payée` si soldée, sinon `envoyée`).

- **LES ~20 LECTURES D'ARGENT** sont passées au journal : Synthèse, Bilan
  mensuel, Tableau de bord, Analytics, Comptes, Dépenses, Coffre, `receipts.ts`.
  Toutes faisaient `paidInv.filter(date).reduce(invoiceTotal)` ; une pièce à
  moitié réglée étant désormais `envoyée`, elles auraient effacé l'argent reçu.
  **La règle est maintenant : le statut ne dit plus ce qui est entré, le
  VERSEMENT le dit.** `invoiceRegleAu` pour le revenu, `invoiceCaisseAu` pour les
  billets, `invoiceResteXof` pour les créances.
- CONSÉQUENCES VOULUES : une caisse est créditée versement par versement (un
  rituel réglé moitié espèces moitié MoMo crédite DEUX caisses, plus une seule) ;
  le registre des reçus émet UNE preuve PAR VERSEMENT ; une créance vaut son
  SOLDE et non le total de la pièce.
- **L'OUTIL DE FUSION** — « Rassembler les pièces d'un rituel » dans Factures.
  Les règlements se réunissent sur la pièce la PLUS ANCIENNE (un numéro déjà
  remis à une cliente ne se réattribue pas), les lignes se détaillent, le rituel
  se re-pointe sur la survivante. L'aperçu compare « reçu avant » et « reçu
  après » : ils doivent être égaux, sinon il refuse de se croire.
- L'assertion « un règlement partiel ne se détaille pas » a été CONSERVÉE : elle
  ne parle pas de l'encaissement mais de l'alignement des pièces ANCIENNES, dont
  la ligne unique commence par « Règlement · ». Elle reste vraie.

CE QUE LES 15 CONTRÔLES NEUFS PROTÈGENT : 30 000 F en août et 51 000 en
septembre comptent dans DEUX mois ; l'avoir entre au revenu mais pas en caisse ;
et une pièce d'AVANT, sans journal, donne exactement les chiffres d'hier.

## Les KLƆKLƆ™ glissent d'un cran — 17 août, TOUT A ÉTÉ ANNULÉ

⚠ **ÉTAT ACTUEL DE LA BASE : COMME AVANT LA DEMANDE.** Yéman ne s'y retrouvait
plus dans ce qu'elle lisait et a demandé le retour complet. `0057_retour_a_l_etat_initial.sql`
a annulé `0054`, `0054c`, `0054d`, `0055` et `0056` d'un seul mouvement, en
reposant la colonne `data` telle que la photo la plus ANCIENNE la gardait —
jamais en rejouant les migrations à l'envers, ce qui pouvait s'arrêter au milieu.

CONTRÔLE FINAL : `rituels_differents = 0`, `pieces_differentes = 0`,
`fiches_differentes = 0`, `prixParLongueur` du module à `null`. Chaque ligne est
identique AU BIT PRÈS à la photo d'avant. Repères d'origine retrouvés : 18 lignes
« La Dépose », 18 rituels sur `sv-plt-05-pre-c`, 0 confirmé dégelé, 141 honorés
gelés à 6 146 200 F.

**Rien de ce qui suit n'est en vigueur.** Les fichiers `0054*`, `0055`, `0056`
restent au dépôt comme travail préparé, PAS comme migrations passées : les
relancer refera tout. La suite du chapitre ne se lit que pour ses leçons.

UN ÉCART À CONNAÎTRE SI ON RECOMMENCE : après le retour, le compte est 145
« Souffle » / 113 « Ancrage », alors que la mesure prise EN COURS DE ROUTE disait
147 / 111. Le total est le même (276). L'écart vient de l'ordre des choses : la
mesure intermédiaire a été prise APRÈS que le navigateur eut repoussé son cache
sur 18 lignes, tandis que `repli_0054` a été photographié DANS la transaction,
avant que rien ne bouge. **La photo est le vrai « avant » ; une mesure prise en
cours de migration ne l'est pas.**

Tables de repli en place : `repli_0054_*`, `repli_0054c_*`, `repli_0054d_invoices`,
`repli_0055_catalog_services`, `repli_0056_appointments`, `repli_0057_*`. Ne PAS
les supprimer : `repli_0054_*` et `repli_0055` sont désormais la seule photo de
l'état d'origine, et `repli_0057_*` garde l'état d'après le glissement si Yéman
veut y revenir.

SI ON REPREND CE CHANTIER : une prestation à la fois, une facture montrée à
l'écran avant de toucher aux 130 autres. Sept requêtes de contrôle d'affilée sur
une base de production ne se lisent pas — c'est ce qui a fait perdre pied.

MIGRATION **0054 EXÉCUTÉE** (`0054_kloklo_glisse_dun_cran.sql`, `commit;` passé
dans l'éditeur SQL) — **le contrôle `0054b` n'a pas encore été relu**. Tant qu'il
ne l'est pas, ne rien conclure : « Success. No rows returned » ne dit pas ce qui
est écrit.

Décision de Yéman : la Dépose devient l'Ancrage, l'Ancrage devient le Souffle.

| Avant | Après | Prix du nouveau (court) |
| --- | --- | --- |
| KLƆKLƆ™ Prestige · « La Dépose » (`sv-plt-05-pre-c`) | KLƆKLƆ™ Signature · « L'Ancrage » (`sv-plt-05-sig-c`) | 12 000 |
| KLƆKLƆ™ Signature · « L'Ancrage » (`sv-plt-05-sig-c`) | KLƆKLƆ™ Essentiel · « Le Souffle » (`sv-plt-05-ess-c`) | 8 000 |

**D'UN SEUL `case`, jamais en deux `update`.** Appliqué l'un après l'autre, un
Prestige descendrait DEUX crans — il deviendrait Signature, puis le second
passage le prendrait pour un Signature d'origine et le ferait Essentiel. Le
glissement est simultané par construction : un `case` s'évalue une fois par
ligne.

**SUR LES DEUX SURFACES.** Les pièces ET les rendez-vous. Renommer la facture
seule ne tient pas une journée : `alignerFacturesDuRituel` repart des
`serviceIds` du rituel, et le premier réenregistrement de la modale RDV
réécrirait la ligne à l'ancien nom. Le carnet et la pièce doivent dire la même
chose.

L'ARGENT, règle tranchée : **pièce payée = le NOM seul change**, montant, total
et chiffre d'affaires intacts — elle atteste ce qui est entré. **Pièce envoyée ou
brouillon = recalculée** au prix du nouveau nom : rien n'est entré, c'est une
réclamation, elle doit demander le juste prix. Les rendez-vous HONORÉS ou déjà
facturés **figent leur `priceXof` AVANT** le glissement : sans ce gel, un rituel
Prestige à 18 000 F se relirait 8 000 F au catalogue et la Synthèse perdrait la
différence en silence. Les rituels à venir, eux, suivent le nouveau tarif — c'est
bien ce geste-là que la cliente recevra.

LE PIÈGE ÉVITÉ, à retenir : `src/shared/catalog-v6.ts` **A DÉRIVÉ du catalogue
vivant**. La semence décrit encore trois fiches par longueur (`·C ·M ·L`,
`troisLongueurs`) à 15 000 / 28 000 ; le serveur, lui, porte UNE fiche `-c` par
niveau avec une grille `prixParLongueur`, à 12 000 / 18 000, et des libellés qui
disent « Le Shampoing » — mot absent de la semence. Écrire le `replace` d'après
le fichier n'aurait rien remplacé, **sans erreur**. Les libellés et les prix ont
été relus sur `catalog_services` avant d'écrire une ligne de SQL. La semence
n'est pas la source de vérité ; le serveur l'est.

Aucune composition de forfait ne cite le Signature ni le Prestige (vérifié) —
rien à réécrire de ce côté.

CE QUI S'EST RÉELLEMENT PASSÉ — trois fichiers ont été nécessaires, et les deux
premiers contrôles disaient vrai pour de mauvaises raisons.

**Les RENDEZ-VOUS ont glissé du premier coup** : `reste_prestige = 0`, 18 rituels
portent Signature (venus de Prestige), 316 portent Essentiel. Ils ne stockent que
des IDENTIFIANTS — aucune chaîne de caractères n'intervient, rien ne pouvait
rater.

**Les LIBELLÉS de facture, eux, n'ont pas bougé d'un iota — deux fois.** Le
`replace()` du 0054 puis du 0054c visait la forme LONGUE lue dans le catalogue
vivant, `KLƆKLƆ™ Prestige · Le Shampoing « La Dépose »`. Or les pièces portent la
forme COURTE, `KLƆKLƆ™ Prestige · « La Dépose »` — 32 caractères, contrôlé.
`replace()` qui ne trouve pas sa chaîne rend le texte inchangé, SANS ERREUR :
deux no-op silencieux. Réparé par `0054d_kloklo_les_libelles_enfin.sql`, qui
cherche un MOTIF (`regexp_replace`) absorbant forme courte et longue, apostrophe
courbe et droite, suffixe de longueur et libellé composite.

**LA LEÇON, et elle vaut pour toute réécriture de pièces : vérifier le catalogue
ne suffit pas quand on réécrit des FACTURES.** Une facture est un document du
PASSÉ — elle porte le nom qu'avait la prestation LE JOUR OÙ ELLE A ÉTÉ ÉMISE,
pas celui d'aujourd'hui. Le catalogue a été renommé depuis (« Le Shampoing »
ajouté) sans que les pièces suivent. Il faut **lire les libellés dans `invoices`
et compter les variantes**, jamais les déduire de `catalog_services`. Corollaire :
un `replace()` exact est un outil dangereux ici — il échoue en silence. Motif,
toujours.

DEUXIÈME LEÇON, sur les contrôles : « avant = après = 6 820 300, écart nul » a
été lu comme une preuve que l'argent était protégé. C'était vrai — mais
trivialement, parce que RIEN n'avait changé. **Un contrôle qui ne peut pas
échouer ne contrôle rien.** Il faut toujours un compteur POSITIF à côté du
compteur négatif : combien de lignes portent le NOUVEAU nom. Même faute sur
`reste_ancien_rdv`, qui comptait les rituels contenant `sig` OU `pre` — or un
rituel correctement glissé depuis Prestige contient désormais `sig`. Le seul
signal juste était `pre`, qui devait disparaître.

TROISIÈME LEÇON, qui reste vraie même si la panne n'était pas là : **après une
migration, on ne relance jamais la migration.** Rejouer le glissement ferait
descendre un SECOND cran tout ce qui a déjà glissé. Le nom ne dit pas si une
ligne a reculé ou si elle a bien avancé : les deux disent la même chose. Ce qui
les distingue, c'est **l'égalité stricte avec la photo d'avant** (`repli_0054`) —
une ligne revenue en arrière est identique au bit près à sa photo, une ligne qui
a glissé en diffère. **Toute table de repli mérite ce rôle : ce n'est pas qu'un
filet de rollback, c'est le seul témoin capable de dire QUI a été touché.**

RÉSULTAT FINAL, contrôlé en base après le 0054d : **zéro « La Dépose »**, les 18
devenues « Signature · L'Ancrage » (12 payées + 6 envoyées, le compte tombe
juste), **258 lignes « Le Souffle »** (147 d'origine + 111 ex-Ancrage), rituels à
`reste_prestige = 0`. Argent des pièces payées **6 741 000 avant, 6 741 000
après** — et ce contrôle-là pouvait échouer, `repli_0054d` contenant de vraies
pièces modifiées. Les deux libellés COMPOSITES (« Règlement · KLƆKLƆ™ … + SÍNSIN™
… + … ») ont survécu intacts : seule la part KLƆKLƆ™ a été réécrite. Un
remplacement de libellé ENTIER les aurait détruits — raison de plus de passer par
`regexp_replace` sur un motif plutôt que d'écraser la chaîne.

COSMÉTIQUE NON TRAITÉE (aucune erreur, juste de l'hétérogénéité d'époque) :
« Le Souffle » coexiste sous deux formes — courte, 34 caractères, 132 lignes,
émises avant que la fiche gagne « Le Shampoing » ; et longue, 47 caractères,
123 lignes. Plus une ligne « … « Le Souffle » · Court » (42), vestige des trois
fiches par longueur, et « à Façon Lavage · shampoing/Shampoing apporté » qui
diffèrent d'une capitale. À normaliser si Yéman le demande.

TRANCHÉ : les 8 rituels **confirmés** portaient un `priceXof` figé à l'ancien
tarif (383 000 F au total) — ils auraient annoncé « Signature » et facturé le
prix du Prestige. Yéman : **la cliente paie le geste qu'elle REÇOIT**. Le gel
saute sur les confirmés À VENIR (`0056_les_rituels_a_venir_suivent_le_nouveau_tarif.sql`),
le prix se relit au catalogue le jour de la venue. Les 141 honorés gardent le
leur — c'est ce gel qui protège la Synthèse. Effet de bord assumé : un rituel
dégelé relit TOUTES ses prestations au catalogue du jour, pas seulement le
KLƆKLƆ™. Un confirmé dont la DATE EST PASSÉE n'est pas touché : il n'est plus « à
venir », et le retarifer réécrirait un chiffre annoncé sans qu'on l'ait décidé.

CONTRÔLÉ APRÈS 0056 : `honoré` **141 rituels, 141 gelés, 6 146 200 F** — aucun
dégel accidentel, la Synthèse tient. `confirmé` : 3 dégelés, 5 encore gelés
(245 000 F). `annulé` : 1, inchangé. Les 3 dégelés coûtent **12 000 F** au total
(−2 000, −8 000, −2 000 sur 138 000 F annoncés) : c'est ce que la Maison renonce
à demander pour que la cliente paie le geste qu'elle reçoit.

Yéman a aussi tranché de **laisser les libellés d'époque tels quels** — une
facture porte le nom que la prestation avait le jour de son émission. Les deux
formes de « Le Souffle » coexistent donc volontairement.

SIGNAL DE CARNET, hors migration : les **5 rituels « confirmé » dont la date est
PASSÉE** ne sont pas une anomalie de tarif mais de suivi — un rendez-vous dont le
jour est derrière nous devrait être `honoré` ou `annulé`. Ils gardent leur gel
(245 000 F), ce qui est correct s'ils ont eu lieu avant le glissement. À traiter
dans le carnet, pas en SQL.

À SURVEILLER, cause structurelle : `sync.ts` pousse le cache local par-dessus le
serveur sans jamais comparer les versions. Les gardes existantes ne visent que
l'écrasement ET la suppression EN MASSE — 18 lignes passent dessous. Tant que ce
n'est pas corrigé, **toute migration exige que les onglets soient fermés**, et le
contrôle doit être relancé APRÈS rechargement, jamais seulement avant.

## Le module de reconstruction retrouve sa longueur — 17 août

MIGRATION **0055 À PASSER** (`0055_module_reconstruction_par_longueur.sql`).
« GBÌGBÌ™ Module · Le Soin Reconstruction » (`sv-plt-40-m`) se vendait 15 000 F
quelle que soit la tête, sans grille. Yéman garde le prix d'aujourd'hui en
plancher — même règle que l'atelier VÈKPÈ™ : **court 15 000 · mi-long 20 000 ·
long 25 000**, `priceXof` inchangé à 15 000 comme repli quand la longueur est
inconnue. Une grille par longueur est un prix ÉCRIT : elle neutralise le
coefficient de tranche et sort au franc près, sans arrondi au 500 F ; le Juste
Prix personnel continue de s'appliquer, c'est un accord par CLIENTE, pas une
taille. Les voisins GBÌGBÌ™ (Protéiné 15 000, Essentiel, Profond) gardent leur
prix — seul le Module était demandé.

## On ne prédit pas le retour de qui vit ailleurs — 16 août

« Sur cette liste beaucoup de personnes de la diaspora — Célia, Inayat,
Sydney, Kassira, One L., Leila. Comment on fait pour qu'ils n'aient plus de
prédictions ? » (Yéman, en lisant « celles qui ont glissé »). LA DIASPORA VIENT
QUAND ELLE EST AU PAYS : sa cadence ne mesure pas un rythme, elle mesure des
billets d'avion. `predictNextVisit` ne la prédit donc plus, exactement comme la
cliente de passage — et la liste des retards cesse de noyer les vraies
relances sous des gens qu'on ne relance pas.

UN SEUL JUGE, ENFIN — `estDiaspora` (shared/clients). La notion vivait à DEUX
endroits, et le code le disait déjà dans le commentaire de `dePassage` : le
CHAMP `diaspora` (lu par les signaux de persona) et le SEGMENT « Diaspora » (lu
par le registre des Clientes). Le compteur annonçait « Diaspora 1 » quand la
Maison en reconnaissait cinquante. Le juge lit LES DEUX — rien ne casse, aucune
donnée à migrer — et le registre des Clientes passe désormais par lui.

LE GESTE OÙ ON RECONNAÎT : chaque ligne de « celles qui ont glissé » porte un
bouton **Diaspora**. Un clic, une confirmation qui dit ce qui va se passer, et
elle sort des prédictions. Il écrit LE CHAMP, jamais le segment — un segment se
renomme et s'efface depuis une liste, et le prédicat casserait en silence
(même doctrine que `dePassage`). CE QUI NE CHANGE PAS : un rendez-vous DÉJÀ
PRIS s'affiche toujours — elle est au pays, elle vient. Le garde ne touche que
la prédiction. HARNAIS : 4 vérifications de plus, dont le champ ET le segment.
PUBLIÉ @ `84f206f`.

## La Cadence — la salle des prédictions — 16 août

« J'aimerais voir le module de l'intelligence, la salle qui gère les
prédictions des RDV à venir, les graphes liés à l'analyse, les calculs, et
avoir la possibilité d'aller plus loin » (Yéman). Le juge existait
(`shared/cadence.ts`) mais ne parlait qu'à l'oreille d'UNE fiche : personne ne
voyait la charge qui vient, ni qui avait glissé. Nouvelle page **Pilotage → La
Cadence** (`/cadence`, `pilotage/Predictions.tsx`) :

① EN UN REGARD — attendues sous 7 j (dont combien déjà au carnet), en retard,
chiffre attendu sous 30 j, cadence médiane de la Maison. ② LA CHARGE QUI VIENT
— histogramme empilé sur 8 ou 12 semaines, indigo = déjà au carnet, cuivre =
estimé. FAIT MAIN, aucune librairie de charts (règle de marque). ③ CELLES QUI
ONT GLISSÉ, par ancienneté, un clic ouvre la fiche. ④ À QUEL RYTHME ELLES
REVIENNENT — distribution des cadences. ⑤ CE QUE VAUT CHAQUE ESTIMATION —
haute/moyenne/faible ET le nombre de têtes SANS estimation : la salle dit ce
qu'elle NE SAIT PAS. ⑥ COMMENT LA MAISON CALCULE — les six règles en clair, et
la limite dite franchement (ceci lit le passé ; une aide à la relance, pas une
promesse). ⑦ TOUTES LES TÊTES ATTENDUES, chaque ligne ouvre la fiche.

LA RÈGLE DE CETTE SALLE, à tenir si on l'étend : **elle ne prédit rien de plus
que le juge.** Elle montre ce qu'il calcule déjà, en dit la méthode, et ouvre
la fiche pour agir. Une salle de pilotage qui inventerait un chiffre serait
pire qu'une salle vide. PUBLIÉ @ `7e1fae8`.

TROIS AJOUTS le même jour (@ `89dd4e7`). ⑧ LES MOIS CREUX — venues par mois du
calendrier RAPPORTÉES au nombre d'années où le mois a été observé, sinon un
mois vu deux fois pèse double et le « creux » ne dit que l'âge de la Maison.
Indice contre un mois ordinaire, cuivre sous 0,85 ; sous DOUZE MOIS d'histoire
la salle annonce qu'on lit l'histoire et NON une saison, et un mois jamais
observé se dit barre vide, jamais creux. ⑨ LE TAUX DE RÉALISATION
(`tauxDeRealisation`, shared/cadence) — aucune prédiction n'ayant jamais été
stockée, on REJOUE le juge : à chaque venue depuis la troisième, avec les
seules venues d'avant, contre la date réelle. Rendus : estimations éprouvées,
part juste à ±3/±7/±14 j, écart médian, et LE BIAIS (médiane signée) qui dit si
la Maison les attend trop tôt ou trop tard. Mesure la CADENCE MÉDIANE, pas les
reports de jour fermé ni le jour préféré — mélanger les deux ferait passer une
règle d'agenda pour une erreur de prévision. ⑩ L'EXPORT CSV de la file pour une
campagne de relance (`downloadCsv`, qui neutralise déjà les formules).

LE HARNAIS A TROUVÉ MIEUX QUE MOI : le backtest exigeait DEUX intervalles quand
le juge se prononce dès UN. Il écartait donc les estimations les plus fragiles —
celles qui se trompent le plus — et **le taux annoncé aurait été flatteur**.
Aligné sur le juge. `verifie-cadence` : 6 vérifications de plus (régularité
parfaite → 100 % à ±3 j et biais nul ; celle qui traîne → biais positif ; deux
venues → rien à éprouver).

## Celles qui ne viennent que le samedi — 16 août

« Il y a des clientes qui veulent venir uniquement le samedi. Les prédictions
doivent toujours aller sur le samedi suivant » (Yéman). `Client.jourPrefere`
(0 = dimanche … 6 = samedi) : il ne BLOQUE rien — le comptoir pose le
rendez-vous qu'il veut, elle réserve le créneau qu'elle veut sur Ma Couronne —
il commande LA PRÉDICTION. Prédire un mardi à qui ne vient que le samedi,
c'était relancer sur une date qu'elle allait refuser.

L'ORDRE DES RÈGLES COMPTE, et il est le seul possible : ① le cycle se rejoue
jusqu'à tomber devant nous, ② la date glisse sur SON jour — le premier qui SUIT
l'échéance, jamais celui d'avant — ③ puis sur un jour OUVERT. Le salon ne
s'ouvre pas parce qu'une cliente le préfère : un jour préféré fermé glisse donc
au premier jour ouvert, et la fiche le dit au moment de le choisir plutôt que
de mentir plus tard.

Sur la fiche 360 : « Elle ne vient que le… », les sept jours lus des RÉGLAGES
(le jour de fermeture est un choix de la Maison, et il a déjà bougé), ceux qui
sont fermés marqués comme tels. HARNAIS : 952 cadences d'une samedienne (pas de
7 à 40 jours × 28 départs) — TOUTES un samedi ; l'échéance du mercredi 19 août
donne bien le samedi 22, pas le 15 ; et sans préférence l'estimation ne bouge
pas d'un jour. PUBLIÉ @ `3103f7f`.

## La cadence regarde devant, et jamais un jour fermé — 16 août

Vu par Yéman sur Prisca : « prochain RDV estimé le **lundi 29 juin** » — un
16 août, et un lundi. Deux anomalies dans le même mot.

① L'ESTIMATION VIEILLISSAIT SUR PLACE. `predictNextVisit` ne posait la cadence
qu'UNE fois depuis la dernière venue : la cliente ne venant pas, la date restait
là, dans le passé, et la fiche continuait de la signaler. Le cycle SE REJOUE
désormais jusqu'à retomber devant nous — c'est la prochaine fois qu'on attend,
pas la fois manquée. **`overdueDays` continue de compter depuis la PREMIÈRE
échéance** : la proposition regarde devant, le retard regarde derrière, et la
fiche dit les deux (« En retard de N j » n'a rien perdu).

② ON NE PROPOSE PAS UN FAUTEUIL PORTE CLOSE. La date glisse au prochain jour
ouvert, sur les MÊMES réglages que le calendrier de réservation
(`openingForIso` — jours fermés ET journées exceptionnelles, pas une liste de
jours écrite en dur). `cadence.ts` importe `settings` : aucun cycle, settings
ne dépend de rien d'autre que `store`. Le juge étant partagé, la fiche du
Trône, son tableau de bord et l'accueil de Ma Couronne disent tous la même date.

HARNAIS NEUF **`verifie-cadence`** (le cinquième) : 672 cadences éprouvées —
pas de 7 à 30 jours × 28 départs — aucune un lundi ni un dimanche, aucune dans
le passé. Un vrai rendez-vous déjà pris passe toujours devant et s'affiche tel
quel, même un jour fermé : c'est un FAIT posé par la Maison, pas une
prédiction. Une vérification a corrigé mon attente et non le code (81 jours de
retard, pas 90).

NAVIGATION : **Le Carnet entre dans « Le quotidien »** (demande de Yéman). Il
vivait sous « Clients & agenda », replié, alors qu'on l'ouvre autant que le
Calendrier. Le mécanisme du menu à deux étages le retire tout seul de son
ancien groupe. PUBLIÉ @ `6d204c8`.

## Le comptage au tarif de la longueur — 16 août

« Programme l'atelier VÈKPÈ au comptage de locks avec 3 niveaux de prix par
longueur : court 1 100, mi-long 1 200, long 1 300 pour Jumbo à Mini ; Micro à
Galaxy 1 400, 1 500, 1 600. Create the modal. » (Yéman)

LE MODÈLE NE SAVAIT PAS LE FAIRE — une prestation ne portait qu'UN
`ratePerLock`. Nouveau champ **`tarifLockParLongueur`** : le même lock ne coûte
pas le même geste sur une couronne courte et sur une longue.

LE MOTEUR. Quand la grille porte la longueur du rendez-vous, elle PRIME sur le
tarif unique, et **`prixParLongueur` devient le PLANCHER** — décision de
Yéman : le comptage ne peut que MONTER le prix, jamais le baisser. Sans
comptage, ce même plancher s'annonce : une tête pas encore comptée garde un
prix connu. `regimeBrut` annonce ce régime AVANT la grille par longueur, sinon
la fiche disait « grille » pendant que la caisse calculait un comptage.

LA FICHE NE SE DÉTRUIT PLUS. Le modèle exclusif (13 août) effaçait
`prixParLongueur` dès qu'on choisissait « comptage » : le plancher aurait sauté
au premier enregistrement — même famille de piège que les forfaits la veille.
Le formulaire du Catalogue gagne les trois tarifs ET leurs planchers.

LA MODALE « Programmer au comptage », sur CHAQUE atelier : deux grilles, les
calibres qui suivent l'une ou l'autre (pré-réglés Jumbo–Mini / Micro–Galaxy aux
taux de Yéman, modifiables), et un APERÇU qui dit ce que chaque prestation
deviendra au bas et au haut de sa tranche AVANT d'écrire. Les forfaits en sont
exclus — ils valent leur composition. Yéman l'applique elle-même : le catalogue
est en écriture staff, la clé publique ne peut pas.

CE QUE LE PLANCHER FAIT VRAIMENT — vu au harnais, à savoir avant d'appliquer :
il mord souvent. 80 locks × 1 300 = 104 000 restent sous les 120 000 affichés
en long, donc le plancher gagne. Les tranches basses ne bougeront donc presque
pas, et les têtes denses paieront plus : Galaxy à 700 locks passe de 750 000 à
980 000 en court. HARNAIS verifie-prix : 7 vérifications de plus, tout passe —
dont une qui a corrigé MON attente et non le moteur. PUBLIÉ @ `3218250`.

## Le seuil de venues se voit enfin — et se règle — 16 août

« GBÈJÍ™ Fidélité n'est visible nulle part dans la sélection des services.
Why ? » LE JUGE FAISAIT SON TRAVAIL : la fiche porte `desVenue: 3`, la règle
voulue par la Maison — elle paraît à la 3ᵉ venue honorée, jamais avant.
Éprouvé sur les données réelles : invisible à 0 et 1 venue, proposable dès 2,
prix résolu 26 400 F, catégorie active, non masquée. Rien de cassé.

LE DÉFAUT EST AILLEURS, ET IL EST SÉRIEUX : ce champ ne s'affichait NULLE PART
et ne se réglait NULLE PART — `desVenue` n'apparaissait pas une seule fois dans
`Catalogue.tsx`. Il commandait pourtant TOUS les écrans de sélection (modale
RDV, Caisse, Ma Couronne). Une règle qui cache une prestation sans se montrer
se lit comme une panne : impossible de distinguer « retenue par un seuil » de
« disparue », et impossible de la lever.

DEUX RÉPARATIONS. ① LA FICHE le règle, rubrique « Qui peut la prendre », à côté
des calibres et de la réserve aux familles : « Paraît dès la Nᵉ venue », avec
la conséquence écrite en clair — y compris qu'une VENTE SANS FICHE ne la voit
jamais, faute de pouvoir compter les venues de personne. ② LA LIGNE du
Catalogue dit ce qui la retient (seuil, familles, calibres) : on voit d'un
regard pourquoi une prestation ne paraît pas.

LEÇON, la même que le libellé vieilli : **une règle qui retire quelque chose
doit le dire là où on la cherche.** PUBLIÉ @ `5044851`.

## La dépense s'inscrit comme un mouvement du Foyer — 16 août

« Quand on ouvre Ajouter une dépense, je veux que ce soit le même modèle que
Inscrire un mouvement dans Salon & Foyer » (Yéman). Le modèle qu'elle avait
apporté le 14 août, appliqué à la fenêtre des dépenses :

① LE MONTANT EST LE HÉROS — en grand, au centre, AVANT tout le reste. Les
champs alignés à la file (bénéficiaire, puis montant, puis date) faisaient
chercher lequel portait la somme. La devise affichée est celle de la CAISSE
choisie, et la somme des articles fait loi quand il y en a. ② LA QUESTION EN
MOTS — « À quoi va cet argent ? » ouvre les catégories, la sous-catégorie suit
dessous au lieu d'un second bloc titré. ③ LE DÉTAIL SE REPLIE — « + Détailler
cet achat (optionnel) », même bouton pointillé qu'au Salon & Foyer : un achat
simple n'a rien à détailler. ④ LA DATE FERME LA FENÊTRE — dernier réglage, pas
une question posée avant le montant. ⑤ Le titre prend son point, comme toutes
les fenêtres de la Maison.

LE MODÈLE EST DÉSORMAIS CELUI DE LA MAISON pour toute fenêtre qui inscrit une
somme : montant en héros, la question en mots, le détail replié, la date en
dernier. À reprendre tel quel ailleurs. PUBLIÉ @ `bb00b3a`.

## Une seule faveur à la fois — 16 août

« Quand un compte famille réserve un service qui a un déclencheur et qui est
offert, elle ne bénéficie pas de la remise supplémentaire du compte famille. Ça
ferait 2 remises et ça nous fera perdre beaucoup trop d'argent. Donc c'est
l'une ou l'autre, jamais les 2 à la fois. » (Yéman)

Le geste de la Maison — un shampoing offert parce qu'une Reprise accompagne le
rituel — EST déjà l'avantage. Y ajouter le pourcentage du compte famille, c'est
faire deux cadeaux pour une venue. **La remise famille s'efface donc devant le
geste, et sur TOUT le rituel** : c'est le sens de « l'une ou l'autre ». Même
esprit que la règle du 14 août, où elle ne porte jamais sur la part forfaits —
ce qui est déjà réduit ne se remise pas deux fois. Le geste est d'ailleurs le
plus généreux des deux : un shampoing à 10 000 F offert pèse plus que 15 % sur
une reprise.

UN SEUL JUGE — `unGesteDansLePanier` (shared/pricing) — pour que les deux
surfaces disent le même prix : le tunnel de Ma Couronne et la modale du rituel
au Trône. Côté Trône, la remise famille posée d'office se RETIRE d'elle-même
dès qu'un geste entre au rituel : la main n'a pas à y penser. CE QUI NE CHANGE
PAS : sans son déclencheur, le shampoing n'est pas offert et la remise famille
reprend tous ses droits. HARNAIS `verifie-prix` : 6 vérifications de plus, dont
les deux sens de la règle. PUBLIÉ @ `f5b6e37`.

## Une pièce payée compte exactement une fois — 16 août

« Le chiffre d'affaires de Kèmi n'est pas conforme aux factures. 4 documents à
35 000 F font 140 000 F » — sa fiche en affichait 105 000, et elle avait raison.

L'ARGENT TOMBAIT ENTRE DEUX CHAISES. `linkedIds` — l'ensemble des pièces
retranchées des « extras » pour éviter le double comptage — se construisait sur
TOUS ses rendez-vous. Une pièce PAYÉE dont le rituel n'est PAS compté (pas
encore honoré, ou payé par le compte famille) était donc retranchée des
extras… pendant que son rituel, lui, ne comptait pas non plus. La somme
disparaissait du total dépensé, du panier moyen et du compte de séances, sans
que rien ne le signale — et c'était vrai pour toutes les clientes dans ce cas.

L'INVARIANT POSÉ : **une pièce payée compte exactement une fois** — par son
rituel quand ce rituel est compté, par elle-même sinon. `linkedIds` ne se
construit donc plus que sur les rituels DÉJÀ dans `payesParElle`, versements
successifs compris. Les pièces « Règlement · … » restent écartées : ce sont des
versements partiels, jamais une dépense à part. LIMITE ASSUMÉE : un rituel non
compté réglé en DEUX pièces ne fait entrer que la première (la seconde porte le
préfixe « Règlement · ») — cas rare, à revoir s'il se présente. PUBLIÉ @
`631ac28`.

## Le geste de la Maison se lit sur la facture — 16 août

« Kèmi doit savoir que le shampoing est à 10 000 F et qu'elle a une remise de
100 %. Je ne veux pas simplement le montant 0 F. Je veux que ça suive
l'écriture qu'il y a sur le RDV » (Yéman). La pièce recevait le prix DÉJÀ
diminué du geste — donc « 0 F ». **Un cadeau qu'on ne voit pas n'est pas reçu**
: la cliente lisait un shampoing gratuit sans savoir qu'il valait 10 000 F.

LE PRIX PLEIN ET LE GESTE VOYAGENT SÉPARÉMENT. La modale du rituel les
séparait déjà pour son propre affichage ; elle les passe désormais tels quels à
la facture (`prixPlein` + `gesteDe`, 5ᵉ paramètre `gesteOf`), et la ligne porte
`unitXof` = 10 000 avec `discountPct` = 100. L'écran de la pièce savait déjà
l'écrire (« remise −100 % » et le prix barré) ; le PDF le dit maintenant aussi,
au lieu d'un 0 F sans raison.

LE TOTAL NE BOUGE PAS — `unitXof` × (1 − `discountPct`) vaut exactement ce que
la ligne valait. Et LE GESTE NE SE COMPTE PAS DEUX FOIS : `gross` est désormais
la somme des NETS, sinon la remise globale l'aurait repris une seconde fois.
HARNAIS : 4 vérifications de plus, dont celle-là précisément. Une a corrigé mon
fixture et non le code (une pièce posée à 35 000 quand le catalogue en dit
20 000 fait naître une ligne d'ajustement — c'est juste). PUBLIÉ @ `b4d4537`.

## Un libellé vieilli bloquait la facture, en silence — 16 août

« Pour Prisca la facture ne se met pas à jour, pourtant j'ai refait enregistrer
les modifications. » LA CAUSE, FINE ET SILENCIEUSE : le garde des pièces mixtes
reconnaissait une ligne de rituel à son NOM EXACT au catalogue. La pièce de
reprise MND-R-0184 porte « KƆKLƆ™ à Façon Lavage · **s**hampoing apporté »
quand le catalogue dit aujourd'hui « … · **S**hampoing apporté ». Une
majuscule. Le nom ne correspondant plus, la pièce était jugée
irreconstructible et cessait de suivre son rituel POUR TOUJOURS, sans que rien
ne le signale. Les 335 pièces de reprise (0018) portent toutes des libellés de
l'ANCIEN ERP : elles étaient toutes dans ce cas.

LA CHARGE DE LA PREUVE EST RENVERSÉE. Au lieu de reconnaître ce qu'on sait
reconstruire — fragile, un nom se corrige — on reconnaît ce qu'il faut
PRÉSERVER : les produits de la Gamme. Un flacon reste un flacon quel que soit
l'âge de la pièce ; une prestation renommée redevient réparable. La modale RDV
passe désormais la Gamme au juge. LE FILET RESTE : sans cette liste, l'ancienne
règle stricte s'applique — un appel nu ne peut pas faire disparaître un produit
qu'il ne connaît pas.

LEÇON, la troisième du jour sur le même motif : **une règle qui reconnaît par
le NOM casse en silence le jour où le nom change.** Préférer un identifiant,
ou renverser la question pour reconnaître ce qu'on protège. HARNAIS
`verifie-facturation` : 3 vérifications de plus, dont le cas de Prisca à
l'identique. PUBLIÉ @ `2336817`.

## Une pièce payée suit le rituel, même en une ligne — 16 août

« Quand je modifie une ligne d'un RDV, modifie la ligne en facturation même si
c'est déjà payé. Le montant total et le chiffre d'affaires ne bougent pas »
(Yéman). Le mécanisme le faisait DÉJÀ sur une pièce payée — mais un garde
l'écartait dans le cas le plus courant.

L'ENCAISSEMENT D'UN RITUEL À PLUSIEURS GESTES QUI N'A PAS PU SE DÉTAILLER
(acompte, avoir, règlement en deux fois — voir `detailed`, actions.tsx) pose
UNE ligne portant les noms COLLÉS : « KƆKLƆ™ Essentiel + SÍNSIN™ Essentielle ».
Ce libellé n'est le nom d'AUCUNE prestation du catalogue, donc le garde
`reconstructible` (12 août, qui protège les pièces mixtes) jugeait la pièce
irreconstructible : elle ne suivait jamais le rituel, quoi qu'on y change.

Or à ce point du code, une pièce d'UNE ligne ne peut plus être qu'un rituel :
le règlement partiel (« Règlement · … ») et le forfait sont sortis juste
au-dessus, et une pièce de produits seuls n'est pas LIÉE à un rendez-vous. Elle
se reconforme donc — au prix plein de chaque geste, l'écart en remise ou en
ligne d'ajustement.

LES DEUX INVARIANTS DEMANDÉS SONT TENUS ET ÉPROUVÉS : le total ne bouge pas
d'un franc, et le chiffre d'affaires non plus — il se lit sur le RITUEL
(`apptNetXof`), que ceci ne touche pas. HARNAIS NEUF **`verifie-facturation`**
(le sixième) : la pièce payée suit et son total tient (30 000 → 30 000) ;
l'écart inverse se dit en remise (10 000 → 10 000) ; un règlement partiel ne se
détaille toujours pas ; une pièce MIXTE reste entière — le flacon ne disparaît
pas du PDF. RAPPEL : l'alignement ne part QUE d'un enregistrement de la modale
RDV. PUBLIÉ @ `89ba2b4`.

## La facture pas encore payée suit le rituel — 16 août

« J'ai mis à jour le RDV de Habibath, pourquoi les lignes de la facture ne se
remettent pas à jour ? » Le mécanisme existait depuis le 11 août
(`alignerFacturesDuRituel`) mais DEUX verrous l'écartaient, chacun suffisant à
lui seul.

① `inv.status !== 'payée'` — on ne touchait QUE les pièces payées. Or une
facture ENVOYÉE est une RÉCLAMATION, pas une attestation : rien n'est entré,
donc rien à protéger, et une réclamation qui ne demande pas ce qui est dû est
simplement fausse. Elle se réécrit désormais ENTIÈREMENT, total compris,
exactement comme si on l'émettait aujourd'hui — mêmes lignes, même remise que
`factureAEnvoyer`. Les brouillons suivent aussi. LA RÈGLE D'OR NE BOUGE PAS :
sur une pièce PAYÉE, le total reste intouchable et seules les lignes se
reconforment (l'écart en remise nommée, ou en ligne d'ajustement).

② LE LIEN NE SE LISAIT QUE DANS UN SENS. On cherchait la pièce depuis le
RENDEZ-VOUS (`invoiceId`, `payments[].invoiceId`) ; or « Facture à envoyer »
(`factureAEnvoyer`) pose le lien sur LA PIÈCE (`apptId`) et n'écrit rien en
retour sur le rituel. Une facture née par ce chemin — le cas de Habibath — était
donc INVISIBLE à l'alignement. Elle se reconnaît maintenant des deux côtés.

Les gardes qui protègent restent en place : une pièce MIXTE (un produit, une
formation sur la même facture que le rituel) ne se réécrit jamais, un forfait
garde son nom plutôt que sa composition, et un règlement partiel ne se détaille
pas après coup. L'alignement ne part QUE d'un enregistrement de la modale RDV :
une pièce déjà périmée se rattrape en rouvrant le rituel et en réenregistrant.
PUBLIÉ @ `415629c`.

## L'échelle des Créations va jusqu'au bout — 16 août

MIGRATION **0053 PASSÉE**, contrôlée en base. L'échelle des Créations VÈKPÈ™
s'arrêtait au Nano (351–450 locks) : au-delà, une couronne Pico ou Galaxy
n'avait AUCUNE création à réserver — `estProposable` ne lui proposait rien et
le tunnel restait muet devant elle. Nouveau dernier degré, prix donnés par
Yéman : **VÈKPÈ™ Création Pico et Galaxy · La Couronne KPÒKPÒ™**
(`sv-atl-i-pic`, `ATL·I·PIC`, Souveraineté, 3 séances, 12–16 h) —
court 750 000 · mi-long 800 000 · long 850 000, repli sur le court comme toute
l'échelle. Catalogue : 83 → 84 prestations. Elle n'est PAS masquée : elle est
donc déjà visible à la Vitrine et à Ma Couronne.

UNE ÉTIQUETTE RÉPARÉE AU PASSAGE : « VÈKPÈ™ Création Nano » disait « 351 à 450
locks » dans sa description mais portait `bandIds: ['cal-galaxy']`. Une tête
NANO ne se voyait donc proposer AUCUNE création, et une GALAXY se voyait
proposer celle du Nano. Sans le correctif, la nouvelle fiche aggravait le
désordre (une Galaxy en aurait vu deux). CONTRÔLE PASSÉ : les **sept calibres
ont désormais une création, et une seule** — Jumbo · Medium · Mini · Micro ·
Nano · Pico · Galaxy.

RESTE À LA MAIN DE YÉMAN : ① durée et séances sont EXTRAPOLÉES de l'échelle
(Micro 2 jours, Nano 3 séances / 12 h) — à corriger au Catalogue si la Maison
compte autrement ; ② le sous-titre « La Couronne KPÒKPÒ™ » est porté par DEUX
fiches, et la description du Nano dit encore « le sommet de la création MND »,
ce qui n'est plus vrai.

## Une annulation qui n'arrive pas doit se dire — 16 août

« Un rituel annulé par Yéman sur son compte Ma Couronne le mercredi 19 août
n'est jamais revenu annulé sur le Trône. » Le Calendrier du Trône MASQUE les
rituels annulés (`status !== 'annulé'` partout) : le créneau serait donc parti
de l'écran. Il y était encore — l'annulation n'a jamais atteint le serveur.

DEUX SILENCES SE PRÊTAIENT MAIN-FORTE. ① `sync.ts` comptait une poussée
REFUSÉE PAR LES DROITS comme RÉUSSIE : le chemin `estRefusDeDroit` rendait
`true`, `planifiePoussee` avançait alors `lastPushed`, et la ligne refusée
sortait de TOUS les diffs suivants — le geste perdu sans un mot et sans retour
possible. Les trois chemins rendent désormais `false` : silence sur l'ALERTE
(une table hors de portée ne fait pas clignoter la pastille — un maître n'a pas
à voir rouge pour la paie), JAMAIS sur le fait ; le repère ne bouge pas, et si
les droits s'ouvrent (session rafraîchie) la poussée suivante emporte le geste.
② UN `update` QUE LA RLS ÉCARTE NE LÈVE AUCUNE ERREUR : il touche zéro ligne,
et zéro ligne ressemblait à un succès. D'où `ecrisRendezVous`
(`shared/agenda.ts`) : on écrit, PUIS on demande au serveur ce qu'il a fait —
`.select()` rend la ligne touchée, aucune ligne rendue = rien n'est arrivé.

TROIS CONSÉQUENCES À L'ÉCRAN. L'annulation ET le déplacement passent par ce
chemin vérifié (un rituel déplacé ici et resté à sa vieille heure au Trône,
c'est une cliente qui vient quand personne ne l'attend). Si rien n'est passé,
une BANDE CUIVRE le dit et RESTE — « le salon garde encore votre créneau », le
numéro de la maison, un bouton Réessayer : un toast vert qui ment est pire que
pas de toast. Et LA MAISON EST ENFIN PRÉVENUE — le seul push partait à la
cliente elle-même, personne au salon n'apprenait qu'un créneau se libérait.

RÈGLE À RETENIR : **un succès annoncé par le client ne prouve rien ; c'est le
serveur qui dit ce qui est écrit.** Même leçon que le `commit;` resté commenté
le matin même. PUBLIÉ @ `5f61cdb`. RESTE : le rituel du 19 août est toujours
vivant au Trône — l'annuler là-bas (Calendrier → le rituel → annuler).

## Le cycle d'un forfait : les dates posées d'avance — 16 août

« Pourquoi demander ce forfait ? Je veux passer au paiement directement. Le
paiement en 2 fois. La réservation automatique des dates selon les fréquences
prédéfinies. Le client ne fait que modifier ou confirmer. Ne jamais choisir les
dimanches ou lundi. » (Yéman). « DEMANDER CE FORFAIT » EST MORT : un forfait à
plusieurs séances ouvre son CYCLE (`Cycle.tsx`).

① LA CADENCE NE S'INVENTE PAS — elle est déjà au Catalogue. Chaque ligne porte
son `afterWeeks` (« dans combien de semaines après la visite d'ouverture ») ;
les lignes d'une MÊME semaine font UNE séance. Trimestriel : 5 séances
(semaines 0 · 4 · 6 · 8 · 12). YÈKPÈ™ × 3 : 7. Un produit de la Gamme ne fait
pas de séance — il se remet au comptoir.
② LES JOURS FERMÉS SE TIENNENT SEULS : `freeSlots` ne rend AUCUN créneau un
lundi ni un dimanche (heures du salon), ni sur un jour bloqué, ni au-delà du
plafond du jour. La proposition avance de jour en jour jusqu'à en trouver un —
elle ne PEUT pas poser un dimanche. Vérifié sur les cinq forfaits, moteur réel
et réglages réels : 38 dates proposées, aucune un lundi ou un dimanche, toutes
croissantes.
③ ELLE CONFIRME OU DÉPLACE, séance par séance (le jour, puis l'heure — des
pastilles et non un calendrier : un jour fermé n'y paraît pas).
④ RÈGLEMENT EN DEUX FOIS 50/50, la 2ᵉ tranche portée par la séance du MILIEU
(décision de Yéman) : elle sera au fauteuil ce jour-là, personne à relancer.
⑤ L'ARGENT EST DIT COMME IL EST. Aucun rail ne débite en ligne — ni clé
KkiaPay, ni MoMo Open API. L'écran ne fait donc PAS semblant : elle envoie par
Mobile Money et l'annonce, le comptoir vérifie. La doctrine tient : un écran de
paiement ne s'affiche que s'il débite vraiment.
⑥ LES N SÉANCES entrent au carnet LIÉES EN SÉRIE ; le forfait est porté par la
séance 1 (`Appointment.forfait`), les suivantes valent 0 par la règle des
séries — le cycle ne compte qu'UNE fois dans le chiffre.

LE JUGE DU CYCLE EST LA CADENCE, PAS `sessions` — les deux se contredisent au
catalogue : **« Forfait VÈKPÈ™ Initiation » annonce 1 séance quand sa cadence
en dessine 3** (passé au tunnel comme une visite unique, deux séances se
perdaient), et **l'Abonnement Annuel annonce 24 séances pour 19 semaines
distinctes**. Les cartes affichent désormais le compte RÉEL. À TRANCHER PAR
YÉMAN : corriger `sessions` sur ces deux fiches, ou compléter la cadence de
l'Annuel (5 lignes manquantes ?). PUBLIÉ @ `a29cd05`.

## Le tunnel sous-vendait les forfaits — 16 août, EN LIGNE

Signalé LATENT le 15, devenu RÉEL le 16 : Yéman a masqué 16 prestations et 15
catégories à la Vitrine, et le tunnel de réservation résolvait la composition
d'un forfait sur la carte ÉLAGUÉE — une prestation masquée sortait de la somme
EN SILENCE. Mesuré sur les données réelles, moteur réel :

| forfait | annoncé | réel |
| --- | --- | --- |
| Forfait VÈKPÈ™ Initiation | **17 600** | 176 000 |
| Forfait VÈKPÈ™ × GBÈJÍ™ | 64 600 | 247 350 |
| YÈKPÈ™ × 3 | 67 500 | 144 000 |
| Abonnement GBÈJÍ™ Annuel | 346 800 | 410 550 |
| Abonnement GBÈJÍ™ Trimestriel | 91 800 | 100 800 |

490 400 F d'écart sur une vente de chacun. `Booking` calcule désormais sur le
catalogue ENTIER (`tousServices`) — le prix d'un forfait ET `freeSlots`, dont
la durée se lit sur les rituels DÉJÀ pris, qui peuvent porter une prestation
masquée à cette cliente-là (la grille promettait des heures occupées).
`services` (élagué) reste ce qu'elle peut CHOISIR. `Compose` était corrigé la
veille ; `Tabs` et `MesRendezVous` lisaient déjà le catalogue entier. LA RÈGLE,
une troisième fois : **on affiche avec la carte élaguée, on JUGE sur l'arbre
entier.** Publié @ `24196e5`.

## La Reprise Frontale se replie sur Retouches Post Reprise — 16 août

MIGRATION **0052 PASSÉE** (par `0052b_reprise_frontale_execution.sql`). Trois
prestations disaient le même geste ; les deux « Reprise Frontale » portaient
l'histoire, « Retouches Post Reprise » porte le barème par calibre (Jumbo/Mini
4 000 · Medium 5 000 · Nano 12 000 · Micro/Pico 15 000). Tout s'est replié sur
la troisième : rendez-vous repointés, libellés des pièces réécrits, les deux
fiches supprimées (85 → 83 prestations), pierres tombales posées, masques
nettoyés (16 → 14). NE PAS RELANCER.

LES MONTANTS N'ONT PAS BOUGÉ — décision de Yéman. Le script FIGE d'abord le
prix des rituels qui n'en portaient pas : sans cela, un Élaborée à 15 000 F se
serait relu 4 000 F au catalogue (`apptTotalXof` retombe sur le catalogue quand
`priceXof` manque) et la Synthèse aurait perdu la différence. Les cinq pièces
concernées : MND-R-0029 · 0145 · 0184 à 15 000 F, MND-R-0269 · 0293 à 4 000 F —
53 000 F, tous payés. Tables de secours `repli_0052_*` : le seul retour en
arrière, à garder quelques jours.

LE PIÈGE DU JOUR, à ne jamais refaire : la première tentative a rendu
« Success. No rows returned » **sans rien écrire** — le `commit;` de fin était
resté commenté, Postgres a donc annulé la transaction à la fermeture. Un succès
annoncé ne prouve rien ; c'est la LECTURE de la base qui prouve. D'où
`0052b`, l'exécution PRÊTE À COLLER, sans une ligne à décommenter — le motif à
suivre pour les prochaines migrations.

RESTE : « Retouches Post Reprise » est MASQUÉE à la Vitrine (`hiddenServices`).
Toute l'histoire pointe désormais vers une prestation que les clientes ne
voient pas — rallumer son interrupteur (Vitrine client → la régie) si elle doit
se réserver.

## Les forfaits de la carte ont enfin leur vitrine — 16 août

« Le Ponctuel et l'Abonnement vendent les mêmes choses » (Yéman). C'était
vrai : deux fois le même mix & match, seuls le taux, le minimum et les ateliers
ouverts les séparaient. Et l'offre la plus travaillée de la Maison — ses HUIT
forfaits et abonnements composés au Catalogue — ne paraissait NULLE PART sur Ma
Couronne. TROIS ONGLETS désormais : les deux premiers restent le composeur (les
deux régimes sont GARDÉS — décision de Yéman, questionnée), le troisième est
neuf : LES FORFAITS DE LA CARTE, avec nom, prix, ce qu'ils réunissent, leurs
séances et leur parole.

LE GESTE SUIT LE FORFAIT (décision de Yéman) : **une seule séance se RÉSERVE**
— le composeur se ferme, le tunnel s'ouvre posé dessus (`onReserver` →
`openBooking({ serviceId })`, la garde `ferme('reserver')` tient toujours) —
**plusieurs séances se DEMANDENT**, parce qu'un cycle de 3 ou 12 mois ne se
programme pas en enfilade au téléphone. Aujourd'hui 4 / 4. Le pont
`mnd_couronne_compose` gagne le mode `forfait` (discountPct 0 : le prix est
celui de la carte, déjà remisé par sa composition) et le Tableau de bord le
nomme « Forfait de la carte » — la ligne « −0 % » ne s'écrit plus.

TROIS GARDES POSÉES AU PASSAGE. ① `estProposable` filtre la liste comme partout
(calibre, seuil de venues, réserve aux comptes famille — défaut fermé). ② LE
PRIX D'UN FORFAIT SE RÉSOUT SUR LE CATALOGUE ENTIER : `personalPriceXof` ne se
sert du catalogue que pour SOMMER la composition ; sur la carte élaguée, une
prestation masquée à cette cliente sortait de la somme EN SILENCE et le pack
s'annonçait moins cher que ce que la caisse encaissera. Même famille que « on
affiche avec la carte élaguée, on juge sur l'arbre entier ». ③ Un forfait ne se
compose plus DANS un forfait (on empilait deux remises sur la même prestation).
VÉRIFIÉ sur les données réelles, moteur réel : les huit forfaits sortent un
prix, aucun à zéro (27 200 · 176 000 · 37 000 · 38 500 · 410 550 · 100 800 ·
247 350 · 144 000). PUBLIÉ, build `20260816015402`, publié @ `9e1a680`.

RESTE, MÊME FAMILLE QUE ② : le tunnel `Booking` résout lui aussi la composition
d'un forfait sur la carte élaguée (`prixIci`, `priceLabel`). Latent tant
qu'aucun masque n'est posé (0 aujourd'hui) — à corriger avec sa propre
vérification.

## Porter une composition n'est pas être pricé par elle — 15 août

« Où est passé prix par longueur ? court, mi-long et long ? » (Yéman, sur
YÈKPÈ™ Couleur Sublimation). LE FORMULAIRE TENAIT POUR FORFAIT toute fiche
portant un `includes`, et lui fermait alors les cinq modèles de prix — grille
par longueur comprise. Or TROIS fiches portent un geste inclus (un soin
protéiné à deux semaines) SANS remise de forfait et avec leur prix propre :
`YÈKPÈ™ Couleur Sublimation` (25 000), `YÈKPÈ™ Couleur + Lumière` (37 000) et
`WÈWÈ™ + DÀNDÀN™` (38 500). Le MOTEUR ne s'y trompait pas — `forfaitPriceXof`
rend `undefined` faute de remise, et le prix retombe sur la grille par
longueur. Les deux dernières PORTAIENT DÉJÀ leurs trois longueurs
(37 000 / 55 000 / 64 500 · 38 500 / 46 000 / 51 500) : invisibles à l'écran,
et **effacées au premier enregistrement** — l'écriture n'écrit que le système
du modèle choisi, et aucun ne l'était. Une donnée vivante que la fiche
détruisait en silence.

CORRIGÉ À LA RACINE : `regimeBrut` (pricing.ts) ne dit « forfait » que si la
composition COMMANDE vraiment — MÊME CONDITION que le moteur : une remise
posée, ou un prix propre à zéro. Le juge et le moteur disent enfin la même
chose ; au passage la remise famille cesse d'exclure trois fiches qui ne sont
pas réduites. Côté Catalogue, `prixParComposition` remplace `estForfait` sur
les quatre gardes du prix : les fiches qui gardent leur prix retrouvent leurs
modèles, l'enregistrement n'efface plus leurs systèmes, et une bande cuivre
dit pourquoi (« pose une remise de forfait ou mets son prix à zéro pour
qu'elle vaille sa composition »). Harnais verifie-prix : 4 vérifications de
plus (un geste inclus sans remise → régime `longueur`, prix 55 000 en
mi-long ; une remise posée → `forfait` ; un prix à zéro → `forfait`), tout
passe. PUBLIÉ, build `20260815205008`, publié @ `8214948`, contrôlé en ligne.
RESTE À FAIRE PAR YÉMAN : saisir les trois longueurs de `YÈKPÈ™ Couleur
Sublimation`, qui n'en a encore aucune — la fiche les accepte désormais.

## Le nom mène à sa fiche · l'interrupteur d'une prestation se voit — 15 août

DEUX DEMANDES DE YÉMAN, le même jour. ① LE CALENDRIER : « quand je clique
Prisca L. sur l'horloge, ça doit ouvrir sa fiche pour que je remplisse le
numéro ». Le carnet dit qui vient ; quand le téléphone manque — la cloche du
rappel barrée le signale — il fallait quitter le Calendrier, ouvrir les
Clientes et la retrouver à la main. Toucher SON NOM ouvre sa fiche
(`/customers?id=`, la même porte que la recherche globale) ; toucher le reste
du bloc ouvre toujours le rituel. Filet pointillé sous le nom, EN CUIVRE quand
le téléphone manque, et l'infobulle le dit. Vue jour ET agenda du téléphone
(là, un `span role=button` : la ligne est déjà un bouton). CONSÉQUENCE
ASSUMÉE : on ne peut plus saisir le bloc PAR LE NOM pour le glisser — le reste
du bloc déplace toujours le rendez-vous.

② LA RÉGIE DE LA VITRINE : « masquer certaines prestations, comme les WÈWÈ™ à
Façon — je ne veux pas tout l'atelier ». LE GESTE EXISTAIT DÉJÀ (la carte
entière bascule, `hiddenServices` côté Maison / `vitrineMasques.services` côté
cliente) — il ne se VOYAIT pas : une pastille cochée se lit comme une
décoration, surtout quand l'atelier juste au-dessus porte, lui, un vrai
interrupteur. La carte porte donc le MÊME interrupteur, en plus petit
(`trc-toggle__switch`), avec son état en toutes lettres (Visible / Masquée),
et une bande en tête des sections dit les deux niveaux : l'atelier éteint tout
ce qu'il contient, la prestation ne coupe qu'elle. LEÇON : quand une demande
porte sur une fonction qui existe, c'est l'affordance qu'il faut réparer, pas
le moteur — chercher d'abord, coder ensuite. PUBLIÉ, build `20260815201117`,
publié @ `5974cb9`, contrôlé en ligne (bundles Calendrier et Vitrine servis).

## L'arbre élagué mentait — ordre, Juste Prix, abonnement — 15 août

« Sur Ma Couronne l'atelier YÈKPÈ doit venir en dernier » (Yéman) : l'écran
ouvrait sur la coloration, puis KLƆKLƆ · les soins · SÍNSIN · les coiffures.
CE N'ÉTAIT PAS UN ORDRE À CHANGER — c'était le bon ordre, cassé à
l'affichage. `useVisibleCatalog` ÉLAGUE la carte à la mesure de la cliente :
un atelier dont aucune prestation ne s'adresse à elle disparaît, mais ses
FAMILLES restent. L'arbre y est donc cassé — et le tunnel rangeait CETTE
liste-là (`catsDansLOrdre(cats)`, un second tri après celui de `bridges`) :
les familles orphelines de leur atelier (KLƆKLƆ™, LES SOINS, SÍNSIN™,
Styling — toutes filles de GBÈJÍ™, absent) tombaient dans le repli « arbre
cassé » qui ferme la marche, pendant que YÈKPÈ™, atelier resté entier,
remontait en tête. Reproduit à l'identique sur les vraies données avant de
toucher au code. DÉSORMAIS : l'ordre se prend sur l'ARBRE ENTIER
(`useCategories`), le filtre visible s'applique APRÈS (`offre`, donc rien
d'invisible ne fuit) — et `mondeDeCat` lit le même arbre, sinon une famille
sans sa racine tombe au « plateau technique » et l'intertitre ment aussi.
Ordre rendu : KLƆKLƆ · LES SOINS · SÍNSIN · Styling · YÈKPÈ — celui du
Catalogue, sans toucher à une seule donnée. Le changer un jour = les flèches
du Catalogue au Trône, comme avant.

MÊME RACINE, deux défauts plus graves trouvés en chemin et corrigés :
① LE JUSTE PRIX S'ÉTEIGNAIT. `coefJustePrix` n'applique le coefficient
personnel qu'à l'ATELIER, et il remonte à la racine pour le savoir : jugé sur
la carte élaguée, la racine manquante le faisait échouer fermé (×1) — pendant
que le comptoir, qui a l'arbre entier, l'appliquait. Ma Couronne annonçait un
autre prix que la caisse, exactement ce qu'elle ne doit jamais faire.
`pricingOf` reçoit l'arbre entier au tunnel ET au sur-mesure. ② L'ABONNEMENT
POUVAIT PARAÎTRE VIDE : `sousArbreOf` sur l'arbre cassé ne retrouvait plus
les familles d'un atelier d'abonnement (GBÈJÍ™ → SÍNSIN™, KLƆKLƆ™…).
RÈGLE À RETENIR : **on affiche avec la carte élaguée, on JUGE sur l'arbre
entier.** Tout juge qui remonte à une racine (monde, sous-arbre, Juste Prix)
doit recevoir `useCategories`, jamais `useVisibleCatalog().cats`. Vérifié :
les autres surfaces (Tabs, Vitrine, Catalogue, Caisse, JustePrix) passent
déjà l'arbre entier. PUBLIÉ le 15 août — trone + couronne, build
`20260815195506`, publié @ `96e660c`, `version.json` en ligne contrôlé.

## Le papier ne coupe plus le rituel — 15 août

Constaté par Yéman sur un vrai relevé : « 75 000 F » en face de
« KLOKLO™ Essentiel · Le Shampoing », le prix d'un rituel entier attribué à
son geste le moins cher. DEUX CAUSES. ① `pdf.ts` tranchait le libellé à
`label.slice(0, 60)` — SANS LE DIRE : les noms de la Maison font 45 signes,
le premier remplissait la ligne et les suivants disparaissaient. La colonne
PRESTATION se REPLIE désormais sur TROIS lignes (`splitTextToSize` sur 109 mm,
mesuré APRÈS translittération du fon puisque `doc.text` translittère au dernier
moment), la hauteur de rangée suit, et au-delà les points de suspension
AVOUENT la coupe. Vaut pour toutes les pièces — facture, devis, relevé, reçu.
② Le relevé (`Customers.releveDeCompte`) posait `apptLabel` (tous les noms
collés bout à bout, donc coupés) ; il pose maintenant `apptResume` (_shared) —
jusqu'à trois noms, puis « A + B + N autres » — précédé du COMPTE dès qu'il y
a plusieurs gestes : « Ven. 29 mai · 3 prestations · … ». La QUANTITÉ reste à
1 : la ligne compte des RITUELS, son prix unitaire est ce qu'il en reste à
payer. Mesures vérifiées au harnais jsPDF (1 à 5 prestations : aucune ligne
ne déborde, aucune n'est coupée). Les FACTURES, elles, émettaient déjà une
ligne par prestation (`factureAEnvoyer`) — elles n'étaient touchées que par le
défaut ①. RESTE : `invoicePdf` ne pagine toujours pas — un relevé de plus
d'une vingtaine de rituels déborderait sous le pied de page.

PUBLIÉ le 15 août — **trone et couronne**, build `20260815192655`, publié
@ `07a3e4f` (l'accordéon de Ma Couronne part dans le même envoi). Le motif du
« ça ne change rien » était là : `npm run build` ne remplit que `dist/` en
local, il NE PUBLIE PAS — la mise en ligne, c'est `build-sites.mjs` puis
`publie.mjs`. Vérifié en ligne, pas seulement lancé : `version.json` servi =
le build du jour, le bundle `pdf-*.js` servi porte trois `splitTextToSize` et
plus aucun `slice(0,60)`, le bundle `Customers-*.js` porte « prestations » et
« autres ». PIÈGE À CONNAÎTRE au moment de vérifier : le nom du fichier est
déterministe (`Releve-<AAAAMMJJ>-<4 derniers du compte>.pdf`) — un second
relevé du même jour pour la même cliente s'enregistre en « … (1).pdf » et
l'onglet resté ouvert continue d'afficher l'ancien.

## Le rituel en un écran : l'accordéon des ateliers — 15 août

Maquette validée par Yéman (`public/maquette-reservation.html`), écran 1
construit. CE QUI CASSAIT : choisir une prestation d'un AUTRE atelier coûtait
un retour en arrière — deux gestes par ajout, six allers-retours pour un
panier de trois prestations, c'est-à-dire un péage sur les paniers les plus
élevés. Désormais les deux écrans « Votre objectif » et « Les prestations »
n'en font qu'UN : ① UN ACCORDÉON À SECTION UNIQUE (`mc-acc`, `mc-presta`) —
les ateliers restent listés du haut en bas, celui qu'on ouvre déplie ses
prestations et REFERME le précédent (`catId` = l'atelier ouvert, `null` = tout
replié). Une seule section : deux plis ouverts font défiler le téléphone sur
trois hauteurs et l'on perd de vue ce qu'on a coché. ② LA LIGNE REFERMÉE PORTE
SON COMPTE — « 2 · 35 000 F », somme des prix DU PANIER (`prixIci`, geste
offert compris ; « en salon » quand tout y est à prix masqué) : rien ne se perd
en se repliant. ③ LE PANIER COLLANT (`mc-multibar`) tient le total, le compte
et la durée, et « Continuer » vit dedans ; vide, il passe au sable
(`mc-multibar--empty`) et dit le geste qui manque plutôt qu'un zéro. Les
intertitres de MONDE et la coupe à huit prestations (« Voir les N autres »,
`voirTout`, remis à zéro à chaque pli ouvert) survivent, dans le pli.
`mc-rowcard` et `mc-svccard` sont MORTS (CSS retiré).

ÉCRAN 2 CONSTRUIT DANS LA FOULÉE — LE RITUEL SE RELIT AVANT SON MOMENT :
le récapitulatif n'a plus d'écran à lui, il OUVRE celui du créneau
(`mc-recapcard--tete`) — prestations et prix, offre, remise famille, total,
« N prestations · durée · avec X », provenance des prix (locks + longueur),
« Maison · branche ». Puis « Le jour », « L'heure » (`mc-stepkicker`). ①
CHOISIR SON HEURE NE QUITTE PLUS L'ÉCRAN : le créneau retenu passe en indigo
(`mc-slotcard.is-sel`, « Votre heure ») et un SECOND TOUCHER CORRIGE la
dernière séance au lieu d'en empiler une de trop. ② LE PANIER COLLANT PORTE LE
GESTE : total, moment choisi, et « Réserver » (ou « Continuer · acompte »),
armé par `momentComplet`. ③ Les QUATRE TEMPS se lisent une fois le moment posé,
juste avant de sceller ; la note de série porte désormais « acompte sur la
1ʳᵉ ». Le parcours : VOTRE RITUEL · LE MOMENT · LA CONFIRMATION — `total` vaut
3 (+1 si le quiz s'ouvre, +1 si ces prestations demandent un acompte) et bouge
donc pendant qu'elle compose : un dénominateur qui suit la vérité vaut mieux
qu'annoncer trois écrans puis en imposer un quatrième. Les index 1, 2 et 4 sont
orphelins (les écrans gardent leurs numéros) ; retour depuis l'acompte = le
moment, séances intactes. `mc-multibar--info` est mort.

RESTE DE LA MAQUETTE, non construit : LA CARTE ÉDITION SOUVERAINE
(privatisation du salon) — la maquette la donne elle-même pour un placeholder :
son nom, ses conditions (jour, plage, nombre de têtes, acompte) et le registre
où la demande entre restent à trancher par Yéman.

## Le modèle des dépenses porté au foyer et aux caisses — 14 août

Demande de Yéman : « comment j'ajoute des motifs, catégories,
sous-catégories ? Rajouter détailler les dépenses et plusieurs dépenses
sur une même facture — sur les caisses indépendantes aussi. » Le salon
avait déjà tout (expenseCategoriesStore éditable + `Expense.items`,
Depenses.tsx) ; le foyer avait une liste FIGÉE dans le code
(MOTIFS_PRELEVEMENT). Désormais, shared/foyer.ts : `MotifFoyer`
{id,name,subs} + `motifsFoyerStore` (semence à 7 motifs avec
sous-motifs, `bindCollection('motifs_foyer')`), `PosteFoyer`
{id,label,amountXof} et `totalPostes`. `Prelevement` gagne `sousMotif` et
`items` ; `MouvementCaisseIndep` gagne `motif`, `sousMotif`, `items`.
Écran : la fenêtre « Inscrire un mouvement » tire ses motifs du registre
(pastilles), affiche les sous-motifs du motif choisi, et porte « +
Détailler ce retrait » — LA SOMME DES POSTES DEVIENT LE MONTANT (le grand
nombre du haut cesse alors de se saisir). Le formulaire des caisses
indépendantes reçoit le MÊME bloc (motif · sous-motif · postes), sur le
même registre de motifs. Gestionnaire « Gérer les motifs » (Modal) :
ajouter/renommer/retirer un motif et ses sous-motifs — renommer ne touche
pas aux lignes déjà écrites. RESTE À FAIRE : afficher le détail des
postes dans les registres (lecture), comme Depenses le fait déjà.

## Salon & Foyer : une question, pas six onglets — 14 août

Maquette validée par Yéman (artifact « Salon & Foyer — maquette »).
DIAGNOSTIC : la page était rangée par REGISTRES quand la main arrive avec
un GESTE — pour écrire « j'ai pris 45 000 F pour le marché » il fallait
deviner l'onglet, puis retrouver le bon des quatre formulaires jumeaux
(Date · X · Montant · INSCRIRE). ① QUATRE ONGLETS au lieu de six : Le
mois · Le journal (les trois registres du salon réunis) · Caisses
indépendantes (GARDÉ SÉPARÉ, décision de Yéman — monnaie et taux propres)
· La règle du Partage (atteinte aussi par un lien du Mois affichant déjà
25 · 17 · 58). ② LES TROIS ENVELOPPES VIVANTES sur Le mois : budget, part
prise, JAUGE et surtout « N F restent » — la seule question qu'on se pose
ici vivait au fond du 2ᵉ onglet ; « Mettre au coffre » vit sur
l'enveloppe. ③ « + INSCRIRE UN MOUVEMENT » (Modal, `GESTES`) : cinq
réponses dans les mots de la maison (foyer / mise de côté / emprunt /
remboursement / caisse à part), la réponse choisit le registre écrit
(prelevements, verserDansEnveloppe, prets) et n'ouvre que les champs
utiles ; la caisse à part renvoie à son onglet. LA CONSÉQUENCE S'ANNONCE
AVANT : « après ce retrait il restera N F » — et un DÉPASSEMENT s'inscrit
TEL QUEL, sans devenir un prêt (décision de Yéman) : la bande le dit en
cuivre, elle ne bloque pas.

## La modale du rendez-vous remise en ordre — 14 août

Maquette validée par Yéman (artifact « Le rituel, de la prise à
l'encaissement »), écran 1 construit. L'écran le plus utilisé de la maison
était une coulée de onze champs, total tout en bas, quatre boutons de même
poids dont deux destructeurs. Désormais : ① BANDEAU VIVANT `position:
sticky` en tête (tête, calibre+locks, date/heure/maître, statut, et LE
TOTAL NET remise déduite — décision de Yéman : la somme qu'elle paiera,
pas le prix catalogue) ; ② QUATRE PALIERS numérotés (`PalierRdv`) — La
tête · Le rituel (n prestations · durée) · Le moment · Le prix (« son
prix · N locks ») ; ③ LES MAINS SE REPLIENT par prestation
(`mainsOuvertes`) : ligne « Exécuté par X, au fauteuil » + « Plusieurs
mains ? », pli OUVERT d'office si des mains sont déjà désignées ; ④ LA
NOTE se replie (`noteOuverte`, ouverte si l'appt en porte une) derrière
« + Une note au carnet » ; ⑤ LE PIED : Enregistrer (cuivre) + Encaisser
gardent leur place ; annuler et supprimer passent EN PETIT sous eux, avec
leurs confirmations. À la CRÉATION, les DEUX boutons restent (Confirmer /
En attente — décision de Yéman). ÉCRAN 2 CONSTRUIT dans la foulée
(PayAppointmentModal, actions.tsx) : bandeau sticky « Encaisser · Nom »
avec le RESTE À ENCAISSER en 30 px ; trois paliers (`PalierEnc`) — ①
Ce qu'elle doit (total, forfait, acompte, versements, « Total dû » qui
ferme le palier) · ② Comment elle règle : DEUX TIROIRS encadrés (Sur son
avoir / Comptant, maintenant), boutons renommés « Tout » et « Le reste »,
MOYEN + CAISSE RANGÉS DANS LE TIROIR DU COMPTANT et masqués si rien
n'entre, puis LA LIGNE QUI ADDITIONNE (« 3 500 F sur l'avoir + 5 000 F
comptant — tout est réglé » / « il resterait N F dû ») — c'est elle qui
manquait ; les deux dates repliées suivent · ③ Et ensuite (facultatif) :
pourboire, devise, reprogrammation.

## Comptes & Avoirs revisitée : deux registres — 14 août

Maquette validée par Yéman, construite le jour même. La page mêlait deux
sujets : seize cartes annonçaient « 0 F » pour qu'une seule porte un
solde, et la REMISE — la vraie raison d'ouvrir un compte — n'était nulle
part. Désormais DEUX REGISTRES en onglets (`registre` : 'foyers' |
'avoirs'), titre et action de PageHead contextuels (+ Compte famille /
+ Verser un avoir). ① LES FOYERS : carte = nom + REMISE EN PASTILLE
(cliquable → `RemiseSurCarte` : barème/10/15/18/20 + champ libre à
BLUR-COMMIT, écrit à la frappe dans familiesStore, sans ouvrir le foyer —
demande de Yéman), payeuse ★, membres avec leur ÂGE, et ce qui manque en
cuivre (adresse absente de la payeuse, naissances manquantes). Pied :
« Ouvrir le foyer », « Impayés » EN ACCÈS DIRECT (demande de Yéman),
pastille « Avoir · N F » seulement si > 0, et « ⋯ » pour les gestes rares
(verser, mouvements). Bandeau en tête : N foyers sans adresse de payeuse.
② LES AVOIRS : une seule liste — familles créditées ET clientes seules
mêlées (un porteur, un solde), dernier mouvement, total nommé « crédit
prépayé que la maison doit encore ». Les trois KPI décoratifs sont
retirés. Maquette : artifact claude.ai (Comptes & Avoirs — maquette).

## La remise famille : barème du foyer, hors forfaits, prix famille — 14 août

DÉCISION YÉMAN. ① BARÈME AUTO (`remiseFamillePct(f, clients, aujourdhui)`
— signature ÉLARGIE, tous les appels passent clients+today) : taux posé =
personnalisé (0 = coupée) ; compte MUET = barème du foyer — 1 enfant
mineur rattaché → 10 %, 2 et plus → 15 %, aucun → 0. L'éditeur de compte
(Comptes) a la chip « Barème du foyer · −X% » (remisePct absent) à côté
des taux personnalisés — il n'écrit PLUS toujours un taux. ② HORS
FORFAITS : la remise famille ne porte jamais sur la part forfaits (déjà
réduits). Modale RDV (_shared) : l'identité `discountPct === famPct`
reste l'affichage ; le net applique le % à `effGross − forfaitPartXof`
(regimeTarifaire k==='forfait'), et l'ENREGISTREMENT FIGE la remise EN
FRANCS (`discountXof`, discountPct effacé, remiseFamille=true) — facture
et encaissement retranchent le montant exact sans reconnaître les
forfaits. Une remise MANUELLE porte sur tout (geste de la main). ③ MA
COURONNE : tunnel — ligne « Remise famille · −X % (hors forfaits) ·
−N F » au récap, net et « reste au salon » remisés, et le RDV créé porte
discountXof+remiseFamille (le Trône encaisse ce que l'écran a promis) ;
Profil — « Compte famille · remise −X % (hors forfaits) » sous l'identité.
④ RÉSERVÉE AUX FAMILLES : `Service.reserveFamilles` + `estProposable(sv,
p, venues, aFamille=false)` — défaut FERMÉ, un pack ne fuit jamais par
oubli d'écran ; appels mis à jour (tunnel, accueil, modale RDV avec la
famille de la tête). Catalogue : bouton « Réservée aux comptes famille »
dans le formulaire. LE PACK FAMILLE se crée AU CATALOGUE par Yéman :
forfait composé (Shampoing + Reprise essentielle), prix à sa main,
coche familles. Harnais 43/43.

## Chaque sœur sa session — 14 août

Même origine = même tiroir de session Supabase : connecté au Trône,
l'admin ne pouvait plus OUVRIR Ma Couronne dans le même navigateur —
l'écran « Ce compte tient le Trône » revenait à chaque reconnexion au
Trône, sans fin (constaté par Yéman, desktop ET téléphone). FIX :
`VITE_AUTH_SCOPE=couronne` (build-sites) → `storageKey: sb-mnd-couronne`
dans shared/supabase.ts — Ma Couronne a son propre tiroir, l'admin au
Trône et une cliente sur Ma Couronne cohabitent dans le même navigateur.
En dev (pas de scope), tout reste partagé. CONSÉQUENCE UNIQUE : les
sessions Ma Couronne existantes vivent dans l'ancien tiroir → chaque
cliente déjà connectée devra SE RECONNECTER UNE FOIS. Au passage, la
liste « Mes enfants » du Profil s'ouvre par le NOM (ligne calme, chevron,
le geste « Changer sa date de naissance » vit dedans).

## La naissance d'un enfant se corrige depuis Ma Couronne — 14 août

MIGRATION 0050_corriger_naissance.sql (COLLÉE, contrôlée ✓) : RPC
`corriger_naissance_enfant(p_enfant, p_naissance)` security definer — la
RLS interdit à une cliente d'écrire la fiche d'un enfant, le serveur
vérifie (est_ma_tete : un mineur qu'elle porte ; pas sa propre fiche ;
date ni future ni majorisante — « passez au salon pour ce changement »).
Client : `corrigerNaissance` (shared/enfants.ts — validations locales,
RPC, miroir clientsStore) ; geste dans Profil › Mes enfants (Tabs.tsx,
MesEnfants) : « Corriger sa date de naissance » sous chaque tête → champ
date + Enregistrer/Annuler, toast. L'âge se recalcule partout (sélecteur,
pastilles) via le miroir.

## La fusion de fiches, un geste du comptoir — 14 août

« Je peux faire la soudure moi-même » (Yéman). Le moteur :
`shared/fusion.ts` — `survivantDe` (la fiche au COMPTE survit toujours, un
compte ne déménage pas ; sans compte des deux côtés, la fiche ouverte ;
deux comptes → refus motivé) et `fusionnerFiches` (même mécanique que les
soudures SQL éprouvées : absorbée = SOCLE, champs remplis du survivant
par-dessus, nom d'attente « Cliente Ma Couronne » écarté, points
ADDITIONNÉS, segments unis, since/crownSince = plus ancien, dePassage
seulement si les deux ; l'histoire suit — appointments (+offertPar),
invoices, bilans, client_sessions, enfants_declares (clientId ET
clientCreeId), families.payerClientId, credit_movements holder client —
puis la coquille s'efface). Le geste : fiche 360 → « Fusionner avec une
autre fiche… » (au-dessus de Retirer de la Maison) → FusionModal
(ClientPicker, qui survit et pourquoi, compte des RDV qui suivent,
window.confirm, rouvre la fiche gardée). L'outil web « Les adresses du
carnet » (artifact claude.ai + supabase/local_export_adresses.sql,
gitignoré) reste la PRÉVENTION : adresse posée avant la 1ʳᵉ connexion =
adoption automatique, zéro fusion à faire.

## La passe éditoriale de Ma Couronne — 14 août

Règle de Yéman : « élimine tous les textes inutiles, simplifie
l'accueil ». Chaque phrase doit porter un GESTE ou une INFORMATION — ce
qui ne fait que décorer sort. Retirés/raccourcis : la citation de la
maison (une carte entière à chaque ouverture), « Votre couronne mérite sa
prochaine séance… » → « La maison vous attend. », « Mes rendez-vous ·
voir, déplacer, annuler » → « Mes rendez-vous », « Composez votre rituel
sur-mesure » → « Rituel sur-mesure », la ligne d'explication du bilan
(la prestation seule suffit), et les trois slides d'entrée à UNE ligne
chacune. Cercle/Profil/Suivi inchangés — leurs phrases portent des
chiffres et des seuils.

## Une seule porte fédérée : Google — 14 août

Décision Yéman : les portes Apple et WhatsApp SORTENT de Ma Couronne
(compte développeur Apple à l'année, Twilio pour WhatsApp — les
branchements ne valaient pas leur poids). Restent : e-mail + mot de passe
(la porte de la maison) et « Continuer avec Google ». Retirés :
`signInWithApple`/`startWhatsAppOtp` (auth.ts), modes
whatsapp/whatsapp-code + marques SVG (Onboarding). Le branchement Google
côté tableau de bord Supabase reste À FAIRE par Yéman : Google Cloud
Console (client OAuth) → Supabase Auth → Providers → Google (Client ID +
Secret) ; Redirect URLs déjà notées (l'origine GitHub Pages + /couronne/).

## Le motif « deux familles, une payeuse » vu une 2ᵉ fois (Ruth) — 14 août

Même dessin que Valerie, autre chemin : la cliente rattache un enfant sur
Ma Couronne (famille A naît, RPC), PUIS la maison monte le foyer au Trône
(Finances › Comptes — famille B avec les enfants, payeuse identique) : la
fiche pointe A, le vrai foyer est B, et l'enfant commun existe EN DOUBLE
(le rattachement du Trône ne passe pas par la garde anti-doublon de la
RPC). Soudure par IDs : supabase/local_ruth_soudure.sql (gitignoré) — la
famille du Trône est gardée, la Jade doublée effacée (vécu re-pointé), la
fiche-carnet sans e-mail (MND-…) FUSIONNÉE dans la fiche du compte (carnet
= socle, champs non vides du compte par-dessus, nom du carnet gardé).
GARDE POSÉE (14 août, plus tard le même jour) : `ClientPicker` —
le formulaire « Cliente de passage » vérifie désormais le carnet AVANT de
créer (même nom aplati sans accents, ou même téléphone à 8+ chiffres) et
PROPOSE la fiche existante (« Prendre sa fiche ») ; « Créer quand même ·
homonyme » reste offert, les yeux ouverts. L'avertissement s'efface à la
frappe. Un seul point de garde protège TOUS les chemins de création
rapide : compte famille (Comptes), RDV, caisse.

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

Premier vrai test d'inscription (Valerie A., yemanboya2@) : la fiche et
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
- **Ma Couronne** : sélecteur « Pour : Moi · Éli » dans le tunnel (visible
  seulement si la Maison a validé des mineurs sur le compte) — le RDV se pose
  au nom de l'enfant, le personnel est notifié « Éli · par Awa ». « Mes
  rendez-vous » liste le FOYER entier (« — pour Éli » sur les rituels des
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
- Observations à garder : des FAMILLES entières y sont (trois têtes d'une même
  famille le même jour, trois d'une autre, deux d'une troisième) — chaque tête n'est venue qu'une fois,
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
