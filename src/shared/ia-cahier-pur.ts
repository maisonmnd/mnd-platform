/* ══ LE CAHIER PAPIER RATTRAPÉ — 19 octobre 2026 ═════════════════════════
   Maquette NKQMiMMY… validée (« Tout me va »), chantier « cahier » des huit :
   « Carnet › "Rattraper un cahier" : vous photographiez une page, Claude lit
   chaque ligne (date de la page, puis par ligne : cliente, rituel, argent,
   moyen, avance/reste) et la compare à ce que le Trône sait déjà. Ce qui y
   est déjà ne se double pas ; le reste s'inscrit d'un geste, avec les
   avances et les restes dus. Tout part dans "Années passées", daté du jour
   de la page. Aucun message ne part. Une page de 2026 d'avant octobre
   s'inscrit à sa date, sans toucher les caisses du mois. »
   Cliente inconnue : « Me la montrer : créer sa fiche, la rattacher à une
   fiche existante (un surnom, une faute), ou l'inscrire "de passage". »

   CLAUDE LIT LA PAGE, LE TRÔNE RAPPROCHE. La consigne ne porte aucune liste
   de clientes : il lit ce qui est écrit, c'est tout. Prénom, rituel, argent
   et moyen reviennent ici, et c'est le Trône, qui seul a les fiches, qui
   reconnaît la cliente (accents, surnoms, initiales, une lettre de travers)
   et ce qui est déjà au carnet (même cliente, même jour à un jour près,
   même argent).

   ON NE FAIT PAS CONFIANCE À LA SORTIE : `lectureDeLaPage` revalide tout
   (montants entiers bornés, date ISO plausible et jamais future, listes
   bornées, moyen dans une liste fermée). Ce qui ne tient pas tombe, et
   l'écran dit ce qui est tombé.

   LA CAISSE SE DÉDUIT DE LA DATE DE LA PAGE, par la règle du 17 octobre
   (`caisses-des-caissiers-pur`) : une année antérieure → « Années passées » ;
   une page de 2026 d'avant octobre → une caisse d'avant la bascule (l'archive
   si elle existe, sinon une ancienne), jamais une pièce du mois ni la caisse
   d'un caissier ; une page d'octobre 2026 ou après se REFUSE : ce mois-là se
   compte au comptoir, le cahier n'y a plus sa place. C'est aussi ce qui tient
   la promesse « aucun message ne part » : un rituel daté d'avant hier ne
   réveille ni reçu, ni avis, ni relance (la date du rituel juge, mémoire
   « retard invisible aux clientes »).

   RIEN NE S'ÉCRIT ICI : ce module calcule, l'écran inscrit après
   « Inscrire N lignes ». Éprouvé par `scripts/verifie-le-cahier-rattrape`. */

import type { Appointment, ApptPayment } from './agenda';
import type { Client } from './clients';
import type { Cashbox } from './finance';
import { CAISSE_ANNEES_PASSEES, anneeDe, caisseDesAnneesPassees, estAnneeAnterieure } from './caisses-des-caissiers-pur';
import { ARCHIVE, JOUR_DE_DEPART } from './bascule-des-caisses-pur';

/* ── LES BORNES ─────────────────────────────────────────────────────────── */
/** Une page de cahier tient rarement plus de trente lignes ; au-delà de
    soixante, Claude a lu deux pages ou s'est emballé. */
export const LIGNES_MAX_PAR_PAGE = 60;
/** Aucun rituel de la Maison n'a jamais coûté cela : au-dessus, le chiffre
    est mal lu (un 0 de trop, un numéro de téléphone pris pour un montant). */
export const MONTANT_MAX_XOF = 5_000_000;
/** Un prénom, un rituel, une mention : courts. */
export const SIGNES_MAX = 80;
/** La Maison n'a pas de cahier d'avant ce siècle. */
export const PREMIERE_DATE_DU_CAHIER = '2000-01-01';
/** Un rendez-vous déjà au Trône compte « le même » à un jour près : le
    cahier date parfois du soir, le Trône du lendemain matin. */
export const JOURS_DE_TOLERANCE = 1;
/** Le maître d'un rituel repris d'un cahier : inconnu, c'est la Maison. */
export const MAITRE_DU_CAHIER = 'Maison';
/** L'heure posée sur chaque rituel repris : le cahier ne la dit pas. */
export const HEURE_DU_CAHIER = '10:00';
/** Le segment d'une fiche créée depuis le cahier : le même que les fiches
    nées d'une demande du site (`SEGMENT_PROSPECT`, shared/demandes). Écrit
    ici pour que le module reste sans magasin ; le banc tient les deux égaux. */
export const SEGMENT_DE_LA_FICHE_NEUVE = 'Prospect';

/* ── LE MOYEN, UNE LISTE FERMÉE ─────────────────────────────────────────── */
export const MOYENS_DU_CAHIER = ['especes', 'momo', 'carte', 'virement', 'cheque', 'inconnu'] as const;
export type MoyenDuCahier = (typeof MOYENS_DU_CAHIER)[number];
/** Le moyen de règlement du Trône pour chaque moyen lu (les noms de SA liste,
    Paramètres). Un moyen non lu s'inscrit « Espèces », et la note le dit :
    au cahier, ce qui n'est pas écrit est presque toujours du liquide. */
