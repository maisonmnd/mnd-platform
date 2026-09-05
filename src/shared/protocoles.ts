import type { Appointment } from './agenda';
import type { Service, CatalogCategory } from './catalog';
import { servicesStore, categoriesStore } from './catalog';

/* ══ CE QUI DOIT SUIVRE UNE COULEUR — 5 septembre 2026 ══════════════

   « La suite naturelle des soins qui sont pré-requis suite à une décoloration,
   coloration » puis « se référer aux différents soins du catalogue. Tu peux
   également construire une suite naturelle, un protocole qu'on mettra au
   catalogue avec des prix associés » (Yéman).

   LE CATALOGUE DIT DÉJÀ L'ORDRE, en toutes lettres, dans ses descriptions :

   · YÈKPÈ™ Couleur inclut « DÀNDÀN™ post couleur » — la Maison sait qu'une
     couleur assèche, et le premier soin est déjà vendu avec elle.
   · WÈWÈ™ se prend « tous les 3 mois, OU AVANT TOUT SOIN RÉPARATEUR ».
   · GBÌGBÌ™ Essentiel vise les « locks fragilisées ou POST CHIMIQUES ».
   · PLT·60 vend déjà des COMBINAISONS à prix propre : vendre une suite n'est
     pas une nouveauté ici, c'est une habitude de la Maison.

   ON N'INVENTE DONC RIEN, ON ÉCRIT CE QUI EST DÉJÀ DIT. Le protocole ci-dessous
   n'emploie que des prestations existantes, dans l'ordre que leurs propres
   descriptions commandent. Les intervalles, eux, sont une proposition : c'est le
   seul endroit où la Maison doit trancher, et ils se corrigent ici en une ligne.

   LE PROTOCOLE NE POSE RIEN TOUT SEUL. Il DIT ce qui est dû et quand ; c'est le
   comptoir qui pose le rendez-vous. Un agenda qui se remplit sans qu'on l'ait
   demandé fait perdre plus de temps qu'il n'en donne. */

/** Une étape : un délai depuis la couleur, une prestation, et pourquoi elle. */
export type EtapeProtocole = {
  /** Jours après la couleur. */
  jours: number;
  /** Le CODE ERP de la prestation attendue, sans son suffixe de longueur —
      c'est la seule chose qui ne bouge jamais (voir `idOf` du catalogue) : un
      renommage de prestation ne doit pas casser le protocole. */
  code: string;
  nom: string;
  pourquoi: string;
};

/** LES ACTES QUI DÉCLENCHENT LE PROTOCOLE — toute couleur végétale, et la
    Sublimation qui la contient. Reconnus par leur code, jamais par leur nom. */
export const CODES_COULEUR = ['ATL·III·COU', 'ATL·III·SUB', 'PLT·60·CL'] as const;

export const PROTOCOLE_COULEUR: EtapeProtocole[] = [
  {
    jours: 14,
    code: 'PLT·40',
    nom: 'GBÌGBÌ™ Module · Soin Reconstruction',
    pourquoi: 'La couleur ouvre la cuticule. On la referme avant qu’elle ne casse.',
  },
  {
    jours: 30,
    code: 'PLT·10',
    nom: 'DÀNDÀN™ · Le Soin Hydratant',
    pourquoi: 'Un mois après, la fibre a soif. C’est le soin que la couleur inclut déjà le jour même.',
  },
  {
    jours: 45,
    code: 'PLT·20',
    nom: 'WÈWÈ™ · La Purification',
    pourquoi: 'Détox avant de reprendre le cycle courant, comme avant tout soin réparateur.',
  },
];

