/* ══ LE DEVIS EN DIRECT, CÔTÉ PIÈCE — 22 novembre 2026 ═══════════════════
   Le devis que le maître compose au fauteuil, et que la cliente reçoit sur
   son téléphone. Les règles de calcul sont dans `devis-en-direct-pur.ts` ;
   ici, ce qui vit SUR LA PIÈCE et ce que la page a le droit de lire.

   LA PIÈCE PORTE L'OFFRE, PAS ENCORE LES LIGNES. Trois modèles proposés ne
   sont pas trois lignes de facture : une pièce qui les porterait tous
   vaudrait trois fois le devis. L'offre se range donc dans `devisDuFauteuil`
   (les modèles chiffrés, les options et leur état), et `lines` reste VIDE
   jusqu'à ce qu'elle valide : c'est son choix, et lui seul, qui devient la
   pièce. Une pièce est ainsi toujours une facture vraie de ce qu'elle doit.

   LE TÉLÉPHONE NE COMPOSE RIEN. Il reçoit des modèles déjà chiffrés (le
   Trône les a calculés avec les calibres et le catalogue), choisit, et
   renvoie un identifiant de modèle et des identifiants d'options. La
   fonction vérifie que ces identifiants sont bien dans l'offre, et
   recalcule les lignes : un prix forgé ne sort jamais de la Maison.

   Ce fichier est PUR : le banc `verifie-le-devis-en-direct.mjs` l'éprouve
   sans écran, et la fonction `devis-en-direct` en porte la copie. */
/* LE FICHIER N'IMPORTE RIEN, EXPRÈS : la fonction `devis-en-direct` en porte
   la copie mot pour mot (scripts/devis-en-direct-copie-serveur.mjs), et une
   copie qui emporterait des imports emporterait la moitié du dépôt. Les deux
   constantes du jeton et le libellé de la consultation sont donc recopiés
   ici — et le banc `verifie-le-devis-en-direct` vérifie qu'ils sont
   IDENTIQUES à ceux de `regler-la-seance-pur` et de `devis-remis-pur`. */

/** Les quatorze signes sans ambiguïté de la Maison (ni 0/o, ni 1/l/i). */
const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';
const LONGUEUR_DU_JETON = 14;
const devoileUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

/** Un jeton neuf, tiré de quatorze aléas (crypto.getRandomValues). */
function jetonDe(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON; i++) t += ALPHABET_DU_JETON[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % ALPHABET_DU_JETON.length];
  return t;
}

/** Une ligne lue sur une pièce (la même forme que `LigneLue` de
    `regler-la-seance-pur`). */
type LigneLue = { label?: string; qty?: number; unitXof?: number; discountPct?: number; discountXof?: number };

/** Le libellé de la consultation déduite : celui de `devis-remis-pur`. */
const LIBELLE_DE_LA_CONSULTATION_DEDUITE = 'Consultation privée, déduite';

/** Un jeton de devis : les mêmes quatorze signes sans ambiguïté que le lien
    de règlement — un seul alphabet dans la Maison. */
export const PREFIXE_DU_PARAMETRE_DU_DEVIS = 'd-';

export const parametreDuDevis = (jeton: string): string => `${PREFIXE_DU_PARAMETRE_DU_DEVIS}${jeton}`;

/** Le jeton d'un paramètre « d-… », ou null. */
export function jetonDuParametreDuDevis(tg: unknown): string | null {
  const s = String(tg ?? '');
  if (!s.startsWith(PREFIXE_DU_PARAMETRE_DU_DEVIS)) return null;
  const j = s.slice(PREFIXE_DU_PARAMETRE_DU_DEVIS.length);
  return devoileUnJeton(j) ? j : null;
}

export const jetonDuDevis = (aleas: ArrayLike<number>): string => jetonDe(aleas);

/** LE LIEN DU DEVIS, posé sur la pièce par le maître quand il envoie. */
export type LienDuDevis = {
  jeton: string;
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  valideLe?: string;
  accepteLe?: string;
  placeLe?: string;
  place?: { jour: string; heure: string };
};

/** UN MODÈLE PROPOSÉ : son nom, son prix pour SA tête, sa durée, et le
    conseil de la Maison (un seul modèle conseillé). */
export type ModeleDuDevis = { id: string; nom: string; xof: number; dureeMin?: number; maison?: string; image?: string };
/** UNE OPTION DU CATALOGUE : son prix pour SA longueur, et son état. */
export type OptionDuDevis = { id: string; nom: string; xof: number; etat: 'proposee' | 'incluse'; dureeMin?: number };

