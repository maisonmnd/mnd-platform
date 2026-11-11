/* LE CONSEIL DU MATIN, ÉPROUVÉ · 2 novembre 2026 (Saphir, version simple).
   `node scripts/verifie-le-conseil-du-matin.mjs` (et `--prouve`).

   ① Le pur (`ecrisLeConseil`) : le titre daté avec l'année, « Ce qui presse »
      rangé et borné à cinq lignes, ce que Saphir n'a pas pu lire, hier (le
      journal par porte, les bilans par leurs seuls compteurs, les relais),
      aujourd'hui (les rendez-vous non annulés, la première heure, les
      fauteuils), les dix, les crédits, le lundi, le 1er du mois, la page
      vide d'un jour sans données, la notification sans nom. Aucun nom de
      cliente ni numéro ne passe, même quand les faits en portent.
   ② La fonction `conseil-du-matin`, regroupée depuis le dépôt, contre une
      base et un push-notify simulés : la santé, la porte (la clé service,
      un souverain, et les refus), la lecture par pages de mille lignes, les
      bornes d'hier et d'aujourd'hui, le lundi compté sur 90 jours, une
      notification par souverain au cron seulement, une seule par matin, la
      lecture manquée dite sur la page.
   ③ Le câblage : la tâche de 0151, le composant, aucune cible chiffrée dans
      les sources.
   Les noms, numéros et chiffres du banc sont inventés : rien de réel ici. */
import { readFileSync } from 'node:fs';
import {
  CARTE_ANCIENNE_H, PRESSE_AU_PLUS, de, ecrisLeConseil, faitsVides, heureDite, jourDit, prenomPropre, tacheDite,
  type FaitsDuConseil, type PageDuConseil,
} from '../src/shared/conseil-du-matin-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko += 1; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const PANNE = process.env.CONSEIL_PANNE ? JSON.parse(process.env.CONSEIL_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};
/* Le texte lu de la page : sans ses horodatages (une date ISO sans tirets ressemble à un numéro). */
const texteDe = (p: PageDuConseil) => JSON.stringify({ ...p, jour: '', ecritLe: '', notifieLe: '', version: '', credits: { ...p.credits, mois: '' } });
const sansNiNomNiNumero = (p: PageDuConseil) => {
  const t = texteDe(p);
  return { awa: t.includes('Awa'), banc: /Banc/.test(t), numero: /\d{8,}/.test(t.replace(/[\s.-]/g, '')), tiret: t.includes('—') };
};

/* Le lundi 2 novembre 2026, 7 h à Cotonou (6 h UTC). */
const LUNDI_7H = Date.UTC(2026, 10, 2, 6, 0);
const h = (ms: number) => new Date(ms).toISOString();

/* ── ① LE PUR ── */
dit('le jour dit, avec l année', ['lundi 2 novembre 2026', 'mardi 1er décembre 2026'], [jourDit('2026-11-02'), jourDit('2026-12-01')]);
dit('l heure dite', ['9 h', '10 h 30', null], [heureDite('09:00'), heureDite('10:30'), heureDite('midi')]);
dit('d Opale, de Saphir', ['d\'Opale', 'de Saphir', 'd\'Ambre'], [de('Opale'), de('Saphir'), de('Ambre')]);
dit('le prénom de l équipe : des lettres seulement', ['Brice', null, null], [prenomPropre('Brice Ahouansou'), prenomPropre('0197000001 X'), prenomPropre('')]);
dit('le nom d une tâche : sage, sinon « une tâche du serveur »',
  ['la tâche « rappels-j1-chaque-heure »', 'une tâche du serveur', 'une tâche du serveur', 'une tâche du serveur'],
  [tacheDite('rappels-j1-chaque-heure'), tacheDite('appeler 2290197000001'), tacheDite('<script>'), tacheDite('x'.repeat(70))]);

/* La page vide d'un jour sans données. */
const vide = ecrisLeConseil(faitsVides(), LUNDI_7H);
dit('la page vide : rien ne presse, les rubriques le disent', {
  titre: 'Le Conseil du matin', jourDit: 'lundi 2 novembre 2026', presse: [], n: 0,
  hier: ['Hier, aucun geste au journal.', 'Aucun relais hier.'], auj: ['Aucun rendez-vous aujourd\'hui.'], dix: 10,
  corps: 'Rien ne presse ce matin. La page vous attend dans Les assistants.', lundi: null, revue: null,
  credits: 'Novembre 2026 : 0,00 $ sur 200 $ (0 %).',
}, {
  titre: vide.titre, jourDit: vide.jourDit, presse: vide.presse, n: vide.pressentEnTout, hier: vide.hier, auj: vide.aujourdhui, dix: vide.dix.length,
  corps: vide.notification.corps, lundi: vide.lundi, revue: vide.revue, credits: vide.credits.dit,
});

