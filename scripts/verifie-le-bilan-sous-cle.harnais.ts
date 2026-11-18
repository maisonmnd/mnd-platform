/* LA VISIO LIMITÉE, DÉPLACÉE, ET LE BILAN SOUS CLÉ, ÉPROUVÉS — 17 novembre 2026
   (« La consultation en affiches », le côté serveur).
   `node scripts/verifie-le-bilan-sous-cle.mjs` ; `--prouve` remet chaque
   faute une à une et le banc doit crier.

   ① la limite : une visio par numéro tous les 90 jours, les manquées comptent,
     une visio annulée à temps ne compte pas ;
   ② changer l'heure : jusqu'à 2 heures avant, deux fois au plus, la Maison sans compter ;
   ③ les affiches d'après la visio : une seule fonction, selon son parcours ;
   ④ la consultation privée au Carnet : les règles de l'agenda, 08:30 ;
   ⑤ le dépôt gardé par le serveur, la lecture faite au Trône ;
   ⑥ la VRAIE fonction visio-salle, contre une base, un Daily et un Meta simulés ;
   ⑦ les branchements : les écrans, la migration 0216.
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  REGLAGES_DE_DEPART, affichesDeLaSuite, annuleeATemps, changementPermis, changementsRestants, creneauDuChangement, limiteDe, nomDeLaSalle,
  pourLeBilan, reglagesSurs, resumeSur, rituelSur, sansLocksEncore,
} from '../src/shared/visio-pur';
import { lienLu } from '../src/shared/lien-reservation';
import { agendaDepuisLesLignes } from '../src/shared/place-du-serveur';
import { idDuRdvDeLaPrivee, laPriveeTient, momentSur, placesDeLaPrivee, rdvDeLaPrivee } from '../src/shared/consultation-privee-pur';
import { annonceDuDepot, depotPropre, idDeConsultation } from '../src/shared/depot-de-la-consultation-pur';
import { lectureDeLaMaison, pointsDuBesoin } from '../src/shared/lecture-de-la-maison-pur';
import type { ReglagesDesBesoins } from '../src/shared/besoins-pur';
import type { PrestationBrute } from '../src/shared/estimation-pur';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const J = 86_400_000;
const T = (iso: string) => Date.parse(iso);

/* ── ① LA LIMITE ─────────────────────────────────────────────────────── */
const R = { ...REGLAGES_DE_DEPART(), actif: true };
const N = T('2026-11-17T09:00:00.000Z');
const il = (jours: number) => new Date(N - jours * J).toISOString();
dit('① les reglages de depart : 90 jours, 2 heures, 2 fois, les visios hors du Carnet, la privee 60 minutes', [90, 120, 2, false, 60, 1],
  [R.limiteJours, R.changementAvantMin, R.changementsMax, R.auCarnet, R.priveeDureeMin, R.parTelephone]);
dit('① des reglages sales restent bornes', [365, 0, 5, false, 15], (() => {
  const s = reglagesSurs({ limiteJours: 9999, changementAvantMin: -4, changementsMax: 12, auCarnet: 'oui', priveeDureeMin: 1 });
  return [s.limiteJours, s.changementAvantMin, s.changementsMax, s.auCarnet, s.priveeDureeMin];
})());
dit('① sans visio, la porte est ouverte', { ok: true }, limiteDe([], R, N));
dit('① une visio tenue il y a 30 jours ferme la porte, et dit quand elle rouvre', { ok: false, prochaineLe: '2027-01-16', aVenir: false },
  limiteDe([{ debut: '2026-10-18T09:15:00.000Z', statut: 'tenue' }], R, N));
dit('① une visio manquee compte (89 jours), une visio de 91 jours ne compte plus', [false, true],
  [limiteDe([{ debut: il(89), statut: 'manquée' }], R, N).ok, limiteDe([{ debut: il(91), statut: 'tenue' }], R, N).ok]);
const dans3j = new Date(N + 3 * J).toISOString();
dit('① annulee a temps (3 h avant) : ne compte pas ; trop tard (30 min avant) : compte', [true, false], [
  limiteDe([{ debut: il(10), statut: 'annulée', annuleeLe: new Date(T(il(10)) - 3 * 3_600_000).toISOString(), annuleePar: 'cliente' }], R, N).ok,
  limiteDe([{ debut: il(10), statut: 'annulée', annuleeLe: new Date(T(il(10)) - 30 * 60_000).toISOString(), annuleePar: 'cliente' }], R, N).ok,
]);
dit('① annulee par la Maison, meme tard, ou sans heure connue : ne compte pas', [true, true, true], [
  limiteDe([{ debut: il(10), statut: 'annulée', annuleeLe: new Date(T(il(10)) - 60_000).toISOString(), annuleePar: 'maison' }], R, N).ok,
  limiteDe([{ debut: il(10), statut: 'annulée' }], R, N).ok,
  annuleeATemps({ debut: il(10), statut: 'annulée', annuleeLe: new Date(T(il(10)) - 120 * 60_000).toISOString() }, 120),
]);
dit('① une visio a venir ferme aussi la porte (deja reservee)', { ok: false, prochaineLe: new Date(N + 93 * J + 3_600_000).toISOString().slice(0, 10), aVenir: true },
  limiteDe([{ debut: dans3j, statut: 'réservée' }], R, N));
dit('① deux visios par periode : la seconde passe, la troisieme attend la plus ancienne des deux', [true, { ok: false, prochaineLe: new Date(N - 40 * J + 90 * J + 3_600_000).toISOString().slice(0, 10), aVenir: false }], [
  limiteDe([{ debut: il(40), statut: 'tenue' }], { ...R, parTelephone: 2 }, N).ok,
  limiteDe([{ debut: il(40), statut: 'tenue' }, { debut: il(5), statut: 'manquée' }], { ...R, parTelephone: 2 }, N),
]);
dit('① sans periode (0 jour), seules les visios a venir comptent', [true, { ok: false, prochaineLe: '', aVenir: true }], [
  limiteDe([{ debut: il(1), statut: 'tenue' }], { ...R, limiteJours: 0 }, N).ok,
  limiteDe([{ debut: dans3j, statut: 'réservée' }], { ...R, limiteJours: 0 }, N),
]);

/* ── ② CHANGER L'HEURE ───────────────────────────────────────────────── */
const V = { debut: '2026-11-18T09:15:00.000Z', statut: 'réservée', deplacements: 0 };
const D = T(V.debut);
dit('② jusqu a 2 heures avant : 2 h 01 oui, 2 h pile oui, 1 h 59 non', ['permis', 'permis', 'trop-tard'],
  [D - 121 * 60_000, D - 120 * 60_000, D - 119 * 60_000].map((t) => changementPermis(V, R, t)));
dit('② deux fois au plus : une fois oui, deux fois non', ['permis', 'trop-de-fois', 1, 0],
  [changementPermis({ ...V, deplacements: 1 }, R, N), changementPermis({ ...V, deplacements: 2 }, R, N), changementsRestants({ deplacements: 1 }, R), changementsRestants({ deplacements: 3 }, R)]);
