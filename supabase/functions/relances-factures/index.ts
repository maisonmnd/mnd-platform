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

   LA PIÈCE D'UNE FORMULE NE SE RELANCE PLUS SUR SON RESTE (20 octobre 2026,
   parcours de l'abonnée, décision 6 : le contrat fait foi, la pièce suit).
   Elle porte le prix entier dès le premier versement : la relancer à J+1
   réclamait la deuxième échéance un mois avant son jour. Désormais elle se
   relance sur l'ÉCHÉANCIER du contrat, lu par une copie bornée du juge
   unique (`abonnee-pur.ts`) :
     · jamais avant l'échéance : la première relance part le LENDEMAIN du
       jour dû, et une échéance écrite un dimanche se juge le lundi ;
     · le montant réclamé est l'échu en retard, jamais l'à venir ;
     · une formule Chaque Lune ne se relance JAMAIS : une lune non réglée met
       la formule en pause, ce n'est pas une dette ;
     · une formule retenue (rien de dû), effacée ou résiliée : rien ;
     · chaque échéance a sa propre suite J+1, J+3, J+7, J+14 ;
     · la tête portée n'a pas de numéro : on écrit à celle qui paie pour son
       foyer.
   La veille d'une échéance, c'est `rappels-d-echeance` qui écrit.

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
const VERSION = '2026-10-20-b · les formules relancées sur leur échéancier, le reste d’une résiliation, jamais un paquet sans échéancier';

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

/** LE JOUR D'OÙ SE COMPTENT SES RELANCES, ou null si elle n'en a pas.
    18 OCTOBRE 2026, « ne pas faire voir mon retard aux clients » (Yéman) :
    une pièce écrite APRÈS son jour (le rituel d'hier saisi ce matin) ne se
    relance pas seule ; la cliente a peut-être payé ce jour-là, et la
    relancer ferait voir le retard. Seules se relancent seules les pièces
    écrites le jour même (ou avant, un rituel prépayé), et celles que la
    direction a cochées au rattrapage. `jourDe` rend le jour local d'un instant. */
