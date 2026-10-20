/* LE RELEVÉ DE L'ABONNÉE, ÉPROUVÉ — `node scripts/verifie-le-releve-de-l-abonnee.mjs`.

   Le juge unique (`src/shared/abonnee-pur.ts`) tient les douze décisions du
   20 octobre 2026, les six points de la maquette L0 et ce que Yéman a tranché
   au sélecteur. Chaque épreuve porte la RÈGLE telle qu'elle a été dite, jamais
   ce que le code en fait : une attente tirée du code s'accorde toujours.

   Le scénario est celui de la maquette : Akouavi, GBÈJÍ™ · Carnet de Six en
   Mini, 140 000 F en 2 × 70 000 F (2 octobre et 1er novembre 2026), fin le
   29 juin 2027 ; faites le 6 et le 16 octobre 2026, réservée le 3 novembre
   2026 à 10 h ; Nadia, 9 ans, tête portée. Tout est inventé.

   Sortie ASCII : la console de Windows ne connaît pas les accents. */
import {
  releveDeLAbonnee, etatDeLaSeance, compteLaSeance, contratDeLaSeance, dansLaVie, inclusALaDate,
  contratPourLaDate as contratPourLaDatePur, versementsDuContrat, argentDuContrat, formuleProposeePourReserver,
  peutAcheterLaFormule, prixPourLaTete, echeancierApresPrixRevu, prochaineIsoApresReglement, jourOuvre,
  jourDitAvecLAnnee, francs, luneDeLaDate, REGLES_DE_LA_MAISON,
  type ContratLu, type SeanceLue, type EntreeDuReleve, type ReleveDeLAbonnee, type Alerte,
} from '../src/shared/abonnee-pur';
import {
  coversSub, dansLaVieDuContrat, inclusVendus, contratPourLaDate, type Plan,
} from '../src/shared/abonnements';
import { decaleLeJour } from '../src/shared/ia-faits-pur';
import type { Invoice } from '../src/shared/finance';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* ── LES FORMULES (les fiches de formules-en-lunes-pur, réduites) ── */
const GBEJI = 'sv-venue-gbeji-ess';
const plan = (o: Partial<Plan>): Plan => ({ tag: '', line: '', perks: [], popular: false, ...o } as Plan);
const SIX = plan({ id: 'pl-lune-six', name: 'GBÈJÍ™ · Carnet de Six', mode: 'pack', validityDays: 270, priceXof: 140000, included: [{ serviceId: GBEJI, qty: 6 }] });
const QUATRE = plan({ id: 'pl-lune-quatre', name: 'GBÈJÍ™ · Carnet de Quatre', mode: 'pack', validityDays: 180, priceXof: 84000, included: [{ serviceId: GBEJI, qty: 4 }], uneFoisParTete: 'carnet-de-quatre' });
const LUNE = plan({ id: 'pl-lune-gbeji', name: 'GBÈJÍ™ · Chaque Lune', mode: 'cycle', priceXof: 37500, included: [{ serviceId: GBEJI, qty: 1 }], soinsDeLaLune: ['sv-plt-10-m', 'sv-plt-30-c', 'sv-plt-20-c'] });
const PREMIERES = plan({ id: 'pl-lune-premieres', name: 'VÈKPÈ™ · Les Premières Lunes', mode: 'pack', validityDays: 210, priceXof: 84000, included: [{ serviceId: GBEJI, qty: 4 }], uneFoisParTete: 'premieres-lunes' });
const FERMEE = plan({ id: 'pl-ancienne', name: 'Le Carnet des Six', mode: 'pack', priceXof: 125000, included: [{ serviceId: GBEJI, qty: 6 }], fermee: true });
const PLANS = [SIX, QUATRE, LUNE, PREMIERES, FERMEE];

const AK = 'cl-ak';
const NA = 'cl-na';
const ECH = [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }];
const contrat = (o: Partial<ContratLu>): ContratLu => ({
  id: 'abo-14', branchId: 'b1', clientId: AK, name: 'A. K.', planId: SIX.id, slot: '', since: '', status: 'active', mrrXof: 0,
  reference: 'ABO-2026-014', sinceIso: '2026-10-02', startIso: '2026-10-02', expiresIso: '2027-06-29',
  priceXof: 140000, prixConvenuXof: 140000, calibreVendu: 'cal-mini', nextIso: '2026-11-01',
  echeances: ECH.map((x) => ({ ...x })), payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02', method: 'KkiaPay' }],
  ...o,
} as ContratLu);
const seance = (o: Partial<SeanceLue>): SeanceLue => ({
  id: 'a', branchId: 'b1', clientId: AK, serviceIds: [GBEJI], date: '2026-10-06', time: '10:00', master: 'm',
  status: 'honoré', coveredBySub: true, coverKind: 'abonnement', subId: 'abo-14', ...o,
} as SeanceLue);
const A1 = seance({ id: 'a1', date: '2026-10-06' });
const A2 = seance({ id: 'a2', date: '2026-10-16' });
const A3 = seance({ id: 'a3', date: '2026-11-03', status: 'confirmé' });
const entree = (o: Partial<EntreeDuReleve>): EntreeDuReleve =>
  ({ jour: '2026-10-20', clientId: AK, subs: [contrat({})], plans: PLANS, appts: [A1, A2, A3], invoices: [], ...o });
const releve = (o: Partial<EntreeDuReleve> = {}): ReleveDeLAbonnee => releveDeLAbonnee(entree(o));
const leContrat = (r: ReleveDeLAbonnee, id = 'abo-14') => [...r.contrats, ...r.anciens].find((c) => c.sub.id === id);
const ligneDe = (r: ReleveDeLAbonnee, id = 'abo-14', sv = GBEJI) => {
  const l = leContrat(r, id)?.seances.find((x) => x.serviceId === sv);
  return l && { incluses: l.incluses, faites: l.faites, reservees: l.reservees, manquees: l.manquees, disponibles: l.disponibles };
};
const toutesLesAlertes: Alerte[] = [];
const garde = (r: ReleveDeLAbonnee) => { toutesLesAlertes.push(...r.alertes); return r; };

