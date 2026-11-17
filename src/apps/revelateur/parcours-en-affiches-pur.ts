import { heureDite as heureDeLInstant, parJour, type Creneau } from '../../shared/visio-pur';
import { insecable, parcoursDe, reponseDite, type Envie, type Ensuite, type Parcours, type RendezVous, type ReponseDuDebut } from '../../shared/envies-pur';
import type { OnlineConsultation } from '../../shared/bridges';

/** Ce que le site dépose : la consultation sans rien de ce que le serveur seul
    écrit (ce qui a été réglé) ni de ce que la Maison calcule (points,
    estimation). Le serveur fait l'identifiant, la date et l'état ; une
    fonction d'avant garde ceux qu'on propose. */
export type ConsultationDuSite = Omit<OnlineConsultation, 'paidXof' | 'besoins'> & {
  besoins: { id: string; mots: string }[];
  /** Le moment voulu de la consultation privée (`momentVoulu` au serveur). */
  moment?: { jour: string; heure: string };
};
import type { Bande } from './prix-calibre';

/* ══ LE PARCOURS EN AFFICHES, LA RÈGLE PURE — 17 novembre 2026 ═════════════
   Maquette « La consultation en affiches », validée par Yéman : « construis ».
   « Trop d'écriture. Des affiches dans le style de Canal Box. Enlever
   "Merci, la Maison confirme" : passer à la réservation. Pas de bilan sans
   rendez-vous. »

   UNE QUESTION PAR ÉCRAN, cinq questions, puis le rendez-vous : « 1 sur 5 ·
   Pour qui ? », « 2 sur 5 · Vos locks ? », trois questions selon la réponse,
   l'écran du rendez-vous (sans numéro), « Votre moment », le billet.

   CE MODULE NE CALCULE NI LECTURE, NI ESTIMATION, NI FOURCHETTE : le bilan
   est remis par la Maison, au rendez-vous. Il tient ce qui se juge sans
   écran : l'ordre des écrans, les mots des réponses, les tranches de locks
   (le nombre se lit AVANT le nom de la Maison), les fiches, les jours et les
   heures de « Votre moment », et ce que le site dépose.

   PUR : ni React, ni réseau, ni horloge. Le banc `verifie-les-envies`
   l'éprouve dans les deux sens. */

/* ── 1. LES ÉCRANS ────────────────────────────────────────────────────── */

export type Ecran =
  | 'pour' | 'locks'
  | 'envies' | 'besoins' | 'couronne'
  | 'epaisseur' | 'longueur' | 'duree'
  | 'depuis' | 'ses-locks' | 'comment'
  | 'rdv';

/** Les trois questions de chaque parcours, après « Pour qui ? » et « Vos locks ? ». */
export const QUESTIONS: Readonly<Record<Parcours, readonly Ecran[]>> = {
  envies: ['envies', 'besoins', 'couronne'],
  modele: ['epaisseur', 'longueur', 'duree'],
  defaire: ['depuis', 'ses-locks', 'comment'],
};
export const NOMBRE_DE_QUESTIONS = 5;

/** Les écrans dans l'ordre : avant la deuxième réponse, on ne connaît que les deux premiers. */
export const ecransDe = (p: Parcours | null): Ecran[] => ['pour', 'locks', ...(p ? [...QUESTIONS[p], 'rdv' as const] : [])];

/** « 3 sur 5 » : le numéro d'une question. L'écran du rendez-vous n'en porte pas. */
export function numeroDe(ecran: Ecran, p: Parcours | null): number | null {
  const i = ecransDe(p).indexOf(ecran);
  return i >= 0 && i < NOMBRE_DE_QUESTIONS ? i + 1 : null;
}

/** Les traits du haut : un par question répondue ou en cours ; tous au rendez-vous. */
export const pasFaits = (ecran: Ecran, p: Parcours | null): number => numeroDe(ecran, p) ?? NOMBRE_DE_QUESTIONS;

