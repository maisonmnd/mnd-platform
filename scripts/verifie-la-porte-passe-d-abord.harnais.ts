/* LA PORTE PASSE D'ABORD, ÉPROUVÉE — 25 septembre 2026.

   « À chaque fois que je me connecte au Trône j'ai un sérieux problème, le
   message revient trois ou quatre fois avant que ça me connecte » (Yéman, sur
   un téléphone à Cotonou).

   La porte n'était pas lente : elle était NOYÉE. Cent dix-huit magasins
   demandent leur contenu dès que la session est connue, tous à la même
   seconde ; sa petite lecture se battait contre eux pour la bande passante,
   dépassait sa borne, et l'écran annonçait une panne pendant que le réseau
   travaillait.

   CE HARNAIS TIENT LA RÈGLE, PAS LE CAS DU JOUR :

     ① les magasins attendent que la porte ait répondu ;
     ② une porte qui ne répond JAMAIS ne les bloque pas pour autant — la
        priorité ne doit pas pouvoir se retourner en famine ;
     ③ une fois la porte passée, plus personne n'attend ;
     ④ et `sync.ts` appelle bien cette attente avant sa rafale, sinon la
        priorité n'existe que dans les commentaires.

   Lancer : node scripts/verifie-la-porte-passe-d-abord.mjs */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attendsLaPorte, laPorteARepondu } from '../src/shared/auth';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const chrono = async (f: () => Promise<unknown>): Promise<number> => {
  const t = Date.now();
  await f();
  return Date.now() - t;
};

/* ── ① et ② UNE PORTE MUETTE NE BLOQUE PAS ────────────────────────────
   Personne n'a encore appelé `laPorteARepondu` : l'attente doit rendre la
   main d'elle-même, à sa borne. C'est le contraire d'un verrou.
   La borne est PASSÉE EN PARAMÈTRE : un banc ne se règle pas sur la valeur
   par défaut du code qu'il éprouve, sinon il s'accorde toujours. */
const borne = 120;
const attendu = await chrono(() => attendsLaPorte(borne));
dit('une porte muette rend la main à sa borne', true, attendu >= borne - 30);
dit('… et pas beaucoup plus tard', true, attendu < borne + 400);

/* ── ③ UNE FOIS PASSÉE, PLUS PERSONNE N'ATTEND ────────────────────────
   Le signal est définitif : les magasins qui arrivent après ne paient rien.
   Sans cela, chaque retour de focus rejouerait l'attente. */
laPorteARepondu();
const apres = await chrono(() => attendsLaPorte(5000));
dit('la porte passée, l’attente est immédiate', true, apres < 50);
const encore = await chrono(() => attendsLaPorte(5000));
dit('… et elle le reste aux appels suivants', true, encore < 50);

/* ── ④ LA PRIORITÉ EXISTE DANS LE CODE, PAS SEULEMENT EN COMMENTAIRE ──
   On lit la lettre du fichier : la rafale des magasins doit passer par
   l'attente. Un jour où quelqu'un remettra `void refetch(true)` en direct, la
   panne reviendra sans qu'aucun écran ne le dise. */
const racine = process.cwd();
const sync = readFileSync(path.join(racine, 'src/shared/sync.ts'), 'utf8');
/* Les commentaires sont ôtés AVANT de lire : une phrase qui parle de
   `attendsLaPorte` ne prouve pas qu'on l'appelle. */
const code = sync.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
dit('sync.ts importe l’attente', true, /import \{ attendsLaPorte \} from '\.\/auth'/.test(code));
dit('… et la pose devant sa rafale', true,
  /attendsLaPorte\(\)\.then\(\(\) => refetch\(true\)\)/.test(code));
dit('… sans avoir laissé une rafale en direct', 0,
  (code.match(/^\s*(?:if \([^)]*\) )?void refetch\(true\);\s*$/gm) ?? []).length);

/* LES DEUX CHEMINS, PAS UN SEUL. Les collections se relisent par `refetch`,
   les documents par `hydrate` : ils forment la MÊME rafale. N'en retenir
   qu'une moitié ne libère rien, et c'est l'erreur que ce contrôle a attrapée
   le jour même où il a été écrit. */
dit('les documents attendent la porte eux aussi', true,
  /attendsLaPorte\(\)\.then\(\(\) => hydrate\(premier\)\)/.test(code));
dit('… sans hydratation laissée en direct', 0,
  (code.match(/^\s*void hydrate\(premier\);\s*$/gm) ?? []).length);

/* ── ⑤ LA BORNE DE LA PORTE ELLE-MÊME ─────────────────────────────────
   Quinze secondes, et non huit : sur une connexion mobile lente, huit
   transformaient un réseau lent en panne. C'est un garde-fou contre une
   requête qui pend, pas un réglage de confort. */
const auth = readFileSync(path.join(racine, 'src/shared/auth.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const m = auth.match(/DELAI_DE_LA_PORTE_MS = (\d+)/);
dit('la borne de la porte laisse le temps à un téléphone', true,
  !!m && Number(m[1]) >= 12000);

/* ── ⑥ UN SEUL ALLER-RETOUR ───────────────────────────────────────────
   `loadStaff` demandait au serveur QUI est connecté avant de lire sa fiche :
   deux latences en série pour une réponse que la session portait déjà. */
dit('loadStaff accepte l’identifiant qu’on lui donne', true,
  /export async function loadStaff\(uidConnu\?: string\)/.test(auth));
dit('… et ne redemande au serveur qu’à défaut', true,
  /uidConnu \|\| \(await sb\.auth\.getUser\(\)\)/.test(auth));
const gate = readFileSync(path.join(racine, 'src/apps/trone/auth/AuthGate.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
dit('la porte passe l’identifiant qu’elle a déjà', true,
  /loadStaff\(session\?\.user\?\.id\)/.test(gate));

/* ── ⑥ bis LA PORTE ÉMET BIEN SON SIGNAL ──────────────────────────────
   CE CONTRÔLE COMBLE UN TROU, ET LE TROU MÉRITE D'ÊTRE RACONTÉ. En remettant
   les pannes une à une, celle-ci n'a rien déclenché : le harnais appelait
   `laPorteARepondu` lui-même pour éprouver l'attente, sans jamais vérifier que
   `loadStaff` l'appelle. On pouvait donc retirer le signal du code, et les
   magasins auraient attendu leur borne entière à chaque session, sans un mot.

   On ne peut pas l'éprouver en l'exécutant : sans clefs, `loadStaff` rend null
   avant même d'entrer dans son `try`. On lit donc la lettre du fichier,
   commentaires ôtés, pour qu'une phrase ne passe pas pour un appel. */
dit('loadStaff signale qu’elle a répondu, quoi qu’elle réponde', true,
  /finally \{[^}]*laPorteARepondu\(\);[^}]*\}/.test(auth));

/* ── ⑦ LE PREMIER RATAGE NE CRIE PAS ──────────────────────────────────
   L'écran d'alerte partait à la première seconde de silence, alors que la
   porte allait réessayer et passer. Il ne vient qu'au second. */
dit('l’écran d’alerte attend le second ratage', true,
  /state === 'panne' && pannes < 2/.test(gate));

console.log(ko === 0 ? '\nLa porte passe d’abord.' : `\n${ko} contrôle(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
