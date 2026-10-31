/* LE FICHIER DE LA FONCTION « assistants-maison » - 31 octobre 2026,
   sur le modele de dictee-au-propre-serveur.mjs.

     node scripts/assistants-maison-serveur.mjs            reecrit le fichier
     node scripts/assistants-maison-serveur.mjs --verifie  dit seulement s il est a jour

   `verifie-les-assistants` appelle `fichierAttendu` et crie si le fichier
   deploye a pris du retard sur le depot. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/assistants-maison.ts';
export const CIBLE = 'supabase/functions/assistants-maison/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   ASSISTANTS-MAISON : la porte des assistants reliés (Opale, Onyx) vers
   le Trône : le passage, les relais, les décisions, les rendez-vous.

   Fichier fabriqué par \`node scripts/assistants-maison-serveur.mjs\` depuis
   \`scripts/serveur/assistants-maison.ts\` et les modules purs du dépôt
   (assistants-pur, civilite, salle-des-envois) : on ne le corrige jamais
   ici, on corrige le dépôt et on refait le fichier.

   Appelée par la ligne de commande des assistants avec leur jeton d'appareil
   (en-tête x-jeton-assistant, empreinte dans la table \`assistants\`), et par
   l'écran « Les assistants » du Trône avec la session d'un souverain.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement (déjà posés) ; WA_TOKEN, WA_PHONE_ID et
   WA_TEMPLATE_CONF ne servent qu'à savoir si la pièce WhatsApp se dépose.

   Déploiement : \`node scripts/mise-en-ligne.mjs fonction assistants-maison
   --commit <sha> --jwt non\` (la porte est jugée ici : l'empreinte du jeton,
   ou le JWT d'un souverain). Vérifier : son adresse répond sa version.
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/assistants-maison-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