/* ── 0. LE CALENDRIER DU SCÉNARIO (des faits, pas des règles) ── */
dit('le 1er novembre 2026 est un dimanche : il se juge le lundi 2', '2026-11-02', jourOuvre('2026-11-01'));
dit('un lundi reste un lundi', '2026-11-02', jourOuvre('2026-11-02'));
dit('signee le 2 octobre 2026, valable 270 jours : fin le 29 juin 2027', '2027-06-29', decaleLeJour('2026-10-02', 270));
dit('les dates se disent avec leur annee, 1er compris', 'dimanche 1er novembre 2026', jourDitAvecLAnnee('2026-11-01'));
dit('les francs se disent avec des espaces insecables', '70 000 F', francs(70000));

/* ── 1. A JOUR : faites, reservees, disponibles, distinctes (decision 1) ── */
{
  const r = garde(releve());
  const c = leContrat(r);
  dit('a jour : la formule est en cours', 'en-cours', c?.etat);
  dit('a jour : 2 faites, 1 reservee, 3 disponibles sur 6', { incluses: 6, faites: 2, reservees: 1, manquees: 0, disponibles: 3 }, ligneDe(r));
  dit('la reservee du 3 novembre 2026 est la seance 3 sur 6', { rang: 3, total: 6 },
    (({ rang, total }) => ({ rang, total }))(c!.attribuees.find((s) => s.id === 'a3')!));
  dit('la fin dite est la fin vendue', '2027-06-29', c?.finIso);
  dit('a jour : regle 70 000, rien a regler aujourd hui, rien en retard', { regle: 70000, aRegler: 0, retard: 0, reste: 70000 },
    { regle: c!.argent.regleXof, aRegler: c!.argent.aRegleAujourdhuiXof, retard: c!.argent.enRetardXof, reste: c!.argent.resteXof });
  dit('la 1re echeance est reglee le 2 octobre 2026', { statut: 'reglee', regleeLe: '2026-10-02' },
    { statut: c!.argent.echeances[0].statut, regleeLe: c!.argent.echeances[0].regleeLe });
  dit('la 2e echeance, ecrite un dimanche, se juge le lundi 2 novembre 2026',
    { dueEcriteIso: '2026-11-01', dueIso: '2026-11-02', statut: 'a-venir' },
    { dueEcriteIso: c!.argent.echeances[1].dueEcriteIso, dueIso: c!.argent.echeances[1].dueIso, statut: c!.argent.echeances[1].statut });
  dit('a venir : 70 000 F le lundi 2 novembre 2026', [{ dueIso: '2026-11-02', montantXof: 70000, numero: 2, genre: 'echeance' }], c?.argent.aVenir);
  dit('a jour : aucune alerte', undefined, r.alerte);
  dit('a jour : elle peut reserver une seance incluse et acheter', { inc: true, ach: true },
    { inc: r.porte.peutReserverIncluse, ach: r.porte.peutAcheter });
  dit('le solde : trois chiffres separes', { aRegler: 0, aVenir: 70000, avoir: 0 },
    { aRegler: r.solde.aRegleAujourdhuiXof, aVenir: r.solde.aVenirXof, avoir: r.solde.avoirXof });
}

/* ── 2. LE JOUR MEME : « a regler aujourd hui », jamais en retard ── */
{
  const dimanche = garde(releve({ jour: '2026-11-01' }));
  dit('le dimanche 1er novembre 2026, rien n est du (porte close)', 0, leContrat(dimanche)?.argent.aRegleAujourdhuiXof);
  const lundi = garde(releve({ jour: '2026-11-02' }));
  const c = leContrat(lundi);
  dit('le lundi 2 novembre 2026 : 70 000 F a regler aujourd hui, rien en retard', { aRegler: 70000, retard: 0, statut: 'a-regler-aujourdhui' },
    { aRegler: c!.argent.aRegleAujourdhuiXof, retard: c!.argent.enRetardXof, statut: c!.argent.echeances[1].statut });
  dit('l alerte du jour dit « a regler aujourd hui »', 'a-regler', lundi.alerte?.genre);
  dit('le solde le dit a regler aujourd hui, dont 0 en retard', { a: 70000, r: 0 },
    { a: lundi.solde.aRegleAujourdhuiXof, r: lundi.solde.dontEnRetardXof });
}

/* ── 3. LE RETARD COMMENCE LE LENDEMAIN ; LA PORTE TIENT LA GRACE (point 1) ── */
{
  const r = garde(releve({ jour: '2026-11-03' }));
  const c = leContrat(r);
  dit('le 3 novembre 2026 : 70 000 F en retard depuis 1 jour', { retard: 70000, jours: 1 },
    { retard: c!.argent.enRetardXof, jours: c!.argent.retardJours });
  dit('le retard passe en tete de l accueil', 'retard', r.alerte?.genre);
  dit('dans la grace, la reservation d une incluse reste ouverte', true, r.porte.peutReserverIncluse);
  dit('le jour de la seance, elle reste confirmee (pas a cloturer)', 'confirmee', c!.attribuees.find((s) => s.id === 'a3')?.etat);
  const r9 = releve({ jour: '2026-11-09' });
  dit('7 jours de retard : encore ouverte', true, r9.porte.peutReserverIncluse);
  const r10 = garde(releve({ jour: '2026-11-10' }));
  dit('8 jours de retard : la porte se ferme, et dit pourquoi', { ouverte: false, raison: 'retard' },
    { ouverte: r10.porte.peutReserverIncluse, raison: r10.porte.raison });
  const c10 = leContrat(r10);
  dit('une seance passee restee confirmee se lit « a cloturer », jamais faite', 'a-cloturer', c10!.attribuees.find((s) => s.id === 'a3')?.etat);
  dit('… et garde son credit parmi les reservees', { faites: 2, reservees: 1 }, (({ faites, reservees }) => ({ faites, reservees }))(ligneDe(r10)!));
  const paye = releve({ jour: '2026-11-03', subs: [contrat({ payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 70000, date: '2026-11-02' }] })] });
  dit('reglee le 2 novembre 2026 : plus rien du, l echeance dit sa date', { reste: 0, regleeLe: '2026-11-02', alerte: undefined },
    { reste: leContrat(paye)!.argent.resteXof, regleeLe: leContrat(paye)!.argent.echeances[1].regleeLe, alerte: paye.alerte });
}