export const METHODE_DU_MOYEN: Record<MoyenDuCahier, string> = {
  especes: 'Espèces', momo: 'MTN MoMo', carte: 'Carte', virement: 'Virement bancaire', cheque: 'Chèque', inconnu: 'Espèces',
};
export const MOYEN_DIT: Record<MoyenDuCahier, string> = {
  especes: 'Espèces', momo: 'MoMo', carte: 'Carte', virement: 'Virement', cheque: 'Chèque', inconnu: 'à préciser',
};

/* ── LA CONSIGNE ────────────────────────────────────────────────────────── */
/** Ce que Claude lit, et comment il le rend. Aucune cliente nommée : il ne
    connaît personne, il lit la page. `aujourdhui` borne la date. */
export function consigneDuCahier(o: { aujourdhui: string }): string {
  return [
    'Tu lis la photo d’UNE page de cahier manuscrite : le registre d’une maison de soins des locks à Cotonou (Bénin).',
    'La page est écrite en français, souvent vite, avec des prénoms béninois et français (Ola, Naffi, Adjaratou, Clarisse, Sèna…) et les abréviations du métier et de l’argent.',
    'Tu ne connais aucune cliente de cette maison : tu lis ce qui est écrit, c’est tout. Le rapprochement avec les fiches se fait ailleurs.',
    '',
    'CE QUE TU RENDS : la date de la page, puis une ligne par venue écrite.',
    `LA DATE DE LA PAGE, en ISO AAAA-MM-JJ, AVEC L’ANNÉE. Si la page ne dit pas l’année, déduis-la des indices (un en-tête, le jour de la semaine écrit à côté) ; si rien ne permet de la connaître, laisse la date vide plutôt que d’inventer. Une date après aujourd’hui (${o.aujourdhui}) est forcément mal lue : laisse-la vide.`,
    '',
    'CHAQUE LIGNE :',
    '· prenom : tel qu’écrit, sans corriger l’orthographe ;',
    '· nom : si la page le donne (un nom, ou une initiale comme « D. »), sinon rien ;',
    '· mention : ce qui précise la personne (« la sœur de Naffi », « Mme », un surnom), sinon rien ;',
    '· rituel : ce qui a été fait, tel qu’écrit : « retwist », « départ micro », « resserrage », « soin », « shampoing », « défaisage », « couleur »… ;',
    '· montant : l’argent REÇU ce jour-là, en francs CFA, nombre entier (« 15 000 », « 15k », « 15.000 » valent 15000 ; rien d’écrit vaut 0) ;',
    '· moyen : especes, momo, carte, virement, cheque ou inconnu (« esp. », « cash », « liquide » = especes ; « momo », « MTN », « mobile money », « MoMoPay » = momo ; rien d’écrit = inconnu) ;',
    '· avance : vrai si la page dit acompte, avance, « a payé une partie », « reste » ;',
    '· total : le prix du rituel quand la page le distingue de ce qui a été reçu (« 25 000, reste 10 000 » donne montant 15000 et total 25000), sinon rien ;',
    '· note : ce que la page ajoute (« reste 10 000 », « offert », « a payé pour sa fille », « illisible »).',
    '',
    'RÈGLES : tu n’inventes rien ; un chiffre illisible vaut 0 et la note dit « illisible » ; une ligne barrée est ignorée ; une ligne sans prénom est ignorée ; tu ne regroupes jamais deux venues en une ; tu ne déduis pas un moyen qui n’est pas écrit ; aucune ligne qui ne soit pas sur la page. Si la page porte deux dates, rends la première et dis-le dans la remarque.',
  ].join('\n');
}

/** La forme attendue, donnée à la fonction comme un outil à appeler. */
export const SCHEMA_DE_LA_PAGE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'lignes'],
  properties: {
    date: { type: 'string', description: 'La date de la page, AAAA-MM-JJ avec l’année ; chaîne vide si inconnue.' },
    lignes: {
      type: 'array',
      maxItems: LIGNES_MAX_PAR_PAGE,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prenom', 'rituel', 'montant', 'moyen'],
        properties: {
          prenom: { type: 'string' },
          nom: { type: 'string' },
          mention: { type: 'string' },
          rituel: { type: 'string' },
          montant: { type: 'integer', minimum: 0 },
          moyen: { type: 'string', enum: [...MOYENS_DU_CAHIER] },
          avance: { type: 'boolean' },
          total: { type: 'integer', minimum: 0 },
          note: { type: 'string' },
        },
      },
    },
    remarque: { type: 'string', description: 'Ce que la page a de particulier : illisible, deux dates, page barrée.' },
  },
};