/* Un matin chargé, avec des noms et des numéros semés dans les faits. */
const riche = (): FaitsDuConseil => ({
  assistants: [
    { id: 'opale', nom: 'Opale', aUnJeton: true, vuLe: h(LUNDI_7H - 8 * 60_000), etat: { controles: { chrome: true, lie: true, nonLus: true } } },
    { id: 'onyx', nom: 'Awa Banc', aUnJeton: true, vuLe: h(LUNDI_7H - 7.5 * 3_600_000), etat: {} },
    { id: 'saphir', nom: 'Saphir', aUnJeton: false },
  ],
  cartes: [
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - 30 * 3_600_000) },
    { assistant: 'opale', genre: 'rdv', creeLe: h(LUNDI_7H - 26 * 3_600_000) },
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - 2 * 3_600_000) },
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - 40 * 3_600_000), echeance: h(LUNDI_7H - 3_600_000) },
    { assistant: 'onyx', genre: 'place-tenue', creeLe: h(LUNDI_7H - 3_600_000) },
  ],
  relais: { hier: 4, aTraiter: 1 },
  bilans: [
    { assistant: 'opale', jour: '2026-11-01', comptes: { lus: 12, repondus: 5, rdvPoses: 2, inconnu: 9 }, mot: 'Awa Banc au 2290197000001' },
    { assistant: 'intrus', jour: '2026-11-01', comptes: { lus: 3 } },
  ],
  gestesHier: { trone: 230, assistant: 20, couronne: 2, bizarre: 3 },
  rdvDuJour: [
    { time: '10:30', master: 'st-b', status: 'confirmé', clientName: 'Awa Banc' },
    { time: '09:00', master: 'st-b', status: 'confirmé', clientName: 'Awa Banc', phone: '+229 01 97 00 00 01' },
    { time: '11:00', master: 'st-n', status: 'en attente', clientName: 'Codjo Banc' },
    { time: '08:00', master: 'st-b', status: 'annulé', clientName: 'Dossi Banc' },
  ],
  equipe: { 'st-b': 'Brice Ahouansou', 'st-n': 'Nassim Maliki' },
  depensesAValider: 3,
  tachesEnEchec: [{ tache: 'rappels-j1-chaque-heure', echecs: 2, dernier: 'Awa Banc 2290197000001' }, { tache: 'appel 2290197000001', echecs: 1 }],
  compteurs: { mnd_assistant_wa_compte: { '2026-11': { usd: 65, appels: 40 } }, mnd_ia_compteur: { '2026-11': { usd: 13, appels: 5 } } },
  actives90: 104,
  conseil: { actives90: { depart: 90, cibles: [{ le: '2027-05-02', valeur: 140 }, { le: '2027-02-02', valeur: 111 }, { le: '2026-10-01', valeur: 50 }] } },
});
const p = ecrisLeConseil(riche(), LUNDI_7H);
dit('aucun nom de cliente, aucun numéro, aucun tiret long ne passe', { awa: false, banc: false, numero: false, tiret: false }, sansNiNomNiNumero(p));
dit('ce qui presse : cinq lignes au plus, la dernière compte le reste', [PRESSE_AU_PLUS, 'Et 4 autres points, dans Les assistants.', 8],
  [p.presse.length, p.presse[PRESSE_AU_PLUS - 1]?.texte, p.pressentEnTout]);
dit('ce qui presse, dans l ordre : les tâches, puis l assistant qui dort, puis les cartes', [
  'La tâche « rappels-j1-chaque-heure » a échoué 2 fois depuis hier matin.',
  'Une tâche du serveur a échoué une fois depuis hier matin.',
  'Onyx dort depuis 7 h 30.',
  '2 cartes attendent depuis plus d\'un jour chez Opale.',
], p.presse.slice(0, 4).map((l) => l.texte));
dit('les tons : l échec et le sommeil en alerte, les cartes en attention', ['alerte', 'alerte', 'alerte', 'attention'], p.presse.slice(0, 4).map((l) => l.ton));
const tout = ecrisLeConseil({ ...riche(), tachesEnEchec: [] }, LUNDI_7H);
dit('sans tâches, on voit la suite : crédits, dépenses, place tenue', [
  'Onyx dort depuis 7 h 30.',
  '2 cartes attendent depuis plus d\'un jour chez Opale.',
  'Saphir approche de son plafond : 13 $ sur 15 $.',
  'Perle a dépassé son plafond : 65 $ sur 60 $.',
  'Et 2 autres points, dans Les assistants.',
], tout.presse.map((l) => l.texte));
const seuls = ecrisLeConseil({ ...faitsVides(), depensesAValider: 1, cartes: [{ assistant: 'onyx', genre: 'place-tenue', creeLe: h(LUNDI_7H - 3_600_000) }] }, LUNDI_7H);
dit('une dépense, une place tenue', ['Une dépense attend sa validation.', 'Une place tenue attend une réponse.'], seuls.presse.map((l) => l.texte));
dit('la notification compte, sans nom', ['Le Conseil du matin', '8 points pressent ce matin.', 'Un point presse ce matin.'],
  [p.notification.titre, p.notification.corps, ecrisLeConseil({ ...faitsVides(), depensesAValider: 2 }, LUNDI_7H).notification.corps]);
