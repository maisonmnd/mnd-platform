/* L'ACHAT SAISI PAR PHOTOS, ÉPROUVÉ — `node scripts/verifie-l-achat-par-photos.mjs`.

   Maquette « Dépenses du jour et achats », 1er novembre 2026 : Claude lit les
   photos, elle corrige, « C'est saisi » écrit fournisseur, fiches, bon reçu,
   stock et dépense en un geste, une seule fois. La règle
   (src/shared/achat-par-photos-pur.ts), l'écriture par les vraies portes du
   stock (src/shared/achat-par-photos.ts) et les écrans qui la portent. Tout
   est inventé : aucun prix d'achat réel. Sortie ASCII : la console de Windows. */
import {
  cadreLu, lectureDeLAchat, lignesDepuisLaLecture, compteurDeLAchat, ceQuiManqueALAchat, planDeLAchat,
  consigneDeLAchat, SCHEMA_DE_L_ACHAT, nomComparable, type SaisieDAchat, type FicheConnue,
} from '../src/shared/achat-par-photos-pur';
import { saisirLAchat } from '../src/shared/achat-par-photos';
import {
  fournisseursStore, produitsStockStore, mouvementsStockStore, commandesAchatStore, lignesAchatStore,
  creerFournisseur, creerProduitStock, stockDe, lignesDe,
} from '../src/shared/stock';
import { expensesStore } from '../src/shared/finance';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander, saitLAchatParPhotos } from '../src/shared/ia-maison-pur';
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
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lf(readFileSync(f, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

/* ── ① LA LECTURE DE CE QUE CLAUDE REND ──────────────────────────────── */
const FICHES: FicheConnue[] = [
  { id: 'stk-a', nom: 'Shampoing mentholé 1 L', famille: 'consommable', prixAchatXof: 2000, actif: true },
  { id: 'stk-b', nom: 'Mèches 1B', famille: 'meches', prixAchatXof: 1200, actif: true },
  { id: 'stk-x', nom: 'Ancien gel', famille: 'consommable', prixAchatXof: 900, actif: false },
];
dit('un cadre se garde dans sa photo, arrondi au millieme', { x: 0.1, y: 0.2, l: 0.3, h: 0.4 }, cadreLu({ x: 0.1, y: 0.2, l: 0.3, h: 0.4 }));
dit('un cadre qui deborde se coupe au bord', { x: 0.8, y: 0, l: 0.2, h: 1 }, cadreLu({ x: 0.8, y: -0.5, l: 0.6, h: 2 }));
dit('un cadre trop petit ou illisible ne vaut rien', [null, null, null], [cadreLu({ x: 0.5, y: 0.5, l: 0.01, h: 0.3 }), cadreLu({ x: 'a', y: 0, l: 1, h: 1 }), cadreLu(null)]);
const lu = lectureDeLAchat({
  produits: [
    { photo: 0, nom: '  Shampoing  mentholé 1 L ', famille: 'consommable', quantite: 6, unite: 'flacon', cadre: { x: 0, y: 0, l: 0.5, h: 0.5 }, ficheId: '' },
    { photo: 1, nom: 'Gel aloe 500 ml', famille: 'inconnue', quantite: 4, unite: 'pot', cadre: { x: 0.5, y: 0.5, l: 0.5, h: 0.5 }, ficheId: 'stk-invente' },
    { photo: 9, nom: 'Elastiques fins', famille: 'jetable', quantite: 0, unite: 'boite', cadre: null, ficheId: '' },
    { photo: 0, nom: 'Gel aloe 500 ml', famille: 'consommable', quantite: 2, unite: 'pot', cadre: null, ficheId: '' },
    { photo: 1, nom: '', famille: 'meches', quantite: 3, unite: 'paquet', cadre: null, ficheId: 'stk-b' },
    'pas un objet',
  ],
  fournisseur: '  Fournisseur  d’exemple ', remarques: ['Une etiquette est floue.', 42],
}, { photos: 2, fiches: FICHES });
dit('la lecture : un produit par nom, le nom exact d une fiche la reconnait, une fiche inventee ne passe pas', [
  ['Shampoing mentholé 1 L', 'stk-a', 6, 'flacon', 0], ['Gel aloe 500 ml', '', 6, 'pot', 1], ['Elastiques fins', '', 1, 'pièce', 0],
], lu?.produits.map((p) => [p.nom, p.ficheId, p.quantite, p.unite, p.photo]));
dit('... une famille illisible devient Consommable, et le doublon s additionne, et chaque correction se dit', [true, true, true, true],
  [lu?.produits[1].famille === 'consommable', /famille illisible/.test(lu?.avertissements.join(' ') ?? ''), /vu deux fois/.test(lu?.avertissements.join(' ') ?? ''), /quantite illisible|quantité illisible/.test(lu?.avertissements.join(' ') ?? '')]);
dit('... le fournisseur lu, les remarques de Claude gardees (des mots seulement)', ['Fournisseur d’exemple', true, 1],
  [lu?.fournisseur, lu?.avertissements[0] === 'Une etiquette est floue.', lu?.avertissements.filter((a) => a === '42').length === 0 ? 1 : 0]);
dit('une reponse sans liste de produits n est pas une lecture', [null, null], [lectureDeLAchat({ fournisseur: 'x' }, { photos: 1, fiches: [] }), lectureDeLAchat('texte', { photos: 1, fiches: [] })]);
dit('une fiche archivee ne se reconnait pas par son nom', '', lectureDeLAchat({ produits: [{ photo: 0, nom: 'Ancien gel', famille: 'consommable', quantite: 1, unite: 'pot', cadre: null, ficheId: '' }], fournisseur: '', remarques: [] }, { photos: 1, fiches: FICHES })?.produits[0].ficheId);
dit('les noms se comparent sans accents ni casse ni ponctuation', 'shampoing menthole 1 l', nomComparable(' Shampoing MENTHOLÉ, 1 L.'));
let k = 0;
const lignes = lignesDepuisLaLecture(lu!, FICHES, () => `l${++k}`);
dit('les lignes : la fiche connue prete son nom et son dernier prix, la nouvelle attend le sien', [['Shampoing mentholé 1 L', 2000], ['Gel aloe 500 ml', null], ['Elastiques fins', null]],
  lignes.map((l) => [l.nom, l.prix]));
const consigne = consigneDeLAchat({ fiches: FICHES });
dit('la consigne : les fiches actives par leur identifiant, aucun prix invente, un produit vu deux fois une seule ligne', [true, false, true, true],
  [consigne.includes('- stk-a : Shampoing mentholé 1 L (consommable)'), consigne.includes('stk-x'), consigne.includes('N’invente aucun prix'), consigne.includes('Un même produit vu sur deux photos ne fait qu’une ligne')]);
dit('le schema exige les sept champs de chaque produit', ['photo', 'nom', 'famille', 'quantite', 'unite', 'cadre', 'ficheId'],
  ((SCHEMA_DE_L_ACHAT.properties as { produits: { items: { required: string[] } } }).produits.items.required));

/* ── ② LE COMPTEUR ET CE QUI MANQUE ─────────────────────────────────── */
const L = (id: string, quantite: number, prix: number | null, ficheId = '', nom = `Produit ${id}`) => ({ id, nom, famille: 'consommable' as const, unite: 'pièce', quantite, prix, ficheId });
dit('le compteur : aucune ligne, un prix a ecrire, le paye a ecrire, juste, il manque, il depasse', [
  'Aucune ligne : lisez les photos, ou ajoutez un produit.', 'Un prix reste à écrire.', 'Écrivez le montant payé.',
  'Le compte tombe juste : vous pouvez saisir.', 'Il manque 1 000 F de lignes : un article oublié, ou un prix à corriger.', 'Les lignes dépassent le payé de 500 F : une remise du fournisseur, ou un prix à corriger.',
], [
  compteurDeLAchat([], 1000).dit, compteurDeLAchat([L('a', 2, null)], 1000).dit, compteurDeLAchat([L('a', 2, 500)], 0).dit,
  compteurDeLAchat([L('a', 2, 500)], 1000).dit, compteurDeLAchat([L('a', 2, 500)], 2000).dit, compteurDeLAchat([L('a', 3, 500)], 1000).dit,
]);
dit('il ne tombe juste que si chaque prix est ecrit et l ecart nul ; zero est un prix ecrit', [true, false, true],
  [compteurDeLAchat([L('a', 2, 500)], 1000).juste, compteurDeLAchat([L('a', 2, 500), L('b', 1, null)], 1000).juste, compteurDeLAchat([L('a', 2, 500), L('b', 1, 0)], 1000).juste]);
const AUJ = '2026-11-01';
const base = (o: Partial<SaisieDAchat> = {}): SaisieDAchat => ({
  saisieId: 'sa-1', fournisseurId: 'frn-1', date: '2026-10-31', payeXof: 1000, caisse: 'Caisse Principale', avancee: false, porteur: 'Yeman', lignes: [L('a', 2, 500)], ...o,
});
dit('une saisie complete ne manque de rien', [], ceQuiManqueALAchat(base(), AUJ));
dit('tout ce qui manque se dit, dans l ordre de l ecran', ['le fournisseur', 'la date de l’achat', 'le montant payé', 'au moins un produit', 'la caisse', 'qui a fait l’achat'],
  ceQuiManqueALAchat(base({ fournisseurId: '', date: '2026-11-05', payeXof: 0, lignes: [], caisse: '', porteur: '' }), AUJ));
dit('... une ligne sans nom, sans quantite, sans prix', ['le nom de chaque produit', 'la quantité de chaque produit', 'le prix de chaque produit'],
  ceQuiManqueALAchat(base({ lignes: [L('a', 0, null, '', ' ')] }), AUJ));
dit('un nouveau fournisseur nomme suffit ; avance de sa poche, la caisse ne se demande pas', [[], []],
  [ceQuiManqueALAchat(base({ fournisseurId: '', nouveauFournisseur: { nom: 'Fournisseur neuf' } }), AUJ), ceQuiManqueALAchat(base({ caisse: '', avancee: true }), AUJ)]);
dit('un compte qui ne tombe pas juste empeche la saisie', ['des lignes qui font le montant payé'], ceQuiManqueALAchat(base({ payeXof: 1500 }), AUJ));

/* ── ③ LE PLAN ──────────────────────────────────────────────────────── */
const plan = planDeLAchat(base({
  fournisseurId: '', nouveauFournisseur: { nom: ' Fournisseur neuf ', telephone: ' +229 00 00 00 00 ' }, payeXof: 21000,
  lignes: [L('a', 6, 2500, 'stk-a'), L('b', 4, 3000, '', 'Gel aloe 500 ml'), L('c', 2, 1200, 'stk-b')],
}), { fiches: FICHES, fournisseurs: [{ id: 'frn-1', nom: 'Connu' }] });
dit('le plan : le fournisseur a creer, une fiche nouvelle, le prix du jour sur la fiche qui a change, rien sur celle qui n a pas change', [
  { creer: { nom: 'Fournisseur neuf', telephone: '+229 00 00 00 00' } }, ['Gel aloe 500 ml'], [{ ficheId: 'stk-a', nom: 'Shampoing mentholé 1 L', avantXof: 2000, apresXof: 2500 }],
], [plan.fournisseur, plan.nouvellesFiches.map((f) => f.nom), plan.prixMisAJour]);
dit('... le total, les unites, les articles de la depense', [29400, 12, ['Shampoing mentholé 1 L', 6, 2500, 15000]],
  [plan.totalXof, plan.unites, [plan.articles[0].label, plan.articles[0].qty, plan.articles[0].unitXof, plan.articles[0].amountXof]]);

/* ── ④ L'ÉCRITURE, PAR LES VRAIES PORTES DU STOCK ───────────────────── */
const BR = 'br-test';
const f1 = creerFournisseur(BR, { nom: 'Fournisseur connu' }).id as string;
const ficheA = creerProduitStock(BR, { nom: 'Shampoing mentholé 1 L', famille: 'consommable', unite: 'flacon', prixAchatXof: 2000 }, 0, '2026-10-01').id as string;
const saisie: SaisieDAchat = {
  saisieId: 'sa-essai', fournisseurId: f1, date: '2026-10-31', payeXof: 33500, caisse: 'Caisse Principale', avancee: false, porteur: 'Yeman',
  lignes: [L('a', 6, 2500, ficheA), L('b', 4, 3000, '', 'Gel aloe 500 ml'), { ...L('c', 5, 1300, '', 'Pinces crocodile'), famille: 'jetable' }],
};
const PHOTOS = [{ chemin: 'br-test/depense/x-1.jpg', nom: 'achat-1.jpg', type: 'image/jpeg', taille: 1000 }, { chemin: 'br-test/depense/x-2.jpg', nom: 'achat-2.jpg', type: 'image/jpeg', taille: 1000 }];
const mvtAvant = mouvementsStockStore.get().length;
const r = saisirLAchat(saisie, { branchId: BR, parNom: 'Yeman', role: 'souverain', photos: PHOTOS, aujourdhui: AUJ });
dit('C est saisi : ok, un numero de bon', [true, true], [r.ok, r.ok && /^BC-2026-\d{3}$/.test(r.numero)]);
const bc = commandesAchatStore.get().find((c) => c.saisieId === 'sa-essai');
const lignesBc = bc ? lignesDe(lignesAchatStore.get(), bc.id) : [];
dit('le bon nait recu, chez le fournisseur choisi, a la date de l achat, avec sa saisie, ses photos et sa depense', ['recue', f1, '2026-10-31', 2, 'exp-achat-sa-essai'],
  [bc?.statut, bc?.fournisseurId, bc?.dateCommande, bc?.photos?.length, bc?.depenseId]);
dit('... trois lignes au prix paye, recues en entier', [[6, 2500, 6], [4, 3000, 4], [5, 1300, 5]], lignesBc.map((l) => [l.quantiteCommandee, l.prixAchatUnitaireXof, l.quantiteRecue]));
const fichesBr = produitsStockStore.get().filter((p) => p.branchId === BR);
const gel = fichesBr.find((p) => p.nom === 'Gel aloe 500 ml');
const pinces = fichesBr.find((p) => p.nom === 'Pinces crocodile');
dit('deux fiches nouvelles, avec leur famille, leur prix d achat et le fournisseur ; la fiche connue au prix du jour', [
  ['PRD-CON-02', 3000, f1], ['PRD-JET-01', 1300, f1], 2500,
], [[gel?.code, gel?.prixAchatXof, gel?.fournisseurId], [pinces?.code, pinces?.prixAchatXof, pinces?.fournisseurId], fichesBr.find((p) => p.id === ficheA)?.prixAchatXof]);
dit('le stock monte de ce qui a ete achete, en trois entrees signees du numero du bon', [[6, 4, 5], 3, true],
  [[stockDe(ficheA, mouvementsStockStore.get()), stockDe(gel?.id ?? '', mouvementsStockStore.get()), stockDe(pinces?.id ?? '', mouvementsStockStore.get())],
    mouvementsStockStore.get().length - mvtAvant, mouvementsStockStore.get().slice(mvtAvant).every((m) => m.type === 'entree_achat' && m.reference === bc?.numero)]);
const dep = expensesStore.get().find((e) => e.id === 'exp-achat-sa-essai');
dit('la depense Matieres premieres : le total, la caisse, le porteur, trois articles, la premiere photo, acquise pour un souverain', [
  33500, 'Matières premières', 'Caisse Principale', 'Yeman', 3, 'br-test/depense/x-1.jpg', undefined, true,
], [dep?.amountXof, dep?.category, dep?.cashbox, dep?.porteur, dep?.items?.length, dep?.fichier?.chemin, dep?.validation, (dep?.label ?? '').endsWith(bc?.numero ?? '?')]);
dit('le resume dit les six choses ecrites', 6, r.ok ? r.resume.length : 0);

/* Une seule fois. */
const avant = [mouvementsStockStore.get().length, expensesStore.get().length, commandesAchatStore.get().length];
const r2 = saisirLAchat(saisie, { branchId: BR, parNom: 'Yeman', role: 'souverain', photos: PHOTOS, aujourdhui: AUJ });
dit('un second C est saisi de la meme saisie ne refait rien, et le dit', [false, true, avant],
  [r2.ok, !r2.ok && /déjà saisi/.test(r2.erreur), [mouvementsStockStore.get().length, expensesStore.get().length, commandesAchatStore.get().length]]);

/* Ce qui manque n'écrit rien. */
const r3 = saisirLAchat({ ...saisie, saisieId: 'sa-incomplete', payeXof: 1 }, { branchId: BR, parNom: 'Yeman', role: 'souverain', photos: [], aujourdhui: AUJ });
dit('une saisie incomplete est refusee avant toute ecriture', [false, avant], [r3.ok, [mouvementsStockStore.get().length, expensesStore.get().length, commandesAchatStore.get().length]]);

/* Un compte qui soumet ; l'avance de sa poche ; un fournisseur neuf. */
const r4 = saisirLAchat({
  ...saisie, saisieId: 'sa-maitre', fournisseurId: '', nouveauFournisseur: { nom: 'Fournisseur neuf' }, caisse: '', avancee: true, porteur: 'S.',
  payeXof: 2500, lignes: [L('z', 1, 2500, ficheA)],
}, { branchId: BR, parNom: 'S.', role: 'maitre', photos: [], aujourdhui: AUJ });
const dep4 = expensesStore.get().find((e) => e.id === 'exp-achat-sa-maitre');
dit('un maitre : le stock entre, la depense attend la validation de la direction, soumise de son nom', [true, 'attente', 'S.'], [r4.ok, dep4?.validation?.etat, dep4?.validation?.soumisPar]);
dit('... avancee de sa poche : aucune caisse, avancee marquee ; le fournisseur neuf cree au repertoire', ['', true, true],
  [dep4?.cashbox, dep4?.avancee, fournisseursStore.get().some((f) => f.branchId === BR && f.nom === 'Fournisseur neuf' && /^FRN-\d{2}$/.test(f.code))]);

/* ── ⑤ LA PORTE VERS CLAUDE ET LES ÉCRANS ───────────────────────────── */
dit('le chantier achat existe, ouvert a la vente et aux finances, a la direction toujours, aux autres non', [true, ['dept-vente-caisse', 'dept-finances'], true, true, false],
  [(CHANTIERS_IA as readonly string[]).includes('achat'), DEPARTEMENTS_PAR_CHANTIER.achat, peutDemander('souverain', 'achat', {}), peutDemander('maitre', 'achat', { 'dept-vente-caisse': true }), peutDemander('maitre', 'achat', { 'dept-atelier': true })]);
dit('le Trone ne propose la lecture qu a une fonction qui sait l achat', [false, true], [saitLAchatParPhotos('2026-10-24-a'), saitLAchatParPhotos('2026-11-01-a')]);
const pur = lf(readFileSync('src/shared/ia-maison-pur.ts', 'utf8'));
const fonction = lf(readFileSync('supabase/functions/ia-maison/index.ts', 'utf8'));
const bloc = (t: string) => { const a = t.indexOf('/* ⟨ia-maison⟩ */'); const b = t.indexOf('/* ⟨/ia-maison⟩ */'); return a < 0 || b < 0 ? null : t.slice(a, b); };
dit('la fonction ia-maison porte le meme bloc que le depot, et dit 2026-11-01-a', [true, true], [!!bloc(pur) && bloc(pur) === bloc(fonction), fonction.includes("const VERSION = '2026-11-01-a';")]);
const ecran = sansCommentaires('src/apps/trone/routes/vente/SaisirUnAchat.tsx');
dit('l ecran lit par le chantier achat avec le schema, et ecrit par saisirLAchat seulement', [true, true, true, false],
  [ecran.includes('chantier: CHANTIER_DE_L_ACHAT, usage: USAGE_DE_L_ACHAT'), ecran.includes('schema: SCHEMA_DE_L_ACHAT'), ecran.includes('const r = saisirLAchat(saisie,'), /creerCommande|recevoirLigne|expensesStore/.test(ecran)]);
dit('... les photos partent au coffre des pieces des depenses avant l ecriture', true, ecran.includes("await deposerFichier(branch.id, p.fichier, 'depense')"));
const stock = sansCommentaires('src/apps/trone/routes/vente/HomeRituals.tsx');
dit('Stock et Achats porte l onglet Saisir un achat', [true, true], [stock.includes("setOnglet('saisir')}>Saisir un achat</Chip>"), stock.includes("{onglet === 'saisir' && <SaisirUnAchat")]);

console.log(`\n${n - ko}/${n} epreuves : l achat se saisit en un geste, une seule fois.`);
if (ko) console.log(`${ko} ECHEC(S).`);