/** L'écran d'après, en sautant ceux qui n'ont rien à montrer. */
export function ecranSuivant(ecran: Ecran, p: Parcours | null, sautes: readonly Ecran[] = []): Ecran {
  const tous = ecransDe(p).filter((e) => e === ecran || !sautes.includes(e));
  return tous[Math.min(tous.length - 1, tous.indexOf(ecran) + 1)] ?? ecran;
}

/** L'écran d'avant, par le même chemin. */
export function ecranPrecedent(ecran: Ecran, p: Parcours | null, sautes: readonly Ecran[] = []): Ecran {
  const tous = ecransDe(p).filter((e) => e === ecran || !sautes.includes(e));
  return tous[Math.max(0, tous.indexOf(ecran) - 1)] ?? ecran;
}

/** AUCUNE IMPASSE. Plus loin que « Vos envies » sans plus aucune envie
    choisie, alors qu'il en reste à choisir (un réglage du Trône a retiré la
    sienne) : elle revient à « Vos envies ». Un écran qui n'est pas de son
    parcours ramène à la question des locks. */
export function ecranTenu(ecran: Ecran, p: Parcours | null, o: { choisies: number; montrees: number }): Ecran {
  const tous = ecransDe(p);
  if (!tous.includes(ecran)) return p ? 'locks' : 'pour';
  if (p === 'envies' && tous.indexOf(ecran) > tous.indexOf('envies') && o.choisies === 0 && o.montrees > 0) return 'envies';
  return ecran;
}

/* ── 2. LES MOTS DES RÉPONSES (ceux de la maquette) ───────────────────── */

export type LongueurId = 'court' | 'mi-long' | 'long' | 'inconnue';
/** Les trois longueurs de la Maison et leurs repères, ceux du Trône
    (`LONGUEURS`, shared/catalog.ts : le banc tient la copie) : le repère
    guide, le mot ne suffit pas. */
export const LONGUEURS_DITES: readonly { id: LongueurId; nom: string; repere: string }[] = [
  { id: 'court', nom: 'Courtes', repere: 'jusqu’aux épaules' },
  { id: 'mi-long', nom: 'Mi-longues', repere: 'des épaules aux omoplates' },
  { id: 'long', nom: 'Longues', repere: 'au-delà des omoplates' },
  { id: 'inconnue', nom: 'Je ne sais pas', repere: 'la Maison regardera avec vous' },
];

/** « Sans faux cheveux, avec des cheveux naturels en option » (Yéman) : jamais « extensions ». */
export type Avec = 'cheveux' | 'naturels';
export const AVEC: readonly { id: Avec; nom: string; dit: string; fiche: string }[] = [
  { id: 'cheveux', nom: 'Mes cheveux', dit: 'sans faux cheveux', fiche: 'Mes cheveux, sans faux cheveux' },
  { id: 'naturels', nom: 'Cheveux naturels', dit: 'en option', fiche: 'Cheveux naturels en option' },
];

/** « Court terme 6 mois, moyen terme 1 an, long terme + de 2 ans » (Yéman). */
export const DUREES: readonly { id: string; nom: string; dit: string }[] = [
  { id: 'court', nom: 'Court terme', dit: '6 mois' },
  { id: 'moyen', nom: 'Moyen terme', dit: '1 an' },
  { id: 'long', nom: 'Long terme', dit: 'plus de 2 ans' },
];

export const AGES: readonly { id: string; nom: string }[] = [
  { id: 'moins-1', nom: 'Moins d’1 an' }, { id: '1-3', nom: '1 à 3 ans' }, { id: '3-5', nom: '3 à 5 ans' }, { id: 'plus-5', nom: 'Plus de 5 ans' },
];

export const FACONS: readonly { id: string; nom: string; dit: string; fiche: string }[] = [
  { id: 'demeler', nom: 'Démêler', dit: 'je garde ma longueur', fiche: 'Vous gardez votre longueur' },
  { id: 'couper', nom: 'Couper', dit: 'je repars court', fiche: 'Vous repartez court' },
  { id: 'les-deux', nom: 'Couper puis démêler', dit: 'je garde une partie', fiche: 'Vous gardez une partie de votre longueur' },
  { id: 'inconnue', nom: 'Je ne sais pas', dit: 'la Maison vous conseille', fiche: 'La Maison vous conseille la façon' },
];

