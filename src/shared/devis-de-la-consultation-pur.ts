import type { OnlineConsultation } from './bridges';

/* ══ LE DEVIS ESTIMÉ, NÉ D'UNE CONSULTATION — 13 novembre 2026 (lot 2) ══════
   « Préparer le devis estimé » (Trône › Consultations, file A) ouvre l'éditeur
   des devis avec ce que la consultation gratuite a retenu : une ligne par
   prestation, au BAS de sa fourchette, et la fourchette écrite dans le mot
   pour que la Maison la voie en relisant. Rien n'est enregistré : c'est un
   brouillon, à l'état « estimé », que la Maison ajuste avant de le créer.

   LA CLIENTE se retrouve par son numéro (les huit derniers chiffres), sinon
   par la fiche « prospect » que la réconciliation pose pour chaque
   consultation (`prospect-<id>`). MODULE PUR. */

export type LigneDuBrouillon = { label: string; unitXof: number; aChiffrer: boolean };

export function lignesDuDevisEstime(c: OnlineConsultation): LigneDuBrouillon[] {
  const e = c.estimation;
  if (!e) return [];
  const retenues = e.lignes.filter((l) => l.retenue);
  const source = retenues.length ? retenues : e.lignes;
  return source.map((l) => ({ label: l.nom, unitXof: Math.max(0, Math.round(l.min ?? 0)), aChiffrer: l.min === null }));
}

const huitDerniers = (t: string | undefined): string => String(t ?? '').replace(/\D/g, '').slice(-8);

export function clienteDeLaConsultation<C extends { id: string; phone?: string }>(c: OnlineConsultation, clientes: readonly C[]): C | undefined {
  const n = huitDerniers(c.client.phone);
  return (n.length === 8 ? clientes.find((x) => huitDerniers(x.phone) === n) : undefined)
    ?? clientes.find((x) => x.id === `prospect-${c.id}`);
}

/** Le mot qui accompagne le brouillon : la fourchette et ce qui reste à confirmer. */
export function motDuDevisEstime(c: OnlineConsultation, argent: (n: number) => string): string {
  const e = c.estimation;
  if (!e) return '';
  const f = e.min === e.max ? argent(e.min) : `${argent(e.min)} à ${argent(e.max)}`;
  const confirmer = e.aConfirmer.length ? ` Nous verrons ensemble : ${e.aConfirmer.map((x) => x.nom).join(', ')}.` : '';
  return `Votre estimation, issue de votre consultation : ${f}. Le prix ferme suit la confirmation de la Maison.${confirmer}`;
}
