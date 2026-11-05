/* LA PAIE PAR MTN, LES RÈGLES DU TRÔNE ÉPROUVÉES · 5 novembre 2026, lot 2.
   Lancé par `node scripts/verifie-la-paie-par-mtn.mjs` (et `--prouve`).
   Les personnes, les numéros et les montants sont inventés pour le banc. */
import { readFileSync } from 'node:fs';
import {
  appliqueLesRecus, bilanDeLEssai, ceQuiManque, depenseDeLEssai, depenseDeLEssaiId, envoiActif, equipeDeLEssai,
  heureDeDepart, idDeLEssai, itemsDuRun, nomConcorde, notificationDeLaPaie, pourquoiPasLEssai, raisonDite, triDesEnvois,
  type EnvoiMtn, type LectureMtn,
} from '../src/shared/paie-par-mtn-pur';
import { calendrierDeLaPaie, type LectureDeLaLigne } from '../src/shared/paie-du-5-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── 1. Le nom chez MTN ── */
dit('le meme nom, dans l autre ordre et sans accent, concorde', 'concorde', nomConcorde('Aïcha Kossou', 'KOSSOU AICHA'));
dit('un prenom et une initiale : le prenom suffit', 'concorde', nomConcorde('Gérald T.', 'TOSSA GERALD'));
dit('un autre nom differe', 'differe', nomConcorde('Aïcha Kossou', 'PAULIN AHO'));
dit('un seul mot commun sur deux ne suffit pas', 'differe', nomConcorde('Aïcha Kossou', 'AICHA DOSSOU'));
dit('MTN sans nom : inconnu, pas different', ['inconnu', 'inconnu'], [nomConcorde('Aïcha Kossou', null), nomConcorde('Aïcha Kossou', '  ')]);

/* ── 2. Les raisons ── */
dit('un refus connu se dit en clair, un inconnu se cite', ['ce numéro ne peut pas recevoir', 'MTN dit WEIRD_CODE', 'MTN n’a pas dit pourquoi'],
  [raisonDite('PAYEE_NOT_ALLOWED_TO_RECEIVE'), raisonDite('WEIRD_CODE'), raisonDite(undefined)]);

/* ── 3. Le depart ── */
const cal = calendrierDeLaPaie('2026-11'); /* paie le samedi 5 decembre 2026 a 18 h */
const ms = (iso: string) => Date.parse(iso);
dit('avant l heure de paie : l heure de paie', '2026-12-05T17:00:00.000Z', heureDeDepart(cal, ms('2026-12-05T13:20:00Z')));
dit('apres 18 h le 5 : le lendemain a 18 h', '2026-12-06T17:00:00.000Z', heureDeDepart(cal, ms('2026-12-05T18:30:00Z')));
dit('le 7 a 10 h : le 7 a 18 h', '2026-12-07T17:00:00.000Z', heureDeDepart(cal, ms('2026-12-07T09:00:00Z')));
dit('a 18 h pile, le passage suivant', '2026-12-08T17:00:00.000Z', heureDeDepart(cal, ms('2026-12-07T17:00:00Z')));
dit('juste avant minuit a Cotonou, le lendemain a 18 h', '2026-12-08T17:00:00.000Z', heureDeDepart(cal, ms('2026-12-07T22:59:00Z')));

/* ── 4. Le tri ── */
const env = (o: Partial<EnvoiMtn>): EnvoiMtn => ({
  reference: '00000000-0000-4000-8000-000000000001', genre: 'paie', run_id: 'run-1', periode: '2026-11', essai_id: null,
  employee_id: 'e1', nom: 'Aïcha Kossou', msisdn: '2290190000001', montant_xof: 150000, etat: 'programme',
  part_a: '2026-12-05T17:00:00.000Z', programme_par: 'Y.', programme_le: '2026-12-05T13:00:00.000Z', ...o,
});
const items = [
  { employeeId: 'e1', nom: 'Aïcha Kossou', msisdn: '2290190000001', montantXof: 150000 },
  { employeeId: 'e2', nom: 'Paulin Aho', msisdn: '2290190000002', montantXof: 90000 },
  { employeeId: 'e3', nom: 'Sika Houngbo', msisdn: '2290190000003', montantXof: 80000 },
  { employeeId: 'e4', nom: 'Rose Dah', msisdn: '2290190000004', montantXof: 70000 },
];
const lecture: LectureMtn = { le: '2026-12-05T11:00:00.000Z', soldeXof: 500000, numeros: {
  '2290190000001': { actif: true, nom: 'KOSSOU AICHA' },
  '2290190000002': { actif: true, nom: 'PAULINE AGBO' },
  '2290190000003': { actif: false, nom: null },
  '2290190000004': { actif: true, nom: null },
} };
const sansVu = () => undefined;
const t1 = triDesEnvois({ runId: 'run-1', items, envois: [], lecture, vus: sansVu });
dit('le tri : le bon nom et le nom inconnu partent, le nom different et l inactif attendent',
  [['e1', 'e4'], [['e2', 'nom'], ['e3', 'inactif']]],
  [t1.partent.map((x) => x.employeeId), t1.attendent.map((x) => [x.employeeId, x.pourquoi])]);
