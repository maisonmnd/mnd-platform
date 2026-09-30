/* LE SITE RÉVÉLATEUR : SON CONTENU, EN DONNÉES. 17 septembre 2026.

   La voix vient de `docs/site-revelateur/voix-du-site.md`, raccourcie de moitié
   au moins (« trop de lecture, synthétise ») ; les balises titre, descriptions,
   H1 et appels à l'action viennent de `docs/site-revelateur/plan-seo.md` ; la
   concision est celle de `public/maquette-le-site-revelateur.html`.
   Un lien WhatsApp s'écrit `whatsapp:<besoin>` ; un chemin du site porte sa
   barre finale ; aucune adresse absolue, aucun prix, aucun témoignage. */

import type { Accueil, Commun, Galerie, Page } from './contenu-types';
import { PARRAINAGE } from './communaute';

/* La communauté, le parrainage, les ingrédients, l'avant / après : 28 septembre 2026. */
export * from './communaute';

export const COMMUN: Commun = {
  nom: 'Maison MND',
  ville: 'Cotonou',
  /* Recopié de l'extrait du RCCM, sans rien de ce qui est personnel
     (naissance, domicile, téléphone privé ne sortent jamais d'ici). */
  editeur: {
    nomCommercial: 'ACIA 1',
    forme: 'entreprise individuelle',
    exploitante: 'Yéman Ahouansou',
    rccm: 'RB/COT/12 A 14509',
    greffe: 'Cotonou',
    adresse: 'Ilot 130-F, quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin',
    /* DEUX ADRESSES POUR UN SEUL LIEU — 22 septembre 2026, demandé par Yéman.
       `adresse` est celle du registre : elle signe les mentions légales et le
       paragraphe qui prouve la Maison à Meta, et elle ne prend pas de repère.
       `adresseComplete` est celle qu'on donne à une cliente qui cherche la
       porte, numéro de maison et couleur du portail compris. Une couleur de
       portail dans un texte légal détonnerait ; une adresse sans repère fait
       tourner une cliente dans Suru-Léré. */
    adresseComplete: 'Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin',
    /* Les mêmes parts, pour la fiche que lit Google : elles étaient recopiées
       à la main dans le générateur, à côté d'un commentaire qui jurait le
       contraire. Elles vivent ici désormais. */
    rue: 'Ilot 130-F, quartier Suru-Léré',
    boitePostale: '06 BP 2076',
    telephone: '+229 01 51 99 77 99',
    email: 'contact@maisonmnd.com',
  },
  /* La fiche Google est celle de la Maison (inscrite sous son ancien nom,
     « M Natural Dreadlocks », jusqu'au renommage) ; l'identifiant de lieu
     est public, il vit dans l'adresse. Instagram et Facebook s'écriront ici
     le jour où Yéman donnera l'adresse de la Page sous le nom Maison MND.

     L'ADRESSE A CHANGÉ DE FORME LE 26 SEPTEMBRE 2026, ET CE N'EST PAS UN
     DÉTAIL. Elle s'écrivait `maps/place/?q=place_id:…`. Sur un téléphone,
     l'application Maps l'attrape avant le navigateur, prend l'identifiant
     pour du TEXTE À CHERCHER, et affiche « No results found » : Yéman est
     tombé dessus. Le format ci-dessous est celui que Google documente pour
     ouvrir une fiche (« Search for a place using a place ID ») ; `api=1` et
     `query` y sont l'un et l'autre obligatoires.

     `query` PORTE LES COORDONNÉES, PAS LE NOM, et c'est délibéré. Ce champ
     est le repli : si l'identifiant n'est pas honoré, il décide seul de ce
     qu'on trouve. Un nom y mettrait « M Natural Dreadlocks », celui que la
     Maison quitte, et l'écrirait dans une adresse publique. Les coordonnées
     ne portent aucun nom et tombent sur la porte. Elles sont celles de
     `position`, ci-dessous, à six décimales, et `verifie-la-vitrine` refuse
     qu'elles s'en écartent. */
  comptes: {
    google: 'https://www.google.com/maps/search/?api=1&query=6.376295,2.463199'
      + '&query_place_id=ChIJbwIfV9hVIxARgS3WzgGq9kM',
  },
  /* La position de la porte, lue par Yéman sur Google Maps le 24 septembre
     2026 (clic droit sur l'épingle de la Maison) : la fiche structurée la
     porte en `geo`, ce que Google lit pour « salon de locks Cotonou ». */
  position: { latitude: 6.376295137272732, longitude: 2.463199119044698 },
  /* LES MARQUES QUE LA MAISON UTILISE ET VEND — 27 septembre 2026 : « Aroma-
     Zone, Arganicare, Dr. Bronner's, L'Oréal, T444Z, Shea Moisture » (Yéman).
     Quatre logos officiels pris sur les sites des marques ; T444Z et
     SheaMoisture ne se laissent pas atteindre depuis ici, leur nom tient la
     place en lettres jusqu'au fichier. Le défilé les porte dans cet ordre. */
  marques: [
    { cle: 'aroma-zone', nom: 'Aroma-Zone', logo: 'aroma-zone.png' },
    { cle: 'arganicare', nom: 'Arganicare', logo: 'arganicare.png' },
    { cle: 'dr-bronners', nom: 'Dr. Bronner’s', logo: 'dr-bronners.svg' },
    { cle: 'loreal', nom: 'L’Oréal', logo: 'loreal.svg' },
    { cle: 't444z', nom: 'T444Z' },
    { cle: 'shea-moisture', nom: 'SheaMoisture' },
  ],
  nav: [
    /* LA MAISON REVISITÉE — 27 septembre 2026, maquette validée. « Mon
       parcours » devient le diagnostic, la carte cadeau entre au menu
       (« Offrir »), les offres descendent au pied de page : l'accueil les
       montre déjà. */
    { texte: 'Diagnostic', vers: '/mon-parcours/' },
    { texte: 'Services', vers: '/#portes' },
    { texte: 'Offrir', vers: '/offrir/' },
    /* LA CINQUIEME ENTREE — 18 septembre 2026, demandée par Yéman. Placée
       après Services, là où l'œil se pose, sans déplacer « Mon parcours »
       qui reste la porte d'entrée du site. Sous 860 pixels la barre cache
       tout le menu et ne garde que le bouton de rendez-vous : cette entrée
       ne change donc rien sur téléphone. */
    { texte: 'La Maison', vers: '/maison-mnd/' },
    /* « RAJOUTER NOTRE HISTOIRE » AU MENU (Yéman, 30 septembre 2026). */
    { texte: 'Notre histoire', vers: '/notre-histoire/' },
    /* La galerie s'intercale entre la Maison et le Journal : on regarde
       avant de lire. Sous 860 pixels la barre cache tout le menu, cette
       entrée ne change donc rien sur téléphone ; le pied de page la porte
       aussi, et c'est par là qu'on l'atteint depuis un téléphone. */
    { texte: 'Galerie', vers: '/galerie/' },
    { texte: 'Journal', vers: '/journal/' },
  ],
  pied: {
    phrase: 'La Maison MND, Cotonou. Locks créées, réparées, entretenues, depuis 2010.',
    colonnes: [
      {
        titre: 'Services',
        liens: [
          { texte: 'Première Couronne', vers: '/premiere-couronne/' },
          { texte: 'Réparation', vers: '/reparation-locks/' },
          { texte: 'Entretien', vers: '/entretien-locks/' },
          { texte: 'Soins', vers: '/soins-locks/' },
          { texte: 'MND Kids', vers: '/mnd-kids/' },
          { texte: 'Abonnements', vers: '/abonnements/' },
          { texte: 'Formations', vers: '/formations/' },
          { texte: 'Les offres', vers: '/les-offres/' },
        ],
      },
      {
        titre: 'La Maison',
        liens: [
          { texte: 'La Maison MND', vers: '/maison-mnd/' },
          { texte: 'Brice et Yéman', vers: '/brice-et-yeman/' },
          { texte: 'Notre histoire', vers: '/notre-histoire/' },
          { texte: 'Le Journal', vers: '/journal/' },
          { texte: 'Vos questions', vers: '/faq/' },
          { texte: 'Le diagnostic locks', vers: '/mon-parcours/' },
          { texte: 'Offrir la Maison', vers: '/offrir/' },
          { texte: 'Parrainer une amie', vers: '/parrainage/' },
          { texte: 'Nos ingrédients', vers: '/ingredients/' },
          { texte: 'Nos engagements', vers: '/engagements/' },
        ],
      },
      {
        titre: 'Contact',
        liens: [
          { texte: 'WhatsApp', vers: 'whatsapp:inconnu' },
          { texte: 'Nous écrire', vers: '/contact/' },
          { texte: 'Me faire rappeler', vers: '/rappel/' },
        ],
      },
    ],
    legal: [
      /* LES LIBELLES DEMANDES PAR LA MAISON — 18 septembre 2026. Les pages
         existaient deja sous des noms courts ; Yéman les veut nommees en
         entier, comme le fait un site de salon. Les chemins ne changent PAS,
         donc rien de ce qui est indexe ne se casse. */
      { texte: 'Mentions légales', vers: '/mentions-legales/' },
      { texte: 'Plan du site', vers: '/plan-du-site/' },
      { texte: 'CGU Conditions générales prise de rendez-vous en ligne', vers: '/conditions/' },
      { texte: 'Politique de Gestion des Données Personnelles', vers: '/confidentialite/' },
    ],
  },
  /* « JE VEUX… », 28 septembre 2026 : derrière « Nous écrire », la cliente
     choisit, et le message part déjà écrit. */
  envies: [
    { texte: 'Entretenir mes locks', message: 'Bonjour MND, je veux entretenir mes locks.', besoin: 'entretien' },
    { texte: 'Une coloration', message: 'Bonjour MND, je veux une coloration sur mes locks.', besoin: 'entretien' },
    { texte: 'Un détox', message: 'Bonjour MND, je veux un détox pour mes locks.', besoin: 'entretien' },
    { texte: 'Un soin', message: 'Bonjour MND, je veux un soin pour mes locks.', besoin: 'entretien' },
    { texte: 'Réparer mes locks', message: 'Bonjour MND, je veux réparer mes locks.', besoin: 'reparation' },
    { texte: 'Créer mes locks', message: 'Bonjour MND, je veux créer mes locks.', besoin: 'creation' },
  ],
  messages: {
    creation: "Bonjour MND, je viens du parcours Première Couronne et je souhaite être accompagnée pour créer mes locks.",
    reparation: "Bonjour MND, je viens du parcours Réparation et je souhaite faire diagnostiquer ma couronne.",
    entretien: "Bonjour MND, je viens du parcours Entretien et je souhaite réserver un rendez-vous pour mes locks.",
    enfant: "Bonjour MND, je viens du parcours MND Kids et je souhaite organiser une visite pour mon enfant.",
    formation: "Bonjour MND, je viens du parcours Formations et je souhaite en savoir plus sur les formations MND.",
    inconnu: "Bonjour MND, je veux : entretenir mes locks, une coloration, un détox, un soin, réparer mes locks ou créer mes locks. Je garde ce qui me convient.",
  },
  formulaire: {
    titre: 'Un prénom, un numéro. Nous vous rappelons.',
    ligne: 'Dites-nous simplement où vous en êtes. Nous vous répondons personnellement.',
    prenom: 'Votre prénom',
    numero: 'Votre WhatsApp ou téléphone',
    besoin: 'Ce dont vous avez besoin',
    profil: 'Vous êtes',
    consentement: "MND peut me contacter au sujet de ma demande et garder mes coordonnées pour cela. Rien d'autre.",
    bouton: 'Envoyer ma demande',
    besoins: [
      { valeur: 'creation', texte: 'Créer ma couronne' },
      { valeur: 'reparation', texte: 'Réparer ma couronne' },
      { valeur: 'entretien', texte: 'Entretenir ma couronne' },
      { valeur: 'enfant', texte: 'Pour mon enfant' },
      { valeur: 'formation', texte: 'Apprendre le métier' },
      { valeur: 'inconnu', texte: 'Je ne sais pas encore' },
    ],
    profils: [
      "Je n'ai pas encore de locks",
      "J'ai des locks créées chez MND",
      "J'ai des locks créées ailleurs",
      'Je suis parent',
      'Je suis coiffeuse ou coiffeur',
      'Autre',
    ],
    erreurNumero: 'Il nous manque votre numéro pour vous répondre.',
    merci: {
      titre: 'Merci. Nous vous rappelons.',
      texte: "Sur WhatsApp ou par téléphone, pendant les heures d'ouverture de la Maison.",
    },
    /* L'ORDRE SUIT CE QUI SE PASSE VRAIMENT — 17 septembre 2026 :
       « corrige l'ordre, elle n'est plus juste, on fait maintenant une
       réservation » (Yéman). Ces trois lignes dataient du simple rappel :
       elles ouvraient sur « Nous vous rappelons », alors que la visiteuse
       vient de choisir son geste, son jour et son heure. Le rappel n'est
       plus le premier geste de la Maison, c'est le deuxième. */
    suite: [
      ['C’est réservé', "Le créneau est à votre nom dès l'envoi : la Maison a vérifié qu'il était libre."],
      ['La confirmation arrive sur WhatsApp', "Dans la seconde. La Maison choisit qui s'occupe de vous."],
      ['Vous venez', 'Votre espace Ma Couronne s’ouvre à votre premier rendez-vous.'],
    ],
  },
};

