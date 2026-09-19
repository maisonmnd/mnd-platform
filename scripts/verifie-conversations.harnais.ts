/* LES CONVERSATIONS WHATSAPP, ÉPROUVÉES — `node scripts/verifie-conversations.mjs`.

   DEUX FAUTES POSSIBLES, ET LES DEUX SE PAIENT DEVANT UNE CLIENTE.

   Croire la fenêtre OUVERTE quand elle est fermée, c'est laisser taper un
   message que Meta refusera, avec une erreur en langue étrangère et sans
   remède : la Maison découvrirait la règle un message sur deux.

   Rater le RAPPROCHEMENT par numéro, c'est faire tomber les messages d'une
   cliente dans « inconnu » à côté de sa propre fiche, et lui répondre comme
   à une étrangère alors qu'on a vingt de ses rituels au carnet. */
import {
  numeroWa, fenetreDe, resteEnClair, filsDeLaMaison, pourquoiLEnvoiEstImpossible,
  estArchive, archiveLeFil, desarchiveLeFil, filsQuiAttendent,
  tetesDeLaMaison, teteDuNumero, filNeuf, estReserve,
  FENETRE_MS, type MessageWa, type TeteConnue, lienDuFil,
} from '../src/shared/conversations';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const T = Date.parse('2026-09-11T09:00:00Z');
const il = (h: number) => new Date(T - h * 3600_000).toISOString();

const m = (o: Partial<MessageWa>): MessageWa => ({
  id: 'm1', sens: 'entrant', numero: '2290166144465', texte: 'Bonjour',
  quand: il(1), ...o,
});
const t = (o: Partial<TeteConnue>): TeteConnue =>
  ({ id: 'c1', name: 'R. A.', phone: '+229 0166144465', branchId: 'b1', ...o });

/* ── ① LE RAPPROCHEMENT PAR NUMÉRO ─────────────────────────────────
   La fiche porte « +229 0166144465 », Meta renvoie « 2290166144465 ». Si les
   deux ne se réduisent pas au même chiffre, ses messages tombent dans
   « inconnu » à côté de sa propre fiche. */
dit('le format de la fiche rejoint celui de Meta', '2290166144465', numeroWa('+229 0166144465'));
dit('… avec des espaces et des tirets', '2290166144465', numeroWa('229-01 66 14 44 65'));
dit('… et le double zéro international', '2290166144465', numeroWa('002290166144465'));
/* HUIT CHIFFRES, L'ANCIEN PLAN : le Bénin a préfixé « 01 » en 2021, et les
   fiches d'avant portent encore la forme courte. `22901` + les huit, donc
   treize chiffres — j'en avais compté onze dans mon épreuve, le harnais a
   corrigé ma main, pas le code. */
dit('huit chiffres, l’ancien plan', '2290166666666', numeroWa('66 66 66 66'));
dit('un numéro vide ne rend rien', '', numeroWa(undefined));
/* UN NUMÉRO ÉTRANGER SE GARDE TEL QUEL. Le forcer au plan béninois enverrait
   le message à quelqu'un d'autre, ce qui est pire que de ne pas l'envoyer. */
dit('un numéro étranger reste intact', '33612345678', numeroWa('+33 6 12 34 56 78'));

/* ── ② LA FENÊTRE DE 24 HEURES ─────────────────────────────────────
   Elle se compte sur SON dernier message à elle, jamais sur le nôtre. C'est
   la faute naturelle : on croit qu'écrire prolonge la conversation. */
dit('elle a écrit il y a une heure : ouverte',
  { ouverte: true, reste: '23 h' },
  (({ ouverte, resteMs }) => ({ ouverte, reste: resteEnClair(resteMs) }))(fenetreDe([m({})], T)));

dit('elle a écrit il y a 25 heures : fermée',
  { ouverte: false, resteMs: 0 },
  (({ ouverte, resteMs }) => ({ ouverte, resteMs }))(fenetreDe([m({ quand: il(25) })], T)));

dit('NOS messages n’ouvrent rien', false,
  fenetreDe([m({ sens: 'sortant', quand: il(1) })], T).ouverte);
dit('… même très récents, si elle n’a jamais écrit', false,
  fenetreDe([m({ sens: 'sortant', quand: il(0) })], T).ouverte);
dit('un fil vide n’a pas de fenêtre', false, fenetreDe([], T).ouverte);
/* LE DERNIER ENTRANT COMMANDE, pas le premier : une cliente qui écrit trois
   fois rouvre la fenêtre à chaque fois. */
