/* LA PAIE DU 5, ÉPROUVÉE : 5 novembre 2026 (lot 1).
   `node scripts/verifie-la-paie-du-5.mjs` (et `--prouve`).

   Ce que Yéman a choisi au sélecteur le 5 novembre 2026, et que la règle
   doit tenir : le calendrier (le 1er à 8 h, le 5 à 12 h et à 18 h, le
   dimanche passé au lundi 6), l'état de chaque ligne (à confirmer,
   confirmée, erreur signalée, bloquée, validée, payée), le plafond du mois
   d'avant plus 25 %, le numéro changé depuis moins de 7 jours, le fichier
   du portail MTN au format de ses essais (montant = net moins les frais),
   le numéro de lot obligatoire et unique, une ligne jamais payée deux fois,
   les totaux par voie ; puis ce que l'écran et la base en font. Les
   attentes viennent de la PROMESSE, jamais du calcul du code. Noms,
   numéros et montants inventés : le dépôt est public. */
import { readdirSync, readFileSync } from 'node:fs';
import {
  appliqueLeLot, aCotonou, calendrierDeLaPaie, cleDuBulletin, depotDeLaLigne, detailDuBulletin, duMois, fichierMtn, fraisDeLaVoie,
  gardeDuNumero, heureDite, idDuBulletin, jourDit, lignesDuFichierMtn, lisLeNumero, litLaLigne, lotsDejaNotes, momentDit,
  netDuMoisDAvant, nomPourMtn, numeroDeLaFiche, numeroDit, phaseDuMois, phraseDuBlocage, plafondDuNet, pourquoiPasLeLot,
  quandDit, resumeDeLaPaie, totauxParVoie, valideLesLignes,
  type ConfirmationDePaie, type FichierMtnPrepare, type LectureDeLaLigne, type LigneDeLaPaie, type MobileMoney,
} from '../src/shared/paie-du-5-pur';
import { ligneEstPayee, payrollRunsStore, resteAVerserXof, type PayrollLine, type PayrollRun } from '../src/apps/trone/routes/equipe/payroll';
import { dansLeFichierEnAttente, deposeDansMonEspace } from '../src/apps/trone/routes/equipe/paie-du-5';
import { bulletinsStore } from '../src/shared/rh';
import { CHAMPS_DU_DOSSIER, type StaffMember } from '../src/apps/trone/routes/equipe/data';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const F = (n: number) => `${n} F`;
/** Une heure de Cotonou (UTC+1), en instant. */
const aCot = (local: string) => Date.parse(`${local}:00+01:00`);

/* ── 1. LE CALENDRIER ── */
const nov = calendrierDeLaPaie('2026-11');
dit('la paie de novembre 2026 : dépôt le 1er décembre à 8 h, confirmations jusqu’au 5 à 12 h, paie le 5 à 18 h',
  ['2026-12', '2026-12-01T08:00', '2026-12-05T12:00', '2026-12-05T18:00', '2026-12-05', false],
  [nov?.moisDePaie, nov?.depot.local, nov?.finDesConfirmations.local, nov?.paie.local, nov?.jourDePaie, nov?.reporteAuLundi]);
dit('18 h à Cotonou, c’est 17 h UTC, quel que soit le fuseau de l’appareil',
  [Date.UTC(2026, 11, 5, 17, 0), Date.UTC(2026, 11, 1, 7, 0)], [nov?.paie.ms, nov?.depot.ms]);
const mars = calendrierDeLaPaie('2026-03');
const juin = calendrierDeLaPaie('2026-06');
dit('un 5 dimanche (avril et juillet 2026) passe au lundi 6, aux mêmes heures ; le dépôt reste le 1er',
  ['2026-04-06T12:00', '2026-04-06T18:00', '2026-04-01T08:00', true, '2026-07-06T18:00', true],
  [mars?.finDesConfirmations.local, mars?.paie.local, mars?.depot.local, mars?.reporteAuLundi, juin?.paie.local, juin?.reporteAuLundi]);
const dec = calendrierDeLaPaie('2026-12');
dit('décembre 2026 se paie en janvier 2027 (le 5, un mardi)', ['2027-01', '2027-01-01T08:00', '2027-01-05T18:00', false],
  [dec?.moisDePaie, dec?.depot.local, dec?.paie.local, dec?.reporteAuLundi]);
dit('un mois illisible n’a pas de calendrier', [null, null], [calendrierDeLaPaie('2026-13'), calendrierDeLaPaie('nov')]);
dit('les quatre temps du mois, aux bornes exactes',
  ['avant-le-depot', 'confirmation', 'confirmation', 'validation', 'validation', 'apres-la-paie'],
  nov ? [
    phaseDuMois(nov, aCot('2026-12-01T07:59')), phaseDuMois(nov, aCot('2026-12-01T08:00')), phaseDuMois(nov, aCot('2026-12-05T11:59')),
    phaseDuMois(nov, aCot('2026-12-05T12:00')), phaseDuMois(nov, aCot('2026-12-05T17:59')), phaseDuMois(nov, aCot('2026-12-05T18:00')),
  ] : []);
dit('les dates se disent avec leur année, « 1er », et l’heure à la française',
  ['samedi 5 décembre 2026', 'samedi 5 décembre 2026 à 18 h', '1er décembre 2026', '9 h 14', '2 décembre 2026 à 9 h 14', '2026-12-02T09:14'],
  [jourDit('2026-12-05T18:00'), momentDit('2026-12-05T18:00'), jourDit('2026-12-01T08:00', false), heureDite('2026-12-02T09:14'),
    quandDit('2026-12-02T08:14:00.000Z'), aCotonou(Date.UTC(2026, 11, 2, 8, 14))]);

dit('le mois s’élide devant une voyelle', ['de novembre 2026', 'd’octobre 2026', 'd’août 2026', 'd’avril 2027'],
  [duMois('2026-11'), duMois('2026-10'), duMois('2026-08'), duMois('2027-04')]);