const vuBon = (id: string) => (id === 'e2' ? { par: 'Y.', le: 'x', msisdn: '2290190000002', nomMtn: 'PAULINE AGBO' } : undefined);
const vuAutre = (id: string) => (id === 'e2' ? { par: 'Y.', le: 'x', msisdn: '2290190000099', nomMtn: 'PAULINE AGBO' } : undefined);
dit('« C est bien son numero » libere ce numero-la seulement',
  [true, false],
  [triDesEnvois({ runId: 'run-1', items, envois: [], lecture, vus: vuBon }).partent.some((x) => x.employeeId === 'e2'),
    triDesEnvois({ runId: 'run-1', items, envois: [], lecture, vus: vuAutre }).partent.some((x) => x.employeeId === 'e2')]);
dit('un envoi vivant retient la ligne ; un envoi refuse ou annule non', [['deja'], ['e1', 'e4'], ['e1', 'e4']],
  [triDesEnvois({ runId: 'run-1', items: [items[0]], envois: [env({ etat: 'envoye' })], lecture, vus: sansVu }).attendent.map((x) => x.pourquoi),
    triDesEnvois({ runId: 'run-1', items, envois: [env({ etat: 'refuse' })], lecture, vus: sansVu }).partent.map((x) => x.employeeId),
    triDesEnvois({ runId: 'run-1', items, envois: [env({ etat: 'annule' })], lecture, vus: sansVu }).partent.map((x) => x.employeeId)]);
dit('un envoi d un autre run ne retient rien', undefined, envoiActif([env({ run_id: 'run-2', etat: 'envoye' })], 'run-1', 'e1'));
dit('un numero illisible ou un montant nul attendent', ['numero', 'montant'],
  triDesEnvois({ runId: 'run-1', items: [{ ...items[0], msisdn: '22990000001' }, { ...items[3], montantXof: 0 }], envois: [], vus: sansVu }).attendent.map((x) => x.pourquoi));

/* ── 5. Les lignes du run ── */
const lec = (o: Partial<LectureDeLaLigne>): LectureDeLaLigne => ({
  etat: 'payable', blocages: [], voie: 'MTN', msisdn: '2290190000001', netXof: 150000, fraisXof: 0, fraisRenseignes: true,
  envoyeXof: 150000, cle: 'k', depotAJour: true, enRetard: false, plafond: null, numero: null, ...o,
});
dit('seules les lignes validees MTN, salariees et non payees partent', ['a'],
  itemsDuRun([
    { ligne: { employeeId: 'a', name: 'A' }, lecture: lec({}) },
    { ligne: { employeeId: 'b', name: 'B' }, lecture: lec({ etat: 'confirmee' }) },
    { ligne: { employeeId: 'c', name: 'C' }, lecture: lec({ voie: 'Moov' }) },
    { ligne: { employeeId: 'd', name: 'D', prestataire: true }, lecture: lec({}) },
    { ligne: { employeeId: 'e', name: 'E', payeLe: '2026-12-05' }, lecture: lec({}) },
  ]).map((x) => x.employeeId));

/* ── 6. Les reponses paient les lignes ── */
const recu = env({ etat: 'recu', repondu_le: '2026-12-05T23:30:00.000Z', transaction_mtn: '41270093' });
const paye = appliqueLesRecus([{ employeeId: 'e1' }, { employeeId: 'e2', payeLe: '2026-11-30', payeMoyen: 'espèces' }, { employeeId: 'e3' }], 'run-1',
  [recu, env({ employee_id: 'e2', etat: 'recu' }), env({ employee_id: 'e3', etat: 'refuse' })]);