/* ── LA LECTURE, REVALIDÉE ──────────────────────────────────────────────── */
export type LigneLue = {
  prenom: string;
  nom?: string;
  mention?: string;
  rituel: string;
  /** L'argent reçu ce jour-là, entier ≥ 0. */
  montant: number;
  moyen: MoyenDuCahier;
  /** La page dit une avance, ou donne un total au-dessus du reçu. */
  avance: boolean;
  /** Le prix du rituel quand il dépasse ce qui a été reçu ; absent sinon. */
  total?: number;
  note?: string;
};
export type PageLue = {
  /** La date de la page ; `null` quand elle n'est pas lue ou pas plausible :
      l'écran la demande à la main. */
  date: string | null;
  lignes: LigneLue[];
  /** Ce qui est tombé, en clair : une ligne sans prénom, un montant abîmé… */
  defauts: string[];
  remarque?: string;
};

const texte = (v: unknown, max = SIGNES_MAX): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Un entier de francs, ou `null` : « 15 000 » et « 15.000 » passent, 12,5,
    −5, « abc » et 1 000 000 000 non. */
export const entierDeFrancs = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v
    : (typeof v === 'string' && /^\s*\d[\d\s.]*\s*$/.test(v) ? Number(v.replace(/[\s.]/g, '')) : NaN);
  return Number.isInteger(n) && n >= 0 && n <= MONTANT_MAX_XOF ? n : null;
};

/** Un jour ISO qui existe, de ce siècle, et pas après aujourd'hui. */
export const jourPlausible = (iso: string, aujourdhui: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return false;
  return iso >= PREMIERE_DATE_DU_CAHIER && iso <= aujourdhui;
};

/** CE QUE CLAUDE A RENDU, PASSÉ AU TAMIS. `null` quand ce n'est pas une page
    du tout ; sinon la page, avec ses lignes bonnes et la liste de ce qui est
    tombé. Une date future ou illisible devient `null` (l'écran la demande),
    un moyen hors liste devient « inconnu », une ligne au montant abîmé tombe. */
export function lectureDeLaPage(brut: unknown, aujourdhui: string): PageLue | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;
  if (!Array.isArray(o.lignes)) return null;
  const defauts: string[] = [];

  const dateBrute = texte(o.date, 10);
  let date: string | null = null;
  if (!dateBrute) defauts.push('la date de la page n’a pas été lue');
  else if (jourPlausible(dateBrute, aujourdhui)) date = dateBrute;
  else defauts.push(dateBrute > aujourdhui ? `date future refusée (${dateBrute})` : `date illisible (${dateBrute})`);

  const brutes = o.lignes as unknown[];
  if (brutes.length > LIGNES_MAX_PAR_PAGE) defauts.push(`${brutes.length - LIGNES_MAX_PAR_PAGE} ligne(s) au-delà de ${LIGNES_MAX_PAR_PAGE} ignorée(s)`);
  const lignes: LigneLue[] = [];
  brutes.slice(0, LIGNES_MAX_PAR_PAGE).forEach((l, i) => {
    const n = i + 1;
    if (!l || typeof l !== 'object' || Array.isArray(l)) { defauts.push(`ligne ${n} illisible`); return; }
    const r = l as Record<string, unknown>;
    const prenom = texte(r.prenom);
    if (!prenom) { defauts.push(`ligne ${n} sans prénom, ignorée`); return; }
    const montant = entierDeFrancs(r.montant);
    if (montant === null) { defauts.push(`ligne ${n} (${prenom}) : montant abîmé, ignorée`); return; }
    let total: number | undefined;
    if (r.total !== undefined && r.total !== null && r.total !== '') {
      const t = entierDeFrancs(r.total);
      if (t === null) { defauts.push(`ligne ${n} (${prenom}) : total abîmé, ignorée`); return; }
      if (t > montant) total = t;
      else if (t < montant) defauts.push(`ligne ${n} (${prenom}) : total ${t} sous le reçu ${montant}, total ignoré`);
    }
    const moyenBrut = texte(r.moyen, 20).toLowerCase();
    const moyen: MoyenDuCahier = (MOYENS_DU_CAHIER as readonly string[]).includes(moyenBrut) ? (moyenBrut as MoyenDuCahier) : 'inconnu';
    if (moyen === 'inconnu' && moyenBrut && moyenBrut !== 'inconnu') defauts.push(`ligne ${n} (${prenom}) : moyen « ${moyenBrut} » non reconnu, à préciser`);
    const nom = texte(r.nom) || undefined;
    const mention = texte(r.mention) || undefined;
    const note = texte(r.note, 160) || undefined;
    lignes.push({
      prenom,
      ...(nom ? { nom } : {}),
      ...(mention ? { mention } : {}),
      rituel: texte(r.rituel) || 'rituel non lu',
      montant,
      moyen,
      avance: r.avance === true || total !== undefined,
      ...(total !== undefined ? { total } : {}),
      ...(note ? { note } : {}),
    });
  });
  const remarque = texte(o.remarque, 200);
  return { date, lignes, defauts, ...(remarque ? { remarque } : {}) };
}

/* ── RECONNAÎTRE LA CLIENTE ─────────────────────────────────────────────── */
/** Ce que le rapprochement sait d'une fiche. `aussiDit` : ses autres noms
    (un surnom, une graphie), retenus quand la Maison rattache une ligne. */
