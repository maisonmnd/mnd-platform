/* LES SORTIES DE LA MAISON, ÉPROUVÉES — `node scripts/verifie-sortie.mjs`.

   Ce qui se joue ici est la base des clientes elle-même. Une règle trop large
   ferait disparaître du registre des têtes qui reviennent dans quinze jours,
   et personne ne saurait où elles sont passées ; une règle trop étroite
   laisserait la Maison compter des relations éteintes, relancer des gens qui
   n'ont plus de locks, et lire une rétention fausse en croyant qu'elle est
   vraie. Les deux fautes se découvrent des mois plus tard.

   LA GARANTIE DU RETOUR EST ÉPROUVÉE ICI AUSSI, et c'est elle qui rend le
   basculement automatique acceptable : une tête sortie n'est jamais enterrée. */
import {
  MOIS_AVANT_SORTIE, moisAvant, dortDepuisLongtemps, raisonDeLaSortie, estSortie,
  mouvementsSansLocks, sortiesDeLaMaison,
  type Client, type LectureDesLocks, type RituelPourSortie,
} from '../src/shared/clients';
import { CATEGORIE_GBATA, CATEGORIE_VEKPE, defaitLaCouronne, fondeLaCouronne } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-11';

const c = (o: Partial<Client>): Client => ({
  id: 't1', branchId: 'b1', name: 'Tête', phone: '97000000', city: 'Cotonou',
  persona: 'p1', since: '2024-01-01', segments: [], priceCoef: 1, loyaltyPoints: 0, ...o,
});

/* ── ① LE CATALOGUE RECONNAÎT PAR LA CATÉGORIE ──────────────────────
   Jamais par le nom : une règle qui lit « Le Défaisage » se tait le jour où
   quelqu'un le renomme, et personne ne voit qu'elle s'est tue. */
dit('le Gbàtà se reconnaît à sa catégorie', true, defaitLaCouronne({ categoryId: CATEGORIE_GBATA }));
dit('le Vèkpè se reconnaît à la sienne', true, fondeLaCouronne({ categoryId: CATEGORIE_VEKPE }));
dit('les deux ne se confondent pas', false, defaitLaCouronne({ categoryId: CATEGORIE_VEKPE }));
dit('un lavage n’est ni l’un ni l’autre', [false, false],
  [defaitLaCouronne({ categoryId: 'plt-05' }), fondeLaCouronne({ categoryId: 'plt-05' })]);

/* ── ② LES MOIS DE CALENDRIER, JAMAIS 150 JOURS ─────────────────────
   Le débordement de fin de mois est la faute classique : sans plafond, le
   31 mars moins un mois donne le 3 mars et la règle part trois jours trop
   tôt, une fois sur douze. */
dit('cinq mois avant le 11 septembre', '2026-04-11', moisAvant('2026-09-11', 5));
dit('un mois avant le 31 mars tombe au 28 février', '2026-02-28', moisAvant('2026-03-31', 1));
dit('un mois avant le 31 mai tombe au 30 avril', '2026-04-30', moisAvant('2026-05-31', 1));
dit('cinq mois avant janvier remonte l’année', '2025-08-15', moisAvant('2026-01-15', 5));
dit('zéro mois ne bouge pas', '2026-09-11', moisAvant('2026-09-11', 0));
dit('la Maison attend cinq mois', 5, MOIS_AVANT_SORTIE);

/* ── ③ ELLE DORT — le seuil, et ses deux exemptions ─────────────────
   STRICTEMENT PLUS de cinq mois : à cinq mois pile, la Maison attend encore.
   Une règle qui sortirait une tête le jour anniversaire de sa dernière venue
   surprendrait celle qui revient ce jour-là. */
dit('six mois sans venir, elle dort', true, dortDepuisLongtemps(c({}), '2026-03-11', AUJ));
dit('cinq mois pile, elle n’est pas sortie', false, dortDepuisLongtemps(c({}), '2026-04-11', AUJ));
dit('un jour de plus que cinq mois, elle sort', true, dortDepuisLongtemps(c({}), '2026-04-10', AUJ));
dit('venue hier, elle est bien là', false, dortDepuisLongtemps(c({}), '2026-09-10', AUJ));
dit('la diaspora par le champ est épargnée', false,
  dortDepuisLongtemps(c({ diaspora: true }), '2025-01-01', AUJ));
dit('la diaspora par le segment aussi', false,
  dortDepuisLongtemps(c({ segments: ['Diaspora'] }), '2025-01-01', AUJ));
dit('sans dernière venue, rien ne dort', false, dortDepuisLongtemps(c({}), undefined, AUJ));