/* ── 2. LE NUMÉRO ── */
dit('un numéro se lit en 229 + dix chiffres, quelle que soit sa saisie',
  ['2290190000001', '2290190000001', '2290190000001', '2290190000001'],
  ['01 90 00 00 01', '+229 01 90 00 00 01', '00229 0190000001', '2290190000001'].map((x) => lisLeNumero(x).msisdn));
dit('huit chiffres (l’ancien format) se refusent, ils ne se complètent pas ; un numéro court ne se lit pas',
  [true, true, 'Ce numéro ne se lit pas : dix chiffres, commençant par 01.', 'Aucun numéro.', undefined],
  [/ajoutez 01 devant/.test(lisLeNumero('90 00 00 01').erreur ?? ''), /ajoutez 01 devant/.test(lisLeNumero('22990000001').erreur ?? ''),
    lisLeNumero('12345').erreur, lisLeNumero('').erreur, lisLeNumero('90 00 00 01').msisdn]);
dit('le numéro se dit par paires', '01 90 00 00 01', numeroDit('2290190000001'));

const mmA: MobileMoney = { numero: '2290190000001', operateur: 'MTN', changeLe: '2026-11-28T10:00:00.000Z' };
dit('changé depuis moins de 7 jours : gardé ; à 7 jours pile, libre',
  [true, false], [gardeDuNumero(mmA, Date.parse('2026-12-05T09:59:59Z')).bloque, gardeDuNumero(mmA, Date.parse('2026-12-05T10:00:00Z')).bloque]);
dit('revalidé après le changement : libre ; une revalidation d’avant le changement ne vaut rien ; une date illisible garde',
  [false, true, true], [
    gardeDuNumero({ ...mmA, revalideLe: '2026-11-29T08:00:00.000Z', revalidePar: 'Y.' }, Date.parse('2026-11-30T00:00:00Z')).bloque,
    gardeDuNumero({ ...mmA, revalideLe: '2026-11-20T08:00:00.000Z', revalidePar: 'Y.' }, Date.parse('2026-11-30T00:00:00Z')).bloque,
    gardeDuNumero({ ...mmA, changeLe: 'hier' }, Date.parse('2027-06-01T00:00:00Z')).bloque,
  ]);
const ancien: MobileMoney = { ...mmA, revalideLe: '2026-11-29T08:00:00.000Z', revalidePar: 'Y.' };
const memeNumero = numeroDeLaFiche(ancien, '01 90 00 00 01', 'MTN', '2026-12-01T00:00:00.000Z');
const autreNumero = numeroDeLaFiche(ancien, '01 90 00 00 02', 'MTN', '2026-12-01T00:00:00.000Z', 'B.');
const autreOperateur = numeroDeLaFiche(ancien, '01 90 00 00 01', 'Moov', '2026-12-01T00:00:00.000Z');
dit('à la fiche : le même numéro garde son histoire ; un autre numéro ou un autre opérateur repart à zéro, sans revalidation',
  [true, '2026-12-01T00:00:00.000Z', undefined, 'B.', '2026-12-01T00:00:00.000Z', 'Moov'],
  [memeNumero.mobileMoney === ancien, autreNumero.mobileMoney?.changeLe, autreNumero.mobileMoney?.revalideLe, autreNumero.mobileMoney?.changePar,
    autreOperateur.mobileMoney?.changeLe, autreOperateur.mobileMoney?.operateur]);
dit('à la fiche : vide, plus de numéro ; illisible ou sans opérateur, refusé',
  [{}, true, 'Choisissez l’opérateur du numéro : MTN ou Moov.'],
  [numeroDeLaFiche(ancien, '  ', 'MTN', 'x'), !!numeroDeLaFiche(undefined, '9000', 'MTN', 'x').erreur, numeroDeLaFiche(undefined, '0190000001', '', 'x').erreur]);

/* ── 3. LE PLAFOND ── */
dit('plafond : le net du mois d’avant plus 25 %, arrondi au franc inférieur ; pas de mois d’avant, pas de plafond ; 0 F d’avant, 0 F',
  [125000, 106501, null, 0], [plafondDuNet(100000), plafondDuNet(85201), plafondDuNet(undefined), plafondDuNet(0)]);
const runPasse = (o: Partial<PayrollRun> & { lines: PayrollLine[] }): PayrollRun => ({ id: 'r', period: '2026-10', status: 'valide', createdAt: '2026-11-01T00:00:00Z', branchId: 'b', ...o });
const ligne = (o: Partial<PayrollLine> & { employeeId: string; net: number }): PayrollLine => ({
  name: o.employeeId.toUpperCase(),
  gains: { base: o.net, heuresSup: 0, prime: 0, pourboires: 0, commission: 0, indemnites: 0 },
  deductions: { avance: 0, autresRetenues: 0 },
  result: { brut: o.net, cnssSalariale: 0, its: 0, retenues: 0, net: o.net, cnssPatronale: 0, coutEmployeur: o.net },
  ...o,
} as PayrollLine);
const ceMois = { id: 'nov', period: '2026-11', branchId: 'b' };
dit('le net du mois d’avant : un run validé ; un brouillon seulement pour une ligne payée ; jamais une autre branche ; le run le plus récent',
  [100000, undefined, 90000, undefined, 120000, undefined],
  [
    netDuMoisDAvant([runPasse({ lines: [ligne({ employeeId: 'a', net: 100000 })] })], ceMois, 'a'),
    netDuMoisDAvant([runPasse({ status: 'brouillon', lines: [ligne({ employeeId: 'a', net: 100000 })] })], ceMois, 'a'),
    netDuMoisDAvant([runPasse({ status: 'brouillon', lines: [ligne({ employeeId: 'a', net: 90000, payeLe: '2026-11-05' })] })], ceMois, 'a'),
    netDuMoisDAvant([runPasse({ branchId: 'autre', lines: [ligne({ employeeId: 'a', net: 100000 })] })], ceMois, 'a'),
    netDuMoisDAvant([
      runPasse({ id: 'r2', createdAt: '2026-11-03T00:00:00Z', lines: [ligne({ employeeId: 'a', net: 120000 })] }),
      runPasse({ id: 'r1', createdAt: '2026-11-01T00:00:00Z', lines: [ligne({ employeeId: 'a', net: 100000 })] }),
    ], ceMois, 'a'),
    netDuMoisDAvant([runPasse({ period: '2026-09', lines: [ligne({ employeeId: 'a', net: 100000 })] })], ceMois, 'a'),
  ]);

