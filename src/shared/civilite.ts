/* ══ MADAME NAFFI — 2 octobre 2026 ═══════════════════════════════════════
   « Comment distinguer un Mr et une Mme et ajouter un préfixe devant le
   prénom des clients ? » (Yéman). Arbitrages tranchés au sélecteur :

     · la Maison écrit « Madame Naffi » : la civilité, puis le prénom ;
     · trois civilités sur la fiche : Madame, Mademoiselle, Monsieur ;
     · une fiche qui ne dit rien est une dame, comme pour les cartes (presque
       toutes les têtes de la Maison le sont) ;
     · la civilité vit dans les messages WhatsApp automatiques et dans ceux
       qu'on écrit depuis le Trône, pas sur les factures ni dans Ma Couronne.

   LA CIVILITÉ PREND LA SUITE DE `auMasculin`, qui ne servait qu'aux cartes :
   une fiche marquée au masculin avant ce jour est « Monsieur », et poser
   « Monsieur » remarque la fiche au masculin, pour que les cartes suivent.

   Les fonctions Edge recopient `appelDe` (elles ne lisent rien du dépôt) ;
   `verifie-civilite` tient les copies à l'identique. Pur. */

export type Civilite = 'madame' | 'mademoiselle' | 'monsieur';

export const CIVILITES: readonly { cle: Civilite; dit: string }[] = [
  { cle: 'madame', dit: 'Madame' },
  { cle: 'mademoiselle', dit: 'Mademoiselle' },
  { cle: 'monsieur', dit: 'Monsieur' },
];

const DIT: Record<Civilite, string> = { madame: 'Madame', mademoiselle: 'Mademoiselle', monsieur: 'Monsieur' };

type Porteur = { name?: string | null; civilite?: Civilite; auMasculin?: boolean } | null | undefined;

/** La civilité d'une fiche. Rien de dit : Madame. */
export const civiliteDe = (c: Porteur): Civilite =>
  (c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? 'monsieur' : 'madame');

/** Le prénom seul : le premier mot du nom. */
export const prenomSeul = (nom: string | null | undefined): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

/** COMMENT LA MAISON S'ADRESSE À ELLE : « Madame Naffi ». Sans nom, la
    civilité seule, jamais un blanc. `repli` sert quand la fiche manque mais
    qu'un nom est connu ailleurs (le rendez-vous, la demande du site). */
export const appelDe = (c: Porteur, repli?: string | null): string => {
  const mot = DIT[civiliteDe(c)];
  const prenom = prenomSeul(c?.name ?? repli);
  return prenom ? `${mot} ${prenom}` : mot;
};

/** Ce qu'on écrit sur la fiche quand la main choisit une civilité : les
    cartes, qui lisent `auMasculin`, suivent du même geste. */
export const ficheAvecCivilite = (civ: Civilite): { civilite: Civilite; auMasculin: true | undefined } =>
  ({ civilite: civ, auMasculin: civ === 'monsieur' ? true : undefined });
