/* LE BALAYAGE DES PORTES — 17 novembre 2026. Lu par scripts/verifie-la-cle-du-cron.mjs.

   Une porte naïve, c'est une valeur LUE DANS LA REQUÊTE (en-tête, adresse,
   corps) comparée avec `===`, `!==`, `includes`, `startsWith`… à un SECRET
   lu dans l'environnement (Deno.env). Ce module la cherche dans n'importe
   quel fichier, sans connaître la fonction : il suit les deux valeurs à
   travers le code, par l'arbre syntaxique de TypeScript (pas par des
   expressions régulières sur les noms, qui ne voient que ce qu'on a déjà vu).

   CE QU'IL SUIT
     · le REÇU : le paramètre de `Deno.serve(async (req) => …)` et tout
       paramètre typé `Request`, puis ce qu'on en tire (req.headers.get(…),
       new URL(req.url).searchParams.get(…), await req.json(), un champ du
       corps, un `.trim()`, un `.replace(/^Bearer\s+/i, '')`…) ;
     · le SECRET : `Deno.env.get('…')` dont le nom dit une clé (KEY, SECRET,
       TOKEN, JETON, CLE…), un nom calculé compte toujours pour un secret ;
       puis ce qu'on en tire (`?? ''`, `.trim()`, une liste de clés, l'élément
       d'une liste, une empreinte HMAC calculée avec lui) ;
     · à travers les fonctions : chaque fonction est résumée (ce qu'elle rend,
       selon chacun de ses paramètres), et ses paramètres reçoivent ce que
       leur passent ses appels (`laPorte(req, service)`, `jetonDeLaRequete(req)`,
       `CLES_DE_SERVICE()`, `[…].some((cle) => …)`) ;
     · un objet ne porte pas le secret en bloc : seulement par champ, pour
       `const cfg = { cle: Deno.env.get('…') }` puis `cfg.cle`. Sans cela, un
       contexte qui transporte une clé de service ferait de tout un secret ;
     · une méthode posée comme champ d'objet (`telecharge: async (…, jwt)`)
       reçoit ce que lui passent les appels de ce nom (`o.base.telecharge`).

   CE QU'IL DIT (une ligne par constat)
     · « comparaison » : le reçu et le secret se comparent sans memeCle ;
     · « longueur » : une réponse (new Response, Response.json, ou toute
       fonction qui en fabrique une : json, jsonCors, avecCors, refus…) porte
       `attendueLg` / `recueLg`, la longueur d'un secret, ou une valeur qui
       en vient. Avec, s'il y en a un, le `if (… .method === 'GET' …)` qui
       l'englobe : le banc y reconnaît, nommés un par un, les contrôles de
       santé qui disent leurs secrets en longueurs EXPRÈS
       (src/shared/cle-du-cron-pur.ts, « ce qui ne change pas »).

   Il ne regarde pas : une valeur venue de la base, d'un appel réseau, d'une
   fonction qu'il ne voit pas (createClient, fetch). C'est voulu : ce sont
   d'autres portes, jugées par la base ou par le prestataire.
   Pur : il reçoit des textes et rend des constats, il ne lit aucun fichier. */
import ts from 'typescript';

/* Les drapeaux d'une valeur. Un bit par nature, puis quatre bits par
   paramètre de la fonction qu'on résume : sa valeur, sa longueur, le
   secret qu'il nomme (Deno.env.get(nom)), la longueur de ce secret. */
const SECRET = 1;
const RECU = 2;
const LG = 4;
const MAXP = 7;
const VAL = (i) => 1 << (3 + 4 * i);
const LEN = (i) => 1 << (4 + 4 * i);
const ENV = (i) => 1 << (5 + 4 * i);
const ENVLEN = (i) => 1 << (6 + 4 * i);
let PARAMS_VAL = 0;
let PARAMS_LEN = 0;
let PARAMS_ENV = 0;
let PARAMS_ENVLEN = 0;
for (let i = 0; i < MAXP; i += 1) { PARAMS_VAL |= VAL(i); PARAMS_LEN |= LEN(i); PARAMS_ENV |= ENV(i); PARAMS_ENVLEN |= ENVLEN(i); }
const VALEUR = SECRET | RECU | PARAMS_VAL | PARAMS_ENV;
const LONGUEUR = LG | PARAMS_LEN | PARAMS_ENVLEN;
/** Un objet porte le reçu et les longueurs ; le secret, lui, vit par champ. */
const OBJET = RECU | PARAMS_VAL | LONGUEUR;

