/* ══ LE FOYER AU TRÔNE, LES GESTES — 4 novembre 2026 ═════════════════════
   Le parcours du foyer (maquette `public/maquette-le-parcours-du-foyer.html`,
   « construis ») : les règles vivent dans shared/foyer-pur.ts ; ici, les
   écritures au magasin et la question posée, pour que la fenêtre du
   rendez-vous, le Carnet et le calendrier passent par les mêmes.

   SANS `_shared` : la fenêtre du rendez-vous importe ce fichier, et le
   Carnet comme le calendrier importent la fenêtre ; l'inverse ferait un
   cycle à l'amorçage. */
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { clientsStore } from '../../../../shared/clients';
import { uid } from '../../../../shared/store';
import { demandeEntre } from '../../../../ds/demande';
import {
  aLierAvec, appliqueLeDeplacement, autresDuFoyer, deplacementDuFoyer, lienDesRdvs, prenomDe, prenomsDits,
  questionDAnnulation,
} from '../../../../shared/foyer-pur';

/** QUI ANNULER — les rendez-vous qu'annule le geste, ou null pour ne rien
    faire. Hors foyer (ou les autres déjà honorées), elle seule, sans
    question : la question n'existe que là où il y a deux réponses.
    `dit` : ce que l'annulation change, pour qu'une seule fenêtre suffise. */
export async function quiAnnuler(appt: Appointment, dit?: string): Promise<{ ids: string[]; demande: boolean } | null> {
  const q = questionDAnnulation(appt, appointmentsStore.get(), clientsStore.get());
  if (!q) return { ids: [appt.id], demande: false };
  const r = await demandeEntre({
    quoi: 'Annulation du foyer',
    titre: q.titre,
    dit: dit ?? 'Les places annulées sortent du calendrier et ne comptent dans aucun chiffre ; elles restent visibles, barrées, au Carnet.',
    accepter: q.tous,
    autre: q.elle,
    refuser: 'Ne rien annuler',
    dur: true,
  });
  if (r === null) return null;
  return { ids: r === 'accepter' ? q.idsTous : q.idsElle, demande: true };
}

/** DÉPLACER AVEC LE FOYER — écrit le déplacement de `deplacementDuFoyer` et,
    s'il est dit, le maître de CE rendez-vous seul (chaque tête garde le
    sien). Rend le nombre de rendez-vous déplacés, elle comprise. */
export function deplaceAvecLeFoyer(
  appt: Appointment,
  vers: { date: string; time: string; master?: string },
  o: { seulementElle?: boolean } = {},
): number {
  const d = deplacementDuFoyer({ rdv: appt, rdvs: appointmentsStore.get(), date: vers.date, time: vers.time, seulementElle: o.seulementElle });
  const maitre = vers.master && vers.master !== appt.master ? vers.master : null;
  if (d.length === 0 && !maitre) return 0;
  appointmentsStore.set((prev) => appliqueLeDeplacement(prev, d)
    .map((x) => (maitre && x.id === appt.id ? { ...x, master: maitre } : x)));
  return Math.max(d.length, 1);
}

/** « Le foyer suit : B. » — les prénoms des autres têtes du foyer de ce
    rendez-vous, dits ensemble ; vide hors foyer. */
export const quiSuit = (appt: Appointment): string => {
  const fiches = clientsStore.get();
  return prenomsDits(autresDuFoyer(appt, appointmentsStore.get())
    .filter((a) => a.status !== 'honoré')
    .map((a) => prenomDe(fiches.find((c) => c.id === a.clientId)?.name ?? a.clientName)));
};

/** LES LIER — un `foyerId` commun sur ce rendez-vous et ceux que la
    détection voit (même compte famille, même jour, même heure). Rend le
    nombre de rendez-vous liés (zéro : rien à lier). */
export function lieLeFoyer(appt: Appointment): number {
  const tous = appointmentsStore.get();
  const frais = tous.find((a) => a.id === appt.id) ?? appt;
  const avec = aLierAvec(frais, tous, clientsStore.get());
  if (avec.length === 0) return 0;
  const lien = lienDesRdvs([frais, ...avec], `fo-${uid()}`);
  appointmentsStore.set((prev) => prev.map((a) => (lien.ids.includes(a.id) ? { ...a, foyerId: lien.foyerId } : a)));
  return lien.ids.length;
}
