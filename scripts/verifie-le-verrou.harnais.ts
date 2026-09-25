/* LE HARNAIS DU VERROU, 25 septembre 2026.

   Le verrou de la Maison vit à trois endroits : ses proportions dans
   `src/ds/verrou.ts`, son dessin dans `public/assets/verrous/*.png` pour les
   PDF, et sa mise en page dans `revelateur.css` pour le site. Trois endroits,
   une seule marque : ce harnais refuse qu'ils se séparent.

   CE QU'IL TIENT, ET QUI N'EST PAS LE CAS DU JOUR :
     · le plancher. Sous 123 px de large, la capitale de MAISON tombe sous six
       pixels et cesse de se lire. Tout appel du verrou, sur le papier comme à
       l'écran, doit rester au-dessus. La mesure est dans `verrou.ts`.
     · l'accord des proportions. Les nombres écrits dans la feuille de style
       doivent être ceux de `verrou.ts`, au dix-millième près.
     · le dessin doit exister dans les trois encres, et les trois doivent avoir
       la même taille : une encre rognée autrement serait un autre logo.

   LA LARGEUR TOTALE NE SE DEVINE PAS, ELLE SE LIT SUR LE DESSIN. Elle dépend
   des chasses de Cormorant, qu'aucune formule ne donne. On la tire donc du
   PNG : sa hauteur vaut HAUT_DU_PICTO corps, donc largeur/corps se déduit de
   son seul rapport. L'attente, elle, vient du plancher mesuré, jamais du code
   qu'on éprouve.

   Lancer : node scripts/verifie-le-verrou.mjs (le rituel balaie
   scripts/verifie-*.mjs), ou npx tsx sur ce fichier. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  VERROU, HAUT_DU_BLOC, HAUT_DU_PICTO, PLANCHER_COUCHE, PLANCHER_COUCHE_MM,
  PLANCHER_DEBOUT,
} from '../src/ds/verrou';

const racine = process.cwd();
const lis = (p: string) => readFileSync(path.join(racine, p), 'utf8');

let rates = 0;
const dit = (quoi: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) rates++;
  console.log(`${ok ? 'OK   ' : 'RATE '} ${quoi} -> ${JSON.stringify(obtenu)}${ok ? '' : ` (attendu ${JSON.stringify(attendu)})`}`);
};
const vrai = (quoi: string, condition: boolean, detail = '') => {
  if (!condition) rates++;
  console.log(`${condition ? 'OK   ' : 'RATE '} ${quoi}${condition || !detail ? '' : ` -> ${detail}`}`);
};

/* ── 1. LE DESSIN EXISTE, DANS LES TROIS ENCRES, IDENTIQUE ─────────── */
const DOSSIER = 'public/assets/verrous';
const ENCRES = ['indigo', 'cuivre', 'ivoire'];

