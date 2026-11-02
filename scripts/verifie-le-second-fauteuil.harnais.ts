/* LE SECOND FAUTEUIL EN LIGNE, ÉPROUVÉ — `node scripts/verifie-le-second-fauteuil.mjs [--prouve]`.

   2 novembre 2026, « Remplir les fauteuils » : du mardi au vendredi, les
   jours où le planning de l'équipe met DEUX personnes au fauteuil, une porte
   en ligne peut prendre le second fauteuil. Le samedi garde un fauteuil en
   ligne ; sans planning à deux, la règle du 24 octobre 2026 revient (une
   place). Jamais plus que les fauteuils. Les SÍNSIN restent chez Team.

   Ce banc fait tourner la règle pure (agenda-pur), les deux portes (le site
   `heuresLibres`, Ma Couronne `freeSlots`), et LIT la migration 0152 et la
   fonction `demande-submit`. `--prouve` y injecte des pannes en mémoire
   (verifie-le-second-fauteuil.mjs) : chacune doit le faire crier.
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  carteDesPlaces, joursDeLaFenetre, JOURS_DU_SECOND_FAUTEUIL, PLACES_EN_LIGNE, PLACES_EN_LIGNE_AU_PLUS,
  placesDuJour, placesEnLigneDuJour, type FicheDuFauteuil, type PlanningDesFauteuils,
} from '../src/shared/agenda-pur';
import { statutDuJour, type Planning, type Semaine } from '../src/shared/rh-pur';
import { heuresLibres, type AgendaDeLaMaison, type PrestationPublique } from '../src/apps/revelateur/agenda';
import { freeSlots, placesEnLigneDe, retiensLesPlaces } from '../src/apps/couronne/lib';
import { settingsStore } from '../src/shared/settings';
import { branchesStore, DEFAULT_BRANCHES } from '../src/shared/branches';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
/* Un fichier LU (pas importé) : la panne en mémoire arrive par une copie. */
const lis = (rel: string): string => {
  const f = process.env.SECOND_FAUTEUIL_PANNE_FICHIER === rel ? process.env.SECOND_FAUTEUIL_PANNE_COPIE! : rel;
  return readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
};
const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');
const sansCommentairesSql = (s: string) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

/* ── Les jours de l'essai ──────────────────────────────────────────────
   Le lundi 4 janvier 2027 ouvre la semaine ; mardi 5 … samedi 9. */
const LUNDI = '2027-01-04';
const MARDI = '2027-01-05', MERCREDI = '2027-01-06', JEUDI = '2027-01-07', VENDREDI = '2027-01-08', SAMEDI = '2027-01-09', DIMANCHE = '2027-01-10';
const B = 'br-essai';
const A = { id: 'st-a', branchId: B }, Bf = { id: 'st-b', branchId: B }, C = { id: 'st-c', branchId: B };
const EQUIPE: FicheDuFauteuil[] = [A, Bf, C];
const F = 'fauteuil';
/** Une semaine où A et B sont au fauteuil du mardi au samedi. */
const A_DEUX: PlanningDesFauteuils = { semaines: { [LUNDI]: {
  'st-a': ['', F, F, F, F, F, ''],
  'st-b': ['', F, F, F, F, F, ''],
  'st-c': ['', 'accueil', 'accueil', 'repos', 'repos', 'accueil', ''],
} } };
const p = (iso: string, plan: PlanningDesFauteuils | undefined = A_DEUX, sieges = 2, equipe = EQUIPE) =>
  placesEnLigneDuJour(iso, plan, sieges, equipe, B);

/* ══ 1. LA RÈGLE, PURE ══════════════════════════════════════════════ */
dit('du mardi au vendredi, deux au fauteuil : deux places', [2, 2, 2, 2], [MARDI, MERCREDI, JEUDI, VENDREDI].map((d) => p(d)));
dit('le samedi garde un fauteuil en ligne, meme a deux au planning', 1, p(SAMEDI));
dit('ni le lundi ni le dimanche (meme marques au fauteuil)', [1, 1],
  [LUNDI, DIMANCHE].map((d) => p(d, { modele: { 'st-a': [F, F, F, F, F, F, F], 'st-b': [F, F, F, F, F, F, F] } })));
