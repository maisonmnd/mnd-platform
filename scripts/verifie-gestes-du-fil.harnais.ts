/* LES GESTES DU FIL, ÉPROUVÉS — `node scripts/verifie-gestes-du-fil.mjs`.

   « J'aimerais éditer des messages qui sont partis. Les mêmes fonctionnalités
   que WhatsApp », puis « je voudrais une sonnette quand un nouveau message
   vient dans le Trône » (Yéman, 14 septembre 2026).

   Trois fautes coûteraient cher, et se lisent toutes ici : une sonnette qui
   carillonne cinquante fois au chargement, une réécriture par une main qui
   n'y a pas droit, et une retenue qui laisse partir ce qu'on voulait garder. */
import {
  DELAI_DE_RETENUE_MS, delaiDeRetenue, resteDeLaRetenue,
  pourquoiOnNeReecritPas, texteDeLaCorrection, messagesQuiSonnent, filsQuiAttendent,
  modeleFacture, compteDesModeles,
  type MessageWa, type Fil,
} from '../src/shared/conversations';
import { cestLaNuit } from '../src/shared/sonnette';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const msg = (o: Partial<MessageWa> & { id: string }): MessageWa => ({
  sens: 'entrant', numero: '22990000001', texte: '', quand: '2026-09-14T14:00:00.000Z', ...o,
} as MessageWa);

/* ── LA RETENUE ──────────────────────────────────────────────────── */
dit('huit secondes par défaut', 8000, DELAI_DE_RETENUE_MS);
dit('un réglage se respecte', 15000, delaiDeRetenue(15));
dit('zéro coupe la retenue', 0, delaiDeRetenue(0));
dit('rien de réglé retombe sur le défaut', 8000, delaiDeRetenue(undefined));
dit('une valeur absurde retombe sur le défaut', 8000, delaiDeRetenue(-4));
/* AU-DELÀ D'UNE MINUTE CE N'EST PLUS UNE RETENUE, c'est une file d'attente. */
dit('le délai se borne à une minute', 60000, delaiDeRetenue(600));

dit('il reste huit secondes au départ', 8, resteDeLaRetenue(1000, 8000, 1000));
dit('… six après deux secondes', 6, resteDeLaRetenue(1000, 8000, 3000));
dit('… zéro quand c’est parti', 0, resteDeLaRetenue(1000, 8000, 9500));
dit('… et jamais négatif', 0, resteDeLaRetenue(1000, 8000, 99999));

/* ── QUI PEUT RÉÉCRIRE ───────────────────────────────────────────── */
const sien = msg({ id: 'm1', sens: 'sortant', parQui: 'rita@mnd.bj', etat: 'remis', type: 'text' });
const juge = (m: MessageWa, moi?: string, direction = false) =>
  pourquoiOnNeReecritPas({ message: m, moi, estDirection: direction });

dit('sa propre main passe', null, juge(sien, 'rita@mnd.bj'));
dit('… même avec une casse différente', null, juge(sien, 'Rita@MND.bj'));
dit('la direction passe sur tout', null, juge(sien, 'yeman@mnd.bj', true));
dit('une autre main est refusée',
  'Ce message est d’une autre main : seule la direction peut le réécrire.',
  juge(sien, 'ines@mnd.bj'));
dit('sans nom, on refuse',
  'Seule la direction peut réécrire un message qui n’est pas le sien.', juge(sien));

dit('un message entrant ne se réécrit pas',
  'On ne réécrit que ce que la Maison a écrit.',
  juge(msg({ id: 'm2', sens: 'entrant' }), 'rita@mnd.bj', true));
/* UN MODÈLE EST LE TEXTE QUE META A VALIDÉ : le réécrire ferait croire qu'on
   a envoyé autre chose. */
dit('un modèle approuvé ne se réécrit pas',
  'Un modèle approuvé ne se réécrit pas : son texte est celui que Meta a validé.',
  juge({ ...sien, modele: 'rappel_rdv' }, 'rita@mnd.bj', true));
dit('une pièce jointe ne se réécrit pas',
  'Seul un message de texte se réécrit.',
  juge({ ...sien, type: 'document' }, 'rita@mnd.bj', true));
/* CE QUI N'EST JAMAIS PARTI SE RENVOIE, il ne se corrige pas : la cliente
   n'a rien reçu qu'il faudrait rattraper. */
dit('un message non remis se renvoie',
  'Ce message n’est jamais parti : renvoyez-le plutôt que de le réécrire.',
  juge({ ...sien, etat: 'non-remis' }, 'rita@mnd.bj', true));

