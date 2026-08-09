import { useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  SEUIL_REASSORT, categoriesStore, useCategories, useProducts, useServices,
  type CatalogCategory, type Product,
} from '../../../../shared/catalog';
import {
  FAMILLES, MOUVEMENT_NOMS, COMMANDE_NOMS, bougerStockGamme, litQuantite,
  useFournisseurs, useProduitsStock, useMouvementsStock, useCommandesAchat, useLignesAchat, useConsommations,
  produitsStockStore, fournisseursStore, commandesAchatStore,
  creerFournisseur, creerProduitStock, creerCommande, ajouterLigneCommande, retirerLigneCommande,
  envoyerCommande, annulerCommande, recevoirLigne, lignesDe,
  ajusterStock, declarerPerte, corrigerStockGamme, reprendreGamme,
  stocksParProduit, margePct, prixVenteDe, coutMatiereXof, reappro, reliquat, statutLigne,
  totalCommande, totalRecu, coutLigne, poserRecette, retirerRecette, aCommander,
  type CommandeFournisseur, type FamilleProduit, type ProduitStock,
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

type Onglet = 'gamme' | 'inventaire' | 'achats' | 'recettes' | 'mouvements';

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
  const [onglet, setOnglet] = useState<Onglet>('gamme');
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
        sub="Qu’ai-je en stock, que dois-je racheter, combien me coûte chaque prestation — et combien je gagne sur ce que je revends."
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, marginBottom: 4 }}>
        <Chip actif={onglet === 'gamme'} onClick={() => setOnglet('gamme')}>La Gamme</Chip>
        <Chip actif={onglet === 'inventaire'} onClick={() => setOnglet('inventaire')}>
          Inventaire{manquants ? ` · ${manquants} à commander` : ''}
        </Chip>
        <Chip actif={onglet === 'achats'} onClick={() => setOnglet('achats')}>
          Achats{bcOuverts ? ` · ${bcOuverts} en cours` : ''}
        </Chip>
        <Chip actif={onglet === 'recettes'} onClick={() => setOnglet('recettes')}>Recettes</Chip>
        <Chip actif={onglet === 'mouvements'} onClick={() => setOnglet('mouvements')}>Mouvements</Chip>
      </div>

      {onglet === 'gamme' && <OngletGamme />}
      {onglet === 'inventaire' && <OngletInventaire />}
      {onglet === 'achats' && <OngletAchats />}
      {onglet === 'recettes' && <OngletRecettes />}
      {onglet === 'mouvements' && <OngletMouvements />}
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
                        {rupture ? 'rupture — à réassortir' : `plus que ${p.stock}`}
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
              et se remplit de produits — jamais de rituels.
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

