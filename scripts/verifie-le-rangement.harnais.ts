/* ARCHIVER ET SUPPRIMER UNE DISCUSSION, ÉPROUVÉS · 18 novembre 2026.
   `node scripts/verifie-le-rangement.mjs` (et `--prouve`).

   « Il faut la faire exactement comme WhatsApp avec des messages à archiver
   ou supprimer » (Yéman). Tranché au sélecteur : ARCHIVER, toute l'équipe,
   la discussion revient seule à son prochain message ; SUPPRIMER, la
   direction seule, masquée pour toute l'équipe, gardée en base, et si elle
   réécrit, une discussion neuve avec ses seuls nouveaux messages.

   Chaque attente est écrite à la main, d'après la règle, jamais tirée du
   code éprouvé. Têtes et numéros INVENTÉS. Sortie ASCII : la console de
   Windows. */
import { readFileSync } from 'node:fs';
import {
  apresLaSuppression, clesDeRangement, derniereActivite, estArchivee, heureDeLaLigne, marqueLaPlusRecente, poseLaMarque, rangeLesBoites, retireLaMarque,
} from '../src/shared/rangement-des-boites-pur';
import { estArchive } from '../src/shared/conversations';
import type { Boite } from '../src/shared/boite-unique-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const NUM = '2290197000011';
const bulle = (auteur: string, quand: string, i = 0) => ({ id: `${auteur}-${quand}-${i}`, quand, source: 'whatsapp', auteur, texte: 'x', gris: false, de: { table: 'messages_wa', id: `m-${quand}-${i}` } });
const boite = (bulles: ReturnType<typeof bulle>[], o: Partial<Boite> = {}): Boite => ({
  cle: 'c:aw', clientId: 'aw', numero: NUM, nom: 'Awa B.', initiales: 'AB', sansFiche: false, tiroir: 'clientes', canaux: ['whatsapp'],
  bulles: bulles as unknown as Boite['bulles'], derniere: bulles[bulles.length - 1] as unknown as Boite['derniere'],
  derniereDElle: [...bulles].reverse().find((x) => x.auteur === 'elle') as unknown as Boite['derniereDElle'],
  attendUneReponse: true, pourquoi: [], sante: false, enRetard: false, fenetreFermeBientot: false, questionFranche: false, quiALaMain: '', filtres: ['tout'], rangee: false,
  fils: [{ numero: NUM, messages: [] }] as unknown as Boite['fils'], discussions: [], demandes: [], appelsWa: [], appels: [], signalements: [], soucisOuverts: [],
  ...o,
});

/* ── 1. Les clés ── */
dit('les cles d une boite : la sienne, puis le numero reduit de chaque fil, sans doublon', ['c:aw', NUM, '2290197000012'],
  clesDeRangement({ cle: 'c:aw', fils: [{ numero: NUM }, { numero: '+229 01 97 00 00 12' }, { numero: NUM }] as unknown as Boite['fils'] }));
dit('une boite sans fil : sa cle seule', ['d:x1'], clesDeRangement({ cle: 'd:x1', fils: [] }));

