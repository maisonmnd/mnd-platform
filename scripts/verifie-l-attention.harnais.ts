/* L'ATTENTION, ÉPROUVÉE · 6 novembre 2026.
   `node scripts/verifie-l-attention.mjs` (et `--prouve`).

   Lots 2 et 3 de l'abonnement refait (maquette
   `public/maquette-l-abonnement-refait.html`, « construis les 2 lots »).
   1. LES RÈGLES (`src/shared/attentions-pur.ts`) : la boutique, le panier que
      Perle propose, « Arrivée », « Remise », la veille, ce que l'abonnée lit.
   2. LE TEXTE : la migration 0170 ne s'ouvre à aucune cliente, les magasins
      sont à la Maison seule, Ma Couronne n'embarque ni les paniers ni la
      liste des présents.
   3. LE VRAI SQL, DANS PGLITE quand il est là (`BANC_PGLITE` = un dossier qui
      porte node_modules/@electric-sql/pglite) : `mes_attentions` contre son
      jumeau `ceQuElleLit`, la surprise gardée, la porte close aux autres.
      Sans PGlite, cette partie se SAUTE et le dit.
   Personnes et dates inventées. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARTICLES_DICTES, PRIX_A_LA_CARTE, PROPOSES_EN_FIN_DE_RDV,
  articlesEnFinDeRdv, carteSuivante, ceQuElleLit, coutDesAttentions, ecartesDe, enRayon, engages, estLeSceauDOr, heureDuFauteuil, histoireDe,
  listeDeLaVeille, marqueLArrivee, messageALArtisane, motPropose, panierDeLaSeance, pourquoiPasCetArticle, pourquoiPasValider, prenomDe,
  programmeDe, proposeLePanier, remetLePanier, reservesCourtes, seancesAPreparer, semaineDe, tempsDuPanier,
  type ArticleDAttention, type PanierDAttention, type ReglageDAttention, type SeanceAPreparer,
} from '../src/shared/attentions-pur';
import { releveDeLAbonnee, type ContratLu, type SeanceLue } from '../src/shared/abonnee-pur';
import type { Plan } from '../src/shared/abonnements';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
let ko = 0; let ok = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) { ok++; console.log(`OK    ${nom}`); } else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/** Les mêmes clés dans le même ordre : la base range les siennes à sa façon. */
const range = (x: unknown): unknown => (Array.isArray(x) ? x.map(range)
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, range((x as Record<string, unknown>)[k])])) : x);
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. LES RÈGLES ──────────────────────────────────────────────────── */
const art = (id: string, x: Partial<ArticleDAttention>): ArticleDAttention => ({ id, nom: id, rayon: 'present', niveau: 'offert', reserve: 5, ...x });
const B1 = art('b1', { nom: 'La Citronnelle du jardin', rayon: 'boire', reserve: 'jardin', ordre: 1 });
const B2 = art('b2', { nom: 'L’Orange en fleur', rayon: 'boire', reserve: 'frais', ordre: 2 });
const G1 = art('g1', { nom: 'Le petit pâté', rayon: 'gout', reserve: 'frais', ordre: 1 });
const G2 = art('g2', { nom: 'Les Dorées', rayon: 'gout', reserve: 1, ordre: 2 });
const P1 = art('p1', { nom: 'Le foulard', indice: 'elle se noue', reserve: 2, ordre: 1 });
const P2 = art('p2', { nom: 'Le stylo', reserve: 3, ordre: 2 });
const P3 = art('p3', { nom: 'La trousse MND', reserve: 0, ordre: 3 });
const OR = art('or', { nom: 'Le T-shirt « Le sceau au cœur »', niveau: 'or', reserve: 1, ordre: 9 });
const C1 = art('c1', { nom: 'Le chouchou de satin', niveau: 'carte', prixXof: 1500, reserve: 4, enFinDeRdv: true, ordre: 4 });
const BOUTIQUE = [B1, B2, G1, G2, P1, P2, P3, OR, C1];

dit('à la carte : entre 800 et 1 500 F, jamais plus, jamais sans prix', [true, true, true, false, false],
  [799, 1501, undefined, 800, 1500].map((p) => !!pourquoiPasCetArticle({ nom: 'x', rayon: 'gout', niveau: 'carte', prixXof: p, reserve: 1 })));
dit('les bornes de la carte et le nombre proposé en fin de rendez-vous sont ceux de Yéman', [800, 1500, 3], [PRIX_A_LA_CARTE.min, PRIX_A_LA_CARTE.max, PROPOSES_EN_FIN_DE_RDV]);
dit('un article sans nom, un sceau d or hors du rayon des présents, une réserve négative : refusés', [true, true, true, false],
  [pourquoiPasCetArticle({ nom: ' ', rayon: 'gout', niveau: 'offert', reserve: 1 }), pourquoiPasCetArticle({ nom: 'x', rayon: 'boire', niveau: 'or', reserve: 1 }),
    pourquoiPasCetArticle({ nom: 'x', rayon: 'gout', niveau: 'offert', reserve: -1 }), pourquoiPasCetArticle({ nom: 'x', rayon: 'gout', niveau: 'offert', reserve: 'frais' })].map((x) => !!x));