dit('② la Maison deplace sans compter, jusqu au debut ; jamais une visio tenue ou annulee', ['permis', 'trop-tard', 'pas-reservee', 'pas-reservee'], [
  changementPermis({ ...V, deplacements: 2 }, R, D - 60_000, true), changementPermis(V, R, D, true),
  changementPermis({ ...V, statut: 'tenue' }, R, N, true), changementPermis({ ...V, statut: 'annulée' }, R, N),
]);
const mardi9h = T('2026-11-17T08:00:00.000Z');
dit('② le quart d heure vise : libre et dans la grille ; a 75 minutes, la Maison seule ; pris, personne', [true, false, true, false, false], [
  creneauDuChangement(R, mardi9h, [], '2026-11-18T09:00:00.000Z'),
  creneauDuChangement(R, mardi9h, [], '2026-11-17T09:15:00.000Z'),
  creneauDuChangement(R, mardi9h, [], '2026-11-17T09:15:00.000Z', true),
  creneauDuChangement(R, mardi9h, ['2026-11-18T09:00:00.000Z'], '2026-11-18T09:00:00.000Z', true),
  creneauDuChangement(R, mardi9h, [], '2026-11-18T09:05:00.000Z', true),
]);
dit('② une visio deplacee recoit une salle neuve (le nom suit l heure)', true, nomDeLaSalle('vz-abc123', V.debut) !== nomDeLaSalle('vz-abc123', '2026-11-19T09:15:00.000Z'));

/* ── ③ LES AFFICHES D'APRÈS LA VISIO ─────────────────────────────────── */
const RIT = { besoin: 'entretien' as const, serviceIds: ['sv-a', 'sv-b'], noms: ['Le Shampoing', 'L’Hydratation'] };
const A = affichesDeLaSuite({ niveau: 'douce', rituel: RIT, privee: true }, 'cg-1');
dit('③ « Votre rituel » mene a la reservation deja remplie, que le site relit', ['Votre rituel', '/reserver/?r=entretien.sv-a~sv-b', ['sv-a', 'sv-b']],
  [A.rituel?.nom, A.rituel?.chemin, lienLu((A.rituel?.chemin ?? '').replace('/reserver/', '')).gestes]);
dit('③ « Consultation privée » : devant vos locks, deduits de votre rituel, sa consultation dans le lien',
  ['Consultation privée', 'À la Maison, devant vos locks', 'déduits de votre rituel', '/consultation/?privee=cg-1'],
  [A.privee?.nom, A.privee?.ligne, A.privee?.unite, A.privee?.chemin]);
const SL = affichesDeLaSuite({ niveau: 'aucune', privee: true }, 'cg-1', true);
dit('③ sans locks encore : devant vos cheveux, deduits de votre creation', ['À la Maison, devant vos cheveux', 'déduits de votre création'], [SL.privee?.ligne, SL.privee?.unite]);
dit('③ son parcours se lit dans sa consultation', [true, false, false], [sansLocksEncore({ couronne: { nees: 'aucune' } }), sansLocksEncore({ couronne: { nees: 'maison' } }), sansLocksEncore(null)]);
const INT = affichesDeLaSuite({ niveau: 'intensive', rituel: RIT }, 'cg-1');
dit('③ des la reparation intensive, la consultation privee seule s affiche', [false, true], [!!INT.rituel, !!INT.privee]);
dit('③ rien de propose, rien d affiche ; un resume d avant (« privee ») garde son affiche', [{}, true, false],
  [affichesDeLaSuite({ niveau: 'douce' }, 'cg-1'), !!affichesDeLaSuite({ suite: 'privee' }, null).privee, !!affichesDeLaSuite({ suite: 'soins' }, null).rituel]);
dit('③ « Je ne sais pas » ne se remet jamais tel quel : « À voir avec la Maison »', ['À voir avec la Maison', 'À voir avec la Maison', 'Le Shampoing', ['Le Shampoing', 'À voir avec la Maison']],
  [pourLeBilan('Je ne sais pas'), pourLeBilan('  je ne sais pas. '), pourLeBilan('Le Shampoing'),
    affichesDeLaSuite({ rituel: { besoin: 'entretien', serviceIds: ['a', 'b'], noms: ['Le Shampoing', 'Je ne sais pas'] } }).rituel?.noms]);
dit('③ un rituel sale est nettoye : identifiants du catalogue, six au plus, sans doublon', [['a', 'b'], 6, null], [
  rituelSur({ serviceIds: ['a', '<script>', 'a', 'b'], noms: ['A', 'x', 'A', 'B'] })?.serviceIds,
  rituelSur({ serviceIds: ['1', '2', '3', '4', '5', '6', '7', '8'], noms: [] })?.serviceIds.length,
  rituelSur({ serviceIds: [] }),
]);
dit('③ le resume garde le rituel et la privee, jamais un prix invente', [{ niveau: 'douce', rituel: RIT, privee: true }, undefined],
  [resumeSur({ niveau: 'douce', rituel: RIT, privee: true, prix: 5 }), (resumeSur({ niveau: 'douce', rituel: { ...RIT, prixXof: 9 } })?.rituel as Record<string, unknown> | undefined)?.prixXof]);

/* ── ④ LA CONSULTATION PRIVÉE AU CARNET ──────────────────────────────── */
const SEMAINE = [
  { key: 'lun', open: '08h00', close: '19h00', closed: true }, { key: 'mar', open: '08h00', close: '20h30', closed: false },
  { key: 'mer', open: '08h00', close: '20h30', closed: false }, { key: 'jeu', open: '08h00', close: '20h30', closed: false },
  { key: 'ven', open: '08h00', close: '20h30', closed: false }, { key: 'sam', open: '09h00', close: '20h00', closed: false },
  { key: 'dim', open: '10h00', close: '16h00', closed: true },
];
const AGENDA = agendaDepuisLesLignes({
  branche: { id: 'br', data: { masters: ['Team', 'Expert'] } }, reglages: { hours: SEMAINE }, exceptions: [],
  services: [], categories: [], blocages: [], occupes: [{ jour: '2026-11-18', maitre: 'Team', debut: '10:00', duree: 120 }],
})!;
const LUNDI = T('2026-11-16T07:00:00.000Z'); // lundi 16 novembre, 08:00 a Cotonou
dit('④ le premier rendez-vous est a 08:30, jamais 08:00', [{ ok: true, maitres: ['Team', 'Expert'] }, { ok: false, erreur: 'creneau_pris' }], [
  laPriveeTient(AGENDA, { jour: '2026-11-17', heure: '08:30' }, 60, LUNDI), laPriveeTient(AGENDA, { jour: '2026-11-17', heure: '08:00' }, 60, LUNDI),
]);
dit('④ une place en ligne a la fois : libre avant le rituel, prise s il le chevauche', [true, false, false], [
  laPriveeTient(AGENDA, { jour: '2026-11-18', heure: '09:00' }, 60, LUNDI).ok,
  laPriveeTient(AGENDA, { jour: '2026-11-18', heure: '09:00' }, 120, LUNDI).ok,
  laPriveeTient(AGENDA, { jour: '2026-11-18', heure: '10:00' }, 60, LUNDI).ok,
]);
dit('④ jamais le jour meme, jamais un jour ferme, jamais apres la borne', ['creneau_hors_fenetre', 'creneau_ferme', 'creneau_hors_fenetre'], [
  laPriveeTient(AGENDA, { jour: '2026-11-16', heure: '10:00' }, 60, LUNDI), laPriveeTient(AGENDA, { jour: '2026-11-22', heure: '10:00' }, 60, LUNDI),
  laPriveeTient(AGENDA, { jour: '2027-06-01', heure: '10:00' }, 60, LUNDI),
].map((v) => (v.ok ? 'ok' : v.erreur)));
const PLACES = placesDeLaPrivee(AGENDA, 60, LUNDI, 3);
dit('④ les moments proposes : mardi 08:30 d abord, aucun 08:00, rien aujourd hui', [{ iso: '2026-11-17', heure: '08:30' }, false, false],
  [PLACES[0], PLACES.some((p) => p.heure === '08:00'), PLACES.some((p) => p.iso === '2026-11-16')]);