/* ── LE MOT DE LA CORRECTION ─────────────────────────────────────── */
dit('la correction porte le texte juste, et ne cite pas la faute',
  'A., petite correction : c’est bien samedi à 10 h.',
  texteDeLaCorrection('C’est bien samedi à 10 h.', 'A.'));
dit('sans prénom, elle commence par le mot',
  'Petite correction : c’est bien samedi à 10 h.',
  texteDeLaCorrection('C’est bien samedi à 10 h.'));
/* ON NE DEVINE PAS UN NOM PROPRE : « Rita vous attend » garde sa capitale. */
dit('un nom propre garde sa capitale',
  'Petite correction : RITA vous attend.', texteDeLaCorrection('RITA vous attend.'));
dit('les espaces autour tombent',
  'Petite correction : c’est bien 10 h.', texteDeLaCorrection('  C’est bien 10 h.  '));

/* ══ LA SONNETTE ═════════════════════════════════════════════════════ */
const avant = [msg({ id: 'a1' }), msg({ id: 'a2', sens: 'sortant' })];
const apres = [...avant, msg({ id: 'n1', numero: '22990000001' })];

/* ① AU CHARGEMENT, ELLE NE SONNE PAS. Sans cette garde, ouvrir le Trône
   ferait carillonner cinquante fois, et l'on couperait le son le jour même. */
dit('au premier chargement, aucun son', [],
  messagesQuiSonnent({ avant: [], apres, premiereLecture: true }).map((m) => m.id));

dit('un message neuf sonne', ['n1'],
  messagesQuiSonnent({ avant, apres, premiereLecture: false }).map((m) => m.id));

/* ② NOS PROPRES MESSAGES NE SONNENT PAS. */
dit('ce que la Maison envoie ne sonne pas', [],
  messagesQuiSonnent({
    avant, premiereLecture: false,
    apres: [...avant, msg({ id: 'n2', sens: 'sortant' })],
  }).map((m) => m.id));

/* ③ UNE RAFALE REND SA LISTE, et l'appelant sonne UNE fois. */
dit('une rafale rend tout ce qui est neuf', ['n1', 'n2', 'n3'],
  messagesQuiSonnent({
    avant, premiereLecture: false,
    apres: [...avant, msg({ id: 'n1' }), msg({ id: 'n2' }), msg({ id: 'n3' })],
  }).map((m) => m.id));

/* ④ LE FIL OUVERT NE SONNE PAS : on est en train de lui parler. */
dit('le fil ouvert reste silencieux', [],
  messagesQuiSonnent({ avant, apres, premiereLecture: false, filOuvert: '22990000001' }).map((m) => m.id));
dit('… mais un autre fil sonne quand même', ['n1'],
  messagesQuiSonnent({ avant, apres, premiereLecture: false, filOuvert: '22990000099' }).map((m) => m.id));
/* LE NUMÉRO DU FIL OUVERT SE RÉDUIT COMME LES AUTRES : une fiche écrite
   « +229 01 90 00 00 01 » désigne bien le même fil. */
dit('le numéro du fil ouvert se réduit', [],
  messagesQuiSonnent({ avant, apres, premiereLecture: false, filOuvert: '+229 90 00 00 01' }).map((m) => m.id));

dit('rien de neuf, rien à sonner', [],
  messagesQuiSonnent({ avant, apres: avant, premiereLecture: false }).map((m) => m.id));

/* ── CE QUE LA CLOCHE COMPTE ─────────────────────────────────────── */
const fil = (o: Partial<Fil> & { numero: string }): Fil => ({
  nom: 'A.', sansFiche: false, prive: false, messages: [], attendUneReponse: false,
  dernier: msg({ id: 'x' }), fenetre: { ouverte: true, resteMs: 0 }, ...o,
} as Fil);
dit('la cloche ne compte que ce qui attend une réponse', ['22990000001'],
  filsQuiAttendent([
    fil({ numero: '22990000001', attendUneReponse: true }),
    fil({ numero: '22990000002' }),
  ]).map((f) => f.numero));

/* ── LE SILENCE DE LA NUIT ───────────────────────────────────────
   Une tablette oubliée allumée ne doit pas sonner à deux heures du matin.
   On coupe le SON, jamais le compte de la cloche. */
