import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/* UNE CLE, UN MAGASIN — `node scripts/verifie-cles-uniques.mjs`.

   Le 18 septembre 2026, on a trouve deux magasins sur la meme cle
   `mnd_fournisseurs` : le carnet du Stock (table `fournisseurs`) et celui des
   Depenses (document `mnd_fournisseurs`). Deux magasins sur une meme case du
   navigateur n'en font qu'un, et chacun renvoyait a SON serveur ce que l'autre
   avait ecrit : pendant dix-sept jours, les deux carnets se sont melanges sans
   un message d'erreur.

   Ce garde lit tout `src/` et refuse :
     - deux `createStore` sur la meme cle ;
     - deux `bindDocument` sur le meme document ;
     - deux `bindCollection` sur la meme table.
   Un premier argument remplace `src/` (pour l'eprouver sur un faux arbre). */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.resolve(process.argv[2] ?? path.join(racine, 'src'));

const fichiers = [];
const parcours = (d) => {
  for (const nom of readdirSync(d)) {
    const p = path.join(d, nom);
    if (statSync(p).isDirectory()) { if (nom !== 'node_modules') parcours(p); }
    else if (/\.(ts|tsx)$/.test(nom)) fichiers.push(p);
  }
};
parcours(dossier);

/* Le generique peut contenir des parentheses (`createStore<Record<string, (x: T) => U>>`) :
   on cherche la cle en premier argument litteral, apres un generique quelconque. */
const MOTIFS = {
  magasin: /\bcreateStore\s*(?:<[\s\S]*?>)?\s*\(\s*(['"`])([^'"`]+)\1/g,
  document: /\bbindDocument\s*\(\s*[\w.]+\s*,\s*(['"`])([^'"`]+)\1/g,
  table: /\bbindCollection\s*\(\s*[\w.]+\s*,\s*(['"`])([^'"`]+)\1/g,
};

const vus = { magasin: new Map(), document: new Map(), table: new Map() };
let appelsDeMagasin = 0;
for (const f of fichiers) {
  const texte = readFileSync(f, 'utf8');
  appelsDeMagasin += (texte.match(/\bcreateStore\s*[<(]/g) ?? []).length;
  for (const [genre, motif] of Object.entries(MOTIFS)) {
    for (const m of texte.matchAll(motif)) {
      if (genre === 'magasin' && /export function createStore/.test(texte.slice(Math.max(0, m.index - 16), m.index + 12))) continue;
      const ligne = texte.slice(0, m.index).split('\n').length;
      const ou = `${path.relative(racine, f).replaceAll('\\', '/')}:${ligne}`;
      const liste = vus[genre].get(m[2]) ?? [];
      liste.push(ou);
      vus[genre].set(m[2], liste);
    }
  }
}

let ko = 0;
for (const [genre, carte] of Object.entries(vus)) {
  for (const [cle, ou] of carte) {
    if (ou.length > 1) {
      ko++;
      console.log(`ECHEC  ${genre} « ${cle} » pris ${ou.length} fois : ${ou.join(' ; ')}`);
    }
  }
}

/* Une cle qu'on n'a pas su lire serait une cle qu'on ne garde pas : chaque
   appel a `createStore` doit avoir ete compte. */
const lus = [...vus.magasin.values()].reduce((n, ou) => n + ou.length, 0);
const definitions = fichiers.filter((f) => /export function createStore/.test(readFileSync(f, 'utf8'))).length;
if (lus !== appelsDeMagasin - definitions) {
  ko++;
  console.log(`ECHEC  ${appelsDeMagasin - definitions} appels a createStore, ${lus} cles lues : une cle n'est pas litterale.`);
}

console.log(`${lus} magasins, ${vus.document.size} documents, ${vus.table.size} tables lus dans ${fichiers.length} fichiers.`);
console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