dit('le DERNIER entrant commande', true,
  fenetreDe([m({ quand: il(30) }), m({ id: 'm2', quand: il(2) })], T).ouverte);
dit('à la seconde près, elle vient de se fermer', false,
  fenetreDe([m({ quand: new Date(T - FENETRE_MS).toISOString() })], T).ouverte);

dit('le temps qui reste se dit comme on le dit',
  ['1 h 20', '14 min', '3 h', ''],
  [resteEnClair(4_800_000), resteEnClair(840_000), resteEnClair(10_800_000), resteEnClair(0)]);

/* ── ③ CE QUI PEUT PARTIR, ET CE QUI NE PEUT PAS ───────────────────
   Le refus se dit AVANT le clic. Laisser partir puis afficher l'erreur de
   Meta, c'est faire découvrir la règle un message sur deux. */
const ouverte = fenetreDe([m({})], T);
const fermee = fenetreDe([m({ quand: il(30) })], T);
const jamais = fenetreDe([], T);

dit('fenêtre ouverte : le texte part', null,
  pourquoiLEnvoiEstImpossible({ texte: 'Bonjour R.', fenetre: ouverte, numero: '2290166144465' }));
dit('un message vide ne part pas', 'Le message est vide.',
  pourquoiLEnvoiEstImpossible({ texte: '   ', fenetre: ouverte, numero: '2290166144465' }));
dit('fenêtre fermée : le texte libre est refusé',
  'La fenêtre de 24 heures est fermée. WhatsApp n’accepte plus qu’un modèle approuvé.',
  pourquoiLEnvoiEstImpossible({ texte: 'Bonjour', fenetre: fermee, numero: '2290166144465' }));
/* ELLE N'A JAMAIS ÉCRIT : le message n'est pas le même, et c'est voulu. « La
   fenêtre est fermée » laisserait croire qu'elle s'était ouverte un jour. */
dit('elle n’a jamais écrit : un autre refus',
  'Elle ne vous a jamais écrit : seul un modèle approuvé peut ouvrir la conversation.',
  pourquoiLEnvoiEstImpossible({ texte: 'Bonjour', fenetre: jamais, numero: '2290166144465' }));
dit('un modèle passe hors fenêtre, c’est tout son objet', null,
  pourquoiLEnvoiEstImpossible({ texte: '', fenetre: fermee, modele: 'rappel_rdv', numero: '2290166144465' }));
dit('sans numéro lisible, rien ne part', 'Ce fil n’a pas de numéro lisible.',
  pourquoiLEnvoiEstImpossible({ texte: 'Bonjour', fenetre: ouverte, numero: 'allo' }));

/* ── ④ LES FILS ────────────────────────────────────────────────────
   L'ordre est une priorité, pas une date : un fil d'hier sans réponse presse
   plus qu'un fil de ce matin déjà traité. */
const fils = filsDeLaMaison(
  [
    m({ id: 'a1', numero: '2290166144465', quand: il(30), texte: 'Bonjour' }),
    m({ id: 'a2', numero: '2290166144465', sens: 'sortant', quand: il(29), texte: 'Bonjour R.' }),
    m({ id: 'b1', numero: '22997000000', quand: il(40), texte: 'Vous faites les locks homme ?', nomProfil: 'Inconnu W.' }),
  ],
  [t({})], [], T,
);
dit('le fil sans réponse remonte', ['22997000000', '2290166144465'], fils.map((f) => f.numero));
/* UN MODÈLE PARTI TOUT SEUL NE RÉPOND PAS (18 septembre) : sa question
   reste en attente, même après la confirmation automatique. */
