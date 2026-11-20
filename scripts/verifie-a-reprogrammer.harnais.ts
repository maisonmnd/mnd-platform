/* À REPROGRAMMER, EPROUVE — 19 novembre 2026.
   `node scripts/verifie-a-reprogrammer.mjs` ; `--prouve` remet chaque panne.

   Maquette 7YX7UtCFusPMJdrjJtfcQr, « construis » de Yeman :
     A. LA REGLE PURE (a-reprogrammer-pur) : le report (statut technique
        « annule » et sa marque), la relance du lendemain (vers la 23e heure,
        de jour, avant la fermeture de WhatsApp, une fois), les boutons (vingt
        signes, l'identifiant « MND:place| »), ses habitudes, trois places
        choisies pour elle, « jamais sans rendez-vous » ;
     B. LA BASE (0239) : la reprise sous verrou, la pose au-dela des fauteuils
        reservee a Opale, jamais deux tetes lourdes chez Team, les droits ;
     C. LE TRONE ET MA COURONNE, sur la lettre : la fiche du rendez-vous, la
        colonne du Calendrier, Aujourd'hui, le Carnet, les comptes (jamais une
        annulation), Ma Couronne.
   Les parcours d'Opale (le toucher, « Changer l'heure », accommoder, la
   relance) se jugent dans verifie-opale. Sortie en ASCII. */
import { readFileSync } from 'node:fs';
import {
  DERNIERE_RELANCE_DU_REPORT_APRES_MS, EQUIPE_APRES_LA_DERNIERE_MS, EQUIPE_DU_REPORT_APRES_MS, MODELE_DE_LA_DERNIERE_RELANCE, RELANCE_DU_REPORT_APRES_MS,
  derniereRelanceDuReportDue, idDuBoutonDuReport, lisLeBoutonDuReport, texteDeLaDerniereRelance, estAReprogrammer, etatDuReport, habitudesDites, habitudesDuReport, idDuBoutonDePlace,
  lisLeBoutonDePlace, marquesDuReport, momentDeLaRelanceDuReport, placesDejaProposees, relanceDuReportDue, sansLeReport, suiteDeSaDemande,
  titreDuBoutonDePlace, troisPlacesDuReport,
} from '../src/shared/a-reprogrammer-pur';

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
const lis = (rel: string): string => {
  const copie = process.env.REPORT_PANNE_FICHIER === rel ? process.env.REPORT_PANNE_COPIE : undefined;
  return readFileSync(copie ?? rel, 'utf8').replace(/\r\n/g, '\n');
};

/* ══ A. LA REGLE PURE ════════════════════════════════════════════════ */
const H = 3_600_000;
/** Un instant a Cotonou (UTC+1) : le 19 novembre 2026 a h:m. */
const cotonou = (jour: number, h: number, m = 0): number => Date.UTC(2026, 10, jour, h - 1, m);
const marques = marquesDuReport(cotonou(19, 13, 12), 'opale');
dit('le report : statut technique annule, sa marque, qui', ['annulé', '2026-11-19T12:12:00.000Z', 'opale'], [marques.status, marques.aReprogrammerDepuis, marques.aReprogrammerPar]);
dit('a reprogrammer : annule ET marque ; ni un annule seul, ni un confirme marque', [true, false, false, false],
  [estAReprogrammer({ status: 'annulé', aReprogrammerDepuis: 'x' }), estAReprogrammer({ status: 'annulé' }), estAReprogrammer({ status: 'confirmé', aReprogrammerDepuis: 'x' }), estAReprogrammer(null)]);
dit('la reprise efface les marques, garde le reste', { id: 'r', date: 'd' },
  sansLeReport({ id: 'r', date: 'd', aReprogrammerDepuis: 'x', aReprogrammerPar: 'opale', placesProposees: ['a'], relanceDuReportLe: 'y' }));
