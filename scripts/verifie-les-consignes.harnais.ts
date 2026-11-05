/* UNE CONSIGNE AUX ASSISTANTS, ÉPROUVÉE · 5 novembre 2026 (lot 1).
   `node scripts/verifie-les-consignes.mjs` (et `--prouve`).

   ① Le cerveau pur (`shared/consignes-pur`) : les statuts, la réponse d'un
      assistant (qui passe à quoi, avec quoi), le défaire lu, la fenêtre
      d'une heure, le plan du défaire contre les rendez-vous tels qu'ils
      sont (tout ou rien), les heures dites avec l'année, la veille dite
      (« Topaze n'est pas encore relié, sa consigne attend »), l'ordre du
      choix, la ligne du fil, la ligne du guetteur, la notification.
   ② La VRAIE fonction `assistants-maison`, regroupée depuis le dépôt, contre
      une base et un push-notify simulés : consigne.lire (les siennes
      seulement, marquées ou regardées sans marquer, le guetteur noté),
      consigne.repondre (faite avec le défaire rendu par les gestes, oui
      attendu avec sa carte et SA notification, une seule, jamais la nuit,
      jamais pour une consigne faite), consigne.passer ; les gestes faits
      seuls rendent leur `defaire`.
   ③ La ligne de commande (`--essai`, jeton masqué) et le guetteur, lancé
      pour de vrai contre un petit serveur local : une ligne par consigne
      nouvelle, une fois, rien du jeton, `marquer: false`.
   ④ Le câblage : 0162 (les statuts du module pur, la RLS, à son nom, pas
      d'effacement, pas de temps réel), le contrat, l'écran (en haut des
      Assistants, la direction seule, Défaire par les magasins, ni vert ni
      rouge ni jaune), la charte, la maquette construite.
   Les fiches, numéros et textes du banc sont inventés : rien de réel ici. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  CONSIGNES_LUES_AU_PLUS, DEFAIRE_PENDANT_MS, GUETTEUR_FRAIS_MS, STATUTS_DE_CONSIGNE, accorde, debutDuTexte, defaireDeLAnnulation, defaireDeLaNote,
  defaireDeLaPose, defaireDuDeplacement, defaireJusqua, estNouvelle, ligneDuFil, ligneDuGuetteur, lisLeDefaire, momentDit, notificationDuOui,
  ordreDuChoix, peutDefaire, peutPasser, planDuDefaire, reponseDeConsigne, statutDeLaReponse, texteDeConsigne, veilleDe,
  type Consigne, type GesteADefaire, type RdvLu,
} from '../src/shared/consignes-pur';
import { ACTIONS_DU_JETON, REGLAGES_PAR_DEFAUT, aCotonou, empreinteDuJetonAssistant, porteDeLAction } from '../src/shared/assistants-pur';
import { PROFESSIONNELS, professionnel } from '../src/shared/maison-intelligente-pur';

let ko = 0; let n = 0;
const ascii = (v: unknown): string => (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`); }
};
/* La panne de `--prouve`, posée en mémoire sur le texte lu (ou sur une copie hors de l'arbre), jamais sur le disque du dépôt. */
const PANNE = process.env.CONSIGNES_PANNE ? JSON.parse(process.env.CONSIGNES_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};
const temp = mkdtempSync(path.join(tmpdir(), 'verifie-les-consignes-'));
/** Un script exécuté (ligne de commande, guetteur) : la copie en panne hors de l'arbre, sinon l'original. */
const scriptLance = (f: string): string => {
  if (!PANNE || PANNE.fichier !== f) return path.resolve(f);
  const copie = path.join(temp, path.basename(f));
  writeFileSync(copie, lit(f));
  return copie;
};

/* ── ① LE CERVEAU PUR ── */
const H = 3_600_000;
/* Un instant de référence : jeudi 5 novembre 2026, 11 h 52 à Cotonou (10 h 52 UTC). */
const T = Date.parse('2026-11-05T10:52:00Z');

dit('les statuts, dans l ordre de la maquette', ['envoyee', 'lue', 'faite', 'oui-attendu', 'passee', 'en-attente'], [...STATUTS_DE_CONSIGNE]);
dit('nouvelle : envoyée ou passée, jamais lue', [true, true, false, false, false], ['envoyee', 'passee', 'lue', 'en-attente', 'faite'].map(estNouvelle));
dit('les mots de la ligne de commande et leurs synonymes', ['faite', 'faite', 'oui-attendu', 'oui-attendu', 'en-attente', 'en-attente', null, null],
  ['faite', 'fait', 'oui-attendu', 'oui', 'en-attente', 'attente', 'lue', 'envoyee'].map(statutDeLaReponse));
dit('le texte d une consigne : vide refusé, mille caractères au plus, détouré', ['texte-vide', 'texte-trop-long', 'Edite ceci'], [
  (texteDeConsigne('   ') as { motif: string }).motif, (texteDeConsigne('x'.repeat(1001)) as { motif: string }).motif, (texteDeConsigne('  Edite ceci \n') as { texte: string }).texte]);

const D1 = defaireDuDeplacement('rdv-a', { date: '2026-11-05', time: '16:00' }, { date: '2026-11-26', time: '09:00' });
const N1 = defaireDeLaNote('rdv-a', 'Opale, 5 nov. 2026 : ne vient pas le 5');
dit('le défaire lu : un geste, une liste, rien', [[D1], [D1, N1], []], [
  (lisLeDefaire(D1) as { gestes: unknown }).gestes, (lisLeDefaire([D1, N1]) as { gestes: unknown }).gestes, (lisLeDefaire(undefined) as { gestes: unknown }).gestes]);
const motifD = (v: unknown) => { const r = lisLeDefaire(v); return r.ok ? 'ok' : r.motif; };
dit('le défaire refusé : genre inconnu, sans rendez-vous, sans avant, statut d avant inconnu, note sur deux lignes, plus de cinq gestes', [
  'un genre de geste inconnu', 'un geste sans rendez-vous lisible', 'un déplacement sans son avant et son après', 'une annulation sans le statut d avant',
  'une note sans sa ligne', 'plus de 5 gestes à défaire', 'ok'], [
  motifD({ genre: 'facture-effacee', rdvId: 'rdv-a' }), motifD({ genre: 'rdv-pose', rdvId: 'a b' }), motifD({ genre: 'rdv-deplace', rdvId: 'rdv-a', apres: { date: '2026-11-26', time: '09:00' } }),
  motifD({ genre: 'rdv-annule', rdvId: 'rdv-a', avant: { status: 'annulé' } }), motifD({ genre: 'note', rdvId: 'rdv-a', ligne: 'a\nb' }),
  motifD(Array.from({ length: 6 }, () => defaireDeLaPose('rdv-a'))), motifD(defaireDeLAnnulation('rdv-a', 'confirmé'))]);

