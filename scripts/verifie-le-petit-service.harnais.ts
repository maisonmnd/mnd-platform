/* LE PETIT SERVICE PARTAGE L'HEURE, EPROUVE — 20 novembre 2026.
   `node scripts/verifie-le-petit-service.mjs` ; `--prouve` remet chaque
   panne et chacune doit faire crier une epreuve.

   « Si valider deux rendez-vous a la meme heure est possible il faut le
   faire, tant que c'est un petit service » (Yeman). La scene : une cliente
   attendue a 15 h (un lavage et une reprise, 2 h 30, 358 locks) annonce une
   heure de retard ; a 17 h, un lavage et une coiffure d'une heure (505
   locks) ; une seule place en ligne ce jour-la. Opale refusait 16 h.

     A. LA REGLE PURE (agenda-pur) : `petitService`, `partagentLaPlace`,
        `bloqueLaVenue`, `creneauxLibres` (Team partage avec un petit
        service, une seule place en ligne pour les deux, deux au plus chez
        Team, Expert jamais) ;
     B. LE JUGE DU SERVEUR (place-du-serveur) : `laPlaceTient` et
        `placesLibres` disent la meme chose ;
     C. LE RETARD D'OPALE (opale-pur) : `suiteDuRetard`, `parleDUnRetard` ;
     D. LA LETTRE : les fonctions (au-dela des fauteuils, la place de sa
        personne, les versions) et la base (0240).

   Sortie en ASCII (la console Windows est en cp1252). */
