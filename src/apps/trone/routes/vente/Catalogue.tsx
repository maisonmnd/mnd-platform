import { useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  useCategories, useServices, useProducts,
  QUATRE_TEMPS, fmtDuration,
  type CatalogCategory, type Service,
} from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import './vente.css';

/* Catalogue — double nomenclature fon™. Catégories réordonnables et activables
   pour le front (Vitrine / Ma Couronne), prestations éditables au fauteuil. */

const PALIERS: Service['palier'][] = ['Fondation', 'Élévation', 'Souveraineté'];

type SvcForm = {
  id: string | null;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  palier: Service['palier'];
  durationMin: string;
  sessions: number;
  master: string;
};

const emptySvcForm = (categoryId: string, master: string): SvcForm => ({
  id: null, categoryId, name: '', description: '', price: '', palier: 'Fondation', durationMin: '60', sessions: 1, master,
});

export default function Catalogue() {
  const { branch, currency } = useBranch();
  const [categories, setCategories] = useCategories();
  const [services, setServices] = useServices();
  const [products, setProducts] = useProducts();

  const [svcForm, setSvcForm] = useState<SvcForm | null>(null);
  const [catForm, setCatForm] = useState<{ id: string | null; fon: string; label: string } | null>(null);

  const masters = branch.masters;
  const cats = [...categories].sort((a, b) => a.order - b.order);

  /* — catégories — */
  const moveCat = (cat: CatalogCategory, dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const other = cats[idx + dir];
    if (!other) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === cat.id ? { ...c, order: other.order } : c.id === other.id ? { ...c, order: cat.order } : c,
      ),
    );
  };
  const toggleCat = (cat: CatalogCategory) =>
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, enabled: !c.enabled } : c)));

  const saveCat = () => {
    if (!catForm || !catForm.fon.trim()) return;
    if (catForm.id) {
      setCategories((prev) => prev.map((c) => (c.id === catForm.id ? { ...c, fon: catForm.fon.trim(), label: catForm.label.trim() } : c)));
    } else {
      const maxOrder = cats.reduce((m, c) => Math.max(m, c.order), 0);
      setCategories((prev) => [...prev, { id: uid(), fon: catForm.fon.trim(), label: catForm.label.trim(), enabled: true, order: maxOrder + 1 }]);
    }
    setCatForm(null);
  };

  /* — prestations — */
  const svcOf = (catId: string) => services.filter((s) => s.categoryId === catId).sort((a, b) => a.order - b.order);

  const moveSvc = (svc: Service, dir: -1 | 1) => {
    const list = svcOf(svc.categoryId);
    const idx = list.findIndex((s) => s.id === svc.id);
    const other = list[idx + dir];
    if (!other) return;
    setServices((prev) =>
      prev.map((s) =>
        s.id === svc.id ? { ...s, order: other.order } : s.id === other.id ? { ...s, order: svc.order } : s,
      ),
    );
  };
  const patchSvc = (id: string, patch: Partial<Service>) =>
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const openSvcEdit = (svc: Service) =>
    setSvcForm({
      id: svc.id, categoryId: svc.categoryId, name: svc.name, description: svc.description ?? '',
      price: String(svc.priceXof), palier: svc.palier, durationMin: String(svc.durationMin), sessions: svc.sessions, master: svc.master,
    });

  const saveSvc = () => {
    if (!svcForm || !svcForm.name.trim()) return;
    const price = parseInt(svcForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dur = parseInt(svcForm.durationMin.replace(/[^0-9]/g, ''), 10) || 60;
    if (svcForm.id) {
      patchSvc(svcForm.id, {
        categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
        priceXof: price, palier: svcForm.palier, durationMin: dur, sessions: svcForm.sessions, master: svcForm.master,
      });
    } else {
      const maxOrder = svcOf(svcForm.categoryId).reduce((m, s) => Math.max(m, s.order), 0);
      setServices((prev) => [
        ...prev,
        {
          id: uid(), categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
          palier: svcForm.palier, priceXof: price, hidePrice: false, sessions: svcForm.sessions,
          master: svcForm.master, durationMin: dur, order: maxOrder + 1, temps: [1, 1, 1, 1],
        },
      ]);
    }
    setSvcForm(null);
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · L’offre"
        title="Le catalogue."
        sub="Segmenté par catégorie ™ et par palier d’expérience — jamais par remise. Chaque prestation couvre les quatre temps : Purifier · Nourrir · Sceller · Couronner."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCatForm({ id: null, fon: '', label: '' })}>+ Catégorie</Button>
            <Button onClick={() => setSvcForm(emptySvcForm(cats[0]?.id ?? 'vekpe', masters[0] ?? ''))}>+ Prestation</Button>
          </>
        }
      />

      {cats.map((cat, ci) => {
        const list = svcOf(cat.id);
        const prods = cat.id === 'dodo' ? [...products].sort((a, b) => a.order - b.order) : [];
        return (
          <section key={cat.id} style={{ marginBottom: 26, opacity: cat.enabled ? 1 : 0.55 }}>
            <div className="trv-cat-head">
              <span className="fon">{cat.fon}</span>
              <span className="desc">{cat.label}</span>
              <span style={{ flex: 1 }} />
              <button
                className="trv-minibtn"
                style={{ color: cat.enabled ? 'var(--copper-600)' : 'var(--ink-soft)' }}
                title="Afficher / masquer cette catégorie aux clientes"
                onClick={() => toggleCat(cat)}
              >
                {cat.enabled ? '● Visible aux clientes' : '○ Masquée du front'}
              </button>
              <span className="tools">
                <button className="trv-minibtn" title="Modifier la catégorie" onClick={() => setCatForm({ id: cat.id, fon: cat.fon, label: cat.label })}>
                  Modifier
                </button>
                <button className="trv-sq" title="Monter" disabled={ci === 0} onClick={() => moveCat(cat, -1)}>↑</button>
                <button className="trv-sq" title="Descendre" disabled={ci === cats.length - 1} onClick={() => moveCat(cat, 1)}>↓</button>
              </span>
            </div>

            <div className="tr-grid tr-grid--2">
              {list.map((svc, si) => (
                <article key={svc.id} className="trv-svc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div className="trv-svc__name">{svc.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flex: 'none' }}>
                      <button
                        className="trv-hideprice"
                        title={svc.hidePrice ? 'Afficher le prix' : 'Masquer le prix'}
                        onClick={() => patchSvc(svc.id, { hidePrice: !svc.hidePrice })}
                      >
                        {svc.hidePrice ? 'Afficher le prix' : 'Masquer le prix'}
                      </button>
                      <div className="trv-svc__price">
                        {svc.hidePrice ? <em style={{ fontSize: 15, color: 'var(--ink-soft)' }}>prix voilé</em> : fmtMoney(svc.priceXof, currency)}
                      </div>
                    </div>
                  </div>

                  <div className="trv-svc__meta">
                    <span>{svc.palier}</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span>{fmtDuration(svc.durationMin)}</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span className="trv-stepper">
                      <button className="trv-sq" style={{ width: 20, height: 20 }} title="Retirer une séance" onClick={() => patchSvc(svc.id, { sessions: Math.max(1, svc.sessions - 1) })}>−</button>
                      <span className="val">{svc.sessions}</span>
                      <button className="trv-sq" style={{ width: 20, height: 20 }} title="Ajouter une séance" onClick={() => patchSvc(svc.id, { sessions: svc.sessions + 1 })}>+</button>
                      <span>séance{svc.sessions > 1 ? 's' : ''}</span>
                    </span>
                  </div>

                  <div className="trv-temps">
                    {QUATRE_TEMPS.map((t, i) => (
                      <span key={t} className={(svc.temps ?? [1, 1, 1, 1])[i] ? 'on' : ''}>{t}</span>
                    ))}
                  </div>

                  {svc.description && <div className="trv-svc__desc">{svc.description}</div>}

                  <div className="trv-svc__foot">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      Maître
                      <select
                        className="trv-master"
                        value={svc.master}
                        onChange={(e) => patchSvc(svc.id, { master: e.target.value })}
                      >
                        {[...new Set([svc.master, ...masters])].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button className="trv-sq" title="Monter la prestation" disabled={si === 0} onClick={() => moveSvc(svc, -1)}>▲</button>
                      <button className="trv-sq" title="Descendre la prestation" disabled={si === list.length - 1} onClick={() => moveSvc(svc, 1)}>▼</button>
                      <button className="trv-minibtn" onClick={() => openSvcEdit(svc)}>Modifier</button>
                    </span>
                  </div>
                </article>
              ))}

              {prods.map((p) => (
                <article key={p.id} className="trv-svc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div className="trv-svc__name">{p.name}</div>
                    <div className="trv-svc__price">{fmtMoney(p.priceXof, currency)}</div>
                  </div>
                  <div className="trv-svc__meta">
                    <span>Produit Maison</span>
                    <span style={{ color: 'var(--color-argile)' }}>·</span>
                    <span style={{ color: p.stock <= 8 ? 'var(--trv-warning)' : undefined }}>
                      stock {p.stock}
                    </span>
                  </div>
                  <div className="trv-svc__foot">
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>Réassort</span>
                    <span className="trv-stepper">
                      <button className="trv-sq" onClick={() => setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock: Math.max(0, x.stock - 1) } : x)))}>−</button>
                      <span className="val">{p.stock}</span>
                      <button className="trv-sq" onClick={() => setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, stock: x.stock + 1 } : x)))}>+</button>
                    </span>
                  </div>
                </article>
              ))}

              {list.length === 0 && prods.length === 0 && (
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)', padding: '8px 0' }}>
                  Aucune prestation dans cette catégorie pour l’instant.
                </div>
              )}
            </div>
          </section>
        );
      })}

      {svcForm && (
        <Modal title={svcForm.id ? 'La prestation.' : 'Nouvelle prestation.'} onClose={() => setSvcForm(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de la prestation">
              <Input value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="Ex. Création microlocks" />
            </Field>
            <Field label="Description · la voix de la Maison">
              <Textarea
                value={svcForm.description}
                onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
                placeholder="Ce que cette prestation accomplit, en une ou deux phrases souveraines…"
              />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Catégorie ™">
                <Select value={svcForm.categoryId} onChange={(e) => setSvcForm({ ...svcForm, categoryId: e.target.value })}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Prix (F CFA)">
                <Input inputMode="numeric" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} placeholder="45 000" />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Durée (minutes)">
                <Input inputMode="numeric" value={svcForm.durationMin} onChange={(e) => setSvcForm({ ...svcForm, durationMin: e.target.value })} placeholder="120" />
              </Field>
              <Field label="Maître assigné">
                <Select value={svcForm.master} onChange={(e) => setSvcForm({ ...svcForm, master: e.target.value })}>
                  {[...new Set([svcForm.master, ...masters])].filter(Boolean).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Nombre de séances">
              <span className="trv-stepper">
                <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.max(1, svcForm.sessions - 1) })}>−</button>
                <span className="val" style={{ fontSize: 18 }}>{svcForm.sessions}</span>
                <button className="trv-sq" onClick={() => setSvcForm({ ...svcForm, sessions: Math.min(12, svcForm.sessions + 1) })}>+</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>séance{svcForm.sessions > 1 ? 's' : ''}</span>
              </span>
            </Field>
            <Field label="Palier d’expérience">
              <div style={{ display: 'flex', gap: 8 }}>
                {PALIERS.map((p) => (
                  <button key={p} className={`trv-palier-chip ${svcForm.palier === p ? 'is-active' : ''}`} onClick={() => setSvcForm({ ...svcForm, palier: p })}>
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setSvcForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveSvc}>Enregistrer la prestation</Button>
            </div>
          </div>
        </Modal>
      )}

      {catForm && (
        <Modal title="La catégorie." onClose={() => setCatForm(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Code de la catégorie">
              <Input
                value={catForm.fon}
                onChange={(e) => setCatForm({ ...catForm, fon: e.target.value })}
                placeholder="Ex. VÈKPÈ™"
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>
            <Field label="Libellé · ce qu’elle regroupe">
              <Input value={catForm.label} onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} placeholder="Ex. Pose & structure" />
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setCatForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveCat}>Enregistrer la catégorie</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
