# Reprendre — état de la Maison

État au 10 août 2026 (soir). À lire en premier dans une nouvelle session.
Déployé et vérifié : Le Trône et Ma Couronne servent `f8982cd` — bilans, Caisse maquette, tunnel, la refonte
validée est COMPLÈTE (①②③④), plus les factures unifiées et la fenêtre
d'avant-hydratation. Portail et LOKAA n'ont pas été republiés (rien de
fonctionnel pour eux). TOUTES les migrations jusqu'à 0034 sont PASSÉES, ainsi
que l'import local des formules maîtres. Ne relancer aucune migration.

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
- **« Ce qui presse »** remplace la tuile « Alertes stock » : réassort lu sur
  les FICHES (stock dérivé + seuil par fiche, repli ancien compteur si la
  Gamme n'est pas reprise) avec « Préparer le bon », et une ligne « N impayés
  échus » qui descend à la section qui les encaisse.
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
- **`supabase/repare_branches_orphelines.sql` — PASSÉ le 10 août au soir**
  (contrôle : 0 client orphelin, 0 déclaration orpheline). Relançable sans
  danger si le doute revient. Hypothèse assumée : UNE branche réelle — à ne
  plus utiliser tel quel si multi-branches un jour.

Rappel d'écran : la file des enfants déclarés vit sur CLIENTES (bouton
« Enfants déclarés », visible quand il y en a en attente) — c'est là que Keli
apparaîtra après la réparation.

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

### RESTE À FAIRE

- **Rien n'a été reclassé rétroactivement.** Les 178 fiches existantes sont
  intactes ; aucune ne devient « de passage » toute seule, et c'est le bon
  choix — la marque se pose au comptoir, au moment où on la reçoit. Si Yéman
  veut relire les fiches à une seule venue, ce sera une LISTE À TRANCHER, comme
  pour la diaspora, jamais une écriture en masse.
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