export const ENSUITES: readonly { id: Ensuite; nom: string; dit: string }[] = [
  { id: 'libres', nom: 'Cheveux libres', dit: 'sans locks' },
  { id: 'nouvelles', nom: 'Nouvelles locks', dit: 'un autre modèle' },
  { id: 'inconnu', nom: 'Je ne sais pas', dit: 'on en parle au rendez-vous' },
];

/** Ce que disent les affiches du rendez-vous. « Le but de la visio c'est de
    répondre à vos inquiétudes en quelques minutes » (Yéman). */
export const LIGNE_DE_LA_VISIO = 'Un maître de la Maison répond à vos inquiétudes, en quelques minutes';
export const A_PARTIR_DE = ['à partir de', 'confirmé au fauteuil'] as const;

/** LES MOTS DES AFFICHES DU RENDEZ-VOUS SUIVENT LE PARCOURS, et une seule
    fonction les écrit : « vos cheveux » et « votre création » pour qui n'a
    pas encore de locks, « vos locks » et « votre rituel » sinon. */
export function motsDuRendezVous(p: Parcours): { visio: { nom: string; ligne: string }; privee: { nom: string; ligne: string; deduits: string } } {
  const sansLocks = p === 'modele';
  return {
    visio: { nom: 'Visio', ligne: LIGNE_DE_LA_VISIO },
    privee: {
      nom: 'Consultation privée',
      ligne: `À la Maison, devant ${sansLocks ? 'vos cheveux' : 'vos locks'}`,
      deduits: `de ${sansLocks ? 'votre création' : 'votre rituel'}`,
    },
  };
}

/* Un prix ne se coupe jamais sur deux lignes : `insecable` (envies-pur), la même règle qu'au Trône. */
export { insecable };

/* ── 3. LES TRANCHES DE LOCKS ─────────────────────────────────────────── */

/** Une tranche du barème de la Maison : la dernière n'a pas de plafond (aucune tête ne sort du barème). */
export type Tranche = { id: string; nom: string; de: number; a: number | null; coef: number };

export function tranchesDe(bandes: readonly Bande[]): Tranche[] {
  const tri = bandes.filter((b) => !!b && !!b.id && !!b.name).sort((x, y) => (x.maxLocks ?? Infinity) - (y.maxLocks ?? Infinity));
  let bas = 1;
  return tri.map((b, i) => {
    const haut = i === tri.length - 1 ? null : (b.maxLocks ?? null);
    const t: Tranche = { id: b.id, nom: b.name, de: bas, a: haut, coef: Number(b.coef) > 0 ? Number(b.coef) : 1 };
    bas = (b.maxLocks ?? bas) + 1;
    return t;
  });
}

/** « Jusqu’à 80 », « 81 à 150 », « Plus de 550 » : le nombre se lit avant le nom de la Maison. */
export const plageDite = (t: Pick<Tranche, 'de' | 'a'>): string =>
  (t.a === null ? (t.de <= 1 ? 'Tous les nombres' : `Plus de ${t.de - 1}`) : t.de <= 1 ? `Jusqu’à ${t.a}` : `${t.de} à ${t.a}`);

/** Le nombre tapé se traduit seul dans le nom de la Maison : 120 → Medium. */
export const trancheDuNombre = (n: number, tranches: readonly Tranche[]): Tranche | null =>
  (n >= 1 ? tranches.find((t) => n >= t.de && (t.a === null || n <= t.a)) ?? null : null);

/** Le barème qui vaut pour une prestation : celui de sa famille ou de son
    atelier quand il en porte un, sinon celui de la Maison (la règle du Trône,
    `bandForService`, et de `prix-calibre`). */
