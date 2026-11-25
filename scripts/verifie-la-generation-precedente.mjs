import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appelesParLaGeneration, ecarts, gardeLaGenerationPrecedente, generationPrecedente } from './publie.mjs';

/* LA GÉNÉRATION PRÉCÉDENTE RESTE SERVIE — 28 septembre 2026.

   Sept minutes après une publication, Yéman voyait une page qui « ne marche
   pas » : son accueil en cache (dix minutes chez GitHub Pages) appelait le
   script de la veille, que la publication venait d'effacer.

   LA RÈGLE, PAS LE CAS : les fichiers hachés AJOUTÉS par la publication
   précédente (une génération, jamais deux) restent dans le dépôt quand la
   construction ne les écrit plus ; ceux qu'elle écrit encore restent à elle ;
   les fichiers non hachés (une photo, une page) ne sont jamais repris ; et
   la comparaison ne compte pas ce qui est gardé « en trop ». On le prouve
   sur un vrai dépôt git, jetable, et l'on relit la lettre de publie.mjs :
   la génération se lit AVANT l'effacement, se garde APRÈS la copie.

   UN MORCEAU ANCIEN DISPARAISSAIT — 25 novembre 2026. « Ajouté par le
   dernier commit » ne dit pas tout : un morceau inchangé depuis plusieurs
   publications n'a été ajouté par aucune des dernières, et la garde le
   laissait partir le jour où une construction le remplaçait, alors que les
   pages en cache l'appelaient encore (`le-sceau-pur-<hash>.js`, 404 à la
   seconde de la publication). La génération précédente, c'est AUSSI ce que
   ses pages appellent, de proche en proche. Épreuve (4), sur un dépôt qui
   rejoue le cas.

   Lance : node scripts/verifie-la-generation-precedente.mjs */

let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const ecrit = (dossier, f, contenu) => {
  mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
  writeFileSync(path.join(dossier, f), contenu);
};

const bac = mkdtempSync(path.join(os.tmpdir(), 'generation-'));
const clone = path.join(bac, 'clone');
mkdirSync(clone);
git(['init', '-q', '-b', 'main'], clone);
git(['config', 'user.name', 'banc'], clone);
git(['config', 'user.email', 'banc@exemple.test'], clone);

/* Génération 1 : A. Génération 2 (HEAD) : B ajouté, A gardé, une photo. */
ecrit(clone, 'assets/main-AAAAAAAA.js', 'a');
ecrit(clone, 'index.html', 'un');
git(['add', '-A'], clone); git(['commit', '-qm', 'g1'], clone);
ecrit(clone, 'assets/main-BBBBBBBB.js', 'b');
ecrit(clone, 'assets/main-BBBBBBBB.css', 'b');
ecrit(clone, 'assets/photos/site/photo.jpg', 'photo');
ecrit(clone, 'index.html', 'deux');
git(['add', '-A'], clone); git(['commit', '-qm', 'g2'], clone);

/* ── (1) LA GÉNÉRATION PRÉCÉDENTE, C'EST CE QUE HEAD A AJOUTÉ ─────── */
const precedents = generationPrecedente(clone);
dit('la génération précédente est ce que le dernier commit a ajouté, haché seulement',
  ['assets/main-BBBBBBBB.css', 'assets/main-BBBBBBBB.js'], [...precedents].sort());
dit('… A, d’il y a deux générations, n’en est pas', false, precedents.includes('assets/main-AAAAAAAA.js'));
dit('… ni la photo, qui n’est pas hachée', false, precedents.includes('assets/photos/site/photo.jpg'));

/* ── (1 bis) SUR UN CLONE PEU PROFOND, COMME LA PUBLICATION ──────────
   La publication ne travaille pas dans le dépôt : elle le clone. À
   profondeur 1, HEAD n'a pas de parent et la lecture est vide (c'est ainsi
   que la première garde n'a rien gardé, le 28 septembre au matin) ; à
   profondeur 2, le parent est là et la lecture est juste. */