dit('un recu paie sa ligne au jour de Cotonou, avec la transaction ; une ligne payee ne bouge pas ; un refus ne paie pas',
  [['e1'], { employeeId: 'e1', payeLe: '2026-12-06', payeMoyen: 'MTN', envoyeXof: 150000, transactionMtn: '41270093', referenceMtn: recu.reference }, '2026-11-30', undefined],
  [paye.payees, paye.lignes[0], paye.lignes[1].payeLe, paye.lignes[2].payeLe]);
dit('un recu d un autre run ne paie pas', [], appliqueLesRecus([{ employeeId: 'e1' }], 'run-2', [recu]).payees);

/* ── 7. Le test de 100 F ── */
const fiches = [
  { id: 'e1', name: 'Aïcha Kossou', mobileMoney: { numero: '2290190000001', operateur: 'MTN' } },
  { id: 'e2', name: 'Paulin Aho', contractType: 'prestataire', mobileMoney: { numero: '2290190000002', operateur: 'MTN' } },
  { id: 'e3', name: 'Sika Houngbo', archiveeLe: '2026-10-01', mobileMoney: { numero: '2290190000003', operateur: 'MTN' } },
  { id: 'e4', name: 'Rose Dah', mobileMoney: { numero: '2290190000004', operateur: 'Moov' } },
  { id: 'e5', name: 'Léa Sossa' },
];
const eq = equipeDeLEssai(fiches, 100);
dit('le test : l equipe salariee sur MTN ; ni prestataire, ni fiche archivee, ni Moov ; les sans-numero se disent',
  [[{ employeeId: 'e1', nom: 'Aïcha Kossou', msisdn: '2290190000001', montantXof: 100 }], ['Léa Sossa']], [eq.partent, eq.sansNumero]);
dit('le test refuse plus de 500 F, un montant non entier, une equipe sans numero', [true, true, true, false],
  [!!pourquoiPasLEssai(501, 3), !!pourquoiPasLEssai(99.5, 3), !!pourquoiPasLEssai(100, 0), !!pourquoiPasLEssai(500, 3)]);
dit('l identifiant du test suit ce que le serveur accepte', true, /^essai-\d{12}$/.test(idDeLEssai(ms('2026-12-01T17:00:00Z'))));
dit('l identifiant du test est l heure de Cotonou', 'essai-202612011800', idDeLEssai(ms('2026-12-01T17:00:00Z')));
const e1 = env({ genre: 'essai', run_id: null, periode: null, essai_id: 'essai-202612011800', montant_xof: 100, etat: 'recu' });
const e2 = env({ genre: 'essai', run_id: null, periode: null, essai_id: 'essai-202612011800', employee_id: 'e2', montant_xof: 100, etat: 'envoye' });
const e3 = env({ genre: 'essai', run_id: null, periode: null, essai_id: 'essai-202612011800', employee_id: 'e3', montant_xof: 100, etat: 'refuse' });
dit('pas de depense tant qu un envoi attend', null, depenseDeLEssai({ essaiId: 'essai-202612011800', branchId: 'b', bilan: bilanDeLEssai([e1, e2, e3]), jour: '2026-12-01' }));
const dep = depenseDeLEssai({ essaiId: 'essai-202612011800', branchId: 'b', bilan: bilanDeLEssai([e1, { ...e2, etat: 'recu' }, e3]), jour: '2026-12-01' });
dit('la depense du test : les recus seulement, une seule par test, la Maison a paye',
  [depenseDeLEssaiId('essai-202612011800'), 200, 'Essai de paie MTN · 2 envois', true], [dep?.id, dep?.amountXof, dep?.label, dep?.laMaisonAPaye]);
dit('un solde inconnu ne couvre rien ; un solde court dit ce qui manque', [null, 0, 5000], [ceQuiManque(null, 100), ceQuiManque(10000, 10000), ceQuiManque(5000, 10000)]);

/* ── 7 bis. Prevenir chacun (0164) ── */
dit('la notification de la paie, avec l annee, les francs et l elision',
  ['Ta paie de novembre 2026 est partie : 50 000 F.', 'Ta paie d’octobre 2026 est partie : 150 000 F.', 'Ta paie d’août 2027 est partie : 900 F.', 'Ta paie d’avril 2027 est partie : 1 250 000 F.'],
  [notificationDeLaPaie('2026-11', 50000), notificationDeLaPaie('2026-10', 150000), notificationDeLaPaie('2027-08', 900), notificationDeLaPaie('2027-04', 1250000)]);