/* ── ④ LE JUGE UNIQUE, ET L'ORDRE DE SES RAISONS ────────────────────
   Une tête peut porter les deux ; c'est « sans locks » qu'il faut montrer,
   parce que c'est la seule qui ouvre une porte, celle du Studio. */
dit('sans locks se dit en premier', 'sans-locks',
  raisonDeLaSortie(c({ locksDefaits: true }), { derniereVenue: '2025-01-01', aujourdhui: AUJ }));
dit('celle qui dort se dit « dort »', 'dort',
  raisonDeLaSortie(c({}), { derniereVenue: '2026-01-01', aujourdhui: AUJ }));
dit('la tête fidèle n’a pas de raison', null,
  raisonDeLaSortie(c({}), { derniereVenue: '2026-09-01', aujourdhui: AUJ }));

/* LE VERROU BAT LES FAITS — sans lui, « La ramener » se déferait à la passe
   suivante puisque le carnet dit toujours la même chose, et un bouton qui
   s'annule tout seul est pire que pas de bouton. */
dit('« La ramener » tient contre le carnet', null,
  raisonDeLaSortie(c({ locksDefaits: true, resteDeLaMaison: true }), { derniereVenue: '2025-01-01', aujourdhui: AUJ }));
dit('et tient aussi contre les cinq mois', null,
  raisonDeLaSortie(c({ resteDeLaMaison: true }), { derniereVenue: '2024-01-01', aujourdhui: AUJ }));

/* LA PASSANTE N'EST PAS UNE SORTIE : elle n'a jamais été une relation, et son
   registre la tient déjà. Deux registres pour une tête, c'est un nom affiché
   deux fois et un compteur faux une troisième. */
dit('la passante reste chez elle', null,
  raisonDeLaSortie(c({ dePassage: true }), { derniereVenue: '2024-01-01', aujourdhui: AUJ }));
dit('même sans locks', null,
  raisonDeLaSortie(c({ dePassage: true, locksDefaits: true }), { derniereVenue: '2024-01-01', aujourdhui: AUJ }));

/* UN RENDEZ-VOUS À VENIR RÉVEILLE : la dire sortie pendant qu'on la garde au
   carnet serait se contredire à une page d'intervalle. */
dit('un rendez-vous pris la réveille', null,
  raisonDeLaSortie(c({}), { derniereVenue: '2024-01-01', aujourdhui: AUJ, rdvAVenir: true }));
/* MAIS IL NE REND PAS LES LOCKS. Un rendez-vous de soin ne recrée pas une
   couronne : seul le carnet des Vèkpè le fait, et il le fait en amont. */
dit('un rendez-vous ne rend pas les locks', 'sans-locks',
  raisonDeLaSortie(c({ locksDefaits: true }), { derniereVenue: '2026-09-01', aujourdhui: AUJ, rdvAVenir: true }));
dit('estSortie dit la même chose que la raison', [true, false],
  [estSortie(c({ locksDefaits: true }), { aujourdhui: AUJ }), estSortie(c({}), { aujourdhui: AUJ })]);

/* ── ⑤ CE QUE LE CARNET DIT DES LOCKS ───────────────────────────────
   Trois conditions pour sortir, et il en manque une pour que la règle sorte
   une tête qui revient dans quinze jours. */
const lit = (m: Record<string, LectureDesLocks>) => (id: string) => m[id] ?? {};