/* ── 4. CHAQUE LUNE : reglee avant la lune, en pause sans dette (decision 5) ── */
{
  const lune = (o: Partial<ContratLu> = {}) => contrat({
    id: 'abo-l', planId: LUNE.id, reference: 'ABO-2026-020', startIso: undefined, expiresIso: null, priceXof: undefined,
    prixConvenuXof: 37500, echeances: undefined, nextIso: '2026-11-01', payments: [{ id: 'l1', amountXof: 37500, date: '2026-10-02' }], ...o,
  });
  const B1 = seance({ id: 'b1', subId: 'abo-l', date: '2026-10-09' });
  const r = garde(releve({ subs: [lune()], appts: [B1] }));
  const c = leContrat(r, 'abo-l');
  dit('en cours de lune : du 2 octobre 2026 au 1er novembre 2026', { du: '2026-10-02', au: '2026-11-01' }, c && { du: c.lune?.du, au: c.lune?.au });
  dit('la venue de la lune est faite, plus de venue disponible cette lune', { faites: 1, disponibles: 0 },
    (({ faites, disponibles }) => ({ faites, disponibles }))(ligneDe(r, 'abo-l')!));
  dit('la prochaine lune s annonce a venir, sans dette', { aRegler: 0, aVenir: [{ dueIso: '2026-11-02', montantXof: 37500, genre: 'lune' }] },
    { aRegler: c!.argent.aRegleAujourdhuiXof, aVenir: c!.argent.aVenir });
  const dim = releve({ jour: '2026-11-01', subs: [lune()], appts: [B1] });
  dit('l echeance ecrite un dimanche ne met pas en pause ce dimanche', 'en-cours', leContrat(dim, 'abo-l')?.etat);
  const p = garde(releve({ jour: '2026-11-02', subs: [lune()], appts: [B1] }));
  const cp = leContrat(p, 'abo-l');
  dit('non reglee : en pause le jour de l echeance (le lundi)', { etat: 'en-pause', depuis: '2026-11-02' },
    { etat: cp?.etat, depuis: cp?.pause?.genre === 'lune' ? cp.pause.depuisIso : null });
  dit('en pause : jamais de dette, la lune se regle pour rouvrir', { aRegler: 0, solde: 0, luneARegler: { depuisIso: '2026-11-02', montantXof: 37500 } },
    { aRegler: cp!.argent.aRegleAujourdhuiXof, solde: p.solde.aRegleAujourdhuiXof, luneARegler: cp!.argent.luneARegler });
  dit('en pause : pas de seance incluse, et l accueil le dit', { porte: false, raison: 'pause', alerte: 'pause' },
    { porte: p.porte.peutReserverIncluse, raison: p.porte.raison, alerte: p.alerte?.genre });
  const mardi = releve({ jour: '2026-11-03', subs: [lune({ nextIso: '2026-11-03' })], appts: [B1] });
  dit('une echeance en semaine met en pause le jour meme (point 2)', 'en-pause', leContrat(mardi, 'abo-l')?.etat);
  const veille = releve({ jour: '2026-11-02', subs: [lune({ nextIso: '2026-11-03' })], appts: [B1] });
  dit('… et pas la veille', 'en-cours', leContrat(veille, 'abo-l')?.etat);
  dit('reglee en pause le 5 novembre 2026 : la lune court du 5 novembre au 5 decembre 2026', '2026-12-05',
    prochaineIsoApresReglement(lune(), '2026-11-05'));
  dit('reglee d avance le 28 octobre 2026 : elle prolonge la lune en cours', '2026-12-01',
    prochaineIsoApresReglement(lune(), '2026-10-28'));
  const avance = releve({ subs: [lune({ nextIso: '2026-12-01', payments: [{ id: 'l1', amountXof: 37500, date: '2026-10-02' }, { id: 'l2', amountXof: 37500, date: '2026-10-18' }] })], appts: [B1] });
  dit('reglee d avance, la lune du jour reste celle d octobre 2026 et sa venue compte', { du: '2026-10-02', faites: 1 },
    { du: leContrat(avance, 'abo-l')?.lune?.du, faites: ligneDe(avance, 'abo-l')?.faites });
  dit('(l ancien juge la perdait : coversSub prend la lune de l echeance)', false,
    coversSub(B1, lune({ nextIso: '2026-12-01' }), LUNE));
  dit('la lune d une date se compte depuis l echeance', { du: '2026-11-01', au: '2026-12-01' }, luneDeLaDate(lune(), '2026-11-15'));
}

