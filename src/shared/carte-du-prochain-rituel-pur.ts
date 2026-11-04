/* ══ LA CARTE « SON PROCHAIN RITUEL », APRÈS LE RÈGLEMENT · 4 novembre 2026 ══
   « Dans le parcours du rendez-vous des clients, quand on finit d'encaisser
   le paiement, j'aimerais voir la date du prochain rendez-vous à l'écran,
   qu'il soit validé, et pouvoir le modifier au besoin. Que ce soit vraiment
   bien fait » (Yéman). Maquette VnmDTsSsuXsQKzckfEerju (v2), tranchée au
   sélecteur le 4 novembre 2026, « construis » reçu le soir même :
   · PROPOSÉ, VALIDÉ D'UN TOUCHER : rien n'est posé avant « Valider ce
     rendez-vous » ou le toucher d'une autre place ; fermer sans valider
     demande « Le valider et terminer » ou « Terminer sans rendez-vous » ;
   · son heure prise chez son maître : même maître, l'heure libre la plus
     proche le même jour, sinon le jour libre suivant (les places du « + RDV »,
     `sesTroisPlaces`) ; l'écran le dit ;
   · UNE SEULE CONFIRMATION, À LA FERMETURE, avec la date retenue : la carte
     pose le rendez-vous sans confirmation tant qu'elle est ouverte, le
     déplace sur place, et ne lève `sansConfirmation` qu'à « Terminer » ;
   · la même carte à la Caisse, et quand on marque un rituel honoré sans
     l'encaisser.
   Un rendez-vous qui existait déjà avant ce rituel se montre tel quel : on ne
   pose jamais un second prochain rendez-vous, et le changer passe par sa
   fiche (son message de changement y est préparé).

   Pur, sans magasin ni React : la carte rend des EFFETS (poser, déplacer,
   retirer, confirmer, fermer, ouvrir sa fiche), l'écran les exécute.
   `scripts/verifie-la-carte-du-prochain-rituel.mjs` l'éprouve (et `--prouve`). */

import { heureDuMessage } from './salle-des-envois';
import { dureeDite, type SonProchainRituel } from './prochain-rituel-pur';
import type { Proposition } from '../apps/trone/routes/clients/rdv-fluide-pur';

export type PlaceDeLaCarte = { iso: string; heure: string };

export const memePlace = (a: PlaceDeLaCarte | null | undefined, b: PlaceDeLaCarte | null | undefined): boolean =>
  !!a && !!b && a.iso === b.iso && a.heure === b.heure;

/** LA PLACE PROPOSÉE D'OFFICE parmi ses trois places : son jour habituel,
    autour de son rythme ; sinon sa date ; sinon la première. `null` : aucune. */
export function laPlaceDOffice(places: readonly Proposition[]): Proposition | null {
  return places.find((p) => p.cle === 'jour') ?? places.find((p) => p.cle === 'date') ?? places[0] ?? null;
}

/** POURQUOI CETTE DATE, en une phrase pour l'équipe : son rythme, d'où il
    est lu, et le jour qu'il donne. */
export function laRaisonDeLaDate(o: {
  rituel: Pick<SonProchainRituel, 'rythmeJours' | 'source' | 'occurrences' | 'vers' | 'attendu'>;
  place: Pick<Proposition, 'cle' | 'iso' | 'pourquoi'>;
  /** « mercredi 2 décembre 2026 » */
  jourDit: (iso: string) => string;
  /** « samedi », quand ses venues le disent. */
  sonJour?: string | null;
}): string {
  const r = o.rituel;
  const rythme = r.source === 'rituel'
    ? `Son rythme : environ ${dureeDite(r.rythmeJours)}, lu sur ses ${r.occurrences} dernières venues.`
    : r.source === 'cadence'
      ? `Son rythme de venue : environ ${dureeDite(r.rythmeJours)}.`
      : `Faute de rythme mesuré : ${dureeDite(r.rythmeJours)}.`;
  if (r.vers !== r.attendu) return `${rythme} Il l’attendait le ${o.jourDit(r.attendu)} : la première date utile.`;
  if (o.place.cle === 'jour' && o.place.iso !== r.vers && o.sonJour) {
    return `${rythme} Il tombe le ${o.jourDit(r.vers)} ; son jour habituel est le ${o.sonJour}.`;
  }
  if (o.place.iso === r.vers) return `${rythme} Le jour où son rythme la ramène.`;
  return `${rythme} ${o.place.pourquoi}`;
}

/** CE QUE DIT LA PLACE : libre, ou son heure habituelle qu'on n'a pas pu
    lui donner. `ouverteCeJour` : son heure existe ce jour-là quand le carnet
    est vide (sinon elle n'est pas « prise », le jour ne l'ouvre pas). */
