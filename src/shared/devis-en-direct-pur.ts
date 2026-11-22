/* ══ LE DEVIS EN DIRECT — 22 novembre 2026 ═══════════════════════════════
   « Le même système de connexion automatique entre le Trône et les portables
   de nos clients pour faire les devis ou les demandes de modèles de
   coiffures […] des devis instantanés, avec « Valider », « Oui, j'accepte le
   devis », « Oui, je confirme ma place », prendre son rendez-vous et faire
   le paiement en ligne si possible » (Yéman). Maquette jouable
   `FCTFNSr748gq1ecEHxhDMj` (version 2), lot 1 : le devis de la consultation
   en direct, les trois oui, la place. La passation est
   `mnd-passation-sceau-et-devis`.

   CE QUI EST TRANCHÉ PAR ELLE, ET NE SE ROUVRE PAS :
   · en consultation, elle reçoit son devis sur son téléphone : nombre de
     locks, longueur, modèle à choisir, options, suppléments ;
   · les options et les suppléments viennent du CATALOGUE du Trône, jamais
     inventés ;
   · les trois confirmations, à ces mots exacts : « Valider », « Oui,
     j'accepte le devis », « Oui, je confirme ma place » ;
   · elle prend elle-même son rendez-vous, et règle en ligne « si possible » ;
   · une demande par page, jamais deux mêlées.

   CE FICHIER EST PUR (aucun magasin, aucun React) : le banc
   `scripts/verifie-le-devis-en-direct.mjs --prouve` l'éprouve sans écran.
   Les calibres lui sont DONNÉS (ceux de `pricing.ts` à l'écran), jamais
   recalculés ici : une seule table les porte, et elle se règle aux
   Paramètres.

   LE TÉLÉPHONE NE DÉCIDE D'AUCUN MONTANT. Ce module calcule ce que la
   MAISON propose ; la page cliente reçoit des lignes déjà chiffrées, et la
   fonction du devis les recalcule au serveur avant de les lui montrer. Un
   prix qu'elle aurait pu forger ne sort jamais de la Maison. */

/** Le type d'une longueur, celui du catalogue (`LongueurId`), sans importer
    `catalog.ts` — qui porte des magasins. */
export type LongueurDuDevis = 'court' | 'mi-long' | 'long';
export const LONGUEURS_DU_DEVIS: readonly { id: LongueurDuDevis; nom: string; dit: string }[] = [
  { id: 'court', nom: 'Courtes', dit: 'jusqu’aux épaules' },
  { id: 'mi-long', nom: 'Mi-longues', dit: 'des épaules aux omoplates' },
  { id: 'long', nom: 'Longues', dit: 'au-delà des omoplates' },
];
export const rangDeLaLongueur = (id: unknown): number => (id === 'long' ? 2 : id === 'mi-long' ? 1 : 0);

/* ── LE CALIBRE, LU SUR LE NOMBRE DE LOCKS ──────────────────────────────
   La Maison parle en calibres (Jumbo, Medium, Mini…), pas en tranches : le
   maître tape le nombre de locks, le Trône lit le calibre, et le prix du
   modèle suit son coefficient. Les bornes et les coefficients viennent des
   Paramètres (`MODEL_BANDS_SEED` de `pricing.ts`). */
export type BandeLue = { id?: string; name?: string; maxLocks: number | null; coef: number; durCoef: number };
export type CalibreLu = { nom: string; min: number; max: number | null; coef: number; durCoef: number };

export function calibreDuNombreDeLocks(nLocks: unknown, bands: readonly BandeLue[]): CalibreLu | null {
  const locks = Math.floor(Number(nLocks));
  if (!(locks >= 1) || !bands.length) return null;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.maxLocks === null || locks <= b.maxLocks) {
      const min = i === 0 ? 1 : Number(bands[i - 1].maxLocks ?? 0) + 1;
      return { nom: String(b.name ?? '').trim() || `Calibre ${i + 1}`, min, max: b.maxLocks, coef: Number(b.coef) || 1, durCoef: Number(b.durCoef) || 1 };
    }
  }
  return null;
}

/** « Medium · 81 à 150 locks », « Galaxy · 551 locks et plus ». */
export const calibreDit = (c: CalibreLu | null): string =>
  !c ? '' : c.max === null ? `${c.nom} · ${c.min} locks et plus` : `${c.nom} · ${c.min} à ${c.max} locks`;

/* ── LES PRIX ───────────────────────────────────────────────────────────── */
/** Le prix d'un modèle se dit au demi-millier, jamais au franc près : la
    Maison ne vend pas 26 437 F. */
export const ARRONDI_DU_DEVIS_XOF = 500;
export const arrondiDuDevis = (x: number): number => Math.round((Number(x) || 0) / ARRONDI_DU_DEVIS_XOF) * ARRONDI_DU_DEVIS_XOF;

/** Le prix d'un modèle de consultation : sa base × le coefficient du calibre. */
export const prixDuModele = (baseXof: number, coef: number): number => arrondiDuDevis((Number(baseXof) || 0) * (Number(coef) || 1));

/** Sa durée : celle du catalogue, allongée par le calibre (au quart d'heure). */
export const dureeDuModele = (minutes: number, durCoef: number): number =>
  Math.max(0, Math.round(((Number(minutes) || 0) * (Number(durCoef) || 1)) / 15) * 15);

