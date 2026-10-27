/* CE QUE ÇA RAPPORTE, ÉPROUVÉ · 26 octobre 2026.
   `node scripts/verifie-ce-que-ca-rapporte.mjs` (et `--prouve`).

   Le compte de l'Assistant sur des envois fabriqués dont on connaît la
   réponse : la venue gagnée une fois, au premier message ; rien sous 20
   envois ; un rendez-vous sans date de prise ne compte pas ; ce qui attend
   en salle n'est pas parti ; les services ne gagnent rien ; le barème Meta
   vide se dit, jamais inventé ; deux voix la même semaine, au jour du dépôt ;
   le compteur Claude lu entier, au mois de Cotonou. Les clientes sont des
   lettres. Les attentes viennent de la spécification (§5.5, §6.5), jamais du
   code. */
import { readFileSync } from 'node:fs';
import {
  DEBUT_DU_COMPTE, JOURS_D_UNE_SEMAINE, VOIX_DE_LA_MAISON,
  aQuiIlPeutEcrire, categorieMetaDe, claudeDuMois, cleDeLaSituation, detailDuMois, deuxVoixLaMemeSemaine, estParti, estRemis,
  francsDits, lignesDuCompteur, moisDeLaPeriode, moisDuCompteur, parSituation, periodeDuCompte, phraseDuVerdict, quiEcritSeul,
  situationDite, typeDuModeleMeta, verdictDeLaSituation,
  type CodeDuCompte, type EnvoiDuCompte, type EtatLu, type MessageDuCompte, type RdvDuCompte,
} from '../src/shared/rapporte-pur';
import { AUTOMATISATIONS_REELLES } from '../src/shared/automatisations-reelles-pur';
import { SERVICES_DES_ENVOIS } from '../src/shared/dernier-message-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '2026-10-26';
const NBSP = ' ';

/* ── 1. La période ── */
dit('la période : les sept derniers jours, le mois en cours, depuis le 26 octobre 2026', [{ du: '2026-10-20', au: A }, { du: '2026-10-01', au: A }, { du: '2026-10-26', au: A }, '2026-10-26'],
  [periodeDuCompte('semaine', A), periodeDuCompte('mois', A), periodeDuCompte('depuis', A), DEBUT_DU_COMPTE]);
dit('les mois d’une période, décembre compris', [['2026-09', '2026-10', '2026-11'], ['2026-12', '2027-01']],
  [moisDeLaPeriode({ du: '2026-09-15', au: '2026-11-02' }), moisDeLaPeriode({ du: '2026-12-20', au: '2027-01-03' })]);

/* ── 2. Parti, remis, situation, catégorie Meta ── */
const ligne = (o: Partial<EnvoiDuCompte> & { id: string }): EnvoiDuCompte =>
  ({ type: 'gerard', canal: 'whatsapp', statut: 'envoyé', quand: '2026-10-05T09:00:00.000Z', etat: 'remis', genre: 'envie', modele: 'envie', ...o });
dit('parti : ce que Meta a accepté ou ce qui est parti à un toucher ; ni la salle, ni l’écarté, ni personne à joindre', [false, false, false, true, true, true, false, false],
  [{ statut: 'en-attente' }, { statut: 'retenu' }, { statut: 'écarté' }, { statut: 'envoyé', etat: 'remis' }, { statut: 'envoyé' }, { statut: 'à-la-main' }, { statut: 'sans-abonnement' }, { statut: 'échec' }]
    .map((e) => estParti(e as EnvoiDuCompte)));
dit('remis : lu ou remis seulement', [true, true, false, false], [{ statut: 'envoyé', etat: 'lu' }, { statut: 'envoyé', etat: 'remis' }, { statut: 'envoyé' }, { statut: 'à-la-main' }].map((e) => estRemis(e as EnvoiDuCompte)));
dit('la clé d’une situation : le genre pour l’Assistant, le type pour les autres voix ; ses mots', ['envie', 'avis-google', 'Une envie', 'Une place (jour creux)', 'Demande d’avis', 'Offre flash', 'inconnu'],
  [cleDeLaSituation({ type: 'gerard', genre: 'envie' }), cleDeLaSituation({ type: 'avis-google' }), situationDite('envie'), situationDite('creux'), situationDite('avis-google'), situationDite('campagne'), situationDite('inconnu')]);
