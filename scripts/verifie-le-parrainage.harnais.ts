import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  FORME_DU_CODE, SIGNES_DU_CODE, codeDeMarraine, racineDuCode, lienDuParrainage, lienCourtDuParrainage,
} from '../src/shared/parrainage-pur';
import { codesAAttribuer, type DemandeParrainee, type FicheLue } from '../src/shared/parrainage';
import {
  lignees, venuesDe, recompensesAPoser, choixReportes, rattachementsDuSite, pourquoiPasDeMarraine,
  resumeDeLAmbassade, classementDuMois, chiffresDuMois, sceauxDuFoyerAPoser, type FicheAmb, type DemandeLue,
} from '../src/shared/ambassade';
import { codesConnus, grainesAAttribuer, hasardDe, type Graine } from '../src/shared/douze-lunes-pur';
import { prenomDuNom } from '../src/shared/parrainage-pur';
import { soinsEnAttente, genreEffectif, rangDe, rangSuivant, RANGS, type SoinOffert } from '../src/shared/parrainage-pur';
import { prestationsDeBienvenue, remiseDeBienvenue, motDeLaRemise, REMISE_BIENVENUE_PCT } from '../src/shared/parrainage-pur';
import { venuesDeLAnnee } from '../src/shared/agenda';
import { INGREDIENTS, AVANT_APRES, COMMUNAUTE } from '../src/apps/revelateur/communaute';
import { unGesteParPassage } from './un-geste-par-passage';

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

   DE MAIN EN MAIN — 9 octobre 2026. Les contrôles qui éprouvaient l'ANCIEN
   programme (un code pour chaque fiche, le code demandé sur le site, l'écho,
   le rang et le défi récompensés, le classement lu par les clientes, la
   marraine cherchée dans les demandes, « exactement cinq return ») sont
   devenus ceux de la règle neuve : la carte se GAGNE (la Graine), seul son
   code ouvre quelque chose, un merci par amie venue après le lancement, et
   rien d'autre. Chacun a été vu crier, sa panne remise (le banc complet, avec
   `--prouve`, vit dans verifie-les-douze-lunes). Les dates du banc sont
   posées APRÈS le lancement (`LANCE_A`), sauf celles qui disent l'avant :
   sans quoi un « cinq mercis » changerait de sens en silence.

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
const verdict = sansCommentaires.slice(sansCommentaires.indexOf('async function verdictDuParrainage'), sansCommentaires.indexOf('async function quiOffre'));
dit('Edge : le verdict est bien lu (sans quoi les quatre contrôles suivants ne prouveraient rien)', true, verdict.length > 300);
dit('Edge : refuse la marraine elle-même', true, verdict.includes("raison: 'parrainage-soi-meme'"));
dit('Edge : refuse un second parrainage du même numéro', true, verdict.includes("raison: 'parrainage-deja-utilise'"));
dit('Edge : refuse une cliente déjà connue', true, verdict.includes('await dejaCliente(telephone)') && verdict.includes("raison: 'parrainage-deja-cliente'"));
dit('Edge : le cadeau ne se donne qu’en DERNIER, après les trois refus', true,
  verdict.lastIndexOf("raison: 'parrainage'") > verdict.indexOf('await dejaCliente(telephone)'));
dit('Edge : une pause au Trône ferme le parrainage', true, verdict.includes('reglage.actif === false') && sansCommentaires.includes("json({ error: 'parrainage_ferme' }, 409)"));
dit('Edge : la demande garde la marraine', true, /parrainDe: duCode\.code, marraineId: duCode\.marraineId/.test(sansCommentaires));
dit('Edge : la note du rendez-vous dit le cadeau', true, sansCommentaires.includes("v.raison === 'parrainage') return `parrainée par"));
/* De main en main : le site ne rend plus AUCUN code, ni celui d'une fiche,
   ni celui d'une demande « Marraine » (l'ancien « un même numéro retrouve
   son code ») ; l'ancien appel reçoit 409 sans qu'aucune table soit lue. */
dit('Edge : le site ne rend plus de code, ni d’une fiche ni d’une demande', [false, false, true], [
  /\.not\('data->>codeParrain', 'is', null\)/.test(sansCommentaires),
  /codePourLaMarraine|const saFiche/.test(sansCommentaires),
  /if \(body\.parrainage === true\) return json\(\{ error: 'parrainage_ferme' \}, 409\);/.test(sansCommentaires),
]);

/* ── Le site dit chaque issue (la page de réservation) ── */
const reserver = readFileSync('src/apps/revelateur/ilots/Reserver.tsx', 'utf8');
dit('la réservation dit les quatre issues du parrainage', [],
  ['parrainage', 'parrainage-soi-meme', 'parrainage-deja-cliente', 'parrainage-deja-utilise'].filter((r) => !reserver.includes(`recu.codeRaison === '${r}'`)));

const d = (o: Partial<DemandeParrainee> & { id: string }): DemandeParrainee => ({
  genre: 'prospect', createdAt: '2026-10-01T10:00:00Z', branchId: 'b1', prenom: 'X', telephone: '+2290100000000',
  besoin: 'inconnu', source: 'site', consentementLe: '2026-10-01T10:00:00Z', statut: 'nouvelle', ...o,
} as DemandeParrainee);

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
/* De main en main : l'îlot ne distribue plus de code (il en donnait un à
   quiconque tapait un prénom et un numéro) ; la carte se gagne à la Maison. */
