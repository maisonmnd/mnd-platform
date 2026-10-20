/* LE SERVEUR DE L'ABONNÉE, ÉPROUVÉ — `node scripts/verifie-le-serveur-de-l-abonnee.mjs`.

   Lots L3, L4 et L5 du parcours de l'abonnée (20 octobre 2026) : la
   migration 0138 et les fonctions Edge de l'argent (kkiapay-verify,
   kkiapay-webhook, mnd-pay, mnd-pay-webhook). Le juge unique est
   `src/shared/abonnee-pur.ts` : tout ce que le serveur en recopie doit dire
   LA MÊME CHOSE que lui sur les mêmes cas, et les règles écrites par Yéman
   (deux formules en même temps, le dimanche au lundi, retenue 7 jours,
   manquée à moins de 24 h, un seul chemin pour l'argent) se rejouent ici
   contre le vrai SQL.

   1. LE TEXTE : versions, jumeaux à l'identique, aucune écriture directe
      d'argent sur un contrat ou une pièce hors du chemin unique.
   2. `duDuContrat` (Edge) contre `argentDuContrat` (le juge).
   3. LA MIGRATION, LUE COMME UN TEXTE : ce qui doit y être, ce qui ne doit
      plus y être.
   4. LE VRAI SQL, JOUÉ DANS PGLITE (un Postgres en WASM) quand il est là
      (`BANC_PGLITE` = un dossier qui porte node_modules/@electric-sql/pglite) :
      les outils du juge contre l'original, puis les fonctions de la cliente
      et de l'argent, comme une cliente, le personnel et le serveur.
      Sans PGlite, cette partie se SAUTE et le dit.

   Tout est inventé. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import {
  releveDeLAbonnee, etatDeLaSeance, peutPorter, jourOuvre, luneDeLaDate, prochaineIsoApresReglement, inclusALaDate,
  type ContratLu, type SeanceLue, type EntreeDuReleve, type ReleveDuContrat,
} from '../src/shared/abonnee-pur';
import { prochaineReferenceAbo, type Plan, type Subscriber } from '../src/shared/abonnements';
import { nextInvoiceNumber, type Invoice } from '../src/shared/finance';
import { prixDuFoyer } from '../src/shared/formules-en-lunes-pur';
import { decaleLeJour } from '../src/shared/ia-faits-pur';

// deno-lint-ignore no-explicit-any
type Any = any;

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
/* jsonb range ses clés à sa façon (2 octobre 2026) : on compare le CONTENU,
   clés triées, jamais l'ordre d'écriture. */
