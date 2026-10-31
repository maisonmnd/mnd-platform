/* AVANT LE FAUTEUIL, ÉPROUVÉ : 31 octobre 2026.
   `node scripts/verifie-avant-le-fauteuil.mjs` (et `--prouve`).

   Le juge sur des rendez-vous fabriqués dont on connaît la réponse : la
   dette, l'enfant, les tresses, les heures, le numéro étranger, le comptage,
   le carnet, ce qu'elle a dit, la dernière note, les pièces, le résumé, la
   notification du soir et du matin. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import {
  COMPTAGE_APRES_JOURS, ageA, avantLeFauteuil, coupe, francs, heureDite, heureMoins, notificationAvantLeFauteuil, numeroEtranger, plusJours,
  type BriefingAvantLeFauteuil, type ClienteLue, type EntreeAvantLeFauteuil, type MessageLu, type PieceEnvoyee, type RdvLu,
} from '../src/shared/avant-le-fauteuil-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Les fiches fabriquées ── */
const A = '2026-11-12';
const J = '2026-11-13';
const rdv = (o: Partial<RdvLu> = {}): RdvLu => ({
  id: 'r1', clientId: 'c1', date: J, time: '10:00', status: 'confirmé', serviceIds: ['s-reprise'], prixXof: 35000, libelle: 'KLƆKLƆ Essentiel + SÍNSIN Signature', ...o,
});
const venue = (date: string, note?: string, o: Partial<RdvLu> = {}): RdvLu => rdv({ id: `v-${date}`, date, status: 'honoré', note, ...o });
const cliente = (o: Partial<ClienteLue> = {}): ClienteLue => ({ id: 'c1', name: 'Justine A.', phone: '+229 01 51 00 00 11', ...o });
const ouverture = () => ({ closed: false, openMin: 9 * 60, closeMin: 19 * 60 });
const entree = (o: Partial<EntreeAvantLeFauteuil> = {}): EntreeAvantLeFauteuil => {
  const r = o.rdv ?? rdv();
  return {
    aujourdhui: A, rdv: r, cliente: cliente(), sesRdv: [venue(plusJours(J, -40), 'racines sèches sur la nuque'), r], messages: [], carnet: null, duXof: 0,
    ouverture, prestationsTresses: (id) => id.startsWith('tresse'), ...o,
  };
};
const juge = (o: Partial<EntreeAvantLeFauteuil> = {}): BriefingAvantLeFauteuil => avantLeFauteuil(entree(o));
const piece = (id: string, kind: PieceEnvoyee['kind'], titre: string): PieceEnvoyee => ({ id, kind, titre, quand: '2026-10-31T12:15:00Z', origine: 'whatsapp' });
const entrant = (quand: string, texte: string): MessageLu => ({ quand, texte, sens: 'entrant', type: 'texte' });

/* ── 1. Les petites mains ── */
dit('les francs, l’heure dite, l’heure moins quinze, la coupe', ['2 000 F', '35 000 F', '20 h', '19 h 45', '19:45', '09:45', 'abc…', 'abc'],
  [francs(2000), francs(35000), heureDite('20:00'), heureDite('19:45'), heureMoins('20:00', 15), heureMoins('10:00', 15), coupe('abcde', 4), coupe('abc', 4)]);
dit('l’âge au jour du rendez-vous : AAAA-MM-JJ, JJ/MM/AAAA, la veille de ses 16 ans, une date illisible', [14, 14, 15, 16, undefined],
  [ageA('2012-05-01', J), ageA('01/05/2012', J), ageA('2010-11-14', J), ageA('2010-11-13', J), ageA('bientôt', J)]);
dit('le numéro étranger : +33 et 0033 oui ; +229, 229, 01 et le vide non', [true, true, false, false, false, false],
  ['+33 6 12 34 56 78', '0033 6 12 34 56 78', '+229 01 51 00 00 11', '229 51 00 00 11', '01 51 99 77 99', undefined].map(numeroEtranger));

/* ── 2. Le rendez-vous ordinaire : la ligne paraît quand même (choix 4) ── */
const ord = juge();
dit('rien à signaler : pas de carnet, rien dû, rien de plus, « rien sur WhatsApp », rien à relire', [[], 'Pas de carnet. Rien dû.', false, ['Rien de plus.'], 'rien sur WhatsApp', false, []],
  [ord.attention, ord.compte.phrase, ord.compte.horsCarnet, ord.aPreparer, ord.resume, ord.aRelire, ord.elleADit]);

