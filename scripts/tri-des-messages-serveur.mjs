/* LE FICHIER À COLLER DE LA FONCTION « tri-des-messages » — 29 octobre 2026,
   sur le modèle de reception-wa-serveur.mjs.
     node scripts/tri-des-messages-serveur.mjs            réécrit le fichier
     node scripts/tri-des-messages-serveur.mjs --verifie  dit seulement s'il est à jour
   `verifie-le-tri-des-messages` appelle `fichierAttendu` et crie si le
   fichier collé a pris du retard sur le dépôt. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/tri-des-messages.ts';
export const CIBLE = 'supabase/functions/tri-des-messages/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   TRI-DES-MESSAGES : le tri des démarcheurs sur WhatsApp (29 octobre 2026).
   Fichier fabriqué par \`node scripts/tri-des-messages-serveur.mjs\` depuis
   \`scripts/serveur/tri-des-messages.ts\` et les règles pures du dépôt
   (shared/tri-des-messages-pur) : on ne le corrige jamais ici, on corrige le
   dépôt et on refait le fichier.
   Appelée par whatsapp-automate au premier message d'un numéro inconnu, et
   par le Trône pour bloquer, débloquer et relire les dernières 24 heures.
   AUCUN SECRET ICI : CLE_SERVICE, SUPABASE_URL, SUPABASE_ANON_KEY,
   ANTHROPIC_API_KEY, WA_TOKEN, WA_PHONE_ID viennent de l'environnement
   (déjà posés pour les autres fonctions).
   Déploiement : Supabase → Edge Functions → Deploy a new function
   « tri-des-messages » → coller CE FICHIER ENTIER → Deploy → « Verify JWT »
   DÉCOCHÉ (les deux portes sont jugées ici). Vérifier : son adresse répond
   sa version, claude « oui » et meta « oui ».
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/tri-des-messages-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes`);
}
