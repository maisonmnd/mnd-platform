/* L'ALARME DES MESSAGES SANS RÉPONSE, ÉPROUVÉE — `node scripts/verifie-alarme-whatsapp.mjs`.

   « Je veux que tous les nouveaux messages viennent sur mon tableau de bord
   avec une alarme tant que je ne réponds pas » (Yéman, 18 septembre 2026),
   puis, le même jour : « Quand la fenêtre est fermée je ne peux plus rien
   faire. Faire apparaître les messages qui ont une fenêtre ouverte de 24 h »
   et « tu peux me donner la main pour enlever le message ».

   Le juge est `filsSansReponse`, bâti sur celui de la cloche. */
import {
  filsDeLaMaison, filsSansReponse, filsQuiAttendent, tetesDeLaMaison, resteEnClair, alerteDuTelephone,
  type MessageWa, type ArchivesDesFils,
} from '../src/shared/conversations';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const MAINTENANT = Date.parse('2026-09-18T10:00:00Z');
let n = 0;
const msg = (numero: string, sens: 'entrant' | 'sortant', quand: string, extra: Partial<MessageWa> = {}): MessageWa =>
  ({ id: `m${++n}`, numero, sens, texte: `mot ${n}`, quand, ...extra });

const A = '22990000001'; // écrit ce matin à 8 h : 22 h pour répondre
const B = '22990000002'; // écrit hier à midi : 2 h pour répondre, la plus pressée
const C = '22952695910'; // écrit le 16 à 18 h 01 : fenêtre fermée, le cas réel
const D = '22990000004'; // écrit hier à 9 h : fenêtre fermée il y a 1 h
const E = '22990000005'; // écrit, puis on lui a répondu
const F = '22990000006'; // écrit, puis on lui a répondu PAR UN MODÈLE
const G = '22990000007'; // un maître de l'équipe, écrit à 9 h : 23 h

const MESSAGES: MessageWa[] = [
  msg(A, 'entrant', '2026-09-18T08:00:00Z'),
  msg(B, 'entrant', '2026-09-17T12:00:00Z'),
  msg(C, 'entrant', '2026-09-16T18:01:00Z', { texte: 'Je dois annuler le rdv' }),
  msg(D, 'entrant', '2026-09-17T09:00:00Z'),
  msg(E, 'entrant', '2026-09-18T07:00:00Z'),
  msg(E, 'sortant', '2026-09-18T07:30:00Z'),
  msg(F, 'entrant', '2026-09-18T06:00:00Z'),
  msg(F, 'sortant', '2026-09-18T06:30:00Z', { modele: 'rappel_rdv' }),
  msg(G, 'entrant', '2026-09-18T09:00:00Z'),
];

const TETES = tetesDeLaMaison({
  clientes: [],
  equipe: [{ id: 'e1', name: 'Un maître', phone: G, branchId: 'b1' }],
});

const fils = (messages: MessageWa[] = MESSAGES) => filsDeLaMaison(messages, TETES, [], MAINTENANT);
const alarme = (o: {
  archives?: ArchivesDesFils; tiroirs?: ('clientes' | 'equipe' | 'prestataires')[];
  retires?: ArchivesDesFils; messages?: MessageWa[];
} = {}) => filsSansReponse(fils(o.messages), o.archives ?? {}, o.tiroirs, o.retires ?? {}).map((f) => f.numero);

/* ── Qui attend ────────────────────────────────────────────────── */
dit('① une réponse éteint l’alarme', false, alarme().includes(E));
dit('② une réponse PAR UN MODÈLE l’éteint aussi', false, alarme().includes(F));

/* ── Les seules fenêtres ouvertes ──────────────────────────────── */
dit('③ une fenêtre fermée quitte l’alarme d’elle-même, le cas du 16 compris',
  [false, false], [alarme().includes(C), alarme().includes(D)]);
dit('④ mais la cloche compte toujours les fils fermés : rien ne se perd',
  true, filsQuiAttendent(fils()).some((f) => f.numero === C));
