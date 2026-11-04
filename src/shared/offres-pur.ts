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
  id?: string;
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
  /** LES JOURS DE LA VENUE (2 novembre 2026), voir plus bas : posés, l'offre
      ne vaut que pour un rendez-vous qui tombe ces jours-là. */
  joursDeLaVenue?: string[];
  /** LES PLACES LIMITÉES (4 novembre 2026), voir plus bas : le nombre de
      places par jour de la venue. Absent ou nul, l'offre court comme avant. */
  placesParJour?: number;
  /** Seulement un jour où personne d'autre n'a réservé. */
  jourVideSeulement?: boolean;
  /** Combien de jours à l'avance les places s'ouvrent. Absent : sans borne. */
  horizonJours?: number;
};

/* ══ LE JOUR DE LA VENUE — 2 novembre 2026 ══════════════════════════
   « Le mercredi de la Maison » (maquette « Remplir les fauteuils », validée
   par Yéman ce jour : « construis »). Le mercredi est le jour le plus vide
   (11 % des fauteuils, de septembre à novembre 2026) ; l'offre doit faire
   venir CE jour-là.

   JUSQU'ICI UNE OFFRE SE MONTRAIT LE JOUR OÙ L'ON REGARDE (`days`, et la
   saison jugée sur aujourd'hui). Une « offre du mercredi » vue un mercredi
   pour une venue le samedi se serait appliquée au samedi. `joursDeLaVenue`
   dit l'autre chose : le jour où elle VIENT. Posé, il juge la date du
   rendez-vous, et la saison se lit sur cette date-là ; le jour où l'on
   regarde ne compte plus. `days` garde son sens d'affichage.

   UNE OFFRE SANS CE CHAMP NE CHANGE PAS D'UN CHEVEU : c'est ce qui laisse
   RENTREE10 et ROSE15 telles qu'elles ont couru. */

/** Les jours, dans la graphie des offres, lundi d'abord. La même liste que
    `OFFER_DAYS` (offers.ts), que ce module pur ne peut pas importer ; le banc
    du mercredi exige qu'elles restent égales. */
export const JOURS_DES_OFFRES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

/** LE JOUR DE LA SEMAINE D'UNE DATE ISO, dans cette graphie. Lu à midi UTC
    sur la seule date : aucun fuseau, ni celui du téléphone ni celui d'un
    serveur, ne fait glisser un mercredi au mardi. Une date illisible ne
    rend rien, plutôt qu'un jour deviné. */
export function jourDeLaSemaine(dateIso: unknown): string | null {
  const s = String(dateIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return JOURS_DES_OFFRES[(d.getUTCDay() + 6) % 7];
}

/** L'offre porte-t-elle sur le jour de la venue ? */
export const porteSurLeJourDeLaVenue = (o: { joursDeLaVenue?: readonly string[] } | null | undefined): boolean =>
  (o?.joursDeLaVenue?.length ?? 0) > 0;

/** LA VENUE TOMBE-T-ELLE UN DE SES JOURS, DANS SA SAISON ? La saison se lit
    sur la date de la venue : le mercredi 4 novembre 2026 réservé le 2 en
    profite, le mercredi 6 janvier 2027 réservé en décembre non. Une offre
    sans jours de la venue répond toujours oui : elle garde sa règle d'hier. */
export function laVenueTombeBien(
  o: { joursDeLaVenue?: readonly string[]; du?: string; au?: string },
  dateIso: string | null | undefined,
): boolean {
  if (!porteSurLeJourDeLaVenue(o)) return true;
  const jour = jourDeLaSemaine(dateIso);
  if (!jour || !o.joursDeLaVenue!.includes(jour)) return false;
  const j = String(dateIso).slice(0, 10);
  if (o.du && j < o.du) return false;
  if (o.au && j > o.au) return false;
  return true;
}

/** L'OFFRE COURT-ELLE POUR CETTE VENUE ? Sans jours de la venue, c'est la
    saison d'aujourd'hui, comme avant. Avec, c'est la date de la venue :
    `venueIso` absent veut dire « aujourd'hui » (le ticket d'une cliente de
    passage), `null` veut dire « pas encore de jour choisi », et une offre
    du jour de la venue ne court alors pour personne. */
export function courtPourLaVenue(
  o: { joursDeLaVenue?: readonly string[]; du?: string; au?: string },
  now = new Date(),
  venueIso?: string | null,
): boolean {
  if (!porteSurLeJourDeLaVenue(o)) return dansLaSaison(o, now);
  return laVenueTombeBien(o, venueIso === undefined ? isoDuJour(now) : venueIso);
}

/** L'OFFRE QUE CE CODE DÉSIGNE, si elle court aujourd'hui. Rend `null` pour
    un code inconnu comme pour un code hors saison : c'est à l'écran de dire
    lequel des deux, avec les dates, parce qu'un refus muet passe pour une
    panne.

    `venueIso` (2 novembre 2026) : le jour du rendez-vous, pour une offre qui
    porte sur le jour de la venue. Les offres sans ce champ ne le lisent pas. */
export function offreDuCode<T extends OffreCodee>(
  offres: readonly T[],
  code: unknown,
  now = new Date(),
  venueIso?: string | null,
): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => o.active && codeNormalise(o.code) === c && courtPourLaVenue(o, now, venueIso)) ?? null;
}

