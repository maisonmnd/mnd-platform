/* LE FOYER, LA MAISON EN FAMILLE, ÉPROUVÉ — 10 octobre 2026 (la genèse des prix, lot 3).

   La RÈGLE :
   - la remise famille s'ouvre aux adultes : deux têtes au foyer 10 %, trois
     et plus 15 %, payeur compris, et personne ne perd ce qu'il avait ; Ma
     Couronne garde la règle des mineurs jusqu'au compte du serveur ;
   - la Cagnotte : 100 / 200 / 300 000 F versés, +10 / 12,5 / 15 %, l'ajout
     plafonné pour que remise famille et Cagnotte ne dépassent jamais 25 % ;
     l'ajout arrive avec le dernier versement, une fois, et n'est pas de
     l'argent reçu ;
   - ensemble le même jour : un geste, pas un pourcentage, et une faveur à
     la fois.
   Attendus écrits à la main. `node scripts/verifie-le-foyer-en-famille.mjs` ;
   `--prouve` remet chaque faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import { baremeDuFoyer, nombreDeTetesDuFoyer, remiseFamillePct, type Client, type Family } from '../src/shared/clients';
import { PALIERS, ajoutAPoser, ajoutDeLaMaison, etatDeLaCagnotte, partsPermises, valableJusquau, type Cagnotte } from '../src/shared/cagnotte-pur';
import { gestesEnsemble, remisesDesGestes, saisonDeVenezADeux } from '../src/shared/ensemble-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const JOUR = '2026-10-10';

/* ── 1. La remise famille, pour toutes les têtes ── */
const fam = (id: string, payer?: string, remisePct?: number) => ({ id, branchId: 'b', name: id, payerClientId: payer, remisePct }) as Family;
const cl = (id: string, familyId: string, birthday?: string, archived?: boolean) => ({ id, familyId, birthday, archived }) as unknown as Client;
const ADULTE = '1990-01-01';
const ENFANT = '2016-05-05';
const cas = (f: Family, c: Client[]) => [remiseFamillePct(f, c, JOUR), remiseFamillePct(f, c, JOUR, 'mineurs')];
dit('bareme : 1, 2, 3, 5 tetes', [0, 10, 15, 15], [1, 2, 3, 5].map(baremeDuFoyer));
dit('une mere et sa grande fille : 10 % au Trone, 0 % chez les mineurs', [10, 0],
  cas(fam('f1', 'm'), [cl('m', 'f1', ADULTE), cl('a', 'f1', ADULTE)]));
dit('un parent et un enfant : 10 % des deux regles (personne ne perd)', [10, 10],
  cas(fam('f2', 'm'), [cl('m', 'f2', ADULTE), cl('e', 'f2', ENFANT)]));
dit('un parent et deux enfants : 15 % des deux regles', [15, 15],
  cas(fam('f3', 'm'), [cl('m', 'f3', ADULTE), cl('e1', 'f3', ENFANT), cl('e2', 'f3', ENFANT)]));
dit('le payeur non rattache compte quand meme', [10, 10],
  cas(fam('f4', 'payeur-dehors'), [cl('e', 'f4', ENFANT)]));
dit('trois adultes : 15 %', 15, remiseFamillePct(fam('f5', 'a'), [cl('a', 'f5', ADULTE), cl('b', 'f5', ADULTE), cl('c', 'f5', ADULTE)], JOUR));
dit('une tete archivee ne compte pas', 2, nombreDeTetesDuFoyer(fam('f6', 'a'), [cl('a', 'f6'), cl('b', 'f6'), cl('c', 'f6', undefined, true)]));
dit('un taux pose a la main fait foi (18, puis 0)', [18, 0],
  [remiseFamillePct(fam('f7', 'a', 18), [cl('a', 'f7'), cl('b', 'f7')], JOUR), remiseFamillePct(fam('f8', 'a', 0), [cl('a', 'f8'), cl('b', 'f8')], JOUR)]);

/* ── 2. La Cagnotte du Foyer ── */
const P = (v: number) => PALIERS.find((p) => p.verseXof === v)!;
dit('ajout sans remise : 100, 200, 300 000', [10000, 25000, 45000], [100000, 200000, 300000].map((v) => ajoutDeLaMaison(P(v), 0)));
dit('ajout avec 15 % de remise famille : 300 000 plafonne a 40 000, 200 000 reste a 25 000', [40000, 25000],
  [ajoutDeLaMaison(P(300000), 15), ajoutDeLaMaison(P(200000), 15)]);
const depasse: string[] = [];
for (const p of PALIERS) for (const r of [0, 5, 10, 15, 18, 20, 25]) {
  const a = ajoutDeLaMaison(p, r) / p.verseXof;
  if ((1 - r / 100) / (1 + a) < 0.75 - 1e-9) depasse.push(`${p.verseXof}@${r}`);
}
dit('la regle : remise famille + Cagnotte ne depassent jamais 25 %', [], depasse);
const cag: Cagnotte = { id: 'cg-1', branchId: 'b', familyId: 'f1', verseXof: 200000, ajoutXof: 25000, parts: 2, ouverteLe: JOUR, valableJusquau: '2027-10-10', remiseFamillePct: 0 };
const v1 = [{ id: 'm1', kind: 'depot' as const, amountXof: 100000, cagnotteId: 'cg-1' }];
dit('a moitie versee : reste 100 000, pas d ajout', [100000, false, null], [etatDeLaCagnotte(cag, v1).resteXof, etatDeLaCagnotte(cag, v1).complete, ajoutAPoser(cag, v1)]);
const v2 = [...v1, { id: 'm2', kind: 'depot' as const, amountXof: 100000, cagnotteId: 'cg-1' }, { id: 'x', kind: 'depot' as const, amountXof: 50000 }];
dit('versee : l ajout se pose (25 000, marque comme ajout)', [25000, true, 'cg-1'], [ajoutAPoser(cag, v2)?.amountXof, ajoutAPoser(cag, v2)?.abondement, ajoutAPoser(cag, v2)?.cagnotteId]);
const v3 = [...v2, { id: 'm3', kind: 'depot' as const, amountXof: 25000, cagnotteId: 'cg-1', abondement: true }];
dit('l ajout pose : jamais deux fois, et il ne compte pas comme verse', [null, 200000], [ajoutAPoser(cag, v3), etatDeLaCagnotte(cag, v3).verseXof]);
dit('en combien de fois : 100 000, 200 000, 300 000', [[1, 2], [1, 2, 3], [1, 2, 3]], [100000, 200000, 300000].map(partsPermises));
dit('valable douze lunes', '2027-10-10', valableJusquau(JOUR));

