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