dit('en rayon : par ordre, sans les retirés', ['p1', 'p2', 'c1'], enRayon([...BOUTIQUE, art('px', { retire: true, ordre: 0 })], 'present').filter((a) => a.reserve !== 0 && a.niveau !== 'or').map((a) => a.id));

const seance = (x: Partial<SeanceAPreparer>): SeanceAPreparer =>
  ({ apptId: 'r4', clientId: 'cA', subId: 's1', planId: 'pl6', formule: 'GBÈJÍ™ · Carnet de Six', mode: 'pack', date: '2026-12-12', time: '09:00', rang: 4, total: 6, ...x });
const panier = (x: Partial<PanierDAttention>): PanierDAttention =>
  ({ id: 'r4', apptId: 'r4', clientId: 'cA', subId: 's1', date: '2026-12-12', time: '09:00', rang: 4, total: 6, mot: 'Merci.', etat: 'valide', ...x });
const AUCUN: ReglageDAttention[] = [];
const propose = (o: { s?: Partial<SeanceAPreparer>; paniers?: PanierDAttention[]; reglages?: ReglageDAttention[]; articles?: ArticleDAttention[]; ecartes?: string[] }) => {
  const s = seance(o.s ?? {});
  const paniers = o.paniers ?? [];
  return proposeLePanier({ seance: s, prenom: 'Awa', articles: o.articles ?? BOUTIQUE, reglages: o.reglages ?? AUCUN, histoire: histoireDe(s.clientId, paniers, o.ecartes ?? [], s.apptId), paniers });
};

const p0 = propose({});
dit('Perle propose : la première boisson, la première bouchée, le premier présent jamais reçu', { boire: 'b1', gout: 'g1', present: 'p1' }, { boire: p0.boire, gout: p0.gout, present: p0.present });
dit('... et dit pourquoi', 'Séance 4 sur 6 ; un présent qu’elle n’a jamais reçu.', p0.pourquoi);
const dejaP1 = [panier({ id: 'r1', apptId: 'r1', date: '2026-08-08', present: 'p1', boire: 'b1', gout: 'g1', remiseLe: '2026-08-08T09:10:00Z' })];
dit('jamais deux fois le même présent : le suivant', 'p2', propose({ paniers: dejaP1 }).present);
dit('les boissons et les bouchées tournent : ce qu elle n a jamais reçu d abord', { boire: 'b2', gout: 'g2' },
  (({ boire, gout }) => ({ boire, gout }))(propose({ paniers: dejaP1 })));
const toutBu = [...dejaP1, panier({ id: 'r2', apptId: 'r2', date: '2026-09-19', present: 'p2', boire: 'b2', gout: 'g2', remiseLe: '2026-09-19T09:10:00Z' })];
dit('quand elle a tout goûté, ce qu elle a reçu il y a le plus longtemps', { boire: 'b1', gout: 'g1' }, (({ boire, gout }) => ({ boire, gout }))(propose({ paniers: toutBu })));
dit('plus aucun présent neuf en réserve : la ligne reste à choisir, et Perle le dit', [undefined, true],
  [propose({ paniers: toutBu }).present, /à choisir/.test(propose({ paniers: toutBu }).pourquoi ?? '')]);
dit('un article écarté pour elle n est jamais proposé', ['p2', 'b2'], [propose({ ecartes: ['p1'] }).present, propose({ ecartes: ['b1'] }).boire]);
dit('une réserve comptée toute promise à d autres ne se propose pas', 'p2',
  propose({ paniers: [panier({ id: 'x1', apptId: 'x1', clientId: 'cB', present: 'p1' }), panier({ id: 'x2', apptId: 'x2', clientId: 'cC', present: 'p1' })] }).present);
dit('... le frais et le jardin ne s épuisent pas', 'b1', propose({ paniers: Array.from({ length: 9 }, (_, i) => panier({ id: `y${i}`, apptId: `y${i}`, clientId: `c${i}`, boire: 'b1' })) }).boire);
dit('deux séances de la même tête dans la semaine ne reçoivent pas le même présent', 'p2',
  propose({ paniers: [panier({ id: 'r5', apptId: 'r5', date: '2026-12-15', present: 'p1', etat: 'propose' })] }).present);
const PROG: ReglageDAttention[] = [
  { id: 'programme:defaut', type: 'programme', planId: null, rangs: [{ rang: 4, present: 'p2', mot: 'Quatre séances, {prenom}. Merci.' }] },
  { id: 'programme:plX', type: 'programme', planId: 'plX', rangs: [{ rang: 4, present: 'p1' }] },
];
dit('le programme : le présent voulu à ce rang, s il est possible', ['p2', true], [propose({ reglages: PROG }).present, /de son programme/.test(propose({ reglages: PROG }).pourquoi ?? '')]);
dit('... le programme de SA formule passe avant celui de toutes', ['programme:plX', 'programme:defaut'], [programmeDe(PROG, 'plX')?.id, programmeDe(PROG, 'pl6')?.id]);
dit('... et son mot, avec le prénom', 'Quatre séances, Awa. Merci.', propose({ reglages: PROG }).mot);
dit('la dernière séance d un carnet : le sceau d or, un présent de ce niveau', { or: true, present: 'or' }, (({ or, present }) => ({ or, present }))(propose({ s: { rang: 6 } })));
dit('une formule à la lune n a pas de dernière séance, même à deux séances par lune ; un carnet d une séance non plus', [false, false, false, true],
  [estLeSceauDOr({ mode: 'cycle', rang: 1, total: 1 }), estLeSceauDOr({ mode: 'cycle', rang: 2, total: 2 }), estLeSceauDOr({ mode: 'pack', rang: 1, total: 1 }), estLeSceauDOr({ mode: 'pack', rang: 6, total: 6 })]);