dit('les jours du second fauteuil : mardi a vendredi (lundi = 0)', [1, 2, 3, 4], [...JOURS_DU_SECOND_FAUTEUIL]);
dit('un seul au fauteuil : une place', 1,
  p(MARDI, { semaines: { [LUNDI]: { 'st-a': ['', F, '', '', '', '', ''], 'st-b': ['', 'accueil', '', '', '', '', ''] } } }));
dit('... l accueil, le repos, le conge ne comptent pas', 1,
  p(MARDI, { semaines: { [LUNDI]: { 'st-a': ['', F], 'st-b': ['', 'accueil'], 'st-c': ['', 'travail'] } } }));
dit('sans planning, ou un planning vide : une place', [1, 1, 1],
  [placesEnLigneDuJour(MARDI, undefined, 2, EQUIPE, B), p(MARDI, {}), p(MARDI, { semaines: {} })]);
dit('une branche a un fauteuil : une place, meme a trois au fauteuil', 1,
  p(MARDI, { modele: { 'st-a': ['', F], 'st-b': ['', F], 'st-c': ['', F] } }, 1));
dit('... fauteuils inconnus (0) : une place', 1, p(MARDI, A_DEUX, 0));
dit('quatre au fauteuil et quatre fauteuils : deux, le second fauteuil et pas davantage', 2,
  p(MARDI, { modele: { 'st-a': ['', F], 'st-b': ['', F], 'st-c': ['', F], 'st-d': ['', F] } }, 4, [...EQUIPE, { id: 'st-d', branchId: B }]));
dit('le plafond de la regle : le second fauteuil', 2, PLACES_EN_LIGNE_AU_PLUS);
dit('une fiche d une autre branche ne compte pas', 1,
  p(MARDI, A_DEUX, 2, [A, { id: 'st-b', branchId: 'br-autre' }]));
dit('une fiche partie ce jour-la ne compte pas ; partie apres, si', [1, 2], [
  p(MARDI, A_DEUX, 2, [A, { ...Bf, archiveeLe: MARDI }]),
  p(MARDI, A_DEUX, 2, [A, { ...Bf, archiveeLe: MERCREDI }])]);
dit('une fiche absente de l equipe (effacee) ne compte pas', 1, p(MARDI, A_DEUX, 2, [A]));
dit('la semaine du modele suffit (sans semaine qui s en ecarte)', 2,
  p(MARDI, { modele: { 'st-a': ['', F, F, F, F, F, ''], 'st-b': ['', F, F, F, F, F, ''] } }));
dit('la semaine qui s ecarte l emporte : un repos ce mardi-la', 1,
  p(MARDI, { modele: { 'st-a': ['', F], 'st-b': ['', F] }, semaines: { [LUNDI]: { 'st-b': ['', 'repos'] } } }));
dit('... une case vide de la semaine passe au modele', 2,
  p(MARDI, { modele: { 'st-a': ['', F], 'st-b': ['', F] }, semaines: { [LUNDI]: { 'st-b': ['', ''] } } }));
dit('une case qui n est pas un texte, une semaine qui n est pas une liste : rien ne se lit', 1,
  p(MARDI, { semaines: { [LUNDI]: { 'st-a': ['', F], 'st-b': 'fauteuil' as unknown as string[] } } }));
dit('une date mal ecrite, ou qui n existe pas : une place', [1, 1],
  [p('2027-1-5'), p('2027-02-30', { modele: { 'st-a': [F, F, F, F, F, F, F], 'st-b': [F, F, F, F, F, F, F] } })]);

/* LE MIROIR LIT LE PLANNING COMME L'ÉCRAN DES RH (`statutDuJour`) : sur des
   plannings variés, le compte au fauteuil des deux est le même. */
{
  const STATUTS = ['', F, 'accueil', 'repos', 'conge', 'travail', 'academie'];
  let graine = 7;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine; };
  let ecarts = 0;
  for (let k = 0; k < 400; k++) {
    const sem = (): Semaine => Array.from({ length: 7 }, () => STATUTS[hasard() % STATUTS.length]) as Semaine;
    const plan: Planning = { modele: { 'st-a': sem(), 'st-b': sem() }, semaines: { [LUNDI]: { 'st-a': sem(), 'st-c': sem() } } };
    for (const iso of joursDeLaFenetre(LUNDI, DIMANCHE)) {
      const rang = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
      const compte = EQUIPE.filter((f) => statutDuJour(plan, f.id, iso) === F).length;
      const attendu = rang >= 1 && rang <= 4 && compte >= 2 ? 2 : 1;
      if (p(iso, plan as PlanningDesFauteuils) !== attendu) ecarts++;
    }
  }
  dit('le miroir et statutDuJour (rh-pur) : 400 plannings, aucun ecart', 0, ecarts);
}

