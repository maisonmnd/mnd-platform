/* ══ LA TRACE DE LA BASE — 13 septembre 2026 ══════════════════════════════

   « J'ai des employés qui font des rendez-vous et des factures, et à la fin de
   la journée ils disent que ce n'est pas eux. Quand je clique un rendez-vous,
   je dois retrouver quand il a été créé, par qui, comment il a été tamponné,
   tout » (Yéman). Maquette « La vie d'un rendez-vous » validée.

   LA BASE ÉCRIT, CE FICHIER LIT. Chaque geste est signé dans Postgres par un
   déclencheur (migration 0092) : compte, heure du serveur, appareil, avant et
   après. Rien ici n'écrit la trace ; tout ici la rend lisible.

   LE FOND ET L'AUTOMATIQUE. La coquille du Trône réécrit seule certaines
   fiches (persona, passage, sans locks) sous le compte connecté. La base les
   signe comme le reste, et elle a raison : c'est bien cette session qui a
   écrit. Mais les compter comme des gestes de la personne lui attribuerait des
   centaines de retouches qu'elle n'a jamais faites. On sépare donc, champ par
   champ, ce qui compte de ce qui est de la mécanique. */

import { supabase } from './supabase';
import { CARTE_DES_TABLES, NOM_DES_CHAMPS } from './journal';

export type PorteDeTrace = 'trone' | 'couronne' | 'visiteur' | 'serveur' | 'base';
export type OperationDeTrace = 'pose' | 'modifie' | 'efface';
type Donnees = Record<string, unknown>;

export type Trace = {
  id: number;
  faitLe: string;
  table: string;
  pieceId: string;
  branchId?: string | null;
  operation: OperationDeTrace;
  compte?: string | null;
  compteMail?: string | null;
  compteNom?: string | null;
  porte: PorteDeTrace;
  appareil?: string | null;
  avant?: Donnees | null;
  apres?: Donnees | null;
};

type LigneDeLaBase = {
  id: number; fait_le: string; table_name: string; piece_id: string; branch_id: string | null;
  operation: OperationDeTrace; compte: string | null; compte_mail: string | null; compte_nom: string | null;
  porte: PorteDeTrace; appareil: string | null; avant: Donnees | null; apres: Donnees | null;
};

const COLONNES = 'id,fait_le,table_name,piece_id,branch_id,operation,compte,compte_mail,compte_nom,porte,appareil,avant,apres';

export const traceDeLaLigne = (r: LigneDeLaBase): Trace => ({
  id: r.id, faitLe: r.fait_le, table: r.table_name, pieceId: r.piece_id, branchId: r.branch_id,
  operation: r.operation, compte: r.compte, compteMail: r.compte_mail, compteNom: r.compte_nom,
  porte: r.porte, appareil: r.appareil, avant: r.avant, apres: r.apres,
});

export type PieceTracee = { table: string; id: string };

/** La vie de quelques pièces, du plus ancien au plus récent.
    `null` = la trace ne répond pas : migration absente, ou compte hors
    direction. Une vie vide (`[]`) n'est pas la même chose. */
export async function litLesTracesDesPieces(pieces: readonly PieceTracee[]): Promise<Trace[] | null> {
  if (!supabase) return null;
  const parTable = new Map<string, Set<string>>();
  for (const p of pieces) {
    if (!p.id) continue;
    const s = parTable.get(p.table) ?? new Set<string>();
    s.add(p.id);
    parTable.set(p.table, s);
  }
  if (parTable.size === 0) return [];
  const out: Trace[] = [];
  for (const [table, ids] of parTable) {
    const { data, error } = await supabase
      .from('traces')
      .select(COLONNES)
      .eq('table_name', table)
      .in('piece_id', [...ids])
      .order('fait_le', { ascending: true })
      .limit(2000);
    if (error) return null;
    out.push(...((data ?? []) as LigneDeLaBase[]).map(traceDeLaLigne));
  }
  return out.sort((a, b) => a.faitLe.localeCompare(b.faitLe) || a.id - b.id);
}

/** Les gestes d'une période, du plus récent au plus ancien. */
export async function litLesTracesDeLaPeriode(debutIso: string, finIso: string): Promise<Trace[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('traces')
    .select(COLONNES)
    .gte('fait_le', debutIso)
    .lt('fait_le', finIso)
    .order('fait_le', { ascending: false })
    .limit(6000);
  if (error) return null;
  return ((data ?? []) as LigneDeLaBase[]).map(traceDeLaLigne);
}

