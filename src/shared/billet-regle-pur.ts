/* ══ LE BILLET RÉGLÉ PORTE SA FACTURE — 7 novembre 2026 ══════════════════
   « Il faut avoir une autre façon d'écrire les rendez-vous qui sont déjà
   passés et qui sont déjà réglés, pouvoir télécharger le PDF » (Yéman, la
   page maisonmnd.com/rdv/?v=<jeton>).

   Le billet de la fonction `terminer-et-regler` (actions `billet` et
   `retrouver`) joint `facture` quand SA pièce existe, est soldée avec de
   l'argent reçu, et que le rituel a commencé (un jour passé, ou aujourd'hui
   dès son heure). Rien pour un rendez-vous à venir, annulé, non soldé, ou
   sans pièce. La facture ne porte que ce que le PDF imprime : jamais la
   caisse, la main qui a encaissé, le thème, un identifiant, la fiche, ni
   rien de l'équipe (relances, traces, envois).

   Le bloc ⟨billet-regle⟩ est recopié à l'identique dans la fonction
   `terminer-et-regler` (scripts/terminer-copie-serveur.mjs le réécrit, les
   bancs verifie-le-billet-regle et verifie-terminer-et-regler le comparent).
   Il s'y appuie sur les blocs ⟨honneur-au-reglement⟩ et ⟨terminer-et-regler⟩
   qui le précèdent (`jourDeLaFin`, `instantDuRituel`, `resteDeLaPieceDeLaFin`).
   Ses noms portent « DuBillet » pour ne heurter aucun autre nom de la
   fonction. Après le bloc, ce qui n'appartient qu'au site : la relecture
   stricte de la facture reçue, et ce que la page tend à
   `donneesDuPdfDeLaPiece` (pdf-de-la-piece-pur.ts, chargé à la demande). */
import { appelDe, type Civilite } from './civilite';
import { BASCULE_DE_L_IDENTITE, RAISON_MAISON_MND } from './registre';
import { instantDuRituel, jourDeLaFin, resteDeLaPieceDeLaFin, type PieceDeLaFin } from './terminer-et-regler-pur';
import type { Invoice } from './finance';
import type * as PapierDeLaPiece from './pdf-de-la-piece-pur';
import type { InvoicePdfData } from './pdf';

/* ⟨billet-regle⟩ */
/** Une ligne de la facture, telle que le PDF la lit. */
export type LigneDeLaFactureDuBillet = { label: string; qty: number; unitXof: number; discountPct: number; discountXof?: number; detail?: string[] };
/** Un versement : son jour, son moyen, sa part, la devise reçue. Ni caisse, ni main, ni trace. */
export type VersementDeLaFactureDuBillet = { date: string; method: string; amountXof: number; fx?: { code: string; rate: number; amount: number } };
export type PieceDeLaFactureDuBillet = {
  number: string; date: string; kind: 'facture';
  lines: LigneDeLaFactureDuBillet[];
  globalDiscountPct: number; globalDiscountXof?: number; discountLabel?: string;
  payments: VersementDeLaFactureDuBillet[];
  payment?: string; fx?: { code: string; rate: number; amount: number };
  tipXof?: number; status: string; master?: string; note?: string;
};
/** La tête soignée (son nom sur le papier, son numéro), celle qui a réglé si
    c'est une autre, et ce que `appelDe` lit pour le mot par défaut. */
export type ClienteDeLaFactureDuBillet = {
  nom: string; payeuse?: string; telephone?: string;
  name: string; civilite?: string; auMasculin?: boolean;
};
/** La branche (son nom, sa ville, sa devise), la raison de la Maison, et le
    premier maître quand la pièce n'en nomme aucun ni ne porte de mot. */
export type MaisonDeLaFactureDuBillet = { nom: string; ville?: string; devise?: string; raison?: string; maitre?: string };
export type FactureDuBillet = {
  piece: PieceDeLaFactureDuBillet;
  cliente: ClienteDeLaFactureDuBillet;
  maison: MaisonDeLaFactureDuBillet;
  /** Le jour du dernier versement. */
  regleLe: string;
};

