/* L'ARRIVÉE D'UNE EMPLOYÉE, ÉPROUVÉE — `node scripts/verifie-l-arrivee.mjs`.

   Ces règles-là ouvrent une porte sans qu'un humain clique. Elles sont
   écrites deux fois, ici et dans la migration 0109, et chaque vérification
   ci-dessous nomme la clause SQL qu'elle garde honnête. Si l'une des deux
   bouge sans l'autre, l'écran promet une porte devant un serveur qui refuse,
   ou pire, l'inverse. */
import {
  JOURS_DE_VALIDITE, ROLES_QUI_S_INVITENT, adresseDArrivee, joursEcoules,
  etatDeLArrivee, seRessemblent, messageDeLInvitation,
} from '../src/shared/arrivee-pure';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJOURD_HUI = '2026-09-22';
const PRETE = { compteMail: 'r.a@maisonmnd.com', roleDAcces: 'maitre', inviteeLe: '2026-09-22' };

/* ── L'ADRESSE QUI FAIT FOI ──────────────────────────────────────
   Mot pour mot `adresseDe` (equipe/data.ts), `est_ma_fiche` (0090) et
   `fiche_qui_mattend` (0109). Trois lectures différentes d'une adresse
   donneraient trois personnes différentes. */
dit('① le compte passe avant l’adresse de contact',
  'r.a@maisonmnd.com', adresseDArrivee({ compteMail: 'r.a@maisonmnd.com', email: 'perso@gmail.com' }));
dit('② sans compte, l’adresse de contact sert de repli',
  'perso@gmail.com', adresseDArrivee({ email: 'perso@gmail.com' }));
dit('③ majuscules et espaces ne font pas une autre personne',
  'r.a@maisonmnd.com', adresseDArrivee({ compteMail: '  R.A@MaisonMND.com ' }));
dit('④ un compte vide ne masque pas le contact',
  'perso@gmail.com', adresseDArrivee({ compteMail: '   ', email: 'perso@gmail.com' }));
dit('⑤ une fiche sans aucune adresse ne vaut personne',
  '', adresseDArrivee({}));

/* ── LES QUATRE ÉTATS ────────────────────────────────────────────── */
dit('⑥ une fiche préparée aujourd’hui attend sa recrue',
  'invitee', etatDeLArrivee(PRETE, AUJOURD_HUI));
dit('⑦ sans adresse, il n’y a rien à préparer',
  'a-preparer', etatDeLArrivee({ roleDAcces: 'maitre', inviteeLe: '2026-09-22' }, AUJOURD_HUI));
dit('⑧ sans date d’invitation, la porte n’est pas ouverte',
  'a-preparer', etatDeLArrivee({ compteMail: 'r.a@maisonmnd.com', roleDAcces: 'maitre' }, AUJOURD_HUI));
dit('⑨ une fiche entrée ne redevient jamais une invitation',
  'entree', etatDeLArrivee({ ...PRETE, entreeLe: '2026-09-23' }, AUJOURD_HUI));
dit('⑩ une entrée l’emporte même sur une invitation périmée',
  'entree', etatDeLArrivee({ ...PRETE, inviteeLe: '2026-01-01', entreeLe: '2026-01-02' }, AUJOURD_HUI));

/* ── LA PÉREMPTION, AU JOUR PRÈS ─────────────────────────────────
   0109 dit `(inviteeLe)::date >= current_date - 30` : le trentième jour
   passe encore, le trente-et-unième non. Un décalage d’un jour entre les
   deux écritures, et l’écran annonce une porte que le serveur refuse. */
dit('⑪ le trentième jour passe encore',
  'invitee', etatDeLArrivee({ ...PRETE, inviteeLe: '2026-08-23' }, AUJOURD_HUI));
dit('⑫ le trente-et-unième jour est périmé',
  'perimee', etatDeLArrivee({ ...PRETE, inviteeLe: '2026-08-22' }, AUJOURD_HUI));