/* ── 3. Ensemble, le même jour ── */
const mardiFevrier = '2027-02-09';
const samediFevrier = '2027-02-13';
dit('saison de Venez a deux : mardi de fevrier, mercredi de juillet, samedi, mars', [true, true, false, false],
  [saisonDeVenezADeux(mardiFevrier), saisonDeVenezADeux('2027-07-14'), saisonDeVenezADeux(samediFevrier), saisonDeVenezADeux('2027-03-09')]);
const parentEnfant = gestesEnsemble([
  { id: 'mere', mineur: false, serviceIds: ['sv-venue-gbeji-ess'] },
  { id: 'fille', mineur: true, serviceIds: ['sv-kids-sinsin', 'sv-kids-kloklo'] },
], '2026-11-03');
dit('parent et enfant : le KLOKLO Kids de l enfant offert, rien au parent', [[{ index: 1, serviceId: 'sv-kids-kloklo', pourquoi: 'parent-et-enfant' }], undefined],
  [parentEnfant.fille, parentEnfant.mere]);
dit('deux enfants sans adulte : rien', {}, gestesEnsemble([{ id: 'a', mineur: true, serviceIds: ['sv-kids-kloklo'] }, { id: 'b', mineur: true, serviceIds: ['sv-kids-kloklo'] }], mardiFevrier));
const deux = (d: string) => gestesEnsemble([
  { id: 'soeur1', mineur: false, serviceIds: ['sv-plt-05-ess-c', 'sv-atl-ii-e'] },
  { id: 'soeur2', mineur: false, serviceIds: ['sv-atl-ii-l', 'sv-plt-05-sig-c'] },
], d);
dit('venez a deux en saison : le lavage de la seconde, a son rang', { soeur2: [{ index: 1, serviceId: 'sv-plt-05-sig-c', pourquoi: 'venez-a-deux' }] }, deux(mardiFevrier));
dit('venez a deux un samedi : rien', {}, deux(samediFevrier));
dit('les remises par ligne, paralleles aux prestations', [null, { pct: 100 }], remisesDesGestes(['sv-atl-ii-l', 'sv-plt-05-sig-c'], deux(mardiFevrier).soeur2));

/* ── 4. Les écrans (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
dit('Ma Couronne garde la regle des mineurs (reservation et profil)', [true, true], [
  /remiseFamillePct\(familleDeLaTete, tousClients, todayIso\(\), 'mineurs'\)/.test(sansCom('src/apps/couronne/Booking.tsx')),
  /remiseFamillePct\(familleProfil, tousClientsProfil, todayIso\(\), 'mineurs'\)/.test(sansCom('src/apps/couronne/Tabs.tsx')),
]);
const comptes = sansCom('src/apps/trone/routes/finances/Comptes.tsx');
dit('les comptes : un seul bareme, la Cagnotte versee la marque et pose l ajout', [false, true, true, true], [
  /mineurs >= 2 \? 15/.test(comptes),
  /baremeDuFoyer\(nombreDeTetesDuFoyer\(f, branchClients\)\)/.test(comptes),
  /cagnotteId: cagnotte\.id/.test(comptes),
  /if \(cagnotte && kind === 'depot'\) poseLAjoutSiVerse\(cagnotte\.id, corps\.date\);/.test(comptes),
]);
dit('l ajout n est pas une recette, et le releve le nomme', [true, true], [
  /if \(m\.branchId !== s\.branchId \|\| m\.kind !== 'depot'\) continue;\s*if \(m\.abondement\) continue;/.test(sansCom('src/shared/receipts.ts')),
  /m\.abondement \? 'Cagnotte du Foyer/.test(sansCom('src/shared/compte.ts')),
]);
const rdvFoyer = sansCom('src/apps/trone/routes/clients/RdvFoyer.tsx');
dit('RdvFoyer : la remise en francs hors forfaits, le geste par ligne, une faveur a la fois', [false, true, true, true], [
  /discountPct: famPct/.test(rdvFoyer),
  /Math\.max\(0, l\.prixXof - l\.forfaitXof\)/.test(rdvFoyer),
  /if \(c\?\.gestes\) return \{ remisesLignes: remisesDesGestes\(l\.ids, c\.gestes\) \};/.test(rdvFoyer),
  /const famXof = !g && famPct > 0/.test(rdvFoyer),
]);
dit('les juges sont purs : aucun import', [false, false], [
  /^\s*import\s/m.test(sansCom('src/shared/cagnotte-pur.ts')), /^\s*import\s/m.test(sansCom('src/shared/ensemble-pur.ts')),
]);

console.log(ko === 0 ? '\nLe foyer en famille tient.' : `\n${ko} epreuve(s) en echec.`);