const nombreDuBillet = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
const texteDuBillet = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined);
const JOUR_DU_BILLET = /^\d{4}-\d{2}-\d{2}$/;

/** Le total de la pièce : les calculs de finance.ts (`invoiceTotal`). */
export function totalDeLaPieceDuBillet(p: PieceDeLaFin): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + Math.max(0, nombreDuBillet(l.qty) * nombreDuBillet(l.unitXof) * (1 - nombreDuBillet(l.discountPct) / 100) - nombreDuBillet(l.discountXof)), 0);
  return Math.max(0, Math.round(sous * (1 - nombreDuBillet(p.globalDiscountPct) / 100)) - nombreDuBillet(p.globalDiscountXof));
}
/** L'argent reçu sur la pièce : ses versements, sinon son total si elle est
    « payée » sans journal (une pièce d'avant le 17 août, `invoiceReglements`). */
export const argentDeLaPieceDuBillet = (p: PieceDeLaFin): number =>
  (p.payments && p.payments.length > 0 ? p.payments.reduce((s, v) => s + nombreDuBillet(v.amountXof), 0) : p.status === 'payée' ? totalDeLaPieceDuBillet(p) : 0);

/** QUAND LE BILLET JOINT SA FACTURE : la pièce du rendez-vous existe, n'est
    ni un devis ni annulée, est soldée avec de l'argent reçu, le rendez-vous
    n'est pas annulé, et son rituel a commencé (un jour passé, ou aujourd'hui
    dès son heure, à Cotonou). Jamais d'avance : un rendez-vous payé d'avance
    garde Déplacer, Annuler et l'agenda jusqu'à son heure. */
export function factureAJoindreAuBillet(o: {
  rdv: { date?: string; time?: string; status?: string };
  piece: PieceDeLaFin | null;
  maintenantMs: number;
}): boolean {
  const p = o.piece;
  if (!p || (p.kind ?? 'facture') !== 'facture' || p.status === 'annulée' || o.rdv.status === 'annulé') return false;
  if (resteDeLaPieceDeLaFin(p) > 0 || argentDeLaPieceDuBillet(p) <= 0) return false;
  const jour = String(o.rdv.date ?? '').slice(0, 10);
  if (!JOUR_DU_BILLET.test(jour)) return false;
  const aujourdhui = jourDeLaFin(o.maintenantMs);
  const debut = instantDuRituel(jour, o.rdv.time);
  return jour < aujourdhui || (jour === aujourdhui && Number.isFinite(debut) && o.maintenantMs >= debut);
}

/** Le jour où elle a fini de régler : celui du dernier versement qui porte de
    l'argent, sinon le jour de la pièce. */
export function regleLeDuBillet(p: { date?: unknown; payments?: unknown }): string {
  const jours = (Array.isArray(p.payments) ? p.payments as { date?: unknown; amountXof?: unknown }[] : [])
    .filter((v) => nombreDuBillet(v?.amountXof) > 0)
    .map((v) => String(v?.date ?? '').slice(0, 10))
    .filter((j) => JOUR_DU_BILLET.test(j))
    .sort();
  return jours.length ? jours[jours.length - 1] : String(p.date ?? '').slice(0, 10);
}

/** Les fiches à lire : la tête soignée (`forClientId`, sinon `clientId`), et
    celle qui a réglé quand c'est une autre (un parent pour son enfant). */
export function fichesDeLaFactureDuBillet(p: { clientId?: unknown; forClientId?: unknown }): { tete: string; payeuse: string | null } {
  return {
    tete: String(p.forClientId ?? p.clientId ?? ''),
    payeuse: !p.forClientId || p.forClientId === p.clientId ? null : String(p.clientId ?? ''),
  };
}