export type FicheConnue = { id: string; name: string; aussiDit?: readonly string[]; archived?: boolean };

/** Les lettres du fon qui ne se décomposent pas, ramenées à l'alphabet latin :
    « KLƆKLƆ » se lit « kloklo » au cahier. */
const FON: Record<string, string> = { ɔ: 'o', ɛ: 'e', ɖ: 'd', ɣ: 'g', ŋ: 'n' };
/** Un texte à plat : sans accent, sans casse, sans ponctuation, un seul blanc. */
export const plat = (s: string): string => String(s ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[ɔɛɖɣŋ]/g, (c) => FON[c] ?? c)
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const mots = (s: string): string[] => plat(s).split(' ').filter(Boolean);

/** La distance d'édition, bornée : une lettre de travers, pas plus. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export type CommentReconnue = 'exact' | 'surnom' | 'initiale' | 'prenom' | 'proche';
export type Reconnaissance = {
  /** La fiche reconnue, quand une seule répond. */
  fiche?: FicheConnue;
  comment?: CommentReconnue;
  /** Celles qui répondaient : une seule (la fiche), plusieurs (on ne choisit
      pas à la place de la Maison), aucune. */
  candidats: FicheConnue[];
};

/** QUI EST-CE ? Dans l'ordre du plus sûr au moins sûr : le nom entier (dans
    les deux ordres), un surnom retenu, « Awa D. » pour « Awa Dossou », le
    prénom seul quand la page ne donne pas de nom, puis une lettre de travers
    (prénom de cinq lettres au moins). Deux fiches qui répondent : aucune n'est
    choisie, les deux sont proposées. */
export function trouveLaCliente(l: Pick<LigneLue, 'prenom' | 'nom' | 'mention'>, fiches: readonly FicheConnue[]): Reconnaissance {
  const vivantes = fiches.filter((f) => !f.archived && plat(f.name));
  const prenom = plat(l.prenom);
  const nom = plat(l.nom ?? '');
  if (!prenom) return { candidats: [] };
  const complet = nom ? `${prenom} ${nom}` : prenom;
  const inverse = nom ? `${nom} ${prenom}` : prenom;
  const rend = (liste: FicheConnue[], comment: CommentReconnue): Reconnaissance | null => (
    liste.length === 1 ? { fiche: liste[0], comment, candidats: liste }
      : liste.length > 1 ? { candidats: liste } : null);

  const exacts = vivantes.filter((f) => { const n = plat(f.name); return n === complet || n === inverse; });
  const r1 = rend(exacts, 'exact'); if (r1) return r1;

  const dits = [prenom, complet, plat(l.mention ?? '')].filter(Boolean);
  const surnoms = vivantes.filter((f) => (f.aussiDit ?? []).some((d) => dits.includes(plat(d))));
  const r2 = rend(surnoms, 'surnom'); if (r2) return r2;

  if (/^\p{L}$/u.test(nom)) {
    const parInitiale = vivantes.filter((f) => { const m = mots(f.name); return m[0] === prenom && m.slice(1).some((x) => x.startsWith(nom)); });
    const r3 = rend(parInitiale, 'initiale'); if (r3) return r3;
  }

  if (!nom) {
    const parPrenom = vivantes.filter((f) => mots(f.name).includes(prenom));
    const r4 = rend(parPrenom, 'prenom'); if (r4) return r4;
  } else {
    const nomProche = vivantes.filter((f) => { const m = mots(f.name); return m.includes(prenom) && m.some((x) => x.length >= 3 && distance(x, nom) <= 1); });
    const r5 = rend(nomProche, 'proche'); if (r5) return r5;
  }

  if (prenom.length >= 5) {
    const proches = vivantes.filter((f) => mots(f.name).some((x) => x.length >= 5 && distance(x, prenom) <= 1));
    const r6 = rend(proches, 'proche'); if (r6) return r6;
  }
  return { candidats: [] };
}

/** Le nom lu sur la page, entier : « Awa Dossou », ou « Awa » seul. */
export const nomLu = (l: Pick<LigneLue, 'prenom' | 'nom'>): string => [l.prenom, l.nom].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/** LA FICHE RETIENT CE NOM-LÀ. Quand la Maison rattache « Steph » à Stéphanie,
    la page suivante la reconnaîtra seule. Le nom de la fiche et un surnom déjà
    retenu ne s'ajoutent pas. */
export function ficheAvecLeSurnom<C extends { name: string; aussiDit?: string[] }>(c: C, dit: string): C {
  const d = dit.replace(/\s+/g, ' ').trim();
  if (!d || plat(d) === plat(c.name) || (c.aussiDit ?? []).some((x) => plat(x) === plat(d))) return c;
  return { ...c, aussiDit: [...(c.aussiDit ?? []), d] };
}

/* ── CE QUI EST DÉJÀ AU TRÔNE ───────────────────────────────────────────── */
export type RendezVousConnu = {
  id: string;
  clientId: string;
  date: string;
  status?: string;
  priceXof?: number;
  paidXof?: number;
  payments?: readonly { amountXof: number; date?: string }[];
};

