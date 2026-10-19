/* LE TRI DES CAISSES, ÉPROUVÉ — `node scripts/verifie-le-tri-des-caisses.mjs`.

   19 octobre 2026. Ses choix sur la page de tri (lus en base tri/choix,
   « Tout me va » puis « construis ») et ses mots : « La fondre dans le
   tiroir » (Caisse Principale), « transfert MND new et caisses
   independantes dans caisse principale ». Les attentes viennent de ces
   choix, jamais du code : le tiroir commun des espèces, le compte MoMoPay,
   l'épargne jamais au comptoir (direction comprise), la carte et le virement
   qu'on choisit, corriger un versement sur le comptoir seulement. Puis les
   vrais magasins, aller et retour : rien ne se perd. Données d'exemple ;
   les identifiants sont ceux de ses caisses, les noms sont inventés. */
import { readFileSync } from 'node:fs';
import { cashboxesStore, invoicesStore, expensesStore, transfertsStore, type Cashbox } from '../src/shared/finance';
import { appointmentsStore } from '../src/shared/agenda';
import {
  TRI_DU_19_OCTOBRE, caissesApresDefaireLeTri, caissesApresLesRetouches, caissesPourCorriger, idDuVirementDuTri,
  leTriEstFait, nomsDejaPris, renommagesDuPlan, virementsDuTri,
} from '../src/shared/tri-des-caisses-pur';
import { caisseProposee, caissesAuChoix } from '../src/shared/caisses-des-caissiers-pur';
import { appliqueLeTri, defaisLeTri, resteDuTri } from '../src/apps/trone/routes/finances/tri';
import { defaisLaFusion } from '../src/apps/trone/routes/finances/fusion';
import { lisLesLots } from '../src/apps/trone/routes/finances/bascule';

let ko = 0;
/* Comparaison canonique : l'ordre des champs ne compte pas (jsonb, spreads). */
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

