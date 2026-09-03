import type { Client, Family } from './clients';
import { aUnPrixConvenu } from './clients';
import { venuesHonorees, apptPayeurId, apptPaidXof, type Appointment } from './agenda';
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
/** L'ÂGE JUSQU'AUQUEL UNE TÊTE EST « MND Kids » — 3 septembre 2026.

    LA MAJORITÉ NE CONVIENT PAS ICI. La Maison compte les mineurs à 18 ans pour
    la remise du foyer, ce qui est le bon seuil pour un compte ; mais un tarif
    enfant à dix-sept ans ne se défend pas devant les autres clientes. Quinze
    ans est la limite retenue : au-delà, la tête paie le catalogue.

    UN SEUL NOMBRE, ICI. Le poser en dur dans les écrans obligerait à le
    retrouver partout le jour où la Maison le change. */
export const AGE_MND_KIDS = 15;

/** CETTE TÊTE EST-ELLE UN ENFANT, AU SENS DU TARIF ?

    TROIS RÉPONSES, PAS DEUX. Une fiche sans date de naissance n'est pas une
    adulte : c'est une INCONNUE. Répondre « non » lui refuserait le tarif enfant
    sans un mot, et la faute ne se verrait qu'à la caisse. L'écran montre alors
    la section en la signalant — le silence coûte plus cher qu'une mention. */
export type VerdictKids = 'oui' | 'non' | 'inconnu';

export const estKids = (
  client: Pick<Client, 'birthday'> | undefined, aujourdhui: string,
): VerdictKids => {
  if (!client) return 'inconnu';
  const age = ageDe(client.birthday, aujourdhui);
  if (age === undefined) return 'inconnu';
  return age <= AGE_MND_KIDS ? 'oui' : 'non';
};

export const estMineur = (client: Pick<Client, 'birthday'>, aujourdhui: string): boolean => {
  const a = ageDe(client.birthday, aujourdhui);
  return a !== undefined && a < 18;
};

/** LES TÊTES QU'UN PARENT PORTE — les mineurs de sa famille, lui excepté.

    À dix-huit ans, l'enfant en sort de lui-même : ses données lui appartiennent.
    Le lien de famille, lui, demeure — le parent peut continuer à régler. */
export function tetesPortees(parent: Client, clients: Client[], families: Family[], aujourdhui: string): Client[] {
  /* LE LIEN PERDU N'EST PAS UNE FAMILLE ABSENTE (14 août, Valerie) : une
     copie froide poussée par le téléphone peut effacer `familyId` sur la
     fiche du parent. La famille dont il est le PAYEUR le porte tout autant —
     même règle que la base (`est_ma_tete`) et que le rattachement (0046). */
  const fam = (parent.familyId ? families.find((f) => f.id === parent.familyId) : undefined)
    ?? families.find((f) => f.payerClientId === parent.id);
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

/* ── LA RECONNAISSANCE, TÊTE PAR TÊTE (25 août) ───────────────────────
   Le Cercle récompensait la fidélité comptée PAR LA PAYEUSE : une famille de
   trois têtes, une venue chacune, l'ouvrait sans qu'une seule personne ait été
   fidèle ; et une tête à prix convenu y entrait par-dessus son tarif négocié.
   On sépare : le Cercle se gagne par SES PROPRES venues, à plein tarif ; le prix
   convenu EST déjà la reconnaissance ; la famille a son palier « Foyer », sur la
   dépense cumulée. Ces règles vivent ICI, lues à l'identique par le Trône et par
   Ma Couronne — un seul juge, deux écrans. */

/** Une tête est DÉPENDANTE quand une autre règle pour elle (enfant, membre non
    payeur d'un foyer). Sa venue nourrit le Foyer, jamais un Cercle individuel. */
export const estDependant = (client: Client, families: Family[]): boolean =>
  payerClientIdOf(client, families) !== client.id;

/** Dépense honorée CUMULÉE du foyer — tout ce qui est réellement entré sur les
    rituels de TOUTES les têtes du foyer (par leur `clientId`, pas par la payeuse :
    un enfant réglé par sa mère porte le rituel à son nom). Sert au palier Foyer.
    Sans famille, c'est la dépense de la tête seule. */
export const depenseFoyerXof = (
  client: Client, clients: Client[], families: Family[], appts: readonly Appointment[],
): number => {
  const fam = client.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  const ids = fam
    ? new Set(clients.filter((c) => c.familyId === fam.id && !c.archived).map((c) => c.id))
    : new Set([client.id]);
  return appts.reduce((s, a) => (a.status === 'honoré' && ids.has(a.clientId) ? s + apptPaidXof(a) : s), 0);
};

export type StatutFidelite = {
  /** Le mot juste pour cette tête. */
  genre: 'cercle' | 'convenu' | 'dependant' | 'aux-portes' | 'passage';
  membreCercle: boolean;
  venues: number;   // SES propres venues honorées
  seuil: number;
  reste: number;
  convenu: boolean;
  dependant: boolean;
  foyer: boolean;   // rattachée à un compte famille
  depenseFoyer: number;
  seuilFoyer: number;
  foyerAtteint: boolean;
  resteFoyer: number;
};

/** LE STATUT DE FIDÉLITÉ d'une tête — la source unique. `seuilCercle` en venues,
    `seuilFoyer` en F CFA (voir `cercleSeuilStore` / `foyerSeuilStore`). */
export function statutFidelite(
  client: Client,
  clients: Client[],
  families: Family[],
  appts: readonly Appointment[],
  seuilCercle: number,
  seuilFoyer: number,
): StatutFidelite {
  const convenu = aUnPrixConvenu(client);
  const dependant = estDependant(client, families);
  const foyer = !!client.familyId && families.some((f) => f.id === client.familyId);
  const venues = venuesHonorees(appts, client.id, false); // SES venues, pas par la payeuse
  const membreCercle = !convenu && !dependant && venues >= Math.max(1, seuilCercle);
  const depenseFoyer = foyer ? depenseFoyerXof(client, clients, families, appts) : 0;
  const foyerAtteint = foyer && depenseFoyer >= Math.max(1, seuilFoyer);
  const genre: StatutFidelite['genre'] = convenu ? 'convenu'
    : dependant ? 'dependant'
      : membreCercle ? 'cercle'
        : venues > 0 ? 'aux-portes'
          : 'passage';
  return {
    genre, membreCercle, venues, seuil: seuilCercle, reste: Math.max(0, seuilCercle - venues),
    convenu, dependant, foyer, depenseFoyer, seuilFoyer, foyerAtteint,
    resteFoyer: Math.max(0, seuilFoyer - depenseFoyer),
  };
}
