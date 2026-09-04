/* CE QUI A ÉTÉ VENDU, ÉPROUVÉ — `node scripts/verifie-vente.mjs`.

   « I need to be able to have it personnalized per clients and select a client
   to sell it to with its own price for each different client » (Yéman,
   28 août 2026).

   UNE ERREUR ICI NE PLANTE PAS, ELLE ENCAISSE. Un prix convenu que l'un des
   écrans oublie de lire réclame le prix du catalogue à une cliente à qui on a
   dit un autre chiffre — au comptoir, la caisse ouverte, devant elle. Et un
   contenu ajusté que Ma Couronne ignore affiche six jetons à qui on en a vendu
   huit. Ces deux fautes se découvrent toujours par la cliente, jamais par la
   Maison. Ce harnais tient donc l'unique règle qui les évite : CE QUE PORTE
   L'ABONNÉE L'EMPORTE, ET À DÉFAUT LA FORMULE PARLE. */
import {
  prixVenduXof, inclusVendus, validiteVendueJours, moisCouvertsVendus,
  partMensuelleVendueXof, prixEstConvenu, ecartDuPrixConvenu,
  subServiceUsage, usageDetaille, rdvCouvertsDe, rdvCouvertsHorsFormule,
  libellesInclus, prochaineReferenceAbo, nomDuContrat, contratPourLaDate, coversSub,
  etatDuContrat, comptesAbonnement, comptesRanges, resteDuContrat,
  moteurDesAbonnements,
  detacheLesVersementsDeLaPiece, contratDuVersement, subscribersStore,
  prixDeLaFormule, formulesPourElle, etendueDesRemises,
  type Plan, type Subscriber,
} from '../src/shared/abonnements';
import { formulesVisiblesPour, formuleEnVitrine } from '../src/shared/bridges';
import { moyensAOffrir, PAYMENT_METHODS_DEFAULT } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* L'Année Sereine · Duo, telle qu'elle est au catalogue : un paquet de crédits
   de 215 000 F, valable douze mois, six resserrages et six lavages. */
const PACK: Plan = {
  id: 'pl-annee', name: 'L’Année Sereine · Duo', tag: '', priceXof: 215_000,
  line: '', perks: [], popular: false, mode: 'pack', validityDays: 365, famille: 'annees',
  included: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-lavage', qty: 6 }],
};

/* La Suite, un abonnement à cycle : 35 000 F le mois, rechargé à chaque échéance. */
const CYCLE: Plan = {
  id: 'pl-suite', name: 'La Suite', tag: '', priceXof: 35_000,
  line: '', perks: [], popular: false, mode: 'cycle', famille: 'prolongement',
  included: [{ serviceId: 'sv-resserrage', qty: 1 }],
};

const abo = (p: Partial<Subscriber>): Subscriber => ({
  id: 'ab-1', branchId: 'b1', clientId: 'c-1', name: 'Une tête', planId: PACK.id,
  slot: '', nextIso: '2027-08-28', since: '', status: 'active', mrrXof: 0, ...p,
});

/* ── ① SANS RIEN DE CONVENU, LA FORMULE PARLE ──────────────────────
   C'est la garantie de non-régression : tous les abonnements déjà signés
   n'ont aucun de ces champs. S'ils cessaient de lire leur formule, la Maison
   verrait ses prix s'effondrer à zéro le jour de la mise en ligne. */
dit('sans prix convenu, le prix est celui du catalogue', 215_000,
  prixVenduXof(abo({}), PACK, 'mensuel'));
dit('sans contenu ajusté, celui de la formule', PACK.included,
  inclusVendus(abo({}), PACK));
dit('sans durée convenue, celle de la formule', 365,
  validiteVendueJours(abo({}), PACK));
dit('un cycle lit son cycle', 35_000, prixVenduXof(abo({ planId: CYCLE.id }), CYCLE, 'mensuel'));
dit('… et son annuel, deux mois offerts', 350_000,
  prixVenduXof(abo({ planId: CYCLE.id }), CYCLE, 'annuel'));

/* ── ② CE QUE PORTE L'ABONNÉE L'EMPORTE ────────────────────────────── */
const merine = abo({ prixConvenuXof: 190_000, motifConvenu: 'Trois têtes au foyer.' });
dit('le prix convenu l’emporte', 190_000, prixVenduXof(merine, PACK, 'mensuel'));
dit('la formule, elle, n’a pas bougé', 215_000, prixDeLaFormule(PACK, 'mensuel').montantXof);

const ajuste = abo({ inclusPropres: [{ serviceId: 'sv-lavage', qty: 8 }] });
dit('le contenu ajusté l’emporte', [{ serviceId: 'sv-lavage', qty: 8 }],
  inclusVendus(ajuste, PACK));
dit('… et il REMPLACE, il ne s’ajoute pas', 1, inclusVendus(ajuste, PACK).length);
dit('la durée convenue l’emporte', 300, validiteVendueJours(abo({ validiteJours: 300 }), PACK));

/* ── ③ ZÉRO EST UN PRIX, PAS UNE ABSENCE ───────────────────────────
   La faute qui revient (savePlan, saveSub, savePay, saveTier, tous corrigés le
   28 août) : `0` est faux en JavaScript. Une formule OFFERTE à une fidèle
   serait alors relue au prix du catalogue, et on lui réclamerait 215 000 F. */
dit('une formule offerte vaut zéro, pas le catalogue', 0,
  prixVenduXof(abo({ prixConvenuXof: 0 }), PACK, 'mensuel'));
dit('… et c’est bien un prix convenu', true, prixEstConvenu(abo({ prixConvenuXof: 0 })));
dit('rien de convenu se dit faux', false, prixEstConvenu(abo({})));
dit('une liste ajustée VIDE reste un choix', [],
  inclusVendus(abo({ inclusPropres: [] }), PACK));

/* ── ④ LE REVENU RÉCURRENT SUIT CE QU'ON ENCAISSE ──────────────────
   Sur le prix du catalogue, la Maison lirait chaque mois un revenu qu'elle
   n'encaisse pas — et le MRR est le chiffre sur lequel elle décide d'embaucher. */
dit('douze mois pour un pack annuel', 12, moisCouvertsVendus(abo({}), PACK, 'mensuel'));
dit('dix mois si la durée a été raccourcie', 10,
  moisCouvertsVendus(abo({ validiteJours: 300 }), PACK, 'mensuel'));
