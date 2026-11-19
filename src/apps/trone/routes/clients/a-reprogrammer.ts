/* À REPROGRAMMER, AU TRÔNE — 19 novembre 2026.

   Les gestes de l'équipe sur un rendez-vous empêché (la règle vit dans
   `shared/a-reprogrammer-pur.ts`) : le mettre à reprogrammer quand elle
   prévient au téléphone, l'annuler pour de bon quand il ne sera pas repris,
   et les lister. Reposer une date passe par la fiche du rendez-vous
   (`RdvModal`), qui efface les marques du report à l'enregistrement. */
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { estAReprogrammer, etatDuReport, marquesDuReport, sansLeReport } from '../../../../shared/a-reprogrammer-pur';

/** Elle a prévenu au téléphone : sa place se rend tout de suite, il n'est
    pas annulé. Seul un rendez-vous confirmé ou en attente peut l'être. */
export function metsAReprogrammer(id: string): void {
  const marques = marquesDuReport(Date.now(), 'trone');
  appointmentsStore.set((prev) => prev.map((a) => (a.id === id && (a.status === 'confirmé' || a.status === 'en attente')
    ? { ...a, ...marques }
    : a)));
}

/** Il ne sera pas repris : une vraie annulation, ses marques de report tombent. */
export function annuleLeReport(id: string): void {
  const le = new Date().toISOString();
  appointmentsStore.set((prev) => prev.map((a) => {
    if (a.id !== id || !estAReprogrammer(a)) return a;
    const sans = sansLeReport(a);
    return { ...sans, status: 'annulé', annuleeLe: le, annuleePar: a.aReprogrammerPar === 'trone' ? 'maison' : 'cliente' };
  }));
}

/** Les marques que « Reposer une date » efface, à mettre dans l'écriture. */
export function marquesDeLaRepriseAuTrone(a: Appointment): Partial<Appointment> {
  if (!estAReprogrammer(a)) return {};
  return {
    aReprogrammerDepuis: undefined, aReprogrammerPar: undefined, placesProposees: undefined, relanceDuReportLe: undefined,
    annuleeLe: undefined, annuleePar: undefined,
    reprogrammeLe: new Date().toISOString(), reprogrammePar: 'trone', reprogrammeDe: { date: a.date, time: a.time },
  };
}

/** Les rendez-vous à reprogrammer, le plus ancien report d'abord. */
export function rdvsAReprogrammer(appts: readonly Appointment[]): Appointment[] {
  return appts.filter((a) => estAReprogrammer(a))
    .sort((a, b) => String(a.aReprogrammerDepuis).localeCompare(String(b.aReprogrammerDepuis)));
}

const joursDepuis = (iso: string | undefined, maintenantMs: number): number => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? Math.max(0, Math.floor((maintenantMs - t) / 86_400_000)) : 0;
};

/** Ce que la carte dit : qui l'a mis à reprogrammer, depuis quand, où en est
    la relance, et le 7e jour. */
export function etatDuReportDit(a: Appointment, maintenantMs: number): string {
  const etat = etatDuReport(a, maintenantMs);
  const j = joursDepuis(a.aReprogrammerDepuis, maintenantMs);
  const depuis = j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} jours`;
  const par = a.aReprogrammerPar === 'trone' ? 'noté au Trône' : a.aReprogrammerPar === 'cliente' ? '« Changer l’heure »' : 'prévenu sur WhatsApp';
  const places = a.placesProposees?.length ? ` · ${a.placesProposees.length} place${a.placesProposees.length > 1 ? 's' : ''} envoyée${a.placesProposees.length > 1 ? 's' : ''}` : '';
  if (etat === 'equipe') return `Sans choix depuis ${j} jours : à l’équipe de la rappeler`;
  if (etat === 'relancee') return `Relancée · ${par} ${depuis}${places}`;
  return `${par[0].toUpperCase()}${par.slice(1)} ${depuis}${places}`;
}
