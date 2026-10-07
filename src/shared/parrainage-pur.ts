/* LE CODE DE MARRAINE, SANS MAGASIN — 28 septembre 2026. Lu par le site
   (qui ne doit jamais charger la synchro du Trône) et par l'écran
   Parrainages ; la fonction Edge `demande-submit` en porte une copie, que
   `verifie-le-parrainage` confronte à celle-ci. */

/** PRENOM-XXX : six lettres du prénom au plus, un tiret, trois signes sans
    ambiguïté (ni O ni 0, ni I ni 1, ni L). */
export const FORME_DU_CODE = /^[A-Z]{1,6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
export const SIGNES_DU_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Le début du code, tiré du prénom : sans accents, lettres seules. */
export function racineDuCode(prenom: string): string {
  const r = prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return r || 'MND';
}

export function codeDeMarraine(prenom: string, hasard: () => number = Math.random): string {
  let fin = '';
  for (let i = 0; i < 3; i++) fin += SIGNES_DU_CODE[Math.floor(hasard() * SIGNES_DU_CODE.length) % SIGNES_DU_CODE.length];
  return `${racineDuCode(prenom)}-${fin}`;
}

/** Le lien que la marraine partage : la page de réservation, code posé. */
export const lienDuParrainage = (site: string, code: string): string =>
  `${site.replace(/\/?$/, '/')}reserver/?code=${encodeURIComponent(code)}`;

/* ── LE LIEN COURT — 7 octobre 2026 ───────────────────────────────────
   « Besoin d'un lien court pour la carte des ambassadrices » (Yéman, au
   sélecteur : `maisonmnd.com/m/?CODE`, dans le QR, écrit sur la carte, dans
   le message de partage et derrière « Copier mon lien »). 24 signes au lieu
   de 37 : le QR de la carte a moins de points. La page /m/ du site
   (`genere-revelateur`) mène à la réservation, code posé ; elle porte une
   copie de FORME_DU_CODE, que `verifie-le-parrainage` confronte à celle-ci.
   Le chemin s'écrit en minuscules : GitHub Pages distingue /m/ de /M/. */
export const lienCourtDuParrainage = (site: string, code: string): string =>
  `${site.replace(/\/?$/, '/')}m/?${encodeURIComponent(code)}`;

/* ── LA CARTE DE MARRAINE DE CHAQUE CLIENTE — 28 septembre 2026 ─────────
   Maquette « La carte de marraine MND » validée. Chaque cliente de la
   Maison a son code, sa carte et ses soins offerts ; ces trois champs vivent
   sur SA fiche (table `clients`), écrits par le Trône seul. La migration
   0110 les réimpose à toute écriture qui ne vient pas du personnel : une
   cliente lit sa carte dans Ma Couronne, elle ne s'offre pas un soin. */

export type ModeleDeCarte = 'indigo' | 'ivoire' | 'cuivre';
export const MODELES_DE_CARTE: readonly ModeleDeCarte[] = ['indigo', 'ivoire', 'cuivre'];

/* ── LES AMBASSADRICES — 28 septembre 2026 (maquette validée, « construits »)
   Chaque cliente est une ambassadrice. Chaque amie venue lui vaut une
   récompense À CHOISIR (un soin offert, ou une remise sur un produit de la
   Gamme) ; les amies de ses amies lui valent un écho ; cinq rangs, un défi du
   mois. Deux générations, jamais d'argent : un programme de fidélité, pas une
   vente pyramidale. */
export type GenreDeRecompense = 'soin' | 'remise' | 'a-choisir';
export type SourceDeRecompense = 'amie' | 'echo' | 'rang' | 'defi' | 'foyer';

export type RangId = 'graine' | 'pousse' | 'tresse' | 'couronne' | 'reine';
export const RANGS: readonly { id: RangId; nom: string; seuil: number }[] = [
  { id: 'graine', nom: 'Graine', seuil: 0 },
  { id: 'pousse', nom: 'Pousse', seuil: 1 },
  { id: 'tresse', nom: 'Tresse', seuil: 3 },
  { id: 'couronne', nom: 'Couronne', seuil: 5 },
  { id: 'reine', nom: 'Reine de la Maison', seuil: 10 },
];
/** Le rang d'une ambassadrice, d'après le nombre d'amies VENUES. */
export const rangDe = (venues: number) => [...RANGS].reverse().find((r) => venues >= r.seuil) ?? RANGS[0];
export const rangSuivant = (venues: number) => RANGS.find((r) => r.seuil > venues);
export const nomDuRang = (id: RangId | undefined): string => RANGS.find((r) => r.id === id)?.nom ?? 'Graine';

/** Le choix de la cliente pour une récompense « à choisir » : écrit par ELLE
    (Ma Couronne) ou à la caisse ; le Trône le reporte sur la récompense. */
export type ChoixDeRecompense = { genre: 'soin' | 'remise'; produitId?: string; le: string };

/** Une récompense de la Maison : un soin offert, une remise sur un produit,
    ou l'un des deux au choix de la cliente. (Le nom `SoinOffert` date de la
    carte de marraine ; le champ `soinsOfferts` de la fiche les porte tous.) */
export type SoinOffert = {
  /** `parr-<id de la demande de la filleule>` : un par amie venue, jamais deux. */
  id: string;
  libelle: string;
  /** La prestation du catalogue que la caisse passe à 100 %. */
  serviceId?: string;
  /** « Pour la venue de Grâce ». */
  raison: string;
  poseLe: string;
  utiliseLe?: string;
  /** Le numéro de la facture qui l'a consommé. */
  piece?: string;
  /** Absent : un soin (les récompenses de la carte de marraine). */
  genre?: GenreDeRecompense;
  /** La remise sur un produit, en pour cent (posée avec la récompense). */
  pct?: number;
  /** Le produit choisi pour la remise, s'il l'a été. */
  produitId?: string;
  source?: SourceDeRecompense;
  /** Au-delà, la récompense s'efface (six mois par défaut). */
  expireLe?: string;
  /** Le remerciement WhatsApp est parti pour elle. */
  merciLe?: string;
};

/** LE GENRE RÉEL d'une récompense : celui qu'elle porte, ou celui que la
    cliente a choisi pour une récompense « à choisir ». */
export function genreEffectif(s: SoinOffert, choix?: Record<string, ChoixDeRecompense>): GenreDeRecompense {
  const g = s.genre ?? 'soin';
  if (g !== 'a-choisir') return g;
  return choix?.[s.id]?.genre ?? 'a-choisir';
}

export type EtatDeLaFilleule = 'sans-rdv' | 'a-venir' | 'venue' | 'annulee';

/** Ce que la cliente voit de ses filleules dans Ma Couronne : un prénom,
    un état, une date. Rien d'autre ne quitte le Trône. */
export type ResumeParrainage = {
  filleules: { prenom: string; etat: EtatDeLaFilleule; date?: string }[];
  /** Les amies de ses amies, venues : l'écho. */
  echos?: { prenom: string; via: string; date?: string }[];
  venues?: number;
  rang?: RangId;
  defi?: { mois: string; objectif: number; fait: number; libelle: string };
};

/** Les récompenses encore à utiliser : ni consommées, ni expirées. */
export const soinsEnAttente = (soins: readonly SoinOffert[] | undefined, aujourdhui: string = new Date().toISOString().slice(0, 10)): SoinOffert[] =>
  (soins ?? []).filter((s) => s && !s.utiliseLe && (!s.expireLe || s.expireLe >= aujourdhui));

/** Le classement du mois, écrit par le Trône dans un document que seules les
    clientes connectées lisent (0111) : un prénom, un rang, des nombres. */
export type LigneDuClassement = { prenom: string; rang: RangId; ceMois: number; amies: number };
export type ClassementAmbassade = { mois: string; lignes: LigneDuClassement[] };

/** Le prénom d'une fiche : la fiche n'a qu'un nom complet. */
export const prenomDuNom = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';
