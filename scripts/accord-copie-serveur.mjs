/* LA COPIE SERVEUR DE L'ACCORD DES NOUVELLES — 26 novembre 2026.

   Une fonction Edge ne lit rien du dépôt : `regler-la-seance` porte donc,
   entre ses repères, le bloc ⟨accord-des-nouvelles⟩ de
   src/shared/accord-des-nouvelles-pur.ts, recopié tel quel.

   `node scripts/accord-copie-serveur.mjs` le (re)pose, à la place du repère
   `@@BLOC:…@@` ou du bloc déjà là. `scripts/verifie-l-accord-d-un-bouton.mjs`
   vérifie qu'il est identique, caractère pour caractère. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
export const CIBLES_DE_L_ACCORD = ['supabase/functions/regler-la-seance/index.ts'];
export const SOURCE_DE_L_ACCORD = 'src/shared/accord-des-nouvelles-pur.ts';
export const NOM_DU_BLOC = 'accord-des-nouvelles';

const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
export function blocDe(texte, nom) {
  const ouvre = `/* ⟨${nom}⟩ */`;
  const ferme = `/* ⟨/${nom}⟩ */`;
  const i = texte.indexOf(ouvre);
  const k = texte.indexOf(ferme, i);
  return i < 0 || k < 0 ? null : texte.slice(i, k + ferme.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const original = blocDe(lis(SOURCE_DE_L_ACCORD), NOM_DU_BLOC);
  if (!original) throw new Error(`${SOURCE_DE_L_ACCORD} ne porte pas le bloc ⟨${NOM_DU_BLOC}⟩`);
  for (const cible of CIBLES_DE_L_ACCORD) {
    const brut = readFileSync(path.join(racine, cible), 'utf8');
    const enCrlf = brut.includes('\r\n');
    let texte = brut.replace(/\r\n/g, '\n');
    const repere = `/* @@BLOC:${NOM_DU_BLOC}:${SOURCE_DE_L_ACCORD}@@ */`;
    if (texte.includes(repere)) texte = texte.replace(repere, () => original);
    else {
      const deja = blocDe(texte, NOM_DU_BLOC);
      if (!deja) throw new Error(`${cible} n'a ni le repère ni le bloc ⟨${NOM_DU_BLOC}⟩`);
      texte = texte.replace(deja, () => original);
    }
    writeFileSync(path.join(racine, cible), enCrlf ? texte.replace(/\n/g, '\r\n') : texte);
    console.log(`posé : ⟨${NOM_DU_BLOC}⟩ dans ${cible}`);
  }
}
