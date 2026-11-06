/* LE CALENDRIER DU SITE, LA RÈGLE PURE — 6 novembre 2026 (maquette « Le
   calendrier du site », validée par Yéman : « construis »).

   Vingt et un jours en bande, derrière « Un autre jour », deviennent le MOIS
   EN GRILLE, comme Ma Couronne, téléphone d'abord : ce mois et les trois
   suivants (`horizonDuSite`, agenda.ts), visibles tout de suite sous les six
   prochaines places. Ce module tient ce qui se juge sans écran :
     · la grille d'un mois, LUNDI D'ABORD (L M M J V S D) ;
     · l'état de chaque jour : libre, complet, fermé, ou hors de l'horizon
       (le jour même et avant) ; « peu de places » à deux heures ou moins ;
     · les flèches, grisées aux bornes, et le glissé du doigt ;
     · le mois montré d'abord : celui qu'elle a tourné, sinon celui du jour
       déjà choisi, sinon celui de la première place libre ;
     · les mots de chaque jour, pour un lecteur d'écran, et la borne dite.

   PUR : ni React, ni réseau, ni horloge. Le banc
   `verifie-le-calendrier-du-site` l'éprouve dans les deux sens. */

export type EtatDuJour = 'hors' | 'ferme' | 'complet' | 'libre';
export type JourDuMois = { etat: EtatDuJour; peu: boolean; heures: number };

/** Deux heures libres ou moins : « peu de places », un point cuivre. */
export const PEU_DE_PLACES = 2;
/** Le glissé du doigt : au moins 50 px, et franchement de côté. */
export const GLISSE_MIN_PX = 50;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** L'en-tête de la grille, lundi d'abord. */
export const LETTRES_DE_LA_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

const p2 = (n: number): string => String(n).padStart(2, '0');
const lisLeMois = (mois: string): { a: number; m: number } | null => {
  const r = /^(\d{4})-(\d{2})$/.exec(String(mois ?? ''));
  if (!r) return null;
  const m = Number(r[2]);
  return m >= 1 && m <= 12 ? { a: Number(r[1]), m } : null;
};
const jourDeLaSemaine = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
const veilleDe = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Le mois `k` mois après `mois` (AAAA-MM). Illisible : chaîne vide. */
export function moisApres(mois: string, k: number): string {
  const l = lisLeMois(mois);
  if (!l) return '';
  const t = l.a * 12 + (l.m - 1) + Math.trunc(k);
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
}

/** Les mois de l'horizon, du premier au dernier (AAAA-MM). */
export function moisDeLHorizon(du: string, au: string): string[] {
  const premier = String(du ?? '').slice(0, 7);
  const dernier = String(au ?? '').slice(0, 7);
  const out: string[] = [];
  for (let m = premier; lisLeMois(m) && m <= dernier && out.length < 24; m = moisApres(m, 1)) out.push(m);
  return out;
}

/** La grille d'un mois, LUNDI D'ABORD : des cases vides avant le 1er
    (`decalage`, de 0 le lundi à 6 le dimanche), puis chaque jour (28 à 31). */
export function grilleDuMois(mois: string): { decalage: number; nbJours: number; cases: (string | null)[] } {
  const l = lisLeMois(mois);
  if (!l) return { decalage: 0, nbJours: 0, cases: [] };
  const nbJours = new Date(Date.UTC(l.a, l.m, 0)).getUTCDate();
  const decalage = (new Date(Date.UTC(l.a, l.m - 1, 1)).getUTCDay() + 6) % 7;
  const cases: (string | null)[] = Array.from({ length: decalage }, () => null);
  for (let j = 1; j <= nbJours; j += 1) cases.push(`${mois}-${p2(j)}`);
  return { decalage, nbJours, cases };
}

/** L'état d'un jour : hors de l'horizon (le jour même, avant, ou après la
    borne), fermé à la Maison, complet (aucune heure ne tient le rituel), ou
    libre, « peu de places » à deux heures ou moins. */
export function etatDuJour(o: { iso: string; du: string; au: string; ferme: boolean; heures: number }): JourDuMois {
  if (!o.iso || o.iso < o.du || o.iso > o.au) return { etat: 'hors', peu: false, heures: 0 };
  if (o.ferme) return { etat: 'ferme', peu: false, heures: 0 };
  const n = Math.max(0, Math.floor(Number(o.heures) || 0));
  if (n === 0) return { etat: 'complet', peu: false, heures: 0 };
  return { etat: 'libre', peu: n <= PEU_DE_PLACES, heures: n };
}

/** Les flèches : chacune vit tant qu'un mois de l'horizon reste de son côté. */
export function flechesDuMois(mois: string, premier: string, dernier: string): { precedent: boolean; suivant: boolean } {
  return { precedent: !!mois && mois > premier, suivant: !!mois && mois < dernier };
}

/** Le mois montré : celui qu'elle a tourné, sinon celui du jour choisi, sinon
    celui de la première place libre, sinon le premier ; toujours dans
    l'horizon. */
export function moisAMontrer(o: { vu?: string | null; jour?: string | null; premierePlace?: string | null; premier: string; dernier: string }): string {
  const voulu = (o.vu && lisLeMois(o.vu) ? o.vu : '')
    || (o.jour ? o.jour.slice(0, 7) : '')
    || (o.premierePlace ? o.premierePlace.slice(0, 7) : '')
    || o.premier;
  if (!lisLeMois(voulu)) return o.premier;
  return voulu < o.premier ? o.premier : voulu > o.dernier ? o.dernier : voulu;
}

/** Le sens d'un glissé : 1 (vers la gauche, le mois suivant), -1 (vers la
    droite, le précédent), 0 (un toucher, ou un défilement vertical). */
export function sensDuGlisse(dx: number, dy: number): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < GLISSE_MIN_PX || Math.abs(dx) <= Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** « Novembre 2026 » : le titre de la grille. */
export function titreDuMois(mois: string): string {
  const l = lisLeMois(mois);
  if (!l) return '';
  const nom = MOIS[l.m - 1];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${l.a}`;
}

/** « 28 février 2027 », « 1er mars 2027 » : une date dite à une cliente porte
    son année (10 octobre 2026). */
export function dateDite(iso: string): string {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!r) return '';
  const j = Number(r[3]);
  return `${j === 1 ? '1er' : j} ${MOIS[Number(r[2]) - 1] ?? ''} ${r[1]}`;
}

/** Les mots d'un jour pour un lecteur d'écran : le jour en toutes lettres,
    puis ce que la case montre (ses heures, peu de places, sa remise et ses
    places limitées ; complet ; fermé ; passé ou le jour même). */
export function libelleDuJour(o: {
  iso: string; du: string; jour: JourDuMois;
  remise?: { titre: string; pct: number } | null;
  places?: string | null;
}): string {
  const tete = `${JOURS[jourDeLaSemaine(o.iso)] ?? ''} ${dateDite(o.iso)}`;
  const { etat, heures, peu } = o.jour;
  if (etat === 'libre') {
    return [
      tete,
      `${heures} ${heures > 1 ? 'heures libres' : 'heure libre'}`,
      peu ? 'peu de places' : '',
      o.remise ? `${o.remise.titre}, −${o.remise.pct} %` : '',
      o.places ?? '',
    ].filter(Boolean).join(', ');
  }
  if (etat === 'complet') return `${tete}, complet`;
  if (etat === 'ferme') return `${tete}, fermé`;
  if (o.iso >= o.du) return `${tete}, hors des réservations en ligne`;
  return o.iso === veilleDe(o.du) ? `${tete}, aujourd’hui : pas de réservation le jour même` : `${tete}, passé`;
}