/** LE MÊME CODE, MAIS HORS DE SA SAISON. Sert uniquement à l'écrire :
    « ce code a couru du 1er au 30 septembre » vaut mieux que « inconnu ».
    Une offre du jour de la venue y tombe aussi quand la venue n'est pas un
    de ses jours : « ce code vaut pour un rendez-vous le mercredi ». */
export function offreDuCodePassee<T extends OffreCodee>(
  offres: readonly T[],
  code: unknown,
  now = new Date(),
  venueIso?: string | null,
): T | null {
  const c = codeNormalise(code);
  if (!c) return null;
  return offres.find((o) => codeNormalise(o.code) === c && !(o.active && courtPourLaVenue(o, now, venueIso))) ?? null;
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

/* LE CODE D'UNE OFFRE VAUT AUSSI À LA CAISSE — 1er octobre 2026.

   « Les codes de réductions ROSE15 ne marchent pas sur le Trône » (Yéman). La
   case « Code de promotion » de la caisse ne connaissait que les codes
   NOMINATIFS (un code, une tête, 48 heures). Le code d'une OFFRE, écrit sur
   la carte du site et honoré par la réservation en ligne, y passait pour
   inconnu : la cliente qui venait sans avoir réservé en ligne perdait sa
   remise au comptoir, devant tout le monde.

   La caisse lit donc les deux. Et elle applique l'offre avec la règle du
   site, la même fonction : seules les prestations que l'offre couvre
   bougent, au pourcentage de l'offre, ligne à ligne. */
export function remiseDeLOffreSurLeTicket(
  offre: OffreCodee | null,
  lignes: readonly { serviceId: string; montantXof: number }[],
): { retire: number; combien: number } {
  const r = ceQueLeCodeRetire(lignesDuCode(
    lignes.map((l) => ({ id: l.serviceId, prixXof: Math.max(0, Math.round(l.montantXof)), ferme: true })),
    offre,
  ));
  return { retire: r.retire, combien: r.combien };
}

/* ══ LA REMISE DU COMPTOIR S'ÉCRIT AU RENDEZ-VOUS — 2 octobre 2026 ═════
   « J'ai passé ce paiement dans l'encaissement et il y avait la remise de
   ROSE15, la facture est soldée, mais quand je reviens dans le rendez-vous
   depuis le Carnet elle reste devoir 12 000 F » (Yéman).

   Le comptoir retirait la remise du ticket et n'inscrivait au rendez-vous que
   la somme encaissée : 68 000 F reçus pour un rituel resté à 80 000 F, donc
   12 000 F « dus » que personne ne doit. Une remise accordée au comptoir est
   une remise sur le rituel : elle s'écrit sur lui, du même geste.

   DEUX BORNES. Jamais plus que ce que le comptoir a réellement retiré aux
   prestations ; jamais plus que ce qui restait dû après l'encaissement (un
   rendez-vous qui portait déjà sa propre remise ne la reçoit pas deux fois). */
export function remiseDuComptoirAuRendezVous(e: {
  /** Les prestations du ticket, avant toute remise du comptoir. */
  brutDuRituelXof: number;
  /** Ce que le ticket encaisse pour ces prestations. */
  encaisseXof: number;
  /** Ce que le rendez-vous devait encore AVANT ce ticket. */
  resteAvantXof: number;
}): number {
  const retire = Math.max(0, Math.round(e.brutDuRituelXof) - Math.round(e.encaisseXof));
  const resteApres = Math.max(0, Math.round(e.resteAvantXof) - Math.round(e.encaisseXof));
  return Math.min(retire, resteApres);
}

/** LA REMISE D'UNE FACTURE QUE SON RENDEZ-VOUS N'A PAS REÇUE. Pour les rituels
    encaissés au comptoir AVANT la règle ci-dessus : la pièce porte la remise et
    son libellé (« Offre … · ROSE15 », « Promotion … »), le rendez-vous non.
    Rend ce qu'il faut reporter, ou rien. Une pièce sans libellé de remise ne
    dit pas qu'un code a été honoré : on ne devine pas.

    CE QUE LE RENDEZ-VOUS A DÉJÀ REÇU — 10 octobre 2026, relecture. La fonction
    ne regardait que le reste dû : un rendez-vous déjà remisé par le comptoir
    (80 000 F encaissés 68 000 F avec ROSE15, `discountXof` à 12 000 F) à qui
    l'on ajoutait une prestation de 10 000 F se voyait proposer d'effacer ces
    10 000 F, une vraie dette. Et la pièce « Remise famille » de l'écran
    d'encaissement porte une remise que le rendez-vous a TOUJOURS reçue (elle
    vient de lui) : la reporter la comptait deux fois. Désormais :
    les pièces « Remise famille » ne se reportent jamais ; les remises des
    pièces s'additionnent ; on n'en reporte que ce qui manque encore au
    rendez-vous (`remiseDejaSurLeRdvXof`, son `discountXof`), borné au reste
    dû. Un report déjà fait ne se propose donc plus. */
export const LIBELLE_REMISE_FAMILLE = 'Remise famille';
export function remiseDeFactureAReporter(e: {
  resteDuXof: number;
  /** Ce que le rendez-vous porte déjà en remise en francs (`discountXof`). */
  remiseDejaSurLeRdvXof: number;
  factures: readonly { number?: string; discountLabel?: string; globalDiscountXof?: number }[];
}): { xof: number; piece: string; libelle: string } | null {
  const reste = Math.max(0, Math.round(e.resteDuXof));
  if (reste <= 0) return null;
  const remisees = e.factures.filter((f) => !!f.discountLabel && f.discountLabel !== LIBELLE_REMISE_FAMILLE
    && Math.round(f.globalDiscountXof ?? 0) > 0);
  if (remisees.length === 0) return null;
  const surLesPieces = remisees.reduce((n, f) => n + Math.round(f.globalDiscountXof ?? 0), 0);
  const manque = surLesPieces - Math.max(0, Math.round(e.remiseDejaSurLeRdvXof ?? 0));
  if (manque <= 0) return null;
  return {
    xof: Math.min(reste, manque),
    piece: remisees.map((f) => f.number ?? '').filter(Boolean).join(', '),
    libelle: [...new Set(remisees.map((f) => f.discountLabel as string))].join(' ; '),
  };
}

/** LA REMISE DU COMPTOIR S'ÉCRIT AVEC SON MARQUEUR — 10 octobre 2026. Une
    remise du comptoir (code honoré à la Caisse, report d'une pièce) s'ajoute à
    `discountXof` ET à `remiseDuComptoirXof`, pour que l'argent rendu sache
    ce qu'il doit reprendre. Rend les champs à écrire, rien pour une remise
    nulle. */
export function remiseDuComptoirEcrite(
  a: { discountXof?: number; remiseDuComptoirXof?: number },
  remiseXof: number,
): { discountXof?: number; remiseDuComptoirXof?: number } {
  const r = Math.max(0, Math.round(remiseXof));
  if (r <= 0) return {};
  return { discountXof: (a.discountXof ?? 0) + r, remiseDuComptoirXof: (a.remiseDuComptoirXof ?? 0) + r };
}

/** LA REMISE DU COMPTOIR S'EN VA AVEC L'ARGENT — 10 octobre 2026, relecture.
    Annuler l'encaissement, ou supprimer la dernière pièce, supprime la pièce
    qui portait « Offre … · ROSE15 » : rien ne justifie plus les 12 000 F de
    remise écrits au rendez-vous, et le prochain encaissement se faisait
    sans code à 68 000 F au lieu de 80 000 F. On retire le marqueur de
    `discountXof` (jamais sous zéro), puis le marqueur. La remise famille et
    la remise manuelle de la fenêtre restent. Rien sans marqueur. */
export function remiseDuComptoirRendue(
  a: { discountXof?: number; remiseDuComptoirXof?: number },
): { discountXof?: number; remiseDuComptoirXof?: number } {
  if (a.remiseDuComptoirXof === undefined) return {};
  const reste = Math.max(0, Math.round(a.discountXof ?? 0) - Math.max(0, Math.round(a.remiseDuComptoirXof)));
  return { discountXof: reste > 0 ? reste : undefined, remiseDuComptoirXof: undefined };
}

const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jourDit = (iso?: string): string => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const j = Number(iso.slice(8, 10));
  return `${j === 1 ? '1er' : j} ${MOIS_DITS[Number(iso.slice(5, 7)) - 1]}`;
};
/** « 31 décembre 2026 » : une date dite à une cliente porte son année. */
const jourDitAvecAn = (iso?: string): string => {
  const d = jourDit(iso);
  return d ? `${d} ${String(iso).slice(0, 4)}` : '';
};
const JOURS_EN_TOUTES_LETTRES: Record<string, string> = {
  Lun: 'lundi', Mar: 'mardi', Mer: 'mercredi', Jeu: 'jeudi', Ven: 'vendredi', Sam: 'samedi', Dim: 'dimanche',
};
/** « le mercredi », « le mardi ou le mercredi », dans l'ordre de la semaine. */
export const lesJoursDits = (jours: readonly string[]): string => {
  const dits = JOURS_DES_OFFRES.filter((j) => jours.includes(j)).map((j) => `le ${JOURS_EN_TOUTES_LETTRES[j]}`);
  if (dits.length <= 1) return dits[0] ?? '';
  return `${dits.slice(0, -1).join(', ')} ou ${dits[dits.length - 1]}`;
};

