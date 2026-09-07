/* LA SYNCHRO, ÉPROUVÉE — `node scripts/verifie-synchro.mjs`.

   « Synchro en échec · appointments, serveur injoignable » (Yéman, 7 septembre
   2026), alors que le serveur répondait en 0,6 s au moment où il le lisait.
   Un raté réseau n'avait aucune reprise : la table restait rouge jusqu'au
   prochain geste. On juge ici ce qui est pur — le classement d'un message en
   cause lisible, ce qui se retente, et l'espacement des reprises. */
import { DELAIS_DE_REPRISE_MS, delaiDeReprise, estPassager, raisonLisible } from '../src/shared/sync';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① TOUS LES VISAGES D'UN RÉSEAU QUI MANQUE ──────────────────────
   Chrome, Safari, Node et une passerelle qui tombe ne disent pas la même
   phrase. Ne reconnaître que l'une d'elles envoyait les autres dans « refus du
   serveur », donc jamais retentées. */
for (const m of ['TypeError: Failed to fetch', 'Load failed', 'fetch failed', 'NetworkError when attempting to fetch resource.',
  'Network request failed', 'The operation timed out', 'read ECONNRESET', '502 Bad Gateway', 'HTTP 503', 'Gateway Timeout 504']) {
  dit(`« ${m} » est un serveur injoignable`, 'serveur injoignable', raisonLisible(m));
}
/* … ET UN NUMÉRO DANS UN AUTRE CONTEXTE N'EN EST PAS UN : « 5030 » n'est pas
   un code HTTP. */
dit('un nombre qui contient 503 n’est pas une passerelle', false, estPassager('ligne 15030 refusée'));

/* ── ② CE QUI NE GUÉRIT PAS EN ATTENDANT NE SE RETENTE PAS ─────────
   Une table absente, une colonne qui manque, une contrainte violée, une
   session expirée : retenter ferait clignoter la pastille pour rien et
   cacherait qu'un humain doit agir. */
dit('une table absente attend une migration', 'table absente en base, une migration n’a pas été collée',
  raisonLisible('PGRST205: relation "x" does not exist in schema cache'));
dit('… et ne se retente pas', false, estPassager('PGRST205'));
dit('une contrainte violée ne se retente pas', false, estPassager('insert violates foreign key constraint'));
dit('une session expirée ne se retente pas', false, estPassager('JWT expired'));
dit('un refus sans message ne se retente pas', false, estPassager(undefined));
dit('… et se lit quand même', 'refus du serveur, sans message', raisonLisible(''));

/* ── ③ L'ESPACEMENT DES REPRISES ───────────────────────────────────
   Trois secondes de coupure se rattrapent au premier essai ; une panne d'une
   heure ne mérite pas d'être martelée. On espace, et l'on plafonne. */
dit('quatre paliers', 4, DELAIS_DE_REPRISE_MS.length);
dit('le premier essai est rapide', 5_000, delaiDeReprise(0));
dit('… puis on espace', [15_000, 45_000, 120_000], [delaiDeReprise(1), delaiDeReprise(2), delaiDeReprise(3)]);
dit('… et on plafonne à deux minutes', 120_000, delaiDeReprise(40));
dit('un essai négatif vaut le premier', 5_000, delaiDeReprise(-3));
dit('les paliers vont croissant', true,
  DELAIS_DE_REPRISE_MS.every((d, i) => i === 0 || d > DELAIS_DE_REPRISE_MS[i - 1]));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
