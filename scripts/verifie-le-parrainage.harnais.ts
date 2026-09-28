import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  FORME_DU_CODE, SIGNES_DU_CODE, codeDeMarraine, racineDuCode, lienDuParrainage,
} from '../src/shared/parrainage-pur';
import {
  marrainesEtFilleules, cadeauDu, codesAAttribuer, resumeDuParrainage, soinsAPoser, soinUtilise,
  type DemandeParrainee, type FicheLue,
} from '../src/shared/parrainage';
import { soinsEnAttente } from '../src/shared/parrainage-pur';
import { INGREDIENTS, AVANT_APRES, COMMUNAUTE } from '../src/apps/revelateur/communaute';

/* LA COMMUNAUTÉ MND, ÉPROUVÉE — 28 septembre 2026.

   Ce harnais tient la RÈGLE, pas le cas du jour :

     (1) un code de marraine a TOUJOURS la forme PRENOM-XXX, quel que soit
         le prénom (accents, tirets, vide), et la forme refuse les signes
         ambigus : on l'éprouve dans les deux sens ;
     (2) la fonction Edge porte la MÊME forme et les MÊMES signes que le
         site et le Trône (deux rives, une couture) ;
     (3) la fonction ne donne le cadeau qu'à une nouvelle cliente : elle
         cherche la marraine, le même numéro, un parrainage déjà reçu, une
         fiche existante, et elle ne cherche un code de marraine que si
         AUCUNE offre ne l'a reconnu ;
     (4) le Trône range chaque filleule sous SA marraine, lit la visite dans
         l'agenda, et ne dit un cadeau dû qu'après une visite honorée et
         tant qu'il n'a pas été remis ;
     (5) le site : chaque ingrédient a sa page et sa place au plan, chaque
         motif appelé existe dans public/assets/motifs/ (les patterns réels,
         jamais dessinés), et toute photo d'avant / après ou d'ingrédient
         est inscrite au registre des accords AVANT de sortir.

   Lance : node scripts/verifie-le-parrainage.mjs (après genere-revelateur). */

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── (1) La forme du code ── */
const prenoms = ['Aïcha', 'Sènami', 'Marie-Ève', 'Grâce', '', '  ', 'Ẹ̀bún', 'Jean Baptiste Emmanuel', "N'Deye", '12345'];
const hasards = [() => 0, () => 0.999999, Math.random];
const codes = prenoms.flatMap((p) => hasards.map((h) => codeDeMarraine(p, h)));
dit('chaque code a la forme PRENOM-XXX', [], codes.filter((c) => !FORME_DU_CODE.test(c)));
dit('les accents tombent (Sènami)', 'SENAMI', racineDuCode('Sènami'));
dit('un prénom vide donne MND', 'MND', racineDuCode(''));
dit('six lettres au plus', 'JEANBA', racineDuCode('Jean Baptiste'));
dit('le plus grand hasard reste dans les signes', true, /-[A-Z2-9]{3}$/.test(codeDeMarraine('Ada', () => 0.9999999)));
dit('… et la forme REFUSE un O, un 0, un I, un 1, un L, des minuscules', [false, false, false, false, false, false],
  ['AICHA-7KO', 'AICHA-7K0', 'AICHA-IK2', 'AICHA-1K2', 'AICHA-LK2', 'aicha-7k2'].map((c) => FORME_DU_CODE.test(c)));
dit('… et REFUSE un code d’offre ordinaire', false, FORME_DU_CODE.test('RENTREE10'));
dit('aucun signe ambigu dans l’alphabet', [], [...'O0I1L'].filter((c) => SIGNES_DU_CODE.includes(c)));
dit('le lien partagé pose le code sur la réservation', 'https://exemple.test/reserver/?code=AICHA-7K2', lienDuParrainage('https://exemple.test', 'AICHA-7K2'));

