/* ══ À FAIRE — 6 septembre 2026 (maquette validée) ═══════════════════

   « J'aimerais que les données soient liées aux finances, à la prévision, au
   nombre de jours, à la rentabilité. Que je sache ce qu'il est très important
   de remplir, et que ces cases-là déclenchent tout un système » (Yéman).

   LE TRÔNE SAIT DÉJÀ PRESQUE TOUT FAIRE — ce qui manque, c'est de savoir ce
   qui manque. Un comptage absent ne se voit nulle part : il se voit au moment
   où un prix s'annonce « dès », trois semaines plus tard, devant la cliente.

   ON COMPTE CE QUI OUVRE QUELQUE CHOSE, jamais ce qui serait « bien rempli ».
   Chaque geste d'ici débloque une capacité nommée du Trône ; une case qui
   n'ouvre rien n'a pas à figurer dans une liste de travail.

   TOUT EST PUR ICI, et jugé par `verifie-afaire`. */

import { aDefaitSesLocks, estDePassage, estDiaspora } from './clients';

export type TeteLue = {
  id: string;
  branchId: string;
  archived?: boolean;
  /** LA DIASPORA — les deux marquages, un seul juge (`estDiaspora`). */
  diaspora?: boolean;
  segments?: readonly string[];
  /** Venue sans relation engagée — la marque de la Maison (`estDePassage`). */
  dePassage?: boolean;
  /** Elle a défait ses locks : il n'y a plus rien à compter. */
  locksDefaits?: boolean;
  email?: string;
  photo?: string | null;
  persona?: string;
  lockCount?: number;
  longueur?: string;
  rythmeSemaines?: number;
  comptages?: { longueurCm?: number }[];
};

export type RituelLu = {
  id: string;
  branchId: string;
  clientId: string;
  status?: string;
  mains?: string[][];
};

export type BilanLu = { clientId: string };
export type FicheStockLue = { branchId?: string; prixAchatXof?: number };

/** LA CLÉ D'UN GESTE — stable, c'est par elle que l'écran sait où mener. */
export type CleGeste =
  | 'meche' | 'bilan' | 'cadence' | 'longueur' | 'email'
  | 'mains' | 'locks' | 'achat' | 'solde';

export type Geste = {
  cle: CleGeste;
  /** Combien de têtes, de rituels ou de fiches attendent ce geste. */
  combien: number;
  /** Ce que le geste ouvre — trois mots, jamais une phrase. */
  ouvre: string;
  /** Ce qu'on fait, à l'impératif. */
  verbe: string;
  quoi: string;
  /** Une somme, quand le geste en porte une (les impayés). */
  xof?: number;
};

export type CleJauge = 'predire' | 'facturer' | 'fideliser' | 'rentabilite' | 'positionner' | 'encaisser';

export type Jauge = { cle: CleJauge; nom: string; pct: number };

export type LeTravail = {
  jauges: Jauge[];
  gestes: Geste[];
  /** Combien de têtes servies sortent des quatre gestes qui se constatent au
      fauteuil (`AU_FAUTEUIL`), et pour quelle raison. Une tête peut en porter
      deux : `total` ne les additionne pas. */
  horsFauteuil: { ailleurs: number; sansLocks: number; passage: number; total: number };
};

/** LES TÊTES QU'ON COMPTE — 6 septembre 2026.

    UNE PROSPECTE N'A PAS DE COMPTAGE MANQUANT : elle n'est jamais venue. La
    prendre dans le dénominateur ferait paraître la Maison en retard sur un
    travail qui n'existe pas, et un chiffre qu'on ne peut pas améliorer finit
    par ne plus se lire.

    ON NE RETIENT DONC QUE LES TÊTES SERVIES : au moins un rituel honoré. */
const tetesServies = (
  tetes: readonly TeteLue[], rituels: readonly RituelLu[], branchId: string,
): TeteLue[] => {
  const vues = new Set(rituels
    .filter((a) => a.branchId === branchId && a.status === 'honoré')
    .map((a) => a.clientId));
  return tetes.filter((c) => c.branchId === branchId && !c.archived && vues.has(c.id));
};

/** Combien de mèches témoins mesurées sur une tête. */
const mechesDe = (c: TeteLue): number =>
  (c.comptages ?? []).filter((m) => (m.longueurCm ?? 0) > 0).length;

/** LA PART TENUE, en pourcentage entier. Sans rien à faire, TOUT est tenu :
    une maison sans tête servie n'est pas en retard, elle commence. */
const part = (manquants: number, total: number): number =>
  (total <= 0 ? 100 : Math.round(((total - manquants) / total) * 100));

