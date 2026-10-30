/* LE FICHIER A COLLER DE LA FONCTION « variantes-wa » - 30 octobre 2026,
   sur le modele de reception-wa-serveur.mjs.

     node scripts/variantes-wa-serveur.mjs            reecrit le fichier
     node scripts/variantes-wa-serveur.mjs --verifie  dit seulement s il est a jour

   `verifie-les-variantes` appelle `fichierAttendu` et crie si le fichier
   colle a pris du retard sur le depot. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/variantes-wa.ts';
export const CIBLE = 'supabase/functions/variantes-wa/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   VARIANTES-WA : vingt façons de dire le message d'un cas de la banque.

   Fichier fabriqué par \`node scripts/variantes-wa-serveur.mjs\` depuis
   \`scripts/serveur/variantes-wa.ts\` et le module pur du dépôt : on ne le
   corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le Trône (la banque de scénarios), avec la session du
   personnel. Claude écrit les variantes ; le Trône les range dans le cas.

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE,
   ANTHROPIC_API_KEY viennent de l'environnement (déjà posés).

   Déploiement : Supabase → Edge Functions → New function « variantes-wa »
   → coller CE FICHIER ENTIER → Deploy → « Verify JWT » DÉCOCHÉ (la porte
   est jugée ici : la session de la personne connectée, \`is_staff\`).
   Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
`;

/** Le fichier tel qu'il doit être, regroupé depuis le dépôt. */
export async function fichierAttendu(r = racine) {
  const res = await build({
    entryPoints: [path.join(r, SOURCE)],
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
    external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent',
    mainFields: ['module', 'main'],
  });
  const code = res.outputFiles[0].text.replace(/\r\n/g, '\n');
  return `${ENTETE}${code}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const voulu = await fichierAttendu();
  const cible = path.join(racine, CIBLE);
  let present = '';
  try { present = readFileSync(cible, 'utf8').replace(/\r\n/g, '\n'); } catch { /* pas encore fabriqué */ }
  if (process.argv.includes('--verifie')) {
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/variantes-wa-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
