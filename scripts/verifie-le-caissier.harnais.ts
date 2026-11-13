/* LE CAISSIER DE GRENAT, EPROUVE — 13 novembre 2026.
   `node scripts/verifie-le-caissier.mjs` (et `--prouve`).

   La demande (Yeman, 13 novembre 2026) : « Le Trone n'a pas de caissier.
   J'aimerais creer un robot caissier qui se declenche automatiquement pour
   finaliser un paiement ou une facture », puis « construis ».

   UNE JOURNEE FICTIVE, CALQUEE SUR LE 12 NOVEMBRE 2026 (deux rituels finis
   a 10 h 15 et a 16 h 00, jamais encaisses) et elargie aux cas qui doivent
   retenir le caissier : passe au comptoir, acompte a verifier, termine par
   elle, trop tard, une partie deja encaissee, sans numero, offert par une
   payeuse qui a un numero. Noms inventes ; TOUS LES ATTENDUS SONT ECRITS EN
   DUR, tires de la regle ecrite dans src/shared/le-caissier-pur.ts. */
import { readFileSync } from 'node:fs';
import {
  clotureDuJour, francsDits,
  type FaitsDeLaJournee, type PieceLue,
} from '../src/shared/cloture-du-jour-pur';
import {
  COMPTOIR_PREVENU_APRES_MIN, DERNIERE_FACTURE_SEULE_MIN, FACTURE_SEULE_APRES_MIN_PAR_DEFAUT, RECU_APRES_MIN,
  decisionsDuCaissier, gesteDuCaissier, heureDeLaFactureSeule, lignesDuCaissier, notificationDuComptoir,
  pieceDuCaissierAEcrire, pourquoiPasDeFactureSeule, reglagesDuCaissier,
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

/* ── 0. Les reglages et l'heure de la facture ── */
dit('les reglages par defaut : allume, une heure', { actif: true, factureApresMin: 60 }, reglagesDuCaissier(undefined));
dit('eteint seulement quand c est dit', [false, true], [reglagesDuCaissier({ actif: false }).actif, reglagesDuCaissier({ actif: 'non' }).actif]);
dit('un delai hors de la liste revient a une heure', 60, reglagesDuCaissier({ factureApresMin: 45 }).factureApresMin);
dit('jamais seule (0), deux heures (120)', [0, 120], [reglagesDuCaissier({ factureApresMin: 0 }).factureApresMin, reglagesDuCaissier({ factureApresMin: 120 }).factureApresMin]);
dit('les constantes : 15 min, 60 min, 15 min, 19 h 30', [15, 60, 15, 1170], [COMPTOIR_PREVENU_APRES_MIN, FACTURE_SEULE_APRES_MIN_PAR_DEFAUT, RECU_APRES_MIN, DERNIERE_FACTURE_SEULE_MIN]);
const R: ReglagesDuCaissier = reglagesDuCaissier(undefined);
dit('fini a 16 h 00 : la facture part a 17 h 00', 1020, heureDeLaFactureSeule(960, R));
dit('fini a 18 h 45 : jamais seule (apres 19 h 30)', null, heureDeLaFactureSeule(1125, R));
dit('fini a 18 h 30 : 19 h 30 tout juste', 1170, heureDeLaFactureSeule(1110, R));
dit('delai « jamais » : jamais seule', null, heureDeLaFactureSeule(600, { actif: true, factureApresMin: 0 }));
dit('caissier eteint : jamais seule', null, heureDeLaFactureSeule(600, { actif: false, factureApresMin: 60 }));

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
  rdv('r7', 'c7', '18:45', 60, 12000),
];

const faits = (maintenantMs: number, o: { rdvs?: RdvDuCaissier[]; pieces?: PieceDuCaissier[]; reglages?: ReglagesDuCaissier; jour?: string; envois?: FaitsDeLaJournee['envois'] } = {}): FaitsDuCaissier => {
  const rdvs = o.rdvs ?? RDVS;
  const pieces = o.pieces ?? [];
  const jour = o.jour ?? J;
  const cloture = clotureDuJour({ jour, maintenantMs, rdvs, pieces, fiches: FICHES, envois: o.envois ?? [] });
  return { jour, maintenantMs, constats: cloture.rdvs, rdvs, fiches: FICHES, pieces, reglages: o.reglages ?? R };
};
const genres = (f: FaitsDuCaissier) => decisionsDuCaissier(f).map((d) => `${d.genre}:${d.rdvId}`);
const avec = (id: string, plus: Partial<RdvDuCaissier>) => RDVS.map((r) => (r.id === id ? { ...r, ...plus } : r));

