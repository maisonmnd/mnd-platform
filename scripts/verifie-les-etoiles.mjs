import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* VOS ETOILES, EPROUVEES · 22 novembre 2026.
   « Parfois les clients sont presses et n ont pas le temps de laisser un
   commentaire. Construis la recuperation d avis Google intelligente », puis
   « easy, rapide et sans prise de tete. Laissez-nous vos etoiles, beaute.
   Strategique, ca vient au bon moment ! » (Yeman). La regle vit dans
   src/shared/etoiles-pur.ts ; la fonction avis-google en porte le bloc
   ⟨etoiles⟩. Le harnais confronte les heures, le rappel, le bouton, le
   toucher, la page et les registres.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/etoiles-pur.ts';
const REGLE = 'src/shared/avis-fiches-pur.ts';
const FN = 'supabase/functions/avis-google/index.ts';
const PAGE = 'src/apps/regler/Etoiles.tsx';
const CLIENT = 'src/shared/etoiles-serveur.ts';
const PAYER = 'public/payer.html';
const PORTE = 'src/shared/porte-des-modeles-pur.ts';
const PANNES = [
  /* La regle */
  ['la demande part dans l heure, comme avant', PUR, "  const depart = r.moment === 'soir' && apresLaSalle <= ceSoir ? ceSoir : apresLaSalle;", '  const depart = apresLaSalle;'],
  ['la nuit, elle part a 8 h', PUR, '  return calmeDesEtoiles(depart, salle) ? prochaineHeureDeCotonou(HEURE_DU_LENDEMAIN_DES_ETOILES, depart) : depart;', '  return calmeDesEtoiles(depart, salle) ? prochaineHeureDeCotonou(8, depart) : depart;'],
  ['le rappel douze heures apres', PUR, 'const RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS = 20 * 3_600_000 + 10 * 60_000;', 'const RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS = 12 * 3_600_000;'],
  ['le rappel le soir meme', PUR, '  return Math.max(ceJourALHeureDeCotonou(r.heure, envoyeMs + 86_400_000), envoyeMs + RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS);', '  return Math.max(ceJourALHeureDeCotonou(r.heure, envoyeMs), envoyeMs + 3_600_000);'],
  ['un rappel meme si elle a touche', PUR, "  if (!o.reglages.rappel || o.rappelDepose || o.statut !== 'envoyé' || o.toucheLe) return null;", "  if (!o.reglages.rappel || o.rappelDepose || o.statut !== 'envoyé') return null;"],
  ['deux rappels', PUR, "  if (!o.reglages.rappel || o.rappelDepose || o.statut !== 'envoyé' || o.toucheLe) return null;", "  if (!o.reglages.rappel || o.statut !== 'envoyé' || o.toucheLe) return null;"],
  ['un rappel pour l ancien modele', PUR, "  if (!FORME_DU_JETON_DES_ETOILES.test(String(o.jeton ?? ''))) return null;\n  const envoye", '  const envoye'],
  ['le lien ecrit dans le texte', PUR, 'laissez-nous vos étoiles, beauté. Un toucher suffit, rien à écrire.`;\nconst texteDuRappel', 'laissez-nous votre avis : https://exemple.test`;\nconst texteDuRappel'],
  ['le bilan compte l ancien modele', PUR, " || !e.jeton || String(e.quand ?? '') < depuisIso) continue;", " || String(e.quand ?? '') < depuisIso) continue;"],
  ['jamais touchee : redemandee tout de suite', REGLE, 'export const JOURS_SI_JAMAIS_TOUCHEE = 30;', 'export const JOURS_SI_JAMAIS_TOUCHEE = 0;'],
  ['jamais touchee malgre un avis laisse depuis', REGLE, '  if (o.jamaisTouchee && o.derniereDemande === dernier && ', '  if (o.jamaisTouchee && '],
  /* La fonction */
  ['le toucher apres la porte du cron', FN, "  if (demande && typeof demande === 'object' && demande.action === 'etoiles') return await leToucherDesEtoiles(req, demande.jeton);\n", ''],
  ['le toucher sans frein', FN, "  if (!errFrein && (count ?? 0) >= 30) return rend({ erreur: 'trop' }, 429);\n", ''],
  ['un jeton quelconque accepte', FN, "  if (!FORME_DU_JETON_DES_ETOILES.test(jeton)) return rend({ erreur: 'lien' }, 400);\n", ''],
  ['un jeton inconnu rend le lien', FN, "  if (!lignes || lignes.length === 0) return rend({ erreur: 'lien' }, 404);\n", ''],
  ['le toucher ne se note pas', FN, '      : { ...d, toucheLe: le };', '      : { ...d };'],
  ['la demande part sans son jeton', FN, "    const plusDesEtoiles: Record<string, unknown> = WA_TEMPLATE_ETOILES ? { jeton } : {};", '    const plusDesEtoiles: Record<string, unknown> = {};'],
  ['la demande part sans attendre son heure', FN, "      consigne(p, 'en-attente', undefined, { ...depot(Date.now(), regles, colisDeLAvis, prenom, partDesEtoiles), ...plusDesEtoiles });", "      consigne(p, 'en-attente', undefined, { ...depot(Date.now(), regles, colisDeLAvis, prenom), ...plusDesEtoiles });"],
  ['le rappel sans son modele approuve', FN, '  if (WA_TEMPLATE_RAPPEL && etoiles.rappel && salleOuverte) {', '  if (etoiles.rappel && salleOuverte) {'],
  ['la fonction ne suit plus la regle', FN, 'const HEURE_DU_LENDEMAIN_DES_ETOILES = 12.5;', 'const HEURE_DU_LENDEMAIN_DES_ETOILES = 8;'],
  /* La page et les registres */
  ['la page ouvre n importe quelle adresse', CLIENT, "typeof j.lien === 'string' && j.lien.startsWith('https://') ? j.lien : '';", "typeof j.lien === 'string' ? j.lien : '';"],
  ['la page sans bouton de secours', PAGE, '<a className="rg-regler" href={etat.lien}', '<a className="rg-regler" data-sans-lien'],
  ['le bouton des etoiles pris pour un Tap & Go', PAYER, "  if (p.has('tg') && !rj && !ej) {", "  if (p.has('tg') && !rj) {"],
  ['la porte ignore le modele neuf', PORTE, "modeles: ['avis_google', 'vos_etoiles', 'vos_etoiles_rappel']", "modeles: ['avis_google']"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  let absentes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const brut = gardes.get(f).toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`ABSENTE  ${nom} (le texte a remettre n est plus dans ${f})`); absentes++; continue; }
      const neuf = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
      const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
      writeFileSync(path.join(racine, f), gardes.get(f));
      if (r.status === 0) { console.log(`MUETTE   ${nom}`); muettes++; } else console.log(`CRIEE    ${nom}`);
    }
  } finally {
    for (const [f, b] of gardes) writeFileSync(path.join(racine, f), b);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(`\n${PANNES.length - muettes - absentes}/${PANNES.length} fautes criees${intacts ? ', fichiers rendus intacts' : ', FICHIERS ALTERES'}.`);
  process.exit(muettes || absentes || !intacts ? 1 : 0);
}

const dossier = path.join(racine, 'node_modules/.cache', `verifie-les-etoiles-${process.pid}`);
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });
try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-etoiles.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