const a0 = { status: 'annulé', aReprogrammerDepuis: new Date(cotonou(10, 9)).toISOString() };
/* La derniere relance (20 novembre 2026) : le 7e jour ; l equipe 48 h apres, ou au 9e jour. */
const derniereLe = new Date(cotonou(17, 10, 30)).toISOString();
dit('son etat : attend, relancee, derniere, plus tard, a l equipe 48 h apres la derniere ou au 9e jour', ['attend', 'relancee', 'derniere', 'plus-tard', 'equipe', 'equipe', 'relancee'], [
  etatDuReport(a0, cotonou(12, 9)), etatDuReport({ ...a0, relanceDuReportLe: 'x' }, cotonou(12, 9)),
  etatDuReport({ ...a0, relanceDuReportLe: 'x', derniereRelanceDuReportLe: derniereLe }, cotonou(18, 9)),
  etatDuReport({ ...a0, refusDuReportLe: 'x' }, cotonou(25, 9)),
  etatDuReport({ ...a0, relanceDuReportLe: 'x', derniereRelanceDuReportLe: derniereLe }, cotonou(19, 11)),
  etatDuReport(a0, cotonou(19, 10)), etatDuReport({ ...a0, relanceDuReportLe: 'x' }, cotonou(17, 9))]);
dit('les delais : 23 heures, 7 jours, 48 heures, 9 jours ; le modele', [23 * H, 7 * 24 * H, 48 * H, 9 * 24 * H, 'rdv_a_reprogrammer'],
  [RELANCE_DU_REPORT_APRES_MS, DERNIERE_RELANCE_DU_REPORT_APRES_MS, EQUIPE_APRES_LA_DERNIERE_MS, EQUIPE_DU_REPORT_APRES_MS, MODELE_DE_LA_DERNIERE_RELANCE]);
const r7 = { status: 'annulé', aReprogrammerDepuis: new Date(cotonou(12, 9)).toISOString() };
dit('la derniere relance : le 7e jour, entre 10 h et 12 h, une fois, jamais apres « Plus tard » ni si elle a ecrit dans les 24 h', [false, true, false, false, false, false, true], [
  derniereRelanceDuReportDue({ a: r7, dernierEntrantMs: null, maintenantMs: cotonou(18, 10, 30) }),
  derniereRelanceDuReportDue({ a: r7, dernierEntrantMs: null, maintenantMs: cotonou(19, 10, 30) }),
  derniereRelanceDuReportDue({ a: r7, dernierEntrantMs: null, maintenantMs: cotonou(19, 12, 30) }),
  derniereRelanceDuReportDue({ a: { ...r7, derniereRelanceDuReportLe: 'x' }, dernierEntrantMs: null, maintenantMs: cotonou(19, 10, 30) }),
  derniereRelanceDuReportDue({ a: { ...r7, refusDuReportLe: 'x' }, dernierEntrantMs: null, maintenantMs: cotonou(19, 10, 30) }),
  derniereRelanceDuReportDue({ a: r7, dernierEntrantMs: cotonou(19, 8), maintenantMs: cotonou(19, 10, 30) }),
  derniereRelanceDuReportDue({ a: r7, dernierEntrantMs: cotonou(18, 8), maintenantMs: cotonou(19, 10, 30) })]);
dit('ses deux reponses : « MND:report|… », relues telles quelles ; le texte ne finit pas par une variable', ['MND:report|dates|rdv-abc', { geste: 'plus-tard', rdv: 'rdv-abc' }, null, true], [
  idDuBoutonDuReport('dates', 'rdv-abc'), lisLeBoutonDuReport('MND:report|plus-tard|rdv-abc'), lisLeBoutonDuReport('MND:report|peut-etre|rdv-abc'),
  texteDeLaDerniereRelance('Mme Afi').endsWith('nouvelles dates ?')]);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms + H).toISOString().slice(0, 16));
dit('le moment de la relance : 23 h apres, ramene a 20 h 55 la nuit, jamais trop tot', ['2026-11-20T09:00', '2026-11-20T20:55', '2026-11-19T20:55', '2026-11-20T14:00'], [
  iso(momentDeLaRelanceDuReport(cotonou(19, 10), cotonou(19, 10))),
  iso(momentDeLaRelanceDuReport(cotonou(19, 22, 30), cotonou(19, 22, 30))),
  iso(momentDeLaRelanceDuReport(cotonou(19, 2), cotonou(19, 2))),
  iso(momentDeLaRelanceDuReport(cotonou(19, 15), cotonou(19, 15)))]);
