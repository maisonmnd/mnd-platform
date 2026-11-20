/* DEUX TETES CHEZ TEAM, EPROUVE — 18 novembre 2026.
   `node scripts/verifie-deux-tetes-chez-team.mjs` ; `--prouve` remet chaque
   panne et chacune doit faire crier une epreuve.

   « On peut mettre deux personnes aux memes horaires... tant qu'une personne
   a moins de 150 locks et l'autre a 400 locks. Mais on ne peut pas prendre
   deux personnes qui ont 400 locks simultanement » (Yeman). Au selecteur :
   l'une des deux sous 150 locks ; une fiche sans nombre compte comme une
   petite tete ; tous les rituels de Team ; le samedi comme en semaine.

     A. LA REGLE PURE (agenda-pur) : `teteLourde`, `bloqueLaVenue`,
        `creneauxLibres` (Team partage, deux au plus, Expert jamais, les
        places du jour restent le plafond) ;
     B. LE JUGE DU SERVEUR (place-du-serveur) : `laPlaceTient` et
        `placesLibres` disent la meme chose, un maitre seul passe avant Team
        qui partage, les places de chaque jour (`siegesDuJour`) comptent,
        « lourde » se lit sur les creneaux ;
     C. LES PORTES, sur la lettre : Opale (ses places, sa proposition, sa
        confirmation), Perle, le site, Ma Couronne, le deplacement ;
     D. LA BASE (0238) : le meme seuil, le meme maitre, deux au plus, la tete
        lue sur la fiche ou annoncee, les droits.

   Sortie en ASCII (la console Windows est en cp1252). */
import { readFileSync } from 'node:fs';
import {
  bloqueLaVenue, creneauxLibres, DEUX_TETES_AU_PLUS, MAITRE_QUI_PARTAGE, SEUIL_TETE_LOURDE, teteLourde, type CreneauOccupe,
} from '../src/shared/agenda-pur';
import { agendaDepuisLesLignes, laPlaceTient, placesLibres, siegesDe } from '../src/shared/place-du-serveur';

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
  const copie = process.env.DEUX_TETES_PANNE_FICHIER === rel ? process.env.DEUX_TETES_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/* ══ A. LA REGLE PURE ════════════════════════════════════════════════ */
dit('le seuil, le maitre qui partage, deux au plus', [150, 'Team', 2], [SEUIL_TETE_LOURDE, MAITRE_QUI_PARTAGE, DEUX_TETES_AU_PLUS]);
dit('une tete lourde : 150 locks ou plus, ecrits en nombre ; un compte inconnu n en fait pas une',
  [false, true, true, true, true, false, false, false, false, false, false, false],
  [149, 150, 400, '400', ' 200 ', '', null, undefined, 'abc', '-200', '1e3', Number.NaN].map((v) => teteLourde(v)));
dit('Expert : un rendez-vous deja pris bloque toujours, petites tetes ou non', [true, true, true, true],
  [bloqueLaVenue('Expert', false, {}), bloqueLaVenue('Expert', true, {}), bloqueLaVenue('Expert', false, { lourde: true }), bloqueLaVenue('Expert', true, { lourde: true })]);
dit('Team : bloque seulement entre deux lourdes', [false, false, false, true],
  [bloqueLaVenue('Team', false, {}), bloqueLaVenue('Team', true, {}), bloqueLaVenue('Team', false, { lourde: true }), bloqueLaVenue('Team', true, { lourde: true })]);

const JOUR = { closed: false, openMin: 9 * 60, closeMin: 19 * 60 };
/* Les durees par defaut : une heure et demie, plus qu'un petit service (une
   heure ou moins partage l'heure depuis le 20 novembre 2026,
   verifie-le-petit-service). */
