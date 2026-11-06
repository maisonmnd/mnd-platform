/* LES VACANCES ANNUELLES, ÉPROUVÉES · 6 novembre 2026.
   `node scripts/verifie-les-vacances-annuelles.mjs` (et `--prouve`).
   Maquette 1Jc1m2bUp8rovJ5tmejBAo, ses quatre choix : un seul solde, des
   jours calendaires, la fiche rangée seule dès l'accord, la fermeture de la
   Maison pour toute l'équipe et en journée exceptionnelle fermée. Personnes
   et dates inventées. */
import { readFileSync } from 'node:fs';
import {
  droitDeLAnnee, fermetureEnConges, ficheDeConges, jourLong, joursAFermer, joursCalendaires, nomDeLaFiche,
  periodesDeLAnnee, poseLesVacances, pourquoiPasLaPeriode, repriseApres, resteDit, retireLesVacances, totalDesJours,
  type CongeLu,
} from '../src/shared/vacances-pur';
import { statutDuJour, poseLeJour, STATUTS } from '../src/shared/rh-pur';
import { congeBalance, type LeaveRequest } from '../src/apps/trone/routes/equipe/payroll';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* La semaine de la Maison : fermée le dimanche et le lundi. */
const SEMAINE = [
  { key: 'lun', open: '', close: '', closed: true }, { key: 'mar', open: '09h00', close: '20h00', closed: false },
  { key: 'mer', open: '09h00', close: '20h00', closed: false }, { key: 'jeu', open: '09h00', close: '20h00', closed: false },
  { key: 'ven', open: '09h00', close: '20h00', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
  { key: 'dim', open: '', close: '', closed: true },
];

/* ── 1. Les jours ── */
dit('jours calendaires, dimanche et lundi compris', [5, 7, 1, 0, 0], [joursCalendaires('2027-01-01', '2027-01-05'), joursCalendaires('2027-01-15', '2027-01-21'), joursCalendaires('2027-03-02', '2027-03-02'), joursCalendaires('2027-01-05', '2027-01-01'), joursCalendaires('', '2027-01-01')]);
dit('la reprise : le premier jour ouvert (un congé fini le samedi reprend le mardi)', ['2027-01-06', '2027-01-12', '2027-01-22'],
  [repriseApres('2027-01-05', SEMAINE), repriseApres('2027-01-09', SEMAINE), repriseApres('2027-01-21', SEMAINE)]);
dit('la reprise saute une journée exceptionnelle fermée de la Maison, pas celle d une seule personne', ['2027-01-07', '2027-01-06'],
  [repriseApres('2027-01-05', SEMAINE, [{ date: '2027-01-06', closed: true }]), repriseApres('2027-01-05', SEMAINE, [{ date: '2027-01-06', closed: true, staffId: 'x' }])]);
dit('le jour se dit en entier, 1er compris, avec l annee', ['vendredi 1er janvier 2027', 'mercredi 6 janvier 2027'], [jourLong('2027-01-01'), jourLong('2027-01-06')]);

/* ── 2. Le droit, les périodes, le solde ── */
dit('le droit de l annee : douze mois, ou les mois de service', [24, 12, 0, 22], [droitDeLAnnee('2024-03-01', 2027, 2), droitDeLAnnee('2027-07-01', 2027, 2), droitDeLAnnee('2028-01-01', 2027, 2), droitDeLAnnee('2027-01-15', 2027, 2)]);
const l = (o: Partial<CongeLu>): CongeLu => ({ id: 'x', employeeId: 'g', type: 'vacances', startDate: '2027-01-01', endDate: '2027-01-05', days: 5, status: 'approuve', ...o });
const conges = [
  l({ id: 'v1', fermeture: 'fer-1', reason: 'Fermeture annuelle' }),
  l({ id: 'v2', startDate: '2027-01-15', endDate: '2027-01-21', days: 7 }),
  l({ id: 'c1', type: 'conge', startDate: '2027-08-03', endDate: '2027-08-06', days: 4 }),
  l({ id: 'd1', type: 'conge', status: 'demande', startDate: '2027-09-01', endDate: '2027-09-03', days: 3 }),
  l({ id: 'm1', type: 'maladie', startDate: '2027-10-01', endDate: '2027-10-02', days: 2 }),
  l({ id: 'v0', startDate: '2026-12-28', endDate: '2026-12-30', days: 3 }),
  l({ id: 'autre', employeeId: 'n' }),
];
const ps = periodesDeLAnnee({ conges, employeeId: 'g', annee: 2027, semaine: SEMAINE });
dit('les periodes de l annee : la fermeture, les vacances, le conge accorde ; ni la demande, ni la maladie, ni l an d avant, ni un autre',
  [['v1', 'fermeture'], ['v2', 'vacances'], ['c1', 'conge']], ps.map((p) => [p.id, p.genre]));
dit('total de l annee', 16, totalDesJours(ps));
const avecVacances = [{ ...conges[1], days: 7 } as unknown as LeaveRequest, { ...conges[2] } as unknown as LeaveRequest];
dit('un seul solde : les vacances se decomptent comme les conges', 11, congeBalance('2027-01-01', avecVacances, 'g', 2).pris);
dit('une periode qui chevauche est refusee ; sans chevauchement, acceptee', [true, null, true, true],
  [!!pourquoiPasLaPeriode({ du: '2027-01-20', au: '2027-01-25', employeeId: 'g', conges }), pourquoiPasLaPeriode({ du: '2027-02-01', au: '2027-02-05', employeeId: 'g', conges }),
    !!pourquoiPasLaPeriode({ du: '2027-02-05', au: '2027-02-01' }), !!pourquoiPasLaPeriode({ du: '2027-01-01', au: '2027-04-01' })]);

/* ── 3. La fermeture de la Maison ── */
const equipe = [{ id: 'g' }, { id: 'n' }, { id: 'a' }];
const dejaEnConge = [l({ id: 'c9', employeeId: 'a', type: 'conge', startDate: '2027-08-01', endDate: '2027-08-15', days: 15 })];
const fer = fermetureEnConges({ fermetureId: 'fer-9', du: '2027-08-09', au: '2027-08-14', note: '', equipe, conges: dejaEnConge, par: 'Y.', le: '2026-11-06T00:00:00Z' });
dit('la fermeture : des vacances accordees pour chacun, liees par la fermeture ; qui est deja en conge ne recoit rien de plus',
  [['g', 'n'], ['vacances', 'approuve', 'fer-9', 6, 'Fermeture de la Maison']],
  [fer.map((x) => x.employeeId), [fer[0].type, fer[0].status, fer[0].fermeture, fer[0].days, fer[0].reason]]);
const fermes = joursAFermer({ fermetureId: 'fer-9', du: '2027-01-01', au: '2027-01-05', note: 'Fermeture annuelle', exceptions: [{ date: '2027-01-02', closed: true }, { date: '2027-01-03', closed: true, staffId: 'x' }] });
dit('la fermeture ferme les jours de la Maison qui ne l etaient pas', [['2027-01-01', '2027-01-03', '2027-01-04', '2027-01-05'], true, 'Fermeture annuelle', 'hx-fer-9-2027-01-01'],
  [fermes.map((x) => x.date), fermes.every((x) => x.closed && !('staffId' in x)), fermes[0].note, fermes[0].id]);

/* ── 4. Le planning ── */
let pl = poseLeJour({}, 'y', '2027-01-02', 'inventaire');
pl = poseLesVacances(pl, 'y', '2027-01-01', '2027-01-05');
dit('les vacances se posent en conge au planning ; un jour d inventaire reste un jour de travail',
  ['conge', 'inventaire', 'conge', 'conge', 'conge'], ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05'].map((d) => statutDuJour(pl, 'y', d)));
pl = retireLesVacances(pl, 'y', '2027-01-01', '2027-01-05');
dit('retirer vide les conges et seulement eux', [undefined, 'inventaire', undefined], ['2027-01-01', '2027-01-02', '2027-01-05'].map((d) => statutDuJour(pl, 'y', d)));
dit('l inventaire se dit « inventaire »', 'inventaire', STATUTS.inventaire);

/* ── 5. La fiche ── */
const f2 = ficheDeConges({ prenom: 'Gérald', periode: '2027', periodes: ps.slice(0, 2), droit: 24 });
dit('la fiche de deux conges : premier et second, premiere et seconde reprise, numerotes', [
  'Premier congé · Première reprise', 'Second congé · Seconde reprise', 1, 2, 'vendredi 1er janvier 2027', 'mardi 5 janvier 2027', 'mercredi 6 janvier 2027', 'vendredi 22 janvier 2027',
], [f2.sections[0].titre, f2.sections[1].titre, f2.sections[0].numero, f2.sections[1].numero, f2.sections[0].du, f2.sections[0].au, f2.sections[0].reprise, f2.sections[1].reprise]);
dit('le lead, le total, le reste du droit', ['Deux congés et deux reprises en 2027.', '5 + 7 = 12 jours', 'Reste de votre droit de l’année : 12 jours sur 24.', 'Total de vos congés en 2027'],
  [f2.lead, f2.total, f2.reste, f2.libelleTotal]);
const f3 = ficheDeConges({ prenom: 'G', periode: '2027', periodes: ps, droit: 24 });
dit('trois conges : premier, deuxieme, troisieme', ['Premier congé · Première reprise', 'Deuxième congé · Deuxième reprise', 'Troisième congé · Troisième reprise', 'Trois congés et trois reprises en 2027.', '5 + 7 + 4 = 16 jours'],
  [...f3.sections.map((s) => s.titre), f3.lead, f3.total]);
const f1 = ficheDeConges({ prenom: 'G', periode: 'août 2027', periodes: [ps[2]], droit: 24, prisDansLAnnee: 16 });
dit('un seul conge : « Votre conge », le reste compte toute l annee', ['Votre congé · Votre reprise', 'Un congé et une reprise en août 2027.', '4 jours', 'Reste de votre droit de l’année : 8 jours sur 24.'],
  [f1.sections[0].titre, f1.lead, f1.total, f1.reste]);
dit('le reste s accorde : 0 jour, 1 jour, 2 jours', ['Reste de votre droit de l’année : 0 jour sur 24.', 'Reste de votre droit de l’année : 1 jour sur 24.', 'Reste de votre droit de l’année : 2 jours sur 24.'], [resteDit(24, 24), resteDit(24, 23), resteDit(24, 22)]);
dit('le nom du fichier', 'Congés 2027 - Gérald.pdf', nomDeLaFiche('2027', 'Gérald'));

/* ── 6. Les écrans ── */
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const temps = lis('src/apps/trone/routes/equipe/TempsAbsences.tsx');
const vac = lis('src/apps/trone/routes/equipe/rh/VacancesAnnuelles.tsx');
const espace = lis('src/apps/trone/routes/equipe/rh/MonEspace.tsx');
const coffre = lis('src/shared/engagements-coffre.ts');
dit('l onglet Vacances annuelles est a cote de Conges & absences', [true, true],
  [/onClick=\{\(\) => setTab\('vacances'\)\}>Vacances annuelles<\/button>/.test(temps), /tab === 'vacances' \? <VacancesAnnuelles \/>/.test(temps)]);
dit('les vacances ne se melent pas aux demandes de Conges & absences', true, /\.filter\(\(l\) => \(!l\.branchId \|\| l\.branchId === branch\.id\) && l\.type !== 'vacances'\)/.test(temps));
dit('l accord d un conge fait et range la fiche, seule', true, /if \(l && status === 'approuve' && l\.type === 'conge'\) void ficheDuCongeAccorde\(\{ \.\.\.l, status: 'approuve' \}, false\);/.test(temps));
dit('caler des vacances : au planning, puis la fiche rangee', [true, true],
  [/planningStore\.set\(\(p\) => poseLesVacances\(p, m\.id, f\.du, f\.au\)\);/.test(vac), /const ok = await fiche\(m, \[\.\.\.conges, l as unknown as CongeLu\], true, false\);/.test(vac)]);
dit('la fermeture : toute l equipe, le planning, les journees fermees, une fiche chacun', [true, true, true],
  [/planningStore\.set\(\(p\) => nouveaux\.reduce\(\(acc, l\) => poseLesVacances\(acc, l\.employeeId, l\.startDate, l\.endDate\), p\)\);/.test(vac),
    /if \(fermes\.length\) exceptionsHorairesStore\.set\(\(prev\) => \[\.\.\.\(prev \?\? \[\]\), \.\.\.fermes\]\);/.test(vac),
    /if \(m && await fiche\(m, tous, true, false\)\) rangees \+= 1;/.test(vac)]);
dit('retirer une fermeture rouvre ses journees, et seulement elles', true, /\.filter\(\(x\) => !String\(x\.id \?\? ''\)\.startsWith\(`hx-\$\{l\.fermeture\}-`\)\)/.test(vac));
dit('la fiche dort dans la partie privee du coffre', true, /`\$\{DOSSIER_DES_CONGES\}\/identite\/\$\{staffId\}`/.test(coffre));
dit('Mon espace telecharge sa fiche', true, /void telechargeLaFiche\(fiche, nom\);/.test(espace));

console.log(ko === 0 ? '\nLes vacances annuelles tiennent.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
