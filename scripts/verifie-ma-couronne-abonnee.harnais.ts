/* MA COURONNE DE L'ABONNÉE, ÉPROUVÉE — `node scripts/verifie-ma-couronne-abonnee.mjs`.

   20 octobre 2026, lot L6 du parcours de l'abonnée. Maquette L0 validée par
   Yéman (« construis c'est bon comme ça »). Ce banc tient la PROMESSE des
   écrans, pas ce que le code fait aujourd'hui :
     - la barre du bas : Accueil · Rendez-vous · Ma formule · Suivi · Profil,
       chaque glyphe une seule fois, plus de Gamme ni de Cercle dans la barre ;
     - les liens #/rdv/<id>, #/formule, #/solde, #/reserver/incluse s'ouvrent ;
     - chaque écran de l'abonnée lit le juge unique (`releveDeLAbonnee`), et
       aucun écran de Ma Couronne ne recompte (l'ancien min/max, les vieux juges) ;
     - Mon solde garde ses trois chiffres séparés, jamais additionnés ;
     - les gestes passent par le serveur (réserver une séance incluse, annuler,
       déplacer, renoncer), et une fonction absente se dit en clair ;
     - les phrases : l'année sur toute date, aucun tiret cadratin, aucune
       civilité, jamais « salon », jamais le nom d'un maître. */
