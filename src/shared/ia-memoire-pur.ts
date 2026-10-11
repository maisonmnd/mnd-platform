/* LA MÉMOIRE DE LA MAISON — 11 octobre 2026.

   Cahier « Maison MND AI Operating System », § 18 : « L'IA ne doit jamais
   réinventer les informations déjà connues. Elle doit rechercher dans la
   mémoire avant de répondre ou de créer. »

   CE QUI EST ICI EST DÉJÀ VRAI AILLEURS. Chaque rubrique dit sa source, et
   le banc `verifie-le-centre-de-commande` relit ces sources : si la devise,
   le nom ou la palette changent là-bas, la mémoire crie avant de mentir.
   Les choix du 11 octobre 2026 (palette indigo, cuivre, ivoire ; devise
   « votre beauté est déjà là ») viennent de Yéman, au sélecteur, contre le
   cahier qui proposait l'or et le noir et « Vous êtes belle ».

   Les fondateurs ajoutent leurs propres notes au Trône (document
   `mnd_ia_memoire`) ; elles s'ajoutent à celle-ci, elles ne la réécrivent
   pas.

   MODULE PUR ET SANS IMPORT : la fonction `centre-de-commande` en porte une
   copie entre ses repères. */

export type Rubrique = { id: string; titre: string; source: string; faits: readonly string[] };

export const NOM_DE_LA_MAISON = 'Maison MND';
export const DEVISE_DE_LA_MAISON = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

export const PALETTE_DE_LA_MAISON: Record<string, string> = {
  indigo: '#1E2150',
  nuit: '#15173A',
  cuivre: '#B97A4A',
  'cuivre plein': '#9A6036',
  ivoire: '#F6F1E7',
  'sable cuivre': '#E7D7C2',
};

