import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* REPASSER EN SUGGESTION, EPROUVE - 26 novembre 2026 (sur le modele de verifie-le-rendez-vous-suggere).
   `node scripts/verifie-repasser-en-suggestion.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-repasser-en-suggestion');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-repasser-en-suggestion.harnais.ts')],
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

const PUR = 'src/shared/rendez-vous-suggere-pur.ts';
const MAG = 'src/shared/carte-du-prochain-rituel.ts';
const FICHE = 'src/apps/trone/routes/clients/_shared.tsx';
const CARNET = 'src/apps/trone/routes/clients/Carnet.tsx';
const PANNES = [
  ['une suggestion se repasse', PUR, "if (!a || a.status !== 'confirmé' || estSuggere(a)) return false;", "if (!a || a.status !== 'confirmé') return false;"],
  ['une place prise en ligne se repasse', PUR, '  if (marquePosee(a.attenduJusquAu)) return false;\n', ''],
  ['un rendez-vous sans fiche se repasse', PUR, "  if (typeof a.clientId !== 'string' || a.clientId.trim() === '') return false;\n", ''],
  ['un rendez-vous passe se repasse', PUR, '  return `${jour} ${heure}` > minuteACotonou(maintenantMs);', '  return true;'],
  ['l heure se lit en UTC', PUR, "const minuteACotonou = (ms: number): string => new Date(ms + 3_600_000)", "const minuteACotonou = (ms: number): string => new Date(ms)"],
  ['la confirmation ne se tait pas', PUR, "  return { ...reste, suggereLe: maintenantIso, sansConfirmation: true } as A;", "  return { ...reste, suggereLe: maintenantIso } as A;"],
  ['son oui reste', PUR, "  const { confirmeeParLaClienteLe: _oui, ouiNoteParLeComptoir: _comptoir, autreMomentDemandeLe: _autre, ...reste } = a;",
    "  const { ouiNoteParLeComptoir: _comptoir, autreMomentDemandeLe: _autre, ...reste } = a;"],
  ['« un autre moment » reste', PUR, "  const { confirmeeParLaClienteLe: _oui, ouiNoteParLeComptoir: _comptoir, autreMomentDemandeLe: _autre, ...reste } = a;",
    "  const { confirmeeParLaClienteLe: _oui, ouiNoteParLeComptoir: _comptoir, ...reste } = a;"],
  ['la marque garde l ancienne date', PUR, "  return { ...reste, suggereLe: maintenantIso, sansConfirmation: true } as A;", "  return { ...reste, suggereLe: a.suggereLe ?? maintenantIso, sansConfirmation: true } as A;"],
  ['le Trone promet une relance passee', PUR, '  const suite = relance && relance >= o.aujourdhui\n', '  const suite = relance\n'],
  ['le Trone tait la relance du jour', PUR, '  const suite = relance && relance >= o.aujourdhui\n', '  const suite = relance && relance > o.aujourdhui\n'],
  ['le magasin ecrit sans la garde', MAG, '    if (a.id !== rdvId || !peutRepasserEnSuggestion(a, maintenant)) return a;', '    if (a.id !== rdvId) return a;'],
  ['la fiche montre le geste sans sa garde', FICHE, "status === 'confirmé' && peutRepasserEnSuggestion(rdvDuMagasin, Date.now()) && (", "status === 'confirmé' && ("],
  ['le Carnet montre le geste sans sa garde', CARNET, '{peutRepasserEnSuggestion(a, Date.now()) && (', '{a.status === \'confirmé\' && ('],
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
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
