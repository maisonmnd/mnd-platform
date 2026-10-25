/* RÉGLER SA SÉANCE, CÔTÉ TRÔNE — 25 octobre 2026.
   Le lien se pose sur le rendez-vous à « Terminer la séance » : un jeton tiré
   au hasard, gardé tant que le rendez-vous vit (un second envoi garde le
   même lien). La règle vit dans regler-la-seance-pur.ts. */
import { appointmentsStore } from './agenda';
import { LIEN_TAPGO } from './mnd-pay-pur';
import { estUnJeton, jetonDe, LONGUEUR_DU_JETON, parametreDuLien, type LienDeReglement } from './regler-la-seance-pur';

/** L'adresse entière du lien : la page payer.html, qui mène à regler.html. */
export const adresseDuLien = (jeton: string): string => `${LIEN_TAPGO}${parametreDuLien(jeton)}`;

/** Le jeton du rendez-vous, posé s'il manque. Tap & Go, quand il est
    proposé à côté, se note avec le reste qu'il compose : la page ne le montre
    que tant que ce reste n'a pas bougé. Rend null si le rendez-vous manque. */
export function poseLeLienDeReglement(apptId: string, tapgo?: LienDeReglement['tapgo']): string | null {
  const rdv = appointmentsStore.get().find((a) => a.id === apptId);
  if (!rdv) return null;
  const deja = rdv.lienDeReglement?.jeton;
  const jeton = estUnJeton(deja) ? deja : jetonDe(crypto.getRandomValues(new Uint32Array(LONGUEUR_DU_JETON)));
  appointmentsStore.set((prev) => prev.map((a) => {
    if (a.id !== apptId) return a;
    const avant = a.lienDeReglement;
    const lien: LienDeReglement = {
      ...(avant ?? {}), jeton, creeLe: avant?.creeLe ?? new Date().toISOString(),
      ...(tapgo ? { tapgo } : {}),
    };
    if (!tapgo) delete lien.tapgo;
    return { ...a, lienDeReglement: lien };
  }));
  return jeton;
}

/** Le message est parti : le Trône le montre dans « Le règlement en direct ». */
export function noteLEnvoiDuLien(apptId: string): void {
  appointmentsStore.set((prev) => prev.map((a) => (a.id === apptId && a.lienDeReglement
    ? { ...a, lienDeReglement: { ...a.lienDeReglement, envoyeLe: new Date().toISOString() } }
    : a)));
}
