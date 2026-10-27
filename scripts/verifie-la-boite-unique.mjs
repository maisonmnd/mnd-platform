import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA BOITE UNIQUE DES CONVERSATIONS, EPROUVEE - 26 octobre 2026.
   `node scripts/verifie-la-boite-unique.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un
   finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.

   Le pur importe `conversations` (magasins, synchro) : le paquet recoit donc
   les memes globales factices que `verifie-conversations`. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-boite-unique');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-boite-unique.harnais.ts')],
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

const PUR = 'src/shared/boite-unique-pur.ts';
const PANNES = [
  ['une demande du site comptee deux fois', PUR, "      if (m.canal === 'site' && demandeId && idsDesDemandes.has(demandeId)) continue;\n", ''],
  ['un souci WhatsApp compte deux fois', PUR, '      if (souci) soucisVus.add(souci.id);\n', ''],
  ['un point recu tenu pour une main humaine', PUR, 'debut !== null && estUneMainHumaine(m)', "debut !== null && m.sens === 'sortant' && !m.modele"],
  ['le numero joint par numeroWa', PUR, 'const cleDuNumero = (brut: string | undefined): string => cleDuNumeroWa(brut);', 'const cleDuNumero = (brut: string | undefined): string => numeroWa(brut);'],
  ['un fil WhatsApp juge hors Fil.attendUneReponse', PUR, "if (b.fils.some((f) => f.attendUneReponse)) pourquoi.push('whatsapp');", "if (b.fils.some((f) => f.dernierQuiCompte.sens === 'entrant')) pourquoi.push('whatsapp');"],
  ['repondues sous 1 h compte Le Trone', PUR, 'debut !== null && estUneMainHumaine(m)', "debut !== null && m.sens === 'sortant' && !m.auto"],
  /* Le journal (`estEnvoiAutomatique`, lot 2) reconnait l'Assistant lui aussi :
     la faute plausible est un juge qui ne regarde que « Le Trone ». */
  ['l Assistant tenu pour une main humaine', PUR, "m.sens === 'sortant' && !m.auto && !estPartiSeul(m.parQui);", "m.sens === 'sortant' && !m.auto && m.parQui !== 'Le Trône';"],
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
