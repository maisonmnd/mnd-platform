import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/* L'APPLICATION RESTE SUR LE TÉLÉPHONE — 4 octobre 2026, maquette « Le Trône
   hors ligne », temps 2. Le service (`sw.js`, recopié de `public/`) reçoit
   l'empreinte de la construction et la liste de ce qu'il garde : la page, le
   code, les styles, les polices, les sceaux. Les photos se gardent à mesure
   qu'on les voit. Un `sw.js` qui change à chaque construction est ce qui fait
   installer la nouvelle version au téléphone.

   Partagé par `build-sites.mjs` et par le banc `banc-trone-hors-ligne.mjs` :
   le banc éprouve exactement ce qui part en ligne. Rend le nombre de fichiers
   et leur poids, ou `null` si le dossier n'a pas de service. */
export function injecteLeService(dist, build) {
  const sw = path.join(dist, 'sw.js');
  if (!existsSync(sw)) return null;
  const garder = ['./'];
  const parcours = (d, rel) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const c = path.join(d, f);
      const r = `${rel}/${f}`;
      if (statSync(c).isDirectory()) { if (f === 'monograms') parcours(c, r); continue; }
      if (/\.(js|css|woff2)$/.test(f) || rel.endsWith('/monograms')) garder.push(r);
    }
  };
  parcours(path.join(dist, 'assets'), 'assets');
  const poids = garder.slice(1).reduce((n, r) => n + statSync(path.join(dist, r)).size, 0);
  const brut = readFileSync(sw, 'utf8');
  if (!brut.includes("'__MND_BUILD__'") || !brut.includes('/*__MND_A_GARDER__*/[]')) {
    throw new Error('sw.js : les repères __MND_BUILD__ / __MND_A_GARDER__ ont disparu, le service ne saurait plus quoi garder.');
  }
  writeFileSync(sw, brut.replace("'__MND_BUILD__'", JSON.stringify(build)).replace('/*__MND_A_GARDER__*/[]', JSON.stringify(garder)));
  return { fichiers: garder.length, mo: poids / 1048576, liste: garder };
}
