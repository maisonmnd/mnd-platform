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
  aRattacher, codeUssdTapGo, compteDeLaDemande, saitTapGo, parametreTapGo, motTapGo, variablesTapGo, MODELE_TAPGO, LIEN_TAPGO,
  paiementTapGoDeLaPiece, rendezVousRegles, saitLesFactures, fraisPour, instantDe, moyenDeLaPiece, numeroMasque, numeroPourFedaPay,
  piecesReglees, rapprocheTapGo, resteDuTicket, statutDepuisFedaPay, tapGoOuvert, tauxDe, versementDeLaDemande, versementsDesParts,
  CAISSE_MND_PAY, DELAI_DU_TICKET_MS, type DemandeMndPay,
} from '../src/shared/mnd-pay-pur';
import type { Invoice } from '../src/shared/finance';
import { saitLEcheanceSuivante } from '../src/shared/kkiapay';
import { envoieLeNumeroTapGo } from '../src/shared/tapgo-whatsapp';
import { envoieLaFactureARegler, variablesDeLaFacture, MODELE_FACTURE, refusDuModele } from '../src/shared/facture-whatsapp';
import { motDuRecu, recuAEnvoyer } from '../src/shared/recu-whatsapp';
import type { EnvoiWhatsApp, ResultatDEnvoi } from '../src/shared/whatsapp';

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
  /const mnd = pt\.tuile === 'mndpay' \? mndPayRef\.current : null;[\s\S]{0,500}id: mnd\?\.id \?\? `ip-\$\{uid\(\)\}`/.test(actions));
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
dit('la tuile attend un mnd-pay qui sait Tap & Go (version comparée)', [false, false, true, true],
  ['', '2026-10-16-a', '2026-10-17-a', '2026-11-02-a'].map(saitTapGo));
dit('le panneau ne montre la tuile qu à un serveur prêt', true,
  /const moyens = MOYENS\.filter\(\(x\) => x\.id !== 'tapgo' \|\| \(tapGoOuvert\(p\.reglages\) && tapGoPret\)\);/.test(lis('src/apps/trone/routes/vente/MndPay.tsx')));
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


