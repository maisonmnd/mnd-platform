import { useEffect, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  useCategories, useServices, useProducts,
  QUATRE_TEMPS, fmtDuration, priceModeOf, PRICE_MODES, ensureConsultationCategory, ensureStarterServices,
  type CatalogCategory, type Service, type Product, type PriceMode,
} from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import './vente.css';

/* Catalogue — double nomenclature fon™. Catégories réordonnables, activables,
   éditables et supprimables ; prestations et produits Maison éditables au fauteuil.
   Les produits partagent productsStore avec le Laboratoire (gamme & stock). */

const PALIERS: Service['palier'][] = ['Fondation', 'Élévation', 'Souveraineté'];

type SvcForm = {
  id: string | null;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  priceMode: PriceMode;
  palier: Service['palier'];
  durationMin: string;
  sessions: number;
  master: string;
};

const emptySvcForm = (categoryId: string, master: string): SvcForm => ({
  id: null, categoryId, name: '', description: '', price: '', priceMode: 'fixe', palier: 'Fondation', durationMin: '60', sessions: 1, master,
});

/* Descriptions signées (voix de la Maison), posées UNE fois sur les prestations
   de la maison qui n'en avaient pas — backfill idempotent (ne remplit que le vide,
   n'écrase jamais). Clés = ids réels du catalogue. */
const SERVICE_DESCRIPTIONS: Record<string, string> = {
  'sv-rituel-mr6p76kx': 'Des twists montés sur mèches naturelles : une coiffure protectrice qui prolonge la couronne et la met en valeur, sans jamais contraindre la fibre.',
  'sv-rituel-mpje8apm': 'Mains et pieds réunis en un seul soin — on prend soin de vous jusqu’au bout des doigts, pendant que la couronne se façonne.',
  '47noorddot': 'Le sérum fortifiant à 5 % : un allié quotidien pour densifier la racine et soutenir la pousse, entre deux passages à la Maison. À appliquer selon le protocole remis au fauteuil.',
  'sv-reprise-locks': 'On reprend une couronne fragilisée mèche par mèche : locks affaiblies, racines relâchées, pointes ouvertes — chacune est renforcée, refermée, remise droite. La réparation qui redonne de l’assise.',
  'sv-style-conseil': 'Le lavage fondateur de la Maison : purifier le cuir chevelu, libérer chaque lock, préparer la fibre à recevoir le soin. Le premier des quatre temps.',
  'sv-coiffure-event': 'Un lavage tout en douceur, pensé pour les cuirs chevelus sensibles : on nettoie sans agresser, on apaise et on rafraîchit. La propreté sans la sécheresse.',
  'sv-bain-vapeur': 'Le soin qui rend la couronne souple et docile : on nourrit la fibre en profondeur pour dénouer les tensions et retrouver un mouvement naturel. Nourrir, le deuxième temps.',
  'zebpkpg6ar': 'La grande purification : on débarrasse locks et cuir chevelu des résidus accumulés — produits, poussière, dépôts — pour repartir sur une base nette et légère.',
  'sv-entretien-complet': 'L’entretien intégral de la couronne : resserrage des racines, lavage, soin et remise en forme. Le rendez-vous régulier qui garde vos locks impeccables — tout, en une séance.',
  'sv-resserrage': 'On reprend la repousse à la racine, lock par lock : la couronne retrouve sa netteté et sa tenue. Le geste d’entretien essentiel, à intervalle régulier.',
  'sv-rituel-mp2ln2i4': 'Le premier regard : on lit votre cheveu, votre cuir chevelu et vos attentes pour dessiner le projet de votre future couronne. Le point de départ de toute création.',
  'hldnt5bhtq': 'Avant de créer : on évalue la densité, la longueur et la nature de votre cheveu, on choisit la méthode et on projette le rendu. La consultation qui fonde votre couronne sur mesure.',
  'fff106cwgo': 'Pour une couronne déjà installée : on examine l’état des locks et on définit le plan — resserrage, réparation, densification — pour les mener au niveau supérieur.',
  'sv-rituel-mr3szmso': 'L’examen d’une couronne fragilisée : on identifie ce qui doit être réparé ou renforcé et on trace le chemin de la remise en état, avant toute intervention.',
  'sv-locks-moyennes': 'La grande création : jusqu’à 350 locks installées mèche après mèche pour une couronne dense et majestueuse. Une œuvre d’ampleur, pensée pour durer et porter haut.',
  'sv-locks-fines': 'La couronne signée : jusqu’à 250 locks pour un équilibre parfait entre densité et finesse. Le grand classique de la Maison, monté avec patience.',
  'mx8npm3zn9': 'La couronne d’exception, entièrement sur mesure : nombre, taille et rendu définis avec vous, sans aucune limite. Le tarif s’établit après la consultation, selon l’ampleur du projet.',
  'sv-rituel-mq3ln93q': 'L’éclaircissement maîtrisé : on prépare la fibre et on décolore avec précaution pour révéler une nouvelle intensité, sans brutaliser la couronne. La base d’une couleur lumineuse.',
};