/** Des jours entre deux dates ISO, en valeur absolue. */
export const ecartEnJours = (a: string, b: string): number =>
  Math.round(Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

const recuSurLeRdv = (r: RendezVousConnu): number => (r.payments?.length
  ? r.payments.reduce((n, p) => n + (Number(p.amountXof) || 0), 0)
  : Number(r.paidXof) || 0);

/** LE MÊME RENDEZ-VOUS EST-IL DÉJÀ LÀ ? Même cliente, même jour à un jour
    près, pas annulé, et le même argent : un versement du montant lu, le reçu
    total égal au montant, ou le prix figé égal au prix lu. Une ligne à zéro
    (offert) se reconnaît au seul jour. À côté, `voisin` : un rituel de la
    même cliente ces jours-là, mais pour un autre argent, que l'écran montre
    sans rien décider. */
export function rendezVousDejaLa(
  l: Pick<LigneLue, 'montant' | 'total'>, datePage: string, clienteId: string, rdvs: readonly RendezVousConnu[],
): { deja?: RendezVousConnu; voisin?: RendezVousConnu } {
  const proches = rdvs.filter((r) => r.clientId === clienteId && r.status !== 'annulé'
    && /^\d{4}-\d{2}-\d{2}/.test(String(r.date)) && ecartEnJours(r.date, datePage) <= JOURS_DE_TOLERANCE);
  const prix = l.total ?? l.montant;
  const memeArgent = (r: RendezVousConnu): boolean => (l.montant === 0
    ? true
    : (r.payments ?? []).some((p) => Math.round(Number(p.amountXof) || 0) === l.montant)
      || Math.round(recuSurLeRdv(r)) === l.montant
      || (typeof r.priceXof === 'number' && Math.round(r.priceXof) === prix));
  const deja = proches.find(memeArgent);
  if (deja) return { deja };
  return proches.length ? { voisin: proches[0] } : {};
}

/* ── LE RITUEL DU CATALOGUE ─────────────────────────────────────────────── */
export type RituelDuCatalogue = { id: string; name: string };

/** Les mots du cahier et ceux du catalogue : « retwist » appelle le SÍNSIN™,
    « départ » le VÈKPÈ™. Les mots lus pèsent deux, les mots appelés un. */
const SYNONYMES: readonly [RegExp, string[]][] = [
  [/\bre ?twist\b|\bresser+age\b|\bracines?\b/, ['sinsin', 'essentiel', 'reprise']],
  [/\bdepart\b|\bcreation\b|\bnaissance\b|\bdemarrage\b|\bpose\b|\bvekpe\b/, ['vekpe', 'naissance']],
  [/\bshampo+ing\b|\bshampoo\b|\blavage\b|\bpurif/, ['wewe', 'purification']],
  [/\bsoin\b|\bhydrat/, ['dandan', 'hydratant']],
  [/\bcouleur\b|\bcolo(ration)?\b|\bteinture\b/, ['yekpe', 'couleur']],
  [/\bdefaisage\b|\bdefaire\b|\bdemontage\b|\bdefait\b/, ['gbata', 'defaisage']],
  [/\breconstruction\b|\bcure\b/, ['gbigbi', 'reconstruction']],
  [/\bstyling\b|\bcoiffure\b|\bsortie\b/, ['styling']],
  [/\bfrontal/, ['frontale']],
  [/\bconsult|\bdiagnos|\bkoko\b/, ['koko']],
  [/\bbrillance\b|\blumiere\b/, ['yekpe', 'lumiere']],
];
const MOTS_VIDES = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'et', 'a', 'au', 'aux', 'un', 'une', 'en', 'x', 'tm', 'mois', 'seance', 'seances', 'par', 'pour', 'avec']);

/** LE RITUEL QUE LE LIBELLÉ APPELLE, ou rien : on propose, la Maison choisit
    dans la liste. Le nom à plat identique gagne d'office ; sinon le plus de
    mots communs, deux au moins ; à égalité, le nom le plus court (l'Essentiel
    avant l'Élaboré). */
export function rituelDuCatalogue(libelle: string, services: readonly RituelDuCatalogue[]): RituelDuCatalogue | undefined {
  const l = plat(libelle);
  if (!l || services.length === 0) return undefined;
  const exact = services.find((s) => plat(s.name) === l);
  if (exact) return { id: exact.id, name: exact.name };
  const poids = new Map<string, number>();
  for (const m of mots(l)) if (!MOTS_VIDES.has(m)) poids.set(m, 2);
  for (const [motif, appeles] of SYNONYMES) {
    if (motif.test(l)) for (const a of appeles) if (!poids.has(a)) poids.set(a, 1);
  }
  let meilleur: { s: RituelDuCatalogue; score: number } | undefined;
  for (const s of services) {
    const siens = new Set(mots(s.name).filter((m) => !MOTS_VIDES.has(m)));
    let score = 0;
    for (const m of siens) score += poids.get(m) ?? 0;
    if (score < 2) continue;
    if (!meilleur || score > meilleur.score || (score === meilleur.score && s.name.length < meilleur.s.name.length)) meilleur = { s, score };
  }
  return meilleur ? { id: meilleur.s.id, name: meilleur.s.name } : undefined;
}

