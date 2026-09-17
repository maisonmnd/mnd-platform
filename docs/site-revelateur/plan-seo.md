# Plan SEO du site révélateur · Maison MND

Maison boutique de soin et de création de dreadlocks afro, Cotonou, Bénin.

Le site est servi par GitHub Pages sous un sous-chemin de l'origine de la Maison. Les adresses sont écrites en relatif ; l'origine n'apparaît nulle part dans le contenu. Chaque page de contenu est un vrai fichier HTML produit à la construction, une adresse chacune. Les parties vivantes (triage, formulaire, réservation) sont des îlots React posés dans ces pages, jamais des pages à elles seules.

Ce document fixe, pour chacune des quinze adresses, la question à laquelle elle répond, ses balises, sa structure, ses expressions de recherche, ses liens, son appel à l'action et son balisage structuré. Il pose ensuite le maillage, le Journal, le local, la mesure, les pièges et la liste de contrôle.

## Sommaire

1. Repères communs à toutes les pages
2. Les quinze adresses, une section chacune : `/`, `/mon-parcours`, `/premiere-couronne`, `/reparation-locks`, `/entretien-locks`, `/soins-locks`, `/mnd-kids`, `/abonnements`, `/maison-mnd`, `/brice-et-yeman`, `/formations`, `/journal`, `/faq`, `/contact`, `/reserver`
3. Le maillage
4. Le Journal
5. Le local
6. La mesure
7. Les pièges à éviter sur GitHub Pages et dans une application React
8. Liste de contrôle avant la mise en ligne

## Repères communs à toutes les pages

**La voix.** Française, élégante, simple. Pas de jargon, pas de superlatif, pas de promesse de résultat. Un titre dit ce que la page contient ; une description dit ce que la lectrice peut y faire.

