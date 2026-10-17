/* MND PAY, ÉPROUVÉ — 16 octobre 2026.

   Maquette UigU1Rr5… validée (« construis »). Ce qui se joue ici est de
   l'argent qu'une cliente a vraiment versé : une erreur ne plante pas, elle
   fait payer deux fois, laisse un franc sans pièce, ou passe au vert un
   paiement que FedaPay n'a jamais confirmé.

   1. LES FRAIS ajoutés pour la cliente (sa décision), au franc supérieur.
   2. LE MOYEN ET LE VERSEMENT que la pièce reçoit (identifiant = demande).
   3. LE LIEN PAYÉ règle sa pièce une fois, et une seule.
   4. L'ARGENT À RATTACHER : jamais un franc reçu sans pièce, en silence.
   5. LE VRAI CODE DU SERVEUR, extrait des fichiers à coller : la signature de
      FedaPay, les statuts, les numéros, l'échéance suivante de KkiaPay.
   6. LES RÈGLES DANS LE CODE : personne au Trône n'écrit la table, une
      demande ne part jamais en différé, le webhook vérifie avant de lire.
   7. TAP & GO (17 octobre 2026) : le code USSD, montant compris ; le paiement
      reconnu au montant exact, dans la demi-heure, une seule attente ou rien ;
      le VRAI code du serveur rejoué contre une base simulée, de bout en bout. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { transformSync } from 'esbuild';
import {
  aRattacher, codeUssdTapGo, compteDeLaDemande, fraisPour, instantDe, moyenDeLaPiece, numeroMasque, numeroPourFedaPay,
  piecesReglees, rapprocheTapGo, resteDuTicket, statutDepuisFedaPay, tapGoOuvert, tauxDe, versementDeLaDemande, versementsDesParts,
  CAISSE_MND_PAY, DELAI_DU_TICKET_MS, type DemandeMndPay,
} from '../src/shared/mnd-pay-pur';
import type { Invoice } from '../src/shared/finance';
import { saitLEcheanceSuivante } from '../src/shared/kkiapay';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const racine = process.cwd();
const lis = (f: string) => readFileSync(path.join(racine, f), 'utf8');

/* ── 1. LES FRAIS ─────────────────────────────────────────────────────── */
const R = { tauxMobilePct: 1.8, tauxCartePct: 3.5 };
dit('mobile money : 1,8 % de 49 000 F', 882, fraisPour(49_000, 'mtn', R));
dit('au franc supérieur, jamais en dessous (1,8 % de 1 001 F = 18,018)', 19, fraisPour(1_001, 'moov', R));
dit('la carte a son taux', 1_715, fraisPour(49_000, 'carte', R));
dit('le lien prend le plus haut des deux (elle choisit après)', 1_715, fraisPour(49_000, 'au_choix', R));
dit('sans taux de carte, la carte prend celui du mobile money', [1.8, 882], [tauxDe('carte', { tauxMobilePct: 1.8 }), fraisPour(49_000, 'carte', { tauxMobilePct: 1.8 })]);
dit('sans réglages, 1,8 % par défaut', 882, fraisPour(49_000, 'mtn', undefined));
dit('un montant nul ne paie rien', 0, fraisPour(0, 'mtn', R));
dit('le pourboire traverse le même tuyau : frais sur 51 000 F', { montantXof: 49000, pourboireXof: 2000, fraisXof: 918, totalXof: 51918 },
  compteDeLaDemande({ montantXof: 49_000, pourboireXof: 2_000, moyen: 'mtn', reglages: R }));

/* ── 2. LE MOYEN ET LE VERSEMENT ─────────────────────────────────────── */
const base: DemandeMndPay = {
  id: 'mp-abc', branchId: 'b1', genre: 'comptoir', moyen: 'mtn', montantXof: 49_000, pourboireXof: 2_000,
  fraisXof: 918, totalXof: 51_918, pieceId: 'inv-1', libelle: 'Maison MND', statut: 'payee',
  reference: 'trx_123', creeLe: '2026-10-16T13:30:00.000Z', payeeLe: '2026-10-16T13:32:00.000Z',
};
dit('le mode réel l emporte sur la demande', ['MTN MoMo', 'Moov', 'Celtiis', 'Carte', 'Moov'], [
  moyenDeLaPiece({ moyen: 'au_choix', modeReel: 'mtn_open' }), moyenDeLaPiece({ moyen: 'au_choix', modeReel: 'moov' }),
  moyenDeLaPiece({ moyen: 'au_choix', modeReel: 'sbin' }), moyenDeLaPiece({ moyen: 'au_choix', modeReel: 'card' }),
  moyenDeLaPiece({ moyen: 'mtn', modeReel: 'moov_tg' })]);