dit('les trois mots de la Maison : bienvenue, merci, carnet tenu ; le prénom, jamais d accord de genre', [true, true, true, []],
  [/^Bienvenue, Awa\./.test(motPropose({ mode: 'pack', rang: 1, total: 6 }, 'Awa')), /^Merci de nous confier votre couronne, Awa\./.test(motPropose({ mode: 'pack', rang: 3, total: 6 }, 'Awa')),
    /^6 séances, un carnet tenu jusqu’au bout\./.test(motPropose({ mode: 'pack', rang: 6, total: 6 }, 'Awa')),
    [1, 3, 6].map((r) => motPropose({ mode: 'pack', rang: r, total: 6 }, 'Awa')).filter((m) => /\b(revenue|venue|chère|cher|fidèle amie|Madame|Monsieur)\b/i.test(m))]);
dit('sans prénom lisible, le mot tient debout', ['Bienvenue. Votre couronne a maintenant son rythme, et nous veillons dessus avec vous.', ''],
  [motPropose({ mode: 'pack', rang: 1, total: 6 }, ''), prenomDe('0700112233')]);
const COLL: ReglageDAttention[] = [{ id: 'collection', type: 'collection', series: [{ nom: 'Les secrets', nombre: 2 }, { nom: 'Les rituels', nombre: 1 }] }];
dit('la carte de collection : la suivante, jamais deux fois la même, série après série', [{ serie: 'Les secrets', numero: 1 }, { serie: 'Les secrets', numero: 2 }, { serie: 'Les rituels', numero: 1 }, null, null],
  [carteSuivante(COLL[0] as Any, []), carteSuivante(COLL[0] as Any, [{ serie: 'Les secrets', numero: 1 }]),
    carteSuivante(COLL[0] as Any, [{ serie: 'Les secrets', numero: 1 }, { serie: 'Les secrets', numero: 2 }]),
    carteSuivante(COLL[0] as Any, [{ serie: 'Les secrets', numero: 1 }, { serie: 'Les secrets', numero: 2 }, { serie: 'Les rituels', numero: 1 }]), carteSuivante(undefined, [])]);
dit('« Ne plus lui proposer » se lit dans les réglages de la Maison, jamais sur sa fiche', ['p1'],
  ecartesDe([{ id: 'ecarts:cA', type: 'ecarts', clientId: 'cA', articles: ['p1'] }], 'cA'));

/* Valider, « Arrivée », « Remise ». */
const pp = panierDeLaSeance(seance({}), p0, 'm');
dit('un panier porte l identifiant de son rendez-vous, et naît « proposé »', { id: 'r4', etat: 'propose', branchId: 'm' }, { id: pp.id, etat: pp.etat, branchId: pp.branchId });
dit('sans présent ou sans mot, il ne se valide pas', [true, true, false], [!!pourquoiPasValider({ mot: 'x' }), !!pourquoiPasValider({ present: 'p1', mot: ' ' }), !!pourquoiPasValider({ present: 'p1', mot: 'x' })]);
dit('les temps du panier', ['a-valider', 'a-valider', 'pret', 'arrivee', 'remis'],
  [tempsDuPanier(undefined), tempsDuPanier(pp), tempsDuPanier(panier({})), tempsDuPanier(panier({ arriveeLe: 'x' })), tempsDuPanier(panier({ arriveeLe: 'x', remiseLe: 'y' }))]);
dit('« Arrivée » ne se pose que sur un panier validé, une seule fois', [undefined, '2026-12-12T08:04:00Z', '2026-12-12T08:04:00Z'],
  [marqueLArrivee(pp, '2026-12-12T08:04:00Z', 'R. G.').arriveeLe, marqueLArrivee(panier({}), '2026-12-12T08:04:00Z', 'R. G.').arriveeLe,
    marqueLArrivee(panier({ arriveeLe: '2026-12-12T08:04:00Z' }), '2026-12-12T09:00:00Z').arriveeLe]);
const aRemettre = panier({ boire: 'b1', gout: 'g2', present: 'p1' });
const rem = remetLePanier(aRemettre, BOUTIQUE, '2026-12-12T08:10:00Z', 'R. G.');
dit('« Remise » fige les noms sur le panier', { boire: 'La Citronnelle du jardin', gout: 'Les Dorées', present: 'Le foulard' }, rem.panier.recu);
dit('... note l instant, qui, et l arrivée si elle n était pas notée', ['2026-12-12T08:10:00Z', 'R. G.', '2026-12-12T08:10:00Z'], [rem.panier.remiseLe, rem.panier.remisePar, rem.panier.arriveeLe]);
dit('... la réserve comptée baisse d une pièce ; le jardin et le frais ne se comptent pas', { g2: 0, p1: 1, b1: 'jardin', p2: 3 },
  Object.fromEntries(['g2', 'p1', 'b1', 'p2'].map((id) => [id, rem.articles.find((a) => a.id === id)?.reserve])));
