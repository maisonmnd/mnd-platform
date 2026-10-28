/* LES MESSAGES DE L'ABONNÉE, ÉPROUVÉS — `node scripts/verifie-les-messages-de-l-abonnee.mjs`.

   Parcours de l'abonnée, maquette L0 validée le 20 octobre 2026, section
   WhatsApp : « Le rappel part la veille de chaque échéance, jamais avant, et
   les relances ne partent qu'après. L'annonce d'un prix revu part avant que
   ses échéances changent. Aucun numéro de pièce dans un message. »
   Décisions 6 (le contrat fait foi, les relances lisent l'échéancier), 10
   (le prix revu annoncé) et 11 (le rappel la veille) ; tranché au sélecteur :
   une échéance écrite un dimanche se juge le lundi.

   On éprouve :
     1. la copie bornée du juge (bloc `echeances`), la même dans les deux
        fonctions, et qui dit ce que dit `abonnee-pur.ts` sur une grille de
        contrats et de jours ;
     2. les règles, telles qu'elles ont été dites (jamais tirées du code) ;
     3. la VRAIE tournée de `rappels-d-echeance` et celle de
        `relances-factures`, extraites telles quelles et rejouées contre une
        base simulée ;
     4. la fonction : santé, clé du cron, modèles.

   Le scénario est celui de la maquette (tout est inventé) : Akouavi,
   GBÈJÍ™ · Carnet de Six en Mini, 140 000 F en 2 × 70 000 F, signé le
   2 octobre 2026, deuxième échéance écrite le 1er novembre 2026 (un
   dimanche, jugée le lundi 2) ; Nadia, 9 ans, tête portée de son foyer.

   Sortie ASCII : la console de Windows ne connaît pas les accents. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  argentDuContrat as argentPur, etatDeLaFormule, versementsDuContrat as versementsPur, jourDitAvecLAnnee as jourDitPur,
  francs as francsPur, echeancierApresPrixRevu, releveDeLAbonnee, type ContratLu, type SeanceLue,
} from '../src/shared/abonnee-pur';
import type { Plan } from '../src/shared/abonnements';
import type { Invoice } from '../src/shared/finance';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  const nomAscii = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nomAscii}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
function extrais(f: string, nom: string): string {
  const src = lis(f);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
const RAPPELS = 'supabase/functions/rappels-d-echeance/index.ts';
const RELANCES = 'supabase/functions/relances-factures/index.ts';
const charge = (f: string, rend: string) => {
  const js = transformSync(extrais(f, 'tournee').replace(/^export /gm, ''), { loader: 'ts' }).code;
  return new Function(`${js}; return ${rend};`)();
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (...a: any[]) => any;
const R = charge(RAPPELS, `{ tournee, rappelsDuContrat, annonceDuPrixRevu, effetDuPrixRevu, variablesDuRappel, texteDuRappel,
  variablesDuPrixRevu, texteDuPrixRevu, argentDuContrat, etatPourLArgent, versementsDuContrat, jourDitAvecLAnnee, francs,
  calibreEtFourchette, destinataireDe, idDuRappel, idDeLAnnonce, jourOuvre }`) as Record<string, Fn>;
const L = charge(RELANCES, `{ tournee, echeanceARelancer, argentDuContrat, estUnePieceDeFormule, idDeLaRelanceDEcheance,
  prorataDeLaResiliation, resteDeResiliationARelancer, idDeLaRelanceDeResiliation, etatPourLArgent }`) as Record<string, Fn>;

/* ── LES FORMULES ET LE SCÉNARIO ── */
const CARNET = { id: 'carnet-six', name: 'GBÈJÍ™ · Carnet de Six', mode: 'pack', priceXof: 140000, included: [{ serviceId: 'svc-gbeji', qty: 6 }] } as unknown as Plan;
const QUATRE = { id: 'carnet-quatre', name: 'GBÈJÍ™ · Carnet de Quatre', mode: 'pack', priceXof: 126000, included: [{ serviceId: 'svc-gbeji', qty: 4 }] } as unknown as Plan;
const LUNE = { id: 'chaque-lune', name: 'GBÈJÍ™ · Chaque Lune', mode: 'cycle', priceXof: 37500, included: [{ serviceId: 'svc-gbeji', qty: 1 }] } as unknown as Plan;
const PLANS = [CARNET, QUATRE, LUNE];
const planDe = (c: { planId?: string }) => PLANS.find((p) => p.id === c.planId);

const akouavi = (extra: Record<string, unknown> = {}): ContratLu => ({
  id: 'abo-14', branchId: 'b1', clientId: 'c-ak', name: 'Akouavi Essai', planId: 'carnet-six', slot: '', since: '',
  nextIso: '2026-11-01', reference: 'ABO-2026-014', status: 'active', mrrXof: 0, sinceIso: '2026-10-02', startIso: '2026-10-02',
  expiresIso: '2027-06-29', priceXof: 140000, calibreVendu: 'cal-mini', invoiceId: 'inv-ab',
  echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 70000 }],
  payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000, method: 'kkiapay' }],
  ...extra,
} as unknown as ContratLu);
const pieceAk = (extra: Record<string, unknown> = {}) => ({
  id: 'inv-ab', kind: 'facture', status: 'envoyée', date: '2026-10-02', creeeLe: '2026-10-02T10:00:00Z', number: 'MND-2026-0200',
  branchId: 'b1', clientId: 'c-ak', clientName: 'Akouavi Essai', lines: [{ qty: 1, unitXof: 140000, discountPct: 0 }], globalDiscountPct: 0,
  payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }], note: 'Abonnement · GBÈJÍ™ · Carnet de Six · ABO-2026-014 · réglable en 2 fois',
  ...extra,
});
const luneDe = (extra: Record<string, unknown> = {}): ContratLu => ({
  id: 'abo-21', branchId: 'b1', clientId: 'c-ak', name: 'Akouavi Essai', planId: 'chaque-lune', slot: '', since: '',
  nextIso: '2026-11-02', reference: 'ABO-2026-021', status: 'active', mrrXof: 0, sinceIso: '2026-10-03', startIso: '2026-10-03',
  payments: [{ id: 'l1', date: '2026-10-03', amountXof: 37500 }],
  ...extra,
} as unknown as ContratLu);