export type OffreDuDevis = {
  modeleConseille?: string;
  modeles: ModeleDuDevis[];
  options: OptionDuDevis[];
  /** La longueur et les locks qui ont servi à chiffrer (dits à la cliente). */
  locks?: number;
  calibre?: string;
  longueur?: string;
  /** Le mot du maître, sous le devis. */
  mot?: string;
  /** LES PLACES QUE LA MAISON PROPOSE (22 novembre 2026). Le Trône les lit
      dans son agenda au moment d'envoyer le devis — jours ouverts, heures
      libres, la durée du rituel — et les pose ici. Le téléphone ne choisit
      que parmi elles : il n'invente ni un jour ni une heure. À la
      confirmation, la fonction vérifie que le choix y est encore. */
  places?: { jour: string; heure: string }[];
  /** La consultation déjà réglée, déduite de la pièce (un montant, une fois). */
  deductionXof?: number;
};

export type ChoixDeLaCliente = { modele?: string; options?: string[]; valideLe?: string };

export type DevisLuEnDirect = {
  id: string; kind?: string; status?: string; date?: string;
  clientId?: string; forClientId?: string; clientName?: string; apptId?: string;
  master?: string;
  lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number;
  remisLe?: string;
  auFauteuil?: { le: string; par?: string };
  lienDuDevis?: LienDuDevis;
  devisDuFauteuil?: OffreDuDevis;
  choixDeLaCliente?: ChoixDeLaCliente;
};

/* ── CE QUE LA PAGE PEUT LIRE ───────────────────────────────────────────── */

export type EtatDuDevisEnDirect = 'introuvable' | 'brouillon' | 'devis' | 'valide' | 'accepte' | 'place';

/** L'état de la page, lu sur la marque du lien puis sur la pièce. */
export function etatDuDevisEnDirect(d: DevisLuEnDirect | null): EtatDuDevisEnDirect {
  if (!d) return 'introuvable';
  const l = d.lienDuDevis;
  if (!l) return 'brouillon';
  if (d.status === 'payée' || d.status === 'confirmé') return 'place';
  if (l.place?.jour && l.accepteLe) return 'place';
  if (l.accepteLe || d.status === 'acceptée') return 'accepte';
  /* LES CHOIX ARRÊTÉS NE SE REMODÈLENT PAS (maquette, « valide ») : après son
     « Valider », elle relit et accepte — elle ne choisit plus. */
  if (l.valideLe) return 'valide';
  if (d.status === 'envoyée') return 'devis';
  return 'brouillon';
}

/** Son choix, tel qu'il est valable : un modèle qui est dans l'offre, des
    options qui y sont, et les options « incluses » d'office. Rend `null` si
    le choix ne tient pas (un modèle retiré depuis, par exemple). */
export function choixValable(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined):
  { modele: ModeleDuDevis; options: OptionDuDevis[] } | null {
  if (!o || !o.modeles?.length) return null;
  const m = o.modeles.find((x) => x.id === c?.modele) ?? o.modeles.find((x) => x.id === o.modeleConseille) ?? o.modeles[0];
  if (!m) return null;
  const voulues = new Set(c?.options ?? []);
  const options = (o.options ?? []).filter((x) => x.etat === 'incluse' || voulues.has(x.id));
  return { modele: m, options };
}

/** LA PIÈCE DE SON CHOIX : une ligne pour le modèle, une par option, et la
    consultation déduite à part — elle n'est PAS une ligne (une ligne à zéro
    ne dirait rien), c'est la remise de la pièce (`globalDiscountXof`), une
    seule fois. C'est ce que la fonction écrit au moment du « Valider » : la
    pièce devient vraie à cet instant. */
export function lignesDuChoix(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined, consultationRegleeXof = 0):
  { lignes: LigneDuDevisEcrit[]; deductionXof: number } {
  const v = choixValable(o, c);
  if (!v) return { lignes: [], deductionXof: 0 };
  const lignes: LigneDuDevisEcrit[] = [{ label: v.modele.maison ? `${v.modele.nom} · ${v.modele.maison}` : v.modele.nom, qty: 1, unitXof: Math.max(0, Math.round(v.modele.xof)), discountPct: 0 }];
  for (const x of v.options) {
    lignes.push({ label: x.nom, qty: 1, unitXof: Math.max(0, Math.round(x.xof)), discountPct: x.etat === 'incluse' ? 100 : 0 });
  }
  const brut = lignes.reduce((s, l) => s + l.unitXof * l.qty * (1 - (l.discountPct || 0) / 100), 0);
  const deduite = Math.min(Math.max(0, Math.round(brut)), Math.max(0, Math.round(Number(consultationRegleeXof) || 0)));
  return { lignes, deductionXof: deduite };
}

