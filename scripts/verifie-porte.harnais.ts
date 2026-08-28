/* LA PORTE D'UN COMPTE, ÉPROUVÉE — routage de l'écran « Accès & personnel ».

   Le Trône listait comme candidates au personnel TOUS les comptes absents de
   `staff`. Une cliente de Ma Couronne y arrivait donc, avec un bouton
   « Autoriser » à portée de clic — et ce clic lui ouvrait la paie, le coffre
   et les fiches de toutes les autres. Aucun écran ne rattrape cette erreur
   après coup : elle se voit le jour où l'accès a déjà servi. */
import { vientDeMaCouronne, origineDeLaSession, type CompteEnAttente } from '../src/shared/auth';

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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