dit('le MRR du catalogue', Math.round(215_000 / 12), partMensuelleVendueXof(abo({}), PACK, 'mensuel'));
dit('le MRR du prix convenu', Math.round(190_000 / 12), partMensuelleVendueXof(merine, PACK, 'mensuel'));
/* PRIX ET DURÉE CONVENUS ENSEMBLE : 190 000 F sur dix mois, pas sur douze. */
dit('… prix et durée convenus se composent', 19_000,
  partMensuelleVendueXof(abo({ prixConvenuXof: 190_000, validiteJours: 300 }), PACK, 'mensuel'));
/* UN CYCLE NE SE DIVISE PAS PAR SA DURÉE DE VIE : il n'en a pas. Le mensuel
   couvre un mois, l'annuel douze — c'est le cycle qui juge, pas le pack. */
dit('un cycle mensuel convenu porte tout son mois', 30_000,
  partMensuelleVendueXof(abo({ planId: CYCLE.id, prixConvenuXof: 30_000 }), CYCLE, 'mensuel'));
dit('un annuel convenu se ramène au mois', 25_000,
  partMensuelleVendueXof(abo({ planId: CYCLE.id, prixConvenuXof: 300_000 }), CYCLE, 'annuel'));

/* ── ⑤ L'ÉCART SE DIT JUSTE ────────────────────────────────────────
   C'est lui qui s'affiche au comptoir et, barré, dans Ma Couronne. Un signe
   inversé annoncerait une faveur là où la Maison a facturé davantage. */
dit('rien de convenu, aucun écart à montrer', null, ecartDuPrixConvenu(abo({}), PACK, 'mensuel'));
const e = ecartDuPrixConvenu(merine, PACK, 'mensuel')!;
dit('l’écart est négatif quand elle paie moins', -25_000, e.ecartXof);
dit('… et son pourcentage', -11.6, e.pct);
dit('… le catalogue reste dit', 215_000, e.catalogueXof);
const plus = ecartDuPrixConvenu(abo({ prixConvenuXof: 240_000 }), PACK, 'mensuel')!;
dit('l’écart est positif quand elle paie plus', 25_000, plus.ecartXof);
dit('sans formule, pas d’écart', null, ecartDuPrixConvenu(merine, undefined, 'mensuel'));

/* ── ⑥ LES JETONS DE MA COURONNE COMPTENT SON CONTENU ──────────────
   Lui afficher six lavages quand on lui en a vendu huit est la plus sûre façon
   de perdre sa confiance : elle réserve, on refuse, et elle a raison. */
const rdv = (id: string, date: string, serviceId: string): Appointment => ({
  id, branchId: 'b1', clientId: 'c-1', date, time: '10:00',
  serviceIds: [serviceId], status: 'honoré', subId: 'ab-1',
  /* SANS `coveredBySub`, LE RITUEL A ÉTÉ PAYÉ : il ne décompte aucun crédit.
     C'est ce drapeau, et lui seul, qui dit « celui-ci passe sur l'abonnement ». */
  coveredBySub: true,
} as Appointment);

const huitLavages = abo({
  startIso: '2026-01-01', expiresIso: '2026-12-31',
  inclusPropres: [{ serviceId: 'sv-resserrage', qty: 6 }, { serviceId: 'sv-lavage', qty: 8 }],
});
const deuxVenues = [rdv('r1', '2026-03-01', 'sv-lavage'), rdv('r2', '2026-04-01', 'sv-lavage')];
const suivi = subServiceUsage(huitLavages, PACK, deuxVenues);
dit('le suivi lit SES quotas', [6, 8], suivi.map((u) => u.qty));
dit('… et ce qu’il lui reste en découle', [6, 6], suivi.map((u) => u.remaining));
/* La même abonnée SANS contenu propre lirait six lavages : la preuve que le
   suivi lit bien l'abonnée, et pas la formule par accident. */
const sansPropre = subServiceUsage(
  abo({ startIso: '2026-01-01', expiresIso: '2026-12-31' }), PACK, deuxVenues);
dit('sans contenu propre, les quotas de la formule', [6, 6], sansPropre.map((u) => u.qty));
dit('… et deux lavages déjà pris', [0, 2], sansPropre.map((u) => u.used));

/* ── ⑦ CE QU'ELLE VOIT EN VITRINE ──────────────────────────────────
   « Je ne veux pas rendre visible tous les abonnements en ligne sur Ma
   Couronne » (Yéman, 28 août). Elles y étaient TOUTES : celles qui se
   négocient au comptoir, celles gardées pour une tête précise, celles qu'on
   n'a pas fini d'écrire. Une formule mal ficelée, lue par une cliente avant
   que la Maison l'ait décidée, se réclame ensuite au comptoir.

   MASQUER N'EFFACE PAS. Le masque ne touche que la vitrine : celles qui la
   portent gardent leur formule, leur prix et leurs quotas. C'est ce qui rend
   ce geste sûr, et c'est pourquoi il ne doit JAMAIS toucher au reste. */
const CATALOGUE = [PACK, CYCLE, { ...PACK, id: 'pl-troisieme' }];
const ids = (l: readonly { id: string }[]) => l.map((x) => x.id);

dit('sans masque, tout est en vitrine', ['pl-annee', 'pl-suite', 'pl-troisieme'],
  ids(formulesVisiblesPour({ cfg: {}, plans: CATALOGUE })));
dit('le masque de la Maison vaut pour toutes', ['pl-suite', 'pl-troisieme'],
  ids(formulesVisiblesPour({ cfg: { hiddenPlans: ['pl-annee'] }, plans: CATALOGUE })));
dit('le masque d’une fiche ne vaut que pour elle', ['pl-annee', 'pl-troisieme'],
  ids(formulesVisiblesPour({ cfg: {}, masques: { plans: ['pl-suite'] }, plans: CATALOGUE })));

/* LES DEUX S'AJOUTENT, ils ne se remplacent pas. Si le masque de la fiche
   écrasait celui de la Maison, poser un masque individuel RALLUMERAIT tout le
   reste pour cette tête — l'inverse exact de ce qui a été demandé. */
dit('les deux masques s’ajoutent', ['pl-troisieme'],
  ids(formulesVisiblesPour({
    cfg: { hiddenPlans: ['pl-annee'] }, masques: { plans: ['pl-suite'] }, plans: CATALOGUE,
  })));
dit('une formule cachée à la Maison le reste pour chaque tête', false,
  formuleEnVitrine('pl-annee', { hiddenPlans: ['pl-annee'] }, { plans: [] }));
