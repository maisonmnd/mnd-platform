/* LA COPIE SERVEUR DU TPE DE POCHE — 25 novembre 2026.

   Une fonction Edge ne lit rien du dépôt : la fonction `tpe-de-poche` porte
   donc, entre leurs repères, quatre blocs recopiés tels quels :
     ⟨tpe-de-poche⟩    src/shared/tpe-de-poche-pur.ts
     ⟨en-clair⟩        src/shared/en-clair-pur.ts
     ⟨prenom-d-usage⟩  src/shared/civilite.ts
     ⟨reste-du-rdv⟩    src/shared/terminer-et-regler-pur.ts

   `node scripts/tpe-copie-serveur.mjs` les (re)pose, à la place d'un repère
   `@@BLOC:…@@` ou du bloc déjà là. `scripts/verifie-le-tpe-de-poche.mjs`
   vérifie qu'ils sont identiques, caractère pour caractère. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const CIBLE = 'supabase/functions/tpe-de-poche/index.ts';
export const BLOCS_DU_TPE = [
  ['tpe-de-poche', 'src/shared/tpe-de-poche-pur.ts'],
  ['en-clair', 'src/shared/en-clair-pur.ts'],
  ['prenom-d-usage', 'src/shared/civilite.ts'],
  ['reste-du-rdv', 'src/shared/terminer-et-regler-pur.ts'],
];

const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
export function blocDe(texte, nom) {
  const ouvre = `/* ⟨${nom}⟩ */`;
  const ferme = `/* ⟨/${nom}⟩ */`;
  const i = texte.indexOf(ouvre);
  const k = texte.indexOf(ferme, i);
  return i < 0 || k < 0 ? null : texte.slice(i, k + ferme.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  /* Les fins de ligne : le dépôt se lit en CRLF sous Windows (autocrlf), et
     verifie-en-clair compare les copies telles quelles. On travaille en LF,
     puis on rend la cible avec les fins de ligne de ses sources. */
  const enCrlf = readFileSync(path.join(racine, BLOCS_DU_TPE[0][1]), 'utf8').includes('\r\n')
    || readFileSync(path.join(racine, 'src/shared/en-clair-pur.ts'), 'utf8').includes('\r\n');
  let cible = lis(CIBLE);
  for (const [nom, source] of BLOCS_DU_TPE) {
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
