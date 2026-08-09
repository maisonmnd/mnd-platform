/* LA BOUCLE DE STOCK, ÉPROUVÉE. Réception → le stock monte ; vente et
   prestation → il baisse ; annulation → il rembobine ; réappro → la liste est
   juste. Lancé par `node scripts/verifie-stock.mjs` — voir ce fichier. */
import {
  fournisseursStore, produitsStockStore, mouvementsStockStore,
  commandesAchatStore, lignesAchatStore, consommationsStore,
  creerFournisseur, creerProduitStock, creerCommande, ajouterLigneCommande,
  envoyerCommande, annulerCommande, recevoirLigne, lignesDe,
  venteGamme, consommerPourRituel, rembobinerRituel,
  ajusterStock, declarerPerte, corrigerStockGamme, reprendreGamme,
  stockDe, margePct, coutMatiereXof, reappro, reliquat, statutLigne,
  totalCommande, poserRecette,
} from '../src/shared/stock';
import { productsStore } from '../src/shared/catalog';

const J = '2026-08-09';
const BR = 'br';
let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const stock = (id: string) => stockDe(id, mouvementsStockStore.get());

/* ── LA BASCULE DE LA GAMME — rien ne se perd, rien ne se duplique ── */
productsStore.set(() => [
  { id: 'g1', categoryId: 'home-rituals', name: 'Vapo Hydra Mist', priceXof: 8000, stock: 5, order: 1 },
  { id: 'g2', categoryId: 'home-rituals', name: 'Sérum Racines', priceXof: 12000, stock: 3, order: 2 },
]);
dit('la bascule crée une fiche par produit Gamme', 2, reprendreGamme(BR, J));
const fiches = produitsStockStore.get();
dit('… avec des codes stables', ['PRD-REV-01', 'PRD-REV-02'], fiches.map((f) => f.code));
dit('… et le stock affiché devient un mouvement', 5, stock(fiches[0].id));
dit('… nommé pour ce qu’il est', 'Inventaire initial', mouvementsStockStore.get()[0].note);
dit('relancée, la bascule ne crée RIEN', 0, reprendreGamme(BR, J));

/* La marge se lit sur la fiche Gamme liée — le prix d'achat reste ici. */
produitsStockStore.set((prev) => prev.map((p) => (p.id === fiches[0].id ? { ...p, prixAchatXof: 3000 } : p)));
dit('la marge : (8000 − 3000) / 8000', 63, margePct(produitsStockStore.get()[0], productsStore.get()));

/* ── COMPORTEMENT B — la vente d'un produit Gamme ── */
dit('la vente écrit un mouvement', true, venteGamme('g1', 2, 'F-2026-001', J));
dit('… le stock baisse', 3, stock(fiches[0].id));
dit('… et le MIROIR de la vitrine suit', 3, productsStore.get().find((g) => g.id === 'g1')?.stock);
dit('un produit sans fiche liée rend la main', false, venteGamme('g-inconnu', 1, 'F-2026-002', J));

/* Le +/− des écrans Gamme devient un ajustement tracé. */
dit('corriger depuis la Gamme passe par le journal', true, corrigerStockGamme('g1', 10, 'Recomptage', J));
dit('… stock dérivé', 10, stock(fiches[0].id));
dit('… miroir', 10, productsStore.get().find((g) => g.id === 'g1')?.stock);

/* ── FOURNISSEURS & FICHES ── */
const f1 = creerFournisseur(BR, { nom: 'Karité & Co', telephone: '+229 01 61 00 00 00' });
const f2 = creerFournisseur(BR, { nom: 'Mèches du Golfe' });
dit('les codes fournisseurs se suivent', ['FRN-01', 'FRN-02'], fournisseursStore.get().map((f) => f.code));
dit('un fournisseur sans nom est refusé', false, creerFournisseur(BR, { nom: '  ' }).ok);

