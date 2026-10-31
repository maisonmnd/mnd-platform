/* LE FICHIER DE LA FONCTION « dictee-au-propre » - 31 octobre 2026,
   sur le modele de variantes-wa-serveur.mjs.

     node scripts/dictee-au-propre-serveur.mjs            reecrit le fichier
     node scripts/dictee-au-propre-serveur.mjs --verifie  dit seulement s il est a jour

   `verifie-la-dictee` appelle `fichierAttendu` et crie si le fichier
   deploye a pris du retard sur le depot. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/dictee-au-propre.ts';
export const CIBLE = 'supabase/functions/dictee-au-propre/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   DICTEE-AU-PROPRE : Claude met au propre une dictée de la Maison.

   Fichier fabriqué par \`node scripts/dictee-au-propre-serveur.mjs\` depuis
   \`scripts/serveur/dictee-au-propre.ts\` et le module pur du dépôt : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le Trône (l'écran « Dictée MND », téléphone et ordinateur)
   avec la session du personnel, et par la Dictée du bureau avec son jeton
   (en-tête x-jeton-dictee, empreinte dans Paramètres › Dictée).

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE,
   ANTHROPIC_API_KEY viennent de l'environnement (déjà posés).

   Déploiement : \`node scripts/mise-en-ligne.mjs fonction dictee-au-propre
   --commit <sha> --jwt non\` (la porte est jugée ici : la session de la
   personne connectée, \`is_staff\`, ou l'empreinte du jeton du bureau).
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/dictee-au-propre-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
