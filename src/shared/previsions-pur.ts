/* ══ LES PRÉVISIONS — 26 octobre 2026 ═══════════════════════════════════
   « Il faut construire un meilleur système pour les prévisions à venir, et
   savoir le nombre de fauteuils qu'on pourrait remplir, de façon
   atteignable, si on met en place un système marketing » (Yéman).
   Maquette 1opRHqoVJHVA3oHxVw5kcM. Choix au sélecteur : le plafond est ce
   qui a été fait au moins un jour sur dix, l'horizon s'ouvre sur quatre
   semaines, les taux du marketing sont MESURÉS seulement, et la rubrique vit
   en Direction, sous le Centre de commande.

   ON COMPTE DES RENDEZ-VOUS, PAS DES FRANCS : le chiffre en francs reste à
   la prévision du Tableau de bord (`prevision-du-mois-pur`), dont on reprend
   le taux d'honneur, la justesse de la Cadence et leurs valeurs par défaut.

   TROIS CHIFFRES, CHACUN SE RECOMPOSE ICI :
   ① LA PRÉVISION SANS RIEN FAIRE :
      - les POSÉS de l'horizon : un honoré compte pour un, les autres au taux
        de venues honorées des douze derniers mois ;
      - les REPRISES À L'HEURE que la Cadence attend dans l'horizon, chez les
        clientes sans rendez-vous, à la justesse mesurée du juge ;
      - les NOUVELLES CLIENTES au rythme des douze derniers mois, moins
        celles qui ont déjà posé (elles sont dans les posés).
      Une cliente EN RETARD ou ENDORMIE n'y compte pas : sans relance, on ne
      l'attend pas. Elle est la base du marketing.
   ② LE PLAFOND ATTEIGNABLE : chaque jour ouvert de l'horizon vaut le plafond
      de son jour de la semaine (`objectifs-des-fauteuils-pur`, fait au moins
      un jour sur dix). Ce que les fauteuils permettraient s'ils tournaient
      sans arrêt se dit à côté, pour mémoire : jamais vécu.
   ③ LE MARKETING : chaque levier vaut sa base × son taux MESURÉ sur les
      douze derniers mois (une tête jointe qui prend un rendez-vous dans les
      quatorze jours). Sous vingt envois mesurables, le levier se dit « à
      mesurer » et compte zéro : on n'invente pas de taux. Le total est borné
      aux places libres, le plafond moins la prévision.

   Pur : `scripts/verifie-les-previsions.mjs` le prouve. */

import { ajouteJours, jourDeSemaine, reperesDe, NOMS_DES_JOURS, type ReperesDuJour } from './objectifs-des-fauteuils-pur';
import { devenuDe, type EnvoiLu } from './envois';
import { attendEncore } from './salle-des-envois';
import { JUSTESSE_PAR_DEFAUT, TAUX_D_HONNEUR_PAR_DEFAUT } from './prevision-du-mois-pur';

export type HorizonDesPrevisions = '4s' | 'mois' | '3m';
export const HORIZONS_DES_PREVISIONS: readonly HorizonDesPrevisions[] = ['4s', 'mois', '3m'];

/** Une colonne du dessin : une semaine, ou un mois. */
export type Colonne = { cle: string; nom: string; debut: string; fin: string };

export type BornesDeLHorizon = {
  horizon: HorizonDesPrevisions;
  debut: string;
  fin: string;
  titre: string;
  colonnes: Colonne[];
  /** La durée en mois (jours ÷ 30,4375), pour le rythme des nouvelles. */
  mois: number;
};

