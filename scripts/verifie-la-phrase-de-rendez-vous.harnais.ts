/* LA PHRASE ENTIERE, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-phrase-de-rendez-vous.mjs` (et `--prouve`).

   « Faire a present taper une phrase entiere dans la case (« Mireille
   retwist mercredi a 10h ») sur le Trone, le site et Ma Couronne » (Yeman).
   La regle : src/shared/phrase-de-rendez-vous-pur.ts. Aujourd'hui est le
   samedi 24 octobre 2026. TOUS LES ATTENDUS SONT ECRITS A LA MAIN.
   Tout est invente. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { litLaPhrase, estUnePhrase, departage, type LectureDeLaPhrase } from '../src/shared/phrase-de-rendez-vous-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 230)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 230)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

const JOUR = '2026-10-24';
const PRESTATIONS = [
  { id: 'retwist', name: 'Retwist' }, { id: 'soin-h', name: 'Soin hydratant' }, { id: 'soin-p', name: 'Soin profond' },
  { id: 'kloklo', name: 'KLƆKLƆ™ Essentiel' }, { id: 'sinsin', name: 'SÍNSIN™ Signature' }, { id: 'creation', name: 'Création de locks' },
];
const UNE = [{ id: 'mir', name: 'Mireille A.', phone: '0100000042' }, { id: 'awa', name: 'Awa K.' }];
const DEUX = [...UNE, { id: 'mir2', name: 'Mireille Kpossou' }];
const MAITRES = ['Team', 'Expert', 'Teckle', 'Gérard'];
const lis = (phrase: string, o: { clientes?: typeof UNE; minutes?: number } = {}) =>
  litLaPhrase(phrase, { aujourdhui: JOUR, minutes: o.minutes ?? 14 * 60, prestations: PRESTATIONS, clientes: o.clientes ?? UNE, maitres: MAITRES });
const l = (p: Partial<LectureDeLaPhrase>): LectureDeLaPhrase => ({
  clientes: [], prestations: [], doutes: [], jour: null, heure: null, maitre: null, reste: [], vide: false, ...p,
});

/* ══ #1 — L'HEURE ══ */
dit(1, '« a 10h », « 10h30 », « a midi », « 3h de l apres-midi », « a 10 », « 9 h et demie »',
  ['10:00', '10:30', '12:00', '15:00', '10:00', '09:30'],
  [lis('retwist mercredi à 10h').heure, lis('retwist mercredi 10h30').heure, lis('aujourd’hui à midi').heure,
    lis('mercredi 3h de l’après-midi').heure, lis('retwist mercredi a 10').heure, lis('vendredi 9 h et demie').heure]);

/* ══ #2 — LE JOUR DE LA SEMAINE : le prochain ; aujourd'hui tant que l'heure n'est pas passee ══ */
dit(2, 'mercredi ; samedi 10h a 14h (passe : le suivant) ; samedi 10h a 8h (aujourd hui) ; samedi prochain', ['2026-10-28', '2026-10-31', '2026-10-24', '2026-10-31'],
  [lis('mercredi').jour, lis('retwist samedi 10h', { minutes: 14 * 60 }).jour, lis('retwist samedi 10h', { minutes: 8 * 60 }).jour, lis('samedi prochain', { minutes: 8 * 60 }).jour]);

/* ══ #3 — LES DATES : demain, le 3 novembre, 28/10, le 2, une date passee va a l annee suivante ══ */
dit(3, 'demain ; apres-demain ; le 3 novembre ; 28/10 ; le 2 ; 15 janvier ; 1er decembre', ['2026-10-25', '2026-10-26', '2026-11-03', '2026-10-28', '2026-11-02', '2027-01-15', '2026-12-01'],
  [lis('demain').jour, lis('après-demain').jour, lis('le 3 novembre à 9h').jour, lis('28/10 à 15h30').jour, lis('le 2 à 10h').jour, lis('15 janvier').jour, lis('le 1er décembre').jour]);

/* ══ #4 — LA PHRASE DE YEMAN, ET SES SOEURS ══ */
dit(4, 'Mireille retwist mercredi a 10h', l({ clientes: ['mir'], prestations: ['retwist'], jour: '2026-10-28', heure: '10:00' }), lis('Mireille retwist mercredi à 10h'));
dit(4, 'deux prestations dites ; kloklo pour KLOKLO ; sinsin sans accent', [['retwist', 'soin-h'], ['kloklo'], ['sinsin']],
  [lis('mireille retwist + soin hydratant mercredi 10h30').prestations, lis('le 3 novembre à 9h kloklo').prestations, lis('28/10 à 15h30 sinsin').prestations]);
dit(4, 'Awa demain 14 h avec Teckle', l({ clientes: ['awa'], jour: '2026-10-25', heure: '14:00', maitre: 'Teckle' }), lis('Awa demain 14 h avec Teckle'));
dit(4, 'creation de locks vendredi 9h30', l({ prestations: ['creation'], jour: '2026-10-30', heure: '09:30' }), lis('création de locks vendredi 9h30'));

/* ══ #5 — LE DOUTE : un mot qui designe deux prestations autant l une que l autre ══ */
dit(5, '« soin » : un doute, jamais un choix ; « soin hydratant » : choisi', [
  l({ doutes: [{ mot: 'soin', ids: ['soin-h', 'soin-p'] }], jour: '2026-10-28' }), ['soin-h'], [],
], [lis('soin mercredi'), lis('soin hydratant').prestations, lis('soin hydratant').doutes]);