const rep = (actuel: string, statut: string, o: { defaire?: unknown; decision?: string; reponse?: string } = {}) => {
  const r = reponseDeConsigne({ actuel, statut, reponse: o.reponse ?? 'Fait.', defaire: o.defaire, decision: o.decision });
  return r.ok ? r.r.statut : r.motif;
};
dit('la réponse : d envoyée, lue, en attente ou passée vers faite ; oui attendu exige sa carte', ['faite', 'faite', 'faite', 'faite', 'decision-manquante', 'oui-attendu', 'en-attente'], [
  rep('envoyee', 'faite'), rep('lue', 'faite'), rep('en-attente', 'faite'), rep('passee', 'fait'), rep('lue', 'oui-attendu'), rep('lue', 'oui', { decision: 'dec-1' }), rep('lue', 'attente')]);
dit('… une consigne faite est close ; après le oui, on clôt (faite ou en attente), jamais un second oui', ['deja-close', 'faite', 'en-attente', 'deja-close'], [
  rep('faite', 'faite'), rep('oui-attendu', 'faite'), rep('oui-attendu', 'en-attente'), rep('oui-attendu', 'oui-attendu', { decision: 'dec-1' })]);
dit('… défaire seulement ce qui est fait seul, jamais avec un oui ; une réponse vide ou trop longue refusée', ['faite', 'defaire-hors-fait', 'defaire-hors-fait', 'defaire-hors-fait', 'reponse-vide', 'reponse-trop-longue', 'statut-inconnu'], [
  rep('lue', 'faite', { defaire: D1 }), rep('lue', 'oui-attendu', { defaire: D1, decision: 'dec-1' }), rep('lue', 'en-attente', { defaire: D1 }), rep('oui-attendu', 'faite', { defaire: D1 }),
  rep('lue', 'faite', { reponse: '  ' }), rep('lue', 'faite', { reponse: 'x'.repeat(601) }), rep('lue', 'lue')]);
dit('passer : ce qui est ouvert, jamais ce qui est fait ou attend un oui', [true, true, true, true, false, false], ['envoyee', 'lue', 'passee', 'en-attente', 'faite', 'oui-attendu'].map(peutPasser));

const faite = (minutes: number, plus: Partial<Consigne> = {}): Pick<Consigne, 'statut' | 'defaire' | 'defaiteLe' | 'faiteLe'> =>
  ({ statut: 'faite', defaire: [D1], defaiteLe: null, faiteLe: new Date(T - minutes * 60_000).toISOString(), ...plus });
dit('défaire pendant une heure : à 59 minutes oui, à 60 et 61 non ; défait, sans geste, ou pas faite : non', [true, false, false, false, false, false], [
  peutDefaire(faite(59), T), peutDefaire(faite(60), T), peutDefaire(faite(61), T), peutDefaire(faite(5, { defaiteLe: new Date(T).toISOString() }), T),
  peutDefaire(faite(5, { defaire: [] }), T), peutDefaire(faite(5, { statut: 'lue' }), T)]);
dit('… jusqu à quand : une heure après « faite »', [T + H, null], [defaireJusqua(new Date(T).toISOString()), defaireJusqua(null)]);

const rdvA: RdvLu = { id: 'rdv-a', date: '2026-11-26', time: '09:00', status: 'confirmé', note: 'Ancienne note\nOpale, 5 nov. 2026 : ne vient pas le 5' };
const plan = (g: GesteADefaire[], rdvs: Record<string, RdvLu | undefined>) => planDuDefaire(g, rdvs, T);
dit('le plan : le déplacement revient, la note s en va, en UN changement sur le rendez-vous', {
  ok: true, changements: [{ rdvId: 'rdv-a', apres: { date: '2026-11-05', time: '16:00', note: 'Ancienne note' } }],
  dits: ['la note posée sur le rendez-vous est retirée', 'le rendez-vous revient au jeudi 5 novembre 2026 à 16 h'] }, plan([D1, N1], { 'rdv-a': rdvA }));
dit('… un rendez-vous qui a encore bougé depuis bloque TOUT (la note reste)', { ok: false, pourquoi: ['le rendez-vous a encore bougé depuis : il est au vendredi 27 novembre 2026 à 10 h'] },
  plan([D1, N1], { 'rdv-a': { ...rdvA, date: '2026-11-27', time: '10:00' } }));
dit('… déjà revenu, déjà retirée : rien à changer, ce n est pas un blocage', { ok: true, changements: [], dits: [] },
  plan([D1, N1], { 'rdv-a': { ...rdvA, date: '2026-11-05', time: '16:00', note: 'Ancienne note' } }));
dit('… un rendez-vous absent du poste bloque (peut-être pas encore synchronisé)', false, plan([defaireDeLaPose('rdv-z')], {}).ok);
const pose = plan([defaireDeLaPose('rdv-a')], { 'rdv-a': rdvA });
dit('… une pose se défait en annulation par la maison, datée', [true, 'annulé', 'maison', new Date(T).toISOString()],
  pose.ok ? [true, pose.changements[0].apres.status, pose.changements[0].apres.annuleePar, pose.changements[0].apres.annuleeLe] : [false]);
dit('… une pose déjà honorée bloque ; une annulation revient à son statut d avant', [false, 'confirmé'], [
  plan([defaireDeLaPose('rdv-a')], { 'rdv-a': { ...rdvA, status: 'honoré' } }).ok,
  (plan([defaireDeLAnnulation('rdv-a', 'confirmé')], { 'rdv-a': { ...rdvA, status: 'annulé' } }) as { changements: { apres: { status: string } }[] }).changements[0]?.apres.status]);
const deuxFois = plan([defaireDeLaNote('rdv-a', 'x')], { 'rdv-a': { ...rdvA, note: 'x\ny\nx' } });
dit('… la note : seule la DERNIÈRE ligne identique s en va', 'x\ny', deuxFois.ok ? deuxFois.changements[0].apres.note : '');

dit('les heures dites : aujourd hui, hier, et la date entière avec son année', ['à 11 h 52', 'hier à 9 h', 'le 1er novembre 2026 à 8 h 05', ''], [
  momentDit(new Date(T).toISOString(), T), momentDit('2026-11-04T08:00:00Z', T), momentDit('2026-11-01T07:05:00Z', T), momentDit('jamais', T)]);

