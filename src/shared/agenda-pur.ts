/* LE CALENDRIER, SA PART PURE — 17 septembre 2026.

   « Est-ce possible de tomber directement sur les consultations et réserver
   directement, sans passer par un message WhatsApp ? » (Yéman). Oui, et tout
   ce qu'un calendrier honnête demande était déjà là : les heures d'ouverture,
   les exceptions, les murs posés à la main, et les créneaux occupés que la
   fonction `creneaux_occupes` (0079) rend SANS dire qui les occupe.

   CE MODULE N'IMPORTE RIEN. Ni magasin, ni synchronisation, ni Supabase :
   `settings.ts` et `blocages.ts` se terminent par un `bindDocument` qui tire
   toute la couche de données, et une page publique doit se charger en un
   instant sur réseau faible. Le Trône, Ma Couronne et le site public lisent
   donc le MÊME calcul, chacun lui passant ses murs par la porte.

   Les fonctions qui vivaient dans `couronne/lib.ts`, `settings.ts` et
   `blocages.ts` sont ici ; leurs anciens domiciles les ré-exportent, rien
   n'a changé d'adresse pour le reste du code. */

export const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** '09h30' → minutes depuis minuit. La graphie de la Maison, au Trône. */
export const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};

/** '09:30' → minutes depuis minuit. La graphie d'un rendez-vous. */
export const minutesDeHhmm = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const hhmmDeMinutes = (min: number): string => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

export type FenetreDuJour = { closed: boolean; openMin: number; closeMin: number };
export type HeureDeLaSemaine = { key: string; open: string; close: string; closed: boolean };
export type ExceptionDHoraire = { date: string; staffId?: string; open?: string; close?: string; closed?: boolean };
export type MurPose = { branchId: string; date: string; master?: string; debut?: string; fin?: string };

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** La fenêtre d'ouverture d'une date, EXCEPTIONS COMPRISES : une fermeture
    exceptionnelle saisie pour la paie ferme aussi la réservation en ligne
    (celle de la Maison ; celles d'une personne restent l'affaire du
    pointage). Sans semaine connue, la journée est tenue pour FERMÉE : mieux
    vaut ne rien proposer que d'ouvrir un lundi que la Maison ferme. */
export function ouvertureDuJour(
  dateIso: string,
  semaine: readonly HeureDeLaSemaine[],
  exceptions: readonly ExceptionDHoraire[] = [],
): FenetreDuJour {
  const FERME: FenetreDuJour = { closed: true, openMin: 0, closeMin: 0 };
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const jour = semaine.find((h) => h.key === JOURS[dow]);
  if (!jour || jour.closed) return FERME;
  const base: FenetreDuJour = { closed: false, openMin: hourToMin(jour.open), closeMin: hourToMin(jour.close) };
  const ex = exceptions.find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return FERME;
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin,
  };
}

/** Les murs d'une date pour UN maître, en minutes depuis minuit. Un blocage
    sans bornes couvre la journée entière ; un blocage sans maître vaut pour
    tous. */
export function plagesBloquees(
  murs: readonly MurPose[],
  branchId: string,
  dateIso: string,
  master: string,
): Array<[number, number]> {
  return murs
    .filter((b) => b.branchId === branchId && b.date === dateIso && (!b.master || b.master === master))
    .map((b): [number, number] => [
      b.debut?.trim() ? hourToMin(b.debut) : 0,
      b.fin?.trim() ? hourToMin(b.fin) : 24 * 60,
    ])
    .filter(([s, e]) => e > s);
}

/** UN CRÉNEAU DÉJÀ PRIS, dit sans dire par qui — voir la migration 0079.
    C'est tout ce que le serveur consent à donner à une inconnue, et tout ce
    qu'un calendrier honnête demande. */
export type CreneauOccupe = { jour: string; maitre: string; debut: string; duree: number };

/** LE CŒUR DU CALCUL, SANS AUCUN MAGASIN — pour qu'il soit jugeable.

    Les murs entrent par la porte : le harnais peut poser n'importe quelle
    journée, et les trois surfaces obtiennent la même réponse. */