const categorie = (m: string) => ({ avis_google: 'marketing', confirmation_rdv: 'utilitaire' } as Record<string, 'marketing' | 'utilitaire'>)[m];
dit('la catégorie Meta : rien pour Ma Couronne, le SMS et le toucher ; « garder » utilitaire ; une envie marketing ; un modèle inconnu se compte marketing', [null, null, null, 'utilitaire', 'marketing', 'marketing', 'utilitaire', 'marketing'],
  [categorieMetaDe({ type: 'gerard', canal: 'push', modele: 'garder' }), categorieMetaDe({ type: 'confirmation', canal: 'sms' }), categorieMetaDe({ type: 'gerard', canal: 'wa-main', modele: 'envie' }),
    categorieMetaDe({ type: 'gerard', canal: 'whatsapp', modele: 'garder' }), categorieMetaDe({ type: 'gerard', canal: 'whatsapp', modele: 'envie' }),
    categorieMetaDe({ type: 'avis-google', canal: 'whatsapp' }, categorie), categorieMetaDe({ type: 'confirmation', canal: 'whatsapp' }, categorie), categorieMetaDe({ type: 'fete-de-couronne', canal: 'whatsapp' }, categorie)]);
dit('le type qu’un modèle Meta écrit, pour le juger service ou non', [{ type: 'gerard', genre: 'garder' }, { type: 'confirmation' }, { type: 'avis-google' }, { type: 'inconnu' }],
  ['gerard_garder', 'confirmation_rdv', 'avis_google', 'inconnu'].map(typeDuModeleMeta));

/* ── 3. Par situation ── */
const T = (j: string, h = '09:00') => `${j}T${h}:00.000Z`;
const envois: EnvoiDuCompte[] = [];
/* Vingt-deux envies le 5 octobre : vingt remises, deux non remises. */
for (let i = 1; i <= 22; i++) envois.push(ligne({ id: `e-c${i}`, clientId: `c${i}`, etat: i <= 20 ? 'remis' : 'non-remis', codePromo: i === 3 ? 'envie15-k7m' : undefined }));
/* c12 avait déjà reçu une envie le 28 septembre : c'est elle, la première de la fenêtre. */
envois.push(ligne({ id: 'e-c12-sept', clientId: 'c12', quand: T('2026-09-28') }));
/* Deux places remisées le 12 octobre. */
envois.push(ligne({ id: 'k-k1', clientId: 'k1', genre: 'creux', modele: 'nouvelles', quand: T('2026-10-12'), codePromo: 'CREUX15-ABC' }));
envois.push(ligne({ id: 'k-k2', clientId: 'k2', genre: 'creux', modele: 'nouvelles', quand: T('2026-10-12'), codePromo: 'CREUX15-DEF' }));
/* Garder son RDV, par Ma Couronne (un service) : quatre, dont c10 dès le 1er. */
for (const [cl, appt, j] of [['s1', 'g1', '2026-10-20'], ['s2', 'g2', '2026-10-20'], ['s3', 'g3', '2026-10-20'], ['c10', 'gc10', '2026-10-01']] as const) {
  envois.push(ligne({ id: `g-${cl}`, clientId: cl, genre: 'garder', modele: 'garder', canal: 'push', etat: undefined, apptId: appt, quand: T(j) }));
}
/* Une envie encore en salle, une demande d'avis, une confirmation. */
envois.push(ligne({ id: 'e-c30', clientId: 'c30', statut: 'en-attente', etat: undefined, quand: T('2026-10-25'), deposeLe: T('2026-10-25') }));
envois.push(ligne({ id: 'a-c40', clientId: 'c40', type: 'avis-google', genre: undefined, modele: undefined, quand: T('2026-10-03') }));
envois.push(ligne({ id: 'f-c41', clientId: 'c41', type: 'confirmation', genre: undefined, modele: undefined, apptId: 'r41', quand: T('2026-10-07') }));

