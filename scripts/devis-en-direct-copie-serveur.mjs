/* LA COPIE DES RÈGLES DANS LA FONCTION `devis-en-direct` — 22 novembre 2026.
   Même montage que le règlement (regler-copie-serveur.mjs) : une fonction
   Edge se colle seule et n'importe rien de `src/`, elle porte donc une COPIE
   des règles de shared/devis-en-direct.ts. `node scripts/devis-en-direct-copie-serveur.mjs`
   réécrit la copie entre ses deux bornes ; le banc verifie-le-devis-en-direct
   compare les deux, mot pour mot.

   LA COPIE EST LE FICHIER ENTIER, pas déclaration par déclaration : ce
   fichier-là n'importe rien, exprès (ses constantes sont recopiées chez lui
   et le banc les compare à leurs sources). Le jour où il importera quelque
   chose, ce script le dira au lieu de produire une copie fausse. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const source = (r = racine) => path.join(r, 'src', 'shared', 'devis-en-direct.ts');
export const serveur = (r = racine) => path.join(r, 'supabase', 'functions', 'devis-en-direct', 'index.ts');
export const DEBUT = '// ── DEBUT copie de shared/devis-en-direct.ts (verifie-le-devis-en-direct la compare, mot pour mot)';
export const FIN = '// ── FIN copie de shared/devis-en-direct.ts';

/** Le texte attendu entre les bornes : le fichier, sans sa première ligne de
    commentaire de tête (la fonction a la sienne). */
export function copieAttendue(r = racine) {
  const texte = readFileSync(source(r), 'utf8').replace(/\r\n/g, '\n');
  if (/^import /m.test(texte)) throw new Error('shared/devis-en-direct.ts importe quelque chose : la copie ne peut plus être faite seule');
  return texte.trim();
}

export function copieDuServeur(r = racine) {
  const t = readFileSync(serveur(r), 'utf8').replace(/\r\n/g, '\n');
  const a = t.indexOf(DEBUT); const b = t.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('bornes de la copie introuvables dans la fonction devis-en-direct');
  return t.slice(a + DEBUT.length, b).trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = readFileSync(serveur(), 'utf8').replace(/\r\n/g, '\n');
  const a = t.indexOf(DEBUT); const b = t.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('bornes introuvables');
  writeFileSync(serveur(), `${t.slice(0, a + DEBUT.length)}\n${copieAttendue()}\n${t.slice(b)}`);
  console.log('copie de shared/devis-en-direct.ts réécrite dans supabase/functions/devis-en-direct/index.ts');
}
