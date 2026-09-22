/* LA PAGE CONTACT, ÉPROUVÉE — `node scripts/verifie-la-page-contact.mjs`.

   La page contact ne portait aucun horaire (21 septembre 2026). Elle les lit
   désormais à la source du calendrier de réservation, `mnd_settings`. Trois
   fautes seraient graves, et se lisent ici : fermer la Maison parce que la
   base n'a pas répondu, dire « ouvre demain » à neuf heures moins le quart,
   et ignorer une fermeture exceptionnelle le jour même. */
import { COMMUN } from '../src/apps/revelateur/contenu';
import { etatDeLaMaison, semaineDite } from '../src/apps/revelateur/heures';
import { numeroDit, numeroNu } from '../src/apps/revelateur/numero';
import type { ExceptionDHoraire, HeureDeLaSemaine } from '../src/shared/agenda-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const jour = (key: string, open: string, close: string): HeureDeLaSemaine =>
  ({ key, open, close, closed: false });

/* La semaine de la Maison : ouverte du lundi au samedi, fermée le dimanche. */
const SEMAINE: HeureDeLaSemaine[] = [
  jour('lun', '09h00', '18h00'),
  jour('mar', '09h00', '18h00'),
  jour('mer', '09h00', '18h00'),
  jour('jeu', '09h00', '18h00'),
  jour('ven', '09h00', '18h00'),
  jour('sam', '08h30', '19h00'),
  { key: 'dim', open: '', close: '', closed: true },
];
const RIEN: ExceptionDHoraire[] = [];

/* Les dates sont réelles : le 21 septembre 2026 est un lundi, le 26 un
   samedi, le 27 un dimanche. */
const a = (iso: string, h: number, m = 0) => new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);

/* ── L'ÉTAT DU JOUR ────────────────────────────────────────────────── */
dit('lundi à 11 h, la Maison est ouverte', { ouvert: true, texte: 'Ouvert jusqu’à 18h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-21', 11)));

/* AVANT L'HEURE, LE JOUR MÊME : « ouvre demain » serait un mensonge. */
dit('lundi à 8 h, elle ouvre dans l’heure', { ouvert: false, texte: 'Fermé, ouvre à 09h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-21', 8)));

dit('lundi à 22 h, elle rouvre demain', { ouvert: false, texte: 'Fermé, ouvre demain à 09h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-21', 22)));

/* LE SAMEDI SOIR SAUTE LE DIMANCHE : le jour suivant est fermé, on nomme
   celui d'après au lieu de promettre une ouverture qui n'aura pas lieu. */
dit('samedi à 20 h, elle rouvre lundi', { ouvert: false, texte: 'Fermé, ouvre lundi à 09h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-26', 20)));

dit('dimanche, elle rouvre demain', { ouvert: false, texte: 'Fermé, ouvre demain à 09h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-27', 15)));

/* À LA MINUTE DE LA FERMETURE, on ne dit plus « ouvert ». */
dit('lundi à 18 h pile, c’est fermé', { ouvert: false, texte: 'Fermé, ouvre demain à 09h00' },
  etatDeLaMaison(SEMAINE, RIEN, a('2026-09-21', 18)));

/* UNE FERMETURE EXCEPTIONNELLE VAUT POUR LE JOUR MÊME. */
const FERIE: ExceptionDHoraire[] = [{ date: '2026-09-21', closed: true }];
dit('un lundi férié ne se dit pas ouvert', { ouvert: false, texte: 'Fermé, ouvre demain à 09h00' },
  etatDeLaMaison(SEMAINE, FERIE, a('2026-09-21', 11)));

/* UNE JOURNÉE ÉCOURTÉE SE DIT À SA VRAIE HEURE. */
const COURT: ExceptionDHoraire[] = [{ date: '2026-09-21', close: '13h00' }];
dit('une journée écourtée annonce 13 h', { ouvert: true, texte: 'Ouvert jusqu’à 13h00' },
  etatDeLaMaison(SEMAINE, COURT, a('2026-09-21', 11)));

/* ── SANS HEURES, ON NE DIT RIEN ───────────────────────────────────────
   C'est la règle qui compte le plus : une base muette ne doit pas fermer la
   Maison aux yeux de qui passe devant la page. */
dit('base muette, aucun état', null, etatDeLaMaison([], RIEN, a('2026-09-21', 11)));
dit('base muette, aucune semaine', [], semaineDite([], RIEN, a('2026-09-21', 11)));

