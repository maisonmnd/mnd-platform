/* L'ORDRE DES CALCULS — `node scripts/verifie-l-ordre-des-calculs.mjs` (21 octobre 2026).

   « Les tendances » ne s'ouvrait pas chez Yéman (« Cannot access 'U' before
   initialization ») : le calcul du revenu (`useMemo`, exécuté PENDANT le
   rendu) appelait `regleEntre`, une constante déclarée soixante lignes plus
   bas dans le même composant. Tant qu'aucune facture n'était là, la ligne
   fautive ne s'exécutait jamais : le banc hors ligne, vide, ouvrait l'écran
   sans peine. TypeScript ne le voit pas (l'appel est dans une fonction), le
   projet n'a pas d'ESLint.

   La règle, pour tout le code : ce qui s'exécute TOUT DE SUITE (le corps d'une
   instruction, le rappel d'un useMemo / useState / useReducer, d'un .map,
   .filter, .reduce…, une fonction locale appelée sur-le-champ, de proche en
   proche) ne lit aucune constante (`const`, `let`) déclarée PLUS BAS dans le
   même corps de fonction ou de module. Un rappel qui attend (useEffect,
   useCallback, onClick…) a le droit : il s'exécute quand tout est déclaré.

   `--fichier <chemin>` juge un seul fichier (pour éprouver le banc sur une
   ancienne version, sans toucher aux sources). Sortie en ASCII (console
   Windows). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const racine = path.resolve(import.meta.dirname, '..');
const iFichier = process.argv.indexOf('--fichier');
const sources = iFichier > 0
  ? [path.resolve(process.argv[iFichier + 1])]
  : readdirSync(path.join(racine, 'src'), { recursive: true })
    .map((f) => String(f).replace(/\\/g, '/'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => path.join(racine, 'src', f));

/* Les rappels exécutés sur-le-champ. `then`, `setTimeout`, les crochets
   d'effet et les gestionnaires n'y sont pas : ils attendent. */
const TOUT_DE_SUITE = new Set([
  'useMemo', 'useState', 'useReducer',
  'map', 'filter', 'reduce', 'reduceRight', 'forEach', 'some', 'every', 'find', 'findIndex',
  'findLast', 'findLastIndex', 'flatMap', 'sort', 'toSorted', 'from', 'replace', 'replaceAll',
]);

const estFonction = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)
  || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const nomAppele = (appel) => {
  const c = appel.expression;
  return ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
};
/** La fonction s'exécute-t-elle sur-le-champ ? (argument d'un rappel immédiat, ou appelée aussitôt) */
function immediate(f) {
  /* Une fonction `async` rend la main à son premier `await` : la suite
     s'exécute quand tout est déclaré. On ne la suit pas. */
  if (f.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return false;
  let p = f.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  if (p && ts.isCallExpression(p)) {
    if (p.expression === f || (ts.isParenthesizedExpression(p.expression) && p.expression.expression === f)) return true;
    if (p.arguments.includes(f) || p.arguments.some((a) => ts.isParenthesizedExpression(a) && a.expression === f)) {
      return TOUT_DE_SUITE.has(nomAppele(p));
    }
  }
  return false;
}
/** Tous les noms liés DANS une fonction (paramètres, déclarations) : ils cachent ceux du dehors. */
function nomsLies(f) {
  const noms = new Set();
  const lie = (nom) => {
    if (!nom) return;
    if (ts.isIdentifier(nom)) noms.add(nom.text);
    else if (ts.isObjectBindingPattern(nom) || ts.isArrayBindingPattern(nom)) nom.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) lie(e.name); });
  };
  f.parameters?.forEach((p) => lie(p.name));
  const visite = (x) => {
    if (ts.isVariableDeclaration(x)) lie(x.name);
    if ((ts.isFunctionDeclaration(x) || ts.isClassDeclaration(x)) && x.name) noms.add(x.name.text);
    if (ts.isCatchClause(x) && x.variableDeclaration) lie(x.variableDeclaration.name);
    if (x !== f && estFonction(x)) { x.parameters?.forEach((p) => lie(p.name)); }
    ts.forEachChild(x, visite);
  };
  if (f.body) visite(f.body);
  return noms;
}
/** L'identifiant est-il une LECTURE (pas une clé, un nom de propriété, une déclaration) ? */
function estUneLecture(id) {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if (ts.isJsxAttribute(p) && p.name === id) return false;
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === id) return /^[A-Z]/.test(id.text) && !ts.isJsxClosingElement(p);
  if (ts.isVariableDeclaration(p) && p.name === id) return false;
  if (ts.isBindingElement(p) && (p.name === id || p.propertyName === id)) return false;
  if (ts.isParameter(p) && p.name === id) return false;
  if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isMethodDeclaration(p)
    || ts.isPropertyDeclaration(p) || ts.isEnumMember(p) || ts.isPropertySignature(p)) && p.name === id) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if (ts.isQualifiedName(p)) return false;
  /* `import { fmtDay as jourDesFinances }` et `export { x }` ne lisent rien. */
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  return true;
}
/** Les noms déclarés DANS une instruction, hors de sa propre déclaration de
    tête : un `let curseur` dans un bloc cache le `curseur` du dessous. */
