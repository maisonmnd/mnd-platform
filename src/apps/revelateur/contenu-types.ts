/* LE SITE RÉVÉLATEUR : LA FORME DE SON CONTENU — 17 septembre 2026.

   Chaque page publique est décrite ici en données, et `scripts/genere-revelateur.mjs`
   en fait de VRAIES pages HTML à la construction : le contenu est dans le fichier
   dès le chargement (Google le lit), les îlots React ne se montent que dans
   leurs emplacements. Les textes viennent de `docs/site-revelateur/voix-du-site.md`
   (la voix) et de `docs/site-revelateur/plan-seo.md` (titres, descriptions). */

/** Le parcours associé : il choisit le message WhatsApp et pré-remplit le formulaire. */
export type Besoin = 'creation' | 'reparation' | 'entretien' | 'enfant' | 'formation' | 'inconnu';

/** Un lien : un chemin du site (`/premiere-couronne/`), une ancre (`#portes`),
    `whatsapp:<besoin>` qui ouvre WhatsApp avec le message du parcours,
    `message:<besoin>:<texte>` qui ouvre WhatsApp avec CE texte (30 septembre
    2026 : la Couronne à domicile et la Cour ont leur phrase, pas celle du
    parcours), ou `soeur:couronne` / `soeur:academie` vers une sœur sur la
    même origine. */
export type Lien = { texte: string; vers: string };

export type Section =
  | { type: 'texte'; sur?: string; titre?: string; corps: string; image?: string }
  /** `style` : `lignes` (un filet cuivre, du texte), `cartes` (une carte à
      bandeau indigo par item), `portes` (les cartes à photo des parcours,
      la même bande qu'à l'accueil ; chaque `vers` doit désigner une page de
      service). */
  | { type: 'grille'; sur?: string; titre?: string; style?: 'lignes' | 'cartes' | 'portes'; items: { titre: string; texte: string; vers?: string; suite?: string }[] }
  /** La bande sombre des quatre gages de l'accueil, réutilisée telle quelle. */
  | { type: 'confiance' }
  | { type: 'pas'; sur?: string; titre?: string; liste?: boolean; items: [string, string][] }
  | { type: 'faq'; sur?: string; titre?: string; items: [string, string][] }
  | { type: 'citation'; texte: string; qui?: string }
  | { type: 'appel'; titre: string; ligne?: string; boutons: Lien[]; sombre?: boolean }
  /** LE RÉCIT EN RESPIRATIONS — 1er octobre 2026. Chaque ligne est une respiration,
      une ou deux phrases ; `souffle` est une phrase mise à part, `fin` la phrase
      finale en plus grand (un retour à la ligne s'écrit `\n`). */
  | { type: 'recit'; signature: string; chapitres: { id: string; titre: string; lignes: (string | { souffle: string } | { fin: string })[] }[] }
  /* LA MAISON REVISITÉE — 27 septembre 2026, maquette validée. Trois blocs
     de plus, ceux de l'accueil rendus disponibles aux pages libres : les
     piliers (trois titres courts sous un objectif), la gamme (les huit
     maisons de l'univers, chacune avec sa teinte) et le défilé des marques
     (qui lit COMMUN.marques, rien n'est écrit dans la section). */
  | { type: 'piliers'; sur?: string; titre?: string; ligne?: string; items: { titre: string; ligne: string }[] }
  | { type: 'gamme'; sur?: string; titre?: string; ligne?: string; items: { nom: string; ligne: string; teinte: string }[] }
  | { type: 'marques'; sur?: string; titre?: string; ligne?: string };

