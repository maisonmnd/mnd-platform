/* LE CAISSIER DE GRENAT, EPROUVE — 13 novembre 2026, revu le 14.
   `node scripts/verifie-le-caissier.mjs` (et `--prouve`).

   La demande (Yeman, 13 novembre 2026) : « Le Trone n'a pas de caissier.
   J'aimerais creer un robot caissier qui se declenche automatiquement pour
   finaliser un paiement ou une facture », puis « construis » ; puis « il faut
   que le caissier agisse a la fin de tous les RDV meme si c'est apres l'heure
   de fermeture » ; puis, le 14 novembre 2026 : « non aucune facture part
   s'il n'est pas encaisse je dois autoriser cela », et « Oui, toutes ».

   UNE JOURNEE FICTIVE, CALQUEE SUR LE 12 NOVEMBRE 2026 (deux rituels finis
   a 10 h 15 et a 16 h 00, jamais encaisses), elargie : passe au comptoir,
   acompte a verifier, termine par elle, fini apres la fermeture, une partie
   deja encaissee, sans numero, sans papiers par WhatsApp, offert par une
   payeuse qui a un numero. Noms inventes ; TOUS LES ATTENDUS SONT ECRITS EN
   DUR, tires de la regle ecrite dans src/shared/le-caissier-pur.ts. */
import { readFileSync, existsSync } from 'node:fs';
import { clotureDuJour, francsDits, type GesteSur, type PieceLue } from '../src/shared/cloture-du-jour-pur';
import {
  COMPTOIR_PREVENU_APRES_MIN, RECU_APRES_MIN,
  aSavoirAvantDEnvoyer, decisionsDuCaissier, gesteDuCaissier, lignesDuCaissier, notificationDuComptoir,
  pourquoiPasDeFacture, reglagesDuCaissier,
  type FaitsDuCaissier, type FicheDuCaissier, type PieceDuCaissier, type RdvDuCaissier, type ReglagesDuCaissier,
} from '../src/shared/le-caissier-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 240)}`));
};
const vrai = (nom: string, v: boolean) => dit(nom, true, v);
const lis = (rel: string) => readFileSync(rel, 'utf8').replace(/\r\n/g, '\n');

const J = '2026-11-12';
const a = (hhmm: string, jour = J) => Date.parse(`${jour}T${hhmm}:00+01:00`);
const iso = (hhmm: string) => new Date(a(hhmm)).toISOString();
const F = (n: number) => francsDits(n);

/* ── 0. Les reglages ── */
dit('allume par defaut', { actif: true }, reglagesDuCaissier(undefined));
dit('eteint seulement quand c est dit', [false, true], [reglagesDuCaissier({ actif: false }).actif, reglagesDuCaissier({ actif: 'non' }).actif]);
dit('l ancien delai de la facture seule ne compte plus', { actif: true }, reglagesDuCaissier({ factureApresMin: 60 }));
dit('les constantes : 15 min, 15 min', [15, 15], [COMPTOIR_PREVENU_APRES_MIN, RECU_APRES_MIN]);
const R: ReglagesDuCaissier = reglagesDuCaissier(undefined);

