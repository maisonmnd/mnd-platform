/* ═══════════════════════════════════════════════════════════════════
   RELANCES-FACTURES — la tournée du matin des factures à régler.

   « Comment je fais des messages de relance tant que la cliente n'a pas
   payé ? » (Yéman, 18 octobre 2026). Maquette « Les relances » validée le
   même jour (public/maquette-les-relances.html, choix en base
   `maquette/relances`).

   Réveillée chaque matin à 10 h (heure du salon) par le cron, elle :
     ① lit les réglages : relances allumées (Paramètres › Relances), MND PAY
        et Tap & Go ouverts (le bouton « Régler » en a besoin) ;
     ② lit les factures du lancement et après, plus celles du rattrapage
        validé ; garde celles qui restent à régler, sans pause ;
     ③ décide la relance du jour (J+1, J+3, J+7, J+14, comptés depuis la
        facture, ou depuis la validation pour une facture rattrapée) ;
     ④ s'arrête pour une cliente qui a écrit à la Maison depuis la première
        relance, ou qui a déjà payé par un lien (même si aucun Trône n'est
        ouvert pour l'inscrire) ;
     ⑤ pose l'attente Tap & Go du reste (une par facture, comme mnd-pay) pour
        que le paiement revienne seul sur la facture ;
     ⑥ DÉPOSE le message dans la salle d'attente des envois (le facteur
        `envois-partent` le porte, jamais pendant les heures calmes), une
        ligne par facture et par rang, à identifiant déterministe : le cron
        peut se réveiller dix fois, une relance ne part qu'une.

   JAMAIS DEUX RELANCES LE MÊME JOUR À LA MÊME CLIENTE, même pour deux
   factures. Une borne par passage : quarante messages au plus.

   RIEN NE PART SANS SON MODÈLE : le secret WA_TEMPLATE_RELANCE nomme le
   modèle approuvé par Meta (`rappel_de_reglement`). Variables : {{1}} son
   appel, {{2}} le jour de la facture avec l'année, {{3}} le reste ; bouton
   URL dynamique « Régler » (payer.html?tg={{1}}). Jamais le numéro de la
   pièce dans le texte : WhatsApp le prend pour un téléphone.

   AUCUN SECRET ICI. Tout vient de l'environnement de la fonction.
   Déploiement : Supabase → Edge Functions → New function
   « relances-factures » → coller CE FICHIER ENTIER → Deploy. Puis le cron
   (Integrations → Cron), `0 9 * * *` : 9 h à Greenwich, 10 h au salon.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── DEBUT tournee (tout le juge et la tournée : scripts/verifie-les-relances les rejoue contre une base simulée)

const TZ = 'Africa/Porto-Novo'; // le fuseau du salon, pas celui du serveur

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-10-18-a · les relances des factures';

/** Numéro béninois → format international sans « + » (copie de rappels-j1). */
const numeroIntl = (brut: string | undefined): string | null => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};

/* La Maison écrit « Madame Naffi ». Recopié de `src/shared/civilite.ts` ;
   `verifie-civilite` tient la copie. */
const appelDe = (d: { name?: unknown; civilite?: unknown; auMasculin?: unknown } | null | undefined, repli?: unknown): string => {
  const civ = d?.civilite === 'monsieur' || d?.civilite === 'mademoiselle' || d?.civilite === 'madame'
    ? d.civilite : d?.auMasculin === true ? 'monsieur' : '';
  const prenom = String(d?.name ?? repli ?? '').trim().split(/\s+/)[0] ?? '';
  /* La civilité inconnue ne se suppose plus (13 octobre 2026) : le prénom seul. */
  if (!civ) return prenom || 'Madame, Monsieur';
  const mot = civ === 'monsieur' ? 'Monsieur' : civ === 'mademoiselle' ? 'Mademoiselle' : 'Madame';
  return prenom ? `${mot} ${prenom}` : mot;
};

/** « 18 octobre 2026 » : le jour de la facture, L'ANNÉE DITE (règle de la Maison). */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateDite = (iso: string): string => {
  const [a, m, j] = (iso ?? '').slice(0, 10).split('-').map(Number);
  return a && m && j ? `${j} ${MOIS[m - 1]} ${a}` : iso;
};

/** « 2 000 F ». */
const enFrancs = (xof: number): string => `${Math.round(xof).toLocaleString('fr-FR')} F`;