/** POURQUOI CE CODE D'OFFRE NE VAUT PAS AUJOURD'HUI, dit avec ses dates : « inconnu »
    ferait accuser la caisse, « ce code vaut du 1er au 31 octobre » se discute. */
export function pourquoiLOffreNeCourtPas(o: OffreCodee, now = new Date(), venueIso?: string | null): string {
  if (!o.active) return 'Cette offre existe, mais elle n’est pas activée.';
  /* LE JOUR DE LA VENUE SE DIT AVEC SES JOURS ET SON ANNÉE (2 novembre 2026) :
     « ce code vaut pour un rendez-vous le mercredi, jusqu'au 31 décembre
     2026 » se comprend au comptoir comme sur le site. */
  if (porteSurLeJourDeLaVenue(o)) {
    const quand = lesJoursDits(o.joursDeLaVenue ?? []);
    const borne = o.au ? `, jusqu’au ${jourDitAvecAn(o.au)}` : '';
    const venue = venueIso === undefined ? isoDuJour(now) : venueIso;
    if (venue && o.du && venue.slice(0, 10) < o.du) return `Ce code vaut pour un rendez-vous ${quand} à partir du ${jourDitAvecAn(o.du)}${borne}.`;
    if (venue && o.au && venue.slice(0, 10) > o.au) return `Ce code valait pour un rendez-vous ${quand}, jusqu’au ${jourDitAvecAn(o.au)}.`;
    return `Ce code vaut pour un rendez-vous ${quand}${borne}.`;
  }
  const jour = isoDuJour(now);
  if (o.du && jour < o.du) return `Ce code vaudra à partir du ${jourDit(o.du)}.`;
  if (o.au && jour > o.au) return `Ce code a couru jusqu’au ${jourDit(o.au)}.`;
  return 'Ce code ne court pas aujourd’hui.';
}