/* ══ 2. CE QUE LES PORTES RECOIVENT DE LA BASE ══════════════════════ */
dit('les lignes de places_en_ligne_du se lisent ; le reste s ecarte', { [MARDI]: 2, [SAMEDI]: 1, [JEUDI]: 2 }, carteDesPlaces([
  { jour: MARDI, places: 2 }, { jour: SAMEDI, places: 1 }, { jour: JEUDI, places: '2' },
  { jour: 'demain', places: 2 }, { jour: MERCREDI, places: 0 }, { jour: VENDREDI, places: 1.5 }, null, 'x', { jour: DIMANCHE }]));
dit('une reponse qui n est pas une liste (une panne) : une carte vide', [{}, {}, {}],
  [carteDesPlaces(null), carteDesPlaces({ message: 'function places_en_ligne_du does not exist' }), carteDesPlaces('erreur')]);
dit('un jour que la base n a pas dit garde une place', [2, 1, 1, 1], [
  placesDuJour({ [MARDI]: 2 }, MARDI), placesDuJour({ [MARDI]: 2 }, MERCREDI), placesDuJour({}, MARDI), placesDuJour(null, MARDI)]);
dit('jamais plus que les fauteuils de la branche, ni que le second fauteuil', [1, 1, 2, 2, 2, 1], [
  placesDuJour({ [MARDI]: 2 }, MARDI, 1), placesDuJour({ [MARDI]: 2 }, MARDI, 0),
  placesDuJour({ [MARDI]: 2 }, MARDI, 2), placesDuJour({ [MARDI]: 5 }, MARDI, 6), placesDuJour({ [MARDI]: 2 }, MARDI, '2' as unknown as number),
  placesDuJour({ [MARDI]: 2 }, MARDI, null)]);
dit('la regle du 24 octobre reste le repli', 1, PLACES_EN_LIGNE);
dit('la fenetre : bornes comprises, a rebours vide, au plus 400 jours', [7, 0, 400],
  [joursDeLaFenetre(LUNDI, DIMANCHE).length, joursDeLaFenetre(DIMANCHE, LUNDI).length, joursDeLaFenetre('2027-01-01', '2029-01-01').length]);

/* ══ 3. LE SITE : `heuresLibres` ════════════════════════════════════ */
const OUVERT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: false }));
const LAVAGE: PrestationPublique = { id: 'sv-lavage', name: 'KLƆKLƆ™ Essentiel', categoryId: 'cat-lavage', durationMin: 60 };
const SINSIN: PrestationPublique = { id: 'sv-sinsin', name: 'SÍNSIN™ Essentiel · La Reprise', categoryId: 'cat-reprise', durationMin: 60 };
const agenda = (sieges = 2): AgendaDeLaMaison => ({
  branchId: B, maitres: ['Team', 'Expert'], services: [LAVAGE, SINSIN], categories: [],
  semaine: OUVERT, exceptions: [], murs: [], capMaison: 0, capMaitre: 0, sieges,
  masques: {}, bandes: [], bandSets: {}, baremeSuspendu: false, formules: [],
});
const pris = (jour: string, maitre: string, debut = '14:00', duree = 60) => ({ jour, maitre, debut, duree });
const LOIN = new Date('2026-11-02T08:00:00');
const site = (o: { jour: string; ids: string[]; occupes: ReturnType<typeof pris>[]; places?: Record<string, number>; sieges?: number }) =>
  heuresLibres({ agenda: agenda(o.sieges), dateIso: o.jour, serviceIds: o.ids, occupes: o.occupes, places: o.places, maintenant: LOIN });
const a14 = (l: { heure: string; maitre: string }[]) => l.find((h) => h.heure === '14:00') ?? null;
const DEUX = { [MARDI]: 2 };