/* ══ LE PROGRAMME DE POUSSE — 5 septembre 2026 ══════════════════════

   « Les clients veulent avoir les cheveux qui poussent rapidement. Définis un
   protocole de soins qui permette de visualiser les étapes pour obtenir les
   résultats » (Yéman).

   LA VITESSE DE POUSSE NE SE CHANGE PAS. Un cuir chevelu sain pousse d'environ
   un centimètre par mois, chez tout le monde, et promettre le contraire se
   retourne contre la Maison au troisième mois — quand la cliente mesure.

   CE QUE LA MAISON CHANGE, C'EST CE QU'ON GARDE. La casse mange la pousse : deux
   têtes qui ont poussé pareil n'ont pas la même longueur à l'arrivée. Le
   programme protège les centimètres au lieu d'en promettre davantage, et c'est
   une promesse que la mèche témoin vérifie.

   UN CYCLE DE DOUZE SEMAINES, qui se répète. Il se GREFFE sur le resserrage,
   il ne le remplace pas : SÍNSIN™ garde son rythme à elle. */
export const CODES_POUSSE = ['PLT·30', 'PLT·30·CUR'] as const;

export const PROTOCOLE_POUSSE: EtapeProtocole[] = [
  {
    jours: 28,
    code: 'PLT·10',
    nom: 'DÀNDÀN™ · Le Soin Hydratant',
    pourquoi: 'Une fibre sèche casse, et ce qui casse ne se rattrape pas.',
  },
  {
    jours: 56,
    code: 'PLT·40',
    nom: 'GBÌGBÌ™ Module · Soin Reconstruction',
    pourquoi: 'On ferme ce qui s’ouvre. C’est le geste qui garde les centimètres.',
  },
  {
    jours: 84,
    code: 'PLT·20',
    nom: 'WÈWÈ™ · La Purification, puis on remesure',
    pourquoi: 'Le cycle se referme sur une preuve : comptage et mèche témoin.',
  },
];

/* ── LE PROTOCOLE VENDU D'UN SEUL TENANT ────────────────────────────
   « Un protocole qu'on mettra au catalogue avec des prix associés ». Trois
   lignes du Plateau, une seule vente, comme PLT·60·WD le fait déjà pour
   WÈWÈ™ + DÀNDÀN™.

   LES PRIX SONT UNE PROPOSITION, et ils se corrigent au Catalogue comme
   n'importe quel autre. À la carte, en mi-long : 30 000 + 22 000 + 28 000 =
   80 000 ; le protocole en demande 68 000. Le geste de la Maison est de 12 000,
   et il se voit sur la pièce parce que chaque ligne garde son prix plein. */
export const CODE_PROTOCOLE = 'PLT·60·PC';
export const CAT_PROTOCOLE = 'plt-60';

const LONGUEURS: { s: string; mot: string; prix: number; duree: number }[] = [
  { s: 'C', mot: 'Court', prix: 48_000, duree: 165 },
  { s: 'M', mot: 'Mi-Long', prix: 68_000, duree: 225 },
  { s: 'L', mot: 'Long ou haute densité', prix: 92_000, duree: 275 },
];

