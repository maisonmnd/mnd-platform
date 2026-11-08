/* LES PAIEMENTS, LA RÈGLE ÉPROUVÉE · 5 novembre 2026.
   Lancé par `node scripts/verifie-les-paiements.mjs` (et `--prouve`).
   Maquette maquette-les-paiements.html (v5), « construis ». Les personnes
   sont dites par leurs initiales ; les numéros et les montants sont inventés
   pour le banc. */
import { readFileSync } from 'node:fs';
import {
  CATEGORIE_DES_ENTREPRISES, arretDeLEntreprise, chiffresDuMois, dateDePaie, departDeLaLigne, depenseDeLEntreprise, echeancierDuPret,
  etatDuNumero, factureDuMois, itemDeLaLigne, itemsDuTest, jourLu, ligneADate, ligneDeLEquipe, lignesDuTest, periodeParDefaut,
  peutAnnuler, peutPrendre, pointsARegarder, pontTenu, pourboiresDuMois, pourquoiPasLeTest, seRelanceA500, seValideAPart, testReussi,
  totalDuTest, validationDe, entreprisesDuCarnet,
  type FactureDEntreprise, type LigneDuMois, type ValidationADate,
} from '../src/shared/les-paiements-pur';
import { calendrierDeLaPaie, type LectureDeLaLigne } from '../src/shared/paie-du-5-pur';
import { bilanDeLEssai, type EnvoiMtn, type LectureMtn } from '../src/shared/paie-par-mtn-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* ── 1. La date de chacun ── */
const d10 = dateDePaie('2026-11', 10);
dit('novembre, le 10 : jeudi 10 decembre a 18 h de Cotonou (17 h UTC)', ['2026-12-10', '2026-12-10T17:00:00.000Z', false, false],
  [d10?.jour, d10?.partA, d10?.decaleAuLundi, d10?.avantLe5]);
const dim = dateDePaie('2026-12', 10);
dit('decembre, le 10 : le dimanche 10 janvier 2027 passe au lundi 11', ['2027-01-11', true, '2027-01-11T17:00:00.000Z'], [dim?.jour, dim?.decaleAuLundi, dim?.partA]);
dit('le dernier jour : jeudi 31 decembre', ['2026-12-31', false], [dateDePaie('2026-11', 'dernier')?.jour, dateDePaie('2026-11', 'dernier')?.decaleAuLundi]);
dit('le dernier jour un dimanche (31 janvier 2027) : le lundi 1er fevrier', ['2027-02-01', true], [dateDePaie('2026-12', 'dernier')?.jour, dateDePaie('2026-12', 'dernier')?.decaleAuLundi]);
dit('fevrier bissextile : le dernier jour est le 29', '2028-02-29', dateDePaie('2028-01', 'dernier')?.jour);
dit('fevrier ordinaire : le dernier jour est le 28 (ici un dimanche, donc le lundi 1er mars)', '2027-03-01', dateDePaie('2027-01', 'dernier')?.jour);
dit('avant le 5 : le 1er au 4 seulement', [true, true, false, false, false],
  [dateDePaie('2026-11', 1)?.avantLe5, dateDePaie('2026-11', 4)?.avantLe5, dateDePaie('2026-11', 5)?.avantLe5, dateDePaie('2026-11', 28)?.avantLe5, dateDePaie('2026-11', 'dernier')?.avantLe5]);
dit('un jour lu : 1 a 28 ou dernier, sinon le 10', [10, 'dernier', 10, 28, 1], [jourLu('29'), jourLu('dernier'), jourLu(0), jourLu('28'), jourLu(1)]);
dit('une periode illisible ne donne pas de date', null, dateDePaie('2026-13', 10));

const cal = calendrierDeLaPaie('2026-11'); /* paie le samedi 5 decembre 2026 a 18 h */
const ms = (iso: string) => Date.parse(iso);
dit('le toucher s annule jusqu a 17 h 59 le 5, plus a 18 h', [true, false, false],
  [peutAnnuler(cal?.paie.ms, ms('2026-12-05T16:59:30Z')), peutAnnuler(cal?.paie.ms, ms('2026-12-05T17:00:00Z')), peutAnnuler(undefined, 0)]);
