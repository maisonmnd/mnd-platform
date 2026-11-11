/* UNE SÉANCE MANQUÉE NE SE PERD PAS, ÉPROUVÉ · 6 novembre 2026.
   `node scripts/verifie-la-seance-ne-se-perd-pas.mjs` (et `--prouve`).

   « Dans le chemin des sceaux enlève Manqué. On ne perd pas les séances qu'on
   a manquées, donc je préfère ne même pas comptabiliser. J'annule et je
   reprogramme seulement, donc enlève. » (Yéman.)

   La décision 3 du 20 octobre 2026 (« annulée à moins de 24 h, ou absente :
   comptée, Manquée ; la Maison peut la rendre ») est levée. Ce banc garde la
   règle neuve là où l'ancienne vivait : le juge, ses deux copies (la base, la
   fonction des relances), ce que la cliente lit, les gestes du Trône. Le vrai
   SQL se joue dans verifie-le-serveur-de-l-abonnee (PGlite).
   Personnes et dates inventées. */
import { readFileSync } from 'node:fs';
import { etatDeLaSeance, releveDeLAbonnee, type ContratLu, type SeanceLue } from '../src/shared/abonnee-pur';
import type { Plan } from '../src/shared/abonnements';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/** Le code sans ses commentaires : une règle se juge sur ce qui s'exécute et s'affiche. */
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sansCommentairesSql = (s: string) => s.replace(/--[^\n]*/g, '');

