/* À TRAITER, ÉPROUVÉ : 27 octobre 2026.
   `node scripts/verifie-a-traiter.mjs` (et `--prouve`).

   Le merci sans question, les trois groupes, la pastille d'une ligne, la
   phrase « Ce qu'il faut faire » et ses gestes ; puis la lettre de l'écran
   (Les conversations) : il lit ce pur, la liste et la conversation côte à
   côte, « Rien à répondre » écrit le document partagé. Les clientes sont des
   initiales. */
import { readFileSync } from 'node:fs';
import { attendPourUnMerci, ceQuIlFautFaire, estUnMerci, groupeDe, pastilleDe } from '../src/shared/a-traiter-pur';
import type { Boite } from '../src/shared/boite-unique-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. Le merci sans question ── */
dit('un merci, sans question : merci, merci beaucoup, « Ok je confirme à demain inchaalla merci », d’accord, parfait, un pouce, des mains jointes',
  [true, true, true, true, true, true, true, true],
  ['Merci', 'Merci beaucoup !', 'Ok je confirme à demain inchaalla merci', 'D’accord, merci', 'Parfait, merci', 'Merci bcp', '👍', '🙏🏾'].map(estUnMerci));
dit('… pas un merci : une question, « oui », une suite, un bonjour, un ok qui demande, trop long, vide',
  [false, false, false, false, false, false, false],
  ['Merci, c’est possible samedi ?', 'oui', 'Merci. Je voudrais aussi une couleur', 'Bonjour', 'Ok mais à quelle heure', `Merci ${'beaucoup '.repeat(12)}`, ''].map(estUnMerci));

/* ── 2. Les groupes ── */
const maintenant = Date.parse('2026-10-27T12:00:00Z');
const il = (h: number) => new Date(maintenant - h * 3_600_000).toISOString();
const bulle = (texte: string, h: number) => ({ id: `b${h}`, quand: il(h), source: 'whatsapp', auteur: 'elle', texte, gris: false, de: { table: 'messages_wa', id: `m${h}` } });
const fenetre = (ouverte: boolean, resteMs = 0) => ({ ouverte, resteMs, depuis: il(1) });
const boite = (o: Partial<Boite>): Boite => ({
  cle: 'c:x', nom: 'X. Y.', initiales: 'XY', sansFiche: false, tiroir: 'clientes', canaux: ['whatsapp'], bulles: [], attendUneReponse: true, pourquoi: ['whatsapp'],
  sante: false, enRetard: false, fenetreFermeBientot: false, questionFranche: false, quiALaMain: '', filtres: [], rangee: false, fils: [], discussions: [], demandes: [],
  appelsWa: [], appels: [], signalements: [], soucisOuverts: [], numero: '2290197000011', ...o,
} as unknown as Boite);
const recente = boite({ derniereDElle: bulle('Je peux venir jeudi ?', 2) as never, fil: { fenetre: fenetre(true, 22 * 3_600_000) } as never });
const ancienne = boite({ derniereDElle: bulle('Et pour une coloration ?', 30) as never, fil: { fenetre: fenetre(false) } as never });
const merci = boite({ derniereDElle: bulle('Merci beaucoup !', 7 * 24) as never, fil: { fenetre: fenetre(false) } as never });
const sante = boite({ pourquoi: ['souci'], sante: true, niveauDuSouci: 'sante', derniereDElle: bulle('Ça gratte', 50) as never, soucisOuverts: [{ quand: il(50) }] as never, enRetard: true });
const mercietSouci = boite({ pourquoi: ['whatsapp', 'souci'], niveauDuSouci: 'conseil', derniereDElle: bulle('Merci', 3) as never });
const rangee = boite({ attendUneReponse: false, pourquoi: [], rangee: true, derniereDElle: bulle('Merci', 3) as never });
dit('les groupes : moins de 24 h, plus anciennes, un merci ; Santé en retard reste en tête ; un merci qui porte aussi un souci n’est pas un merci ; rangée : aucun',
  ['maintenant', 'plus', 'merci', 'maintenant', 'maintenant', null],
  [recente, ancienne, merci, sante, mercietSouci, rangee].map((b) => groupeDe(b, maintenant)));
dit('… attendre pour un merci : seulement pour ses mots', [true, false], [attendPourUnMerci(merci), attendPourUnMerci(mercietSouci)]);

