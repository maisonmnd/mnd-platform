/* LA DIRECTION DES RESSOURCES HUMAINES, ÉPROUVÉE — 14 octobre 2026.
   `node scripts/verifie-la-direction-des-rh.mjs`

   Ce que la maquette QLU1EoT6… a promis, avec ses quatre choix (la direction
   seule, l'espace complet, la grille qui avertit, tout en une fois) :
   · la fiche se range en deux, et le privé ne repart jamais dans `team` ;
     une ligne inchangée ne s'écrit pas (la boucle du 2 octobre 2026) ;
   · les quatre fuites sont fermées (écran, notification, base, pointage) ;
   · le run de paie reprend primes, prime de points, pourboires et retenues ;
   · les règles pures : pièces, grille, planning, procédure, candidatures,
     départ, obligations, ce qui attend la direction ;
   · la 0130 dit ce que le Trône suppose (éprouvée à part dans PGlite).
   Les attentes viennent de la PROMESSE, jamais du calcul du code. */
import { readFileSync } from 'node:fs';
import { CHAMPS_DU_DOSSIER, dossiersDuPersonnelStore, staffStore, type StaffMember } from '../src/apps/trone/routes/equipe/data';
import { variablesDuMois } from '../src/apps/trone/routes/equipe/variables-du-mois';
import {
  avertissementDeLaGrille, avertissementDuPlanning, candidaturesAEffacer, ceQuiAttendLaDirection, dateDuMois, dernierJourPropose,
  etapeDeLaProcedure, etapesDArrivee, piecesManquantes, poseLeConge, semaineDe, soldeDeToutCompte, sousLeSmig, statutDuJour,
  type Candidature, type FicheRh,
} from '../src/shared/rh-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const disque = (k: string): unknown => JSON.parse(localStorage.getItem(`trone::${k}`) ?? 'null');
const ecritures = (k: string): number => (globalThis as unknown as { __ecritures: Map<string, number> }).__ecritures.get(`trone::${k}`) ?? 0;

/* ── 1. LA FICHE SE RANGE EN DEUX ── */
const fiche = (id: string, o: Partial<StaffMember> = {}): StaffMember => ({
  id, branchId: 'b', name: id.toUpperCase(), role: 'Praticienne', phone: '', email: `${id}@x.bj`, since: '2026-01-05', auFauteuil: true,
  salaireXof: 150000, commPrestaXof: 0, commProduitXof: 0, primeXof: 0, satisfaction: 0, wellbeing: 0, charge: 0, risk: 'faible',
  riskDrivers: '', nextStep: '', recognition: '', statut: 'Présent', ...o,
} as StaffMember);
staffStore.set([fiche('a', { contractType: 'CDI', cnssNum: '1' }), fiche('z', { salaireXof: 90000 })]);
const publiques = disque('mnd_staff') as Record<string, unknown>[];
const dossiers = disque('mnd_team_dossiers') as Record<string, unknown>[];
dit('la fiche publique ne porte aucun champ privé', [], publiques.flatMap((p) => CHAMPS_DU_DOSSIER.filter((k) => k in p)));
dit('le dossier porte le salaire, le contrat, la CNSS, avec son id et sa branche', [150000, 'CDI', '1', 'a', 'b'],
  [dossiers[0].salaireXof, dossiers[0].contractType, dossiers[0].cnssNum, dossiers[0].id, dossiers[0].branchId]);
