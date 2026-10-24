/* CE QUE LA RÉSERVATION DE MA COURONNE DÉCIDE, SANS ÉCRAN — 10 octobre 2026.

   Trois juges sortis de Booking.tsx pour que le harnais
   `verifie-revue-couronne-site` les éprouve seuls. Ce fichier est PUR : il ne
   lit ni magasin, ni réseau, ni horloge. */
import type { CreneauOccupe } from '../../shared/agenda-pur';

/** LE RENDEZ-VOUS NAÎT-IL CONFIRMÉ ?

    Depuis le 29 septembre (« Tout de suite »), une place libre sans acompte
    naît confirmée, et la confirmation WhatsApp part au balayage suivant. Mais
    « libre » ne vaut que si les murs du serveur sont CONNUS : la cliente ne
    lit que ses propres rendez-vous (RLS), et un agenda du serveur pas encore
    arrivé, ou en erreur, laisse la grille vide. La revue du 10 octobre l'a
    vu : un RDV pris pendant ce temps naissait confirmé sur une heure déjà
    prise, et la confirmation partait. Sans murs connus, ou si une séance
    n'est plus libre au moment d'écrire, il naît « en attente » : la Maison
    confirme, comme avant le 29 septembre.

    Un acompte ENCAISSÉ ET VÉRIFIÉ par le serveur tient toujours la place :
    l'argent est reçu, c'est à la Maison de trouver l'heure. */
export function naitConfirme(o: {
  acompteVerifie: boolean;
  acompteDemande: boolean;
  mursConnus: boolean;
  seancesToujoursLibres: boolean;
}): boolean {
  if (o.acompteVerifie) return true;
  return !o.acompteDemande && o.mursConnus && o.seancesToujoursLibres;
}

/** SON HEURE HABITUELLE, CE QU'ON EN DIT.

    « Réserver ce moment » arrive avec l'heure de sa dernière venue. Le
    Trône pose des heures à la demi-heure, la grille de Ma Couronne va
    d'heure en heure : « 10:30 » n'y est jamais. Avant le 10 octobre, une
    heure absente des heures libres se disait « Ce moment vient d'être
    pris », alors qu'elle n'avait jamais été proposable. Trois issues :
      · `libre`       : elle est dans les heures libres, on la pose ;
      · `prise`       : elle est sur la grille du jour mais occupée, on le dit ;
      · `hors-grille` : la grille ne la porte pas, on ne dit rien de faux et
                        le tunnel reste ouvert sur le jour. */
export function heureHabituelle(
  voulu: string,
  libres: readonly string[],
  grille: readonly string[],
): 'libre' | 'prise' | 'hors-grille' {
  if (libres.includes(voulu)) return 'libre';
  return grille.includes(voulu) ? 'prise' : 'hors-grille';
}

/** LES MURS DU DERNIER MOT — 10 octobre 2026 (reprise de la revue).

    La relecture de la place jugeait contre l'agenda lu au MONTAGE : la
    fenêtre de trois mois ne change pas, rien ne relançait l'appel. Une
    cliente qui a ouvert le tunnel à 10 h et touche 14 h à 10 h 10 voyait
    encore libre l'heure qu'une autre avait prise à 10 h 05, et son rendez-vous
    naissait « confirmé », WhatsApp compris. Au moment d'écrire, on redemande
    donc au serveur les murs des jours des séances. `rpc` est l'appel à
    `creneaux_occupes`, passé par l'écran : ce juge ne touche pas le réseau
    lui-même.

    Trois issues :
      · pas de serveur du tout (démo sur le poste) : aucun mur, `[]`, comme
        `useCreneauxOccupesCharges` qui se dit alors chargé ;
      · une réponse lisible : les murs du moment ;
      · une erreur, une exception, une réponse illisible : `null`, les murs
        ne sont PAS connus, et le rendez-vous part « en attente ». */
/** CE QU'ON FAIT DE LA PLACE RELUE — 24 octobre 2026.

    « Comment se fait-il qu'elle a réussi à prendre rendez-vous à la même
    heure ? » (Yéman : deux têtes de 500 locks à 14 h). Jusqu'ici une place
    qui n'était plus libre naissait quand même, « en attente », et occupait
    l'agenda. En ligne, un rituel ne chevauche plus jamais un autre :
      · `ecrire`             : la place est libre (ou l'acompte est déjà
                               encaissé et les murs ne se lisent pas : on ne
                               perd pas une cliente qui a payé) ;
      · `prise`              : elle ne l'est plus, rien ne s'écrit, on revient
                               aux heures ;
      · `inconnue`           : les murs ne se lisent pas, rien ne s'écrit à
                               l'aveugle, on le dit ;
      · `prise-acompte-recu` : prise, mais l'acompte est déjà encaissé : rien
                               ne s'écrit, la Maison est prévenue et rappelle. */
export function issueDeLaPlace(o: {
  mursConnus: boolean;
  seancesToujoursLibres: boolean;
  acompteVerifie: boolean;
}): 'ecrire' | 'prise' | 'inconnue' | 'prise-acompte-recu' {
  if (o.mursConnus && !o.seancesToujoursLibres) return o.acompteVerifie ? 'prise-acompte-recu' : 'prise';
  if (!o.mursConnus) return o.acompteVerifie ? 'ecrire' : 'inconnue';
  return 'ecrire';
}

/** LA RÉPONSE DE LA BASE À L'ÉCRITURE — 24 octobre 2026. Le garde
    `une_place_en_ligne` (migration 0140) refuse une place déjà prise par
    `creneau_pris` ; tout autre refus est une écriture qui n'est pas partie. */
export function verdictDeLEcriture(message: string | null | undefined): 'posee' | 'prise' | 'echec' {
  if (message == null) return 'posee';
  return /creneau_pris/.test(message) ? 'prise' : 'echec';
}

export async function relisLesMurs(
  rpc: (() => PromiseLike<{ data: unknown; error: unknown }>) | null,
): Promise<CreneauOccupe[] | null> {
  if (!rpc) return [];
  try {
    const { data, error } = await rpc();
    if (error) return null;
    if (data == null) return [];
    return Array.isArray(data) ? (data as CreneauOccupe[]) : null;
  } catch {
    return null;
  }
}
