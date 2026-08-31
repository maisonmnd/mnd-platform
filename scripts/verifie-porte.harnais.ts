/* LA PORTE D'UN COMPTE, ÉPROUVÉE — routage de l'écran « Accès & personnel ».

   Le Trône listait comme candidates au personnel TOUS les comptes absents de
   `staff`. Une cliente de Ma Couronne y arrivait donc, avec un bouton
   « Autoriser » à portée de clic — et ce clic lui ouvrait la paie, le coffre
   et les fiches de toutes les autres. Aucun écran ne rattrape cette erreur
   après coup : elle se voit le jour où l'accès a déjà servi. */
import { vientDeMaCouronne, origineDeLaSession, type CompteEnAttente } from '../src/shared/auth';
import { gestesRapides, peutVoir, premierEcranVisible } from '../src/apps/trone/routes/index';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const compte = (p: Partial<CompteEnAttente>): CompteEnAttente =>
  ({ user_id: 'u-1', email: 'x@example.com', created_at: '2026-08-01T00:00:00Z', ...p });

/* Aucune fiche de ce côté : le cas d'un Trône qui n'a pas encore hydraté le
   carnet, ou d'une inscrite qui n'a jamais ouvert l'application. */
const sansFiche = () => false;

/* ── ① LA MARQUE SUFFIT, SEULE ──────────────────────────────────────
   C'est tout l'intérêt : la marque est posée à l'inscription, AVANT la
   première ouverture. Une cliente inscrite hier soir est déjà rangée. */
dit('marquée couronne, sans fiche nulle part', true,
  vientDeMaCouronne(compte({ origine: 'couronne' }), sansFiche));
dit('marquée trone, c’est une candidature', false,
  vientDeMaCouronne(compte({ origine: 'trone' }), sansFiche));

/* ── ② LA FICHE SUFFIT, SEULE ───────────────────────────────────────
   Les comptes nés avant la marque n'en portent aucune. Ils restent reconnus
   par leur fiche, du serveur ou d'ici — sinon la correction aurait rangé les
   anciennes clientes du mauvais côté le jour de sa mise en ligne. */
dit('sans marque, mais le serveur voit sa fiche', true,
  vientDeMaCouronne(compte({ a_fiche: true }), sansFiche));
dit('sans marque, mais la fiche est lue d’ici', true,
  vientDeMaCouronne(compte({ user_id: 'u-9' }), (id) => id === 'u-9'));

/* ── ③ CE QUI RESTE UNE CANDIDATURE ─────────────────────────────────
   Ni marque, ni fiche : personne ne peut dire d'où elle vient. Elle reste
   dans la file du Trône, où le souverain vérifie l'adresse. LE DOUTE PENCHE
   VERS LA FILE, jamais vers le silence : un compte oublié dans « Ma
   Couronne » ne serait jamais autorisé, et une collègue attendrait sans
   comprendre. */
dit('ni marque ni fiche, elle reste une candidature', false,
  vientDeMaCouronne(compte({}), sansFiche));
dit('une marque inconnue ne range rien', false,
  vientDeMaCouronne(compte({ origine: 'lokaa' }), sansFiche));
dit('a_fiche à false ne range pas non plus', false,
  vientDeMaCouronne(compte({ a_fiche: false }), sansFiche));
dit('… mais la fiche lue d’ici la rattrape', true,
  vientDeMaCouronne(compte({ a_fiche: false, user_id: 'u-3' }), (id) => id === 'u-3'));

/* ── ④ LE CHAMP ABSENT N'EST PAS UN CHAMP FAUX ──────────────────────
   `origine` et `a_fiche` n'existent qu'une fois la migration passée. Avant
   elle, l'écran doit se comporter EXACTEMENT comme avant — sinon la mise en
   ligne du code et celle du SQL devraient être simultanées, ce qu'on ne peut
   pas garantir depuis un téléphone. */
dit('avant la migration, la fiche décide seule', [false, true],
  [vientDeMaCouronne(compte({}), sansFiche), vientDeMaCouronne(compte({}), () => true)]);
dit('null se lit comme absent', false,
  vientDeMaCouronne(compte({ origine: null, a_fiche: null }), sansFiche));