/* ── 8. LE NUMÉRO TAP & GO PART SUR SON WHATSAPP (17 octobre 2026) ──── */
{
const PARAM = parametreTapGo(25_400, undefined);
dit('le paramètre du lien : code-total, un seul mot que la fonction d envoi accepte', ['51166-25400', true],
  [PARAM, /^[A-Za-z0-9._~-]{1,500}$/.test(PARAM)]);
const MOT = motTapGo('Madame Awa', '25 400 F', `${LIEN_TAPGO}${PARAM}`);
dit('le mot libre : le lien, le montant, ni étoile (WhatsApp les mettrait en gras) ni le mot « code »', [true, true, false, false],
  [MOT.includes('https://maisonmnd.com/trone/payer.html?tg=51166-25400'), MOT.includes('25 400 F'), MOT.includes('*'), /code/i.test(MOT)]);
dit('le modèle Meta : paiement_en_attente (Utilitaire), deux variables (son appel, le montant)', ['paiement_en_attente', ['Madame Awa', '25 400 F']],
  [MODELE_TAPGO, variablesTapGo('Madame Awa', '25 400 F')]);

/* L'envoi : un faux envoi note ce qui part. Dans la fenêtre : le mot seul. */
const faux = (reponses: ResultatDEnvoi[]) => {
  const appels: EnvoiWhatsApp[] = [];
  const envoie = async (e: EnvoiWhatsApp): Promise<ResultatDEnvoi> => { appels.push(e); return reponses.shift() ?? { ok: true, id: 'x' }; };
  return { appels, envoie };
};
const base = { telephone: '0197000012', cliente: { id: 'cl-1', name: 'Awa Dossou', civilite: 'madame' as const }, totalXof: 25_400, montantDit: '25 400 F', reglages: undefined, demandeId: 'mp-1', branchId: 'cot' };
const f1 = faux([{ ok: true, id: 'm1' }]);
const r1 = await envoieLeNumeroTapGo({ ...base, envoie: f1.envoie });
dit('dans la fenêtre : un seul message, libre, avec le lien, et sa clé d unicité', [true, 1, true, undefined, 'tapgo-mp-1-mot'],
  [r1.ok, f1.appels.length, (f1.appels[0].texte ?? '').includes('payer.html?tg=51166-25400'), f1.appels[0].modele, f1.appels[0].cleUnique]);
const f2 = faux([{ ok: false, erreur: 'La fenêtre de 24 heures est fermée : seul un modèle approuvé passe.' }, { ok: true, id: 'm2' }]);
const r2 = await envoieLeNumeroTapGo({ ...base, envoie: f2.envoie });
dit('hors fenêtre : le modèle, ses variables, le paramètre du bouton, une autre clé', [true, 2, 'paiement_en_attente', ['Madame Awa', '25 400 F'], '51166-25400', 'tapgo-mp-1-modele'],
  [r2.ok, f2.appels.length, f2.appels[1].modele, f2.appels[1].variables, f2.appels[1].boutonUrl, f2.appels[1].cleUnique]);
const f3 = faux([{ ok: false, erreur: 'Ce numéro n’est pas lisible.' }]);
const r3 = await envoieLeNumeroTapGo({ ...base, envoie: f3.envoie });
dit('un autre refus ne tente pas le modèle, et se dit', [false, 1], [r3.ok, f3.appels.length]);
const f4 = faux([]);
const r4 = await envoieLeNumeroTapGo({ ...base, telephone: '  ', envoie: f4.envoie });
dit('sans numéro : rien ne part, et l écran le sait', [false, 0], [r4.ok, f4.appels.length]);
dit('sans fiche : « Madame, Monsieur », jamais une civilité supposée', ['Madame, Monsieur'],
  await (async () => { const f = faux([{ ok: false, erreur: 'fenêtre fermée' }, { ok: true, id: 'm' }]); await envoieLeNumeroTapGo({ ...base, cliente: undefined, envoie: f.envoie }); return [f.appels[1].variables?.[0]]; })());

/* LA PAGE QUI COMPOSE : le vrai script de payer.html, rejoué sur une page
   simulée. Le numéro qu'elle compose est celui que le comptoir affiche. */
const pageSrc = lis('public/payer.html');
const script = pageSrc.slice(pageSrc.lastIndexOf('<script>') + 8, pageSrc.lastIndexOf('</script>'));
const rejoue = (recherche: string) => {
  const blocs: Record<string, { innerHTML: string; textContent: string; onclick?: unknown }> = {};
  const el = (id: string) => (blocs[id] ??= { innerHTML: '', textContent: '' });
  const cadre = { parentNode: { removeChild() {} } };
  const doc = { body: { classList: { add() {} } }, title: '', querySelector: () => cadre, getElementById: el };
  // eslint-disable-next-line no-new-func
  new Function('document', 'location', 'navigator', script)(doc, { search: recherche }, { clipboard: { writeText: async () => undefined } });
  return blocs.bloc?.innerHTML ?? '';
};
const page = rejoue(`?tg=${PARAM}`);
dit('la page compose le MÊME numéro que le comptoir affiche (tel:, dièse encodé)', true,
  page.includes(`href="tel:${encodeURIComponent(codeUssdTapGo(25_400, undefined))}"`));
dit('... dit le montant, et refuse un lien trafiqué', [true, true, false],
  [page.includes('25'), rejoue('?tg=51166-25400%23').includes('incomplet'), rejoue('?tg=51166-25400%23').includes('tel:')]);
dit('... et la page MoMoPay d avant compose toujours son numéro', true,
  rejoue('?m=ACIA1&c=506846&montant=30000').includes(`tel:${encodeURIComponent('*880*41*506846*30000#')}`));
const panneau = lis('src/apps/trone/routes/vente/MndPay.tsx');
dit('le panneau envoie le lien à l instant où le numéro s affiche (Tap & Go seulement)', true,
  /setDemandeId\(r\.id\);[\s\S]{0,400}if \(moyen === 'tapgo'\) \{[\s\S]{0,500}envoieLeNumeroTapGo\(/.test(panneau));
dit('l envoi transporte le paramètre du bouton jusqu à la fonction', true, /\.\.\.\(e\.boutonUrl \? \{ boutonUrl: e\.boutonUrl \} : \{\}\)/.test(lis('src/shared/whatsapp.ts')));
}


/* ── 9. LA FACTURE ENVOYÉE, SON QR TAP & GO, ET LE CARNET (17 octobre 2026) ── */
{
  const pg = paiementTapGoDeLaPiece(9_900, undefined);
  dit('le reste de la facture : 9 900 F, frais 1,6 % ajoutés, le code et le QR de la page', {
    resteXof: 9900, fraisXof: 159, totalXof: 10059, qr: 'https://maisonmnd.com/trone/payer.html?tg=51166-10059', code: '*601*14*51166*10059#',
  }, pg);
  dit('rien à régler, ou Tap & Go éteint : pas de Tap & Go sur la pièce', [null, null], [paiementTapGoDeLaPiece(0, undefined), paiementTapGoDeLaPiece(9_900, { tapgo: { actif: false } })]);

  const T1 = Date.parse('2026-10-27T10:00:00.000Z');
  const il = (jours: number, minutes = 0) => new Date(T1 - jours * 86_400_000 - minutes * 60_000).toISOString();
  const att = (id: string, totalXof: number, creeLe: string, genre: 'comptoir' | 'lien') =>
    ({ id, moyen: 'tapgo', statut: 'en_attente', totalXof, creeLe, genre }) as DemandeMndPay;
  const CAS: [string, DemandeMndPay[], unknown][] = [
    ['une facture envoyée il y a dix jours : son attente la reconnaît', [att('f', 10_059, il(10), 'lien')], { sorte: 'une', id: 'f' }],
    ['... quarante-six jours : trop tard', [att('f', 10_059, il(46), 'lien')], { sorte: 'aucune' }],
    ['le comptoir passe avant une facture du même montant', [att('f', 10_059, il(3), 'lien'), att('c', 10_059, il(0, 5), 'comptoir')], { sorte: 'une', id: 'c' }],
    ['deux factures du même montant : on ne devine pas', [att('f1', 10_059, il(3), 'lien'), att('f2', 10_059, il(5), 'lien')], { sorte: 'plusieurs', ids: ['f1', 'f2'] }],
    ['un comptoir d il y a une heure ne vaut plus, la facture si', [att('c', 10_059, il(0, 60), 'comptoir'), att('f', 10_059, il(2), 'lien')], { sorte: 'une', id: 'f' }],
  ];
  const paiement = { montantXof: 10_059, quandMs: T1 };
  dit('les fenêtres : comptoir une demi-heure, facture quarante-cinq jours, le comptoir d abord', CAS.map(([, , a]) => a), CAS.map(([, at]) => rapprocheTapGo(paiement, at)));
  for (const f of ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts']) {
    const r = charge<typeof rapprocheTapGo>(f, 'rapprocheTapGo');
    dit(`${f.split('/')[2]} : les mêmes fenêtres au serveur`, CAS.map(([, , a]) => a), CAS.map(([, at]) => r(paiement, at)));
  }
  const mp = lis('supabase/functions/mnd-pay/index.ts');
  dit('mnd-pay : une facture, une attente (même total : la même ; reste changé : l ancienne s annule)', [true, true],
    [/if \(genre === 'lien'\) \{[\s\S]{0,400}\.eq\('data->>pieceId', pieceId\)[\s\S]{0,300}if \(meme\) return json/.test(mp), /statut: 'annulee', raison: 'remplacée : le reste de la pièce a changé'/.test(mp)]);
  dit('les deux fonctions relisent quarante-six jours d attentes', [true, true],
    ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts'].map((f) => /quandMs - 46 \* 86_400_000/.test(lis(f))));

  /* Le Carnet suit la pièce. */
  const dLien = { ...base, id: 'mp-lien', genre: 'lien', moyen: 'tapgo', montantXof: 9_900, fraisXof: 159, totalXof: 10_059, pieceId: 'inv-r', statut: 'payee', modeReel: 'mtn_open', payeeLe: '2026-10-27T10:00:00.000Z' } as DemandeMndPay;
  const rdv = { id: 'rdv-1', paidXof: 100, payments: [{ id: 'pay-1', amountXof: 100 }] };
  const r1 = rendezVousRegles([rdv], [{ id: 'inv-r', apptId: 'rdv-1' }], [dLien], ['mp-lien']);
  dit('le rendez-vous reçoit le même versement, sous le même identifiant, et son payé monte', [1, 10_000, 'mp-lien', 'MND PAY', 'inv-r'],
    [r1.length, r1[0]?.paidXof, r1[0]?.payments?.[1]?.id, (r1[0]?.payments?.[1] as { cashbox?: string })?.cashbox, (r1[0]?.payments?.[1] as { invoiceId?: string })?.invoiceId]);
  dit('... une seule fois (un second passage ne rajoute rien)', 0, rendezVousRegles(r1, [{ id: 'inv-r', apptId: 'rdv-1' }], [dLien], ['mp-lien']).length);
  dit('... et une pièce sans rendez-vous ne touche aucun rendez-vous', 0, rendezVousRegles([rdv], [{ id: 'inv-r' }], [dLien], ['mp-lien']).length);

  dit('l attente d une facture attend un serveur 17-b', [false, false, true], ['', '2026-10-17-a', '2026-10-17-b'].map(saitLesFactures));
  /* Le chemin partagé des envois (17 octobre 2026, vente/envoi-de-la-piece). */
  const env = lis('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  const act = lis('src/apps/trone/routes/clients/actions.tsx');
  dit('... et le chemin des envois le demande avant de la poser', true, /&& saitLesFactures\(await versionDeMndPay\(\)\)\) \{/.test(env));
  const iAtt = env.indexOf("genre: 'lien', moyen: 'tapgo'");
  const iPrep = env.indexOf('const p = await preparer(pieceId);');
  /* 18 octobre 2026 : « toutes les régularisations de versement des RDV du passé ne doivent en
     aucun cas recevoir un message de reçu de paiement. Juste les versements du jour et ceux qui
     sont prépayés. Ne pas faire voir mon retard aux clients. » */
  const J = '2026-10-18';
  dit('le reçu : l argent du jour pour le rituel du jour ou à venir (prépayé) ; jamais un rituel passé, même réglé ce matin', [true, true, false, false, true, false],
    [recuAEnvoyer({ jourDuPaiement: J, jourDuRituel: J, aujourdhui: J }), recuAEnvoyer({ jourDuPaiement: J, jourDuRituel: '2026-10-25', aujourdhui: J }),
      recuAEnvoyer({ jourDuPaiement: J, jourDuRituel: '2026-10-12', aujourdhui: J }), recuAEnvoyer({ jourDuPaiement: '2026-10-12', jourDuRituel: '2026-10-12', aujourdhui: J }),
      recuAEnvoyer({ jourDuPaiement: J, aujourdhui: J }), recuAEnvoyer({ jourDuPaiement: '2026-10-17', aujourdhui: J })]);
  dit('les envois : la règle du reçu, le rituel d aujourd hui seulement pour la facture à régler (jour local), l attente posée avant le PDF', [true, true, true, true],
    [/if \(!recuAEnvoyer\(\{ jourDuPaiement, jourDuRituel, aujourdhui: aujourdhui\(\) \}\) \|\| !\(montantXof > 0\)\) return;/.test(env), /if \(jourDuRituel !== aujourdhui\(\)\) return;/.test(env),
      /const aujourdhui = \(\) => jourLocal\(new Date\(\)\.toISOString\(\)\);/.test(env), iAtt > 0 && iPrep > iAtt]);
  dit('l encaissement passe par ce chemin, avec le jour du paiement ET celui du rituel', true,
    /envoiDeLaPiece\.apresReglement\(pieceId, montantXof, payDate, appt\.date\)/.test(act) && /void envoieLaFacture\(idPieceEncaissee, settleTotal \+ totalGamme\)/.test(act));
  const caisse = lis('src/apps/trone/routes/vente/Caisse.tsx');
  const avis = lis('supabase/functions/avis-google/index.ts');
  dit('la Caisse, la demande d avis du comptoir et celle du serveur ne font pas voir le retard', [true, true, true, true],
    [/const recuPermis = recuAEnvoyer\(\{ jourDuPaiement: dateVente, jourDuRituel: rituelChoisi\?\.date, aujourdhui: todayIso\(\) \}\);/.test(caisse),
      /if \(envoyerRecu && client\?\.phone && pay !== 'Lien WhatsApp' && recuPermis\) \{/.test(caisse),
      /autoConfigStore\.get\(\)\.avisAuto !== true && appt\.date >= addDaysISO\(todayISO\(\), -1\)\) \{/.test(act),
      /\(j === aujourdhui \|\| j === hier\) && \(p\.date === aujourdhui \|\| p\.date === hier\)/.test(avis)]);
  dit('honorer sans encaisser envoie la facture à régler, partout (rituel, Carnet, tableau de bord)', [true, true, true],
    ['src/apps/trone/routes/clients/actions.tsx', 'src/apps/trone/routes/clients/Carnet.tsx', 'src/apps/trone/routes/pilotage/Dashboard.tsx']
      .map((f) => /if \(h\.facture && !h\.deja\) void envoiDeLaPiece\.aRegler\(h\.facture\.id, (appt|a)\.date\);/.test(lis(f))));
  const fac = lis('src/apps/trone/routes/vente/Factures.tsx');
  const mod = lis('src/apps/trone/routes/vente/pdf-de-la-piece.ts');
  dit('une seule fabrique de la facture en PDF, Tap & Go au pied', [true, false, true],
    [/= useLaPieceEnPdf\(\);/.test(fac), /const buildPdfData = /.test(fac), /paiementDeLaPiece\(invoiceResteXof\(d\), reglagesMnd\)/.test(mod)]);
  const pdfSrc = lis('src/shared/pdf.ts');
  dit('le PDF accepte le lien Tap & Go (et garde la règle du 25 août pour MoMoPay)', true,
    /d\.momo\.genre === 'tapgo' \|\| estIdentifiantMomo\(d\.momo\.qr\)/.test(pdfSrc));
  dit('le Carnet suit la pièce dans le Trône', true, /rendezVousRegles\(appointmentsStore\.get\(\), changees, demandes, inscrits\)/.test(lis('src/apps/trone/shell/useMndPayRattache.ts')));
}

/* ── 10. CE QUE FEDAPAY DIT VRAIMENT (17 octobre 2026) ── */
{
  const motif = charge<(lu: unknown) => string>('supabase/functions/mnd-pay/index.ts', 'motifDeFedaPay');
  dit('le refus de FedaPay garde sa phrase ET son détail (objet, liste, texte, rien)', [
    'La création de la transaction a échoué · amount : Le montant ne doit pas dépasser 10000',
    'Refusé · a ; b', 'Erreur · détail', 'Seule phrase', '',
  ], [
    motif({ message: 'La création de la transaction a échoué', errors: { amount: ['Le montant ne doit pas dépasser 10000'] } }),
    motif({ message: 'Refusé', errors: ['a', 'b'] }), motif({ error: 'Erreur', errors: 'détail' }), motif({ message: 'Seule phrase' }), motif(null),
  ]);
}
/* ── 11. LA FACTURE À RÉGLER (17 et 18 octobre 2026) ──
   18 octobre au comptoir : « (#132000) Number of parameters does not match ».
   facture_du_rituel avait quatre variables et disait « réglée » en dur. Sa
   décision : le réécrire pour la facture à régler (PDF + bouton « Régler »,
   elle l'a MODIFIÉ chez Meta sous le même nom), et en attendant son
   approbation, le lien de paiement. */
{
  const cliente = { id: 'cl-1', name: 'Awa Dossou', civilite: 'madame' as const, phone: '0197000012', branchId: 'cot' };
  dit('le modèle de la facture à régler : facture_du_rituel, réécrit et resoumis le 18 octobre (elle l a modifié, pas créé facture_a_regler)', 'facture_du_rituel', MODELE_FACTURE);
  dit('ses QUATRE variables : son appel, le jour AVEC l année, « ci-jointe » (jamais le numéro), le reste dû', ['Madame Awa', '17 octobre 2026', 'ci-jointe', '10 000 F'],
    variablesDeLaFacture(cliente, '2026-10-17', '10 000 F'));
  dit('un refus qui tient au modèle (#132xxx) se reconnaît ; la fenêtre et un numéro injoignable, non', [true, true, true, false, false],
    ['(#132000) Number of parameters does not match the expected number of params', '(#132001) Template name does not exist in the translation',
      'Meta : (#132015) Template is paused', '(#131026) Message undeliverable', 'La fenêtre de 24 heures est fermée.'].map(refusDuModele));

  const pdf = { kind: 'facture', number: 'F-2026-0737', houseName: 'Maison MND', date: '17 octobre 2026', clientName: 'Awa Dossou', lines: [], subtotal: '10 000 F', total: '10 000 F' } as never;
  const tapgo = { parametre: '51166-10160', lien: 'https://maisonmnd.com/trone/payer.html?tg=51166-10160', totalDit: '10 160 F' };
  const FENETRE: ResultatDEnvoi = { ok: false, erreur: 'La fenêtre de 24 heures est fermée. WhatsApp n’accepte plus qu’un modèle approuvé.' };
  const joue = async (reponses: ResultatDEnvoi[], avecTapGo = true) => {
    const appels: EnvoiWhatsApp[] = [];
    const r = await envoieLaFactureARegler({ client: cliente, pdf, resteDit: '10 000 F', jourIso: '2026-10-17', cle: 'inv-9',
      tapgo: avecTapGo ? tapgo : undefined, envoie: async (e) => { appels.push(e); return reponses.shift() ?? { ok: true, id: 'x' }; } });
    return { r, appels };
  };

  /* A. Dans la fenêtre : le PDF, un mot qui dit le reste, l année, et le lien (elle ne peut pas scanner son propre écran). */
  const A = await joue([{ ok: true, id: 'm' }]);
  dit('dans la fenêtre : un seul envoi, le PDF, le reste, la date avec l année, le lien qui compose', [true, 1, true, true, true, true],
    [A.r.ok, A.appels.length, !!A.appels[0].piece, (A.appels[0].texte ?? '').includes('reste à régler : 10 000 F'),
      (A.appels[0].texte ?? '').includes('17 octobre 2026'), (A.appels[0].texte ?? '').includes(tapgo.lien)]);

  /* B. Hors fenêtre, modèle approuvé : le PDF en en-tête et le bouton. */
  const B = await joue([FENETRE, { ok: true, id: 'm' }]);
  dit('hors fenêtre : facture_du_rituel, PDF en en-tête, quatre variables, le bouton porte code et total', [true, undefined, 2, 'facture_du_rituel', 'document', true, 4, '51166-10160'],
    [B.r.ok, (B.r as { repli?: string }).repli, B.appels.length, B.appels[1].modele, B.appels[1].enTete, !!B.appels[1].piece, B.appels[1].variables?.length, B.appels[1].boutonUrl]);

  /* C. Le modèle pas encore approuvé (ou ses variables refusées) : le lien de paiement, sans PDF. */
  const C = await joue([FENETRE, { ok: false, erreur: '(#132001) Template name does not exist in the translation' }, { ok: true, id: 'l' }]);
  dit('modèle pas encore approuvé : paiement_en_attente part, sans PDF, total frais compris, même bouton, et l écran le dit', [true, 'lien', 3, 'paiement_en_attente', false, ['Madame Awa', '10 160 F'], '51166-10160'],
    [C.r.ok, (C.r as { repli?: string }).repli, C.appels.length, C.appels[2].modele, !!C.appels[2].piece, C.appels[2].variables, C.appels[2].boutonUrl]);
  const C2 = await joue([FENETRE, { ok: false, erreur: '(#132000) Number of parameters does not match the expected number of params' }, { ok: true, id: 'l' }]);
  dit('... le refus du 18 octobre (#132000) bascule lui aussi sur le lien', [true, 'lien'], [C2.r.ok, (C2.r as { repli?: string }).repli]);

  /* D. Un refus qui ne tient pas au modèle ne déclenche aucun second message. */
  const D = await joue([FENETRE, { ok: false, erreur: '(#131026) Message undeliverable' }]);
  dit('numéro injoignable : pas de lien en plus, le refus se dit', [false, 2], [D.r.ok, D.appels.length]);

  /* E. Tap & Go éteint : pas de bouton, donc pas de modèle ; rien ne part hors fenêtre, et l écran dit pourquoi. */
  const E = await joue([FENETRE], false);
  dit('Tap & Go éteint, hors fenêtre : un seul essai, refus dit avec sa raison', [false, 1, true],
    [E.r.ok, E.appels.length, !E.r.ok && /Tap & Go/.test(E.r.erreur)]);

  dit('une clé d unicité par pièce et par étape (deux postes n envoient pas deux fois)', ['facture-inv-9-mot', 'facture-inv-9-modele', 'facture-inv-9-lien'],
    C.appels.map((x) => x.cleUnique));

  const sans = await envoieLaFactureARegler({ client: { ...cliente, phone: '' }, pdf, resteDit: '1 F', jourIso: '2026-10-17', envoie: async () => ({ ok: true, id: 'x' }) });
  dit('sans numéro : rien ne part, et l écran le dit', false, sans.ok);

  /* 18 octobre 2026, la première facture reçue : WhatsApp prenait « 2026-0160 » pour un téléphone
     (« Composer le +229 20 26 01 60 »). Sa décision : aucun numéro de pièce dans un message à une
     cliente ; il vit dans le nom du PDF. */
  /* Une adresse entière (le lien qui compose) se lit comme un lien, pas comme un téléphone. */
  const aUnNumero = (t: string) => /\d{4}-\d{3,}/.test(t.replace(/https?:\/\/\S+/g, ''));
  const motFacture = A.appels[0].texte ?? '';
  const motRecu = motDuRecu(cliente, '2 000 F', '2026-10-18');
  const sansLeNumero = (f: string, motif: RegExp) => !motif.test(lis(f));
  dit('aucun numéro de pièce dans un message à une cliente (mot de la facture, mot du reçu, Factures, Conversations)', [false, true, false, true, true, true],
    [aUnNumero(motFacture), motFacture.includes('Voici votre facture ci-jointe, reste à régler'), aUnNumero(motRecu),
      sansLeNumero('src/apps/trone/routes/vente/Factures.tsx', /Votre \$\{doc\.kind === 'devis' \? 'devis' : 'facture'\} \$\{doc\.number\}/),
      sansLeNumero('src/shared/gestes-conversation.ts', /voici votre facture \$\{facture\.number\}/),
      /Votre \$\{doc\.kind === 'devis' \? 'devis' : 'facture'\} est en pièce jointe\./.test(lis('src/apps/trone/routes/vente/Factures.tsx'))]);

  const env = lis('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  dit('honorer sans encaisser : le reste dû, et le même Tap & Go que le pied du PDF', [true, true, true],
    [/const tg = paiementTapGoDeLaPiece\(reste, settings\.mndPay\);/.test(env), /resteDit: fmtMoney\(reste, currency\)/.test(env),
      /tapgo: tg \? \{ parametre: parametreTapGo\(tg\.totalXof, settings\.mndPay\), lien: tg\.qr, totalDit: fmtMoney\(tg\.totalXof, currency\) \} : undefined/.test(env)]);
}
console.log(ko === 0 ? '\nMND PAY tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
