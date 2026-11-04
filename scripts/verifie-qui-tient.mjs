import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* QUI TIENT LA CONVERSATION, EPROUVE - 4 novembre 2026 (sur le modele de verifie-a-traiter).
   `node scripts/verifie-qui-tient.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un
   finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.

   Le paquet recoit les memes globales factices que `verifie-a-traiter`. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-qui-tient');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-qui-tient.harnais.ts')],
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

const PUR = 'src/shared/qui-tient-pur.ts';
const PANNES = [
  ['la prise ecrite oubliee', PUR, "if (prise?.nom?.trim()) return", "if (false && prise?.nom?.trim()) return"],
  ['un modele parti seul tenu pour la voix de la Maison', PUR, "x.auteur === 'equipe' || x.auteur === 'assistant');", "x.auteur === 'equipe' || x.auteur === 'assistant' || x.auteur === 'modele');"],
  ['la main de l equipe tenue sans limite', PUR, "age(voix.quand, maintenant) < TENUE_HUMAINE_MS", "true"],
  ['vous sans les accents', PUR, "plat(t.nom) === plat(moi)", "t.nom === moi"],
  ['la salle garde une conversation tenue', PUR, "b.attendUneReponse && !b.tri && t.qui === 'personne'", "b.attendUneReponse && !b.tri"],
  ['nouvelle meme avec une fiche', PUR, "if (!b.attendUneReponse || !b.sansFiche || b.tri) return false;", "if (!b.attendUneReponse || b.tri) return false;"],
  ['nouvelle apres une reponse de l equipe', PUR, "return !b.bulles.some((x) => x.auteur === 'equipe');", "return true;"],
  ['un rappel parti seul compte comme une attente', PUR, "['equipe', 'assistant', 'automate', 'chat'].includes(b.derniere.auteur)", "b.derniere.auteur !== 'elle'"],
  ['l attente sans limite de jours', PUR, "return age(b.derniere.quand, maintenant) < ATTENTE_MS;", "return true;"],
  ['l urgence passe apres Nouveau', PUR, "if (p.ton === 'terre') return { cle: 'urgent'", "if (p.ton === 'terre' && !estNouvelle(b, t)) return { cle: 'urgent'"],
  ['tenue ne fait pas En cours', PUR, "if (t.qui === 'equipe') return { cle: 'en-cours', dit: 'En cours', ton: 'indigo-pale' };", ""],
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