/** Le nom d'une variable d'environnement qui dit une clé. */
export const NOM_DE_SECRET = /KEY|SECRET|TOKEN|JETON|CLE|PASS|PRIVATE|SID|AUTH/i;
/** Les méthodes qui rendent la même valeur, retouchée (sa nature ne change pas). */
const GARDE_LA_VALEUR = new Set(['trim', 'trimStart', 'trimEnd', 'replace', 'replaceAll', 'toLowerCase', 'toUpperCase', 'toString', 'slice',
  'substring', 'substr', 'normalize', 'filter', 'map', 'concat', 'at', 'get', 'getAll', 'json', 'text', 'formData', 'arrayBuffer', 'clone',
  'split', 'join', 'valueOf', 'flat', 'padStart', 'padEnd']);
/** Les fonctions qui rendent leurs arguments, transformés (l'empreinte HMAC comprise). */
const PASSE_LA_VALEUR = /^(String|JSON\.parse|JSON\.stringify|decodeURIComponent|encodeURIComponent|atob|btoa|Array\.from|Object\.values|Object\.entries|String\.fromCharCode|(globalThis\.)?crypto\.subtle\.\w+|.*\.encode|.*\.decode)$/;
/** Les comparaisons qui passent par une méthode. */
const COMPARE_PAR_METHODE = new Set(['includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'has', 'localeCompare']);
/** Les méthodes dont le rappel reçoit, en premier paramètre, un élément de la liste. */
const RAPPEL_PAR_ELEMENT = new Set(['some', 'every', 'find', 'findIndex', 'findLast', 'filter', 'map', 'forEach', 'flatMap']);
const EGALITE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const UNION = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.PlusToken, ts.SyntaxKind.CommaToken]);
const NOUVEAUX_QUI_GARDENT = new Set(['URL', 'Set', 'Map', 'Headers', 'URLSearchParams', 'Uint8Array', 'Request']);
/** Une méthode d'objet de ce nom-là ne se relie pas à ses appels : ce sont
    les noms du langage et du client Supabase, appelés partout. */
const METHODES_DU_LANGAGE = new Set(['get', 'set', 'has', 'map', 'filter', 'some', 'every', 'find', 'forEach', 'push', 'json', 'text', 'then',
  'catch', 'from', 'select', 'eq', 'rpc', 'upsert', 'insert', 'update', 'delete', 'single', 'maybeSingle', 'order', 'limit', 'toString',
  'trim', 'replace', 'slice', 'join', 'split', 'includes', 'indexOf', 'startsWith', 'endsWith', 'log', 'error', 'warn', 'info', 'fetch']);

const longueurDe = (t) => {
  let r = t & SECRET ? LG : 0;
  for (let i = 0; i < MAXP; i += 1) { if (t & VAL(i)) r |= LEN(i); if (t & ENV(i)) r |= ENVLEN(i); }
  return r;
};

/** Ce qu'un texte a déjà donné : la preuve rebalaie le même dépôt à chaque
    panne, et une panne ne touche qu'un fichier. */
const dejaVus = new Map();

/** Balaie des textes : Map(chemin -> texte). Rend la liste des constats
    { fichier, genre: 'comparaison' | 'longueur', ligne, texte, get }, où
    `get` est la condition du `if (… .method === 'GET' …)` dont la branche
    porte une longueur (le banc y reconnaît les contrôles de santé), sinon null. */
export function balaie(textes) {
  const cle = (f) => `${f}\0${textes.get(f)}`;
  const neufs = [...textes.keys()].filter((f) => !dejaVus.has(cle(f)));
  if (neufs.length) for (const [f, c] of balaieNeufs(new Map(neufs.map((f) => [f, textes.get(f)])))) dejaVus.set(cle(f), c);
  return [...textes.keys()].flatMap((f) => dejaVus.get(cle(f)));
}

