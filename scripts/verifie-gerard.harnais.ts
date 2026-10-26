/* GÉRARD, ÉPROUVÉ — 26 octobre 2026.
   `node scripts/verifie-gerard.mjs` (et `--prouve`).

   Le cerveau de Gérard sur des fiches fabriquées dont on connaît la
   réponse : le fil, l'envie, garder un RDV, l'anniversaire, tout combiner,
   les jours creux, les relances, Noël, la question franche ; puis l'écran
   et la barre. Les clientes sont des initiales. */
import { readFileSync } from 'node:fs';
import {
  ANNIV_VALABLE_JOURS, ENDORMIE_FOIS_MAX, MODELES_DE_GERARD, REMISES_PAR_SEMAINE,
  choisisLEnvie, dateDeCadence, estUneQuestionFranche, familleDuNom, filDeLaCliente, heureDite, jourDit, joursCreux, planDuJour,
  plusJours, remplis, situationDuJour,
  ESSAI_MAX, reglagesLus,
  type ContexteDeGerard, type FicheDeGerard, type RdvDeGerard,
} from '../src/shared/gerard-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '2026-10-26';
const venue = (date: string, familles: RdvDeGerard['familles'] = ['resserrage'], time = '10:00'): RdvDeGerard => ({ id: `v-${date}`, date, time, status: 'honoré', familles, venu: true });
const fiche = (o: Partial<FicheDeGerard> = {}): FicheDeGerard => ({
  id: 'c1', appel: 'Madame K.', soinDit: 'resserrage des racines', accord: true, stop: false, couronne: false, telephone: true, ecartee: false,
  soucis: [], rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -30))], traces: [], cadence: { iso: plusJours(A, 26), rythmeJours: 56 }, ...o,
});
const places = [{ iso: '2026-10-28', heure: '10:00' }, { iso: '2026-10-29', heure: '14:00' }];
const ctx = (o: Partial<ContexteDeGerard> = {}): ContexteDeGerard => ({ aujourdhui: A, creux: [], remisesRestantes: REMISES_PAR_SEMAINE, placesDe: () => places, ...o });
const sit = (f: FicheDeGerard, c: ContexteDeGerard = ctx()) => situationDuJour(f, c);

/* ── 1. Les mots ── */
dit('les familles d’après le nom du catalogue', ['resserrage', 'hydratation', 'lavage', 'coiffure', 'couleur', 'autre'],
  ['SÍNSIN™ Essentiel · La Reprise', 'DÀNDÀN™ · Le Soin Hydratant', 'KLƆKLƆ™ Essentiel · « Le Souffle »', 'Coiffure Événement', 'YÈKPÈ™ Couleur', 'Droit de service · Shampoing apporté · Essentiel'].map(familleDuNom));
dit('une date de cliente porte l’année, le 1er se dit « 1er »', ['mardi 3 novembre 2026', 'mardi 1er décembre 2026', '12 h 15', '10 h'],
  [jourDit('2026-11-03'), jourDit('2026-12-01'), heureDite('12:15'), heureDite('10:00')]);
dit('un modèle se remplit variable par variable, et finit par la signature « Maison MND », jamais « Gérard »', 'Bonjour Madame K., votre resserrage des racines est mardi 3 novembre 2026 à 10 h. C’est toujours bon pour vous ?\n\nMaison MND',
  remplis(MODELES_DE_GERARD.garder.corps, ['Madame K.', 'resserrage des racines', 'mardi 3 novembre 2026 à 10 h']));
dit('chaque modèle a un nom Meta, au plus trois boutons, jamais de prix, jamais le mot « code » (Meta le rangerait en Authentification), jamais « Gérard » ni « devait revenir »', true,
  Object.values(MODELES_DE_GERARD).every((m) => /^gerard_[a-z_]+$/.test(m.nom) && m.boutons.length <= 3 && !/\d\s?(F|FCFA|XOF)\b/.test(m.corps) && !/\bcodes?\b/i.test(m.corps)
    && !/Gérard|devait revenir|arrive vers/.test(m.corps)));

/* ── 2. La date de cadence et le fil ── */
const rdvPose = { id: 'p', date: '2026-12-08', time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false } as RdvDeGerard;
dit('la date de cadence : le RDV posé d’abord, sinon la Cadence', [{ iso: '2026-12-08', posee: true }, { iso: plusJours(A, 26), posee: false }],
  [dateDeCadence(fiche({ rdvs: [venue('2026-09-15'), rdvPose] }), A), dateDeCadence(fiche(), A)]);