import { readFileSync } from 'node:fs';
import { releveDeLAbonnee, type ContratLu, type SeanceLue } from '../src/shared/abonnee-pur';
import type { Plan } from '../src/shared/abonnements';
import { dateCourte, dateLongue, dateSansJour, dateDansLaPhrase, restesHorsFormuleDe, seanceDuRelevé } from '../src/apps/couronne/releve';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const D = 'src/apps/couronne/';
/* Le code, sans ses commentaires : une règle écrite en commentaire n'est pas tenue. */
const lis = (f: string) => readFileSync(`${D}${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const app = lis('App.tsx');
const ECRANS = ['Abonnee.tsx', 'SesFormules.tsx', 'MonSolde.tsx', 'ReserverIncluse.tsx', 'RendezVousTab.tsx', 'AchatFormule.tsx', 'MesRendezVous.tsx', 'MaFormule.tsx', 'Booking.tsx', 'ProchaineMarche.tsx'];
const NEUFS = ['Abonnee.tsx', 'SesFormules.tsx', 'MonSolde.tsx', 'ReserverIncluse.tsx', 'RendezVousTab.tsx', 'AchatFormule.tsx', 'releve.ts'];

/* ── 1. LA BARRE DU BAS (décision 8) ───────────────────────────────────── */
const blocDesOnglets = app.slice(app.indexOf('const TABS'), app.indexOf('];', app.indexOf('const TABS')));
dit('... la barre porte cinq onglets, ni Gamme ni Cercle', [5, false], [(blocDesOnglets.match(/\{ id: '/g) ?? []).length, /'(gamme|cercle)'/.test(blocDesOnglets)]);
const onglets = [...app.matchAll(/\{ id: '(\w+)', label: '([^']+)', glyph: '([^']+)' \}/g)].map((m) => [m[1], m[2], m[3]]);
dit('la barre : Accueil - Rendez-vous - Ma formule - Suivi - Profil, dans cet ordre',
  [['accueil', 'Accueil', '♛'], ['rdv', 'Rendez-vous', '◷'], ['formule', 'Ma formule', '◈'], ['suivi', 'Suivi', '✦'], ['profil', 'Profil', '◉']], onglets);
dit('... chaque glyphe ne sert qu une fois', onglets.length, new Set(onglets.map((o) => o[2])).size);
dit('... la Gamme et le Cercle ont quitte la barre, ils restent une touche plus loin', [false, true, true], [
  /type TabId = [^;]*'(gamme|cercle)'/.test(app),
  /setEcran\('gamme'\)/.test(app) && /<GammeTab /.test(app),
  /setEcran\('cercle'\)/.test(app) && /<CercleTab /.test(app),
]);
dit('... et le Profil les ouvre aussi, avec Mon solde', true, /<ProfilTab toast=\{toast\} entrees=\{\{ solde: \(\) => setEcran\('solde'\), gamme: versLaGamme, cercle: versLeCercle \}\} \/>/.test(app));

/* ── 2. LES LIENS PROFONDS ─────────────────────────────────────────────── */
dit('les liens : #/rdv/<id> garde, #/formule, #/solde, #/reserver/incluse ajoutes', [true, true, true, true], [
  /\/\^#\\\/rdv\\\/\(\[A-Za-z0-9_-\]\+\)\$\/\.exec\(window\.location\.hash\)/.test(app),
  /h === '#\/formule'\) \{ setEcran\(null\); setTab\('formule'\); \}/.test(app),
  /h === '#\/solde'\) setEcran\('solde'\)/.test(app),
  /h === '#\/reserver\/incluse'\) openIncluse\(\)/.test(app),
]);
dit('... a l ouverture comme en route', 2, (app.match(/window\.addEventListener\('hashchange', /g) ?? []).length);

/* ── 3. UN SEUL JUGE ───────────────────────────────────────────────────── */
const releveTs = lis('releve.ts');
dit('le releve de la tete vient du juge unique', true, /releveDeLAbonnee\(\{/.test(releveTs) && /from '\.\.\/\.\.\/shared\/abonnee-pur'/.test(releveTs));
dit('chaque ecran de l abonnee lit le releve (le juge, ou son releve)', [],
  ECRANS.filter((f) => !/from '\.\.\/\.\.\/shared\/abonnee-pur'|from '\.\/releve'|from '\.\/Abonnee'/.test(lis(f))));
const VIEUX = /\b(subServiceUsage|usageDetaille|activeSubscriberOf|peutReserver|subPaid|resteDuContrat|retardDuContrat|coveredRemaining|etatDesEcheances)\(/;
const fichiersCouronne = ['App.tsx', 'Tabs.tsx', 'MaFormule.tsx', 'AchatFormule.tsx', 'Booking.tsx', 'MesRendezVous.tsx', 'ProchaineMarche.tsx', 'Compose.tsx', ...NEUFS];
dit('aucun ecran ne recompte (ni l ancien min/max, ni les vieux juges)', [],
  fichiersCouronne.filter((f) => VIEUX.test(lis(f))));
dit('... plus de " il vous reste {plus petit} sur {plus grand} "', [], fichiersCouronne.filter((f) => /Math\.min\(m, u\.remaining\)|Math\.max\(m, u\.qty/.test(lis(f))));
dit('la porte de la reservation lit le releve', [true, false], [/useReleve\(/.test(lis('Booking.tsx')), /peutReserver\(sien\.echeances/.test(lis('Booking.tsx'))]);
dit('reserver propose la formule qui finit le plus tot, l autre au choix', true,
  /formuleProposeePourReserver\(releve, serviceId, iso\)/.test(lis('ReserverIncluse.tsx')) && /className="ab-compter"/.test(lis('ReserverIncluse.tsx')));

/* ── 4. MON SOLDE : TROIS CHIFFRES, JAMAIS UN ─────────────────────────── */
const solde = lis('MonSolde.tsx');
dit('mon solde dit a regler aujourd hui, a venir, avoir', [true, true, true],
  [/prix\(s\.aRegleAujourdhuiXof\)/.test(solde), /prix\(s\.aVenirXof\)/.test(solde), /prix\(s\.avoirXof\)/.test(solde)]);
dit('... sans jamais les additionner', [], NEUFS.filter((f) => /aRegleAujourdhuiXof\s*\+|aVenirXof\s*\+|\+\s*s\.aVenirXof|avoirXof\s*\+/.test(lis(f))));

/* ── 5. LES GESTES PASSENT PAR LE SERVEUR ─────────────────────────────── */
const mrdv = lis('MesRendezVous.tsx');
dit('les gestes : reserver une incluse, annuler, deplacer, renoncer', [true, true, true, true], [
  /appelleLaMaison<[^>]*>\(\s*'reserver_une_seance_incluse'/.test(lis('ReserverIncluse.tsx')),
  /appelleLaMaison<[^>]*>\('annuler_une_seance'/.test(mrdv),
  /appelleLaMaison<[^>]*>\('deplacer_une_seance'/.test(mrdv),
  /appelleLaMaison<[^>]*>\('renoncer_a_la_formule'/.test(app),
]);
dit('une fonction absente se dit, elle ne laisse pas l ecran blanc', [true, true],
  [/code === 'PGRST202' \|\| code === '42883'/.test(releveTs), /r\.absente\s*\?\s*t\('La réservation d’une séance de votre formule ouvre très bientôt/.test(lis('ReserverIncluse.tsx'))]);
dit('annuler et deplacer disent leur effet avant d agir (24 h)', [true, true],
  [/effetDeLAnnulation\(cancelling\)/.test(mrdv), /heuresAvant\(editing\) < 24/.test(mrdv)]);
dit('la seance d une formule ne se deplace pas apres sa fin', true, /\(!fin \|\| iso <= fin\)/.test(mrdv));

/* ── 6. LES PHRASES DE LA MAISON ───────────────────────────────────────── */
const literaux = (f: string) => [...lis(f).matchAll(/\bt\(\s*'((?:\\.|[^'\\\n])*)'/g)].map((m) => m[1]);
const tous = NEUFS.flatMap((f) => literaux(f).map((x) => [f, x] as const));
dit('les ecrans neufs parlent (plus de 150 phrases)', true, tous.length > 150);
dit('aucun tiret cadratin', [], NEUFS.filter((f) => lis(f).includes('—')));
dit('aucune civilite', [], tous.filter(([, x]) => /\b(Madame|Monsieur|Mme|Mlle)\b/.test(x)).map(([f, x]) => `${f}: ${x}`));
dit('jamais " salon "', [], tous.filter(([, x]) => /\bsalons?\b/i.test(x)).map(([f, x]) => `${f}: ${x}`));
dit('jamais le nom d un maitre cote cliente', [],
  NEUFS.filter((f) => /\{maitre\}|preferredMaster|\.master\b(?!\s*\?\?\s*'')/.test(lis(f).replace(/service\?\.master \?\? ''/g, ''))));
dit('aucune date sans son annee (pas de toLocaleDateString ici)', [], NEUFS.filter((f) => /toLocaleDateString|toLocaleString\(/.test(lis(f))));
dit('les dates des ecrans portent l annee', ['Mar. 3 nov. 2026', 'Dimanche 1er novembre 2026', '2 nov. 2026', 'mardi 29 juin 2027'],
  [dateCourte('2026-11-03'), dateLongue('2026-11-01'), dateSansJour('2026-11-02'), dateDansLaPhrase('2027-06-29')]);

/* ── 7. LE RELEVÉ DE L'ÉCRAN, SUR LE SCÉNARIO D'AKOUAVI ───────────────── */
const plan = { id: 'pl-six', name: 'GBÈJÍ™ · Carnet de Six', tag: '', priceXof: 140000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-g', qty: 6 }], mode: 'pack', validityDays: 270 } as Plan;
const sub = {
  id: 'sub-1', branchId: 'm', clientId: 'c1', name: 'A. D.', planId: 'pl-six', slot: '', nextIso: '2026-11-01', since: '', sinceIso: '2026-10-02', startIso: '2026-10-02',
  expiresIso: '2027-06-29', status: 'active', reference: 'ABO-2026-014', mrrXof: 0, priceXof: 140000, prixConvenuXof: 140000,
  echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }],
  payments: [{ id: 'p1', date: '2026-10-02', amountXof: 70000 }],
} as ContratLu;
const rdv = (id: string, date: string, status: SeanceLue['status'], x: Partial<SeanceLue> = {}): SeanceLue =>
  ({ id, branchId: 'm', clientId: 'c1', serviceIds: ['svc-g'], date, time: '10:00', master: '', status, ...x }) as SeanceLue;
const appts = [
  rdv('r1', '2026-10-06', 'honoré', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement', priceXof: 28000 }),
  rdv('r2', '2026-10-16', 'honoré', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement' }),
  rdv('rc', '2026-10-16', 'honoré', { serviceIds: ['svc-c'], priceXof: 25000, payments: [{ id: 'pc', date: '2026-10-16', amountXof: 15000 }] }),
  rdv('r3', '2026-11-03', 'confirmé', { coveredBySub: true, subId: 'sub-1', coverKind: 'abonnement' }),
  rdv('rx', '2026-10-12', 'annulé', { priceXof: 30000 }),
  rdv('rf', '2026-11-20', 'confirmé', { serviceIds: ['svc-c'], priceXof: 25000 }),
];
const jour = '2026-10-20';
const restes = restesHorsFormuleDe('c1', appts, [], [sub], jour);
dit('hors formule : le reste d un rituel passe, ni l annule, ni l a venir, ni l inclus', [{ id: 'rc', genre: 'rituel', date: '2026-10-16', resteXof: 10000 }], restes);
const releve = releveDeLAbonnee({ jour, clientId: 'c1', subs: [sub], plans: [plan], appts, invoices: [], restesHorsFormule: restes });
const x = seanceDuRelevé(releve, 'r3');
dit('la seance du 3 novembre est la seance 3 sur 6 de son contrat', ['sub-1', 3, 6], [x?.c.sub.id, x?.s.rang, x?.s.total]);
dit('... et le releve dit 2 faites, 1 reservee, 3 disponibles', [2, 1, 3], [releve.contrats[0].seances[0].faites, releve.contrats[0].seances[0].reservees, releve.contrats[0].seances[0].disponibles]);
dit('... le solde garde trois chiffres : 10 000 F dus, 70 000 F a venir, 0 F d avoir', [10000, 70000, 0], [releve.solde.aRegleAujourdhuiXof, releve.solde.aVenirXof, releve.solde.avoirXof]);

console.log(ko === 0 ? '\nMa Couronne de l abonnee tient sa promesse.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
