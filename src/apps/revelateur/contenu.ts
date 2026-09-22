/* LE SITE RÉVÉLATEUR : SON CONTENU, EN DONNÉES. 17 septembre 2026.

   La voix vient de `docs/site-revelateur/voix-du-site.md`, raccourcie de moitié
   au moins (« trop de lecture, synthétise ») ; les balises titre, descriptions,
   H1 et appels à l'action viennent de `docs/site-revelateur/plan-seo.md` ; la
   concision est celle de `public/maquette-le-site-revelateur.html`.
   Un lien WhatsApp s'écrit `whatsapp:<besoin>` ; un chemin du site porte sa
   barre finale ; aucune adresse absolue, aucun prix, aucun témoignage. */

import type { Accueil, Commun, Page } from './contenu-types';

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
  nav: [
    { texte: 'Mon parcours', vers: '/mon-parcours/' },
    { texte: 'Services', vers: '/#portes' },
    /* LA CINQUIEME ENTREE — 18 septembre 2026, demandée par Yéman. Placée
       après Services, là où l'œil se pose, sans déplacer « Mon parcours »
       qui reste la porte d'entrée du site. Sous 860 pixels la barre cache
       tout le menu et ne garde que le bouton de rendez-vous : cette entrée
       ne change donc rien sur téléphone. */
    { texte: 'Les offres', vers: '/les-offres/' },
    { texte: 'La Maison', vers: '/maison-mnd/' },
    { texte: 'Journal', vers: '/journal/' },
  ],
  pied: {
    phrase: 'La Maison MND, Cotonou. Locks créées, réparées, entretenues, depuis 2014.',
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
        ],
      },
      {
        titre: 'La Maison',
        liens: [
          { texte: 'La Maison MND', vers: '/maison-mnd/' },
          { texte: 'Brice et Yéman', vers: '/brice-et-yeman/' },
          { texte: 'Le Journal', vers: '/journal/' },
          { texte: 'Vos questions', vers: '/faq/' },
          { texte: 'Mon parcours', vers: '/mon-parcours/' },
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
  messages: {
    creation: "Bonjour MND, je viens du parcours Première Couronne et je souhaite être accompagnée pour créer mes locks.",
    reparation: "Bonjour MND, je viens du parcours Réparation et je souhaite faire diagnostiquer ma couronne.",
    entretien: "Bonjour MND, je viens du parcours Entretien et je souhaite réserver un rendez-vous pour mes locks.",
    enfant: "Bonjour MND, je viens du parcours MND Kids et je souhaite organiser une visite pour mon enfant.",
    formation: "Bonjour MND, je viens du parcours Formations et je souhaite en savoir plus sur les formations MND.",
    inconnu: "Bonjour MND, je ne sais pas encore quel service choisir et j'aimerais être orientée.",
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
      ['Votre place est retenue', "Le créneau est mis de côté à votre nom, dès l'envoi."],
      ['La Maison confirme', "Un mot sur WhatsApp, pendant les heures d'ouverture."],
      ['Vous venez', 'Votre espace Ma Couronne s’ouvre à votre premier rendez-vous.'],
    ],
  },
};

