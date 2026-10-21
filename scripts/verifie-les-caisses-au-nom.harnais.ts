/* LES CAISSES AU NOM DES PAIEMENTS, ÉPROUVÉES — `node scripts/verifie-les-caisses-au-nom.mjs`.

   21 octobre 2026. Ses mots : « Chaque paiement doit être attribué à une
   caisse. Quand je choisis un paiement que sa caisse soit automatiquement
   sélectionnée. Il faut également rajouter Momo Privé. Les caisses doivent
   porter les mêmes noms que les paiements. » Ses réponses au sélecteur : une
   seule « Espèces » ; « Carte » ; une seule « MoMo Privé » ; une seule
   « Autres » ; « Les renommer », solde et historique suivant le nom ; elle ne
   sait pas si le tri du 19 octobre a été appliqué.

   Les attentes viennent de ces mots, jamais du code : le tiroir devient
   « Espèces », « MoMoPay Maison MND » devient « MTN MoMoPay », « Chèques à
   déposer » devient « Chèque », chaque écriture suit, les caisses des
   caissiers se vident dans « Espèces » puis se rangent ; le tri passe d'abord
   s'il attend ; tout se défait à l'identique. Puis les vrais magasins, dans
   les deux cas (tri fait, tri pas fait). Données d'exemple : les
   identifiants sont ceux de ses caisses, les noms sont inventés. */
import { readFileSync } from 'node:fs';
import { cashboxesStore, invoicesStore, expensesStore, transfertsStore, type Cashbox } from '../src/shared/finance';
import { appointmentsStore } from '../src/shared/agenda';
import {
  anciensNomsDuGeste, caissesApresDefaireLeNom, caissesApresLeNom, caissesApresLesCaissiers, idDuVirementAuNom, leNomEstFait,
  nomsDejaPrisAuNom, renommagesAuNom, rienAFaireAuNom, virementsDesCaissiers,
} from '../src/shared/caisses-au-nom-pur';
import { caisseDesCheques, caisseMomopayDeLaMaison, caisseNeuveDuPaiement, caisseProposee } from '../src/shared/caisses-des-caissiers-pur';
import { leTriEstFait } from '../src/shared/tri-des-caisses-pur';
import { appliqueLeNom, defaisLeNom, resteDuNom } from '../src/apps/trone/routes/finances/au-nom';
import { appliqueLeTri } from '../src/apps/trone/routes/finances/tri';
import { defaisLaFusion } from '../src/apps/trone/routes/finances/fusion';

