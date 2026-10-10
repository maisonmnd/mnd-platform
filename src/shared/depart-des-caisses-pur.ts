/* ══ LE DÉPART DES CAISSES, SANS PERTE — 10 octobre 2026 (revue de code) ══
   Le départ du 4 octobre (« toutes les caisses à 0 à partir d'aujourd'hui »)
   remettait le solde d'ouverture de TOUTES les caisses de la branche à 0, et
   l'ancienne valeur disparaissait. Deux défauts :

   · LES ANCIENNES Y PASSAIENT AUSSI. Une caisse marquée « jusqu'au 30 sept. »
     compte tout son passé, ouverture comprise (le départ ne la coupe pas) :
     relancer le départ après la bascule lui retirait son ouverture, et son
     solde d'avant devenait faux. Une caisse rangée (archivée) non plus n'a
     rien à y faire.
   · AUCUN RETOUR. « Compter depuis toujours » retirait le mois de départ mais
     laissait les ouvertures à 0. La valeur effacée est désormais gardée sur
     la caisse (`ouvertureAvantDepart`) et rendue au retour, si personne n'a
     écrit une nouvelle ouverture entre-temps.

   CE MODULE NE TOUCHE À RIEN : il calcule, l'écran écrit. */
import type { Cashbox } from './finance';

/** Les caisses que le départ peut remettre à 0 : celles de la branche, ni
    anciennes ni rangées. */
export const toucheeParLeDepart = (c: Pick<Cashbox, 'branchId' | 'jusquAu' | 'archiveeLe'>, branchId: string): boolean =>
  c.branchId === branchId && !c.jusquAu && !c.archiveeLe;

/** Celles qui ont aujourd'hui une ouverture à remettre à 0 (l'écran les nomme). */
export const ouverturesARemettre = <C extends Cashbox>(caisses: readonly C[], branchId: string): C[] =>
  caisses.filter((c) => toucheeParLeDepart(c, branchId) && (c.openingXof ?? 0) !== 0);

/** Le départ : ouverture à 0, la valeur effacée gardée. Seule une ouverture
    non nulle s'efface : un second départ sur une caisse déjà à 0 ne touche
    pas la trace du premier. */
export const ouverturesAuDepart = <C extends Cashbox>(caisses: readonly C[], branchId: string): C[] =>
  caisses.map((c) => (toucheeParLeDepart(c, branchId) && (c.openingXof ?? 0) !== 0
    ? { ...c, openingXof: 0, ouvertureAvantDepart: c.openingXof }
    : c));

/** Le retour : chaque ouverture gardée revient, tant que la caisse est restée
    à 0. Une ouverture écrite à la main depuis (l'argent compté le 1er au
    matin) a le dernier mot : elle reste, et la trace avec elle. */
export const ouverturesRendues = <C extends Cashbox>(caisses: readonly C[], branchId: string): C[] =>
  caisses.map((c) => {
    if (c.branchId !== branchId || c.ouvertureAvantDepart === undefined || (c.openingXof ?? 0) !== 0) return c;
    const { ouvertureAvantDepart, ...reste } = c;
    return { ...reste, openingXof: ouvertureAvantDepart } as C;
  });
