/* La sonde des fonctions en ligne : node scripts/sonde-les-fonctions.mjs
   Envoie un GET a chaque fonction Edge qui le supporte sans rien declencher
   (route GET explicite, ou refus de tout ce qui n'est pas POST), et releve
   la version qu'elle declare. Jamais un POST : un POST pourrait envoyer.
   Lit VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local ; n'affiche
   jamais la cle. Sortie ASCII. */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL_BASE = env.VITE_SUPABASE_URL;
const CLE = env.VITE_SUPABASE_ANON_KEY;
if (!URL_BASE || !CLE) { console.error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manque dans .env.local'); process.exit(2); }

/* Les fonctions sondables sans risque, avec la version attendue au depot. */
const SONDABLES = [
  'avis-google', 'avis-google-pont', 'boutique', 'centre-de-commande', 'demande-submit', 'diagnostic-locks', 'discussion',
  'fete-de-couronne', 'ia-maison', 'kkiapay-webhook', 'mnd-pay', 'mnd-pay-webhook', 'rappels-d-echeance', 'regler-la-seance',
  'relances-factures', 'whatsapp-automate', 'whatsapp-envoi', 'whatsapp-webhook',
];
/* Celles qu'on ne sonde pas : pas de garde sur la methode, un GET pourrait lancer le travail. */
const NON_SONDABLES = ['confirmation-rdv', 'envois-partent', 'rappels-j1', 'avis-google-releve', 'push-notify', 'kkiapay-verify', 'suggest-client', 'bilan-redige', 'sauvegarde-nuit', 'site-publier', 'cles-d-acces'];

const ascii = (s) => String(s).replace(/[^\x20-\x7E]/g, '?');
const versionAuDepot = (nom) => { try { const m = readFileSync(`supabase/functions/${nom}/index.ts`, 'utf8').match(/const VERSION = '([^']*)'/); return m ? m[1].split(' ')[0] : ''; } catch { return ''; } };

const lignes = [];
for (const nom of SONDABLES) {
  const t0 = Date.now();
  let statut = 0, corps = '';
  try {
    const r = await fetch(`${URL_BASE}/functions/v1/${nom}`, { method: 'GET', headers: { apikey: CLE, Authorization: `Bearer ${CLE}` }, signal: AbortSignal.timeout(20000) });
    statut = r.status; corps = await r.text();
  } catch (e) { corps = 'ERREUR ' + (e && e.name); }
  let version = '';
  try { const j = JSON.parse(corps); version = String(j.version ?? j.fonction ?? ''); } catch { /* pas du JSON */ }
  const depot = versionAuDepot(nom);
  const etat = statut === 404 ? 'ABSENTE' : version ? (depot && version.startsWith(depot) ? 'a jour' : 'EN RETARD') : 'sans version';
  lignes.push({ nom, statut, version: version.slice(0, 40), depot, etat, ms: Date.now() - t0, corps: corps.slice(0, 70) });
}
const pad = (s, n) => ascii(s).padEnd(n);
console.log(pad('fonction', 22) + pad('http', 6) + pad('en ligne', 42) + pad('au depot', 14) + 'etat');
for (const l of lignes) console.log(pad(l.nom, 22) + pad(l.statut, 6) + pad(l.version || l.corps, 42) + pad(l.depot, 14) + l.etat);
console.log('\nNon sondees (sans garde de methode) : ' + NON_SONDABLES.join(', '));
console.log('Sondees le ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