export function departDesRelances(f: { id: string; date: string; creeeLe?: string }, r: ReglagesRelances | undefined, jourDe: (iso: string) => string): string | null {
  const depuis = r?.depuis ?? '';
  if (!r?.actives || !/^\d{4}-\d{2}-\d{2}$/.test(depuis)) return null;
  const rt = r.rattrapage;
  if (rt && /^\d{4}-\d{2}-\d{2}$/.test(rt.valideLe) && rt.ids.includes(f.id) && f.date >= jourPlusR(depuis, -JOURS_DE_RATTRAPAGE)) {
    return rt.valideLe > f.date ? rt.valideLe : f.date;
  }
  if (f.date >= depuis && !!f.creeeLe && jourDe(f.creeeLe) <= f.date) return f.date;
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
  payments?: { id: string; amountXof: number; date: string }[];
  relancesPause?: { le: string; par?: string };
  creeeLe?: string;
  note?: string;
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

// ── DEBUT echeances (copie bornée de src/shared/abonnee-pur.ts, avec etatDesEcheances de echeancier.ts et decaleLeJour de ia-faits-pur.ts : l'argent d'un contrat ; scripts/verifie-les-messages-de-l-abonnee la rejoue contre l'original)
type EcheanceEcrite = { numero: number; dueIso: string; amountXof: number };
type VersementEcrit = { id: string; date: string; amountXof: number; method?: string };
type ContratEcrit = {
  id: string; clientId?: string; branchId?: string; name?: string; planId?: string; reference?: string; status?: string;
  cycle?: string; nextIso?: string; sinceIso?: string; startIso?: string; expiresIso?: string | null;
  priceXof?: number; prixConvenuXof?: number; echeances?: EcheanceEcrite[]; payments?: VersementEcrit[]; invoiceId?: string;
  calibreVendu?: string; origine?: string; resilieeLe?: string; renonceeLe?: string;
  suspendue?: { du: string; au: string; motif?: string };
  inclusPropres?: { serviceId: string; qty: number | null }[];
  prixRevu?: { le: string; ancienXof: number; nouveauXof: number; calibre?: string };
};
type FormuleEcrite = {
  id: string; name?: string; mode?: string; priceXof?: number;
  included?: { serviceId: string; qty: number | null }[]; soinsDeLaLune?: string[];
};
type PieceEcrite = { id: string; payments?: VersementEcrit[] };

const estIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
function decaleLeJour(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const joursEntre = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
/** LE DIMANCHE PASSE AU LUNDI : la porte de la Maison est close le dimanche. */
const jourOuvre = (iso: string): string =>
  (estIso(iso) && new Date(`${iso}T12:00:00Z`).getUTCDay() === 0 ? decaleLeJour(iso, 1) : iso);
const estUnPaquet = (plan: FormuleEcrite | undefined): boolean => plan?.mode === 'pack';
const debutDuContratLu = (sub: ContratEcrit): string =>
  (estIso(sub.startIso) ? sub.startIso : sub.sinceIso) ?? '0000-01-01';
const finDuContratLu = (sub: ContratEcrit): string | null => (estIso(sub.expiresIso) ? sub.expiresIso : null);

/** LE VERSÉ D'UN CONTRAT : ses versements et ceux de sa pièce, réunis par identifiant. */
type VersementLu = { id: string; date: string; montantXof: number };
function versementsDuContrat(sub: ContratEcrit, invoices: readonly PieceEcrite[]): VersementLu[] {
  const parId = new Map<string, VersementLu>();
  for (const p of sub.payments ?? []) {
    if (!p?.id) continue;
    parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof });
  }
  const piece = sub.invoiceId ? invoices.find((i) => i.id === sub.invoiceId) : undefined;
  for (const p of piece?.payments ?? []) {
    if (!p?.id || parId.has(p.id)) continue;
    parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof });
  }
  return [...parId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Les versements s'imputent dans l'ordre, la plus vieille échéance d'abord. */
type EcheanceImputee = EcheanceEcrite & { regleXof: number; resteXof: number; soldee: boolean };
function etatDesEcheances(echeances: readonly EcheanceEcrite[], verseXof: number): EcheanceImputee[] {
  let reserve = Math.max(0, verseXof);
  return [...echeances].sort((a, b) => a.numero - b.numero).map((e) => {
    const pris = Math.min(reserve, e.amountXof);
    reserve -= pris;
    const reste = e.amountXof - pris;
    return { ...e, regleXof: pris, resteXof: reste, soldee: reste === 0 };
  });
}

const prixParDefaut = (sub: ContratEcrit, plan: FormuleEcrite | undefined): number =>
  sub.prixConvenuXof ?? (estUnPaquet(plan) ? sub.priceXof : undefined) ?? plan?.priceXof ?? 0;
/** L'échéancier qui fait foi : celui du contrat, et lui seul. Un paquet sans
    échéancier n'a aucune date due : son reste est « à convenir avec la
    Maison », jamais en retard, jamais rappelé ni relancé. */
const echeancesDeBase = (sub: ContratEcrit): EcheanceEcrite[] =>
  (sub.echeances?.length ? [...sub.echeances].sort((a, b) => a.numero - b.numero).map((e) => ({ ...e })) : []);

/** L'ÉTAT QUI DÉCIDE DE L'ARGENT : le début de `etatDeLaFormule`, dans le même
    ordre (résiliée, effacée, retenue, terminée, en pause). Épuisée ne change
    rien à l'argent : elle se lit ici « en-cours », sauf le carnet que
    l'ancien ERP a dit épuisé (`exhausted`), épuisé pour de bon. */
function etatPourLArgent(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, jour: string, regleXof: number, retenueJours = 7,
): { etat: string; retenueJusquau?: string } {
  if (sub.resilieeLe ? sub.resilieeLe <= jour : sub.status === 'churn') return { etat: 'resiliee' };
  if (sub.origine === 'couronne' && regleXof <= 0) {
    if (sub.renonceeLe && sub.renonceeLe <= jour) return { etat: 'effacee' };
    const jusquau = jourOuvre(decaleLeJour(debutDuContratLu(sub), retenueJours));
    if (jour > jusquau) return { etat: 'effacee', retenueJusquau: jusquau };
    return { etat: 'retenue', retenueJusquau: jusquau };
  }
  const fin = finDuContratLu(sub);
  if (fin && fin < jour) return { etat: 'terminee' };
  if (sub.suspendue && sub.suspendue.du <= jour && jour <= sub.suspendue.au) return { etat: 'en-pause' };
  if (!estUnPaquet(plan) && estIso(sub.nextIso) && jour >= jourOuvre(sub.nextIso)) return { etat: 'en-pause' };
  if (sub.status === 'exhausted') return { etat: 'epuisee' };
  return { etat: 'en-cours' };
}

type EcheanceJugee = {
  numero: number; amountXof: number; dueIso: string; dueEcriteIso: string; resteXof: number;
  statut: 'reglee' | 'a-regler-aujourdhui' | 'en-retard' | 'a-venir' | 'retenue' | 'annulee'; retardJours: number;
};
type ArgentLu = {
  regleXof: number; resteXof: number; aRegleAujourdhuiXof: number; enRetardXof: number; retardJours: number;
  aVenir: { dueIso: string; montantXof: number; numero?: number; genre: 'echeance' | 'lune' }[];
  echeances: EcheanceJugee[]; prochaine?: { dueIso: string; montantXof: number }; avoirXof: number;
  echeancierAPoser?: true; aConvenirXof?: number;
};
/** L'ARGENT D'UN CONTRAT : l'échu, le retard (le LENDEMAIN de l'échéance), l'à
    venir et l'avoir. Une lune n'est jamais une dette ; un paquet sans
    échéancier non plus (« à convenir avec la Maison »). La résiliation au
    prorata n'est pas recopiée ici : seul son reste se relance (bloc
    `resiliation` de relances-factures). */
function argentDuContrat(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, invoices: readonly PieceEcrite[], jour: string,
  o: { prixXof?: number; etat?: string } = {},
): ArgentLu {
  const prix = o.prixXof ?? prixParDefaut(sub, plan);
  const regle = versementsDuContrat(sub, invoices).reduce((s, v) => s + v.montantXof, 0);
  const base = echeancesDeBase(sub);
  const etat = o.etat;
  const sansDette = etat === 'resiliee' || etat === 'effacee' || etat === 'retenue';
  const sansEcheancier = estUnPaquet(plan) && !base.length && prix > 0;
  const echeances: EcheanceJugee[] = etatDesEcheances(base, regle).map((e) => {
    const dueIso = jourOuvre(e.dueIso);
    let statut: EcheanceJugee['statut'];
    if (e.soldee) statut = 'reglee';
    else if (etat === 'retenue') statut = 'retenue';
    else if (sansDette) statut = 'annulee';
    else if (dueIso < jour) statut = 'en-retard';
    else if (dueIso === jour) statut = 'a-regler-aujourdhui';
    else statut = 'a-venir';
    return {
      numero: e.numero, amountXof: e.amountXof, dueIso, dueEcriteIso: e.dueIso, resteXof: e.resteXof, statut,
      retardJours: statut === 'en-retard' ? joursEntre(dueIso, jour) : 0,
    };
  });
  const ouvertes = echeances.filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard' || e.statut === 'a-venir');
  const aVenir: ArgentLu['aVenir'] = echeances
    .filter((e) => e.statut === 'a-venir').map((e) => ({ dueIso: e.dueIso, montantXof: e.resteXof, numero: e.numero, genre: 'echeance' as const }));
  const totalEcheancier = sansEcheancier ? prix : base.reduce((s, e) => s + e.amountXof, 0);
  const out: ArgentLu = {
    regleXof: regle,
    resteXof: ouvertes.reduce((s, e) => s + e.resteXof, 0),
    aRegleAujourdhuiXof: echeances.filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0),
    enRetardXof: echeances.filter((e) => e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0),
    retardJours: echeances.reduce((m, e) => Math.max(m, e.retardJours), 0),
    aVenir, echeances,
    avoirXof: (base.length || sansEcheancier) && etat !== 'effacee' ? Math.max(0, regle - totalEcheancier) : 0,
  };
  if (sansEcheancier && !sansDette) {
    out.echeancierAPoser = true;
    out.aConvenirXof = Math.max(0, prix - regle);
    out.resteXof = out.aConvenirXof;
  }
  if (!estUnPaquet(plan) && !sansDette && estIso(sub.nextIso) && !base.length && etat !== 'en-pause') {
    out.aVenir.push({ dueIso: jourOuvre(sub.nextIso), montantXof: prix, genre: 'lune' });
  }
  const prochaine = ouvertes[0];
  if (prochaine) out.prochaine = { dueIso: prochaine.dueIso, montantXof: prochaine.resteXof };
  else if (out.aVenir.length) out.prochaine = { dueIso: out.aVenir[0].dueIso, montantXof: out.aVenir[0].montantXof };
  return out;
}

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « lundi 2 novembre 2026 », « dimanche 1er novembre 2026 » : l'année toujours. */
const jourDitAvecLAnnee = (iso: string): string => {
  if (!estIso(iso)) return iso;
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS_DITS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[m - 1]} ${a}`;
};
/** « 70 000 F », espaces insécables. */
const francs = (n: number): string =>
  `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