/* ── 1. LA COPIE BORNÉE : la même dans les deux fonctions, et elle dit ce que dit le juge ── */
{
  dit('le bloc echeances : même texte dans rappels-d-echeance et relances-factures', true,
    extrais(RAPPELS, 'echeances') === extrais(RELANCES, 'echeances'));
  const contrats: ContratLu[] = [
    akouavi(),
    akouavi({ payments: [] }),
    akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }, { id: 'v2', date: '2026-11-02', amountXof: 70000 }] }),
    akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 90000 }] }),
    akouavi({ echeances: undefined, payments: [{ id: 'v1', date: '2026-10-02', amountXof: 50000 }] }),
    akouavi({ echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-03', amountXof: 40000 }, { numero: 3, dueIso: '2026-12-02', amountXof: 30000 }] }),
    akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 200000 }] }),
    akouavi({ origine: 'couronne', payments: [] }),
    akouavi({ origine: 'couronne', payments: [], renonceeLe: '2026-10-05' }),
    akouavi({ resilieeLe: '2026-10-20' }),
    akouavi({ status: 'churn' }),
    akouavi({ status: 'exhausted' }),
    akouavi({ expiresIso: '2026-10-25' }),
    luneDe(),
    luneDe({ payments: [{ id: 'l1', date: '2026-10-03', amountXof: 37500 }, { id: 'l2', date: '2026-10-28', amountXof: 37500 }], nextIso: '2026-12-02' }),
    luneDe({ suspendue: { du: '2026-10-25', au: '2026-11-10', motif: 'voyage' } }),
    luneDe({ nextIso: '2026-11-01' }),
  ];
  const pieces = [pieceAk(), pieceAk({ id: 'inv-autre' })] as unknown as Invoice[];
  const piecesSeules = [pieceAk({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }, { id: 'mp-9', date: '2026-10-30', amountXof: 30000 }] })] as unknown as Invoice[];
  const jours = ['2026-10-02', '2026-10-20', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-12', '2026-12-03'];
  const garde = (a: Record<string, any>) => ({
    regleXof: a.regleXof, resteXof: a.resteXof, aRegleAujourdhuiXof: a.aRegleAujourdhuiXof, enRetardXof: a.enRetardXof,
    retardJours: a.retardJours, avoirXof: a.avoirXof, prochaine: a.prochaine ?? null,
    aVenir: a.aVenir.map((v: Record<string, unknown>) => [v.dueIso, v.montantXof, v.numero ?? null, v.genre]),
    echeances: a.echeances.map((e: Record<string, unknown>) => [e.numero, e.amountXof, e.dueIso, e.dueEcriteIso, e.resteXof, e.statut, e.retardJours]),
  });
  const ecarts: string[] = [];
  const ecartsEtat: string[] = [];
  let cas = 0;
  for (const p of [pieces, piecesSeules]) {
    for (const c of contrats) {
      for (const j of jours) {
        cas++;
        const plan = planDe(c);
        const regle = versementsPur(c, p).reduce((s, v) => s + v.montantXof, 0);
        const etatOriginal = etatDeLaFormule(c, plan, { jour: j, regleXof: regle, lignes: [] }).etat;
        const etatCopie = R.etatPourLArgent(c, plan, j, regle).etat;
        if (etatOriginal !== etatCopie) ecartsEtat.push(`${c.id}@${j}:${etatOriginal}/${etatCopie}`);
        if (etatOriginal === 'resiliee') continue; // la copie ne porte pas le prorata : un contrat résilié ne reçoit aucun message
        const a = garde(argentPur(c, plan, p, j, { etat: etatOriginal }));
        const b = garde(R.argentDuContrat(c, plan, p, j, { etat: etatCopie }));
        if (JSON.stringify(a) !== JSON.stringify(b)) ecarts.push(`${c.id}@${j}`);
      }
    }
  }
  dit(`la copie juge l'état qui décide de l'argent comme etatDeLaFormule (${cas} cas)`, [], ecartsEtat);
  dit(`la copie dit l'argent du juge unique, échéance par échéance (${cas} cas, résiliées à part)`, [], ecarts);
  dit('le versé : contrat et pièce réunis par identifiant, comme le juge',
    versementsPur(akouavi(), piecesSeules).map((v) => [v.id, v.montantXof]),
    R.versementsDuContrat(akouavi(), piecesSeules).map((v: Record<string, unknown>) => [v.id, v.montantXof]));
  const dates = ['2026-11-01', '2026-11-02', '2027-01-01', '2027-06-29'];
  dit('les jours dits avec l année, comme le juge', dates.map(jourDitPur), dates.map((d) => R.jourDitAvecLAnnee(d)));
  const sommes = [0, 500, 37500, 70000, 120000, 1234567];
  dit('les francs, comme le juge (espaces insécables)', sommes.map(francsPur), sommes.map((s) => R.francs(s)));
  dit('les deux fonctions jugent avec la même copie (relances-factures rend le même argent)',
    JSON.stringify(garde(R.argentDuContrat(akouavi(), CARNET, pieces, '2026-11-03', { etat: 'en-cours' }))),
    JSON.stringify(garde(L.argentDuContrat(akouavi(), CARNET, pieces, '2026-11-03', { etat: 'en-cours' }))));
}

