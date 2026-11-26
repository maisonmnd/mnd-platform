import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* L'HEURE DE COTONOU PARTOUT OU L'ON RESERVE, EPROUVEE (26 novembre 2026).
   `node scripts/verifie-l-heure-de-cotonou.mjs` construit le harnais et le
   lance CINQ FOIS, sous cinq fuseaux : Porto-Novo (le salon), Toronto (une
   cliente au Canada : son telephone a six heures de retard), Shanghai (le
   poste du bureau, sept heures d'avance), Paris (a l'heure de Cotonou en
   hiver, pas en ete) et Los Angeles (neuf heures de retard). Chaque passage
   doit tenir : aucune place passee offerte, aucune place a venir cachee.
   `--prouve` remet chaque panne ci-dessous ; chacune doit faire crier au moins
   un fuseau. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu) ou dans une copie hors du depot pour les
   fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const FUSEAUX = ['Africa/Porto-Novo', 'America/Toronto', 'Asia/Shanghai', 'Europe/Paris', 'America/Los_Angeles'];
const CAL = 'src/shared/calendrier.ts';
const LIB = 'src/apps/couronne/lib.ts';
const HEU = 'src/apps/revelateur/heures.ts';
const BK = 'src/apps/couronne/Booking.tsx';
const MRV = 'src/apps/couronne/MesRendezVous.tsx';
const RES = 'src/apps/revelateur/ilots/Reserver.tsx';
const RG = 'src/apps/regler/App.tsx';

const PANNES = [
  { nom: 'Ma Couronne lit le jour du telephone', fichier: LIB,
    r: [['export const todayIso = () => momentDuSalon().jour;', 'export const todayIso = () => isoOf(new Date());']] },
  { nom: 'les places du jour lisent la minute du telephone', fichier: LIB,
    r: [['    maintenantMin: dateIso === salon.jour ? salon.minutes : null,\n    ...(lourde', '    maintenantMin: dateIso === isoOf(new Date()) ? new Date().getHours() * 60 + new Date().getMinutes() : null,\n    ...(lourde']] },
  { nom: 'un jour passe a Cotonou garde ses places', fichier: LIB,
    r: [['  if (dateIso < salon.jour) return [];\n', '']] },
  { nom: 'la grille du jour lit le telephone', fichier: LIB,
    r: [['  const salon = momentDuSalon();\n  return creneauxLibres({', '  const salon = { jour: isoOf(new Date()), minutes: new Date().getHours() * 60 + new Date().getMinutes() };\n  return creneauxLibres({']] },
  { nom: 'les mois partent du mois du telephone', fichier: CAL,
    r: [["  const [a, mo] = momentDuSalon(ms).jour.split('-').map(Number);", '  const [a, mo] = [new Date(ms).getFullYear(), new Date(ms).getMonth() + 1];']] },
  { nom: 'le jour d apres se compte a l heure du poste', fichier: CAL,
    r: [['  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);\n  d.setUTCDate(d.getUTCDate() + n);', '  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);\n  d.setDate(d.getDate() + n);']] },
  { nom: '« heures de Cotonou » ne se dit jamais', fichier: CAL,
    r: [['  try { return new Date(ms).getTimezoneOffset() !== -60; } catch { return false; }', '  try { return false && new Date(ms).getTimezoneOffset() !== -60; } catch { return false; }']] },
  { nom: 'la page contact lit le jour du telephone', fichier: HEU,
    r: [['const iso = (d: Date): string => momentDuSalon(d.getTime()).jour;', "const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;"]] },
  { nom: 'la page contact lit l heure du telephone', fichier: HEU,
    r: [['const minuteDuSalon = (d: Date): number => momentDuSalon(d.getTime()).minutes;', 'const minuteDuSalon = (d: Date): number => d.getHours() * 60 + d.getMinutes();']] },
  { nom: 'la reservation de Ma Couronne ouvre le mois du telephone', fichier: BK,
    r: [['  const months = useMemo(() => moisDuSalon(4), []);', '  const months = useMemo(() => [0, 1, 2, 3].map((k) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; }), []);']] },
  { nom: 'les six places de Ma Couronne partent du jour du telephone', fichier: BK,
    r: [['      const iso = jourDuSalonPlus(d0, k);', '      const iso = jourDuSalonPlus(new Date().toISOString().slice(0, 10), k);']] },
  { nom: 'la reservation de Ma Couronne ne dit plus l heure de Cotonou sous les heures', fichier: BK,
    r: [['                {dayTimes.length > 0 && <HeuresDeCotonou />}\n', '']] },
  { nom: 'deplacer dans Ma Couronne lit l heure du telephone', fichier: MRV,
    r: [['  const salon = momentDuSalon();\n  const nowTime', '  const salon = { minutes: new Date().getHours() * 60 + new Date().getMinutes() };\n  const nowTime']] },
  { nom: 'la phrase lue du site reprend le jour du telephone', fichier: RES,
    r: [['      aujourdhui: aCotonou.jour,\n      minutes: aCotonou.minutes,', '      aujourdhui: isoDuJour(m),\n      minutes: aCotonou.minutes,']] },
  { nom: 'les six places du site ne disent plus l heure de Cotonou', fichier: RES,
    r: [["                {aLEtranger() && <p className=\"legende\" style={{ marginTop: 8 }}>Heures de Cotonou.</p>}\n", '']] },
  { nom: 'Regler ne dit plus l heure de Cotonou', fichier: RG,
    r: [['              {horlogeAilleurs() && <p className="rg-doux rg-petit">Heures de Cotonou.</p>}\n', '']] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

/* L'HORLOGE FIGEE : `new Date()` et `Date.now()` rendent l'instant que le
   harnais choisit (`__figeLHorloge`). Un code qui lirait l'horloge du poste
   lit donc le meme instant, dans le fuseau du passage. */
const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', search: '', origin: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
const __VraieDate = Date;
let __instant = __VraieDate.now();
class __DateFigee extends __VraieDate {
  constructor(...a) { if (a.length === 0) super(__instant); else super(...a); }
  static now() { return __instant; }
}
globalThis.Date = __DateFigee;
globalThis.__figeLHorloge = (ms) => { __instant = ms; };`;

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-heure-de-cotonou-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-heure-de-cotonou.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: BANNIERE },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.HEURE_PANNE_FICHIER;
    delete env.HEURE_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.HEURE_PANNE_FICHIER = panne.fichier;
      env.HEURE_PANNE_COPIE = copie;
    }
    return FUSEAUX.map((tz) => spawnSync(process.execPath, [sortie], { cwd: racine, env: { ...env, TZ: tz }, encoding: 'utf8' }));
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const nets = await lance(null);
let tombe = false;
for (const r of nets) {
  process.stdout.write(r.stdout ?? '');
  if (r.status !== 0) { tombe = true; process.stderr.write(r.stderr ?? ''); }
}
if (tombe) { console.log('\nUn fuseau au moins ne tient pas.'); process.exit(1); }
console.log(`\nLes ${FUSEAUX.length} fuseaux tiennent.`);
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const rs = await lance(p);
    const crie = rs.find((r) => r.status !== 0 && (r.stdout ?? '').split('\n').some((l) => l.startsWith('ECHEC')));
    const epreuve = crie ? (crie.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC')) : null;
    const tombeSeul = !crie && rs.some((r) => r.status !== 0);
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : tombeSeul ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
