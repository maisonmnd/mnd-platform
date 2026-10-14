/* LE CHIFFRE DES PRESTATIONS, ÉPROUVÉ — 14 octobre 2026.
   `node scripts/verifie-le-chiffre-des-prestations.mjs`

   Ce que la maquette EvcUQJUB… a promis : le même chiffre qu'au Catalogue et
   à la Synthèse ; la somme des parts égale le montant de chaque rituel ; une
   séance de série ou de formule ne compte jamais deux fois l'argent ; un
   annulé ne compte pas, un à venir se compte à part ; la formule compte à sa
   vente, sur sa ligne ; « dont encaissé » ne dépasse jamais le chiffre. Les
   attentes viennent de ces promesses, jamais du calcul du code. */
import { readFileSync } from 'node:fs';
import { splitByWeights } from '../src/shared/pricing';
import {
  evolution, laPeriode, leChiffre, lignesCsv, partage, prixReel, rituelsDistincts,
  type Entrees, type RdvLu,
} from '../src/shared/chiffre-des-prestations-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lis(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── Une petite Maison ── */
const services = new Map([
  ['res', { name: 'Resserrage', priceXof: 25000, categoryId: 'c-entretien' }],
  ['lav', { name: 'Lavage', priceXof: 8000, categoryId: 'c-entretien' }],
  ['hyd', { name: 'Hydratation', priceXof: 15000, categoryId: 'c-soin' }],
  ['tre', { name: 'Tresses', priceXof: 25000, categoryId: 'c-studio' }],
]);
const familles: Record<string, { id: string; nom: string }> = { 'c-entretien': { id: 'f1', nom: 'Entretien' }, 'c-soin': { id: 'f2', nom: 'Soins' }, 'c-studio': { id: 'f3', nom: 'Coiffure' } };
const maisons: Record<string, { id: string; nom: string }> = { 'c-entretien': { id: 'atelier', nom: 'Atelier' }, 'c-soin': { id: 'atelier', nom: 'Atelier' }, 'c-studio': { id: 'studio', nom: 'Studio' } };
const rdv = (id: string, date: string, serviceIds: string[], o: Partial<RdvLu> = {}): RdvLu => ({ id, date, status: 'honoré', serviceIds, clientName: id.toUpperCase(), ...o });
const nets: Record<string, number> = { r1: 25000, r2: 30000, r3: 33000, r4: 22500, r5: 0, r6: 0, r7: 25000, r8: 25000, r9: 25000, r10: 15000 };
const payes: Record<string, number> = { r1: 1, r2: 0.5, r3: 1.4, r4: 1, r7: 1, r8: 0, r9: 1, r10: 1 };
const rdvs: RdvLu[] = [
  rdv('r1', '2026-10-02', ['res']),
  rdv('r2', '2026-10-05', ['res', 'lav']),                            // combiné : 30 000 au prorata 25/8
  rdv('r3', '2026-10-06', ['res', 'tre']),                            // deux maisons
  rdv('r4', '2026-10-07', ['res', 'res']),                            // le même geste deux fois : un rituel
  rdv('r5', '2026-10-08', ['res'], { coveredBySub: true }),           // séance de formule
  rdv('r6', '2026-10-09', ['res'], { seriesIndex: 2 }),               // séance 2 d'une série
  rdv('r7', '2026-10-10', ['res'], { status: 'annulé' }),             // annulé
  rdv('r8', '2026-10-20', ['res'], { status: 'confirmé' }),           // à venir
  rdv('r9', '2026-09-15', ['res']),                                   // mois d'avant
  rdv('r10', '2026-10-03', ['hyd'], { status: 'confirmé' }),          // passé, jamais honoré : nulle part
  rdv('r11', '2026-10-25', ['hyd'], { status: 'annulé' }),            // annulé à venir : nulle part non plus
];
const e: Entrees = {
  rdvs, netDe: (a) => nets[a.id] ?? 0, partPayeeDe: (a) => payes[a.id] ?? 0, services,
  familleDe: (c) => (c ? familles[c] : undefined), maisonDe: (c) => (c ? maisons[c] : undefined),
  formules: [{ id: 'inv-f1', date: '2026-10-04', nom: 'Trois lunes', montantXof: 70000, encaisseXof: 35000, qui: 'F' }, { id: 'inv-f0', date: '2026-08-04', nom: 'Trois lunes', montantXof: 70000, encaisseXof: 70000, qui: 'G' }],
  nomDe: (a) => a.clientName ?? 'Cliente',
};
const jour = '2026-10-14';
const oct = { de: '2026-10-01', a: '2026-10-14' };
const r = leChiffre(e, oct, 'prestation', jour);
const par = (cle: string) => r.lignes.find((l) => l.cle === cle);

