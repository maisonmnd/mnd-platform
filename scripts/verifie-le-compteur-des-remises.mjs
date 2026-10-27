import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE COMPTEUR DES REMISES, EPROUVE (26 octobre 2026).
   `node scripts/verifie-le-compteur-des-remises.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.

   Le pur importe les juges des codes (promos.ts) et de l'encaisse (agenda.ts),
   qui portent le magasin local et la synchronisation : le paquet recoit le
   meme decor minimal que verifie-promos (localStorage, window, document). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-compteur-des-remises');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-compteur-des-remises.harnais.ts')],
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

const PUR = 'src/shared/compteur-des-remises-pur.ts';
/* Les huit fautes de la carte de construction (lot 3, vue Offres et remises). */
const PANNES = [
  ['un orphelin passe (sa ligne en attente comptee partie)', PUR, '    if (attendEncore(e)) continue;\n', ''],
  ['une venue sans date de prise comptee', PUR, "const pose = Date.parse(a.creeLe ?? '');", 'const pose = Date.parse(a.creeLe ?? `${a.date}T09:00:00Z`);'],
  ['un code gagnant compte deux fois (piece + rendez-vous)', PUR, 'const cleU = p.apptId ? `rdv:${p.apptId}` : `piece:${p.id}`;', 'const cleU = `piece:${p.id}`;'],
  ['le label famille compte comme remise du code', PUR, 'remiseXof: o.remiseDuRdvXof(a.id),', 'remiseXof: pr ? francs(pr.globalDiscountXof) : o.remiseDuRdvXof(a.id),'],
  ['une des trois graphies oubliee (Promotion)', PUR, "  if (/^Promotion\\s+/i.test(l)) return l.replace(/^Promotion\\s+/i, '').trim() || null;\n", ''],
  ['le verdict chiffre sous vingt envois', PUR, 'if (envoyes < ENVOIS_POUR_MESURER)', 'if (envoyes < 0)'],
  ['les bornes 10 % et 3 inversees', PUR, 'taux >= TAUX_UTILE && (rendement === null ? v.caXof > 0 : rendement >= RENDEMENT_UTILE)', 'taux >= RENDEMENT_UTILE && (rendement === null ? v.caXof > 0 : rendement >= TAUX_UTILE)'],
  ['normaliseLeCode applique a un code d offre', PUR, 'const cle = codeNormalise(offre.code);', 'const cle = normaliseLeCode(offre.code);'],
  /* Relecture du 27 octobre 2026 : le juge reduit a l ancienne signature range
     les codes du fabricant d aujourd hui en « direction ». */
  ['le juge ne reconnait que l ancienne signature', PUR, "/^(assistant maison|g[ée]rard)$/i.test((parQui ?? '').trim())", "(parQui ?? '') === 'Gérard'"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
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