dit('AUJOURD HUI (une place) : Team a 14 h ferme 14 h en ligne', null, a14(site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team')] })));
dit('le second fauteuil : un lavage a 14 h, cote Expert', { heure: '14:00', maitre: 'Expert' },
  a14(site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team')], places: DEUX })));
dit('un SINSIN ne parait pas libre quand Team est deja au fauteuil', null,
  a14(site({ jour: MARDI, ids: [SINSIN.id], occupes: [pris(MARDI, 'Team')], places: DEUX })));
dit('... ni un SINSIN avec un autre geste', null,
  a14(site({ jour: MARDI, ids: [SINSIN.id, LAVAGE.id], occupes: [pris(MARDI, 'Team', '13:00', 120)], places: DEUX })));
dit('Expert au fauteuil : le SINSIN prend le second, chez Team', { heure: '14:00', maitre: 'Team' },
  a14(site({ jour: MARDI, ids: [SINSIN.id], occupes: [pris(MARDI, 'Expert')], places: DEUX })));
dit('deux rituels deja a 14 h : plus rien, meme a deux places', null,
  a14(site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team'), pris(MARDI, 'Expert')], places: DEUX })));
{
  /* Team de 13 h à 15 h, Expert de 14 h à 15 h : à 14 h les deux fauteuils
     sont pris ; à 13 h, Expert est encore libre une heure. */
  const l = site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team', '13:00', 120), pris(MARDI, 'Expert', '14:00')], places: DEUX });
  dit('jamais deux rituels sur un fauteuil : 14 h fermee (les deux pris), 13 h chez Expert', [null, 'Expert'],
    [a14(l), l.find((h) => h.heure === '13:00')?.maitre ?? null]);
}
dit('la base dit une place (le samedi) : 14 h reste fermee', null,
  a14(site({ jour: SAMEDI, ids: [LAVAGE.id], occupes: [pris(SAMEDI, 'Team')], places: { [SAMEDI]: 1 } })));
dit('l appel a echoue (aucune carte) : une place, le repli', null,
  a14(site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team')], places: {} })));
dit('une Maison a un fauteuil : 14 h fermee meme si la carte dit deux', null,
  a14(site({ jour: MARDI, ids: [LAVAGE.id], occupes: [pris(MARDI, 'Team')], places: DEUX, sieges: 1 })));

/* ══ 4. MA COURONNE : `freeSlots`, les places retenues avec les murs ══ */
settingsStore.set((prev) => ({ ...prev, hours: OUVERT, maxRdvParJourMaison: 0, maxRdvParJourMaitre: 0 }));
branchesStore.set([{ ...DEFAULT_BRANCHES[0], id: B, seats: 2, masters: ['Team', 'Expert'] }]);
const couronne = (master: string, jour = MARDI, occupes = [pris(MARDI, 'Team')]) =>
  freeSlots(jour, master, 60, [], [], B, occupes).includes('14:00');
retiensLesPlaces(B, LUNDI, DIMANCHE, [{ jour: MARDI, places: 2 }, { jour: SAMEDI, places: 1 }]);
dit('Ma Couronne, deux places : 14 h libre pour un geste sans maitre, fermee pour Team (deja au fauteuil)', [true, false],
  [couronne(''), couronne('Team')]);
dit('... un SINSIN (Team) ne parait pas libre ; Expert au fauteuil, il l est', [false, true],
  [couronne('Team'), couronne('Team', MARDI, [pris(MARDI, 'Expert')])]);
dit('... le samedi, une place', false, couronne('', SAMEDI, [pris(SAMEDI, 'Team')]));
dit('... les places se lisent par jour : deux le mardi, une le samedi et le mercredi', [2, 1, 1],
  [placesEnLigneDe(B, MARDI), placesEnLigneDe(B, SAMEDI), placesEnLigneDe(B, MERCREDI)]);
retiensLesPlaces(B, LUNDI, DIMANCHE, null);
dit('l appel suivant echoue : la seconde place s oublie, une place', [false, 1], [couronne(''), placesEnLigneDe(B, MARDI)]);
retiensLesPlaces(B, LUNDI, DIMANCHE, [{ jour: MARDI, places: 2 }]);
retiensLesPlaces(B, MARDI, MARDI, []);
dit('un jour que la nouvelle reponse ne porte plus : une place', 1, placesEnLigneDe(B, MARDI));
retiensLesPlaces(B, LUNDI, DIMANCHE, [{ jour: MARDI, places: 2 }]);
branchesStore.set([{ ...DEFAULT_BRANCHES[0], id: B, seats: 1, masters: ['Team', 'Expert'] }]);
dit('une branche a un fauteuil : une place, quoi que la carte dise', [1, false], [placesEnLigneDe(B, MARDI), couronne('')]);

const lib = sansCommentairesTs(lis('src/apps/couronne/lib.ts'));
dit('Ma Couronne : les places partent avec les murs, la meme fenetre', true,
  lib.includes("sb.rpc('places_en_ligne_du', { p_branch: branchId, p_debut: du, p_fin: au })"));
dit('... une panne des places ne retient rien (null), et rien ne s ecrit avant elles', [true, true], [
  lib.includes('.then(({ data, error }) => (error ? null : data as unknown), () => null)'),
  /retiensLesPlaces\(branchId, du, au, lues\);\s*if \(error\) \{ setEtat/.test(lib)]);
dit('... freeSlots compte contre les places du jour', true, lib.includes('capSimultane: placesEnLigneDe(branchId, dateIso),'));

/* ══ 5. LA PAGE DU SITE ═════════════════════════════════════════════ */
const agendaTs = sansCommentairesTs(lis('src/apps/revelateur/agenda.ts'));
const reserver = sansCommentairesTs(lis('src/apps/revelateur/ilots/Reserver.tsx'));
dit('le site lit places_en_ligne_du avec les murs, et ne rejette jamais (carte vide)', [true, true, true], [
  agendaTs.includes('/rest/v1/rpc/places_en_ligne_du'),
  agendaTs.includes("return r.ok ? carteDesPlaces(await r.json()) : {};") && agendaTs.includes('} catch { return {}; }'),
  agendaTs.includes('lesPlaces && devine === agenda.branchId ? lesPlaces : placesEnLigne(agenda.branchId, du, au),')]);
dit('... une heure refusee relit les places avec les murs', true,
  reserver.includes('placesEnLigne(agenda.branchId, suite[0], suite[suite.length - 1]),'));
dit('... la page passe les places a chaque jour, et se recalcule quand elles arrivent', [true, true, true], [
  reserver.includes('setPlacesParJour(lues);'),
  reserver.includes('heuresLibres({ agenda, dateIso: iso, serviceIds, occupes, places: placesParJour })'),
  reserver.includes('}, [agenda, serviceIds, occupes, placesParJour, occupesEtat]);')]);

/* ══ 6. LE SERVEUR DU SITE : `demande-submit` ═══════════════════════ */
const ds = lis('supabase/functions/demande-submit/index.ts');
const dsNu = sansCommentairesTs(ds);
dit('demande-submit : les places du jour, lues de la base pour le jour demande', true,
  dsNu.includes("admin.rpc('places_en_ligne', { p_branch: o.branche.id, p_date: o.date }),"));
dit('... une panne ou une valeur folle : une place ; jamais plus que le second fauteuil', [true, true], [
  dsNu.includes('const places = !placesDuJour.error && Number.isInteger(lues) && lues >= PLACES_EN_LIGNE ? Math.min(lues, PLACES_EN_LIGNE_AU_PLUS) : PLACES_EN_LIGNE;'),
  ds.includes('const PLACES_EN_LIGNE_AU_PLUS = 2;')]);
dit('... le juge du serveur les recoit (le site propose ce que le serveur accepte)', true,
  dsNu.includes('laPlaceTient({ ...agenda, sieges: places }, { date: o.date, time: o.time, serviceIds: o.serviceIds }, maintenant)'));
const version = /const VERSION = '(\d{4}-\d{2}-\d{2})-/.exec(ds)?.[1] ?? '';
dit('... sa version dit le second fauteuil (2 novembre 2026 ou plus recente)', true, version >= '2026-11-02');
const wa = lis('supabase/functions/whatsapp-automate/index.ts');
dit('WhatsApp garde ses propositions a une place (aucune lecture des places)', [true, false],
  [wa.includes('sieges: PLACES_EN_LIGNE,'), wa.includes('places_en_ligne')]);

/* ══ 7. LA BASE : migration 0152 ════════════════════════════════════ */
const m = lis('supabase/migrations/0152_le_second_fauteuil_en_ligne.sql');
const fonction = (nom: string): string => {
  const i = m.indexOf(`create or replace function public.${nom}(`);
  if (i < 0) return '';
  const a = m.indexOf('$$', i);
  const b = m.indexOf('$$;', a + 2);
  return m.slice(i, b + 3);
};
const jourSql = sansCommentairesSql(fonction('places_en_ligne'));
const duSql = sansCommentairesSql(fonction('places_en_ligne_du'));
const poseSql = fonction('pose_si_libre');
const gardeSql = sansCommentairesSql(fonction('une_place_en_ligne'));
const toute = sansCommentairesSql(m);

dit('places_en_ligne : security definer, search_path public, rend un entier', true,
  /returns int language sql stable security definer set search_path = public as \$\$/.test(jourSql));
dit('... lit le planning, l equipe de la branche, ses fauteuils', [true, true, true, true], [
  jourSql.includes("where d.key = 'mnd_planning'"),
  jourSql.includes("from public.team t") && jourSql.includes("coalesce(nullif(t.data ->> 'branchId', ''), t.branch_id, '') = p_branch"),
  jourSql.includes("(t.data ->> 'archiveeLe') collate \"C\" > j.iso collate \"C\""),
  jourSql.includes("b.data ->> 'seats'")]);
dit('... la case de la semaine, sinon celle du modele (statutDuJour)', true,
  /coalesce\( nullif\(case when jsonb_typeof\(c\.semaine\) = 'array' and jsonb_typeof\(c\.semaine -> j\.i\) = 'string' then c\.semaine ->> j\.i end, ''\), nullif\(case when jsonb_typeof\(c\.modele\) = 'array' and jsonb_typeof\(c\.modele -> j\.i\) = 'string' then c\.modele ->> j\.i end, ''\) \) = 'fauteuil'/.test(jourSql));
/* LE MIROIR ET LA BASE DISENT LES MÊMES CHIFFRES : les jours, le seuil, le
   plafond se lisent dans le texte et se confrontent aux constantes. */
const jours = /when \(select i from le_jour\) between (\d) and (\d)/.exec(jourSql);
const seuil = /and \(select n from au_fauteuil\) >= (\d+)/.exec(jourSql);
const sieges = /and \(select n from les_fauteuils\) >= (\d+) then (\d+) else 1 end/.exec(jourSql);
dit('... les jours de la base sont ceux du miroir (mardi a vendredi)', [...JOURS_DU_SECOND_FAUTEUIL],
  jours ? Array.from({ length: Number(jours[2]) - Number(jours[1]) + 1 }, (_, k) => Number(jours[1]) + k) : null);
dit('... deux au fauteuil, deux fauteuils au moins, deux places au plus', [2, PLACES_EN_LIGNE_AU_PLUS, PLACES_EN_LIGNE_AU_PLUS],
  [seuil ? Number(seuil[1]) : null, sieges ? Number(sieges[1]) : null, sieges ? Number(sieges[2]) : null]);
dit('... une place sinon, et sans branche ni date', true, jourSql.includes('when p_branch is null or p_date is null then 1'));
dit('... gardee au serveur : ni anon, ni authenticated', [true, true], [
  toute.includes('revoke all on function public.places_en_ligne(text, date) from public, anon, authenticated;'),
  toute.includes('grant execute on function public.places_en_ligne(text, date) to service_role;')]);

dit('places_en_ligne_du : (jour, places) et RIEN d autre', true,
  /create or replace function public\.places_en_ligne_du\(p_branch text, p_debut date, p_fin date\) returns table \(jour text, places int\) language sql stable security definer set search_path = public as \$\$/.test(duSql));
dit('... aucun nom, aucune fiche, aucun statut : le jour et le nombre', [true, false], [
  /as \$\$ select to_char\(d::date, 'YYYY-MM-DD'\), public\.places_en_ligne\(p_branch, d::date\) from generate_series\(/.test(duSql),
  /team|name|nom|staff|data|semaines|modele/i.test(duSql.slice(duSql.indexOf('as $$')))]);
dit('... quatre cents jours au plus, ouverte aux portes clientes', [true, true], [
  duSql.includes('least(p_fin, p_debut + 399)'),
  toute.includes('grant execute on function public.places_en_ligne_du(text, date, date) to anon, authenticated, service_role;')]);

/* Le contrôle de la migration cherche « sieges := 1; » dans la définition en
   ligne : il ne doit plus y paraître nulle part, repli compris. */
dit('pose_si_libre : plus de sieges := 1, les places du jour du rendez-vous', [false, true], [
  poseSql.includes('sieges := 1;'),
  /begin\s+sieges := public\.places_en_ligne\(branche, jour::date\);\s+exception when others then\s+sieges := null;\s+end;\s+sieges := greatest\(1, coalesce\(sieges, 1\)\);/.test(poseSql)]);
{
  /* LE RESTE DU VERROU EST CELUI DE 0140, MOT POUR MOT (la définition en
     ligne relue le 2 novembre 2026 lui est identique). */
  const m140 = lis('supabase/migrations/0140_une_place_en_ligne_a_la_fois.sql');
  const i = m140.indexOf('create or replace function public.pose_si_libre(');
  const pose140 = m140.slice(i, m140.indexOf('end $$;', i) + 7);
  const sans140 = pose140.replace(/ {2}-- UNE SEULE RÉSERVATION EN LIGNE[\s\S]*? {2}sieges := 1;\n/, '');
  const sans152 = poseSql.replace(/ {2}-- LE SECOND FAUTEUIL EN LIGNE[\s\S]*? {2}sieges := greatest\(1, coalesce\(sieges, 1\)\);\n/, '');
  dit('... le reste du verrou est celui de 0140, mot pour mot', true, sans140.length > 1000 && sans140 === sans152);
}
dit('le garde : les places du jour, une si la date ne se lit pas', true,
  gardeSql.includes('begin places := public.places_en_ligne(branche, jour::date); exception when others then places := null; end; places := greatest(1, coalesce(places, 1));'));
dit('... il compte tout rituel non annule qui chevauche, sauf lui-meme, sous le verrou', [true, true, true], [
  gardeSql.includes("perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));"),
  gardeSql.includes('where a.id <> new.id'),
  gardeSql.includes('if dessous >= places then raise exception \'creneau_pris\'')]);
dit('... le second fauteuil ne se double pas : jamais le maitre deja au fauteuil', true,
  gardeSql.includes("coalesce(bool_or(coalesce(a.data->>'master', '') = maitre), false) into dessous, meme_maitre")
  && gardeSql.includes("if dessous > 0 and meme_maitre then raise exception 'creneau_pris'"));
dit('... un SINSIN ne prend la seconde place qu avec Team', true,
  gardeSql.includes("if dessous > 0 and maitre <> 'Team' and exists ( select 1 from public.catalog_services s")
  && gardeSql.includes("lower(translate(coalesce(s.data->>'name', ''), 'ÍÌÎÏíìîïÑñ', 'IIIIiiiiNn')) like '%sinsin%'")
  && gardeSql.includes("b.data->'masters' ? 'Team') then raise exception 'creneau_pris'"));
dit('... le personnel et le serveur gardent la main ; annule et note ne se rejugent pas', [true, true, true], [
  gardeSql.includes('if auth.uid() is null or public.is_staff() then return new; end if;'),
  gardeSql.includes("if coalesce(new.data->>'status', '') = 'annulé' or debut is null or branche = '' or jour = '' then return new; end if;"),
  gardeSql.includes("and coalesce(old.data->>'status', '') <> 'annulé' then return new; end if;")]);
dit('la migration se termine par son controle (huit oui)', [true, true, true], [
  toute.trimEnd().endsWith('as samedi_a_un;'),
  toute.includes("position('sieges := 1;' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) = 0"),
  toute.includes("pg_get_function_result('public.places_en_ligne_du(text, date, date)'::regprocedure) = 'TABLE(jour text, places integer)'")]);

console.log(`\n${n - ko}/${n} epreuves : le second fauteuil en ligne, du mardi au vendredi.`);
if (ko) console.log(`${ko} ECHEC(S).`);
