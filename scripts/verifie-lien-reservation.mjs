import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE LIEN DE RÉSERVATION PRÉPARÉ, ÉPROUVÉ — 28 septembre 2026. Le Trône
   l'écrit, le site le lit : la même fonction des deux côtés, et ce banc
   vérifie l'aller-retour, le tri de ce qui n'a pas la forme d'un
   identifiant, et que la page de réservation lit bien l'adresse.
   Lance : node scripts/verifie-lien-reservation.mjs */
const racine = path.resolve(import.meta.dirname, '..');
const d = mkdtempSync(path.join(tmpdir(), 'lien-'));
let ko = 0;
const dit = (nom, a, o) => { const ok = JSON.stringify(a) === JSON.stringify(o); if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(o)}`); if (!ok) console.log(`       attendu ${JSON.stringify(a)}`); };
try {
  const out = path.join(d, 'l.mjs');
  await build({ entryPoints: [path.join(racine, 'src/shared/lien-reservation.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  const { lienDeReservation, lienLu } = await import(pathToFileURL(out).href);
  const l = lienDeReservation('https://maisonmnd.com', { besoin: 'entretien', gestes: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], calibre: 'cal-pico' });
  dit('le lien mène à la page de réservation du site', true, l.startsWith('https://maisonmnd.com/reserver/?besoin=entretien'));
  const u = new URL(l);
  dit('… et se relit à l’identique', { gestes: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], calibre: 'cal-pico' }, lienLu(u.search));
  dit('ce qui n’a pas la forme d’un identifiant est écarté', { gestes: ['ok-1'], calibre: '' }, lienLu('?gestes=ok-1,<script>,a%20b&calibre=x y'));
  dit('les doublons ne comptent qu’une fois', ['a', 'b'], lienLu('?gestes=a,b,a').gestes);
  dit('sans gestes, rien de préparé', { gestes: [], calibre: '' }, lienLu('?besoin=entretien'));
  const { jetonDuLien, URL_DU_MODELE } = await import(pathToFileURL(out).href);
  const jeton = jetonDuLien({ besoin: 'entretien', gestes: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], calibre: 'cal-pico' });
  dit('le jeton du modèle Meta est un seul mot sans caractère réécrit', true, /^[A-Za-z0-9._~-]+$/.test(jeton));
  dit('… et se relit comme le lien complet', { gestes: ['sv-atl-ii-e', 'sv-plt-05-ess-c'], calibre: 'cal-pico' }, lienLu(new URL(URL_DU_MODELE + jeton).search));
  dit('… même sans calibre', { gestes: ['a'], calibre: '' }, lienLu('?r=' + jetonDuLien({ besoin: 'entretien', gestes: ['a'] })));
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(racine, 'src/apps/revelateur/ilots/Reserver.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit('la réservation lit l’adresse avec la même fonction', true, /lienLu\(/.test(src) && /setServiceIds\(ok\)/.test(src));
} finally { rmSync(d, { recursive: true, force: true }); }
console.log(ko === 0 ? '\nLe lien préparé tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