const fxDuBillet = (x: unknown): { code: string; rate: number; amount: number } | undefined => {
  const f = x as { code?: unknown; rate?: unknown; amount?: unknown } | null;
  return f && typeof f === 'object' && typeof f.code === 'string' && /^[A-Z]{3}$/.test(f.code) && Number.isFinite(Number(f.rate)) && Number.isFinite(Number(f.amount))
    ? { code: f.code, rate: Number(f.rate), amount: Number(f.amount) } : undefined;
};
/** Ce que la ligne porte, toujours en tableau (la règle de `detailPorte`). */
const detailDuBillet = (d: unknown): string[] => (Array.isArray(d)
  ? d.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  : typeof d === 'string' && d.trim() ? [d.trim()] : []);

/** LA FACTURE QUE LE BILLET PORTE : les seuls champs que le PDF imprime, lus
    un par un dans la pièce (jamais recopiée en bloc), la tête soignée, la
    branche, le jour du règlement. null si la pièce n'a pas de quoi faire un
    papier (sans numéro, sans jour, sans lignes) ou si la branche manque. */
export function factureDuBillet(o: {
  piece: Record<string, unknown>;
  tete: Record<string, unknown> | null;
  payeuse: Record<string, unknown> | null;
  branche: Record<string, unknown> | null;
  raison?: unknown;
}): FactureDuBillet | null {
  const p = o.piece;
  const number = texteDuBillet(p.number);
  const date = String(p.date ?? '').slice(0, 10);
  const nomDeLaBranche = texteDuBillet(o.branche?.name);
  if (!number || !JOUR_DU_BILLET.test(date) || !Array.isArray(p.lines) || p.lines.length === 0 || !nomDeLaBranche) return null;
  const lines: LigneDeLaFactureDuBillet[] = (p.lines as unknown[]).map((brute) => {
    const l = (brute ?? {}) as Record<string, unknown>;
    const remise = nombreDuBillet(l.discountXof);
    const detail = detailDuBillet(l.detail);
    return {
      label: String(l.label ?? ''), qty: nombreDuBillet(l.qty), unitXof: nombreDuBillet(l.unitXof), discountPct: nombreDuBillet(l.discountPct),
      ...(remise !== 0 ? { discountXof: remise } : {}), ...(detail.length > 0 ? { detail } : {}),
    };
  });
  const payments: VersementDeLaFactureDuBillet[] = (Array.isArray(p.payments) ? p.payments as unknown[] : []).map((brut) => {
    const v = (brut ?? {}) as Record<string, unknown>;
    const fx = fxDuBillet(v.fx);
    return { date: String(v.date ?? '').slice(0, 10), method: String(v.method ?? ''), amountXof: nombreDuBillet(v.amountXof), ...(fx ? { fx } : {}) };
  });
  const fx = fxDuBillet(p.fx);
  const remiseGlobale = nombreDuBillet(p.globalDiscountXof);
  const piece: PieceDeLaFactureDuBillet = {
    number, date, kind: 'facture', lines,
    globalDiscountPct: nombreDuBillet(p.globalDiscountPct),
    ...(remiseGlobale !== 0 ? { globalDiscountXof: remiseGlobale } : {}),
    ...(typeof p.discountLabel === 'string' ? { discountLabel: p.discountLabel } : {}),
    payments,
    ...(typeof p.payment === 'string' ? { payment: p.payment } : {}),
    ...(fx ? { fx } : {}),
    ...(nombreDuBillet(p.tipXof) > 0 ? { tipXof: nombreDuBillet(p.tipXof) } : {}),
    status: String(p.status ?? ''),
    ...(typeof p.master === 'string' ? { master: p.master } : {}),
    ...(texteDuBillet(p.note) ? { note: String(p.note) } : {}),
  };
  /* La tête soignée : son nom de fiche, sinon le nom libre de la pièce, sinon
     « Cliente de passage » (`clientNameForPdf`) ; l'appel lit le même nom
     que le Trône (`clientNameOf`). */
  const t = o.tete;
  const libre = typeof p.clientName === 'string' ? p.clientName : undefined;
  const nom = t ? String(t.name ?? '') : (libre?.trim() && libre.trim().toLowerCase() !== 'walk-in' ? libre.trim() : 'Cliente de passage');
  const cliente: ClienteDeLaFactureDuBillet = {
    nom,
    ...(texteDuBillet(o.payeuse?.name) ? { payeuse: String(o.payeuse?.name) } : {}),
    ...(texteDuBillet(t?.phone) ? { telephone: String(t?.phone) } : {}),
    name: t && typeof t.name === 'string' ? t.name : libre ?? 'Walk-in',
    ...(texteDuBillet(t?.civilite) ? { civilite: String(t?.civilite) } : {}),
    ...(t?.auMasculin === true ? { auMasculin: true } : {}),
  };
  const b = o.branche;
  const maitres = Array.isArray(b?.masters) ? b?.masters as unknown[] : [];
  const maison: MaisonDeLaFactureDuBillet = {
    nom: nomDeLaBranche,
    ...(texteDuBillet(b?.city) ? { ville: String(b?.city) } : {}),
    ...(typeof b?.currency === 'string' && /^[A-Z]{3}$/.test(b.currency) ? { devise: b.currency } : {}),
    ...(texteDuBillet(o.raison) ? { raison: String(o.raison) } : {}),
    /* Le premier maître ne sert qu'au mot par défaut : il ne part que si la
       pièce ne nomme aucune main et ne porte aucun mot. */
    ...(typeof p.master !== 'string' && !texteDuBillet(p.note) && typeof maitres[0] === 'string' ? { maitre: maitres[0] as string } : {}),
  };
  return { piece, cliente, maison, regleLe: regleLeDuBillet(p) };
}
/* ⟨/billet-regle⟩ */

