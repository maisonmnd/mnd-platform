/* QUI TIENT LA CONVERSATION, ÉPROUVÉ : 4 novembre 2026.
   `node scripts/verifie-qui-tient.mjs` (et `--prouve`).

   Qui tient une boîte (la prise écrite, l'automate, Perle, la dernière main
   de l'équipe), la salle d'attente, la nouvelle, l'attente d'elle, le badge
   d'une ligne ; puis la lettre de l'écran (Les conversations en trois
   colonnes) et de la barre repliable. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import { badgeDe, enAttenteDElle, enSalleDAttente, estMoi, estNouvelle, quiTient, tenueDite, type Tenue } from '../src/shared/qui-tient-pur';
import type { Boite } from '../src/shared/boite-unique-pur';
import type { Pastille } from '../src/shared/a-traiter-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const maintenant = Date.parse('2026-11-04T10:00:00Z');
const il = (h: number) => new Date(maintenant - h * 3_600_000).toISOString();
const bulle = (auteur: string, h: number, parQui?: string) => ({ id: `${auteur}${h}`, quand: il(h), source: 'whatsapp', auteur, texte: 'x', gris: false, de: { table: 'messages_wa', id: `m${h}` }, ...(parQui ? { parQui } : {}) });
const boite = (o: Partial<Boite>): Boite => ({
  cle: 'c:x', nom: 'X. Y.', initiales: 'XY', sansFiche: false, tiroir: 'clientes', canaux: ['whatsapp'], bulles: [], attendUneReponse: true, pourquoi: ['whatsapp'],
  sante: false, enRetard: false, fenetreFermeBientot: false, questionFranche: false, quiALaMain: '', filtres: [], rangee: false, fils: [], discussions: [], demandes: [],
  appelsWa: [], appels: [], signalements: [], soucisOuverts: [], numero: '2290197000011', ...o,
} as unknown as Boite);
const qui = (t: Tenue) => (t.qui === 'equipe' ? `equipe:${t.nom}:${t.prise ? 'prise' : 'main'}` : t.qui);

/* ── 1. Qui la tient ── */
const elleSeule = boite({ bulles: [bulle('elle', 1)] as never });
const priseParA = { 'c:x': { nom: 'Awa D.', le: il(2) } };
dit('la prise écrite d’abord, même si l’automate tient son fil ou si Perle a écrit la dernière', ['equipe:Awa D.:prise', 'equipe:Awa D.:prise'], [
  qui(quiTient(boite({ fil: { automate: { tenue: 'tenu' } } as never }), priseParA, maintenant)),
  qui(quiTient(boite({ bulles: [bulle('elle', 3), bulle('assistant', 1)] as never }), priseParA, maintenant)),
]);
dit('… une prise sans nom ne compte pas ; une prise d’une autre boîte non plus', ['personne', 'personne'], [
  qui(quiTient(elleSeule, { 'c:x': { nom: '  ', le: il(1) } }, maintenant)),
  qui(quiTient(elleSeule, { 'c:z': { nom: 'Awa D.', le: il(1) } }, maintenant)),
]);
dit('l’automate qui tient son fil, puis Perle qui a écrit la dernière', ['automate', 'perle'], [
  qui(quiTient(boite({ fil: { automate: { tenue: 'tenu' } } as never, bulles: [bulle('equipe', 1, 'Awa D.')] as never }), {}, maintenant)),
  qui(quiTient(boite({ bulles: [bulle('equipe', 30, 'Awa D.'), bulle('elle', 5), bulle('assistant', 2)] as never }), {}, maintenant)),
]);
dit('une personne de l’équipe qui a écrit il y a moins de 48 h la tient ; au-delà, personne ; sans nom, personne', ['equipe:Awa D.:main', 'personne', 'personne'], [
  qui(quiTient(boite({ bulles: [bulle('elle', 5), bulle('equipe', 4, 'Awa D.'), bulle('elle', 1)] as never }), {}, maintenant)),
  qui(quiTient(boite({ bulles: [bulle('equipe', 50, 'Awa D.'), bulle('elle', 1)] as never }), {}, maintenant)),
  qui(quiTient(boite({ bulles: [bulle('equipe', 4), bulle('elle', 1)] as never }), {}, maintenant)),
]);
dit('un modèle parti seul ou l’automate ne font pas la voix de la Maison : la main d’avant compte', 'equipe:Awa D.:main',
  qui(quiTient(boite({ bulles: [bulle('equipe', 6, 'Awa D.'), bulle('modele', 3), bulle('automate', 2), bulle('elle', 1)] as never }), {}, maintenant)));

