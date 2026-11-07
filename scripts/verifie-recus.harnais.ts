/* LES REÇUS DES CONVERSATIONS, ÉPROUVÉS · 6 novembre 2026.
   `node scripts/verifie-recus.mjs` (et `--prouve`).

   « Je ne remarque jamais quand j'ai de nouveaux messages qui arrivent dans
   la conversation. C'est toujours mélangé avec le tout. » (Yéman). La règle
   validée : une boîte est REÇUE quand son dernier message est d'elle
   (WhatsApp, chat du site, vocal, demande, Ma Couronne) et qu'aucune
   personne de la Maison ne l'a ouverte depuis ; Perle qui répond ne la fait
   pas sortir, on le dit ; la plus récente en tête ; « lu » s'écrit dans un
   document partagé, jamais depuis Perle, l'automate ou un modèle ; le compte
   sur la barre, l'onglet du navigateur et la pastille du haut, sans
   sonnerie de plus.

   Chaque attente est écrite à la main, d'après la règle, jamais tirée du
   code éprouvé. Têtes et numéros INVENTÉS. Sortie ASCII : la console de
   Windows. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEBUT_DES_RECUS, SOURCES_RECUES, VOIX_DE_PERLE, aMarquer, adresseDeLaBoite, dernierMessageDElle, heureRecueDite, isoALire,
  motDeLaPastille, plusRecente, recuDe, recusDesBoites, titreDeBase, titreDeLOnglet, titreDesRecus,
} from '../src/shared/recus-pur';
import { boitesDeLaMaison, type Boite } from '../src/shared/boite-unique-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* Cotonou est a UTC+1 : 21 h a Cotonou, c'est 20 h UTC. */
const aCotonou = (jour: string, heure: string): string => new Date(Date.parse(`${jour}T${heure}:00+01:00`)).toISOString();
const SOIR = '2026-11-06';
const bulle = (auteur: string, quand: string, source = 'whatsapp', i = 0) => ({ id: `${auteur}-${source}-${quand}-${i}`, quand, source, auteur, texte: 'x', gris: false, de: { table: 'messages_wa', id: `m-${quand}-${i}` } });
const boite = (bulles: ReturnType<typeof bulle>[], o: Partial<Boite> = {}): Boite => ({
  cle: 'c:k1', nom: 'K. T.', numero: '22990000011', bulles, ...o,
} as unknown as Boite);
const cles = (l: { cle: string }[]) => l.map((x) => x.cle);

/* ── 1. Recue : son dernier message, que personne n'a ouvert ───────────── */
const h2124 = aCotonou(SOIR, '21:24');
const h2130 = aCotonou(SOIR, '21:30');
dit('son dernier message, ce soir, sans aucune lecture : recue, un message, son instant',
  { cle: 'c:k1', quand: h2124, nombre: 1, perleARepondu: false },
  (({ cle, quand, nombre, perleARepondu }) => ({ cle, quand, nombre, perleARepondu }))(recuDe(boite([bulle('elle', h2124)]), {})!));
dit('trois messages d elle a la suite : le nombre est trois', 3,
  recuDe(boite([bulle('elle', aCotonou(SOIR, '21:00'), 'whatsapp', 1), bulle('elle', aCotonou(SOIR, '21:10'), 'whatsapp', 2), bulle('elle', h2124)]), {})?.nombre);
dit('lue a l instant de son dernier message : plus recue ; un message apres la lecture : recue, et le nombre ne compte que lui', [null, 1], [
  recuDe(boite([bulle('elle', h2124)]), { 'c:k1': h2124 }),
  recuDe(boite([bulle('elle', aCotonou(SOIR, '21:00'), 'whatsapp', 1), bulle('elle', h2124), bulle('elle', h2130, 'whatsapp', 3)]), { 'c:k1': h2124 })?.nombre,
]);
dit('la lecture se compare en millisecondes, jamais en texte (la meme minute ecrite en Z et en +01:00)', null,
  recuDe(boite([bulle('elle', '2026-11-06T21:24:00+01:00')]), { 'c:k1': '2026-11-06T20:24:00.000Z' }));
dit('une lecture illisible ne vaut pas lecture', 'c:k1', recuDe(boite([bulle('elle', h2124)]), { 'c:k1': 'hier' })?.cle);
dit('la lecture d une autre boite ne compte pas', 'c:k1', recuDe(boite([bulle('elle', h2124)]), { 'c:autre': h2130 })?.cle);

