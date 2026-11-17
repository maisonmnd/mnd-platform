/* LES GESTES DE LA CLIENTE ET LA MESURE, ÉPROUVÉS —
   `node scripts/verifie-les-gestes-et-la-mesure.mjs`.

   13 novembre 2026 (la Consultation, lot 4). Ce que la cliente voit et fait
   de ses devis dans Ma Couronne (devis-de-la-cliente-pur), l'acompte du
   rendez-vous né d'un devis confirmé, la mesure de la consultation (A, B, C,
   l'entonnoir, l'écart estimation et prix ferme), et les branchements.
   Les montants sont des exemples. Sortie ASCII : la console de Windows. */
import {
  acompteDuDevis, apresLeGeste, attendElle, boutonDuGeste, gesteDeLaCliente, motPourElle, visiblePourElle, type DevisLu,
} from '../src/shared/devis-de-la-cliente-pur';
import { LIBELLE_DE_LA_DEDUCTION, mesureDeLaConsultation, pourcentDit } from '../src/shared/mesure-de-la-consultation-pur';
import { deductionDeLaConsultation } from '../src/shared/devis-de-la-consultation-pur';
import { EN_DEVIS } from '../src/apps/couronne/i18n/en-devis';
import { EN } from '../src/apps/couronne/i18n/en';
import type { OnlineConsultation } from '../src/shared/bridges';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/* ── ① LES GESTES DE LA CLIENTE ───────────────────────────────────────
   17 novembre 2026 : elle ne voit et ne touche qu'un devis que la Maison lui
   a REMIS (`remisLe`, pose au rendez-vous : verifie-le-devis-remis). Les
   exemples d'ici sont donc des devis remis. */
const REMIS = { kind: 'devis', date: '2026-11-20', remisLe: '2026-11-20T10:00:00.000Z' };
const ETATS: DevisLu[] = ([
  { status: 'brouillon' }, { status: 'estimé' }, { status: 'à valider', aValiderPar: 'maison' }, { status: 'à valider', aValiderPar: 'cliente' },
  { status: 'envoyée' }, { status: 'acceptée' }, { status: 'confirmé' }, { status: 'payée' },
] as DevisLu[]).map((e) => ({ ...e, ...REMIS }));
dit('elle voit ses devis remis, jamais un brouillon ni une piece payee', [false, true, true, true, true, true, true, false], ETATS.map(visiblePourElle));
dit('elle ne voit pas un devis que la Maison n a pas remis', [false, false, false], [visiblePourElle({ status: 'estimé' }), visiblePourElle({ status: 'envoyée', kind: 'devis', date: '2026-11-20' }), visiblePourElle({ status: 'confirmé', kind: 'devis', date: '2026-11-20' })]);
dit('un seul geste par etat, et la Maison seule confirme', [null, 'faire-confirmer', null, 'valider', 'accepter', null, null, null], ETATS.map((e) => gesteDeLaCliente(e)));
dit('faire confirmer : a valider par la Maison', { status: 'à valider', aValiderPar: 'maison' }, apresLeGeste({ status: 'estimé', ...REMIS }, 'faire-confirmer'));
dit('valider ou accepter : acceptee, plus rien a valider', [{ status: 'acceptée' }, { status: 'acceptée' }],
  [apresLeGeste({ status: 'à valider', aValiderPar: 'cliente', ...REMIS }, 'valider'), apresLeGeste({ status: 'envoyée', ...REMIS }, 'accepter')].map((x) => JSON.parse(JSON.stringify(x))));
dit('un geste qui ne correspond pas a l etat n ecrit rien', [null, null, null], [
  apresLeGeste({ status: 'à valider', aValiderPar: 'maison', ...REMIS }, 'valider'), apresLeGeste({ status: 'confirmé', ...REMIS }, 'accepter'), apresLeGeste({ status: 'envoyée', ...REMIS }, 'faire-confirmer'),
]);
dit('la pastille ne compte que ce qui attend son geste', [false, false, false, true, true, false], ETATS.slice(0, 6).map((e) => attendElle(e)));
const phrases = [...ETATS.filter(visiblePourElle).map((e) => motPourElle(e)), ...Object.values(boutonDuGeste)];
dit('chaque phrase de la cloche a son anglais', [], phrases.filter((p) => !p || !EN[p]));
dit('le dictionnaire des devis est range dans le grand', true, Object.keys(EN_DEVIS).every((k) => EN[k] === EN_DEVIS[k]));

/* ── ② L'ACOMPTE DU RENDEZ-VOUS NÉ D'UN DEVIS ───────────────────────── */
const IDS: Record<string, string> = { 'FINFIN Profond': 'sv-ff', 'GBATA Essentiel': 'sv-gb' };
const TAUX: Record<string, number> = { 'sv-ff': 0.3, 'sv-gb': 0.5 };
dit('chaque ligne a son taux, au prix du devis ; une ligne inconnue ne demande rien', 64000,
  acompteDuDevis([{ label: 'FINFIN Profond', unitXof: 80000, qty: 1 }, { label: 'GBATA Essentiel', unitXof: 80000, qty: 1 }, { label: 'Ligne libre', unitXof: 50000, qty: 1 }], (x) => IDS[x], (id) => TAUX[id] ?? 0));