export type Page = {
  /** Le chemin canonique, avec la barre finale : `/premiere-couronne/`. */
  chemin: string;
  /** Balise titre, 60 caractères au plus. */
  titre: string;
  /** Meta description, 155 caractères au plus, ouverte par un verbe. */
  description: string;
  h1: string;
  sur?: string;
  ligne?: string;
  /** Nom de fichier dans `public/assets/photos/site/` ; absent = tuile indigo. */
  image?: string;
  besoin?: Besoin;
  /** L'appel principal de la page. Sans `vers`, il ouvre WhatsApp avec le
      message du besoin ; avec, il mène où on lui dit, y compris une sœur de
      la Maison (`soeur:academie`). */
  cta?: { texte: string; note?: string; vers?: string };
  /** Une ligne sur le geste (HTML léger : `<b>` seulement) et les quatre temps. */
  geste?: string;
  temps?: boolean;
  pas?: { sur: string; titre: string; liste?: boolean; items: [string, string][] };
  rassure?: string;
  faq?: [string, string][];
  /** Les pages libres se composent de sections, dans l'ordre. */
  sections?: Section[];
  /** Le balisage structuré à poser. */
  jsonld?: 'service' | 'faq' | 'course' | 'maison' | 'aucun';
  /** Le nom court dans le fil d'Ariane et le sitemap. */
  court: string;
  /** L'OUVERTURE PLEIN ÉCRAN : le surtitre, le titre, la ligne, et rien d'autre.
      Elle remplace le fil d'Ariane visible et la tête de page ordinaire. */
  ouverture?: boolean;
  /** UNE OFFRE PARAÎT LE JOUR OÙ ELLE SE RÉSERVE, PAS AVANT — 30 septembre
      2026. Une page qui attend quelque chose (un forfait au catalogue, une
      adresse) est écrite ici mais n'est ni construite ni mise au plan tant
      que ce champ dit pourquoi. On l'efface le jour venu. */
  enAttente?: string;
  /** Un îlot React à monter sur cette page. */
  /** `contact` est la petite carte WhatsApp de la page de réservation ;
      `joindre` les trois cartes de la page contact (écrire, trouver, venir). */
  ilot?: 'triage' | 'demande' | 'contact' | 'joindre' | 'reserver' | 'offres' | 'offrir'
    /* 28 septembre 2026 : la communauté. `engagements` et `ingredients` ne
       montent pas de React, ils se rendent à la construction. */
    | 'parrainer' | 'testeuse' | 'engagements' | 'ingredients';
};

export type Accueil = {
  titre: string;
  description: string;
  devise: { fon: string; sens: string };
  h1: string;
  /* LA BANDE QUI DÉFILE — 28 septembre 2026 : « créer un défilé ou une
     animation sur la phrase au pied de cette page » (Yéman). La phrase du
     premier écran n'est plus une ligne sous l'accroche : ses morceaux
     défilent au pied de l'écran, sur le motif de la Maison, séparés par le
     pictogramme. Le premier écran doit toujours nommer les locks et Cotonou,
     le harnais le lit ici. */
  bande: string[];
  boutons: Lien[];
  /** LE MÉTIER, DIT AU PREMIER ÉCRAN — 22 septembre 2026. Ni « locks » ni
      « dreadlocks » n'apparaissaient avant de faire défiler : il fallait déjà
      savoir que « couronne » veut dire locks. Une ligne au-dessus du titre. */
  /* LES PROMESSES SONT PARTIES LE 27 SEPTEMBRE 2026 (« épure-moi
     complètement le site », maquette validée). À leur place, l'accueil dit
     l'objectif de la Maison, monte le diagnostic, montre l'univers, les
     marques, la carte cadeau et un extrait de la galerie. */
  /** LA TRANSITION VERS LES PORTES — 30 septembre 2026. Après les trois
      piliers, une phrase et un lien disent qu'on va vers les cinq portes :
      « revoir comment faire la transition et savoir qu'on va vers les 5
      portes » (Yéman). */
  objectif: { sur: string; titre: string; ligne: string; piliers: { titre: string; ligne: string }[]; suite?: { ligne: string; bouton: Lien } };
  diagnostic: { sur: string; titre: string; ligne: string; note: string };
  marques: { sur: string; titre: string; ligne: string };
  offrir: { sur: string; titre: string; ligne: string; bouton: Lien };
  galerie: { sur: string; titre: string; images: string[]; bouton: Lien };
  /** La section des offres sur l'accueil : l'îlot `offres` s'y monte. */
  offres: { sur: string; titre: string };
  /** LES COURONNES DE LA MAISON — 23 septembre 2026. Cinq clientes,
      photographiées avec leur accord, au-dessus des avis Google : les visages
      et les mots de leurs semblables prouvent ensemble. Chaque fichier est
      inscrit au registre docs/site-revelateur/photos.md avant d'être servi ;
      le harnais le vérifie. Aucun prénom. */
  /** `ligne` est FACULTATIVE depuis le 26 septembre 2026 : Yéman l'a
      retirée du site. L'accord des clientes n'a pas changé, il reste
      inscrit au registre ; c'est le fait de l'ANNONCER sur la page qui
      s'arrête. Absente, la section ne pose pas de paragraphe vide. */
  /* CINQ PARCOURS, PAS CINQ CARTES — 28 septembre 2026 : « comment montrer
     que ce sont vraiment différents parcours » (Yéman). Chaque porte dit
     POUR QUI elle est (`pour`, la situation de départ) et COMMENT elle se
     passe (`comment`, ses temps, séparés par des points médians). */
  portes: { sur: string; titre: string; ligne?: string; cartes: { titre: string; pour: string; ligne: string; comment: string; suite: string; vers: string; image?: string }[]; repli: string; repliNote?: string; repliBouton: Lien };
  confiance: { sur: string; citation: string; gages: { titre: string; ligne: string }[] };
  fondateurs: { sur: string; titre: string; ligne: string; message: string; legende?: string; trois: string[]; image: string };
  journal: { sur: string; titre: string };
  appel: { titre: string; ligne: string; boutons: Lien[] };
};