const fil8 = filDeLaCliente(fiche({ rdvs: [venue('2026-10-06')], cadence: { iso: '2026-12-01', rythmeJours: 56 } }), A);
dit('le fil de 8 semaines : bilan, point d’après, une envie à J+30, tout combiner à J+49, la date', [[0, 'La séance'], [1, 'Le bilan de la séance'], [7, 'Le point d’après'], [30, 'Une envie'], [49, 'Tout combiner'], [56, 'Sa date de cadence']],
  fil8.map((p) => [p.jour, p.quoi]));
const fil12 = filDeLaCliente(fiche({ rdvs: [venue('2026-09-15'), rdvPose] }), A);
dit('le fil de 12 semaines, RDV posé : deux envies, le point d’avant (déjà au Trône), garder à J-2', [30, 60, 77, 82, 84],
  fil12.filter((p) => p.jour > 7).map((p) => p.jour));
dit('... le point d’avant et le RDV sont « déjà au Trône », les envies et garder sont à Gérard', [false, false, true, false, true],
  fil12.filter((p) => p.jour > 7).map((p) => p.existant));

/* ── 3. Garder un RDV ── */
const rdvDans2 = (creeLe?: string): RdvDeGerard => ({ id: 'g', date: plusJours(A, 2), time: '10:00', status: 'confirmé', familles: ['resserrage'], venu: false, creeLe });
const g = sit(fiche({ rdvs: [venue(plusJours(A, -40)), rdvDans2(`${plusJours(A, -10)}T09:00:00.000Z`)] }));
dit('garder : deux jours avant un RDV pris depuis plus d’une semaine, sur WhatsApp, modèle utilitaire', ['garder', 'whatsapp', 'garder', true],
  [g?.genre, g?.canal, g?.modele, /est mercredi 28 octobre 2026 à 10 h\. C’est toujours bon pour vous \?\n\nMaison MND$/.test(g?.texte ?? '')]);
dit('... pris il y a trois jours : on ne le garde pas', true, sit(fiche({ rdvs: [venue(plusJours(A, -40)), rdvDans2(`${plusJours(A, -3)}T09:00:00.000Z`)] }))?.genre !== 'garder');
dit('... même « stop », un RDV se garde (c’est un service)', 'garder', sit(fiche({ stop: true, accord: false, rdvs: [venue(plusJours(A, -40)), rdvDans2()] }))?.genre);

/* ── 4. L'anniversaire ── */
const an = sit(fiche({ birthday: '1990-10-26' }));
dit('l’anniversaire, le jour même : son code de 10 %, trente jours', ['anniversaire', 'ANNIV', 10, plusJours(A, ANNIV_VALABLE_JOURS)], [an?.genre, an?.code?.mot, an?.code?.pct, an?.code?.jusquau]);
dit('... déjà fêtée cette année, ou sans accord ni Ma Couronne : pas de vœux', [true, true],
  [sit(fiche({ birthday: '1990-10-26', birthdayGiftAt: '2026-10-26T08:00:00Z' }))?.genre !== 'anniversaire', sit(fiche({ birthday: '1990-10-26', accord: false }))?.genre !== 'anniversaire']);

/* ── 5. Le fil : l'envie, tout combiner ── */
const e1 = sit(fiche());
dit('une envie par mois : à J+30, avant que la cadence approche', ['envie', 'couronne-ou-whatsapp'], [e1?.genre, e1 ? 'couronne-ou-whatsapp' : '']);
dit('... « cheveux secs » au point d’après : le soin hydratant, le modèle qui le dit', ['hydratation', 'envie_soin_secs'],
  [sit(fiche({ soucis: ['seches'] }))?.envie, sit(fiche({ soucis: ['seches'] }))?.modele]);
dit('... une envie il y a vingt jours : pas encore', null, sit(fiche({ traces: [{ quand: `${plusJours(A, -20)}T09:00:00Z`, genre: 'envie', envie: 'lavage' }] })));
dit('... la cadence à 15 jours : pas d’envie, « tout combiner » arrive', null, sit(fiche({ cadence: { iso: plusJours(A, 15), rythmeJours: 45 } })));
const comb = sit(fiche({ rdvs: [venue(plusJours(A, -100)), venue(plusJours(A, -49))], cadence: { iso: plusJours(A, 7), rythmeJours: 56 } }));
dit('tout combiner, sept jours avant une date de cadence sans RDV : deux places, la coiffure offerte avec un soin', ['combiner', true],
  [comb?.genre, /est prévu vers le lundi 2 novembre 2026\. Nous avons de la place mercredi 28 octobre 2026 à 10 h ou jeudi 29 octobre 2026 à 14 h : je vous en garde une \? Avec un soin ajouté le même jour, votre coiffure de sortie est offerte\.\n\nMaison MND$/.test(comb?.texte ?? '')]);