/* ── 2. Qui la fait sortir : une personne, jamais Perle ────────────────── */
dit('une personne de l equipe a ecrit apres elle : plus recue', null, recuDe(boite([bulle('elle', h2124), bulle('equipe', h2130)]), {}));
dit('Perle (l assistant) a repondu apres elle : RESTE recue, et on le dit', [true, 'c:k1'],
  (() => { const r = recuDe(boite([bulle('elle', h2124), bulle('assistant', h2130)]), {}); return [r?.perleARepondu, r?.cle]; })());
dit('l automate a repondu apres elle : reste recue, « Perle a repondu »', true, recuDe(boite([bulle('elle', h2124), bulle('automate', h2130)]), {})?.perleARepondu);
dit('un modele parti seul ou le chat automatique : reste recue, sans « Perle a repondu »', [false, false], [
  recuDe(boite([bulle('elle', h2124), bulle('modele', h2130)]), {})?.perleARepondu,
  recuDe(boite([bulle('elle', h2124), bulle('chat', h2130, 'chat')]), {})?.perleARepondu,
]);
dit('Perle avant son message ne compte pas pour « Perle a repondu »', false, recuDe(boite([bulle('assistant', aCotonou(SOIR, '21:00')), bulle('elle', h2124)]), {})?.perleARepondu);
dit('l equipe avant, elle apres : recue, et le nombre part de la main de l equipe', 2,
  recuDe(boite([bulle('elle', aCotonou(SOIR, '20:00'), 'whatsapp', 1), bulle('equipe', aCotonou(SOIR, '21:00')), bulle('elle', h2124, 'whatsapp', 2), bulle('elle', h2130, 'whatsapp', 3)]), {})?.nombre);
dit('les voix de Perle sont l assistant et l automate, rien d autre', ['assistant', 'automate'], [...VOIX_DE_PERLE].sort());

/* ── 3. Ce qui est un message d elle ──────────────────────────────────── */
dit('WhatsApp, chat du site, vocal, demande, Ma Couronne : recus ; un appel note n est pas un message', [true, true, true, true, true, false], [
  ...['whatsapp', 'chat', 'vocal', 'demande', 'couronne'].map((s) => recuDe(boite([bulle('elle', h2124, s)]), {}) !== null),
  recuDe(boite([bulle('elle', h2124, 'appel')]), {}) !== null,
]);
dit('les sources recues, exactement', ['chat', 'couronne', 'demande', 'vocal', 'whatsapp'], [...SOURCES_RECUES].sort());
dit('un appel apres son message ne change ni l instant ni le nombre', [h2124, 1],
  (() => { const r = recuDe(boite([bulle('elle', h2124), bulle('elle', h2130, 'appel')]), {}); return [r?.quand, r?.nombre]; })());
dit('le dernier message d elle et l ISO a lire sautent l appel et la Maison', [h2124, h2124],
  [dernierMessageDElle(boite([bulle('elle', h2124), bulle('elle', h2130, 'appel'), bulle('equipe', h2130)]))?.quand, isoALire(boite([bulle('elle', h2124), bulle('assistant', h2130)]))]);
dit('rien d elle : rien a lire, rien de recu', [undefined, null], [isoALire(boite([bulle('equipe', h2124)])), recuDe(boite([bulle('equipe', h2124)]), {})]);
dit('un demarcheur trie (bloque ou proposition) ne se recoit pas', null, recuDe(boite([bulle('elle', h2124)], { tri: { etat: 'bloque' } as never }), {}));

/* ── 4. Rien d avant ce soir ──────────────────────────────────────────── */
dit('le seuil est minuit a Cotonou, le 6 novembre 2026', '2026-11-05T23:00:00.000Z', new Date(Date.parse(DEBUT_DES_RECUS)).toISOString());
dit('un message du 5 novembre au soir ne se recoit pas ; celui de minuit une, si', [null, 'c:k1'], [
  recuDe(boite([bulle('elle', aCotonou('2026-11-05', '23:59'))]), {}),
  recuDe(boite([bulle('elle', aCotonou(SOIR, '00:01'))]), {})?.cle,
]);
dit('le nombre ne compte pas les messages d avant le seuil', 1,
  recuDe(boite([bulle('elle', aCotonou('2026-11-05', '20:00'), 'whatsapp', 1), bulle('elle', h2124)]), {})?.nombre);