dit('une carte jeune, une carte échue ou tranchée ne pressent pas', 'Une carte attend depuis plus d\'un jour chez Opale.',
  ecrisLeConseil({ ...faitsVides(), cartes: [
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - (CARTE_ANCIENNE_H + 1) * 3_600_000) },
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - (CARTE_ANCIENNE_H - 1) * 3_600_000) },
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - 50 * 3_600_000), echeance: h(LUNDI_7H - 60_000) },
    { assistant: 'opale', genre: 'reponse', creeLe: h(LUNDI_7H - 50 * 3_600_000), tranchee: 'envoyer' },
  ] }, LUNDI_7H).presse.map((l) => l.texte).join(' | '));
const empeche = ecrisLeConseil({ ...faitsVides(), assistants: [{ id: 'onyx', aUnJeton: true, vuLe: h(LUNDI_7H - 5 * 60_000), etat: { controles: { chrome: true, lie: false, nonLus: true } } }] }, LUNDI_7H);
dit('un assistant empêché presse', 'Onyx est empêché : WhatsApp Web délié : le code QR est à l\'écran.', empeche.presse[0]?.texte);
const nuit = ecrisLeConseil({ ...faitsVides(), assistants: [{ id: 'opale', aUnJeton: true, vuLe: h(Date.UTC(2026, 10, 1, 22, 50)), etat: {} }] }, Date.UTC(2026, 10, 2, 2, 0));
dit('la nuit, un assistant au repos ne presse pas', [0, 'calme'], [nuit.pressentEnTout, nuit.dix.find((d) => d.id === 'opale')?.ton]);
const manque = ecrisLeConseil({ ...faitsVides(), lacunes: ['taches', 'journal', 'taches', 'inconnue'] }, LUNDI_7H);
dit('ce que Saphir n a pas pu lire se dit d abord, en mots fermés', ['Saphir n\'a pas pu lire les tâches de la nuit, le journal ce matin : la page est incomplète.', 'alerte'],
  [manque.presse[0]?.texte, manque.presse[0]?.ton]);

dit('hier : le journal par porte, le bilan par ses compteurs, l intrus écarté, les relais', [
  'Hier, 255 gestes au journal : 230 au Trône, 20 par les assistants, 3 ailleurs, 2 depuis Ma Couronne.',
  'Le bilan d\'Opale : 12 lus, 5 réponses, 2 rendez-vous posés.',
  '4 relais entre professionnels hier, 1 encore à traiter.',
], p.hier);
dit('hier : un assistant relié sans bilan le dit', 'Aucun bilan déposé ce matin.',
  ecrisLeConseil({ ...faitsVides(), assistants: [{ id: 'opale', aUnJeton: true, vuLe: h(LUNDI_7H - 60_000) }] }, LUNDI_7H).hier[1]);
dit('aujourd hui : sans les annulés, la première heure, les fauteuils par prénom', [
  '3 rendez-vous aujourd\'hui, le premier à 9 h.', 'Par fauteuil : Brice 2, Nassim 1.',
], p.aujourdhui);
dit('un maître inconnu ne devient jamais un nom', 'Par fauteuil : sans maître nommé 1.',
  ecrisLeConseil({ ...faitsVides(), rdvDuJour: [{ time: '09:00', master: 'Awa Banc', status: 'confirmé' }] }, LUNDI_7H).aujourdhui[1]);