export const ACCUEIL: Accueil = {
  titre: 'Dreadlocks à Cotonou, soin et création · Maison MND',
  description: 'Découvrez la Maison MND à Cotonou : création, réparation, entretien et soins des dreadlocks afro. Trouvez le parcours qui convient à votre couronne.',
  devise: { fon: 'Mi nyɔ́ ɖɛkpɛ', sens: 'Vous êtes belle.' },
  h1: "Votre couronne mérite d'être comprise, soignée et révélée.",
  ligne: 'Première couronne, réparation, entretien, enfants ou formation : il existe un chemin pour vous, à Cotonou. Nous commençons par vous écouter.',
  boutons: [
    { texte: 'Je découvre mon parcours', vers: '/mon-parcours/' },
    { texte: "Je sais ce qu'il me faut", vers: '#portes' },
  ],
  regle: 'Une création ou une réparation commence par une consultation. Un entretien se réserve directement.',
  metier: 'Locks créées, réparées, entretenues · Cotonou · depuis 2014',
  /* TROIS PROMESSES, TOUTES TENUES PAR LE SITE AUJOURD'HUI, vérifiées dans
     le code avant d'être écrites : la réservation en trois pas sans compte
     (îlot reserver), la confirmation sur WhatsApp (formulaire.suite), rien à
     payer en ligne (/conditions/). On ne promet pas « votre place est tenue »
     ni un délai d'annulation : le site ne les tient pas. */
  promesses: [
    { titre: 'Un entretien se réserve en ligne', ligne: 'En trois pas, sans créer de compte.' },
    { titre: 'La Maison confirme sur WhatsApp', ligne: 'Pendant ses heures d’ouverture.' },
    { titre: 'Rien à payer en ligne', ligne: 'Un acompte, s’il est demandé, vous est dit avant.' },
  ],
  /* LES OFFRES SUR L'ACCUEIL, À LA MANIÈRE DES « DEALS » — 22 septembre 2026.
     Une promesse en grand, un mécanisme en une phrase, un bouton, les
     conditions dépliées dans la carte. Aucun prix en francs : la voix du
     site l'interdit, et c'est ce qui protège le premium. Les offres viennent
     de `mnd_offers`, composées au Trône ; rien n'est écrit ici. */
  offres: {
    sur: 'Les offres de la Maison',
    titre: 'Ce que la Maison vous offre, et à quelles conditions.',
    ligne: 'Aucun prix n’est affiché ici : les montants passent par le devis. Ce qui est écrit est tenu, dans la Maison, au règlement.',
    note: 'Les offres datées portent leur période et disparaissent d’elles-mêmes à leur terme. Les autres disent comment la Maison accueille, pas ce qu’elle solde.',
  },
  portes: {
    sur: 'Cinq parcours, une seule méthode',
    titre: "Vous êtes où aujourd'hui ?",
    cartes: [
      {
        titre: 'Je veux créer ma couronne',
        ligne: "Vous n'avez jamais porté de locks. Nous choisissons la méthode ensemble.",
        suite: 'La Première Couronne',
        vers: '/premiere-couronne/',
        image: 'creation.jpg',
      },
      {
        titre: "Ma couronne a besoin d'attention",
        ligne: "Casse, racines fragiles, locks perdues. Nous regardons d'abord.",
        suite: 'La Réparation',
        vers: '/reparation-locks/',
        image: 'attention.jpg',
      },
      {
        titre: 'Je veux entretenir ma couronne',
        ligne: 'Lavage, resserrage, hydratation, coiffure. Créées ailleurs ? Bienvenue quand même.',
        suite: 'Entretien et soins',
        vers: '/entretien-locks/',
        image: 'entretien.jpg',
      },
      {
        titre: 'Ma couronne grandit avec moi',
        ligne: 'Douceur, patience, et vous à ses côtés.',
        suite: 'MND Kids',
        vers: '/mnd-kids/',
      },
      {
        titre: 'Je veux apprendre le métier',
        ligne: "La méthode, les gestes, la tenue d'un salon.",
        suite: 'MND Formation',
        vers: '/formations/',
        image: 'brice.jpg',
      },
    ],
    repli: 'Vous hésitez ? Trois questions suffisent.',
    repliBouton: { texte: 'Je ne sais pas quel service choisir', vers: '/mon-parcours/' },
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
    sur: 'Derrière MND',
    titre: 'Brice et Yéman Ahouansou',
    ligne: 'Une maison de famille, née en 2014 à Cotonou. Brice, maître loctician, tient les mains. Yéman tient la direction.',
    message: 'Nous ne voulons pas seulement faire pour vous. Nous voulons aussi vous apprendre à comprendre, entretenir, développer et, pour ceux qui le souhaitent, professionnaliser votre propre activité.',
    trois: ['Prendre soin', 'Transformer', 'Transmettre'],
    image: 'fondateurs.jpg',
  },
  journal: { sur: 'Le Journal MND', titre: 'Comprendre sa couronne' },
  appel: {
    titre: "Vous préférez qu'on vous rappelle ?",
    ligne: 'Un prénom, un numéro. Nous vous répondons personnellement.',
    boutons: [
      { texte: 'Laisser mes coordonnées', vers: '/rappel/' },
      { texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' },
    ],
  },
};

export const PAGES: Page[] = [
  {
    chemin: '/mon-parcours/',
    titre: 'Trouver mon parcours locks · Maison MND Cotonou',
    description: 'Répondez à quelques questions et trouvez le parcours qui convient à vos cheveux ou à vos locks : création, réparation, entretien, soins ou enfants.',
    h1: 'Trouver mon parcours',
    sur: 'Mon parcours',
    ligne: 'Trois questions, et la bonne porte.',
    besoin: 'inconnu',
    ilot: 'triage',
    sections: [
      {
        type: 'texte',
        corps: "Il n'y a pas de bonne réponse. Choisissez ce qui vous ressemble aujourd'hui, nous vous montrons la suite.",
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
    court: 'Mon parcours',
  },
  {
    chemin: '/premiere-couronne/',
    titre: 'Création de dreadlocks à Cotonou · Maison MND',
    description: 'Créez vos premières dreadlocks à Cotonou avec la Maison MND : consultation, choix du calibre, création VÈKPÈ™ lock par lock, suivi des premières semaines.',
    h1: 'La première couronne : créer ses dreadlocks à Cotonou',
    sur: 'Je veux créer ma couronne',
    ligne: "Vous n'avez jamais porté de locks ? Vous n'avez pas besoin de tout savoir avant de commencer.",
    image: 'creation.jpg',
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
    image: 'attention.jpg',
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
    titre: 'La Maison MND, salon de locks à Cotonou',
    description: 'Découvrez la Maison MND, maison boutique de soin et de création de dreadlocks afro à Cotonou : ses gestes, sa méthode, son atelier et son Académie.',
    h1: 'La Maison MND, à Cotonou',
    sur: "L'univers MND",
    besoin: 'inconnu',
    sections: [
      {
        type: 'texte',
        corps: "Une maison boutique de soin et de création de dreadlocks afro, à Cotonou. MND n'est pas seulement un salon : c'est une maison à quatre portes, et chacune s'ouvre sur la même méthode.",
        image: 'regard.jpg',
      },
      {
        type: 'grille',
        style: 'cartes',
        sur: 'Les quatre portes',
        titre: 'Une maison à quatre portes',
        items: [
          { titre: 'Ma Couronne', texte: "Votre espace personnel : vos rendez-vous, l'historique de vos soins, votre abonnement.", vers: 'soeur:couronne', suite: 'Ouvrir mon espace' },
          { titre: 'La Maison MND', texte: 'Le lieu, à Cotonou, où vos locks sont créées, réparées et entretenues.', vers: '/contact/', suite: 'Venir à la Maison' },
          { titre: 'Le Trône', texte: "L'atelier intérieur de la Maison, qui organise nos rendez-vous et notre suivi." },
          { titre: 'MND Formation', texte: "L'école de la méthode, du premier geste à la tenue d'un salon.", vers: '/formations/', suite: 'Voir les formations' },
        ],
      },
      {
        type: 'citation',
        texte: 'Tout est relié. Ce que nous faisons à la Maison nourrit ce que nous enseignons. Une seule méthode, quatre portes, la même exigence.',
      },
      { type: 'confiance' },
      {
        type: 'appel',
        titre: "Vous êtes où aujourd'hui ?",
        ligne: 'Il existe un chemin pour vous. Nous commençons par vous écouter.',
        boutons: [
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
          { texte: 'Brice et Yéman', vers: '/brice-et-yeman/' },
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
        corps: 'Une maison de famille, née en 2014 à Cotonou. Brice, maître loctician, tient les mains. Yéman tient la direction. Ensemble, ils ont fait de MND un lieu où l\'on prend soin, où l\'on transforme et où l\'on transmet.',
        image: 'fondateurs.jpg',
      },
      {
        type: 'grille',
        sur: "Quatre manières d'être là",
        items: [
          { titre: 'Praticiens', texte: "Chaque jour, des couronnes passent entre nos mains. C'est là que tout commence." },
          { titre: 'Entrepreneurs', texte: 'Nous avons construit une maison, ses outils, ses règles, ses rythmes.' },
          { titre: 'Formateurs', texte: 'Nous enseignons la méthode MND à celles et ceux qui veulent en faire leur métier.' },
          { titre: 'Accompagnateurs', texte: 'Nous restons présents après le geste : conseils, suivi, écoute.' },
        ],
      },
      {
        type: 'citation',
        texte: 'Nous ne voulons pas seulement faire pour vous. Nous voulons aussi vous apprendre à comprendre, entretenir, développer et, pour ceux qui le souhaitent, professionnaliser votre propre activité.',
        qui: 'Brice et Yéman Ahouansou',
      },
      {
        type: 'appel',
        titre: 'Votre couronne commence ici.',
        ligne: 'Une création débute par une consultation. Rien d\'autre à décider aujourd\'hui.',
        boutons: [
          { texte: 'Réserver ma consultation', vers: 'whatsapp:creation' },
          { texte: 'Trouver mon parcours', vers: '/mon-parcours/' },
        ],
      },
    ],
    jsonld: 'maison',
    court: 'Brice et Yéman',
  },
  {
    chemin: '/formations/',
    titre: 'Formation dreadlocks au Bénin · Maison MND',
    description: "Apprenez le métier de locticienne au Bénin à l'Académie de la Maison MND : parcours pour débutantes et professionnelles, gestes de la Maison, certificat.",
    h1: 'Les formations : apprendre les gestes de la Maison',
    sur: 'Je veux apprendre le métier',
    ligne: "La méthode, les gestes et la tenue d'un salon, transmis par celles et ceux qui la pratiquent chaque jour.",
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
    description: 'Réservez votre consultation ou votre entretien à la Maison MND à Cotonou : choisissez votre parcours et votre créneau, puis confirmez avec la Maison.',
    h1: 'Réserver',
    sur: 'Réserver',
    besoin: 'inconnu',
    ilot: 'reserver',
    sections: [
      {
        type: 'texte',
        corps: 'Choisissez votre geste, votre jour et votre heure. Aucun compte à créer, rien à payer aujourd\u2019hui : la Maison vous confirme.',
      },
    ],
    jsonld: 'aucun',
    court: 'Réserver',
  },
];

export const PAGE_PAR_CHEMIN: Record<string, Page> = Object.fromEntries(PAGES.map((page) => [page.chemin, page]));