export function creneauxLibres(o: {
  opening: FenetreDuJour;
  durationMin: number;
  /** Tout ce qui occupe la journée, tous maîtres confondus. */
  occupes: readonly { maitre: string; debutMin: number; dureeMin: number }[];
  /** Murs posés à la main (pause, absence), déjà résolus en minutes. */
  bloques?: readonly (readonly [number, number])[];
  master: string;
  capMaison?: number;
  capMaitre?: number;
  /** LE SALON N'A QU'UN NOMBRE DE FAUTEUILS — 17 septembre 2026.
      « Pourquoi toutes les heures sont disponibles sur le site pourtant il
      n'y a pas de place la journée du samedi ? » (Yéman).

      LA CAUSE ÉTAIT L'UNION PAR MAÎTRE : le site demandait les heures libres
      de CHAQUE maître et gardait leur union. La branche porte deux libellés,
      « Team » et « Expert » ; le second ne reçoit jamais, donc toutes ses
      heures étaient libres, et un libellé inoccupé rouvrait un salon plein.

      Ce plafond compte les rituels qui SE CHEVAUCHENT, tous maîtres
      confondus : c'est la contrainte réelle d'un salon, ses fauteuils
      (`Branch.seats`). 0 ou absent = pas de limite, le comportement d'avant,
      celui que Ma Couronne garde. */
  capSimultane?: number;
  /** Minutes depuis minuit si la date est aujourd'hui ; sinon `null`. */
  maintenantMin?: number | null;
  /** Le pas de la grille. Une heure, comme au comptoir. */
  pasMin?: number;
}): string[] {
  if (o.opening.closed) return [];

  /* LE PLAFOND D'ABORD : au-delà, plus aucun créneau, même si des heures
     restent. La maison choisit son souffle ; le comptoir, lui, n'est pas
     bridé (poser un rendez-vous à la main reste un geste du personnel).
     0 = illimité. */
  const capMaison = o.capMaison ?? 0;
  const capMaitre = o.capMaitre ?? 0;
  if (capMaison > 0 && o.occupes.length >= capMaison) return [];
  const duMaitre = o.occupes.filter((a) => a.maitre === o.master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return [];

  const busy: Array<readonly [number, number]> = duMaitre
    .map((a) => [a.debutMin, a.debutMin + a.dureeMin] as const);
  if (o.bloques) busy.push(...o.bloques);

  const pas = o.pasMin ?? 60;
  const cap = o.capSimultane ?? 0;
  const out: string[] = [];
  for (let m = o.opening.openMin; m + o.durationMin <= o.opening.closeMin; m += pas) {
    if (o.maintenantMin != null && m <= o.maintenantMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + o.durationMin > s);
    if (overlaps) continue;
    /* LES FAUTEUILS : le maître est libre, mais la Maison peut être pleine. */
    if (cap > 0) {
      const ensemble = o.occupes
        .filter((a) => m < a.debutMin + a.dureeMin && m + o.durationMin > a.debutMin).length;
      if (ensemble >= cap) continue;
    }
    out.push(hhmmDeMinutes(m));
  }
  return out;
}

/** La durée d'un rituel : la somme de ses prestations, une heure au moins.
    Une prestation inconnue du catalogue vaut une heure, comme au comptoir. */
export function dureeDesPrestations(
  ids: readonly string[],
  services: readonly { id: string; durationMin?: number }[],
): number {
  const total = ids.reduce((s, id) => s + (services.find((x) => x.id === id)?.durationMin ?? 60), 0);
  return Math.max(60, total);
}

/** Les créneaux occupés d'un jour, mis en la forme que le calcul attend. */
export const occupesDuJour = (
  occupes: readonly CreneauOccupe[],
  dateIso: string,
): { maitre: string; debutMin: number; dureeMin: number }[] =>
  occupes
    .filter((c) => c.jour === dateIso && c.debut)
    .map((c) => ({ maitre: c.maitre, debutMin: minutesDeHhmm(c.debut), dureeMin: c.duree }));
