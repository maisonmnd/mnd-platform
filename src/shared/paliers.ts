import type { Service } from './catalog';
import type { Appointment } from './agenda';

/* ══ LES TROIS PALIERS — 16 septembre 2026 ══════════════════════════
   Maquette `public/maquette-les-trois-paliers.html`, validée avec ses quatre
   arbitrages : la cliente monte PAR SON CARNET (seuils réglables, jamais de
   descente) ; une main non habilitée AVERTIT au rendez-vous ; les trois
   autres « paliers » du Trône changent de nom (les sceaux du Cercle, les
   seuils de locks, la limite d'envoi) ; Ma Couronne dit son palier à la
   cliente, avec le pas suivant.

   « Comment je peux mieux l'exploiter dans le Trône et faire une vraie
   distinction et un vrai usage, et que le tout soit très clair » (Yéman).

   UN MOT, UNE ÉCHELLE, TROIS PORTES. Fondation, Élévation, Souveraineté
   vivaient sur la seule prestation, et ne décidaient que d'un taux de
   commission. Ils deviennent la colonne vertébrale : la prestation en a un
   (ce qu'elle exige), la cliente en a un (où en est sa couronne), le maître
   en a un (jusqu'où il est habilité). Les trois se lisent avec les mêmes
   mots, et c'est leur rencontre qui fait le sens.

   CE FICHIER EST PUR. Il juge le palier d'une cliente sur ce que son carnet
   dit, et rien d'autre : ni réseau, ni magasin, ni écran. Éprouvé par
   `verifie-paliers`. Le palier d'une cliente NE SE STOCKE PAS : il se lit à
   chaque fois, comme son persona. Un niveau écrit finirait par mentir. */

export type Palier = Service['palier'];

export const PALIERS: readonly Palier[] = ['Fondation', 'Élévation', 'Souveraineté'];

export const RANG_DU_PALIER: Record<Palier, number> = { Fondation: 0, 'Élévation': 1, 'Souveraineté': 2 };

/** CE QUE CHAQUE PALIER DIT — les mêmes phrases partout où il s'affiche.
    `sous` : la marche, pour une prestation. `couronne` : ce que Ma Couronne
    dit à la cliente qui y est. */
export const PALIER_DIT: Record<Palier, { sous: string; couronne: string }> = {
  Fondation: {
    sous: 'Poser les bases, découvrir le rituel.',
    couronne: 'Votre couronne est née. Vous apprenez à la tenir.',
  },
  'Élévation': {
    sous: 'Affirmer sa couronne, séance après séance.',
    couronne: 'Votre couronne se tient. Vous l’entretenez.',
  },
  'Souveraineté': {
    sous: 'La maîtrise, mèche après mèche.',
    couronne: 'Votre couronne a une histoire. La Maison la connaît.',
  },
};

export const palierSuivant = (p: Palier): Palier | null => PALIERS[RANG_DU_PALIER[p] + 1] ?? null;

/** Le plus haut de deux paliers. */
export const plusHautDes = (a: Palier | null, b: Palier | null): Palier | null => {
  if (!a) return b;
  if (!b) return a;
  return RANG_DU_PALIER[b] > RANG_DU_PALIER[a] ? b : a;
};

/* ── LES SEUILS ───────────────────────────────────────────────────── */

export type SeuilsDePalier = {
  /** Élévation au Nᵉ rituel honoré. */
  elevationRituels: number;
  /** … ou à N mois de couronne, le premier des deux. */
  elevationMois: number;
  /** Souveraineté au premier acte de Souveraineté honoré, ou à N mois de couronne. */
  souveraineteMois: number;
};

/** Les seuils proposés le 16 septembre 2026. Ils se règlent dans Paramètres. */
export const SEUILS_DEFAUT: SeuilsDePalier = { elevationRituels: 3, elevationMois: 6, souveraineteMois: 18 };