dit('… et la retirer de SON masque ne la rouvre pas', false,
  formuleEnVitrine('pl-annee', { hiddenPlans: ['pl-annee'] }, { plans: ['pl-suite'] }));

/* L'ORDRE DU CATALOGUE TIENT : la vitrine range les formules par moment du
   parcours. Un filtre qui rebattrait l'ordre ferait apparaître une formule
   ailleurs qu'à sa place le jour où l'on en masque une. */
dit('l’ordre ne bouge pas', ['pl-suite', 'pl-troisieme'],
  ids(formulesVisiblesPour({ cfg: { hiddenPlans: ['pl-annee'] }, plans: CATALOGUE })));

/* LE CHAMP ABSENT N'EST PAS UN CHAMP FAUX : la Maison en ligne n'a aucun
   `hiddenPlans` en base. S'il se lisait mal, elle perdrait sa vitrine entière
   au chargement, sans qu'un seul écran ne le dise. */
dit('sans le champ, rien n’est masqué', 3,
  formulesVisiblesPour({ cfg: {}, masques: {}, plans: CATALOGUE }).length);
dit('une liste vide ne masque rien', true,
  formuleEnVitrine('pl-annee', { hiddenPlans: [] }, { plans: [] }));

/* LE MASQUE NE TOUCHE PAS CE QUI EST VENDU, et la preuve est ici même : une
   formule masquée continue de dire son prix et ses quotas à celle qui la
   porte. Sans quoi masquer reviendrait à résilier en silence. */
dit('masquée, elle vaut toujours son prix pour l’abonnée', 190_000,
  prixVenduXof(merine, PACK, 'mensuel'));
dit('… et ses quotas ne bougent pas', [6, 6], inclusVendus(abo({}), PACK).map((i) => i.qty));

/* ── ⑧ CE QU'ELLE A BESOIN DE VOIR ─────────────────────────────────
   « L'abonnement des foyers ne doit apparaître que sur les comptes des
   personnes qui ont un foyer » (Yéman, 29 août). Une formule à deux ou trois
   têtes proposée à une tête seule n'est pas une offre : c'est une question à
   laquelle elle ne peut pas répondre. */
const AVEC_FAMILLES = [
  { id: 'a', famille: 'porte' as const },
  { id: 'b', famille: 'foyer' as const },
  { id: 'c', famille: 'annees' as const },
  { id: 'd' },
];
const idsF = (l: readonly { id: string }[]) => l.map((x) => x.id);

dit('sans foyer, les formules de foyer ne paraissent pas', ['a', 'c', 'd'],
  idsF(formulesPourElle(AVEC_FAMILLES, false)));
dit('avec un foyer, elle les voit', ['a', 'b', 'c', 'd'],
  idsF(formulesPourElle(AVEC_FAMILLES, true)));
/* LE RESTE NE BOUGE PAS. Un filtre qui emporterait les orphelines avec lui
   effacerait les formules sans moment du parcours — le défaut qu'on vient
   justement de corriger le 29 août. */
dit('une formule sans famille reste, dans les deux cas', [true, true],
  [idsF(formulesPourElle(AVEC_FAMILLES, false)).includes('d'),
    idsF(formulesPourElle(AVEC_FAMILLES, true)).includes('d')]);
dit('l’ordre ne bouge pas non plus', ['a', 'c', 'd'],
  idsF(formulesPourElle(AVEC_FAMILLES, false)));

/* ── ⑨ L'ÉTENDUE DES REMISES SE CALCULE ────────────────────────────
   « Une phrase d'accroche entre 20 % et 50 % de remise » (Yéman). Les
   formules de la Maison vont de 17 % à 37 % : écrire 20 et 50 en dur serait
   un chiffre faux tendu à une cliente. La phrase lit donc les VRAIES remises
   et se corrige d'elle-même le jour où un prix bouge. */
dit('l’étendue se lit sur les formules montrées', { min: 17, max: 37 },
  etendueDesRemises([{ discountPct: 22 }, { discountPct: 17 }, { discountPct: 37 }]));
dit('une seule formule donne une étendue plate', { min: 25, max: 25 },
  etendueDesRemises([{ discountPct: 25 }]));
/* SANS REMISE, ON NE PROMET RIEN. Une accroche « de 0 % à 0 % » serait pire
   que pas d'accroche du tout. */
dit('aucune remise, aucune promesse', null, etendueDesRemises([{ discountPct: 0 }, {}]));
dit('vitrine vide, aucune promesse', null, etendueDesRemises([]));
/* Les formules sans remise ne tirent pas le minimum vers le bas : seules
   celles qui en annoncent une comptent. */
dit('celles sans remise ne comptent pas', { min: 20, max: 20 },
  etendueDesRemises([{}, { discountPct: 20 }, { discountPct: 0 }]));

/* ── ⑩ LE COMPTEUR PORTE SES PIÈCES ────────────────────────────────
   « Je veux ouvrir le suivi des packs et les RDV associés » (Yéman, 1er
   septembre 2026).

   UN NOMBRE SEUL NE SE VÉRIFIE PAS. « 6 / 6 utilisées » ne dit pas quelles
   séances ont mangé les jetons : ni le décompte contesté, ni le rendez-vous
   coché par erreur, ni celui qui manque ne se retrouvent. */
const troisVenues = [
  rdv('r1', '2026-03-01', 'sv-lavage'),
  rdv('r2', '2026-04-01', 'sv-lavage'),
  rdv('r3', '2026-02-01', 'sv-resserrage'),
];
const paquet = abo({ startIso: '2026-01-01', expiresIso: '2026-12-31' });
const detail = usageDetaille(paquet, PACK, troisVenues);
dit('chaque ligne porte ses rendez-vous', [['r3'], ['r2', 'r1']],
  detail.map((u) => u.rdv.map((a) => a.id)));
/* LE NOMBRE EST LA LONGUEUR DE LA LISTE, jamais un second comptage : deux
   façons de compter la même chose finissent par diverger d'un jeton. */
dit('le nombre affiché est celui de la liste', true,
  detail.every((u) => u.used === u.rdv.length));
dit('… et le compteur simple en découle', detail.map((u) => u.used),
  subServiceUsage(paquet, PACK, troisVenues).map((u) => u.used));

/* DU PLUS RÉCENT AU PLUS ANCIEN : la dernière séance est celle qu'on cherche
   quand on ouvre le suivi, pas celle de l'an dernier. */
dit('les venues se lisent à l’envers du temps', ['r2', 'r1', 'r3'],
  rdvCouvertsDe(paquet, PACK, troisVenues).map((a) => a.id));