/* ══ AU SITE (rien de ceci ne part au serveur) ═══════════════════════════ */

const estUnObjet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const nombreSur = (x: unknown, min = 0, max = 1e10): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null);
const texteSur = (x: unknown, max = 400): string | null => (typeof x === 'string' && x.length <= max ? x : null);
const optionnel = <T>(x: unknown, lis: (y: unknown) => T | null): T | undefined | null => (x === undefined ? undefined : lis(x));
const fxSur = (x: unknown): { code: string; rate: number; amount: number } | null => {
  if (!estUnObjet(x) || typeof x.code !== 'string' || !/^[A-Z]{3}$/.test(x.code)) return null;
  const rate = nombreSur(x.rate, 0); const amount = nombreSur(x.amount, 0);
  return rate === null || amount === null ? null : { code: x.code, rate, amount };
};

/** LA FACTURE DU BILLET, RELUE AVANT D'ÊTRE CRUE. Sa forme exacte, champ par
    champ, reconstruite sans rien d'autre ; elle doit aussi être soldée avec
    de l'argent reçu. Sinon null : la page l'ignore, le billet reste. */
export function factureLue(brut: unknown): FactureDuBillet | null {
  if (!estUnObjet(brut) || !estUnObjet(brut.piece) || !estUnObjet(brut.cliente) || !estUnObjet(brut.maison)) return null;
  const regleLe = texteSur(brut.regleLe, 10);
  const p = brut.piece; const c = brut.cliente; const m = brut.maison;
  const number = texteSur(p.number, 40);
  const date = texteSur(p.date, 10);
  if (!regleLe || !JOUR_DU_BILLET.test(regleLe) || !number?.trim() || !date || !JOUR_DU_BILLET.test(date) || p.kind !== 'facture') return null;
  if (!Array.isArray(p.lines) || p.lines.length === 0 || p.lines.length > 60 || !Array.isArray(p.payments) || p.payments.length > 60) return null;
  const lines: LigneDeLaFactureDuBillet[] = [];
  for (const brute of p.lines as unknown[]) {
    if (!estUnObjet(brute)) return null;
    const label = texteSur(brute.label, 300); const qty = nombreSur(brute.qty); const unitXof = nombreSur(brute.unitXof);
    const discountPct = nombreSur(brute.discountPct, 0, 100); const discountXof = optionnel(brute.discountXof, (y) => nombreSur(y));
    const detail = optionnel(brute.detail, (y) => (Array.isArray(y) && y.length <= 40 && y.every((s) => typeof s === 'string' && s.length <= 300) ? y as string[] : null));
    if (label === null || qty === null || unitXof === null || discountPct === null || discountXof === null || detail === null) return null;
    lines.push({ label, qty, unitXof, discountPct, ...(discountXof !== undefined ? { discountXof } : {}), ...(detail !== undefined ? { detail } : {}) });
  }
  const payments: VersementDeLaFactureDuBillet[] = [];
  for (const brut of p.payments as unknown[]) {
    if (!estUnObjet(brut)) return null;
    const jour = texteSur(brut.date, 10); const method = texteSur(brut.method, 120); const amountXof = nombreSur(brut.amountXof);
    const fx = optionnel(brut.fx, fxSur);
    if (!jour || !JOUR_DU_BILLET.test(jour) || method === null || amountXof === null || fx === null) return null;
    payments.push({ date: jour, method, amountXof, ...(fx ? { fx } : {}) });
  }
  const globalDiscountPct = nombreSur(p.globalDiscountPct, 0, 100);
  const globalDiscountXof = optionnel(p.globalDiscountXof, (y) => nombreSur(y));
  const discountLabel = optionnel(p.discountLabel, (y) => texteSur(y, 200));
  const payment = optionnel(p.payment, (y) => texteSur(y, 120));
  const fx = optionnel(p.fx, fxSur);
  const tipXof = optionnel(p.tipXof, (y) => nombreSur(y));
  const status = texteSur(p.status, 40);
  const master = optionnel(p.master, (y) => texteSur(y, 120));
  const note = optionnel(p.note, (y) => texteSur(y, 2000));
  if (globalDiscountPct === null || globalDiscountXof === null || discountLabel === null || payment === null || fx === null
    || tipXof === null || status === null || master === null || note === null) return null;
  const piece: PieceDeLaFactureDuBillet = {
    number, date, kind: 'facture', lines, globalDiscountPct,
    ...(globalDiscountXof !== undefined ? { globalDiscountXof } : {}), ...(discountLabel !== undefined ? { discountLabel } : {}),
    payments, ...(payment !== undefined ? { payment } : {}), ...(fx ? { fx } : {}), ...(tipXof !== undefined ? { tipXof } : {}),
    status, ...(master !== undefined ? { master } : {}), ...(note !== undefined ? { note } : {}),
  };
  /* Soldée, de l'argent reçu : sinon ce n'est pas la facture d'un rendez-vous réglé. */
  const commeLaFin: PieceDeLaFin = { ...piece, id: piece.number };
  if (resteDeLaPieceDeLaFin(commeLaFin) > 0 || argentDeLaPieceDuBillet(commeLaFin) <= 0) return null;
  const nom = texteSur(c.nom, 200); const name = texteSur(c.name, 200);
  const payeuse = optionnel(c.payeuse, (y) => texteSur(y, 200)); const telephone = optionnel(c.telephone, (y) => texteSur(y, 40));
  const civilite = optionnel(c.civilite, (y) => texteSur(y, 40)); const auMasculin = optionnel(c.auMasculin, (y) => (y === true ? true : null));
  if (nom === null || name === null || payeuse === null || telephone === null || civilite === null || auMasculin === null) return null;
  const nomDeLaMaison = texteSur(m.nom, 120);
  const ville = optionnel(m.ville, (y) => texteSur(y, 120)); const devise = optionnel(m.devise, (y) => (typeof y === 'string' && /^[A-Z]{3}$/.test(y) ? y : null));
  const raison = optionnel(m.raison, (y) => texteSur(y, 300)); const maitre = optionnel(m.maitre, (y) => texteSur(y, 120));
  if (!nomDeLaMaison?.trim() || ville === null || devise === null || raison === null || maitre === null) return null;
  return {
    piece,
    cliente: { nom, ...(payeuse !== undefined ? { payeuse } : {}), ...(telephone !== undefined ? { telephone } : {}), name, ...(civilite !== undefined ? { civilite } : {}), ...(auMasculin ? { auMasculin } : {}) },
    maison: { nom: nomDeLaMaison, ...(ville !== undefined ? { ville } : {}), ...(devise !== undefined ? { devise } : {}), ...(raison !== undefined ? { raison } : {}), ...(maitre !== undefined ? { maitre } : {}) },
    regleLe,
  };
}