/* ── 1. LE JUGE ─────────────────────────────────────────────────────── */
const plan = { id: 'pl-six', name: 'GBÈJÍ™ · Carnet de Six', tag: '', priceXof: 140000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-g', qty: 6 }], mode: 'pack', validityDays: 270 } as Plan;
const contrat = (x: Partial<ContratLu> = {}): ContratLu => ({
  id: 'sub-1', branchId: 'm', clientId: 'c1', name: 'A. D.', planId: 'pl-six', slot: '', nextIso: '2026-11-01', since: '', sinceIso: '2026-10-02', startIso: '2026-10-02',
  expiresIso: '2027-06-29', status: 'active', reference: 'ABO-2026-014', mrrXof: 0, priceXof: 140000, prixConvenuXof: 140000,
  echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }],
  payments: [{ id: 'p1', date: '2026-10-02', amountXof: 70000 }], ...x,
}) as ContratLu;
const rdv = (id: string, date: string, status: SeanceLue['status'], x: Partial<SeanceLue> = {}): SeanceLue =>
  ({ id, branchId: 'm', clientId: 'c1', serviceIds: ['svc-g'], date, time: '10:00', master: '', status, coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement', ...x }) as SeanceLue;

const JOUR = '2026-11-06';
const laVeilleAuSoir = rdv('v', '2026-11-03', 'annulé', { annuleeLe: '2026-11-02T20:00:00+01:00', annuleePar: 'cliente' });
const uneHeureAvant = rdv('h', '2026-11-04', 'annulé', { annuleeLe: '2026-11-04T09:00:00+01:00', annuleePar: 'cliente' });
const apresLHeure = rdv('p', '2026-11-04', 'annulé', { annuleeLe: '2026-11-04T15:00:00+01:00', annuleePar: 'cliente' });
const parLaMaison = rdv('m', '2026-11-05', 'annulé', { annuleeLe: '2026-11-05T08:00:00+01:00', annuleePar: 'maison' });
const absente = rdv('a', '2026-11-02', 'confirmé', { absente: { le: '2026-11-02' } });
const absenteClose = rdv('ac', '2026-11-02', 'annulé', { absente: { le: '2026-11-02' } });
const ancienneRendue = rdv('r', '2026-10-28', 'annulé', { annuleeLe: '2026-10-28T08:00:00+01:00', annuleePar: 'cliente', rendue: { le: '2026-10-29', motif: 'malade' } });

dit('annulée la veille au soir, une heure avant, après l heure, par la Maison : annulée', ['annulee', 'annulee', 'annulee', 'annulee'],
  [laVeilleAuSoir, uneHeureAvant, apresLHeure, parLaMaison].map((a) => etatDeLaSeance(a, JOUR)));
dit('absente, que le rendez-vous soit clos ou non : annulée', ['annulee', 'annulee'], [absente, absenteClose].map((a) => etatDeLaSeance(a, JOUR)));
dit('l ancienne trace « rendue » ne change rien : annulée', 'annulee', etatDeLaSeance(ancienneRendue, JOUR));
dit('ce qui compte, compte toujours : faite, réservée, à clôturer', ['faite', 'confirmee', 'a-cloturer'],
  [rdv('f', '2026-10-06', 'honoré'), rdv('c', '2026-11-20', 'confirmé'), rdv('k', '2026-11-01', 'confirmé')].map((a) => etatDeLaSeance(a, JOUR)));

const appts = [
  rdv('f1', '2026-10-06', 'honoré'), rdv('f2', '2026-10-16', 'honoré'),
  laVeilleAuSoir, uneHeureAvant, apresLHeure, parLaMaison, absente, ancienneRendue,
  rdv('c1', '2026-11-20', 'confirmé'),
];
const releve = releveDeLAbonnee({ jour: JOUR, clientId: 'c1', subs: [contrat()], plans: [plan], appts, invoices: [], restesHorsFormule: [] });
const c = releve.contrats[0];
const l = c?.seances[0];
dit('deux faites, une réservée, six séances qui n ont pas eu lieu : il reste trois disponibles sur six',
  { incluses: 6, faites: 2, reservees: 1, disponibles: 3 }, l && { incluses: l.incluses, faites: l.faites, reservees: l.reservees, disponibles: l.disponibles });
dit('aucune séance ne porte l état « manquée », aucune ligne ne compte de « manquées »', [[], false],
  [(c?.attribuees ?? []).filter((s) => (s.etat as string) === 'manquee').map((s) => s.id), !!l && 'manquees' in l]);
dit('les six séances qui n ont pas eu lieu sont hors compte, et disent pourquoi', ['a', 'h', 'm', 'p', 'r', 'v'],
  (c?.attribuees ?? []).filter((s) => !s.compte && s.pourquoiPas === 'annulee').map((s) => s.id).sort());
dit('la réservée garde son rang : séance 3 sur 6', { rang: 3, total: 6 }, (() => { const s = c?.attribuees.find((x) => x.id === 'c1'); return s && { rang: s.rang, total: s.total }; })());

const resilie = releveDeLAbonnee({
  jour: JOUR, clientId: 'c1', subs: [contrat({ status: 'churn', resilieeLe: '2026-11-05', motifDeResiliation: 'voyage' } as Partial<ContratLu>)], plans: [plan],
  appts: [rdv('f1', '2026-10-06', 'honoré'), rdv('f2', '2026-10-16', 'honoré'), absenteClose, laVeilleAuSoir], invoices: [], restesHorsFormule: [],
});
const cr = [...resilie.contrats, ...resilie.anciens].find((x) => x.sub.id === 'sub-1');
dit('à la résiliation, le prorata ne compte que les séances faites : 2 sur 6', { seances: 6, comptees: 2 },
  cr?.argent.prorata && { seances: cr.argent.prorata.seances, comptees: cr.argent.prorata.comptees });

/* ── 2. LES TROIS COPIES DE LA RÈGLE ────────────────────────────────── */
const juge = sansCommentaires(lis('src/shared/abonnee-pur.ts'));
dit('le juge : plus d état « manquee », absente ou annulée revient à la formule', [false, true, true],
  [/'manquee'/.test(juge), juge.includes("if (a.absente || a.status === 'annulé') return 'annulee';"), juge.includes("const prendUnCredit = (etat: EtatSeance): boolean => etat !== 'annulee';")]);
const sql = sansCommentairesSql(lis('supabase/migrations/0169_une_seance_manquee_ne_se_perd_pas.sql'));
dit('la base (0169) : les deux fonctions remplacées, sans « manquee », absente ou annulée revient à la formule', [true, true, false, true, true],
  [sql.includes('create or replace function public.abo_etat_de_la_seance(a jsonb, jour date) returns text'),
    sql.includes('create or replace function public.abo_prend_un_credit(a jsonb, jour date) returns boolean'),
    /manquee/.test(sql.slice(0, sql.lastIndexOf('select\n'))),
    /if public\.abo_vrai\(a->'absente'\) or v_st = 'annulé' then\s+return 'annulee';/.test(sql),
    sql.includes("select public.abo_etat_de_la_seance(a, jour) <> 'annulee';")]);
const relances = sansCommentaires(lis('supabase/functions/relances-factures/index.ts'));
dit('la fonction des relances : même règle, le prorata ne compte que les faites, la version le dit', [false, true, true, true],
  [/'manquee'/.test(relances), relances.includes("if (a.absente || a.status === 'annulé') return 'annulee';"),
    relances.includes("return etatDeLaSeance(a, jour) === 'faite';"), /const VERSION = '2026-11-(?:0[6-9]|1[0-9])-[a-z] · .*une séance manquée ne se perd pas : le prorata ne compte que les faites/.test(relances)]);

/* ── 3. CE QUE LA CLIENTE LIT ───────────────────────────────────────── */
const C = 'src/apps/couronne/';
const ecrans = ['AchatFormule.tsx', 'SesFormules.tsx', 'MesRendezVous.tsx', 'ReserverIncluse.tsx', 'RendezVousTab.tsx', 'Abonnee.tsx', 'releve.ts', 'Tabs.tsx'];
const INTERDITS = /est comptée|sera comptée|elle est comptée|« Manquée »|'Manquée'|manquée, comptée|\{n\} manquées?|Rendue par la Maison|peut (vous )?la rendre|sans la compter/;
dit('aucun écran de Ma Couronne ne dit plus qu une séance est comptée, manquée, ou à rendre', [],
  ecrans.filter((f) => INTERDITS.test(sansCommentaires(lis(C + f)))));
const PROMESSE = 'Une séance annulée ou manquée n’est jamais perdue : elle revient à votre formule.';
dit('la promesse se lit à l achat et dans « Ce qui est convenu » (lune et carnet)', [1, 2],
  [lis(C + 'AchatFormule.tsx').split(`t('${PROMESSE}')`).length - 1, lis(C + 'SesFormules.tsx').split(`t('${PROMESSE}')`).length - 1]);
dit('... et à la réservation d une séance incluse', true,
  lis(C + 'ReserverIncluse.tsx').includes("t('Sans acompte. Annulée ou manquée, une séance n’est jamais perdue : elle revient à votre formule.')"));
dit('la case à cocher de l achat ne fait plus accepter une séance comptée', true,
  lis(C + 'AchatFormule.tsx').includes("<span>{t('J’ai lu ce qui est convenu : les séances non prises à la date de fin sont perdues.')}</span>"));
const mrdv = lis(C + 'MesRendezVous.tsx');
dit('annuler une séance de formule dit toujours qu elle revient, sans condition d heure', [true, true, false],
  [mrdv.includes("t('Rien n’est compté. La séance revient à votre formule : {avant} → {apres} disponibles sur {total}.'"),
    mrdv.includes("t('Rien n’est compté, la séance revient à votre formule.')"), /compte: true/.test(sansCommentaires(mrdv))]);
const en = lis(C + 'i18n/en-abonnee.ts');
dit('le dictionnaire anglais suit : la promesse y est, « Missed » n y est plus', [true, false],
  [en.includes(`'${PROMESSE}': 'A cancelled or missed session is never lost: it goes back to your plan.',`), /'Manquée'|manquée, comptée|\{n\} manquée/.test(en)]);

/* ── 4. LES GESTES DU TRÔNE ─────────────────────────────────────────── */
const T = 'src/apps/trone/routes/clients/';
const seanceSrc = sansCommentaires(lis(T + 'SeanceDeLaFormule.tsx'));
dit('fiche du rendez-vous : « Absente : annuler la séance », plus de « marquer manquée » ni de « Rendre la séance »', [true, false, false],
  [seanceSrc.includes('Absente : annuler la séance'), /marquer manquée|Marquer manquée/.test(seanceSrc), /Rendre la séance|rendLaSeance/.test(seanceSrc)]);
const carte = sansCommentaires(lis(T + 'CarteAbonnement.tsx'));
dit('carte Abonnement : plus de « Rendre la séance », plus de part « manquée » dans la barre', [false, false], [/Rendre la séance|rendLaSeance/.test(carte), /manqu[ée]e/i.test(carte)]);
const gestes = sansCommentaires(lis(T + 'gestes-de-l-abonnement.ts'));
dit('les gestes : absente annule et rend à la formule ; plus rien à rendre, plus d annulation « comptée »', [true, false, false, false],
  [gestes.includes("laClienteLit: 'Annulée, la séance revient à votre formule.'"), /export function (effetDeRendre|rendLaSeance|effetDeLAnnulation)\(/.test(gestes),
    /COMPTÉE|Manquée|marquée « Manquée »/.test(gestes), /'manquee'/.test(gestes)]);
const shared = lis(T + '_shared.tsx');
dit('annuler au comptoir ne demande plus « Qui annule ? » : la séance revient à la formule', [false, true],
  [sansCommentaires(shared).includes('Qui annule cette séance ?'), shared.includes("const parQui: 'maison' | null = appt.coveredBySub && appt.coverKind !== 'forfait' ? 'maison' : null;")]);
dit('les comptes des abonnées (équipe) ne disent plus « manquée »', false, /manquees|manquée\{/.test(sansCommentaires(lis('src/apps/trone/routes/equipe/Abonnements.tsx'))));

console.log(ko === 0 ? '\nUne séance manquée ne se perd pas : la règle tient partout.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