dit('⑤ du plus pressé au moins pressé, les ouvertes seules',
  [B, A, G], alarme());
dit('⑥ la plus pressée a deux heures pour répondre librement',
  '2 h', resteEnClair(filsSansReponse(fils(), {})[0].fenetre.resteMs));

/* ── Qui voit quoi ─────────────────────────────────────────────── */
dit('⑦ le personnel ne voit que les clientes', [B, A], alarme({ tiroirs: ['clientes'] }));

/* ── Retirer à la main ─────────────────────────────────────────── */
const RETIRE_A: ArchivesDesFils = { [A]: { le: '2026-09-18T09:30:00Z' } };
dit('⑧ un message retiré sort de l’alarme', [B, G], alarme({ retires: RETIRE_A }));
dit('⑨ mais un nouveau mot après le retrait le ramène',
  true, alarme({ retires: RETIRE_A, messages: [...MESSAGES, msg(A, 'entrant', '2026-09-18T09:45:00Z')] }).includes(A));
dit('⑩ retirer ne range pas le fil : la cloche le compte encore',
  true, filsQuiAttendent(fils(), {}).some((f) => f.numero === A));

/* ── L'archive ─────────────────────────────────────────────────── */
dit('⑪ un fil archivé sort aussi de l’alarme',
  false, alarme({ archives: { [A]: { le: '2026-09-18T09:00:00Z' } } }).includes(A));

/* ── Le silence ────────────────────────────────────────────────── */
dit('⑫ rien d’ouvert en attente, l’alarme n’a rien à dire',
  [], alarme({ messages: [msg(C, 'entrant', '2026-09-16T18:01:00Z')] }));

/* ── La notification sur le téléphone ─────────────────────────── */
const AUDREY = { numero: C, tiroir: 'clientes', nom: 'Audrey Ebhenga' };
const MAITRE = { numero: G, tiroir: 'equipe', nom: 'Un maître' };
const ELIANE = { numero: A, tiroir: 'clientes', nom: 'Éliane Yomelan' };

dit('⑬ une cliente : son prénom seul, et le clic ouvre son fil',
  { titre: 'Audrey vous écrit sur WhatsApp', corps: 'Vous avez 24 h pour lui répondre librement.', url: `/trone/#/conversations?n=${C}` },
  alerteDuTelephone([AUDREY], false));
dit('⑭ jamais le texte du message sur l’écran verrouillé',
  false, JSON.stringify(alerteDuTelephone([AUDREY], true)).includes('annuler'));
dit('⑮ un message de l’équipe ne prévient PAS le personnel', null, alerteDuTelephone([MAITRE], false));
dit('⑯ la direction en est prévenue, sans le nom',
  ['Un message WhatsApp réservé à la direction', false],
  [alerteDuTelephone([MAITRE], true)?.titre, JSON.stringify(alerteDuTelephone([MAITRE], true)).includes('maître')]);
dit('⑰ trois messages d’une même cliente font une seule personne',
  'Audrey vous écrit sur WhatsApp', alerteDuTelephone([AUDREY, AUDREY, AUDREY], false)?.titre);
dit('⑱ plusieurs personnes : on les compte, et le clic mène au tableau de bord',
  { titre: '2 personnes vous écrivent sur WhatsApp', url: '/trone/#/' },
  (({ titre, url }) => ({ titre, url }))(alerteDuTelephone([AUDREY, ELIANE], false)!));
dit('⑲ le personnel, pour une cliente et un maître : la cliente seule',
  'Éliane vous écrit sur WhatsApp', alerteDuTelephone([ELIANE, MAITRE], false)?.titre);
dit('⑳ la direction, pour les deux : deux personnes',
  '2 personnes vous écrivent sur WhatsApp', alerteDuTelephone([ELIANE, MAITRE], true)?.titre);
dit('㉑ rien d’arrivé, rien à dire', null, alerteDuTelephone([], true));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