dit('... une seconde « Remise » ne retire rien', [1, true], [remetLePanier(rem.panier, rem.articles, '2026-12-12T09:00:00Z').articles.find((a) => a.id === 'p1')?.reserve, remetLePanier(rem.panier, rem.articles, 'z').panier === rem.panier]);
dit('... un panier non validé ne se remet pas', undefined, remetLePanier(pp, BOUTIQUE, 'z').panier.remiseLe);
dit('ce qui est promis ne compte pas ce qui est déjà remis', [1, undefined], [engages([aRemettre, rem.panier]).get('p1'), engages([rem.panier]).get('p1')]);
dit('la réserve qui ne couvre plus : « 1 en réserve pour 2 séances à venir »', [{ id: 'g2', reserve: 1, promis: 2 }],
  reservesCourtes(BOUTIQUE, [panier({ id: 'a', gout: 'g2' }), panier({ id: 'b', gout: 'g2' })]).map((x) => ({ id: x.article.id, reserve: x.reserve, promis: x.promis })));

/* En fin de rendez-vous. */
const cartes = [1, 2, 3, 4].map((i) => art(`k${i}`, { niveau: 'carte', prixXof: 1000, enFinDeRdv: true, ordre: i, reserve: i === 2 ? 0 : 3 }));
dit('en fin de rendez-vous : à la carte, choisis par la Maison, en réserve, trois au plus', ['k1', 'k3', 'k4'], articlesEnFinDeRdv([...cartes, art('k9', { niveau: 'carte', prixXof: 900, ordre: 0 })]).map((a) => a.id));
dit('... jamais un article offert, sans prix, hors bornes, ou retiré', [],
  articlesEnFinDeRdv([art('o', { enFinDeRdv: true }), art('s', { niveau: 'carte', enFinDeRdv: true }), art('h', { niveau: 'carte', prixXof: 2000, enFinDeRdv: true }), art('r', { niveau: 'carte', prixXof: 900, enFinDeRdv: true, retire: true })]).map((a) => a.id));

/* La veille. */
const sV = [seance({}), seance({ apptId: 'r7', clientId: 'cB', time: '11:30' }), seance({ apptId: 'r8', clientId: 'cC', time: '14:00' }), seance({ apptId: 'r9', date: '2026-12-13' })];
const pV = [panier({ boire: 'b2', gout: 'g1', present: 'p1', carte: { serie: 'Les secrets', numero: 1 }, mot: 'Merci, Awa.' }),
  panier({ id: 'r7', apptId: 'r7', clientId: 'cB', time: '11:30', boire: 'b1', gout: 'g1', present: 'p2', mot: 'Bienvenue.' }),
  panier({ id: 'r8', apptId: 'r8', clientId: 'cC', time: '14:00', boire: 'b2', etat: 'propose' })];
const veille = listeDeLaVeille('2026-12-12', sV, pV, BOUTIQUE);
dit('la veille : le frais à commander, le jardin à cueillir, la réserve à sortir, d après les paniers VALIDÉS', { c: [['b2', 1], ['g1', 2]], j: [['b1', 1]], s: [['p1', 1], ['p2', 1]] },
  { c: veille.aCommander.map((l) => [l.article.id, l.nombre]), j: veille.aCueillir.map((l) => [l.article.id, l.nombre]), s: veille.aSortir.map((l) => [l.article.id, l.nombre]) });
dit('... les cartes à écrire, dans l ordre des heures ; un panier à valider se compte', { cartes: ['09:00', '11:30'], seances: 3, aValider: 1 },
  { cartes: veille.cartes.map((k) => k.time), seances: veille.seances, aValider: veille.aValider });
dit('le message à l artisane se prépare, avec la date entière ; rien à commander : pas de message',
  ['Bonjour, la Maison MND vous commande pour samedi 12 décembre 2026 : 1 × l’Orange en fleur, 2 × le petit pâté. Merci de nous confirmer l’heure de livraison.', null],
  [messageALArtisane(veille, 'samedi 12 décembre 2026'), messageALArtisane({ aCommander: [] }, 'x')]);
dit('la semaine va du lundi au dimanche ; l heure se dit « 9 h 00 »', [{ du: '2026-12-07', au: '2026-12-13' }, { du: '2026-12-07', au: '2026-12-13' }, '9 h 00'],
  [semaineDe('2026-12-12'), semaineDe('2026-12-07'), heureDuFauteuil('09:00')]);
dit('ce que les attentions ont coûté : les paniers remis, au coût saisi ; le reste se dit « sans coût »', { paniers: 1, coutXof: 700, sansCout: 1 },
  coutDesAttentions([panier({ boire: 'b1', gout: 'g1', present: 'p1', remiseLe: 'x' }), panier({ id: 'n', present: 'p2' })],
    [{ ...B1, coutXof: 200 }, { ...G1, coutXof: 500 }, P1, P2], '2026-12-01', '2026-12-31'));

