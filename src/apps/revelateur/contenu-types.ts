/* LE SITE RÉVÉLATEUR : LA FORME DE SON CONTENU — 17 septembre 2026.

   Chaque page publique est décrite ici en données, et `scripts/genere-revelateur.mjs`
   en fait de VRAIES pages HTML à la construction : le contenu est dans le fichier
   dès le chargement (Google le lit), les îlots React ne se montent que dans
   leurs emplacements. Les textes viennent de `docs/site-revelateur/voix-du-site.md`
   (la voix) et de `docs/site-revelateur/plan-seo.md` (titres, descriptions). */

/** Le parcours associé : il choisit le message WhatsApp et pré-remplit le formulaire. */
export type Besoin = 'creation' | 'reparation' | 'entretien' | 'enfant' | 'formation' | 'inconnu';

/** Un lien : un chemin du site (`/premiere-couronne/`), une ancre (`#portes`),
    `whatsapp:<besoin>` qui ouvre WhatsApp avec le message du parcours, ou
    `soeur:couronne` / `soeur:academie` vers une sœur sur la même origine. */
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
  | { type: 'appel'; titre: string; ligne?: string; boutons: Lien[] };

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
  /** Un îlot React à monter sur cette page. */
  ilot?: 'triage' | 'demande' | 'contact' | 'reserver' | 'offres';
};

export type Accueil = {
  titre: string;
  description: string;
  devise: { fon: string; sens: string };
  h1: string;
  ligne: string;
  boutons: Lien[];
  regle: string;
  portes: { sur: string; titre: string; cartes: { titre: string; ligne: string; suite: string; vers: string; image?: string }[]; repli: string; repliBouton: Lien };
  confiance: { sur: string; citation: string; gages: { titre: string; ligne: string }[] };
  fondateurs: { sur: string; titre: string; ligne: string; message: string; trois: string[]; image: string };
  journal: { sur: string; titre: string };
  appel: { titre: string; ligne: string; boutons: Lien[] };
};

export type Commun = {
  nom: string;
  ville: string;
  nav: Lien[];
  pied: { phrase: string; colonnes: { titre: string; liens: Lien[] }[]; legal: Lien[] };
  /** Un message WhatsApp par parcours, déjà écrit. */
  messages: Record<Besoin, string>;
  /** Les libellés du formulaire de rappel (îlot `demande`). */
  formulaire: {
    titre: string; ligne: string;
    prenom: string; numero: string; besoin: string; profil: string; consentement: string; bouton: string;
    besoins: { valeur: Besoin; texte: string }[]; profils: string[];
    erreurNumero: string; merci: { titre: string; texte: string };
    suite: [string, string][];
  };
};