const apresAuto = filsDeLaMaison([
  m({ id: 'q1', numero: '2290166144465', quand: il(30), texte: 'Je peux décaler ?' }),
  m({ id: 'q2', numero: '2290166144465', sens: 'sortant', quand: il(20), texte: 'Bonjour R., c’est confirmé…', modele: 'confirmation_rdv', parQui: 'Le Trône' }),
], [t({})], [], T)[0];
dit('une question suivie d’une confirmation automatique attend toujours', true, apresAuto.attendUneReponse);
dit('… et le fil montre bien la confirmation en dernier', 'q2', apresAuto.dernier.id);
dit('un rappel automatique d’avant (la Maison, automatiquement) non plus', true, filsDeLaMaison([
  m({ id: 'r1', numero: '2290166144465', quand: il(30), texte: 'Bonjour' }),
  m({ id: 'r2', numero: '2290166144465', sens: 'sortant', quand: il(20), texte: 'Rappel', modele: 'rappel_rdv', parQui: 'la Maison, automatiquement' }),
], [t({})], [], T)[0].attendUneReponse);
dit('un modèle envoyé à la main répond, lui', false, filsDeLaMaison([
  m({ id: 'h1', numero: '2290166144465', quand: il(30), texte: 'Bonjour' }),
  m({ id: 'h2', numero: '2290166144465', sens: 'sortant', quand: il(20), texte: '', modele: 'rappel_rdv', parQui: 'accueil@maison.bj' }),
], [t({})], [], T)[0].attendUneReponse);
dit('le fil connu porte le nom de la fiche', 'R. A.',
  fils.find((f) => f.numero === '2290166144465')?.nom);
dit('… et son identifiant', 'c1', fils.find((f) => f.numero === '2290166144465')?.clientId);
/* UNE TÊTE SANS FICHE GARDE SON NOM DE PROFIL : un fil qu'on ne sait pas
   nommer ne se rouvre pas, et « Inconnu » tout court n'est pas un nom. */
dit('le fil sans fiche porte son nom de profil', 'Inconnu W.',
  fils.find((f) => f.numero === '22997000000')?.nom);
dit('… et se dit sans fiche', true, fils.find((f) => f.numero === '22997000000')?.sansFiche);

/* LE SECOND NUMÉRO DE LA FICHE COMPTE AUSSI. Un mari, une sœur : le message
   appartient tout de même à sa tête, et le classer « inconnu » à côté de sa
   propre fiche serait la faute la plus vexante de l'écran. */
dit('le second numéro rattache aussi', 'c1',
  filsDeLaMaison([m({ numero: '22997111111' })], [t({ phone2: '+229 97 11 11 11' })], [], T)[0].clientId);
/* ET LE SECOND NUMÉRO À L'ANCIEN PLAN SE RÉDUIT PAREIL — c'est là que mon
   épreuve s'était trompée : « 97 11 11 11 » n'est pas « 22997111111 » mais
   « 2290197111111 ». Les deux formes doivent trouver leur tête. */
dit('… même écrit à l’ancienne', 'c1',
  filsDeLaMaison([m({ numero: '2290197111111' })], [t({ phone2: '97 11 11 11' })], [], T)[0].clientId);

/* UN FIL PRIVÉ SE DIT PRIVÉ — il ne disparaît pas ici : l'écran décide de ce
   qu'il en fait, et la règle pure se contente de le nommer. */
dit('un fil marqué privé se dit privé', true,
  filsDeLaMaison([m({})], [t({})], ['2290166144465'], T)[0].prive);

/* LA BRANCHE FILTRE PAR LA FICHE, jamais par le message : un message reçu ne
   sait pas de quelle maison il relève. Un fil SANS fiche reste visible
   partout, sinon une cliente qui écrit pour la première fois se perdrait. */
dit('une tête d’une autre branche sort de la liste', 0,
  filsDeLaMaison([m({})], [t({ branchId: 'b2' })], [], T, 'b1').length);
dit('… mais l’inconnue reste visible', 1,
  filsDeLaMaison([m({ numero: '22997000000' })], [t({})], [], T, 'b1').length);

/* LE FIL EST TRIÉ DU PLUS ANCIEN AU PLUS RÉCENT — on lit une conversation
   dans le sens où elle s'est tenue, et le dernier message est le dernier. */
dit('les messages d’un fil sont dans l’ordre du temps',
  ['a1', 'a2'],
  filsDeLaMaison([
    m({ id: 'a2', sens: 'sortant', quand: il(29) }),
    m({ id: 'a1', quand: il(30) }),
  ], [t({})], [], T)[0].messages.map((x) => x.id));

/* ── ARCHIVER UN FIL — 15 septembre 2026 ─────────────────────────────
   « Supprimer une conversation WhatsApp » (Yéman) : tranché, on archive.
   Deux fautes à éviter : une cliente qui réécrit et reste dans le tiroir,
   et une archive qui rend un fil pour une simple différence d'écriture de
   l'heure. */