const R = REGLAGES_PAR_DEFAUT;
const topaze = professionnel('topaze')!; const opaleP = professionnel('opale')!;
const opaleA = { id: 'opale', nom: 'Opale', aUnJeton: true, vuLe: new Date(T - 3 * 60_000).toISOString(), etat: {}, guetteLe: new Date(T - 30_000).toISOString() };
dit('la veille : pas relié, le guetteur frais, le guetteur tombé mais un passage récent, endormi, jamais passé', [
  'Topaze n’est pas encore relié, sa consigne attend.',
  'Opale veille, vue à l’instant : la consigne est vue en une minute environ.',
  'Opale est éveillée, sans guetteur : la consigne est lue à son prochain passage.',
  'Opale est endormie depuis 2 h : sa consigne attend son réveil.',
  'Opale n’est jamais passée au Trône : sa consigne attend son réveil.'], [
  veilleDe(null, topaze, T, R).phrase, veilleDe(opaleA, opaleP, T, R).phrase,
  veilleDe({ ...opaleA, guetteLe: new Date(T - 4 * 60_000).toISOString() }, opaleP, T, R).phrase,
  veilleDe({ ...opaleA, guetteLe: null, vuLe: new Date(T - 2 * H).toISOString() }, opaleP, T, R).phrase,
  veilleDe({ ...opaleA, guetteLe: null, vuLe: null }, opaleP, T, R).phrase]);
dit('… les mots des puces : le domaine d un assistant pas relié, l état d un relié', ['l\'équipe', 'veille', 'éveillée'], [
  veilleDe(null, topaze, T, R).mot, veilleDe(opaleA, opaleP, T, R).mot, veilleDe({ ...opaleA, guetteLe: null }, opaleP, T, R).mot]);
dit('le guetteur se tient trois minutes : à 2 min 50 il veille, à 3 min il ne veille plus', ['veille', 'eveille', 3 * 60_000], [
  veilleDe({ ...opaleA, guetteLe: new Date(T - 170_000).toISOString() }, opaleP, T, R).cle, veilleDe({ ...opaleA, guetteLe: new Date(T - 180_000).toISOString() }, opaleP, T, R).cle, GUETTEUR_FRAIS_MS]);
dit('l accord : Opale au féminin, les autres au masculin', ['reliée', 'relié'], [accorde('opale', 'relié'), accorde('topaze', 'relié')]);

const regA = [{ id: 'opale', aUnJeton: true, porteurUserId: 'u-yeman' }, { id: 'onyx', aUnJeton: true, porteurUserId: 'u-brice' }];
const ordreY = ordreDuChoix(PROFESSIONNELS, regA, 'u-yeman'); const ordreB = ordreDuChoix(PROFESSIONNELS, regA, 'u-brice');
dit('l ordre du choix : le sien d abord, l autre relié, puis la caisse, l équipe, les clientes ; le reste derrière « Les autres »', [
  ['opale', 'onyx', 'grenat', 'topaze'], ['perle', 'saphir', 'ambre', 'jade', 'jaspe', 'cristal'], ['onyx', 'opale', 'grenat', 'topaze']], [
  ordreY.visibles.map((p) => p.id), ordreY.autres.map((p) => p.id), ordreB.visibles.map((p) => p.id)]);

const nomDe = (id: string) => professionnel(id)?.nom ?? id;
const ctx = (v: ReturnType<typeof veilleDe> | null) => ({ nomDe, prenomDe: (nn: string) => nn.split(' ')[0], veilleDuPour: v });
const base: Consigne = { id: 'c', de: 'Yéman B.', pour: 'opale', texte: 't', statut: 'envoyee', ecriteLe: new Date(T - 5 * 60_000).toISOString() };
const lf = (c: Partial<Consigne>, v: ReturnType<typeof veilleDe> | null = null) => { const x = ligneDuFil({ ...base, ...c }, ctx(v), T); return [x.pastille, x.ton]; };
dit('le fil : Envoyée, Lue, Fait, Votre oui, Passée à…, En attente, Défait', [
  ['Envoyée', 'attente'], ['Lue', 'attente'], ['Fait', 'fait'], ['Votre oui', 'alerte'], ['Passée à Grenat', 'attente'], ['En attente', 'attente'], ['Défait', 'attente']], [
  lf({}), lf({ statut: 'lue' }), lf({ statut: 'faite' }), lf({ statut: 'oui-attendu' }), lf({ statut: 'passee', pour: 'grenat', passeeDe: 'opale', passeeLe: new Date(T).toISOString() }),
  lf({ statut: 'en-attente' }), lf({ statut: 'faite', defaiteLe: new Date(T).toISOString() })]);
const lfTopaze = ligneDuFil({ ...base, pour: 'topaze' }, ctx(veilleDe(null, topaze, T, R)), T);
dit('… à son nom, avec ses heures ; ce qui attend un assistant pas relié se dit sous la consigne', [
  'À Topaze · de Yéman · envoyée à 11 h 47', 'Topaze n’est pas encore relié, sa consigne attend.', null], [
  lfTopaze.ligne, lfTopaze.attend, ligneDuFil(base, ctx(veilleDe(opaleA, opaleP, T, R)), T).attend]);
const lfFaite = ligneDuFil({ ...base, statut: 'faite', lueLe: new Date(T - 4 * 60_000).toISOString(), faiteLe: new Date(T - 60_000).toISOString() }, ctx(null), T);
dit('… envoyée, lue, faite, comme la maquette', 'À Opale · de Yéman · envoyée à 11 h 47 · lue à 11 h 48 · faite à 11 h 51', lfFaite.ligne);

dit('la ligne du guetteur : l id, l assistant, le début du texte sur une ligne', [
  'consigne c-1 pour opale : Bouge le rendez-vous de jeudi à 9 h.',
  `consigne c-2 pour opale : ${'a'.repeat(59)}…`], [
  ligneDuGuetteur({ id: 'c-1', pour: 'opale', texte: 'Bouge le rendez-vous\n de jeudi   à 9 h.' }), ligneDuGuetteur({ id: 'c-2', pour: 'opale', texte: 'a'.repeat(80) })]);
dit('… soixante caractères au plus', 60, debutDuTexte('b'.repeat(200)).length);
dit('la notification d un oui : le nom de l assistant, jamais un extrait', { titre: 'Une consigne attend votre oui', corps: 'Opale a préparé une carte dans Les assistants.' }, notificationDuOui('Opale'));