/* ── 4. LES FRAIS ── */
dit('frais : vides = à renseigner et rien de retiré ; zéro est un tarif ; un tarif négatif ne se lit pas ; sans voie, rien',
  [{ fraisXof: 0, renseignes: false }, { fraisXof: 100, renseignes: true }, { fraisXof: 0, renseignes: true }, { fraisXof: 0, renseignes: false }, { fraisXof: 0, renseignes: false }],
  [fraisDeLaVoie(undefined, 'MTN'), fraisDeLaVoie({ MTN: 100 }, 'MTN'), fraisDeLaVoie({ MTN: 0 }, 'MTN'), fraisDeLaVoie({ MTN: -5 }, 'MTN'), fraisDeLaVoie({ MTN: 100 }, undefined)]);
const det = detailDuBulletin({
  gains: { base: 175000, prime: 15000 }, deductions: { avance: 10000, retenuePret: 5000 },
  result: { brut: 190000, cnssSalariale: 6840, its: 19000, retenues: 15000, net: 149160 },
}, 'MTN', 150);
dit('le bulletin montre son détail, le net, la ligne « Frais d’envoi MoMo » et ce qui arrive sur le téléphone',
  [['Salaire de base', 'Primes', 'CNSS, part salariale', 'Impôt sur les salaires', 'Avance du mois', 'Remboursement de prêt'], 149160, 150, 149010, 'Frais d’envoi MoMo'],
  [det.lignes.map((x) => x.libelle), det.netXof, det.fraisXof, det.envoyeXof, det.libelleDesFrais]);

/* ── 5. L'ÉTAT DE CHAQUE LIGNE ── */
const MAINTENANT = aCot('2026-12-05T14:00');
const NET = 149160;
const base: LigneDeLaPaie = { employeeId: 'a', name: 'A. K.', result: { brut: 190000, cnssSalariale: 6840, its: 19000, retenues: 15000, net: NET } };
const mmOk: MobileMoney = { numero: '2290190000001', operateur: 'MTN', changeLe: '2026-10-01T00:00:00.000Z' };
const depot = depotDeLaLigne(base.result, 'MTN', { MTN: 150 }, '2026-12-01T07:00:00.000Z', 'Topaze');
const deposee: LigneDeLaPaie = { ...base, depot };
const reponse = (o: Partial<ConfirmationDePaie> = {}): ConfirmationDePaie => ({
  id: idDuBulletin('nov', 'a'), runId: 'nov', period: '2026-11', employeeId: 'a', etat: 'confirme', le: '2026-12-02T08:14:00.000Z', cle: depot.cle, ...o,
});
const lit = (o: Partial<Parameters<typeof litLaLigne>[0]> & { ligne: LigneDeLaPaie }) =>
  litLaLigne({ mobileMoney: mmOk, calendrier: nov, maintenantMs: MAINTENANT, ...o });
const etat = (lu: LectureDeLaLigne) => [lu.etat, lu.attente ?? null, lu.blocages.map((b) => b.code)];

dit('pas encore déposé : à confirmer', ['a-confirmer', 'Bulletin pas encore déposé dans Mon espace.', []], etat(lit({ ligne: base })));
dit('déposé sans réponse : à confirmer', ['a-confirmer', 'Pas encore confirmé dans Mon espace.', []], etat(lit({ ligne: deposee })));
const confirmee = lit({ ligne: deposee, confirmationLue: reponse() });
dit('confirmé pour ce bulletin : confirmée ; le montant envoyé est le net moins les frais du dépôt',
  ['confirmee', null, [], NET - 150, 150, true, false], [...etat(confirmee), confirmee.envoyeXof, confirmee.fraisXof, confirmee.fraisRenseignes, confirmee.enRetard]);
dit('la réponse d’une autre fiche ne compte pas', 'a-confirmer', lit({ ligne: deposee, confirmationLue: reponse({ employeeId: 'z' }) }).etat);
const signalee = lit({ ligne: deposee, confirmationLue: reponse({ etat: 'erreur', mot: 'Il manque ma prime du samedi 14 novembre 2026.' }) });
dit('une erreur signalée, avec son mot', ['erreur', 'Il manque ma prime du samedi 14 novembre 2026.'], [signalee.etat, signalee.confirmation?.mot]);
dit('la dernière réponse fait foi : confirmé, puis erreur signalée', 'erreur',
  lit({ ligne: { ...deposee, confirmation: { etat: 'confirme', le: '2026-12-02T08:00:00.000Z', cle: depot.cle } }, confirmationLue: reponse({ etat: 'erreur', le: '2026-12-03T08:00:00.000Z' }) }).etat);
dit('… et une erreur, puis « je confirme »', 'confirmee',
  lit({ ligne: { ...deposee, confirmation: { etat: 'erreur', le: '2026-12-02T08:00:00.000Z', cle: depot.cle } }, confirmationLue: reponse({ le: '2026-12-03T08:00:00.000Z' }) }).etat);
const corrigee: LigneDeLaPaie = { ...deposee, result: { ...base.result, net: NET + 15000, brut: 205000 } };
dit('corrigé après son dépôt : à déposer à nouveau', ['a-confirmer', 'Bulletin corrigé depuis son dépôt : déposez-le à nouveau dans Mon espace.', []],
  etat(lit({ ligne: corrigee, confirmationLue: reponse() })));