const rdv = (o: Partial<RdvDuCompte> & { id: string; clientId: string }): RdvDuCompte => ({ status: 'honoré', date: '2026-10-15', encaisseXof: 30000, ...o });
const rdvs: RdvDuCompte[] = [
  rdv({ id: 'r1', clientId: 'c1', creeLe: T('2026-10-10', '10:00') }),
  rdv({ id: 'r2', clientId: 'c2', creeLe: T('2026-10-19') }),               // quatorze jours pile : dans la fenêtre
  rdv({ id: 'r3', clientId: 'c3', creeLe: T('2026-10-08') }),
  rdv({ id: 'r4', clientId: 'c4', creeLe: '2026-10-19T09:00:01.000Z' }),   // une seconde trop tard
  rdv({ id: 'r5', clientId: 'c5', creeLe: T('2026-10-10'), encaisseXof: 0 }), // honoré, rien d'encaissé
  rdv({ id: 'r6', clientId: 'c6', date: '2026-10-12' }),                   // sans date de prise : on ne devine pas
  rdv({ id: 'r7', clientId: 'c7', creeLe: T('2026-10-10'), status: 'confirmé' }),
  rdv({ id: 'r12', clientId: 'c12', creeLe: T('2026-10-06') }),            // gagnée par l'envie de septembre
  rdv({ id: 'r8', clientId: 'k1', creeLe: T('2026-10-14'), encaisseXof: 20000 }),
  rdv({ id: 'g1', clientId: 's1', date: '2026-10-22' }), rdv({ id: 'g2', clientId: 's2', date: '2026-10-22' }), rdv({ id: 'g3', clientId: 's3', date: '2026-10-22', status: 'annulé' }),
  rdv({ id: 'gc10', clientId: 'c10', date: '2026-10-03', creeLe: T('2026-10-02'), encaisseXof: 50000 }), // un service ne gagne rien
  rdv({ id: 'r41', clientId: 'c41', date: '2026-10-09' }),
];
const codes: CodeDuCompte[] = [
  { code: 'ENVIE15-K7M', clientId: 'c3', utiliseLe: T('2026-10-15'), remiseReelleXof: 4500 },
  { code: 'CREUX15-ABC', clientId: 'k1', utiliseLe: T('2026-10-14'), remiseReelleXof: 3000 },
  { code: 'CREUX15-DEF', clientId: 'k2' }, // vivant, pas honoré : rien
];
const parChantier = { '2026-09': { avis: { usd: 9, appels: 3 } }, '2026-10': { avis: { usd: 1.5, appels: 4 } } };
const compte = parSituation({
  envois, rdvs, codes, periode: periodeDuCompte('mois', A), tarifs: { marketing: 100, utilitaire: 50 }, categorieDuModele: categorie,
  parChantier, chantiersDeLaSituation: { 'avis-google': ['avis'] },
});
const resume = (l: typeof compte.total) => [l.cle, l.envoyes, l.remis, l.venuesGagnees, l.tenus, l.encaisseXof, l.remiseXof, l.coutMetaXof];
dit('par situation, dans l’ordre de la maquette : garder, une envie, une place, demande d’avis, confirmation', ['garder', 'envie', 'creux', 'avis-google', 'confirmation'], compte.lignes.map((l) => l.cle));
dit('une envie : 22 envoyées, 20 remises, 3 venues gagnées (la quatorzième journée compte, une seconde de plus non ; rien sans encaissé, sans date de prise, ni « confirmé » ; c12 revient à son envie de septembre), 90 000 F, 4 500 F de remise, 2 000 F de Meta',
  ['envie', 22, 20, 3, null, 90000, 4500, 2000], resume(compte.lignes[1]));
dit('... taux 3 sur 22, rendement 20,0, coût d’une venue 2 167 F : utile', [0.136, 20, 2167, 'utile'],
  [Math.round((compte.lignes[1].taux ?? 0) * 1000) / 1000, compte.lignes[1].rendement, compte.lignes[1].coutDUneVenue, compte.lignes[1].verdict.etat]);
dit('une place : deux envoyées, une venue, 3 000 F de remise ; sous 20, ni taux ni rendement, « à mesurer · 2 sur 20 »', ['creux', 2, 2, 1, null, 20000, 3000, 200, null, null, null, { etat: 'a-mesurer', dit: 'à mesurer · 2 sur 20' }],
  [...resume(compte.lignes[2]), compte.lignes[2].taux, compte.lignes[2].rendement, compte.lignes[2].coutDUneVenue, compte.lignes[2].verdict]);