/* ── 3. La pastille ── */
const chat = boite({ pourquoi: ['chat'], canaux: ['chat'], sansFiche: true, derniereDElle: { ...bulle('Combien pour une création ?', 1), source: 'chat' } as never, numero: undefined });
const appel = boite({ pourquoi: ['appel-wa'], appelsWa: [{ sonneLe: il(4) }] as never, fil: { fenetre: fenetre(true, 20 * 3_600_000) } as never });
const demande = boite({ pourquoi: ['demande'], demandes: [{ apptId: 'rdv1', createdAt: il(20) }] as never });
const demandeSansPlace = boite({ pourquoi: ['demande'], sansFiche: true, demandes: [{ createdAt: il(20), mot: 'plutôt un samedi matin' }] as never });
const automate = boite({ attendUneReponse: false, pourquoi: [], fil: { fenetre: fenetre(true, 3_600_000), automate: { tenue: 'tenu' } } as never });
dit('une pastille par ligne, en mots simples',
  ['Répondre · encore 22 h', 'Plus de 24 h : un modèle', 'Un merci : rien à répondre ?', 'Santé · rappel en retard', 'Répondre sur le chat', 'Rappeler', 'Confirmer sa place', 'Demande à traiter', 'Rien à répondre', 'L’automate a la main'],
  [recente, ancienne, merci, sante, chat, appel, demande, demandeSansPlace, rangee, automate].map((b) => pastilleDe(b).dit));
dit('… les tons : cuivre pour répondre, contour pour le modèle, terre pour Santé et rappeler, vert pour rangée',
  ['cuivre', 'contour', 'terre', 'terre', 'vert'], [recente, ancienne, sante, appel, rangee].map((b) => pastilleDe(b).ton));

/* ── 4. Ce qu'il faut faire ── */
const gestes = (b: Boite) => ceQuIlFautFaire(b, { maintenant }).gestes.map((g) => g.cle);
dit('les gestes, le principal d’abord',
  [['repondre', 'rien-a-repondre'], ['modele', 'appeler', 'rien-a-repondre'], ['rien-a-repondre'], ['appeler', 'noter-souci'], ['repondre-chat', 'en-faire-une-cliente', 'rien-a-repondre'],
    ['appeler', 'repondre'], ['voir-sa-place', 'appeler', 'demande-traitee'], ['poser-rdv', 'appeler', 'en-faire-une-cliente', 'demande-traitee'], [], []],
  [recente, ancienne, merci, sante, chat, appel, demande, demandeSansPlace, rangee, automate].map(gestes));
const phrase = (b: Boite, rdv?: string) => ceQuIlFautFaire(b, { maintenant, prochainRdv: rdv }).phrase;
dit('les phrases disent le délai, la fenêtre, le merci, le souci, et son RDV quand il éclaire la suite',
  ['Elle attend une réponse. Vous pouvez lui écrire librement encore 22 h. Son prochain RDV : jeu. 29 oct. 2026 à 14 h.',
    'Son dernier message date de plus de 24 h : WhatsApp n’accepte plus qu’un modèle approuvé. Dès qu’elle répond, vous écrivez de nouveau librement.',
    'Son dernier message est un merci, sans question. Rien n’attend de réponse : rangez-la, elle revient seule à son prochain message.',
    'Souci Santé signalé il y a 2 jours, et le rappel est en retard. Une personne de la Maison la rappelle sous 24 h.',
    'Appel WhatsApp manqué il y a 4 h : personne n’a décroché.',
    'Demande du site il y a 20 h : « plutôt un samedi matin ».'],
  [phrase(recente, 'jeu. 29 oct. 2026 à 14 h'), phrase(ancienne), phrase(merci), phrase(sante), phrase(appel), phrase(demandeSansPlace)]);
dit('sans numéro, pas de geste « Appeler »', false, gestes(boite({ ...ancienne, numero: undefined } as Boite)).includes('appeler'));

/* ── 5. La lettre de l'écran ── */
const pur = readFileSync('src/shared/a-traiter-pur.ts', 'utf8');
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/clients/LesConversations.tsx', 'utf8'));
const gerard = sansCommentaires(readFileSync('src/apps/trone/routes/clients/Gerard.tsx', 'utf8'));
dit('l’écran lit le pur : groupes, pastille, phrase ; « Rien à répondre » écrit le document partagé', [true, true, true, true],
  [ecran.includes('groupeDe(b, tick)'), ecran.includes('pastilleDe(b)'), /ceQuIlFautFaire\(b, \{ maintenant: tick/.test(ecran), /rangeLaBoite\(clesDe\(b\)/.test(ecran)]);
dit('la liste et la conversation côte à côte ; au téléphone, la conversation couvre l’écran', [true, true, true],
  [ecran.includes('className="trc-bx__liste"'), ecran.includes('trc-bx__conv'), ecran.includes("ouvertEtroit ? ' trc-am__plein' : ''")]);
dit('la boîte lit « Rien à répondre », et le compte de la barre des vues aussi', [true, true],
  [/riensARepondre: riens/.test(ecran), /estRangee\(/.test(gerard)]);
dit('« Suivante » et les flèches du clavier passent à la conversation suivante', [true, true], [ecran.includes('const suivante = '), ecran.includes("e.key === 'ArrowDown'")]);
dit('pas de tiret cadratin, pas le mot banni', [false, false, false, false],
  [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur), ecran.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(ecran)]);

console.log(ko === 0 ? '\nA traiter tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