export const JOURS_PAR_MOIS = 30.4375;
const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const dernierDuMois = (mk: string): string => {
  const [a, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const moisPlus = (mk: string, k: number): string => {
  const [a, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + k, 1)).toISOString().slice(0, 7);
};
const joursEntre = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const leJourCourt = (j: string): string => `${Number(j.slice(8, 10))} ${MOIS_COURTS[Number(j.slice(5, 7)) - 1]}`;

/** LE MOIS QUI S'OUVRE : jusqu'au 15, le mois en cours (ce qu'il en reste) ;
    après, le mois suivant entier. Le 26 octobre, c'est novembre. */
export const premierMoisDesPrevisions = (aujourdhui: string): string =>
  Number(aujourdhui.slice(8, 10)) <= 15 ? aujourdhui.slice(0, 7) : moisPlus(aujourdhui.slice(0, 7), 1);

/** Le libellé du bouton d'un horizon : « 4 semaines », « Novembre », « 3 mois ». */
export const nomDeLHorizon = (h: HorizonDesPrevisions, aujourdhui: string): string =>
  h === '4s' ? '4 semaines' : h === '3m' ? '3 mois' : majuscule(NOMS_DES_MOIS[Number(premierMoisDesPrevisions(aujourdhui).slice(5, 7)) - 1]);

const semaines = (debut: string, fin: string): Colonne[] => {
  const out: Colonne[] = [];
  for (let d = debut; d <= fin; d = ajouteJours(d, 7)) {
    const f = ajouteJours(d, 6) < fin ? ajouteJours(d, 6) : fin;
    out.push({ cle: d, nom: leJourCourt(d), debut: d, fin: f });
  }
  return out;
};

export function bornesDeLHorizon(h: HorizonDesPrevisions, aujourdhui: string): BornesDeLHorizon {
  const fait = (debut: string, fin: string, titre: string, colonnes: Colonne[]): BornesDeLHorizon =>
    ({ horizon: h, debut, fin, titre, colonnes, mois: (joursEntre(debut, fin) + 1) / JOURS_PAR_MOIS });
  if (h === '4s') {
    const fin = ajouteJours(aujourdhui, 27);
    return fait(aujourdhui, fin, 'Les quatre prochaines semaines', semaines(aujourdhui, fin));
  }
  const mk = premierMoisDesPrevisions(aujourdhui);
  const debutDe = (m: string) => (`${m}-01` > aujourdhui ? `${m}-01` : aujourdhui);
  if (h === 'mois') {
    const debut = debutDe(mk);
    const nom = `${majuscule(NOMS_DES_MOIS[Number(mk.slice(5, 7)) - 1])} ${mk.slice(0, 4)}`;
    return fait(debut, dernierDuMois(mk), `${nom}, semaine par semaine`, semaines(debut, dernierDuMois(mk)));
  }
  const mois = [0, 1, 2].map((k) => moisPlus(mk, k));
  const colonnes = mois.map((m) => ({ cle: m, nom: majuscule(NOMS_DES_MOIS[Number(m.slice(5, 7)) - 1]), debut: debutDe(m), fin: dernierDuMois(m) }));
  return fait(colonnes[0].debut, colonnes[2].fin, 'Les trois prochains mois, mois par mois', colonnes);
}

/* ── CE QUE LE CALCUL LIT ─────────────────────────────────────────────── */

/** Un rendez-vous de la branche. `creeLe` : l'instant où il a été pris. */
export type RdvDesPrevisions = { clientId: string; date: string; status: string; creeLe?: string };

/** LE TAUX D'HONNEUR, la règle du Tableau de bord : les douze derniers mois,
    honorés sur honorés et annulés. Sous dix rendez-vous passés, 90 %, dit. */
export function honneurDesDouzeMois(rdvs: readonly RdvDesPrevisions[], aujourdhui: string): { honores: number; annules: number; taux: number; parDefaut: boolean } {
  const ilYAUnAn = ajouteJours(aujourdhui, -365);
  const passes = rdvs.filter((a) => a.date >= ilYAUnAn && a.date < aujourdhui);
  const honores = passes.filter((a) => a.status === 'honoré').length;
  const annules = passes.filter((a) => a.status === 'annulé').length;
  const parDefaut = honores + annules < 10;
  return { honores, annules, taux: parDefaut ? TAUX_D_HONNEUR_PAR_DEFAUT : honores / (honores + annules), parDefaut };
}

export type NouvellesClientes = {
  /** Clientes dont la première venue honorée tombe dans les douze derniers mois. */
  douzeMois: number;
  /** Parmi elles, les filleules d'une marraine. */
  filleules: number;
  /** Clientes jamais venues qui ont déjà un rendez-vous dans l'horizon. */
  dejaPosees: number;
};

/** UNE CLIENTE EST NOUVELLE le jour de sa première venue honorée. */
export function nouvellesClientes(
  rdvs: readonly RdvDesPrevisions[],
  estFilleule: (clientId: string) => boolean,
  aujourdhui: string,
  bornes: Pick<BornesDeLHorizon, 'debut' | 'fin'>,
): NouvellesClientes {
  const premiere = new Map<string, string>();
  for (const a of rdvs) {
    if (a.status !== 'honoré' || !a.clientId) continue;
    const p = premiere.get(a.clientId);
    if (!p || a.date < p) premiere.set(a.clientId, a.date);
  }
  const ilYAUnAn = ajouteJours(aujourdhui, -365);
  let douzeMois = 0; let filleules = 0;
  for (const [id, j] of premiere) {
    if (j < ilYAUnAn || j >= aujourdhui) continue;
    douzeMois += 1;
    if (estFilleule(id)) filleules += 1;
  }
  const posees = new Set<string>();
  for (const a of rdvs) {
    if (!a.clientId || a.status === 'annulé' || a.date < bornes.debut || a.date > bornes.fin) continue;
    const p = premiere.get(a.clientId);
    if (!p || p >= aujourdhui) posees.add(a.clientId);
  }
  return { douzeMois, filleules, dejaPosees: posees.size };
}

/* ── LA MESURE D'UN LEVIER ───────────────────────────────────────────── */

/** Sous tant d'envois mesurables, un levier se dit « à mesurer ». */
export const ENVOIS_POUR_MESURER = 20;
/** Un rendez-vous pris dans tant de jours après l'envoi est une réponse. */
export const JOURS_DE_REPONSE = 14;

export type MesureDuLevier = { envois: number; revenues: number; taux: number | null };

/** CE QU'UN ENVOI A RAMENÉ. Compte : un message parti (lu, remis, en route,
    ou envoyé à la main) vers une fiche, sur les douze derniers mois, dont les
    quatorze jours sont écoulés ; une tête n'est comptée qu'une fois par jour
    d'envoi. Il a ramené si la cliente a PRIS un rendez-vous (`creeLe`) dans
    les quatorze jours, non annulé. Un rendez-vous sans date de prise ne
    compte pas : on ne devine pas. */
export function mesureDesEnvois(envois: readonly EnvoiLu[], rdvs: readonly RdvDesPrevisions[], aujourdhui: string): MesureDuLevier {
  const depuis = ajouteJours(aujourdhui, -365);
  const jusqua = ajouteJours(aujourdhui, -JOURS_DE_REPONSE);
  const partis = new Map<string, { clientId: string; quand: string }>();
  for (const e of envois) {
    if (!e.clientId || attendEncore(e)) continue;
    const d = devenuDe(e);
    if (d !== 'lu' && d !== 'remis' && d !== 'en-route' && d !== 'a-la-main') continue;
    const jour = String(e.quand ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour < depuis || jour > jusqua) continue;
    const cle = `${e.clientId}|${jour}`;
    const deja = partis.get(cle);
    if (!deja || e.quand < deja.quand) partis.set(cle, { clientId: e.clientId, quand: e.quand });
  }
  const parCliente = new Map<string, string[]>();
  for (const a of rdvs) {
    if (!a.creeLe || a.status === 'annulé') continue;
    const l = parCliente.get(a.clientId);
    if (l) l.push(a.creeLe); else parCliente.set(a.clientId, [a.creeLe]);
  }
  let revenues = 0;
  for (const p of partis.values()) {
    const fin = new Date(Date.parse(p.quand) + JOURS_DE_REPONSE * 86_400_000).toISOString();
    if ((parCliente.get(p.clientId) ?? []).some((c) => c >= p.quand && c <= fin)) revenues += 1;
  }
  const n = partis.size;
  return { envois: n, revenues, taux: n >= ENVOIS_POUR_MESURER ? revenues / n : null };
}

/* ── LE CALCUL ───────────────────────────────────────────────────────── */

export type EntreesDesPrevisions = {
  aujourdhui: string;
  bornes: BornesDeLHorizon;
  /** Tous les rendez-vous de la branche. */
  rdvs: readonly RdvDesPrevisions[];
  /** Les rendez-vous non annulés de chaque jour (`rdvParJour`). */
  parJour: ReadonlyMap<string, number>;
  ouvertLe: (j: string) => boolean;
  reperes: readonly ReperesDuJour[];
  /** Les reprises À L'HEURE que la Cadence attend, chez les clientes sans rendez-vous. */
  reprises: readonly { iso: string }[];
  /** La justesse du juge (0 à 1), ou null. */
  justesse: number | null;
  nouvelles: NouvellesClientes;
  /** Les clientes en retard sur leur rythme, sans rendez-vous, venues dans les cinq mois. */
  retard: number;
  /** Les clientes sans venue depuis cinq mois et plus, sans rendez-vous. */
  endormies: number;
  relance: MesureDuLevier;
  reveil: MesureDuLevier;
  /** Pour mémoire : ce que les fauteuils permettraient. */
  physique?: { sieges: number; dureeMoyenneMin: number; ouverture: (j: string) => { closed: boolean; openMin: number; closeMin: number } } | null;
};

export type JourDuPlafond = { jour: number; nom: string; jours: number; plafond: number; rdv: number };
export type EtatDuLevier = 'mesure' | 'a-mesurer' | 'inclus';
export type Levier = {
  cle: 'relance' | 'reveil' | 'parrainage' | 'offre';
  nom: string;
  base: string;
  nombre: number | null;
  taux: number | null;
  rdv: number;
  etat: EtatDuLevier;
  mesure: string;
};
export type ColonneDesPrevisions = Colonne & { poses: number; attendus: number; marketing: number; plafond: number };

export type Previsions = {
  poses: { nombre: number; honores: number; taux: number; parDefaut: boolean; rdv: number };
  reprises: { nombre: number; taux: number; parDefaut: boolean; rdv: number };
  nouvelles: NouvellesClientes & { parMois: number; mois: number; attendues: number; rdv: number };
  prevision: number;
  bas: number;
  haut: number;
  plafond: { jours: JourDuPlafond[]; total: number; physique: number | null };
  placesLibres: number;
  leviers: Levier[];
  marketingBrut: number;
  marketing: number;
  colonnes: ColonneDesPrevisions[];
};

const borne01 = (x: number) => Math.max(0, Math.min(1, x));
const s = (n: number) => (n > 1 ? 's' : '');

export function calculeLesPrevisions(e: EntreesDesPrevisions): Previsions {
  const { debut, fin } = e.bornes;
  const dans = (j: string) => j >= debut && j <= fin;

  /* ① LES POSÉS */
  const h = honneurDesDouzeMois(e.rdvs, e.aujourdhui);
  const poses = e.rdvs.filter((a) => a.status !== 'annulé' && dans(a.date));
  const honores = poses.filter((a) => a.status === 'honoré').length;
  const venus = honores + (poses.length - honores) * h.taux;

  /* LES REPRISES À L'HEURE */
  const p = e.justesse ?? JUSTESSE_PAR_DEFAUT;
  const reprises = e.reprises.filter((r) => dans(r.iso));

  /* LES NOUVELLES */
  const parMois = e.nouvelles.douzeMois / 12;
  const attendues = parMois * e.bornes.mois;
  const nouvellesRdv = Math.max(0, attendues - e.nouvelles.dejaPosees);

  const prevision = venus + reprises.length * p + nouvellesRdv;
  const bas = honores + (poses.length - honores) * borne01(h.taux - 0.1) + reprises.length * (p / 2) + nouvellesRdv / 2;
  const haut = honores + (poses.length - honores) * borne01(h.taux + 0.05) + reprises.length * borne01(p * 1.5) + nouvellesRdv * 1.5;

  /* ② LE PLAFOND, jour ouvert par jour ouvert */
  const parSemaine = new Map<number, JourDuPlafond>();
  const plafondDu = new Map<string, number>();
  let physique = 0;
  let joursOuverts = 0;
  for (let j = debut; j <= fin; j = ajouteJours(j, 1)) {
    if (!e.ouvertLe(j) && (e.parJour.get(j) ?? 0) === 0) continue;
    joursOuverts += 1;
    const r = reperesDe(e.reperes, j);
    plafondDu.set(j, r.plafond);
    const s7 = jourDeSemaine(j);
    const l = parSemaine.get(s7) ?? { jour: s7, nom: NOMS_DES_JOURS[s7], jours: 0, plafond: r.plafond, rdv: 0 };
    l.jours += 1; l.rdv += r.plafond;
    parSemaine.set(s7, l);
    if (e.physique && e.physique.dureeMoyenneMin > 0 && e.physique.sieges > 0) {
      const o = e.physique.ouverture(j);
      if (!o.closed) physique += Math.floor(e.physique.sieges * Math.max(0, o.closeMin - o.openMin) / e.physique.dureeMoyenneMin);
    }
  }
  /* Du lundi au dimanche, comme on lit une semaine. Un jour sans plafond
     (fermé, mais un rendez-vous y a été posé) n'ajoute rien : il ne se lit
     pas en ligne. */
  const jours = [1, 2, 3, 4, 5, 6, 0].map((k) => parSemaine.get(k)).filter((l): l is JourDuPlafond => !!l && l.rdv > 0);
  const total = jours.reduce((t, l) => t + l.rdv, 0);
  const placesLibres = Math.max(0, total - prevision);

  /* ③ LE MARKETING */
  const relance: Levier = e.relance.taux !== null
    ? { cle: 'relance', nom: 'Relancer les reprises en retard', base: 'en retard sur leur rythme, sans rendez-vous', nombre: e.retard, taux: e.relance.taux, rdv: e.retard * e.relance.taux, etat: 'mesure',
      mesure: `mesuré sur ${e.relance.envois} reprises proposées` }
    : { cle: 'relance', nom: 'Relancer les reprises en retard', base: 'en retard sur leur rythme, sans rendez-vous', nombre: e.retard, taux: null, rdv: 0, etat: 'a-mesurer',
      mesure: `à mesurer : ${e.relance.envois} reprise${s(e.relance.envois)} proposée${s(e.relance.envois)}, il en faut ${ENVOIS_POUR_MESURER}` };
  const reveil: Levier = e.reveil.taux !== null
    ? { cle: 'reveil', nom: 'Réveiller les endormies', base: 'sans venue depuis cinq mois et plus', nombre: e.endormies, taux: e.reveil.taux, rdv: e.endormies * e.reveil.taux, etat: 'mesure',
      mesure: `mesuré sur ${e.reveil.envois} têtes des campagnes « Dormantes »` }
    : { cle: 'reveil', nom: 'Réveiller les endormies', base: 'sans venue depuis cinq mois et plus', nombre: e.endormies, taux: null, rdv: 0, etat: 'a-mesurer',
      mesure: `à mesurer : ${e.reveil.envois} tête${s(e.reveil.envois)} jointe${s(e.reveil.envois)} par une campagne « Dormantes », il en faut ${ENVOIS_POUR_MESURER}` };
  const leviers: Levier[] = [
    relance,
    reveil,
    { cle: 'parrainage', nom: 'Le parrainage', base: 'les filleules des marraines', nombre: null, taux: null, rdv: 0, etat: 'inclus',
      mesure: `${e.nouvelles.filleules} filleule${s(e.nouvelles.filleules)} en douze mois, déjà dans les nouvelles clientes` },
    { cle: 'offre', nom: 'L’offre du moment', base: 'une offre à durée limitée', nombre: null, taux: null, rdv: 0, etat: 'a-mesurer',
      mesure: 'à mesurer : un rendez-vous ne dit pas encore l’offre qui l’a fait prendre' },
  ];
  const marketingBrut = leviers.reduce((t, l) => t + l.rdv, 0);
  const marketing = Math.min(marketingBrut, placesLibres);

  /* LES COLONNES DU DESSIN : posés et attendus à leur date ; les nouvelles
     au prorata des jours ouverts ; le marketing au prorata des places libres. */
  const colonnes: ColonneDesPrevisions[] = e.bornes.colonnes.map((c) => {
    const dansC = (j: string) => j >= c.debut && j <= c.fin;
    const sesPoses = poses.filter((a) => dansC(a.date));
    const sesHonores = sesPoses.filter((a) => a.status === 'honoré').length;
    let sesJours = 0; let sonPlafond = 0;
    for (const [j, v] of plafondDu) if (dansC(j)) { sesJours += 1; sonPlafond += v; }
    const attendus = reprises.filter((r) => dansC(r.iso)).length * p + (joursOuverts ? nouvellesRdv * sesJours / joursOuverts : 0);
    return { ...c, poses: sesHonores + (sesPoses.length - sesHonores) * h.taux, attendus, marketing: 0, plafond: sonPlafond };
  });
  const libres = colonnes.map((c) => Math.max(0, c.plafond - c.poses - c.attendus));
  const toutLibre = libres.reduce((t, x) => t + x, 0);
  colonnes.forEach((c, i) => { c.marketing = toutLibre > 0 ? marketing * libres[i] / toutLibre : 0; });

  return {
    poses: { nombre: poses.length, honores, taux: h.taux, parDefaut: h.parDefaut, rdv: venus },
    reprises: { nombre: reprises.length, taux: p, parDefaut: e.justesse === null, rdv: reprises.length * p },
    nouvelles: { ...e.nouvelles, parMois, mois: e.bornes.mois, attendues, rdv: nouvellesRdv },
    prevision, bas, haut,
    plafond: { jours, total, physique: e.physique && e.physique.dureeMoyenneMin > 0 && e.physique.sieges > 0 ? physique : null },
    placesLibres,
    leviers,
    marketingBrut,
    marketing,
    colonnes,
  };
}

/** La place d'une cliente dans le calcul. */
export type PlaceDeLaCliente = 'posee' | 'attendue' | 'plus-tard' | 'retard' | 'endormie' | 'hors';

/** UNE CLIENTE N'EST COMPTÉE QU'UNE FOIS. Un rendez-vous à venir la met dans
    les posés ; sinon la Cadence la dit à l'heure (attendue dans l'horizon,
    ou plus tard) ou en retard ; sans prédiction, elle dort si sa dernière
    venue a plus de cinq mois. Celle que le juge écarte (de passage,
    diaspora, locks défaits, jamais venue) est hors du calcul. */
export function placeDeLaCliente(o: {
  aUnRdvAVenir: boolean;
  predit: boolean;
  iso: string | null;
  retardJours: number;
  dort: boolean;
  fin: string;
}): PlaceDeLaCliente {
  if (o.aUnRdvAVenir) return 'posee';
  if (o.predit && o.iso) {
    if (o.retardJours > 0) return 'retard';
    return o.iso <= o.fin ? 'attendue' : 'plus-tard';
  }
  return o.dort ? 'endormie' : 'hors';
}
