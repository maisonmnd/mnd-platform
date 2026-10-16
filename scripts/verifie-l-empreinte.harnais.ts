/* ENTRER PAR L'EMPREINTE, ÉPROUVÉ — 16 octobre 2026.

   « Sur la version téléphone du Trône, pouvoir se connecter avec la
   biométrie, comme Ecobank » (Yéman). Maquette 16whsWP5…, choix cochés :
   toute l'équipe ; l'empreinte redemandée à chaque ouverture ET après 5
   minutes hors du Trône ; le téléphone se souvient du compte (prénom,
   e-mail masqué, comme BIIC) ; pas de code en plus ; chacun retire ses
   clés, la direction celles de l'équipe ; l'ordinateur aussi.

   Les attentes sont écrites ici à la main, depuis ces choix et depuis les
   promesses de la maquette : l'empreinte ne quitte pas l'appareil, le mot
   de passe reste la porte de secours, une clé retirée n'ouvre plus rien. */
import { readFileSync } from 'node:fs';
import {
  DELAI_DU_VERROU_MS, compteAGarder, dateDeLaCle, doitProposer, estUneCleRetiree, estUnePanneDeReseau, lisLEmpreinte, lisLeCompte,
  masqueLEmail, messageDeLEmpreinte, nomDeLAppareil, prenomDuCompte, verrouilleALOuverture, verrouilleAuRetour,
} from '../src/shared/empreinte-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ── 1. LE VERROU : à l'ouverture, et après 5 minutes hors du Trône ── */
const T = 1_800_000_000_000;
dit('5 minutes, comme la banque', 300_000, DELAI_DU_VERROU_MS);
dit('a l ouverture : verrouille si l empreinte est activee ici, sinon non', [true, false],
  [verrouilleALOuverture({ activee: true, entreeLe: null, maintenant: T }), verrouilleALOuverture({ activee: false, entreeLe: null, maintenant: T })]);
dit('... sauf si l on vient d entrer (30 s) ; deux minutes apres, l ouverture se reverrouille', [false, true],
  [verrouilleALOuverture({ activee: true, entreeLe: T - 30_000, maintenant: T }), verrouilleALOuverture({ activee: true, entreeLe: T - 120_000, maintenant: T })]);
dit('au retour : 4 min 59 hors du Trone = ouvert ; 5 min = verrouille', [false, true],
  [verrouilleAuRetour({ activee: true, cacheDepuis: T - 299_000, maintenant: T }), verrouilleAuRetour({ activee: true, cacheDepuis: T - 300_000, maintenant: T })]);
dit('... jamais sans empreinte activee, ni sans avoir quitte le Trone', [false, false],
  [verrouilleAuRetour({ activee: false, cacheDepuis: T - 900_000, maintenant: T }), verrouilleAuRetour({ activee: true, cacheDepuis: null, maintenant: T })]);
dit('la proposition : une fois, sur un appareil capable, en ligne, pas deja activee', [true, false, false, false, false],
  [doitProposer({ capable: true, activee: false, dejaProposee: false, enLigne: true }), doitProposer({ capable: false, activee: false, dejaProposee: false, enLigne: true }),
    doitProposer({ capable: true, activee: true, dejaProposee: false, enLigne: true }), doitProposer({ capable: true, activee: false, dejaProposee: true, enLigne: true }),
    doitProposer({ capable: true, activee: false, dejaProposee: false, enLigne: false })]);

/* ── 2. LE COMPTE DONT LE TÉLÉPHONE SE SOUVIENT (comme BIIC) ── */
dit('l e-mail masque : de quoi se reconnaitre, pas de quoi lire l adresse', ['y•••••@gmail.com', 'a•••••@b.bj', ''],
  [masqueLEmail('yemanboya1@gmail.com'), masqueLEmail('a@b.bj'), masqueLEmail('')]);
dit('le prenom : le premier mot du nom, sinon le debut de l e-mail', ['Yéman', 'Brice', ''],
  [prenomDuCompte('Yéman BOYA', 'y@x.bj'), prenomDuCompte(null, 'brice.ahouansou@x.com'), prenomDuCompte('', '')]);
dit('l appareil ne garde QUE le compte, l prenom, l e-mail : jamais un mot de passe ni un jeton', ['email', 'prenom', 'uid'],
  Object.keys(compteAGarder('u1', 'Yéman', 'Y@Exemple.bj ') ?? {}).sort());
