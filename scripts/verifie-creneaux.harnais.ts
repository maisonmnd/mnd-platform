/* LES CRÉNEAUX DE MA COURONNE, ÉPROUVÉS — 31 août 2026.

   « Pourquoi sur Ma Couronne le calendrier est libre la journée d'aujourd'hui
   lundi 31 août pourtant le salon est fermé. Ensuite le salon est libre à 13h
   et 16h pourtant il y a déjà 2 RDV à ces horaires » (Yéman).

   UNE ERREUR ICI NE PLANTE PAS, ELLE FAIT VENIR QUELQU'UN POUR RIEN. Une
   cliente traverse la ville pour une heure qu'un autre occupe, ou trouve porte
   close un jour de fermeture. Les deux se paient en confiance, pas en francs,
   et se découvrent devant la porte. */
import { creneauxLibres } from '../src/apps/couronne/lib';
import { maitreParDefaut } from '../src/shared/branches';
import { placeLeFoyer, maitresLibres, chevauche, estampilleLaPose, estampilleLesPoses, noteDeLaMaison, type Appointment } from '../src/shared/agenda';
import { joursFermesParmi, prochainJourOuvert, settingsStore } from '../src/shared/settings';
import { quandDemandee, horodatageLisible, porteDuRendezVous } from '../src/shared/temps';

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

/* ── ⑧ LE MAÎTRE QUI SE PROPOSE D'ABORD ─────────────────────────────
   « Quand un client prend RDV au Trône, afficher automatiquement le calendrier
   de Team. Pas celui d'Expert » (Yéman, 1er septembre 2026).

   LA MODALE PRENAIT LE PREMIER DE LA LISTE, et cet ordre n'est qu'un accident
   de saisie : celui qu'on a écrit en premier le jour de la création de la
   branche. Le changer aurait demandé de détruire et recréer un maître, donc de
   détacher ses rendez-vous. */
dit('sans choix, le premier de la liste', 'Expert',
  maitreParDefaut({ masters: ['Expert', 'Team'] }));
dit('le maître désigné passe devant', 'Team',
  maitreParDefaut({ masters: ['Expert', 'Team'], masterParDefaut: 'Team' }));

/* UN MAÎTRE RETIRÉ OU RENOMMÉ NE LAISSE PAS UN NOM FANTÔME : sans cette
   vérification, la modale s'ouvrirait sur quelqu'un qui n'est plus au tableau,
   et le rendez-vous partirait sans fauteuil. */
dit('un maître disparu retombe sur le premier', 'Expert',
  maitreParDefaut({ masters: ['Expert', 'Team'], masterParDefaut: 'Séraphin' }));
dit('un choix vide aussi', 'Expert',
  maitreParDefaut({ masters: ['Expert', 'Team'], masterParDefaut: '   ' }));
/* UNE BRANCHE SANS AUCUN MAÎTRE NE PLANTE PAS : elle rend le vide, et la
   modale laisse choisir. */
dit('aucun maître, aucune proposition', '', maitreParDefaut({ masters: [] }));

/* ── ASSEOIR UN FOYER — 2 septembre 2026 ───────────────────────────
   « Comment je peux prendre des RDV dans un foyer pour 2 personnes au
   minimum ? » (Yéman). Trois fois le même formulaire, et rien ensuite ne
   disait que ces trois rendez-vous n'en faisaient qu'un. */

/* LES BORNES SONT OUVERTES : finir à 14:00 et commencer à 14:00 ne se
   chevauche pas, c'est le fauteuil qui se libère. Fermer la borne ferait
   refuser un créneau parfaitement valide, toute la journée. */
dit('l’un finit quand l’autre commence : libre', false, chevauche('14:00', 60, '15:00', 60));
dit('une demi-heure de trop et c’est pris', true, chevauche('14:00', 90, '15:00', 60));
dit('le chevauchement se lit dans les deux sens', true, chevauche('15:00', 60, '14:00', 90));

const rdvDe = (master: string, time: string, dureeMin: number, status: Appointment['status'] = 'confirmé') =>
  ({ id: `a-${master}-${time}`, branchId: 'b1', clientId: 'c', serviceIds: [], date: '2026-09-10',
     time, master, status, dureeMin } as unknown as Appointment);

