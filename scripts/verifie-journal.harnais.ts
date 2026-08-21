/* LE JOURNAL DES GESTES — les invariants qui comptent.

   Un journal se juge sur trois choses, et aucune n'est l'affichage :
   qu'il nomme JUSTE (le bon verbe, les bons champs, en français), qu'il se
   TAISE là où il n'a rien à dire (mécanique interne, champs techniques), et
   qu'il ne puisse JAMAIS empêcher le geste qu'il observe. */

import {
  champsChanges, tableSuivie, CARTE_DES_TABLES, NOM_DES_CHAMPS,
  poseLIdentite, identiteCourante, inscrisLesGestes,
} from '../src/shared/journal';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① CE QU'UNE MAIN TOUCHE, ET RIEN D'AUTRE ────────────────────── */
dit('le Carnet est suivi', true, tableSuivie('appointments'));
dit('les factures aussi', true, tableSuivie('invoices'));
dit('les dépenses aussi', true, tableSuivie('expenses'));
/* La liste AUTORISE, elle n'exclut pas : une table nouvelle n'entre au journal
   que si on l'y met. Sans cette règle, la mécanique interne y tomberait toute
   seule le jour où quelqu'un ajoute une collection. */
dit('la file des consultations ne l’est pas', false, tableSuivie('consultations_queue'));
dit('les sessions des clientes non plus', false, tableSuivie('client_sessions'));
dit('les échos d’envois non plus', false, tableSuivie('envois'));
dit('une table inventée ne l’est pas', false, tableSuivie('table_qui_nexiste_pas'));

/* ── ② LA PIÈCE SE NOMME EN FRANÇAIS ─────────────────────────────── */
dit('un rituel se nomme par sa cliente et son jour',
  'Rituel · Diane C. · 18 août',
  CARTE_DES_TABLES.appointments.nomme({ clientName: 'Diane C.', date: '2026-08-18' }));
dit('une facture se nomme par son numéro',
  'F-2026-0041 · Diane C.',
  CARTE_DES_TABLES.invoices.nomme({ number: 'F-2026-0041', clientName: 'Diane C.' }));
dit('une pièce sans nom ne rend pas « undefined »',
  'Rituel · cliente · ',
  CARTE_DES_TABLES.appointments.nomme({}));

/* ── ③ CE QUI A CHANGÉ, NOMMÉ ────────────────────────────────────── */
const avant = { id: 'a1', branchId: 'br', priceXof: 60_000, status: 'confirmé', clientName: 'Diane C.' };
const apres = { id: 'a1', branchId: 'br', priceXof: 15_000, status: 'confirmé', clientName: 'Diane C.' };
dit('un prix modifié se dit en clair',
  [{ champ: 'Prix', avant: '60000', apres: '15000' }],
  champsChanges(avant, apres));
dit('un champ inchangé ne fait pas de bruit', 0, champsChanges(avant, avant).length);

/* LES CHAMPS TECHNIQUES SE TAISENT. `id` et `branchId` changent à la création
   d'une pièce et ne disent rien de personne ; les afficher noierait la ligne
   utile sous du bruit de machine. */
dit('l’identifiant ne paraît jamais', 0,
  champsChanges({ id: 'a1' }, { id: 'a2' }).length);
dit('la branche non plus', 0,
  champsChanges({ branchId: 'br1' }, { branchId: 'br2' }).length);
/* Un champ absent du dictionnaire se tait aussi : mieux vaut taire un détail
   que d'écrire « lastSyncToken: x → y » dans un journal que Yéman doit lire. */
dit('un champ sans nom français se tait', 0,
  champsChanges({ jetonInterne: 1 }, { jetonInterne: 2 }).length);

/* ── ④ LES VALEURS SE LISENT ─────────────────────────────────────── */
dit('un vide se dit « — »',
  [{ champ: 'Téléphone', avant: '—', apres: '229 97 00 00 00' }],
  champsChanges({ phone: '' }, { phone: '229 97 00 00 00' }));
dit('un oui/non se dit en toutes lettres',
  [{ champ: 'Signalée', avant: 'non', apres: 'oui' }],
  champsChanges({ flagged: false }, { flagged: true }));
dit('une liste dit son compte, pas son contenu',
  [{ champ: 'Prestations', avant: '1 élément(s)', apres: '3 élément(s)' }],
  champsChanges({ serviceIds: ['a'] }, { serviceIds: ['a', 'b', 'c'] }));
/* Une pièce POSÉE n'a pas d'avant : la comparaison rend une liste vide plutôt
   que d'inventer « — → tout », qui remplirait l'écran pour ne rien dire. */
dit('une création n’a pas de « champs changés »', 0, champsChanges(undefined, apres).length);

/* ── ⑤ LE DICTIONNAIRE COUVRE L'ARGENT ───────────────────────────── */
/* Ce sont les champs sur lesquels une question se pose vraiment : si l'un
   d'eux manquait au dictionnaire, sa modification serait MUETTE au journal —
   un prix changé sans trace, exactement ce que ce chantier répare. */
for (const c of ['priceXof', 'amountXof', 'discountPct', 'cashbox', 'payment', 'status', 'date', 'tipXof']) {
  dit(`« ${c} » a un nom français`, true, typeof NOM_DES_CHAMPS[c] === 'string');
}

/* ── ⑥ QUI TIENT LA PLUME ────────────────────────────────────────── */
dit('sans identité posée, la main est dite inconnue', 'Main inconnue', identiteCourante().nom);
poseLIdentite({ mail: 'x@mnd.test', nom: 'Yéman B.', porte: 'trone' });
dit('l’identité posée est celle qui signe', 'Yéman B.', identiteCourante().nom);
poseLIdentite({ nom: 'Une cliente', porte: 'couronne' });
dit('un geste de Ma Couronne n’a pas de compte', undefined, identiteCourante().mail);
dit('… et porte sa porte d’entrée', 'couronne', identiteCourante().porte);

/* ── ⑦ LE JOURNAL NE BLOQUE JAMAIS LE COMPTOIR ───────────────────── */
/* L'invariant le plus important du lot. Sans backend — et donc sans table —
   l'inscription doit se taire et rendre la main, jamais jeter : une trace
   manquée ne doit pas faire échouer la vente qu'elle observe. */
let aJete = false;
try {
  await inscrisLesGestes([{
    id: 'g1', quand: '2026-08-21T09:14:00', parNom: 'Yéman B.', porte: 'trone',
    verbe: 'pose', table: 'appointments', ecran: 'Le Carnet',
    pieceId: 'a1', piece: 'Rituel · Diane C.',
  }]);
} catch { aJete = true; }
dit('une inscription sans backend ne jette pas', false, aJete);
dit('une liste vide ne jette pas non plus', false, await inscrisLesGestes([]).then(() => false).catch(() => true));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
