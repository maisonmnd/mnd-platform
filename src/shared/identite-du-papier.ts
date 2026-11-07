/* CE QUE LE PAPIER SAIT DE LA MAISON, SANS LA SYNCHRONISATION — 7 novembre 2026.

   « Pouvoir télécharger le PDF » d'un rendez-vous passé et réglé, sur
   maisonmnd.com/rdv/ (Yéman). pdf.ts lisait le nom qui signe, la devise et
   « est-ce bien la Maison ? » dans identite.ts, qui branche la
   synchronisation du Trône à son chargement : le site public, qui ne la
   charge jamais (la page « Régler » non plus), ne pouvait pas construire la
   facture sans elle.

   pdf.ts lit donc ces trois choses ICI. identite.ts les lui confie en se
   chargeant (son nom vivant, synchronisé, sa devise, sa règle) : au Trône,
   à Ma Couronne, rien ne change. Le site public, qui n'a rien confié, lit
   les valeurs par défaut d'identite.ts, recopiées ci-dessous et comparées
   au banc verifie-le-billet-regle. */

export type IdentiteDuPapier = {
  /** Le nom qui signe (le pied, la ligne légale). */
  nom: () => string;
  /** La devise entière, au pied de chaque papier. */
  devise: string;
  /** Ce nom est-il celui de la Maison (le verrou, le sceau, le tampon) ? */
  estLaMaison: (nom: unknown) => boolean;
};

/** Les valeurs par défaut d'identite.ts (DEFAULT_IDENTITY.nom, DEVISE_COMPLETE). */
export const IDENTITE_PAR_DEFAUT_DU_PAPIER = {
  nom: 'Maison MND',
  devise: 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là',
} as const;
/** L'ancien nom, sous toutes ses graphies (`corrigeLAncienNom`) : c'est la même Maison. */
const ANCIEN_NOM_DU_PAPIER = /^\s*l\s*[’']\s*atelier\s+mnd\s*$/i;

const PAR_DEFAUT: IdentiteDuPapier = {
  nom: () => IDENTITE_PAR_DEFAUT_DU_PAPIER.nom,
  devise: IDENTITE_PAR_DEFAUT_DU_PAPIER.devise,
  estLaMaison: (nom) => (ANCIEN_NOM_DU_PAPIER.test(String(nom ?? '')) ? IDENTITE_PAR_DEFAUT_DU_PAPIER.nom : String(nom ?? '')).trim().toLowerCase()
    === IDENTITE_PAR_DEFAUT_DU_PAPIER.nom.toLowerCase(),
};

let confiee: IdentiteDuPapier | null = null;
/** identite.ts, à son chargement : le nom vivant, la devise, la règle. */
export const confieLIdentiteAuPapier = (i: IdentiteDuPapier): void => { confiee = i; };
/** Ce que le papier lit : l'identité confiée, sinon celle par défaut. */
export const identiteDuPapier = (): IdentiteDuPapier => confiee ?? PAR_DEFAUT;
