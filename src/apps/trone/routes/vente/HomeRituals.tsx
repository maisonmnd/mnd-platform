import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useCategories, useProducts, type Product } from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import './vente.css';

/* HOME RITUALS™ — la Gamme, à son propre écran.

   Les produits vivaient noyés dans le Catalogue, entre 152 prestations et 24
   catégories : on ne les trouvait plus, et on ne voyait pas les ruptures. Ici,
   une seule question à la fois — qu'est-ce qu'on vend, à quel prix, et
   qu'est-ce qui manque.

   Même magasin que le Catalogue et le Laboratoire (`productsStore`) : ce qu'on
   change ici change partout. Un stock qui ne vaut que sur un écran ne vaut rien. */

/** Les lignes de la Gamme, dans l'ordre où la Maison les présente. */
const LIGNES = ['home-rituals', 'meches'];

/** Seuil de réassort — sous ce nombre, la ligne s'allume. Volontairement bas :
    une alerte qui se déclenche tout le temps n'est plus une alerte. */
const SEUIL = 3;

type Form = { id: string | null; categoryId: string; name: string; price: string; stock: string };

export default function HomeRituals() {
  const { currency } = useBranch();
  const [categories] = useCategories();
  const [products, setProducts] = useProducts();
  const [form, setForm] = useState<Form | null>(null);
  const [q, setQ] = useState('');

  const cats = useMemo(
    () => LIGNES.map((id) => categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [categories],
  );
  /* Une catégorie de produits créée à la main hors des deux lignes connues
     n'a pas à disparaître : on la montre à la suite. */
  const autres = useMemo(
    () => categories.filter((c) => !LIGNES.includes(c.id) && products.some((p) => p.categoryId === c.id)),
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
    const stock = parseInt(form.stock.replace(/[^0-9-]/g, ''), 10) || 0;
    if (form.id) patch(form.id, { name: form.name.trim(), priceXof: price, stock, categoryId: form.categoryId });
    else {
      const maxOrder = products.reduce((m, p) => Math.max(m, p.order), 0);
      setProducts((prev) => [...prev, { id: uid(), categoryId: form.categoryId, name: form.name.trim(), priceXof: price, stock, order: maxOrder + 1 }]);
    }
    setForm(null);
  };

  const supprimer = (p: Product) => {
    if (!window.confirm(`Retirer « ${p.name} » de la Gamme ?`)) return;
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
  };

  return (
    <>
      <PageHead
        eyebrow="Vente"
        title="Home Rituals™"
        sub="La Gamme — ce que la cliente emporte. Prix, stock et réassort d’un seul regard."
        actions={
          <Button onClick={() => setForm({ id: null, categoryId: cats[0]?.id ?? LIGNES[0], name: '', price: '', stock: '0' })}>
            + Produit
          </Button>
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
