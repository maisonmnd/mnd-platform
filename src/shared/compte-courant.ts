import type { MouvementHorsActivite } from './finance';

/* LE COMPTE COURANT D'ASSOCIÉ — 27 septembre 2026 au soir, maquette validée
   (`public/maquette-la-societe-et-les-depenses-perso.html`). « À partir de
   demain la Maison MND devient une société et je ne peux pas me permettre de
   continuer à payer des dépenses perso » (Yéman).

   CE QUE C'EST. Une dépense personnelle qui passe par la Maison n'est pas une
   charge : c'est une avance faite à l'associé, qui la doit (compte 462 en
   OHADA, « Associés, comptes courants »). Elle se rend de deux façons : en
   caisse (un remboursement reçu), ou par le bulletin (une retenue sur le
   salaire). Le relevé additionne ce qui est sorti pour lui et ce qui est
   revenu ; le solde est ce qu'il doit encore.

   OÙ VIVENT LES LIGNES, ET POURQUOI RIEN DE NEUF EN BASE. Le prélèvement et
   le remboursement sont des mouvements hors activité (table
   `entrees_hors_activite`), déjà hors du résultat, portant désormais un
   `staffId` ; la retenue prévue vit sur la fiche du membre (`staff`), et la
   retenue faite vit sur la ligne du bulletin (`payroll_runs`). Trois tables
   qui existent, aucune migration à passer la veille d'un changement de
   société : c'est délibéré.

   UNE RETENUE PRÉVUE N'EST PAS UN RETOUR. Elle ne compte au relevé que le
   jour où le run est réglé : un bulletin abandonné n'aurait rien rendu.

   TOUT CE QUI DÉCIDE VIT ICI, sans React, et `verifie-le-compte-courant`
   l'éprouve. L'écran ne fait que montrer. */

export const MOTIF_PRELEVEMENT = 'Prélèvement de l’associé';
export const MOTIF_REMBOURSEMENT = 'Remboursement reçu';

/** Une retenue posée depuis le relevé, pour un bulletin à venir. `runId` et
    `appliqueXof` n'existent qu'une fois le run réglé ; avant, elle est
    « prévue » et ne compte pas au solde. */
export type RetenueCompteCourant = {
  id: string;
  period: string;      // AAAA-MM, le bulletin visé
  amountXof: number;
  poseLe: string;      // ISO
  runId?: string;
  appliqueXof?: number;
  appliqueLe?: string; // AAAA-MM-JJ
};

export type LigneDuReleve = {
  id: string;
  date: string;        // AAAA-MM-JJ
  quoi: string;
  ou: string;          // la caisse, ou « Paie »
  prelevementXof: number;
  retourXof: number;
};

const dateDe = (iso: string): string => iso.slice(0, 10);

/** Le relevé d'un associé : ses prélèvements et ses remboursements en caisse
    (les mouvements qui portent son identifiant), et ses retenues APPLIQUÉES
    (le run est réglé). Du plus récent au plus ancien. */
