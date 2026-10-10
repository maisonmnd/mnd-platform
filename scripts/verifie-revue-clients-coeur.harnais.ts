/* LA REVUE DU 10 OCTOBRE 2026, LOT « CLIENTS-COEUR », EPROUVEE —
   `node scripts/verifie-revue-clients-coeur.mjs` (et `--prouve` pour remettre
   chaque faute une a une et voir le banc crier).

   Six constats de la revue de code, sur le VRAI code :
   [57] la Gamme seule ecrit la piece du rituel : elle fige le prix (sinon le
        rendez-vous sans prix retombait de 40 000 F a 28 000 F) ;
   [58] seule la part famille suit a la visite suivante, jamais le geste du
        jour (remise manuelle, code du comptoir) ;
   [59] l'argent rendu emporte la remise que le comptoir avait ecrite ;
   [60] le bandeau « Reporter la remise » ne reporte jamais une piece
        « Remise famille » ;
   [78] ... ni une remise que le rendez-vous a deja recue ;
   [104] le blocage du Salon Souverain ne porte plus le nom de la cliente
        (la table se lit avec la cle publique du site).

   Donnees reconstruites a la main, TOUS les attendus ecrits en dur : jamais
   tires du code eprouve. */
import { readFileSync } from 'node:fs';
import { apptTotalXof, apptDueXof, remiseFamilleQuiSuit } from '../src/apps/trone/routes/clients/_shared';
import { prixFigeAuReglement, cancelAppointmentPayment, rewindPaymentForDeletedInvoice, resetAllPaidInvoices } from '../src/apps/trone/routes/clients/actions';
import { appointmentsStore, type Appointment } from '../src/shared/agenda';
import { sansLaVisite } from '../src/shared/reprise-nue';
import { clientsStore, type Client } from '../src/shared/clients';
import { servicesStore, categoriesStore, productsStore, type Service } from '../src/shared/catalog';
import { modelBandsStore, bandSetsStore, type ModelBand } from '../src/shared/pricing';
import { invoicesStore } from '../src/shared/finance';
import { remiseDeFactureAReporter, remiseDuComptoirEcrite, remiseDuComptoirRendue } from '../src/shared/offres-pur';
import { blocagesStore, fermerLeSalonPour, rouvrirLeSalonDe } from '../src/shared/blocages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramene a l'ASCII. */
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const horloge = (iso: string) => { (globalThis as Any).__horloge = Date.parse(`${iso}T12:00:00Z`); };
/* Les sources se lisent sans leurs commentaires : un motif cite dans une
   note ne doit pas passer pour du code. */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Le bareme, le catalogue, la fiche (la tete de K. K. : SINSIN a son
   calibre Micro, 40 000 F ; le Souffle offert avec lui ; vitrine 28 000 F) ── */
const BANDS: ModelBand[] = [
  { id: 'cal-medium', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.9 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 450, coef: 2.2, durCoef: 2.4 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null, coef: 2.8, durCoef: 2.8 },
];
const PLANCHERS = { 'cal-medium': 25_000, 'cal-mini': 35_000, 'cal-micro': 40_000, 'cal-nano': 45_000, 'cal-galaxy': 55_000 };
const SINSIN = {
  id: 'sv-sinsin', categoryId: 'cat-sinsin', name: 'SINSIN Essentiel', palier: 'Fondation',
  priceXof: 20_000, hidePrice: false, priceMode: 'variable', tarifMode: 'calibre',
  priceFloors: PLANCHERS, sessions: 1, master: '', durationMin: 120, order: 1,
} as unknown as Service;
const SOUFFLE = {
  id: 'sv-souffle', categoryId: 'cat-plt', name: 'KLOKLO Essentiel, Le Souffle', palier: 'Fondation',
  priceXof: 8_000, hidePrice: false, prixParLongueur: { court: 8_000, 'mi-long': 10_000, long: 12_000 },
  offertAvec: { serviceIds: ['sv-sinsin'] }, sessions: 1, master: '', durationMin: 30, order: 2,
} as unknown as Service;
const services: Service[] = [SINSIN, SOUFFLE];
const byId = new Map(services.map((s) => [s.id, s] as const));
modelBandsStore.set(BANDS);
bandSetsStore.set({});
categoriesStore.set([]);
productsStore.set([]);
servicesStore.set(services);
const KK = {
  id: 'kk', branchId: 'b', name: 'K. K.', phone: '+22966000099', city: '', persona: 'p', since: '2026-02-01',
  segments: [], priceCoef: 1, loyaltyPoints: 0, lockCount: 331, rythmeSemaines: 10, joursPreferes: [6],
} as unknown as Client;
const base = { branchId: 'b', clientId: 'kk', clientName: 'K. K.', serviceIds: ['sv-sinsin', 'sv-souffle'], time: '10:00', master: 'Team' };
const rdv = (o: object) => ({ ...base, ...o } as unknown as Appointment);
const neuf = (rdvs: Appointment[]) => {
  clientsStore.set([KK]);
  appointmentsStore.set(rdvs);
  invoicesStore.set([]);
};
const lu = (id: string) => appointmentsStore.get().find((a) => a.id === id) as Appointment;