export function ceQueDitLaPlace(o: {
  place: PlaceDeLaCarte;
  heureHabituelle?: string | null;
  ouverteCeJour?: boolean;
  maitre: string;
  /** « samedi » */
  nomDuJour: (iso: string) => string;
}): { texte: string; alerte: boolean } {
  const chez = o.maitre ? ` chez ${o.maitre}` : '';
  if (o.heureHabituelle && o.place.heure !== o.heureHabituelle) {
    const h = heureDuMessage(o.heureHabituelle);
    const pourquoi = o.ouverteCeJour === false ? `${h} n’est pas ouverte ce ${o.nomDuJour(o.place.iso)}-là` : `${h} est déjà prise${chez} ce ${o.nomDuJour(o.place.iso)}-là`;
    return { texte: `${pourquoi} : proposé à ${heureDuMessage(o.place.heure)}, l’heure libre la plus proche.`, alerte: true };
  }
  return { texte: `Place libre${chez}, relue à l’instant.`, alerte: false };
}

/* ── L'ÉTAT DE LA CARTE ET SES GESTES ─────────────────────────────────── */

export type EtatDeLaCarte = {
  /** La place proposée d'office (`null` : première venue, rien d'office). */
  depart: PlaceDeLaCarte | null;
  /** La place montrée en grand. */
  place: PlaceDeLaCarte | null;
  /** Le rendez-vous posé par la carte, ou celui qui existait déjà. */
  rdvId: string | null;
  /** Un rendez-vous à venir existait avant ce rituel : la carte le montre. */
  dejaLa: boolean;
  valide: boolean;
  /** « Pas de prochain rendez-vous » : retiré, rien ne part. */
  retire: boolean;
  /** Le volet « Une autre place » est ouvert. */
  modif: boolean;
  /** Ce que dit le pied de la fenêtre. */
  pied: 'rien' | 'demande-fin' | 'demande-retrait' | 'termine';
};

export type GesteDeLaCarte =
  | { genre: 'valider'; id: string }
  | { genre: 'toucher'; place: PlaceDeLaCarte; id: string }
  | { genre: 'revenir' }
  | { genre: 'modifier' }
  | { genre: 'garder' }
  | { genre: 'retirer' }
  | { genre: 'retirer-oui' }
  | { genre: 'retirer-non' }
  | { genre: 'reposer' }
  | { genre: 'terminer' }
  | { genre: 'valider-et-terminer'; id: string }
  | { genre: 'terminer-sans' };

export type EffetDeLaCarte =
  /** Poser le rendez-vous CONFIRMÉ, SANS confirmation tant que la carte est ouverte. */
  | { genre: 'poser'; id: string; place: PlaceDeLaCarte }
  /** Le même rendez-vous, à une autre place : rien ne part. */
  | { genre: 'deplacer'; rdvId: string; place: PlaceDeLaCarte }
  /** Le rendez-vous posé par la carte s'efface : aucun message n'était parti. */
  | { genre: 'retirer'; rdvId: string }
  /** À la fermeture : lever `sansConfirmation`, la confirmation part une fois. */
  | { genre: 'confirmer'; rdvId: string }
  /** Le rendez-vous qui existait déjà se change dans sa fiche. */
  | { genre: 'ouvrir'; rdvId: string; place?: PlaceDeLaCarte }
  | { genre: 'fermer' };

export function carteNeuve(o: { depart: PlaceDeLaCarte | null; deja?: { id: string; iso: string; heure: string } | null }): EtatDeLaCarte {
  if (o.deja) {
    const place = { iso: o.deja.iso, heure: o.deja.heure };
    return { depart: place, place, rdvId: o.deja.id, dejaLa: true, valide: true, retire: false, modif: false, pied: 'rien' };
  }
  return { depart: o.depart, place: o.depart, rdvId: null, dejaLa: false, valide: false, retire: false, modif: false, pied: 'rien' };
}

