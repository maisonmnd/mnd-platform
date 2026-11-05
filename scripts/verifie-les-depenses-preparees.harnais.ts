/* LES DEPENSES PREPAREES PAR GRENAT, EPROUVEES — 5 novembre 2026.
   `node scripts/verifie-les-depenses-preparees.mjs` (et `--prouve`).

   La decision (Yeman, maquette FyXznPQfTLKnL5MQgbn4C1, « construis, dans cet
   ordre ») : un message au Trone, ecrit ou dicte, lu sans IA payante ; Grenat
   dit ce qu il lit AVANT de poser, demande ce qu il ne comprend pas ; ecrite
   par la direction, la depense est acquise, par l equipe elle attend la
   validation ; jamais deux fois (meme montant, meme jour, meme beneficiaire),
   jamais un prestataire, rien de la famille. Les engagements de chaque mois :
   le jour venu, Grenat prepare la depense a valider, une fois par mois et par
   engagement (cle engagement:<id>:<aaaa-mm>) ; l ancien engagement mensuel en
   base se reprend dans la liste. « Direction seule » (5 novembre 2026) : la
   ligne des engagements se lit et s ecrit par la direction (0160), rien ne
   change pour les autres cles.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases. */
import { readFileSync, readdirSync } from 'node:fs';
import {
  depenseDeLaPhrase, ditLaLecture, enregistreeAcquise, jugeLaPhrase, lisLaPhrase, origineDeLaDepense,
  type ContexteDeLaPhrase,
} from '../src/shared/depense-en-une-phrase-pur';
import {
  CLE_DES_ENGAGEMENTS, cleDeLEngagement, dateDuMois, depensesAPreparer, engagementValide, idDeLaDepensePreparee, mensuellesAReprendre,
  moisAPreparer, premierMois, repriseDeLaMensuelle, type EngagementDuMois,
} from '../src/shared/engagements-du-mois-pur';
import { depensesDuJour, type DepenseLue } from '../src/shared/cloture-du-jour-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
};
const lf = (t: string) => t.replace(/\r\n/g, '\n');
const lis = (f: string) => lf(readFileSync(f, 'utf8'));

const AUJ = '2026-11-05'; // un jeudi
const CATEGORIES = [
  { name: 'Marketing', subs: ['Publicité réseaux'] },
  { name: 'Matières premières', subs: ['Beurres', 'Plantes & actifs', 'Contenants & packaging', 'Cristaux & poudres'] },
  { name: 'Salaires', subs: [] },
  { name: 'Sous-traitance', subs: [] },
  { name: 'Divers', subs: ['Imprévu'] },
  { name: 'Équipement', subs: [] },
  { name: 'Frais bancaires', subs: [] },
  { name: 'Local', subs: ['Loyer', 'Énergie', 'Internet & téléphone', 'Entretien des lieux'] },
  { name: 'Logistique', subs: ['Livraisons', 'Transport équipe', 'Coursiers', 'Stockage'] },
];
const DIRECTION: ContexteDeLaPhrase = {
  aujourdhui: AUJ,
  caisses: ['Caisse Principale', 'MoMoPay Maison MND', 'MoMo Privé', 'Real Money', 'Autres', 'Carte'],
  caisseDesEspeces: 'Caisse Principale', caisseMomo: 'MoMoPay Maison MND', caisseMomoPrive: 'MoMo Privé',
  porteurs: ['Raoul', 'Sandrine', 'Brice Ahouansou', 'Sandrine maison', 'Gérard'],
  categories: CATEGORIES,
};
const EQUIPE: ContexteDeLaPhrase = { ...DIRECTION, caisses: ['Caisse Indépendantes'], caisseDesEspeces: 'Caisse Indépendantes', caisseMomo: undefined, caisseMomoPrive: undefined, signeDe: 'Gérard' };
const lu = (p: string, ctx = DIRECTION) => lisLaPhrase(p, ctx);
const coeur = (p: string, ctx = DIRECTION) => {
  const l = lu(p, ctx);
  return [l.montantXof ?? null, l.date, l.caisse ?? null, l.porteur ?? null, l.laMaisonAPaye, l.avancee, l.categorie, l.sousCategorie ?? null, l.libelle, l.questions];
};