/* ── 3. Les attentions, une à une ── */
const dette = juge({ duXof: 5000 });
dit('la dette : l’attention, le compte et le résumé la disent', ['Elle doit 5 000 F à la Maison : à régler avant de partir.', 'Pas de carnet. Elle doit 5 000 F.', 5000, 'doit 5 000 F · rien sur WhatsApp'],
  [dette.attention[0], dette.compte.phrase, dette.compte.duXof, dette.resume]);
dit('l’enfant de 14 ans : prévenir le parent ; à 16 ans le jour même, plus un enfant', [['Enfant : prévenir le parent au numéro à prévenir.'], []],
  [juge({ cliente: cliente({ birthday: '2012-05-01' }) }).attention, juge({ cliente: cliente({ birthday: '2010-11-13' }) }).attention]);
dit('une prestation de tresses : prévenir Hermine', ['Tresses : prévenir Hermine, coiffeuse externe.'], juge({ rdv: rdv({ serviceIds: ['s-reprise', 'tresse-nattes'] }) }).attention);
const HORS = 'Hors des heures d’ouverture : elle a prévenu, la Maison a dit oui.';
dit('les heures : 20 h hors, 18 h 30 pour une heure déborde, 18 h pour une heure tient, 8 h 30 avant l’ouverture, un jour fermé', [[HORS], [HORS], [], [HORS], [HORS]],
  [juge({ rdv: rdv({ time: '20:00' }) }).attention, juge({ rdv: rdv({ time: '18:30', dureeMin: 60 }) }).attention, juge({ rdv: rdv({ time: '18:00', dureeMin: 60 }) }).attention,
    juge({ rdv: rdv({ time: '08:30' }) }).attention, juge({ ouverture: () => ({ closed: true, openMin: 0, closeMin: 24 * 60 }) }).attention]);
const ETRANGER = 'Numéro étranger : vérifier que la confirmation de la veille est bien remise.';
dit('le numéro étranger : sur le premier numéro, ou sur le second quand le premier manque', [[ETRANGER], [ETRANGER], []],
  [juge({ cliente: cliente({ phone: '+33 6 12 34 56 78' }) }).attention, juge({ cliente: cliente({ phone: '', phone2: '+1 646 555 0100' }) }).attention, juge({ cliente: null }).attention]);
const retour = juge({ sesRdv: [venue('2026-06-02', 'racines sèches sur la nuque, revenir dans 6 semaines'), rdv()] });
dit('cinq mois sans venir : recompter, le comptage à préparer, le résumé le dit', [['5 mois sans venir : recompter les locks, son prix suit le comptage.'], ['Le comptage, puis le bilan de séance.'], 'retour après 5 mois · rien sur WhatsApp', { aRefaire: true, premiereVenue: false, mois: 5 }],
  [retour.attention, retour.aPreparer, retour.resume, retour.comptage]);
dit('... à 120 jours pile, rien ; à 121, quatre mois', [[], ['4 mois sans venir : recompter les locks, son prix suit le comptage.']],
  [juge({ sesRdv: [venue(plusJours(J, -COMPTAGE_APRES_JOURS)), rdv()] }).attention, juge({ sesRdv: [venue(plusJours(J, -COMPTAGE_APRES_JOURS - 1)), rdv()] }).attention]);
const premiere = juge({ sesRdv: [rdv()] });
dit('jamais venue : compter les locks avant le prix, pas de dernière note, « première venue »', [['Première venue : compter les locks avant le prix.'], null, 'première venue · rien sur WhatsApp', true, ['Le comptage, puis le bilan de séance.']],
  [premiere.attention, premiere.derniereNote, premiere.resume, premiere.comptage.premiereVenue, premiere.aPreparer]);
const tout = juge({ duXof: 2000, cliente: cliente({ birthday: '2014-01-01', phone: '+33 6 12 34 56 78' }), rdv: rdv({ time: '20:00', serviceIds: ['tresse-vanilles'] }), sesRdv: [venue('2026-05-01'), rdv({ time: '20:00' })] });
dit('l’ordre fixe : dette, enfant, tresses, hors heures, numéro étranger, comptage', [6, [true, true, true, true, true, true]],
  [tout.attention.length, ['Elle doit', 'Enfant', 'Tresses', 'Hors des heures', 'Numéro étranger', '6 mois sans venir'].map((p, i) => (tout.attention[i] ?? '').startsWith(p))]);

/* ── 4. Son compte ── */
const carnet = { nom: 'Carnet des Trois', faites: 1, reservees: 1, restantes: 1 };
const incluse = juge({ carnet, rdv: rdv({ coveredBySub: true }) });
dit('la séance incluse dans son carnet : faites, réservées, reste ; pas hors carnet ; « séance incluse »', ['Séance incluse dans son Carnet des Trois : faites 1, réservées 1, reste 1.', false, 'séance incluse · rien sur WhatsApp', carnet],
  [incluse.compte.phrase, incluse.compte.horsCarnet, incluse.resume, incluse.compte.carnet]);