dit('un défaisage sans création après, elle sort',
  { sorties: ['t1'], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1' })], lit({ t1: { gbata: '2026-08-02' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

dit('une création APRÈS le défaisage la garde',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1' })], lit({ t1: { gbata: '2026-08-02', vekpe: '2026-08-20' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

/* LE MÊME JOUR compte comme « après » : on défait et on refait dans la même
   séance, c'est le geste le plus courant de l'atelier. Sans cette égalité,
   toute journée défaisage + création sortait la tête le soir même. */
dit('défaire et refaire le même jour ne sort personne',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1' })], lit({ t1: { gbata: '2026-08-02', vekpe: '2026-08-02' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

/* UNE CRÉATION AU CARNET LA RETIENT AVANT MÊME QU'ELLE SORTE : celle qui
   défait mardi pour refaire le mois prochain ne bouge pas d'une heure. */
dit('un Vèkpè déjà pris retient la tête',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1' })], lit({ t1: { gbata: '2026-08-02', vekpeAVenir: true } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

dit('une création honorée rend les locks à qui était marquée',
  { sorties: [], rendues: ['t1'] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1', locksDefaits: true })], lit({ t1: { gbata: '2026-03-02', vekpe: '2026-08-20' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

dit('une création au carnet les rend aussi',
  { sorties: [], rendues: ['t1'] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1', locksDefaits: true })], lit({ t1: { vekpeAVenir: true } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

/* CE QUE LA MAIN A POSÉ, LA MACHINE N'Y TOUCHE PAS — dans les deux sens. */
dit('le verrou protège d’une sortie automatique',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1', resteDeLaMaison: true })], lit({ t1: { gbata: '2026-08-02' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

/* IDEMPOTENCE — une seconde passe n'écrit rien, sinon le store tournerait en
   boucle et l'écran clignoterait sans fin. */
dit('une tête déjà marquée n’est pas re-sortie',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1', locksDefaits: true })], lit({ t1: { gbata: '2026-08-02' } }));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());
dit('une tête sans carnet ne bouge pas',
  { sorties: [], rendues: [] },
  (() => {
    const r = mouvementsSansLocks([c({ id: 't1' })], lit({}));
    return { sorties: [...r.sorties], rendues: [...r.rendues] };
  })());

/* ── ⑥ LA CARTE, LUE PAR TROIS ÉCRANS ───────────────────────────────
   Le registre listait, le tableau de bord comptait, l'analytique divisait :
   trois calculs auraient donné trois chiffres pour une seule Maison. */
const r = (o: Partial<RituelPourSortie>): RituelPourSortie =>
  ({ clientId: 't1', date: '2026-09-01', status: 'honoré', ...o });

const carte = (clients: Client[], rituels: RituelPourSortie[]) =>
  [...sortiesDeLaMaison(clients, rituels, AUJ).entries()].sort();

dit('la tête partie depuis l’hiver est sur la carte',
  [['t1', 'dort']],
  carte([c({ id: 't1' })], [r({ date: '2026-02-01' })]));

dit('la tête venue la semaine passée n’y est pas',
  [],
  carte([c({ id: 't1' })], [r({ date: '2026-09-04' })]));

/* LA VISITEUSE N'EST PAS UNE SORTIE : sortir suppose d'être entrée, et elle
   ne s'est jamais assise. Lui appliquer les cinq mois la ferait sortir d'une
   maison où elle n'est jamais venue. */
dit('la visiteuse reste chez les visiteurs', [], carte([c({ id: 't1' })], []));
dit('la passante aussi', [],
  carte([c({ id: 't1', dePassage: true })], [r({ date: '2026-01-01' })]));

/* LE RENDEZ-VOUS À VENIR SE LIT SUR LE CARNET, pas sur une marque : un rituel
   confirmé demain suffit, un rituel annulé ne compte pas. */
dit('un rendez-vous confirmé demain la réveille', [],
  carte([c({ id: 't1' })], [r({ date: '2026-01-01' }), r({ date: '2026-09-20', status: 'confirmé' })]));
dit('un rendez-vous annulé ne réveille personne', [['t1', 'dort']],
  carte([c({ id: 't1' })], [r({ date: '2026-01-01' }), r({ date: '2026-09-20', status: 'annulé' })]));
/* UN RENDEZ-VOUS PASSÉ ET JAMAIS HONORÉ NE RÉVEILLE PAS : un rituel posé en
   mars et resté « confirmé » n'est pas une venue, c'est un oubli de clôture.
   Le compter réveillerait toutes les têtes dont le carnet traîne. */
dit('un rendez-vous passé jamais honoré ne réveille pas', [['t1', 'dort']],
  carte([c({ id: 't1' })], [r({ date: '2026-01-01' }), r({ date: '2026-03-05', status: 'confirmé' })]));

dit('la diaspora reste dans son registre', [],
  carte([c({ id: 't1', diaspora: true })], [r({ date: '2026-01-01' })]));
/* MAIS UN GBÀTÀ EST UN GBÀTÀ : sans locks, c'est sans locks, où qu'elle
   habite. C'est la seule règle dont la diaspora ne soit pas exemptée. */
dit('la diaspora sans locks sort quand même', [['t1', 'sans-locks']],
  carte([c({ id: 't1', diaspora: true, locksDefaits: true })], [r({ date: '2026-09-01' })]));

dit('deux têtes, deux raisons, une seule carte',
  [['t1', 'sans-locks'], ['t2', 'dort']],
  carte(
    [c({ id: 't1', locksDefaits: true }), c({ id: 't2' }), c({ id: 't3' })],
    [r({ clientId: 't1', date: '2026-09-01' }), r({ clientId: 't2', date: '2026-02-01' }), r({ clientId: 't3', date: '2026-09-05' })],
  ));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
