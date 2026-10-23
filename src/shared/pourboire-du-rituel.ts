/* ══ UN POURBOIRE PAR RITUEL — 23 octobre 2026 ═════════════════════════════
   « Refuse de donner les pourboires plusieurs fois sur un même rituel. Naffi
   Morou avait déjà passé un paiement et un pourboire. Brice est allé sur son
   poste et a fait passer encore un pourboire, résultat double encaissement
   pour les pourboires » (Yéman).

   Chaque « Encaisser le rituel » ajoutait son pourboire à ce qui était déjà
   là ; sur un rituel soldé, le geste écrivait même une pièce à 0 F à part,
   reliée à rien. Un second poste ne voyait donc aucune raison de refuser.

   LA RÈGLE : un rituel ne reçoit qu'UN pourboire. Celui-ci se lit sur les
   pièces du rituel (sa pièce, celles de ses versements, et la pièce de
   pourboire seul qui porte désormais `pourboireDe`). Pour corriger un
   montant, on passe par la pièce dans Factures, jamais par un second geste.

   Pur : aucune lecture de magasin, le banc verifie-un-pourboire-par-rituel
   le rejoue. */

export type RdvDuPourboire = { id: string; invoiceId?: string; payments?: { invoiceId?: string }[] };
export type PieceDuPourboire = {
  id: string;
  kind?: string;
  apptId?: string;
  /** La pièce de pourboire seul d'un rituel déjà soldé (23 octobre 2026). */
  pourboireDe?: string;
  tipXof?: number;
  date?: string;
  number?: string;
};

/** Les pièces de ce rituel qui portent un pourboire. */
export function piecesAvecPourboire(rdv: RdvDuPourboire, pieces: readonly PieceDuPourboire[]): PieceDuPourboire[] {
  const versees = new Set((rdv.payments ?? []).map((p) => p.invoiceId).filter((x): x is string => !!x));
  return pieces.filter((i) =>
    i.kind === 'facture'
    && (i.tipXof ?? 0) > 0
    && (i.apptId === rdv.id || i.id === rdv.invoiceId || versees.has(i.id) || i.pourboireDe === rdv.id));
}

/** Le pourboire déjà reçu sur ce rituel, ou `null` s'il n'en a pas encore. */
export function pourboireDejaRecu(
  rdv: RdvDuPourboire,
  pieces: readonly PieceDuPourboire[],
): { montantXof: number; date?: string; numero?: string } | null {
  const avec = piecesAvecPourboire(rdv, pieces);
  if (avec.length === 0) return null;
  const premiere = [...avec].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  return {
    montantXof: avec.reduce((n, i) => n + Math.round(i.tipXof ?? 0), 0),
    ...(premiere.date ? { date: premiere.date } : {}),
    ...(premiere.number ? { numero: premiere.number } : {}),
  };
}
