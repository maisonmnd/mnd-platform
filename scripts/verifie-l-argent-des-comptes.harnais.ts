/* L'ARGENT DES COMPTES, ÉPROUVÉ — `node scripts/verifie-l-argent-des-comptes.mjs`.

   12 novembre 2026, maquette « Le choix du moyen » (DnRyTv95…), choix ⑥ : la
   paie du 5 d'abord, le surplus à la banque le lundi. La règle
   (src/shared/argent-des-comptes-pur.ts), puis la carte de Finances › Les
   caisses. Montants inventés. Sortie ASCII : la console de Windows. */
import {
  argentDesComptes, dejaVire, idDuVirement, lundiDuVirement, moisDeLaPaie, paieAGarder, virementsDuLundi,
} from '../src/shared/argent-des-comptes-pur';
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
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── Les jours ────────────────────────────────────────────────────────── */
dit('le lundi du virement : un jeudi va au lundi suivant ; un lundi reste le jour meme ; un dimanche, le lendemain', ['2026-11-16', '2026-11-16', '2026-11-16', '2026-11-23'],
  [lundiDuVirement('2026-11-12'), lundiDuVirement('2026-11-16'), lundiDuVirement('2026-11-15'), lundiDuVirement('2026-11-17')]);
dit('les mois dont la paie peut etre due : le mois d avant et celui-ci (janvier compris)', [['2026-10', '2026-11'], ['2025-12', '2026-01']],
  [moisDeLaPaie('2026-11-12'), moisDeLaPaie('2026-01-03')]);

/* ── La paie à garder ─────────────────────────────────────────────────── */
const p = paieAGarder([
  { netXof: 100_000, voie: 'MTN', paye: false }, { netXof: 80_000, voie: 'MTN', paye: false },
  { netXof: 45_000, voie: 'Moov', paye: false }, { netXof: 60_000, voie: 'MTN', paye: true },
  { netXof: 20_000, paye: false }, { netXof: 0, voie: 'MTN', paye: false }, { netXof: -5, voie: 'MTN', paye: false },
]);
dit('la paie pas encore versee, par voie ; un bulletin paye, nul ou negatif ne compte pas', { mtnXof: 180_000, moovXof: 45_000, sansVoieXof: 20_000, bulletins: 4 }, p);

/* ── Les comptes ──────────────────────────────────────────────────────── */
const caisses = {
  mtnCollection: { nom: 'MTN Collection', soldeXof: 407_550 },
  fedapay: { nom: 'FedaPay', soldeXof: 96_100 },
  kkiapay: { nom: 'KkiaPay', soldeXof: 58_000 },
  momopay: { nom: 'MTN MoMoPay', soldeXof: 30_000 },
};
const a = argentDesComptes({ aujourdhui: '2026-11-12', caisses, paie: p, soldePaieMtnXof: 1_800 });
const ligne = (c: string) => a.lignes.find((l) => l.compte === c)!;
dit('MTN Collection garde ce qui manque au compte de paie (paie MTN et sans numero, moins son solde), le reste part',
  [198_200, 209_350], [ligne('mtnCollection').garderXof, ligne('mtnCollection').versBanqueXof]);
dit('... et la carte le dit : a demander a MTN, rien ne manque', [198_200, 0, true],
  [a.versLaPaieMtnXof, a.manquePaieMtnXof, /^D’abord 198 200 F vers le compte de paie MTN \(à demander à MTN\)\.$/.test(ligne('mtnCollection').dit)]);
dit('FedaPay ne verse pas encore : la paie Moov ne se garde pas, tout part, et la carte le dit', [0, 96_100, true],
  [ligne('fedapay').garderXof, ligne('fedapay').versBanqueXof, /se verse encore à la main : FedaPay ne verse pas encore/.test(ligne('fedapay').dit)]);
dit('... le jour ou FedaPay versera, la paie Moov se gardera', 45_000,
  argentDesComptes({ aujourdhui: '2026-11-12', caisses, paie: p, soldePaieMtnXof: 1_800, moovParFedaPay: true }).lignes.find((l) => l.compte === 'fedapay')!.garderXof);
dit('KkiaPay : tout part', [0, 58_000], [ligne('kkiapay').garderXof, ligne('kkiapay').versBanqueXof]);
dit('MoMoPay : a pointer d abord, hors du virement', [true, 0], [!!ligne('momopay').aPointer, ligne('momopay').versBanqueXof]);
dit('vers la banque lundi : collecte + FedaPay + KkiaPay, sans MoMoPay', [363_450, '2026-11-16', true], [a.versLaBanqueXof, a.lundi, a.peutVirer]);
const court = argentDesComptes({ aujourdhui: '2026-11-12', caisses: { ...caisses, mtnCollection: { nom: 'MTN Collection', soldeXof: 50_000 } }, paie: p, soldePaieMtnXof: 0 });
dit('la collecte ne suffit pas : tout est garde, le manque se dit (a apporter par la banque)', [50_000, 0, 150_000, true],
  [court.lignes[0].garderXof, court.lignes[0].versBanqueXof, court.manquePaieMtnXof, /il manquera encore 150 000 F, à apporter par la banque/.test(court.lignes[0].dit)]);