/* ---------- Les jours et les heures, à l'heure locale ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const quantieme = (n: number) => (n === 1 ? '1er' : String(n));

export const heureDe = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const jourCourtDe = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${JOURS_COURTS[d.getDay()]} ${quantieme(d.getDate())} ${MOIS_COURTS[d.getMonth()]}`;
};
/** « vendredi 12 septembre 2026 à 10 h 42 ». */
export const momentLongDe = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${JOURS[d.getDay()]} ${quantieme(d.getDate())} ${MOIS[d.getMonth()]} ${d.getFullYear()} à ${d.getHours()} h ${pad(d.getMinutes())}`;
};
const dateDite = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${quantieme(Number(m[3]))} ${MOIS_COURTS[Number(m[2]) - 1]} ${m[1]}` : s;
};

/* ---------- Qui, par où, sur quoi ---------- */
export const PORTE_DITE: Record<PorteDeTrace, string> = {
  trone: 'Le Trône',
  couronne: 'Ma Couronne',
  visiteur: 'le site public',
  serveur: 'un service de la Maison',
  base: 'l’éditeur de la base',
};

/** Le nom de la main, figé par la base au moment du geste. */
export const nomDeLaMain = (t: Pick<Trace, 'porte' | 'compteNom' | 'compteMail'>): string => {
  if (t.porte === 'trone') return (t.compteNom ?? '').trim() || (t.compteMail ?? '').trim() || 'Un compte du personnel';
  if (t.porte === 'couronne') return 'La cliente';
  if (t.porte === 'visiteur') return 'Un visiteur du site';
  if (t.porte === 'serveur') return 'Un service de la Maison';
  return 'La base';
};

export const initiales = (nom: string): string => {
  const mots = nom.trim().split(/[\s@._-]+/).filter(Boolean);
  if (mots.length === 0) return '·';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
};

/** L'APPAREIL, LU DANS L'EN-TÊTE DU NAVIGATEUR. « Téléphone Android, Chrome ».
    Aucune adresse réseau : arbitrage de la Maison. */
export function appareilDit(ua?: string | null, o: { court?: boolean } = {}): string {
  const s = (ua ?? '').trim();
  if (!s) return o.court ? 'inconnu' : 'appareil inconnu';
  if (/^(Deno|node|PostgREST|curl|python|undici)/i.test(s) || /supabase-(edge|functions)/i.test(s)) {
    return o.court ? 'service' : 'un service de la Maison';
  }
  let appareil = 'appareil';
  let court = 'autre';
  if (/iPhone/.test(s)) { appareil = 'iPhone'; court = 'iPhone'; }
  else if (/iPad/.test(s)) { appareil = 'iPad'; court = 'iPad'; }
  else if (/Android/.test(s)) { appareil = /Mobile/.test(s) ? 'téléphone Android' : 'tablette Android'; court = 'Android'; }
  else if (/Windows/.test(s)) { appareil = 'ordinateur Windows'; court = 'Windows'; }
  else if (/CrOS/.test(s)) { appareil = 'Chromebook'; court = 'Chromebook'; }
  else if (/Macintosh|Mac OS X/.test(s)) { appareil = 'Mac'; court = 'Mac'; }
  else if (/Linux/.test(s)) { appareil = 'ordinateur Linux'; court = 'Linux'; }
  if (o.court) return court;
  const nav = /Edg(A|iOS)?\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
      : /SamsungBrowser/.test(s) ? 'Samsung Internet'
        : /CriOS|Chrome\//.test(s) ? 'Chrome'
          : /FxiOS|Firefox\//.test(s) ? 'Firefox'
            : /Safari\//.test(s) ? 'Safari' : '';
  return nav ? `${appareil}, ${nav}` : appareil;
}

/* ---------- Les pièces liées ---------- */
/** UN ENCAISSEMENT NE SE LIT JAMAIS SÉPARÉ DE SON RITUEL : la vie d'un
    rendez-vous porte aussi celle des factures qu'il a fait naître. */
