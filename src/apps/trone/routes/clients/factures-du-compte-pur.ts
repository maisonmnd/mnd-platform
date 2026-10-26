/* LES FACTURES D'UN COMPTE FAMILLE, SUR LA FICHE — 26 octobre 2026.

   « J'ai besoin que tu mettes de l'ordre sur les documents des comptes
   enfant. Quand ces documents sont payés par les parents, je vois sur la
   fiche [de l'enfant] tous les rendez-vous qui sont passés sur le compte.
   J'ai besoin de les voir sur le compte parent, pas sur le compte enfant. Le
   compte enfant doit avoir juste la facture qui le concerne » (Yéman, sur la
   fiche de K. H., qui montrait les quatre factures de sa mère).

   La rubrique « Factures du compte » montrait, sur la fiche de CHAQUE membre,
   toutes les pièces des autres membres. La règle devient :
     · chez le PAYEUR du compte : toutes les pièces des autres membres, comme
       avant (c'est elle qui règle, et qui vient les réclamer) ;
     · chez un autre membre : seulement les pièces qui LA concernent, posées au
       nom d'un autre membre (le payeur, le plus souvent). Une pièce la
       concerne quand elle la nomme soignée (`forClientId`), ou quand elle est
       la pièce d'un de ses rituels (`apptId`).
   Sa propre liste (« Factures & devis », les pièces à son nom) ne change pas. */

export type PieceDuCompte = { id: string; clientId: string; date: string; forClientId?: string; apptId?: string };

/** Pour qui la pièce a été faite : la soignée nommée, sinon la tête de son
    rituel, sinon celle à qui elle est adressée. */
export function pourQui(piece: PieceDuCompte, clienteDuRdv: ReadonlyMap<string, string>): string {
  return piece.forClientId || (piece.apptId ? clienteDuRdv.get(piece.apptId) : undefined) || piece.clientId;
}

/** Les pièces du compte à montrer sur la fiche de `moi`, de la plus récente à
    la plus ancienne. */
export function facturesDuCompte<T extends PieceDuCompte>(
  pieces: readonly T[],
  o: { moi: string; autresMembres: readonly string[]; estLePayeur: boolean; clienteDuRdv: ReadonlyMap<string, string> },
): T[] {
  const autres = new Set(o.autresMembres);
  return pieces
    .filter((p) => autres.has(p.clientId) && (o.estLePayeur || pourQui(p, o.clienteDuRdv) === o.moi))
    .sort((a, b) => b.date.localeCompare(a.date));
}
