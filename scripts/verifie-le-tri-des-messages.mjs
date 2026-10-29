import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './tri-des-messages-serveur.mjs';

/* LE TRI DES DEMARCHEURS, EPROUVE - 29 octobre 2026 (sur le modele de
   verifie-la-reception-wa).
   `node scripts/verifie-le-tri-des-messages.mjs` : le fichier a coller doit
   etre a jour avec le depot (sinon : node scripts/tri-des-messages-serveur.mjs),
   puis les regles pures, la fonction regroupee depuis les sources du moment
   contre une base, un Claude et un WhatsApp simules, l'automate et le Trone.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier
   source, et le banc doit crier a chacune. JAMAIS dans l'arbre commun : dans
   une copie (git worktree). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-tri-des-messages');
  mkdirSync(dossier, { recursive: true });
  try {
    const fonction = path.join(dossier, 'tri-des-messages.ts');
    writeFileSync(fonction, await fichierAttendu(racine));
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-tri-des-messages.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: 'const __m = new Map(); globalThis.localStorage ??= { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) }; globalThis.window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: "" }, setInterval() { return 0; }, clearInterval() {} }; globalThis.document ??= { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" }; globalThis.navigator ??= { onLine: true };' },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, TRI_FONCTION: fonction } });
  } catch (e) {
    return { status: 1, stdout: `ECHEC construction : ${String(e?.message ?? e).slice(0, 300)}\n`, stderr: '' };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const SERVEUR = 'scripts/serveur/tri-des-messages.ts';
const PUR = 'src/shared/tri-des-messages-pur.ts';
const AUTO = 'supabase/functions/whatsapp-automate/index.ts';
const BOITE = 'src/shared/boite-unique-pur.ts';
const PANNES = [
  ['une fiche jugee quand meme', SERVEUR, "  if (fiches.some((f: { id?: unknown }) => typeof f?.id === 'string' && f.id)) return true;\n", ''],
  ['un echange passe juge quand meme', SERVEUR, '  return (sortants ?? []).length > 0;', '  return false;'],
  ['le demarcheur range sans blocage WhatsApp', SERVEUR, "    const pose = await bloqueChezMeta('POST', numero);\n    await ecritLeTri(sb, avecUnBloque(tri, { ...entree, meta: pose ? 'bloque' : 'echec' }));", "    const pose = true;\n    await ecritLeTri(sb, avecUnBloque(tri, { ...entree, meta: pose ? 'bloque' : 'echec' }));"],
  ['la proposition sans notification', SERVEUR, '    await previensDUneProposition(base, service, entree);\n', ''],
  ['la cliente rejugee a chaque message', SERVEUR, "  if (etat === 'blanc' || etat === 'juge') return json({ ok: true, verdict: 'passe', version: VERSION });", "  if (etat === 'blanc') return json({ ok: true, verdict: 'passe', version: VERSION });"],
  ['debloquer sans WhatsApp', SERVEUR, "    const meta = etaitBloque ? await bloqueChezMeta('DELETE', numero) : true;", '    const meta = true;'],
  ['n importe quel jeton passe au Trone', SERVEUR, '    if (error || estPersonnel !== true) return avecCors(', '    if (false) return avecCors('],
  ['la passe range sans la direction', SERVEUR, '        proposes.push({ numero, nom: x.nom, extrait: extraitDe(x.textes.slice(0, 3)), verdict: lu.verdict, motif: lu.motif });', '        proposes.push({ numero, nom: x.nom, extrait: extraitDe(x.textes.slice(0, 3)), verdict: lu.verdict, motif: lu.motif }); await ecritLeTri(sb, avecUnBloque(await litLeTri(sb), { numero, quand, motif: lu.motif, extrait: "", par: "claude" }));'],
  ['rendu sans la liste blanche', PUR, '  return { bloques: sans(tri.bloques, k), propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: { ...tri.blancs, [k]: quand } };', '  return { bloques: sans(tri.bloques, k), propositions: sans(tri.propositions, k), juges: sans(tri.juges, k), blancs: tri.blancs };'],
  ['le doute bloque', PUR, "    '- Dans le doute, \"doute\" : un message bloqué à tort fait perdre une cliente.',\n", ''],
  ['un verdict inconnu passe', PUR, "  if (typeof verdict !== 'string' || !(VERDICTS_DU_TRI as readonly string[]).includes(verdict)) return null;", "  if (typeof verdict !== 'string') return null;"],
  ['l automate trie apres son interrupteur', AUTO, "  if (o.tiroir === 'clientes' && await estRangeParLeTri(sb, o, docs.get('mnd_tri_des_messages'))) return { pris: true };\n", ''],
  ['un bloque reste dans A traiter', BOITE, "  if (b.tri?.etat === 'bloque') return ['bloques'];\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  let present = '';
  try { present = readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
  const aJour = present === await fichierAttendu(racine);
  console.log(aJour ? 'OK    le fichier a coller est a jour avec le depot' : 'ECHEC le fichier a coller a pris du retard : node scripts/tri-des-messages-serveur.mjs');
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = aJour && r.status === 0 ? 0 : 1;
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