/* ── 5. La plus recente en tete ───────────────────────────────────────── */
const troisBoites = [
  boite([bulle('elle', aCotonou(SOIR, '09:24'))], { cle: 'c:a', nom: 'A. A.' }),
  boite([bulle('elle', h2130)], { cle: 'c:b', nom: 'B. B.' }),
  boite([bulle('elle', aCotonou(SOIR, '18:40'))], { cle: 'c:c', nom: 'C. C.' }),
  boite([bulle('elle', h2124), bulle('equipe', h2130)], { cle: 'c:d', nom: 'D. D.' }),
];
dit('trois recues, la plus recente en tete ; la quatrieme a eu sa reponse', ['c:b', 'c:c', 'c:a'], cles(recusDesBoites(troisBoites, {})));
dit('la pastille de la barre ouvre la plus recente', 'c:b', plusRecente(recusDesBoites(troisBoites, {}))?.cle);
dit('ouvrir la plus recente la fait sortir, la suivante prend la tete', ['c:c', 'c:a'], cles(recusDesBoites(troisBoites, { 'c:b': h2130 })));
dit('aucune recue : pas de plus recente', undefined, plusRecente([]));

/* ── 6. Lu : quoi ecrire, et quand ───────────────────────────────────── */
dit('ecrire quand rien n est marque ; pas quand c est deja marque a cet instant ou plus tard ; oui quand c est plus recent', [true, false, false, true], [
  aMarquer({}, 'c:k1', h2124), aMarquer({ 'c:k1': h2124 }, 'c:k1', h2124), aMarquer({ 'c:k1': h2130 }, 'c:k1', h2124), aMarquer({ 'c:k1': h2124 }, 'c:k1', h2130),
]);
dit('jamais une ISO illisible ni vide, jamais sans cle', [false, false, false], [aMarquer({}, 'c:k1', 'tout a l heure'), aMarquer({}, 'c:k1', undefined), aMarquer({}, '', h2124)]);
dit('une marque illisible se remplace', true, aMarquer({ 'c:k1': 'hier' }, 'c:k1', h2124));

/* ── 7. Les mots ─────────────────────────────────────────────────────── */
const maintenant = Date.parse(aCotonou(SOIR, '21:45'));
/* Le 6 novembre 2026 est un vendredi : le mardi est le 3, le 4 est un mercredi. */
dit('« 9 h 24 » le jour meme ; « hier 18 h 40 » ; « mar. 3 nov. », « mer. 4 nov. » avant ; « 21 h 05 » garde son zero',
  ['9 h 24', 'hier 18 h 40', 'mar. 3 nov.', 'mer. 4 nov.', '21 h 05'],
  [heureRecueDite(aCotonou(SOIR, '09:24'), maintenant), heureRecueDite(aCotonou('2026-11-05', '18:40'), maintenant),
    heureRecueDite(aCotonou('2026-11-03', '10:00'), maintenant), heureRecueDite(aCotonou('2026-11-04', '10:00'), maintenant), heureRecueDite(aCotonou(SOIR, '21:05'), maintenant)]);
dit('l heure se lit a Cotonou : 23 h 30 UTC le 5, c est 0 h 30 le 6 (aujourd hui), pas hier', '0 h 30', heureRecueDite('2026-11-05T23:30:00.000Z', maintenant));
dit('le 1er du mois ; une autre annee dit son annee ; illisible : vide', ['dim. 1er nov.', 'mer. 31 déc. 2025', ''],
  [heureRecueDite(aCotonou('2026-11-01', '10:00'), maintenant), heureRecueDite(aCotonou('2025-12-31', '10:00'), maintenant), heureRecueDite('jamais', maintenant)]);
dit('le titre de la rangee', 'Reçus · 3', titreDesRecus(3));
dit('la pastille de la barre : le nombre et l heure de la plus recente ; rien a zero',
  ['1 reçu · 21 h 30', '3 reçus · 21 h 30', ''],
  [motDeLaPastille(recusDesBoites([troisBoites[1]], {}), maintenant), motDeLaPastille(recusDesBoites(troisBoites, {}), maintenant), motDeLaPastille([], maintenant)]);
dit('le titre de l onglet : « (3) Le Trone … » ; a zero, sans parenthese ; jamais deux comptes', [
  '(3) Le Trône — Maison MND', 'Le Trône — Maison MND', '(1) Le Trône — Maison MND', 'Le Trône — Maison MND',
], [titreDeLOnglet('Le Trône — Maison MND', 3), titreDeLOnglet('Le Trône — Maison MND', 0), titreDeLOnglet('(3) Le Trône — Maison MND', 1), titreDeBase('(12) Le Trône — Maison MND')]);
dit('l adresse de la boite : son numero, sinon sa fiche, sinon sa discussion', ['n=22990000011', 'c=k1', 'd=d1', ''], [
  adresseDeLaBoite({ numero: '22990000011', clientId: 'k1' }), adresseDeLaBoite({ clientId: 'k1', discussionId: 'd1' }), adresseDeLaBoite({ discussionId: 'd1' }), adresseDeLaBoite({}),
]);