export const ACCUEIL: Accueil = {
  titre: 'Dreadlocks à Cotonou, soin et création · Maison MND',
  description: 'Découvrez la Maison MND à Cotonou : création, réparation, entretien et soins des dreadlocks afro. Trouvez le parcours qui convient à votre couronne.',
  /* LA TRADUCTION DE LA DEVISE, CHANGÉE LE 25 SEPTEMBRE 2026.
     Elle a dit « Vous êtes belle », puis « Nous sommes beaux, et nous le
     savons » le 24 septembre, et elle dit « vous » depuis le 25. Ce ne sont
     pas des corrections de traduction : en fon, « mi » porte les deux
     personnes, « vous » et « nous » s'y disent pareil (Yéman). La phrase fon
     ne tranche pas, c'est le français qui choisit à qui elle parle.

     ICI LA TRADUCTION ENTIÈRE, ET C'EST VOULU. La signature des papiers et
     des messages prolonge le fon sans le traduire (« mi nyɔ́ ɖɛkpɛ, et vous
     le savez ») ; cette page-ci est celle où l'on rencontre la Maison pour la
     première fois, et une demi-phrase dans une langue qu'on ne lit pas n'y
     accueille personne. */
  devise: { fon: 'Mi nyɔ́ ɖɛkpɛ', sens: 'Vous êtes beaux, votre beauté est déjà là.' },
  /* Six mots, trois lignes : « la phrase est beaucoup trop longue, encore plus
     de fluidité » (Yéman, 22 septembre 2026). La liste des parcours est partie
     du paragraphe, les cinq portes la disent juste dessous. */
  /* L'ACCROCHE D, CHOISIE PAR YÉMAN LE 27 SEPTEMBRE 2026 parmi quatre
     posées en place dans la maquette (« on va garder la version D »). « Votre
     couronne, comprise » n'était pas clair ; il fallait « une découverte
     d'une vérité sur les locks, comme une coiffure révélatrice ». La ligne
     du dessous est de lui, mot pour mot : « la maison de référence des locks
     premium à Cotonou », ÊTRE et non devenir. */
  h1: 'Révélez ce que vous avez de plus beau.',
  /* LE 30 SEPTEMBRE 2026, LA MAISON NE SE DIT PLUS « LA RÉFÉRENCE » : « la
     maison n'a pas besoin de dire qu'elle est la référence : elle dit ce
     qu'elle est, et la personne conclut » (Yéman, avec le récit). */
  bande: ['Locks créées', 'Locks réparées', 'Locks soignées', 'Une maison de famille pour les locks, à Cotonou'],
  boutons: [
    { texte: 'Faire mon diagnostic', vers: '/mon-parcours/' },
    { texte: 'Réserver', vers: '/reserver/' },
  ],
  /* LA LIGNE DU MÉTIER EST PARTIE DU PREMIER ÉCRAN le 27 septembre 2026 au
     soir (Yéman) : la ligne sous l'accroche dit déjà les locks et Cotonou. */
  /* TROIS PROMESSES, TOUTES TENUES PAR LE SITE AUJOURD'HUI, vérifiées dans
     le code avant d'être écrites : la réservation en trois pas sans compte
     (îlot reserver), la confirmation sur WhatsApp (formulaire.suite), rien à
     payer en ligne (/conditions/). On ne promet pas « votre place est tenue »
     ni un délai d'annulation : le site ne les tient pas. */
  /* LES SECTIONS DE L'ACCUEIL REVISITÉ — 27 septembre 2026. Les trois
     promesses sont parties avec l'épure ; l'objectif dit ce que la Maison
     EST, le diagnostic se joue sur la page même, l'univers montre les huit
     maisons, les marques défilent, la carte cadeau s'annonce, la galerie
     donne quatre photos et mène à la sienne. */
  objectif: {
    /* « NOTRE OBJECTIF » ANNONÇAIT UN PLAN D'ENTREPRISE, PAS UNE MAISON — 30
       septembre 2026. Le titre et le texte sont ceux de Yéman (« Textes pour
       le site », section 4) : la Maison dit ce qu'elle est, sans se vanter. */
    sur: 'La Maison',
    titre: 'Une maison de famille pour les locks. Depuis 2010, à Cotonou.',
    ligne: "On ne vient pas ici pour une coiffure. On vient s'asseoir, déposer ce que l'on porte, et repartir avec sa couronne. Ce savoir-faire est né sur une terrasse d'Akpakpa. Il en part aujourd'hui vers nos branches, notre Académie et nos produits, sans jamais quitter la maison.",
    piliers: [
      { titre: "Regarder d'abord", ligne: "Un diagnostic avant tout geste. On ne resserre pas ce qu'on n'a pas vu." },
      { titre: 'Faire durer', ligne: "Des locks qu'on garde des années, pas des mois. C'est cela, le vrai luxe." },
      { titre: 'Transmettre', ligne: 'Une Académie, pour que la méthode voyage plus loin que nos mains.' },
    ],
    suite: {
      ligne: "Il y a cinq façons d'entrer dans la Maison. La vôtre dépend d'où en est votre couronne.",
      bouton: { texte: 'Voir les cinq portes', vers: '#portes' },
    },
  },
  diagnostic: {
    sur: 'Le diagnostic locks',
    titre: 'Cinq questions. Votre routine.',
    ligne: 'Dites-nous où en sont vos locks, votre cheveu, votre cuir chevelu et votre rythme. Vous repartez avec la porte qui vous convient et une routine de soins, chez vous et à la Maison.',
    note: "Votre routine part sur WhatsApp si vous le voulez, et s'inscrit à votre fiche pour que la Maison s'en souvienne à votre prochain rendez-vous.",
  },
  marques: {
    sur: 'Les marques que nous choisissons',
    titre: 'Ce que nous avons éprouvé sur nos propres couronnes.',
    ligne: "À la Maison et à la Boutique MND, rien n'entre sans avoir été essayé sur des locks, longtemps.",
  },
  offrir: {
    sur: 'La carte cadeau',
    titre: 'Offrez une couronne.',
    ligne: 'Un geste de la Maison, ou un montant de votre choix, remis à qui vous voulez. La personne réserve quand elle veut, sur toute prestation, pendant douze mois.',
    bouton: { texte: 'Composer une carte', vers: '/offrir/' },
  },
  galerie: {
    sur: 'La galerie',
    titre: 'Ce que la Maison fait de ses mains.',
    /* Quatre visages déjà servis ailleurs sur le site et inscrits au
       registre ; la galerie d'hier, avec son défilé, reste telle quelle et
       c'est là que mène le bouton. */
    images: ['cliente-12.jpg', 'cliente-7.jpg', 'cliente-13.jpg', 'trois-couronnes.jpg'],
    bouton: { texte: 'Voir la galerie', vers: '/galerie/' },
  },
  /* LES OFFRES SUR L'ACCUEIL, À LA MANIÈRE DES « DEALS » — 22 septembre 2026.
     Une promesse en grand, un mécanisme en une phrase, un bouton, les
     conditions dépliées dans la carte. Aucun prix en francs : la voix du
     site l'interdit, et c'est ce qui protège le premium. Les offres viennent
     de `mnd_offers`, composées au Trône ; rien n'est écrit ici. */
  /* DES MOTS QUI AFFIRMENT — 22 septembre 2026, au soir. « Évite les mots ou
     textes négatifs » (Yéman) : le titre ne dit plus « et à quelles
     conditions », la phrase sur l'absence de prix est partie, la note sur ce
     que la Maison « ne solde pas » aussi. Les conditions restent, dépliées
     dans chaque carte, là où elles servent. */
  offres: {
    sur: 'Les offres de la Maison',
    titre: 'Ce que la Maison vous offre.',
  },
  /* LES COURONNES DE LA MAISON, 23 septembre 2026, ramenées à deux le soir
     même (« garde 2 photos au-dessus des avis Google », Yéman).

     Pourquoi ces deux-là : la bande sert de preuve juste au-dessus des avis
     d'un salon de locks, et cliente-2 et cliente-3 sont les seules dont les
     locks sont indiscutables. Les trois autres portent un TWA, des cheveux
     tirés, ou un plan en pied où le visage fait huit pour cent du cadre ;
     elles sont descendues au Journal, recadrées en 16/10 (journal-4 à 6).

     À deux, la bande n'est plus une rangée mais une paire posée à côté du
     titre : voir `.couronnes` dans revelateur.css, qui passe en deux colonnes.

     L'accord reste celui que Yéman a répondu au sélecteur (registre des
     photos), et les figures n'ont pas de texte de remplacement : la ligne
     ci-dessous les couvre toutes les deux, et rien dans ces images n'est
     nommable séparément sans nommer une femme. */
  portes: {
    sur: 'Par où entrer',
    titre: 'Cinq portes, une méthode.',
    ligne: "Cinq parcours qui ne commencent pas au même endroit et ne se déroulent pas pareil. Trouvez le vôtre à sa situation de départ.",
    /* LES CINQ PORTES DE LA MAQUETTE VALIDÉE (27 septembre 2026) : la
       Première Couronne, la Réparation, l'Entretien, les Soins, MND Kids. La
       formation garde sa page et son entrée au pied ; sur l'accueil, on ne
       vend plus le métier entre deux soins. Les photos : le portrait sur la
       première porte (la femme des cauris tient déjà le premier écran, on ne
       la remet pas ici), le regard sur la réparation, l'entretien, l'attention
       sur les soins, la mère et l'enfant sur MND Kids. */
    cartes: [
      { titre: 'Première Couronne', pour: "Je n'ai pas encore de locks", ligne: 'Vos premières locks, préparées puis posées.', comment: 'Consultation · Préparation · Création · Premier suivi', suite: 'Découvrir', vers: '/premiere-couronne/', image: 'portrait-accueil.jpg' },
      { titre: 'Réparation', pour: 'Mes locks m’inquiètent', ligne: "Casse, amincissement, racines : on regarde d'abord.", comment: 'Diagnostic zone par zone · Devis · Réparation', suite: 'Découvrir', vers: '/reparation-locks/', image: 'regard.jpg' },
      { titre: 'Entretien', pour: 'Mes locks vont bien', ligne: 'Leur rendez-vous, au rythme de votre couronne.', comment: 'Se réserve directement · Lavage · Resserrage · Hydratation', suite: 'Découvrir', vers: '/entretien-locks/', image: 'entretien.jpg' },
      { titre: 'Soins', pour: 'Cuir chevelu et longueurs', ligne: 'En profondeur, selon la saison.', comment: 'Purifier · Nourrir · Sceller · Couronner', suite: 'Découvrir', vers: '/soins-locks/', image: 'attention.jpg' },
      { titre: 'MND Kids', pour: 'Pour mon enfant', ligne: 'Tout va plus doucement.', comment: 'Un échange avec vous · Une séance courte · Le temps qu’il faut', suite: 'Découvrir', vers: '/mnd-kids/', image: 'mnd-kids.jpg' },
    ],
    repli: 'Vous hésitez entre deux portes ?',
    repliNote: 'Cinq questions, et la Maison vous dit la vôtre, avec votre routine.',
    repliBouton: { texte: 'Faire mon diagnostic', vers: '/mon-parcours/' },
  },
  confiance: {
    sur: 'Entre de bonnes mains',
    citation: "Vous n'avez pas besoin de savoir ce qu'il vous faut. Nous sommes là pour vous aider à le déterminer.",
    gages: [
      { titre: 'Consultation', ligne: 'Comprendre avant de proposer.' },
      { titre: 'Devis', ligne: 'Rien ne commence sans votre oui.' },
      { titre: 'Hygiène', ligne: 'Outils désinfectés, linge propre, pour chacune.' },
      { titre: 'Suivi', ligne: 'Après le geste, nous restons là.' },
    ],
  },
  fondateurs: {
    /* L'HISTOIRE, RACONTÉE — 27 septembre 2026 au soir : « refais le
       storytelling de Brice et Yéman » (Yéman). Rien d'inventé : 2010,
       Cotonou, une maison de famille, ses mains, sa direction, l'Académie
       née de leurs gestes, les couronnes qui reviennent. */
    sur: 'Notre histoire',
    /* ALIGNÉ SUR LE RÉCIT DES FONDATEURS — 30 septembre 2026. Leurs
       phrases, coupées, jamais réécrites ; le bouton mène au récit entier. */
    titre: 'Nous avons commencé sur une terrasse.',
    ligne: "Nous étions deux jeunes amoureux de 26 ans qui cherchaient leur chemin. Les locks sont entrées dans notre vie comme on entre dans une maison : sans frapper très fort, et pour rester. Seize ans plus tard, on vient chez nous s'asseoir, déposer ce que l'on porte, et repartir avec sa couronne.",
    /* LA PHRASE DE BRICE — 30 septembre 2026. L'ancienne citation parlait de
       formation ; sous la photo des deux, la note forte du récit est celle
       qui a tenu la maison debout, les soirs sans clients. */
    message: 'Accroche-toi. Les beaux jours sont encore devant nous.',
    legende: 'Brice à Yéman, les soirs sans clients.',
    trois: ['Prendre soin', 'Transformer', 'Transmettre'],
    image: 'fondateurs.jpg',
  },
  journal: { sur: 'Le Journal MND', titre: 'Comprendre sa couronne' },
  /* LA FIN DE L'ACCUEIL EST LA DEVISE, EN GRAND — 27 septembre 2026. Le
     rappel garde sa page et sa place au pied ; ici, la Maison signe. */
  appel: {
    titre: 'Mi nyɔ́ ɖɛkpɛ.',
    ligne: 'Vous êtes beaux, votre beauté est déjà là.',
    boutons: [
      { texte: 'Réserver', vers: '/reserver/' },
      { texte: 'Faire mon diagnostic', vers: '/mon-parcours/' },
    ],
  },
};