const MAITRES = ['Team', 'Expert'];
/* UN RENDEZ-VOUS ANNULÉ NE TIENT PLUS LE FAUTEUIL : le compter ferait refuser
   « ensemble » pour une place qui est libre. */
dit('un rituel annulé ne tient pas le fauteuil', 2, maitresLibres({ appts: [rdvDe('Team', '14:00', 60, 'annulé')], branchId: 'b1',
  dateIso: '2026-09-10', heure: '14:00', dureeMin: 60, maitres: MAITRES }).length);
dit('le maître occupé sort de la liste', 'Expert', maitresLibres({ appts: [rdvDe('Team', '14:00', 60)], branchId: 'b1',
  dateIso: '2026-09-10', heure: '14:00', dureeMin: 60, maitres: MAITRES }).join());
/* CE QU'ON EST EN TRAIN DE POSER TIENT DÉJÀ : sans cela, les deux têtes du
   foyer se retrouveraient chez le même maître à la même heure. */
dit('ce qu’on vient de poser tient le fauteuil', 'Expert', maitresLibres({ appts: [], branchId: 'b1', dateIso: '2026-09-10', heure: '14:00',
  dureeMin: 60, maitres: MAITRES,
  dejaPoses: [{ master: 'Team', time: '14:00', dureeMin: 60 }] }).join());
/* UN AUTRE JOUR NE COMPTE PAS. */
dit('la veille ne prend pas le fauteuil du lendemain', 2, maitresLibres({ appts: [{ ...rdvDe('Team', '14:00', 60), date: '2026-09-11' }], branchId: 'b1',
  dateIso: '2026-09-10', heure: '14:00', dureeMin: 60, maitres: MAITRES }).length);

const mere = { clientId: 'mere', dureeMin: 90 };
const fille = { clientId: 'fille', dureeMin: 60 };
const cadette = { clientId: 'cadette', dureeMin: 60 };

/* ENSEMBLE : chacune son maître, toutes à la même heure. */
const ens = placeLeFoyer({ tetes: [mere, fille], maitresLibres: MAITRES,
  maitreParDefaut: 'Team', heure: '14:00', ensemble: true });
dit('deux têtes, deux maîtres, une seule heure', 'mere@14:00/Team fille@14:00/Expert', ens.map((p) => `${p.clientId}@${p.time}/${p.master}`).join(' '));

/* À LA SUITE : la durée de la première décide de l'heure de la seconde. Une
   pose de 90 minutes ne laisse pas la fille à 15:00. */
const suite = placeLeFoyer({ tetes: [mere, fille], maitresLibres: ['Team'],
  maitreParDefaut: 'Team', heure: '14:00', ensemble: false });
dit('à la suite, la durée de la première décide de l’heure de la seconde', 'mere@14:00 fille@15:30', suite.map((p) => `${p.clientId}@${p.time}`).join(' '));

/* TROIS TÊTES ET DEUX MAÎTRES : la troisième passe à la suite plutôt que
   d'être refusée. Une famille qui s'est déplacée ne repart pas parce que la
   Maison n'a que deux fauteuils. */
const troisDeuxMaitres = placeLeFoyer({ tetes: [mere, fille, cadette], maitresLibres: MAITRES,
  maitreParDefaut: 'Team', heure: '14:00', ensemble: true });
dit('la troisième tête passe à la suite de la première', 'mere@14:00/Team fille@14:00/Expert cadette@15:30/Team', troisDeuxMaitres.map((p) => `${p.clientId}@${p.time}/${p.master}`).join(' '));

/* ON NE MET JAMAIS DEUX TÊTES CHEZ LE MÊME MAÎTRE À LA MÊME HEURE. La règle
   qui ne se négocie pas : elle promettrait un fauteuil qui n'existe pas, et la
   faute se découvre devant la famille. */
const paires = (l: { time: string; master: string }[]) => l.map((p) => `${p.master}@${p.time}`);
for (const cas of [ens, suite, troisDeuxMaitres]) {
  dit('aucune tête ne partage maître et heure', cas.length, new Set(paires(cas)).size);
}

/* « ENSEMBLE » SANS AUCUN MAÎTRE LIBRE retombe sur la suite : on ne promet pas
   un fauteuil qui n'existe pas. */
const sansMaitre = placeLeFoyer({ tetes: [mere, fille], maitresLibres: [],
  maitreParDefaut: 'Team', heure: '14:00', ensemble: true });