export const MEMOIRE: readonly Rubrique[] = [
  {
    id: 'marque', titre: 'La marque', source: 'src/shared/identite.ts ; choix du 11 octobre 2026',
    faits: [
      `Le nom est « ${NOM_DE_LA_MAISON} », toujours en entier dans une communication officielle ; « MND » seul n'est pas le nom de la Maison.`,
      `La devise est « ${DEVISE_DE_LA_MAISON} ». « Mi » dit vous et nous à la fois : la traduction est un choix, gardé tel quel.`,
      'Une maison béninoise, une maison boutique de soin et de transformation par les dreadlocks, à Cotonou.',
      'Contemporaine, raffinée, experte, accessible mais exclusive ; ancrée dans la culture béninoise, elle peut traverser les frontières et valorise la beauté des femmes (cahier du 11 octobre 2026).',
      'L’accroche du site : « Révélez ce que vous avez de plus beau. »',
    ],
  },
  {
    id: 'fondateurs', titre: 'Les fondateurs et l’histoire', source: 'src/apps/revelateur/contenu.ts (accueil, /brice-et-yeman/, /notre-histoire/)',
    faits: [
      'Brice et Yéman Ahouansou ont fondé la Maison ; ils en restent les directeurs et les seuls décideurs.',
      'Le savoir-faire est né sur une terrasse d’Akpakpa, à Cotonou ; la Maison existe depuis 2010.',
      'Le récit complet vit sur la page « Notre histoire » ; il ne se résume pas en publicité, et le mot « Kolétan » n’y sert jamais.',
    ],
  },
  {
    id: 'methode', titre: 'La méthode et les services', source: 'src/shared/catalog.ts ; src/apps/revelateur/contenu.ts',
    faits: [
      'Quatre temps : Purifier, Nourrir, Sceller, Couronner.',
      'Les portes : Première Couronne (création, par une consultation), Réparation (par une consultation), Entretien, Soins, MND Kids, Couronne à domicile, et l’Académie MND pour les formations.',
      'Les prix vivent au catalogue du Trône ; aucun agent n’en invente, et aucune campagne n’affiche de prix.',
    ],
  },
  {
    id: 'visuel', titre: 'L’identité visuelle', source: 'src/ds/tokens/colors.css ; CLAUDE.md ; choix du 11 octobre 2026',
    faits: [
      `La palette : ${Object.entries(PALETTE_DE_LA_MAISON).map(([n, h]) => `${n} ${h}`).join(', ')}.`,
      'Les surfaces sombres sont indigo, jamais l’obsidienne ni le noir profond ; le cuivre est un accent.',
      'Cormorant Garamond et Jost, aucun emoji, des coins de 2 à 4 px, des fondus sans rebond.',
      'Le verrou couché (pictogramme et MAISON MND) signe les documents ; il se compose, il ne se redessine pas.',
    ],
  },
  {
    id: 'ecriture', titre: 'Les règles d’écriture', source: 'mémoire des fondateurs ; docs/site-revelateur/decisions.md',
    faits: [
      'Jamais le mot « salon » : on dit « la Maison ».',
      'Pas de tiret cadratin dans un texte affiché ; une virgule à la place.',
      'Toujours l’année sur une date donnée à une cliente.',
      'Une cliente se nomme par sa civilité et son prénom (« Madame Awa ») ; « Madame » par défaut.',
      'Aucun fait, chiffre, témoignage ni disponibilité inventés.',
    ],
  },
  {
    id: 'images', titre: 'Les photos et les personnes', source: 'docs/site-revelateur/photos.md ; src/shared/droit-image.ts',
    faits: [
      'Aucune photo ne se publie sans l’accord inscrit au registre des photos.',
      'Aucune cliente n’illustre un article qui nomme un défaut des cheveux.',
      'Le visage d’un enfant demande l’accord écrit de son parent.',
    ],
  },
  {
    id: 'clientes', titre: 'Les données des clientes', source: 'choix du 11 octobre 2026 ; page « Politique de données »',
    faits: [
      'Aucun numéro, aucune adresse, aucun nom complet de cliente ne sort du Trône vers un agent : prénom et initiale seulement.',
      'Une demande sans suite s’efface après deux ans, une fiche cinq ans après la dernière venue ; les factures se gardent dix ans (OHADA).',
      'Prévenir au moins 24 heures avant pour déplacer un rendez-vous, sans frais.',
    ],
  },
  {
    id: 'maison', titre: 'La Maison, en droit et en contact', source: 'src/shared/registre.ts ; src/apps/revelateur/contenu.ts',
    faits: [
      'ETS « MAISON MND », RCCM RB/COT/26 A 120676 ; l’employeur reste ACIA 1 jusqu’à la bascule décidée avec le comptable.',
      'Site : maisonmnd.com ; courriel : contact@maisonmnd.com ; téléphone et WhatsApp : +229 01 51 99 77 99.',
    ],
  },
  {
    id: 'agents', titre: 'Les agents et leurs limites', source: 'cahier du 11 octobre 2026 ; choix de Yéman au sélecteur',
    faits: [
      'Yéman ou Brice valident ; un agent prépare, il ne décide pas.',
      'Ce qui est « décision humaine » (contrat, paiement, recrutement, identité, communication sensible) ne part jamais sans un fondateur.',
      'Les appels automatiques à Claude ont un plafond de 10 $ par mois ; au-delà, les agents s’arrêtent et le disent.',
      'Aucune intégration n’est simulée : ce qui n’est pas relié (Meta, TikTok, YouTube) se fait à la main.',
    ],
  },
];

/** La mémoire en texte, pour la consigne d'un agent, avec les notes des
    fondateurs à la suite. */
export function memoireEnTexte(notes: readonly { rubrique?: string; texte: string }[] = []): string {
  const base = MEMOIRE.map((r) => [`## ${r.titre}`, ...r.faits.map((f) => `- ${f}`)].join('\n')).join('\n\n');
  const ajouts = notes.filter((n) => n.texte.trim()).map((n) => `- ${n.rubrique ? `[${n.rubrique}] ` : ''}${n.texte.trim()}`);
  return ajouts.length ? `${base}\n\n## Notes des fondateurs\n${ajouts.join('\n')}` : base;
}
