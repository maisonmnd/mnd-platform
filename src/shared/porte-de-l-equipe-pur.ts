/* ══ LA PORTE DE L'ÉQUIPE · 17 novembre 2026 ═════════════════════════════
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » (Yéman, la consultation en affiches,
   arbitrage D).

   Trois pages sous /trone/ sont des outils de l'équipe : l'ancien tunnel
   « Consultation Souveraine » (consultation.html), la papeterie du bilan de
   séance (bilan.html) et celle du certificat de l'Académie
   (certificat.html). Le Trône les ouvre dans un onglet, sur la même
   origine, donc avec la même session : elles s'ouvrent à une session du
   personnel.

   Qui n'en est pas ne voit rien de l'outil : une ligne, et le chemin qui lui
   sert (la consultation en ligne, Ma Couronne, l'Académie). Jamais une
   explication.

   SANS SERVEUR (un poste de développement, tout en local), la porte est
   ouverte comme le Trône l'est : il n'y a ni session ni cliente.

   Pur, sans import : `porte-de-l-equipe.tsx` le branche sur la session,
   `scripts/verifie-les-autres-portes.mjs` l'éprouve (et `--prouve`). */

export type EtatDeLaPorteDeLEquipe = 'attente' | 'equipe' | 'dehors';

/** OÙ EN EST LA PORTE.
      · `serveur`    : un serveur est configuré (des sessions existent) ;
      · `chargement` : la session se lit encore ;
      · `session`    : quelqu'un est connecté ;
      · `pret`       : la fiche du personnel a répondu (jamais conclure d'une panne) ;
      · `personnel`  : ce compte est du personnel. */
export function etatDeLaPorteDeLEquipe(o: {
  serveur: boolean; chargement: boolean; session: boolean; pret: boolean; personnel: boolean;
}): EtatDeLaPorteDeLEquipe {
  if (!o.serveur) return 'equipe';
  if (o.chargement) return 'attente';
  if (!o.session) return 'dehors';
  if (!o.pret) return 'attente';
  return o.personnel ? 'equipe' : 'dehors';
}

/** Ce que lit celle qui n'est pas de l'équipe : une ligne, un chemin. */
export type SortieDeLaPorte = {
  /** La ligne. Jamais la raison de la porte fermée. */
  ligne: string;
  /** Le mot du lien. */
  mot: string;
  /** Le chemin, relatif à l'origine (aucun nom de domaine). */
  vers: string;
  /** Elle y est menée sans avoir à toucher le lien. */
  mene: boolean;
};

export type PageDeLEquipe = 'tunnel' | 'bilan' | 'certificat';

/** LES TROIS SORTIES. L'ancien tunnel mène à la consultation en ligne ; le
    bilan se lit dans Ma Couronne (la Maison l'y remet) ; un certificat se
    vérifie auprès de l'Académie. */
export const SORTIES_DE_LA_PORTE: Readonly<Record<PageDeLEquipe, SortieDeLaPorte>> = {
  tunnel: { ligne: 'La consultation se prend ici.', mot: 'Ma consultation', vers: '/consultation/', mene: true },
  bilan: { ligne: 'Votre bilan se lit dans Ma Couronne.', mot: 'Ma Couronne', vers: '/couronne/', mene: false },
  certificat: { ligne: 'Un certificat se vérifie auprès de l’Académie MND.', mot: 'Académie MND', vers: '/academie/', mene: false },
};

/** L'entrée du Trône, pour l'équipe qui n'est pas encore connectée sur ce poste. */
export const ENTREE_DU_TRONE = '/trone/';
