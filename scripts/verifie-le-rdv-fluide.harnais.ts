/* LE « + RDV » EN TROIS QUESTIONS, EPROUVE — 24 octobre 2026.
   `node scripts/verifie-le-rdv-fluide.mjs` (et `--prouve`).

   « Create a smart and intelligent system to make appointments. There are
   too many info and it must be easy to navigate and smart ready » (Yeman) ;
   maquette X5FzkB4m..., ses arbitrages : qui, quoi, quand sous une seule case,
   la semaine directement, une heure prise posee avec sa raison, seuls les
   fauteuils pleins bloquent, creer et modifier ensemble.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires des arbitrages et calcules a la
   main, jamais du code eprouve. Le cablage de la fenetre se lit dans la
   source, commentaires effaces. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ancreDeLaSemaine, bloqueLaPose, ceQuiReste, debutDeLaSemaine, lundiDe, placesDuJour, prestationsDeLaCase,
  raisonDeLHeure, rangeeSuivante, septJours, type Occupant,
} from '../src/apps/trone/routes/clients/rdv-fluide-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 240)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 240)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const fenetre = source('src/apps/trone/routes/clients/_shared.tsx');

const OUVERT = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 };
const FERME = { closed: true, openMin: 0, closeMin: 0 };
/* Deux retwists de Team qui se chevauchent : 10:00-12:30 et 10:30-13:00. */
const DEUX: Occupant[] = [
  { maitre: 'Team', debutMin: 600, dureeMin: 150, qui: 'A. K.' },
  { maitre: 'Team', debutMin: 630, dureeMin: 150, qui: 'M. B.' },
];
const jour = { iso: '2026-10-28', aujourdhui: '2026-10-24', maintenantMin: 0, ouverture: OUVERT, durationMin: 150, bloques: [] as [number, number][] };
const TOUTES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

/* ══ #1 — LES PLACES SE COMPTENT AUX FAUTEUILS ══ */
dit(1, 'deux fauteuils, deux retwists de 10:00 et 10:30 : la premiere place pour 2 h 30 est 12:30, la derniere 16:30',
  ['12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'],
  placesDuJour({ ...jour, occupes: DEUX, sieges: 2 }).heures);
dit(1, 'Team qui recoit deja ne ferme rien tant qu un fauteuil reste : trois fauteuils, toute la journee',
  TOUTES, placesDuJour({ ...jour, occupes: DEUX, sieges: 3 }).heures);
dit(1, 'un ancien rendez-vous sans maitre ne passe pas pour le sien (fauteuils non comptes)',
  TOUTES, placesDuJour({ ...jour, occupes: [{ maitre: '', debutMin: 540, dureeMin: 600 }], sieges: 0 }).heures);
dit(1, 'un creneau bloque de 14:00 a 15:00 retire les departs qui le touchent',
  ['15:00', '15:30', '16:00', '16:30'], placesDuJour({ ...jour, occupes: DEUX, sieges: 2, bloques: [[840, 900]] }).heures);
dit(1, 'aujourd hui a 13:10, les heures passees tombent',
  ['13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'],
  placesDuJour({ ...jour, aujourdhui: '2026-10-28', maintenantMin: 13 * 60 + 10, occupes: DEUX, sieges: 2 }).heures);
dit(1, 'un jour ferme, un jour passe : aucune place, et ils le disent',
  [{ iso: '2026-10-28', ferme: true, passe: false, heures: [] }, { iso: '2026-10-20', ferme: false, passe: true, heures: [] }],
  [placesDuJour({ ...jour, ouverture: FERME, occupes: [], sieges: 2 }), placesDuJour({ ...jour, iso: '2026-10-20', occupes: [], sieges: 2 })]);

/* ══ #2 — LA RAISON DE L'HEURE : les fauteuils pleins bloquent, le reste se dit ══ */
const raison = (o: Partial<Parameters<typeof raisonDeLHeure>[0]>) => raisonDeLHeure({
  heure: '11:00', durationMin: 150, maitre: 'Team', ouverture: OUVERT, occupes: DEUX, bloques: [], sieges: 2,
  jourDit: 'mercredi 28 octobre 2026', premiereLibre: '12:30', ...o,
});
dit(2, 'deux fauteuils occupes a 11:00 : bloque, et la premiere place libre proposee', {
  bloque: true, texte: 'Les 2 fauteuils sont occupés le mercredi 28 octobre 2026 à 11:00 : cette heure est pleine. Première place libre ce jour-là : 12:30.',
}, raison({}));
dit(2, 'un seul fauteuil, et plus aucune place ce jour-la', {
  bloque: true, texte: 'Le fauteuil est occupé le mercredi 28 octobre 2026 à 11:00 : cette heure est pleine. Plus aucune place ce jour-là.',
}, raison({ sieges: 1, occupes: [DEUX[0]], premiereLibre: null }));
dit(2, 'trois fauteuils : Team recoit deja, la raison se dit et l heure se pose', {
  bloque: false, texte: 'Team reçoit déjà A. K. de 10:00 à 12:30, et 1 autre. Le rendez-vous se pose quand même.',
}, raison({ sieges: 3 }));
dit(2, 'Expert est libre a cette heure : rien a dire', null, raison({ sieges: 3, maitre: 'Expert' }));
dit(2, 'jour ferme, hors des heures, creneau bloque : dits, jamais bloquants', [
  { bloque: false, texte: 'La Maison est fermée le mercredi 28 octobre 2026. Le rendez-vous se pose quand même.' },
  { bloque: false, texte: 'Hors des heures d’ouverture : la Maison ouvre de 09:00 à 19:00, le rituel irait de 17:30 à 20:00. Le rendez-vous se pose quand même.' },
  { bloque: false, texte: 'Un créneau est bloqué au planning à cette heure pour Team. Le rendez-vous se pose quand même.' },
], [
  raison({ ouverture: FERME, occupes: [] }),
  raison({ heure: '17:30', occupes: [] }),
  raison({ heure: '14:00', occupes: [], bloques: [[840, 900]] }),
]);

