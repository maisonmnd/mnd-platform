import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { CLE_DE_LA_RECEPTION, RECEPTION_LIVREE, type ReglageDeLaReception } from './automate-wa';

/* ── LA RÉCEPTION WHATSAPP, AU TRÔNE — 27 octobre 2026 ────────────────────
   Le réglage de l'assistant qui répond en phrases (`mnd_assistant_wa` :
   non, essai, tous), à côté de celui de l'automate dans Système ›
   Paramètres, et le compte du mois que la fonction `reception-wa` tient
   (`mnd_assistant_wa_compte` : appels, jetons, dollars, par mois). Le
   personnel les lit ; la direction seule change le réglage (garde d'écran,
   comme celui de l'automate). */

export const receptionStore = createStore<ReglageDeLaReception>(CLE_DE_LA_RECEPTION, RECEPTION_LIVREE);
export const useReception = () => useStore(receptionStore);
bindDocument(receptionStore, CLE_DE_LA_RECEPTION);

export type CompteDuMois = { appels?: number; entree?: number; sortie?: number; usd?: number };
export const compteDeLaReceptionStore = createStore<Record<string, CompteDuMois>>('mnd_assistant_wa_compte', {});
export const useCompteDeLaReception = () => useStore(compteDeLaReceptionStore);
bindDocument(compteDeLaReceptionStore, 'mnd_assistant_wa_compte');