/* ── LE RAPPROCHEMENT, LIGNE À LIGNE ────────────────────────────────────── */
export type EtatDeLigne = 'deja' | 'a-inscrire' | 'inconnue';
export type LigneRapprochee = {
  /** La clef de la ligne dans la page (son rang). */
  cle: string;
  ligne: LigneLue;
  etat: EtatDeLigne;
  cliente?: FicheConnue;
  comment?: CommentReconnue;
  candidats: FicheConnue[];
  /** Le rendez-vous déjà au Trône (état « deja »). */
  deja?: RendezVousConnu;
  /** Un rituel de la même cliente ces jours-là, pour un autre argent. */
  voisin?: RendezVousConnu;
  /** Le rituel du catalogue que le libellé appelle, s'il en appelle un. */
  rituel?: RituelDuCatalogue;
  /** La même cliente et le même argent plus haut dans la page : une ligne
      recopiée, le plus souvent. L'écran la décoche, sans l'interdire. */
  doublonDansLaPage: boolean;
};

/** CHAQUE LIGNE CONFRONTÉE AU TRÔNE : la cliente reconnue ou non, le
    rendez-vous déjà là ou non, le rituel du catalogue proposé. Sans date de
    page, rien ne peut être « déjà là » : tout ce qui a une cliente est à
    inscrire, et l'écran demande la date avant d'inscrire. */
export function rapproche(
  page: Pick<PageLue, 'date' | 'lignes'>,
  fiches: readonly FicheConnue[],
  rdvs: readonly RendezVousConnu[],
  services: readonly RituelDuCatalogue[] = [],
): LigneRapprochee[] {
  const vues = new Set<string>();
  return page.lignes.map((ligne, i) => {
    const r = trouveLaCliente(ligne, fiches);
    const rituel = rituelDuCatalogue(ligne.rituel, services);
    const base = { cle: `l${i + 1}`, ligne, candidats: r.candidats, ...(rituel ? { rituel } : {}) };
    if (!r.fiche) return { ...base, etat: 'inconnue' as const, doublonDansLaPage: false };
    const signature = `${r.fiche.id}·${ligne.montant}·${ligne.total ?? ''}`;
    const doublonDansLaPage = vues.has(signature);
    vues.add(signature);
    const { deja, voisin } = page.date ? rendezVousDejaLa(ligne, page.date, r.fiche.id, rdvs) : {};
    return {
      ...base,
      cliente: r.fiche,
      ...(r.comment ? { comment: r.comment } : {}),
      etat: deja ? 'deja' as const : 'a-inscrire' as const,
      ...(deja ? { deja } : {}),
      ...(voisin ? { voisin } : {}),
      doublonDansLaPage,
    };
  });
}

/* ── LA CAISSE DU RATTRAPAGE ────────────────────────────────────────────── */
export type CaisseDuCahier =
  | { ok: true; caisse: string; pourquoi: string; aCreer?: Cashbox }
  | { ok: false; refus: string };

/** OÙ VA L'ARGENT D'UNE PAGE, selon sa date et rien d'autre :
    · une année antérieure → « Années passées » (née au besoin) ;
    · 2026 d'avant octobre → l'archive d'avant la bascule si elle existe,
      sinon une caisse ancienne (« jusqu'au 30 sept. ») qui couvre ce jour,
      de préférence celle du moyen, sinon l'archive naît ; jamais une pièce
      du mois, jamais la caisse d'un caissier ;
    · octobre 2026 ou après → refus : ce mois-là se compte au comptoir. */