dit('l ecran s ouvre sur le mois qu on paie : le mois d avant (Cotonou)', ['2026-11', '2026-12', '2026-11'],
  [periodeParDefaut(ms('2026-12-03T10:00:00Z')), periodeParDefaut(ms('2027-01-02T10:00:00Z')), periodeParDefaut(ms('2026-11-30T23:30:00Z'))]);

/* ── 2. Les lignes ── */
const lu = (o: Partial<LectureDeLaLigne> = {}): LectureDeLaLigne => ({
  etat: 'confirmee', blocages: [], voie: 'MTN', msisdn: '2290190000001', netXof: 0, fraisXof: 0, fraisRenseignes: true,
  envoyeXof: 0, especesXof: 0, cle: 'k', depotAJour: true, enRetard: false, plafond: null, numero: null, ...o,
});
const env = (o: Partial<EnvoiMtn>): EnvoiMtn => ({
  reference: '00000000-0000-4000-8000-000000000001', genre: 'paie', run_id: 'run-11', periode: '2026-11', essai_id: null,
  employee_id: 'e1', nom: 'A. K.', msisdn: '2290190000001', montant_xof: 1000, etat: 'programme',
  part_a: '2026-12-05T17:00:00.000Z', programme_par: 'Y. B.', programme_le: '2026-12-05T13:00:00.000Z', ...o,
});
const verifie = { etat: 'verifie' as const, nomMtn: 'KOSSOU A' };
const TIPS = [
  /* 8 nov. 2026 : la periode '2026-11' va du 6 nov. au 4 dec. (payee le 5 dec.). */
  { staffId: 'e1', amountXof: 1500, date: '2026-12-04' },
  { staffId: 'e1', amountXof: 1000, date: '2026-11-21' },
  { staffId: 'e1', amountXof: 9000, date: '2026-10-30' },
  { staffId: 'e1', amountXof: 700, date: '2026-11-05' },
  { staffId: 'e1', amountXof: 400, date: '2026-12-06' },
  { staffId: 'e2', amountXof: 1250, date: '2026-11-12' },
];
dit('les pourboires de la periode d une personne : du 6 nov. au 4 dec. seulement', [2500, 1250, 0],
  [pourboiresDuMois(TIPS, 'e1', '2026-11'), pourboiresDuMois(TIPS, 'e2', '2026-11'), pourboiresDuMois(TIPS, 'e3', '2026-11')]);

/* A. K. : net 87 500, dont 2 500 de pourboires dans le bulletin ; ni pret, ni frais. La lecture
   de la paie du 5 les retire DEJA du montant envoye (especesXof, e6) : 85 000 envoyes. */
const a = ligneDeLEquipe({
  employeeId: 'e1', nom: 'A. K.', runId: 'run-11', lecture: lu({ envoyeXof: 85000, netXof: 87500, especesXof: 2500 }),
  ligne: { result: { net: 87500 }, gains: { pourboires: 2500 }, deductions: {} }, pourboiresDuMoisXof: pourboiresDuMois(TIPS, 'e1', '2026-11'),
  numero: verifie, envois: [],
});
dit('les pourboires ne partent pas par MTN : le virement retire ceux du bulletin, les especes disent ceux du mois', [85000, 2500, 85000, 'confirme', true],
  [a.parMtnXof, a.pourboiresXof, a.netXof, a.etat, a.aValider]);
/* N. M. : net 50 000 apres un pret de 30 000 retenu ; attend sa confirmation. */
const b = ligneDeLEquipe({
  employeeId: 'e2', nom: 'N. M.', runId: 'run-11', lecture: lu({ etat: 'a-confirmer', attente: 'Pas encore confirmé dans Mon espace.', envoyeXof: 50000, netXof: 50000, msisdn: '2290190000002' }),
  ligne: { result: { net: 50000 }, gains: {}, deductions: { retenuePret: 30000 } }, pourboiresDuMoisXof: 1250, numero: verifie, envois: [],
});
dit('le pret est retire du net : net 80 000, pret 30 000, par MTN 50 000 ; attend sa confirmation', [80000, 30000, 50000, 'attend', false],
  [b.netXof, b.pretXof, b.parMtnXof, b.etat, b.aValider]);
