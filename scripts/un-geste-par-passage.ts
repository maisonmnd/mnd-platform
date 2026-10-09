/* UN GESTE PAR PASSAGE, LU DANS UN CROCHET DU TRÔNE — 9 octobre 2026.

   Les automatismes du Trône (useParrainageVivant d'abord) écrivent UNE fois
   par passage : chaque étape qui écrit rend la main (`return;`), la suivante
   part au rendu d'après, sur des données fraîches. Jusqu'au 9 octobre,
   `verifie-le-parrainage` le tenait en comptant EXACTEMENT cinq
   `      return;\n    }` : une étape de plus (les Graines de « De main en
   main ») le faisait mentir, et une étape qui oubliait son `return;` en
   ajoutant un autre ne se voyait pas. On lit désormais la PROPRIÉTÉ : les
   instructions du premier niveau de l'effet, et pour chacune qui écrit dans
   un magasin (`xStore).set(`), un `return;` après sa dernière écriture.
   Seule la dernière instruction de l'effet peut s'en passer : rien ne la
   suit.

   Module sans effet : `verifie-les-douze-lunes` et `verifie-le-parrainage`
   l'importent. Les commentaires s'effacent avant la lecture (ils racontent
   les pannes, et une explication n'est pas une instruction). */

export const sansCommentaires = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Après une chaîne ('…', "…" ou `…` avec ses ${…}) : l'index qui la suit. */
function apresLaChaine(src: string, i: number): number {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === q) return j + 1;
    if (q === '`' && ch === '$' && src[j + 1] === '{') { j = apresLeCode(src, j + 2); continue; }
    if (q !== '`' && ch === '\n') return j;
    j += 1;
  }
  return j;
}

/** Du code jusqu'à l'accolade fermante de son niveau : l'index qui la suit. */
function apresLeCode(src: string, i: number): number {
  let prof = 0;
  let j = i;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\'' || ch === '"' || ch === '`') { j = apresLaChaine(src, j); continue; }
    if (ch === '{') prof += 1;
    else if (ch === '}') { if (prof === 0) return j + 1; prof -= 1; }
    j += 1;
  }
  return j;
}

/** LES INSTRUCTIONS DU PREMIER NIVEAU d'un corps `{ … }`, à partir de
    `debut` (juste après son accolade ouvrante), jusqu'à son accolade
    fermante. Un bloc `if (…) { … }` est une instruction, `else` compris. */
export function instructionsDuCorps(src: string, debut: number): string[] {
  const sortie: string[] = [];
  let prof = 0;
  let depuis = debut;
  const coupe = (fin: number) => {
    const t = src.slice(depuis, fin).trim();
    if (t) sortie.push(t);
    depuis = fin;
  };
  let j = debut;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\'' || ch === '"' || ch === '`') { j = apresLaChaine(src, j); continue; }
    if (ch === '{' || ch === '(' || ch === '[') prof += 1;
    else if (ch === ')' || ch === ']') prof -= 1;
    else if (ch === '}') {
      if (prof === 0) { coupe(j); return sortie; }
      prof -= 1;
      if (prof === 0 && !/^\s*(?:else\b|catch\b|finally\b|[),;.?:])/.test(src.slice(j + 1, j + 40))) coupe(j + 1);
    } else if (ch === ';' && prof === 0) coupe(j + 1);
    j += 1;
  }
  return sortie;
}

/** Les étapes de l'effet d'un crochet (`useEffect(() => { … })`). */
export function etapesDeLEffet(source: string): string[] {
  const src = sansCommentaires(source);
  const ouverture = 'useEffect(() => {';
  const i = src.indexOf(ouverture);
  return i < 0 ? [] : instructionsDuCorps(src, i + ouverture.length);
}

/** UN GESTE PAR PASSAGE : chaque étape qui écrit rend la main après sa
    dernière écriture, sauf la dernière instruction de l'effet. Rend les
    écarts (vide : la propriété tient). */
export function unGesteParPassage(source: string): string[] {
  const etapes = etapesDeLEffet(source);
  if (!etapes.length) return ['aucun effet useEffect(() => { ... }) lu dans le crochet'];
  const ecarts: string[] = [];
  /* Une écriture dans un MAGASIN (`xStore.set(`, `gardeLEcriture(…, xStore).set(`) ;
     le `Map.set` d'un calcul n'en est pas une. */
  const derniereEcriture = (t: string): number => {
    let k = -1;
    for (const m of t.matchAll(/[A-Za-z]+Store\)?\.set\(/g)) k = m.index ?? k;
    return k;
  };
  const ecrivent = etapes.map((t, i) => ({ t, i })).filter((e) => derniereEcriture(e.t) >= 0);
  if (ecrivent.length < 2) ecarts.push(`${ecrivent.length} etape(s) qui ecrivent : le crochet n a pas ete lu`);
  for (const { t, i } of ecrivent) {
    if (i === etapes.length - 1) continue;
    if (!/\breturn;/.test(t.slice(derniereEcriture(t)))) {
      ecarts.push(`une etape ecrit sans rendre la main : ${t.slice(0, 100).replace(/\s+/g, ' ')}...`);
    }
  }
  return ecarts;
}