const a = (h: number, m = 0) => new Date(2026, 8, 14, h, m);
dit('en pleine journée, elle sonne', false, cestLaNuit(a(14), '09:00', '19:00'));
dit('avant l’ouverture, elle se tait', true, cestLaNuit(a(7), '09:00', '19:00'));
dit('après la fermeture, elle se tait', true, cestLaNuit(a(22), '09:00', '19:00'));
dit('à l’heure pile de l’ouverture, elle sonne', false, cestLaNuit(a(9), '09:00', '19:00'));
dit('à l’heure pile de la fermeture, elle se tait', true, cestLaNuit(a(19), '09:00', '19:00'));
/* UN SALON QUI FERME APRÈS MINUIT enjambe le jour — une soirée de mariage
   suffit à le rencontrer. */
dit('un salon qui ferme à 2 h sonne encore à minuit', false, cestLaNuit(a(0, 30), '10:00', '02:00'));
dit('… et se tait à 4 h', true, cestLaNuit(a(4), '10:00', '02:00'));
/* SANS HEURES CONNUES, ON NE PRÉSUME RIEN : une sonnette qui se tairait sans
   qu'on lui ait dit quand serait une sonnette cassée. */
dit('sans heures posées, elle sonne', false, cestLaNuit(a(3), undefined, undefined));
dit('des heures illisibles ne la taisent pas', false, cestLaNuit(a(3), 'le matin', '19:00'));

/* ══ CE QUE META FACTURE VRAIMENT — 15 septembre 2026 ════════════════
   « Combien Meta facture une conversation de 24 h ? » (Yéman). Ce modèle
   n'existe plus : depuis le 1er juillet 2025 c'est AU MESSAGE, et un modèle
   parti DANS une fenêtre ouverte est gratuit. */
const T = (h: number) => new Date(Date.UTC(2026, 8, 14, h)).toISOString();

const filWa = [
  msg({ id: 'e1', sens: 'entrant', numero: '22990000001', quand: T(10) }),
  msg({ id: 's1', sens: 'sortant', numero: '22990000001', quand: T(12), modele: 'rappel_rdv' }),
  msg({ id: 's2', sens: 'sortant', numero: '22990000002', quand: T(12), modele: 'rappel_rdv' }),
];

/* ELLE A ÉCRIT DEUX HEURES PLUS TÔT : la fenêtre est ouverte, le modèle est
   gratuit. C'est tout le changement de juillet 2025. */
dit('un modèle dans une fenêtre ouverte est gratuit', false, modeleFacture(filWa[1], filWa));
/* CELLE-LÀ N'A JAMAIS ÉCRIT : le modèle se paie. */
dit('un modèle hors fenêtre se facture', true, modeleFacture(filWa[2], filWa));
/* PLUS DE 24 HEURES APRÈS SON MESSAGE, la fenêtre est refermée. */
dit('au-delà de 24 heures, la fenêtre est refermée', true,
  modeleFacture(msg({ id: 's3', sens: 'sortant', numero: '22990000001', quand: T(35), modele: 'x' }), filWa));
dit('un message libre ne se facture jamais', false,
  modeleFacture(msg({ id: 's4', sens: 'sortant', numero: '22990000002', quand: T(12) }), filWa));
dit('un message reçu ne se facture pas non plus', false, modeleFacture(filWa[0], filWa));
/* ON RÉPOND « FACTURÉ » QUAND ON NE SAIT PAS : un compteur qui sous-estime la
   dépense ne sert à rien. */
dit('une heure illisible compte comme facturée', true,
  modeleFacture(msg({ id: 's5', sens: 'sortant', numero: '22990000001', quand: 'hier', modele: 'x' }), filWa));

/* ── LE COMPTEUR DU MOIS ─────────────────────────────────────────── */
const compte = compteDesModeles([
  ...filWa,
  msg({ id: 's6', sens: 'sortant', numero: '22990000003', quand: T(13), modele: 'avis_google' }),
  /* Un mois qui n'est pas le nôtre ne compte pas. */
  msg({ id: 's7', sens: 'sortant', numero: '22990000003', quand: '2026-08-14T12:00:00.000Z', modele: 'avis_google' }),
], '2026-09');
dit('trois modèles ce mois-ci', 3, compte.envoyes);
dit('deux se facturent', 2, compte.factures);
dit('un était gratuit', 1, compte.gratuits);
dit('le détail par modèle, du plus envoyé au moins',
  [{ nom: 'rappel_rdv', factures: 1, gratuits: 1 }, { nom: 'avis_google', factures: 1, gratuits: 0 }],
  compte.parModele);
dit('un mois sans rien rend zéro', 0, compteDesModeles(filWa, '2026-01').envoyes);

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes gestes du fil tiennent.');