const v = versementDeLaDemande(base, 'caisse@mnd');
dit('le versement porte l identifiant de la demande, la caisse MND PAY, le montant hors frais et hors pourboire',
  { id: 'mp-abc', amountXof: 49_000, cashbox: CAISSE_MND_PAY, method: 'MTN MoMo' },
  { id: v.id, amountXof: v.amountXof, cashbox: v.cashbox, method: v.method });
dit('la note dit la référence et les frais payés par la cliente', true, /réf\. trx_123/.test(v.note ?? '') && /frais 918 F payés par la cliente/.test(v.note ?? ''));

/* ── 3. LE LIEN PAYÉ RÈGLE SA PIÈCE ──────────────────────────────────── */
type P = Pick<Invoice, 'id' | 'status' | 'payments' | 'payment'> & { totalXof: number };
const reste = (p: P) => p.totalXof - (p.payments ?? []).reduce((n, x) => n + x.amountXof, 0);
const piece: P = { id: 'inv-9', status: 'envoyée', totalXof: 30_000, payments: [] };
const lien: DemandeMndPay = { ...base, id: 'mp-lien', genre: 'lien', montantXof: 30_000, pieceId: 'inv-9' };
const r1 = piecesReglees([piece], [lien], reste);
dit('le lien payé s inscrit sur sa pièce, qui passe payée', ['mp-lien', 'payée', 1], [r1.inscrits[0], r1.changees[0]?.status, r1.changees[0]?.payments?.length]);
const r2 = piecesReglees(r1.changees, [lien], reste);
dit('... une seule fois (un second passage ne touche rien)', 0, r2.changees.length);
dit('un lien en attente, refusé ou du comptoir ne règle rien', 0, piecesReglees([piece], [
  { ...lien, statut: 'en_attente' }, { ...lien, id: 'mp-r', statut: 'refusee' }, { ...lien, id: 'mp-c', genre: 'comptoir' }], reste).changees.length);
const partiel = piecesReglees([piece], [{ ...lien, montantXof: 10_000 }], reste);
dit('un lien partiel inscrit son versement sans payer la pièce', ['envoyée', 10_000], [partiel.changees[0]?.status, partiel.changees[0]?.payments?.[0]?.amountXof]);
dit('deux liens payés sur la même pièce s additionnent', ['payée', 2], ((x) => [x.changees[0]?.status, x.changees[0]?.payments?.length])(
  piecesReglees([piece], [{ ...lien, montantXof: 10_000 }, { ...lien, id: 'mp-lien2', montantXof: 20_000 }], reste)));

/* ── 4. L'ARGENT À RATTACHER ─────────────────────────────────────────── */
const maintenant = Date.parse('2026-10-16T14:00:00.000Z');
const vieux = { ...base, id: 'mp-vieux', payeeLe: new Date(maintenant - DELAI_DU_TICKET_MS - 1000).toISOString() };
const frais = { ...base, id: 'mp-frais', payeeLe: new Date(maintenant - 60_000).toISOString() };
const porte = { ...base, id: 'mp-porte', payeeLe: new Date(maintenant - DELAI_DU_TICKET_MS - 1000).toISOString() };
const lienSansPiece = { ...lien, id: 'mp-orphelin', pieceId: 'inv-disparue' };
const pieces = [{ id: 'inv-x', payments: [{ id: 'mp-porte', date: '2026-10-16', amountXof: 49_000, method: 'MTN MoMo' }] }];
dit('à rattacher : le ticket abandonné et le lien sans pièce, pas le ticket encore ouvert ni l argent déjà porté',
  ['mp-vieux', 'mp-orphelin'], aRattacher([vieux, frais, porte, lienSansPiece], pieces, maintenant).map((d) => d.id));

/* ── LES PARTS DU TICKET ─────────────────────────────────────────────── */
dit('le reste après une part en espèces', 29_000, resteDuTicket(49_000, [{ id: 'p1', methode: 'Espèces', montantXof: 20_000 }]));
const vp = versementsDesParts([{ id: 'p1', methode: 'Espèces', montantXof: 20_000, caisse: 'Terrasse' }, { id: 'p2', methode: 'Moov', montantXof: 29_000, mndPayId: 'mp-abc' }],
  { date: '2026-10-16', demandes: [base] });
