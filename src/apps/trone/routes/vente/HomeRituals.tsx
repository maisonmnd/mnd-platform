import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { SEUIL_REASSORT, categoriesStore, useCategories, useProducts, type CatalogCategory, type Product } from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import './vente.css';

/* HOME RITUALS™ — la Gamme, à son propre écran.

   Les produits vivaient noyés dans le Catalogue, entre 152 prestations et 24
   catégories : on ne les trouvait plus, et on ne voyait pas les ruptures. Ici,
   une seule question à la fois — qu'est-ce qu'on vend, à quel prix, et
   qu'est-ce qui manque.

   Même magasin que le Catalogue et le Laboratoire (`productsStore`) : ce qu'on
   change ici change partout. Un stock qui ne vaut que sur un écran ne vaut rien. */

/** LES DEUX LIGNES FONDATRICES. Elles sont reconnues par leur identifiant et
    non par leur drapeau : les catégories importées de l'ancien logiciel ont été
    écrites avant que `produits` n'existe, et une ligne qui disparaîtrait de cet
    écran emporterait son stock avec elle. */
const LIGNES_FONDATRICES = ['home-rituals', 'meches'];

/** Une catégorie est-elle une ligne de produits ? */
const estLigne = (c: CatalogCategory) => c.produits === true || LIGNES_FONDATRICES.includes(c.id);

/** Seuil de réassort — sous ce nombre, la ligne s'allume. Volontairement bas :
    une alerte qui se déclenche tout le temps n'est plus une alerte. */
const SEUIL = SEUIL_REASSORT;

type Form = { id: string | null; categoryId: string; name: string; price: string; stock: string };
/** Le formulaire d'une ligne — `id` nul quand on la crée. */
type LigneForm = { id: string | null; fon: string; label: string };

/** Un code court, tiré du nom : « Bougies & Parfums » → « BOUG ». Il n'a pas à
    être joli, il a à être stable et lisible dans le Catalogue. */
const codeDe = (fon: string): string =>
  (fon.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4)) || 'LGN';

export default function HomeRituals() {
  const { currency } = useBranch();
  const [categories] = useCategories();
  const [products, setProducts] = useProducts();
  const [form, setForm] = useState<Form | null>(null);
  const [ligne, setLigne] = useState<LigneForm | null>(null);
  const [q, setQ] = useState('');

  const cats = useMemo(
    () => categories.filter(estLigne).sort((a, b) => a.order - b.order),
    [categories],
  );
  /* Une catégorie qui porte des produits sans être déclarée ligne n'a pas à
     disparaître : on la montre à la suite, avec son stock. */
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

  const save = () => {
    if (!form || !form.name.trim()) return;
    const price = parseInt(form.price.replace(/[^0-9]/g, ''), 10) || 0;
    /* Le tiret etait admis dans la classe : saisir « -5 » enregistrait un stock
       negatif, que « Valeur du stock » comptait a la baisse sans rien signaler.
       L'ecran Catalogue, lui, refusait deja le signe. */
    const stock = parseInt(form.stock.replace(/[^0-9]/g, ''), 10) || 0;
    if (form.id) patch(form.id, { name: form.name.trim(), priceXof: price, stock, categoryId: form.categoryId });
    else {
      const maxOrder = products.reduce((m, p) => Math.max(m, p.order), 0);
      setProducts((prev) => [...prev, { id: uid(), categoryId: form.categoryId, name: form.name.trim(), priceXof: price, stock, order: maxOrder + 1 }]);
    }
    setForm(null);
  };

  /* CREER OU RENOMMER UNE LIGNE. Une ligne est une catégorie du catalogue —
     pas une liste à part : elle apparaît donc aussi au Catalogue et à la Caisse,
     avec son code et son rang. L'identifiant est tiré au sort plutôt que du nom,
     pour qu'une ligne renommée garde ses produits. */
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
          id: `ligne-${uid()}`,
          code: codeDe(fon),
          fon,
          label: label || 'Ligne de produits',
          enabled: true,
          produits: true,
          order: prev.reduce((m, c) => Math.max(m, c.order), 0) + 1,
        },
      ]);
    }
    setLigne(null);
  };

  /* Retirer une ligne ne retire jamais des produits au passage : on refuse tant
     qu'elle en porte, plutôt que de les rendre invisibles avec leur stock. */
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
      <PageHead
        eyebrow="Vente"
        title="Produits"
        sub="La Gamme — ce que la cliente emporte. Prix, stock et réassort d’un seul regard."
        actions={
          <>
            <Button variant="ghost" onClick={() => setLigne({ id: null, fon: '', label: '' })}>
              + Ligne
            </Button>
            <Button onClick={() => setForm({ id: null, categoryId: cats[0]?.id ?? LIGNES_FONDATRICES[0], name: '', price: '', stock: '0' })}>
              + Produit
            </Button>
          </>
        }
      />

      <div className="tr-grid tr-grid--3" style={{ marginTop: 20 }}>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Valeur du stock</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(valeur, currency)}</div>
        </div>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Références</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{products.length}</div>
        </div>
        <div className="tr-card" style={{ padding: '14px 18px' }}>
          <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>À réassortir</div>
          <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
            {ruptures.length + basses.length}
          </div>
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
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.04em' }}>{cat.fon}</span>
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
              <div className="mnd-muted" style={{ fontSize: 13, padding: '14px 2px' }}>
                Aucun produit dans cette ligne.
              </div>
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
                      <span
                        style={{
                          fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase',
                          color: rupture ? 'var(--color-danger, #9E3428)' : 'var(--color-copper)',
                        }}
                      >
                        {rupture ? 'rupture — à réassortir' : `plus que ${p.stock}`}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums', minWidth: 96, textAlign: 'right' }}>
                    {fmtMoney(p.priceXof, currency)}
                  </span>
                  {/* Le stock se corrige ICI, sans ouvrir de fiche : c'est le geste
                      le plus fréquent de la journée — une vente, une livraison. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                    <button className="trv-sq" title="Retirer une unité" onClick={() => patch(p.id, { stock: Math.max(0, p.stock - 1) })}>−</button>
                    <span style={{ minWidth: 34, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.stock}</span>
                    <button className="trv-sq" title="Ajouter une unité" onClick={() => patch(p.id, { stock: p.stock + 1 })}>+</button>
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
              <Input
                value={ligne.fon}
                onChange={(e) => setLigne({ ...ligne, fon: e.target.value })}
                placeholder="Ex. Bougies &amp; Parfums d’intérieur"
              />
            </Field>
            <Field label="Ce qu’elle rassemble">
              <Input
                value={ligne.label}
                onChange={(e) => setLigne({ ...ligne, label: e.target.value })}
                placeholder="Ex. La maison qui sent la Maison"
              />
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
              <select
                className="ds-select"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
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