/* ══ LA SALLE D'ATTENTE — recopiée de rappels-j1 (src/shared/salle-des-envois.ts) ══ */
const DECALAGE_DU_SALON_H = 1;
type ReglesDeLaSalle = { salleMin: number; calmeDe: number; calmeA: number };
const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };
const FACTEUR_VIVANT_MS = 5 * 60_000;
function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}
const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};
function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}
function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}
function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}
const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};
/* ── fin du calcul recopié ── */

const depot = (maintenantMs: number, r: ReglesDeLaSalle, colis: Record<string, unknown>, prenom?: string): Record<string, unknown> => {
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  return {
    deposeLe: new Date(maintenantMs).toISOString(), partA: new Date(partA).toISOString(),
    ...(calme ? { calme: true } : {}), ...(prenom ? { prenom } : {}), colis,
  };
};

// ── DEBUT relances (copie de src/shared/relances-pur.ts, éprouvée par scripts/verifie-les-relances)
export type ReglagesRelances = {
  /** Allumées par la direction (Paramètres › Relances). */
  actives?: boolean;
  /** Le jour du lancement : les factures datées de ce jour ou après se relancent d'office. */
  depuis?: string;
  /** Les trente jours d'avant le lancement, validés une fois, facture par facture. */
  rattrapage?: { valideLe: string; par?: string; ids: string[] };
};

/** J+1, J+3, J+7, J+14 : les jours des quatre relances, comptés depuis le départ. */
export const CADENCE_DES_RELANCES: readonly number[] = [1, 3, 7, 14];
/** Ce que le rattrapage peut reprendre avant le lancement. */
export const JOURS_DE_RATTRAPAGE = 30;

export const jourPlusR = (iso: string, j: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + j);
  return d.toISOString().slice(0, 10);
};

/** L'identifiant d'une relance au journal des envois : une par facture et par rang. */
export const idDeLaRelance = (factureId: string, n: number): string => `rl-${factureId}-${n}-whatsapp`;

/** Une facture (jamais un devis, jamais un brouillon). */
export const seRelance = (f: { kind?: string; status?: string }): boolean =>
  f.kind === 'facture' && f.status !== 'brouillon';

