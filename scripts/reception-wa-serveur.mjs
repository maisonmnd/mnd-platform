/* LE FICHIER À COLLER DE LA FONCTION « reception-wa » — 27 octobre 2026,
   sur le modèle de assistant-maison-serveur.mjs.

     node scripts/reception-wa-serveur.mjs            réécrit le fichier
     node scripts/reception-wa-serveur.mjs --verifie  dit seulement s'il est à jour

   `verifie-la-reception-wa` appelle `fichierAttendu` et crie si le fichier
   collé a pris du retard sur le dépôt. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/reception-wa.ts';
export const CIBLE = 'supabase/functions/reception-wa/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   RECEPTION-WA : l'assistant de la Maison qui répond sur WhatsApp.

   Fichier fabriqué par \`node scripts/reception-wa-serveur.mjs\` depuis
   \`scripts/serveur/reception-wa.ts\` et les modules purs du dépôt (la voix
   et les règles de « Proposer une réponse », la grille tarifaire du site) :
   on ne le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par whatsapp-automate seul, quand son juge se tait : Claude écrit
   la réponse de la Maison et dit la suite ; l'automate l'envoie.

   AUCUN SECRET ICI : CLE_SERVICE, SUPABASE_URL, ANTHROPIC_API_KEY viennent
   de l'environnement (déjà posés pour les autres fonctions).

   Déploiement : Supabase → Edge Functions → New function « reception-wa »
   → coller CE FICHIER ENTIER → Deploy → « Verify JWT » DÉCOCHÉ (la porte
   est CLE_SERVICE, jugée ici). Vérifier : son adresse répond sa version.
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/reception-wa-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