export function baremeDe(
  categoryId: string,
  sets: Readonly<Record<string, readonly Bande[]>> | undefined,
  cats: readonly { id: string; parentId?: string }[],
  maison: readonly Bande[],
): readonly Bande[] {
  let id: string | undefined = categoryId;
  for (let i = 0; id && i < 8; i += 1) {
    const propre = sets?.[id];
    if (propre?.length) return propre;
    id = cats.find((c) => c.id === id)?.parentId;
  }
  return maison;
}

/** Le nombre tapé, propre : des chiffres, quatre au plus. */
export const nombreTape = (brut: string): string => brut.replace(/\D/g, '').slice(0, 4);

/* L'ÉPAISSEUR : un mot, un point dessiné, et le nombre de locks dessous. Une
   cliente ne connaît pas les noms de la Maison ; elle sait si elle veut des
   locks grosses ou fines. Chaque épaisseur tient la tranche de son rang dans
   le barème ; la dernière tient toutes celles qui restent. */
const NOMS_DES_EPAISSEURS: readonly { id: string; nom: string; r: number }[] = [
  { id: 'gros', nom: 'Gros', r: 11 }, { id: 'moyens', nom: 'Moyens', r: 8 }, { id: 'fins', nom: 'Fins', r: 5.5 },
  { id: 'tres-fins', nom: 'Très fins', r: 3.5 }, { id: 'extra-fins', nom: 'Extra fins', r: 2 },
];
export const EPAISSEUR_INCONNUE = 'inconnue';
export type Epaisseur = { id: string; nom: string; r: number; tranches: Tranche[] };

export function epaisseursDe(tranches: readonly Tranche[]): Epaisseur[] {
  const dernier = NOMS_DES_EPAISSEURS.length - 1;
  return NOMS_DES_EPAISSEURS
    .map((e, i) => ({ ...e, tranches: i < dernier ? tranches.slice(i, i + 1) : tranches.slice(i) }))
    /* Un barème plus court donne moins d'épaisseurs ; sans barème lisible, les cinq mots, sans nombre. */
    .filter((e) => tranches.length === 0 || e.tranches.length > 0);
}

/** « 351 à 450 », d'une épaisseur qui tient plusieurs tranches : de la première à la dernière. */
export const plageDeLEpaisseur = (e: Epaisseur): string =>
  (e.tranches.length ? plageDite({ de: e.tranches[0].de, a: e.tranches[e.tranches.length - 1].a }) : '');

