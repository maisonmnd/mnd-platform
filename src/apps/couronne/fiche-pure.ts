/* CE QUE MA COURONNE DIT D'UNE FICHE DE RENDEZ-VOUS QU'ELLE NE TROUVE PAS —
   10 octobre 2026 (reprise de la revue de code).

   Un lien `#/rdv/<id>` (une notification, une carte) désigne un rendez-vous ;
   s'il n'est pas dans « les miens », trois choses très différentes peuvent
   être vraies, et une seule autorise à dire « il n'est plus au carnet ».
   Ce fichier est PUR : l'écran lui passe ce qu'il sait de la synchronisation,
   le harnais `verifie-revue-couronne-site` l'éprouve seul. */

/** LES TABLES QUI FONT « LES MIENS » : les rendez-vous, et pour savoir à
    qui ils sont, la fiche de la cliente et son foyer (les têtes qu'elle
    porte). Tant qu'une des trois n'a pas répondu, un RDV de sa fille mineure
    paraît « pas à elle ». */
export const TABLES_DU_CARNET = ['appointments', 'clients', 'families'] as const;

/** LA FICHE INTROUVABLE, CE QU'ON EN DIT.
      · `se-charge`      : une des trois tables n'a pas encore répondu ;
      · `injoignable`    : la lecture des rendez-vous a échoué (hors ligne,
                           serveur en panne) : le cache n'est pas le carnet,
                           on ne déclare rien disparu ;
      · `plus-au-carnet` : tout est lu, la lecture a réussi, il n'y est pas.
    « Prête » au sens de la synchronisation veut dire RÉSOLUE, y compris sur
    une lecture échouée : c'est pourquoi l'échec se juge à part. */
export function ficheIntrouvable(o: {
  tablesResolues: boolean;
  lectureEnEchec: boolean;
  enLigne: boolean;
}): 'se-charge' | 'injoignable' | 'plus-au-carnet' {
  if (!o.tablesResolues) return 'se-charge';
  if (o.lectureEnEchec || !o.enLigne) return 'injoignable';
  return 'plus-au-carnet';
}

/** LA LECTURE DES RENDEZ-VOUS A-T-ELLE ÉCHOUÉ ? D'après l'état que la
    synchronisation publie : en échec, en reprise après une panne passagère,
    ou écartée par les droits. Une seule table compte ici, celle que l'écran
    prétendrait lire en entier. */
export function lectureDesRdvEnEchec(etat: {
  failedNames: readonly string[];
  reprises: readonly string[];
  ecartees: readonly string[];
}): boolean {
  return [etat.failedNames, etat.reprises, etat.ecartees].some((l) => l.includes('appointments'));
}
