import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE PLAN PART AVEC LE CHEMIN, EPROUVE (19 novembre 2026).
   `node scripts/verifie-le-plan-avec-le-chemin.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier par une epreuve. Les pannes vivent dans la memoire du bundle
   (un greffon d'esbuild remplace le texte lu) ou dans une copie hors du depot
   pour les fichiers que le harnais LIT : rien de l'arbre partage ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const OP = 'src/shared/opale-pur.ts';
const WA = 'supabase/functions/whatsapp-automate/index.ts';
const CO = 'src/apps/trone/routes/clients/ComposeurWhatsApp.tsx';
const PR = 'src/apps/trone/shell/ProgrammerUnWhatsApp.tsx';
const QR = 'src/apps/trone/routes/clients/QrCodes.tsx';
const PP = 'src/apps/trone/routes/clients/plan-pour-venir.ts';

const PANNES = [
  { nom: 'un lien Google Maps ne compte plus', fichier: OP,
    r: [['if (LIEU_DEJA_DIT.test(t) || LIEN_DE_CARTE.test(t)) return true;', 'if (LIEU_DEJA_DIT.test(t)) return true;']] },
  { nom: 'l adresse de la branche ne compte plus', fichier: OP,
    r: [['return a.length >= 8 && plat(t).includes(a);', 'return false;']] },
  { nom: 'une adresse de trois lettres suffit', fichier: OP,
    r: [['return a.length >= 8 && plat(t).includes(a);', 'return a.length >= 3 && plat(t).includes(a);']] },
  { nom: 'Opale laisse le plan au modele', fichier: WA,
    r: [["  if (!issue.silence && (demandeLeCheminWa(textesDuTour) || donneLeChemin(issue.texte, String(agenda?.lignes.branche.data?.address ?? '')))) issue.plan = true;\n", '']] },
  { nom: 'Opale n entend pas le chemin dans un vocal', fichier: WA,
    r: [["const textesDuTour = nouveaux.map((m) => [m.texte, m.transcription ?? ''].join(' ')).join(' ');", "const textesDuTour = nouveaux.map((m) => m.texte).join(' ');"]] },
  { nom: 'Conversations ne joint plus le plan seul', fichier: CO,
    r: [["if (!parleDuChemin || piece || planRefuse.current === fil.numero) return;", "if (true) return;"]] },
  { nom: 'le WhatsApp programme part sans le plan', fichier: PR,
    r: [["const avecLePlan = piece === 'itineraire' || (piece === 'aucune' && donneLeChemin(texte, branch.address ?? ''));", "const avecLePlan = false;"]] },
  { nom: 'les QR codes ouvrent WhatsApp sans le plan', fichier: QR,
    r: [["if (id === 'plan') { void envoieAvecLePlan(message, lien, 'Pas de numéro sur sa fiche : le message'); return; }\n", '']] },
  { nom: 'le partage oublie l image', fichier: PP,
    r: [['await navigator.share({ files: [plan], text: message });', 'await navigator.share({ text: message });']] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-plan-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-plan-avec-le-chemin.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.PLAN_PANNE_FICHIER;
    delete env.PLAN_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.PLAN_PANNE_FICHIER = panne.fichier;
      env.PLAN_PANNE_COPIE = copie;
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stderr.write(net.stderr); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const r = await lance(p);
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
