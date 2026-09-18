/* L'ALARME DES MESSAGES SANS RÉPONSE, ÉPROUVÉE — `node scripts/verifie-alarme-whatsapp.mjs`.

   « Je veux que tous les nouveaux messages viennent sur mon tableau de bord
   avec une alarme rouge tant que je ne réponds pas » (Yéman, 18 septembre
   2026). Le juge est `filsSansReponse`, bâti sur celui de la cloche.

   LE CAS QUI A TOUT DÉCLENCHÉ : une cliente écrit le 16 à 18 h 01 pour
   annuler, personne n'ouvre l'écran, sa fenêtre se ferme le 17 à 18 h 01.
   L'alarme doit la montrer, et dire que la fenêtre est fermée. */
import {
  filsDeLaMaison, filsSansReponse, tetesDeLaMaison, resteEnClair,
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

/* Six clientes, un maître d'équipe. Les numéros sont des numéros réduits. */
const A = '22990000001'; // écrit ce matin : 22 h pour répondre
const B = '22990000002'; // écrit hier midi : 2 h pour répondre, la plus pressée
const C = '22952695910'; // écrit le 16 à 18 h 01 : fenêtre fermée, le cas réel
const D = '22990000004'; // écrit hier à 9 h : fenêtre fermée il y a 1 h
const E = '22990000005'; // écrit, puis on lui a répondu
const F = '22990000006'; // écrit, puis on lui a répondu PAR UN MODÈLE
const G = '22990000007'; // un maître de l'équipe

const MESSAGES: MessageWa[] = [
  msg(A, 'entrant', '2026-09-18T08:00:00Z'),
  msg(B, 'entrant', '2026-09-17T12:00:00Z'),
  msg(C, 'entrant', '2026-09-16T18:01:00Z', { texte: 'Je dois annuler le rdv' }),
  msg(D, 'entrant', '2026-09-17T09:00:00Z'),
  msg(E, 'entrant', '2026-09-18T07:00:00Z'),
  msg(E, 'sortant', '2026-09-18T07:30:00Z'),
  msg(F, 'entrant', '2026-09-16T08:00:00Z'),
  msg(F, 'sortant', '2026-09-17T08:00:00Z', { modele: 'rappel_rdv' }),
  msg(G, 'entrant', '2026-09-18T09:00:00Z'),
];

const TETES = tetesDeLaMaison({
  clientes: [],
  equipe: [{ id: 'e1', name: 'Un maître', phone: G, branchId: 'b1' }],
});

const fils = (messages: MessageWa[] = MESSAGES) => filsDeLaMaison(messages, TETES, [], MAINTENANT);
const numeros = (archives: ArchivesDesFils = {}, tiroirs?: ('clientes' | 'equipe' | 'prestataires')[], m?: MessageWa[]) =>
  filsSansReponse(fils(m), archives, tiroirs).map((f) => f.numero);

/* ── Qui attend ────────────────────────────────────────────────── */
dit('① une réponse éteint l’alarme', false, numeros().includes(E));
dit('② une réponse PAR UN MODÈLE l’éteint aussi', false, numeros().includes(F));
dit('③ le cas réel du 16 septembre est bien dans l’alarme', true, numeros().includes(C));

/* ── Dans quel ordre ───────────────────────────────────────────── */
/* A a écrit à 8 h, le maître à 9 h : il reste 22 h à A et 23 h au maître.
   A est donc la plus pressée des deux, quel que soit le tiroir. */
dit('④ la direction voit tout, du plus pressé au moins pressé',
  [B, A, G, D, C], numeros());

const parNumero = new Map(filsSansReponse(fils(), {}).map((f) => [f.numero, f]));
dit('⑤ la plus pressée a deux heures pour répondre librement',
  '2 h', resteEnClair(parNumero.get(B)!.fenetre.resteMs));
dit('⑥ le cas du 16 : fenêtre fermée, plus rien à perdre en réponse libre',
  { ouverte: false, resteMs: 0 }, { ouverte: parNumero.get(C)!.fenetre.ouverte, resteMs: parNumero.get(C)!.fenetre.resteMs });
dit('⑦ parmi les fermées, la plus récente passe devant',
  true, numeros().indexOf(D) < numeros().indexOf(C));

/* ── Qui voit quoi ─────────────────────────────────────────────── */
dit('⑧ le personnel ne voit que les clientes',
  [B, A, D, C], numeros({}, ['clientes']));

/* ── L'archive ─────────────────────────────────────────────────── */
const ARCHIVE_A: ArchivesDesFils = { [A]: { le: '2026-09-18T09:00:00Z' } };
dit('⑨ un fil archivé en connaissance de cause sort de l’alarme',
  false, numeros(ARCHIVE_A).includes(A));
dit('⑩ mais un nouveau mot après l’archive l’y fait revenir',
  true, numeros(ARCHIVE_A, undefined, [...MESSAGES, msg(A, 'entrant', '2026-09-18T09:30:00Z')]).includes(A));

/* ── Le silence ────────────────────────────────────────────────── */
dit('⑪ sans aucun message en attente, l’alarme n’a rien à dire',
  [], filsSansReponse(fils([msg(E, 'entrant', '2026-09-18T07:00:00Z'), msg(E, 'sortant', '2026-09-18T07:30:00Z')]), {}).map((f) => f.numero));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
