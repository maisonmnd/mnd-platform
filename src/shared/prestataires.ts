import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { SignatureTracee } from './contrats';

/* ══ LE RÉPERTOIRE DES PRESTATAIRES EXTÉRIEURS ═══════════════════════
   Il vivait dans l'écran `equipe/Prestataires.tsx`. Il en sort le
   15 septembre 2026 parce que les Conversations WhatsApp doivent reconnaître
   un numéro de prestataire sans charger l'écran des prestataires : un module
   partagé se lit de partout, un écran ne s'importe pas dans un autre. */

export type ProviderMode = 'prestation' | 'forfait' | 'pourcentage' | 'horaire';

export type Provider = {
  id: string;
  branchId: string;
  name: string;
  specialty?: string;
  phone?: string;
  mode: ProviderMode;
  rateXof?: number;
  note?: string;
  archived?: boolean;
  /** SON CONTRAT DE PRESTATION, signé — 6 septembre 2026.
      Sans lui, la Maison n'a aucun recours si un prestataire part avec ses
      têtes ou ses protocoles : les trois protections ne vivent que dans un
      papier signé. Voir `shared/contrat-prestataire`. */
  contrat?: SignatureTracee;
};

/* EXPORTÉ POUR LES TEXTES DE LA MAISON : l'écran des contrats compte combien
   de prestataires ont signé la version en vigueur. Il compte, il n'écrit pas. */
export const providersStore = createStore<Provider[]>('mnd_prestataires', []);
bindDocument(providersStore, 'mnd_prestataires');
export const useProviders = () => useStore(providersStore);