function balaieNeufs(textes) {
  const chemins = [...textes.keys()];
  const virtuel = (f) => `/v/${f}`;
  const arbres = new Map();
  /* `export {}` en queue : chaque texte est un module, ses noms ne se
     mêlent pas à ceux des autres. */
  const hote = {
    getSourceFile: (f, langue) => {
      if (!arbres.has(f)) {
        const t = textes.get(f.slice(3));
        arbres.set(f, t === undefined ? undefined : ts.createSourceFile(f, `${t}\nexport {};\n`, langue, true, ts.ScriptKind.TS));
      }
      return arbres.get(f);
    },
    getDefaultLibFileName: () => '/lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (f) => textes.has(f.slice(3)),
    readFile: (f) => textes.get(f.slice(3)),
    getDirectories: () => [],
  };
  const programme = ts.createProgram(chemins.map(virtuel), { noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, hote);
  const verif = programme.getTypeChecker();
  return chemins.map((f) => [f, balaieUn(programme.getSourceFile(virtuel(f)), verif, f)]);
}

function balaieUn(sf, verif, fichier) {
  const symboles = new Map();
  const sym = (n) => { if (!symboles.has(n)) symboles.set(n, verif.getSymbolAtLocation(n) ?? null); return symboles.get(n); };
  const declDe = (s) => s?.valueDeclaration ?? s?.declarations?.[0] ?? null;
  const taches = new Map(); // symbole -> drapeaux accumulés sur tout le fichier
  const champs = new Map(); // symbole d'un objet littéral -> Map(champ -> drapeaux)
  const fonctions = [];
  const appels = [];
  const decls = [];
  const affectations = [];
  const boucles = [];
  const comparaisons = [];
  const aiguillages = [];
  const methodes = new Map(); // nom -> fonctions posées comme champ d'un objet (`telecharge: async (…) => …`)

  const visite = (n) => {
    if (ts.isFunctionLike(n) && n.body) fonctions.push(n);
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) appels.push(n);
    if (ts.isVariableDeclaration(n) && n.initializer) decls.push(n);
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.EqualsToken || k === ts.SyntaxKind.QuestionQuestionEqualsToken || k === ts.SyntaxKind.BarBarEqualsToken) affectations.push(n);
      if (EGALITE.has(k)) comparaisons.push(n);
    }
    if (ts.isForOfStatement(n)) boucles.push(n);
    if (ts.isSwitchStatement(n)) aiguillages.push(n);
    const methode = ts.isMethodDeclaration(n) && n.body ? n
      : ts.isPropertyAssignment(n) && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.initializer : null;
    if (methode && n.name && (ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) && !METHODES_DU_LANGAGE.has(n.name.text)) {
      methodes.set(n.name.text, [...(methodes.get(n.name.text) ?? []), methode]);
    }
    ts.forEachChild(n, visite);
  };
  visite(sf);

  const texteDe = (n) => n.getText(sf).replace(/\s+/g, ' ');
  const nomAppel = (e) => {
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) { const g = nomAppel(e.expression); return g ? `${g}.${e.name.text}` : `?.${e.name.text}`; }
    if (ts.isParenthesizedExpression(e)) return nomAppel(e.expression);
    if (ts.isNewExpression(e)) return `new ${nomAppel(e.expression)}`;
    return '';
  };
  const deballe = (e) => {
    let x = e;
    while (x && (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression?.(x))) x = x.expression;
    return x;
  };
  /** La fonction qu'un nom appelle, si elle est dans le fichier. */
  const fonctionDe = (appele) => {
    if (!ts.isIdentifier(appele)) return null;
    const d = declDe(sym(appele));
    if (!d) return null;
    if (ts.isFunctionDeclaration(d) && d.body) return d;
    if (ts.isVariableDeclaration(d) && d.initializer) {
      const i = deballe(d.initializer);
      if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) return i;
    }
    return null;
  };
  const fonctionEnglobante = (n) => { let p = n.parent; while (p && !(ts.isFunctionLike(p) && p.body)) p = p.parent; return p ?? null; };
  /** L'indice du paramètre de f d'où vient cette déclaration, ou -1. */
  const indiceDuParametre = (d, f) => {
    let p = d;
    while (p && (ts.isBindingElement(p) || ts.isObjectBindingPattern(p) || ts.isArrayBindingPattern(p))) p = p.parent;
    return p && f && ts.isParameter(p) && p.parent === f ? f.parameters.indexOf(p) : -1;
  };

  const ajoute = (s, d) => {
    if (!s || !d) return false;
    const avant = taches.get(s) ?? 0;
    if ((avant | d) === avant) return false;
    taches.set(s, avant | d);
    return true;
  };
  /** Lie une valeur à un nom, ou à chaque nom d'une déstructuration. */
  const lie = (nom, t) => {
    if (ts.isIdentifier(nom)) return ajoute(sym(nom), t);
    let change = false;
    const masque = ts.isObjectBindingPattern(nom) ? (RECU | PARAMS_VAL) : VALEUR;
    for (const el of nom.elements) if (ts.isBindingElement(el)) change = lie(el.name, t & masque) || change;
    return change;
  };

  /* Le reçu : le paramètre de Deno.serve, et tout paramètre typé Request. */
  for (const a of appels) {
    if (ts.isCallExpression(a) && nomAppel(a.expression) === 'Deno.serve') {
      const f = deballe(a.arguments[0]);
      if (f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && f.parameters[0]) lie(f.parameters[0].name, RECU);
    }
  }
  for (const f of fonctions) {
    for (const p of f.parameters) if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName.getText(sf) === 'Request') lie(p.name, RECU);
  }

  /* Le résumé d'une fonction : ce qu'elle rend, selon ses paramètres. */
  let resumes = new Map();
  let memo = new Map();
  const resume = (f) => {
    if (resumes.has(f)) return resumes.get(f) ?? 0;
    resumes.set(f, null); // récursion : rien, le temps du calcul
    const cx = { f, locaux: new Map() };
    const rendus = [];
    if (!ts.isBlock(f.body)) rendus.push(f.body);
    else {
      const cherche = (n) => { if (ts.isFunctionLike(n)) return; if (ts.isReturnStatement(n) && n.expression) rendus.push(n.expression); ts.forEachChild(n, cherche); };
      ts.forEachChild(f.body, cherche);
    }
    const t = rendus.reduce((x, r) => x | tache(r, cx), 0);
    resumes.set(f, t);
    return t;
  };
  /** Un résumé, rendu à un appel : chaque bit de paramètre prend la valeur de son argument. */
  const applique = (s, args, cx) => {
    let r = s & (SECRET | RECU | LG);
    for (let i = 0; i < MAXP; i += 1) {
      if (!(s & (VAL(i) | LEN(i) | ENV(i) | ENVLEN(i)))) continue;
      const a = args[i];
      const t = a ? tache(a, cx) : 0;
      if (s & VAL(i)) r |= t;
      if (s & LEN(i)) r |= longueurDe(t);
      const nomme = !a || !ts.isStringLiteralLike(a) || NOM_DE_SECRET.test(a.text);
      if ((s & ENV(i)) && nomme) r |= SECRET;
      if ((s & ENVLEN(i)) && nomme) r |= LG;
    }
    return r;
  };

  const tacheDuSymbole = (s, cx) => {
    if (!s) return 0;
    const d = declDe(s);
    if (cx.f && d) {
      const i = indiceDuParametre(d, cx.f);
      if (i >= 0) return i < MAXP ? VAL(i) : 0;
      if ((ts.isVariableDeclaration(d) || ts.isBindingElement(d)) && fonctionEnglobante(d) === cx.f) {
        if (cx.locaux.has(d)) return cx.locaux.get(d) ?? 0;
        cx.locaux.set(d, null);
        let racine = d;
        let masque = VALEUR | LONGUEUR;
        while (ts.isBindingElement(racine) || ts.isObjectBindingPattern(racine) || ts.isArrayBindingPattern(racine)) {
          if (ts.isObjectBindingPattern(racine)) masque &= RECU | PARAMS_VAL;
          if (ts.isArrayBindingPattern(racine)) masque &= VALEUR;
          racine = racine.parent;
        }
        let t = 0;
        if (ts.isVariableDeclaration(racine)) {
          if (racine.initializer) t = tache(racine.initializer, cx);
          else if (racine.parent?.parent && ts.isForOfStatement(racine.parent.parent)) t = tache(racine.parent.parent.expression, cx) & VALEUR;
        }
        t &= masque;
        cx.locaux.set(d, t);
        return t;
      }
    }
    return taches.get(s) ?? 0;
  };

  function tache(e, cx) {
    if (!e) return 0;
    if (!cx.f && memo.has(e)) return memo.get(e);
    const t = tacheBrute(e, cx);
    if (!cx.f) memo.set(e, t);
    return t;
  }
  function tacheBrute(e, cx) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)
      || ts.isAwaitExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isSpreadElement(e)) return tache(e.expression, cx);
    if (ts.isIdentifier(e)) return tacheDuSymbole(sym(e), cx);
    if (ts.isPropertyAccessExpression(e)) {
      const t = tache(e.expression, cx);
      if (e.name.text === 'length') return longueurDe(t);
      const s = ts.isIdentifier(e.expression) ? sym(e.expression) : null;
      return (t & (RECU | PARAMS_VAL)) | ((s && champs.get(s)?.get(e.name.text)) ?? 0);
    }
    if (ts.isElementAccessExpression(e)) return tache(e.expression, cx) & VALEUR;
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (UNION.has(k)) return tache(e.left, cx) | tache(e.right, cx);
      if (k === ts.SyntaxKind.EqualsToken) return tache(e.right, cx);
      return 0;
    }
    if (ts.isConditionalExpression(e)) return tache(e.whenTrue, cx) | tache(e.whenFalse, cx);
    if (ts.isTemplateExpression(e)) return e.templateSpans.reduce((t, s) => t | tache(s.expression, cx), 0);
    if (ts.isArrayLiteralExpression(e)) return e.elements.reduce((t, x) => t | tache(x, cx), 0);
    if (ts.isObjectLiteralExpression(e)) {
      let t = 0;
      for (const p of e.properties) {
        if (ts.isPropertyAssignment(p)) t |= tache(p.initializer, cx);
        else if (ts.isShorthandPropertyAssignment(p)) t |= tacheDuSymbole(verif.getShorthandAssignmentValueSymbol(p), cx);
        else if (ts.isSpreadAssignment(p)) t |= tache(p.expression, cx);
      }
      return t & OBJET;
    }
    if (ts.isNewExpression(e)) {
      if (!NOUVEAUX_QUI_GARDENT.has(nomAppel(e.expression))) return 0;
      return (e.arguments ?? []).reduce((t, x) => t | tache(x, cx), 0) & VALEUR;
    }
    if (ts.isCallExpression(e)) {
      const n = nomAppel(e.expression);
      if (n === 'Deno.env.get') {
        const a = e.arguments[0];
        if (cx.f && a && ts.isIdentifier(a)) {
          const i = indiceDuParametre(declDe(sym(a)), cx.f);
          if (i >= 0 && i < MAXP) return ENV(i);
        }
        return !a || !ts.isStringLiteralLike(a) || NOM_DE_SECRET.test(a.text) ? SECRET : 0;
      }
      if (n === 'Deno.env.toObject') return SECRET;
      if (PASSE_LA_VALEUR.test(n)) return e.arguments.reduce((t, x) => t | tache(x, cx), 0) & (VALEUR | LONGUEUR);
      const f = fonctionDe(e.expression);
      if (f) return applique(resume(f), e.arguments, cx);
      if (ts.isPropertyAccessExpression(e.expression) && GARDE_LA_VALEUR.has(e.expression.name.text)) return tache(e.expression.expression, cx) & VALEUR;
      return 0;
    }
    return 0;
  }

  /* Point fixe : les noms, les paramètres et les rappels prennent ce qu'on leur donne. */
  const SUR_TOUT = { f: null };
  for (let tour = 0; tour < 40; tour += 1) {
    resumes = new Map();
    memo = new Map();
    let change = false;
    for (const d of decls) {
      const t = tache(d.initializer, SUR_TOUT);
      if (t) change = lie(d.name, t) || change;
      const init = deballe(d.initializer);
      if (ts.isIdentifier(d.name) && ts.isObjectLiteralExpression(init)) {
        const s = sym(d.name);
        const m = champs.get(s) ?? new Map();
        for (const p of init.properties) {
          const v = ts.isPropertyAssignment(p) ? tache(p.initializer, SUR_TOUT)
            : ts.isShorthandPropertyAssignment(p) ? tacheDuSymbole(verif.getShorthandAssignmentValueSymbol(p), SUR_TOUT) : 0;
          const nom = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null;
          if (nom && v && ((m.get(nom) ?? 0) | v) !== (m.get(nom) ?? 0)) { m.set(nom, (m.get(nom) ?? 0) | v); change = true; }
        }
        champs.set(s, m);
      }
    }
    for (const a of affectations) if (ts.isIdentifier(a.left)) { const t = tache(a.right, SUR_TOUT); if (t) change = ajoute(sym(a.left), t) || change; }
    for (const b of boucles) {
      const t = tache(b.expression, SUR_TOUT) & VALEUR;
      if (t && ts.isVariableDeclarationList(b.initializer)) for (const d of b.initializer.declarations) change = lie(d.name, t) || change;
    }
    for (const a of appels) {
      if (!ts.isCallExpression(a)) continue;
      const f = fonctionDe(a.expression);
      /* Un appel par champ (`o.base.telecharge(…, jwt)`) se relie à toute méthode de ce nom. */
      const appelees = f ? [f] : ts.isPropertyAccessExpression(a.expression) ? (methodes.get(a.expression.name.text) ?? []) : [];
      for (const g of appelees) a.arguments.forEach((x, i) => { const p = g.parameters[i]; const t = tache(x, SUR_TOUT); if (p && t) change = lie(p.name, t) || change; });
      if (ts.isPropertyAccessExpression(a.expression) && RAPPEL_PAR_ELEMENT.has(a.expression.name.text)) {
        const rappel = deballe(a.arguments[0]);
        const t = tache(a.expression.expression, SUR_TOUT) & VALEUR;
        if (t && rappel && (ts.isArrowFunction(rappel) || ts.isFunctionExpression(rappel)) && rappel.parameters[0]) change = lie(rappel.parameters[0].name, t) || change;
      }
    }
    if (!change) break;
  }
  resumes = new Map();
  memo = new Map();

  const constats = [];
  const ligne = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const naif = (a, b) => !!(((a & SECRET) && (b & RECU)) || ((a & RECU) && (b & SECRET)));
  const constate = (genre, n, texte = texteDe(n), get = null) => constats.push({ fichier, genre, ligne: ligne(n), texte, get });

  /* ── Les comparaisons ── */
  for (const c of comparaisons) if (naif(tache(c.left, SUR_TOUT), tache(c.right, SUR_TOUT))) constate('comparaison', c);
  for (const a of appels) {
    if (!ts.isCallExpression(a) || !ts.isPropertyAccessExpression(a.expression) || !COMPARE_PAR_METHODE.has(a.expression.name.text) || !a.arguments[0]) continue;
    if (naif(tache(a.expression.expression, SUR_TOUT), tache(a.arguments[0], SUR_TOUT))) constate('comparaison', a);
  }
  for (const s of aiguillages) {
    const t = tache(s.expression, SUR_TOUT);
    for (const c of s.caseBlock.clauses) if (ts.isCaseClause(c) && naif(t, tache(c.expression, SUR_TOUT))) constate('comparaison', c, `switch (${texteDe(s.expression)}) case ${texteDe(c.expression)}`);
  }

  /* ── Les longueurs dans une réponse ── */
  const fabriques = new Set();
  const fabrique = (a) => {
    const n = nomAppel(a.expression);
    if (ts.isNewExpression(a)) return n === 'Response';
    if (n === 'Response.json' || n === 'Response.redirect') return true;
    const f = fonctionDe(a.expression);
    return !!f && fabriques.has(f);
  };
  for (let tour = 0; tour < 20; tour += 1) {
    let change = false;
    for (const a of appels) {
      if (!fabrique(a)) continue;
      const p = fonctionEnglobante(a);
      if (p && !fabriques.has(p)) { fabriques.add(p); change = true; }
    }
    if (!change) break;
  }
  /** La condition du `if` qui ne laisse passer qu'un GET, quand la longueur est dans sa branche. */
  const sousUnGet = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isIfStatement(p) && /\.method\s*===\s*['"]GET['"]/.test(texteDe(p.expression)) && n.pos >= p.thenStatement.pos && n.end <= p.thenStatement.end) return texteDe(p.expression);
    }
    return null;
  };
  const vus = new Set();
  for (const a of appels) {
    if (!fabrique(a)) continue;
    const fouille = (n) => {
      if (ts.isFunctionLike(n)) return;
      let source = null;
      if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && /^['"]?(attendueLg|recueLg)['"]?$/.test(n.name.getText(sf))) source = n;
      else if (ts.isPropertyAccessExpression(n) && n.name.text === 'length' && (longueurDe(tache(n.expression, SUR_TOUT)) & LG)) source = n;
      else if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) {
        /* Un paramètre ne compte pas ici : c'est à son appel qu'on le voit. */
        const d = declDe(sym(n));
        if (d && indiceDuParametre(d, fonctionEnglobante(d)) < 0 && !ts.isParameter(d) && (tache(n, SUR_TOUT) & LG)) source = n;
      } else if (ts.isCallExpression(n) && fonctionDe(n.expression) && (tache(n, SUR_TOUT) & LG)) source = n;
      if (source) {
        if (!vus.has(source.pos)) { vus.add(source.pos); constate('longueur', source, texteDe(source), sousUnGet(source)); }
        return;
      }
      ts.forEachChild(n, fouille);
    };
    for (const x of a.arguments ?? []) fouille(x);
  }
  return constats;
}