/* LA GALERIE. Les dix de la boîte sont choisies pour la PROFONDEUR : deux
   grandes au premier plan, deux moyennes de part et d'autre, six petites qui
   s'éloignent. Ce n'est pas un classement, c'est un étagement. La grille du
   dessous, elle, montre tout.

   `cliente-1`, `cliente-3`, `cliente-4` et `cliente-5` y reprennent du
   service : elles étaient publiées sans être servies nulle part depuis le
   23 septembre, ce qui est précisément ce qu'on s'interdit pour les photos du
   Journal. La galerie leur rend un emploi. */
export const GALERIE: Galerie = {
  titre: 'La galerie · Maison MND',
  description: 'Regardez les couronnes créées, réparées et entretenues par la Maison MND à Cotonou, en images.',
  sur: 'La galerie',
  h1: 'Ce que la Maison fait de ses mains.',
  ligne: 'Des couronnes créées, réparées, entretenues à Cotonou.',
  boite: [
    'creation.jpg', 'cliente-4.jpg', 'regard.jpg', 'cliente-1.jpg', 'mnd-kids.jpg',
    'entretien.jpg', 'cliente-5.jpg', 'attention.jpg', 'enfant-jardin.jpg', 'cliente-3.jpg',
  ],
  photos: [
    'creation.jpg', 'cliente-7.jpg', 'regard.jpg', 'cliente-6.jpg', 'attention.jpg',
    'cliente-9.jpg', 'entretien.jpg', 'cliente-10.jpg', 'mnd-kids.jpg', 'cliente-11.jpg',
    'enfant-jardin.jpg', 'cliente-12.jpg', 'trois-couronnes.jpg', 'cliente-13.jpg',
    'cliente-1.jpg', 'cliente-3.jpg', 'cliente-4.jpg', 'cliente-5.jpg',
  ],
};