dit('④ un moment mal ecrit est ecarte', [null, null, { jour: '2026-11-17', heure: '08:30' }],
  [momentSur({ jour: '17/11/2026', heure: '08:30' }), momentSur({ jour: '2026-11-17', heure: '8h30' }), momentSur({ jour: '2026-11-17', heure: '08:30', autre: 1 })]);
const RDV = rdvDeLaPrivee({ consultationId: 'cg-1', branchId: 'br', prenom: 'Awa', moment: { jour: '2026-11-17', heure: '08:30' }, dureeMin: 60, maintenantIso: '2026-11-16T07:00:00.000Z', regleXof: 15000, reference: 'tx1' });
dit('④ le rendez-vous : sans prestation, ni prix ni acompte, son nom, sa duree, toujours le meme identifiant',
  ['rdv-privee-cg-1', [], 'Consultation privée', 0, 60, 'confirmé', 'consultation', false, 'rdv-privee-cg-1'],
  [RDV.id, RDV.serviceIds, (RDV.forfait as { nom: string }).nom, (RDV.forfait as { totalXof: number }).totalXof, RDV.dureeMin, RDV.status, RDV.source,
    'depositXof' in RDV || 'paidXof' in RDV || 'depositConfirmed' in RDV, idDuRdvDeLaPrivee('cg-1')]);

/* ── ⑤ LE DÉPÔT GARDÉ PAR LE SERVEUR, LA LECTURE FAITE AU TRÔNE ───────── */
const DEPOT = {
  id: 'cg-celle-d-une-autre', createdAt: '2020-01-01', status: 'traitée', paidXof: 15000, transactionId: 'tx', visio: { id: 'vz-x' }, rdvId: 'rdv-x', momentFixe: 'demain',
  parcours: 'creation', client: { name: '  Awa  ', phone: '+229 01 97 00 00 01', city: '', currency: 'XOF' },
  answers: { familles: ['creer'], besoins: ['mots'], cache: { estimation: { min: 1 }, prix: 5, garde: 'ok' } },
  besoins: [{ id: 'b1', mots: 'Mes locks sont seches', points: 10 }],
  couronne: { locks: 120, longueur: 'court', nees: 'ailleurs', pour: 'moi' },
  estimation: { lignes: [{ serviceId: 's1', nom: 'X', min: 1, max: 2, retenue: true }], aConfirmer: [], min: 1, max: 2, aChiffrer: 0 },
  diagnostic: { palier: 'IV', scores: { a: 1 } }, moment: { jour: '2026-11-17', heure: '08:30' }, branchId: 'br-1',
};
const P = depotPropre(DEPOT, { parLEquipe: false });
const PD = (P.ok ? P.data : {}) as Record<string, unknown>;
dit('⑤ le depot public ne garde ni estimation, ni diagnostic, ni rien de ce que le serveur ecrit', [],
  ['id', 'createdAt', 'status', 'paidXof', 'transactionId', 'visio', 'rdvId', 'momentFixe', 'estimation', 'diagnostic', 'moment'].filter((k) => k in PD));
dit('⑤ ... a toute profondeur, et les points d un besoin non plus', [{ familles: ['creer'], besoins: ['mots'], cache: { garde: 'ok' } }, [{ id: 'b1', mots: 'Mes locks sont seches' }]], [PD.answers, PD.besoins]);
dit('⑤ ... il garde ce qu elle a dit : qui elle est, sa couronne, son moment voulu',
  [{ name: 'Awa', phone: '+229 01 97 00 00 01', city: '', currency: 'XOF' }, DEPOT.couronne, { jour: '2026-11-17', heure: '08:30' }, 'creation', 'auto', 'br-1'],
  [PD.client, PD.couronne, PD.momentVoulu, PD.parcours, PD.modalite, PD.branchId]);
dit('⑤ sans numero, trop gros, ou pas un objet : refuse', ['incomplet', 'too large', 'bad request'], [
  depotPropre({ client: { name: 'A', phone: '12' } }, { parLEquipe: false }), depotPropre({ client: { phone: '97000001' }, x: 'y'.repeat(20_001) }, { parLEquipe: false }),
  depotPropre('texte', { parLEquipe: false }),
].map((r) => (r.ok ? 'ok' : r.erreur)));
const E = depotPropre(DEPOT, { parLEquipe: true });
dit('⑤ une session de l equipe (le tunnel de la Maison) garde son diagnostic, jamais le reglement ni l etat', [true, false, false],
  [E.ok && 'diagnostic' in E.data, E.ok && 'paidXof' in E.data, E.ok && 'status' in E.data]);
const hasard = (k: number) => globalThis.crypto.getRandomValues(new Uint8Array(k));
dit('⑤ l identifiant est fait par le serveur : cg- et vingt signes, jamais deux fois le meme', [true, true], [/^cg-[a-z0-9]{20}$/.test(idDeConsultation(hasard)), idDeConsultation(hasard) !== idDeConsultation(hasard)]);
dit('⑤ l annonce a l equipe ne porte aucun montant', [true, false], [annonceDuDepot(PD).title === 'Consultation en ligne · Awa', /\d{4,}| F\b|estimation/i.test(annonceDuDepot(PD).body)]);
const PN = lf('supabase/functions/push-notify/index.ts');
const SRC = lf('src/shared/depot-de-la-consultation-pur.ts');
const bloc = (s: string) => { const i = s.indexOf('/* ⟨depot-de-la-consultation⟩ */'); const k = s.indexOf('/* ⟨/depot-de-la-consultation⟩ */'); return i < 0 || k < 0 ? null : s.slice(i, k); };
const TS = PN.slice(PN.indexOf("if (body.mode === 'tunnel-submit') {"), PN.indexOf("if (body.mode === 'staff') {"));
dit('⑤ push-notify porte la meme regle, mot pour mot', true, !!bloc(SRC) && bloc(SRC) === bloc(PN));
dit('⑤ push-notify : l identifiant du navigateur n est garde que pour une session de l equipe', true,
  TS.includes('const id = equipe && idPresente ? idPresente : idDeConsultation((n) => crypto.getRandomValues(new Uint8Array(n)));'));