const shamp = creerProduitStock(BR, { nom: 'Shampoing doux', famille: 'consommable', unite: 'ml', prixAchatXof: 20, fournisseurId: f1.id, seuilAlerte: 100, stockCible: 800 }, 500, J);
const masque = creerProduitStock(BR, { nom: 'Masque 7 huiles', famille: 'consommable', unite: 'g', prixAchatXof: 50, fournisseurId: f1.id, seuilAlerte: 50, stockCible: 300 }, 200, J);
dit('les codes suivent la famille', ['PRD-CON-01', 'PRD-CON-02'],
  produitsStockStore.get().filter((p) => p.famille === 'consommable').map((p) => p.code));
dit('lier un consommable à la Gamme est refusé', false,
  creerProduitStock(BR, { nom: 'X', famille: 'consommable', unite: 'ml', catalogProductId: 'g1' }, 0, J).ok);
const shampId = shamp.id!;
const masqueId = masque.id!;

/* ── COMPORTEMENT E — le coût matière ── */
const p = (id: string) => produitsStockStore.get().find((x) => x.id === id)!;
poserRecette(BR, 'svc-kloklo', p(shampId), 50);
poserRecette(BR, 'svc-kloklo', p(masqueId), 30);
dit('le coût matière : 50×20 + 30×50', 2500,
  coutMatiereXof('svc-kloklo', consommationsStore.get(), produitsStockStore.get()));
poserRecette(BR, 'svc-kloklo', p(masqueId), 40);
dit('reposer une recette REMPLACE la ligne', 2, consommationsStore.get().filter((c) => c.serviceId === 'svc-kloklo').length);
poserRecette(BR, 'svc-kloklo', p(masqueId), 30);

/* ── COMPORTEMENT C — la prestation encaissée ── */
dit('le rituel consomme sa recette', 2,
  consommerPourRituel({ id: 'a1', branchId: BR, serviceIds: ['svc-kloklo', 'svc-sans-recette'] }, J));
dit('… le shampoing baisse', 450, stock(shampId));
dit('… le masque aussi', 170, stock(masqueId));
dit('ré-encaisser ne consomme PAS deux fois', 0,
  consommerPourRituel({ id: 'a1', branchId: BR, serviceIds: ['svc-kloklo'] }, J));
dit('un service sans recette ne consomme rien, sans erreur', 0,
  consommerPourRituel({ id: 'a2', branchId: BR, serviceIds: ['svc-sans-recette'] }, J));
dit('l’annulation rembobine', 2, rembobinerRituel('a1'));
dit('… et la réserve remonte', 500, stock(shampId));
dit('rembobiner deux fois ne fait rien', 0, rembobinerRituel('a1'));

/* Deux fois le même geste dans un rituel = deux fois sa recette. */
consommerPourRituel({ id: 'a3', branchId: BR, serviceIds: ['svc-kloklo', 'svc-kloklo'] }, J);
dit('un geste doublé consomme double', 400, stock(shampId));
rembobinerRituel('a3');

/* ── COMPORTEMENT A — le cycle d'achat ── */
const bc = creerCommande(BR, f1.id!, J);
dit('le numéro porte l’année', 'BC-2026-001', commandesAchatStore.get()[0].numero);
dit('un bon vide ne s’envoie pas', false, envoyerCommande(commandesAchatStore.get()[0]).ok);
ajouterLigneCommande(commandesAchatStore.get()[0], p(shampId), 100);
ajouterLigneCommande(commandesAchatStore.get()[0], p(masqueId), 40);
dit('le total du bon : 100×20 + 40×50', 4000, totalCommande(lignesDe(lignesAchatStore.get(), bc.id!)));
const ligneShamp = () => lignesAchatStore.get().find((l) => l.commandeId === bc.id && l.produitId === shampId)!;
const ligneMasque = () => lignesAchatStore.get().find((l) => l.commandeId === bc.id && l.produitId === masqueId)!;
dit('recevoir un brouillon est refusé', false, recevoirLigne(ligneShamp(), 10, J).ok);
dit('le bon s’envoie', true, envoyerCommande(commandesAchatStore.get()[0]).ok);
dit('ajouter une ligne à un bon parti est refusé', false,
  ajouterLigneCommande(commandesAchatStore.get()[0], p(shampId), 5).ok);

