import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

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
  certificat: resolve(__dirname, 'certificat.html'),
  bilan: resolve(__dirname, 'bilan.html'),
  carte: resolve(__dirname, 'carte.html'),
  bulletin: resolve(__dirname, 'bulletin.html'),
};
const apps = (process.env.VITE_APPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const input = apps.length
  ? Object.fromEntries(Object.entries(ALL_INPUTS).filter(([k]) => apps.includes(k)))
  : ALL_INPUTS;

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: {
    rollupOptions: { input },
  },
});
