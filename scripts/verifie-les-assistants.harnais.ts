/* LES ASSISTANTS RELIÉS, ÉPROUVÉS · 31 octobre 2026.
   `node scripts/verifie-les-assistants.mjs` (et `--prouve`).

   ① Le cerveau pur : le filtre du mot d'un relais, l'échéance en heures
      ouvrées (un dimanche mène au mardi), l'état d'un assistant, le chien de
      garde du sommeil, l'heure dite, les tournures interdites, la note, les
      tresses, le jeton et son empreinte. Depuis le 2 novembre 2026, la
      veille bâtie sur les réglages : ses bornes (5 h 59, 6 h, 17 h 59, 18 h,
      23 h 59, minuit), le rythme du soir qui n'endort pas, le seuil du
      sommeil qui suit le rythme, la grâce du matin du chien de garde, les
      tâches cron jamais sur :00 ni :30, les bornes des clés du soir.
   ② La fonction `assistants-maison`, regroupée depuis le dépôt, contre une
      base et un push-notify simulés : la santé, les deux portes et leurs
      refus, le passage (l'état, les relais, les décisions, l'autre), l'empêché
      prévenu une fois, le relais et son filtre, la notification sans nom, la
      décision et la tournure interdite, le rendez-vous (fiche, idempotence,
      prise du jour, déjà un rendez-vous, verrou de la base dans la fenêtre,
      insert direct hors fenêtre, place tenue, tresses), le verrou optimiste,
      la note, le jeton donné (l'empreinte écrite, jamais le jeton), la place
      tranchée et la confirmation officielle déposée, le journal.
   ③ Le câblage : la migration porte les genres du module pur et l'empreinte
      d'Opale ; aucun nom privé dans les sources ; push-notify porte le bloc
      ⟨veille-des-assistants⟩ mot pour mot ; la charte, l'installateur
      d'Onyx, le SQL du soir et l'écran disent la veille des réglages.
   Les numéros, fiches et messages du banc sont inventés : rien de réel ici. */
import { readFileSync } from 'node:fs';
import {
  GENRES_DE_DECISION, GENRES_DE_RELAIS, MARGE_DE_SOMMEIL_MIN, REGLAGES_PAR_DEFAUT, aCotonou, cronsDeLaVeille, dansLaVeille, doitPrevenirDuSommeil, echeanceOuvree,
  empreinteDuJetonAssistant, estUneTresse, etatDe, heureDite, motEstPropre, noteEstPropre, nouveauJetonAssistant, porteDeLAction, reglagesComplets,
  rythmeA, seuilDeSommeilMin, tournureInterdite, vocabulairePermis, type ReglagesAssistants,
} from '../src/shared/assistants-pur';
import {
  caisseDeLaDepense, categorieConnue, cheminDuRecu, doublonDeLaDepense, idDeLaDepense, lisLaDemandeDeDepense, lisLeRecu, pieceDuJournal,
  porteurConnu, prestataireNomme, RECU_AU_PLUS_OCTETS,
} from '../src/shared/assistants-depenses-pur';
import { ficheCorrespond, ficheLisible, lisLaRecherche, motifDeLaBase, pieceDeLaLecture } from '../src/shared/assistants-fiches-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko += 1; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
/* La panne de `--prouve`, posée en mémoire sur le texte lu, jamais sur le disque. */
const PANNE = process.env.ASSISTANTS_PANNE ? JSON.parse(process.env.ASSISTANTS_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};

/* ── ① LE CERVEAU PUR ── */
const permis = vocabulairePermis(['Création', 'SÍNSIN Essentiel', 'Reprise de racines'], ['Awa', 'Banc']);
dit('le mot d un relais : des faits passent, une citation, un numéro, un mot étranger aux faits non',
  [true, true, false, false, false, true],
  [motEstPropre('sœur, création, mardi 14 h', permis).ok, motEstPropre('Awa viendra avec sa fille, sinsin', permis).ok,
    motEstPropre('elle a dit « je viens »', permis).ok, motEstPropre('rappeler au 01 97 00 00 01', permis).ok,
    motEstPropre('rupture de stock', permis).ok, motEstPropre('', permis).ok]);
dit('… et le mot refusé est nommé', 'un mot hors des faits de la Maison : « rupture »', (motEstPropre('rupture de stock', permis) as { motif: string }).motif);
/* Le 1er novembre 2026 est un dimanche ; la Maison rouvre le mardi 3 à 8 h. */
dit('deux heures ouvrées depuis un dimanche 10 h : mardi 10 h (le compte repart à 8 h)', '2026-11-03T09:00:00.000Z', echeanceOuvree(Date.UTC(2026, 10, 1, 9, 0), 2));
dit('deux heures ouvrées depuis un samedi 19 h 30 : mardi 9 h 30', '2026-11-03T08:30:00.000Z', echeanceOuvree(Date.UTC(2026, 9, 31, 18, 30), 2));
dit('deux heures ouvrées un mardi 10 h : midi', '2026-11-03T11:00:00.000Z', echeanceOuvree(Date.UTC(2026, 10, 3, 9, 0), 2));
const ici = Date.UTC(2026, 10, 3, 9, 0); // mardi 3 novembre 2026, 10 h à Cotonou
const ilYA = (min: number) => new Date(ici - min * 60_000).toISOString();
dit('l état : sans jeton, jamais passé, endormi, empêché, éveillé', ['sans-jeton', 'endormi', 'endormi', 'empeche', 'eveille'], [
  etatDe({ aUnJeton: false, vuLe: null, etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: null, etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: false, nonLus: true } } }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: true, nonLus: true } } }, ici).etat,
]);
dit('… avec le détail dit', ['endormi depuis 40 min', 'empêché : WhatsApp Web délié : le code QR est à l\'écran'], [
  etatDe({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici).detail,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: false, nonLus: true } } }, ici).detail,
]);
/* Le silence réglé par défaut est de 45 minutes depuis le 2 novembre 2026 ; 0 h 30 est hors de la veille. */
dit('le chien de garde : prévient après le silence, une fois, jamais la nuit, pas avant le silence, jamais sans jeton', [true, false, false, false, false, false], [
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(50), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(50), etat: { dortPrevenuLe: ilYA(5) } }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(50), etat: {} }, Date.UTC(2026, 10, 3, 23, 30), REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(10), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: false, vuLe: ilYA(50), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
]);

/* ── LA VEILLE DES RÉGLAGES, 2 novembre 2026 : de 6 h à minuit, 10 minutes
   jusqu'à 18 h, 30 ensuite, rien de minuit à 6 h. `aCotonouLe(j, h, m)` :
   le j novembre 2026 à h:m, heure de Cotonou. */
const D = REGLAGES_PAR_DEFAUT;
const aCotonouLe = (j: number, h: number, m: number) => Date.UTC(2026, 10, j, h - 1, m);
const isoDe = (ms: number) => new Date(ms).toISOString();
const vuAvant = (ms: number, min: number) => isoDe(ms - min * 60_000);
dit('les réglages par défaut : veille de 6 h à minuit, 10 min le jour, 30 le soir dès 18 h, 45 min de silence',
  { rythmeMin: 10, veilleDe: 6, veilleA: 24, soirDe: 18, rythmeSoirMin: 30, silenceMin: 45, tenueHeures: 2 }, reglagesComplets(null));
const BORNES: [number, number][] = [[5, 59], [6, 0], [17, 59], [18, 0], [23, 59], [0, 0]];
dit('dansLaVeille à 5 h 59, 6 h, 17 h 59, 18 h, 23 h 59, minuit', [false, true, true, true, true, false],
  BORNES.map(([h, m]) => dansLaVeille(aCotonou(aCotonouLe(3, h, m)).heure, D)));
dit('rythmeA aux mêmes heures : rien, 10, 10, 30, 30, rien', [null, 10, 10, 30, 30, null],
  BORNES.map(([h, m]) => rythmeA(aCotonou(aCotonouLe(3, h, m)).heure, D)));
dit('les bornes des clés du soir : soirDe de 0 à 24 h, rythmeSoirMin de 5 à 60 min ; hors bornes ou pas un nombre, la valeur par défaut',
  [[0, 5], [24, 60], [18, 30], [18, 30], [18, 30], [19, 45]],
  ([{ soirDe: 0, rythmeSoirMin: 5 }, { soirDe: 24, rythmeSoirMin: 60 }, { soirDe: -1, rythmeSoirMin: 4 }, { soirDe: 25, rythmeSoirMin: 61 },
    { soirDe: '19', rythmeSoirMin: null }, { soirDe: 19.4, rythmeSoirMin: 45 }] as unknown as ReglagesAssistants[])
    .map((x) => { const c = reglagesComplets(x); return [c.soirDe, c.rythmeSoirMin]; }));
dit('le seuil du sommeil suit le rythme : 25 min le jour, 45 le soir, 45 à cheval sur 18 h, 45 la nuit', [25, 45, 45, 45], [
  seuilDeSommeilMin(aCotonouLe(3, 10, 0), aCotonouLe(3, 10, 30), D), seuilDeSommeilMin(aCotonouLe(3, 20, 7), aCotonouLe(3, 20, 37), D),
  seuilDeSommeilMin(aCotonouLe(3, 17, 53), aCotonouLe(3, 18, 7), D), seuilDeSommeilMin(aCotonouLe(3, 1, 0), aCotonouLe(3, 2, 0), D)]);
const soir = aCotonouLe(3, 20, 37);
dit('le soir, trente minutes entre deux tours (trente-cinq pour un tour en retard) : éveillé ; quarante-six : endormi', ['eveille', 'eveille', 'endormi'], [
  etatDe({ aUnJeton: true, vuLe: vuAvant(soir, 30), etat: {} }, soir, D).etat,
  etatDe({ aUnJeton: true, vuLe: vuAvant(soir, 35), etat: {} }, soir, D).etat,
  etatDe({ aUnJeton: true, vuLe: vuAvant(soir, 46), etat: {} }, soir, D).etat]);
dit('… le jour, vingt-six minutes : endormi, le seuil du jour reste 25 min', 'endormi', etatDe({ aUnJeton: true, vuLe: ilYA(26), etat: {} }, ici, D).etat);
dit('… la nuit, il dort comme chaque nuit, et le détail le dit sans alarme', { etat: 'endormi', detail: 'au repos jusqu\'à 6 h, comme chaque nuit' },
  etatDe({ aUnJeton: true, vuLe: isoDe(aCotonouLe(3, 23, 37)), etat: {} }, aCotonouLe(4, 2, 0), D));