const redeposee: LigneDeLaPaie = { ...corrigee, depot: depotDeLaLigne(corrigee.result, 'MTN', { MTN: 150 }, '2026-12-03T07:00:00.000Z') };
dit('redéposé : la réponse d’avant ne vaut plus, il redemande une confirmation',
  ['a-confirmer', 'Bulletin corrigé après sa réponse : il attend une nouvelle confirmation.', []], etat(lit({ ligne: redeposee, confirmationLue: reponse() })));
dit('confirmée en retard (après midi le jour de paie) : dite, et toujours payable', [true, 'confirmee'],
  [lit({ ligne: deposee, confirmationLue: reponse({ le: '2026-12-05T12:30:00.000Z' }) }).enRetard, lit({ ligne: deposee, confirmationLue: reponse({ le: '2026-12-05T12:30:00.000Z' }) }).etat]);

const validee: LigneDeLaPaie = { ...deposee, validation: { par: 'Yéman', le: '2026-12-05T13:20:00.000Z', cle: depot.cle } };
dit('validée par la direction pour ce bulletin : prête à partir', 'payable', lit({ ligne: validee, confirmationLue: reponse() }).etat);
dit('une validation d’un autre bulletin, ou sans nom, ne vaut rien', ['confirmee', 'confirmee'], [
  lit({ ligne: { ...validee, validation: { par: 'Yéman', le: 'x', cle: 'autre' } }, confirmationLue: reponse() }).etat,
  lit({ ligne: { ...validee, validation: { par: '  ', le: 'x', cle: depot.cle } }, confirmationLue: reponse() }).etat,
]);
dit('payée : la date fait foi, comme au pointage', ['payee', true],
  [lit({ ligne: { ...validee, payeLe: '2026-12-05' }, confirmationLue: reponse({ etat: 'erreur' }) }).etat, ligneEstPayee({ payeLe: '2026-12-05' })]);

const bloque = (o: Partial<Parameters<typeof litLaLigne>[0]>) => etat(lit({ ligne: validee, confirmationLue: reponse(), ...o }));
dit('numéro changé depuis moins de 7 jours : bloquée, même validée', ['bloquee', null, ['numero-recent']],
  bloque({ mobileMoney: { ...mmOk, changeLe: '2026-12-01T09:00:00.000Z' } }));
dit('… revalidé par la direction : elle repart', ['payable', null, []],
  bloque({ mobileMoney: { ...mmOk, changeLe: '2026-12-01T09:00:00.000Z', revalideLe: '2026-12-05T10:00:00.000Z', revalidePar: 'Brice' } }));
dit('aucun numéro, ou un numéro illisible : bloquée', [['bloquee', null, ['sans-numero']], ['bloquee', null, ['numero-illisible']]],
  [bloque({ mobileMoney: undefined }), bloque({ mobileMoney: { ...mmOk, numero: '22990000001' } })]);
dit('l’opérateur a changé depuis le dépôt : bloquée, à redéposer', ['bloquee', null, ['voie-changee']],
  bloque({ mobileMoney: { ...mmOk, operateur: 'Moov' } }));
dit('au-dessus du net du mois d’avant plus 25 % : bloquée ; au plafond pile, libre ; sans mois d’avant, libre',
  [['bloquee', null, ['plafond']], ['payable', null, []], ['payable', null, []]],
  [bloque({ netAvantXof: 119327 }), bloque({ netAvantXof: 119328 }), bloque({ netAvantXof: undefined })]);
dit('l’accord de la direction lève le plafond pour CE net seulement',
  [['payable', null, []], ['bloquee', null, ['plafond']]],
  [
    etat(lit({ ligne: { ...validee, accordPlafond: { par: 'Yéman', le: 'x', netXof: NET } }, confirmationLue: reponse(), netAvantXof: 100000 })),
    etat(lit({ ligne: { ...validee, accordPlafond: { par: 'Yéman', le: 'x', netXof: NET - 1 } }, confirmationLue: reponse(), netAvantXof: 100000 })),
  ]);
const plafondLu = lit({ ligne: validee, confirmationLue: reponse(), netAvantXof: 100000 });
dit('le plafond se dit : le net, le plafond, le mois d’avant', 'Net de 149160 F, au-dessus du plafond de 125000 F (le net du mois d’avant, 100000 F, plus 25 %) : il attend l’accord de la direction.',
  phraseDuBlocage(plafondLu.blocages[0], F));
dit('des frais qui atteignent le net, un net nul : bloquée', [['bloquee', null, ['frais-au-dela']], ['bloquee', null, ['net-nul']]], [
  etat(lit({ ligne: { ...base, prestataire: true, result: { net: 100 } }, parFacture: true, fraisParEnvoi: { MTN: 100 } })),
  etat(lit({ ligne: { ...base, prestataire: true, result: { net: 0 } }, parFacture: true })),
]);
dit('une prestataire : sa facture acceptée tient lieu de confirmation, sans dépôt ; les frais réglés du jour s’appliquent',
  [['a-confirmer', 'Sa facture du mois n’est pas encore acceptée.', []], ['confirmee', null, []], NET - 100],
  [etat(lit({ ligne: { ...base, prestataire: true }, parFacture: false })), etat(lit({ ligne: { ...base, prestataire: true }, parFacture: true, fraisParEnvoi: { MTN: 100 } })),
    lit({ ligne: { ...base, prestataire: true }, parFacture: true, fraisParEnvoi: { MTN: 100 } }).envoyeXof]);
dit('la clé résume le net, ce qui le compose, la voie et les frais', `${NET}|190000|6840|19000|15000|MTN|150`, cleDuBulletin(base.result, 'MTN', 150));