/* ── ⑤ L'ORIGINE LUE SUR UNE SESSION ────────────────────────────────
   Elle ne rend QUE les deux portes connues : une valeur écrite à la main
   dans les métadonnées ne doit pas devenir une porte. */
const sess = (origine?: unknown) =>
  ({ user: { user_metadata: origine === undefined ? {} : { origine } } }) as never;
dit('la porte de Ma Couronne se lit', 'couronne', origineDeLaSession(sess('couronne')));
dit('celle du Trône aussi', 'trone', origineDeLaSession(sess('trone')));
dit('une porte inventée ne se lit pas', undefined, origineDeLaSession(sess('souverain')));
dit('pas de session, pas de porte', undefined, origineDeLaSession(null));
dit('session sans marque', undefined, origineDeLaSession(sess()));

/* ── ⑥ CE QU'UN MAÎTRE VOIT, ÉCRAN PAR ÉCRAN ───────────────────────
   « Je veux sélectionner si je veux Mon mois, Mon fil ou Mon tableau sur tous
   les comptes employés » (Yéman, 31 août). Ces trois écrans étaient ouverts à
   TOUT le personnel sans recours, et la matrice les excluait même de ses
   cases. */
dit('le calendrier est ouvert sans rien cocher', true, peutVoir('maitre', '/calendrier', {}));
/* MAIS IL SE FERME AUSSI — « Kabirou n'est pas au fauteuil, il n'a pas besoin
   du calendrier » (31 août). Plus aucun écran n'est imposé. */
dit('… et se ferme comme les autres', false, peutVoir('maitre', '/calendrier', { '/calendrier': false }));

/* OUVERTS SANS RIEN COCHER : les comptes déjà autorisés n'ont aucune case
   pour eux ; les rendre fermés d'un coup les retirerait à tout le monde le
   jour de la mise en ligne. */
dit('Mon mois est ouvert sans rien cocher', true, peutVoir('maitre', '/mon-mois', {}));
dit('Le Fil aussi', true, peutVoir('maitre', '/fil', {}));
dit('Le Tableau aussi', true, peutVoir('maitre', '/tableau', {}));

/* SEUL UN REFUS EXPLICITE FERME. */
dit('un refus posé ferme Le Fil', false, peutVoir('maitre', '/fil', { '/fil': false }));
dit('… et n’emporte pas les autres', [true, true],
  [peutVoir('maitre', '/mon-mois', { '/fil': false }), peutVoir('maitre', '/tableau', { '/fil': false })]);

/* LE DOMAINE NE ROUVRE PAS CE QU'ON A FERMÉ : ouvrir « Équipe & croissance »
   en entier ne doit pas rendre à quelqu'un un fil qu'on vient de lui retirer. */
dit('le domaine entier ne rouvre pas un fil fermé', false,
  peutVoir('maitre', '/fil', { equipe: true, '/fil': false }));

/* LES AUTRES ÉCRANS N'ONT PAS CHANGÉ : fermés tant qu'on n'ouvre rien. */
dit('les dépenses restent fermées par défaut', false, peutVoir('maitre', '/depenses', {}));
dit('… et s’ouvrent à la case', true, peutVoir('maitre', '/depenses', { '/depenses': true }));
dit('… ou par leur domaine', true, peutVoir('maitre', '/depenses', { finances: true }));

/* CE QUI EST RÉSERVÉ AU SOUVERAIN LE RESTE, quoi qu'on coche. */
dit('le Journal reste au souverain', false, peutVoir('maitre', '/journal', { '/journal': true, systeme: true }));
dit('… et s’ouvre pour lui', true, peutVoir('souverain', '/journal', {}));
dit('un gérant voit tout le reste', true, peutVoir('gerant', '/depenses', {}));

/* ── ⑦ ON NE RENVOIE QUE VERS UNE PORTE OUVERTE ────────────────────
   LE PIÈGE ÉTAIT UNE BOUCLE : le Shell renvoyait vers l'accueil du rôle, soit
   `/mon-mois` pour un maître. Le jour où l'on ferme cet écran, la redirection
   l'y renvoie, la garde le refuse, elle l'y renvoie encore — l'application
   tourne sur elle-même et personne n'entre plus. */
dit('un maître ordinaire atterrit sur Mon mois', '/mon-mois', premierEcranVisible('maitre', {}));
dit('… Mon mois fermé, il atterrit ailleurs, mais pas dessus', true,
  premierEcranVisible('maitre', { '/mon-mois': false }) !== '/mon-mois');