const nuitVide = isoDe(aCotonouLe(3, 23, 37)); // le dernier tour du soir, puis rien jusqu'au matin
dit('le chien de garde après une nuit sans tour : rien à 6 h, rien à 6 h 44, il prévient à 6 h 45 (veilleDe + silenceMin)', [false, false, true], [
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: nuitVide, etat: {} }, aCotonouLe(4, 6, 0), D),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: nuitVide, etat: {} }, aCotonouLe(4, 6, 44), D),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: nuitVide, etat: {} }, aCotonouLe(4, 6, 45), D)]);
dit('… prévenu la veille au soir, il prévient encore au matin ; prévenu ce matin, il se tait', [true, false], [
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: isoDe(aCotonouLe(3, 23, 7)), etat: { dortPrevenuLe: isoDe(aCotonouLe(3, 23, 52)) } }, aCotonouLe(4, 6, 45), D),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: nuitVide, etat: { dortPrevenuLe: isoDe(aCotonouLe(4, 6, 45)) } }, aCotonouLe(4, 7, 0), D)]);
dit('… un silence réglé plus court que le rythme du soir ne crie pas entre deux tours du soir, mais après le seuil, si', [false, true], [
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: vuAvant(soir, 30), etat: {} }, soir, { ...D, silenceMin: 15 }),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: vuAvant(soir, 46), etat: {} }, soir, { ...D, silenceMin: 15 })]);
dit('les tâches cron de la veille, bâties sur les réglages par défaut', ['3-59/10 6-17 * * *', '7,37 18-23 * * *'], cronsDeLaVeille(D));
dit('… un rythme qui tomberait sur :30 se décale, un soir à minuit ne fait qu une tâche, un soir avant la veille aussi, une heure seule se dit seule', [
  ['4-59/9 6-17 * * *', '7,37 18-23 * * *'], ['3-59/10 6-23 * * *'], ['7,37 8-21 * * *'], ['3-59/15 7 * * *', '7 8-19 * * *']], [
  cronsDeLaVeille({ ...D, rythmeMin: 9 }), cronsDeLaVeille({ ...D, soirDe: 24 }), cronsDeLaVeille({ ...D, veilleDe: 8, veilleA: 22, soirDe: 6 }),
  cronsDeLaVeille({ ...D, veilleDe: 7, soirDe: 8, veilleA: 20, rythmeMin: 15, rythmeSoirMin: 60 })]);
const minutesDuCron = (cron: string): number[] => {
  const champ = cron.split(' ')[0];
  if (!champ.includes('/')) return champ.split(',').map(Number);
  const [plage, pas] = champ.split('/'); const m: number[] = [];
  for (let x = Number(plage.split('-')[0]); x < 60; x += Number(pas)) m.push(x);
  return m;
};
let surLHeureRonde = 0; let ecartTropLong = 0;
for (let rythme = 5; rythme <= 60; rythme++) {
  for (const c of cronsDeLaVeille({ ...D, rythmeMin: rythme, rythmeSoirMin: rythme })) {
    const m = minutesDuCron(c);
    if (m.some((x) => x === 0 || x === 30)) surLHeureRonde += 1;
    const ecarts = m.map((x, i) => (i + 1 < m.length ? m[i + 1] - x : 60 - x + m[0]));
    const borne = 60 % rythme === 0 ? rythme : rythme + MARGE_DE_SOMMEIL_MIN;
    if (Math.max(...ecarts) > borne) ecartTropLong += 1;
  }
}
/* Un rythme qui ne divise pas l'heure (29, 53…) ne peut pas tomber juste d'une heure à l'autre : son écart le plus long reste sous le seuil du sommeil (rythme + 15), jamais un faux sommeil. */
dit('… pour chaque rythme de 5 à 60 min : aucune minute sur :00 ni :30 ; le rythme juste quand il divise l heure, sinon jamais au-delà du seuil du sommeil, d une heure à l autre comprise', [0, 0], [surLHeureRonde, ecartTropLong]);
dit('l heure dite : aujourd hui, demain, le jour de la semaine, puis la date', ['aujourd\'hui 10 h', 'demain 14 h 30', 'samedi 10 h', 'le 23 nov. 9 h'], [
  heureDite('2026-11-03', '10:00', ici), heureDite('2026-11-04', '14:30', ici), heureDite('2026-11-07', '10:00', ici), heureDite('2026-11-23', '09:00', ici),
]);
dit('les tournures d assistant sont repérées, la voix du porteur passe', ['c\'est noté', 'n\'hésite pas', null], [
  tournureInterdite('C’est noté, à très vite'), tournureInterdite('N’hésite pas stp'), tournureInterdite('ok samedi 10h, bises'),
]);
dit('la note du carnet : des faits, jamais une citation ni un numéro, deux cents caractères', [true, false, false, false], [
  noteEstPropre('Veut une couleur cuivre, longueur épaules').ok, noteEstPropre('elle a dit « j’arrive »').ok, noteEstPropre('rappeler 0197000001').ok, noteEstPropre('x'.repeat(201)).ok,
]);
dit('une tresse se reconnaît à la prestation ou à sa rubrique', [true, true, true, false], [
  estUneTresse('Nattes collées'), estUneTresse('Vanilles'), estUneTresse('Pose', 'Tresses et nattes'), estUneTresse('Création', 'Reprise de racines'),
]);
dit('la porte de chaque action', ['jeton', 'souverain', null], [porteDeLAction('rdv.poser'), porteDeLAction('place.trancher'), porteDeLAction('sql')]);
dit('les dépenses et la recherche d une fiche passent par la porte des assistants', ['jeton', 'jeton'], [porteDeLAction('depense.poser'), porteDeLAction('fiche.chercher')]);

/* Les dépenses du jour (1er novembre 2026). Le 3 novembre 2026 sert de jour. */
const J = '2026-11-03';
const lueD = (d: Record<string, unknown>) => { const r = lisLaDemandeDeDepense(d, J); return r.ok ? 'ok' : r.motif; };
dit('la demande de dépense : un montant lu, un objet sain, une date ni future ni trop ancienne, une catégorie',
  ['ok', 'ok', 'montant', 'montant', 'montant-hors-borne', 'objet', 'objet', 'date-future', 'date-ancienne', 'ok', 'categorie'], [
    lueD({ montantXof: 3500, objet: 'Eau', categorie: 'Local' }), lueD({ montantXof: '3 500', objet: 'Eau', categorie: 'Local' }),
    lueD({ montantXof: 0, objet: 'Eau', categorie: 'Local' }), lueD({ montantXof: 2.5, objet: 'Eau', categorie: 'Local' }),
    lueD({ montantXof: 2_000_001, objet: 'Groupe', categorie: 'Local' }), lueD({ montantXof: 500, objet: 'appel 0197000001', categorie: 'Local' }),
    lueD({ montantXof: 500, objet: 'x', categorie: 'Local' }), lueD({ montantXof: 500, objet: 'Eau', categorie: 'Local', date: '2026-11-04' }),
    lueD({ montantXof: 500, objet: 'Eau', categorie: 'Local', date: '2026-09-01' }), lueD({ montantXof: 500, objet: 'Eau', categorie: 'Local', date: '2026-09-04' }),
    lueD({ montantXof: 500, objet: 'Eau', categorie: '' }),
  ]);
dit('… sans date, le jour de Cotonou ; « C en est une autre » se lit', ['2026-11-03', true],
  [(lisLaDemandeDeDepense({ montantXof: 1000, objet: 'Zem', categorie: 'Logistique', autre: true }, J) as { v: { date: string } }).v.date,
    (lisLaDemandeDeDepense({ montantXof: 1000, objet: 'Zem', categorie: 'Logistique', autre: true }, J) as { v: { autre: boolean } }).v.autre]);
const CATS = [{ name: 'Local' }, { name: 'Logistique' }, { name: 'Matières premières' }];
dit('la catégorie telle que la Maison l écrit, ou rien', ['Logistique', 'Matières premières', null], [categorieConnue('logistique', CATS), categorieConnue('matieres premieres', CATS), categorieConnue('Essence', CATS)]);
const BOITES = [{ name: 'MoMo Privé', branchId: 'b' }, { name: 'Caisse Principale', branchId: 'b' }, { name: 'Ancienne', branchId: 'b', archiveeLe: '2026-10-01' }, { name: 'Ailleurs', branchId: 'z' }];
dit('la caisse : nommée et vivante dans cette maison ; sans nom, la Caisse Principale, sinon la première vivante', [
  { ok: true, caisse: 'MoMo Privé' }, { ok: false, caisses: ['MoMo Privé', 'Caisse Principale'] }, { ok: false, caisses: ['MoMo Privé', 'Caisse Principale'] },
  { ok: true, caisse: 'Caisse Principale' }, { ok: true, caisse: 'MoMo Privé' }, { ok: true, caisse: 'Caisse Principale' }], [
  caisseDeLaDepense('momo prive', BOITES, 'b'), caisseDeLaDepense('Ancienne', BOITES, 'b'), caisseDeLaDepense('Ailleurs', BOITES, 'b'),
  caisseDeLaDepense(undefined, BOITES, 'b'), caisseDeLaDepense(undefined, [BOITES[0]], 'b'), caisseDeLaDepense(undefined, [], 'b')]);
const PORTEURS = ['Brice A.', 'Sandrine maison', 'Aimé', 'Awa Un', 'Awa Deux'];
dit('le porteur : le nom de la liste, ou un prénom qui ne désigne qu une personne ; jamais un second porteur', ['Brice A.', 'Sandrine maison', 'Aimé', null, null], [
  porteurConnu('brice', PORTEURS), porteurConnu('SANDRINE', PORTEURS), porteurConnu('Aime', PORTEURS), porteurConnu('awa', PORTEURS), porteurConnu('Paul', PORTEURS)]);
dit('un prestataire nommé n est jamais une dépense d assistant ; un prestataire rangé ne compte plus', ['Hermine', 'Ziadath', null, null], [
  prestataireNomme(['Tresses Hermine', undefined], [{ name: 'Hermine' }, { name: 'Ziadath' }]), prestataireNomme(['Défaire', 'ZIADATH'], [{ name: 'Hermine' }, { name: 'Ziadath' }]),
  prestataireNomme(['Hermione pagne'], [{ name: 'Hermine' }]), prestataireNomme(['Tresses Hermine'], [{ name: 'Hermine', archived: true }])]);
const DU_JOUR = [
  { id: 'g', branchId: 'b', date: J, amountXof: 6000, label: 'Gaz', porteur: 'Brice A.' },
  { id: 'r', branchId: 'b', date: J, amountXof: 2000, label: 'Pain', validation: { etat: 'refusee', soumisPar: 'Opale' } },
];
const dbl = (label: string, amountXof: number, date = J, branchId = 'b') => doublonDeLaDepense({ branchId, date, amountXof, label }, DU_JOUR)?.id ?? null;
dit('le doublon du jour : même maison, date, montant, objet voisin, non refusé', ['g', 'g', null, null, null, null, null], [
  dbl('Gaz', 6000), dbl('Recharge de gaz', 6000), dbl('Eau', 6000), dbl('Gaz', 6500), dbl('Gaz', 6000, '2026-11-02'), dbl('Gaz', 6000, J, 'z'), dbl('Pain', 2000)]);
const i1 = await idDeLaDepense('opale', 'opale:m1');
dit('l identifiant de la dépense : le même pour le même geste, un autre pour un autre geste ou un autre assistant', [true, true, false, false],
  [/^exp-opale-[0-9a-f]{20}$/.test(i1), i1 === await idDeLaDepense('opale', ' opale:m1 '), i1 === await idDeLaDepense('opale', 'opale:m2'), i1 === await idDeLaDepense('onyx', 'opale:m1')]);
const b64 = (n: number) => Buffer.alloc(n, 7).toString('base64');
const recu = (r: unknown) => { const x = lisLeRecu(r); return x.ok ? (x.recu ? x.recu.octets.length : null) : x.motif; };
dit('le reçu : absent, un type connu, cinq Mo au plus, du base64', [null, 10, 'recu-type', 'recu-trop-lourd', 'recu-illisible'], [
  recu(undefined), recu({ nom: 'r.jpg', type: 'image/jpeg', base64: b64(10) }), recu({ nom: 'r.gif', type: 'image/gif', base64: b64(10) }),
  recu({ nom: 'r.jpg', type: 'image/jpeg', base64: b64(RECU_AU_PLUS_OCTETS + 1) }), recu({ nom: 'r.jpg', type: 'image/jpeg', base64: 'pas du base64 !' })]);