/* Les séances, lues dans le relevé du juge. */
const plan = { id: 'pl6', name: 'GBÈJÍ™ · Carnet de Six', tag: '', priceXof: 140000, line: '', perks: [], popular: false, included: [{ serviceId: 'svc-g', qty: 6 }], mode: 'pack', validityDays: 270 } as Plan;
const sub = { id: 's1', branchId: 'm', clientId: 'cA', name: 'A. D.', planId: 'pl6', slot: '', nextIso: '2026-11-01', since: '', sinceIso: '2026-10-02', startIso: '2026-10-02', expiresIso: '2027-06-29',
  status: 'active', reference: 'ABO-2026-014', mrrXof: 0, priceXof: 140000, prixConvenuXof: 140000, payments: [{ id: 'p', date: '2026-10-02', amountXof: 140000 }] } as ContratLu;
const rdv = (id: string, date: string, status: SeanceLue['status'], x: Partial<SeanceLue> = {}): SeanceLue =>
  ({ id, branchId: 'm', clientId: 'cA', serviceIds: ['svc-g'], date, time: '09:00', master: '', status, coveredBySub: true, subId: 's1', coverKind: 'abonnement', ...x }) as SeanceLue;
const releve = releveDeLAbonnee({ jour: '2026-12-01', clientId: 'cA', subs: [sub], plans: [plan],
  appts: [rdv('f1', '2026-10-06', 'honoré'), rdv('x', '2026-12-08', 'annulé', { annuleeLe: '2026-12-07T20:00:00+01:00', annuleePar: 'cliente' }), rdv('r2', '2026-12-12', 'confirmé'), rdv('r3', '2026-12-20', 'confirmé')], invoices: [], restesHorsFormule: [] });
dit('les séances de la semaine, lues dans le relevé : celle qui compte, avec son rang ; l annulée n a pas de panier',
  [{ apptId: 'r2', clientId: 'cA', rang: 2, total: 6, mode: 'pack', planId: 'pl6' }],
  seancesAPreparer(releve.contrats, '2026-12-07', '2026-12-13').map((s) => ({ apptId: s.apptId, clientId: s.clientId, rang: s.rang, total: s.total, mode: s.mode, planId: s.planId })));

/* Ce que l'abonnée lit. */
const lus: PanierDAttention[] = [
  panier({ id: 'l1', apptId: 'l1', date: '2026-10-31', rang: 3, boire: 'b1', gout: 'g1', present: 'p2', mot: 'Merci, Awa.', remiseLe: '2026-10-31T09:10:00Z', recu: { boire: 'La Citronnelle du jardin', gout: 'Le petit pâté', present: 'Le stylo' } }),
  panier({ id: 'l2', apptId: 'l2', date: '2026-12-12', rang: 4, present: 'p1', boire: 'b2', mot: 'Secret.' }),
  panier({ id: 'l3', apptId: 'l3', date: '2027-01-23', rang: 5, present: 'p2', mot: 'Secret aussi.' }),
  panier({ id: 'l4', apptId: 'l4', date: '2027-03-06', rang: 6, present: 'or', or: true, etat: 'propose' }),
  panier({ id: 'l5', apptId: 'l5', date: '2026-11-20', rang: 4, present: 'p1' }),
  panier({ id: 'l6', apptId: 'l6', date: '2026-12-20', rang: 5, present: 'p1' }),
  panier({ id: 'l7', apptId: 'l7', clientId: 'cE', date: '2026-12-15', rang: 1, total: 4, present: 'p2', arriveeLe: '2026-12-15T08:00:00Z' }),
  panier({ id: 'l8', apptId: 'l8', clientId: 'cB', date: '2026-12-12', rang: 2, present: 'p1' }),
];
const vue = (clientId: string) => ceQuElleLit({ clientId, jour: '2026-12-01', paniers: lus, articles: BOUTIQUE, annules: ['l6'] });
const vueA = vue('cA');
dit('elle lit : ce qu elle a reçu, le prochain scellé, puis « à venir » ; jamais le proposé, l annulé, le passé sans remise', [['l1', 'recue'], ['l2', 'scellee'], ['l3', 'a-venir']], vueA.map((x) => [x.apptId, x.etat]));
dit('... reçue : le présent, ce qui a été servi, le mot de la carte', { mot: 'Merci, Awa.', recu: { boire: 'La Citronnelle du jardin', gout: 'Le petit pâté', present: 'Le stylo' } },
  vueA[0].etat === 'recue' ? { mot: vueA[0].mot, recu: vueA[0].recu } : null);
dit('... scellée : sa date et son indice, rien d autre', ['apptId', 'arrivee', 'clientId', 'date', 'etat', 'indice', 'or', 'rang', 'total'], Object.keys(vueA[1]).sort());
dit('... l indice est celui du présent, jamais son nom', 'elle se noue', vueA[1].etat === 'scellee' ? vueA[1].indice : null);
dit('LA SURPRISE EST GARDÉE : rien de scellé ou d à venir ne dit le présent, la boisson, la bouchée ni le mot', [],
  vueA.filter((x) => x.etat !== 'recue').flatMap((x) => Object.keys(x)).filter((k) => ['present', 'boire', 'gout', 'mot', 'recu', 'pourquoi', 'carte'].includes(k)));