/* ── 1. La journee ── */
const fiche = (id: string, nom: string, o: Partial<FicheDuCaissier> = {}): FicheDuCaissier => ({ id, nom, aUnNumero: true, sansPapiersWa: false, ...o });
const FICHES: FicheDuCaissier[] = [
  fiche('c1', 'Celine Dossa'), fiche('c2', 'Fafa Fagla'), fiche('c3', 'Rose Akpo'),
  fiche('c4', 'Nadia Houngbo', { passeAuComptoir: true }), fiche('c5', 'Ines Sossou'), fiche('c6', 'Mireille Adjo'),
  fiche('c7', 'Ella Kpade'), fiche('c8', 'Prisca Zinsou'), fiche('c9', 'Aicha Bio', { aUnNumero: false }),
  fiche('c10', 'Lea Tossou', { aUnNumero: false }), fiche('c11', 'Marc Tossou'), fiche('c12', 'Sena Agbo', { sansPapiersWa: true }),
];
const rdv = (id: string, clientId: string, time: string, dureeMin: number, prixXof: number, o: Partial<RdvDuCaissier> = {}): RdvDuCaissier => ({
  id, clientId, qui: FICHES.find((x) => x.id === clientId)?.nom, date: J, time, dureeMin, status: 'confirmé', prixXof, ...o,
});
const RDVS: RdvDuCaissier[] = [
  rdv('r8', 'c8', '09:00', 60, 20000, { payments: [{ id: 'v8', amountXof: 5000, date: J, method: 'Espèces' }] }),
  rdv('r9', 'c9', '09:30', 30, 8000),
  rdv('r1', 'c1', '10:00', 15, 2000),
  rdv('r10', 'c10', '10:30', 30, 9000, { offertPar: 'c11' }),
  rdv('r3', 'c3', '11:00', 60, 20000, { payments: [{ id: 'v3', amountXof: 20000, date: J, method: 'Espèces' }] }),
  rdv('r4', 'c4', '12:00', 60, 10000),
  rdv('r5', 'c5', '13:00', 60, 30000, { depositXof: 10000, depositConfirmed: false }),
  rdv('r6', 'c6', '14:00', 60, 25000, { termineParElle: { le: iso('14:50'), par: 'couronne' } }),
  rdv('r12', 'c12', '14:30', 30, 7000),
  rdv('r2', 'c2', '15:00', 60, 15000),
  rdv('r7', 'c7', '20:30', 60, 12000),
];
const faits = (maintenantMs: number, o: { rdvs?: RdvDuCaissier[]; pieces?: PieceDuCaissier[]; reglages?: ReglagesDuCaissier; jour?: string } = {}): FaitsDuCaissier => {
  const rdvs = o.rdvs ?? RDVS;
  const pieces = o.pieces ?? [];
  const jour = o.jour ?? J;
  const cloture = clotureDuJour({ jour, maintenantMs, rdvs, pieces, fiches: FICHES, envois: [] });
  return { jour, maintenantMs, constats: cloture.rdvs, rdvs, fiches: FICHES, pieces, reglages: o.reglages ?? R };
};
const genres = (f: FaitsDuCaissier) => decisionsDuCaissier(f).map((d) => `${d.genre}:${d.rdvId}`);
const avec = (id: string, plus: Partial<RdvDuCaissier>) => RDVS.map((r) => (r.id === id ? { ...r, ...plus } : r));