/* ══ [57] La Gamme seule fige le prix ══════════════════════════════════
   Le 9 oct. 2026, un flacon emporte sur la reprise du 19 dec. 2026, sans prix,
   rien verse pour le rituel : la piece du rituel s'ecrit quand meme. */
horloge('2026-10-09');
{
  const R = rdv({ id: 'kk-1219', date: '2026-12-19', status: 'confirmé' });
  neuf([R]);
  dit('[57] la reprise sans prix se lit au tarif de sa tete', 40000, apptTotalXof(lu('kk-1219'), byId));
  dit('[57] une piece sans prix fige retombe a la vitrine (la panne)', 28000,
    apptTotalXof({ ...lu('kk-1219'), invoiceId: 'f-gamme' }, byId));
  const fige = prixFigeAuReglement(lu('kk-1219'), byId, { settleTotal: 0, totalGamme: 15_000 });
  dit('[57] la Gamme seule fige le prix, avec le marqueur de l argent', { priceXof: 40000, prixFigeParLArgent: 40000 }, fige);
  dit('[57] ... apres la piece, le rendez-vous vaut toujours 40000', 40000,
    apptTotalXof({ ...lu('kk-1219'), invoiceId: 'f-gamme', ...fige }, byId));
  dit('[57] un versement fige comme avant', { priceXof: 40000, prixFigeParLArgent: 40000 },
    prixFigeAuReglement(lu('kk-1219'), byId, { settleTotal: 10_000, totalGamme: 0 }));
  dit('[57] sans piece (pourboire seul), rien ne se fige', {}, prixFigeAuReglement(lu('kk-1219'), byId, { settleTotal: 0, totalGamme: 0 }));
  dit('[57] un prix enregistre ne bouge pas', {},
    prixFigeAuReglement(rdv({ id: 'x', date: '2026-12-19', status: 'confirmé', priceXof: 35_000 }), byId, { settleTotal: 0, totalGamme: 15_000 }));
  const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
  dit('[57] l ecran d encaissement passe par prixFigeAuReglement', true,
    new RegExp(String.raw`const freeze = prixFigeAuReglement\(appt, byId, \{ settleTotal, totalGamme \}\);`).test(actions));
}