/** Le nom de la Maison ne paraît qu'à la fin, sur la fiche : « Medium », « Nano, Pico ou Galaxy ». */
export function nomDuModele(e: Epaisseur | null): string {
  const noms = e?.tranches.map((t) => t.nom) ?? [];
  if (!noms.length) return 'À choisir ensemble';
  return noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(', ')} ou ${noms[noms.length - 1]}`;
}

/* ── 4. LES FICHES ────────────────────────────────────────────────────── */

export type Fiche = { nom: string; ligne: string; traits: [string, string][]; pied?: string };
const A_VOIR = 'À voir avec la Maison';
const nomDe = <T extends { id: string; nom: string }>(liste: readonly T[], id: string | null): T | undefined => liste.find((x) => x.id === id);

/** « Votre modèle » : le nom de la Maison, puis ses quatre réponses. Son prix reste sous clé. */
export function ficheDuModele(o: {
  epaisseur: Epaisseur | null; longueur: LongueurId | null; avec: Avec | null; duree: string | null;
  /** « 25 000 F les 75 locks », déjà dit dans la devise de la branche. */
  tarifDesNaturels: string;
}): Fiche {
  const l = nomDe(LONGUEURS_DITES, o.longueur);
  const d = nomDe(DUREES, o.duree);
  const plage = o.epaisseur ? plageDeLEpaisseur(o.epaisseur) : '';
  return {
    nom: nomDuModele(o.epaisseur),
    ligne: plage ? `${plage} locks` : 'La Maison vous conseille l’épaisseur',
    traits: [
      ['Épaisseur', o.epaisseur ? o.epaisseur.nom : A_VOIR],
      ['Longueur', !l || l.id === 'inconnue' ? A_VOIR : l.nom],
      ['Avec', (AVEC.find((a) => a.id === o.avec) ?? AVEC[0]).fiche],
      ['Durée', d ? `${d.nom} · ${d.dit}` : ''],
    ],
    ...(o.avec === 'naturels' ? { pied: `Cheveux naturels : ${o.tarifDesNaturels}` } : {}),
  };
}

/** « Défaire vos locks » : la façon en grand, puis ses réponses. */
export function ficheADefaire(o: {
  depuis: string | null; epaisseur: Epaisseur | null; longueur: LongueurId | null; facon: string | null; ensuite: Ensuite | null;
}): Fiche {
  const f = nomDe(FACONS, o.facon) ?? FACONS[FACONS.length - 1];
  const l = nomDe(LONGUEURS_DITES, o.longueur);
  const x = ENSUITES.find((e) => e.id === o.ensuite);
  const plage = o.epaisseur ? plageDeLEpaisseur(o.epaisseur) : '';
  return {
    nom: f.id === 'inconnue' ? 'À choisir ensemble' : f.nom,
    ligne: f.fiche,
    traits: [
      ['Depuis', nomDe(AGES, o.depuis)?.nom ?? ''],
      ['Épaisseur', !o.epaisseur ? A_VOIR : plage ? `${o.epaisseur.nom} · ${plage.toLowerCase()} locks` : o.epaisseur.nom],
      ['Longueur', !l || l.id === 'inconnue' ? A_VOIR : l.nom],
      ['Ensuite', !x || x.id === 'inconnu' ? A_VOIR : x.nom],
    ],
  };
}

/* ── 5. LES BESOINS, LUS POUR LE SITE ─────────────────────────────────── */

/** Ce que le site garde d'un besoin de `mnd_besoins` : ses mots, sa famille
    (l'envie), sa garde. Ses prestations, ses points, les seuils et les paliers
    ne servent plus ici : le navigateur ne calcule plus rien, et la lecture se
    fait au Trône. */
export type BesoinDuSite = { id: string; famille: string; mots: string; garde: boolean };

const objet = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

/** Les besoins que le site montre : écrits, et reliés à une prestation au
    moins (un besoin sans prestation ne paraît pas, le Trône le dit ainsi). */
export function besoinsDuSite(doc: unknown): BesoinDuSite[] {
  const liste = objet(doc).besoins;
  if (!Array.isArray(liste)) return [];
  const vus = new Set<string>();
  const out: BesoinDuSite[] = [];
  for (const brut of liste) {
    const b = objet(brut);
    const id = typeof b.id === 'string' ? b.id : '';
    const mots = typeof b.mots === 'string' ? b.mots.trim() : '';
    if (!id || !mots || vus.has(id) || !Array.isArray(b.prestations) || b.prestations.length === 0) continue;
    vus.add(id);
    out.push({ id, famille: String(b.famille ?? ''), mots, garde: b.garde === 'peau' });
  }
  return out;
}

/** Ce que la garde « peau » écarte (détox, décapant), tel que le Trône l'a réglé. La décoloration
    n'en est plus (17 novembre 2026) : elle se réserve directement, comme le reste de la couleur. */
export function ecarteesParLaPeau(doc: unknown): string[] {
  const liste = objet(doc).ecartesParLaPeau;
  return Array.isArray(liste) ? liste.filter((s): s is string => typeof s === 'string') : [];
}

/** Quatre besoins par envie choisie ; les autres sous « Tout voir ». */
export const BESOINS_D_ABORD = 4;
export function besoinsAMontrer(besoins: readonly BesoinDuSite[], envie: string, tout: boolean): { montres: BesoinDuSite[]; reste: number } {
  const siens = besoins.filter((b) => b.famille === envie);
  const montres = tout ? siens : siens.slice(0, BESOINS_D_ABORD);
  return { montres, reste: siens.length - montres.length };
}

/* ── 6. VOTRE MOMENT : LES JOURS ET LES HEURES ────────────────────────── */

/** Une heure à toucher : `cle` part au serveur (l'instant d'une visio, « HH:MM » au Carnet). */
export type Heure = { cle: string; dit: string; maitre?: string };
export type JourOuvert = { jour: string; heures: Heure[] };

/** « 8 h 30 », « 10 h 00 ». Illisible : rendu tel quel. */
export function heureEnMots(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  return m ? `${Number(m[1])} h ${m[2]}` : String(hhmm ?? '');
}

/** Les quarts d'heure libres de la visio (fonction `visio-salle`), rangés par jour de Cotonou. */
export const joursDeLaVisio = (creneaux: readonly Creneau[]): JourOuvert[] =>
  parJour(creneaux).map((j) => ({ jour: j.jour, heures: j.creneaux.map((c) => ({ cle: c.debut, dit: heureEnMots(heureDeLInstant(c.debut)) })) }));

/** Les jours du Carnet qui gardent au moins une heure libre, dans l'ordre de l'horizon. */
export function joursDuCarnet(jours: readonly string[], heuresDe: (iso: string) => readonly { heure: string; maitre: string }[]): JourOuvert[] {
  const out: JourOuvert[] = [];
  for (const jour of jours) {
    const heures = heuresDe(jour).map((h) => ({ cle: h.heure, dit: heureEnMots(h.heure), maitre: h.maitre }));
    if (heures.length) out.push({ jour, heures });
  }
  return out;
}

/** LES MOMENTS DE LA CONSULTATION PRIVÉE que le serveur posera (`moments-privee`
    de visio-salle : jamais le jour même, la grille, 08:30, une place en ligne
    à la fois), rangés par jour, sans double. `null` : une réponse illisible
    (une fonction d'avant ne connaît pas ce geste), le Carnet prend le relais. */
export function joursDesMoments(moments: unknown): JourOuvert[] | null {
  if (!Array.isArray(moments)) return null;
  const parJourDit = new Map<string, Heure[]>();
  for (const brut of moments) {
    const o = objet(brut);
    const jour = typeof o.jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.jour) ? o.jour : '';
    const heure = typeof o.heure === 'string' && /^\d{2}:\d{2}$/.test(o.heure) ? o.heure : '';
    if (!jour || !heure) continue;
    const liste = parJourDit.get(jour) ?? [];
    if (!liste.some((h) => h.cle === heure)) liste.push({ cle: heure, dit: heureEnMots(heure) });
    parJourDit.set(jour, liste);
  }
  return [...parJourDit.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, heures]) => ({ jour, heures: heures.sort((a, b) => a.cle.localeCompare(b.cle)) }));
}

/** Les quatre prochains jours ouverts, en puces. */
export const JOURS_EN_PUCES = 4;

/** Les puces : les quatre prochains jours ouverts, et le jour choisi au calendrier quand il est plus loin. */
export function pucesDesJours(ouverts: readonly JourOuvert[], choisi: string | null): string[] {
  const quatre = ouverts.slice(0, JOURS_EN_PUCES).map((j) => j.jour);
  return choisi && !quatre.includes(choisi) && ouverts.some((j) => j.jour === choisi) ? [...quatre, choisi] : quatre;
}

/** « Plus de dates » ne se montre que s'il y en a. */
export const ilYAPlusDeDates = (ouverts: readonly JourOuvert[]): boolean => ouverts.length > JOURS_EN_PUCES;

/** Le premier et le dernier mois du calendrier : ceux des jours ouverts. */
export function moisDesJours(ouverts: readonly JourOuvert[]): { premier: string; dernier: string } | null {
  if (!ouverts.length) return null;
  return { premier: ouverts[0].jour.slice(0, 7), dernier: ouverts[ouverts.length - 1].jour.slice(0, 7) };
}

const SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SEMAINE_COURTE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const leJour = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

/** « mer. 18 » ce mois-ci ; « ven. 4 déc. » dès que le mois change. */
export function jourEnPuce(iso: string, aujourdhui: string): string {
  const d = leJour(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${SEMAINE_COURTE[d.getUTCDay()]} ${d.getUTCDate()}${iso.slice(0, 7) === aujourdhui.slice(0, 7) ? '' : ` ${MOIS_COURTS[d.getUTCMonth()]}`}`;
}

