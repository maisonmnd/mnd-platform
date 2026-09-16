/* LA FACTURE DU PRESTATAIRE, ÉPROUVÉE — `node scripts/verifie-facture-prestataire.mjs`.

   Une semaine mal découpée paie un jour deux fois, ou pas du tout ; un geste
   de série compté à chaque séance paie trois fois la même prestation ; une
   paie qui se valide sans facture verse ce que personne n'a signé. */
import {
  mardiDe, semainesDuMois, libelleDeSemaine, prestationsDuMois, compteDuMois, compteDeLaFacture,
  nombreEnLettres, ifuValide, ceQuiManqueASoumettre, ceQuiManqueAAccepter, identiteProposee, numeroPropose,
  semainesDuForfait, compteAuForfait,
  moisEcoule, enRetard, totalAccepte, prestatairesSansFactureAcceptee, reporteLaFactureDansLaPaie,
  type ContexteDesPrestations, type FacturePrestataire,
} from '../src/apps/trone/routes/equipe/facture';
import {
  PAYROLL_PARAMETERS_SEED, computePay, ligneDePrestataire, recomputeLine,
  type PayrollLine, type PayrollRun,
} from '../src/apps/trone/routes/equipe/payroll';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LA SEMAINE S'OUVRE LE MARDI ─────────────────────────────────── */
dit('un samedi revient à son mardi', '2026-09-08', mardiDe('2026-09-12'));
dit('un mardi est son propre mardi', '2026-09-08', mardiDe('2026-09-08'));
dit('un dimanche revient à la semaine d’avant', '2026-09-01', mardiDe('2026-09-06'));
dit('un lundi aussi', '2026-09-01', mardiDe('2026-09-07'));

const lib = (mois: string) => semainesDuMois(mois).map((s) => libelleDeSemaine(s.debut, s.finAffichee));
dit('septembre 2026 : cinq lignes, la dernière coupée par le mois', [
  'Du mardi 1er au samedi 5 septembre',
  'Du mardi 8 au samedi 12 septembre',
  'Du mardi 15 au samedi 19 septembre',
  'Du mardi 22 au samedi 26 septembre',
  'Du mardi 29 au mercredi 30 septembre',
], lib('2026-09'));
dit('octobre 2026 commence un jeudi', 'Du jeudi 1er au samedi 3 octobre', lib('2026-10')[0]);
dit('novembre 2026 commence un dimanche : deux jours fermés', 'Du dimanche 1er au lundi 2 novembre', lib('2026-11')[0]);
dit('… qui ne font pas de ligne sans prestation', 4, compteDeLaFacture([], '2026-11').semaines.length);
dit('… et en font une si l’on y a travaillé', 'Du dimanche 1er au lundi 2 novembre',
  (() => {
    const c = compteDeLaFacture([{ date: '2026-11-01', libelle: 'x', prixXof: 1000 }], '2026-11');
    return libelleDeSemaine(c.semaines[0].debut, c.semaines[0].fin);
  })());
dit('l’année se dit sur le papier', 'Du mardi 1er au samedi 5 septembre 2026',
  libelleDeSemaine('2026-09-01', '2026-09-05', { annee: true }));
dit('un seul jour se dit « le »', 'Le mercredi 30 septembre', libelleDeSemaine('2026-09-30', '2026-09-30'));
dit('mai 2026 finit un dimanche, rattaché à la dernière semaine', 'Du mardi 26 au samedi 30 mai',
  (() => {
    const c = compteDeLaFacture([{ date: '2026-05-31', libelle: 'x', prixXof: 1 }], '2026-05');
    const s = c.semaines.find((x) => x.lignes.length)!;
    return libelleDeSemaine(s.debut, s.fin);
  })());

