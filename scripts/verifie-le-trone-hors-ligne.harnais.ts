/* LE TRÔNE HORS LIGNE, ÉPROUVÉ SANS NAVIGATEUR — `node scripts/verifie-le-trone-hors-ligne.mjs`.

   4 octobre 2026, maquette « Le Trône hors ligne », temps 2. La preuve dans un
   vrai Chrome est le banc `banc-trone-hors-ligne.mjs` ; ce harnais tient, sans
   navigateur, ce qui peut dériver en silence :
     - la règle des 7 jours, pour la bonne personne seulement ;
     - la tête gardée ne sert qu'à celle dont la connexion est récente ;
     - le service garde ses repères, et la construction les remplit ;
     - le Trône et LOKAA enregistrent le service dès l'ouverture. */
import { readFileSync } from 'node:fs';
import { dansLeDelai, sessionHorsLigneValable, garderLaTete, teteGardee, noteLaConnexionEnLigne, oublieLeHorsLigne, JOURS_HORS_LIGNE } from '../src/shared/hors-ligne';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const J = 86_400_000;
const maintenant = Date.parse('2026-10-04T12:00:00Z');
const ilYa = (jours: number) => new Date(maintenant - jours * J).toISOString();

/* 1. Le délai. */
dit('7 jours, c est la regle', 7, JOURS_HORS_LIGNE);
dit('hier : dans le delai', true, dansLeDelai(ilYa(1), maintenant));
dit('6 jours et 23 h : encore', true, dansLeDelai(new Date(maintenant - 7 * J + 3_600_000).toISOString(), maintenant));
dit('8 jours : hors delai', false, dansLeDelai(ilYa(8), maintenant));
dit('une date du futur (horloge folle) ne vaut pas', false, dansLeDelai(ilYa(-2), maintenant));
dit('rien de note : hors delai', false, dansLeDelai(undefined, maintenant));

/* 2. La session hors ligne : la bonne personne, connectée en ligne il y a moins de 7 jours. */
const stockee = { user: { id: 'u1' } };
dit('meme personne, connexion d hier : la session vaut', 'u1', sessionHorsLigneValable({ stockee, notee: { uid: 'u1', le: ilYa(1) }, maintenant }));
dit('connexion notee pour une AUTRE personne : non', null, sessionHorsLigneValable({ stockee, notee: { uid: 'u2', le: ilYa(1) }, maintenant }));
dit('connexion de plus de 7 jours : non', null, sessionHorsLigneValable({ stockee, notee: { uid: 'u1', le: ilYa(9) }, maintenant }));
dit('aucune session laissee : non', null, sessionHorsLigneValable({ stockee: null, notee: { uid: 'u1', le: ilYa(1) }, maintenant }));

/* 3. La tête gardée (sur le stockage de l'appareil). */
noteLaConnexionEnLigne('u1');
garderLaTete('u1', { role: 'souverain' });
dit('la tete gardee sert a la personne connectee recemment', { role: 'souverain' }, teteGardee('u1'));
dit('... jamais a une autre', null, teteGardee('u2'));
dit('... ni au-dela de 7 jours', null, teteGardee('u1', Date.now() + 8 * J));
oublieLeHorsLigne();
dit('se deconnecter efface la tete gardee', null, teteGardee('u1'));

/* 4. Le câblage. */
const sw = readFileSync('public/sw.js', 'utf8');
dit('le service porte ses deux reperes, que la construction remplit', true,
  sw.includes("const BUILD = '__MND_BUILD__';") && sw.includes('const A_GARDER = /*__MND_A_GARDER__*/[];'));
dit('... il ne garde rien en developpement', true, /const ACTIF = !BUILD\.startsWith\('__'\);/.test(sw) && /if \(!ACTIF\) return;/.test(sw));
dit('... il ne touche ni a Supabase ni a un autre domaine', true, /url\.origin !== self\.location\.origin/.test(sw));
dit('... la page : le reseau d abord, la copie sinon', true, /req\.mode === 'navigate'[\s\S]*?avecDelai\(fetch\(req\), DELAI_PAGE_MS\)[\s\S]*?caches\.match\(page\)/.test(sw));
const build = readFileSync('scripts/build-sites.mjs', 'utf8');
dit('la construction remplit le service de chaque site', true, /const garde = injecteLeService\(dist, BUILD_ID\);/.test(build));
for (const app of ['trone', 'lokaa']) {
  const main = readFileSync(`src/apps/${app}/main.tsx`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  dit(`${app} enregistre le service des l ouverture`, true, /^void registerSW\(\);$/m.test(main));
}
const auth = readFileSync('src/shared/auth.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('sans reponse en 4 s et serveur injoignable, la session gardee ouvre', true, /setTimeout\(\(\) => \{\s*if \(repondu \|\| !state\.loading\) return;[\s\S]*?serveurInjoignable\(\)[\s\S]*?\}, 4000\);/.test(auth));

console.log(ko === 0 ? '\nLe Trone sait s ouvrir sans reseau.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
