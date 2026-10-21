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
      qui garde tout son passé.

   21 OCTOBRE 2026 : LES CAISSES PORTENT LE NOM DES PAIEMENTS. « Chaque
   paiement doit être attribué à une caisse. Quand je choisis un paiement que
   sa caisse soit automatiquement sélectionnée. Il faut également rajouter
   Momo Privé. Les caisses doivent porter les mêmes noms que les paiements »,
   puis au sélecteur : une seule « Espèces » (plus de caisse par caissier),
   « Carte », « MoMo Privé », « Autres », et « Reprise d'une année passée »
   parmi les autres moyens, qui va aux années passées. Les contrôles des
   sections 1, 3, 4, 5 et 6 portent désormais SA règle du 21 octobre.

   21 OCTOBRE 2026, LES AUTRES MOYENS REVUS : « Dans les autres moyens il faut
   enlever moov et celtis et mettre zelle, et interac, revolut, paypal », puis
   au sélecteur « Une caisse par moyen » : Zelle (USD), Interac (CAD),
   Revolut (EUR), PayPal (USD), chacun sa caisse à son nom, dans sa devise
   (section 8). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CAISSE_ANNEES_PASSEES, caisseProposee, caissesAuChoix,
  estAnneeAnterieure, familleDuMoyen, peutChangerLaCaisse, caisseDesAnneesPassees,
  fusionneLEcriture, defaisLaFusionDeLEcriture, casesQuiNomment, caissesApresFusion, caissesApresDefaire,
  CAISSE_CHEQUE, caisseDesCheques, HORS_CLOTURE, caisseMomopayDeLaMaison, avecLesMoyensDeLaMaison, poseLaCaisse,
  MOYEN_MOMO_PRIVE, MOYEN_REPRISE, caisseNeuveDuPaiement, deviseDuMoyen,
} from '../src/shared/caisses-des-caissiers-pur';
import { decisionsDesCaisses, FUSION_DECIDEE } from '../src/shared/decisions-des-caisses-pur';
import { caissesPourLEquipe, gardeToutSonPasse } from '../src/shared/finance';
import { toucheeParLeDepart } from '../src/shared/depart-des-caisses-pur';
import { basculeLEcriture, type Sorte } from '../src/shared/bascule-des-caisses-pur';
import { tiroirsQuiSeComptent, tiroirsSansCloture } from '../src/shared/caisse-du-soir-pur';
import type { Cashbox } from '../src/shared/finance';
import { soldeDeLaPiece } from '../src/apps/trone/routes/vente/encaissement-pur';

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
const SA_LISTE = ['MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp', 'Avoir', 'MND PAY', 'Zelle', 'KkiaPay', 'MoMo Privé', 'Reprise d’une année passée'];
dit('les moyens de sa liste, chacun à sa famille (Moov, Wave, virement : « autre » ; PayPal, Zelle, MoMo Privé et la reprise ont la leur)',
  ['momo', 'autre', 'autre', 'autre', 'especes', 'carte', 'autre', 'paypal', 'cheque', 'autre', 'avoir', 'mndpay', 'zelle', 'kkiapay', 'momoPrive', 'reprise'],
  SA_LISTE.map(familleDuMoyen));
dit('sa liste, plus MoMo Privé juste après son MTN, les quatre moyens en devise, et la reprise à la fin ; déjà là, rien ne s ajoute',
  [['MTN MoMo', MOYEN_MOMO_PRIVE, 'Espèces', 'Zelle', 'Interac', 'Revolut', 'PayPal', MOYEN_REPRISE], ['Espèces', 'Momo privé', 'reprise année passée', 'Zelle', 'Interac', 'Revolut', 'PayPal']],
  [avecLesMoyensDeLaMaison(['MTN MoMo', 'Espèces']), avecLesMoyensDeLaMaison(['Espèces', 'Momo privé', 'reprise année passée'])]);

/* ── 2. L'ANNÉE ANTÉRIEURE ───────────────────────────────────────────── */
dit('2025, 2024, 2023, 2022 : antérieures ; l année en cours, non ; demain non plus',
  [true, true, true, true, false, false, false],
  ['2025-06-12', '2024-11-30', '2023-02-01', '2022-01-01', '2026-01-01', '2026-12-31', '2027-01-05'].map((d) => estAnneeAnterieure(d, '2026-10-17')));