/* ══ [58] Seule la part famille suit ═══════════════════════════════════
   Une tete a -15 % : 12 000 F de part famille sur 80 000 F, un geste manuel
   de 5 000 F saisi au meme ecran. */
{
  const visite = rdv({ id: 'f-1009', date: '2026-10-09', status: 'honoré', priceXof: 80_000,
    discountXof: 17_000, remiseFamille: true, remiseFamilleXof: 12_000 });
  dit('[58] la part famille suit, pas le geste manuel', { discountXof: 12000, remiseFamille: true, remiseFamilleXof: 12000 },
    remiseFamilleQuiSuit(visite));
  dit('[58] ... ni la remise d un code au comptoir', { discountXof: 12000, remiseFamille: true, remiseFamilleXof: 12000 },
    remiseFamilleQuiSuit({ ...visite, discountXof: 29_000, remiseDuComptoirXof: 12_000 }));
  const suivante = { ...sansLaVisite(visite), ...remiseFamilleQuiSuit(visite) } as Appointment;
  dit('[58] la reprise nait avec 12000 de remise famille', [12000, true, 12000], [suivante.discountXof, suivante.remiseFamille, suivante.remiseFamilleXof]);
  dit('[58] un rendez-vous d avant le champ : le cumul moins ce que le comptoir a marque', { discountXof: 6000, remiseFamille: true },
    remiseFamilleQuiSuit({ remiseFamille: true, discountXof: 18_000, remiseDuComptoirXof: 12_000 }));
  dit('[58] ... sans marque, son cumul (decision du 10 oct. 2026, cas Afi)', { discountXof: 6000, remiseFamille: true },
    remiseFamilleQuiSuit({ remiseFamille: true, discountXof: 6_000 }));
  dit('[58] jamais plus que le cumul', { discountXof: 4000, remiseFamille: true, remiseFamilleXof: 4000 },
    remiseFamilleQuiSuit({ remiseFamille: true, discountXof: 4_000, remiseFamilleXof: 12_000 }));
  dit('[58] sans remise famille, rien ne suit', [{}, {}],
    [remiseFamilleQuiSuit({ discountXof: 5_000 }), remiseFamilleQuiSuit({ remiseFamille: true })]);
  /* « Rien ne suit » doit ECRASER le drapeau : `sansLaVisite` garde
     `remiseFamille` et `remiseFamilleXof` (ils appartiennent a la tete), et
     `{}` etale par-dessus les laisserait vivre. JSON.stringify ne distingue pas
     `{}` de `{ remiseFamille: undefined }` : on lit les CLES, puis la reprise
     telle que l'ecran la pose (relecture du 10 octobre 2026). */
  const cles = (o: object) => Object.keys(o).sort();
  dit('[58] rien ne suit : les cles sont la pour ecraser', [['remiseFamille', 'remiseFamilleXof'], ['remiseFamille', 'remiseFamilleXof'], ['remiseFamille', 'remiseFamilleXof']], [
    cles(remiseFamilleQuiSuit({ remiseFamille: true })),
    cles(remiseFamilleQuiSuit({ remiseFamille: true, discountXof: 12_000, remiseDuComptoirXof: 12_000 })),
    cles(remiseFamilleQuiSuit({ remiseFamille: true, discountXof: 5_000, remiseFamilleXof: 0 })),
  ]);
  const reprise = (a: object) => { const r = { ...sansLaVisite(a), ...remiseFamilleQuiSuit(a) } as Appointment; return [r.discountXof ?? null, r.remiseFamille ?? null, r.remiseFamilleXof ?? null]; };
  dit('[58] la reprise d une visite sans remise famille ne garde pas le drapeau', [[null, null, null], [null, null, null], [null, null, null]], [
    reprise({ remiseFamille: true, remiseFamilleXof: 6_000 }),
    reprise({ remiseFamille: true, discountXof: 12_000, remiseDuComptoirXof: 12_000 }),
    reprise({ remiseFamille: true, discountXof: 5_000, remiseFamilleXof: 0 }),
  ]);
  /* Ma Couronne ecrit aussi la part famille a part : sans elle, une
     reservation en ligne prenait l'ancienne voie, et la remise d'un code
     honore au comptoir sans marqueur suivait a la reprise. Booking.tsx est
     tenu par un autre lot, qui eprouve ses propres fautes dans le vrai
     fichier : la preuve de ce controle lit une COPIE fautive
     (REVUE_BOOKING), jamais le fichier de l'autre equipe. */
  const booking = sansCom(process.env.REVUE_BOOKING || 'src/apps/couronne/Booking.tsx');
  dit('[58] Ma Couronne ecrit la part famille a part', true,
    new RegExp(String.raw`\{ discountXof: famRemiseXof, remiseFamille: true, remiseFamilleXof: famRemiseXof \}`).test(booking));
  const fenetre = sansCom('src/apps/trone/routes/clients/_shared.tsx');
  dit('[58] la fenetre ecrit la part famille a part, sur ses deux chemins', 2,
    (fenetre.match(new RegExp(String.raw`remiseFamilleXof: !effCovered && !forfaitPose && remiseEstFamille \? \(remiseFamilleXof \|\| undefined\) : undefined,`, 'g')) ?? []).length);
}

