import { invoicesStore } from './finance';
import { marqueLaPiecePartie, type PiecePartie } from './une-piece-un-message-pur';

/* ══ LA MARQUE AU MAGASIN — 1er novembre 2026 ════════════════════════════
   Le contrat vit dans une-piece-un-message-pur.ts ; ici, seulement l'écriture
   dans le magasin des pièces, synchronisée par sync.ts comme toute écriture
   de pièce : les autres postes la relisent, et refusent à leur tour.

   JAMAIS SUR UN ENVOI GARDÉ HORS LIGNE (`enAttente`) : rien n'est parti. Il
   partira seul par `appels-en-attente`, et la clé du serveur tiendra la
   porte ; la marque locale manquera jusqu'à ce qu'un envoi réponde
   `deja`. Accepté, dit ici. */

/** Une seule pièce (la facture, le reçu). */
export function noteLaPiecePartie(pieceId: string, info: PiecePartie): void {
  noteLesPiecesParties([pieceId], info);
}

/** Plusieurs pièces d'un même papier (la facture du foyer, le point du compte). */
export function noteLesPiecesParties(pieceIds: readonly string[], info: PiecePartie): void {
  const ids = new Set(pieceIds);
  if (!ids.size) return;
  invoicesStore.set((prev) => {
    let change = false;
    const suite = prev.map((p) => {
      if (!ids.has(p.id)) return p;
      const q = marqueLaPiecePartie(p, info);
      if (q !== p) change = true;
      return q;
    });
    return change ? suite : prev;
  });
}