/** Le total réglé, en francs : celui de la pièce (le « Total » du papier). */
export const totalDeLaFactureDuBillet = (f: FactureDuBillet): number => totalDeLaPieceDuBillet({ ...f.piece, id: f.piece.number });

/** LA PIÈCE QUE LE PAPIER LIT, à partir de la facture du billet. Ce que le
    Trône n'imprime pas reste neutre (ni identifiant, ni fiche, ni caisse). */
export function pieceDuPapierDuSite(f: FactureDuBillet): Invoice {
  const p = f.piece;
  return {
    id: p.number, branchId: '', kind: 'facture', number: p.number, clientId: '', date: p.date,
    lines: p.lines.map((l, i) => ({ id: `l${i + 1}`, ...l })),
    globalDiscountPct: p.globalDiscountPct,
    ...(p.globalDiscountXof !== undefined ? { globalDiscountXof: p.globalDiscountXof } : {}),
    ...(p.discountLabel !== undefined ? { discountLabel: p.discountLabel } : {}),
    ...(p.fx ? { fx: p.fx } : {}),
    theme: 'Rose',
    status: p.status as Invoice['status'],
    ...(p.payment !== undefined ? { payment: p.payment as Invoice['payment'] } : {}),
    ...(p.payments.length > 0 ? { payments: p.payments.map((v, i) => ({ id: `v${i + 1}`, ...v, method: v.method as NonNullable<Invoice['payment']> })) } : {}),
    ...(p.note !== undefined ? { note: p.note } : {}),
    ...(p.master !== undefined ? { master: p.master } : {}),
    ...(p.tipXof !== undefined ? { tipXof: p.tipXof } : {}),
  };
}

