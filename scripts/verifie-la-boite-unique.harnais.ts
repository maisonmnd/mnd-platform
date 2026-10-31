/* LA BOÎTE UNIQUE DES CONVERSATIONS, ÉPROUVÉE, 26 octobre 2026.
   `node scripts/verifie-la-boite-unique.mjs` (et `--prouve`).

   Douze personnes fabriquées dont on connaît la boîte : un souci Santé par
   Ma Couronne et un appel manqué sur l'ancien numéro, un fil que l'automate
   tient, une visiteuse du chat, une demande du site (aussi dans le fil),
   un souci choisi dans la liste WhatsApp, l'Assistant qui écrit, un modèle
   envoyé de sa main. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import {
  FILTRES_DE_LA_BOITE, auteurDuMessageWa, boitesDeLaMaison, boitesDuFiltre, comptesDesFiltres, estLaMainDeLAssistant, estPartiSeul,
  estUneMainHumaine, idDuSouciWa, initialesDe, repondusSousUneHeure, reponsesGratuitesRestantes, texteDeLaDemande, texteDuSouci,
  cleDuFilRange, estRangee, boiteDuNumero, type Boite, type EnvoiDeLaBoite,
} from '../src/shared/boite-unique-pur';
import { fenetreDe, filsDeLaMaison, tetesDeLaMaison, type Fil, type MessageWa } from '../src/shared/conversations';
import type { Discussion, MessageAuTrone } from '../src/shared/discussions';
import type { Demande } from '../src/shared/demandes';
import type { AppelWa } from '../src/shared/appels-wa';
import type { AppelRecu } from '../src/shared/appels';
import { ACCUSE_SANTE, type Signalement } from '../src/shared/entre-deux-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Le jour, les gens ── */
const A = '2026-10-26';
const a = (h: string) => `${A}T${h}Z`;
const hier = (h: string) => `2026-10-25T${h}Z`;
const maintenant = Date.parse(a('12:00:00'));

/** Les numéros, au format que Meta emploie (`numeroWa`). */
const N = { kt: '2290197000011', ao: '2290197000022', ne: '2290197000033', ph: '2290197000044', bn: '2290197000055', md: '2290197000066', sa: '2290197000077', ra: '2290197000088', tl: '2290197000012', ef: '2290197000013' };
const fiche = (id: keyof typeof N, name: string) => ({ id, name, phone: `+229 01 97 00 00 ${N[id].slice(-2)}`, branchId: 'b1' });
const clientes = [fiche('kt', 'K. T.'), fiche('ao', 'A. O.'), fiche('ne', 'N. E.'), fiche('bn', 'B. N.'), fiche('md', 'M. D.'), fiche('sa', 'S. A.'), fiche('ra', 'R. A.'), fiche('tl', 'T. L.'), fiche('ef', 'E. F.')];