/* ── 5. LA RETENUE : 7 jours, le dimanche passe au lundi, puis effacee (decision 7) ── */
{
  const ret = (o: Partial<ContratLu> = {}) => contrat({
    id: 'abo-r', origine: 'couronne', reference: 'ABO-2026-031', sinceIso: '2026-10-18', startIso: '2026-10-18', expiresIso: '2027-07-15',
    payments: [], echeances: [{ numero: 1, dueIso: '2026-10-18', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-17', amountXof: 70000 }], ...o,
  });
  const r = garde(releve({ subs: [ret()], appts: [] }));
  const c = leContrat(r, 'abo-r');
  dit('prise en ligne le dimanche 18 octobre 2026, non reglee : retenue', 'retenue', c?.etat);
  dit('7 jours : le dimanche 25 octobre 2026 passe au lundi 26', '2026-10-26', c?.retenueJusquau);
  dit('retenue : rien n est du, ni aujourd hui ni a venir', { aRegler: 0, retard: 0, soldeA: 0, soldeV: 0 },
    { aRegler: c!.argent.aRegleAujourdhuiXof, retard: c!.argent.enRetardXof, soldeA: r.solde.aRegleAujourdhuiXof, soldeV: r.solde.aVenirXof });
  dit('retenue : 70 000 F l ouvrent, avant le lundi 26 octobre 2026', { montantXof: 70000, avantIso: '2026-10-26' }, c?.argent.pourOuvrir);
  dit('retenue : aucune seance incluse avant le 1er reglement', { porte: false, raison: 'retenue' },
    { porte: r.porte.peutReserverIncluse, raison: r.porte.raison });
  dit('retenue : l accueil le dit', 'retenue', r.alerte?.genre);
  dit('le lundi 26 octobre 2026, encore retenue', 'retenue', leContrat(releve({ jour: '2026-10-26', subs: [ret()], appts: [] }), 'abo-r')?.etat);
  const ef = releve({ jour: '2026-10-27', subs: [ret()], appts: [] });
  dit('le lendemain, elle s efface, et rien n est du', { etat: 'effacee', le: '2026-10-27', courent: 0, solde: 0 },
    { etat: leContrat(ef, 'abo-r')?.etat, le: leContrat(ef, 'abo-r')?.effaceeLe, courent: ef.contrats.length, solde: ef.solde.aRegleAujourdhuiXof + ef.solde.aVenirXof });
  dit('prise un lundi, 7 jours pile : le lundi suivant', '2026-10-26',
    leContrat(releve({ subs: [ret({ sinceIso: '2026-10-19', startIso: '2026-10-19' })], appts: [] }), 'abo-r')?.retenueJusquau);
  const ren = releve({ jour: '2026-10-22', subs: [ret({ renonceeLe: '2026-10-21' })], appts: [] });
  dit('« Renoncer » l efface le jour meme', { etat: 'effacee', le: '2026-10-21' },
    { etat: leContrat(ren, 'abo-r')?.etat, le: leContrat(ren, 'abo-r')?.effaceeLe });
  const ouverte = releve({ subs: [ret({ payments: [{ id: 'k1', amountXof: 70000, date: '2026-10-19' }] })], appts: [] });
  dit('reglee une fois : elle est ouverte, la 2e echeance a venir', { etat: 'en-cours', aVenir: 70000 },
    { etat: leContrat(ouverte, 'abo-r')?.etat, aVenir: ouverte.solde.aVenirXof });
  const prem = releve({ jour: '2026-11-20', subs: [ret({ planId: PREMIERES.id })], appts: [] });
  dit('une retenue effacee ne ferme pas « une fois par tete »', { ok: true }, peutAcheterLaFormule(PREMIERES, prem, PLANS));
}

/* ── 6. EPUISEE : 6 comptees (5 faites, 1 manquee), la place se libere (decision 4) ── */
{
  const dates = ['2026-10-06', '2026-10-16', '2026-10-30', '2026-11-13', '2026-11-27'];
  const faites = dates.map((d, i) => seance({ id: `e${i}`, date: d }));
  const manquee = seance({ id: 'e5', date: '2026-12-11', time: '10:00', status: 'annulé', annuleeLe: '2026-12-10T18:00:00+01:00', annuleePar: 'cliente' });
  const sub = contrat({ payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 70000, date: '2026-11-02' }] });
  const r = garde(releve({ jour: '2026-12-15', subs: [sub], appts: [...faites, manquee] }));
  dit('6 comptees sur 6 : epuisee', 'epuisee', leContrat(r)?.etat);
  dit('… 5 faites et 1 manquee, 0 disponible', { incluses: 6, faites: 5, reservees: 0, manquees: 1, disponibles: 0 }, ligneDe(r));
  dit('epuisee : plus d incluse, mais l achat reste ouvert', { inc: false, raison: 'epuisee', ach: true },
    { inc: r.porte.peutReserverIncluse, raison: r.porte.raison, ach: r.porte.peutAcheter });
  dit('le meme Carnet de Six peut se reprendre', { ok: true }, peutAcheterLaFormule(SIX, r, PLANS));
  const deplace = formuleProposeePourReserver(r, GBEJI, '2026-12-20', 'e4');
  dit('deplacer la derniere seance d un paquet epuise reste possible', 'abo-14', deplace.proposee?.sub.id);
}

/* ── 7. TERMINEE : le dernier jour vendu en fait partie ; finir ne solde rien ── */
{
  dit('le 29 juin 2027, dernier jour vendu : encore en cours', 'en-cours', leContrat(releve({ jour: '2027-06-29' }))?.etat);
  const r = garde(releve({ jour: '2027-06-30' }));
  dit('le 30 juin 2027 : terminee, rangee avec les anciennes', { etat: 'terminee', courent: 0 }, { etat: leContrat(r)?.etat, courent: r.contrats.length });
  dit('terminee avec une echeance impayee : elle reste due, et l accueil le dit', { aRegler: 70000, alerte: 'retard' },
    { aRegler: r.solde.aRegleAujourdhuiXof, alerte: r.alerte?.genre });
}

/* ── 8. SANS FORMULE ── */
{
  const r = releve({ subs: [], appts: [] });
  dit('sans formule : rien a reserver en incluse, tout a acheter', { c: 0, inc: false, ach: true, raison: 'sans', alerte: undefined, solde: 0 },
    { c: r.contrats.length, inc: r.porte.peutReserverIncluse, ach: r.porte.peutAcheter, raison: r.porte.raison, alerte: r.alerte, solde: r.solde.aRegleAujourdhuiXof + r.solde.aVenirXof + r.solde.avoirXof });
}

/* ── 9. LA TETE PORTEE ET LE FOYER (decision 12) ── */
{
  const nadia = contrat({ id: 'abo-21', clientId: NA, reference: 'ABO-2026-021', prixConvenuXof: 126000, priceXof: 126000,
    echeances: [{ numero: 1, dueIso: '2026-10-03', amountXof: 63000 }, { numero: 2, dueIso: '2026-11-02', amountXof: 63000 }],
    payments: [{ id: 'n1', amountXof: 63000, date: '2026-10-03' }] });
  const N1 = seance({ id: 'n-1', clientId: NA, subId: 'abo-21', date: '2026-10-10' });
  const subs = [contrat({}), nadia];
  const appts = [A1, A2, A3, N1];
  const ra = releve({ subs, appts });
  const rn = garde(releve({ subs, appts, clientId: NA }));
  dit('le releve d Akouavi ne porte que ses formules', ['abo-14'], ra.contrats.map((c) => c.sub.id));
  dit('le releve de Nadia ne porte que les siennes et ses seances', { ids: ['abo-21'], faites: 1, disponibles: 5 },
    { ids: rn.contrats.map((c) => c.sub.id), faites: ligneDe(rn, 'abo-21')?.faites, disponibles: ligneDe(rn, 'abo-21')?.disponibles });
  dit('Foyer, 2e tete : 140 000 F devient 126 000 F (le plafond de 25 % sous la carte de 168 000 F)',
    { prixXof: 126000, foyerXof: 14000, foyerJoue: true, plafonne: true },
    prixPourLaTete({ prixTeteXof: 140000, valeurCarteXof: 168000, rangDansLeFoyer: 2 }));
  dit('Foyer, sans avantage propre : -15 % pleins', { prixXof: 127500, foyerXof: 22500, foyerJoue: true, plafonne: false },
    prixPourLaTete({ prixTeteXof: 150000, valeurCarteXof: 150000, rangDansLeFoyer: 2 }));
  dit('Foyer : la 3e tete aussi', true, prixPourLaTete({ prixTeteXof: 150000, valeurCarteXof: 150000, rangDansLeFoyer: 3 }).foyerJoue);
  dit('Foyer : ni la 1re ni la 4e', [false, false],
    [1, 4].map((rang) => prixPourLaTete({ prixTeteXof: 150000, valeurCarteXof: 150000, rangDansLeFoyer: rang }).foyerJoue));
  dit('Foyer : deja a 25 % sous la carte, il n ajoute rien', 0,
    prixPourLaTete({ prixTeteXof: 126000, valeurCarteXof: 168000, rangDansLeFoyer: 2 }).foyerXof);
}