export function piecesDuRendezVous(
  appt: { id: string; invoiceId?: string; payments?: readonly { invoiceId?: string }[] },
  invoices: readonly { id: string; apptId?: string }[],
): PieceTracee[] {
  const ids = new Set<string>();
  if (appt.invoiceId) ids.add(appt.invoiceId);
  for (const p of appt.payments ?? []) if (p.invoiceId) ids.add(p.invoiceId);
  for (const i of invoices) if (i.apptId === appt.id) ids.add(i.id);
  return [{ table: 'appointments', id: appt.id }, ...[...ids].map((id) => ({ table: 'invoices', id }))];
}

export function piecesDeLaFacture(
  inv: { id: string; apptId?: string },
  appts: readonly { id: string; invoiceId?: string; payments?: readonly { invoiceId?: string }[] }[],
): PieceTracee[] {
  const ids = new Set<string>();
  if (inv.apptId) ids.add(inv.apptId);
  for (const a of appts) {
    if (a.invoiceId === inv.id || (a.payments ?? []).some((p) => p.invoiceId === inv.id)) ids.add(a.id);
  }
  return [{ table: 'invoices', id: inv.id }, ...[...ids].map((id) => ({ table: 'appointments', id }))];
}

/* ══ LIRE UN GESTE ═════════════════════════════════════════════════════ */
export type ContexteDeLecture = {
  nomDePrestation: (id: string) => string | undefined;
  nomDeMembre: (id: string) => string | undefined;
  argent: (xof: number) => string;
};

export type FamilleDeGeste = 'pose' | 'modifie' | 'argent' | 'sensible' | 'automatique';
export type LigneDeDiff = { champ: string; avant?: string; apres?: string };
export type GesteLu = {
  /** L'étiquette courte : « Créé », « Honoré », « Remise ». */
  verbe: string;
  /** La phrase après le nom : « a posé le rendez-vous ». */
  phrase: string;
  famille: FamilleDeGeste;
  sensible: boolean;
  automatique: boolean;
  honore: boolean;
  /** Ce qui est entré sur une facture par ce geste. */
  encaisseXof: number;
  remiseXof: number;
  diff: LigneDeDiff[];
  piece: string;
};

const NOMS: Record<string, string> = {
  ...NOM_DES_CHAMPS,
  date: 'Date', time: 'Heure', status: 'Statut', note: 'Note', label: 'Libellé', amountXof: 'Montant',
  mains: 'Mains', remisesLignes: 'Remises de ligne', depositConfirmed: 'Acompte reçu', forfait: 'Forfait',
  paidXof: 'Encaissé', invoiceId: 'Facture', apptId: 'Rendez-vous', globalDiscountPct: 'Remise',
  globalDiscountXof: 'Remise', kind: 'Nature', priceCoef: 'Tarif', persona: 'Persona', archived: 'Archivée',
  gamme: 'Gamme', dureeMin: 'Durée', photo: 'Photo', observation: 'Observation', method: 'Moyen',
};

const CHAMPS_MUETS = new Set(['id', 'branchId', 'updatedAt', 'pointsAwarded', 'source', 'creeLe', 'authUserId']);

/** CE QUI COMPTE, table par table. Une modification qui ne touche aucun de
    ces champs est de la mécanique : lisible dans la vie, jamais comptée. Une
    table absente d'ici compte en entier. */
const CHAMPS_QUI_COMPTENT: Record<string, Set<string>> = {
  appointments: new Set(['date', 'time', 'status', 'serviceIds', 'master', 'mains', 'remisesLignes', 'discountPct',
    'discountXof', 'forfait', 'priceXof', 'depositXof', 'depositConfirmed', 'payments', 'paidXof', 'note',
    'longueur', 'invoiceId', 'coveredBySub', 'offertPar', 'gamme', 'seriesId']),
  invoices: new Set(['lines', 'status', 'payments', 'payment', 'cashbox', 'globalDiscountPct', 'globalDiscountXof',
    'number', 'date', 'tipXof', 'avoirXof', 'kind', 'master', 'fx']),
  clients: new Set(['name', 'phone', 'phone2', 'email', 'city', 'notes', 'priceCoef', 'archived', 'familyId',
    'since', 'photo', 'observation']),
};

const TABLES_D_ARGENT = new Set(['invoices', 'payments', 'credit_movements', 'expenses', 'cashboxes',
  'transferts_caisse', 'coffre_movements', 'entrees_hors_activite', 'versements_engagement']);

