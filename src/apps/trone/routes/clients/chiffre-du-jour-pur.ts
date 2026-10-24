import { ligneNetteXof, type LigneGamme } from '../../../../shared/gamme';

/* ══ LE CHIFFRE D'AFFAIRES ATTENDU DE LA JOURNÉE — 24 octobre 2026 ══════
   « Je veux le chiffre d'affaires attendu de la journée dans le Carnet ou sur
   le tableau de bord » (Yéman) ; au sélecteur : les deux, et il compte les
   rituels ET la Gamme posée sur leurs rendez-vous (pourboires exclus).

   Les rendez-vous du jour qui ne sont pas annulés, à leur valeur (le net du
   rituel, remises et forfait compris), plus leurs lignes de Gamme ; ce qui
   est déjà encaissé (acompte vérifié, versements, Gamme réglée), et ce qui
   reste. Un rituel payé d'avance compte dans l'attendu ET dans l'encaissé :
   la journée vaut ce qu'elle vaut, quel que soit le jour où l'argent est
   entré.

   Pur : l'écran passe, pour chaque rendez-vous, le net de son rituel et ce
   qui en reste dû (les mêmes juges que le Carnet). Le banc
   verifie-le-chiffre-du-jour le rejoue. */

export type RdvDuChiffre = {
  date: string;
  status: string;
  /** Le net du rituel (`apptNetXof`). */
  rituelXof: number;
  /** Ce qui reste dû sur le rituel (`apptDueXof`). */
  resteRituelXof: number;
  gamme?: readonly LigneGamme[];
};

export type ChiffreDuJour = {
  nombre: number;
  attenduXof: number;
  rituelsXof: number;
  gammeXof: number;
  encaisseXof: number;
  resteXof: number;
};

const entier = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

export function chiffreAttenduDuJour(rdvs: readonly RdvDuChiffre[], jour: string): ChiffreDuJour {
  let nombre = 0;
  let rituelsXof = 0;
  let gammeXof = 0;
  let resteXof = 0;
  for (const a of rdvs) {
    if (a.date !== jour || a.status === 'annulé') continue;
    nombre += 1;
    const rituel = entier(a.rituelXof);
    rituelsXof += rituel;
    resteXof += Math.min(rituel, entier(a.resteRituelXof));
    for (const l of a.gamme ?? []) {
      const x = entier(ligneNetteXof(l));
      gammeXof += x;
      if (!l.regleeAt) resteXof += x;
    }
  }
  const attenduXof = rituelsXof + gammeXof;
  return { nombre, attenduXof, rituelsXof, gammeXof, encaisseXof: Math.max(0, attenduXof - resteXof), resteXof };
}