const range = (v: unknown): unknown => (Array.isArray(v) ? v.map(range)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, range((v as Any)[k])])) : v);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(range(attendu)) === JSON.stringify(range(obtenu));
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${sansAccent(nom)}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const extrais = (f: string, nom: string): string => {
  const t = lis(f);
  const a = t.indexOf(`// ── DEBUT ${nom}`);
  const b = t.indexOf(`// ── FIN ${nom}`);
  if (a < 0 || b < a) return '';
  return t.slice(a, b);
};
const charge = <T>(f: string, noms: string[], rend: string): T => {
  const js = transformSync(noms.map((x) => extrais(f, x)).join('\n'), { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return ${rend};`)() as T;
};

const KV = 'supabase/functions/kkiapay-verify/index.ts';
const KW = 'supabase/functions/kkiapay-webhook/index.ts';
const MP = 'supabase/functions/mnd-pay/index.ts';
const MW = 'supabase/functions/mnd-pay-webhook/index.ts';
const QUATRE_FONCTIONS = [KV, KW, MP, MW];
const MIGRATION = 'supabase/migrations/0138_le_parcours_de_l_abonnee.sql';

/* ══ 1. LE TEXTE DES FONCTIONS EDGE ════════════════════════════════════ */
{
  dit('les quatre fonctions portent la version du 20 octobre 2026', [true, true, true, true],
    QUATRE_FONCTIONS.map((f) => (lis(f).match(/const VERSION = '([^']+)'/)?.[1] ?? '') >= '2026-10-20-a'));
  const du = extrais(KV, 'duDuContrat');
  dit('duDuContrat : le meme texte dans les quatre fonctions', [true, true, true, true],
    QUATRE_FONCTIONS.map((f) => du.length > 500 && extrais(f, 'duDuContrat') === du));
  const cp = extrais(KV, 'leContratEtSaPiece');
  dit('leContratEtSaPiece : le meme texte dans les quatre fonctions', [true, true, true, true],
    QUATRE_FONCTIONS.map((f) => cp.length > 200 && extrais(f, 'leContratEtSaPiece') === cp));
  for (const nom of ['leContratDeLaDemande', 'verseSurLeContratDeLaDemande', 'moyenDeLaPiece']) {
    dit(`${nom} : le meme texte dans mnd-pay et mnd-pay-webhook`, true, extrais(MP, nom).length > 200 && extrais(MP, nom) === extrais(MW, nom));
  }
  const corpsTrone = (() => {
    const t = lis('src/shared/mnd-pay-pur.ts');
    const a = t.indexOf('export function moyenDeLaPiece(');
    return t.slice(t.indexOf('\n', a) + 1, t.indexOf('\n}\n', a));
  })();
  const corpsServeur = (() => {
    const t = extrais(MP, 'moyenDeLaPiece');
    const a = t.indexOf('function moyenDeLaPiece(');
    return t.slice(t.indexOf('\n', a) + 1, t.indexOf('\n}\n', a));
  })();
  dit('moyenDeLaPiece : le corps du serveur est celui du Trone', true, corpsTrone.length > 100 && corpsTrone === corpsServeur);
  const ap = (t: string) => { const a = t.indexOf('async function applyPayment('); return t.slice(a, t.indexOf('\n}\n', a)); };
  dit('applyPayment : jumeaux a l identique dans kkiapay-verify et kkiapay-webhook', true, ap(lis(KV)).length > 500 && ap(lis(KV)) === ap(lis(KW)));
  dit('applyPayment : l abonnement passe par verse_sur_l_abonnement', true,
    /if \(opts\.subId\) \{[\s\S]{0,1200}admin\.rpc\('verse_sur_l_abonnement'/.test(ap(lis(KV))));
  dit('verseSurLeContratDeLaDemande : MND PAY passe par verse_sur_l_abonnement', true,
    /admin\.rpc\('verse_sur_l_abonnement'/.test(extrais(MP, 'verseSurLeContratDeLaDemande')));
  /* AUCUNE ÉCRITURE DIRECTE de l'argent d'un contrat ou d'une pièce. */
  const ecritContrat = /from\(\s*'subscribers'\s*\)[\s\S]{0,160}?\.(update|insert|upsert|delete)\(/;
  const ecritPiece = /from\(\s*'invoices'\s*\)[\s\S]{0,160}?\.(update|insert|upsert|delete)\(/;
  dit('aucune des quatre n ecrit un contrat ni une piece directement', [false, false, false, false],
    QUATRE_FONCTIONS.map((f) => { const t = sansCommentaires(lis(f)); return ecritContrat.test(t) || ecritPiece.test(t); }));
  dit('l ancien juge du du (duDeLAbonnement) a disparu des quatre', [false, false, false, false],
    QUATRE_FONCTIONS.map((f) => /duDeLAbonnement/.test(sansCommentaires(lis(f)))));
  const w = lis(MW);
  const serve = w.slice(w.indexOf('Deno.serve('));
  dit('mnd-pay-webhook : la demande payee regle son contrat, et le rejeu le reprend', [true, true, true],
    [/if \(statut === 'payee'\) \{[\s\S]{0,200}verseSurLeContratDeLaDemande/.test(serve),
      /if \(d\.statut === 'payee'\) \{[\s\S]{0,200}verseSurLeContratDeLaDemande/.test(serve),
      /range\.startsWith\('rattach[^']*'\)[\s\S]{0,300}verseSurLeContratDeLaDemande/.test(serve)]);
  dit('mnd-pay-webhook : la signature reste jugee avant tout', true,
    serve.indexOf('await signatureValide(') > 0 && serve.indexOf('await signatureValide(') < serve.indexOf('verseSurLeContratDeLaDemande'));
  const m = lis(MP);
  dit('mnd-pay : une demande de contrat ne depasse pas ce qu il attend, et garde son contrat', [true, true],
    [/montantXof > attendu\.resteXof \+ 1/.test(m), /pieceId, \.\.\.duContrat,[\s\S]{0,4000}pieceId, \.\.\.duContrat,/.test(m)]);
}

/* ══ LES FORMULES ET LE SCÉNARIO DE LA MAQUETTE ═══════════════════════
   Akouavi, GBÈJÍ™ · Carnet de Six en Mini, 140 000 F en 2 × 70 000 F (2
   octobre et 1er novembre 2026), fin le 29 juin 2027 ; faites le 6 et le 16
   octobre 2026, réservée le 3 novembre 2026 à 10 h ; Nadia, tête portée. */
const GBEJI = 'sv-venue-gbeji-ess';
const plan = (o: Partial<Plan>): Plan => ({ tag: '', line: '', perks: [], popular: false, ...o } as Plan);
const SIX = plan({ id: 'pl-lune-six', name: 'GBÈJÍ™ · Carnet de Six', mode: 'pack', validityDays: 270, priceXof: 140000,
  prixParCalibre: { 'cal-mini': 140000, 'cal-micro': 190000 }, discountPct: 17, included: [{ serviceId: GBEJI, qty: 6 }] } as Partial<Plan>);
const QUATRE = plan({ id: 'pl-lune-quatre', name: 'GBÈJÍ™ · Carnet de Quatre', mode: 'pack', validityDays: 180, priceXof: 84000,
  discountPct: 25, included: [{ serviceId: GBEJI, qty: 4 }], uneFoisParTete: 'carnet-de-quatre' } as Partial<Plan>);
const LUNE = plan({ id: 'pl-lune-gbeji', name: 'GBÈJÍ™ · Chaque Lune', mode: 'cycle', priceXof: 37500, discountPct: 10,
  included: [{ serviceId: GBEJI, qty: 1 }], soinsDeLaLune: ['sv-plt-10-m', 'sv-plt-30-c', 'sv-plt-20-c'] } as Partial<Plan>);
const PLANS = [SIX, QUATRE, LUNE];

const AK = 'cl-ak';
const NA = 'cl-na';
const ECH = [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }];
const contrat = (o: Partial<ContratLu>): ContratLu => ({
  id: 'abo-14', branchId: 'br', clientId: AK, name: 'A. K.', planId: SIX.id, slot: '', since: '', status: 'active', mrrXof: 0,
  reference: 'ABO-2026-014', sinceIso: '2026-10-02', startIso: '2026-10-02', expiresIso: '2027-06-29',
  priceXof: 140000, prixConvenuXof: 140000, calibreVendu: 'cal-mini', nextIso: '2027-06-29',
  echeances: ECH.map((x) => ({ ...x })), payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02', method: 'KkiaPay' }],
  ...o,
} as ContratLu);
const seance = (o: Partial<SeanceLue>): SeanceLue => ({
  id: 'a', branchId: 'br', clientId: AK, serviceIds: [GBEJI], date: '2026-10-06', time: '10:00', master: 'm',
  status: 'honoré', coveredBySub: true, coverKind: 'abonnement', subId: 'abo-14', ...o,
} as SeanceLue);
const A1 = seance({ id: 'a1', date: '2026-10-06' });
const A2 = seance({ id: 'a2', date: '2026-10-16' });
const A3 = seance({ id: 'a3', date: '2026-11-03', status: 'confirmé' });
const lune = (o: Partial<ContratLu> = {}) => contrat({
  id: 'abo-l', planId: LUNE.id, reference: 'ABO-2026-020', startIso: undefined, expiresIso: null, priceXof: undefined,
  prixConvenuXof: 37500, echeances: undefined, nextIso: '2026-11-01', payments: [{ id: 'l1', amountXof: 37500, date: '2026-10-02' }], ...o,
} as Partial<ContratLu>);
const B1 = seance({ id: 'b1', subId: 'abo-l', date: '2026-10-09' });
const retenue = (o: Partial<ContratLu> = {}) => contrat({
  id: 'abo-r', origine: 'couronne', reference: 'ABO-2026-031', sinceIso: '2026-10-18', startIso: '2026-10-18', expiresIso: '2027-07-15',
  payments: [], echeances: [{ numero: 1, dueIso: '2026-10-18', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-17', amountXof: 70000 }], ...o,
});
const deuxPaye = [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 70000, date: '2026-11-02' }];
const faitesSix = ['2026-10-06', '2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27'].map((d, i) => seance({ id: `e${i}`, date: d }));
const manqueeSix = seance({ id: 'e5', date: '2026-12-11', status: 'annulé', annuleeLe: '2026-12-10T18:00:00+01:00', annuleePar: 'cliente' });
const quatre = contrat({ id: 'abo-q', planId: QUATRE.id, reference: 'ABO-2026-040', prixConvenuXof: 84000, priceXof: 84000,
  sinceIso: '2026-10-05', startIso: '2026-10-05', expiresIso: '2027-04-03', echeances: undefined,
  payments: [{ id: 'q1', amountXof: 84000, date: '2026-10-05' }] });
const pieceAvecMndPay: Invoice = { id: 'inv-14', branchId: 'br', kind: 'facture', number: 'MND-2026-0007', clientId: AK, date: '2026-10-02',
  lines: [], globalDiscountPct: 0, theme: 'Aube', status: 'envoyée',
  payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02', method: 'KkiaPay' }, { id: 'mp-x', amountXof: 70000, date: '2026-11-02', method: 'MTN MoMo' }] } as unknown as Invoice;

type Cas = { nom: string; e: EntreeDuReleve; dates: string[] };
const entree = (o: Partial<EntreeDuReleve>): EntreeDuReleve =>
  ({ jour: '2026-10-20', clientId: AK, subs: [contrat({})], plans: PLANS, appts: [A1, A2, A3], invoices: [], ...o });
const CAS: Cas[] = [
  { nom: 'a jour', e: entree({}), dates: ['2026-10-27', '2027-06-29', '2027-06-30'] },
  { nom: 'le dimanche 1er novembre 2026', e: entree({ jour: '2026-11-01' }), dates: ['2026-11-10'] },
  { nom: 'echeance du jour (lundi 2)', e: entree({ jour: '2026-11-02' }), dates: ['2026-11-10'] },
  { nom: 'en retard d un jour', e: entree({ jour: '2026-11-03' }), dates: ['2026-11-10'] },
  { nom: '7 jours de retard', e: entree({ jour: '2026-11-09' }), dates: ['2026-11-12'] },
  { nom: '8 jours de retard', e: entree({ jour: '2026-11-10' }), dates: ['2026-11-12'] },
  { nom: 'reglee le 2 novembre', e: entree({ jour: '2026-11-03', subs: [contrat({ payments: deuxPaye })] }), dates: ['2026-11-12'] },
  { nom: 'chaque lune en cours', e: entree({ subs: [lune()], appts: [B1] }), dates: ['2026-10-25', '2026-11-01', '2026-11-05'] },
  { nom: 'chaque lune, dimanche de l echeance', e: entree({ jour: '2026-11-01', subs: [lune()], appts: [B1] }), dates: ['2026-11-01'] },
  { nom: 'chaque lune en pause', e: entree({ jour: '2026-11-02', subs: [lune()], appts: [B1] }), dates: ['2026-11-03'] },
  { nom: 'chaque lune reglee d avance', e: entree({ subs: [lune({ nextIso: '2026-12-01', payments: [{ id: 'l1', amountXof: 37500, date: '2026-10-02' }, { id: 'l2', amountXof: 37500, date: '2026-10-18' }] })], appts: [B1] }), dates: ['2026-10-25', '2026-11-05', '2026-12-01'] },
  { nom: 'retenue', e: entree({ subs: [retenue()], appts: [] }), dates: ['2026-10-27'] },
  { nom: 'retenue, le lundi 26', e: entree({ jour: '2026-10-26', subs: [retenue()], appts: [] }), dates: ['2026-10-27'] },
  { nom: 'retenue effacee le 27', e: entree({ jour: '2026-10-27', subs: [retenue()], appts: [] }), dates: ['2026-10-28'] },
  { nom: 'retenue prise un lundi, effacee le mardi suivant', e: entree({ jour: '2026-10-27', subs: [retenue({ sinceIso: '2026-10-19', startIso: '2026-10-19' })], appts: [] }), dates: ['2026-10-28'] },
  { nom: 'retenue prise un lundi, encore retenue le lundi suivant', e: entree({ jour: '2026-10-26', subs: [retenue({ sinceIso: '2026-10-19', startIso: '2026-10-19' })], appts: [] }), dates: ['2026-10-28'] },
  { nom: 'retenue a laquelle elle renonce', e: entree({ jour: '2026-10-22', subs: [retenue({ renonceeLe: '2026-10-21' })], appts: [] }), dates: ['2026-10-28'] },
  { nom: 'retenue reglee une fois', e: entree({ subs: [retenue({ payments: [{ id: 'k1', amountXof: 70000, date: '2026-10-19' }] })], appts: [] }), dates: ['2026-10-28'] },
  { nom: 'epuisee, 5 faites et 1 manquee', e: entree({ jour: '2026-12-15', subs: [contrat({ payments: deuxPaye })], appts: [...faitesSix, manqueeSix] }), dates: ['2026-12-20'] },
  { nom: 'terminee le 30 juin 2027', e: entree({ jour: '2027-06-30' }), dates: ['2027-07-01'] },
  { nom: 'resiliee le 20 octobre 2026', e: entree({ subs: [contrat({ resilieeLe: '2026-10-20', motifDeResiliation: 'demenage', status: 'churn' })] }), dates: ['2026-10-27'] },
  { nom: 'resiliee plus tard (encore en cours)', e: entree({ subs: [contrat({ resilieeLe: '2026-11-15' })] }), dates: ['2026-11-10', '2026-11-20'] },
  { nom: 'deux formules en meme temps', e: entree({ subs: [contrat({}), quatre], appts: [A1, A2, A3, seance({ id: 'q-1', subId: 'abo-q', date: '2026-10-12' })] }), dates: ['2026-10-27', '2027-04-04'] },
  { nom: 'deux formules, une seance sans lien va a la plus recente', e: entree({ subs: [contrat({}), quatre], appts: [A1, seance({ id: 'sl', subId: undefined, date: '2026-10-12' })] }), dates: ['2026-10-27'] },
  { nom: 'une seance sans lien (avant subId)', e: entree({ appts: [A1, { ...A2, subId: undefined } as SeanceLue, A3] }), dates: ['2026-10-27'] },
  { nom: 'suite de forfait jamais sur la formule', e: entree({ appts: [A1, A2, A3, seance({ id: 'f1', date: '2026-10-18', coverKind: 'forfait' })] }), dates: ['2026-10-27'] },
  { nom: 'statut exhausted d autrefois', e: entree({ subs: [contrat({ status: 'exhausted' as Subscriber['status'] })] }), dates: ['2026-10-27'] },
  { nom: 'versement MND PAY sur la piece seule', e: entree({ jour: '2026-11-05', subs: [contrat({ invoiceId: 'inv-14' })], invoices: [pieceAvecMndPay] }), dates: ['2026-11-12'] },
  { nom: 'suspendue', e: entree({ subs: [contrat({ suspendue: { du: '2026-10-19', au: '2026-11-15', motif: 'voyage' } })] }), dates: ['2026-10-27', '2026-11-20'] },
  { nom: 'chaque lune suspendue', e: entree({ subs: [lune({ suspendue: { du: '2026-10-19', au: '2026-11-15' } })], appts: [B1] }), dates: ['2026-10-27'] },
  { nom: 'manquees, annulees, rendue', e: entree({ appts: [A1, A2,
    seance({ id: 'm20', date: '2026-10-22', status: 'annulé', annuleeLe: '2026-10-21T14:00:00+01:00', annuleePar: 'cliente' }),
    seance({ id: 'm49', date: '2026-10-23', status: 'annulé', annuleeLe: '2026-10-21T09:00:00+01:00', annuleePar: 'cliente' }),
    seance({ id: 'm24', date: '2026-10-24', status: 'annulé', annuleeLe: '2026-10-23T10:00:00+01:00', annuleePar: 'cliente' }),
    seance({ id: 'mm', date: '2026-10-25', status: 'annulé', annuleeLe: '2026-10-25T08:00:00+01:00', annuleePar: 'maison' }),
    seance({ id: 'ab', date: '2026-10-19', status: 'confirmé', absente: { le: '2026-10-19' } }),
    seance({ id: 'rd', date: '2026-10-18', status: 'confirmé', absente: { le: '2026-10-18' }, rendue: { le: '2026-10-19', motif: 'malade' } }),
    seance({ id: 'pr', date: '2026-10-30', status: 'en attente', proposeeLe: '2026-10-15' }),
    seance({ id: 'prx', date: '2026-10-31', status: 'annulé', proposeeLe: '2026-10-15', annuleeLe: '2026-10-31T08:00:00+01:00', annuleePar: 'cliente' }),
  ] }), dates: ['2026-11-10'] },
  { nom: 'tete portee (Nadia)', e: entree({ clientId: NA, subs: [contrat({}), contrat({ id: 'abo-21', clientId: NA, reference: 'ABO-2026-021', prixConvenuXof: 126000, priceXof: 126000,
    echeances: [{ numero: 1, dueIso: '2026-10-03', amountXof: 63000 }, { numero: 2, dueIso: '2026-11-02', amountXof: 63000 }], payments: [{ id: 'n1', amountXof: 63000, date: '2026-10-03' }] })],
    appts: [A1, seance({ id: 'n-1', clientId: NA, subId: 'abo-21', date: '2026-10-10' })] }), dates: ['2026-10-27'] },
];

const tousLesContrats = (r: ReturnType<typeof releveDeLAbonnee>): ReleveDuContrat[] => [...r.contrats, ...r.anciens];

/* ══ 2. duDuContrat (Edge) CONTRE argentDuContrat (le juge) ════════════ */
{
  const duDuContrat = charge<(d: Any, piece: Any, plan: Any, jour: string) => { duXof: number; resteXof: number; raison?: string }>(KV, ['duDuContrat'], 'duDuContrat');
  const attenduDuJuge = (c: ReleveDuContrat): { du: number; raison?: string } => {
    if (c.etat === 'resiliee' || c.etat === 'effacee') return { du: 0, raison: c.etat };
    if (c.etat === 'retenue') return { du: c.argent.pourOuvrir?.montantXof ?? 0 };
    const ouverte = c.argent.echeances.find((x) => x.resteXof > 0 && x.statut !== 'annulee');
    if (ouverte) return { du: ouverte.resteXof };
    if (c.argent.echeances.length) return { du: 0, raison: 'deja_regle' };
    const laLune = c.argent.luneARegler?.montantXof ?? c.argent.aVenir.find((v) => v.genre === 'lune')?.montantXof;
    if (laLune) return { du: laLune };
    return { du: 0, raison: c.etat === 'en-pause' && c.pause?.genre === 'suspension' ? 'suspendue' : 'deja_regle' };
  };
  for (const cas of CAS) {
    const r = releveDeLAbonnee(cas.e);
    for (const c of tousLesContrats(r)) {
      const piece = c.sub.invoiceId ? cas.e.invoices.find((i) => i.id === c.sub.invoiceId) ?? null : null;
      const lu = duDuContrat(c.sub, piece, c.plan, cas.e.jour);
      const j = attenduDuJuge(c);
      dit(`2 · ${cas.nom} · ${c.sub.id} : le du en ligne est celui du juge`, j, { du: lu.duXof, ...(lu.raison ? { raison: lu.raison } : {}) });
    }
  }
  dit('2 · resiliee : rien ne se regle en ligne', 'resiliee',
    duDuContrat(contrat({ resilieeLe: '2026-10-19' }), null, SIX, '2026-10-20').raison);
}

/* ══ 3. LA MIGRATION, LUE COMME UN TEXTE ══════════════════════════════ */
const SQL = lis(MIGRATION);
const SQL_NU = SQL.replace(/--[^\n]*/g, '');
const fonction = (nom: string): string => {
  const a = SQL_NU.indexOf(`create or replace function public.${nom}(`);
  if (a < 0) return '';
  const d = SQL_NU.indexOf('$$', a);
  const f = SQL_NU.indexOf('$$', d + 2);
  return SQL_NU.slice(a, f + 2);
};
{
  for (const bloc of ['abo_date', 'abo_jour_ouvre', 'abo_vie_du_contrat', 'abo_lunes', 'abo_inclus', 'abo_seance', 'abo_attribution',
    'abo_argent', 'abo_etat_de_la_formule', 'abo_peut_porter', 'abo_prix_du_foyer', 'abo_numeros']) {
    dit(`3 · la copie bornee ${bloc} est la (DEBUT/FIN)`, true,
      SQL.includes(`-- ── DEBUT ${bloc}`) && SQL.indexOf(`-- ── FIN ${bloc}`) > SQL.indexOf(`-- ── DEBUT ${bloc}`));
  }
  const s = fonction('souscrire_a_une_formule');
  dit('3 · deux formules en meme temps : plus de refus deja_abonnee', [true, false], [s.length > 1000, /deja_abonnee/.test(s)]);
  dit('3 · souscrire : une fois par tete, formule fermee, premieres lunes gardees', [true, true, true],
    [/'deja_prise'/.test(s), /'formule_fermee'/.test(s), /'apres_une_creation'/.test(s)]);
  dit('3 · souscrire : la retenue effacee ne ferme pas « une fois par tete »', true, /abo_etat_de_la_formule\([^)]*\)->>'etat' <> 'effacee'/.test(s));
  dit('3 · souscrire : le prix se relit dans la grille, jamais recu', [true, false], [/v_plan\.data->'prixParCalibre'->>p_band_id/.test(s), /p_prix|p_montant|p_valeur/.test(s)]);
  dit('3 · souscrire : reference, echeances sans dimanche, Foyer, origine couronne', [true, true, true, true],
    [/abo_prochaine_reference\(/.test(s), /abo_jour_ouvre\(v_today \+ 30\)/.test(s), /abo_prix_du_foyer\(/.test(s), /'origine', 'couronne'/.test(s)]);
  dit('3 · souscrire : la lune commence au reglement, le paquet porte sa fin', true,
    /'nextIso', case when v_pack then \(v_today \+ v_jours\)::text else v_today::text end/.test(s));
  dit('3 · souscrire : l ancienne version a quatre arguments est retiree', true,
    /drop function if exists public\.souscrire_a_une_formule\(text, int, text, text\);/.test(SQL_NU));
  const grants = (sig: string, a: string) => new RegExp(`grant execute on function public\\.${sig.replace(/[().[\]]/g, (c) => `\\${c}`)} to ${a};`).test(SQL_NU);
  dit('3 · qui peut appeler quoi', [true, true, true, true, true, true], [
    grants('souscrire_a_une_formule(text, int, text, text, text)', 'authenticated'),
    grants('verse_sur_l_abonnement(text, jsonb)', 'authenticated, service_role'),
    grants('reserver_une_seance_incluse(text, text, text, text, text[], text)', 'authenticated'),
    grants('annuler_une_seance(text)', 'authenticated'),
    grants('deplacer_une_seance(text, text, text)', 'authenticated'),
    grants('renoncer_a_la_formule(text)', 'authenticated'),
  ]);
  const v = fonction('verse_sur_l_abonnement');
  dit('3 · verse : reserve au personnel et au serveur, sous verrou, idempotent', [true, true, true],
    [/if not \(v_claims is null or v_role = 'service_role' or public\.is_staff\(\)\)/.test(v), /for update/.test(v), /'dejaVerse', true/.test(v)]);
  dit('3 · verse : l objet n est jamais reecrit (jsonb ||)', [true, false],
    [/set data = data \|\| v_maj/.test(v), /set data = v_/.test(v)]);
  const res = fonction('reserver_une_seance_incluse');
  dit('3 · reserver : le contrat a elle, sous verrou, le juge, la place, la couverture posee', [true, true, true, true, true],
    [/est_ma_tete\(v_sub\.data->>'clientId'\)/.test(res), /from public\.subscribers where id = p_sub_id for update/.test(res),
      /abo_peut_porter\(/.test(res), /pg_advisory_xact_lock\(hashtext\('pose'\)/.test(res), /'coveredBySub', true/.test(res) && /'coverKind', 'abonnement'/.test(res)]);
  const g = fonction('garde_argent_cliente');
  dit('3 · la garde : invoker, qui ecrit decide, la couverture et les faits proteges', [true, true, true, true],
    [/security invoker/.test(g), /ecriture_de_la_maison\(\)/.test(g),
      ['coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof', 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe'].every((c) => g.includes(`'${c}'`)),
      ['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof'].every((c) => g.includes(`'${c}'`))]);
  dit('3 · une cliente n ecrit jamais un contrat, et le contrat est trace', [true, true],
    [/create trigger garde_contrat_cliente_biud\s+before insert or update or delete on public\.subscribers/.test(SQL_NU),
      /create trigger trace_le_geste after insert or update or delete on public\.subscribers/.test(SQL_NU)]);
  dit('3 · les outils du juge ne s ouvrent a personne', true,
    /revoke all on function public\.%s from public, anon, authenticated/.test(SQL_NU) && /'abo_peut_porter\(text, text, date, date, text\)'/.test(SQL_NU));
  dit('3 · le jour vient de Cotonou, jamais de l appareil', [true, false],
    [/Africa\/Porto-Novo/.test(fonction('abo_aujourdhui')), /current_date/.test(SQL_NU.slice(SQL_NU.indexOf('souscrire_a_une_formule')))]);
}

/* ══ 4. LE VRAI SQL, DANS PGLITE ══════════════════════════════════════ */
async function chargePGlite(): Promise<Any | null> {
  const dossier = process.env.BANC_PGLITE ?? '';
  const essais = [
    ...(dossier ? [pathToFileURL(path.join(dossier, 'node_modules/@electric-sql/pglite/dist/index.js')).href] : []),
    '@electric-sql/pglite',
  ];
  for (const e of essais) {
    try {
      const m = await import(e);
      if (m?.PGlite) return m.PGlite;
    } catch { /* suivant */ }
  }
  return null;
}

const PGlite = await chargePGlite();
if (!PGlite) {
  console.log('SAUTE 4 : le vrai SQL ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
} else {
  /* PGlite se croit dans un navigateur quand `window` existe : le carton
     posé pour les magasins d'abonnements.ts s'efface le temps qu'il naisse. */
  const g = globalThis as Any;
  const carton = { window: g.window, document: g.document };
  delete g.window; delete g.document;
  const db = new PGlite();
  await db.waitReady;
  g.window = carton.window; g.document = carton.document;
  const q = async (sql: string, p: unknown[] = []): Promise<Any[]> => (await db.query(sql, p)).rows;

  /* ── LE SOCLE : les tables de la Maison, et les vraies fonctions d'avant ── */
  for (const r of ['authenticated', 'anon', 'service_role']) await db.exec(`create role ${r} nologin;`);
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    create table public.staff (user_id uuid primary key, name text);
    create table public.documents (key text primary key, data jsonb, updated_at timestamptz not null default now());`);
  for (const t of ['clients', 'families', 'subscribers', 'plans', 'appointments', 'invoices', 'payments', 'mnd_pay', 'catalog_services', 'branches', 'team']) {
    await db.exec(`create table public.${t} (id text primary key, branch_id text, data jsonb not null, updated_at timestamptz not null default now());`);
  }
  const avant = (f: string) => lis(`supabase/migrations/${f}`);
  const fonctionDe = (texte: string, nom: string): string => {
    const a = texte.indexOf(`create or replace function public.${nom}(`);
    if (a < 0) throw new Error(`${nom} introuvable`);
    const d = texte.indexOf('$$', a);
    const f = texte.indexOf('$$', d + 2);
    return `${texte.slice(a, f + 2)};`;
  };
  const m0092 = avant('0092_la_trace_de_la_base.sql');
  await db.exec(m0092.slice(m0092.indexOf('create table if not exists public.traces'), m0092.indexOf(');', m0092.indexOf('create table if not exists public.traces')) + 2));
  for (const [f, nom] of [['0006_rls_prod.sql', 'is_staff'], ['0076_ma_couronne_voit_les_formules.sql', 'est_ma_tete'],
    ['0092_la_trace_de_la_base.sql', 'trace_allege'], ['0092_la_trace_de_la_base.sql', 'trace_le_geste'],
    ['0125_la_maison_repond_sur_whatsapp.sql', 'minutes_de_l_heure'], ['0125_la_maison_repond_sur_whatsapp.sql', 'duree_du_rdv'],
    ['0081_la_formule_au_calibre.sql', 'mnd_arrondi_500']] as const) {
    await db.exec(fonctionDe(avant(f), nom));
  }
  await db.exec('grant select, insert, update, delete on all tables in schema public to authenticated, service_role;');

  /* LA MIGRATION, TOUTE ENTIÈRE. */
  let posee = true;
  try { await db.exec(SQL); } catch (e) { posee = false; console.log(`       ${sansAccent(String((e as Error).message))}`); }
  dit('4 · la migration 0138 se pose sur le socle, d un seul tenant', true, posee);
  const controle = posee ? (await q(SQL.slice(SQL.lastIndexOf('select\n'))))[0] : null;
  dit('4 · son controle : une souscription a cinq arguments, cinq gestes, la garde invoker, deux gardes du contrat',
    { souscriptions: 1, arguments: 5, gestes: 5, garde_invoker: true, gardes_du_contrat: 2 },
    controle && { souscriptions: Number(controle.souscriptions), arguments: Number(controle.arguments), gestes: Number(controle.gestes),
      garde_invoker: controle.garde_invoker, gardes_du_contrat: Number(controle.gardes_du_contrat) });

  /* ── 4a. LES OUTILS DU JUGE CONTRE L'ORIGINAL ── */
  const jours: string[] = [];
  for (let i = 0; i < 70; i++) jours.push(decaleLeJour('2026-10-01', i));
  const ouvres = await q(`select d::text as j, public.abo_jour_ouvre(d::date)::text as o from unnest($1::text[]) d`, [jours]);
  dit('4a · le dimanche passe au lundi, soixante-dix jours de suite', jours.map(jourOuvre), ouvres.map((r) => r.o));
  const L = lune();
  const lunesSql = await q(`select lower(r)::text du, upper(r)::text au from (select public.abo_lune_de_la_date($1::jsonb, d::date) r, ord from unnest($2::text[]) with ordinality t(d, ord)) x order by ord`,
    [JSON.stringify(L), jours]);
  dit('4a · la lune d une date, soixante-dix jours de suite', jours.map((d) => luneDeLaDate(L, d)), lunesSql.map((r) => ({ du: r.du, au: r.au })));
  const apres = await q(`select public.abo_prochaine_iso_apres_reglement($1::jsonb, d::date)::text as n, ord from unnest($2::text[]) with ordinality t(d, ord) order by ord`,
    [JSON.stringify(L), jours]);
  dit('4a · la lune qui suit un reglement', jours.map((d) => prochaineIsoApresReglement(L, d)), apres.map((r) => r.n));
  const inclusSql = await q(`select public.abo_inclus_a_la_date($1::jsonb, $2::jsonb, d::date) as i, ord from unnest($3::text[]) with ordinality t(d, ord) order by ord`,
    [JSON.stringify(L), JSON.stringify(LUNE), jours]);
  dit('4a · le contenu vendu a la date, soin de la lune compris', jours.map((d) => inclusALaDate(L, LUNE, d)), inclusSql.map((r) => r.i));
  const variantes: SeanceLue[] = (CAS.find((c) => c.nom === 'manquees, annulees, rendue')!.e.appts as SeanceLue[]);
  const etatsSql = await q(`select public.abo_etat_de_la_seance(a, $2::date) as e, ord from jsonb_array_elements($1::jsonb) with ordinality t(a, ord) order by ord`,
    [JSON.stringify(variantes), '2026-10-20']);
  dit('4a · l etat de chaque seance (manquee a moins de 24 h, maison, absente, rendue, proposee)',
    variantes.map((a) => etatDeLaSeance(a, '2026-10-20')), etatsSql.map((r) => r.e));
  const grille: [number, number][] = [[140000, 168000], [84000, 112000], [37500, 41667], [100000, 100000], [150000, 140000], [99000, 132000], [0, 100]];
  const foyerSql = await q(`select public.abo_prix_du_foyer(p, v)::numeric as x, ord from unnest($1::numeric[], $2::numeric[]) with ordinality t(p, v, ord) order by ord`,
    [grille.map((g) => g[0]), grille.map((g) => g[1])]);
  dit('4a · le prix du Foyer, comme au comptoir', grille.map(([p, v]) => prixDuFoyer(p, v)), foyerSql.map((r) => Number(r.x)));
  const valeur = await q(`select public.abo_valeur_a_la_carte(140000, $1::jsonb)::numeric v1, public.abo_valeur_a_la_carte(84000, $2::jsonb)::numeric v2`,
    [JSON.stringify(SIX), JSON.stringify(QUATRE)]);
  dit('4a · la valeur a la carte relue dans la formule : six venues, la sixieme offerte ; quatre, la quatrieme offerte',
    [168000, 112000], [Number(valeur[0].v1), Number(valeur[0].v2)]);

  /* ── 4b. LE JUGE ET LE SQL, CAS PAR CAS, SUR LES MÊMES LIGNES ── */
  const vide = async () => { for (const t of ['subscribers', 'plans', 'appointments', 'invoices', 'clients']) await db.exec(`delete from public.${t};`); };
  const remplis = async (e: EntreeDuReleve) => {
    await vide();
    for (const p of e.plans) await q('insert into public.plans (id, data) values ($1, $2::jsonb)', [p.id, JSON.stringify(p)]);
    for (const s of e.subs) await q(`insert into public.subscribers (id, branch_id, data) values ($1, 'br', $2::jsonb)`, [s.id, JSON.stringify(s)]);
    for (const a of e.appts) await q(`insert into public.appointments (id, branch_id, data) values ($1, 'br', $2::jsonb)`, [a.id, JSON.stringify(a)]);
    for (const i of e.invoices) await q(`insert into public.invoices (id, branch_id, data) values ($1, 'br', $2::jsonb)`, [i.id, JSON.stringify(i)]);
  };
  for (const cas of CAS) {
    await remplis(cas.e);
    const r = releveDeLAbonnee(cas.e);
    for (const c of tousLesContrats(r)) {
      const id = c.sub.id;
      const [l] = await q(`select public.abo_etat_de_la_formule(s.id, s.data, p.data, $2::date) as etat, public.abo_verse(s.data)::numeric as verse
                             from public.subscribers s left join public.plans p on p.id = s.data->>'planId' where s.id = $1`, [id, cas.e.jour]);
      const [rt] = await q(`select public.abo_retard_jours(s.data, p.data, $2::date, $3) as r
                              from public.subscribers s left join public.plans p on p.id = s.data->>'planId' where s.id = $1`, [id, cas.e.jour, l.etat.etat]);
      dit(`4b · ${cas.nom} · ${id} : etat, retard, verse`,
        { etat: c.etat, jusquau: c.retenueJusquau ?? null, effacee: c.effaceeLe ?? null, retard: c.argent.retardJours, verse: c.argent.regleXof },
        { etat: l.etat.etat, jusquau: l.etat.retenueJusquau ?? null, effacee: l.etat.effaceeLe ?? null, retard: Number(rt.r), verse: Number(l.verse) });
      const services = [...new Set([...c.seances.map((x) => x.serviceId), GBEJI])];
      const comptees = await q(`select public.abo_seances_comptees($1, $2::date, sv, null, null, null) as k, ord from unnest($3::text[]) with ordinality t(sv, ord) order by ord`,
        [id, cas.e.jour, services]);
      dit(`4b · ${cas.nom} · ${id} : les seances qui comptent`,
        services.map((sv) => c.attribuees.filter((s) => s.compte && s.serviceIds.includes(sv)).length), comptees.map((x) => Number(x.k)));
      for (const d of cas.dates) {
        const peut = await q(`select public.abo_peut_porter($1, sv, $2::date, $3::date, null) as raison, ord from unnest($4::text[]) with ordinality t(sv, ord) order by ord`,
          [id, d, cas.e.jour, services]);
        const courant = r.contrats.includes(c);
        dit(`4b · ${cas.nom} · ${id} : peut porter le ${d}`,
          services.map((sv) => courant && peutPorter(c, sv, d)), peut.map((x) => x.raison === null));
      }
    }
  }

  /* ── 4c. LES GESTES, COMME UNE CLIENTE, LE PERSONNEL ET LE SERVEUR ── */
  const U_AK = '00000000-0000-4000-8000-0000000000a1';
  const U_XX = '00000000-0000-4000-8000-0000000000c9';
  const U_STAFF = '00000000-0000-4000-8000-0000000000f1';
  const comme = async (qui: 'cliente' | 'autre' | 'personnel' | 'serveur', sql: string, p: unknown[] = []): Promise<Any[]> => {
    const claims = qui === 'serveur' ? { role: 'service_role' }
      : { role: 'authenticated', sub: qui === 'cliente' ? U_AK : qui === 'autre' ? U_XX : U_STAFF };
    await db.exec('begin;');
    try {
      await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec(`set local role ${qui === 'serveur' ? 'service_role' : 'authenticated'};`);
      const rows = await q(sql, p);
      await db.exec('commit;');
      return rows;
    } catch (e) {
      await db.exec('rollback;');
      throw e;
    }
  };
  const tente = async (qui: Parameters<typeof comme>[0], sql: string, p: unknown[] = []): Promise<string> => {
    try { await comme(qui, sql, p); return 'passe'; } catch (e) { return `refus : ${sansAccent(String((e as Error).message)).slice(0, 60)}`; }
  };
  const fige = async (jour: string, instant: string) => { await db.exec(`set mnd.jour_du_banc = '${jour}'; set mnd.instant_du_banc = '${instant}';`); };
  const ligne = async (t: string, id: string): Promise<Any> => (await q(`select data from public.${t} where id = $1`, [id]))[0]?.data;
  const releveDeLaBase = async (clientId: string, jour: string) => {
    const subs = (await q('select data from public.subscribers')).map((x) => x.data);
    const plans = (await q('select data from public.plans')).map((x) => x.data);
    const appts = (await q('select data from public.appointments')).map((x) => x.data);
    const invoices = (await q('select data from public.invoices')).map((x) => x.data);
    return releveDeLAbonnee({ jour, clientId, subs, plans, appts, invoices });
  };

  await vide();
  for (const p of PLANS) await q('insert into public.plans (id, data) values ($1, $2::jsonb)', [p.id, JSON.stringify(p)]);
  await q(`insert into public.clients (id, branch_id, data) values
    ('cl-ak', 'br', $1::jsonb), ('cl-na', 'br', $2::jsonb), ('cl-xx', 'br', $3::jsonb)`, [
    JSON.stringify({ id: 'cl-ak', name: 'Akouavi K.', authUserId: U_AK, familyId: 'fam-1' }),
    JSON.stringify({ id: 'cl-na', name: 'Nadia K.', birthday: '2017-05-12', familyId: 'fam-1' }),
    JSON.stringify({ id: 'cl-xx', name: 'Une autre', authUserId: U_XX }),
  ]);
  await q(`insert into public.families (id, data) values ('fam-1', $1::jsonb)`, [JSON.stringify({ id: 'fam-1', payerClientId: 'cl-ak' })]);
  await q(`insert into public.catalog_services (id, data) values ($1, $2::jsonb), ('sv-colo', $3::jsonb)`,
    [GBEJI, JSON.stringify({ id: GBEJI, name: 'GBÈJÍ™ Essentiel', durationMin: 150, master: 'Rita' }), JSON.stringify({ id: 'sv-colo', name: 'Coloration', durationMin: 60 })]);
  await q(`insert into public.branches (id, data) values ('br', '{"id":"br","seats":0}'::jsonb)`);
  await q(`insert into public.staff (user_id, name) values ($1, 'Le comptoir')`, [U_STAFF]);
  await q(`insert into public.subscribers (id, branch_id, data) values ('abo-ancien', 'br', $1::jsonb)`,
    [JSON.stringify(contrat({ id: 'abo-ancien', reference: 'ABO-2026-014', clientId: 'cl-xx' }))]);
  await fige('2026-10-20', '2026-10-20T10:00:00+01:00');

  /* La souscription en ligne : deux formules en même temps, la référence, l'échéancier sans dimanche. */
  const sous = async (qui: Parameters<typeof comme>[0], args: string) => (await comme(qui, `select public.souscrire_a_une_formule(${args}) as r`))[0].r;
  const s1 = await sous('cliente', `'pl-lune-six', 2, 'cal-mini'`);
  dit('4c · elle souscrit le Carnet de Six en Mini, en deux fois', { ok: true, reference: 'ABO-2026-015', totalXof: 140000,
    echeances: [{ numero: 1, dueIso: '2026-10-20', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-19', amountXof: 70000 }] },
  { ok: s1.ok, reference: s1.reference, totalXof: Number(s1.totalXof), echeances: s1.echeances });
  dit('4c · la reference suit la regle du comptoir (le plus grand numero de l annee, plus un)',
    prochaineReferenceAbo([{ reference: 'ABO-2026-014' } as Subscriber], 2026), s1.reference);
  const c1 = await ligne('subscribers', s1.subId);
  dit('4c · le contrat : origine couronne, fin vendue, retenue', { origine: 'couronne', expiresIso: '2027-07-17', nextIso: '2027-07-17', statut: 'new' },
    { origine: c1.origine, expiresIso: c1.expiresIso, nextIso: c1.nextIso, statut: c1.status });
  dit('4c · le juge le lit retenu jusqu au mardi 27 octobre 2026', { etat: 'retenue', jusquau: '2026-10-27' },
    (({ etat, retenueJusquau }) => ({ etat, jusquau: retenueJusquau }))(tousLesContrats(await releveDeLaBase(AK, '2026-10-20')).find((c) => c.sub.id === s1.subId)!));
  const s2 = await sous('cliente', `'pl-lune-gbeji', 1`);
  dit('4c · une deuxieme formule en meme temps : acceptee (« Deux en meme temps »)', { ok: true, reference: 'ABO-2026-016' }, { ok: s2.ok, reference: s2.reference });
  const c2 = await ligne('subscribers', s2.subId);
  dit('4c · la Chaque Lune commence au reglement : nextIso le jour de la signature', '2026-10-20', c2.nextIso);
  const s3 = await sous('cliente', `'pl-lune-six', 1, 'cal-mini', null, 'cl-na'`);
  dit('4c · pour Nadia, deuxieme tete du foyer : le Foyer, comme au comptoir', { ok: true, totalXof: prixDuFoyer(140000, 168000), foyerXof: 140000 - prixDuFoyer(140000, 168000) },
    { ok: s3.ok, totalXof: Number(s3.totalXof), foyerXof: Number(s3.foyerXof) });
  dit('4c · son motif se lit sur le contrat, et le contrat est a Nadia', { motif: 'Le Foyer · deuxième tête (−15 %, plafond 25 %)', clientId: 'cl-na' },
    (({ motifConvenu, clientId }) => ({ motif: motifConvenu, clientId }))(await ligne('subscribers', s3.subId)));
  const s4 = await sous('autre', `'pl-lune-six', 1, 'cal-mini', null, 'cl-na'`);
  dit('4c · une autre ne souscrit pas pour Nadia', 'tete_refusee', s4.raison);
  const q1 = await sous('cliente', `'pl-lune-quatre', 1`);
  const q2 = await sous('cliente', `'pl-lune-quatre', 1`);
  dit('4c · le Carnet de Quatre une fois par tete', [true, 'deja_prise'], [q1.ok, q2.raison]);
  const ren = (await comme('cliente', `select public.renoncer_a_la_formule($1) as r`, [q1.subId]))[0].r;
  const q3 = await sous('cliente', `'pl-lune-quatre', 1`);
  dit('4c · elle renonce a la retenue : effacee, et la porte « une fois par tete » se rouvre', [true, 'effacee', true],
    [ren.ok, tousLesContrats(await releveDeLaBase(AK, '2026-10-20')).find((c) => c.sub.id === q1.subId)?.etat, q3.ok]);
  await fige('2026-10-02', '2026-10-02T10:00:00+01:00');
  const sDim = await sous('cliente', `'pl-lune-six', 2, 'cal-mini'`);
  dit('4c · signee le vendredi 2 octobre 2026 : la 2e echeance du dimanche 1er novembre s ecrit le lundi 2', '2026-11-02', sDim.echeances?.[1]?.dueIso);
  await fige('2026-10-20', '2026-10-20T10:00:00+01:00');

  /* Le seul chemin de l'argent. */
  const verse = async (qui: Parameters<typeof comme>[0], subId: string, v: Record<string, unknown>) =>
    (await comme(qui, `select public.verse_sur_l_abonnement($1, $2::jsonb) as r`, [subId, JSON.stringify(v)]))[0].r;
  dit('4c · une cliente ne verse pas sur son contrat', 'reserve_au_personnel', (await verse('cliente', s1.subId, { id: 'x', montantXof: 70000 })).raison);
  const v1 = await verse('serveur', s1.subId, { id: 'kk-1', montantXof: 70000, moyen: 'MOBILE_MONEY', cashbox: 'KkiaPay', source: 'en-ligne' });
  const p1 = await ligne('invoices', v1.pieceId);
  const c1b = await ligne('subscribers', s1.subId);
  dit('4c · le premier versement : au contrat ET a sa piece neuve, sous le meme identifiant', { ok: true, neuve: true, contrat: ['kk-1'], piece: ['kk-1'], total: 140000, invoiceId: v1.pieceId, statut: 'active' },
    { ok: v1.ok, neuve: v1.pieceNeuve, contrat: c1b.payments.map((x: Any) => x.id), piece: p1.payments.map((x: Any) => x.id), total: Number(p1.lines[0].unitXof), invoiceId: c1b.invoiceId, statut: c1b.status });
  dit('4c · la piece prend le numero suivant de la Maison', nextInvoiceNumber((await q('select data from public.invoices where id <> $1', [v1.pieceId])).map((x) => x.data) as Invoice[], 'MND'), p1.number);
  const v1bis = await verse('serveur', s1.subId, { id: 'kk-1', montantXof: 70000 });
  dit('4c · rejoue : rien de plus', { deja: true, contrat: 1, piece: 1 },
    { deja: v1bis.dejaVerse, contrat: (await ligne('subscribers', s1.subId)).payments.length, piece: (await ligne('invoices', v1.pieceId)).payments.length });
  await comme('personnel', `update public.invoices set data = jsonb_set(data, '{payments}', data->'payments' || '[{"id":"mp-9","amountXof":70000,"date":"2026-10-20","method":"MTN MoMo","cashbox":"MND PAY"}]'::jsonb) where id = $1`, [v1.pieceId]);
  const v2 = await verse('serveur', s1.subId, { id: 'mp-9', montantXof: 70000 });
  dit('4c · un versement deja sur la piece (un chemin d avant) : le contrat est complete, la piece ne double pas',
    { ok: true, contrat: ['kk-1', 'mp-9'], piece: 2 },
    { ok: v2.ok, contrat: (await ligne('subscribers', s1.subId)).payments.map((x: Any) => x.id), piece: (await ligne('invoices', v1.pieceId)).payments.length });
  const r1 = tousLesContrats(await releveDeLaBase(AK, '2026-10-20')).find((c) => c.sub.id === s1.subId)!;
  dit('4c · le juge lit 140 000 F regles, rien en double', { regle: 140000, reste: 0 }, { regle: r1.argent.regleXof, reste: r1.argent.resteXof });
  const vl = await verse('personnel', s2.subId, { id: 'cpt-1', montantXof: 37500, moyen: 'Espèces', cashbox: 'Caisse', encaissePar: 'Rita G.' });
  const c2b = await ligne('subscribers', s2.subId);
  dit('4c · la Chaque Lune reglee au comptoir : la lune part du jour du reglement', { ok: true, nextIso: prochaineIsoApresReglement(c2 as Subscriber, '2026-10-20') },
    { ok: vl.ok, nextIso: c2b.nextIso });
  const vl2 = await verse('personnel', s2.subId, { id: 'cpt-2', montantXof: 37500 });
  dit('4c · la lune suivante, reglee d avance, la prolonge et ouvre sa propre piece', { nextIso: '2026-12-19', neuve: true, autre: true },
    { nextIso: (await ligne('subscribers', s2.subId)).nextIso, neuve: vl2.pieceNeuve, autre: vl2.pieceId !== vl.pieceId });

  /* Réserver une séance de sa formule. */
  const reserve = async (qui: Parameters<typeof comme>[0], subId: string, date: string, time = '10:00', extras = '{}') =>
    (await comme(qui, `select public.reserver_une_seance_incluse($1, $2, $3, $4, $5::text[]) as r`, [subId, GBEJI, date, time, extras]))[0].r;
  const encoreRetenue = await sous('cliente', `'pl-lune-six', 1, 'cal-mini'`);
  dit('4c · une formule retenue ne porte aucune seance avant son premier reglement', 'retenue', (await reserve('cliente', encoreRetenue.subId, '2026-10-27')).raison);
  dit('4c · le contrat d une autre : refuse', 'pas_votre_contrat', (await reserve('autre', s1.subId, '2026-10-27')).raison);
  dit('4c · dans le passe : refuse', 'creneau_passe', (await reserve('cliente', s1.subId, '2026-10-19')).raison);
  const b1 = await reserve('cliente', s1.subId, '2026-10-27');
  const a1 = await ligne('appointments', b1.apptId);
  dit('4c · la seance de sa formule : confirmee, couverte d office, 0 F, sans acompte', { ok: true, etat: 'confirmee', dispo: 5, statut: 'confirmé', couverte: true, subId: s1.subId, genre: 'abonnement', prix: 0, acompte: 0, maitre: 'Rita' },
    { ok: b1.ok, etat: b1.etat, dispo: b1.disponiblesApres, statut: a1.status, couverte: a1.coveredBySub, subId: a1.subId, genre: a1.coverKind, prix: a1.priceXof, acompte: a1.depositXof, maitre: a1.master });
  const rj = tousLesContrats(await releveDeLaBase(AK, '2026-10-20')).find((c) => c.sub.id === s1.subId)!;
  dit('4c · le juge compte ce que le serveur annonce', { dispo: 5, rang: 1 },
    { dispo: rj.seances[0].disponibles, rang: rj.attribuees.find((s) => s.id === b1.apptId)?.rang });
  dit('4c · la meme tete a la meme heure : deja posee', 'deja_pose', (await reserve('cliente', s1.subId, '2026-10-27')).raison);
  const extra = await reserve('cliente', s1.subId, '2026-10-28', '10:00', '{sv-colo}');
  const ax = await ligne('appointments', extra.apptId);
  dit('4c · avec un extra : il voyage hors formule, rien n est chiffre d avance', { ok: true, sv: [GBEJI, 'sv-colo'], hors: ['sv-colo'], prix: null },
    { ok: extra.ok, sv: ax.serviceIds, hors: ax.extrasHorsFormule, prix: ax.priceXof ?? null });
  for (const d of ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-02']) await reserve('cliente', s1.subId, d);
  dit('4c · six seances prises : le carnet est epuise, la septieme se refuse et dit pourquoi', 'epuisee', (await reserve('cliente', s1.subId, '2026-11-03')).raison);
  dit('4c · une Chaque Lune : une venue par lune, pas au-dela de la lune reglee', ['ok', 'quota', 'lune_non_reglee'], [
    (await reserve('cliente', s2.subId, '2026-10-22')).ok ? 'ok' : 'ko',
    (await reserve('cliente', s2.subId, '2026-10-23')).raison,
    (await reserve('cliente', s2.subId, '2026-12-20')).raison]);

  /* Annuler, déplacer. */
  const annule = async (id: string) => (await comme('cliente', `select public.annuler_une_seance($1) as r`, [id]))[0].r;
  await fige('2026-10-28', '2026-10-28T14:00:00+01:00');
  const an1 = await annule((await q(`select id from public.appointments where data->>'date' = '2026-10-29'`))[0].id);
  dit('4c · annulee 20 h avant : comptee, « Manquee »', true, an1.compteeCommeManquee);
  const id31 = (await q(`select id from public.appointments where data->>'date' = '2026-10-31'`))[0].id;
  const an2 = await annule(id31);
  const a31 = await ligne('appointments', id31);
  dit('4c · annulee plus de 24 h avant : rendue a la formule ; l heure est celle du serveur', { manquee: false, le: '2026-10-28T13:00:00.000Z', par: 'cliente', juge: 'annulee' },
    { manquee: an2.compteeCommeManquee, le: a31.annuleeLe, par: a31.annuleePar, juge: etatDeLaSeance(a31, '2026-10-28') });
  const id02 = (await q(`select id from public.appointments where data->>'date' = '2026-11-02'`))[0].id;
  const dep = (await comme('cliente', `select public.deplacer_une_seance($1, '2026-11-05', '11:00') as r`, [id02]))[0].r;
  const a02 = await ligne('appointments', id02);
  dit('4c · deplacee dans sa vie et son quota : elle repasse en attente, l ancienne date gardee', { ok: true, date: '2026-11-05', statut: 'en attente', de: '2026-11-02' },
    { ok: dep.ok, date: a02.date, statut: a02.status, de: a02.deplaceeDe?.date });
  const dep2 = (await comme('cliente', `select public.deplacer_une_seance($1, '2027-08-01', '11:00') as r`, [id02]))[0].r;
  dit('4c · deplacee au-dela de quatre-vingt-dix jours : refusee', 'creneau_hors_fenetre', dep2.raison);

  /* La garde : ce qu'une cliente écrit elle-même. */
  await fige('2026-10-20', '2026-10-20T10:00:00+01:00');
  const brut = { id: 'rdv-brut', branchId: 'br', clientId: 'cl-ak', serviceIds: [GBEJI], date: '2026-11-20', time: '09:00', status: 'en attente',
    coveredBySub: true, subId: s1.subId, coverKind: 'abonnement', priceXof: 45000, depositXof: 10000, depositConfirmed: true, annuleePar: 'maison', absente: { le: 'x' } };
  await comme('cliente', `insert into public.appointments (id, branch_id, data) values ('rdv-brut', 'br', $1::jsonb)`, [JSON.stringify(brut)]);
  const g1 = await ligne('appointments', 'rdv-brut');
  dit('4c · une cliente qui pose elle-meme un rendez-vous ne se couvre pas : la garde retire la couverture et les faits',
    { couverte: null, subId: null, genre: null, confirme: null, par: null, absente: null, prix: 45000, acompte: 10000 },
    { couverte: g1.coveredBySub ?? null, subId: g1.subId ?? null, genre: g1.coverKind ?? null, confirme: g1.depositConfirmed ?? null,
      par: g1.annuleePar ?? null, absente: g1.absente ?? null, prix: g1.priceXof, acompte: g1.depositXof });
  await comme('cliente', `update public.appointments set data = data || '{"coveredBySub":true,"priceXof":0,"status":"honoré"}'::jsonb where id = 'rdv-brut'`);
  const g2 = await ligne('appointments', 'rdv-brut');
  dit('4c · ... ni en le modifiant : couverture, prix et « faite » retombent', { couverte: null, prix: 45000, statut: 'en attente' },
    { couverte: g2.coveredBySub ?? null, prix: g2.priceXof, statut: g2.status });
  await comme('cliente', `update public.appointments set data = data || '{"status":"annulé","annuleeLe":"2026-10-01T00:00:00Z","annuleePar":"maison"}'::jsonb where id = 'rdv-brut'`);
  const g3 = await ligne('appointments', 'rdv-brut');
  dit('4c · son annulation directe est datee par le serveur (pas par elle), et signee « cliente »', { statut: 'annulé', sonHeureEcartee: true, par: 'cliente' },
    { statut: g3.status, sonHeureEcartee: g3.annuleeLe !== '2026-10-01T00:00:00Z' && Number.isFinite(Date.parse(g3.annuleeLe)), par: g3.annuleePar });
  await comme('personnel', `update public.appointments set data = data || '{"coveredBySub":true,"absente":{"le":"2026-11-20"}}'::jsonb where id = 'rdv-brut'`);
  const g4 = await ligne('appointments', 'rdv-brut');
  dit('4c · le comptoir, lui, ecrit a plein droit', { couverte: true, absente: true }, { couverte: g4.coveredBySub, absente: !!g4.absente });
  dit('4c · une cliente n ecrit jamais un contrat, meme le sien', [true, true], [
    (await tente('cliente', `update public.subscribers set data = data || '{"status":"active"}'::jsonb where id = $1`, [s1.subId])).startsWith('refus'),
    (await tente('cliente', `insert into public.subscribers (id, branch_id, data) values ('ab-pirate', 'br', '{"clientId":"cl-ak"}'::jsonb)`)).startsWith('refus')]);
  dit('4c · le comptoir l ecrit, et chaque geste sur un contrat laisse sa trace', [true, true], [
    (await tente('personnel', `update public.subscribers set data = data || '{"slot":"Mar 10 h"}'::jsonb where id = $1`, [s1.subId])) === 'passe',
    Number((await q(`select count(*) as k from public.traces where table_name = 'subscribers' and piece_id = $1`, [s1.subId]))[0].k) >= 3]);

  /* Le retard ferme la porte après la grâce, comme le juge. */
  await q(`insert into public.subscribers (id, branch_id, data) values ('abo-retard', 'br', $1::jsonb)`, [JSON.stringify(contrat({
    id: 'abo-retard', reference: 'ABO-2026-090', sinceIso: '2026-09-30', startIso: '2026-09-30', expiresIso: '2027-06-27',
    echeances: [{ numero: 1, dueIso: '2026-09-30', amountXof: 70000 }, { numero: 2, dueIso: '2026-10-05', amountXof: 70000 }] }))]);
  dit('4c · quinze jours de retard : la seance incluse se refuse, et dit pourquoi', 'retard', (await reserve('cliente', 'abo-retard', '2026-11-25')).raison);
}

console.log(`\n${ko ? `${ko} controle(s) en echec sur ${n}.` : `Le serveur de l abonnee tient (${n} epreuves).`}`);