/** UN SEUIL ABSENT OU ABSURDE RETOMBE SUR LE DÉFAUT : un zéro ferait monter
    tout le monde au premier jour, un texte casserait la lecture. */
export const seuilsPropres = (s: Partial<SeuilsDePalier> | undefined): SeuilsDePalier => {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : d);
  return {
    elevationRituels: n(s?.elevationRituels, SEUILS_DEFAUT.elevationRituels),
    elevationMois: n(s?.elevationMois, SEUILS_DEFAUT.elevationMois),
    souveraineteMois: n(s?.souveraineteMois, SEUILS_DEFAUT.souveraineteMois),
  };
};

/* ── LES DATES, SANS FUSEAU ───────────────────────────────────────── */

/** Le jour LOCAL : entre minuit et une heure à Cotonou, la date UTC est
    encore celle d'hier. */
export const jourLocal = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Mois révolus entre deux jours ISO. Même règle que `monthsOfService`
    (equipe/payroll.ts) : le jour du mois doit être atteint. */
export const moisEntre = (depuis: string, jusqua: string): number => {
  const s = depuis.slice(0, 10).split('-').map(Number);
  const u = jusqua.slice(0, 10).split('-').map(Number);
  if (s.length < 3 || u.length < 3 || s.some((x) => !Number.isFinite(x)) || u.some((x) => !Number.isFinite(x))) return 0;
  let mois = (u[0] - s[0]) * 12 + (u[1] - s[1]);
  if (u[2] < s[2]) mois -= 1;
  return Math.max(0, mois);
};

/** Le jour ISO N mois après un jour ISO (le 31 se ramène à la fin du mois). */
export const plusDesMois = (iso: string, n: number): string => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(j, dernier));
  return jourLocal(d);
};

/* ── LE PALIER D'UNE CLIENTE ──────────────────────────────────────── */

/** Un rituel honoré, réduit à ce qui compte : son jour, et les paliers de
    ses prestations. */
export type RituelHonore = { date: string; paliers: Palier[] };

export type PalierDeLaCliente = {
  /** `null` : aucun rituel honoré, la Maison ne dit rien de ce qu'elle n'a pas vu. */
  palier: Palier | null;
  /** Le jour où elle a atteint ce palier. */
  depuis: string | null;
  /** Ce qui l'y a menée : « 3 rituels honorés », « un acte de Souveraineté honoré ». */
  motif: string;
  /** « 7 rituels honorés · 11 mois de couronne ». */
  resume: string;
  rituels: number;
  moisDeCouronne: number | null;
  /** Le plus haut palier d'acte qu'elle a vécu. */
  plusHautActe: Palier | null;
};

const leplusTot = (a: string | undefined, b: string | undefined): string | undefined =>
  (a && b ? (a <= b ? a : b) : (a ?? b));

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** OÙ EN EST SA COURONNE, d'après ce qu'elle a vécu au fauteuil.

    ELLE MONTE, ELLE NE REDESCEND JAMAIS : le palier est le plus haut que
    son carnet justifie. Fondation dès son premier rituel honoré ; Élévation
    au Nᵉ rituel ou à N mois de couronne (le premier des deux) ; Souveraineté
    au premier acte de Souveraineté honoré ou à N mois de couronne.

    L'ANCIENNETÉ NE COMPTE QUE SI LA COURONNE EST DATÉE (`crownSince`) : ne
    pas savoir ne prouve rien, c'est la règle du persona. Et rien ne se dit
    avant le premier rituel honoré : la Maison ne parle que de ce qu'elle a
    vu. Un rituel à venir ne compte pas. */
