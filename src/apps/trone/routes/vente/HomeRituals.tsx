import { useMemo, useState, type ReactNode } from 'react';
import { PageHead, WaLien } from '../_ui';
import { prestationRepond } from '../../../../shared/recherche';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  SEUIL_REASSORT, categoriesStore, useCategories, useProducts, useServices,
  type CatalogCategory, type Product,
} from '../../../../shared/catalog';
import {
  FAMILLES, MOUVEMENT_NOMS, COMMANDE_NOMS, bougerStockGamme, litQuantite,
  etatReserve, soldesApres, ecrireMouvements,
  useFournisseurs, useProduitsStock, useMouvementsStock, useCommandesAchat, useLignesAchat, useConsommations,
  produitsStockStore, fournisseursStore, commandesAchatStore,
  creerFournisseur, creerProduitStock, creerCommande, ajouterLigneCommande, retirerLigneCommande,
  envoyerCommande, annulerCommande, recevoirLigne, lignesDe,
  ajusterStock, declarerPerte, corrigerStockGamme, reprendreGamme,
  stocksParProduit, margePct, prixVenteDe, coutMatiereXof, reappro, reliquat, statutLigne,
  totalCommande, totalRecu, coutLigne, poserRecette, retirerRecette, aCommander,
  type CommandeFournisseur, type FamilleProduit, type ProduitStock, type MouvementStock, type EtatReserve,
} from '../../../../shared/stock';
import { uid } from '../../../../shared/store';
import { frDay, todayISO } from '../clients/_shared';
import './vente.css';

/* STOCK & ACHATS — le compagnon du catalogue, sur l'écran qui portait la Gamme.

   Quatre questions : qu'ai-je en stock, que dois-je racheter, combien me coûte
   chaque prestation, et combien je gagne sur ce que je revends. La Gamme reste
   le premier onglet — c'est le geste quotidien ; l'inventaire, les achats, les
   recettes et le journal la rejoignent au lieu de vivre ailleurs.

   LE STOCK NE S'ÉCRIT PLUS À LA MAIN NULLE PART ICI : chaque geste passe par le
   journal des mouvements (voir shared/stock.ts), et le champ `stock` des fiches
   Gamme n'est qu'un miroir que le journal réécrit. */

const LIGNES_FONDATRICES = ['home-rituals', 'meches'];
const estLigne = (c: CatalogCategory) => c.produits === true || LIGNES_FONDATRICES.includes(c.id);
const SEUIL = SEUIL_REASSORT;
/* Les dates de la maison, pas celles d'UTC — voir clients/_shared. */
const jour = todayISO;
const frJour = frDay;

const codeDe = (fon: string): string =>
  (fon.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4)) || 'LGN';

type Onglet = 'vue' | 'achats' | 'journal' | 'comptage' | 'recettes' | 'gamme';

/* L'habit des pastilles d'état — trois mots, trois encres. */
const ETAT_MOTS: Record<EtatReserve, string> = { rupture: 'Rupture', sous_seuil: 'Sous seuil', ok: 'En réserve' };
const MVT_CLASSE: Record<MouvementStock['type'], string> = {
  entree_achat: 'in', sortie_vente: 'out', sortie_service: 'out',
  fabrication: 'out', ajustement: 'adj', perte: 'perte',
};

function Chip({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, padding: '9px 18px',
        borderRadius: 'var(--radius-pill)', border: '1px solid var(--hairline)',
        background: actif ? 'var(--color-indigo)' : 'var(--surface-card)',
        color: actif ? 'var(--color-ivoire)' : 'var(--ink)',
        transition: 'var(--transition-base)',
      }}
    >
      {children}
    </button>
  );
}

function Statut({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span style={{
      fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      color: ok ? 'var(--trf-success, #4c7a4c)' : 'var(--color-danger, #9E3428)',
    }}>
      {children}
    </span>
  );
}

export default function HomeRituals() {
  const { branch, currency } = useBranch();
  const [onglet, setOnglet] = useState<Onglet>('vue');
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [commandes] = useCommandesAchat();

  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const fichesBranche = useMemo(
    () => produits.filter((p) => p.branchId === branch.id),
    [produits, branch.id],
  );
  const manquants = useMemo(
    () => fichesBranche.filter((p) => p.actif && aCommander(p, stocks.get(p.id) ?? 0)).length,
    [fichesBranche, stocks],
  );
  const bcOuverts = commandes.filter((c) => c.branchId === branch.id && (c.statut === 'envoyee' || c.statut === 'partielle')).length;

  return (
    <>
      <PageHead
        eyebrow="Vente · stock &amp; achats"
        title="Stock &amp; Achats."
        sub="Qu’ai-je en stock, que dois-je racheter, combien me coûte chaque prestation, et combien je gagne sur ce que je revends."
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, marginBottom: 4 }}>
        <Chip actif={onglet === 'vue'} onClick={() => setOnglet('vue')}>
          Vue d’ensemble{manquants ? ` · ${manquants} à commander` : ''}
        </Chip>
        <Chip actif={onglet === 'achats'} onClick={() => setOnglet('achats')}>
          Achats{bcOuverts ? ` · ${bcOuverts} en cours` : ''}
        </Chip>
        <Chip actif={onglet === 'journal'} onClick={() => setOnglet('journal')}>Journal</Chip>
        <Chip actif={onglet === 'comptage'} onClick={() => setOnglet('comptage')}>Inventaire</Chip>
        <Chip actif={onglet === 'recettes'} onClick={() => setOnglet('recettes')}>Recettes</Chip>
        <Chip actif={onglet === 'gamme'} onClick={() => setOnglet('gamme')}>La Gamme</Chip>
      </div>

      {onglet === 'vue' && <OngletVue />}
      {onglet === 'achats' && <OngletAchats />}
      {onglet === 'journal' && <OngletJournal />}
      {onglet === 'comptage' && <OngletComptage />}
      {onglet === 'recettes' && <OngletRecettes />}
      {onglet === 'gamme' && <OngletGamme />}
    </>
  );
}

/* ═══════════════ LA GAMME — la vitrine, geste quotidien ═══════════════ */

type Form = { id: string | null; categoryId: string; name: string; price: string; stock: string };
type LigneForm = { id: string | null; fon: string; label: string };