dit('la remise de la ligne et la remise globale se repercutent', Math.round(80000 * 0.9 * 0.8 * 0.3),
  acompteDuDevis([{ label: 'FINFIN Profond', unitXof: 80000, qty: 1, discountPct: 10 }], (x) => IDS[x], (id) => TAUX[id] ?? 0, 20));

/* ── ③ LA MESURE ────────────────────────────────────────────────────── */
const T0 = Date.parse('2026-11-13T12:00:00.000Z');
const jour = (j: number) => new Date(T0 - j * 86_400_000).toISOString();
const C = (id: string, j: number, paid: number, min: number, max: number): OnlineConsultation => ({
  id, createdAt: jour(j), parcours: 'sos', client: { name: 'X', phone: '', city: '', currency: 'XOF' }, answers: {}, paidXof: paid, branchId: 'b',
  status: 'nouvelle', modalite: 'auto', estimation: { lignes: [], aConfirmer: [], min, max, aChiffrer: 0 },
} as unknown as OnlineConsultation);
const consultations = [C('c1', 5, 15000, 80000, 120000), C('c2', 10, 0, 40000, 60000), C('c3', 20, 0, 10000, 20000), C('vieille', 200, 15000, 1, 2)];
const devis = [
  { id: 'd1', kind: 'devis', status: 'estimé', date: '2026-11-08', consultationId: 'c1', totalXof: 80000 },
  { id: 'd2', kind: 'devis', status: 'acceptée', date: '2026-11-10', consultationId: 'c1', totalXof: 85000, deduitXof: 15000 },
  { id: 'd3', kind: 'devis', status: 'payée', date: '2026-11-05', consultationId: 'c2', totalXof: 60000 },
  { id: 'd4', kind: 'devis', status: 'brouillon', date: '2026-11-05', consultationId: 'c3', totalXof: 15000 },
  { id: 'f1', kind: 'facture', status: 'payée', date: '2026-11-05', consultationId: 'c3', totalXof: 15000 },
];
const visios = [{ debut: jour(3), statut: 'tenue' }, { debut: jour(4), statut: 'manquée' }, { debut: jour(1), statut: 'annulée' }, { debut: jour(300), statut: 'tenue' }];
const m = mesureDeLaConsultation(consultations, devis, visios, T0 - 90 * 86_400_000);
dit('A, B, C sur quatre-vingt-dix jours', [3, { reservees: 2, tenues: 1, manquees: 1 }, 1, 15000], [m.gratuites, m.visios, m.reglees, m.encaisseXof]);
dit('l entonnoir se compte par consultation (ni brouillon, ni facture)', { estimes: 2, confirmes: 2, payes: 1 }, m.devis);
dit('l ecart : le prix ferme (deduction rajoutee) contre le milieu de la fourchette', { n: 2, moyennePct: 10, dansLaFourchette: 2 }, m.ecart);
dit('l ecart se dit avec son signe', ['+8 %', '−12 %', '0 %'], [pourcentDit(8), pourcentDit(-12), pourcentDit(0)]);
dit('la deduction se reconnait au nom que pose le devis ferme', LIBELLE_DE_LA_DEDUCTION,
  deductionDeLaConsultation({ paidXof: 15000 } as unknown as OnlineConsultation)?.discountLabel);

/* ── ④ LES BRANCHEMENTS ─────────────────────────────────────────────── */
const tabs = lf('src/apps/couronne/Tabs.tsx');
dit('Ma Couronne : le juge pur choisit, la cloche fait son geste', [true, true, true, false], [
  /i\.kind === 'devis' && visiblePourElle\(i\)/.test(tabs), /const apres = apresLeGeste\(i, g, todayIso\(\)\);/.test(tabs),
  /devis\.filter\(\(x\) => attendElle\(x, todayIso\(\)\)/.test(tabs), /acceptDevis/.test(tabs),
]);
const factures = lf('src/apps/trone/routes/vente/Factures.tsx');
dit('le devis ne d une consultation garde son lien, le rendez-vous porte l acompte demande', [true, true, false], [
  /consultationId: c\.id,/.test(factures), /\.\.\.\(acompte > 0 \? \{ depositXof: acompte \} : \{\}\)/.test(factures), /depositConfirmed: true/.test(factures.split('const rendezVousDuDevis')[1]?.split('const {')[0] ?? ''),
]);
dit('la mesure est en tete de Consultations', true, /<ConsultationsMesure \/>\n\s*<ConsultationsGratuites \/>/.test(lf('src/apps/trone/routes/clients/Consultations.tsx')));
const neufs = ['src/shared/devis-de-la-cliente-pur.ts', 'src/shared/mesure-de-la-consultation-pur.ts', 'src/apps/trone/routes/clients/ConsultationsMesure.tsx'].map(lf);
dit('aucun emoji, ni librairie de graphiques', [false, false], [
  neufs.some((t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)), neufs.some((t) => /from '(recharts|chart\.js|d3|victory|nivo)/.test(t)),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : les gestes et la mesure ne tiennent pas leurs promesses.');
else console.log('TOUT VA BIEN : les gestes et la mesure tiennent leurs promesses.');