/* ── 1. LA SOMME DES PARTS ── */
dit('le partage est celui du Trône (splitByWeights)', true,
  [[30000, [25000, 8000]], [33000, [25000, 25000]], [100, [1, 1, 1]], [7, [0, 0]], [50000, [3, 0, 5]]].every(([t, w]) => JSON.stringify(partage(t as number, w as number[])) === JSON.stringify(splitByWeights(t as number, w as number[]))));
const netsHonoresDOctobre = ['r1', 'r2', 'r3', 'r4'].reduce((s, id) => s + nets[id], 0) + 0 /* r5, r6 sans argent */;
dit('le chiffre des rituels = la somme de leurs montants, plus la formule vendue', netsHonoresDOctobre + 70000, r.chiffreXof);
dit('un rituel combiné se partage au prorata : 30 000 sur 25 000 et 8 000', [22727, 7273], [par('lav') ? r.lignes.find((l) => l.cle === 'res')!.detail.find((d) => d.cle === 'r2')!.montantXof : -1, par('lav')!.chiffreXof]);
dit('le même geste deux fois dans un rituel : un rituel, tout son montant', [true, 22500], [par('res')!.detail.filter((d) => d.cle === 'r4').length === 1, par('res')!.detail.find((d) => d.cle === 'r4')!.montantXof]);
dit('le total des rituels compte chacun une fois : r1 à r6, le combiné r2 et r3 aussi, pas la formule vendue', 6, r.rituels);
dit('le compte de l écran suit les lignes montrées (Lavage et Tresses : deux rituels)', 2, rituelsDistincts(r.lignes.filter((l) => l.cle === 'lav' || l.cle === 'tre' || l.formule)));

/* ── 2. CE QUI NE COMPTE PAS, CE QUI COMPTE À PART ── */
dit('séance de formule et séance de série : comptées, sans argent', [6, 2], [par('res')!.rituels, par('res')!.sansArgent]);
dit('… et leur argent ne compte pas', [0, 0], [par('res')!.detail.find((d) => d.cle === 'r5')!.montantXof, par('res')!.detail.find((d) => d.cle === 'r6')!.montantXof]);
dit('un annulé ne compte nulle part', false, r.lignes.some((l) => l.detail.some((d) => d.cle === 'r7')));
dit('un à venir se compte à part, sans argent', [1, false], [par('res')!.aVenir, par('res')!.detail.some((d) => d.cle === 'r8')]);
dit('un rendez-vous passé jamais honoré, ou annulé à venir : ni chiffre, ni à venir', undefined, par('hyd'));
dit('la période est tenue : septembre hors d octobre', false, par('res')!.detail.some((d) => d.cle === 'r9'));

/* ── 3. LA FORMULE, À SA VENTE ── */
dit('la formule a sa ligne, à sa vente, dans sa période', [70000, 1, 35000], [par('formule:Trois lunes')?.chiffreXof, par('formule:Trois lunes')?.rituels, par('formule:Trois lunes')?.encaisseXof]);
const rf = leChiffre(e, oct, 'famille', jour);
dit('par famille, les formules se rangent ensemble', ['Les formules', 70000], [rf.lignes.find((l) => l.cle === 'formules')?.nom, rf.lignes.find((l) => l.cle === 'formules')?.chiffreXof]);
dit('par famille, un rituel compte une fois même s il porte deux gestes de la famille', 6, rf.lignes.find((l) => l.cle === 'f1')!.rituels);
const rm = leChiffre(e, oct, 'maison', jour);
dit('par maison, un rituel à cheval nourrit les deux, pour sa part', [16500, true], [rm.lignes.find((l) => l.cle === 'studio')!.chiffreXof, rm.lignes.find((l) => l.cle === 'atelier')!.detail.some((d) => d.cle === 'r3' && d.combine)]);
dit('les totaux ne changent pas selon le regroupement', [r.chiffreXof, r.chiffreXof], [rf.chiffreXof, rm.chiffreXof]);

/* ── 4. DONT ENCAISSÉ ── */
dit('l encaissé suit la part payée ; jamais au-delà du montant', [true, true], [
  par('res')!.detail.find((d) => d.cle === 'r2')!.encaisseXof === Math.round(22727 * 0.5),
  r.lignes.every((l) => l.encaisseXof <= l.chiffreXof),
]);

