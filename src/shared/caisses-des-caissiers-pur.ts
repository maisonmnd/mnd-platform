/* ══ UNE CAISSE PAR CAISSIER, ET LES ANNÉES PASSÉES — 17 octobre 2026 ════
   « Ouvre également des caisses enregistreuses selon qui encaisse, Gérard,
   Brice, Yéman ou autres » (Yéman). Maquette 8kpQtpQh… validée (« Tout est
   bon, tu peux construire »), ses choix lus en base (maquette/encaisser) :
     · chacun a sa caisse, ouverte depuis l'Équipe ;
     · les espèces vont d'office dans la caisse de qui encaisse ;
       « Terrasse · Tiroir espèces » reste la caisse commune, en repli ;
     · MTN MoMoPay → la caisse MoMoPay de la Maison ; carte, chèque et
       virement → La Banque ; MND PAY → MND PAY ; l'avoir ne passe par
       aucune caisse ;
     · seule la direction change la caisse proposée ;
     · pas d'ouverture du matin : on compte le soir seulement.

   « Rajoute une caisse pour les RDV des années passées », puis : « il faut
   automatiquement détecter que c'est une année antérieure. Mais je ne veux
   pas voir année passée tout le temps, c'est pas forcément 2025, 2024, ça
   peut être 2023 ou 2022 ». UNE caisse commune, « Années passées » : tout
   l'argent d'un rendez-vous daté d'une année antérieure à l'année en cours
   y entre, quel que soit le caissier et le moyen, sauf MND PAY (l'argent est
   chez FedaPay) et l'avoir. L'année se CALCULE, elle ne s'écrit jamais en
   dur ; la caisse n'apparaît que pour un tel rendez-vous, et ni dans les
   caisses du jour ni à la clôture du soir.

   LA CAISSE SE DÉDUIT, ELLE NE SE DEVINE PAS. Le 13 septembre, la règle
   était « la caisse se choisit » : la première de la liste (KkiaPay) se
   posait d'office et des espèces partaient dans le tiroir du paiement en
   ligne. Ce qui se propose ici n'est jamais « la première venue » : c'est la
   caisse que SA décision nomme pour ce moyen. Quand aucune ne se nomme
   (Moov, Wave, PayPal…), rien ne se propose et chacun choisit.

   Tout se calcule ici, sans magasin ni React : `scripts/verifie-caisses-des-
   caissiers` le rejoue, pannes plantées comprises.

   ══ LES CAISSES PORTENT LE NOM DES PAIEMENTS — 21 octobre 2026 ══════════
   « Chaque paiement doit être attribué à une caisse. Quand je choisis un
   paiement que sa caisse soit automatiquement sélectionnée. Il faut
   également rajouter Momo Privé. Les caisses doivent porter les mêmes noms
   que les paiements » (Yéman), puis au sélecteur :
     · Espèces : UNE caisse « Espèces » pour toute la Maison, le tiroir du
       comptoir renommé. Les caisses des caissiers du 17 octobre se rangent :
       plus aucune espèce n'entre dans la caisse de qui encaisse ;
     · Carte : une caisse « Carte », où l'argent attend la banque ;
     · MoMo Privé : un moyen nouveau (un MTN MoMo reçu sur un numéro
       personnel), et UNE caisse « MoMo Privé » ;
     · Autres (Wave, Moov, virement, PayPal…) : UNE caisse « Autres », le
       moyen exact reste écrit sur le versement ;
     · « Reprise d'une année passée », parmi les autres moyens : l'argent
       entre dans « Années passées » (la règle automatique du 17 octobre
       reste : un rendez-vous d'une année antérieure y va de lui-même) ;
     · les caisses qui existent se RENOMMENT (le panneau « Les caisses au
       nom des paiements », défaisable) : le tiroir devient « Espèces »,
       « MoMoPay Maison MND » devient « MTN MoMoPay », « Chèques à déposer »
       devient « Chèque ».
   AUCUN PAIEMENT SANS CAISSE : la caisse d'un moyen se trouve par son
   identifiant, puis par son nom d'aujourd'hui ou d'avant ; introuvable, elle
   naît (rangée, elle revient) au premier argent qui y entre. */