function OngletInventaire() {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [fournisseurs] = useFournisseurs();
  const [gamme] = useProducts();
  const [fiche, setFiche] = useState<FicheForm | null>(null);
  const [ajuste, setAjuste] = useState<{ p: ProduitStock; qte: string; note: string; perte: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [inactifs, setInactifs] = useState(false);

  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const nomFournisseur = (id?: string) => fournisseurs.find((f) => f.id === id)?.nom ?? '—';

  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return produits
      .filter((p) => p.branchId === branch.id && (inactifs || p.actif))
      .filter((p) => !t || p.nom.toLowerCase().includes(t) || p.code.toLowerCase().includes(t))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [produits, branch.id, q, inactifs]);

  const parFamille = (f: FamilleProduit) => liste.filter((p) => p.famille === f);
  const valeurAchat = liste.reduce((s, p) => s + (stocks.get(p.id) ?? 0) * p.prixAchatXof, 0);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>
          Valeur du stock au prix d’achat : <b style={{ fontWeight: 600, color: 'var(--color-indigo)' }}>{fmtMoney(valeurAchat, currency)}</b>
        </div>
        <Button onClick={() => setFiche(ficheVide())}>+ Fiche produit</Button>
      </div>

      {/* LA BASCULE DE LA GAMME — visible tant qu'il reste des produits sans
          fiche. Un bouton, pas un automatisme : la synchronisation doit avoir
          fini de tirer avant de créer, sinon on doublerait les fiches. */}
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

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher (nom, code)…" style={{ flex: '1 1 240px' }} />
        <label className="mnd-muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />
          voir les fiches désactivées
        </label>
      </div>

      {(Object.keys(FAMILLES) as FamilleProduit[]).map((fam) => {
        const fiches = parFamille(fam);
        if (!fiches.length) return null;
        return (
          <section key={fam} style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 7, borderBottom: '2px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>{FAMILLES[fam].nom}</span>
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>{FAMILLES[fam].dit}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tre-table" style={{ marginTop: 4 }}>
                <thead>
                  <tr>
                    <th>Code</th><th>Produit</th><th>Prix achat</th>
                    {fam === 'revente' && <th>Prix vente · marge</th>}
                    <th>Stock</th><th>Seuil · cible</th><th>Fournisseur</th><th>Statut</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {fiches.map((p) => {
                    const s = stocks.get(p.id) ?? 0;
                    const manque = aCommander(p, s);
                    const vente = prixVenteDe(p, gamme);
                    const marge = margePct(p, gamme);
                    return (
                      <tr key={p.id} style={p.actif ? undefined : { opacity: .55 }}>
                        <td style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{p.code}</td>
                        <td>
                          {p.nom}
                          <div className="mnd-muted" style={{ fontSize: 10.5 }}>
                            {p.unite}{p.conditionnement ? ` · ${p.conditionnement}` : ''}{p.emplacement ? ` · ${p.emplacement}` : ''}
                          </div>
                        </td>
                        <td className="num" style={{ fontSize: 14 }}>{fmtMoney(p.prixAchatXof, currency)}</td>
                        {fam === 'revente' && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {vente !== undefined ? fmtMoney(vente, currency) : '—'}
                            {marge !== undefined && <span className="mnd-muted" style={{ fontSize: 10.5 }}> · {marge} %</span>}
                          </td>
                        )}
                        <td className="num">{s.toLocaleString('fr-FR')}</td>
                        <td className="mnd-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{p.seuilAlerte} · {p.stockCible}</td>
                        <td style={{ fontSize: 12 }}>{nomFournisseur(p.fournisseurId)}</td>
                        <td><Statut ok={!manque}>{manque ? 'À commander' : 'OK'}</Statut></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="trv-minibtn" onClick={() => setAjuste({ p, qte: String(s), note: '', perte: false })}>Ajuster</button>{' '}
                          <button className="trv-minibtn" onClick={() => setAjuste({ p, qte: '', note: '', perte: true })}>Perte</button>{' '}
                          <button
                            className="trv-minibtn"
                            onClick={() => setFiche({
                              id: p.id, nom: p.nom, famille: p.famille, sousFamille: p.sousFamille ?? '',
                              unite: p.unite, conditionnement: p.conditionnement ?? '',
                              prixAchat: String(p.prixAchatXof), fournisseurId: p.fournisseurId ?? '',
                              seuil: String(p.seuilAlerte), cible: String(p.stockCible),
                              emplacement: p.emplacement ?? '', stockInitial: '0',
                            })}
                          >
                            Modifier
                          </button>{' '}
                          <button
                            className="trv-minibtn"
                            title={p.actif ? 'La fiche se désactive — son journal reste' : 'Réactiver la fiche'}
                            onClick={() => produitsStockStore.set((prev) => prev.map((x) => (x.id === p.id ? { ...x, actif: !x.actif } : x)))}
                          >
                            {p.actif ? 'Désactiver' : 'Réactiver'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {liste.length === 0 && (
        <div className="mnd-muted" style={{ fontSize: 13, marginTop: 20, lineHeight: 1.6 }}>
          Aucune fiche d’inventaire. Reprenez la Gamme ci-dessus, puis créez les consommables,
          les mèches et le jetable — les recettes des services s’appuieront dessus.
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
                ? 'La perte s’écrit au journal — elle se voit, elle ne se devine pas.'
                : `Le journal écrira l’écart avec le stock dérivé (${(stocks.get(ajuste.p.id) ?? 0).toLocaleString('fr-FR')}), jamais un chiffre posé.`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setAjuste(null)}>Annuler</Button>
              <Button variant="copper" onClick={appliquerAjustement}>{ajuste.perte ? 'Déclarer la perte' : 'Écrire l’ajustement'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {fiche && (
        <Modal title={fiche.id ? 'La fiche produit.' : 'Nouvelle fiche produit.'} onClose={() => setFiche(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="tr-grid tr-grid--2">
              <Field label="Nom">
                <Input value={fiche.nom} onChange={(e) => setFiche({ ...fiche, nom: e.target.value })} placeholder="Ex. Henné du Sahel" autoFocus />
              </Field>
              <Field label="Famille">
                <Select value={fiche.famille} disabled={!!fiche.id} onChange={(e) => setFiche({ ...fiche, famille: e.target.value as FamilleProduit })}>
                  {(Object.keys(FAMILLES) as FamilleProduit[]).map((f) => (
                    <option key={f} value={f}>{FAMILLES[f].nom}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Unité (ml, g, pièce, paquet…)">
                <Input value={fiche.unite} onChange={(e) => setFiche({ ...fiche, unite: e.target.value })} placeholder="g" />
              </Field>
              <Field label="Conditionnement">
                <Input value={fiche.conditionnement} onChange={(e) => setFiche({ ...fiche, conditionnement: e.target.value })} placeholder="Sachet 500 g" />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Prix d’achat (F CFA, par unité)">
                <Input inputMode="numeric" value={fiche.prixAchat} onChange={(e) => setFiche({ ...fiche, prixAchat: e.target.value })} placeholder="100" />
              </Field>
              <Field label="Fournisseur">
                <Select value={fiche.fournisseurId} onChange={(e) => setFiche({ ...fiche, fournisseurId: e.target.value })}>
                  <option value="">—</option>
                  {fournisseurs.filter((f) => f.actif).map((f) => (
                    <option key={f.id} value={f.id}>{f.code} · {f.nom}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Seuil d’alerte">
                <Input inputMode="numeric" value={fiche.seuil} onChange={(e) => setFiche({ ...fiche, seuil: e.target.value })} />
              </Field>
              <Field label="Stock cible">
                <Input inputMode="numeric" value={fiche.cible} onChange={(e) => setFiche({ ...fiche, cible: e.target.value })} />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Emplacement">
                <Input value={fiche.emplacement} onChange={(e) => setFiche({ ...fiche, emplacement: e.target.value })} placeholder="Réserve, étagère 2" />
              </Field>
              {!fiche.id && (
                <Field label="Stock de départ (compté aujourd’hui)">
                  <Input inputMode="numeric" value={fiche.stockInitial} onChange={(e) => setFiche({ ...fiche, stockInitial: e.target.value })} />
                </Field>
              )}
            </div>
            {!fiche.id && (
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Le stock de départ s’écrit au journal comme « Inventaire initial » — la fiche, elle,
                ne porte jamais de compteur.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setFiche(null)}>Annuler</Button>
              <Button onClick={enregistrer}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}
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
            Rien sous les seuils — la réserve tient.
          </div>
        )}
        {[...groupes.entries()].map(([fid, liste]) => {
          const f = fournisseur(fid);
          const total = liste.reduce((s, l) => s + l.coutEstimeXof, 0);
          return (
            <div key={fid || 'sans'} style={{ marginTop: 12, border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--surface-card)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: 'var(--color-indigo)' }}>
                  {f ? `${f.nom}` : 'Sans fournisseur — à désigner sur les fiches'}
                  {f?.delaiJours ? <span className="mnd-muted" style={{ fontSize: 11 }}> · livre sous {f.delaiJours} j</span> : null}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>{fmtMoney(total, currency)} estimés</span>
                  {f && <Button size="sm" variant="copper" onClick={() => preparerBon(fid)}>Préparer le bon</Button>}
                </span>
              </div>
              {liste.map((l) => (
                <div key={l.produit.id} className="mnd-muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>{l.produit.code} · {l.produit.nom} — reste {l.stock.toLocaleString('fr-FR')} {l.produit.unite}</span>
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
        <Modal title={`${commande.numero} · ${fournisseur(commande.fournisseurId)?.nom ?? ''}.`} onClose={() => setOuvert(null)} width={640}>
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
  const { currency } = useBranch();
  const [produits] = useProduitsStock();
  const [lignes] = useLignesAchat();
  const [ajout, setAjout] = useState<{ produitId: string; qte: string }>({ produitId: '', qte: '' });

  const ls = lignesDe(lignes, commande.id);
  const produit = (id: string) => produits.find((p) => p.id === id);
  const brouillon = commande.statut === 'brouillon';
  const recevable = commande.statut === 'envoyee' || commande.statut === 'partielle';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Statut ok={commande.statut === 'recue'}>{COMMANDE_NOMS[commande.statut]}</Statut>
        <span className="mnd-muted" style={{ fontSize: 12 }}>
          {fmtMoney(totalCommande(ls), currency)} commandés · {fmtMoney(totalRecu(ls), currency)} reçus
        </span>
      </div>

      {ls.map((l) => {
        const p = produit(l.produitId);
        const st = statutLigne(l);
        return (
          <div key={l.id} style={{ border: '1px solid var(--hairline)', borderRadius: 3, background: 'var(--surface-card)', padding: '10px 13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13 }}>{p?.code} · {p?.nom ?? 'Fiche retirée'}</span>
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                {l.quantiteCommandee.toLocaleString('fr-FR')} × {fmtMoney(l.prixAchatUnitaireXof, currency)} = {fmtMoney(coutLigne(l), currency)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                {st === 'en_attente' ? 'En attente' : st === 'partielle' ? `Partielle — reste ${reliquat(l).toLocaleString('fr-FR')}` : 'Reçue'}
                {l.quantiteRecue > 0 ? ` · ${l.quantiteRecue.toLocaleString('fr-FR')} reçus` : ''}
              </span>
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {brouillon && (
                  <button className="trv-minibtn" onClick={() => retirerLigneCommande(l)}>Retirer</button>
                )}
                {recevable && (
                  <>
                    <Input
                      inputMode="numeric"
                      placeholder={`reçu (${p?.unite ?? ''})`}
                      value={recus[l.id] ?? ''}
                      onChange={(e) => setRecus((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      style={{ width: 110, padding: '6px 9px', fontSize: 12 }}
                    />
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
                  </>
                )}
              </span>
            </div>
          </div>
        );
      })}

      {brouillon && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
          <Field label="Ajouter un produit">
            <Select value={ajout.produitId} onChange={(e) => setAjout({ ...ajout, produitId: e.target.value })}>
              <option value="">—</option>
              {produits.filter((p) => p.branchId === commande.branchId && p.actif).map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.nom}</option>
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
              if (!p) return;
              const r = ajouterLigneCommande(commande, p, litQuantite(ajout.qte) || 0);
              if (!r.ok) { window.alert(r.erreur); return; }
              setAjout({ produitId: '', qte: '' });
            }}
          >
            Ajouter
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span>
          {(commande.statut === 'brouillon' || commande.statut === 'envoyee') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => { const r = annulerCommande(commande); if (!r.ok) window.alert(r.erreur); }}
            >
              Annuler le bon
            </Button>
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
        se décrémente seul à l’encaissement, et le coût matière de chaque service se connaît —
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
              Aucune recette — cette prestation ne décrémente rien à l’encaissement.
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
            Reposer un produit déjà présent remplace sa ligne. La Revente ne se met pas en recette —
            elle se vend à la Caisse, elle ne se consomme pas.
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════ LE JOURNAL — rien ne bouge par magie ═══════════════ */

function OngletMouvements() {
  const { branch } = useBranch();
  const [mouvements] = useMouvementsStock();
  const [produits] = useProduitsStock();
  const [q, setQ] = useState('');
  const [montre, setMontre] = useState(60);

  const produit = (id: string) => produits.find((p) => p.id === id);
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return mouvements
      .filter((m) => m.branchId === branch.id)
      .filter((m) => {
        if (!t) return true;
        const p = produit(m.produitId);
        return (p?.nom.toLowerCase().includes(t) || p?.code.toLowerCase().includes(t)
          || (m.reference ?? '').toLowerCase().includes(t));
      })
      .slice()
      .reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouvements, branch.id, q, produits]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (produit, code, référence)…" style={{ flex: '1 1 260px' }} />
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>{liste.length.toLocaleString('fr-FR')} mouvement{liste.length > 1 ? 's' : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tre-table" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>Date</th><th>Type</th><th>Produit</th><th style={{ textAlign: 'right' }}>Quantité</th><th>Référence</th><th>Note</th></tr>
          </thead>
          <tbody>
            {liste.slice(0, montre).map((m) => {
              const p = produit(m.produitId);
              return (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{frJour(m.date)}</td>
                  <td style={{ fontSize: 12 }}>{MOUVEMENT_NOMS[m.type]}</td>
                  <td style={{ fontSize: 12.5 }}>{p ? `${p.code} · ${p.nom}` : m.produitId}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.quantite < 0 ? 'var(--color-danger, #9E3428)' : 'var(--trf-success, #4c7a4c)' }}>
                    {m.quantite > 0 ? '+' : ''}{m.quantite.toLocaleString('fr-FR')}{p ? ` ${p.unite}` : ''}
                  </td>
                  <td className="mnd-muted" style={{ fontSize: 11.5 }}>{m.reference ?? '—'}</td>
                  <td className="mnd-muted" style={{ fontSize: 11.5 }}>{m.note ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.length === 0 && (
        <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          Aucun mouvement — le journal s’écrira à la première vente, réception ou prestation.
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
