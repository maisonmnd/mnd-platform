/* ══ LE TABLEAU DE BORD EN QUATRE BANDES, SES CHIFFRES — 5 novembre 2026 ══
   Maquette « Tableau de bord » validée par Yéman (« c'est bon construis ») :
   un bandeau de six chiffres, Aujourd'hui, À traiter, Le mois. Les sommes
   d'argent viennent des portes déjà partagées du Trône (`revenuDuMois`,
   `revenuDuJour`, `depensesDuMois`, la prévision du mois) ; ce module ne tient
   que les petits comptes que l'écran fait lui-même, pour qu'ils restent purs
   et éprouvés : ni magasin, ni réseau, ni React. */

/** Ce qu'un compte lit d'un rendez-vous. */
export type RdvDuTableau = {
  clientId: string;
  date: string;
  status: string;
  coveredBySub?: boolean;
  seriesIndex?: number;
};

const jourDe = (d: string | undefined): string => String(d ?? '').slice(0, 10);

/** Le jour, n jours plus tard (ou plus tôt), compté à midi UTC : aucun
    changement d'heure ne fait sauter un jour. */
export function decaleJour(iso: string, n: number): string {
  const d = new Date(`${jourDe(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** LES RITUELS HONORÉS D'UN MOIS, jusqu'à un jour (inclus) : leur nombre, et
    ce qu'ils valent. La règle du « chiffre des prestations » : une séance de
    formule ou la suite d'une série se compte en nombre, sans argent ; un
    annulé ne compte nulle part. */
export function honoresDuMois<T extends RdvDuTableau>(
  rdvs: readonly T[], mois: string, jusquA: string | null, netDe: (a: T) => number,
): { nombre: number; xof: number } {
  let nombre = 0; let xof = 0;
  for (const a of rdvs) {
    if (a.status !== 'honoré') continue;
    const j = jourDe(a.date);
    if (j.slice(0, 7) !== mois || (jusquA && j > jusquA)) continue;
    nombre += 1;
    if (a.coveredBySub || (a.seriesIndex ?? 1) > 1) continue;
    xof += Math.max(0, netDe(a));
  }
  return { nombre, xof };
}

/** LES CLIENTES ACTIVES : les têtes distinctes venues (un rituel honoré)
    pendant les `jours` derniers jours, aujourd'hui compris. */
export function clientesActives(rdvs: readonly RdvDuTableau[], aujourdhui: string, jours = 90): number {
  const depuis = decaleJour(aujourdhui, -(jours - 1));
  const tetes = new Set<string>();
  for (const a of rdvs) {
    const j = jourDe(a.date);
    if (a.status === 'honoré' && a.clientId && j >= depuis && j <= aujourdhui) tetes.add(a.clientId);
  }
  return tetes.size;
}

/** LES SEPT JOURS QUI VIENNENT, aujourd'hui compris : les rendez-vous posés
    (non annulés) et les jours ouverts où rien n'est posé. */
export function septJours(
  rdvs: readonly RdvDuTableau[], aujourdhui: string, fermeLe: (iso: string) => boolean,
): { rdv: number; joursLibres: number; joursOuverts: number } {
  const jours = Array.from({ length: 7 }, (_, k) => decaleJour(aujourdhui, k));
  const parJour = new Map<string, number>();
  for (const a of rdvs) {
    if (a.status === 'annulé') continue;
    const j = jourDe(a.date);
    if (j < jours[0] || j > jours[6]) continue;
    parJour.set(j, (parJour.get(j) ?? 0) + 1);
  }
  let rdv = 0; let joursLibres = 0; let joursOuverts = 0;
  for (const j of jours) {
    const n = parJour.get(j) ?? 0;
    rdv += n;
    if (fermeLe(j) && n === 0) continue;
    joursOuverts += 1;
    if (n === 0) joursLibres += 1;
  }
  return { rdv, joursLibres, joursOuverts };
}

/** Un versement : son jour et son montant. */
export type VersementLu = { date?: string; amountXof: number };

/** LES VERSEMENTS D'UN MOIS, jusqu'à un jour : combien (les positifs). */
export function versementsDuMois(versements: readonly VersementLu[], mois: string, jusquA: string): number {
  return versements.filter((v) => v.amountXof > 0 && jourDe(v.date).slice(0, 7) === mois && jourDe(v.date) <= jusquA).length;
}

/** CE QUI EST ENTRÉ CE MOIS POUR LES MOIS D'AVANT : les versements du mois
    (jusqu'à aujourd'hui) posés sur une facture datée d'un mois antérieur. */
export function encaissePourLesMoisDAvant(
  factures: readonly { date?: string; reglements: readonly VersementLu[] }[], mois: string, jusquA: string,
): { xof: number; versements: number; factures: number } {
  let xof = 0; let versements = 0; let n = 0;
  for (const f of factures) {
    if (!jourDe(f.date) || jourDe(f.date).slice(0, 7) >= mois) continue;
    const siens = f.reglements.filter((v) => v.amountXof > 0 && jourDe(v.date).slice(0, 7) === mois && jourDe(v.date) <= jusquA);
    if (!siens.length) continue;
    n += 1;
    versements += siens.length;
    xof += siens.reduce((s, v) => s + v.amountXof, 0);
  }
  return { xof, versements, factures: n };
}

/** LE PROCHAIN PASSAGE DE GRENAT, aux heures réglées (minutes depuis minuit,
    à Cotonou) : l'heure qui vient, ou `null` quand le dernier est passé (il
    relit alors la journée au mot du matin). */
export function prochainPassage(heures: readonly number[], minutesMaintenant: number): number | null {
  const h = [...heures].sort((a, b) => a - b).find((x) => x * 60 > minutesMaintenant);
  return h === undefined ? null : h;
}

/** Les envois en salle d'attente qui partent dans la demi-heure. */
export function envoisSousLaDemiHeure(
  envois: readonly { statut?: string; partA?: string }[], maintenantMs: number, enAttente = 'en-attente',
): number {
  return envois.filter((e) => {
    if (e.statut !== enAttente) return false;
    const t = Date.parse(e.partA ?? '');
    return Number.isFinite(t) && t <= maintenantMs + 30 * 60_000;
  }).length;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 12 et 17 nov. 2026 », « 28 nov. et 2 déc. 2026 » : des jours, avec
    l'année. Trois au plus, puis « + 2 ». */
export function joursDits(isos: readonly string[], max = 3): string {
  const tries = [...new Set(isos.map(jourDe).filter(Boolean))].sort();
  if (!tries.length) return '';
  const vus = tries.slice(0, max);
  const memeMois = vus.every((j) => j.slice(0, 7) === vus[0].slice(0, 7));
  const parties = vus.map((j, i) => {
    const jour = String(Number(j.slice(8, 10)));
    const mois = MOIS_COURTS[Number(j.slice(5, 7)) - 1];
    if (memeMois) return i === vus.length - 1 ? `${jour} ${mois}` : jour;
    return `${jour} ${mois}`;
  });
  const dit = parties.length > 1 ? `${parties.slice(0, -1).join(', ')} et ${parties[parties.length - 1]}` : parties[0];
  const reste = tries.length - vus.length;
  return `${dit} ${vus[vus.length - 1].slice(0, 4)}${reste > 0 ? ` + ${reste}` : ''}`;
}

/** « Jeudi 5 novembre 2026 ». */
export function dateDuTitre(iso: string): string {
  const j = jourDe(iso);
  const d = new Date(`${j}T12:00:00Z`);
  const n = Number(j.slice(8, 10));
  const t = `${JOURS_LONGS[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS_LONGS[Number(j.slice(5, 7)) - 1]} ${j.slice(0, 4)}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « novembre », « octobre » : le nom d'un mois (aaaa-mm). */
export const nomDuMois = (mois: string): string => MOIS_LONGS[Number(mois.slice(5, 7)) - 1] ?? '';

/** Le mois d'avant (aaaa-mm), k mois plus tôt. */
export function moisAvant(mois: string, k = 1): string {
  const a = Number(mois.slice(0, 4)); const m = Number(mois.slice(5, 7));
  const d = new Date(Date.UTC(a, m - 1 - k, 15));
  return d.toISOString().slice(0, 7);
}

/** « 2 rendez-vous », « 1 facture » : un nombre et son nom, accordé. */
export const nombreDe = (n: number, un: string, plusieurs = `${un}s`): string => `${n} ${n > 1 ? plusieurs : un}`;
