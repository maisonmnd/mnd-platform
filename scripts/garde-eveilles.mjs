/* LA VISITE QUI GARDE ÉVEILLÉS LES PROJETS GRATUITS — 24 novembre 2026.

   « Oui, mets la visite automatique » (Yéman), après que Supabase a mis en
   pause voxbubble et chemin-de-cana, deux projets gratuits sans activité
   depuis sept jours. Tous les trois jours, le workflow
   `.github/workflows/garde-eveilles.yml` lance ce script : pour chaque
   projet, deux vraies lectures avec sa clé publique (voir `visite`). Rien
   n'est écrit, rien n'est affiché des données : seulement l'état.

   Les adresses et les clés viennent des secrets du dépôt, jamais du code
   (le dépôt est public) : VOXBUBBLE_URL, VOXBUBBLE_ANON_KEY, CHEMIN_URL,
   CHEMIN_ANON_KEY. Une clé publique seule suffit (`apikey`, l'ancienne
   « anon » ou la nouvelle « publishable »).

   Sortie en échec si un projet ne répond pas : GitHub le dit par e-mail. */

const PROJETS = [
  { nom: 'voxbubble', url: process.env.VOXBUBBLE_URL, cle: process.env.VOXBUBBLE_ANON_KEY },
  { nom: 'chemin-de-cana', url: process.env.CHEMIN_URL, cle: process.env.CHEMIN_ANON_KEY },
];

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* CE QUE LA VISITE LIT. Une clé publique n'a plus droit à la liste des tables
   (401, constaté le 24 novembre 2026). On lit donc ce qui lui est ouvert :
   les réglages de la connexion (`/auth/v1/settings`, 200 attendu) et la liste
   des compartiments du stockage (`/storage/v1/bucket`), qui interroge la base
   elle-même ; sa réponse peut être vide ou refusée par la RLS, la base a
   quand même travaillé. Un 5xx, ou un 540 (projet en pause), est une panne. */
async function visite({ nom, url, cle }) {
  if (!url || !cle) return `${nom} : secret absent (adresse ${url ? 'posée' : 'absente'}, clé ${cle ? 'posée' : 'absente'})`;
  const base = url.replace(/\/+$/, '');
  const entetes = { apikey: cle, Authorization: cle.startsWith('ey') ? `Bearer ${cle}` : '', Accept: 'application/json' };
  if (!entetes.Authorization) delete entetes.Authorization;
  let derniere = '';
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const auth = await fetch(`${base}/auth/v1/settings`, { headers: entetes });
      const stock = await fetch(`${base}/storage/v1/bucket`, { headers: entetes });
      if (auth.status === 200 && stock.status < 500) return null;
      derniere = `connexion ${auth.status}, stockage ${stock.status}`;
    } catch (e) {
      derniere = `injoignable (${e instanceof Error ? e.message : String(e)})`;
    }
    await attendre(10_000 * essai);
  }
  return `${nom} : ${derniere}`;
}

const pannes = [];
for (const p of PROJETS) {
  const panne = await visite(p);
  console.log(panne ?? `${p.nom} : éveillé`);
  if (panne) pannes.push(panne);
}
if (pannes.length) {
  console.error(`\n${pannes.length} projet(s) sans réponse : ${pannes.join(' ; ')}`);
  process.exit(1);
}
console.log('\nLes deux projets ont reçu leur visite.');
