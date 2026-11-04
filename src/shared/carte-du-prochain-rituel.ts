/* ══ LA CARTE « SON PROCHAIN RITUEL », SES ÉCRITURES · 4 novembre 2026 ══
   La règle de la carte est pure (`carte-du-prochain-rituel-pur.ts`) : elle
   rend des EFFETS. Poser passe par le geste de la fenêtre du rendez-vous
   (`poseUnRendezVous`, agenda.ts) ; les trois autres écritures vivent ici,
   au même endroit pour la fenêtre d'encaissement, la Caisse et le Carnet :

   · DÉPLACER : le même rendez-vous, à une autre place. Il garde sa pose (son
     estampille) et son drapeau `sansConfirmation` : rien ne part ;
   · RETIRER : le rendez-vous que la carte vient de poser s'efface ; aucun
     message n'était parti. Son rituel en garde la marque (`repriseRetiree`),
     comme quand on efface une reprise au Carnet ;
   · LEVER LA CONFIRMATION, à la fermeture : `sansConfirmation` tombe, la
     fonction confirmation-rdv balaie le rendez-vous (neuf, confirmé, posé
     depuis moins de deux heures) et la confirmation part UNE fois, à la
     date retenue.

   Et la porte du Carnet : après « Honoré » sans encaisser, la carte s'ouvre
   quand ce rituel est le moment de proposer la suite (le dernier de la
   tête, récent, sans suite retirée ni prochain déjà posé). */
import { appointmentsStore, type Appointment } from './agenda';
import { clientsStore } from './clients';
import { pourquoiPasDeRepriseIci, prochainDejaPose, rituelDeLaRepriseEffacee } from './reprise-nue';

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Le rendez-vous de la carte, à sa nouvelle place (et son prix rejugé à
    cette date) : sa pose et son silence restent ceux d'avant. */
export function remplaceLeRendezVousDeLaCarte(neuf: Appointment): void {
  appointmentsStore.set((prev) => prev.map((a) => (a.id === neuf.id
    ? { ...neuf, ...(a.creeLe ? { creeLe: a.creeLe } : {}), ...(a.sansConfirmation ? { sansConfirmation: true } : {}) }
    : a)));
}

/** « Pas de prochain rendez-vous » : il s'efface, rien ne part ; son rituel
    garde la marque d'une suite retirée à la main. */
export function retireLeRendezVousDeLaCarte(rdvId: string): void {
  const efface = appointmentsStore.get().find((a) => a.id === rdvId);
  if (!efface) return;
  const marque = rituelDeLaRepriseEffacee(efface);
  appointmentsStore.set((prev) => prev
    .filter((a) => a.id !== rdvId)
    .map((a) => (a.id === marque ? { ...a, repriseRetiree: true } : a)));
}

/** À la fermeture : le drapeau tombe, la confirmation part une fois. */
export function leveLaConfirmation(rdvId: string): void {
  appointmentsStore.set((prev) => prev.map((a) => {
    if (a.id !== rdvId || !('sansConfirmation' in a)) return a;
    const { sansConfirmation: _tombe, ...reste } = a;
    return reste as Appointment;
  }));
}

/** APRÈS « HONORÉ » SANS ENCAISSER, LA CARTE S'OUVRE-T-ELLE ? Une fiche, des
    gestes, et le moment de la suite : ce rituel est le dernier de la tête,
    de moins de quatorze jours, sans suite retirée (`pourquoiPasDeRepriseIci`),
    et aucun rendez-vous n'est déjà posé (il se dit alors dans le bandeau). */
export function laCarteSOuvreApresLHonneur(rituelId: string): boolean {
  const tous = appointmentsStore.get();
  const rituel = tous.find((a) => a.id === rituelId);
  if (!rituel || rituel.status !== 'honoré' || !rituel.clientId || rituel.serviceIds.length === 0) return false;
  if (!clientsStore.get().some((c) => c.id === rituel.clientId)) return false;
  const jour = aujourdhui();
  return !pourquoiPasDeRepriseIci(rituel, tous, jour) && !prochainDejaPose(rituel, tous, jour);
}

/** Son prochain rendez-vous déjà posé, s'il y en a un : ce que le bandeau du
    Carnet dit quand la carte ne s'ouvre pas pour lui. */
export function sonProchainDejaPose(rituelId: string): Appointment | null {
  const tous = appointmentsStore.get();
  const rituel = tous.find((a) => a.id === rituelId);
  return rituel ? prochainDejaPose(rituel, tous, aujourdhui()) : null;
}