dit('le chemin du reçu, comme une pièce jointe de dépense du Trône', 'b/depense/exp-x-recu-de-l-eau.jpg', cheminDuRecu('b', 'exp-x', 'reçu de l’eau.jpg'));
dit('la ligne du journal : le montant et la catégorie, jamais l objet', 'Dépense à valider, 3 500 F, Local', pieceDuJournal(3500, 'Local'));

/* La recherche d'une fiche (1er novembre 2026). */
const num = (t: string) => { const c = t.replace(/\D/g, ''); return c.length >= 8 && c.length <= 15 ? c : null; };
const rch = (d: Record<string, unknown>) => { const r = lisLaRecherche(d, num); return !r.ok ? r.motif : 'numero' in r ? r.numero : r.nom; };
dit('la recherche : deux lettres au moins dont un mot de deux, ou un numéro ; des initiales seules ne cherchent pas', [
  'nom-trop-court', 'nom-trop-court', ['awa'], ['gbessi', 'so'], '2290197000010', 'numero-invalide'], [
  rch({ nom: 'A. S.' }), rch({ nom: 'x' }), rch({ nom: 'Awa' }), rch({ nom: 'Gbèssi So' }), rch({ numeroCle: '+229 01 97 00 00 10' }), rch({ numeroCle: '12' })]);
dit('le filtre de la base laisse passer les accents', '%gb_ss_%', motifDeLaBase(['so', 'gbessi']));
dit('chaque mot cherché commence un mot du nom', [true, true, false, false], [
  ficheCorrespond('Gbèssi Sossou', ['gbes']), ficheCorrespond('Awa Banc', ['awa', 'ba']), ficheCorrespond('Awa Banc', ['awa', 'co']), ficheCorrespond('Banc Awa', ['wa'])]);
const lisible = ficheLisible({ id: 'f', data: { name: 'Gbèssi Sossou', civilite: 'madame', phone: '+229 01 97 00 00 10', phone2: '', note: 'privée', sante: 'allergie', solde: 5000 } }, [
  { id: 'a', date: '2026-11-05', time: '10:00', status: 'confirmé', serviceIds: ['s1'], updatedAt: 'u1' },
  { id: 'b', date: '2026-11-01', time: '09:00', status: 'honoré', serviceIds: ['s1'] },
  { id: 'c', date: '2026-11-06', time: '09:00', status: 'annulé', serviceIds: ['s1'] },
  { id: 'd', date: '2026-11-04', time: '15:30', status: 'en attente', serviceIds: ['s1', 'inconnu'], updatedAt: 'u2' },
], (id) => (id === 's1' ? 'Création' : undefined), J);
dit('la fiche rendue : identifiant, nom, civilité, numéros, rendez-vous à venir non annulés, rien d autre', {
  id: 'f', nom: 'Gbèssi Sossou', civilite: 'madame', numeros: ['+229 01 97 00 00 10'],
  rdvs: [{ id: 'd', date: '2026-11-04', heure: '15:30', prestations: ['Création', 'Prestation'], updatedAt: 'u2' }, { id: 'a', date: '2026-11-05', heure: '10:00', prestations: ['Création'], updatedAt: 'u1' }],
}, lisible);
dit('la ligne du journal d une lecture : combien, jamais le nom', ['une recherche de fiche, aucune trouvée', 'une recherche de fiche, une trouvée', 'une recherche de fiche, 3 trouvées'], [pieceDeLaLecture(0), pieceDeLaLecture(1), pieceDeLaLecture(3)]);
const e1 = await empreinteDuJetonAssistant('assistant-opale-test');
dit('l empreinte du jeton : 64 hexadécimaux, la même après un blanc, jamais le jeton', [64, true, true, false],
  [e1.length, /^[0-9a-f]+$/.test(e1), e1 === await empreinteDuJetonAssistant(' assistant-opale-test '), e1.includes('opale-test')]);
dit('un jeton neuf : la forme, jamais deux fois le même', [true, true], [/^assistant-opale-[0-9a-f]{48}$/.test(nouveauJetonAssistant('opale')), nouveauJetonAssistant('opale') !== nouveauJetonAssistant('opale')]);