const dix = Object.fromEntries(p.dix.map((d) => [d.id, d]));
dit('les dix : le registre entier, dans l ordre', ['opale', 'onyx', 'saphir', 'perle', 'ambre', 'grenat', 'jade', 'topaze', 'jaspe', 'cristal'], p.dix.map((d) => d.id));
dit('les dix : Opale en veille, Onyx endormi en alerte, Saphir par son statut, Cristal à part', [
  'ok', true, 'alerte', 'Onyx', 'En ligne, une fonction du Trône, à 7 h.', 'À part, hors du Trône, l\'ordinateur de Yéman.', 'Yéman et Brice',
], [dix.opale.ton, dix.opale.dit.startsWith('En veille, dernier passage il y a'), dix.onyx.ton, dix.onyx.nom, dix.saphir.dit, dix.cristal.dit, dix.saphir.porteurs]);
dit('les dix : le mode loin se dit', true,
  ecrisLeConseil({ ...faitsVides(), assistants: [{ id: 'opale', aUnJeton: true, vuLe: h(LUNDI_7H - 60_000), loinDepuis: h(LUNDI_7H - 3_600_000) }] }, LUNDI_7H)
    .dix[0].dit.endsWith('Mode « Je suis loin ».'));
dit('les crédits du mois, sur 200 $', ['Novembre 2026 : 78 $ sur 200 $ (39 %).', ['Saphir : 13 $ sur 15 $.', 'Perle : 65 $ sur 60 $.']], [p.credits.dit, p.credits.alertes]);
dit('le lundi : le chiffre, le départ et la cible du trimestre lus de la base',
  'Le chiffre du lundi : 104 clientes actives à 90 jours. Au départ : 90. Cible au 2 février 2027 : 111.', p.lundi?.dit);
dit('le lundi sans réglages : le chiffre seul', 'Le chiffre du lundi : 1 cliente active à 90 jours.', ecrisLeConseil({ ...faitsVides(), actives90: 1 }, LUNDI_7H).lundi?.dit);
dit('un mardi, pas de chiffre du lundi même compté', null, ecrisLeConseil({ ...riche() }, LUNDI_7H + 86_400_000).lundi);
dit('le 1er du mois, la revue à deux ; un autre jour, rien', ['La revue du mois, aujourd\'hui, à deux : trente minutes avec Saphir.', null],
  [ecrisLeConseil(faitsVides(), Date.UTC(2026, 11, 1, 6, 0)).revue, p.revue]);