const o = (maitre: string, debut: number, duree = 90, lourde = false) => ({ maitre, debutMin: debut * 60, dureeMin: duree, ...(lourde ? { lourde: true } : {}) });
const libre = (master: string, occupes: ReturnType<typeof o>[], h: string, x: { lourde?: boolean; places?: number; duree?: number } = {}): boolean =>
  creneauxLibres({ opening: JOUR, durationMin: x.duree ?? 90, occupes, master, capSimultane: x.places ?? 2, maintenantMin: null, ...(x.lourde ? { lourde: true } : {}) }).includes(h);
dit('creneauxLibres, Team : une petite tete partage, d un cote ou de l autre', [true, true, true],
  [libre('Team', [o('Team', 14)], '14:00'), libre('Team', [o('Team', 14, 90, true)], '14:00'), libre('Team', [o('Team', 14)], '14:00', { lourde: true })]);
dit('... deux lourdes jamais ensemble', false, libre('Team', [o('Team', 14, 90, true)], '14:00', { lourde: true }));
dit('... deux au plus chez Team, meme petites et meme avec des places', false,
  libre('Team', [o('Team', 14), o('Team', 14)], '14:00', { places: 5 }));
dit('... une lourde qui deborde (13 h - 15 h) ferme aussi 14 h a une autre lourde', false,
  libre('Team', [o('Team', 13, 120, true)], '14:00', { lourde: true }));
dit('creneauxLibres, Expert : jamais deux, petites tetes comprises', false, libre('Expert', [o('Expert', 14)], '14:00'));
dit('les places du jour restent le plafond : une place, Team ne partage pas', false, libre('Team', [o('Team', 14)], '14:00', { places: 1 }));
dit('... deux places prises par Team et Expert : rien de plus', false, libre('Team', [o('Team', 14), o('Expert', 14)], '14:00'));