dit('garder son RDV : un service par Ma Couronne, 4 gardés, 3 tenus, aucune venue « gagnée » (c10 avait déjà sa place), 0 F de Meta', ['garder', 4, 0, 0, 3, 0, 0, 0, true, { couronne: 4, meta: 0, toucher: 0 }, 'service'],
  [...resume(compte.lignes[0]), compte.lignes[0].service, compte.lignes[0].parCanal, compte.lignes[0].verdict.etat]);
dit('la demande d’avis : Claude du chantier « avis » sur le mois de la période seulement', [1.5, 1.5], [compte.lignes[3].coutClaudeUsd, compte.total.coutClaudeUsd]);
dit('la ligne en salle n’est pas partie ; la confirmation est un service tenu', [false, ['confirmation', 1, 1, 0, 1, 0, 0, 50]],
  [compte.lignes.some((l) => l.envoyes === 23), resume(compte.lignes[4])]);
dit('le total : 30 messages, 24 remis, 4 venues, 4 tenus, 110 000 F encaissés, 7 500 F de remise, 2 350 F de Meta, rendement 14,7, coût d’une venue 2 463 F', ['total', 30, 24, 4, 4, 110000, 7500, 2350, 14.7, 2463, true, '5 situations'],
  [...resume(compte.total), compte.total.rendement, compte.total.coutDUneVenue, compte.metaRenseigne, compte.total.verdict.dit]);
const sansTarif = parSituation({ envois, rdvs, codes, periode: periodeDuCompte('mois', A), categorieDuModele: categorie });
dit('sans barème Meta : le coût Meta est « non renseigné » (null), jamais inventé ; Ma Couronne seule reste à 0 F ; le coût d’une venue attend', [false, null, 0, null, null],
  [sansTarif.metaRenseigne, sansTarif.lignes[1].coutMetaXof, sansTarif.lignes[0].coutMetaXof, sansTarif.lignes[1].coutDUneVenue, sansTarif.total.coutDUneVenue]);
dit('la semaine : les envois du 20 au 26 octobre seulement', [['garder', 3]], parSituation({ envois, rdvs, codes, periode: periodeDuCompte('semaine', A) }).lignes.map((l) => [l.cle, l.envoyes]));
dit('le verdict aux seuils de la spécification : à mesurer sous 20 ; à éteindre à 0 venue ou rendement < 1 ; utile à 10 % et rendement 3 ; à regarder sinon',
  ['a-mesurer', 'a-eteindre', 'a-eteindre', 'utile', 'utile', 'a-regarder', 'a-regarder', 'service'],
  [verdictDeLaSituation({ service: false, envoyes: 19, venuesGagnees: 5, tenus: null, taux: null, rendement: null }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 0, tenus: null, taux: 0, rendement: null }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 3, tenus: null, taux: 0.12, rendement: 0.8 }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 3, tenus: null, taux: 0.12, rendement: 3 }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 3, tenus: null, taux: 0.12, rendement: null }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 2, tenus: null, taux: 0.08, rendement: 5 }).etat,
    verdictDeLaSituation({ service: false, envoyes: 25, venuesGagnees: 3, tenus: null, taux: 0.12, rendement: 2 }).etat,
    verdictDeLaSituation({ service: true, envoyes: 41, venuesGagnees: 0, tenus: 37, taux: 37 / 41, rendement: null }).etat]);
dit('... pour « garder » : tenus ÷ gardés, dit en tenus', '37 tenus sur 41', verdictDeLaSituation({ service: true, envoyes: 41, venuesGagnees: 0, tenus: 37, taux: 37 / 41, rendement: null }).dit);

/* ── 4. La phrase du verdict ── */
dit('les francs : l’espace insécable entre les milliers', [`761${NBSP}000 F`, '900 F', `1${NBSP}234${NBSP}567 F`], [francsDits(761000), francsDits(900), francsDits(1234567)]);
dit('la phrase de verdict, de forme fixe', `30 messages, 4 venues gagnées, 110${NBSP}000 F encaissés pour 7${NBSP}500 F de remise : rendement 14,7, coût d’une venue 2${NBSP}463 F.`, phraseDuVerdict(compte.total));
dit('... sans barème Meta, elle le dit à la même place', `30 messages, 4 venues gagnées, 110${NBSP}000 F encaissés pour 7${NBSP}500 F de remise : rendement 14,7, coût d’une venue non renseigné (barème Meta vide).`, phraseDuVerdict(sansTarif.total));
dit('... sous 20 messages, « à mesurer », jamais un chiffre inventé', '5 messages, 1 venue gagnée, 20 000 F encaissés pour 0 F de remise : rendement à mesurer (5 sur 20), coût d’une venue à mesurer.'.replace(/20 000/, `20${NBSP}000`),
  phraseDuVerdict({ envoyes: 5, venuesGagnees: 1, encaisseXof: 20000, remiseXof: 0, rendement: null, coutDUneVenue: null, coutMetaXof: 0 }));