dit('... RDV posé à sept jours : le point d’avant du Trône s’en charge, Gérard se tait', null,
  sit(fiche({ rdvs: [venue(plusJours(A, -50)), { ...rdvPose, date: plusJours(A, 7) }] })));
dit('sans accord ni Ma Couronne, une envie ne part pas ; avec Ma Couronne, elle part en notification', [null, 'couronne'],
  [sit(fiche({ accord: false })), sit(fiche({ accord: false, couronne: true }))?.canal]);
dit('une cliente écartée (passage, diaspora, locks défaits) : rien', null, sit(fiche({ ecartee: true, birthday: '1990-10-26' })));

/* ── 6. Le choix de l'envie ── */
const avecCouleur = fiche({ rdvs: [venue('2026-06-10', ['couleur']), venue(plusJours(A, -30))] });
dit('l’envie : sa couleur a plus de 90 jours, une retouche ; jamais la même deux fois ; une refusée attend trois mois (en octobre, pas encore la coiffure des fêtes)', ['couleur', 'lavage', 'hydratation'],
  [choisisLEnvie(avecCouleur, A),
    choisisLEnvie({ ...avecCouleur, traces: [{ quand: '2026-09-20T09:00:00Z', genre: 'envie', envie: 'couleur' }] }, A),
    choisisLEnvie({ ...avecCouleur, traces: [{ quand: '2026-08-20T09:00:00Z', genre: 'envie', envie: 'couleur', reponse: 'non' }, { quand: '2026-09-20T09:00:00Z', genre: 'envie', envie: 'lavage' }] }, A)]);
const aMidi = fiche({ rdvs: ['2026-08-04', '2026-08-25', '2026-09-15', plusJours(A, -30)].map((d) => venue(d, ['resserrage'], '12:30')) });
dit('... elle vient en semaine entre 11 h et 14 h : midi et deux', 'midi-deux', choisisLEnvie({ ...aMidi, cadence: { iso: plusJours(A, 26), rythmeJours: 30 } }, '2026-10-26'));

/* ── 7. Les jours creux ── */
const parJour = new Map([['2026-10-29', 2], ['2026-10-30', 5], ['2026-10-31', 1], ['2026-11-02', 0]]);
const creux = joursCreux({ aujourdhui: A, parJour, ordinaireDe: () => 5, ouvertLe: (j) => j !== '2026-11-01' && j !== '2026-11-02', remisesRestantes: 6 });
dit('les jours creux de 3 à 7 jours : le manque sous l’ordinaire, la semaine plafonne les remises', [['2026-10-29', 3, 3], ['2026-10-31', 4, 3]],
  creux.map((j) => [j.iso, j.manque, j.remises]));
const viaCreux = sit(fiche(), ctx({ creux: [{ iso: '2026-10-29', poses: 2, ordinaire: 5, manque: 3, remises: 3 }], placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }, { iso: jour, heure: '15:00' }] : places) }));
dit('un jour creux change l’envie en place à −15 %, avec son code d’un jour', ['creux', 'CREUX', 15, '2026-10-29', true],
  [viaCreux?.genre, viaCreux?.code?.mot, viaCreux?.code?.pct, viaCreux?.code?.jour, /jeudi 29 octobre 2026 à 11 h ou à 15 h, et ce jour-là votre resserrage des racines est à −15 %/.test(viaCreux?.texte ?? '')]);

