/* LE MOMENT EN TROIS VENUES, ÉPROUVÉ · 7 novembre 2026.
   `node scripts/verifie-le-moment-en-trois.mjs` (et `--prouve`).

   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Chaque attente est écrite à la main, d'après la règle, jamais tirée
   du code éprouvé. Têtes, montants et pièces INVENTÉS (initiales seulement).
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  ARRONDI_DU_TIERS_XOF, SERVICE_LE_MOMENT, ditLaPart, enNVenues, serviceDesVenuesSuivantes, tiersConvenus, venuesDuMomentPour, VENUE_ESSENTIEL, VENUE_SIGNATURE, argentDeLaVenue, contientLeMoment, datesDuPlanValides,
  forfaitDuTiers, francsDuTiers, jourDuTiers, lisLePlan, lisLesPlansDeLaCliente, momentEnTroisDuRang, momentSeRegleEnTrois, motDeLEtat,
  phraseEncaisserLeTiers, regleDuTiers, rdvsDuPlan, tiersAEncaisser, tiersDuMoment, venueDEntretienDuMoment, type RdvDuPlan,
} from '../src/shared/le-moment-en-trois-pur';
import { NAISSANCES } from '../src/shared/nouvelle-grille-pur';
import { etatDesEcheances } from '../src/shared/echeancier';
import { appelDe } from '../src/shared/civilite';
import { invoiceReglements, invoiceResteXof, invoiceTotal } from '../src/shared/finance-pur';
import type { Invoice } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';
import {
  annulationParElle, aReglerApres, porteAvantApres, prixFigeDeLaFin, resteConnuDeLaFin, type RdvDeLaFin,
} from '../src/shared/terminer-et-regler-pur';
import { rituelDeLaPiece, versementsDeLaPiece, type PieceLue } from '../src/shared/cloture-du-jour-pur';
import { CLE_DE_LA_PIECE, decisionDEnvoi } from '../src/shared/une-piece-un-message-pur';
import { restesHorsFormuleDe } from '../src/apps/couronne/releve';
import { SERVICE_RETIRE_DIT, detailDuService, detailParVenue, dureeDite, type ServiceLu } from '../src/shared/le-moment-detail-pur';
import { PLAFOND_PAR_VENUE_CUIR_CHEVELU_XOF, tiersPlafonnes } from '../src/shared/le-moment-en-trois-pur';
// @ts-expect-error module .mjs sans types
import { ecartsDesCopies } from './terminer-copie-serveur.mjs';

let ko = 0; let n = 0;
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, w]) => w !== undefined).sort(([a], [b]) => a.localeCompare(b))) : v));
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = canon(attendu); const o = canon(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else {
    ko++;
    let i = 0; while (i < a.length && a[i] === o[i]) i++;
    console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}\n       ecart au signe ${i}`);
  }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
/** Le code sans ses commentaires : ce que la cliente peut lire, pas ce que l'équipe écrit pour elle-même. */
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PUR = 'src/shared/le-moment-en-trois-pur.ts';
const CHOIX = 'src/apps/trone/routes/clients/MomentEnTroisChoix.tsx';
const FICHE = 'src/apps/trone/routes/clients/MomentEnTroisFiche.tsx';
const CAISSE = 'src/apps/trone/routes/clients/actions.tsx';
const RDV = 'src/apps/trone/routes/clients/_shared.tsx';
const COURONNE = 'src/apps/couronne/MomentEnTrois.tsx';
const TAB = 'src/apps/couronne/RendezVousTab.tsx';

/* ══ 1. LES TROIS TIERS : arrondis au 500 F, le premier absorbe, la somme est exacte ══ */
dit('135 000 F : trois tiers de 45 000 F', [45000, 45000, 45000], tiersDuMoment(135000));
dit('100 250 F : 33 000 F, 33 000 F, et le premier absorbe tout le reste (34 250 F)', [34250, 33000, 33000], tiersDuMoment(100250));
dit('136 000 F : 45 500 F au premier, 45 000 F aux deux autres (le franc en trop va sur la PREMIERE)', [46000, 45000, 45000], tiersDuMoment(136000));
{
  let fautes = 0; let exemple = '';
  for (let t = 1500; t <= 600_000; t += 250) {
    const x = tiersDuMoment(t);
    const bon = !!x && x[0] + x[1] + x[2] === t && x[1] === x[2] && x[1] % ARRONDI_DU_TIERS_XOF === 0 && x[0] >= x[1] && x[0] - x[1] < 3 * ARRONDI_DU_TIERS_XOF && x[1] > 0;
    if (!bon) { fautes++; exemple = exemple || String(t); }
  }
  dit('de 1 500 F a 600 000 F, par pas de 250 F : somme EXACTE, tiers 2 et 3 multiples de 500 F, le premier jamais plus petit ni trop gros', [0, ''], [fautes, exemple]);
}
dit('un Moment dont le total est inconnu, nul, negatif ou trop petit ne se regle pas en trois', [false, false, false, false, false, false],
  [momentSeRegleEnTrois(undefined), momentSeRegleEnTrois(0), momentSeRegleEnTrois(-45000), momentSeRegleEnTrois(Number.NaN), momentSeRegleEnTrois('135000'), momentSeRegleEnTrois(1000)]);
dit('un Moment connu et assez grand se regle en trois', true, momentSeRegleEnTrois(135000));
dit('les trois dates : dans l ordre, valides', [true, false, false], [
  datesDuPlanValides(['2026-11-14', '2026-12-26', '2027-02-06']), datesDuPlanValides(['2026-11-14', '2026-11-01', '2027-02-06']), datesDuPlanValides(['2026-11-14', '', '2027-02-06'])]);

/* ══ 2. LE PLAN, LU DEPUIS SES TROIS RENDEZ-VOUS ══ */
const TOTAL = 135000;
const DATES = ['2026-11-14', '2026-12-26', '2027-02-06'];
const rdv = (rang: 1 | 2 | 3, o: Partial<RdvDuPlan> & { date?: string } = {}): RdvDuPlan => ({
  id: `rdv-${rang}`, clientId: 'c-ae', date: DATES[rang - 1], status: 'confirmé', momentEnTrois: momentEnTroisDuRang('mt-essai', rang, TOTAL)!, ...o,
});
const plan = (verses: [number, number, number], jour: string, dates = DATES) =>
  lisLePlan([1, 2, 3].map((k) => rdv(k as 1 | 2 | 3, { date: dates[k - 1], paidXof: verses[k - 1] })), jour)!;
const resume = (p: ReturnType<typeof plan>) => ({ etats: p.lignes.map((l) => l.etat), reste: p.resteXof, pause: p.enPause, jour: p.tiersDuJour?.rang ?? null, prochaine: p.prochaine?.rang ?? null });