const rep = { status: 'annulé', aReprogrammerDepuis: new Date(cotonou(19, 10)).toISOString() };
dit('la relance est due au moment dit, de jour, une fois, la fenetre ouverte, avec un message d elle', [false, true, false, false, false, false], [
  relanceDuReportDue({ a: rep, dernierEntrantMs: cotonou(19, 10), maintenantMs: cotonou(20, 8, 30) }),
  relanceDuReportDue({ a: rep, dernierEntrantMs: cotonou(19, 10), maintenantMs: cotonou(20, 9, 5) }),
  relanceDuReportDue({ a: { ...rep, relanceDuReportLe: 'x' }, dernierEntrantMs: cotonou(19, 10), maintenantMs: cotonou(20, 9, 5) }),
  relanceDuReportDue({ a: rep, dernierEntrantMs: cotonou(19, 10), maintenantMs: cotonou(20, 9, 50) }),
  relanceDuReportDue({ a: rep, dernierEntrantMs: null, maintenantMs: cotonou(20, 9, 5) }),
  relanceDuReportDue({ a: { status: 'confirmé' }, dernierEntrantMs: cotonou(19, 10), maintenantMs: cotonou(20, 9, 5) })]);
dit('la nuit, rien : sa fenetre se ferme a 22 h 30, la relance part a 20 h 55, pas a 22 h', [true, false], [
  relanceDuReportDue({ a: { status: 'annulé', aReprogrammerDepuis: new Date(cotonou(19, 22, 30)).toISOString() }, dernierEntrantMs: cotonou(19, 22, 30), maintenantMs: cotonou(20, 20, 56) }),
  relanceDuReportDue({ a: { status: 'annulé', aReprogrammerDepuis: new Date(cotonou(19, 22, 30)).toISOString() }, dernierEntrantMs: cotonou(19, 22, 30), maintenantMs: cotonou(20, 22, 0) })]);

dit('le titre d un bouton : le jour, le quantieme, le mois, l heure ; vingt signes au plus', ['Ven. 20 nov., 18 h', 'Mar. 24 nov., 8 h 30', 'Mer. 30/09, 10 h 30', true], [
  titreDuBoutonDePlace({ iso: '2026-11-20', heure: '18:00' }), titreDuBoutonDePlace({ iso: '2026-11-24', heure: '08:30' }),
  titreDuBoutonDePlace({ iso: '2026-09-30', heure: '10:30' }), titreDuBoutonDePlace({ iso: '2026-09-30', heure: '10:30' }).length <= 20]);
const id1 = idDuBoutonDePlace({ rdv: 'rdv-abc' }, { iso: '2026-11-21', heure: '09:00' });
const id2 = idDuBoutonDePlace({ pour: 'nouvelle' }, { iso: '2026-11-21', heure: '09:00' });
dit('l identifiant : « MND: » (la reception le confie a Opale), relu tel quel', ['MND:place|r:rdv-abc|2026-11-21|09:00', { rdv: 'rdv-abc', place: { iso: '2026-11-21', heure: '09:00' } }, { pour: 'nouvelle', place: { iso: '2026-11-21', heure: '09:00' } }],
  [id1, lisLeBoutonDePlace(id1), lisLeBoutonDePlace(id2)]);
dit('... un identifiant etranger ne se lit pas', [null, null, null, null], [
  lisLeBoutonDePlace('place|r:x|2026-11-21|09:00'), lisLeBoutonDePlace('MND:place|x:y|2026-11-21|09:00'), lisLeBoutonDePlace('MND:place|r:y|21/11|9h'), lisLeBoutonDePlace(42)]);
dit('les places deja proposees, relues sans rien croire', ['2026-11-20 18:00'], placesDejaProposees({ placesProposees: ['2026-11-20 18:00', 'demain', 3] }));

const h = habitudesDuReport([{ date: '2026-10-03', time: '10:00' }, { date: '2026-10-31', time: '10:00' }, { date: '2026-10-13', time: '15:00' }]);
dit('ses habitudes : le jour qui revient (samedi), son heure mediane ; dites « du samedi matin »', [[5], 600, 'du samedi matin'], [h.jours, h.minutes, habitudesDites(h)]);
dit('... une seule venue ne fait pas une habitude de jour', [[], ''], [habitudesDuReport([{ date: '2026-10-03', time: '10:00' }]).jours, habitudesDites(habitudesDuReport([{ date: '2026-10-03', time: '10:00' }]))]);
const candidats = [
  { iso: '2026-11-20', heure: '18:00' }, { iso: '2026-11-21', heure: '09:00' }, { iso: '2026-11-21', heure: '10:00' },
  { iso: '2026-11-24', heure: '08:30' }, { iso: '2026-11-28', heure: '10:00' }, { iso: '2026-11-28', heure: '11:00' },
];
dit('trois places : jamais deja proposees, trois jours differents, dans l ordre du temps', ['2026-11-21 09:00', '2026-11-24 08:30', '2026-11-28 10:00'],
  troisPlacesDuReport(candidats, { deja: ['2026-11-20 18:00'], perdue: { iso: '2026-11-21', heure: '10:00' } }).map((p) => `${p.iso} ${p.heure}`));
