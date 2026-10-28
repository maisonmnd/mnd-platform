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
/** Devant le prénom, dans les messages. */
export const ABREGE: Record<Civilite, string> = { madame: 'Mme', mademoiselle: 'Mlle', monsieur: 'M.' };

type Porteur = { name?: string | null; civilite?: Civilite; auMasculin?: boolean } | null | undefined;

/** La civilité d'une fiche. Rien de dit : Madame. */
export const civiliteDe = (c: Porteur): Civilite =>
  (c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? 'monsieur' : 'madame');

/** Le prénom seul : le premier mot du nom. */
export const prenomSeul = (nom: string | null | undefined): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

/** COMMENT LA MAISON S'ADRESSE À ELLE : « Madame Naffi ». Sans nom, la
    civilité seule, jamais un blanc. `repli` sert quand la fiche manque mais
    qu'un nom est connu ailleurs (le rendez-vous, la demande du site).

    LA CIVILITÉ INCONNUE NE SE SUPPOSE PLUS (13 octobre 2026) : « revoir la
    dénomination des clients », un monsieur recevait « Madame » (Yéman,
    au sélecteur : le prénom seul quand la civilité est inconnue). Une
    fiche muette dit « Ola » ; rien de connu du tout, « Madame, Monsieur ».
    `civiliteDe` garde Madame pour les cartes, qui veulent un genre.

    ABRÉGÉE DEVANT LE PRÉNOM (28 octobre 2026, Yéman au sélecteur : « dire
    Mr ou Mme avant le prénom ») : « M. Jean-Luc », « Mme Shadé »,
    « Mlle Grace ». Seule, sans prénom, elle s'écrit en entier : « Bonjour
    Madame ». */
export const appelDe = (c: Porteur, repli?: string | null): string => {
  const prenom = prenomSeul(c?.name ?? repli);
  const connue = (!!c?.civilite && !!DIT[c.civilite]) || !!c?.auMasculin;
  if (!connue) return prenom || 'Madame, Monsieur';
  const civ = civiliteDe(c);
  return prenom ? `${ABREGE[civ]} ${prenom}` : DIT[civ];
};

/** LA CIVILITÉ NOTÉE, ou rien : jamais le Madame des cartes. Ce que les
    boutons d'une fiche montrent allumé. */
export const civiliteNotee = (c: Porteur): Civilite | undefined =>
  (c?.civilite && DIT[c.civilite] ? c.civilite : c?.auMasculin ? 'monsieur' : undefined);

/** UNE FICHE MUETTE : rien de noté, ses messages disent le prénom seul. */
export const estMuette = (c: Porteur): boolean => !civiliteNotee(c);

/** LES CIVILITÉS À POSER (28 octobre 2026) : les fiches données, dans
    l'ordre du tri. Un rendez-vous à venir d'abord, le plus proche en tête
    (l'Assistant lui écrit bientôt) ; puis la venue la plus récente ; puis le
    nom. `avecNumero` : seulement celles qu'un message peut joindre. */
export function civilitesAPoser<C extends { id: string; name?: string | null; phone?: string | null }>(o: {
  fiches: readonly C[];
  prochainRdv: ReadonlyMap<string, string>;
  derniereVenue: ReadonlyMap<string, string>;
  avecNumero: boolean;
}): C[] {
  return o.fiches
    .filter((c) => !o.avecNumero || !!c.phone?.trim())
    .slice()
    .sort((a, b) => {
      const ra = o.prochainRdv.get(a.id); const rb = o.prochainRdv.get(b.id);
      if (ra && rb && ra !== rb) return ra.localeCompare(rb);
      if (!!ra !== !!rb) return ra ? -1 : 1;
      const va = o.derniereVenue.get(a.id) ?? ''; const vb = o.derniereVenue.get(b.id) ?? '';
      if (va !== vb) return vb.localeCompare(va);
      return (a.name ?? '').localeCompare(b.name ?? '', 'fr');
    });
}

/** Ce qu'on écrit sur la fiche quand la main choisit une civilité : les
    cartes, qui lisent `auMasculin`, suivent du même geste. */
export const ficheAvecCivilite = (civ: Civilite): { civilite: Civilite; auMasculin: true | undefined } =>
  ({ civilite: civ, auMasculin: civ === 'monsieur' ? true : undefined });