**Les noms.** La Maison s'écrit « Maison MND », le sigle s'écrit MND. Les gestes portent leur nom en fon, écrit exactement ainsi et jamais translittéré : VÈKPÈ™ (la création), SÍNSIN™ (la reprise des racines, le resserrage), FÍNFÍN™ (la restauration), YÈKPÈ™ (la couleur végétale), GBÀTÀ™ (le défaisage), DÀNDÀN™ (l'hydratation), KLƆKLƆ™ (le lavage rituel). Dans une balise titre ou une description, le nom en fon vient toujours après le mot français que les gens cherchent, jamais à sa place.

**Les balises.**
- `<html lang="fr">` sur chaque page.
- Une balise titre par page, 60 caractères au plus, motif « Sujet · Maison MND », Cotonou quand c'est naturel.
- Une meta description par page, 155 caractères au plus, ouverte par un verbe d'action.
- Un seul H1 par page. Le plan des H2 est présent dans le HTML dès le chargement, sans attendre le moindre script.
- Une balise canonique par page, composée à la construction à partir d'une seule variable d'origine fournie par l'environnement de déploiement, jamais écrite dans le contenu. La forme canonique est celle avec la barre finale (`/premiere-couronne/`), voir la section des pièges.
- Les balises Open Graph (`og:title`, `og:description`, `og:image`, `og:type`, `og:locale` = `fr_FR`) reprennent le titre et la description ; l'image est composée à la construction, jamais écrite en absolu dans le contenu.

**Le balisage structuré.** Un seul bloc `<script type="application/ld+json">` par page, contenant un `@graph`. Le champ `@context` reçoit le contexte standard du vocabulaire Schema, posé par le constructeur ; c'est la seule valeur absolue tolérée, et elle ne concerne pas la Maison. Trois nœuds reviennent partout, identifiés par un `@id` stable composé à la construction :
- `#maison` : le nœud HairSalon (sous-type de LocalBusiness) décrit une fois sur la page d'accueil et référencé ailleurs par son `@id` seul.
- `#site` : le nœud WebSite (`name` « Maison MND », `inLanguage` « fr », `publisher` vers `#maison`).
- `#breadcrumb` : la BreadcrumbList de la page. Position 1 : « Accueil », `/`. Position 2 : le nom court de la page, son adresse canonique. Le Journal ajoute une position 3 (l'article).

Le nœud `#maison`, tel qu'il doit être rempli :

| Champ | Valeur |
|---|---|
| `@type` | `HairSalon` |
| `name` | Maison MND |
| `description` | Maison boutique de soin et de création de dreadlocks afro à Cotonou |
| `url` | l'adresse canonique de l'accueil, composée à la construction |
| `image`, `logo` | le fichier du logo, composé à la construction |
| `address.addressLocality` | Cotonou |
| `address.addressCountry` | BJ |
| `address.streetAddress`, `address.postalCode` | à renseigner par la Maison |
| `telephone` | à renseigner par la Maison, au format international, identique à la fiche Google |
| `openingHoursSpecification` | à renseigner par la Maison |
| `areaServed` | Cotonou, Bénin |
| `founder` | deux nœuds Person, Brice et Yéman, `jobTitle` à renseigner par la Maison |
| `sameAs` | les profils publics (fiche Google, réseaux), à renseigner par la Maison |
| `knowsLanguage` | fr |
| `priceRange` | ne pas renseigner |
| `aggregateRating`, `review` | ne pas renseigner tant que des avis réels ne sont pas affichés sur la page |

Règle : un champ dont la Maison n'a pas donné la valeur est retiré du bloc, jamais laissé vide ni rempli d'une valeur d'attente.

**Les appels à l'action.** Sept formules, et pas d'autres : « Réserver ma consultation », « Diagnostiquer ma couronne », « Réserver mon entretien », « Organiser notre visite », « Découvrir la formation », « Découvrir les abonnements », « Trouver mon parcours ». Chaque page porte une formule principale, posée deux fois : sous le H1 et à la fin de la page. Un lien secondaire vers `/mon-parcours` (ancre « Trouver mon parcours ») ferme chaque page, sauf `/mon-parcours` elle-même.

**Le tableau des quinze pages.**

| Adresse | Répond à | Appel à l'action |
|---|---|---|
| `/` | Qui prend soin des dreadlocks à Cotonou, et par où commencer ? | Trouver mon parcours |
| `/mon-parcours` | Quel parcours convient à mes cheveux ou à mes locks ? | Trouver mon parcours |
| `/premiere-couronne` | Comment créer mes premières locks, et avec quel calibre ? | Réserver ma consultation |
| `/reparation-locks` | Mes locks abîmées peuvent-elles être réparées ? | Diagnostiquer ma couronne |
| `/entretien-locks` | Où faire reprendre mes racines, et à quel rythme ? | Réserver mon entretien |
| `/soins-locks` | Comment laver, hydrater et soigner mes locks ? | Réserver mon entretien |
| `/mnd-kids` | Peut-on faire et entretenir des locks à mon enfant ? | Organiser notre visite |
| `/abonnements` | Comment entretenir mes locks régulièrement sans y repenser ? | Réserver mon entretien |
| `/maison-mnd` | Qu'est-ce que la Maison MND, et comment travaille-t-elle ? | Trouver mon parcours |
| `/brice-et-yeman` | Qui sont les personnes qui portent la Maison ? | Réserver ma consultation |
| `/formations` | Comment apprendre le métier des locks au Bénin ? | Découvrir la formation |
| `/journal` | Où lire des conseils simples sur les dreadlocks ? | Trouver mon parcours |
| `/faq` | Quelles sont les réponses aux questions que tout le monde pose ? | Trouver mon parcours |
| `/contact` | Comment joindre la Maison et préparer ma visite ? | Réserver ma consultation |
| `/reserver` | Comment prendre rendez-vous, et pour quoi ? | Réserver ma consultation |

## / · L'accueil

**La question réelle.** Qui prend soin des dreadlocks afro à Cotonou, et par où commencer selon l'état de ma couronne ?

- **Balise titre** : `Dreadlocks à Cotonou, soin et création · Maison MND`
- **Meta description** : `Découvrez la Maison MND à Cotonou : création, réparation, entretien et soins des dreadlocks afro. Trouvez le parcours qui convient à votre couronne.`
- **H1** : Le soin et la création des dreadlocks afro, à Cotonou

**Plan des H2.**
1. Une maison pour votre couronne (ce qu'est la Maison, en trois phrases, avec « Cotonou » et « dreadlocks afro » dans le texte)
2. Trouver mon parcours (les cinq portes : première couronne, réparation, entretien, soins, enfants ; une carte chacune, un lien chacune)
3. Les gestes de la Maison (une ligne par geste : VÈKPÈ™, SÍNSIN™, FÍNFÍN™, YÈKPÈ™, GBÀTÀ™, DÀNDÀN™, KLƆKLƆ™, chacune reliée à sa page de service)
4. Les petites têtes couronnées : MND Kids
5. Entre deux visites : les abonnements
6. Apprendre le métier : l'Académie
7. Le Journal : les derniers conseils (trois articles, titres réels)

**Expressions de recherche.**
- Principales : dreadlocks Cotonou · locks Cotonou · salon dreadlocks Bénin
- Secondaires : locticienne Cotonou · salon de locks Cotonou · dreadlocks femme Cotonou · dreadlocks afro Bénin · coiffure locks Cotonou

**Liens internes à poser.**
- `/mon-parcours`, ancre « Trouver mon parcours » (sous le H1 et en fin de page)
- `/premiere-couronne`, ancre « Créer ma première couronne »
- `/reparation-locks`, ancre « Réparer mes locks abîmées »
- `/entretien-locks`, ancre « Entretenir mes locks »
- `/soins-locks`, ancre « Soigner mes locks »
- `/mnd-kids`, ancre « MND Kids, pour les enfants »
- `/abonnements`, ancre « Découvrir les abonnements »
- `/formations`, ancre « Découvrir la formation »
- `/maison-mnd`, ancre « La Maison MND »
- `/journal`, ancre « Lire le Journal »
- Pied de page : `/faq`, `/contact`, `/reserver`, `/brice-et-yeman`

**Appel à l'action** : « Trouver mon parcours »

**Balisage structuré.**
- `#maison` décrit en entier (le tableau des repères communs). C'est la seule page qui porte la description complète.
- `#site` : WebSite.
- WebPage `#page` : `name` = le titre, `description` = la description, `isPartOf` → `#site`, `about` → `#maison`, `inLanguage` fr.
- `#breadcrumb` : une seule position, « Accueil ».

## /mon-parcours · Trouver mon parcours

**La question réelle.** Je ne sais pas par où commencer : quel parcours convient à mes cheveux libres ou à mes locks, dans l'état où elles sont ?

- **Balise titre** : `Trouver mon parcours locks · Maison MND Cotonou`
- **Meta description** : `Répondez à quelques questions et trouvez le parcours qui convient à vos cheveux ou à vos locks : création, réparation, entretien, soins ou enfants.`
- **H1** : Trouver mon parcours

**Plan des H2.** L'îlot de triage est posé sous le H1. Les H2 sont du contenu statique, présent au chargement, qui reprend en clair chaque sortie possible du triage ; ainsi un moteur lit ce que l'îlot propose, et une visiteuse sans script trouve quand même sa porte.
1. Cinq parcours, une seule question : où en est votre couronne ?
2. Je n'ai pas encore de locks (vers la première couronne)
3. Mes locks sont abîmées, collées ou cassantes (vers la réparation)
4. Mes locks vont bien et les racines ont poussé (vers l'entretien)
5. Mes locks ont besoin d'un lavage, d'une hydratation ou d'une couleur (vers les soins)
6. C'est pour mon enfant (vers MND Kids)
7. Ce qui se passe après le triage (la page de service, puis la consultation ou la réservation)

**Expressions de recherche.**
- Principales : quel type de locks choisir · commencer des locks · dreadlocks cheveux crépus
- Secondaires : diagnostic dreadlocks · conseil dreadlocks Cotonou · quelles locks pour moi · locks ou dreadlocks différence · je veux des locks

**Liens internes à poser.**
- `/premiere-couronne`, ancre « Créer ma première couronne »
- `/reparation-locks`, ancre « Diagnostiquer ma couronne »
- `/entretien-locks`, ancre « Réserver mon entretien »
- `/soins-locks`, ancre « Les soins des locks »
- `/mnd-kids`, ancre « Organiser notre visite »
- `/reserver`, ancre « Réserver ma consultation » (à la sortie du triage)
- `/faq`, ancre « Les questions fréquentes »
- Le résultat du triage, rendu par l'îlot, est un lien HTML ordinaire vers la page de service, avec la même ancre que ci-dessus.

**Appel à l'action** : « Trouver mon parcours » (le bouton qui lance le triage dans l'îlot ; la formule est la même que l'ancre qui mène ici depuis toutes les autres pages)

**Balisage structuré.**
- WebPage `#page`, `isPartOf` → `#site`, `about` → `#maison`.
- ItemList `#parcours` : cinq ListItem, chacun `name` (le parcours) et `url` (la page de service). C'est la liste statique des cinq portes, pas le résultat du triage.
- `#breadcrumb` : Accueil › Mon parcours.
- Pas de FAQPage ici : les questions du triage sont un outil, pas une foire aux questions.

## /premiere-couronne · La première couronne

**La question réelle.** Comment créer mes premières dreadlocks, avec quel calibre, et comment se passent la consultation puis les premières semaines ?

- **Balise titre** : `Création de dreadlocks à Cotonou · Maison MND`
- **Meta description** : `Créez vos premières dreadlocks à Cotonou avec la Maison MND : consultation, choix du calibre, création VÈKPÈ™ lock par lock, suivi des premières semaines.`
- **H1** : La première couronne : créer ses dreadlocks à Cotonou

**Plan des H2.**
1. Avant de créer : la consultation (lire la tête, la texture, le cuir chevelu ; le Lock Test)
2. Choisir son calibre, du Jumbo au Nano (ce que change le nombre de locks au quotidien)
3. La création VÈKPÈ™, lock par lock (le déroulé d'une séance, sans durée ni prix)
4. Cheveux libres, twists ou fausses locks : d'où l'on part
5. Les premières semaines : retouches, première reprise, gestes à la maison
6. Locks fines et micro-locks : les précautions
7. Réserver ma consultation

**Expressions de recherche.**
- Principales : création dreadlocks · première locks · faire des locks Cotonou
- Secondaires : dreadlocks femme · commencer des locks · microlocks Cotonou · locks fines · dreadlocks cheveux crépus 4C

**Liens internes à poser.**
- `/reserver`, ancre « Réserver ma consultation »
- `/entretien-locks`, ancre « L'entretien après la création » (dans le H2 des premières semaines)
- `/soins-locks`, ancre « Laver et hydrater ses locks »
- `/mnd-kids`, ancre « La première couronne d'un enfant »
- `/journal/commencer-ses-dreadlocks`, ancre « Commencer ses dreadlocks : par où débuter »
- `/journal/quelle-methode-premieres-locks`, ancre « Quelle méthode pour ses premières locks »
- `/journal/locks-fines-precautions`, ancre « Locks fines : les précautions »
- `/faq`, ancre « Les questions sur la première couronne »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Réserver ma consultation »

**Balisage structuré.**
- Service `#service` : `name` « Création de dreadlocks VÈKPÈ™ », `serviceType` « Création de dreadlocks », `description` (deux phrases, sans promesse), `provider` → `#maison`, `areaServed` Cotonou, `url` la canonique. Pas de champ `offers` : aucun prix n'est publié.
- WebPage `#page`, `mainEntity` → `#service`.
- `#breadcrumb` : Accueil › Première couronne.

## /reparation-locks · La réparation

**La question réelle.** Mes locks sont abîmées, collées, cassantes ou trop lourdes : peuvent-elles être réparées, et par quoi commence-t-on ?

- **Balise titre** : `Réparation de dreadlocks à Cotonou · Maison MND`
- **Meta description** : `Réparez vos locks abîmées, collées ou cassantes à Cotonou : bilan écrit, restauration FÍNFÍN™, plan de soin. Commencez par un diagnostic de la Maison MND.`
- **H1** : Réparer des locks abîmées : la restauration FÍNFÍN™

**Plan des H2.**
1. Reconnaître des locks en souffrance (collées, cassantes, ouvertes, après une chimie, après une longue absence)
2. Le diagnostic avant tout devis : un bilan écrit et un pronostic
3. La restauration FÍNFÍN™ : fermer, reconstruire, en plusieurs séances
4. Locks trop lourdes ou trop nombreuses : alléger, ou défaire au GBÀTÀ™
5. Le plan de soin après la restauration
6. Diagnostiquer ma couronne

**Expressions de recherche.**
- Principales : réparation dreadlocks · locks abîmées · réparer ses locks
- Secondaires : locks qui cassent · locks collées · restauration locks Cotonou · défaire ses dreadlocks · locks trop lourdes

**Liens internes à poser.**
- `/reserver`, ancre « Diagnostiquer ma couronne »
- `/entretien-locks`, ancre « L'entretien après une restauration »
- `/soins-locks`, ancre « L'hydratation DÀNDÀN™ »
- `/journal/reparer-des-locks-abimees`, ancre « Réparer des locks abîmées : ce qui est possible »
- `/journal/locks-trop-lourdes`, ancre « Locks trop lourdes : alléger ou défaire »
- `/faq`, ancre « Les questions sur la réparation »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Diagnostiquer ma couronne »

**Balisage structuré.**
- Service `#service` : `name` « Restauration de dreadlocks FÍNFÍN™ », `serviceType` « Réparation de dreadlocks », `provider` → `#maison`, `areaServed` Cotonou, `url`. Pas de `offers`.
- Un second Service `#service-defaisage` : `name` « Défaisage de dreadlocks GBÀTÀ™ », `serviceType` « Défaisage de dreadlocks », `provider` → `#maison`.
- WebPage `#page`, `mainEntity` → `#service`.
- `#breadcrumb` : Accueil › Réparation des locks.

## /entretien-locks · L'entretien

**La question réelle.** Où faire reprendre mes racines à Cotonou, comment se passe un resserrage, et à quel rythme revenir ?

- **Balise titre** : `Entretien de dreadlocks à Cotonou · Maison MND`
- **Meta description** : `Entretenez vos dreadlocks à Cotonou : reprise des racines SÍNSIN™, resserrage de précision, contours nets. Réservez votre entretien à la Maison MND.`
- **H1** : L'entretien des locks : la reprise des racines SÍNSIN™

**Plan des H2.**
1. Pourquoi la racine demande une reprise régulière
2. SÍNSIN™, le resserrage de précision (crochet ou torsion selon la texture, la tension juste)
3. Tempes, nuque et lisière : la reprise des contours
4. Quelle cadence entre deux reprises : 4, 6, 8 ou 10 semaines
5. Locks créées ailleurs : la Maison les accueille, après un diagnostic
6. Réserver mon entretien

**Expressions de recherche.**
- Principales : entretien dreadlocks · reprise racines locks · resserrage locks Cotonou
- Secondaires : entretien locks Cotonou · retouche dreadlocks · racines dreadlocks · resserrer ses locks · entretien dreadlocks combien de temps

**Liens internes à poser.**
- `/reserver`, ancre « Réserver mon entretien »
- `/abonnements`, ancre « Découvrir les abonnements » (dans le H2 de la cadence)
- `/soins-locks`, ancre « Le lavage et l'hydratation »
- `/reparation-locks`, ancre « Quand l'entretien ne suffit plus : la réparation »
- `/journal/entretenir-ses-racines`, ancre « Entretenir ses racines »
- `/journal/locks-creees-ailleurs`, ancre « Locks créées ailleurs : comment la Maison les reçoit »
- `/faq`, ancre « Les questions sur l'entretien »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Réserver mon entretien »

**Balisage structuré.**
- Service `#service` : `name` « Entretien de dreadlocks SÍNSIN™ », `serviceType` « Entretien de dreadlocks », `provider` → `#maison`, `areaServed` Cotonou, `url`. Pas de `offers`.
- WebPage `#page`, `mainEntity` → `#service`.
- `#breadcrumb` : Accueil › Entretien des locks.

## /soins-locks · Les soins

**La question réelle.** Comment laver, hydrater et soigner mes locks sans les abîmer, au salon et à la maison ?

- **Balise titre** : `Soins des dreadlocks, lavage et hydratation · Maison MND`
- **Meta description** : `Prenez soin de vos locks à Cotonou : lavage rituel KLƆKLƆ™, hydratation DÀNDÀN™, couleur végétale YÈKPÈ™. Les gestes de soin de la Maison MND.`
- **H1** : Les soins des locks : laver, hydrater, colorer

**Plan des H2.**
1. Les quatre temps d'un rituel : purifier, nourrir, sceller, couronner
2. KLƆKLƆ™, le lavage rituel (et le séchage qui ne feutre pas)
3. DÀNDÀN™, l'hydratation aux huiles
4. YÈKPÈ™, la couleur végétale, réservée aux locks saines (henné, indigo, plantes ; le test sur mèche)
5. Le styling de sortie
6. Prendre soin à la maison, entre deux visites
7. Réserver mon entretien

**Expressions de recherche.**
- Principales : soins dreadlocks · lavage locks · hydrater ses locks
- Secondaires : shampoing dreadlocks · huile pour locks · locks sèches · démangeaisons cuir chevelu locks · couleur végétale locks

**Liens internes à poser.**
- `/reserver`, ancre « Réserver mon entretien »
- `/entretien-locks`, ancre « La reprise des racines »
- `/abonnements`, ancre « Découvrir les abonnements »
- `/reparation-locks`, ancre « Locks en souffrance : la restauration »
- `/journal/laver-ses-dreadlocks`, ancre « Laver ses dreadlocks »
- `/journal/hydrater-ses-locks`, ancre « Hydrater ses locks »
- `/faq`, ancre « Les questions sur les soins »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Réserver mon entretien »

**Balisage structuré.**
- Trois Service : `#service-lavage` (« Lavage de dreadlocks KLƆKLƆ™ », `serviceType` « Lavage de dreadlocks »), `#service-hydratation` (« Hydratation des dreadlocks DÀNDÀN™ », `serviceType` « Soin des dreadlocks »), `#service-couleur` (« Couleur végétale YÈKPÈ™ », `serviceType` « Coloration végétale des dreadlocks »). Chacun `provider` → `#maison`, `areaServed` Cotonou. Pas de `offers`.
- WebPage `#page`, `mainEntity` = les trois Service.
- `#breadcrumb` : Accueil › Soins des locks.

## /mnd-kids · Les petites têtes couronnées

**La question réelle.** Peut-on faire et entretenir des locks à mon enfant, dans quelles conditions, et comment se passe la visite ?

- **Balise titre** : `Dreadlocks pour enfants à Cotonou · MND Kids`
- **Meta description** : `Confiez la couronne de votre enfant à la Maison MND à Cotonou : création, reprise et soins pour les petites têtes. Organisez votre visite en famille.`
- **H1** : MND Kids : les dreadlocks des enfants, à Cotonou

**Plan des H2.**
1. Des prestations pensées pour une tête d'enfant (moins de locks, moins de matière, moins de fauteuil)
2. Quand commencer, et comment cela se passe (le contenu vient de la Maison ; aucun âge n'est écrit tant qu'elle ne l'a pas donné)
3. La première couronne d'un enfant : VÈKPÈ™ Kids
4. La reprise et les soins : SÍNSIN™ Kids, le lavage, l'hydratation
5. Ce que les parents demandent souvent
6. Organiser notre visite

**Expressions de recherche.**
- Principales : dreadlocks enfant · locks enfant Cotonou · coiffure locks enfant
- Secondaires : à quel âge commencer des locks · entretien locks enfant · locks fille · locks garçon · dreadlocks enfant Bénin

**Liens internes à poser.**
- `/reserver`, ancre « Organiser notre visite »
- `/premiere-couronne`, ancre « La première couronne, chez les grandes »
- `/soins-locks`, ancre « Le lavage et l'hydratation »
- `/journal/dreadlocks-enfants`, ancre « Dreadlocks et enfants : ce qu'il faut savoir »
- `/faq`, ancre « Les questions des parents »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Organiser notre visite »

**Balisage structuré.**
- Service `#service` : `name` « MND Kids, soin et création de dreadlocks pour enfants », `serviceType` « Dreadlocks pour enfants », `audience` (PeopleAudience, `audienceType` « enfants », sans tranche d'âge tant que la Maison ne l'a pas donnée), `provider` → `#maison`, `areaServed` Cotonou. Pas de `offers`.
- WebPage `#page`, `mainEntity` → `#service`.
- `#breadcrumb` : Accueil › MND Kids.

## /abonnements · Les abonnements

**La question réelle.** Comment entretenir mes locks à un rythme régulier, sans y repenser à chaque fois ?

- **Balise titre** : `Abonnements d'entretien des locks · Maison MND`
- **Meta description** : `Choisissez une cadence d'entretien pour vos locks avec la Maison MND à Cotonou : reprise des racines et soins à intervalles réguliers, sans y repenser.`
- **H1** : Les abonnements : une cadence pour votre couronne

**Plan des H2.**
1. Une cadence plutôt qu'un rendez-vous à la fois
2. Ce que comprend un abonnement (les gestes inclus, tels que la Maison les définit ; aucun prix)
3. Choisir sa cadence : 4, 6, 8 ou 10 semaines
4. Comment cela se passe au fil des mois (le rappel, la venue, la fiche qui suit la couronne)
5. Questions sur les abonnements
6. Réserver mon entretien

**Expressions de recherche.**
- Principales : abonnement entretien locks · entretien dreadlocks régulier · forfait entretien locks Cotonou
- Secondaires : entretien locks tous les mois · combien de fois entretenir ses locks · programme entretien dreadlocks · salon locks abonnement Bénin

**Liens internes à poser.**
- `/reserver`, ancre « Réserver mon entretien »
- `/entretien-locks`, ancre « La reprise des racines SÍNSIN™ »
- `/soins-locks`, ancre « Les soins compris entre deux reprises »
- `/faq`, ancre « Les questions sur les abonnements »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Réserver mon entretien » (la formule « Découvrir les abonnements » est l'ancre qui mène ici depuis les autres pages)

**Balisage structuré.**
- Service `#service` : `name` « Abonnement d'entretien des dreadlocks », `serviceType` « Entretien de dreadlocks par abonnement », `provider` → `#maison`, `areaServed` Cotonou. Pas de `offers`, pas de durée chiffrée.
- WebPage `#page`, `mainEntity` → `#service`.
- `#breadcrumb` : Accueil › Abonnements.

## /maison-mnd · La Maison

**La question réelle.** Qu'est-ce que la Maison MND, comment travaille-t-elle, et pourquoi lui confier ma couronne ?

- **Balise titre** : `La Maison MND, salon de locks à Cotonou`
- **Meta description** : `Découvrez la Maison MND, maison boutique de soin et de création de dreadlocks afro à Cotonou : ses gestes, sa méthode, son atelier et son Académie.`
- **H1** : La Maison MND, à Cotonou

**Plan des H2.**
1. Une maison boutique à Cotonou
2. Nos gestes, nommés en fon (les sept gestes, une phrase chacun)
3. La méthode : lire la tête, poser le rituel, suivre la couronne
4. L'atelier et l'accueil (le lieu, sans adresse ni horaires tant que la Maison ne les a pas donnés)
5. Brice et Yéman
6. L'Académie : transmettre le métier
7. Trouver mon parcours

**Expressions de recherche.**
- Principales : Maison MND · MND Cotonou · salon de locks Cotonou
- Secondaires : locticienne Bénin · institut dreadlocks Cotonou · MND dreadlocks · salon afro Cotonou · maison de soin dreadlocks

**Liens internes à poser.**
- `/brice-et-yeman`, ancre « Brice et Yéman »
- `/formations`, ancre « Découvrir la formation »
- `/mon-parcours`, ancre « Trouver mon parcours »
- `/premiere-couronne`, `/reparation-locks`, `/entretien-locks`, `/soins-locks`, ancres au nom du geste (« la création VÈKPÈ™ », « la restauration FÍNFÍN™ », « la reprise SÍNSIN™ », « le lavage KLƆKLƆ™ »)
- `/contact`, ancre « Nous écrire »
- `/journal`, ancre « Lire le Journal »

**Appel à l'action** : « Trouver mon parcours »

**Balisage structuré.**
- AboutPage `#page` (sous-type de WebPage), `mainEntity` → `#maison`.
- Le nœud `#maison` est référencé par son `@id` ; sa description complète reste sur l'accueil.
- `#breadcrumb` : Accueil › La Maison MND.

## /brice-et-yeman · Les fondateurs

**La question réelle.** Qui sont les personnes qui portent la Maison, et quel regard ont-elles sur le cheveu afro ?

- **Balise titre** : `Brice et Yéman, fondateurs de la Maison MND`
- **Meta description** : `Rencontrez Brice et Yéman, les fondateurs de la Maison MND à Cotonou : leur parcours, leur méthode et leur regard sur le soin des dreadlocks afro.`
- **H1** : Brice et Yéman

**Plan des H2.**
1. Deux personnes, une maison
2. Brice (le texte vient de la Maison)
3. Yéman (le texte vient de la Maison)
4. Ce que nous croyons du cheveu afro
5. Transmettre : l'Académie
6. Réserver ma consultation

**Expressions de recherche.**
- Principales : Brice et Yéman · fondateurs Maison MND · locticien Cotonou
- Secondaires : maître loctician Bénin · Yéman MND · Brice MND · locticienne Cotonou méthode

**Liens internes à poser.**
- `/maison-mnd`, ancre « La Maison MND »
- `/formations`, ancre « Découvrir la formation »
- `/premiere-couronne`, ancre « Réserver ma consultation » (via `/reserver`)
- `/journal`, ancre « Lire le Journal »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Réserver ma consultation »

**Balisage structuré.**
- Deux Person, `#brice` et `#yeman` : `name`, `jobTitle` (à renseigner par la Maison), `worksFor` → `#maison`, `image` (le portrait, composé à la construction), `sameAs` (profils publics, à renseigner par la Maison, ou retirés).
- ProfilePage `#page`, `mainEntity` = les deux Person.
- Le nœud `#maison` référencé par `@id`, avec `founder` → `#brice`, `#yeman`.
- `#breadcrumb` : Accueil › Brice et Yéman.

## /formations · L'Académie

**La question réelle.** Comment apprendre le métier des locks au Bénin, que l'on débute ou que l'on soit déjà coiffeuse, et comment se déroule une formation ?

- **Balise titre** : `Formation dreadlocks au Bénin · Maison MND`
- **Meta description** : `Apprenez le métier de locticienne au Bénin à l'Académie de la Maison MND : parcours pour débutantes et professionnelles, gestes de la Maison, certificat.`
- **H1** : Les formations : apprendre les gestes de la Maison

**Plan des H2.**
1. Apprendre les gestes de la Maison (à qui s'adresse l'Académie, en deux publics)
2. Pour les débutantes : entrer dans le métier (Fondation, Affirmation, L'Œuvre)
3. Pour les professionnelles : exercer selon la méthode MND (les parcours courts, en jours consécutifs)
4. Comment se déroule une formation (séances, têtes réelles, modules évalués, jury)
5. Le certificat de la Maison
6. Candidater : l'entretien d'admission
7. Découvrir la formation

**Expressions de recherche.**
- Principales : formation dreadlocks Bénin · apprendre dreadlocks · créer salon dreadlocks
- Secondaires : formation locticienne Cotonou · devenir locticienne · formation locks Cotonou · certificat dreadlocks · formation coiffure locks Afrique

**Liens internes à poser.**
- Chaque parcours a sa carte, dont le lien porte l'ancre « Découvrir la formation » ; la carte mène à la demande d'admission (îlot formulaire) ou à une fiche détaillée si la Maison en publie.
- `/contact`, ancre « Poser une question sur l'Académie »
- `/maison-mnd`, ancre « La Maison MND »
- `/brice-et-yeman`, ancre « Brice et Yéman »
- `/soins-locks`, `/entretien-locks`, `/premiere-couronne`, ancres au nom du geste enseigné
- `/journal`, ancre « Lire le Journal »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Découvrir la formation »

**Balisage structuré.**
- Un Course par parcours publié, `#course-<id>` : `name` (le titre du parcours), `description` (l'accroche), `provider` → `#maison` (`@type` complété par EducationalOrganization pour ce contexte), `educationalLevel` (« débutante » ou « professionnelle »), `teaches` (les compétences, en une phrase), `hasCourseInstance` avec `courseMode` « sur place », `location` Cotonou, `courseWorkload` et `startDate` à renseigner par la Maison ou retirés. Pas de `offers`.
- ItemList `#formations` : la liste des Course, dans l'ordre de la page.
- WebPage `#page`, `mainEntity` → `#formations`.
- `#breadcrumb` : Accueil › Formations.

## /journal · Le Journal

**La question réelle.** Où lire des conseils simples et fiables sur les dreadlocks, écrits par des gens qui les font ?

- **Balise titre** : `Le Journal des locks · Maison MND`
- **Meta description** : `Lisez les conseils de la Maison MND pour commencer, entretenir, laver, hydrater et réparer vos dreadlocks. Des réponses simples, écrites depuis Cotonou.`
- **H1** : Le Journal

**Plan des H2.**
1. Commencer ses locks (les articles fondateurs 1, 2, 9)
2. Entretenir et soigner (les articles 5, 6, 7, 8)
3. Réparer (les articles 3, 4)
4. Les enfants (l'article 10)
5. Les derniers articles (liste chronologique, titre, date, résumé de deux lignes)

**Expressions de recherche.**
- Principales : conseils dreadlocks · blog dreadlocks · tout savoir sur les locks
- Secondaires : entretien dreadlocks conseils · dreadlocks débutant · questions dreadlocks · vivre avec des locks · locks cheveux afro conseils

**Liens internes à poser.**
- Chaque article, ancre = son titre exact.
- `/premiere-couronne`, `/reparation-locks`, `/entretien-locks`, `/soins-locks`, `/mnd-kids` : une ligne « Le parcours qui va avec » sous chaque rubrique, ancre au nom du parcours.
- `/faq`, ancre « Les questions fréquentes »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Trouver mon parcours »

**Balisage structuré.**
- CollectionPage `#page`, `mainEntity` → ItemList `#articles` (un ListItem par article, `url` et `name`).
- Blog `#journal` : `name` « Le Journal de la Maison MND », `publisher` → `#maison`, `blogPost` = la liste des BlogPosting (les articles y sont référencés par `@id`, décrits en entier sur leur propre page).
- `#breadcrumb` : Accueil › Journal.

## /faq · Les questions fréquentes

**La question réelle.** Quelles sont les réponses courtes aux questions que tout le monde pose sur les dreadlocks, avant de venir ?

- **Balise titre** : `Questions fréquentes sur les dreadlocks · Maison MND`
- **Meta description** : `Trouvez les réponses aux questions posées à la Maison MND : commencer des locks, les laver, les entretenir, les réparer, les enfants, les rendez-vous.`
- **H1** : Les questions que l'on nous pose

**Plan des H2.** Chaque H2 est une rubrique ; chaque question est un H3 suivi d'une réponse de trois à six lignes, présente dans le HTML (pas d'accordéon fermé par script au chargement ; si un accordéon est voulu, il s'ouvre par CSS et le texte reste dans la page).
1. Commencer des dreadlocks (peut-on commencer avec des cheveux courts, combien de locks, la différence entre les calibres, faut-il une consultation)
2. Entretenir et laver ses locks (à quelle fréquence, peut-on laver ses locks, que faire des racines)
3. Réparer des locks abîmées (des locks collées sont-elles perdues, peut-on défaire des locks, pourquoi un bilan avant un devis)
4. Les enfants (à partir de quand, qui décide, comment se passe la visite ; les réponses viennent de la Maison)
5. Les rendez-vous et la Maison (comment réserver, que préparer, locks créées ailleurs, la diaspora et la consultation à distance)
6. Les formations (à qui s'adressent-elles, faut-il un diplôme, comment candidater)

**Expressions de recherche.**
- Principales : questions dreadlocks · dreadlocks questions fréquentes · combien de temps durent les locks
- Secondaires : les locks abîment-elles les cheveux · peut-on laver ses locks · combien de temps pour faire des locks · peut-on défaire des dreadlocks · locks et cheveux crépus

**Liens internes à poser.**
- Chaque réponse se termine par un lien vers la page de service qui la porte : `/premiere-couronne`, `/reparation-locks`, `/entretien-locks`, `/soins-locks`, `/mnd-kids`, `/abonnements`, `/formations`, ancres au nom du parcours ou du geste.
- `/reserver`, ancre « Réserver ma consultation » (rubrique des rendez-vous)
- `/contact`, ancre « Nous écrire »
- `/journal`, ancre « Lire le Journal » (quand un article développe la réponse, lien direct vers l'article)
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)

**Appel à l'action** : « Trouver mon parcours »

**Balisage structuré.**
- FAQPage `#page`, `mainEntity` = une Question par H3 (`name` = la question telle qu'affichée, `acceptedAnswer` = Answer dont `text` reprend la réponse telle qu'affichée, sans ajout). Seules les questions visibles sur la page entrent dans le bloc ; jamais une question sans sa réponse dans le HTML.
- `#breadcrumb` : Accueil › Questions fréquentes.

## /contact · Le contact

**La question réelle.** Comment joindre la Maison, où se trouve-t-elle, quand venir, et que préparer avant une première visite ?

- **Balise titre** : `Contacter la Maison MND à Cotonou`
- **Meta description** : `Écrivez à la Maison MND à Cotonou par WhatsApp ou par le formulaire, et préparez votre visite : où nous trouver, quand venir, comment réserver.`
- **H1** : Nous écrire, nous trouver

**Plan des H2.**
1. Nous écrire (le lien WhatsApp, avec un message pré-rempli qui nomme le parcours ; l'îlot formulaire)
2. Où nous trouver (adresse et plan : à renseigner par la Maison ; le plan est une image statique ou un lien, jamais une carte embarquée lourde)
3. Quand venir (horaires : à renseigner par la Maison)
4. Avant votre première visite (ce qu'il est utile d'apporter ou de savoir, selon la Maison)
5. Réserver ma consultation

**Expressions de recherche.**
- Principales : Maison MND contact · salon locks Cotonou WhatsApp · dreadlocks Cotonou rendez-vous
- Secondaires : MND Cotonou adresse · salon dreadlocks Cotonou téléphone · où faire des locks à Cotonou · prendre rendez-vous locks Cotonou

**Liens internes à poser.**
- `/reserver`, ancre « Réserver ma consultation »
- `/faq`, ancre « Les questions fréquentes »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page)
- `/formations`, ancre « Poser une question sur l'Académie » (le formulaire porte un choix « Académie »)

**Appel à l'action** : « Réserver ma consultation »

**Balisage structuré.**
- ContactPage `#page`, `mainEntity` → `#maison`.
- Le nœud `#maison` référencé par `@id` ; c'est ici que la page HTML affiche, en clair et à l'identique de la fiche Google, le nom, l'adresse et le téléphone une fois renseignés par la Maison. Le bloc JSON-LD ne doit rien contenir que la page n'affiche pas.
- `#breadcrumb` : Accueil › Contact.

## /reserver · La réservation

**La question réelle.** Comment prendre rendez-vous, pour une consultation ou un entretien, et comment cela se passe ensuite ?

- **Balise titre** : `Réserver une consultation ou un entretien · Maison MND`
- **Meta description** : `Réservez votre consultation ou votre entretien à la Maison MND à Cotonou : choisissez votre parcours et votre créneau, puis confirmez avec la Maison.`
- **H1** : Réserver

**Plan des H2.** L'îlot de réservation est posé sous le H1 ; les H2 sont statiques et présents au chargement.
1. Ce que vous pouvez réserver (la consultation avant une création ou une restauration ; l'entretien pour une couronne déjà suivie)
2. Comment se passe la réservation (choisir, proposer un créneau, confirmer avec la Maison ; sans horaires écrits tant que la Maison ne les a pas donnés)
3. Préparer sa consultation (les trois photos : la couronne vue du ciel, les flancs, la nuque)
4. Depuis l'étranger : la consultation à distance (pour la diaspora)
5. Modifier ou annuler (la règle vient de la Maison)
6. Questions sur les rendez-vous

**Expressions de recherche.**
- Principales : rendez-vous dreadlocks Cotonou · réserver locks Cotonou · consultation dreadlocks
- Secondaires : prendre rendez-vous salon locks · réservation en ligne dreadlocks · consultation locks à distance · rendez-vous entretien locks · diagnostic locks en ligne

**Liens internes à poser.**
- `/premiere-couronne`, ancre « La première couronne » (dans « Ce que vous pouvez réserver »)
- `/reparation-locks`, ancre « La réparation »
- `/entretien-locks`, ancre « L'entretien »
- `/mnd-kids`, ancre « MND Kids »
- `/faq`, ancre « Les questions fréquentes »
- `/contact`, ancre « Nous écrire »
- `/mon-parcours`, ancre « Trouver mon parcours » (fin de page, pour qui hésite encore)

**Appel à l'action** : « Réserver ma consultation » (premier bouton de l'îlot ; le second, « Réserver mon entretien », s'affiche à côté pour les couronnes déjà suivies)

**Balisage structuré.**
- WebPage `#page`, `about` → `#maison`, `potentialAction` = ReserveAction (`target` = la canonique de cette page, `object` → `#maison`). Pas de créneaux, pas de prix.
- `#breadcrumb` : Accueil › Réserver.
- Les pages de remerciement rendues après un envoi (formulaire, réservation) ne sont pas des adresses indexables : elles restent dans l'îlot, ou portent `noindex` si elles ont une adresse.

## Le maillage

**Le schéma, en texte.** Trois niveaux, jamais plus de deux clics depuis l'accueil.

```
/  (accueil)
|
|-- /mon-parcours  (le carrefour)
|     |-- /premiere-couronne  -> /reserver
|     |-- /reparation-locks   -> /reserver
|     |-- /entretien-locks    -> /reserver, /abonnements
|     |-- /soins-locks        -> /reserver, /abonnements
|     '-- /mnd-kids           -> /reserver
|
|-- /abonnements  <- /entretien-locks, /soins-locks, /faq  -> /reserver
|
|-- /maison-mnd  -> /brice-et-yeman, /formations, /mon-parcours
|     '-- /brice-et-yeman  -> /maison-mnd, /formations, /reserver
|
|-- /formations  -> /contact (îlot formulaire), /maison-mnd
|
|-- /journal  -> /journal/<slug>  -> la page de service de l'article  -> /reserver
|
|-- /faq  -> chaque page de service, /reserver, /contact
|
|-- /contact  -> /reserver, /faq
'-- /reserver  -> /faq, /contact, /mon-parcours
```

**Qui pointe vers qui.**

| Page | Reçoit des liens de | Envoie vers |
|---|---|---|
| `/` | toutes (le logo, le fil d'Ariane) | les quinze pages |
| `/mon-parcours` | toutes (fin de page, en-tête) | les cinq pages de service, `/reserver`, `/faq` |
| `/premiere-couronne` | `/`, `/mon-parcours`, `/mnd-kids`, `/faq`, `/reserver`, trois articles | `/reserver`, `/entretien-locks`, `/soins-locks`, `/mnd-kids`, `/faq`, articles |
| `/reparation-locks` | `/`, `/mon-parcours`, `/entretien-locks`, `/soins-locks`, `/faq`, `/reserver`, deux articles | `/reserver`, `/entretien-locks`, `/soins-locks`, `/faq`, articles |
| `/entretien-locks` | `/`, `/mon-parcours`, `/premiere-couronne`, `/reparation-locks`, `/soins-locks`, `/abonnements`, `/faq`, `/reserver`, deux articles | `/reserver`, `/abonnements`, `/soins-locks`, `/reparation-locks`, `/faq`, articles |
| `/soins-locks` | `/`, `/mon-parcours`, `/premiere-couronne`, `/reparation-locks`, `/entretien-locks`, `/abonnements`, `/mnd-kids`, `/faq`, deux articles | `/reserver`, `/entretien-locks`, `/abonnements`, `/reparation-locks`, `/faq`, articles |
| `/mnd-kids` | `/`, `/mon-parcours`, `/premiere-couronne`, `/faq`, `/reserver`, un article | `/reserver`, `/premiere-couronne`, `/soins-locks`, `/faq`, article |
| `/abonnements` | `/`, `/entretien-locks`, `/soins-locks`, `/faq` | `/reserver`, `/entretien-locks`, `/soins-locks`, `/faq` |
| `/maison-mnd` | `/`, `/brice-et-yeman`, `/formations`, pied de page | `/brice-et-yeman`, `/formations`, pages de service, `/contact`, `/journal` |
| `/brice-et-yeman` | `/maison-mnd`, `/formations`, pied de page | `/maison-mnd`, `/formations`, `/reserver`, `/journal` |
| `/formations` | `/`, `/maison-mnd`, `/brice-et-yeman`, `/faq`, `/contact` | `/contact`, `/maison-mnd`, `/brice-et-yeman`, pages de service, `/journal` |
| `/journal` | `/`, `/maison-mnd`, `/faq`, pied de page, chaque article (fil d'Ariane) | les articles, les pages de service |
| `/faq` | pages de service, `/journal`, `/contact`, `/reserver`, pied de page | pages de service, `/reserver`, `/contact`, `/journal` |
| `/contact` | `/formations`, `/faq`, `/reserver`, `/maison-mnd`, pied de page | `/reserver`, `/faq`, `/formations` |
| `/reserver` | les cinq pages de service, `/abonnements`, `/contact`, `/faq`, `/brice-et-yeman`, en-tête | `/faq`, `/contact`, `/mon-parcours`, pages de service |

**La règle « chaque page mène à un parcours ».**
- Aucune page ne se termine sans un pas suivant. Chaque page ferme sur un bloc de fin identique dans sa forme : la formule d'appel de la page, puis le lien « Trouver mon parcours ». Les pages de service y ajoutent le geste voisin (l'entretien après la création, la réparation quand l'entretien ne suffit plus).
- Le pied de page, commun à tout le site, liste les cinq parcours par leur nom, puis « Trouver mon parcours », « Réserver », « Le Journal », « Questions fréquentes », « Contact ». C'est la garantie qu'aucune page n'est orpheline et que les cinq pages de service reçoivent un lien depuis chacune des quinze.
- Un article du Journal renvoie à sa page de service deux fois : une fois dans le corps, à l'endroit où le conseil rencontre un geste de la Maison, une fois en fin d'article avec la formule d'appel de cette page.
- Les ancres disent où l'on va, avec les mots que les gens cherchent : « Réparer mes locks abîmées » plutôt que « en savoir plus ». Une même page cible reçoit toujours la même ancre principale, à quelques variantes près, pour que le moteur associe l'ancre à la page.
- L'en-tête porte quatre entrées, pas plus : « Trouver mon parcours », « La Maison », « Le Journal », « Réserver ». Les autres pages se rejoignent par le contenu et le pied de page.
- Les îlots ne cassent pas le maillage : le résultat d'un triage, le remerciement d'un formulaire et la confirmation d'une réservation sont rendus avec de vrais liens HTML vers une page du site.

## Le Journal

**Les adresses.** Chaque article vit à `/journal/<slug>/`, un dossier avec son `index.html`. Le slug est en minuscules, sans accent, sans article grammatical inutile, mots séparés par des traits d'union, et ne change jamais une fois publié. Si un titre change, le slug reste. Si un slug doit vraiment changer, l'ancienne adresse conserve une page qui porte la canonique vers la nouvelle et un renvoi par `meta refresh`, faute de redirection serveur sur GitHub Pages.

Pas de pagination tant que le Journal compte moins de vingt articles ; pas d'adresses de catégorie ni d'étiquette (elles feraient des pages sans contenu propre). Les rubriques du Journal sont des H2 de la page `/journal`, pas des adresses.

**Le fil d'Ariane.** Accueil › Journal › Titre de l'article. Dans le HTML, une liste ordonnée sous l'en-tête, avec les deux premiers niveaux en liens et le troisième en texte ; dans le JSON-LD, la BreadcrumbList `#breadcrumb` à trois positions.

**La page d'un article.**
- Titre : le titre de l'article, puis « · Journal MND » si les 60 caractères le permettent, sinon le titre seul.
- Description : une phrase avec un verbe d'action, 155 caractères au plus, qui dit ce que l'article apprend.
- H1 = le titre. Les H2 suivent les étapes du conseil ; le dernier H2 nomme le geste de la Maison qui correspond et porte le lien vers la page de service.
- Signature : « La Maison MND », ou le prénom de l'autrice si la Maison le souhaite ; date de publication et date de mise à jour affichées.
- Balisage : BlogPosting `#article` (`headline`, `description`, `datePublished`, `dateModified`, `author` → `#maison` ou une Person, `publisher` → `#maison`, `image` composée à la construction, `mainEntityOfPage` la canonique, `inLanguage` fr, `articleSection` « Journal », `about` → le Service de la page de service liée). `#breadcrumb` à trois positions.
- Fin d'article : un encadré « Le geste qui va avec », lien vers la page de service avec sa formule d'appel, puis « Trouver mon parcours ».

**Les dix articles fondateurs.**

| Slug | Titre de travail | Expression principale | Page de service liée | Formule d'appel en fin d'article |
|---|---|---|---|---|
| `/journal/commencer-ses-dreadlocks/` | Commencer ses dreadlocks : par où débuter | commencer des dreadlocks | `/premiere-couronne` | Réserver ma consultation |
| `/journal/quelle-methode-premieres-locks/` | Quelle méthode pour ses premières locks | méthode dreadlocks | `/premiere-couronne` | Réserver ma consultation |
| `/journal/reparer-des-locks-abimees/` | Réparer des locks abîmées : ce qui est possible | réparation dreadlocks | `/reparation-locks` | Diagnostiquer ma couronne |
| `/journal/locks-trop-lourdes/` | Locks trop lourdes : alléger ou défaire | locks trop lourdes | `/reparation-locks` | Diagnostiquer ma couronne |
| `/journal/entretenir-ses-racines/` | Entretenir ses racines | reprise racines locks | `/entretien-locks` | Réserver mon entretien |
| `/journal/locks-creees-ailleurs/` | Locks créées ailleurs : comment la Maison les reçoit | entretien dreadlocks | `/entretien-locks` | Réserver mon entretien |
| `/journal/laver-ses-dreadlocks/` | Laver ses dreadlocks | lavage locks | `/soins-locks` | Réserver mon entretien |
| `/journal/hydrater-ses-locks/` | Hydrater ses locks | hydrater dreadlocks | `/soins-locks` | Réserver mon entretien |
| `/journal/locks-fines-precautions/` | Locks fines : les précautions | locks fines | `/premiere-couronne` | Réserver ma consultation |
| `/journal/dreadlocks-enfants/` | Dreadlocks et enfants : ce qu'il faut savoir | dreadlocks enfant | `/mnd-kids` | Organiser notre visite |

Chaque article cite au moins un autre article du Journal, en lien dans le texte. Les articles 1, 2 et 9 se citent entre eux ; 5, 6, 7 et 8 se citent entre eux ; 3 et 4 se citent ; 10 cite 1 et 7.

## Le local

Ce qui rattache la Maison à Cotonou et au Bénin dans un moteur ne s'invente pas : cela se déclare, à l'identique, partout.

**La fiche Google (fiche d'établissement).** C'est la pièce maîtresse du local. La Maison la crée ou la revendique, avec le même nom que sur le site (« Maison MND »), la catégorie la plus proche du métier (salon de coiffure, et les services de locks décrits dans la fiche), l'adresse exacte (à renseigner par la Maison), le téléphone (à renseigner par la Maison), les horaires (à renseigner par la Maison), l'adresse du site (le sous-chemin du site, pas la racine de l'origine), des photos réelles de l'atelier et des gestes, et une description courte qui reprend « soin et création de dreadlocks afro à Cotonou ». Les services de la fiche portent les mêmes noms que les pages de service du site.

**La cohérence nom, adresse, téléphone.** Le nom, l'adresse et le téléphone sont écrits une seule fois, dans un fichier de données du site, et toutes les pages les lisent de là : le pied de page, la page `/contact`, le nœud `#maison`. La même graphie, au caractère près, est reprise sur la fiche Google, sur WhatsApp et sur chaque profil public. Tant que la Maison n'a pas donné une valeur, elle est absente du site, pas remplacée par une valeur d'attente.

**La ville dans les titres et le texte.** « Cotonou » est dans la balise titre des pages où c'est naturel (l'accueil, les cinq pages de service, la Maison, le contact), dans le H1 de l'accueil, de la première couronne et de MND Kids, dans la première phrase de l'accueil et de la Maison, dans le pied de page de chaque page. « Bénin » figure dans le titre des formations, dans la description de l'accueil et dans le nœud `#maison` (`addressCountry`, `areaServed`). On ne force pas la ville dans chaque H2 ; une fois par section suffit.

**Le balisage.** Le nœud HairSalon avec `addressLocality` Cotonou et `addressCountry` BJ, sur la page d'accueil, référencé par `@id` ailleurs. Il ne porte que ce que la page affiche.

**Les avis.** Ils se demandent à la sortie, à chaque cliente, vers la fiche Google, avec un lien court partagé sur WhatsApp. Ils ne s'écrivent jamais à sa place, ne se copient jamais sur le site sans l'accord de la personne, et n'entrent dans le balisage (`aggregateRating`, `review`) que s'ils sont réels et affichés sur la page. Répondre à chaque avis, dans la voix du site.

**La diaspora.** La consultation à distance existe ; la page `/reserver` le dit, et la FAQ y répond. Le site reste rattaché à Cotonou : pas de page par pays, pas de doublon de contenu pour l'étranger.

**Les images.** Les photos de l'atelier portent un `alt` qui nomme le geste et le lieu quand c'est naturel (« reprise des racines SÍNSIN™ à la Maison MND, Cotonou »), et des noms de fichier lisibles, en minuscules, sans accent.

## La mesure

**Les événements à compter.** Huit noms, écrits une fois pour toutes dans un dictionnaire partagé par les pages statiques et par les îlots.

| Nom technique | Se déclenche quand | Paramètres |
|---|---|---|
| `page_vue` | un fichier HTML est chargé (une fois par chargement ; il n'y a pas de navigation sans rechargement, donc pas de doublon) | `page`, `parcours` si la page appartient à un parcours |
| `parcours_choisi` | clic sur une carte ou un lien de parcours (accueil, carrefour, pied de page, résultat de triage) | `parcours`, `page`, `emplacement` |
| `triage_commence` | première réponse donnée dans l'îlot de triage (pas au montage de l'îlot) | `page` |
| `triage_termine` | l'îlot affiche son résultat | `parcours` (le parcours recommandé), `page` |
| `prospect_depose` | un formulaire envoyé avec succès (contact, Académie, formulaire du triage) | `parcours`, `page`, `formulaire` |
| `consultation_ouverte` | la visiteuse entre dans le parcours de consultation depuis le site | `parcours`, `page` |
| `reservation_demandee` | une demande de réservation envoyée depuis l'îlot | `parcours`, `type` (consultation ou entretien), `page` |
| `whatsapp_clic` | clic sur un lien WhatsApp, où qu'il soit | `parcours`, `page`, `emplacement` |

**Les valeurs des paramètres.** Elles sont fermées, pour que les rapports restent lisibles :
- `parcours` : `creation`, `reparation`, `entretien`, `soins`, `kids`, `abonnement`, `formation`, `maison`, `aucun`.
- `emplacement` : `entete`, `sous_h1`, `corps`, `fin_de_page`, `pied`, `ilot`, `carte`.
- `formulaire` : `contact`, `academie`, `triage`, `kids`.
- `type` : `consultation`, `entretien`.
- `page` : le chemin canonique, sans l'origine, avec sa barre finale.

**Comment nommer de façon stable.**
- Un nom d'événement est un nom en français sans accent, en minuscules, mots séparés par un trait de soulignement, verbe au participe passé quand il y a un verbe. Il ne contient ni la page ni le parcours : ceux-ci sont des paramètres.
- Un nom ne se renomme jamais. Si un sens change, on crée un nouveau nom et on laisse l'ancien s'éteindre ; le dictionnaire note la date et la raison.
- Le dictionnaire est un seul fichier de constantes, importé par les îlots et lu par le petit script des pages statiques. Les pages statiques déclarent leurs événements en attributs (`data-mesure="whatsapp_clic" data-parcours="entretien" data-emplacement="fin_de_page"`) ; le script les capte et appelle la même fonction que les îlots. Ainsi un même geste porte le même nom, qu'il vienne d'une page ou d'un îlot.
- Le lien WhatsApp porte un message pré-rempli qui nomme le parcours en clair (« Bonjour, je viens du site, parcours entretien ») ; la Maison retrouve le parcours dans la conversation, et l'événement `whatsapp_clic` le retrouve dans le rapport.
- Dans l'outil de mesure, quatre événements sont marqués comme conversions : `prospect_depose`, `consultation_ouverte`, `reservation_demandee`, `whatsapp_clic`. Le tableau de bord de la Maison lit chaque semaine : pages vues par page, parcours choisis par parcours, triages commencés et terminés, et les quatre conversions par parcours.
- L'outil est léger et respecte le consentement : de préférence une mesure sans cookies, qui n'a pas besoin de bandeau ; sinon la mesure ne démarre qu'après consentement, et les événements avant consentement sont perdus, pas mis en attente. La Search Console reste la source pour les requêtes et les positions.

## Les pièges à éviter sur GitHub Pages et dans une application React

| Piège | Ce qui se passe | La parade |
|---|---|---|
| Page vide au chargement | Une application React qui rend tout le contenu au chargement montre au moteur une page sans texte, ou un texte tardif ; les titres et H2 vivent dans un script. | Les pages de contenu sont produites en HTML à la construction : titre, description, H1, H2, paragraphes, liens, JSON-LD, tout est dans le fichier. Les îlots ne se montent que dans leurs emplacements, jamais sur le corps entier. Chaque emplacement d'îlot contient un contenu statique de repli (la liste des cinq parcours pour le triage, un lien WhatsApp pour le formulaire et la réservation). Vérification : ouvrir le code source de la page, pas l'inspecteur, et y lire le contenu. |
| Adresses avec dièse | Un routeur à dièse (`/#/premiere-couronne`) donne une seule adresse au moteur pour tout le site ; rien n'est indexé séparément. | Aucun routeur côté client. Une adresse, un fichier. Les étapes d'un îlot se gardent en état interne ; si une étape doit survivre à un rechargement, elle passe par un paramètre de requête que la canonique ignore, jamais par une adresse propre. |
| Doublons `index.html` | La même page répond à `/premiere-couronne`, `/premiere-couronne/` et `/premiere-couronne/index.html` ; l'accueil répond à `/` et `/index.html`. GitHub Pages renvoie une redirection de la forme sans barre vers la forme avec barre. | Une forme canonique, celle avec la barre finale, écrite dans la balise canonique de chaque page, dans le sitemap, dans le fil d'Ariane et dans tous les liens internes (jamais `index.html` dans un lien). Les formes avec `index.html` restent accessibles mais pointent vers la canonique. |
| Sous-chemin et chemins d'accès | Servi sous un sous-chemin de l'origine, le site casse ses feuilles de style, ses scripts et ses images si les chemins sont écrits depuis la racine de l'origine. | Le chemin de base est une variable de construction (le `base` de l'outil de construction), et tous les chemins du site sont écrits relatifs à cette base. Test obligatoire sur l'adresse réelle, en rechargeant une page profonde, pas seulement l'accueil. |
| Images lourdes | Des photos d'atelier de plusieurs mégaoctets ralentissent la page sur un réseau mobile, et le moteur en tient compte. | Formats modernes (AVIF ou WebP avec repli JPEG), plusieurs tailles déclarées par `srcset` et `sizes`, `width` et `height` posés, chargement différé pour tout ce qui est sous la ligne de flottaison, priorité haute pour l'image d'ouverture seule, un budget par image et par page fixé à la construction, `alt` en français sur chaque image. |
| La page 404 utilisée comme routeur | Le procédé classique consiste à servir l'application depuis `404.html` pour toute adresse inconnue ; le moteur reçoit alors un code 404 pour des pages « réelles ». | La page `404.html` n'est qu'une page d'erreur, avec des liens vers l'accueil, le carrefour et le Journal. Aucune page de contenu ne dépend d'elle. |
| Traitement Jekyll | GitHub Pages passe le dossier par Jekyll par défaut et ignore les fichiers et dossiers dont le nom commence par un trait de soulignement. | Un fichier `.nojekyll` vide à la racine du dossier publié. |
| Sitemap et robots | Le sitemap liste des adresses qui ne sont pas la forme canonique, ou des adresses d'îlot ; le robots bloque un dossier d'actifs dont le moteur a besoin pour rendre la page. | Le sitemap est produit à la construction depuis la même liste que les pages, en forme canonique, avec `lastmod` réel. Le robots n'interdit rien de nécessaire au rendu ; il pointe le sitemap. Une copie de recette du site, si elle existe, porte `noindex` sur toutes ses pages. |
| Cache de GitHub Pages | Une mise à jour peut mettre plusieurs minutes à apparaître, et une seule publication à la fois passe par dépôt. | Ne pas republier en boucle ; vérifier après le délai, sur une fenêtre sans cache. Nommer les actifs avec une empreinte de contenu pour que les nouvelles versions ne restent pas coincées en cache. |
| Scripts tiers | Une carte embarquée, une police chargée de loin, un outil de mesure lourd, et la page ralentit ou dépend d'un service extérieur. | Polices hébergées avec le site et `font-display: swap` ; plan d'accès en image statique ou lien ; mesure légère, chargée après le contenu. |
| Contenu dupliqué entre pages | Les cinq pages de service répètent le même paragraphe d'introduction, la FAQ recopie les réponses des pages de service, le Journal recopie la FAQ. | Chaque page répond à sa question et renvoie vers l'autre au lieu de la recopier. La FAQ donne la réponse courte et le lien ; la page de service donne le détail ; l'article donne le conseil. |

## Liste de contrôle avant la mise en ligne

1. Les quinze pages ont chacune un titre unique de 60 caractères au plus et une description unique de 155 caractères au plus, ouverte par un verbe d'action ; un script de construction refuse la publication sinon.
2. Chaque page a un seul H1, ses H2 sont dans le code source au chargement, et le contenu de repli de chaque îlot est lisible sans script.
3. Chaque page porte sa balise canonique en forme avec barre finale, composée depuis la variable d'origine ; le sitemap liste exactement ces formes, avec `lastmod` ; le robots pointe le sitemap et n'interdit rien de nécessaire au rendu.
4. Le JSON-LD de chaque page passe l'outil de test des résultats enrichis sans erreur ; aucun champ ne contient de valeur inventée ni de valeur d'attente ; les champs non renseignés par la Maison sont absents.
5. Le site est testé sur son adresse réelle sous le sous-chemin : feuilles de style, scripts, images et liens tiennent en rechargeant une page profonde et un article du Journal ; `.nojekyll` est présent.
6. Aucune adresse à dièse ; la page `404.html` est une page d'erreur ; aucune adresse d'étape d'îlot ni page de remerciement n'est indexable.
7. Les images passent le budget de poids, portent `width`, `height`, `alt`, `srcset` et le chargement différé ; les scores mobile de vitesse sont vérifiés sur l'accueil, une page de service et un article.
8. Le maillage est complet : chaque page porte sa formule d'appel et le lien « Trouver mon parcours », aucune page n'est orpheline, un parcours d'exploration automatique ne trouve aucun lien cassé, et chaque article du Journal renvoie à sa page de service.
9. Les huit événements se déclenchent avec leurs noms exacts et leurs paramètres fermés, depuis les pages statiques et depuis les îlots, vérifiés en mode débogage de l'outil de mesure ; les liens WhatsApp portent le parcours.
10. La Search Console reçoit le sitemap et une demande d'indexation pour les quinze pages ; le nom, l'adresse et le téléphone affichés sur `/contact` sont identiques à la fiche Google ; `lang="fr"`, les balises Open Graph et le favicon sont en place sur toutes les pages.