const PIECE: Record<string, { le: string; nom: string }> = {
  appointments: { le: 'le rendez-vous', nom: 'Rendez-vous' },
  invoices: { le: 'la facture', nom: 'Facture' },
  payments: { le: 'le paiement en ligne', nom: 'Paiement en ligne' },
  credit_movements: { le: 'le mouvement d’avoir', nom: 'Avoir' },
  clients: { le: 'la fiche cliente', nom: 'Fiche cliente' },
  expenses: { le: 'la dépense', nom: 'Dépense' },
  cashboxes: { le: 'la caisse', nom: 'Caisse' },
  transferts_caisse: { le: 'le transfert entre caisses', nom: 'Transfert entre caisses' },
  coffre_movements: { le: 'le mouvement du coffre', nom: 'Coffre' },
  entrees_hors_activite: { le: 'l’entrée hors activité', nom: 'Entrée hors activité' },
  /* Les engagements — 15 septembre 2026 (0099). */
  engagements: { le: 'le dossier d’engagement', nom: 'Engagement' },
  devis_recus: { le: 'le devis reçu', nom: 'Devis reçu' },
  versements_engagement: { le: 'le versement au prestataire', nom: 'Versement' },
};

const ORDRE = ['clientName', 'name', 'number', 'date', 'time', 'status', 'serviceIds', 'master', 'mains', 'forfait',
  'priceXof', 'discountPct', 'discountXof', 'globalDiscountPct', 'globalDiscountXof', 'remisesLignes', 'depositXof',
  'depositConfirmed', 'lines', 'payments', 'amountXof', 'label', 'category', 'cashbox', 'phone', 'phone2', 'priceCoef'];
const rang = (k: string) => {
  const i = ORDRE.indexOf(k);
  return i < 0 ? ORDRE.length : i;
};

const CLES_REMISE = ['discountPct', 'discountXof', 'remisesLignes', 'globalDiscountPct', 'globalDiscountXof'];

const texte = (v: unknown): string => (v == null ? '' : String(v));
const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Les champs qui ont réellement changé. Le contexte de lecture posé par la
    base (statut, date, nom) figure des deux côtés sans avoir bougé : il ne
    compte pas. */
export const clesChangees = (t: Pick<Trace, 'operation' | 'avant' | 'apres'>): string[] => {
  const av = t.avant ?? {};
  const ap = t.apres ?? {};
  if (t.operation === 'pose') return Object.keys(ap);
  if (t.operation === 'efface') return Object.keys(av);
  return [...new Set([...Object.keys(av), ...Object.keys(ap)])]
    .filter((k) => JSON.stringify(av[k]) !== JSON.stringify(ap[k]));
};

export const estAutomatique = (t: Pick<Trace, 'operation' | 'avant' | 'apres' | 'table'>): boolean => {
  if (t.operation !== 'modifie') return false;
  const comptent = CHAMPS_QUI_COMPTENT[t.table];
  if (!comptent) return false;
  return !clesChangees(t).some((k) => comptent.has(k));
};

type Versement = { id?: string; amountXof?: number; method?: string; cashbox?: string };
const versements = (d?: Donnees | null): Versement[] =>
  (Array.isArray(d?.payments) ? (d!.payments as Versement[]).filter((v) => v && typeof v === 'object') : []);
const ditVersement = (v: Versement, ctx: ContexteDeLecture): string =>
  [ctx.argent(nombre(v.amountXof)), texte(v.method), texte(v.cashbox)].filter(Boolean).join(' · ');

const ajoutXof = (av: Donnees, ap: Donnees): number => {
  const ids = new Set(versements(av).map((v) => v.id).filter(Boolean));
  return versements(ap).filter((v) => !v.id || !ids.has(v.id)).reduce((n, v) => n + nombre(v.amountXof), 0);
};
const versementsRetires = (av: Donnees, ap: Donnees): number => {
  if (!('payments' in ap)) return 0;
  const ids = new Set(versements(ap).map((v) => v.id));
  return versements(av).filter((v) => v.id && !ids.has(v.id)).length;
};
const versementsDeplaces = (av: Donnees, ap: Donnees): number => {
  const parId = new Map(versements(av).filter((v) => v.id).map((v) => [v.id!, v]));
  return versements(ap).filter((v) => {
    const a = v.id ? parId.get(v.id) : undefined;
    return !!a && (nombre(a.amountXof) !== nombre(v.amountXof) || texte(a.method) !== texte(v.method) || texte(a.cashbox) !== texte(v.cashbox));
  }).length;
};

