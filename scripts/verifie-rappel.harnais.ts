/* LE RAPPEL ENVOYÉ À LA CLIENTE, ÉPROUVÉ — `node scripts/verifie-rappel.mjs`.

   C'est le SEUL texte de la Maison qu'une cliente lit sur son téléphone. Il
   s'écrivait dans un fichier d'écran, et personne ne le relisait : une virgule
   de trop s'y serait installée pour des mois. On le juge ici mot pour mot,
   blancs compris — sur WhatsApp, le blanc est la seule mise en forme qui
   survive à tous les téléphones. */
import {
  deLaMaison, heureLisible, jourLisible, momentCourt, quandDuRappel, texteDuRappel, texteDeLaRelance,
} from '../src/shared/rappel';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① L'HEURE TELLE QU'ON LA DIT ──────────────────────────────────
   « 08:30 » est un horaire de train : on l'écrit pour une machine. La cliente
   lit « huit heures trente » de toute façon. */
dit('huit heures trente', '8 h 30', heureLisible('08:30'));
dit('l’heure ronde ne traîne pas ses zéros', '14 h', heureLisible('14:00'));
/* LES MINUTES GARDENT LEUR ZÉRO : « 9 h 5 » ne se lit pas. */
dit('neuf heures cinq', '9 h 05', heureLisible('09:05'));
/* UNE HEURE ABSENTE N'EST PAS MINUIT : `Number('')` vaut zéro, et « 0 h »
   annoncé à une cliente est pire qu'un champ vide, parce qu'elle y croit. */
dit('une heure absente ne devient pas minuit', '', heureLisible(''));
dit('… ni une heure mal formée', '8h30', heureLisible('8h30'));

/* ── ② LE JOUR DEVANT LA DATE ──────────────────────────────────────
   « J'ai besoin qu'on rajoute le jour devant la date » (Yéman). C'est par le
   jour de la semaine qu'on juge si le créneau tient : « le 11 » ne dit rien
   tant qu'on n'a pas ouvert un calendrier, « vendredi 11 » se répond tout de
   suite. */
dit('le jour ouvre la date', 'vendredi 11 septembre', jourLisible('2026-09-11', '2026-09-07'));
dit('… et le premier du mois ne prend pas de zéro', 'jeudi 1 octobre',
  jourLisible('2026-10-01', '2026-09-07'));
/* L'ANNÉE N'APPARAÎT QUE QUAND ELLE CHANGE QUELQUE CHOSE : une cadence posée
   court sur deux ans, et « lundi 4 janvier » nu se lirait comme celui-ci. La
   porter toujours alourdirait le rappel de la semaine prochaine pour rien. */
dit('l’année vient quand elle change quelque chose', 'lundi 4 janvier 2027',
  jourLisible('2027-01-04', '2026-09-07'));
dit('… et se tait la même année', 'vendredi 11 septembre',
  jourLisible('2026-09-11', '2026-01-30'));

/* ── ③ LE MOMENT DANS LA PHRASE ────────────────────────────────────
   « prévu pour le vendredi 11 septembre » se dit ; « prévu pour aujourd'hui »
   ne se dit pas. La préposition appartient donc au moment. */
const jours = { aujourdhuiIso: '2026-09-07', demainIso: '2026-09-08' };
dit('aujourd’hui se dit sans préposition', 'aujourd’hui à 8 h 30',
  quandDuRappel({ ...jours, jourIso: '2026-09-07', heure: '08:30' }));
dit('demain aussi', 'demain à 14 h',
  quandDuRappel({ ...jours, jourIso: '2026-09-08', heure: '14:00' }));
dit('une date prend la sienne', 'pour le vendredi 11 septembre à 8 h 30',
  quandDuRappel({ ...jours, jourIso: '2026-09-11', heure: '08:30' }));
/* LES BULLES DE L'ÉCRAN LISENT LE MÊME MOMENT, sans la préposition : il s'y
   place après « RDV » et non après « prévu ». Deux calculs auraient fini par
   afficher deux heures différentes pour le même rendez-vous. */
dit('l’écran lit le même moment, sans préposition', 'vendredi 11 septembre à 8 h 30',
  momentCourt({ ...jours, jourIso: '2026-09-11', heure: '08:30' }));

/* ── ④ LE TEXTE ENTIER ─────────────────────────────────────────────
   « Mieux structuré et plus aéré » (Yéman) : trois blocs séparés par du blanc,
   puis la demande, puis la signature. */