/** LA GALERIE — 26 septembre 2026. Une page à elle, où les photos de la
    Maison flottent en profondeur puis s'écartent pour ouvrir la grille.

    `boite` est la constellation du premier écran : DIX fichiers, dans l'ordre
    des dix places que la feuille de style tient prêtes. Moins de dix laisse
    des places vides, plus de dix ne sert à rien : le générateur refuse les
    deux, parce qu'une place vide ne se voit pas à la relecture du contenu.

    `photos` est la grille du dessous. Chaque fichier des deux listes doit être
    inscrit au registre des accords AVANT d'être servi, et le harnais le
    vérifie comme il le fait déjà pour la rangée de l'accueil. */
export type Galerie = {
  titre: string; description: string; sur: string; h1: string; ligne: string;
  boite: string[]; photos: string[];
};

export type Commun = {
  nom: string;
  ville: string;
  /** QUI ÉDITE LE SITE, tel que l'écrit l'extrait du registre du commerce
      (19 septembre 2026). Les mentions légales et la fiche lue par Google le
      disent ; c'est aussi ce qui relie « Maison MND » à son immatriculation
      pour l'examen du nom WhatsApp par Meta. */
  editeur: {
    nomCommercial: string; forme: string; exploitante: string;
    rccm: string; greffe: string; telephone: string; email: string;
    /** L'adresse du registre : les mentions légales et la preuve faite à Meta. */
    adresse: string;
    /** La même, avec le repère, pour qui cherche la porte. */
    adresseComplete: string;
    /** Les parts que lit la fiche Google. */
    rue: string; boitePostale: string;
  };
  /** LES COMPTES DE LA MAISON, 24 septembre 2026 : le pied du site les porte
      et la fiche structurée les relie (`sameAs`), en un seul geste. Un compte
      absent n'est pas écrit : on ne relie jamais une adresse qu'on n'a pas
      lue sous le nom de la Maison. */
  comptes: { instagram?: string; facebook?: string; tiktok?: string; google?: string };
  /** La position de la porte, lue sur Google Maps par Yéman. Sans elle, la
      fiche structurée ne dit pas `geo` : mieux vaut rien qu'un point faux. */
  position?: { latitude: number; longitude: number };
  nav: Lien[];
  /** Les marques que la Maison utilise et vend, dans l'ordre du défilé. `logo`
      est un fichier de public/assets/marques/ ; sans logo, le nom tient la
      place en lettres, et le harnais refuse un logo annoncé qui n'existe pas. */
  marques: { cle: string; nom: string; logo?: string }[];
  pied: { phrase: string; colonnes: { titre: string; liens: Lien[] }[]; legal: Lien[] };
  /** Un message WhatsApp par parcours, déjà écrit. */
  messages: Record<Besoin, string>;
  /** « JE VEUX… » — 28 septembre 2026. « J'aimerais un message plus
      conducteur : je veux entretenir mes locks, une coloration, un détox, un
      soin, réparer ou créer mes locks, et la cliente choisit » (Yéman). Six
      envies, chacune son message WhatsApp déjà écrit et son parcours. */
  envies: { texte: string; message: string; besoin: Besoin }[];
  /** Les libellés du formulaire de rappel (îlot `demande`). */
  formulaire: {
    titre: string; ligne: string;
    prenom: string; numero: string; besoin: string; profil: string; consentement: string; bouton: string;
    besoins: { valeur: Besoin; texte: string }[]; profils: string[];
    erreurNumero: string; merci: { titre: string; texte: string };
    suite: [string, string][];
  };
};