dit('... à zéro venue : « aucune venue à chiffrer »', true, /aucune venue à chiffrer\.$/.test(phraseDuVerdict({ envoyes: 25, venuesGagnees: 0, encaisseXof: 0, remiseXof: 0, rendement: null, coutDUneVenue: null, coutMetaXof: 0 })));
dit('pas de tiret cadratin dans ce que le compte dit', false, /\u2014/.test([phraseDuVerdict(compte.total), ...compte.lignes.map((l) => `${l.dit} ${l.verdict.dit}`)].join(' ')));

/* ── 5. Deux voix la même semaine ── */
const voixEnvois: EnvoiDuCompte[] = [
  /* x : l'envie déposée le 1er, dont `quand` a été réécrit le 20 au verdict de Meta ; la demande d'avis le 18. Dix-sept jours au dépôt. */
  ligne({ id: 'x1', clientId: 'x', deposeLe: T('2026-10-01'), quand: T('2026-10-20') }),
  ligne({ id: 'x2', clientId: 'x', type: 'avis-google', genre: undefined, quand: T('2026-10-18') }),
  /* y : une envie le 10, une offre flash le 14. */
  ligne({ id: 'y1', clientId: 'y', quand: T('2026-10-10') }),
  ligne({ id: 'y2', clientId: 'y', type: 'campagne', genre: undefined, quand: T('2026-10-14') }),
  /* z : une confirmation (service) le 10, une envie le 12. */
  ligne({ id: 'z1', clientId: 'z', type: 'confirmation', genre: undefined, quand: T('2026-10-10') }),
  ligne({ id: 'z2', clientId: 'z', quand: T('2026-10-12') }),
  /* w : une envie le 5, qu'on retrouve aussi dans messages_wa. */
  ligne({ id: 'w1', clientId: 'w', quand: T('2026-10-05') }),
  /* u : une envie en salle le 10, une envie le 12. */
  ligne({ id: 'u1', clientId: 'u', statut: 'en-attente', etat: undefined, quand: T('2026-10-10') }),
  ligne({ id: 'u2', clientId: 'u', quand: T('2026-10-12') }),
  /* v : une envie le 23, après un modèle d'avis le 20 (messages_wa). */
  ligne({ id: 'v1', clientId: 'v', quand: T('2026-10-23') }),
  /* t : six jours d'écart ; s : sept. */
  ligne({ id: 't1', clientId: 't', quand: T('2026-10-01') }), ligne({ id: 't2', clientId: 't', type: 'campagne', genre: undefined, quand: T('2026-10-07') }),
  ligne({ id: 's1', clientId: 's', quand: T('2026-10-01') }), ligne({ id: 's2', clientId: 's', type: 'campagne', genre: undefined, quand: T('2026-10-08') }),
];
const voixMessages: MessageDuCompte[] = [
  { sens: 'sortant', clientId: 'w', quand: T('2026-10-05'), modele: 'gerard_envie' },        // le même message, vu par le fil
  { sens: 'sortant', clientId: 'w', quand: T('2026-10-08'), modele: 'confirmation_rdv' },    // un service
  { sens: 'sortant', clientId: 'w', quand: T('2026-10-09') },                                 // une réponse libre de l'équipe : une conversation
  { sens: 'entrant', clientId: 'w', quand: T('2026-10-09', '08:00'), modele: 'avis_google' },
  { sens: 'sortant', clientId: 'v', quand: T('2026-10-20'), modele: 'avis_google' },
];
const deux = deuxVoixLaMemeSemaine(voixEnvois, voixMessages);
dit('deux voix la même semaine : t (six jours), v (un modèle du fil puis une envie), y ; ni x (dix-sept jours au dépôt), ni z (un service), ni w (le même message dans deux tables), ni u (en salle), ni s (sept jours)',
  [3, ['t', 'v', 'y'], ['2026-10-10', '2026-10-14']], [deux.nombre, deux.clientes.map((c) => c.clientId), deux.clientes[2].jours]);