/* ── 6. VALIDER ── */
const l2: LigneDeLaPaie = { ...deposee, employeeId: 'b', name: 'R. D.' };
const l3: LigneDeLaPaie = { ...deposee, employeeId: 'c', name: 'M. A.' };
const lu1 = lit({ ligne: deposee, confirmationLue: reponse() });
const lu2 = lit({ ligne: l2 });
const lu3 = lit({ ligne: l3, confirmationLue: reponse({ employeeId: 'c', id: idDuBulletin('nov', 'c') }), mobileMoney: undefined });
const lectures = new Map([['a', lu1], ['b', lu2], ['c', lu3]]);
const v = valideLesLignes([deposee, l2, l3], lectures, 'Yéman', '2026-12-05T13:20:00.000Z');
dit('« Valider et programmer » ne valide que les confirmées que rien n’arrête, et dit qui et quand',
  [['a'], { par: 'Yéman', le: '2026-12-05T13:20:00.000Z', cle: depot.cle }, 'confirme', undefined, undefined],
  [v.validees, v.lignes[0].validation, v.lignes[0].confirmation?.etat, v.lignes[1].validation, v.lignes[2].validation]);
dit('… la ligne validée devient prête à partir', 'payable', lit({ ligne: v.lignes[0] }).etat);
dit('sans nom, rien ne se valide', [[], true], [valideLesLignes([deposee], lectures, '  ', 'x').validees, !!valideLesLignes([deposee], lectures, '', 'x').erreur]);

/* ── 7. LE FICHIER MTN ── */
const deux = fichierMtn([
  { employeeId: 'a', nom: 'Aïcha Dɔssou', msisdn: '2290190000001', montantXof: 84900 },
  { employeeId: 'b', nom: 'Jean-Marc, K.', msisdn: '2290190000002', montantXof: 60000 },
]);
dit('le fichier au format exact de ses essais : HDR,Salary, le nombre, le total, puis une ligne par personne, CRLF, rien après',
  'HDR,Salary,2,144900\r\n1,MSISDN,2290190000001,84900,Aicha Dossou\r\n2,MSISDN,2290190000002,60000,Jean-Marc K\r\n', deux.csv);
dit('… sans marque d’ordre des octets, sans saut de ligne nu, sans ligne vide à la fin',
  [false, false, false, 2, 144900], [deux.csv?.charCodeAt(0) === 0xfeff, (deux.csv ?? '').replace(/\r\n/g, '').includes('\n'), (deux.csv ?? '').endsWith('\r\n\r\n'), deux.nombre, deux.totalXof]);
dit('le nom pour le portail : sans accent, sans virgule ; les lettres fon en latin proche', ['Yeman', 'Nyo Dekpe', 'Sans nom'], [nomPourMtn('Yéman'), nomPourMtn('Nyɔ Dɛkpɛ'), nomPourMtn(',,')]);
const refus = (l: Parameters<typeof fichierMtn>[0]) => fichierMtn(l).erreur ?? null;
const r1 = { employeeId: 'a', nom: 'A', msisdn: '2290190000001', montantXof: 1000 };
dit('le fichier refuse : rien à payer, une personne deux fois, un numéro faux, un montant faux',
  ['Aucune ligne MTN validée à payer.', 'A figure deux fois : une ligne ne se paie qu’une fois.', true, true, true],
  [refus([]), refus([r1, { ...r1 }]), !!refus([{ ...r1, msisdn: '22990000001' }]), !!refus([{ ...r1, montantXof: 0 }]), !!refus([{ ...r1, montantXof: 10.5 }])]);
const depotMoov = depotDeLaLigne(base.result, 'Moov', { MTN: 150 }, '2026-12-01T07:00:00.000Z');
const lMoov: LigneDeLaPaie = { ...base, employeeId: 'm', name: 'Moov', depot: depotMoov, validation: { par: 'Yéman', le: 'x', cle: depotMoov.cle } };
const lPayee: LigneDeLaPaie = { ...validee, employeeId: 'p', name: 'Payée', payeLe: '2026-12-05' };
const lues = [
  { ligne: validee, lecture: lit({ ligne: validee, confirmationLue: reponse() }) },
  { ligne: deposee, lecture: lit({ ligne: deposee, confirmationLue: reponse() }) },
  { ligne: lMoov, lecture: lit({ ligne: lMoov, confirmationLue: reponse({ employeeId: 'm', cle: depotMoov.cle }), mobileMoney: { ...mmOk, operateur: 'Moov' } }) },
  { ligne: lPayee, lecture: lit({ ligne: lPayee }) },
  { ligne: { ...validee, employeeId: 'r' }, lecture: lit({ ligne: { ...validee, employeeId: 'r' }, confirmationLue: reponse({ employeeId: 'r' }), mobileMoney: { ...mmOk, changeLe: '2026-12-04T00:00:00.000Z' } }) },
  { ligne: l2, lecture: lit({ ligne: l2 }) },
];
dit('le fichier ne prend que les lignes MTN validées, ni Moov, ni confirmées sans validation, ni payées, ni bloquées ; montant = net − frais',
  [{ employeeId: 'a', nom: 'A. K.', msisdn: '2290190000001', montantXof: NET - 150 }], lignesDuFichierMtn(lues));

/* ── 8. « C'EST ENVOYÉ » ── */
dit('le numéro de lot : obligatoire, lisible, jamais deux fois (sans égard à la casse)',
  [true, true, true, true, null],
  [/obligatoire/.test(pourquoiPasLeLot('  ', []) ?? ''), /ne se lit pas/.test(pourquoiPasLeLot('ab', []) ?? ''), /ne se lit pas/.test(pourquoiPasLeLot('BT 12', []) ?? ''),
    /déjà noté/.test(pourquoiPasLeLot('bt-2026-0001', ['BT-2026-0001']) ?? ''), pourquoiPasLeLot('BT-2026-0002', ['BT-2026-0001'])]);