dit('l écran lit la fiche entière, comme avant', [150000, 90000, 'A'], [staffStore.get()[0].salaireXof, staffStore.get()[1].salaireXof, staffStore.get()[0].name]);
const e0 = ecritures('mnd_staff'), d0 = ecritures('mnd_team_dossiers');
staffStore.set((prev) => prev.map((m) => (m.id === 'a' ? { ...m, ordre: 1 } : m)));
dit('changer l ordre écrit la fiche publique, pas le dossier', [1, 0], [ecritures('mnd_staff') - e0, ecritures('mnd_team_dossiers') - d0]);
const e1 = ecritures('mnd_staff'), d1 = ecritures('mnd_team_dossiers');
staffStore.set((prev) => prev.map((m) => (m.id === 'z' ? { ...m, salaireXof: 95000 } : m)));
dit('changer un salaire écrit le dossier, pas la fiche publique', [0, 1], [ecritures('mnd_staff') - e1, ecritures('mnd_team_dossiers') - d1]);
const e2 = ecritures('mnd_staff'), d2 = ecritures('mnd_team_dossiers');
staffStore.set((prev) => prev.map((m) => ({ ...m })));
dit('réécrire les mêmes contenus n écrit rien (aucune poussée pour rien)', [0, 0], [ecritures('mnd_staff') - e2, ecritures('mnd_team_dossiers') - d2]);
dit('deux lectures sans changement rendent le même objet (React ne redessine pas)', true, staffStore.get() === staffStore.get());
dossiersDuPersonnelStore.set((prev) => [...prev, { id: 'orphelin', branchId: 'b', salaireXof: 1 }]);
staffStore.set((prev) => prev.filter((m) => m.id !== 'z'));
dit('une fiche retirée emporte son dossier ; un dossier arrivé avant sa fiche reste', ['a', 'orphelin'], (disque('mnd_team_dossiers') as { id: string }[]).map((d) => d.id).sort());
const sql = lis('supabase/migrations/0130_la_direction_des_ressources_humaines.sql');
const listeSql = /create or replace function public\.champs_du_dossier\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/.exec(sql)?.[1]?.match(/'([^']+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
dit('la liste des champs privés est la même dans le Trône et dans la base', [...CHAMPS_DU_DOSSIER].sort(), listeSql.sort());