dit('⑤ push-notify : un depot s insere, il n ecrase rien, et rend son identifiant', [true, false, true], [
  /await admin\.from\('consultations_queue'\)\.insert\(\{\n\s*id,/.test(TS), /consultations_queue'\)\.upsert\(/.test(TS), TS.includes('return json({ ok: true, id, sent, version: VERSION'),
]);
dit('⑤ push-notify : le depot passe par depotPropre, l annonce publique est ecrite au serveur', [true, true, true], [
  TS.includes('const propre = depotPropre(c.data, { parLEquipe: equipe });'), TS.includes(': annonceDuDepot(data);'), PN.includes("const VERSION = '2026-11-18-b';"),
]);
/* La lecture, au Trône. */
const BES: ReglagesDesBesoins = {
  version: 1, familles: [{ id: 'f', nom: 'F' }],
  besoins: [{ id: 'b1', famille: 'f', mots: 'Mes locks sont seches', points: 10, prestations: ['s1', 's2', 's-archivee'] }],
  seuils: [0, 20, 40, 70], bornes: [15000, 40000, 100000], preuves: { photo: 10, visio: 15, privee: 25 },
  sansSeuil: ['s1'], paliersPoses: {}, ecartesParLaPeau: [],
};
const SV: PrestationBrute[] = [
  { id: 's1', name: 'Hydratation', priceXof: 10000 }, { id: 's2', name: 'Reconstruction', priceXof: 50000 }, { id: 's-archivee', name: 'Vieille', priceXof: 1000, archived: true },
];
const L = lectureDeLaMaison({ besoins: PD.besoins as { id: string }[], couronne: { locks: 120, longueur: 'court' } }, BES, SV, []);
dit('⑤ la lecture se refait au Trone, sur son catalogue : la proposee, celle a confirmer, le total',
  [[{ serviceId: 's1', nom: 'Hydratation', min: 10000, max: 10000, retenue: true }], ['s2'], 10000, 10000],
  [L?.lignes, L?.aConfirmer.map((x) => x.serviceId), L?.min, L?.max]);
dit('⑤ ... sans besoin reconnu, rien ; les points se lisent dans les reglages du Trone', [null, 10, null],
  [lectureDeLaMaison({ besoins: [] }, BES, SV, []), pointsDuBesoin(BES, 'b1'), pointsDuBesoin(BES, 'inconnu')]);

/* ── ⑥ LA VRAIE FONCTION, CONTRE UNE BASE SIMULÉE ────────────────────── */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  documents: [], visios: [], consultations_queue: [], envois: [], edge_rate_limits: [], staff: [{ user_id: 'u-equipe' }],
  appointments: [], demandes: [], payments: [], branches: [{ id: 'br', data: { masters: ['Team', 'Expert'], flagship: true } }], blocages: [],
};
let horloge = LUNDI;
let compteur = 0;
const rpcAppels: { nom: string; args: Row }[] = [];
const fetchAppels: string[] = [];
const lit = (r: Row, col: string): unknown => {
  const m = /^(\w+)->>(\w+)$/.exec(col);
  if (m) { const v = r[m[1]]?.[m[2]]; return v === undefined || v === null ? null : String(v); }
  return r[col];
};
const cmp = (a: unknown, b: unknown): number => {
  const [x, y] = [Date.parse(String(a)), Date.parse(String(b))];
  if (typeof a === 'string' && typeof b === 'string' && Number.isFinite(x) && Number.isFinite(y) && /^\d{4}-/.test(a) && /^\d{4}-/.test(b)) return x - y;
  return a === b ? 0 : String(a) < String(b) ? -1 : 1;
};
const doublon = (table: string, row: Row, sauf?: Row): string | null => {
  if (table !== 'visios' || row.statut === 'annulée') return null;
  return tables.visios.some((o) => o !== sauf && o.statut !== 'annulée' && Date.parse(o.debut) === Date.parse(row.debut))
    ? 'duplicate key value violates unique constraint "visios_un_quart_d_heure"' : null;
};
class Requete {
  private filtres: ((r: Row) => boolean)[] = [];
  private action: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private charge: any;
  private tete = false;
  private un = false;
  private max = Infinity;
  private tri: [string, boolean] | null = null;
  constructor(private table: string) { if (!tables[table]) tables[table] = []; }
  select(_c?: string, o?: { head?: boolean }) { if (o?.head) this.tete = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => cmp(lit(r, c), v) === 0); return this; }
  neq(c: string, v: unknown) { this.filtres.push((r) => cmp(lit(r, c), v) !== 0); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => cmp(lit(r, c), v) >= 0); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => cmp(lit(r, c), v) <= 0); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.includes(lit(r, c))); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.tri = [c, o?.ascending !== false]; return this; }
  limit(k: number) { this.max = k; return this; }
  maybeSingle() { this.un = true; return this; }
  insert(x: Row) { this.action = 'insert'; this.charge = x; return this; }
  update(x: Row) { this.action = 'update'; this.charge = x; return this; }
  upsert(x: Row) { this.action = 'upsert'; this.charge = x; return this; }
  private fais(): { data: any; error: any; count?: number } {
    const t = tables[this.table];
    const marque = (r: Row) => { r.updated_at = `u${++compteur}`; return r; };
    if (this.action === 'insert') {
      const row = { ...this.charge };
      if (row.id !== undefined && t.some((o) => o.id === row.id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pkey"' } };
      const d = doublon(this.table, row);
      if (d) return { data: null, error: { code: '23505', message: d } };
      if (this.table === 'edge_rate_limits') row.at = new Date(horloge).toISOString();
      if (this.table === 'visios') row.deplacements = row.deplacements ?? 0;
      t.push(marque(row));
      return { data: [row], error: null };
    }
    if (this.action === 'upsert') {
      const i = t.findIndex((o) => o.id === this.charge.id);
      if (i >= 0) t[i] = marque({ ...t[i], ...this.charge }); else t.push(marque({ ...this.charge }));
      return { data: null, error: null };
    }
    const lignes = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.action === 'update') {
      for (const r of lignes) {
        const apres = { ...r, ...this.charge };
        const d = doublon(this.table, apres, r);
        if (d) return { data: null, error: { code: '23505', message: d } };
        /* Le déclencheur de 0216 : l'heure de l'annulation est celle de la base. */
        if (this.table === 'visios' && apres.statut === 'annulée' && r.statut !== 'annulée') { apres.annulee_le = new Date(horloge).toISOString(); apres.annulee_par = this.charge.annulee_par ?? 'cliente'; }
        Object.assign(r, marque(apres));
      }
      return { data: lignes.map((r) => ({ id: r.id })), error: null };
    }
    let vues = [...lignes];
    if (this.tri) { const [c, asc] = this.tri; vues.sort((a, b) => (asc ? 1 : -1) * cmp(lit(a, c), lit(b, c))); }
    vues = vues.slice(0, this.max);
    if (this.tete) return { data: null, error: null, count: lignes.length };
    return { data: this.un ? (vues[0] ?? null) : vues, error: null };
  }
  then<T>(ok: (v: { data: any; error: any; count?: number }) => T, ko?: (e: unknown) => T) { return Promise.resolve().then(() => this.fais()).then(ok, ko); }
}
const base = {
  from: (t: string) => new Requete(t),
  auth: { getUser: async (jeton: string) => ({ data: { user: jeton === 'session-equipe' ? { id: 'u-equipe' } : null } }) },
  rpc: async (nom: string, args: Row) => {
    rpcAppels.push({ nom, args });
    if (nom === 'creneaux_occupes') {
      return { data: tables.appointments.filter((a) => a.data.branchId === args.p_branch && a.data.status !== 'annulé' && a.data.date >= args.p_du && a.data.date <= args.p_au)
        .map((a) => ({ jour: a.data.date, maitre: a.data.master ?? '', debut: a.data.time, duree: a.data.dureeMin ?? 60 })), error: null };
    }
    if (nom === 'pose_si_libre') {
      const rdv = args.p_rdv as Row;
      const deja = tables.appointments.find((a) => a.id === rdv.id);
      if (deja) return { data: { ok: true, verdict: 'deja', id: rdv.id, master: deja.data.master }, error: null };
      const master = (args.p_maitres as string[])[0] ?? '';
      tables.appointments.push({ id: rdv.id, branch_id: rdv.branchId, data: { ...rdv, master }, updated_at: `u${++compteur}` });
      if (args.p_demande) tables.demandes.push({ id: args.p_demande.id, data: { ...args.p_demande, apptId: rdv.id } });
      return { data: { ok: true, verdict: 'pose', id: rdv.id, master }, error: null };
    }
    return { data: null, error: { message: 'rpc inconnue' } };
  },
};
const env: Record<string, string> = { SUPABASE_URL: 'https://base.test', CLE_SERVICE: 'cle', DAILY_API_KEY: 'daily', WA_TEMPLATE_VISIO: 'visio_mnd', WA_TOKEN: 'jeton', WA_PHONE_ID: '1' };
const aLHeure = (iso: string) => {
  horloge = T(iso);
  const f = tables.documents.find((d) => d.key === 'mnd_facteur');
  if (f) f.data = { vuLe: new Date(horloge).toISOString() };
  tables.edge_rate_limits.length = 0;
};
const VISIO_DOC = { actif: true, jours: [2, 3, 4, 5, 6], heures: ['10:00', '10:15', '10:30', '10:45'], horizonJours: 7, delaiMin: 120, parTelephone: 1 };
tables.documents.push(
  { key: 'mnd_visio', data: { ...VISIO_DOC } }, { key: 'mnd_facteur', data: { vuLe: new Date(horloge).toISOString() } },
  { key: 'mnd_auto_config', data: {} }, { key: 'mnd_settings', data: { hours: SEMAINE } }, { key: 'mnd_horaires_exceptions', data: [] },
);
tables.consultations_queue.push(
  { id: 'cg-a', data: { id: 'cg-a', branchId: 'br', client: { name: 'Awa K', phone: '0197000001' }, couronne: { nees: 'aucune' } } },
  { id: 'cg-p', data: { id: 'cg-p', branchId: 'br', parcours: 'sos', client: { name: 'Sika D', phone: '0197000009' } } },
  { id: 'cg-q', data: { id: 'cg-q', branchId: 'br', parcours: 'creation', client: { name: 'Rama', phone: '0197000010' }, momentVoulu: { jour: '2026-11-19', heure: '09:00' } } },
);
const vraiNow = Date.now;
Date.now = () => horloge;
const vraiFetch = globalThis.fetch;
globalThis.fetch = (async (u: string) => {
  fetchAppels.push(String(u));
  return new Response(JSON.stringify({ url: 'https://salle.test/x', token: 'entree' }), { status: 200 });
}) as typeof fetch;
const silence = console.log;
let handler: (req: Request) => Promise<Response> = async () => new Response('{}');
const source = readFileSync(process.env.VISIO_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', source)(() => base, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
let ipN = 0;
async function appelle(corps: Row, o: { equipe?: boolean } = {}): Promise<Row & { status: number }> {
  console.log = () => {};
  try {
    const r = await handler(new Request('https://base.test/functions/v1/visio-salle', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://maison.test', 'x-forwarded-for': `10.0.0.${++ipN % 250}`, ...(o.equipe ? { authorization: 'Bearer session-equipe' } : { authorization: 'Bearer cle-publique' }) },
      body: JSON.stringify(corps),
    }));
    return { ...((await r.json()) as Row), status: r.status };
  } finally { console.log = silence; }
}
const cot = (jour: string, hhmm: string) => new Date(T(`${jour}T${hhmm}:00.000Z`) - 3_600_000).toISOString();
const visio = (id: string) => tables.visios.find((v) => v.id === id) as Row;
const envoisDe = (id: string) => tables.envois.filter((e) => e.data?.visioId === id);
const ligneDEnvoi = (id: string) => tables.envois.find((e) => e.id === id) as Row | undefined;
const lienDe = (e: Row): string => String(e.data.colis.composants[0].parameters[2].text);
const jetonDe = (e: Row): string => lienDe(e).split('.').pop() as string;