export function lignesDuCompteCourant(
  mouvements: readonly MouvementHorsActivite[],
  branchId: string,
  staffId: string,
  retenues: readonly RetenueCompteCourant[],
): LigneDuReleve[] {
  const lignes: LigneDuReleve[] = [];
  for (const m of mouvements) {
    if (m.branchId !== branchId || m.staffId !== staffId) continue;
    if (m.sens === 'sortie' && m.motif === MOTIF_PRELEVEMENT) {
      lignes.push({ id: m.id, date: dateDe(m.date), quoi: m.label, ou: m.cashbox, prelevementXof: m.amountXof, retourXof: 0 });
    } else if ((m.sens ?? 'entree') === 'entree' && m.motif === MOTIF_REMBOURSEMENT) {
      lignes.push({ id: m.id, date: dateDe(m.date), quoi: m.label, ou: m.cashbox, prelevementXof: 0, retourXof: m.amountXof });
    }
  }
  for (const r of retenues) {
    if (!r.runId || !(r.appliqueXof && r.appliqueXof > 0)) continue;
    lignes.push({
      id: r.id, date: dateDe(r.appliqueLe ?? r.poseLe), quoi: `Retenue sur le bulletin de ${r.period}`,
      ou: 'Paie', prelevementXof: 0, retourXof: r.appliqueXof,
    });
  }
  return lignes.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Ce que l'associé doit encore : les prélèvements moins les retours réels.
    Négatif, c'est la Maison qui lui doit. */
export const soldeDuCompteCourant = (lignes: readonly LigneDuReleve[]): number =>
  lignes.reduce((s, l) => s + l.prelevementXof - l.retourXof, 0);

/** Les retenues prévues et pas encore appliquées, toutes périodes. */
export const retenuesEnAttenteXof = (retenues: readonly RetenueCompteCourant[]): number =>
  retenues.reduce((s, r) => (r.runId ? s : s + r.amountXof), 0);

/** Ce que le bulletin d'une période doit retenir : la somme des retenues
    prévues pour elle, pas encore appliquées. */
export const retenuePrevueDuCompteCourant = (retenues: readonly RetenueCompteCourant[], period: string): number =>
  retenues.reduce((s, r) => (!r.runId && r.period === period ? s + r.amountXof : s), 0);

/** Ce qu'on peut retenir ce mois-ci : jamais plus que prévu, jamais au-delà
    du plafond de la Maison une fois la retenue du prêt servie, jamais
    négatif. Sans plafond fixé, tout ce qui est prévu. */
export function retenueApplicable(prevueXof: number, plafondXof: number | null, retenuePretXof = 0): number {
  if (!(prevueXof > 0)) return 0;
  if (plafondXof == null) return Math.round(prevueXof);
  return Math.max(0, Math.min(Math.round(prevueXof), Math.floor(plafondXof - retenuePretXof)));
}

export function periodeSuivante(period: string): string {
  const [a, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(a, (m ?? 1) - 1 + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Le run est réglé : les retenues prévues de la période reçoivent ce qui a
    réellement été retenu, dans l'ordre où elles ont été posées. Ce que le
    plafond n'a pas laissé passer n'est pas perdu : il se reporte, comme une
    retenue prévue sur le mois suivant. DÉTERMINISTE : rejouer le règlement
    du même run ne double rien. */
export function appliqueLaRetenue(
  retenues: readonly RetenueCompteCourant[],
  period: string,
  runId: string,
  retenuXof: number,
  jour: string,
): RetenueCompteCourant[] {
  if (retenues.some((r) => r.runId === runId)) return [...retenues];
  /* La part de chacune se décide DANS L'ORDRE OÙ ELLES ONT ÉTÉ POSÉES, pas
     dans l'ordre du tableau : la plus ancienne est servie d'abord. */
  let reste = Math.max(0, Math.round(retenuXof));
  const part = new Map<string, number>();
  const prevues = retenues.filter((r) => !r.runId && r.period === period).sort((a, b) => a.poseLe.localeCompare(b.poseLe));
  for (const r of prevues) {
    const p = Math.min(r.amountXof, reste);
    reste -= p;
    part.set(r.id, p);
  }
  const sortie: RetenueCompteCourant[] = [];
  const reports: RetenueCompteCourant[] = [];
  for (const r of retenues) {
    const p = part.get(r.id);
    if (p == null) { sortie.push(r); continue; }
    sortie.push({ ...r, runId, appliqueXof: p, appliqueLe: jour });
    if (r.amountXof - p > 0) {
      reports.push({ id: `${r.id}-suite`, period: periodeSuivante(period), amountXof: r.amountXof - p, poseLe: jour });
    }
  }
  return [...sortie, ...reports];
}

/** Pourquoi une retenue ne peut pas être posée. Absent quand elle le peut. */
export function pourquoiRetenueImpossible(
  montantXof: number, soldeXof: number, enAttenteXof: number,
): string | undefined {
  if (!(montantXof > 0)) return 'Écrivez le montant à retenir.';
  const encore = soldeXof - enAttenteXof;
  if (montantXof > encore) {
    return encore > 0
      ? `On ne retient jamais plus que ce qui est dû : ${encore} F au plus, une fois les retenues déjà prévues comptées.`
      : 'Tout ce qui est dû est déjà prévu sur un bulletin, ou rendu.';
  }
  return undefined;
}
