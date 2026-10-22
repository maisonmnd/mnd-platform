/* LA BOUTIQUE AU TRÔNE — 22 octobre 2026.
   Ce que le Trône lit et écrit autour de la Boutique, à côté du juge
   (`boutique-pur.ts`) :
   · le document PRIVÉ `mnd_boutique_prevenir` : les « Me prévenir » du site et
     de Ma Couronne, déposés par la fonction `boutique` (clé de service). Il
     n'est pas dans la liste des documents publics (0127) : seul le personnel
     le lit ;
   · la forme de `boutique` sur une pièce de commande, que la fonction écrit
     dans la pièce (Factures) sans que le type `Invoice` la connaisse. */
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Invoice } from './finance';

export type APrevenir = {
  id: string;
  produitId: string;
  numero: string;
  /** Les huit derniers chiffres du numéro (`cleDuNumero`). */
  cle: string;
  nom?: string;
  clientId?: string;
  /** ISO : quand elle a demandé. */
  le: string;
  /** ISO : quand la Maison l'a prévenue. Une seule écriture par personne. */
  prevenuLe?: string;
};
export type PrevenirDoc = { liste: APrevenir[] };

export const prevenirStore = createStore<PrevenirDoc>('mnd_boutique_prevenir', { liste: [] });
export const usePrevenir = () => useStore(prevenirStore);
bindDocument(prevenirStore, 'mnd_boutique_prevenir');

/** Où en est une commande : à préparer, prête (la cliente est prévenue),
    remise (le stock est sorti). */
export type EtatDeCommande = 'a-preparer' | 'prete' | 'remise';
export type InfoBoutique = {
  origine: 'site' | 'couronne';
  remise: 'retrait' | 'livraison';
  numero?: string;
  adresse?: string;
  paiement: 'kkiapay' | 'maison';
  totalXof: number;
  creeLe: string;
  etat?: EtatDeCommande;
  payeLe?: string;
  preteLe?: string;
  remiseLe?: string;
};
export type PieceDeBoutique = Invoice & { boutique: InfoBoutique };

export const estDeLaBoutique = (i: Invoice): i is PieceDeBoutique =>
  !!(i as { boutique?: unknown }).boutique && typeof (i as { boutique?: unknown }).boutique === 'object';