export function caisseDuRattrapage(o: {
  datePage: string; aujourdhui: string; boxes: readonly Cashbox[]; branchId: string; moyen?: MoyenDuCahier;
}): CaisseDuCahier {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datePage)) return { ok: false, refus: 'La date de la page manque : indiquez-la avant d’inscrire.' };
  const ici = o.boxes.filter((b) => b.branchId === o.branchId && !b.archiveeLe);
  if (estAnneeAnterieure(o.datePage, o.aujourdhui)) {
    const annee = anneeDe(o.datePage);
    const existe = ici.some((b) => b.name === CAISSE_ANNEES_PASSEES);
    return {
      ok: true,
      caisse: CAISSE_ANNEES_PASSEES,
      pourquoi: `Page de ${annee}, une année antérieure : tout son argent va aux années passées.`,
      ...(existe ? {} : { aCreer: caisseDesAnneesPassees(o.branchId) }),
    };
  }
  if (o.datePage < JOUR_DE_DEPART) {
    const archive = ici.find((b) => b.name === ARCHIVE) ?? ici.find((b) => b.role === 'archive' && b.name !== CAISSE_ANNEES_PASSEES);
    if (archive) return { ok: true, caisse: archive.name, pourquoi: 'Page de 2026 d’avant octobre : son argent rejoint l’archive d’avant la bascule, jamais une caisse du mois.' };
    const anciennes = ici.filter((b) => !!b.jusquAu && o.datePage <= b.jusquAu && !b.caissierId && !b.horsBilan && !b.horsEncaissement);
    const famille: Record<MoyenDuCahier, RegExp> = {
      especes: /espece|tiroir|principale|cash|liquide/, inconnu: /espece|tiroir|principale|cash|liquide/,
      momo: /momo|mtn|mobile/, carte: /banque|bank|carte/, virement: /banque|bank|virement/, cheque: /banque|bank|cheque/,
    };
    const duMoyen = anciennes.find((b) => famille[o.moyen ?? 'inconnu'].test(plat(`${b.name} ${b.sub ?? ''}`)));
    const ancienne = duMoyen ?? anciennes.find((b) => /principale|espece|tiroir/.test(plat(`${b.name} ${b.sub ?? ''}`))) ?? anciennes[0];
    if (ancienne) return { ok: true, caisse: ancienne.name, pourquoi: `Page de 2026 d’avant octobre : son argent rejoint « ${ancienne.name} », une caisse d’avant la bascule, jamais une caisse du mois.` };
    return {
      ok: true,
      caisse: ARCHIVE,
      pourquoi: 'Page de 2026 d’avant octobre : aucune caisse d’avant la bascule n’est ouverte, l’archive naît pour la recevoir.',
      aCreer: {
        id: `cb-archive-cahier-${o.branchId}`, branchId: o.branchId, name: ARCHIVE,
        sub: 'Tout ce qui précède le 1er octobre 2026', glyph: '▣', openingXof: 0, role: 'archive', jusquAu: '2026-09-30',
      },
    };
  }
  return {
    ok: false,
    refus: `Une page du ${o.datePage} ne se rattrape pas ici : depuis le 1er octobre 2026, les caisses du mois se tiennent au jour le jour. Passez par « + RDV passé » au Carnet.`,
  };
}

/* ── L'INSCRIPTION, CALCULÉE ────────────────────────────────────────────── */
/** Ce que la Maison a décidé pour une ligne, au-dessus du rapprochement.
    `geste` : la fiche reconnue ou rattachée, une fiche neuve, de passage
    (sans fiche), ou écartée. `rituelId: null` : le libellé reste libre. */
export type DecisionDeLigne = {
  geste: 'fiche' | 'nouvelle' | 'passage' | 'ecarter';
  clienteId?: string;
  rituelId?: string | null;
  montant?: number;
  total?: number;
  moyen?: MoyenDuCahier;
};

export type ProjetDInscription =
  | {
    ok: true;
    caisse: string;
    pourquoi: string;
    caissesACreer: Cashbox[];
    fiches: Client[];
    rendezVous: Appointment[];
    /** Les surnoms à retenir sur les fiches rattachées. */
    surnoms: { clienteId: string; dit: string }[];
    dejaLa: number;
    ecartees: number;
    totalRecu: number;
    totalReste: number;
  }
  | { ok: false; refus: string };

/** La décision qui vaut sans que la Maison ait touché la ligne : la fiche
    reconnue s'inscrit ; une inconnue attend un geste ; un doublon dans la page
    est écarté ; une ligne déjà au Trône ne s'inscrit jamais. */
export const decisionParDefaut = (l: LigneRapprochee): DecisionDeLigne => {
  if (l.etat === 'deja') return { geste: 'ecarter' };
  if (l.etat === 'inconnue' || !l.cliente) return { geste: 'ecarter' };
  if (l.doublonDansLaPage) return { geste: 'ecarter' };
  return { geste: 'fiche', clienteId: l.cliente.id };
};

/** TOUT CE QUE « INSCRIRE N LIGNES » ÉCRIRA, calculé d'avance et relisible :
    les rendez-vous honorés datés du jour de la page, leurs versements dans la
    caisse du rattrapage, les fiches neuves (segment Prospect, cliente depuis
    le jour de la page), les surnoms à retenir, la caisse à ouvrir au besoin.
    Les lignes « déjà au Trône » et les écartées n'y entrent jamais. */
