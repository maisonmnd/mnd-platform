/* LE FICHIER À COLLER DE LA FONCTION « assistant-maison » — 27 octobre 2026.

   Une fonction Edge se colle seule et n'importe rien de `src/`. Plutôt que
   de recopier à la main le cerveau, la lecture et une douzaine d'aides
   (le Trône et le serveur finiraient par dire deux plans différents), ce
   script les REGROUPE avec esbuild depuis `scripts/serveur/assistant-maison.ts`
   dans `supabase/functions/assistant-maison/index.ts`.

     node scripts/assistant-maison-serveur.mjs            réécrit le fichier
     node scripts/assistant-maison-serveur.mjs --verifie  dit seulement s'il est à jour

   `verifie-gerard` appelle `fichierAttendu` et crie si le fichier collé a
   pris du retard sur le dépôt. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/assistant-maison.ts';
export const CIBLE = 'supabase/functions/assistant-maison/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   ASSISTANT-MAISON : le passage du matin de l'Assistant Maison.

   Fichier fabriqué par \`node scripts/assistant-maison-serveur.mjs\` depuis
   \`scripts/serveur/assistant-maison.ts\` et les modules purs du dépôt (le
   cerveau, la lecture des fiches, la Cadence) : le plan qu'elle dépose est
   celui que le Trône montre. On ne le corrige jamais ici : on corrige le
   dépôt et on refait le fichier.

   Chaque réveil : elle dit qu'elle vit, fabrique les remises à son nom des
   messages PARTIS, et le premier réveil après 8 h (heure du salon), si
   l'Assistant est Actif, dépose le plan du jour dans la salle d'attente.
   Le facteur \`envois-partent\` porte les messages, jamais la nuit.

   AUCUN SECRET ICI : la clé service vient de l'environnement.

   Déploiement : Supabase → Edge Functions → New function
   « assistant-maison » → coller CE FICHIER ENTIER → Deploy. Puis le cron
   (Integrations → Cron), toutes les quinze minutes : \`0,15,30,45 * * * *\`,
   avec l'en-tête Authorization: Bearer <clé service>, comme le facteur.
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
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/assistant-maison-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
