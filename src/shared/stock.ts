import { createStore, useStore, uid } from './store';
import { productsStore, type Product } from './catalog';

/* LE STOCK & LES ACHATS — le compagnon du catalogue.

   Quatre questions simples : qu'ai-je en stock, que dois-je racheter, combien
   me coûte chaque prestation, et combien je gagne sur ce que je revends.

   ── LA RÈGLE D'OR ────────────────────────────────────────────────────
   LE STOCK NE SE STOCKE PAS. Il n'existe aucun champ « stock actuel » dans ce
   module : la quantité en rayon est LA SOMME DES MOUVEMENTS du journal, et
   l'inventaire initial est lui-même un mouvement. Un total tenu à côté du
   journal finirait par ne plus lui correspondre, et personne ne saurait lequel
   croire — c'est déjà la règle des points du Cercle et de la ventilation des
   rendez-vous.

   ── POURQUOI UN REGISTRE SÉPARÉ DE LA GAMME ─────────────────────────
   `catalog_products` est la vitrine : Ma Couronne la lit, une cliente connectée
   peut donc lire chacune de ses lignes. Le prix d'ACHAT et la marge n'ont rien
   à y faire — la RLS ne sait pas cacher un champ à l'intérieur du JSON. Les
   fiches d'inventaire vivent donc dans des tables réservées au personnel, et
   une fiche REVENTE pointe vers sa fiche Gamme (`catalogProductId`), qui garde
   seule le prix de vente.

   Conséquence structurelle : « seuls les produits REVENTE ont un prix de
   vente » n'est pas une validation, c'est une impossibilité — le prix de vente
   n'existe pas ici, il se lit sur la fiche Gamme liée.

   ── LE MIROIR DE LA VITRINE ─────────────────────────────────────────
   L'écran de la Gamme et Ma Couronne (« Dernières pièces ») lisent le champ
   `stock` de la fiche Gamme. Ce champ devient un MIROIR : chaque mouvement qui
   touche une fiche REVENTE liée le réécrit depuis le journal. Personne d'autre
   ne doit l'écrire — c'est le journal qui parle, le miroir répète. */

export type FamilleProduit = 'revente' | 'consommable' | 'meches' | 'jetable';

export const FAMILLES: Record<FamilleProduit, { code: string; nom: string; dit: string }> = {
  revente: { code: 'PRD-REV', nom: 'Revente', dit: 'Vendu tel quel à la cliente — le prix de vente vit sur sa fiche Gamme.' },
  consommable: { code: 'PRD-CON', nom: 'Consommable', dit: 'Utilisé pendant les soins. Un coût par prestation, jamais un prix.' },
  meches: { code: 'PRD-MEC', nom: 'Mèches', dit: 'Les extensions du Studio, comptées au paquet.' },
  jetable: { code: 'PRD-JET', nom: 'Jetable', dit: 'Gants, aiguilles, coton — le petit matériel qui part vite.' },
};

export type Fournisseur = {
  id: string;
  branchId: string;
  code: string; // FRN-01
  nom: string;
  telephone?: string;
  /** Ce qu'il fournit, en toutes lettres — de quoi savoir qui appeler. */
  produitsFournis?: string;
  delaiJours?: number;
  conditionsPaiement?: string;
  actif: boolean;
};

export type ProduitStock = {
  id: string;
  branchId: string;
  code: string; // PRD-REV-01 — stable, jamais renuméroté
  nom: string;
  famille: FamilleProduit;
  sousFamille?: string;
  unite: string; // ml, g, pièce, paquet…
  conditionnement?: string;
  /** Ce que le produit COÛTE. Jamais lisible par une cliente — voir l'en-tête. */
  prixAchatXof: number;
  fournisseurId?: string;
  /** Sous ce nombre, la fiche passe À COMMANDER. */
  seuilAlerte: number;
  /** La quantité à retrouver en commandant : cible − stock = à commander. */
  stockCible: number;
  emplacement?: string;
  actif: boolean;
  /** REVENTE seulement : la fiche Gamme qui porte le prix de vente. */
  catalogProductId?: string;
  /** L'ingrédient du Laboratoire que cette fiche incarne — le lien qui rend la
      réserve des formules réelle. Voir shared/laboratoire.ts. */
  labIngredient?: string;
};

export type TypeMouvement = 'entree_achat' | 'sortie_vente' | 'sortie_service' | 'fabrication' | 'ajustement' | 'perte';

export const MOUVEMENT_NOMS: Record<TypeMouvement, string> = {
  entree_achat: 'Entrée · achat',
  sortie_vente: 'Sortie · vente',
  sortie_service: 'Sortie · service',
  fabrication: 'Sortie · fabrication',
  ajustement: 'Ajustement',
  perte: 'Perte',
};

export type MouvementStock = {
  id: string;
  branchId: string;
  date: string; // ISO jour
  type: TypeMouvement;
  produitId: string;
  /** SIGNÉE : positive quand le stock monte, négative quand il sort. */
  quantite: number;
  /** N° de BC, de facture, ou `rdv:<id>` — ce qui explique le mouvement. */
  reference?: string;
  note?: string;
};

export type StatutCommande = 'brouillon' | 'envoyee' | 'partielle' | 'recue' | 'annulee';

