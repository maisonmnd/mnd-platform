import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';

/* LA BASE EST UNE BASE, PAS UN CHEMIN WINDOWS, 23 septembre 2026. Sous Git
   Bash, MSYS convertit VITE_BASE=/revelateur/ en /Program Files/Git/revelateur/
   et le site sort sans feuille de style, ce qui ressemble à une erreur de
   rendu. Payé deux fois (16 juillet, 23 septembre). On refuse ici, avant de
   générer quoi que ce soit, en nommant le remède. */
const base = process.env.VITE_BASE || '/';
if (!/^\/(?:[\w.-]+\/)*$/.test(base)) {
  throw new Error(`VITE_BASE « ${base} » n'est pas une base de site (attendu « / » ou « /nom/ »). Sous Git Bash, MSYS convertit la valeur : préfixe MSYS_NO_PATHCONV=1, ou passe par node scripts/build-sites.mjs.`);
}

// Une seule origine pour les 5 surfaces sœurs : les ponts localStorage
// (mnd_branches, mnd_couronne_compose, mnd_consultations_queue) fonctionnent
// entre apps en dev comme en prod.
// `base` : racine par défaut ('/'), surchargée à la construction pour un
// sous-chemin (ex. GitHub Pages : VITE_BASE=/trone/).
// `VITE_APPS` : sous-ensemble d'entrées à construire (déploiement séparé),
// ex. VITE_APPS=trone,consultation,certificat — toutes par défaut.
const ALL_INPUTS: Record<string, string> = {
  portail: resolve(__dirname, 'index.html'),
  trone: resolve(__dirname, 'trone.html'),
  couronne: resolve(__dirname, 'couronne.html'),
  consultation: resolve(__dirname, 'consultation.html'),
  lokaa: resolve(__dirname, 'lokaa.html'),
  academie: resolve(__dirname, 'academie.html'),
  certificat: resolve(__dirname, 'certificat.html'),
  bilan: resolve(__dirname, 'bilan.html'),
  carte: resolve(__dirname, 'carte.html'),
  bulletin: resolve(__dirname, 'bulletin.html'),
};
const apps = (process.env.VITE_APPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const choisies = apps.length
  ? Object.fromEntries(Object.entries(ALL_INPUTS).filter(([k]) => apps.includes(k)))
  : ALL_INPUTS;

/* LE SITE RÉVÉLATEUR : SES PAGES SONT ÉCRITES AVANT QUE VITE NE LES LISE —
   17 septembre 2026. `scripts/genere-revelateur.mjs` transforme le contenu
   en données et le Journal en vraies pages HTML sous `revelateur/` (dossier
   généré, ignoré par git), une adresse par dossier. Elles deviennent autant
   d'entrées, en développement (localhost:5173/revelateur/) comme à la
   construction (VITE_APPS=revelateur, VITE_BASE=/revelateur/). */
function entreesDuRevelateur(): Record<string, string> {
  if (apps.length && !apps.includes('revelateur')) return {};
  try {
    /* LA BASE, LUE À LA CONSTRUCTION — 24 septembre 2026. Le générateur écrit
       les offres et les horaires dans les pages ; il les lit avec la MÊME clef
       publique que le navigateur (`.env.local`, jamais une clef de service),
       que Vite ne met pas dans process.env de lui-même. Sans clef, il écrit
       les pages sans elles et le dit : la construction ne casse pas. */
    const publiques = loadEnv(process.env.MODE ?? 'production', __dirname, 'VITE_');
    execSync('node scripts/genere-revelateur.mjs', { cwd: __dirname, stdio: 'inherit', env: { ...publiques, ...process.env } });
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  const marche = (dossier: string, rel: string) => {
    if (!existsSync(dossier)) return;
    for (const f of readdirSync(dossier)) {
      const chemin = resolve(dossier, f);
      if (statSync(chemin).isDirectory()) marche(chemin, rel ? `${rel}/${f}` : f);
      else if (f.endsWith('.html')) out[`revelateur${rel ? `/${rel}` : ''}/${f.replace(/\.html$/, '')}`] = chemin;
    }
  };
  marche(resolve(__dirname, 'revelateur'), '');
  return out;
}
const input = { ...choisies, ...entreesDuRevelateur() };

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: { input },
  },
});