/* CE QUI SORT SUR LE TROTTOIR — 24 septembre 2026. La règle vivait dans
   `maison.ts` (navigateur) ; la construction du site la lit aussi désormais,
   pour écrire les offres dans la page avant qu'un seul script ne tourne. Une
   seule règle, deux lecteurs : seules les offres ACTIVÉES sortent, et une
   offre sans dates ne sort que si la Maison l'a cochée « vitrine ». */
export function offresDuTrottoir<T extends { active?: boolean; du?: string; au?: string; vitrine?: boolean }>(liste: unknown): T[] {
  if (!Array.isArray(liste)) return [];
  return (liste as T[]).filter((o) => !!o && !!o.active && (!!o.du || !!o.au || !!o.vitrine));
}

/* ══ L'OFFRE QUI SE POSE D'ELLE-MÊME SUR UN RENDEZ-VOUS DU MERCREDI ═════
   2 novembre 2026. « −15 % sur le rituel posé un mercredi, code MERCREDI15,
   jusqu'au 31 décembre 2026 », « hors formules et abonnements », « ne
   s'ajoute à aucun autre code », « partout : le site, Ma Couronne, et le
   comptoir qui l'applique » (arbitrages 3 et 4, tranchés ce jour).

   UNE SEULE RÈGLE POUR QUATRE PORTES. Le site, Ma Couronne, la fenêtre du
   rendez-vous au Trône et la Caisse la lisent ici ; le bloc « Son prochain
   rituel » de la Caisse, qui pose un rendez-vous, s'y branchera de même
   (`offreDuJourDeLaVenue` puis `poseLOffreDuJour`). Le serveur du site
   (demande-submit) la recopie, confrontée à celle-ci par son banc.

   LE CODE SE POSE, IL NE SE DEVINE PAS AU COMPTOIR : un rendez-vous du
   mercredi porte `codeOffre` et ses remises de ligne exactement comme le
   site les pose depuis le 24 septembre 2026 ; « Ce que ça rapporte » le
   compte comme les autres. */