/* ── ② LA FONCTION ── */
type Row = Record<string, unknown>;
let maintenant = LUNDI_7H;
const vraiNow = Date.now;
Date.now = () => maintenant;
const valeur = (r: Row, col: string): unknown => {
  const [chemin, feuille] = col.includes('->>') ? [col.slice(0, col.lastIndexOf('->>')), col.slice(col.lastIndexOf('->>') + 3)] : [col, null];
  let v: unknown = r;
  for (const k of chemin.split('->')) v = (v as Row | null)?.[k];
  /* `->>` rend du TEXTE chez PostgREST : un booleen vrai se lit « true » (fiches d'essai). */
  if (feuille === null) return v;
  const f = (v as Row | null)?.[feuille];
  return typeof f === 'boolean' ? String(f) : f;
};
const cmp = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''));
const enIso = (ms: number) => new Date(ms).toISOString();
const DEBUT_HIER = Date.UTC(2026, 9, 31, 23, 0); /* dimanche 1er novembre 2026, minuit à Cotonou */
const DEBUT_JOUR = Date.UTC(2026, 10, 1, 23, 0);
const tables: Record<string, Row[]> = {
  documents: [
    { key: 'mnd_settings', data: { assistants: {}, livreDesCredits: {}, conseil: { actives90: { depart: 90, cibles: [{ le: '2027-02-02', valeur: 111 }] } } } },
    { key: 'mnd_assistant_wa_compte', data: { '2026-11': { usd: 50, appels: 10 } } },
  ],
  assistants: [
    { id: 'opale', nom: 'Opale', empreinte: 'e1', vu_le: enIso(LUNDI_7H - 8 * 60_000), etat: { controles: { chrome: true, lie: true, nonLus: true } }, loin_depuis: null },
    { id: 'onyx', nom: 'Onyx', empreinte: 'e2', vu_le: enIso(LUNDI_7H - 7.5 * 3_600_000), etat: {}, loin_depuis: null },
    { id: 'saphir', nom: 'Saphir', empreinte: null, vu_le: null, etat: {} },
  ],
  assistants_decisions: [
    { id: 'd1', assistant: 'opale', genre: 'reponse', cree_le: enIso(LUNDI_7H - 30 * 3_600_000), echeance: null, tranchee: null },
    { id: 'd2', assistant: 'opale', genre: 'reponse', cree_le: enIso(LUNDI_7H - 30 * 3_600_000), echeance: null, tranchee: 'envoyer' },
  ],
  assistants_relais: [
    { id: 'r1', quand: enIso(DEBUT_HIER + 3_600_000), traite_le: enIso(DEBUT_HIER + 7_200_000), perime_le: null },
    { id: 'r2', quand: enIso(DEBUT_HIER + 5 * 3_600_000), traite_le: null, perime_le: null },
    { id: 'r3', quand: enIso(DEBUT_JOUR + 3_600_000), traite_le: null, perime_le: enIso(LUNDI_7H - 60_000) },
    { id: 'r4', quand: enIso(DEBUT_HIER - 3_600_000), traite_le: enIso(DEBUT_HIER), perime_le: null },
  ],
  assistants_bilans: [{ assistant: 'opale', jour: '2026-11-01', comptes: { lus: 7 }, mot: 'Awa Banc 2290197000001' }],
  journal_gestes: [], appointments: [],
  /* Une fiche d'essai (7 novembre 2026) : ses rendez-vous ne comptent pas dans la page. */
  clients: [{ id: 'cl-essai', data: { essai: true } }],
  team: [{ id: 'st-b', data: { name: 'Brice Ahouansou' } }, { id: 'st-n', data: { name: 'Nassim Maliki' } }],
  expenses: [
    { id: 'x1', data: { validation: { etat: 'attente' } } }, { id: 'x2', data: { validation: { etat: 'attente' } } },
    { id: 'x3', data: { validation: { etat: 'validee' } } }, { id: 'x4', data: {} },
  ],
  staff: [
    { user_id: 'u-yeman', role: 'souverain', name: 'Y' }, { user_id: 'u-brice', role: 'souverain', name: 'B' },
    { user_id: 'u-brice', role: 'souverain', name: 'B bis' }, { user_id: 'u-maitre', role: 'maitre', name: 'M' },
  ],
  conseil_du_matin: [],
  /* Ce qui va partir (5 novembre 2026) : le mot d'Opale lit les envois et les modèles en pause. */
  envois: [
    { id: 'e-deja-1', data: { statut: 'périmé', detail: 'retenu par Opale : déjà parti : le même message est au journal depuis moins de 20 h', quand: enIso(DEBUT_HIER + 3_600_000), clientId: 'cl-x' } },
    { id: 'e-deja-2', data: { statut: 'périmé', detail: 'retenu par Opale : déjà parti : le même modèle est au fil de ce numéro depuis moins de 20 h', quand: enIso(DEBUT_JOUR + 3_600_000) } },
    { id: 'e-rdv', data: { statut: 'périmé', detail: 'retenu par Opale : le rendez-vous a été annulé', quand: enIso(DEBUT_HIER + 7_200_000) } },
    { id: 'e-avant-hier', data: { statut: 'périmé', detail: 'retenu par Opale : déjà parti', quand: enIso(DEBUT_HIER - 3_600_000) } },
    { id: 'e-perime-simple', data: { statut: 'périmé', detail: 'le rendez-vous a été déplacé', quand: enIso(DEBUT_HIER + 3_600_000) } },
    { id: 'e-arrete', data: { statut: 'écarté', arretDAvance: { cle: 'rappel-j1:a9', par: 'Yéman' }, quand: enIso(DEBUT_JOUR + 60_000) } },
    { id: 'e-salle', data: { statut: 'en-attente', quand: enIso(DEBUT_JOUR + 120_000) } },
  ],
  modeles_en_pause: [
    { id: 'fin_de_paquet', data: { modele: 'fin_de_paquet', enPause: true, par: 'Opale', parOpale: true } },
    { id: 'carte_marraine', data: { modele: 'carte_marraine', enPause: false, reprisPar: 'Yéman' } },
  ],
};
/* Le journal d'hier : 2 500 gestes (plus que deux pages), et des gestes hors d'hier qui ne comptent pas. */
for (let i = 0; i < 2500; i += 1) tables.journal_gestes.push({ id: `g${String(i).padStart(5, '0')}`, data: { quand: enIso(DEBUT_HIER + 1000 + i * 30_000), porte: i < 2400 ? 'trone' : 'assistant' } });
tables.journal_gestes.push({ id: 'g-avant', data: { quand: enIso(DEBUT_HIER - 1000), porte: 'trone' } }, { id: 'g-ce-matin', data: { quand: enIso(DEBUT_JOUR + 1000), porte: 'trone' } });
/* Les rendez-vous du jour, et 1 300 rituels honorés sur 90 jours pour 320 clientes. */
tables.appointments.push(
  { id: 'a1', data: { date: '2026-11-02', time: '10:30', master: 'st-b', status: 'confirmé', clientName: 'Awa Banc', clientId: 'cl-x' } },
  { id: 'a2', data: { date: '2026-11-02', time: '09:00', master: 'st-n', status: 'confirmé', clientName: 'Awa Banc', clientId: 'cl-x' } },
  { id: 'a3', data: { date: '2026-11-02', time: '08:00', master: 'st-b', status: 'annulé', clientName: 'Codjo Banc', clientId: 'cl-y' } },
  { id: 'a4-essai', data: { date: '2026-11-02', time: '07:00', master: 'st-b', status: 'confirmé', clientName: 'Fiche Essai', clientId: 'cl-essai' } },
);
for (let i = 0; i < 1300; i += 1) {
  const jour = new Date(Date.UTC(2026, 10, 1) - (i % 89) * 86_400_000).toISOString().slice(0, 10);
  tables.appointments.push({ id: `h${String(i).padStart(5, '0')}`, data: { date: jour, time: '10:00', master: 'st-b', status: 'honoré', clientId: `cl-${i % 320}` } });
}
tables.appointments.push(
  /* Demain : un rappel du soir ; l'annulé, l'honoré et la confirmée par la cliente se taisent. */
  { id: 'demain-1', data: { date: '2026-11-03', time: '11:00', status: 'confirmé', clientId: 'cl-d1' } },
  { id: 'demain-2', data: { date: '2026-11-03', time: '12:00', status: 'annulé', clientId: 'cl-d2' } },
  { id: 'demain-3', data: { date: '2026-11-03', time: '13:00', status: 'confirmé', clientId: 'cl-d3', confirmeeParLaClienteLe: '2026-11-01T10:00:00Z' } },
  { id: 'vieux', data: { date: '2026-08-04', status: 'honoré', clientId: 'cl-vieille' } },
  { id: 'confirme', data: { date: '2026-10-20', status: 'confirmé', clientId: 'cl-confirmee' } },
);
const JWTS: Record<string, string> = { 'jwt-yeman': 'u-yeman', 'jwt-maitre': 'u-maitre' };
let tachesEnPanne = false;
const lectures: Record<string, number> = {};
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  op: 'select' | 'upsert' = 'select';
  charge: Row[] = [];
  options: { onConflict?: string } = {};
  tri: string | null = null;
  de = 0; a = Infinity;
  constructor(readonly table: string) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) === v); return this; }
  is(c: string, v: unknown) { this.filtres.push((r) => (v === null ? valeur(r, c) == null : valeur(r, c) === v)); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.includes(valeur(r, c))); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) != null && cmp(valeur(r, c), v) >= 0); return this; }
  gt(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) != null && cmp(valeur(r, c), v) > 0); return this; }
  lt(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) != null && cmp(valeur(r, c), v) < 0); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) != null && cmp(valeur(r, c), v) <= 0); return this; }
  order(c: string) { this.tri = c; return this; }
  range(de: number, a: number) { this.de = de; this.a = a; return this; }
  limit(n: number) { this.a = n - 1; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string }) { this.op = 'upsert'; this.charge = Array.isArray(rows) ? rows : [rows]; this.options = o ?? {}; return this; }
  async maybeSingle() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.error }; }
  then<T>(res: (v: { data: Row[] | null; error: { message: string } | null }) => T, rej?: (e: unknown) => T) { return Promise.resolve(this.execute()).then(res, rej); }
  execute(): { data: Row[] | null; error: { message: string } | null } {
    const t = tables[this.table]; if (!t) return { data: null, error: { message: `table inconnue ${this.table}` } };
    if (this.op === 'upsert') {
      const cle = this.options.onConflict ?? 'id';
      for (const row of this.charge) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i >= 0) t[i] = { ...t[i], ...JSON.parse(JSON.stringify(row)) }; else t.push(JSON.parse(JSON.stringify(row)));
      }
      return { data: null, error: null };
    }
    lectures[this.table] = (lectures[this.table] ?? 0) + 1;
    let rows = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.tri) { const c = this.tri; rows = [...rows].sort((x, y) => cmp(valeur(x, c), valeur(y, c))); }
    /* Le plafond de Supabase : jamais plus de mille lignes par réponse. */
    const fin = Math.min(this.a, this.de + 999);
    return { data: rows.slice(this.de, fin + 1).map((r) => JSON.parse(JSON.stringify(r)) as Row), error: null };
  }
}
const fabrique = () => ({
  from: (table: string) => new Requete(table),
  auth: { getUser: async (jwt: string) => (JWTS[jwt] ? { data: { user: { id: JWTS[jwt] } }, error: null } : { data: { user: null }, error: { message: 'invalide' } }) },
  rpc: async (nom: string, params: Row) => {
    if (nom !== 'conseil_taches_en_echec') return { data: null, error: { message: `rpc inconnue ${nom}` } };
    if (tachesEnPanne) return { data: null, error: { message: 'permission denied for schema cron' } };
    dit('les tâches se lisent depuis vingt-quatre heures', enIso(maintenant - 86_400_000), params.depuis);
    return { data: [{ tache: 'rappels-j1-chaque-heure', echecs: 2, dernier: 'Awa Banc', derniere_le: enIso(maintenant - 3_600_000) }], error: null };
  },
});
const pushs: { corps: Row; autorisation: string }[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string; headers: Record<string, string> }) => {
  if (!String(url).endsWith('/functions/v1/push-notify')) throw new Error(`appel inattendu : ${url}`);
  pushs.push({ corps: JSON.parse(init.body), autorisation: init.headers.authorization });
  return { status: 200, json: async () => ({ version: 'banc', sent: 1 }) };
};
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'cle-service' };
const sourceF = readFileSync(process.env.CONSEIL_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', sourceF)(fabrique, { env: { get: (k: string) => env[k] }, serve: (hd: typeof handler) => { handler = hd; } });

const appelle = async (entetes: Record<string, string>, methode = 'POST', corps = '{"source":"cron"}') => {
  const r = await handler!(new Request('http://f/conseil-du-matin', { method: methode, headers: { 'content-type': 'application/json', ...entetes }, ...(methode === 'POST' ? { body: corps } : {}) }));
  return { status: r.status, corps: await r.json() as Row };
};
const service = { authorization: 'Bearer cle-service' };

const sante = await appelle({}, 'GET');
dit('la santé : sa version, sans clé', [200, true, 'conseil-du-matin', '2026-11-11-a'], [sante.status, sante.corps.ok, sante.corps.fonction, sante.corps.version]);
dit('sans clé, refusé', 403, (await appelle({})).status);
dit('une clé inconnue, refusée', 403, (await appelle({ authorization: 'Bearer autre-chose' })).status);
dit('un maître, refusé', 403, (await appelle({ authorization: 'Bearer jwt-maitre' })).status);
dit('rien n est écrit ni notifié par un refus', [0, 0], [tables.conseil_du_matin.length, pushs.length]);

const parSouverain = await appelle({ authorization: 'Bearer jwt-yeman' });
dit('un souverain écrit la page, sans notifier', [200, 'souverain', 0, 1, 0], [parSouverain.status, parSouverain.corps.source, parSouverain.corps.notifies, tables.conseil_du_matin.length, pushs.length]);
const essai = await appelle(service, 'POST', '{"source":"essai"}');
dit('un essai à la clé service écrit la page sans notifier, et ne prend pas la notification du matin', [200, 'essai', 0, 0, null],
  [essai.status, essai.corps.source, essai.corps.notifies, pushs.length, (tables.conseil_du_matin[0].page as PageDuConseil).notifieLe ?? null]);
const premier = await appelle(service);
const page1 = tables.conseil_du_matin[0].page as PageDuConseil;
dit('le cron écrit et notifie chaque souverain une fois (deux comptes, pas trois lignes)', [200, 'cron', 2, ['u-brice', 'u-yeman']],
  [premier.status, premier.corps.source, premier.corps.notifies, pushs.map((x) => x.corps.userId).sort()]);
dit('la notification part en to-staff, armée de la clé service, sans nom', [['to-staff'], ['Bearer cle-service'], ['Le Conseil du matin'], true],
  [[...new Set(pushs.map((x) => x.corps.mode))], [...new Set(pushs.map((x) => x.autorisation))], [...new Set(pushs.map((x) => x.corps.title))],
    pushs.every((x) => /^(Un point presse|\d+ points pressent|Rien ne presse) ce matin\./.test(String(x.corps.body)) && !String(x.corps.body).includes('Awa'))]);
dit('la page du jour, à la clé du jour de Cotonou, avec son heure de notification', ['2026-11-02', '2026-11-11-a', enIso(LUNDI_7H)],
  [tables.conseil_du_matin[0].jour, tables.conseil_du_matin[0].version, page1.notifieLe]);
dit('le journal d hier lu par pages : 2 500 gestes, ni avant ni ce matin', 'Hier, 2500 gestes au journal : 2400 au Trône, 100 par les assistants.', page1.hier[0]);
dit('les relais d hier, et ceux à traiter non périmés', '2 relais entre professionnels hier, 1 encore à traiter.', page1.hier[2]);
dit('le bilan par ses compteurs, sans son mot', 'Le bilan d\'Opale : 7 lus.', page1.hier[1]);
dit('aujourd hui depuis la base, sans les annulés ; puis le mot d Opale : le rappel du soir (ni annulé, ni honoré, ni déjà confirmé), la salle, ce qu elle a retenu, l arrêt, la pause', [
  '2 rendez-vous aujourd\'hui, le premier à 9 h.', 'Par fauteuil : Brice 1, Nassim 1.',
  'Messages Meta : 1 rappel de la veille partira ce soir dès 18 h, 1 message attend déjà en salle.',
  'Opale a retenu 3 messages depuis hier : 2 déjà partis, 1 rendez-vous qui ne tient plus.',
  '1 message arrêté d\'avance par la direction depuis hier.',
  'En pause : fin_de_paquet.',
], page1.aujourdhui);
dit('ce qui presse : le modèle qu Opale a mis en pause, sans nom de cliente', true,
  page1.presse.some((l: { texte: string }) => l.texte === 'Opale a mis en pause le modèle fin_de_paquet : ses messages revenaient non remis.'));
dit('le lundi compté sur 90 jours, par pages, clientes distinctes', 'Le chiffre du lundi : 320 clientes actives à 90 jours. Au départ : 90. Cible au 2 février 2027 : 111.', page1.lundi?.dit);
dit('ce qui presse depuis la base : la tâche, Onyx, le modèle qu Opale a mis en pause, la carte, puis le compte', [
  'La tâche « rappels-j1-chaque-heure » a échoué 2 fois depuis hier matin.', 'Onyx dort depuis 7 h 30.',
  'Opale a mis en pause le modèle fin_de_paquet : ses messages revenaient non remis.',
  'Une carte attend depuis plus d\'un jour chez Opale.', 'Et 2 autres points, dans Les assistants.',
], page1.presse.map((l) => l.texte));
dit('... les six points qui pressent, en tout (les crédits et les dépenses comptés)', 6, page1.pressentEnTout);
dit('la page de la base ne porte ni nom ni numéro', { awa: false, banc: false, numero: false, tiret: false }, sansNiNomNiNumero(page1));

maintenant = LUNDI_7H + 20 * 60_000;
const second = await appelle(service);
const page2 = tables.conseil_du_matin[0].page as PageDuConseil;
dit('relancée le même matin : la page se réécrit, rien ne repart', [200, 0, 2, 1, enIso(LUNDI_7H), enIso(LUNDI_7H + 20 * 60_000)],
  [second.status, second.corps.notifies, pushs.length, tables.conseil_du_matin.length, page2.notifieLe, page2.ecritLe]);

tachesEnPanne = true;
maintenant = LUNDI_7H + 86_400_000;
const mardi = await appelle(service);
const page3 = (tables.conseil_du_matin.find((r) => r.jour === '2026-11-03')?.page ?? null) as PageDuConseil | null;
dit('le lendemain : une nouvelle page, une nouvelle notification, pas de chiffre du lundi', [200, '2026-11-03', 4, null], [mardi.status, page3?.jour, pushs.length, page3?.lundi ?? null]);
dit('une lecture manquée se dit en tête de page, et la page s écrit quand même', ['taches', 'Saphir n\'a pas pu lire les tâches de la nuit ce matin : la page est incomplète.'],
  [(mardi.corps.lacunes as string[])?.join(','), page3?.presse[0]?.texte]);
Date.now = vraiNow;

/* ── ③ LE CÂBLAGE ── */
const sql = lit('supabase/migrations/0151_la_maison_intelligente.sql');
dit('0151 : la tâche de Saphir à 6 h UTC (7 h à Cotonou), par appelle_fonction_edge', true,
  sql.includes("select cron.schedule('conseil-du-matin', '0 6 * * *', $$select public.appelle_fonction_edge('conseil-du-matin',"));
dit('0151 : la table et la lecture des souverains', [true, true],
  [sql.includes('create table if not exists public.conseil_du_matin'), /create policy conseil_du_matin_lire on public\.conseil_du_matin for select to authenticated\s+using \(public\.is_souverain\(\)\);/.test(sql)]);
const ecran = lit('src/apps/trone/routes/pilotage/ConseilDuMatin.tsx');
dit('le composant lit la table du Conseil et appelle sa fonction', [true, true, true],
  [ecran.includes(".from('conseil_du_matin')"), ecran.includes("const FONCTION = 'conseil-du-matin';"), ecran.includes('export default function ConseilDuMatin()')]);
const pur = lit('src/shared/conseil-du-matin-pur.ts');
const serveur = lit('scripts/serveur/conseil-du-matin.ts');
dit('aucune cible chiffrée ni chiffre d affaires dans les sources', [false, false, false],
  [/(depart|valeur)\s*:\s*\d/.test(pur + serveur), /encaiss/i.test(serveur), /clientName/.test(serveur.replace(/jamais le nom de la cliente/g, ''))]);
dit('la fonction ne lit des rendez-vous que l heure, le maître et le statut', true,
  serveur.includes('.map((r) => ({ time: r.data?.time, master: r.data?.master, status: r.data?.status }))'));

console.log(ko === 0 ? '\nLe Conseil du matin tient.' : `\n${ko} épreuve(s) en échec.`);
process.exit(ko ? 1 : 0);