/** LE JOUR D'OÙ SE COMPTENT SES RELANCES, ou null si elle n'en a pas. */
export function departDesRelances(f: { id: string; date: string }, r: ReglagesRelances | undefined): string | null {
  const depuis = r?.depuis ?? '';
  if (!r?.actives || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return null;
  if (f.date >= depuis) return f.date;
  const rt = r.rattrapage;
  if (rt && /^\d{4}-\d{2}-\d{2}$/.test(rt.valideLe) && rt.ids.includes(f.id) && f.date >= jourPlusR(depuis, -JOURS_DE_RATTRAPAGE)) {
    return rt.valideLe > f.date ? rt.valideLe : f.date;
  }
  return null;
}

/** LA RELANCE À POSER AUJOURD'HUI (1 à 4), ou null.
    `parties` : les relances déjà déposées (un échec ne compte pas, il se
    retente) ; `derniereLe` : le jour de la dernière, pour qu'aucune cliente
    n'en reçoive deux le même jour. */
export function relanceDuJour(o: {
  depart: string | null; parties: number; derniereLe?: string; aujourdhui: string;
  resteXof: number; enPause: boolean; aRepondu: boolean;
}): number | null {
  if (!o.depart || !(o.resteXof > 0) || o.enPause || o.aRepondu) return null;
  if (o.parties >= CADENCE_DES_RELANCES.length) return null;
  if (o.derniereLe && o.derniereLe >= o.aujourdhui) return null;
  return jourPlusR(o.depart, CADENCE_DES_RELANCES[o.parties]) <= o.aujourdhui ? o.parties + 1 : null;
}

/** Elle a écrit à la Maison depuis la première relance : tout s'arrête. */
export const aReponduDepuis = (messages: readonly { sens?: string; quand?: string }[], depuisIso: string | undefined): boolean =>
  !!depuisIso && messages.some((m) => m.sens === 'entrant' && (m.quand ?? '') > depuisIso);
// ── FIN relances

// ── DEBUT resteDeLaFacture (copie de src/shared/finance.ts, éprouvée par scripts/verifie-les-relances)
type LigneLue = { qty: number; unitXof: number; discountPct: number; discountXof?: number };
type FactureLue = {
  id: string; kind?: string; status?: string; date: string; number?: string; branchId?: string;
  clientId: string; forClientId?: string; clientName?: string;
  lines: LigneLue[]; globalDiscountPct: number; globalDiscountXof?: number;
  payments?: { id: string; amountXof: number }[];
  relancesPause?: { le: string; par?: string };
};
const ligneNetXof = (l: LigneLue): number =>
  Math.max(0, l.qty * l.unitXof * (1 - l.discountPct / 100) - (l.discountXof ?? 0));
const totalDeLaFacture = (inv: FactureLue): number => {
  const sub = (inv.lines ?? []).reduce((s, l) => s + ligneNetXof(l), 0);
  return Math.max(0, Math.round(sub * (1 - (inv.globalDiscountPct ?? 0) / 100)) - (inv.globalDiscountXof ?? 0));
};
const regleDeLaFacture = (inv: FactureLue): number => {
  if (inv.payments && inv.payments.length > 0) return inv.payments.reduce((s, p) => s + p.amountXof, 0);
  return inv.status === 'payée' ? totalDeLaFacture(inv) : 0;
};
const resteDeLaFacture = (inv: FactureLue): number => Math.max(0, totalDeLaFacture(inv) - regleDeLaFacture(inv));
// ── FIN resteDeLaFacture

// ── DEBUT fraisTapGo (même calcul que compteDeLaDemande, src/shared/mnd-pay-pur.ts)
type ReglagesTapGo = { actif?: boolean; tapgo?: { actif?: boolean; code?: string; tauxPct?: number } };
const TAUX_TAPGO_DEFAUT = 1.6;
const CODE_TAPGO_DEFAUT = '51166';
const fraisTapGo = (baseXof: number, r: ReglagesTapGo | undefined): number => {
  const base = Math.max(0, Math.round(Number.isFinite(baseXof) ? baseXof : 0));
  if (base <= 0) return 0;
  const t = Number(r?.tapgo?.tauxPct ?? TAUX_TAPGO_DEFAUT);
  const pct = Number.isFinite(t) && t >= 0 ? t : TAUX_TAPGO_DEFAUT;
  return pct > 0 ? Math.ceil((base * pct) / 100 - 1e-9) : 0;
};
const codeTapGo = (r: ReglagesTapGo | undefined): string => String(r?.tapgo?.code ?? '').replace(/\D/g, '') || CODE_TAPGO_DEFAUT;
// ── FIN fraisTapGo

/** Les verdicts du journal qui ne comptent pas comme une relance partie. */
const SE_RETENTE = new Set(['échec', 'périmé']);
const BORNE_DES_RELANCES = 40;
/** Une attente plus vieille ne survivrait pas aux quarante-cinq jours : on la refait. */
const ATTENTE_RAFRAICHIE_MS = 30 * 86_400_000;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

/** Le jour LOCAL d'un instant ISO. */
const jourDuSalon = (iso: string): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

/** LA TOURNÉE : lit, juge, pose les attentes, dépose. `sb` est le client
    service ; le banc lui passe une base simulée, et un faux `envoie`. */
// deno-lint-ignore no-explicit-any
async function tournee(sb: any, o: { maintenantMs: number; MODELE: string; WA_TOKEN: string; WA_PHONE_ID: string; envoie?: typeof fetch }): Promise<Record<string, unknown>> {
  const { maintenantMs, MODELE, WA_TOKEN, WA_PHONE_ID } = o;
  const envoie = o.envoie ?? fetch;
  const aujourdhui = new Date(maintenantMs).toLocaleDateString('en-CA', { timeZone: TZ });

  const { data: docs } = await sb.from('documents').select('key, data')
    .in('key', ['mnd_settings', 'mnd_auto_config', 'mnd_facteur']);
  const reglages = (docs?.find((d) => d.key === 'mnd_settings')?.data ?? {}) as { relances?: ReglagesRelances; mndPay?: ReglagesTapGo };
  const r = reglages.relances;
  if (!r?.actives || !r.depuis) return { version: VERSION, relances: 'eteintes' };
  /* Le bouton « Régler » compose Tap & Go : sans lui, une relance ne fait pas payer. */
  if (reglages.mndPay?.actif !== true || reglages.mndPay?.tapgo?.actif === false) return { version: VERSION, relances: 'tapgo-eteint' };
  const regles = reglesDepuis(docs?.find((d) => d.key === 'mnd_auto_config')?.data as Record<string, unknown> | undefined);
  const salleOuverte = facteurVivant((docs?.find((d) => d.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, maintenantMs);
  if (!salleOuverte && (!WA_TOKEN || !WA_PHONE_ID)) return { version: VERSION, relances: 'sans-facteur' };

  /* ② LES FACTURES. Une relance part au plus tard à J+14 : on lit les vingt
     derniers jours (la marge d'un cron qui aurait manqué un matin), jamais
     avant le lancement ; et, tant qu'il court, le rattrapage validé. */
  const plancher = (() => { const p = jourPlusR(aujourdhui, -20); return p > r.depuis ? p : r.depuis; })();
  const factures: FactureLue[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('invoices').select('id, data')
      .eq('data->>kind', 'facture').gte('data->>date', plancher).range(de, de + 999);
    if (error) return { version: VERSION, relances: 'lecture-refusee', motif: error.message.slice(0, 120) };
    factures.push(...(data ?? []).map((l) => ({ ...(l.data as FactureLue), id: l.id as string })));
    if ((data ?? []).length < 1000) break;
  }
  const rt = r.rattrapage;
  if (rt?.ids?.length && /^\d{4}-\d{2}-\d{2}$/.test(rt.valideLe) && jourPlusR(rt.valideLe, 20) >= aujourdhui) {
    const connues = new Set(factures.map((f) => f.id));
    const manquent = rt.ids.filter((id) => !connues.has(id));
    for (let i = 0; i < manquent.length; i += 200) {
      const { data } = await sb.from('invoices').select('id, data').in('id', manquent.slice(i, i + 200));
      factures.push(...(data ?? []).map((l) => ({ ...(l.data as FactureLue), id: l.id as string })));
    }
  }
  const enLice = factures.filter((f) => seRelance(f) && !f.relancesPause && departDesRelances(f, r) !== null && resteDeLaFacture(f) > 0);
  if (enLice.length === 0) return { version: VERSION, relances: 0, jour: aujourdhui, lues: factures.length };

  /* ④ LES LIENS DÉJÀ PAYÉS que personne n'a encore inscrits (aucun Trône
     ouvert) : ils comptent. Une cliente qui vient de payer n'est pas relancée. */
  const { data: payees } = await sb.from('mnd_pay').select('id, data')
    .in('data->>pieceId', enLice.map((f) => f.id)).eq('data->>statut', 'payee');
  const payeParPiece = new Map<string, number>();
  for (const l of (payees ?? []) as { id: string; data: { pieceId?: string; genre?: string; montantXof?: number } }[]) {
    const f = enLice.find((x) => x.id === l.data?.pieceId);
    if (!f || l.data?.genre !== 'lien' || (f.payments ?? []).some((p) => p.id === l.id)) continue;
    payeParPiece.set(f.id, (payeParPiece.get(f.id) ?? 0) + Math.round(Number(l.data?.montantXof) || 0));
  }

  /* Les fiches : la payeuse si elle a un numéro, sinon la cliente soignée. */
  const idsFiches = [...new Set(enLice.flatMap((f) => [f.clientId, f.forClientId]).filter((x): x is string => !!x))];
  const fiches = new Map<string, { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean; archived?: boolean }>();
  for (let i = 0; i < idsFiches.length; i += 200) {
    const { data } = await sb.from('clients').select('id, data').in('id', idsFiches.slice(i, i + 200));
    for (const l of data ?? []) fiches.set(l.id as string, { id: l.id as string, ...(l.data as object) });
  }

  /* Le journal : les relances déjà posées, et celles d'aujourd'hui (une cliente, une relance par jour). */
  const idsJournal = enLice.flatMap((f) => CADENCE_DES_RELANCES.map((_, k) => idDeLaRelance(f.id, k + 1)));
  const journal = new Map<string, { statut?: string; quand?: string }>();
  for (let i = 0; i < idsJournal.length; i += 200) {
    const { data } = await sb.from('envois').select('id, data').in('id', idsJournal.slice(i, i + 200));
    for (const l of data ?? []) journal.set(l.id as string, l.data as { statut?: string; quand?: string });
  }
  const debutDuJour = new Date(Date.parse(`${aujourdhui}T00:00:00Z`) - DECALAGE_DU_SALON_H * 3_600_000).toISOString();
  const { data: duJour } = await sb.from('envois').select('id, data').eq('data->>type', 'relance-facture').gte('data->>quand', debutDuJour);
  const relanceesAujourdhui = new Set(((duJour ?? []) as { data: { numero?: string; statut?: string } }[])
    .filter((l) => !SE_RETENTE.has(l.data?.statut ?? '')).map((l) => l.data?.numero ?? '').filter(Boolean));

  let parties = 0;
  let bornee = false;
  const sautes: Record<string, number> = {};
  const saute = (pourquoi: string) => { sautes[pourquoi] = (sautes[pourquoi] ?? 0) + 1; };

  for (const f of enLice) {
    if (parties >= BORNE_DES_RELANCES) { bornee = true; break; }
    const depart = departDesRelances(f, r);
    const reste = Math.max(0, resteDeLaFacture(f) - (payeParPiece.get(f.id) ?? 0));
    const payeuse = fiches.get(f.clientId);
    const soignee = fiches.get(f.forClientId ?? f.clientId);
    const fiche = numeroIntl(payeuse?.phone) ? payeuse : soignee;
    const tel = numeroIntl(fiche?.phone);
    if (!fiche || !tel) { saute('sans-numero'); continue; }
    if (fiche.archived) { saute('archivee'); continue; }

    let partiesDeLaFacture = 0;
    let derniereLe: string | undefined;
    let premiereQuand: string | undefined;
    for (let n = 1; n <= CADENCE_DES_RELANCES.length; n++) {
      const l = journal.get(idDeLaRelance(f.id, n));
      if (!l || SE_RETENTE.has(l.statut ?? '')) break;
      partiesDeLaFacture = n;
      if (l.quand) { derniereLe = jourDuSalon(l.quand); if (n === 1) premiereQuand = l.quand; }
    }
    let aRepondu = false;
    if (premiereQuand) {
      const { data: msgs } = await sb.from('messages_wa').select('id, data')
        .eq('data->>numero', tel).eq('data->>sens', 'entrant').gt('data->>quand', premiereQuand).limit(1);
      aRepondu = aReponduDepuis(((msgs ?? []) as { data: { sens?: string; quand?: string } }[]).map((m) => m.data), premiereQuand);
    }
    const n = relanceDuJour({ depart, parties: partiesDeLaFacture, derniereLe, aujourdhui, resteXof: reste, enPause: !!f.relancesPause, aRepondu });
    if (n === null) { saute(aRepondu ? 'a-repondu' : reste <= 0 ? 'payee' : 'pas-aujourdhui'); continue; }
    if (relanceesAujourdhui.has(tel)) { saute('deja-relancee-aujourdhui'); continue; }

    /* ⑤ L'ATTENTE TAP & GO DU RESTE, comme mnd-pay : la même facture au même
       total, c'est la même attente ; un reste qui a changé la remplace ; une
       attente trop vieille pour finir sa fenêtre se refait. */
    const fraisXof = fraisTapGo(reste, reglages.mndPay);
    const totalXof = reste + fraisXof;
    const { data: attentes } = await sb.from('mnd_pay').select('id, data')
      .eq('data->>moyen', 'tapgo').eq('data->>statut', 'en_attente').eq('data->>pieceId', f.id).limit(20);
    const meme = ((attentes ?? []) as { id: string; data: { totalXof?: number; creeLe?: string } }[])
      .find((l) => Math.round(Number(l.data?.totalXof ?? 0)) === totalXof && maintenantMs - Date.parse(l.data?.creeLe ?? '') < ATTENTE_RAFRAICHIE_MS);
    if (!meme) {
      for (const l of (attentes ?? []) as { id: string; data: Record<string, unknown> }[]) {
        await sb.from('mnd_pay').update({ data: { ...l.data, statut: 'annulee', raison: 'remplacée par la relance : reste changé ou attente trop vieille' } }).eq('id', l.id);
      }
      const idAttente = `mp-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const { error: errAttente } = await sb.from('mnd_pay').insert({
        id: idAttente, branch_id: f.branchId ?? null,
        data: {
          id: idAttente, branchId: f.branchId, genre: 'lien', moyen: 'tapgo', montantXof: reste, fraisXof, totalXof,
          pieceId: f.id, ...(f.number ? { pieceNumero: String(f.number).slice(0, 40) } : {}), clientId: fiche.id,
          libelle: 'Maison MND · relance', statut: 'en_attente', creeLe: new Date(maintenantMs).toISOString(), creePar: 'la Maison, automatiquement',
        },
      });
      if (errAttente) { saute('attente-refusee'); continue; }
    }

    /* ⑥ LE MESSAGE. */
    const idEnvoi = idDeLaRelance(f.id, n);
    const appel = appelDe(fiche, f.clientName);
    const jour = dateDite(f.date);
    const resteDit = enFrancs(reste);
    const parametre = `${codeTapGo(reglages.mndPay)}-${totalXof}`;
    const composants = [
      { type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: jour }, { type: 'text', text: resteDit }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: parametre }] },
    ];
    const texteDuFil = `Bonjour ${appel}, un petit rappel de la Maison MND : votre facture du ${jour} attend encore son règlement, reste ${resteDit}. Touchez « Régler » : votre téléphone compose le numéro de paiement, frais compris. Si c'est déjà fait, merci, et ne tenez pas compte de ce message. [Régler]`;
    const maintenant = new Date(maintenantMs).toISOString();
    const commun = {
      id: idEnvoi, branchId: f.branchId, type: 'relance-facture', canal: 'whatsapp', apptId: '', dateRdv: '', invoiceId: f.id, rang: n,
      clientId: fiche.id, numero: tel, dateFacture: f.date, quand: maintenant,
    };
    if (salleOuverte) {
      await sb.from('envois').upsert({
        id: idEnvoi, branch_id: f.branchId ?? null,
        data: {
          ...commun, statut: 'en-attente',
          ...depot(maintenantMs, regles, { genre: 'whatsapp', numero: tel, modele: MODELE, parQui: 'la Maison, automatiquement', texteAuFil: texteDuFil, composants }, appel),
        },
      }, { onConflict: 'id' });
      relanceesAujourdhui.add(tel);
      parties++;
      continue;
    }
    /* Le facteur se tait : on envoie comme les rappels, hors des heures calmes seulement. */
    if (dansLesHeuresCalmes(maintenantMs, regles)) { saute('heures-calmes'); continue; }
    let statut = 'échec';
    let detail: string | undefined;
    let waId = '';
    try {
      const rep = await envoie(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'template', template: { name: MODELE, language: { code: 'fr' }, components: composants } }),
        signal: AbortSignal.timeout(10_000),
      });
      const corps = await rep.json().catch(() => ({}));
      waId = String(corps?.messages?.[0]?.id ?? '');
      if (rep.ok) { statut = 'envoyé'; if (!waId) detail = 'accepté sans identifiant Meta'; }
      else detail = String(corps?.error?.message ?? `HTTP ${rep.status}`);
    } catch (e) {
      detail = String(e);
    }
    await sb.from('envois').upsert({
      id: idEnvoi, branch_id: f.branchId ?? null,
      data: { ...commun, statut, ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(waId ? { waMessageId: waId } : {}) },
    }, { onConflict: 'id' });
    if (statut !== 'envoyé') { saute('refus-meta'); continue; }
    relanceesAujourdhui.add(tel);
    parties++;
    if (waId) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil, branch_id: f.branchId ?? null,
        data: {
          id: idFil, waId, branchId: f.branchId, sens: 'sortant', numero: tel, clientId: fiche.id, texte: texteDuFil,
          type: 'text', quand: maintenant, etat: 'en-route', modele: MODELE, parQui: 'la Maison, automatiquement',
        },
      }, { onConflict: 'id' });
    }
  }

  return {
    version: VERSION, jour: aujourdhui, relances: parties, enLice: enLice.length, salle: salleOuverte, sautes,
    ...(bornee ? { borne: BORNE_DES_RELANCES } : {}),
  };
}
// ── FIN tournee

