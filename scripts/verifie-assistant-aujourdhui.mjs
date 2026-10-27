import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* AUJOURD'HUI, LA VUE D'ENTREE DE L'ASSISTANT MAISON, EPROUVEE - 26 octobre 2026.
   `node scripts/verifie-assistant-aujourdhui.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.
   Le harnais importe aussi demandes.ts et appels-wa.ts (leurs juges, pour
   dire que les copies du pur disent comme eux) : ils lisent un magasin, d'ou
   le define et la banniere, comme verifie-conversations. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-assistant-aujourdhui');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-assistant-aujourdhui.harnais.ts')],
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

const PUR = 'src/shared/assistant-aujourdhui-pur.ts';
/* Les sept pannes de la carte de construction (lot 3, §1.1), plus une sur le
   journal, plus deux sur le modele parti seul par le facteur (lot 2, ligne
   `-whatsapp`, 27 octobre 2026). */
const PANNES = [
  ['la ligne push retrouvee par un autre id que idDeLaLigne', PUR,
    "parId.get(idDeLaLigne(o.aujourdhui, s.clientId, 'push')) ??",
    "o.envois.find((e) => e.type === 'gerard' && e.clientId === s.clientId && e.canal === 'push') ??"],
  ['un ecarte compte parti', PUR, "  if (d === 'ecarte') return 'ecartee';\n", ''],
  ['le jour lu en UTC au lieu de l heure du salon', PUR,
    'const jour = jourDuSalon(new Date(maintenantMs).toISOString());',
    'const jour = new Date(maintenantMs).toISOString().slice(0, 10);'],
  ['la portee compte les enfants du foyer', PUR, '!f.ecartee && !f.enfantDuFoyer && canalDe', '!f.ecartee && canalDe'],
  ['la tuile des remises lit ce qui reste au lieu des faites', PUR,
    '      faites: o.plafond.faites,', '      faites: o.plafond.remisesParSemaine - o.plafond.restantes,'],
  ['un fil WhatsApp juge hors de Fil.attendUneReponse', PUR,
    '    if (!f.attendUneReponse) continue;', "    if (f.dernierQuiCompte.sens !== 'entrant') continue;"],
  ['les francs en jeu au franc pres', PUR,
    'const marge = Math.max(PAS_DES_FRANCS, Math.ceil((brut * MARGE_DES_FRANCS_PCT) / 100 / PAS_DES_FRANCS) * PAS_DES_FRANCS);',
    'const marge = 0;'],
  ['un ecarte compte parti au journal du jour', PUR,
    'return { jour, rangees, lignes: duJour.length, compte: compteDuJournal(duJour) };',
    'return { jour, rangees, lignes: duJour.length, compte: { ...compteDuJournal(duJour), partis: duJour.length } };'],
  ['la ligne whatsapp (le modele parti seul) ignoree', PUR,
    "    parId.get(idDeLaLigne(o.aujourdhui, s.clientId, 'whatsapp')) ??\n", ''],
  ['le modele parti seul dit l heure de la salle au lieu du passage du matin', PUR,
    "e?.canal === 'whatsapp' ? 'part seul au passage du matin' : ", ''],
  ['la carte d anniversaire tait son heure de 10 h', PUR,
    "if (etat === 'en-salle' && carte && e) return quandIlPart(e, maintenantMs) || 'part à l’instant';", ''],
  ['toute ligne prise pour une carte', PUR,
    "departDe(envoi, etat, o.maintenantMs, s.genre === 'anniversaire')", 'departDe(envoi, etat, o.maintenantMs, true)'],
];

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
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
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
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