/* ── ② LES PRESTATIONS, DEPUIS LE CARNET ───────────────────────────── */
const sv = (id: string, name: string) => ({ id, name, palier: 'Fondation', priceXof: 0 } as unknown as Service);
const byId = new Map([sv('s1', 'SÍNSIN™ Essentiel'), sv('s2', 'DÀNDÀN™'), sv('s3', 'VÈKPÈ™ Medium')].map((s) => [s.id, s]));
const team = [{ id: 'awa', name: 'Awa D.' }, { id: 'koffi', name: 'Koffi A.' }];
const rdv = (o: Partial<Appointment> & { id: string; date: string; serviceIds: string[] }): Appointment => ({
  branchId: 'b1', clientId: 'c', time: '10:00', master: '', status: 'honoré', ...o,
} as Appointment);
const appts: Appointment[] = [
  rdv({ id: 'a1', date: '2026-09-01', serviceIds: ['s1'], mains: [['awa']] }),
  rdv({ id: 'a2', date: '2026-09-03', serviceIds: ['s1', 's2'], mains: [['awa', 'koffi'], []], master: 'Awa D.' }),
  rdv({ id: 'a3', date: '2026-09-06', serviceIds: ['s2'], mains: [['awa']] }),
  rdv({ id: 'a4', date: '2026-09-08', serviceIds: ['s1'], mains: [['awa']], status: 'confirmé' }),
  rdv({ id: 'a5', date: '2026-09-09', serviceIds: ['s1'], mains: [['awa']], branchId: 'b2' }),
  rdv({ id: 'a6', date: '2026-08-28', serviceIds: ['s3'], mains: [['awa']], seriesId: 'ser1', seriesIndex: 1 }),
  rdv({ id: 'a7', date: '2026-09-10', serviceIds: ['s3'], mains: [['awa']], seriesId: 'ser1', seriesIndex: 2 }),
  rdv({ id: 'a8', date: '2026-09-15', serviceIds: ['s3'], mains: [['koffi']], seriesId: 'ser2', seriesIndex: 1 }),
  rdv({ id: 'a9', date: '2026-09-16', serviceIds: ['s3'], mains: [['awa']], seriesId: 'ser2', seriesIndex: 2 }),
  rdv({ id: 'a10', date: '2026-09-29', serviceIds: ['s1'], mains: [['awa']] }),
];
const ctx: ContexteDesPrestations = { appts, byId, team, branchId: 'b1' };
const awa = { id: 'awa', grille: { s1: 4000, s2: 2000 }, salaireXof: 0 };
const koffi = { id: 'koffi', grille: {}, salaireXof: 0 };

const sept = prestationsDuMois(awa, '2026-09', ctx);
dit('Awa, septembre : les gestes honorés où elle a mis la main', [
  '2026-09-01 s1 4000', '2026-09-03 s1 4000', '2026-09-03 s2 2000', '2026-09-06 s2 2000',
  '2026-09-16 s3 null', '2026-09-29 s1 4000',
], sept.map((l) => `${l.date} ${l.serviceId} ${l.prixXof}`).sort());
dit('à deux mains, chacune compte la prestation', ['2026-09-03 s1', '2026-09-15 s3'],
  prestationsDuMois(koffi, '2026-09', ctx).map((l) => `${l.date} ${l.serviceId}`));
dit('sans grille, le prix manque au lieu d’être inventé', [null, null],
  prestationsDuMois(koffi, '2026-09', ctx).map((l) => l.prixXof));
dit('une série se facture à sa première séance, au mois d’avant', ['2026-08-28 s3'],
  prestationsDuMois(awa, '2026-08', ctx).map((l) => `${l.date} ${l.serviceId}`));
dit('… et sa séance 2 ne se refacture pas en septembre', false, sept.some((l) => l.rdvId === 'a7'));
dit('… mais une main nouvelle sur la séance 2 compte pour elle', true, sept.some((l) => l.rdvId === 'a9'));
dit('ni rendez-vous non honoré, ni autre branche', false, sept.some((l) => l.rdvId === 'a4' || l.rdvId === 'a5'));