dit('la tête qu elle porte a ses propres attentions ; « Arrivée » se lit', [['l7', 'scellee', true]], vue('cE').map((x) => [x.apptId, x.etat, x.etat === 'scellee' && x.arrivee]));

/* ── 2. LE TEXTE ────────────────────────────────────────────────────── */
const sql = lis('supabase/migrations/0170_l_attention.sql');
const sqlNu = sql.replace(/--[^\n]*/g, '');
dit('0170 : trois tables sous RLS, lues et écrites par la Maison seule, rien ne s efface', [true, true, 3, false, true],
  [sqlNu.includes("array['attention_articles', 'attention_paniers', 'attention_reglages']"), sqlNu.includes('enable row level security'),
    (sqlNu.match(/public\.is_staff\(\)/g) ?? []).length - 1, /create policy[^;]*est_ma_tete/.test(sqlNu), sqlNu.includes("revoke all on public.%1$I from anon, authenticated") && sqlNu.includes("grant select, insert, update on public.%1$I to authenticated") && !/grant[^;]*\bdelete\b/i.test(sqlNu)]);
dit('0170 : `mes_attentions` exige une session, ne rend que SES têtes, fermée à `anon`', [true, true, true, true],
  [sqlNu.includes("if v_uid is null then raise exception 'Connexion requise.'; end if;"), sqlNu.includes("and public.est_ma_tete(coalesce(p.data->>'clientId', ''))"),
    sqlNu.includes('revoke all on function public.mes_attentions(text) from public, anon;'), sqlNu.includes('grant execute on function public.mes_attentions(text) to authenticated;')]);
dit('0170 : seuls les paniers validés, jamais ceux d une séance annulée', [true, true], [sqlNu.includes("where p.data->>'etat' = 'valide'"), sqlNu.includes("a.data->>'status' = 'annulé'")]);
const scelle = sqlNu.slice(sqlNu.indexOf('when n = 1 then'), sqlNu.indexOf('as lu'));
dit('0170 : la branche scellée ne lit du panier que l arrivée, et de l article que l indice', [[], true],
  [(scelle.match(/d->>?'(\w+)'/g) ?? []).filter((x) => !/'present'/.test(x)), /a\.data->>'indice'/.test(scelle) && !/a\.data->>'nom'/.test(sqlNu)]);
const magasin = lis('src/shared/attentions.ts');
dit('les trois magasins sont liés à leurs tables, et purgés à la déconnexion', [true, true, true, true],
  [magasin.includes("bindCollection(articlesDAttentionStore, 'attention_articles');"), magasin.includes("bindCollection(paniersDAttentionStore, 'attention_paniers');"),
    magasin.includes("bindCollection(reglagesDAttentionStore, 'attention_reglages');"),
    lis('src/shared/auth.ts').includes("'mnd_attention_articles', 'mnd_attention_paniers', 'mnd_attention_reglages',")]);