dit('sans maître libre, on passe à la suite', '14:00,15:30', sansMaitre.map((p) => p.time).join());
dit('aucune tête, rien à poser', 0, placeLeFoyer({ tetes: [], maitresLibres: MAITRES, maitreParDefaut: 'Team',
  heure: '14:00', ensemble: true }).length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);

/* ══ AUCUN JOUR FERMÉ NE PEUT ÊTRE SCELLÉ ══════════════════════════
   « Je ne sais pas comment il a pu prendre RDV le lundi 12 octobre puisque le
   salon est fermé » (Yéman, 5 septembre 2026).

   Le calendrier jugeait déjà, mais rien ne jugeait au MOMENT D'ÉCRIRE : entre
   les deux, des horaires pas encore descendus, une date pré-remplie, un retour
   en arrière du navigateur. Un écran qui propose bien et n'empêche rien finit
   toujours par laisser passer. */
settingsStore.set((prev) => ({
  ...prev,
  hours: prev.hours.map((h) => (h.key === 'lun' ? { ...h, closed: true } : h)),
}));

/* 2026-10-12 est un lundi, 2026-10-13 un mardi. */
dit('le lundi fermé est reconnu', ['2026-10-12'], joursFermesParmi(['2026-10-12']));
dit('le mardi passe', [], joursFermesParmi(['2026-10-13']));
dit('une suite de séances dit TOUS ses jours fermés',
  ['2026-10-12', '2026-10-19'], joursFermesParmi(['2026-10-12', '2026-10-13', '2026-10-19']));
/* Deux séances le même jour fermé ne font qu'un refus : on nomme un jour, pas
   une occurrence, sinon le message dirait deux fois la même chose. */
dit('… sans répéter le même jour', ['2026-10-12'], joursFermesParmi(['2026-10-12', '2026-10-12']));
dit('rien à juger sur une liste vide', [], joursFermesParmi([]));

/* LE PROCHAIN JOUR OUVERT — proposer une autre date en repartant du jour fermé
   ferait tomber la proposition une semaine plus tard sur le même mur. */
dit('le lundi fermé renvoie au mardi', '2026-10-13', prochainJourOuvert('2026-10-12'));
dit('un jour déjà ouvert ne bouge pas', '2026-10-13', prochainJourOuvert('2026-10-13'));

/* LA MAISON ENTIÈREMENT FERMÉE rend sa date de départ plutôt que de boucler :
   une porte qui ne s'ouvre jamais n'est pas un problème de calendrier. */
settingsStore.set((prev) => ({ ...prev, hours: prev.hours.map((h) => ({ ...h, closed: true })) }));
dit('une Maison toujours fermée rend la date demandée', '2026-10-12', prochainJourOuvert('2026-10-12'));

/* L'ÂGE D'UNE DEMANDE, éprouvé à horloge fixe. */
const midi = new Date('2026-09-05T12:00:00Z');
dit('une demande de l’instant', 'à l’instant', quandDemandee('2026-09-05T11:59:30Z', midi));
dit('… d’il y a vingt minutes', 'il y a 20 min', quandDemandee('2026-09-05T11:40:00Z', midi));
dit('… d’il y a trois heures', 'il y a 3 h', quandDemandee('2026-09-05T09:00:00Z', midi));
dit('… d’hier', 'hier', quandDemandee('2026-09-04T10:00:00Z', midi));
dit('… de six jours, celle qu’on a oubliée', 'il y a 6 jours', quandDemandee('2026-08-30T10:00:00Z', midi));
dit('une date illisible ne dit rien', '', quandDemandee('pas une date', midi));

/* ══ PAR QUELLE PORTE, ET QUAND ════════════════════════════════════
   « Je ne comprends toujours pas quand est-ce que les RDV ont été pris, à
   quelle heure, sur Le Trône ou sur Ma Couronne par le client lui-même ? »
   (Yéman, 5 septembre 2026).

   LA QUESTION EST CELLE DE LA RESPONSABILITÉ : une demande que la cliente a
   posée seule s'accueille, une date que la Maison a posée elle-même s'assume.
   « Posée au comptoir » disait l'un et l'autre à la fois. */