dit('... ses habitudes du samedi matin passent avant un mardi a la meme heure', ['2026-11-28'],
  troisPlacesDuReport([{ iso: '2026-11-24', heure: '10:00' }, { iso: '2026-11-28', heure: '10:00' }], { habitudes: h, combien: 1 }).map((p) => p.iso));
dit('... le jour qu elle a dit passe avant tout', ['2026-11-24'], troisPlacesDuReport(candidats, { souhait: { jour: '2026-11-24' }, combien: 1 }).map((p) => p.iso));

const juges = (libres: string[], auDela: Record<string, string> = {}) => ({ libre: (x: string) => (libres.includes(x) ? ['Team'] : []), auDela: (x: string) => auDela[x] ?? null });
dit('jamais sans rendez-vous : son heure ; dans l heure ; au-dela des fauteuils ; sinon rien', [
  { genre: 'son-heure', heure: '15:00', maitres: ['Team'] }, { genre: 'dans-l-heure', heures: ['16:00'] }, { genre: 'au-dela', heure: '15:00', maitre: 'Expert' }, { genre: 'aucune' },
], [
  suiteDeSaDemande('15:00', juges(['15:00'])), suiteDeSaDemande('15:00', juges(['16:00', '17:00'])),
  suiteDeSaDemande('15:00', juges([], { '15:00': 'Expert', '15:30': 'Team' })), suiteDeSaDemande('15:00', juges(['16:30'])),
]);

/* ══ B. LA BASE : 0239 ═══════════════════════════════════════════════ */
const SQL = lis('supabase/migrations/0239_a_reprogrammer.sql');
const corps = (debut: string): string => {
  const i = SQL.indexOf(debut);
  const k = i < 0 ? -1 : SQL.indexOf('end $function$;', i);
  return k < 0 ? '' : SQL.slice(i, k);
};
const REPREND = corps('create or replace function public.reprend_si_libre(');
const POSE = corps('create or replace function public.pose_si_libre(');
dit('la reprise : sous le verrou des poses, la ligne relue, rien n a bouge', [true, true, true], [
  REPREND.includes("perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));"),
  REPREND.includes('for update;'), REPREND.includes('if p_vu is not null and rdv.updated_at is distinct from p_vu then')]);
dit('... seulement un rendez-vous a reprogrammer ; un second toucher ne pose rien de plus', [true, true], [
  REPREND.includes("if not (coalesce(d->>'status', '') = 'annulé' and btrim(coalesce(d->>'aReprogrammerDepuis', '')) <> '') then"),
  REPREND.includes("return jsonb_build_object('ok', true, 'verdict', 'deja'")]);
dit('... jamais avant 08:30, le jour meme vingt-cinq minutes plus tard, jusqu a la borne', [true, true], [
  REPREND.includes('if debut is null or debut < 510 then'), REPREND.includes('+ extract(minute from now() at time zone \'Africa/Porto-Novo\'))::int + 25) then')]);
dit('... la regle des places sans au-dela ; au-dela, jamais deux tetes lourdes chez Team', [true, true, true], [
  REPREND.includes('if not au_dela then'), REPREND.includes("if not (m = 'Team' and lourde_venue and lourde_chez_lui) then"),
  REPREND.includes("if partage is null and m = 'Team' and chez_lui < 2 and not (lourde_venue and lourde_chez_lui) then")]);
dit('... il redevient confirme, ses marques tombent, sa place d avant gardee, son oui note', [true, true, true, true], [
  REPREND.includes("- 'aReprogrammerDepuis' - 'aReprogrammerPar' - 'placesProposees' - 'relanceDuReportLe'"),
  REPREND.includes("'status', 'confirmé', 'date', p_date, 'time', p_time, 'master', choisi"),
  REPREND.includes("'reprogrammeDe', jsonb_build_object('date', d->>'date', 'time', d->>'time')"), REPREND.includes("'confirmeeParLaClienteLe', maintenant")]);
