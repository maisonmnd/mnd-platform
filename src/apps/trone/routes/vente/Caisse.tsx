import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, rateToXof } from '../../../../shared/currency';
import { CURRENCIES } from '../../../../shared/geo';
import { useSettings } from '../../../../shared/settings';
import { useCategories, useServices, useProducts, priceModeOf, type PriceMode } from '../../../../shared/catalog';
import { useFormations } from '../equipe/data';
import { Toggle } from '../equipe/ui';
import { useClients, useFamilies } from '../../../../shared/clients';
import {
  useModelBands, useBandSets, pricingOf, personalPriceXof, servesBand, bandForService,
} from '../../../../shared/pricing';
import { ClientPicker } from '../clients/_shared';
import { useInvoices, useCashboxes, usePaymentMethods, invoiceTotal, cashboxCurrency, nextInvoiceNumber, useCredits, creditMovementsStore, creditBalanceOf, type Invoice, type PaymentMethod, type CreditHolder } from '../../../../shared/finance';
import { holderOf, payerClientIdOf } from '../../../../shared/accounts';
import { invoicePdf, type InvoicePdfData } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import '../equipe/equipe.css'; // styles du Toggle partagé (tre-toggle)
import './vente.css';

/* Caisse POS — encaissement au fauteuil. Chaque encaissement crée une facture
   payée dans le registre des finances et crédite la caisse choisie. */

/* `unitXof` : montant saisi au ticket pour une prestation SUR DEVIS — son prix
   catalogue est 0 par définition, et vendre à 0 F par inattention est exactement
   l'erreur qu'une caisse doit rendre impossible. */
type CartLine = { qty: number; disc: number; unitXof?: number };

/* Sous-titres indicatifs des moyens connus ; la liste réelle est gérable
   (usePaymentMethods) — un moyen personnalisé retombe sur « Paiement ». */