dit('Opale, quand ses messages la signent : sur le fil que l’automate tient, et à la place de Perle ; une autre signature garde le nom générique', ['Opale', 'Opale', 'L’automate', 'Perle'], [
  tenueDite(quiTient(boite({ fil: { automate: { tenue: 'tenu' } } as never, bulles: [bulle('elle', 2), bulle('automate', 1, 'Opale')] as never }), {}, maintenant), null).dit,
  tenueDite(quiTient(boite({ bulles: [bulle('elle', 2), bulle('assistant', 1, 'opale')] as never }), {}, maintenant), null).dit,
  tenueDite(quiTient(boite({ fil: { automate: { tenue: 'tenu' } } as never, bulles: [bulle('automate', 1, 'Le Trône')] as never }), {}, maintenant), null).dit,
  tenueDite(quiTient(boite({ bulles: [bulle('assistant', 1, 'Assistant Maison')] as never }), {}, maintenant), null).dit,
]);

/* ── 2. Vous, un prénom, Perle ── */
const tenueA: Tenue = { qui: 'equipe', nom: 'Awa D.', prise: true };
dit('« Vous » sans accents ni majuscules ; une autre : son prénom ; Perle ; l’automate ; personne', ['Vous', 'Awa', 'Perle', 'L’automate', 'Personne'], [
  tenueDite({ qui: 'equipe', nom: 'Yéman B.', prise: true }, 'yeman b.').dit, tenueDite(tenueA, 'Yéman B.').dit,
  tenueDite({ qui: 'perle' }, 'Yéman B.').dit, tenueDite({ qui: 'automate' }, null).dit, tenueDite({ qui: 'personne' }, 'Yéman B.').dit,
]);
dit('… sans nom connu, personne n’est « vous »', [false, false], [estMoi(tenueA, ''), estMoi(tenueA, null)]);

/* ── 3. La salle d'attente, la nouvelle, l'attente d'elle ── */
const personne: Tenue = { qui: 'personne' };
const inconnue = boite({ sansFiche: true, bulles: [bulle('elle', 1), bulle('automate', 1)] as never });
dit('en salle : elle attend et personne ne la tient ; pas si quelqu’un la tient, pas si rien ne l’attend, pas un numéro trié', [true, false, false, false], [
  enSalleDAttente(inconnue, personne), enSalleDAttente(inconnue, tenueA),
  enSalleDAttente(boite({ attendUneReponse: false }), personne), enSalleDAttente(boite({ tri: { etat: 'proposition' } as never }), personne),
]);
dit('nouvelle : un numéro sans fiche, premier message, l’automate a pu l’accueillir', true, estNouvelle(inconnue, personne));
dit('… pas nouvelle : une fiche, une main de l’équipe passée, prise, une demande du site, triée, plus rien n’attend', [false, false, false, false, false, false], [
  estNouvelle(boite({ bulles: [bulle('elle', 1)] as never }), personne),
  estNouvelle(boite({ sansFiche: true, bulles: [bulle('equipe', 60, 'Awa D.'), bulle('elle', 1)] as never }), personne),
  estNouvelle(inconnue, tenueA),
  estNouvelle(boite({ sansFiche: true, pourquoi: ['demande'] }), personne),
  estNouvelle(boite({ sansFiche: true, tri: { etat: 'bloque' } as never }), personne),
  estNouvelle(boite({ sansFiche: true, attendUneReponse: false }), personne),
]);
const repondu = (auteur: string, h: number) => boite({ attendUneReponse: false, derniere: bulle(auteur, h) as never });
dit('en attente d’elle : la Maison a écrit la dernière il y a moins de 7 jours (sa main, Perle, l’automate, le chat)', [true, true, true, true], [
  enAttenteDElle(repondu('equipe', 3), maintenant), enAttenteDElle(repondu('assistant', 30), maintenant),
  enAttenteDElle(repondu('automate', 1), maintenant), enAttenteDElle(repondu('chat', 1), maintenant),
]);
dit('… pas en attente : un rappel parti seul, plus de 7 jours, elle attend, rangée, son mot à elle en dernier', [false, false, false, false, false], [
  enAttenteDElle(repondu('modele', 3), maintenant), enAttenteDElle(repondu('equipe', 24 * 8), maintenant),
  enAttenteDElle(boite({ attendUneReponse: true, derniere: bulle('equipe', 1) as never }), maintenant),
  enAttenteDElle(boite({ attendUneReponse: false, rangee: true, derniere: bulle('equipe', 1) as never }), maintenant),
  enAttenteDElle(repondu('elle', 1), maintenant),
]);

