import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './dictee-au-propre-serveur.mjs';

/* LA DICTEE MND, EPROUVEE - 31 octobre 2026, sur le modele de verifie-la-banque.mjs.
   `node scripts/verifie-la-dictee.mjs` : le fichier de la fonction dictee-au-propre
   doit etre a jour avec le depot, puis le harnais (verifie-la-dictee.harnais.ts)
   tourne, la fonction regroupee depuis les sources du moment.
   `--prouve` : chaque panne est posee EN MEMOIRE (les modules par un greffon
   d esbuild, les ecrans par le texte que lit le harnais), jamais sur le
   disque : l arbre partage ne bouge pas. Le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/shared/dictee-pur.ts';
const SERVEUR = 'scripts/serveur/dictee-au-propre.ts';
const SHELL = 'src/apps/trone/shell/Shell.tsx';
const APPEL = 'src/shared/dictee.ts';

const PANNES = [
  ['la commande de mode ne se lit plus', PUR, "  const m = COMMANDE_DE_MODE.exec(texte ?? '');", '  const m = null;'],
  ['un doublon de mot passe', PUR, '    if (vus.has(k)) continue;\n', ''],
  ['le tiret long reste dans ce que Claude rend', PUR, "  t = t.replace(/\\s*—\\s*/g, ', ').replace(/\\n{3,}/g, '\\n\\n');", "  t = t.replace(/\\n{3,}/g, '\\n\\n');"],
  ['les hesitations restent au secours', PUR, "  let t = String(texte ?? '').replace(HESITATIONS, '');", "  let t = String(texte ?? '');"],
  ['l empreinte ne lit plus le jeton', PUR, "new TextEncoder().encode(String(jeton ?? '').trim())", "new TextEncoder().encode('')"],
  ['la porte s ouvre a tous', SERVEUR, "    if (!porte) return json({ ok: false, motif: 'reserve-au-personnel', version: VERSION }, 403);", '    if (false) return json({ ok: false, motif: \'reserve-au-personnel\', version: VERSION }, 403);'],
  ['le jeton du bureau n est plus compare', SERVEUR, '(await empreinteDuJeton(jetonDuBureau)) === reglages.bureau.empreinte', 'true'],
  ['le mode dit en parlant est ignore', SERVEUR, '    if (commande.mode) { mode = commande.mode; texte = commande.reste.trim() || texte; }', '    if (false) { mode = commande.mode; texte = commande.reste.trim() || texte; }'],
  ['le mode par defaut est oublie', SERVEUR, '    else if (!estMode(d.mode) && estMode(reglages.modeParDefaut)) mode = reglages.modeParDefaut;\n', ''],
  ['le modele regle est oublie', SERVEUR, '    const prefere = estModele(reglages.modele) ? reglages.modele : MODELE_PAR_DEFAUT;', '    const prefere = MODELE_PAR_DEFAUT;'],
  ['les prestations archivees entrent dans la consigne', SERVEUR, '...services.filter((s) => s.archived !== true).map((s) => chaine(s.name)),', '...services.map((s) => chaine(s.name)),'],
  ['le plafond du mois oublie', SERVEUR, '    if ((compte[mois]?.appels ?? 0) >= DICTEES_PAR_MOIS) {', '    if (false) {'],
  ['le compte du mois oublie', SERVEUR, "    await sb.from('documents').upsert({\n      key: CLE_DU_COMPTE,", '    void ({\n      key: CLE_DU_COMPTE,'],
  ['ce que Claude rend part sans passer au net', SERVEUR, "    const propre = nettoieLaReponse(rendu.corps.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\\n') ?? '');", "    const propre = (rendu.corps.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\\n') ?? '').trim();"],
  ['le bouton Dicter parait a qui ne voit pas l ecran', SHELL, "{peutVoir(role, '/dictee', mesDomaines) && <BoutonDictee />}", '<BoutonDictee />'],
  ['l appel attend hors ligne', APPEL, "  if (typeof navigator !== 'undefined' && navigator.onLine === false) return refus('hors-ligne');\n", ''],
];

const greffon = (panne) => ({
  name: 'panne-en-memoire',
  setup(b) {
    if (!panne || !panne.fichier.endsWith('.ts')) return;
    const cible = path.join(racine, panne.fichier).replace(/\\/g, '/');
    b.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.replace(/\\/g, '/') !== cible) return undefined;
      return { contents: readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').replace(panne.avant, panne.apres), loader: 'ts' };
    });
  },
});

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-dictee-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  const fonction = path.join(dossier, 'dictee-au-propre.js');
  try {
    const f = await build({
      entryPoints: [path.join(racine, SERVEUR)],
      bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
      external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent', mainFields: ['module', 'main'], plugins: [greffon(panne)],
    });
    writeFileSync(fonction, f.outputFiles[0].text);
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-dictee.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon(panne)],
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8',
      env: { ...process.env, DICTEE_FONCTION: fonction, ...(panne ? { DICTEE_PANNE: JSON.stringify(panne) } : {}) },
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const present = (() => { try { return readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } })();
if (present !== await fichierAttendu(racine)) {
  console.log(`ECHEC ${CIBLE} a pris du retard sur le depot : node scripts/dictee-au-propre-serveur.mjs`);
  process.exit(1);
}
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (!prouve) process.exit(0);

let muettes = 0;
for (const [nom, fichier, avant, apres] of PANNES) {
  const texte = readFileSync(path.join(racine, fichier), 'utf8').replace(/\r\n/g, '\n');
  if (texte.split(avant).length !== 2) { muettes += 1; console.log(`MUETTE introuvable : ${nom}`); continue; }
  const r = await lance({ fichier, avant, apres });
  if (r.status === 0) { muettes += 1; console.log(`MUETTE ${nom}`); } else console.log(`CRIE  ${nom}`);
}
console.log(muettes === 0 ? `\nLa preuve tient : ${PANNES.length} pannes, le banc crie a chacune.` : `\n${muettes} panne(s) muette(s).`);
process.exit(muettes ? 1 : 0);