/* ══ #6 — LES CLIENTES : homonymes, nom entier, numero ══ */
dit(6, 'deux Mireille : les deux ; Mireille Kpossou : elle seule ; son numero', [['mir', 'mir2'], ['mir2'], ['mir']],
  [lis('Mireille retwist', { clientes: DEUX }).clientes, lis('Mireille Kpossou retwist', { clientes: DEUX }).clientes, lis('0100000042 retwist').clientes]);

/* ══ #7 — LE MAITRE : seulement un nom de la liste ══ */
dit(7, '« avec soin hydratant » n est pas un maitre ; « avec Gerard » en est un', [[null, ['retwist', 'soin-h']], 'Gérard'],
  [[lis('retwist avec soin hydratant').maitre, lis('retwist avec soin hydratant').prestations], lis('retwist avec gerard').maitre]);

/* ══ #8 — CE QUI N EST PAS COMPRIS RESTE DIT ; UNE PHRASE OU UN NOM ══ */
dit(8, 'le mot inconnu reste ; « bonjour » ne dit rien', [['blabla'], true], [lis('Mireille blabla mercredi').reste, lis('bonjour').vide]);
dit(8, 'une phrase : un moment, ou une cliente et une prestation ; un nom seul n en est pas une', [false, false, true, true, true],
  [estUnePhrase(lis('Mireille')), estUnePhrase(lis('retwist')), estUnePhrase(lis('Mireille retwist')), estUnePhrase(lis('mercredi')), estUnePhrase(lis('avec Teckle'))]);

/* ══ #10 — LES NOMS FON, LEUR FRANCAIS, LE LEXIQUE, L HABITUDE ══
   Le vrai catalogue dit SINSIN (le resserrage, donc le retwist), KLOKLO (le
   lavage), VEKPE (la creation). */
{
  const REEL = [
    { id: 'sin-e', name: 'SÍNSIN™ Essentiel' }, { id: 'sin-s', name: 'SÍNSIN™ Signature' },
    { id: 'klo-e', name: 'KLƆKLƆ™ Essentiel' }, { id: 'vek', name: 'VÈKPÈ™ Jumbo' },
  ];
  const vrai = (phrase: string) => litLaPhrase(phrase, { aujourdhui: JOUR, minutes: 600, prestations: REEL });
  dit(10, '« retwist » : les deux SINSIN, un doute ; « retwist signature » : la Signature ; « shampoing » : le lavage ; « creation de locks » : VEKPE',
    [[{ mot: 'retwist', ids: ['sin-e', 'sin-s'] }], ['sin-s'], ['klo-e'], ['vek']],
    [vrai('retwist mercredi 10h').doutes, vrai('retwist signature').prestations, vrai('shampoing demain').prestations, vrai('création de locks').prestations]);
  dit(10, 'l habitude leve le doute : une habituee de la Signature ; sans habitude, ou deux, le doute reste', [[['sin-s'], []], [[], 1], [[], 1]], [
    [departage(vrai('retwist'), ['klo-e', 'sin-s']).prestations, departage(vrai('retwist'), ['klo-e', 'sin-s']).doutes],
    [departage(vrai('retwist'), []).prestations, departage(vrai('retwist'), []).doutes.length],
    [departage(vrai('retwist'), ['sin-e', 'sin-s']).prestations, departage(vrai('retwist'), ['sin-e', 'sin-s']).doutes.length],
  ]);
}

/* ══ #9 — LE CABLAGE : le Trone, le site, Ma Couronne lisent la meme regle ══ */
{
  const trone = source('src/apps/trone/routes/clients/_shared.tsx');
  const site = source('src/apps/revelateur/ilots/Reserver.tsx');
  const couronne = source('src/apps/couronne/Booking.tsx');
  dit(9, 'le Trone : la case unique propose de tout poser, et pose cliente, prestations, moment et maitre', [true, true, true],
    [trone.includes('phrase: optionsDeLaPhrase,') && trone.includes('litLaPhrase(q, {'), trone.includes('const poseLaPhrase = (lecture: LectureDeLaPhrase, id: string) => {'),
      /setDate\(jour\);[\s\S]{0,160}if \(lecture\.heure\) \{ setTime\(lecture\.heure\); setMomentChoisi\(true\); \}/.test(trone)]);
  dit(9, 'le site et Ma Couronne : une case « en une phrase », la meme lecture, sans cliente', [true, true, true, true],
    [site.includes('litLaPhrase(phrase, {'), (site.match(/<PhraseDuSite/g) ?? []).length === 2, couronne.includes('litLaPhrase(phrase, {'), couronne.includes('clientes: undefined') || !/litLaPhrase\(phrase, \{[^}]*clientes:/.test(couronne)]);
  /* Ma Couronne : sur l'ecran express, ET sur le premier ecran quand il n'y en a pas
     (une nouvelle venue sans formule rapide n'aurait sinon aucune case). */
  dit(9, 'Ma Couronne : la case sur l ecran express, et sur le premier ecran sans express', [true, true],
    [couronne.includes('<PhraseDeLaCouronne onLire={lisLaPhrase} />'), couronne.includes('{!expressDispo && vue === premierEcran && <PhraseDeLaCouronne onLire={lisLaPhrase} enTete />}')]);
}

console.log(ko === 0 ? 'La phrase entiere se lit.' : `${ko} constat(s) en echec.`);