dit('... au-dela des fauteuils, la note pour l equipe', true, REPREND.includes("'Posé au-delà des fauteuils : la Maison est pleine à cette heure, à organiser'"));
dit('la pose au-dela des fauteuils : Opale sur WhatsApp seulement, plafonds et fauteuils passes, deux tetes jugees', [true, true, true, true], [
  POSE.includes("au_dela         boolean := coalesce(p_rdv->>'auDelaDesPlaces', '') = 'true'\n                             and coalesce(p_rdv->>'source', '') = 'whatsapp'\n                             and coalesce(p_rdv->>'poseePar', '') = 'Opale';"),
  POSE.includes('if not au_dela and cap_maison > 0 and ('), POSE.includes('if not au_dela and sieges > 0 and ('),
  POSE.includes("      if not (m = 'Team' and lourde_venue and lourde_chez_lui) then")]);
dit('les droits : le serveur seul', [true, true], [
  SQL.includes('revoke all on function public.reprend_si_libre(text, text, text, text[], boolean, text, timestamptz) from public, anon, authenticated;'),
  SQL.includes('revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;')]);

/* ══ C. LE TRONE ET MA COURONNE ══════════════════════════════════════ */
const SH = lis('src/apps/trone/routes/clients/_shared.tsx');
const CAL = lis('src/apps/trone/routes/clients/Calendrier.tsx');
const GER = lis('src/apps/trone/routes/clients/Gerard.tsx');
const CAR = lis('src/apps/trone/routes/clients/Carnet.tsx');
const AR = lis('src/apps/trone/routes/clients/a-reprogrammer.ts');
const BIL = lis('src/apps/trone/routes/pilotage/BilanMensuel.tsx');
const PRE = lis('src/apps/trone/routes/pilotage/PrevisionDuMois.tsx');
const SES = lis('src/apps/trone/routes/clients/ses-rendez-vous-pur.ts');
const RVT = lis('src/apps/couronne/RendezVousTab.tsx');
dit('la fiche : « A reprogrammer » rend la place, il s ouvre pour reposer une date, Enregistrer efface les marques', [true, true, true, true], [
  SH.includes('onClick={() => { metsAReprogrammer(appt.id);'), SH.includes("useState<Appointment['status']>(appt && estAReprogrammer(appt) ? 'confirmé' : appt?.status ?? 'confirmé')"),
  SH.includes("...(chosenStatus !== 'annulé' ? marquesDeLaRepriseAuTrone(x) : {}),"), SH.includes('Annuler pour de bon')]);
dit('... les gestes de l equipe : seul un rendez-vous vivant se met a reprogrammer ; la reprise efface tout', [true, true], [
  AR.includes("a.id === id && (a.status === 'confirmé' || a.status === 'en attente')"),
  AR.includes('aReprogrammerDepuis: undefined, aReprogrammerPar: undefined, placesProposees: undefined, relanceDuReportLe: undefined,')]);
dit('le Calendrier : la colonne « A reprogrammer », l ancienne date barree, Reposer une date', [true, true, true], [
  CAL.includes('const aReprogrammer = useMemo(() => rdvsAReprogrammer(tousLesRdv), [tousLesRdv]);'),
  CAL.includes('<aside className="trc-report" aria-label="À reprogrammer">'), CAL.includes('onClick={() => setEditAppt(a)}>Reposer une date</button>')]);
dit('Aujourd hui : la carte tant qu elle n a pas choisi, l equipe au 7e jour', [true, true], [
  GER.includes('const liste = rdvsAReprogrammer(appts);'), GER.includes("etatDuReport(a, Date.now()) === 'equipe'")]);
dit('jamais compte comme une annulation : Carnet, bilan, prevision, ses rendez-vous', [true, true, true, true, true], [
  CAR.includes("annule:     { label: 'Annulés',     garde: (a) => a.status === 'annulé' && !estAReprogrammer(a) },"),
  CAR.includes("areprogrammer: { label: 'À reprogrammer', garde: (a) => estAReprogrammer(a) },"),
  BIL.includes("a.status === 'annulé' && !estAReprogrammer(a) && inMonth(a.date)"),
  PRE.includes("annules: passes.filter((a) => a.status === 'annulé' && !estAReprogrammer(a)).length"),
  SES.includes("annules: rdvs.filter((a) => a.status === 'annulé' && !estAReprogrammer(a)).length")]);
dit('Ma Couronne : « A reprogrammer », jamais barre comme une annulation', [true, true], [
  RVT.includes("{reporte ? t('À reprogrammer') : t(e.dit)}"), RVT.includes("${annulee && !reporte ? 'ab-rdvc--annulee' : ''}")]);

console.log(`\n${vus - ko}/${vus} epreuves : a reprogrammer.`);
if (ko) process.exit(1);
