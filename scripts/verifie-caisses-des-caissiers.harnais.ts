/* UNE CAISSE PAR CAISSIER, ET LES ANNÉES PASSÉES, ÉPROUVÉES — 17 octobre 2026.

   Maquette 8kpQtpQh… validée (« Tout est bon, tu peux construire »). Ce qui
   se joue ici : dans quel tiroir entre l'argent. Une erreur ne plante pas,
   elle range les espèces de Gérard dans la caisse de Brice, fait compter le
   soir une caisse qui ne se compte pas, ou laisse un rendez-vous de 2023
   gonfler le tiroir du jour.

   1. LA FAMILLE DE CHAQUE MOYEN de sa liste (Paramètres).
   2. L'ANNÉE ANTÉRIEURE : calculée, jamais écrite en dur, janvier compris.
   3. LA CAISSE PROPOSÉE pour chaque moyen et chaque caissier, selon SA
      décision ; les années passées pour tout, sauf MND PAY et l'avoir.
   4. QUI PEUT CHANGER : la direction ; les autres seulement sans proposition.
   5. LE SOIR : ni les années passées, ni MND PAY ; la caisse de Gérard, oui.
   6. LES RÈGLES DANS LE CODE : l'encaissement du rituel, la Caisse et la
      fiche du personnel lisent la règle au lieu de la refaire.
   7. LES AUTRES CAISSES (17 octobre 2026, ses réponses) : BIIC à part, Caisse
      Indépendantes remplacée, chacun ne voit que la sienne, « Reprise 2025 »
      fondue dans les années passées (et défaite à l'identique), l'histoire
      qui garde tout son passé. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CAISSE_ANNEES_PASSEES, caisseDuCaissier, caisseNeuveDuCaissier, caisseProposee, caissesAuChoix,
  estAnneeAnterieure, familleDuMoyen, peutChangerLaCaisse, caisseDesAnneesPassees,
  fusionneLEcriture, defaisLaFusionDeLEcriture, casesQuiNomment, caissesApresFusion, caissesApresDefaire,
} from '../src/shared/caisses-des-caissiers-pur';
import { decisionsDesCaisses, FUSION_DECIDEE } from '../src/shared/decisions-des-caisses-pur';
import { caissesPourLEquipe, gardeToutSonPasse } from '../src/shared/finance';
import { toucheeParLeDepart } from '../src/shared/depart-des-caisses-pur';
import { basculeLEcriture, type Sorte } from '../src/shared/bascule-des-caisses-pur';
import { tiroirsQuiSeComptent, tiroirsSansCloture } from '../src/shared/caisse-du-soir-pur';
import type { Cashbox } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const racine = process.cwd();
const lis2 = (f: string) => readFileSync(path.join(racine, f), 'utf8');
/* Le code sans ses commentaires (les chaînes gardées) : une règle se lit dans
   ce qui s'exécute, pas dans ce qui le raconte. */
