import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { domaineDuDepot, ecarts } from './publie.mjs';

/* LE DOMAINE NE SE PERD PAS DANS UNE PUBLICATION — 26 septembre 2026.

   Le 26 septembre, maisonmnd.com a rendu 404 sur TOUTES ses pages apres une
   publication ordinaire. Le nom de domaine vit dans un fichier CNAME a la
   racine du depot principal ; `build-sites` l'ecrit d'apres la configuration
   Pages lue chez GitHub, et ce jour-la la lecture a rendu vide SANS LE DIRE.
   La publication efface d'abord tout puis copie la construction : pas de
   CNAME dans la construction, plus de CNAME dans le depot, et GitHub a retire
   le domaine. La boucle s'est refermee, puisque le domaine disparu de la
   configuration ne pouvait plus etre relu.

   CE HARNAIS TIENT LA REGLE, PAS LE CAS DU JOUR :

     (1) on sait lire le domaine d'un depot, et son absence ;
     (2) une construction SANS CNAME face a un depot QUI EN A UN le reprend,
         au lieu de l'effacer ;
     (3) le fichier repris ne fait pas echouer la comparaison qui, elle, veille
         a ce que rien ne traine « en trop » — un garde-fou ne doit pas se
         retourner contre l'autre ;
     (4) et une construction QUI PORTE son CNAME reste maitresse : c'est elle
         qui decide, pas le depot.

   Lance : node scripts/verifie-le-domaine-ne-se-perd-pas.mjs */

let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const bac = mkdtempSync(path.join(os.tmpdir(), 'domaine-'));

/* ── (1) LIRE LE DOMAINE ────────────────────────────────────────── */
const depot = path.join(bac, 'depot');
mkdirSync(depot);
writeFileSync(path.join(depot, 'CNAME'), 'exemple.test\n');
dit('on lit le domaine du depot', 'exemple.test', domaineDuDepot(depot));
const nu = path.join(bac, 'nu');
mkdirSync(nu);
dit('... et son absence ne fait pas tomber', '', domaineDuDepot(nu));

/* ── (2) et (3) LA CONSTRUCTION SANS CNAME NE L'EFFACE PAS ───────────
   On rejoue exactement ce que fait la publication : lire le domaine, tout
   effacer, copier la construction, puis reprendre le domaine. */
const construction = path.join(bac, 'construction');
mkdirSync(construction);
writeFileSync(path.join(construction, 'index.html'), 'la maison\n');

const clone = path.join(bac, 'clone');
mkdirSync(clone);
writeFileSync(path.join(clone, 'CNAME'), 'exemple.test\n');
writeFileSync(path.join(clone, 'index.html'), 'ancienne page\n');

const domaine = domaineDuDepot(clone);          // AVANT d'effacer
rmSync(path.join(clone, 'index.html'));
rmSync(path.join(clone, 'CNAME'));              // `git rm -r .`
writeFileSync(path.join(clone, 'index.html'), 'la maison\n');   // la copie
const repris = new Set();
if (domaine && !existsSync(path.join(clone, 'CNAME'))) {
  writeFileSync(path.join(clone, 'CNAME'), `${domaine}\n`);
  repris.add('CNAME');
}
dit('une construction sans CNAME ne perd pas le domaine', 'exemple.test', domaineDuDepot(clone));
dit('... et la comparaison ne compte pas ce fichier « en trop »', [], ecarts(construction, clone, repris));
/* SANS LA PORTE, LA COMPARAISON ANNULERAIT LA PUBLICATION : on le montre,
   pour que personne ne retire la porte en la croyant decorative. */
dit('... alors que sans la porte, elle annulerait tout', ['EN TROP   CNAME'],
  ecarts(construction, clone));

/* ── (4) UNE CONSTRUCTION QUI PORTE SON CNAME RESTE MAITRESSE ─────── */
const c2 = path.join(bac, 'construction2');
mkdirSync(c2);
writeFileSync(path.join(c2, 'index.html'), 'la maison\n');
writeFileSync(path.join(c2, 'CNAME'), 'nouveau.test\n');
const clone2 = path.join(bac, 'clone2');
mkdirSync(clone2);
writeFileSync(path.join(clone2, 'CNAME'), 'ancien.test\n');
const d2 = domaineDuDepot(clone2);
rmSync(path.join(clone2, 'CNAME'));
writeFileSync(path.join(clone2, 'index.html'), 'la maison\n');
writeFileSync(path.join(clone2, 'CNAME'), 'nouveau.test\n');   // la copie apporte le sien
const repris2 = new Set();
if (d2 && !existsSync(path.join(clone2, 'CNAME'))) repris2.add('CNAME');
dit('un CNAME construit l’emporte sur celui du depot', 'nouveau.test', domaineDuDepot(clone2));
dit('... et rien n’est repris', [], [...repris2]);

/* ── (5) LA LETTRE DU FICHIER : la publication fait-elle bien tout ca ?
   Un harnais qui rejoue les gestes ne prouve pas que le script les fait. */
const src = readFileSync(path.join(import.meta.dirname, 'publie.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
/* ON CHERCHE L'APPEL, PAS LA FONCTION. Un premier jet cherchait
   « domaineDuDepot(clone) », qui trouve d'abord sa propre DEFINITION, placee
   plus haut dans le fichier : le controle etait donc toujours vrai, et il est
   reste muet quand on a deplace la lecture apres l'effacement. */
const APPEL = "const domaine = REFONDE ? '' : domaineDuDepot(clone);";
const EFFACE = "if (!REFONDE) git(['rm', '-rq', '.'], clone);";
dit('la publication lit le domaine AVANT d’effacer', true,
  src.includes(APPEL) && src.includes(EFFACE) && src.indexOf(APPEL) < src.indexOf(EFFACE));
dit('... le reprend quand la construction n’en donne pas', true,
  /repris\.add\('CNAME'\)/.test(src));
dit('... et le dit tout haut', true, /REPRIS du dépôt/.test(src));
dit('... en passant la porte a la comparaison', true, /ecarts\(dist, clone, repris\)/.test(src));

rmSync(bac, { recursive: true, force: true });
console.log(ko === 0 ? '\nLe domaine ne se perd pas.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