/** Le libellé de la consultation déduite : celui de `devis-remis-pur`, une
    seule source dans la Maison. */
export const LIBELLE_DE_LA_CONSULTATION = LIBELLE_DE_LA_CONSULTATION_DEDUITE;

/** Une ligne telle qu'elle s'écrit sur la pièce. */
export type LigneDuDevisEcrit = { label: string; qty: number; unitXof: number; discountPct: number; discountXof?: number };

/** LE TOTAL DE L'OFFRE, tel qu'elle le lit avant de valider : le modèle
    qu'elle a choisi (ou le conseillé), plus les options qu'elle a cochées,
    plus celles qu'on lui inclut (comptées, puis offertes), moins la
    consultation déjà réglée. Jamais sous zéro. */
export function totalDeLOffre(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined): number {
  const v = choixValable(o, c);
  if (!v) return 0;
  const brut = Math.round(v.modele.xof) + v.options.reduce((s, x) => s + Math.round(x.xof), 0);
  return Math.max(0, brut - Math.max(0, Math.round(Number(o?.deductionXof) || 0)));
}

/** La durée : le modèle, plus les options qu'elle paie ou qu'on lui inclut. */
export function dureeDeLOffre(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined): number {
  const v = choixValable(o, c);
  if (!v) return 0;
  return Math.max(0, Math.round(Number(v.modele.dureeMin) || 0) + v.options.reduce((s, x) => s + (Number(x.dureeMin) || 0), 0));
}

/** CE QUE LE TÉLÉPHONE REÇOIT, et rien de plus qu'elle : ni nom de famille,
    ni numéro, ni le prix des modèles qu'elle n'a pas choisis. */
export function pageDuDevisEnDirect(o: {
  devis: DevisLuEnDirect | null;
  prenom?: string;
  maintenant: Date;
}) {
  const d = o.devis;
  const etat = etatDuDevisEnDirect(d);
  if (!d || etat === 'introuvable') return { etat: 'introuvable' as const };
  const offre = d.devisDuFauteuil;
  const choix = d.choixDeLaCliente;
  const v = choixValable(offre, choix);
  return {
    etat,
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' ') || String(d.clientName ?? '').trim().split(/\s+/)[0] || '',
    maitre: String(d.master ?? '').trim(),
    /* L'offre telle qu'elle se touche : ses modèles et leurs prix, ses
       options et leur état. Rien d'autre. */
    modeles: (offre?.modeles ?? []).map((m) => ({ id: m.id, nom: m.nom, xof: Math.round(m.xof), dureeMin: Math.round(Number(m.dureeMin) || 0), ...(m.maison ? { maison: m.maison } : {}), ...(offre?.modeleConseille === m.id ? { conseille: true } : {}) })),
    options: (offre?.options ?? []).map((x) => ({ id: x.id, nom: x.nom, xof: Math.round(x.xof), etat: x.etat, dureeMin: Math.round(Number(x.dureeMin) || 0) })),
    ...(offre?.locks ? { locks: Math.round(offre.locks) } : {}),
    ...(offre?.calibre ? { calibre: offre.calibre } : {}),
    ...(offre?.longueur ? { longueur: offre.longueur } : {}),
    ...(offre?.mot ? { mot: offre.mot } : {}),
    ...(choix?.modele ? { choisi: choix.modele } : {}),
    ...(choix?.options ? { prises: choix.options } : {}),
    /* CE QU'ELLE PEUT AJOUTER ELLE-MÊME POUR VOIR SON TOTAL BOUGER : les prix
       reçus, et la déduction. Ce n'est pas un montant qu'elle décide — la
       fonction recalcule tout au « Valider ». */
    deductionXof: Math.max(0, Math.round(Number(offre?.deductionXof) || 0)),
    totalXof: totalDeLOffre(offre, choix),
    dureeMin: dureeDeLOffre(offre, choix),
    ...(v ? { modele: v.modele.id } : {}),
    places: (offre?.places ?? []).map((p) => ({ jour: p.jour, heure: p.heure })),
    ...(d.lienDuDevis?.place ? { place: d.lienDuDevis.place } : {}),
  };
}