// ── FIN echeances

// ── DEBUT resiliation (copie bornée de src/shared/abonnee-pur.ts : etatDeLaSeance, contratDeLaSeance, porteeParLeContrat et le prorata d'argentDuContrat ; scripts/verifie-les-messages-de-l-abonnee la rejoue contre l'original)
/* LA RÉSILIATION AU PRORATA (décision 9, tranché au sélecteur le 20 octobre
   2026) : ce qui a été CONSOMMÉ au-delà du réglé est dû le jour de la
   résiliation (le lundi si c'est un dimanche), et se relance comme une
   échéance. C'est la seule chose d'un contrat résilié qui se relance. */
type SeanceEcrite = {
  id: string; clientId: string; date: string; time: string; status?: string; serviceIds?: string[];
  coveredBySub?: boolean; coverKind?: string; subId?: string;
  annuleeLe?: string; annuleePar?: string; absente?: { le: string }; rendue?: { le: string };
  proposeeLe?: string; confirmeeParLaClienteLe?: string;
};
const DELAI_D_ANNULATION_H = 24;
/** Un instant ISO en millisecondes ; sans fuseau, l'heure de Cotonou. */
const instantDe = (iso: string): number => {
  const s = iso.length <= 10 ? `${iso}T00:00:00` : iso;
  return Date.parse(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}+01:00`);
};
const debutDeLaSeance = (a: { date: string; time?: string }): number => {
  const h = /^(\d{1,2}):(\d{2})$/.exec(a.time ?? '');
  return instantDe(`${a.date}T${h ? `${h[1].padStart(2, '0')}:${h[2]}` : '00:00'}:00`);
};
/** L'état d'une séance, lu sur les faits. */
function etatDeLaSeance(a: SeanceEcrite, jour: string): string {
  if (a.status === 'honoré') return 'faite';
  if (a.absente) return 'manquee';
  if (a.status === 'annulé') {
    if (a.proposeeLe && !a.confirmeeParLaClienteLe) return 'annulee';
    if (a.annuleePar === 'maison' || !a.annuleeLe) return 'annulee';
    const heures = (debutDeLaSeance(a) - instantDe(a.annuleeLe)) / 3_600_000;
    return heures < DELAI_D_ANNULATION_H ? 'manquee' : 'annulee';
  }
  if (a.date < jour) return 'a-cloturer';
  if (a.proposeeLe && a.status === 'en attente' && !a.confirmeeParLaClienteLe) return 'proposee';
  return a.status === 'en attente' ? 'a-confirmer' : 'confirmee';
}
const prendUnCredit = (etat: string, a: SeanceEcrite): boolean => etat !== 'annulee' && !(etat === 'manquee' && a.rendue);
const dansLaVie = (sub: ContratEcrit, dateIso: string): boolean => {
  if (dateIso < debutDuContratLu(sub)) return false;
  const fin = finDuContratLu(sub);
  return !fin || dateIso <= fin;
};
function soinDeLaLune(plan: FormuleEcrite, depuisIso: string | undefined, dateIso: string): string | undefined {
  const soins = plan.soinsDeLaLune ?? [];
  if (soins.length === 0) return undefined;
  if (!depuisIso || dateIso < depuisIso) return soins[0];
  const jours = Math.floor((Date.parse(`${dateIso}T12:00:00Z`) - Date.parse(`${depuisIso}T12:00:00Z`)) / 86_400_000);
  return soins[Math.floor(jours / 30) % soins.length];
}
const inclusALaDate = (sub: ContratEcrit, plan: FormuleEcrite | undefined, dateIso: string): { serviceId: string; qty: number | null }[] => {
  const base = sub.inclusPropres ?? plan?.included ?? [];
  const soin = plan ? soinDeLaLune(plan, sub.sinceIso ?? sub.startIso ?? undefined, dateIso) : undefined;
  return soin && !base.some((i) => i.serviceId === soin) ? [...base, { serviceId: soin, qty: 1 }] : base;
};
const seancesVendues = (inclus: readonly { qty: number | null }[]): number | null => {
  const bornees = inclus.filter((i) => i.qty !== null).map((i) => i.qty as number);
  return bornees.length ? Math.max(...bornees) : null;
};
/** À quel contrat appartient cette séance : celui que nomme `subId`, sinon le
    plus récent en vie ce jour-là qui porte l'une de ses prestations. */
function contratDeLaSeance(a: SeanceEcrite, subsDeLaTete: readonly ContratEcrit[], plans: readonly FormuleEcrite[]): ContratEcrit | undefined {
  if (a.subId) return subsDeLaTete.find((s) => s.id === a.subId);
  const vivants = subsDeLaTete
    .filter((s) => s.clientId === a.clientId && dansLaVie(s, a.date))
    .sort((x, y) => (debutDuContratLu(x) < debutDuContratLu(y) ? 1 : -1));
  const porte = (s: ContratEcrit) => inclusALaDate(s, plans.find((p) => p.id === s.planId), a.date)
    .some((i) => (a.serviceIds ?? []).includes(i.serviceId));
  return vivants.find(porte) ?? vivants[0];
}
function porteeParLeContrat(a: SeanceEcrite, sub: ContratEcrit, subsDeLaTete: readonly ContratEcrit[], plans: readonly FormuleEcrite[]): boolean {
  if (!a.coveredBySub || a.coverKind === 'forfait' || !dansLaVie(sub, a.date)) return false;
  return contratDeLaSeance(a, subsDeLaTete, plans)?.id === sub.id;
}
/** LE PRORATA D'UN PAQUET RÉSILIÉ : les séances comptées au jour de la
    résiliation (faites et manquées), le consommé au franc, l'avoir et le reste dû. */
function prorataDeLaResiliation(
  sub: ContratEcrit, plan: FormuleEcrite | undefined, invoices: readonly PieceEcrite[],
  subsDeLaTete: readonly ContratEcrit[], plans: readonly FormuleEcrite[], seances: readonly SeanceEcrite[], jour: string,
): { seances: number; comptees: number; consommeXof: number; avoirXof: number; resteXof: number; dueIso: string } | null {
  if (!estUnPaquet(plan) || !estIso(sub.resilieeLe) || sub.resilieeLe > jour) return null;
  const le = sub.resilieeLe;
  const vendues = seancesVendues(inclusALaDate(sub, plan, le)) ?? 0;
  if (!(vendues > 0)) return null;
  const comptees = seances.filter((a) => {
    if (a.clientId !== sub.clientId || a.date > le || !porteeParLeContrat(a, sub, subsDeLaTete, plans)) return false;
    const e = etatDeLaSeance(a, jour);
    return (e === 'faite' || e === 'manquee') && prendUnCredit(e, a);
  }).length;
  const prix = prixParDefaut(sub, plan);
  const regle = versementsDuContrat(sub, invoices).reduce((s, v) => s + v.montantXof, 0);
  const consommeXof = Math.round((prix * Math.min(comptees, vendues)) / vendues);
  return {
    seances: vendues, comptees, consommeXof,
    avoirXof: Math.max(0, regle - consommeXof), resteXof: Math.max(0, consommeXof - regle), dueIso: jourOuvre(le),
  };
}
/** CE QUE LA RELANCE D'UNE RÉSILIATION RÉCLAME AUJOURD'HUI : le consommé
    au-delà du réglé, à partir du lendemain du jour dû ; rien d'autre. */
function resteDeResiliationARelancer(
  c: ContratEcrit, plan: FormuleEcrite | undefined, piece: PieceEcrite, subsDeLaTete: readonly ContratEcrit[],
  plans: readonly FormuleEcrite[], seances: readonly SeanceEcrite[], aujourdhui: string, plancher: string,
): { depart: string; resteXof: number } | null {
  const p = prorataDeLaResiliation(c, plan, [piece], subsDeLaTete, plans, seances, aujourdhui);
  if (!p || p.resteXof <= 0 || p.dueIso >= aujourdhui || p.dueIso < plancher) return null;
  return { depart: p.dueIso, resteXof: p.resteXof };
}
// ── FIN resiliation

/** L'identifiant d'une relance d'ÉCHÉANCE : une suite par échéance du contrat. */
const idDeLaRelanceDEcheance = (factureId: string, numero: number, n: number): string => `rl-${factureId}-e${numero}-${n}-whatsapp`;
/** L'identifiant d'une relance du RESTE D'UNE RÉSILIATION : sa propre suite. */
const idDeLaRelanceDeResiliation = (factureId: string, n: number): string => `rl-${factureId}-r-${n}-whatsapp`;

/** LA PIÈCE D'UNE FORMULE : un contrat la nomme, ou sa note le dit. */
const estUnePieceDeFormule = (f: { id: string; note?: string }, piecesDesContrats: ReadonlySet<string>): boolean =>
  piecesDesContrats.has(f.id) || /^Abonnement\b/.test(f.note ?? '');

/** CE QUE LA RELANCE D'UNE FORMULE RÉCLAME AUJOURD'HUI : la plus vieille
    échéance en retard et tout l'échu en retard, ou null. Jamais une lune,
    jamais une formule retenue, effacée ou résiliée, jamais avant le lendemain
    du jour dû. `plancher` : rien de plus vieux que la marge du cron. */
function echeanceARelancer(
  c: ContratEcrit, plan: FormuleEcrite | undefined, piece: PieceEcrite, aujourdhui: string, plancher: string,
): { numero: number; depart: string; resteXof: number } | null {
  if (!estUnPaquet(plan)) return null;
  const regle = versementsDuContrat(c, [piece]).reduce((s, v) => s + v.montantXof, 0);
  const { etat } = etatPourLArgent(c, plan, aujourdhui, regle);
  if (etat === 'resiliee' || etat === 'effacee' || etat === 'retenue') return null;
  const argent = argentDuContrat(c, plan, [piece], aujourdhui, { etat });
  const premiere = argent.echeances.find((e) => e.statut === 'en-retard');
  if (!premiere || premiere.dueIso < plancher) return null;
  return { numero: premiere.numero, depart: premiere.dueIso, resteXof: argent.enRetardXof };
}

/** À QUI ÉCRIRE : la payeuse si elle a un numéro, sinon la cliente soignée,
    sinon celle qui paie pour son foyer (la tête portée n'a pas de numéro). */
type FicheLue = { id: string; name?: string; phone?: string; civilite?: string; auMasculin?: boolean; archived?: boolean; familyId?: string };
function destinataireDe(
  ids: readonly (string | undefined)[], fiches: ReadonlyMap<string, FicheLue>, payeurDuFoyer: ReadonlyMap<string, string>,
): FicheLue | undefined {
  const connues = ids.filter((x): x is string => !!x).map((id) => fiches.get(id)).filter((x): x is FicheLue => !!x);
  const avecNumero = connues.find((f) => !!numeroIntl(f.phone));
  if (avecNumero) return avecNumero;
  for (const f of connues) {
    const payeur = f.familyId ? fiches.get(payeurDuFoyer.get(f.familyId) ?? '') : undefined;
    if (payeur && numeroIntl(payeur.phone)) return payeur;
  }
  return connues[connues.length - 1];
}

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
  /* ③bis LES FORMULES. Leur pièce porte le prix entier dès le premier
     versement : elle ne se relance pas sur son reste, mais sur l'échéancier
     de son contrat (le contrat fait foi, la pièce suit). */
  const contrats: ContratEcrit[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('subscribers').select('id, data').range(de, de + 999);
    if (error) return { version: VERSION, relances: 'lecture-refusee', motif: error.message.slice(0, 120) };
    contrats.push(...(data ?? []).map((l) => ({ ...(l.data as ContratEcrit), id: l.id as string })));
    if ((data ?? []).length < 1000) break;
  }
  const { data: lignesDesFormules } = await sb.from('plans').select('id, data');
  const formules = ((lignesDesFormules ?? []) as { id: string; data: FormuleEcrite }[]).map((l) => ({ ...l.data, id: l.id }));
  const piecesDesContrats = new Set(contrats.map((c) => c.invoiceId).filter((x): x is string => !!x));
  const pieces = new Map(factures.map((f) => [f.id, f]));
  const manquantes = [...piecesDesContrats].filter((id) => !pieces.has(id));
  for (let i = 0; i < manquantes.length; i += 200) {
    const { data } = await sb.from('invoices').select('id, data').in('id', manquantes.slice(i, i + 200));
    for (const l of data ?? []) pieces.set(l.id as string, { ...(l.data as FactureLue), id: l.id as string });
  }

  /* LES DOSSIERS DU JOUR : une facture ordinaire, sa suite à elle ; une
     échéance de formule en retard, la sienne. */
  type Dossier = { f: FactureLue; depart: string | null; resteXof: number; idDe: (n: number) => string; subId?: string; echeance?: number; resiliation?: true; tete?: string };
  const dossiers: Dossier[] = [];
  for (const f of factures) {
    if (estUnePieceDeFormule(f, piecesDesContrats)) continue;
    if (!seRelance(f) || f.relancesPause || departDesRelances(f, r, jourDuSalon) === null || !(resteDeLaFacture(f) > 0)) continue;
    dossiers.push({ f, depart: departDesRelances(f, r, jourDuSalon), resteXof: resteDeLaFacture(f), idDe: (n) => idDeLaRelance(f.id, n) });
  }
  for (const c of contrats) {
    const f = c.invoiceId ? pieces.get(c.invoiceId) : undefined;
    if (!f || !seRelance(f) || f.relancesPause) continue;
    const e = echeanceARelancer(c, formules.find((p) => p.id === c.planId), f, aujourdhui, plancher);
    if (!e) continue;
    dossiers.push({ f, depart: e.depart, resteXof: e.resteXof, idDe: (n) => idDeLaRelanceDEcheance(f.id, e.numero, n), subId: c.id, echeance: e.numero, tete: c.clientId });
  }
  /* LE RESTE D'UNE RÉSILIATION : un paquet résilié dont le consommé dépasse
     le réglé. Ses séances se lisent par pages, pour ses seules clientes. */
  const resilies = contrats.filter((c) => estIso(c.resilieeLe) && c.resilieeLe <= aujourdhui && jourOuvre(c.resilieeLe) >= plancher
    && estUnPaquet(formules.find((p) => p.id === c.planId)) && !!c.invoiceId && !!c.clientId);
  if (resilies.length) {
    const clientes = [...new Set(resilies.map((c) => c.clientId as string))];
    const seances: SeanceEcrite[] = [];
    for (let i = 0; i < clientes.length; i += 200) {
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from('appointments').select('id, data').in('data->>clientId', clientes.slice(i, i + 200)).range(de, de + 999);
        if (error) return { version: VERSION, relances: 'lecture-refusee', motif: error.message.slice(0, 120) };
        seances.push(...(data ?? []).map((l) => ({ ...(l.data as SeanceEcrite), id: l.id as string })));
        if ((data ?? []).length < 1000) break;
      }
    }
    for (const c of resilies) {
      const f = pieces.get(c.invoiceId as string);
      if (!f || !seRelance(f) || f.relancesPause) continue;
      const r = resteDeResiliationARelancer(c, formules.find((p) => p.id === c.planId), f,
        contrats.filter((s) => s.clientId === c.clientId), formules, seances, aujourdhui, plancher);
      if (!r) continue;
      dossiers.push({ f, depart: r.depart, resteXof: r.resteXof, idDe: (n) => idDeLaRelanceDeResiliation(f.id, n), subId: c.id, resiliation: true, tete: c.clientId });
    }
  }
  if (dossiers.length === 0) return { version: VERSION, relances: 0, jour: aujourdhui, lues: factures.length };

  /* ④ LES LIENS DÉJÀ PAYÉS que personne n'a encore inscrits (aucun Trône
     ouvert) : ils comptent. Une cliente qui vient de payer n'est pas relancée. */
  const { data: payees } = await sb.from('mnd_pay').select('id, data')
    .in('data->>pieceId', [...new Set(dossiers.map((d) => d.f.id))]).eq('data->>statut', 'payee');
  const payeParPiece = new Map<string, number>();
  for (const l of (payees ?? []) as { id: string; data: { pieceId?: string; genre?: string; montantXof?: number } }[]) {
    const f = dossiers.find((d) => d.f.id === l.data?.pieceId)?.f;
    if (!f || l.data?.genre !== 'lien' || (f.payments ?? []).some((p) => p.id === l.id)) continue;
    payeParPiece.set(f.id, (payeParPiece.get(f.id) ?? 0) + Math.round(Number(l.data?.montantXof) || 0));
  }

  /* Les fiches : la payeuse si elle a un numéro, sinon la cliente soignée ;
     pour une échéance de formule seulement, sinon celle qui paie pour son foyer. */
  const idsFiches = [...new Set(dossiers.flatMap((d) => [d.f.clientId, d.f.forClientId, d.tete]).filter((x): x is string => !!x))];
  const fiches = new Map<string, FicheLue>();
  const litLesFiches = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('clients').select('id, data').in('id', ids.slice(i, i + 200));
      for (const l of data ?? []) fiches.set(l.id as string, { id: l.id as string, ...(l.data as object) });
    }
  };
  await litLesFiches(idsFiches);
  const tetesDesFormules = new Set(dossiers.filter((d) => d.subId).flatMap((d) => [d.f.clientId, d.f.forClientId, d.tete]).filter((x): x is string => !!x));
  const foyers = [...new Set([...fiches.values()].filter((x) => tetesDesFormules.has(x.id) && !numeroIntl(x.phone) && x.familyId).map((x) => x.familyId as string))];
  const payeurDuFoyer = new Map<string, string>();
  if (foyers.length) {
    const { data: lignesDesFoyers } = await sb.from('families').select('id, data').in('id', foyers);
    for (const l of (lignesDesFoyers ?? []) as { id: string; data: { payerClientId?: string } }[]) {
      if (l.data?.payerClientId) payeurDuFoyer.set(l.id, l.data.payerClientId);
    }
    await litLesFiches([...payeurDuFoyer.values()].filter((id) => !fiches.has(id)));
  }

  /* Le journal : les relances déjà posées, et celles d'aujourd'hui (une cliente, une relance par jour). */
  const idsJournal = dossiers.flatMap((d) => CADENCE_DES_RELANCES.map((_, k) => d.idDe(k + 1)));
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

  for (const d of dossiers) {
    if (parties >= BORNE_DES_RELANCES) { bornee = true; break; }
    const { f, depart } = d;
    const reste = Math.max(0, d.resteXof - (payeParPiece.get(f.id) ?? 0));
    /* UNE FACTURE ORDINAIRE va où elle allait : la payeuse si elle a un
       numéro, sinon la cliente soignée. Seule une échéance de formule peut
       aller à celle qui paie pour le foyer d'une tête portée. */
    const payeuse = fiches.get(f.clientId);
    const soignee = fiches.get(f.forClientId ?? f.clientId);
    const fiche = d.subId ? destinataireDe([f.clientId, f.forClientId ?? d.tete ?? f.clientId], fiches, payeurDuFoyer) : (numeroIntl(payeuse?.phone) ? payeuse : soignee);
    const tel = numeroIntl(fiche?.phone);
    if (!fiche || !tel) { saute('sans-numero'); continue; }
    if (fiche.archived) { saute('archivee'); continue; }

    let partiesDeLaFacture = 0;
    let derniereLe: string | undefined;
    let premiereQuand: string | undefined;
    for (let n = 1; n <= CADENCE_DES_RELANCES.length; n++) {
      const l = journal.get(d.idDe(n));
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
          pieceId: f.id, ...(f.number ? { pieceNumero: String(f.number).slice(0, 40) } : {}), ...(d.subId ? { subId: d.subId } : {}), clientId: fiche.id,
          libelle: 'Maison MND · relance', statut: 'en_attente', creeLe: new Date(maintenantMs).toISOString(), creePar: 'la Maison, automatiquement',
        },
      });
      if (errAttente) { saute('attente-refusee'); continue; }
    }

    /* ⑥ LE MESSAGE. */
    const idEnvoi = d.idDe(n);
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
      ...(d.subId ? { subId: d.subId, ...(d.resiliation ? { resiliation: true } : { echeance: d.echeance }) } : {}),
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
    version: VERSION, jour: aujourdhui, relances: parties, enLice: dossiers.length, salle: salleOuverte, sautes,
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