/* ── ② LA FONCTION ── */
type Row = Record<string, unknown>;
let tic = 0;
const horloge = () => new Date(Date.now() + (tic++)).toISOString();
const CLES: Record<string, string> = { assistants: 'id', assistants_relais: 'id', assistants_decisions: 'id', assistants_prises: 'cle', documents: 'key', appointments: 'id', envois: 'id', journal_gestes: 'id', staff: 'user_id', clients: 'id', branches: 'id', catalog_services: 'id', catalog_categories: 'id', team: 'id' };
const JETON_OPALE = 'assistant-opale-test';
const JETON_ONYX = 'assistant-onyx-test';
const tables: Record<string, Row[]> = {
  assistants: [
    { id: 'opale', nom: 'Opale', porteur_team_id: 'st-5qduae5jef', porteur_user_id: 'u-yeman', appareil: 'un ordinateur', empreinte: await empreinteDuJetonAssistant(JETON_OPALE), jeton_pose_le: horloge(), vu_le: null, eveille_depuis: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
    { id: 'onyx', nom: 'Onyx', porteur_team_id: 'st-d4t24p6inh', porteur_user_id: 'u-brice', appareil: 'un Mac', empreinte: await empreinteDuJetonAssistant(JETON_ONYX), jeton_pose_le: horloge(), vu_le: null, eveille_depuis: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
  ],
  assistants_relais: [], assistants_decisions: [], assistants_prises: [], journal_gestes: [], envois: [], appointments: [],
  documents: [{ key: 'mnd_settings', data: { assistants: { rythmeMin: 15 } } }, { key: 'mnd_house_identity', data: { nom: 'Maison du banc' } }, { key: 'mnd_auto_config', data: { itineraire: 'Au bout de la rue.' } }],
  staff: [{ user_id: 'u-yeman', name: 'Y. B.', role: 'souverain' }, { user_id: 'u-brice', name: 'B. A.', role: 'souverain' }, { user_id: 'u-maitre', name: 'M. T.', role: 'maitre' }],
  team: [{ id: 'st-5qduae5jef', data: { name: 'Y. B.' } }, { id: 'st-d4t24p6inh', data: { name: 'B. A.' } }],
  branches: [{ id: 'br-test', data: { name: 'Maison du banc', flagship: true, status: 'active', masters: ['Team', 'Expert'], masterParDefaut: 'Team' } }],
  catalog_categories: [{ id: 'c-soin', data: { label: 'Reprise de racines', fon: 'KLƆKLƆ' } }, { id: 'c-tresses', data: { label: 'Tresses et nattes' } }],
  catalog_services: [{ id: 's-creation', data: { name: 'Création', categoryId: 'c-soin' } }, { id: 's-sinsin', data: { name: 'SÍNSIN Essentiel', categoryId: 'c-soin' } }, { id: 's-nattes', data: { name: 'Nattes collées', categoryId: 'c-tresses' } }],
  clients: [
    { id: 'cl-1', data: { name: 'Awa Banc', phone: '+229 01 97 00 00 01', civilite: 'madame', branchId: 'br-test' } },
    { id: 'cl-2', data: { name: 'Codjo Banc', phone: '+229 01 97 00 00 02' } },
    { id: 'cl-3', data: { name: 'Dossi Banc', phone: '+229 01 97 00 00 05' } },
    { id: 'cl-4', data: { name: 'Efua Banc', phone: '+229 01 97 00 00 06' } },
    { id: 'cl-5', data: { name: 'Fifa Banc', phone: '+229 01 97 00 00 07' } },
    { id: 'cl-6', data: { name: 'Gbessi Banc', phone: '+229 01 97 00 00 08' } },
    { id: 'cl-7', data: { name: 'Hola Banc', phone: '+229 01 97 00 00 09' } },
  ],
};
const fichesParNumero: Record<string, Row[]> = {
  '2290197000001': [{ id: 'cl-1', nom: 'Awa Banc', parPhone: true, branchId: 'br-test' }],
  '2290197000002': [{ id: 'cl-2', nom: 'Codjo Banc', parPhone: true }],
  '2290197000004': [{ id: 'cl-1', nom: 'Awa Banc', parPhone: true }, { id: 'cl-3', nom: 'Dossi Banc', parFamille: true }],
  '2290197000005': [{ id: 'cl-3', nom: 'Dossi Banc', parPhone: true }],
  '2290197000006': [{ id: 'cl-4', nom: 'Efua Banc', parPhone: true }],
  '2290197000007': [{ id: 'cl-5', nom: 'Fifa Banc', parPhone: true }],
  '2290197000008': [{ id: 'cl-6', nom: 'Gbessi Banc', parPhone: true }],
  '2290197000009': [{ id: 'cl-7', nom: 'Hola Banc', parPhone: true }],
};
const JWTS: Record<string, string> = { 'jwt-yeman': 'u-yeman', 'jwt-brice': 'u-brice', 'jwt-maitre': 'u-maitre' };
let creneauPris = false;
const rpcAppels: { nom: string; params: Row }[] = [];
const valeur = (r: Row, col: string): unknown => {
  if (col.includes('->>')) { const [c, k] = col.split('->>'); return ((r[c] ?? null) as Row | null)?.[k]; }
  return r[col];
};
const cmp = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''));
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  charge: Row[] = [];
  options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  tri: { col: string; asc: boolean } | null = null;
  limite = Infinity;
  veutSelect = false;
  constructor(readonly table: string) {}
  select() { if (this.op !== 'select') this.veutSelect = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) === v); return this; }
  neq(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) !== v); return this; }
  is(c: string, v: unknown) { this.filtres.push((r) => (v === null ? valeur(r, c) == null : valeur(r, c) === v)); return this; }
  not(c: string, op: string, v: unknown) { if (op === 'is' && v === null) this.filtres.push((r) => valeur(r, c) != null); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.includes(valeur(r, c))); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => cmp(valeur(r, c), v) >= 0); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => cmp(valeur(r, c), v) <= 0); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.tri = { col: c, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.limite = n; return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.charge = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = 'upsert'; this.charge = Array.isArray(rows) ? rows : [rows]; this.options = o ?? {}; return this; }
  update(patch: Row) { this.op = 'update'; this.charge = [patch]; return this; }
  delete() { this.op = 'delete'; return this; }
  ilike(c: string, motif: string) {
    const re = new RegExp(`^${motif.split('').map((ch) => (ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');
    this.filtres.push((r) => re.test(String(valeur(r, c) ?? ''))); return this;
  }
  async maybeSingle() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.error }; }
  async single() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.data?.[0] ? r.error : { message: 'aucune ligne' } }; }
  then<T>(res: (v: { data: Row[] | null; error: { message: string } | null }) => T, rej?: (e: unknown) => T) { return Promise.resolve(this.execute()).then(res, rej); }
  execute(): { data: Row[] | null; error: { message: string } | null } {
    const t = tables[this.table]; if (!t) return { data: null, error: { message: `table inconnue ${this.table}` } };
    const cle = CLES[this.table] ?? 'id';
    const copie = (r: Row) => JSON.parse(JSON.stringify(r)) as Row;
    const touche = (r: Row) => { if ('updated_at' in r) r.updated_at = horloge(); };
    if (this.op === 'select') {
      let rows = t.filter((r) => this.filtres.every((f) => f(r)));
      if (this.tri) { const { col, asc } = this.tri; rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(valeur(a, col), valeur(b, col))); }
      return { data: rows.slice(0, this.limite).map(copie), error: null };
    }
    if (this.op === 'insert') {
      const faites: Row[] = [];
      for (const row of this.charge) {
        if (t.some((r) => r[cle] === row[cle])) return { data: null, error: { message: `duplicate key ${this.table}` } };
        const neuve = { ...(this.table === 'assistants_prises' ? { quand: horloge() } : {}), ...('updated_at' in (t[0] ?? {}) || ['appointments', 'assistants'].includes(this.table) ? { updated_at: horloge() } : {}), ...copie(row) };
        t.push(neuve); faites.push(copie(neuve));
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'upsert') {
      const faites: Row[] = [];
      for (const row of this.charge) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i >= 0) { if (this.options.ignoreDuplicates) continue; t[i] = { ...t[i], ...copie(row) }; touche(t[i]); faites.push(copie(t[i])); }
        else { const neuve = { ...(['appointments', 'assistants'].includes(this.table) ? { updated_at: horloge() } : {}), ...copie(row) }; t.push(neuve); faites.push(copie(neuve)); }
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'update') {
      const touchees = t.filter((r) => this.filtres.every((f) => f(r)));
      for (const r of touchees) { Object.assign(r, copie(this.charge[0])); touche(r); }
      return { data: this.veutSelect ? touchees.map(copie) : null, error: null };
    }
    const gardees = t.filter((r) => !this.filtres.every((f) => f(r)));
    const parties = t.length - gardees.length;
    tables[this.table] = gardees;
    return { data: this.veutSelect ? [] : null, error: parties >= 0 ? null : { message: '' } };
  }
}
/* Le compartiment des pièces jointes (1er novembre 2026) : ce qui y est déposé, et une panne à la demande. */
const depots: { compartiment: string; chemin: string; taille: number; type?: string }[] = [];
let stockageEnPanne = false;
const fabrique = (_url: string, _cle: string) => ({
  storage: { from: (compartiment: string) => ({ upload: async (chemin: string, octets: Uint8Array, o?: { contentType?: string }) => {
    if (stockageEnPanne) return { data: null, error: { message: 'compartiment indisponible' } };
    depots.push({ compartiment, chemin, taille: octets.length, type: o?.contentType }); return { data: { path: chemin }, error: null };
  } }) },
  from: (table: string) => new Requete(table),
  auth: { getUser: async (jwt: string) => (JWTS[jwt] ? { data: { user: { id: JWTS[jwt] } }, error: null } : { data: { user: null }, error: { message: 'invalide' } }) },
  rpc: async (nom: string, params: Row) => {
    rpcAppels.push({ nom, params });
    if (nom === 'fiches_du_numero') return { data: fichesParNumero[String(params.n)] ?? [], error: null };
    if (nom === 'pose_si_libre') {
      const rdv = params.p_rdv as Row; const maitres = (params.p_maitres as string[]) ?? [''];
      const appts = tables.appointments;
      const deja = appts.find((a) => a.id === rdv.id);
      if (deja) return { data: { ok: true, verdict: 'deja', id: deja.id, master: (deja.data as Row).master }, error: null };
      const aujourdhui = aCotonou(Date.now()).dateISO; const dans90 = aCotonou(Date.now() + 90 * 86_400_000).dateISO;
      if (String(rdv.date) <= aujourdhui || String(rdv.date) > dans90) return { data: { ok: false, raison: 'creneau_hors_fenetre' }, error: null };
      const meme = appts.find((a) => { const d = a.data as Row; return d.clientId === rdv.clientId && d.date === rdv.date && d.time === rdv.time && d.status !== 'annulé'; });
      if (meme) return { data: { ok: true, verdict: 'deja_pose', id: meme.id, master: (meme.data as Row).master }, error: null };
      if (creneauPris) return { data: { ok: false, raison: 'creneau_pris' }, error: null };
      appts.push({ id: rdv.id, branch_id: rdv.branchId, data: { ...rdv, master: maitres[0], dureeMin: 60 }, updated_at: horloge() });
      return { data: { ok: true, verdict: 'pose', id: rdv.id, master: maitres[0], dureeMin: 60 }, error: null };
    }
    return { data: null, error: { message: `rpc inconnue ${nom}` } };
  },
});
const pushs: { url: string; corps: Row; autorisation: string }[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string; headers: Record<string, string> }) => {
  if (!String(url).endsWith('/functions/v1/push-notify')) throw new Error(`appel inattendu : ${url}`);
  pushs.push({ url: String(url), corps: JSON.parse(init.body), autorisation: init.headers.authorization });
  return { status: 200, json: async () => ({ version: 'banc', sent: 1 }) };
};
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'service', WA_TOKEN: 'wa', WA_PHONE_ID: '123', WA_TEMPLATE_CONF: 'confirmation_rdv' };
const sourceF = readFileSync(process.env.ASSISTANTS_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', sourceF)(fabrique, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });

type Reponse = { ok?: boolean; motif?: string; detail?: string; tournure?: string; verdict?: string; rdvId?: string; id?: string; jeton?: string; [k: string]: unknown };
const appelle = async (entetes: Record<string, string>, corps: unknown) => {
  const r = await handler!(new Request('http://f/assistants-maison', { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Reponse };
};
const opale = { 'x-jeton-assistant': JETON_OPALE };
const onyx = { 'x-jeton-assistant': JETON_ONYX };
const yeman = { authorization: 'Bearer jwt-yeman' };
const brice = { authorization: 'Bearer jwt-brice' };
const ligne = (table: string, f: (r: Row) => boolean) => tables[table].find(f) ?? null;
const lignes = (table: string, f: (r: Row) => boolean) => tables[table].filter(f);
const dateDans = (j: number) => aCotonou(Date.now() + j * 86_400_000).dateISO;
const aujourdhui = dateDans(0);
const sansNom = (texte: string) => !/Awa|Codjo|Dossi|Efua|Fifa|Gbessi|Hola|Banc/.test(texte);

const g = await handler!(new Request('http://f/assistants-maison', { method: 'GET' }));
dit('GET : la santé, la version, le nombre d assistants, aucun secret', ['assistants-maison', '2026-11-02-a', 2, false],
  await g.json().then((x: { fonction?: string; version?: string; assistants?: number }) => [x.fonction, x.version, x.assistants, JSON.stringify(x).includes('service')]));
dit('sans porte : refusé', [403, 'reserve-aux-assistants'], await appelle({}, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif]));
dit('un jeton inconnu : refusé', [403, 'reserve-aux-assistants'], await appelle({ 'x-jeton-assistant': 'assistant-opale-faux' }, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif]));
dit('la porte A sur une action de la porte B, et l inverse : mauvaise porte', [403, 'mauvaise-porte', 403, 'mauvaise-porte'], [
  ...(await appelle(opale, { action: 'jeton.donner', id: 'x' }).then((r) => [r.status, r.corps.motif])),
  ...(await appelle(yeman, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif])),
]);
dit('un membre du personnel qui n est pas souverain : la porte B reste fermée', [403, 'reserve-aux-assistants'], await appelle({ authorization: 'Bearer jwt-maitre' }, { action: 'jeton.donner', id: 'x' }).then((r) => [r.status, r.corps.motif]));
dit('une action inconnue : refusée avant toute porte', [400, 'action-inconnue'], await appelle(opale, { action: 'sql' }).then((r) => [r.status, r.corps.motif]));

/* Le passage : d'abord quelques relais et décisions pour Opale. */
tables.assistants_relais.push(
  { id: 'rel-a', de: 'onyx', pour: 'opale', genre: 'envie-lue', numero_cle: '2290197000001', quand: horloge(), perime_le: null, traite_le: null },
  { id: 'rel-perime', de: 'onyx', pour: 'opale', genre: 'fil-ouvert', quand: horloge(), perime_le: new Date(Date.now() - 60_000).toISOString(), traite_le: null },
  { id: 'rel-traite', de: 'onyx', pour: 'opale', genre: 'rdv-annule', quand: horloge(), perime_le: null, traite_le: horloge() },
);
tables.assistants_decisions.push(
  { id: 'dec-tranchee', assistant: 'opale', genre: 'reponse', resume: 'r', proposition: 'p', choix: ['envoyer', 'modifier', 'non'], tranchee: 'envoyer', tranchee_le: horloge(), executee_le: null, cree_le: horloge() },
  { id: 'dec-attend', assistant: 'opale', genre: 'reponse', resume: 'r', proposition: 'p', choix: ['envoyer', 'modifier', 'non'], tranchee: null, executee_le: null, cree_le: horloge() },
);
const p1 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true }, version: '2026-10-31', traites: 4 });
const opaleApres = ligne('assistants', (a) => a.id === 'opale')!;
dit('le passage : vu, éveillé depuis maintenant, l état écrit, les réglages, un relais vivant, une décision tranchée, l autre endormi',
  [true, null, true, true, 4, 15, ['rel-a'], ['dec-tranchee'], [{ id: 'onyx', etat: 'endormi', detail: 'jamais passé' }], null],
  [p1.corps.ok, p1.corps.precedentVuLe, !!opaleApres.vu_le, opaleApres.eveille_depuis === opaleApres.vu_le, (opaleApres.etat as Row).traites, (p1.corps.reglages as Row).rythmeMin,
    (p1.corps.relais as Row[]).map((r) => r.id), (p1.corps.decisions as Row[]).map((d) => d.id), (p1.corps.autres as Row[]).map((a) => ({ id: a.id, etat: a.etat, detail: a.detail })), p1.corps.empeche]);
const vu1 = opaleApres.vu_le; const serie1 = opaleApres.eveille_depuis;
const p2 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… le second passage rend le précédent et garde la série', [vu1, serie1], [p2.corps.precedentVuLe, p2.corps.eveilleDepuis]);
/* Cinquante minutes : au-delà du seuil à toute heure (30 min le jour au rythme de 15 du banc, 45 le soir et la nuit). */
opaleApres.vu_le = new Date(Date.now() - 50 * 60_000).toISOString();
const p3 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… après cinquante minutes de silence, c est un réveil : la série repart', true, p3.corps.eveilleDepuis !== serie1 && Date.parse(String(p3.corps.eveilleDepuis)) > Date.now() - 5_000);

/* Le rythme du soir (2 novembre 2026). L'horloge de la fonction est posée à
   la main le temps de ces passages, dans deux jours : un soir, puis le
   lendemain matin. Les lignes d'Opale et d'Onyx sont rendues telles quelles
   ensuite : la suite du banc ne voit rien de ces heures. */
const vraiMaintenant = Date.now;
const minuitDuBanc = Date.parse(`${dateDans(2)}T00:00:00Z`) - 3_600_000;
const aLHeure = (h: number, m: number) => minuitDuBanc + (h * 60 + m) * 60_000;
const passeA = async (ms: number, qui: Record<string, string>, controles = { chrome: true, lie: true, nonLus: true }) => {
  Date.now = () => ms;
  try { return await appelle(qui, { action: 'passage', controles }); } finally { Date.now = vraiMaintenant; }
};
const opaleL = ligne('assistants', (x) => x.id === 'opale')!;
const onyxL = ligne('assistants', (x) => x.id === 'onyx')!;
const opaleAvantLeSoir = JSON.parse(JSON.stringify({ vu_le: opaleL.vu_le, eveille_depuis: opaleL.eveille_depuis, etat: opaleL.etat })) as Row;
const s1 = await passeA(aLHeure(20, 7), opale);
const s2 = await passeA(aLHeure(20, 37), opale);
const s3 = await passeA(aLHeure(21, 12), opale);
const s4 = await passeA(aLHeure(22, 0), opale);
dit('le soir, trente minutes entre deux passages, et trente-cinq pour un tour en retard, gardent la série ; quarante-huit la rompent', [true, true, true, true], [
  s1.corps.eveilleDepuis === isoDe(aLHeure(20, 7)), s2.corps.eveilleDepuis === s1.corps.eveilleDepuis, s3.corps.eveilleDepuis === s1.corps.eveilleDepuis,
  s4.corps.eveilleDepuis === isoDe(aLHeure(22, 0))]);
dit('… le passage rend la veille bâtie sur les réglages du Trône (ici, le rythme du jour à 15 min)',
  { dansLaVeille: true, rythmeMin: 30, crons: ['3-59/15 6-17 * * *', '7,37 18-23 * * *'] }, s2.corps.veille);
const avantLeSoir = pushs.length;
for (const [h, m] of [[20, 7], [20, 37], [21, 7]]) await passeA(aLHeure(h, m), onyx, { chrome: true, lie: false, nonLus: true });
dit('un empêché du soir n est dit qu une fois sur trois tours à trente minutes', 1, pushs.slice(avantLeSoir).filter((x) => x.corps.title === 'Onyx est empêché').length);
Object.assign(onyxL, { vu_le: isoDe(aLHeure(34, 0) - 28 * 60_000), eveille_depuis: null, etat: {} });
const s5 = await passeA(aLHeure(34, 0), opale);
dit('… l état de l autre assistant suit les mêmes réglages : vingt-huit minutes au rythme de 15, il veille encore', 'eveille',
  ((s5.corps.autres as Row[]) ?? []).find((x) => x.id === 'onyx')?.etat);
Object.assign(onyxL, { vu_le: null, eveille_depuis: null, etat: {} });
Object.assign(opaleL, opaleAvantLeSoir);

/* L'empêché, prévenu une fois. */
const avantEmpeche = pushs.length;
const e1r = await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: false, nonLus: true } });
await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: false, nonLus: true } });
const notifEmpeche = pushs[avantEmpeche];
dit('un passage empêché : l état le dit, le porteur est prévenu une fois sur son téléphone, sans nom',
  ['WhatsApp Web délié : le code QR est à l\'écran', 1, 'to-staff', 'u-brice', 'Onyx est empêché', 'Bearer service', '/trone/#/assistants', 'mnd-assistants'],
  [e1r.corps.empeche, pushs.length - avantEmpeche, notifEmpeche?.corps.mode, notifEmpeche?.corps.userId, notifEmpeche?.corps.title, notifEmpeche?.autorisation, notifEmpeche?.corps.url, notifEmpeche?.corps.tag]);
await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
await appelle(onyx, { action: 'passage', controles: { chrome: false, lie: true, nonLus: true } });
dit('… rétabli puis empêché à nouveau : prévenu à nouveau', 2, pushs.length - avantEmpeche);

/* Les relais. */
dit('relais.deposer : une citation, un numéro, un mot étranger aux faits sont refusés, et nommés',
  [400, 'mot-refuse', true, 'mot-refuse', true, 'mot-refuse', 'un mot hors des faits de la Maison : « rupture »'], [
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'elle a dit « je viens »' }).then((r) => [r.status, r.corps.motif, String(r.corps.detail).includes('guillemets')])),
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'rappeler au 01 97 00 00 01' }).then((r) => [r.corps.motif, String(r.corps.detail).includes('numéro')])),
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'rupture de stock' }).then((r) => [r.corps.motif, r.corps.detail])),
  ]);
const avantRelais = pushs.length;
const r1 = await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', numeroCle: '+229 01 97 00 00 01', mot: 'sœur, création, mardi 14 h' });
const relR1 = ligne('assistants_relais', (r) => r.id === r1.corps.id)!;
dit('« sœur, création, mardi 14 h » passe : la ligne, la clé du numéro réduite, aucune notification pour une envie, le journal',
  [true, 'opale', 'onyx', 'envie-lue', '2290197000001', 'sœur, création, mardi 14 h', 0, 'assistant', 'Opale', 'pose', 'Relais : Une envie lue, posée en Note du carnet'],
  [r1.corps.ok, relR1?.de, relR1?.pour, relR1?.genre, relR1?.numero_cle, relR1?.mot, pushs.length - avantRelais,
    ...((): unknown[] => { const j = tables.journal_gestes.find((g) => (g.data as Row).pieceId === r1.corps.id)?.data as Row | undefined; return [j?.porte, j?.parNom, j?.verbe, j?.piece]; })()]);
dit('le prénom de la fiche visée est permis', true, (await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', clientId: 'cl-1', mot: 'Awa viendra mardi' })).corps.ok);
dit('un relais à soi-même, un genre inconnu : refusés', ['pour-invalide', 'genre-inconnu'], [
  (await appelle(opale, { action: 'relais.deposer', pour: 'opale', genre: 'envie-lue' })).corps.motif,
  (await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'potin' })).corps.motif,
]);
const r2 = await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'argent-a-trancher', clientId: 'cl-1', mot: 'Awa doit encore le reste du carnet' });
const notifR2 = pushs[pushs.length - 1];
dit('un relais qui demande un geste part aussi au téléphone de l autre porteur : le bon compte, un corps sans nom',
  [true, 1, 'to-staff', 'u-brice', 'Une question d\'argent', 'Un relais vous attend au Trône.', true],
  [r2.corps.ok, r2.corps.sent, notifR2?.corps.mode, notifR2?.corps.userId, notifR2?.corps.title, notifR2?.corps.body, sansNom(JSON.stringify(notifR2?.corps))]);
dit('relais.traiter : l autre le traite, le déposant ne peut pas', [true, true, 403, 'pas-a-toi'], [
  (await appelle(onyx, { action: 'relais.traiter', id: r1.corps.id })).corps.ok, !!ligne('assistants_relais', (r) => r.id === r1.corps.id)!.traite_le,
  ...(await appelle(opale, { action: 'relais.traiter', id: r2.corps.id }).then((r) => [r.status, r.corps.motif])),
]);

/* Les décisions. */
dit('decision.deposer : une tournure d assistant est refusée et nommée ; un résumé qui cite aussi', [400, 'proposition-refusee', 'c\'est noté', 'resume-refuse'], [
  ...(await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Une cliente demande une place samedi', proposition: 'C’est noté, je te réserve la place' }).then((r) => [r.status, r.corps.motif, r.corps.tournure])),
  (await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'elle dit « samedi »', proposition: 'ok' })).corps.motif,
]);
const d1 = await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Une cliente demande une place samedi matin', proposition: 'ok samedi 10h', numeroCle: '2290197000001', notifier: true });
const decD1 = ligne('assistants_decisions', (d) => d.id === d1.corps.id)!;
const notifD1 = pushs[pushs.length - 1];
dit('une décision déposée : la ligne, ses choix, le porteur prévenu (son assistant nommé, rien d autre)',
  [true, 'opale', 'reponse', ['envoyer', 'modifier', 'non'], null, 'u-yeman', 'Une décision vous attend', 'Opale a laissé une proposition dans Les assistants.'],
  [d1.corps.ok, decD1?.assistant, decD1?.genre, decD1?.choix, decD1?.tranchee, notifD1?.corps.userId, notifD1?.corps.title, notifD1?.corps.body]);
dit('decision.executee : par son assistant seulement', [403, true, true], [
  (await appelle(onyx, { action: 'decision.executee', id: 'dec-tranchee' })).status,
  (await appelle(opale, { action: 'decision.executee', id: 'dec-tranchee' })).corps.ok, !!ligne('assistants_decisions', (d) => d.id === 'dec-tranchee')!.executee_le,
]);

/* Les rendez-vous. */
const socle = { action: 'rdv.poser', serviceIds: ['s-creation'], time: '10:00', pourMaitre: 'st-5qduae5jef' };
dit('rdv.poser : une fiche inconnue, jamais créée ; plusieurs têtes sous un numéro : à choisir', [404, 'fiche-inconnue', 0, 409, 'plusieurs-fiches', 2], [
  ...(await appelle(opale, { ...socle, numeroCle: '2290197000003', date: dateDans(10), idempotence: 'opale:3:a' }).then((r) => [r.status, r.corps.motif, tables.assistants_prises.length])),
  ...(await appelle(opale, { ...socle, numeroCle: '2290197000004', date: dateDans(10), idempotence: 'opale:4:a' }).then((r) => [r.status, r.corps.motif, (r.corps.fiches as Row[]).length])),
]);
const rpcAvant = rpcAppels.filter((a) => a.nom === 'pose_si_libre').length;
const pose1 = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(10), idempotence: 'opale:1:a' });
const rdv1 = ligne('appointments', (a) => a.id === pose1.corps.rdvId)!;
const d1j = (rdv1?.data ?? {}) as Row;
const journalRdv1 = tables.journal_gestes.find((g) => (g.data as Row).pieceId === pose1.corps.rdvId)?.data as Row | undefined;
dit('la pose dans la fenêtre : par le verrou de la base, confirmée, signée par l assistant, pour son maître, sans relais ; le journal sans nom',
  [true, 'pose', 'Team', true, 1, 'confirmé', 'assistant', 'Opale', 'st-5qduae5jef', false, 'cl-1', ['s-creation'], true, 0,
    'assistant', 'Opale', 'pose', 'appointments', 'Les assistants', `Rendez-vous ${heureDite(dateDans(10), '10:00', Date.now())}, Création`, true],
  [pose1.corps.ok, pose1.corps.verdict, pose1.corps.master, /^rdv-/.test(String(pose1.corps.rdvId)), rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvant,
    d1j.status, d1j.source, d1j.poseePar, d1j.pourMaitre, d1j.sansConfirmation, d1j.clientId, d1j.serviceIds, !!d1j.creeLe, tables.assistants_relais.filter((r) => r.rdv_id === pose1.corps.rdvId).length,
    journalRdv1?.porte, journalRdv1?.parNom, journalRdv1?.verbe, journalRdv1?.table, journalRdv1?.ecran, journalRdv1?.piece, sansNom(JSON.stringify(journalRdv1))]);
dit('… les prises : le geste et le jour, avec le rendez-vous', [pose1.corps.rdvId, pose1.corps.rdvId], [
  ligne('assistants_prises', (p) => p.cle === 'geste:opale:1:a')?.rdv_id, ligne('assistants_prises', (p) => p.cle === `jour:2290197000001:${dateDans(10)}`)?.rdv_id,
]);
const rejoue = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(10), idempotence: 'opale:1:a' });
dit('la même pose rejouée : déjà, le même rendez-vous, rien de plus', [true, 'deja', pose1.corps.rdvId, 1, 1],
  [rejoue.corps.ok, rejoue.corps.verdict, rejoue.corps.rdvId, rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvant, tables.appointments.length]);
const dejaUn = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(15), idempotence: 'opale:1:b' });
dit('elle a déjà un rendez-vous à venir : le porteur tranche, la prise est rendue', [409, 'deja-un-rdv', pose1.corps.rdvId, dateDans(10), null],
  [dejaUn.status, dejaUn.corps.motif, (dejaUn.corps.rdv as Row)?.id, (dejaUn.corps.rdv as Row)?.date, ligne('assistants_prises', (p) => p.cle === 'geste:opale:1:b')]);
const ajout = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(15), idempotence: 'opale:1:b', ajouter: true });
dit('… « Ajouter » pose quand même', [true, 'pose'], [ajout.corps.ok, ajout.corps.verdict]);
const pris = await appelle(onyx, { ...socle, numeroCle: '2290197000001', date: dateDans(10), time: '15:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'onyx:1:a' });
dit('la prise du jour est à l autre : pris, par qui, et le geste rendu', [409, 'pris', 'Opale', true, null],
  [pris.status, pris.corps.motif, pris.corps.par, !!pris.corps.quand, ligne('assistants_prises', (p) => p.cle === 'geste:onyx:1:a')]);
const rpcAvantDirect = rpcAppels.filter((a) => a.nom === 'pose_si_libre').length;
const direct = await appelle(opale, { ...socle, numeroCle: '2290197000002', date: aujourdhui, time: '16:00', idempotence: 'opale:2:a' });
const rdvDirect = ligne('appointments', (a) => a.id === direct.corps.rdvId);
dit('hors de la fenêtre du verrou (le jour même) : l insert direct, la branche vedette', [true, 'pose', 0, 'br-test', 'confirmé'],
  [direct.corps.ok, direct.corps.verdict, rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvantDirect, rdvDirect?.branch_id, (rdvDirect?.data as Row)?.status]);
creneauPris = true;
const plein = await appelle(opale, { ...socle, numeroCle: '2290197000009', date: dateDans(12), idempotence: 'opale:9:a' });
creneauPris = false;
dit('le verrou refuse la place : le motif de la base, et le geste rendu', ['creneau_pris', null], [plein.corps.motif, ligne('assistants_prises', (p) => p.cle === 'geste:opale:9:a')]);

/* La place tenue. */
const avantTenue = pushs.length;
const tenue = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000005', serviceIds: ['s-sinsin'], date: dateDans(10), time: '14:00', pourMaitre: 'st-5qduae5jef', tenue: true, idempotence: 'onyx:5:a' });
const rdvTenue = ligne('appointments', (a) => a.id === tenue.corps.rdvId)!;
const dT = (rdvTenue?.data ?? {}) as Row;
const relTenue = ligne('assistants_relais', (r) => r.rdv_id === tenue.corps.rdvId && r.genre === 'place-tenue');
const decTenue = ligne('assistants_decisions', (d) => d.rdv_id === tenue.corps.rdvId && d.genre === 'place-tenue');
const notifTenue = pushs[avantTenue];
const heureTenue = heureDite(dateDans(10), '14:00', Date.now());
dit('la place tenue sur le fauteuil de l autre : en attente, sans confirmation, l échéance, le relais, la décision pour l autre, son téléphone',
  [true, 'tenue', 'en attente', true, 'onyx', 'opale', true, 'onyx', 'opale', heureTenue,
    'opale', ['confirmer', 'autre-heure', 'non'], true, true, true,
    1, 'u-yeman', 'Une place tenue pour vous', `${heureTenue} : confirmez d'un toucher dans Les assistants.`, true],
  [tenue.corps.ok, tenue.corps.verdict, dT.status, dT.sansConfirmation, (dT.tenue as Row)?.par, (dT.tenue as Row)?.pour, !!(dT.tenue as Row)?.jusqua, relTenue?.de, relTenue?.pour, relTenue?.mot,
    decTenue?.assistant, decTenue?.choix, String(decTenue?.resume).startsWith('Place tenue'), String(decTenue?.resume).includes('Onyx') && String(decTenue?.resume).includes('SÍNSIN'), decTenue?.echeance === (dT.tenue as Row)?.jusqua,
    pushs.length - avantTenue, notifTenue?.corps.userId, notifTenue?.corps.title, notifTenue?.corps.body, sansNom(JSON.stringify(notifTenue?.corps))]);

/* Les tresses, posées par Onyx : Hermine est à prévenir depuis le fil de Yéman. */
const avantTresses = pushs.length;
const tresses = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000006', serviceIds: ['s-nattes'], date: dateDans(11), time: '09:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'onyx:6:a' });
const relHermine = ligne('assistants_relais', (r) => r.rdv_id === tresses.corps.rdvId && r.genre === 'hermine-a-prevenir');
dit('des tresses posées par Onyx : un relais à Opale, et le téléphone de Yéman', [true, 'onyx', 'opale', 'u-yeman', 'Tresses posées'],
  [tresses.corps.ok, relHermine?.de, relHermine?.pour, pushs[avantTresses]?.corps.userId, pushs[avantTresses]?.corps.title]);