dit('au 2 janvier 2027, un rendez-vous de 2026 devient antérieur tout seul', true, estAnneeAnterieure('2026-12-31', '2027-01-02'));
dit('sans date lisible : jamais antérieure', [false, false], [estAnneeAnterieure('', '2026-10-17'), estAnneeAnterieure(undefined, '2026-10-17')]);
const pur = sansCommentaires(lis2('src/shared/caisses-des-caissiers-pur.ts'));
dit('aucune année écrite en dur dans la règle', [], pur.match(/\b20\d\d\b/g) ?? []);

/* ── 3. LA CAISSE PROPOSÉE (sa règle du 21 octobre 2026) ─────────────── */
const b = (name: string, x: Partial<Cashbox> = {}): Cashbox => ({ id: `cb-${name}`, branchId: 'cot', name, sub: '', glyph: '', openingXof: 0, ...x });
const BOITES: Cashbox[] = [
  b('Terrasse · Tiroir espèces', { role: 'terrasse', equipe: true, sub: 'Espèces du comptoir' }),
  b('Terrasse · MoMo MTN', { role: 'terrasse' }),
  caisseMomopayDeLaMaison('cot'),
  b('La Banque', { role: 'banque', sub: 'Compte de la société' }),
  b('Caisse du mois', { role: 'mois' }),
  b('KkiaPay', { role: 'terrasse' }),
  b('MND PAY', { sub: 'FedaPay · avant le reversement' }),
  b('Caisse de Gérard', { role: 'terrasse', equipe: true, caissierId: 'g1' }),
  b('Caisse de Brice', { role: 'terrasse', equipe: true, caissierId: 'b1' }),
  b('Ancienne caisse de Lou', { role: 'terrasse', caissierId: 'l1', archiveeLe: '2026-10-01' }),
];
const P = (methode: string, staffId?: string, dateDuRdv = '2026-10-21', boxes: Cashbox[] = BOITES, enDevise = false) =>
  caisseProposee({ methode, dateDuRdv, aujourdhui: '2026-10-21', boxes, branchId: 'cot', staffId, enDevise }).caisse ?? null;
dit('espèces : UNE caisse des espèces pour toute la Maison, jamais celle de qui encaisse (Gérard, Brice, sans fiche)',
  ['Terrasse · Tiroir espèces', 'Terrasse · Tiroir espèces', 'Terrasse · Tiroir espèces'], [P('Espèces', 'g1'), P('Espèces', 'b1'), P('Espèces')]);
dit('MTN MoMoPay → le compte MoMoPay de la Maison, pas le MoMo d un associé', 'MTN MoMoPay', P('MTN MoMo', 'g1'));
{
  /* CHAQUE PAIEMENT A SA CAISSE : celle qui manque naît, à son nom, avec son
     identifiant tiré de la branche ; on ne choisit plus jamais à la main. */
  const tous = ['Carte', 'MoMo Privé', 'Momo privé', 'Moov', 'Wave', 'PayPal', 'Virement bancaire', 'Lien WhatsApp', 'Chèque'];
  const r = tous.map((m) => caisseProposee({ methode: m, dateDuRdv: '2026-10-21', aujourdhui: '2026-10-21', boxes: BOITES, branchId: 'cot' }));
  dit('carte, MoMo Privé, Moov, Wave, PayPal, virement, lien, chèque : chacun sa caisse au nom du paiement (PayPal la sienne)',
    ['Carte', 'MoMo Privé', 'MoMo Privé', 'Autres', 'Autres', 'PayPal', 'Autres', 'Autres', 'Chèque'], r.map((x) => x.caisse ?? null));
  dit('... elles naissent avec leur identifiant (une par branche)', ['cb-carte-cot', 'cb-momo-prive-cot', 'cb-momo-prive-cot', 'cb-autres-cot', 'cb-autres-cot', 'cb-paypal-cot', 'cb-autres-cot', 'cb-autres-cot', 'cb-cheques-cot'],
    r.map((x) => x.aCreer?.id ?? null));
  dit('... et un caissier ne peut pas la changer : elle est choisie d office', [false, false], [peutChangerLaCaisse(false, r[0]), peutChangerLaCaisse(false, r[3])]);
  const nees = r.reduce<Cashbox[]>((l, x) => (x.aCreer ? poseLaCaisse(l, x.aCreer) : l), [...BOITES]);
  dit('posées une fois, elles sont trouvées ensuite, rien ne renaît',
    [['Carte', 'MoMo Privé', 'Autres', 'Chèque'], [null, null, null, null]],
    [['Carte', 'MoMo Privé', 'Moov', 'Chèque'].map((m) => P(m, 'g1', '2026-10-21', nees)),
      ['Carte', 'MoMo Privé', 'Moov', 'Chèque'].map((m) => caisseProposee({ methode: m, aujourdhui: '2026-10-21', boxes: nees, branchId: 'cot' }).aCreer?.id ?? null)]);
  dit('poser une caisse rangée la rouvre, au lieu d en faire une seconde', [1, null],
    (() => { const l = poseLaCaisse([{ ...caisseDesCheques('cot'), archiveeLe: '2026-10-20' }], caisseDesCheques('cot')); return [l.length, l[0].archiveeLe ?? null]; })());
}
/* LES NOMS D'AVANT : tant que le panneau des noms n'est pas appliqué, la
   caisse se retrouve par son identifiant, sous son ancien nom. */