/** UN GESTE SUR LA CARTE : le nouvel état, et ce que l'écran doit faire. */
export function gesteSurLaCarte(e: EtatDeLaCarte, g: GesteDeLaCarte): { etat: EtatDeLaCarte; effets: EffetDeLaCarte[] } {
  const rien = { etat: e, effets: [] as EffetDeLaCarte[] };
  if (e.pied === 'termine') return rien;
  switch (g.genre) {
    case 'valider': {
      if (e.valide || e.retire || !e.place) return rien;
      return { etat: { ...e, valide: true, rdvId: g.id, pied: 'rien' }, effets: [{ genre: 'poser', id: g.id, place: e.place }] };
    }
    case 'toucher': {
      if (e.retire) return rien;
      if (e.dejaLa && e.rdvId) return { etat: e, effets: [{ genre: 'ouvrir', rdvId: e.rdvId, place: g.place }] };
      if (!e.valide) {
        return { etat: { ...e, place: g.place, valide: true, rdvId: g.id, modif: false, pied: 'rien' }, effets: [{ genre: 'poser', id: g.id, place: g.place }] };
      }
      if (memePlace(e.place, g.place) || !e.rdvId) return { etat: { ...e, modif: false }, effets: [] };
      return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }] };
    }
    case 'revenir': {
      if (!e.depart || memePlace(e.place, e.depart) || e.retire) return rien;
      if (e.dejaLa) return { etat: { ...e, place: e.depart, modif: false }, effets: [] };
      if (e.valide && e.rdvId) return { etat: { ...e, place: e.depart, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: e.depart }] };
      return { etat: { ...e, place: e.depart, modif: false }, effets: [] };
    }
    case 'modifier':
      if (e.dejaLa && e.rdvId) return { etat: e, effets: [{ genre: 'ouvrir', rdvId: e.rdvId }] };
      return { etat: { ...e, modif: true }, effets: [] };
    case 'garder':
      return { etat: { ...e, modif: false }, effets: [] };
    case 'retirer':
      /* Le rendez-vous qui existait déjà ne se retire pas d'ici : son
         annulation se fait dans sa fiche, avec ce qu'elle prévient. */
      if (e.dejaLa || e.retire) return rien;
      if (!e.valide) return { etat: { ...e, retire: true, modif: false, pied: 'rien' }, effets: [] };
      return { etat: { ...e, pied: 'demande-retrait' }, effets: [] };
    case 'retirer-oui': {
      if (e.pied !== 'demande-retrait' || !e.rdvId) return rien;
      return { etat: { ...e, retire: true, valide: false, rdvId: null, modif: false, pied: 'rien' }, effets: [{ genre: 'retirer', rdvId: e.rdvId }] };
    }
    case 'retirer-non':
      return { etat: { ...e, pied: 'rien' }, effets: [] };
    case 'reposer':
      if (!e.retire) return rien;
      return { etat: { ...e, retire: false, valide: false, rdvId: null, place: e.depart, modif: !e.depart, pied: 'rien' }, effets: [] };
    case 'terminer': {
      if (e.valide && e.rdvId && !e.retire) {
        const effets: EffetDeLaCarte[] = e.dejaLa ? [{ genre: 'fermer' }] : [{ genre: 'confirmer', rdvId: e.rdvId }, { genre: 'fermer' }];
        return { etat: { ...e, pied: 'termine' }, effets };
      }
      if (!e.valide && e.place && !e.retire) return { etat: { ...e, pied: 'demande-fin' }, effets: [] };
      return { etat: { ...e, pied: 'termine' }, effets: [{ genre: 'fermer' }] };
    }
    case 'valider-et-terminer': {
      if (e.valide || !e.place || e.retire) return gesteSurLaCarte(e, { genre: 'terminer' });
      return {
        etat: { ...e, valide: true, rdvId: g.id, pied: 'termine' },
        effets: [{ genre: 'poser', id: g.id, place: e.place }, { genre: 'confirmer', rdvId: g.id }, { genre: 'fermer' }],
      };
    }
    case 'terminer-sans':
      if (e.valide && !e.dejaLa) return rien;
      return { etat: { ...e, pied: 'termine' }, effets: [{ genre: 'fermer' }] };
  }
}

/** LA PASTILLE DE LA CARTE. */
export function pastilleDeLaCarte(e: EtatDeLaCarte): { texte: string; ton: 'vide' | 'ok' | 'change' } {
  if (e.retire) return { texte: 'Aucun', ton: 'vide' };
  if (!e.place) return { texte: 'À poser', ton: 'vide' };
  if (!e.valide) return { texte: 'À valider', ton: 'vide' };
  if (!e.dejaLa && e.depart && !memePlace(e.place, e.depart)) return { texte: 'Confirmé · changé', ton: 'change' };
  return { texte: 'Confirmé', ton: 'ok' };
}

/** CE QUI S'EST PASSÉ À LA FERMETURE, dit dans le pied. */
export function issueDeLaFermeture(e: EtatDeLaCarte, o: { qui: string; momentDit: (p: PlaceDeLaCarte) => string }): string {
  if (e.valide && e.place && !e.retire) {
    return e.dejaLa
      ? `Fenêtre fermée. Son rendez-vous du ${o.momentDit(e.place)} reste tel qu’il était, aucun nouveau message.`
      : `Fenêtre fermée. La confirmation part vers ${o.qui} : ${o.momentDit(e.place)}.`;
  }
  return 'Fenêtre fermée sans prochain rendez-vous, aucun message. Perle le lui proposera avant la date de son rythme.';
}

/** LES JOURS DE « UNE AUTRE DATE » : les jours ouverts qui ont une place pour
    sa durée, à partir de quelques jours avant sa date (jamais avant demain),
    `n` jours au plus, sur `horizon` jours de recherche. */
export function lesJoursDUneAutreDate(o: {
  depuis: string;
  placesDe: (iso: string) => { ferme: boolean; heures: readonly string[] };
  ajouteJours: (iso: string, n: number) => string;
  n?: number;
  horizon?: number;
}): string[] {
  const n = o.n ?? 10;
  const horizon = o.horizon ?? 42;
  const jours: string[] = [];
  for (let i = 0; i <= horizon && jours.length < n; i += 1) {
    const iso = o.ajouteJours(o.depuis, i);
    const p = o.placesDe(iso);
    if (!p.ferme && p.heures.length > 0) jours.push(iso);
  }
  return jours;
}