function OngletGamme() {
  const { branch, currency } = useBranch();
  const [categories] = useCategories();
  const [products, setProducts] = useProducts();
  const [form, setForm] = useState<Form | null>(null);
  const [ligne, setLigne] = useState<LigneForm | null>(null);
  const [q, setQ] = useState('');

  const cats = useMemo(() => categories.filter(estLigne).sort((a, b) => a.order - b.order), [categories]);
  const autres = useMemo(
    () => categories.filter((c) => !estLigne(c) && products.some((p) => p.categoryId === c.id)),
    [categories, products],
  );
  const toutes = [...cats, ...autres];

  const filtre = (p: Product) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase());
  const of = (catId: string) => products.filter((p) => p.categoryId === catId).filter(filtre).sort((a, b) => a.order - b.order);

  const valeur = products.reduce((s, p) => s + p.priceXof * p.stock, 0);
  const ruptures = products.filter((p) => p.stock <= 0);
  const basses = products.filter((p) => p.stock > 0 && p.stock <= SEUIL);

  const patch = (id: string, next: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)));

  /* LE +/− EST UN DELTA, PAS UNE CIBLE : viser `miroir ± 1` écrivait, quand le
     miroir était en retard d'une synchronisation, un écart de ±4 pour un clic.
     Sans fiche (Gamme pas encore reprise), l'ancien compteur continue — SANS
     borner à zéro : le négatif dit la vérité, ici comme au journal. */
  const bouge = (p: Product, delta: number) => {
    if (bougerStockGamme(p.id, delta, 'Correction Gamme', jour(), branch.id)) return;
    patch(p.id, { stock: p.stock + delta });
  };
  /* La quantité CONSTATÉE du formulaire, elle, reste une cible — l'écart
     s'écrit contre le stock dérivé de la fiche, jamais contre le miroir. */
  const corrige = (p: Product, nouvelle: number) => {
    if (corrigerStockGamme(p.id, nouvelle, 'Correction Gamme', jour(), branch.id)) return;
    patch(p.id, { stock: nouvelle });
  };

  const save = () => {
    if (!form || !form.name.trim()) return;
    const price = parseInt(form.price.replace(/[^0-9]/g, ''), 10) || 0;
    /* `litQuantite` garde le signe : un stock négatif (survendu) ne doit pas
       devenir positif en passant par le formulaire. */
    const stock = Math.round(litQuantite(form.stock) || 0);
    if (form.id) {
      patch(form.id, { name: form.name.trim(), priceXof: price, categoryId: form.categoryId });
      const avant = products.find((p) => p.id === form.id)?.stock ?? 0;
      if (stock !== avant) corrige(products.find((p) => p.id === form.id)!, stock);
    } else {
      const maxOrder = products.reduce((m, p) => Math.max(m, p.order), 0);
      setProducts((prev) => [...prev, { id: uid(), categoryId: form.categoryId, name: form.name.trim(), priceXof: price, stock, order: maxOrder + 1 }]);
    }
    setForm(null);
  };

  const saveLigne = () => {
    if (!ligne || !ligne.fon.trim()) return;
    const fon = ligne.fon.trim();
    const label = ligne.label.trim();
    if (ligne.id) {
      categoriesStore.set((prev) => prev.map((c) => (c.id === ligne.id ? { ...c, fon, label } : c)));
    } else {
      categoriesStore.set((prev) => [
        ...prev,
        {
          id: `ligne-${uid()}`, code: codeDe(fon), fon, label: label || 'Ligne de produits',
          enabled: true, produits: true, order: prev.reduce((m, c) => Math.max(m, c.order), 0) + 1,
        },
      ]);
    }
    setLigne(null);
  };

  const retirerLigne = (cat: CatalogCategory) => {
    const dedans = products.filter((p) => p.categoryId === cat.id);
    if (dedans.length) {
      window.alert(`« ${cat.fon} » porte encore ${dedans.length} produit${dedans.length > 1 ? 's' : ''}. Déplacez-les vers une autre ligne avant de la retirer.`);
      return;
    }
    if (!window.confirm(`Retirer la ligne « ${cat.fon} » ?`)) return;
    categoriesStore.set((prev) => prev.filter((c) => c.id !== cat.id));
  };

  const supprimer = (p: Product) => {
    if (!window.confirm(`Retirer « ${p.name} » de la Gamme ?`)) return;
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setLigne({ id: null, fon: '', label: '' })}>+ Ligne</Button>
        <Button onClick={() => setForm({ id: null, categoryId: cats[0]?.id ?? LIGNES_FONDATRICES[0], name: '', price: '', stock: '0' })}>
          + Produit
        </Button>
      </div>

      <div className="tr-grid tr-grid--3" style={{ marginTop: 14 }}>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Valeur du stock (prix de vente)</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(valeur, currency)}</div>
        </div>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Références</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{products.length}</div>
        </div>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>À réassortir</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{ruptures.length + basses.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
            {ruptures.length ? `${ruptures.length} en rupture` : 'aucune rupture'}
            {basses.length ? ` · ${basses.length} sous ${SEUIL}` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, maxWidth: 380 }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" />
      </div>

      {toutes.map((cat) => {
        const list = of(cat.id);
        if (q.trim() && !list.length) return null;
        const val = list.reduce((s, p) => s + p.priceXof * p.stock, 0);
        return (
          <section key={cat.id} style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '2px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, letterSpacing: '.04em' }}>{cat.fon}</span>
              <span className="mnd-muted" style={{ fontSize: 12 }}>{cat.label}</span>
              <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {list.length} références · {fmtMoney(val, currency)} en stock
              </span>
              {estLigne(cat) && (
                <span style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setLigne({ id: cat.id, fon: cat.fon, label: cat.label })}
                    style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--copper-600)', textDecoration: 'underline', textUnderlineOffset: 2 }}
                  >
                    renommer
                  </button>
                  {!LIGNES_FONDATRICES.includes(cat.id) && (
                    <button
                      type="button"
                      onClick={() => retirerLigne(cat)}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 2 }}
                    >
                      retirer
                    </button>
                  )}
                </span>
              )}
            </div>

            {list.length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 13, padding: '14px 2px' }}>Aucun produit dans cette ligne.</div>
            )}

            {list.map((p) => {
              const rupture = p.stock <= 0;
              const basse = !rupture && p.stock <= SEUIL;
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '11px 2px', borderBottom: '1px solid var(--line-soft, var(--line))',
                  }}
                >
                  <span style={{ flex: '1 1 190px', minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{p.name}</span>
                    {(rupture || basse) && (
                      <span style={{
                        fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase',
                        color: rupture ? 'var(--color-danger, #9E3428)' : 'var(--color-copper)',
                      }}>
                        {rupture ? 'rupture, à réassortir' : `plus que ${p.stock}`}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums', minWidth: 96, textAlign: 'right' }}>
                    {fmtMoney(p.priceXof, currency)}
                  </span>
                  {/* Le geste le plus fréquent de la journée — désormais TRACÉ
                      dès que l'inventaire connaît la fiche. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                    <button className="trv-sq" title="Retirer une unité" onClick={() => bouge(p, -1)}>−</button>
                    <span style={{ minWidth: 34, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.stock}</span>
                    <button className="trv-sq" title="Ajouter une unité" onClick={() => bouge(p, 1)}>+</button>
                  </span>
                  <span style={{ flex: 'none', display: 'flex', gap: 6 }}>
                    <button
                      className="trv-minibtn"
                      title="Modifier le produit"
                      onClick={() => setForm({ id: p.id, categoryId: p.categoryId, name: p.name, price: String(p.priceXof), stock: String(p.stock) })}
                    >
                      Modifier
                    </button>
                    <button className="trv-minibtn" title="Retirer de la Gamme" onClick={() => supprimer(p)}>Retirer</button>
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}

      {ligne && (
        <Modal title={ligne.id ? 'La ligne.' : 'Nouvelle ligne.'} onClose={() => setLigne(null)} width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de la ligne">
              <Input value={ligne.fon} onChange={(e) => setLigne({ ...ligne, fon: e.target.value })} placeholder="Ex. Bougies &amp; Parfums d’intérieur" />
            </Field>
            <Field label="Ce qu’elle rassemble">
              <Input value={ligne.label} onChange={(e) => setLigne({ ...ligne, label: e.target.value })} placeholder="Ex. La maison qui sent la Maison" />
            </Field>
            <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
              Une ligne est une collection de la Gamme. Elle apparaît ici, au Catalogue et à la Caisse,
              et se remplit de produits, jamais de rituels.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setLigne(null)}>Annuler</Button>
              <Button onClick={saveLigne}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}

      {form && (
        <Modal title={form.id ? 'Le produit.' : 'Nouveau produit.'} onClose={() => setForm(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Vapo Hydra Mist 350 ml" />
            </Field>
            <Field label="Ligne">
              <select className="ds-select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {toutes.map((c) => (
                  <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                ))}
              </select>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Prix (F CFA)">
                <Input inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="8 000" />
              </Field>
              <Field label="Stock">
                <Input inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
              <Button onClick={save}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ═══════════════ L'INVENTAIRE — les quatre familles ═══════════════ */

type FicheForm = {
  id: string | null;
  nom: string; famille: FamilleProduit; sousFamille: string; unite: string;
  conditionnement: string; prixAchat: string; fournisseurId: string;
  seuil: string; cible: string; emplacement: string; stockInitial: string;
};
const ficheVide = (): FicheForm => ({
  id: null, nom: '', famille: 'consommable', sousFamille: '', unite: '', conditionnement: '',
  prixAchat: '', fournisseurId: '', seuil: '0', cible: '0', emplacement: '', stockInitial: '0',
});

/* ═══════ LA VUE D'ENSEMBLE — le Magasin d'un regard (maquette du 8 sept.) ═══════
   Cinq chiffres de tête, UN tableau : code, produit, jauge de réserve contre
   la cible, les deux prix, la marge, l'état. Une ligne ouvre sa fiche. */
function OngletVue() {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [fournisseurs] = useFournisseurs();
  const [gamme] = useProducts();
  const [fiche, setFiche] = useState<FicheForm | null>(null);
  const [ajuste, setAjuste] = useState<{ p: ProduitStock; qte: string; note: string; perte: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const [famF, setFamF] = useState<FamilleProduit | 'toutes'>('toutes');
  const [seulAlerte, setSeulAlerte] = useState(false);

  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const soldes = useMemo(() => soldesApres(mouvements), [mouvements]);
  const nomFournisseur = (id?: string) => fournisseurs.find((f) => f.id === id)?.nom ?? '—';

  const liste = useMemo(() => {
    /* Le même juge que partout : « vapo » trouve Vapo, accents libres. */
    return produits
      .filter((p) => p.branchId === branch.id && (inactifs || p.actif))
      .filter((p) => prestationRepond(`${p.nom} ${p.code}`, q))
      .filter((p) => famF === 'toutes' || p.famille === famF)
      .filter((p) => !seulAlerte || aCommander(p, stocks.get(p.id) ?? 0))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [produits, branch.id, q, inactifs, famF, seulAlerte, stocks]);

  /* Les cinq chiffres de tête — actifs de la branche, hors filtres. */
  const actives = produits.filter((p) => p.branchId === branch.id && p.actif);
  const valeurAchat = actives.reduce((s, p) => s + (stocks.get(p.id) ?? 0) * p.prixAchatXof, 0);
  const valeurVente = actives.reduce((s, p) => s + (stocks.get(p.id) ?? 0) * (prixVenteDe(p, gamme) ?? 0), 0);
  const coutRevente = actives.reduce((s, p) => s + (p.famille === 'revente' ? (stocks.get(p.id) ?? 0) * p.prixAchatXof : 0), 0);
  const margePot = Math.max(0, valeurVente - coutRevente);
  const nAlerte = actives.filter((p) => aCommander(p, stocks.get(p.id) ?? 0)).length;
  const nRupture = actives.filter((p) => etatReserve(p, stocks.get(p.id) ?? 0) === 'rupture').length;
  const sansFiche = gamme.filter((g) => !produits.some((p) => p.catalogProductId === g.id)).length;

  const enregistrer = () => {
    if (!fiche) return;
    const nombre = (s: string) => Math.round(litQuantite(s) || 0);
    if (fiche.id) {
      produitsStockStore.set((prev) => prev.map((p) => (p.id === fiche.id ? {
        ...p,
        nom: fiche.nom.trim() || p.nom,
        sousFamille: fiche.sousFamille.trim() || undefined,
        unite: fiche.unite.trim() || p.unite,
        conditionnement: fiche.conditionnement.trim() || undefined,
        prixAchatXof: nombre(fiche.prixAchat),
        fournisseurId: fiche.fournisseurId || undefined,
        seuilAlerte: nombre(fiche.seuil),
        stockCible: nombre(fiche.cible),
        emplacement: fiche.emplacement.trim() || undefined,
      } : p)));
      setFiche(null);
      return;
    }
    const r = creerProduitStock(branch.id, {
      nom: fiche.nom, famille: fiche.famille, unite: fiche.unite,
      sousFamille: fiche.sousFamille || undefined, conditionnement: fiche.conditionnement || undefined,
      prixAchatXof: nombre(fiche.prixAchat), fournisseurId: fiche.fournisseurId || undefined,
      seuilAlerte: nombre(fiche.seuil), stockCible: nombre(fiche.cible),
      emplacement: fiche.emplacement || undefined,
    }, litQuantite(fiche.stockInitial) || 0, jour());
    if (!r.ok) { window.alert(r.erreur); return; }
    setFiche(null);
  };

  const appliquerAjustement = () => {
    if (!ajuste) return;
    const n = parseInt(ajuste.qte.replace(/[^0-9-]/g, ''), 10);
    const r = ajuste.perte
      ? declarerPerte(ajuste.p, n, ajuste.note, jour())
      : ajusterStock(ajuste.p, n, ajuste.note, jour());
    if (!r.ok) { window.alert(r.erreur); return; }
    setAjuste(null);
  };

  return (
    <>
      {/* Les cinq chiffres de tête — la maquette du 8 septembre. */}
      <div className="trv-mag-kpis">
        <div className="trv-mag-kpi"><small>Valeur au coût</small><b>{fmtMoney(valeurAchat, currency)}</b><i>prix d’achat</i></div>
        <div className="trv-mag-kpi"><small>Valeur à la vente</small><b>{fmtMoney(valeurVente, currency)}</b><i>revente seule</i></div>
        <div className="trv-mag-kpi"><small>Marge potentielle</small><b>{fmtMoney(margePot, currency)}</b><i>{valeurVente > 0 ? `${Math.round((margePot / valeurVente) * 100)} % du rayon` : 'aucune revente en stock'}</i></div>
        <div className="trv-mag-kpi"><small>Références actives</small><b>{actives.length}</b><i>{new Set(actives.map((x) => x.famille)).size} famille{new Set(actives.map((x) => x.famille)).size > 1 ? 's' : ''}</i></div>
        <div className={`trv-mag-kpi${nAlerte ? ' trv-mag-kpi--alerte' : ''}`}><small>À commander</small><b>{nAlerte}</b><i>{nRupture ? `${nRupture} en rupture` : 'aucune rupture'}</i></div>
      </div>

      {sansFiche > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12, border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--copper-50)', padding: '11px 14px' }}>
          <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {sansFiche} produit{sansFiche > 1 ? 's' : ''} de la Gamme sans fiche d’inventaire.
            La reprise crée les fiches (famille Revente, liées) et transforme le stock affiché en mouvement « Inventaire initial ».
            Attendez la pastille <b style={{ fontWeight: 600 }}>Synchronisé</b> avant de lancer.
          </span>
          <Button
            variant="copper" size="sm"
            onClick={() => {
              const n = reprendreGamme(branch.id, jour());
              window.alert(n ? `${n} fiche${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}.` : 'Rien à reprendre.');
            }}
          >
            Reprendre la Gamme
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" className={`trv-pill${famF === 'toutes' ? ' is-active' : ''}`} onClick={() => setFamF('toutes')}>Toutes</button>
        {(Object.keys(FAMILLES) as FamilleProduit[]).map((f) => (
          <button key={f} type="button" className={`trv-pill${famF === f ? ' is-active' : ''}`} onClick={() => setFamF(f)}>
            {FAMILLES[f].nom}
          </button>
        ))}
        <button type="button" className={`trv-pill${seulAlerte ? ' is-active--copper' : ''}`} onClick={() => setSeulAlerte((v) => !v)}>
          À commander seulement
        </button>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit… (vapo, karité, gants)" style={{ flex: '1 1 220px' }} />
        <Button onClick={() => setFiche(ficheVide())}>+ Fiche produit</Button>
      </div>
      <label className="mnd-muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 8 }}>
        <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />
        voir les fiches désactivées
      </label>

      <div style={{ overflowX: 'auto' }}>
        <table className="tre-table trv-mag-table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Code</th><th>Produit</th><th>Réserve</th>
              <th style={{ textAlign: 'right' }}>Achat</th><th style={{ textAlign: 'right' }}>Vente</th>
              <th style={{ textAlign: 'right' }}>Marge</th><th>État</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((pr) => {
              const st = stocks.get(pr.id) ?? 0;
              const etat = etatReserve(pr, st);
              const vente = prixVenteDe(pr, gamme);
              const marge = margePct(pr, gamme);
              const pct = pr.stockCible > 0 ? Math.max(0, Math.min(100, (st / pr.stockCible) * 100)) : (st > 0 ? 100 : 0);
              return (
                <tr
                  key={pr.id}
                  className="trv-mag-ligne"
                  style={pr.actif ? undefined : { opacity: .55 }}
                  onClick={() => setFiche({
                    id: pr.id, nom: pr.nom, famille: pr.famille, sousFamille: pr.sousFamille ?? '',
                    unite: pr.unite, conditionnement: pr.conditionnement ?? '',
                    prixAchat: String(pr.prixAchatXof), fournisseurId: pr.fournisseurId ?? '',
                    seuil: String(pr.seuilAlerte), cible: String(pr.stockCible),
                    emplacement: pr.emplacement ?? '', stockInitial: '0',
                  })}
                >
                  <td style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{pr.code}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{pr.nom}</span>
                    <div className="mnd-muted" style={{ fontSize: 10.5 }}>
                      {FAMILLES[pr.famille].nom}{pr.sousFamille ? ` · ${pr.sousFamille}` : ''}{pr.fournisseurId ? ` · ${nomFournisseur(pr.fournisseurId)}` : ''}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`trv-mag-jauge trv-mag-jauge--${etat}`}><i style={{ width: `${pct}%` }} /></span>
                    <small className="mnd-muted" style={{ display: 'block', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
                      {st.toLocaleString('fr-FR')} / cible {pr.stockCible} · seuil {pr.seuilAlerte}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmtMoney(pr.prixAchatXof, currency)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                    {pr.famille === 'revente' ? (vente !== undefined ? fmtMoney(vente, currency) : '—') : <span className="mnd-muted" style={{ fontSize: 11 }}>coût</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{marge !== undefined ? `${marge} %` : ''}</td>
                  <td><span className={`trv-mag-etat trv-mag-etat--${etat}`}>{ETAT_MOTS[etat]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {liste.length === 0 && (
        <div className="mnd-muted" style={{ fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
          {q.trim() || famF !== 'toutes' || seulAlerte
            ? 'Aucune fiche ne répond à ces filtres.'
            : 'Aucune fiche d’inventaire. Reprenez la Gamme ci-dessus, puis créez les consommables, les mèches et le jetable, les recettes des services s’appuieront dessus.'}
        </div>
      )}

      {ajuste && (
        <Modal
          title={ajuste.perte ? `Perte · ${ajuste.p.nom}.` : `Ajuster · ${ajuste.p.nom}.`}
          onClose={() => setAjuste(null)} width={440}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={ajuste.perte ? `Quantité perdue (${ajuste.p.unite})` : `Quantité comptée (${ajuste.p.unite})`}>
              <Input inputMode="numeric" value={ajuste.qte} onChange={(e) => setAjuste({ ...ajuste, qte: e.target.value })} autoFocus />
            </Field>
            <Field label="Pourquoi (le journal le gardera)">
              <Input
                value={ajuste.note}
                onChange={(e) => setAjuste({ ...ajuste, note: e.target.value })}
                placeholder={ajuste.perte ? 'Pot renversé, péremption…' : 'Inventaire du soir…'}
              />
            </Field>
            <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
              {ajuste.perte
                ? 'La perte s’écrit au journal, elle se voit, elle ne se devine pas.'
                : `Le journal écrira l’écart avec le stock dérivé (${(stocks.get(ajuste.p.id) ?? 0).toLocaleString('fr-FR')}), jamais un chiffre posé.`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setAjuste(null)}>Annuler</Button>
              <Button variant="copper" onClick={appliquerAjustement}>{ajuste.perte ? 'Déclarer la perte' : 'Écrire l’ajustement'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {fiche && (() => {
        /* ══ LA FICHE EN BLOCS — la maquette du 8 septembre ══════════
           Des cases nommées, groupées : Identité, Réassort, Coûts, et le
           kardex du produit avec le solde après chaque ligne. La famille
           décide des cases visibles ; le prix de vente se LIT sur la
           fiche Gamme liée, jamais saisi ici. */
        const pEdit = fiche.id ? produits.find((x) => x.id === fiche.id) : undefined;
        const stEdit = pEdit ? (stocks.get(pEdit.id) ?? 0) : 0;
        const etatEdit = pEdit ? etatReserve(pEdit, stEdit) : null;
        const fEdit = fournisseurs.find((f) => f.id === fiche.fournisseurId);
        const venteEdit = pEdit ? prixVenteDe(pEdit, gamme) : undefined;
        const margeEdit = pEdit ? margePct(pEdit, gamme) : undefined;
        const gammeEdit = pEdit?.catalogProductId ? gamme.find((g) => g.id === pEdit.catalogProductId) : undefined;
        const cibleN = Math.round(litQuantite(fiche.cible) || 0);
        const aCmd = pEdit ? Math.max(0, cibleN - stEdit) : 0;
        const kardex = pEdit ? mouvements.filter((m) => m.produitId === pEdit.id).slice(-8).reverse() : [];
        const pctEdit = cibleN > 0 ? Math.max(0, Math.min(100, (stEdit / cibleN) * 100)) : (stEdit > 0 ? 100 : 0);
        return (
          <Modal title={fiche.id ? 'La fiche produit.' : 'Nouvelle fiche produit.'} onClose={() => setFiche(null)} width={760}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="trv-mag-fichetete">
                <div>
                  <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.06em' }}>{pEdit ? pEdit.code : 'le code se pose tout seul à l’enregistrement'}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <span className="trv-mag-etat trv-mag-etat--famille">{FAMILLES[fiche.famille].nom}</span>
                    {pEdit && !pEdit.actif && <span className="trv-mag-etat trv-mag-etat--rupture">Désactivée</span>}
                    {etatEdit && <span className={`trv-mag-etat trv-mag-etat--${etatEdit}`}>{ETAT_MOTS[etatEdit]}</span>}
                  </div>
                </div>
                {pEdit && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--color-indigo)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {stEdit.toLocaleString('fr-FR')} <span style={{ fontSize: 15, color: 'var(--ink-soft)' }}>/ {cibleN}</span>
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 10.5 }}>en réserve / cible · {pEdit.unite}</div>
                    <span className={`trv-mag-jauge trv-mag-jauge--${etatEdit}`} style={{ marginTop: 6, marginLeft: 'auto' }}><i style={{ width: `${pctEdit}%` }} /></span>
                  </div>
                )}
              </div>

              <div className="trv-mag-blocs">
                <div className="trv-mag-bloc">
                  <div className="trv-mag-bloc__t">Identité</div>
                  <div className="trv-mag-bloc__c">
                    <Field label="Nom">
                      <Input value={fiche.nom} onChange={(e) => setFiche({ ...fiche, nom: e.target.value })} placeholder="Ex. Henné du Sahel" autoFocus={!fiche.id} />
                    </Field>
                    <div className="tr-grid tr-grid--2">
                      <Field label="Famille">
                        <Select value={fiche.famille} disabled={!!fiche.id} onChange={(e) => setFiche({ ...fiche, famille: e.target.value as FamilleProduit })}>
                          {(Object.keys(FAMILLES) as FamilleProduit[]).map((f) => (
                            <option key={f} value={f}>{FAMILLES[f].nom}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Sous-famille">
                        <Input value={fiche.sousFamille} onChange={(e) => setFiche({ ...fiche, sousFamille: e.target.value })} placeholder="HOME RITUALS™…" />
                      </Field>
                    </div>
                    <div className="tr-grid tr-grid--2">
                      <Field label="Unité (ml, g, pièce…)">
                        <Input value={fiche.unite} onChange={(e) => setFiche({ ...fiche, unite: e.target.value })} placeholder="pièce" />
                      </Field>
                      <Field label="Conditionnement">
                        <Input value={fiche.conditionnement} onChange={(e) => setFiche({ ...fiche, conditionnement: e.target.value })} placeholder="Pot de 250 g" />
                      </Field>
                    </div>
                    <Field label="Emplacement">
                      <Input value={fiche.emplacement} onChange={(e) => setFiche({ ...fiche, emplacement: e.target.value })} placeholder="Étagère vitrine · B2" />
                    </Field>
                  </div>
                </div>

                <div className="trv-mag-bloc">
                  <div className="trv-mag-bloc__t">Réassort &amp; fournisseur</div>
                  <div className="trv-mag-bloc__c">
                    <Field label="Fournisseur">
                      <Select value={fiche.fournisseurId} onChange={(e) => setFiche({ ...fiche, fournisseurId: e.target.value })}>
                        <option value="">—</option>
                        {fournisseurs.filter((f) => f.actif).map((f) => (
                          <option key={f.id} value={f.id}>{f.code} · {f.nom}</option>
                        ))}
                      </Select>
                    </Field>
                    {fEdit && (
                      <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: -6 }}>
                        {[fEdit.delaiJours !== undefined ? `livre sous ${fEdit.delaiJours} j` : '', fEdit.conditionsPaiement].filter(Boolean).join(' · ') || 'ni délai ni conditions notés'}
                      </div>
                    )}
                    <div className="tr-grid tr-grid--2">
                      <Field label="Seuil d’alerte">
                        <Input inputMode="numeric" value={fiche.seuil} onChange={(e) => setFiche({ ...fiche, seuil: e.target.value })} />
                      </Field>
                      <Field label="Stock cible">
                        <Input inputMode="numeric" value={fiche.cible} onChange={(e) => setFiche({ ...fiche, cible: e.target.value })} />
                      </Field>
                    </div>
                    {pEdit && (
                      <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                        À commander : <b style={{ fontWeight: 600, color: aCmd > 0 ? 'var(--copper-700)' : 'inherit' }}>{aCmd.toLocaleString('fr-FR')}</b> (cible − réserve), proposé au prochain bon.
                      </div>
                    )}
                    {!fiche.id && (
                      <Field label="Stock de départ (compté aujourd’hui)">
                        <Input inputMode="numeric" value={fiche.stockInitial} onChange={(e) => setFiche({ ...fiche, stockInitial: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </div>

                <div className="trv-mag-bloc">
                  <div className="trv-mag-bloc__t">Coûts &amp; marge · personnel seulement</div>
                  <div className="trv-mag-bloc__c">
                    <Field label="Prix d’achat (F CFA, par unité)">
                      <Input inputMode="numeric" value={fiche.prixAchat} onChange={(e) => setFiche({ ...fiche, prixAchat: e.target.value })} />
                    </Field>
                    {fiche.famille === 'revente' ? (
                      <>
                        <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                          Fiche Gamme liée : <b style={{ fontWeight: 600 }}>{gammeEdit ? gammeEdit.name : 'aucune'}</b>
                          {gammeEdit ? '' : ' · le lien se pose par « Reprendre la Gamme »'}
                        </div>
                        <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                          Prix de vente : <b style={{ fontWeight: 600 }}>{venteEdit !== undefined ? fmtMoney(venteEdit, currency) : '—'}</b> · lu sur la fiche Gamme, jamais saisi ici
                        </div>
                        {margeEdit !== undefined && (
                          <div>
                            <span className="mnd-muted" style={{ fontSize: 11.5 }}>Marge : <b style={{ fontWeight: 600 }}>{margeEdit} %</b></span>
                            <span className="trv-mag-marge"><i style={{ width: `${Math.max(0, Math.min(100, margeEdit))}%` }} /></span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                        {FAMILLES[fiche.famille].dit}
                      </div>
                    )}
                  </div>
                </div>

                {pEdit && (
                  <div className="trv-mag-bloc">
                    <div className="trv-mag-bloc__t">Kardex · les 8 derniers mouvements</div>
                    <div className="trv-mag-bloc__c" style={{ overflowX: 'auto' }}>
                      {kardex.length === 0 && <div className="mnd-muted" style={{ fontSize: 12 }}>Aucun mouvement encore.</div>}
                      {kardex.length > 0 && (
                        <table className="trv-mag-kardex">
                          <thead><tr><th>Date</th><th>Mouvement</th><th style={{ textAlign: 'right' }}>Qté</th><th>Référence</th><th style={{ textAlign: 'right' }}>Solde</th></tr></thead>
                          <tbody>
                            {kardex.map((m) => (
                              <tr key={m.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{frJour(m.date)}</td>
                                <td><span className={`trv-mag-mvt trv-mag-mvt--${MVT_CLASSE[m.type]}`}>{MOUVEMENT_NOMS[m.type]}</span></td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.quantite < 0 ? 'var(--indigo-500, #3A3F72)' : '#4c7a4c' }}>
                                  {m.quantite > 0 ? '+' : ''}{m.quantite.toLocaleString('fr-FR')}
                                </td>
                                <td className="mnd-muted" style={{ fontSize: 11 }}>{m.reference ?? m.note ?? '—'}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(soldes.get(m.id) ?? 0).toLocaleString('fr-FR')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {!fiche.id && (
                <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                  Le stock de départ s’écrit au journal comme « Inventaire initial », la fiche, elle,
                  ne porte jamais de compteur.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  {pEdit && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setAjuste({ p: pEdit, qte: String(stEdit), note: '', perte: false })}>
                        Entrée / sortie manuelle…
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAjuste({ p: pEdit, qte: '', note: '', perte: true })}>
                        Perte…
                      </Button>
                      <Button
                        size="sm" variant="ghost" style={{ color: pEdit.actif ? '#8f3b30' : undefined }}
                        onClick={() => produitsStockStore.set((prev) => prev.map((x) => (x.id === pEdit.id ? { ...x, actif: !x.actif } : x)))}
                      >
                        {pEdit.actif ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    </>
                  )}
                </span>
                <span style={{ display: 'inline-flex', gap: 10 }}>
                  <Button variant="ghost" onClick={() => setFiche(null)}>Annuler</Button>
                  <Button variant="copper" onClick={enregistrer}>Enregistrer la fiche</Button>
                </span>
              </div>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}

/* ═══════════════ LES ACHATS — réappro, fournisseurs, bons ═══════════════ */

type FournisseurForm = { id: string | null; nom: string; telephone: string; produitsFournis: string; delai: string; conditions: string };

function OngletAchats() {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [fournisseurs] = useFournisseurs();
  const [commandes] = useCommandesAchat();
  const [lignes] = useLignesAchat();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ff, setFf] = useState<FournisseurForm | null>(null);
  const [nouveauBc, setNouveauBc] = useState<string>('');
  const [recus, setRecus] = useState<Record<string, string>>({});

  const groupes = useMemo(() => reappro(produits, mouvements, branch.id), [produits, mouvements, branch.id]);
  const mesCommandes = useMemo(
    () => commandes.filter((c) => c.branchId === branch.id).sort((a, b) => b.numero.localeCompare(a.numero)),
    [commandes, branch.id],
  );
  const fournisseur = (id: string) => fournisseurs.find((f) => f.id === id);
  const produit = (id: string) => produits.find((p) => p.id === id);

  /* COMPORTEMENT D → A : la liste de courses devient un bon d'un geste. */
  const preparerBon = (fournisseurId: string) => {
    const liste = groupes.get(fournisseurId) ?? [];
    if (!liste.length) return;
    const r = creerCommande(branch.id, fournisseurId, jour());
    if (!r.ok || !r.id) { window.alert(r.erreur); return; }
    const cmd = commandesAchatStoreGet(r.id);
    if (cmd) for (const l of liste) ajouterLigneCommande(cmd, l.produit, l.aCommander);
    setOuvert(r.id);
  };

  const enregistrerFournisseur = () => {
    if (!ff) return;
    if (ff.id) {
      fournisseursStore.set((prev) => prev.map((f) => (f.id === ff.id ? {
        ...f, nom: ff.nom.trim() || f.nom, telephone: ff.telephone.trim() || undefined,
        produitsFournis: ff.produitsFournis.trim() || undefined,
        /* `|| undefined` gommait le zéro : livrer le jour même est un délai. */
        delaiJours: Number.isFinite(parseInt(ff.delai, 10)) ? parseInt(ff.delai, 10) : undefined,
        conditionsPaiement: ff.conditions.trim() || undefined,
      } : f)));
    } else {
      const r = creerFournisseur(branch.id, {
        nom: ff.nom, telephone: ff.telephone, produitsFournis: ff.produitsFournis,
        delaiJours: Number.isFinite(parseInt(ff.delai, 10)) ? parseInt(ff.delai, 10) : undefined, conditionsPaiement: ff.conditions,
      });
      if (!r.ok) { window.alert(r.erreur); return; }
    }
    setFf(null);
  };

  const commande = ouvert ? mesCommandes.find((c) => c.id === ouvert) : null;

  return (
    <>
      {/* ── Le réapprovisionnement — la liste de courses se fait seule ── */}
      <section style={{ marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, paddingBottom: 7, borderBottom: '2px solid var(--line)' }}>
          À racheter
        </div>
        {groupes.size === 0 && (
          <div className="mnd-muted" style={{ fontSize: 12.5, padding: '12px 2px' }}>
            Rien sous les seuils, la réserve tient.
          </div>
        )}
        {[...groupes.entries()].map(([fid, liste]) => {
          const f = fournisseur(fid);
          const total = liste.reduce((s, l) => s + l.coutEstimeXof, 0);
          return (
            <div key={fid || 'sans'} style={{ marginTop: 12, border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--surface-card)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: 'var(--color-indigo)' }}>
                  {f ? `${f.nom}` : 'Sans fournisseur, à désigner sur les fiches'}
                  {f?.delaiJours ? <span className="mnd-muted" style={{ fontSize: 11 }}> · livre sous {f.delaiJours} j</span> : null}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>{fmtMoney(total, currency)} estimés</span>
                  {f && <Button size="sm" variant="copper" onClick={() => preparerBon(fid)}>Préparer le bon</Button>}
                </span>
              </div>
              {liste.map((l) => (
                <div key={l.produit.id} className="mnd-muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>{l.produit.code} · {l.produit.nom}, reste {l.stock.toLocaleString('fr-FR')} {l.produit.unite}</span>
                  <span>commander {l.aCommander.toLocaleString('fr-FR')} · {fmtMoney(l.coutEstimeXof, currency)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </section>

      {/* ── Les bons de commande ── */}
      <section style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingBottom: 7, borderBottom: '2px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>Bons de commande</span>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Select value={nouveauBc} onChange={(e) => setNouveauBc(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Nouveau bon chez…</option>
              {fournisseurs.filter((f) => f.branchId === branch.id && f.actif).map((f) => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </Select>
            <Button
              size="sm"
              onClick={() => {
                if (!nouveauBc) return;
                const r = creerCommande(branch.id, nouveauBc, jour());
                if (r.ok && r.id) setOuvert(r.id);
                setNouveauBc('');
              }}
            >
              Créer
            </Button>
          </span>
        </div>
        {mesCommandes.length === 0 && (
          <div className="mnd-muted" style={{ fontSize: 12.5, padding: '12px 2px' }}>Aucun bon pour l’instant.</div>
        )}
        {mesCommandes.map((c) => {
          const ls = lignesDe(lignes, c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setOuvert(c.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
                width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', background: 'none',
                border: 'none', borderBottom: '1px solid var(--hairline)', padding: '10px 2px',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{c.numero}</span>
                <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 10 }}>
                  {fournisseur(c.fournisseurId)?.nom ?? '—'} · {frJour(c.dateCommande)} · {ls.length} ligne{ls.length > 1 ? 's' : ''}
                </span>
              </span>
              <span style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline', flex: 'none' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmtMoney(totalCommande(ls), currency)}</span>
                <Statut ok={c.statut === 'recue'}>{COMMANDE_NOMS[c.statut]}</Statut>
              </span>
            </button>
          );
        })}
      </section>

      {/* ── Les fournisseurs ── */}
      <section style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingBottom: 7, borderBottom: '2px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>Fournisseurs</span>
          <Button size="sm" variant="ghost" onClick={() => setFf({ id: null, nom: '', telephone: '', produitsFournis: '', delai: '', conditions: '' })}>
            + Fournisseur
          </Button>
        </div>
        {fournisseurs.filter((f) => f.branchId === branch.id).map((f) => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '10px 2px', borderBottom: '1px solid var(--hairline)', opacity: f.actif ? 1 : .55 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13.5 }}>{f.code} · {f.nom}</span>
              <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                {[f.telephone, f.produitsFournis, f.delaiJours ? `${f.delaiJours} j` : '', f.conditionsPaiement].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span style={{ flex: 'none', display: 'inline-flex', gap: 6 }}>
              <button className="trv-minibtn" onClick={() => setFf({ id: f.id, nom: f.nom, telephone: f.telephone ?? '', produitsFournis: f.produitsFournis ?? '', delai: f.delaiJours ? String(f.delaiJours) : '', conditions: f.conditionsPaiement ?? '' })}>Modifier</button>
              <button className="trv-minibtn" onClick={() => fournisseursStore.set((prev) => prev.map((x) => (x.id === f.id ? { ...x, actif: !x.actif } : x)))}>
                {f.actif ? 'Désactiver' : 'Réactiver'}
              </button>
            </span>
          </div>
        ))}
      </section>

      {/* ── Le bon ouvert — lignes, envoi, réception ── */}
      {commande && (
        <Modal title={`${commande.numero} · ${fournisseur(commande.fournisseurId)?.nom ?? ''}.`} onClose={() => setOuvert(null)} width={780}>
          <BonOuvert commande={commande} recus={recus} setRecus={setRecus} />
        </Modal>
      )}

      {ff && (
        <Modal title={ff.id ? 'Le fournisseur.' : 'Nouveau fournisseur.'} onClose={() => setFf(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="tr-grid tr-grid--2">
              <Field label="Nom"><Input value={ff.nom} onChange={(e) => setFf({ ...ff, nom: e.target.value })} autoFocus /></Field>
              <Field label="Téléphone"><Input value={ff.telephone} onChange={(e) => setFf({ ...ff, telephone: e.target.value })} /></Field>
            </div>
            <Field label="Ce qu’il fournit">
              <Input value={ff.produitsFournis} onChange={(e) => setFf({ ...ff, produitsFournis: e.target.value })} placeholder="Henné, indigo, huiles…" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Délai de livraison (jours)"><Input inputMode="numeric" value={ff.delai} onChange={(e) => setFf({ ...ff, delai: e.target.value })} /></Field>
              <Field label="Conditions de paiement"><Input value={ff.conditions} onChange={(e) => setFf({ ...ff, conditions: e.target.value })} placeholder="Comptant, 30 j…" /></Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setFf(null)}>Annuler</Button>
              <Button onClick={enregistrerFournisseur}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* Lire une commande fraîchement créée sans attendre le re-rendu. */
const commandesAchatStoreGet = (id: string): CommandeFournisseur | undefined =>
  commandesAchatStore.get().find((c) => c.id === id);

function BonOuvert({ commande, recus, setRecus }: {
  commande: CommandeFournisseur;
  recus: Record<string, string>;
  setRecus: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  /* ══ LE BON EST UN DOCUMENT — la maquette du 8 septembre ═══════════
     Un numéro qui se lit de loin, le fournisseur et ses conditions, un
     statut qui AVANCE (brouillon, envoyée, partielle, reçue), des lignes
     au prix figé du jour, une réception qui peut être partielle et qui
     écrit elle-même les entrées au journal. */
  const { currency } = useBranch();
  const [produits] = useProduitsStock();
  const [lignes] = useLignesAchat();
  const [fournisseurs] = useFournisseurs();
  const [ajout, setAjout] = useState<{ produitId: string; qte: string }>({ produitId: '', qte: '' });

  const ls = lignesDe(lignes, commande.id);
  const produit = (id: string) => produits.find((x) => x.id === id);
  const f = fournisseurs.find((x) => x.id === commande.fournisseurId);
  const brouillon = commande.statut === 'brouillon';
  const recevable = commande.statut === 'envoyee' || commande.statut === 'partielle';

  const ETAPES: { s: typeof commande.statut; l: string }[] = [
    { s: 'brouillon', l: 'Brouillon' }, { s: 'envoyee', l: 'Envoyée' },
    { s: 'partielle', l: 'Partielle' }, { s: 'recue', l: 'Reçue' },
  ];
  const rang = ETAPES.findIndex((e) => e.s === commande.statut);

  /* La réception prévue se déduit du délai du fournisseur — affichage
     seulement, jamais gravée. */
  const prevue = (() => {
    if (commande.dateReceptionPrevue) return commande.dateReceptionPrevue;
    if (f?.delaiJours === undefined) return undefined;
    const d = new Date(`${commande.dateCommande}T12:00:00`);
    d.setDate(d.getDate() + f.delaiJours);
    return d.toISOString().slice(0, 10);
  })();

  const texteWa = [
    `Bon de commande ${commande.numero}`,
    ...ls.map((l) => {
      const pr = produit(l.produitId);
      return `· ${pr?.nom ?? l.produitId} : ${l.quantiteCommandee.toLocaleString('fr-FR')} ${pr?.unite ?? ''}`.trim();
    }),
  ].join('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="trv-mag-doctete">
        <div>
          <div className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>Numéro</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-indigo)' }}>{commande.numero}</div>
        </div>
        <div className="trv-mag-carte">
          <b>{f ? `${f.code} · ${f.nom}` : 'Fournisseur retiré'}</b>
          <small>{[f?.telephone, f?.delaiJours !== undefined ? `délai ${f.delaiJours} j` : ''].filter(Boolean).join(' · ') || 'sans téléphone noté'}</small>
          <small>{f?.conditionsPaiement ?? ''}</small>
        </div>
        <div className="trv-mag-carte">
          <b style={{ fontSize: 14 }}>Dates</b>
          <small>Commandé le {frJour(commande.dateCommande)}</small>
          <small>{prevue ? `Réception prévue le ${frJour(prevue)}` : 'Réception prévue : selon le fournisseur'}</small>
        </div>
      </div>

      {commande.statut === 'annulee' ? (
        <div><span className="trv-mag-etat trv-mag-etat--rupture">Annulée</span></div>
      ) : (
        <div className="trv-mag-etapes">
          {ETAPES.map((e, iE) => (
            <span key={e.s} className={`trv-mag-etape${iE < rang ? ' trv-mag-etape--fait' : ''}${iE === rang ? ' trv-mag-etape--la' : ''}`}>
              {e.l}
            </span>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="trv-mag-kardex" style={{ minWidth: 560, width: '100%' }}>
          <thead>
            <tr>
              <th>Produit</th><th style={{ textAlign: 'right' }}>Commandé</th>
              <th style={{ textAlign: 'right' }}>PU figé</th><th style={{ textAlign: 'right' }}>Montant</th>
              <th style={{ textAlign: 'right' }}>Reçu</th><th style={{ textAlign: 'right' }}>Reste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ls.map((l) => {
              const pr = produit(l.produitId);
              const st = statutLigne(l);
              const reste = reliquat(l);
              return (
                <tr key={l.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14.5, color: 'var(--color-indigo)' }}>{pr?.nom ?? 'Fiche retirée'}</span>
                    <div className="mnd-muted" style={{ fontSize: 10.5 }}>{pr?.code}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.quantiteCommandee.toLocaleString('fr-FR')}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(l.prixAchatUnitaireXof, currency)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(coutLigne(l), currency)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {recevable ? (
                      <Input
                        inputMode="numeric"
                        placeholder={l.quantiteRecue > 0 ? String(l.quantiteRecue) : '0'}
                        value={recus[l.id] ?? ''}
                        onChange={(e) => setRecus((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        style={{ width: 66, padding: '4px 8px', fontSize: 12, textAlign: 'right' }}
                      />
                    ) : (
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l.quantiteRecue.toLocaleString('fr-FR')}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: st === 'recue' ? '#4c7a4c' : reste > 0 && l.quantiteRecue > 0 ? '#9A6B1F' : undefined }}>
                    {st === 'recue' ? '0' : reste.toLocaleString('fr-FR')}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {brouillon && <button className="trv-minibtn" onClick={() => retirerLigneCommande(l)}>Retirer</button>}
                    {recevable && (
                      <Button
                        size="sm" variant="copper"
                        onClick={() => {
                          const q = litQuantite(recus[l.id] ?? '');
                          const r = recevoirLigne(l, q, jour());
                          if (!r.ok) { window.alert(r.erreur); return; }
                          setRecus((prev) => ({ ...prev, [l.id]: '' }));
                        }}
                      >
                        Recevoir
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
        <span className="mnd-muted" style={{ fontSize: 12 }}>Reçu : {fmtMoney(totalRecu(ls), currency)}</span>
        <span style={{ fontSize: 12 }}>Total commandé</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>{fmtMoney(totalCommande(ls), currency)}</span>
      </div>

      {brouillon && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <Field label="Ajouter un produit">
              <Select value={ajout.produitId} onChange={(e) => setAjout({ ...ajout, produitId: e.target.value })}>
                <option value="">—</option>
                {produits.filter((x) => x.branchId === commande.branchId && x.actif).map((x) => (
                  <option key={x.id} value={x.id}>{x.code} · {x.nom}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Quantité">
            <Input inputMode="numeric" value={ajout.qte} onChange={(e) => setAjout({ ...ajout, qte: e.target.value })} style={{ width: 90 }} />
          </Field>
          <Button
            size="sm"
            onClick={() => {
              const pr = produit(ajout.produitId);
              if (!pr) return;
              const r = ajouterLigneCommande(commande, pr, litQuantite(ajout.qte) || 0);
              if (!r.ok) { window.alert(r.erreur); return; }
              setAjout({ produitId: '', qte: '' });
            }}
          >
            Ajouter
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(commande.statut === 'brouillon' || commande.statut === 'envoyee') && (
            <Button
              size="sm" variant="ghost" style={{ color: '#8f3b30' }}
              onClick={() => { const r = annulerCommande(commande); if (!r.ok) window.alert(r.erreur); }}
            >
              Annuler le bon
            </Button>
          )}
          {ls.length > 0 && f?.telephone && (
            <WaLien phone={f.telephone} message={texteWa}>
              <Button size="sm" variant="ghost">Envoyer au fournisseur · WhatsApp</Button>
            </WaLien>
          )}
        </span>
        {brouillon && (
          <Button
            variant="indigo"
            onClick={() => { const r = envoyerCommande(commande); if (!r.ok) window.alert(r.erreur); }}
          >
            Marquer envoyé au fournisseur
          </Button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ LES RECETTES — ce qu'un service consomme ═══════════════ */

function OngletRecettes() {
  const { branch, currency } = useBranch();
  const [services] = useServices();
  const [produits] = useProduitsStock();
  const [consommations] = useConsommations();
  const [serviceId, setServiceId] = useState('');
  const [ajout, setAjout] = useState<{ produitId: string; qte: string }>({ produitId: '', qte: '' });

  const tries = useMemo(() => [...services].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [services]);
  const service = services.find((s) => s.id === serviceId);
  const recette = consommations.filter((c) => c.branchId === branch.id && c.serviceId === serviceId);
  const cout = serviceId ? coutMatiereXof(serviceId, consommations, produits, branch.id) : 0;
  const produit = (id: string) => produits.find((p) => p.id === id);

  /* Les services qui ont déjà une recette, pour s'y retrouver d'un regard. */
  const avecRecette = useMemo(() => {
    const ids = new Set(consommations.filter((c) => c.branchId === branch.id).map((c) => c.serviceId));
    return ids;
  }, [consommations, branch.id]);

  return (
    <>
      <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6, maxWidth: 640 }}>
        La recette dit ce qu’une prestation consomme, en quantités connues. Deux bénéfices : le stock
        se décrémente seul à l’encaissement, et le coût matière de chaque service se connaît,
        ce qui reste vraiment dans la caisse.
      </div>

      <div style={{ marginTop: 14, maxWidth: 460 }}>
        <Field label={`Prestation (${avecRecette.size} avec recette)`}>
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">—</option>
            {tries.map((s) => (
              <option key={s.id} value={s.id}>{avecRecette.has(s.id) ? '● ' : ''}{s.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      {service && (
        <div style={{ marginTop: 16, maxWidth: 640 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 7, borderBottom: '2px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>{service.name}</span>
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              Coût matière : <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>{fmtMoney(cout, currency)}</b>
              {service.priceXof > 0 && cout > 0 && ` · ${Math.round((cout / service.priceXof) * 100)} % du prix de repli`}
            </span>
          </div>

          {recette.length === 0 && (
            <div className="mnd-muted" style={{ fontSize: 12.5, padding: '12px 2px' }}>
              Aucune recette, cette prestation ne décrémente rien à l’encaissement.
            </div>
          )}
          {recette.map((c) => {
            const p = produit(c.produitId);
            return (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '10px 2px', borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ fontSize: 13 }}>{p?.code} · {p?.nom ?? 'Fiche retirée'}</span>
                <span style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{c.quantite.toLocaleString('fr-FR')} {c.unite}</span>
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>{p ? fmtMoney(c.quantite * p.prixAchatXof, currency) : '—'}</span>
                  <button className="trv-minibtn" onClick={() => retirerRecette(c)}>Retirer</button>
                </span>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            <div style={{ flex: '1 1 220px' }}>
            <Field label="Produit consommé">
              <Select value={ajout.produitId} onChange={(e) => setAjout({ ...ajout, produitId: e.target.value })}>
                <option value="">—</option>
                {produits.filter((p) => p.branchId === branch.id && p.actif && p.famille !== 'revente').map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.nom} ({p.unite})</option>
                ))}
              </Select>
            </Field>
            </div>
            <Field label="Quantité">
              <Input inputMode="numeric" value={ajout.qte} onChange={(e) => setAjout({ ...ajout, qte: e.target.value })} style={{ width: 90 }} />
            </Field>
            <Button
              size="sm"
              onClick={() => {
                const p = produit(ajout.produitId);
                if (!p || !serviceId) return;
                const r = poserRecette(branch.id, serviceId, p, litQuantite(ajout.qte) || 0);
                if (!r.ok) { window.alert(r.erreur); return; }
                setAjout({ produitId: '', qte: '' });
              }}
            >
              Ajouter
            </Button>
          </div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Reposer un produit déjà présent remplace sa ligne. La Revente ne se met pas en recette,
            elle se vend à la Caisse, elle ne se consomme pas.
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════ LE JOURNAL — rien ne bouge par magie ═══════════════ */

type FiltreJournal = 'tous' | 'entrees' | 'sorties' | 'ajustements' | 'pertes';
const JOURNAL_FILTRES: { k: FiltreJournal; l: string }[] = [
  { k: 'tous', l: 'Tous' }, { k: 'entrees', l: 'Entrées' }, { k: 'sorties', l: 'Sorties' },
  { k: 'ajustements', l: 'Ajustements' }, { k: 'pertes', l: 'Pertes' },
];
const passeFiltre = (m: MouvementStock, f: FiltreJournal): boolean => {
  if (f === 'tous') return true;
  if (f === 'entrees') return m.type === 'entree_achat';
  if (f === 'sorties') return m.type === 'sortie_vente' || m.type === 'sortie_service' || m.type === 'fabrication';
  if (f === 'ajustements') return m.type === 'ajustement';
  return m.type === 'perte';
};

function OngletJournal() {
  const { branch } = useBranch();
  const [mouvements] = useMouvementsStock();
  const [produits] = useProduitsStock();
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState<FiltreJournal>('tous');
  const [produitF, setProduitF] = useState('');
  const [montre, setMontre] = useState(60);

  const produit = (id: string) => produits.find((x) => x.id === id);
  /* LE SOLDE APRÈS CHAQUE LIGNE se calcule sur le journal ENTIER, avant
     tout filtre — filtrer d'abord fausserait chaque solde. */
  const soldes = useMemo(() => soldesApres(mouvements), [mouvements]);

  const liste = useMemo(() => {
    return mouvements
      .filter((m) => m.branchId === branch.id)
      .filter((m) => passeFiltre(m, typeF))
      .filter((m) => !produitF || m.produitId === produitF)
      .filter((m) => {
        if (!q.trim()) return true;
        const pr = produit(m.produitId);
        return prestationRepond(`${pr?.nom ?? ''} ${pr?.code ?? ''} ${m.reference ?? ''} ${m.note ?? ''}`, q);
      })
      .slice()
      .reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouvements, branch.id, q, typeF, produitF, produits]);

  const fichesTriees = useMemo(
    () => produits.filter((x) => x.branchId === branch.id).sort((a, b) => a.code.localeCompare(b.code)),
    [produits, branch.id],
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        {JOURNAL_FILTRES.map((fj) => (
          <button key={fj.k} type="button" className={`trv-pill${typeF === fj.k ? ' is-active' : ''}`} onClick={() => setTypeF(fj.k)}>
            {fj.l}
          </button>
        ))}
        <Select value={produitF} onChange={(e) => setProduitF(e.target.value)} style={{ minWidth: 170 }}>
          <option value="">Tous les produits</option>
          {fichesTriees.map((x) => (
            <option key={x.id} value={x.id}>{x.code} · {x.nom}</option>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (produit, référence, motif)…" style={{ flex: '1 1 200px' }} />
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{liste.length.toLocaleString('fr-FR')} mouvement{liste.length > 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tre-table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Date</th><th>Produit</th><th>Mouvement</th><th style={{ textAlign: 'right' }}>Quantité</th><th>Référence · motif</th><th style={{ textAlign: 'right' }}>Solde</th></tr>
          </thead>
          <tbody>
            {liste.slice(0, montre).map((m) => {
              const pr = produit(m.produitId);
              return (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{frJour(m.date)}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {pr ? pr.nom : m.produitId}
                    <div className="mnd-muted" style={{ fontSize: 10 }}>{pr?.code}</div>
                  </td>
                  <td><span className={`trv-mag-mvt trv-mag-mvt--${MVT_CLASSE[m.type]}`}>{MOUVEMENT_NOMS[m.type]}</span></td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.quantite < 0 ? 'var(--indigo-500, #3A3F72)' : '#4c7a4c' }}>
                    {m.quantite > 0 ? '+' : ''}{m.quantite.toLocaleString('fr-FR')}{pr ? ` ${pr.unite}` : ''}
                  </td>
                  <td className="mnd-muted" style={{ fontSize: 11.5 }}>{[m.reference, m.note].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(soldes.get(m.id) ?? 0).toLocaleString('fr-FR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.length === 0 && (
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Aucun mouvement, le journal s’écrira à la première vente, réception ou prestation.
        </div>
      )}
      {liste.length > montre && (
        <Button variant="ghost" size="sm" style={{ marginTop: 12 }} onClick={() => setMontre((n) => n + 120)}>
          Afficher plus · {liste.length - montre} restants
        </Button>
      )}
    </>
  );
}

/* ═══════════════ L'INVENTAIRE COMPTÉ — la maquette du 8 septembre ═══════════════

   Une fois par mois, on compte. La feuille montre le théorique, la main
   saisit le compté, l'écart se juge seul, et la validation écrit les
   ajustements au journal — datés, motivés. UNE LIGNE NON COMPTÉE N'ÉCRIT
   RIEN : le silence n'est pas un zéro. Le geste passe par `ajusterStock`,
   la même porte sûre que partout (poste froid compris). */
function OngletComptage() {
  const { branch } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [famF, setFamF] = useState<FamilleProduit | 'toutes'>('toutes');
  const [q, setQ] = useState('');

  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const fiches = useMemo(() => produits
    .filter((x) => x.branchId === branch.id && x.actif)
    .filter((x) => famF === 'toutes' || x.famille === famF)
    .filter((x) => prestationRepond(`${x.nom} ${x.code}`, q))
    .sort((a, b) => a.code.localeCompare(b.code)), [produits, branch.id, famF, q]);

  const ecartDe = (x: ProduitStock): number | null => {
    const saisi = (comptes[x.id] ?? '').trim();
    if (!saisi) return null;
    const n = litQuantite(saisi);
    if (!Number.isFinite(n)) return null;
    return Math.round((n - (stocks.get(x.id) ?? 0)) * 1000) / 1000;
  };

  const aEcrire = fiches.filter((x) => { const e = ecartDe(x); return e !== null && e !== 0; });
  const sansMotif = aEcrire.filter((x) => !(motifs[x.id] ?? '').trim());
  const comptees = fiches.filter((x) => ecartDe(x) !== null).length;

  const valider = () => {
    if (!aEcrire.length) { window.alert('Aucun écart à écrire : soit rien n’est compté, soit tout est juste.'); return; }
    if (sansMotif.length) { window.alert(`${sansMotif.length} écart${sansMotif.length > 1 ? 's' : ''} sans motif. Chaque écart doit dire pourquoi, le journal le gardera.`); return; }
    if (!window.confirm(`Écrire ${aEcrire.length} ajustement${aEcrire.length > 1 ? 's' : ''} au journal, datés du jour ?`)) return;
    let ecrits = 0;
    for (const x of aEcrire) {
      const n = litQuantite(comptes[x.id] ?? '');
      const r = ajusterStock(x, n, `Inventaire du ${frJour(jour())} · ${(motifs[x.id] ?? '').trim()}`, jour());
      if (r.ok) ecrits += 1;
    }
    setComptes({});
    setMotifs({});
    window.alert(`${ecrits} ajustement${ecrits > 1 ? 's' : ''} écrit${ecrits > 1 ? 's' : ''}. Le journal porte la photo du jour.`);
  };

  return (
    <>
      <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6, maxWidth: 640 }}>
        Comptez ce que vous voyez, la feuille juge l’écart. Une ligne non comptée n’écrit rien :
        le silence n’est pas un zéro. La validation écrit chaque écart au journal, avec son motif.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" className={`trv-pill${famF === 'toutes' ? ' is-active' : ''}`} onClick={() => setFamF('toutes')}>Toutes</button>
        {(Object.keys(FAMILLES) as FamilleProduit[]).map((fx) => (
          <button key={fx} type="button" className={`trv-pill${famF === fx ? ' is-active' : ''}`} onClick={() => setFamF(fx)}>
            {FAMILLES[fx].nom}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ flex: '1 1 180px' }} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tre-table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Produit</th><th style={{ textAlign: 'right' }}>Théorique</th><th style={{ textAlign: 'right' }}>Compté</th><th style={{ textAlign: 'right' }}>Écart</th><th>Motif si écart</th></tr>
          </thead>
          <tbody>
            {fiches.map((x) => {
              const th = stocks.get(x.id) ?? 0;
              const e = ecartDe(x);
              return (
                <tr key={x.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14.5, color: 'var(--color-indigo)' }}>{x.nom}</span>
                    <div className="mnd-muted" style={{ fontSize: 10.5 }}>{x.code} · {x.unite}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{th.toLocaleString('fr-FR')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Input
                      inputMode="numeric"
                      value={comptes[x.id] ?? ''}
                      onChange={(ev) => setComptes((prev) => ({ ...prev, [x.id]: ev.target.value }))}
                      placeholder="—"
                      style={{ width: 74, padding: '4px 8px', fontSize: 12.5, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: e === null || e === 0 ? 'var(--ink-soft)' : e > 0 ? '#4c7a4c' : '#8f3b30' }}>
                    {e === null ? '' : e === 0 ? '0' : `${e > 0 ? '+' : ''}${e.toLocaleString('fr-FR')}`}
                  </td>
                  <td>
                    {e !== null && e !== 0 && (
                      <Input
                        value={motifs[x.id] ?? ''}
                        onChange={(ev) => setMotifs((prev) => ({ ...prev, [x.id]: ev.target.value }))}
                        placeholder="paquet entamé, boîte retrouvée…"
                        style={{ minWidth: 180, padding: '4px 8px', fontSize: 12 }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {fiches.length === 0 && (
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 14 }}>Aucune fiche active à compter ici.</div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        <Button variant="copper" onClick={valider}>
          Valider l’inventaire{aEcrire.length ? ` · ${aEcrire.length} ajustement${aEcrire.length > 1 ? 's' : ''}` : ''}
        </Button>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>
          {comptees.toLocaleString('fr-FR')} ligne{comptees > 1 ? 's' : ''} comptée{comptees > 1 ? 's' : ''}
          {sansMotif.length ? ` · ${sansMotif.length} écart${sansMotif.length > 1 ? 's' : ''} sans motif` : ''}
        </span>
      </div>
    </>
  );
}