const filDe = (msgs: MessageWa[]) => filsDeLaMaison(msgs, [t({})], [], T)[0];
const vieux = filDe([m({ id: 'x1', quand: il(5) }), m({ id: 'x2', sens: 'sortant', quand: il(4) })]);
dit('sans archive, un fil n’est pas rangé', false, estArchive(vieux, {}));
const rangee = archiveLeFil({}, '+229 0166144465', 'Y. B.', il(3));
dit('l’archive se range sous le numéro réduit, avec qui et quand',
  { '2290166144465': { le: il(3), par: 'Y. B.' } }, rangee);
dit('archivé après son dernier message, le fil est rangé', true, estArchive(vieux, rangee));
/* ELLE REVIENT SEULE : aucune case à décocher. */
dit('un message reçu après l’archive le fait revenir', false,
  estArchive(filDe([...vieux.messages, m({ id: 'x3', quand: il(2) })]), rangee));
dit('… un message parti aussi', false,
  estArchive(filDe([...vieux.messages, m({ id: 'x4', sens: 'sortant', quand: il(2) })]), rangee));
dit('la même seconde écrite autrement ne le fait pas revenir', true,
  estArchive(filDe([m({ id: 'x5', quand: '2026-09-11T06:00:00Z' })]),
    archiveLeFil({}, '2290166144465', undefined, '2026-09-11T06:00:00.000Z')));
dit('sans nom, l’archive ne porte pas de « par » vide',
  { '2290166144465': { le: il(3) } }, archiveLeFil({}, '2290166144465', undefined, il(3)));
dit('désarchiver retire l’entrée', {}, desarchiveLeFil(rangee, '2290166144465'));
dit('désarchiver un fil non rangé ne touche à rien', rangee, desarchiveLeFil(rangee, '22997000000'));
dit('un numéro illisible ne s’archive pas', {}, archiveLeFil({}, 'abc', 'Y. B.', il(3)));
dit('un fil archivé n’attend plus de réponse', [],
  filsQuiAttendent([filDe([m({ id: 'x6', quand: il(5) })])], archiveLeFil({}, '2290166144465', undefined, il(1)))
    .map((f) => f.numero));
dit('… mais un fil non archivé attend toujours', ['2290166144465'],
  filsQuiAttendent([filDe([m({ id: 'x6', quand: il(5) })])]).map((f) => f.numero));

/* ── ⑤ TROIS TIROIRS, UN NUMÉRO — 15 septembre 2026 ────────────────
   « How can this be done and arrive directly on the trone with employees
   and prestataires » (Yéman). Deux fautes coûteraient cher : une employée
   qui est aussi cliente rangée parmi les clientes (son congé lu par les
   collègues), et une personne partie de l'équipe dont les bulletins
   redeviendraient lisibles à tous. */
const carnet = tetesDeLaMaison({
  clientes: [{ id: 'c1', name: 'R. A.', phone: '+229 0166144465', branchId: 'b1' },
    { id: 'c2', name: 'A. D.', phone: '97 22 22 22', branchId: 'b1' }],
  equipe: [{ id: 's1', name: 'A. D.', phone: '+229 0197222222', branchId: 'b1' }],
  prestataires: [{ id: 'p1', name: 'K. H.', phone: '+229 0195000000', branchId: 'b1' },
    { id: 'p2', name: 'Archivé', phone: '+229 0195000001', branchId: 'b1', archived: true }],
  fournisseurs: [{ id: 'f1', nom: 'Menuiserie K.', telephone: '+229 0195000000', branchId: 'b1' },
    { id: 'f2', nom: 'Fermé', telephone: '+229 0195000002', branchId: 'b1', actif: false }],
  engagements: [
    { id: 'e1', prestataire: 'Soudure D.', telephone: '96 00 00 01', branchId: 'b1' },
    { id: 'e2', prestataire: 'Avec fiche', telephone: '+229 0196000002', fournisseurId: 'f1', branchId: 'b1' },
    { id: 'e3', prestataire: 'Même que K. H.', telephone: '+229 0195000000', branchId: 'b1' },
    { id: 'e4', prestataire: 'Sans numéro', branchId: 'b1' },
  ],
});
dit('une cliente est une cliente, avec sa fiche',
  { tiroir: 'clientes', fiche: '/customers?id=c1' },
  (({ tiroir, fiche }) => ({ tiroir, fiche }))(teteDuNumero('2290166144465', carnet)!));
