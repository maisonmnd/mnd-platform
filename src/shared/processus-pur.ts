/* ═══════════════════════════════════════════════════════════════════
   LES PROCESSUS ET LES AGENTS — 24 octobre 2026.

   « Embedded AI assistant to build processes », puis « AI agents » (Yéman),
   maquette VJ5PJEGUPDbYKUgEdMUNbS (vues 2 et 3), « Construire le reste » le
   même soir. Choix au sélecteur : IL PROPOSE, VOUS ACTIVEZ ; chaque envoi
   garde son oui ; les agents d'abord : encaissements et reprises.

   UN PROCESSUS, C'EST QUATRE BRIQUES QUE LE TRÔNE SAIT DÉJÀ FAIRE :
     · QUAND : des jours de la semaine et une heure de Cotonou ;
     · QUI : une audience calculée (reprises en retard, une seule venue,
       dormantes, anniversaires), jamais une liste tapée à la main ;
     · QUOI : un message court, avec ou sans deux places libres ;
     · LE OUI : à son heure, le processus pose une LISTE dans « À valider ».
       Rien ne part seul : chaque ligne attend le geste de qui la lit
       (écrire sur WhatsApp, poser le rendez-vous, ou « pas maintenant »).

   L'AGENT DES REPRISES est un processus livré prêt (« Les reprises du
   lundi »), éteint jusqu'à ce qu'elle l'allume. L'agent des encaissements
   n'écrit à personne : les relances des factures ont déjà leur tournée au
   serveur (relances-factures) ; il rassemble ce qui attend un oui.

   Ce module est PUR ; `scripts/verifie-les-agents.mjs` le prouve. */

export type CleDAudience = 'reprises' | 'une-venue' | 'dormantes' | 'anniversaires';

export const AUDIENCES_DES_PROCESSUS: readonly { cle: CleDAudience; nom: string; dit: string; delai: number | null }[] = [
  { cle: 'reprises', nom: 'Les reprises en retard', dit: 'la reprise que la Cadence attendait a au moins {n} jours de retard, et rien n’est posé', delai: 10 },
  { cle: 'une-venue', nom: 'Venues une seule fois', dit: 'une seule venue honorée, il y a au moins {n} jours, et rien n’est posé', delai: 60 },
  { cle: 'dormantes', nom: 'Les dormantes', dit: 'dernière venue honorée il y a au moins {n} jours, et rien n’est posé', delai: 90 },
  { cle: 'anniversaires', nom: 'Les anniversaires', dit: 'leur anniversaire tombe dans les 7 jours', delai: null },
];
export const audienceDite = (cle: CleDAudience, delai: number): string => {
  const a = AUDIENCES_DES_PROCESSUS.find((x) => x.cle === cle);
  return a ? a.dit.replace('{n}', String(delai)) : '';
};

export const JOURS_DE_LA_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export type Processus = {
  id: string;
  branchId: string;
  nom: string;
  actif: boolean;
  /** Quand il a été allumé : il ne rattrape jamais un passage d'avant. */
  actifDepuis?: string;
  /** 0 = dimanche … 6 = samedi. */
  jours: number[];
  /** « 09:00 », heure de Cotonou. */
  heure: string;
  audience: CleDAudience;
  delaiJours: number;
  avecPlaces: boolean;
  /** {appel} = comment on s'adresse à elle ; {places} = les deux places. */
  message: string;
  /** Un processus livré avec un agent. */
  agent?: 'reprises';
  creePar: string;
  creeLe: string;
};

export type StatutDeLigne = 'a-valider' | 'ecrit' | 'pose' | 'ecarte';
export type LigneDuPassage = { clientId: string; raison: string; statut: StatutDeLigne; le?: string; par?: string };
export type Passage = {
  id: string;
  processusId: string;
  branchId: string;
  /** Le créneau du passage, « AAAA-MM-JJTHH:MM » à Cotonou. */
  prevuA: string;
  faitLe: string;
  lignes: LigneDuPassage[];
};

/** Une liste lisible : au-delà, on ne relit plus, on coche. */
export const LIGNES_MAX_PAR_PASSAGE = 20;
/** Une tête à qui l'on a écrit dans les 30 jours ne revient pas dans une liste. */
export const JOURS_SANS_REDIRE = 30;
/** On garde deux mois de passages ; au-delà, ils s'effacent. */
export const JOURS_DE_MEMOIRE = 60;

export const MESSAGE_DES_REPRISES = 'Bonjour {appel}, votre couronne vous attend chez Maison MND. {places} Dites-nous ce qui vous convient.';