import type { Cashbox, RoleDeCaisse } from './finance';
import { reecritLEcriture, rendsLEcriture, casesDe, type Sorte } from './bascule-des-caisses-pur';
import { TRI_DU_19_OCTOBRE } from './tri-des-caisses-pur';

export const CAISSE_ANNEES_PASSEES = 'Années passées';
/* LES NOMS DES PAIEMENTS — 21 octobre 2026 : chaque caisse porte le nom de
   la tuile qui la remplit. */
export const CAISSE_ESPECES = 'Espèces';
export const CAISSE_MTN = 'MTN MoMoPay';
export const CAISSE_MOMO_PRIVE = 'MoMo Privé';
export const CAISSE_CARTE = 'Carte';
/* LA CAISSE DES CHÈQUES — 18 octobre 2026, sa décision : le chèque y attend
   son dépôt ; « Marquer déposés » le vire au compte de la banque. Son nom
   suit le paiement depuis le 21 octobre. */
export const CAISSE_CHEQUE = 'Chèque';
export const CAISSE_AUTRES = 'Autres';
/* Les noms d'avant le 21 octobre 2026 : une caisse les porte encore tant que
   le panneau « Les caisses au nom des paiements » n'a pas été appliqué. */
export const ANCIEN_NOM_CHEQUES = 'Chèques à déposer';
export const ANCIEN_NOM_MOMOPAY = 'MoMoPay Maison MND';
export const ANCIEN_NOM_TIROIR = 'Tiroir espèces';
export const CAISSE_TIROIR_COMMUN = 'Terrasse · Tiroir espèces';
const CAISSE_MND_PAY = 'MND PAY';
const CAISSE_ZELLE = 'Zelle';
const CAISSE_KKIAPAY = 'KkiaPay';

/* LES DEUX MOYENS NOUVEAUX — 21 octobre 2026. Ils s'ajoutent à SA liste
   (Paramètres), sans la réécrire : `avecLesMoyensDeLaMaison`. */
export const MOYEN_MOMO_PRIVE = 'MoMo Privé';
export const MOYEN_REPRISE = 'Reprise d’une année passée';

export type FamilleDeMoyen = 'especes' | 'momo' | 'momoPrive' | 'carte' | 'cheque' | 'reprise' | 'mndpay' | 'zelle' | 'kkiapay' | 'avoir' | 'autre';

const plat = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** LA FAMILLE D'UN MOYEN, lue sur son nom (la liste des moyens est la sienne,
    dans Paramètres : on la lit, on ne la réécrit pas). Moov, Celtiis, Wave,
    PayPal, un virement : « autre », dont la caisse est « Autres » depuis le
    21 octobre 2026. */
export function familleDuMoyen(methode: string): FamilleDeMoyen {
  const m = plat(methode ?? '');
  if (!m) return 'autre';
  if (m === 'avoir') return 'avoir';
  if (/mnd ?pay/.test(m)) return 'mndpay';
  if (/zelle/.test(m)) return 'zelle';
  if (/kkiapay/.test(m)) return 'kkiapay';
  if (/reprise/.test(m) && /annee/.test(m)) return 'reprise';
  if (/espece|cash|liquide/.test(m)) return 'especes';
  const mobile = /\bmtn\b|momo|mobile money/.test(m) && !/moov|celti|wave/.test(m);
  if (mobile && /prive|perso/.test(m)) return 'momoPrive';
  if (mobile) return 'momo';
  if (/cheque|\bcheck\b/.test(m)) return 'cheque';
  if (/carte|\bcard\b|visa|master|\btpe\b/.test(m)) return 'carte';
  return 'autre';
}

/** SA LISTE, PLUS LES DEUX MOYENS DU 21 OCTOBRE 2026 : « MoMo Privé » juste
    après son MTN, « Reprise d'une année passée » à la fin. Déjà là (sous un
    nom qui en est la famille), rien ne s'ajoute. */