/* UN RITUEL PORTANT DEUX PRESTATIONS INCLUSES paraît sur les deux lignes, et
   décompte les deux : c'est bien deux jetons qu'il consomme. */
const double = { ...rdv('r4', '2026-05-01', 'sv-lavage'), serviceIds: ['sv-lavage', 'sv-resserrage'] };
const avecDouble = usageDetaille(paquet, PACK, [double]);
dit('un rituel à deux prestations décompte des deux côtés', [1, 1],
  avecDouble.map((u) => u.used));

/* UN RENDEZ-VOUS COUVERT QUI NE DÉCOMPTE RIEN ne se voyait nulle part : il se
   règle comme s'il était offert, sans jeton en face. C'est l'anomalie la plus
   coûteuse, et la seule que le suivi ne savait pas montrer. */
const horsFormule = { ...rdv('r5', '2026-06-01', 'sv-lavage'), serviceIds: ['sv-couleur'] };
dit('le couvert hors formule se signale', ['r5'],
  rdvCouvertsHorsFormule(paquet, PACK, [...troisVenues, horsFormule]).map((a) => a.id));
dit('… et rien ne se signale quand tout décompte', 0,
  rdvCouvertsHorsFormule(paquet, PACK, troisVenues).length);
/* UN RITUEL PAYÉ N'EST PAS UNE ANOMALIE : sans `coveredBySub`, il ne prétend
   rien à l'abonnement et n'a pas à paraître dans l'avertissement. */
const paye = { ...rdv('r6', '2026-06-02', 'sv-couleur'), coveredBySub: false };
dit('un rituel payé n’est pas une anomalie', 0,
  rdvCouvertsHorsFormule(paquet, PACK, [paye]).length);
/* UN RITUEL ANNULÉ REND SES JETONS : il ne compte ni dans la liste, ni dans
   l'avertissement. */
const annule = { ...rdv('r7', '2026-06-03', 'sv-lavage'), status: 'annulé' as const };
dit('un rituel annulé ne décompte rien', 0,
  rdvCouvertsDe(paquet, PACK, [annule]).length);

/* ── ⑧ LA FACTURE DIT CE QU'ELLE VEND ────────────────────────────
   « Pour les factures des abonnements, j'aimerais que ça montre les
   prestations qui sont incluses dans l'abonnement sur la facture » (Yéman,
   1er septembre 2026).

   UNE LIGNE À 168 000 F QUI NE DIT QUE « LA JUSTE CADENCE » NE SE VÉRIFIE PAS.
   La cliente garde ce papier des mois, et c'est lui qu'elle ressort pour
   réclamer son cinquième resserrage. */
const nomDuService = (id: string) => (id === 'sv-resserrage' ? 'GBÈJÍ™ Reprise' : 'SÍNSIN™ Lavage');
dit('la facture dit ce que la formule porte',
  ['6 × GBÈJÍ™ Reprise', '6 × SÍNSIN™ Lavage'],
  libellesInclus(abo({}), PACK, nomDuService));
/* SES QUOTAS À ELLE, jamais ceux du catalogue : une facture qui annoncerait six
   lavages à qui on en a vendu huit se retournerait contre la Maison le jour du
   septième. */
dit('… avec SES quotas', ['6 × GBÈJÍ™ Reprise', '8 × SÍNSIN™ Lavage'],
  libellesInclus(huitLavages, PACK, nomDuService));
/* L'ILLIMITÉ SE DIT EN TOUTES LETTRES : « null × » ne veut rien dire sur un
   papier qu'on garde. */
dit('l’illimité se dit', ['GBÈJÍ™ Reprise · à volonté'],
  libellesInclus(abo({ inclusPropres: [{ serviceId: 'sv-resserrage', qty: null }] }), PACK, nomDuService));
/* SANS FORMULE NI CONTENU PROPRE, LA LIGNE RESTE NUE plutôt que d'inventer. */
dit('sans formule, rien ne s’écrit', [], libellesInclus(abo({}), undefined, nomDuService));

/* ── ⑫ DEUX FOIS LA MÊME FORMULE ──────────────────────────────────
   « Il arrive qu'une cliente ait acheté La Juste Cadence 2 fois dans la même
   année, comment je distingue une Juste Cadence de l'autre ? » (Yéman, 1er
   septembre 2026).

   RIEN NE LES DISTINGUAIT À L'ŒIL : deux lignes du même nom et de la même
   formule, séparées par le seul identifiant technique que personne ne voit. */
dit('la première référence de l’année', 'ABO-2026-001', prochaineReferenceAbo([], 2026));
dit('… puis la suivante', 'ABO-2026-004',
  prochaineReferenceAbo([abo({ reference: 'ABO-2026-003' }), abo({ reference: 'ABO-2026-001' })], 2026));
/* L'ANNÉE REPART À UN, comme les factures : la référence dit quand le contrat
   a été signé, c'est la moitié de ce qui distingue deux formules identiques. */
dit('l’année neuve repart à un', 'ABO-2027-001',
  prochaineReferenceAbo([abo({ reference: 'ABO-2026-009' })], 2027));
/* ON NE REPREND JAMAIS UN NUMÉRO DÉJÀ PRIS, même quand la suite a des trous :
   deux contrats de même référence seraient pires que pas de référence. */
dit('un trou ne se rebouche pas', 'ABO-2026-010',
  prochaineReferenceAbo([abo({ reference: 'ABO-2026-009' }), abo({ reference: 'ABO-2026-002' })], 2026));
/* LES ABONNEMENTS D'AVANT CE CHAMP ne comptent pas dans la suite et ne
   reçoivent pas de référence après coup : elle prétendrait avoir été donnée à
   la signature. Ils se nomment par leur date de départ, qui les séparait
   déjà. */
dit('les contrats sans référence ne troublent pas la suite', 'ABO-2026-001',
  prochaineReferenceAbo([abo({}), abo({})], 2026));
dit('un contrat sans référence se nomme par sa date', 'depuis le 2025-11-01',
  nomDuContrat(abo({ sinceIso: '2025-11-01' })));
dit('… et avec, par sa référence', 'ABO-2026-014',
  nomDuContrat(abo({ reference: 'ABO-2026-014', sinceIso: '2026-09-01' })));

/* -- 13. LE LIEN EXPLICITE TRANCHE ---------------------------------
   « Le pack personnalise est fini, pourquoi je continue de faire des
   reservations sur cet abonnement ? » (Yeman, 1er septembre 2026).

   PARCE QUE PERSONNE N'ECRIVAIT LE LIEN. `subId` existe depuis toujours et
   `coversSub` le respecte, mais aucun ecran ne le posait : un rituel couvert
   etait attribue par la SEULE fenetre de dates. Deux contrats aux fenetres qui
   se chevauchent decomptaient donc la meme seance chacun de son cote. */
