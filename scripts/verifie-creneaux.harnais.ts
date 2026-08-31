/* LES CRÉNEAUX DE MA COURONNE, ÉPROUVÉS — 31 août 2026.

   « Pourquoi sur Ma Couronne le calendrier est libre la journée d'aujourd'hui
   lundi 31 août pourtant le salon est fermé. Ensuite le salon est libre à 13h
   et 16h pourtant il y a déjà 2 RDV à ces horaires » (Yéman).

   UNE ERREUR ICI NE PLANTE PAS, ELLE FAIT VENIR QUELQU'UN POUR RIEN. Une
   cliente traverse la ville pour une heure qu'un autre occupe, ou trouve porte
   close un jour de fermeture. Les deux se paient en confiance, pas en francs,
   et se découvrent devant la porte. */
import { creneauxLibres } from '../src/apps/couronne/lib';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const OUVERT = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 };
const FERME = { closed: true, openMin: 0, closeMin: 0 };
const rdv = (h: number, duree = 120, maitre = 'Team') =>
  ({ maitre, debutMin: h * 60, dureeMin: duree });

/* ── ① LE JOUR FERMÉ NE S'OUVRE PAS ─────────────────────────────────
   Le premier des trois murs. Un salon fermé ne propose rien, quoi qu'il
   arrive ensuite : ni plafond, ni agenda, ni heure. */
dit('un jour fermé ne rend aucun créneau', [],
  creneauxLibres({ opening: FERME, durationMin: 60, occupes: [], master: 'Team' }));
dit('… même vide de tout rendez-vous', 0,
  creneauxLibres({ opening: FERME, durationMin: 30, occupes: [], master: '' }).length);

/* ── ② L'HEURE PRISE NE SE REPROPOSE PAS ────────────────────────────
   « Le salon est libre à 13h et 16h pourtant il y a déjà 2 RDV. » Le cas
   exact, avec les deux rendez-vous de la capture. */
const journee = creneauxLibres({
  opening: OUVERT,
  durationMin: 60,
  occupes: [rdv(13), rdv(16)],
  master: 'Team',
});
dit('13 h n’est plus proposé', false, journee.includes('13:00'));
dit('16 h non plus', false, journee.includes('16:00'));
/* UN RENDEZ-VOUS DE DEUX HEURES EN MANGE DEUX : la durée compte, pas
   seulement l'heure de départ. Sans cela on proposerait 14 h à quelqu'un
   pendant que le fauteuil est encore occupé. */
dit('… ni 14 h, le fauteuil est encore pris', false, journee.includes('14:00'));
dit('mais 15 h est libre', true, journee.includes('15:00'));
dit('et 9 h aussi', true, journee.includes('09:00'));

/* LE CHEVAUCHEMENT SE JUGE DES DEUX CÔTÉS : une prestation de trois heures
   posée à 11 h mordrait sur le rendez-vous de 13 h. */
dit('une longue prestation ne mord pas sur le suivant', false,
  creneauxLibres({ opening: OUVERT, durationMin: 180, occupes: [rdv(13)], master: 'Team' }).includes('11:00'));
dit('… mais elle tient avant', true,
  creneauxLibres({ opening: OUVERT, durationMin: 180, occupes: [rdv(13)], master: 'Team' }).includes('09:00'));

/* ── ③ CHAQUE MAÎTRE A SON FAUTEUIL ─────────────────────────────────
   L'agenda de l'un ne ferme pas l'autre : deux têtes travaillent en même
   temps. C'est la raison d'être du champ `maitre` dans ce que rend le
   serveur. */
dit('le rendez-vous d’un autre maître ne bloque pas', true,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [rdv(13, 120, 'Expert')], master: 'Team' }).includes('13:00'));
dit('… et le sien, si', false,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [rdv(13, 120, 'Expert')], master: 'Expert' }).includes('13:00'));

/* ── ④ LES MURS POSÉS À LA MAIN ─────────────────────────────────────
   Une pause, une absence : ils occupent le calendrier exactement comme un
   rendez-vous, et ils ne portent aucun maître quand ils valent pour tous. */