export function inscriptionDeLaPage(o: {
  datePage: string;
  aujourdhui: string;
  branchId: string;
  boxes: readonly Cashbox[];
  lignes: readonly LigneRapprochee[];
  decisions: Readonly<Record<string, DecisionDeLigne | undefined>>;
  fiches: readonly Pick<Client, 'id' | 'name'>[];
  services: readonly RituelDuCatalogue[];
  persona: string;
  /** La marque portée par chaque versement : la page se retire d'un geste
      (« Les séries posées »). */
  marque: string;
  nouvelId: () => string;
  maitre?: string;
}): ProjetDInscription {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.datePage)) return { ok: false, refus: 'La date de la page manque : indiquez-la avant d’inscrire.' };
  if (o.datePage > o.aujourdhui) return { ok: false, refus: 'La date de la page est dans l’avenir : un cahier ne parle que du passé.' };
  const caisse = caisseDuRattrapage({ datePage: o.datePage, aujourdhui: o.aujourdhui, boxes: o.boxes, branchId: o.branchId });
  if (!caisse.ok) return caisse;

  const fiches: Client[] = [];
  const rendezVous: Appointment[] = [];
  const surnoms: { clienteId: string; dit: string }[] = [];
  let dejaLa = 0;
  let ecartees = 0;
  let totalRecu = 0;
  let totalReste = 0;
  const nomDe = (id: string): string | undefined => o.fiches.find((f) => f.id === id)?.name ?? fiches.find((f) => f.id === id)?.name;

  for (const l of o.lignes) {
    if (l.etat === 'deja') { dejaLa += 1; continue; }
    const d = o.decisions[l.cle] ?? decisionParDefaut(l);
    if (d.geste === 'ecarter') { ecartees += 1; continue; }
    const montant = Math.max(0, Math.round(d.montant ?? l.ligne.montant));
    const totalVoulu = d.total ?? l.ligne.total;
    const prix = Math.max(montant, Math.round(totalVoulu ?? montant));
    const moyen: MoyenDuCahier = d.moyen ?? l.ligne.moyen;
    const lu = nomLu(l.ligne);

    let clientId = '';
    let clientName = lu;
    if (d.geste === 'fiche') {
      const id = d.clienteId ?? l.cliente?.id;
      if (!id) { ecartees += 1; continue; }
      clientId = id;
      clientName = nomDe(id) ?? lu;
      /* RATTACHÉE À LA MAIN (la ligne ne la reconnaissait pas, ou pas elle) :
         la fiche retient le nom du cahier. */
      if (!l.cliente || l.cliente.id !== id) surnoms.push({ clienteId: id, dit: lu });
    } else if (d.geste === 'nouvelle') {
      const fiche: Client = {
        id: `cl-${o.nouvelId()}`,
        branchId: o.branchId,
        name: lu,
        phone: '',
        city: '',
        persona: o.persona,
        /* CLIENTE DEPUIS LE JOUR DE LA PAGE, pas depuis aujourd'hui : une
           tête reprise d'un cahier de 2025 est de la Maison depuis 2025. */
        since: o.datePage,
        segments: [SEGMENT_DE_LA_FICHE_NEUVE],
        priceCoef: 1,
        loyaltyPoints: 0,
        source: 'maison',
        notes: `Fiche ouverte depuis un cahier rattrapé (page du ${o.datePage}).`,
      };
      fiches.push(fiche);
      clientId = fiche.id;
      clientName = fiche.name;
    }
    /* « de passage » : sans fiche, le nom sur le rendez-vous, comme la Caisse
       écrit une vente au comptoir (`clientId: ''` + `clientName`). */

    const rituelId = d.rituelId === undefined ? l.rituel?.id : d.rituelId;
    const rituel = rituelId ? o.services.find((s) => s.id === rituelId) : undefined;
    const versements: ApptPayment[] = montant > 0 ? [{
      id: `pm-${o.nouvelId()}`,
      amountXof: montant,
      /* L'ARGENT EST ENTRÉ LE JOUR DE LA PAGE, jamais aujourd'hui : c'est
         ce qui le tient hors des caisses du mois et hors de tout envoi. */
      date: o.datePage,
      method: METHODE_DU_MOYEN[moyen],
      cashbox: caisse.caisse,
      note: o.marque,
    }] : [];
    const notes = [
      `Cahier rattrapé · page du ${o.datePage}`,
      l.ligne.note ?? '',
      moyen === 'inconnu' && montant > 0 ? 'moyen non lu sur la page, inscrit en espèces' : '',
      !rituel ? `rituel lu : « ${l.ligne.rituel} »` : '',
    ].filter(Boolean).join(' · ');
    rendezVous.push({
      id: `ap-${o.nouvelId()}`,
      branchId: o.branchId,
      clientId,
      clientName,
      serviceIds: rituel ? [rituel.id] : [],
      date: o.datePage,
      time: HEURE_DU_CAHIER,
      master: o.maitre || MAITRE_DU_CAHIER,
      status: 'honoré',
      source: 'trone',
      /* LE PRIX LU SUR LA PAGE, FIGÉ : le catalogue d'alors n'est pas celui
         d'aujourd'hui. Le reçu à côté ; l'écart est le reste dû, visible au
         Carnet. */
      priceXof: prix,
      paidXof: montant,
      payments: versements,
      /* UN LIBELLÉ QUE LE CATALOGUE NE CONNAÎT PAS garde ses mots : la pièce
         et le Carnet les lisent (`apptLabel`), la caisse ne les retarife pas. */
      ...(rituel ? {} : { forfait: { nom: l.ligne.rituel, totalXof: prix, baseXof: 0, poseAt: o.datePage } }),
      note: notes,
    });
    totalRecu += montant;
    totalReste += prix - montant;
  }

  return {
    ok: true,
    caisse: caisse.caisse,
    pourquoi: caisse.pourquoi,
    caissesACreer: caisse.aCreer ? [caisse.aCreer] : [],
    fiches,
    rendezVous,
    surnoms,
    dejaLa,
    ecartees,
    totalRecu,
    totalReste,
  };
}