dit('les lots notés se lisent sur tous les runs', ['L1', 'L2'], lotsDejaNotes([{ paieDu5: { lotsMtn: [{ batch: 'L1', le: '', par: '', employeeIds: [], totalXof: 0 }] } }, {}, { paieDu5: { lotsMtn: [{ batch: 'L2', le: '', par: '', employeeIds: [], totalXof: 0 }] } }]));
const fichier: FichierMtnPrepare = { le: 'x', par: 'Yéman', totalXof: NET - 150 + 1000, lignes: [{ employeeId: 'a', nom: 'A. K.', msisdn: '2290190000001', montantXof: NET - 150 }, { employeeId: 'p', nom: 'Payée', msisdn: '2290190000003', montantXof: 1000 }, { employeeId: 'x', nom: 'Absente', msisdn: '2290190000004', montantXof: 1 }] };
const envoi = appliqueLeLot([validee, lPayee, l2], fichier, ' LOT-778 ', '2026-12-05');
dit('« C’est envoyé » : la ligne du fichier passe à payé ce jour, par MTN, avec son lot, ses frais et ce qui est parti',
  [['a'], ['p'], ['x'], '2026-12-05', 'MTN', 'LOT-778', NET - 150, 150],
  [envoi.payees, envoi.dejaPayees, envoi.absentes, envoi.lignes[0].payeLe, envoi.lignes[0].payeMoyen, envoi.lignes[0].lotMtn, envoi.lignes[0].envoyeXof, envoi.lignes[0].fraisEnvoiXof]);
dit('… une ligne déjà payée ne se repaie pas, une ligne hors du fichier ne bouge pas', [true, true], [envoi.lignes[1] === lPayee, envoi.lignes[2] === l2]);
const encore = appliqueLeLot(envoi.lignes, fichier, 'LOT-779', '2026-12-06');
dit('le même fichier noté deux fois ne paie personne deux fois', [[], ['a', 'p'], '2026-12-05', 'LOT-778'],
  [encore.payees, encore.dejaPayees, encore.lignes[0].payeLe, encore.lignes[0].lotMtn]);
const runAvant = { lines: [ligne({ employeeId: 'a', net: NET }), ligne({ employeeId: 'b', net: 50000 })] } as PayrollRun;
const runApres = { lines: appliqueLeLot(runAvant.lines, fichier, 'LOT-1', '2026-12-05').lignes } as PayrollRun;
dit('le reste à verser du pointage le voit : il baisse du net de la ligne payée', [NET + 50000, 50000], [resteAVerserXof(runAvant), resteAVerserXof(runApres)]);

/* ── 9. LES TOTAUX ── */
const t = totauxParVoie(lues.map((x) => x.lecture));
const rs = resumeDeLaPaie(lues.map((x) => x.lecture));
dit('les totaux par voie : ce qui partira (confirmées et validées), frais retirés',
  [{ nombre: 2, netXof: 2 * NET, fraisXof: 300, envoyeXof: 2 * NET - 300 }, { nombre: 1, netXof: NET, fraisXof: 0, envoyeXof: NET }, { nombre: 0, netXof: 0, fraisXof: 0, envoyeXof: 0 }],
  [t.MTN, t.Moov, t['sans-voie']]);
dit('le résumé : confirmées, à envoyer, en attente (bloquées comprises), payées',
  { confirmees: 3, aEnvoyerXof: 2 * (NET - 150) + NET, enAttente: 2, aValider: 1, payables: 2, payees: 1 }, rs);
dit('une ligne Moov validée est prête, ses frais à renseigner ne retirent rien', ['payable', 'Moov', 0, false], [lues[2].lecture.etat, lues[2].lecture.voie, lues[2].lecture.fraisXof, lues[2].lecture.fraisRenseignes]);

/* ── 10. LE DÉPÔT DANS MON ESPACE (les magasins) ── */
const fiches = [
  { id: 'a', branchId: 'b', name: 'A. K.', mobileMoney: mmOk },
  { id: 'b', branchId: 'b', name: 'R. D.', mobileMoney: { ...mmOk, operateur: 'Moov' } },
] as StaffMember[];
const runDuMois: PayrollRun = {
  id: 'nov', period: '2026-11', status: 'brouillon', createdAt: '2026-12-01T00:00:00Z', branchId: 'b',
  lines: [ligne({ employeeId: 'a', net: NET }), ligne({ employeeId: 'b', net: 60000 }), ligne({ employeeId: 'c', net: 70000, prestataire: true }), ligne({ employeeId: 'd', net: 5000, payeLe: '2026-12-02' })],
};
payrollRunsStore.set([runDuMois]);
bulletinsStore.set([]);
const lien = () => ({ nom: 'x', periode: '2026-11', base: 1 });
const n1 = deposeDansMonEspace({ runId: 'nov', bulletinFor: lien, fraisParEnvoi: { MTN: 150 }, fiches, branchId: 'b', par: 'Yéman' });
const apres1 = payrollRunsStore.get()[0];
const b1 = bulletinsStore.get();
dit('déposer : chaque salarié pas encore payé, jamais une prestataire ni une ligne payée', [2, ['nov:a', 'nov:b']], [n1, b1.map((x) => x.id).sort()]);
dit('… le bulletin déposé porte le détail, les frais de SA voie, le montant envoyé, et les heures du mois ; il n’est pas « publié »',
  [NET, 150, NET - 150, 'Frais d’envoi MoMo', '2026-12-05T12:00', '2026-12-05T18:00', '', 0, 'Frais d’envoi Moov Money'],
  [b1.find((x) => x.id === 'nov:a')?.depot?.netXof, b1.find((x) => x.id === 'nov:a')?.depot?.fraisXof, b1.find((x) => x.id === 'nov:a')?.depot?.envoyeXof,
    b1.find((x) => x.id === 'nov:a')?.depot?.libelleDesFrais, b1.find((x) => x.id === 'nov:a')?.depot?.confirmerAvant, b1.find((x) => x.id === 'nov:a')?.depot?.paieLe,
    b1.find((x) => x.id === 'nov:a')?.publieLe, b1.find((x) => x.id === 'nov:b')?.depot?.fraisXof, b1.find((x) => x.id === 'nov:b')?.depot?.libelleDesFrais]);