/* ── 8. Les ecrans et la base ── */
const lis = (f: string) => readFileSync(f, 'utf8');
const p5 = lis('src/apps/trone/routes/equipe/PaieDu5.tsx');
const bloc = lis('src/apps/trone/routes/equipe/PaieParMtn.tsx');
const paie = lis('src/apps/trone/routes/equipe/Paie.tsx');
const espace = lis('src/apps/trone/routes/equipe/rh/MonEspace.tsx');
const sql = lis('supabase/migrations/0163_la_paie_par_mtn.sql');
const previent = lis('supabase/migrations/0164_la_paie_previent_chacun.sql').replace(/\r\n/g, '\n');
dit('le meme toucher programme les lignes MTN, seulement quand le serveur est pret', [true, true],
  [/if \(!serveur\.pret\) return;\s*\n\s*const mtn = cibles\.filter/.test(p5), /await programmeLeRun\(\{/.test(p5)]);
dit('le solde court arrete la programmation', true, /if \(manque != null && manque > 0\) \{\s*\n\s*alerte\(`Validées, mais pas programmées/.test(p5));
dit('le fichier du portail reste, plie en secours quand l API est allumee', true,
  /\{serveur\.pret \? \(\s*\n\s*<details className="p5__secours">[\s\S]*\{portailMtn\}[\s\S]*\) : portailMtn\}/.test(p5));
dit('les reponses de MTN paient les lignes et les bulletins', [true, true],
  [/appliqueLesRecus\(asArray<PayrollLine>\(x\.lines\), x\.id, envois\)/.test(bloc), /transactionMtn: l\.transactionMtn/.test(bloc)]);
dit('un refus se renvoie seulement apres un toucher', true, /e\.etat === 'refuse' && !fige && <span><Button size="sm" variant="ghost" onClick=\{\(\) => void renvoyer\(e\)\}>/.test(bloc));
dit('La paie montre le test ; Mon espace dit la transaction', [true, true], [/<EssaiMtn \/>/.test(paie), /Transaction MTN \$\{b\.transactionMtn\}/.test(espace)]);
dit('la base : RLS, lecture par la direction seule, aucune ecriture de l equipe, un envoi vivant par bulletin', [true, true, true, true],
  [/alter table public\.paie_envois_mtn enable row level security;/.test(sql),
    /for select to authenticated\s*\n\s*using \(public\.est_direction\(\)\);/.test(sql),
    /revoke all on public\.paie_envois_mtn from anon, authenticated;\s*\n\s*grant select on public\.paie_envois_mtn to authenticated;/.test(sql),
    /on public\.paie_envois_mtn \(run_id, employee_id\)\s*\n\s*where genre = 'paie' and etat not in \('refuse', 'annule'\);/.test(sql)]);
dit('le test ne depasse pas 500 F dans la base non plus', true, /genre = 'essai' and essai_id is not null and montant_xof <= 500/.test(sql));

dit('le declencheur : seulement le passage a recu, d une paie a prevenir', true,
  /if new\.genre <> 'paie' or not new\.prevenir or new\.etat <> 'recu' or old\.etat = 'recu' then\n\s*return new;/.test(previent));
dit('une reference, une seule notification ; la direction jamais prevenue', [true, true],
  [/insert into public\.paies_prevenues \(reference, staff_id\) values \(new\.reference, new\.employee_id\)\n\s*on conflict \(reference\) do nothing;\n\s*if not found then/.test(previent),
    /s\.role in \('souverain', 'gerant'\)\) then\n\s*update public\.paies_prevenues set issue = 'direction'/.test(previent)]);
dit('le texte du declencheur est celui du Trone : l elision des mois a voyelle, l annee, les francs', true,
  /titre := 'Ta paie ' \|\| case when extract\(month from jour\) in \(4, 8, 10\) then 'd’' else 'de ' end\n\s*\|\| public\.mois_dit\(jour\) \|\| ' est partie : ' \|\| public\.francs_dits\(new\.montant_xof::bigint\) \|\| '\.';/.test(previent));
dit('jamais une reponse de MTN refusee pour une notification ; le declencheur sur l etat seul', [true, true],
  [/exception when others then\n\s*-- Jamais une réponse de MTN refusée pour une notification\.\n\s*raise warning/.test(previent), /after update of etat on public\.paie_envois_mtn/.test(previent)]);
dit('la paie du mois previent l equipe', [true, true], [/prevenir: true,\r?\n\s*\}\);/.test(p5), /vus, prevenir: true \}\)/.test(bloc)]);

console.log(ko === 0 ? '\nLes regles de la paie par MTN tiennent.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