/* a · les créneaux, la réservation, le billet */
const C0 = await appelle({ geste: 'creneaux' });
dit('⑥ les creneaux : la visio allumee, vingt quarts d heure', [true, 20], [C0.actif, (C0.creneaux as unknown[]).length]);
const R1 = await appelle({ geste: 'reserver', nom: 'Awa K', telephone: '0197000001', debut: cot('2026-11-17', '10:15'), consultationId: 'cg-a' });
const ID = String(R1.id);
dit('⑥ reserver : pose, sans le lien d entree dans la reponse, avec un billet', [true, false, true, true, true],
  [R1.ok, 'jeton' in R1, typeof R1.billet === 'string' && String(R1.chemin).endsWith(`${ID}.${R1.billet}`), R1.parWhatsApp, !JSON.stringify(R1).includes(jetonDe(envoisDe(ID)[0]))]);
const E1 = envoisDe(ID)[0];
dit('⑥ le lien d entree part sur WhatsApp : modele visio_mnd, trois parametres, deposee en salle', ['visio_mnd', 3, 'en-attente', 'visio', true, 'whatsapp', 'br'],
  [E1.data.colis.modele, E1.data.colis.composants[0].parameters.length, E1.data.statut, E1.data.type, lienDe(E1).startsWith(`https://maison.test/couronne/#/visio/${ID}.`), visio(ID).lien_etat, visio(ID).branch_id]);
dit('⑥ la consultation garde la trace de sa visio ; la visio ne prend pas de place au Carnet', [ID, 0], [tables.consultations_queue[0].data.visio?.id, tables.appointments.length]);
const ENTREE1 = jetonDe(E1);
const ET1 = await appelle({ geste: 'etat', id: ID, jeton: R1.billet });
dit('⑥ le billet montre l heure et ce qui peut changer, jamais le resume', [true, true, true, 2, 2, 120, null],
  [ET1.ok, ET1.billet, ET1.changement.permis, ET1.changement.reste, ET1.changement.max, ET1.changement.avantMin, ET1.resume]);
const EN1 = await appelle({ geste: 'entrer', id: ID, jeton: R1.billet });
const EN2 = await appelle({ geste: 'entrer', id: ID, jeton: ENTREE1 });
dit('⑥ le billet n ouvre jamais la salle ; le lien d entree, lui, attend son heure', [[403, 'par-whatsapp'], 'trop-tot'], [[EN1.status, EN1.motif], EN2.motif]);

/* d · la limite, à la réservation */
const R2 = await appelle({ geste: 'reserver', nom: 'Awa K', telephone: '+229 01 97 00 00 01', debut: cot('2026-11-18', '10:00') });
dit('⑥ une seconde visio au meme numero : refusee, la limite dite avec son jour', [409, false, 'limite', 'deja', '2027-02-15'], [R2.status, R2.ok, R2.raison, R2.motif, R2.prochaineLe]);
const R3 = await appelle({ geste: 'reserver', nom: 'Bola', telephone: '0197000077', debut: cot('2026-11-17', '10:15') });
dit('⑥ le meme quart d heure pour une autre : pris', 'pris', R3.motif);
const R4 = await appelle({ geste: 'reserver', nom: 'Chi', telephone: '123456789', debut: cot('2026-11-18', '10:00') });
dit('⑥ un numero que WhatsApp ne peut pas joindre n a pas de visio', [400, 'numero', 1], [R4.status, R4.motif, tables.visios.length]);

/* e · changer l'heure */
visio(ID).salle = 'mnd-ancienne'; visio(ID).salle_url = 'https://salle.test/ancienne';
const D1 = await appelle({ geste: 'deplacer', id: ID, jeton: R1.billet, debut: cot('2026-11-18', '10:00') });
const C1 = (await appelle({ geste: 'creneaux' })).creneaux as { debut: string }[];
dit('⑥ deplacer (par le billet) : la nouvelle heure, une fois comptee, il en reste une', [true, cot('2026-11-18', '10:00'), 1, 1, true], [D1.ok, visio(ID).debut, D1.deplacements, D1.reste, D1.parWhatsApp]);
dit('⑥ l ancien quart d heure se libere aussitot, le nouveau est pris', [true, false], [C1.some((c) => c.debut === cot('2026-11-17', '10:15')), C1.some((c) => c.debut === cot('2026-11-18', '10:00'))]);
dit('⑥ la salle d avant est oubliee : la visio en recevra une neuve', [null, null], [visio(ID).salle, visio(ID).salle_url]);
const E2 = envoisDe(ID).find((e) => e.id !== E1.id) as Row;
dit('⑥ la nouvelle heure part sur WhatsApp, l ancien message ne part plus', ['en-attente', true, 'périmé', 'visio déplacée'],
  [E2?.data.statut, String(E2?.data.colis.composants[0].parameters[1].text).includes('mercredi 18 novembre 2026 · 10:00'), E1.data.statut, E1.data.detail]);
