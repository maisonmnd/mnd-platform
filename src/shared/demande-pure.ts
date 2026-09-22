/* LA QUESTION DE LA MAISON, LA PART QUI SE VÉRIFIE — 22 septembre 2026.

   Maquette `public/maquette-la-question-de-la-maison.html`, validée.
   Quatre-vingt-neuf `window.confirm` demandaient « êtes-vous sûr ? » avec une
   fenêtre du navigateur, que celui-ci laisse désactiver d'une case à cocher :
   toutes répondaient alors « non » sans rien afficher, et le geste échouait
   en silence.

   CE MODULE NE DESSINE RIEN. Il ne porte que les règles de langue, pour
   qu'elles se vérifient au harnais : comment une question de la Maison
   s'écrit, et ce qu'un bouton n'a pas le droit de dire. */

export type DemandeDeLaMaison = {
  /** Le surtitre : de quoi il s'agit, en trois mots. « Suppression définitive ». */
  quoi: string;
  /** L'acte et la chose, en question. « Supprimer la fiche de A. K. ? » */
  titre: string;
  /** Ce que ça change, en une phrase. */
  dit?: string;
  /** Les chiffres qui pèsent dans la décision, s'il y en a. */
  suite?: string;
  /** Ce qui ne se défera pas. N'apparaît QUE si c'est vrai. */
  scelle?: string;
  /** Le bouton qui fait. Il nomme l'acte, jamais « OK ». */
  accepter: string;
  /** Le bouton qui ne fait rien. Il nomme l'issue sûre. */
  refuser?: string;
  /** Ton brique : le geste détruit ou ne se défait pas. */
  dur?: boolean;
};

/** L'ISSUE SÛRE A UN NOM PAR DÉFAUT, jamais « Annuler ». Annuler est un mot
    ambigu dans un atelier où l'on annule aussi des rendez-vous et des
    encaissements : « Annuler » sur une fenêtre qui parle d'un encaissement
    laisse croire qu'on annule l'encaissement, pas la question. */
export const REFUS_PAR_DEFAUT = 'Ne rien faire';

/** LES MOTS QU'UN BOUTON N'A PAS LE DROIT DE DIRE. Ils ne disent pas ce qui
    va se passer : on clique dessus comme on acquiesce. C'est précisément le
    défaut de la fenêtre du navigateur, qu'il serait absurde de reproduire. */
const TROP_VAGUES = ['ok', 'oui', 'non', 'confirmer', 'valider', 'continuer', 'accepter', 'annuler', 'd’accord', "d'accord"];

export const libelleTropVague = (mot: string): boolean =>
  TROP_VAGUES.includes((mot ?? '').trim().toLowerCase().replace(/\s+/g, ' '));

/** Les deux libellés, défauts appliqués. Un seul endroit décide, sinon deux
    écrans proposent deux issues différentes pour le même geste. */
export const libellesDeLaDemande = (d: Pick<DemandeDeLaMaison, 'accepter' | 'refuser'>): {
  accepter: string; refuser: string;
} => ({
  accepter: (d.accepter ?? '').trim(),
  refuser: (d.refuser ?? '').trim() || REFUS_PAR_DEFAUT,
});

/** CE QUE LA FENÊTRE ANNONCERA À VOIX HAUTE. Un lecteur d'écran lit le titre
    puis le corps ; sans cette composition, il annoncerait « dialogue » et
    rien d'autre, et la personne déciderait à l'aveugle. */
export const annonceDeLaDemande = (d: DemandeDeLaMaison): string =>
  [d.quoi, d.titre, d.dit, d.suite, d.scelle].map((s) => (s ?? '').trim()).filter(Boolean).join(' · ');