type CatForm = { id: string | null; fon: string; label: string; enabled: boolean };

type ProdForm = { id: string | null; categoryId: string; name: string; price: string; stock: string };
const emptyProdForm = (categoryId: string): ProdForm => ({ id: null, categoryId, name: '', price: '', stock: '0' });

export default function Catalogue() {
  const { branch, currency } = useBranch();
  const [categories, setCategories] = useCategories();
  const [services, setServices] = useServices();
  const [products, setProducts] = useProducts();

  const [svcForm, setSvcForm] = useState<SvcForm | null>(null);
  const [catForm, setCatForm] = useState<CatForm | null>(null);
  const [prodForm, setProdForm] = useState<ProdForm | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  /* Garantit la catégorie Consultation (ÐÓTÓ™) et les prestations signées de
     départ sur les maisons antérieures à leur introduction. */
  useEffect(() => {
    ensureConsultationCategory();
    ensureStarterServices(branch.masters[0] ?? '');
  }, []);

  /* Backfill des descriptions manquantes (voix de la Maison). Dépend de `services`
     pour s'appliquer une fois le catalogue hydraté ; idempotent (ne remplit que le
     vide, renvoie la même référence si rien à faire → pas de boucle). */
  useEffect(() => {
    setServices((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const d = SERVICE_DESCRIPTIONS[s.id];
        if (d && !(s.description && s.description.trim())) { changed = true; return { ...s, description: d }; }
        return s;
      });
      return changed ? next : prev;
    });
  }, [services, setServices]);

  const masters = branch.masters;
  const cats = [...categories].sort((a, b) => a.order - b.order);

  /* Recherche + repli — le catalogue peut être dense ; on aide à s'y retrouver.
     Une recherche déplie tout et masque les catégories sans correspondance. */
  const q = query.trim().toLowerCase();
  const matchSvc = (s: Service) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
  const matchProd = (p: Product) => !q || p.name.toLowerCase().includes(q);
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allCollapsed = cats.length > 0 && cats.every((c) => collapsed.has(c.id));
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(cats.map((c) => c.id)));

  /* Filet de secours : toute prestation/produit dont la catégorie n'existe pas
     (plus) dans la liste apparaît quand même, sous « À reclasser » — sinon elle
     serait invisible au Catalogue alors qu'elle sort bien en caisse. On peut la
     Modifier pour la ranger dans une vraie catégorie. */
  const ORPHAN_ID = '__orphans__';
  const knownCatIds = new Set(cats.map((c) => c.id));
  const orphanSvcs = services.filter((s) => !knownCatIds.has(s.categoryId)).sort((a, b) => a.order - b.order);
  const orphanProds = products.filter((p) => !knownCatIds.has(p.categoryId)).sort((a, b) => a.order - b.order);
  const renderCats: CatalogCategory[] = orphanSvcs.length || orphanProds.length
    ? [...cats, { id: ORPHAN_ID, fon: 'À RECLASSER', label: 'Sans catégorie — à ranger', enabled: true, order: Number.MAX_SAFE_INTEGER }]
    : cats;

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
      setCategories((prev) => prev.map((c) => (c.id === catForm.id ? { ...c, fon: catForm.fon.trim(), label: catForm.label.trim(), enabled: catForm.enabled } : c)));
    } else {
      const maxOrder = cats.reduce((m, c) => Math.max(m, c.order), 0);
      setCategories((prev) => [...prev, { id: uid(), fon: catForm.fon.trim(), label: catForm.label.trim(), enabled: catForm.enabled, order: maxOrder + 1 }]);
    }
    setCatForm(null);
  };

  const deleteCat = (cat: CatalogCategory) => {
    const svcCount = services.filter((s) => s.categoryId === cat.id).length;
    const prodCount = products.filter((p) => p.categoryId === cat.id).length;
    const refs = svcCount + prodCount;
    const warn = refs > 0
      ? `\n\nAttention : ${svcCount} prestation${svcCount > 1 ? 's' : ''} et ${prodCount} produit${prodCount > 1 ? 's' : ''} y sont rattaché${refs > 1 ? 's' : ''} — ils resteront sans catégorie tant que vous ne les réaffectez pas.`
      : '';
    if (!window.confirm(`Supprimer la catégorie « ${cat.fon} · ${cat.label} » ?${warn}`)) return;
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
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

  /* Change vite le mode de prix depuis la carte : Fixe → Variable → Sur devis.
     `hidePrice` suit le mode « devis » (front & caisse s'en servent). */
  const cyclePriceMode = (svc: Service) => {
    const order: PriceMode[] = ['fixe', 'variable', 'devis'];
    const next = order[(order.indexOf(priceModeOf(svc)) + 1) % order.length];
    patchSvc(svc.id, { priceMode: next, hidePrice: next === 'devis' });
  };

  const deleteSvc = (svc: Service) => {
    if (!window.confirm(`Supprimer la prestation « ${svc.name} » ? Cette action est définitive.`)) return;
    setServices((prev) => prev.filter((s) => s.id !== svc.id));
  };

  const openSvcEdit = (svc: Service) =>
    setSvcForm({
      id: svc.id, categoryId: svc.categoryId, name: svc.name, description: svc.description ?? '',
      price: String(svc.priceXof), priceMode: priceModeOf(svc), palier: svc.palier, durationMin: String(svc.durationMin), sessions: svc.sessions, master: svc.master,
    });

  const saveSvc = () => {
    if (!svcForm || !svcForm.name.trim()) return;
    const price = parseInt(svcForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const dur = parseInt(svcForm.durationMin.replace(/[^0-9]/g, ''), 10) || 60;
    // `hidePrice` reste synchronisé avec le mode « devis » (front & caisse s'en servent).
    const hidePrice = svcForm.priceMode === 'devis';
    if (svcForm.id) {
      patchSvc(svcForm.id, {
        categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
        priceXof: price, priceMode: svcForm.priceMode, hidePrice, palier: svcForm.palier, durationMin: dur, sessions: svcForm.sessions, master: svcForm.master,
      });
    } else {
      const maxOrder = svcOf(svcForm.categoryId).reduce((m, s) => Math.max(m, s.order), 0);
      setServices((prev) => [
        ...prev,
        {
          id: uid(), categoryId: svcForm.categoryId, name: svcForm.name.trim(), description: svcForm.description.trim() || undefined,
          palier: svcForm.palier, priceXof: price, priceMode: svcForm.priceMode, hidePrice, sessions: svcForm.sessions,
          master: svcForm.master, durationMin: dur, order: maxOrder + 1, temps: [1, 1, 1, 1],
        },
      ]);
    }
    setSvcForm(null);
  };

  /* — produits — (partagés avec le Laboratoire via productsStore) */
  const prodsOf = (catId: string) => products.filter((p) => p.categoryId === catId).sort((a, b) => a.order - b.order);

  const moveProd = (prod: Product, dir: -1 | 1) => {
    const list = prodsOf(prod.categoryId);
    const idx = list.findIndex((p) => p.id === prod.id);
    const other = list[idx + dir];
    if (!other) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === prod.id ? { ...p, order: other.order } : p.id === other.id ? { ...p, order: prod.order } : p,
      ),
    );
  };
  const patchProd = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const openProdEdit = (prod: Product) =>
    setProdForm({ id: prod.id, categoryId: prod.categoryId, name: prod.name, price: String(prod.priceXof), stock: String(prod.stock) });

  const saveProd = () => {
    if (!prodForm || !prodForm.name.trim()) return;
    const price = parseInt(prodForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const stock = parseInt(prodForm.stock.replace(/[^0-9]/g, ''), 10) || 0;
    if (prodForm.id) {
      patchProd(prodForm.id, { categoryId: prodForm.categoryId, name: prodForm.name.trim(), priceXof: price, stock });
    } else {
      const maxOrder = prodsOf(prodForm.categoryId).reduce((m, p) => Math.max(m, p.order), 0);
      setProducts((prev) => [...prev, { id: uid(), categoryId: prodForm.categoryId, name: prodForm.name.trim(), priceXof: price, stock, order: maxOrder + 1 }]);
    }
    setProdForm(null);
  };

  const deleteProd = (prod: Product) => {
    if (!window.confirm(`Retirer le produit « ${prod.name} » de la gamme ?`)) return;
    setProducts((prev) => prev.filter((p) => p.id !== prod.id));
  };

  const dodoId = cats.find((c) => c.id === 'dodo')?.id ?? cats[0]?.id ?? 'dodo';

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · L’offre"
        title="Le catalogue."
        sub="Segmenté par catégorie ™ et par palier d’expérience — jamais par remise. Chaque prestation couvre les quatre temps : Purifier · Nourrir · Sceller · Couronner."
        actions={
          <>
            <Button variant="ghost" onClick={() => setCatForm({ id: null, fon: '', label: '', enabled: true })}>+ Catégorie</Button>
            <Button variant="ghost" onClick={() => setProdForm(emptyProdForm(dodoId))}>+ Produit</Button>
            <Button onClick={() => setSvcForm(emptySvcForm(cats[0]?.id ?? 'vekpe', masters[0] ?? ''))}>+ Prestation</Button>
          </>
        }
      />

      {cats.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', flexWrap: 'wrap' }}>
          <input
            className="mnd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une prestation, un produit…"
            style={{ flex: '1 1 240px', maxWidth: 360 }}
          />
          {query && <button className="trv-minibtn" onClick={() => setQuery('')}>Effacer</button>}
          <Button variant="ghost" onClick={toggleAll}>{allCollapsed ? 'Tout déplier' : 'Tout replier'}</Button>
        </div>
      )}

      {cats.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)', padding: '28px 0', textAlign: 'center' }}>
          Le catalogue est vierge. Commencez par inscrire une catégorie ™ — elle accueillera vos prestations et vos produits Maison.
        </div>
      )}

      {renderCats.map((cat, ci) => {
        const isOrphan = cat.id === ORPHAN_ID;
        const list = (isOrphan ? orphanSvcs : svcOf(cat.id)).filter(matchSvc);
        const prods = (isOrphan ? orphanProds : prodsOf(cat.id)).filter(matchProd);
        const count = list.length + prods.length;
        const catMatches = !q || cat.fon.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q);
        /* En recherche : on masque les catégories sans aucune correspondance. */
        if (q && count === 0 && !catMatches) return null;
        /* Replié uniquement hors recherche — une recherche déplie tout. */
        const open = !q && !collapsed.has(cat.id);
        return (
          <section key={cat.id} className="trv-catblock" style={{ opacity: cat.enabled ? 1 : 0.6 }}>
            <div className="trv-catblock__band">
              {!q && (
                <button
                  className="trv-sq"
                  title={open ? 'Replier' : 'Déplier'}
                  onClick={() => toggleCollapse(cat.id)}
                  style={{ marginRight: 8, flex: 'none' }}
                >
                  {open ? '▾' : '▸'}
                </button>
              )}
              <button
                className="trv-catblock__id"
                onClick={() => !q && toggleCollapse(cat.id)}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: q ? 'default' : 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span className="fon">{cat.fon}</span>
                <span className="label">{cat.label}</span>
              </button>
              <span className="trv-catblock__count">
                {count} élément{count > 1 ? 's' : ''}
              </span>
              <span className="trv-catblock__spacer" />
              {!isOrphan && (
                <>
                  <button
                    className="trv-minibtn"
                    style={{ color: cat.enabled ? 'var(--copper-600)' : 'var(--ink-soft)' }}
                    title="Afficher / masquer cette catégorie aux clientes"
                    onClick={() => toggleCat(cat)}
                  >
                    {cat.enabled ? '● Visible aux clientes' : '○ Masquée du front'}
                  </button>
                  <span className="trv-catblock__tools">
                    <button className="trv-minibtn" title="Modifier la catégorie" onClick={() => setCatForm({ id: cat.id, fon: cat.fon, label: cat.label, enabled: cat.enabled })}>
                      Modifier
                    </button>
                    <button className="trv-minibtn" title="Supprimer la catégorie" onClick={() => deleteCat(cat)}>
                      Supprimer
                    </button>
                    <button className="trv-sq" title="Monter" disabled={ci === 0} onClick={() => moveCat(cat, -1)}>↑</button>
                    <button className="trv-sq" title="Descendre" disabled={ci === renderCats.length - 1} onClick={() => moveCat(cat, 1)}>↓</button>
                  </span>
                </>
              )}
            </div>

            {open && (
            <>
            <div className="trv-catblock__filet" />

            <div className="trv-catblock__body tr-grid tr-grid--2">
              {list.map((svc, si) => (
                <article key={svc.id} className="trv-svc">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div className="trv-svc__name">{svc.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flex: 'none' }}>
                      <button
                        className="trv-hideprice"
                        title="Mode de prix — cliquez pour changer : Fixe → Variable → Sur devis"
                        onClick={() => cyclePriceMode(svc)}
                      >
                        {PRICE_MODES.find((m) => m.k === priceModeOf(svc))?.label}
                      </button>
                      <div className="trv-svc__price">
                        {priceModeOf(svc) === 'devis'
                          ? <em style={{ fontSize: 15, color: 'var(--ink-soft)' }}>sur devis</em>
                          : (
                            <span>
                              {priceModeOf(svc) === 'variable' && <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginRight: 4 }}>dès</span>}
                              {fmtMoney(svc.priceXof, currency)}
                            </span>
                          )}
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
                      <button className="trv-minibtn" title="Supprimer la prestation" onClick={() => deleteSvc(svc)}>Supprimer</button>
                    </span>
                  </div>
                </article>
              ))}

              {prods.map((p, pi) => (
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
                    <span className="trv-stepper">
                      <button className="trv-sq" title="Retirer une unité" onClick={() => patchProd(p.id, { stock: Math.max(0, p.stock - 1) })}>−</button>
                      <span className="val">{p.stock}</span>
                      <button className="trv-sq" title="Ajouter une unité" onClick={() => patchProd(p.id, { stock: p.stock + 1 })}>+</button>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>en stock</span>
                    </span>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <button className="trv-sq" title="Monter le produit" disabled={pi === 0} onClick={() => moveProd(p, -1)}>▲</button>
                      <button className="trv-sq" title="Descendre le produit" disabled={pi === prods.length - 1} onClick={() => moveProd(p, 1)}>▼</button>
                      <button className="trv-minibtn" onClick={() => openProdEdit(p)}>Modifier</button>
                      <button className="trv-minibtn" onClick={() => deleteProd(p)}>Supprimer</button>
                    </span>
                  </div>
                </article>
              ))}

              {list.length === 0 && prods.length === 0 && (
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)', padding: '8px 0' }}>
                  {q ? 'Aucune correspondance dans cette catégorie.' : 'Aucune prestation ni produit dans cette catégorie pour l’instant.'}
                </div>
              )}
            </div>
            </>
            )}
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
              <Field label={svcForm.priceMode === 'variable' ? 'Prix de départ (F CFA)' : svcForm.priceMode === 'devis' ? 'Prix indicatif (facultatif)' : 'Prix (F CFA)'}>
                <Input inputMode="numeric" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} placeholder="45 000" />
              </Field>
            </div>
            <Field label="Mode de prix">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRICE_MODES.map((m) => (
                  <button
                    key={m.k}
                    type="button"
                    className={`trv-palier-chip ${svcForm.priceMode === m.k ? 'is-active' : ''}`}
                    onClick={() => setSvcForm({ ...svcForm, priceMode: m.k })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {svcForm.priceMode === 'fixe'
                  ? 'Prix ferme — facturé tel quel.'
                  : svcForm.priceMode === 'variable'
                    ? 'Affiché « à partir de » ; le montant réel se fixe au fauteuil (à la prise de rendez-vous).'
                    : 'Aucun prix affiché — « sur devis ». Le montant se saisit à la prise de rendez-vous.'}
              </div>
            </Field>
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

      {prodForm && (
        <Modal title={prodForm.id ? 'Le produit Maison.' : 'Nouveau produit Maison.'} onClose={() => setProdForm(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom du produit">
              <Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} placeholder="Ex. Le Sérum Moringa & Prêle" />
            </Field>
            <Field label="Catégorie ™">
              <Select value={prodForm.categoryId} onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
                ))}
              </Select>
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Prix conseillé (F CFA)">
                <Input inputMode="numeric" value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} placeholder="12 000" />
              </Field>
              <Field label="Stock">
                <Input inputMode="numeric" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setProdForm(null)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveProd} disabled={!prodForm.name.trim()}>{prodForm.id ? 'Enregistrer le produit' : 'Inscrire à la gamme'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {catForm && (
        <Modal title={catForm.id ? 'La catégorie.' : 'Nouvelle catégorie.'} onClose={() => setCatForm(null)} width={480}>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={catForm.enabled} onChange={(e) => setCatForm({ ...catForm, enabled: e.target.checked })} />
              Visible aux clientes (Vitrine / Ma Couronne)
            </label>
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