dit('... e-mail range en minuscules ; un compte illisible n est pas garde', ['y@exemple.bj', null, null],
  [compteAGarder('u1', 'Yéman', 'Y@Exemple.bj ')?.email, compteAGarder('', 'x', 'a@b.c'), lisLeCompte({ uid: 'u1', email: 'pas-une-adresse' })]);
dit('la cle de l appareil se relit, une cle sans identifiant non', [true, null], [!!lisLEmpreinte({ passkeyId: 'abc', nom: 'n', le: 'l' }), lisLEmpreinte({ nom: 'n' })]);

/* ── 3. LE NOM D'UNE CLÉ : l'appareil qui la porte ── */
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
};
dit('le nom de l appareil : Android (avec son modele quand il le dit), iPhone, ordinateur Windows, Samsung Internet',
  ['Téléphone Android (SM-A546E) · Chrome', 'Téléphone Android · Chrome', 'iPhone · Safari', 'Ordinateur Windows · Edge', 'Téléphone Android · Samsung Internet'],
  [nomDeLAppareil(UA.android, 'SM-A546E'), nomDeLAppareil(UA.android, 'K'), nomDeLAppareil(UA.iphone), nomDeLAppareil(UA.windows), nomDeLAppareil(UA.samsung)]);
dit('les dates d une cle portent l annee', ['16 octobre 2026', '1er janvier 2027', ''], [dateDeLaCle('2026-10-16T12:00:00Z'), dateDeLaCle('2027-01-01T12:00:00Z'), dateDeLaCle(undefined)]);

/* ── 4. CE QUE L'ÉCRAN DIT, et ce que le verrou en fait ── */
const annule = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });
dit('les messages : pas encore allumee, annulee, retiree, pas de reseau', [
  'L’entrée par l’empreinte n’est pas encore allumée côté Maison. Entrez avec le mot de passe.',
  'Empreinte annulée ou non reconnue. Réessayez, ou entrez avec le mot de passe.',
  'Cette clé d’accès a été retirée. Entrez avec le mot de passe, puis réactivez l’empreinte.',
  'Pas de réseau : la Maison ne peut pas vérifier la clé maintenant.',
], [messageDeLEmpreinte({ message: 'Passkeys are disabled', code: 'passkey_disabled' }), messageDeLEmpreinte(annule),
  messageDeLEmpreinte(new Error('Passkey not found')), messageDeLEmpreinte(new TypeError('Failed to fetch'))]);
dit('une cle retiree se reconnait (le verrou ne s ouvre pas) ; une empreinte annulee n est pas une cle retiree', [true, false],
  [estUneCleRetiree(new Error('passkey not found')), estUneCleRetiree(annule)]);
dit('une panne de reseau (et non un refus) fait deverrouiller sur l appareil seul', [true, false, false],
  [estUnePanneDeReseau(new TypeError('Failed to fetch')), estUnePanneDeReseau(annule), estUnePanneDeReseau(new Error('passkey not found'))]);
/* Un REFUS reste un refus, même si son message parle de réseau : sinon l'annuler redemanderait l'empreinte. */
dit('... un refus dont le message parle de reseau reste un refus', false,
  estUnePanneDeReseau(Object.assign(new Error('A network error occurred during the ceremony.'), { name: 'NotAllowedError' })));

/* ── 5. LE CÂBLAGE ── */
const client = sansCommentaires(lis('src/shared/supabase.ts'));
const navig = sansCommentaires(lis('src/shared/empreinte.ts'));
const ecrans = sansCommentaires(lis('src/apps/trone/auth/Empreinte.tsx'));
const porte = sansCommentaires(lis('src/apps/trone/auth/AuthGate.tsx'));
const tete = sansCommentaires(lis('src/apps/trone/shell/Shell.tsx'));
const acces = sansCommentaires(lis('src/apps/trone/routes/systeme/Acces.tsx'));
const fonction = sansCommentaires(lis('supabase/functions/cles-d-acces/index.ts'));
const css = lis('src/apps/trone/auth/auth.css');