/* ── LES SEPT JOURS ────────────────────────────────────────────────── */
const sem = semaineDite(SEMAINE, RIEN, a('2026-09-21', 11));
dit('sept jours, du lundi au dimanche', ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'], sem.map((j) => j.clef));
dit('le lundi est le jour marqué', ['lundi'], sem.filter((j) => j.aujourdhui).map((j) => j.jour));
dit('le samedi ouvre plus tôt', '08h30 à 19h00', sem.find((j) => j.clef === 'sam')?.texte);
dit('le dimanche est fermé', 'fermé', sem.find((j) => j.clef === 'dim')?.texte);

/* LA LIGNE DU JOUR PORTE L'EXCEPTION, les six autres l'ignorent : une
   fermeture passée n'a plus rien à dire mardi prochain. */
const semFerie = semaineDite(SEMAINE, FERIE, a('2026-09-21', 11));
dit('le lundi férié se dit fermé', 'fermé', semFerie.find((j) => j.clef === 'lun')?.texte);
dit('… et le mardi reste ordinaire', '09h00 à 18h00', semFerie.find((j) => j.clef === 'mar')?.texte);

/* ── LA MAISON PARLE FRANÇAIS ──────────────────────────────────────── */
dit('les heures s’écrivent avec un h', true, sem.every((j) => !j.texte.includes(':')));

/* LA GRAPHIE EST NORMALISÉE, PAS RECOPIÉE. Le Trône écrit `09h00` ; un
   `9h` saisi à la main, ou un `09:00` venu d'ailleurs, se lisent pareil. */
const BANCALE: HeureDeLaSemaine[] = [jour('mar', '9h', '18h30'), { key: 'lun', open: '', close: '', closed: true }];
dit('un « 9h » se lit « 09h00 »', '09h00 à 18h30',
  semaineDite(BANCALE, RIEN, a('2026-09-21', 11)).find((j) => j.clef === 'mar')?.texte);

/* ── UNE HEURE VIDE N'EST PAS NEUF HEURES ──────────────────────────────
   `hourToMin` ne connaît que la graphie `09h00` et retombe SILENCIEUSEMENT
   sur 9 h pour tout le reste, la chaîne vide comprise. Or une journée
   exceptionnelle naît avec ses deux champs vides (Paramètres › horaires),
   et rien n'empêche de vider l'heure d'un jour ordinaire sans cocher
   « fermé ». Sans garde, la page annonçait publiquement « 09h00 à 09h00 ».
   Une fenêtre qui ne s'ouvre pas est une journée fermée, et se dit ainsi. */
const VIDE: HeureDeLaSemaine[] = [
  { key: 'lun', open: '', close: '', closed: false },
  jour('mar', '09h00', '18h00'),
];
dit('un jour sans heures se dit fermé', 'fermé',
  semaineDite(VIDE, RIEN, a('2026-09-22', 11)).find((j) => j.clef === 'lun')?.texte);
dit('… même quand c’est aujourd’hui', 'fermé',
  semaineDite(VIDE, RIEN, a('2026-09-21', 11)).find((j) => j.clef === 'lun')?.texte);
dit('… et l’état du jour ne l’ouvre pas', { ouvert: false, texte: 'Fermé, ouvre demain à 09h00' },
  etatDeLaMaison(VIDE, RIEN, a('2026-09-21', 11)));

/* UNE EXCEPTION AUX DEUX CHAMPS VIDES NE FERME RIEN : c'est la règle de
   `ouvertureDuJour`, elle garde les heures ordinaires du jour. On le fixe
   ici pour que personne ne « corrige » ça un jour sans le savoir. */
dit('une exception vide garde la journée ordinaire', '09h00 à 18h00',
  semaineDite(SEMAINE, [{ date: '2026-09-21', open: '', close: '', closed: false }], a('2026-09-21', 11))
    .find((j) => j.clef === 'lun')?.texte);

/* ── DEUX ADRESSES POUR UN SEUL LIEU ───────────────────────────────────
   Le repère va où l'on cherche la porte, jamais dans le texte qui signe la
   Maison : « Portail Marron » dans des mentions légales détonnerait, et le
   paragraphe du registre est celui que Meta compare aux documents. */
dit('l’adresse du registre ne porte pas le repère', false,
  /Portail|Maison 88/.test(COMMUN.editeur.adresse));
dit('celle de la carte le porte', true,
  COMMUN.editeur.adresseComplete.includes('Maison 88, Portail Marron'));
dit('les deux nomment le même lieu', true,
  COMMUN.editeur.adresseComplete.includes('quartier Suru-Léré')
  && COMMUN.editeur.adresseComplete.includes('06 BP 2076'));
/* « Ilot » sans accent, comme l'écrit Yéman (22 septembre 2026). */
dit('aucun accent circonflexe sur Ilot', false,
  [COMMUN.editeur.adresse, COMMUN.editeur.adresseComplete, COMMUN.editeur.rue].some((a) => a.includes('Îlot')));
/* LA FICHE GOOGLE NE RECOPIE PLUS RIEN À LA MAIN : ses parts sortent du
   même bloc que le reste, et doivent rester contenues dans l'adresse. */
dit('la rue est une part de l’adresse', true, COMMUN.editeur.adresse.startsWith(COMMUN.editeur.rue));
dit('la boîte postale aussi', true, COMMUN.editeur.adresse.includes(COMMUN.editeur.boitePostale));

/* ── UN NUMÉRO SE LIT PAR DEUX ─────────────────────────────────────────
   La branche garde le sien comme il a été saisi ; affiché d'un bloc à côté
   de celui du registre, il avait l'air d'une référence de dossier. */
dit('le numéro de la branche se met en forme', '+229 01 96 75 60 62', numeroDit('0196756062'));
dit('… avec son indicatif déjà là', '+229 01 96 75 60 62', numeroDit('+2290196756062'));
dit('… et déjà espacé, il ne bouge pas', '+229 01 51 99 77 99', numeroDit('+229 01 51 99 77 99'));
dit('un numéro vide ne rend rien', '', numeroDit(''));
/* ON NE REGROUPE PAS CE QU'ON NE CONNAÎT PAS : mal couper un numéro
   étranger serait pire que de le laisser tel qu'il est écrit. */
dit('un numéro étranger reste tel quel', '+33 6 12 34 56 78', numeroDit('+33 6 12 34 56 78'));
dit('les chiffres nus pour wa.me', '2290196756062', numeroNu('+229 01 96 75 60 62'));

console.log(ko === 0 ? '\nTout est juste.' : `\n${ko} vérification(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