/* ══ B. LE JUGE DU SERVEUR ═══════════════════════════════════════════ */
/* Mercredi 18 novembre 2026, 11 h a Cotonou ; le juge regarde vendredi 20. */
const MS = Date.parse('2026-11-18T10:00:00.000Z');
const VEN = '2026-11-20';
const SAM = '2026-11-21';
const SEMAINE = [
  { key: 'dim', open: '09h00', close: '19h00', closed: true },
  ...['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: false })),
];
const CATEGORIES = [
  { id: 'atl-ii-gbeji', data: { label: 'GBEJI' } },
  { id: 'c-lav', data: { label: 'Les lavages', parentId: 'atl-ii-gbeji' } },
];
const SERVICES = [
  { id: 'lav', data: { name: 'Lavage', categoryId: 'c-lav', durationMin: 90 } },
  { id: 'sin', data: { name: 'SÍNSIN™ Essentiel · La Reprise', categoryId: 'atl-ii-gbeji', durationMin: 90 } },
];
const occ = (jour: string, maitre: string, debut: string, lourde?: boolean): Record<string, unknown> =>
  ({ jour, maitre, debut, duree: 90, ...(lourde === undefined ? {} : { lourde }) });
const agenda = (occupes: Record<string, unknown>[], places?: Record<string, unknown>[]) => agendaDepuisLesLignes({
  branche: { id: 'br', data: { masters: ['Team', 'Expert'], seats: 2 } },
  reglages: { hours: SEMAINE, maxRdvParJourMaison: 0, maxRdvParJourMaitre: 0 },
  exceptions: [], vitrine: {}, services: SERVICES, categories: CATEGORIES, blocages: [], occupes,
  ...(places ? { places } : {}),
})!;
const DEUX = [{ jour: VEN, places: 2 }, { jour: SAM, places: 2 }];
const juge = (a: ReturnType<typeof agenda>, ids: string[], lourde?: boolean, time = '14:00', date = VEN) =>
  laPlaceTient(a, { date, time, serviceIds: ids, ...(lourde ? { lourde: true } : {}) }, MS);

dit('« lourde » se lit sur les creneaux de la base, et seulement vrai', [true, false, false],
  agenda([occ(VEN, 'Team', '14:00', true), occ(VEN, 'Team', '15:00', false), { ...occ(VEN, 'Team', '16:00'), lourde: 'oui' }]).occupes.map((c) => !!c.lourde));
dit('les places de chaque jour : lues de `places_en_ligne_du`, une place sinon', [2, 2, 1],
  [siegesDe(agenda([], DEUX), VEN), siegesDe(agenda([], DEUX), SAM), siegesDe(agenda([], DEUX), '2026-11-24')]);
dit('... une ligne illisible ne compte pas', 1,
  siegesDe(agenda([], [{ jour: VEN, places: 0 }, { jour: 'demain', places: 2 }, { jour: VEN, places: 1.5 }]), VEN));
dit('un SINSIN (Team seul) : une petite tete deja la, Team la recoit aussi', { ok: true, maitres: ['Team'] },
  (({ ok, maitres }) => ({ ok, maitres }))(juge(agenda([occ(VEN, 'Team', '14:00')], DEUX), ['sin']) as { ok: true; maitres: string[] }));
dit('... deux lourdes : refuse', { ok: false, erreur: 'creneau_pris' },
  juge(agenda([occ(VEN, 'Team', '14:00', true)], DEUX), ['sin'], true));
dit('... deux deja chez Team : refuse (et les places, pleines)', false,
  juge(agenda([occ(VEN, 'Team', '14:00'), occ(VEN, 'Team', '14:00')], [{ jour: VEN, places: 3 }]), ['sin']).ok);
dit('... une place ce jour-la : Team ne partage pas', false,
  juge(agenda([occ(VEN, 'Team', '14:00')], [{ jour: VEN, places: 1 }]), ['sin']).ok);
dit('un lavage (Team ou Expert) : Expert seul passe avant Team qui partage', ['Expert', 'Team'],
  (juge(agenda([occ(VEN, 'Team', '14:00')], DEUX), ['lav']) as { maitres: string[] }).maitres);
dit('... Expert pris : Team seul ; une lourde chez Team et une lourde qui vient : refuse', [['Team'], false],
  [(juge(agenda([occ(VEN, 'Expert', '14:00')], DEUX), ['lav']) as { maitres: string[] }).maitres,
    juge(agenda([occ(VEN, 'Team', '14:00', true), occ(VEN, 'Expert', '13:00')], DEUX), ['lav'], true, '13:30').ok]);
{
  /* Les places montrees et le juge disent la meme chose, tete par tete. */
  const a = agenda([occ(VEN, 'Team', '14:00', true), occ(SAM, 'Team', '10:00')], DEUX);
  const montre = (lourde: boolean, jour: string, h: string) => placesLibres(a, ['sin'], MS, 4, undefined, lourde).some((p) => p.iso === jour && p.heure === h);
  dit('placesLibres suit le juge : vendredi 14 h (une lourde chez Team), samedi 10 h (une petite)',
    [false, true, true, true],
    [montre(true, VEN, '14:00'), montre(false, VEN, '14:00'), montre(true, SAM, '10:00'), montre(false, SAM, '10:00')]);
  dit('... et le juge dit pareil', [false, true, true, true],
    [juge(a, ['sin'], true).ok, juge(a, ['sin'], false).ok, juge(a, ['sin'], true, '10:00', SAM).ok, juge(a, ['sin'], false, '10:00', SAM).ok]);
}

/* ══ C. LES PORTES, SUR LA LETTRE ════════════════════════════════════ */
const WA = lis('supabase/functions/whatsapp-automate/index.ts');
const DS = lis('supabase/functions/demande-submit/index.ts');
const AG = lis('src/apps/revelateur/agenda.ts');
const RS = lis('src/apps/revelateur/ilots/Reserver.tsx');
const LIB = lis('src/apps/couronne/lib.ts');
const BK = lis('src/apps/couronne/Booking.tsx');
const CY = lis('src/apps/couronne/Cycle.tsx');
const OP = lis('src/shared/opale-pur.ts');
dit('Opale lit les places de chaque jour avec l agenda, une place en panne', [true, true],
  [WA.includes("sb.rpc('places_en_ligne_du', { p_branch: branche.id, p_debut: du, p_fin: au })"), WA.includes('...(places ? { places } : {}),')]);
dit('Opale : sa tete, dite ou sur sa fiche, juge ses places, sa proposition et sa confirmation', [true, true, true, true], [
  WA.includes('const lourde = teteLourde(locksDOpale(e?.pour, e?.locks));'),
  WA.includes('const lourdeVenue = teteLourde(locksDOpale(p.pour, e?.locks));')
    && WA.includes('laPlaceTient(agenda!.agenda, { date: p.date, time: p.heure, serviceIds: p.gestes, ...(lourdeVenue ? { lourde: true } : {}) }, ms, p.date === aujourdhui)'),
  WA.includes('const lourdeVenue = teteLourde(a.locks ?? f?.tete?.locks);') && WA.includes('await poseSousVerrou(sb, agenda!, ecriture, vue!.oublie, jourMeme, lourdeVenue);'),
  WA.includes('...(a.locks ? { locksAnnonces: a.locks } : {}),')]);
dit('... les locks dits se gardent avec la place tenue', true, WA.includes('proposeLe: new Date().toISOString(), ...(locksDits ? { locks: locksDits } : {}) };'));
dit('... son outil demande `pour` et `locks`, et la consigne dit pourquoi', [true, true], [
  /name: 'chercher_des_places',[\s\S]{0,900}pour: \{ type: 'string'[\s\S]{0,300}locks: \{ type: 'integer'/.test(OP),
  OP.includes('car deux personnes ne se reçoivent à la même heure que si l’une a moins de 150 locks')]);
dit('Perle : la tete de sa fiche', [true, true],
  [WA.includes('const lourde = teteLourde(f.tete?.locks);'), WA.includes('await poseSousVerrou(sb, lu, ecriture, vue.oublie, false, lourde);')]);
dit('le deplacement (WhatsApp, le site) : la tete du rendez-vous, lue sur son creneau', [true, true],
  [WA.includes('const lourde = lourdeDuRdvWa(agenda, maitre, sauf);'), DS.includes('const lourde = lourdeDuRdvDuSite(agenda, maitre, sauf);')]);
dit('le site : la tete annoncee juge la place et s ecrit sur le rendez-vous', [true, true, true], [
  DS.includes('const lourde = teteLourde(Math.round(Number(o.lockCount) || 0));'),
  DS.includes('...(lockCount > 0 ? { locksAnnonces: lockCount } : {}),'),
  RS.includes('lourde: teteLourde(lockCountAnnonce)') && AG.includes('...(o.lourde ? { lourde: true } : {}),')]);
dit('Ma Couronne : sa fiche, ou le compte declare (ecrit sur le rendez-vous)', [true, true, true, true], [
  DS.includes('dureeMin, lourde: teteLourde(lockCount) }));'),
  DS.includes('...(!(Number(fiche?.lockCount) > 0) && lockCount > 0 ? { locksAnnonces: lockCount } : {}),'),
  LIB.includes('...(c.lourde ? { lourde: true } : {}) }))') && BK.includes('const teteDeLaCible = teteLourde(Number(cible?.lockCount) || Number(cible?.lockCountDeclare) || 0);'),
  CY.includes('const lourde = teteLourde(client?.lockCount);')]);
dit('le site prefere un maitre seul a Team qui partage', true, AG.includes('if (!deja || (!seulA(deja, h) && seulA(maitre, h))) parHeure.set(h, maitre);'));

/* ══ D. LA BASE : 0238 ═══════════════════════════════════════════════ */
const SQL = lis('supabase/migrations/0238_deux_tetes_chez_team.sql');
const corps = (debut: string): string => {
  const i = SQL.indexOf(debut);
  if (i < 0) return '';
  const fin = SQL.indexOf('$function$;', i);
  const fin2 = SQL.indexOf('\n$$;', i);
  const k = [fin, fin2].filter((x) => x > i).sort((x, y) => x - y)[0] ?? -1;
  return k < 0 ? '' : SQL.slice(i, k);
};
const LOURDS = corps('create or replace function public.locks_lourds(p text)');
const TETE = corps('create or replace function public.tete_lourde(p_data jsonb)');
const OCC = corps('create function public.creneaux_occupes(p_branch text, p_du text, p_au text)');
const POSE = corps('create or replace function public.pose_si_libre(');
const DEPL = corps('create or replace function public.deplace_si_libre(');
const GARDE = corps('create or replace function public.une_place_en_ligne(');
dit('le seuil de la base est celui de l agenda (150), lu en chiffres', [true, true],
  [LOURDS.includes(`then btrim(p)::numeric >= ${SEUIL_TETE_LOURDE} else false end`), LOURDS.includes("~ '^\\d+(\\.\\d+)?$'")]);
dit('la tete : annoncee sur le rendez-vous, ou sur sa fiche', [true, true],
  [TETE.includes("public.locks_lourds(p_data->>'locksAnnonces')"), TETE.includes("public.locks_lourds(c.data->>'lockCount')")]);
dit('creneaux_occupes dit « lourde », jamais le nombre ni la fiche', [true, true, false],
  [OCC.includes('returns table(jour text, maitre text, debut text, duree integer, lourde boolean)'), OCC.includes('public.tete_lourde(a.data)       as lourde'),
    /lockCount|clientId|client_id/.test(OCC.replace('public.tete_lourde(a.data)', ''))]);
dit('... ses droits reposes (anon, connectees, serveur), les aides fermees aux clientes', [true, true, true], [
  SQL.includes('grant execute on function public.creneaux_occupes(text, text, text) to anon, authenticated, service_role;'),
  SQL.includes('revoke all on function public.tete_lourde(jsonb) from public, anon, authenticated;'),
  SQL.includes('revoke all on function public.locks_lourds(text) from public, anon, authenticated;')]);
const REGLE = `and chez_lui < ${DEUX_TETES_AU_PLUS} and not (`;
dit('le verrou : un maitre seul d abord, sinon Team qui partage (le meme maitre, deux au plus, pas deux lourdes)', [true, true, true], [
  POSE.includes('    if chez_lui = 0 then\n      choisi := m;\n      exit;\n    end if;'),
  POSE.includes(`if partage is null and m = '${MAITRE_QUI_PARTAGE}' ${REGLE}lourde_venue and lourde_chez_lui) then`),
  POSE.includes('choisi := coalesce(choisi, partage);')]);
dit('le deplacement du site : la meme regle', true,
  DEPL.includes(`and not (maitre = '${MAITRE_QUI_PARTAGE}' ${REGLE}public.tete_lourde(d) and lourde_chez_lui)) then`));
dit('le garde de Ma Couronne : la meme regle', true,
  GARDE.includes(`and not (maitre = '${MAITRE_QUI_PARTAGE}' ${REGLE}public.tete_lourde(new.data) and lourde_chez_lui)) then`));
dit('les places du jour restent le plafond dans le verrou et le garde', [true, true],
  [POSE.includes('sieges := public.places_en_ligne(branche, jour::date);'), GARDE.includes('if dessous >= places then')]);
dit('les droits du verrou et du deplacement, tels qu en base', [true, true], [
  SQL.includes('revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;'),
  SQL.includes('revoke all on function public.deplace_si_libre(text, text, text, timestamptz, boolean) from public, anon, authenticated;')]);

console.log(`\n${vus - ko}/${vus} epreuves : deux tetes chez Team.`);
if (ko) process.exit(1);