export const PROCESSUS_DES_AGENTS: readonly Omit<Processus, 'branchId' | 'creePar' | 'creeLe'>[] = [
  {
    id: 'agent-reprises', nom: 'Les reprises du lundi', actif: false, jours: [1], heure: '09:00',
    audience: 'reprises', delaiJours: 10, avecPlaces: true, message: MESSAGE_DES_REPRISES, agent: 'reprises',
  },
];

/* ── LES DATES, SANS FUSEAU ─────────────────────────────────────────── */
const jourDe = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, (m || 1) - 1, j || 1) / 86400000;
};
const isoDe = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);
const joursEntre = (a: string, b: string): number => jourDe(b) - jourDe(a);
const jourDeSemaine = (iso: string): number => new Date(jourDe(iso) * 86400000).getUTCDay();
const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** LE DERNIER CRÉNEAU DÛ : le plus récent jour permis, à son heure, déjà
    passé, dans les sept derniers jours. `null` s'il n'y en a pas. */
export function dernierCreneau(p: Pick<Processus, 'jours' | 'heure'>, aujourdhui: string, maintenantMin: number): string | null {
  for (let k = 0; k < 7; k++) {
    const iso = isoDe(jourDe(aujourdhui) - k);
    if (!p.jours.includes(jourDeSemaine(iso))) continue;
    if (k === 0 && minutes(p.heure) > maintenantMin) continue;
    return `${iso}T${p.heure}`;
  }
  return null;
}

/** LE PROCHAIN CRÉNEAU, pour le dire (« lundi 26 octobre 2026 à 9 h »). */
export function prochainCreneau(p: Pick<Processus, 'jours' | 'heure'>, aujourdhui: string, maintenantMin: number): string | null {
  if (!p.jours.length) return null;
  for (let k = 0; k < 8; k++) {
    const iso = isoDe(jourDe(aujourdhui) + k);
    if (!p.jours.includes(jourDeSemaine(iso))) continue;
    if (k === 0 && minutes(p.heure) <= maintenantMin) continue;
    return `${iso}T${p.heure}`;
  }
  return null;
}

/** L'identifiant d'un passage : sa branche, son processus, son créneau. Deux
    postes qui le font au même moment écrivent la même ligne. */
export const idDuPassage = (branchId: string, processusId: string, creneau: string) => `${branchId}|${processusId}@${creneau}`;

/** LE PASSAGE À FAIRE, s'il y en a un : allumé, un créneau dû, pas encore
    fait, et pas d'avant son allumage. */
export function passageAFaire(
  p: Processus,
  passages: readonly Pick<Passage, 'id'>[],
  aujourdhui: string,
  maintenantMin: number,
): string | null {
  if (!p.actif) return null;
  const c = dernierCreneau(p, aujourdhui, maintenantMin);
  if (!c) return null;
  if (p.actifDepuis && c < p.actifDepuis.slice(0, 16)) return null;
  if (passages.some((x) => x.id === idDuPassage(p.branchId, p.id, c))) return null;
  return c;
}

/* ── QUI : LES TÊTES QUI ENTRENT DANS UNE LISTE ─────────────────────── */
export type TeteDuProcessus = {
  clientId: string;
  /** Un rendez-vous à venir, non annulé. */
  aVenir: boolean;
  /** Les dates des venues honorées. */
  venues: readonly string[];
  /** Le retard sur la reprise attendue par la Cadence (0 si à l'heure ou
      sans prédiction). */
  retardJours: number;
  /** « MM-JJ » de la fiche, si elle le porte. */
  anniversaire?: string;
  /** De passage, diaspora, locks défaits, archivée : jamais dans une liste. */
  ecartee?: boolean;
  /** Le dernier message qu'on lui a écrit (AAAA-MM-JJ), s'il est connu. */
  dernierContact?: string;
};

const raisonDe = (cle: CleDAudience, t: TeteDuProcessus, aujourdhui: string): string => {
  const derniere = [...t.venues].sort().pop();
  if (cle === 'reprises') return `${t.retardJours} jours de retard sur sa reprise`;
  if (cle === 'anniversaires') return `anniversaire le ${Number(t.anniversaire!.slice(3, 5))} ${MOIS_LONGS[Number(t.anniversaire!.slice(0, 2)) - 1]}`;
  return derniere ? `dernière venue il y a ${joursEntre(derniere, aujourdhui)} jours` : '';
};