/* ── 4. Le badge ── */
const pastille = (dit: string, ton: Pastille['ton']): Pastille => ({ dit, ton });
const rep = pastille('Répondre · encore 13 h', 'cuivre');
const b = (x: Boite, p: Pastille, t: Tenue, merci = false) => { const r = badgeDe(x, { pastille: p, tenue: t, merci, maintenant }); return `${r.cle}:${r.dit}:${r.ton}`; };
dit('l’urgence d’abord, avec les mots de la pastille, même nouvelle', ['urgent:Rappeler:terre', 'urgent:Rappeler:terre'], [
  b(boite({ sansFiche: true, pourquoi: ['appel-wa'] }), pastille('Rappeler', 'terre'), personne),
  b(inconnue, pastille('Rappeler', 'terre'), personne),
]);
dit('puis Nouveau en vert ; un merci ; une demande garde ses mots ; prise : En cours ; sinon À répondre', [
  'nouveau:Nouveau:vert', 'merci:Un merci:calme', 'demande:Confirmer sa place:indigo', 'en-cours:En cours:indigo-pale', 'repondre:À répondre:cuivre',
], [
  b(inconnue, rep, personne), b(boite({}), pastille('Un merci : rien à répondre ?', 'calme'), personne, true),
  b(boite({ pourquoi: ['demande'] }), pastille('Confirmer sa place', 'indigo'), personne), b(boite({}), rep, tenueA), b(boite({}), rep, personne),
]);
dit('rien n’attend : rangée, l’automate, Perle qui attend sa réponse, la Maison qui attend, sinon les mots de la pastille', [
  'range:Rien à répondre:vert', 'auto:Automatisé:contour', 'attente:En attente:gris', 'auto:Automatisé:contour', 'attente:En attente:gris', 'calme:Rien à faire:calme',
], [
  b(boite({ attendUneReponse: false, rangee: true }), pastille('Rien à répondre', 'vert'), personne),
  b(boite({ attendUneReponse: false }), pastille('L’automate a la main', 'calme'), { qui: 'automate' }),
  b(repondu('assistant', 2), pastille('Rien à faire', 'calme'), { qui: 'perle' }),
  b(repondu('assistant', 24 * 9), pastille('Rien à faire', 'calme'), { qui: 'perle' }),
  b(repondu('equipe', 2), pastille('Rien à faire', 'calme'), tenueA),
  b(boite({ attendUneReponse: false }), pastille('Rien à faire', 'calme'), personne),
]);

/* ── 5. La lettre de l'écran et de la barre ── */
const pur = readFileSync('src/shared/qui-tient-pur.ts', 'utf8');
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/clients/LesConversations.tsx', 'utf8'));
const css = readFileSync('src/apps/trone/routes/clients/les-conversations.css', 'utf8');
const shell = sansCommentaires(readFileSync('src/apps/trone/shell/Shell.tsx', 'utf8'));
const magasin = readFileSync('src/shared/qui-tient.ts', 'utf8');
dit('l’écran lit le pur : qui tient, le badge, la salle d’attente, l’attente d’elle ; la prise écrit le document partagé', [true, true, true, true, true, true], [
  ecran.includes('quiTient(b, prises, tick)'), ecran.includes('badgeDe(b, {'), ecran.includes('enSalleDAttente(b, tenueDe(b))'), ecran.includes('enAttenteDElle(b, tick)'),
  ecran.includes('prendsLaBoite('), magasin.includes("createStore<PrisesDesBoites>('mnd_qui_tient', {})") && magasin.includes("bindDocument(prisesStore, 'mnd_qui_tient')"),
]);
dit('quatre onglets : À traiter, En attente, Toutes, Règles ; la salle d’attente et « Je la prends »', [true, true, true], [
  ['À traiter', 'En attente', 'Toutes', 'Règles'].every((x) => ecran.includes(`'${x}'`)), ecran.includes('Salle d’attente'), ecran.includes('>Je la prends</button>'),
]);
dit('les règles sont les vraies automatisations, comptées ce mois-ci ; « Ce qui part » nomme les envois retenus', [true, true, true, false], [
  ecran.includes('AUTOMATISATIONS_REELLES'), ecran.includes('compteDuMois('), ecran.includes('>Ce qui part<'), ecran.includes('la salle d’attente et le journal'),
]);
dit('la fiche en tiroir, fermée d’office ; l’action suggérée en bandeau', [true, true], [ecran.includes('const [ficheOuverte, setFicheOuverte] = useState(false);'), ecran.includes('Action suggérée')]);
dit('le fond blanc et gris clair sur cet écran seulement', [true, true], [css.includes('.tr-content:has(.trc-bx-vue)'), !css.includes('body {')]);
dit('la barre se replie, se souvient par poste, et ne se replie jamais au téléphone', [true, true, true], [
  shell.includes('tr-shell--repliee'), shell.includes("'mnd_barre_repliee'"), readFileSync('src/apps/trone/trone.css', 'utf8').includes('.tr-shell--repliee'),
]);
dit('pas de tiret cadratin, pas le mot banni', [false, false, false, false],
  [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur), ecran.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(ecran)]);

console.log(ko === 0 ? '\nQui tient la conversation tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