Deno.serve(async (req) => {
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const MODELE = (Deno.env.get('WA_TEMPLATE_RELANCE') ?? '').trim();
  const WA_TOKEN = Deno.env.get('WA_TOKEN') ?? '';
  const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID') ?? '';

  /* ⓪ LE CONTRÔLE DE SANTÉ — ouvrir l'adresse dans un navigateur ne lance
     RIEN : on dit la version et ce qui est posé, en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'relances-factures', version: VERSION,
      secrets: { WA_TEMPLATE_RELANCE: MODELE.length, CLE_SERVICE: service.length, WA_TOKEN: WA_TOKEN.length, WA_PHONE_ID: WA_PHONE_ID.length },
    });
  }

  /* Seul le cron (armé de la clé service) réveille la tournée. */
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) {
    return json({ erreur: 'réservé au cron', attendueLg: service.length, recueLg: cleRecue.length }, 401);
  }
  if (!MODELE) return json({ version: VERSION, relances: 'sans-modele' });

  const sb = createClient(urlBase, service);
  try {
    const r = await tournee(sb, { maintenantMs: Date.now(), MODELE, WA_TOKEN, WA_PHONE_ID });
    return json(r, r.relances === 'lecture-refusee' ? 500 : 200);
  } catch (e) {
    return json({ version: VERSION, relances: 'echec', motif: String(e).slice(0, 200) }, 500);
  }
});