/* ── 1. Les phrases reelles ── */
dit('« transport des produits 3 000 F especes, paye par Brice »', [3000, AUJ, 'Caisse Principale', 'Brice Ahouansou', false, false, 'Logistique', null, 'Transport des produits', []],
  coeur('transport des produits 3 000 F espèces, payé par Brice'));
dit('... Grenat lit, avant de poser', 'Grenat lit : Transport des produits · 3 000 F · Logistique · Caisse Principale (espèces) · payé par Brice Ahouansou · aujourd’hui.',
  ditLaLecture(lu('transport des produits 3 000 F espèces, payé par Brice'), AUJ));
dit('« eau et savon 2500 hier » : la veille, Divers, la caisse par defaut, la Maison a paye', [2500, '2026-11-04', 'Caisse Principale', null, true, false, 'Divers', null, 'Eau et savon', []],
  coeur('eau et savon 2500 hier'));
dit('... et Grenat le dit, l annee sur la date', 'Grenat lit : Eau et savon · 2 500 F · Divers · Caisse Principale, la caisse par défaut · payé par la Maison · hier, 4 novembre 2026.',
  ditLaLecture(lu('eau et savon 2500 hier'), AUJ));
dit('« loyer novembre 300 000 MoMo » : la caisse MoMo, Local, Loyer, le mois recoit son annee', [300000, AUJ, 'MoMoPay Maison MND', null, true, false, 'Local', 'Loyer', 'Loyer novembre 2026', []],
  coeur('loyer novembre 300 000 MoMo'));
dit('« 3 mille taxi zem » : trois mille francs, Logistique', [3000, 'Logistique', 'Taxi zem'], (() => { const l = lu('3 mille taxi zem'); return [l.montantXof, l.categorie, l.libelle]; })());
dit('« 3000 » nu suffit quand il est seul', 3000, lu('gaz 3000').montantXof ?? null);
dit('« meches 45 000 F le 3 novembre » : la date dite, Matieres premieres', [45000, '2026-11-03', 'Matières premières', 'Mèches'],
  (() => { const l = lu('mèches 45 000 F le 3 novembre'); return [l.montantXof, l.date, l.categorie, l.libelle]; })());
dit('« lundi taxi 2000 » : le lundi le plus recent', '2026-11-02', lu('lundi taxi 2000').date);
dit('« le 3, taxi 2000 » : le 3 du mois', ['2026-11-03', 2000], (() => { const l = lu('le 3, taxi 2000'); return [l.date, l.montantXof]; })());
dit('« taxi 1500 F ce matin » : aujourd hui', [AUJ, 1500, 'Taxi'], (() => { const l = lu('taxi 1500 F ce matin'); return [l.date, l.montantXof, l.libelle]; })());
dit('« 03/11/2026 internet 15 000 F » : la date ecrite, Internet & telephone', ['2026-11-03', 15000, 'Local', 'Internet & téléphone'],
  (() => { const l = lu('03/11/2026 internet 15 000 F'); return [l.date, l.montantXof, l.categorie, l.sousCategorie]; })());
dit('« loyer decembre 300 000 MoMo » : decembre 2026', 'Loyer décembre 2026', lu('loyer décembre 300 000 MoMo').libelle);
dit('« transport 2000 MoMo prive » : la caisse MoMo Prive', 'MoMo Privé', lu('transport 2000 MoMo privé').caisse ?? null);
dit('« taxi 1500 caisse Real Money » : la caisse nommee', 'Real Money', lu('taxi 1500 caisse Real Money').caisse ?? null);
dit('« taxi 1500 caisse Autres » : « Autres » apres « caisse »', 'Autres', lu('taxi 1500 caisse Autres').caisse ?? null);
dit('« taxi et autres frais 1500 » : « autres » n est pas une caisse', 'Caisse Principale', lu('taxi et autres frais 1500').caisse ?? null);
dit('« avance par Sandrine 4000 courses marche » : de sa poche, sans caisse', ['Sandrine', true, null, false, []],
  (() => { const l = lu('avancé par Sandrine 4000 courses marché'); return [l.porteur ?? null, l.avancee, l.caisse ?? null, l.laMaisonAPaye, l.questions]; })());