dit('avant le panneau : « MoMoPay Maison MND » et « Chèques à déposer » reçoivent encore leur paiement, par leur identifiant',
  ['MoMoPay Maison MND', 'Chèques à déposer'],
  [P('MTN MoMo', undefined, '2026-10-21', [{ ...caisseMomopayDeLaMaison('cot'), name: 'MoMoPay Maison MND' }]),
    P('Chèque', undefined, '2026-10-21', [{ ...caisseDesCheques('cot'), name: 'Chèques à déposer' }])]);
dit('... et sous un autre identifiant, par leur nom d avant (« Tiroir espèces » compris)', ['MoMoPay Maison MND', 'Chèques à déposer', 'Tiroir espèces'],
  [P('MTN MoMo', undefined, '2026-10-21', [b('MoMoPay Maison MND')]), P('Chèque', undefined, '2026-10-21', [b('Chèques à déposer')]),
    P('Espèces', undefined, '2026-10-21', [b('Tiroir espèces')])]);
dit('le tiroir du tri (Real Money, par son identifiant) reçoit les espèces avant tout renommage', 'Real Money',
  P('Espèces', 'g1', '2026-10-21', [{ ...b('Real Money'), id: 'ytb0sweqjt' }, b('Caisse de Gérard', { caissierId: 'g1', role: 'terrasse' })]));
dit('une caisse du paiement mise à part la reçoit quand même : chaque paiement a sa caisse', 'Chèque',
  P('Chèque', 'g1', '2026-10-21', [{ ...caisseDesCheques('cot'), horsEncaissement: true }, ...BOITES]));
dit('la caisse des chèques d une autre branche ne compte pas ici : la sienne naît', ['Chèque', 'cb-cheques-cot'],
  (() => { const x = caisseProposee({ methode: 'Chèque', aujourdhui: '2026-10-21', boxes: [caisseDesCheques('pn'), ...BOITES], branchId: 'cot' }); return [x.caisse, x.aCreer?.id]; })());
dit('la caisse des chèques : une par branche, même identifiant à chaque fois, rôle banque, ouverte à 0', ['cb-cheques-cot', 'cot', 'banque', 0, 'Chèque'],
  [caisseDesCheques('cot').id, caisseDesCheques('cot').branchId, caisseDesCheques('cot').role, caisseDesCheques('cot').openingXof, caisseDesCheques('cot').name]);
dit('le chèque, la carte et les autres ne se comptent pas le soir ; MoMo Privé, si', [true, true, true, true, false],
  [HORS_CLOTURE.includes(CAISSE_CHEQUE), HORS_CLOTURE.includes('Chèques à déposer'), HORS_CLOTURE.includes('Carte'), HORS_CLOTURE.includes('Autres'), HORS_CLOTURE.includes('MoMo Privé')]);
