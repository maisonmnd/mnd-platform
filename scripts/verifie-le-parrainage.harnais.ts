import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  FORME_DU_CODE, SIGNES_DU_CODE, codeDeMarraine, racineDuCode, lienDuParrainage,
} from '../src/shared/parrainage-pur';
import { marrainesEtFilleules, cadeauDu, type DemandeParrainee } from '../src/shared/parrainage';
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
dit('deux marraines, la plus récente d’abord', ['m2', 'm1'], liste.map((m) => m.demande.id));
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

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} échec(s).`);
if (ko) process.exit(1);