function valeurLisible(k: string, v: unknown, doc: Donnees, ctx: ContexteDeLecture): string {
  if (v === undefined || v === null || v === '') return 'rien';
  if (/Xof$/.test(k) && typeof v === 'number') return ctx.argent(v);
  if (/Pct$/.test(k) && typeof v === 'number') return `${v} %`;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if ((k === 'date' || k === 'since' || k === 'crownSince') && typeof v === 'string') return dateDite(v);
  if (k === 'serviceIds' && Array.isArray(v)) {
    return v.length ? v.map((id) => ctx.nomDePrestation(String(id)) ?? 'prestation retirée').join(' · ') : 'aucune';
  }
  if (k === 'mains' && Array.isArray(v)) {
    const ids = Array.isArray(doc.serviceIds) ? (doc.serviceIds as unknown[]) : [];
    const parts = (v as unknown[]).map((m, i) => {
      const noms = Array.isArray(m) ? m.map((x) => ctx.nomDeMembre(String(x)) ?? 'un membre').join(', ') : '';
      if (!noms) return '';
      const prest = ids[i] != null ? ctx.nomDePrestation(String(ids[i])) : undefined;
      return prest ? `${prest} : ${noms}` : noms;
    }).filter(Boolean);
    return parts.length ? parts.join(' ; ') : 'personne';
  }
  if (k === 'forfait' && typeof v === 'object' && !Array.isArray(v)) return ctx.argent(nombre((v as Donnees).totalXof));
  if (k === 'lines' && Array.isArray(v)) return `${v.length} ligne${v.length > 1 ? 's' : ''}`;
  if (k === 'remisesLignes' && Array.isArray(v)) {
    const n = v.filter(Boolean).length;
    return n ? `${n} remise${n > 1 ? 's' : ''} de ligne` : 'aucune';
  }
  if (Array.isArray(v)) return v.length ? `${v.length} élément${v.length > 1 ? 's' : ''}` : 'aucun';
  if (typeof v === 'object') return 'détail';
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function diffDesVersements(t: Trace, ctx: ContexteDeLecture): LigneDeDiff[] {
  const av = versements(t.avant);
  const ap = versements(t.apres);
  if (t.operation === 'pose') return ap.map((v) => ({ champ: 'Versement', apres: ditVersement(v, ctx) }));
  if (t.operation === 'efface') return av.map((v) => ({ champ: 'Versement', avant: ditVersement(v, ctx) }));
  const parId = new Map(av.filter((v) => v.id).map((v) => [v.id!, v]));
  const idsApres = new Set(ap.map((v) => v.id));
  const out: LigneDeDiff[] = [];
  for (const v of ap) {
    const a = v.id ? parId.get(v.id) : undefined;
    if (!a) out.push({ champ: 'Versement', apres: ditVersement(v, ctx) });
    else if (ditVersement(a, ctx) !== ditVersement(v, ctx)) out.push({ champ: 'Versement', avant: ditVersement(a, ctx), apres: ditVersement(v, ctx) });
  }
  if ('payments' in (t.apres ?? {})) {
    for (const a of av) if (a.id && !idsApres.has(a.id)) out.push({ champ: 'Versement retiré', avant: ditVersement(a, ctx) });
  }
  return out;
}

function lignesDuDiff(t: Trace, ctx: ContexteDeLecture): LigneDeDiff[] {
  const av = t.avant ?? {};
  const ap = t.apres ?? {};
  const doc = t.operation === 'efface' ? av : ap;
  let cles = clesChangees(t);
  if (t.operation !== 'modifie') {
    const comptent = CHAMPS_QUI_COMPTENT[t.table];
    if (comptent) cles = cles.filter((k) => comptent.has(k) || k === 'clientName' || k === 'name');
  }
  const out: LigneDeDiff[] = [];
  for (const k of [...cles].sort((a, b) => rang(a) - rang(b))) {
    if (CHAMPS_MUETS.has(k)) continue;
    if (k === 'payments') { out.push(...diffDesVersements(t, ctx)); continue; }
    const nom = NOMS[k];
    if (!nom) continue;
    if (k === 'clientId' && (doc.clientName || av.clientName)) continue;
    out.push({
      champ: nom,
      avant: t.operation === 'pose' ? undefined : valeurLisible(k, av[k], av, ctx),
      apres: t.operation === 'efface' ? undefined : valeurLisible(k, ap[k], ap, ctx),
    });
  }
  return out.slice(0, 16);
}

/** LE GESTE, NOMMÉ. L'ordre des questions est celui de la gravité : ce qui
    mérite un regard passe avant ce qui se lit simplement. */
export function litLeGeste(t: Trace, ctx: ContexteDeLecture): GesteLu {
  const av: Donnees = t.avant ?? {};
  const ap: Donnees = t.apres ?? {};
  const p = PIECE[t.table] ?? { le: 'la pièce', nom: 'Pièce' };
  const carte = CARTE_DES_TABLES[t.table];
  let piece = p.nom;
  try { piece = carte ? carte.nomme({ ...av, ...ap }) : p.nom; } catch { piece = p.nom; }
  const changees = new Set(clesChangees(t));
  const statutChange = t.operation === 'modifie' && changees.has('status');
  const avS = texte(av.status);
  const apS = texte(ap.status);
  const base = {
    piece,
    diff: lignesDuDiff(t, ctx),
    sensible: false,
    automatique: false,
    honore: t.table === 'appointments' && ((statutChange && apS === 'honoré') || (t.operation === 'pose' && apS === 'honoré')),
    encaisseXof: 0,
    remiseXof: 0,
  };
  const enArgent = TABLES_D_ARGENT.has(t.table);
  const sensible = (verbe: string, phrase: string, plus: Partial<GesteLu> = {}): GesteLu =>
    ({ ...base, verbe, phrase, famille: 'sensible', sensible: true, ...plus });

  if (t.operation === 'efface') return sensible('Supprimé', `a supprimé ${p.le}`);

  if (t.operation === 'pose') {
    if (t.table === 'appointments') return { ...base, verbe: 'Créé', phrase: 'a posé le rendez-vous', famille: 'pose' };
    if (t.table === 'invoices') {
      const encaisse = versements(ap).reduce((n, v) => n + nombre(v.amountXof), 0);
      return {
        ...base, verbe: 'Créée', famille: 'argent', encaisseXof: encaisse,
        phrase: encaisse > 0 ? `a créé la facture et encaissé ${ctx.argent(encaisse)}` : 'a créé la facture',
      };
    }
    if (t.table === 'clients') return { ...base, verbe: 'Créée', phrase: 'a créé la fiche cliente', famille: 'pose' };
    return { ...base, verbe: 'Posé', phrase: `a posé ${p.le}`, famille: enArgent ? 'argent' : 'pose' };
  }

  if (estAutomatique(t)) {
    return { ...base, verbe: 'Automatique', phrase: 'a déclenché une mise à jour automatique', famille: 'automatique', automatique: true };
  }

  const ajout = ajoutXof(av, ap);
  const encaisseXof = t.table === 'invoices' ? ajout : 0;

  if (t.table === 'invoices' && avS === 'payée') {
    return sensible('Payée, modifiée', 'a modifié une facture déjà payée', { encaisseXof });
  }
  if (t.table === 'appointments' && statutChange && avS === 'honoré') {
    return sensible('Dés-honoré', 'a retiré l’honneur du rituel');
  }
  if (versementsRetires(av, ap) > 0) return sensible('Versement retiré', 'a retiré un versement', { encaisseXof });
  if (versementsDeplaces(av, ap) > 0) {
    return sensible('Versement déplacé', 'a changé la caisse, le moyen ou le montant d’un versement', { encaisseXof });
  }
  if (CLES_REMISE.some((k) => changees.has(k))) {
    const remiseXof = Math.max(0, nombre(ap.discountXof ?? ap.globalDiscountXof) - nombre(av.discountXof ?? av.globalDiscountXof));
    return sensible('Remise', 'a changé la remise', { remiseXof, encaisseXof });
  }
  if (t.table === 'clients' && (changees.has('phone') || changees.has('phone2'))) return sensible('Téléphone changé', 'a changé le téléphone de la fiche');
  if (t.table === 'clients' && changees.has('priceCoef')) return sensible('Tarif changé', 'a changé le tarif de la fiche');
  if (t.table === 'expenses' && changees.has('amountXof')) return sensible('Montant changé', 'a changé le montant de la dépense');
  if (t.table === 'appointments' && (changees.has('forfait') || changees.has('priceXof'))) return sensible('Prix changé', 'a changé le prix du rituel');

  if (ajout > 0) {
    return { ...base, verbe: 'Encaissé', phrase: `a encaissé ${ctx.argent(ajout)}`, famille: 'argent', encaisseXof };
  }
  if (t.table === 'appointments' && changees.has('depositConfirmed') && ap.depositConfirmed === true) {
    return { ...base, verbe: 'Acompte', phrase: 'a confirmé l’acompte reçu', famille: 'argent' };
  }
  if (t.table === 'appointments' && statutChange && apS === 'honoré') return { ...base, verbe: 'Honoré', phrase: 'a honoré le rituel', famille: 'modifie' };
  if (t.table === 'appointments' && statutChange && apS === 'annulé') return { ...base, verbe: 'Annulé', phrase: 'a annulé le rendez-vous', famille: 'modifie' };
  if (t.table === 'invoices' && statutChange && apS === 'payée') return { ...base, verbe: 'Soldée', phrase: 'a soldé la facture', famille: 'argent' };
  if (t.table === 'appointments' && changees.has('mains')) return { ...base, verbe: 'Mains', phrase: 'a désigné les mains', famille: 'modifie' };
  if (t.table === 'appointments' && (changees.has('date') || changees.has('time'))) return { ...base, verbe: 'Déplacé', phrase: 'a déplacé le rendez-vous', famille: 'modifie' };
  return { ...base, verbe: 'Modifié', phrase: `a modifié ${p.le}`, famille: enArgent ? 'argent' : 'modifie', encaisseXof };
}

/* ══ QUI FAIT QUOI ══════════════════════════════════════════════════════ */
export type LigneDuResume = {
  cle: string;
  nom: string;
  porte: PorteDeTrace;
  rdvCrees: number;
  rdvModifies: number;
  honores: number;
  factures: number;
  encaisseXof: number;
  remises: number;
  remiseXof: number;
  suppressions: number;
  sensibles: number;
  gestes: number;
  automatiques: number;
  appareils: string[];
};

/** Une personne = un compte. Les clientes, les visiteurs, les services et la
    base se regroupent chacun sous leur porte. */
export const cleDeLaMain = (t: Pick<Trace, 'porte' | 'compte' | 'compteMail' | 'compteNom'>): string =>
  (t.porte === 'trone' ? `c:${t.compte ?? t.compteMail ?? t.compteNom ?? '?'}` : `p:${t.porte}`);

const NOM_DE_LA_PORTE: Record<PorteDeTrace, string> = {
  trone: 'Un compte du personnel',
  couronne: 'Clientes · Ma Couronne',
  visiteur: 'Visiteurs du site',
  serveur: 'Services de la Maison',
  base: 'La base',
};

export function resumeParPersonne(traces: readonly Trace[], ctx: ContexteDeLecture): LigneDuResume[] {
  const m = new Map<string, LigneDuResume>();
  for (const t of traces) {
    const cle = cleDeLaMain(t);
    let l = m.get(cle);
    if (!l) {
      l = {
        cle, nom: t.porte === 'trone' ? nomDeLaMain(t) : NOM_DE_LA_PORTE[t.porte], porte: t.porte,
        rdvCrees: 0, rdvModifies: 0, honores: 0, factures: 0, encaisseXof: 0, remises: 0, remiseXof: 0,
        suppressions: 0, sensibles: 0, gestes: 0, automatiques: 0, appareils: [],
      };
      m.set(cle, l);
    }
    const lu = litLeGeste(t, ctx);
    if (lu.automatique) { l.automatiques += 1; continue; }
    l.gestes += 1;
    if (t.table === 'appointments' && t.operation === 'pose') l.rdvCrees += 1;
    if (t.table === 'appointments' && t.operation === 'modifie') l.rdvModifies += 1;
    if (lu.honore) l.honores += 1;
    if (t.table === 'invoices' && t.operation === 'pose') l.factures += 1;
    l.encaisseXof += lu.encaisseXof;
    if (lu.verbe === 'Remise') { l.remises += 1; l.remiseXof += lu.remiseXof; }
    if (t.operation === 'efface') l.suppressions += 1;
    if (lu.sensible) l.sensibles += 1;
    const a = appareilDit(t.appareil, { court: true });
    if (!l.appareils.includes(a)) l.appareils.push(a);
  }
  return [...m.values()].sort((a, b) => b.gestes - a.gestes || b.automatiques - a.automatiques);
}
