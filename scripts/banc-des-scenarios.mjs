import { build } from 'esbuild';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE BANC DES SCENARIOS - 30 octobre 2026.
   `node scripts/banc-des-scenarios.mjs [sauvegarde.json]` : la banque de la
   Maison (`mnd_scenarios_wa`), lue dans une sauvegarde (par defaut la plus
   recente de Telechargements), rejouee dans l automate du depot. Un cas
   valide qui ne tient plus fait echouer le banc : on corrige avant de mettre
   en ligne. Rien de la banque n entre dans le depot. */

const racine = path.resolve(import.meta.dirname, '..');
const donnee = process.argv[2];
const laPlusRecente = () => {
  const dossier = path.join(homedir(), 'Downloads');
  if (!existsSync(dossier)) return null;
  const f = readdirSync(dossier).filter((x) => /^sauvegarde-maison-mnd-.*\.json$/.test(x))
    .map((x) => ({ x, t: statSync(path.join(dossier, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  return f ? path.join(dossier, f.x) : null;
};
const sauvegarde = donnee ? path.resolve(donnee) : laPlusRecente();
if (!sauvegarde || !existsSync(sauvegarde)) {
  console.log('Aucune sauvegarde de la Maison : Systeme > Parametres > Sauvegarder la Maison, puis relancer.');
  process.exit(0);
}
const dossier = mkdtempSync(path.join(tmpdir(), 'banc-des-scenarios-'));
const sortie = path.join(dossier, 'banc.mjs');
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/banc-des-scenarios.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
  });
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, BANC_SAUVEGARDE: sauvegarde } });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
