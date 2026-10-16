/* L'ORDRE DES CROCHETS — `node scripts/verifie-l-ordre-des-crochets.mjs` (16 octobre 2026).

   Le 15 octobre, deux crochets (useState, useRef) ont été ajoutés à l'écran
   du Secrétariat APRÈS son « if (ouvert) return <Editeur … /> ». React veut
   les mêmes crochets, dans le même ordre, à chaque rendu : dès qu'un document
   s'ouvrait, l'écran tombait (« Cet écran ne s'est pas ouvert », erreur React
   n° 300), en ligne pendant une nuit. Aucun banc ne l'a vu ; le projet n'a pas
   d'ESLint.

   La règle, pour tout le code : dans un composant (Nom en majuscule) ou un
   crochet (useQuelqueChose), AUCUN appel de crochet après un « return » qui
   peut sortir plus tôt. Le banc lit chaque fichier avec l'analyseur de
   TypeScript (pas d'expressions régulières sur du code), suit les
   instructions de chaque fonction dans l'ordre, et crie au premier crochet
   qui suit un retour possible. `use(…)` seul (React 19) a le droit d'être
   conditionnel ; les fonctions imbriquées sont jugées à part. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const racine = path.resolve(import.meta.dirname, '..');
const sources = readdirSync(path.join(racine, 'src'), { recursive: true })
  .map((f) => String(f).replace(/\\/g, '/'))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'));

const estFonction = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);
const estCrochet = (n) => {
  if (!ts.isCallExpression(n)) return null;
  const c = n.expression;
  const nom = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
  return /^use[A-Z0-9]/.test(nom) ? nom : null;
};
/** Le nom d'une fonction : le sien, ou celui de la variable qui la reçoit (memo, forwardRef compris). */
function nomDe(f) {
  if (f.name && ts.isIdentifier(f.name)) return f.name.text;
  for (let p = f.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (!ts.isCallExpression(p) && !ts.isParenthesizedExpression(p) && !ts.isAsExpression(p)) return '';
  }
  return '';
}
/** Ce qu'un nœud contient, sans entrer dans les fonctions imbriquées. */
function cherche(n, quoi) {
  let trouve = null;
  const visite = (x) => {
    if (trouve || estFonction(x)) return;
    const r = quoi(x);
    if (r) { trouve = r; return; }
    ts.forEachChild(x, visite);
  };
  visite(n);
  return trouve;
}

const fautes = [];
let jugees = 0;
for (const f of sources) {
  const texte = readFileSync(path.join(racine, 'src', f), 'utf8');
  const sf = ts.createSourceFile(f, texte, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visite = (n) => {
    if (estFonction(n) && n.body && ts.isBlock(n.body)) {
      const nom = nomDe(n);
      if (/^[A-Z]/.test(nom) || /^use[A-Z0-9]/.test(nom)) {
        jugees += 1;
        let retour = null;
        for (const s of n.body.statements) {
          if (retour) {
            const crochet = cherche(s, estCrochet);
            if (crochet) {
              const l = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1;
              fautes.push(`${f}:${l}  ${nom} appelle ${crochet} apres le retour de la ligne ${retour}`);
              break;
            }
          }
          if (!retour && cherche(s, (x) => ts.isReturnStatement(x))) retour = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1;
        }
      }
    }
    ts.forEachChild(n, visite);
  };
  visite(sf);
}

console.log(`${sources.length} fichiers lus, ${jugees} composants et crochets suivis.`);
for (const x of fautes) console.log(`ECHEC ${x}`);
console.log(fautes.length ? `\n${fautes.length} crochet(s) apres un retour : l ecran tombera (erreur React n. 300).` : 'Aucun crochet apres un retour : l ordre des crochets tient.');
if (fautes.length) process.exitCode = 1;