const ilotParrainer = readFileSync('src/apps/revelateur/ilots/Parrainer.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('… un îlot qui ne demande plus de code au serveur', [false, false], [/parrainage: true/.test(ilotParrainer), /fetch\(/.test(ilotParrainer)]);

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

/* ══ (6) LA CARTE SE GAGNE — De main en main, 9 octobre 2026 ════════════
   (Jusqu'au 9 octobre : « la carte de chaque cliente », un code pour toute
   fiche vivante, et le code demandé sur le site gardé.) Désormais seule une
   fiche qui a ses N jours de visite honorée depuis le 1er janvier 2026
   reçoit sa Graine : un code neuf, unique, le même sur tous les postes,
   jamais un code déjà vu (ni l'ancien code d'une fiche, ni celui d'une
   marraine du site). Le banc complet du seuil vit dans verifie-les-douze-
   lunes (R1 à R3) ; ici, ce que l'ancien contrôle tenait, retourné. */
const fiche = (o: Partial<FicheLue> & { id: string }): FicheLue => ({ name: 'Aïcha K.', phone: '+2290100000000', since: '2019-03-01', ...o } as FicheLue);
const CINQ_VISITES = ['2026-01-15', '2026-03-02', '2026-05-04', '2026-07-06', '2026-09-08'];
const visitesDe = (clientId: string, n = 5) => CINQ_VISITES.slice(0, n).map((date, i) => ({ id: `v-${clientId}-${i}`, status: 'honoré', date, clientId }));
const AUJOURDHUI = '2026-10-20';
const foule = Array.from({ length: 60 }, (_, i) => fiche({ id: `c${String(i).padStart(3, '0')}`, name: i % 2 ? 'Aïcha Test' : 'Grâce', phone: `+22901${String(10000000 + i)}` }));
const rdvFoule = [...foule.slice(0, 50).flatMap((c) => visitesDe(c.id)), ...foule.slice(50).flatMap((c) => visitesDe(c.id, 4))];
const codesFoule = grainesAAttribuer(foule, rdvFoule, 5, AUJOURDHUI).map((g) => ({ clientId: g.clientId, code: g.graine.code }));
dit('la carte se gagne : cinquante fiches à cinq visites ont leur Graine, les dix à quatre visites non', [50, []],
  [codesFoule.length, codesFoule.filter((c) => Number(c.clientId.slice(1)) >= 50).map((c) => c.clientId)]);
dit('… chaque code a la forme PRENOM-XXX', [], codesFoule.filter((c) => !FORME_DU_CODE.test(c.code)).map((c) => c.code));
dit('… et aucun ne se répète, même à vingt-cinq prénoms identiques', 50, new Set(codesFoule.map((c) => c.code)).size);
dit('… et le même code sort sur tous les postes (ordre des fiches indifférent)', JSON.stringify(codesFoule),
  JSON.stringify(grainesAAttribuer([...foule].reverse(), [...rdvFoule].reverse(), 5, AUJOURDHUI).map((g) => ({ clientId: g.clientId, code: g.graine.code }))));
dit('… et il vient de son prénom', true, codesFoule.find((c) => c.clientId === 'c001')?.code.startsWith('AICHA-'));
/* L'ancien programme donnait un code à chacune ; la Graine n'en reprend aucun. */
const anciens = new Map(codesAAttribuer(foule, []).map((c) => [c.clientId, c.code]));
dit('… et aucune Graine ne reprend l’ancien code de sa fiche', [], codesFoule.filter((c) => c.code === anciens.get(c.clientId)).map((c) => c.clientId));
/* Le piège : chaque code déjà vu est justement le PREMIER tirage de la
   fiche qui reçoit sa Graine, sans quoi « jamais repris » ne prouverait
   rien (deux tirages au hasard ne se rencontrent presque jamais). */
const premierTirage = (id: string, nom: string) => codeDeMarraine(prenomDuNom(nom), hasardDe(`lunes:${id}:0`));
const deja: Graine = { code: premierTirage('x2', 'Aïcha B.'), le: '2026-10-09', atteinteLe: '2026-09-08', seuil: 5 };
const avecDeja = [fiche({ id: 'x1', graine: deja, codeParrain: deja.code }), fiche({ id: 'x2', name: 'Aïcha B.', phone: '+2290199999999' }), fiche({ id: 'x3', archived: true, phone: '+2290188888888' })];
const codesDeja = grainesAAttribuer(avecDeja, ['x1', 'x2', 'x3'].flatMap((id) => visitesDe(id)), 5, AUJOURDHUI);
dit('une Graine posée ne se repose pas, une fiche archivée n’en reçoit pas', ['x2'], codesDeja.map((c) => c.clientId));
dit('… et le nouveau code évite celui d’une Graine qui existe', [true, true], [FORME_DU_CODE.test(codesDeja[0]?.graine.code ?? ''), codesDeja[0]?.graine.code !== deja.code]);
/* La marraine du site (une demande « Marraine ») : son code s'éteint. La
   fiche du même numéro ne l'ADOPTE plus (l'ancien « elle GARDE ce code »),
   et aucune Graine ne le reprend. */
const duSite = [
  d({ id: 'ds1', prenom: 'Rama', telephone: '+2290166666666', codeParrain: premierTirage('r1', 'Rama D.') }),
  d({ id: 'ds2', prenom: 'Awa', telephone: '+2290167777777', parrainDe: premierTirage('z1', 'Rama') }),
];
const deRama = grainesAAttribuer([fiche({ id: 'r1', name: 'Rama D.', phone: '01 66 66 66 66' })], visitesDe('r1'), 5, AUJOURDHUI, codesConnus([], duSite));
dit('une cliente qui avait demandé son code sur le site reçoit un code NEUF à sa Graine', [1, false], [deRama.length, deRama.some((g) => g.graine.code === premierTirage('r1', 'Rama D.'))]);
dit('… et aucun code vu sur le site ne revient à personne', false,
  grainesAAttribuer([fiche({ id: 'z1', name: 'Rama', phone: '+2290155555555' })], visitesDe('z1'), 5, AUJOURDHUI, codesConnus([], duSite)).some((g) => g.graine.code === premierTirage('z1', 'Rama')));

/* ══ (7) LES AMBASSADRICES — 28 septembre 2026 ══════════════════════════
   La règle, pas le cas : une amie compte UNE fois (site et Trône se
   rejoignent), quand elle est VENUE ; rien ne se pose deux fois ; le choix
   de la cliente est reporté ; la remise est bornée ; Ma Couronne ne reçoit
   que des prénoms.

   DE MAIN EN MAIN (9 octobre 2026) : une lignée ne naît que d'une GRAINE,
   et une amie vaut UN merci, posé seulement si elle est venue après le
   lancement (`LANCE_A`, avant toutes les venues d'octobre du banc ; Sika,
   venue en septembre, dit l'avant). Plus d'écho, de rang ni de défi
   récompensés, même avec l'ancien réglage resté allumé dans le document.
   L'ancien code d'une Graine, gardé dans son archive, mène encore à elle
   (Mila, invitée avant le lancement, venue après : décision 5) ; celui
   d'une fiche qui n'est pas Graine ne mène nulle part (Yao). */
const LANCE_A = '2026-10-01';
const graineA = (code: string): Graine => ({ code, le: LANCE_A, atteinteLe: '2026-09-08', seuil: 5 });
const fa = (o: Partial<FicheAmb> & { id: string }): FicheAmb => ({ name: 'X', phone: '+2290100000000', since: '2019-01-01', ...o } as FicheAmb);
const ficheA = [
  fa({ id: 'adjoa', name: 'Adjoa Mensah', phone: '+2290170000000', graine: graineA('ADJOA-7K2'), codeParrain: 'ADJOA-7K2',
    avantLesDouzeLunes: { le: '2026-10-01T20:00:00.000Z', codeParrain: 'ADJOA-4QF', soinsRetires: [] } }),
  fa({ id: 'grace', name: 'Grâce H.', phone: '+2290171000000', graine: graineA('GRACE-9MT'), codeParrain: 'GRACE-9MT', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'ines', name: 'Inès K.', phone: '+2290172000000', graine: graineA('INES-3PQ'), codeParrain: 'INES-3PQ', parraineePar: 'GRACE-9MT' }),
  fa({ id: 'lea', name: 'Léa T.', phone: '+2290173000000', graine: graineA('LEA-2WX'), codeParrain: 'LEA-2WX', parraineePar: 'INES-3PQ' }),
  fa({ id: 'rama', name: 'Rama D.', phone: '+2290174000000', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'zoe', name: 'Zoé A.', phone: '+2290175000000', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'sika', name: 'Sika B.', phone: '+2290177000000', parraineePar: 'ADJOA-7K2' }),
  fa({ id: 'mila', name: 'Mila F.', phone: '+2290176500000', parraineePar: 'ADJOA-4QF' }),
  fa({ id: 'yao', name: 'Yao K.', phone: '+2290178000000', codeParrain: 'YAO-7HP' }),
  fa({ id: 'awa', name: 'Awa H.', phone: '+2290179000000', parraineePar: 'YAO-7HP' }),
];
const demA: DemandeLue[] = [
  { id: 'd1', prenom: 'Rama', telephone: '+2290174000000', createdAt: '2026-10-01T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a-r' },
  { id: 'd2', prenom: 'Nadia', telephone: '+2290176000000', createdAt: '2026-10-02T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-7K2', apptId: 'a-n' },
  { id: 'd3', prenom: 'Awa', telephone: '+2290179000000', createdAt: '2026-10-02T10:00:00Z', codeRaison: 'parrainage', parrainDe: 'YAO-7HP', apptId: 'a-a' },
  { id: 'd4', prenom: 'Mila', telephone: '+2290176500000', createdAt: '2026-09-25T09:00:00Z', codeRaison: 'parrainage', parrainDe: 'ADJOA-4QF', apptId: 'a-m' },
];
const rdvA = [
  { id: 'a-g', status: 'honoré', date: '2026-10-03', clientId: 'grace' },
  { id: 'a-i', status: 'honoré', date: '2026-10-10', clientId: 'ines' },
  { id: 'a-l', status: 'honoré', date: '2026-10-14', clientId: 'lea' },
  { id: 'a-r', status: 'honoré', date: '2026-10-12', clientId: 'rama' },
  { id: 'a-n', status: 'honoré', date: '2026-10-05' },
  { id: 'a-z', status: 'confirmé', date: '2026-10-30', clientId: 'zoe' },
  { id: 'a-s', status: 'honoré', date: '2026-09-20', clientId: 'sika' },
  { id: 'a-m', status: 'honoré', date: '2026-10-08', clientId: 'mila' },
  { id: 'a-a', status: 'honoré', date: '2026-10-06', clientId: 'awa' },
];
const LA = lignees(ficheA, demA, rdvA);
const adjoa = LA.get('ADJOA-7K2')!;
dit('une lignée ne naît que d’une Graine (ni l’ancien code de Yao, ni son ancien code à elle)', ['ADJOA-7K2', 'GRACE-9MT', 'INES-3PQ', 'LEA-2WX'], [...LA.keys()].sort());
dit('une amie compte UNE fois, même venue par le site ET rattachée au Trône', 1, adjoa?.filleules.filter((f) => f.clientId === 'rama').length);
dit('… et garde l’identifiant de sa réservation', 'parr-d1', adjoa?.filleules.find((f) => f.clientId === 'rama')?.recompenseId);
dit('… même invitée par l’ANCIEN code de sa marraine Graine (Mila, décision 5)', [1, 'parr-d4'],
  [adjoa?.filleules.filter((f) => f.clientId === 'mila').length, adjoa?.filleules.find((f) => f.clientId === 'mila')?.recompenseId]);
dit('Adjoa : six amies, dont cinq venues (une réservation seule ne compte pas)', [6, 5], [adjoa?.filleules.length, venuesDe(adjoa).length]);
/* L'ANCIEN RÉGLAGE RESTÉ ALLUMÉ dans le document (écho, bonus de rang,
   défi) : le moteur ne le lit plus. */
const reglageA = { soinMarraineServiceId: 'svc-dandan', remisePct: 20, echoPct: 10, bonusRangs: { tresse: 'svc-signature' }, defi: { actif: true, objectif: 2, serviceId: 'svc-defi' }, lanceLe: LANCE_A };
const nomsA = (id: string) => ({ 'svc-dandan': 'DÀNDÀN™', 'svc-signature': 'Le rituel signature', 'svc-defi': 'KLƆKLƆ™' } as Record<string, string>)[id];
const posesA = recompensesAPoser(ficheA, LA, reglageA, '2026-10-20', nomsA);
const idsDe = (id: string) => (posesA.parFiche.get(id) ?? []).map((s) => s.id).sort();
dit('Adjoa : un merci par amie venue après le lancement, et rien d’autre (l’ancien réglage allumé n’y peut rien)',
  ['parr-c-grace', 'parr-d1', 'parr-d2', 'parr-d4'], idsDe('adjoa'));
dit('… ni écho, ni rang, ni défi, à aucune fiche', [], [...posesA.parFiche.values()].flat().map((s) => s.id).filter((id) => /^(echo|rang|defi)-/.test(id)));
dit('… rien pour Sika, venue AVANT le lancement (la date métier)', false, idsDe('adjoa').some((id) => id.includes('sika')));
dit('Grâce : son merci pour Inès, et plus d’écho de Léa', ['parr-c-ines'], idsDe('grace'));
dit('Inès : son merci pour Léa', ['parr-c-lea'], idsDe('ines'));
dit('Yao, sans Graine : ni lignée ni merci pour Awa (son ancien code s’est éteint)', [false, false], [LA.has('YAO-7HP'), posesA.parFiche.has('yao')]);
const parrD1 = (posesA.parFiche.get('adjoa') ?? []).find((s) => s.id === 'parr-d1');
dit('la récompense d’une amie est À CHOISIR, avec son soin et sa remise', { genre: 'a-choisir', serviceId: 'svc-dandan', pct: 20, expireLe: '2027-04-20', source: 'amie' },
  { genre: parrD1?.genre, serviceId: parrD1?.serviceId, pct: parrD1?.pct, expireLe: parrD1?.expireLe, source: parrD1?.source });
dit('les réservations du site récompensées sont marquées', ['d1', 'd2', 'd4'], [...posesA.demandesMarquees].sort());
dit('aucun remerciement tant que la Maison ne l’a pas allumé', 0, posesA.mercis.length);
dit('… et un par merci posé quand elle l’allume', 6, recompensesAPoser(ficheA, LA, { ...reglageA, merciParWhatsApp: true }, '2026-10-20', nomsA).mercis.length);
dit('sans lancement (le document des Lunes ne l’a pas dit), aucun merci', 0, recompensesAPoser(ficheA, LA, { ...reglageA, lanceLe: undefined }, '2026-10-20', nomsA).parFiche.size);
const ficheApres = ficheA.map((c) => ({ ...c, soinsOfferts: [...(c.soinsOfferts ?? []), ...(posesA.parFiche.get(c.id) ?? [])] }));
dit('rien ne se pose deux fois (deux postes, un passage de plus)', 0, recompensesAPoser(ficheApres, lignees(ficheApres, demA, rdvA), reglageA, '2026-10-21', nomsA).parFiche.size);
/* Le merci que le lancement a rangé dans l'archive (posé avant, retiré au
   geste) ne revient pas : c'est un identifiant déjà vu. */
const ficheRangee = ficheA.map((c) => (c.id === 'adjoa' ? { ...c, avantLesDouzeLunes: { ...c.avantLesDouzeLunes!, soinsRetires: [{ id: 'parr-c-grace', libelle: 'x', raison: 'x', poseLe: '2026-10-04', source: 'amie' as const }] } } : c));
dit('un merci rangé dans l’archive au lancement ne revient pas', false,
  (recompensesAPoser(ficheRangee, lignees(ficheRangee, demA, rdvA), reglageA, '2026-10-20', nomsA).parFiche.get('adjoa') ?? []).some((s) => s.id === 'parr-c-grace'));
dit('un cadeau déjà remis à la main ne se repose pas', false,
  (recompensesAPoser(ficheA, lignees(ficheA, [demA[0], { ...demA[1], cadeauMarraineRemisLe: '2026-10-06' }, ...demA.slice(2)], rdvA), reglageA, '2026-10-20', nomsA).parFiche.get('adjoa') ?? []).some((s) => s.id === 'parr-d2'));
const sansPrestation = recompensesAPoser(ficheA, LA, { remisePct: 20, lanceLe: LANCE_A }, '2026-10-20').parFiche.get('adjoa') ?? [];
dit('sans prestation choisie, le merci reste une remise à choisir (rien ne s’invente)', [['parr-c-grace', 'parr-d1', 'parr-d2', 'parr-d4'], false],
  [sansPrestation.map((s) => s.id).sort(), sansPrestation.some((s) => !!s.serviceId)]);
dit('la remise ne dépasse jamais la moitié', 50, (recompensesAPoser(ficheA, LA, { remisePct: 80, lanceLe: LANCE_A }, '2026-10-20').parFiche.get('adjoa') ?? [])[0]?.pct);

/* ── Le choix de la cliente ── */
const aChoisir: SoinOffert = { id: 'parr-d1', genre: 'a-choisir', libelle: 'Une récompense à choisir', raison: 'Pour la venue de Rama', poseLe: '2026-10-20', pct: 20, serviceId: 'svc-dandan' };
const dejaUtilisee: SoinOffert = { ...aChoisir, id: 'parr-d2', utiliseLe: '2026-10-21', piece: 'MND-1' };
const choixRemise = choixReportes(fa({ id: 'adjoa', soinsOfferts: [aChoisir, dejaUtilisee], choixRecompenses: { 'parr-d1': { genre: 'remise', produitId: 'p-huile', le: 'x' }, 'parr-d2': { genre: 'soin', le: 'x' } } }), nomsA, (id) => (id === 'p-huile' ? 'L’huile Kòfí™' : undefined));
dit('son choix « remise » est reporté, avec son produit', { genre: 'remise', produitId: 'p-huile', libelle: '−20 % sur L’huile Kòfí™' },
  { genre: choixRemise?.[0].genre, produitId: choixRemise?.[0].produitId, libelle: choixRemise?.[0].libelle });
dit('… une récompense déjà utilisée ne change plus', dejaUtilisee, choixRemise?.[1]);
dit('son choix « soin » prend le nom du soin', 'DÀNDÀN™', choixReportes(fa({ id: 'x', soinsOfferts: [aChoisir], choixRecompenses: { 'parr-d1': { genre: 'soin', le: 'x' } } }), nomsA)?.[0].libelle);
dit('sans choix, rien ne bouge', null, choixReportes(fa({ id: 'x', soinsOfferts: [aChoisir] })));
dit('le genre réel suit son choix', ['a-choisir', 'soin'], [genreEffectif(aChoisir), genreEffectif(aChoisir, { 'parr-d1': { genre: 'soin', le: 'x' } })]);
dit('une récompense expirée n’est plus à utiliser', 0, soinsEnAttente([{ ...aChoisir, expireLe: '2026-10-19' }], '2026-10-20').length);

/* ── Les rangs ── */
dit('les noms des rangs : Graine, Pousse, Racine, Couronne, Reine de la Maison', ['Graine', 'Pousse', 'Racine', 'Couronne', 'Reine de la Maison'], RANGS.map((r) => r.nom));
dit('les rangs : 0 Graine, 1 Pousse, 3 Racine (id tresse, gardé), 5 Couronne, 10 Reine', ['graine', 'pousse', 'pousse', 'tresse', 'couronne', 'reine'], [0, 1, 2, 3, 5, 10].map((n) => rangDe(n).id));
dit('… et le suivant', ['pousse', 'couronne', undefined], [0, 3, 10].map((n) => rangSuivant(n)?.id));
/* LA GRAINE RESTE LE RANG DE ZÉRO AMIE, mais elle ne se dit plus que
   derrière la Graine posée (9 octobre 2026) : `nomDuRang(undefined)` dit
   « Graine », donc chaque écran qui l'écrit doit d'abord passer la porte. */
const sansBlocs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const carteSrc = sansBlocs(readFileSync('src/apps/couronne/MaCarte.tsx', 'utf8'));
const ongletsSrc = sansBlocs(readFileSync('src/apps/couronne/Tabs.tsx', 'utf8'));
const cercleSrc = sansBlocs(readFileSync('src/apps/trone/routes/equipe/Cercle.tsx', 'utf8'));
/* Depuis le 9 octobre au soir, la porte passe par la règle pure
   `codeDeLaCarte` (la Graine ; l'ancien code avant le lancement seulement,
   éprouvée par verifie-les-douze-lunes R17), et l'appel dit le lancement. */
dit('la carte de Ma Couronne exige la Graine une fois lancé, et son rang vaut Graine par défaut', [true, true, true], [
  /export function donneesDeMaCarte\([^)]*\)[^{]*\{\s*const code = codeDeLaCarte\(client, lance\);\s*if \(!client \|\| !code\) return null;/.test(carteSrc),
  /return donneesDeMaCarte\(client, !!lunes\.lanceLe\);/.test(carteSrc),
  /rang: client\.parrainage\?\.rang \?\? 'graine',/.test(carteSrc),
]);
dit('… la pastille du rang, à l’accueil, ne paraît qu’avec la carte', true, /\{maCarte && \(\s*<span className="mc-pillseal">\{t\(nomDuRang\(maCarte\.rang\)\)\}/.test(ongletsSrc));
dit('… et le Cercle du Trône ne dit le rang que d’une fiche au code actif', true,
  /const code = codeActifDe\(c\);/.test(cercleSrc)
  && (cercleSrc.match(/\(code\s*\?\s*`\$\{nomDuRang\(c\.parrainage\?\.rang\)\}/g) ?? []).length === (cercleSrc.match(/nomDuRang\(/g) ?? []).length);

/* ── Les deux chemins se rejoignent ── */
const sansLien = ficheA.map((c) => (c.id === 'rama' ? { ...c, parraineePar: undefined } : c));
dit('l’amie venue par le site reçoit le code sur sa fiche', [{ clientId: 'rama', code: 'ADJOA-7K2', le: '2026-10-01T09:00:00Z' }], rattachementsDuSite(sansLien, demA, rdvA));
dit('… une fiche déjà rattachée ne bouge pas', [], rattachementsDuSite(ficheA, demA, rdvA));
const sansLienMila = ficheA.map((c) => (c.id === 'mila' ? { ...c, parraineePar: undefined } : c));
dit('… l’ancien code d’une Graine rattache encore son amie (Mila, décision 5)', [{ clientId: 'mila', code: 'ADJOA-4QF', le: '2026-09-25T09:00:00Z' }], rattachementsDuSite(sansLienMila, demA, rdvA));
const sansLienAwa = ficheA.map((c) => (c.id === 'awa' ? { ...c, parraineePar: undefined } : c));
dit('… l’ancien code d’une fiche qui n’est pas Graine ne rattache personne (Awa)', [], rattachementsDuSite(sansLienAwa, demA, rdvA));

/* ── « Vient de la part de » ── */
const nouvelle = fa({ id: 'neuve', name: 'Afi' });
dit('« Vient de la part de » : un code inconnu est refusé', true, !!pourquoiPasDeMarraine(nouvelle, 'NULLE-222', ficheA, rdvA));
dit('… son propre code aussi', true, !!pourquoiPasDeMarraine(ficheA[0], 'ADJOA-7K2', ficheA, rdvA));
dit('… le code d’une fiche qui n’est pas Graine aussi (l’ancien code de Yao)', true, !!pourquoiPasDeMarraine(nouvelle, 'YAO-7HP', [...ficheA, nouvelle], rdvA));
dit('… une cliente déjà venue plusieurs JOURS aussi', true,
  !!pourquoiPasDeMarraine(nouvelle, 'ADJOA-7K2', ficheA, [...rdvA, { id: 'v1', status: 'honoré', date: '2026-01-01', clientId: 'neuve' }, { id: 'v2', status: 'honoré', date: '2026-02-01', clientId: 'neuve' }]));
dit('… mais deux rendez-vous honorés le même jour font UNE visite : elle passe (décision 1)', null,
  pourquoiPasDeMarraine(nouvelle, 'ADJOA-7K2', [...ficheA, nouvelle], [...rdvA, { id: 'v1', status: 'honoré', date: '2026-10-02', clientId: 'neuve' }, { id: 'v2', status: 'honoré', date: '2026-10-02', clientId: 'neuve' }]));
dit('… une nouvelle cliente passe', null, pourquoiPasDeMarraine(nouvelle, 'ADJOA-7K2', [...ficheA, nouvelle], rdvA));
dit('… et une récompense déjà posée ne se déplace plus', true,
  !!pourquoiPasDeMarraine(ficheA[1], 'LEA-2WX', ficheApres, rdvA));
dit('… même quand elle est venue par le site (récompense de sa réservation)', true,
  !!pourquoiPasDeMarraine(ficheA.find((c) => c.id === 'rama')!, 'GRACE-9MT', ficheApres, rdvA, demA));
dit('… même rangée dans l’archive au lancement', true,
  !!pourquoiPasDeMarraine(ficheA[1], 'LEA-2WX', ficheRangee, rdvA));

/* ── Ce que Ma Couronne reçoit ── */
const resA = resumeDeLAmbassade(adjoa, LA, ficheA, reglageA, '2026-10-20', nomsA);
dit('Ma Couronne : des prénoms, des états, des dates, rien d’autre', [],
  [...resA.filleules.flatMap((f) => Object.keys(f)), ...(resA.echos ?? []).flatMap((e) => Object.keys(e))].filter((k) => !['prenom', 'etat', 'date', 'via'].includes(k)));
dit('… son rang et ses échos (une ligne d’honneur), plus de défi', { rang: 'couronne', venues: 5, echos: ['Inès via Grâce'], defi: false },
  { rang: resA.rang, venues: resA.venues, echos: (resA.echos ?? []).map((e) => `${e.prenom} via ${e.via}`), defi: 'defi' in resA });
/* Le classement reste au personnel (décision 6) : calculé sur son écran,
   jamais plus écrit pour Ma Couronne. */
const clA = classementDuMois(LA, '2026-10-20');
dit('le classement du personnel : un prénom, un rang, deux nombres', [], clA.lignes.flatMap((l) => Object.keys(l)).filter((k) => !['prenom', 'rang', 'ceMois', 'amies'].includes(k)));
dit('… Adjoa en tête', 'Adjoa', clA.lignes[0]?.prenom);
const hookBrut = readFileSync('src/apps/trone/shell/useParrainageVivant.ts', 'utf8');
const hook = hookBrut.replace(/\/\*[\s\S]*?\*\//g, '');
dit('… et Ma Couronne ne le reçoit plus : le document reste vide, l’écran ne le lit pas', [true, false, false], [
  /classementStore\)\.set\(CLASSEMENT_VIDE\);/.test(hook) && (hook.match(/classementStore\)\.set\(/g) ?? []).length === 1,
  /classementVisible/.test(hook),
  /classement-ambassade|useClassement/.test(carteSrc + ongletsSrc),
]);
dit('les chiffres du mois comptent les amies venues par une amie', 6, chiffresDuMois(ficheA, LA, rdvA, '2026-10-20').parUneAmie);

/* ── La base protège les champs ── Jusqu'au 9 octobre, ce contrôle lisait
   0111 par son nom ; il lit désormais la DERNIÈRE migration qui définit le
   déclencheur (0124 aujourd'hui), pour qu'une migration de plus ne le fasse
   pas juger une règle d'hier. */
dit('0110 existe toujours (le premier temps)', true, existsSync('supabase/migrations/0110_la_carte_de_marraine.sql'));
const lesMigrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  .map((nom) => ({ nom, sql: readFileSync(`supabase/migrations/${nom}`, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '') }));
const derniereQui = (motif: RegExp) => lesMigrations.filter((m) => motif.test(m.sql)).pop();
/* La DÉFINITION (`create … function`), pas le déclencheur qui l'appelle
   (`execute function …`) : une migration qui ne ferait que recréer le
   déclencheur ne doit pas passer pour la règle. */
const declencheur = derniereQui(/create (?:or replace )?function public\.clients_protege_parrainage\(\)/);
const sqlSansCommentaires = declencheur?.sql ?? '';
const enTete = declencheur?.nom.slice(0, 4) ?? '????';
dit(`${enTete} : la dernière définition du déclencheur des fiches est lue`, true, !!declencheur && !declencheur.nom.startsWith('0111'));
dit(`${enTete} : l’éditeur SQL et la clé de service gardent la main`, true, /if auth\.uid\(\) is null then return new;/.test(sqlSansCommentaires));
dit(`${enTete} : le personnel passe par la garde une fois lancé (plus de laissez-passer)`, [true, false],
  [/public\.douze_lunes_garde\(old\.data, new\.data, lance\)/.test(sqlSansCommentaires), /if public\.is_staff\(\) then return new;/.test(sqlSansCommentaires)]);
dit(`${enTete} : le code, le résumé, les soins, les liens, la Graine et l’archive sont réimposés`, true,
  ['codeParrain', 'parrainage', 'soinsOfferts', 'parraineePar', 'parraineeLe', 'graine', 'avantLesDouzeLunes'].every((k) => sqlSansCommentaires.includes(`'${k}', old.data -> '${k}'`)));
dit(`${enTete} : son choix entre soin et remise reste à ELLE`, false, sqlSansCommentaires.includes("'choixRecompenses'"));
dit(`${enTete} : le modèle de carte reste libre`, false, sqlSansCommentaires.includes("'carteModele'"));
dit(`${enTete} : garde l’insertion comme la mise à jour`, true, /before insert or update on public\.clients/.test(sqlSansCommentaires));
const classementSql = derniereQui(/docs_ambassade_read/)?.sql ?? '';
dit('le classement ne se lit plus par les clientes (la dernière migration qui le nomme le retire)', [true, false],
  [/drop policy if exists docs_ambassade_read on public\.documents;/.test(classementSql), /create policy docs_ambassade_read/.test(classementSql)]);

/* ── La fonction : la Graine seule, le prénom seul ── */
const qui = sansCommentaires.slice(sansCommentaires.indexOf('async function quiOffre'), sansCommentaires.indexOf('async function previensLaMarraine'));
/* Depuis le 7 octobre, « qui » rend aussi la remise de bienvenue (pourcentage
   et soins couverts) : toujours rien de la marraine que son prénom. */
dit('Edge : « qui » rend le prénom, le cadeau et la remise, jamais le numéro', true,
  /return json\(\{\s*ok: true, prenom: m\.prenom,\s*cadeau: /.test(qui) && !/telephone/.test(qui.slice(qui.indexOf('ok: true, prenom: m.prenom'))));
/* Jusqu'au 9 octobre : « les fiches AVANT les demandes », et la cliente qui
   demandait son code recevait celui de sa fiche (`saFiche`). Désormais la
   marraine d'un code est la seule fiche vivante dont la GRAINE porte ce
   code ; les demandes « Marraine » du site ne désignent plus personne. */
const duCode = sansCommentaires.slice(sansCommentaires.indexOf('async function marraineDuCode'), sansCommentaires.indexOf('async function verdictDuParrainage'));
dit('Edge : la marraine d’un code est une Graine, jamais une demande du site', [true, true, false, true], [
  duCode.length > 200,
  /\.from\('clients'\)\.select\('id, data'\)\.eq\('data->graine->>code', code\)/.test(duCode),
  /from\('demandes'\)|codeParrain/.test(duCode),
  /\.filter\(\(f\) => codeActifDe\(f\.data\) === code\)/.test(duCode) && /if \(vivantes\.length !== 1\) return null;/.test(duCode),
]);
dit('Edge : la marraine n’est prévenue que si le modèle est posé', true, /if \(!MODELE\) return 'sans-modele';/.test(sansCommentaires));

/* ── Le Trône : ce qui écrit, et quand ── */
dit('le Trône n’écrit rien avant d’avoir lu fiches, demandes et carnet', true,
  /!tablePrete\('clients'\) \|\| !tablePrete\('demandes'\) \|\| !tablePrete\('appointments'\)/.test(hook));
dit('… ni les Graines ni les mercis avant les deux réglages (parrainage et Lunes)', true,
  /if \(!documentDescendu\('mnd_parrainage'\) \|\| !documentDescendu\('mnd_douze_lunes'\)\) return;/.test(hook)
  && hook.indexOf("documentDescendu('mnd_douze_lunes')") < hook.indexOf('grainesAAttribuer(')
  && hook.indexOf("documentDescendu('mnd_douze_lunes')") < hook.indexOf('recompensesAPoser('));
dit('… et n’envoie que les remerciements que le juge a comptés', true, /for \(const m of poses\.mercis\)/.test(hook) && !/merciParWhatsApp/.test(hook));
/* Jusqu'au 9 octobre : « exactement cinq `return;` ». Une étape de plus (les
   Graines) le faisait mentir ; on lit la PROPRIÉTÉ (scripts/un-geste-par-
   passage) : chaque étape qui écrit rend la main après sa dernière écriture. */
dit('… un passage, un geste : chaque étape qui écrit rend la main', [], unGesteParPassage(hookBrut));
dit('le crochet est monté dans le Trône', true, /useParrainageVivant\(\);/.test(readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8')));
const caisse = readFileSync('src/apps/trone/routes/vente/Caisse.tsx', 'utf8');
dit('la caisse ne consomme le soin qu’à l’encaissement, ligne encore offerte, avec la pièce', true,
  /if \(soinPose && clientId && cart\[soinPose\.cle\]\?\.disc === soinPose\.disc\)/.test(caisse) && /soinUtilise\(c\.soinsOfferts, idSoin, inv\.number, dateVente, \{ genre \}\)/.test(caisse));
const envoi = readFileSync('supabase/functions/whatsapp-envoi/index.ts', 'utf8');
dit('whatsapp-envoi sait porter une image en en-tête', true, /\{ type: 'image', image: \{ id: mediaId \} \}/.test(envoi));

/* ── La carte : le QR mène à la réservation, le logo n'est pas déformé ── */
const peinture = readFileSync('src/ds/carte-marraine.ts', 'utf8');
dit('le QR porte le lien de la carte, code posé', true, /qr\.addData\(lienDeLaCarte\(d\.code\)\)/.test(peinture));
dit('… le lien COURT, celui que la marraine partage (7 octobre 2026)', true, /lienDeLaCarte = \(code: string\): string => lienCourtDuParrainage\(ORIGINE_DU_SITE, code\)/.test(peinture));

/* ── LE LIEN COURT — 7 octobre 2026 (« lien court pour la carte des
   ambassadrices ») : maisonmnd.com/m/?CODE, dans le QR, écrit sur la carte,
   dans le message, derrière « Copier mon lien ». ── */
dit('le lien court pose le code après /m/?', 'https://exemple.test/m/?AICHA-7K2', lienCourtDuParrainage('https://exemple.test', 'AICHA-7K2'));
dit('… plus court que le long', true, lienCourtDuParrainage('https://maisonmnd.com', 'AICHA-7K2').length < lienDuParrainage('https://maisonmnd.com', 'AICHA-7K2').length);
dit('… écrit en clair sur la carte, à la place du seul domaine', true, /espace\(c, lienDeLaCarteEcrit\(d\.code\)/.test(peinture));
dit('… et dans le message de partage', true, /\\n\$\{lienDeLaCarte\(d\.code\)\}`;/.test(peinture));
const carteCouronne = readFileSync('src/apps/couronne/MaCarte.tsx', 'utf8');
dit('Ma Couronne copie le lien court', true, /navigator\.clipboard\.writeText\(lienDeLaCarte\(donnees\.code\)\)/.test(carteCouronne) && /t\('Copier mon lien'\)/.test(carteCouronne));
dit('… et le dit en anglais', true, /'Copier mon lien': 'Copy my link'/.test(readFileSync('src/apps/couronne/i18n/en-formule.ts', 'utf8')));
const generateur = readFileSync('scripts/genere-revelateur.mjs', 'utf8');
const formeCopiee = /const FORME_DU_CODE_COURT = '([^']+)';/.exec(generateur);
dit('la page /m/ reconnaît le code avec la MÊME forme que le parrainage', FORME_DU_CODE.source, formeCopiee?.[1]);
dit('… la page /m/ est écrite, hors des moteurs, hors du plan', [true, true, false], [
  /writeFileSync\(path\.join\(SORTIE, 'm', 'index\.html'\), page\(\{\s*chemin: '\/m\/'/.test(generateur),
  /chemin: '\/m\/'[\s\S]{0,2500}\.replace\('<link rel="canonical"', '<meta name="robots" content="noindex" \/><link rel="canonical"'\)\);/.test(generateur),
  /pagesEcrites\.push\('\/m\/'\)/.test(generateur),
]);
dit('… et le plan du site saute les pages noindex', true, /\.filter\(\(rel\) => !\/<meta name="robots" content="noindex"\/\.test\(readFileSync/.test(readFileSync('scripts/build-sites.mjs', 'utf8')));
/* Jusqu'au 9 octobre, le site partageait lui aussi le lien court du code
   qu'il venait de donner. Il ne donne plus de code : son bloc mène à la
   réservation et à Ma Couronne, où la carte arrive avec la Graine. */
dit('le site ne partage plus de lien de carte : il mène à la réservation et à Ma Couronne', [false, true, true],
  [/\/m\/|lienCourt|encodeURIComponent\(code\)/.test(ilotParrainer), /href=\{base\('\/reserver\/'\)\}/.test(ilotParrainer), /href=\{COURONNE\}/.test(ilotParrainer)]);
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

/* ══ (8) LE CERCLE RÉUNI — 29 septembre 2026 ═════════════════════════════
   Un sceau du Foyer atteint devient une récompense, une fois ; les points
   ont quitté le Cercle (ni gain ni retrait possible à l'écran, plus de
   compteur dans Ma Couronne) ; un seul écran au Trône. */
const foyersT = [{ famId: 'fam1', nom: 'Famille A.', payeurId: 'adjoa', depense: 450000 }, { famId: 'fam2', nom: 'Famille B.', payeurId: 'grace', depense: 100000 }];
const sceauxT = [{ id: 's1', seuilXof: 300000, serviceId: 'svc-dandan' }, { id: 's2', seuilXof: 600000, serviceId: 'svc-signature' }, { id: 's3', seuilXof: 200000, serviceId: '' }];
const posesF = sceauxDuFoyerAPoser(foyersT, sceauxT, ficheA, '2026-10-20', 6, nomsA);
dit('un sceau du Foyer atteint pose UN soin sur la fiche de celle qui règle', ['foyer-s1-fam1'], (posesF.get('adjoa') ?? []).map((s) => s.id));
dit('… un palier non atteint, ou sans soin choisi, ne pose rien', [false, false], [posesF.has('grace'), (posesF.get('adjoa') ?? []).some((s) => s.id.includes('s3'))]);
dit('… et la reposer ne la double pas', 0, sceauxDuFoyerAPoser(foyersT, sceauxT, ficheA.map((c) => (c.id === 'adjoa' ? { ...c, soinsOfferts: posesF.get('adjoa') } : c)), '2026-10-21', 6, nomsA).size);
dit('… c’est un soin, source foyer, avec sa date de fin', { genre: 'soin', source: 'foyer', expireLe: '2027-04-20' },
  (() => { const s = (posesF.get('adjoa') ?? [])[0]; return { genre: s?.genre, source: s?.source, expireLe: s?.expireLe }; })());
const onglets = readFileSync('src/apps/couronne/Tabs.tsx', 'utf8');
const cercleTab = onglets.slice(onglets.indexOf('export function CercleTab('), onglets.indexOf('/* ================= PROFIL'));
dit('Ma Couronne : l’onglet du Cercle porte l’ambassade', true, cercleTab.includes('<MonAmbassade toast={toast} />'));
dit('… et plus de points, ni de bouton « Introduire » qui n’envoyait rien', [false, false, false],
  [/loyaltyPoints/.test(cercleTab), /points de reconnaissance/.test(cercleTab), /Introduire par WhatsApp/.test(cercleTab)]);
dit('… l’accueil ne compte plus de points', false, /loyaltyPoints/.test(onglets));
const cercleTrone = readFileSync('src/apps/trone/routes/equipe/Cercle.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('Trône : le Cercle porte l’onglet des ambassadrices', true, cercleTrone.includes('<Parrainages dansLeCercle />'));
dit('… et n’écrit plus aucun point (ni don, ni ajustement)', false, /loyaltyPoints\s*:/.test(cercleTrone) || /setHistory|setPointsOn/.test(cercleTrone));
const nav = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
dit('… une seule entrée au menu : l’écran des ambassadrices seul sort de la barre', true,
  /path: '\/parrainages', horsMenu: true/.test(nav) && /path: '\/cercle', label: 'Le Cercle MND'/.test(nav));
dit('le Trône pose les sceaux du Foyer en tâche de fond', true, /sceauxDuFoyerAPoser\(foyers, sceaux, clients/.test(hook));

/* ══ (9) LES VENUES DE L'ANNÉE — 29 septembre 2026 ═══════════════════════
   « Calcule les venues par an, pas de cumul » : le Cercle se compte sur les
   douze derniers mois glissants ; un jour compte une fois ; ni une venue
   vieille de plus d'un an, ni un rendez-vous à venir, ni celui d'une autre. */
const rdvAn = [
  { status: 'honoré', clientId: 'x', date: '2026-09-28' },
  { status: 'honoré', clientId: 'x', date: '2026-09-28' },
  { status: 'honoré', clientId: 'x', date: '2026-03-02' },
  { status: 'honoré', clientId: 'x', date: '2025-09-30' },
  { status: 'honoré', clientId: 'x', date: '2025-09-29' },
  { status: 'honoré', clientId: 'x', date: '2024-05-01' },
  { status: 'honoré', clientId: 'x', date: '2026-10-05' },
  { status: 'confirmé', clientId: 'x', date: '2026-08-01' },
  { status: 'honoré', clientId: 'y', date: '2026-08-01' },
];
dit('les venues comptent sur douze mois glissants, un jour une fois', 3, venuesDeLAnnee(rdvAn, 'x', '2026-09-29'));
dit('… le 1ᵉʳ janvier ne remet rien à zéro', venuesDeLAnnee(rdvAn, 'x', '2026-12-31') >= 2, true);
dit('… et l’an d’avant se compte à part', 2, venuesDeLAnnee(rdvAn, 'x', '2025-10-01'));
const statutSrc = readFileSync('src/shared/accounts.ts', 'utf8');
dit('le statut du Cercle (Ma Couronne, la fiche) compte l’année, pas le cumul', true, /const venues = venuesDeLAnnee\(appts, client\.id\);/.test(statutSrc));
dit('… les deux écrans du Cercle aussi', [true, true],
  [/venuesDeLAnnee\(appts, c\.id\)/.test(readFileSync('src/apps/trone/routes/equipe/Cercle.tsx', 'utf8')), /estDuCercle\(venuesDeLAnnee\(rdvs, c\.id\), seuilCercle\)/.test(readFileSync('src/apps/trone/routes/equipe/Parrainages.tsx', 'utf8'))]);

/* ── LA REMISE DE BIENVENUE DE L'AMIE — 7 octobre 2026 ──────────────────
   « Le QR code de la marraine doit porter une remise de bienvenue de 20 %…
   appliquée aux services concernés » (Yéman) : les soins d'entretien seuls,
   la meilleure remise s'applique, la remise remplace la phrase du cadeau. */
const famillesB = [
  { id: 'c-ent', parentId: null }, { id: 'c-lav', parentId: 'c-ent' }, { id: 'c-crea', parentId: null },
];
const prestationsB = [
  { id: 's-lav', categoryId: 'c-lav', priceXof: 10000 },
  { id: 's-soin', categoryId: 'c-ent', priceXof: 8000, priceMode: 'fixe' },
  { id: 's-forfait', categoryId: 'c-ent', priceXof: 50000, includes: [{ serviceId: 's-lav' }] },
  { id: 's-devis', categoryId: 'c-ent', priceXof: 9000, priceMode: 'devis' },
  { id: 's-masque', categoryId: 'c-ent', priceXof: 9000, hidePrice: true },
  { id: 's-zero', categoryId: 'c-ent', priceXof: 0 },
  { id: 's-arch', categoryId: 'c-ent', priceXof: 7000, archived: true },
  { id: 's-crea', categoryId: 'c-crea', priceXof: 150000 },
];
dit('bienvenue : une famille cochée emporte ses sous-familles, prix fermes seuls, jamais un forfait', ['s-lav', 's-soin'],
  prestationsDeBienvenue(prestationsB, famillesB, ['c-ent']));
dit('… une sous-famille seule ne remonte pas à sa mère', ['s-lav'], prestationsDeBienvenue(prestationsB, famillesB, ['c-lav']));
dit('… sans famille cochée, pas de remise', null, remiseDeBienvenue({}, prestationsB, famillesB));
dit('… 20 % par défaut, sur les soins concernés', { pct: 20, serviceIds: ['s-lav', 's-soin'] },
  remiseDeBienvenue({ remiseBienvenueFamilles: ['c-ent'] }, prestationsB, famillesB));
dit('… le pourcentage se borne (0 = rien, 120 = 90)', [null, 90],
  [remiseDeBienvenue({ remiseBienvenuePct: 0, remiseBienvenueFamilles: ['c-ent'] }, prestationsB, famillesB),
    remiseDeBienvenue({ remiseBienvenuePct: 120, remiseBienvenueFamilles: ['c-ent'] }, prestationsB, famillesB)?.pct]);
dit('… elle se dit en clair, et la valeur par défaut est 20', ['20 % sur vos soins d’entretien', 20], [motDeLaRemise({ pct: 20 }), REMISE_BIENVENUE_PCT]);
const blocDe = (src: string) => /\/\* ⟨bienvenue⟩ \*\/\n[\s\S]*?\/\* ⟨\/bienvenue⟩ \*\//.exec(src.replace(/\r\n/g, '\n'))?.[0] ?? '';
const blocPartage = blocDe(readFileSync('src/shared/parrainage-pur.ts', 'utf8'));
dit('… la fonction Edge porte la MÊME règle, caractère pour caractère', [true, true],
  [blocPartage.length > 500, blocPartage === blocDe(edge)]);
dit('… le serveur l’écrit par ligne, comme un code d’offre, et la dit en clair', [true, true, true], [
  /const remise = gestes \? remiseDeBienvenue\(reglage, aPlat\(gestes\.catalogue\), gestes\.familles\) : null;/.test(sansCommentaires),
  /remisesLignes = lignes\.some\(\(l\) => l\.remisee\) \? lignes\.map\(\(l\) => \(l\.remisee \? \{ pct: remise\.pct \} : null\)\) : undefined;/.test(sansCommentaires),
  /cadeau: motDeLaRemise\(remise\)/.test(sansCommentaires),
]);
dit('… avec les gestes réservés et l’arbre des familles', true,
  /verdictDuParrainage\(duCode\.code, telephone, \{\s*serviceIds, catalogue: verdict\.catalogue, familles: verdict\.familles,\s*\}\)/.test(sansCommentaires));
dit('… et la rend dès le lien ouvert (pourcentage et soins couverts)', true, /\.\.\.\(remise \? \{ remise \} : \{\}\),/.test(sansCommentaires));
const pageReserver = readFileSync('src/apps/revelateur/ilots/Reserver.tsx', 'utf8');
dit('le site barre les soins concernés avec la même règle que les offres, une seule remise à la fois', [true, true], [
  /const offreAppliquee = offreDuMoment \?\? offreDeBienvenue;/.test(pageReserver),
  /lignesDuCode\([\s\S]{0,200}offreAppliquee,\s*\)/.test(pageReserver),
]);
dit('… et la bannière le dit dès l’ouverture du lien', true, /\$\{qui\.prenom\} vous offre −\$\{qui\.remise\.pct\} % sur vos soins d’entretien\./.test(pageReserver));
dit('le Trône coche les familles d’entretien', true,
  /regle\(\{ remiseBienvenueFamilles: suivantes \}/.test(readFileSync('src/apps/trone/routes/equipe/Parrainages.tsx', 'utf8')));

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} échec(s).`);
if (ko) process.exit(1);
