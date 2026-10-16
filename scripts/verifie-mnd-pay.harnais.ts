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
      demande ne part jamais en différé, le webhook vérifie avant de lire. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { transformSync } from 'esbuild';
import {
  aRattacher, compteDeLaDemande, fraisPour, moyenDeLaPiece, numeroMasque, numeroPourFedaPay,
  piecesReglees, resteDuTicket, statutDepuisFedaPay, tauxDe, versementDeLaDemande, versementsDesParts,
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
  [/\.filter\(\(c\) => c\.name !== CAISSE_MND_PAY\)/.test(caisse), /c\.name !== CAISSE_MND_PAY \|\| !!mndAFermer/.test(actions)]);
dit('le versement du rituel payé par MND PAY garde l identifiant de sa demande', true, /id: mndPayRef\.current\?\.id \?\? `ip-\$\{uid\(\)\}`/.test(actions));
dit('la Caisse ferme le ticket avec le versement de la demande', true, /versementDeLaDemande\(mndPay, piece\.encaissePar\)/.test(caisse));
dit('le pied de la Caisse ne promet plus une réconciliation MoMo automatique', false, /réconciliation MoMo automatique\./.test(caisse.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')));

/* Ma Couronne ne propose l'échéance suivante qu'à un serveur qui sait la
   régler : avant, la cliente paierait une deuxième échéance qu'il refuserait. */
const maFormule = lis('src/apps/couronne/MaFormule.tsx');
dit('l échéance suivante attend un kkiapay-verify qui la sait (version comparée)', [false, true, false, true],
  ['2026-10-10-a', '2026-10-16-a', '', '2026-11-02-a'].map(saitLEcheanceSuivante));
dit('Ma Couronne : le bouton « Régler » dépend du serveur prêt, pas seulement de KkiaPay', true,
  /const enLigne = kkiapayEnabled\(\) && serveurPret;/.test(maFormule) && /\{suivante && \(\s*enLigne\s*\?/.test(maFormule));

console.log(ko === 0 ? '\nMND PAY tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
