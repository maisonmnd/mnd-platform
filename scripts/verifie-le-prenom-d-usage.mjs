import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE PRENOM D'USAGE, `node scripts/verifie-le-prenom-d-usage.mjs` (7 novembre 2026).

   « Les clientes comme Anne-Marie, comme Marie Gisele, qui ont un prenom
   compose : c'est important que, quand on leur ecrit, on ecrive toujours,
   dans leur rendez-vous et dans leur messagerie WhatsApp, tout le prenom
   compose » (Yeman). Le harnais tient la regle (devinee, corrigeable par la
   fiche), ses copies dans les fonctions Edge, les ecrans et les messages qui
   lui parlent, et le champ de la fiche.

   Le banc tourne dans un processus fils (le paquet s'ecrit sous
   node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est posee une a une (copie gardee, restauration
   dans un finally, empreintes comparees), et le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-prenom-d-usage');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-prenom-d-usage.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
      external: ['esbuild'],
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

const CIV = 'src/shared/civilite.ts';
const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';
/* [nom, fichier, chaine exacte (fins de ligne LF), remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  ['le billet de la page du rdv revient au nom de la fiche (11 nov.)', 'supabase/functions/terminer-et-regler/index.ts',
    'prenom: prenomDUsage(fiche, l.data?.clientName),', "prenom: String(fiche?.name ?? l.data?.clientName ?? ''),"],
  ['la page Regler revient au premier mot (11 nov.)', 'supabase/functions/regler-la-seance/index.ts',
    'pageDuLien({ rdv: r, piece, prenom, branchId:', 'pageDuLien({ rdv: r, piece, branchId:'],
  ['terminer-et-regler perd le bloc (11 nov.)', 'supabase/functions/terminer-et-regler/index.ts', "'Paul', 'Pierre', 'Louis'];", "'Paul', 'Pierre'];"],
  ['la liste des prenoms qui se composent perd Marie', CIV,
    "const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne',", "const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Anne',"],
  ['un NOM en capitales n arrete plus le prenom', CIV, '  if (nomDeFamille > 0) {', '  if (nomDeFamille > 99) {'],
  ['le second prenom en minuscules garde sa minuscule', CIV,
    'const capitaleDuSecond = (m: string): string => (/^\\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);',
    'const capitaleDuSecond = (m: string): string => m;'],
  ['« X - Y » ne se recolle plus', CIV, '(motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`)', '(tout)'],
  ['le trait d union file vers le NOM en capitales', CIV, '(motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`)', '(`${g}-`)'],
  ['une particule devient un second prenom', CIV, ' && !PARTICULE_DU_NOM.test(second)) {', ') {'],
  ['le prenom note sur la fiche ne fait plus foi', CIV, '  return note || prenomDevine(c?.name ?? repli);', '  return prenomDevine(c?.name ?? repli);'],
  ['appelDe revient au premier mot', CIV, '  const prenom = prenomDUsage(c, repli);\n  const connue', '  const prenom = prenomSeul(c?.name ?? repli);\n  const connue'],
  ['une copie Edge du bloc derive (rappels-j1)', 'supabase/functions/rappels-j1/index.ts', "'Paul', 'Pierre', 'Louis'];", "'Paul', 'Pierre'];"],
  ['une copie Edge d appelDe revient au premier mot (avis-google)', 'supabase/functions/avis-google/index.ts',
    '  const prenom = prenomDUsage(d, repli);', "  const prenom = String(d?.name ?? repli ?? '').trim().split(/\\s+/)[0] ?? '';"],
  ['envois-partent perd le bloc', 'supabase/functions/envois-partent/index.ts', '/* ⟨prenom-d-usage⟩ */', '/* prenom-d-usage */'],
  ['le webhook ne lit plus le prenom note (la RPC)', 'supabase/functions/whatsapp-webhook/index.ts',
    "            prenomUsage: typeof f.prenomUsage === 'string' ? f.prenomUsage : undefined,\n", ''],
  ['l automate ne lit plus le prenom note', 'supabase/functions/whatsapp-automate/index.ts',
    '      ...(texteOu(f.prenomUsage) ? { prenomUsage: String(f.prenomUsage).trim() } : {}),\n', ''],
  ['Opale reprend le premier mot', 'supabase/functions/whatsapp-automate/index.ts', '    prenom: prenomDeLaFicheWa(f),\n', '    prenom: prenomDuNomWa(f.nom),\n'],
  ['la marraine reprend le premier mot (demande-submit)', 'supabase/functions/demande-submit/index.ts',
    'prenom: prenomDUsage(fiche.data), telephone:', "prenom: String(fiche.data.name ?? '').trim().split(/\\s+/)[0] ?? '', telephone:"],
  ['la migration ne rend plus prenomUsage', 'supabase/migrations/0173_le_prenom_d_usage.sql',
    "           'prenomUsage', nullif(btrim(coalesce(r.data->>'prenomUsage', '')), ''),\n", ''],
  ['le fichier regroupe de reception-wa prend du retard', 'supabase/functions/reception-wa/index.ts',
    '  const prenom = prenomDUsage(c, repli);', '  const prenom = prenomDevine(c?.name ?? repli);'],
  ['la fiche perd son champ', FICHE, '<ChampDuPrenomDUsage client={client} onPose={(v) => patch({ prenomUsage: v })} />', ''],
  ['le champ ne montre plus ce que le Trone devine', FICHE, "placeholder={devine ? `Deviné : ${devine}` : 'Son prénom'}", 'placeholder="Son prénom"'],
  ['le type de la fiche perd prenomUsage', 'src/shared/clients.ts', '  prenomUsage?: string;\n  /** SA LANGUE', '  /** SA LANGUE'],
  ['Ma Couronne salue par le premier mot', 'src/apps/couronne/Tabs.tsx', '  const brut = prenomDUsage(client);', "  const brut = (client?.name ?? '').trim().split(/\\s+/)[0] ?? '';"],
  ['la liste « Pour moi » de l automate dit le premier mot', 'src/shared/automate-wa.ts', '`Pour moi, ${prenomDeLaFicheWa(f)}`', '`Pour moi, ${prenomDuNomWa(f.nom)}`'],
  ['le foyer revient au premier mot', 'src/shared/foyer-pur.ts', "  return prenomDUsage({ name: mots.join(' '), prenomUsage: usage });", "  return mots[0] ?? '';"],
  ['la porte ne reconnait plus un message d avant', 'src/shared/porte-des-modeles-pur.ts', 'if (reste !== prenom && reste !== premierMot) return null;', 'if (reste !== prenom) return null;'],
  ['le rappel d un appel revient au premier mot', 'src/shared/appels.ts', '  const prenom = prenomDevine(a.nom) || a.nom.trim();', "  const prenom = a.nom.trim().split(/\\s+/)[0] || a.nom.trim();"],
  ['la piece dit le premier mot', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts',
    'const prenomOf = (d: Invoice) => prenomDUsage(clientOf(d), clientNameOf(d));', "const prenomOf = (d: Invoice) => clientNameOf(d).split(' ')[0];"],
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
