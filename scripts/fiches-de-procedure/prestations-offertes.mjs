/* LES DEUX PRESTATIONS OFFERTES DU RITUEL SÓWÀ™ — 25 novembre 2026.

   « Crée, offertes, les prestations du catalogue qui manquent » (Yéman). Le
   Rituel Sówà™ promet une séance de contrôle offerte à J+7 et, pour les
   enfants, la coiffure protectrice Couronne Cocon, offerte. Aucune des deux
   n'avait de prestation : l'équipe ne pouvait pas les poser au carnet.

   OFFERTES : 0 F, prix fixe. Elles ne portent donc aucune remise à régler.

   ELLES NE SE RÉSERVENT PAS SEULES. Une prestation à 0 F ouverte sur le site
   se réserverait sans le rituel qui la donne. `reglage.mjs` les inscrit donc
   aux masques du site et de Ma Couronne (la Vitrine, où la Maison peut les
   recocher) : c'est l'équipe qui les pose, au premier rendez-vous. Le
   contrôle porte en plus sa fenêtre : de 1 à 2 semaines après la dernière
   venue, le Trône avertit en dehors.

   Durées : une décision de ce chantier (la Maison les corrige au Catalogue). */

export const ID_DU_RITUEL_SOWA = '1740l5ysxj';
export const ID_DU_CONTROLE_SOWA = 'sv-sowa-controle';
export const ID_DE_LA_COURONNE_COCON = 'sv-kids-couronne-cocon';

export const PRESTATIONS_OFFERTES = [
  {
    id: ID_DU_CONTROLE_SOWA,
    categoryId: 'cat-soins',
    name: 'Sówà™ · Le Contrôle à J+7',
    description: 'Sówà™ : le contrôle à J+7.\nSept jours après votre Rituel Sówà™, nous regardons de nouveau votre cuir chevelu et vos locks, et nous faisons la seconde application, pour nous assurer que tout est bien fini.\n\nVous en retirez : la certitude que le rituel a fait son œuvre.\n\nOffert avec le Rituel Sówà™.',
    palier: 'Fondation',
    priceXof: 0,
    hidePrice: false,
    priceMode: 'fixe',
    sessions: 1,
    master: 'Team',
    /* La seconde application s'y fait (15 minutes de pose, puis le lavage). */
    durationMin: 45,
    order: 10001,
    fenetreApresVenue: { deSemaines: 1, aSemaines: 2 },
  },
  {
    id: ID_DE_LA_COURONNE_COCON,
    categoryId: 'cat-mnd-kids',
    name: 'Couronne Cocon · la coiffure protectrice',
    description: 'La coiffure protectrice des petites têtes après un Rituel Sówà™ : les locks rassemblées et attachées près de la tête, sans tension. Offerte aux enfants avec le Rituel Sówà™.',
    palier: 'Fondation',
    priceXof: 0,
    hidePrice: false,
    priceMode: 'fixe',
    sessions: 1,
    master: 'Team',
    durationMin: 20,
    order: 100,
    reserveEnfants: true,
  },
];