dit('… et cet ailleurs lui est bien ouvert', true, (() => {
  const acces = { '/mon-mois': false };
  const ou = premierEcranVisible('maitre', acces);
  return !!ou && peutVoir('maitre', ou, acces);
})());

/* TOUT FERMÉ = AUCUNE DESTINATION. Le Shell le dit alors en toutes lettres au
   lieu d'ouvrir une application vide. */
dit('tout fermé, aucune destination', null,
  premierEcranVisible('maitre', { '/mon-mois': false, '/calendrier': false, '/fil': false, '/tableau': false }));

/* UN SOUVERAIN GARDE SA PORTE, quoi qu'on ait coché : les cases ne valent que
   pour un maître. */
dit('le souverain atterrit chez lui', '/', premierEcranVisible('souverain', {}));
dit('… même avec des refus posés', '/',
  premierEcranVisible('souverain', { '/mon-mois': false, '/calendrier': false }));

/* ── UN COMPTE ÉCARTÉ NE REVIENT PLUS ───────────────────────────────
   « À chaque fois qu'un nouveau compte se crée sur Ma Couronne ça vient au
   Trône comme demande de permission. Il faut régler de façon définitive »
   (Yéman, 31 août).

   LA MARQUE SUFFIT, ET ELLE SUFFIT SEULE. `ecarter_du_personnel` (0080) ne
   fait rien d'autre que la poser côté serveur : le juge d'écran n'a donc
   aucune règle de plus à connaître, et il ne peut pas diverger de la file. */
dit('un compte marqué couronne sort de la file', true,
  vientDeMaCouronne(compte({ origine: 'couronne' }), () => false));
dit('… même sans fiche cliente', true,
  vientDeMaCouronne(compte({ origine: 'couronne', a_fiche: false }), () => false));
/* CELUI QU'ON A ÉCARTÉ PAR ERREUR SE RATTRAPE : « Autoriser » lui donne un
   rôle, et un membre du personnel ne se lit plus dans cette file du tout. */
dit('une fiche cliente suffit aussi', true,
  vientDeMaCouronne(compte({ a_fiche: true }), () => false));
dit('un inconnu reste une candidature', false,
  vientDeMaCouronne(compte({}), () => false));

/* ── LA BARRE DU BAS NE TEND QUE DES PORTES OUVERTES ────────────────
   « Je ne veux pas mon mois, calendrier et pointer en bas de page si l'employé
   n'est pas concerné » (Yéman, 31 août). Un bouton qui ne fait rien vaut moins
   qu'un bouton absent : on le reclique. */
dit('sans rien de posé, les trois gestes sont là', { monMois: true, calendrier: true, caisse: false, aucun: false },
  gestesRapides('maitre', {}));
dit('Mon mois fermé emporte Pointer avec lui', { monMois: false, calendrier: true, caisse: false, aucun: false },
  gestesRapides('maitre', { '/mon-mois': false }));
dit('le calendrier se ferme seul', { monMois: true, calendrier: false, caisse: false, aucun: false },
  gestesRapides('maitre', { '/calendrier': false }));
/* LA CAISSE VIENT DU DOMAINE VENTE, pas d'un interrupteur d'écran. */
dit('ouvrir la Vente tend la Caisse', true, gestesRapides('maitre', { vente: true }).caisse);

/* TOUT FERMÉ : PLUS DE BARRE. Le Shell lit le même `aucun` pour ne plus
   réserver les 78 px du bas, sinon une bande morte reste sous la page. */
dit('les deux fermés, il ne reste rien à tendre', true,
  gestesRapides('maitre', { '/mon-mois': false, '/calendrier': false }).aucun);
dit('… mais la Caisse ouverte suffit à la garder', false,
  gestesRapides('maitre', { '/mon-mois': false, '/calendrier': false, vente: true }).aucun);

/* ELLE N'EST PAS POUR LES AUTRES RÔLES : un souverain garde sa barre
   latérale, même au téléphone. */
dit('un souverain n’a pas de barre du bas', true, gestesRapides('souverain', {}).aucun);
dit('un compte sans rôle non plus', true, gestesRapides(undefined, {}).aucun);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
