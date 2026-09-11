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
export type LigneDeTournee = {
  canal: string;
  statut: string;
  /** L'ACCUSÉ DE META, quand le webhook l'a rapporté (11 septembre 2026).
      Absent = personne n'a encore rien dit, et c'était le cas de TOUS les
      envois jusqu'à ce que la Maison pose son oreille. */
  etat?: string;
};

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
  /** L'ACCUSÉ LE PLUS AVANCÉ reçu de Meta — « lu » l'emporte sur « remis »,
      qui l'emporte sur « en-route ». Absent quand rien n'est revenu : ce
      n'est pas un échec, c'est un silence, et les deux ne se disent pas
      pareil. Un « non-remis » n'apparaît pas ici, il devient `rate`. */
  accuse?: 'en-route' | 'remis' | 'lu';
};

/* L'ACCUSÉ NE RECULE PAS. Meta livre « remis » et « lu » dans un ordre qu'il
   ne garantit pas, et sur plusieurs canaux à la fois : sans ce rang, un
   « remis » tardif effacerait un « lu » déjà reçu, et l'écran perdrait une
   information qu'il avait eue. */
const RANG_ACCUSE: Record<string, number> = { 'en-route': 1, remis: 2, lu: 3 };

/** L'ÉTAT D'UN RAPPEL, lu sur le journal des envois de CE rendez-vous.
    `lignes` = toutes les lignes dont l'identifiant commence par
    `env-<apptId>-`, quel que soit le canal. */
export const etatDeLaTournee = (lignes: readonly LigneDeTournee[]): EtatDeLaTournee => {
  const partis = lignes.filter((l) => l.statut === 'envoyé').map((l) => l.canal);
  /* UN MESSAGE QUE META REFUSE PLUS TARD EST UN ÉCHEC, même si la requête
     avait été acceptée le soir même. C'est exactement ce que le journal ne
     savait pas dire : « envoyé » n'a jamais voulu dire « arrivé ». */
  const rate = lignes.some((l) => l.statut === 'échec' || l.etat === 'non-remis');
  let accuse: 'en-route' | 'remis' | 'lu' | undefined;
  for (const l of lignes) {
    const e = l.etat;
    if (e !== 'en-route' && e !== 'remis' && e !== 'lu') continue;
    if (!accuse || RANG_ACCUSE[e] > RANG_ACCUSE[accuse]) accuse = e;
  }
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
    accuse,
  };
};
