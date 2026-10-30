import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { BANQUE_VIDE, type BanqueBrute } from './banque-scenarios-pur';

/* ══ LA BANQUE DE SCÉNARIOS · 30 octobre 2026 ═══════════════════════════
   Le document `mnd_scenarios_wa` : les vrais messages des clientes, et ce
   que la Maison attend de l'automate pour chacun (banque-scenarios-pur). Le
   Trône seul l'écrit ; le banc (`scripts/banc-des-scenarios`) le lit dans
   une sauvegarde de la Maison, jamais dans le dépôt. */
export const banqueStore = createStore<BanqueBrute>('mnd_scenarios_wa', BANQUE_VIDE);
export const useBanque = () => useStore(banqueStore);
bindDocument(banqueStore, 'mnd_scenarios_wa');