const dansLaCouronne = (dossier: string): string[] => readdirSync(dossier, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? dansLaCouronne(path.join(dossier, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dossier, e.name)] : []));
const clientes = [...dansLaCouronne('src/apps/couronne'), ...dansLaCouronne('src/apps/revelateur')];
dit('ni Ma Couronne ni le site n embarquent les magasins de la Maison', [], clientes.filter((f) => /from '[^']*shared\/attentions'/.test(lis(f))).map((f) => f.replace(/\\/g, '/')));
dit('... ni la liste des présents : des règles, ils ne prennent que des types', [],
  clientes.filter((f) => /import (?!type )[^;]*from '[^']*shared\/attentions-pur'/.test(lis(f))).map((f) => f.replace(/\\/g, '/')));
dit('les articles dictés : aucun prix, aucun coût, aucune réserve supposés', [[], [], true],
  [ARTICLES_DICTES.filter((a) => a.prixXof !== undefined || a.coutXof !== undefined).map((a) => a.nom), ARTICLES_DICTES.filter((a) => typeof a.reserve === 'number' && a.reserve !== 0).map((a) => a.nom),
    ARTICLES_DICTES.some((a) => a.niveau === 'or' && a.rayon === 'present')]);
dit('... ce qu elle a retiré de sa liste n y est pas', [], ARTICLES_DICTES.filter((a) => /chewing|adoyo|avocat-moyo|taie|kom\b/i.test(a.nom)).map((a) => a.nom));
dit('... une bière dictée sans prix n est jamais proposée avant qu elle le fixe', [],
  articlesEnFinDeRdv(ARTICLES_DICTES.map((a, i) => ({ ...a, id: `d${i}`, enFinDeRdv: true }))).map((a) => a.nom));
const abo = lis('src/apps/trone/routes/equipe/Abonnements.tsx');
dit('le Trône : l onglet « Les attentions » dans Abonnements, qui lit le juge', [true, true],
  [abo.includes("{ k: 'attentions', l: 'Les attentions' }"), abo.includes('<LesAttentions releves={relevesDesContrats} plans={plans} nomDe={nomDeLaTete} branchId={branch.id} aujourdhui={jourDeCotonou()} currency={currency}')]);
const mes = lis('src/apps/couronne/MesAttentions.tsx');
dit('Ma Couronne demande `mes_attentions`, et rien d autre : aucune table, aucun magasin', [true, false],
  [mes.includes("appelleLaMaison<Reponse>('mes_attentions', { p_client_id: teteId })"), /supabase\.from\(|attention_paniers|attention_articles|attention_reglages/.test(sansCommentaires(mes))]);
dit('le pli se pose à l accueil, sous les formules ; la page s ouvre par #/attentions', [true, true, true],
  [lis('src/apps/couronne/Abonnee.tsx').includes('<PliDeLAttention teteId={releve.clientId} prenom={prenom} />'),
    lis('src/apps/couronne/App.tsx').includes("else if (h === '#/attentions') setEcran('attentions');"),
    lis('src/apps/couronne/App.tsx').includes("{ecran === 'attentions' && teteId && (")]);
dit('le pli ne suppose aucun genre : « Bienvenue à la Maison MND », jamais « Vous êtes arrivée »', [true, false],
  [mes.includes("t('Bienvenue à la Maison MND. Votre attention vous est remise au fauteuil, avec sa carte.')"), /Vous êtes (arrivée|revenue|venue)/.test(mes)]);
dit('les attentions d une autre tête, restées de l écran d avant, ne se montrent pas', true, mes.includes('return teteId ? lues.filter((x) => x.clientId === teteId) : [];'));
const NEUFS = ['src/shared/attentions-pur.ts', 'src/shared/attentions.ts', 'src/apps/trone/routes/equipe/LesAttentions.tsx', 'src/apps/trone/routes/equipe/attentions.css', 'supabase/migrations/0170_l_attention.sql',
  'src/apps/couronne/MesAttentions.tsx', 'src/apps/couronne/sceau.ts', 'src/apps/couronne/i18n/en-attention.ts'];
dit('les fichiers neufs : pas de tiret long, jamais « salon », aucune civilité supposée', [],
  NEUFS.filter((f) => /—|\bsalons?\b|\b(Madame|Monsieur|Mme|Mlle)\b/i.test(lis(f))));
dit('l écran ne décide de rien : il ne recompte ni réserve ni rang', [], ['reserve - 1', 'reserve -= ', '.rang + 1'].filter((x) => sansCommentaires(lis('src/apps/trone/routes/equipe/LesAttentions.tsx')).includes(x)));

/* ── 3. LE VRAI SQL, DANS PGLITE ────────────────────────────────────── */
async function chargePGlite(): Promise<Any | null> {
  const dossier = process.env.BANC_PGLITE ?? '';
  for (const cible of [...(dossier ? [pathToFileURL(path.join(dossier, 'node_modules/@electric-sql/pglite/dist/index.js')).href] : []), '@electric-sql/pglite']) {
    try { const m = await import(cible); if (m?.PGlite) return m.PGlite; } catch { /* suivant */ }
  }
  return null;
}
const PGlite = await chargePGlite();
if (!PGlite) {
  console.log('SAUTE 3 : le vrai SQL ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
} else {
  delete (globalThis as Any).window;
  const db = new PGlite();
  const q = async (texte: string, params: unknown[] = []) => (await db.query(texte, params)).rows as Any[];
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('banc.uid', true), '')::uuid $f$;
    do $r$ begin create role anon; exception when duplicate_object then null; end $r$;
    do $r$ begin create role authenticated; exception when duplicate_object then null; end $r$;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create or replace function public.touch_updated_at() returns trigger language plpgsql as $f$ begin new.updated_at = now(); return new; end $f$;
    create or replace function public.is_staff() returns boolean language sql stable as $f$ select coalesce(current_setting('banc.maison', true), '') = '1' $f$;
    create or replace function public.est_ma_tete(cible text) returns boolean language sql stable as $f$
      select cible <> '' and cible = any(string_to_array(coalesce(current_setting('banc.tetes', true), ''), ',')) $f$;
    create or replace function public.abo_aujourdhui() returns date language sql stable as $f$ select current_setting('banc.jour', true)::date $f$;
    create table public.appointments (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
  `);
  let posee = true;
  try { await db.exec(sql); } catch (e) { posee = false; console.log(`       ${String((e as Error).message)}`); }
  dit('3 · la migration 0170 se pose d un seul tenant', true, posee);
  const controle = posee ? (await q(sql.slice(sql.lastIndexOf('select\n'), sql.indexOf('-- RETOUR EN ARRIÈRE'))))[0] : null;
  dit('3 · son contrôle : trois tables sous RLS, neuf politiques, aucune hors de la Maison, la fonction fermée à anon',
    { tables_sous_rls: 3, politiques: 9, politiques_hors_maison: 0, fonction: 1, ouverte_a_anon: false },
    controle && { tables_sous_rls: Number(controle.tables_sous_rls), politiques: Number(controle.politiques), politiques_hors_maison: Number(controle.politiques_hors_maison), fonction: Number(controle.fonction), ouverte_a_anon: controle.ouverte_a_anon });
  dit('3 · la 0170 se rejoue sans danger', true, await (async () => { try { await db.exec(sql); return true; } catch { return false; } })());

  for (const a of BOUTIQUE) await q(`insert into public.attention_articles (id, branch_id, data) values ($1, 'm', $2::jsonb)`, [a.id, JSON.stringify(a)]);
  for (const p of lus) await q(`insert into public.attention_paniers (id, branch_id, data) values ($1, 'm', $2::jsonb)`, [p.id, JSON.stringify(p)]);
  await q(`insert into public.appointments (id, data) values ('l6', '{"status":"annulé"}'::jsonb), ('l2', '{"status":"confirmé"}'::jsonb)`);

  const UID = '11111111-1111-1111-1111-111111111111';
  const comme = async (o: { tetes?: string; maison?: boolean; uid?: string | null }, texte: string, params: unknown[] = []) => {
    await db.exec(`reset role; select set_config('banc.uid', '${o.uid === null ? '' : o.uid ?? UID}', false), set_config('banc.tetes', '${o.tetes ?? ''}', false), set_config('banc.maison', '${o.maison ? '1' : ''}', false), set_config('banc.jour', '2026-12-01', false); set role authenticated;`);
    try { return await q(texte, params); } finally { await db.exec('reset role;'); }
  };
  const appelle = async (o: Parameters<typeof comme>[0], clientId: string | null) => (await comme(o, 'select public.mes_attentions($1) as r', [clientId]))[0].r;

  const sienne = await appelle({ tetes: 'cA,cE' }, 'cA');
  dit('3 · `mes_attentions` rend, pour elle, exactement ce que dit son jumeau', range(vueA), range(sienne.attentions));
  dit('3 · ... et pour la tête qu elle porte', range(vue('cE')), range((await appelle({ tetes: 'cA,cE' }, 'cE')).attentions));
  dit('3 · LA SURPRISE EST GARDÉE AU SERVEUR : ni présent, ni boisson, ni bouchée, ni mot dans ce qui est scellé ou à venir', [],
    (sienne.attentions as Any[]).filter((x) => x.etat !== 'recue').flatMap((x) => Object.keys(x)).filter((k) => ['present', 'boire', 'gout', 'mot', 'recu', 'pourquoi', 'carte'].includes(k)));
  dit('3 · ... et la réponse entière ne contient le nom d aucun présent à venir', false, /foulard|stylo/i.test(JSON.stringify((sienne.attentions as Any[]).filter((x) => x.etat !== 'recue'))));
  dit('3 · sans tête demandée : toutes ses têtes, chacune avec son prochain scellé', [['l1', 'recue'], ['l2', 'scellee'], ['l7', 'scellee'], ['l3', 'a-venir']],
    ((await appelle({ tetes: 'cA,cE' }, null)).attentions as Any[]).map((x) => [x.apptId, x.etat]));
  dit('3 · une autre cliente ne lit rien d elle, même en la nommant', [[], [['l8', 'scellee']]],
    [(await appelle({ tetes: 'cB' }, 'cA')).attentions, ((await appelle({ tetes: 'cB' }, 'cB')).attentions as Any[]).map((x) => [x.apptId, x.etat])]);
  dit('3 · sans session : refusée', true, await appelle({ uid: null, tetes: 'cA' }, 'cA').then(() => false, (e) => /Connexion requise/.test(String(e.message))));
  dit('3 · une cliente ne lit aucune des trois tables, même les siennes', [0, 0, 0],
    await Promise.all(['attention_articles', 'attention_paniers', 'attention_reglages'].map(async (t) => Number((await comme({ tetes: 'cA,cE' }, `select count(*) as n from public.${t}`))[0].n))));
  dit('3 · ... et n y écrit rien', [true, true],
    [await comme({ tetes: 'cA' }, `insert into public.attention_paniers (id, data) values ('pirate', '{}'::jsonb)`).then(() => false, () => true),
      Number((await comme({ tetes: 'cA' }, `update public.attention_paniers set data = data || '{"etat":"valide"}'::jsonb where id = 'l4' returning id`)).length) === 0]);
  dit('3 · la Maison lit, écrit et reprend', [8, true, 1],
    [Number((await comme({ maison: true }, 'select count(*) as n from public.attention_paniers'))[0].n),
      await comme({ maison: true }, `insert into public.attention_reglages (id, branch_id, data) values ('visee', 'm', '{"type":"visee"}'::jsonb)`).then(() => true, () => false),
      (await comme({ maison: true }, `update public.attention_articles set data = data || '{"retire":true}'::jsonb where id = 'p3' returning id`)).length]);
  dit('3 · ... mais rien ne s efface, même pour elle', [true, 9],
    [await comme({ maison: true }, `delete from public.attention_articles where id = 'p3'`).then(() => false, () => true), Number((await q('select count(*) as n from public.attention_articles'))[0].n)]);
  await db.close?.();
}

console.log(ko === 0 ? `\nL attention tient (${ok} épreuves).` : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
