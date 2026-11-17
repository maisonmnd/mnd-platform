/* ══ LA CONSULTATION PRIVÉE, AU CARNET — 17 novembre 2026 ═══════════════════
   « La consultation en affiches », lot 3. La consultation privée se réserve
   avec le créneau choisi au paiement, et devient un vrai rendez-vous du
   Carnet, posé sous le verrou des places (`pose_si_libre`).

   LES RÈGLES SONT CELLES DE L'AGENDA, pas d'autres : la semaine de la Maison
   et ses fermetures, les murs, les plafonds, une place en ligne à la fois, la
   grille à l'heure, et le premier rendez-vous à 08:30 (`creneauxLibres`).
   Jamais le jour même : la Maison prépare la venue.

   SANS PRESTATION DU CATALOGUE. Les 15 000 F sont déjà réglés en ligne et
   déduits du rituel sur le devis ferme : le rendez-vous ne porte ni prix ni
   acompte, seulement sa durée (réglée au Trône, `priveeDureeMin`) et son nom.

   MODULE PUR : ni magasin, ni réseau, ni horloge (l'instant entre par la
   porte). La fonction `visio-salle` le regroupe ; le banc le fait tourner. */
import { creneauxLibres, occupesDuJour, ouvertureDuJour, plagesBloquees } from './agenda-pur';
import {
  isoApresJours, jourDeCotonou, joursDeLaFenetre, laPlaceEstRecevable,
  type AgendaDuServeur, type PlaceDuServeur, type RefusDeLaPlace,
} from './place-du-serveur';

/** Le moment choisi par la cliente : un jour de Cotonou et une heure. */
export type MomentChoisi = { jour: string; heure: string };

/** `{ jour: 'AAAA-MM-JJ', heure: 'HH:MM' }`, ou rien : tout ce qui n'en a pas la forme est écarté. */
export function momentSur(x: unknown): MomentChoisi | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const jour = typeof o.jour === 'string' ? o.jour.trim() : '';
  const heure = typeof o.heure === 'string' ? o.heure.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return null;
  return { jour, heure };
}

/** Les maîtres à essayer : ceux de la Maison, sinon le libellé vide d'une branche qui n'en déclare aucun. */
const maitresDe = (agenda: AgendaDuServeur): string[] => (agenda.maitres.length > 0 ? [...agenda.maitres] : ['']);

/** Les heures libres d'un jour pour cette durée, maître par maître. */
function heuresDuJour(agenda: AgendaDuServeur, iso: string, dureeMin: number): Map<string, string[]> {
  const parHeure = new Map<string, string[]>();
  const opening = ouvertureDuJour(iso, agenda.semaine, agenda.exceptions);
  if (opening.closed) return parHeure;
  const occupes = occupesDuJour(agenda.occupes, iso);
  for (const master of maitresDe(agenda)) {
    const libres = creneauxLibres({
      opening, durationMin: dureeMin, occupes,
      bloques: plagesBloquees(agenda.murs, agenda.branchId, iso, master),
      master, capMaison: agenda.capMaison, capMaitre: agenda.capMaitre, capSimultane: agenda.sieges, maintenantMin: null,
    });
    for (const h of libres) parHeure.set(h, [...(parHeure.get(h) ?? []), master]);
  }
  return parHeure;
}

export type VerdictDeLaPrivee =
  | { ok: true; maitres: string[] }
  | { ok: false; erreur: RefusDeLaPlace };

/** CE MOMENT TIENT-IL ? La forme et la fenêtre d'abord (jamais le jour même,
    jamais après la borne de la réservation), puis la grille du jour : le
    moment doit être une heure que l'agenda proposerait. Rend les maîtres
    libres, dans l'ordre de la Maison ; le verrou prend le premier encore libre. */
export function laPriveeTient(agenda: AgendaDuServeur, m: MomentChoisi, dureeMin: number, ms: number): VerdictDeLaPrivee {
  const recevable = laPlaceEstRecevable({ date: m.jour, time: m.heure }, ms);
  if (recevable) return { ok: false, erreur: recevable };
  if (ouvertureDuJour(m.jour, agenda.semaine, agenda.exceptions).closed) return { ok: false, erreur: 'creneau_ferme' };
  const maitres = heuresDuJour(agenda, m.jour, dureeMin).get(m.heure);
  if (!maitres || maitres.length === 0) return { ok: false, erreur: 'creneau_pris' };
  return { ok: true, maitres };
}

/** LES MOMENTS LIBRES de la consultation privée, de demain (à Cotonou) à
    l'horizon, rangés dans le temps : ce que l'écran « Votre moment » propose. */
export function placesDeLaPrivee(agenda: AgendaDuServeur, dureeMin: number, ms: number, horizonJours = 30): PlaceDuServeur[] {
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(joursDeLaFenetre(ms), Number.isFinite(voulu) && voulu > 0 ? voulu : 30));
  const aujourdhui = jourDeCotonou(ms);
  const out: PlaceDuServeur[] = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    for (const heure of [...heuresDuJour(agenda, iso, dureeMin).keys()].sort()) out.push({ iso, heure });
  }
  return out;
}

/** L'identifiant du rendez-vous d'une consultation : toujours le même, pour
    qu'une pose rejouée (un second appel, un paiement revérifié) n'en fasse pas deux. */
export const idDuRdvDeLaPrivee = (consultationId: string): string => `rdv-privee-${consultationId}`;
/** Et celui de sa demande, que le Trône rattache à une fiche. */
export const idDeLaDemandeDeLaPrivee = (consultationId: string): string => `dem-privee-${consultationId}`;

/** Le nom du rendez-vous au Carnet, là où une prestation du catalogue dirait le sien. */
export const NOM_DE_LA_PRIVEE = 'Consultation privée';
export const NOM_DE_LA_VISIO_AU_CARNET = 'Visio · 15 minutes';

/** LE RENDEZ-VOUS, tel que le verrou le pose. Ni prix, ni acompte : son nom
    tient dans `forfait.nom` (le Carnet le lit quand le catalogue ne dit
    rien), son total vaut zéro. */
export function rdvDeLaPrivee(o: {
  consultationId: string; branchId: string; prenom: string; moment: MomentChoisi; dureeMin: number;
  maintenantIso: string; regleXof: number; reference?: string;
}): Record<string, unknown> {
  const note = [
    'Consultation privée réservée sur le site',
    o.regleXof > 0 ? `réglée en ligne : ${o.regleXof} F, déduits de son rituel` : '',
    o.reference ? `réf. ${o.reference}` : '',
  ].filter(Boolean).join(' · ');
  return {
    id: idDuRdvDeLaPrivee(o.consultationId),
    branchId: o.branchId,
    clientId: '',
    clientName: o.prenom || 'Consultation privée',
    serviceIds: [],
    date: o.moment.jour,
    time: o.moment.heure,
    dureeMin: o.dureeMin,
    status: 'confirmé',
    source: 'consultation',
    creeLe: o.maintenantIso,
    consultationId: o.consultationId,
    forfait: { nom: NOM_DE_LA_PRIVEE, totalXof: 0, baseXof: 0, poseAt: o.maintenantIso.slice(0, 10) },
    note,
  };
}