/* ── 2. Le comptoir prevenu, quinze minutes apres la fin ── */
dit('a 10 h 29 : les deux de 9 h (finis a 10 h 00), pas encore celle de 10 h (finie a 10 h 15)',
  ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9'], genres(faits(a('10:29'))));
dit('a 10 h 30 : celle de 10 h aussi', ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9', 'prevenir-le-comptoir:r1'], genres(faits(a('10:30'))));
const prev1 = decisionsDuCaissier(faits(a('10:30'))).find((d) => d.rdvId === 'r1');
dit('la notification : des initiales, le montant, et la facture qui attend la direction',
  { titre: 'À encaisser · C. D.', corps: `Fini vers 10 h 15 · ${F(2000)}. Encaissez-la ; sa facture ne part qu’avec l’accord de la direction (La journée).` },
  prev1 ? { titre: prev1.titre, corps: prev1.corps } : null);
vrai('jamais le nom en clair dans la notification', !!prev1 && !/Celine|Dossa/.test(prev1.titre + prev1.corps));
dit('une partie deja encaissee : le reste', `Fini vers 10 h 00 · ${F(15000)}. Encaissez-la ; sa facture ne part qu’avec l’accord de la direction (La journée).`,
  decisionsDuCaissier(faits(a('10:30'))).find((d) => d.rdvId === 'r8')?.corps);
dit('notificationDuComptoir sans initiales : « une cliente »', 'À encaisser · une cliente', notificationDuComptoir({ qui: '', finDite: '9 h 00' }, 1000).titre);
dit('prevenu une fois : la marque eteint la notification',
  ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9'], genres(faits(a('10:30'), { rdvs: avec('r1', { caissier: { demandeLe: iso('10:30') } }) })));
dit('apres la fermeture : fini a 21 h 30, prevenu a 21 h 45', ['prevenir-le-comptoir:r7'], genres(faits(a('21:45'))).filter((g) => g.endsWith(':r7')));
dit('... pas avant', [], genres(faits(a('21:44'))).filter((g) => g.endsWith(':r7')));

/* ── 3. AUCUNE FACTURE NE PART SEULE (14 novembre 2026) ── */
const tous = (hhmm: string) => decisionsDuCaissier(faits(a(hhmm), { rdvs: RDVS.map((r) => ({ ...r, caissier: { demandeLe: iso('09:00') } })) }));
dit('tous prevenus, a toute heure : aucune autre decision (ni facture demandee, ni envoyee)', [[], [], [], []], ['11:15', '16:30', '21:00', '22:45'].map((h) => tous(h).map((d) => d.genre)));
vrai('le caissier ne connait qu une decision : prevenir le comptoir', ['10:30', '12:00', '17:00', '22:00'].every((h) => decisionsDuCaissier(faits(a(h))).every((d) => d.genre === 'prevenir-le-comptoir')));
const pieceAReg: PieceDuCaissier = { id: 'p1', kind: 'facture', number: 'MND-2026-0175', apptId: 'r1', clientId: 'c1', date: J, status: 'envoyée', lines: [{ qty: 1, unitXof: 2000 }] };
const cloP1 = clotureDuJour({ jour: J, maintenantMs: a('12:00'), rdvs: avec('r1', { caissier: { demandeLe: iso('10:30') } }), pieces: [pieceAReg] as PieceLue[], fiches: FICHES, envois: [] });
dit('une facture a regler ecrite : la cloture la dit « a autoriser », sans geste', { gestes: 0, papier: 'a-autoriser' },
  { gestes: cloP1.gestes.filter((g) => g.genre === 'envoyer-le-papier').length, papier: cloP1.pieces.find((p) => p.id === 'p1')?.papier });
const factureForgee: GesteSur = { genre: 'envoyer-le-papier', cle: 'papier:p1', pieceId: 'p1', rdvId: 'r1', papier: 'facture', montantXof: 2000, dit: '' };
dit('une facture forgee en geste : le caissier la refuse', false, gesteDuCaissier(factureForgee, faits(a('12:00'), { pieces: [{ ...pieceAReg, modifieeLe: iso('10:00') }] })));

/* ── 4. Ce que la direction voit avant d'autoriser ── */
dit('pourquoi pas : pas de numero', 'pas de numéro sur sa fiche', pourquoiPasDeFacture(RDVS.find((r) => r.id === 'r9')!, FICHES));
dit('pourquoi pas : pas de papiers par WhatsApp', 'pas de facture par WhatsApp (sa fiche le dit)', pourquoiPasDeFacture(RDVS.find((r) => r.id === 'r12')!, FICHES));
dit('payeuse avec un numero (offert) : elle peut partir', null, pourquoiPasDeFacture(RDVS.find((r) => r.id === 'r10')!, FICHES));
dit('sans fiche : non', 'sans fiche', pourquoiPasDeFacture({ ...RDVS[0], clientId: 'inconnue' }, FICHES));
dit('a savoir : elle regle d habitude au comptoir', ['elle règle d’habitude au comptoir'], aSavoirAvantDEnvoyer(RDVS.find((r) => r.id === 'r4')!, FICHES));
dit('a savoir : un acompte attend', ['un acompte attend d’être vérifié'], aSavoirAvantDEnvoyer(RDVS.find((r) => r.id === 'r5')!, FICHES));
dit('a savoir : une partie deja encaissee', ['une partie est déjà encaissée'], aSavoirAvantDEnvoyer(RDVS.find((r) => r.id === 'r8')!, FICHES));
dit('rien a savoir', [], aSavoirAvantDEnvoyer(RDVS.find((r) => r.id === 'r2')!, FICHES));

/* ── 5. Ce qui retient le caissier ── */
dit('terminee par elle : ni notification, toute la journee', [], [...genres(faits(a('15:30'))), ...genres(faits(a('16:30')))].filter((g) => g.endsWith(':r6')));
dit('reglee en entier : rien a encaisser', [], genres(faits(a('15:30'))).filter((g) => g.endsWith(':r3')));
dit('le lendemain : jamais (un jour passe est l affaire de la cloture)', [], genres(faits(a('10:30', '2026-11-13'))));
dit('eteint : rien', [], genres(faits(a('16:30'), { reglages: { actif: false } })));

/* ── 6. Les gestes surs, entre deux clotures ── */
const f15 = faits(a('15:30'));
const honore = clotureDuJour({ jour: J, maintenantMs: a('15:30'), rdvs: RDVS, pieces: [], fiches: FICHES }).gestes.find((g) => g.genre === 'passer-honore');
dit('la regle de la cloture veut honorer celle qui a tout regle', 'r3', honore?.genre === 'passer-honore' ? honore.rdvId : null);
vrai('le caissier honore aussitot (sans attendre 19 h)', !!honore && gesteDuCaissier(honore, f15));
const r11: RdvDuCaissier = rdv('r11', 'c1', '13:30', 30, 6000, { status: 'honoré', invoiceId: 'p11', payments: [{ id: 'v11', amountXof: 6000, date: J, method: 'Espèces', invoiceId: 'p11' }] });
const p11 = (modifieeLe?: string): PieceDuCaissier => ({ id: 'p11', kind: 'facture', number: 'F-2026-0790', apptId: 'r11', clientId: 'c1', date: J, status: 'payée', lines: [{ qty: 1, unitXof: 6000 }], payments: [{ id: 'v11', amountXof: 6000, date: J, method: 'Espèces' }], ...(modifieeLe ? { modifieeLe } : {}) });
const recuA = (hhmm: string, modifieeLe?: string) => {
  const f = faits(a(hhmm), { rdvs: [...RDVS, r11], pieces: [p11(modifieeLe)] });
  const g = clotureDuJour({ jour: J, maintenantMs: a(hhmm), rdvs: [...RDVS, r11], pieces: [p11(modifieeLe)] as PieceLue[], fiches: FICHES }).gestes.find((x) => x.genre === 'envoyer-le-papier' && x.pieceId === 'p11');
  return g ? gesteDuCaissier(g, f) : 'pas de geste';
};
dit('le recu, encaisse a 15 h 00 : pas a 15 h 10', false, recuA('15:10', iso('15:00')));
dit('le recu : a 15 h 15, oui', true, recuA('15:15', iso('15:00')));
dit('le recu sans heure d ecriture : jamais seul', false, recuA('16:00'));
dit('eteint : aucun geste', false, !!honore && gesteDuCaissier(honore, { ...f15, reglages: { actif: false } }));
dit('un autre jour : aucun geste', false, !!honore && gesteDuCaissier(honore, { ...f15, maintenantMs: a('10:00', '2026-11-13') }));

/* ── 7. Ce que dit La journee ── */
const lignes = lignesDuCaissier({
  ...faits(a('12:10'), { rdvs: RDVS.map((r) => (r.id === 'r1' ? { ...r, caissier: { demandeLe: iso('10:30') } }
    : r.id === 'r3' ? { ...r, status: 'honoré', honoreParGrenat: { le: iso('12:05'), moment: 'caisse' } as never } : r)) }),
});
const ligne = (id: string) => lignes.find((l) => l.rdvId === id);
dit('celle de 10 h : prevenue, sa facture attend votre « Envoyer »',
  { etat: 'prevenu', dit: `Comptoir prévenu à 10 h 30 ; ${F(2000)} à encaisser, sa facture attend votre « Envoyer ».`, peutEnvoyer: true },
  (({ etat, dit: d, peutEnvoyer }) => ({ etat, dit: d, peutEnvoyer }))(ligne('r1') ?? { etat: '', dit: '', peutEnvoyer: false }));
dit('celle de 11 h : passee honoree seule', 'honore-seul', ligne('r3')?.etat);
dit('sans numero : elle ne peut pas partir, et il le dit', { peutEnvoyer: false, ditLaRaison: true },
  { peutEnvoyer: ligne('r9')?.peutEnvoyer, ditLaRaison: !!ligne('r9')?.dit.includes('pas de numéro sur sa fiche') });
dit('passe au comptoir (a 14 h 10) : a savoir, mais la direction peut l envoyer', { peutEnvoyer: true, aSavoir: ['elle règle d’habitude au comptoir'] },
  (({ peutEnvoyer, aSavoir }) => ({ peutEnvoyer, aSavoir }))(lignesDuCaissier(faits(a('14:10'))).find((l) => l.rdvId === 'r4') ?? { peutEnvoyer: false, aSavoir: [] }));
dit('sa facture partie (par la direction) : dite partie, plus de bouton', { etat: 'facture-partie', peutEnvoyer: false },
  (({ etat, peutEnvoyer }) => ({ etat, peutEnvoyer }))(lignesDuCaissier({ ...faits(a('12:10'), { pieces: [pieceAReg] }), facturesParties: new Set(['p1']) }).find((l) => l.rdvId === 'r1') ?? { etat: '', peutEnvoyer: true }));
dit('pas encore finie (15 h) : absente de la liste', undefined, ligne('r2'));

/* ── 8. La copie du serveur, la fonction, la migration, le Trone ── */
const P = lis('src/shared/le-caissier-pur.ts');
const FN = lis('supabase/functions/cloture-du-jour/index.ts');
const bloc = (src: string, nom: string) => { const i = src.indexOf(`/* ⟨${nom}⟩ */\n`); const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i); return i < 0 || k < 0 ? null : src.slice(i, k); };
vrai('la copie du serveur est l original, a la lettre', bloc(P, 'le-caissier') !== null && bloc(P, 'le-caissier') === bloc(FN, 'le-caissier'));
vrai('la regle de la cloture du serveur est l original, a la lettre', bloc(lis('src/shared/cloture-du-jour-pur.ts'), 'cloture-du-jour') === bloc(FN, 'cloture-du-jour'));
vrai('la copie vient apres la regle de la cloture dont elle lit les outils', FN.indexOf('/* ⟨le-caissier⟩ */') > FN.indexOf('/* ⟨/cloture-du-jour⟩ */'));
vrai('la fonction connait le moment « caisse »', FN.includes("const caisse = corps.moment === 'caisse';"));
vrai('eteint, la fonction ne lit rien', FN.includes("if (caisse && !reglagesCaissier.actif) {"));
vrai('le caissier passe a toute heure de son cron, la cloture aux siennes', FN.includes('if (!matin && !caisse && !essai && !heures.includes(ici.heure)) {'));
vrai('les gestes surs passent par sa regle', FN.includes('if (caisse && !gesteDuCaissier(g, faitsDuCaissier(premiere.rdvs))) continue;'));
vrai('a l essai, aucun geste ecrit', FN.includes("if (caisse && essai) { faits.push({ genre: g.genre, cle: g.cle, dit: `(essai, rien écrit) ${g.dit}` }); continue; }"));
vrai('a l essai, aucune marque ecrite', FN.includes("if (essai) { faits.push({ genre: d.genre, cle: d.cle, dit: `(essai, rien écrit) ${ditLa}` }); continue; }"));
vrai('chaque decision se rejuge sur la ligne fraiche', FN.includes('if (!decisionsDuCaissier(faitsDuCaissier(constatsFrais, rdvsFrais)).some((x) => x.cle === d.cle))'));
vrai('la marque s ecrit sous condition', FN.includes(".eq('id', frais.id).eq('updated_at', frais.updated_at).select('id, branch_id, data, updated_at');"));
vrai('la seule marque est « comptoir prevenu »', FN.includes('const caissier: MarqueDuCaissier = { ...avant, demandeLe: le };') && !FN.includes('pieceDemandeeLe'));
const marque = FN.indexOf('const caissier: MarqueDuCaissier = { ...avant, demandeLe: le };');
const notif = FN.indexOf('notifiesParLeCaissier += await previens(');
vrai('la notification part apres la marque ecrite', marque > 0 && notif > marque && FN.slice(marque, notif).includes("if (!(ecrit ?? []).length) { passes.push({ cle: d.cle, pourquoi: 'la donnée a bougé' }); continue; }"));
vrai('le caissier ne reecrit ni compte rendu ni bilan', FN.indexOf("if (caisse) {\n      dis('caisse'") > 0 && FN.indexOf("if (caisse) {\n      dis('caisse'") < FN.indexOf("await sb.from('assistants_bilans')"));
vrai('le GET dit la version du caissier', FN.includes('caissier: VERSION_DU_CAISSIER });'));
const SQL = lis('supabase/migrations/0207_le_caissier_de_grenat.sql');
vrai('0207 : toutes les cinq minutes, de 7 h a 23 h 55 a Cotonou', SQL.includes("select cron.schedule('le-caissier-de-grenat', '*/5 6-22 * * *',"));
vrai('0207 : le moment « caisse »', SQL.includes(`'{"source":"cron","moment":"caisse"}'::jsonb`));
vrai('plus de main du caissier qui ecrit une facture seule', !existsSync('src/apps/trone/shell/useLeCaissier.ts') && !lis('src/apps/trone/shell/Shell.tsx').includes('useLeCaissier'));
const LJ = lis('src/apps/trone/routes/finances/LaJournee.tsx');
vrai('La journee dit le caissier', LJ.includes('data-lj="caissier"'));
vrai('« Envoyer sa facture » : la direction seule, a l ecran', LJ.includes('{souverain && l.peutEnvoyer && <button type="button" className="lj-g" data-geste="envoyer-sa-facture"'));
vrai('« Envoyer sa facture » : la direction seule, dans le geste', LJ.includes("const envoieSaFacture = (rdvId: string) => {\n    if (!souverain) { toast('La direction seule autorise l’envoi d’une facture.'); return; }"));
vrai('l envoi passe par le chemin expres', LJ.includes('void envoiDeLaPiece.aRegler(pieceId, jourDuRituel, { memePasse: true });'));
vrai('les factures a autoriser se montrent a la direction', LJ.includes('data-lj="a-autoriser"') && LJ.includes("cloture.pieces.filter((x) => x.papier === 'a-autoriser')"));
vrai('l envoi n honore pas le rendez-vous', !/envoieSaFacture[\s\S]{0,1600}honorAppointment/.test(LJ));
const CARTE = lis('src/apps/trone/routes/systeme/CarteClotureDeGrenat.tsx');
vrai('Parametres : le caissier allume ou eteint, plus de delai', CARTE.includes('data-carte="le-caissier"') && !CARTE.includes('factureApresMin'));
const MAINGR = lis('src/apps/trone/shell/useLaMainDeGrenat.ts');
vrai('le recu du caissier part apres la salle, pas au matin', MAINGR.includes('? { partA: Date.now() + REGLES_PAR_DEFAUT.salleMin * 60_000, calme: false }'));
vrai('les papiers des clotures gardent les heures calmes', MAINGR.includes(': heureDeDepart(Date.now(), REGLES_PAR_DEFAUT);'));

console.log(ko ? `\n${ko} echec(s).` : '\nLe caissier tient.');