import { readFileSync } from 'node:fs';
import {
  bloqueLaVenue, creneauxLibres, partagentLaPlace, PETIT_SERVICE_MIN, petitService, placesPrises,
} from '../src/shared/agenda-pur';
import { agendaDepuisLesLignes, laPlaceTient, placesLibres } from '../src/shared/place-du-serveur';
import { parleDUnRetard, RETARD_AU_PLUS_TOT_MIN, RETARD_SANS_DECALER_MIN, suiteDuRetard } from '../src/shared/opale-pur';

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let vus = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  vus += 1;
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(JSON.stringify(obtenu))}`}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
/* Le fichier LU (et non importe) : sa copie en panne quand le lanceur la donne. */
const lis = (rel: string): string => {
  const copie = process.env.PETIT_SERVICE_PANNE_FICHIER === rel ? process.env.PETIT_SERVICE_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/* ══ A. LA REGLE PURE ════════════════════════════════════════════════ */
dit('un petit service : une heure ou moins, ecrite en nombre', [60, true, true, false, false, false, false, false],
  [PETIT_SERVICE_MIN, petitService(60), petitService(45), petitService(61), petitService(150), petitService('60'), petitService(undefined), petitService(0)]);
dit('deux rendez-vous partagent la place quand l un des deux est petit', [true, true, false, false],
  [partagentLaPlace(150, 60), partagentLaPlace(60, 150), partagentLaPlace(90, 150), partagentLaPlace(undefined, 150)]);
dit('Team : deux lourdes partagent si l une est un petit service, d un cote ou de l autre ; une venue sans duree n en est pas un', [false, false, true, true], [
  bloqueLaVenue('Team', true, { lourde: true, dureeMin: 60 }, 150), bloqueLaVenue('Team', true, { lourde: true, dureeMin: 150 }, 60),
  bloqueLaVenue('Team', true, { lourde: true, dureeMin: 90 }, 150), bloqueLaVenue('Team', true, { lourde: true, dureeMin: 90 })]);
dit('Expert : un petit service ne partage jamais chez une personne', [true, true],
  [bloqueLaVenue('Expert', false, { dureeMin: 60 }, 60), bloqueLaVenue('Expert', true, { lourde: true, dureeMin: 60 }, 60)]);

const JOUR = { closed: false, openMin: 8 * 60, closeMin: 20 * 60 + 30 };
const o = (maitre: string, debut: number, duree: number, lourde = true) => ({ maitre, debutMin: debut * 60, dureeMin: duree, ...(lourde ? { lourde: true } : {}) });
const libre = (master: string, occupes: ReturnType<typeof o>[], h: string, duree: number, x: { lourde?: boolean; places?: number } = {}): boolean =>
  creneauxLibres({ opening: JOUR, durationMin: duree, occupes, master, capSimultane: x.places ?? 1, maintenantMin: null, ...(x.lourde !== false ? { lourde: true } : {}) }).includes(h);
dit('LA SCENE : 2 h 30 a 16 h, le lavage-coiffure d une heure a 17 h, une seule place : 16 h est libre', true,
  libre('Team', [o('Team', 17, 60)], '16:00', 150));
dit('... un petit service a cote d une grosse tete deja la : libre aussi', true,
  libre('Team', [o('Team', 15, 150)], '16:00', 60));
dit('... deux grosses tetes, aucun petit service : jamais ensemble', false,
  libre('Team', [o('Team', 17, 90)], '16:00', 150));
dit('... deux au plus chez Team, meme petits', false,
  libre('Team', [o('Team', 16, 150), o('Team', 16, 60)], '16:00', 60, { places: 2 }));
dit('... Expert ne partage jamais', false, libre('Expert', [o('Expert', 16, 60)], '16:00', 60));
dit('... un petit service ne prend pas la place en ligne d un autre maitre ; un soin d une heure et demie la prend', [true, false],
  [libre('Expert', [o('Team', 16, 150)], '16:00', 60), libre('Expert', [o('Team', 16, 150)], '16:00', 90)]);
/* UNE PLACE PAR PAIRE (0242, le second passage) : un petit service partage UNE place avec un seul voisin. */
dit('les places prises : chacun la sienne, une paire par petit service, chacun dans une paire au plus', [1, 1, 2, 2, 2, 3, 2], [
  placesPrises(60, []), placesPrises(150, [{ dureeMin: 60 }]), placesPrises(60, [{ dureeMin: 90 }, { dureeMin: 90 }]),
  placesPrises(60, [{ dureeMin: 60 }, { dureeMin: 60 }]), placesPrises(90, [{ dureeMin: 90 }]),
  placesPrises(60, [{ dureeMin: 90 }, { dureeMin: 90 }, { dureeMin: 90 }]), placesPrises(undefined, [{ dureeMin: 90 }])]);
const personne = (occupes: ReturnType<typeof o>[], duree: number) =>
  creneauxLibres({ opening: JOUR, durationMin: duree, occupes, master: 'Personne', capSimultane: 2, maintenantMin: null }).includes('13:00');
dit('deux fauteuils : un lavage de 30 min a cote de deux soins (la paire et le second), jamais a cote de trois', [true, false],
  [personne([o('Team', 12.5, 90), o('Expert', 12.5, 90)], 30), personne([o('Team', 12.5, 90), o('Team', 12.5, 90), o('Expert', 12.5, 90)], 30)]);

/* ══ B. LE JUGE DU SERVEUR ═══════════════════════════════════════════ */
/* Mercredi 18 novembre 2026, 11 h a Cotonou ; le juge regarde vendredi 20. */
const MS = Date.parse('2026-11-18T10:00:00.000Z');
const VEN = '2026-11-20';
const SEMAINE = [
  { key: 'dim', open: '08h00', close: '20h30', closed: true },
  ...['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '08h00', close: '20h30', closed: false })),
];
const CATEGORIES = [
  { id: 'atl-ii-gbeji', data: { label: 'GBEJI' } },
  { id: 'c-lav', data: { label: 'Les lavages', parentId: 'atl-ii-gbeji' } },
];
const SERVICES = [
  { id: 'lav', data: { name: 'Lavage', categoryId: 'c-lav', durationMin: 30 } },
  { id: 'sin', data: { name: 'SÍNSIN™ Essentiel · La Reprise', categoryId: 'atl-ii-gbeji', durationMin: 120 } },
  { id: 'soin', data: { name: 'Soin profond', categoryId: 'c-lav', durationMin: 90 } },
];
const occ = (debut: string, duree: number, maitre = 'Team'): Record<string, unknown> => ({ jour: VEN, maitre, debut, duree, lourde: true });
const agenda = (occupes: Record<string, unknown>[]) => agendaDepuisLesLignes({
  branche: { id: 'br', data: { masters: ['Team'], seats: 2 } },
  reglages: { hours: SEMAINE, maxRdvParJourMaison: 0, maxRdvParJourMaitre: 0 },
  exceptions: [], vitrine: {}, services: SERVICES, categories: CATEGORIES, blocages: [], occupes,
})!;
const juge = (a: ReturnType<typeof agenda>, ids: string[], time: string) => {
  const v = laPlaceTient(a, { date: VEN, time, serviceIds: ids, lourde: true }, MS);
  return v.ok ? v.maitres : v.erreur;
};
const SCENE = agenda([occ('17:00', 60)]);
dit('LA SCENE au juge : un lavage et une reprise a 16 h, a cote du petit service de 17 h : Team', ['Team'], juge(SCENE, ['lav', 'sin'], '16:00'));
dit('... et un lavage seul (un petit service) a 17 h, a cote d une reprise de 16 h : Team', ['Team'], juge(agenda([occ('16:00', 150)]), ['lav'], '17:00'));
dit('... deux soins de plus d une heure : creneau_pris', 'creneau_pris', juge(agenda([occ('17:00', 90)]), ['lav', 'sin'], '16:00'));
dit('... trois a la fois chez Team : jamais', 'creneau_pris', juge(agenda([occ('16:00', 150), occ('16:00', 60)]), ['lav'], '16:00'));
dit('placesLibres montre 16 h dans la scene, et le juge la tient', [true, true],
  [placesLibres(SCENE, ['lav', 'sin'], MS, 3, undefined, true).some((p) => p.iso === VEN && p.heure === '16:00'), Array.isArray(juge(SCENE, ['lav', 'sin'], '16:00'))]);

/* ══ C. LE RETARD D'OPALE ════════════════════════════════════════════ */
const m = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
dit('une demi-heure de retard au plus : elle est attendue, rien ne bouge', [30, 25, 'attendue', 'attendue'],
  [RETARD_SANS_DECALER_MIN, RETARD_AU_PLUS_TOT_MIN, suiteDuRetard({ rdvMin: m('15:00'), arriveeMin: m('15:30'), maintenantMin: m('14:47') }),
    suiteDuRetard({ rdvMin: m('15:00'), arriveeMin: m('15:10'), maintenantMin: m('14:47') })]);
dit('LA SCENE : 15 h, une heure de retard, ecrite a 14 h 47 : sa place se decale a 16 h', 'decaler',
  suiteDuRetard({ rdvMin: m('15:00'), arriveeMin: m('16:00'), maintenantMin: m('14:47') }));
dit('... une arrivee dans moins de vingt-cinq minutes : attendue (le verrou de la reprise)', 'attendue',
  suiteDuRetard({ rdvMin: m('15:00'), arriveeMin: m('16:00'), maintenantMin: m('15:40') }));
dit('... des minutes illisibles : attendue, rien ne bouge', 'attendue', suiteDuRetard({ rdvMin: Number.NaN, arriveeMin: m('16:00'), maintenantMin: m('14:00') }));
dit('ses mots parlent d un retard ; une contrainte d un autre jour, non', [true, true, true, true, false, false], [
  parleDUnRetard(['J’ai un empêchement, j’aurai une heure de retard']), parleDUnRetard(['Je serai là vers 16 h']),
  parleDUnRetard(['J’arrive dans une heure']), parleDUnRetard(['Désolée, je suis en retard']),
  parleDUnRetard(['J’ai une contrainte et je ne pourrai plus être là demain']), parleDUnRetard([])]);

/* ══ D. LA LETTRE ════════════════════════════════════════════════════ */
const WA = lis('supabase/functions/whatsapp-automate/index.ts');
const DS = lis('supabase/functions/demande-submit/index.ts');
dit('au-dela des fauteuils : jamais deux lourdes chez Team, sauf un petit service', true,
  WA.includes('if (m === MAITRE_QUI_PARTAGE && siens.some((a) => bloqueLaVenue(m, p.lourde, a, fin - debut))) continue;'));
dit('la place de SA personne (deplacement, retard) : le petit service partage la place et Team', [true, true], [
  WA.includes("if (sieges > 0 && placesPrises(duree, duJour.filter((a) => chevauche(a.debutMin, a.debutMin + a.dureeMin))) > sieges) return { ok: false, erreur: 'creneau_pris' };"),
  WA.includes('const occupe = chevauchent.some((a) => bloqueLaVenue(maitre, lourde, a, duree))')]);
dit('le retard se juge AVANT de liberer sa place, chez sa personne, le jour meme', true,
  /const tient = laPlaceTientPourLeMaitreWa\(agenda\.agenda, maitre, \{ date, time: heure, dureeMin \}, \{ date, time: avant \}, ms, true\);[\s\S]{0,900}if \(!tient\.ok && auDela === null\) \{[\s\S]{0,400}const fait = await metsAReprogrammerWa\(sb, r, 'opale', aujourdhui\);/.test(WA));
dit('les versions disent le petit service', [true, true],
  [/^const VERSION = '2026-11-20-c · un petit service partage UNE place/m.test(WA), /^const VERSION = '2026-11-20-b · un petit service partage UNE place/m.test(DS)]);

const SQL = lis('supabase/migrations/0240_le_petit_service_partage_l_heure.sql');
const corps = (debut: string): string => {
  const i = SQL.indexOf(debut);
  if (i < 0) return '';
  const k = SQL.indexOf('$function$;', i);
  return k < 0 ? '' : SQL.slice(i, k);
};
const POSE = corps('create or replace function public.pose_si_libre(');
const DEPL = corps('create or replace function public.deplace_si_libre(');
const REPR = corps('create or replace function public.reprend_si_libre(');
const GARDE = corps('create or replace function public.une_place_en_ligne(');
const PETIT_A = 'not public.petit_service(public.duree_du_rdv(a.data))';
const FAUTEUILS = `and not public.petit_service(duree) and ${PETIT_A}`;
const LOURDE_A = `bool_or(public.tete_lourde(a.data) and ${PETIT_A})`;
dit('la base : une heure ou moins, la meme borne que l agenda, fermee aux clientes', [true, true], [
  SQL.includes(`select coalesce(p_duree between 1 and ${PETIT_SERVICE_MIN}, false)`),
  SQL.includes('revoke all on function public.petit_service(int) from public, anon, authenticated;')]);
dit('pose_si_libre : la venue petite ne compte pas sa tete, les fauteuils et Team la partagent', [true, true, 2], [
  POSE.includes('  if public.petit_service(duree) then\n    lourde_venue := false;\n  end if;'), POSE.includes(FAUTEUILS), POSE.split(LOURDE_A).length - 1]);
dit('deplace_si_libre : les fauteuils, sa tete, celle de Team', [true, true, true], [
  DEPL.includes(FAUTEUILS), DEPL.includes(LOURDE_A), DEPL.includes('not (public.tete_lourde(d) and not public.petit_service(duree) and lourde_chez_lui)')]);
dit('reprend_si_libre : les fauteuils, sa tete, celle de Team', [true, true, true], [
  REPR.includes(FAUTEUILS), REPR.includes('lourde_venue := public.tete_lourde(d) and not public.petit_service(duree);'), REPR.includes(LOURDE_A)]);
dit('le garde : les places comptees sans les petits, Team qui partage, deux au plus', [true, true, true, true], [
  GARDE.includes(`(count(*) filter (where ${FAUTEUILS.slice(4)}))::int`), GARDE.includes('  if dessous_places >= places then'),
  GARDE.includes(`and public.tete_lourde(a.data)\n                          and ${PETIT_A}), false),`),
  GARDE.includes("and not (maitre = 'Team' and chez_lui < 2 and not (public.tete_lourde(new.data) and not public.petit_service(duree) and lourde_chez_lui)) then")]);
dit('... et rien d autre ne change : quatre fonctions, un seul begin, un seul commit', [4, 1, 1],
  [[POSE, DEPL, REPR, GARDE].filter((x) => x.length > 0).length, SQL.split('\nbegin;\n').length - 1, SQL.split('\ncommit;\n').length - 1]);

/* 0242 : une place par paire, le compte des fauteuils seul change. */
const SQL2 = lis('supabase/migrations/0242_un_petit_service_partage_une_place.sql');
const corps2 = (debut: string): string => {
  const i = SQL2.indexOf(debut);
  if (i < 0) return '';
  const k = SQL2.indexOf('$function$;', i);
  return k < 0 ? '' : SQL2.slice(i, k);
};
const PRISES = `public.places_prises(duree, count(*)::int, (count(*) filter (where public.petit_service(public.duree_du_rdv(a.data))))::int)`;
dit('0242 : places_prises est celle de l agenda, fermee aux clientes', [true, true], [
  SQL2.includes('- least(greatest(0, coalesce(p_petits, 0)) + case when public.petit_service(p_duree) then 1 else 0 end,\n               (greatest(0, coalesce(p_voisins, 0)) + 1) / 2)'),
  SQL2.includes('revoke all on function public.places_prises(int, int, int) from public, anon, authenticated;')]);
dit('0242 : la pose, le deplacement, la reprise comptent leurs places par paires, et le garde aussi', [true, true, true, true, false], [
  corps2('create or replace function public.pose_si_libre(').includes(PRISES) && /\) > sieges then\n    return jsonb_build_object\('ok', false, 'raison', 'creneau_pris', 'detail', 'fauteuils'\);/.test(corps2('create or replace function public.pose_si_libre(')),
  corps2('create or replace function public.deplace_si_libre(').includes(PRISES),
  corps2('create or replace function public.reprend_si_libre(').includes(PRISES),
  corps2('create or replace function public.une_place_en_ligne(').includes('  if public.places_prises(duree, dessous, petits_dessous) > places then'),
  SQL2.includes('and not public.petit_service(duree) and not public.petit_service(public.duree_du_rdv(a.data))')]);

console.log(`\n${vus} epreuves, ${ko} en echec.`);
process.exitCode = ko ? 1 : 0;