/* ══ [59] L'argent rendu emporte la remise du comptoir ═════════════════
   Un rituel de 80 000 F encaisse 68 000 F avec ROSE15 : le comptoir a ecrit
   12 000 F au rendez-vous, avec son marqueur. */
{
  dit('[59] la remise du comptoir s ecrit avec son marqueur', { discountXof: 18000, remiseDuComptoirXof: 12000 },
    remiseDuComptoirEcrite({ discountXof: 6_000 }, 12_000));
  dit('[59] ... rien pour une remise nulle', {}, remiseDuComptoirEcrite({ discountXof: 6_000 }, 0));
  dit('[59] ... rendue, seule la part du comptoir s en va', { discountXof: 6000 }, remiseDuComptoirRendue({ discountXof: 18_000, remiseDuComptoirXof: 12_000 }));
  dit('[59] ... rien sans marqueur', {}, remiseDuComptoirRendue({ discountXof: 6_000 }));
  const encaisse = (o: object) => rdv({ date: '2026-10-20', status: 'confirmé', priceXof: 80_000,
    discountXof: 12_000, remiseDuComptoirXof: 12_000, paidXof: 68_000,
    payments: [{ id: 'p1', amountXof: 68_000, date: '2026-10-09', method: 'Espèces', invoiceId: 'f-1' }], invoiceId: 'f-1', ...o });
  const champs = (a: Appointment) => [a.discountXof ?? null, a.remiseDuComptoirXof ?? null, a.paidXof ?? null, apptDueXof(a, byId)];
  neuf([encaisse({ id: 'c-1' })]);
  dit('[59] avant : 68000 recus, rien du', [12000, 12000, 68000, 0], champs(lu('c-1')));
  cancelAppointmentPayment(lu('c-1'));
  dit('[59] annuler l encaissement : la remise s en va, 80000 dus', [null, null, null, 80000], champs(lu('c-1')));
  neuf([encaisse({ id: 'c-2', discountXof: 18_000 })]);
  cancelAppointmentPayment(lu('c-2'));
  dit('[59] ... la remise famille (6000) reste', [6000, null, null, 74000], champs(lu('c-2')));
  neuf([encaisse({ id: 'c-3' })]);
  rewindPaymentForDeletedInvoice('f-1', 68_000);
  dit('[59] supprimer la derniere piece : la remise s en va aussi', [null, null, null, 80000], champs(lu('c-3')));
  neuf([encaisse({ id: 'c-4', paidXof: 78_000, payments: [
    { id: 'p1', amountXof: 68_000, date: '2026-10-09', method: 'Espèces', invoiceId: 'f-1' },
    { id: 'p2', amountXof: 10_000, date: '2026-10-10', method: 'Espèces', invoiceId: 'f-2' }], invoiceId: 'f-2' })]);
  rewindPaymentForDeletedInvoice('f-2', 10_000);
  dit('[59] ... tant qu un versement reste, elle reste', [12000, 12000, 68000, 0], champs(lu('c-4')));
  /* La remise a zero des encaissements rend aussi la remise du comptoir :
     la piece qui la justifiait disparait avec les autres. */
  const payee = (id: string) => ({ id, branchId: 'b', kind: 'facture', status: 'payée', number: `MND-${id}`, clientId: 'kk', date: '2026-10-09', lines: [] }) as Any;
  neuf([encaisse({ id: 'c-5' }), encaisse({ id: 'c-6', discountXof: 18_000, invoiceId: 'f-6' })]);
  invoicesStore.set([payee('f-1'), payee('f-6')]);
  resetAllPaidInvoices('b');
  dit('[59] remise a zero des encaissements : la remise du comptoir s en va, la famille reste',
    [[null, null, null], [6000, null, null]],
    [lu('c-5'), lu('c-6')].map((a) => [a.discountXof ?? null, a.remiseDuComptoirXof ?? null, a.invoiceId ?? null]));
  dit('[59] la reprise n emporte pas le marqueur', false, 'remiseDuComptoirXof' in sansLaVisite({ remiseDuComptoirXof: 12_000 } as object));
  const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
  dit('[59] le bouton « Reporter la remise » marque ce qu il ecrit', [true, false], [
    new RegExp(String.raw`\{ \.\.\.a, \.\.\.remiseDuComptoirEcrite\(a, aReporter\.xof\) \}`).test(actions),
    new RegExp(String.raw`discountXof: \(a\.discountXof \?\? 0\) \+ aReporter\.xof`).test(actions),
  ]);
}

