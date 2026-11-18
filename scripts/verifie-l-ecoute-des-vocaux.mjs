import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* OPALE ECOUTE LES VOCAUX, EPROUVE - 18 novembre 2026 (sur le modele de verifie-le-rangement).
   « Opale doit etre en mesure d'ecouter, de comprendre les audios et de
   repondre directement » (Yeman).
   `node scripts/verifie-l-ecoute-des-vocaux.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune.
   `--prouve --seulement=main,journal` : les seules fautes dont le nom porte
   l'un de ces mots. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const seulement = (process.argv.find((a) => a.startsWith('--seulement=')) ?? '').slice('--seulement='.length).split(',').filter(Boolean);

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-l-ecoute-des-vocaux');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-ecoute-des-vocaux.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/ecoute-du-vocal-pur.ts';
const OPALE = 'src/shared/opale-pur.ts';
const WEBHOOK = 'supabase/functions/whatsapp-webhook/index.ts';
const AUTOMATE = 'supabase/functions/whatsapp-automate/index.ts';
const ECRAN = 'src/apps/trone/routes/clients/LesConversations.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  /* ── La regle ── */
  ['le fon lu comme une langue comprise', PUR, "  if (!langue) return vocalPasCompris('langue', le, langueBrute || undefined);\n", ''],
  ['le bruit passe pour des mots', PUR, '/ sansParole.length > SANS_PAROLE_AU_PLUS) return', '/ sansParole.length > 1) return'],
  ['les sous-titres du silence passent', PUR, "  if (texte.length <= 160 && PHRASES_DU_SILENCE.some((p) => p.test(texte))) return vocalPasCompris('bruit', le, langue);\n", ''],
  ['un long vocal n est plus coupe', PUR, '{ compris: true, texte: texte.slice(0, SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS),', '{ compris: true, texte,'],
  ['le texte d un vocal pas compris se lit quand meme', PUR, "  return t.compris === true && typeof t.texte === 'string'", "  return typeof t.texte === 'string'"],
  ['le nom part sans extension', PUR, "  return `${n || 'vocal'}.${ext}`;", "  return n || 'vocal';"],
  /* ── Opale ── */
  ['Opale ne lit plus la transcription', OPALE, 'const vocal = m.transcription ? `', 'const vocal = false ? `'],
  ['un vocal incompris ne passe plus la main', OPALE, "nouveaux.some((m) => m.type === 'audio' && !String(m.transcription ?? '').trim());", 'nouveaux.some(() => false);'],
  ['la vieille consigne revient', OPALE, 'LES VOCAUX : la Maison les écoute pour toi.', 'Un vocal ou une vidéo : tu ne les entends pas.'],
  /* ── La reception ── */
  ['la reception n ecoute plus', WEBHOOK, "if (e.media.genre === 'audio' && cleDuMoteur) vocaux.set(", 'if (false && cleDuMoteur) vocaux.set('],
  ['la transcription ne s ecrit pas sur le message', WEBHOOK, '          ...(vocaux.has(e.waId) ? { transcription: vocaux.get(e.waId) } : {}),\n', ''],
  ['le journal dit le texte', WEBHOOK, 'signes: t.texte.length,', 'texte: t.texte,'],
  ['la cle de VoxBubble au lieu de celle de la Maison', WEBHOOK, "Deno.env.get('GROQ_API_KEY')", "Deno.env.get('VOXBUBBLE_GROQ_KEY')"],
  /* ── L automate ── */
  ['Claude appele pour un vocal incompris', AUTOMATE, 'if (claude && !finDuRituel && !vocalIncompris) {', 'if (claude && !finDuRituel) {'],
  ['la main passe en parlant', AUTOMATE, '  if (vocalIncompris) {\n    issue.silence = true;', '  if (vocalIncompris) {\n    issue.silence = false;'],
  ['une relance compte un vocal', AUTOMATE, 'const vocalIncompris = !finDuRituel && !o.relance && ', 'const vocalIncompris = !finDuRituel && '],
  ['le fil d Opale sans transcription', AUTOMATE, "      ...(d.type === 'audio' && texteDuVocal(d.transcription) ? { transcription: texteDuVocal(d.transcription) } : {}),\n", ''],
  /* ── Le Trone ── */
  ['le Trone tait la transcription', ECRAN, '<i>Transcription automatique</i>', '<i>Vocal</i>'],
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