/* R. D. : Moov, hors MTN. */
const r = ligneDeLEquipe({
  employeeId: 'e3', nom: 'R. D.', runId: 'run-11', lecture: lu({ voie: 'Moov', msisdn: '2290190000003', envoyeXof: 40000, netXof: 40000 }),
  ligne: { result: { net: 40000 }, gains: {}, deductions: {} }, pourboiresDuMoisXof: 0, numero: { etat: 'autre-voie' }, envois: [],
});
dit('Moov : hors du virement MTN, dit a part', [false, 0, 'Moov, à la main'], [r.viaMtn, r.parMtnXof, r.pourquoi]);
dit('sans run : la ligne ne part pas, les pourboires restent', ['ne-part-pas', false, 700],
  (() => { const x = ligneDeLEquipe({ employeeId: 'e9', nom: 'Z. Z.', runId: '', pourboiresDuMoisXof: 700, numero: { etat: 'sans' }, envois: [] }); return [x.etat, x.viaMtn, x.pourboiresXof]; })());

/* L'état par l'envoi du registre. */
const avecEnvoi = (envois: EnvoiMtn[], lecture = lu({ etat: 'payable', envoyeXof: 85000, netXof: 87500, especesXof: 2500 })) => ligneDeLEquipe({
  employeeId: 'e1', nom: 'A. K.', runId: 'run-11', lecture, ligne: { result: { net: 87500 }, gains: { pourboires: 2500 }, deductions: {} },
  pourboiresDuMoisXof: 2500, numero: verifie, envois,
}).etat;
dit('l envoi dit l etat : valide sans envoi, programme, envoi, recu, refuse, refuse puis reprogramme', ['valide', 'programme', 'envoi', 'paye', 'refuse', 'programme'], [
  avecEnvoi([]), avecEnvoi([env({ etat: 'programme' })]), avecEnvoi([env({ etat: 'sans-reponse' })]), avecEnvoi([env({ etat: 'recu' })]),
  avecEnvoi([env({ etat: 'refuse', raison: 'PAYEE_NOT_FOUND' })]),
  avecEnvoi([env({ etat: 'refuse' }), env({ reference: '00000000-0000-4000-8000-000000000002', etat: 'programme', programme_le: '2026-12-05T14:00:00.000Z' })]),
]);
dit('une validee sans envoi reste a programmer', [true, false], [
  ligneDeLEquipe({ employeeId: 'e1', nom: 'A. K.', runId: 'run-11', lecture: lu({ etat: 'payable', envoyeXof: 1000 }), ligne: { result: { net: 1000 } }, pourboiresDuMoisXof: 0, numero: verifie, envois: [] }).aProgrammer,
  ligneDeLEquipe({ employeeId: 'e1', nom: 'A. K.', runId: 'run-11', lecture: lu({ etat: 'payable', envoyeXof: 1000 }), ligne: { result: { net: 1000 } }, pourboiresDuMoisXof: 0, numero: verifie, envois: [env({ montant_xof: 1000 })] }).aProgrammer,
]);

/* Prestataires et entreprises, a leur date. */
const presta = (o: Partial<Parameters<typeof ligneADate>[0]> = {}) => ligneADate({
  genre: 'prestataire', id: 'pj', nom: 'J. J.', periode: '2026-11', montantXof: 20000, msisdn: '2290190000011',
  numero: { etat: 'non-lu' }, jour: 10, envois: [], ...o,
});
const p1 = presta();
dit('un prestataire pret, nom pas encore lu chez MTN : il part (le nom manquant ne bloque rien)', ['confirme', true, 20000, '2026-12-10', 'prestataires-2026-11'],
  [p1.etat, p1.aValider, p1.parMtnXof, p1.date?.jour, p1.runId]);
