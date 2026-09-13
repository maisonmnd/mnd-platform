/* AUCUN MESSAGE POUR UN RENDEZ-VOUS POSÉ APRÈS SON HEURE, ÉPROUVÉ —
   `node scripts/verifie-envois.mjs`.

   « Chaque fois que je pose un rendez-vous dans le passé, n'envoie aucun
   WhatsApp, aucun rappel, rien à la cliente par l'API » (Yéman).

   Le juge vit dans `shared/agenda.ts` et il est recopié à l'identique dans
   les fonctions confirmation-rdv et avis-google. Une confirmation envoyée à
   une cliente déjà repartie, ou une réservation réelle privée de son rappel :
   les deux fautes se lisent ici. */
import { momentDuRdv, poseApresSonHeure } from '../src/shared/agenda';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── L'INSTANT, À L'HEURE DU SALON ───────────────────────────────── */
dit('10 h à Cotonou, c’est 9 h UTC', '2026-09-13T09:00:00.000Z', new Date(momentDuRdv({ date: '2026-09-13', time: '10:00' })).toISOString());
dit('une heure à un chiffre se lit aussi', '2026-09-13T08:30:00.000Z', new Date(momentDuRdv({ date: '2026-09-13', time: '9:30' })).toISOString());
dit('sans heure, la fin du jour', '2026-09-13T22:59:00.000Z', new Date(momentDuRdv({ date: '2026-09-13', time: '' })).toISOString());

/* ── POSÉ APRÈS SON HEURE ────────────────────────────────────────── */
const rdv = { date: '2026-09-13', time: '10:00' };
dit('posé à 16 h pour 10 h le même jour : aucun message', true,
  poseApresSonHeure({ ...rdv, creeLe: '2026-09-13T15:00:00.000Z' }));
dit('posé à 9 h pour 10 h : une vraie réservation', false,
  poseApresSonHeure({ ...rdv, creeLe: '2026-09-13T08:00:00.000Z' }));
dit('posé aujourd’hui pour hier : aucun message', true,
  poseApresSonHeure({ date: '2026-09-12', time: '14:00', creeLe: '2026-09-13T08:00:00.000Z' }));
dit('posé à l’heure pile : déjà passé, aucun message', true,
  poseApresSonHeure({ ...rdv, creeLe: '2026-09-13T09:00:00.000Z' }));
dit('l’heure signée par la base l’emporte sur l’horloge de l’appareil', true,
  poseApresSonHeure({ ...rdv, creeLe: '2026-09-13T08:00:00.000Z' }, '2026-09-13T10:30:00+00:00'));
dit('… et dans l’autre sens aussi', false,
  poseApresSonHeure({ ...rdv, creeLe: '2026-09-13T15:00:00.000Z' }, '2026-09-13T08:15:00+00:00'));
dit('sans aucune date de pose, on ne présume rien', false, poseApresSonHeure({ ...rdv }));
dit('une date de pose illisible ne présume rien non plus', false, poseApresSonHeure({ ...rdv, creeLe: 'hier' }));
dit('posé dans le passé puis déplacé à la semaine prochaine : ses messages reviennent', false,
  poseApresSonHeure({ date: '2026-09-20', time: '10:00', creeLe: '2026-09-13T15:00:00.000Z' }));

if (ko) {
  console.log(`\n${ko} échec(s).`);
  process.exit(1);
}
console.log('\nAucun message ne part pour un rendez-vous posé après son heure.');