export const COMMANDE_NOMS: Record<StatutCommande, string> = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée',
  partielle: 'Partielle',
  recue: 'Reçue',
  annulee: 'Annulée',
};

export type CommandeFournisseur = {
  id: string;
  branchId: string;
  numero: string; // BC-2026-001
  dateCommande: string;
  fournisseurId: string;
  statut: StatutCommande;
  dateReceptionPrevue?: string;
  note?: string;
};

export type LigneCommande = {
  id: string;
  branchId: string;
  commandeId: string;
  produitId: string;
  quantiteCommandee: number;
  /** Figé à la commande : le prix d'achat du jour peut bouger ensuite. */
  prixAchatUnitaireXof: number;
  quantiteRecue: number;
};

/** La recette d'un service — ce qu'une prestation consomme, en quantités connues. */
export type Consommation = {
  id: string;
  branchId: string;
  serviceId: string; // catalog_services
  produitId: string;
  quantite: number;
  unite: string;
};

/* ---------- Magasins ---------- */

export const fournisseursStore = createStore<Fournisseur[]>('mnd_fournisseurs', []);
export const produitsStockStore = createStore<ProduitStock[]>('mnd_stock_produits', []);
export const mouvementsStockStore = createStore<MouvementStock[]>('mnd_stock_mouvements', []);
export const commandesAchatStore = createStore<CommandeFournisseur[]>('mnd_achats_commandes', []);
export const lignesAchatStore = createStore<LigneCommande[]>('mnd_achats_lignes', []);
export const consommationsStore = createStore<Consommation[]>('mnd_consommations', []);

export const useFournisseurs = () => useStore(fournisseursStore);
export const useProduitsStock = () => useStore(produitsStockStore);
export const useMouvementsStock = () => useStore(mouvementsStockStore);
export const useCommandesAchat = () => useStore(commandesAchatStore);
export const useLignesAchat = () => useStore(lignesAchatStore);
export const useConsommations = () => useStore(consommationsStore);

/* ---------- Lire une quantité comme on l'écrit au Bénin ---------- */

/** « 2,5 » vaut 2,5 et « 1 900 » vaut 1900. `parseFloat` s'arrêtait à la
    virgule comme à l'espace des milliers : le Bain Détox se composait avec
    1 ml d'eau au lieu de 1 900, sans un mot. NaN si rien de lisible. */