/* ── ③ LE COMPTE ────────────────────────────────────────────────────── */
const c = compteDuMois(awa, '2026-09', [], ctx);
dit('une ligne par semaine', [12000, 0, 0, 0, 4000], c.semaines.map((s) => s.montantXof));
dit('le dimanche 6 rejoint la semaine du mardi 1er', 4, c.semaines[0].lignes.length);
dit('le prix manquant se compte dans sa semaine', [0, 0, 1, 0, 0], c.semaines.map((s) => s.prixManquants));
dit('total du mois', 16000, c.totalXof);
dit('une facture à prix manquant ne s’accepte pas', '1 prix à écrire avant d’accepter.', ceQuiManqueAAccepter(c));
/* ── ③ bis LE FORFAIT ÷ 4 — « sans compter le nombre de prestations » ── */
const auForfait = compteDuMois({ ...awa, salaireXof: 80000 }, '2026-09',
  [{ id: 'sg', date: '2026-09-19', libelle: 'x', prixXof: 5000 }], ctx);
dit('au forfait : quatre semaines égales, ni prestation ni signalée comptée',
  ['forfait', [20000, 20000, 20000, 20000], 80000, 0, 0],
  [auForfait.mode, auForfait.semaines.map((s) => s.montantXof), auForfait.totalXof, auForfait.nombre, auForfait.prixManquants]);
dit('sans montant sur la fiche, la grille reste', 'grille', c.mode);
const libF = (mois: string) => semainesDuForfait(mois).map((s) => libelleDeSemaine(s.debut, s.fin));
dit('septembre : la semaine du 29 rejoint celle du 22', [
  'Du mardi 1er au samedi 5 septembre',
  'Du mardi 8 au samedi 12 septembre',
  'Du mardi 15 au samedi 19 septembre',
  'Du mardi 22 au mercredi 30 septembre',
], libF('2026-09'));
dit('octobre : le jeudi 1er rejoint la semaine qui suit', ['Du jeudi 1er au samedi 10 octobre', 4],
  [libF('2026-10')[0], libF('2026-10').length]);
dit('novembre : dimanche et lundi du début ne font pas de ligne', 'Du mardi 3 au samedi 7 novembre', libF('2026-11')[0]);
dit('juillet : deux semaines courtes, la dernière rejoint sa voisine',
  ['Du mercredi 1er au samedi 4 juillet', 'Du mardi 21 au vendredi 31 juillet'],
  [libF('2026-07')[0], libF('2026-07')[3]]);