/** La taille d'un PNG, lue dans son en-tête IHDR (13 octets après la signature). */
function taillePng(chemin: string): { l: number; h: number } {
  const b = readFileSync(path.join(racine, chemin));
  return { l: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const tailles = ENCRES.map((e) => {
  const f = `${DOSSIER}/verrou-couche-${e}.png`;
  vrai(`le verrou ${e} est dessine`, existsSync(path.join(racine, f)), f);
  return existsSync(path.join(racine, f)) ? taillePng(f) : null;
});
vrai('les trois encres ont la meme taille',
  tailles.every((t) => t && tailles[0] && t.l === tailles[0].l && t.h === tailles[0].h),
  JSON.stringify(tailles));

const dessin = tailles[0];
if (!dessin) {
  console.log('\nSans dessin, le reste ne se mesure pas.');
  process.exit(1);
}

/* La largeur totale du verrou, en parts du corps du sigle. Lue sur le dessin,
   parce qu'elle dépend des chasses de la police. */
const LARGE_PAR_CORPS = HAUT_DU_PICTO * (dessin.l / dessin.h);
console.log(`     le dessin fait ${dessin.l}x${dessin.h}, soit ${LARGE_PAR_CORPS.toFixed(3)} fois le corps du sigle`);
vrai('le dessin est plus large que le plancher', dessin.l >= PLANCHER_COUCHE,
  `${dessin.l} px pour un plancher de ${PLANCHER_COUCHE}`);

/* ── 2. LES PAPIERS NE DESCENDENT JAMAIS SOUS LE PLANCHER ──────────── */
const pdf = lis('src/shared/pdf.ts');
const appels = [...pdf.matchAll(/poseLeVerrou\(\s*doc\s*,[^,]+,[^,]+,\s*([^,)]+)/g)]
  .map((m) => m[1].trim());
vrai('des appels au verrou existent dans les papiers', appels.length > 0, String(appels.length));
for (const a of appels) {
  const n = Number(a);
  if (!Number.isFinite(n)) {
    vrai(`la largeur "${a}" se lit comme un nombre`, false,
      'le harnais ne sait pas juger une largeur calculee : la poser en clair');
    continue;
  }
  vrai(`un papier demande ${n} mm, au-dessus du plancher`, n >= PLANCHER_COUCHE_MM,
    `plancher ${PLANCHER_COUCHE_MM} mm`);
}

/* ── 3. LA FEUILLE DE STYLE DIT LES MÊMES PROPORTIONS ──────────────── */
const css = lis('src/apps/revelateur/revelateur.css');
const nombreApres = (motif: RegExp): number | null => {
  const m = css.match(motif);
  return m ? Number(m[1]) : null;
};
const r4 = (n: number) => Number(n.toFixed(4));

dit('l ecart au pictogramme, dans la feuille',
  r4(VERROU.ecartPicto), nombreApres(/\.verrou \{[^}]*gap: calc\(var\(--sigle\) \* ([\d.]+)\)/));
dit('la hauteur du pictogramme, dans la feuille',
  r4(HAUT_DU_PICTO), nombreApres(/\.verrou img \{[^}]*height: calc\(var\(--sigle\) \* ([\d.]+)\)/));
dit('le corps de MAISON, dans la feuille',
  r4(VERROU.partMaison), nombreApres(/\.verrou__maison \{[^}]*font-size: calc\(var\(--sigle\) \* ([\d.]+)\)/));
dit('le blanc entre les deux lignes, dans la feuille',
  r4(VERROU.entreLignes), nombreApres(/\.verrou__maison \{[^}]*margin-bottom: calc\(var\(--sigle\) \* ([\d.]+)\)/));
dit('l ecartement de MAISON, dans la feuille',
  VERROU.ecartMaison, nombreApres(/\.verrou__maison \{[^}]*letter-spacing: ([\d.]+)em/));
dit('l ecartement du sigle, dans la feuille',
  VERROU.ecartSigle, nombreApres(/\.verrou__sigle \{[^}]*letter-spacing: ([\d.]+)em/));
vrai('la hauteur du bloc de texte se deduit des deux lignes',
  r4(HAUT_DU_BLOC) === r4(VERROU.partMaison + VERROU.entreLignes + 1));

/* AUCUN RETRAIT SUR LE BLOC CALÉ À GAUCHE. Un text-indent y pousserait la
   ligne au lieu de compenser quoi que ce soit, et les deux lignes ne
   partiraient plus du même bord. */
const blocVerrou = css.slice(css.indexOf('.verrou {'), css.indexOf('.barre .verrou'));
vrai('le verrou ne porte aucun retrait', !/text-indent/.test(blocVerrou));

/* ── 4. CHAQUE TAILLE POSÉE À L'ÉCRAN TIENT LE PLANCHER ────────────── */
const sigles = [...css.matchAll(/--sigle: (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
vrai('des tailles de verrou sont posees a l ecran', sigles.length > 0, String(sigles.length));
for (const s of sigles) {
  const large = s * LARGE_PAR_CORPS;
  vrai(`--sigle: ${s}px donne ${Math.round(large)} px de large, au-dessus du plancher`,
    large >= PLANCHER_COUCHE, `plancher ${PLANCHER_COUCHE} px`);
}

/* ── 5. LE SITE POSE BIEN LE VERROU, PAS LE PICTOGRAMME SEUL ───────── */
const gen = lis('scripts/genere-revelateur.mjs');
const barre = gen.slice(gen.indexOf('<header class="barre">'), gen.indexOf('</header>'));
vrai('la barre du site porte le verrou', /class="logo verrou"/.test(barre));
vrai('la barre du site ecrit MAISON', /verrou__maison">MAISON</.test(barre));
vrai('la barre du site ecrit MND', /verrou__sigle">MND</.test(barre));

/* ── 6. LA HAUTEUR DE LA BARRE NE SE RECOPIE PLUS ──────────────────── */
vrai('le grand ecran remonte de la hauteur de barre, pas d un nombre recopie',
  /\.hero-plein \{[^}]*margin-top: calc\(var\(--barre-h[^)]*\) \* -1\)/.test(css));

/* ── 7. LE FABRICANT LIT LA MÊME SOURCE ────────────────────────────── */
const fab = lis('scripts/fabrique-le-verrou.mjs');
vrai('le fabricant lit src/ds/verrou.ts', /src\/ds\/verrou\.ts/.test(fab));
vrai('le fabricant refuse un dessin qui touche le bord', /toucheLeBord/.test(fab));
vrai('le fabricant prouve la police', /identiques au bit pres|Police Qui N Existe Pas/.test(fab));
vrai('le fabricant refuse un pictogramme deforme',
  /rapportDuPicto/.test(fab) && /EST DÉFORMÉ/.test(fab));

/* ── 8. LE DOCUMENT ET LE CODE DISENT LE MÊME NOMBRE ───────────────
   `verrou.ts` se présente comme le seul endroit où les proportions s'écrivent.
   Si le document de marque annonce un autre plancher, c'est le code qu'on
   lira, et la règle écrite ne servira qu'à rassurer. Le 25 septembre les deux
   ont divergé pendant une matinée, le temps qu'un relevé en largeur de sigle
   soit repris en largeur de verrou entier : on ne le laisse plus arriver. */
const doc = lis('docs/marque/verrou.md');
/* LE MOTIF EST LITTÉRAL, JAMAIS CONSTRUIT DANS UN GABARIT. Une première
   version montait l'expression dans un `template literal` : les contre-obliques
   y sont mangées une fois de plus qu'on ne le croit, et le motif sort faux.
   Ici, on trouve la ligne du tableau par un simple `includes`, et le nombre
   par une expression écrite en clair. */
const plancherDit = (forme: string): number | null => {
  const ligne = doc.split('\n').find((l) => l.startsWith('|') && l.includes('**' + forme + '**'));
  const m = ligne ? ligne.match(/\*\*(\d+) px\*\*/) : null;
  return m ? Number(m[1]) : null;
};
dit('le document annonce le plancher du couché de verrou.ts',
  PLANCHER_COUCHE, plancherDit('Couché'));
dit('le document annonce le plancher du debout de verrou.ts',
  PLANCHER_DEBOUT, plancherDit('Debout'));

/* ── 9. RIEN NE TRAÎNE DANS LE DOSSIER DU DESSIN ───────────────────── */
const dedans = readdirSync(path.join(racine, DOSSIER)).sort();
dit('le dossier du dessin ne contient que les trois encres',
  ENCRES.map((e) => `verrou-couche-${e}.png`).sort(), dedans);

console.log(rates === 0 ? '\nLe verrou tient.' : `\n${rates} controle(s) en echec.`);
process.exit(rates === 0 ? 0 : 1);