/* ══ LES MANQUES D'UNE SEULE TÊTE — 6 septembre 2026 ════════════════

   « Dès qu'un rendez-vous arrive et que cette tête est dans cette liste, il
   faut nous demander de remplir cette information ou de faire une demande
   automatique par WhatsApp » (Yéman).

   UNE LISTE DE TROIS CENTS TÊTES NE SE TRAVAILLE PAS. Elle se travaille tête
   par tête, AU MOMENT OÙ ELLE EST LÀ : c'est le seul instant où l'on peut
   demander sa longueur, mesurer sa mèche, ou lui demander son e-mail sans la
   déranger un autre jour. */

/** CE QUI SE DEMANDE À LA CLIENTE, et ce qui se fait au fauteuil.

    LA DISTINCTION N'EST PAS COSMÉTIQUE : envoyer un WhatsApp pour demander sa
    longueur travaillée serait absurde — c'est la Maison qui la constate. Seuls
    l'e-mail (qu'elle seule connaît) et le bilan (qu'on lui remet) voyagent. */
export const SE_DEMANDE: Record<CleGeste, boolean> = {
  email: true,
  bilan: true,
  meche: false,
  cadence: false,
  longueur: false,
  mains: false,
  locks: false,
  achat: false,
  solde: false,
};

/** LES GESTES QUI CONCERNENT UNE TÊTE, dans l'ordre de la liste générale. */
/** ══ CE QUI SE CONSTATE AU FAUTEUIL — 6 septembre 2026 ═══════════════

    « Les têtes à compter, Diaspora : je n'ai pas besoin de garder des fiches
    et des cadences. Tous ceux affichés viennent de la diaspora » (Yéman).

    QUATRE DE CES GESTES DEMANDENT UNE TÊTE QUI REVIENT. Compter des locks,
    constater une longueur, poser une mèche témoin, tenir une cadence : rien de
    tout cela ne se fait à distance. Les réclamer d'une tête qui vit ailleurs
    remplit la liste de travail de gens qu'on ne verra pas avant un an, et
    noie les têtes du pays qu'on aurait pu traiter cette semaine.

    LE TRÔNE LE SAVAIT DÉJÀ POUR LA CADENCE : `prochaineVenue` ne prédit ni la
    passante ni la diaspora, parce que sa cadence ne mesure pas un rythme, elle
    mesure des billets d'avion (16 août). « À faire » l'ignorait, et réclamait
    à ces têtes-là exactement ce que la Maison avait renoncé à leur prédire.

    L'E-MAIL ET LE BILAN RESTENT, et c'est le point : Ma Couronne est le seul
    fil qui tient entre deux voyages. Les retirer couperait ce qui relie la
    diaspora à la Maison, au motif qu'elle est loin.

    TROIS RAISONS, UNE SEULE EXEMPTION (6 septembre, second arbitrage) :

    · ELLE VIT AILLEURS. Sa cadence ne mesure pas un rythme, elle mesure des
      billets d'avion.
    · ELLE A DÉFAIT SES LOCKS. Le compte est vide et le restera ; rien ne
      distinguait « pas encore comptée » de « plus rien à compter », et la
      liste portait un travail impossible.
    · ELLE EST DE PASSAGE. La Maison dit d'elle qu'elle ne s'entretient pas.

    La même exemption pour les trois, parce que c'est la même cause : la tête
    ne reviendra pas s'asseoir assez pour qu'on la mesure. Trois règles
    différentes s'oublieraient l'une après l'autre. */
const AU_FAUTEUIL: readonly CleGeste[] = ['meche', 'cadence', 'longueur', 'locks'];

/** ELLE NE SE CONSTATE PLUS AU FAUTEUIL — un seul juge pour les trois raisons.
    L'écran s'en sert pour proposer le marquage, le compte pour l'appliquer :
    deux lectures différentes donneraient deux listes. */
export const horsDuFauteuil = (c: TeteLue): boolean =>
  estDiaspora(c) || aDefaitSesLocks(c) || estDePassage(c);

export function manquesDeLaTete(o: {
  tete: TeteLue;
  bilans: number;
  mechesRequises?: number;
  bilansRequis?: number;
}): CleGeste[] {
  const mechesRequises = o.mechesRequises ?? 3;
  const bilansRequis = o.bilansRequis ?? 2;
  const c = o.tete;
  const manques: CleGeste[] = [];
  if (mechesDe(c) < mechesRequises) manques.push('meche');
  if (o.bilans < bilansRequis) manques.push('bilan');
  if (!c.rythmeSemaines) manques.push('cadence');
  if (!c.longueur) manques.push('longueur');
  if (!(c.email ?? '').trim()) manques.push('email');
  if (!c.lockCount) manques.push('locks');
  return horsDuFauteuil(c) ? manques.filter((k) => !AU_FAUTEUIL.includes(k)) : manques;
}