dit('« Brice a paye 2000 taxi » : le nom avant « a paye »', 'Brice Ahouansou', lu('Brice a payé 2000 taxi').porteur ?? null);
dit('« eau 1500 payee par la Maison » : la Maison', [true, null], (() => { const l = lu('eau 1500 payée par la Maison'); return [l.laMaisonAPaye, l.porteur ?? null]; })());
dit('« transport par zem 1000 » : « par zem » n est pas un porteur', [null, true, 'Transport par zem'], (() => { const l = lu('transport par zem 1000'); return [l.porteur ?? null, l.laMaisonAPaye, l.libelle]; })());

/* ── 2. Ce qu il ne comprend pas, il le demande ── */
dit('pas de montant : il demande combien', ['Combien ? Je ne lis pas de montant dans la phrase.'], lu('gaz pour la cuisine').questions);
dit('deux montants nus : il demande lequel', ['Quel est le montant : 2 F ou 500 F ?'], lu("2 sachets d'eau 500").questions);
dit('... le montant qui dit ses francs passe devant', [500, []], (() => { const l = lu("2 sachets d'eau 500 F"); return [l.montantXof, l.questions]; })());
dit('quelqu un qui n achete pas pour la Maison : il demande qui', ['« Kossi » n’est pas parmi ceux qui achètent pour la Maison : qui a payé ?'], lu('courses 5000 payé par Kossi').questions);
dit('un jour a venir : il le dit', ['Le 20 novembre 2026 est à venir : une dépense se saisit le jour où elle est faite.'], lu('taxi 2000 le 20 novembre').questions);
dit('un montant en mots composes : il demande les chiffres', true, lu('loyer vingt-cinq mille').questions.includes('Dites le montant en chiffres, par exemple 25 000 F.'));
dit('plus de deux millions : par « + Dépense »', ['Plus de 2 000 000 F : saisissez-la par « + Dépense ».'], lu('travaux 3 000 000 F').questions);
dit('rien que des petits mots : il demande pour quoi', ['Pour quoi ? Dites ce qui a été payé.'], lu('3000 F espèces').questions);
dit('« especes » sans caisse des especes : il demande la caisse', true, /De quelle caisse|caisse des espèces/.test(lu('taxi 1500 espèces', { ...DIRECTION, caisseDesEspeces: undefined }).questions.join(' ')));

/* ── 3. Le jugement avant de poser ── */
const PRESTATAIRES = [{ name: 'Hermine' }, { name: 'Ziadath' }];
const DEJA = [
  { id: 'd-1', branchId: 'maison', date: AUJ, amountXof: 3000, label: 'Transport produits', porteur: 'Brice Ahouansou' },
  { id: 'd-2', branchId: 'maison', date: AUJ, amountXof: 2000, label: 'Taxi', validation: { etat: 'refusee', soumisPar: 'Gérard' } },
];
const juge = (p: string, ctx = DIRECTION) => jugeLaPhrase(lu(p, ctx), { branchId: 'maison', existantes: DEJA, prestataires: PRESTATAIRES });
dit('le doublon du jour (meme montant, meme jour, meme beneficiaire) : rien ne se pose', ['doublon', 'd-1'],
  (() => { const j = juge('transport des produits 3 000 F espèces'); return j.ok ? ['ok'] : [j.pourquoi, j.deja?.id]; })());