dit('... un carnet sans limite le dit', 'Séance incluse dans son Formule Lune : faites 3, réservées 1, reste sans limite.',
  juge({ carnet: { nom: 'Formule Lune', faites: 3, reservees: 1, restantes: null }, rdv: rdv({ coveredBySub: true }) }).compte.phrase);
const horsCarnet = juge({ carnet, rdv: rdv({ prixXof: 2000, coveredBySub: false }) });
dit('un carnet vivant, une séance pas couverte : hors carnet, à la carte, au prix du rendez-vous', ['Hors carnet : 2 000 F à la carte.', true], [horsCarnet.compte.phrase, horsCarnet.compte.horsCarnet]);
dit('sans carnet : rien dû, ou ce qu’elle doit', ['Pas de carnet. Rien dû.', 'Pas de carnet. Elle doit 12 500 F.'], [juge().compte.phrase, juge({ duXof: 12500 }).compte.phrase]);

/* ── 5. Elle a dit ── */
const NOTE = 'coiffure pour le mariage qu’elle parraine le 14 ; deux vidéos NappStar comme modèles';
const messages = [
  entrant('2026-11-09T10:00:00Z', 'j’atterris le 12, je viens le 13 à 14 h'),
  entrant('2026-11-01T10:00:00Z', 'quatrième, trop vieux pour les trois'),
  { quand: '2026-11-10T09:00:00Z', texte: 'la réponse de la Maison', sens: 'sortant' as const },
  entrant('2026-11-10T08:00:00Z', ''),
  entrant('2026-11-10T07:00:00Z', 'le plus récent'),
  entrant('2026-11-08T07:00:00Z', 'le troisième'),
];
const dit1 = juge({ rdv: rdv({ note: NOTE }), messages });
dit('la note du carnet d’abord, sans date ; puis les trois entrants les plus récents, du plus récent au plus ancien ; jamais un sortant ni un vide', [
  ['note', '', NOTE], ['conversations', '2026-11-10T07:00:00Z', 'le plus récent'], ['conversations', '2026-11-09T10:00:00Z', 'j’atterris le 12, je viens le 13 à 14 h'], ['conversations', '2026-11-08T07:00:00Z', 'le troisième'],
], dit1.elleADit.map((d) => [d.source, d.quand, d.texte]));
dit('... les trente jours avant le rendez-vous : le 14 octobre compte, le 13 non', [['2026-10-14T10:00:00Z']],
  [juge({ messages: [entrant('2026-10-13T10:00:00Z', 'trop vieux'), entrant('2026-10-14T10:00:00Z', 'juste à temps')] }).elleADit.map((d) => d.quand)]);
const long = juge({ messages: [entrant('2026-11-10T07:00:00Z', 'a'.repeat(300)), entrant('2026-11-09T07:00:00Z', 'b'.repeat(160))] });
dit('un message se coupe à 160 caractères avec « … » ; à 160 pile il reste entier', [160, true, 160, false],
  [long.elleADit[0].texte.length, long.elleADit[0].texte.endsWith('…'), long.elleADit[1].texte.length, long.elleADit[1].texte.endsWith('…')]);
dit('ce qu’elle a dit rend la ligne à relire, et le résumé compte ses messages', [true, '3 messages à relire', 'une note à relire'],
  [dit1.aRelire, juge({ messages }).resume, juge({ rdv: rdv({ note: NOTE }) }).resume]);

/* ── 6. La dernière note ── */
const notes = juge({ sesRdv: [venue('2026-06-02', 'racines sèches'), venue('2026-09-11', ''), venue('2026-09-20', 'annulée, pas une note', { status: 'annulé' }), rdv({ note: 'celle d’aujourd’hui' }), venue('2026-12-01', 'plus tard')] });
dit('la dernière note : celle du dernier rendez-vous honoré AVANT celui-ci qui en porte une ; ni un annulé, ni un honoré muet, ni celui-ci, ni l’avenir', { date: '2026-06-02', texte: 'racines sèches' }, notes.derniereNote);
dit('... sans venue : null', null, juge({ sesRdv: [rdv()] }).derniereNote);

/* ── 7. Les pièces (choix 5) ── */
const deux = [piece('p1', 'video', 'Classy Loc Style 1'), piece('p2', 'lien', 'Classy Loc Style 2')];
const credo = juge({ rdv: rdv({ time: '20:00', note: NOTE, pieces: deux, prixXof: 2000 }), carnet });
dit('Credo à 20 h : regarder les deux pièces avant 19 h 45, hors carnet à 2 000 F, hors des heures, à relire', [['Regarder les 2 pièces avant 19 h 45.'], 'Hors carnet : 2 000 F à la carte.', [HORS], true, 2, '2 pièces envoyées · une note à relire'],
  [credo.aPreparer, credo.compte.phrase, credo.attention, credo.aRelire, credo.pieces.length, credo.resume]);
