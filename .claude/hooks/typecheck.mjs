/* Hook « Stop » — TypeScript doit compiler avant que Claude rende la main.
 *
 * Ne se déclenche que si un .ts / .tsx a bougé (tsc prend ~20 s : inutile de le
 * lancer sur un tour de conversation). En cas d'erreur, la sortie de tsc est
 * renvoyée à Claude, qui corrige avant de terminer.
 *
 * Réglé dans .claude/settings.json — voir /hooks pour le désactiver. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..', '..');

function entree() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

/** Sort en rendant `raison` à Claude ; le tour ne se termine pas. */
function bloque(raison, resume) {
  process.stdout.write(
    JSON.stringify({ decision: 'block', reason: raison, systemMessage: resume }),
  );
  process.exit(0);
}

// Déjà relancé une fois par ce hook : ne pas boucler indéfiniment.
if (entree().stop_hook_active) process.exit(0);

let bouge = '';
try {
  bouge = execFileSync('git', ['status', '--porcelain'], {
    cwd: racine,
    encoding: 'utf8',
  });
} catch {
  // Pas de dépôt git accessible : on vérifie quand même.
  bouge = '?? force.ts';
}

const touche = bouge
  .split('\n')
  .some((ligne) => /\.tsx?$/.test(ligne.trim()));
if (!touche) process.exit(0);

try {
  execFileSync(
    process.execPath,
    [path.join(racine, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
    { cwd: racine, encoding: 'utf8', stdio: 'pipe' },
  );
} catch (err) {
  const sortie = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
  const lignes = sortie.split('\n').filter((l) => l.includes('error TS'));
  bloque(
    `\`npm run typecheck\` échoue — ${lignes.length} erreur(s) TypeScript. ` +
      `Corrige-les avant de terminer.\n\n${sortie}`,
    `TypeScript : ${lignes.length} erreur(s)`,
  );
}