const ENTREE2 = jetonDe(E2);
dit('⑥ par le billet, le lien d entree est neuf : l ancien n ouvre plus rien', [true, 404, true],
  [ENTREE2 !== ENTREE1, (await appelle({ geste: 'etat', id: ID, jeton: ENTREE1 })).status, (await appelle({ geste: 'etat', id: ID, jeton: ENTREE2 })).ok]);
dit('⑥ la consultation suit la nouvelle heure', cot('2026-11-18', '10:00'), tables.consultations_queue[0].data.visio?.debut);
const D2 = await appelle({ geste: 'deplacer', id: ID, jeton: ENTREE2, debut: cot('2026-11-19', '10:30') });
dit('⑥ deplacer (par son lien d entree) : seconde fois, il n en reste plus, son lien reste le sien', [true, 2, 0, true],
  [D2.ok, D2.deplacements, D2.reste, (await appelle({ geste: 'etat', id: ID, jeton: ENTREE2 })).ok]);
const D3 = await appelle({ geste: 'deplacer', id: ID, jeton: ENTREE2, debut: cot('2026-11-20', '10:00') });
dit('⑥ une troisieme fois : refusee, rien ne bouge', [409, 'trop-de-fois', cot('2026-11-19', '10:30')], [D3.status, D3.motif, visio(ID).debut]);
const D4 = await appelle({ geste: 'deplacer', id: ID, debut: cot('2026-11-20', '10:45') });
const D5 = await appelle({ geste: 'deplacer', id: ID, debut: cot('2026-11-20', '10:45') }, { equipe: true });
dit('⑥ la Maison deplace (session de l equipe seulement), sans compter dans ses deux fois', [403, true, 2, cot('2026-11-20', '10:45')], [D4.status, D5.ok, visio(ID).deplacements, visio(ID).debut]);
const E4 = envoisDe(ID).filter((e) => e.data.statut === 'en-attente').pop() as Row;
const ENTREE3 = jetonDe(E4);
dit('⑥ ... son lien est neuf lui aussi, et part sur WhatsApp avec la nouvelle heure', [true, 404, true, true],
  [ENTREE3 !== ENTREE2, (await appelle({ geste: 'etat', id: ID, jeton: ENTREE2 })).status, (await appelle({ geste: 'etat', id: ID, jeton: ENTREE3 })).ok,
    String(E4.data.colis.composants[0].parameters[1].text).includes('vendredi 20 novembre 2026 · 10:45')]);
const D6 = await appelle({ geste: 'deplacer', id: ID, debut: cot('2026-11-21', '10:07') }, { equipe: true });
dit('⑥ ... dans la grille seulement', 'pris', D6.motif);

/* i · les deux heures */
const RB = await appelle({ geste: 'reserver', nom: 'Bola', telephone: '0197000002', debut: cot('2026-11-20', '10:15') });
const IDB = String(RB.id);
aLHeure(cot('2026-11-20', '08:16'));
const DB1 = await appelle({ geste: 'deplacer', id: IDB, jeton: RB.billet, debut: cot('2026-11-21', '10:30') });
const EB1 = await appelle({ geste: 'etat', id: IDB, jeton: RB.billet });
dit('⑥ a 1 h 59 de l heure : trop tard, et la page ne propose plus le geste', [409, 'trop-tard', false, cot('2026-11-20', '10:15')], [DB1.status, DB1.motif, EB1.changement.permis, visio(IDB).debut]);
aLHeure(cot('2026-11-20', '08:15'));
const DB2 = await appelle({ geste: 'deplacer', id: IDB, jeton: RB.billet, debut: cot('2026-11-21', '10:30') });
dit('⑥ a 2 heures pile : permis', [true, cot('2026-11-21', '10:30')], [DB2.ok, visio(IDB).debut]);

/* j · annuler : tard, elle compte ; à temps, non */
aLHeure(cot('2026-11-21', '09:30'));
const AB = await appelle({ geste: 'annuler', id: IDB, jeton: RB.billet });
dit('⑥ annulee a une heure de la visio : elle compte, comme une visio manquee', [true, true, 'annulée', 'cliente'], [AB.ok, AB.compte, visio(IDB).statut, visio(IDB).annulee_par]);
aLHeure(cot('2026-11-24', '08:00'));
const RB2 = await appelle({ geste: 'reserver', nom: 'Bola', telephone: '0197000002', debut: cot('2026-11-25', '10:00') });
dit('⑥ ... la limite la retient : sa prochaine visio dans 90 jours', ['limite', 'limite', '2027-02-19'], [RB2.raison, RB2.motif, RB2.prochaineLe]);
const RC = await appelle({ geste: 'reserver', nom: 'Chi', telephone: '0197000003', debut: cot('2026-11-27', '10:00') });
const AC = await appelle({ geste: 'annuler', id: RC.id, jeton: RC.billet });
const RC2 = await appelle({ geste: 'reserver', nom: 'Chi', telephone: '0197000003', debut: cot('2026-11-27', '10:15') });
dit('⑥ annulee a temps (trois jours avant) : elle ne compte pas, elle en reserve une autre', [true, false, true], [AC.ok, AC.compte, RC2.ok]);
const RM = await appelle({ geste: 'reserver', nom: 'Dede', telephone: '0197000004', debut: cot('2026-11-25', '10:15') });
aLHeure(cot('2026-11-25', '09:40'));
visio(String(RM.id)).statut = 'annulée'; visio(String(RM.id)).annulee_le = new Date(horloge).toISOString(); visio(String(RM.id)).annulee_par = 'maison';
const RM2 = await appelle({ geste: 'reserver', nom: 'Dede', telephone: '0197000004', debut: cot('2026-11-27', '10:30') });
dit('⑥ annulee par la Maison, meme a 35 minutes : elle ne compte pas', true, RM2.ok);

/* k · après la visio : le résumé sous clé, la suite sur WhatsApp, vue sur sa page */
aLHeure(cot('2026-11-20', '10:46'));
visio(ID).statut = 'tenue';
visio(ID).resume = { niveau: 'douce', rituel: RIT, privee: true, estimationXof: 45000, par: 'Yeman' };
const ETK = await appelle({ geste: 'etat', id: ID, jeton: ENTREE3 });
const SV0 = await appelle({ geste: 'suite-vue', id: ID, jeton: ENTREE3 });
dit('⑥ pendant la visio, le resume ne sort pas ; « vue » ne se dit pas avant la fin', [null, false, 409], [ETK.resume, 'sansLocks' in ETK && ETK.sansLocks, SV0.status]);
const S0 = await appelle({ geste: 'suite', id: ID });
const S1 = await appelle({ geste: 'suite', id: ID }, { equipe: true });
const ES = tables.envois.find((e) => e.id === `env-${ID}-wa-suite-rituel`) as Row;
dit('⑥ la suite : l equipe seule ; « Votre rituel » depose par le modele de la reservation preparee, apres la fin de la visio',
  [403, 'en-attente', 'reservation_preparee', 'entretien.sv-a~sv-b', true],
  [S0.status, S1.rituel, ES?.data.colis.modele, ES?.data.colis.composants[1].parameters[0].text, T(ES?.data.partA) >= T(visio(ID).fin)]);
