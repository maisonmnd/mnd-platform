import { readFileSync } from 'node:fs';
import {
  MOTIF_PRELEVEMENT, MOTIF_REMBOURSEMENT, lignesDuCompteCourant, soldeDuCompteCourant,
  retenuesEnAttenteXof, retenuePrevueDuCompteCourant, retenueApplicable, appliqueLaRetenue,
  periodeSuivante, pourquoiRetenueImpossible, type RetenueCompteCourant,
} from '../src/shared/compte-courant';
import type { MouvementHorsActivite } from '../src/shared/finance';

/* LE COMPTE COURANT D'ASSOCIÉ, ÉPROUVÉ — 27 septembre 2026 au soir.

   La Maison devient une société le 28. Ce harnais tient la RÈGLE, pas le
   cas du jour :

     (1) le solde est ce qui est sorti pour l'associé moins ce qui est
         réellement revenu : une retenue PRÉVUE ne compte pas, une retenue
         APPLIQUÉE compte, au jour du règlement ;
     (2) ce qui n'est pas à lui ne le concerne pas : une autre branche, un
         autre associé, un autre motif ;
     (3) une retenue ne dépasse jamais ce qui est prévu, ni le plafond de la
         Maison une fois le prêt servi, et n'est jamais négative ;
     (4) régler le run applique les retenues prévues de la période dans
         l'ordre où elles ont été posées, reporte ce que le plafond a retenu
         au mois suivant, et rejouer le même règlement ne double rien ;
     (5) on ne pose jamais une retenue au-delà de ce qui est dû, retenues
         déjà prévues comptées ;
     (6) et la paie fait bien ces gestes : la lettre de Paie.tsx et de
         payroll.ts en témoigne, contrôles cherchés sur l'APPEL.

   Lance : node scripts/verifie-le-compte-courant.mjs */

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const m = (o: Partial<MouvementHorsActivite> & { id: string }): MouvementHorsActivite => ({
  branchId: 'b1', date: '2026-10-01', sens: 'sortie', motif: MOTIF_PRELEVEMENT, label: 'Y. · courses',
  amountXof: 10000, cashbox: 'Caisse', staffId: 'y', ...o,
});

/* ── (1) LE SOLDE ───────────────────────────────────────────────────── */
const mouvements = [
  m({ id: 'a', date: '2026-09-30', label: 'Y. · solde de départ', amountXof: 120000 }),
  m({ id: 'b', date: '2026-10-12', amountXof: 15000 }),
  m({ id: 'c', date: '2026-10-20', sens: 'entree', motif: MOTIF_REMBOURSEMENT, label: 'Y. · remboursement', amountXof: 20000 }),
];
const prevue: RetenueCompteCourant = { id: 'r1', period: '2026-10', amountXof: 60000, poseLe: '2026-10-01T10:00:00Z' };
const appliquee: RetenueCompteCourant = { ...prevue, id: 'r0', period: '2026-09', runId: 'run-9', appliqueXof: 30000, appliqueLe: '2026-09-30' };
const lignes = lignesDuCompteCourant(mouvements, 'b1', 'y', [prevue, appliquee]);
dit('le solde : sorti moins réellement revenu (120 000 + 15 000, moins 20 000, moins 30 000)', 85000, soldeDuCompteCourant(lignes));
dit('… la retenue prévue n’y compte pas, elle attend le règlement', 60000, retenuesEnAttenteXof([prevue, appliquee]));
dit('… la retenue appliquée est une ligne « Paie » au jour du règlement', ['2026-09-30', 'Paie', 30000],
  lignes.filter((l) => l.ou === 'Paie').map((l) => [l.date, l.ou, l.retourXof])[0]);
dit('… du plus récent au plus ancien', ['c', 'b', 'a', 'r0'], lignes.map((l) => l.id));

/* ── (2) CE QUI N'EST PAS À LUI ─────────────────────────────────────── */
const etrangers = [
  m({ id: 'x1', branchId: 'b2' }),
  m({ id: 'x2', staffId: 'b' }),
  m({ id: 'x3', motif: 'Remboursement d’emprunt' }),
  m({ id: 'x4', sens: 'entree', motif: 'Prêt reçu' }),
  m({ id: 'x5', staffId: undefined }),
];
dit('une autre branche, un autre associé, un autre motif, sans associé : rien', 0,
  soldeDuCompteCourant(lignesDuCompteCourant(etrangers, 'b1', 'y', [])));

