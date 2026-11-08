import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PASTILLE DE LA COURONNE, EPROUVEE (7 novembre 2026). */
const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'pastille-'));
const sortie = path.join(dossier, 'p.mjs');
let ko = 0;
const dit = (n, a, o) => { const bon = JSON.stringify(a) === JSON.stringify(o); if (!bon) ko++; console.log(`${bon ? 'ok' : 'KO'}  ${n}${bon ? '' : `  attendu ${JSON.stringify(a)} obtenu ${JSON.stringify(o)}`}`); };
try {
  await build({ entryPoints: [path.join(racine, 'src/apps/couronne/pastille-pure.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
  const { pastilleDeLaCouronne: p } = await import(pathToFileURL(sortie).href);
  dit('calibre + fourchette', { calibre: 'Fine', fourchette: '80 à 120' }, p(' Fine ', '80 à 120'));
  dit('sans calibre, pas de pastille', null, p('', '80 à 120'));
  dit('calibre absent', null, p(undefined, 'x'));
  dit('fourchette absente tolérée', { calibre: 'Fine', fourchette: '' }, p('Fine', undefined));
  const tabs = readFileSync(path.join(racine, 'src/apps/couronne/Tabs.tsx'), 'utf8');
  const home = tabs.slice(tabs.indexOf('export function HomeTab('), tabs.indexOf('export function HomeEnfant('));
  /* 8 novembre 2026 : plus de photo en haut de l'accueil (maquette validee) ; la pastille
     vit sous le bonjour de l'en-tete compact, et « Pour vous » revient comme titre de la
     liste qui range le reste (une ligne par rubrique). */
  dit('la pastille est sous le bonjour de l en-tete', true, /mc-homehead__greet[\s\S]{0,900}mc-crownpill/.test(home));
  dit('la carte pleine ne vit qu au toucher', true, /\{statutOuvert && \(\s*<div id="mc-statut-couronne">/.test(home));
  dit('Pour vous ne titre que la liste, une fois', 1, home.split("t('Pour vous')").length - 1);
  dit('trois rubriques distinctes', true, ['Les produits', 'Le Cercle'].every((k) => home.includes(`>{t('${k}')}</div>`)) && home.includes("t('De main en main'"));
  dit('plus de La Gamme dans les rubriques', false, home.includes("t('La Gamme')"));
} finally { rmSync(dossier, { recursive: true, force: true }); }
if (ko) { console.log(`${ko} KO`); process.exit(1); }
console.log('tout est ok');