/* ══ LES PLACES LIMITÉES — 4 novembre 2026 ═══════════════════════════════
   « Quand il y a eu trois réservations qui ont utilisé la remise, ça bloque,
   ça disparaît… C'est comme un décompte… il faut vite booker. Il faut
   écrire : Remise : il reste une place » (Yéman), puis, au sélecteur et
   dans la maquette « Places limitées » (AhFRNqiggFoaiR725iKSQe, « construis ») :
   du mardi au vendredi, jamais le samedi, seulement un jour vide, trois
   places par jour, les jours des 14 jours à venir ; une réservation au plein
   tarif ce jour-là ferme les places restantes ; une place prise est gardée ;
   jamais pour une tête aux prix convenus, abonnée, ni qui a déjà une remise.
   Les jours, le nombre de places et l'horizon sont des RÉGLAGES de l'offre
   (Système › Paramètres), jamais des constantes : rien ici ne les suppose.

   Le 4 novembre 2026, un mercredi de six rendez-vous avait donné −15 % à
   chaque shampoing : une remise faite pour remplir un jour vide offerte à qui
   venait de toute façon. Ce module compte AVANT de remiser. */

/** L'offre se compte-t-elle en places ? */
export const estAPlaces = (o: { placesParJour?: number } | null | undefined): boolean =>
  Math.floor(o?.placesParJour ?? 0) > 0;

/** Ce qui occupe un jour, pour une offre à places : les places déjà prises
    avec elle, et les autres rendez-vous. */
export type OccupationDuJour = { prises: number; autres: number };

/** Un rendez-vous tel que le compte des places le lit. */
export type RdvACompter = {
  id?: string; date?: string; status?: string; branchId?: string; offreId?: string; codeOffre?: string;
};

/** L'OCCUPATION D'UN JOUR : les rendez-vous non annulés de la maison ce
    jour-là, celui qu'on relit ôté (`saufId`). Une place prise porte
    l'identifiant de l'offre, ou à défaut son code. */
export function occupationDuJour(
  offre: { id?: string; code?: string },
  rdvs: readonly RdvACompter[],
  dateIso: string,
  e: { branchId?: string; saufId?: string } = {},
): OccupationDuJour {
  const code = codeNormalise(offre.code);
  let prises = 0;
  let autres = 0;
  for (const r of rdvs) {
    if (!r || String(r.date ?? '').slice(0, 10) !== dateIso || r.status === 'annulé') continue;
    if (e.saufId && r.id === e.saufId) continue;
    if (e.branchId && r.branchId && r.branchId !== e.branchId) continue;
    const sienne = (!!offre.id && r.offreId === offre.id) || (!!code && codeNormalise(r.codeOffre) === code);
    if (sienne) prises++; else autres++;
  }
  return { prises, autres };
}

/** LES PLACES QUI RESTENT CE JOUR-LÀ. `null` : l'offre ne concerne pas ce
    jour (éteinte, hors de ses jours ou de sa saison, passé, au-delà de son
    horizon, ou occupation inconnue). `0` : le jour est pris (plus de place,
    ou plus vide). Sinon, le nombre à dire. */
export function placesRestantes(
  o: OffreCodee,
  dateIso: string | null | undefined,
  occ: OccupationDuJour | null | undefined,
  aujourdhui: string,
): number | null {
  if (!o?.active || !estAPlaces(o) || !occ || !dateIso) return null;
  const j = String(dateIso).slice(0, 10);
  if (!laVenueTombeBien(o, j) || j < aujourdhui) return null;
  const horizon = Math.floor(o.horizonJours ?? 0);
  if (horizon > 0 && joursEntre(aujourdhui, j) > horizon) return null;
  if (o.jourVideSeulement && occ.autres > 0) return 0;
  return Math.max(0, Math.floor(o.placesParJour as number) - occ.prises);
}

/** LE DÉCOMPTE, tel qu'il s'écrit partout. */
export const ditLesPlaces = (n: number): string =>
  n === 1 ? 'Remise : il reste une place' : `Remise : il reste ${n} places`;