/* ── (3) LA RETENUE APPLICABLE ──────────────────────────────────────── */
dit('sans plafond fixé, tout ce qui est prévu', 60000, retenueApplicable(60000, null, 0));
dit('… le plafond borne, une fois le prêt servi (80 000 de plafond, 30 000 de prêt)', 50000, retenueApplicable(60000, 80000, 30000));
dit('… et jamais négative quand le prêt mange tout', 0, retenueApplicable(60000, 20000, 30000));
dit('… rien de prévu, rien de retenu', 0, retenueApplicable(0, 80000, 0));
dit('la retenue prévue d’une période additionne ses lignes, pas celles des autres ni celles déjà faites', 60000,
  retenuePrevueDuCompteCourant([prevue, appliquee, { ...prevue, id: 'r2', period: '2026-11' }], '2026-10'));

/* ── (4) LE RÈGLEMENT DU RUN ────────────────────────────────────────── */
const deux: RetenueCompteCourant[] = [
  { id: 'p1', period: '2026-10', amountXof: 40000, poseLe: '2026-10-02T10:00:00Z' },
  { id: 'p2', period: '2026-10', amountXof: 20000, poseLe: '2026-10-01T10:00:00Z' },
  { id: 'p3', period: '2026-11', amountXof: 5000, poseLe: '2026-10-03T10:00:00Z' },
];
const apres = appliqueLaRetenue(deux, '2026-10', 'run-10', 50000, '2026-10-31');
dit('le règlement sert d’abord la retenue posée en premier (p2), puis p1', [['p2', 20000], ['p1', 30000]],
  apres.filter((r) => r.runId === 'run-10').sort((a, b) => a.poseLe.localeCompare(b.poseLe)).map((r) => [r.id, r.appliqueXof]));
dit('… ce que le plafond n’a pas laissé passer se reporte au mois suivant', [['p1-suite', '2026-11', 10000]],
  apres.filter((r) => r.id.endsWith('-suite')).map((r) => [r.id, r.period, r.amountXof]));
dit('… la retenue de novembre n’est pas touchée', [['p3', undefined]], apres.filter((r) => r.id === 'p3').map((r) => [r.id, r.runId]));
dit('… et rejouer le même règlement ne double rien', JSON.stringify(apres),
  JSON.stringify(appliqueLaRetenue(apres, '2026-10', 'run-10', 50000, '2026-10-31')));
dit('le mois suivant, y compris en fin d’année', ['2026-11', '2027-01'], [periodeSuivante('2026-10'), periodeSuivante('2026-12')]);

/* ── (5) ON NE POSE PAS PLUS QUE DÛ ─────────────────────────────────── */
dit('rien à retenir sans montant', 'Écrivez le montant à retenir.', pourquoiRetenueImpossible(0, 85000, 0));
dit('… au-delà du dû moins le déjà prévu, on refuse', true, /25000 F au plus/.test(pourquoiRetenueImpossible(30000, 85000, 60000) ?? ''));
dit('… tout déjà prévu, on refuse aussi', true, /déjà prévu/.test(pourquoiRetenueImpossible(1000, 85000, 85000) ?? ''));
dit('… et le juste montant passe', undefined, pourquoiRetenueImpossible(25000, 85000, 60000));

/* ── (6) LA LETTRE DE LA PAIE ───────────────────────────────────────── */
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const paie = sansCommentaires('src/apps/trone/routes/equipe/Paie.tsx');
const payroll = sansCommentaires('src/apps/trone/routes/equipe/payroll.ts');
dit('le net du bulletin déduit la retenue du compte courant', true, /ded\.retenueCompteCourant/.test(payroll));
dit('la création du run lit la retenue prévue de la période', true, /retenuePrevueDuCompteCourant\(/.test(paie) && /retenueApplicable\(/.test(paie));
dit('… et le règlement du run l’applique sur la fiche du membre', true, /appliqueLaRetenue\(/.test(paie));
dit('… le bulletin la nomme', true, /Compte courant d’associé/.test(paie));

console.log(ko === 0 ? '\nLe compte courant tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