dit('la réception écrit l’entrée', true, recevoirLigne(ligneShamp(), 60, J).ok);
dit('… LE STOCK MONTE', 560, stock(shampId));
dit('… le mouvement porte le n° du bon', 'BC-2026-001',
  mouvementsStockStore.get().filter((m) => m.type === 'entree_achat').slice(-1)[0]?.reference);
dit('… le bon passe Partielle', 'partielle', commandesAchatStore.get()[0].statut);
dit('… le reliquat le dit', 40, reliquat(ligneShamp()));
recevoirLigne(ligneShamp(), 40, J);
dit('sa ligne est reçue, le bon reste Partielle', 'partielle', commandesAchatStore.get()[0].statut);
dit('la SUR-réception est tolérée', true, recevoirLigne(ligneMasque(), 45, J).ok);
dit('… la ligne est reçue', 'recue', statutLigne(ligneMasque()));
dit('… et le bon aussi', 'recue', commandesAchatStore.get()[0].statut);
dit('recevoir sur un bon clos est refusé', false, recevoirLigne(ligneShamp(), 1, J).ok);

/* Annuler : jamais après une réception. */
const bc2 = creerCommande(BR, f2.id!, J);
const cmd2 = () => commandesAchatStore.get().find((c) => c.id === bc2.id)!;
ajouterLigneCommande(cmd2(), p(masqueId), 10);
envoyerCommande(cmd2());
recevoirLigne(lignesAchatStore.get().find((l) => l.commandeId === bc2.id)!, 5, J);
dit('un bon partiellement reçu ne s’annule pas', false, annulerCommande(cmd2()).ok);
const bc3 = creerCommande(BR, f2.id!, J);
dit('un brouillon jamais reçu s’annule', true,
  annulerCommande(commandesAchatStore.get().find((c) => c.id === bc3.id)!).ok);

/* ── COMPORTEMENT D — le réapprovisionnement ── */
const henne = creerProduitStock(BR, { nom: 'Henné', famille: 'consommable', unite: 'g', prixAchatXof: 100, fournisseurId: f2.id, seuilAlerte: 10, stockCible: 50 }, 4, J);
const groupes = reappro(produitsStockStore.get(), mouvementsStockStore.get(), BR);
const duF2 = groupes.get(f2.id!) ?? [];
dit('le henné sous seuil est listé chez SON fournisseur', ['Henné'], duF2.map((l) => l.produit.nom));
dit('… quantité à commander : cible − stock', 46, duF2[0]?.aCommander);
dit('… coût estimé : 46 × 100', 4600, duF2[0]?.coutEstimeXof);
dit('le shampoing, au-dessus du seuil, n’y est PAS',
  false, [...groupes.values()].flat().some((l) => l.produit.id === shampId));

/* ── AJUSTEMENT & PERTE ── */
dit('ajuster écrit l’écart', true, ajusterStock(p(henne.id!), 12, 'Inventaire du soir', J).ok);
dit('… stock', 12, stock(henne.id!));
dit('ajuster à l’identique est refusé', false, ajusterStock(p(henne.id!), 12, '', J).ok);
dit('la perte se déclare', true, declarerPerte(p(henne.id!), 2, 'Pot renversé', J).ok);
dit('… stock', 10, stock(henne.id!));
dit('une perte nulle est refusée', false, declarerPerte(p(henne.id!), 0, '', J).ok);

/* ── LA RÈGLE D'OR, PAR CONSTRUCTION ── */
dit('AUCUNE fiche ne porte de champ « stock »', false,
  produitsStockStore.get().some((x) => 'stock' in (x as Record<string, unknown>)));
dit('ni de prix de vente', false,
  produitsStockStore.get().some((x) => 'prixVenteXof' in (x as Record<string, unknown>)));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