/* ── 8. Sur les vraies boites de la Maison (boitesDeLaMaison) ───────── */
const vraies = boitesDeLaMaison({
  fils: [], clientes: [], maintenant, branchId: 'br',
  discussions: [{ id: 'd1', etat: 'ouverte', dernier_de: 'visiteuse', derniere_le: aCotonou(SOIR, '21:10'), telephone: '22990000021', prenom: 'V.', nom: 'S.', branch_id: 'br' }] as never,
  demandes: [{ id: 'q1', createdAt: aCotonou(SOIR, '21:20'), telephone: '22990000031', prenom: 'M.', nom: 'D.', statut: 'nouvelle', branchId: 'br', voix: true, genre: 'rdv' }] as never,
  appels: [{ id: 't1', at: aCotonou(SOIR, '21:40'), phone: '22990000041', nom: 'A. P.', branchId: 'br', fait: false }] as never,
});
dit('le chat du site et le vocal du site arrivent en recus, le vocal d abord ; l appel note, non', ['n:22990000031', 'n:22990000021'], cles(recusDesBoites(vraies, {})));
dit('la boite qui s ouvre par `n=` porte le numero du message', 'n=22990000031', plusRecente(recusDesBoites(vraies, {}))?.adresse);

/* ── 9. La lettre : le magasin, l ecran, le Shell, la pastille ──────── */
const pur = lis('src/shared/recus-pur.ts');
const magasin = lis('src/shared/conversations-lues.ts');
const ecranBrut = lis('src/apps/trone/routes/clients/LesConversations.tsx');
const ecran = sansCommentaires(ecranBrut);
const shell = sansCommentaires(lis('src/apps/trone/shell/Shell.tsx'));
const crochet = sansCommentaires(lis('src/apps/trone/shell/useRecus.ts'));
const pastille = sansCommentaires(lis('src/apps/trone/shell/PastilleDesRecus.tsx'));
const routes = lis('src/apps/trone/routes/index.tsx');
const css = lis('src/apps/trone/routes/clients/les-conversations.css');
const cssShell = lis('src/apps/trone/shell/shell.css');
dit('le document partage, sur le modele de « Rien a repondre » : un magasin, un document, la meme cle', [true, true],
  [magasin.includes("createStore<ConversationsLues>('mnd_conversations_lues', {})"), magasin.includes("bindDocument(conversationsLuesStore, 'mnd_conversations_lues')")]);