/** « Mercredi 18 novembre 2026 », « Mardi 1er décembre 2026 » : l'année toujours, sur une date montrée à une cliente. */
export function jourEnToutesLettres(iso: string): string {
  const d = leJour(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const j = d.getUTCDate();
  const t = `${SEMAINE[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

/* ── 7. LE NUMÉRO ─────────────────────────────────────────────────────── */

/** Le numéro tel qu'il part : avec son indicatif, sauf s'il le porte déjà. */
export function numeroEntier(indicatif: string, saisi: string): string {
  const n = String(saisi ?? '').trim();
  return /^(\+|00)/.test(n) ? n : `${indicatif} ${n}`.trim();
}

/** Huit chiffres au moins : un numéro qu'on peut joindre. */
export const numeroLisible = (saisi: string): boolean => String(saisi ?? '').replace(/\D/g, '').length >= 8;

/* ── 8. CE QUE LE SITE DÉPOSE ─────────────────────────────────────────── */

export type Reponses = {
  pour: 'moi' | 'enfant' | null;
  locks: ReponseDuDebut | null;
  /** Les envies choisies (identifiants), dans l'ordre où elle les a touchées. */
  envies: string[];
  besoins: string[];
  /** Le nombre de locks tapé, ou rien. */
  nombre: string;
  /** La tranche choisie ou traduite du nombre (identifiant du barème). */
  calibre: string | null;
  longueur: LongueurId | null;
  /** L'épaisseur (parcours du modèle, parcours à défaire) : son identifiant, ou « inconnue ». */
  epaisseur: string | null;
  avec: Avec | null;
  duree: string | null;
  depuis: string | null;
  facon: string | null;
  ensuite: Ensuite | null;
};

export const REPONSES_VIDES: Reponses = {
  pour: null, locks: null, envies: [], besoins: [], nombre: '', calibre: null, longueur: null,
  epaisseur: null, avec: null, duree: null, depuis: null, facon: null, ensuite: null,
};

/** Changer la première réponse. SANS CHANGER DE PARCOURS (« faites
    ailleurs » vers « faites à la Maison MND »), ses réponses restent ; l'îlot
    retire seulement les envies que la nouvelle réponse écarte
    (`rangeLesChoisies`). Elles ne repartent de zéro que si le PARCOURS
    change : l'épaisseur voulue d'un modèle n'est pas celle de locks à défaire. */
export function apresLaReponseDuDebut(r: Reponses, locks: ReponseDuDebut): Reponses {
  if (r.locks === locks) return r;
  return r.locks && parcoursDe(r.locks) === parcoursDe(locks) ? { ...r, locks } : { ...REPONSES_VIDES, pour: r.pour, locks };
}

export type Moment = { jour: string; heure: string };

/** LA CONSULTATION DÉPOSÉE : ses réponses, sa couronne, le rendez-vous
    demandé. AUCUNE LECTURE, AUCUNE ESTIMATION, AUCUN MONTANT : le bilan est
    remis par la Maison, au rendez-vous. `answers.fiche` porte ses réponses en
    lignes lisibles, quel que soit le parcours. */
export function consultationADeposer(o: {
  id: string; maintenant: string; prenom: string; telephone: string; devise: string; branchId: string;
  parcours: Parcours; reponses: Reponses;
  envies: readonly Envie[]; besoins: readonly BesoinDuSite[];
  tranche: Tranche | null; epaisseur: Epaisseur | null; fiche: Fiche | null;
  rendezVous: RendezVous; moment?: Moment;
}): ConsultationDuSite {
  const r = o.reponses;
  const longueur = r.longueur && r.longueur !== 'inconnue' ? r.longueur : undefined;
  const locks = Number(r.nombre) > 0 ? Number(r.nombre) : undefined;
  const calibre = o.parcours === 'envies' ? o.tranche : o.epaisseur?.tranches[0] ?? null;
  const lignes: [string, string][] = [
    ['Pour', r.pour === 'enfant' ? 'Son enfant' : 'Elle'],
    ['Ses locks', r.locks ? reponseDite(r.locks) : ''],
    ...(o.parcours === 'envies'
      ? [
        ['Envies', o.envies.map((e) => e.nom).join(', ')] as [string, string],
        ['Locks', locks ? `${locks}${o.tranche ? ` · ${o.tranche.nom}` : ''}` : o.tranche ? `${plageDite(o.tranche)} · ${o.tranche.nom}` : ''] as [string, string],
        /* « Je ne sais pas » ne se recopie jamais tel quel : à voir avec la Maison. */
        ['Longueur', r.longueur === 'inconnue' ? A_VOIR : LONGUEURS_DITES.find((l) => l.id === r.longueur)?.nom ?? ''] as [string, string],
      ]
      : o.fiche ? [['Demande', o.fiche.nom] as [string, string], ...o.fiche.traits] : []),
    ['Rendez-vous demandé', o.rendezVous === 'visio' ? 'Visio' : 'Consultation privée'],
  ];
  return {
    id: o.id,
    createdAt: o.maintenant,
    parcours: o.parcours === 'modele' ? 'creation' : 'sos',
    client: { name: o.prenom, phone: o.telephone, city: '', currency: o.devise },
    answers: {
      parcours: o.parcours,
      pour: r.pour ?? 'moi',
      locks: r.locks ?? '',
      envies: o.envies.map((e) => ({ id: e.id, nom: e.nom })),
      besoins: o.besoins.map((b) => b.mots),
      ...(o.parcours === 'modele' ? { modele: { epaisseur: r.epaisseur, longueur: r.longueur, avec: r.avec, duree: r.duree } } : {}),
      ...(o.parcours === 'defaire' ? { defaire: { depuis: r.depuis, epaisseur: r.epaisseur, longueur: r.longueur, facon: r.facon, ensuite: r.ensuite } } : {}),
      rendezVous: o.rendezVous,
      fiche: lignes.filter(([, v]) => v !== ''),
    },
    branchId: o.branchId,
    status: 'nouvelle',
    modalite: 'auto',
    besoins: o.besoins.map((b) => ({ id: b.id, mots: b.mots })),
    couronne: {
      ...(o.parcours === 'envies' && locks ? { locks } : {}),
      ...(calibre ? { calibreId: calibre.id } : {}),
      ...(o.parcours === 'envies' ? (o.tranche ? { calibreDit: o.tranche.nom } : {}) : o.epaisseur?.tranches.length ? { calibreDit: nomDuModele(o.epaisseur) } : {}),
      ...(longueur ? { longueur } : {}),
      ...(r.locks && r.locks !== 'defaire' ? { nees: r.locks } : {}),
      pour: r.pour ?? 'moi',
    },
    ...(o.besoins.some((b) => b.garde) ? { garde: 'peau' as const } : {}),
    ...(o.moment ? { moment: o.moment } : {}),
  };
}

/** Le mot qui accompagne un rituel réservé (`demande-submit`, champ `mot`) :
    ce qu'elle a dit, pour la personne qui la reçoit. Jamais un montant. */
export function motDuRituel(o: { envies: readonly Envie[]; besoins: readonly BesoinDuSite[]; fiche: Fiche | null; longueur: LongueurId | null }): string {
  const l = LONGUEURS_DITES.find((x) => x.id === o.longueur);
  return [
    'Consultation du site',
    o.envies.length ? `Envies : ${o.envies.map((e) => e.nom).join(', ')}` : '',
    o.besoins.length ? `Besoins : ${o.besoins.map((b) => b.mots).join(' ; ')}` : '',
    o.fiche ? `${o.fiche.nom} · ${o.fiche.traits.filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join(' · ')}` : '',
    !o.fiche && l && l.id !== 'inconnue' ? `Longueur : ${l.nom.toLowerCase()}` : '',
  ].filter(Boolean).join(' · ').slice(0, 900);
}