dit('le jour de la 1re venue, rien de regle : le tiers du jour est le premier, reste 135 000 F', { etats: ['prochaine', 'a-venir', 'a-venir'], reste: 135000, pause: false, jour: 1, prochaine: 1 }, resume(plan([0, 0, 0], '2026-11-14')));
dit('1re venue reglee : reglee, la prochaine venue, a venir ; reste 90 000 F, pas de tiers du jour', { etats: ['regle', 'prochaine', 'a-venir'], reste: 90000, pause: false, jour: null, prochaine: 2 }, resume(plan([45000, 0, 0], '2026-11-14')));
dit('le jour de la 2e venue, son tiers est le tiers du jour', { etats: ['regle', 'prochaine', 'a-venir'], reste: 90000, pause: false, jour: 2, prochaine: 2 }, resume(plan([45000, 0, 0], '2026-12-26')));
dit('les trois reglees : reste zero, rien a venir', { etats: ['regle', 'regle', 'regle'], reste: 0, pause: false, jour: null, prochaine: null }, resume(plan([45000, 45000, 45000], '2027-02-06')));
dit('UN TIERS NON REGLE = PAUSE : la 2e venue est passee sans reglement, le Moment attend ; le reste est exactement les deux tiers, SANS DETTE AJOUTEE', { etats: ['regle', 'en-pause', 'a-venir'], reste: 90000, pause: true, jour: null, prochaine: null }, resume(plan([45000, 0, 0], '2026-12-27')));
dit('la pause n ajoute rien : 60 jours plus tard, le reste est toujours 90 000 F', 90000, plan([45000, 0, 0], '2027-02-25').resteXof);
{
  const p = plan([0, 0, 0], '2026-12-20');
  dit('1re venue passee non reglee (le 20 decembre) : en pause, et aucune autre venue ne passe devant elle (la 2e et la 3e restent a venir)', ['en-pause', 'a-venir', 'a-venir'], p.lignes.map((l) => l.etat));
}
dit('L IMPUTATION SE FAIT DANS L ORDRE : 45 000 F verses sur la 3e venue d avance regle la PLUS VIEILLE echeance d abord', ['regle', 'prochaine', 'a-venir'], plan([0, 0, 45000], '2026-11-10').lignes.map((l) => l.etat));
{
  const verse = 60000;
  const e = etatDesEcheances([{ numero: 1, dueIso: DATES[0], amountXof: 45000 }, { numero: 2, dueIso: DATES[1], amountXof: 45000 }, { numero: 3, dueIso: DATES[2], amountXof: 45000 }], verse, '2026-11-10');
  dit('la lecture du plan rend EXACTEMENT ce que rend l echeancier de la Maison (reglements imputes dans l ordre)', e.map((x) => x.regleXof),
    plan([45000, 15000, 0], '2026-11-10').lignes.map((l) => l.regleXof));
}
dit('un tiers ne se regle qu UNE fois : 100 000 F verses sur un tiers de 45 000 F = 45 000 F de ce tiers, jamais plus ; le trop-percu ne devient pas le tiers d une autre venue', [45000, 0, 90000],
  [regleDuTiers(rdv(1, { paidXof: 100000 })), regleDuTiers(rdv(2)), plan([100000, 0, 0], '2026-11-14').resteXof]);
dit('a l encaissement, ce qu il reste a encaisser pour la venue est son tiers moins ce qu elle a regle, JAMAIS LE TOTAL : 45 000, 15 000 puis 0 ; hors plan, rien', [45000, 15000, 0, 0],
  [tiersAEncaisser(rdv(2)), tiersAEncaisser(rdv(2, { paidXof: 30000 })), tiersAEncaisser(rdv(2, { paidXof: 45000 })), tiersAEncaisser({ id: 'x', date: '2026-11-14' })]);
dit('l argent d une venue : son journal, sinon paidXof', [30000, 20000], [argentDeLaVenue({ payments: [{ amountXof: 10000 }, { amountXof: 20000 }], paidXof: 5 }), argentDeLaVenue({ paidXof: 20000 })]);

/* UNE VENUE DEPLACEE GARDE SON TIERS ET SUIT SA DATE ; UNE VENUE MANQUEE LE GARDE */
{
  const d = plan([45000, 0, 0], '2026-12-20', ['2026-11-14', '2027-01-09', '2027-02-06']);
  dit('la 2e venue deplacee au 9 janvier 2027 : son tiers (45 000 F) la suit, avec sa nouvelle date', [{ rang: 2, dateIso: '2027-01-09', montantXof: 45000 }], [{ rang: d.lignes[1].rang, dateIso: d.lignes[1].dateIso, montantXof: d.lignes[1].montantXof }]);
  dit('... et le reste dû ne bouge pas (90 000 F), le total de la 2e venue deplacee reste le meme', 90000, d.resteXof);
  const manque = lisLePlan([rdv(1, { paidXof: 45000 }), rdv(2, { status: 'annulé' }), rdv(3)], '2026-12-27')!;
  dit('une venue annulee ou manquee GARDE son tiers : toujours 90 000 F dus sur le plan, jamais efface avec le rendez-vous', [90000, 45000], [manque.resteXof, manque.lignes[1].montantXof]);
  const efface = lisLePlan([rdv(1, { paidXof: 45000 }), rdv(3)], '2026-12-27')!;
  dit('un rendez-vous efface : son tiers reste dû (90 000 F), sans rendez-vous, rangé à la date de la venue la plus proche (jamais une date fantôme)', [90000, null, '2026-11-14'], [efface.resteXof, efface.lignes[1].rdvId, efface.lignes[1].dateIso]);
}

