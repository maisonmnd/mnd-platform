import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA VOIX DU NUMERO, EPROUVEE - 4 novembre 2026 (sur le modele de verifie-qui-tient).
   `node scripts/verifie-la-voix-du-numero.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un
   finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.

   Le paquet recoit les memes globales factices que `verifie-a-traiter`. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-voix-du-numero');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-voix-du-numero.harnais.ts')],
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

const PUR = 'src/shared/voix-du-numero-pur.ts';
const CONV = 'src/shared/conversations.ts';
const GERARD = 'src/apps/trone/routes/clients/Gerard.tsx';
const BOITE = 'src/shared/boite-unique-pur.ts';
const LES = 'src/apps/trone/routes/clients/LesConversations.tsx';
const FIL = 'src/shared/voix-du-fil-pur.ts';
const PANNES = [
  ['une mineure parle sur le numero de sa mere', PUR, "if (estMineur(f, aujourdhui)) return false;", ""],
  ['le nom Maman ou Papa ignore', PUR, "return !LIBELLE_PARENTAL.test(nom ?? '');", "return true;"],
  ['le payeur qui a son numero parle quand meme', PUR, "const payeurSansNumero = !!payeur && !cleDuNumero(payeur.phone) && !cleDuNumero(payeur.phone2);", "const payeurSansNumero = !!payeur;"],
  ['une fiche archivee parle encore', PUR, "const vivantes = o.fiches.filter((f) => !f.archived);", "const vivantes = o.fiches;"],
  ['pas d elision devant une voyelle', PUR, "const de = /^[aeiouyàâäéèêëîïôöûüh]/i.test(prenoms) ? 'd’' : 'de ';", "const de = 'de ';"],
  ['l enfant garde son numero dans les tetes', CONV, "phone: parle(c, 'phone') ? c.phone : undefined, phone2: parle(c, 'phone2') ? c.phone2 : undefined,", "phone: c.phone, phone2: c.phone2,"],
  ['la voix sans fiche devient une cliente', CONV, "      clientId: tete && !tete.sansFiche && (tete.tiroir", "      clientId: tete && (tete.tiroir"],
  ['un ecran oublie les comptes famille', GERARD, "tetesDeLaMaison({ clientes: clients, familles })", "tetesDeLaMaison({ clientes: clients })"],
  ['un enfant sans date de naissance parle sous son payeur', PUR, "if (ageDe(f.birthday, aujourdhui) !== undefined || !f.familyId) return false;", "return false;"],
  ['le payeur sans numero ne parle pas pour l enfant sans date', PUR, "return (!p1 && !p2) || (!!k && (p1 === k || p2 === k));", "return !!k && (p1 === k || p2 === k);"],
  ['une fiche archivee passe devant la voix', CONV, "const tetes: TeteConnue[] = clientes.filter((c) => !c.archived).map(teteDe);", "const tetes: TeteConnue[] = clientes.map(teteDe);"],
  ['le fil du parent s efface', CONV, "f.sansFiche && !f.parentDe?.length && f.messages.length > 0", "f.sansFiche && f.messages.length > 0"],
  ['le fil du parent perd ses enfants', CONV, "      ...(tete?.sansFiche && tete.enfants?.length ? { parentDe: tete.enfants } : {}),\n      prive: prives.includes(numero),", "      prive: prives.includes(numero),"],
  ['la boite range le parent sous l enfant', BOITE, "if (k && clientId && !muette(clientId, k) && !clienteDuNumero.has(k))", "if (k && clientId && !clienteDuNumero.has(k))"],
  ['une piece ancienne de l enfant tire la boite', BOITE, "if (clientId && !muette(clientId, k)) return `c:${clientId}`;", "if (clientId) return `c:${clientId}`;"],
  ['l archivee prend le numero des vivantes', BOITE, "if (!portesParLesVivantes.has(cleDuNumero(brut))) pose(brut, c.id);", "pose(brut, c.id);"],
  ['la boite perd le parent', BOITE, "      ...(parentDe ? { parentDe } : {}),\n", ""],
  ['la boite oublie les comptes famille', LES, "clientes: clients, familles, maintenant", "clientes: clients, maintenant"],
  ['le parent se bloque', LES, "estDirection && b.sansFiche && !b.parentDe && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && <button", "estDirection && b.sansFiche && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && <button"],
  ['le serveur laisse parler l enfant sans date', FIL, " && !muetteSousSonPayeur(f, c, connues, familles, aujourdhui));", ");"],
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