dit('MND PAY → MND PAY ; l avoir → aucune caisse', ['MND PAY', null], [P('MND PAY', 'g1'), P('Avoir', 'g1')]);
dit('jamais la première venue : KkiaPay ne prend pas les espèces', true, P('Espèces', 'zz') !== 'KkiaPay');
/* LA REPRISE D'UNE ANNÉE PASSÉE, choisie à la main (21 octobre 2026) : une
   reprise inscrite à une autre date que son rendez-vous va aux années
   passées, même pour un rendez-vous de l'année. */
{
  const rep = caisseProposee({ methode: MOYEN_REPRISE, dateDuRdv: '2026-10-21', aujourdhui: '2026-10-21', boxes: BOITES, branchId: 'cot' });
  dit('« Reprise d une année passée » → les années passées, même daté de l année, la caisse à créer', [CAISSE_ANNEES_PASSEES, 'cb-annees-passees-cot', true],
    [rep.caisse, rep.aCreer?.id, rep.aCreer?.histoire]);
  dit('... et quand elle existe, elle la reçoit sans renaître', [CAISSE_ANNEES_PASSEES, null],
    (() => { const x = caisseProposee({ methode: MOYEN_REPRISE, aujourdhui: '2026-10-21', boxes: [...BOITES, caisseDesAnneesPassees('cot')], branchId: 'cot' }); return [x.caisse, x.aCreer?.id ?? null]; })());
}
const passe = caisseProposee({ methode: 'Espèces', dateDuRdv: '2025-03-02', aujourdhui: '2026-10-21', boxes: BOITES, branchId: 'cot', staffId: 'g1' });
dit('un rendez-vous de 2025 : les années passées, quel que soit le caissier, et la caisse est à créer',
  { caisse: CAISSE_ANNEES_PASSEES, anneePassee: 2025, aCreer: 'cb-annees-passees-cot' }, { caisse: passe.caisse, anneePassee: passe.anneePassee, aCreer: passe.aCreer?.id });
dit('2023 aussi, et tout moyen : MoMo, carte, chèque, Moov, MoMo Privé', [CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES, CAISSE_ANNEES_PASSEES],
  ['MTN MoMo', 'Carte', 'Chèque', 'Moov', 'MoMo Privé'].map((m) => P(m, 'b1', '2023-07-14')));
dit('sauf MND PAY (chez FedaPay) et l avoir', ['MND PAY', null], [P('MND PAY', 'g1', '2024-05-05'), P('Avoir', 'g1', '2024-05-05')]);
const avecLaCaisse = [...BOITES, b(CAISSE_ANNEES_PASSEES, { role: 'archive' })];
dit('la caisse existe : plus rien à créer', null, caisseProposee({ methode: 'Espèces', dateDuRdv: '2025-03-02', aujourdhui: '2026-10-21', boxes: avecLaCaisse, branchId: 'cot' }).aCreer?.id ?? null);
dit('un rendez-vous de l année ne la voit jamais, même quand elle existe', 'Terrasse · Tiroir espèces', P('Espèces', 'g1', '2026-02-10', avecLaCaisse));
const usd = [b('Zelle', { currency: 'USD' })];
dit('un billet étranger garde son tiroir, même pour une année antérieure', ['Zelle', 'Zelle'], [P('Zelle', 'g1', '2026-10-21', usd, true), P('Espèces', 'g1', '2025-01-01', usd, true)]);
dit('une autre branche ne prête pas ses caisses : celle des espèces naît ici', ['Espèces', 'cb-especes-cot'],
  (() => { const x = caisseProposee({ methode: 'Espèces', aujourdhui: '2026-10-21', boxes: BOITES.map((y) => ({ ...y, branchId: 'porto' })), branchId: 'cot' }); return [x.caisse, x.aCreer?.id]; })());

/* ── 4. QUI PEUT CHANGER ─────────────────────────────────────────────── */
dit('la direction toujours ; les autres seulement sans proposition (un billet étranger sans tiroir)', [true, false, true, true],
  [peutChangerLaCaisse(true, { caisse: 'La Banque' }), peutChangerLaCaisse(false, { caisse: 'La Banque' }), peutChangerLaCaisse(false, {}), peutChangerLaCaisse(true, {})]);
const choixDeGerard = caissesAuChoix(BOITES, { staffId: 'g1', estDirection: false, anneePassee: false }).map((x) => x.name);
dit('au choix : plus aucune caisse de caissier (la sienne non plus), ni MND PAY', [false, false, false],
  [choixDeGerard.includes('Caisse de Brice'), choixDeGerard.includes('MND PAY'), choixDeGerard.includes('Caisse de Gérard')]);