function sansCommentaires(src: string): string {
  let out = '';
  let i = 0;
  let q: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

/* ── 1. LA FAMILLE DE CHAQUE MOYEN ───────────────────────────────────── */
const SA_LISTE = ['MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp', 'Avoir', 'MND PAY', 'Zelle', 'KkiaPay'];
dit('les moyens de sa liste, chacun à sa famille (Moov, Wave, PayPal sans caisse attitrée)',
  ['momo', 'autre', 'autre', 'autre', 'especes', 'banque', 'banque', 'autre', 'banque', 'autre', 'avoir', 'mndpay', 'zelle', 'kkiapay'],
  SA_LISTE.map(familleDuMoyen));

/* ── 2. L'ANNÉE ANTÉRIEURE ───────────────────────────────────────────── */
dit('2025, 2024, 2023, 2022 : antérieures ; l année en cours, non ; demain non plus',
  [true, true, true, true, false, false, false],
  ['2025-06-12', '2024-11-30', '2023-02-01', '2022-01-01', '2026-01-01', '2026-12-31', '2027-01-05'].map((d) => estAnneeAnterieure(d, '2026-10-17')));
dit('au 2 janvier 2027, un rendez-vous de 2026 devient antérieur tout seul', true, estAnneeAnterieure('2026-12-31', '2027-01-02'));
dit('sans date lisible : jamais antérieure', [false, false], [estAnneeAnterieure('', '2026-10-17'), estAnneeAnterieure(undefined, '2026-10-17')]);
const pur = sansCommentaires(lis2('src/shared/caisses-des-caissiers-pur.ts'));
dit('aucune année écrite en dur dans la règle', [], pur.match(/\b20\d\d\b/g) ?? []);

/* ── 3. LA CAISSE PROPOSÉE ───────────────────────────────────────────── */
const b = (name: string, x: Partial<Cashbox> = {}): Cashbox => ({ id: `cb-${name}`, branchId: 'cot', name, sub: '', glyph: '', openingXof: 0, ...x });
const BOITES: Cashbox[] = [
  b('Terrasse · Tiroir espèces', { role: 'terrasse', equipe: true, sub: 'Espèces du comptoir' }),
  b('Terrasse · MoMo MTN', { role: 'terrasse' }),
  b('Terrasse · MoMoPay société', { role: 'terrasse', equipe: true, sub: 'MTN MoMoPay' }),
  b('La Banque', { role: 'banque', sub: 'Compte de la société' }),
  b('Caisse du mois', { role: 'mois' }),
  b('KkiaPay', { role: 'terrasse' }),
  b('MND PAY', { sub: 'FedaPay · avant le reversement' }),
  b('Caisse de Gérard', { role: 'terrasse', equipe: true, caissierId: 'g1' }),
  b('Caisse de Brice', { role: 'terrasse', equipe: true, caissierId: 'b1' }),
  b('Ancienne caisse de Lou', { role: 'terrasse', caissierId: 'l1', archiveeLe: '2026-10-01' }),
];
const P = (methode: string, staffId?: string, dateDuRdv = '2026-10-17', boxes: Cashbox[] = BOITES, enDevise = false) =>
  caisseProposee({ methode, dateDuRdv, aujourdhui: '2026-10-17', boxes, branchId: 'cot', staffId, enDevise }).caisse ?? null;
dit('espèces : la caisse de qui encaisse (Gérard, Brice)', ['Caisse de Gérard', 'Caisse de Brice'], [P('Espèces', 'g1'), P('Espèces', 'b1')]);
dit('espèces, sans caisse à son nom ou sans fiche : le tiroir commun', ['Terrasse · Tiroir espèces', 'Terrasse · Tiroir espèces'], [P('Espèces', 'y1'), P('Espèces')]);
dit('une caisse rangée ne se propose plus', 'Terrasse · Tiroir espèces', P('Espèces', 'l1'));
dit('MTN MoMoPay → le compte MoMoPay de la Maison, pas le MoMo d un associé', 'Terrasse · MoMoPay société', P('MTN MoMo', 'g1'));
dit('carte, chèque, virement → La Banque', ['La Banque', 'La Banque', 'La Banque'], [P('Carte', 'g1'), P('Chèque', 'g1'), P('Virement bancaire', 'g1')]);
dit('le chèque dit qu il se dépose', true, /dépose/.test(caisseProposee({ methode: 'Chèque', aujourdhui: '2026-10-17', boxes: BOITES, branchId: 'cot' }).pourquoi));
dit('MND PAY → MND PAY ; l avoir → aucune caisse', ['MND PAY', null], [P('MND PAY', 'g1'), P('Avoir', 'g1')]);
dit('Moov, Wave, PayPal : rien ne se propose, on choisit', [null, null, null], [P('Moov', 'g1'), P('Wave', 'g1'), P('PayPal', 'g1')]);
dit('jamais la première venue : KkiaPay ne prend pas les espèces', true, P('Espèces', 'zz') !== 'KkiaPay');
const passe = caisseProposee({ methode: 'Espèces', dateDuRdv: '2025-03-02', aujourdhui: '2026-10-17', boxes: BOITES, branchId: 'cot', staffId: 'g1' });
dit('un rendez-vous de 2025 : les années passées, quel que soit le caissier, et la caisse est à créer',
  { caisse: CAISSE_ANNEES_PASSEES, anneePassee: 2025, aCreer: true }, { caisse: passe.caisse, anneePassee: passe.anneePassee, aCreer: passe.aCreer });
dit('2023 aussi, et tout moyen : MoMo, carte, chèque, Moov', [CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES],
  ['MTN MoMo', 'Carte', 'Chèque', 'Moov'].map((m) => P(m, 'b1', '2023-07-14')));
dit('sauf MND PAY (chez FedaPay) et l avoir', ['MND PAY', null], [P('MND PAY', 'g1', '2024-05-05'), P('Avoir', 'g1', '2024-05-05')]);
const avecLaCaisse = [...BOITES, b(CAISSE_ANNEES_PASSEES, { role: 'archive' })];
dit('la caisse existe : plus rien à créer', undefined, caisseProposee({ methode: 'Espèces', dateDuRdv: '2025-03-02', aujourdhui: '2026-10-17', boxes: avecLaCaisse, branchId: 'cot' }).aCreer);
dit('un rendez-vous de l année ne la voit jamais, même quand elle existe', 'Caisse de Gérard', P('Espèces', 'g1', '2026-02-10', avecLaCaisse));
const usd = [b('Zelle', { currency: 'USD' })];
dit('un billet étranger garde son tiroir, même pour une année antérieure', ['Zelle', 'Zelle'], [P('Zelle', 'g1', '2026-10-17', usd, true), P('Espèces', 'g1', '2025-01-01', usd, true)]);
dit('une autre branche ne prête pas ses caisses', null, P('Espèces', 'g1', '2026-10-17', BOITES.map((x) => ({ ...x, branchId: 'porto' }))));

/* ── 4. QUI PEUT CHANGER ─────────────────────────────────────────────── */
dit('la direction toujours ; les autres seulement sans proposition', [true, false, true, true],
  [peutChangerLaCaisse(true, { caisse: 'La Banque' }), peutChangerLaCaisse(false, { caisse: 'La Banque' }), peutChangerLaCaisse(false, {}), peutChangerLaCaisse(true, {})]);
const choixDeGerard = caissesAuChoix(BOITES, { staffId: 'g1', estDirection: false, anneePassee: false }).map((x) => x.name);
dit('au choix, Gérard ne voit ni la caisse de Brice, ni MND PAY', [false, false, true],
  [choixDeGerard.includes('Caisse de Brice'), choixDeGerard.includes('MND PAY'), choixDeGerard.includes('Caisse de Gérard')]);
dit('la direction voit les caisses de chacun', true, caissesAuChoix(BOITES, { estDirection: true, anneePassee: false }).some((x) => x.name === 'Caisse de Brice'));
dit('les années passées ne s offrent que pour une année antérieure', [false, true],
  [caissesAuChoix(avecLaCaisse, { estDirection: true, anneePassee: false }).some((x) => x.name === CAISSE_ANNEES_PASSEES),
    caissesAuChoix(avecLaCaisse, { estDirection: true, anneePassee: true }).some((x) => x.name === CAISSE_ANNEES_PASSEES)]);

/* ── LA CAISSE NEUVE ─────────────────────────────────────────────────── */
const neuve = caisseNeuveDuCaissier('cot', { id: 'k9', name: 'Kémi Adjovi' }, BOITES);
dit('la caisse neuve : son prénom, son identifiant tiré de la fiche, la Terrasse, ouverte à l équipe',
  { id: 'cb-caissier-k9', name: 'Caisse de Kémi', role: 'terrasse', equipe: true, caissierId: 'k9' },
  { id: neuve.id, name: neuve.name, role: neuve.role, equipe: neuve.equipe, caissierId: neuve.caissierId });
dit('deux Gérard : la seconde prend le nom entier', 'Caisse de Gérard Houngbo', caisseNeuveDuCaissier('cot', { id: 'g2', name: 'Gérard Houngbo' }, BOITES).name);
dit('elle se retrouve par sa fiche', 'Caisse de Kémi', caisseDuCaissier([...BOITES, neuve], 'cot', 'k9')?.name);

/* ── 5. LE SOIR ──────────────────────────────────────────────────────── */
const soir = tiroirsQuiSeComptent([...avecLaCaisse], 'cot').map((x) => x.name);
dit('le soir : la caisse de Gérard se compte ; ni les années passées, ni MND PAY', [true, false, false],
  [soir.includes('Caisse de Gérard'), soir.includes(CAISSE_ANNEES_PASSEES), soir.includes('MND PAY')]);
const oublis = tiroirsSansCloture({
  branchId: 'cot', date: '2026-10-17',
  registre: [{ date: '2026-10-17', cashbox: 'Caisse de Gérard' }, { date: '2026-10-17', cashbox: CAISSE_ANNEES_PASSEES }, { date: '2026-10-17', cashbox: 'MND PAY' }],
  depenses: [], clotures: [],
});
dit('la veille ne réclame ni les années passées ni MND PAY', ['Caisse de Gérard'], oublis);

/* ── 6. LES RÈGLES DANS LE CODE ──────────────────────────────────────── */
const actions = sansCommentaires(lis2('src/apps/trone/routes/clients/actions.tsx'));
const caisse = sansCommentaires(lis2('src/apps/trone/routes/vente/Caisse.tsx'));
const personnel = sansCommentaires(lis2('src/apps/trone/routes/equipe/Personnel.tsx'));
dit('le rituel déduit la caisse par la règle, jamais par la première de la liste', [true, false],
  [/caisseProposee\(\{/.test(actions), /eligibleBoxes\[0\]/.test(actions)]);
dit('le choix de la caisse ne s ouvre qu à qui peut la changer', true, /const montreLeChoix = c\.peutChanger && /.test(actions));
dit('un versement par part, chacun avec sa caisse', true, /parts\.forEach\(\(pt, i\) => \{[\s\S]{0,400}cashbox: c\.caisse \|\| undefined/.test(actions));
const iConfirm = actions.indexOf('const confirm = (garderOuvert = false) =>');
const iCree = actions.indexOf('caisseDesAnneesPassees(branch.id)', iConfirm);
const iEcrit = actions.indexOf('invoicesStore.set(', iConfirm);
dit('la caisse des années passées naît AVANT que l argent s écrive', true, iConfirm > 0 && iCree > iConfirm && iCree < iEcrit);
dit('une année antérieure date l argent du rituel par défaut', true, /useState\(\(\) => \(estAnneeAnterieure\(appt\.date, todayISO\(\)\) && appt\.date \? appt\.date : todayISO\(\)\)\)/.test(actions));
dit('le bandeau dit qui encaisse, et l année antérieure seulement quand elle l est', [true, true],
  [/Encaissé par \$\{quiNom\}/.test(actions), /\{anneePassee \? ` · rendez-vous de \$\{anneeDe\(appt\.date\)\}/.test(actions)]);
dit('les tuiles : MTN MoMoPay, Chèque, et pas de Moov', [true, true, false],
  [/nom: 'MTN MoMoPay'/.test(actions), /nom: 'Chèque'/.test(actions), /nom: 'Moov/.test(actions)]);
dit('la Caisse suit la même règle, et cache la liste à qui ne peut pas changer', [true, true],
  [/caisseProposee\(\{/.test(caisse), /hasCashbox && !peutChangerPos \?/.test(caisse)]);
dit('la fiche du personnel ouvre la caisse, direction seule', true,
  /editId && estDirection && \(\(\) => \{[\s\S]{0,200}caisseDuCaissier\(/.test(personnel) && /caisseNeuveDuCaissier\(/.test(personnel));


/* ── 7. LES AUTRES CAISSES ───────────────────────────────────────────── */
const AVEC_BIIC: Cashbox[] = [...BOITES.filter((x) => x.role !== 'banque'), b('BIIC', { role: 'banque', horsEncaissement: true }), b('La Banque', { role: 'banque' })];
dit('BIIC à part : la carte va à La Banque, jamais à BIIC (même au rôle banque)', 'La Banque', P('Carte', 'g1', '2026-10-17', AVEC_BIIC));
dit('BIIC seule banque, mais à part : rien ne se propose, on choisit', null, P('Carte', 'g1', '2026-10-17', [b('BIIC', { role: 'banque', horsEncaissement: true })]));
dit('au choix : BIIC cachée au caissier, offerte à la direction', [false, true],
  [caissesAuChoix(AVEC_BIIC, { staffId: 'g1', estDirection: false, anneePassee: false }).some((x) => x.name === 'BIIC'),
    caissesAuChoix(AVEC_BIIC, { estDirection: true, anneePassee: false }).some((x) => x.name === 'BIIC')]);

const AVANT: Cashbox[] = [
  b('BIIC'),
  b('Caisse Indépendantes', { equipe: true }),
  b('Terrasse · Tiroir espèces', { role: 'terrasse', equipe: true }),
  b(CAISSE_ANNEES_PASSEES, { role: 'archive' }),
  b('Wells Fargo', { horsBilan: true }),
  b('Ancienne BIIC', { archiveeLe: '2026-10-04' }),
];
const APRES = decisionsDesCaisses(AVANT, '2026-10-17');
const lis = (l: Cashbox[] | null, nom: string) => l?.find((x) => x.name === nom);
dit('les décisions : BIIC à part ; Indépendantes remplacée, sans encaissement, hors de l équipe ; l histoire', {
  biic: true, ind: ['2026-10-17', true, undefined, '2026-10-17'], hist: true, wells: undefined,
}, {
  biic: lis(APRES, 'BIIC')?.horsEncaissement,
  ind: [lis(APRES, 'Caisse Indépendantes')?.remplaceeLe, lis(APRES, 'Caisse Indépendantes')?.horsEncaissement, lis(APRES, 'Caisse Indépendantes')?.equipe, lis(APRES, 'Caisse Indépendantes')?.equipeRetireeLe],
  hist: lis(APRES, CAISSE_ANNEES_PASSEES)?.histoire, wells: lis(APRES, 'Wells Fargo')?.horsEncaissement,
});
dit('une seconde fois : rien ne change (une décision ne s applique qu une fois)', null, decisionsDesCaisses(APRES!, '2026-10-18'));
dit('BIIC recochée à la main (false) : la décision ne repasse pas', null, decisionsDesCaisses([b('BIIC', { horsEncaissement: false })], '2026-10-18'));
const seule = decisionsDesCaisses([b('Caisse Indépendantes', { equipe: true }), b('Wells Fargo')], '2026-10-17');
dit('seule caisse de l équipe : elle le reste (sinon l équipe verrait TOUT)', [true, undefined], [lis(seule, 'Caisse Indépendantes')?.equipe, lis(seule, 'Caisse Indépendantes')?.equipeRetireeLe]);
const plusTard = decisionsDesCaisses([...seule!, b('Caisse de Gérard', { equipe: true, caissierId: 'g1' })], '2026-10-20');
dit('... et la quitte le jour où une caisse de caissier lui est ouverte', [undefined, '2026-10-20'], [lis(plusTard, 'Caisse Indépendantes')?.equipe, lis(plusTard, 'Caisse Indépendantes')?.equipeRetireeLe]);
dit('une caisse rangée ne bouge pas', undefined, lis(APRES, 'Ancienne BIIC')?.horsEncaissement);

const EQUIPE: Cashbox[] = [
  b('Terrasse · Tiroir espèces', { equipe: true }), b('Caisse de Gérard', { equipe: true, caissierId: 'g1' }),
  b('Caisse de Brice', { equipe: true, caissierId: 'b1' }), b('Wells Fargo'),
];
dit('dépenses, chacun la sienne : Gérard voit la sienne et le tiroir, pas celle de Brice ; la direction tout',
  [['Terrasse · Tiroir espèces', 'Caisse de Gérard'], 4, ['Terrasse · Tiroir espèces']],
  [caissesPourLEquipe(EQUIPE, false, 'g1').map((x) => x.name), caissesPourLEquipe(EQUIPE, true, 'g1').length, caissesPourLEquipe(EQUIPE, false).map((x) => x.name)]);
dit('aucune caisse ouverte à l équipe : toutes restent visibles (la règle échoue ouvert)', 2, caissesPourLEquipe([b('A'), b('B')], false, 'g1').length);

dit('l histoire garde tout son passé et échappe au départ des caisses', [true, true, false, false, true],
  [gardeToutSonPasse(caisseDesAnneesPassees('cot')), gardeToutSonPasse(b('X', { jusquAu: '2026-09-30' })), gardeToutSonPasse(b('Y')),
    toucheeParLeDepart(caisseDesAnneesPassees('cot'), 'cot'), toucheeParLeDepart(b('Y'), 'cot')]);

/* La fusion, sorte par sorte, puis le retour à l'identique. */
const DE = 'Reprise 2025';
const LOTS: Partial<Record<Sorte, unknown[]>> = {
  factures: [
    { id: 'f1', cashbox: DE, date: '2026-02-01', payments: [{ id: 'p1', cashbox: DE, date: '2026-02-01', amountXof: 25000 }, { id: 'p2', cashbox: 'La Banque', date: '2026-02-03', amountXof: 5000 }] },
    { id: 'f2', cashbox: 'Caisse principale', date: '2025-05-01' },
  ],
  depenses: [{ id: 'd1', cashbox: DE, date: '2026-03-01' }, { id: 'd2', cashbox: 'Terrasse · Tiroir espèces', date: '2026-10-02' }],
  transferts: [{ id: 't1', de: DE, vers: 'La Banque', date: '2026-03-02' }, { id: 't2', de: 'La Banque', vers: DE, date: '2026-03-03' }],
  rendezVous: [{ id: 'r1', payments: [{ id: 'q1', cashbox: DE, date: '2026-01-10' }] }],
  /* Une case déjà réécrite par la bascule d'octobre garde sa note à elle. */
  clotures: [{ id: 'c1', cashbox: 'Terrasse · MoMo MTN', cashboxAvant: 'MoMo Brice', date: '2026-10-05' }],
};
const fondus: Partial<Record<Sorte, unknown[]>> = Object.fromEntries(Object.entries(LOTS).map(([so, l]) => [so, (l ?? []).map((e) => fusionneLEcriture(so as Sorte, e, DE, CAISSE_ANNEES_PASSEES))]));
/* Toute case qui NOMME la caisse, miroir de la pièce compris : un champ
   `cashbox`, `de` ou `vers` qui porte son nom (les notes …Avant… exceptées).
   Dans l'exemple : le miroir de f1, p1, d1, t1.de, t2.vers, q1 = 6. */
const nomment = (lots: unknown, nom: string) => (JSON.stringify(lots).match(new RegExp(`"(cashbox|de|vers)":"${nom}"`, 'g')) ?? []).length;
dit('avant la fusion : 6 cases nomment Reprise 2025 (le compteur de l écran en voit 5, sans le miroir)', [6, 5], [nomment(LOTS, DE), casesQuiNomment(LOTS, DE)]);
dit('après : plus aucune, nulle part ; les 6 sont aux années passées', [0, 0, 6], [nomment(fondus, DE), casesQuiNomment(fondus, DE), nomment(fondus, CAISSE_ANNEES_PASSEES)]);
dit('chaque case garde son ancien nom à côté (AvantFusion), sans toucher à la note de la bascule', [DE, DE, 'MoMo Brice', undefined],
  [(fondus.factures![0] as { payments: { cashboxAvantFusion?: string }[] }).payments[0].cashboxAvantFusion,
    (fondus.transferts![1] as { versAvantFusion?: string }).versAvantFusion,
    (fondus.clotures![0] as { cashboxAvant?: string }).cashboxAvant,
    (fondus.depenses![1] as { cashboxAvantFusion?: string }).cashboxAvantFusion]);
const rendus = Object.fromEntries(Object.entries(fondus).map(([so, l]) => [so, (l ?? []).map((e) => defaisLaFusionDeLEcriture(so as Sorte, e, DE))]));
dit('défaire la fusion rend les écritures À L IDENTIQUE', JSON.stringify(LOTS), JSON.stringify(rendus));
const autreFusion = fusionneLEcriture('depenses', { id: 'x', cashbox: 'Caisse Bito', date: '2026-01-01' }, 'Caisse Bito', 'Caisse Mamou');
dit('défaire Reprise 2025 ne défait pas une autre fusion', 'Caisse Mamou', (defaisLaFusionDeLEcriture('depenses', autreFusion, DE) as { cashbox: string }).cashbox);
dit('la bascule d octobre garde son comportement (même moteur)', 'Terrasse · MoMo MTN',
  (basculeLEcriture('depenses', { id: 'z', cashbox: 'MoMo Brice', date: '2026-10-05' }, { etape: 'ouvrir', destins: { 'MoMo Brice': { sort: 'suite', nom: 'Terrasse · MoMo MTN', role: 'terrasse' } }, octobreVers: {} }) as { cashbox: string }).cashbox);

const CAISSES_F: Cashbox[] = [b(DE, { openingXof: 40000, jusquAu: '2026-09-30' }), b('La Banque', { role: 'banque' })];
const apresF = caissesApresFusion(CAISSES_F, 'cot', DE, CAISSE_ANNEES_PASSEES, '2026-10-17T12:00:00Z', () => caisseDesAnneesPassees('cot'));
dit('les caisses après la fusion : les années passées naissent avec l ouverture ; Reprise 2025 rangée, elle dit où', {
  ap: [40000, true], de: ['2026-10-17T12:00:00Z', CAISSE_ANNEES_PASSEES, 0, 40000],
}, {
  ap: [lis(apresF, CAISSE_ANNEES_PASSEES)?.openingXof, lis(apresF, CAISSE_ANNEES_PASSEES)?.histoire],
  de: [lis(apresF, DE)?.archiveeLe, lis(apresF, DE)?.fondueDans, lis(apresF, DE)?.openingXof, lis(apresF, DE)?.avantLaFusion?.openingXof],
});
dit('défaire : les caisses reviennent comme avant (ouvertures comprises)', [40000, undefined, undefined, 0],
  (() => { const r = caissesApresDefaire(apresF, 'cot', DE); return [lis(r, DE)?.openingXof, lis(r, DE)?.archiveeLe, lis(r, DE)?.fondueDans, lis(r, CAISSE_ANNEES_PASSEES)?.openingXof]; })());
dit('la fusion décidée : « Reprise 2025 », et rien d autre', [true, true, false, false],
  [FUSION_DECIDEE.de.test('Reprise 2025'), FUSION_DECIDEE.de.test(' reprise 2025 '), FUSION_DECIDEE.de.test('Reprise 2024'), FUSION_DECIDEE.de.test('Reprise 2025 bis')]);

const shell = sansCommentaires(lis2('src/apps/trone/shell/Shell.tsx'));
const fusionEcran = sansCommentaires(lis2('src/apps/trone/routes/finances/FusionDesCaisses.tsx'));
const depenses = sansCommentaires(lis2('src/apps/trone/routes/finances/Depenses.tsx'));
const tiroirs = sansCommentaires(lis2('src/apps/trone/routes/finances/tiroirs.tsx'));
dit('les décisions : par la direction seule, une fois la table des caisses descendue', true,
  /if \(!estDirectionDuShell\) return;\s*quandTablePrete\('cashboxes', \(\) => \{[\s\S]{0,200}decisionsDesCaisses\(/.test(shell));
dit('la fusion ne part qu après la sauvegarde', true, /disabled=\{!sauvee\} onClick=\{fondre\}/.test(fusionEcran));
dit('les dépenses passent la fiche de qui saisit', true, /caissesPourLEquipe\(toutesLesCaisses, voitToutesLesDepenses, maFiche\?\.id\)/.test(depenses));
dit('les soldes et la trésorerie lisent l histoire comme les anciennes', [true, true],
  [/const ancienne = gardeToutSonPasse\(boxOf\(name\)\);\s*const keep/.test(tiroirs), /!b\.horsBilan && !gardeToutSonPasse\(b\) && soldeVisible/.test(tiroirs)]);

console.log(ko === 0 ? '\nLes caisses des caissiers tiennent leurs regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