export function avecLesMoyensDeLaMaison(methods: readonly string[]): string[] {
  const out = [...methods];
  if (!out.some((m) => familleDuMoyen(m) === 'momoPrive')) {
    const i = out.findIndex((m) => familleDuMoyen(m) === 'momo');
    out.splice(i >= 0 ? i + 1 : out.length, 0, MOYEN_MOMO_PRIVE);
  }
  if (!out.some((m) => familleDuMoyen(m) === 'reprise')) out.push(MOYEN_REPRISE);
  return out;
}

/** L'année d'une date ISO, ou NaN. */
export const anneeDe = (iso: string | undefined): number => {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(iso ?? ''));
  return m ? Number(m[1]) : NaN;
};

/** UN RENDEZ-VOUS D'UNE ANNÉE ANTÉRIEURE : son année est avant celle
    d'aujourd'hui. Aucune année écrite en dur : en janvier 2027, un rendez-vous
    de 2026 le devient tout seul. Sans date lisible : non. */
export function estAnneeAnterieure(dateDuRdv: string | undefined, aujourdhui: string): boolean {
  const a = anneeDe(dateDuRdv);
  const b = anneeDe(aujourdhui);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/** Le prénom, pour nommer une caisse : « Caisse de Gérard ». */
export const prenomDe = (nom: string): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

type Boite = Pick<Cashbox, 'id' | 'branchId' | 'name' | 'sub' | 'role' | 'equipe' | 'archiveeLe' | 'caissierId' | 'currency' | 'horsEncaissement'>;

/** LES CAISSES DES CAISSIERS de la branche, encore ouvertes. Depuis le
    21 octobre 2026 (« une seule Espèces »), elles ne reçoivent plus rien :
    le panneau « Les caisses au nom des paiements » vide leur solde dans
    « Espèces » et les range. */
export const caissesDesCaissiers = <B extends Boite>(boxes: readonly B[], branchId: string): B[] =>
  boxes.filter((b) => b.branchId === branchId && !b.archiveeLe && !!b.caissierId);

/** LA CAISSE DES ANNÉES PASSÉES de la branche, idempotente (identifiant tiré
    de la branche). Rôle « archive » : c'est l'histoire, et aucune caisse
    proposée d'office ailleurs ne la prendra pour la Terrasse. */
export function caisseDesAnneesPassees(branchId: string): Cashbox {
  return {
    id: `cb-annees-passees-${branchId}`,
    branchId,
    name: CAISSE_ANNEES_PASSEES,
    sub: 'Rendez-vous des années antérieures',
    glyph: '◷',
    openingXof: 0,
    role: 'archive',
    /* Elle garde tout son passé (17 octobre 2026, le soir) : sans ce drapeau,
       le départ des caisses ne comptait que ce qui suit octobre 2026, et la
       caisse des années passées affichait un solde vide. */
    histoire: true,
  };
}

/* ══ LA CAISSE DE CHAQUE PAIEMENT — 21 octobre 2026 ══════════════════════
   Une famille de moyens, une caisse, au nom du paiement. Chacune a un
   identifiant tiré de la branche (deux postes qui la font naître écrivent la
   même) ; celles qui existaient gardent le leur (`cb-cheques-…`,
   `cb-momopay-…`), le tiroir des espèces aussi (celui du tri du 19 octobre). */
export type FamilleDeCaisse = 'especes' | 'momo' | 'momoPrive' | 'carte' | 'cheque' | 'autre';

type Canon = { nom: string; id: (branchId: string) => string; anciens: readonly string[]; sub: string; glyph: string; role: RoleDeCaisse; equipe?: true };
export const CAISSES_DES_PAIEMENTS: Readonly<Record<FamilleDeCaisse, Canon>> = {
  especes: { nom: CAISSE_ESPECES, id: (br) => `cb-especes-${br}`, anciens: [ANCIEN_NOM_TIROIR, CAISSE_TIROIR_COMMUN], sub: 'Espèces du comptoir', glyph: '◈', role: 'terrasse', equipe: true },
  momo: { nom: CAISSE_MTN, id: (br) => `cb-momopay-${br}`, anciens: [ANCIEN_NOM_MOMOPAY], sub: 'MTN MoMoPay · code 909099', glyph: '◉', role: 'terrasse' },
  momoPrive: { nom: CAISSE_MOMO_PRIVE, id: (br) => `cb-momo-prive-${br}`, anciens: [], sub: 'MTN MoMo reçu sur un numéro personnel', glyph: '◉', role: 'terrasse' },
  carte: { nom: CAISSE_CARTE, id: (br) => `cb-carte-${br}`, anciens: [], sub: 'Paiements par carte, avant le versement de la banque', glyph: '▤', role: 'banque' },
  cheque: { nom: CAISSE_CHEQUE, id: (br) => `cb-cheques-${br}`, anciens: [ANCIEN_NOM_CHEQUES], sub: 'Chèques encaissés, pas encore portés à la banque', glyph: '▤', role: 'banque' },
  autre: { nom: CAISSE_AUTRES, id: (br) => `cb-autres-${br}`, anciens: [], sub: 'Wave, Moov, virement, PayPal et les autres moyens', glyph: '◈', role: 'terrasse' },
};

/** Le tiroir des espèces du tri du 19 octobre 2026 (« Real Money », devenu
    « Tiroir espèces ») : par son identifiant, jamais par son nom. */
export const ID_DU_TIROIR = TRI_DU_19_OCTOBRE.fondre.vers;

/** LA CAISSE NEUVE D'UN PAIEMENT, idempotente. */
export function caisseNeuveDuPaiement(famille: FamilleDeCaisse, branchId: string): Cashbox {
  const c = CAISSES_DES_PAIEMENTS[famille];
  return {
    id: c.id(branchId), branchId, name: c.nom, sub: c.sub, glyph: c.glyph, openingXof: 0, role: c.role,
    ...(c.equipe ? { equipe: true } : {}),
  };
}

/** LA CAISSE DES CHÈQUES de la branche, idempotente. Rôle « banque » : c'est
    de l'argent en route vers la banque. */
export const caisseDesCheques = (branchId: string): Cashbox => caisseNeuveDuPaiement('cheque', branchId);

/** LA CAISSE MOMOPAY DE LA MAISON, une par branche, idempotente. */
export const caisseMomopayDeLaMaison = (branchId: string): Cashbox => caisseNeuveDuPaiement('momo', branchId);

const textes = (b: Boite): string => plat(`${b.name} ${b.sub ?? ''}`);

/** LA CAISSE D'UN PAIEMENT dans la branche, ouverte : son identifiant, son
    nom, le tiroir du tri (pour les espèces), un nom d'avant, puis (espèces
    seulement) une Terrasse qui dit « espèces » ou « tiroir ». Jamais la
    caisse d'un caissier ; le dernier repli, jamais une caisse en devise. */
export function laCaisseDuPaiement<B extends Boite>(boxes: readonly B[], branchId: string, famille: FamilleDeCaisse): B | undefined {
  const c = CAISSES_DES_PAIEMENTS[famille];
  const ici = boxes.filter((b) => b.branchId === branchId && !b.archiveeLe && !b.caissierId);
  return ici.find((b) => b.id === c.id(branchId))
    ?? ici.find((b) => b.name === c.nom)
    ?? (famille === 'especes' ? ici.find((b) => b.id === ID_DU_TIROIR) : undefined)
    ?? ici.find((b) => c.anciens.includes(b.name))
    ?? (famille === 'especes'
      ? ici.find((b) => !b.horsEncaissement && !b.currency && b.role === 'terrasse' && /espece|tiroir/.test(textes(b)) && !/momo|devise/.test(textes(b)))
      : undefined);
}

/** Le nom d'aujourd'hui de la caisse d'un paiement (celui du paiement si elle
    n'existe pas encore). */
export const nomDeLaCaisse = (boxes: readonly Boite[], branchId: string, famille: FamilleDeCaisse): string =>
  laCaisseDuPaiement(boxes, branchId, famille)?.name ?? CAISSES_DES_PAIEMENTS[famille].nom;

/** La famille de caisse d'un moyen ; `undefined` : il n'en a pas (avoir),
    ou la sienne vit à part (MND PAY, Zelle, KkiaPay, Années passées). */
export function familleDeCaisse(methode: string): FamilleDeCaisse | undefined {
  const f = familleDuMoyen(methode);
  return f === 'especes' || f === 'momo' || f === 'momoPrive' || f === 'carte' || f === 'cheque' || f === 'autre' ? f : undefined;
}

export type CaisseProposee = {
  /** Le nom de la caisse proposée ; absent : rien ne se propose, on choisit. */
  caisse?: string;
  /** Ce que l'écran dit, en clair. */
  pourquoi: string;
  /** L'année antérieure reconnue (le rendez-vous de 2025, 2023…). */
  anneePassee?: number;
  /** La caisse n'existe pas encore (ou elle est rangée) : l'écran la pose
      telle quelle avant d'écrire l'argent (`poseLaCaisse`). */
  aCreer?: Cashbox;
};

const POURQUOI: Record<FamilleDeCaisse, string> = {
  especes: 'Les espèces vont dans la caisse « Espèces » du comptoir.',
  momo: 'MTN MoMoPay arrive sur le compte MoMoPay de la Maison (code 909099).',
  momoPrive: 'Un MoMo reçu sur un numéro personnel va dans « MoMo Privé ».',
  carte: 'La carte attend le versement de la banque dans « Carte ».',
  cheque: 'Le chèque attend son dépôt dans sa caisse.',
  autre: 'Les autres moyens vont dans « Autres » ; le moyen reste écrit sur le versement.',
};

/** LA CAISSE QUE SA DÉCISION NOMME pour ce règlement. Elle existe toujours,
    sauf pour l'avoir (aucune caisse) et un billet étranger sans tiroir à sa
    devise : introuvable, elle naît (`aCreer`).
    `boxes` : les caisses où cet argent PEUT entrer (la branche, la date, la
    devise déjà filtrées). `toutes` : toutes les caisses, rangées comprises,
    pour qu'une caisse rangée revienne par son identifiant au lieu de naître
    en double. `staffId` n'oriente plus rien depuis le 21 octobre 2026 (les
    espèces vont toutes à « Espèces ») ; il reste pour les appels d'avant. */
export function caisseProposee(o: {
  methode: string;
  dateDuRdv?: string;
  aujourdhui: string;
  boxes: readonly Boite[];
  toutes?: readonly Cashbox[];
  branchId: string;
  staffId?: string;
  /** Payé en devise étrangère : seule une caisse dans cette devise convient. */
  enDevise?: boolean;
}): CaisseProposee {
  const famille = familleDuMoyen(o.methode);
  const ouvertes = o.boxes.filter((b) => b.branchId === o.branchId && !b.archiveeLe);
  /* Une caisse « à part » (BIIC, 17 octobre 2026) ne se propose jamais. */
  const ici = ouvertes.filter((b) => !b.horsEncaissement);
  const nommee = (nom: string) => ici.find((b) => b.name === nom)?.name;
  /* Rangée, une caisse revient par son identifiant (ou son nom), avec son passé. */
  const ranimee = (id: string, nom: string, neuve: () => Cashbox): Cashbox => {
    const r = (o.toutes ?? []).find((b) => b.branchId === o.branchId && !!b.archiveeLe && (b.id === id || b.name === nom));
    return r ? { ...r, archiveeLe: undefined } : neuve();
  };
  const annees = (pourquoi: string, annee?: number): CaisseProposee => {
    const c = nommee(CAISSE_ANNEES_PASSEES);
    const aCreer = c ? undefined : ranimee(`cb-annees-passees-${o.branchId}`, CAISSE_ANNEES_PASSEES, () => caisseDesAnneesPassees(o.branchId));
    return { caisse: aCreer?.name ?? CAISSE_ANNEES_PASSEES, pourquoi, ...(annee !== undefined ? { anneePassee: annee } : {}), ...(aCreer ? { aCreer } : {}) };
  };

  if (famille === 'avoir') return { pourquoi: 'L’avoir est un crédit du compte : il ne passe par aucune caisse.' };
  if (famille === 'mndpay') {
    const c = nommee(CAISSE_MND_PAY);
    return c ? { caisse: c, pourquoi: 'Payé par MND PAY : l’argent est chez FedaPay jusqu’au reversement.' } : { pourquoi: 'La caisse MND PAY n’est pas ouverte.' };
  }
  /* UN BILLET ÉTRANGER GARDE SON TIROIR, même pour une année antérieure :
     une caisse ne reçoit que sa devise, sinon la trésorerie additionnerait
     des euros à des francs (18 août). */
  if (o.enDevise) {
    const seules = ici.filter((b) => !b.caissierId);
    return seules.length === 1
      ? { caisse: seules[0].name, pourquoi: 'La seule caisse qui tient cette devise.' }
      : { pourquoi: 'Choisissez la caisse qui tient ces billets.' };
  }
  if (estAnneeAnterieure(o.dateDuRdv, o.aujourdhui)) {
    const annee = anneeDe(o.dateDuRdv);
    return annees(`Rendez-vous de ${annee}, une année antérieure : tout son argent va aux années passées.`, annee);
  }
  /* LA REPRISE D'UNE ANNÉE PASSÉE, choisie à la main (21 octobre 2026) : une
     reprise inscrite à une autre date que celle de son rendez-vous. */
  if (famille === 'reprise') return annees('Une reprise d’une année passée : son argent va aux années passées.');
  if (famille === 'zelle') {
    const c = nommee(CAISSE_ZELLE);
    return c ? { caisse: c, pourquoi: 'Zelle arrive sur le compte américain.' } : { pourquoi: 'La caisse Zelle n’est pas ouverte.' };
  }
  if (famille === 'kkiapay') {
    const c = nommee(CAISSE_KKIAPAY);
    if (c) return { caisse: c, pourquoi: 'Payé en ligne par KkiaPay.' };
  }
  /* LA CAISSE AU NOM DU PAIEMENT. Une caisse du paiement qu'on aurait mise à
     part à la main la reçoit quand même : sa règle est « chaque paiement a sa
     caisse », sans exception. */
  const fam: FamilleDeCaisse = familleDeCaisse(o.methode) ?? 'autre';
  const b = laCaisseDuPaiement(ouvertes, o.branchId, fam);
  if (b) return { caisse: b.name, pourquoi: POURQUOI[fam] };
  const canon = CAISSES_DES_PAIEMENTS[fam];
  const aCreer = ranimee(canon.id(o.branchId), canon.nom, () => caisseNeuveDuPaiement(fam, o.branchId));
  return { caisse: aCreer.name, pourquoi: `${POURQUOI[fam]} Elle naît à ce premier encaissement.`, aCreer };
}

/** POSER LA CAISSE QUI NAÎT : ajoutée, ou rouverte si elle était rangée
    (même identifiant). */
export function poseLaCaisse<B extends Cashbox>(boxes: readonly B[], neuve: Cashbox): B[] {
  return boxes.some((b) => b.id === neuve.id)
    ? boxes.map((b) => (b.id === neuve.id ? { ...b, archiveeLe: undefined } : b))
    : [...boxes, neuve as B];
}

/** QUI PEUT CHANGER LA CAISSE. La direction toujours ; les autres seulement
    quand rien ne se propose (un billet étranger sans tiroir à sa devise). */
export const peutChangerLaCaisse = (estDirection: boolean, p: Pick<CaisseProposee, 'caisse'>): boolean =>
  estDirection || !p.caisse;

/** LES CAISSES QU'ON OFFRE AU CHOIX. Jamais une caisse de caissier (elles ne
    reçoivent plus rien depuis le 21 octobre 2026) ; jamais les années
    passées pour un rendez-vous de l'année ; jamais MND PAY à la main (seul
    FedaPay y fait entrer). `staffId` reste pour les appels d'avant. */
export function caissesAuChoix<B extends Boite>(boxes: readonly B[], o: {
  staffId?: string; estDirection: boolean; anneePassee: boolean; garder?: string;
}): B[] {
  return boxes.filter((b) => {
    if (b.name === o.garder) return true;
    if (b.name === CAISSE_MND_PAY) return false;
    /* L'épargne, jamais au comptoir (le tri du 19 octobre 2026) : la
       direction non plus ne l'y choisit. */
    if (b.horsEncaissement) return false;
    if (b.name === CAISSE_ANNEES_PASSEES) return o.anneePassee;
    if (b.caissierId) return false;
    return true;
  });
}

/** Les caisses qui ne se comptent jamais le soir : celle des années passées
    (l'histoire), MND PAY (l'argent est chez FedaPay), les chèques (des
    chèques, pas des billets, sous leur nom d'avant et d'aujourd'hui), la
    carte (l'argent est chez la banque) et les autres moyens (Wave, PayPal…
    rien qui se compte au tiroir). */
export const HORS_CLOTURE: readonly string[] = [CAISSE_ANNEES_PASSEES, CAISSE_MND_PAY, CAISSE_CHEQUE, ANCIEN_NOM_CHEQUES, CAISSE_CARTE, CAISSE_AUTRES];

/* ══ FONDRE UNE CAISSE DANS UNE AUTRE — 17 octobre 2026 ═════════════════
   « Reprise 2025 » : « tout fondre dans Années passées » (sa décision). Toutes
   les cases qui la nomment, dans les treize sortes d'écritures, passent à la
   caisse qui la reçoit, chacune gardant son ancien nom à côté
   (`…AvantFusion`) pour qu'on défasse la fusion sans toucher à la bascule
   d'octobre ; son solde d'ouverture passe aussi, puis elle est rangée. */
export const SUFFIXE_FUSION = 'AvantFusion';
export const fusionneLEcriture = <T>(sorte: Sorte, e: T, de: string, vers: string): T =>
  reecritLEcriture(sorte, e, (nom) => (nom === de ? vers : undefined), SUFFIXE_FUSION);
export const defaisLaFusionDeLEcriture = <T>(sorte: Sorte, e: T, de: string): T => rendsLEcriture(sorte, e, SUFFIXE_FUSION, de);
/** Combien de cases nomment encore la caisse. 0 : la fusion est complète. */
export function casesQuiNomment(lots: Partial<Record<Sorte, readonly unknown[]>>, nom: string): number {
  let n = 0;
  for (const [sorte, liste] of Object.entries(lots) as [Sorte, readonly unknown[]][]) {
    for (const e of liste ?? []) n += casesDe(sorte, e).filter((c) => c.nom === nom).length;
  }
  return n;
}
/** Les caisses après la fusion : celle qui reçoit existe (née au besoin),
    prend le solde d'ouverture ; celle qui part est rangée et dit où. */
export function caissesApresFusion<B extends Cashbox>(
  boxes: readonly B[], branchId: string, de: string, vers: string, le: string, neuve: () => B,
): B[] {
  const source = boxes.find((b) => b.branchId === branchId && b.name === de && !b.archiveeLe);
  if (!source) return [...boxes];
  let liste: B[] = [...boxes];
  if (!liste.some((b) => b.branchId === branchId && b.name === vers && !b.archiveeLe)) {
    const n = neuve();
    liste = liste.some((b) => b.id === n.id)
      ? liste.map((b) => (b.id === n.id ? { ...b, archiveeLe: undefined } : b))
      : [...liste, n];
  }
  const ouverture = source.openingXof ?? 0;
  return liste.map((b) => {
    if (b.id === source.id) return { ...b, archiveeLe: le, fondueDans: vers, avantLaFusion: { openingXof: ouverture }, openingXof: 0 };
    if (b.branchId === branchId && b.name === vers && !b.archiveeLe) return { ...b, openingXof: (b.openingXof ?? 0) + ouverture };
    return b;
  });
}
/** Le retour : la caisse fondue revient, avec son ouverture ; celle qui
    l'avait reçue la rend. */
export function caissesApresDefaire<B extends Cashbox>(boxes: readonly B[], branchId: string, de: string): B[] {
  const source = boxes.find((b) => b.branchId === branchId && b.name === de && !!b.fondueDans);
  if (!source) return [...boxes];
  const ouverture = source.avantLaFusion?.openingXof ?? 0;
  const vers = source.fondueDans!;
  return boxes.map((b) => {
    if (b.id === source.id) {
      const { fondueDans: _f, avantLaFusion: _a, archiveeLe: _r, ...reste } = b;
      return { ...reste, openingXof: ouverture } as B;
    }
    if (b.branchId === branchId && b.name === vers && !b.archiveeLe) return { ...b, openingXof: (b.openingXof ?? 0) - ouverture };
    return b;
  });
}