dit('⑬ le seuil reste celui qu’annonce la maquette', 30, JOURS_DE_VALIDITE);
dit('⑭ une date illisible périme, elle ne vaut jamais aujourd’hui',
  'perimee', etatDeLArrivee({ ...PRETE, inviteeLe: 'la semaine prochaine' }, AUJOURD_HUI));
dit('⑮ une date illisible ne rend pas un nombre de jours',
  [null, 0, 30], [joursEcoules('demain', AUJOURD_HUI),
    joursEcoules(AUJOURD_HUI, AUJOURD_HUI), joursEcoules('2026-08-23', AUJOURD_HUI)]);

/* ── LE RÔLE NE SE CHOISIT PAS PAR COURRIER ──────────────────────
   0109 : `roleDAcces in ('gerant','maitre')`. Les pleins pouvoirs restent un
   geste délibéré depuis Accès & personnel. */
dit('⑯ deux rôles s’invitent, et deux seulement',
  ['gerant', 'maitre'], [...ROLES_QUI_S_INVITENT]);
dit('⑰ une gérante s’invite',
  'invitee', etatDeLArrivee({ ...PRETE, roleDAcces: 'gerant' }, AUJOURD_HUI));
dit('⑱ un souverain ne s’invite pas',
  'a-preparer', etatDeLArrivee({ ...PRETE, roleDAcces: 'souverain' }, AUJOURD_HUI));
dit('⑲ un rôle inventé n’ouvre rien',
  'a-preparer', etatDeLArrivee({ ...PRETE, roleDAcces: 'patronne' }, AUJOURD_HUI));

/* ── LA RESSEMBLANCE, QUI ROMPT LE SILENCE ───────────────────────
   Un indice montré à la direction, jamais un rattachement automatique. */
dit('⑳ une lettre inversée se remarque',
  true, seRessemblent('acceuil@maisonmnd.com', 'accueil@maisonmnd.com'));
dit('㉑ une lettre manquante se remarque',
  true, seRessemblent('r.a@maisonmnd.com', 'ra@maisonmnd.com'));
dit('㉒ la même adresse n’est pas une ressemblance',
  false, seRessemblent('r.a@maisonmnd.com', 'r.a@maisonmnd.com'));
dit('㉓ deux collègues ne se ressemblent pas',
  false, seRessemblent('rita@maisonmnd.com', 'ines@maisonmnd.com'));
dit('㉔ deux boîtes d’une seule lettre ne se ressemblent jamais',
  false, seRessemblent('a@x.bj', 'b@x.bj'));
dit('㉔ bis une adresse sans arobase n’en est pas une',
  false, seRessemblent('accueil', 'accueil@maisonmnd.com'));
dit('㉕ une adresse vide ne ressemble à rien',
  [false, false], [seRessemblent('', 'accueil@maisonmnd.com'), seRessemblent('accueil@maisonmnd.com', '')]);
dit('㉖ un domaine voisin se remarque aussi',
  true, seRessemblent('accueil@maisonmnd.com', 'accueil@maisonmd.com'));

/* ── LE MOT QUI PART ─────────────────────────────────────────────
   Il porte l’adresse EXACTE, parce que c’est elle qui sert de serrure. */
const MOT = messageDeLInvitation({
  prenom: 'R. A.', adresse: 'r.a@maisonmnd.com', adresseDuTrone: 'exemple.test/trone/',
});
dit('㉗ le mot porte l’adresse exacte', true, MOT.includes('r.a@maisonmnd.com'));
dit('㉘ le mot dit où aller', true, MOT.includes('exemple.test/trone/'));
dit('㉙ le mot ne tutoie personne et salue par le prénom seul',
  true, MOT.startsWith('Bonjour R.,'));
dit('㉚ sans prénom, le mot salue quand même',
  true, messageDeLInvitation({ prenom: '  ', adresse: 'x@y.com', adresseDuTrone: 'z' }).startsWith('Bonjour,'));
dit('㉛ aucun tiret cadratin dans le mot de la Maison', false, MOT.includes('—'));

console.log(ko === 0 ? `\nTOUT EST JUSTE (32 vérifications).` : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