dit('la direction non plus ne met de l argent dans une caisse de caissier', false, caissesAuChoix(BOITES, { estDirection: true, anneePassee: false }).some((x) => x.name === 'Caisse de Brice'));
dit('les années passées ne s offrent que pour une année antérieure', [false, true],
  [caissesAuChoix(avecLaCaisse, { estDirection: true, anneePassee: false }).some((x) => x.name === CAISSE_ANNEES_PASSEES),
    caissesAuChoix(avecLaCaisse, { estDirection: true, anneePassee: true }).some((x) => x.name === CAISSE_ANNEES_PASSEES)]);

/* ── 5. LE SOIR ──────────────────────────────────────────────────────── */
const soir = tiroirsQuiSeComptent([...avecLaCaisse, b('Carte', { role: 'banque' }), b('Autres'), b('MoMo Privé')], 'cot').map((x) => x.name);
dit('le soir : le tiroir et MoMo Privé se comptent ; ni les années passées, ni MND PAY, ni la carte, ni les autres', [true, true, false, false, false, false],
  [soir.includes('Terrasse · Tiroir espèces'), soir.includes('MoMo Privé'), soir.includes(CAISSE_ANNEES_PASSEES), soir.includes('MND PAY'), soir.includes('Carte'), soir.includes('Autres')]);
const oublis = tiroirsSansCloture({
  branchId: 'cot', date: '2026-10-21',
  registre: [{ date: '2026-10-21', cashbox: 'Terrasse · Tiroir espèces' }, { date: '2026-10-21', cashbox: CAISSE_ANNEES_PASSEES }, { date: '2026-10-21', cashbox: 'MND PAY' }, { date: '2026-10-21', cashbox: 'Carte' }],
  depenses: [], clotures: [],
});
dit('la veille ne réclame ni les années passées, ni MND PAY, ni la carte', ['Terrasse · Tiroir espèces'], oublis);

