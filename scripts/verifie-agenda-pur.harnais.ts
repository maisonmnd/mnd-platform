/* LE CALENDRIER PUR, ÉPROUVÉ — `node scripts/verifie-agenda-pur.mjs`.

   Le Trône, Ma Couronne et le site public lisent le même calcul. S'il se
   trompe, le site propose une heure déjà prise, ou ferme un jour ouvert. */
import {
  ouvertureDuJour, plagesBloquees, creneauxLibres, dureeDesPrestations,
  occupesDuJour, hourToMin, minutesDeHhmm, hhmmDeMinutes,
} from '../src/shared/agenda-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Une semaine ordinaire : ouverte du lundi au samedi, fermée le dimanche. */
const SEMAINE = [
  { key: 'dim', open: '09h00', close: '19h00', closed: true },
  { key: 'lun', open: '09h00', close: '19h00', closed: false },
  { key: 'mar', open: '09h00', close: '19h00', closed: false },
  { key: 'mer', open: '09h00', close: '19h00', closed: false },
  { key: 'jeu', open: '09h00', close: '19h00', closed: false },
  { key: 'ven', open: '09h00', close: '19h00', closed: false },
  { key: 'sam', open: '09h00', close: '19h00', closed: false },
];
const MERCREDI = '2026-09-16';
const DIMANCHE = '2026-09-20';
const OUVERT = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 };

/* ── Les heures ─────────────────────────────────────────────────── */
dit('① la graphie de la Maison se lit', [540, 570, 540], [hourToMin('09h00'), hourToMin('09h30'), hourToMin('9h')]);
dit('② une graphie illisible retombe sur neuf heures', 540, hourToMin('n’importe quoi'));
dit('③ l’heure d’un rendez-vous fait l’aller et le retour', ['09:30', 570], [hhmmDeMinutes(570), minutesDeHhmm('09:30')]);

/* ── L'ouverture ────────────────────────────────────────────────── */
dit('④ un mercredi ouvre', OUVERT, ouvertureDuJour(MERCREDI, SEMAINE));
dit('⑤ un dimanche reste fermé', { closed: true, openMin: 0, closeMin: 0 }, ouvertureDuJour(DIMANCHE, SEMAINE));
dit('⑥ une semaine inconnue ferme, elle n’ouvre pas', true, ouvertureDuJour(MERCREDI, []).closed);
dit('⑦ une fermeture exceptionnelle ferme la réservation', true,
  ouvertureDuJour(MERCREDI, SEMAINE, [{ date: MERCREDI, closed: true }]).closed);
dit('⑧ une journée raccourcie est respectée', { closed: false, openMin: 10 * 60, closeMin: 15 * 60 },
  ouvertureDuJour(MERCREDI, SEMAINE, [{ date: MERCREDI, open: '10h00', close: '15h00' }]));
dit('⑨ l’exception d’UNE personne ne ferme pas la Maison', false,
  ouvertureDuJour(MERCREDI, SEMAINE, [{ date: MERCREDI, closed: true, staffId: 'p1' }]).closed);

/* ── Les murs ───────────────────────────────────────────────────── */
const MURS = [
  { branchId: 'b', date: MERCREDI, master: 'Brice', debut: '12h00', fin: '14h00' },
  { branchId: 'b', date: MERCREDI, debut: '17h00', fin: '18h00' },
  { branchId: 'autre', date: MERCREDI, debut: '09h00', fin: '19h00' },
];
dit('⑩ le mur d’un maître et celui de la Maison valent pour lui', [[720, 840], [1020, 1080]],
  plagesBloquees(MURS, 'b', MERCREDI, 'Brice'));
dit('⑪ une autre branche ne bloque rien ici', [[1020, 1080]], plagesBloquees(MURS, 'b', MERCREDI, 'Yéman'));
dit('⑫ un blocage sans bornes couvre la journée', [[0, 1440]],
  plagesBloquees([{ branchId: 'b', date: MERCREDI }], 'b', MERCREDI, 'Brice'));

/* ── Les créneaux ───────────────────────────────────────────────── */
const libres = (o: Partial<Parameters<typeof creneauxLibres>[0]> = {}) => creneauxLibres({
  opening: OUVERT, durationMin: 60, occupes: [], master: 'Brice', ...o,
});
dit('⑬ une journée vide s’ouvre d’heure en heure', ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'], libres());
dit('⑭ un jour fermé ne propose rien', [], libres({ opening: { closed: true, openMin: 0, closeMin: 0 } }));
dit('⑮ un rendez-vous pris retire son heure', true,
  !libres({ occupes: [{ maitre: 'Brice', debutMin: 600, dureeMin: 60 }] }).includes('10:00'));
dit('⑯ le rendez-vous d’un autre maître ne gêne pas', true,
  libres({ occupes: [{ maitre: 'Yéman', debutMin: 600, dureeMin: 60 }] }).includes('10:00'));
dit('⑰ un long rituel mange les heures suivantes', false,
  libres({ occupes: [{ maitre: 'Brice', debutMin: 600, dureeMin: 180 }] }).some((h) => ['10:00', '11:00', '12:00'].includes(h)));
dit('⑱ un mur se contourne comme un rendez-vous', false, libres({ bloques: [[720, 840]] }).includes('12:00'));
dit('⑲ une durée qui déborde la fermeture ne se propose pas', ['09:00', '10:00'], libres({ durationMin: 240, opening: { closed: false, openMin: 540, closeMin: 840 } }));
dit('⑳ le plafond de la Maison ferme le jour', [], libres({ capMaison: 2, occupes: [
  { maitre: 'Yéman', debutMin: 540, dureeMin: 60 }, { maitre: 'Zoé', debutMin: 600, dureeMin: 60 },
] }));
dit('㉑ le plafond d’un maître ne ferme que le sien', [], libres({ capMaitre: 1, occupes: [{ maitre: 'Brice', debutMin: 540, dureeMin: 60 }] }));
dit('㉒ aujourd’hui, les heures passées ne se proposent plus', ['16:00', '17:00', '18:00'], libres({ maintenantMin: 15 * 60 + 10 }));

/* ── Les durées ─────────────────────────────────────────────────── */
const CATALOGUE = [{ id: 'a', durationMin: 45 }, { id: 'b', durationMin: 90 }];
dit('㉓ une prestation courte vaut quand même une heure', 60, dureeDesPrestations(['a'], CATALOGUE));
dit('㉔ deux prestations s’additionnent', 135, dureeDesPrestations(['a', 'b'], CATALOGUE));
dit('㉕ une prestation inconnue vaut une heure', 105, dureeDesPrestations(['a', 'inconnue'], CATALOGUE));

/* ── La forme du mur, telle que le serveur la rend ──────────────── */
dit('㉖ les créneaux occupés se mettent en forme, les heures vides écartées',
  [{ maitre: 'Brice', debutMin: 600, dureeMin: 60 }],
  occupesDuJour([
    { jour: MERCREDI, maitre: 'Brice', debut: '10:00', duree: 60 },
    { jour: MERCREDI, maitre: 'Zoé', debut: '', duree: 60 },
    { jour: '2026-09-17', maitre: 'Brice', debut: '11:00', duree: 60 },
  ], MERCREDI));

if (ko) { console.error(`\n${ko} vérification(s) en échec.`); process.exit(1); }
console.log('\nLe calendrier tient.');