/** La durée dite : « 3 h 30 », « 45 min ». */
export function dureeDite(minutes: number): string {
  const t = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(t / 60); const m = t % 60;
  if (!h) return m ? `${m} min` : '—';
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Le prix d'une option du catalogue, pour SA longueur. Une option qu'il ne
    vend pas à cette longueur ne se propose pas. */
export function prixDeLOption(prix: number | readonly number[] | undefined, longueur: LongueurDuDevis): number | null {
  if (prix === undefined || prix === null) return null;
  if (Array.isArray(prix)) {
    const v = prix[rangDeLaLongueur(longueur)];
    return v === undefined ? null : Math.round(Number(v) || 0);
  }
  return Math.round(Number(prix) || 0);
}

/* ── LES LIGNES ET LE TOTAL ─────────────────────────────────────────────── */
export type LigneDuDevisEnDirect = {
  /** Le libellé que la cliente lit, tel qu'il partira sur la pièce. */
  label: string;
  xof: number;
  /** Une ligne de la Maison (le modèle), une option qu'elle a cochée, un
      supplément qu'on lui inclut, la consultation déduite. */
  genre: 'modele' | 'option' | 'supplement' | 'consultation';
};

/** La consultation déjà réglée se déduit UNE fois, et seulement si elle a
    été payée. C'est une ligne négative, dite « déduite ». */
export function ligneDeLaConsultationDejaReglee(paidXof: number, label: string): LigneDuDevisEnDirect | null {
  const x = Math.round(Number(paidXof) || 0);
  return x > 0 ? { label, xof: -x, genre: 'consultation' } : null;
}

/** Le total : jamais sous zéro. */
export const totalDuDevis = (lignes: readonly LigneDuDevisEnDirect[]): number =>
  Math.max(0, lignes.reduce((s, l) => s + (Math.round(Number(l.xof) || 0)), 0));

/** L'acompte : le taux réglé au Trône (`depositPctFor`, 30 % par défaut). */
export const acompteDuDevisEnDirect = (totalXof: number, pct: number): number =>
  Math.max(0, Math.round((Math.max(0, Math.round(Number(totalXof) || 0)) * Math.max(0, Math.min(100, Number(pct) || 0))) / 100));

/* ── LES TROIS OUI ────────────────────────────────────────────────────────
   « Trois confirmations, à ces mots exacts » (Yéman). Un seul geste par
   page : le devis, puis « Valider » ; la relecture, puis « Oui, j'accepte le
   devis » ; le calendrier, puis « Oui, je confirme ma place ». */
export type EtapeDuDevisEnDirect = 'devis' | 'valide' | 'accepte' | 'place' | 'scelle';
export const ETAPES_DU_DEVIS_EN_DIRECT: readonly EtapeDuDevisEnDirect[] = ['devis', 'valide', 'accepte', 'place', 'scelle'];

export type GesteDuDevisEnDirect = 'valider' | 'accepter' | 'confirmer';

export const LES_TROIS_OUI: Record<GesteDuDevisEnDirect, string> = {
  valider: 'Valider',
  accepter: 'Oui, j’accepte le devis',
  confirmer: 'Oui, je confirme ma place',
};

/** Ce que le geste fait à l'état, et ce qu'il exige. Le geste d'une étape
    passée ne se rejoue pas : une page rouverte ne reclique pas deux fois. */
export function apresLeGeste(etape: EtapeDuDevisEnDirect, geste: GesteDuDevisEnDirect): EtapeDuDevisEnDirect | null {
  if (etape === 'devis' && geste === 'valider') return 'valide';
  if (etape === 'valide' && geste === 'accepter') return 'accepte';
  if (etape === 'accepte' && geste === 'confirmer') return 'place';
  return null;
}

/** Le geste que la page attend, à cette étape — et rien après « place ». */
export const gesteAttendu = (etape: EtapeDuDevisEnDirect): GesteDuDevisEnDirect | null =>
  etape === 'devis' ? 'valider' : etape === 'valide' ? 'accepter' : etape === 'accepte' ? 'confirmer' : null;

/** L'étape où il en est, à partir de l'état de la pièce au Trône. La pièce
    (`Invoice`) garde ses états ; ce module ne les réécrit pas. */
export function etapeDeLaPiece(status: string | undefined, aSaPlace: boolean, payee: boolean): EtapeDuDevisEnDirect {
  if (payee) return 'scelle';
  if (aSaPlace || status === 'confirmé') return 'place';
  if (status === 'acceptée') return 'accepte';
  if (status === 'envoyée') return 'valide';
  return 'devis';
}

/* ── LA PLACE ───────────────────────────────────────────────────────────── */
/** Une place est TENUE dès qu'elle est choisie, et CONFIRMÉE quand l'argent
    est arrivé (ou qu'elle a dit qu'elle réglerait à l'accueil : le Trône le
    pose). Sans acompte, elle se libère — au bout de combien de temps, c'est
    une question posée à Yéman, pas une règle de ce fichier. */
export type EtatDeLaPlace = 'tenue' | 'confirmee' | 'liberee';
export const placeDite = (e: EtatDeLaPlace): string =>
  e === 'confirmee' ? 'confirmée' : e === 'liberee' ? 'libérée' : 'tenue';

/** Ce que la Maison dit d'un devis qui part : ses trois mots, et la phrase
    qui les annonce. */
export function motDUneEtape(etape: EtapeDuDevisEnDirect): string {
  if (etape === 'devis') return 'Voici votre devis. Lisez-le, et validez ce qui vous plaît.';
  if (etape === 'valide') return 'Vos choix sont arrêtés. Il reste à accepter le devis.';
  if (etape === 'accepte') return 'Choisissez votre place : la Maison vous y attend.';
  if (etape === 'place') return 'Votre place est tenue. L’acompte la confirme.';
  return 'Merci.';
}

/** LES SALUTATIONS DU DERNIER ÉCRAN — « Merci. », signé « Maison MND ». */
export const MERCI_DU_DEVIS = 'Merci.';
export const SIGNATURE_DU_DEVIS = 'Maison MND';
