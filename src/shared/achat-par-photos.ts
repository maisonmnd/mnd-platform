/* ══ « C'EST SAISI » : L'ACHAT ÉCRIT EN UN GESTE — 1er novembre 2026 ══════
   La règle est dans `achat-par-photos-pur.ts` ; ici, les écritures, par les
   portes du stock qui existent déjà (fournisseur, fiche, bon, ligne à prix
   figé, envoi, réception) : le journal, le miroir de la Gamme et les statuts
   du bon se tiennent comme pour un bon fait à la main. Puis la dépense
   Matières premières, liée au bon, avec ses articles et la première photo.

   UNE SEULE FOIS. La saisie porte son identifiant ; s'il est déjà sur un
   bon, rien ne s'écrit (le 31 octobre 2026, une réception en boucle avait
   reçu vingt-cinq fois la même ligne).

   UN COMPTE À VALIDER RESTE À VALIDER. Le stock entre (la marchandise est
   là), mais la dépense d'un compte qui soumet attend le oui de la direction,
   comme une dépense saisie à la main (`doitEtreValidee`). */
import { uid } from './store';
import {
  commandesAchatStore, lignesAchatStore, produitsStockStore, fournisseursStore,
  creerFournisseur, creerProduitStock, creerCommande, ajouterLigneCommande, envoyerCommande, recevoirLigne, lignesDe,
} from './stock';
import { expensesStore, doitEtreValidee, soumission, type Expense, type PieceJointe } from './finance';
import {
  CATEGORIE_DE_L_ACHAT, ceQuiManqueALAchat, ditCeQuiManqueALAchat, planDeLAchat, resumeDeLAchat, type SaisieDAchat,
} from './achat-par-photos-pur';

export type SaisieFaite =
  | { ok: true; numero: string; commandeId: string; depenseId: string; resume: string[] }
  | { ok: false; erreur: string };