const une = juge({ rdv: rdv({ pieces: [piece('p3', 'photo', 'Sa teinte, ColorSilk 34')] }) });
dit('une seule pièce : « la pièce » avant 9 h 45, son titre dans le résumé, à relire sans un mot', [['Regarder la pièce avant 9 h 45.'], 'Sa teinte, ColorSilk 34 · rien sur WhatsApp', true],
  [une.aPreparer, une.resume, une.aRelire]);
dit('... pièces et comptage : les deux à préparer, les pièces d’abord', ['Regarder les 2 pièces avant 9 h 45.', 'Le comptage, puis le bilan de séance.'],
  juge({ rdv: rdv({ pieces: deux }), sesRdv: [rdv({ pieces: deux })] }).aPreparer);

/* ── 8. La notification du soir et du matin (choix 2) ── */
const justine = juge({ sesRdv: [venue('2026-06-02'), rdv()] });
const mariette = juge({ rdv: rdv({ time: '14:00' }), cliente: cliente({ phone: '+33 6 12 34 56 78' }) });
const soir = notificationAvantLeFauteuil({ quand: 'soir', jour: J, briefings: [{ nom: 'Justine', heure: '10:00', b: justine }, { nom: 'Mariette', heure: '14:00', b: mariette }, { nom: 'Credo', heure: '20:00', b: credo }] });
dit('la veille au soir : « Demain, 3 têtes », celle à relire d’abord avec ses pièces, puis les autres en un mot', ['Demain, 3 têtes', 'Credo à 20 h a envoyé 2 pièces. Justine revient après 5 mois. Mariette à 14 h.'],
  [soir?.titre, soir?.texte]);
const matin = notificationAvantLeFauteuil({ quand: 'matin', jour: J, briefings: [{ nom: 'Awa', heure: '10:00', b: dette }] });
dit('le matin, une tête : « Aujourd’hui, 1 tête », et ce qu’elle doit', ['Aujourd’hui, 1 tête', 'Awa doit 5 000 F.'], [matin?.titre, matin?.texte]);
dit('... une tête qui a écrit sans pièce : « a écrit, à relire » ; une première venue', ['Bola à 10 h a écrit, à relire. Chadé, première venue.'],
  [notificationAvantLeFauteuil({ quand: 'matin', jour: J, briefings: [{ nom: 'Chadé', heure: '09:00', b: premiere }, { nom: 'Bola', heure: '10:00', b: juge({ messages }) }] })?.texte]);
dit('sans rendez-vous : rien', null, notificationAvantLeFauteuil({ quand: 'soir', jour: J, briefings: [] }));
const foule = notificationAvantLeFauteuil({ quand: 'soir', jour: J, briefings: Array.from({ length: 12 }, (_, i) => ({ nom: `Cliente Numéro ${i + 1} Au Nom Très Long`, heure: `${String(9 + i).padStart(2, '0')}:00`, b: credo })) });
dit('douze têtes : le texte tient en 300 caractères et finit par « … »', [true, true, 'Demain, 12 têtes'], [(foule?.texte.length ?? 0) <= 300, foule?.texte.endsWith('…'), foule?.titre]);

/* ── 9. L’écriture de la Maison ── */
const toutDit = [ord, dette, retour, premiere, tout, incluse, horsCarnet, credo, une, dit1].flatMap((b) => [b.compte.phrase, b.resume, ...b.attention, ...b.aPreparer, ...b.elleADit.map((d) => d.texte)]).concat(soir?.titre ?? '', soir?.texte ?? '');
dit('ni tiret cadratin ni point d’exclamation dans ce que la ligne dit', [false, false], [toutDit.some((t) => t.includes('—')), toutDit.some((t) => /!/.test(t))]);
const pur = sansCommentaires(readFileSync('src/shared/avant-le-fauteuil-pur.ts', 'utf8'));
const agenda = readFileSync('src/shared/agenda.ts', 'utf8');
dit('le juge n’importe rien d’agenda.ts ; le rendez-vous porte `pieces` du type emprunté au juge', [false, true, true],
  [/from '\.\/agenda'/.test(pur), /import type \{ PieceEnvoyee \} from '\.\/avant-le-fauteuil-pur';/.test(agenda), /^\s+pieces\?: PieceEnvoyee\[\];/m.test(agenda)]);
dit('pas de tiret cadratin dans le code du juge', false, /—/.test(pur));

console.log(ko === 0 ? '\nAvant le fauteuil tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