/* ══ [60] et [78] Le bandeau ne propose que ce qui manque ══════════════ */
{
  const rose = { number: 'MND-0412', discountLabel: 'Offre Octobre Rose · ROSE15', globalDiscountXof: 12_000 };
  dit('[78] une piece d avant, le rendez-vous sans remise : 12000 se proposent', { xof: 12000, piece: 'MND-0412', libelle: 'Offre Octobre Rose · ROSE15' },
    remiseDeFactureAReporter({ resteDuXof: 12_000, remiseDejaSurLeRdvXof: 0, factures: [rose] }));
  dit('[78] deja remise par le comptoir, une prestation ajoutee (reste 10000) : rien', null,
    remiseDeFactureAReporter({ resteDuXof: 10_000, remiseDejaSurLeRdvXof: 12_000, factures: [rose] }));
  dit('[78] un report deja fait, le reste redevient positif : rien', null,
    remiseDeFactureAReporter({ resteDuXof: 3_000, remiseDejaSurLeRdvXof: 12_000, factures: [rose] }));
  dit('[78] une part deja recue : seulement ce qui manque', 7000,
    remiseDeFactureAReporter({ resteDuXof: 10_000, remiseDejaSurLeRdvXof: 5_000, factures: [rose] })?.xof ?? null);
  dit('[78] deux pieces remisees s additionnent', { xof: 15000, piece: 'MND-0412, MND-0415', libelle: 'Offre Octobre Rose · ROSE15 ; Promotion MAMAN' },
    remiseDeFactureAReporter({ resteDuXof: 20_000, remiseDejaSurLeRdvXof: 0,
      factures: [rose, { number: 'MND-0415', discountLabel: 'Promotion MAMAN', globalDiscountXof: 3_000 }] }));
  const famille = { number: 'MND-0420', discountLabel: 'Remise famille', globalDiscountXof: 6_000 };
  dit('[60] une piece « Remise famille » ne se reporte jamais', [null, null], [
    remiseDeFactureAReporter({ resteDuXof: 10_000, remiseDejaSurLeRdvXof: 6_000, factures: [famille] }),
    remiseDeFactureAReporter({ resteDuXof: 10_000, remiseDejaSurLeRdvXof: 0, factures: [famille] }),
  ]);
  const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
  dit('[60] l ecran passe ce que le rendez-vous a deja recu', true,
    new RegExp(String.raw`remiseDeFactureAReporter\(\{\s*resteDuXof: due,\s*remiseDejaSurLeRdvXof: appt\.discountXof \?\? 0,`).test(actions));
  dit('[60] le bandeau ne dit plus « Ce reste n est pas du », sans tiret cadratin', [false, true, false], [
    actions.includes('Ce reste n’est pas dû'),
    actions.includes('Il lui en manque {fmtMoney(aReporter.xof, currency)}.'),
    /Il lui en manque[^\n]*—/.test(actions),
  ]);
}

/* ══ [104] Le blocage du Salon Souverain ne dit pas qui ═════════════════ */
{
  blocagesStore.set([]);
  /* Un appelant d'avant qui passerait encore le nom : il ne doit pas sortir. */
  (fermerLeSalonPour as (p: object) => void)({ apptId: 'a-104', branchId: 'b', date: '2026-10-20', debut: '10h00', fin: '12h00', qui: 'A. B.' });
  dit('[104] le motif ne porte que le rendez-vous', ['rdv:a-104 · Salon Souverain'], blocagesStore.get().map((b) => b.motif));
  fermerLeSalonPour({ apptId: 'a-104', branchId: 'b', date: '2026-10-20', debut: '11h00', fin: '13h00' });
  dit('[104] ... se repose sans se dedoubler', [['11h00', 'rdv:a-104 · Salon Souverain']], blocagesStore.get().map((b) => [b.debut, b.motif]));
  rouvrirLeSalonDe('a-104');
  dit('[104] ... et se leve avec le rendez-vous', 0, blocagesStore.get().length);
  const fenetre = sansCom('src/apps/trone/routes/clients/_shared.tsx');
  const appel = fenetre.slice(fenetre.indexOf('fermerLeSalonPour({'), fenetre.indexOf('});', fenetre.indexOf('fermerLeSalonPour({')));
  dit('[104] la fenetre du rendez-vous ne passe aucun nom', [true, false], [appel.length > 0, /qui:|\.name/.test(appel)]);
}

console.log(ko === 0 ? '\nLa revue clients-coeur tient : six constats, six corrections eprouvees.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