/* ── 8. Les relances ── */
const retard = fiche({ rdvs: [venue(plusJours(A, -90)), venue(plusJours(A, -55))], cadence: { iso: plusJours(A, -20), rythmeJours: 35 } });
dit('en retard : dix jours après la date attendue, deux places', ['retard', true], [sit(retard)?.genre, /votre prochain resserrage des racines était prévu vers le mardi 6 octobre 2026\./.test(sit(retard)?.texte ?? '')]);
dit('... relancée il y a trois semaines : pas avant quatre', null, sit({ ...retard, traces: [{ quand: `${plusJours(A, -21)}T09:00:00Z`, genre: 'retard' }] }));
const unique = fiche({ rdvs: [venue(plusJours(A, -70), ['autre'])], cadence: { iso: plusJours(A, -40), rythmeJours: 30 } });
dit('une seule venue : jamais « en retard », le message de la première venue', ['une-venue', 'une_venue'], [sit(unique)?.genre, sit(unique)?.modele]);
const dort = fiche({ rdvs: [venue('2026-01-10'), venue('2026-03-20')], cadence: { iso: null, rythmeJours: 70 } });
dit('endormie (5 mois et plus) : trois fois au plus, six semaines d’écart', ['endormie', null, null],
  [sit(dort)?.genre,
    sit({ ...dort, traces: Array.from({ length: ENDORMIE_FOIS_MAX }, (_, i) => ({ quand: `${plusJours(A, -60 - 50 * i)}T09:00:00Z`, genre: 'endormie' as const })) }),
    sit({ ...dort, traces: [{ quand: `${plusJours(A, -35)}T09:00:00Z`, genre: 'endormie' }] })]);

/* ── 9. Noël ── */
const decembre = fiche({ rdvs: [venue('2026-10-20'), venue('2026-11-20')], cadence: { iso: '2027-01-10', rythmeJours: 51 } });
dit('du 1er au 15 décembre, dans le fil : les places des fêtes et la carte cadeau, sans code', ['noel', undefined],
  [situationDuJour(decembre, ctx({ aujourdhui: '2026-12-03' }))?.genre, situationDuJour(decembre, ctx({ aujourdhui: '2026-12-03' }))?.code]);

/* ── 10. Le plan du jour ── */
const fiches = [
  fiche({ id: 'a', rdvs: [venue(plusJours(A, -40)), rdvDans2()] }),
  fiche({ id: 'b' }),
  fiche({ id: 'c' }),
  fiche({ id: 'd', ecartee: true }),
];
const plan = planDuJour(fiches, ctx({ creux: [{ iso: '2026-10-29', poses: 4, ordinaire: 5, manque: 1, remises: 1 }], remisesRestantes: 1, placesDe: (_id, jour) => (jour ? [{ iso: jour, heure: '11:00' }] : places) }));
dit('le plan : une chose par cliente, garder d’abord, le jour creux à qui reste une remise, l’autre reçoit son envie', [['a', 'garder'], ['b', 'creux'], ['c', 'envie']],
  plan.map((s) => [s.clientId, s.genre]));

/* ── 11. La question franche ── */
dit('la question franche se reconnaît', [true, true, true, true, false, false, false],
  ['Je parle à Gérard ou c’est un robot ?', 'je parle à qui là', 'C’est bien Gérard ?', 'vous êtes un humain ?', 'Mardi 10h svp', 'Je veux le programme de pousse', 'je viens avec une personne'].map(estUneQuestionFranche));

/* ── 12. Les réglages ── */
dit('les réglages livrés : éteint, essai vide ; jamais plus de cinq clientes dans l’essai', ['eteint', 0, 5],
  [reglagesLus(undefined).mode, reglagesLus(undefined).essai.length, reglagesLus({ mode: 'essai', essai: ['1', '2', '3', '4', '5', '6', '7'] }).essai.length]);
dit('... la limite de l’essai reste cinq', 5, ESSAI_MAX);

/* ── 13. L'écran et la barre ── */
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/clients/Gerard.tsx', 'utf8'));
dit('l’écran : le plan par le cerveau, la date manquée d’une cliente en retard, la venue du Carnet', [true, true, true],
  [/planDuJour\(fiches, ctx\)/.test(ecran), /cad\.overdueDays > 0 \? addDaysISO\(today, -cad\.overdueDays\) : cad\.iso/.test(ecran),
    ecran.includes('encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id)')]);
dit('... il dit qu’il n’écrit pas encore', true, /Gérard n’écrit pas encore/.test(ecran));
const routes = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
dit('la barre : Gérard en Clientèle, sous Clientes, et nommé parmi les écrans nés après les départements', [true, true],
  [routes.indexOf("path: '/gerard'") > routes.indexOf("path: '/customers'") && routes.indexOf("path: '/gerard'") < routes.indexOf("path: '/carnet'"),
    /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/gerard'/.test(routes)]);
dit('pas de tiret cadratin dans ce que l’écran et le cerveau disent', [false, false],
  [/—/.test(ecran), /—/.test(sansCommentaires(readFileSync('src/shared/gerard-pur.ts', 'utf8')))]);

console.log(ko === 0 ? '\nGérard tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