const paquetFini = { ...abo({ id: 'ab-vieux', startIso: '2025-10-10', expiresIso: '2027-06-30' }), clientId: 'c-1' };
const cadenceNeuve = { ...abo({ id: 'ab-neuf', startIso: '2026-09-01', expiresIso: '2027-09-01' }), clientId: 'c-1' };
const sansLien = rdv('r-sans', '2026-09-01', 'sv-lavage');
const { subId: _ignore, ...nu } = sansLien;
dit('sans lien, la seance compte sur les deux', [1, 1],
  [usageDetaille(paquetFini, PACK, [nu as typeof sansLien])[1].used,
   usageDetaille(cadenceNeuve, PACK, [nu as typeof sansLien])[1].used]);
/* AVEC LE LIEN, UN SEUL CONTRAT LA PORTE. C'est toute la difference entre un
   paquet fini qui continue de manger les rendez-vous et un paquet fini. */
const avecLien = { ...sansLien, subId: 'ab-neuf' };
dit('avec le lien, un seul contrat la porte', [0, 1],
  [usageDetaille(paquetFini, PACK, [avecLien])[1].used,
   usageDetaille(cadenceNeuve, PACK, [avecLien])[1].used]);
/* MAIS LE LIEN NE RESSUSCITE RIEN. « Ne pas mettre les RDV du passe sur le
   nouvel abonnement. Arreter de faire augmenter un abonnement fini. Interdire
   carrement » (Yeman, 1er septembre 2026). Le lien sert a departager deux
   contrats dont les fenetres se chevauchent, pas a franchir les bornes de la
   vie d'un paquet. */
const avantLaSignature = { ...rdv('r-vieux', '2024-01-01', 'sv-lavage'), subId: 'ab-neuf' };
dit('rien avant la signature, meme lie', 0,
  usageDetaille(cadenceNeuve, PACK, [avantLaSignature])[1].used);
const apresLEcheance = { ...rdv('r-tard', '2027-10-01', 'sv-lavage'), subId: 'ab-neuf' };
dit('rien apres l’echeance d’un paquet, meme lie', 0,
  usageDetaille(cadenceNeuve, PACK, [apresLEcheance])[1].used);

/* -- 14. LE CONTRAT DE LA DATE, PAS LE CONTRAT DU JOUR -------------
   « Tous les RDV que je passe doivent aller sur l'abonnement qui couvre la
   periode de l'abonnement. Ne pas mettre les RDV du passe sur le nouvel
   abonnement. Arreter de faire augmenter un abonnement fini. Interdire
   carrement » (Yeman, 1er septembre 2026).

   La modale retenait « son abonnement actuel », le plus recent, quelle que soit
   la date du rituel : rouvrir une seance d'octobre 2025 pour l'enregistrer la
   rattachait au contrat de septembre 2026, qui n'existait pas encore. */
const ancien = { ...abo({ id: 'ab-2025', startIso: '2025-10-10', expiresIso: '2026-06-30' }), clientId: 'c-1', sinceIso: '2025-10-10' };
const recent = { ...abo({ id: 'ab-2026', startIso: '2026-09-01', expiresIso: '2027-05-29' }), clientId: 'c-1', sinceIso: '2026-09-01' };
const deux = [ancien, recent];

dit('une seance de novembre 2025 revient au contrat de 2025', 'ab-2025',
  contratPourLaDate(deux, 'c-1', '2025-11-19', [PACK])?.id);
dit('une seance d’octobre 2026 revient au contrat de 2026', 'ab-2026',
  contratPourLaDate(deux, 'c-1', '2026-10-23', [PACK])?.id);
/* UN PAQUET FINI EST FINI : sa fenetre est toute sa vie, et rien ne s'y
   ajoute au-dela. Sans cette borne, le contrat de 2025 reprendrait la main
   des que le plus recent ne serait plus candidat. */
dit('le paquet fini ne reprend rien', undefined,
  contratPourLaDate([ancien], 'c-1', '2026-10-23', [PACK])?.id);
/* AVANT TOUT CONTRAT, AUCUN CONTRAT. */
dit('avant la premiere signature, rien', undefined,
  contratPourLaDate(deux, 'c-1', '2025-01-01', [PACK])?.id);
/* LE DERNIER JOUR EST DEDANS. « Il me reste une seance pour cloturer la Juste
   Cadence de 2025 au 30 juin 2026 et il ne prend pas le RDV du 30/06/26, il me
   le facture » (Yeman, 2 septembre 2026). Un paquet « valable du 10 octobre au
   30 juin » perdait le 30 juin, c'est-a-dire le jour ou l'on vient solder son
   dernier credit puisque c'est la date ecrite sur le contrat. */
dit('le dernier jour du paquet est dedans', 'ab-2025',
  contratPourLaDate([ancien], 'c-1', '2026-06-30', [PACK])?.id);
dit('… et le lendemain est dehors', undefined,
  contratPourLaDate([ancien], 'c-1', '2026-07-01', [PACK])?.id);
dit('le rituel du dernier jour se decompte', 1,
  usageDetaille(ancien, PACK, [{ ...rdv('r-fin', '2026-06-30', 'sv-lavage'), subId: 'ab-2025' }])[1].used);
dit('… celui du lendemain, non', 0,
  usageDetaille(ancien, PACK, [{ ...rdv('r-apres', '2026-07-01', 'sv-lavage'), subId: 'ab-2025' }])[1].used);
/* L'ECHEANCE D'UN CYCLE, ELLE, RESTE UNE FRONTIERE : un rituel tombant ce
   jour-la appartient au cycle qui s'ouvre, pas a celui qui se ferme, sinon il
   compterait deux fois. */
const cycleAuBord = { ...abo({ id: 'ab-b' }), clientId: 'c-3', sinceIso: '2026-08-01', nextIso: '2026-09-01', startIso: undefined, expiresIso: undefined };
dit('le jour de l’echeance ouvre le cycle suivant', 0,
  usageDetaille(cycleAuBord, CYCLE, [{ ...rdv('r-b', '2026-09-01', 'sv-lavage'), subId: undefined, clientId: 'c-3' }])[1]?.used ?? 0);