const origine = path.join(bac, 'origine.git');
git(['clone', '-q', '--bare', clone, origine], bac);
const peuProfond = path.join(bac, 'peu-profond');
const origineUrl = `file:///${origine.replace(/\\/g, '/').replace(/^\//, '')}`;
git(['clone', '-q', '--depth', '2', origineUrl, peuProfond], bac);
dit('sur un clone à profondeur 2, la même lecture', ['assets/main-BBBBBBBB.css', 'assets/main-BBBBBBBB.js'],
  [...generationPrecedente(peuProfond)].sort());
const tropPeu = path.join(bac, 'trop-peu');
git(['clone', '-q', '--depth', '1', origineUrl, tropPeu], bac);
dit('… à profondeur 1, HEAD sans parent compte TOUT comme ajouté : une génération de trop (A revient)', true,
  generationPrecedente(tropPeu).includes('assets/main-AAAAAAAA.js'));

/* ── (2) ON REJOUE LA PUBLICATION : effacer, copier C, garder B ──── */
const dist = path.join(bac, 'dist');
ecrit(dist, 'assets/main-CCCCCCCC.js', 'c');
ecrit(dist, 'assets/main-BBBBBBBB.css', 'b');   // encore écrite : reste à la construction
ecrit(dist, 'index.html', 'trois');
git(['rm', '-rq', '.'], clone);
for (const f of ['assets/main-CCCCCCCC.js', 'assets/main-BBBBBBBB.css', 'index.html']) ecrit(clone, f, readFileSync(path.join(dist, f), 'utf8'));
const gardes = gardeLaGenerationPrecedente(dist, clone, precedents);
dit('le script de la génération précédente est gardé', ['assets/main-BBBBBBBB.js'], gardes);
dit('… et il est bien de retour dans le clone', true, existsSync(path.join(clone, 'assets/main-BBBBBBBB.js')));
dit('… la feuille encore écrite par la construction n’est pas « reprise »', false, gardes.includes('assets/main-BBBBBBBB.css'));
dit('… A, deux générations en arrière, ne revient pas', false, existsSync(path.join(clone, 'assets/main-AAAAAAAA.js')));
dit('… la photo, effacée par la construction, ne revient pas non plus', false, existsSync(path.join(clone, 'assets/photos/site/photo.jpg')));
dit('la comparaison ne compte pas le fichier gardé « en trop »', [], ecarts(dist, clone, new Set(gardes)));
dit('… alors que sans la porte, elle annulerait la publication', ['EN TROP   assets/main-BBBBBBBB.js'], ecarts(dist, clone));

