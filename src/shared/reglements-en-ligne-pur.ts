/* CE QUE LE TRÔNE FAIT D'UN RÈGLEMENT EN LIGNE — 25 octobre 2026.
   La fonction `regler-la-seance` pose l'argent sur la pièce et y laisse sa
   trace (`reglementsEnLigne`). Le Trône, sur n'importe quel poste ouvert,
   en tire trois choses, chacune une seule fois :
     · LE POURBOIRE DE L'ÉQUIPE, partagé selon les parts (la règle de
       `repartirPourboire`), en lignes aux identifiants tirés du règlement :
       deux postes écrivent les mêmes lignes, personne ne les double ;
     · LE REÇU, seulement pour l'argent du jour : c'est elle qui vient de
       payer, ce n'est pas un rattrapage de la Maison ;
     · L'ANNONCE au comptoir, avec un son, pour un règlement de moins de
       quinze minutes.
   Ce fichier est PUR (banc verifie-regler-la-seance). */
import type { ReglementEnLigne } from './regler-la-seance-pur';

export type PieceAvecReglements = { id: string; branchId?: string; reglementsEnLigne?: ReglementEnLigne[] };

/** Le jour local d'un instant ISO (celui du comptoir). */
export function jourDuReglement(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ATraiter = { pieceId: string; r: ReglementEnLigne; parts: boolean; recu: boolean };

/** Ce qui reste à faire, règlement par règlement. */
export function reglementsATraiter(pieces: readonly PieceAvecReglements[], aujourdhui: string): ATraiter[] {
  const out: ATraiter[] = [];
  for (const p of pieces) {
    for (const r of p.reglementsEnLigne ?? []) {
      const parts = (r.pourboireXof ?? 0) > 0 && !r.partsLe;
      const recu = !r.recuLe && jourDuReglement(r.payeLe) === aujourdhui;
      if (parts || recu) out.push({ pieceId: p.id, r, parts, recu });
    }
  }
  return out;
}

/** L'identifiant d'une part : le règlement et la personne, rien au hasard. */
export const idDeLaPart = (reglementId: string, staffId: string): string => `tp-${reglementId}-${staffId}`;

/** Les lignes du pourboire, à partir du partage déjà calculé. */
export function partsDuReglement(
  r: ReglementEnLigne,
  partage: readonly { staffId: string; amountXof: number }[],
  pieceId: string,
  note?: string,
): { id: string; staffId: string; amountXof: number; date: string; note?: string; invoiceId: string }[] {
  return partage.filter((p) => p.amountXof > 0).map((p) => ({
    id: idDeLaPart(r.id, p.staffId), staffId: p.staffId, amountXof: p.amountXof,
    date: jourDuReglement(r.payeLe), invoiceId: pieceId, ...(note ? { note } : {}),
  }));
}

/** La pièce, ce règlement marqué (`partsLe` ou `recuLe`). */
export function marqueLeReglement<P extends PieceAvecReglements>(p: P, reglementId: string, champ: 'partsLe' | 'recuLe', quand: string): P {
  if (!(p.reglementsEnLigne ?? []).some((r) => r.id === reglementId && !r[champ])) return p;
  return { ...p, reglementsEnLigne: (p.reglementsEnLigne ?? []).map((r) => (r.id === reglementId && !r[champ] ? { ...r, [champ]: quand } : r)) };
}

/** Une annonce au comptoir : un règlement récent, pas encore annoncé sur ce poste. */
export const aAnnoncer = (r: ReglementEnLigne, maintenantMs: number, dejaVus: ReadonlySet<string>): boolean => {
  const t = Date.parse(r.payeLe);
  return !dejaVus.has(r.id) && Number.isFinite(t) && maintenantMs - t >= 0 && maintenantMs - t <= 15 * 60_000;
};