dit('... il dit ce qui est deja la', true, (() => { const j = juge('transport des produits 3 000 F espèces'); return !j.ok && /Déjà saisie : « Transport produits », 3 000 F, le 5 novembre 2026, par Brice Ahouansou/.test(j.dit); })());
dit('une depense refusee ne fait pas doublon', true, juge('taxi 2000').ok);
dit('un autre montant le meme jour passe', true, juge('transport des produits 3 500 F espèces').ok);
dit('un prestataire : refuse, sa mission nait du rituel', 'prestataire', (() => { const j = juge('tresses Hermine 15000'); return j.ok ? 'ok' : j.pourquoi; })());
dit('la famille : refusee, elle reste a Cristal', 'famille', (() => { const j = juge('cantine école 10000'); return j.ok ? 'ok' : j.pourquoi; })());
dit('une question ouverte : rien ne se pose', 'questions', (() => { const j = juge('gaz pour la cuisine'); return j.ok ? 'ok' : j.pourquoi; })());

/* ── 4. Qui ecrit decide de l etat ── */
const pose = (p: string, role: string | undefined, ctx = DIRECTION, nom = 'Yéman') =>
  depenseDeLaPhrase(lu(p, ctx), { id: 'x', branchId: 'maison', role, nom, maintenantISO: '2026-11-05T09:00:00.000Z' });
dit('la direction (souverain) : acquise, sans validation a attendre', [undefined, 'Caisse Principale', 'Brice Ahouansou', 3000, 'phrase'],
  (() => { const e = pose('transport des produits 3 000 F espèces, payé par Brice', 'souverain'); return [e.validation, e.cashbox, e.porteur, e.amountXof, e.preparee.source]; })());
dit('... le gerant aussi', undefined, pose('taxi 2000', 'gerant').validation);
dit('l equipe : a valider, soumise de son nom, signee de son nom, sa caisse', [{ etat: 'attente', soumisLe: '2026-11-05T09:00:00.000Z', soumisPar: 'Gérard' }, 'Gérard', 'Caisse Indépendantes'],
  (() => { const e = pose('eau et savon 2500 hier', 'maitre', EQUIPE, 'Gérard'); return [e.validation, e.porteur, e.cashbox]; })());
dit('... un compte de l equipe signe de son nom, meme s il ecrit « paye par Brice »', ['Gérard', false], (() => { const l = lu('taxi 2000 payé par Brice', EQUIPE); return [l.porteur ?? null, l.laMaisonAPaye]; })());
dit('un role inconnu soumet (jamais acquise par defaut)', [false, 'attente'], [enregistreeAcquise(undefined), pose('taxi 2000', undefined).validation?.etat]);
dit('la Maison a paye s ecrit (la cloture de Grenat ne le redemande pas)', true, pose('eau et savon 2500 hier', 'souverain').laMaisonAPaye ?? false);
dit('l origine se dit dans la liste', ['Message au Trône', 'Engagement', 'Posée par Opale', 'Saisie de l’équipe'], [
  origineDeLaDepense(pose('taxi 2000', 'maitre')), origineDeLaDepense({ preparee: { source: 'engagement' } }),
  origineDeLaDepense({ validation: { soumisPar: 'Opale' } }), origineDeLaDepense({ validation: { soumisPar: 'Gérard' } })]);

/* ── 5. Les engagements de chaque mois ── */
const INTERNET: EngagementDuMois = { id: 'e1', branchId: 'maison', libelle: 'Internet de la Maison', montantXof: 27000, categorie: 'Local', sousCategorie: 'Internet & téléphone', caisse: 'MoMoPay Maison MND', jour: 5, actif: true, depuis: '2026-11' };
const prepare = (engagements: EngagementDuMois[], existantes: { id: string; [k: string]: unknown }[] = [], aujourdhui = AUJ) =>
  depensesAPreparer({ engagements, existantes, aujourdhui, maintenantISO: '2026-11-05T07:00:00.000Z' });
const r1 = prepare([INTERNET]);
dit('le jour venu, Grenat prepare la depense', ['eng-e1-2026-11', '2026-11-05', 'Internet de la Maison, novembre 2026', 27000, 'MoMoPay Maison MND', 'Local', true],
  r1.aPoser.map((d) => [d.id, d.date, d.label, d.amountXof, d.cashbox, d.category, d.laMaisonAPaye ?? false])[0]);
