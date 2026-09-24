/* LE NOYAU PUR DES SAISONS — 18 septembre 2026.

   Ce module n'importe RIEN : ni store, ni synchronisation, ni Supabase.
   C'est ce qui lui permet d'être lu par une page PUBLIQUE du site, dont la
   règle est de s'ouvrir vite et de ne jamais télécharger la machinerie de
   l'ERP. Même partage que `agenda-pur` et `catalogue-pur`.

   `offers.ts` le réexporte, de sorte que le Trône et Ma Couronne continuent
   d'importer depuis un seul endroit. */

/** Le jour, dans la graphie des saisons. */
export const isoDuJour = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Écart en jours entre deux graphies ISO, du premier vers le second. */
export function joursEntre(depuisIso: string, versIso: string): number {
  const a = new Date(`${depuisIso}T00:00:00`).getTime();
  const b = new Date(`${versIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** L'offre est-elle dans sa saison ? SANS DATES, elle l'est toujours : c'est
    ce qui laisse intactes toutes les offres créées avant ce jour. */
export function dansLaSaison(o: { du?: string; au?: string }, now = new Date()): boolean {
  const j = isoDuJour(now);
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
}

/** LA VEILLE DE LA MAISON : une saison se présente trois semaines avant son
    premier jour. C'est une PROPOSITION et jamais un ordre, la Maison garde
    la main ; rien ne s'allume tout seul. */
export const FENETRE_PROPOSITION = 21;

/** L'état d'une offre AU REGARD DE SA SAISON, à ne pas confondre avec sa
    visibilité de l'instant. Une offre « en cours » est dans sa saison, ce qui
    ne dit pas qu'elle est visible à cette minute : la fenêtre jour et heure
    tranche cela, et c'est `offerLiveNow` qui la lit. Le Trône affiche les
    deux, pour ne jamais promettre « en ligne » ce qui ne l'est pas. */
export type EtatDOffre = 'cours' | 'venir' | 'activer' | 'dort' | 'passee';

export function etatDeLOffre(
  /* STRUCTUREL, ET JAMAIS UN TYPE EMPRUNTÉ : ce module ne connaît ni
     `InstantOffer` du Trône, ni `OffreDuSite` du site public. Il décrit la
     seule forme dont il a besoin, et les deux s'y reconnaissent. C'est ce
     qui lui permet de rester pur, et de servir les deux rives. */
  o: { active: boolean; du?: string; au?: string },
  now = new Date(),
  fenetre = FENETRE_PROPOSITION,
): EtatDOffre {
  const j = isoDuJour(now);
  if (o.au && j > o.au) return 'passee';
  if (o.active) return o.du && j < o.du ? 'venir' : 'cours';
  if (o.du && joursEntre(j, o.du) <= fenetre) return 'activer';
  return 'dort';
}

/* ══ LE CODE D'UNE OFFRE ════════════════════════════════════════════
   24 septembre 2026. « Il faut écrire remise de 10 % avec le code, du coup
   le code se remplit automatiquement lors de la réservation avec son nom,
   plus facile à suivre » (Yéman).

   POURQUOI UN CODE PLUTÔT QU'UNE REMISE SILENCIEUSE. Une remise qui
   s'applique toute seule s'applique et disparaît : un mois plus tard,
   personne ne peut dire ce que l'offre a fait venir. Un code se compte. Il
   se dit aussi à voix haute, sur une affiche ou dans un message, là où une
   mécanique invisible ne se dit pas.

   CE MODULE NE CONNAÎT NI LE TRÔNE NI LE SITE. Comme le reste de ce
   fichier, il décrit la seule forme dont il a besoin, et les deux rives s'y
   reconnaissent. C'est ce qui lui permet d'être lu par une page publique
   sans emporter la machinerie de l'ERP. */

/** Un code tient sur une ligne : au delà, ce n'est plus un code, c'est une
    phrase, et personne ne la retape. */
export const CODE_MAX = 16;

/** LA MÊME MAIN ÉCRIT « rentree 10 », « Rentree10 » et « RENTREE10 ».
    Les trois désignent la même offre : on refuse une remise pour une saison
    finie, jamais pour une majuscule. */
export const codeNormalise = (v: unknown): string =>
  String(v ?? '').replace(/\s+/g, '').toUpperCase().slice(0, CODE_MAX);

/* ── LE CODE SE FABRIQUE, IL NE S'ÉCRIT PAS ────────────────────────
   24 septembre 2026. « Le code ne doit pas être réécrit, il doit se
   reporter automatiquement. Quand une offre est créée son code se crée
   automatiquement » (Yéman).

   La faute était nette : un champ vide à remplir à la main se laisse vide.
   Son offre portait « −10 % » sur sa carte et aucun code derrière, et
   personne ne le lui disait avant que la cliente voie le prix plein.

   LA RÈGLE, en deux morceaux qu'on peut lire à voix haute : le premier mot
   qui PORTE du sens dans le titre, articles et accents ôtés, puis le
   pourcentage lu dans l'avantage. « La rentrée des couronnes » avec
   « −10 % » donne RENTREE10, qui est exactement le code écrit à la main
   dans la saison le matin même. Une règle qui retombe sur ce qu'une main
   avait choisi est une règle juste.

   LES SEPT SAISONS GARDENT LEURS CODES ÉCRITS : ROSE15 vaut mieux
   qu'OCTOBRE15, FEMME15 mieux que MOIS15. Une règle est là pour les offres
   qu'on invente un mardi, pas pour remplacer un choix meilleur. */

/** Les mots qui ne portent rien : ils feraient des codes qui ne disent
    rien, LAMAISON ou LESOFFRES. */
const MOTS_VIDES = new Set([
  'LE', 'LA', 'LES', 'UN', 'UNE', 'DES', 'DU', 'DE', 'AU', 'AUX', 'ET', 'OU',
  'POUR', 'SUR', 'DANS', 'PAR', 'AVEC', 'SANS', 'MON', 'MA', 'MES', 'NOS',
  'NOTRE', 'VOTRE', 'SON', 'SA', 'SES', 'CE', 'CETTE', 'L', 'D', 'A',
]);

/** Le titre, réduit à des lettres nues : les accents tombent, la
    ponctuation aussi. « La fête des mères » devient LA FETE DES MERES. */
const motsDuTitre = (titre: string): string[] =>
  String(titre ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

/** LE POURCENTAGE ANNONCÉ, s'il y en a un. « −10 % » rend 10 ; « 2 = 1 »
    ne rend rien, parce qu'un cadeau n'est pas un pourcentage et qu'un code
    NOEL2 mentirait sur ce qu'il fait.

    LE NOMBRE SE PREND ENTIER, ou pas du tout — corrigé le 24 septembre 2026,
    défaut trouvé par la session pair en éprouvant la chaîne d'un bout à
    l'autre. La forme d'avant cherchait un à deux chiffres suivis de « % » et
    attrapait donc la FIN d'un nombre plus long : « −7,5 % » rendait 5, et
    « −100 % » rendait 00. Une offre à 7,5 % se serait appelée EPIPHANIE5, et
    la carte aurait dit à la cliente un chiffre qui n'est pas la remise.

    Une décimale ne donne AUCUN chiffre plutôt qu'un chiffre approché : un
    code se lit à voix haute, et 7 pour 7,5 % est un petit mensonge qui se
    répète à chaque lecture. Le mot seul suffit alors. */
const pourcentDeLAvantage = (deal: string): string => {
  const m = /(?<![\d.,])(\d{1,3})(?![\d.,])\s*%/.exec(String(deal ?? ''));
  return m ? m[1] : '';
};

/** LE CODE D'UNE OFFRE, fabriqué depuis ce qu'elle dit déjà.

    `dejaPris` évite qu'une deuxième offre porte le code d'une première :
    deux offres au même code, c'est la première trouvée qui gagne, et
    laquelle dépend de l'ordre du tableau. On suffixe alors, sobrement.

    Sans titre lisible, rien n'est rendu : mieux vaut pas de code qu'un code
    qui ne veut rien dire et que personne ne retapera. */
export function codeDepuisLOffre(
  titre: string,
  deal = '',
  dejaPris: readonly string[] = [],
): string {
  const tous = motsDuTitre(titre);
  const mots = tous.filter((w) => !MOTS_VIDES.has(w));
  /* UN CODE ENGENDRÉ N'EST JAMAIS VIDE. Un titre fait d'articles, ou vide,
     donnerait « avec le code » suivi de rien sur la carte, et une chaîne
     vide n'est résolue par personne. On retombe sur le premier mot venu,
     fût-il un article, et à défaut sur un repli qui porte un nom. */
  const racine = (mots[0] ?? tous[0] ?? 'OFFRE').slice(0, 10);
  const pris = new Set(dejaPris.map((c) => codeNormalise(c)).filter(Boolean));
  const base = codeNormalise(racine + pourcentDeLAvantage(deal));
  if (!pris.has(base)) return base;
  for (let n = 2; n <= 99; n += 1) {
    const suite = codeNormalise(base.slice(0, CODE_MAX - String(n).length) + n);
    if (!pris.has(suite)) return suite;
  }
  return base;
}

export type OffreCodee = {
  active: boolean;
  du?: string;
  au?: string;
  code?: string;
  /** La remise réellement retirée, en pour cent. Absente pour un cadeau. */
  discountPct?: number;
  /** Les prestations que l'offre couvre. VIDE NE VEUT PAS DIRE « toutes » :
      une offre qui ne dit pas sur quoi elle porte ne retire rien, parce
      qu'un oubli de case ne doit jamais solder le catalogue entier. */
  serviceIds?: string[];
};

/** L'OFFRE QUE CE CODE DÉSIGNE, si elle court aujourd'hui. Rend `null` pour
    un code inconnu comme pour un code hors saison : c'est à l'écran de dire
    lequel des deux, avec les dates, parce qu'un refus muet passe pour une
    panne. */
export function offreDuCode<T extends OffreCodee>(
  offres: readonly T[],
  code: unknown,
  now = new Date(),
): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => o.active && codeNormalise(o.code) === c && dansLaSaison(o, now)) ?? null;
}

/** LE MÊME CODE, MAIS HORS DE SA SAISON. Sert uniquement à l'écrire :
    « ce code a couru du 1er au 30 septembre » vaut mieux que « inconnu ». */
export function offreDuCodePassee<T extends OffreCodee>(
  offres: readonly T[],
  code: unknown,
  now = new Date(),
): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => codeNormalise(o.code) === c && !(o.active && dansLaSaison(o, now))) ?? null;
}

export type LigneAPrix = {
  id: string;
  /** Le prix de la carte, en francs. Zéro quand il se dit au salon. */
  prixXof: number;
  /** Un prix FERME s'engage. Un devis ne s'engage pas, et un pourcentage
      n'a rien à mordre dessus. */
  ferme: boolean;
};

export type LigneRemisee = LigneAPrix & { net: number; remisee: boolean };

/** CE QUE LE CODE RETIRE, LIGNE À LIGNE, et jamais un total opaque : une
    cliente doit voir laquelle de ses prestations a bougé, sinon la surprise
    l'attend au comptoir.

    Une ligne n'est touchée que si TOUT est vrai : l'offre existe et court,
    elle porte un pourcentage, elle couvre cette prestation, et le prix est
    ferme. « GBÈJÍ™ Fidélité · Reprise & Shampoing Signature » est justement
    une reprise, donc couverte par le texte de l'offre de rentrée, mais son
    prix se dit au salon : rien ne peut en être déduit d'avance sans inventer
    un chiffre. */
export function lignesDuCode(
  lignes: readonly LigneAPrix[],
  offre: OffreCodee | null,
): LigneRemisee[] {
  const pct = Math.max(0, Math.min(90, Math.round(offre?.discountPct ?? 0)));
  const couvre = new Set(offre?.serviceIds ?? []);
  return lignes.map((l) => {
    const porte = pct > 0 && l.ferme && l.prixXof > 0 && couvre.has(l.id);
    return { ...l, net: porte ? Math.round(l.prixXof * (1 - pct / 100)) : l.prixXof, remisee: porte };
  });
}

/** Ce que le code a retiré en tout, et sur combien de lignes. */
export function ceQueLeCodeRetire(lignes: readonly LigneRemisee[]): { plein: number; net: number; retire: number; combien: number } {
  const plein = lignes.reduce((t, l) => t + l.prixXof, 0);
  const net = lignes.reduce((t, l) => t + l.net, 0);
  return { plein, net, retire: plein - net, combien: lignes.filter((l) => l.remisee).length };
}