/* UNE SEULE REMISE — 4 novembre 2026. « Quand il y a déjà des prix convenus,
   des abonnements ou des remises, il ne faut pas refaire une remise, quelle
   que soit sa nature, pour les clients » (Yéman). La remise famille comprise :
   une tête aux prix convenus ou abonnée ne la prend pas non plus. */
export const remiseFamilleDeLaTete = (pct: number, tete: { prixConvenus?: boolean; abonnee?: boolean }): number =>
  tete.prixConvenus || tete.abonnee ? 0 : Math.max(0, Math.round(pct));

/** Un geste qui ne prend AUCUNE remise, d'aucune sorte, famille comprise :
    le Rituel Sówà™ (« aucune remise », Yéman, 4 novembre 2026), marqué
    `sansRemise` au catalogue plutôt que nommé ici. */
export const gesteSansRemise = (s: { sansRemise?: boolean } | null | undefined): boolean => !!s?.sansRemise;

/** Ce qu'on sait du rendez-vous pour juger l'offre du jour de sa venue. */
export type VenueAJuger = {
  /** La maison du rendez-vous ; une offre sans branche vaut partout. */
  branchId?: string;
  /** Le jour du rendez-vous (ISO). Sans jour, aucune offre de ce genre. */
  dateIso: string | null | undefined;
  /** Ses gestes, dans l'ordre du rendez-vous. */
  serviceIds: readonly string[];
  /** Il porte déjà un code d'offre, un code nominatif ou celui d'une
      marraine : l'offre du jour ne s'y ajoute pas. */
  dejaUnCode?: boolean;
  /** Couvert par un abonnement, ou séance d'un forfait ou d'une formule. */
  couvertParAbonnement?: boolean;
  /** Un forfait ponctuel est posé : le total négocié est le prix, on ne le
      remise pas une seconde fois. */
  forfait?: boolean;
  /** La Maison l'a écartée de ce rendez-vous (`horsOffreDuJour`) : le
      comptoir garde la main, et son choix tient à la réouverture. */
  ecartee?: boolean;
  /** PLACES LIMITÉES : l'occupation du jour (`occupationDuJour`, le rendez-vous
      relu ôté). Sans elle, une offre à places ne vaut pour personne : jamais
      de remise sur un jour qu'on n'a pas compté. */
  occupation?: OccupationDuJour;
  /** Aujourd'hui (ISO), pour l'horizon et le passé d'une offre à places. */
  aujourdhui?: string;
  /** Une seule remise : une tête aux prix convenus, ou qui a déjà une remise
      (famille, la main…), ne prend jamais de place limitée. */
  prixConvenus?: boolean;
  autreRemise?: boolean;
  /** L'offre dont ce rendez-vous tient DÉJÀ une place À CETTE DATE : une
      place prise est gardée, même si le jour s'est rempli depuis. À ne
      passer que si la date relue est celle qu'il avait. */
  offreTenue?: string;
  /** Les places restantes DÉJÀ LUES de la base (`places_de_la_remise`) par
      une porte qui ne voit pas l'agenda (le site, Ma Couronne). Données, elles
      tiennent lieu d'occupation. */
  placesConnues?: number | null;
};

/** L'OFFRE DU JOUR DE LA VENUE QUI VAUT POUR CE RENDEZ-VOUS, ou `null`.

    Rien hors de ses jours ni hors de sa saison, rien pour un rendez-vous
    couvert ou au forfait, rien par-dessus un autre code. Et rien pour une
    offre qui ne couvre aucun de ses gestes : `serviceIds` VIDE NE VEUT PAS
    DIRE TOUTES, ni ici ni ailleurs. À plusieurs, la plus forte remise. */
export function offreDuJourDeLaVenue<T extends OffreCodee & { branchId?: string }>(
  offres: readonly T[],
  v: VenueAJuger,
): T | null {
  if (v.dejaUnCode || v.couvertParAbonnement || v.forfait || v.ecartee || !v.dateIso) return null;
  const gestes = new Set(v.serviceIds);
  let mieux: T | null = null;
  for (const o of offres) {
    if (!o || !o.active || !codeNormalise(o.code) || !porteSurLeJourDeLaVenue(o)) continue;
    if (o.branchId && v.branchId && o.branchId !== v.branchId) continue;
    if (!laVenueTombeBien(o, v.dateIso)) continue;
    if (!(o.serviceIds ?? []).some((id) => gestes.has(id))) continue;
    if (estAPlaces(o)) {
      if (v.prixConvenus || v.autreRemise) continue;
      const tenue = !!o.id && v.offreTenue === o.id;
      const restantes = v.placesConnues !== undefined
        ? v.placesConnues
        : placesRestantes(o, v.dateIso, v.occupation, v.aujourdhui ?? isoDuJour(new Date()));
      if (!tenue && !((restantes ?? 0) > 0)) continue;
    }
    if (!mieux || (o.discountPct ?? 0) > (mieux.discountPct ?? 0)) mieux = o;
  }
  return mieux;
}

