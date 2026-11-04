import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { CLE_D_OPALE, REGLAGE_D_OPALE_LIVRE, type ReglageDOpale } from './opale-pur';

/* ── QUI RÉPOND SUR WHATSAPP, AU TRÔNE — 4 novembre 2026 ───────────────────
   « Que ce soit Opale qui gère les conversations du Trône et qu'on remplace
   l'automate » (Yéman). Le réglage (`mnd_opale` : opale ou automate), dans
   Système › Paramètres › WhatsApp, et le compte du mois que la fonction
   `whatsapp-automate` tient pour Opale (`mnd_opale_compte` : appels, jetons,
   dollars). Le personnel les lit ; la direction seule change le réglage. */

/* La clé écrite en toutes lettres (verifie-cles-uniques) : c'est CLE_D_OPALE. */
export const opaleStore = createStore<ReglageDOpale>('mnd_opale', REGLAGE_D_OPALE_LIVRE);
export const useOpale = () => useStore(opaleStore);
bindDocument(opaleStore, CLE_D_OPALE);

export type CompteDOpale = { appels?: number; entree?: number; sortie?: number; cacheLu?: number; usd?: number };
export const compteDOpaleStore = createStore<Record<string, CompteDOpale>>('mnd_opale_compte', {});
export const useCompteDOpale = () => useStore(compteDOpaleStore);
bindDocument(compteDOpaleStore, 'mnd_opale_compte');
