import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* ARCHIVER ET SUPPRIMER UNE DISCUSSION, EPROUVES - 18 novembre 2026 (sur le modele de verifie-recus).
   « Il faut la faire exactement comme WhatsApp avec des messages a archiver
   ou supprimer » (Yeman).
   `node scripts/verifie-le-rangement.mjs` : le banc, dans un processus fils (le
   paquet s'ecrit sous node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.
   `--prouve --seulement=archive,supprime` : les seules fautes dont le nom porte
   l'un de ces mots. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) ?? '').slice('--seulement='.length).split(',').filter(Boolean);

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-rangement');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-rangement.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/rangement-des-boites-pur.ts';
const MAGASIN = 'src/shared/conversations-supprimees.ts';
const ECRAN = 'src/apps/trone/routes/clients/LesConversations.tsx';
const CROCHET = 'src/apps/trone/shell/useRecus.ts';
const GERARD = 'src/apps/trone/routes/clients/Gerard.tsx';
const ALARME = 'src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  /* ── Le pur ── */
  ['les numeros des fils oublies : l archive du 15 septembre ne vaut plus', PUR, '    if (n) cles.add(n);\n', ''],
  ['l archive tient malgre un message plus recent', PUR, '  return Number.isFinite(le) && derniere <= le;', '  return Number.isFinite(le);'],
  ['l archive comparee en texte', PUR, "const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN);", "const ms = (iso: string | undefined): number => (iso ? Number(iso.replace(/[^0-9]/g, '').slice(0, 14)) : NaN);"],
  ['la plus ancienne marque l emporte', PUR, '    if (Number.isFinite(q) && !(q <= le)) le = q;', '    if (Number.isFinite(q) && !(q >= le)) le = q;'],
  ['la supprimee revient entiere quand elle reecrit', PUR, '  const bulles = b.bulles.filter((x) => ms(x.quand) > le);', '  const bulles = b.bulles.some((x) => ms(x.quand) > le) ? b.bulles : [];'],
  ['son dernier mot d avant revient', PUR, '  const derniereDElle = b.derniereDElle && ms(b.derniereDElle.quand) > le ? b.derniereDElle : undefined;', '  const derniereDElle = b.derniereDElle;'],
  ['la supprimee reste dans les archivees', PUR, '    const b = apresLaSuppression(brute, supprimees);\n    if (!b) continue;', '    const b = apresLaSuppression(brute, supprimees) ?? brute;'],
  ['« n: » s ecrit', PUR, "  for (const k of cles) if (k && k !== 'n:') suivant[k]", '  for (const k of cles) if (k) suivant[k]'],
  ['l heure d une ligne sans l annee', PUR, '  return `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;', '  return `${j.slice(8, 10)}/${j.slice(5, 7)}`;'],
  ['l heure d une ligne a l heure de Paris', PUR, '  if (j === auj) { const h = new Date(t + 3_600_000).toISOString();', '  if (j === auj) { const h = new Date(t).toISOString();'],
  /* ── Le magasin ── */
  ['la suppression n est plus partagee', MAGASIN, "bindDocument(conversationsSupprimeesStore, 'mnd_conversations_supprimees');\n", ''],
  /* ── L ecran, le Shell, Perle, l alarme ── */
  ['l ecran ne range plus', ECRAN, 'rangeLesBoites(toutesLesBoites, archives, supprimees)', 'rangeLesBoites(toutesLesBoites, {}, {})'],
  ['archiver redevient la direction seule', ECRAN, '  const archive = (b: Boite) => {\n', '  const archive = (b: Boite) => {\n    if (!estDirection) return;\n'],
  ['supprimer ouvert a tous', ECRAN, '  const supprime = (b: Boite) => {\n    if (!estDirection) return;\n', '  const supprime = (b: Boite) => {\n'],
  ['la confirmation saute', ECRAN, '{aSupprimer && estDirection && (', '{false && aSupprimer && estDirection && ('],
  ['le Shell compte les archivees', CROCHET, 'rangeLesBoites(boitesBrutes, archives, supprimees).actives', 'boitesBrutes'],
  ['Perle compte les supprimees', GERARD, ' && !estArchive(f, supprimees)', ''],
  ['l alarme sonne pour une supprimee', ALARME, 'tous.filter((f) => !estArchive(f, supprimees))', 'tous'],
];

const aProuver = PANNES.filter((x) => seulement.length === 0 || seulement.some((mot) => x[0].includes(mot)));
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of aProuver) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${aProuver.length} fautes${seulement.length ? ` (les seules « ${seulement.join(', ')} », ${PANNES.length} en tout)` : ''}, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