const idDuCode = (code: string): string =>
  `sv-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

/** Les trois lignes du protocole, une par longueur — même forme que le reste
    du Plateau, pour qu'il se vende sans qu'on ait rien à apprendre. */
export const SERVICES_PROTOCOLE: Service[] = LONGUEURS.map((l) => ({
  id: idDuCode(`${CODE_PROTOCOLE}·${l.s}`),
  code: `${CODE_PROTOCOLE}·${l.s}`,
  categoryId: CAT_PROTOCOLE,
  name: `Le Protocole Post-Couleur · ${l.mot}`,
  description: 'Les trois soins qui suivent une couleur, vendus ensemble : reconstruction à deux semaines, hydratation à un mois, purification à six semaines. Les rendez-vous se posent au fur et à mesure.',
  palier: 'Élévation',
  priceXof: l.prix,
  hidePrice: false,
  priceMode: 'fixe',
  sessions: 3,
  master: '',
  durationMin: l.duree,
  order: 0,
  /* CE QU'IL CONTIENT, à la longueur correspondante : la pièce dira les trois
     soins et ce que la Maison donne. */
  includes: PROTOCOLE_COULEUR.map((e) => ({ serviceId: idDuCode(`${e.code}·${l.s}`) })),
}));

/** Combien de lignes du protocole manquent au catalogue. */
export const protocoleAbsent = (services: readonly Service[]): number =>
  SERVICES_PROTOCOLE.filter((p) => !services.some((s) => s.id === p.id)).length;

/** POSER LE PROTOCOLE AU CATALOGUE. N'écrase JAMAIS ce qui existe : des prix
    sont une décision de maison, et une décision ne se réécrit pas dans le dos
    de celui qui l'a prise. */
export function poseLeProtocoleAuCatalogue(): number {
  const cats = categoriesStore.get();
  if (!cats.some((c) => c.id === CAT_PROTOCOLE)) {
    const neuve: CatalogCategory = {
      id: CAT_PROTOCOLE, fon: 'Combinaisons', label: 'les suites qui se vendent ensemble',
      enabled: true, order: 660, code: 'PLT·60',
    };
    categoriesStore.set((prev) => [...prev, neuve]);
  }
  const avant = servicesStore.get();
  const aPoser = SERVICES_PROTOCOLE.filter((p) => !avant.some((s) => s.id === p.id));
  if (aPoser.length > 0) servicesStore.set((prev) => [...prev, ...aPoser.map((s) => ({ ...s }))]);
  return aPoser.length;
}

/* ══ LE SUIVI D'UNE TÊTE ════════════════════════════════════════════ */

export type EtatEtape = 'fait' | 'pose' | 'a-poser' | 'en-retard' | 'a-venir';

export type EtapeSuivie = EtapeProtocole & {
  /** Le jour où elle est attendue. */
  dueIso: string;
  etat: EtatEtape;
  /** Le rituel qui l'a honorée, quand il existe. */
  faitLe?: string;
  /** LE RENDEZ-VOUS DÉJÀ PRIS — 5 septembre 2026.

      « Il faut rajouter le RDV programmé, et si c'est fait ou pas, ou en
      retard » (Yéman).

      UNE ÉTAPE QUI DIT « À POSER » ALORS QUE LE RENDEZ-VOUS EST PRIS est une
      alerte fausse, et deux alertes fausses suffisent à ce qu'on ne lise plus
      les vraies. Le comptoir rappellerait une cliente qui a déjà sa date. */
  poseLe?: string;
};

/** LA MARGE DE COURTOISIE. Un soin attendu le 4 n'est pas « en retard » le 5 :
    on ne relance pas une cliente pour trois jours, et une alerte qui crie trop
    tôt finit par ne plus se lire. */
export const GRACE_JOURS = 7;

const plusDeJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
};

/** Le code d'une prestation, sans son suffixe de longueur. */
const codeNu = (code?: string): string => (code ?? '').replace(/·[CML]$/, '');

/** LA DERNIÈRE COULEUR D'UNE TÊTE — le point de départ du protocole.

    ON NE REMONTE QUE LES RITUELS HONORÉS : une couleur annulée n'ouvre aucun
    protocole, et une couleur seulement prévue n'a rien commencé. */
export function derniereCouleur(
  appts: readonly Appointment[],
  clientId: string,
  byId: Map<string, Service>,
): Appointment | undefined {
  return dernierDeclencheur(appts, clientId, byId, CODES_COULEUR);
}

/** OÙ EN EST LE PROTOCOLE d'une tête, étape par étape.

    UNE ÉTAPE EST FAITE QUAND LA PRESTATION A ÉTÉ RENDUE APRÈS LA COULEUR, dans
    l'ordre. On avance dans l'agenda en même temps que dans le protocole : sans
    cela, un DÀNDÀN™ rendu une fois cocherait toutes les étapes qui le
    demandent, et la Maison croirait avoir donné trois soins pour un. */
export function suivreLeProtocole(o: {
  couleur: Appointment;
  appts: readonly Appointment[];
  byId: Map<string, Service>;
  aujourdhui: string;
  etapes?: readonly EtapeProtocole[];
}): EtapeSuivie[] {
  const etapes = o.etapes ?? PROTOCOLE_COULEUR;
  const apres = o.appts
    .filter((a) => a.clientId === o.couleur.clientId && a.status === 'honoré' && a.date > o.couleur.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  /* LES RENDEZ-VOUS DÉJÀ PRIS, pas encore rendus. Un rituel annulé n'en est
     pas un ; un rituel passé et jamais honoré non plus — celui-là est un
     manquement, pas une promesse. */
  const prevus = o.appts
    .filter((a) => a.clientId === o.couleur.clientId && a.date >= o.aujourdhui
      && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date));
  const consommes = new Set<string>();
  const promis = new Set<string>();
  const limite = plusDeJours(o.aujourdhui, GRACE_JOURS);
  const tot = plusDeJours(o.aujourdhui, -GRACE_JOURS);

  return etapes.map((e) => {
    const dueIso = plusDeJours(o.couleur.date, e.jours);
    const rendu = apres.find((a) => !consommes.has(a.id)
      && a.serviceIds.some((id) => codeNu(o.byId.get(id)?.code) === e.code));
    if (rendu) {
      consommes.add(rendu.id);
      return { ...e, dueIso, etat: 'fait' as EtatEtape, faitLe: rendu.date };
    }
    /* LE RENDEZ-VOUS PRIS L'EMPORTE SUR LE CALENDRIER : une étape dont la date
       est passée mais qui a son rendez-vous n'est pas « en retard », elle est
       posée. On ne relance pas quelqu'un qui a déjà dit oui. */
    const prevu = prevus.find((a) => !promis.has(a.id)
      && a.serviceIds.some((id) => codeNu(o.byId.get(id)?.code) === e.code));
    if (prevu) {
      promis.add(prevu.id);
      return { ...e, dueIso, etat: 'pose' as EtatEtape, poseLe: prevu.date };
    }
    const etat: EtatEtape = dueIso < tot ? 'en-retard' : dueIso <= limite ? 'a-poser' : 'a-venir';
    return { ...e, dueIso, etat };
  });
}

export const MOT_DE_L_ETAT: Record<EtatEtape, string> = {
  fait: 'fait',
  pose: 'rendez-vous pris',
  'a-poser': 'à poser',
  'en-retard': 'en retard',
  'a-venir': 'à venir',
};

/** LE DÉCLENCHEUR D'UN PROTOCOLE — le rituel honoré qui l'a ouvert.

    ON NE REMONTE QUE LES RITUELS HONORÉS : un acte annulé n'ouvre rien, et un
    acte seulement prévu n'a rien commencé. */
export function dernierDeclencheur(
  appts: readonly Appointment[],
  clientId: string,
  byId: Map<string, Service>,
  codes: readonly string[],
): Appointment | undefined {
  return appts
    .filter((a) => a.clientId === clientId && a.status === 'honoré')
    .filter((a) => a.serviceIds.some((id) => codes.includes(codeNu(byId.get(id)?.code))))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Le programme de pousse d'une tête, ouvert par son dernier VÍVÍVÓ™. */
export const dernierActivateur = (
  appts: readonly Appointment[], clientId: string, byId: Map<string, Service>,
): Appointment | undefined => dernierDeclencheur(appts, clientId, byId, CODES_POUSSE);

/** LE JOUR OÙ LE PROGRAMME S'OUVRE — la décision de la Maison d'abord.

    UNE DÉCISION PASSE AVANT UNE DÉDUCTION. `programmeDepuis` est posé à la
    main sur la fiche ; sans lui, on retombe sur le dernier VÍVÍVÓ™ honoré, qui
    reste juste neuf fois sur dix. Rien des deux : le programme n'est pas
    ouvert, et on ne l'invente pas. */
export function ouvertureDuProgramme(o: {
  pose?: string;
  appts: readonly Appointment[];
  clientId: string;
  byId: Map<string, Service>;
}): { depart: Appointment | undefined; pose: boolean } {
  const p = (o.pose ?? '').trim();
  if (p) {
    /* Un rendez-vous de façade : le moteur ne lit que `clientId` et `date`, et
       la date posée n'appartient à aucun rituel — c'est bien le propos. */
    return { depart: { id: 'programme-pose', clientId: o.clientId, date: p, serviceIds: [] } as unknown as Appointment, pose: true };
  }
  return { depart: dernierActivateur(o.appts, o.clientId, o.byId), pose: false };
}
