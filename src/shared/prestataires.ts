import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { SignatureTracee } from './contrats';
import type { ReglementDuPrestataire } from './missions-prestataires-pur';

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
  /** ══ SES PRESTATIONS AU CATALOGUE ET LE PRIX CONVENU — 1er novembre 2026 ══
      « Quand Hermine ou Ziadath travaille, c'est forcément une mission qu'elle
      a prise » (Yéman). La fiche dit QUELLES prestations du catalogue elle
      réalise (identifiants de services) : tout rituel honoré qui en porte une
      lui donne sa mission, d'elle-même. Tranché au sélecteur le 1er novembre
      2026 : la fiche, pas le rendez-vous. Voir `missions-prestataires-pur`. */
  prestations?: string[];
  /** Le prix convenu de chacune (identifiant → francs), comme la grille d'une
      prestataire de l'équipe. Une prestation cochée sans prix donne une mission
      sans montant, à écrire avant de la payer. Zéro est un prix écrit. */
  grille?: Record<string, number>;
  /** Comment elle est payée : « à payer » (le bouton Payer, de la caisse
      choisie ce jour-là) ou « payée le jour même » (la mission naît payée, la
      charge sort de la caisse de l'encaissement). Absent = à payer. */
  reglement?: ReglementDuPrestataire;
};

/* EXPORTÉ POUR LES TEXTES DE LA MAISON : l'écran des contrats compte combien
   de prestataires ont signé la version en vigueur. Il compte, il n'écrit pas. */
export const providersStore = createStore<Provider[]>('mnd_prestataires', []);
bindDocument(providersStore, 'mnd_prestataires');
export const useProviders = () => useStore(providersStore);