const m = (o: Partial<MessageWa> & Pick<MessageWa, 'id' | 'numero' | 'texte' | 'quand'>): MessageWa => ({ sens: 'entrant', ...o });
const waIdSa = 'wamid.HBgLMjI5MDE5NzAwMDA3NxUCABIYFDNBQTlD';
const messages: MessageWa[] = [
  /* A. O. : l'automate propose des places. */
  m({ id: 'ao1', numero: N.ao, texte: 'Je peux venir jeudi ?', quand: a('09:50:00') }),
  m({ id: 'ao2', numero: N.ao, sens: 'sortant', auto: 'automate', parQui: 'Le Trône', texte: 'Avec plaisir. Jeudi 29 octobre 2026, deux places : 10 h ou 14 h.', quand: a('09:50:05') }),
  /* N. E. : sa question, puis une confirmation partie seule. */
  m({ id: 'ne1', numero: N.ne, texte: 'Je peux décaler ?', quand: a('07:00:00') }),
  m({ id: 'ne2', numero: N.ne, sens: 'sortant', modele: 'confirmation_rdv', parQui: 'Le Trône', etat: 'remis', texte: 'Bonjour N., votre resserrage est prévu vendredi 30 octobre 2026 à 15 h.', quand: a('07:05:00') }),
  /* P. H. : la demande du site, écrite dans le fil par `demande-submit`, et son accusé. */
  { ...m({ id: 'site-d-ph', numero: N.ph, canal: 'site', clientId: '', nomProfil: 'P. H.', texte: 'Demande du site : création, « plutôt un samedi matin »', quand: a('11:35:00') }), demandeId: 'd-ph' } as MessageWa,
  m({ id: 'ph2', numero: N.ph, sens: 'sortant', modele: 'demande_recue', parQui: 'Le Trône', etat: 'remis', texte: 'Bonjour P., la Maison MND a bien reçu votre demande.', quand: a('11:36:00') }),
  /* B. N. : hier, sans réponse, fenêtre fermée. */
  m({ id: 'bn1', numero: N.bn, texte: 'Et pour une coloration ?', quand: hier('10:00:00') }),
  /* M. D. : l'Assistant lui répond, de lui-même. */
  m({ id: 'md1', numero: N.md, texte: 'Bonjour, une place samedi ?', quand: a('10:30:00') }),
  m({ id: 'md2', numero: N.md, sens: 'sortant', parQui: 'Assistant Maison', texte: 'Avec plaisir : samedi 31 octobre 2026, 10 h ou 14 h ?', quand: a('10:35:00') }),
  /* S. A. : un souci choisi dans la liste WhatsApp, et le mot parti seul. */
  m({ id: 'sa1', numero: N.sa, waId: waIdSa, texte: 'Ça gratte, rougeurs', bouton: { id: 'POINT_LISTE:appt-sa:gratte', texte: 'Ça gratte, rougeurs' }, quand: a('08:00:00') }),
  m({ id: 'sa2', numero: N.sa, sens: 'sortant', auto: 'point-recu', parQui: 'Le Trône', texte: ACCUSE_SANTE, quand: a('08:00:05') }),
  /* R. A. : répondue en vingt minutes par une main, puis un mot de plus. */
  m({ id: 'ra1', numero: N.ra, texte: 'Bonjour, c’est possible samedi ?', quand: a('09:00:00') }),
  m({ id: 'ra2', numero: N.ra, sens: 'sortant', parQui: 'Aimer', etat: 'lu', texte: 'Bonjour R., oui, samedi 31 octobre 2026 à 10 h.', quand: a('09:20:00') }),
  m({ id: 'ra3', numero: N.ra, texte: 'Parfait, merci', quand: a('11:50:00') }),
  /* T. L. : un modèle envoyé de sa main par une personne répond. */
  m({ id: 'tl1', numero: N.tl, texte: 'Vous confirmez pour demain ?', quand: a('06:00:00') }),
  m({ id: 'tl2', numero: N.tl, sens: 'sortant', modele: 'confirmation_rdv', parQui: 'Teckle', etat: 'remis', texte: 'Bonjour T., votre resserrage est prévu mardi 27 octobre 2026 à 10 h.', quand: a('06:10:00') }),
];
const tetes = tetesDeLaMaison({ clientes });
const filsDeMeta = filsDeLaMaison(messages, tetes, [], maintenant, 'b1');

/* E. F. : un fil dont `filsDeLaMaison` a JUGÉ que l'automate a répondu
   (son dernier mot compté est d'elle, et pourtant `attendUneReponse` est
   faux). La boîte doit le croire sur parole. */
const msgsEf = [
  m({ id: 'ef1', numero: N.ef, clientId: 'ef', texte: 'Je prends 10 h', quand: a('11:00:00') }),
  m({ id: 'ef2', numero: N.ef, sens: 'sortant', auto: 'automate', parQui: 'Le Trône', texte: 'C’est posé : jeudi 29 octobre 2026 à 10 h.', quand: a('11:00:05') }),
];
const filEf: Fil = {
  numero: N.ef, clientId: 'ef', nom: 'E. F.', sansFiche: false, prive: false, messages: msgsEf, dernier: msgsEf[1], dernierQuiCompte: msgsEf[0],
  fenetre: fenetreDe(msgsEf, maintenant), attendUneReponse: false, tiroir: 'clientes', automate: { tenue: 'fini' },
};