/** Une remise de ligne telle que le rendez-vous la porte. */
type RemiseDeLigneLue = { pct?: number; xof?: number } | null | undefined;
const remiseDeLaMain = (r: RemiseDeLigneLue): boolean => (r?.pct ?? 0) > 0 || (r?.xof ?? 0) > 0;

/** CE QUE L'OFFRE ÉCRIT SUR LE RENDEZ-VOUS : son code, son identifiant, et
    les remises de ligne parallèles à `serviceIds`, comme `demande-submit`
    les écrit (`{ pct }` sur une ligne couverte au prix ferme, `null`
    ailleurs). `null` quand l'offre ne retire rien : un code posé d'office
    qui ne fait rien ne serait que du bruit au Carnet.

    UNE LIGNE REMISÉE À LA MAIN GARDE SA REMISE : le code ne s'y ajoute pas,
    et la main de la Maison l'emporte, comme partout. */
export function poseLOffreDuJour(
  offre: (OffreCodee & { id?: string }) | null | undefined,
  lignes: readonly LigneAPrix[],
  remisesDejaPosees: readonly RemiseDeLigneLue[] = [],
): { codeOffre: string; offreId?: string; remisesLignes: ({ pct?: number; xof?: number } | null)[] } | null {
  const code = codeNormalise(offre?.code);
  if (!offre || !code) return null;
  const pct = Math.max(0, Math.min(90, Math.round(offre.discountPct ?? 0)));
  const r = lignesDuCode(lignes, offre);
  let mord = false;
  const remisesLignes = lignes.map((_, i) => {
    const main = remisesDejaPosees[i];
    if (remiseDeLaMain(main)) return { ...(main as { pct?: number; xof?: number }) };
    if (r[i]?.remisee) { mord = true; return { pct }; }
    return null;
  });
  if (!mord) return null;
  return { codeOffre: code, ...(offre.id ? { offreId: String(offre.id) } : {}), remisesLignes };
}

/** LES REMISES QUE LA MAIN A POSÉES, celles du code d'un jour de la venue
    ôtées. Sert à rouvrir un rendez-vous du mercredi : si on le déplace au
    jeudi, ses −15 % doivent partir avec le code, et les remises de la Maison
    rester. Une ligne couverte qui porte exactement le pourcentage de l'offre,
    sans francs, est celle du code. Rend les remises telles quelles quand le
    code du rendez-vous n'est pas celui d'une offre du jour de la venue. */
export function remisesDeLaMainSeules(
  rdv: { codeOffre?: string; serviceIds: readonly string[]; remisesLignes?: readonly RemiseDeLigneLue[] },
  offres: readonly OffreCodee[],
): ({ pct?: number; xof?: number } | null)[] {
  const remises = (rdv.remisesLignes ?? []).map((r) => (r ? { ...r } : null));
  const c = codeNormalise(rdv.codeOffre);
  const offre = c ? offres.find((o) => porteSurLeJourDeLaVenue(o) && codeNormalise(o.code) === c) : undefined;
  if (!offre) return remises;
  const pct = Math.max(0, Math.min(90, Math.round(offre.discountPct ?? 0)));
  const couvre = new Set(offre.serviceIds ?? []);
  return remises.map((r, i) => (r && pct > 0 && r.pct === pct && !r.xof && couvre.has(rdv.serviceIds[i]) ? null : r));
}

/** Le code de ce rendez-vous est-il celui d'une offre du jour de la venue ?
    Alors il n'est pas « un autre code » : il se repose, ou s'en va, avec la
    date. */
export const estUnCodeDuJour = (code: unknown, offres: readonly OffreCodee[]): boolean => {
  const c = codeNormalise(code);
  return !!c && offres.some((o) => porteSurLeJourDeLaVenue(o) && codeNormalise(o.code) === c);
};

/** LE PALIER DU NET D'UN CODE : le même que `PALIER_DU_CODE_XOF`
    (encaissement-pur, 23 octobre 2026, « pas de monnaie », au 1 000 F
    supérieur), que ce module pur ne peut pas lire. Le banc du mercredi exige
    que les deux restent égaux. */