/* ── (3) LA LETTRE DE LA PUBLICATION ─────────────────────────────── */
const src = readFileSync(path.join(import.meta.dirname, 'publie.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const LIT = "const precedents = REFONDE ? [] : generationPrecedente(clone);";
const EFFACE = "if (!REFONDE) git(['rm', '-rq', '.'], clone);";
const GARDE = 'const gardes = gardeLaGenerationPrecedente(dist, clone, precedents);';
const COMPARE = 'const liste = ecarts(dist, clone, repris);';
dit('la publication lit la génération AVANT d’effacer', true,
  src.includes(LIT) && src.includes(EFFACE) && src.indexOf(LIT) < src.indexOf(EFFACE));
dit('… la garde APRÈS la copie et AVANT la comparaison', true,
  src.includes(GARDE) && src.indexOf(EFFACE) < src.indexOf(GARDE) && src.indexOf(GARDE) < src.indexOf(COMPARE));
dit('… et passe les fichiers gardés à la porte de la comparaison', true, /for \(const f of gardes\) repris\.add\(f\);/.test(src));
dit('… et clone à profondeur 2, pour que HEAD ait un parent', true, src.includes("['clone', '--depth', '2', '--branch', branche, '-q', origine, clone]"));
dit('… la génération précédente AJOUTE ce que ses pages appellent à ce que son commit a ajouté', true,
  src.includes('return [...new Set([...ajoutes, ...appelesParLaGeneration(clone)])].sort();'));
dit('… la lecture part de ce qui n’est pas haché : les pages, sw.js, les manifestes', true,
  src.includes('const aLire = tous.filter((f) => !EST_HACHE.test(f) && SE_LIT.test(f));'));

/* ── (4) LE MORCEAU ANCIEN, QUE LA DERNIÈRE PUBLICATION N'AVAIT PAS TOUCHÉ ──
   Génération 1 : tout. Génération 2 (HEAD) : seul `main` change, et la
   publication garde l'ancien `main-A`. Rien d'autre n'est « ajouté » : le
   morceau du sceau, le commun, la feuille, la police et le script du
   service worker datent de la génération 1, et la génération 2 les appelle
   toujours. Génération 3 : la construction remplace le morceau du sceau. */
const ancien = path.join(bac, 'ancien');
mkdirSync(ancien);
git(['init', '-q', '-b', 'main'], ancien);
git(['config', 'user.name', 'banc'], ancien);
git(['config', 'user.email', 'banc@exemple.test'], ancien);
const SCEAU_1 = 'assets/le-sceau-pur-Zs-_MtuY.js';     // un hash peut porter « - » et « _ »
const POLICE = 'assets/Cormorant Garamond-FFFFFFFF.woff2';   // un nom peut porter une espace
ecrit(ancien, 'index.html', '<script type="module" crossorigin src="/trone/assets/main-AAAAAAAA.js"></script>');
ecrit(ancien, 'regler.html', '<link rel="modulepreload" href="/trone/assets/regler-RRRRRRRR.js">');
ecrit(ancien, 'sw.js', 'self.__precache=["assets/hors-HHHHHHHH.js","index.html"];');
ecrit(ancien, 'assets/main-AAAAAAAA.js', 'import{a}from"./commun-OOOOOOOO.js";const d=["assets/page-PPPPPPPP.css"];');
ecrit(ancien, 'assets/regler-RRRRRRRR.js', 'import{a}from"./le-sceau-pur-Zs-_MtuY.js";');
ecrit(ancien, SCEAU_1, 'export const a=1;');
ecrit(ancien, 'assets/commun-OOOOOOOO.js', 'export const a=1;');
ecrit(ancien, 'assets/page-PPPPPPPP.css', '@font-face{src:url(./Cormorant%20Garamond-FFFFFFFF.woff2)}');
ecrit(ancien, POLICE, 'police');
ecrit(ancien, 'assets/hors-HHHHHHHH.js', 'export const h=1;');
ecrit(ancien, 'assets/photos/site/photo.jpg', 'photo');
git(['add', '-A'], ancien); git(['commit', '-qm', 'g1'], ancien);
ecrit(ancien, 'index.html', '<script type="module" crossorigin src="/trone/assets/main-BBBBBBBB.js"></script>');
ecrit(ancien, 'assets/main-BBBBBBBB.js', 'import{a}from"./commun-OOOOOOOO.js";const d=["assets/page-PPPPPPPP.css"];');
git(['add', '-A'], ancien); git(['commit', '-qm', 'g2'], ancien);

const ajoutesSeuls = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '--diff-filter=A', 'HEAD'], ancien)
  .split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
dit('le dernier commit n’a ajouté que le script neuf : l’ancienne lecture, seule, ne voyait que lui', ['assets/main-BBBBBBBB.js'], ajoutesSeuls);
const TOUT_CE_QU_ELLE_APPELLE = [
  POLICE, 'assets/commun-OOOOOOOO.js', 'assets/hors-HHHHHHHH.js', SCEAU_1,
  'assets/main-BBBBBBBB.js', 'assets/page-PPPPPPPP.css', 'assets/regler-RRRRRRRR.js',
];
const precedents2 = generationPrecedente(ancien);
dit('la génération précédente, c’est tout ce que ses pages appellent, de proche en proche', TOUT_CE_QU_ELLE_APPELLE, precedents2);
dit('… le morceau ancien en est, par regler.html puis son script', true, precedents2.includes(SCEAU_1));
dit('… la police en est, par le script, la feuille, puis son nom encodé', true, precedents2.includes(POLICE));
dit('… le script que seul sw.js nomme en est', true, precedents2.includes('assets/hors-HHHHHHHH.js'));
dit('… main-A, gardé de la génération 1, n’en est pas : plus aucune page ne l’appelle', false, precedents2.includes('assets/main-AAAAAAAA.js'));
dit('… ni la photo', false, precedents2.includes('assets/photos/site/photo.jpg'));
dit('la lecture des pages, seule, rend la même liste', TOUT_CE_QU_ELLE_APPELLE, appelesParLaGeneration(ancien));