/** LES TÊTES QU'UN GESTE ATTEND — pour ouvrir la liste depuis la ligne.

    RANGÉES PAR LEUR PROCHAINE VENUE : celle qui vient demain se traite
    aujourd'hui, celle qu'on ne reverra pas de sitôt peut attendre. Une liste
    par ordre alphabétique ferait travailler dans le désordre du hasard. */
export function tetesDuGeste(o: {
  branchId: string;
  cle: CleGeste;
  tetes: readonly TeteLue[];
  rituels: readonly RituelLu[];
  bilans: readonly BilanLu[];
  /** Le jour de sa prochaine venue, quand elle en a une. */
  prochaineDe: (clientId: string) => string | undefined;
  mechesRequises?: number;
  bilansRequis?: number;
}): { tete: TeteLue; prochaineIso?: string }[] {
  const parTete = new Map<string, number>();
  for (const b of o.bilans) parTete.set(b.clientId, (parTete.get(b.clientId) ?? 0) + 1);
  return tetesServies(o.tetes, o.rituels, o.branchId)
    .filter((c) => manquesDeLaTete({
      tete: c,
      bilans: parTete.get(c.id) ?? 0,
      mechesRequises: o.mechesRequises,
      bilansRequis: o.bilansRequis,
    }).includes(o.cle))
    .map((c) => ({ tete: c, prochaineIso: o.prochaineDe(c.id) }))
    .sort((a, b) => {
      /* CELLE QUI VIENT D'ABORD PASSE D'ABORD ; celles qu'on n'attend pas
         ferment la marche, sans disparaître. */
      if (a.prochaineIso && b.prochaineIso) return a.prochaineIso.localeCompare(b.prochaineIso);
      if (a.prochaineIso) return -1;
      if (b.prochaineIso) return 1;
      return a.tete.id.localeCompare(b.tete.id);
    });
}

/** LE MOT QU'ON LUI ENVOIE. Court, et il dit POURQUOI on demande : une
    question sans raison se lit comme une intrusion.

    Il n'est jamais envoyé par le Trône : il ouvre WhatsApp, la Maison relit et
    envoie. Rien ne part sans une main. */
export const motPourDemander = (cle: CleGeste, prenom: string): string => {
  const p = prenom.trim() || 'Chère tête couronnée';
  if (cle === 'email') {
    return `${p}, pouvez-vous nous donner votre adresse e-mail ? `
      + 'Elle vous ouvre votre espace Ma Couronne : votre suivi, vos rendez-vous et vos bilans.';
  }
  if (cle === 'bilan') {
    return `${p}, voici le bilan de votre dernière séance. `
      + 'Il montre où en est votre couronne, et ce que nous prévoyons pour la suite.';
  }
  return '';
};

