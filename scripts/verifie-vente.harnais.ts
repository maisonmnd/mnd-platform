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
  subServiceUsage, prixDeLaFormule,
  type Plan, type Subscriber,
} from '../src/shared/abonnements';
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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