dit('une pause de midi ferme ses heures', false,
  creneauxLibres({
    opening: OUVERT, durationMin: 60, occupes: [], master: 'Team',
    bloques: [[12 * 60, 14 * 60]],
  }).includes('12:00'));
dit('… et rouvre après', true,
  creneauxLibres({
    opening: OUVERT, durationMin: 60, occupes: [], master: 'Team',
    bloques: [[12 * 60, 14 * 60]],
  }).includes('14:00'));

/* ── ⑤ LE PLAFOND DU JOUR ───────────────────────────────────────────
   La maison choisit son souffle. Au-delà, plus aucun créneau, même si des
   heures restent : c'est un choix de rythme, pas un manque de place.

   LE PLAFOND DE LA MAISON COMPTE TOUS LES MAÎTRES, celui du maître ne compte
   que les siens. Les confondre fermerait le salon dès qu'une seule tête est
   pleine. */
dit('le plafond maison ferme la journée', [],
  creneauxLibres({
    opening: OUVERT, durationMin: 60, master: 'Team', capMaison: 2,
    occupes: [rdv(9, 60, 'Team'), rdv(10, 60, 'Expert')],
  }));
dit('le plafond d’un maître ne ferme que le sien', true,
  creneauxLibres({
    opening: OUVERT, durationMin: 60, master: 'Expert', capMaitre: 1,
    occupes: [rdv(9, 60, 'Team')],
  }).length > 0);
dit('… et se ferme quand c’est le sien', [],
  creneauxLibres({
    opening: OUVERT, durationMin: 60, master: 'Team', capMaitre: 1,
    occupes: [rdv(9, 60, 'Team')],
  }));
dit('zéro veut dire illimité', true,
  creneauxLibres({
    opening: OUVERT, durationMin: 60, master: 'Team', capMaison: 0, capMaitre: 0,
    occupes: [rdv(9), rdv(10), rdv(11)],
  }).length > 0);

/* ── ⑥ AUJOURD'HUI NE SE RÉSERVE PAS EN ARRIÈRE ─────────────────────
   Une heure déjà passée n'est pas un créneau. `maintenantMin` à `null` dit
   « ce n'est pas aujourd'hui » — un autre jour se propose en entier. */
dit('à 15 h 30, le matin ne se propose plus', false,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [], master: 'Team', maintenantMin: 15 * 60 + 30 }).includes('10:00'));
dit('… et 16 h non plus, l’heure est entamée', false,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [], master: 'Team', maintenantMin: 15 * 60 + 30 }).includes('15:00'));
dit('… mais 16 h s’ouvre', true,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [], master: 'Team', maintenantMin: 15 * 60 + 30 }).includes('16:00'));
dit('un autre jour se propose dès l’ouverture', true,
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [], master: 'Team', maintenantMin: null }).includes('09:00'));

/* ── ⑦ LA FENÊTRE D'OUVERTURE BORNE TOUT ────────────────────────────
   Le dernier créneau doit TENIR ENTIER avant la fermeture. Proposer 18 h pour
   deux heures quand on ferme à 19 h ferait sortir la cliente au milieu de son
   soin, ou tenir le salon ouvert une heure de plus sans l'avoir décidé. */
dit('le dernier créneau tient entier', false,
  creneauxLibres({ opening: OUVERT, durationMin: 120, occupes: [], master: 'Team' }).includes('18:00'));
dit('… le précédent, oui', true,
  creneauxLibres({ opening: OUVERT, durationMin: 120, occupes: [], master: 'Team' }).includes('17:00'));
dit('une prestation plus longue que la journée ne rend rien', [],
  creneauxLibres({ opening: OUVERT, durationMin: 12 * 60, occupes: [], master: 'Team' }));

/* LES HEURES S'ÉCRIVENT SUR DEUX CHIFFRES, toujours : « 9:00 » se trierait
   après « 10:00 » et se lirait mal dans une liste. */
dit('les heures gardent leurs deux chiffres', '09:00',
  creneauxLibres({ opening: OUVERT, durationMin: 60, occupes: [], master: 'Team' })[0]);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