/** L'anniversaire tombe-t-il dans les 7 jours (aujourd'hui compris) ? */
function anniversaireProche(mmjj: string, aujourdhui: string): boolean {
  const annee = Number(aujourdhui.slice(0, 4));
  for (const a of [annee, annee + 1]) {
    const d = `${a}-${mmjj}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const k = joursEntre(aujourdhui, d);
    if (k >= 0 && k <= 6) return true;
  }
  return false;
}

/** LA LISTE D'UN PASSAGE : l'audience, sans les écartées, sans celles qui
    ont un rendez-vous, sans celles à qui l'on a écrit dans les 30 jours,
    les plus pressantes d'abord, vingt au plus. */
export function listeDuPassage(
  p: Pick<Processus, 'audience' | 'delaiJours'>,
  tetes: readonly TeteDuProcessus[],
  aujourdhui: string,
): { clientId: string; raison: string }[] {
  const recente = (t: TeteDuProcessus) => !!t.dernierContact && joursEntre(t.dernierContact, aujourdhui) < JOURS_SANS_REDIRE;
  const derniere = (t: TeteDuProcessus) => [...t.venues].sort().pop() ?? '';
  const eligibles = tetes.filter((t) => !t.ecartee && !t.aVenir && !recente(t)).filter((t) => {
    switch (p.audience) {
      case 'reprises': return t.retardJours >= p.delaiJours;
      case 'une-venue': return t.venues.length === 1 && joursEntre(t.venues[0], aujourdhui) >= p.delaiJours;
      case 'dormantes': return t.venues.length > 0 && joursEntre(derniere(t), aujourdhui) >= p.delaiJours;
      case 'anniversaires': return !!t.anniversaire && anniversaireProche(t.anniversaire, aujourdhui);
      default: return false;
    }
  });
  const poids = (t: TeteDuProcessus) => (p.audience === 'reprises' ? t.retardJours : p.audience === 'anniversaires' ? 0 : joursEntre(derniere(t), aujourdhui));
  return eligibles
    .sort((a, b) => poids(b) - poids(a) || a.clientId.localeCompare(b.clientId))
    .slice(0, LIGNES_MAX_PAR_PASSAGE)
    .map((t) => ({ clientId: t.clientId, raison: raisonDe(p.audience, t, aujourdhui) }));
}

/* ── QUOI : LE MESSAGE, AVEC SES DEUX PLACES ────────────────────────── */
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « mardi 27 octobre 2026 à 10 h », « à 14 h 30 » : l'année toujours. */
export function placeDite(iso: string, heure: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const [h, mn] = heure.split(':').map(Number);
  return `${JOURS_DE_LA_SEMAINE[jourDeSemaine(iso)]} ${j === 1 ? '1er' : j} ${MOIS_LONGS[m - 1]} ${a} à ${h} h${mn ? ` ${String(mn).padStart(2, '0')}` : ''}`;
}

/** DEUX PLACES, DEUX JOURS : la première heure libre du premier jour qui en
    a, puis la première heure du jour suivant qui en a. Un seul jour libre :
    deux heures de ce jour-là, la première et une de l'après-midi si elle
    existe. */
export function deuxPlaces(jours: readonly { iso: string; heures: readonly string[] }[]): { iso: string; heure: string }[] {
  const avec = jours.filter((j) => j.heures.length > 0);
  if (avec.length >= 2) return [{ iso: avec[0].iso, heure: avec[0].heures[0] }, { iso: avec[1].iso, heure: avec[1].heures[0] }];
  if (avec.length === 1) {
    const h = avec[0].heures;
    const seconde = h.find((x) => minutes(x) >= 13 * 60 && x !== h[0]) ?? h[1];
    return seconde ? [{ iso: avec[0].iso, heure: h[0] }, { iso: avec[0].iso, heure: seconde }] : [{ iso: avec[0].iso, heure: h[0] }];
  }
  return [];
}

/** LE MESSAGE D'UNE LIGNE. Sans place libre, la phrase des places devient
    une invitation simple : on ne promet pas une heure qu'on n'a pas. */
export function messageDeLaLigne(modele: string, o: { appel: string; places: readonly { iso: string; heure: string }[]; avecPlaces: boolean }): string {
  const places = !o.avecPlaces
    ? ''
    : o.places.length >= 2
      ? `Deux places sont libres pour vous : ${placeDite(o.places[0].iso, o.places[0].heure)}, ou ${placeDite(o.places[1].iso, o.places[1].heure)}.`
      : o.places.length === 1
        ? `Une place est libre pour vous : ${placeDite(o.places[0].iso, o.places[0].heure)}.`
        : 'Nous vous trouvons une place dès que vous nous dites le jour qui vous va.';
  return modele.replace(/\{appel\}/g, o.appel).replace(/\{places\}/g, places).replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

/* ── CE QU'ILS ONT FAIT ─────────────────────────────────────────────── */
export function statsDuProcessus(passages: readonly Passage[], processusId: string): { passages: number; proposes: number; ecrits: number; poses: number; ecartes: number; aValider: number } {
  const siens = passages.filter((x) => x.processusId === processusId);
  const lignes = siens.flatMap((x) => x.lignes);
  return {
    passages: siens.length,
    proposes: lignes.length,
    ecrits: lignes.filter((l) => l.statut === 'ecrit').length,
    poses: lignes.filter((l) => l.statut === 'pose').length,
    ecartes: lignes.filter((l) => l.statut === 'ecarte').length,
    aValider: lignes.filter((l) => l.statut === 'a-valider').length,
  };
}

/** LE COMPTE RENDU D'UN PASSAGE : parmi celles à qui l'on a écrit, qui a
    réservé depuis (un rendez-vous posé ou honoré daté après le passage). */
export function compteRendu(passage: Passage, aReserveDepuis: (clientId: string, depuis: string) => boolean): { ecrites: number; reserve: number; sansReponse: number } {
  const ecrites = passage.lignes.filter((l) => l.statut === 'ecrit' || l.statut === 'pose');
  const reserve = ecrites.filter((l) => l.statut === 'pose' || aReserveDepuis(l.clientId, passage.prevuA.slice(0, 10))).length;
  return { ecrites: ecrites.length, reserve, sansReponse: ecrites.length - reserve };
}

/** On oublie les passages de plus de deux mois. */
export const passagesGardes = (passages: readonly Passage[], aujourdhui: string): Passage[] =>
  passages.filter((x) => joursEntre(x.prevuA.slice(0, 10), aujourdhui) <= JOURS_DE_MEMOIRE);

/** Le dernier contact connu d'une tête, d'après les lignes déjà écrites. */
export function derniersContacts(passages: readonly Passage[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of passages) for (const l of p.lignes) {
    if ((l.statut === 'ecrit' || l.statut === 'pose') && l.le) {
      const d = l.le.slice(0, 10);
      if (!m.has(l.clientId) || m.get(l.clientId)! < d) m.set(l.clientId, d);
    }
  }
  return m;
}

/* ── CE QUE CLAUDE PROPOSE N'EST JAMAIS CRU TEL QUEL ────────────────── */
export type ProcessusPropose = {
  nom?: unknown; jours?: unknown; heure?: unknown; audience?: unknown;
  delaiJours?: unknown; avecPlaces?: unknown; message?: unknown; aClarifier?: unknown;
};

/** LE PROCESSUS QUE CLAUDE PROPOSE, RAMENÉ AUX BRIQUES DU TRÔNE. Une
    audience inconnue est un refus (le Trône ne sait pas la calculer) ; le
    reste se borne : des jours de la semaine, une heure hors des heures
    calmes (20 h à 8 h), un délai entre 7 et 365 jours, un message court
    qui garde {appel}. */
export function nettoieLeProcessus(brut: ProcessusPropose): { ok: true; processus: Pick<Processus, 'nom' | 'jours' | 'heure' | 'audience' | 'delaiJours' | 'avecPlaces' | 'message'>; aClarifier: string } | { ok: false; raison: string } {
  const audience = AUDIENCES_DES_PROCESSUS.find((a) => a.cle === brut.audience);
  if (!audience) return { ok: false, raison: 'Le Trône ne sait pas encore choisir ces personnes-là. Il sait : les reprises en retard, les venues une seule fois, les dormantes, les anniversaires.' };
  const jours = Array.isArray(brut.jours)
    ? [...new Set(brut.jours.map(Number).filter((j) => Number.isInteger(j) && j >= 0 && j <= 6))].sort()
    : [];
  let heure = typeof brut.heure === 'string' && /^\d{1,2}:\d{2}$/.test(brut.heure.trim()) ? brut.heure.trim().padStart(5, '0') : '09:00';
  if (minutes(heure) < 8 * 60 || minutes(heure) >= 20 * 60) heure = '09:00';
  const d = Number(brut.delaiJours);
  const delaiJours = audience.delai === null ? 0 : Number.isFinite(d) ? Math.max(7, Math.min(365, Math.round(d))) : audience.delai;
  let message = typeof brut.message === 'string' ? brut.message.trim().slice(0, 500) : '';
  if (!message) message = MESSAGE_DES_REPRISES;
  if (!message.includes('{appel}')) message = `Bonjour {appel}, ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
  message = message.replace(/\s*—\s*/g, ', ');
  const nom = typeof brut.nom === 'string' && brut.nom.trim() ? brut.nom.trim().slice(0, 60) : audience.nom;
  return {
    ok: true,
    processus: { nom, jours: jours.length ? jours : [1], heure, audience: audience.cle, delaiJours, avecPlaces: brut.avecPlaces === true, message },
    aClarifier: typeof brut.aClarifier === 'string' ? brut.aClarifier.trim().slice(0, 300) : '',
  };
}