const avantPourToi = pushs.length;
const pourToi = await appelle(opale, { action: 'rdv.poser', numeroCle: '2290197000007', serviceIds: ['s-creation'], date: dateDans(12), time: '11:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'opale:7:a' });
dit('un rendez-vous posé pour l autre, sans tenue : confirmé, un relais, son téléphone', [true, 'pose', 'confirmé', 'rdv-pose-pour-toi', 'u-brice', 'Rendez-vous posé pour vous'],
  [pourToi.corps.ok, pourToi.corps.verdict, (ligne('appointments', (a) => a.id === pourToi.corps.rdvId)?.data as Row)?.status,
    ligne('assistants_relais', (r) => r.rdv_id === pourToi.corps.rdvId)?.genre, pushs[avantPourToi]?.corps.userId, pushs[avantPourToi]?.corps.title]);

/* Le verrou optimiste. */
const vieux = rdv1.updated_at;
const depl0 = await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(11), time: '11:00', updatedAt: '2020-01-01T00:00:00.000Z' });
const depl1 = await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(11), time: '11:00', updatedAt: vieux });
const rdv1Apres = ligne('appointments', (a) => a.id === pose1.corps.rdvId)!;
const journalDepl = tables.journal_gestes.filter((g) => (g.data as Row).pieceId === pose1.corps.rdvId && (g.data as Row).verbe === 'modifie').pop()?.data as Row | undefined;
dit('rdv.deplacer : le verrou optimiste refuse une lecture périmée, accepte la bonne, et bouge la date', [409, 'modifie-entre-temps', true, dateDans(11), '11:00', true, true, 'Date'],
  [depl0.status, depl0.corps.motif, depl1.corps.ok, (rdv1Apres.data as Row).date, (rdv1Apres.data as Row).time, rdv1Apres.updated_at !== vieux, depl1.corps.updatedAt === rdv1Apres.updated_at, (journalDepl?.champs as Row[])?.[0]?.champ]);
