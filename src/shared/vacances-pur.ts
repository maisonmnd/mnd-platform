/* ══ LES VACANCES ANNUELLES · 6 novembre 2026 ══════════════════════════
   « Dans Ressources humaines, c'est très important que je puisse avoir les
   vacances annuelles à côté de congés et absences. Ça, je dois le caler à
   part. Ensuite, je dois pouvoir générer une fiche PDF PRO quand je pose les
   congés du staff » (Yéman). Maquette 1Jc1m2bUp8rovJ5tmejBAo, version 2,
   « Construis ».

   Ses choix (6 novembre 2026, sélecteur) :
   · UN SEUL SOLDE de congés payés : les vacances s'y décomptent comme les
     congés, et la fiche dit ce qui reste ;
   · des jours CALENDAIRES, du premier au dernier jour inclus, dimanche et
     lundi compris, comme ses fiches de janvier 2027 ;
   · la fiche PDF se fait et se range SEULE au dossier dès qu'un congé est
     accordé ou des vacances calées ; « Fiche PDF » la refait ;
   · la FERMETURE DE LA MAISON vaut pour toute l'équipe : au planning, et en
     journée exceptionnelle fermée (la réservation en ligne ne la propose pas).

   Ici, rien que des calculs : ni magasin, ni écran, ni horloge lue en douce.
   Le banc `verifie-les-vacances-annuelles` les éprouve. */
import { ouvertureDuJour, type ExceptionDHoraire, type HeureDeLaSemaine } from './agenda-pur';
import { ajouteJours, poseLeJour, statutDuJour, type Planning } from './rh-pur';

const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const enUtc = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);

/* ── 1. LES JOURS ───────────────────────────────────────────────────── */
/** Jours calendaires, du premier au dernier inclus ; 0 si la période ne se lit pas. */
export function joursCalendaires(du: string, au: string): number {
  if (!RE_JOUR.test(du ?? '') || !RE_JOUR.test(au ?? '') || au < du) return 0;
  return Math.round((enUtc(au) - enUtc(du)) / 86_400_000) + 1;
}

/** LA REPRISE : le premier jour, après la fin, où la Maison est ouverte
    (la semaine des Paramètres et ses journées exceptionnelles fermées). */