dit('... a valider, soumise par Grenat, avec sa cle stable', [{ etat: 'attente', soumisLe: '2026-11-05T07:00:00.000Z', soumisPar: 'Grenat' }, 'engagement:e1:2026-11'],
  [r1.aPoser[0]?.validation, r1.aPoser[0]?.preparee.cle]);
dit('... le mois s inscrit sur l engagement', ['2026-11'], r1.engagements[0].faits);
dit('une fois par mois : la seconde ouverture ne prepare rien', [0, false], (() => { const r = prepare(r1.engagements, r1.aPoser); return [r.aPoser.length, r.change]; })());
dit('deux postes ecrivent la meme ligne : la cle donne l identifiant', ['eng-e1-2026-11', 'engagement:e1:2026-11'], [idDeLaDepensePreparee('e1', '2026-11'), cleDeLEngagement('e1', '2026-11')]);
dit('la ligne deja la (le mois pas encore note) ne se repose pas', [0, 'meme-ligne'], (() => { const r = prepare([INTERNET], r1.aPoser); return [r.aPoser.length, r.dejaLa[0]?.pourquoi]; })());
dit('une depense preparee puis retiree ne revient pas', 0, prepare(r1.engagements, []).aPoser.length);
dit('la veille de son jour : rien', 0, prepare([INTERNET], [], '2026-11-04').aPoser.length);
dit('en pause : rien', 0, prepare([{ ...INTERNET, actif: false }]).aPoser.length);
dit('deja saisie a la main le meme jour au meme montant : rien, et le mois se ferme', [0, 'saisie-a-la-main', ['2026-11']],
  (() => { const r = prepare([INTERNET], [{ id: 'm', branchId: 'maison', date: '2026-11-05', amountXof: 27000, label: 'Internet' }]); return [r.aPoser.length, r.dejaLa[0]?.pourquoi, r.engagements[0].faits]; })());
dit('... une saisie refusee ne la remplace pas', 1, prepare([INTERNET], [{ id: 'm', branchId: 'maison', date: '2026-11-05', amountXof: 27000, label: 'Internet', validation: { etat: 'refusee' } }]).aPoser.length);
dit('le 31 d un mois de trente jours est le 30 ; fevrier, le 28', ['2026-11-30', '2026-02-28'], [dateDuMois(31, '2026-11'), dateDuMois(31, '2026-02')]);
dit('... et le 30 novembre il se prepare', ['2026-11-30'], prepare([{ ...INTERNET, jour: 31 }], [], '2026-11-30').aPoser.map((d) => d.date));
dit('le rattrapage s arrete a trois mois', ['2026-09', '2026-10', '2026-11'], moisAPreparer({ ...INTERNET, depuis: '2026-01' }, AUJ));
dit('le premier mois : ce mois-ci si son jour vient, sinon le suivant', ['2026-11', '2026-12'], [premierMois(5, AUJ), premierMois(3, AUJ)]);
dit('un engagement mal forme le dit', ['Il manque le montant, en francs entiers.', 'Le jour du mois va de 1 à 31.', null], [
  engagementValide({ ...INTERNET, montantXof: 0 }), engagementValide({ ...INTERNET, jour: 32 }), engagementValide(INTERNET)]);

/* ── 6. L engagement existant en base se reprend ── */
const MENSUELLE = { id: 'sd6', branchId: 'maison', label: 'Courses Maison', amountXof: 27000, date: '2026-09-03', cashbox: 'Real Money', category: 'Équipement', recurring: 'mensuel', porteur: 'Sandrine' };
dit('l ancienne depense mensuelle se propose a la reprise', ['sd6'], mensuellesAReprendre([MENSUELLE, { ...MENSUELLE, id: 'arretee', stopped: true }, { ...MENSUELLE, id: 'ponctuelle', recurring: null }], [], 'maison').map((d) => d.id));
const reprise = repriseDeLaMensuelle(MENSUELLE, { id: 'e9', aujourdhui: AUJ, parQui: 'Yéman', maintenantISO: '2026-11-05T07:00:00.000Z' });
dit('... reprise : son jour, sa caisse, son porteur, des le mois d apres', [3, 'Real Money', 'Sandrine', '2026-10', 'sd6', { recurring: null }],
  [reprise.engagement.jour, reprise.engagement.caisse, reprise.engagement.porteur, reprise.engagement.depuis, reprise.engagement.reprisDe, reprise.devient]);
