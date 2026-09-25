import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneObstine } from './publie.mjs';

/* LE CLONE SE RENOUE, EPROUVE (25 septembre 2026).

   Le clone du Trone est tombe sur « RPC failed; curl 56 ». La publication a
   compte un echec et continue sans lui : six sites partis, le Trone reste a
   l'ancienne version, et le correctif de connexion jamais servi. Ce harnais
   tient la REGLE, pas le cas du jour :

     (1) un clone qui reussit du premier coup ne reessaie pas ;
     (2) un clone qui echoue d'abord et peut reussir ensuite REUSSIT ;
     (3) un clone qui echoue toujours finit par renoncer, il ne boucle pas ;
     (4) et le dossier est vide entre deux essais, sinon le second echouerait
         pour une autre raison que le premier.

   Lancer : node scripts/verifie-le-clone-se-renoue.mjs */

let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const bac = mkdtempSync(path.join(os.tmpdir(), 'renoue-'));
const dit_git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* Un vrai depot, local : le harnais ne depend d'aucun reseau. */
const source = path.join(bac, 'source');
mkdirSync(source);
dit_git(['init', '-q', '-b', 'gh-pages'], source);
dit_git(['config', 'user.email', 'harnais@local'], source);
dit_git(['config', 'user.name', 'harnais'], source);
writeFileSync(path.join(source, 'index.html'), 'la maison\n');
dit_git(['add', '-A'], source);
dit_git(['commit', '-q', '-m', 'depart'], source);

/* On compte les reessais en ecoutant ce que la fonction annonce. */
const vrai = console.log;
let annonces = [];
const ecoute = () => { annonces = []; console.log = (m) => annonces.push(String(m)); };
const rends = () => { console.log = vrai; return annonces.filter((m) => m.includes('nouvel essai')).length; };

/* (1) LE CAS DROIT : rien a renouer. */
let cible = path.join(bac, 'un');
ecoute();
cloneObstine(source, 'gh-pages', cible);
let n = rends();
dit('un clone qui passe ne reessaie pas', 0, n);
dit('... et il a bien rapporte le depot', true, existsSync(path.join(cible, 'index.html')));

/* (2) et (4) LE CAS TORDU, CELUI QUI A COUTE LE TRONE. Le dossier n'est pas
   vide : `git clone` refuse. C'est un echec REEL au premier essai, suivi d'une
   reussite au second SI et SEULEMENT SI la fonction vide entre les deux. */
cible = path.join(bac, 'deux');
mkdirSync(cible);
writeFileSync(path.join(cible, 'reste-d-un-clone-coupe.tmp'), 'moitie\n');
ecoute();
cloneObstine(source, 'gh-pages', cible);
n = rends();
dit('un premier essai perdu ne perd pas le site', true, n >= 1);
dit('... le depot est bien la au bout du compte', true, existsSync(path.join(cible, 'index.html')));
dit('... et le reste du clone coupe a ete balaye', false,
  existsSync(path.join(cible, 'reste-d-un-clone-coupe.tmp')));

/* (3) ON NE BOUCLE PAS. Une origine qui n'existe pas echoue toujours : la
   fonction doit renoncer et dire pourquoi, pas tourner sans fin. */
cible = path.join(bac, 'trois');
ecoute();
let creve = null;
try { cloneObstine(path.join(bac, 'nulle-part'), 'gh-pages', cible); } catch (e) { creve = e; }
n = rends();
dit('une origine morte finit par faire renoncer', true, creve !== null);
dit('... apres trois tentatives, pas plus', 3, n);

/* (5) ET LA PUBLICATION S'EN SERT-ELLE ? CE CONTROLE COMBLE UN TROU, ET LE
   TROU MERITE D'ETRE RACONTE. En remettant les pannes une a une, celle-ci n'a
   rien declenche : le harnais appelle `cloneObstine` lui-meme, donc on pouvait
   remettre le `git clone` nu dans la boucle des sites et tout restait vert. Le
   renouage aurait vecu dans une fonction que plus personne n'appelle.
   On lit donc la lettre du fichier, commentaires otes, pour qu'une phrase qui
   parle du clone ne passe pas pour un appel. */
const source_mjs = readFileSync(new URL('./publie.mjs', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
dit('la boucle des sites passe par le renouage', true,
  /cloneObstine\(origine, branche, clone\);/.test(source_mjs));
dit('... et plus aucun clone nu ne subsiste dans la boucle', 1,
  (source_mjs.match(/git\(\['clone'/g) ?? []).length);

rmSync(bac, { recursive: true, force: true });
console.log(ko === 0 ? '\nLe clone se renoue.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