/* ── 2. Archiver ── */
const b = boite([bulle('elle', '2026-11-18T08:00:00Z'), bulle('equipe', '2026-11-18T08:05:00Z')]);
dit('la derniere activite : sa bulle la plus recente, dans un sens ou dans l autre', Date.parse('2026-11-18T08:05:00Z'), derniereActivite(b));
dit('sans marque, elle n est pas archivee', false, estArchivee(b, {}));
dit('archivee apres sa derniere bulle : archivee', true, estArchivee(b, { 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
dit('archivee a la seconde meme de sa derniere bulle : archivee', true, estArchivee(b, { 'c:aw': { le: '2026-11-18T08:05:00Z' } }));
dit('les instants se comparent en millisecondes : « .000Z » vaut « Z »', true, estArchivee(b, { 'c:aw': { le: '2026-11-18T08:05:00.000Z' } }));
dit('elle reecrit apres l archive : la discussion revient', false,
  estArchivee(boite([...b.bulles as unknown as ReturnType<typeof bulle>[], bulle('elle', '2026-11-18T10:00:00Z')]), { 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
dit('la Maison ecrit apres l archive : la discussion revient aussi', false,
  estArchivee(boite([...b.bulles as unknown as ReturnType<typeof bulle>[], bulle('equipe', '2026-11-18T10:00:00Z')]), { 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
dit('une archive posee avant ce jour sous le numero seul (15 septembre) vaut pour la boite', true, estArchivee(b, { [NUM]: { le: '2026-11-18T09:00:00Z' } }));
dit('la marque la plus recente des cles l emporte', true, estArchivee(b, { [NUM]: { le: '2026-11-01T00:00:00Z' }, 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
dit('une marque illisible ne range rien', false, estArchivee(b, { 'c:aw': { le: 'hier' } }));
dit('une boite vide ne s archive pas', false, estArchivee(boite([]), { 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
dit('la marque la plus recente se lit en millisecondes', Date.parse('2026-11-18T09:00:00Z'), marqueLaPlusRecente(['c:aw', NUM], { [NUM]: { le: '2026-11-18T09:00:00Z' }, 'c:aw': { le: '2026-11-17T09:00:00Z' } }));

/* ── 3. Supprimer ── */
dit('jamais supprimee : la boite telle quelle', true, apresLaSuppression(b, {}) === b);
dit('supprimee, rien depuis : elle ne se montre plus', null, apresLaSuppression(b, { 'c:aw': { le: '2026-11-18T09:00:00Z' } }));
const neuve = apresLaSuppression(boite([...b.bulles as unknown as ReturnType<typeof bulle>[], bulle('elle', '2026-11-18T11:00:00Z')]), { 'c:aw': { le: '2026-11-18T09:00:00Z' } });
dit('elle reecrit apres la suppression : une discussion neuve, ses seuls nouveaux messages', ['2026-11-18T11:00:00Z'], neuve?.bulles.map((x) => x.quand));
dit('... sa derniere bulle et son dernier mot a elle se relisent sur ce qui reste', ['2026-11-18T11:00:00Z', '2026-11-18T11:00:00Z'], [neuve?.derniere?.quand, neuve?.derniereDElle?.quand]);
const maisonApres = apresLaSuppression(boite([...b.bulles as unknown as ReturnType<typeof bulle>[], bulle('equipe', '2026-11-18T11:00:00Z')]), { 'c:aw': { le: '2026-11-18T09:00:00Z' } });
dit('... la Maison seule a ecrit depuis : son dernier mot a elle d avant ne revient pas', [1, undefined], [maisonApres?.bulles.length, maisonApres?.derniereDElle]);
dit('la suppression posee sous le numero vaut aussi', null, apresLaSuppression(b, { [NUM]: { le: '2026-11-18T09:00:00Z' } }));

/* ── 4. La liste en deux ── */
const autre = boite([bulle('elle', '2026-11-18T07:00:00Z')], { cle: 'c:kk', clientId: 'kk', numero: '22901970000099', fils: [{ numero: '22901970000099', messages: [] }] as unknown as Boite['fils'] });
const vide = boite([bulle('elle', '2026-11-17T07:00:00Z')], { cle: 'c:zz', clientId: 'zz', numero: '22901970000077', fils: [{ numero: '22901970000077', messages: [] }] as unknown as Boite['fils'] });
const r = rangeLesBoites([b, autre, vide], { 'c:aw': { le: '2026-11-18T09:00:00Z' } }, { 'c:zz': { le: '2026-11-18T00:00:00Z' } });
dit('les actives, les archivees ; la supprimee n est ni l une ni l autre', [['c:kk'], ['c:aw']], [r.actives.map((x) => x.cle), r.archivees.map((x) => x.cle)]);
const r2 = rangeLesBoites([b], { 'c:aw': { le: '2026-11-18T09:00:00Z' } }, { 'c:aw': { le: '2026-11-18T09:30:00Z' } });
dit('archivee puis supprimee : plus nulle part, Archivees comprises', [0, 0], [r2.actives.length, r2.archivees.length]);

/* ── 5. Poser, retirer ── */
dit('poser la marque : sous chaque cle, avec qui et quand', { 'c:aw': { le: 'T', par: 'Yeman' }, [NUM]: { le: 'T', par: 'Yeman' } }, poseLaMarque({}, ['c:aw', NUM], 'Yeman', 'T'));
dit('... sans nom, l instant seul ; une cle vide ou « n: » ne s ecrit pas', { 'c:aw': { le: 'T' } }, poseLaMarque(null, ['c:aw', '', 'n:'], undefined, 'T'));
dit('... les autres marques restent', ['c:kk', 'c:aw'], Object.keys(poseLaMarque({ 'c:kk': { le: 'A' } }, ['c:aw'], undefined, 'T')));
dit('desarchiver retire ses cles, et elles seules', { 'c:kk': { le: 'A' } }, retireLaMarque({ 'c:kk': { le: 'A' }, 'c:aw': { le: 'T' }, [NUM]: { le: 'T' } }, ['c:aw', NUM]));
dit('les cles numero restent lisibles par `estArchive` (la cloche, l alarme, le compte de Perle)', true,
  estArchive({ numero: NUM, messages: [{ quand: '2026-11-18T08:00:00Z' }] } as unknown as Parameters<typeof estArchive>[0], poseLaMarque({}, clesDeRangement(b), 'Yeman', '2026-11-18T09:00:00Z')));

/* ── 6. L'heure d'une ligne, comme WhatsApp, l'année sur toute date ── */
const MAINTENANT = Date.parse('2026-11-18T09:00:00Z');
dit('aujourd hui : l heure de Cotonou, ecrite comme la Maison', '8 h 37', heureDeLaLigne('2026-11-18T07:37:00Z', MAINTENANT));
dit('passe minuit a Cotonou, c est aujourd hui : 23 h 30 UTC du 17 est 0 h 30 le 18', '0 h 30', heureDeLaLigne('2026-11-17T23:30:00Z', MAINTENANT));
dit('la veille : « Hier »', 'Hier', heureDeLaLigne('2026-11-17T12:00:00Z', MAINTENANT));
dit('dans les six derniers jours : le jour de la semaine (le 13 novembre 2026 est un vendredi)', 'vendredi', heureDeLaLigne('2026-11-13T12:00:00Z', MAINTENANT));
dit('au-dela : la date, avec l annee', '11/11/2026', heureDeLaLigne('2026-11-11T12:00:00Z', MAINTENANT));
dit('une date illisible : rien', '', heureDeLaLigne('hier', MAINTENANT));

/* ── 7. La lettre : l'écran, le compte du Shell, Perle, l'alarme ── */
const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/LesConversations.tsx'));
const crochet = sansCommentaires(lis('src/apps/trone/shell/useRecus.ts'));
const gerard = sansCommentaires(lis('src/apps/trone/routes/clients/Gerard.tsx'));
const alarme = sansCommentaires(lis('src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx'));
const magasin = lis('src/shared/conversations-supprimees.ts');
dit('les deux documents partages : l archive des fils, la suppression a part', [true, true, true], [
  magasin.includes("createStore<MarquesDesBoites>('mnd_conversations_supprimees', {})"), magasin.includes("bindDocument(conversationsSupprimeesStore, 'mnd_conversations_supprimees')"),
  magasin.includes('filsArchivesStore.set((prev) => poseLaMarque(prev, cles, par, quand))'),
]);
dit('l ecran range les boites par la regle, et garde les fils archives pour « Archivees »', [true, false], [
  ecran.includes('rangeLesBoites(toutesLesBoites, archives, supprimees)'), /estArchive\(f, archives\)/.test(ecran),
]);
dit('archiver : toute l equipe ; supprimer : la direction seule', [true, true, false], [
  /const archive = \(b: Boite\) => \{\s*setMenuLigne\(null\); setMenuConv\(false\);/.test(ecran),
  /const supprime = \(b: Boite\) => \{\s*if \(!estDirection\) return;/.test(ecran),
  /const archive = \(b: Boite\) => \{\s*if \(!estDirection\)/.test(ecran),
]);
dit('« Supprimer la discussion » ne se montre qu a la direction, et demande confirmation', [true, true, true], [
  ecran.includes("{estDirection && <button type=\"button\" role=\"menuitem\" className=\"est-danger\" onClick={() => { setMenuLigne(null); setMenuConv(false); setASupprimer(b); }}>Supprimer la discussion</button>}"),
  ecran.includes('{aSupprimer && estDirection && ('), ecran.includes('onClick={() => supprime(aSupprimer)}>Supprimer</button>'),
]);
dit('le compte des recus du Shell range les boites par la meme regle', [true, true], [
  crochet.includes('rangeLesBoites(boitesBrutes, archives, supprimees).actives'), !/estArchive\(f, archives\)/.test(crochet),
]);
dit('Perle et l alarme du tableau de bord oublient une discussion supprimee', [true, true], [
  gerard.includes('!estArchive(f, archives) && !estArchive(f, supprimees)'), alarme.includes('tous.filter((f) => !estArchive(f, supprimees))'),
]);
dit('pas de tiret cadratin, pas le mot banni, dans le pur et l ecran', [false, false, false, false], [
  lis('src/shared/rangement-des-boites-pur.ts').includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(lis('src/shared/rangement-des-boites-pur.ts')),
  ecran.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(ecran),
]);

console.log(ko === 0 ? `\nLe rangement tient (${n} controles).` : `\n${ko} controle(s) en echec sur ${n}.`);
process.exitCode = ko === 0 ? 0 : 1;