const discussions: Discussion[] = [{
  id: 'd1', branch_id: 'b1', prenom: null, nom: null, telephone: null, page: '/tarifs/', etat: 'ouverte', dernier_de: 'visiteuse',
  derniere_le: a('11:44:03'), client_id: null, cree_le: a('11:44:00'),
}];
const messagesDesDiscussions: Record<string, MessageAuTrone[]> = {
  d1: [
    { id: 1, discussion_id: 'd1', de: 'visiteuse', texte: 'Combien pour une création ?', cree_le: a('11:44:00') },
    { id: 2, discussion_id: 'd1', de: 'auto', texte: 'Bonjour, le prix d’une création dépend de la longueur et de la densité : notre équipe vous répond sur WhatsApp.', cree_le: a('11:44:03') },
  ],
};
const demandes: Demande[] = [{
  id: 'd-ph', genre: 'prospect', createdAt: a('11:35:00'), branchId: 'b1', prenom: 'P.', nom: 'H.', telephone: '+2290197000044', besoin: 'creation',
  mot: 'plutôt un samedi matin', source: 'site', consentementLe: a('11:35:00'), statut: 'nouvelle',
}];
/* L'appel manqué de K. T. arrive avec l'ANCIEN numéro de Meta (229 97…), sans fiche. */
const appelsWa: AppelWa[] = [{ id: 'wa-call-1', branchId: 'b1', callId: 'c1', numero: '22997000011', sens: 'entrant', etat: 'manque', sonneLe: a('11:30:00') }];
const appels: AppelRecu[] = [{ id: 'ap-1', branchId: 'b1', nom: 'G. H.', phone: '+229 01 97 00 00 14', motif: 'une création', suite: 'rdv', fait: false, at: a('10:00:00') }];
const signalements: Signalement[] = [
  { id: 'sig-kt', branchId: 'b1', clientId: 'kt', soucis: ['gratte'], canal: 'couronne', quand: a('10:12:00'), etat: 'ouvert', reponse: ACCUSE_SANTE },
  { id: idDuSouciWa(waIdSa), branchId: 'b1', clientId: 'sa', soucis: ['gratte'], canal: 'whatsapp', quand: a('08:00:00'), etat: 'ouvert', reponse: ACCUSE_SANTE, point: 'pe-appt-sa-apres', apptId: 'appt-sa' },
];
const envois: EnvoiDeLaBoite[] = [
  /* L'Assistant a écrit à B. N. par Ma Couronne, il y a trois jours. */
  { id: 'gerard-2026-10-23-bn-push', type: 'gerard', canal: 'push', statut: 'envoyé', etat: 'remis', quand: '2026-10-23T09:00:00Z', clientId: 'bn', branchId: 'b1', genre: 'envie', texte: 'Bonjour Madame B., une envie de soin ?\n\nMaison MND' },
  /* Écarté : jamais parti, le journal le garde, la boîte non. */
  { id: 'env-appt-ne-x-whatsapp', type: 'rappel-j1', canal: 'whatsapp', statut: 'écarté', quand: a('05:00:00'), clientId: 'ne', branchId: 'b1' },
  /* Parti sur WhatsApp : le fil (`messages_wa`) le porte déjà. */
  { id: 'conf-appt-ne-whatsapp', type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', etat: 'remis', quand: a('07:05:00'), clientId: 'ne', branchId: 'b1' },
  /* En salle d'attente : nulle part ailleurs. */
  { id: 'env-appt-ra-whatsapp', type: 'rappel-j1', canal: 'whatsapp', statut: 'en-attente', quand: a('11:55:00'), deposeLe: a('11:55:00'), partA: a('13:05:00'), clientId: 'ra', branchId: 'b1' },
];

const boites = boitesDeLaMaison({ fils: [...filsDeMeta, filEf], discussions, messagesDesDiscussions, demandes, appelsWa, appels, signalements, envois, clientes, maintenant, branchId: 'b1' });
const boite = (cle: string): Boite => { const b = boites.find((x) => x.cle === cle); if (!b) throw new Error(`boite ${cle} absente`); return b; };
const auteurs = (b: Boite) => b.bulles.map((x) => x.auteur);

/* ── 1. Une boîte par personne ── */
dit('douze personnes, douze boîtes : celles qui attendent d’abord, Santé en tête, puis la plus récente',
  ['c:kt', 'c:sa', 'c:ra', 'd:d1', 'n:22997000044', 'n:22997000014', 'c:ao', 'c:ne', 'c:bn', 'c:ef', 'c:md', 'c:tl'], boites.map((b) => b.cle));
dit('l’appel manqué sur l’ancien numéro de Meta (229 97…) rejoint la fiche écrite 229 01 97… : la clé du numéro, pas le numéro',
  [['couronne', 'appel'], 'Appel WhatsApp reçu, manqué'], [boite('c:kt').canaux, boite('c:kt').bulles[3]?.texte]);
dit('le nom et les initiales : la fiche, la demande, « Visiteuse du site » sans nom (initiales « ? »)',
  [['K. T.', 'KT'], ['P. H.', 'PH'], ['Visiteuse du site', '?'], ['G. H.', 'GH']],
  [boite('c:kt'), boite('n:22997000044'), boite('d:d1'), boite('n:22997000014')].map((b) => [b.nom, b.initiales]));
dit('les initiales : deux mots, un seul mot, un numéro', ['KT', 'MA', '?'], [initialesDe('Kilo Tango'), initialesDe('Marie'), initialesDe('2290197000011')]);

/* ── 2. Les trois dédoublonnages ── */
dit('① la demande du site, aussi écrite dans le fil : UNE bulle « demande », puis l’accusé parti seul',
  [['elle', 'modele'], ['demande', 'whatsapp'], 'Créer ma couronne, « plutôt un samedi matin »'],
  [auteurs(boite('n:22997000044')), boite('n:22997000044').canaux, boite('n:22997000044').bulles[0].texte]);
dit('② le souci choisi dans la liste WhatsApp : le message qu’elle a touché porte la bulle et le niveau, le signalement ne double pas',
  [['elle', 'automate', 'systeme'], 'sante', 'Ça gratte, rougeurs'],
  [auteurs(boite('c:sa')), boite('c:sa').bulles[0].niveau, boite('c:sa').bulles[0].bouton]);
dit('③ la réponse reçue : par WhatsApp le fil la porte (point-recu, automate, grisée) ; par Ma Couronne le signalement seul',
  [[true, 'automate', true], ['elle', 'automate', 'systeme', 'elle']],
  [[boite('c:sa').bulles[1].id === 'wa-sa2', boite('c:sa').bulles[1].auteur, boite('c:sa').bulles[1].gris], auteurs(boite('c:kt'))]);
dit('… un « point reçu » n’est jamais une main humaine ; une personne qui envoie un modèle de sa main, oui', [false, true, false, false, false],
  [estUneMainHumaine({ sens: 'sortant', auto: 'point-recu', parQui: 'Le Trône' }), estUneMainHumaine({ sens: 'sortant', parQui: 'Teckle' }),
    estUneMainHumaine({ sens: 'sortant', parQui: 'Le Trône' }), estUneMainHumaine({ sens: 'sortant', parQui: 'Assistant Maison' }), estUneMainHumaine({ sens: 'entrant' })]);

/* ── 3. Le juge composé ── */
dit('WhatsApp : `Fil.attendUneReponse` TEL QUEL. Le fil que l’automate a fini n’attend pas, même si son dernier mot compté est d’elle',
  [false, 'rien à faire', true], [boite('c:ef').attendUneReponse, boite('c:ef').quiALaMain, boite('c:ao').attendUneReponse]);
dit('… l’Assistant qui répond de lui-même éteint le fil pour `filsDeLaMaison` : la boîte dit la même chose', [false, ['elle', 'assistant'], 'rien à faire'],
  [boite('c:md').attendUneReponse, auteurs(boite('c:md')), boite('c:md').quiALaMain]);
dit('pourquoi elle attend : souci + appel WhatsApp ; WhatsApp + souci ; chat ; WhatsApp + demande ; appel noté',
  [['souci', 'appel-wa'], ['whatsapp', 'souci'], ['chat'], ['whatsapp', 'demande'], ['appel']],
  ['c:kt', 'c:sa', 'd:d1', 'n:22997000044', 'n:22997000014'].map((c) => boite(c).pourquoi));
dit('Santé : un souci ouvert « gratte » ; pas en retard à 1 h 48', [true, 'sante', false], [boite('c:kt').sante, boite('c:kt').niveauDuSouci, boite('c:kt').enRetard]);

/* ── 4. Qui a la main ── */
dit('qui a la main, en une phrase : Santé, un appel, une demande, le chat, WhatsApp selon la fenêtre',
  ['à rappeler sous 24 h', 'à rappeler sous 24 h', 'a appelé, un rendez-vous à caler', 'demande du site, à traiter', 'réponse automatique partie, à relire',
    'à répondre, fenêtre ouverte encore 21 h 50', 'à répondre, fenêtre ouverte encore 19 h', 'à répondre par un modèle, fenêtre fermée', 'à répondre, fenêtre ouverte encore 23 h 50'],
  ['c:kt', 'c:sa', 'n:22997000014', 'n:22997000044', 'd:d1', 'c:ao', 'c:ne', 'c:bn', 'c:ra'].map((c) => boite(c).quiALaMain));
dit('la fenêtre qui ferme dans moins d’une heure est signalée (aucune ici)', 0, boites.filter((b) => b.fenetreFermeBientot).length);

/* ── 5. Les bulles ── */
dit('un modèle parti seul est « modele » et grisé ; le même modèle envoyé de sa main est « equipe »',
  [['modele', true], ['equipe', false]], [[boite('c:ne').bulles[1].auteur, boite('c:ne').bulles[1].gris], [boite('c:tl').bulles[1].auteur, boite('c:tl').bulles[1].gris]]);
dit('les auteurs d’un message WhatsApp', ['elle', 'modele', 'equipe', 'automate', 'automate', 'assistant', 'assistant'],
  [auteurDuMessageWa({ sens: 'entrant' }), auteurDuMessageWa({ sens: 'sortant', modele: 'x', parQui: 'Le Trône' }), auteurDuMessageWa({ sens: 'sortant', modele: 'x', parQui: 'Teckle' }),
    auteurDuMessageWa({ sens: 'sortant', auto: 'automate', parQui: 'Le Trône' }), auteurDuMessageWa({ sens: 'sortant', parQui: 'la Maison, automatiquement' }),
    auteurDuMessageWa({ sens: 'sortant', parQui: 'Assistant Maison' }), auteurDuMessageWa({ sens: 'sortant', parQui: 'Gérard' })]);
dit('l’Assistant écrit seul : « Assistant Maison » et l’ancien « Gérard », jamais une personne', [true, true, false, true, true],
  [estLaMainDeLAssistant('Assistant Maison'), estLaMainDeLAssistant('Gérard'), estLaMainDeLAssistant('Aimer'), estPartiSeul('Le Trône'), estPartiSeul('Assistant Maison')]);
dit('les envois : la notification Ma Couronne de l’Assistant paraît, grisée ; l’écarté non ; le parti sur WhatsApp non (le fil l’a) ; la salle d’attente oui',
  [['assistant', 'elle'], ['couronne', 'whatsapp'], 2, 'En salle d’attente : Rappel de la veille, part à 14 h 05'],
  [auteurs(boite('c:bn')), boite('c:bn').canaux, boite('c:ne').bulles.length, boite('c:ra').bulles[3].texte]);
dit('le souci par Ma Couronne : ses mots, l’accusé Santé reçu, la ligne d’état', ['Ça gratte, rougeurs', ACCUSE_SANTE, 'Souci ouvert (Santé) : toute sollicitation suspendue'],
  boite('c:kt').bulles.slice(0, 3).map((x) => x.texte));
dit('les textes : la demande porte l’année de la place demandée ; le souci dit ses titres', ['Créer ma couronne, place demandée le samedi 7 novembre 2026 à 10 h, « plutôt un samedi matin »', 'Cassantes, Sèches, « tirent »', 'Tout va bien'],
  [texteDeLaDemande({ besoin: 'creation', date: '2026-11-07', time: '10:00', mot: 'plutôt un samedi matin' }), texteDuSouci({ soucis: ['cassantes', 'seches'], texte: 'tirent' }), texteDuSouci({ bien: true, soucis: [] })]);
dit('le chat du site : la visiteuse, puis la réponse automatique (« chat », grisée) ; le dernier mot d’elle', [['elle', 'chat'], [false, true], 'Combien pour une création ?'],
  [auteurs(boite('d:d1')), boite('d:d1').bulles.map((x) => x.gris), boite('d:d1').derniereDElle?.texte]);
dit('depuis : la dernière bulle, en millisecondes (K. T. : l’appel de 11 h 30)', 30 * 60_000, boite('c:kt').depuisMs);

/* ── 6. Les filtres ── */
/* 29 octobre 2026 : « Propositions » et « Bloqués », le tri des démarcheurs (verifie-le-tri-des-messages). */
dit('les six filtres', ['attend', 'entre-deux', 'site', 'tout', 'propositions', 'bloques'], FILTRES_DE_LA_BOITE);
dit('les filtres d’une boîte : Santé ∈ attend + entre-deux ; la visiteuse ∈ attend + site ; l’Assistant seul ∈ tout',
  [['attend', 'entre-deux', 'tout'], ['attend', 'site', 'tout'], ['attend', 'site', 'tout'], ['tout']],
  ['c:kt', 'd:d1', 'n:22997000044', 'c:md'].map((c) => boite(c).filtres));
dit('les comptes des filtres', { attend: 9, 'entre-deux': 2, site: 2, tout: 12, propositions: 0, bloques: 0 }, comptesDesFiltres(boites));
dit('le filtre « Entre deux séances » rend les deux soucis ouverts', ['c:kt', 'c:sa'], boitesDuFiltre(boites, 'entre-deux').map((b) => b.cle));

/* ── 7. Les tuiles ── */
dit('répondues sous 1 h aujourd’hui : R. A. (Aimer, 20 min) et T. L. (un modèle de la main de Teckle) ; ni l’automate, ni le modèle parti seul, ni l’Assistant, ni le point reçu ; le mot de 11 h 50 est en cours',
  { questions: 6, repondues: 2, enCours: 1 }, repondusSousUneHeure(messages, A, maintenant));
dit('… sans l’instant, ce qui attend compte comme une question', { questions: 7, repondues: 2, enCours: 0 }, repondusSousUneHeure(messages, A));
dit('… hier : la question de B. N., jamais reprise', { questions: 1, repondues: 0, enCours: 0 }, repondusSousUneHeure(messages, '2026-10-25', maintenant));
dit('réponses libres gratuites restantes ce mois : 1 000 moins ce que `compteDesModeles` compte (quatre sortants sans modèle)', { plafond: 1000, utilisees: 4, restantes: 996 },
  reponsesGratuitesRestantes(messages, '2026-10', 'b1'));

/* ── 7 bis. Rien à répondre (27 octobre 2026) ── */
const entree = { fils: [...filsDeMeta, filEf], discussions, messagesDesDiscussions, demandes, appelsWa, appels, signalements, envois, clientes, maintenant, branchId: 'b1' };
const rangees = boitesDeLaMaison({ ...entree, riensARepondre: {
  'c:ra': { le: a('11:55:00'), par: 'Aimer' },            // après son « Parfait, merci » de 11 h 50 : rangée
  'c:ao': { le: a('09:00:00') },                          // avant sa question de 9 h 50 : elle attend toujours
  [cleDuFilRange(N.bn)]: { le: a('09:00:00') },           // par son fil, après son mot d'hier : rangée
  'c:kt': { le: a('12:00:00') },                          // un souci Santé ne se range pas en passant
  'd:d1': { le: a('11:50:00') },                          // le chat du site se range aussi
} });
const rb = (cle: string): Boite => rangees.find((x) => x.cle === cle)!;
dit('« Rien à répondre » après son dernier mot : elle n’attend plus, la phrase le dit ; posé avant : elle attend toujours',
  [[false, true, 'rien à répondre, jusqu’à son prochain message'], [true, false]],
  [[rb('c:ra').attendUneReponse, rb('c:ra').rangee, rb('c:ra').quiALaMain], [rb('c:ao').attendUneReponse, rb('c:ao').rangee]]);
dit('… par la clé de son fil aussi ; le chat du site aussi', [[false, true], [false, true]], [[rb('c:bn').attendUneReponse, rb('c:bn').rangee], [rb('d:d1').attendUneReponse, rb('d:d1').rangee]]);
dit('… un souci Santé et un appel manqué gardent leur juge', [true, ['souci', 'appel-wa']], [rb('c:kt').attendUneReponse, rb('c:kt').pourquoi]);
dit('… les comptes baissent d’autant', { attend: 6, 'entre-deux': 2, site: 2, tout: 12, propositions: 0, bloques: 0 }, comptesDesFiltres(rangees));
dit('estRangee : après, avant, sans date d’elle, aucune marque, date illisible', [true, false, true, false, false],
  [estRangee(['k'], a('10:00:00'), { k: { le: a('10:00:00') } }), estRangee(['k'], a('10:00:01'), { k: { le: a('10:00:00') } }),
    estRangee(['k'], undefined, { k: { le: a('10:00:00') } }), estRangee(['k'], a('10:00:00'), undefined), estRangee(['k'], a('10:00:00'), { k: { le: 'hier' } })]);
dit('… les instants en millisecondes, jamais en texte (« 10:00:00Z » et « 10:00:00.000Z », dans les deux sens)', [true, true],
  [estRangee(['k'], `${A}T10:00:00.000Z`, { k: { le: `${A}T10:00:00Z` } }), estRangee(['k'], `${A}T10:00:00Z`, { k: { le: `${A}T10:00:00.000Z` } })]);

/* ── 7 bis. Un numéro partagé (31 octobre 2026) ── */
const NUM_PARTAGE = '22900000077';
const partage = [
  { cle: 'c:kk', numero: NUM_PARTAGE, fils: [] },
  { cle: 'c:yb', numero: NUM_PARTAGE, fils: [{ numero: NUM_PARTAGE }] },
];
dit('un numéro partagé : la boîte qui porte son fil, pas la première fiche du numéro ; sans fil, la fiche ; ailleurs, rien', ['c:yb', 'c:kk', null],
  [boiteDuNumero(partage, NUM_PARTAGE), boiteDuNumero([partage[0]], NUM_PARTAGE), boiteDuNumero(partage, '22900000099')]);
dit('… et le Trône ouvre la boîte d’un lien `?n=` par elle', true,
  readFileSync('src/apps/trone/routes/clients/LesConversations.tsx', 'utf8').includes('if (nDemande) return boiteDuNumero(boitesBrutes, nDemande);'));

/* ── 8. La lettre ── */
const pur = readFileSync('src/shared/boite-unique-pur.ts', 'utf8');
const webhook = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');
const ligneCleCourte = "const cleCourte = (waId: string): string => waId.replace(/[^A-Za-z0-9]/g, '').slice(-24) || 'x';";
dit('la clé courte du waId est recopiée du webhook à l’identique, entre repères', [true, true],
  [webhook.includes(ligneCleCourte), /⟨cle-courte⟩[\s\S]*?\n[^\n]*\n\/\* ⟨\/cle-courte⟩/.test(pur) && pur.includes(ligneCleCourte)]);
dit('le pur lit `attendUneReponse` du fil et ne rejuge jamais par le sens du dernier message', [true, false],
  [/f\.attendUneReponse\)/.test(pur), /dernierQuiCompte\.sens|dernier\.sens/.test(sansCommentaires(pur))]);
dit('pas de tiret cadratin, pas le mot banni, pas de `slice(0, 10)` dans le pur', [false, false, false],
  [pur.includes(String.fromCharCode(0x2014)), /\bsalons?\b/i.test(pur), /slice\(0,\s*10\)/.test(pur)]);

console.log(ko === 0 ? '\nLa boite unique tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