export function palierDeLaCliente(o: {
  honores: readonly RituelHonore[];
  crownSince?: string;
  aujourdhui: string;
  seuils?: Partial<SeuilsDePalier>;
}): PalierDeLaCliente {
  const seuils = seuilsPropres(o.seuils);
  const honores = o.honores
    .filter((h) => /^\d{4}-\d{2}-\d{2}/.test(h.date) && h.date.slice(0, 10) <= o.aujourdhui)
    .map((h) => ({ date: h.date.slice(0, 10), paliers: h.paliers }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const rituels = honores.length;
  const couronne = o.crownSince && /^\d{4}-\d{2}-\d{2}/.test(o.crownSince) && o.crownSince.slice(0, 10) <= o.aujourdhui
    ? o.crownSince.slice(0, 10) : undefined;
  const moisDeCouronne = couronne ? moisEntre(couronne, o.aujourdhui) : null;
  /* « Mois » ne prend pas de s ; « rituel honoré » en prend deux. */
  const resume = [
    rituels > 0 ? `${rituels} rituel${rituels > 1 ? 's' : ''} honoré${rituels > 1 ? 's' : ''}` : 'aucun rituel honoré',
    moisDeCouronne !== null ? `${moisDeCouronne} mois de couronne` : '',
  ].filter(Boolean).join(' · ');

  if (rituels === 0) {
    return { palier: null, depuis: null, motif: 'aucun rituel honoré', resume, rituels: 0, moisDeCouronne, plusHautActe: null };
  }
  const premier = honores[0].date;

  let plusHautActe: Palier | null = null;
  const premierActeDe: Partial<Record<Palier, string>> = {};
  for (const h of honores) {
    for (const p of h.paliers) {
      if (!premierActeDe[p]) premierActeDe[p] = h.date;
      plusHautActe = plusHautDes(plusHautActe, p);
    }
  }

  /* L'ANCIENNETÉ NE FAIT MONTER QU'À PARTIR DU PREMIER RITUEL : une couronne
     née ailleurs il y a trois ans ne vaut Souveraineté qu'une fois vue. */
  const parAge = (mois: number): string | undefined => {
    if (!couronne || moisDeCouronne === null || moisDeCouronne < mois) return undefined;
    const jour = plusDesMois(couronne, mois);
    return jour < premier ? premier : jour;
  };

  const parActeS = premierActeDe['Souveraineté'];
  const parAgeS = parAge(seuils.souveraineteMois);
  const depuisS = leplusTot(parActeS, parAgeS);
  if (depuisS) {
    const motif = parActeS && depuisS === parActeS
      ? 'un acte de Souveraineté honoré'
      : `${seuils.souveraineteMois} mois de couronne`;
    return { palier: 'Souveraineté', depuis: depuisS, motif, resume, rituels, moisDeCouronne, plusHautActe };
  }

  const parRituels = rituels >= seuils.elevationRituels ? honores[seuils.elevationRituels - 1].date : undefined;
  const parAgeE = parAge(seuils.elevationMois);
  const depuisE = leplusTot(parRituels, parAgeE);
  if (depuisE) {
    const motif = parRituels && depuisE === parRituels
      ? `${pluriel(seuils.elevationRituels, 'rituel')} honoré${seuils.elevationRituels > 1 ? 's' : ''}`
      : `${seuils.elevationMois} mois de couronne`;
    return { palier: 'Élévation', depuis: depuisE, motif, resume, rituels, moisDeCouronne, plusHautActe };
  }

  return { palier: 'Fondation', depuis: premier, motif: 'son premier rituel honoré', resume, rituels, moisDeCouronne, plusHautActe };
}

/** LE PALIER LU SUR LE CARNET du Trône — les rendez-vous honorés de cette
    tête, et le palier de chaque prestation. Le même juge pour la fiche, Ma
    Couronne et la Synthèse. */
export function palierDuCarnet(
  client: { id: string; crownSince?: string },
  rdvs: readonly Pick<Appointment, 'clientId' | 'status' | 'date' | 'serviceIds'>[],
  parId: ReadonlyMap<string, Pick<Service, 'palier'>>,
  aujourdhui: string,
  seuils?: Partial<SeuilsDePalier>,
): PalierDeLaCliente {
  const honores: RituelHonore[] = [];
  for (const a of rdvs) {
    if (a.clientId !== client.id || a.status !== 'honoré') continue;
    const paliers = a.serviceIds.map((id) => parId.get(id)?.palier).filter((p): p is Palier => !!p);
    honores.push({ date: a.date, paliers });
  }
  return palierDeLaCliente({ honores, crownSince: client.crownSince, aujourdhui, seuils });
}

/* ── LE PAS SUIVANT ───────────────────────────────────────────────── */

/** LA PRESTATION DU PALIER D'AU-DESSUS que son carnet ne porte pas encore :
    le geste de vente le plus naturel, et il n'existait nulle part.

    Sans palier (aucun rituel), le pas suivant est un acte de Fondation. En
    Souveraineté, un acte de Souveraineté qu'elle n'a pas encore vécu : on
    approfondit, on ne monte plus. La première dans l'ordre du catalogue, ou
    rien : on ne propose pas ce qu'elle a déjà fait. */
export function pasSuivant<S extends Pick<Service, 'id' | 'name' | 'palier' | 'order'>>(
  palier: Palier | null,
  services: readonly S[],
  vecus: ReadonlySet<string>,
): S | undefined {
  const cible: Palier = palier === null ? 'Fondation' : (palierSuivant(palier) ?? 'Souveraineté');
  return [...services]
    .filter((s) => s.palier === cible && !vecus.has(s.id))
    .sort((a, b) => a.order - b.order)[0];
}

/* ── LA MAISON, PALIER PAR PALIER ─────────────────────────────────── */

export type RepartitionDesPaliers = {
  parPalier: Record<Palier, number>;
  /** Des fiches sans aucun rituel honoré. */
  sansPalier: number;
  /** Celles qui ont atteint leur palier ce mois-ci (« 2026-09 »). */
  monteesDuMois: Record<Palier, number>;
};

/** C'EST LE CHIFFRE QUI DIT SI LA MAISON FAIT GRANDIR SES CLIENTES, ou si
    elle recommence chaque mois à la Fondation. Aucune projection. */
export function repartitionDesPaliers(
  lectures: readonly PalierDeLaCliente[], mois: string,
): RepartitionDesPaliers {
  const zero = (): Record<Palier, number> => ({ Fondation: 0, 'Élévation': 0, 'Souveraineté': 0 });
  const r: RepartitionDesPaliers = { parPalier: zero(), sansPalier: 0, monteesDuMois: zero() };
  for (const l of lectures) {
    if (!l.palier) { r.sansPalier += 1; continue; }
    r.parPalier[l.palier] += 1;
    if (l.depuis && l.depuis.slice(0, 7) === mois) r.monteesDuMois[l.palier] += 1;
  }
  return r;
}

/** LE PALIER D'UN RITUEL : le plus haut de ses prestations. */
export const palierDuRituel = (
  a: Pick<Appointment, 'serviceIds'>, parId: ReadonlyMap<string, Pick<Service, 'palier'>>,
): Palier | null => {
  let p: Palier | null = null;
  for (const id of a.serviceIds) p = plusHautDes(p, parId.get(id)?.palier ?? null);
  return p;
};

/** LES RITUELS HONORÉS D'UN MOIS, par palier de l'acte. */
export function rituelsDuMoisParPalier(
  rdvs: readonly Pick<Appointment, 'status' | 'date' | 'serviceIds' | 'branchId'>[],
  parId: ReadonlyMap<string, Pick<Service, 'palier'>>,
  mois: string,
  branchId?: string,
): Record<Palier, number> {
  const n: Record<Palier, number> = { Fondation: 0, 'Élévation': 0, 'Souveraineté': 0 };
  for (const a of rdvs) {
    if (a.status !== 'honoré' || a.date.slice(0, 7) !== mois) continue;
    if (branchId && a.branchId && a.branchId !== branchId) continue;
    const p = palierDuRituel(a, parId);
    if (p) n[p] += 1;
  }
  return n;
}
