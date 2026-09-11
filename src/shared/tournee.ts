/* ══ CE QUE LA TOURNÉE DU MATIN DOIT AVOUER — 11 septembre 2026 ══════

   « Pourquoi les nouveaux RDV n'ont pas les tags Sans l'appli ou WhatsApp
   auto ? » (Yéman).

   La bonne réponse était « le passage automatique n'est pas encore allé sur
   eux ». Mais l'écran ne pouvait pas la donner : il affichait une pastille
   par SUCCÈS et rien d'autre. Une ligne nue voulait donc dire trois choses
   incompatibles, et aucune n'était écrite :

     ① le passage n'est pas venu (rendez-vous posé après son heure) ;
     ② le passage est venu et A ÉCHOUÉ (réseau, jeton, modèle en revue) ;
     ③ le passage est venu et n'avait personne à joindre (ni appli, ni numéro).

   TROIS ÉTATS, UNE SEULE APPARENCE. C'est exactement le silence qui a coûté
   deux semaines sur le cron du soir : il était mort tous les soirs et
   l'écran avait l'air normal. Une Maison ne peut pas corriger ce qu'elle ne
   voit pas.

   LE JUGE EST PUR ET ÉPROUVÉ, plutôt que deviné dans une cascade de JSX :
   l'écran lit un verdict, il ne le recalcule pas. */

/** Une ligne du journal des envois, réduite à ce qui sert à juger. N'importe
    quel `Envoi` satisfait cette forme : on ne noue pas les couches pour deux
    champs, et `shared` continue d'ignorer les écrans. */
export type LigneDeTournee = { canal: string; statut: string };

export type EtatDeLaTournee = {
  /** Les canaux par lesquels quelque chose est RÉELLEMENT parti. */
  partis: string[];
  /** Elle n'a pas Ma Couronne : le push n'avait personne à réveiller. Ce n'est
      pas une panne, et réessayer ne la lui installera pas. */
  sansAppli: boolean;
  /** Une tentative a échoué. Rien n'est arrivé, et rien ne se retentera avant
      le prochain passage : c'est la seule ligne qui appelle une main. */
  rate: boolean;
  /** Le passage automatique n'est jamais venu sur ce rendez-vous. Presque
      toujours parce qu'il a été posé APRÈS l'heure du passage. */
  jamaisPasse: boolean;
  /** Le passage est venu, rien n'est parti, et rien n'a échoué non plus : la
      Maison n'avait aucun moyen de la joindre. La cloche est le seul recours,
      et l'écran doit le dire plutôt que de laisser croire que c'est fait. */
  muet: boolean;
};

/** L'ÉTAT D'UN RAPPEL, lu sur le journal des envois de CE rendez-vous.
    `lignes` = toutes les lignes dont l'identifiant commence par
    `env-<apptId>-`, quel que soit le canal. */
export const etatDeLaTournee = (lignes: readonly LigneDeTournee[]): EtatDeLaTournee => {
  const partis = lignes.filter((l) => l.statut === 'envoyé').map((l) => l.canal);
  const rate = lignes.some((l) => l.statut === 'échec');
  const sansAppli = lignes.some((l) => l.canal === 'push' && l.statut === 'sans-abonnement');
  const jamaisPasse = lignes.length === 0;
  return {
    partis,
    sansAppli,
    rate,
    jamaisPasse,
    /* « SANS L'APPLI » TOUT SEUL EST UN SILENCE, pas un envoi. Le push n'a
       réveillé personne et le WhatsApp n'a même pas été tenté, faute de
       numéro utilisable sur la fiche. Trois pastilles disaient « sans
       l'appli » ce matin-là et l'on pouvait croire le travail fait. */
    muet: !jamaisPasse && partis.length === 0 && !rate,
  };
};