dit('une part MND PAY garde l identifiant de sa demande et sa caisse', [['p1', 'Terrasse', 20_000], ['mp-abc', CAISSE_MND_PAY, 29_000]], vp.map((x) => [x.id, x.cashbox, x.amountXof]));

/* ── LES NUMÉROS ─────────────────────────────────────────────────────── */
const CAS_NUMEROS = ['01 97 00 00 12', '97000012', '+229 01 97 00 00 12', '00229 0197000012', '2290197000012', '+33 6 12 34 56 78', '123', '', '01 97 00 00'];
const numerosClient = CAS_NUMEROS.map((n) => numeroPourFedaPay(n)?.number ?? null);
dit('les numéros du Bénin passent à dix chiffres, l étranger tel quel, l illisible refusé',
  ['+2290197000012', '+2290197000012', '+2290197000012', '+2290197000012', '+2290197000012', '+33612345678', null, null, null], numerosClient);
dit('le numéro masqué', '01 97 •• •• 12', numeroMasque('0197000012'));

/* ── 5. LE VRAI CODE DU SERVEUR ──────────────────────────────────────── */
function extrais(f: string, nom: string): string {
  const src = lis(f);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}
function charge<T>(f: string, nom: string): T {
  const js = transformSync(extrais(f, nom), { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return ${nom};`)() as T;
}
const STATUTS = ['approved', 'transferred', 'refunded', 'approved_partially_refunded', 'declined', 'canceled', 'cancelled', 'expired', 'pending', '', 'APPROVED'];
for (const f of ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts']) {
  const serveur = charge<(s: string) => string>(f, 'statutDepuisFedaPay');
  dit(`${f.split('/')[2]} : les statuts disent la même chose que le Trône`, STATUTS.map(statutDepuisFedaPay), STATUTS.map(serveur));
}
const numServeur = charge<(t: string) => { number: string } | null>('supabase/functions/mnd-pay/index.ts', 'numeroPourFedaPay');
dit('mnd-pay : les numéros comme au Trône', numerosClient, CAS_NUMEROS.map((n) => numServeur(n)?.number ?? null));

/* La signature : HMAC-SHA256 hex de « t.corps », tolérance de 300 s (SDK
   officiel de FedaPay). On signe ICI avec node:crypto, et c'est le code du
   webhook qui juge. */
const signatureValide = charge<(e: string, c: string, s: string, n: number) => Promise<boolean>>('supabase/functions/mnd-pay-webhook/index.ts', 'signatureValide');
const SECRET = 'wh_sandbox_essai';
const corps = '{"name":"transaction.approved","entity":{"id":4242,"klass":"v1/transaction"}}';
const t = 1_792_170_000;
const signe = (c: string, s = SECRET, tt = t) => createHmac('sha256', s).update(`${tt}.${c}`).digest('hex');
dit('signature juste : acceptée', true, await signatureValide(`t=${t},s=${signe(corps)}`, corps, SECRET, t + 10));
dit('corps retouché : refusé', false, await signatureValide(`t=${t},s=${signe(corps)}`, corps.replace('4242', '4243'), SECRET, t + 10));
dit('autre secret : refusé', false, await signatureValide(`t=${t},s=${signe(corps, 'autre')}`, corps, SECRET, t + 10));
dit('trop vieille (301 s) : refusée', false, await signatureValide(`t=${t},s=${signe(corps)}`, corps, SECRET, t + 301));
dit('à 300 s pile : acceptée', true, await signatureValide(`t=${t},s=${signe(corps)}`, corps, SECRET, t + 300));
dit('sans secret posé : refusée', false, await signatureValide(`t=${t},s=${signe(corps)}`, corps, '', t));
dit('sans horodatage : refusée', false, await signatureValide(`s=${signe(corps)}`, corps, SECRET, t));
dit('plusieurs signatures, une juste : acceptée', true, await signatureValide(`t=${t},s=deadbeef,s=${signe(corps)}`, corps, SECRET, t));

/* L'échéance suivante (KkiaPay, Ma Couronne) : même texte dans les deux
   fonctions, et la bonne règle. */
const sansCR = (s: string) => s.split(String.fromCharCode(13)).join('');
dit('kkiapay-verify et kkiapay-webhook portent la même règle de l échéance', true,
  sansCR(extrais('supabase/functions/kkiapay-verify/index.ts', 'duDeLAbonnement')) === sansCR(extrais('supabase/functions/kkiapay-webhook/index.ts', 'duDeLAbonnement')));
const du = charge<(d: unknown) => number>('supabase/functions/kkiapay-verify/index.ts', 'duDeLAbonnement');
const ech = [{ amountXof: 30_000 }, { amountXof: 30_000 }, { amountXof: 30_000 }];
dit('l échéance due : la 1re, la 2e, le reste de la 1re, rien quand tout est réglé, le prix sans échéancier', [30_000, 30_000, 10_000, 0, 45_000], [
  du({ echeances: ech, payments: [] }), du({ echeances: ech, payments: [{ amountXof: 30_000 }] }),
  du({ echeances: ech, payments: [{ amountXof: 20_000 }] }), du({ echeances: ech, payments: [{ amountXof: 90_000 }] }),
  du({ priceXof: 45_000 })]);

/* ── 6. LES RÈGLES DANS LE CODE ──────────────────────────────────────── */
const migration = lis('supabase/migrations/0133_mnd_pay.sql').replace(/--.*$/gm, '');
const politiques = [...migration.matchAll(/create policy\s+\w+\s+on\s+public\.mnd_pay\s+for\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
dit('0133 : le personnel lit, personne n écrit (une seule politique, de lecture)', ['select'], politiques);
const caisse = lis('src/apps/trone/routes/vente/Caisse.tsx');
const actions = lis('src/apps/trone/routes/clients/actions.tsx');
const client = lis('src/shared/mnd-pay.ts');
const tousLesEcrans = [caisse, actions, client, lis('src/apps/trone/routes/vente/MndPay.tsx'), lis('src/apps/trone/routes/vente/JournalMndPay.tsx'),
  lis('src/apps/trone/routes/vente/LienMndPay.tsx'), lis('src/apps/trone/shell/useMndPayRattache.ts')].join('\n');
dit('le Trône n écrit jamais la table mnd_pay (ni insert, ni update, ni delete)', false,
  /from\(\s*'mnd_pay'\s*\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/.test(tousLesEcrans));
dit('une demande de paiement ne part jamais en différé (pas de file d attente)', false, /appelleOuGarde/.test(client));
const webhook = lis('supabase/functions/mnd-pay-webhook/index.ts');
const corpsDuWebhook = webhook.slice(webhook.indexOf('Deno.serve('));
const iSig = corpsDuWebhook.indexOf('await signatureValide(');
dit('le webhook juge la signature AVANT de lire le corps ou la base', true,
  iSig > 0 && iSig < corpsDuWebhook.indexOf('JSON.parse(') && iSig < corpsDuWebhook.indexOf(".from('mnd_pay')"));
const iRelue = corpsDuWebhook.indexOf('/transactions/${fedapayId}');
dit('le webhook redemande la transaction à FedaPay avant d écrire', true,
  iRelue > 0 && iRelue < corpsDuWebhook.indexOf(".update({ data: suite })"));
dit('la caisse MND PAY ne se choisit pas à la main (Caisse et rituel)', [true, true],
  [/\.filter\(\(c\) => c\.name !== CAISSE_MND_PAY\)/.test(caisse), /const eligibleBoxes = boxesDuJour\.filter\(\(c\) => [^;]*c\.name !== CAISSE_MND_PAY\);/.test(actions)]);
dit('le versement du rituel payé par MND PAY garde l identifiant de sa demande', true,
  /const mnd = pt\.tuile === 'mndpay' \? mndPayRef\.current : null;[\s\S]{0,200}id: mnd\?\.id \?\? `ip-\$\{uid\(\)\}`/.test(actions));
dit('la Caisse ferme le ticket avec le versement de la demande', true, /versementDeLaDemande\(mndPay, piece\.encaissePar\)/.test(caisse));
dit('le pied de la Caisse ne promet plus une réconciliation MoMo automatique', false, /réconciliation MoMo automatique\./.test(caisse.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')));

/* Ma Couronne ne propose l'échéance suivante qu'à un serveur qui sait la
   régler : avant, la cliente paierait une deuxième échéance qu'il refuserait. */
const maFormule = lis('src/apps/couronne/MaFormule.tsx');
dit('l échéance suivante attend un kkiapay-verify qui la sait (version comparée)', [false, true, false, true],
  ['2026-10-10-a', '2026-10-16-a', '', '2026-11-02-a'].map(saitLEcheanceSuivante));
dit('Ma Couronne : le bouton « Régler » dépend du serveur prêt, pas seulement de KkiaPay', true,
  /const enLigne = kkiapayEnabled\(\) && serveurPret;/.test(maFormule) && /\{suivante && \(\s*enLigne\s*\?/.test(maFormule));


/* ── 7. TAP & GO ─────────────────────────────────────────────────────── */
dit('le code à composer porte le code de la Maison et le montant', ['*601*14*51166*25400#', '*601*14*12345*1000#'],
  [codeUssdTapGo(25_400, undefined), codeUssdTapGo(1_000.4, { tapgo: { code: '12 345' } })]);
dit('Tap & Go s offre avec MND PAY, sauf éteint', [true, true, false], [tapGoOuvert(undefined), tapGoOuvert({ tapgo: {} }), tapGoOuvert({ tapgo: { actif: false } })]);
dit('sa commission : 1,6 % par défaut, au franc supérieur, réglable', [1.6, 400, 2, 500], [tauxDe('tapgo', undefined), fraisPour(25_000, 'tapgo', undefined),
  tauxDe('tapgo', { tapgo: { tauxPct: 2 } }), fraisPour(25_000, 'tapgo', { tapgo: { tauxPct: 2 } })]);
const ISO = ['2026-10-17T08:12:03.000000Z', '2026-10-17 08:12:03', '2026-10-17T08:12:03+01:00', '', 'n importe quoi'];
dit('les instants de FedaPay (six décimales, espace, fuseau)', [Date.parse('2026-10-17T08:12:03Z'), Date.parse('2026-10-17T08:12:03Z'), Date.parse('2026-10-17T07:12:03Z'), null, null],
  ISO.map((x) => { const n = instantDe(x); return Number.isFinite(n) ? n : null; }));
const T0 = Date.parse('2026-10-17T10:00:00.000Z');
const mn = (k: number) => new Date(T0 + k * 60_000).toISOString();
const att = (id: string, totalXof: number, creeLe: string, x: Partial<DemandeMndPay> = {}) =>
  ({ id, moyen: 'tapgo', statut: 'en_attente', totalXof, creeLe, ...x }) as DemandeMndPay;
const CAS_TAPGO: [string, { montantXof: number; quandMs: number }, DemandeMndPay[]][] = [
  ['une attente du même montant', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(-5))]],
  ['un franc d écart passe, deux non', { montantXof: 25_401, quandMs: T0 }, [att('a', 25_400, mn(-5)), att('b', 25_403, mn(-5))]],
  ['deux attentes du même montant : on ne choisit pas', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(-5)), att('b', 25_400, mn(-3))]],
  ['posée 29 min avant : oui', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(-29))]],
  ['posée 31 min avant : plus le même passage', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(-31))]],
  ['une minute d avance de l horloge : oui', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(1))]],
  ['trois minutes après le paiement : non', { montantXof: 25_400, quandMs: T0 }, [att('a', 25_400, mn(3))]],
  ['déjà rattachée, payée, ou un autre moyen : non', { montantXof: 25_400, quandMs: T0 },
    [att('a', 25_400, mn(-5), { fedapayId: 7 }), att('b', 25_400, mn(-5), { statut: 'payee' }), att('c', 25_400, mn(-5), { moyen: 'mtn' })]],
  ['un paiement sans montant : rien', { montantXof: 0, quandMs: T0 }, [att('a', 0, mn(-5))]],
];
dit('le rapprochement au montant, cas par cas', [
  { sorte: 'une', id: 'a' }, { sorte: 'une', id: 'a' }, { sorte: 'plusieurs', ids: ['a', 'b'] }, { sorte: 'une', id: 'a' }, { sorte: 'aucune' },
  { sorte: 'une', id: 'a' }, { sorte: 'aucune' }, { sorte: 'aucune' }, { sorte: 'aucune' },
], CAS_TAPGO.map(([, pmt, a]) => rapprocheTapGo(pmt, a)));
const sansPremiere = (t: string) => sansCR(t).split('\n').slice(1).join('\n');
for (const nom of ['instantDe', 'rapprocheTapGo']) {
  const ici = sansPremiere(extrais('src/shared/mnd-pay-pur.ts', nom));
  dit(`${nom} : même texte au Trône, dans mnd-pay et dans mnd-pay-webhook`, [true, true],
    ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts'].map((f) => sansPremiere(extrais(f, nom)) === ici));
}
dit('rangeLeTapGo : même texte dans les deux fonctions', true,
  sansCR(extrais('supabase/functions/mnd-pay/index.ts', 'rangeLeTapGo')) === sansCR(extrais('supabase/functions/mnd-pay-webhook/index.ts', 'rangeLeTapGo')));
for (const f of ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts']) {
  const r = charge<typeof rapprocheTapGo>(f, 'rapprocheTapGo');
  dit(`${f.split('/')[2]} : le rapprochement du serveur dit la même chose`, CAS_TAPGO.map(([, pmt, a]) => rapprocheTapGo(pmt, a)), CAS_TAPGO.map(([, pmt, a]) => r(pmt, a)));
}

/* LE VRAI rangeLeTapGo CONTRE UNE BASE SIMULÉE — la couture entre FedaPay,
   le serveur et le comptoir, de bout en bout. La base comprend juste ce que
   la fonction lui demande : eq, gte, not, order, limit, maybeSingle, insert,
   update. */
type Ligne = { id: string; branch_id: string | null; data: Record<string, unknown>; updated_at: string };
function baseSimulee(lignes: Ligne[], branches: { id: string }[]) {
  const champ = (l: Ligne, k: string): unknown => (k.startsWith('data->>') ? (l.data[k.slice(7)] === undefined ? undefined : String(l.data[k.slice(7)])) : (l as Record<string, unknown>)[k]);
  return {
    lignes,
    from(table: string) {
      const filtres: ((l: Ligne) => boolean)[] = [];
      let tri: { k: string; asc: boolean } | null = null;
      let borne = Infinity;
      let patch: Record<string, unknown> | null = null;
      const source = () => (table === 'branches' ? (branches as unknown as Ligne[]) : lignes);
      const resout = () => {
        if (patch) {
          for (const l of lignes.filter((x) => filtres.every((f) => f(x)))) Object.assign(l, patch, { updated_at: new Date().toISOString() });
          return { data: null, error: null };
        }
        let r = source().filter((x) => filtres.every((f) => f(x)));
        if (tri) { const t = tri; r = [...r].sort((a, b) => String(champ(a, t.k)).localeCompare(String(champ(b, t.k))) * (t.asc ? 1 : -1)); }
        return { data: r.slice(0, borne), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtres.push((l) => champ(l, k) === String(v)); return q; },
        gte: (k: string, v: string) => { filtres.push((l) => String(champ(l, k)) >= v); return q; },
        not: (k: string) => { filtres.push((l) => champ(l, k) != null); return q; },
        order: (k: string, o: { ascending: boolean }) => { tri = { k, asc: o.ascending }; return q; },
        limit: (n: number) => { borne = n; return q; },
        maybeSingle: () => Promise.resolve({ data: (resout().data as Ligne[])[0] ?? null, error: null }),
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        insert: (row: Ligne) => {
          if (lignes.some((l) => l.id === row.id)) return Promise.resolve({ error: { message: 'duplicate key value violates unique constraint' } });
          lignes.push({ ...row, updated_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
        then: (ok: (v: unknown) => unknown, ko2?: (e: unknown) => unknown) => Promise.resolve(resout()).then(ok, ko2),
      };
      return q;
    },
  };
}
const ensemble = ['statutDepuisFedaPay', 'instantDe', 'rapprocheTapGo', 'rangeLeTapGo'];
for (const f of ['supabase/functions/mnd-pay-webhook/index.ts', 'supabase/functions/mnd-pay/index.ts']) {
  const js = transformSync(ensemble.map((n) => extrais(f, n)).join('\n'), { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  const range = new Function(`${js}; return rangeLeTapGo;`)() as (admin: unknown, tx: unknown) => Promise<string>;
  const ilYA = (k: number) => new Date(Date.now() - k * 60_000).toISOString();
  const lignes: Ligne[] = [
    { id: 'mp-attente', branch_id: 'cot', updated_at: ilYA(4), data: { id: 'mp-attente', branchId: 'cot', genre: 'comptoir', moyen: 'tapgo', statut: 'en_attente', montantXof: 25_000, fraisXof: 400, totalXof: 25_400, pieceId: 'tk-1', creeLe: ilYA(4) } },
    { id: 'mp-vieille', branch_id: 'cot', updated_at: ilYA(1), data: { id: 'mp-vieille', moyen: 'mtn', statut: 'payee', fedapayId: 111, totalXof: 5_000, creeLe: ilYA(60) } },
  ];
  const admin = baseSimulee(lignes, [{ id: 'cot' }]);
  const tx = (id: number, amount: number, status = 'approved') => ({ id, amount, status, approved_at: new Date().toISOString(), mode: 'mtn_open', reference: `trx_${id}`, fees: 406 });
  const nomF = f.split('/')[2];
  const r1 = await range(admin, tx(9001, 25_400));
  const attente = lignes.find((l) => l.id === 'mp-attente')!.data;
  dit(`${nomF} : le paiement du même montant règle l attente, et le comptoir passe au vert`, ['rattachée à mp-attente', 'payee', 9001, 'mtn_open', 'trx_9001', 'tk-1'],
    [r1, attente.statut, attente.fedapayId, attente.modeReel, attente.reference, attente.pieceId]);
  dit(`${nomF} : le même paiement annoncé deux fois ne range rien de plus`, ['deja', 2], [await range(admin, tx(9001, 25_400)), lignes.length]);
  dit(`${nomF} : un paiement créé mais pas encore payé ne range rien`, ['pas encore payée', 2], [await range(admin, tx(9002, 12_000, 'pending')), lignes.length]);
  const r3 = await range(admin, tx(9003, 12_000));
  const orpheline = lignes.find((l) => l.id === 'tg-9003');
  dit(`${nomF} : personne ne l attendait : il s écrit à rattacher, dans la branche, sans pièce`, ['à rattacher', 'cot', 'payee', '', 12_000, 'tapgo'],
    [r3, orpheline?.branch_id, orpheline?.data.statut, orpheline?.data.pieceId, orpheline?.data.montantXof, orpheline?.data.moyen]);
  dit(`${nomF} : deux appels simultanés n en écrivent qu un`, ['deja', 3], [await range(admin, tx(9003, 12_000)), lignes.length]);
  lignes.push(
    { id: 'mp-x', branch_id: 'cot', updated_at: ilYA(2), data: { id: 'mp-x', moyen: 'tapgo', statut: 'en_attente', totalXof: 8_120, creeLe: ilYA(2) } },
    { id: 'mp-y', branch_id: 'cot', updated_at: ilYA(1), data: { id: 'mp-y', moyen: 'tapgo', statut: 'en_attente', totalXof: 8_120, creeLe: ilYA(1) } },
  );
  const r4 = await range(admin, tx(9004, 8_120));
  dit(`${nomF} : deux tickets du même montant : rien ne se devine, l argent attend une main`, ['à rattacher', 'en_attente', 'en_attente', true],
    [r4, lignes.find((l) => l.id === 'mp-x')!.data.statut, lignes.find((l) => l.id === 'mp-y')!.data.statut, /2 tickets/.test(String(lignes.find((l) => l.id === 'tg-9004')?.data.raison))]);
  const versLeComptoir = aRattacher(lignes.map((l) => l.data as unknown as DemandeMndPay), [], Date.now() + 6 * 60_000).map((d) => d.id).sort();
  dit(`${nomF} : au journal, l argent sans ticket paraît « À rattacher » après le délai du ticket`, true, versLeComptoir.includes('tg-9003') && versLeComptoir.includes('tg-9004'));
}
const corpsMndPay = lis('supabase/functions/mnd-pay/index.ts');
const iDemander = corpsMndPay.indexOf("if (moyen === 'tapgo') {");
dit('mnd-pay : Tap & Go n écrit qu une attente, AVANT toute transaction FedaPay', true,
  iDemander > 0 && iDemander < corpsMndPay.indexOf("await fedapay('POST', '/transactions'"));
dit('le webhook range la transaction inconnue après l avoir relue chez FedaPay', true,
  corpsDuWebhook.indexOf('/transactions/${fedapayId}') < corpsDuWebhook.indexOf('rangeLeTapGo(admin, tx)') && /if \(!ligne\) \{[\s\S]{0,300}rangeLeTapGo\(admin, tx\)/.test(corpsDuWebhook));

console.log(ko === 0 ? '\nMND PAY tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