dit('⑥ ... « Consultation privée » attend son modele (aucun secret) : rien ne part', ['sans-modele', false], [S1.privee, tables.envois.some((e) => e.id === `env-${ID}-wa-suite-privee`)]);
env.WA_TEMPLATE_SUITE_PRIVEE = 'consultation_privee_proposee';
const S2 = await appelle({ geste: 'suite', id: ID }, { equipe: true });
const EP = tables.envois.find((e) => e.id === `env-${ID}-wa-suite-privee`) as Row;
dit('⑥ ... son modele approuve : la privee part, son lieu suit son parcours (sans locks : ses cheveux), le bouton porte sa consultation',
  ['en-attente', 'consultation_privee_proposee', ['Awa', 'à la Maison, devant vos cheveux'], 'cg-a', true],
  [S2.privee, EP?.data.colis.modele, EP?.data.colis.composants[0].parameters.map((x: Row) => x.text), EP?.data.colis.composants[1].parameters[0].text, T(EP?.data.partA) >= T(visio(ID).fin)]);
delete env.WA_TEMPLATE_SUITE_PRIVEE;
aLHeure(cot('2026-11-20', '11:01'));
const ETF = await appelle({ geste: 'etat', id: ID, jeton: ENTREE3 });
dit('⑥ la salle fermee, le bilan s ouvre : le resume, le rituel propose, son parcours', ['douce', ['sv-a', 'sv-b'], true, true], [ETF.resume?.niveau, ETF.resume?.rituel?.serviceIds, ETF.resume?.privee, ETF.sansLocks]);
const SV1 = await appelle({ geste: 'suite-vue', id: ID, jeton: ENTREE3 });
dit('⑥ vue sur sa page : le WhatsApp de la suite ne part plus', [true, 2, 'périmé', 'vue sur sa page', 'périmé', true], [SV1.ok, SV1.retires, ligneDEnvoi(`env-${ID}-wa-suite-rituel`)?.data.statut, ligneDEnvoi(`env-${ID}-wa-suite-rituel`)?.data.detail, ligneDEnvoi(`env-${ID}-wa-suite-privee`)?.data.statut, !!visio(ID).suite_vue_le]);
dit('⑥ ... et ne se redepose pas', 'vue', (await appelle({ geste: 'suite', id: ID }, { equipe: true })).rituel);
aLHeure(cot('2026-11-24', '08:00'));
const RT = await appelle({ geste: 'reserver', nom: 'Awa K', telephone: '0197000001', debut: cot('2026-11-25', '10:30') });
dit('⑥ sa visio tenue, la limite joue : 90 jours apres son heure', ['limite', 'limite', '2027-02-18'], [RT.raison, RT.motif, RT.prochaineLe]);
aLHeure(cot('2027-02-19', '08:00'));
const RT2 = await appelle({ geste: 'reserver', nom: 'Awa K', telephone: '0197000001', debut: cot('2027-02-20', '10:00') });
dit('⑥ ... et 91 jours plus tard, elle en reserve une autre', true, RT2.ok);

/* l · la consultation privée au Carnet */
aLHeure('2026-11-16T07:00:00.000Z');
const poses = () => rpcAppels.filter((a) => a.nom === 'pose_si_libre').length;
const P0 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-p', moment: { jour: '2026-11-17', heure: '08:30' } });
dit('⑥ la privee non reglee ne prend aucune place', [402, 'a-regler', 0], [P0.status, P0.motif, poses()]);
tables.payments.push({ id: 'tx1', data: { partnerId: 'cg-p', status: 'success', amountXof: 15000 } }, { id: 'tx2', data: { partnerId: 'cg-q', status: 'success', amountXof: 15000 } });
const P1 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-p', moment: { jour: '2026-11-17', heure: '08:00' } });
const cgp = () => tables.consultations_queue.find((c) => c.id === 'cg-p')!.data;
dit('⑥ reglee, a 08:00 : refusee (08:30 d abord), et la consultation garde le moment voulu et la raison', [409, 'creneau_pris', 0, { jour: '2026-11-17', heure: '08:00' }, 'creneau_pris'],
  [P1.status, P1.raison, poses(), cgp().momentVoulu, cgp().momentRefuse?.raison]);
const P2 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-p', moment: { jour: '2026-11-16', heure: '10:00' } });
dit('⑥ jamais le jour meme', 'creneau_hors_fenetre', P2.raison);
const P3 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-p', moment: { jour: '2026-11-17', heure: '08:30' } });
const POSE = rpcAppels.filter((a) => a.nom === 'pose_si_libre')[0]?.args as Row;
dit('⑥ a 08:30 : posee sous le verrou des places, avec les maitres libres et sa demande', [true, 'pose', 1, 'rdv-privee-cg-p', ['Team', 'Expert'], 'confirmé', 60, [], '+2290197000009', 'rdv'],
  [P3.ok, P3.verdict, poses(), POSE?.p_rdv.id, POSE?.p_maitres, POSE?.p_rdv.status, POSE?.p_rdv.dureeMin, POSE?.p_rdv.serviceIds, POSE?.p_demande.telephone, POSE?.p_demande.genre]);
dit('⑥ ... aucun argent sur le rendez-vous ; la consultation porte rdvId et son moment', [false, 'rdv-privee-cg-p', 'mardi 17 novembre 2026 · 08:30', false],
  ['depositXof' in POSE.p_rdv || 'depositConfirmed' in POSE.p_rdv || 'paidXof' in POSE.p_rdv, cgp().rdvId, cgp().momentFixe, 'momentRefuse' in cgp()]);
const P4 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-p', moment: { jour: '2026-11-18', heure: '09:00' } });
dit('⑥ rejouee : le meme rendez-vous, aucune seconde pose', ['deja', 1, 1], [P4.verdict, poses(), tables.appointments.filter((a) => a.id === 'rdv-privee-cg-p').length]);
const P5 = await appelle({ geste: 'reserver-privee', consultationId: 'cg-q' });
dit('⑥ sans moment dans l appel : celui garde au depot', [true, { jour: '2026-11-19', heure: '09:00' }], [P5.ok, P5.moment]);
const MP = await appelle({ geste: 'moments-privee' });
dit('⑥ les moments proposes : rien aujourd hui, rien avant 08:30, pas la place deja prise', [false, false, false, true],
  [(MP.moments as Row[]).some((m) => m.jour === '2026-11-16'), (MP.moments as Row[]).some((m) => m.heure < '08:30'), (MP.moments as Row[]).some((m) => m.jour === '2026-11-17' && m.heure === '08:30'), (MP.moments as Row[]).length > 5]);

/* m · les visios au Carnet, quand la Maison le choisit */
tables.documents.find((d) => d.key === 'mnd_visio')!.data = { ...VISIO_DOC, auCarnet: true };
const RK = await appelle({ geste: 'reserver', nom: 'Efua', telephone: '0197000005', debut: cot('2026-11-18', '10:30') });
const rdvK = () => tables.appointments.find((a) => a.id === `rdv-visio-${RK.id}`);
dit('⑥ au Carnet (reglage allume) : la visio y est, quinze minutes, sans prix, sans passer par le verrou des places', ['2026-11-18', '10:30', 15, 'Visio · 15 minutes', 0, `rdv-visio-${RK.id}`, 2],
  [rdvK()?.data.date, rdvK()?.data.time, rdvK()?.data.dureeMin, rdvK()?.data.forfait.nom, rdvK()?.data.forfait.totalXof, visio(String(RK.id)).rdv_id, poses()]);