/* UN ABONNEMENT A CYCLE SE RECHARGE : un rendez-vous pris pour dans trois mois
   lui revient bien. C'est la difference entre une reserve de credits et un
   engagement qui court. */
const cycleVivant = { ...abo({ id: 'ab-cycle' }), clientId: 'c-2', sinceIso: '2026-09-01', startIso: undefined, expiresIso: undefined };
dit('un cycle prend les dates a venir', 'ab-cycle',
  contratPourLaDate([cycleVivant], 'c-2', '2026-12-01', [CYCLE])?.id);
/* UN RESILIE NE PREND RIEN. */
dit('un resilie ne prend rien', undefined,
  contratPourLaDate([{ ...recent, status: 'churn' as const }], 'c-1', '2026-10-23', [PACK])?.id);

/* LE LIEN EXPLICITE NE PASSE PAS OUTRE L'EXISTENCE DU CONTRAT. C'est ainsi que
   la Juste Cadence neuve affichait 8 / 6 : des seances d'octobre et novembre
   2025, rouvertes et enregistrees, s'etaient liees a elle. */
const seanceDe2025 = { ...rdv('r-2025', '2025-11-19', 'sv-lavage'), subId: 'ab-2026' };
dit('un rituel anterieur a la signature ne compte pas, meme lie', false,
  coversSub(seanceDe2025, recent, PACK));
dit('… et il revient au contrat qui existait', true,
  coversSub({ ...seanceDe2025, subId: 'ab-2025' }, ancien, PACK));

/* -- 15. LE COMPTE D'ABONNEMENT ------------------------------------
   « Creer des comptes abonnements pour chaque client distinctif. Quand il
   entame un nouveau. Facile a suivre. Quand c'est actif, quand un abonnement
   devient inactif. Bien faire la part des choses » (Yeman, 2 septembre 2026).

   L'ETAT NE SE STOCKE PLUS, IL SE LIT. Le champ `status` est ecrit a la vente
   et presque jamais remis a jour : l'ecran annoncait « 9 abonnes actifs » en
   haut et « Actives 4 » en bas, les cinq manquants n'etant dans aucune case. */
const JOUR = '2026-09-02';
const paquetOuvert = { ...abo({ id: 'ab-o', startIso: '2026-08-01', expiresIso: '2027-08-01' }), clientId: 'c-9' };
dit('un paquet dans sa fenetre est en cours', 'en-cours',
  etatDuContrat(paquetOuvert, PACK, [], JOUR));
/* EPUISE : tous les credits consommes, la fenetre court encore. C'est le moment
   de revendre, la tete est la et elle repassera au plein tarif. */
const douzeVenues = Array.from({ length: 12 }, (_, i) =>
  ({ ...rdv(`rr${i}`, '2026-08-1' + (i % 10), i < 6 ? 'sv-resserrage' : 'sv-lavage'), subId: 'ab-o' }));
dit('tous les credits bus, la fenetre ouverte : epuise', 'epuise',
  etatDuContrat(paquetOuvert, PACK, douzeVenues, JOUR));
/* TERMINE PRIME SUR EPUISE : la date passee ferme le contrat, credits bus ou
   non, et ceux qui restent disent que la formule etait trop grande pour elle. */
const paquetClos = { ...paquetOuvert, id: 'ab-f', expiresIso: '2026-06-30' };
dit('la date passee ferme le contrat', 'termine', etatDuContrat(paquetClos, PACK, [], JOUR));
/* RESILIE PRIME SUR TOUT : une resiliation le jour de l'echeance reste une
   resiliation, et c'est le seul depart veritable. */
dit('le resilie prime', 'resilie',
  etatDuContrat({ ...paquetClos, status: 'churn' as const }, PACK, [], JOUR));
/* UN ABONNEMENT A CYCLE NE S'EPUISE PAS : il se recharge a l'echeance, et
   l'appeler epuise ferait relancer une tete qui n'a besoin de rien. */
const cycleTout = { ...abo({ id: 'ab-c' }), clientId: 'c-9', sinceIso: '2026-08-15', startIso: undefined, expiresIso: undefined };
dit('un cycle ne s’epuise pas', 'en-cours', etatDuContrat(cycleTout, CYCLE, douzeVenues, JOUR));
/* SANS PRESTATION INCLUSE, RIEN NE PEUT S'EPUISER. */
dit('un paquet sans credit ne s’epuise pas', 'en-cours',
  etatDuContrat({ ...paquetOuvert, inclusPropres: [] }, PACK, [], JOUR));

/* UN ABONNEMENT A CYCLE NE DOIT RIEN : il se regle lune apres lune, et compter
   son prix comme une dette ferait apparaitre une creance qui n'existe pas. */
dit('un cycle ne doit rien', 0, resteDuContrat(cycleTout, CYCLE, JOUR));
dit('un paquet doit son prix moins le verse', 215_000, resteDuContrat(paquetOuvert, PACK, JOUR));

/* -- LA LIGNE DE VIE D'UNE TETE ------------------------------------
   Une cliente paraissait deux fois a cinq lignes d'ecart, et rien ne disait que
   c'etait la meme personne ni que l'un avait succede a l'autre. */
const vieux = { ...abo({ id: 'ab-v', startIso: '2025-10-10', expiresIso: '2026-06-30' }), clientId: 'c-1', name: 'M. G.' };
const neuf = { ...abo({ id: 'ab-n', startIso: '2026-09-01', expiresIso: '2027-05-29' }), clientId: 'c-1', name: 'M. G.' };
const seule = comptesAbonnement({ subs: [vieux, neuf], plans: [PACK], appts: [], aujourdhui: JOUR });
dit('une tete, un compte', 1, seule.length);
dit('… ses contrats du plus recent au plus ancien', ['ab-n', 'ab-v'],
  seule[0].contrats.map((c) => c.sub.id));
dit('… le contrat qui vit passe en tete', 'ab-n', seule[0].vif?.sub.id);
dit('… et le compte remonte a la premiere signature', '2025-10-10', seule[0].depuisIso);
/* LE SILENCE ENTRE DEUX CONTRATS EST UNE DONNEE : deux mois ou la tete est
   revenue au plein tarif, ou n'est pas revenue du tout. Rien ne le mesurait. */
dit('le trou se compte, du 30 juin au 1er septembre', 63, seule[0].contrats[0].trouJours);
dit('… et le plus ancien n’en a pas', null, seule[0].contrats[1].trouJours);
/* SANS DATE DE FIN, PAS DE TROU : on ne devine pas un silence. */
const sansFin = comptesAbonnement({
  subs: [{ ...vieux, expiresIso: undefined }, neuf], plans: [PACK], appts: [], aujourdhui: JOUR });
