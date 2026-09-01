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
  libellesInclus,
  prixDeLaFormule, formulesPourElle, etendueDesRemises,
  type Plan, type Subscriber,
} from '../src/shared/abonnements';
import { formulesVisiblesPour, formuleEnVitrine } from '../src/shared/bridges';
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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