export const PALIER_DU_NET_XOF = 1000;

/** CE QUE L'ARRONDI REPREND AU CODE : le net monte au palier supérieur, et
    l'arrondi ne rend jamais plus que la remise. Un lavage à 10 000 F un
    mercredi : 8 500 F, puis 9 000 F. La même règle que `leTicket` et
    `arrondiDuCodeAuRdv`, pour Ma Couronne et le site qui n'ont ni l'un ni
    l'autre. */
export function arrondiDuNet(netXof: number, remiseXof: number, palier = PALIER_DU_NET_XOF): number {
  const remise = Math.max(0, Math.round(remiseXof));
  if (remise <= 0 || palier <= 0) return 0;
  const reste = Math.max(0, Math.round(netXof)) % palier;
  return Math.min(remise, reste === 0 ? 0 : palier - reste);
}

/** CE QUE LE MERCREDI RETIRE VRAIMENT, en francs, l'arrondi au millier déjà
    repris. `sansLuiXof` : le rituel avec les seules remises de la main ;
    `avecLuiXof` : avec celles du mercredi en plus ; `brutNuXof` : sans aucune
    remise de ligne (la remise que l'arrondi borne, comme `arrondiDuCodeAuRdv`).
    `arrondir` à faux pour un prix encore à convenir : son net n'est pas connu,
    la fenêtre du rendez-vous ne l'arrondit pas. */
export function ceQueRetireLeMercredi(e: {
  sansLuiXof: number; avecLuiXof: number; brutNuXof: number; arrondir?: boolean;
}): { arrondiXof: number; mercrediXof: number; netXof: number } {
  const avec = Math.max(0, Math.round(e.avecLuiXof));
  const arrondiXof = e.arrondir === false ? 0 : arrondiDuNet(avec, Math.max(0, Math.round(e.brutNuXof)) - avec);
  const mercrediXof = Math.max(0, Math.round(e.sansLuiXof) - avec - arrondiXof);
  return { arrondiXof, mercrediXof, netXof: avec + arrondiXof };
}

/* ══ LA PLUS FORTE DES DEUX — 2 novembre 2026 ═══════════════════════════
   Yéman, au sélecteur, ce soir : la remise famille et le mercredi de la
   Maison ne se cumulent JAMAIS, partout ; la plus forte des deux s'applique.
   On compare ce qui sort du tiroir, en francs : la remise famille telle que
   la fenêtre la fige (part hors forfaits × taux), et le mercredi APRÈS
   l'arrondi au millier. À ÉGALITÉ, LA FAMILLE : elle vaut sans code à
   compter, et c'est la règle du comptoir pour tout code (`leTicket`,
   `laMeilleureEnFrancs` : ce qui est déjà posé l'emporte à égalité).

   Les offres existantes ne changent pas : la règle ne vaut que pour une
   offre du jour de la venue. */
export type LaPlusForte = { retenue: 'famille' | 'mercredi' | 'aucune'; familleXof: number; mercrediXof: number };

export function laPlusForteDesDeux(e: { familleXof: number; mercrediXof: number }): LaPlusForte {
  const familleXof = Math.max(0, Math.round(e.familleXof));
  const mercrediXof = Math.max(0, Math.round(e.mercrediXof));
  if (mercrediXof > familleXof) return { retenue: 'mercredi', familleXof, mercrediXof };
  if (familleXof > 0) return { retenue: 'famille', familleXof, mercrediXof };
  return { retenue: 'aucune', familleXof, mercrediXof };
}

/** LA PHRASE DE L'ÉCRAN, quand les deux se présentaient : laquelle est
    retenue, et pourquoi. `null` quand une seule des deux existait. Le nom de
    l'offre se dit avec son article en minuscule au milieu d'une phrase
    (« plus forte que le mercredi de la Maison »). */
export function ditLaPlusForte(d: LaPlusForte, titre: string): string | null {
  if (d.familleXof <= 0 || d.mercrediXof <= 0) return null;
  const nom = String(titre ?? '').trim() || 'l’offre du jour';
  const auMilieu = /^(Le|La|Les|L’|L')\s?/.test(nom) ? nom.charAt(0).toLowerCase() + nom.slice(1) : nom;
  if (d.retenue === 'mercredi') return `${nom} retenu, plus fort que la remise famille.`;
  if (d.mercrediXof === d.familleXof) return `Remise famille retenue : ${auMilieu} ne retire pas davantage.`;
  return `Remise famille retenue, plus forte que ${auMilieu}.`;
}
