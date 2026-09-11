/* LES ÂGES QUI CONTREDISENT L'HISTOIRE, ÉPROUVÉS — `node scripts/verifie-ages.mjs`.

   Un relevé d'anomalies porte un risque particulier : s'il crie trop, on cesse
   de le lire, et les vraies fautes s'y noient avec les fausses. Ce qui est
   éprouvé ici est donc autant ce qu'il DIT que ce qu'il SE TAIT.

   Une fiche sans date n'est pas une fiche fausse, une adulte qui paie pour son
   foyer n'est pas une anomalie, et une date illisible n'est pas un âge. Trois
   silences, et chacun garde le relevé lisible. */
import {
  contradictionsDeLAge, CERTITUDES, DIT,
  AGE_MINIMAL_AU_FAUTEUIL, LOCKS_AU_DELA_DUN_ENFANT,
  type FicheLue, type RituelLu, type FoyerLu, type RaisonDeDoute,
} from '../src/shared/ages';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-11';

const f = (o: Partial<FicheLue>): FicheLue =>
  ({ id: 't1', branchId: 'b1', name: 'Tête', ...o });
const r = (o: Partial<RituelLu>): RituelLu =>
  ({ clientId: 't1', date: '2026-01-10', status: 'honoré', ...o });

const releve = (
  clients: FicheLue[], rituels: RituelLu[] = [], foyers: FoyerLu[] = [], branche?: string,
) => contradictionsDeLAge(clients, rituels, foyers, AUJ, branche);

const raisonsDe = (clients: FicheLue[], rituels: RituelLu[] = [], foyers: FoyerLu[] = []): RaisonDeDoute[] =>
  releve(clients, rituels, foyers)[0]?.raisons ?? [];

/* ── ① LES TROIS SILENCES — ce qui ne doit JAMAIS paraître ─────────
   Un relevé qui crie pour rien cesse d'être lu au troisième jour, et les
   vraies fautes partent avec lui. */
dit('une fiche SANS date ne paraît pas', 0, releve([f({})]).length);
dit('une date illisible n’est pas un âge', 0, releve([f({ birthday: 'jamais' })]).length);
dit('une fiche archivée reste dehors', 0,
  releve([f({ birthday: '2030-01-01', archived: true })]).length);
dit('une adulte qui paie son foyer n’est pas une anomalie', 0,
  releve([f({ birthday: '1988-04-02' })], [], [{ payerClientId: 't1' }]).length);
dit('une adulte à 358 locks non plus', 0,
  releve([f({ birthday: '1988-04-02', lockCount: 358 })]).length);
dit('une enfant ordinaire ne paraît pas', 0,
  releve([f({ birthday: '2015-03-04', lockCount: 90 })], [r({ date: '2025-06-01' })]).length);
dit('une autre branche ne paraît pas', 0,
  releve([f({ birthday: '2030-01-01', branchId: 'b2' })], [], [], 'b1').length);

/* ── ② LES CERTITUDES — des faits impossibles, aucun jugement ──────
   Personne ne s'assied au fauteuil avant d'être né. */
dit('née demain : la date est fausse', ['anniversaire-futur'],
  raisonsDe([f({ birthday: '2027-01-01' })]));
dit('venue avant sa naissance', ['venue-avant-naissance'],
  raisonsDe([f({ birthday: '2020-05-05' })], [r({ date: '2019-02-02' })]));
dit('couronnée avant d’exister', ['couronne-avant-naissance'],
  raisonsDe([f({ birthday: '2020-05-05', crownSince: '2018-01-01' })]));
dit('une certitude se dit certaine', true,
  releve([f({ birthday: '2020-05-05' })], [r({ date: '2019-02-02' })])[0].certain);

/* LA MÊME FAUTE NE SE COMPTE PAS DEUX FOIS. Une venue avant la naissance rend
   aussi l'âge « inférieur à trois ans » à cette venue : dire les deux ferait
   croire à deux problèmes là où il n'y en a qu'un, et la Maison chercherait
   la seconde cause. */
dit('venue avant naissance n’entraîne pas « trop jeune »', ['venue-avant-naissance'],
  raisonsDe([f({ birthday: '2020-05-05' })], [r({ date: '2018-02-02' })]));

/* ── ③ LES DOUTES — des invraisemblances, pas des preuves ──────────
   Chacun a sa contre-histoire possible : c'est la Maison qui tranche. */
dit('deux ans au premier rituel : c’est un doute', ['enfant-au-fauteuil'],
  raisonsDe([f({ birthday: '2023-01-01' })], [r({ date: '2024-06-01' })]));
dit('… et un doute n’est jamais une certitude', false,
  releve([f({ birthday: '2023-01-01' })], [r({ date: '2024-06-01' })])[0].certain);
dit('le seuil est bien à trois ans', 0,
  releve([f({ birthday: '2021-06-01' })], [r({ date: '2024-06-01' })]).length);