/* ── 2. LES QUATRE FUITES ── */
const perso = sansCommentaires('src/apps/trone/routes/equipe/Personnel.tsx');
dit('① plus de colonne « Salaire · base » dans la liste', false, perso.includes('<th>Salaire · base</th>'));
dit('… et l écran des RH est au souverain seul', true, /if \(!isSouverain\) \{\s+return \(/.test(perso));
const paie = sansCommentaires('src/apps/trone/routes/equipe/Paie.tsx');
dit('② « la paie attend votre oui » part à la direction seule', [true, false], [paie.includes('void pushNotifyDirection('), paie.includes('pushNotifyStaff(')]);
const pn = sansCommentaires('supabase/functions/push-notify/index.ts');
dit('… et la fonction exige un compte du personnel avant de l envoyer au souverain', [true, true, true], [
  /if \(body\.mode === 'direction'\) \{\s+if \(!parLeService\(req\)\) \{[\s\S]{0,500}from\('staff'\)[\s\S]{0,200}return json\(\{ error: 'forbidden' \}, 403\);/.test(pn),
  /mode === 'direction'[\s\S]{0,900}sendToDirection\(/.test(pn), pn.includes("const VERSION = '2026-10-31-a';"),
]);
dit('③ la base : le dossier au souverain ou à elle, les primes au souverain', [true, true, true], [
  sql.includes('using (public.is_souverain() or public.est_ma_fiche(id));'),
  sql.includes("using (public.is_staff() and (not (key = any(public.cles_rh_privees())) or public.is_souverain()));"),
  sql.includes("select array['mnd_paie_overrides', 'mnd_primes', 'mnd_paie_confirm', 'mnd_retenues']::text[]"),
]);
dit('④ le pointage : chacune le sien, la direction corrige', [true, true], [
  sql.includes("with check (public.est_direction() or public.est_ma_fiche(data ->> 'employeeId'));"),
  sql.includes("create policy pointage_retirer on public.attendance for delete to authenticated\n  using (public.est_direction());"),
]);
dit('la garde de team déplace le privé (souverain) ou le jette (autre)', [true, true], [
  /if auth\.uid\(\) is null or public\.is_souverain\(\) then[\s\S]{0,600}insert into public\.team_dossiers/.test(sql),
  /end if;\n    new\.data := new\.data - public\.champs_du_dossier\(\);\n  end if;/.test(sql),
]);
dit('les congés : elle ne demande que pour elle, en « demande »', true,
  sql.includes("and data ->> 'status' = 'demande' and coalesce(data ->> 'decidedBy', '') = ''));\ndrop policy if exists conges_modifier"));
dit('son prêt, ses bulletins, son dossier partagé : lus par elle', [true, true, true], [
  sql.includes("using (public.est_ma_fiche(data ->> 'personneId'));"),
  sql.includes("using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'));\ndrop policy if exists bulletins_ecrire"),
  sql.includes("(storage.foldername(name))[2] = 'partage' and public.est_ma_fiche((storage.foldername(name))[1])"),
]);
dit('la déconnexion efface aussi les dossiers, le registre et les bulletins du poste', true,
  sansCommentaires('src/shared/auth.ts').includes("'mnd_team_dossiers', 'mnd_rh', 'mnd_bulletins',"));

/* ── 3. LE RUN DE PAIE REPREND LE MOIS ── */
const v = variablesDuMois({
  staffId: 'a', period: '2026-10',
  primes: { a: [{ id: 'p1', type: 'performance', amountXof: 5000, date: '2026-10-01', note: 'Seuil shampoings' }, { id: 'p2', type: 'nuit', amountXof: 9000, date: '2026-09-30' }] },
  retenues: { a: [{ id: 'r1', type: 'absence_non_rem', amountXof: 6000, date: '2026-10-09', days: 1 }] },
  tips: [{ id: 't1', staffId: 'a', amountXof: 2000, date: '2026-10-03' }, { id: 't2', staffId: 'b', amountXof: 7000, date: '2026-10-03' }, { id: 't3', staffId: 'a', amountXof: 1500, date: '2026-10-20' }],
  primeDePointsXof: 10000,
});
dit('primes du mois et prime de points, pourboires à elle, retenues : rien d un autre mois', [15000, 3500, 6000], [v.prime, v.pourboires, v.retenues]);
dit('chaque chiffre garde sa provenance', ['prime', 'points', 'pourboires', 'retenue'], v.origines.map((o) => o.quoi));
dit('le run lit les variables et les pose sur la ligne', [true, true, true], [
  paie.includes('const v = variablesDuMois({ staffId: s.id, period, primes, retenues, tips: asArray(tips), primeDePointsXof: points.primeXof });'),
  paie.includes('base: s.salaireXof ?? 0, heuresSup: 0, prime: (s.primeXof ?? 0) + v.prime, pourboires: v.pourboires,'),
  paie.includes('...(v.origines.length ? { origines: v.origines } : {}),'),
]);
dit('les bulletins se publient à « payé » et à la clôture ; le bulletin s ouvre sans montants dans l adresse', [true, true, false], [
  paie.includes("if (next === 'paye' || next === 'cloture') publieLesBulletins();"),
  paie.includes("onClick={() => ouvreLeBulletin(asset('/bulletin.html'), bulletinFor(l))}"),
  paie.includes('href={bulletinFor(l)}'),
]);
dit('bulletin.html lit le dépôt par sa clé', true, lis('bulletin.html').includes("localStorage.getItem('mnd_bulletin_' + k)"));
dit('le bloc éteint de la paie est rallumé', false, perso.includes('{false && tab ==='));

/* ── 4. LES RÈGLES ── */
const f = (o: Partial<FicheRh>): FicheRh => ({ id: 'f', name: 'F', role: 'Praticienne', ...o });
dit('dossier d une salariée sans rien : adresse, contrat, aptitude, urgence, CNSS', ['adresse', 'contrat', 'aptitude', 'urgence', 'cnss'], piecesManquantes(f({ contractType: 'CDI' }), []));
dit('une prestataire reliée avec un contact : rien ne manque', [], piecesManquantes(f({ contractType: 'prestataire', email: 'p@x.bj', urgence: { nom: 'S', telephone: '01' } }), []));
const grille = (niveau?: 'formation' | 'autonome') => ({ nom: 'A', competences: niveau ? { c1: { niveau, le: '2026-10-01' } } : { autre: { niveau: 'autonome' as const, le: '2026-10-01' } } });
const nomF = () => 'Création';
dit('la grille avertit quand aucune main n est autonome', true, !!avertissementDeLaGrille({ familles: ['c1'], mains: [grille('formation')], nomDeLaFamille: nomF }));
dit('… se tait quand une main l est', null, avertissementDeLaGrille({ familles: ['c1'], mains: [grille('formation'), { ...grille('autonome'), nom: 'B' }], nomDeLaFamille: nomF }));
dit('… se tait quand une main n a pas de grille (on ne devine pas)', null, avertissementDeLaGrille({ familles: ['c1'], mains: [grille('formation'), { nom: 'B' }], nomDeLaFamille: nomF }));
dit('… avertit quand la famille manque à la grille posée', true, !!avertissementDeLaGrille({ familles: ['c1'], mains: [grille()], nomDeLaFamille: nomF }));
const planning = poseLeConge({ modele: { a: ['fauteuil', 'fauteuil', 'repos', 'fauteuil', 'fauteuil', 'fauteuil', ''] } }, 'a', '2026-10-17', '2026-10-20');
dit('le congé posé passe la fin de semaine ; le modèle vaut ailleurs', ['fauteuil', 'conge', 'conge', 'conge', 'repos'],
  ['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20', '2026-10-21'].map((d) => statutDuJour(planning, 'a', d)));
dit('la semaine d un écart reprend le modèle pour les autres jours', ['fauteuil', 'fauteuil', 'repos', 'fauteuil', 'fauteuil', 'conge', 'conge'], semaineDe(planning, 'a', '2026-10-12'));
dit('le planning signale une main en repos, pas une main au fauteuil', [true, null],
  [!!avertissementDuPlanning({ planning, date: '2026-10-21', mains: [{ id: 'a', nom: 'A' }] }), avertissementDuPlanning({ planning, date: '2026-10-16', mains: [{ id: 'a', nom: 'A' }] })]);
dit('la procédure suit ses étapes ; « pas de suite » la clôt', [1, 2, 3, 4, 5, 5], [
  etapeDeLaProcedure({}), etapeDeLaProcedure({ explicationDemandeeLe: '2026-10-01' }),
  etapeDeLaProcedure({ explicationDemandeeLe: '2026-10-01', reponseLe: '2026-10-03' }),
  etapeDeLaProcedure({ explicationDemandeeLe: '2026-10-01', reponseLe: '2026-10-03', decision: 'avertissement' }),
  etapeDeLaProcedure({ explicationDemandeeLe: '2026-10-01', reponseLe: '2026-10-03', decision: 'avertissement', lettre: 'D-2026-004' }),
  etapeDeLaProcedure({ decision: 'aucune' }),
]);
const cand = (id: string, etape: Candidature['etape'], reponduLe?: string) => ({ id, genre: 'candidature', etape, reponduLe, recueLe: '2026-01-01' }) as Candidature;
dit('une candidature non retenue se propose à l effacement après la garde ; une retenue jamais', ['c1'],
  candidaturesAEffacer([cand('c1', 'non-retenue', '2026-03-01'), cand('c2', 'non-retenue', '2026-09-01'), cand('c3', 'retenue', '2026-01-02')], undefined, '2026-10-14').map((c) => c.id));
dit('un délai légal non réglé ne se devine pas ; réglé, il se pose', [undefined, '2026-11-13'],
  [dernierJourPropose('2026-10-14', 'Praticienne', {}), dernierJourPropose('2026-10-14', 'Praticienne', { preavisJours: { Praticienne: 30 } })]);
dit('l obligation du mois : le 5 d après, le 31 se rabat sur le dernier jour', ['2026-11-05', '2027-02-28', undefined], [dateDuMois(5, '2026-10-14'), dateDuMois(31, '2027-02-01'), dateDuMois(undefined, '2026-10-14')]);
dit('le solde de tout compte : 7 jours sur 156 000 F de base, et le reste du prêt', { congesJours: 7, indemniteCongesEstimeeXof: 42000, resteDuPretXof: 45000 },
  soldeDeToutCompte({ baseXof: 156000, congesRestants: 7, resteDuPretXof: 45000 }));
dit('sous le salaire minimum (52 000 F) : un CDI à 45 000 se dit, une apprentie non', [true, false, false],
  [sousLeSmig(45000, 'CDI'), sousLeSmig(45000, 'apprentissage'), sousLeSmig(52000, 'CDI')]);
dit('la liste d arrivée : le réglage par fonction l emporte ; sans lui, pas d étape du fauteuil hors fauteuil', [['contrat', 'cnss'], false],
  [etapesDArrivee('Accueil', false, { Accueil: ['contrat', 'cnss'] }).map((e) => e.cle), etapesDArrivee('Accueil', false).some((e) => e.cle === 'protocoles')]);
const attend = ceQuiAttendLaDirection({
  fiches: [f({ id: 'e', name: 'E', email: 'e@x.bj', urgence: { nom: 'S', telephone: '01' }, contractType: 'CDI', cnssNum: '9', aptitude: { apte: true, le: '2026-09-01' }, finEssai: '2026-10-23' }),
    f({ id: 'm', name: 'M', email: 'm@x.bj', urgence: { nom: 'S', telephone: '01' }, contractType: 'CDD', cnssNum: '8', aptitude: { apte: true, le: '2026-09-01' }, finContrat: '2026-11-07' })],
  conges: [{ id: 'l1', employeeId: 'e', status: 'demande', startDate: '2026-11-02', endDate: '2026-11-06' }],
  registre: [{ id: 'p', genre: 'piece', staffId: 'e', type: 'contrat' } as never, { id: 'q', genre: 'piece', staffId: 'm', type: 'contrat' } as never],
  reglages: { cnssJour: 15 }, jour: '2026-10-14',
});
dit('ce qui attend la direction : l essai, le CDD, le congé, la CNSS du mois', ['cnss', 'conge:l1', 'essai:e', 'cdd:m'].sort(), attend.map((i) => i.cle.startsWith('ob:cnss') ? 'cnss' : i.cle).sort());

const avecEntretien = ceQuiAttendLaDirection({
  fiches: [f({ id: 'e', name: 'E', email: 'e@x.bj', urgence: { nom: 'S', telephone: '01' }, finEssai: '2026-10-23' })], conges: [],
  registre: [{ id: 'x', genre: 'entretien', staffId: 'e', type: 'fin-essai', prevuLe: '2026-10-23' } as never], jour: '2026-10-14',
});
dit('une fin d essai déjà posée en entretien ne se compte qu une fois', ['ent:x'], avecEntretien.map((i) => i.cle));

/* ── 5. L'ÉCRAN ── */
const agenda = sansCommentaires('src/apps/trone/routes/clients/_shared.tsx');
dit('l agenda AVERTIT par la grille et le planning, sans bloquer', [true, true, false], [
  agenda.includes('const grille = avertissementDeLaGrille({'), agenda.includes('{avertRh.map((t) => ('), /avertRh[\s\S]{0,200}return false/.test(agenda),
]);
dit('un congé accordé se pose au planning', true, sansCommentaires('src/apps/trone/routes/equipe/TempsAbsences.tsx').includes("if (l && status === 'approuve') planningStore.set((p) => poseLeConge(p, l.employeeId, l.startDate, l.endDate));"));
dit('Mon espace se relie par l adresse, comme la base', true, sansCommentaires('src/apps/trone/routes/equipe/MonMois.tsx').includes('<MonEspace moi={moi} relie={!!moi && !!monMail && adresseDe(moi) === monMail} />'));
dit('« À faire » porte le rappel des RH', true, sansCommentaires('src/apps/trone/routes/pilotage/AFaire.tsx').includes('<RappelDesRh />'));
const ecrans = ['_ui', 'Aujourdhui', 'Dossier', 'Recrutement', 'ArriveesDeparts', 'Planning', 'Competences', 'Entretiens', 'Discipline', 'Obligations', 'MonEspace', 'RappelDesRh']
  .map((n) => [n, sansCommentaires(`src/apps/trone/routes/equipe/rh/${n}.tsx`)] as const);
dit('aucun tiret cadratin dans ce que les écrans RH disent', [], ecrans.filter(([, s]) => s.includes('—')).map(([n]) => n));
dit('aucun « salon » dans ce que les écrans RH disent', [], ecrans.filter(([, s]) => /\bsalon\b/i.test(s.replace(/'[^'\n]*salon[^'\n]*'/g, ''))).map(([n]) => n));

console.log(ko === 0 ? '\nLa direction des RH tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