dit('... sur la semaine du 19 au 26 octobre : v seule', ['v'], deuxVoixLaMemeSemaine(voixEnvois, voixMessages, { du: '2026-10-19', au: A }).clientes.map((c) => c.clientId));
dit('... sept jours, et les services de dernier-message-pur', [7, true], [JOURS_D_UNE_SEMAINE, SERVICES_DES_ENVOIS.includes('confirmation')]);

/* ── 6. Qui écrit seul ── */
const maintenantMs = Date.parse(`${A}T12:00:00.000Z`);
const etat: EtatLu = {
  maintenantMs, mois: '2026-10', envois,
  sondes: {
    'whatsapp-automate': { http: 200, version: '2026-10-14-b · l automate mene toujours' },
    'relances-factures': { http: 200, version: '2026-10-18-b · jamais de relance pour un', secrets: { WA_TEMPLATE_RELANCE: 0 } },
    'rappels-d-echeance': { http: 404, erreur: 'NOT_FOUND' },
    'avis-google': { http: 401, erreur: 'réservé au cron' },
    'avis-google-pont': { http: 405, version: '2026-10-25-b' },
    'discussion': { http: 405, version: '2026-10-19-a · le chat du site' },
    'centre-de-commande': { http: 405, version: '2026-10-11-b' },
    'demande-submit': { http: 405, version: '2026-10-19-a · le message vocal du site' },
    'whatsapp-webhook': { http: 200, version: '2026-10-17-a · les points d etape entre' },
  },
  versionsAuDepot: { 'whatsapp-automate': '2026-10-24-b', 'avis-google-pont': '2026-10-26-a', 'demande-submit': '2026-10-24-b', 'whatsapp-webhook': '2026-10-17-a' },
  facteur: { vuLe: new Date(maintenantMs - 60_000).toISOString(), version: '2026-10-23-a' },
  gerard: { mode: 'ouvert', dernierPassage: A },
  automateWa: { mode: 'ouvert' },
  avisAuto: true,
  relancesActives: false,
  mndPayActif: true,
  chat: { permanence: false, claude: true },
  centreAutomatique: false,
  modelesMeta: null,
};
const voix = quiEcritSeul(AUTOMATISATIONS_REELLES, etat);
const etats = (l: (typeof voix)[number]) => [l.id, l.allume.etat, l.posee.etat, l.secret.etat, l.modeleMeta.etat, l.alarme];
dit('qui écrit seul : onze voix, chacune avec l’état réel de ses quatre cases',
  [['assistant', 'ok', 'inconnu', 'doux', 'inconnu', false], ['automate', 'ok', 'alarme', 'doux', 'doux', true], ['confirmation', 'ok', 'ok', 'doux', 'inconnu', false],
    ['entre-deux', 'ok', 'ok', 'doux', 'inconnu', false], ['relances', 'doux', 'ok', 'alarme', 'inconnu', true], ['echeances', 'ok', 'alarme', 'doux', 'inconnu', true],
    ['avis', 'ok', 'doux', 'doux', 'inconnu', false], ['reponse-aux-avis', 'doux', 'alarme', 'doux', 'doux', true], ['site', 'ok', 'alarme', 'doux', 'inconnu', true],
    ['chat', 'ok', 'ok', 'doux', 'doux', false], ['centre', 'doux', 'ok', 'doux', 'doux', false]],
  voix.map(etats));
const par = Object.fromEntries(voix.map((l) => [l.id, l]));
dit('... l’Assistant : Actif, sa fonction pas encore sondée, 8 modèles dont l’état n’est pas noté, 28 partis ce mois, dernier passage le 26 octobre 2026',
  ['Actif', 'assistant-maison · pas sondée', '8 modèles, état non noté', 28, '2026-10-26T00:00:00.000Z'],
  [par.assistant.allume.dit, par.assistant.posee.dit, par.assistant.modeleMeta.dit, par.assistant.partisCeMois, par.assistant.dernierPassage]);
