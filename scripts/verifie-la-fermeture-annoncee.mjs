import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA FERMETURE ANNONCEE ET L'HEURE D'OUVERTURE, EPROUVEES - 6 novembre 2026.
   `node scripts/verifie-la-fermeture-annoncee.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/fermeture-pur.ts';
const CAD = 'src/shared/cadence-pur.ts';
const FLU = 'src/apps/trone/routes/clients/rdv-fluide-pur.ts';
const RDV = 'src/apps/trone/routes/clients/_shared.tsx';
const MONTE = 'src/apps/revelateur/monte.tsx';
const GEN = 'scripts/genere-revelateur.mjs';
const TABS = 'src/apps/couronne/Tabs.tsx';
const BOOK = 'src/apps/couronne/Booking.tsx';
const SQL = 'supabase/migrations/0167_aucun_rdv_avant_l_ouverture.sql';
const PANNES = [
  ['la journee d une personne annoncee', PUR, '    if (!x || x.staffId || !x.closed', '    if (!x || !x.closed'],
  ['la semaine ne recoud plus la suite', PUR, '        if (!fermeLe(d)) { cousu = false; break; }', '        if (fermeLe(d) && false) { cousu = false; break; }'],
  ['annoncee des la premiere fois', PUR, 'export const HORIZON_D_UNE_FERMETURE = 60;', 'export const HORIZON_D_UNE_FERMETURE = 600;'],
  ['un jour seul trop loin cache la suite', PUR, '    if (ecart(o.aujourdhui, du) > horizon) continue;', '    if (ecart(o.aujourdhui, du) > horizon) return null;'],
  ['une fermeture passee reste dite', PUR, '    if (au < o.aujourdhui) continue;', ''],
  ['pas de reouverture dite', PUR, '      if (!fermeLe(d)) { reprise = d; break; }', ''],
  ['le 1er devient 1', PUR, "quantieme: n === 1 ? '1er' : String(n)", 'quantieme: String(n)'],
  ['le mois dit deux fois', PUR, '  return `du ${a.jour} ${a.quantieme} au ${dateDite(au)}`;', '  return `du ${dateDite(du)} au ${dateDite(au)}`;'],
  ['la Maison sans son nom entier', PUR, '      : `La Maison MND est fermée ${periodeDite(f.du, f.au)}.`;', '      : `La Maison est fermée ${periodeDite(f.du, f.au)}.`;'],
  ['la cadence oublie son jour apres une fermeture', CAD, '    if (jours.includes(fromISO(d).getDay()) && !estFerme(d)) return d;', ''],
  ['l heure d ouverture se force', FLU, '  if ((e.force && !e.raison?.sansPasseDroit) || !e.raison?.bloque', '  if (e.force || !e.raison?.bloque'],
  ['8 h 30 un samedi passe', FLU, '  if (!o.ouverture.closed && debut < o.ouverture.openMin) {', '  if (false) {'],
  ['le bouton Poser quand meme revient', RDV, '              {raison.bloque && !raison.sansPasseDroit && (forcePlein ? (', '              {raison.bloque && (forcePlein ? ('],
  ['le site ne monte plus la fermeture', MONTE, "  fermeture: () => import('./ilots/BandeauFermeture') as unknown as ReturnType<Chargeur>,\n", ''],
  ['l accueil sans la fermeture', GEN, '      <div data-ilot="fermeture" data-genre="accueil"></div>\n', ''],
  ['Ma Couronne sans la fermeture', TABS, '        <FermetureAnnoncee />\n', ''],
  ['la reservation de Ma Couronne sans la fermeture', BOOK, '        {vue < 6 && <FermetureAnnoncee />}\n', ''],
  ['le mur apres l ecriture', SQL, '  before insert or update on public.appointments', '  after insert or update on public.appointments'],
  ['le mur touche le passe', SQL, "  if jour < (now() at time zone 'Africa/Porto-Novo')::date then", '  if false then'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-fermeture-annoncee');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-fermeture-annoncee.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