/* ── 5. LES PÉRIODES ── */
const pm = laPeriode('mois', jour);
dit('ce mois, comparé aux mêmes jours du mois d avant', [{ de: '2026-10-01', a: '2026-10-14' }, { de: '2026-09-01', a: '2026-09-14' }], [pm.p, pm.avant]);
dit('le mois dernier, comparé au mois d avant lui', [{ de: '2026-09-01', a: '2026-09-30' }, { de: '2026-08-01', a: '2026-08-30' }], [laPeriode('moisPrec', jour).p, laPeriode('moisPrec', jour).avant]);
dit('cette année, comparée à la même part de l an dernier', { de: '2025-01-01', a: '2025-10-14' }, laPeriode('annee', jour).avant);
dit('des dates choisies : la période d avant a la même longueur', { de: '2026-09-21', a: '2026-09-30' }, laPeriode('libre', jour, { de: '2026-10-01', a: '2026-10-10' }).avant);
dit('douze mois : douze mois, le dernier compris', ['2025-11', '2026-10', 12], [laPeriode('douze', jour).mois[0], laPeriode('douze', jour).mois.at(-1), laPeriode('douze', jour).mois.length]);
dit('une date se dit avec son année', 'octobre 2026, jusqu’au 14', pm.dit);

/* ── 6. LE PRIX RÉEL, L'ÉVOLUTION, L'EXPORT ── */
dit('le prix réel moyen ne compte que les rituels payants : (25 000 + 22 727 + 16 500 + 22 500) / 4', Math.round((25000 + 22727 + 16500 + 22500) / 4), prixReel(par('res')!).moyenXof);
dit('l évolution : rien avant, rien à dire', [null, null, 50, -50], [evolution(100, undefined), evolution(100, 0), evolution(150, 100), evolution(50, 100)]);
const csv = lignesCsv(r.lignes, new Map([['res', 25000]]));
dit('l export porte une ligne par prestation, et l évolution', [r.lignes.length + 1, 'Prestation', true], [csv.length, csv[0][0], csv.some((l) => l[0] === 'Resserrage' && typeof l[6] === 'number')]);

/* ── 7. LE MÊME CHIFFRE QU'AU CATALOGUE ── */
/* Le Catalogue (vente/Catalogue.tsx) partage le net au prorata des prix et
   cumule par prestation. Sa formule, recopiée et confrontée : au franc près
   par rituel (lui ne fixe pas l'arrondi, le Trône le fait). */
const catalogue = sansCommentaires('src/apps/trone/routes/vente/Catalogue.tsx');
dit('le Catalogue partage toujours le net au prorata des prix de carte', true,
  catalogue.includes('const part = totalP > 0 ? (net * prices[i]) / totalP : net / a.serviceIds.length;') && catalogue.includes('const net = apptNetXof(a, svcById);'));
const toutTemps = leChiffre({ ...e, formules: [] }, { de: '2000-01-01', a: '2099-12-31' }, 'prestation', jour);
const commeLeCatalogue = new Map<string, number>();
for (const a of rdvs) {
  if (a.status !== 'honoré') continue;
  const net = a.coveredBySub || (a.seriesIndex ?? 1) > 1 ? 0 : nets[a.id];
  const prices = a.serviceIds.map((id) => services.get(id)!.priceXof);
  const totalP = prices.reduce((s, x) => s + x, 0);
  a.serviceIds.forEach((id, i) => commeLeCatalogue.set(id, (commeLeCatalogue.get(id) ?? 0) + (totalP > 0 ? (net * prices[i]) / totalP : net / a.serviceIds.length)));
}
dit('chaque prestation : le même chiffre qu au Catalogue, au franc près par rituel', true,
  toutTemps.lignes.every((l) => Math.abs(l.chiffreXof - (commeLeCatalogue.get(l.cle) ?? 0)) <= l.rituels));

/* ── 8. L'ÉCRAN ── */
const ecran = sansCommentaires('src/apps/trone/routes/finances/ChiffreDesPrestations.tsx');
dit('l écran lit le net par apptNetXof, l encaissé par la facture, la formule par sa facture', [true, true, true], [
  ecran.includes('netDe: (a: RdvLu) => apptNetXof('),
  ecran.includes('if (inv) { const t = invoiceTotal(inv); const r = invoiceRegleXof(inv);'),
  ecran.includes(".startsWith('Abonnement · ')"),
]);
dit('la tuile des rituels compte chaque rituel une fois', true, ecran.includes('const rituels = rituelsDistincts(lignes);'));
dit('la liste des rituels porte l année sur chaque date (douze mois s y côtoient)', true, sansCommentaires('src/apps/trone/routes/clients/_shared.tsx').includes('{frShortAn(r.date)}'));
dit('l export passe par downloadCsv (formules neutralisées)', true, ecran.includes('downloadCsv(`chiffre-des-prestations-'));
const index = sansCommentaires('src/apps/trone/routes/index.tsx');
dit('l écran vit aux Finances et se nomme parmi les écrans neufs', [true, true], [
  /group: 'Finances'[\s\S]{0,1500}path: '\/chiffre-des-prestations'/.test(index),
  /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/chiffre-des-prestations'/.test(index),
]);
dit('aucun tiret cadratin dans ce que l écran dit', false, ecran.includes('—'));

console.log(ko === 0 ? '\nLe chiffre des prestations tient ses regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
