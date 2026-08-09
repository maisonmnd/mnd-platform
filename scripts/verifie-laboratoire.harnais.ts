/* LA BOUCLE DU LABORATOIRE, ÉPROUVÉE. Lier un ingrédient → la disponibilité
   devient le stock réel ; composer pour une cliente ; fabriquer consomme le
   journal ; annuler rembobine ; la facture verrouille. Lancé par
   `node scripts/verifie-laboratoire.mjs`. */
import {
  produitsStockStore, mouvementsStockStore, creerProduitStock, stockDe,
} from '../src/shared/stock';
import {
  preparationsLabStore, fichePourIngredient, lierIngredient, delierIngredient,
  stockReelDuLab, composerPreparation, coutPreparationXof, fabriquerPreparation,
  annulerFabrication, remettrePreparation, poserFacture, supprimerPreparation,
  manquesPourFabrication, detacherFacture,
} from '../src/shared/laboratoire';
import { isAvail } from '../src/apps/trone/routes/vente/lab';

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
const prep = () => preparationsLabStore.get()[0];

/* ── LA LIAISON — la disponibilité cesse d'être une opinion ── */
const ALOES = 'Gel d’aloès frais';
const LIN = 'Mucilage de graines de lin';
const aloes = creerProduitStock(BR, { nom: 'Gel d’aloès', famille: 'consommable', unite: 'ml', prixAchatXof: 12 }, 400, J);
const lin = creerProduitStock(BR, { nom: 'Graines de lin', famille: 'consommable', unite: 'g', prixAchatXof: 8 }, 0, J);
lierIngredient(aloes.id!, ALOES);
lierIngredient(lin.id!, LIN);

const produits = () => produitsStockStore.get();
const mvts = () => mouvementsStockStore.get();
dit('la fiche liée se retrouve par son ingrédient', aloes.id, fichePourIngredient(ALOES, produits())?.id);

const reel = () => stockReelDuLab([ALOES, LIN, 'Glycérine végétale'], produits(), mvts());
dit('lié avec du stock → disponible', true, isAvail(reel(), ALOES));
dit('lié à SEC → indisponible', false, isAvail(reel(), LIN));
dit('jamais lié → réputé disponible', true, isAvail(reel(), 'Glycérine végétale'));

/* Relier ailleurs déplace le lien — une fiche, un ingrédient. */
lierIngredient(aloes.id!, LIN);
dit('relier déplace le lien', aloes.id, fichePourIngredient(LIN, produits())?.id);
dit('… et l’ancien ingrédient est délié', undefined, fichePourIngredient(ALOES, produits())?.id);
lierIngredient(aloes.id!, ALOES);
lierIngredient(lin.id!, LIN);
delierIngredient(LIN);
dit('délier libère', undefined, fichePourIngredient(LIN, produits())?.id);
lierIngredient(lin.id!, LIN);

/* ── LA COMPOSITION — pour une cliente, jamais dans le vide ── */
dit('sans cliente : refusée', false,
  composerPreparation(BR, '', { concernK: 'hydratation', nomFormule: 'X', ingredientsTexte: [], prixXof: 9500 }, [{ produitId: aloes.id!, quantite: 200 }], J).ok);
dit('sans ligne liée : refusée', false,
  composerPreparation(BR, 'cl-awa', { concernK: 'hydratation', nomFormule: 'X', ingredientsTexte: [], prixXof: 9500 }, [], J).ok);

const c = composerPreparation(
  BR, 'cl-awa',
  { concernK: 'hydratation', nomFormule: 'Le Voile Aloès & Lin', forme: 'Leave-in vaporisé', ingredientsTexte: [ALOES, LIN, 'Glycérine végétale'], prixXof: 9500 },
  [{ produitId: aloes.id!, quantite: 200 }, { produitId: lin.id!, quantite: 30 }, { produitId: '', quantite: 5 }],
  J,
);
dit('une composition valable passe', true, c.ok);
dit('… la ligne sans fiche est écartée', 2, prep().lignes.length);
dit('… le texte garde TOUT, même le non-décompté', 3, prep().ingredientsTexte.length);
dit('le coût matière réel : 200×12 + 30×8', 2640, coutPreparationXof(prep(), produits()));

/* ── LA FABRICATION — le journal, pas un compteur ── */
const manques = manquesPourFabrication(prep(), produits(), mvts());
dit('le manque se voit AVANT le geste', ['Graines de lin'], manques.map((m) => m.produit.nom));
dit('… avec le chiffre juste', 30, manques[0]?.manque);

dit('fabriquer passe', true, fabriquerPreparation(prep(), J).ok);
dit('… l’aloès descend', 200, stock(aloes.id!));
dit('… le lin passe NÉGATIF — la vérité', -30, stock(lin.id!));
dit('… les mouvements portent la référence', 2,
  mvts().filter((m) => m.reference === `prep:${prep().id}` && m.type === 'fabrication').length);
dit('refabriquer est refusé', false, fabriquerPreparation(prep(), J).ok);
dit('… et ne reconsomme rien', 200, stock(aloes.id!));

/* ── LE REMBOBINAGE ── */
dit('annuler rembobine', true, annulerFabrication(prep()).ok);
dit('… l’aloès remonte', 400, stock(aloes.id!));
dit('… le statut revient', 'proposee', prep().statut);
fabriquerPreparation(prep(), J);

/* ── LA REMISE & LA FACTURE ── */
dit('remettre une proposée est refusé', false, remettrePreparation({ ...prep(), statut: 'proposee' }, J).ok);
dit('la remise passe', true, remettrePreparation(prep(), J).ok);
dit('facturer pose le lien', true, poserFacture(prep(), 'inv-001').ok);
dit('refacturer est refusé', false, poserFacture(prep(), 'inv-002').ok);
dit('ANNULER UNE FABRICATION FACTURÉE EST REFUSÉ — l’argent d’abord', false, annulerFabrication(prep()).ok);
dit('… le stock n’a pas bougé', 200, stock(aloes.id!));

/* ── LA FACTURE SUPPRIMÉE LIBÈRE LA PRÉPARATION — plus de préparation murée ── */
dit('détacher libère la préparation', 1, detacherFacture(['inv-001']));
dit('… l’identifiant ne pendouille plus', undefined, prep().invoiceId);
dit('… et l’annulation redevient possible', true, annulerFabrication(prep()).ok);
dit('… le stock remonte enfin', 400, stock(aloes.id!));
fabriquerPreparation(prep(), J);
remettrePreparation(prep(), J);
dit('… et refacturer aussi', true, poserFacture(prep(), 'inv-003').ok);

/* ── LA SUPPRESSION — jamais d'une fabriquée ── */
dit('supprimer une fabriquée est refusé', false, supprimerPreparation(prep()).ok);
const c2 = composerPreparation(BR, 'cl-awa', { concernK: 'volume', nomFormule: 'Y', ingredientsTexte: [ALOES], prixXof: 5000 }, [{ produitId: aloes.id!, quantite: 10 }], J);
dit('une proposée se retire', true,
  supprimerPreparation(preparationsLabStore.get().find((p) => p.id === c2.id)!).ok);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