/* ── 2. LES RÈGLES, TELLES QU'ELLES ONT ÉTÉ DITES ── */
const pieces = [pieceAk()];
const rappels = (c: ContratLu, j: string, p = pieces, lien = 0) => R.rappelsDuContrat(c, planDe(c), p, j, lien) as Record<string, unknown>[];
{
  /* La veille, jamais avant, jamais le jour même. */
  dit('échéance écrite le dimanche 1er novembre 2026 : jugée le lundi 2, rappel le dimanche 1er (la veille), rien le samedi 31 ni le lundi 2',
    [0, 1, 0], [rappels(akouavi(), '2026-10-31').length, rappels(akouavi(), '2026-11-01').length, rappels(akouavi(), '2026-11-02').length]);
  dit('le rappel dit la bonne échéance et son montant', [{ genre: 'echeance', numero: 2, dueIso: '2026-11-02', montantXof: 70000 }], rappels(akouavi(), '2026-11-01'));
  const mardi = akouavi({ echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-03', amountXof: 70000 }] });
  dit('échéance un mardi : rappel le lundi seulement', [1, 0, 0], [rappels(mardi, '2026-11-02').length, rappels(mardi, '2026-11-01').length, rappels(mardi, '2026-11-03').length]);
  /* Déjà réglée, quel que soit le registre. */
  const reglee = akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }, { id: 'v2', date: '2026-10-30', amountXof: 70000 }] });
  dit('déjà réglée au contrat : aucun rappel', 0, rappels(reglee, '2026-11-01').length);
  dit('réglée sur la pièce seule (MND PAY) : aucun rappel', 0,
    rappels(akouavi(), '2026-11-01', [pieceAk({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }, { id: 'mp-2', date: '2026-10-30', amountXof: 70000 }] })]).length);
  dit('payée par un lien que personne n a encore inscrit : aucun rappel ; en partie : le reste', [0, 30000],
    [rappels(akouavi(), '2026-11-01', pieces, 70000).length, (rappels(akouavi(), '2026-11-01', pieces, 40000)[0]?.montantXof as number) ?? null]);
  dit('le même versement au contrat et sur la pièce ne compte qu une fois', 1,
    rappels(akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }] }), '2026-11-01',
      [pieceAk({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 70000 }] })]).length);
  /* Rien de dû, rien à rappeler. */
  dit('retenue (prise en ligne, rien de réglé), effacée, résiliée, churn d avant : aucun rappel', [0, 0, 0, 0],
    [rappels(akouavi({ origine: 'couronne', payments: [], echeances: [{ numero: 1, dueIso: '2026-10-09', amountXof: 70000 }] }), '2026-10-08', [pieceAk({ payments: [] })]).length,
      rappels(akouavi({ origine: 'couronne', payments: [], renonceeLe: '2026-10-05' }), '2026-11-01', [pieceAk({ payments: [] })]).length,
      rappels(akouavi({ resilieeLe: '2026-10-20' }), '2026-11-01').length, rappels(akouavi({ status: 'churn' }), '2026-11-01').length]);
  /* Chaque Lune : la veille de la lune, jamais en pause, suspendue, ni après la fin. */
  dit('Chaque Lune : la veille de la lune qui se règle, « la prochaine lune », son prix', [{ genre: 'lune', dueIso: '2026-11-02', montantXof: 37500 }], rappels(luneDe(), '2026-11-01'));
  dit('Chaque Lune en pause (lune non réglée), suspendue demain, ou après la fin du contrat : rien', [0, 0, 0],
    [rappels(luneDe({ nextIso: '2026-10-30' }), '2026-11-01').length,
      rappels(luneDe({ suspendue: { du: '2026-11-02', au: '2026-11-20' } }), '2026-11-01').length,
      rappels(luneDe({ expiresIso: '2026-11-01' }), '2026-11-01').length]);
  dit('une lune déjà réglée d avance : son rappel attend la lune suivante', [0, 1],
    [rappels(luneDe({ nextIso: '2026-12-02' }), '2026-11-01').length, rappels(luneDe({ nextIso: '2026-12-02' }), '2026-12-01').length]);

  /* Les relances : le lendemain du jour dû au plus tôt, l'échu seulement, jamais une lune. */
  const relance = (c: ContratLu, j: string, p = pieceAk()) => L.echeanceARelancer(c, planDe(c), p, j, '2026-10-01') as Record<string, unknown> | null;
  dit('relance d une formule : rien avant le jour dû, rien le jour dû (lundi 2), la première le mardi 3, sur l échu seul',
    [null, null, null, { numero: 2, depart: '2026-11-02', resteXof: 70000 }],
    [relance(akouavi(), '2026-10-21'), relance(akouavi(), '2026-11-01'), relance(akouavi(), '2026-11-02'), relance(akouavi(), '2026-11-03')]);
  dit('jamais l à venir : trois échéances, la deuxième en retard, la troisième à venir, on ne réclame que la deuxième',
    { numero: 2, depart: '2026-11-03', resteXof: 40000 },
    relance(akouavi({ echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-03', amountXof: 40000 }, { numero: 3, dueIso: '2026-12-02', amountXof: 30000 }] }), '2026-11-10'));
  dit('Chaque Lune : jamais de relance, même avec une pièce qui garde un reste, même avec un échéancier écrit d avant', [null, null],
    [L.echeanceARelancer(luneDe({ invoiceId: 'inv-lune', nextIso: '2026-10-20' }), LUNE, { id: 'inv-lune', payments: [] }, '2026-11-03', '2026-10-01'),
      L.echeanceARelancer(luneDe({ invoiceId: 'inv-lune', echeances: [{ numero: 1, dueIso: '2026-10-03', amountXof: 37500 }, { numero: 2, dueIso: '2026-10-20', amountXof: 37500 }] }), LUNE,
        { id: 'inv-lune', payments: [{ id: 'l1', date: '2026-10-03', amountXof: 37500 }] }, '2026-11-03', '2026-10-01')]);
  dit('retenue, effacée, résiliée : aucune relance', [null, null, null],
    [relance(akouavi({ origine: 'couronne', payments: [] }), '2026-10-08', pieceAk({ payments: [] })),
      relance(akouavi({ origine: 'couronne', payments: [] }), '2026-11-05', pieceAk({ payments: [] })),
      relance(akouavi({ resilieeLe: '2026-10-20' }), '2026-11-05')]);
  dit('une pièce de formule se reconnaît : nommée par un contrat, ou par sa note', [true, true, false],
    [L.estUnePieceDeFormule({ id: 'inv-ab' }, new Set(['inv-ab'])), L.estUnePieceDeFormule({ id: 'x', note: 'Abonnement · GBÈJÍ™' }, new Set()),
      L.estUnePieceDeFormule({ id: 'y', note: 'Rituel du 3 novembre' }, new Set())]);
  dit('une suite de relances par échéance', ['rl-inv-ab-e2-1-whatsapp', 'rl-inv-ab-e3-1-whatsapp'],
    [L.idDeLaRelanceDEcheance('inv-ab', 2, 1), L.idDeLaRelanceDEcheance('inv-ab', 3, 1)]);

  /* Les mots : l'année, aucun numéro de pièce, aucune civilité supposée. */
  const v = R.variablesDuRappel({ appel: 'Akouavi', dueIso: '2026-11-02', genre: 'echeance', numero: 2, formule: 'GBÈJÍ™ · Carnet de Six', montantXof: 70000 }) as string[];
  dit('le rappel, mot pour mot comme la maquette',
    'Bonjour Akouavi,\nDemain, lundi 2 novembre 2026, arrive la deuxième échéance de votre formule GBÈJÍ™ · Carnet de Six : 70 000 F.\nVous pouvez la régler dès maintenant, en ligne, ou au comptoir de la Maison.',
    R.texteDuRappel(v));
  const vl = R.variablesDuRappel({ appel: 'Akouavi', dueIso: '2026-11-02', genre: 'lune', formule: 'GBÈJÍ™ · Chaque Lune', pourQui: 'Nadia', montantXof: 37500 }) as string[];
  dit('la lune, et la formule d une tête portée dite pour qui', ['la prochaine lune', 'GBÈJÍ™ · Chaque Lune, pour Nadia'], [vl[2], vl[3]]);
}

/* ── 2bis. LE PRIX REVU : ce qu'il fait aux échéances, dit en une phrase ── */
{
  /* Le Trône écrit l'échéancier revu avec le juge (echeancierApresPrixRevu) : on part de là. */
  const revu = (base: ContratLu, nouveau: number, le: string, p = pieces): ContratLu => {
    const e = echeancierApresPrixRevu(base, planDe(base), p as unknown as Invoice[], nouveau, le);
    return { ...base, echeances: e.echeances, prixConvenuXof: nouveau, prixRevu: { le, ancienXof: e.ancienXof, nouveauXof: nouveau, calibre: 'cal-micro' } } as ContratLu;
  };
  const effet = (c: ContratLu, j: string, p = pieces) => R.effetDuPrixRevu(c, planDe(c), p, j) as string | null;
  dit('plus cher : l écart s ajoute à la prochaine échéance, ancien et nouveau montant dits',
    'L’écart, 50 000 F, s’ajoute à votre prochaine échéance, le lundi 2 novembre 2026 : elle passe de 70 000 F à 120 000 F.',
    effet(revu(akouavi(), 190000, '2026-10-27'), '2026-10-27'));
  const toutRegle = akouavi({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 140000 }] });
  dit('plus cher alors que tout est réglé : une échéance neuve à 30 jours (le lundi si dimanche), datée avec l année',
    'L’écart, 50 000 F, devient une nouvelle échéance, le jeudi 26 novembre 2026.',
    effet(revu(toutRegle, 190000, '2026-10-27'), '2026-10-27'));
  dit('en sa faveur : se retranche de ce qui reste, la prochaine échéance redite',
    'En votre faveur, l’écart, 10 000 F, se retranche de ce qu’il vous reste à régler : votre prochaine échéance, le lundi 2 novembre 2026, est désormais de 60 000 F.',
    effet(revu(akouavi(), 130000, '2026-10-27'), '2026-10-27'));
  dit('en sa faveur, tout étant réglé : un avoir dans Ma Couronne',
    'En votre faveur, l’écart, 20 000 F, devient un avoir dans Ma Couronne.',
    effet(revu(toutRegle, 120000, '2026-10-27'), '2026-10-27'));
  dit('Chaque Lune : le nouveau prix vaut dès la prochaine lune',
    'Le nouveau prix vaut dès votre prochaine lune, le lundi 2 novembre 2026.',
    effet({ ...luneDe(), prixRevu: { le: '2026-10-27', ancienXof: 37500, nouveauXof: 45000 } } as ContratLu, '2026-10-27'));
  dit('aucun écart : aucune phrase, aucune annonce', [null, false],
    [effet({ ...akouavi(), prixRevu: { le: '2026-10-27', ancienXof: 140000, nouveauXof: 140000 } } as ContratLu, '2026-10-27'),
      R.annonceDuPrixRevu({ ...akouavi(), prixRevu: { le: '2026-10-27', ancienXof: 140000, nouveauXof: 140000 } }, CARNET, pieces, '2026-10-27')]);
  const c = revu(akouavi(), 190000, '2026-10-27');
  dit('l annonce : le jour même et les trois jours suivants, jamais avant, jamais après, jamais sur une résiliée', [false, true, true, false, false],
    [R.annonceDuPrixRevu(c, CARNET, pieces, '2026-10-26'), R.annonceDuPrixRevu(c, CARNET, pieces, '2026-10-27'), R.annonceDuPrixRevu(c, CARNET, pieces, '2026-10-30'),
      R.annonceDuPrixRevu(c, CARNET, pieces, '2026-10-31'), R.annonceDuPrixRevu({ ...c, resilieeLe: '2026-10-28' }, CARNET, pieces, '2026-10-29')]);
  const calibres = [{ id: 'cal-mini', name: 'Mini', maxLocks: 250 }, { id: 'cal-jumbo', name: 'Jumbo', maxLocks: 80 }, { id: 'cal-medium', name: 'Medium', maxLocks: 150 }, { id: 'cal-micro', name: 'Micro', maxLocks: 350 }, { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null }];
  dit('le calibre et sa fourchette, jamais un compte ; inconnu : rien', ['Micro, de 251 à 350 locks', 'Jumbo, jusqu’à 80 locks', 'Galaxy, plus de 350 locks', null],
    [R.calibreEtFourchette('cal-micro', calibres), R.calibreEtFourchette('cal-jumbo', calibres), R.calibreEtFourchette('cal-galaxy', calibres), R.calibreEtFourchette('cal-x', calibres)]);
  const vp = R.variablesDuPrixRevu({ appel: 'Akouavi', le: '2026-10-27', calibre: 'Micro, de 251 à 350 locks', formule: 'GBÈJÍ™ · Carnet de Six', ancienXof: 140000, nouveauXof: 190000, effet: effet(c, '2026-10-27') }) as string[];
  dit('l annonce, mot pour mot (le jour du comptage dit avec l année)',
    'Bonjour Akouavi,\nLe mardi 27 octobre 2026, la Maison a compté votre calibre : Micro, de 251 à 350 locks.\nLe prix de votre GBÈJÍ™ · Carnet de Six passe de 140 000 F à 190 000 F. L’écart, 50 000 F, s’ajoute à votre prochaine échéance, le lundi 2 novembre 2026 : elle passe de 70 000 F à 120 000 F.\nRien d’autre ne change. Le détail vous attend dans Ma Couronne.',
    R.texteDuPrixRevu(vp));
  const vn = R.variablesDuPrixRevu({ appel: 'Mme Akouavi', le: '2026-10-27', calibre: null, formule: 'GBÈJÍ™ · Carnet de Quatre', pourQui: 'Nadia', ancienXof: 126000, nouveauXof: 140000, effet: 'x' }) as string[];
  dit('pour une tête portée : le calibre et la formule de Nadia', ['le calibre de Nadia', 'la formule de Nadia, GBÈJÍ™ · Carnet de Quatre'], [vn[2], vn[3]]);
}

/* ── 3. LES VRAIES TOURNÉES, CONTRE UNE BASE SIMULÉE ── */
type Ligne = { id?: string; key?: string; branch_id?: string | null; data: any };
function base(tables: Record<string, Ligne[]>) {
  const T = new Map<string, Ligne[]>(Object.entries(tables).map(([k, v]) => [k, structuredClone(v)]));
  const ecrit: { t: string; op: string; id?: string }[] = [];
  const lignes = (t: string) => { if (!T.has(t)) T.set(t, []); return T.get(t)!; };
  const val = (l: Ligne, c: string): string | null | undefined => {
    if (c === 'id') return l.id; if (c === 'key') return l.key;
    if (c.startsWith('data->>')) { const v = l.data?.[c.slice(7)]; return v == null ? null : String(v); }
    return undefined;
  };
  const sb = {
    from(t: string) {
      const requete = () => {
        const filtres: ((l: Ligne) => boolean)[] = [];
        let lim = Infinity; let de = 0; let a = Infinity;
        const q = {
          select() { return q; },
          eq(c: string, v: unknown) { filtres.push((l) => val(l, c) === String(v)); return q; },
          gte(c: string, v: string) { filtres.push((l) => { const x = val(l, c); return x != null && x >= v; }); return q; },
          gt(c: string, v: string) { filtres.push((l) => { const x = val(l, c); return x != null && x > v; }); return q; },
          in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); filtres.push((l) => s.has(String(val(l, c)))); return q; },
          limit(k: number) { lim = k; return q; },
          range(x: number, y: number) { de = x; a = y; return q; },
          then(ok: (v: unknown) => unknown, ko2?: (e: unknown) => unknown) {
            const rows = lignes(t).filter((l) => filtres.every((f) => f(l))).slice(de, a + 1).slice(0, lim).map((l) => structuredClone(l));
            return Promise.resolve({ data: rows, error: null }).then(ok, ko2);
          },
        };
        return q;
      };
      return {
        select: () => requete(),
        upsert(l: Ligne) { const Lg = lignes(t); const i = Lg.findIndex((x) => x.id === l.id); if (i >= 0) Lg[i] = structuredClone(l); else Lg.push(structuredClone(l)); ecrit.push({ t, op: 'upsert', id: l.id }); return Promise.resolve({ error: null }); },
        insert(l: Ligne) { lignes(t).push(structuredClone(l)); ecrit.push({ t, op: 'insert', id: l.id }); return Promise.resolve({ error: null }); },
        update(p: Partial<Ligne>) {
          return { eq(c: string, v: unknown) { for (const l of lignes(t)) if (val(l, c) === String(v)) Object.assign(l, structuredClone(p)); ecrit.push({ t, op: 'update', id: String(v) }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
  return { sb, T, ecrit, lignes };
}
const fiche = (id: string, phone: string | undefined, extra: Record<string, unknown> = {}): Ligne => ({ id, data: { name: 'Akouavi Essai', ...(phone ? { phone } : {}), ...extra } });
const facteur = (ms: number, vivant = true): Ligne => ({ key: 'mnd_facteur', data: { vuLe: new Date(ms - (vivant ? 60_000 : 3_600_000)).toISOString() } });
const contrat = (c: ContratLu): Ligne => ({ id: c.id, branch_id: 'b1', data: c });
const planL = (p: Plan): Ligne => ({ id: p.id, data: p });
const pieceL = (p: Record<string, any>): Ligne => ({ id: p.id, branch_id: 'b1', data: p });
const BANDES: Ligne = { key: 'mnd_model_bands', data: [{ id: 'cal-mini', name: 'Mini', maxLocks: 250 }, { id: 'cal-micro', name: 'Micro', maxLocks: 350 }] };
/** Dimanche 1er novembre 2026, 10 h 05 à Cotonou. */
const VEILLE = Date.parse('2026-11-01T09:05:00Z');
const MODELES = { MODELE_RAPPEL: 'rappel_echeance_veille', MODELE_PRIX_REVU: 'prix_revu_apres_comptage' };
const joueR = async (tables: Record<string, Ligne[]>, o: { maintenantMs?: number; WA?: boolean; envoie?: unknown; modeles?: Partial<typeof MODELES> } = {}) => {
  const b = base(tables);
  const ms = o.maintenantMs ?? VEILLE;
  const r = await R.tournee(b.sb, { maintenantMs: ms, ...MODELES, ...(o.modeles ?? {}), WA_TOKEN: o.WA ? 't' : '', WA_PHONE_ID: o.WA ? 'p' : '', envoie: o.envoie });
  return { r: r as Record<string, any>, ...b };
};
const monde = (ms = VEILLE, extra: Partial<Record<string, Ligne[]>> = {}): Record<string, Ligne[]> => ({
  documents: [facteur(ms), BANDES],
  subscribers: [contrat(akouavi())],
  plans: PLANS.map(planL),
  invoices: [pieceL(pieceAk())],
  clients: [fiche('c-ak', '0197000014')],
  ...extra,
} as Record<string, Ligne[]>);
const sansNumeroDePiece = (t: string) => !/MND-\d|ABO-\d|\d{4}-\d{3,4}/.test(t);
{
  const A = await joueR(monde());
  const env = A.lignes('envois');
  const l = env[0]?.data;
  dit('la veille à 10 h 05 : un rappel déposé en salle, « en-attente », son identifiant, sans rendez-vous à vérifier',
    [1, 1, 'rv-abo-14-e2-2026-11-02-whatsapp', 'en-attente', 'rappel-echeance', ''], [A.r.messages, env.length, l?.id, l?.statut, l?.type, l?.apptId]);
  dit('le colis : le modèle et ses cinq variables, l année dite', ['rappel_echeance_veille', ['Akouavi', 'lundi 2 novembre 2026', 'la deuxième échéance', 'GBÈJÍ™ · Carnet de Six', '70 000 F']],
    [l?.colis?.modele, l?.colis?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text)]);
  dit('aucun numéro de pièce ni référence dans ce qu elle lit, et le fil garde le texte du modèle', [true, true],
    [sansNumeroDePiece(String(l?.colis?.texteAuFil) + JSON.stringify(l?.colis?.composants)), /^Bonjour Akouavi,\nDemain, lundi 2 novembre 2026/.test(String(l?.colis?.texteAuFil))]);
  dit('le message part après la salle (10 minutes), jamais tout de suite', '2026-11-01T09:15:00.000Z', l?.partA);

  const B = await joueR({ ...monde(), envois: env.map((x) => structuredClone(x)) });
  dit('une seconde tournée le même jour : rien de plus', [0, 0], [B.r.messages ?? 0, B.ecrit.filter((x) => x.t === 'envois').length]);
  const C = await joueR({ ...monde(), envois: [{ id: 'rv-abo-14-e2-2026-11-02-whatsapp', data: { statut: 'échec' } }] });
  dit('un échec du matin se retente', [1, 'en-attente'], [C.r.messages, C.lignes('envois')[0]?.data?.statut]);
  const D = await joueR(monde(Date.parse('2026-11-01T08:30:00Z')), { maintenantMs: Date.parse('2026-11-01T08:30:00Z') });
  dit('à 9 h 30 : pas encore (le rappel part à 10 h)', [0, 0], [D.r.messages === 'pas-encore' ? 0 : D.r.messages, D.lignes('envois').length]);
  const E = await joueR(monde(Date.parse('2026-10-31T09:05:00Z')), { maintenantMs: Date.parse('2026-10-31T09:05:00Z') });
  const F = await joueR(monde(Date.parse('2026-11-02T09:05:00Z')), { maintenantMs: Date.parse('2026-11-02T09:05:00Z') });
  dit('l avant-veille et le jour dû : rien', [0, 0], [E.lignes('envois').length, F.lignes('envois').length]);
  const G = await joueR(monde(VEILLE, { mnd_pay: [{ id: 'mp-1', data: { pieceId: 'inv-ab', genre: 'lien', moyen: 'tapgo', statut: 'payee', montantXof: 70000 } }] }));
  dit('payée hier par un lien que personne n a inscrit : pas de rappel', 0, G.lignes('envois').length);
  const H = await joueR(monde(VEILLE, { clients: [fiche('c-ak', '0197000014', { archived: true })] }));
  const I = await joueR(monde(VEILLE, { clients: [fiche('c-ak', undefined)] }));
  dit('fiche archivée ou sans numéro : rien, et la réponse dit pourquoi', [0, 1, 0, 1],
    [H.lignes('envois').length, H.r.sautes?.archivee, I.lignes('envois').length, I.r.sautes?.['sans-numero']]);
  /* La tête portée : on écrit à celle qui paie pour son foyer, en disant pour qui. */
  const nadia = akouavi({ id: 'abo-30', clientId: 'c-na', name: 'Nadia Essai', planId: 'carnet-quatre', reference: 'ABO-2026-030', invoiceId: 'inv-na', priceXof: 126000,
    echeances: [{ numero: 1, dueIso: '2026-10-02', amountXof: 63000 }, { numero: 2, dueIso: '2026-11-01', amountXof: 63000 }],
    payments: [{ id: 'n1', date: '2026-10-02', amountXof: 63000 }] });
  const J = await joueR(monde(VEILLE, {
    subscribers: [contrat(nadia)], invoices: [pieceL(pieceAk({ id: 'inv-na', clientId: 'c-na', payments: [{ id: 'n1', date: '2026-10-02', amountXof: 63000 }] }))],
    clients: [fiche('c-na', undefined, { name: 'Nadia Essai', familyId: 'fam-1' }), fiche('c-ak', '0197000014', { civilite: 'madame' })],
    families: [{ id: 'fam-1', data: { payerClientId: 'c-ak' } }],
  }));
  const lj = J.lignes('envois')[0]?.data;
  dit('tête portée : le rappel va à celle qui paie, appelée par sa civilité connue, la formule dite pour Nadia',
    ['2290197000014', 'c-ak', 'Mme Akouavi', 'GBÈJÍ™ · Carnet de Quatre, pour Nadia'],
    [lj?.numero, lj?.clientId, lj?.colis?.composants?.[0]?.parameters?.[0]?.text, lj?.colis?.composants?.[0]?.parameters?.[3]?.text]);
  /* Le prix revu. */
  const e = echeancierApresPrixRevu(akouavi(), CARNET, [pieceAk()] as unknown as Invoice[], 190000, '2026-10-27');
  const revue = akouavi({ echeances: e.echeances, prixConvenuXof: 190000, prixRevu: { le: '2026-10-27', ancienXof: 140000, nouveauXof: 190000, calibre: 'cal-micro' } });
  const MARDI = Date.parse('2026-10-27T17:40:00Z');
  const K = await joueR(monde(MARDI, { subscribers: [contrat(revue)] }), { maintenantMs: MARDI });
  const lk = K.lignes('envois')[0]?.data;
  dit('le prix revu, le soir même : une annonce déposée, son identifiant, son modèle, ses sept variables',
    [1, 'pr-abo-14-2026-10-27-190000-whatsapp', 'prix-revu', 'prix_revu_apres_comptage', 7],
    [K.r.messages, lk?.id, lk?.type, lk?.colis?.modele, lk?.colis?.composants?.[0]?.parameters?.length]);
  dit('elle dit le calibre et sa fourchette, l ancien et le nouveau prix, et l échéance qui porte l écart', true,
    /votre calibre : Micro, de 251 à 350 locks/.test(lk?.colis?.texteAuFil) && /passe de 140 000 F à 190 000 F/.test(lk?.colis?.texteAuFil) && /elle passe de 70 000 F à 120 000 F/.test(lk?.colis?.texteAuFil));
  const K2 = await joueR({ ...monde(MARDI, { subscribers: [contrat(revue)] }), envois: K.lignes('envois').map((x) => structuredClone(x)) }, { maintenantMs: MARDI });
  dit('une seule annonce par prix revu', 0, K2.lignes('envois').filter((x) => x.id !== lk?.id).length + (K2.r.messages || 0));
  const K3 = await joueR(monde(MARDI, { subscribers: [contrat(revue)] }), { maintenantMs: MARDI, modeles: { MODELE_PRIX_REVU: '' } });
  dit('sans son modèle approuvé, l annonce ne part pas', 0, K3.lignes('envois').length);
  /* Le facteur se tait : envoi direct, jamais la nuit. */
  const appels: string[] = [];
  const envoie = async (_u: string, init: { body: string }) => { appels.push(init.body); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
  const M = await joueR(monde(VEILLE, { documents: [facteur(VEILLE, false), BANDES] }), { WA: true, envoie });
  dit('facteur muet : l envoi direct part, consigné « envoyé », le fil garde le texte', [1, 1, 'envoyé', 1],
    [M.r.messages, appels.length, M.lignes('envois')[0]?.data?.statut, M.lignes('messages_wa').length]);
  dit('l envoi direct porte le modèle et seulement le corps (le bouton de Ma Couronne est fixe)', ['rappel_echeance_veille', 1, 'body'],
    (() => { const b = JSON.parse(appels[0] ?? '{}'); return [b.template?.name, b.template?.components?.length, b.template?.components?.[0]?.type]; })());
  const N = await joueR(monde(VEILLE, { documents: [BANDES] }));
  dit('sans facteur ni clés : rien', 'sans-facteur', N.r.messages);
  /* La borne. */
  const beaucoup = Array.from({ length: 45 }, (_, i) => contrat(akouavi({ id: `abo-${i}`, clientId: `c${i}`, invoiceId: `inv-${i}` })));
  const leursPieces = Array.from({ length: 45 }, (_, i) => pieceL(pieceAk({ id: `inv-${i}`, clientId: `c${i}` })));
  const leurs = Array.from({ length: 45 }, (_, i) => fiche(`c${i}`, `01970000${String(i).padStart(2, '0')}`));
  const P = await joueR(monde(VEILLE, { subscribers: beaucoup, invoices: leursPieces, clients: leurs }));
  dit('quarante messages au plus par passage, et la réponse le dit', [40, 40], [P.r.messages, P.r.borne]);
}

/* ── 3bis. LES RELANCES D'UNE FORMULE, DANS LA VRAIE TOURNÉE DE relances-factures ── */
{
  const reglages = { key: 'mnd_settings', data: { relances: { actives: true, depuis: '2026-10-18' }, mndPay: { actif: true } } };
  /* Une formule signée le 20 octobre 2026 : sa pièce, datée du jour, porte le prix entier. */
  const signe20 = akouavi({ id: 'abo-40', sinceIso: '2026-10-20', startIso: '2026-10-20', invoiceId: 'inv-40',
    echeances: [{ numero: 1, dueIso: '2026-10-20', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-19', amountXof: 70000 }],
    payments: [{ id: 'w1', date: '2026-10-20', amountXof: 70000 }] });
  const piece40 = pieceL(pieceAk({ id: 'inv-40', date: '2026-10-20', creeeLe: '2026-10-20T10:00:00Z', payments: [{ id: 'w1', date: '2026-10-20', amountXof: 70000 }] }));
  const joueL = async (ms: number, extra: Partial<Record<string, Ligne[]>> = {}) => {
    const b = base({ documents: [reglages, facteur(ms)], subscribers: [contrat(signe20)], plans: PLANS.map(planL), invoices: [piece40], clients: [fiche('c-ak', '0197000014')], ...extra } as Record<string, Ligne[]>);
    const r = await L.tournee(b.sb, { maintenantMs: ms, MODELE: 'rappel_de_reglement', WA_TOKEN: '', WA_PHONE_ID: '' });
    return { r: r as Record<string, any>, ...b };
  };
  const A = await joueL(Date.parse('2026-10-21T09:00:00Z'));
  dit('le lendemain de la signature : la pièce garde 70 000 F, mais rien n est dû, aucune relance (avant : J+1)', [0, 0], [A.r.relances, A.lignes('envois').length]);
  const B = await joueL(Date.parse('2026-11-19T09:00:00Z'));
  dit('le jour dû (jeudi 19 novembre 2026) : aucune relance', 0, B.lignes('envois').length);
  const C = await joueL(Date.parse('2026-11-20T09:00:00Z'));
  const lc = C.lignes('envois')[0]?.data;
  const att = C.lignes('mnd_pay')[0]?.data;
  dit('le lendemain : la première relance de la deuxième échéance, sur l échu seul, et l attente Tap & Go au même total',
    [1, 'rl-inv-40-e2-1-whatsapp', 'abo-40', 2, '70 000 F', 'abo-40'],
    [C.r.relances, lc?.id, lc?.subId, lc?.echeance, lc?.colis?.composants?.[0]?.parameters?.[2]?.text, att?.subId]);
  dit('jamais un numéro de pièce dans la relance', true, sansNumeroDePiece(String(lc?.colis?.texteAuFil) + JSON.stringify(lc?.colis?.composants?.[0])));
  const D = await joueL(Date.parse('2026-11-20T09:00:00Z'), { subscribers: [contrat(akouavi({ ...signe20, planId: 'chaque-lune', echeances: undefined, nextIso: '2026-11-10' }))] });
  dit('une Chaque Lune : jamais relancée, même sa pièce garde un reste', 0, D.lignes('envois').length);
  /* Une échéance écrite un dimanche : jugée le lundi, relancée le mardi. */
  const dimanche = akouavi({ id: 'abo-41', sinceIso: '2026-10-18', startIso: '2026-10-18', invoiceId: 'inv-41',
    echeances: [{ numero: 1, dueIso: '2026-10-18', amountXof: 70000 }, { numero: 2, dueIso: '2026-11-15', amountXof: 70000 }],
    payments: [{ id: 'w2', date: '2026-10-18', amountXof: 70000 }] });
  const piece41 = pieceL(pieceAk({ id: 'inv-41', date: '2026-10-18', creeeLe: '2026-10-18T10:00:00Z', payments: [{ id: 'w2', date: '2026-10-18', amountXof: 70000 }] }));
  const E1 = await joueL(Date.parse('2026-11-16T09:00:00Z'), { subscribers: [contrat(dimanche)], invoices: [piece41] });
  const E2 = await joueL(Date.parse('2026-11-17T09:00:00Z'), { subscribers: [contrat(dimanche)], invoices: [piece41] });
  dit('écrite le dimanche 15 novembre 2026 : rien le lundi 16 (jour dû), la première le mardi 17', [0, 1], [E1.lignes('envois').length, E2.lignes('envois').length]);
  /* La facture ordinaire ne change pas. */
  const ordinaire = pieceL({ id: 'inv-o', kind: 'facture', status: 'envoyée', date: '2026-10-20', creeeLe: '2026-10-20T11:00:00Z', number: 'MND-2026-0300', branchId: 'b1', clientId: 'c-ak', lines: [{ qty: 1, unitXof: 25000, discountPct: 0 }], globalDiscountPct: 0, payments: [] });
  const F = await joueL(Date.parse('2026-10-21T09:00:00Z'), { invoices: [piece40, ordinaire] });
  dit('une facture ordinaire garde sa relance à J+1, à côté d une formule qui n en a pas', [1, 'rl-inv-o-1-whatsapp'], [F.r.relances, F.lignes('envois')[0]?.id]);
  /* La tête portée sans numéro : la relance va à celle qui paie. */
  const G = await joueL(Date.parse('2026-11-20T09:00:00Z'), {
    subscribers: [contrat(akouavi({ ...signe20, clientId: 'c-na' }))], invoices: [pieceL(pieceAk({ id: 'inv-40', clientId: 'c-na', date: '2026-10-20', payments: [{ id: 'w1', date: '2026-10-20', amountXof: 70000 }] }))],
    clients: [fiche('c-na', undefined, { name: 'Nadia Essai', familyId: 'fam-1' }), fiche('c-ak', '0197000014')], families: [{ id: 'fam-1', data: { payerClientId: 'c-ak' } }],
  });
  dit('tête portée sans numéro : la relance va à celle qui paie pour son foyer', '2290197000014', G.lignes('envois')[0]?.data?.numero);
  /* UNE FACTURE ORDINAIRE VA AU PAYEUR DU COMPTE FAMILLE (28 octobre 2026,
     « les messages de relance doivent partir au parent », Yéman), au rythme
     des comptes famille (J+7 d'origine) ; la formule, elle, garde le rythme
     de son échéancier (plus haut, G). */
  const ordinaireDeNadia = pieceL({ id: 'inv-n', kind: 'facture', status: 'envoyée', date: '2026-10-20', creeeLe: '2026-10-20T11:00:00Z', number: 'MND-2026-0301', branchId: 'b1', clientId: 'c-na', lines: [{ qty: 1, unitXof: 25000, discountPct: 0 }], globalDiscountPct: 0, payments: [] });
  const H = await joueL(Date.parse('2026-10-21T09:00:00Z'), {
    subscribers: [], invoices: [ordinaireDeNadia],
    clients: [fiche('c-na', undefined, { name: 'Nadia Essai', familyId: 'fam-1' }), fiche('c-ak', '0197000014')], families: [{ id: 'fam-1', data: { payerClientId: 'c-ak' } }],
  });
  const H7 = await joueL(Date.parse('2026-10-27T09:00:00Z'), {
    subscribers: [], invoices: [ordinaireDeNadia],
    clients: [fiche('c-na', undefined, { name: 'Nadia Essai', familyId: 'fam-1' }), fiche('c-ak', '0197000014')], families: [{ id: 'fam-1', data: { payerClientId: 'c-ak' } }],
  });
  dit('facture ordinaire d une tête sans numéro : au payeur de son compte famille, à J+7 (rien à J+1)', [0, 1, '2290197000014'],
    [H.r.relances, H7.r.relances, H7.lignes('envois')[0]?.data?.numero]);
  const ordinaireSoignee = pieceL({ id: 'inv-s', kind: 'facture', status: 'envoyée', date: '2026-10-20', creeeLe: '2026-10-20T11:00:00Z', number: 'MND-2026-0302', branchId: 'b1', clientId: 'c-pa', forClientId: 'c-so', lines: [{ qty: 1, unitXof: 25000, discountPct: 0 }], globalDiscountPct: 0, payments: [] });
  const I = await joueL(Date.parse('2026-10-21T09:00:00Z'), {
    subscribers: [], invoices: [ordinaireSoignee],
    clients: [fiche('c-pa', undefined, { name: 'Payeuse Essai', familyId: 'fam-2' }), fiche('c-so', '0197000099', { name: 'Soignee Essai' }), fiche('c-fo', '0197000077')],
    families: [{ id: 'fam-2', data: { payerClientId: 'c-fo' } }],
  });
  const I7 = await joueL(Date.parse('2026-10-27T09:00:00Z'), {
    subscribers: [], invoices: [ordinaireSoignee],
    clients: [fiche('c-pa', undefined, { name: 'Payeuse Essai', familyId: 'fam-2' }), fiche('c-so', '0197000099', { name: 'Soignee Essai' }), fiche('c-fo', '0197000077')],
    families: [{ id: 'fam-2', data: { payerClientId: 'c-fo' } }],
  });
  dit('facture ordinaire, payeuse d un compte famille : au payeur du compte, jamais la soignée, à J+7', [0, '2290197000077', 'c-fo'],
    [I.r.relances, I7.lignes('envois')[0]?.data?.numero, I7.lignes('envois')[0]?.data?.clientId]);
}

/* ── 3ter. LES REGLES DU 20 OCTOBRE AU SOIR (tranchees au selecteur, et la reponse a la sonde) ── */
{
  const seanceAk = (o: Record<string, unknown>): SeanceLue => ({
    id: 's', branchId: 'b1', clientId: 'c-ak', serviceIds: ['svc-gbeji'], date: '2026-10-06', time: '10:00', master: 'm',
    status: 'honoré', coveredBySub: true, coverKind: 'abonnement', subId: 'abo-14', ...o,
  } as unknown as SeanceLue);
  const deux = [seanceAk({ id: 'a1', date: '2026-10-06' }), seanceAk({ id: 'a2', date: '2026-10-16' })];
  const quatre = [...deux, seanceAk({ id: 'a7', date: '2026-10-23' }), seanceAk({ id: 'a8', date: '2026-10-27' })];
  const varie = [...deux,
    seanceAk({ id: 'm20', date: '2026-10-22', status: 'annulé', annuleeLe: '2026-10-21T14:00:00+01:00', annuleePar: 'cliente' }),
    seanceAk({ id: 'm49', date: '2026-10-23', status: 'annulé', annuleeLe: '2026-10-21T09:00:00+01:00', annuleePar: 'cliente' }),
    seanceAk({ id: 'mm', date: '2026-10-25', status: 'annulé', annuleeLe: '2026-10-25T08:00:00+01:00', annuleePar: 'maison' }),
    seanceAk({ id: 'ab', date: '2026-10-19', status: 'confirmé', absente: { le: '2026-10-19' } }),
    seanceAk({ id: 'rd', date: '2026-10-18', status: 'confirmé', absente: { le: '2026-10-18' }, rendue: { le: '2026-10-19', motif: 'malade' } }),
    seanceAk({ id: 'fo', date: '2026-10-24', coverKind: 'forfait' }),
    seanceAk({ id: 'sl', date: '2026-10-26', subId: undefined }),
    seanceAk({ id: 'au', date: '2026-10-26', clientId: 'c-autre' }),
    seanceAk({ id: 'ap', date: '2026-11-04' })];
  const autre = akouavi({ id: 'abo-q', planId: 'carnet-quatre', reference: 'ABO-2026-040', sinceIso: '2026-10-12', startIso: '2026-10-12', invoiceId: 'inv-q',
    echeances: [{ numero: 1, dueIso: '2026-10-12', amountXof: 126000 }], payments: [{ id: 'q1', date: '2026-10-12', amountXof: 126000 }] });
  const cas: { c: ContratLu; subs: ContratLu[]; appts: SeanceLue[]; jours: string[] }[] = [
    { c: akouavi({ resilieeLe: '2026-10-20' }), subs: [], appts: [...deux, seanceAk({ id: 'a3', date: '2026-11-03', status: 'confirmé' })], jours: ['2026-10-20', '2026-10-30'] },
    { c: akouavi({ resilieeLe: '2026-11-01' }), subs: [], appts: quatre, jours: ['2026-11-01', '2026-11-03'] },
    { c: akouavi({ resilieeLe: '2026-10-28' }), subs: [], appts: varie, jours: ['2026-10-28', '2026-11-10'] },
    { c: akouavi({ resilieeLe: '2026-10-28' }), subs: [autre], appts: [...varie, seanceAk({ id: 'q-1', subId: 'abo-q', date: '2026-10-20' })], jours: ['2026-11-10'] },
    { c: akouavi({ resilieeLe: '2026-10-28', payments: [] }), subs: [], appts: quatre, jours: ['2026-11-10'] },
    { c: akouavi({ resilieeLe: '2026-10-28', echeances: undefined }), subs: [], appts: quatre, jours: ['2026-11-10'] },
  ];
  const ecarts: string[] = [];
  let k = 0;
  for (const x of cas) {
    for (const j of x.jours) {
      k++;
      const subs = [x.c, ...x.subs];
      const juge = [...releveDeLAbonnee({ jour: j, clientId: 'c-ak', subs, plans: PLANS, appts: x.appts, invoices: [pieceAk()] as unknown as Invoice[] }).anciens]
        .find((c) => c.sub.id === x.c.id)?.argent.prorata ?? null;
      const copie = L.prorataDeLaResiliation(x.c, planDe(x.c), [pieceAk()], subs, PLANS, x.appts, j);
      const garde = (p: Record<string, unknown> | null) => p && [p.seances, p.comptees, p.consommeXof, p.avoirXof, p.resteXof, p.dueIso];
      if (JSON.stringify(garde(juge as Record<string, unknown> | null)) !== JSON.stringify(garde(copie))) ecarts.push(`${x.c.resilieeLe}@${j}`);
    }
  }
  dit(`le bloc resiliation dit le prorata du juge unique, seance par seance (${k} cas : manquees, rendue, maison, absente, forfait, sans lien, deux contrats)`, [], ecarts);

  /* Règle 2 : le consommé au-delà du réglé est dû le jour de la résiliation (le lundi si dimanche), et se relance comme une échéance. */
  const relanceRes = (c: ContratLu, appts: SeanceLue[], j: string) => L.resteDeResiliationARelancer(c, planDe(c), pieceAk(), [c], PLANS, appts, j, '2026-10-01') as Record<string, unknown> | null;
  const dim = akouavi({ resilieeLe: '2026-11-01' });
  dit('resiliee le dimanche 1er novembre 2026, 4 seances faites pour 70 000 F : rien le lundi 2 (jour du), la premiere relance le mardi 3, sur 23 333 F',
    [null, null, { depart: '2026-11-02', resteXof: 23333 }], [relanceRes(dim, quatre, '2026-11-01'), relanceRes(dim, quatre, '2026-11-02'), relanceRes(dim, quatre, '2026-11-03')]);
  dit('resiliee avec un avoir (2 seances faites) : rien a relancer, et l echeance annulee non plus', [null, null],
    [relanceRes(akouavi({ resilieeLe: '2026-10-20' }), deux, '2026-11-05'), L.echeanceARelancer(akouavi({ resilieeLe: '2026-10-20' }), CARNET, pieceAk(), '2026-11-05', '2026-10-01')]);
  dit('sa suite de relances a son propre identifiant', 'rl-inv-ab-r-1-whatsapp', L.idDeLaRelanceDeResiliation('inv-ab', 1));
  const reglages = { key: 'mnd_settings', data: { relances: { actives: true, depuis: '2026-10-18' }, mndPay: { actif: true } } };
  const joueL = async (ms: number, tables: Partial<Record<string, Ligne[]>>) => {
    const b = base({ documents: [reglages, facteur(ms)], plans: PLANS.map(planL), invoices: [pieceL(pieceAk())], clients: [fiche('c-ak', '0197000014')], ...tables } as Record<string, Ligne[]>);
    const r = await L.tournee(b.sb, { maintenantMs: ms, MODELE: 'rappel_de_reglement', WA_TOKEN: '', WA_PHONE_ID: '' });
    return { r: r as Record<string, any>, ...b };
  };
  const rdvL = (a: SeanceLue): Ligne => ({ id: a.id, branch_id: 'b1', data: a });
  const T1 = await joueL(Date.parse('2026-11-02T09:00:00Z'), { subscribers: [contrat(dim)], appointments: quatre.map(rdvL) });
  const T2 = await joueL(Date.parse('2026-11-03T09:00:00Z'), { subscribers: [contrat(dim)], appointments: quatre.map(rdvL) });
  const l2 = T2.lignes('envois')[0]?.data;
  dit('dans la vraie tournee : rien le jour du, puis la relance du reste de la resiliation, marquee comme telle, au bon montant',
    [0, 1, 'rl-inv-ab-r-1-whatsapp', true, 'abo-14', '23333'],
    [T1.lignes('envois').length, T2.r.relances, l2?.id, l2?.resiliation, l2?.subId, String(l2?.colis?.composants?.[0]?.parameters?.[2]?.text ?? '').replace(/\D/g, '')]);
  dit('jamais un numero de piece dans cette relance', true, sansNumeroDePiece(String(l2?.colis?.texteAuFil) + JSON.stringify(l2?.colis?.composants?.[0])));

  /* Règle 4 : un paquet sans échéancier n'est jamais en retard, jamais rappelé, jamais relancé. */
  const sansEch = akouavi({ echeances: undefined, prixConvenuXof: 234000, priceXof: 234000, payments: [{ id: 'v1', date: '2026-10-02', amountXof: 50000 }] });
  const pieceSansEch = pieceAk({ payments: [{ id: 'v1', date: '2026-10-02', amountXof: 50000 }] });
  const a = R.argentDuContrat(sansEch, CARNET, [pieceSansEch], '2026-12-15', { etat: 'en-cours' }) as Record<string, unknown>;
  dit('sans echeancier : 184 000 F a convenir, rien d echu ni en retard', { aConvenir: 184000, aPoser: true, aRegler: 0, retard: 0 },
    { aConvenir: a.aConvenirXof, aPoser: a.echeancierAPoser, aRegler: a.aRegleAujourdhuiXof, retard: a.enRetardXof });
  const jours = ['2026-10-02', '2026-10-03', '2026-11-01', '2026-11-02', '2026-12-15', '2027-03-01'];
  dit('sans echeancier : aucun rappel, aucune relance, quel que soit le jour', [0, 0],
    [jours.reduce((n2, j) => n2 + R.rappelsDuContrat(sansEch, CARNET, [pieceSansEch], j, 0).length, 0),
      jours.filter((j) => L.echeanceARelancer(sansEch, CARNET, pieceSansEch, j, '2026-10-01') !== null).length]);
  const T3 = await joueL(Date.parse('2026-12-15T09:00:00Z'), { subscribers: [contrat(sansEch)], invoices: [pieceL(pieceSansEch)] });
  dit('dans la vraie tournee : rien ne part pour un paquet sans echeancier', 0, T3.lignes('envois').length);

  /* L'ancien carnet « exhausted » : épuisé pour de bon, mais son échéance impayée reste due et se rappelle. */
  dit('un carnet exhausted se lit epuise, comme le juge', ['epuisee', 'epuisee'],
    [L.etatPourLArgent(akouavi({ status: 'exhausted' }), CARNET, '2026-10-20', 70000).etat,
      etatDeLaFormule(akouavi({ status: 'exhausted' }), CARNET, { jour: '2026-10-20', regleXof: 70000, lignes: [] }).etat]);
  dit('... et son echeance impayee se rappelle la veille et se relance le lendemain, comme toute echeance', [1, true],
    [R.rappelsDuContrat(akouavi({ status: 'exhausted' }), CARNET, [pieceAk()], '2026-11-01', 0).length,
      L.echeanceARelancer(akouavi({ status: 'exhausted' }), CARNET, pieceAk(), '2026-11-03', '2026-10-01') !== null]);
}

/* ── 4. LA FONCTION ── */
{
  const src = lis(RAPPELS);
  const serve = src.slice(src.indexOf('Deno.serve('));
  const iGet = serve.indexOf("  if (req.method === 'GET') {");
  const brancheGet = iGet < 0 ? '' : serve.slice(iGet, serve.indexOf('\n  }\n', iGet));
  dit('le contrôle de santé (GET) répond avant la clé, sans toucher la base, et dit sa version', [true, true, true],
    [iGet > 0 && iGet < serve.indexOf('const cleRecue'), !/cleRecue|createClient|sb\.|tournee\(/.test(brancheGet),
      /return json\(\{\s*fonction: 'rappels-d-echeance', version: VERSION,/.test(brancheGet)]);
  dit('seul le cron réveille la tournée, et rien ne part sans un modèle nommé', [true, true],
    [/if \(!service \|\| cleRecue !== service\)/.test(serve), /if \(!MODELE_RAPPEL && !MODELE_PRIX_REVU\) return json\(\{ version: VERSION, messages: 'sans-modele' \}\);/.test(serve)]);
  dit('aucune date jugée sur updated_at, aucun Date.now dans la tournée', [false, false],
    [/updated_at/.test(extrais(RAPPELS, 'tournee')), /Date\.now\(\)/.test(extrais(RAPPELS, 'tournee'))]);
  dit('aucun tiret cadratin dans ce que la cliente lit', false, /—/.test(extrais(RAPPELS, 'phrases')));
}

if (ko) { console.error(`\n${ko} controle(s) en echec sur ${n}.`); process.exit(1); }
console.log(`\nLes messages de l abonnee tiennent leurs promesses (${n} epreuves).`);