dit('le magasin n ecrit que si c est plus recent (`aMarquer`), sur sa derniere valeur', [true, true],
  [/if \(!aMarquer\(conversationsLuesStore\.get\(\), cle, iso\)/.test(magasin), /set\(\(prev\) => \(aMarquer\(prev, cle, iso\)/.test(magasin)]);
/* JAMAIS DEPUIS PERLE, L AUTOMATE OU UN MODELE : seul l ecran des Conversations ecrit « lu ». */
const sources = (d: string): string[] => readdirSync(d, { recursive: true }).map((f) => path.join(d, String(f))).filter((f) => /\.(ts|tsx)$/.test(f));
const ecrivains = [...sources('src'), ...sources('supabase/functions')].filter((f) => /marqueLue\(|conversationsLuesStore\.set\(|mnd_conversations_lues/.test(sansCommentaires(lis(f))))
  .map((f) => f.replace(/\\/g, '/')).sort();
dit('« lu » ne s ecrit que depuis l ecran des Conversations (et son magasin) ; aucune fonction du serveur ne le touche',
  ['src/apps/trone/routes/clients/LesConversations.tsx', 'src/shared/conversations-lues.ts'], ecrivains);
dit('l ecran marque lu la boite ouverte, l onglet sous les yeux, a l instant de son dernier message recu', [true, true, true], [
  ecran.includes('if (!cleOuverte || !sousLesYeux || !isoRecue) return;'), ecran.includes('marqueLue(cleOuverte, isoRecue);'),
  ecran.includes('const isoRecue = boite ? recuDe(boite, lues)?.quand : undefined;'),
]);
dit('... et la marque suit une bulle qui arrive pendant que la boite est ouverte (l instant est une dependance)', true,
  ecran.includes('}, [cleOuverte, sousLesYeux, isoRecue]);'));
dit('l ecran lit le pur et le document, et met les recus EN TETE d « A traiter » et de « Toutes »', [true, true, true, true, true], [
  ecran.includes('recusDesBoites(boites, lues)'),
  ecran.includes("const montreLesRecus = !recherche && ((onglet === 'traiter' && filtre === 'attend') || (onglet === 'toutes' && filtre === 'tout'));"),
  ecran.includes('return [...tete, ...aTraiter.salle, ...aTraiter.tenues, ...aTraiter.mercis];'),
  ecran.includes('return [...tete, ...sansLesRecues(visibles)];'),
  (ecran.match(/\{rangeeDesRecus\(\)\}/g) ?? []).length === 2,
]);
dit('la rangee recue est dessinee avant la salle d attente', true,
  ecranBrut.indexOf('{rangeeDesRecus()}') > 0 && ecranBrut.indexOf('{rangeeDesRecus()}') < ecranBrut.indexOf('{aTraiter.salle.length > 0 && ('));
dit('une ligne recue : nom en gras, heure d arrivee, pastille cuivre du nombre, « Perle a repondu »', [true, true, true, true, true], [
  ecran.includes("${recu ? ' est-recue' : ''}"), ecran.includes('heureRecueDite(recu.quand, tick)'), ecran.includes('className="trc-bx__recus-nombre"'),
  ecran.includes('>Perle a répondu</span>'), css.includes('.trc-bx__ligne.est-recue .trc-bx__haut b { font-weight: 700; }'),
]);
dit('la pastille du nombre est cuivre plein ; aucun vert, rouge ou jaune dans ce qui est neuf', [true, false, false], [
  /\.trc-bx__recus-nombre \{[^}]*background: var\(--color-copper\)/.test(css),
  /(--am-vert|green|red|yellow|#0[0-9a-f]{2}0|vert)/i.test((css.match(/\/\* LES REÇUS[\s\S]*?\/\* LA SALLE D'ATTENTE/) ?? [''])[0].replace(/\/\*[\s\S]*?\*\//g, '')),
  /(--am-vert|green|red|yellow)/i.test(cssShell.slice(cssShell.indexOf('LA PASTILLE DES REÇUS'))),
]);
dit('le Shell compte avec les memes boites et le meme pur, sans un juge de plus', [true, true, true],
  [crochet.includes('boitesDeLaMaison({'), crochet.includes('recusDesBoites(boites, lues)'), crochet.includes("tiroirs: ['clientes']")]);
dit('le compte sur l entree « Conversations » de la barre (/gerard), avec la pastille ronde du menu', [true, true], [
  shell.includes("{it.path === '/gerard' && nbRecus > 0 && (") && shell.includes('<span className="tr-nav__pastille" title={`${nbRecus} conversation'),
  shell.includes("import './shell.css';"),
]);
dit('le titre de l onglet du navigateur suit le compte', [true, true],
  [shell.includes('useEffect(() => { document.title = titreDeLOnglet(titreDuTrone, nbRecus); }, [titreDuTrone, nbRecus]);'), shell.includes('useState(() => titreDeBase(document.title))')]);
dit('la pastille de la barre du haut, sur tous les ecrans, a qui voit les Conversations, et elle mene a la plus recente', [true, true, true], [
  shell.includes("{peutVoir(role, '/gerard', mesDomaines) && <PastilleDesRecus recus={recus} />}"),
  pastille.includes('const premiere = plusRecente(recus);'), pastille.includes("navigate(`/gerard?vue=conversations${premiere.adresse ? `&${premiere.adresse}` : ''}`)"),
]);
dit('UNE SEULE SONNERIE : ni la pastille ni le compte du Shell ne sonnent', [false, false, false],
  [/sonne|sonnette/.test(pastille), /sonne|sonnette/.test(crochet), /sonne|sonnette/.test(sansCommentaires(pur))]);
dit('la barre garde « Conversations » sur /gerard, jamais « Perle »', [true, false],
  [routes.includes("{ path: '/gerard', label: 'Conversations',"), routes.includes("{ path: '/gerard', label: 'Perle',")]);
dit('pas de tiret cadratin, pas le mot banni, dans le pur, la pastille et l ecran', [false, false, false, false],
  [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur), pastille.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(ecran)]);

console.log(ko === 0 ? `\nLes recus tiennent : ${n} cas.` : `\n${ko} ECHEC(S) sur ${n} cas.`);
if (ko) process.exitCode = 1;