/* ── 10. LE PRIX REVU APRES LE COMPTAGE (decision 10) ── */
{
  const plus = echeancierApresPrixRevu(contrat({}), SIX, [], 190000, '2026-10-27');
  dit('plus cher : l ecart de 50 000 F va sur la prochaine echeance', { e: [70000, 120000], sur: 2, nouvelle: undefined, avoir: 0 },
    { e: plus.echeances.map((x) => x.amountXof), sur: plus.porteeSur, nouvelle: plus.nouvelle, avoir: plus.avoirXof });
  const solde = contrat({ payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 70000, date: '2026-10-20' }] });
  const neuve = echeancierApresPrixRevu(solde, SIX, [], 190000, '2026-10-27');
  dit('plus cher, plus rien a payer : une echeance neuve a 30 jours', { numero: 3, dueIso: '2026-11-26', amountXof: 50000 }, neuve.nouvelle);
  dit('… et l echeancier vaut le nouveau prix', 190000, neuve.echeances.reduce((s, x) => s + x.amountXof, 0));
  dit('l echeance neuve qui tomberait un dimanche passe au lundi', '2026-11-30',
    echeancierApresPrixRevu(solde, SIX, [], 190000, '2026-10-30').nouvelle?.dueIso);
  const moins = echeancierApresPrixRevu(contrat({}), SIX, [], 120000, '2026-10-27');
  dit('en sa faveur : l ecart se retranche de la prochaine', { e: [70000, 50000], sur: 2, avoir: 0 },
    { e: moins.echeances.map((x) => x.amountXof), sur: moins.porteeSur, avoir: moins.avoirXof });
  const loin = echeancierApresPrixRevu(contrat({}), SIX, [], 60000, '2026-10-27');
  dit('en sa faveur au-dela de la prochaine : le reste en avoir', { e: [60000], avoir: 10000 },
    { e: loin.echeances.map((x) => x.amountXof), avoir: loin.avoirXof });
  const tout = echeancierApresPrixRevu(solde, SIX, [], 120000, '2026-10-27');
  dit('en sa faveur, tout deja regle : avoir de 20 000 F', 20000, tout.avoirXof);
  const r = releve({ jour: '2026-10-28', subs: [contrat({ prixConvenuXof: 60000, echeances: loin.echeances })] });
  dit('le releve lit l avoir sans le retrancher de rien', { avoir: 10000, aRegler: 0 },
    { avoir: r.solde.avoirXof, aRegler: r.solde.aRegleAujourdhuiXof });
  dit('un prix a 0 F se refuse', false, echeancierApresPrixRevu(contrat({}), SIX, [], 0, '2026-10-27').ok);
  const revu = contrat({ prixConvenuXof: 190000, echeances: plus.echeances, prixRevu: { le: '2026-10-27', ancienXof: 140000, nouveauXof: 190000, calibre: 'cal-micro' } });
  const ann = garde(releve({ jour: '2026-10-28', subs: [revu] }));
  dit('l ecart est annonce a l accueil', 'prix-revu', ann.alerte?.genre);
  dit('… et l echeance du lundi 2 novembre 2026 porte 120 000 F', 120000, leContrat(ann)?.argent.aVenir[0]?.montantXof);
  const tard = releve({ jour: '2026-11-11', subs: [{ ...revu, payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 120000, date: '2026-11-02' }] }] });
  dit('apres 14 jours, l annonce se tait', false, tard.alertes.some((a) => a.genre === 'prix-revu'));
}

/* ── 11. LA RESILIATION : avoir au prorata, arrondi au franc (decision 9) ── */
{
  const res = contrat({ status: 'churn', resilieeLe: '2026-10-20', motifDeResiliation: 'demenagement' });
  const r = garde(releve({ subs: [res] }));
  const c = leContrat(r);
  dit('resiliee le 20 octobre 2026 : rangee avec les anciennes', { etat: 'resiliee', courent: 0 }, { etat: c?.etat, courent: r.contrats.length });
  dit('prorata : 2 seances comptees sur 6, 46 667 F consommes, 23 333 F d avoir', { seances: 6, comptees: 2, consommeXof: 46667, avoirXof: 23333, resteXof: 0 },
    c && (({ seances, comptees, consommeXof, avoirXof, resteXof }) => ({ seances, comptees, consommeXof, avoirXof, resteXof }))(c.argent.prorata!));
  dit('la 2e echeance est annulee, rien a venir', { statut: 'annulee', aVenir: 0 }, { statut: c?.argent.echeances[1].statut, aVenir: r.solde.aVenirXof });
  dit('la seance du 3 novembre 2026 ne compte plus', { compte: false, pourquoi: 'apres-resiliation' },
    (({ compte, pourquoiPas }) => ({ compte, pourquoi: pourquoiPas }))(c!.attribuees.find((s) => s.id === 'a3')!));
  dit('le solde porte l avoir a part', { avoir: 23333, aRegler: 0 }, { avoir: r.solde.avoirXof, aRegler: r.solde.aRegleAujourdhuiXof });
  const quatre = [A1, A2, seance({ id: 'a7', date: '2026-10-23' }), seance({ id: 'a8', date: '2026-10-27' })];
  const plusQueRegle = garde(releve({ jour: '2026-10-30', subs: [contrat({ status: 'churn', resilieeLe: '2026-10-30' })], appts: quatre }));
  dit('consomme au-dela du regle : 23 333 F restent dus au jour de la resiliation', { reste: 23333, alerte: 'a-regler' },
    { reste: leContrat(plusQueRegle)?.argent.prorata?.resteXof, alerte: plusQueRegle.alerte?.genre });
  const ancien = releve({ subs: [contrat({ status: 'churn' })] });
  dit('un churn d avant, sans date, ne reclame rien et ne rend rien', { aRegler: 0, aVenir: 0, avoir: 0, statut: 'annulee' },
    { aRegler: ancien.solde.aRegleAujourdhuiXof, aVenir: ancien.solde.aVenirXof, avoir: ancien.solde.avoirXof, statut: leContrat(ancien)?.argent.echeances[1].statut });
  const deux = garde(releve({ jour: '2026-11-03', subs: [res, contrat({ id: 'abo-30', reference: 'ABO-2026-030' })], appts: [A1, A2] }));
  dit('un avoir n est jamais retranche en silence de ce qui est du', { aRegler: 70000, avoir: 23333 },
    { aRegler: deux.solde.aRegleAujourdhuiXof, avoir: deux.solde.avoirXof });
}

