/* CE QUI VA PARTIR, EPROUVE — 5 novembre 2026.
   `node scripts/verifie-ce-qui-va-partir.mjs` (et `--prouve`).

   Les demandes de Yeman (4 novembre 2026) : voir dans le Trone chaque modele
   Meta qui doit partir, a qui, quand, et pouvoir l'arreter ; combien de fois
   chaque modele a servi ; qu'Opale surveille ce qui part au fur et a mesure ;
   mettre un modele en pause. Ses choix sur la maquette v3 : un onglet
   « A venir » a cote de la salle, sept jours, « Ne pas envoyer » a la
   direction seule, la fidelite dedans.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases et des regles
   des fonctions (rappels-j1 : 18 h puis 19 h, jamais pour celle qui a dit
   « Oui, je viens », un message par foyer ; relances : J+1, J+3, J+7, J+14 a
   10 h, jamais le dimanche), jamais du code eprouve. Les regles tournent pour
   de vrai (arret-d-avance-pur, ce-qui-va-partir-pur, conseil-du-matin-pur) ;
   le facteur, les fonctions qui deposent, la migration, le Trone et la
   fonction modeles-meta se lisent dans leur source, a leurs ancres. Tout est
   invente : aucune cliente, aucun numero reel. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  NON_REMIS_EN_PAUSE_AU, NON_REMIS_SIGNALE_AU, arretEnVigueur, cleDuMessage, laPorteDAvance, ligneRetenueDAvance, momentDAvance,
  serieDeNonRemis, veilleDuModele, litLesArretsEtLesPauses,
} from '../src/shared/arret-d-avance-pur';
import { retenuParOpale } from '../src/shared/porte-des-modeles-pur';
import {
  GENRES_PREVUS, JOURS_A_VENIR, arretDit, ceQuiVaPartir, chiffresDesModeles, compteDeCeQuiVaPartir, dejaAuJournal, dernierPassageDePerle,
  estUnMessageDEssai, genrePrevu, heureDite, lignesDePerleAVenir, messagesDePerle, messagesSansLesEssais, modeleDit, parJour, peutSeRemettre,
  quiDit, rappelsDeLaVeille, relancesAVenir, relancesEnService, jourEnTitre, sortesAFiltrer,
  type EntreesDeCeQuiVaPartir, type MessagePrevu,
} from '../src/shared/ce-qui-va-partir-pur';
import { messagesMetaDuJour } from '../src/shared/conseil-du-matin-pur';
import { REGLES_PAR_DEFAUT } from '../src/shared/salle-des-envois';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
let n = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 220)}`));
};

const racine = process.cwd();
const disque = (rel: string): string => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const brut = (rel: string): string => {
  let s = disque(rel);
  if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
  return s;
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const egal = (s: string) => s.replace(/\s+/g, ' ');
const source = (rel: string): string => egal(sansCommentaires(brut(rel)));

/* ── Les fixtures : mercredi 4 novembre 2026, 21 h 40 a Cotonou ─────── */
const MAINTENANT = Date.parse('2026-11-04T20:40:00Z');
const A_17_30 = Date.parse('2026-11-04T16:30:00Z');
const A_18_30 = Date.parse('2026-11-04T17:30:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
/** L'instant d'une heure de Cotonou, ecrit en dur. */
const cot = (jour: string, h: number, m = 0) => Date.parse(`${jour}T${String(h - 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
const HEURES = { premier: 18, second: 19 };

const FICHES = [
  { id: 'c-awa', name: 'Awa Koffi', civilite: 'madame', phone: '0197000001' },
  { id: 'c-jade', name: 'Jade Banc', phone: '0197000002' },
  { id: 'c-faith', name: 'Faith Banc', phone: '0197000002' },
  { id: 'c-sans', name: 'Sans Numero' },
  { id: 'c-conf', name: 'Rose Conf', civilite: 'madame', phone: '0197000004' },
  { id: 'c-hon', name: 'Hono Re', phone: '0197000005' },
  { id: 'c-eve', name: 'Eve Essai', civilite: 'madame', phone: '0197000006' },
];
const RDVS = [
  { id: 'r-awa', clientId: 'c-awa', date: '2026-11-06', time: '14:00', status: 'confirmé' },
  { id: 'r-jade', clientId: 'c-jade', date: '2026-11-07', time: '10:00', status: 'confirmé', foyerId: 'f1' },
  { id: 'r-faith', clientId: 'c-faith', date: '2026-11-07', time: '10:30', status: 'confirmé', foyerId: 'f1' },
  { id: 'r-demain', clientId: 'c-awa', date: '2026-11-05', time: '09:00', status: 'confirmé' },
  { id: 'r-annule', clientId: 'c-awa', date: '2026-11-08', time: '09:00', status: 'annulé' },
  { id: 'r-honore', clientId: 'c-hon', date: '2026-11-08', time: '09:00', status: 'honoré' },
  { id: 'r-conf', clientId: 'c-conf', date: '2026-11-08', time: '11:00', status: 'confirmé', confirmeeParLaClienteLe: '2026-11-04T10:00:00Z' },
  { id: 'r-sans', clientId: 'c-sans', date: '2026-11-08', time: '12:00', status: 'confirmé' },
  { id: 'r-loin', clientId: 'c-awa', date: '2026-11-12', time: '10:00', status: 'confirmé' },
  { id: 'r-envoye', clientId: 'c-hon', date: '2026-11-09', time: '11:00', status: 'confirmé' },
  { id: 'r-echec', clientId: 'c-eve', date: '2026-11-09', time: '12:00', status: 'confirmé' },
];
const JOURNAL = [
  { id: 'env-r-envoye-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'r-envoye', statut: 'envoyé' },
  { id: 'env-r-echec-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'r-echec', statut: 'échec' },
];
const base = (o: Partial<EntreesDeCeQuiVaPartir> = {}): EntreesDeCeQuiVaPartir => ({
  maintenantMs: MAINTENANT, regles: REGLES_PAR_DEFAUT, heures: HEURES, rdvs: RDVS, fiches: FICHES, envois: JOURNAL, ...o,
});
const resume = (l: readonly MessagePrevu[]) => l.map((m) => [m.cle, m.jour, heureDite(m.partA)]);

/* ══ 1. LA CLE D'UN MESSAGE : la meme en prevision, en salle, au facteur ══ */
dit('la cle de chaque famille', [
  'rappel-j1:ap1', 'rappel-j1:ap1', 'confirmation:ap1', 'reprise-j3:ap1', 'point-apres:s1', 'point-avant:s2',
  'relance:inv1:2', 'relance:pt-c1-2026-11-02:1', 'relance:inv1-e3:2', 'echeance:sub1-e2-2026-11-07', 'prix-revu:sub1-2026-11-02-30000',
  'fete:k1:2026', 'avis:inv9', 'papier:inv8', 'campagne:cp1:c1', 'garder:ap2', 'anniv:c1:2026', 'perle:envie:c1:2026-11-06', 'ligne:x',
], [
  cleDuMessage({ id: 'env-ap1-whatsapp', type: 'rappel-j1', apptId: 'ap1' }), cleDuMessage({ id: 'env-ap1-sms', type: 'rappel-j1', apptId: 'ap1' }),
  cleDuMessage({ id: 'conf-ap1-whatsapp', type: 'confirmation', apptId: 'ap1' }), cleDuMessage({ id: 'rep3-ap1-whatsapp', type: 'reprise-j3', apptId: 'ap1' }),
  cleDuMessage({ id: 'pe-s1-apres-whatsapp', type: 'point-apres', apptId: '', seanceId: 's1' }), cleDuMessage({ id: 'pe-s2-avant-whatsapp', type: 'point-avant', apptId: 's2', seanceId: 's2' }),
  cleDuMessage({ id: 'rl-inv1-2-whatsapp', type: 'relance-facture', invoiceId: 'inv1', rang: 2 }),
  cleDuMessage({ id: 'rl-pt-c1-2026-11-02-1-whatsapp', type: 'relance-facture', invoiceId: '', rang: 1 }),
  cleDuMessage({ id: 'rl-inv1-e3-2-whatsapp', type: 'relance-facture', invoiceId: 'inv1', rang: 2 }),
  cleDuMessage({ id: 'rv-sub1-e2-2026-11-07-whatsapp', type: 'rappel-echeance' }), cleDuMessage({ id: 'pr-sub1-2026-11-02-30000-whatsapp', type: 'prix-revu' }),
  cleDuMessage({ id: 'fc-k1-2026-whatsapp', type: 'fete-de-couronne' }), cleDuMessage({ id: 'env-inv9-wa-avis', type: 'avis-google', invoiceId: 'inv9' }),
  cleDuMessage({ id: 'env-piece-inv8', type: 'papier-de-la-piece', invoiceId: 'inv8' }), cleDuMessage({ id: 'x', type: 'campagne', campagneId: 'cp1', clientId: 'c1' }),
  cleDuMessage({ id: 'gerard-2026-11-05-c1-whatsapp', type: 'gerard', genre: 'garder', apptId: 'ap2', clientId: 'c1' }),
  cleDuMessage({ id: 'gerard-2026-11-06-c1-whatsapp', type: 'gerard', genre: 'anniversaire', clientId: 'c1' }),
  cleDuMessage({ id: 'gerard-2026-11-06-c1-whatsapp', type: 'gerard', genre: 'envie', clientId: 'c1' }),
  cleDuMessage({ id: 'x', type: 'inconnu' }),
]);

/* ══ 2. LA PORTE D'AVANCE : l'arret de la direction, la pause d'un modele ══ */
const ARRET = { id: 'rappel-j1:ap1', cle: 'rappel-j1:ap1', arreteLe: '2026-11-04T20:40:00.000Z', arretePar: 'Yéman' };
const LIGNE_J1 = { id: 'env-ap1-whatsapp', type: 'rappel-j1', apptId: 'ap1', colis: { genre: 'whatsapp', modele: 'rappel_rdv' } };
dit('arrete : par qui, quand, l annee dite', { verdict: 'arrete', cle: 'rappel-j1:ap1', par: 'Yéman', le: '2026-11-04T20:40:00.000Z', motif: 'arrêté d’avance par Yéman, mercredi 4 novembre 2026 à 21 h 40' },
  laPorteDAvance(LIGNE_J1, { arrets: [ARRET] }));
dit('le SMS du meme rappel est arrete avec lui', 'arrete', laPorteDAvance({ id: 'env-ap1-sms', type: 'rappel-j1', apptId: 'ap1', colis: { genre: 'sms' } }, { arrets: [ARRET] })?.verdict);
dit('remis apres l arret : il part', null, laPorteDAvance(LIGNE_J1, { arrets: [{ ...ARRET, remisLe: '2026-11-04T20:45:00.000Z', remisPar: 'Yéman' }] }));
dit('arrete de nouveau apres avoir ete remis : arrete', 'arrete', laPorteDAvance(LIGNE_J1, { arrets: [{ ...ARRET, arreteLe: '2026-11-04T21:00:00.000Z', remisLe: '2026-11-04T20:45:00.000Z' }] })?.verdict);
dit('un arret d une autre cle ne touche rien', null, laPorteDAvance(LIGNE_J1, { arrets: [{ ...ARRET, id: 'rappel-j1:ap9', cle: 'rappel-j1:ap9' }] }));
const PAUSE = { id: 'rappel_rdv', modele: 'rappel_rdv', enPause: true, par: 'Brice', le: '2026-11-04T19:00:00.000Z' };
dit('modele en pause : il ne part pas', { verdict: 'en-pause', modele: 'rappel_rdv', motif: 'le modèle rappel_rdv est en pause (par Brice)' }, laPorteDAvance(LIGNE_J1, { pauses: [PAUSE] }));
dit('modele repris (enPause faux) : il part', null, laPorteDAvance(LIGNE_J1, { pauses: [{ ...PAUSE, enPause: false }] }));
dit('la pause ne touche pas un SMS', null, laPorteDAvance({ id: 'env-ap1-sms', type: 'rappel-j1', apptId: 'ap1', colis: { genre: 'sms', modele: 'rappel_rdv' } }, { pauses: [PAUSE] }));
const CONF = { id: 'conf-ap1-whatsapp', type: 'confirmation', apptId: 'ap1', colis: { genre: 'whatsapp', modele: 'confirmation_rdv_liens', repli: { modele: 'confirmation_rdv' } } };
dit('le modele a liens en pause : l ancien part a sa place', ['repli', 'confirmation_rdv'],
  [laPorteDAvance(CONF, { pauses: [{ modele: 'confirmation_rdv_liens', enPause: true }] })?.verdict, (laPorteDAvance(CONF, { pauses: [{ modele: 'confirmation_rdv_liens', enPause: true }] }) as { modele?: string })?.modele]);
dit('les deux en pause : rien ne part', 'en-pause', laPorteDAvance(CONF, { pauses: [{ modele: 'confirmation_rdv_liens', enPause: true }, { modele: 'confirmation_rdv', enPause: true }] })?.verdict);
dit('mis en pause par Opale : il le dit', 'le modèle fin_de_paquet est en pause (mis en pause par Opale)',
  (laPorteDAvance({ id: 'x', type: 'fin-de-paquet', colis: { genre: 'whatsapp', modele: 'fin_de_paquet' } }, { pauses: [{ modele: 'fin_de_paquet', enPause: true, par: 'Opale', parOpale: true }] }) as { motif?: string })?.motif);
const vArret = laPorteDAvance(LIGNE_J1, { arrets: [ARRET] });
const vPause = laPorteDAvance(LIGNE_J1, { pauses: [PAUSE] });
dit('arretee : « ecarte », par qui, la cle gardee', { statut: 'écarté', ecartePar: 'Yéman', ecarteLe: iso(MAINTENANT), detail: 'arrêté d’avance par Yéman, mercredi 4 novembre 2026 à 21 h 40', arretDAvance: { cle: 'rappel-j1:ap1', par: 'Yéman', le: '2026-11-04T20:40:00.000Z' } },
  vArret ? ligneRetenueDAvance(vArret, iso(MAINTENANT)) : null);
const retenue = vPause ? ligneRetenueDAvance(vPause, iso(MAINTENANT)) : null;
dit('en pause : « perime », retenu par Opale (les fonctions ne la redeposent pas)', ['périmé', true], [retenue?.statut, retenuParOpale(retenue as { detail?: unknown })]);
dit('un repli n ecrit rien : la ligne part', null, ligneRetenueDAvance({ verdict: 'repli', modele: 'confirmation_rdv', motif: '' }, iso(MAINTENANT)));
dit('l heure de l arret, a Cotonou, le 1er du mois', ['mercredi 4 novembre 2026 à 21 h 40', 'dimanche 1er novembre 2026 à 8 h', ''],
  [momentDAvance('2026-11-04T20:40:00Z'), momentDAvance('2026-11-01T07:00:00Z'), momentDAvance('pas une date')]);
dit('l arret en vigueur se trouve aussi par son identifiant', 'rappel-j1:ap1', arretEnVigueur('rappel-j1:ap1', [{ id: 'rappel-j1:ap1', arreteLe: '2026-11-04T20:40:00Z' }])?.id);

/* La lecture au depot : une table absente ou en panne n'arrete rien (le facteur, lui, ne laisse rien partir sans elle). */
{
  const sbOk = { from: (t: string) => ({ select: () => ({ range: async () => ({ data: t === 'envois_arretes' ? [{ id: 'k1', data: { cle: 'k1', arreteLe: 'x' } }] : [{ id: 'm1', data: { modele: 'm1', enPause: true } }], error: null }) }) }) };
  const sbKo = { from: () => ({ select: () => ({ range: async () => ({ data: null, error: { message: 'panne' } }) }) }) };
  const lu = await litLesArretsEtLesPauses(sbOk);
  const rate = await litLesArretsEtLesPauses(sbKo);
  dit('la lecture au depot : les arrets et les pauses, chacun avec son identifiant ; en panne, rien', [['k1'], ['m1'], 0, 0],
    [lu.arrets.map((a) => a.id), lu.pauses.map((p) => p.id), rate.arrets.length, rate.pauses.length]);
}

/* ══ 3. OPALE VEILLE : la serie des « non remis » ══ */
const msg = (etat: string, h: number, sens = 'sortant') => ({ sens, etat, quand: iso(MAINTENANT - h * 3_600_000) });
dit('la serie se compte du plus recent, un remis l arrete', 2, serieDeNonRemis([msg('non-remis', 1), msg('non-remis', 2), msg('lu', 3), msg('non-remis', 4)]));
dit('un message en route ne compte ni pour ni contre, un entrant non plus', 3, serieDeNonRemis([msg('en-route', 0.5), msg('non-remis', 1), msg('non-remis', 2), msg('lu', 2.5, 'entrant'), msg('non-remis', 3), msg('remis', 9)]));
dit('le desordre de lecture ne change rien', 2, serieDeNonRemis([msg('lu', 5), msg('non-remis', 1), msg('non-remis', 2)]));
dit('signale au 2e, en pause au 5e', [2, 5, 'rien', 'signale', 'signale', 'pause', 'pause'],
  [NON_REMIS_SIGNALE_AU, NON_REMIS_EN_PAUSE_AU, veilleDuModele(1), veilleDuModele(2), veilleDuModele(4), veilleDuModele(5), veilleDuModele(25)]);

/* ══ 4. LE RAPPEL DE LA VEILLE PREVU (la regle de rappels-j1) ══ */
const rappels = rappelsDeLaVeille(base());
dit('a 21 h 40 : les passages du soir sont faits, rien pour demain ; Awa la veille a 18 h 10 ; le foyer en un message ; un echec se retente',
  [['rappel-j1:r-awa', '2026-11-05', '18 h 10'], ['rappel-j1:r-jade', '2026-11-06', '18 h 10'], ['rappel-j1:r-echec', '2026-11-08', '18 h 10']], resume(rappels));
const jade = rappels.find((m) => m.cle === 'rappel-j1:r-jade');
dit('le foyer : un message au numero du foyer, qui nomme les deux', [['c-jade', 'c-faith'], 'Bonjour Jade et Faith, petit rappel de la maison : votre rendez-vous est prévu demain à 10 h.'],
  [jade?.clientIds, jade?.texte]);
const awa = rappels.find((m) => m.cle === 'rappel-j1:r-awa');
dit('Awa : sa civilite, l annee, le modele et sa sorte', ['Bonjour Mme Awa, petit rappel de la maison : votre rendez-vous est prévu demain à 14 h.', 'Son rendez-vous du vendredi 6 novembre 2026 à 14 h.', 'rappel_rdv', 'Rappel de la veille', 'rdv', 'env-r-awa-whatsapp'],
  [awa?.texte, awa?.raison, awa?.modele, awa?.modeleDit, awa?.sorte, awa?.idDeLigne]);
dit('a 17 h 30 : le rendez-vous de demain partira a 18 h 10 aujourd hui', ['2026-11-04', '18 h 10'],
  ((m) => [m?.jour, m ? heureDite(m.partA) : null])(rappelsDeLaVeille(base({ maintenantMs: A_17_30 })).find((x) => x.cle === 'rappel-j1:r-demain')));
dit('a 18 h 30 : le second passage, 19 h 10', '19 h 10', ((m) => (m ? heureDite(m.partA) : null))(rappelsDeLaVeille(base({ maintenantMs: A_18_30 })).find((x) => x.cle === 'rappel-j1:r-demain')));
dit('a 18 h 30 sans second passage : plus rien pour demain', false, rappelsDeLaVeille(base({ maintenantMs: A_18_30, heures: { premier: 18, second: null } })).some((x) => x.cle === 'rappel-j1:r-demain'));
dit('un rappel qui partirait le jour meme (19 h et une heure de salle) n est pas prevu', 0,
  rappelsDeLaVeille(base({ maintenantMs: A_17_30, heures: { premier: 19, second: null }, regles: { salleMin: 60, calmeDe: 20, calmeA: 8 } })).length);
dit('heure de depart : l instant ecrit en dur', cot('2026-11-05', 18, 10), awa?.partA);

/* ══ 5. LES RELANCES PREVUES (la regle de relances-factures) ══ */
const REGLAGES = { relances: { actives: true, depuis: '2026-10-01' }, mndPay: { actif: true } };
const facture = (id: string, clientId: string, date: string, o: Record<string, unknown> = {}) => ({ id, kind: 'facture', status: 'envoyée', date, creeeLe: `${date}T10:00:00Z`, clientId, ...o });
const RESTES: Record<string, number> = { 'inv-1': 10000, 'inv-2': 5000, 'inv-pause': 3000, 'inv-payee': 0, 'inv-ancienne': 8000 };
const PIECES = [
  facture('inv-1', 'c-awa', '2026-11-04'), facture('inv-2', 'c-eve', '2026-11-07'),
  facture('inv-pause', 'c-hon', '2026-11-04', { relancesPause: { le: '2026-11-04T12:00:00Z' } }), facture('inv-payee', 'c-jade', '2026-11-04'),
  facture('inv-ancienne', 'c-conf', '2026-11-03'),
];
const avecRelances = (o: Partial<EntreesDeCeQuiVaPartir> = {}) => base({
  rdvs: [], envois: [], relances: { enService: relancesEnService(REGLAGES), reglages: REGLAGES.relances, pieces: PIECES, familles: [], resteDe: (p) => RESTES[p.id] ?? 0 }, ...o,
});
dit('les relances en service : allumees, un lancement, Tap & Go en marche', [true, false, false, false],
  [relancesEnService(REGLAGES), relancesEnService({ relances: { actives: true, depuis: '2026-10-01' }, mndPay: { actif: false } }),
    relancesEnService({ relances: { actives: false, depuis: '2026-10-01' }, mndPay: { actif: true } }),
    relancesEnService({ relances: { actives: true, depuis: '2026-10-01' }, mndPay: { actif: true, tapgo: { actif: false } } })]);
dit('J+1 et J+3 a 10 h 10 ; jamais le dimanche (lundi) ; la tournee de 10 h passee, demain ; rien en pause ni pour une facture reglee', [
  ['relance:inv-1:1', '2026-11-05', '10 h 10'], ['relance:inv-ancienne:1', '2026-11-05', '10 h 10'], ['relance:inv-ancienne:2', '2026-11-06', '10 h 10'],
  ['relance:inv-1:2', '2026-11-07', '10 h 10'], ['relance:inv-2:1', '2026-11-09', '10 h 10'], ['relance:inv-2:2', '2026-11-10', '10 h 10'],
  ['relance:inv-ancienne:3', '2026-11-10', '10 h 10'],
], resume([...relancesAVenir(avecRelances())].sort((a, b) => a.partA - b.partA || a.cle.localeCompare(b.cle))));
dit('le modele, son rang dit, a qui, la raison avec l annee', ['rappel_de_reglement', 'Relance de facture, J+1', 'c-awa', 'Facture du mercredi 4 novembre 2026 : il reste 10 000 F.'],
  ((m) => [m?.modele, m?.modeleDit, m?.clientId, m?.raison?.replace(/ /g, ' ')])(relancesAVenir(avecRelances()).find((x) => x.cle === 'relance:inv-1:1')));
{
  /* Samedi 7 novembre 2026, 21 h 40 : la relance du jour a manque la tournee ; demain est un dimanche, elle part lundi. */
  const SAMEDI = Date.parse('2026-11-07T20:40:00Z');
  const vendredi = facture('inv-ven', 'c-awa', '2026-11-06');
  dit('la relance reportee au lendemain ne tombe jamais un dimanche : lundi ; la suivante le lendemain, J+7 a son jour', [
    ['relance:inv-ven:1', '2026-11-09', '10 h 10'], ['relance:inv-ven:2', '2026-11-10', '10 h 10'], ['relance:inv-ven:3', '2026-11-13', '10 h 10']],
    resume(relancesAVenir(avecRelances({ maintenantMs: SAMEDI, relances: { enService: true, reglages: REGLAGES.relances, pieces: [vendredi], familles: [], resteDe: () => 4000 } }))));
}
dit('hors service : aucune relance prevue', 0, relancesAVenir(avecRelances({ relances: { enService: false, reglages: REGLAGES.relances, pieces: PIECES, familles: [], resteDe: (p) => RESTES[p.id] ?? 0 } })).length);

/* ══ 6. PERLE : ses lignes, telles que son cerveau les depose ══ */
const PERLE = [
  { jour: '2026-11-05', lignes: [
    { id: 'gerard-2026-11-05-c-awa-whatsapp', type: 'gerard' as const, genre: 'garder', clientId: 'c-awa', apptId: 'r-g', dateRdv: '2026-11-07', heure: '10:00', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_garder', texteAuFil: 'Bonjour Mme Awa, petit rappel de la Maison.' } },
    { id: 'gerard-2026-11-05-c-jade-push', type: 'gerard' as const, genre: 'envie', clientId: 'c-jade', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'push' } },
  ] },
  { jour: '2026-11-06', lignes: [
    { id: 'gerard-2026-11-06-c-eve-whatsapp', type: 'gerard' as const, genre: 'anniversaire', clientId: 'c-eve', partA: iso(cot('2026-11-06', 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_carte_anniversaire' } },
    { id: 'gerard-2026-11-06-c-awa-whatsapp', type: 'gerard' as const, genre: 'envie', clientId: 'c-awa', partA: iso(cot('2026-11-06', 8, 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_envie' } },
  ] },
  { jour: '2026-11-07', lignes: [
    { id: 'gerard-2026-11-07-c-awa-whatsapp', type: 'gerard' as const, genre: 'envie', clientId: 'c-awa', partA: iso(cot('2026-11-07', 8, 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_envie' } },
  ] },
];
const perle = messagesDePerle(base({ perle: PERLE }));
dit('Perle : garder, la carte a 10 h, une envie une seule fois ; la notification n est pas un modele Meta', [
  ['garder:r-g', '2026-11-05', '8 h 10'], ['anniv:c-eve:2026', '2026-11-06', '10 h'], ['perle:envie:c-awa:2026-11-06', '2026-11-06', '8 h 10'],
], resume(perle));
dit('garder : sorte rendez-vous, sa raison avec l annee ; la carte : fidelite', [['rdv', 'perle-garder', 'Son rendez-vous du samedi 7 novembre 2026 à 10 h, pas encore confirmé.'], ['fidelite', 'Son anniversaire, vendredi 6 novembre 2026.', 'Carte d’anniversaire']],
  [[perle[0]?.sorte, perle[0]?.famille, perle[0]?.raison], [perle[1]?.sorte, perle[1]?.raison, perle[1]?.modeleDit]]);
dit('le dernier passage de Perle lu au journal', '2026-11-04', dernierPassageDePerle([{ id: 'gerard-2026-11-03-c1-whatsapp' }, { id: 'gerard-2026-11-04-c2-push' }, { id: 'env-x' }]));
{
  const entrees = {
    branche: { id: 'b1', seats: 2 }, clients: [], rdvs: [], prestations: new Map(), signalements: [], abonnes: new Set<string>(), envois: [], messages: [], pieces: [],
    blocages: [], familles: [], cartes: [], codes: [], reglagesGerard: { mode: 'ouvert' }, ouverture: () => ({ closed: false, openMin: 540, closeMin: 1140 }),
  } as unknown as Parameters<typeof lignesDePerleAVenir>[0]['entrees'];
  const jours = (ms: number, fait: string | null) => lignesDePerleAVenir({ entrees, maintenantMs: ms, regles: REGLES_PAR_DEFAUT, passageFaitLe: fait }).map((j) => j.jour);
  dit('le cerveau rejoue : aujourd hui seulement si son passage n est pas fait et avant 20 h, puis jusqu a J+6', [
    ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'],
    ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'],
    ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'],
  ], [jours(A_17_30, null), jours(A_17_30, '2026-11-04'), jours(MAINTENANT, null)]);
}

/* ══ 7. CE QUI VA PARTIR : la liste entiere, ce que la porte en dira ══ */
const SALLE = { id: 'conf-r-x-whatsapp', type: 'confirmation', canal: 'whatsapp', apptId: 'r-x', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-10', heure: '09:00', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'whatsapp', modele: 'confirmation_rdv', texteAuFil: 'Bonjour Mme Awa, c’est confirmé.' } };
const ECARTEE = { id: 'rl-inv-z-1-whatsapp', type: 'relance-facture', canal: 'whatsapp', clientId: 'c-hon', statut: 'écarté', arretDAvance: { cle: 'relance:inv-z:1', par: 'Brice', le: '2026-11-04T18:00:00.000Z' }, partA: iso(cot('2026-11-05', 10, 10)), colis: { genre: 'whatsapp', modele: 'rappel_de_reglement' } };
const PARTIE = { id: 'gerard-2026-11-04-c-eve-whatsapp', type: 'gerard', genre: 'envie', canal: 'whatsapp', clientId: 'c-eve', statut: 'envoyé', partA: iso(cot('2026-11-04', 8, 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_envie' } };
const tout = ceQuiVaPartir(base({
  envois: [...JOURNAL, SALLE, ECARTEE, PARTIE],
  relances: { enService: true, reglages: REGLAGES.relances, pieces: [facture('inv-1', 'c-awa', '2026-11-04')], familles: [], resteDe: () => 10000 },
  perle: PERLE,
  arrets: [ARRET, { ...ARRET, id: 'rappel-j1:r-awa', cle: 'rappel-j1:r-awa' }, { id: 'rappel-j1:r-jade', cle: 'rappel-j1:r-jade', arreteLe: '2026-11-04T20:00:00Z', arretePar: 'Yéman', remisLe: '2026-11-04T20:10:00Z' }],
  pauses: [{ modele: 'assistant_maison_envie', enPause: true, par: 'Yéman' }],
}));
dit('triee par heure (a heure egale, par cle), chaque message une fois, son etat ; ce qui est parti n y est plus', [
  ['confirmation:r-x', 'en-salle'], ['garder:r-g', 'prevu'], ['relance:inv-1:1', 'prevu'], ['relance:inv-z:1', 'arrete'], ['rappel-j1:r-awa', 'arrete'],
  ['perle:envie:c-awa:2026-11-06', 'en-pause'], ['anniv:c-eve:2026', 'prevu'], ['rappel-j1:r-jade', 'prevu'], ['relance:inv-1:2', 'prevu'], ['rappel-j1:r-echec', 'prevu'],
], tout.map((m) => [m.cle, m.etat]));
dit('l ordre des heures tient', true, tout.every((m, i) => i === 0 || tout[i - 1].partA <= m.partA));
const arretee = tout.find((m) => m.cle === 'rappel-j1:r-awa');
dit('arretee : qui, quand, ce que l ecran dit ; se remet tant que son heure n est pas passee', ['Yéman', 'Ne partira pas · arrêté par Yéman, mercredi 4 novembre 2026 à 21 h 40.', true, false],
  [arretee?.arret?.par, arretDit(arretee?.arret), arretee ? peutSeRemettre(arretee, MAINTENANT) : null, arretee ? peutSeRemettre(arretee, cot('2026-11-05', 18, 11)) : null]);
dit('le compte de l en-tete', { partiront: 7, arretes: 2, enPause: 1, aVerifier: 0 }, compteDeCeQuiVaPartir(tout));
const jours = parJour(tout, MAINTENANT);
dit('sept jours, meme vides, dits avec l annee', [7, 'Aujourd’hui, mercredi 4 novembre 2026', 'Demain, jeudi 5 novembre 2026', 'Mardi 10 novembre 2026', 0],
  [jours.length, jours[0].titre, jours[1].titre, jours[6].titre, jours[0].messages.length]);
dit('jamais au-dela de sept jours', [7, false], [JOURS_A_VENIR, tout.some((m) => m.jour > '2026-11-10')]);
dit('le titre d un jour', 'Samedi 7 novembre 2026', jourEnTitre('2026-11-07', '2026-11-04'));
dit('a l ecran : le nom pour la direction, les initiales pour l equipe', ['Awa Koffi', 'A. K.', 'Une cliente'], [quiDit('Awa Koffi', true), quiDit('Awa Koffi', false), quiDit('', false)]);

/* ══ 8. LES MODELES META, COMBIEN DE FOIS ══ */
const FIL = [
  { sens: 'sortant', modele: 'confirmation_rdv', etat: 'lu', quand: '2026-11-04T10:00:00Z' },
  { sens: 'sortant', modele: 'confirmation_rdv', etat: 'remis', quand: '2026-11-03T10:00:00Z' },
  { sens: 'sortant', modele: 'confirmation_rdv', etat: 'non-remis', quand: '2026-10-20T10:00:00Z' },
  { sens: 'sortant', modele: 'fin_de_paquet', etat: 'non-remis', quand: '2026-10-27T10:00:00Z' },
  { sens: 'sortant', modele: 'fin_de_paquet', etat: 'non-remis', quand: '2026-10-26T10:00:00Z' },
  { sens: 'entrant', modele: 'fin_de_paquet', etat: 'lu', quand: '2026-10-28T10:00:00Z' },
  { sens: 'sortant', etat: 'lu', quand: '2026-11-04T11:00:00Z' },
];
dit('envoyes, en novembre, lus, non remis, dernier, serie, veille ; un approuve jamais parti a zero', [
  { modele: 'confirmation_rdv', envoyes: 3, ceMois: 2, lus: 1, nonRemis: 1, dernier: '2026-11-04T10:00:00.000Z', serie: 0, veille: 'rien' },
  { modele: 'fin_de_paquet', envoyes: 2, ceMois: 0, lus: 0, nonRemis: 2, dernier: '2026-10-27T10:00:00.000Z', serie: 2, veille: 'signale' },
  { modele: 'assistant_maison_avant', envoyes: 0, ceMois: 0, lus: 0, nonRemis: 0, dernier: null, serie: 0, veille: 'rien' },
], chiffresDesModeles(FIL, MAINTENANT, ['assistant_maison_avant', 'confirmation_rdv']));

/* ══ 9. LE MOT DE 7 H : ce qui part, ce qu'Opale a retenu ══ */
dit('le mot d Opale dans le Conseil du matin', [
  'Messages Meta : 4 rappels de la veille partiront ce soir dès 18 h, 2 messages attendent déjà en salle.',
  'Opale a retenu 3 messages depuis hier : 2 déjà partis, 1 conversation ouverte.',
  '1 message arrêté d\'avance par la direction depuis hier.', 'En pause : fin_de_paquet.',
], messagesMetaDuJour({
  rappelsDuSoir: 4, heureDuRappel: 18, enSalle: 2, arretes: 1,
  retenus: ['retenu par Opale : déjà parti : le même message', 'retenu par Opale : déjà parti : le même modèle', 'retenu par Opale : elle a écrit depuis le dépôt'],
  enPause: [{ modele: 'fin_de_paquet', parOpale: true }, { modele: 'Awa Koffi 0197' }],
}));

/* ══ 9 bis. LA REPRISE DU 8 NOVEMBRE 2026 : tout ce qui attend en salle, le registre des genres,
   les fiches d'essai ecartees, Opale relit, le prenom d'usage, un modele inconnu compte ══ */
dit('le registre declare d avance le lot 4 de l abonnement refait : libelle, modele, sorte', [
  ['Rappel de la veille · l’attention', 'rappel_rdv_attention', 'rdv'], ['Après la séance · prochaine séance', 'prochaine_seance', 'avis'],
], [
  [GENRES_PREVUS['veille-attention'].dit, GENRES_PREVUS['veille-attention'].modele, GENRES_PREVUS['veille-attention'].sorte],
  [GENRES_PREVUS['apres-seance'].dit, GENRES_PREVUS['apres-seance'].modele, GENRES_PREVUS['apres-seance'].sorte],
]);
dit('un genre inconnu : son nom technique, la sorte « autre », jamais une erreur ; un genre du journal, son mot', ['genre-neuf', 'autre', 'Déposé dans la salle d’attente.', 'Papier de la pièce, par Grenat'],
  [genrePrevu('genre-neuf').dit, genrePrevu('genre-neuf').sorte, genrePrevu('genre-neuf').raison({ id: 'x' }), genrePrevu('papier-de-la-piece').dit]);
dit('les filtres : les quatre sortes de la maquette, « Autre » seulement quand la liste en a', [['rdv', 'avis', 'argent', 'fidelite'], ['rdv', 'avis', 'argent', 'fidelite', 'autre']],
  [sortesAFiltrer([{ sorte: 'rdv' }]).map(([k]) => k), sortesAFiltrer([{ sorte: 'rdv' }, { sorte: 'autre' }]).map(([k]) => k)]);
const EN_SALLE_DE_TOUT_GENRE = [
  { id: 'conf-r-awa-push', type: 'confirmation', canal: 'push', apptId: 'r-awa', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-06', heure: '14:00', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'push' } },
  { id: 'paie-ref1-whatsapp', type: 'paie-recue', canal: 'whatsapp', statut: 'en-attente', prenom: 'Nadia', partA: iso(cot('2026-11-05', 9)), colis: { genre: 'whatsapp', modele: 'versement_engagement', texteAuFil: 'Bonjour, la Maison vous a versé votre paie.' } },
  { id: 'neuf-1', type: 'genre-neuf', canal: 'whatsapp', clientId: 'c-awa', statut: 'retenu', partA: iso(cot('2026-11-05', 9, 30)), colis: { genre: 'whatsapp', modele: 'modele_neuf' } },
  { id: 'va-r-jade-whatsapp', type: 'veille-attention', canal: 'whatsapp', apptId: 'r-jade', clientId: 'c-jade', statut: 'en-attente', dateRdv: '2026-11-07', heure: '10:00', partA: iso(cot('2026-11-06', 18, 10)), colis: { genre: 'whatsapp', modele: 'rappel_rdv_attention' } },
  { id: 'env-piece-inv8', type: 'papier-de-la-piece', canal: 'whatsapp', invoiceId: 'inv8', clientId: 'c-hon', statut: 'à-préparer', papier: 'facture', partA: iso(cot('2026-11-05', 10)), colis: { genre: 'whatsapp', modele: 'facture_du_rituel' } },
  { id: 'sms-r-awa', type: 'rappel-j1', canal: 'sms', apptId: 'r-awa', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-06', heure: '14:00', partA: iso(cot('2026-11-05', 18, 10)), colis: { genre: 'sms' } },
  { id: 'gerard-2026-11-05-c-awa-whatsapp', type: 'gerard', genre: 'garder', canal: 'whatsapp', apptId: 'r-awa', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-06', heure: '14:00', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'whatsapp', modele: 'assistant_maison_garder' } },
  { id: 'parti-1', type: 'confirmation', canal: 'whatsapp', apptId: 'r-x', clientId: 'c-awa', statut: 'envoyé', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'whatsapp', modele: 'confirmation_rdv' } },
];
dit('la salle, quel que soit le genre : notification, paie, genre inconnu, lot 4, papier de Grenat, SMS, Perle (le modele dit mieux) ; ce qui est parti n y est pas', [
  ['confirmation:r-awa', 'Confirmation du rendez-vous · Ma Couronne', '', 'rdv', 'Son rendez-vous du vendredi 6 novembre 2026 à 14 h.', 'c-awa', null, 'en-salle'],
  ['ligne:paie-ref1-whatsapp', 'Paie versée (équipe)', 'versement_engagement', 'autre', 'Sa paie est partie : lui demander s’il l’a bien reçue.', '', 'Nadia', 'en-salle'],
  ['ligne:neuf-1', 'genre-neuf', 'modele_neuf', 'autre', 'Déposé dans la salle d’attente.', 'c-awa', null, 'en-salle'],
  ['ligne:va-r-jade-whatsapp', 'Rappel de la veille · l’attention', 'rappel_rdv_attention', 'rdv', 'Son rendez-vous du samedi 7 novembre 2026 à 10 h ; une attention l’y attend.', 'c-jade', null, 'en-salle'],
  ['papier:inv8', 'Papier de la pièce, par Grenat', 'facture_du_rituel', 'argent', 'Sa facture à régler, préparée par Grenat.', 'c-hon', null, 'en-salle'],
  ['rappel-j1:r-awa', 'Rappel de la veille · SMS', '', 'rdv', 'Son rendez-vous du vendredi 6 novembre 2026 à 14 h.', 'c-awa', null, 'en-salle'],
  ['garder:r-awa', 'Petit rappel, deux jours avant', 'assistant_maison_garder', 'rdv', 'L’Assistant Maison.', 'c-awa', null, 'en-salle'],
], dejaAuJournal(base({ envois: EN_SALLE_DE_TOUT_GENRE })).map((m) => [m.cle, m.modeleDit, m.modele, m.sorte, m.raison, m.clientId, m.qui ?? null, m.etat]));
dit('a l ecran, qui recoit sans fiche : le prenom de la ligne, en initiale pour l equipe', ['Nadia', 'N.'], [quiDit('Nadia', true), quiDit('Nadia', false)]);
/* Les fiches d'essai : par la fiche (Eve), par le rendez-vous (celui d'Awa). */
const ESSAIS = { fiches: new Set(['c-eve']), rdvs: new Set(['r-awa']) };
const sansEssais = ceQuiVaPartir(base({
  envois: [...JOURNAL, SALLE, PARTIE],
  relances: { enService: true, reglages: REGLAGES.relances, pieces: [facture('inv-1', 'c-awa', '2026-11-04'), facture('inv-2', 'c-eve', '2026-11-07')], familles: [], resteDe: () => 10000 },
  perle: PERLE, essais: ESSAIS,
}));
dit('les fiches d essai n y sont pas : ni le rappel d Eve, ni sa carte, ni sa relance, ni le rendez-vous d essai d Awa', [
  'confirmation:r-x', 'garder:r-g', 'relance:inv-1:1', 'perle:envie:c-awa:2026-11-06', 'rappel-j1:r-jade', 'relance:inv-1:2',
], sansEssais.map((m) => m.cle));
dit('... la regle, seule : la fiche, une tete du foyer, le rendez-vous ; rien sans essais declares', [true, true, true, false, false], [
  estUnMessageDEssai({ clientId: 'c-eve' }, ESSAIS), estUnMessageDEssai({ clientId: 'c-jade', clientIds: ['c-eve'] }, ESSAIS), estUnMessageDEssai({ clientId: 'c-awa', apptId: 'r-awa' }, ESSAIS),
  estUnMessageDEssai({ clientId: 'c-awa', apptId: 'r-jade' }, ESSAIS), estUnMessageDEssai({ clientId: 'c-eve' }, undefined)]);
dit('le fil sans les fiches d essai : par la fiche, ou par son numero ecrit autrement', ['wa-ok'], messagesSansLesEssais([
  { id: 'wa-ok', sens: 'sortant', modele: 'rappel_rdv', numero: '22901970000001' },
  { id: 'wa-fiche', sens: 'sortant', modele: 'rappel_rdv', clientId: 'c-eve' },
  { id: 'wa-numero', sens: 'sortant', modele: 'rappel_rdv', numero: '+229 01 97 00 00 06' },
], [{ id: 'c-eve', phone: '0197000006' }]).map((m) => m.id));
/* Opale relit : le rendez-vous d'une ligne en salle, la confirmation deja recue, le meme modele depuis moins de 20 h. */
const DOUTES = [
  { id: 'env-r-awa-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'r-awa', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-05', heure: '14:00', partA: iso(cot('2026-11-05', 18, 10)), colis: { genre: 'whatsapp', modele: 'rappel_rdv' } },
  { id: 'env-r-conf-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'r-conf', clientId: 'c-conf', statut: 'en-attente', dateRdv: '2026-11-08', heure: '11:00', partA: iso(cot('2026-11-07', 18, 10)), colis: { genre: 'whatsapp', modele: 'rappel_rdv' } },
  { id: 'conf-r-annule-whatsapp', type: 'confirmation', canal: 'whatsapp', apptId: 'r-annule', clientId: 'c-awa', statut: 'en-attente', dateRdv: '2026-11-08', heure: '09:00', partA: iso(cot('2026-11-05', 8, 10)), colis: { genre: 'whatsapp', modele: 'confirmation_rdv' } },
  { id: 'env-r-jade2-whatsapp', type: 'rappel-j1', canal: 'whatsapp', apptId: 'r-jade2', clientId: 'c-jade', statut: 'envoyé', quand: iso(cot('2026-11-06', 16)), colis: { genre: 'whatsapp', modele: 'rappel_rdv' } },
];
const doutes = ceQuiVaPartir(base({ envois: [...JOURNAL, ...DOUTES] }));
const douteDe = (cle: string) => doutes.find((m) => m.cle === cle)?.aVerifier ?? null;
dit('Opale relit : le rendez-vous a bouge, elle a deja confirme, le rendez-vous ne tient plus, le meme modele parti depuis moins de 20 h ; rien sur les autres', [
  'le rendez-vous a bougé : vendredi 6 novembre 2026 à 14 h', 'elle a déjà confirmé sa venue', 'le rendez-vous ne tient plus (annulé)', 'le même modèle lui est parti depuis moins de 20 h', null,
], [douteDe('rappel-j1:r-awa'), douteDe('rappel-j1:r-conf'), douteDe('confirmation:r-annule'), douteDe('rappel-j1:r-jade'), douteDe('rappel-j1:r-echec')]);
dit('... un doute n arrete rien : la ligne reste prevue ou en salle, et l en-tete les compte', [['en-salle', 'prevu'], 4],
  [[doutes.find((m) => m.cle === 'rappel-j1:r-awa')?.etat, doutes.find((m) => m.cle === 'rappel-j1:r-jade')?.etat], compteDeCeQuiVaPartir(doutes).aVerifier]);
/* Le prenom d'usage (7 novembre 2026), note ou devine, en entier. */
const FICHES_PRENOM = [
  { id: 'c-am', name: 'Anne Marie Dossou', prenomUsage: 'Anne-Marie', civilite: 'madame', phone: '0197000011' },
  { id: 'c-mg', name: 'Marie Gisèle Koffi', civilite: 'madame', phone: '0197000012' },
];
const RDVS_PRENOM = [
  { id: 'r-am', clientId: 'c-am', date: '2026-11-06', time: '09:00', status: 'confirmé' },
  { id: 'r-mg', clientId: 'c-mg', date: '2026-11-06', time: '11:00', status: 'confirmé' },
];
dit('le prenom d usage, note ou devine, ecrit en entier dans le rappel', [
  'Bonjour Mme Anne-Marie, petit rappel de la maison : votre rendez-vous est prévu demain à 9 h.',
  'Bonjour Mme Marie Gisèle, petit rappel de la maison : votre rendez-vous est prévu demain à 11 h.',
], rappelsDeLaVeille(base({ fiches: FICHES_PRENOM, rdvs: RDVS_PRENOM, envois: [] })).map((m) => m.texte));
/* Un modele que le code ne connait pas encore se compte depuis le fil, sous son nom. */
dit('un modele inconnu du code se compte depuis le fil, sous son nom technique', [['modele_inconnu_du_code', 1, 'modele_inconnu_du_code']],
  chiffresDesModeles([{ sens: 'sortant', modele: 'modele_inconnu_du_code', etat: 'remis', quand: '2026-11-04T10:00:00Z' }], MAINTENANT).map((l) => [l.modele, l.envoyes, modeleDit(l.modele)]));

/* ══ 10. LE FACTEUR (envois-partent), lu a ses ancres ══ */
const EP = 'supabase/functions/envois-partent/index.ts';
const ep = source(EP);
dit('le facteur lit les arrets et les pauses une fois par reveil', true, ep.includes("const avance = aPorter.length > 0 ? await litLAvance(sb) : { arrets: [], pauses: [] };"));
dit('une lecture en panne : la ligne devient un echec, rien ne part sans la porte', true,
  ep.includes("if (!avance) { await ecris({ statut: 'échec', detail: 'la porte d’Opale n’a pas pu lire les arrêts et les pauses' }); echecs++; continue; }"));
const iAvance = ep.indexOf('const dAvance = laPorteDAvance(devant, avance);');
const iPorte = ep.indexOf("if (quellePorte(devant) !== 'aucune') {");
const iRelu = ep.indexOf('const motif = pourquoiIlNePartPlus(repris ?? l.data, rdv, Date.now());');
dit('la porte d avance juge apres la relecture du rendez-vous, avant toutes les autres regles', true, iRelu > 0 && iAvance > iRelu && iPorte > iAvance);
dit('arretee : ecrite « ecarte », son colis et son heure gardes', true,
  ep.includes("await ecris(dAvance.verdict === 'arrete' ? { ...retenue, colis: colisDepose, partA: l.data.partA } : retenue);"));
dit('le repli part sous l ancien modele', true, ep.includes('colis = { ...colis, modele: colis.repli.modele, composants: colis.repli.composants,'));
dit('Opale met en pause au 5e non remis de suite, depuis sa reprise', [true, true, true], [
  ep.includes("if (typeof serie === 'number' && veilleDuModele(serie) === 'pause') {"),
  ep.includes("const pause: PauseDuModele = { id: m, modele: m, enPause: true, par: 'Opale', le: new Date().toISOString(), parOpale: true,"),
  ep.includes('const depuis = Math.max(Date.now() - VEILLE_DES_NON_REMIS_MS, Number.isFinite(reprise) ? reprise : 0);'),
]);
dit('une table encore absente (0197 pas passee) laisse porter comme avant', true, ep.includes("e.code === '42P01' || e.code === 'PGRST205'"));
/* La version du 11 novembre 2026 ou une suivante du même jour (2026-11-11-b : la prochaine séance de l'abonnée relue au départ). */
/* 2026-11-13-a : les envois programmés, qui gardent le texte d'avant. */
dit('la version du facteur le dit', true, /const VERSION = '2026-11-1[13]-[a-z] [^']*ce qui va partir : arrêté d’avance, modèle en pause/.test(ep));

/* ══ 11. CHAQUE FONCTION QUI DEPOSE : la copie, la lecture, le geste avant la salle ══ */
const BLOC = '/* ⟨arret-d-avance⟩ */';
const DEPOSANTES: [string, string, string][] = [
  ['supabase/functions/rappels-j1/index.ts', "? laPorteDAvance({ id: `env-${a.id}-whatsapp`, type: 'rappel-j1', apptId: a.id, colis: colisDuRappel }, avanceDuDepot) : null;", 'consigne(\'whatsapp\', a, String(retenue.statut)'],
  ['supabase/functions/confirmation-rdv/index.ts', "const liensEnPause = dAvanceConf?.verdict === 'repli';", 'for (const liens of jeton && !liensEnPause ? [true, false] : [false])'],
  ['supabase/functions/avis-google/index.ts', "const dAvance = laPorteDAvance({ id: `env-${p.id}-wa-avis`, type: 'avis-google', invoiceId: p.id, colis: colisDeLAvis }, avanceDuDepot);", 'consigne(p, String(retenue.statut)'],
  ['supabase/functions/relances-factures/index.ts', 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', "saute(dAvance.verdict === 'arrete' ? 'arretee-d-avance' : 'modele-en-pause');"],
  ['supabase/functions/rappels-d-echeance/index.ts', 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', "saute(dAvance.verdict === 'arrete' ? 'arrete-d-avance' : 'modele-en-pause');"],
  ['supabase/functions/fete-de-couronne/index.ts', 'const dAvance = laPorteDAvance(aDeposer, avanceDuDepot);', "saute(dAvance.verdict === 'arrete' ? 'arretee-d-avance' : 'modele-en-pause');"],
];
for (const [f, geste, ecrit] of DEPOSANTES) {
  const s = source(f);
  const brutDuFichier = brut(f);
  dit(`${f.split('/')[2]} : la copie du bloc, la lecture au depot, le geste, l ecriture`, [true, true, true, true],
    [brutDuFichier.includes(BLOC), s.includes('await litLesArretsEtLesPauses(sb)'), s.includes(geste), s.includes(ecrit)]);
}
{
  const rj = source('supabase/functions/rappels-j1/index.ts');
  dit('rappels-j1 : la reprise, le point et le SMS aussi', [true, true, true], [
    (rj.match(/const dAvance = laPorteDAvance\(aDeposer, avanceDuDepot\);/g) ?? []).length === 2,
    rj.includes("? laPorteDAvance({ id: `env-${a.id}-sms`, type: 'rappel-j1', apptId: a.id, colis: { genre: 'sms' } }, avanceDuDepot) : null;"),
    rj.indexOf('const dAvanceWa = ') < rj.indexOf("} else if (salleOuverte && WA_TOKEN && WA_PHONE_ID && tel && !deja.has(`env-${a.id}-whatsapp`)) {"),
  ]);
  const am = brut('supabase/functions/assistant-maison/index.ts');
  dit('assistant-maison (le fichier regroupe) : la lecture, et chaque ligne neuve passe la porte d avance', [true, true], [
    /await litLesArretsEtLesPauses\(sb\)/.test(am), /\.map\(\(l\) => retenueSiArretee\(l\)\)/.test(am),
  ]);
}

/* ══ 12. LA MIGRATION 0197 (0158 le 5 novembre 2026, renumerotee a la reprise du 8 novembre 2026) ══ */
const SQL = source('supabase/migrations/0197_ce_qui_va_partir.sql');
for (const t of ['envois_arretes', 'modeles_en_pause']) {
  dit(`${t} : sous RLS, lue par le personnel, ecrite par la direction seule, jamais effacee`, [true, true, true, true, true, false], [
    SQL.includes(`alter table public.${t} enable row level security;`),
    SQL.includes(`create policy ${t}_lire on public.${t} for select to authenticated using (public.is_staff());`),
    SQL.includes(`create policy ${t}_ecrire on public.${t} for insert to authenticated with check (public.est_direction());`),
    SQL.includes(`create policy ${t}_reprendre on public.${t} for update to authenticated using (public.est_direction()) with check (public.est_direction());`),
    SQL.includes(`revoke delete, truncate on public.${t} from anon, authenticated;`),
    new RegExp(`on public\\.${t} for delete`).test(SQL),
  ]);
}
dit('les deux tables au temps reel', true, SQL.includes("foreach t in array array['envois_arretes', 'modeles_en_pause'] loop"));

/* ══ 13. LE TRONE ET LA FONCTION modeles-meta ══ */
const AV = source('src/apps/trone/routes/clients/AVenir.tsx');
dit('A venir : « Ne pas envoyer » et « Remettre » a la direction seule', [true, true, true], [
  AV.includes('const direction = useEstDirection();'),
  AV.includes("{direction && !arretee && m.etat !== 'en-pause' && ("),
  AV.includes('{direction && arretee && peutSeRemettre(m, maintenantMs) && ('),
]);
const EA = source('src/apps/trone/routes/clients/EnvoisAutomatiques.tsx');
dit('les quatre onglets des envois automatiques', [true, true, true], [
  EA.includes("const ONGLETS: [OngletDesEnvois, string][] = [['salle', 'En salle'], ['a-venir', 'À venir'], ['partis', 'Partis'], ['modeles', 'Les modèles Meta']];"),
  EA.includes("{onglet === 'a-venir' && <AVenir />}"), EA.includes("{onglet === 'modeles' && <ModelesMeta />}"),
]);
const MM = source('src/apps/trone/routes/clients/ModelesMeta.tsx');
dit('les modeles : l interrupteur et « Reprendre chez Meta » a la direction seule ; l etat lu par la fonction', [true, true, true], [
  MM.includes('{direction ? ( <button'), MM.includes('{meta && direction && repriseChezMetaPossible(meta.etat) && ('),
  MM.includes("sb.functions.invoke('modeles-meta', { body: { geste: 'lire' } })"),
]);
/* La reprise du 8 novembre 2026, a l'ecran et a la prise. */
dit('A venir : les filtres par la regle, le doute d Opale dit en cuivre, le prenom de la ligne sans fiche', [true, true, true], [
  AV.includes('const sortes = sortesAFiltrer(liste);'),
  AV.includes('{m.aVerifier && <span className="trc-avenir__opale">Opale : à vérifier · {m.aVerifier}.</span>}'),
  AV.includes("return noms.join(', ') || (m.qui ? quiDit(m.qui, direction) : 'Une cliente');"),
]);
dit('les modeles : le fil sans les fiches d essai, les modeles declares d avance a zero', [true, true], [
  MM.includes('chiffresDesModeles(messagesSansLesEssais(messages, essais), maintenantMs, connus)'),
  MM.includes('...REGISTRE_DES_MODELES.flatMap((e) => e.modeles), ...Object.keys(MODELES_CONNUS)'),
]);
const DN = source('src/apps/trone/routes/clients/ce-qui-va-partir-donnees.ts');
const GD = source('src/apps/trone/routes/clients/gerard-donnees.ts');
dit('la prise : les pieces par la porte de la Maison, les essais nommes a la regle ; Perle rejouee lit tout, comme au serveur', [true, true, true, true], [
  DN.includes('const [factures] = usePiecesDeLaMaison();'),
  DN.includes('rdvs: new Set(avecEssais.filter((a) => estUnRdvDEssai(a, parId)).map((a) => a.id)),'),
  DN.includes('arrets, pauses, essais, };'),
  /export function useEntreesDeLAssistant\(\): EntreesSansLeJour \{ const \{ branch \} = useBranch\(\); const appts = useBranchAppointmentsAvecEssais\(\);/.test(GD),
]);
const CSS = brut('src/apps/trone/routes/clients/clients.css');
const blocCss = CSS.slice(CSS.indexOf('/* CE QUI VA PARTIR (5 novembre 2026)'), CSS.indexOf('.trc-avenir__texte, .trc-avenir__dit { grid-column: 1 / -1; }'));
const BRIQUE = /--color-brique|--brique-faible|#96412E|#FBF0ED/i;
dit('indigo et cuivre seulement : plus de brique dans les styles de l onglet ni dans ses ecrans ; le doute en cuivre', [false, false, false, true], [
  BRIQUE.test(blocCss), BRIQUE.test(brut('src/apps/trone/routes/clients/AVenir.tsx')), BRIQUE.test(brut('src/apps/trone/routes/clients/ModelesMeta.tsx')),
  blocCss.length > 1000 && blocCss.includes('.trc-avenir__opale { display: block; font-size: 12.5px; color: var(--copper-700, #7C4C2C); font-weight: 500; }'),
]);
const FM = source('supabase/functions/modeles-meta/index.ts');
dit('modeles-meta : lit chez Meta, reprend pour la direction seule, ne rend jamais le jeton', [true, true, true, false], [
  FM.includes('message_templates?fields=${CHAMPS}&limit=100'),
  FM.includes("if (qui !== 'direction' && qui !== 'service') return json({ erreur: 'la direction seule reprend un modèle', version: VERSION }, 403);"),
  FM.includes('const r = await fetch(`${GRAPH}/${id}/unpause`, {'),
  /json\(\{[^}]*\bWA_TOKEN\s*[,}]/.test(FM),
]);

/* ══ 14. LES MOTS : jamais le tiret « — », jamais « salon », l'annee sur les dates ══ */
const chaines = (s: string): string[] => {
  const sans = sansCommentaires(s);
  const out: string[] = [];
  for (const m of sans.matchAll(/'([^'\n\\]|\\.)*'|`([^`\\]|\\.)*`|"([^"\n\\]|\\.)*"/g)) out.push(m[0]);
  for (const m of sans.matchAll(/>([^<>{}\n]*[A-Za-zÀ-ÿ][^<>{}\n]*)</g)) out.push(m[1]);
  return out;
};
const NOUVEAUX = [
  'src/shared/arret-d-avance-pur.ts', 'src/shared/ce-qui-va-partir-pur.ts', 'src/shared/arrets-d-avance.ts', 'src/apps/trone/routes/clients/AVenir.tsx',
  'src/apps/trone/routes/clients/ModelesMeta.tsx', 'src/apps/trone/routes/clients/ce-qui-va-partir-donnees.ts', 'supabase/functions/modeles-meta/index.ts',
];
for (const f of NOUVEAUX) {
  const c = chaines(brut(f));
  dit(`${f.split('/').pop()} : aucun tiret long, aucun « salon » dans ce qui s affiche`, [[], []],
    [c.filter((x) => x.includes('—')).slice(0, 3), c.filter((x) => /\bsalons?\b/i.test(x)).slice(0, 3)]);
}

console.log(`\n${n} epreuves${ko ? `, ${ko} en echec` : ' : tout est juste'}.`);
if (ko === 0) console.log('Ce qui va partir tient : chaque message se voit, s arrete et se remet ; la porte d Opale le respecte partout.');