export const litQuantite = (s: string): number => {
  const n = parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/* ---------- Le stock se DÉRIVE ---------- */

/** Les quantités fractionnaires (0,5 ml d'huile essentielle) s'accumulent en
    flottants : sans arrondi, 0,3 − 3×0,1 rend 5,5e-17 — « En réserve ✓ » sur
    un affichage à 0. Trois décimales suffisent à tous les gestes du salon. */
const arrondiStock = (x: number): number => Math.round(x * 1000) / 1000;

/** Tous les stocks d'un coup — une passe sur le journal, à mémoïser à l'écran. */
export function stocksParProduit(mouvements: MouvementStock[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mv of mouvements) m.set(mv.produitId, (m.get(mv.produitId) ?? 0) + mv.quantite);
  for (const [k, v] of m) m.set(k, arrondiStock(v));
  return m;
}

export const stockDe = (produitId: string, mouvements: MouvementStock[]): number =>
  arrondiStock(mouvements.reduce((s, m) => (m.produitId === produitId ? s + m.quantite : s), 0));

/** Le prix de vente d'une fiche d'inventaire — celui de sa fiche Gamme liée. */
export const prixVenteDe = (p: ProduitStock, gamme: Product[]): number | undefined => {
  if (p.famille !== 'revente' || !p.catalogProductId) return undefined;
  return gamme.find((g) => g.id === p.catalogProductId)?.priceXof;
};

/** (vente − achat) / vente — indéfinie sans prix de vente. */
export const margePct = (p: ProduitStock, gamme: Product[]): number | undefined => {
  const vente = prixVenteDe(p, gamme);
  if (!vente || vente <= 0) return undefined;
  return Math.round(((vente - p.prixAchatXof) / vente) * 100);
};

export const aCommander = (p: ProduitStock, stock: number): boolean => stock <= p.seuilAlerte;

/* ---------- Lignes de commande — tout se calcule ---------- */

export const coutLigne = (l: LigneCommande): number => l.quantiteCommandee * l.prixAchatUnitaireXof;
export const reliquat = (l: LigneCommande): number => Math.max(0, l.quantiteCommandee - l.quantiteRecue);
export const statutLigne = (l: LigneCommande): 'en_attente' | 'partielle' | 'recue' =>
  l.quantiteRecue <= 0 ? 'en_attente' : l.quantiteRecue >= l.quantiteCommandee ? 'recue' : 'partielle';

export const lignesDe = (lignes: LigneCommande[], commandeId: string): LigneCommande[] =>
  lignes.filter((l) => l.commandeId === commandeId);

export const totalCommande = (lignes: LigneCommande[]): number =>
  lignes.reduce((s, l) => s + coutLigne(l), 0);
export const totalRecu = (lignes: LigneCommande[]): number =>
  lignes.reduce((s, l) => s + Math.min(l.quantiteRecue, l.quantiteCommandee) * l.prixAchatUnitaireXof, 0);

/* ---------- Réapprovisionnement (comportement D) ---------- */

export type LigneReappro = {
  produit: ProduitStock;
  stock: number;
  aCommander: number; // cible − stock, jamais négative
  coutEstimeXof: number;
};

/** Ce qui manque, groupé par fournisseur — la liste de courses se fait seule.
    La clé '' rassemble les fiches sans fournisseur : elles se voient aussi,
    sinon un produit orphelin resterait en rupture sans jamais être commandé. */
export function reappro(
  produits: ProduitStock[],
  mouvements: MouvementStock[],
  branchId: string,
): Map<string, LigneReappro[]> {
  const stocks = stocksParProduit(mouvements);
  const groupes = new Map<string, LigneReappro[]>();
  for (const p of produits) {
    if (p.branchId !== branchId || !p.actif) continue;
    const stock = stocks.get(p.id) ?? 0;
    if (!aCommander(p, stock)) continue;
    const quantite = Math.max(0, p.stockCible - stock);
    if (quantite <= 0) continue;
    const cle = p.fournisseurId ?? '';
    const liste = groupes.get(cle) ?? [];
    liste.push({ produit: p, stock, aCommander: quantite, coutEstimeXof: quantite * p.prixAchatXof });
    groupes.set(cle, liste);
  }
  for (const liste of groupes.values()) liste.sort((a, b) => a.produit.code.localeCompare(b.produit.code));
  return groupes;
}

/* ---------- Coût matière d'un service (comportement E) ---------- */

/** Σ quantité × prix d'achat — ce que la prestation consomme réellement.
    Sans recette : zéro, sans erreur. Comparé au prix du service, il donne la
    marge nette : une Tresse Nuage à 4 paquets, c'est 6 000 F de mèches sur un
    service à 36 000. */
export function coutMatiereXof(
  serviceId: string,
  consommations: Consommation[],
  produits: ProduitStock[],
  branchId?: string,
): number {
  let total = 0;
  for (const c of consommations) {
    if (c.serviceId !== serviceId) continue;
    if (branchId && c.branchId !== branchId) continue;
    const p = produits.find((x) => x.id === c.produitId);
    if (p) total += c.quantite * p.prixAchatXof;
  }
  return total;
}

/* ---------- Codes & numéros — stables, jamais renumérotés ---------- */

/* ANCRÉ DE BOUT EN BOUT : « BC-2026-001-bis » ou tout code suffixé ne nourrit
   pas le compteur — la leçon des numéros de facture dupliqués, réapprise ici
   plutôt que revécue. */
const numeroSuivant = (codes: string[], prefixe: string): number => {
  const motif = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  return codes.reduce((m, c) => {
    const trouve = motif.exec(c);
    if (!trouve) return m;
    const n = parseInt(trouve[1], 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0) + 1;
};

export const prochainCodeProduit = (famille: FamilleProduit, produits: ProduitStock[], branchId: string): string => {
  const prefixe = FAMILLES[famille].code;
  const n = numeroSuivant(produits.filter((p) => p.branchId === branchId).map((p) => p.code), prefixe);
  return `${prefixe}-${String(n).padStart(2, '0')}`;
};

export const prochainCodeFournisseur = (fournisseurs: Fournisseur[], branchId: string): string => {
  const n = numeroSuivant(fournisseurs.filter((f) => f.branchId === branchId).map((f) => f.code), 'FRN');
  return `FRN-${String(n).padStart(2, '0')}`;
};

export const prochainNumeroBC = (commandes: CommandeFournisseur[], branchId: string, annee: string): string => {
  const prefixe = `BC-${annee}`;
  const n = numeroSuivant(commandes.filter((c) => c.branchId === branchId).map((c) => c.numero), prefixe);
  return `${prefixe}-${String(n).padStart(3, '0')}`;
};

/* ---------- Le miroir de la vitrine ---------- */

/** Réécrit le champ `stock` des fiches Gamme liées depuis le journal — la
    SOMME de toutes les fiches liées, toutes branches : la vitrine n'a pas de
    branche. `cibles` restreint aux produits Gamme touchés ; absent, tout le
    miroir est recalculé. */
function recalculeMiroir(cibles?: Set<string>): void {
  const produits = produitsStockStore.get();
  const lies = produits.filter((p) => p.catalogProductId && (!cibles || cibles.has(p.catalogProductId)));
  if (!lies.length) return;
  const stocks = stocksParProduit(mouvementsStockStore.get());
  const totaux = new Map<string, number>();
  for (const p of lies) {
    totaux.set(p.catalogProductId!, arrondiStock((totaux.get(p.catalogProductId!) ?? 0) + (stocks.get(p.id) ?? 0)));
  }
  productsStore.set((prev) => {
    let change = false;
    const next = prev.map((g) => {
      const total = totaux.get(g.id);
      if (total === undefined || g.stock === total) return g;
      change = true;
      return { ...g, stock: total };
    });
    return change ? next : prev;
  });
}

const catalogDe = (produitIds: Iterable<string>): Set<string> => {
  const voulus = new Set(produitIds);
  const s = new Set<string>();
  for (const p of produitsStockStore.get()) {
    if (p.catalogProductId && voulus.has(p.id)) s.add(p.catalogProductId);
  }
  return s;
};

/** ÉCRITURE EN LOT — un seul passage au magasin, une seule poussée de synchro,
    et le miroir recalculé pour les produits touchés. C'est la SEULE porte
    d'écriture du journal : le Laboratoire l'emprunte aussi, au lieu de pousser
    lui-même et d'oublier le miroir. */
export function ecrireMouvements(liste: Omit<MouvementStock, 'id'>[]): void {
  if (!liste.length) return;
  mouvementsStockStore.set((prev) => [...prev, ...liste.map((m) => ({ id: `mvt-${uid()}`, ...m }))]);
  recalculeMiroir(catalogDe(liste.map((m) => m.produitId)));
}

const ecrireMouvement = (m: Omit<MouvementStock, 'id'>): void => ecrireMouvements([m]);

/** LE REMBOBINAGE PAR RÉFÉRENCE — la primitive commune. Un rituel dés-honoré
    (`rdv:<id>`), une fabrication annulée (`prep:<id>`), une facture supprimée
    (son numéro) : trois gestes, une seule mécanique, et le miroir suit. Rend
    le nombre de mouvements retirés. */
export function retirerParReferences(refs: string[]): number {
  const cibles = new Set(refs.filter(Boolean));
  if (!cibles.size) return 0;
  /* POSTE FROID : le journal local peut ignorer des mouvements que le serveur
     porte déjà sous ces références. On retire ce qu'on voit, ET on se note de
     REPASSER après la première lecture — sinon le rembobinage laisse des
     lignes orphelines que plus rien ne viendra jamais chercher. */
  if (journalFroid()) mettreEnAttente({ k: 'retrait', refs: [...cibles] });
  const avant = mouvementsStockStore.get();
  const vises = avant.filter((m) => m.reference && cibles.has(m.reference));
  if (!vises.length) return 0;
  mouvementsStockStore.set(() => avant.filter((m) => !m.reference || !cibles.has(m.reference)));
  recalculeMiroir(catalogDe(vises.map((m) => m.produitId)));
  return vises.length;
}

/* LE MIROIR SUIT LE JOURNAL, D'OÙ QUE LE JOURNAL CHANGE. Les écritures locales
   passent par les primitives ci-dessus ; mais le journal bouge AUSSI par la
   synchronisation — hydratation, refetch, Realtime — et le miroir restait
   alors figé sur le compte de l'autre poste. Un recalcul complet, décalé d'un
   souffle pour absorber les rafales. */
let miroirPrevu: ReturnType<typeof setTimeout> | undefined;
const replanifieMiroir = (): void => {
  if (miroirPrevu !== undefined) clearTimeout(miroirPrevu);
  miroirPrevu = setTimeout(() => { miroirPrevu = undefined; recalculeMiroir(); }, 250);
};

/* ---------- Fiches — création & corrections ---------- */

export function creerFournisseur(
  branchId: string,
  champs: Pick<Fournisseur, 'nom'> & Partial<Omit<Fournisseur, 'id' | 'branchId' | 'code' | 'actif'>>,
): { ok: boolean; erreur?: string; id?: string } {
  const nom = champs.nom.trim();
  if (!nom) return { ok: false, erreur: 'Il manque son nom.' };
  const id = `frn-${uid()}`;
  const code = prochainCodeFournisseur(fournisseursStore.get(), branchId);
  fournisseursStore.set((prev) => [...prev, {
    id, branchId, code, nom,
    telephone: champs.telephone?.trim() || undefined,
    produitsFournis: champs.produitsFournis?.trim() || undefined,
    delaiJours: champs.delaiJours,
    conditionsPaiement: champs.conditionsPaiement?.trim() || undefined,
    actif: true,
  }]);
  return { ok: true, id };
}

export function creerProduitStock(
  branchId: string,
  champs: Pick<ProduitStock, 'nom' | 'famille' | 'unite'>
    & Partial<Omit<ProduitStock, 'id' | 'branchId' | 'code' | 'actif'>>,
  stockInitial: number,
  date: string,
): { ok: boolean; erreur?: string; id?: string } {
  const nom = champs.nom.trim();
  if (!nom) return { ok: false, erreur: 'Il manque son nom.' };
  if (!champs.unite.trim()) return { ok: false, erreur: 'Il manque son unité (ml, g, pièce…).' };
  if (!(champs.famille in FAMILLES)) return { ok: false, erreur: 'Famille inconnue.' };
  if ((champs.prixAchatXof ?? 0) < 0) return { ok: false, erreur: 'Un prix d’achat ne peut pas être négatif.' };
  if (champs.catalogProductId && champs.famille !== 'revente') {
    return { ok: false, erreur: 'Seule une fiche Revente se lie à la Gamme.' };
  }
  const id = `stk-${uid()}`;
  produitsStockStore.set((prev) => [...prev, {
    id, branchId,
    code: prochainCodeProduit(champs.famille, prev, branchId),
    nom,
    famille: champs.famille,
    sousFamille: champs.sousFamille?.trim() || undefined,
    unite: champs.unite.trim(),
    conditionnement: champs.conditionnement?.trim() || undefined,
    prixAchatXof: champs.prixAchatXof ?? 0,
    fournisseurId: champs.fournisseurId || undefined,
    seuilAlerte: champs.seuilAlerte ?? 0,
    stockCible: champs.stockCible ?? 0,
    emplacement: champs.emplacement?.trim() || undefined,
    actif: true,
    catalogProductId: champs.catalogProductId || undefined,
    /* Le lien Laboratoire se pose aussi à la création — le perdre en route
       obligeait à lier en deux temps, et seul le modal y pensait. */
    labIngredient: champs.labIngredient || undefined,
  }]);
  /* L'inventaire initial est un mouvement comme les autres : le journal raconte
     l'histoire entière, y compris son premier jour. */
  if (stockInitial > 0) {
    ecrireMouvement({ branchId, date, type: 'ajustement', produitId: id, quantite: stockInitial, note: 'Inventaire initial' });
  }
  return { ok: true, id };
}

/** Corriger le stock, c'est écrire l'écart — jamais poser un chiffre. */
export function ajusterStock(
  produit: ProduitStock,
  nouvelleQuantite: number,
  note: string,
  date: string,
): { ok: boolean; erreur?: string } {
  if (!Number.isFinite(nouvelleQuantite)) return { ok: false, erreur: 'Ce n’est pas une quantité.' };
  /* POSTE FROID : une CIBLE s'écrit en écart contre le stock dérivé, et un
     journal à moitié relu rendrait un écart faux. La quantité CONSTATÉE, elle,
     reste vraie — on la garde et on écrit l'écart après la première lecture. */
  if (journalFroid()) {
    mettreEnAttente({ k: 'cible', produitId: produit.id, quantite: Math.round(nouvelleQuantite), note, date });
    return { ok: true };
  }
  const actuel = stockDe(produit.id, mouvementsStockStore.get());
  const ecart = Math.round(nouvelleQuantite) - actuel;
  if (ecart === 0) return { ok: false, erreur: 'Le stock est déjà à cette quantité.' };
  ecrireMouvement({
    branchId: produit.branchId, date, type: 'ajustement', produitId: produit.id,
    quantite: ecart, note: note.trim() || 'Inventaire',
  });
  return { ok: true };
}

export function declarerPerte(
  produit: ProduitStock,
  quantite: number,
  note: string,
  date: string,
): { ok: boolean; erreur?: string } {
  if (!Number.isFinite(quantite) || quantite <= 0) return { ok: false, erreur: 'Il faut une quantité perdue.' };
  ecrireMouvement({
    branchId: produit.branchId, date, type: 'perte', produitId: produit.id,
    quantite: -Math.round(quantite), note: note.trim() || undefined,
  });
  return { ok: true };
}

/* ---------- La bascule de la Gamme ---------- */

/** Chaque produit Gamme sans fiche d'inventaire en reçoit une (famille Revente,
    liée), et son stock affiché devient un mouvement « Inventaire initial » :
    rien ne se perd, et l'ancien compteur cesse d'être écrit à la main.
    Idempotente — relancée, elle ne crée rien. */
export function reprendreGamme(branchId: string, date: string): number {
  const gamme = productsStore.get();
  const existants = produitsStockStore.get();
  const dejaLies = new Set(existants.map((p) => p.catalogProductId).filter(Boolean));
  const orphelins = gamme.filter((g) => !dejaLies.has(g.id));
  if (!orphelins.length) return 0;

  /* EN LOT : la version en boucle refaisait, par produit, une réécriture du
     magasin, un scan de code et un recalcul du miroir — des centaines
     d'écritures pour un clic. Ici : deux écritures et un recalcul. */
  let n = numeroSuivant(existants.filter((p) => p.branchId === branchId).map((p) => p.code), FAMILLES.revente.code) - 1;
  const fiches: ProduitStock[] = orphelins.map((g) => ({
    id: `stk-${uid()}`,
    branchId,
    code: `${FAMILLES.revente.code}-${String(++n).padStart(2, '0')}`,
    nom: g.name,
    famille: 'revente',
    unite: 'pièce',
    prixAchatXof: 0,
    seuilAlerte: 3,
    stockCible: Math.max(g.stock, 6),
    actif: true,
    catalogProductId: g.id,
  }));
  produitsStockStore.set((prev) => [...prev, ...fiches]);
  ecrireMouvements(fiches
    .map((f, ix) => ({ fiche: f, stock: orphelins[ix].stock }))
    .filter((x) => x.stock > 0)
    .map((x) => ({
      branchId, date, type: 'ajustement' as const, produitId: x.fiche.id,
      quantite: x.stock, note: 'Inventaire initial',
    })));
  recalculeMiroir(new Set(fiches.map((f) => f.catalogProductId!)));
  return fiches.length;
}

/** Poser une quantité constatée depuis un écran Gamme : l'écart s'écrit contre
    le stock DÉRIVÉ de la fiche — jamais contre le miroir, qui peut être en
    retard d'une synchronisation. Rend faux si la fiche n'existe pas encore —
    l'appelant garde alors l'ancien chemin. */
export function corrigerStockGamme(catalogProductId: string, nouvelleQuantite: number, note: string, date: string, branchId?: string): boolean {
  const fiche = fichePourGamme(catalogProductId, branchId);
  if (!fiche) return false;
  ajusterStock(fiche, nouvelleQuantite, note, date);
  return true;
}

/** LE +/− DES ÉCRANS GAMME. Un clic dit « une pièce de plus » — un DELTA, pas
    une cible : viser `miroir ± 1` écrivait, quand le miroir était périmé d'une
    synchronisation, un écart de ±4 pour un seul clic. Rend faux sans fiche. */
export function bougerStockGamme(catalogProductId: string, delta: number, note: string, date: string, branchId?: string): boolean {
  if (!delta) return false;
  const fiche = fichePourGamme(catalogProductId, branchId);
  if (!fiche) return false;
  ecrireMouvement({
    branchId: fiche.branchId, date, type: 'ajustement', produitId: fiche.id,
    quantite: Math.round(delta), note: note.trim() || 'Correction Gamme',
  });
  return true;
}

/* ---------- Comportement B — la vente d'un produit Gamme ---------- */

/** LA FICHE D'UN PRODUIT GAMME, VUE D'UNE BRANCHE. La fiche de la branche
    demandeuse d'abord — vendre au Studio ne doit jamais drainer la réserve de
    l'Atelier — puis n'importe quelle fiche active en repli (une seule branche
    aujourd'hui). Les fiches désactivées ne reçoivent plus rien. */
export const fichePourGamme = (catalogProductId: string, branchId?: string): ProduitStock | undefined => {
  const fiches = produitsStockStore.get().filter((p) => p.catalogProductId === catalogProductId && p.actif);
  return (branchId ? fiches.find((p) => p.branchId === branchId) : undefined) ?? fiches[0];
};

/** Rend vrai si le mouvement a été écrit ; faux quand la fiche liée n'existe pas
    encore — la Caisse décrémente alors l'ancien compteur, comme avant. */
export function venteGamme(catalogProductId: string, quantite: number, reference: string, date: string, branchId?: string): boolean {
  if (quantite <= 0) return false;
  const fiche = fichePourGamme(catalogProductId, branchId);
  if (!fiche) {
    /* POSTE FROID sans fiche en cache : elle existe peut-être au serveur. On
       diffère la sortie ; rendre VRAI évite à la Caisse d'écrire l'ancien
       compteur, que le miroir effacerait au premier recalcul. Le repli d'une
       Gamme jamais reprise se rejoue au même endroit (voir `rejoueAttente`). */
    if (!tablePrete('stock_produits')) {
      mettreEnAttente({ k: 'vente', catalogProductId, quantite, reference, date, branchId });
      return true;
    }
    return false;
  }
  /* On ne borne pas à zéro : un stock négatif dit qu'on a vendu plus que ce qui
     était compté, et cette information vaut mieux qu'un zéro rassurant. */
  ecrireMouvement({
    branchId: fiche.branchId, date, type: 'sortie_vente', produitId: fiche.id,
    quantite: -Math.round(quantite), reference,
  });
  return true;
}

/* ---------- Comportement C — la prestation encaissée ---------- */

const REF_RDV = (apptId: string): string => `rdv:${apptId}`;

/** Lit les recettes des services du rituel et écrit une sortie par produit.
    Sans recette : rien, sans erreur.

    IDEMPOTENT PAR RÉFÉRENCE : un rituel peut s'encaisser, s'annuler, se
    ré-encaisser — si ses mouvements existent déjà, on ne réécrit pas, sinon
    chaque ré-encaissement viderait le stock une fois de plus. */
export function consommerPourRituel(
  appt: { id: string; branchId: string; serviceIds: string[] },
  date: string,
): number {
  const ref = REF_RDV(appt.id);
  /* POSTE FROID : l'idempotence se vérifie contre le journal — froid, il ne
     peut pas dire si un autre poste a déjà consommé ce rituel. Écrire quand
     même doublerait la sortie ; le geste se diffère jusqu'à la première
     lecture, où le contrôle redevient sûr. */
  if (journalFroid()) {
    mettreEnAttente({ k: 'rituel', appt: { id: appt.id, branchId: appt.branchId, serviceIds: [...appt.serviceIds] }, date });
    return 0;
  }
  if (mouvementsStockStore.get().some((m) => m.reference === ref)) return 0;
  const recettes = consommationsStore.get().filter((c) => c.branchId === appt.branchId);
  /* Deux fois le même geste dans un rituel = deux fois sa recette. */
  const besoins = new Map<string, number>();
  for (const serviceId of appt.serviceIds) {
    for (const c of recettes) {
      if (c.serviceId !== serviceId) continue;
      besoins.set(c.produitId, (besoins.get(c.produitId) ?? 0) + c.quantite);
    }
  }
  if (!besoins.size) return 0;
  const nouveaux = [...besoins].map(([produitId, quantite]) => ({
    branchId: appt.branchId, date, type: 'sortie_service' as const,
    produitId, quantite: -quantite, reference: ref,
  }));
  ecrireMouvements(nouveaux);
  return nouveaux.length;
}

/** DÉS-HONORER REMBOBINE. Les sorties du rituel disparaissent du journal, la
    réserve remonte — sinon annuler puis ré-honorer décompterait la recette
    deux fois, et un rituel supprimé laisserait des mouvements orphelins. */
export function rembobinerRituel(apptId: string): number {
  return retirerParReferences([REF_RDV(apptId)]);
}

/* ---------- Comportements A & cycle d'achat ---------- */

export function creerCommande(
  branchId: string,
  fournisseurId: string,
  date: string,
  note?: string,
): { ok: boolean; erreur?: string; id?: string } {
  if (!fournisseurId) return { ok: false, erreur: 'Il faut un fournisseur.' };
  const id = `bc-${uid()}`;
  commandesAchatStore.set((prev) => [...prev, {
    id, branchId,
    numero: prochainNumeroBC(prev, branchId, date.slice(0, 4)),
    dateCommande: date, fournisseurId, statut: 'brouillon', note: note?.trim() || undefined,
  }]);
  return { ok: true, id };
}

/** Une ligne ne s'ajoute qu'au brouillon — un bon parti chez le fournisseur ne
    se réécrit pas dans son dos. */
export function ajouterLigneCommande(
  commande: CommandeFournisseur,
  produit: ProduitStock,
  quantite: number,
  prixUnitaireXof?: number,
): { ok: boolean; erreur?: string } {
  if (commande.statut !== 'brouillon') return { ok: false, erreur: 'Ce bon n’est plus un brouillon.' };
  if (!Number.isFinite(quantite) || quantite <= 0) return { ok: false, erreur: 'Il faut une quantité.' };
  lignesAchatStore.set((prev) => [...prev, {
    id: `bcl-${uid()}`, branchId: commande.branchId, commandeId: commande.id,
    produitId: produit.id, quantiteCommandee: Math.round(quantite),
    prixAchatUnitaireXof: prixUnitaireXof ?? produit.prixAchatXof, quantiteRecue: 0,
  }]);
  return { ok: true };
}

export function retirerLigneCommande(ligne: LigneCommande): { ok: boolean; erreur?: string } {
  const commande = commandesAchatStore.get().find((c) => c.id === ligne.commandeId);
  if (!commande || commande.statut !== 'brouillon') return { ok: false, erreur: 'Ce bon n’est plus un brouillon.' };
  lignesAchatStore.set((prev) => prev.filter((l) => l.id !== ligne.id));
  return { ok: true };
}

export function envoyerCommande(commande: CommandeFournisseur): { ok: boolean; erreur?: string } {
  if (commande.statut !== 'brouillon') return { ok: false, erreur: 'Ce bon est déjà parti.' };
  if (!lignesDe(lignesAchatStore.get(), commande.id).length) {
    return { ok: false, erreur: 'Un bon vide ne s’envoie pas.' };
  }
  commandesAchatStore.set((prev) => prev.map((c) => (c.id === commande.id ? { ...c, statut: 'envoyee' } : c)));
  return { ok: true };
}

/** Annuler n'est possible que si RIEN n'a été reçu : une réception a déjà fait
    monter le stock, et un bon annulé qui a livré ne raconte plus la vérité. */
export function annulerCommande(commande: CommandeFournisseur): { ok: boolean; erreur?: string } {
  if (commande.statut === 'recue' || commande.statut === 'annulee') {
    return { ok: false, erreur: 'Ce bon est déjà clos.' };
  }
  if (lignesDe(lignesAchatStore.get(), commande.id).some((l) => l.quantiteRecue > 0)) {
    return { ok: false, erreur: 'Une partie a déjà été reçue — le stock est monté. Recevez le reste ou laissez le bon en Partielle.' };
  }
  commandesAchatStore.set((prev) => prev.map((c) => (c.id === commande.id ? { ...c, statut: 'annulee' } : c)));
  return { ok: true };
}

/** COMPORTEMENT A — la réception. Écrit le mouvement d'entrée (référence = n°
    du bon), met à jour la ligne, et fait avancer le statut du bon selon les
    reliquats : envoyée → partielle → reçue. La sur-réception est tolérée — le
    fournisseur a livré ce qu'il a livré, le journal le dit tel quel. */
export function recevoirLigne(
  ligne: LigneCommande,
  quantiteRecue: number,
  date: string,
): { ok: boolean; erreur?: string } {
  if (!Number.isFinite(quantiteRecue) || quantiteRecue <= 0) return { ok: false, erreur: 'Il faut une quantité reçue.' };
  const commande = commandesAchatStore.get().find((c) => c.id === ligne.commandeId);
  if (!commande) return { ok: false, erreur: 'Le bon de commande est introuvable.' };
  if (commande.statut === 'brouillon') return { ok: false, erreur: 'Envoyez le bon avant de recevoir.' };
  if (commande.statut === 'annulee' || commande.statut === 'recue') return { ok: false, erreur: 'Ce bon est clos.' };

  const q = Math.round(quantiteRecue);
  ecrireMouvement({
    branchId: ligne.branchId, date, type: 'entree_achat', produitId: ligne.produitId,
    quantite: q, reference: commande.numero,
  });
  lignesAchatStore.set((prev) => prev.map((l) => (l.id === ligne.id ? { ...l, quantiteRecue: l.quantiteRecue + q } : l)));

  const lignes = lignesDe(lignesAchatStore.get(), commande.id);
  const toutRecu = lignes.every((l) => l.quantiteRecue >= l.quantiteCommandee);
  const unPeu = lignes.some((l) => l.quantiteRecue > 0);
  const statut: StatutCommande = toutRecu ? 'recue' : unPeu ? 'partielle' : 'envoyee';
  if (statut !== commande.statut) {
    commandesAchatStore.set((prev) => prev.map((c) => (c.id === commande.id ? { ...c, statut } : c)));
  }
  return { ok: true };
}

/* ---------- Recettes ---------- */

export function poserRecette(
  branchId: string,
  serviceId: string,
  produit: ProduitStock,
  quantite: number,
  unite?: string,
): { ok: boolean; erreur?: string } {
  if (!serviceId) return { ok: false, erreur: 'Il faut un service.' };
  if (!Number.isFinite(quantite) || quantite <= 0) return { ok: false, erreur: 'Il faut une quantité.' };
  /* Un service ne consomme un produit qu'en UNE ligne : reposer remplace. */
  consommationsStore.set((prev) => [
    ...prev.filter((c) => !(c.serviceId === serviceId && c.produitId === produit.id && c.branchId === branchId)),
    { id: `cons-${uid()}`, branchId, serviceId, produitId: produit.id, quantite, unite: unite?.trim() || produit.unite },
  ]);
  return { ok: true };
}

export function retirerRecette(c: Consommation): void {
  consommationsStore.set((prev) => prev.filter((x) => x.id !== c.id));
}

/* ---------- Synchronisation ---------- */

import { bindCollection, tablePrete, quandTablePrete } from './sync';
bindCollection(fournisseursStore, 'fournisseurs');
bindCollection(produitsStockStore, 'stock_produits');
bindCollection(mouvementsStockStore, 'stock_mouvements');
bindCollection(commandesAchatStore, 'achats_commandes');
bindCollection(lignesAchatStore, 'achats_lignes');
bindCollection(consommationsStore, 'consommations');

/* Après la liaison : le miroir écoute le journal ET les fiches — y compris
   quand c'est la synchronisation qui les change. */
mouvementsStockStore.subscribe(replanifieMiroir);
produitsStockStore.subscribe(replanifieMiroir);

/* ---------- La fenêtre d'avant-hydratation — 10 août 2026 ----------

   Le stock ne se stocke pas : il se DÉRIVE du journal. Or sur un poste FROID
   — ouvert à l'instant, le journal pas encore relu — toute dérivation ment :
   l'idempotence de `consommerPourRituel` ne voit pas ce qu'un autre poste a
   écrit, `retirerParReferences` ne trouve pas les mouvements que le serveur
   porte, une cible d'inventaire calcule un écart faux, et la vente d'un
   produit dont la fiche n'est pas en cache retombe sur l'ancien compteur que
   le miroir efface. La couche sync préserve désormais les ÉCRITURES du froid
   (voir sync.ts) ; ici on diffère les gestes qui LISENT le journal, jusqu'à
   ce que la première lecture soit résolue — réussie, refusée ou échouée.

   La file est PERSISTÉE PAR POSTE (jamais synchronisée) : un onglet fermé
   avant l'hydratation rejoue ses gestes à la prochaine ouverture. */

type GesteEnAttente =
  | { k: 'retrait'; refs: string[] }
  | { k: 'rituel'; appt: { id: string; branchId: string; serviceIds: string[] }; date: string }
  | { k: 'vente'; catalogProductId: string; quantite: number; reference: string; date: string; branchId?: string }
  | { k: 'cible'; produitId: string; quantite: number; note: string; date: string };

const attenteStockStore = createStore<GesteEnAttente[]>('mnd_stock_attente', []);

function journalFroid(): boolean {
  return !tablePrete('stock_mouvements');
}

function mettreEnAttente(g: GesteEnAttente): void {
  attenteStockStore.set((prev) => [...prev, g]);
}

/** Rejoue les gestes différés, dans l'ordre où ils ont été posés. Chaque geste
    repasse par sa primitive : l'idempotence et le miroir jouent normalement. */
function rejoueAttente(): void {
  if (!tablePrete('stock_mouvements') || !tablePrete('stock_produits')) return;
  const gestes = attenteStockStore.get();
  if (!gestes.length) return;
  attenteStockStore.set(() => []);
  for (const g of gestes) {
    if (g.k === 'retrait') {
      retirerParReferences(g.refs);
    } else if (g.k === 'rituel') {
      consommerPourRituel(g.appt, g.date);
    } else if (g.k === 'cible') {
      /* La fiche a pu disparaître entre-temps — un geste sur un fantôme ne
         s'écrit pas. */
      const fiche = produitsStockStore.get().find((p) => p.id === g.produitId);
      if (fiche) ajusterStock(fiche, g.quantite, g.note, g.date);
    } else {
      const fiche = fichePourGamme(g.catalogProductId, g.branchId);
      if (fiche) {
        ecrireMouvement({
          branchId: fiche.branchId, date: g.date, type: 'sortie_vente',
          produitId: fiche.id, quantite: -Math.round(g.quantite), reference: g.reference,
        });
      } else {
        /* Gamme jamais reprise : l'ancien compteur, comme l'aurait fait la
           Caisse si la fiche avait manqué sur un poste chaud. */
        productsStore.set((prev) => prev.map((p) => (p.id === g.catalogProductId ? { ...p, stock: p.stock - g.quantite } : p)));
      }
    }
  }
}

quandTablePrete('stock_mouvements', rejoueAttente);
quandTablePrete('stock_produits', rejoueAttente);