/* ── 12. LA MANQUEE : moins de 24 h, ou absente (decision 3) ── */
{
  const avec = (o: Partial<SeanceLue>) => releve({ jour: '2026-11-04', appts: [A1, A2, { ...A3, ...o }] });
  const tard = avec({ status: 'annulé', annuleeLe: '2026-11-02T14:00:00+01:00', annuleePar: 'cliente' });
  dit('annulee 20 h avant : manquee, et comptee', { incluses: 6, faites: 2, reservees: 0, manquees: 1, disponibles: 3 }, ligneDe(tard));
  dit('… l etat le dit', 'manquee', leContrat(tard)?.attribuees.find((s) => s.id === 'a3')?.etat);
  dit('annulee 49 h avant : annulee, rendue a la formule', 4, ligneDe(avec({ status: 'annulé', annuleeLe: '2026-11-01T09:00:00+01:00', annuleePar: 'cliente' }))?.disponibles);
  dit('une heure sans fuseau est celle de Cotonou', 'manquee',
    etatDeLaSeance({ ...A3, status: 'annulé', annuleeLe: '2026-11-02T14:00:00', annuleePar: 'cliente' }, '2026-11-04'));
  dit('24 h pile : ce n est pas « moins de 24 h »', 'annulee',
    etatDeLaSeance({ ...A3, status: 'annulé', annuleeLe: '2026-11-02T10:00:00+01:00', annuleePar: 'cliente' }, '2026-11-04'));
  dit('une annulation de la Maison ne compte jamais', 'annulee',
    etatDeLaSeance({ ...A3, status: 'annulé', annuleeLe: '2026-11-03T08:00:00+01:00', annuleePar: 'maison' }, '2026-11-04'));
  dit('absente : manquee, et comptee', { etat: 'manquee', manquees: 1 },
    { etat: etatDeLaSeance({ ...A3, absente: { le: '2026-11-03' } }, '2026-11-04'), manquees: ligneDe(avec({ absente: { le: '2026-11-03' } }))?.manquees });
  dit('une annulation d avant, sans heure, ne compte pas', 'annulee', etatDeLaSeance({ ...A3, status: 'annulé' }, '2026-11-04'));
  const rendue = avec({ status: 'annulé', annuleeLe: '2026-11-02T14:00:00+01:00', annuleePar: 'cliente', rendue: { le: '2026-11-04', motif: 'enfant malade' } });
  const s = leContrat(rendue)!.attribuees.find((x) => x.id === 'a3')!;
  dit('« Rendre la seance » : elle reste manquee, ne compte plus, la formule la retrouve', { etat: 'manquee', rendue: true, compte: false, disponibles: 4 },
    { etat: s.etat, rendue: s.rendue, compte: s.compte, disponibles: ligneDe(rendue)?.disponibles });
}

/* ── 13. PROPOSEE PAR LA MAISON : comptee aussitot, rendue si refusee ── */
{
  const A4 = seance({ id: 'a4', date: '2026-11-17', status: 'en attente', proposeeLe: '2026-10-20T09:00:00+01:00' });
  const r = garde(releve({ appts: [A1, A2, A3, A4] }));
  dit('proposee : son etat', 'proposee', leContrat(r)?.attribuees.find((s) => s.id === 'a4')?.etat);
  dit('proposee : comptee aussitot parmi les reservees', { reservees: 2, disponibles: 2 },
    (({ reservees, disponibles }) => ({ reservees, disponibles }))(ligneDe(r)!));
  dit('proposee : l accueil demande de la confirmer', 'a-confirmer', r.alerte?.genre);
  const refus = releve({ appts: [A1, A2, A3, { ...A4, status: 'annulé', annuleeLe: '2026-11-17T08:00:00+01:00', annuleePar: 'cliente' }] });
  dit('refusee, meme 2 h avant : elle revient a la formule', 3, ligneDe(refus)?.disponibles);
  dit('acceptee : confirmee', 'confirmee',
    etatDeLaSeance({ ...A4, status: 'confirmé', confirmeeParLaClienteLe: '2026-10-21T10:00:00+01:00' }, '2026-10-21'));
}

/* ── 14. LA SUITE DE FORFAIT NE SE DECOMPTE PAS SUR LA FORMULE ── */
{
  const F1 = seance({ id: 'f1', date: '2026-10-10', coverKind: 'forfait', subId: undefined });
  const r = releve({ appts: [A1, A2, A3, F1] });
  dit('une suite de forfait ne prend aucun credit', { faites: 2, disponibles: 3, portee: false },
    { faites: ligneDe(r)?.faites, disponibles: ligneDe(r)?.disponibles, portee: leContrat(r)!.attribuees.some((s) => s.id === 'f1') });
  dit('(l ancien juge la comptait : coversSub ignore coverKind)', true, coversSub(F1, contrat({}), SIX));
}