/* Ses caisses, sous leurs vrais identifiants (noms inventés pour l'épargne). */
const CAISSES: Cashbox[] = [
  cb('ytb0sweqjt', 'Real Money', { sub: 'Caisse journalier' }),
  cb('2b0gyen3wq', 'ACIA1', { sub: 'Momopay' }),
  cb('uhhu3j8pbz', 'Caisse Principale', { sub: 'Caisse manuelle' }),
  cb('3gecxx1oyf', 'MND NEW'),
  cb('dz2b3w0bye', 'Caisse Indépendantes', { horsBilan: true, equipe: true, horsEncaissement: true }),
  cb('b8rgpuq4zm', 'BIIC', { horsBilan: true, horsEncaissement: true }),
  cb('dkg7qprz84', 'Épargne A', { horsBilan: true }),
  cb('n0mgl8d1vz', 'Épargne B', { horsBilan: true }),
  cb('hhcoqafioq', 'Épargne C', { currency: 'EUR' }),
  cb('bvgh5pun9g', 'Compte D', { currency: 'CAD' }),
  cb('n0y0j52n73', 'Compte E', { currency: 'USD' }),
  cb('kns3vlxy3c', 'Compte F', { currency: 'USD', openingXof: 21000 }),
  cb('vncxspqt9l', 'Tiroir EUR', { currency: 'EUR' }),
  cb('cb-kkiapay-br-maison', 'KkiaPay', { sub: 'Paiements en ligne' }),
  cb('cb-mnd-pay', 'MND PAY'),
  cb('cb-reprise-2025-br-maison', 'Reprise 2025'),
  { ...cb('cb-annees-passees-br-maison', 'Années passées'), role: 'archive', histoire: true },
  /* Une autre branche qui a aussi une « Real Money » : elle ne bouge pas. */
  { ...cb('autre-rm', 'Real Money'), branchId: 'autre' },
];

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
dit('les renommages de ses choix : Real Money devient « Tiroir espèces », ACIA1 « MTN MoMoPay »',
  [{ de: 'Real Money', vers: 'Tiroir espèces' }, { de: 'ACIA1', vers: 'MTN MoMoPay' }], renommagesDuPlan(CAISSES, B));
{
  const apres = caissesApresLesRetouches(CAISSES, B);
  const de = (id: string) => apres.find((x) => x.id === id && x.branchId === B)!;
  dit('le tiroir commun : rôle Terrasse, ouvert à l équipe ; le compte MoMoPay : rôle Terrasse', [['Tiroir espèces', 'terrasse', true], ['MTN MoMoPay', 'terrasse']],
    [[de('ytb0sweqjt').name, de('ytb0sweqjt').role, de('ytb0sweqjt').equipe], [de('2b0gyen3wq').name, de('2b0gyen3wq').role]]);
  dit('l épargne et les comptes à l étranger : jamais au comptoir (les sept)', [true, true, true, true, true, true, true],
    ['b8rgpuq4zm', 'dkg7qprz84', 'n0mgl8d1vz', 'hhcoqafioq', 'bvgh5pun9g', 'n0y0j52n73', 'kns3vlxy3c'].map((id) => de(id).horsEncaissement === true));
  dit('KkiaPay, le tiroir des euros, MND PAY ne bougent pas', [CAISSES[13], CAISSES[12], CAISSES[14]],
    [de('cb-kkiapay-br-maison'), de('vncxspqt9l'), de('cb-mnd-pay')]);
  dit('l autre branche ne bouge pas', CAISSES[17], apres.find((x) => x.id === 'autre-rm'));
  dit('chaque caisse retouchée garde ce qu elle était, et le retour la rend telle quelle', CAISSES, caissesApresDefaireLeTri(apres, B));
  dit('une seconde retouche ne change rien (elle porte déjà son avant)', apres, caissesApresLesRetouches(apres, B));

  /* Après le tri, au rendez-vous. */
  const ici = apres.filter((x) => x.branchId === B);
  const P = (methode: string, staffId?: string, boxes = ici) =>
    caisseProposee({ methode, dateDuRdv: '2026-10-19', aujourdhui: '2026-10-19', boxes, branchId: B, staffId }).caisse ?? null;
  const avecGerard = [...ici, cb('cb-caissier-g1', 'Caisse de Gérard', { role: 'terrasse', equipe: true, caissierId: 'g1' })];
  dit('au RDV : espèces → la caisse de qui encaisse, sinon le tiroir commun', ['Caisse de Gérard', 'Tiroir espèces'], [P('Espèces', 'g1', avecGerard), P('Espèces', 'y1', avecGerard)]);
  dit('au RDV : MTN MoMoPay → « MTN MoMoPay » ; la carte et le virement : on choisit ; le chèque : Chèques à déposer', ['MTN MoMoPay', 'MTN MoMoPay', null, null, 'Chèques à déposer'],
    [P('MTN MoMo'), P('Momopay'), P('Carte'), P('Virement bancaire'), P('Chèque')]);
  const auChoixDir = caissesAuChoix(ici, { estDirection: true, anneePassee: false }).map((x) => x.name);
  dit('au choix, même pour la direction : aucune caisse d épargne ni à l étranger ; le comptoir reste', [false, true, true, true],
    [auChoixDir.some((n) => ['BIIC', 'Épargne A', 'Épargne B', 'Épargne C', 'Compte D', 'Compte E', 'Compte F'].includes(n)),
      auChoixDir.includes('Tiroir espèces'), auChoixDir.includes('MTN MoMoPay'), auChoixDir.includes('KkiaPay')]);
  dit('corriger un versement : le comptoir seulement, et la caisse qu il porte reste', [false, true, true],
    [caissesPourCorriger(ici).some((x) => x.name === 'BIIC'), caissesPourCorriger(ici).some((x) => x.name === 'Tiroir espèces'),
      caissesPourCorriger(ici, 'BIIC').some((x) => x.name === 'BIIC')]);
}
{
  const solde: Record<string, number> = { 'MND NEW': 76000, 'Caisse Indépendantes': -5000 };
  const v = virementsDuTri(CAISSES, B, (n) => solde[n] ?? 0, '2026-10-19');
  dit('« transfert MND new et caisses independantes dans caisse principale » : l argent y passe, un découvert se comble depuis elle',
    [['MND NEW', 'Caisse Principale', 76000], ['Caisse Principale', 'Caisse Indépendantes', 5000]], v.map((t) => [t.de, t.vers, t.amountXof]));
  dit('un solde nul ne vire rien', [], virementsDuTri(CAISSES, B, () => 0, '2026-10-19'));
  dit('le virement porte l identifiant de sa caisse (deux postes écrivent la même ligne)', [idDuVirementDuTri('3gecxx1oyf'), idDuVirementDuTri('dz2b3w0bye')], v.map((t) => t.id));
}
dit('un nom déjà porté par une caisse refuse le tri', ['Tiroir espèces'], nomsDejaPris([...CAISSES, cb('x', 'Tiroir espèces', { archiveeLe: '2026-01-01' })], {}, B));
dit('... ou par une écriture', ['MTN MoMoPay'], nomsDejaPris(CAISSES, { depenses: [{ cashbox: 'MTN MoMoPay', date: '2026-05-01' }] }, B));