export function leTravail(o: {
  branchId: string;
  tetes: readonly TeteLue[];
  rituels: readonly RituelLu[];
  bilans: readonly BilanLu[];
  stock: readonly FicheStockLue[];
  /** Ce qui reste dû sur un rituel — le juge vit dans l'app, pas ici. */
  duXof: (a: RituelLu) => number;
  /** Trois mesures ouvrent la courbe de pousse, deux bilans celle des jauges. */
  mechesRequises?: number;
  bilansRequis?: number;
}): LeTravail {
  const mechesRequises = o.mechesRequises ?? 3;
  const bilansRequis = o.bilansRequis ?? 2;
  const servies = tetesServies(o.tetes, o.rituels, o.branchId);
  const n = servies.length;

  const honores = o.rituels.filter((a) => a.branchId === o.branchId && a.status === 'honoré');
  const parTete = new Map<string, number>();
  for (const b of o.bilans) parTete.set(b.clientId, (parTete.get(b.clientId) ?? 0) + 1);

  /* UN SEUL JUGE POUR LE COMPTE ET POUR LA LISTE. Les prédicats vivaient ici
     une seconde fois, recopiés de `manquesDeLaTete` : le jour où l'un des deux
     a gagné une exception, la ligne disait « 66 » et la liste en ouvrait 12,
     sans que rien ne dise lequel avait raison. */
  const manques = new Map<string, CleGeste[]>();
  for (const c of servies) {
    manques.set(c.id, manquesDeLaTete({
      tete: c, bilans: parTete.get(c.id) ?? 0, mechesRequises, bilansRequis,
    }));
  }
  const combienDe = (cle: CleGeste): number =>
    servies.filter((c) => (manques.get(c.id) ?? []).includes(cle)).length;

  const sansMeche = combienDe('meche');
  const sansBilan = combienDe('bilan');
  const sansCadence = combienDe('cadence');
  const sansLongueur = combienDe('longueur');
  const sansEmail = combienDe('email');
  const sansLocks = combienDe('locks');
  /* CELLES QUI SORTENT DU FAUTEUIL, PAR RAISON. Un nombre qui baisse sans
     raison visible se lit comme une perte de données — et « 54 » tout court
     ne dit pas si l'on a marqué juste. Une tête peut porter deux raisons :
     chacune se compte, et le total ne les additionne pas. */
  const horsFauteuil = {
    ailleurs: servies.filter((c) => estDiaspora(c)).length,
    sansLocks: servies.filter((c) => aDefaitSesLocks(c)).length,
    passage: servies.filter((c) => estDePassage(c)).length,
    total: servies.filter((c) => horsDuFauteuil(c)).length,
  };
  /* UNE TÊTE SE POSITIONNE PAR CE QU'ON PEUT MONTRER ET PAR CE QU'ON SAIT
     DIRE : sa photo et son persona. L'un sans l'autre ne suffit pas. */
  const sansVitrine = servies.filter((c) => !c.photo || !c.persona).length;
  const sansMains = honores.filter((a) => !(a.mains ?? []).some((m) => m.length > 0)).length;
  const impayes = honores.filter((a) => o.duXof(a) > 0);
  const duTotal = impayes.reduce((s, a) => s + o.duXof(a), 0);
  const sansAchat = o.stock
    .filter((f) => (f.branchId === undefined || f.branchId === o.branchId) && !((f.prixAchatXof ?? 0) > 0))
    .length;

  const jauges: Jauge[] = [
    { cle: 'predire', nom: 'Prédire', pct: part(sansCadence, n) },
    { cle: 'facturer', nom: 'Facturer', pct: part(sansLocks, n) },
    { cle: 'fideliser', nom: 'Fidéliser', pct: part(sansBilan, n) },
    { cle: 'rentabilite', nom: 'Rentabilité', pct: part(sansMains, honores.length) },
    { cle: 'positionner', nom: 'Positionner', pct: part(sansVitrine, n) },
    { cle: 'encaisser', nom: 'Encaisser', pct: part(impayes.length, honores.length) },
  ];

  /* LES GESTES, RANGÉS PAR CE QU'ILS DÉBLOQUENT LE PLUS LARGEMENT. Le nombre
     de têtes concernées est le seul classement honnête : trier par mon avis
     sur l'importance ferait passer mes idées pour les siennes. */
  const gestes: Geste[] = [
    { cle: 'meche', combien: sansMeche, quoi: 'têtes sans mèche témoin', ouvre: 'ouvre la courbe de pousse', verbe: 'Mesurer' },
    { cle: 'bilan', combien: sansBilan, quoi: `têtes avec moins de ${bilansRequis} bilans`, ouvre: 'ouvre sa courbe dans Ma Couronne', verbe: 'Remettre un bilan' },
    { cle: 'cadence', combien: sansCadence, quoi: 'têtes sans cadence', ouvre: 'ouvre la reprise automatique', verbe: 'Poser' },
    { cle: 'longueur', combien: sansLongueur, quoi: 'têtes sans longueur', ouvre: 'ouvre son prix et sa durée', verbe: 'Constater' },
    { cle: 'email', combien: sansEmail, quoi: 'têtes sans e-mail', ouvre: 'ouvre son compte Ma Couronne', verbe: 'Demander' },
    { cle: 'mains', combien: sansMains, quoi: 'rituels sans mains', ouvre: 'ouvre la commission juste', verbe: 'Désigner' },
    { cle: 'locks', combien: sansLocks, quoi: 'têtes non comptées', ouvre: 'ouvre son calibre et son barème', verbe: 'Compter' },
    { cle: 'achat', combien: sansAchat, quoi: 'produits sans prix d’achat', ouvre: 'ouvre la marge de la Gamme', verbe: 'Saisir' },
    { cle: 'solde', combien: impayes.length, quoi: 'rituels rendus non soldés', ouvre: 'à encaisser', verbe: 'Encaisser', xof: duTotal },
  ];

  return { jauges, gestes: gestes.sort((a, b) => b.combien - a.combien), horsFauteuil };
}
