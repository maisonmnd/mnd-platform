/* LA COPIE SERVEUR DE LA LISTE D'ATTENTE — 26 novembre 2026 (audit B3).

   Une fonction Edge ne lit rien du dépôt : `demande-submit` porte donc,
   entre ses repères, le bloc ⟨liste-d-attente⟩ de
   `src/shared/liste-d-attente-pur.ts`, recopié tel quel.

   `node scripts/attente-copie-serveur.mjs` le (re)pose, à la place du repère
   `@@BLOC:…@@` ou du bloc déjà là. `scripts/verifie-remplir-la-semaine.mjs`
   et la règle R8 des douze lunes vérifient qu'il est identique, caractère
   pour caractère. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const CIBLE = 'supabase/functions/demande-submit/index.ts';
export const BLOCS_DE_L_ATTENTE = [['liste-d-attente', 'src/shared/liste-d-attente-pur.ts']];

const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
export function blocDe(texte, nom) {
  const ouvre = `/* ⟨${nom}⟩ */`;
  const ferme = `/* ⟨/${nom}⟩ */`;
  const i = texte.indexOf(ouvre);
  const k = texte.indexOf(ferme, i);
  return i < 0 || k < 0 ? null : texte.slice(i, k + ferme.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  /* La cible garde ses fins de ligne (CRLF sous Windows) : on travaille en LF. */
  const enCrlf = readFileSync(path.join(racine, CIBLE), 'utf8').includes('\r\n');
  let cible = lis(CIBLE);
  for (const [nom, source] of BLOCS_DE_L_ATTENTE) {
    const original = blocDe(lis(source), nom);
    if (!original) throw new Error(`${source} ne porte pas le bloc ⟨${nom}⟩`);
    const repere = `/* @@BLOC:${nom}:${source}@@ */`;
    if (cible.includes(repere)) cible = cible.replace(repere, () => original);
    else {
      const deja = blocDe(cible, nom);
      if (!deja) throw new Error(`${CIBLE} n'a ni le repère ni le bloc ⟨${nom}⟩`);
      cible = cible.replace(deja, () => original);
    }
    console.log(`posé : ⟨${nom}⟩ depuis ${source}`);
  }
  writeFileSync(path.join(racine, CIBLE), enCrlf ? cible.replace(/\n/g, '\r\n') : cible);
}