/* ── 2. LES VRAIS MAGASINS, ALLER ET RETOUR ─────────────────────────── */
cashboxesStore.set(CAISSES);
invoicesStore.set(as([
  { id: 'f-rm', branchId: B, kind: 'facture', number: 'F1', clientId: 'x', date: '2026-10-10', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money',
    payments: [{ id: 'p-rm', date: '2026-10-10', amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' }] },
  { id: 'f-mo', branchId: B, kind: 'facture', number: 'F2', clientId: 'x', date: '2026-10-03', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'ACIA1',
    payments: [{ id: 'p-mo', date: '2026-10-03', amountXof: 30000, method: 'MTN MoMo', cashbox: 'ACIA1' }] },
  { id: 'f-cp', branchId: B, kind: 'facture', number: 'F3', clientId: 'x', date: '2026-10-01', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Caisse Principale',
    payments: [{ id: 'p-cp', date: '2026-10-01', amountXof: 15000, method: 'Espèces', cashbox: 'Caisse Principale' }] },
  { id: 'f-new', branchId: B, kind: 'facture', number: 'F4', clientId: 'x', date: '2026-10-01', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'MND NEW',
    payments: [{ id: 'p-new', date: '2026-10-01', amountXof: 76000, method: 'Espèces', cashbox: 'MND NEW' }] },
  { id: 'f-rp', branchId: B, kind: 'facture', number: 'F5', clientId: 'x', date: '2025-06-12', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Reprise 2025',
    payments: [{ id: 'p-rp', date: '2025-06-12', amountXof: 25000, method: 'Espèces', cashbox: 'Reprise 2025' }] },
  { id: 'f-autre', branchId: 'autre', kind: 'facture', number: 'F9', clientId: 'x', date: '2026-10-10', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money' },
]));
expensesStore.set(as([
  { id: 'e-rm', branchId: B, date: '2026-10-07', cashbox: 'Real Money', label: 'Produits', amountXof: 8000 },
  { id: 'e-ind', branchId: B, date: '2026-10-02', cashbox: 'Caisse Indépendantes', label: 'Course', amountXof: 5000 },
  { id: 'e-ep', branchId: B, date: '2026-10-02', cashbox: 'Épargne A', label: 'Retrait', amountXof: 1000 },
]));
transfertsStore.set(as([{ id: 't-vieux', branchId: B, date: '2026-10-04', de: 'Caisse Principale', vers: 'Real Money', amountXof: 1000 }]));
appointmentsStore.set(as([{ id: 'r-mo', branchId: B, clientId: 'x', date: '2026-10-03', payments: [{ id: 'p-mo', date: '2026-10-03', amountXof: 30000, method: 'MTN MoMo', cashbox: 'ACIA1' }] }]));

const photo = () => JSON.stringify(canon([cashboxesStore.get(), invoicesStore.get(), expensesStore.get(), transfertsStore.get(), appointmentsStore.get()]));
const avant = photo();
const solde: Record<string, number> = { 'MND NEW': 76000, 'Caisse Indépendantes': -5000 };
const r = appliqueLeTri(B, (n) => solde[n] ?? 0, '2026-10-19', '2026-10-19T09:00:00.000Z');
dit('le tri s applique', true, r.ok);
const box = (id: string) => cashboxesStore.get().find((x) => x.id === id)!;
const paiement = (fid: string) => as<{ payments: { cashbox: string; cashboxAvantFusion?: string }[]; cashbox: string }>(invoicesStore.get().find((i) => i.id === fid));
dit('après : plus aucune écriture de la branche ne nomme Real Money, ACIA1 ni Caisse Principale', 0, resteDuTri(B));
dit('... les écritures suivent les noms : le tiroir, le MoMoPay, le carnet du RDV', ['Tiroir espèces', 'Tiroir espèces', 'MTN MoMoPay', 'MTN MoMoPay', 'Tiroir espèces'],
  [paiement('f-rm').payments[0].cashbox, paiement('f-rm').cashbox, paiement('f-mo').payments[0].cashbox,
    as<{ payments: { cashbox: string }[] }>(appointmentsStore.get().find((x) => x.id === 'r-mo')).payments[0].cashbox,
    as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'e-rm')).cashbox]);
dit('« La fondre dans le tiroir » : Caisse Principale fondue dans Tiroir espèces, ses écritures gardent leur ancien nom à côté', ['Tiroir espèces', 'Caisse Principale', 'Tiroir espèces', true],
  [paiement('f-cp').payments[0].cashbox, paiement('f-cp').payments[0].cashboxAvantFusion, box('uhhu3j8pbz').fondueDans, !!box('uhhu3j8pbz').archiveeLe]);
const virements = transfertsStore.get().filter((t) => t.id.startsWith('trf-tri-')).map((t) => [t.de, t.vers, t.amountXof]);
dit('MND NEW et Caisse Indépendantes : leurs soldes passent (puis, avec Principale, au tiroir), et elles sont rangées',
  [[['MND NEW', 'Tiroir espèces', 76000], ['Tiroir espèces', 'Caisse Indépendantes', 5000]], true, true],
  [virements, !!box('3gecxx1oyf').archiveeLe, !!box('dz2b3w0bye').archiveeLe]);
dit('Reprise 2025 fondue dans Années passées (décidé le 17 octobre)', ['Années passées', 'Années passées'], [paiement('f-rp').payments[0].cashbox, box('cb-reprise-2025-br-maison').fondueDans]);
dit('l épargne garde ses écritures, l autre branche ne bouge pas', ['Épargne A', 'Real Money', 'Real Money'],
  [as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'e-ep')).cashbox, as<{ cashbox: string }>(invoicesStore.get().find((i) => i.id === 'f-autre')).cashbox, box('autre-rm').name]);