await appelle({ geste: 'deplacer', id: RK.id, jeton: RK.billet, debut: cot('2026-11-19', '10:00') });
dit('⑥ ... elle suit la visio qui change d heure', ['2026-11-19', '10:00'], [rdvK()?.data.date, rdvK()?.data.time]);
await appelle({ geste: 'annuler', id: RK.id, jeton: RK.billet });
dit('⑥ ... et s annule avec elle', 'annulé', rdvK()?.data.status);
tables.documents.find((d) => d.key === 'mnd_visio')!.data = { ...VISIO_DOC };

/* o · sans modèle approuvé, la Maison envoie le lien */
delete env.WA_TEMPLATE_VISIO;
const RS = await appelle({ geste: 'reserver', nom: 'Fifi', telephone: '0197000006', debut: cot('2026-11-18', '10:45') });
dit('⑥ sans modele : la visio est posee, le lien reste a envoyer, toujours pas dans la reponse', [true, false, 'a-envoyer', false], [RS.ok, RS.parWhatsApp, visio(String(RS.id)).lien_etat, 'jeton' in RS]);
const NL = await appelle({ geste: 'nouveau-lien', id: RS.id }, { equipe: true });
dit('⑥ ... « Envoyer le lien » : un lien neuf pour la main de la Maison', [true, 'a-la-main'], [typeof NL.chemin === 'string', visio(String(RS.id)).lien_etat]);
env.WA_TEMPLATE_VISIO = 'visio_mnd';
Date.now = vraiNow;
globalThis.fetch = vraiFetch;

/* ── ⑦ LES BRANCHEMENTS ──────────────────────────────────────────────── */
const salle = lf('src/apps/couronne/SalleDeVisio.tsx');
dit('⑦ la page ne propose « Changer l heure » que si la fonction le permet, et ne dit « Heure changée » qu apres le geste', [true, true, true, 1], [
  salle.includes("{c.permis && !annuler && <button type=\"button\" className={`mv-bouton ${etat.billet ? '' : 'mv-bouton--lien'}`} onClick={() => { setDit(null); setChange(true); }}>{t('Changer l’heure')}</button>}"),
  salle.includes('onGarde={() => setChange(false)}'),
  salle.includes("if (r.ok) { onChange(r.parWhatsApp === true ? t('Heure changée. Elle arrive sur votre WhatsApp.') : t('Heure changée.')); return; }"),
  salle.split('setDit(m)').length - 1,
]);
dit('⑦ le billet n a pas de bouton d entree ; les affiches viennent d une seule fonction ; un prix ne se coupe pas', [true, true, true, true], [
  salle.includes('{!etat.billet && (\n          <button type="button" className="mv-bouton" disabled={!peutEntrer || entre} onClick={() => void entrer()}>'),
  salle.includes('const affiches = affichesDeLaSuite(r, etat.consultationId, etat.sansLocks);'),
  salle.includes('nom={t(affiches.privee.nom)} ligne={t(affiches.privee.ligne)}') && salle.includes('unite={t(affiches.privee.unite)}'),
  salle.includes('<span className="mv-prix">{chiffre}</span>') && /\.mv-prix \{ white-space: nowrap; \}/.test(lf('src/apps/couronne/visio.css')),
]);
dit('⑦ le mot de la Maison passe par pourLeBilan', true, salle.includes("<dd>{t(pourLeBilan(r.mot))}</dd>"));
dit('⑦ la page dit qu elle a vu la suite, une fois', true, /suiteDite\.current = true;\n\s*void appelle\(\{ geste: 'suite-vue', id, jeton \}\)/.test(salle));
const fileB = lf('src/apps/trone/routes/clients/ConsultationsVisios.tsx');
dit('⑦ la file B : le prenom se coupe aux espaces, « Déplacer », le lien a envoyer, la suite a la main', [true, false, true, true, true, true], [
  fileB.includes('const prenomDe = (nom: string): string => nom.trim().split(/\\s+/)[0] ?? \'\';'), /split\(\/s\+\/\)/.test(fileB),
  fileB.includes('{deplacable && <Button size="sm" variant="ghost" onClick={() => setDeplace(deplace === v.id ? null : v.id)}>Déplacer</Button>}'),
  fileB.includes('const r = await deplaceLaVisio(visio.id, choisi);'),
  fileB.includes("v.lienEtat === 'a-envoyer' && <span className=\"trv-status trv-status--avalider\">lien à envoyer</span>"),
  fileB.includes('const s = await envoieLaSuite(visio.id);') && fileB.includes('>Lui écrire la suite</Button>'),
]);
dit('⑦ la file B propose un rituel du catalogue, reservable en ligne, et la privee seule des l intensive', [true, true], [
  /* Le lien part vers /reserver/ : les familles de la porte du site, défaisage compris (18 novembre 2026). */
  fileB.includes('const familles = famillesDeLaPorteDuSite(categories);') && fileB.includes('return services.filter((s) => !!s.name && reservableSurLeSite(s, familles, masques));'),
  fileB.includes('const rituel: RituelPropose | undefined = !obligatoire && rituelOuvert && gestes.length'),
]);
dit('⑦ la file C pose la privee au Carnet par la fonction ; la lecture se fait au Trone', [true, true, true], [
  lf('src/apps/trone/routes/clients/ConsultationsReglees.tsx').includes('const r = await poseLaPrivee(o.id, { jour, heure });'),
  /export default function Consultations\(\) \{\n[^\n]*\n  useLectureDeLaMaison\(\);/.test(lf('src/apps/trone/routes/clients/Consultations.tsx')),
  lf('src/apps/trone/routes/clients/lecture-de-la-maison.ts').includes("!tablePrete('consultations_queue') || !tablePrete('catalog_services') || !documentDescendu('mnd_besoins')"),
]);
const sql = lf('supabase/migrations/0216_la_visio_limitee_et_deplacee.sql');
dit('⑦ 0216 : les colonnes de la limite et du changement, l heure de l annulation posee par la base', [[], true, true, true], [
  ['deplacements', 'deplacee_le', 'deplacee_de', 'annulee_le', 'annulee_par', 'rdv_id', 'branch_id', 'lien_etat', 'suite_vue_le', 'billet_hash']
    .filter((c) => !new RegExp(`add column if not exists ${c}\\s`).test(sql)),
  sql.includes('before update on public.visios') && sql.includes("if new.statut = 'annulée' and old.statut is distinct from 'annulée' then\n    new.annulee_le := now();"),
  sql.includes("new.annulee_par := case when auth.uid() is null then 'cliente' else 'maison' end;"),
  !/drop table|delete from|truncate/i.test(sql),
]);
const fn = lf('scripts/serveur/visio-salle.ts');
dit('⑦ la fonction : sa version, aucun domaine ecrit, le billet garde en empreinte', [true, false, true], [
  fn.includes("const VERSION = '2026-11-18-a';"), /maisonmnd|github\.io|supabase\.co/i.test(fn), fn.includes('billet_hash: await empreinte(billet)'),
]);
const reg = lf('src/apps/trone/routes/systeme/ReglagesDeLaVisio.tsx');
dit('⑦ les reglages se reglent au Trone : la periode, le delai, les changements, le Carnet', [], ['limiteJours', 'changementAvantMin', 'changementsMax', 'priveeDureeMin', 'auCarnet'].filter((k) => !reg.includes(`d, ${k}:`)));

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : le bilan n est pas sous cle.');
else console.log('TOUT VA BIEN : la visio est limitee, deplacee, et le bilan reste sous cle.');