const sansPrix = presta({ id: 'pp', montantXof: null });
dit('une mission sans prix : ne part pas, hors du pont', ['ne-part-pas', 'sans prix', false, 0], [sansPrix.etat, sansPrix.pourquoi, sansPrix.viaMtn, sansPrix.parMtnXof]);
const avant5 = presta({ id: 'pe', jour: 3 });
dit('une date avant le 5 : toucher a part, hors du toucher du mois', ['toucher-a-part', false, true], [avant5.etat, avant5.aValider, seValideAPart(avant5)]);
const repris = presta({ id: 'pr', numero: { etat: 'repris' } });
dit('un numero repris de la fiche ne part pas sans « Prendre »', ['ne-part-pas', false], [repris.etat, repris.viaMtn]);
const v10: ValidationADate = { par: 'Y. B.', le: '2026-12-05T13:00:00.000Z', montantXof: 20000, jour: 10, msisdn: '2290190000011' };
const programme = env({ run_id: 'prestataires-2026-11', employee_id: 'pj', montant_xof: 20000, part_a: '2026-12-10T17:00:00.000Z' });
dit('validee et programmee a sa date', 'programme', presta({ validation: v10, envois: [programme] }).etat);
const changee = presta({ validation: v10, envois: [programme], jour: 15 });
dit('date changee apres le toucher : la ligne attend son toucher, elle seule (meme si l envoi vit encore)', ['date-changee', false, true, 'programme'],
  [changee.etat, changee.aValider, seValideAPart(changee), changee.envoi?.etat]);
dit('... deja partie, une date changee ne change plus rien', ['paye', 'envoi'],
  [presta({ validation: v10, envois: [{ ...programme, etat: 'recu' }], jour: 15 }).etat, presta({ validation: v10, envois: [{ ...programme, etat: 'envoye' }], jour: 15 }).etat]);
dit('montant change apres le toucher : la ligne attend son toucher', 'change', presta({ validation: v10, montantXof: 25000 }).etat);
dit('le nouveau toucher a part revalide a la nouvelle date', ['valide', true, 15],
  (() => { const v = validationDe(changee, 'Y. B.', '2026-12-06T10:00:00.000Z'); const x = presta({ validation: v ?? undefined, jour: 15 }); return [x.etat, v?.aPart, v?.jour]; })());
dit('une validation du toucher du mois n est pas « a part » ; l equipe n en a pas', [undefined, null],
  [validationDe(p1, 'Y. B.', 'x')?.aPart, validationDe(a, 'Y. B.', 'x')]);
dit('le depart : sa date a 18 h, ou le prochain 18 h si elle est passee', ['2026-12-10T17:00:00.000Z', '2026-12-11T17:00:00.000Z', 'H-EQUIPE'],
  [departDeLaLigne(p1, 'H-EQUIPE', ms('2026-12-05T13:00:00Z')), departDeLaLigne(p1, 'H-EQUIPE', ms('2026-12-11T09:00:00Z')), departDeLaLigne(a, 'H-EQUIPE', 0)]);
dit('ce qu on confie au serveur : la personne, son numero, ce qui part par MTN (sans les pourboires)', [{ employeeId: 'e1', nom: 'A. K.', msisdn: '2290190000001', montantXof: 85000 }, null],
  [itemDeLaLigne(a), itemDeLaLigne(sansPrix)]);

/* L'entreprise : un fournisseur, sa facture. */
const carnet = [
  { id: 'fr-1', branchId: 'b1', nom: 'Gardiennage S.', paiement: { msisdn: '2290190000021', jour: 10 as const, agent: 'agent D.' } },
  { id: 'fr-2', branchId: 'b1', nom: 'Super U' },
  { id: 'fr-3', branchId: 'b1', nom: 'Climatisation C.', archived: true, paiement: { msisdn: '2290190000022', jour: 'dernier' as const } },
  { id: 'fr-4', branchId: 'b2', nom: 'Ailleurs', paiement: { msisdn: '2290190000023', jour: 10 as const } },
];
dit('les entreprises : les fournisseurs qui portent un paiement, de la branche, pas archives', ['fr-1'], entreprisesDuCarnet(carnet, 'b1').map((x) => x.id));
const piece = { chemin: 'b1/facture-entreprise/x.pdf', nom: 'x.pdf', type: 'application/pdf', taille: 1000 };
const fac: FactureDEntreprise = { id: 'fe-1', branchId: 'b1', fournisseurId: 'fr-1', periode: '2026-11', facture: '2026-118', montantXof: 45000, piece, creeLe: '2026-12-01T09:00:00.000Z', creePar: 'Y. B.' };
dit('la facture du mois : celle de la periode, la plus recente', ['fe-2', undefined],
  [factureDuMois([fac, { ...fac, id: 'fe-2', creeLe: '2026-12-02T09:00:00.000Z' }], 'fr-1', '2026-11')?.id, factureDuMois([fac], 'fr-1', '2026-10')?.id]);
