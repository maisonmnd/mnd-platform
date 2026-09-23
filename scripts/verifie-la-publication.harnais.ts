/* LE HARNAIS DE LA PUBLICATION, 23 septembre 2026. `publie.mjs` envoie
   dist-sites/<site> tel quel ; il doit refuser un dist plus vieux que sa
   source, et nommer le fichier. Éprouvé sur des dossiers fabriqués, sans
   rien cloner ni publier. Lancer : npx tsx scripts/verifie-la-publication.harnais.ts */
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { distPerime } from './publie.mjs';

let rates = 0;
const dit = (quoi: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) rates++;
  console.log(`${ok ? 'OK   ' : 'RATÉ '} ${quoi} → ${JSON.stringify(obtenu)}${ok ? '' : ` (attendu ${JSON.stringify(attendu)})`}`);
};

const banc = mkdtempSync(path.join(os.tmpdir(), 'mnd-publie-'));
const dist = path.join(banc, 'dist');
const src = path.join(banc, 'src');
mkdirSync(path.join(src, 'profond'), { recursive: true });
mkdirSync(dist);
const T = Date.now();
const date = (p: string, ms: number) => utimesSync(p, new Date(ms), new Date(ms));

writeFileSync(path.join(dist, 'version.json'), '{"build":"x"}'); date(path.join(dist, 'version.json'), T);
writeFileSync(path.join(src, 'a.ts'), ''); date(path.join(src, 'a.ts'), T - 60_000);
writeFileSync(path.join(src, 'profond', 'b.ts'), ''); date(path.join(src, 'profond', 'b.ts'), T - 30_000);
writeFileSync(path.join(banc, 'seul.html'), ''); date(path.join(banc, 'seul.html'), T - 10_000);
const sources = [src, path.join(banc, 'seul.html'), path.join(banc, 'absent')];

dit('un dist plus récent que toutes ses sources passe', null, distPerime(dist, sources));

date(path.join(src, 'profond', 'b.ts'), T + 5_000);
const p1 = distPerime(dist, sources);
dit('un fichier source retouché après la construction est nommé, même profond', 'b.ts', p1 && path.basename(p1.fichier));
dit('… avec les deux instants dans le bon ordre', true, !!p1 && p1.modifie.getTime() > p1.construit.getTime());

date(path.join(banc, 'seul.html'), T + 9_000);
dit('… et c\'est le plus récent de tous qui est nommé', 'seul.html', path.basename(distPerime(dist, sources)!.fichier));

rmSync(path.join(dist, 'version.json'));
dit('un dist sans version.json ne bloque pas ici (l\'attente de mise en ligne le dira)', null, distPerime(dist, sources));

rmSync(banc, { recursive: true, force: true });
if (rates) { console.log(`\n${rates} raté(s).`); process.exit(1); }
console.log('\nTout est juste.');
