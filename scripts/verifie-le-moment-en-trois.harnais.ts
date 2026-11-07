/* LE MOMENT EN TROIS VENUES, ÉPROUVÉ · 7 novembre 2026.
   `node scripts/verifie-le-moment-en-trois.mjs` (et `--prouve`).

   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Chaque attente est écrite à la main, d'après la règle, jamais tirée
   du code éprouvé. Têtes, montants et pièces INVENTÉS (initiales seulement).
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  ARRONDI_DU_TIERS_XOF, SERVICE_LE_MOMENT, VENUE_ESSENTIEL, VENUE_SIGNATURE, argentDeLaVenue, contientLeMoment, datesDuPlanValides,
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
    [/venuesDuMoment\.some\(\(v\) => !v\.date \|\| !v\.time\)/.test(rdvSrc), /datesDuPlanValides\(dates\)/.test(rdvSrc), /\[0, 1\]\.map\(\(i\) => raisonDeLaVenue\(i\)\)\.find\(\(r\) => r\?\.bloque\)/.test(rdvSrc)]);
  dit('les trois rendez-vous se posent d un seul geste (poseUnRendezVous, suites), le premier est le Moment', [true, true],
    [/suites\.push\(\.\.\.suitesDuMoment\);/.test(rdvSrc) && /suites: \[\.\.\.suites, \.\.\.desCompagnes\],/.test(rdvSrc), /serviceIds: \[venueDEntretien\]/.test(rdvSrc)]);
  dit('JAMAIS DE REMISE sur le Moment en trois : remises de ligne, code, mercredi, famille, acompte tous ecartes ; le prix de chaque venue est son tiers', [true, true, true],
    [/remisesLignes: undefined, codeOffre: undefined, offreId: undefined, horsOffreDuJour: true,\s*\n\s*discountPct: undefined, discountXof: undefined, remiseFamille: undefined, remiseFamilleXof: undefined/.test(rdvSrc),
      /priceXof: tiersDuMomentIci\[0\]/.test(rdvSrc), /priceXof: tiersDuMomentIci\[rang - 1\]/.test(rdvSrc)]);
  dit('le tiers est le forfait du rendez-vous et chaque venue porte son plan (momentEnTrois)', [true, true],
    [/momentEnTrois: plan\(1\), forfait: forfaitDuTiers\(plan\(1\), jour\)/.test(rdvSrc), /momentEnTrois: plan\(rang\), forfait: forfaitDuTiers\(plan\(rang\), jour\)/.test(rdvSrc)]);
  dit('en trois venues, les seances « +8 et +12 semaines » du Moment ne se posent pas en plus (jamais deux fois la meme venue)', true, /inc\.afterWeeks <= 0 \|\| enTrois\) continue;/.test(rdvSrc));
  dit('le seul Moment, seul, sur un rendez-vous neuf, hors forfait pose a la main, hors formule', true,
    /const leMomentSeul = !appt && serviceIds\.length === 1 && contientLeMoment\(serviceIds\) && !effCovered;/.test(rdvSrc) && /leMomentSeul && !forfaitPose \? tiersDuMoment\(totalDuMoment\)/.test(rdvSrc));
  dit('l ecran « pose » propose d encaisser le premier tiers', true, /poseLe\.momentEnTrois && onEncaisser/.test(rdvSrc) && /phraseEncaisserLeTiers\(appelDe\(rdvClient, undefined\), tiersAEncaisser\(poseLe\)\)/.test(rdvSrc));
  dit('a l encaissement : le bouton dit « Encaisser le tiers de <appel> : X F » (le montant de la modale, jamais le total)', true,
    /appt\.momentEnTrois && totalGamme <= 0 && fullyPaid\s*\n?\s*\? phraseEncaisserLeTiers\(appelDe\(payerClient \?\? client, appt\.clientName\), settleTotal\)/.test(caisse));
  dit('la piece du tiers : une ligne au montant du tiers, aucune note « au lieu de » (aucune remise ne se lit)', [true, true],
    [/if \(appt\.momentEnTrois\) return \[ligneFacture\(nomForfait \|\| apptLabel\(appt, byId\), net\)\];/.test(caisse), /\(appt\.momentEnTrois \? nomForfait : `\$\{nomForfait\}/.test(caisse)]);
  dit('Ma Couronne : le toucher ne porte que l identifiant du rendez-vous (le montant est relu au SERVEUR par la page « Regler »), le bouton attend la base et porte son montant',
    [true, true, true, false], [/toucher\.regle\(rdv\.id\)/.test(couronne), /resteDAvanceConfirme\(rdv\.id,/.test(couronne), /cible && rdv && duBase !== null/.test(couronne), /regle\([^)]*,[^)]*\)/.test(couronne.replace(/useLeToucher\([^)]*\)/g, ''))]);
  dit('Ma Couronne : « Terminer et regler » le jour de la venue ne passe pas par ce bouton (la carte du rituel en cours regle le tiers du jour)', true, /quand !== 'jour-meme'/.test(couronne));
  dit('Ma Couronne : « Votre Moment · en trois venues » et « Regler le tiers du <jour> », montes dans Mes rendez-vous', [true, true, true],
    [/Votre Moment · en trois venues/.test(couronne), /Régler le tiers du \{jour\}/.test(couronne), /<MomentEnTrois clientId=\{releve\.clientId\} \/>/.test(tab)]);
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

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nTout tient (${n} controles).`);
process.exit(ko ? 1 : 0);