dit('… rejouer avec l ancienne lecture : refusé', 'modifie-entre-temps', (await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(12), time: '11:00', updatedAt: vieux })).corps.motif);
const rdvPourToi = ligne('appointments', (a) => a.id === pourToi.corps.rdvId)!;
await appelle(opale, { action: 'rdv.deplacer', rdvId: pourToi.corps.rdvId, date: dateDans(13), time: '11:00', updatedAt: rdvPourToi.updated_at });
dit('… déplacé sur le fauteuil de l autre : relais rdv-deplace', 'rdv-deplace', lignes('assistants_relais', (r) => r.rdv_id === pourToi.corps.rdvId).pop()?.genre);
const rdvAjout = ligne('appointments', (a) => a.id === ajout.corps.rdvId)!;
const ann = await appelle(opale, { action: 'rdv.annuler', rdvId: ajout.corps.rdvId, updatedAt: rdvAjout.updated_at });
dit('rdv.annuler sous le même verrou : annulé', [true, 'annulé'], [ann.corps.ok, (ligne('appointments', (a) => a.id === ajout.corps.rdvId)?.data as Row).status]);

/* La note. */
const note = await appelle(opale, { action: 'note.poser', rdvId: pose1.corps.rdvId, note: 'Veut une couleur cuivre, longueur épaules' });
dit('note.poser : signée du nom de l assistant et du jour, une citation refusée', [true, true, 'note-refusee'], [
  note.corps.ok, /^Opale, .+ : Veut une couleur cuivre, longueur épaules$/.test(String((ligne('appointments', (a) => a.id === pose1.corps.rdvId)?.data as Row).note)),
  (await appelle(opale, { action: 'note.poser', rdvId: pose1.corps.rdvId, note: 'elle a dit « bof »' })).corps.motif,
]);

/* Notifier. */
const avantNotif = pushs.length;
const n1 = await appelle(opale, { action: 'notifier', pour: 'moi', genre: 'decision' });
const n2 = await appelle(opale, { action: 'notifier', pour: 'onyx', genre: 'assistant-endormi', detail: { heure: 'rappeler 0197000001' } });
const n3 = await appelle(opale, { action: 'notifier', pour: 'moi', genre: 'blague' });
dit('notifier : moi, l autre, un genre inconnu ; un détail qui porte un numéro tombe', [true, true, 'u-yeman', 'u-brice', 'Des fils attendent de son côté.', 2, 'genre-inconnu'],
  [n1.corps.ok, n2.corps.ok, pushs[avantNotif]?.corps.userId, pushs[avantNotif + 1]?.corps.userId, pushs[avantNotif + 1]?.corps.body, pushs.length - avantNotif, n3.corps.motif]);

/* Le jeton, donné par un souverain. */
const don = await appelle(brice, { action: 'jeton.donner', id: 'jaspe', nom: 'Jaspe', porteurTeamId: 'st-banc', appareil: 'un portable' });
const jaspe = ligne('assistants', (a) => a.id === 'jaspe');
dit('jeton.donner : un jeton rendu une fois, l empreinte écrite, jamais le jeton, le porteur = le compte du JWT',
  [true, true, true, 'u-brice', 'Jaspe', false, false],
  [don.corps.ok, /^assistant-jaspe-[0-9a-f]{48}$/.test(String(don.corps.jeton)), jaspe?.empreinte === await empreinteDuJetonAssistant(String(don.corps.jeton)), jaspe?.porteur_user_id, jaspe?.nom,
    JSON.stringify(tables).includes(String(don.corps.jeton)), JSON.stringify(tables.journal_gestes).includes('jaspe')]);
dit('jeton.donner : le jeton d un assistant se donne depuis le compte de son porteur', [403, 'pas-ton-assistant', 403, 'pas-ton-assistant', true], [
  ...(await appelle(yeman, { action: 'jeton.donner', id: 'onyx' }).then((r) => [r.status, r.corps.motif])),
  ...(await appelle(yeman, { action: 'jeton.donner', id: 'grenat', porteurTeamId: 'st-d4t24p6inh' }).then((r) => [r.status, r.corps.motif])),
  (await appelle(brice, { action: 'jeton.donner', id: 'grenat', porteurTeamId: 'st-d4t24p6inh' })).corps.ok,
]);
dit('… le jeton ouvre la porte A ; retiré, il ne l ouvre plus', [true, true, 403], [
  (await appelle({ 'x-jeton-assistant': String(don.corps.jeton) }, { action: 'passage', controles: {} })).corps.ok,
  (await appelle(brice, { action: 'jeton.retirer', id: 'jaspe' })).corps.ok,
  (await appelle({ 'x-jeton-assistant': String(don.corps.jeton) }, { action: 'passage', controles: {} })).status,
]);

/* La décision tranchée. */
dit('decision.trancher : l autre souverain non ; un choix hors liste non ; le porteur oui ; deux fois non', [403, 'pas-ta-decision', 400, 'choix-inconnu', true, 'modifier', 'ok samedi 11h', 409, 'deja-tranchee'], [
  ...(await appelle(brice, { action: 'decision.trancher', id: d1.corps.id, choix: 'envoyer' }).then((r) => [r.status, r.corps.motif])),
  ...(await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'confirmer' }).then((r) => [r.status, r.corps.motif])),
  (await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'modifier', texte: 'ok samedi 11h' })).corps.ok,
  ligne('assistants_decisions', (d) => d.id === d1.corps.id)?.tranchee, ligne('assistants_decisions', (d) => d.id === d1.corps.id)?.texte_modifie,
  ...(await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'non' }).then((r) => [r.status, r.corps.motif])),
]);
const p4 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… le passage suivant de l assistant la rend à exécuter', true, (p4.corps.decisions as Row[]).some((d) => d.id === d1.corps.id && d.tranchee === 'modifier'));