dit('... l’automate : en retard sur le dépôt, dit avec les deux versions', 'whatsapp-automate 2026-10-14-b en ligne, 2026-10-24-b au dépôt', par.automate.posee.dit);
dit('... les relances : éteintes, et le secret du modèle absent : une promesse à vide', ['éteint', 'WA_TEMPLATE_RELANCE absent', 'relances-factures 2026-10-18-b', 0], [par.relances.allume.dit, par.relances.secret.dit, par.relances.posee.dit, par.relances.partisCeMois]);
dit('... les échéances : jamais posée', 'rappels-d-echeance · jamais posée', par.echeances.posee.dit);
dit('... la confirmation : par le facteur, vivant, 1 partie ce mois', [true, 1], [/facteur vivant/.test(par.confirmation.posee.dit), par.confirmation.partisCeMois]);
dit('... la demande d’avis : en ligne sans version (401 réservé au cron), allumée', ['avis-google en ligne, sans version', 'oui', 1], [par.avis.posee.dit, par.avis.allume.dit, par.avis.partisCeMois]);
dit('... le chat : Claude répond ; le Centre : coupé ; ce qu’`envois` ne compte pas le dit', ['Claude', 'coupé', null, 'ses réponses vivent dans les conversations'], [par.chat.allume.dit, par.centre.allume.dit, par.chat.partisCeMois, par.chat.compteDit]);
const facteurMort = quiEcritSeul(AUTOMATISATIONS_REELLES, { ...etat, facteur: { vuLe: new Date(maintenantMs - 10 * 60_000).toISOString() } });
dit('... le facteur muet depuis dix minutes : la confirmation passe au rouge ; non lu : inconnu', ['alarme', 'inconnu'],
  [facteurMort.find((l) => l.id === 'confirmation')?.posee.etat, quiEcritSeul(AUTOMATISATIONS_REELLES, { ...etat, facteur: undefined }).find((l) => l.id === 'confirmation')?.posee.etat]);
const avecRegistre = quiEcritSeul(AUTOMATISATIONS_REELLES, { ...etat, modelesMeta: { gerard_garder: 'approuve', gerard_envie: 'refuse', avis_google: 'approuve' } });
dit('... un registre des modèles posé : 1 approuvé sur 8, 1 refusé ; la demande d’avis approuvée, service dit', ['1 approuvé sur 8, 1 refusé', 'alarme', '1 approuvé sur 1', 'ok'],
  [avecRegistre.find((l) => l.id === 'assistant')?.modeleMeta.dit, avecRegistre.find((l) => l.id === 'assistant')?.modeleMeta.etat, avecRegistre.find((l) => l.id === 'avis')?.modeleMeta.dit, avecRegistre.find((l) => l.id === 'avis')?.modeleMeta.etat]);
dit('... rien de lu : tout inconnu, aucune promesse', ['inconnu', 'inconnu', 'inconnu', 'inconnu'],
  quiEcritSeul(AUTOMATISATIONS_REELLES, { maintenantMs, mois: '2026-10', envois: [] }).filter((l) => ['assistant', 'automate', 'avis', 'chat'].includes(l.id)).map((l) => l.allume.etat));
dit('chaque automatisation qui écrit dans `envois` appartient à une voix, et une seule', true,
  AUTOMATISATIONS_REELLES.filter((a) => a.types.length).every((a) => VOIX_DE_LA_MAISON.filter((v) => v.automatisations.includes(a.id)).length === 1));