dit('... elle ne se propose plus', [], mensuellesAReprendre([MENSUELLE], [reprise.engagement], 'maison').map((d) => d.id));
dit('... Grenat prepare octobre et novembre 2026, a valider, payes par Sandrine', [['eng-e9-2026-10', '2026-10-03', 'Sandrine'], ['eng-e9-2026-11', '2026-11-03', 'Sandrine']],
  prepare([reprise.engagement]).aPoser.map((d) => [d.id, d.date, d.porteur ?? null]));

/* ── 7. Grenat la voit a la cloture ── */
const voit = (depenses: DepenseLue[]) => depensesDuJour({ jour: AUJ, maintenantMs: Date.parse('2026-11-05T18:30:00.000Z'), minutesMaintenant: 19 * 60 + 30, branchId: 'maison', ferme: false, depenses, comptages: [], heureDesDepenses: 19, tranche: new Map() });
dit('la depense d un engagement arrive « a valider » chez Grenat', [['a-valider', 'eng-e1-2026-11']],
  voit(r1.aPoser as unknown as DepenseLue[]).constats.filter((c) => c.depenseId).map((c) => [c.genre, c.depenseId]));
dit('... celle de la phrase de l equipe aussi, posee par son nom', true,
  voit([pose('eau et savon 2500 aujourd’hui', 'maitre', EQUIPE, 'Gérard') as unknown as DepenseLue]).constats.some((c) => c.genre === 'a-valider' && /posée par Gérard/i.test(c.dit)));

/* ── 8. Le cablage des ecrans ── */
const dep = lis('src/apps/trone/routes/finances/Depenses.tsx');
const caisse = lis('src/apps/trone/routes/vente/Caisse.tsx');
const phrase = lis('src/apps/trone/routes/finances/DepenseEnUnePhrase.tsx');
const eng = lis('src/apps/trone/routes/finances/EngagementsDuMois.tsx');
const pur = lis('src/shared/engagements-du-mois-pur.ts');
dit('Depenses : la case en tete, la liste preparee, Valider tout, Corriger, les engagements, la preparation', [true, true, true, true, true, true], [
  dep.includes('<DepenseEnUnePhrase />'), dep.includes("{aValiderPourMoi.length} dépense{aValiderPourMoi.length > 1 ? 's préparées' : ' préparée'}, à valider"),
  dep.includes('onClick={() => void validerTout()}>Valider tout</button>'), dep.includes('onClick={() => openEdit(e)}>Corriger</button>'),
  dep.includes('<EngagementsDuMois />'), dep.includes('usePreparationDesEngagements();')]);
dit('... Valider tout passe par la regle de toujours, pour chaque ligne', [true, true], [
  dep.includes('aValiderPourMoi.filter((e) => peutValider(monProfil?.role, monNom, e))'),
  dep.includes('ids.has(x.id) && x.validation && peutValider(monProfil?.role, monNom, x)')]);
dit('Caisse : la case en tete seulement, avant le ticket', [true, true], [
  caisse.includes('<DepenseEnUnePhrase ou="caisse" />'),
  caisse.indexOf('<DepenseEnUnePhrase ou="caisse" />') > caisse.indexOf('className="trv-lien-journee"') && caisse.indexOf('<DepenseEnUnePhrase ou="caisse" />') < caisse.indexOf('className="trv-poshead"')]);