/** CE QUE LA PAGE TEND À `donneesDuPdfDeLaPiece` : ce que le crochet du Trône
    lit dans ses magasins, pris dans la facture du billet. La pièce est
    soldée : rien pour payer. La ligne légale suit la règle du Trône
    (`maisonRaisonDuPdfAu`) : aucune avant la bascule, la raison de la
    Maison depuis. */
export function contexteDuPapierDuSite(f: FactureDuBillet, papier: Pick<typeof PapierDeLaPiece, 'ligneSousLeVerrou'>): PapierDeLaPiece.ContexteDuPdfDeLaPiece {
  const c = f.cliente;
  return {
    maison: f.maison.nom,
    sousLeVerrou: papier.ligneSousLeVerrou(f.maison.ville),
    devise: f.maison.devise ?? 'XOF',
    legal: f.piece.date < BASCULE_DE_L_IDENTITE ? undefined : (f.maison.raison?.trim() || RAISON_MAISON_MND),
    nomPourLePdf: c.nom,
    payeuse: c.payeuse,
    telephone: c.telephone,
    appel: appelDe({ name: c.name, civilite: c.civilite as Civilite | undefined, auMasculin: c.auMasculin }, c.name),
    maitreDeRepli: f.maison.maitre,
    contenuDeLaLigne: (_d, l) => l.detail ?? [],
  };
}

/** LE PAPIER DU BILLET : la même règle que le Trône (`donneesDuPdfDeLaPiece`),
    le module du papier chargé à la demande par la page. */
export const papierDuBillet = (f: FactureDuBillet, papier: Pick<typeof PapierDeLaPiece, 'ligneSousLeVerrou' | 'donneesDuPdfDeLaPiece'>): InvoicePdfData =>
  papier.donneesDuPdfDeLaPiece(pieceDuPapierDuSite(f), contexteDuPapierDuSite(f, papier));