export function repriseApres(au: string, semaine: readonly HeureDeLaSemaine[], exceptions: readonly ExceptionDHoraire[] = []): string {
  let d = ajouteJours(au, 1);
  for (let n = 0; n < 120 && ouvertureDuJour(d, semaine, exceptions).closed; n += 1) d = ajouteJours(d, 1);
  return d;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « vendredi 1er janvier 2027 ». */
export function jourLong(iso: string): string {
  if (!RE_JOUR.test(iso ?? '')) return iso;
  const d = new Date(enUtc(iso));
  const j = d.getUTCDate();
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** « janvier 2027 », depuis « 2027-01 » ou une date. */
export const moisDit = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  return m ? `${MOIS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

/* ── 2. CE QUI SE CALE ──────────────────────────────────────────────── */
/** La forme d'une demande de congé que la règle lit (`LeaveRequest`). */
export type CongeLu = {
  id: string; employeeId: string; type: string; startDate: string; endDate: string; days: number;
  status: string; reason?: string; fermeture?: string; branchId?: string;
};
export type GenreDePeriode = 'vacances' | 'conge' | 'fermeture';
export type Periode = { id: string; du: string; au: string; jours: number; reprise: string; genre: GenreDePeriode; note?: string };

/** Ce qui compte dans le solde : un congé ACCORDÉ ou des vacances calées. */
export const compteAuSolde = (l: CongeLu): boolean => l.status === 'approuve' && (l.type === 'conge' || l.type === 'vacances');

/** Les périodes d'une personne qui touchent cette année, la première d'abord. */
export function periodesDeLAnnee(o: {
  conges: readonly CongeLu[]; employeeId: string; annee: number;
  semaine: readonly HeureDeLaSemaine[]; exceptions?: readonly ExceptionDHoraire[];
}): Periode[] {
  const debut = `${o.annee}-01-01`; const fin = `${o.annee}-12-31`;
  return o.conges
    .filter((l) => l.employeeId === o.employeeId && compteAuSolde(l) && l.startDate <= fin && l.endDate >= debut)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((l) => ({
      id: l.id, du: l.startDate, au: l.endDate, jours: joursCalendaires(l.startDate, l.endDate),
      reprise: repriseApres(l.endDate, o.semaine, o.exceptions ?? []),
      genre: l.fermeture ? 'fermeture' : l.type === 'vacances' ? 'vacances' : 'conge',
      ...(l.reason ? { note: l.reason } : {}),
    }));
}
export const totalDesJours = (periodes: readonly { jours: number }[]): number => periodes.reduce((s, p) => s + p.jours, 0);

/** LE DROIT DE L'ANNÉE : les mois de service dans l'année, fois le taux des
    Paramètres de paie (jours par mois). Une arrivée en cours d'année n'a droit
    qu'à ses mois ; jamais plus de douze. */
export function droitDeLAnnee(since: string | undefined, annee: number, joursParMois: number): number {
  const taux = Number.isFinite(joursParMois) && joursParMois > 0 ? joursParMois : 0;
  let mois = 12;
  if (since && RE_JOUR.test(since.slice(0, 10))) {
    const [a, m, j] = since.slice(0, 10).split('-').map(Number);
    if (a > annee) mois = 0;
    else if (a === annee) mois = Math.max(0, 12 - (m - 1) - (j > 1 ? 1 : 0));
  }
  return Math.round(mois * taux * 10) / 10;
}

/** Pourquoi une période ne se cale pas, ou `null`. */
export function pourquoiPasLaPeriode(o: { du: string; au: string; employeeId?: string; conges?: readonly CongeLu[]; sauf?: string }): string | null {
  if (!RE_JOUR.test(o.du ?? '') || !RE_JOUR.test(o.au ?? '')) return 'Choisissez le premier et le dernier jour.';
  if (o.au < o.du) return 'Le dernier jour vient avant le premier.';
  if (joursCalendaires(o.du, o.au) > 62) return 'Plus de deux mois d’un coup : calez-les en plusieurs fois.';
  if (o.employeeId && o.conges) {
    const deja = o.conges.find((l) => l.employeeId === o.employeeId && l.id !== o.sauf && compteAuSolde(l) && l.startDate <= o.au && l.endDate >= o.du);
    if (deja) return `Déjà en congé du ${jourLong(deja.startDate)} au ${jourLong(deja.endDate)} : ces jours ne se comptent pas deux fois.`;
  }
  return null;
}

/* ── 3. LA FERMETURE DE LA MAISON ───────────────────────────────────── */
/** Une fermeture, pour chacun de l'équipe : des vacances accordées, liées
    entre elles par l'identifiant de la fermeture. Celui qui est déjà en congé
    ces jours-là ne reçoit rien de plus : un jour ne compte qu'une fois. */
export function fermetureEnConges(o: {
  fermetureId: string; du: string; au: string; note?: string;
  equipe: readonly { id: string }[]; conges: readonly CongeLu[];
  branchId?: string; par: string; le: string;
}): (CongeLu & { decidedBy: string; decidedAt: string })[] {
  const note = (o.note ?? '').trim() || 'Fermeture de la Maison';
  return o.equipe
    .filter((m) => !pourquoiPasLaPeriode({ du: o.du, au: o.au, employeeId: m.id, conges: o.conges }))
    .map((m) => ({
      id: `lv-${o.fermetureId}-${m.id}`, employeeId: m.id, type: 'vacances', startDate: o.du, endDate: o.au,
      days: joursCalendaires(o.du, o.au), status: 'approuve', reason: note, fermeture: o.fermetureId,
      ...(o.branchId ? { branchId: o.branchId } : {}), decidedBy: o.par, decidedAt: o.le,
    }));
}
/** Les journées exceptionnelles fermées qu'une fermeture ajoute : chaque jour
    de la période que la Maison n'a pas déjà fermé pour tous. */
export function joursAFermer(o: {
  fermetureId: string; du: string; au: string; note?: string; exceptions: readonly (ExceptionDHoraire & { id?: string })[];
}): { id: string; date: string; open: string; close: string; closed: true; note: string }[] {
  const note = (o.note ?? '').trim() || 'Fermeture de la Maison';
  const out: { id: string; date: string; open: string; close: string; closed: true; note: string }[] = [];
  for (let d = o.du, n = 0; d <= o.au && n < 62; d = ajouteJours(d, 1), n += 1) {
    if (o.exceptions.some((x) => x.date === d && !x.staffId && x.closed)) continue;
    out.push({ id: `hx-${o.fermetureId}-${d}`, date: d, open: '', close: '', closed: true, note });
  }
  return out;
}

/* ── 4. LE PLANNING ─────────────────────────────────────────────────── */
/** Les vacances se posent au planning, jour par jour, en congé ; un jour
    d'INVENTAIRE posé reste un jour de travail. */
export function poseLesVacances(p: Planning | undefined, staffId: string, du: string, au: string): Planning {
  let out = p ?? {};
  for (let d = du, n = 0; d <= au && n < 400; d = ajouteJours(d, 1), n += 1) {
    if (statutDuJour(out, staffId, d) === 'inventaire') continue;
    out = poseLeJour(out, staffId, d, 'conge');
  }
  return out;
}
/** Retirer des vacances vide leurs jours de congé au planning, et seulement eux. */
export function retireLesVacances(p: Planning | undefined, staffId: string, du: string, au: string): Planning {
  let out = p ?? {};
  for (let d = du, n = 0; d <= au && n < 400; d = ajouteJours(d, 1), n += 1) {
    if (statutDuJour(out, staffId, d) === 'conge') out = poseLeJour(out, staffId, d, '');
  }
  return out;
}

/* ── 5. LA FICHE ────────────────────────────────────────────────────── */
const ORDINAUX = ['Premier', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième'];
const ORDINAUX_F = ['Première', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième', 'Sixième', 'Septième', 'Huitième'];
/** « Premier », « Second » quand il n'y en a que deux, « Troisième »… */
export const ordinal = (i: number, n: number, feminin = false): string =>
  n === 2 && i === 1 ? (feminin ? 'Seconde' : 'Second') : (feminin ? ORDINAUX_F : ORDINAUX)[i] ?? `${i + 1}e`;
const NOMBRES = ['zéro', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit'];

export type SectionDeLaFiche = { numero: number; titre: string; libelleConge: string; libelleReprise: string; du: string; au: string; jours: number; reprise: string; note?: string };
export type FicheDeConges = {
  sourcil: string; titre: string; prenom: string; lead: string;
  sections: SectionDeLaFiche[]; total: string; libelleTotal: string; reste?: string;
};
/** CE QUE DIT LA FICHE : la présentation des fiches de janvier 2027 (session
    des fiches, fiches.mjs) : chaque congé et sa reprise, numérotés, le total,
    puis ce qui reste du droit de l'année. `periode` : « 2027 » ou
    « janvier 2027 ». */
export function ficheDeConges(o: { prenom: string; periode: string; periodes: readonly Periode[]; droit?: number; prisDansLAnnee?: number }): FicheDeConges {
  const n = o.periodes.length;
  const sections = o.periodes.map((p, i) => {
    const c = n > 1 ? `${ordinal(i, n)} congé` : 'Votre congé';
    const r = n > 1 ? `${ordinal(i, n, true)} reprise` : 'Votre reprise';
    return {
      numero: i + 1, titre: `${c} · ${r}`, libelleConge: c, libelleReprise: r,
      du: jourLong(p.du), au: jourLong(p.au), jours: p.jours, reprise: jourLong(p.reprise), ...(p.note ? { note: p.note } : {}),
    };
  });
  const jours = o.periodes.map((p) => p.jours);
  const somme = totalDesJours(o.periodes);
  const lead = n === 0 ? `Aucun congé en ${o.periode}.`
    : n === 1 ? `Un congé et une reprise en ${o.periode}.`
      : `${NOMBRES[n] ?? n} congés et ${(NOMBRES[n] ?? String(n)).toLowerCase()} reprises en ${o.periode}.`;
  const pris = o.prisDansLAnnee ?? somme;
  return {
    sourcil: `L’équipe · ${o.periode}`,
    titre: `Vos congés de ${o.periode}`,
    prenom: o.prenom,
    lead,
    sections,
    libelleTotal: `Total de vos congés en ${o.periode}`,
    total: `${jours.length > 1 ? `${jours.join(' + ')} = ` : ''}${somme} jour${somme > 1 ? 's' : ''}`,
    ...(o.droit != null && o.droit > 0 ? { reste: resteDit(o.droit, pris) } : {}),
  };
}
/** « Reste de votre droit de l’année : 12 jours sur 24. », « 0 jour », « 1 jour ». */
export function resteDit(droit: number, pris: number): string {
  const r = Math.max(0, Math.round((droit - pris) * 10) / 10);
  return `Reste de votre droit de l’année : ${r} jour${r > 1 ? 's' : ''} sur ${droit}.`;
}
/** Le nom du fichier : « Congés 2027 - Gérard.pdf ». */
export const nomDeLaFiche = (periode: string, prenom: string): string => `Congés ${periode} - ${prenom}.pdf`;