dit('la case : le juge relit au geste, Dicter si la Dictee est ouverte, aucune IA appelee', [true, true, false], [
  /const pose = \(\) => \{[\s\S]{0,400}const j = jugeLaPhrase\(lecture, \{ branchId: branch\.id, existantes: toutes, prestataires \}\);\s*if \(!j\.ok\)/.test(phrase),
  phrase.includes("const peutDicter = fabriqueDOreille() !== null && peutVoir(role, '/dictee', mesDomaines);"),
  /functions\.invoke|metsAuPropre|ia-maison|appelleOuGarde/.test(phrase)]);
const crochetsAvantLeRetour = (src: string, depuis: string) => {
  const corps = src.slice(src.indexOf(depuis));
  const premierRetour = corps.search(/\n {2}if \([^\n]*\) return null;/);
  const crochets = [...corps.slice(0, corps.search(/\n\}\n/)).matchAll(/\buse[A-Z]\w*(?:<[^>\n]*>)?\(/g)].map((m) => m.index ?? 0);
  return premierRetour > 0 && crochets.length >= 5 && Math.max(...crochets) < premierRetour;
};
dit('les crochets React avant tout retour (la case, les engagements)', [true, true], [
  crochetsAvantLeRetour(phrase, 'export function DepenseEnUnePhrase('), crochetsAvantLeRetour(eng, 'export function EngagementsDuMois(')]);
dit('la preparation au Trone : direction, en ligne, apres la descente des depenses et des engagements', [true, true, true, true], [
  eng.includes('if (!direction || !pret || engagements.length === 0) return;'), eng.includes("if (typeof navigator !== 'undefined' && navigator.onLine === false) return;"),
  eng.includes("quandTablePrete('expenses', () => { depenses = true; voir(); });"), eng.includes('void quandDocumentDescendu(CLE_DES_ENGAGEMENTS).then(() => { doc = true; voir(); });')]);
dit('le bloc pur des engagements est sans import (la fonction du serveur le recopiera)', [false, true, true], [
  /^\s*import\s/m.test(pur), pur.includes('/* ⟨engagements-du-mois⟩ */'), pur.includes('/* ⟨/engagements-du-mois⟩ */')]);
dit('pas de tiret « — » dans les textes neufs', [false, false, false], [
  /'[^'\n]*—[^'\n]*'|`[^`\n]*—[^`\n]*`|>[^<\n]*—[^<\n]*</.test(phrase), /'[^'\n]*—[^'\n]*'|`[^`\n]*—[^`\n]*`|>[^<\n]*—[^<\n]*</.test(eng),
  /'[^'\n]*—[^'\n]*'|`[^`\n]*—[^`\n]*`/.test(lis('src/shared/depense-en-une-phrase-pur.ts'))]);

/* ── 9. Les engagements a la direction seule (0160) ──
   « Direction seule » (Yeman, 5 novembre 2026, au selecteur) : la ligne
   `mnd_engagements_du_mois` de `documents` se lit et s ecrit par la direction
   (souverain ET gerant, est_direction, la regle de « + Depense »), et rien ne
   change pour les autres cles. Une regle RESTRICTIVE sur cette seule cle,
   aucune regle d avant retiree ni reecrite. */
const migrations0160 = readdirSync('supabase/migrations').filter((n) => /^0160_/.test(n));
dit('une seule migration 0160, celle des engagements', ['0160_les_engagements_a_la_direction.sql'], migrations0160);
const m0160 = migrations0160.length ? lis(`supabase/migrations/${migrations0160[0]}`) : '';
const entreLesMarques = (src: string): string | null => {
  const i = src.indexOf('-- ⟨0160⟩\n');
  const k = src.indexOf('-- ⟨/0160⟩', i);
  return i < 0 || k < 0 ? null : src.slice(i, k);
};
const bloc0160 = entreLesMarques(m0160) ?? '';
const sansCommentaires = (s: string) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const executable = sansCommentaires(bloc0160);
const listeReservee = /create or replace function public\.cles_de_la_direction\(\) returns text\[\]\s*language sql immutable as \$\$\s*select array\[([^\]]*)\]::text\[\]\s*\$\$;/.exec(executable);
dit('0160 : la liste de la direction = la cle du Trone, et elle seule', [CLE_DES_ENGAGEMENTS],
  listeReservee ? [...listeReservee[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null);
dit('... aucune autre cle nommee dans ce que la migration execute', [CLE_DES_ENGAGEMENTS], [...new Set([...executable.matchAll(/'(mnd_[a-z0-9_]+)'/g)].map((x) => x[1]))]);
const REGLE = 'create policy docs_direction_seule on public.documents\n  as restrictive\n  for all\n  to anon, authenticated\n'
  + '  using (not (key = any(public.cles_de_la_direction())) or public.est_direction())\n'
  + '  with check (not (key = any(public.cles_de_la_direction())) or public.est_direction());';
dit('0160 : une regle RESTRICTIVE, pour tout (lire, creer, modifier, effacer), a la direction (est_direction : souverain ET gerant)', true, executable.includes(REGLE));
dit('... la direction, pas le souverain seul', false, /is_souverain|is_staff/.test(executable));
dit('0160 : aucune autre regle retiree, reecrite ou modifiee (seule docs_direction_seule)', ['docs_direction_seule', 'docs_direction_seule'],
  [...executable.matchAll(/\b(?:create|drop|alter)\s+policy\s+(?:if\s+exists\s+)?(\w+)/gi)].map((x) => x[1]));
dit('0160 : aucune donnee touchee, aucun droit retire, aucune RLS levee', false,
  /\b(insert|update|delete|truncate|grant|revoke|disable|no force)\b|alter\s+table|drop\s+function/i.test(executable));
dit('0160 : hors du bloc, rien que des lectures de controle', false,
  /\b(create|drop|alter|insert|update|delete|truncate|grant|revoke)\b/i.test(sansCommentaires(m0160.replace(bloc0160, ''))));
dit('0160 : aucune table neuve, donc aucune table repli_ sans RLS', [false, false], [/create\s+table/i.test(executable), /repli_/i.test(executable)]);
const essai0160 = (() => { try { return lis('supabase/essai_0160_a_blanc.sql'); } catch { return ''; } })();
dit('l essai a blanc porte la migration a l identique', true, !!bloc0160 && entreLesMarques(essai0160) === bloc0160);
dit('... il se fait passer pour un compte (role authenticated, sub du jeton), puis rend la main', [true, true, true, true], [
  essai0160.includes('set local role authenticated;'), essai0160.includes("perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);"),
  essai0160.includes("execute format('set local role %I', v_role);"), essai0160.includes("set local role anon;")]);
dit('... il mesure avant ET apres la migration, et compare toutes les autres cles', [true, true, true], [
  essai0160.indexOf('do $avant$') >= 0 && essai0160.indexOf('do $avant$') < essai0160.indexOf('-- ⟨0160⟩'),
  essai0160.indexOf('do $essai$') > essai0160.indexOf('-- ⟨/0160⟩'),
  essai0160.includes("if (av -> 'cles' ->> k) is not distinct from (ap -> 'cles' ->> k) then")]);
dit('... et finit par l exception qui annule tout', true, /raise exception 'ESSAI 0160 : % \| %'[^;]*;\s*end \$essai\$;\s*$/.test(essai0160));
const store0160 = lis('src/shared/engagements-du-mois.ts');
const auth0160 = lis('src/shared/auth.ts');
dit('le Trone : le magasin lie a cette cle ; l ecran et la preparation a la direction seule ; la copie du poste purgee a la deconnexion', [true, true, true, true, true], [
  store0160.includes('bindDocument(engagementsDuMoisStore, CLE_DES_ENGAGEMENTS);'),
  eng.includes("export const estDirection = (role: string | undefined): boolean => role === 'souverain' || role === 'gerant';"),
  /export function EngagementsDuMois\(\) \{[\s\S]*?\n {2}if \(!direction\) return null;\n/.test(eng),
  /export function usePreparationDesEngagements\(\): void \{[\s\S]*?if \(!direction\) return;[\s\S]*?if \(!direction \|\| !pret/.test(eng),
  /const SENSITIVE_KEYS = \[[\s\S]*?'mnd_engagements_du_mois',[\s\S]*?\];/.test(auth0160)]);

console.log(ko === 0 ? '\nLes depenses preparees par Grenat tiennent.' : `\n${ko} ECHEC.`);