let ko = 0;
const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon)
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(canon(attendu)); const o = JSON.stringify(canon(obtenu));
  const ok = a === o;
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${o.slice(0, 220)}`);
  if (!ok) console.log(`       attendu ${a.slice(0, 220)}`);
};
const as = <T>(x: unknown) => x as T;
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const B = 'br-maison';
const cb = (id: string, name: string, x: Partial<Cashbox> = {}): Cashbox => ({ id, branchId: B, name, sub: 'Caisse', glyph: '◈', openingXof: 0, ...x });

/* Ses caisses, sous leurs vrais identifiants, AVANT le tri du 19 octobre. */
const AVANT_LE_TRI: Cashbox[] = [
  cb('ytb0sweqjt', 'Real Money', { sub: 'Caisse journalier' }),
  cb('uhhu3j8pbz', 'Caisse Principale', { sub: 'Caisse manuelle' }),
  cb('3gecxx1oyf', 'MND NEW'),
  cb('dz2b3w0bye', 'Caisse Indépendantes', { horsBilan: true, equipe: true, horsEncaissement: true }),
  cb('b8rgpuq4zm', 'BIIC', { horsBilan: true, horsEncaissement: true }),
  cb('cb-mnd-pay', 'MND PAY'),
  { ...caisseMomopayDeLaMaison(B), name: 'MoMoPay Maison MND' },
  { ...caisseDesCheques(B), name: 'Chèques à déposer' },
  cb('cb-caissier-g1', 'Caisse de Gérard', { role: 'terrasse', equipe: true, caissierId: 'g1' }),
  { ...cb('cb-annees-passees-br-maison', 'Années passées'), role: 'archive', histoire: true },
  /* Une autre branche, qui a aussi ses noms d'avant : elle ne bouge pas. */
  { ...cb('autre-ch', 'Chèques à déposer'), branchId: 'autre' },
];

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('avant le tri : le tiroir (Real Money), le MoMoPay, les chèques se renomment au nom du paiement',
  [['ytb0sweqjt', 'Real Money', 'Espèces'], ['cb-momopay-br-maison', 'MoMoPay Maison MND', 'MTN MoMoPay'], ['cb-cheques-br-maison', 'Chèques à déposer', 'Chèque']],
  renommagesAuNom(AVANT_LE_TRI, B).map((r) => [r.id, r.de, r.vers]));
dit('MND PAY garde son nom ; une caisse déjà à son nom ne se renomme pas', [],
  renommagesAuNom([cb('cb-mnd-pay', 'MND PAY'), caisseMomopayDeLaMaison(B), caisseDesCheques(B), cb('ytb0sweqjt', 'Espèces')], B));
dit('rien à faire quand tout porte déjà son nom et qu aucun caissier n a de caisse', [true, false],
  [rienAFaireAuNom([caisseMomopayDeLaMaison(B), caisseDesCheques(B), cb('ytb0sweqjt', 'Espèces')], B), rienAFaireAuNom(AVANT_LE_TRI, B)]);
dit('un nom pris par une autre caisse (même rangée) ou une écriture refuse le geste', [['Espèces'], ['Chèque']],
  [nomsDejaPrisAuNom([...AVANT_LE_TRI, cb('x', 'Espèces', { archiveeLe: '2026-01-01' })], {}, B),
    nomsDejaPrisAuNom(AVANT_LE_TRI, { depenses: [{ cashbox: 'Chèque', date: '2026-05-01' }] }, B)]);
{
  const v = virementsDesCaissiers(AVANT_LE_TRI, B, (n) => (n === 'Caisse de Gérard' ? 12000 : 0), '2026-10-21');
  dit('une seule Espèces : la caisse de Gérard passe son solde au tiroir, sous l identifiant de sa caisse', [[idDuVirementAuNom('cb-caissier-g1'), 'Caisse de Gérard', 'Real Money', 12000]],
    v.map((t) => [t.id, t.de, t.vers, t.amountXof]));
  dit('à découvert, le tiroir la comble ; à zéro, rien', [[['Real Money', 'Caisse de Gérard', 3000]], []],
    [virementsDesCaissiers(AVANT_LE_TRI, B, (n) => (n === 'Caisse de Gérard' ? -3000 : 0), '2026-10-21').map((t) => [t.de, t.vers, t.amountXof]),
      virementsDesCaissiers(AVANT_LE_TRI, B, () => 0, '2026-10-21')]);
  const rangees = caissesApresLesCaissiers(AVANT_LE_TRI, B, '2026-10-21T08:00:00Z');
  dit('... puis elle est rangée et dit quand', ['2026-10-21T08:00:00Z', '2026-10-21T08:00:00Z'],
    [rangees.find((b) => b.id === 'cb-caissier-g1')?.archiveeLe, rangees.find((b) => b.id === 'cb-caissier-g1')?.rangeeAuNom]);
  const renommees = caissesApresLeNom(rangees, B, renommagesAuNom(AVANT_LE_TRI, B), '2026-10-21T08:00:00Z', false);
  dit('les caisses renommées gardent ce qu elles étaient ; l autre branche ne bouge pas',
    [['Espèces', 'Real Money'], ['MTN MoMoPay', 'MoMoPay Maison MND'], ['Chèque', 'Chèques à déposer'], 'Chèques à déposer'],
    [...['ytb0sweqjt', 'cb-momopay-br-maison', 'cb-cheques-br-maison'].map((id) => { const x = renommees.find((b) => b.id === id)!; return [x.name, x.avantLeNom?.name]; }),
      renommees.find((b) => b.id === 'autre-ch')?.name]);
  dit('le geste est noté fait ; les noms d avant se lisent pour la vérification', [true, ['Real Money', 'MoMoPay Maison MND', 'Chèques à déposer']],
    [leNomEstFait(renommees, B), anciensNomsDuGeste(renommees, B)]);
  dit('le retour rend les caisses telles quelles', AVANT_LE_TRI, caissesApresDefaireLeNom(renommees, B));
  dit('après le geste, chaque paiement trouve sa caisse sous son nouveau nom', ['Espèces', 'MTN MoMoPay', 'Chèque'],
    ['Espèces', 'MTN MoMo', 'Chèque'].map((m) => caisseProposee({ methode: m, aujourdhui: '2026-10-21', boxes: renommees, branchId: B }).caisse ?? null));
}

/* ── 2. LES VRAIS MAGASINS ────────────────────────────────────────────── */
const ecritures = () => {
  invoicesStore.set(as([
    { id: 'f-rm', branchId: B, kind: 'facture', number: 'F1', clientId: 'x', date: '2026-10-10', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money',
      payments: [{ id: 'p-rm', date: '2026-10-10', amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' }] },
    { id: 'f-mo', branchId: B, kind: 'facture', number: 'F2', clientId: 'x', date: '2026-10-19', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'MoMoPay Maison MND',
      payments: [{ id: 'p-mo', date: '2026-10-19', amountXof: 30000, method: 'MTN MoMo', cashbox: 'MoMoPay Maison MND' }] },
    { id: 'f-ch', branchId: B, kind: 'facture', number: 'F3', clientId: 'x', date: '2026-10-18', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Chèques à déposer',
      payments: [{ id: 'p-ch', date: '2026-10-18', amountXof: 50000, method: 'Chèque', cashbox: 'Chèques à déposer' }] },
    { id: 'f-g', branchId: B, kind: 'facture', number: 'F4', clientId: 'x', date: '2026-10-20', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Caisse de Gérard',
      payments: [{ id: 'p-g', date: '2026-10-20', amountXof: 12000, method: 'Espèces', cashbox: 'Caisse de Gérard' }] },
    { id: 'f-autre', branchId: 'autre', kind: 'facture', number: 'F9', clientId: 'x', date: '2026-10-10', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Chèques à déposer' },
  ]));
  expensesStore.set(as([{ id: 'e-rm', branchId: B, date: '2026-10-07', cashbox: 'Real Money', label: 'Produits', amountXof: 8000 }]));
  transfertsStore.set(as([{ id: 't-vieux', branchId: B, date: '2026-10-04', de: 'Caisse Principale', vers: 'Real Money', amountXof: 1000 }]));
  appointmentsStore.set(as([{ id: 'r-mo', branchId: B, clientId: 'x', date: '2026-10-19', payments: [{ id: 'p-mo', date: '2026-10-19', amountXof: 30000, method: 'MTN MoMo', cashbox: 'MoMoPay Maison MND' }] }]));
};
const photo = () => JSON.stringify(canon([cashboxesStore.get(), invoicesStore.get(), expensesStore.get(), transfertsStore.get(), appointmentsStore.get()]));
const box = (id: string) => cashboxesStore.get().find((x) => x.id === id)!;
const pay = (fid: string) => as<{ payments?: { cashbox: string }[]; cashbox: string }>(invoicesStore.get().find((i) => i.id === fid));
const solde = (n: string) => (n === 'Caisse de Gérard' ? 12000 : n === 'MND NEW' ? 0 : 0);
const NEES = ['cb-carte-br-maison', 'cb-momo-prive-br-maison', 'cb-autres-br-maison'];

/* 2a. LE TRI N'A PAS ÉTÉ APPLIQUÉ : il passe d'abord, dans le même geste. */
cashboxesStore.set(AVANT_LE_TRI);
ecritures();
const avant = photo();
{
  const r = appliqueLeNom(B, solde, '2026-10-21', '2026-10-21T08:00:00.000Z');
  dit('tri pas fait : le geste s applique, le tri passe d abord', [true, true], [r.ok, leTriEstFait(cashboxesStore.get(), B)]);
  dit('... le tiroir s appelle « Espèces » (pas « Tiroir espèces »), le MoMoPay « MTN MoMoPay », les chèques « Chèque »', ['Espèces', 'MTN MoMoPay', 'Chèque'],
    [box('ytb0sweqjt').name, box('cb-momopay-br-maison').name, box('cb-cheques-br-maison').name]);
  dit('... chaque écriture suit : le tiroir, la fusion de Caisse Principale, le MoMoPay (facture et rendez-vous), les chèques', ['Espèces', 'Espèces', 'MTN MoMoPay', 'MTN MoMoPay', 'Chèque', 'Espèces'],
    [pay('f-rm').payments![0].cashbox, as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'e-rm')).cashbox, pay('f-mo').payments![0].cashbox,
      as<{ payments: { cashbox: string }[] }>(appointmentsStore.get().find((x) => x.id === 'r-mo')).payments[0].cashbox,
      pay('f-ch').payments![0].cashbox, as<{ vers: string }>(transfertsStore.get().find((t) => t.id === 't-vieux')).vers]);
  dit('... la caisse de Gérard vide son solde dans « Espèces » et se range ; son passé garde son nom', [['Caisse de Gérard', 'Espèces', 12000], true, 'Caisse de Gérard'],
    [(() => { const t = transfertsStore.get().find((x) => x.id === idDuVirementAuNom('cb-caissier-g1')); return t ? [t.de, t.vers, t.amountXof] : null; })(),
      !!box('cb-caissier-g1').archiveeLe, pay('f-g').payments![0].cashbox]);
  dit('... Carte, MoMo Privé, Autres naissent à leur nom', ['Carte', 'MoMo Privé', 'Autres'], NEES.map((id) => box(id)?.name ?? null));
  dit('... l autre branche ne bouge pas', ['Chèques à déposer', 'Chèques à déposer'], [box('autre-ch').name, pay('f-autre').cashbox]);
  dit('... vérifié : plus aucune écriture ne nomme un nom d avant', 0, resteDuNom(B));
  dit('... noté fait, il ne se rejoue pas', [true, false], [leNomEstFait(cashboxesStore.get(), B), appliqueLeNom(B, solde, '2026-10-21').ok]);
  /* Une écriture née après le geste, sous le nouveau nom : le retour l'emmène aussi. */
  expensesStore.set((p) => [...p, as({ id: 'e-apres', branchId: B, date: '2026-10-21', cashbox: 'Espèces', label: 'Après', amountXof: 2000 })]);
  defaisLeNom(B);
  dit('défaire : les noms d avant reviennent (le tri se défait aussi), même pour une écriture née après', ['Real Money', 'Real Money', 'MoMoPay Maison MND', 'Chèques à déposer', false],
    [as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'e-apres')).cashbox, pay('f-rm').payments![0].cashbox, pay('f-mo').payments![0].cashbox,
      pay('f-ch').payments![0].cashbox, leTriEstFait(cashboxesStore.get(), B)]);
  dit('... la caisse de Gérard revient, son virement s efface', [false, 0],
    [!!box('cb-caissier-g1').archiveeLe, transfertsStore.get().filter((t) => t.id.startsWith('trf-nom-')).length]);
  expensesStore.set((p) => p.filter((e) => e.id !== 'e-apres'));
  cashboxesStore.set((p) => p.filter((b) => !NEES.includes(b.id)));
  dit('... et, les caisses nées retirées, chaque magasin redevient exactement ce qu il était', avant, photo());
}

/* 2b. LE TRI ÉTAIT DÉJÀ APPLIQUÉ (seul, le 19 octobre) : il reste après le retour. */
cashboxesStore.set(AVANT_LE_TRI);
ecritures();
{
  const t = appliqueLeTri(B, () => 0, '2026-10-19', '2026-10-19T09:00:00.000Z');
  const apresTri = photo();
  const r = appliqueLeNom(B, solde, '2026-10-21', '2026-10-21T08:00:00.000Z');
  dit('tri déjà fait : « Tiroir espèces » devient « Espèces »', [true, true, 'Espèces', 'Espèces'],
    [t.ok, r.ok, box('ytb0sweqjt').name, pay('f-rm').payments![0].cashbox]);
  dit('... vérifié, plus aucun nom d avant', 0, resteDuNom(B));
  defaisLeNom(B);
  cashboxesStore.set((p) => p.filter((b) => !NEES.includes(b.id)));
  dit('défaire rend l état d après le tri, exactement (le tri reste, il était là avant)', [true, apresTri], [leTriEstFait(cashboxesStore.get(), B), photo()]);
}

/* 2c. UN NOM PRIS : refusé, et le tri passé dans le même geste se défait. */
cashboxesStore.set(AVANT_LE_TRI);
ecritures();
expensesStore.set((p) => [...p, as({ id: 'e-pris', branchId: B, date: '2026-05-01', cashbox: 'Espèces', label: 'x', amountXof: 1 })]);
{
  const av = photo();
  const r = appliqueLeNom(B, solde, '2026-10-21');
  defaisLaFusion(B, 'Reprise 2025');
  dit('un nom pris refuse le geste et laisse les magasins tels quels (le tri revenu en arrière)', [false, true, false], [r.ok, av === photo(), leTriEstFait(cashboxesStore.get(), B)]);
}

/* ── 3. LES ÉCRANS ────────────────────────────────────────────────────── */
{
  const sans = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const caisses = sans(lis('src/apps/trone/routes/finances/Caisses.tsx'));
  const panneau = sans(lis('src/apps/trone/routes/finances/CaissesAuNom.tsx'));
  const tri = sans(lis('src/apps/trone/routes/finances/TriDesCaisses.tsx'));
  const carte = sans(lis('src/apps/trone/routes/finances/CarteAVirer.tsx'));
  const decisions = sans(lis('src/shared/decisions-des-caisses-pur.ts'));
  dit('Les caisses montre le panneau des noms et la carte à virer', [true, true], [/<CaissesAuNom \/>/.test(caisses), /<CarteAVirer \/>/.test(caisses)]);
  dit('le panneau : direction seule, sauvegarde d abord, nom pris refusé, vérifié 9 s après, et il se défait', [true, true, true, true],
    [/if \(!estDirection\) return null;/.test(panneau), /disabled=\{!sauvee \|\| pris\.length > 0\}/.test(panneau), /resteDuNom\(branch\.id\)[\s\S]{0,300}\}, 9000\)/.test(panneau), /defaisLeNom\(branch\.id\)/.test(panneau)]);
  dit('le tri seul ne se propose plus, et se cache une fois les noms posés', true, /if \(!fait \|\| leNomEstFait\(toutes, branch\.id\)\) return null;/.test(tri));
  dit('la carte se vire vers un compte, jamais vers une caisse d un paiement', true, /!desPaiements\.has\(c\.id\)/.test(carte));
  dit('les décisions font naître Carte, MoMo Privé, Autres, jamais Espèces', [true, false],
    [/caisseNeuveDuPaiement\('carte', br\), caisseNeuveDuPaiement\('momoPrive', br\), caisseNeuveDuPaiement\('autre', br\)/.test(decisions), /caisseNeuveDuPaiement\('especes'/.test(decisions)]);
  dit('les caisses neuves : identifiant de la branche, à leur nom', [['cb-carte-x', 'Carte'], ['cb-momo-prive-x', 'MoMo Privé'], ['cb-autres-x', 'Autres']],
    (['carte', 'momoPrive', 'autre'] as const).map((f) => { const c = caisseNeuveDuPaiement(f, 'x'); return [c.id, c.name]; }));
  const pur = lis('src/shared/caisses-au-nom-pur.ts') + lis('src/shared/caisses-des-caissiers-pur.ts');
  dit('aucun nom d épargne dans le code public', false, /Mamou|Bito|Pilia|Scotia|Wells/i.test(pur));
}

console.log(ko === 0 ? '\nLes caisses au nom des paiements tiennent, aller et retour.' : `\n${ko} controle(s) en echec.`);
