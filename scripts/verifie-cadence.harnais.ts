/* LA CADENCE D'UNE TÊTE — quand la Maison l'attend, et quand elle ne peut PAS
   l'attendre. Lancé par `node scripts/verifie-cadence.mjs`.

   Deux règles posées le 16 août, sur deux anomalies vues par Yéman :
     ① une estimation ne reste jamais dans le passé — le cycle se rejoue ;
     ② aucune estimation un lundi ni un dimanche — la Maison est fermée. */
import { predictNextVisit } from '../src/shared/cadence';
import { settingsStore } from '../src/shared/settings';
import type { Appointment } from '../src/shared/agenda';
import type { Client } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Les heures de la Maison : fermée lundi et dimanche. */
settingsStore.set((s) => ({
  ...s,
  hours: [
    { key: 'lun', open: '08h00', close: '20h30', closed: true },
    { key: 'mar', open: '08h00', close: '20h30', closed: false },
    { key: 'mer', open: '08h00', close: '20h30', closed: false },
    { key: 'jeu', open: '08h00', close: '20h30', closed: false },
    { key: 'ven', open: '08h00', close: '20h30', closed: false },
    { key: 'sam', open: '09h00', close: '20h00', closed: false },
    { key: 'dim', open: '09h00', close: '20h00', closed: true },
  ],
} as never));

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourDe = (iso: string) => JOURS[new Date(`${iso}T12:00:00`).getDay()];

const rdv = (date: string, i = 0): Appointment => ({
  id: `a${date}-${i}`, branchId: 'br', clientId: 'c1', serviceIds: ['sv'],
  date, time: '10:00', master: 'Brice', status: 'honoré',
} as Appointment);
const cliente: Client = { id: 'c1', name: 'Prisca', branchId: 'br' } as Client;

/* ── ① LE CYCLE SE REJOUE ───────────────────────────────────────── */
/* Deux venues à 28 jours d'écart, la dernière il y a des mois : l'échéance
   est largement passée, la proposition doit regarder devant. */
const vieilles = [rdv('2026-04-01'), rdv('2026-04-29')];
const c1 = predictNextVisit(vieilles, [cliente], 'c1', '2026-08-16');
dit('la cadence lue est de 28 j', 28, c1.avgDays);
dit('l’estimation ne reste pas dans le passé', true, (c1.iso ?? '') >= '2026-08-16');
/* L'échéance manquée était le 27 mai (29 avril + 28 j) : 81 jours de retard au
   16 août. La proposition regarde devant, le retard regarde derrière — les
   deux comptent, et la fiche les dit tous les deux. */
dit('… et le retard se compte depuis l’échéance manquée', 81, c1.overdueDays);

/* ── ② JAMAIS UN LUNDI NI UN DIMANCHE ───────────────────────────── */
/* Une dernière venue un lundi, cadence 7 j : sans garde, tout tomberait un
   lundi. Vingt cadences éprouvées, du pas de 7 au pas de 30. */
let fermes = 0;
let passees = 0;
for (let pas = 7; pas <= 30; pas += 1) {
  for (let depart = 1; depart <= 28; depart += 1) {
    const d1 = `2026-06-${String(depart).padStart(2, '0')}`;
    const d2 = new Date(`${d1}T12:00:00`);
    d2.setDate(d2.getDate() + pas);
    const iso2 = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
    const c = predictNextVisit([rdv(d1), rdv(iso2, 1)], [cliente], 'c1', '2026-08-16');
    if (!c.iso) continue;
    const j = new Date(`${c.iso}T12:00:00`).getDay();
    if (j === 0 || j === 1) { fermes += 1; if (fermes <= 3) console.log(`       ⚠ ${c.iso} tombe un ${jourDe(c.iso)}`); }
    if (c.iso < '2026-08-16') { passees += 1; if (passees <= 3) console.log(`       ⚠ ${c.iso} est déjà passée`); }
  }
}
dit('672 cadences éprouvées : aucune un lundi ni un dimanche', 0, fermes);
dit('… et aucune dans le passé', 0, passees);

/* ── UN VRAI RDV À VENIR N'EST PAS UNE PRÉDICTION ────────────────── */
/* Il s'affiche tel quel, même un jour fermé : c'est un FAIT posé par la
   Maison, pas une proposition du moteur. */
const pris = { ...rdv('2026-08-24'), status: 'confirmé' } as Appointment;
const c3 = predictNextVisit([rdv('2026-04-01'), pris], [cliente], 'c1', '2026-08-16');
dit('un rendez-vous déjà pris passe devant', '2026-08-24', c3.iso);
dit('… et il n’est pas annoncé comme estimé', false, c3.predicted);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