const msg = texteDuRappel({
  ...jours, jourIso: '2026-09-11', heure: '08:30',
  prenom: 'Jocelyne', maison: 'Maison MND',
  rituels: ['KLƆKLƆ™ Essentiel · Le Shampoing', 'SÍNSIN™ Essentielle · La Reprise', 'Styling'],
});
const blocs = msg.split('\n\n');

dit('cinq blocs, séparés par du blanc', 5, blocs.length);
dit('on salue en premier', 'Bonjour Jocelyne,', blocs[0]);
dit('le rendez-vous ensuite, avec son jour',
  'Petit rappel de la Maison MND : votre rendez-vous est prévu pour le vendredi 11 septembre à 8 h 30.',
  blocs[1]);
/* UN RITUEL PAR LIGNE. Entre parenthèses au milieu de la phrase, trois noms à
   marque déposée poussaient l'heure hors de l'écran sur un téléphone : ce qui
   compte le plus se lisait en dernier. */
dit('un rituel par ligne', 3, blocs[2].split('\n').length);
dit('… et rien n’est perdu en route', true, blocs[2].includes('SÍNSIN™ Essentielle · La Reprise'));
dit('la demande vient après le blanc',
  'Merci de nous prévenir en cas d’empêchement. À très vite.', blocs[3]);
dit('la Maison signe en dernier', true, blocs[4].includes('la maison veille'));
/* JAMAIS DEUX LIGNES VIDES DE SUITE : un trou double se lit comme un message
   coupé, et sur WhatsApp on croit que la fin manque. */
dit('aucun trou double', false, /\n{3,}/.test(msg));
dit('aucune ligne ne traîne d’espace', false, /[ \t]+\n/.test(msg));

/* SANS RITUEL, PAS DE BLOC VIDE. Un rendez-vous sans prestation posée existe —
   une reprise à constater, un rattrapage. Le bloc absent vaut mieux qu'un
   blanc qui fait chercher ce qui manque. */
const nu = texteDuRappel({
  ...jours, jourIso: '2026-09-11', heure: '08:30',
  prenom: 'Jocelyne', maison: 'Maison MND', rituels: [],
});
dit('sans rituel, quatre blocs', 4, nu.split('\n\n').length);
dit('… et toujours aucun trou double', false, /\n{3,}/.test(nu));

/* ── ⑤ LE NOM VIENT DES PARAMÈTRES ─────────────────────────────────
   Il s'écrivait en dur dans le message alors que la Maison s'appelle
   « L'atelier MND » et signe ainsi trois lignes plus bas : la cliente lisait
   deux noms dans le même message.

   L'ARTICLE EST LE PIÈGE : « de la L'atelier MND » aurait été pire que le nom
   figé. Un nom qui porte déjà son article n'en reçoit pas un second. */
dit('un nom nu reçoit son article', 'la Maison MND', deLaMaison('Maison MND'));
dit('un nom qui porte le sien n’en prend pas deux', 'L’atelier MND', deLaMaison('L’atelier MND'));
dit('… l’apostrophe droite aussi', "L'atelier MND", deLaMaison("L'atelier MND"));
dit('… et l’article détaché', 'Le Trône', deLaMaison('Le Trône'));
dit('un nom effacé ne signe pas en blanc', 'la Maison', deLaMaison('   '));

const chezElle = texteDuRappel({
  ...jours, jourIso: '2026-09-11', heure: '08:30',
  prenom: 'A', maison: 'L’atelier MND', rituels: [],
});
dit('le message porte le nom des Paramètres', true,
  chezElle.includes('Petit rappel de L’atelier MND :'));

/* ── LA RELANCE D'UNE REPRISE, J-3 (9 septembre) ───────────────────
   Le rendez-vous a été posé par la cadence, pas choisi de vive voix : on
   VÉRIFIE que le créneau tient, on ne « rappelle » pas — et l'on propose de
   déplacer plutôt que de faire subir. */
const relance = texteDeLaRelance({
  prenom: 'Ruth', jourIso: '2026-09-12', heure: '09:00',
  aujourdhuiIso: '2026-09-09', maison: 'L’atelier MND',
});
dit('la relance demande, elle n’impose pas', true,
  relance.includes('Dites-nous si le créneau vous convient toujours'));
dit('… dit le rythme habituel et le moment en clair', true,
  relance.includes('selon votre rythme habituel') && relance.includes('samedi 12 septembre à 9 h'));
dit('… et parle du bon nom, sans double article', true,
  relance.includes('Petit mot de L’atelier MND'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