/* ── (2) et (3) La fonction Edge ── */
const edge = readFileSync('supabase/functions/demande-submit/index.ts', 'utf8');
const sansCommentaires = edge.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const signesEdge = /const SIGNES_DU_CODE = '([^']+)'/.exec(sansCommentaires)?.[1];
const formeEdge = /const FORME_DU_CODE = (\/.+\/);/.exec(sansCommentaires)?.[1];
dit('Edge : les mêmes signes', SIGNES_DU_CODE, signesEdge);
dit('Edge : la même forme', String(FORME_DU_CODE), formeEdge);
dit('Edge : le mode parrainage répond avant le genre', true,
  sansCommentaires.indexOf('body.parrainage === true') > -1
  && sansCommentaires.indexOf('body.parrainage === true') < sansCommentaires.indexOf("const genre = String(body.genre"));
dit('Edge : le code de marraine n’est cherché que si aucune offre ne le connaît', true,
  /if \(duCode\.raison === 'inconnu'\) \{\s*duCode = \(await verdictDuParrainage\(/.test(sansCommentaires));
const verdict = sansCommentaires.slice(sansCommentaires.indexOf('async function verdictDuParrainage'), sansCommentaires.indexOf('async function codePourLaMarraine'));
dit('Edge : refuse la marraine elle-même', true, verdict.includes("raison: 'parrainage-soi-meme'"));
dit('Edge : refuse un second parrainage du même numéro', true, verdict.includes("raison: 'parrainage-deja-utilise'"));
dit('Edge : refuse une cliente déjà connue', true, verdict.includes('await dejaCliente(telephone)') && verdict.includes("raison: 'parrainage-deja-cliente'"));
dit('Edge : le cadeau ne se donne qu’en DERNIER, après les trois refus', true,
  verdict.lastIndexOf("raison: 'parrainage'") > verdict.indexOf('await dejaCliente(telephone)'));
dit('Edge : une pause au Trône ferme le parrainage', true, verdict.includes('reglage.actif === false') && sansCommentaires.includes("json({ error: 'parrainage_ferme' }, 409)"));
dit('Edge : la demande garde la marraine', true, /parrainDe: duCode\.code, marraineId: duCode\.marraineId/.test(sansCommentaires));
dit('Edge : la note du rendez-vous dit le cadeau', true, sansCommentaires.includes("v.raison === 'parrainage') return `parrainée par"));
dit('Edge : un même numéro retrouve son code', true, /\.eq\('data->>telephone', telephone\)\.not\('data->>codeParrain', 'is', null\)/.test(sansCommentaires));

/* ── Le site dit chaque issue (la page de réservation) ── */
const reserver = readFileSync('src/apps/revelateur/ilots/Reserver.tsx', 'utf8');
dit('la réservation dit les quatre issues du parrainage', [],
  ['parrainage', 'parrainage-soi-meme', 'parrainage-deja-cliente', 'parrainage-deja-utilise'].filter((r) => !reserver.includes(`recu.codeRaison === '${r}'`)));

/* ── (4) Le Trône ── */
const d = (o: Partial<DemandeParrainee> & { id: string }): DemandeParrainee => ({
  genre: 'prospect', createdAt: '2026-10-01T10:00:00Z', branchId: 'b1', prenom: 'X', telephone: '+2290100000000',
  besoin: 'inconnu', source: 'site', consentementLe: '2026-10-01T10:00:00Z', statut: 'nouvelle', ...o,
} as DemandeParrainee);
const demandes = [
  d({ id: 'm1', prenom: 'Aïcha', codeParrain: 'AICHA-7K2', createdAt: '2026-10-01T09:00:00Z' }),
  d({ id: 'm2', prenom: 'Nadège', codeParrain: 'NADEGE-3PQ', createdAt: '2026-10-02T09:00:00Z' }),
  d({ id: 'f1', prenom: 'Sènami', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'AICHA-7K2', apptId: 'r1', createdAt: '2026-10-03T09:00:00Z' }),
  d({ id: 'f2', prenom: 'Rama', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'AICHA-7K2', apptId: 'r2', createdAt: '2026-10-04T09:00:00Z' }),
  d({ id: 'f3', prenom: 'Grâce', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'AICHA-7K2', apptId: 'r3', cadeauMarraineRemisLe: '2026-10-09T09:00:00Z', createdAt: '2026-10-02T09:00:00Z' }),
  /* Refusées par la fonction : elles ne sont PAS des filleules. */
  d({ id: 'x1', genre: 'rdv', codeRaison: 'parrainage-deja-cliente', parrainDe: undefined, code: 'AICHA-7K2' }),
  d({ id: 'x2', genre: 'rdv', codeRaison: 'parrainage-soi-meme', code: 'NADEGE-3PQ' }),
  /* Un code de marraine mal formé n'est pas une marraine. */
  d({ id: 'x3', codeParrain: 'rentree10' }),
];
const rdvs = [
  { id: 'r1', status: 'honoré', date: '2026-10-08' },
  { id: 'r2', status: 'en attente', date: '2026-10-20' },
  { id: 'r3', status: 'honoré', date: '2026-10-06' },
];
const liste = marrainesEtFilleules(demandes, rdvs);
dit('deux marraines, la plus récente d’abord', ['m2', 'm1'], liste.map((m) => m.id));
const aicha = liste.find((m) => m.code === 'AICHA-7K2');
dit('Aïcha a trois filleules, les refusées exclues', ['f2', 'f1', 'f3'], aicha?.filleules.map((f) => f.demande.id));
dit('la visite se lit dans l’agenda', ['a-venir', 'venue', 'venue'], aicha?.filleules.map((f) => f.visite));
dit('le cadeau n’est dû qu’après une visite honorée, et une seule fois', ['f1'], aicha?.filleules.filter(cadeauDu).map((f) => f.demande.id));
dit('Nadège n’a aucune filleule (son propre code ne compte pas)', 0, liste.find((m) => m.code === 'NADEGE-3PQ')?.filleules.length);
dit('un rendez-vous annulé ne rend aucun cadeau dû', false,
  cadeauDu(marrainesEtFilleules([demandes[0], { ...demandes[2], apptId: 'r9' }], [{ id: 'r9', status: 'annulé', date: '2026-10-08' }])[0].filleules[0]));

/* ── (5) Le site servi ── */
const SORTIE = 'revelateur';
const lit = (chemin: string) => {
  const f = `${SORTIE}${chemin}index.html`;
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
};
dit('chaque ingrédient a sa page', [], INGREDIENTS.filter((i) => !lit(`/ingredients/${i.slug}/`)).map((i) => i.slug));
const plan = lit('/plan-du-site/');
dit('… et sa place au plan du site', [], INGREDIENTS.filter((i) => !plan.includes(`/ingredients/${i.slug}/`)).map((i) => i.slug));
const accueil = lit('/');
dit('l’accueil porte la communauté, le parrainage et les ingrédients', [true, true, true],
  ['id="communaute"', 'id="parrainage"', 'id="ingredients"'].map((x) => accueil.includes(x)));
dit('… dans l’ordre voulu : parrainage après la carte cadeau, communauté avant le Journal', true,
  accueil.indexOf('id="offrir"') < accueil.indexOf('id="parrainage"')
  && accueil.indexOf('id="parrainage"') < accueil.indexOf('id="maison"')
  && accueil.indexOf('id="communaute"') < accueil.indexOf('id="journal"'));
dit('l’avant / après ne sort pas tant qu’il n’a pas de paires', AVANT_APRES.length > 0, accueil.includes('id="avant-apres"'));
dit('chaque carte de la communauté mène à une page écrite', [], COMMUNAUTE.cartes.filter((c) => !lit(c.vers)).map((c) => c.vers));
dit('la page testeuse monte le formulaire, profil posé', true, /data-ilot="demande"[^>]*data-profil="Testeuse"/.test(lit('/testeuse/')));
dit('la page parrainage monte l’îlot', true, lit('/parrainage/').includes('data-ilot="parrainer"'));

/* LES PATTERNS RÉELS : tout motif appelé existe. On lit le HTML servi ET la
   feuille, pour qu'un nom de tuile mal tapé ne passe nulle part. */
const feuille = readFileSync('src/apps/revelateur/revelateur.css', 'utf8');
const servis = readdirSync(SORTIE, { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => readFileSync(`${SORTIE}/${f}`, 'utf8')).join('\n');
const appeles = [...new Set([...(feuille + servis).matchAll(/\/assets\/motifs\/([a-z0-9-]+\.png)/g)].map((m) => m[1]))];
dit('au moins les sept motifs de la communauté sont appelés', true, appeles.length >= 7);
dit('… et chaque motif appelé existe dans public/assets/motifs/', [], appeles.filter((f) => !existsSync(`public/assets/motifs/${f}`)));
const communauteCss = feuille.slice(feuille.indexOf('LA COMMUNAUTÉ MND — 28 septembre 2026'));
dit('aucun motif dessiné en CSS dans la communauté (pas de radial en cercles)', false, /radial-gradient\(circle/.test(communauteCss));

/* LES PHOTOS : registre des accords d'abord. */
const registre = readFileSync('docs/site-revelateur/photos.md', 'utf8');
const inscrite = (f: string) => registre.includes('`' + f + '`');
const photosCommunaute = [...AVANT_APRES.flatMap((a) => [a.avant, a.apres]), ...INGREDIENTS.map((i) => i.photo).filter(Boolean) as string[]];
dit('toute photo de l’avant / après ou d’un ingrédient existe', [], photosCommunaute.filter((f) => !existsSync(`public/assets/photos/site/${f}`)));
dit('… et porte sa ligne au registre des accords', [], photosCommunaute.filter((f) => !inscrite(f)));
dit('… et le contrôle du registre CRIE sur une photo non inscrite', false, inscrite('avant-inconnue-000.jpg'));

/* ══ (6) LA CARTE DE CHAQUE CLIENTE — 28 septembre 2026 ═════════════════
   Toute fiche a son code ; un code ne se partage jamais ; le même code sort
   sur tous les postes ; une cliente qui l'avait demandé sur le site le
   garde ; un soin par amie venue, jamais deux ; la caisse le consomme une
   fois ; la base le protège. */
const fiche = (o: Partial<FicheLue> & { id: string }): FicheLue => ({ name: 'Aïcha K.', phone: '+2290100000000', since: '2019-03-01', ...o } as FicheLue);
const foule = Array.from({ length: 60 }, (_, i) => fiche({ id: `c${String(i).padStart(3, '0')}`, name: i % 2 ? 'Aïcha Test' : 'Grâce', phone: `+22901${String(10000000 + i)}` }));
const codesFoule = codesAAttribuer(foule, []);
dit('chaque fiche vivante reçoit un code', 60, codesFoule.length);
dit('… chacun a la forme PRENOM-XXX', [], codesFoule.filter((c) => !FORME_DU_CODE.test(c.code)).map((c) => c.code));
dit('… et aucun ne se répète, même à trente prénoms identiques', 60, new Set(codesFoule.map((c) => c.code)).size);
dit('… et le même code sort sur tous les postes (ordre des fiches indifférent)', JSON.stringify([...codesFoule].sort((a, b) => a.clientId.localeCompare(b.clientId))),
  JSON.stringify([...codesAAttribuer([...foule].reverse(), [])].sort((a, b) => a.clientId.localeCompare(b.clientId))));
dit('… et il vient de son prénom', true, codesFoule.find((c) => c.clientId === 'c001')?.code.startsWith('AICHA-'));
const avecDeja = [fiche({ id: 'x1', codeParrain: 'AICHA-7K2' }), fiche({ id: 'x2', name: 'Aïcha B.', phone: '+2290199999999' }), fiche({ id: 'x3', archived: true, phone: '+2290188888888' })];
const codesDeja = codesAAttribuer(avecDeja, []);
dit('une fiche qui a déjà son code le garde, une fiche archivée n’en reçoit pas', ['x2'], codesDeja.map((c) => c.clientId));
dit('… et le nouveau code évite celui qui existe', true, codesDeja[0]?.code !== 'AICHA-7K2');
const duSite = [d({ id: 'ds1', prenom: 'Rama', telephone: '+2290166666666', codeParrain: 'RAMA-4HX' })];
dit('une cliente qui a demandé son code sur le site GARDE ce code', [{ clientId: 'r1', code: 'RAMA-4HX' }],
  codesAAttribuer([fiche({ id: 'r1', name: 'Rama D.', phone: '01 66 66 66 66' })], duSite));
dit('… mais jamais deux fiches pour un même code du site', 1,
  codesAAttribuer([fiche({ id: 'r1', name: 'Rama D.', phone: '0166666666' }), fiche({ id: 'r2', name: 'Rama E.', phone: '+229 01 66 66 66 66' })], duSite).filter((c) => c.code === 'RAMA-4HX').length);
dit('… et un code neuf n’emprunte jamais celui d’une marraine du site', false,
  codesAAttribuer([fiche({ id: 'z1', name: 'Rama', phone: '+2290155555555' })], duSite).some((c) => c.code === 'RAMA-4HX'));

/* ── Les marraines du Trône, et leurs filleules ── */
const fiches = [
  fiche({ id: 'adjoa', name: 'Adjoa Mensah', phone: '+2290170000000', codeParrain: 'ADJOA-7K2', since: '2019-01-01' }),
  fiche({ id: 'ines', name: 'Inès', phone: '+2290171000000', codeParrain: 'INES-3PQ', since: '2020-01-01' }),
];
const dems = [
  d({ id: 'g1', prenom: 'Grâce Houénou', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a1', createdAt: '2026-10-05T09:00:00Z' }),
  d({ id: 'g2', prenom: 'Rama', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a2', createdAt: '2026-10-06T09:00:00Z' }),
  d({ id: 'g3', prenom: 'Nadia', genre: 'rdv', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a3', cadeauMarraineRemisLe: '2026-10-08T09:00:00Z', createdAt: '2026-10-04T09:00:00Z' }),
];
const rdvsC = [{ id: 'a1', status: 'honoré', date: '2026-10-12' }, { id: 'a2', status: 'confirmé', date: '2026-10-20' }, { id: 'a3', status: 'honoré', date: '2026-10-07' }];
const mTrone = marrainesEtFilleules(dems, rdvsC, fiches);
dit('une fiche dont le code a servi est une marraine ; une fiche sans filleule n’encombre pas', ['adjoa'], mTrone.map((m) => m.id));
dit('… avec son prénom et ses trois filleules', ['Adjoa', 3], [mTrone[0]?.prenom, mTrone[0]?.filleules.length]);
const resume = resumeDuParrainage('ADJOA-7K2', dems, rdvsC);
dit('le résumé de Ma Couronne ne porte qu’un prénom, un état, une date', [], resume.filleules.flatMap((f) => Object.keys(f).filter((k) => !['prenom', 'etat', 'date'].includes(k))));
dit('… le prénom seul, jamais le nom', ['Rama', 'Grâce', 'Nadia'], resume.filleules.map((f) => f.prenom));

/* ── Le soin offert ── */
const reglageTest = { cadeauMarraine: 'un lavage offert', soinMarraineServiceId: 'svc-dandan' };
const gestes1 = soinsAPoser(fiches, dems, rdvsC, reglageTest, '2026-10-12', (id) => (id === 'svc-dandan' ? 'DÀNDÀN™' : undefined));
dit('une amie venue pose UN soin sur la fiche de sa marraine', ['g1'], gestes1.map((g) => g.demandeId));
dit('… à l’identifiant de la demande de l’amie, à la prestation choisie, au nom du catalogue',
  { id: 'parr-g1', serviceId: 'svc-dandan', libelle: 'DÀNDÀN™', raison: 'Pour la venue de Grâce' },
  { id: gestes1[0]?.soin?.id, serviceId: gestes1[0]?.soin?.serviceId, libelle: gestes1[0]?.soin?.libelle, raison: gestes1[0]?.soin?.raison });
dit('… et un remerciement reste à envoyer', true, gestes1[0]?.merci);
const fichesAvecSoin = fiches.map((f) => (f.id === 'adjoa' ? { ...f, soinsOfferts: [gestes1[0]!.soin!] } : f));
const gestes2 = soinsAPoser(fichesAvecSoin, dems, rdvsC, reglageTest, '2026-10-12');
dit('un soin déjà posé ne se repose pas (deux postes, un soin)', [undefined], gestes2.map((g) => g.soin));
const demsMarquees = dems.map((x) => (x.id === 'g1' ? { ...x, cadeauMarraineRemisLe: '2026-10-12', merciEnvoyeLe: '2026-10-12' } : x));
dit('… et une demande marquée ne rend plus rien', 0, soinsAPoser(fichesAvecSoin, demsMarquees, rdvsC, reglageTest, '2026-10-12').length);
dit('sans prestation choisie, le soin prend la phrase de la Maison', 'un lavage offert',
  soinsAPoser(fiches, dems, rdvsC, { cadeauMarraine: 'un lavage offert' }, '2026-10-12')[0]?.soin?.libelle);
const utilise1 = soinUtilise([gestes1[0]!.soin!], 'parr-g1', 'MND-0042', '2026-10-20');
const utilise2 = soinUtilise(utilise1, 'parr-g1', 'MND-0099', '2026-11-02');
dit('la caisse consomme le soin une fois, avec sa pièce', { utiliseLe: '2026-10-20', piece: 'MND-0042' }, { utiliseLe: utilise2[0].utiliseLe, piece: utilise2[0].piece });
dit('… et un soin consommé ne s’offre plus', 0, soinsEnAttente(utilise2).length);

/* ── La base protège les champs (0110) ── */
const migration = readFileSync('supabase/migrations/0110_la_carte_de_marraine.sql', 'utf8');
const sqlSansCommentaires = migration.replace(/--.*$/gm, '');
dit('0110 : l’éditeur SQL et la clé de service gardent la main', true, /if auth\.uid\(\) is null then return new;/.test(sqlSansCommentaires));
dit('0110 : le personnel aussi', true, /if public\.is_staff\(\) then return new;/.test(sqlSansCommentaires));
dit('0110 : le code, le résumé et les soins sont réimposés', true,
  ['codeParrain', 'parrainage', 'soinsOfferts'].every((k) => sqlSansCommentaires.includes(`'${k}', old.data -> '${k}'`)));
dit('0110 : le modèle de carte reste libre', false, sqlSansCommentaires.includes("'carteModele'"));
dit('0110 : garde l’insertion comme la mise à jour', true, /before insert or update on public\.clients/.test(sqlSansCommentaires));

/* ── La fonction : la fiche d'abord, le prénom seul ── */
const qui = sansCommentaires.slice(sansCommentaires.indexOf('async function quiOffre'), sansCommentaires.indexOf('async function previensLaMarraine'));
dit('Edge : « qui » ne rend que le prénom et le cadeau, jamais le numéro', true,
  /json\(\{ ok: true, prenom: m\.prenom, cadeau: /.test(qui) && !/telephone/.test(qui.slice(qui.indexOf('json({ ok: true'))));
const duCode = sansCommentaires.slice(sansCommentaires.indexOf('async function marraineDuCode'), sansCommentaires.indexOf('async function verdictDuParrainage'));
dit('Edge : la marraine se cherche parmi les fiches AVANT les demandes', true,
  duCode.indexOf("from('clients')") > -1 && duCode.indexOf("from('clients')") < duCode.indexOf("from('demandes')"));
dit('Edge : une cliente qui demande son code sur le site reçoit celui de sa fiche', true,
  /const saFiche = \(fiches \?\? \[\]\)\.find/.test(sansCommentaires) && sansCommentaires.indexOf('const saFiche') < sansCommentaires.indexOf("const { data: siens }"));
dit('Edge : la marraine n’est prévenue que si le modèle est posé', true, /if \(!MODELE\) return 'sans-modele';/.test(sansCommentaires));

/* ── Le Trône : ce qui écrit, et quand ── */
const hook = readFileSync('src/apps/trone/shell/useParrainageVivant.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('le Trône n’écrit rien avant d’avoir lu fiches, demandes et carnet', true,
  /!tablePrete\('clients'\) \|\| !tablePrete\('demandes'\) \|\| !tablePrete\('appointments'\)/.test(hook));
dit('… ni les soins avant le réglage', true, /if \(!documentDescendu\('mnd_parrainage'\)\) return;/.test(hook));
dit('… et ne remercie que si la Maison l’a allumé', true, /reglage\.merciParWhatsApp \? gestes\.filter/.test(hook));
dit('le crochet est monté dans le Trône', true, /useParrainageVivant\(\);/.test(readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8')));
const caisse = readFileSync('src/apps/trone/routes/vente/Caisse.tsx', 'utf8');
dit('la caisse ne consomme le soin qu’à l’encaissement, ligne encore offerte, avec la pièce', true,
  /if \(soinPose && clientId && cart\[soinPose\.cle\]\?\.disc === 100\)/.test(caisse) && /soinUtilise\(c\.soinsOfferts, idSoin, inv\.number, dateVente\)/.test(caisse));
const envoi = readFileSync('supabase/functions/whatsapp-envoi/index.ts', 'utf8');
dit('whatsapp-envoi sait porter une image en en-tête', true, /\{ type: 'image', image: \{ id: mediaId \} \}/.test(envoi));

/* ── La carte : le QR mène à la réservation, le logo n'est pas déformé ── */
const peinture = readFileSync('src/ds/carte-marraine.ts', 'utf8');
dit('le QR porte le lien de réservation, code posé', true, /qr\.addData\(lienDeLaCarte\(d\.code\)\)/.test(peinture));
dit('… le même lien que celui que la marraine partage', true, /lienDeLaCarte = \(code: string\): string => lienDuParrainage\(ORIGINE_DU_SITE, code\)/.test(peinture));
const tailleDuPng = (f: string) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const [vw, vh] = tailleDuPng('public/assets/verrous/verrou-couche-ivoire.png');
const verrou = /drawImage\(clair \? vIndigo : vIvoire, \d+, \d+, (\d+), (\d+)\)/.exec(peinture);
dit('le verrou couché garde ses proportions (1 %)', true, !!verrou && Math.abs(Number(verrou[1]) / Number(verrou[2]) - vw / vh) / (vw / vh) < 0.01);
dit('… et reste au-dessus de son plancher de 123 px', true, !!verrou && Number(verrou[1]) >= 123);
const vb = /viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(readFileSync('public/assets/vectoriel/pictogramme-cuivre.svg', 'utf8'));
const picto = /drawImage\(picto, \d+, \d+, (\d+), (\d+)\)/.exec(peinture);
dit('le pictogramme garde ses proportions (1 %)', true, !!vb && !!picto && Math.abs(Number(picto[1]) / Number(picto[2]) - Number(vb[1]) / Number(vb[2])) / (Number(vb[1]) / Number(vb[2])) < 0.01);
dit('… et chaque motif que la carte peint existe', [],
  [...peinture.matchAll(/M\('([a-z0-9-]+\.png)'\)/g)].map((m) => m[1]).filter((f) => !existsSync(`public/assets/motifs/${f}`)));

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} échec(s).`);
if (ko) process.exit(1);
