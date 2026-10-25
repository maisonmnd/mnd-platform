import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* L'ACCENT DE « nyɔ́ », POSÉ SUR LE ɔ, PARTOUT — `node scripts/verifie-l-accent-du-fon.mjs`.

   25 octobre 2026, Yéman : « il faut régler l'accent sur le slogan, partout ».
   La police fon ne sait pas accrocher l'accent flottant au ɔ : il tombait à
   droite. Les pages passent par TexteFon, les feuilles imprimées par htmlFon,
   les images par ecritLeFon, le PDF par pieDeLaMaison (accent posé à la main
   depuis le 22 août). Le banc éprouve la règle, puis lit TOUT src/ : aucune
   page, aucune image ne dessine plus « nyɔ́ » tel quel. Sortie ASCII. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-l-accent-du-fon');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'fon.mjs');
let ko = 0;
let n = 0;
const ascii = (v) => (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, attendu, obtenu) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)} (attendu ${ascii(attendu)})`}`);
};

try {
  await build({ entryPoints: [path.join(racine, 'src/ds/fon-pur.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
  const { morceauxDuFon, htmlFon, OA, CSS_FON_OA } = await import(pathToFileURL(sortie).href);
  const O = '\u0254';
  const devise = `mi ny${O}\u0301 \u0256\u025Bkp\u025B, votre beaut\u00e9 est d\u00e9j\u00e0 l\u00e0`;

  dit('ɔ suivi de l accent flottant U+0301, rien d autre', [0x254, 0x301], [...OA].map((c) => c.codePointAt(0)));
  dit('la devise en morceaux : avant, le ɔ qui portait l accent, apres', [[`mi ny`, false], [O, true], [` \u0256\u025Bkp\u025B, votre beaut\u00e9 est d\u00e9j\u00e0 l\u00e0`, false]],
    morceauxDuFon(devise).map((m) => [m.t, m.oa]));
  dit('un texte sans l accent ne bouge pas', [['Maison MND', false]], morceauxDuFon('Maison MND').map((m) => [m.t, m.oa]));
  dit('en HTML : le ɔ dans son span, plus aucun accent flottant', [true, false],
    [htmlFon(devise).includes(`<span class="fon-oa">${O}</span>`), htmlFon(devise).includes('\u0301')]);
  /* À la hauteur de l'accent du « é », un peu à droite du centre (réglé à l'œil le 25 octobre 2026). */
  dit('la regle imprimee dessine l accent ´ au-dessus', true, /\.fon-oa::after\{content:'\\00B4';position:absolute;left:62%;top:-\.06em;transform:translateX\(-50%\)/.test(CSS_FON_OA));

  const fonts = readFileSync(path.join(racine, 'src/ds/tokens/fonts.css'), 'utf8');
  dit('la feuille commune porte la regle, droite et penchee', [true, true],
    [/\.fon-oa::after \{ content: '\\00B4'; position: absolute; left: 62%; top: -\.06em; transform: translateX\(-50%\);/.test(fonts), /\.fon-oa--penche::after \{ left: 58%; font-style: italic; \}/.test(fonts)]);
  const pdf = readFileSync(path.join(racine, 'src/shared/pdf.ts'), 'utf8');
  dit('le PDF pose toujours l accent a la main (recul de 219 milliemes)', [true, true],
    [/const RECUL_DE_L_ACCENT = 0\.219;/.test(pdf), /brut\(ACCENT, x0 \+ largeurNom \+ doc\.getTextWidth\(avant\) - recul, y\);/.test(pdf)]);

  /* TOUT src/ : plus aucun dessin brut de la devise. */
  const fichiers = [];
  const marche = (d) => { for (const f of readdirSync(d)) { const c = path.join(d, f); if (statSync(c).isDirectory()) marche(c); else if (/\.(tsx?|mjs)$/.test(f)) fichiers.push(c); } };
  marche(path.join(racine, 'src'));
  const sans = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const fautes = [];
  for (const f of fichiers) {
    const rel = path.relative(racine, f).replace(/\\/g, '/');
    if (rel === 'src/shared/pdf.ts' || rel.startsWith('src/ds/fon')) continue;
    const t = sans(readFileSync(f, 'utf8'));
    if (/fillText\(\s*(DEVISE_COMPLETE|DEVISE_MAISON|['"`][^'"`]*\u0254\u0301)/.test(t)) fautes.push(`${rel} : fillText`);
    /* La devise en enfant de JSX ; pas en valeur (texte={DEVISE}), ni dans une chaîne (${DEVISE}). */
    if (rel.endsWith('.tsx') && /(?<![=$])\{DEVISE(_COMPLETE|_MAISON)?\}/.test(t)) fautes.push(`${rel} : {DEVISE} en clair`);
    if (rel.endsWith('.tsx') && />[^<{}]*\u0254\u0301[^<{}]*</.test(t)) fautes.push(`${rel} : ny\u0254\u0301 ecrit dans la page`);
    if (/class="devise">\$\{DEVISE/.test(t)) fautes.push(`${rel} : feuille imprimee sans htmlFon`);
  }
  dit('tout src/ : aucune page, feuille ou image ne dessine plus la devise brute', [], fautes);
  dit('... et le controle lit bien les endroits soignes (pages, feuilles, images)', true,
    fichiers.filter((f) => /TexteFon texte=|htmlFon\(DEVISE|ecritLeFon\(/.test(readFileSync(f, 'utf8'))).length >= 10);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nL accent du fon tient (${n} controles).`);
