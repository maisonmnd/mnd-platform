/* LE NOM DE LA MAISON, ÉPROUVÉ — `node scripts/verifie-le-nom-de-la-maison.mjs`.

   « Le nom de la marque est Maison MND. Change partout » (Yéman,
   23 septembre 2026). Le nom des documents a suivi le jour même ; le nom de
   la BRANCHE, lu par le sélecteur du Trône, est resté « L'atelier MND » une
   journée de plus. Une faute qui revient malgré une note appelle une
   vérification : ce harnais tient la règle de correction, pure, et vérifie
   que les deux migrations ne partent que du Trône. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { corrigeLAncienNom, DEFAULT_IDENTITY } from '../src/shared/identite';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

dit('le nom par defaut est Maison MND', 'Maison MND', DEFAULT_IDENTITY.nom);
for (const v of ["L'atelier MND", "L’Atelier MND", "l'atelier mnd", "  L' atelier   MND  ", "L'ATELIER MND"]) {
  dit(`« ${v} » se corrige`, 'Maison MND', corrigeLAncienNom(v));
}
for (const v of ['Maison MND', "L'atelier MND Kids", 'Studio ACƆ', 'Ma Maison', '', null, undefined]) {
  dit(`« ${String(v)} » reste tel quel`, null, corrigeLAncienNom(v));
}

const identite = readFileSync(path.join(process.cwd(), 'src/shared/identite.ts'), 'utf8');
const sansCommentaires = identite.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/^[ \t]*\/\/.*$/gm, '');
dit('les deux migrations existent', true, /export function migreLeNomDeLaMaison\(/.test(sansCommentaires) && /export function migreLeNomDeLaBranche\(/.test(sansCommentaires));
dit('... et aucune ne se declenche au chargement du module', false, /^\s*migreLeNomDe(?:LaMaison|LaBranche)\(\);?\s*$/m.test(sansCommentaires));
dit('... et toutes deux expirent au 31 decembre 2026', true, sansCommentaires.includes("Date.parse('2026-12-31T23:59:59+01:00')"));

const trone = readFileSync(path.join(process.cwd(), 'src/apps/trone/main.tsx'), 'utf8');
dit('le Trone les appelle toutes les deux', true, /migreLeNomDeLaMaison\(\);/.test(trone) && /migreLeNomDeLaBranche\(\);/.test(trone));
for (const app of ['couronne', 'revelateur', 'lokaa', 'academie', 'consultation', 'certificat']) {
  let src = '';
  for (const f of ['main.tsx', 'main.ts']) {
    try { src += readFileSync(path.join(process.cwd(), `src/apps/${app}/${f}`), 'utf8'); } catch { /* pas cette forme */ }
  }
  dit(`... et ${app} ne les appelle pas`, false, /migreLeNomDeLa(?:Maison|Branche)\(/.test(src));
}

if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