/* ══ 3. JAMAIS DE REMISE, JAMAIS DE DETTE ══ */
{
  const m = momentEnTroisDuRang('mt-essai', 1, TOTAL)!;
  const f = forfaitDuTiers(m, '2026-11-14');
  dit('le forfait du tiers : son net est le tiers, et son prix plein EST le tiers (aucune remise ne se lit nulle part)', [45000, 45000], [f.totalXof, f.baseXof]);
  dit('le prix figé du rendez-vous (lecture serveur) est son tiers, jamais le total', 45000, prixFigeDeLaFin({ priceXof: 45000, forfait: f }));
  /* La pièce d'une venue : une ligne, au montant du tiers, aucune remise globale. */
  const piece = (rang: 1 | 2 | 3, versements: number[]): Invoice => ({
    id: `f-${rang}`, branchId: 'b', kind: 'facture', number: `F-TEST-000${rang}`, clientId: 'c-ae', date: DATES[rang - 1],
    lines: [{ id: 'l', label: f.nom, qty: 1, unitXof: 45000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'envoyée',
    payments: versements.map((a, i) => ({ id: `p${rang}${i}`, date: DATES[rang - 1], amountXof: a, method: 'Espèces' })),
  } as Invoice);
  dit('la pièce du tiers vaut 45 000 F, sans remise ; reglee une fois : reste 0 ; partiellement : le reste', [45000, 0, 15000], [invoiceTotal(piece(1, [])), invoiceResteXof(piece(1, [45000])), invoiceResteXof(piece(1, [30000]))]);
  const somme = [1, 2, 3].reduce((s, k) => s + invoiceTotal(piece(k as 1 | 2 | 3, [])), 0);
  dit('les trois pieces valent ENSEMBLE le total du Moment, au franc', TOTAL, somme);

  /* LA CLOTURE DU JOUR NE COMPTE QUE LE TIERS DU JOUR (l argent compte au jour ou il est encaisse) */
  const pieces = [piece(1, [45000]), piece(2, [45000]), piece(3, [])] as unknown as PieceLue[];
  const duJour = (jour: string) => pieces.flatMap((p) => versementsDeLaPiece(p)).filter((v) => v.date === jour).reduce((s, v) => s + (v.amountXof ?? 0), 0);
  dit('la cloture du 14 novembre 2026 compte 45 000 F (le tiers du jour), pas le total ; celle du 26 decembre 45 000 F ; celle du 6 fevrier 2027 : rien encore', [45000, 45000, 0], [duJour('2026-11-14'), duJour('2026-12-26'), duJour('2027-02-06')]);
  dit('la part « rituel » de chaque piece est son tiers (le reste dû du Moment se lit sur la fiche, jamais dans la cloture)', [45000, 45000, 45000], pieces.map((p) => rituelDeLaPiece(p)));
  dit('le journal de la pièce lit ses propres versements, pas ceux d une autre venue', [1, 1], [invoiceReglements(piece(1, [45000])).length, invoiceReglements(piece(2, [45000])).length]);
}

/* ══ 4. LA FIN ET MA COURONNE : le tiers se lit comme un prix figé, jamais le total ══ */
const MS = (jour: string, h = '10:00') => Date.parse(`${jour}T${h}:00+01:00`);
const rdvFin = (rang: 1 | 2 | 3, o: Partial<RdvDeLaFin> = {}): RdvDeLaFin => ({
  id: `rdv-${rang}`, clientId: 'c-ae', date: DATES[rang - 1], time: '09:00', status: 'confirmé', priceXof: 45000,
  forfait: { totalXof: 45000 }, ...o,
});
dit('le reste connu de la fin pour une venue est son tiers : 45 000 F, jamais 135 000 F ; paye, 0', [45000, 0, 15000], [resteConnuDeLaFin(rdvFin(2)), resteConnuDeLaFin(rdvFin(2, { paidXof: 45000 })), resteConnuDeLaFin(rdvFin(2, { paidXof: 30000 }))]);
{
  const avance = porteAvantApres({ quand: 'avance', rdv: rdvFin(2), maintenantMs: MS('2026-12-01') });
  dit('« Regler d avance » une venue a venir : ouverte, au tiers (45 000 F), sans piece', { ouverte: true, resteXof: 45000, surLaPiece: false }, { ouverte: avance.ouverte, resteXof: avance.resteXof, surLaPiece: avance.surLaPiece });
  const reglee = porteAvantApres({ quand: 'avance', rdv: rdvFin(3, { paidXof: 45000 }), maintenantMs: MS('2026-12-01') });
  dit('une venue reglee d avance : « deja regle », rien de plus a regler', ['deja-regle', 0], [reglee.raison, reglee.resteXof]);
  const passee = porteAvantApres({ quand: 'apres', rdv: rdvFin(2), maintenantMs: MS('2026-12-30') });
  dit('« A regler » apres coup : le tiers de la venue passee (45 000 F), pas le total', [true, 45000], [passee.ouverte, passee.resteXof]);
  const aVenir = porteAvantApres({ quand: 'apres', rdv: rdvFin(3), maintenantMs: MS('2026-12-30') });
  dit('« A regler » ne montre JAMAIS un tiers a venir (la porte d apres est fermee, pas le moment)', ['pas-le-moment', false], [aVenir.raison, aVenir.ouverte]);
  const liste = aReglerApres({ rdvs: [rdvFin(1, { paidXof: 45000 }), rdvFin(2), rdvFin(3)], maintenantMs: MS('2026-12-30'), passeAuComptoirDe: () => false, resteDeLaPiece: () => null });
  dit('« A regler » du 30 decembre 2026 : seulement le tiers de la 2e venue (45 000 F), une seule ligne', [['rdv-2', 45000]], liste.map((d) => [d.rdv.id, d.resteXof]));
  dit('un tiers regle d avance ne s annule plus depuis Ma Couronne (elle ecrit a la Maison), un tiers non regle oui', ['ecrire-a-la-maison', 'permise'], [annulationParElle({ paidXof: 45000 }), annulationParElle({ paidXof: 0 })]);
}
{
  /* LE JUGE DE « MON SOLDE » : un tiers a venir ne se compte pas, un passe se compte UNE fois, au montant du tiers. */
  const plein = (rang: 1 | 2 | 3, o: Partial<Appointment> = {}) => ({ ...rdv(rang), serviceIds: ['sv-x'], branchId: 'b', time: '09:00', priceXof: 45000, forfait: { totalXof: 45000, baseXof: 45000, poseAt: '2026-11-14' }, ...o }) as unknown as Appointment;
  const solde = (jour: string, o: Partial<Record<1 | 2 | 3, Partial<Appointment>>> = {}) => restesHorsFormuleDe('c-ae', [plein(1, o[1]), plein(2, o[2]), plein(3, o[3])], [], [], jour).map((r) => [r.id, r.resteXof]);
  dit('Mon solde, le jour de la 1re venue, rien de regle : seul le tiers du jour (45 000 F) ; les deux a venir ne sont pas dus', [['rdv-1', 45000]], solde('2026-11-14'));
  dit('Mon solde, la 1re reglee, la 2e passee et non reglee : 45 000 F, une fois, pas 135 000 F, pas trois fois', [['rdv-2', 45000]], solde('2026-12-27', { 1: { paidXof: 45000 } }));
  dit('Mon solde, tout regle : rien', [], solde('2027-03-01', { 1: { paidXof: 45000 }, 2: { paidXof: 45000 }, 3: { paidXof: 45000 } }));
  dit('Mon solde ne depasse jamais le total du Moment : les trois passes et non regles = 135 000 F, pas plus', 135000, solde('2027-03-01').reduce((s, r) => s + (r[1] as number), 0));
}
{
  /* LES TROIS VENUES DU PLAN D'UNE CLIENTE */
  const tous: RdvDuPlan[] = [rdv(1), rdv(2), rdv(3), { id: 'autre', clientId: 'c-zz', date: DATES[0], momentEnTrois: momentEnTroisDuRang('mt-autre', 1, TOTAL)! }, { id: 'sans', clientId: 'c-ae', date: DATES[0] }];
  dit('les trois rendez-vous d un plan, dans l ordre des venues, sans ceux d un autre plan ni d un rendez-vous ordinaire', ['rdv-1', 'rdv-2', 'rdv-3'], rdvsDuPlan(tous, 'mt-essai').map((r) => r.id));
  dit('les plans d une cliente : le sien seul', ['mt-essai'], lisLesPlansDeLaCliente(tous, 'c-ae', '2026-11-14').map((p) => p.planId));
}

/* ══ 5. UN SEUL MESSAGE PAR VENUE : une piece, un seul WhatsApp (cle piece-<id>) ══ */
{
  const fraiche = { id: 'f-1', whatsapp: undefined };
  const d1 = decisionDEnvoi({ piece: fraiche, geste: 'auto', instant: '2026-11-14T09:00:00Z' });
  const d1bis = decisionDEnvoi({ piece: { id: 'f-1', whatsapp: { partieLe: '2026-11-14T09:00:00Z', modele: 'm' } }, geste: 'auto', instant: '2026-11-14T09:30:00Z' });
  const d2 = decisionDEnvoi({ piece: { id: 'f-2', whatsapp: undefined }, geste: 'auto', instant: '2026-12-26T09:00:00Z' });
  dit('chaque venue a sa piece, donc UN message : le papier de la 1re part une fois (cle piece-f-1), jamais deux ; celui de la 2e a sa propre cle', [true, CLE_DE_LA_PIECE('f-1'), false, true, CLE_DE_LA_PIECE('f-2')],
    [d1.envoie, d1.envoie ? d1.cle : '', d1bis.envoie, d2.envoie, d2.envoie ? d2.cle : '']);
}

/* ══ 6. LA VENUE D'ENTRETIEN, LE PRENOM, LES MOTS ══ */
{
  const moment = NAISSANCES.find((x) => x.quoi === 'service' && x.fiche.id === SERVICE_LE_MOMENT);
  const ids = new Set(NAISSANCES.filter((x) => x.quoi === 'service').map((x) => x.fiche.id));
  dit('le Moment du catalogue contient la SINSIN Signature : sa venue d entretien est GBEJI Signature ; les deux venues existent au catalogue', [VENUE_SIGNATURE, true, true],
    [venueDEntretienDuMoment((moment as { fiche: { includes?: { serviceId?: string }[] } }).fiche.includes), ids.has(VENUE_ESSENTIEL), ids.has(VENUE_SIGNATURE)]);
  dit('un Moment avec la SINSIN Essentielle prend la venue Essentielle', VENUE_ESSENTIEL, venueDEntretienDuMoment([{ serviceId: 'sv-atl-ii-e' }]));
  dit('un Moment se reconnait a son service : Signature et cuir chevelu (0192, 0193), jamais une venue d entretien', [true, true, false], [contientLeMoment([SERVICE_LE_MOMENT]), contientLeMoment(['sv-le-moment-cuir-chevelu']), contientLeMoment(['sv-venue-gbeji-sig'])]);
  const awa = { name: 'Anne Marie Exemple', civilite: 'madame' as const };
  dit('le bouton dit le tiers et le prenom d usage entier (« Mme Anne Marie », jamais « Mme Anne »)', 'Encaisser le tiers de Mme Anne Marie : 45 000 F', phraseEncaisserLeTiers(appelDe(awa, undefined), 45000));
  dit('une fiche muette : le prenom seul', 'Encaisser le tiers de Anne Marie : 45 000 F', phraseEncaisserLeTiers(appelDe({ name: 'Anne Marie Exemple' }, undefined), 45000));
  dit('les francs se lisent avec l espace ordinaire ; la date avec son annee', ['135 000 F', '26 décembre 2026', '1er janvier 2027'], [francsDuTiers(135000), jourDuTiers('2026-12-26'), jourDuTiers('2027-01-01')]);
  dit('les mots d un etat : jamais « retard »', ['Réglé', 'À la prochaine venue', 'En pause', 'À venir'], (['regle', 'prochaine', 'en-pause', 'a-venir'] as const).map(motDeLEtat));
  const fiche = lis(FICHE);
  dit('la fiche dit le prenom par appelDe, jamais par split(\' \')[0]', [true, false], [/appelDe\(client, undefined\)/.test(fiche), /split\(\s*['"] ['"]\s*\)\s*\[0\]/.test(fiche + lis(CHOIX) + lis(COURONNE) + lis(PUR))]);
  const textes = [lis(COURONNE), lis(CHOIX), lis(FICHE)].map(sansCommentaires).join('\n') + sansCommentaires(lis(PUR));
  dit('aucun « — », aucun « salon », aucune « maitresse » dans ce que la cliente ou l equipe lit', [false, false, false], [/ — /.test(textes), /salon/i.test(textes), /ma[iî]tre(sse)?\b/i.test(sansCommentaires(lis(COURONNE)))]);
  dit('Ma Couronne ne dit jamais « retard » a la cliente (la date du rituel juge, un tiers non regle met le Moment en pause)', false, /retard/i.test(sansCommentaires(lis(COURONNE))));
  dit('jamais la lettre D barree dans un nom', false, /Ɖ/.test(lis(PUR) + lis(COURONNE) + lis(CHOIX) + lis(FICHE)));
}

/* ══ 7. LE COMPTOIR ET MA COURONNE : les sources ══ */
{
  const rdvSrc = lis(RDV); const caisse = lis(CAISSE); const couronne = lis(COURONNE); const tab = lis(TAB);
  dit('le comptoir : comptant ou 3 venues, les trois dates demandees au depart, dans l ordre, sur des places libres', [true, true, true],
    [/venuesActives\.some\(\(v\) => !v\.date \|\| !v\.time\)/.test(rdvSrc), /datesDuPlanValides\(dates, nVenues\)/.test(rdvSrc), /venuesActives\.map\(\(_, i\) => raisonDeLaVenue\(i\)\)\.find\(\(r\) => r\?\.bloque\)/.test(rdvSrc)]);
  dit('les trois rendez-vous se posent d un seul geste (poseUnRendezVous, suites), le premier est le Moment', [true, true],
    [/suites\.push\(\.\.\.suitesDuMoment\);/.test(rdvSrc) && /suites: \[\.\.\.suites, \.\.\.desCompagnes\],/.test(rdvSrc), /serviceIds: \[venueDEntretien\]/.test(rdvSrc)]);
  dit('JAMAIS DE REMISE sur le Moment en trois : remises de ligne, code, mercredi, famille, acompte tous ecartes ; le prix de chaque venue est son tiers', [true, true, true],
    [/remisesLignes: undefined, codeOffre: undefined, offreId: undefined, horsOffreDuJour: true,\s*\n\s*discountPct: undefined, discountXof: undefined, remiseFamille: undefined, remiseFamilleXof: undefined/.test(rdvSrc),
      /priceXof: tiersDuMomentIci\[0\]/.test(rdvSrc), /priceXof: tiersDuMomentIci\[rang - 1\]/.test(rdvSrc)]);
  dit('le tiers est le forfait du rendez-vous et chaque venue porte son plan (momentEnTrois)', [true, true],
    [/momentEnTrois: plan\(1\), forfait: forfaitDuTiers\(plan\(1\), jour\)/.test(rdvSrc), /momentEnTrois: plan\(rang\), forfait: forfaitDuTiers\(plan\(rang\), jour\)/.test(rdvSrc)]);
  dit('le comptoir : quatre venues pour le Moment cuir chevelu seulement (le nombre vient du Moment), les venues suivantes sont celles du Moment', [true, true],
    [/const nVenues = venuesDuMomentPour\(serviceIds\[0\]\);/.test(rdvSrc), /serviceDesVenuesSuivantes\(serviceIds\[0\] \?\? SERVICE_LE_MOMENT/.test(rdvSrc)]);
  dit('en trois venues, les seances « +8 et +12 semaines » du Moment ne se posent pas en plus (jamais deux fois la meme venue)', true, /inc\.afterWeeks <= 0 \|\| enTrois\) continue;/.test(rdvSrc));
  dit('le seul Moment, seul, sur un rendez-vous neuf, hors forfait pose a la main, hors formule', true,
    /const leMomentSeul = !appt && serviceIds\.length === 1 && contientLeMoment\(serviceIds\) && !effCovered;/.test(rdvSrc) && /const tiersDuMomentIci = leMomentSeul && !forfaitPose\s*\n\s*\? \(plafondDuMoment\s*\n\s*\? tiersPlafonnes\(totalDuMoment, nVenues, \{ plafondXof: plafondDuMoment, remisePct: discountPctEcrit, remiseXof: discountXofEcrit \}\)\s*\n\s*: tiersDuMoment\(totalDuMoment, nVenues\)\)/.test(rdvSrc));
  dit('l ecran « pose » propose d encaisser le premier tiers', true, /poseLe\.momentEnTrois && onEncaisser/.test(rdvSrc) && /phraseEncaisserLeTiers\(appelDe\(rdvClient, undefined\), tiersAEncaisser\(poseLe\), poseLe\.momentEnTrois\.tiers\.length\)/.test(rdvSrc));
  dit('a l encaissement : le bouton dit « Encaisser le tiers de <appel> : X F » (le montant de la modale, jamais le total)', true,
    /appt\.momentEnTrois && totalGamme <= 0 && fullyPaid\s*\n?\s*\? phraseEncaisserLeTiers\(appelDe\(payerClient \?\? client, appt\.clientName\), settleTotal, appt\.momentEnTrois\.tiers\.length\)/.test(caisse));
  dit('la piece du tiers : une ligne au montant du tiers, aucune note « au lieu de » (aucune remise ne se lit)', [true, true],
    [/if \(appt\.momentEnTrois\) return \[ligneFacture\(nomForfait \|\| apptLabel\(appt, byId\), net\)\];/.test(caisse), /\(appt\.momentEnTrois \? nomForfait : `\$\{nomForfait\}/.test(caisse)]);
  dit('Ma Couronne : le toucher ne porte que l identifiant du rendez-vous (le montant est relu au SERVEUR par la page « Regler »), le bouton attend la base et porte son montant',
    [true, true, true, false], [/toucher\.regle\(rdv\.id\)/.test(couronne), /resteDAvanceConfirme\(rdv\.id,/.test(couronne), /cible && rdv && duBase !== null/.test(couronne), /regle\([^)]*,[^)]*\)/.test(couronne.replace(/useLeToucher\([^)]*\)/g, ''))]);
  dit('Ma Couronne : « Terminer et regler » le jour de la venue ne passe pas par ce bouton (la carte du rituel en cours regle le tiers du jour)', true, /quand !== 'jour-meme'/.test(couronne));
  dit('Ma Couronne : « Votre Moment · en trois venues » et « Regler le tiers du <jour> », montes dans Mes rendez-vous', [true, true, true],
    [/Votre Moment · \{venues\}/.test(couronne) && /enNVenues\(lecture\.lignes\.length\)/.test(couronne), /Régler la part du \{jour\}/.test(couronne), /<MomentEnTrois clientId=\{releve\.clientId\} \/>/.test(tab)]);
  dit('la liste de Mes rendez-vous nomme le tiers, jamais « a la carte » pour une venue du plan', true, /a\.momentEnTrois && a\.status !== 'annulé'/.test(tab));
  dit('la fiche : « Encaisser le tiers du jour » seulement quand un tiers est du aujourd hui', true, /\{aEncaisser > 0 && rdvDuJour && \(/.test(lis(FICHE)));
  dit('aucune lecture directe de useAppointments dans les fichiers du Trone (les totaux gardent leur selecteur sansLesEssais)', false,
    /useAppointments\s*\(/.test(lis(FICHE) + lis(CHOIX) + lis(PUR)));
  dit('Invoice garde son subId (2dc4a415)', true, /subId\?: string;/.test(lis('src/shared/finance.ts')));
  dit('actions.tsx : « Avant de partir » et sortLesArticlesVendus restent a leur place', [true, true], [/AvantDePartir/.test(caisse), /sortLesArticlesVendus\(lignesGamme\)/.test(caisse)]);
}

/* ══ 8. LES COPIES SERVEUR : rien de ce plan n est copie, les blocs copies restent identiques a leur original ══ */
dit('les blocs copies de terminer-et-regler et regler-la-seance sont identiques a leurs originaux (ce plan n en touche aucun)', [], ecartsDesCopies(process.cwd()));
{
  const fonctions = ['supabase/functions/terminer-et-regler/index.ts', 'supabase/functions/regler-la-seance/index.ts'].map(lis).join('\n');
  dit('aucune fonction Edge ne porte de copie du plan : le reste de chaque venue se lit par le prix figé (forfait) deja copie', false, /momentEnTrois|le-moment-en-trois/.test(fonctions));
}

/* ══ 9. MOBILE 390 px : aucune largeur fixe au-dela de l ecran, rien de force en largeur ══ */
{
  const src = [CHOIX, FICHE, COURONNE].map((f) => sansCommentaires(lis(f))).join('\n');
  const largeurs = [...src.matchAll(/\b(?:width|minWidth)\s*:\s*(\d+)\b/g)].map((m) => Number(m[1]));
  dit('390 px : aucune largeur fixe au-dela de 390 px, rien de force en largeur, les lignes se replient', [[], false, true], [largeurs.filter((w) => w > 390),
    /overflow-x:\s*scroll|overflowX:\s*'scroll'|whiteSpace:\s*'nowrap'/.test(src), /flexWrap: 'wrap'/.test(lis(CHOIX)) && /minWidth: 0/.test(lis(CHOIX)) && /minWidth: 0/.test(lis(FICHE))]);
}


/* ══ 10. QUATRE VENUES (7 novembre 2026) : « Il faut mettre 4 venues au total », sur le Moment cuir chevelu SEULEMENT ══ */
{
  const N4 = 4;
  dit('4 venues : 180 000 F en quatre parts de 45 000 F', [45000, 45000, 45000, 45000], tiersDuMoment(180000, 4));
  dit('4 venues : 126 000 F (la grille) = 31 500 F x 4 ; 100 250 F = 25 250 F au premier, 25 000 F aux trois autres (le premier absorbe)', [[31500, 31500, 31500, 31500], [25250, 25000, 25000, 25000]], [tiersDuMoment(126000, 4), tiersDuMoment(100250, 4)]);
  let fautes = 0; let exemple = '';
  for (let t = 2000; t <= 600_000; t += 250) {
    const x = tiersDuMoment(t, N4);
    const bon = !!x && x.length === 4 && x.reduce((s, v) => s + v, 0) === t && x[1] === x[2] && x[2] === x[3] && x[1] % ARRONDI_DU_TIERS_XOF === 0 && x[0] >= x[1] && x[0] - x[1] < 4 * ARRONDI_DU_TIERS_XOF && x[1] >= ARRONDI_DU_TIERS_XOF;
    if (!bon) { fautes++; exemple = exemple || String(t); }
  }
  dit('4 venues, de 2 000 F a 600 000 F par pas de 250 F : somme EXACTE, trois parts egales multiples de 500 F, jamais une part sous 500 F', [0, ''], [fautes, exemple]);
  dit('4 venues : sous 2 000 F, rien ne se decoupe (pas de part sous 500 F) ; 3 venues : sous 1 500 F', [null, false, true], [tiersDuMoment(1999, 4), momentSeRegleEnTrois(1499, 3), momentSeRegleEnTrois(1500, 3)]);
  dit('le nombre de venues depend du Moment : le cuir chevelu en a QUATRE, le Moment Signature TROIS', [4, 3, 3], [venuesDuMomentPour('sv-le-moment-cuir-chevelu'), venuesDuMomentPour('sv-le-moment'), venuesDuMomentPour(undefined)]);
  dit('cuir chevelu : les venues suivantes sont AUSSI le Moment cuir chevelu ; Signature : la venue d entretien Signature', ['sv-le-moment-cuir-chevelu', VENUE_SIGNATURE], [serviceDesVenuesSuivantes('sv-le-moment-cuir-chevelu', [{ serviceId: 'sv-atl-ii-l' }]), serviceDesVenuesSuivantes('sv-le-moment', [{ serviceId: 'sv-atl-ii-l' }])]);
  dit('les mots suivent le nombre : « en trois venues », « en quatre venues » ; « le tiers », « le quart », « la part »', ['en trois venues', 'en quatre venues', 'le tiers', 'le quart', 'la part'], [enNVenues(3), enNVenues(4), ditLaPart(3), ditLaPart(4), ditLaPart(5)]);
  dit('le bouton dit le quart a quatre venues, le tiers a trois', ['Encaisser le quart de Mme Anne Marie : 45 000 F', 'Encaisser le tiers de Mme Anne Marie : 45 000 F'],
    [phraseEncaisserLeTiers('Mme Anne Marie', 45000, 4), phraseEncaisserLeTiers('Mme Anne Marie', 45000, 3)]);
  dit('les trois dates restent valides a 3 ; a 4 il en faut quatre, dans l ordre', [true, false, true, false], [datesDuPlanValides(['2026-11-28', '2026-12-19', '2027-01-16'], 3), datesDuPlanValides(['2026-11-28', '2026-12-19', '2027-01-16'], 4), datesDuPlanValides(['2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13'], 4), datesDuPlanValides(['2026-11-28', '2027-01-16', '2026-12-19', '2027-02-13'], 4)]);
  dit('le forfait dit le bon nombre de venues (la donnee ecrite a 3 reste dite a 3)', ['Le Moment en quatre venues · venue 2 sur 4', 'Le Moment en trois venues · venue 3 sur 3'],
    [forfaitDuTiers({ rang: 2, tiers: [1, 2, 3, 4] }, '2026-11-28').nom, forfaitDuTiers({ rang: 3, tiers: [1, 2, 3] }, '2026-11-28').nom]);

  /* UN PLAN A QUATRE VENUES, UN PLAN A TROIS : chacun garde le sien */
  const DATES4 = ['2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13'];
  const rdv4 = (rang: number, o: Partial<RdvDuPlan> = {}): RdvDuPlan => ({ id: `q-${rang}`, clientId: 'c-ae', date: DATES4[rang - 1], status: 'confirmé', momentEnTrois: momentEnTroisDuRang('mt-quatre', rang, 180000, undefined, 4)!, ...o });
  const plan4 = (verses: number[], jour: string) => lisLePlan(verses.map((v, i) => rdv4(i + 1, { paidXof: v })), jour)!;
  const r4 = (p: ReturnType<typeof plan4>) => ({ etats: p.lignes.map((l) => l.etat), reste: p.resteXof, pause: p.enPause, jour: p.tiersDuJour?.rang ?? null });
  dit('4 venues, rien de regle le jour de la 1re : 4 lignes, reste 180 000 F', { etats: ['prochaine', 'a-venir', 'a-venir', 'a-venir'], reste: 180000, pause: false, jour: 1 }, r4(plan4([0, 0, 0, 0], '2026-11-28')));
  dit('4 venues, la 1re reglee : reste 135 000 F', { etats: ['regle', 'prochaine', 'a-venir', 'a-venir'], reste: 135000, pause: false, jour: null }, r4(plan4([45000, 0, 0, 0], '2026-11-28')));
  dit('4 venues, la 2e passee et non reglee : pause, reste 135 000 F, aucune dette ajoutee, les suivantes a venir', { etats: ['regle', 'en-pause', 'a-venir', 'a-venir'], reste: 135000, pause: true, jour: null }, r4(plan4([45000, 0, 0, 0], '2026-12-20')));
  dit('4 venues, tout regle : reste zero', 0, plan4([45000, 45000, 45000, 45000], '2027-02-13').resteXof);
  dit('4 venues : le tiers d une venue ne se regle qu une fois, a 45 000 F (60 000 F verses = 45 000 F)', [45000, 0], [regleDuTiers(rdv4(2, { paidXof: 60000 })), tiersAEncaisser(rdv4(2, { paidXof: 60000 }))]);
  dit('4 venues : une venue deplacee garde sa part et suit sa date', [45000, '2027-01-23'], (() => { const p = lisLePlan([rdv4(1), rdv4(2), rdv4(3, { date: '2027-01-23' }), rdv4(4)], '2026-11-28')!; return [p.lignes[2].montantXof, p.lignes[2].dateIso]; })());
  dit('4 venues : les trois plans d une cliente se lisent par le plan, un plan a trois et un plan a quatre cote a cote sans se melanger', [['mt-essai', 3], ['mt-quatre', 4]],
    lisLesPlansDeLaCliente([rdv(1), rdv(2), rdv(3), ...[1, 2, 3, 4].map((k) => rdv4(k))], 'c-ae', '2026-11-01').sort((a, b) => a.planId.localeCompare(b.planId)).reverse().reverse().map((p) => [p.planId, p.lecture.lignes.length]));

  /* UN PRIX CONVENU : 4 x 45 000 F, ni la grille (126 000 F) ni l arrondi ne le ramenent */
  const conv = [45000, 45000, 45000, 45000];
  dit('prix convenu : des parts posees a la main, leur somme est le total (180 000 F), chaque part est son prix', [180000, 45000], [momentEnTroisDuRang('mt-conv', 1, 126000, conv, 4)?.total, momentEnTroisDuRang('mt-conv', 3, 126000, conv, 4)?.tiers[2]]);
  dit('prix convenu : une part sous 500 F, non multiple de 500 F, ou un plan d une seule venue est refuse', [null, null, null], [tiersConvenus([45000, 45250, 45000]), tiersConvenus([45000, 100, 45000]), tiersConvenus([45000])]);
  dit('prix convenu : un rang hors du plan est refuse', [null, null], [momentEnTroisDuRang('mt-conv', 5, 0, conv), momentEnTroisDuRang('mt-conv', 0, 0, conv)]);
  const rdvC = (rang: number, o: Partial<RdvDuPlan> = {}): RdvDuPlan => ({ id: `c-${rang}`, clientId: 'c-ae', date: DATES4[rang - 1], status: 'confirmé', momentEnTrois: momentEnTroisDuRang('mt-conv', rang, 126000, conv, 4)!, ...o });
  const lectC = (verses: number[], jour: string) => lisLePlan(verses.map((v, i) => rdvC(i + 1, { paidXof: v })), jour)!;
  dit('prix convenu : l ordre et les etats sont inchanges ; le reste du = la somme des parts non reglees (135 000 F apres la 1re)', { etats: ['regle', 'prochaine', 'a-venir', 'a-venir'], reste: 135000 }, (({ lignes, resteXof }) => ({ etats: lignes.map((l) => l.etat), reste: resteXof }))(lectC([45000, 0, 0, 0], '2026-11-28')));
  dit('prix convenu : rien regle = 180 000 F dus, jamais 126 000 F ; en pause, la dette n augmente pas', [180000, 180000], [lectC([0, 0, 0, 0], '2026-11-28').resteXof, lectC([0, 0, 0, 0], '2027-03-01').resteXof]);
  dit('prix convenu : le prix figé de chaque RDV (lecture du serveur) est sa part, 45 000 F', 45000, prixFigeDeLaFin({ priceXof: 45000, forfait: forfaitDuTiers(rdvC(2).momentEnTrois!, '2026-11-28') }));
  dit('prix convenu : sans plan convenu, la grille reste le defaut (126 000 F = 31 500 F x 4)', [31500, 31500, 31500, 31500], tiersDuMoment(126000, 4));
}


/* ══ 10b. LE DETAIL, SUR CHAQUE ECRAN (sources) ══ */
{
  const rdvSrc = lis(RDV); const caisse = lis(CAISSE); const couronne = lis(COURONNE); const fiche = lis(FICHE);
  dit('au nouveau RDV : le bloc « Ce que comprend Le Moment » (lu de includes, au prix de la tete, avec le total), et le detail de CHAQUE venue du plan', [true, true, true],
    [/<DetailDuMoment\s+detail=\{detailDuMomentIci\}[\s\S]{0,260}totalXof=\{appt \? undefined : totalDuMoment\}[\s\S]{0,120}avecValeurs=\{false\}/.test(rdvSrc), /detailParVenue\(\[serviceIds\[0\], \.\.\.Array\.from\(\{ length: nVenues - 1 \}, \(\) => venueDEntretien\)\], byId/.test(rdvSrc), /details=\{detailsDesVenues\}/.test(rdvSrc)]);
  dit('a la caisse : la liste des services de la venue, en lecture seule (aucune saisie : un composant sans champ), le prix reste la part figee', [true, false],
    [/\{appt\.momentEnTrois && \(\s*\n\s*<DetailDuMoment\s*\n\s*detail=\{detailDuService\(byId\.get\(appt\.serviceIds\[0\]\), byId, \{\}, appt\.momentEnTrois\.rang\)\}/.test(caisse), /<input|<Select|onChange/.test(lis('src/apps/trone/routes/clients/DetailDuMoment.tsx'))]);
  dit('sur la fiche : le detail repliable par venue, lu du service de chaque rendez-vous', true, /detailDuService\(rdvDeLaVenue \? catalogue\.get\(rdvDeLaVenue\.serviceIds\[0\]\) : undefined, catalogue, \{\}, l\.rang\)/.test(fiche) && /<DetailDuMoment detail=\{detail\} titre="Ce que comprend cette venue" replie/.test(fiche));
  dit('Ma Couronne : le detail par venue, noms lisibles, « Offert », duree ; jamais un code, jamais un prix', [true, false, false], [/detailDuService\(rdvDeLaVenue \? catalogue\.get/.test(couronne) && /t\('Offert'\)/.test(couronne), /valeurXof|serviceId\}<|\{d\.serviceId\}/.test(couronne.replace(/key=\{[^}]*\}/g, '')), /prix\(d\./.test(couronne)]);
  dit('le plafond au comptoir : le Moment cuir chevelu seulement, une remise baisse les parts, les parts reelles sont celles du plan', [true, true],
    [/const plafondDuMoment = nVenues === VENUES_DU_MOMENT_CUIR_CHEVELU \? PLAFOND_PAR_VENUE_CUIR_CHEVELU_XOF : undefined;/.test(rdvSrc), /momentEnTroisDuRang\(planId, rang, totalDuMoment, plafondDuMoment \? tiersDuMomentIci : undefined, nVenues, plafondDuMoment\)/.test(rdvSrc)]);
}

/* ══ 11. LE PLAFOND DE 45 000 F PAR VENUE (Moment cuir chevelu), AVEC OU SANS REMISE ══ */
{
  const P = PLAFOND_PAR_VENUE_CUIR_CHEVELU_XOF;
  const o = (remisePct?: number, remiseXof?: number) => ({ plafondXof: P, remisePct, remiseXof });
  dit('plafond : la grille de 126 000 F en quatre parts (31 500 F) ne dépasse pas 45 000 F ; 180 000 F = 45 000 F x 4', [[31500, 31500, 31500, 31500], [45000, 45000, 45000, 45000]], [tiersPlafonnes(126000, 4, o()), tiersPlafonnes(180000, 4, o())]);
  dit('plafond : 240 000 F (60 000 F par venue) est ramené à 45 000 F par venue, « réajuster au besoin »', [45000, 45000, 45000, 45000], tiersPlafonnes(240000, 4, o()));
  dit('plafond : une remise de 10 % sur 240 000 F laisse 54 000 F : encore ramené à 45 000 F ; sur 180 000 F elle BAISSE chaque part, au 500 F superieur (40 500 F)', [[45000, 45000, 45000, 45000], [40500, 40500, 40500, 40500]], [tiersPlafonnes(240000, 4, o(10)), tiersPlafonnes(180000, 4, o(10))]);
  dit('plafond : une remise ne MONTE jamais une part (0 % = la part ; la part ne depasse jamais la grille ni le plafond)', true,
    [0, 5, 10, 25, 50, 90].every((p) => tiersPlafonnes(180000, 4, o(p))!.every((x, i) => x <= tiersDuMoment(180000, 4)![i] && x <= P)));
  dit('plafond : une remise en francs (20 000 F) se répartit à parts égales (5 000 F par venue) : 40 000 F', [40000, 40000, 40000, 40000], tiersPlafonnes(180000, 4, o(0, 20000)));
  dit('plafond : jamais une part a zéro, plancher 500 F, meme avec 100 % de remise ou une remise énorme', [[500, 500, 500, 500], [500, 500, 500, 500]], [tiersPlafonnes(180000, 4, o(100)), tiersPlafonnes(180000, 4, o(0, 9_000_000))]);
  {
    let fautes = 0;
    for (let t = 2000; t <= 800_000; t += 500) for (const p of [0, 7.5, 20, 33.3, 60]) {
      const x = tiersPlafonnes(t, 4, o(p));
      if (!x || x.length !== 4 || x.some((v) => v > P || v < 500 || v % 500 !== 0)) fautes++;
    }
    dit('plafond : de 2 000 F a 800 000 F, avec 0 a 60 % de remise : jamais plus de 45 000 F, jamais moins de 500 F, toujours au 500 F', 0, fautes);
  }
  const ps = tiersPlafonnes(126000, 4, o(10))!;
  dit('la somme des parts est le total réel du plan ; il est écrit avec le plafond, et refusé si une part le dépasse', [ps.reduce((a, b) => a + b, 0), P, null],
    [momentEnTroisDuRang('mt-pl', 1, 0, ps, 4, P)?.total, momentEnTroisDuRang('mt-pl', 2, 0, ps, 4, P)?.plafondParVenueXof, momentEnTroisDuRang('mt-pl', 1, 0, [50000, 45000, 45000, 45000], 4, P)]);
  /* le prix figé de la venue (lecture serveur / clôture / Mon solde) EST la part reelle */
  const rdvP = (rang: number, paid = 0): RdvDuPlan => ({ id: `p-${rang}`, clientId: 'c-ae', date: ['2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13'][rang - 1], status: 'confirmé', paidXof: paid, momentEnTrois: momentEnTroisDuRang('mt-pl', rang, 0, ps, 4, P)! });
  const lp = lisLePlan([1, 2, 3, 4].map((k) => rdvP(k, k === 1 ? ps[0] : 0)), '2026-11-28')!;
  dit('une remise baisse les parts : le reste du est la somme des parts non reglees (jamais le total de la grille)', ps.slice(1).reduce((a, b) => a + b, 0), lp.resteXof);
  dit('la fin lit la part reelle comme prix fige (Regler d avance : 40 500 F au lieu de 45 000 F)', ps[1], porteAvantApres({ quand: 'avance', rdv: { id: 'p-2', date: '2026-12-19', time: '11:00', status: 'confirmé', priceXof: ps[1], forfait: { totalXof: ps[1] } }, maintenantMs: Date.parse('2026-12-01T10:00:00+01:00') }).resteXof);
}

/* ══ 12. CE QUE LE MOMENT COMPREND, VENUE PAR VENUE (7 novembre 2026) ══ */
{
  const sv = (id: string, name: string, durationMin?: number, priceXof?: number): ServiceLu => ({ id, name, durationMin, priceXof });
  const catalogue: ServiceLu[] = [
    sv('s-a', 'Lavage KLOKLO Signature', 60, 20000), sv('s-b', 'Reprise SINSIN Signature', 150, 35000), sv('s-c', 'WEWE Detox', 30, 10000),
    sv('s-d', 'Sublimation Le Renfort Durable', 45, 15000), sv('s-e', 'Lavage KLOKLO Essentiel', 40, 12000),
  ];
  const moment: ServiceLu = { id: 'm', name: 'Le Moment', includes: [{ serviceId: 's-a' }, { serviceId: 's-b' }, { serviceId: 's-gone' }, { serviceId: 's-e', offert: true }, { serviceId: 's-c', afterWeeks: 8 }] };
  const d = detailDuService(moment, catalogue);
  dit('le detail suit includes du service, dans son ordre, avec les noms complets', ['Lavage KLOKLO Signature', 'Reprise SINSIN Signature', SERVICE_RETIRE_DIT, 'Lavage KLOKLO Essentiel', 'WEWE Detox'], d.lignes.map((l) => l.nom));
  dit('les offerts sont marques, les autres non', [false, false, false, true, false], d.lignes.map((l) => l.offert));
  dit('la duree vient du catalogue quand elle est connue, le delai quand il est ecrit', [[60, 150, undefined, 40, 30], [undefined, undefined, undefined, undefined, 8]], [d.lignes.map((l) => l.dureeMin), d.lignes.map((l) => l.apresSemaines)]);
  dit('un service retire du catalogue se DIT, sans casser la liste (il garde sa place, sans valeur)', [true, undefined, 5], [d.lignes[2].retire, d.lignes[2].valeurXof, d.lignes.length]);
  dit('la valeur de carte : les services comptes ; la valeur offerte : les offerts (12 000 F) ; le retire ne compte pas', [20000 + 35000 + 10000, 12000], [d.valeurCarteXof, d.valeurOfferteXof]);
  dit('la valeur suit le prix de la tete quand l ecran le donne (prixDe)', 2 * 20000, detailDuService({ id: 'x', name: 'x', includes: [{ serviceId: 's-a' }] }, catalogue, { prixDe: (x) => (x.priceXof ?? 0) * 2 }).valeurCarteXof);
  dit('un catalogue en Map se lit comme une liste ; sans service, un detail vide', [5, 0], [detailDuService(moment, new Map(catalogue.map((x) => [x.id, x] as const))).lignes.length, detailDuService(undefined, catalogue).lignes.length]);
  dit('la duree se dit : 2 h 30, 45 min, 1 h', ['2 h 30', '45 min', '1 h'], [dureeDite(150), dureeDite(45), dureeDite(60)]);

  /* LA COMPOSITION DU CATALOGUE (migration 0194) : 4 reprises, 2 sublimations, rien de retire, venue par venue */
  const sql = lis('supabase/migrations/0194_le_moment_cuir_chevelu_quatre_venues.sql');
  const bloc = /nouveau jsonb := '([\s\S]*?)'::jsonb;/.exec(sql);
  const inclus = JSON.parse(bloc![1]) as { serviceId: string; offert?: boolean; afterWeeks?: number; venue: number }[];
  const cuir: ServiceLu = { id: 'sv-le-moment-cuir-chevelu', name: 'Le Moment cuir chevelu', includes: inclus };
  const noms: Record<string, string> = { 'sv-plt-05-sig-c': 'lavage KLOKLO Signature', 'sv-atl-ii-l': 'reprise SINSIN Signature', 'sv-plt-20-c': 'WEWE Detox', 'sv-gbeji-sublimation': 'Sublimation', 'sv-retouches-post-reprise': 'Retouches', 'sv-plt-05-ess-c': 'lavage KLOKLO Essentiel', 'sv-plt-10-m': 'DANDAN' };
  const cat2: ServiceLu[] = Object.entries(noms).map(([id, name]) => ({ id, name, durationMin: 30 }));
  const parVenue = detailParVenue(['sv-le-moment-cuir-chevelu', 'sv-le-moment-cuir-chevelu', 'sv-le-moment-cuir-chevelu', 'sv-le-moment-cuir-chevelu'], [cuir, ...cat2]);
  dit('Moment cuir chevelu : 4 reprises SINSIN Signature et 2 sublimations sur le plan', [4, 2], [inclus.filter((x) => x.serviceId === 'sv-atl-ii-l').length, inclus.filter((x) => x.serviceId === 'sv-gbeji-sublimation').length]);
  dit('chaque venue a SA reprise ; les sublimations sont aux venues 1 et 3', [[1, 1, 1, 1], [1, 0, 1, 0]],
    [parVenue.map((v) => v.lignes.filter((l) => l.serviceId === 'sv-atl-ii-l').length), parVenue.map((v) => v.lignes.filter((l) => l.serviceId === 'sv-gbeji-sublimation').length)]);
  dit('le detail par venue du Moment cuir chevelu (le tableau valide par Yeman)', [
    ['lavage KLOKLO Signature', 'reprise SINSIN Signature', 'WEWE Detox', 'Sublimation'],
    ['lavage KLOKLO Signature', 'reprise SINSIN Signature'],
    ['lavage KLOKLO Signature', 'Retouches', 'reprise SINSIN Signature', 'Sublimation'],
    ['lavage KLOKLO Essentiel', 'DANDAN', 'reprise SINSIN Signature'],
  ], parVenue.map((v) => v.lignes.map((l) => l.nom)));
  dit('le seul offert du Moment cuir chevelu est le lavage Essentiel de la venue 4', [[], [], [], ['lavage KLOKLO Essentiel']], parVenue.map((v) => v.lignes.filter((l) => l.offert).map((l) => l.nom)));
  dit('le catalogue d avant (0192) est entierement conserve (service, delai, offert) : rien n est retire', true,
    [['sv-plt-05-sig-c', 0, false], ['sv-atl-ii-l', 0, false], ['sv-plt-20-c', 0, false], ['sv-plt-05-sig-c', 8, false], ['sv-retouches-post-reprise', 8, false], ['sv-plt-05-ess-c', 12, true], ['sv-plt-10-m', 12, false], ['sv-atl-ii-l', 12, false]]
      .every(([id, sem, off]) => inclus.some((x) => x.serviceId === id && (x.afterWeeks ?? 0) === sem && (x.offert ?? false) === off)));
  dit('le Moment Signature n est pas touche par la migration du catalogue (sv-le-moment absent de 0194)', false, /update public\.catalog_services[\s\S]*sv-le-moment'/.test(sql.replace(/sv-le-moment-cuir-chevelu/g, '')) || /where id = 'sv-le-moment'/.test(sql));
  const sig: ServiceLu = { id: 'sv-le-moment', name: 'Le Moment Signature', includes: [{ serviceId: 's-a' }, { serviceId: 's-b' }] };
  const ent: ServiceLu = { id: 'sv-venue-gbeji-sig', name: 'GBEJI Signature', includes: [{ serviceId: 's-a' }] };
  dit('Moment Signature : la venue 1 est le Moment complet, les suivantes ce que leur service pose (la venue d entretien)', [['Lavage KLOKLO Signature', 'Reprise SINSIN Signature'], ['Lavage KLOKLO Signature'], ['Lavage KLOKLO Signature']],
    detailParVenue(['sv-le-moment', 'sv-venue-gbeji-sig', 'sv-venue-gbeji-sig'], [sig, ent, ...catalogue]).map((v) => v.lignes.map((l) => l.nom)));
  dit('une venue sans service lu donne un detail vide (la liste ne casse pas)', 0, detailParVenue([undefined], catalogue)[0].lignes.length);
}

/* ══ 13. LA MIGRATION DU CAS REEL (0195, non appliquee) ══ */
{
  const sql = lis('supabase/migrations/0195_le_cas_reel_quatre_venues.sql');
  dit('0195 : les identifiants, le plan, les quatre parts de 45 000 F, 180 000 F et le plafond', [true, true, true, true],
    [/plan constant text := 'mt-31z2t1q7v9'/.test(sql) && /r1 constant text := 'koxsmtq7v9'/.test(sql) && /r3 constant text := 'xxj05gq7va'/.test(sql) && /r4 constant text := '7e88n4q7va'/.test(sql),
      /tiers jsonb := '\[45000,45000,45000,45000\]'/.test(sql), /total constant int := 180000/.test(sql), /'plafondParVenueXof', part/.test(sql)]);
  dit('0195 : refuse si un versement ou une facture existe, si le plan n est pas dans l etat attendu, si la place du maitre est prise', [true, true, true, true],
    [/raise exception '0195 : un des trois rendez-vous porte deja un versement|raise exception '0195 : un des trois rendez-vous porte déjà un versement/.test(sql), /'\[42000,42000,42000\]'::jsonb/.test(sql), /la place du maître est prise/.test(sql), /une plage est bloquée/.test(sql) && /nullif\(x\.data->>'invoiceId', ''\) is not null\)/.test(sql) && /i\.data->>'apptId' in \(r1, r3, r4\)/.test(sql)]);
  dit('0195 : le 4e rendez-vous du 19 decembre 2026 a 11 h, rang 2 ; les rangs 3 et 4 pour le 16 janvier et le 13 fevrier 2027 ; les services du Moment cuir chevelu', [true, true],
    [/'2026-12-19'/.test(sql) && /array\['11:00', '11:00', '12:30', '11:00'\]/.test(sql) && /'rang', 2/.test(sql) && /'rang', 3/.test(sql) && /'rang', 4/.test(sql),
      (sql.match(/'serviceIds', a1\.data->'serviceIds'/g) ?? []).length === 3]);
  dit('0195 : copie de repli avec RLS, rejouable, aucune remise ni encaissement ecrits (rien sur payments / paidXof / invoiceId)', [true, true, true, false],
    [/repli_0195_appointments enable row level security/.test(sql), /déjà passée, rien à faire/.test(sql), /on conflict \(id\) do nothing/.test(sql), /jsonb_build_object\([^)]*'(payments|paidXof|invoiceId)'/.test(sql)]);
}

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
process.exit(ko ? 1 : 0);