dit('une enfant qui règle un foyer', ['paye-un-foyer'],
  raisonsDe([f({ birthday: '2015-03-04' })], [], [{ payerClientId: 't1' }]));
dit('une tête d’enfant trop fournie', ['tete-fournie'],
  raisonsDe([f({ birthday: '2015-03-04', lockCount: 358 })]));
dit('au seuil exact, rien ne se dit', 0,
  releve([f({ birthday: '2015-03-04', lockCount: LOCKS_AU_DELA_DUN_ENFANT })]).length);

/* ── ④ LE CAS QUI A COÛTÉ LA NUIT ─────────────────────────────────
   358 locks, calibre Nano, et une fiche qui la dit née en 2015. Deux raisons,
   et surtout : son catalogue est réduit AUJOURD'HUI. */
dit('la tête de 358 locks lue enfant',
  { raisons: ['tete-fournie'], certain: false, bloqueLeCatalogue: true, age: 11 },
  (({ raisons, certain, bloqueLeCatalogue, age }) => ({ raisons, certain, bloqueLeCatalogue, age }))(
    releve([f({ birthday: '2015-03-04', lockCount: 358 })])[0]));

/* ── ⑤ L'ORDRE EST UNE PRIORITÉ ───────────────────────────────────
   Celles dont le catalogue est réduit aujourd'hui d'abord : ce sont les seules
   qui empêchent de travailler. Une certitude sans conséquence visible peut
   attendre l'après-midi ; une tête bloquée au comptoir, non. */
/* MON ÉPREUVE ÉTAIT FAUSSE, PAS LE CODE — attrapée le 11 septembre au soir.
   J'opposais une tête bloquée à une fiche « née en 2027 », en la croyant non
   bloquée. Un âge NÉGATIF est inférieur à quinze : cette fiche-là est lue
   enfant elle aussi, et son catalogue est réduit tout autant. Les deux
   bloquaient, et c'est bien la certitude qui devait passer devant.
   La vraie opposition demande une CERTITUDE SANS CONSÉQUENCE VISIBLE : une
   adulte dont la couronne précède la naissance. Sa date est fausse, mais rien
   ne l'empêche de travailler aujourd'hui, donc elle attend. */
dit('la tête bloquée passe devant la certitude tranquille',
  ['bloquee', 'tranquille'],
  releve([
    f({ id: 'tranquille', name: 'Z. Tranquille', birthday: '1990-01-01', crownSince: '1985-01-01' }),
    f({ id: 'bloquee', name: 'A. Bloquée', birthday: '2015-03-04', lockCount: 358 }),
  ]).map((x) => x.clientId));
/* ET ENTRE DEUX TÊTES BLOQUÉES, la certitude passe devant : les deux
   empêchent de travailler, autant commencer par celle qui ne demande aucune
   réflexion. Une naissance dans le futur est lue enfant, elle aussi. */
dit('entre deux bloquées, la certitude d’abord',
  ['certaine', 'douteuse'],
  releve([
    f({ id: 'douteuse', name: 'A. Douteuse', birthday: '2015-03-04', lockCount: 358 }),
    f({ id: 'certaine', name: 'Z. Certaine', birthday: '2027-01-01' }),
  ]).map((x) => x.clientId));

/* À ÉGALITÉ, LE NOM TRANCHE — un relevé qui se réordonne tout seul d'une passe
   à l'autre ne se relit jamais deux fois. */
dit('à égalité, l’ordre est stable et alphabétique',
  ['Amina B.', 'Zoé C.'],
  releve([
    f({ id: 'z', name: 'Zoé C.', birthday: '2027-01-01' }),
    f({ id: 'a', name: 'Amina B.', birthday: '2027-01-01' }),
  ]).map((x) => x.nom));

/* ── ⑥ LE RELEVÉ SAIT PARLER ──────────────────────────────────────
   Une raison sans phrase s'afficherait « undefined » devant la Maison, et un
   relevé qui affiche « anomalie » se referme au lieu de se corriger. */
const TOUTES: RaisonDeDoute[] = [
  'anniversaire-futur', 'venue-avant-naissance', 'couronne-avant-naissance',
  'enfant-au-fauteuil', 'paye-un-foyer', 'tete-fournie',
];
dit('chaque raison porte sa phrase', [],
  TOUTES.filter((r2) => !DIT[r2] || DIT[r2].length < 10));
dit('les certitudes sont exactement trois', 3, CERTITUDES.length);
dit('les seuils sont posés', [3, 250], [AGE_MINIMAL_AU_FAUTEUIL, LOCKS_AU_DELA_DUN_ENFANT]);

/* PLUSIEURS RAISONS SUR UNE SEULE TÊTE se cumulent, et la certitude l'emporte
   pour le classement : la date est fausse, le reste n'est que confirmation. */
dit('les raisons se cumulent',
  { n: 2, certain: true },
  (({ raisons, certain }) => ({ n: raisons.length, certain }))(
    releve([f({ birthday: '2015-03-04', lockCount: 400, crownSince: '2010-01-01' })])[0]));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
