/* ══ SES PIÈCES, ANNÉE PAR ANNÉE — 26 octobre 2026 ═══════════════════════
   « Je veux un détail précis sur son total de chaque année, bien distinct »
   (Yéman, sur l'onglet Documents d'une fiche). Chaque année a sa ligne :
   combien de factures, ce qu'elles font, ce qui en est réglé, ce qui en
   reste. Un devis se compte à part et n'entre dans aucun total : ce n'est
   pas de l'argent dû. L'année est celle de la pièce (le jour du rituel),
   comme partout sur la fiche. Règle pure (banc verifie-les-documents-par-annee). */

export type AnneeDePieces<T> = {
  annee: string;
  pieces: T[];
  factures: number;
  devis: number;
  totalXof: number;
  regleXof: number;
  resteXof: number;
};

/** Les pièces rangées par année, la plus récente d'abord ; dans une année,
    l'ordre reçu est gardé. */
export function piecesParAnnee<T extends { date: string; kind?: string }>(
  pieces: readonly T[],
  totalDe: (p: T) => number,
  regleDe: (p: T) => number,
): AnneeDePieces<T>[] {
  const parAnnee = new Map<string, AnneeDePieces<T>>();
  for (const p of pieces) {
    const annee = String(p.date ?? '').slice(0, 4) || '—';
    const a = parAnnee.get(annee) ?? { annee, pieces: [], factures: 0, devis: 0, totalXof: 0, regleXof: 0, resteXof: 0 };
    a.pieces.push(p);
    if (p.kind === 'devis') a.devis += 1;
    else {
      const total = Math.max(0, Math.round(totalDe(p)));
      const regle = Math.min(total, Math.max(0, Math.round(regleDe(p))));
      a.factures += 1;
      a.totalXof += total;
      a.regleXof += regle;
      a.resteXof += total - regle;
    }
    parAnnee.set(annee, a);
  }
  return [...parAnnee.values()].sort((x, y) => y.annee.localeCompare(x.annee));
}

/** Le total de toutes les années, pour la dernière ligne du tableau. */
export function toutesLesAnnees<T>(annees: readonly AnneeDePieces<T>[]): Omit<AnneeDePieces<T>, 'annee' | 'pieces'> {
  return annees.reduce((s, a) => ({
    factures: s.factures + a.factures, devis: s.devis + a.devis,
    totalXof: s.totalXof + a.totalXof, regleXof: s.regleXof + a.regleXof, resteXof: s.resteXof + a.resteXof,
  }), { factures: 0, devis: 0, totalXof: 0, regleXof: 0, resteXof: 0 });
}