/* L'ÉQUIPE D'ABORD : le même numéro est sur une fiche cliente ET sur une
   fiche d'équipe. C'est la décision du 15 septembre. */
dit('une employée qui est aussi cliente va dans Équipe', 's1',
  teteDuNumero('2290197222222', carnet)?.id);
dit('… et sa fiche est celle de l’équipe', '/personnel', teteDuNumero('2290197222222', carnet)?.fiche);
/* UN PRESTATAIRE DU RÉPERTOIRE ET UN FOURNISSEUR SUR LE MÊME NUMÉRO : le
   répertoire passe devant, il est déclaré en premier dans le carnet. */
dit('le répertoire des prestataires passe avant le fournisseur', 'p1',
  teteDuNumero('2290195000000', carnet)?.id);
dit('un prestataire archivé ne reconnaît plus son numéro', undefined,
  teteDuNumero('2290195000001', carnet));
dit('un fournisseur fermé non plus', undefined, teteDuNumero('2290195000002', carnet));
dit('un inconnu reste inconnu', undefined, teteDuNumero('22997000000', carnet));
/* ⑤ bis — LE PRESTATAIRE D'UN ENGAGEMENT, 19 septembre 2026. Son numéro est
   sur le dossier, écrit à l'ancienne (8 chiffres) : il se reconnaît quand
   même, dans le tiroir réservé, et le clic ouvre SON dossier. */
dit('le prestataire d’un engagement sans fiche se reconnaît, même écrit sur 8 chiffres',
  { id: 'e1', name: 'Soudure D.', tiroir: 'prestataires', fiche: '/engagements?id=e1' },
  (({ id, name, tiroir, fiche }) => ({ id, name, tiroir, fiche }))(teteDuNumero('2290196000001', carnet)!));
dit('avec une fiche fournisseur, le dossier ne double pas le numéro', undefined,
  teteDuNumero('2290196000002', carnet));
dit('le répertoire passe encore devant un dossier au même numéro', 'p1',
  teteDuNumero('2290195000000', carnet)?.id);
dit('équipe et prestataires sont réservés, pas les clientes',
  [true, true, false], [estReserve('equipe'), estReserve('prestataires'), estReserve('clientes')]);

const filsTiroirs = filsDeLaMaison([
  m({ id: 't1', numero: '2290197222222', quand: il(3) }),
  m({ id: 't2', numero: '2290166144465', quand: il(2) }),
  /* PARTIE DE L'ÉQUIPE : aucune tête ne porte ce numéro, mais la base avait
     écrit le tiroir sur ses messages. Le fil reste réservé. */
  m({ id: 't3', numero: '22997333333', quand: il(1), tiroir: 'equipe' }),
], carnet, [], T);
const tiroirDu = (n: string) => filsTiroirs.find((f) => f.numero === n)?.tiroir;
dit('le fil de l’employée est dans Équipe', 'equipe', tiroirDu('2290197222222'));
dit('… sans clientId : les gestes des clientes ne la concernent pas', undefined,
  filsTiroirs.find((f) => f.numero === '2290197222222')?.clientId);
dit('le fil de la cliente est dans Clientes', 'clientes', tiroirDu('2290166144465'));
dit('une personne partie de l’équipe garde un fil réservé', 'equipe', tiroirDu('22997333333'));
dit('… et se dit sans fiche', true, filsTiroirs.find((f) => f.numero === '22997333333')?.sansFiche);
dit('un fil neuf porte le tiroir de sa tête', 'prestataires',
  filNeuf('2290195000000', teteDuNumero('2290195000000', carnet))?.tiroir);
dit('un fil neuf d’un inconnu est une cliente', 'clientes', filNeuf('22997000000')?.tiroir);

/* UN LIEN DE FIL SE POSE DANS UN href — la faute du 17 septembre 2026.
   La cloche du calendrier posait la ROUTE telle quelle : le navigateur la
   resolvait sur la racine du domaine, et la Maison tombait sur un 404. */
dit('le lien d’un fil porte le diese du Trone', true,
  (lienDuFil('0197000000') ?? '').startsWith('#/conversations?n='));
dit('… et le message voyage avec lui', true,
  (lienDuFil('0197000000', 'Bonjour') ?? '').includes('&t=Bonjour'));
dit('… il ne ressemble jamais a une adresse du web', true,
  (lienDuFil('0197000000') ?? '').startsWith('#'));
dit('sans numero, aucun lien', null, lienDuFil(''));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