export const PAGES: Page[] = [
  {
    chemin: '/mon-parcours/',
    titre: 'Le diagnostic locks · Maison MND Cotonou',
    description: 'Cinq questions sur vos locks, votre cheveu, votre cuir chevelu et votre rythme : la Maison MND vous dit la porte qui vous convient et votre routine de soins, à Cotonou.',
    h1: 'Le diagnostic locks',
    sur: 'Diagnostic',
    ligne: 'Cinq questions. Votre routine.',
    besoin: 'inconnu',
    ilot: 'triage',
    sections: [
      {
        type: 'texte',
        corps: "Il n'y a pas de bonne réponse. Dites où en sont vos locks : nous composons votre routine, chez vous et à la Maison, et la porte qui vous convient.",
      },
      {
        type: 'grille',
        style: 'portes',
        sur: 'Ou choisissez directement',
        titre: 'Les cinq parcours',
        items: [
          { titre: "Je n'ai pas encore de locks", texte: 'Votre couronne commence ici, par une consultation.', vers: '/premiere-couronne/', suite: 'La Première Couronne' },
          { titre: 'Mes locks me préoccupent', texte: "Regardons d'abord : une réparation commence par un diagnostic.", vers: '/reparation-locks/', suite: 'La Réparation' },
          { titre: 'Mes locks vont bien', texte: 'Pas de consultation : choisissez votre geste et votre créneau.', vers: '/entretien-locks/', suite: 'Entretien et soins' },
          { titre: "C'est pour mon enfant", texte: 'Pour votre enfant, tout va plus doucement.', vers: '/mnd-kids/', suite: 'MND Kids' },
          { titre: 'Je veux en faire mon métier', texte: 'Apprendre à faire, et à bien faire.', vers: '/formations/', suite: 'MND Formation' },
        ],
      },
    ],
    jsonld: 'aucun',
    court: 'Diagnostic',
  },
  {
    chemin: '/premiere-couronne/',
    titre: 'Création de dreadlocks à Cotonou · Maison MND',
    description: 'Créez vos premières dreadlocks à Cotonou avec la Maison MND : consultation, choix du calibre, création VÈKPÈ™ lock par lock, suivi des premières semaines.',
    h1: 'La première couronne : créer ses dreadlocks à Cotonou',
    sur: 'Je veux créer ma couronne',
    ligne: "Vous n'avez jamais porté de locks ? Vous n'avez pas besoin de tout savoir avant de commencer.",
    image: 'portrait-accueil.jpg',
    besoin: 'creation',
    cta: { texte: 'Réserver ma consultation', note: "Le premier pas, et le seul à faire aujourd'hui." },
    geste: 'La création porte un nom : <b>VÈKPÈ™</b>. Elle pose le premier palier de votre chemin, <b>Fondation</b>.',
    temps: true,
    pas: {
      sur: 'Comment cela se passe',
      titre: 'Six pas',
      items: [
        ['Consultation', 'Nous vous écoutons.'],
        ['Diagnostic', "Nous regardons vos cheveux tels qu'ils sont."],
        ['Méthode', 'Nous la choisissons ensemble.'],
        ['Devis', 'Écrit, clair, avant tout geste.'],
        ['Atelier Création', 'Le jour de VÈKPÈ™, votre couronne prend forme.'],
        ['Suivi', 'Les premières semaines comptent, nous restons présents.'],
      ],
    },
    rassure: 'Cheveux fins, courts ou fragilisés : la consultation sert justement à voir ce qui est possible pour vous.',
    faq: [
      ["J'ai les cheveux fins. Puis-je avoir des locks ?", "Cela dépend de vos cheveux, pas d'une règle. C'est ce que la consultation permet de voir."],
      ['Combien de temps dure une création ?', 'Quelques heures ou une journée, selon la méthode et vos cheveux. Vous le saurez avec votre devis.'],
      ['Pourquoi les prix sont-ils sur devis ?', 'Deux couronnes ne demandent jamais la même chose. Le devis suit la consultation, par écrit.'],
    ],
    jsonld: 'service',
    court: 'Première Couronne',
  },
  {
    chemin: '/reparation-locks/',
    titre: 'Réparation de dreadlocks à Cotonou · Maison MND',
    description: 'Réparez vos locks abîmées, collées ou cassantes à Cotonou : bilan écrit, restauration FÍNFÍN™, plan de soin. Commencez par un diagnostic de la Maison MND.',
    h1: 'Réparer des locks abîmées : la restauration FÍNFÍN™',
    sur: "Ma couronne a besoin d'attention",
    ligne: "Une réparation commence par un diagnostic. Votre couronne raconte déjà une histoire : nous l'écoutons d'abord.",
    image: 'regard.jpg',
    besoin: 'reparation',
    cta: { texte: 'Diagnostiquer ma couronne', note: 'Le diagnostic a lieu pendant la consultation Réparation.' },
    geste: 'La restauration porte un nom : <b>FÍNFÍN™</b>. Selon le diagnostic, un <b>SÍNSIN™</b> pour resserrer, un <b>DÀNDÀN™</b> pour hydrater ou un <b>GBÀTÀ™</b> pour défaire l\'accompagne.',
    pas: {
      sur: 'Comment cela se passe',
      titre: 'Six pas',
      items: [
        ['Consultation Réparation', 'Vous racontez, nous écoutons sans juger.'],
        ['Diagnostic', 'Racines, corps des locks, pointes, cuir chevelu.'],
        ['Plan de réparation', 'Ce qui se restaure, ce qui demande du temps.'],
        ['Devis', 'Écrit, avant de dire oui.'],
        ['Intervention', 'À votre rythme, en une ou plusieurs séances.'],
        ['Suivi', 'Nous regardons comment votre couronne réagit, et ajustons.'],
      ],
    },
    rassure: 'Nous ne promettons pas une couronne neuve. Nous regardons honnêtement, et rien ne se fait sans votre accord.',
    faq: [
      ['Mes locks ont été créées ailleurs. Puis-je venir ?', 'Oui, bienvenue quand même. Nous prenons votre couronne là où elle en est.'],
      ['La consultation est-elle obligatoire ?', 'Pour une réparation, oui : nous ne faisons pas de geste important sans avoir regardé.'],
      ['Que se passe-t-il si je dois annuler ?', 'Prévenez-nous dès que possible, nous déplaçons votre rendez-vous.'],
    ],
    jsonld: 'service',
    court: 'Réparation',
  },
  {
    chemin: '/entretien-locks/',
    titre: 'Entretien de dreadlocks à Cotonou · Maison MND',
    description: 'Entretenez vos dreadlocks à Cotonou : reprise des racines SÍNSIN™, resserrage de précision, contours nets. Réservez votre entretien à la Maison MND.',
    h1: "L'entretien des locks : la reprise des racines SÍNSIN™",
    sur: 'Je veux entretenir ma couronne',
    ligne: 'Vos locks ont été créées ailleurs ? Bienvenue quand même. Nous prenons votre couronne là où elle en est.',
    image: 'entretien.jpg',
    besoin: 'entretien',
    cta: { texte: 'Réserver mon entretien', note: 'Se réserve directement, sans consultation.' },
    geste: 'Chaque entretien suit les quatre temps de la méthode MND.',
    temps: true,
    pas: {
      sur: 'Les gestes',
      titre: 'Ce que nous faisons',
      liste: true,
      items: [
        ['La reprise de racines · SÍNSIN™', 'Régulière, sans excès, pour une repousse propre.'],
        ['Les contours', 'Tempes, nuque et lisière, repris avec précision.'],
        ['La coiffure', 'Pour tous les jours ou pour une occasion.'],
        ['La cadence', 'Celle qui convient à votre couronne, pas une règle.'],
      ],
    },
    rassure: 'Nous vous conseillons la fréquence qui convient à votre couronne, pas une règle générale.',
    faq: [
      ['À quelle fréquence entretenir mes locks ?', "Votre couronne a son propre rythme. Nous vous le disons après l'avoir vue."],
      ['Faut-il une consultation ?', 'Non. Un entretien se réserve directement.'],
      ["Quand l'entretien ne suffit plus ?", 'Si quelque chose vous inquiète, commencez par une consultation Réparation.'],
    ],
    jsonld: 'service',
    court: 'Entretien',
  },
  {
    chemin: '/soins-locks/',
    titre: 'Soins des dreadlocks, lavage et hydratation · Maison MND',
    description: 'Prenez soin de vos locks à Cotonou : lavage rituel KLƆKLƆ™, hydratation DÀNDÀN™, couleur végétale YÈKPÈ™. Les gestes de soin de la Maison MND.',
    image: 'attention.jpg',
    h1: 'Les soins des locks : laver, hydrater, colorer',
    sur: 'Je veux entretenir ma couronne',
    ligne: 'Des gestes simples, répétés avec soin, qui gardent votre couronne propre, souple et bien tenue.',
    besoin: 'entretien',
    cta: { texte: 'Réserver mon entretien', note: 'Se réserve directement, sans consultation.' },
    geste: 'Chaque soin suit les quatre temps de la méthode MND.',
    temps: true,
    pas: {
      sur: 'Les gestes',
      titre: 'Ce que nous faisons',
      liste: true,
      items: [
        ['Le lavage · KLƆKLƆ™', 'En profondeur, sans agresser.'],
        ["L'hydratation · DÀNDÀN™", 'Sept huiles, de la racine à la pointe.'],
        ['La couleur végétale · YÈKPÈ™', 'Réservée aux couronnes saines, après un regard.'],
        ['Les soins', 'Selon ce que votre couronne demande ce jour-là.'],
        ['À la maison', 'Des gestes simples entre deux visites.'],
      ],
    },
    rassure: 'Si vous préférez un avis avant de réserver, la consultation reste possible.',
    faq: [
      ['Proposez-vous la coloration végétale ?', "Oui, avec YÈKPÈ™, après un regard sur l'état de vos locks."],
      ['Quelle méthode utilisez-vous ?', 'Quatre temps : Purifier, Nourrir, Sceller, Couronner. Nous vous expliquons le geste qui vous concerne.'],
      ["Comment se passe l'hygiène à la Maison ?", 'Outils désinfectés entre chaque personne, linge propre pour chacune.'],
    ],
    jsonld: 'service',
    court: 'Soins',
  },
  {
    chemin: '/mnd-kids/',
    titre: 'Dreadlocks pour enfants à Cotonou · MND Kids',
    description: 'Confiez la couronne de votre enfant à la Maison MND à Cotonou : création, reprise et soins pour les petites têtes. Organisez votre visite en famille.',
    h1: 'MND Kids : les dreadlocks des enfants, à Cotonou',
    sur: 'MND Kids',
    /* SA PROPRE PHOTO DEPUIS LE 24 SEPTEMBRE 2026 : la page et la porte de
       l'accueil montraient la même image. L'enfant au jardin tient seul sur
       cette page, où son échelle de visage n'a personne à côté de qui se
       régler. Accord de sa mère, donné à Yéman ; son prénom n'est écrit nulle
       part, ici pas plus qu'ailleurs. */
    image: 'mnd-kids.jpg',
    ligne: "Un enfant a besoin de temps, de douceur, et d'une main qui ne tire pas. Vous restez à ses côtés.",
    besoin: 'enfant',
    cta: { texte: 'Organiser notre visite', note: 'La visite commence par un échange avec vous.' },
    pas: {
      sur: "L'univers",
      titre: 'Cinq promesses',
      liste: true,
      items: [
        ['Douceur', "Une séance plus longue plutôt qu'un enfant qui a mal."],
        ['Sécurité', 'Un parent toujours présent.'],
        ['Patience', 'Une pause, une histoire, un moment.'],
        ['Hygiène', 'Comme pour les adultes, sans exception.'],
        ['Famille', 'Les rendez-vous peuvent se suivre.'],
      ],
    },
    rassure: "Nous ne créons pas de locks sur un enfant sans en avoir parlé avec ses parents, et sans qu'il le souhaite lui-même.",
    faq: [
      ['À partir de quel âge ?', "Il n'y a pas d'âge fixe. Cela dépend de l'enfant, de ses cheveux et de son envie."],
      ['Que proposez-vous ?', "Premières locks, entretien, reprise de racines, coiffures d'école ou de fête."],
    ],
    jsonld: 'service',
    court: 'MND Kids',
  },
  {
    chemin: '/abonnements/',
    titre: "Abonnements d'entretien des locks · Maison MND",
    description: "Choisissez une cadence d'entretien pour vos locks avec la Maison MND à Cotonou : reprise des racines et soins à intervalles réguliers, sans y repenser.",
    h1: 'Les abonnements : une cadence pour votre couronne',
    sur: 'Entre deux visites',
    besoin: 'entretien',
    sections: [
      {
        type: 'texte',
        titre: 'Ma couronne mérite une attention régulière.',
        corps: "Une couronne ne se soigne pas une fois. Elle se suit. L'abonnement MND est une continuité de soin : vos rendez-vous pensés à l'avance, un rythme qui vous convient.",
      },
      {
        type: 'grille',
        sur: "Ce que l'abonnement vous apporte",
        items: [
          { titre: 'Un rythme', texte: 'La fréquence de vos entretiens, fixée ensemble, selon votre couronne et votre vie.' },
          { titre: 'Une mémoire', texte: 'Votre espace Ma Couronne garde ce qui a été fait et ce qui reste à faire.' },
          { titre: 'Une place', texte: "Vos rendez-vous sont prévus à l'avance. Vous n'avez plus à y penser." },
          { titre: 'Une présence', texte: 'Entre deux rendez-vous, vous pouvez nous écrire.' },
        ],
      },
      {
        type: 'pas',
        sur: 'Les paliers',
        titre: "Trois paliers, un seul chemin",
        liste: true,
        items: [
          ['Fondation', 'Quand la couronne se construit.'],
          ['Élévation', 'Quand elle prend de la longueur et de la tenue.'],
          ['Souveraineté', "Quand elle est pleinement vôtre et demande d'être préservée."],
        ],
      },
      {
        type: 'appel',
        titre: "L'abonnement n'est pas une obligation.",
        ligne: 'Nous vous le proposons quand il a du sens pour vous. Les formules vous sont expliquées de vive voix.',
        boutons: [
          { texte: 'Découvrir les abonnements', vers: 'whatsapp:entretien' },
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
        ],
      },
    ],
    jsonld: 'service',
    court: 'Abonnements',
  },
  {
    chemin: '/maison-mnd/',
    titre: 'La Maison MND, maison de famille pour les locks à Cotonou',
    description: "Découvrez la Maison MND à Cotonou, une maison de famille où l'on crée, répare et soigne les dreadlocks : ses gestes, sa méthode, son Académie.",
    h1: 'La Maison MND, à Cotonou',
    sur: 'Depuis 2010',
    besoin: 'inconnu',
    sections: [
      /* LA MAISON REVISITÉE — 27 septembre 2026 : « rajoute des sections
         notre histoire, notre objectif, notre univers » (Yéman). L'objectif
         dit ce que la Maison EST, l'histoire est celle des fondateurs, mot
         pour mot celle de leur page, l'univers montre les huit maisons, les
         marques défilent. Les quatre portes d'avant (Ma Couronne, le Trône…)
         se lisent désormais dans l'univers. */
      {
        type: 'texte',
        sur: 'La Maison',
        titre: 'Une maison de famille pour les locks. Depuis 2010, à Cotonou.',
        corps: "On ne vient pas ici pour une coiffure. On vient s'asseoir, déposer ce que l'on porte, et repartir avec sa couronne. Ce savoir-faire est né sur une terrasse d'Akpakpa. Il en part aujourd'hui vers nos branches, notre Académie et nos produits, sans jamais quitter la maison.",
        image: 'regard.jpg',
      },
      {
        type: 'piliers',
        items: [
          { titre: "Regarder d'abord", ligne: "Un diagnostic avant tout geste. On ne resserre pas ce qu'on n'a pas vu." },
          { titre: 'Faire durer', ligne: "Des locks qu'on garde des années, pas des mois. C'est cela, le vrai luxe." },
          { titre: 'Transmettre', ligne: 'Une Académie, pour que la méthode voyage plus loin que nos mains.' },
        ],
      },
      {
        type: 'texte',
        sur: 'Notre histoire',
        titre: 'Nous avons commencé sur une terrasse.',
        corps: '<p>Nous n’étions pas deux entrepreneurs visionnaires. Nous étions deux jeunes amoureux de 26 ans qui cherchaient leur chemin. Les locks sont arrivées presque par hasard, et elles sont entrées dans notre vie comme on entre dans une maison : sans frapper très fort, et pour rester.</p><p>Nous avons commencé sur une terrasse, à Akpakpa. Nous avons perdu un enfant, et nous avons continué à travailler, une tête après l’autre, parce qu’on peut toujours faire quelque chose de ses mains. Dix ans plus tard, nous sommes revenus dans la maison où tout avait commencé.</p><p>Nous avons quatre garçons, tous en locks. De cette famille sont nés nos symboles : la Couronne, le Trône, la Maison. Aujourd’hui, les personnes qui viennent chez nous déposent ce qu’elles portent, et repartent avec leur couronne.</p>',
        image: 'fondateurs.jpg',
      },
      {
        type: 'citation',
        texte: 'Accroche-toi. Les beaux jours sont encore devant nous.',
        qui: 'Brice à Yéman, les soirs sans clients.',
      },
      /* « NOTRE UNIVERS » EST PARTI LE 30 SEPTEMBRE 2026 (« retire notre
         univers », Yéman) : la gamme des huit maisons ne se montre plus ici,
         comme elle avait quitté l'accueil le 27. Les marques défilent
         toujours, et le sur-titre de la page reste « L'univers MND ». */
      {
        type: 'marques',
        sur: 'Les marques que nous choisissons',
        titre: 'Ce que nous avons éprouvé sur nos propres couronnes.',
        ligne: "À la Maison et à la Boutique MND, rien n'entre sans avoir été essayé sur des locks, longtemps.",
      },
      {
        type: 'citation',
        texte: 'Tout est relié. Ce que nous faisons à la Maison nourrit ce que nous enseignons. Une seule méthode, la même exigence.',
      },
      { type: 'confiance' },
      {
        type: 'appel',
        titre: "Vous êtes où aujourd'hui ?",
        ligne: 'Il existe un chemin pour vous. Nous commençons par vous écouter.',
        boutons: [
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
          { texte: 'Brice et Yéman', vers: '/brice-et-yeman/' },
          { texte: 'Notre histoire', vers: '/notre-histoire/' },
        ],
      },
      {
        type: 'texte',
        sur: 'La Maison',
        titre: 'Qui est la Maison MND',
        corps: `Maison MND est le nom commercial sous lequel exerce ${COMMUN.editeur.nomCommercial}, ${COMMUN.editeur.forme} de ${COMMUN.editeur.exploitante}, immatriculée au registre du commerce et du crédit mobilier de ${COMMUN.editeur.greffe} sous le numéro ${COMMUN.editeur.rccm}. Établissement principal : ${COMMUN.editeur.adresse}. Téléphone et WhatsApp : ${COMMUN.editeur.telephone}. Courriel : ${COMMUN.editeur.email}.`,
      },
    ],
    jsonld: 'maison',
    court: 'La Maison',
  },
  {
    chemin: '/brice-et-yeman/',
    titre: 'Brice et Yéman, fondateurs de la Maison MND',
    description: 'Rencontrez Brice et Yéman, les fondateurs de la Maison MND à Cotonou : leur parcours, leur méthode et leur regard sur le soin des dreadlocks afro.',
    h1: 'Brice et Yéman',
    sur: 'Derrière MND',
    besoin: 'creation',
    sections: [
      {
        type: 'texte',
        titre: 'Brice et Yéman Ahouansou',
        /* Le récit, en trois paragraphes (27 septembre 2026 au soir). */
        corps: '<p>Nous n’étions pas deux entrepreneurs visionnaires. Nous étions deux jeunes amoureux de 26 ans qui cherchaient leur chemin. Les locks sont arrivées presque par hasard, et elles sont entrées dans notre vie comme on entre dans une maison : sans frapper très fort, et pour rester.</p><p>Nous avons commencé sur une terrasse, à Akpakpa. Nous avons perdu un enfant, et nous avons continué à travailler, une tête après l’autre, parce qu’on peut toujours faire quelque chose de ses mains. Dix ans plus tard, nous sommes revenus dans la maison où tout avait commencé.</p><p>Nous avons quatre garçons, tous en locks. De cette famille sont nés nos symboles : la Couronne, le Trône, la Maison. Aujourd’hui, les personnes qui viennent chez nous déposent ce qu’elles portent, et repartent avec leur couronne.</p>',
        image: 'fondateurs.jpg',
      },
      {
        type: 'grille',
        sur: "Quatre manières d'être là",
        items: [
          { titre: 'Praticiens', texte: "Chaque jour, des couronnes passent entre nos mains. C'est là que tout commence." },
          { titre: 'Parents', texte: 'Quatre garçons, tous en locks. Notre première transmission.' },
          { titre: 'Formateurs', texte: 'Nous enseignons la méthode MND à celles et ceux qui veulent en faire leur métier.' },
          { titre: 'Accompagnateurs', texte: 'Nous restons présents après le geste : conseils, suivi, écoute.' },
        ],
      },
      {
        type: 'citation',
        texte: 'Accroche-toi. Les beaux jours sont encore devant nous.',
        qui: 'Brice à Yéman, les soirs sans clients.',
      },
      {
        type: 'appel',
        titre: 'Votre couronne commence ici.',
        ligne: 'Une création débute par une consultation. Rien d\'autre à décider aujourd\'hui.',
        boutons: [
          { texte: 'Réserver ma consultation', vers: 'whatsapp:creation' },
          { texte: 'Lire notre histoire', vers: '/notre-histoire/' },
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
        ],
      },
    ],
    jsonld: 'maison',
    court: 'Brice et Yéman',
  },
  {
    /* NOTRE HISTOIRE — 30 septembre 2026. Le récit fondateur, écrit par
       Brice et Yéman (« Récit fondateur de Maison MND », douze chapitres),
       raccourci d’un quart à leur demande, sans une phrase réécrite : on a
       coupé, pas reformulé. Il se lit une fois, en une colonne. Les deux
       phrases mises en respiration sont les leurs. Il nomme Kolétan : c’est
       leur choix, et il ne vaut que pour cette page, jamais pour une
       publicité. */
    chemin: '/notre-histoire/',
    titre: 'Notre histoire · Brice, Yéman et la Maison MND',
    description: "Lisez le récit fondateur de la Maison MND : deux jeunes amoureux, une terrasse à Cotonou, un enfant, dix ans de deuil et le retour à la maison d'Akpakpa.",
    h1: 'Notre histoire',
    sur: 'Le récit fondateur',
    ligne: 'Maison MND est née de l’amour, a grandi dans la résilience et existe aujourd’hui pour transmettre cet amour. Voici la vérité sur Brice et Yéman, racontée par eux.',
    besoin: 'inconnu',
    sections: [
      {
        type: 'texte',
        sur: 'I',
        titre: 'Avant Maison MND',
        image: 'fondateurs.jpg',
        corps: '<p>Nous n’étions pas deux entrepreneurs visionnaires. Nous étions deux jeunes amoureux de 26 ans qui cherchaient leur chemin.</p><p>Nous avions des diplômes, des rêves, et des enfants qui allaient arriver. Mais nous ne savions pas encore quelle vie nous voulions construire.</p><p>Alors nous avons essayé. Des petits commerces, des petits boulots, du travail aux côtés de nos parents. Rien de tout cela n’était notre place. Mais pendant ce temps, sans que nous le sachions, quelque chose se construisait déjà.</p>',
      },
      {
        type: 'texte',
        sur: 'II',
        titre: 'La rencontre',
        corps: '<p>Les locks sont arrivées presque par hasard. Nous ne les avons pas choisies comme on choisit un métier. Elles sont entrées dans notre vie comme on entre dans une maison : sans frapper très fort, et pour rester.</p><p>Au début, c’était simplement quelque chose que nous aimions faire. Prendre une tête entre nos mains. Prendre le temps. Voir quelqu’un se regarder autrement en partant.</p>',
      },
      {
        type: 'texte',
        sur: 'III',
        titre: 'La terrasse',
        corps: '<p>Nous n’avons pas commencé dans une grande maison. Nous avons commencé sur une terrasse.</p><p>Nous comptions sur le bouche-à-oreille, et nous passions presque quatre heures sur une tête pour 5 000 francs.</p><p>Ce jour-là, une phrase tournait dans nos têtes : quelqu’un est prêt à nous payer pour ce que nous savons faire avec nos mains. Ces 5 000 francs racontent plus de vérité sur nous que n’importe quel chiffre à venir.</p>',
      },
      {
        type: 'texte',
        sur: 'IV',
        titre: 'Kolétan',
        corps: '<p>Il y a un enfant au cœur de cette histoire. Il s’appelle Kolétan. Kolé, pour nous. Nous ne voulons pas le raconter par son absence, mais par sa présence dans la vie de ses parents.</p><p>Kolé était joyeux. Il allait au bout de ce qu’il commençait. Son petit nom, pour nous, voulait dire lumière et espoir.</p><p>Il portait ses locks, de deux à cinq ans. Lorsqu’il est parti, il est parti avec elles. Aujourd’hui, ses frères portent encore les leurs.</p>',
      },
      {
        type: 'citation',
        texte: 'Avec les locks, il nous retrouverait toujours.',
      },
      {
        type: 'texte',
        sur: 'V',
        titre: 'Les mains',
        corps: '<p>Après lui, nous avons quitté la maison. Il fallait continuer à vivre, et nous ne savions plus comment. Quand on ne sait plus quoi faire de sa douleur, on peut au moins faire quelque chose de ses mains.</p><p>Nous avons continué à travailler. Une tête, puis une autre. Des locks abîmées que l’on nous demandait de réparer. Des personnes qui arrivaient fatiguées et repartaient un peu plus légères.</p><p>Nous avons appris à réparer. Nous avons appris à prendre soin. Et sans le dire, en réparant les locks des autres, nous avons commencé à nous reconstruire.</p>',
      },
      {
        type: 'texte',
        sur: 'VI',
        titre: 'Les années difficiles',
        corps: '<p>Les années qui ont suivi ont été longues. Le regard des autres, d’abord. Nous étions diplômés. Autour de nous, des amis prenaient de grands postes. Nous, nous étions penchés sur des locks. Et les gens nous le disaient : « Vous allez continuer jusqu’à quand ? Faites autre chose. Avec les locks, vous n’y arriverez jamais. » Alors parfois, nous avons eu honte. Honte de ne pas ressembler à ce que la société attendait de nous.</p><p>Les journées vides, ensuite. Des jours sans clients, où l’on attend, où l’on range, et où l’on rentre avec la même question qu’au matin : est-ce que ça vaut la peine de continuer ?</p><p>Nous aurions pu écouter. Nous avons continué. Pas parce que nous savions que nous allions réussir. Parce que nous n’avions pas encore fini de croire.</p>',
      },
      {
        type: 'texte',
        sur: 'VII',
        titre: 'L’amour',
        corps: '<p>Si l’on nous demande ce qui nous a sauvés, la réponse tient en un mot. Pas le travail. Pas le courage. L’amour.</p><p>Il y a eu des soirs où Yéman voulait tout arrêter. Et chaque fois, Brice était là. Il disait simplement : « Accroche-toi. Les beaux jours sont encore devant nous. » Et il y croyait. Sur une terrasse, avec 5 000 francs en poche, il parlait déjà d’une Maison MND internationale. Il voyait le royaume avant que la maison soit construite.</p><p>Yéman, elle, donnait ce que Brice ne savait pas donner. Le rire, la chaleur, la conversation qui détend les épaules. Cette façon de mettre les gens à l’aise dès qu’ils passent la porte, jusqu’à ce qu’ils se sentent chez quelqu’un.</p><p>C’est cela, notre amour : pas deux personnes qui se ressemblent, mais deux personnes qui se complètent. Et c’est de cet amour-là que Maison MND est née.</p>',
      },
      {
        type: 'texte',
        sur: 'VIII',
        titre: 'Le pardon',
        corps: '<p>Le deuil de Kolétan n’a pas duré quelques mois. Il a duré presque dix ans. Et dans ces dix années, il n’y avait pas que de la tristesse. Il y avait aussi de la colère. Ce jour-là, Brice était responsable. Yéman n’était pas là.</p><p>Le pardon ne s’est pas décidé un matin. Il s’est appris. Une journée après l’autre, une tête coiffée après l’autre, un silence après l’autre.</p><p>C’est dans ces années-là que nous avons compris ce que Kolétan nous avait laissé : tous les jours sont le moment. Le moment d’aimer. Le moment de pardonner. Le moment de dire je t’aime, parce qu’on ne sait jamais si l’on aura demain pour le dire.</p>',
      },
      {
        type: 'texte',
        sur: 'IX',
        titre: 'Le retour à la maison',
        corps: '<p>Nous sommes revenus. À l’endroit même de la douleur.</p><p>Dix ans plus tard, nous avons poussé la même porte. La maison n’avait pas changé. Nous, oui. Nous étions deux parents, deux artisans, un couple qui avait appris à rester.</p><p>Revenir, ce n’était pas oublier. C’était accepter que tout ait commencé là : notre couple, nos enfants, la terrasse, les premières locks, le deuil, la reconstruction. C’était dire à cette maison qu’elle n’était pas seulement le lieu où nous avions perdu, mais aussi le lieu où nous avions aimé.</p><p>Et c’est à ce moment-là que Maison MND a cessé d’être le rêve de Brice pour devenir le nôtre.</p>',
      },
      {
        type: 'texte',
        sur: 'X',
        titre: 'Les quatre K',
        corps: '<p>Une maison, ce sont d’abord ceux qui l’habitent. Chez nous, ils sont quatre. Quatre garçons, et une même lettre pour ouvrir chacun de leurs prénoms. Kolétan la portait aussi. Il restera toujours l’un des nôtres. Quatre fils que l’on voit grandir, et un qui grandit autrement, dans nos mémoires et dans nos gestes.</p><p>De cette famille sont nés nos symboles. La Couronne, parce que les locks ne sont pas une coiffure mais ce que l’on porte sur la tête avec dignité. Le Trône, parce que la personne qui s’assoit chez nous mérite du temps et de l’attention. Et la Maison, parce que tout est parti de là, et que tout y revient. Ce sont nos enfants, notre métier et notre foyer, réunis dans un même nom.</p>',
      },
      {
        type: 'texte',
        sur: 'XI',
        titre: 'Maison MND',
        corps: '<p>Alors nous avons construit une maison pour les autres. Pas une adresse : un endroit où l’on peut déposer ce que l’on porte.</p><p>Les personnes qui viennent chez nous arrivent souvent chargées. Elles laissent tout cela dehors. Nous prenons leur tête entre nos mains, nous prenons le temps, nous parlons ou nous nous taisons. Et elles repartent avec quelque chose de différent.</p><p>Nous savons ce que c’est, porter quelque chose de lourd. Nous l’avons porté pendant dix ans. C’est pour cela que cette maison existe. Pas pour faire oublier Kolétan. Elle existe parce qu’après tout ce chemin, nous avons quelque chose à donner. De l’amour. Du respect. Du pardon. De la beauté. Et une manière de dire à quelqu’un, sans un mot, en prenant soin de sa couronne : tu peux encore te retrouver.</p><p>Deux personnes qui pensaient devoir avoir honte d’être devenues coiffeurs ont fini par comprendre qu’elles avaient trouvé ce qu’elles étaient venues faire au monde. C’est cela, notre premier succès.</p>',
      },
      {
        type: 'texte',
        sur: 'XII',
        titre: 'Le futur',
        corps: '<p>Brice avait raison. Les beaux jours étaient devant nous.</p><p>Ce qu’il voyait depuis la terrasse, nous le construisons aujourd’hui : une maison qui forme, qui transmet, et qui porte les locks du Bénin vers le monde.</p><p>Mais nous ne partirons pas. Nos racines sont ici : au Bénin, dans la langue fon, dans une famille de quatre garçons, dans une maison d’Akpakpa où tout a commencé. Aller vers le monde sans quitter ses racines, c’est exactement ce qu’une lock sait faire.</p><p>Notre histoire continue dans nos garçons, dans nos mains, et dans chaque personne qui repart de chez nous un peu plus légère.</p>',
      },
      {
        type: 'citation',
        texte: 'Nous avons perdu un enfant. Nous n’avons jamais perdu l’amour. Et tant qu’il y aura une tête à coiffer et un cœur à alléger, Maison MND restera ouverte.',
        qui: 'Brice et Yéman Ahouansou',
      },
      /* CE QUE LE RÉCIT PORTE — 30 septembre 2026. Si la Maison est l’endroit
         où l’on dépose ce que l’on porte, chaque offre en découle. Seules les
         offres qui EXISTENT sont ici ; le Moment, la Couronne à domicile et
         la Cour MND attendent d’exister avant d’être promises. */
      {
        type: 'grille',
        sur: 'Ce que le récit porte',
        titre: 'Chaque offre est une façon de prendre soin, de transformer ou de transmettre.',
        items: [
          { titre: 'Le diagnostic', texte: 'On commence par regarder. C’est la porte d’entrée de tout, et le seul endroit où l’on dit non.', vers: '/mon-parcours/' },
          { titre: 'La réparation', texte: 'Le chapitre des mains. Des locks abîmées que l’on répare, comme nous nous sommes réparés.', vers: '/reparation-locks/' },
          { titre: 'La Première Couronne', texte: 'Une couronne qu’on porte des années. Elle commence par une consultation, jamais par un geste.', vers: '/premiere-couronne/' },
          { titre: 'L’entretien et les soins', texte: 'Revenir. Toutes les cinq semaines, la place est là, et la Maison vous attend.', vers: '/entretien-locks/' },
          { titre: 'MND Kids', texte: 'Les quatre K. Ce n’est pas une ligne de plus : c’est la plus légitime de toutes.', vers: '/mnd-kids/' },
          { titre: 'Offrir la Maison', texte: 'Offrir un moment à quelqu’un qui porte trop.', vers: '/offrir/' },
          { titre: 'Parrainer', texte: 'On ne parraine pas un client. On ramène quelqu’un chez soi.', vers: '/parrainage/' },
          { titre: 'L’Académie', texte: 'La transmission. Former celles et ceux qui feront ce métier sans avoir honte.', vers: '/formations/' },
        ],
      },
      {
        type: 'appel',
        titre: 'Venez déposer ce que vous portez.',
        ligne: 'Tout commence par une consultation, où l’on vous écoute avant de proposer.',
        boutons: [
          { texte: 'Réserver', vers: '/reserver/' },
          { texte: 'Brice et Yéman', vers: '/brice-et-yeman/' },
        ],
      },
    ],
    jsonld: 'maison',
    court: 'Notre histoire',
  },
  {
    chemin: '/formations/',
    titre: 'Formation dreadlocks au Bénin · Maison MND',
    description: "Apprenez le métier de locticienne au Bénin à l'Académie de la Maison MND : parcours pour débutantes et professionnelles, gestes de la Maison, certificat.",
    h1: 'Les formations : apprendre les gestes de la Maison',
    sur: 'Je veux apprendre le métier',
    ligne: "La méthode, les gestes et la tenue d'une maison, transmis par celles et ceux qui les pratiquent chaque jour.",
    image: 'brice.jpg',
    besoin: 'formation',
    /* LA PAGE CONDUIT, ELLE NE CÈDE PAS SA PLACE — 18 septembre 2026.
       « Est-ce que je peux ouvrir l'adresse de la page de formation que nous
       avons construite » (Yéman), en parlant du site Académie. Arbitrage
       rendu au sélecteur : la carte des quatre portes continue de mener ICI,
       et c'est cette page qui conduit à l'Académie. On garde ainsi la page
       indexée et sa fiche de cours déclarée à Google, et la visiteuse lit ce
       que la Maison forme avant d'aller s'inscrire. */
    cta: { texte: 'Voir le programme et s’inscrire', note: 'Le programme, les dates et l’inscription vous attendent à l’Académie.', vers: 'soeur:academie' },
    geste: 'Trois paliers : <b>Fondation</b>, <b>Élévation</b>, <b>Souveraineté</b>.',
    pas: {
      sur: 'Les portes',
      titre: 'Trois entrées',
      liste: true,
      items: [
        ['Débutante', 'Apprendre proprement, du premier geste.'],
        ['Professionnelle', 'Se spécialiser, structurer son activité.'],
        ['Certifiante', 'Le référentiel MND, reconnu par la Maison.'],
      ],
    },
    rassure: 'Nous ne voulons pas seulement faire pour vous. Nous voulons aussi transmettre.',
    faq: [
      ['Puis-je me former sans expérience ?', "Oui. Un parcours s'adresse à celles et ceux qui débutent."],
      ['Je suis déjà coiffeuse. Est-ce pour moi ?', 'Oui. Des parcours courts vous spécialisent selon la méthode MND.'],
      ["Comment se passe l'inscription ?", "Une demande, un rappel de la Maison, puis un entretien d'admission."],
    ],
    jsonld: 'course',
    court: 'Formations',
  },
  {
    chemin: '/journal/',
    titre: 'Le Journal des locks · Maison MND',
    description: 'Lisez les conseils de la Maison MND pour commencer, entretenir, laver, hydrater et réparer vos dreadlocks. Des réponses simples, écrites depuis Cotonou.',
    h1: 'Le Journal',
    sur: 'Le Journal MND',
    ligne: 'Comprendre sa couronne, un conseil à la fois.',
    besoin: 'inconnu',
    sections: [],
    jsonld: 'aucun',
    court: 'Journal',
  },
  {
    chemin: '/faq/',
    titre: 'Questions fréquentes sur les dreadlocks · Maison MND',
    description: 'Trouvez les réponses aux questions posées à la Maison MND : commencer des locks, les laver, les entretenir, les réparer, les enfants, les rendez-vous.',
    h1: "Les questions que l'on nous pose",
    sur: 'Vos questions, nos réponses',
    besoin: 'inconnu',
    sections: [
      {
        type: 'faq',
        items: [
          ['Mes locks ont été créées ailleurs. Puis-je venir chez MND ?', 'Oui, bienvenue quand même. Pour un entretien, réservez directement ; si quelque chose vous inquiète, commencez par une consultation Réparation.'],
          ["J'ai les cheveux fins. Puis-je avoir des locks ?", "Cela dépend de vos cheveux, pas d'une règle générale. La consultation sert justement à voir ce qui est possible et quelle méthode convient."],
          ['À partir de quel âge un enfant peut-il avoir des locks ?', "Il n'y a pas d'âge fixe : cela dépend de l'enfant, de ses cheveux et de son envie. Nous en parlons d'abord avec vous, et l'enfant reste libre de dire non."],
          ['Combien de temps dure une création ?', 'Quelques heures ou une journée entière, selon la méthode, la longueur et la densité de vos cheveux. Vous connaîtrez la durée prévue avec votre devis.'],
          ['Pourquoi les prix sont-ils sur devis ?', 'Parce que deux couronnes ne demandent jamais la même chose. Le devis suit la consultation et vous parvient par écrit avant toute intervention.'],
          ["Comment se passe l'hygiène à la Maison ?", 'Outils désinfectés entre chaque personne, linge propre pour chacune, espace nettoyé chaque jour. Nous en parlons volontiers si vous avez des questions.'],
          ['Quelle méthode utilisez-vous ?', "La méthode MND suit quatre temps : Purifier, Nourrir, Sceller, Couronner. Chaque geste porte un nom en fon : VÈKPÈ™ la création, SÍNSIN™ le resserrage, FÍNFÍN™ la restauration, YÈKPÈ™ la couleur végétale, GBÀTÀ™ le défaisage, DÀNDÀN™ l'hydratation, KLƆKLƆ™ le lavage."],
          ['La consultation est-elle obligatoire ?', 'Pour une création ou une réparation, oui : nous ne faisons pas de geste important sans avoir regardé. Pour un entretien simple, non, vous réservez directement.'],
          ['Que se passe-t-il si je dois annuler ?', 'Prévenez-nous dès que possible, sur WhatsApp ou par téléphone, et nous déplaçons votre rendez-vous. Les délais exacts figurent dans nos conditions de réservation.'],
          ['À quelle fréquence entretenir mes locks ?', "Votre couronne a son propre rythme, selon vos cheveux, votre quotidien et l'âge de vos locks. Nous vous conseillons la fréquence qui lui convient après l'avoir vue."],
          ['Proposez-vous la coloration végétale ?', "Oui, avec YÈKPÈ™, notre couleur végétale, qui demande une couronne saine. Parlez-en lors d'un entretien ou d'une consultation."],
          ['Puis-je me former chez MND ?', "Oui : MND Formation s'adresse à celles et ceux qui débutent comme aux professionnels qui veulent se spécialiser. Écrivez-nous pour connaître les prochaines sessions."],
        ],
      },
      {
        type: 'appel',
        titre: 'Vous hésitez encore ?',
        ligne: 'Écrivez-nous, nous vous répondons simplement.',
        boutons: [
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
          { texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' },
        ],
      },
    ],
    jsonld: 'faq',
    court: 'Vos questions',
  },
  {
    chemin: '/contact/',
    titre: 'Contacter la Maison MND à Cotonou',
    description: 'Écrivez à la Maison MND à Cotonou par WhatsApp ou par le formulaire, et préparez votre visite : où nous trouver, quand venir, comment réserver.',
    h1: 'Nous écrire, nous trouver',
    ligne: 'La Maison vous reçoit à Cotonou. Écrivez sur WhatsApp, appelez, ou venez nous voir pendant les heures d’ouverture.',
    sur: 'Contact',
    besoin: 'inconnu',
    /* TROIS CARTES AVANT TOUT LE RESTE — 21 septembre 2026. La page posait
       deux fois le surtitre « Contact », n'offrait rien de cliquable, et
       taisait ses horaires : le numéro, l'adresse et le courriel dormaient au
       milieu du paragraphe du registre du commerce. L'îlot `joindre` répond
       aux trois questions qu'on vient poser ici, et le générateur le place
       AVANT les sections, juste sous le titre. */
    ilot: 'joindre',
    sections: [
      /* L'APPEL PASSE AVANT LE REGISTRE. Qui arrive ici veut joindre la
         Maison, pas lire son immatriculation : les trois cartes répondent,
         cette bande propose l'heure, et le registre ferme la marche. */
      {
        type: 'appel',
        titre: 'Vous savez déjà ce que vous voulez ?',
        ligne: 'Choisissez votre heure en ligne, sans nous écrire. Vous recevez la confirmation sur WhatsApp.',
        boutons: [
          { texte: 'Prendre rendez-vous', vers: '/reserver/' },
          { texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' },
        ],
      },
      /* QUI SIGNE LA MAISON — 21 septembre 2026. « Maison MND » est le nom
         commercial, « ACIA 1 » le nom au registre : rien ne le disait hors des
         mentions légales, et Meta a refusé deux fois le nom affiché de WhatsApp
         faute de le trouver sur le site. Il se lit désormais là où l'on cherche
         une maison, sa page de contact et sa page de présentation. Le texte vient
         de `COMMUN.editeur`, jamais recopié à la main.

         IL A DESCENDU LA PAGE LE 21 AU SOIR, sans rien perdre de sa lettre :
         il prouve la Maison à Meta et à Google, il ne renseigne pas la
         cliente, et il occupait la place des heures d'ouverture. */
      {
        type: 'texte',
        sur: 'La Maison',
        titre: 'Qui signe ce site',
        corps: `Maison MND est le nom commercial sous lequel exerce ${COMMUN.editeur.nomCommercial}, ${COMMUN.editeur.forme} de ${COMMUN.editeur.exploitante}, immatriculée au registre du commerce et du crédit mobilier de ${COMMUN.editeur.greffe} sous le numéro ${COMMUN.editeur.rccm}. Établissement principal : ${COMMUN.editeur.adresse}. Téléphone et WhatsApp : ${COMMUN.editeur.telephone}. Courriel : ${COMMUN.editeur.email}.`,
      },
    ],
    jsonld: 'maison',
    court: 'Contact',
  },
  {
    /* LES OFFRES DE SAISON — 18 septembre 2026. Une page à deux onglets,
       l'offre en cours et celles qui viennent. Elle ne porte aucun chiffre
       en dur : tout vient de `mnd_offers`, et seules les offres que la Maison
       a activées la remplissent. */
    chemin: '/les-offres/',
    titre: 'Les offres du moment · Maison MND',
    description: 'Les offres de la Maison MND à Cotonou : l’offre en cours et celles qui arrivent, sur les soins, la couleur, les lavages et les reprises de racines.',
    h1: 'Les offres de la Maison',
    sur: 'Les offres',
    besoin: 'inconnu',
    ilot: 'offres',
    sections: [
      {
        type: 'texte',
        corps: 'La Maison marque les saisons. Voici ce qui court en ce moment, et ce qui vient.',
      },
    ],
    jsonld: 'aucun',
    court: 'Les offres',
  },
  /* OFFRIR — 27 septembre 2026, maquette validée. La carte cadeau : trois
     modèles sur les motifs de la Maison, un geste ou un montant, et la
     commande qui arrive au Trône comme une demande. Rien ne se paie en
     ligne ; aucun montant n'est suggéré, la voix du site n'écrit pas de prix. */
  {
    chemin: '/offrir/',
    titre: 'Carte cadeau · Offrir la Maison MND',
    description: 'Offrez un geste de la Maison MND ou un montant de votre choix : la carte cadeau se réserve sur toute prestation, pendant douze mois, à Cotonou.',
    h1: 'Offrez une couronne.',
    sur: 'La carte cadeau',
    ligne: 'Un geste de la Maison, ou un montant de votre choix, remis à qui vous voulez. La personne réserve quand elle veut, sur toute prestation, pendant douze mois.',
    besoin: 'inconnu',
    ilot: 'offrir',
    sections: [
      {
        type: 'pas',
        sur: 'Comment ça se passe',
        titre: 'Trois pas, et la carte arrive.',
        items: [
          ['Vous choisissez', 'Un geste (un entretien, un soin, une Première Couronne) ou un montant. Un prénom, un mot.'],
          ['La Maison vous confirme sur WhatsApp', 'Vous réglez à la Maison ou par mobile money. Rien ne se paie en ligne.'],
          ['La carte arrive', "Sur WhatsApp, ou imprimée à retirer à la Maison. Elle est portée sur le compte de la personne : elle n'a rien à présenter, la Maison sait."],
        ],
      },
      {
        type: 'faq',
        sur: 'Bon à savoir',
        items: [
          ['Combien de temps la carte est-elle valable ?', 'Douze mois à partir du jour où elle est remise, sur toute prestation de la Maison.'],
          ['La personne doit-elle présenter quelque chose ?', "Non. La carte est portée sur son compte à la Maison ; elle donne son prénom, et la Maison sait."],
          ['Peut-on offrir un montant précis ?', "Oui, celui que vous choisissez. Il reste disponible jusqu'à épuisement, sur une ou plusieurs visites."],
        ],
      },
    ],
    jsonld: 'aucun',
    court: 'Offrir',
  },
  {
    /* LE RAPPEL PROMIS EXISTE — 22 septembre 2026. « Me faire rappeler » et
       « Laisser mes coordonnées » menaient au calendrier, qui n'offrait que
       des consultations à choisir : le formulaire de rappel était écrit, mais
       aucune page ne le montait. Celle-ci le porte, et c'est aussi la porte
       des consultations, qui se prennent de vive voix. */
    chemin: '/rappel/',
    titre: 'Être rappelée par la Maison MND · Cotonou',
    description: 'Laissez votre prénom et votre numéro : la Maison MND vous rappelle pendant ses heures d’ouverture, pour fixer votre consultation ou répondre à votre question.',
    h1: 'Vous préférez qu’on vous rappelle ?',
    sur: 'Rappel',
    ligne: 'Un prénom, un numéro. La Maison vous rappelle pendant ses heures d’ouverture. Aucun compte à créer.',
    besoin: 'inconnu',
    ilot: 'demande',
    jsonld: 'aucun',
    court: 'Rappel',
  },
  {
    chemin: '/reserver/',
    titre: 'Réserver une consultation ou un entretien · Maison MND',
    description: 'Réservez votre entretien à la Maison MND à Cotonou en moins de trente secondes : votre venue, votre place, votre numéro. La confirmation arrive sur WhatsApp.',
    h1: 'Réserver',
    sur: 'Réserver',
    besoin: 'inconnu',
    ilot: 'reserver',
    sections: [
      {
        type: 'texte',
        corps: 'Votre venue, votre place, votre numéro. Aucun compte à créer, rien à payer aujourd\u2019hui : c\u2019est réservé, et la confirmation arrive sur WhatsApp.',
      },
    ],
    jsonld: 'aucun',
    court: 'Réserver',
  },
  /* ── LA COMMUNAUTÉ MND — 28 septembre 2026 (maquette validée) ────── */
  {
    chemin: '/parrainage/',
    titre: 'Parrainer une amie · Maison MND',
    description: 'Offrez la Maison MND à une amie : votre code de marraine, son cadeau de bienvenue à sa première visite, et le vôtre quand elle est venue.',
    h1: PARRAINAGE.titre,
    sur: PARRAINAGE.sur,
    ligne: PARRAINAGE.ligne,
    besoin: 'inconnu',
    ilot: 'parrainer',
    sections: [
      {
        type: 'faq',
        sur: 'Bon à savoir',
        items: [
          ['Qui peut être marraine ?', 'Toute personne qui aime la Maison, cliente ou non. Votre numéro vous rend toujours le même code.'],
          ['Qui peut être filleule ?', 'Une personne qui vient à la Maison pour la première fois. Le code ne vaut pas pour une cliente déjà connue, ni pour la marraine elle-même.'],
          ['Quand reçoit-on les cadeaux ?', 'Celui de votre amie l’attend à sa première visite. Le vôtre vous attend dès que sa visite est passée : vous le choisissez dans Ma Couronne ou à l’accueil, un soin offert ou une remise sur un produit.'],
          ['Qu’est-ce que l’écho ?', 'Quand une amie venue grâce à vous fait venir les siennes, vous recevez une petite remise sur un produit. L’arbre s’arrête là : deux générations.'],
          ['Combien d’amies puis-je parrainer ?', 'Autant que vous voulez : un cadeau pour chaque amie venue.'],
        ],
      },
    ],
    jsonld: 'aucun',
    court: 'Parrainage',
  },
  {
    chemin: '/testeuse/',
    titre: 'Devenir testeuse · Maison MND',
    description: 'Essayez les nouveaux soins de la Maison MND avant tout le monde et dites-nous ce que vous en pensez. Inscription en une minute, à Cotonou.',
    h1: 'Devenez testeuse.',
    sur: 'La communauté MND',
    ligne: 'Essayez nos nouveaux soins avant tout le monde, et dites-nous ce que vous en pensez. Votre avis façonne ce que la Maison propose ensuite.',
    besoin: 'inconnu',
    ilot: 'testeuse',
    sections: [
      {
        type: 'pas',
        sur: 'Comment ça se passe',
        titre: 'Trois pas, et votre avis compte.',
        items: [
          ['Vous vous inscrivez', 'Votre prénom, votre numéro, et vos locks en quelques mots.'],
          ['La Maison vous appelle', 'Quand un soin nouveau sort de notre Laboratoire et convient à votre couronne, nous vous le proposons.'],
          ['Vous nous dites tout', 'Ce qui vous a plu, ce qui vous a gênée. Sans détour : c’est pour cela que nous vous le demandons.'],
        ],
      },
    ],
    jsonld: 'aucun',
    court: 'Testeuse',
  },
  {
    chemin: '/engagements/',
    titre: 'Nos engagements · Maison MND',
    description: 'Ce que la Maison MND promet à chaque couronne : des produits éprouvés, une hygiène sans faille, un regard avant chaque geste et la vérité sur le temps.',
    h1: 'Nos engagements.',
    sur: 'La communauté MND',
    ligne: 'Ce que nous promettons à chaque couronne qui passe notre porte.',
    besoin: 'inconnu',
    ilot: 'engagements',
    jsonld: 'aucun',
    court: 'Engagements',
  },
  {
    chemin: '/ingredients/',
    titre: 'Nos ingrédients · Maison MND',
    description: 'Aloès, hibiscus, baobab, karité, neem, moringa : les plantes d’Afrique qui entrent dans les soins de la Maison MND, et l’histoire de chacune.',
    h1: 'Ce qui entre dans nos soins.',
    sur: 'Nos ingrédients',
    ligne: 'Des plantes d’Afrique, choisies une à une, et chacune avec son histoire. Touchez-en une pour la lire.',
    besoin: 'inconnu',
    ilot: 'ingredients',
    jsonld: 'aucun',
    court: 'Ingrédients',
  },
];

export const PAGE_PAR_CHEMIN: Record<string, Page> = Object.fromEntries(PAGES.map((page) => [page.chemin, page]));
