/* LES COPIES DE LA FONCTION « centre-de-commande » — 11 octobre 2026.

   Une fonction Edge n'importe rien du dépôt : les modules purs du Centre
   (src/shared/ia-*-pur.ts) y sont recopiés entre leurs repères, sans leurs
   lignes d'import. Ce script refait les copies ; le banc
   `verifie-le-centre-de-commande` crie si elles divergent.

   node scripts/copie-dans-le-centre.mjs [--verifie]
   Avec --verifie, il ne réécrit rien : il dit seulement si tout est à jour
   (code 1 sinon). */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const FONCTION = path.join(racine, 'supabase/functions/centre-de-commande/index.ts');
const DEBUT = /^\/\/ ── DÉBUT DE LA COPIE : (\S+) ──$/;
const FIN = '// ── FIN DE LA COPIE ──';

/** Le module tel qu'il se copie : sans ses lignes d'import (et sans le
    retour chariot de Windows), rien d'autre ne bouge. */
export function corpsCopiable(source) {
  return source.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^import\s/.test(l)).join('\n').trim();
}

export function copiesAJour(texteDeLaFonction, lis = (p) => readFileSync(path.join(racine, p), 'utf8')) {
  const lignes = texteDeLaFonction.replace(/\r\n/g, '\n').split('\n');
  const sortie = [];
  const ecarts = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = DEBUT.exec(lignes[i]);
    if (!m) { sortie.push(lignes[i]); continue; }
    const fin = lignes.indexOf(FIN, i + 1);
    if (fin < 0) throw new Error(`repère de fin manquant après ${m[1]}`);
    const voulu = corpsCopiable(lis(m[1]));
    const present = lignes.slice(i + 1, fin).join('\n').trim();
    if (present !== voulu) ecarts.push(m[1]);
    sortie.push(lignes[i], voulu, FIN);
    i = fin;
  }
  return { texte: sortie.join('\n'), ecarts };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('copie-dans-le-centre.mjs')) {
  const avant = readFileSync(FONCTION, 'utf8');
  const { texte, ecarts } = copiesAJour(avant);
  if (process.argv.includes('--verifie')) {
    console.log(ecarts.length ? `A REFAIRE : ${ecarts.join(', ')}` : 'Les copies sont a jour.');
    process.exit(ecarts.length ? 1 : 0);
  }
  writeFileSync(FONCTION, texte.endsWith('\n') ? texte : `${texte}\n`);
  console.log(ecarts.length ? `Copies refaites : ${ecarts.join(', ')}` : 'Les copies etaient deja a jour.');
}