dit('le tri est noté fait, et ne se rejoue pas', [true, false], [leTriEstFait(cashboxesStore.get(), B), appliqueLeTri(B, () => 0, '2026-10-19').ok]);

/* Une écriture née après le tri, sous le nouveau nom : le retour l'emmène aussi. */
expensesStore.set((p) => [...p, as({ id: 'e-apres', branchId: B, date: '2026-10-20', cashbox: 'Tiroir espèces', label: 'Après', amountXof: 2000 })]);
defaisLeTri(B);
dit('défaire : les noms d avant reviennent, même pour une écriture née après', ['Real Money', 'Real Money', 'ACIA1'],
  [as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'e-apres')).cashbox, paiement('f-rm').payments[0].cashbox, paiement('f-mo').payments[0].cashbox]);
dit('... Caisse Principale reprend ses écritures, les virements du tri s effacent, les caisses rangées reviennent',
  ['Caisse Principale', 0, false, false, false], [paiement('f-cp').payments[0].cashbox, transfertsStore.get().filter((t) => t.id.startsWith('trf-tri-')).length,
    !!box('uhhu3j8pbz').archiveeLe, !!box('3gecxx1oyf').archiveeLe, !!box('dz2b3w0bye').archiveeLe]);
dit('... Reprise 2025 reste fondue (son retour est dans son panneau)', 'Années passées', box('cb-reprise-2025-br-maison').fondueDans);
expensesStore.set((p) => p.filter((e) => e.id !== 'e-apres'));
defaisLaFusion(B, 'Reprise 2025');
dit('... et une fois Reprise 2025 défaite aussi, chaque magasin redevient exactement ce qu il était', avant, photo());
dit('un nom pris refuse le tri sans rien toucher', [false, true],
  (() => { expensesStore.set((p) => [...p, as({ id: 'e-pris', branchId: B, date: '2026-05-01', cashbox: 'MTN MoMoPay', label: 'x', amountXof: 1 })]);
    const av = photo(); const res = appliqueLeTri(B, () => 0, '2026-10-19'); return [res.ok, av === photo()]; })());
void lisLesLots;

/* ── 3. LES ÉCRANS ────────────────────────────────────────────────────── */
{
  const sans = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const caisses = sans(lis('src/apps/trone/routes/finances/Caisses.tsx'));
  const panneau = sans(lis('src/apps/trone/routes/finances/TriDesCaisses.tsx'));
  const act = sans(lis('src/apps/trone/routes/clients/actions.tsx'));
  const fac = sans(lis('src/apps/trone/routes/vente/Factures.tsx'));
  dit('Les caisses montre le tri ; il attend la sauvegarde et refuse un nom pris ; il se défait', [true, true, true],
    [/<TriDesCaisses \/>/.test(caisses), /disabled=\{!sauvee \|\| pris\.length > 0\}/.test(panneau), /defaisLeTri\(branch\.id, plan\)/.test(panneau)]);
  dit('corriger la caisse d un versement : le comptoir seulement, au rendez-vous et dans Factures', [true, true],
    [/caissesPourCorriger\(branchBoxes, v\.cashbox\)\.map/.test(act), /caissesPourCorriger\(caissesPourLaDate\(boxesBranche, p\.date, p\.cashbox\), p\.cashbox\)/.test(fac)]);
  /* Le dépôt public ne porte aucun nom de compte d'épargne. */
  const pur = lis('src/shared/tri-des-caisses-pur.ts');
  dit('le plan nomme les caisses par identifiant : aucun nom d épargne dans le code', false, /Mamou|Bito|Pilia|Scotia|Wells/i.test(pur));
}

console.log(ko === 0 ? '\nLe tri des caisses tient, aller et retour.' : `\n${ko} controle(s) en echec.`);
