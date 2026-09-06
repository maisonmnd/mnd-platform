/* ══ LE RAPPEL ENVOYÉ À LA CLIENTE — 7 septembre 2026 ════════════════

   « J'ai besoin qu'on rajoute le jour devant la date… j'ai besoin que ce soit
   mieux structuré et plus aéré » (Yéman).

   C'EST LE SEUL TEXTE DE LA MAISON QUE LA CLIENTE LIT SUR SON TÉLÉPHONE, et
   il se lisait comme un accusé de réception : quatre lignes collées, une date
   abrégée, une heure d'horaire de train, et le rituel entre parenthèses au
   milieu de la phrase. Une cliente qui doit relire pour trouver l'heure ne
   revient pas plus souvent ; elle appelle l'accueil.

   TROIS BLOCS, SÉPARÉS PAR DU BLANC : à qui l'on parle, quand c'est, ce qu'on
   va lui faire. Puis la demande, puis la signature. Sur WhatsApp, le blanc est
   la seule mise en forme qui survive à tous les téléphones.

   LE JOUR DE LA SEMAINE DEVANT LA DATE, parce que c'est par lui qu'on juge si
   le créneau tient : « le 11 » ne dit rien tant qu'on n'a pas ouvert un
   calendrier, « vendredi 11 » se répond tout de suite.

   RIEN ICI NE TOUCHE À REACT NI AU CARNET : le texte se juge dans
   `verifie-rappel`, mot pour mot. */

import { houseSignature } from './identite';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 8 h 30 », « 14 h » — l'heure telle qu'on la dit, pas telle qu'on la tape.
    « 08:30 » est un horaire de train : on l'écrit pour une machine. La cliente
    lit « huit heures trente » de toute façon ; autant l'écrire ainsi. */
export function heureLisible(hhmm: string): string {
  /* UNE HEURE ABSENTE N'EST PAS MINUIT. `Number('')` vaut zéro et non NaN :
     sans ce garde-fou, un rendez-vous dont l'heure manque annonçait « 0 h » à
     la cliente, ce qui est pire qu'un champ vide — elle y croit. */
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return hhmm ?? '';
  const [h, m] = hhmm.split(':');
  const heures = Number(h);
  const minutes = Number(m);
  return Number.isFinite(minutes) && minutes > 0
    ? `${heures} h ${String(minutes).padStart(2, '0')}`
    : `${heures} h`;
}

/** « vendredi 11 septembre » — et l'année seulement quand elle change quelque
    chose. Une cadence posée court sur deux ans : « vendredi 11 septembre » nu
    se lit comme celui de cette année-ci. La porter toujours alourdirait le
    rappel de la semaine prochaine pour rien. */
export function jourLisible(iso: string, aujourdhuiIso: string): string {
  const [a, m, j] = (iso ?? '').split('-').map(Number);
  if (!a || !m || !j) return iso ?? '';
  const d = new Date(a, m - 1, j);
  const nom = JOURS[d.getDay()];
  const mois = MOIS[m - 1];
  if (!nom || !mois) return iso;
  const memeAnnee = (aujourdhuiIso ?? '').slice(0, 4) === String(a);
  return `${nom} ${j} ${mois}${memeAnnee ? '' : ` ${a}`}`;
}

/** LE MOMENT, TEL QU'ON LE DIT DANS LA PHRASE.

    « prévu pour le vendredi 11 septembre » se dit ; « prévu pour aujourd'hui »
    ne se dit pas. La préposition appartient donc au moment, pas à la phrase :
    laissée dans la phrase, elle aurait obligé à écrire deux phrases, et les
    deux auraient divergé. */
export function quandDuRappel(o: {
  jourIso: string; heure: string; aujourdhuiIso: string; demainIso: string;
}): string {
  const h = heureLisible(o.heure);
  if (o.jourIso === o.aujourdhuiIso) return `aujourd’hui à ${h}`;
  if (o.jourIso === o.demainIso) return `demain à ${h}`;
  return `pour le ${jourLisible(o.jourIso, o.aujourdhuiIso)} à ${h}`;
}

/** LE MÊME MOMENT SANS SA PRÉPOSITION — pour les bulles de l'écran, où il se
    lit après « RDV » et non après « prévu ». */
export function momentCourt(o: {
  jourIso: string; heure: string; aujourdhuiIso: string; demainIso: string;
}): string {
  return quandDuRappel(o).replace(/^pour le /, '');
}

/** « de la Maison MND », mais « de L'atelier MND ».

    LE NOM VIENT DES PARAMÈTRES, il ne se recopie pas : il s'écrivait en dur
    dans ce message alors que la Maison s'appelle « L'atelier MND » et signe
    ainsi trois lignes plus bas. La cliente lisait donc deux noms dans le même
    message.

    L'ARTICLE EST LE PIÈGE de ce branchement : « de la L'atelier MND » aurait
    été pire que le nom figé. Un nom qui porte déjà son article n'en reçoit pas
    un second. */
export function deLaMaison(nom: string): string {
  const n = (nom ?? '').trim();
  if (!n) return 'la Maison';
  return /^(l['’]|le |la |les )/i.test(n) ? n : `la ${n}`;
}

export function texteDuRappel(o: {
  /** Le prénom, seul. On ne lit pas son nom complet sur son téléphone. */
  prenom: string;
  jourIso: string;
  heure: string;
  aujourdhuiIso: string;
  demainIso: string;
  /** Les rituels, un par ligne. Vide = on n'annonce rien. */
  rituels: string[];
  maison: string;
  picto?: string;
}): string {
  const blocs = [
    `Bonjour ${o.prenom},`,
    `Petit rappel de ${deLaMaison(o.maison)} : votre rendez-vous est prévu `
    + `${quandDuRappel(o)}.`,
    /* LES RITUELS SUR LEURS PROPRES LIGNES. Entre parenthèses au milieu de la
       phrase, trois noms à marque déposée poussaient l'heure hors de l'écran
       sur un téléphone : ce qui compte le plus se lisait en dernier. Aucun
       bloc quand il n'y a rien à annoncer — une ligne vide se voit. */
    o.rituels.length ? o.rituels.join('\n') : '',
    'Merci de nous prévenir en cas d’empêchement. À très vite.',
  ].filter(Boolean);
  return `${blocs.join('\n\n')}\n\n${houseSignature(o.picto)}`;
}