/* ── 15. LE VERSE : contrat et piece reunis par identifiant (decision 6) ── */
{
  const piece = { id: 'inv-1', payments: [
    { id: 'v1', date: '2026-10-02', amountXof: 70000, method: 'KkiaPay' },
    { id: 'v9', date: '2026-10-15', amountXof: 30000, method: 'MND PAY' },
  ] } as unknown as Invoice;
  const sub = contrat({ invoiceId: 'inv-1' });
  const v = versementsDuContrat(sub, [piece]);
  dit('le meme versement aux deux endroits compte une fois, la piece seule compte aussi', { ids: ['v1', 'v9'], inscrit: ['les-deux', 'piece'], total: 100000 },
    { ids: v.map((x) => x.id), inscrit: v.map((x) => x.inscrit), total: v.reduce((s, x) => s + x.montantXof, 0) });
  const r = releve({ subs: [sub], invoices: [piece] });
  dit('… et le reste suit : 40 000 F sur la 2e echeance', { regle: 100000, reste: 40000, e2: 30000 },
    { regle: leContrat(r)!.argent.regleXof, reste: leContrat(r)!.argent.resteXof, e2: leContrat(r)!.argent.echeances[1].regleXof });
  const faux = { id: 'inv-1', payments: [{ id: 'v1', date: '2026-10-02', amountXof: 69000, method: 'KkiaPay' }] } as unknown as Invoice;
  dit('deux montants pour le meme identifiant : signale', true, versementsDuContrat(sub, [faux])[0].desaccord);
}

/* ── 16. LE STATUT 'exhausted' NE DECIDE PLUS RIEN ── */
{
  const ex = contrat({ status: 'exhausted' });
  const r = releve({ subs: [ex] });
  dit('exhausted avec 3 disponibles : en cours, la porte ouverte', { etat: 'en-cours', inc: true, ach: true },
    { etat: leContrat(r)?.etat, inc: r.porte.peutReserverIncluse, ach: r.porte.peutAcheter });
  const fini = releve({ jour: '2027-07-01', subs: [ex] });
  dit('exhausted dont la date est passee : terminee', 'terminee', leContrat(fini)?.etat);
}

/* ── 17. DEUX FORMULES EN MEME TEMPS (tranche au selecteur) ── */
{
  const quatre = (o: Partial<ContratLu> = {}) => contrat({
    id: 'abo-25', planId: QUATRE.id, reference: 'ABO-2026-025', sinceIso: '2026-10-10', startIso: '2026-10-10', expiresIso: '2027-04-08',
    priceXof: 84000, prixConvenuXof: 84000, echeances: undefined, payments: [{ id: 'q1', amountXof: 84000, date: '2026-10-10' }], ...o,
  });
  dit('(10 octobre 2026 + 180 jours = 8 avril 2027)', '2027-04-08', decaleLeJour('2026-10-10', 180));
  const subs = [contrat({}), quatre()];
  const r = garde(releve({ subs }));
  dit('deux formules courent ensemble, celle qui finit le plus tot d abord', ['abo-25', 'abo-14'], r.contrats.map((c) => c.sub.id));
  dit('une seance compte sur le contrat que nomme son subId, et lui seul', { six: 3, quatre: 4 },
    { six: ligneDe(r, 'abo-14')?.disponibles, quatre: ligneDe(r, 'abo-25')?.disponibles });
  const p = formuleProposeePourReserver(r, GBEJI, '2026-11-10');
  dit('a la reservation, celle qui finit le plus tot est proposee, l autre au choix', { proposee: 'abo-25', autres: ['abo-14'] },
    { proposee: p.proposee?.sub.id, autres: p.autres.map((c) => c.sub.id) });
  const Q = ['2026-10-12', '2026-10-26', '2026-11-09', '2026-11-23'].map((d, i) => seance({ id: `q${i}`, subId: 'abo-25', date: d }));
  const sixPaye = contrat({ payments: [{ id: 'v1', amountXof: 70000, date: '2026-10-02' }, { id: 'v2', amountXof: 70000, date: '2026-11-02' }] });
  const plein = releve({ jour: '2026-11-24', subs: [sixPaye, quatre()], appts: [A1, A2, A3, ...Q] });
  dit('la premiere epuisee, la seance passe a la seconde', 'abo-14', formuleProposeePourReserver(plein, GBEJI, '2026-12-01').proposee?.sub.id);
  dit('au-dela de la fin de la premiere, la seconde', 'abo-14', formuleProposeePourReserver(r, GBEJI, '2027-05-01').proposee?.sub.id);
  dit('une prestation que nulle formule ne porte : rien de propose', undefined, formuleProposeePourReserver(r, 'sv-coloration', '2026-11-10').proposee);
  const L1 = seance({ id: 'leg', date: '2026-10-12', subId: undefined });
  const leg = releve({ subs, appts: [A1, A2, A3, L1] });
  const ou = [leContrat(leg, 'abo-14'), leContrat(leg, 'abo-25')].map((c) => c!.attribuees.filter((s) => s.id === 'leg').length);
  dit('une seance d avant le lien se rattache a un seul contrat', 1, ou[0] + ou[1]);
  dit('… le plus recent en vie ce jour-la qui porte sa prestation', 'abo-25', contratDeLaSeance(L1, subs, PLANS)?.id);
  dit('(l ancien juge la comptait sur les deux)', [true, true], [coversSub(L1, subs[0], SIX), coversSub(L1, subs[1], QUATRE)]);
  const enRetard = garde(releve({ jour: '2026-11-04', subs }));
  dit('l alerte est la plus urgente de toutes les formules', { genre: 'retard', subId: 'abo-14' },
    { genre: enRetard.alerte?.genre, subId: enRetard.alerte?.subId });
  const deuxDues = garde(releve({ jour: '2026-11-04', subs: [contrat({}), contrat({ id: 'abo-26', reference: 'ABO-2026-026' })], appts: [] }));
  dit('le solde se somme, et se liste formule par formule', { total: 140000, par: [70000, 70000] },
    { total: deuxDues.solde.aRegleAujourdhuiXof, par: deuxDues.solde.parContrat.map((x) => x.aRegleAujourdhuiXof) });
  const unSeul = garde(releve({ subs: [contrat({}), quatre({ expiresIso: '2026-11-02' })] }));
  dit('la fin proche de l une s annonce, l autre a jour se tait', ['fin-proche'], unSeul.alertes.map((a) => a.genre));
  const lesDeux = releve({ jour: '2026-11-04', subs: [contrat({}), quatre({ expiresIso: '2026-11-10' })] });
  dit('le retard de l une passe avant la fin proche de l autre, et toutes sont gardees', ['retard', 'fin-proche'],
    lesDeux.alertes.map((a) => a.genre));
}

