import { createStore, useStore, uid } from './store';

/* LES CRÉNEAUX BLOQUÉS — ce que les horaires ne savent pas dire.

   La semaine type dit quand la maison ouvre ; les exceptions d'horaires
   (shared/settings) savent fermer UNE date entière ou la raccourcir. Mais ni
   l'une ni l'autre ne sait dire « pas de tresses entre 12 h et 14 h » ou
   « Brice est absent jeudi » : la première parle de la Maison, jamais d'un
   maître ; la seconde n'a pas de plage à trous.

   Ce registre porte exactement ce qui manque — et RIEN de ce qui existe déjà :
   fermer une date entière reste une exception d'horaires, pour que la maison
   n'ait qu'une seule vérité par question.

   Qui lit quoi : le personnel écrit (Paramètres → Le calendrier) ; Ma Couronne
   LIT — la réservation calcule ses créneaux côté cliente, elle doit voir les
   murs pour ne pas proposer de passer au travers. Le motif reste donc digne
   d'être lu par une cliente : « Fermeture exceptionnelle », pas les détails. */

export type Blocage = {
  id: string;
  branchId: string;
  /** AAAA-MM-JJ — un blocage vit sur UNE date. Une absence de trois jours
      s'écrit en trois gestes : c'est voulu, on voit ce qu'on bloque. */
  date: string;
  /** Le maître concerné (son NOM, comme dans les rendez-vous). Absent = toute
      la Maison — plus personne ne reçoit sur la plage. */
  master?: string;
  /** Bornes de la plage en « 09h00 ». Absentes = la journée entière
      (pour ce maître ; pour la Maison entière, préférer l'exception). */
  debut?: string;
  fin?: string;
  /** Le mot que la maison veut bien laisser lire. */
  motif?: string;
};

export const blocagesStore = createStore<Blocage[]>('mnd_blocages', []);
export const useBlocages = () => useStore(blocagesStore);

export function poserBlocage(champs: Omit<Blocage, 'id'>): Blocage {
  const b: Blocage = { id: `blk-${uid()}`, ...champs };
  blocagesStore.set((prev) => [...prev, b]);
  return b;
}

/** LE SALON FERMÉ PAR UNE RÉSERVATION (15 août) — « quand quelqu'un réserve,
    le salon est bloqué pour ce temps ». Le blocage porte l'identifiant du
    rendez-vous : il se repose sans se dédoubler quand l'heure change, et
    s'efface avec lui quand le rituel est annulé. Sans maître : c'est la Maison
    entière qui ne reçoit plus, pas un fauteuil.

    Ce n'est pas une absence, c'est une vente — le motif le dit, pour qu'on ne
    « libère » pas la plage en croyant nettoyer un oubli. */
export function fermerLeSalonPour(p: {
  apptId: string; branchId: string; date: string; debut: string; fin: string; qui?: string;
}): void {
  const marque = `rdv:${p.apptId}`;
  blocagesStore.set((prev) => [
    ...prev.filter((b) => b.motif?.startsWith(marque) !== true),
    {
      id: `blk-priv-${p.apptId}`, branchId: p.branchId, date: p.date,
      debut: p.debut, fin: p.fin,
      motif: `${marque} · Salon Souverain${p.qui ? ` — ${p.qui}` : ''}`,
    },
  ]);
}

/** La Maison rouvre : le rituel a été annulé ou déplacé hors de sa date. */
export function rouvrirLeSalonDe(apptId: string): void {
  blocagesStore.set((prev) => prev.filter((b) => !b.motif?.startsWith(`rdv:${apptId}`)));
}

export function retirerBlocage(id: string): void {
  blocagesStore.set((prev) => prev.filter((b) => b.id !== id));
}

/** Les murs d'une date pour UN maître, en minutes depuis minuit — la forme
    que `freeSlots` sait déjà éviter. Un blocage sans bornes couvre tout
    (0 → 24 h) ; un blocage sans maître s'applique à tous. */
export function plagesBloquees(
  blocages: Blocage[],
  branchId: string,
  dateIso: string,
  master: string,
  hourToMin: (h: string) => number,
): Array<[number, number]> {
  return blocages
    .filter((b) => b.branchId === branchId && b.date === dateIso && (!b.master || b.master === master))
    .map((b): [number, number] => [
      b.debut?.trim() ? hourToMin(b.debut) : 0,
      b.fin?.trim() ? hourToMin(b.fin) : 24 * 60,
    ])
    .filter(([s, e]) => e > s);
}

import { bindCollection } from './sync';
bindCollection(blocagesStore, 'blocages');