dit('… et la ligne garde son dépôt, à la même clé que le bulletin', [true, 'MTN'],
  [apres1.lines[0].depot?.cle === b1.find((x) => x.id === 'nov:a')?.depot?.cle, apres1.lines[0].depot?.voie]);
dit('redéposer sans rien changer ne touche à rien (la confirmation tient)', 0,
  deposeDansMonEspace({ runId: 'nov', bulletinFor: lien, fraisParEnvoi: { MTN: 150 }, fiches, branchId: 'b' }));
payrollRunsStore.set((prev) => prev.map((r) => ({ ...r, paieDu5: { fichierMtn: { le: 'x', par: 'Y', totalXof: 1, lignes: [{ employeeId: 'a', nom: 'A', msisdn: '2290190000001', montantXof: 1 }] } } })));
dit('une ligne du fichier MTN en attente de son lot ne se redépose pas, même forcée', [true, 0],
  [dansLeFichierEnAttente(payrollRunsStore.get()[0], 'a'), deposeDansMonEspace({ runId: 'nov', bulletinFor: lien, fraisParEnvoi: { MTN: 999 }, fiches, branchId: 'b', employeeIds: ['a'], force: true })]);

/* ── 11. CE QUE L'ÉCRAN ET LA BASE EN FONT ── */
const paie = sansCommentaires('src/apps/trone/routes/equipe/Paie.tsx');
const bloc = sansCommentaires('src/apps/trone/routes/equipe/PaieDu5.tsx');
const ecrit = sansCommentaires('src/apps/trone/routes/equipe/paie-du-5.ts');
const espace = sansCommentaires('src/apps/trone/routes/equipe/rh/MonEspace.tsx');
const perso = sansCommentaires('src/apps/trone/routes/equipe/Personnel.tsx');
const pur = sansCommentaires('src/shared/paie-du-5-pur.ts');
dit('le bloc « La paie du 5 » est dans la fiche du run ; une ligne payée ou dans le fichier MTN ne se modifie plus', [true, true], [
  paie.includes('<PaieDu5 run={run} bulletinFor={bulletinFor} />'),
  paie.includes("{editable && !ligneEstPayee(l) && !dansLeFichierEnAttente(run, l.employeeId) && <button className=\"tre-link-btn\" onClick={() => setEditLine(i)}>Modifier</button>}"),
]);
dit('une ligne corrigée repart dans Mon espace ; le bulletin publié garde son dépôt ; une ligne payée ne se recalcule pas', [true, true, true], [
  /if \(lines\[i\]\?\.depot\) \{\s+deposeDansMonEspace\(\{/.test(paie),
  paie.includes('...(anciens.get(`${run.id}:${l.employeeId}`) ?? {}),'),
  /\? lines\.map\(\(l\) => \{\s+if \(ligneEstPayee\(l\)\) return l;/.test(paie),
]);
dit('« C’est envoyé » ne se touche qu’avec un numéro de lot, relu avant d’écrire', [true, true, true], [
  bloc.includes('disabled={fige || !lot.trim()} onClick={() => void cEstEnvoye()}>C’est envoyé</Button>'),
  bloc.includes('const refus = pourquoiPasLeLot(b, lotsDejaNotes(runs));\n    if (refus) { setErreurLot(refus); return; }'),
  bloc.includes('const r = appliqueLeLot(asArray<PayrollLine>(courant.lines), fichier, b, jour);'),
]);
dit('le fichier MTN se télécharge tel quel (aucune marque d’octets) et seulement des lignes validées', [true, false, true], [
  bloc.includes("new Blob([f.csv], { type: 'text/csv' })"), /\\uFEFF|﻿/.test(bloc), bloc.includes('const fichierPossible = lignesDuFichierMtn(lues);'),
]);
dit('« Valider et programmer » passe par la confirmation de la page et dit qui', [true, true], [
  bloc.includes("accepter: 'Valider et programmer',"), bloc.includes('const r = valideLesLignes(asArray<PayrollLine>(courant.lines), lectures, qui, le);'),
]);
dit('le dépôt saute une prestataire, une ligne payée et une ligne du fichier en attente', true,
  ecrit.includes('if (l.prestataire || ligneEstPayee(l) || dansLeFichierEnAttente(run, l.employeeId)) return l;'));
dit('Mon espace : « Mon bulletin », les deux gestes, la réponse écrite par elle ; « Mes bulletins » ne liste que les publiés', [true, true, true, true, true], [
  espace.includes('Mon bulletin {duMois(b.period)}'), espace.includes('>Je confirme mon bulletin</Button>'), espace.includes('>Je signale une erreur</Button>'),
  espace.includes('repondsAuBulletin({'), espace.includes('b.employeeId === moi.id && !!b.publieLe)'),
]);
dit('rien ne part sur WhatsApp, ni de Mon espace ni du bloc', [false, false, false],
  [/envoieSurWhatsApp|whatsapp/i.test(espace), /envoieSurWhatsApp|whatsapp/i.test(bloc), /envoieSurWhatsApp|whatsapp/i.test(ecrit)]);
dit('la fiche : le numéro mobile money, son opérateur, le groupe ; lu avant d’être gardé', [true, true, true, true], [
  perso.includes('<Field label="Numéro mobile money (paie)">'), perso.includes('<option value="Moov">Moov, par FedaPay</option>'),
  perso.includes('<Field label="Groupe de paie">'), perso.includes("if (mm.erreur) { toast(`Numéro mobile money : ${mm.erreur}`); return; }"),
]);
const sansTiret = (t: string) => [...t.matchAll(/(['"`>])[^'"`<>\n]*—[^'"`<>\n]*/g)].map((m) => m[0].slice(0, 50));
dit('aucun « — » dans ce qu’on lit à l’écran, ni « salon »', [[], [], [], false, false],
  [sansTiret(bloc), sansTiret(pur), sansTiret(espace.slice(espace.indexOf('function MonBulletinDuMois'))), /salon/i.test(bloc), /salon/i.test(pur)]);

const sql = lis('supabase/migrations/0161_la_paie_du_5.sql');
const derniere = readdirSync('supabase/migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
  .map((f) => lis(`supabase/migrations/${f}`)).filter((x) => /function public\.champs_du_dossier\(\)/.test(x)).at(-1) ?? '';
const champsSql = /champs_du_dossier\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/.exec(derniere)?.[1]?.match(/'([^']+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
dit('le numéro est privé, dans le Trône et dans la base (0161), et les deux listes sont les mêmes', [true, true, true],
  [(CHAMPS_DU_DOSSIER as readonly string[]).includes('mobileMoney'), champsSql.includes('mobileMoney'), JSON.stringify([...CHAMPS_DU_DOSSIER].sort()) === JSON.stringify([...champsSql].sort())]);
dit('les réponses : chacune lit et écrit la sienne, pour son bulletin ; le souverain seul efface', [true, true, true, true], [
  sql.includes("create policy paie_confirmations_lire on public.paie_confirmations for select to authenticated\n  using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'));"),
  sql.includes("or (public.est_ma_fiche(data ->> 'employeeId') and public.reponse_de_paie_valable(id, data)));\ndrop policy if exists paie_confirmations_modifier"),
  sql.includes("and p_id = coalesce(p_data ->> 'runId', '') || ':' || coalesce(p_data ->> 'employeeId', '')"),
  sql.includes("for delete to authenticated\n  using (public.is_souverain());"),
]);
dit('le poste oublie les réponses à la déconnexion ; elles se lisent de la table', [true, true], [
  sansCommentaires('src/shared/auth.ts').includes("'mnd_paie_confirmations',"),
  sansCommentaires('src/shared/rh.ts').includes("bindCollection(confirmationsDePaieStore, 'paie_confirmations');"),
]);
const maquette = lis('public/maquette-la-paie-du-5.html');
const touches = [bloc, ecrit, pur, espace, perso, paie, maquette, sql].join('\n');
dit('le personnel de la maison familiale n’entre jamais au Trône', [false, false, false],
  [/Entretien et cuisine/i.test(touches), /cuisini[èe]re/i.test(touches), /maison familiale/i.test(touches)]);
dit('la maquette est copiée, marquée construite (lot 1)', [true, true], [maquette.includes('Construite au Trône, lot 1'), maquette.includes('<title>La paie du 5</title>')]);

/* ── LES POURBOIRES PARTENT EN ESPÈCES (6 novembre 2026, maquette Les paiements, choix 1) ── */
{
  const mmMtn: MobileMoney = { numero: '2290190000001', operateur: 'MTN', changeLe: '2026-01-01T00:00:00Z' };
  const avecPb = ligne({ employeeId: 'pb', net: 100000, gains: { base: 95000, heuresSup: 0, prime: 0, pourboires: 5000, commission: 0, indemnites: 0 } });
  const lu = litLaLigne({ ligne: avecPb, mobileMoney: mmMtn, fraisParEnvoi: { MTN: 100 }, maintenantMs: Date.parse('2026-12-02T10:00:00Z') });
  dit('les pourboires restent au net mais ne partent pas par MTN : net moins frais moins pourboires', [100000, 5000, 94900], [lu.netXof, lu.especesXof, lu.envoyeXof]);
  const det = detailDuBulletin(avecPb, 'MTN', 100);
  dit('le bulletin dit les pourboires en gain, puis remis en especes, et le montant envoye', [true, 5000, 94900],
    [det.lignes.some((x) => x.libelle === 'Pourboires' && x.montantXof === 5000 && !x.retenue), det.especesXof, det.envoyeXof]);
  const presta = ligne({ employeeId: 'pr', net: 60000, prestataire: true, gains: { base: 60000, heuresSup: 0, prime: 0, pourboires: 3000, commission: 0, indemnites: 0 } });
  dit('une prestataire n a pas de pourboires en especes', [0, 60000], [detailDuBulletin(presta, 'MTN', 0).especesXof, detailDuBulletin(presta, 'MTN', 0).envoyeXof]);
  const tout = ligne({ employeeId: 'tt', net: 4000, gains: { base: 0, heuresSup: 0, prime: 0, pourboires: 6000, commission: 0, indemnites: 0 } });
  dit('jamais un montant envoye sous zero', [4000, 0], [detailDuBulletin(tout, 'MTN', 0).especesXof, detailDuBulletin(tout, 'MTN', 0).envoyeXof]);
  const fichierPb: FichierMtnPrepare = { le: '2026-12-05T17:00:00Z', par: 'Y.', totalXof: 94900, lignes: [{ employeeId: 'pb', nom: 'PB', msisdn: '2290190000001', montantXof: 94900 }] };
  const lotPb = appliqueLeLot([avecPb], fichierPb, 'LOT-PB', '2026-12-05');
  dit('au lot du portail, les pourboires en especes ne comptent pas comme des frais', [94900, 100], [lotPb.lignes[0].envoyeXof, lotPb.lignes[0].fraisEnvoiXof]);
  const espace = readFileSync('src/apps/trone/routes/equipe/rh/MonEspace.tsx', 'utf8');
  const depose = readFileSync('src/apps/trone/routes/equipe/paie-du-5.ts', 'utf8');
  dit('Mon espace dit les pourboires remis en especes ; le depot les porte', [true, true],
    [/\{\(d\.especesXof \?\? 0\) > 0 && <div><span>\{LIBELLE_DES_ESPECES\}<\/span>/.test(espace), /\.\.\.\(det\.especesXof > 0 \? \{ especesXof: det\.especesXof \} : \{\}\),/.test(depose)]);
}

console.log(ko === 0 ? '\nLa paie du 5 tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