dit('toujours quatre lignes, sur trois ans', true,
  Array.from({ length: 36 }, (_, i) => {
    const d = new Date(2026, i, 1, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }).every((m) => semainesDuForfait(m).length === 4));
dit('un forfait qui ne se divise pas juste : le reste va à la dernière semaine',
  [21250, 21250, 21250, 21253], compteAuForfait('2026-09', 85003).semaines.map((s) => s.montantXof));
const signalee = compteDuMois(awa, '2026-09', [
  { id: 'sg1', date: '2026-09-19', libelle: 'Co-animation Académie', prixXof: 10000 },
  { id: 'sg2', date: '2026-09-20', serviceId: 's2', libelle: 'DÀNDÀN™' },
  { id: 'sg3', date: '2026-10-01', serviceId: 's1', libelle: 'hors du mois' },
], ctx);
dit('les signalées entrent au prix écrit, ou à celui de la grille', [12000, 0, 12000, 0, 4000],
  signalee.semaines.map((s) => s.montantXof));
dit('… et jamais hors de leur mois', 8, signalee.nombre);

/* ── ④ LES LETTRES ─────────────────────────────────────────────────── */
const lettres: [number, string][] = [
  [0, 'zéro'], [17, 'dix-sept'], [21, 'vingt et un'], [71, 'soixante et onze'], [77, 'soixante-dix-sept'],
  [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [91, 'quatre-vingt-onze'], [99, 'quatre-vingt-dix-neuf'],
  [180, 'cent quatre-vingts'], [200, 'deux cents'], [1000, 'mille'], [1250, 'mille deux cent cinquante'],
  [80000, 'quatre-vingt mille'], [87000, 'quatre-vingt-sept mille'], [250000, 'deux cent cinquante mille'],
  [300080, 'trois cent mille quatre-vingts'], [1001000, 'un million mille'], [2000000, 'deux millions'],
];
for (const [n, mots] of lettres) dit(`${n} en lettres`, mots, nombreEnLettres(n));

/* ── ⑤ L'IDENTITÉ, LE NUMÉRO, LA SOUMISSION ────────────────────────── */
dit('le nom en capitales est le nom de famille',
  { nom: 'DOSSA', prenoms: 'Awa Mireille', telephone: '', email: 'a@exemple.bj', ifu: '' },
  identiteProposee({ name: 'DOSSA Awa Mireille', phone: '+229 ', email: 'a@exemple.bj', ifu: '' }));
dit('sinon le dernier mot', ['Dossa', 'Awa'],
  (() => { const i = identiteProposee({ name: 'Awa Dossa', phone: '', email: '', ifu: '' }); return [i.nom, i.prenoms]; })());
dit('la facture précédente l’emporte, complétée par la fiche', ['X', '0190000000', '3202600000000'],
  (() => {
    const i = identiteProposee({ name: 'Awa Dossa', phone: '0190000000', email: '', ifu: '3202600000000' },
      { nom: 'X', prenoms: 'Y', telephone: '', email: 'y@exemple.bj', ifu: '' });
    return [i.nom, i.telephone, i.ifu];
  })());
dit('le numéro : initiales, année, mois', 'AD-2026-09', numeroPropose({ nom: 'DOSSA', prenoms: 'Awa Mireille' }, '2026-09'));
dit('les accents ne passent pas dans le numéro', 'EE-2026-10', numeroPropose({ nom: 'Ézin', prenoms: 'Élodie' }, '2026-10'));
dit('IFU : treize chiffres', [true, false, true],
  [ifuValide('3202600000000'), ifuValide('320260000000'), ifuValide('3202 6000 00000')]);
const identite = { nom: 'DOSSA', prenoms: 'Awa', telephone: '+229 01 90 00 00 00', email: 'a@exemple.bj', ifu: '3202600000000' };
const trait = 'data:image/png;base64,'.padEnd(80, 'A');
dit('sans IFU, on ne soumet pas', 'L’IFU compte 13 chiffres, il est obligatoire pour soumettre.',
  ceQuiManqueASoumettre({ identite: { ...identite, ifu: '' }, numero: 'AD', signature: { at: '2026-10-01', signePar: 'Awa', signature: trait, version: 'v' } }));
dit('sans signature non plus', 'Signez la facture avant de la soumettre.',
  ceQuiManqueASoumettre({ identite, numero: 'AD', signature: { at: '2026-10-01', signePar: 'Awa', signature: '', version: 'v' } }));
dit('complète, elle se soumet', undefined,
  ceQuiManqueASoumettre({ identite, numero: 'AD', signature: { at: '2026-10-01', signePar: 'Awa', signature: trait, version: 'v' } }));
dit('le mois écoulé, même en janvier', ['2025-12', '2026-09'], [moisEcoule('2026-01-03'), moisEcoule('2026-10-02')]);
dit('en retard après le 5, pas avant', [false, true, false],
  [enRetard(undefined, '2026-09', '2026-10-05'), enRetard(undefined, '2026-09', '2026-10-06'),
    enRetard({ etat: 'soumise' }, '2026-09', '2026-10-09')]);

/* ── ⑥ LA PAIE ─────────────────────────────────────────────────────── */
const zero = { base: 0, heuresSup: 0, prime: 0, pourboires: 0, commission: 0, indemnites: 0 };
const ligne = (employeeId: string, name: string, o: Partial<PayrollLine> = {}): PayrollLine => ({
  employeeId, name, gains: { ...zero, base: 300000 }, deductions: { avance: 0, autresRetenues: 0 },
  result: computePay({ ...zero, base: 300000 }, { avance: 0, autresRetenues: 0 }, PAYROLL_PARAMETERS_SEED), ...o,
});
const lp = ligneDePrestataire(ligne('awa', 'Awa D.', { deductions: { avance: 5000, autresRetenues: 0 } }), 87000, 'fp-2026-09-awa');
dit('la ligne d’une prestataire verse la facture, sans CNSS ni ITS', [87000, 0, 0, 0, 82000],
  [lp.result.brut, lp.result.cnssSalariale, lp.result.its, lp.result.cnssPatronale, lp.result.net]);
dit('… et le reste une fois recalculée', 0, recomputeLine(lp, PAYROLL_PARAMETERS_SEED).result.cnssSalariale);
dit('un salarié garde sa CNSS au recalcul', 10800, recomputeLine(ligne('rita', 'Rita G.'), PAYROLL_PARAMETERS_SEED).result.cnssSalariale);
const avecBonus = ligneDePrestataire(
  ligne('awa', 'Awa D.', { gains: { ...zero, base: 80000, prime: 10000, commission: 4000 } }), 80000, 'fp-2026-09-awa');
dit('le bonus se verse hors facture, la commission tombe, sans charges', [80000, 10000, 0, 90000, 0, 90000],
  [avecBonus.gains.base, avecBonus.gains.prime, avecBonus.gains.commission, avecBonus.result.brut,
    avecBonus.result.cnssSalariale, avecBonus.result.net]);

const facture = (staffId: string, etat: FacturePrestataire['etat'], total: number): FacturePrestataire => ({
  id: `fp-2026-09-${staffId}`, branchId: 'b1', staffId, mois: '2026-09', numero: 'N', etat, signalees: [],
  identite, creeLe: '2026-10-01',
  compteAccepte: etat === 'acceptee' ? { ...compteDeLaFacture([], '2026-09'), totalXof: total } : undefined,
});
const factures = [facture('awa', 'acceptee', 87000), facture('sena', 'soumise', 40000)];
const staff = [
  { id: 'awa', contractType: 'prestataire' as const },
  { id: 'koffi', contractType: 'prestataire' as const },
  { id: 'sena', contractType: 'prestataire' as const },
  { id: 'rita', contractType: 'CDI' as const },
];
const lignes = [
  ligne('awa', 'Awa D.', { prestataire: true }),
  ligne('koffi', 'Koffi A.'),
  ligne('sena', 'Sènan H.', { prestataire: true }),
  ligne('rita', 'Rita G.'),
];
dit('la paie attend les prestataires sans facture acceptée, fiche comprise', ['Koffi A.', 'Sènan H.'],
  prestatairesSansFactureAcceptee(lignes, '2026-09', staff, factures).map((l) => l.name));
dit('une facture soumise ne paie pas encore', undefined, totalAccepte(factures[1]));

const runs: PayrollRun[] = [
  { id: 'r1', period: '2026-09', status: 'brouillon', lines: lignes, createdAt: '', branchId: 'b1' },
  { id: 'r2', period: '2026-09', status: 'valide', lines: lignes, createdAt: '', branchId: 'b1' },
  { id: 'r3', period: '2026-08', status: 'brouillon', lines: lignes, createdAt: '', branchId: 'b1' },
];
const apres = reporteLaFactureDansLaPaie(runs, factures[0]);
dit('acceptée, le total entre dans le brouillon du mois', 87000, apres[0].lines[0].gains.base);
dit('… sans toucher une paie validée ni un autre mois', [300000, 300000],
  [apres[1].lines[0].gains.base, apres[2].lines[0].gains.base]);

if (ko) {
  console.log(`\n${ko} échec(s).`);
  process.exit(1);
}
console.log('\nLa facture du prestataire tient.');