/* ── 18. ACHETER : seules la formule fermee et « une fois par tete » refusent ── */
{
  const passee = contrat({ id: 'abo-p', planId: PREMIERES.id, reference: 'ABO-2026-002', sinceIso: '2026-01-05', startIso: '2026-01-05',
    expiresIso: '2026-08-03', echeances: undefined, payments: [{ id: 'p1', amountXof: 84000, date: '2026-01-05' }] });
  const r = releve({ subs: [contrat({}), passee] });
  dit('« une fois par tete » deja signee : refusee, et dit laquelle', { ok: false, raison: 'deja-prise', ref: 'ABO-2026-002' },
    (() => { const x = peutAcheterLaFormule(PREMIERES, r, PLANS); return x.ok ? x : { ok: x.ok, raison: x.raison, ref: x.contrat?.reference }; })());
  dit('une formule fermee a la vente : refusee', { ok: false, raison: 'fermee' }, peutAcheterLaFormule(FERMEE, r, PLANS));
  dit('une formule qui court ne ferme pas l achat d une autre, ni de la meme', [{ ok: true }, { ok: true }],
    [peutAcheterLaFormule(QUATRE, r, PLANS), peutAcheterLaFormule(SIX, r, PLANS)]);
}

/* ── 19. LA MEME CHOSE QUE L'ANCIEN JUGE LA OU RIEN N'A CHANGE ── */
{
  const s = contrat({});
  dit('la vie du contrat : memes bornes que dansLaVieDuContrat',
    ['2026-10-01', '2026-10-02', '2027-06-29', '2027-06-30'].map((d) => dansLaVieDuContrat(s, SIX, d)),
    ['2026-10-01', '2026-10-02', '2027-06-29', '2027-06-30'].map((d) => dansLaVie(s, d)));
  const l = contrat({ id: 'abo-l', planId: LUNE.id, startIso: undefined, expiresIso: null });
  dit('le contenu a la date : meme soin de la lune que inclusVendus',
    ['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05'].map((d) => inclusVendus(l, LUNE, d)),
    ['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05'].map((d) => inclusALaDate(l, LUNE, d)));
  const subs = [contrat({}), contrat({ id: 'abo-25', planId: QUATRE.id, sinceIso: '2026-10-10', startIso: '2026-10-10', expiresIso: '2027-04-08' })];
  dit('le contrat a la date : meme reponse que contratPourLaDate',
    ['2026-10-05', '2026-10-12', '2027-05-01'].map((d) => contratPourLaDate(subs, AK, d, PLANS)?.id),
    ['2026-10-05', '2026-10-12', '2027-05-01'].map((d) => contratPourLaDatePur(subs, AK, d, PLANS)?.id));
  const cas = [A1, A3, { ...A3, status: 'annulé' as const }, { ...A1, subId: 'autre' }, { ...A1, date: '2026-09-30' }];
  dit('compter une seance de paquet : meme reponse que coversSub hors des regles nouvelles',
    cas.map((a) => coversSub(a, s, SIX)),
    cas.map((a) => compteLaSeance(a, s, [s], PLANS, '2026-10-20')));
}

/* ── 20. LE JUGE EST PUR : ni magasin, ni horloge, ni reseau ── */
{
  const src = readFileSync('src/shared/abonnee-pur.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';/gm)].map((m) => ({ type: !!m[1], de: m[2] }));
  dit('il n importe que des types de abonnements, agenda et finance', [],
    imports.filter((i) => ['./abonnements', './agenda', './finance'].includes(i.de) && !i.type).map((i) => i.de));
  dit('il n importe ni magasin, ni synchro, ni supabase', [],
    imports.filter((i) => /store|sync|supabase/.test(i.de)).map((i) => i.de));
  dit('ni Date.now, ni new Date() sans date, ni toISOString pour dire aujourd hui', [],
    ['Date.now(', 'new Date()', 'toISOString().slice(0, 10)'].filter((m) => src.includes(m)));
}

/* ── 21. LES PHRASES : l'annee sur chaque date, ni tiret cadratin, ni civilite ── */
{
  const textes = toutesLesAlertes.map((a) => a.texte);
  dit('les alertes du banc ont ete lues', true, textes.length >= 10);
  const MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre';
  const sansAnnee = textes.filter((t) => new RegExp(`\\b\\d{1,2}(er)? (${MOIS})(?! \\d{4})`).test(t));
  dit('aucune date sans son annee', [], sansAnnee.map(ascii));
  dit('aucun tiret cadratin ni demi-cadratin', [], textes.filter((t) => /[—–]/.test(t)).map(ascii));
  dit('aucune civilite supposee, jamais « salon »', [], textes.filter((t) => /\b(Madame|Monsieur|salon)\b/i.test(t)).map(ascii));
  dit('les genres d alerte vus couvrent l ordre de l accueil', ['retard', 'a-regler', 'pause', 'retenue', 'prix-revu', 'a-confirmer', 'fin-proche'],
    ['retard', 'a-regler', 'pause', 'retenue', 'prix-revu', 'a-confirmer', 'fin-proche'].filter((g) => toutesLesAlertes.some((a) => a.genre === g)));
  dit('les regles de la Maison : grace 7 jours, 24 h, retenue 7 jours', { g: 7, h: 24, r: 7 },
    { g: REGLES_DE_LA_MAISON.graceJours, h: REGLES_DE_LA_MAISON.delaiAnnulationHeures, r: REGLES_DE_LA_MAISON.retenueJours });
}

/* ── 22. L'ARGENT SEUL, SANS LE RELEVE ── */
{
  const a = argentDuContrat(contrat({}), SIX, [], '2026-11-02', { etat: 'en-cours' });
  dit('argentDuContrat seul dit la meme chose que le releve', { aRegler: 70000, retard: 0 }, { aRegler: a.aRegleAujourdhuiXof, retard: a.enRetardXof });
  const sansEch = argentDuContrat(contrat({ echeances: undefined }), SIX, [], '2026-10-20', { etat: 'en-cours' });
  dit('un paquet sans echeancier doit son prix des la signature, moins le verse', { reste: 70000, retard: 70000 },
    { reste: sansEch.resteXof, retard: sansEch.enRetardXof });
}

console.log(ko === 0 ? `\nLe releve de l abonnee tient (${n} epreuves).` : `\n${ko} epreuve(s) en echec sur ${n}.`);