/* ── ② LA FONCTION ── */
type Row = Record<string, unknown>;
let tic = 0;
const horloge = () => new Date(Date.now() + (tic++)).toISOString();
const VRAI_MAINTENANT = Date.now.bind(Date);
let decalage = 0;
Date.now = () => VRAI_MAINTENANT() + decalage;
/** L'horloge de la fonction à une heure de Cotonou donnée (aujourd'hui ou demain). */
const aLHeure = (h: number) => { decalage = 0; const c = aCotonou(Date.now()); decalage = (((h - c.heure) + 24) % 24) * H - c.minute * 60_000 + 60_000; };
aLHeure(10);

const CLES: Record<string, string> = { assistants_prises: 'cle', documents: 'key', staff: 'user_id' };
const JETON_OPALE = 'assistant-opale-banc-des-consignes';
const JETON_ONYX = 'assistant-onyx-banc-des-consignes';
const dateDans = (j: number) => aCotonou(Date.now() + j * 86_400_000).dateISO;
const tables: Record<string, Row[]> = {
  assistants: [
    { id: 'opale', nom: 'Opale', porteur_team_id: 'st-5qduae5jef', porteur_user_id: 'u-yeman', empreinte: await empreinteDuJetonAssistant(JETON_OPALE), etat: {}, branch_id: 'br-test', vu_le: null, guette_le: null, updated_at: horloge() },
    { id: 'onyx', nom: 'Onyx', porteur_team_id: 'st-d4t24p6inh', porteur_user_id: 'u-brice', empreinte: await empreinteDuJetonAssistant(JETON_ONYX), etat: {}, branch_id: 'br-test', vu_le: null, guette_le: null, updated_at: horloge() },
    { id: 'grenat', nom: 'Grenat', porteur_team_id: 'st-5qduae5jef', porteur_user_id: 'u-yeman', empreinte: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
    { id: 'topaze', nom: 'Topaze', porteur_team_id: 'st-d4t24p6inh', porteur_user_id: 'u-brice', empreinte: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
  ],
  assistants_consignes: [], assistants_decisions: [], assistants_relais: [], assistants_prises: [], journal_gestes: [], envois: [],
  appointments: [
    { id: 'rdv-banc-1', branch_id: 'br-test', data: { id: 'rdv-banc-1', branchId: 'br-test', clientId: 'cl-1', clientName: 'Awa Banc', serviceIds: ['s-creation'], date: dateDans(10), time: '10:00', master: 'Team', status: 'confirmé', pourMaitre: 'st-5qduae5jef' }, updated_at: horloge() },
    { id: 'rdv-banc-2', branch_id: 'br-test', data: { id: 'rdv-banc-2', branchId: 'br-test', clientId: 'cl-1', clientName: 'Awa Banc', serviceIds: ['s-creation'], date: dateDans(20), time: '15:00', master: 'Team', status: 'en attente', pourMaitre: 'st-5qduae5jef' }, updated_at: horloge() },
  ],
  documents: [{ key: 'mnd_settings', data: { assistants: {} } }],
  staff: [{ user_id: 'u-yeman', name: 'Y. B.', role: 'souverain' }, { user_id: 'u-brice', name: 'B. A.', role: 'souverain' }],
  team: [{ id: 'st-5qduae5jef', data: { name: 'Y. B.' } }, { id: 'st-d4t24p6inh', data: { name: 'B. A.' } }],
  branches: [{ id: 'br-test', data: { name: 'Maison du banc', flagship: true, status: 'active', masters: ['Team'], masterParDefaut: 'Team' } }],
  catalog_categories: [{ id: 'c-soin', data: { label: 'Reprise de racines' } }],
  catalog_services: [{ id: 's-creation', data: { name: 'Création', categoryId: 'c-soin' } }],
  clients: [{ id: 'cl-1', data: { name: 'Awa Banc', phone: '+229 01 97 00 00 01', branchId: 'br-test' } }],
};
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
  limit(nn: number) { this.limite = nn; return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.charge = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = 'upsert'; this.charge = Array.isArray(rows) ? rows : [rows]; this.options = o ?? {}; return this; }
  update(patch: Row) { this.op = 'update'; this.charge = [patch]; return this; }
  delete() { this.op = 'delete'; return this; }
  async maybeSingle() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.error }; }
  then<X>(res: (v: { data: Row[] | null; error: { message: string } | null }) => X, rej?: (e: unknown) => X) { return Promise.resolve(this.execute()).then(res, rej); }
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
        const neuve = { ...(this.table === 'appointments' ? { updated_at: horloge() } : {}), ...copie(row) };
        t.push(neuve); faites.push(copie(neuve));
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'upsert') {
      const faites: Row[] = [];
      for (const row of this.charge) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i >= 0) { if (this.options.ignoreDuplicates) continue; t[i] = { ...t[i], ...copie(row) }; touche(t[i]); faites.push(copie(t[i])); }
        else { const neuve = copie(row); t.push(neuve); faites.push(copie(neuve)); }
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'update') {
      const touchees = t.filter((r) => this.filtres.every((f) => f(r)));
      for (const r of touchees) { Object.assign(r, copie(this.charge[0])); touche(r); }
      return { data: this.veutSelect ? touchees.map(copie) : null, error: null };
    }
    tables[this.table] = t.filter((r) => !this.filtres.every((f) => f(r)));
    return { data: this.veutSelect ? [] : null, error: null };
  }
}
const JWTS: Record<string, string> = { 'jwt-yeman': 'u-yeman' };
const fabrique = () => ({
  from: (table: string) => new Requete(table),
  auth: { getUser: async (jwt: string) => (JWTS[jwt] ? { data: { user: { id: JWTS[jwt] } }, error: null } : { data: { user: null }, error: { message: 'invalide' } }) },
  rpc: async (nom: string, params: Row) => {
    if (nom === 'fiches_du_numero') return { data: String(params.n) === '2290197000001' ? [{ id: 'cl-1', nom: 'Awa Banc', parPhone: true, branchId: 'br-test' }] : [], error: null };
    return { data: null, error: { message: `rpc inconnue ${nom}` } };
  },
});
const pushs: Row[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  if (!String(url).endsWith('/functions/v1/push-notify')) throw new Error(`appel inattendu : ${url}`);
  pushs.push(JSON.parse(init.body));
  return { status: 200, json: async () => ({ sent: 1 }) };
};
/* Ce que la fonction écrit à son journal : recueilli, jamais affiché (on y cherche un texte de consigne). */
const journalDeLaFonction: string[] = [];
const logDOrigine = console.log.bind(console);
console.log = (...a: unknown[]) => { const t = a.map(String).join(' '); if (t.startsWith('assistants-maison')) journalDeLaFonction.push(t); else logDOrigine(...a); };
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'service' };
const sourceF = readFileSync(process.env.CONSIGNES_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', sourceF)(fabrique, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });

type Reponse = { ok?: boolean; motif?: string; detail?: string; [k: string]: unknown };
const appelle = async (entetes: Record<string, string>, corps: unknown) => {
  const r = await handler!(new Request('http://f/assistants-maison', { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Reponse };
};
const opale = { 'x-jeton-assistant': JETON_OPALE };
const onyx = { 'x-jeton-assistant': JETON_ONYX };
const ligne = (table: string, id: string) => tables[table].find((r) => r.id === id) ?? null;
const consigne = (id: string, pour: string, plus: Row = {}): Row => ({
  id, de: 'Y. B.', de_user_id: 'u-yeman', pour, texte: `Consigne ${id} pour Awa Banc, jeudi 9 h.`, statut: 'envoyee', reponse: null, defaire: null, decision_id: null,
  ecrite_le: horloge(), lue_le: null, faite_le: null, passee_de: null, passee_le: null, passee_mot: null, notifie_le: null, defaite_le: null, defaite_par: null,
  branch_id: 'br-test', updated_at: horloge(), ...plus,
});
tables.assistants_consignes.push(
  consigne('c-1', 'opale'), consigne('c-2', 'onyx', { de: 'B. A.', de_user_id: 'u-brice' }), consigne('c-3', 'opale', { statut: 'faite', faite_le: horloge() }),
  consigne('c-4', 'topaze'), consigne('c-5', 'opale'), consigne('c-6', 'opale', { de: 'B. A.', de_user_id: 'u-brice' }), consigne('c-7', 'opale'), consigne('c-8', 'opale'),
);

const sante = await (await handler!(new Request('http://f/assistants-maison', { method: 'GET' }))).json() as Reponse;
dit('la version dit les consignes', true, String(sante.version).startsWith('2026-11-05-a · une consigne aux assistants'));
dit('le contrat : les trois actions passent par la porte des assistants, jamais par celle d un souverain', [true, 'jeton', 'jeton', 'jeton', 403, 'mauvaise-porte', 403], [
  ['consigne.lire', 'consigne.repondre', 'consigne.passer'].every((a) => (ACTIONS_DU_JETON as readonly string[]).includes(a)),
  porteDeLAction('consigne.lire'), porteDeLAction('consigne.repondre'), porteDeLAction('consigne.passer'),
  ...(await appelle({ authorization: 'Bearer jwt-yeman' }, { action: 'consigne.lire' }).then((r) => [r.status, r.corps.motif])),
  (await appelle({}, { action: 'consigne.lire' })).status]);

const regard = await appelle(opale, { action: 'consigne.lire', marquer: false });
const idsDe = (r: { corps: Reponse }) => ((r.corps.consignes ?? []) as Row[]).map((c) => c.id);
dit('regarder sans marquer : les siennes seulement, ouvertes, nouvelles ; rien ne bouge en base ; le guetteur est noté', [
  ['c-1', 'c-5', 'c-6', 'c-7', 'c-8'], true, 'envoyee', null, 0, true], [
  idsDe(regard), ((regard.corps.consignes ?? []) as Row[]).every((c) => c.nouvelle === true), ligne('assistants_consignes', 'c-1')!.statut,
  ligne('assistants_consignes', 'c-1')!.lue_le, regard.corps.marquees, !!ligne('assistants', 'opale')!.guette_le]);
const lecture = await appelle(opale, { action: 'consigne.lire' });
dit('lire : les nouvelles passent « lue », en base et dans la réponse ; l autre assistant ne voit rien d Opale', [5, 'lue', true, 'lue', ['c-2']], [
  lecture.corps.marquees, ligne('assistants_consignes', 'c-1')!.statut, !!ligne('assistants_consignes', 'c-1')!.lue_le,
  ((lecture.corps.consignes ?? []) as Row[]).find((c) => c.id === 'c-1')?.statut, idsDe(await appelle(onyx, { action: 'consigne.lire', marquer: false }))]);
dit('… regardée de nouveau : plus nouvelle', false, ((await appelle(opale, { action: 'consigne.lire', marquer: false })).corps.consignes as Row[]).find((c) => c.id === 'c-1')?.nouvelle);

/* Les gestes faits seuls rendent leur défaire. */
const r1 = tables.appointments[0];
const depl = await appelle(opale, { action: 'rdv.deplacer', rdvId: 'rdv-banc-1', date: dateDans(12), time: '09:00', updatedAt: r1.updated_at });
const note = await appelle(opale, { action: 'note.poser', rdvId: 'rdv-banc-1', note: 'Ne vient pas jeudi' });
const r2 = tables.appointments[1];
const ann = await appelle(opale, { action: 'rdv.annuler', rdvId: 'rdv-banc-2', updatedAt: r2.updated_at });
const posee = await appelle(opale, { action: 'rdv.poser', numeroCle: '2290197000001', serviceIds: ['s-creation'], date: dateDans(120), time: '11:00', pourMaitre: 'st-5qduae5jef', idempotence: 'opale:banc:consignes', ajouter: true });
const noteEcrite = String(((ligne('appointments', 'rdv-banc-1')!.data as Row).note) ?? '');
dit('les gestes faits seuls rendent leur défaire, tel que le module pur le fabrique', [
  defaireDuDeplacement('rdv-banc-1', { date: dateDans(10), time: '10:00' }, { date: dateDans(12), time: '09:00' }),
  defaireDeLaNote('rdv-banc-1', noteEcrite.split('\n').pop() ?? ''), defaireDeLAnnulation('rdv-banc-2', 'en attente'), defaireDeLaPose(String(posee.corps.rdvId))], [
  depl.corps.defaire, note.corps.defaire, ann.corps.defaire, posee.corps.defaire]);

const avantPush = pushs.length;
dit('répondre : jamais pour la consigne d un autre', [403, 'pas-a-toi'], await appelle(onyx, { action: 'consigne.repondre', id: 'c-1', statut: 'faite', reponse: 'Fait.' }).then((r) => [r.status, r.corps.motif]));
const faiteR = await appelle(opale, { action: 'consigne.repondre', id: 'c-1', statut: 'faite', reponse: 'Fait : le rendez-vous passe au jeudi 26 novembre 2026, 9 h ; une note est posée.', defaire: [depl.corps.defaire, note.corps.defaire] });
const c1 = ligne('assistants_consignes', 'c-1')!;
dit('faite, avec son défaire : écrite, datée, une heure pour défaire, AUCUNE notification', [true, 'faite', true, 2, true, 0], [
  faiteR.corps.ok, c1.statut, !!c1.faite_le, (c1.defaire as unknown[]).length, Math.abs(Date.parse(String(faiteR.corps.defaireJusqua)) - (Date.now() + DEFAIRE_PENDANT_MS)) < 5000, pushs.length - avantPush]);
dit('… répondre encore à une consigne faite : refusé', [409, 'deja-close'], await appelle(opale, { action: 'consigne.repondre', id: 'c-1', statut: 'faite', reponse: 'Encore.' }).then((r) => [r.status, r.corps.motif]));
dit('… un défaire illisible : refusé, rien n est écrit', [400, 'defaire-refuse', 'lue'], [
  ...(await appelle(opale, { action: 'consigne.repondre', id: 'c-7', statut: 'faite', reponse: 'Fait.', defaire: { genre: 'facture-effacee', rdvId: 'x' } }).then((r) => [r.status, r.corps.motif])),
  ligne('assistants_consignes', 'c-7')!.statut]);

/* Le oui attendu : la carte, puis la réponse qui notifie, une fois. */
const carte = await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Une fournisseuse attend un oui pour vendredi', proposition: 'On prend 3 bouteilles pour vendredi.' });
dit('oui attendu sans sa carte : refusé', [400, 'decision-manquante'], await appelle(opale, { action: 'consigne.repondre', id: 'c-5', statut: 'oui-attendu', reponse: 'Un message part.' }).then((r) => [r.status, r.corps.motif]));
const avantOui = pushs.length;
const oui = await appelle(opale, { action: 'consigne.repondre', id: 'c-5', statut: 'oui-attendu', reponse: 'Un message part vers la fournisseuse : il attend votre oui.', decision: carte.corps.id });
const c5 = ligne('assistants_consignes', 'c-5')!;
const pushsDuOui = pushs.slice(avantOui);
dit('oui attendu : la carte liée, UNE notification à la porteuse (qui l a aussi écrite), notée', [true, 'oui-attendu', carte.corps.id, 1, ['u-yeman'], true, 'Une consigne attend votre oui'], [
  oui.corps.ok, c5.statut, c5.decision_id, oui.corps.notifie, pushsDuOui.map((p) => p.userId), !!c5.notifie_le, pushsDuOui[0]?.title]);
dit('… la notification ne porte ni le texte de la consigne, ni un nom de cliente', true, !/Awa|Banc|Consigne c-|bouteilles/.test(JSON.stringify(pushsDuOui)));
const avantB = pushs.length;
const carte6 = await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Un message attend un oui', proposition: 'Bonjour.' });
await appelle(opale, { action: 'consigne.repondre', id: 'c-6', statut: 'oui-attendu', reponse: 'Un message part : il attend votre oui.', decision: carte6.corps.id });
dit('… écrite par Brice à Opale : la porteuse (qui voit la carte) et Brice sont prévenus, chacun une fois', ['u-yeman', 'u-brice'], pushs.slice(avantB).map((p) => p.userId));
const avantFin = pushs.length;
tables.assistants_decisions.find((d) => d.id === carte.corps.id)!.tranchee = 'envoyer';
const lueApres = ((await appelle(opale, { action: 'consigne.lire', marquer: false })).corps.consignes as Row[]).find((c) => c.id === 'c-5');
const close = await appelle(opale, { action: 'consigne.repondre', id: 'c-5', statut: 'faite', reponse: 'Envoyé après votre oui.' });
dit('… la carte tranchée revient avec la consigne ; on clôt « faite » sans notification', ['envoyer', true, 'faite', 0], [
  (lueApres?.carte as Row | undefined)?.tranchee, close.corps.ok, ligne('assistants_consignes', 'c-5')!.statut, pushs.length - avantFin]);
const carteOnyx = await appelle(onyx, { action: 'decision.deposer', genre: 'reponse', resume: 'Une carte d Onyx', proposition: 'Bonjour.' });
dit('… la carte d un autre assistant : refusée', [403, 'pas-ta-carte'], await appelle(opale, { action: 'consigne.repondre', id: 'c-7', statut: 'oui-attendu', reponse: 'Un message part.', decision: carteOnyx.corps.id }).then((r) => [r.status, r.corps.motif]));
aLHeure(23);
const avantNuit = pushs.length;
const nuit = await appelle(opale, { action: 'consigne.repondre', id: 'c-7', statut: 'oui-attendu', reponse: 'Un message part.', decision: carte6.corps.id });
dit('… la nuit (23 h à Cotonou) : rien ne sonne, la carte attend au Trône', [true, true, 0, null], [nuit.corps.ok, nuit.corps.nuit, pushs.length - avantNuit, ligne('assistants_consignes', 'c-7')!.notifie_le]);
aLHeure(10);
dit('… défaire avec un oui : refusé', [400, 'defaire-hors-fait'], await appelle(opale, { action: 'consigne.repondre', id: 'c-7', statut: 'faite', reponse: 'Fait.', defaire: depl.corps.defaire }).then((r) => [r.status, r.corps.motif]));

/* Passer à un autre. */
dit('passer : jamais à soi, jamais à un inconnu, jamais une consigne close', ['pour-invalide', 'assistant-inconnu', 'deja-close', 'pas-a-toi'], [
  (await appelle(opale, { action: 'consigne.passer', id: 'c-8', pour: 'opale' })).corps.motif, (await appelle(opale, { action: 'consigne.passer', id: 'c-8', pour: 'lapis' })).corps.motif,
  (await appelle(opale, { action: 'consigne.passer', id: 'c-1', pour: 'grenat' })).corps.motif, (await appelle(onyx, { action: 'consigne.passer', id: 'c-8', pour: 'grenat' })).corps.motif]);
const passe = await appelle(opale, { action: 'consigne.passer', id: 'c-8', pour: 'grenat', mot: 'C est la caisse du jour.' });
const c8 = ligne('assistants_consignes', 'c-8')!;
dit('… à Grenat, pas encore relié : la consigne le suit, « passée », pas lue, le mot gardé ; Opale ne la voit plus', [true, false, 'grenat', 'passee', 'opale', null, 'C est la caisse du jour.', false], [
  passe.corps.ok, passe.corps.relie, c8.pour, c8.statut, c8.passee_de, c8.lue_le, c8.passee_mot, idsDe(await appelle(opale, { action: 'consigne.lire', marquer: false })).includes('c-8')]);
await appelle(onyx, { action: 'consigne.passer', id: 'c-2', pour: 'opale' });
const repassee = ((await appelle(opale, { action: 'consigne.lire', marquer: false })).corps.consignes as Row[]).find((c) => c.id === 'c-2');
dit('… passée par Onyx à Opale : nouvelle pour elle, avec qui l a passée', [true, 'onyx'], [repassee?.nouvelle, repassee?.passeeDe]);
dit('le journal de la fonction ne porte jamais le texte d une consigne', true, journalDeLaFonction.length > 0 && !journalDeLaFonction.some((l) => /Consigne c-|Awa|fournisseuse|caisse du jour/.test(l)));
dit('la lecture est bornée', 50, CONSIGNES_LUES_AU_PLUS);

/* ── ③ LA LIGNE DE COMMANDE ET LE GUETTEUR ── */
const JETON_FAUX = 'assistant-opale-jeton-du-banc-0123456789abcdef';
const reglages = path.join(temp, 'reglages.json');
writeFileSync(reglages, JSON.stringify({ assistant: 'opale', nom: 'Opale', url: 'https://projet.exemple', jeton: JETON_FAUX }));
const cli = scriptLance('scripts/assistants-maison.mjs');
const essai = (...a: string[]) => {
  const r = spawnSync(process.execPath, [cli, ...a, '--essai', '--reglages', reglages], { encoding: 'utf8' });
  const lu = (() => { try { return JSON.parse(r.stdout) as Row; } catch { return { brut: r.stdout } as Row; } })();
  return { code: r.status, corps: (lu.requete as Row | undefined)?.corps as Row | undefined, motif: lu.motif, tout: r.stdout + r.stderr };
};
const e1 = essai('consigne', 'lire', '--regarder'); const e2 = essai('consigne', 'lire');
const e3 = essai('consigne', 'repondre', '--id', 'c-9', '--statut', 'fait', '--reponse', 'Fait.', '--defaire', JSON.stringify(D1), '--decision', 'dec-9');
const e4 = essai('consigne', 'passer', '--id', 'c-9', '--pour', 'grenat', '--mot', 'la caisse');
const e5 = essai('consigne', 'repondre', '--id', 'c-9', '--statut', 'lue', '--reponse', 'x');
dit('la ligne de commande : regarder sans marquer, lire, répondre (synonyme, défaire, carte), passer ; un statut inconnu refusé', [
  { action: 'consigne.lire', marquer: false }, { action: 'consigne.lire' },
  { action: 'consigne.repondre', id: 'c-9', statut: 'faite', reponse: 'Fait.', defaire: D1, decision: 'dec-9' },
  { action: 'consigne.passer', id: 'c-9', pour: 'grenat', mot: 'la caisse' }, [1, 'option-invalide']], [
  e1.corps, e2.corps, e3.corps, e4.corps, [e5.code, e5.motif]]);
dit('… le jeton jamais montré', false, [e1, e2, e3, e4, e5].some((e) => e.tout.includes(JETON_FAUX)));
const aide = spawnSync(process.execPath, [cli, '--aide'], { encoding: 'utf8' }).stdout;
dit('… l aide dit les trois sous-commandes', [true, true, true], [aide.includes('consigne lire [--regarder]'), aide.includes('consigne repondre --id <id> --statut faite|oui-attendu|en-attente --reponse'), aide.includes('consigne passer --id <id> --pour')]);

/* Le guetteur, pour de vrai, contre un petit serveur local. */
const vus: Row[] = [];
let tourDuServeur = 0;
let refuse = false;
const reponsesDuServeur = (): Row[] => {
  const a = { id: 'c-a', statut: 'envoyee', nouvelle: true, texte: 'Bouge le rendez-vous\nde jeudi à 9 h.', ecriteLe: '2026-11-05T10:00:00Z' };
  const b = { id: 'c-b', statut: 'lue', nouvelle: false, texte: 'Déjà lue', ecriteLe: '2026-11-05T09:00:00Z' };
  const c = { id: 'c-c', statut: 'passee', nouvelle: true, texte: 'x'.repeat(90), ecriteLe: '2026-11-05T09:30:00Z', passeeLe: '2026-11-05T10:10:00Z' };
  const d = { id: 'c-d', statut: 'envoyee', nouvelle: true, texte: 'Une autre', ecriteLe: '2026-11-05T10:20:00Z' };
  if (tourDuServeur === 1) return [a, b, c];
  if (tourDuServeur === 2) return [a, b, c, d];
  return [{ ...a, statut: 'passee', passeeLe: '2026-11-05T10:30:00Z' }, b, c, d];
};
const serveur = createServer((req, res) => {
  let corps = '';
  req.on('data', (x) => { corps += x; });
  req.on('end', () => {
    tourDuServeur += 1;
    vus.push({ url: req.url, jeton: req.headers['x-jeton-assistant'], corps: JSON.parse(corps || '{}') });
    res.writeHead(refuse ? 403 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(refuse ? { ok: false, motif: 'reserve-aux-assistants' } : { ok: true, assistant: { id: 'opale' }, consignes: reponsesDuServeur() }));
  });
});
await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => ok()));
const port = (serveur.address() as { port: number }).port;
const reglagesG = path.join(temp, 'reglages-guetteur.json');
writeFileSync(reglagesG, JSON.stringify({ assistant: 'opale', nom: 'Opale', url: `http://127.0.0.1:${port}`, jeton: JETON_FAUX }));
const guetteur = scriptLance('scripts/guetteur-des-consignes.mjs');
const lance = (tours: number) => new Promise<{ code: number | null; sortie: string; erreur: string }>((ok) => {
  const p = spawn(process.execPath, [guetteur, '--reglages', reglagesG, '--intervalle', '1', '--tours', String(tours)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = ''; let erreur = '';
  p.stdout.on('data', (x) => { sortie += x; }); p.stderr.on('data', (x) => { erreur += x; });
  p.on('close', (code) => ok({ code, sortie, erreur }));
});
const g = await lance(3);
const lignesG = g.sortie.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
dit('le guetteur : UNE ligne par consigne nouvelle, une fois ; une consigne repassée se redit ; rien d autre', [
  ligneDuGuetteur({ id: 'c-a', pour: 'opale', texte: 'Bouge le rendez-vous\nde jeudi à 9 h.' }), ligneDuGuetteur({ id: 'c-c', pour: 'opale', texte: 'x'.repeat(90) }),
  ligneDuGuetteur({ id: 'c-d', pour: 'opale', texte: 'Une autre' }), ligneDuGuetteur({ id: 'c-a', pour: 'opale', texte: 'Bouge le rendez-vous\nde jeudi à 9 h.' })], lignesG);
dit('… il regarde sans marquer, avec le jeton en en-tête, à la porte de la fonction', [3, true, true, true], [
  vus.length, vus.every((v) => JSON.stringify(v.corps) === JSON.stringify({ action: 'consigne.lire', marquer: false })), vus.every((v) => v.jeton === JETON_FAUX),
  vus.every((v) => v.url === '/functions/v1/assistants-maison')]);
dit('… le jeton jamais écrit, et il s arrête de lui-même', [false, 0, ''], [(g.sortie + g.erreur).includes(JETON_FAUX), g.code, g.erreur]);
refuse = true; vus.length = 0;
const gRefus = await lance(2);
dit('… une porte refusée : rien sur la sortie, UNE ligne sur la sortie d erreur tant que ça dure, sans jeton', ['', 1, false], [
  gRefus.sortie, gRefus.erreur.replace(/\r\n/g, '\n').split('\n').filter(Boolean).length, gRefus.erreur.includes(JETON_FAUX)]);
serveur.close();

/* ── ④ LE CÂBLAGE ── */
const sql = lit('supabase/migrations/0162_les_consignes_aux_assistants.sql');
const i0 = sql.indexOf('constraint assistants_consignes_statut check (statut in (');
const statutsSql = i0 >= 0 ? [...sql.slice(i0, sql.indexOf('))', i0)).matchAll(/'([a-z-]+)'/g)].map((m) => m[1]) : [];
dit('0162 : la contrainte des statuts porte exactement ceux du module pur', [...STATUTS_DE_CONSIGNE], statutsSql);
dit('0162 : la RLS ; la direction souveraine lit, écrit à SON nom une consigne neuve, retouche ; aucun effacement ; pas de temps réel ; le guetteur noté', [true, true, true, true, false, false, true], [
  sql.includes('alter table public.assistants_consignes enable row level security;'),
  /create policy assistants_consignes_lire on public\.assistants_consignes for select to authenticated\s+using \(public\.is_souverain\(\)\)/.test(sql),
  /for insert to authenticated\s+with check \(\s+public\.is_souverain\(\)\s+and de_user_id = auth\.uid\(\)\s+and statut = 'envoyee'/.test(sql),
  /create policy assistants_consignes_retoucher on public\.assistants_consignes for update to authenticated\s+using \(public\.is_souverain\(\)\) with check \(public\.is_souverain\(\)\)/.test(sql),
  /for delete/i.test(sql), /alter publication supabase_realtime/.test(sql),
  sql.includes('alter table public.assistants add column if not exists guette_le timestamptz;')]);
dit('0162 : les bornes de la base sont celles du module pur', [true, true, true], [
  sql.includes('check (length(texte) between 1 and 1000)'), sql.includes('length(reponse) <= 600'), sql.includes('length(passee_mot) <= 200')]);

const ecran = lit('src/apps/trone/routes/pilotage/Assistants.tsx');
const carteE = lit('src/apps/trone/routes/pilotage/ConsigneAuxAssistants.tsx');
const css = lit('src/apps/trone/routes/pilotage/consignes.css');
dit('l écran : la carte en haut des Assistants, avant le bouton du porteur, pour la direction seule', [true, true], [
  ecran.indexOf('<ConsigneAuxAssistants') > 0 && ecran.indexOf('<ConsigneAuxAssistants') < ecran.indexOf('{/* ══ ① LE BOUTON DU PORTEUR ══ */}'),
  ecran.includes('{(!monProfil || estSouverain) && <ConsigneAuxAssistants decisions={decisions} ouvrirLaCarte={ouvrirLaCarte} />}')]);
dit('… la carte : le titre, le choix au-dessus du champ, la dictée de la Maison, l envoi au nom de l assistant, le fil', [true, true, true, true, true], [
  carteE.includes('<h3 className="csg-titre">Écrire à un assistant</h3>'), carteE.indexOf('role="radiogroup"') < carteE.indexOf('<textarea'),
  carteE.includes("from '../../../../shared/oreille'"), carteE.includes('Envoyer à {pro.nom}'), carteE.includes('aria-label="Le fil des consignes"')]);
dit('… Défaire passe par les magasins du Trône (donc au Journal des gestes), jamais par la fonction', [true, true, false], [
  carteE.includes('setAppts((prev) => prev.map((a) => {'), carteE.includes('planDuDefaire(c.defaire ?? [], rdvs, ms)'), /functions\.invoke|appelleLaPorteDuSouverain/.test(carteE)]);
dit('… indigo et cuivre : aucun vert, rouge ni jaune', false, /#0A7A6C|--ast-ok|--ast-alerte|--alarme|#A3402B|\b(red|green|yellow)\b/i.test(css + carteE));
const neufs = [lit('src/shared/consignes-pur.ts'), lit('src/shared/consignes.ts'), carteE, css, sql, lit('scripts/guetteur-des-consignes.mjs'), lit('scripts/serveur/assistants-maison.ts'), lit('scripts/assistants-maison.mjs')].join('\n');
dit('les textes : sans tiret long, sans « salon », sans numéro réel', [false, false, false], [
  neufs.includes(String.fromCharCode(0x2014)), /\bsalon\b/i.test(neufs), /\+?229\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/.test(neufs)]);
const charte = lit('docs/ASSISTANTS.md');
dit('la charte dit le guetteur, le fait seul avec son défaire, le oui par la carte sans --notifier, le passage', [true, true, true, true], [
  charte.includes('## 22. Les consignes de la direction') && charte.includes('scripts/guetteur-des-consignes.mjs'),
  charte.includes("consigne repondre --id <id> --statut faite --reponse \"…\" --defaire '<json>'"),
  charte.includes('(`decision deposer`, SANS `--notifier`)'), charte.includes('consigne passer --id <id> --pour <assistant>')]);
const maquette = lit('public/maquette-consigne-aux-assistants.html');
dit('la maquette copiée : marquée construite, lot 1 ; aucune cliente nommée', [true, true, false], [
  maquette.includes('Maquette construite, lot 1'), maquette.startsWith('<!doctype html>'), /Edna|Zinsou|Adjarat|Vicentia|Anne Marie/.test(maquette)]);
dit('le guetteur recopie la ligne du module pur', true, lit('scripts/guetteur-des-consignes.mjs').includes('const ligneDuGuetteur = (c) => `consigne ${c.id} pour ${c.pour} : ${debutDuTexte(c.texte)}`;'));

try { rmSync(temp, { recursive: true, force: true }); } catch { /* libéré plus tard */ }
console.log(ko === 0 ? `\nLes consignes tiennent : ${n} vérifications.` : `\n${ko} ECHEC sur ${n}.`);
process.exitCode = ko ? 1 : 0;