/* ── 7. À qui il peut écrire ── */
const fiche = (o: Partial<Parameters<typeof aQuiIlPeutEcrire>[0][number]> = {}) => ({ accord: false, stop: false, couronne: false, telephone: false, ecartee: false, ...o });
const portee = aQuiIlPeutEcrire([
  fiche({ accord: true, telephone: true }),            // A. : l'accord
  fiche({ telephone: true }),                          // B. : un numéro sans accord
  fiche({ couronne: true }),                           // C. : Ma Couronne, sans numéro
  fiche({}),                                           // D. : rien
  fiche({ telephone: true, stop: true }),              // E. : stop
  fiche({ accord: true, telephone: true, ecartee: true }), // F. : écartée
  fiche({ couronne: true, enfantDuFoyer: true }),      // G. : enfant d'un foyer
  fiche({ accord: true, telephone: true, resteDu: 5000 }), // H. : une dette
], { aujourdhui: A, semaines: 2, accords: [{ oui: true, le: '2026-10-20T10:00:00Z' }, { oui: true, le: A }, { oui: false, le: '2026-10-21' }, { oui: true, le: '2026-07-01' }] });
dit('la portée : 8 fiches, 7 vivantes, 2 Ma Couronne, 2 accords WhatsApp, 1 sans accord, 1 sans téléphone, 1 stop, 1 écartée, 1 enfant, 1 au calme, 3 joignables',
  [8, 7, 2, 2, 1, 1, 1, 1, 1, 1, 3], [portee.fiches, portee.vivantes, portee.couronne, portee.accordWhatsApp, portee.sansAccord, portee.sansTelephone, portee.stop, portee.ecartees, portee.enfantsDuFoyer, portee.auCalme, portee.joignables]);
dit('... la courbe des accords par semaine (lundi), les refus et le passé lointain écartés', [{ lundi: '2026-10-19', accords: 1 }, { lundi: '2026-10-26', accords: 1 }], portee.courbe);

/* ── 8. Claude ce mois : le compteur lu entier ── */
const compteur = {
  '2026-09': { usd: 12.5, appels: 40, entree: 1, sortie: 1 },
  '2026-10': { usd: 16.2, appels: 51, entree: 2, sortie: 2 },
  parChantier: { '2026-10': { avis: { usd: 8, appels: 20 }, capture: { usd: 5, appels: 10 }, 'reponse-wa': { usd: 3.2, appels: 21 } } },
};
dit('le compteur des huit se lit entier : `parChantier` n’est pas un mois', [['2026-09', '2026-10'], 16.2, 0], [moisDuCompteur(compteur), lignesDuCompteur(compteur)['2026-10'].usd, (lignesDuCompteur(compteur) as Record<string, unknown>).parChantier ?? 0]);
dit('... le détail du mois, du plus cher au moins cher', [['avis', 8, 20], ['capture', 5, 10], ['reponse-wa', 3.2, 21]], detailDuMois(compteur, '2026-10').map((d) => [d.chantier, d.usd, d.appels]));
const octobre = claudeDuMois({ huit: compteur, centre: { '2026-10': { usd: 2, appels: 4, entree: 0, sortie: 0 } }, quand: new Date('2026-10-15T12:00:00Z') });
dit('Claude ce mois : 16,20 $ sur 120 $, 51 appels, le Centre à part, 18,20 $ en tout', ['2026-10', 16.2, 51, 120, 0.135, 2, 18.2],
  [octobre.mois, octobre.usd, octobre.appels, octobre.plafond, octobre.part, octobre.centreUsd, octobre.totalUsd]);
dit('... le mois se lit à Cotonou : 23 h 30 UTC le 31 octobre est déjà novembre', ['2026-11', 0], [claudeDuMois({ huit: compteur, quand: new Date('2026-10-31T23:30:00Z') }).mois, claudeDuMois({ huit: compteur, quand: new Date('2026-10-31T23:30:00Z') }).usd]);
dit('... un document vide ou abîmé : zéro, jamais une chute', [0, 0, []], [claudeDuMois({ huit: null, quand: new Date('2026-10-15T12:00:00Z') }).usd, claudeDuMois({ huit: { '2026-10': 'abîmé' }, quand: new Date('2026-10-15T12:00:00Z') }).usd, detailDuMois({ parChantier: 'rien' }, '2026-10')]);

/* ── 9. Le fichier lui-même ── */
const pur = sansCommentaires(readFileSync('src/shared/rapporte-pur.ts', 'utf8'));
dit('le pur ne lit rien (ni supabase, ni store, ni React) et ne pose aucun tarif Meta en dur', [false, false, false],
  [/supabase|from '\.\/store'|from 'react'/.test(pur), /\u2014/.test(pur), /tarifs\s*=\s*\{\s*(utilitaire|marketing|authentification)\s*:\s*\d/.test(pur)]);
dit('les services sont ceux de dernier-message-pur, jamais une liste à part', [true, false], [/estUnService/.test(pur), /SERVICES_DU_COMPTE|const SERVICES\b/.test(pur)]);

console.log(ko === 0 ? '\nLe compte tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