/* ── 2. Le comptoir prevenu, quinze minutes apres la fin ── */
dit('a 10 h 29 : les deux de 9 h (finis a 10 h 00), pas encore celle de 10 h (finie a 10 h 15)',
  ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9'], genres(faits(a('10:29'))));
dit('a 10 h 30 : celle de 10 h aussi', ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9', 'prevenir-le-comptoir:r1'], genres(faits(a('10:30'))));
const prev1 = decisionsDuCaissier(faits(a('10:30'))).find((d) => d.rdvId === 'r1');
dit('la notification : des initiales, le montant, l heure de la facture',
  { titre: 'À encaisser · C. D.', corps: `Fini vers 10 h 15 · ${F(2000)}. Sans encaissement d’ici là, sa facture partira seule vers 11 h 15.` },
  prev1 && prev1.genre === 'prevenir-le-comptoir' ? { titre: prev1.titre, corps: prev1.corps } : null);
vrai('jamais le nom en clair dans la notification', !!prev1 && prev1.genre === 'prevenir-le-comptoir' && !/Celine|Dossa/.test(prev1.titre + prev1.corps));
const prev8 = decisionsDuCaissier(faits(a('10:30'))).find((d) => d.rdvId === 'r8');
dit('une partie deja encaissee : le reste, et pas de facture seule',
  `Fini vers 10 h 00 · ${F(15000)}. Encaissez-la au comptoir, ou dites ce qui s’est passé dans La journée.`,
  prev8 && prev8.genre === 'prevenir-le-comptoir' ? prev8.corps : null);
dit('prevenu une fois : la marque eteint la notification',
  ['prevenir-le-comptoir:r8', 'prevenir-le-comptoir:r9'], genres(faits(a('10:30'), { rdvs: avec('r1', { caissier: { demandeLe: iso('10:30') } }) })));

/* ── 3. La facture demandee, a l'heure dite ── */
const r1Prevenu = avec('r1', { caissier: { demandeLe: iso('10:30') } });
dit('a 11 h 14 : rien pour elle', [], genres(faits(a('11:14'), { rdvs: r1Prevenu })).filter((g) => g.endsWith(':r1')));
dit('a 11 h 15 : sa facture est demandee', ['demander-la-piece:r1'], genres(faits(a('11:15'), { rdvs: r1Prevenu })).filter((g) => g.endsWith(':r1')));
dit('demandee une fois', [], genres(faits(a('11:40'), { rdvs: avec('r1', { caissier: { demandeLe: iso('10:30'), pieceDemandeeLe: iso('11:15') } }) })).filter((g) => g.endsWith(':r1')));
dit('retenue au comptoir : jamais demandee', [], genres(faits(a('11:40'), { rdvs: avec('r1', { caissier: { demandeLe: iso('10:30'), retenueLe: iso('10:40') } }) })).filter((g) => g.endsWith(':r1')));
const pieceDuComptoir: PieceDuCaissier = { id: 'p1', kind: 'facture', number: 'MND-2026-0175', apptId: 'r1', clientId: 'c1', date: J, status: 'envoyée', lines: [{ qty: 1, unitXof: 2000 }] };
dit('une facture deja ecrite au comptoir : pas une seconde', [], genres(faits(a('11:40'), { rdvs: r1Prevenu, pieces: [pieceDuComptoir] })).filter((g) => g.endsWith(':r1')));
dit('payeuse avec un numero (offert) : sa facture part a 12 h 00', ['demander-la-piece:r10'],
  genres(faits(a('12:00'), { rdvs: avec('r10', { caissier: { demandeLe: iso('11:15') } }) })).filter((g) => g.endsWith(':r10')));

/* ── 4. Ce qui retient le caissier ── */
const tard = faits(a('21:00'), { rdvs: RDVS.map((r) => ({ ...r, caissier: { demandeLe: iso('10:30') } })) });
dit('a 21 h, tous deja prevenus : aucune facture demandee (trop tard)', [], genres(tard));
dit('passe au comptoir : prevenue, jamais de facture', ['prevenir-le-comptoir:r4'], genres(faits(a('14:00'))).filter((g) => g.endsWith(':r4')));
dit('pourquoi : elle passe toujours au comptoir', 'elle passe toujours au comptoir', pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r4')!, FICHES));
dit('pourquoi : un acompte attend', 'un acompte attend d’être vérifié', pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r5')!, FICHES));
dit('pourquoi : une partie deja encaissee', 'une partie est déjà encaissée', pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r8')!, FICHES));
dit('pourquoi : pas de numero', 'pas de numéro sur sa fiche', pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r9')!, FICHES));
dit('pourquoi : pas de papiers par WhatsApp', 'pas de facture par WhatsApp (sa fiche le dit)', pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r12')!, FICHES));
dit('pourquoi : rien (elle peut recevoir sa facture)', null, pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r2')!, FICHES));
dit('payeuse avec un numero : rien ne retient', null, pourquoiPasDeFactureSeule(RDVS.find((r) => r.id === 'r10')!, FICHES));
dit('terminee par elle : ni notification ni facture, toute la journee', [], [...genres(faits(a('15:30'))), ...genres(faits(a('16:30')))].filter((g) => g.endsWith(':r6')));
dit('l acompte a verifier : prevenue, jamais de facture', ['prevenir-le-comptoir:r5'], genres(faits(a('15:30'))).filter((g) => g.endsWith(':r5')));
dit('reglee en entier : rien a encaisser', [], genres(faits(a('15:30'))).filter((g) => g.endsWith(':r3')));
dit('finie a 19 h 45 : prevenue a 20 h 00, sans facture seule',
  ['prevenir-le-comptoir:r7', `Fini vers 19 h 45 · ${F(12000)}. Encaissez-la au comptoir, ou dites ce qui s’est passé dans La journée.`],
  (() => { const d = decisionsDuCaissier(faits(a('20:00'))).find((x) => x.rdvId === 'r7'); return d && d.genre === 'prevenir-le-comptoir' ? [`${d.genre}:${d.rdvId}`, d.corps] : null; })());
dit('le lendemain : jamais (un jour passe est l affaire de la cloture)', [], genres(faits(a('10:30', '2026-11-13'))));
dit('eteint : rien', [], genres(faits(a('16:30'), { reglages: { actif: false, factureApresMin: 60 } })));
dit('delai « jamais » : prevenue, jamais demandee', ['prevenir-le-comptoir:r2'],
  genres(faits(a('17:30'), { reglages: { actif: true, factureApresMin: 0 } })).filter((g) => g.endsWith(':r2')));

/* ── 5. Les gestes surs, entre deux clotures ── */
const f15 = faits(a('15:30'));
const honore = clotureDuJour({ jour: J, maintenantMs: a('15:30'), rdvs: RDVS, pieces: [], fiches: FICHES }).gestes.find((g) => g.genre === 'passer-honore');
dit('la regle de la cloture veut honorer celle qui a tout regle', 'r3', honore?.genre === 'passer-honore' ? honore.rdvId : null);
vrai('le caissier honore aussitot (sans attendre 19 h)', !!honore && gesteDuCaissier(honore, f15));
/* Le recu d'une piece payee, quinze minutes apres sa derniere ecriture. */
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
/* La facture qu'il a fait ecrire, a son heure. */
const p1 = { ...pieceDuComptoir, id: 'p1c', number: 'MND-2026-0176' };
const factureA = (hhmm: string, marque: RdvDuCaissier['caissier'], reglages = R) => {
  const rdvs = avec('r1', { caissier: marque });
  const f = faits(a(hhmm), { rdvs, pieces: [p1], reglages });
  const g = clotureDuJour({ jour: J, maintenantMs: a(hhmm), rdvs, pieces: [p1] as PieceLue[], fiches: FICHES }).gestes.find((x) => x.genre === 'envoyer-le-papier' && x.pieceId === 'p1c');
  return g ? (g.genre === 'envoyer-le-papier' ? `${g.papier}:${gesteDuCaissier(g, f)}` : 'autre') : 'pas de geste';
};
const DEMANDEE = { demandeLe: iso('10:30'), pieceDemandeeLe: iso('11:15'), pieceLe: iso('11:16') };
dit('sa facture ecrite, a 11 h 20 : elle part', 'facture:true', factureA('11:20', DEMANDEE));
dit('une facture du comptoir (pas demandee par lui) : laissee aux clotures', 'facture:false', factureA('11:20', { demandeLe: iso('10:30') }));
dit('retenue : elle ne part pas', 'facture:false', factureA('11:20', { ...DEMANDEE, retenueLe: iso('11:18') }));
dit('apres 19 h 30 : elle ne part pas seule', 'facture:false', factureA('19:31', DEMANDEE));
dit('delai change a « jamais » entre-temps : elle ne part pas', 'facture:false', factureA('11:20', DEMANDEE, { actif: true, factureApresMin: 0 }));
dit('eteint : aucun geste', false, !!honore && gesteDuCaissier(honore, { ...f15, reglages: { actif: false, factureApresMin: 60 } }));
dit('un autre jour : aucun geste', false, !!honore && gesteDuCaissier(honore, { ...f15, maintenantMs: a('10:00', '2026-11-13') }));

/* ── 6. La piece, au Trone ── */
dit('demandee, confirmee, sans piece : elle s ecrit', true, pieceDuCaissierAEcrire({ status: 'confirmé', caissier: { pieceDemandeeLe: iso('11:15') } }, false));
dit('une piece la porte deja : non', false, pieceDuCaissierAEcrire({ status: 'confirmé', caissier: { pieceDemandeeLe: iso('11:15') } }, true));
dit('retenue : non', false, pieceDuCaissierAEcrire({ status: 'confirmé', caissier: { pieceDemandeeLe: iso('11:15'), retenueLe: iso('11:16') } }, false));
dit('encaissee entre-temps (honoree) : non', false, pieceDuCaissierAEcrire({ status: 'honoré', caissier: { pieceDemandeeLe: iso('11:15') } }, false));
dit('terminee par elle : non', false, pieceDuCaissierAEcrire({ status: 'confirmé', termineParElle: { le: iso('11:00') }, caissier: { pieceDemandeeLe: iso('11:15') } }, false));
dit('pas demandee : non', false, pieceDuCaissierAEcrire({ status: 'confirmé', caissier: { demandeLe: iso('10:30') } }, false));

/* ── 7. Ce que dit La journee ── */
const lignes = lignesDuCaissier({
  ...faits(a('12:10'), { rdvs: RDVS.map((r) => (r.id === 'r1' ? { ...r, caissier: { demandeLe: iso('10:30') } }
    : r.id === 'r3' ? { ...r, status: 'honoré', honoreParGrenat: { le: iso('12:05'), moment: 'caisse' } as never }
      : r.id === 'r8' ? { ...r, caissier: { demandeLe: iso('10:15'), retenueLe: iso('10:20'), retenuePar: 'Brice' } } : r)) }),
});
const ligne = (id: string) => lignes.find((l) => l.rdvId === id);
dit('celle de 10 h : prevenue, sa facture a 11 h 15', { etat: 'prevenu', dit: 'Comptoir prévenu à 10 h 30 ; sa facture partira seule vers 11 h 15.', peutRetenir: true },
  (({ etat, dit: d, peutRetenir }) => ({ etat, dit: d, peutRetenir }))(ligne('r1') ?? { etat: '', dit: '', peutRetenir: false }));
dit('celle de 11 h : passee honoree seule', 'honore-seul', ligne('r3')?.etat);
dit('celle de 9 h : retenue, et par qui', { etat: 'retenue', dit: 'Facture retenue par Brice à 10 h 20 : elle ne part pas seule.' },
  (({ etat, dit: d }) => ({ etat, dit: d }))(ligne('r8') ?? { etat: '', dit: '' }));
dit('passe au comptoir (a 14 h 10) : on ne peut pas retenir ce qui ne part pas', { etat: 'a-venir', peutRetenir: false },
  (({ etat, peutRetenir }) => ({ etat, peutRetenir }))(lignesDuCaissier(faits(a('14:10'))).find((l) => l.rdvId === 'r4') ?? { etat: '', peutRetenir: true }));
dit('pas encore finie (15 h) : absente de la liste', undefined, ligne('r2'));

/* ── 8. La copie du serveur, la fonction, la migration, le Trone ── */
const P = lis('src/shared/le-caissier-pur.ts');
const FN = lis('supabase/functions/cloture-du-jour/index.ts');
const bloc = (src: string) => { const i = src.indexOf('/* ⟨le-caissier⟩ */\n'); const k = src.indexOf('\n/* ⟨/le-caissier⟩ */', i); return i < 0 || k < 0 ? null : src.slice(i, k); };
vrai('la copie du serveur est l original, a la lettre', bloc(P) !== null && bloc(P) === bloc(FN));
vrai('la copie vient apres la regle de la cloture dont elle lit les outils', FN.indexOf('/* ⟨/cloture-du-jour⟩ */') >= 0 && FN.indexOf('/* ⟨le-caissier⟩ */') > FN.indexOf('/* ⟨/cloture-du-jour⟩ */'));
vrai('la fonction connait le moment « caisse »', FN.includes("const caisse = corps.moment === 'caisse';"));
vrai('eteint, la fonction ne lit rien', FN.includes("if (caisse && !reglagesCaissier.actif) {"));
vrai('le caissier passe a toute heure de son cron, la cloture aux siennes', FN.includes('if (!matin && !caisse && !essai && !heures.includes(ici.heure)) {'));
vrai('les gestes surs passent par sa regle', FN.includes('if (caisse && !gesteDuCaissier(g, faitsDuCaissier(premiere.rdvs))) continue;'));
vrai('a l essai, aucun geste ecrit', FN.includes("if (caisse && essai) { faits.push({ genre: g.genre, cle: g.cle, dit: `(essai, rien écrit) ${g.dit}` }); continue; }"));
vrai('a l essai, aucune marque ecrite', FN.includes("if (essai) { faits.push({ genre: d.genre, cle: d.cle, dit: `(essai, rien écrit) ${ditLa}` }); continue; }"));
vrai('chaque decision se rejuge sur la ligne fraiche', FN.includes('if (!decisionsDuCaissier(faitsDuCaissier(constatsFrais, rdvsFrais)).some((x) => x.cle === d.cle))'));
vrai('la marque s ecrit sous condition', FN.includes(".eq('id', frais.id).eq('updated_at', frais.updated_at).select('id, branch_id, data, updated_at');"));
const marque = FN.indexOf("const caissier: MarqueDuCaissier = { ...avant,");
const notif = FN.indexOf('notifiesParLeCaissier += await previens(');
vrai('la notification part apres la marque ecrite', marque > 0 && notif > marque && FN.slice(marque, notif).includes("if (!(ecrit ?? []).length) { passes.push({ cle: d.cle, pourquoi: 'la donnée a bougé' }); continue; }"));
vrai('le caissier ne reecrit ni compte rendu ni bilan', FN.indexOf("if (caisse) {\n      dis('caisse'") > 0 && FN.indexOf("if (caisse) {\n      dis('caisse'") < FN.indexOf("await sb.from('assistants_bilans')"));
vrai('le caissier ne lit pas la trace des effacements', FN.includes('const traces = caisse ? [] :'));
vrai('l honneur du caissier porte son moment', FN.includes("honoreParGrenat: { le, moment } };"));
vrai('le GET dit la version du caissier', FN.includes('caissier: VERSION_DU_CAISSIER });'));
const SQL = lis('supabase/migrations/0207_le_caissier_de_grenat.sql');
vrai('0207 : toutes les cinq minutes, de 7 h a 23 h a Cotonou', SQL.includes("select cron.schedule('le-caissier-de-grenat', '*/5 6-22 * * *',"));
vrai('0207 : le moment « caisse »', SQL.includes(`'{"source":"cron","moment":"caisse"}'::jsonb`));
vrai('0207 : rejouable', SQL.includes("select cron.unschedule(jobid) from cron.job where jobname = 'le-caissier-de-grenat';"));
vrai('0207 : aucune table, aucun effacement', !/create table|drop table|delete from|truncate/i.test(SQL));
const MAIN = lis('src/apps/trone/shell/useLeCaissier.ts');
vrai('la main du caissier relit la ligne avant d ecrire', MAIN.includes('if (!d || !pieceDuCaissierAEcrire(d as never, false)) return;'));
vrai('un seul poste ecrit la piece (reservation sous condition)', MAIN.includes("? ecriture.is('data->caissier->>pieceLe', null)"));
vrai('la piece est celle de « Terminer la seance », au tarif de sa tete', MAIN.includes('const r = factureAEnvoyer(frais, byId, frais.branchId, tarifs.prixPlein, tarifs.gesteDe);'));
vrai('la main du caissier n honore jamais', !/honorAppointment|status: 'honoré'/.test(MAIN));
vrai('le Shell la monte', lis('src/apps/trone/shell/Shell.tsx').includes('  useLeCaissier();'));
const LJ = lis('src/apps/trone/routes/finances/LaJournee.tsx');
vrai('La journee dit le caissier', LJ.includes('data-lj="caissier"') && LJ.includes('data-geste="retenir-sa-facture"'));
vrai('retenir pose la marque et qui', LJ.includes('retenueLe: new Date().toISOString(), retenuePar: moi'));
vrai('Parametres regle le caissier (direction)', lis('src/apps/trone/routes/systeme/CarteClotureDeGrenat.tsx').includes('data-carte="le-caissier"'));

console.log(ko ? `\n${ko} echec(s).` : '\nLe caissier tient.');
