import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* PARTAGER UN PAIEMENT, ÉPROUVÉ — 13 novembre 2026.
   « Dans Dépenses, permets-moi de split a payment » (Yéman). Ce banc éprouve
   la règle pure (`shared/partage-du-paiement-pur.ts`) cas par cas, puis lit
   le branchement : les charges écartent la part hors de la Maison (le mois,
   Synthèse, Dépenses, le partage du foyer, les fournisseurs), les relevés de
   caisse la gardent et réunissent les parts en un mouvement, la validation
   et l'effacement prennent le paiement entier.
   `--prouve` plante des pannes dans une COPIE du module (dossier temporaire,
   aucun fichier du dépôt touché) et exige que chacune fasse crier le banc.
   Lance : node scripts/verifie-le-partage-du-paiement.mjs [--prouve]
   Les montants et les libellés sont des exemples. */

const racine = path.resolve(import.meta.dirname, '..');
const lis = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const SOURCE = 'src/shared/partage-du-paiement-pur.ts';
const d = mkdtempSync(path.join(tmpdir(), 'partage-'));

async function charge(source, nom) {
  const ts = path.join(d, `${nom}.ts`);
  const out = path.join(d, `${nom}.mjs`);
  writeFileSync(ts, source);
  await build({ entryPoints: [ts], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}

/* Une dépense d'exemple : un ticket de 120 000 F payé d'une carte. */
const BASE = {
  id: 'exp-1', branchId: 'br', label: 'Supermarché', amountXof: 120000, date: '2026-11-12', cashbox: 'Compte privé',
  category: 'Local', subcategory: 'Courses', fichier: { nom: 'ticket.jpg' }, porteur: 'Y.', fournisseurId: 'f-1',
  validation: { etat: 'attente', soumisLe: '2026-11-13T06:00:00Z', soumisPar: 'Opale' },
};

function epreuves(m, parle) {
  const echecs = [];
  const dit = (nom, attendu, obtenu) => {
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) echecs.push(nom);
    if (parle) {
      console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`);
      if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
    }
  };

  /* ── Ce qui se partage ── */
  dit('une dépense simple se partage', null, m.pourquoiPasDePartage(BASE));
  dit('ni une mensuelle, ni une en devise, ni une à articles, ni une payée par des revenus désignés, ni un salaire, ni des intérêts, ni une arrêtée',
    [true, true, true, true, true, true, true],
    [{ recurring: 'mensuel' }, { fx: { code: 'EUR', rate: 655, amount: 10 } }, { items: [{ id: 'i', label: 'x', amountXof: 1 }] },
      { sources: [{ x: 1 }] }, { source: 'run' }, { empruntId: 'e' }, { stopped: true }]
      .map((x) => typeof m.pourquoiPasDePartage({ ...BASE, ...x }) === 'string'));

  /* ── Le reste à répartir et le refus ── */
  const deux = [
    { objet: 'Courses du salon', categorie: 'Local', montantXof: 90000 },
    { objet: 'Achat de la famille', categorie: 'Divers', montantXof: 30000, horsMaison: true },
  ];
  dit('deux parts qui font le paiement : rien à redire', [0, null], [m.resteARepartir(120000, deux), m.refusDuPartage(120000, deux)]);
  dit('il manque : reste positif, refus « reste »', [10000, 'reste'],
    [m.resteARepartir(120000, [deux[0], { ...deux[1], montantXof: 20000 }]), m.refusDuPartage(120000, [deux[0], { ...deux[1], montantXof: 20000 }])]);
  dit('ça dépasse : reste négatif', -5000, m.resteARepartir(120000, [deux[0], { ...deux[1], montantXof: 35000 }]));
  dit('une seule part, un objet vide, une catégorie vide', ['moins-de-deux', 'objet-vide', 'categorie-vide'],
    [m.refusDuPartage(120000, [{ ...deux[0], montantXof: 120000 }]), m.refusDuPartage(120000, [deux[0], { ...deux[1], objet: '  ' }]),
      m.refusDuPartage(120000, [deux[0], { ...deux[1], categorie: '' }])]);
  dit('un montant nul, négatif ou à centimes est refusé', ['montant', 'montant', 'montant'],
    [0, -10, 29999.5].map((x) => m.refusDuPartage(120000, [{ ...deux[0], montantXof: 120000 - x }, { ...deux[1], montantXof: x }])));
  dit('neuf parts, c’est trop', 'trop-de-parts',
    m.refusDuPartage(90000, Array.from({ length: 9 }, (_, i) => ({ objet: `p${i}`, categorie: 'Divers', montantXof: 10000 }))));

  /* ── Couper ── */
  let n = 0;
  const nouvelId = () => `exp-neuf-${++n}`;
  const parts = m.partsDuPaiement(BASE, deux, { idDuPaiement: 'paiement-exp-1', totalXof: 120000, libelle: 'Supermarché', nouvelId });
  dit('la première part garde l’identifiant de la dépense, la seconde en reçoit un neuf', ['exp-1', 'exp-neuf-1'], parts.map((p) => p.id));
  dit('chaque part a son objet, sa catégorie, son montant', [['Courses du salon', 'Local', 90000], ['Achat de la famille', 'Divers', 30000]],
    parts.map((p) => [p.label, p.category, p.amountXof]));
  dit('la somme des parts est le paiement : la caisse bouge du même montant', 120000, parts.reduce((s, p) => s + p.amountXof, 0));
  dit('la date, la caisse, le reçu, le porteur, le fournisseur et la validation restent communs', true,
    parts.every((p) => p.date === BASE.date && p.cashbox === BASE.cashbox && p.fichier === BASE.fichier && p.porteur === BASE.porteur
      && p.fournisseurId === BASE.fournisseurId && p.validation === BASE.validation && p.branchId === BASE.branchId));
  dit('toutes portent le même paiement (identifiant, total, libellé)', [true, true],
    [parts.every((p) => p.paiement?.id === 'paiement-exp-1' && p.paiement.totalXof === 120000 && p.paiement.libelle === 'Supermarché'), new Set(parts.map((p) => p.paiement.id)).size === 1]);
  dit('« hors de la Maison » sur la seule part cochée', [false, true], parts.map((p) => !!p.horsMaison));
  dit('la sous-catégorie et les articles de la dépense ne se recopient pas', [false, false],
    [parts.some((p) => 'subcategory' in p), parts.some((p) => 'items' in p)]);
  const reprises = m.partsDuPaiement(parts[0], m.partsSaisiesDe(parts).concat([{ objet: 'Troisième', categorie: 'Divers', montantXof: 0 }]).map((p, i) => (i === 0 ? { ...p, montantXof: 90000 } : p)),
    { idDuPaiement: 'paiement-exp-1', totalXof: 120000, libelle: 'Supermarché', nouvelId });
  dit('reprendre un paiement garde l’identifiant de chaque part déjà posée', ['exp-1', 'exp-neuf-1', 'exp-neuf-2'], reprises.map((p) => p.id));
  dit('un même identifiant ne sert jamais deux fois', 3, new Set(m.partsDuPaiement(BASE, [{ ...deux[0], id: 'exp-1' }, { ...deux[1], id: 'exp-1' }, { ...deux[1], id: 'exp-1', montantXof: 0 }],
    { idDuPaiement: 'p', totalXof: 120000, libelle: 'S', nouvelId }).map((p) => p.id)).size);

  /* ── Réunir ── */
  const une = m.reunisLesParts(parts);
  dit('réunir : une dépense, l’identifiant de la première part, le total, le libellé du paiement, la catégorie de la plus grosse part',
    ['exp-1', 120000, 'Supermarché', 'Local'], [une.id, une.amountXof, une.label, une.category]);
  dit('… sans paiement ni « hors de la Maison », le reste commun gardé', [false, false, true],
    ['paiement' in une, 'horsMaison' in une, une.cashbox === BASE.cashbox && une.fichier === BASE.fichier && une.validation === BASE.validation]);
  dit('la plus grosse part décide de la catégorie, même en seconde position', 'Divers',
    m.reunisLesParts([{ ...parts[0], amountXof: 20000 }, { ...parts[1], amountXof: 100000 }]).category);
  dit('rien à réunir, rien de rendu', null, m.reunisLesParts([]));

  /* ── La liste ── */
  const seule = { id: 'exp-2', amountXof: 5000 };
  const g = m.groupeLesPaiements([seule, parts[0], { id: 'exp-3', amountXof: 1000 }, parts[1]]);
  dit('la liste : les dépenses gardent leur ordre, les parts se rangent ensemble à la place de la première',
    ['depense:exp-2', 'paiement:exp-1+exp-neuf-1', 'depense:exp-3'],
    g.map((l) => (l.sorte === 'depense' ? `depense:${l.depense.id}` : `paiement:${l.parts.map((p) => p.id).join('+')}`)));
  dit('… et l’en-tête dit le libellé et le total du paiement', ['Supermarché', 120000],
    (() => { const p = g.find((l) => l.sorte === 'paiement'); return [p.libelle, p.totalXof]; })());
  dit('les parts d’un paiement se retrouvent par son identifiant', ['exp-1', 'exp-neuf-1'], m.lesPartsDe([seule, ...parts], 'paiement-exp-1').map((p) => p.id));
  dit('l’identifiant d’un paiement neuf vient de la dépense, celui d’une part reste le sien', ['paiement-exp-2', 'paiement-exp-1'],
    [m.idDuPaiementPour({ id: 'exp-2' }), m.idDuPaiementPour(parts[1])]);
  return echecs;
}

let ko = 0;
try {
  const source = lis(SOURCE);
  const base = epreuves(await charge(source, 'partage'), true);
  ko += base.length;

  /* ── LE BRANCHEMENT ── */
  const finance = lis('src/shared/finance.ts');
  const foyer = lis('src/shared/foyer.ts');
  const depenses = lis('src/apps/trone/routes/finances/Depenses.tsx');
  const synthese = lis('src/apps/trone/routes/finances/Synthese.tsx');
  const fournisseurs = lis('src/apps/trone/routes/finances/Fournisseurs.tsx');
  const tiroirs = lis('src/apps/trone/routes/finances/tiroirs.tsx');
  const fenetre = lis('src/apps/trone/routes/finances/PartagerLePaiement.tsx');
  const branche = [
    ['une dépense porte `paiement` et `horsMaison`, et `estUneCharge` les juge', /paiement\?: \{ id: string; totalXof: number; libelle: string \};/.test(finance) && /horsMaison\?: boolean;/.test(finance) && /export const estUneCharge = \(e: Pick<Expense, 'horsMaison'>\): boolean => !e\.horsMaison;/.test(finance)],
    ['les dépenses du mois (tableau de bord, Synthèse, Centre de commande) écartent la part hors de la Maison', /export const depensesDuMois[\s\S]{0,260}\.filter\(\(e\) => e\.branchId === branchId && !e\.stopped && estUneCharge\(e\)\)/.test(finance)],
    ['le partage du foyer aussi', /chargesDuPartage[\s\S]{0,260}!e\.stopped && estUneCharge\(e\)/.test(foyer)],
    ['Synthèse : les catégories et le détail du mois aussi', /const liveExp = expenses\.filter\(\(e\) => e\.branchId === branch\.id && !e\.stopped && estUneCharge\(e\)\);/.test(synthese) && /!e\.stopped && estUneCharge\(e\)\) ajoute\(cats,/.test(synthese)],
    ['Dépenses : les charges, les catégories et les budgets aussi, la liste montre tout', /const live = monthExp\.filter\(\(e\) => !e\.stopped && estUneCharge\(e\)\);/.test(depenses) && /!e\.stopped && estUneCharge\(e\) && e\.category === cat/.test(depenses) && /const lignesDuFlux = filtreDuFlux === 'all' \? visibleMonthExp/.test(depenses)],
    ['« Où va l’argent » : un paiement, un bénéficiaire, sans sa part hors de la Maison', /if \(!estUneCharge\(e\)\) continue;\n      const nom = beneficiaireDe\(e\.paiement\?\.libelle \|\| e\.label\);/.test(depenses)],
    ['Fournisseurs : ce que la Maison a dépensé aussi', /!e\.stopped && estUneCharge\(e\) && e\.date >= du/.test(fournisseurs)],
    ['le relevé d’une caisse garde la part et réunit les parts en un mouvement', /const out = unMouvementParPaiement\(sorties\);/.test(tiroirs) && !/estUneCharge/.test(tiroirs)],
    ['trancher prend toutes les parts', /const ids = new Set\(partsDuMemePaiement\(e\)\.map\(\(x\) => x\.id\)\);\n    setExpenses\(\(prev\) => prev\.map\(\(x\) => \(ids\.has\(x\.id\) && x\.validation/.test(depenses)],
    ['effacer une part efface le paiement, et une part tranchée l’empêche', /const parts = partsDuMemePaiement\(e\);\n    if \(parts\.some\(\(x\) => figeePour\(monProfil\?\.role, x\)\)\)/.test(depenses) && /setExpenses\(\(prev\) => prev\.filter\(\(x\) => !aEffacer\.has\(x\.id\)\)\);/.test(depenses)],
    ['modifier une part ouvre les parts', /const openEdit = \(e: Expense\) => \{\n[\s\S]{0,200}if \(e\.paiement\) \{ ouvreLePartage\(e\); return; \}/.test(depenses)],
    ['« Partager » seulement là où le partage tient', /\{!e\.paiement && !pourquoiPasDePartage\(e\) && \(\n\s*<button className="trf-geste" onClick=\{\(\) => ouvreLePartage\(e\)\}/.test(depenses)],
    ['partager à la saisie', /if \(partagerApres && !pourquoiPasDePartage\(e\)\) setAPartager\(\{ base: e \}\);/.test(depenses) && /checked=\{partagerApres\}/.test(depenses)],
    ['la liste groupe le paiement et ses parts', /groupeLesPaiements\(g\.lignes\)/.test(depenses) && /className="trf-paiement"/.test(depenses) && /className=\{e\.paiement \? 'trf-part' : undefined\}/.test(depenses)],
    ['les lignes s’écrivent dans le magasin complet', /const remplaceLesLignes = \(nouvelles: Expense\[\], remplacees: Expense\[\]\) => \{\n    const vieilles = new Set/.test(depenses) && /lesPartsDe\(toutesLesDepenses, e\.paiement\.id\)/.test(depenses)],
    ['la fenêtre attend un reste à 0 F et passe par la règle', /disabled=\{!!refus\}/.test(fenetre) && /refusDuPartage\(totalXof, parts\)/.test(fenetre) && /partsDuPaiement\(base, parts,/.test(fenetre)],
  ];
  for (const [nom, ok] of branche) { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`); }

  if (process.argv.includes('--prouve')) {
    const pannes = [
      ['le reste n’est plus exigé', (s) => s.replace("  if (resteARepartir(totalXof, parts) !== 0) return 'reste';\n", '')],
      ['la première part perd l’identifiant', (s) => s.replace("(i === 0 && !pris.has(base.id) ? base.id : o.nouvelId())", 'o.nouvelId()')],
      ['« hors de la Maison » sur toutes les parts', (s) => s.replace('...(p.horsMaison ? { horsMaison: true } : {}),', 'horsMaison: true,')],
      ['la sous-catégorie recopiée', (s) => s.replace('subcategory: _s, ', '')],
      ['réunir prend la catégorie de la première', (s) => s.replace('category: plusGrosse.category,', 'category: premiere.category,')],
      ['la liste ne groupe plus', (s) => s.replace('    if (deja) { deja.parts.push(e); continue; }\n', "    if (deja) { out.push({ sorte: 'depense', depense: e }); continue; }\n")],
      ['un montant à centimes accepté', (s) => s.replace(' || entier(p.montantXof) !== Number(p.montantXof)', '')],
      ['une mensuelle se partage', (s) => s.replace("  if (e.recurring) return", "  if (false) return")],
      ['réunir oublie le paiement', (s) => s.replace("    label: paiement?.libelle || premiere.label,", "    paiement, label: paiement?.libelle || premiere.label,")],
    ];
    let muettes = 0;
    for (const [i, [nom, plante]] of pannes.entries()) {
      const casse = plante(source);
      if (casse === source) { muettes++; console.log(`ECHEC panne « ${nom} » : la plantation n’a rien changé`); continue; }
      const neuves = epreuves(await charge(casse, `panne-${i}`), false).filter((e) => !base.includes(e));
      if (neuves.length === 0) { muettes++; console.log(`ECHEC panne « ${nom} » : le banc se tait`); }
      else console.log(`OK    panne « ${nom} » crie (${neuves[0]})`);
    }
    ko += muettes;
    console.log(`${pannes.length - muettes} pannes sur ${pannes.length} crient.`);
  }
} finally {
  rmSync(d, { recursive: true, force: true });
}
console.log(ko ? `\n${ko} échec(s).` : '\nLe partage d’un paiement tient.');
process.exit(ko ? 1 : 0);