dit('sans facture, sans piece jointe, rien ne part', ['sans facture ce mois', 'sans facture jointe', 'sans facture jointe', undefined, 'numéro MTN illisible'], [
  arretDeLEntreprise(undefined, '2290190000021'), arretDeLEntreprise({ ...fac, piece: undefined }, '2290190000021'),
  arretDeLEntreprise({ ...fac, facture: ' ' }, '2290190000021'), arretDeLEntreprise(fac, '2290190000021'), arretDeLEntreprise(fac, '97000000'),
]);
const ent = (facture?: FactureDEntreprise) => ligneADate({
  genre: 'entreprise', id: 'fr-1', nom: 'Gardiennage S.', periode: '2026-11', montantXof: facture?.montantXof ?? 0,
  arret: arretDeLEntreprise(facture, '2290190000021'), msisdn: '2290190000021', numero: { etat: 'verifie', nomMtn: 'GARDIENNAGE S' }, jour: 10, envois: [],
});
const e1 = ent(fac);
const e2 = ent({ ...fac, piece: undefined });
dit('une entreprise avec sa facture jointe part a sa date, sous son run', ['confirme', 45000, 'entreprises-2026-11'], [e1.etat, e1.parMtnXof, e1.runId]);
dit('... sans facture jointe : ne part pas, hors du pont', ['ne-part-pas', 'sans facture jointe', false], [e2.etat, e2.pourquoi, e2.viaMtn]);
const recu = env({ run_id: 'entreprises-2026-11', employee_id: 'fr-1', montant_xof: 45000, etat: 'recu', repondu_le: '2026-12-10T17:02:00.000Z' });
const dep = depenseDeLEntreprise(carnet[0], fac, recu);
dit('la depense de l entreprise : une depense de fournisseur, jamais « Salaires », au jour de Cotonou', [CATEGORIE_DES_ENTREPRISES, 'fr-1', 45000, '2026-12-10', 'Gardiennage S. - novembre 2026', true, null],
  [dep?.category, dep?.fournisseurId, dep?.amountXof, dep?.date, dep?.label, dep?.category !== 'Salaires', depenseDeLEntreprise(carnet[0], fac, { ...recu, etat: 'programme' })]);

/* ── 3. Le pont ── */
const mois: LigneDuMois[] = [a, b, r, p1, sansPrix, e1, e2];
const c = chiffresDuMois(mois, { e1: { par: 'Y. B.' } });
dit('le pont : salaires nets - prets + prestataires + entreprises = par MTN', true, pontTenu(c));
dit('... en chiffres : 165 000 - 30 000 + 20 000 + 45 000 = 200 000, 4 virements', [165000, 30000, 20000, 45000, 200000, 4],
  [c.salairesNetsXof, c.pretsXof, c.prestatairesXof, c.entreprisesXof, c.parMtnXof, c.virements]);
dit('... les pourboires a part, en especes : 3 750, 1 coche sur 2', [3750, 1, 2], [c.pourboiresXof, c.pourboiresRemis, c.pourboiresATotal]);
dit('... hors MTN : Moov, sans prix, sans facture', [3, 2, 1, 2], [c.horsMtn, c.nbPrestatairesTotal, c.nbEntreprises, c.nbEntreprisesTotal]);
dit('... le pont tient sur un mois vide', [true, 0], [pontTenu(chiffresDuMois([])), chiffresDuMois([]).parMtnXof]);
/* 6 nov. 2026 : G., N. et A. passent au contrat « prestataire ». Leurs pourboires du mois
   restent a remettre en especes le 5, sur leur ligne de prestataire ; une entreprise n'en a jamais. */
const pp = presta({ id: 'st-g', nom: 'G. T.', pourboiresDuMoisXof: 1500 });
const ce = chiffresDuMois([pp, e1], { 'st-g': { par: 'Y. B.' } });
dit('une prestataire de l equipe garde ses pourboires, comptes et cochables ; jamais dans le virement', [1500, 1500, 1, 1, 20000],
  [pp.pourboiresXof, ce.pourboiresXof, ce.pourboiresRemis, ce.pourboiresATotal, pp.parMtnXof]);