dit('la cliente a réservé elle-même', 'Réservée par la cliente · Ma Couronne', porteDuRendezVous('couronne'));
dit('la Maison a posé la date', 'Posée par la Maison · Le Trône', porteDuRendezVous('trone'));
dit('une consultation l’a fait naître', 'Née d’une consultation', porteDuRendezVous('consultation'));
/* L'HISTORIQUE NE PORTE PAS DE SOURCE : il vient du Trône, c'est le seul
   chemin qui existait. Le dire « inconnu » sèmerait un doute sans objet. */
dit('sans source, c’est le Trône', 'Posée par la Maison · Le Trône', porteDuRendezVous(undefined));

/* L'HEURE EXACTE PROUVE, L'ÂGE JUGE : les deux se lisent ensemble. L'entrée est
   en heure LOCALE (sans Z) pour que le juge ne dépende pas du fuseau. */
dit('l’instant d’une pose se lit', '3 sept. à 09:12', horodatageLisible('2026-09-03T09:12:00'));
dit('… minuit passé se lit aussi', '3 sept. à 00:05', horodatageLisible('2026-09-03T00:05:00'));
dit('une date illisible ne dit rien', '', horodatageLisible('pas une date'));

/* L'ESTAMPILLE NE S'ÉCRASE JAMAIS. Une reprogrammation modifie un rendez-vous
   existant : réécrire son heure de pose effacerait le seul témoin de sa
   naissance, et le comptoir croirait la demande toute fraîche. */
const posé = estampilleLaPose({ id: 'a1', date: '2026-10-13', time: '09:00' } as unknown as Appointment);
dit('une pose neuve reçoit son heure', true, typeof posé.creeLe === 'string' && posé.creeLe.length > 0);
const vieux = estampilleLaPose({ id: 'a2', creeLe: '2026-01-01T08:00:00.000Z' } as unknown as Appointment);
dit('… une pose déjà datée garde la sienne', '2026-01-01T08:00:00.000Z', vieux.creeLe);
dit('une fournée se date d’un coup', 2,
  estampilleLesPoses([{ id: 'b1' }, { id: 'b2' }] as unknown as Appointment[]).filter((x) => !!x.creeLe).length);

/* ══ CE QUE LA MAISON A ÉCRIT DANS UNE NOTE ════════════════════════
   « Quand je prends RDV et je mets une note, est-ce que cela peut apparaître
   quelque part sur la fiche du client aussi ? » (Yéman, 5 septembre 2026).

   Une note mêle deux écritures : l'observation de la Maison, qui vaut pour la
   TÊTE, et la comptabilité des automatismes, qui dit seulement pourquoi le
   rendez-vous existe. La fiche met en avant la première. */
dit('une observation passe entière',
  'Comptage de locks ce jour: 445 locks', noteDeLaMaison('Comptage de locks ce jour: 445 locks'));
dit('une note d’automatisme ne dit rien de la tête', '', noteDeLaMaison('Cadence de l’abonnement · ABO-2026-001'));
dit('… la reprise non plus', '', noteDeLaMaison('Reprise posée à la clôture · toutes les 8 semaines'));
dit('… ni la reprogrammation', '', noteDeLaMaison('Reprogrammé depuis l’encaissement'));
dit('… ni le rang d’une séance', '', noteDeLaMaison('Séance 2/3'));

/* LE MÉLANGE EST LE CAS QUI COMPTE : perdre l'observation parce qu'un
   automatisme a écrit à côté serait la pire des issues. */
dit('l’observation survit au mélange',
  '445 locks comptés', noteDeLaMaison('Séance 2/3 · 445 locks comptés · Cadence de l’abonnement'));
dit('deux observations restent deux',
  'Cuir sensible · à revoir en octobre', noteDeLaMaison('Cuir sensible · Séance 1/2 · à revoir en octobre'));

/* ON ERRE DU CÔTÉ DE MONTRER : un fragment inconnu est tenu pour humain.
   Rater une observation coûte plus cher qu'afficher une ligne de trop. */
dit('un fragment inconnu passe', 'Elle a apporté son huile', noteDeLaMaison('Elle a apporté son huile'));
dit('rien à dire sur une note vide', '', noteDeLaMaison(''));
dit('… ni sur une note absente', '', noteDeLaMaison(undefined));
dit('… ni sur des séparateurs seuls', '', noteDeLaMaison(' ·  · '));
