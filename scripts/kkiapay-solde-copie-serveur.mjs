/* LA COPIE SERVEUR DU SOLDE KKIAPAY — 26 novembre 2026.

   Une fonction Edge ne lit rien du dépôt : `kkiapay-solde` porte, entre ses
   repères, le bloc ⟨kkiapay-solde⟩ de src/shared/kkiapay-solde-pur.ts, recopié
   tel quel. `node scripts/kkiapay-solde-copie-serveur.mjs` le (re)pose, à la
   place du repère `@@BLOC:…@@` ou du bloc déjà là ;
   `scripts/verifie-le-solde-kkiapay.mjs` vérifie qu'il est identique. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { blocDe } from './tpe-copie-serveur.mjs';

const racine = path.resolve(import.meta.dirname, '..');
export const CIBLE_DU_SOLDE = 'supabase/functions/kkiapay-solde/index.ts';
export const SOURCE_DU_SOLDE = 'src/shared/kkiapay-solde-pur.ts';
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const enCrlf = readFileSync(path.join(racine, SOURCE_DU_SOLDE), 'utf8').includes('\r\n');
  let cible = lis(CIBLE_DU_SOLDE);
  const original = blocDe(lis(SOURCE_DU_SOLDE), 'kkiapay-solde');
  if (!original) throw new Error(`${SOURCE_DU_SOLDE} ne porte pas le bloc ⟨kkiapay-solde⟩`);
  const repere = `/* @@BLOC:kkiapay-solde:${SOURCE_DU_SOLDE}@@ */`;
  if (cible.includes(repere)) cible = cible.replace(repere, () => original);
  else {
    const deja = blocDe(cible, 'kkiapay-solde');
    if (!deja) throw new Error(`${CIBLE_DU_SOLDE} n'a ni le repère ni le bloc ⟨kkiapay-solde⟩`);
    cible = cible.replace(deja, () => original);
  }
  writeFileSync(path.join(racine, CIBLE_DU_SOLDE), enCrlf ? cible.replace(/\n/g, '\r\n') : cible);
  console.log(`posé : ⟨kkiapay-solde⟩ depuis ${SOURCE_DU_SOLDE}`);
}