function nomsInterieurs(s) {
  const noms = new Set();
  const lie = (nom) => {
    if (!nom) return;
    if (ts.isIdentifier(nom)) noms.add(nom.text);
    else if (ts.isObjectBindingPattern(nom) || ts.isArrayBindingPattern(nom)) nom.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) lie(e.name); });
  };
  const visite = (x) => {
    if (ts.isVariableDeclaration(x) && !(ts.isVariableStatement(s) && x.parent?.parent === s)) lie(x.name);
    if ((ts.isFunctionDeclaration(x) || ts.isClassDeclaration(x)) && x !== s && x.name) noms.add(x.name.text);
    if (ts.isCatchClause(x) && x.variableDeclaration) lie(x.variableDeclaration.name);
    if (estFonction(x)) x.parameters?.forEach((p) => lie(p.name));
    ts.forEachChild(x, visite);
  };
  visite(s);
  return noms;
}

const fautes = [];
let corps = 0;

/** Juge un corps (module ou fonction) : ses instructions, dans l'ordre. */
function jugeCorps(instructions, sf, fichier) {
  corps += 1;
  const rang = new Map(); // nom -> rang de l'instruction qui le déclare (const / let)
  const fonctions = new Map(); // nom -> fonction locale qu'on peut suivre
  instructions.forEach((s, i) => {
    if (ts.isVariableStatement(s) && (s.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) {
      for (const d of s.declarationList.declarations) {
        const lie = (nom) => {
          if (ts.isIdentifier(nom)) { rang.set(nom.text, i); return; }
          nom.elements?.forEach((e) => { if (!ts.isOmittedExpression(e)) lie(e.name); });
        };
        lie(d.name);
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          fonctions.set(d.name.text, d.initializer);
        }
      }
    }
    if (ts.isFunctionDeclaration(s) && s.name && s.body) fonctions.set(s.name.text, s);
  });
  if (rang.size === 0) return;

  instructions.forEach((s, i) => {
    if (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)
      || ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) return;
    const vues = new Set();
    const parcours = (x, caches, suivies, chemin) => {
      if (ts.isTypeNode(x) || ts.isInterfaceDeclaration(x) || ts.isTypeAliasDeclaration(x)) return;
      if (estFonction(x) || ts.isClassExpression(x)) {
        if (!estFonction(x) || !immediate(x)) return;
        const c2 = new Set([...caches, ...nomsLies(x)]);
        if (x.body) parcours(x.body, c2, suivies, chemin);
        return;
      }
      if (ts.isIdentifier(x) && estUneLecture(x) && !caches.has(x.text)) {
        const r = rang.get(x.text);
        if (r !== undefined && r > i) {
          const cle = `${x.text}@${i}`;
          if (!vues.has(cle)) {
            vues.add(cle);
            const ligne = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1;
            const decl = sf.getLineAndCharacterOfPosition(instructions[r].getStart(sf)).line + 1;
            fautes.push(`${path.relative(racine, fichier).replace(/\\/g, '/')}:${ligne}  lit "${x.text}"${chemin ? ` (par ${chemin})` : ''}, declaree plus bas, ligne ${decl}`);
          }
        }
        /* Une fonction locale appelée (ou passée à un rappel immédiat) s'exécute
           maintenant : on suit son corps, de proche en proche. */
        const f = fonctions.get(x.text);
        const p = x.parent;
        const appelee = p && ts.isCallExpression(p) && (p.expression === x || (p.arguments.includes(x) && TOUT_DE_SUITE.has(nomAppele(p))));
        if (f && appelee && !suivies.has(x.text)) {
          const s2 = new Set([...suivies, x.text]);
          const c2 = new Set([...caches, ...nomsLies(f)]);
          if (f.body) parcours(f.body, c2, s2, chemin ? `${chemin} > ${x.text}` : x.text);
        }
        return;
      }
      ts.forEachChild(x, (y) => parcours(y, caches, suivies, chemin));
    };
    parcours(s, nomsInterieurs(s), new Set(), '');
  });
}

for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  const sf = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true, fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  jugeCorps(sf.statements, sf, fichier);
  const visite = (n) => {
    if (estFonction(n) && n.body && ts.isBlock(n.body)) jugeCorps(n.body.statements, sf, fichier);
    ts.forEachChild(n, visite);
  };
  visite(sf);
}

console.log(`${sources.length} fichiers lus, ${corps} corps de fonction ou de module suivis.`);
if (fautes.length) {
  console.log(`\n${fautes.length} lecture(s) avant declaration, l ecran tomberait des que la ligne s execute :`);
  for (const f of fautes) console.log(`  ${f}`);
  console.log('\nDeclarer la constante AU-DESSUS de ce qui l execute pendant le rendu.');
  process.exit(1);
}
console.log('Aucune lecture avant declaration : l ordre des calculs tient.');