/* ══ #3 — LE BLOCAGE NE VAUT QUE POUR CE QUI BOUGE ══ */
{
  const plein = { bloque: true, texte: 'pleins' };
  const base = { raison: plein, statut: 'confirmé', date: '2026-10-28', time: '11:00', dureeMin: 150 };
  const relu = { date: '2026-10-28', time: '11:00', dureeMin: 150 };
  dit(3, 'nouveau : bloque ; relu sans bouger : libre ; deplace : bloque ; annule : libre ; allonge : bloque ; raison seulement dite : libre',
    [true, false, true, false, true, false],
    [
      bloqueLaPose(base),
      bloqueLaPose({ ...base, relu }),
      bloqueLaPose({ ...base, relu: { ...relu, time: '09:00' } }),
      bloqueLaPose({ ...base, statut: 'annulé' }),
      bloqueLaPose({ ...base, dureeMin: 180, relu }),
      bloqueLaPose({ ...base, raison: { bloque: false, texte: 'dit' } }),
    ]);
  /* « Poser quand meme » : la main du Trone passe outre (24 octobre 2026). */
  dit(3, 'poser quand meme leve le blocage des fauteuils pleins, nouveau comme deplace', [false, false],
    [bloqueLaPose({ ...base, force: true }), bloqueLaPose({ ...base, relu: { ...relu, time: '09:00' }, force: true })]);
  /* Un rituel honore a eu lieu : relu, meme allonge par un recalcul, il ne se rejuge pas (24 octobre 2026). */
  dit(3, 'un rituel honore relu, allonge ou non : jamais bloque', [false, false],
    [bloqueLaPose({ ...base, statut: 'honoré', dureeMin: 180, relu }), bloqueLaPose({ ...base, statut: 'honoré', relu: { ...relu, time: '09:00' } })]);
  /* Et voir les reglements d'un rituel regle n'exige pas de l'enregistrer s'il n'a pas bouge. */
  const modale = source('src/apps/trone/routes/clients/_shared.tsx');
  const ds = source('src/ds/ds.css');
  dit(3, 'les reglements s ouvrent sans enregistrer un rendez-vous inchange ; le calendrier du champ passe devant la fenetre', [true, true, true], [
    modale.includes('if (!rienNaBouge && !save(status)) return;'),
    modale.includes('onClick={voirLesReglements}>'),
    /\.mnd-date__pop \{[^}]*z-index: calc\(var\(--z-modal\) \+ 60\)/.test(ds),
  ]);
}

/* ══ #4 — LA SEMAINE DIRECTEMENT : la sienne, jamais un jour passe a la creation ══ */
dit(4, 'le lundi d un samedi, d un lundi, d un dimanche', ['2026-10-19', '2026-10-26', '2026-10-26'],
  [lundiDe('2026-10-24'), lundiDe('2026-10-26'), lundiDe('2026-11-01')]);
dit(4, 'reprise mercredi 28 : sa semaine ; dimanche 25 : a partir d aujourd hui ; un rendez-vous relu : sa semaine entiere',
  ['2026-10-26', '2026-10-24', '2026-10-19'],
  [debutDeLaSemaine('2026-10-28', '2026-10-24', false), debutDeLaSemaine('2026-10-25', '2026-10-24', false), debutDeLaSemaine('2026-10-25', '2026-10-24', true)]);
/* 24 octobre 2026 : « la date d'aujourd'hui doit etre proposee quand on ouvre Quand ? » (Yeman) :
   la reprise n'ouvre plus la semaine. */
dit(4, 'l ancre : le jour du rendez-vous, sinon aujourd hui (la reprise ne l ouvre plus)', ['2026-11-03', '2026-10-24', '2026-10-24', '2026-10-24'], [
  ancreDeLaSemaine({ dateDuRdv: '2026-11-03', reprise: '2026-10-28', aujourdhui: '2026-10-24' }),
  ancreDeLaSemaine({ reprise: '2026-10-28', aujourdhui: '2026-10-24' }),
  ancreDeLaSemaine({ reprise: '2026-10-01', aujourdhui: '2026-10-24' }),
  ancreDeLaSemaine({ reprise: null, aujourdhui: '2026-10-24' }),
]);
dit(4, 'sept jours, a cheval sur deux mois', ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], septJours('2026-10-29'));

