/* LE FICHIER DE LA FONCTION « visio-salle » - 13 novembre 2026 (la
   Consultation, lot 3), sur le modele exact de conseil-du-matin-serveur.mjs.

     node scripts/visio-salle-serveur.mjs            reecrit le fichier
     node scripts/visio-salle-serveur.mjs --verifie  dit seulement s il est a jour

   `verifie-la-visio` appelle `fichierAttendu` et crie si le fichier deploye a
   pris du retard sur le depot. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/visio-salle.ts';
export const CIBLE = 'supabase/functions/visio-salle/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   VISIO-SALLE : la visio gratuite de quinze minutes (la Consultation,
   lot 3). Les créneaux, la réservation, l'entrée par le lien de la
   cliente ou par la session de l'équipe, et la salle qui se ferme
   d'elle-même à la fin du créneau (Daily, \`exp\` + \`eject_at_room_exp\`).

   Fichier fabriqué par \`node scripts/visio-salle-serveur.mjs\` depuis
   \`scripts/serveur/visio-salle.ts\` et \`src/shared/visio-pur.ts\` : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   et DAILY_API_KEY viennent de l'environnement. Sans DAILY_API_KEY, la
   visio reste fermée et le site ne la propose pas.

   Déploiement : \`node scripts/mise-en-ligne.mjs fonction visio-salle
   --commit <sha> --jwt non\` (la porte est jugée ici : le jeton du lien, ou
   la session d'un membre de l'équipe). Vérifier : son adresse répond sa version.
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/visio-salle-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
