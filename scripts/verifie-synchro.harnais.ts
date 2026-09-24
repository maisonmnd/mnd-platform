/* LA SYNCHRO, ÉPROUVÉE — `node scripts/verifie-synchro.mjs`.

   « Synchro en échec · appointments, serveur injoignable » (Yéman, 7 septembre
   2026), alors que le serveur répondait en 0,6 s au moment où il le lisait.
   Un raté réseau n'avait aucune reprise : la table restait rouge jusqu'au
   prochain geste. On juge ici ce qui est pur — le classement d'un message en
   cause lisible, ce qui se retente, et l'espacement des reprises. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/* ── UNE VALEUR ABSENTE N'EST PAS UNE COLONNE ABSENTE ──────────────
   24 septembre 2026. Les deux messages de Postgres portent le mot
   « column », et les deux gestes sont opposés : coller une migration, ou
   corriger ce que l'application écrit. La phrase d'avant disait « colonne
   manquante » pour les deux, et a envoyé chercher une migration qui avait
   bien été collée. La table `demandes` refusait TOUTE écriture du Trône
   parce que son `genre`, `not null` sans défaut, n'était jamais fourni. */
dit('une valeur obligatoire absente se dit comme telle',
  'valeur obligatoire absente, l’application n’écrit pas cette colonne',
  raisonLisible('null value in column "genre" of relation "demandes" violates not-null constraint'));
dit('… et la colonne vraiment absente garde sa phrase',
  'colonne manquante, le schéma de la table ne correspond pas',
  raisonLisible("PGRST204: Could not find the 'genre' column of 'demandes' in the schema cache"));
dit('… les deux ne se confondent plus', false,
  raisonLisible('null value in column "genre" violates not-null constraint')
    === raisonLisible('PGRST204: could not find the column'));
dit('… et ne se retente pas', false, estPassager('PGRST205'));
dit('une contrainte violée ne se retente pas', false, estPassager('insert violates foreign key constraint'));
dit('une session expirée ne se retente pas', false, estPassager('JWT expired'));
dit('un refus sans message ne se retente pas', false, estPassager(undefined));
dit('… et se lit quand même', 'refus du serveur, sans message', raisonLisible(''));

/* ── ③ AUCUNE RÈGLE NE DOIT ÊTRE MANGÉE PAR CELLE D'AU-DESSUS ──────
   24 septembre 2026, après DEUX fautes de la même famille en un jour :
   « column » attrapait aussi bien une colonne absente qu'une valeur absente,
   et « schema cache » attrapait le message de PGRST204 avant que sa propre
   règle ne soit atteinte. Dans les deux cas, la phrase lue au comptoir
   envoyait faire le mauvais geste : coller une migration déjà collée.

   Les cas nommés ne suffisent pas, puisque la faute naît d'un mot AJOUTÉ
   plus tard. On tient donc la règle générale : CHAQUE MOT que `raisonLisible`
   cherche est exercé par un VRAI message du serveur, et rend la phrase de SA
   règle, pas celle d'une règle du dessus. Les mots sont lus dans le fichier,
   commentaires effacés — les commentaires citent justement les messages
   fautifs, et un exemple dans une explication n'est pas une règle.

   Ajouter un mot à `raisonLisible` sans donner ici son vrai message fait
   échouer ce harnais. C'est voulu : un mot approché ne prouve rien, c'est un
   vrai message qui a révélé les deux fautes. */
const sourceSync = readFileSync(join(process.cwd(), 'src/shared/sync.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
  .replace(/^[ \t]*\/\/.*$/gm, '');
const corps = sourceSync.slice(
  sourceSync.indexOf('export function raisonLisible'),
  sourceSync.indexOf('export const estPassager'),
);
/** Chaque mot cherché, avec la phrase de la PREMIÈRE règle qui le contient :
    c'est celle qu'un message ne portant que ce mot doit atteindre. */
const phraseDuMot = new Map<string, string>();
for (const regle of corps.matchAll(/if \(([\s\S]*?)\) \{\s*return '([^']*)';/g)) {
  for (const mot of regle[1].matchAll(/m\.includes\('([^']+)'\)/g)) {
    if (!phraseDuMot.has(mot[1])) phraseDuMot.set(mot[1], regle[2]);
  }
}
dit('les règles de raisonLisible se lisent dans le fichier', true, phraseDuMot.size >= 15);

/** UN VRAI MESSAGE PAR MOT, copié de Postgres, de PostgREST ou du navigateur. */
const VRAIS_MESSAGES: Record<string, string> = {
  pgrst204: "PGRST204: Could not find the 'genre' column of 'demandes' in the schema cache",
  pgrst205: "PGRST205: Could not find the table 'public.demandes' in the schema cache",
  'does not exist': 'relation "public.demandes" does not exist',
  'schema cache': "Could not find the table 'public.envois' in the schema cache",
  'null value in column': 'null value in column "genre" of relation "demandes" violates not-null constraint',
  'not-null constraint': 'violates not-null constraint',
  column: 'column "devise" of relation "invoices" cannot be cast automatically to type numeric',
  'violates foreign key': 'insert or update on table "appointments" violates foreign key constraint "appointments_branch_id_fkey"',
  'violates check': 'new row for relation "demandes" violates check constraint "demandes_genre_check"',
  'duplicate key': 'duplicate key value violates unique constraint "demandes_pkey"',
  'failed to fetch': 'TypeError: Failed to fetch',
  'load failed': 'TypeError: Load failed',
  'fetch failed': 'fetch failed',
  networkerror: 'NetworkError when attempting to fetch resource.',
  'network request failed': 'Network request failed',
  timeout: 'upstream request timeout',
  'timed out': 'The operation timed out',
  econnreset: 'read ECONNRESET',
  gateway: '502 Bad Gateway',
  jwt: 'invalid JWT: unable to parse or verify signature',
  expired: 'Session expired',
};
dit('chaque mot cherché a son vrai message ici', [],
  [...phraseDuMot.keys()].filter((mot) => !VRAIS_MESSAGES[mot]));
dit('… et aucun message ne traîne pour un mot disparu', [],
  Object.keys(VRAIS_MESSAGES).filter((mot) => !phraseDuMot.has(mot)));
for (const [mot, phrase] of phraseDuMot) {
  const vrai = VRAIS_MESSAGES[mot];
  if (vrai) dit(`« ${mot} » atteint sa propre règle`, phrase, raisonLisible(vrai));
}

/* ── ④ L'ESPACEMENT DES REPRISES ───────────────────────────────────
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