/* ── 6. LES RÈGLES DANS LE CODE ──────────────────────────────────────── */
const actions = sansCommentaires(lis2('src/apps/trone/routes/clients/actions.tsx'));
const caisse = sansCommentaires(lis2('src/apps/trone/routes/vente/Caisse.tsx'));
const factures = sansCommentaires(lis2('src/apps/trone/routes/vente/Factures.tsx'));
const personnel = sansCommentaires(lis2('src/apps/trone/routes/equipe/Personnel.tsx'));
dit('le rituel déduit la caisse par la règle, jamais par la première de la liste', [true, false],
  [/caisseProposee\(\{/.test(actions), /eligibleBoxes\[0\]/.test(actions)]);
dit('le choix de la caisse ne s ouvre qu à qui peut la changer', true, /const montreLeChoix = c\.peutChanger && /.test(actions));
dit('un versement par part, chacun avec sa caisse', true, /parts\.forEach\(\(pt, i\) => \{[\s\S]{0,800}cashbox: c\.caisse \|\| undefined/.test(actions));
const iConfirm = actions.indexOf('const confirm = (garderOuvert = false) =>');
const iCree = actions.indexOf('poseLaCaisse(prev, neuve)', iConfirm);
const iEcrit = actions.indexOf('invoicesStore.set(', iConfirm);
dit('la caisse qui manque naît AVANT que l argent s écrive', true, iConfirm > 0 && iCree > iConfirm && iCree < iEcrit);
/* 19 octobre 2026 (chantier `capture`) : hors année antérieure, une capture
   lue date l'argent du jour du transfert ; la règle de l'année passe d'abord. */
dit('une année antérieure date l argent du rituel par défaut', true, /useState\(\(\) => \(estAnneeAnterieure\(appt\.date, todayISO\(\)\) && appt\.date \? appt\.date : (initial\?\.jourDuPaiement \|\| )?todayISO\(\)\)\)/.test(actions));
dit('le bandeau dit qui encaisse, et l année antérieure seulement quand elle l est', [true, true],
  [/Encaissé par \$\{quiNom\}/.test(actions), /\{anneePassee \? ` · rendez-vous de \$\{anneeDe\(appt\.date\)\}/.test(actions)]);
dit('les tuiles : MTN MoMoPay, MoMo Privé, Chèque, et pas de Moov', [true, true, true, false],
  [/nom: 'MTN MoMoPay'/.test(actions), /nom: 'MoMo Privé'/.test(actions), /nom: 'Chèque'/.test(actions), /nom: 'Moov/.test(actions)]);
dit('« Autres » offre la reprise d une année passée (la liste passe par la règle)', true, /avecLesMoyensDeLaMaison\(methods\)\.filter/.test(actions));
dit('la Caisse suit la même règle, offre les deux moyens neufs, fait naître la caisse, et cache la liste à qui ne peut pas changer', [true, true, true, true],
  [/caisseProposee\(\{/.test(caisse), /avecLesMoyensDeLaMaison\(/.test(caisse), /poseLaCaisse\(prev, caisseANaitre\)/.test(caisse), /hasCashbox && !peutChangerPos \?/.test(caisse)]);
dit('« Marquer payée » aussi : la caisse se déduit du paiement et naît au versement', [true, true, true, true],
  [/caisseProposee\(\{\s*methode: payChoice/.test(factures), /caisse: caisseDuSolde \|\| undefined/.test(factures), /poseLaCaisse\(prev, proposeeSolde\.aCreer!\)/.test(factures), /avecLesMoyensDeLaMaison\(methods, payChoice\)/.test(factures)]);
dit('la fiche du personnel n ouvre plus de caisse de caissier', false, /caisseNeuveDuCaissier|Ouvrir sa caisse/.test(personnel));


/* ── 7. LES AUTRES CAISSES ───────────────────────────────────────────── */
const AVEC_BIIC: Cashbox[] = [...BOITES.filter((x) => x.role !== 'banque'), b('BIIC', { role: 'banque', horsEncaissement: true }), b('La Banque', { role: 'banque' })];
dit('BIIC à part : la carte ne va jamais à BIIC (même au rôle banque)', true, P('Carte', 'g1', '2026-10-17', AVEC_BIIC) !== 'BIIC');
dit('BIIC seule banque, mais à part : la carte va dans « Carte », qui naît (21 octobre 2026)', 'Carte', P('Carte', 'g1', '2026-10-17', [b('BIIC', { role: 'banque', horsEncaissement: true })]));
/* « Épargne, jamais au comptoir » (le tri du 19 octobre 2026) : la direction
   non plus ne la voit ; celle qu'un versement porte déjà reste lisible. */
dit('au choix : BIIC cachée au caissier ET à la direction', [false, false],
  [caissesAuChoix(AVEC_BIIC, { staffId: 'g1', estDirection: false, anneePassee: false }).some((x) => x.name === 'BIIC'),
    caissesAuChoix(AVEC_BIIC, { estDirection: true, anneePassee: false }).some((x) => x.name === 'BIIC')]);
dit('... sauf celle que le versement porte déjà', true, caissesAuChoix(AVEC_BIIC, { estDirection: true, anneePassee: false, garder: 'BIIC' }).some((x) => x.name === 'BIIC'));

/** Les caisses que les décisions font naître seules, déjà là. */
const NEES = (br: string): Cashbox[] => [caisseDesCheques(br), caisseMomopayDeLaMaison(br),
  caisseNeuveDuPaiement('carte', br), caisseNeuveDuPaiement('momoPrive', br), caisseNeuveDuPaiement('autre', br)];
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
{
  /* Les caisses nées seules (chèques, MoMoPay de la Maison, et depuis le
     21 octobre 2026 Carte, MoMo Privé, Autres) sont là : seule la décision
     sur BIIC est en jeu. */
  const recochee = decisionsDesCaisses([b('BIIC', { horsEncaissement: false }), ...NEES('cot')], '2026-10-18');
  dit('BIIC recochée à la main (false) : la décision ne repasse pas', null, recochee);
}
/* La caisse des chèques naît une fois par branche ; rangée à la main, elle ne revient pas.
   Depuis le 21 octobre 2026, « Carte », « MoMo Privé » et « Autres » aussi ; jamais « Espèces »
   (c'est le tiroir renommé : une caisse neuve partagerait l'argent liquide en deux). */
{
  const deux = decisionsDesCaisses([b('BIIC', { horsEncaissement: false }), { ...b('Caisse Porto'), branchId: 'pn' }], '2026-10-18');
  dit('les décisions créent « Chèque » une fois par branche, sans toucher au reste', [['cb-cheques-cot', 'cb-cheques-pn'], false],
    [(deux ?? []).filter((x) => x.name === CAISSE_CHEQUE).map((x) => x.id).sort(), lis(deux, 'BIIC')?.horsEncaissement]);
  dit('... et Carte, MoMo Privé, Autres, à leur nom, jamais Espèces', [['Autres', 'Carte', 'MoMo Privé'], false],
    [(deux ?? []).filter((x) => x.branchId === 'cot' && ['Carte', 'MoMo Privé', 'Autres'].includes(x.name)).map((x) => x.name).sort(), (deux ?? []).some((x) => x.name === 'Espèces')]);
  dit('... une seconde fois, rien', null, decisionsDesCaisses(deux!, '2026-10-19'));
  dit('rangée à la main, elle ne revient pas', null, decisionsDesCaisses([b('BIIC', { horsEncaissement: false }), ...NEES('cot').map((x) => (x.id === 'cb-cheques-cot' ? { ...x, archiveeLe: '2026-10-20' } : x))], '2026-10-21'));
  dit('une caisse qui porte déjà le nom (autre identifiant) ne se double pas', false,
    (decisionsDesCaisses([b('BIIC', { horsEncaissement: false }), ...NEES('cot').filter((x) => x.id !== 'cb-carte-cot'), b('Carte')], '2026-10-21') ?? []).some((x) => x.id === 'cb-carte-cot'));
  dit('dans les décisions d avant (BIIC, Indépendantes), elle naît aussi', true, !!lis(APRES, CAISSE_CHEQUE));
}
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

/* ── 8. LES AUTRES MOYENS REVUS — 21 octobre 2026 ─────────────────────
   « Dans les autres moyens il faut enlever moov et celtis et mettre zelle,
   et interac, revolut, paypal » ; « Une caisse par moyen », dans sa devise. */
{
  const SA_LISTE_DU_21 = ['MTN MoMo', 'Moov', 'Celtis', 'Celtiis', 'Wave', 'Espèces', 'Carte', 'PayPal', 'Virement bancaire', 'Chèque'];
  const offerts = avecLesMoyensDeLaMaison(SA_LISTE_DU_21);
  dit('les autres moyens : ni Moov ni Celtiis ; Zelle, Interac, Revolut, PayPal y sont, chacun une fois',
    [false, false, false, 1, 1, 1, 1],
    [offerts.includes('Moov'), offerts.includes('Celtis'), offerts.includes('Celtiis'),
      ...['Zelle', 'Interac', 'Revolut', 'PayPal'].map((m) => offerts.filter((x) => x === m).length)]);
  dit('... Wave et le virement restent, et la reprise ferme la liste', [true, true, MOYEN_REPRISE],
    [offerts.includes('Wave'), offerts.includes('Virement bancaire'), offerts[offerts.length - 1]]);
  dit('... un versement déjà écrit « Moov » garde son moyen dans la liste (on ne le réécrit pas sans le voir)', true,
    avecLesMoyensDeLaMaison(['Moov', 'Espèces'], 'Moov').includes('Moov'));
  dit('la devise que chaque moyen impose : Zelle USD, Interac CAD, Revolut EUR, PayPal USD ; Wave et les espèces aucune',
    ['USD', 'CAD', 'EUR', 'USD', null, null],
    ['Zelle', 'Interac', 'Revolut', 'PayPal', 'Wave', 'Espèces'].map((m) => deviseDuMoyen(m) ?? null));
  const neuves = ['Zelle', 'Interac', 'Revolut', 'PayPal'].map((m) => caisseProposee({ methode: m, dateDuRdv: '2026-10-21', aujourdhui: '2026-10-21', boxes: BOITES, branchId: 'cot' }));
  dit('chacun sa caisse à son nom, qui naît avec son identifiant et SA devise',
    [['Zelle', 'cb-zelle-cot', 'USD', 'USD'], ['Interac', 'cb-interac-cot', 'CAD', 'CAD'], ['Revolut', 'cb-revolut-cot', 'EUR', 'EUR'], ['PayPal', 'cb-paypal-cot', 'USD', 'USD']],
    neuves.map((x) => [x.caisse ?? null, x.aCreer?.id ?? null, x.aCreer?.currency ?? null, x.devise ?? null]));
  dit('... et un caissier ne la change pas : elle est choisie d office', false, peutChangerLaCaisse(false, neuves[0]));
  /* La caisse Zelle qu'ouvrait déjà MND PAY (`cb-zelle-<branche>`, en
     dollars) se retrouve : rien ne naît en double. */
  const zelleDeMndPay: Cashbox = { id: 'cb-zelle-cot', branchId: 'cot', name: 'Zelle', sub: 'Compte aux États-Unis', glyph: '$', openingXof: 0, currency: 'USD' };
  const trouvee = caisseProposee({ methode: 'Zelle', aujourdhui: '2026-10-21', boxes: [...BOITES, zelleDeMndPay], branchId: 'cot' });
  dit('la caisse Zelle qui existe la reçoit, sans renaître', ['Zelle', null], [trouvee.caisse ?? null, trouvee.aCreer?.id ?? null]);
  /* L'écran qui passe les seules caisses de la devise du jour (les francs)
     ne fait pas naître une seconde « Zelle » : `toutes` la connaît. */
  const parToutes = caisseProposee({ methode: 'Zelle', aujourdhui: '2026-10-21', boxes: BOITES, toutes: [...BOITES, zelleDeMndPay], branchId: 'cot' });
  dit('... même quand l écran ne la passe pas, elle est trouvée parmi toutes', ['Zelle', null], [parToutes.caisse ?? null, parToutes.aCreer?.id ?? null]);
  const enFrancs = caisseProposee({ methode: 'Interac', aujourdhui: '2026-10-21', boxes: [...BOITES, b('Interac')], branchId: 'cot' });
  dit('une caisse « Interac » en francs ne reçoit pas des dollars canadiens, et aucune seconde ne naît', [null, null, 'CAD'],
    [enFrancs.caisse ?? null, enFrancs.aCreer?.id ?? null, enFrancs.devise ?? null]);
  dit('un rendez-vous d une année antérieure : Zelle et Revolut gardent leur caisse en devise (comme un billet étranger)', ['Zelle', 'Revolut'],
    [P('Zelle', 'g1', '2023-07-14'), P('Revolut', 'g1', '2024-02-02')]);
  dit('les comptes en devise ne se comptent pas le soir', [true, true, true, true],
    ['Zelle', 'Interac', 'Revolut', 'PayPal'].map((n) => HORS_CLOTURE.includes(n)));
  const soirDevise = tiroirsQuiSeComptent([...BOITES, zelleDeMndPay, b('PayPal', { currency: 'USD' })], 'cot').map((x) => x.name);
  dit('... ni au comptage du tiroir', [false, false], [soirDevise.includes('Zelle'), soirDevise.includes('PayPal')]);
  /* LES ÉCRANS LISENT LA RÈGLE : le moyen impose sa devise au rituel, à la
     Caisse et dans « Marquer payée », et le versement la garde. */
  dit('le rituel : « Autres » en devise ouvre la devise d office, une seule part', [true, true, true],
    [/const deviseImposee = partEnDevise \? deviseDuMoyen\(/.test(actions), /const fxOn = fxManuel \|\| !!deviseImposee;/.test(actions),
      /const d = deviseDuMoyen\(m\);[\s\S]{0,200}setParts\(\[\{ \.\.\.p, tuile: 'autre', autre: m/.test(actions)]);
  dit('la Caisse : le moyen impose sa devise', [true, true],
    [/const deviseDuPaiement = deviseDuMoyen\(pay\);/.test(caisse), /const fxOnEff = fxOn \|\| !!deviseDuPaiement;/.test(caisse)]);
  dit('« Marquer payée » : la devise du moyen, et le versement garde son fx', [true, true],
    [/const deviseSolde = deviseDuMoyen\(payChoice\);/.test(factures), /\.\.\.\(fxSolde \? \{ fx: fxSolde \} : \{\}\)/.test(factures)]);
  const pieceDollars = { id: 'inv-z', branchId: 'cot', kind: 'facture', number: 'F-Z', clientId: 'c', clientName: 'C', date: '2026-10-21',
    lines: [{ id: 'l', label: 'Rituel', qty: 1, unitXof: 60000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'envoyée' } as unknown as Parameters<typeof soldeDeLaPiece>[0];
  const soldeZelle = soldeDeLaPiece(pieceDollars, { id: 'ip-z', jour: '2026-10-21', moyen: 'Zelle', caisse: 'Zelle', fx: { code: 'USD', rate: 600, amount: 100 } });
  dit('le versement « Marquer payée » en Zelle : 60 000 F, dans « Zelle », et 100 USD gardés', [[60000, 'Zelle', 'USD', 100]],
    (soldeZelle.payments ?? []).map((p) => [p.amountXof, p.cashbox, p.fx?.code, p.fx?.amount]));
}

console.log(ko === 0 ? '\nLes caisses des caissiers tiennent leurs regles.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