dit('une entreprise n a pas de pourboires, meme si on lui en passe', 0, ligneADate({ genre: 'entreprise', id: 'x', nom: 'X.', periode: '2026-11', montantXof: 1000, msisdn: '2290190000099', numero: { etat: 'non-lu' }, jour: 10, envois: [], pourboiresDuMoisXof: 900 }).pourboiresXof);

/* ── 4. Le numero et le nom chez MTN ── */
const lecture: LectureMtn = { le: '2026-12-05T11:00:00.000Z', soldeXof: null, numeros: {
  '2290190000001': { actif: true, nom: 'KOSSOU AICHA' },
  '2290190000002': { actif: true, nom: 'PAULINE AGBO' },
  '2290190000003': { actif: false, nom: null },
  '2290190000004': { actif: null, nom: null },
} };
dit('le nom chez MTN : conforme, different, sans compte, pas encore lu (le profil fermé rend null)', ['verifie', 'differe', 'inactif', 'non-lu', 'non-lu'], [
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000001', source: 'fiche', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000002', source: 'fiche', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000003', source: 'fiche', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000004', source: 'fiche', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000005', source: 'fiche', lecture }).etat,
]);
dit('« C est bien son numero » vaut pour ce numero et ce nom seulement', ['verifie', 'differe'], [
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000002', source: 'fiche', lecture, vu: { par: 'Y. B.', le: 'x', msisdn: '2290190000002', nomMtn: 'PAULINE AGBO' } }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000002', source: 'fiche', lecture, vu: { par: 'Y. B.', le: 'x', msisdn: '2290190000009', nomMtn: 'PAULINE AGBO' } }).etat,
]);
dit('un numero repris de la fiche reste repris tant qu il n est pas pris ; sans numero, sans', ['repris', 'sans', 'autre-voie'], [
  etatDuNumero({ nom: 'Aïcha Kossou', msisdn: '2290190000001', source: 'repris', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', source: 'sans', lecture }).etat,
  etatDuNumero({ nom: 'Aïcha Kossou', source: 'autre-voie', lecture }).etat,
]);
dit('« Prendre » : nom conforme ou pas encore lu oui ; nom different, son mot ; sans compte, non', ['oui', 'oui', 'son-mot', 'non', 'non'], [
  peutPrendre('Aïcha Kossou', '2290190000001', lecture), peutPrendre('Aïcha Kossou', '2290190000004', null),
  peutPrendre('Aïcha Kossou', '2290190000002', lecture), peutPrendre('Aïcha Kossou', '2290190000003', lecture), peutPrendre('Aïcha Kossou', undefined, lecture),
]);

/* ── 5. Ce que le Trone a repere ── */
const codes = (p: ReturnType<typeof pointsARegarder>) => p.map((x) => x.code);
const pts = pointsARegarder({ lignes: [a, b, sansPrix, avant5, changee, e2, repris], soldeXof: null, aCouvrirXof: 135000 });
dit('les points : repris, sans prix, sans facture, confirmation, avant le 5, date changee, solde inconnu',
  ['numero-repris', 'sans-prix', 'sans-facture', 'confirmation', 'avant-le-5', 'date-changee', 'solde-inconnu'], codes(pts));
dit('un solde inconnu se dit, sans chiffre invente, et ne bloque pas', [false, undefined],
  [pts.find((x) => x.code === 'solde-inconnu')?.bloque, pts.find((x) => x.code === 'solde-inconnu')?.manqueXof]);
const court = pointsARegarder({ lignes: [], soldeXof: 100000, aCouvrirXof: 300000 });
dit('un solde court : il manque 200 000, et il bloque', [['solde-court'], 200000, true], [codes(court), court[0]?.manqueXof, court[0]?.bloque]);
dit('un solde suffisant ne dit rien ; rien a couvrir, rien a dire', [[], []],
  [codes(pointsARegarder({ lignes: [], soldeXof: 400000, aCouvrirXof: 300000 })), codes(pointsARegarder({ lignes: [], soldeXof: null, aCouvrirXof: 0 }))]);
const lectures = new Map([['e1', lu({ etat: 'bloquee', blocages: [{ code: 'plafond', netXof: 70000, plafondXof: 66875, netAvantXof: 53500 }] })]]);
dit('un ecart au-dela de +25 % sans accord : un point, qui bloque', [['plafond'], true],
  [codes(pointsARegarder({ lignes: [{ ...a, etat: 'ne-part-pas' }], lectures, aCouvrirXof: 0 })), pointsARegarder({ lignes: [{ ...a, etat: 'ne-part-pas' }], lectures, aCouvrirXof: 0 })[0]?.bloque]);
dit('une ligne payee ne se regarde plus', [], codes(pointsARegarder({ lignes: [{ ...sansPrix, etat: 'paye' }], aCouvrirXof: 0 })));

/* ── 6. Le test MTN : 500 F a Y., 500 F a B., 100 F a G. ── */
const fiches = [
  { id: 'st-y', name: 'Yéman B.', mobileMoney: { numero: '2290190000031', operateur: 'MTN' } },
  { id: 'st-b', name: 'Brice A.', mobileMoney: { numero: '2290190000032', operateur: 'MTN' } },
  { id: 'st-g0', name: 'Gérard X.', archiveeLe: '2026-01-01' },
  { id: 'st-g', name: 'Gérard T.', phone: '+229 01 90 00 00 33' },
];
const t = lignesDuTest(fiches);
dit('le test : 500 F, 500 F, 100 F ; G. a un numero repris de sa fiche (fiche archivee ignoree)', [[500, 500, 100], ['st-y', 'st-b', 'st-g'], [false, false, true]],
  [t.map((x) => x.montantXof), t.map((x) => x.ficheId), t.map((x) => x.repris)]);
dit('... un numero repris ne part pas au test sans etre pris : 1 000 F a deux', [2, 1000], [itemsDuTest(t).length, totalDuTest(t)]);
const t2 = lignesDuTest([...fiches.slice(0, 2), { id: 'st-g', name: 'Gérard T.', mobileMoney: { numero: '2290190000033', operateur: 'MTN' } }]);
dit('... pris, les trois partent : 1 100 F', [3, 1100, null], [itemsDuTest(t2).length, totalDuTest(t2), pourquoiPasLeTest(t2)]);
dit('... montants modifiables ligne a ligne, jamais plus de 500 F', [[300, 500, 100], true, true],
  [lignesDuTest(fiches, { Yéman: 300 }).map((x) => x.montantXof), /500 F/.test(pourquoiPasLeTest(lignesDuTest(fiches, { Brice: 600 })) ?? ''), !!pourquoiPasLeTest(lignesDuTest([]))]);
dit('un refus du test se relance a 500 F ; pas un refus deja a 500 F', [true, false, false],
  [seRelanceA500({ etat: 'refuse', montant_xof: 100 }), seRelanceA500({ etat: 'refuse', montant_xof: 500 }), seRelanceA500({ etat: 'recu', montant_xof: 100 })]);
const essai = (etats: EnvoiMtn['etat'][]) => bilanDeLEssai(etats.map((etat, i) => env({ genre: 'essai', essai_id: 'essai-202612011014', employee_id: `e${i}`, etat, montant_xof: 500 })));
dit('le test reussi se replie : tout recu ; un refus ou un envoi en cours ne replient pas', [true, false, false, false],
  [testReussi(essai(['recu', 'recu', 'recu'])), testReussi(essai(['recu', 'refuse'])), testReussi(essai(['recu', 'envoye'])), testReussi(essai([]))]);

/* ── 7. Les prets : l'echeancier ── */
const pret = echeancierDuPret({
  preteXof: 150000, resteAvantXof: 125000, periode: '2026-11', retenueDuMoisXof: 25000,
  faites: [{ mois: '2026-10', montantXof: 25000 }],
  avenir: [{ mois: '2026-12', retenueXof: 25000 }, { mois: '2027-01', retenueXof: 25000 }, { mois: '2027-02', retenueXof: 25000 }, { mois: '2027-03', retenueXof: 25000 }],
});
dit('le pret : retenu 50 000 (ce mois compris), reste 100 000, derniere retenue mars 2027', [50000, 100000, '2027-03', 1 / 3],
  [pret.retenuXof, pret.resteApresXof, pret.derniereRetenue, pret.partRemboursee]);
dit('... les echeances : faite, ce mois, a venir', [['2026-10', 'faite'], ['2026-11', 'ce-mois'], ['2026-12', 'a-venir'], ['2027-03', 'a-venir']],
  [pret.echeances[0], pret.echeances[1], pret.echeances[2], pret.echeances[5]].map((e) => [e?.mois, e?.etat]));
const solde = echeancierDuPret({ preteXof: 40000, resteAvantXof: 15000, periode: '2026-11', retenueDuMoisXof: 25000, faites: [], avenir: [] });
dit('le dernier mois ne retient que le reste : 15 000, solde ce mois', [0, '2026-11', 15000], [solde.resteApresXof, solde.derniereRetenue, solde.echeances[0]?.montantXof]);

/* ── 8. L'ecran, la route, le serveur ── */
const ECRAN = lis('src/apps/trone/routes/equipe/LesPaiements.tsx');
const MAGASIN = lis('src/apps/trone/routes/equipe/les-paiements.ts');
const STYLE = lis('src/apps/trone/routes/equipe/les-paiements.css');
/* Vu en ligne le 6 nov. 2026 : collee a bottom 0, la barre flottait 96 px au-dessus
   du bord (le rembourrage bas de .tr-content). Elle le compense, aux trois tailles. */
dit('la barre de validation colle au bord de la fenetre, pas au-dessus du rembourrage', [true, true, true],
  [STYLE.includes('.lp-pied { position: sticky; bottom: calc(-1 * var(--space-9, 96px));'), STYLE.includes('  .lp-pied { bottom: -40px; }'), STYLE.includes('  .tr-shell--barre .lp-pied { bottom: -78px; }')]);
const INDEX = lis('src/apps/trone/routes/index.tsx');
const PUR = lis('src/shared/les-paiements-pur.ts');
dit('l equipe salariee est prevenue, les prestataires et les entreprises non (0164)', [true, true],
  [ECRAN.includes("prevenir: genre === 'equipe',"), MAGASIN.includes('prevenir: o.prevenir });')]);
dit('les envois passent par programmeLeRun de la paie par MTN (le tri, puis le serveur), jamais par un appel a part', [true, false],
  [MAGASIN.includes('await programmeLeRun({'), /functions\.invoke|action: 'programmer'/.test(MAGASIN + ECRAN)]);
dit('l ecran est au souverain seul : la route et l ecran', [true, true],
  [/export const ROUTES_SOUVERAIN = \[[^\]]*'\/paiements'/.test(INDEX), ECRAN.includes('  if (!estSouverain) {')]);
dit('un onglet des Ressources humaines, ne apres les departements', [true, true],
  [/hote: '\/personnel'[^\n]*\{ path: '\/paiements', label: 'Les paiements' \}/.test(INDEX), /ECRANS_NES_APRES_LES_DEPARTEMENTS[^;]*'\/paiements'/.test(INDEX)]);
dit('la validation de l equipe est celle de la paie du 5 (valideLesLignes), par la question de la Maison', [true, true],
  [ECRAN.includes('const r = valideLesLignes(asArray<PayrollLine>(courant.lines), lu, qui, le);'), /quoi: 'Les paiements du mois',/.test(ECRAN)]);
/* Le depot est public : le compte de paie est NOMME, jamais son numero (e6 avait
   deja retire le vrai numero d'un commentaire de la paie pour la meme raison). */
dit('le compte de paie est nomme dans l en-tete, sans son numero ni aucune cle', [true, false, false],
  [ECRAN.includes("const COMPTE_DE_PAIE = 'compte de paie MTN';"), /\b0?1 ?9\d ?\d\d ?\d\d ?\d\d\b|2290\d{9}/.test(ECRAN), /MOMO_|X-Relais|subscription/i.test(ECRAN + MAGASIN)]);
dit('la reponse de chacun au WhatsApp de la paie (0165) se lit sur sa ligne, sobrement', [true, true],
  [ECRAN.includes("l.envoi?.reponse_employe === 'bien-recu' ? <span className=\"lp-reponse\">Bien reçu ✓</span>"), ECRAN.includes("l.envoi?.reponse_employe === 'pas-encore' ? <span className=\"lp-reponse lp-reponse--pas\">Pas encore reçu</span>")]);
dit('la regle reste pure : ni magasin, ni horloge', [false, false], [/from '\.\/store'|createStore|useStore/.test(PUR), /Date\.now\(\)/.test(PUR)]);

console.log(ko ? `\n${ko} ECHEC.` : '\nLes paiements tiennent leurs promesses.');
if (ko) process.exitCode = 1;