const nonLu = argentDesComptes({ aujourdhui: '2026-11-12', caisses, paie: p, soldePaieMtnXof: null });
dit('le solde du compte de paie pas lu : on garde toute la paie MTN', 200_000, nonLu.lignes[0].garderXof);
const couvert = argentDesComptes({ aujourdhui: '2026-11-12', caisses, paie: p, soldePaieMtnXof: 500_000 });
dit('le compte de paie couvre deja la paie : rien a garder', [0, true], [couvert.lignes[0].garderXof, /couvre déjà la paie/.test(couvert.lignes[0].dit)]);
const sansPaie = argentDesComptes({ aujourdhui: '2026-11-12', caisses, paie: null, soldePaieMtnXof: 1_800 });
dit('la paie ne se lit pas d ici (gerant) : pas de virement, et on dit pourquoi', [false, 'Seul le souverain lit la paie : le virement du lundi se fait de son poste.'],
  [sansPaie.peutVirer, sansPaie.pourquoiPas]);
dit('une caisse absente ne vire rien, un solde negatif compte pour zero', [0, 0], [
  argentDesComptes({ aujourdhui: '2026-11-12', caisses: { kkiapay: { nom: 'KkiaPay', soldeXof: -3_000 } }, paie: p, soldePaieMtnXof: 0 }).versLaBanqueXof,
  argentDesComptes({ aujourdhui: '2026-11-12', caisses: {}, paie: p, soldePaieMtnXof: 0 }).versLaBanqueXof]);

/* ── Les virements ────────────────────────────────────────────────────── */
const v = virementsDuLundi(a, { jour: '2026-11-16', branchId: 'br1', banque: 'La Banque' });
dit('un virement par compte qui envoie, vers la banque, jamais MoMoPay', [
  ['trf-lundi-br1-2026-11-16-mtnCollection', 'MTN Collection', 'La Banque', 209_350],
  ['trf-lundi-br1-2026-11-16-fedapay', 'FedaPay', 'La Banque', 96_100],
  ['trf-lundi-br1-2026-11-16-kkiapay', 'KkiaPay', 'La Banque', 58_000],
], v.map((x) => [x.id, x.de, x.vers, x.amountXof]));
dit('la note dit ce qui a ete garde pour la paie', true, /\(198 200 F gardés pour la paie\)$/.test(v[0].note));
dit('deja vire ce jour : reconnu par son identifiant, une fois par jour et par branche', [true, false, false],
  [dejaVire(v, '2026-11-16', 'br1'), dejaVire(v, '2026-11-23', 'br1'), dejaVire(v, '2026-11-16', 'br2')]);
dit('l identifiant est fixe (jamais deux fois le meme virement)', idDuVirement('2026-11-16', 'kkiapay', 'br1'), v[2].id);

/* ── La carte ─────────────────────────────────────────────────────────── */
const carte = sansCommentaires('src/apps/trone/routes/finances/ArgentDesComptes.tsx');
dit('la direction seule ; la paie lue par le souverain seul (RLS des bulletins)', [true, true, true],
  [carte.includes("const direction = moi?.role === 'souverain' || moi?.role === 'gerant';"), carte.includes('if (!direction) return null;'), carte.includes('if (!souverain) return null;')]);
dit('la paie : le mois d avant et celui-ci, la voie de la fiche, le paye selon la ligne', [true, true, true],
  [carte.includes('const mois = moisDeLaPaie(aujourdhui);'), carte.includes('voie: parFiche.get(l.employeeId)?.mobileMoney?.operateur,'), carte.includes('paye: ligneEstPayee(l),')]);
dit('le solde du compte de paie lu chez MTN, a l ouverture', true, carte.includes('void lisChezMtn([]).then((r) => { if (vivant && typeof r.soldeXof === \'number\') setSoldePaie(r.soldeXof); });'));
dit('le compte de banque n est jamais une caisse d un paiement ni d un prestataire', [true, true],
  [carte.includes('...Object.values(lesCaisses).map((c) => c?.id),'), carte.includes('CAISSE_MTN_COLLECTION, KKIAPAY_CASHBOX].includes(c.name)')]);
dit('le geste : deux temps, un virement par compte, jamais deux fois', [true, true, true],
  [carte.includes('onClick={() => setConfirme(true)}>C’est viré</button>'), carte.includes('const v = virementsDuLundi(a, { jour: aujourdhui, branchId: branch.id, banque });'),
    carte.includes('transfertsStore.set((prev) => [...prev, ...v.filter((x) => !prev.some((t) => t.id === x.id))]);')]);
dit('la carte est posee dans Les caisses', true, sansCommentaires('src/apps/trone/routes/finances/Caisses.tsx').includes('<ArgentDesComptes />'));

/* ── Le correctif d'Encaisser ─────────────────────────────────────────── */
const enc = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('Payer par MTN : la barre dit MTN Collection, la caisse que le serveur remplit', true,
  enc.includes("if (pt.tuile === 'mtn') { return { methode: 'MTN Collection', caisse: CAISSE_MTN_COLLECTION,"));

console.log(`\n${n - ko}/${n} epreuves : l argent des comptes.`);
if (ko) console.log(`${ko} ECHEC(S).`);