/* ══ #5 — LA RANGEE A OUVRIR ET CE QUI RESTE ══ */
dit(5, 'qui, puis quoi, puis quand, puis tout se replie', ['qui', 'quoi', 'quand', ''], [
  rangeeSuivante({ qui: false, quoi: true, quand: true }),
  rangeeSuivante({ qui: true, quoi: false, quand: false }),
  rangeeSuivante({ qui: true, quoi: true, quand: false }),
  rangeeSuivante({ qui: true, quoi: true, quand: true }),
]);
dit(5, 'la barre dit ce qui reste', ['Reste : la cliente, les prestations, puis le moment.', 'Reste : les prestations, puis le moment.', 'Reste : le moment.', null], [
  ceQuiReste({ qui: false, quoi: false, quand: false }),
  ceQuiReste({ qui: true, quoi: false, quand: false }),
  ceQuiReste({ qui: true, quoi: true, quand: false }),
  ceQuiReste({ qui: true, quoi: true, quand: true }),
]);

/* ══ #6 — LA CASE UNIQUE TROUVE AUSSI LES PRESTATIONS ══ */
{
  const cat = [
    { id: 'retwist', name: 'Retwist' }, { id: 'soin', name: 'Soin hydratant' }, { id: 'kit', name: 'Rituel 229' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `rt${i}`, name: `Retwist ${i + 1}` })),
  ];
  const repond = (sv: { name: string }, q: string) => sv.name.toLowerCase().includes(q.toLowerCase());
  dit(6, 'des chiffres cherchent une cliente ; une lettre ne suffit pas ; deja posee ou au-dela de six, rien', [[], [], [], ['rt0', 'rt1', 'rt2', 'rt3', 'rt4', 'rt5']], [
    prestationsDeLaCase('229', cat, repond, []).map((s) => s.id),
    prestationsDeLaCase('01 51 99', cat, repond, []).map((s) => s.id),
    prestationsDeLaCase('r', cat, repond, []).map((s) => s.id),
    prestationsDeLaCase('retw', cat, repond, ['retwist']).map((s) => s.id),
  ]);
}

/* ══ #7 — LE CABLAGE DE LA FENETRE ══ */
{
  const poseLeMoment = (() => {
    const i = fenetre.indexOf('const poseLeMoment = ');
    return i < 0 ? '' : fenetre.slice(i, fenetre.indexOf('\n  };', i));
  })();
  dit(7, 'les fauteuils sans le rendez-vous relu ; le blocage garde a l enregistrement et aux quatre boutons ; le moment se choisit', [true, true, true, true, 4, true], [
    /const occupesDe = \(iso: string\): Occupant\[\] => branchAppts\n\s*\.filter\(\(a\) => a\.date === iso && a\.status !== 'annulé' && a\.id !== appt\?\.id\)/.test(fenetre),
    /const sieges = Math\.max\(0, branch\.seats \?\? 0\);/.test(fenetre) && /bloques: plagesBloquees\(blocages, branch\.id, iso, master\),\n\s*sieges,/.test(fenetre),
    /if \(bloque && chosenStatus !== 'annulé'\) \{/.test(fenetre),
    /onClick=\{\(\) => save\('confirmé'\)\} disabled=\{!pret \|\| bloque\}/.test(fenetre),
    (fenetre.match(/disabled=\{!pret \|\| bloque\}/g) ?? []).length,
    /const \[momentChoisi, setMomentChoisi\] = useState\(!!appt \|\| !!initial\?\.time\);/.test(fenetre),
  ]);
  dit(7, 'cree replie sur la bonne question, relu tout replie ; les rangees gardent leur saisie ; une place ne change jamais de maitre ; la reprise sur ses venues honorees ; la case unique', [true, true, true, true, true, true], [
    /useState<Rangee>\(\(\) => \(appt \? '' : rangeeSuivante\(\{/.test(fenetre),
    /<div className="trc-rang__corps" hidden=\{!ouverte\}>\{children\}<\/div>/.test(fenetre),
    poseLeMoment.includes('setMomentChoisi(true)') && !/setMaster/.test(poseLeMoment),
    /predictNextVisit\(tousLesRdv\.filter\(\(a\) => a\.status === 'honoré' && a\.id !== appt\?\.id\)/.test(fenetre),
    /caseUnique=\{\{\n\s*prestations: \(q\) => prestationsDeLaCase\(q, proposables,/.test(fenetre) && /const display = open \? query : caseUnique \? '' :/.test(fenetre),
    !/position: 'sticky', top: -1/.test(fenetre),
  ]);
}

console.log(ko === 0 ? 'Le + RDV tient ses arbitrages.' : `${ko} constat(s) en echec.`);