dit('sans date de fin, aucun trou', null, sansFin[0].contrats[0].trouJours);

/* UN CONTRAT SANS FICHE RESTE VISIBLE, SEUL DANS SON COMPTE. Les grouper ferait
   une tete imaginaire portant six formules ; les cacher ferait disparaitre de
   l'argent encaisse. */
const orphelins = comptesAbonnement({
  subs: [{ ...vieux, clientId: undefined }, { ...neuf, clientId: undefined }],
  plans: [PACK], appts: [], aujourdhui: JOUR });
dit('deux contrats sans fiche font deux comptes', 2, orphelins.length);

/* LES GESTES D'ABORD : qui doit de l'argent, puis a qui reproposer, puis les
   autres. L'alphabet ne dit rien a personne. */
const enRetard = {
  ...abo({ id: 'ab-r', startIso: '2026-08-01', expiresIso: '2027-08-01' }),
  clientId: 'c-2', name: 'A. Retard',
  echeances: [{ numero: 1, dueIso: '2026-08-01', amountXof: 50_000 }],
};
const aRelancer = { ...paquetOuvert, id: 'ab-e', clientId: 'c-3', name: 'B. Epuisee' };
const tranquille = { ...paquetOuvert, id: 'ab-t', clientId: 'c-4', name: 'C. Tranquille' };
const ranges = comptesRanges(comptesAbonnement({
  subs: [tranquille, aRelancer, enRetard], plans: [PACK],
  appts: douzeVenues.map((r) => ({ ...r, subId: 'ab-e' })), aujourdhui: JOUR }));
dit('le retard d’abord, l’epuise ensuite', ['A. Retard', 'B. Epuisee', 'C. Tranquille'],
  ranges.map((c) => c.nom));

/* -- 16. LE MOTEUR, EN ARGENT REEL ---------------------------------
   « Je ne comprends pas le montant recurrent de 18 817. Ca ne me renseigne pas
   grand-chose sur les abonnements. Pouvons-nous avoir d'autres donnees la ? »
   (Yeman, 2 septembre 2026, deux fois plutot qu'une.)

   TOUT CE QUI SUIT SE VERIFIE A LA CAISSE : des versements dates, des echeances
   nommees, des seances qui existent. Aucune moyenne, aucune projection. */
const catalogue = (id: string) => (id === 'sv-resserrage' ? 30_000 : 18_000);

/* Une tete qui paie en deux fois, dont la premiere echeance est passee. */
const enRetardM = {
  ...abo({ id: 'ab-m1', startIso: '2026-08-01', expiresIso: '2027-08-01' }),
  clientId: 'c-1', name: 'A. Retard',
  echeances: [
    { numero: 1, dueIso: '2026-08-14', amountXof: 100_000 },
    { numero: 2, dueIso: '2026-09-20', amountXof: 115_000 },
  ],
  payments: [{ id: 'p1', date: '2026-08-14', amountXof: 40_000 }],
};
/* Une tete a jour, qui a verse ce mois-ci. */
const aJour = {
  ...abo({ id: 'ab-m2', startIso: '2026-09-01', expiresIso: '2027-09-01' }),
  clientId: 'c-2', name: 'B. AJour',
  payments: [{ id: 'p2', date: '2026-09-01', amountXof: 215_000 }],
};
/* Une tete partie : sa formule s'est terminee et rien n'a suivi. */
const partie = {
  ...abo({ id: 'ab-m3', startIso: '2025-01-01', expiresIso: '2026-01-01' }),
  clientId: 'c-3', name: 'C. Partie',
  payments: [{ id: 'p3', date: '2025-01-01', amountXof: 215_000 }],
};

const lesComptes = comptesAbonnement({
  subs: [enRetardM, aJour, partie], plans: [PACK], appts: [], aujourdhui: JOUR });
const mot = moteurDesAbonnements({
  comptes: lesComptes, plans: [PACK], aujourdhui: JOUR, prixDuService: catalogue });

/* L'ARGENT ENTRE, A SA DATE. Aucune moyenne : ce sont les versements. */
dit('encaisse ce mois', 215_000, mot.encaisseCeMoisXof);
dit('encaisse le mois d’avant', 40_000, mot.encaisseMoisPrecedentXof);

/* EN RETARD : le montant, et combien de tetes. C'est la liste qui fait
   decrocher un telephone. */
dit('le retard se chiffre', 60_000, mot.retardXof);
dit('… et se compte en tetes', 1, mot.retardTetes);

/* A ENCAISSER D'ICI LA FIN DU MOIS : le 20 septembre tombe dans le mois, le
   reste non. */
dit('a encaisser d’ici la fin du mois', 115_000, mot.aEncaisserXof);
dit('… la prochaine date', '2026-09-20', mot.prochaineIso);

/* LE CARNET remplace le MRR : ce que les abonnements en cours doivent encore
   rapporter, tout compris, recalcule a chaque fois. */
dit('le carnet', 175_000, mot.carnetXof);

/* LA DETTE DE FAUTEUIL : des heures deja payees, que rien ne chiffrait. */
dit('les seances dues', 24, mot.seancesDues);
dit('… ce qu’elles valent au catalogue', 576_000, mot.valeurDueXof);

/* LES ETATS SE COMPTENT TOUS, et la somme retombe sur le nombre de contrats :
   c'est ce que l'ancien panneau ne faisait pas, « Actives 4 » sous 9 abonnes. */
dit('en cours', 2, mot.enCours);
dit('parties', 1, mot.parties);
dit('nouvelles ce mois', 1, mot.nouvellesCeMois);
dit('en retard', 1, mot.enRetardNb);

/* LA REPRISE EST LA SEULE RETENTION QUI SE MESURE. Une fin SANS reprise est un
   depart aussi, simplement plus poli qu'une resiliation, et c'est elle que la
   carte « 100 % » ignorait. */
dit('une fin sans reprise est un depart', 1, mot.finsSansReprise);
dit('… et aucune reprise ici', 0, mot.reprises);
const avecReprise = moteurDesAbonnements({
  comptes: comptesAbonnement({
    subs: [partie, { ...aJour, clientId: 'c-3', name: 'C. Partie' }],
    plans: [PACK], appts: [], aujourdhui: JOUR }),
  plans: [PACK], aujourdhui: JOUR, prixDuService: catalogue });
dit('une formule reprise apres une fin se compte', 1, avecReprise.reprises);
dit('… et ne compte plus comme un depart', 0, avecReprise.finsSansReprise);