const PAY_SUB: Record<string, string> = {
  'MTN MoMo': 'Mobile Money',
  'Moov': 'Mobile Money',
  'Celtis': 'Mobile Money',
  'Wave': 'Mobile Money',
  'Espèces': 'Caisse',
  'Carte': 'TPE bancaire',
  'Virement bancaire': 'Banque',
  'PayPal': 'Diaspora',
  'Chèque': 'Bancaire',
  'Lien WhatsApp': 'Paiement à distance',
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Caisse() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [formations] = useFormations();
  const [clients] = useClients();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [families] = useFamilies();
  const [credits] = useCredits();
  const [invoices, setInvoices] = useInvoices();
  const [cashboxes] = useCashboxes();
  const [methods] = usePaymentMethods();

  const [tab, setTab] = useState<'encaisser' | 'journal'>('encaisser');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [globalDisc, setGlobalDisc] = useState(0);
  const [globalDiscXof, setGlobalDiscXof] = useState(0);
  /* Devise étrangère — exceptionnel, ouvert depuis Paramètres. */
  const [settings] = useSettings();
  const [fxOn, setFxOn] = useState(false);
  const [fxCode, setFxCode] = useState('EUR');
  const [fxRate, setFxRate] = useState(String(rateToXof('EUR') || ''));
  const [clientId, setClientId] = useState('');
  const [avoirStr, setAvoirStr] = useState('0');
  /* Défaut = premier moyen de la liste gérée (Paramètres) — un « MTN MoMo » codé
     en dur devenait un Select vide si la maison renommait le moyen. */
  const [pay, setPay] = useState<PaymentMethod>(methods[0] ?? 'Espèces');
  const branchCashboxes = cashboxes.filter((c) => c.branchId === branch.id);
  const [cashbox, setCashbox] = useState<string>('');
  const [journalCaisse, setJournalCaisse] = useState<string>('Toutes');
  const [waHint, setWaHint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  /* La caisse active reste toujours valide : on sélectionne la première caisse de
     la branche au montage (et au changement de branche), et on ne réinitialise
     jamais la sélection après une vente. Vide s'il n'existe aucune caisse. */
  useEffect(() => {
    if (branchCashboxes.length === 0) {
      if (cashbox) setCashbox('');
    } else if (!branchCashboxes.some((c) => c.name === cashbox)) {
      setCashbox(branchCashboxes[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, cashboxes]);

  /* Une caisse ne peut recevoir que sa propre devise : payer en euros doit
     créditer le tiroir en euros, jamais celui de la maison. On restreint donc le
     choix — et s'il n'existe aucune caisse dans cette devise, l'encaissement est
     bloqué plutôt que versé au mauvais tiroir. */
  const payCurrency = fxOn ? fxCode : currency;
  const eligibleBoxes = branchCashboxes.filter((c) => cashboxCurrency(c) === payCurrency);
  const activeCashbox = eligibleBoxes.some((c) => c.name === cashbox)
    ? cashbox
    : eligibleBoxes[0]?.name ?? '';
  const hasCashbox = eligibleBoxes.length > 0;

  const branchClients = clients.filter((c) => c.branchId === branch.id && !c.archived);

  /* — l'offre, groupée par catégorie ™ — */
  const groups = useMemo(() => {
    /* LE COMPTOIR PARLE À UNE TÊTE, PAS AU CATALOGUE. Tant qu'aucune cliente
       n'est choisie, `pricing` est neutre : tout s'affiche au prix catalogue,
       comme avant. Dès qu'une tête est au comptoir, deux choses changent —

       1. LE PRIX EST LE SIEN. Un resserrage à 100 F le lock ne coûte pas la
          même chose à 113 locks qu'à 195 ; afficher « dès 35 000 F » à quelqu'un
          dont le prix est calculable, c'est faire ressaisir un montant qu'on
          connaît, et se tromper un jour sur deux.
       2. ON NE PROPOSE QUE SON CALIBRE. Les créations VÈKPÈ™ existent en cinq
          versions, une par calibre, au même prix affiché : les cinq côte à côte
          n'offrent aucun choix, seulement l'occasion d'encaisser la mauvaise. */
    const cliente = clients.find((c) => c.id === clientId);
    const pricing = pricingOf(cliente, bands, sets);
    const offre = services.filter((sv) => servesBand(sv, bandForService(sv, pricing)));
    const cats = [...categories].sort((a, b) => a.order - b.order);
    const knownCats = new Set(cats.map((c) => c.id));
    type CaisseItem = { key: string; n: string; priceXof: number; kind: 'service' | 'product' | 'formation'; mode: PriceMode };
    const toItem = (s: typeof services[number]): CaisseItem => ({
      key: `s:${s.id}`,
      n: s.name,
      priceXof: personalPriceXof(s, pricing),
      kind: 'service' as const,
      /* Un tarif au lock CESSE d'être « variable » dès qu'on connaît le nombre
         de locks : le montant est exact, il n'a plus à s'annoncer « dès ». */
      mode: s.ratePerLock && pricing.lockCount ? ('fixe' as const) : priceModeOf(s),
    });
    const gs: { key: string; label: string; items: CaisseItem[] }[] = cats
      .map((cat) => ({
        key: cat.id,
        label: `${cat.fon} · ${cat.label}`,
        items: offre
          .filter((s) => s.categoryId === cat.id)
          .sort((a, b) => a.order - b.order)
          .map(toItem),
      }))
      .filter((g) => g.items.length > 0);
    /* Prestation dont la catégorie est absente ou pas encore chargée : elle
       apparaît quand même en caisse (« Autres prestations ») — jamais perdue. */
    const orphans = offre.filter((s) => !knownCats.has(s.categoryId)).sort((a, b) => a.order - b.order).map(toItem);
    if (orphans.length) gs.push({ key: 'autres', label: 'Autres prestations', items: orphans });
    const prods = [...products].sort((a, b) => a.order - b.order).map((p) => ({ key: `p:${p.id}`, n: p.name, priceXof: p.priceXof, kind: 'product' as const, mode: 'fixe' as const }));
    if (prods.length) gs.push({ key: 'produits', label: 'Produits Maison · DÒDÒ™', items: prods });
    const forms = formations
      .filter((f) => !f.archived && f.priceXof > 0)
      .map((f) => ({ key: `f:${f.id}`, n: f.name, priceXof: f.priceXof, kind: 'formation' as const, mode: 'fixe' as const }));
    if (forms.length) gs.push({ key: 'formations', label: 'Académie · Formations', items: forms });
    return gs;
  }, [categories, services, products, formations, clients, clientId, bands, sets]);

  const flat = useMemo(() => {
    const map: Record<string, { n: string; priceXof: number; kind: 'service' | 'product' | 'formation'; mode: PriceMode }> = {};
    groups.forEach((g) => g.items.forEach((it) => { map[it.key] = it; }));
    return map;
  }, [groups]);

  /* Repli des catégories — la liste des prestations peut être longue. */
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));
  const toggleAllGroups = () => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)));
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const add = (key: string) =>
    setCart((c) => ({ ...c, [key]: { qty: (c[key]?.qty ?? 0) + 1, disc: c[key]?.disc ?? 0 } }));
  const dec = (key: string) =>
    setCart((c) => {
      const cur = c[key];
      if (!cur) return c;
      if (cur.qty <= 1) {
        const { [key]: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, [key]: { ...cur, qty: cur.qty - 1 } };
    });
  const setLineDisc = (key: string, pct: number) =>
    setCart((c) => (c[key] ? { ...c, [key]: { ...c[key], disc: c[key].disc === pct ? 0 : pct } } : c));

  const lines = Object.entries(cart)
    .filter(([k]) => flat[k])
    .map(([k, v]) => {
      const it = flat[k];
      /* Prix effectif de la ligne : le montant SAISI pour un sur-devis (0 tant
         qu'il n'est pas renseigné), le prix catalogue sinon. */
      const unit = it.mode === 'devis' ? (v.unitXof ?? 0) : it.priceXof;
      const netXof = unit * v.qty * (1 - v.disc / 100);
      return { key: k, ...it, ...v, unit, netXof };
    });
  const subXof = lines.reduce((s, l) => s + l.netXof, 0);
  /* Un sur-devis sans montant bloque l'encaissement : mieux vaut un blocage
     explicite qu'une création microlocks vendue 0 F par inattention. */
  const devisMissing = lines.filter((l) => l.mode === 'devis' && l.unit <= 0);
  /* Remise globale en % puis remise en CFA — même ordre que `invoiceTotal`,
     sinon le net affiché ici ne serait pas celui inscrit sur la facture. */
  const netXof = Math.max(0, Math.round(subXof * (1 - globalDisc / 100)) - globalDiscXof);
  /* Avoir : porté par le compte de la cliente choisie (famille du parent payeur,
     ou solo). Applicable jusqu'au net ; le comptant couvre le reste. La part avoir
     est du revenu mais hors caisse (avoirXof — routée par la Synthèse). */
  const posClient = branchClients.find((c) => c.id === clientId);
  const posAccount: CreditHolder | null = posClient ? holderOf(posClient, families) : null;
  const posAvoirBal = posAccount ? creditBalanceOf(credits, posAccount) : 0;
  const posAvoir = Math.max(0, Math.min(Math.min(posAvoirBal, netXof), Math.round(Number(avoirStr) || 0)));
  const posPayerId = posClient ? payerClientIdOf(posClient, families) : '';
  const posPayer = branchClients.find((c) => c.id === posPayerId);
  const posCashDue = Math.max(0, netXof - posAvoir);
  /* Le montant en devise se DÉDUIT du COMPTANT dû (net − avoir) : c'est le XOF
     qui fait foi, jamais l'inverse — et la part réglée par avoir ne traverse
     pas le comptoir, elle n'a pas à être convertie en billets. */
  const fxRateNum = Math.max(0, Number(fxRate) || 0);
  const fxAmount = fxOn && fxRateNum > 0 ? Math.round((posCashDue / fxRateNum) * 100) / 100 : 0;

  /* — encaissement — */

  const checkout = async () => {
    if (lines.length === 0 || devisMissing.length > 0) return;
    const client = branchClients.find((c) => c.id === clientId);
    const now = new Date();
    const grossXof = lines.reduce((s, l) => s + l.unit * l.qty, 0);
    const inv: Invoice = {
      id: uid(),
      branchId: branch.id,
      kind: 'facture',
      number: nextInvoiceNumber(invoices, 'MND'),
      /* Compte famille : facture au nom du PARENT PAYEUR, cliente soignée en mention. */
      clientId: posPayerId || client?.id || '',
      clientName: client ? undefined : 'Walk-in',
      forClientId: posPayerId && posPayerId !== clientId ? clientId : undefined,
      date: todayIso(),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      lines: lines.map((l) => ({ id: uid(), label: l.n, qty: l.qty, unitXof: l.unit, discountPct: l.disc })),
      globalDiscountPct: globalDisc,
      globalDiscountXof: globalDiscXof || undefined,
      fx: fxOn && fxAmount > 0 ? { code: fxCode, rate: fxRateNum, amount: fxAmount } : undefined,
      theme: 'Aube',
      status: 'payée',
      payment: posCashDue > 0 ? pay : (posAvoir > 0 ? 'Avoir' : pay),
      cashbox: activeCashbox || undefined,
      avoirXof: posAvoir > 0 ? posAvoir : undefined,
    };
    setInvoices((prev) => [inv, ...prev]);
    /* Avoir consommé : écriture d'usage sur le compte porteur. */
    if (posAvoir > 0 && posAccount) {
      creditMovementsStore.set((prev) => [...prev, {
        id: uid(), branchId: branch.id, holderType: posAccount.type, holderId: posAccount.id,
        kind: 'usage', amountXof: posAvoir, date: todayIso(), forClientId: clientId || undefined, invoiceId: inv.id,
      }]);
    }
    if (pay === 'Lien WhatsApp') {
      /* Un lien wa.me ne peut PAS joindre de fichier : on télécharge d'abord le vrai
         reçu PDF, puis on ouvre le chat pré-rempli en signalant la pièce jointe. */
      const receipt: InvoicePdfData = {
        kind: 'facture',
        number: inv.number,
        houseName: branch.name,
        houseSub: branch.city ? `${branch.city} · l'art de la couronne` : undefined,
        date: fmtDateFr(inv.date),
        clientName: client?.name ?? 'Cliente de passage',
        clientPhone: client?.phone,
        lines: inv.lines.map((l) => ({
          label: l.label,
          qty: l.qty,
          unit: fmtMoney(l.unitXof, currency),
          total: fmtMoney(Math.round(l.qty * l.unitXof * (1 - l.discountPct / 100)), currency),
        })),
        subtotal: fmtMoney(Math.round(grossXof), currency),
        discount: grossXof - netXof > 0 ? `− ${fmtMoney(Math.round(grossXof - netXof), currency)}` : undefined,
        total: fmtMoney(netXof, currency),
        /* Le reçu doit dire ce que la cliente a réellement tendu, sinon elle lit
           un montant en F qu'elle n'a jamais versé. */
        payment: inv.fx
          ? `${inv.payment} · ${inv.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${inv.fx.code} (1 ${inv.fx.code} = ${inv.fx.rate} ${currency})`
          : inv.payment,
        status: 'payée',
      };
      await invoicePdf(receipt);
      const msg =
        `Maison MND · ${inv.number}\n` +
        `${client ? client.name : 'Chère tête couronnée'}, voici le règlement de votre passage : ${fmtMoney(netXof, currency)}.\n` +
        `Votre reçu ${inv.number} est en pièce jointe.\n` +
        `Réglez d’un geste — MTN MoMo · Moov Money. La maison veille sur votre couronne.`;
      const phone = client?.phone.replace(/\D/g, '') ?? '';
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      setWaHint('Reçu PDF téléchargé — joignez-le à votre message WhatsApp.');
    } else {
      setWaHint(null);
    }
    setCart({});
    setGlobalDisc(0);
    setGlobalDiscXof(0);
    setAvoirStr('0');
  };

  /* — journal du jour — */
  const today = todayIso();
  const journal = invoices
    .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && i.date === today)
    .filter((i) => journalCaisse === 'Toutes' || (i.cashbox ?? 'Caisse principale') === journalCaisse);
  const journalTotal = journal.reduce((s, i) => s + invoiceTotal(i), 0);
  /* Pourboires encaissés dans la caisse — hors chiffre d'affaires, à reverser aux maîtres. */
  const tipsTotal = journal.reduce((s, i) => s + (i.tipXof ?? 0), 0);
  const sumBy = (fn: (p?: PaymentMethod) => boolean) => journal.filter((i) => fn(i.payment)).reduce((s, i) => s + invoiceTotal(i), 0);
  const clientName = (i: Invoice) => clients.find((c) => c.id === i.clientId)?.name ?? i.clientName ?? '—';
  const journalDateLabel = (() => {
    const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Point de vente · Encaissement"
        title="Caisse."
        actions={
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
            Caisse active
            {hasCashbox ? (
              <select
                className="mnd-select"
                value={activeCashbox}
                onChange={(e) => setCashbox(e.target.value)}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}
              >
                {eligibleBoxes.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--ink-soft)', textTransform: 'none', letterSpacing: 0 }}>
                {fxOn
                  ? `Aucune caisse en ${payCurrency} — créez-en une dans Dépenses`
                  : 'Aucune caisse — créez-en une dans Dépenses'}
              </span>
            )}
          </label>
        }
      />

      <div className="trv-tabs">
        <button className={`trv-tab ${tab === 'encaisser' ? 'is-active' : ''}`} onClick={() => setTab('encaisser')}>Encaisser</button>
        <button className={`trv-tab ${tab === 'journal' ? 'is-active' : ''}`} onClick={() => setTab('journal')}>Journal de caisse</button>
      </div>

      {tab === 'encaisser' && (
        <div className="trv-pos-grid">
          {/* — l'offre — */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div className="trv-sec-label trv-sec-label--copper" style={{ margin: 0 }}>Services & produits</div>
              {groups.length > 0 && (
                <button className="trv-minibtn" onClick={toggleAllGroups}>{allCollapsed ? 'Tout déplier' : 'Tout replier'}</button>
              )}
            </div>
            {groups.map((g, gi) => {
              const [fon, ...rest] = g.label.split(' · ');
              const open = !collapsed.has(g.key);
              return (
                <div key={g.key} className="trv-catgroup" style={gi > 0 ? { borderTop: '1px solid var(--hairline)', marginTop: 18, paddingTop: 16 } : undefined}>
                  <div className="trv-catgroup__head" onClick={() => toggleGroup(g.key)} style={{ cursor: 'pointer' }} role="button" title={open ? 'Replier' : 'Déplier'}>
                    <span style={{ marginRight: 8, color: 'var(--ink-soft)', fontSize: 12, flex: 'none' }}>{open ? '▾' : '▸'}</span>
                    <span className="trv-catgroup__fon">{fon}</span>
                    {rest.length > 0 && <span className="trv-catgroup__label">{rest.join(' · ')}</span>}
                    <span className="trv-catgroup__count">{g.items.length}</span>
                  </div>
                  {open && (
                    <div className="tr-grid tr-grid--2">
                      {g.items.map((it) => (
                        <button key={it.key} className="trv-pick" onClick={() => add(it.key)}>
                          <div className="n">{it.n}</div>
                          <div className="p">
                            {it.mode === 'devis'
                              ? 'sur devis — montant à saisir au ticket'
                              : it.mode === 'variable'
                                ? `dès ${fmtMoney(it.priceXof, currency)}`
                                : fmtMoney(it.priceXof, currency)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* — le ticket — */}
          <div className="trv-ticket">
            <div className="trv-ticket__head">
              <span className="t">Ticket</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>{activeCashbox || 'Caisse principale'}</span>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)', flex: 'none' }}>Cliente</span>
                <div style={{ flex: 1 }}>
                  <ClientPicker value={clientId} onChange={setClientId} allowWalkIn />
                </div>
              </div>

              {lines.length === 0 && (
                <div style={{ textAlign: 'center', padding: '34px 16px', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                  Touchez une prestation pour l’ajouter au ticket.
                </div>
              )}

              {lines.map((l) => (
                <div key={l.key} className="trv-line">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--ink)' }}>{l.n}</div>
                      {l.mode === 'devis' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Devis</span>
                          <input
                            className="mnd-input"
                            type="number"
                            min={0}
                            value={l.unitXof ?? ''}
                            onChange={(e) => {
                              const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                              setCart((c) => (c[l.key] ? { ...c, [l.key]: { ...c[l.key], unitXof: val } } : c));
                            }}
                            placeholder="Montant convenu"
                            aria-label={`Montant convenu · ${l.n}`}
                            style={{ width: 140, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                          />
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{currency}</span>
                        </div>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                          {fmtMoney(l.unit, currency)} · {l.kind === 'product' ? 'produit' : l.kind === 'formation' ? 'formation' : 'service'}
                        </div>
                      )}
                    </div>
                    <span className="trv-qty">
                      <button onClick={() => dec(l.key)}>−</button>
                      <span className="q">{l.qty}</span>
                      <button className="plus" onClick={() => add(l.key)}>+</button>
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {fmtMoney(Math.round(l.netXof), currency)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Remise ligne</span>
                    <span className="trv-disc-badge">{l.disc}</span>
                    {[5, 10, 15, 20].map((pct) => (
                      <button key={pct} className={`trv-pill ${l.disc === pct ? 'is-active is-active--copper' : ''}`} onClick={() => setLineDisc(l.key, pct)}>
                        −{pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', maxWidth: 84, lineHeight: 1.3 }}>
                  Remise globale facture
                </span>
                {[0, 5, 10, 15].map((pct) => (
                  <button key={pct} className={`trv-pill ${globalDisc === pct ? 'is-active' : ''}`} onClick={() => setGlobalDisc(pct)}>
                    {pct === 0 ? '0' : `−${pct}%`}
                  </button>
                ))}
              </div>

              {/* Remise manuelle en CFA — geste de comptoir, retranchée après le %. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', maxWidth: 84, lineHeight: 1.3 }}>
                  Remise manuelle
                </span>
                <input
                  className="mnd-input"
                  type="number"
                  min={0}
                  value={globalDiscXof}
                  onChange={(e) => setGlobalDiscXof(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  style={{ width: 130, textAlign: 'right' }}
                  placeholder="0"
                  aria-label={`Remise manuelle en ${currency}`}
                />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{currency}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span>Sous-total</span>
                <span>{fmtMoney(Math.round(subXof), currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 4px' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--color-indigo)' }}>Net à payer</span>
                <span className="trv-net">{fmtMoney(netXof, currency)}</span>
              </div>

              {posAvoirBal > 0 && netXof > 0 && (
                <div style={{ marginTop: 12, border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Régler par l’avoir</span>
                    <span style={{ fontSize: 11.5, color: 'var(--copper-700)' }}>dispo {fmtMoney(posAvoirBal, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                    <input className="mnd-input" type="number" min={0} max={Math.min(posAvoirBal, netXof)} value={avoirStr} onChange={(e) => setAvoirStr(e.target.value)} style={{ flex: 1, minWidth: 0, textAlign: 'right' }} aria-label="Montant réglé par avoir" />
                    <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" style={{ flex: 'none' }} onClick={() => setAvoirStr(String(Math.min(posAvoirBal, netXof)))}>Max</button>
                  </div>
                  {posAvoir > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--copper-700)', marginTop: 7 }}>
                      Avoir −{fmtMoney(posAvoir, currency)} · comptant {fmtMoney(posCashDue, currency)}
                      {posPayerId && posPayerId !== clientId ? ` · compte ${posPayer?.name ?? 'famille'}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: '8px 22px 22px' }}>
              <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '6px 0 12px' }}>Paiement</div>
              <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
                {methods.map((m) => (
                  <button key={m} className={`trv-pay ${pay === m ? 'is-active' : ''}`} onClick={() => setPay(m)}>
                    <div className="n">{m}</div>
                    <div className="s">{PAY_SUB[m] ?? 'Paiement'}</div>
                  </button>
                ))}
              </div>
              {/* Devise étrangère — visible seulement quand la maison l'a ouvert
                  (Paramètres). La facture reste en {currency} : on ne consigne ici
                  que ce qui a été REÇU au comptoir, et à quel taux. */}
              {settings.fxEnabled && (
                <div style={{ marginTop: 14, border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>
                      Régler en devise étrangère
                    </span>
                    <Toggle on={fxOn} onToggle={() => setFxOn((v) => !v)} />
                  </div>
                  {fxOn && (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <select
                          className="mnd-select"
                          value={fxCode}
                          onChange={(e) => { setFxCode(e.target.value); setFxRate(String(rateToXof(e.target.value) || '')); }}
                          style={{ flex: '1 1 120px' }}
                          aria-label="Devise reçue"
                        >
                          {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                            <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                          ))}
                        </select>
                        <input
                          className="mnd-input"
                          type="number"
                          min={0}
                          step="any"
                          value={fxRate}
                          onChange={(e) => setFxRate(e.target.value)}
                          placeholder="Taux"
                          style={{ width: 110, textAlign: 'right' }}
                          aria-label={`Taux : 1 ${fxCode} en ${currency}`}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--copper-700)', marginTop: 8, lineHeight: 1.5 }}>
                        1 {fxCode} = {fxRateNum > 0 ? `${fxRateNum} ${currency}` : '…'} · taux du jour, à corriger si besoin
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--copper-300)' }}>
                        <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>À encaisser</span>
                        <span className="mnd-serif" style={{ fontSize: 20, color: 'var(--color-indigo)' }}>
                          {fxAmount > 0 ? `${fxAmount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${fxCode}` : '—'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {fxOn && !hasCashbox && (
                <div className="trv-pdf-hint" style={{ marginTop: 10, color: 'var(--color-copper)' }}>
                  Aucune caisse ne tient des {fxCode} — créez-la dans Dépenses (Devise détenue :
                  {' '}{fxCode}) avant d’encaisser. Les billets étrangers ne peuvent pas rejoindre
                  le tiroir de la maison.
                </div>
              )}
              <Button
                variant="copper"
                size="lg"
                style={{ marginTop: 16, width: '100%' }}
                /* On encaisse même sans caisse configurée (la vente est tracée par
                   la facture, tiroir « Caisse principale » par défaut). On EXIGE une
                   caisse UNIQUEMENT en devise étrangère : verser des euros au tiroir
                   en francs fausserait les deux soldes. Et JAMAIS un sur-devis sans
                   montant : une œuvre vendue 0 F par inattention. */
                disabled={lines.length === 0 || devisMissing.length > 0 || (fxOn && posCashDue > 0 && (!hasCashbox || fxAmount <= 0))}
                onClick={() => void checkout()}
              >
                {posCashDue === 0 && posAvoir > 0
                  ? `Encaisser par avoir · ${fmtMoney(posAvoir, currency)}`
                  : <>Encaisser {fxOn && fxAmount > 0
                      ? `${fxAmount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${fxCode}`
                      : fmtMoney(posCashDue, currency)}</>}
              </Button>
              {devisMissing.length > 0 && (
                <div className="trv-pdf-hint" style={{ marginTop: 10, color: 'var(--copper-700)' }}>
                  Saisissez le montant convenu de « {devisMissing[0].n} » sur sa ligne du ticket avant d’encaisser.
                </div>
              )}
              {waHint && <div className="trv-pdf-hint" style={{ marginTop: 10 }}>{waHint}</div>}
              <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                Reçu WhatsApp · réconciliation MoMo automatique.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 6 }}>Caisse · Journal du jour · {journalDateLabel}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, lineHeight: 1.05, color: 'var(--color-indigo)' }}>Journal de caisse.</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {['Toutes', ...branchCashboxes.map((c) => c.name)].map((n) => (
                  <button key={n} className={`trv-pill ${journalCaisse === n ? 'is-active' : ''}`} onClick={() => setJournalCaisse(n)}>
                    {n === 'Toutes' ? 'Toutes les caisses' : n}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setTab('encaisser')}>Clôturer la caisse</Button>
          </div>

          <div className="tr-grid tr-cols" style={{ '--cols': '1.3fr 1fr 1fr 1fr 1fr', '--cols-md': 'repeat(3, minmax(0,1fr))', '--cols-sm': 'repeat(2, minmax(0,1fr))', marginBottom: 24 } as CSSProperties}>
            <div className="trv-kpi trv-kpi--copper">
              <div className="l">Total encaissé · jour</div>
              <div className="v">{fmtMoney(journalTotal, currency)}</div>
              <div className="c">{journal.length} transaction{journal.length > 1 ? 's' : ''}</div>
            </div>
            <div className="trv-kpi"><div className="l">Mobile Money</div><div className="v">{fmtMoney(sumBy((p) => p === 'MTN MoMo' || p === 'Moov'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">Espèces</div><div className="v">{fmtMoney(sumBy((p) => p === 'Espèces'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">Carte</div><div className="v">{fmtMoney(sumBy((p) => p === 'Carte'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">WhatsApp</div><div className="v">{fmtMoney(sumBy((p) => p === 'Lien WhatsApp'), currency)}</div></div>
          </div>

          {tipsTotal > 0 && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, padding: '14px 18px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                Pourboires encaissés · à reverser aux maîtres : <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, color: 'var(--copper-600)' }}>{fmtMoney(tipsTotal, currency)}</strong>
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                Encaissé en caisse (dont pourboires) : <strong style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, color: 'var(--color-indigo)' }}>{fmtMoney(journalTotal + tipsTotal, currency)}</strong>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, overflow: 'hidden' }}>
            <div className="trv-journal-head">
              <span className="trv-th">N°</span>
              <span className="trv-th">Date</span>
              <span className="trv-th">Détail</span>
              <span className="trv-th">Paiement</span>
              <span className="trv-th" style={{ textAlign: 'right' }}>Montant</span>
            </div>
            {journal.map((i) => (
              <div
                key={i.id}
                className="trv-journal-row"
                onClick={() => navigate(`/factures?id=${i.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/factures?id=${i.id}`); } }}
                style={{ cursor: 'pointer' }}
                title="Ouvrir la facture"
                role="button"
                tabIndex={0}
              >
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, letterSpacing: '.04em', color: 'var(--copper-600)' }}>{i.number.slice(-8)}</span>
                <span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>{fmtDateFr(i.date)}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{i.time ?? '—'}</span>
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                    {i.lines.map((l) => (l.qty > 1 ? `${l.label} ×${l.qty}` : l.label)).join(' · ')}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                    {clientName(i)} · {i.cashbox ?? 'Caisse principale'}
                  </div>
                </div>
                <div>
                  <span className={`trv-paychip ${i.payment === 'MTN MoMo' || i.payment === 'Moov' ? 'momo' : ''}`}>{i.payment}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', textAlign: 'right' }}>
                  {fmtMoney(invoiceTotal(i), currency)}
                </span>
              </div>
            ))}
            {journal.length === 0 && (
              <div style={{ padding: '26px 24px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)' }}>
                Aucun encaissement pour cette caisse aujourd’hui. Le premier ticket du jour ouvrira le journal.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