/* Comme la publication : sur un clone à profondeur 2. */
const origine2 = path.join(bac, 'ancien.git');
git(['clone', '-q', '--bare', ancien, origine2], bac);
const peuProfond2 = path.join(bac, 'ancien-peu-profond');
git(['clone', '-q', '--depth', '2', `file:///${origine2.replace(/\\/g, '/').replace(/^\//, '')}`, peuProfond2], bac);
dit('sur un clone à profondeur 2, la même lecture', TOUT_CE_QU_ELLE_APPELLE, generationPrecedente(peuProfond2));

/* Génération 3 : le morceau du sceau est remplacé, `main` et `regler` aussi. */
const dist3 = path.join(bac, 'dist3');
const SCEAU_2 = 'assets/le-sceau-pur-Dv-IZ_M2.js';
ecrit(dist3, 'index.html', '<script type="module" crossorigin src="/trone/assets/main-CCCCCCCC.js"></script>');
ecrit(dist3, 'regler.html', '<link rel="modulepreload" href="/trone/assets/regler-SSSSSSSS.js">');
ecrit(dist3, 'sw.js', 'self.__precache=["assets/hors-HHHHHHHH.js","index.html"];');
ecrit(dist3, 'assets/main-CCCCCCCC.js', 'import{a}from"./commun-OOOOOOOO.js";const d=["assets/page-PPPPPPPP.css"];');
ecrit(dist3, 'assets/regler-SSSSSSSS.js', 'import{a}from"./le-sceau-pur-Dv-IZ_M2.js";');
ecrit(dist3, SCEAU_2, 'export const a=2;');
ecrit(dist3, 'assets/commun-OOOOOOOO.js', 'export const a=1;');
ecrit(dist3, 'assets/page-PPPPPPPP.css', '@font-face{src:url(./Cormorant%20Garamond-FFFFFFFF.woff2)}');
ecrit(dist3, POLICE, 'police');
ecrit(dist3, 'assets/hors-HHHHHHHH.js', 'export const h=1;');
git(['rm', '-rq', '.'], ancien);
const DIST3 = ['index.html', 'regler.html', 'sw.js', 'assets/main-CCCCCCCC.js', 'assets/regler-SSSSSSSS.js', SCEAU_2,
  'assets/commun-OOOOOOOO.js', 'assets/page-PPPPPPPP.css', POLICE, 'assets/hors-HHHHHHHH.js'];
for (const f of DIST3) ecrit(ancien, f, readFileSync(path.join(dist3, f)));
const gardes3 = gardeLaGenerationPrecedente(dist3, ancien, precedents2);
dit('le morceau ancien, remplacé, reste servi : avec le script et la page qui l’appelaient', [SCEAU_1, 'assets/main-BBBBBBBB.js', 'assets/regler-RRRRRRRR.js'], gardes3);
dit('… il est bien de retour dans le clone, à l’identique', 'export const a=1;', existsSync(path.join(ancien, SCEAU_1)) ? readFileSync(path.join(ancien, SCEAU_1), 'utf8') : null);
dit('… ce que la construction écrit encore n’est pas « repris »', false, gardes3.some((f) => ['assets/commun-OOOOOOOO.js', 'assets/page-PPPPPPPP.css', POLICE, 'assets/hors-HHHHHHHH.js'].includes(f)));
dit('… main-A, deux générations en arrière, ne revient pas', false, existsSync(path.join(ancien, 'assets/main-AAAAAAAA.js')));
dit('… et la comparaison passe : rien d’absent, rien de différent, rien « en trop »', [], ecarts(dist3, ancien, new Set(gardes3)));
dit('avec l’ancienne lecture, le morceau ancien partait', false, ajoutesSeuls.includes(SCEAU_1));

rmSync(bac, { recursive: true, force: true });
console.log(ko === 0 ? '\nLa génération précédente reste servie.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