export function saisirLAchat(
  s: SaisieDAchat,
  ctx: { branchId: string; parNom: string; role: string | undefined; photos: readonly PieceJointe[]; aujourdhui: string },
): SaisieFaite {
  const deja = commandesAchatStore.get().find((c) => c.saisieId === s.saisieId);
  if (deja) return { ok: false, erreur: `Cet achat est déjà saisi : le bon ${deja.numero}.` };
  const manques = ceQuiManqueALAchat(s, ctx.aujourdhui);
  if (manques.length) return { ok: false, erreur: ditCeQuiManqueALAchat(manques) };

  const fiches = produitsStockStore.get().filter((p) => p.branchId === ctx.branchId);
  const fournisseurs = fournisseursStore.get().filter((f) => f.branchId === ctx.branchId);
  const plan = planDeLAchat(s, { fiches, fournisseurs });

  /* 1. Le fournisseur. */
  let fournisseurId: string;
  let nomFournisseur: string;
  if ('creer' in plan.fournisseur) {
    const r = creerFournisseur(ctx.branchId, { nom: plan.fournisseur.creer.nom, telephone: plan.fournisseur.creer.telephone });
    if (!r.ok || !r.id) return { ok: false, erreur: r.erreur ?? 'Le fournisseur n’a pas pu être créé.' };
    fournisseurId = r.id; nomFournisseur = plan.fournisseur.creer.nom;
  } else {
    fournisseurId = plan.fournisseur.id; nomFournisseur = plan.fournisseur.nom;
  }

  /* 2. Les fiches nouvelles, puis le prix du jour sur les fiches connues. */
  const ficheDeLaLigne = new Map<string, string>();
  for (const n of plan.nouvellesFiches) {
    const r = creerProduitStock(ctx.branchId, { nom: n.nom, famille: n.famille, unite: n.unite, prixAchatXof: n.prixAchatXof, fournisseurId }, 0, s.date);
    if (!r.ok || !r.id) return { ok: false, erreur: `La fiche « ${n.nom} » n’a pas pu naître : ${r.erreur ?? 'raison inconnue'}.` };
    ficheDeLaLigne.set(n.ligneId, r.id);
  }
  if (plan.prixMisAJour.length) {
    const nouveaux = new Map(plan.prixMisAJour.map((p) => [p.ficheId, p.apresXof]));
    produitsStockStore.set((prev) => prev.map((p) => (nouveaux.has(p.id)
      ? { ...p, prixAchatXof: nouveaux.get(p.id) as number, fournisseurId: p.fournisseurId || fournisseurId }
      : p)));
  }

  /* 3. Le bon, ses lignes au prix payé, envoyé puis reçu en entier. */
  const bc = creerCommande(ctx.branchId, fournisseurId, s.date, 'Saisi par photos');
  if (!bc.ok || !bc.id) return { ok: false, erreur: bc.erreur ?? 'Le bon n’a pas pu être créé.' };
  const commandeId = bc.id;
  const photos = ctx.photos.map((p) => ({ chemin: p.chemin, nom: p.nom, type: p.type, taille: p.taille }));
  commandesAchatStore.set((prev) => prev.map((c) => (c.id === commandeId ? { ...c, saisieId: s.saisieId, ...(photos.length ? { photos } : {}) } : c)));
  const commande = () => commandesAchatStore.get().find((c) => c.id === commandeId)!;
  for (const l of plan.lignesDuBon) {
    const ficheId = l.ficheId || ficheDeLaLigne.get(l.ligneId) || '';
    const produit = produitsStockStore.get().find((p) => p.id === ficheId);
    if (!produit) return { ok: false, erreur: 'Une fiche du bon est introuvable.' };
    const r = ajouterLigneCommande(commande(), produit, l.quantite, l.prixUnitaireXof);
    if (!r.ok) return { ok: false, erreur: r.erreur ?? 'Une ligne du bon n’a pas pu s’ajouter.' };
  }
  const envoi = envoyerCommande(commande());
  if (!envoi.ok) return { ok: false, erreur: envoi.erreur ?? 'Le bon n’a pas pu partir.' };
  for (const l of lignesDe(lignesAchatStore.get(), commandeId)) {
    const r = recevoirLigne(l, l.quantiteCommandee, s.date);
    if (!r.ok) return { ok: false, erreur: r.erreur ?? 'Une réception a échoué.' };
  }
  const numero = commande().numero;

  /* 4. La dépense, liée au bon. */
  const depenseId = `exp-achat-${s.saisieId}`;
  const enAttente = doitEtreValidee(ctx.role);
  const depense: Expense = {
    id: depenseId,
    branchId: ctx.branchId,
    label: `Achat · ${nomFournisseur} · ${numero}`,
    amountXof: plan.totalXof,
    date: s.date,
    cashbox: s.avancee ? '' : s.caisse,
    category: CATEGORIE_DE_L_ACHAT,
    porteur: s.porteur.trim(),
    ...(s.avancee ? { avancee: true } : {}),
    items: plan.articles.map((a) => ({ id: `it-${uid()}`, label: a.label, amountXof: a.amountXof, qty: a.qty, unitXof: a.unitXof })),
    ...(ctx.photos[0] ? { fichier: ctx.photos[0] } : {}),
    recurring: null,
    ...(enAttente ? { validation: soumission(ctx.parNom || 'Sans nom', new Date().toISOString()) } : {}),
  };
  expensesStore.set((prev) => (prev.some((e) => e.id === depenseId) ? prev : [depense, ...prev]));
  commandesAchatStore.set((prev) => prev.map((c) => (c.id === commandeId ? { ...c, depenseId } : c)));

  return {
    ok: true, numero, commandeId, depenseId,
    resume: resumeDeLAchat(plan, { numero, nomFournisseur, caisse: s.caisse, avancee: s.avancee, porteur: s.porteur.trim(), photos: ctx.photos.length, enAttente }),
  };
}
