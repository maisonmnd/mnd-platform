import type { Client, Family } from './clients';
import type { CreditHolder } from './finance';

/* Comptes & avoirs — résolution du porteur d'avoir et du payeur d'une cliente.
   Le porte-monnaie d'avoir vit sur le COMPTE : compte famille (porte-monnaie du
   parent payeur, partagé par tous les membres) ou cliente sans famille. */

/** Le porteur d'avoir d'une cliente : son compte famille si rattachée (et
    existant), sinon elle-même. */
export function holderOf(client: Client, families: Family[]): CreditHolder {
  if (client.familyId && families.some((f) => f.id === client.familyId)) {
    return { type: 'family', id: client.familyId };
  }
  return { type: 'client', id: client.id };
}

/** Le PAYEUR effectif d'une cliente : le parent payeur du compte famille s'il est
    défini, sinon la cliente elle-même. Renvoie l'id de la fiche qui règle. */
export function payerClientIdOf(client: Client, families: Family[]): string {
  const fam = client.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  return fam?.payerClientId || client.id;
}

/** Libellé lisible d'un porteur d'avoir (nom du compte famille ou de la cliente). */
export function holderLabel(holder: CreditHolder, clients: Client[], families: Family[]): string {
  if (holder.type === 'family') return families.find((f) => f.id === holder.id)?.name ?? 'Compte famille';
  return clients.find((c) => c.id === holder.id)?.name ?? 'Cliente';
}

/** Deux porteurs désignent-ils le même compte ? */
export const sameHolder = (a: CreditHolder, b: CreditHolder): boolean => a.type === b.type && a.id === b.id;

/* ---------- LES TÊTES D'UN COMPTE — le parent et ses enfants ----------

   Les enfants ont besoin de rendez-vous à leur nom : une couronne de neuf ans
   n'est pas celle de sa mère, et son suivi non plus. Mais un mineur n'a ni
   compte, ni e-mail, ni téléphone — c'est le parent qui agit pour lui.

   Rien de neuf n'était nécessaire pour le dire : le compte famille existait
   déjà, avec son parent payeur. Ce fichier ne fait qu'en tirer les questions
   qu'on lui pose vraiment. */

/** L'âge en années révolues, ou `undefined` si la date de naissance manque. */
export function ageDe(birthday: string | undefined, aujourdhui: string): number | undefined {
  if (!birthday) return undefined;
  const n = new Date(`${birthday}T00:00:00`);
  const j = new Date(`${aujourdhui}T00:00:00`);
  if (Number.isNaN(n.getTime()) || Number.isNaN(j.getTime())) return undefined;
  let a = j.getFullYear() - n.getFullYear();
  const m = j.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && j.getDate() < n.getDate())) a -= 1;
  return a;
}

/** Est-elle mineure ? SANS DATE DE NAISSANCE, LA RÉPONSE EST NON — et c'est
    voulu : la minorité ouvre l'accès du parent à ses données, elle ne se
    présume pas. La règle échoue fermée, ce qui oblige à renseigner la date. */
export const estMineur = (client: Pick<Client, 'birthday'>, aujourdhui: string): boolean => {
  const a = ageDe(client.birthday, aujourdhui);
  return a !== undefined && a < 18;
};

/** LES TÊTES QU'UN PARENT PORTE — les mineurs de sa famille, lui excepté.

    À dix-huit ans, l'enfant en sort de lui-même : ses données lui appartiennent.
    Le lien de famille, lui, demeure — le parent peut continuer à régler. */
export function tetesPortees(parent: Client, clients: Client[], families: Family[], aujourdhui: string): Client[] {
  const fam = parent.familyId ? families.find((f) => f.id === parent.familyId) : undefined;
  if (!fam || fam.payerClientId !== parent.id) return [];
  return clients
    .filter((c) => c.id !== parent.id && c.familyId === fam.id && estMineur(c, aujourdhui) && !c.archived)
    .slice()
    /* De l'aîné au plus jeune — c'est ainsi qu'une famille nomme ses enfants,
       et l'ordre ne doit pas changer d'un anniversaire à l'autre. */
    .sort((a, b) => (a.birthday ?? '').localeCompare(b.birthday ?? '') || a.name.localeCompare(b.name));
}

/** LE COMPTEUR DU CERCLE — un seul par compte, pour tout le foyer.

    Trois têtes qui paient au même comptoir méritent un seul palier : c'est le
    choix de la Maison. Il se calcule en SOMMANT les têtes du compte plutôt
    qu'en tenant un compteur de plus — un total stocké à côté des fiches
    finirait par ne plus leur correspondre, et personne ne saurait lequel croire.

    Sans famille, c'est son compte à elle : le total ne change pas d'un point. */
export function pointsDuCompte(client: Client, clients: Client[], families: Family[]): number {
  const fam = client.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  if (!fam) return client.loyaltyPoints ?? 0;
  return clients
    .filter((c) => c.familyId === fam.id && !c.archived)
    .reduce((n, c) => n + (c.loyaltyPoints ?? 0), 0);
}