/* La place tranchée : la confirmation officielle part d'ici. */
const avantPlace = pushs.length;
dit('place.trancher : l autre souverain ne confirme pas la place de Yéman', [403, 'pas-ta-decision'], await appelle(brice, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' }).then((r) => [r.status, r.corps.motif]));
const conf = await appelle(yeman, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' });
const rdvTenueApres = ligne('appointments', (a) => a.id === tenue.corps.rdvId)!;
const dTA = rdvTenueApres.data as Row;
const relConf = ligne('assistants_relais', (r) => r.rdv_id === tenue.corps.rdvId && r.genre === 'place-confirmee');
const envoiWa = ligne('envois', (e) => e.id === `conf-${tenue.corps.rdvId}-whatsapp`);
const envoiPush = ligne('envois', (e) => e.id === `conf-${tenue.corps.rdvId}-push`);
const colisWa = ((envoiWa?.data as Row)?.colis ?? {}) as Row;
const journalConf = tables.journal_gestes.filter((g) => (g.data as Row).pieceId === tenue.corps.rdvId).pop()?.data as Row | undefined;
dit('« Confirmer » : confirmé, la confirmation de la Maison rendue, la décision tranchée, le relais au poseur, son téléphone, les deux pièces officielles déposées en salle, le journal',
  [true, 'confirmer', 'confirmé', false, true, 'confirmer', 'u-yeman', 'opale', 'onyx', 'u-brice', 'Place confirmée',
    2, 'en-attente', 'confirmation', 'whatsapp', 'confirmation_rdv', '2290197000005', 2, true, 'en-attente', 'push', 'cl-3',
    'assistant', 'Y. B.', 'modifie', true],
  [conf.corps.ok, conf.corps.choix, dTA.status, dTA.sansConfirmation, !!(dTA.tenue as Row).confirmeeLe, decTenue?.tranchee, decTenue?.tranchee_par, relConf?.de, relConf?.pour, pushs[avantPlace]?.corps.userId, pushs[avantPlace]?.corps.title,
    conf.corps.deposes, (envoiWa?.data as Row)?.statut, (envoiWa?.data as Row)?.type, colisWa.genre, colisWa.modele, colisWa.numero, (colisWa.composants as Row[])?.[0] && ((colisWa.composants as Row[])[0].parameters as Row[]).length,
    String(colisWa.texteAuFil).includes('c\'est confirmé'), (envoiPush?.data as Row)?.statut, ((envoiPush?.data as Row)?.colis as Row)?.genre, ((envoiPush?.data as Row)?.colis as Row)?.clientId,
    journalConf?.porte, journalConf?.parNom, journalConf?.verbe, String(journalConf?.piece).startsWith('Place confirmée')]);
dit('… confirmer deux fois : non', 'deja-tranchee', (await appelle(yeman, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' })).corps.motif);
const tenue2 = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000008', serviceIds: ['s-creation'], date: dateDans(20), time: '10:00', pourMaitre: 'st-5qduae5jef', tenue: true, idempotence: 'onyx:8:a' });
const decTenue2 = ligne('assistants_decisions', (d) => d.rdv_id === tenue2.corps.rdvId)!;
const refus2 = await appelle(yeman, { action: 'decision.trancher', id: decTenue2.id, choix: 'autre-heure', date: dateDans(21), time: '15:00' });
dit('« Autre heure » par decision.trancher : annulé, la place refusée relayée avec l heure proposée, aucune pièce officielle',
  [true, 'annulé', 'place-refusee', heureDite(dateDans(21), '15:00', Date.now()), 'autre-heure', 0],
  [refus2.corps.ok, (ligne('appointments', (a) => a.id === tenue2.corps.rdvId)?.data as Row).status,
    ligne('assistants_relais', (r) => r.rdv_id === tenue2.corps.rdvId && r.genre === 'place-refusee')?.genre,
    ligne('assistants_relais', (r) => r.rdv_id === tenue2.corps.rdvId && r.genre === 'place-refusee')?.mot,
    ligne('assistants_decisions', (d) => d.id === decTenue2.id)?.tranchee, lignes('envois', (e) => String(e.id).includes(String(tenue2.corps.rdvId))).length]);

/* Les dépenses du jour (1er novembre 2026). */
tables.expense_categories = [{ id: 'ec-local', data: { id: 'ec-local', name: 'Local', subs: [] } }, { id: 'ec-log', data: { id: 'ec-log', name: 'Logistique', subs: [] } }];
tables.cashboxes = [
  { id: 'cb-1', data: { id: 'cb-1', branchId: 'br-test', name: 'Caisse Principale' } }, { id: 'cb-2', data: { id: 'cb-2', branchId: 'br-test', name: 'MoMo Privé' } },
  { id: 'cb-3', data: { id: 'cb-3', branchId: 'br-test', name: 'Ancienne', archiveeLe: '2026-10-01' } },
];
tables.expenses = [{ id: 'exp-gaz', branch_id: 'br-test', data: { id: 'exp-gaz', branchId: 'br-test', label: 'Gaz', amountXof: 6000, date: aujourdhui, cashbox: 'Caisse Principale', category: 'Local', porteur: 'B. A.' } }];
tables.documents.push({ key: 'mnd_porteurs', data: ['B. A.', 'Sandrine maison', 'Aimé'] }, { key: 'mnd_prestataires', data: [{ id: 'pv-h', name: 'Hermine' }, { id: 'pv-z', name: 'Ziadath' }] });
const RECU = { nom: 'reçu eau.jpg', type: 'image/jpeg', base64: Buffer.from('un reçu').toString('base64') };
const eau = { action: 'depense.poser', montantXof: 3500, objet: 'Eau', categorie: 'local', porteur: 'sandrine', idempotence: 'opale:m-eau', recu: RECU };
const dp1 = await appelle(opale, eau);
const lEau = ligne('expenses', (e) => e.id === dp1.corps.id);
const dEau = (lEau?.data ?? {}) as Row;
const jEau = tables.journal_gestes.filter((g) => (g.data as Row).pieceId === dp1.corps.id).pop()?.data as Row | undefined;
dit('depense.poser : posée à valider, au nom d Opale, la catégorie et le porteur de la Maison, la Caisse Principale, le reçu dans le compartiment des pièces jointes',
  [true, 'posee', 'br-test', 'Eau', 3500, aujourdhui, 'Local', 'Sandrine maison', 'Caisse Principale', 'attente', 'Opale', true, 'fil', true, 'image/jpeg', true],
  [dp1.corps.ok, dp1.corps.verdict, lEau?.branch_id, dEau.label, dEau.amountXof, dEau.date, dEau.category, dEau.porteur, dEau.cashbox,
    (dEau.validation as Row)?.etat, (dEau.validation as Row)?.soumisPar, String((dEau.fichier as Row)?.chemin).startsWith(`br-test/depense/${dp1.corps.id}-`),
    depots[0]?.compartiment, depots[0]?.chemin === (dEau.fichier as Row)?.chemin, depots[0]?.type, String(dp1.corps.id).startsWith('exp-opale-')]);
dit('… le journal : posé par Opale, porte assistant, le montant et la catégorie, jamais l objet', ['pose', 'expenses', 'Opale', 'assistant', 'Dépense à valider, 3 500 F, Local', false],
  [jEau?.verbe, jEau?.table, jEau?.parNom, jEau?.porte, jEau?.piece, String(jEau?.piece).includes('Eau')]);
const dp2 = await appelle(opale, eau);
dit('… le même geste rejoué : rien de plus, ni ligne ni reçu', [true, 'deja', dp1.corps.id, 1, 1],
  [dp2.corps.ok, dp2.corps.verdict, dp2.corps.id, lignes('expenses', (e) => e.id === dp1.corps.id).length, depots.length]);
const gaz = { action: 'depense.poser', montantXof: 6000, objet: 'Gaz', categorie: 'Local', idempotence: 'opale:m-gaz' };
const dp3 = await appelle(opale, gaz);
dit('le doublon du jour : refusé, avec qui l a saisi ; rien n est écrit', [409, 'doublon', 'exp-gaz', 'B. A.', 2],
  [dp3.status, dp3.corps.motif, (dp3.corps.deja as Row)?.id, (dp3.corps.deja as Row)?.saisiePar, tables.expenses.length]);
const dp4 = await appelle(opale, { ...gaz, autre: true, idempotence: 'opale:m-gaz-autre' });
dit('… « C en est une autre » : posée', [true, 'posee', 3], [dp4.corps.ok, dp4.corps.verdict, tables.expenses.length]);
const dp5 = await appelle(opale, { action: 'depense.poser', montantXof: 12000, objet: 'Tresses Hermine', categorie: 'Local', idempotence: 'opale:m-h' });
dit('un prestataire : refusé, sa mission naît du rituel ; rien n est écrit', [409, 'prestataire', 'Hermine', 3], [dp5.status, dp5.corps.motif, dp5.corps.prestataire, tables.expenses.length]);
const refusD = async (d: Record<string, unknown>) => { const r = await appelle(opale, { action: 'depense.poser', montantXof: 500, objet: 'Pain', categorie: 'Local', idempotence: `opale:r-${Math.random()}`, ...d }); return [r.status, r.corps.motif]; };
dit('les refus clairs : catégorie, caisse rangée, porteur inconnu, montant nul, date future, sans clé, reçu d un type inconnu', [
  [400, 'categorie-inconnue'], [400, 'caisse-inconnue'], [400, 'porteur-inconnu'], [400, 'montant'], [400, 'date-future'], [400, 'idempotence'], [400, 'recu-type']], [
  await refusD({ categorie: 'Essence' }), await refusD({ caisse: 'Ancienne' }), await refusD({ porteur: 'Paul' }), await refusD({ montantXof: 0 }),
  await refusD({ date: dateDans(1) }), await refusD({ idempotence: '' }), await refusD({ recu: { nom: 'x.gif', type: 'image/gif', base64: 'eA==' } })]);
dit('… le refus nomme ce que la Maison connaît', [['Local', 'Logistique'], ['Caisse Principale', 'MoMo Privé'], ['B. A.', 'Sandrine maison', 'Aimé']], [
  (await appelle(opale, { action: 'depense.poser', montantXof: 500, objet: 'Pain', categorie: 'Essence', idempotence: 'opale:r-c' })).corps.categories,
  (await appelle(opale, { action: 'depense.poser', montantXof: 500, objet: 'Pain', categorie: 'Local', caisse: 'Ancienne', idempotence: 'opale:r-k' })).corps.caisses,
  (await appelle(opale, { action: 'depense.poser', montantXof: 500, objet: 'Pain', categorie: 'Local', porteur: 'Paul', idempotence: 'opale:r-p' })).corps.porteurs]);
stockageEnPanne = true;
const dp6 = await appelle(opale, { action: 'depense.poser', montantXof: 800, objet: 'Savon', categorie: 'Local', idempotence: 'opale:m-savon', recu: RECU });
stockageEnPanne = false;
dit('le reçu ne se dépose pas : refusé, rien n est écrit', [502, 'recu-non-depose', 3], [dp6.status, dp6.corps.motif, tables.expenses.length]);
const dp7 = await appelle(onyx, { action: 'depense.poser', montantXof: 1000, objet: 'Zem', categorie: 'logistique', caisse: 'momo prive', idempotence: 'onyx:m-zem' });
dit('Onyx pose au nom d Onyx, dans la caisse nommée', [true, 'Onyx', 'MoMo Privé', 'Logistique'], [dp7.corps.ok, ((ligne('expenses', (e) => e.id === dp7.corps.id)?.data as Row)?.validation as Row)?.soumisPar,
  (ligne('expenses', (e) => e.id === dp7.corps.id)?.data as Row)?.cashbox, (ligne('expenses', (e) => e.id === dp7.corps.id)?.data as Row)?.category]);
dit('un souverain ne pose pas une dépense par la porte des assistants', [403, 'mauvaise-porte'], await appelle(yeman, eau).then((r) => [r.status, r.corps.motif]));
const ecranD = lit('src/apps/trone/routes/finances/Depenses.tsx');
dit('l écran Dépenses montre la file à valider, qui l a saisie, la pièce jointe, Valider et Refuser', [true, true, true, true], [
  ecranD.includes('aValider(toutesLesDepenses, branch.id)'), ecranD.includes('Saisie par <b>{e.validation?.soumisPar}</b>'),
  ecranD.includes("{e.fichier ? ' · pièce jointe' : ' · aucune pièce jointe'}"), ecranD.includes('onClick={() => dirOui(e)}>Valider</button>')]);

/* La recherche d'une fiche (1er novembre 2026). */
tables.clients.push(
  { id: 'cl-8', data: { name: 'Gbèssi Sossou', phone: '+229 01 97 00 00 10', civilite: 'madame', note: 'note privée', sante: 'allergie' } },
  { id: 'cl-9', data: { name: 'Gbèssi Sossa', phone: '+229 01 97 00 00 11', archived: true } },
);
tables.appointments.push(
  { id: 'rdv-g1', branch_id: 'br-test', data: { id: 'rdv-g1', clientId: 'cl-8', date: dateDans(3), time: '10:00', status: 'confirmé', serviceIds: ['s-creation'], note: 'note du carnet' }, updated_at: horloge() },
  { id: 'rdv-g2', branch_id: 'br-test', data: { id: 'rdv-g2', clientId: 'cl-8', date: dateDans(-3), time: '10:00', status: 'honoré', serviceIds: ['s-creation'] }, updated_at: horloge() },
  { id: 'rdv-g3', branch_id: 'br-test', data: { id: 'rdv-g3', clientId: 'cl-8', date: dateDans(5), time: '09:00', status: 'annulé', serviceIds: ['s-sinsin'] }, updated_at: horloge() },
);
const f1 = await appelle(opale, { action: 'fiche.chercher', nom: 'gbessi so' });
const f1f = (f1.corps.fiches as Row[]) ?? [];
dit('fiche.chercher par le nom, sans accent : une fiche, ses numéros, son rendez-vous à venir, rien d autre ; la fiche rangée ne sort pas',
  [true, 1, 'cl-8', 'Gbèssi Sossou', 'madame', ['+229 01 97 00 00 10'], [['rdv-g1', dateDans(3), '10:00', ['Création']]], false, false, false],
  [f1.corps.ok, f1f.length, f1f[0]?.id, f1f[0]?.nom, f1f[0]?.civilite, f1f[0]?.numeros, ((f1f[0]?.rdvs as Row[]) ?? []).map((r) => [r.id, r.date, r.heure, r.prestations]),
    JSON.stringify(f1.corps).includes('note'), JSON.stringify(f1.corps).includes('allergie'), f1.corps.plus]);
dit('… le rendez-vous rendu porte son updatedAt, pour déplacer ou annuler', true, typeof ((f1f[0]?.rdvs as Row[]) ?? [])[0]?.updatedAt === 'string' && String(((f1f[0]?.rdvs as Row[]) ?? [])[0]?.updatedAt).length > 10);
const f2 = await appelle(opale, { action: 'fiche.chercher', nom: 'banc' });
dit('… cinq fiches au plus, et « plus » le dit', [5, true], [((f2.corps.fiches as Row[]) ?? []).length, f2.corps.plus]);
const f3 = await appelle(opale, { action: 'fiche.chercher', numeroCle: '2290197000004' });
dit('… par le numéro : les fiches du numéro', ['cl-1', 'cl-3'], ((f3.corps.fiches as Row[]) ?? []).map((f) => f.id));
dit('… des initiales seules, un numéro faux : refusés', [[400, 'nom-trop-court'], [400, 'numero-invalide']], [
  await appelle(opale, { action: 'fiche.chercher', nom: 'A. S.' }).then((r) => [r.status, r.corps.motif]),
  await appelle(opale, { action: 'fiche.chercher', numeroCle: '12' }).then((r) => [r.status, r.corps.motif])]);
const lectures = tables.journal_gestes.filter((g) => (g.data as Row).verbe === 'lit').map((g) => g.data as Row);
dit('… chaque lecture au journal : « lu », par l assistant, sans le nom cherché', [3, true, true, false],
  [lectures.length, lectures.every((g) => g.parNom === 'Opale' && g.porte === 'assistant' && g.table === 'clients'), lectures[0]?.piece === 'une recherche de fiche, une trouvée',
    JSON.stringify(lectures).toLowerCase().includes('gb')]);
const ajoutees: Row[] = [];
for (let k = 0; k < 57; k++) { const g = { id: `geste-plafond-${k}`, branch_id: 'br-test', data: { id: `geste-plafond-${k}`, parNom: 'Opale', porte: 'assistant', verbe: 'lit', table: 'clients', piece: 'une recherche de fiche, une trouvée', quand: new Date().toISOString() } }; tables.journal_gestes.push(g); ajoutees.push(g); }
dit('soixante lectures par jour et par assistant : la soixante et unième est refusée, l autre assistant lit encore', [[429, 'plafond-des-lectures'], true], [
  await appelle(opale, { action: 'fiche.chercher', nom: 'gbessi' }).then((r) => [r.status, r.corps.motif]),
  (await appelle(onyx, { action: 'fiche.chercher', nom: 'gbessi' })).corps.ok]);
tables.journal_gestes = tables.journal_gestes.filter((g) => !ajoutees.includes(g));

/* Le journal et les téléphones, sans nom. */
dit('tout le journal passe par la porte assistant, signé, sans nom de cliente', [true, true, true, true], [
  tables.journal_gestes.length >= 8, tables.journal_gestes.every((g) => (g.data as Row).porte === 'assistant'),
  tables.journal_gestes.every((g) => ['Opale', 'Onyx', 'Y. B.'].includes(String((g.data as Row).parNom))), sansNom(JSON.stringify(tables.journal_gestes)),
]);
dit('aucune notification ne porte un nom ni un jeton', [true, true], [sansNom(JSON.stringify(pushs)), !JSON.stringify(pushs).includes(JETON_OPALE)]);

/* ── ③ LE CÂBLAGE ── */
const sql = lit('supabase/migrations/0149_assistants.sql');
dit('la migration porte les genres du module pur, dans ses contraintes', [true, true], [
  GENRES_DE_RELAIS.every((g) => sql.includes(`'${g}'`)), GENRES_DE_DECISION.every((g) => sql.includes(`'${g}'`)),
]);
dit('… l empreinte d Opale, Onyx sans jeton, la RLS sur les quatre tables, aucune politique d insert', [true, true, 4, false], [
  sql.includes("'ea99abc29efac82eaa16c7179449dc50454af41331a06299403f395207b06b47'"), /'onyx', 'Onyx', 'st-d4t24p6inh', null/.test(sql),
  (sql.match(/enable row level security/g) ?? []).length, /for insert/.test(sql),
]);
const miens = [lit('scripts/serveur/assistants-maison.ts'), lit('scripts/assistants-maison-serveur.mjs'), sql].join('\n');
dit('aucun numéro réel dans les sources, aucun tiret long dans les fichiers du chantier', [false, false],
  [/\+?229\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/.test(`${miens}\n${lit('src/shared/assistants-pur.ts')}`), miens.includes(String.fromCharCode(0x2014))]);

const ecranJ = lit('src/apps/trone/routes/systeme/Journal.tsx');
dit('l écran Journal et l écran Les assistants savent dire une lecture', [true, true, true], [
  /lit: 'Lu'/.test(ecranJ), /\{ k: 'lit', l: 'Lu' \}/.test(ecranJ), /lit: 'a fait'/.test(lit('src/apps/trone/routes/pilotage/Assistants.tsx'))]);

/* La veille des réglages (2 novembre 2026), du module pur jusqu'aux textes qui la disent. */
const bloc = (f: string) => {
  const t = lit(f); const a = t.indexOf('/* ⟨veille-des-assistants⟩ */'); const b = t.indexOf('/* ⟨/veille-des-assistants⟩ */');
  return a >= 0 && b > a ? t.slice(a, b) : `ABSENT de ${f}`;
};
dit('push-notify porte le bloc ⟨veille-des-assistants⟩ du module pur, mot pour mot (réglages, veille, seuil, chien de garde)',
  bloc('src/shared/assistants-pur.ts'), bloc('supabase/functions/push-notify/index.ts'));
const push = lit('supabase/functions/push-notify/index.ts');
dit('… et le chien de garde n en garde aucune autre copie, et dit sa version', [1, 1, true],
  [push.split('export function doitPrevenirDuSommeil(').length - 1, push.split('export const REGLAGES_PAR_DEFAUT').length - 1, push.includes("const VERSION = '2026-11-02-a';")]);
const charte = lit('docs/ASSISTANTS.md');
const cronsParDefaut = cronsDeLaVeille(REGLAGES_PAR_DEFAUT);
dit('la charte du 2 novembre 2026 : aucun /loop à rythme, les crons par défaut dits deux fois (sections 3 et 14), aucun ancien cron', [true, false, true, false], [
  charte.includes('*Version du 2 novembre 2026'), /\/loop\s*\d/.test(charte),
  cronsParDefaut.every((c) => charte.split(`\`${c}\``).length - 1 >= 2), charte.includes('*/10 6-17')]);
dit('… l heure de Cotonou avant tout, CronList avant de poser, la garde de l heure à chaque tour, le sélecteur qui tient la session', [true, true, true, true], [
  charte.includes('ne pose AUCUNE tâche de veille et ne fais pas ton passage'),
  charte.includes('**Avant d\'en poser, `CronList`**') && charte.includes('`CronDelete`'),
  charte.includes('1. **La garde de l\'heure, d\'abord.**'),
  charte.includes('7. **Le sélecteur tient la session.**')]);
const onyxSh = lit('scripts/onyx-installe.sh');
dit('l installateur d Onyx ne dit plus aucun /loop : son CLAUDE.md et son lanceur renvoient aux sections 3 et 14', [false, 2], [
  /\/loop\s*\d/.test(onyxSh), onyxSh.split('sections 3 et 14 de la charte').length - 1]);
const sqlSoir = lit('supabase/reglage_soir_des_assistants_20261102.sql');
dit('le SQL du soir : une copie de repli d abord, sous RLS, puis une fusion des deux clés du soir, jamais un remplacement', [true, true, true, true], [
  sqlSoir.indexOf('create table if not exists public.repli_mnd_settings_20261102_soir') >= 0
    && sqlSoir.indexOf('create table if not exists public.repli_mnd_settings_20261102_soir') < sqlSoir.indexOf('update public.documents'),
  sqlSoir.includes('alter table public.repli_mnd_settings_20261102_soir enable row level security;'),
  sqlSoir.includes(`coalesce(data->'assistants','{}'::jsonb) || '{"soirDe":18,"rythmeSoirMin":30}'::jsonb`),
  /select data->'assistants'/.test(sqlSoir)]);
const ecranA = lit('src/apps/trone/routes/pilotage/Assistants.tsx');
dit('l écran Les assistants règle le soir avec les bornes du module pur, et juge l état sur les réglages', [true, true, true], [
  ecranA.includes("{ cle: 'soirDe', libelle: 'Rythme du soir à partir de', unite: 'h', min: 0, max: 24 },"),
  ecranA.includes("{ cle: 'rythmeSoirMin', libelle: 'Rythme du soir', unite: 'min', min: 5, max: 60 },"),
  ecranA.includes('const e = etatDe(a, maintenant, r);')]);

console.log(ko === 0 ? '\nLes assistants tiennent.' : `\n${ko} ECHEC.`);
process.exit(ko ? 1 : 0);
