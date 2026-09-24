/* LES POLICES DE LA MAISON, SERVIES PAR NOUS — `node scripts/verifie-les-polices.mjs`.

   Le 24 septembre 2026, l'état des lieux du site a mesuré le détour : un
   @import au milieu de la feuille envoyait chercher chez Google une seconde
   feuille, puis les fichiers chez un troisième hôte, trois allers-retours
   avant la première lettre dans la bonne police. Les fichiers vivent depuis
   dans `src/ds/fonts/`, comme la police fon.

   L'ATTENTE VIENT DE LA PROMESSE, pas de la feuille : la liste des graisses
   ci-dessous est ce que la plateforme demandait à Google ce jour-là. Une
   graisse retirée de la feuille crie ici, même si la feuille est cohérente
   avec elle-même. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const FEUILLE = 'src/ds/tokens/fonts.css';
const feuille = readFileSync(FEUILLE, 'utf8');

/* ── AUCUN DÉTOUR ────────────────────────────────────────────────────── */
dit('fonts.css n’importe rien d’un hôte étranger', [],
  [...feuille.matchAll(/@import[^;]*;/g)].map((m) => m[0]).filter((i) => /https?:/i.test(i)));
const feuillesDeLaVitrine = (function marche(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? marche(p) : (/\.(css|tsx?|mjs)$/.test(f) ? [p] : []);
  });
})('src/apps/revelateur').concat((function marche(d: string): string[] {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? marche(p) : (f.endsWith('.css') ? [p] : []); });
})('src/ds'));
dit('ni la vitrine ni le socle de style n’appellent Google Fonts', [],
  feuillesDeLaVitrine.filter((f) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(readFileSync(f, 'utf8'))).map((f) => f.split(String.fromCharCode(92)).join('/')));

/* ── CHAQUE DÉCLARATION TIENT ────────────────────────────────────────── */
type Face = { famille: string; style: string; de: number; a: number; fichier: string; plage: string; sousEnsemble: string };
const faces: Face[] = [...feuille.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).map((b) => {
  const fichier = /url\('([^']+)'\)/.exec(b)?.[1] ?? '';
  return {
    famille: /font-family:\s*'([^']+)'/.exec(b)?.[1] ?? '',
    style: /font-style:\s*(\w+)/.exec(b)?.[1] ?? '',
    /* Un axe « 300 700 » (police variable) ou une graisse seule « 400 ». */
    de: Number(/font-weight:\s*(\d+)/.exec(b)?.[1] ?? 0),
    a: Number(/font-weight:\s*\d+\s+(\d+)/.exec(b)?.[1] ?? /font-weight:\s*(\d+)/.exec(b)?.[1] ?? 0),
    fichier,
    plage: /unicode-range:\s*([^;]+);/.exec(b)?.[1] ?? '',
    sousEnsemble: /-(latin(?:-ext)?)\.woff2$/.exec(fichier)?.[1] ?? '',
  };
});
const maison = faces.filter((f) => f.famille !== 'MND Fon');
dit('chaque fichier déclaré existe', [], faces.map((f) => f.fichier).filter((f) => !existsSync(join('src/ds/tokens', f))));
dit('… et est un vrai woff2', [], faces.filter((f) => existsSync(join('src/ds/tokens', f.fichier)) && readFileSync(join('src/ds/tokens', f.fichier)).subarray(0, 4).toString() !== 'wOF2').map((f) => f.fichier));
dit('… chaque déclaration porte sa plage unicode', [], faces.filter((f) => !f.plage).map((f) => f.fichier));
dit('… et se laisse échanger à l’affichage (font-display: swap)', [], [...feuille.matchAll(/@font-face\s*\{([^}]*)\}/g)].filter((m) => !/font-display:\s*swap/.test(m[1])).length ? ['une déclaration sans swap'] : []);
dit('… le latin étendu accompagne chaque latin (œ, Œ y vivent)', [],
  maison.filter((f) => f.sousEnsemble === 'latin' && !maison.some((g) => g.famille === f.famille && g.style === f.style && g.de === f.de && g.a === f.a && g.sousEnsemble === 'latin-ext')).map((f) => f.fichier));

/* ── LA PROMESSE DU 24 SEPTEMBRE 2026 ────────────────────────────────── */
const PROMESSE: [string, string, string][] = [
  ...['300', '400', '500', '600', '700'].map((p): [string, string, string] => ['Cormorant Garamond', 'normal', p]),
  ...['300', '400', '500', '600'].map((p): [string, string, string] => ['Cormorant Garamond', 'italic', p]),
  ...['300', '400', '500', '600', '700'].map((p): [string, string, string] => ['Jost', 'normal', p]),
];
const couvre = (f: Face, po: string) => f.de <= Number(po) && Number(po) <= f.a;
dit('chaque graisse que la plateforme demandait à Google est couverte par un axe déclaré, en latin', [],
  PROMESSE.filter(([fam, st, po]) => !maison.some((f) => f.famille === fam && f.style === st && couvre(f, po) && f.sousEnsemble === 'latin')).map((t) => t.join(' ')));
dit('… et aucun axe ne sort de ce que Google promettait (300 à 700)', [],
  maison.filter((f) => f.de < 300 || f.a > 700 || f.de > f.a).map((f) => f.fichier));
/* La police variable est déclarée deux fois dans `src` : le format
   `woff2-variations` pour qui le connaît, `woff2` pour les autres. */
dit('… chaque fichier de la Maison est annoncé comme police variable', [],
  [...feuille.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((b) => !b.includes('MND Fon') && !/format\('woff2-variations'\)/.test(b)).length ? ['une déclaration sans woff2-variations'] : []);
dit('aucun fichier orphelin dans le dossier des polices', [],
  readdirSync('src/ds/fonts').filter((f) => f.endsWith('.woff2') && !faces.some((x) => x.fichier.endsWith(`/${f}`))));

/* ── LES PAGES GÉNÉRÉES, quand elles le sont ─────────────────────────── */
if (!existsSync('revelateur')) {
  console.log('—     revelateur/ absent : les pages générées ne sont pas éprouvées ici (node scripts/genere-revelateur.mjs).');
} else {
  const pages = (function marche(d: string): string[] {
    return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? marche(p) : (f === 'index.html' ? [p] : []); });
  })('revelateur');
  dit('aucune page générée de la vitrine ne nomme Google Fonts', [],
    pages.filter((p) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(readFileSync(p, 'utf8'))).map((p) => p.split(String.fromCharCode(92)).join('/')));
}

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