dit('le client de connexion a les cles d acces allumees (encore « en essai » chez supabase-js)', true, /experimental: \{ passkey: true \}/.test(client));
dit('la garde se tient entre la porte et le Trone', true, /return <GardeDeLEmpreinte>\{children\}<\/GardeDeLEmpreinte>;/.test(porte));
dit('la connexion : le mot de passe reste toujours (champ et bouton), l empreinte s y ajoute quand elle est activee ici', true,
  /\{mode !== 'oubli' && mode !== 'inscription-code' && \(\s*<Field label=\{mode === 'oubli-code' \? 'Nouveau mot de passe' : 'Mot de passe'\}>/.test(porte)
  && /\{mode === 'connexion' && empreinteIci && \(/.test(porte) && /const empreinteIci = !!compte && !!empreinteDeLAppareil\(compte\.uid\);/.test(porte));
dit('... le compte reconnu remplace l e-mail, et « Changer » l oublie', true,
  /\{mode === 'connexion' && compte && \(\s*<CompteReconnu/.test(porte) && /oublieLeCompte\(\); setCompte\(null\); setEmail\(''\);/.test(porte));
dit('le verrou : l empreinte ouvre, une cle retiree deconnecte (jamais n ouvre), le mot de passe en secours', true,
  /if \(r\.ok\) \{ surDeverrouille\(\); return; \}/.test(ecrans) && /if \(r\.retiree\) \{ oublieLEmpreinte\(uid\); toast\(r\.erreur, 7000\); void signOut\(\); return; \}/.test(ecrans)
  && /await signInEmail\(compte\.email, motDePasse\); surDeverrouille\(\);/.test(ecrans));
dit('... par-dessus tout, et le Trone dessous est inerte (rien ne s y touche, rien ne s y lit au clavier)', true,
  /className="tra-sous-le-verrou" inert=\{verrouille \|\| undefined\} aria-hidden=\{verrouille \|\| undefined\}/.test(ecrans) && /\.tra-verrou \{ position: fixed; inset: 0; z-index: 2147483000;/.test(css));
dit('... a l ouverture et apres 5 minutes hors du Trone (le retour au premier plan)', true,
  /verrouilleALOuverture\(\{ activee: !!empreinteDeLAppareil\(uid\), entreeLe: entreeLe\(\), maintenant: Date\.now\(\) \}\)/.test(navig)
  && /document\.addEventListener\('visibilitychange', change\)/.test(navig) && /verrouilleAuRetour\(\{ activee, cacheDepuis: cacheDepuis\.current, maintenant: Date\.now\(\) \}\)/.test(navig));
dit('sans reseau, le telephone seul : la preuve d empreinte EXIGE la verification, et seulement sur une session deja gardee', true,
  /userVerification: 'required'/.test(navig) && /if \(!o\.sessionGardee\) return \{ ok: false/.test(navig) && /estUnePanneDeReseau\(error\) \? surLAppareil\(\)/.test(navig));
dit('l appareil ne garde jamais un mot de passe : aucune ecriture locale n en porte', false, /ecris\([^)]*(password|motDePasse|mdp)/i.test(navig));
dit('rien n est propose tant que la Maison n a pas allume les cles d acces (Supabase) : publier avant l interrupteur ne fait rien echouer', true,
  /setProposer\(allumees && doitProposer\(/.test(ecrans) && /return r\.passkeys_enabled === true;/.test(navig));
dit('chacun ses cles (liste, retrait) ; la direction celles de l equipe, dans Acces & roles', true,
  /supabase\.auth\.passkey\.list\(\)/.test(navig) && /supabase\.auth\.passkey\.delete\(\{ passkeyId \}\)/.test(navig)
  && /<LesClesDeLEquipe \/>/.test(acces) && /<BoutonDesCles className="tr-top__bell" \/>/.test(tete));
dit('la fonction de la direction : souverain ou gerant seulement, l equipe seulement, identifiants verifies', true,
  /if \(role !== 'souverain' && role !== 'gerant'\) return json\(/.test(fonction) && /if \(!membres\.some\(\(m\) => m\.user_id === userId\)\) return json\(/.test(fonction)
  && /if \(!UUID\.test\(userId\) \|\| !UUID\.test\(passkeyId\)\) return json\(/.test(fonction));
dit('... la cle de service reste au serveur : aucun ecran du Trone ne la nomme', false,
  [navig, ecrans, porte, client].some((s) => /SERVICE_KEY|service_role/i.test(s)));

console.log(ko ? `\n${ko} ECHEC(S)` : '\nEntrer par l empreinte : tout tient.');
if (ko) process.exitCode = 1;