/* LES RETARDS EN TETE, PUIS LE PLUS PROCHE : l'ordre dans lequel on appelle. */
dit('les retards d’abord', ['2026-08-14', '2026-09-20'], mot.dues.map((d) => d.dueIso));

/* UN RESILIE NE RECLAME PLUS RIEN : le compter ferait une creance que la Maison
   a elle-meme annulee. */
const avecResilie = moteurDesAbonnements({
  comptes: comptesAbonnement({
    subs: [{ ...enRetardM, status: 'churn' as const }], plans: [PACK], appts: [], aujourdhui: JOUR }),
  plans: [PACK], aujourdhui: JOUR, prixDuService: catalogue });
dit('un resilie ne pese pas sur le carnet', 0, avecResilie.carnetXof);
dit('… ni sur le retard', 0, avecResilie.retardXof);
/* MAIS SON ARGENT RESTE ENCAISSE : il est entre en caisse. */
dit('… son versement reste encaisse', 40_000, avecResilie.encaisseMoisPrecedentXof);

/* CE QUE CHAQUE FORMULE A RAPPORTE, la plus grosse d'abord. */
dit('une seule formule ici', ['L’Année Sereine · Duo'], mot.parFormule.map((f) => f.nom));
dit('… trois tetes dessus', 3, mot.parFormule[0].tetes);
dit('… encaisse en tout', 470_000, mot.parFormule[0].encaisseXof);

/* -- 17. LE VERSEMENT D'UN ABONNEMENT VIT A DEUX ENDROITS ---------
   « J'ai supprime le paiement de la facture de l'abonnement de Mylene du 28
   aout, mais son paiement au niveau de l'abonnement est reste intact et le recu
   de son encaissement n'a pas ete supprime » (Yeman, 3 septembre 2026).

   Un reglement d'abonnement s'ecrit DEUX fois, et c'est voulu : dans le contrat
   (qui fait avancer l'echeance) et sur la piece (qui fait le chiffre d'affaires
   et la caisse). Les deux portent le MEME identifiant. Mais rien ne les
   defaisait ensemble. */
subscribersStore.set(() => [{
  ...abo({ id: 'ab-lie' }), clientId: 'c-9', invoiceId: 'inv-abo',
  payments: [
    { id: 'pay-1', date: '2026-08-28', amountXof: 100_000, method: 'Cheque' },
    { id: 'pay-2', date: '2026-09-15', amountXof: 68_000, method: 'Especes' },
  ],
} as Subscriber]);

dit('le contrat porte le versement', 'ab-lie', contratDuVersement('pay-1')?.id);
dit('un versement inconnu ne trouve aucun contrat', undefined, contratDuVersement('pay-x')?.id);

dit('la piece emporte ses versements', 2,
  detacheLesVersementsDeLaPiece('inv-abo', ['pay-1', 'pay-2']));
dit('… et le contrat n’en garde aucun', 0, subscribersStore.get()[0].payments?.length ?? -1);
/* LE LIEN PART AVEC LA PIECE : le garder ferait chercher indefiniment une
   facture qui n'existe plus, et le prochain reglement s'y accrocherait. */
dit('… et le lien vers la piece est coupe', undefined, subscribersStore.get()[0].invoiceId);

/* UN CONTRAT QUI N'EST PAS CELUI DE LA PIECE NE BOUGE PAS : deux abonnees
   peuvent avoir un versement du meme jour, et seul l'identifiant fait foi. */
subscribersStore.set(() => [{
  ...abo({ id: 'ab-autre' }), clientId: 'c-8', invoiceId: 'inv-autre',
  payments: [{ id: 'pay-1', date: '2026-08-28', amountXof: 100_000, method: 'Cheque' }],
} as Subscriber]);
dit('une piece etrangere ne retire rien', 0,
  detacheLesVersementsDeLaPiece('inv-abo', ['pay-1']));
dit('… et le contrat garde son versement', 1, subscribersStore.get()[0].payments?.length ?? -1);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);

/* ══ UNE SEULE LISTE DE MOYENS DE RÈGLEMENT ════════════════════════
   « J'ai l'impression que Moyen de règlement est à plusieurs endroits. Il
   n'affiche pas les moyens de paiement des paramètres de l'encaissement »
   (Yéman, 5 septembre 2026). Quatre écrans portaient leur copie ; ils lisent
   désormais la liste des Paramètres, et ce juge tient les trois pièges. */
const laListe = ['Espèces', 'MTN MoMo', 'Chèque'];

dit('la liste des Paramètres, telle quelle', laListe, moyensAOffrir(laListe));
dit('… « Chèque » ajouté aux réglages se voit ici', true,
  moyensAOffrir(laListe).includes('Chèque'));

/* LE MOYEN DÉJÀ ÉCRIT RESTE OFFERT. Sans lui, on rouvre une avance réglée
   « Virement » sur une liste qui dit « Virement bancaire » : aucune pastille
   allumée, et ré-enregistrer changerait en silence par quoi l'argent est
   passé. Une trace ne se corrige pas en la rouvrant. */
dit('un moyen retiré des réglages reste offert sur sa trace',
  ['Espèces', 'MTN MoMo', 'Chèque', 'Virement'], moyensAOffrir(laListe, 'Virement'));
dit('… mais il ne se double pas quand il y est déjà', laListe, moyensAOffrir(laListe, 'Chèque'));
dit('… ni sur une casse différente', laListe, moyensAOffrir(laListe, 'chèque'));
dit('… et rien à ajouter quand il n’y a rien d’écrit', laListe, moyensAOffrir(laListe, '   '));

/* JAMAIS UN CHOIX VIDE : une Maison qui n'a rien réglé doit pouvoir encaisser. */
dit('une liste vide retombe sur les moyens de naissance', PAYMENT_METHODS_DEFAULT, moyensAOffrir([]));
dit('… les lignes blanches ne comptent pas', PAYMENT_METHODS_DEFAULT, moyensAOffrir(['', '  ']));
dit('… et la trace reste offerte par-dessus', true,
  moyensAOffrir([], 'Troc').includes('Troc'));

/* ON NE TOUCHE PAS À LA LISTE DES RÉGLAGES : elle vient d'un magasin partagé,
   et la modifier depuis un écran d'encaissement la changerait pour tous. */
const original = ['Espèces', 'MTN MoMo', 'Chèque'];
moyensAOffrir(original, 'Virement');
dit('la liste des réglages n’est jamais modifiée', 3, original.length);
