import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ecarts, gardeLaGenerationPrecedente, generationPrecedente } from './publie.mjs';

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

rmSync(bac, { recursive: true, force: true });
console.log(ko === 0 ? '\nLa génération précédente reste servie.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
