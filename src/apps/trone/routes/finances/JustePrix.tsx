import { useEffect, useMemo, useRef, useState } from 'react';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore, type Client } from '../../../../shared/clients';
import { useServices, type Service } from '../../../../shared/catalog';
import {
  useModelBands, modelBandsStore, sortedBands, bandLabel, roundPrice, bandOf, scalesWithModel,
  MODEL_BANDS_SEED, type ModelBand,
} from '../../../../shared/pricing';
import { uid } from '../../../../shared/store';
import './finances.css';

/* Le Juste Prix — pilotage des prix par le BARÈME DES MODÈLES (tranches de locks).
   Les sept « leviers » automatiques ont été retirés (2026-07-22, décision maison) :
   le prix ne dépend plus que du modèle de la cliente (son nombre de locks) et, si
   la maison le décide au cas par cas, d'un coefficient personnel. Le barème
   s'édite par coefficient OU directement par montant, et se synchronise
   (mnd_model_bands) — Ma Couronne montre à chaque cliente SON prix. */

/* Cellule numérique à VALIDATION AU BLUR — le brouillon reste local tant que la
   case a le focus ; Entrée ou sortie de case enregistre, Échap annule, une saisie
   invalide revient à l'enregistré. Sans ça, un tableau trié se réordonnait en
   pleine frappe et « mélangeait » les cases. */
function NumCell({
  value, onCommit, allowEmpty, decimal, width, placeholder, title, ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  allowEmpty?: boolean;
  decimal?: boolean;
  width: number;
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const asText = (v: number | null) => (v == null ? '' : String(v));
  const [draft, setDraft] = useState(asText(value));
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setDraft(asText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    if (cancelled.current) { cancelled.current = false; setDraft(asText(value)); return; }
    const raw = draft.trim().replace(',', '.');
    if (raw === '' && allowEmpty) { onCommit(null); return; }
    const v = decimal ? parseFloat(raw) : parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(v) && v > 0) onCommit(decimal ? Math.round(v * 100) / 100 : Math.round(v));
    else setDraft(asText(value));
  };
  return (
    <input
      className="mnd-input"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={draft}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      style={{ width, textAlign: 'right' }}
    />
  );
}

/* ===== Barème des modèles — tranches de locks → coef de prix, coef de durée, et
   MONTANT témoin. On édite indifféremment le coefficient OU le montant : saisir un
   montant recalcule le coefficient (montant ÷ prix de la prestation témoin). ===== */
function BaremeModeles({ currency }: { currency: string }) {
  const [bands] = useModelBands();
  const [services] = useServices();
  const sorted = sortedBands(bands);

  /* Prestation témoin : celle sur laquelle on lit (et saisit) les montants. Par
     défaut, la première prestation à prix fixe qui suit le modèle. */
  const modelServices = useMemo(
    () => services.filter((s) => !s.hidePrice && scalesWithModel(s)).sort((a, b) => a.priceXof - b.priceXof),
    [services],
  );
  const fallback = useMemo(() => services.filter((s) => !s.hidePrice), [services]);
  const [refId, setRefId] = useState('');
  const refService = modelServices.find((s) => s.id === refId) ?? modelServices[Math.floor(modelServices.length / 2)] ?? fallback[0];
  const refPrice = refService?.priceXof ?? 25000;

  const patchBand = (id: string, p: Partial<ModelBand>) =>
    modelBandsStore.set((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const removeBand = (id: string) => {
    if (bands.length <= 1) return;
    if (!window.confirm('Retirer cette tranche du barème ?')) return;
    modelBandsStore.set((prev) => prev.filter((b) => b.id !== id));
  };
  const addBand = () => {
    const lastMax = sorted.reduce((m, b) => Math.max(m, b.maxLocks ?? 0), 0);
    modelBandsStore.set((prev) => [...prev, { id: `mb-${uid()}`, maxLocks: lastMax + 100, coef: 1, durCoef: 1 }]);
  };
  const resetBands = () => {
    if (!window.confirm('Rétablir le barème recommandé (6 tranches) ? Vos tranches actuelles seront remplacées.')) return;
    modelBandsStore.set(() => MODEL_BANDS_SEED.map((b) => ({ ...b })));
  };
  /* Saisie d'un MONTANT → coefficient = montant ÷ prix témoin (borné ≥ 0,01). */
  const setAmount = (id: string, amount: number | null) => {
    if (amount == null || refPrice <= 0) return;
    patchBand(id, { coef: Math.max(0.01, Math.round((amount / refPrice) * 100) / 100) });
  };

  return (
    <div className="trf-panel" style={{ margin: '0 0 22px', padding: '22px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div className="trf-panel__title" style={{ marginBottom: 0 }}>Barème des modèles · tranches de locks</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <button className="trf-act" onClick={addBand}>+ Tranche</button>
          <button
            onClick={resetBands}
            style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--copper-600)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            rétablir la recommandation
          </button>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 14px', maxWidth: 760 }}>
        Le modèle de la cliente (son nombre de locks, sur sa fiche) choisit sa tranche : le prix ET la durée des
        prestations qui « suivent le modèle » (interrupteur ◈ au Catalogue) sont multipliés par ses coefficients.
        Vous pouvez saisir le <b>coefficient</b> ou directement le <b>montant</b> — le montant recalcule le coefficient.
      </div>

      {refService && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Prestation témoin</span>
          <select className="mnd-select" value={refService.id} onChange={(e) => setRefId(e.target.value)} style={{ width: 'auto', minWidth: 220 }} aria-label="Prestation témoin du barème">
            {(modelServices.length ? modelServices : fallback).map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {fmtMoney(s.priceXof, currency)}</option>
            ))}
          </select>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>catalogue {fmtMoney(refPrice, currency)}</span>
        </div>
      )}

      <div className="mnd-scroll-x">
        <table className="tre-table" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              <th>Tranche</th>
              <th>Jusqu’à (locks)</th>
              <th>Coef prix</th>
              <th>Coef durée</th>
              <th style={{ textAlign: 'right' }}>Montant ({refService ? refService.name.split(' ')[0] : '—'})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id}>
                <td style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', whiteSpace: 'nowrap' }}>{bandLabel(b, bands)}</td>
                <td>
                  <NumCell
                    value={b.maxLocks}
                    allowEmpty
                    width={92}
                    placeholder="∞"
                    title="Vide = sans plafond (dernière tranche) — la tranche se range après validation"
                    ariaLabel="Plafond de la tranche (locks)"
                    onCommit={(v) => patchBand(b.id, { maxLocks: v })}
                  />
                </td>
                <td>
                  <NumCell
                    value={b.coef}
                    decimal
                    width={76}
                    ariaLabel="Coefficient de prix"
                    onCommit={(v) => { if (v != null) patchBand(b.id, { coef: v }); }}
                  />
                </td>
                <td>
                  <NumCell
                    value={b.durCoef}
                    decimal
                    width={76}
                    ariaLabel="Coefficient de durée"
                    onCommit={(v) => { if (v != null) patchBand(b.id, { durCoef: v }); }}
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <NumCell
                    value={roundPrice(refPrice * b.coef)}
                    width={104}
                    ariaLabel="Montant pour la prestation témoin"
                    title="Saisissez le montant voulu — le coefficient se recalcule"
                    onCommit={(v) => setAmount(b.id, v)}
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="trf-iconbtn trf-iconbtn--danger" onClick={() => removeBand(b.id)} disabled={bands.length <= 1} title="Retirer la tranche">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JustePrix() {
  const { branch, currency } = useBranch();
  const [clients, setClients] = useClients();
  const [services] = useServices();
  const [bands] = useModelBands();

  const branchClients = useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
  const svcList = useMemo(() => services.filter((s) => !s.hidePrice).slice(0, 6), [services]);

  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [serviceId, setServiceId] = useState('');

  const client = branchClients.find((c) => c.id === clientId) ?? branchClients[0];
  const service = svcList.find((s) => s.id === serviceId) ?? svcList[0];

  /* Recherche cliente — accents/casse insensibles ; filtre téléphone seulement si
     la saisie contient des chiffres. */
  const cnorm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const cdigits = (s: string) => s.replace(/\D/g, '');
  const cq = clientQuery.trim();
  const cqn = cnorm(cq);
  const cqd = cdigits(cq);
  const shownClients = useMemo(
    () => (cq
      ? branchClients.filter((c) => cnorm(c.name).includes(cqn) || (cqd !== '' && cdigits(c.phone).includes(cqd)))
      : []),
    [branchClients, cq, cqn, cqd],
  );

  const rankOf = (c: Client) => c.segments[0] ?? 'Cliente';

  /* Prix personnalisé de la cliente sélectionnée = catalogue × coef de son modèle
     × son coefficient personnel (1 par défaut, depuis que les leviers sont retirés). */
  const preview = useMemo(() => {
    if (!client || !service) return null;
    const band = bandOf(client.lockCount, bands);
    const modelCoef = scalesWithModel(service) && band ? band.coef : 1;
    const clientCoef = client.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1;
    const modelBase = roundPrice(service.priceXof * modelCoef);
    const finalP = roundPrice(service.priceXof * modelCoef * clientCoef);
    return { band, modelCoef, clientCoef, modelBase, finalP, lockCount: client.lockCount };
  }, [client, service, bands]);

  /* Coefficient personnel — remplace les leviers : facultatif, au cas par cas. */
  const [coefDraft, setCoefDraft] = useState('');
  useEffect(() => { setCoefDraft(''); }, [clientId]);
  const currentCoef = client?.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1;
  const applyCoef = (v: number) => {
    if (!client || !(v > 0)) return;
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, priceCoef: Math.round(v * 100) / 100 } : c)));
  };

  /* Anciens coefficients hérités des leviers (≠ ×1) — à neutraliser en un geste. */
  const legacyCoefCount = branchClients.filter((c) => (c.priceCoef ?? 1) !== 1).length;
  const neutralizeAll = () => {
    if (!window.confirm(`Remettre le coefficient personnel de ${legacyCoefCount} cliente(s) à ×1 ? Le prix ne dépendra plus que du modèle (nombre de locks).`)) return;
    setClients((prev) => prev.map((c) => (c.branchId === branch.id && (c.priceCoef ?? 1) !== 1 ? { ...c, priceCoef: 1 } : c)));
  };

  if (!client || !service) {
    return (
      <div className="mnd-rise">
        <Eyebrow>Tarification par le modèle</Eyebrow>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0' }}>Le Juste Prix.</h2>
        <BaremeModeles currency={currency} />
        <div className="trf-empty" style={{ marginTop: 18 }}>Ajoutez une cliente et une prestation pour lire l’aperçu de son prix.</div>
      </div>
    );
  }

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Tarification par le modèle</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Le Juste Prix.</h2>
        </div>
      </div>

      <div className="trf-obsidian" style={{ margin: '18px 0 22px' }}>
        <div className="trf-obsidian__eyebrow">Le prix suit le modèle</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: 'var(--color-ivoire)', marginTop: 6, lineHeight: 1.4, maxWidth: 760 }}>
          Chaque couronne paie selon sa taille.{' '}
          <span style={{ color: 'var(--copper-200)' }}>Le barème par tranches de locks fixe le tarif ; vous l’éditez par coefficient ou par montant. La cliente ne voit qu’un seul nombre — juste.</span>
        </div>
      </div>

      {/* Anciens coefficients des leviers — bandeau de neutralisation. */}
      {legacyCoefCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '12px 16px', marginBottom: 18 }}>
          <span style={{ fontSize: 12.5, color: 'var(--copper-700)' }}>
            {legacyCoefCount} cliente{legacyCoefCount > 1 ? 's' : ''} porte{legacyCoefCount > 1 ? 'nt' : ''} encore un coefficient personnel (≠ ×1) hérité des anciens leviers — il modifie leur prix.
          </span>
          <button className="trf-act" onClick={neutralizeAll}>Tout remettre à ×1</button>
        </div>
      )}

      <BaremeModeles currency={currency} />

      {/* APERÇU PAR CLIENTE */}
      <div className="trf-panel" style={{ padding: '20px 22px' }}>
        <div className="trf-panel__title">Aperçu par cliente</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, margin: '6px 0 10px' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>La couronne</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{cq ? `${shownClients.length} trouvée${shownClients.length > 1 ? 's' : ''}` : `${branchClients.length} clientes`}</span>
        </div>
        <input
          className="mnd-input"
          value={clientQuery}
          onChange={(e) => setClientQuery(e.target.value)}
          placeholder="Rechercher une cliente (nom, téléphone)…"
          aria-label="Rechercher une cliente"
          style={{ width: '100%', marginBottom: 12 }}
        />
        {cq ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {shownClients.length === 0 && <div className="trf-empty" style={{ width: '100%' }}>Aucune cliente ne répond à « {cq} ».</div>}
            {shownClients.slice(0, 12).map((c) => (
              <button key={c.id} className={`trf-pick ${c.id === client.id ? 'is-active' : ''}`} style={{ flex: '1 1 30%' }} onClick={() => { setClientId(c.id); setClientQuery(''); }}>
                <div className="trf-pick__name">{c.name.split(' ')[0]}</div>
                <div className="trf-pick__sub">{rankOf(c)}{c.lockCount ? ` · ${c.lockCount} locks` : ''}</div>
              </button>
            ))}
            {shownClients.length > 12 && <div className="trf-empty" style={{ width: '100%', padding: '8px 0' }}>… {shownClients.length - 12} autres — affinez la recherche.</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button className="trf-pick is-active" style={{ flex: 'none', minWidth: 150 }} title="Cliente sélectionnée">
              <div className="trf-pick__name">{client.name.split(' ')[0]}</div>
              <div className="trf-pick__sub">{rankOf(client)}{client.lockCount ? ` · ${client.lockCount} locks` : ' · modèle à renseigner'}</div>
            </button>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>cliente en cours — cherchez un nom pour en choisir une autre.</span>
          </div>
        )}

        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 }}>La prestation</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {svcList.map((s) => (
            <button key={s.id} className={`trf-pick ${s.id === service.id ? 'is-active--sable' : ''}`} style={{ flex: '1 1 30%' }} onClick={() => setServiceId(s.id)}>
              <div className="trf-pick__name">{s.name}</div>
              <div className="trf-pick__sub">{fmtMoney(s.priceXof, currency)}</div>
            </button>
          ))}
        </div>

        {/* Le détail du prix de cette cliente pour cette prestation. */}
        {preview && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: preview.modelCoef !== 1 ? 6 : 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Catalogue</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: preview.modelCoef !== 1 ? 15 : 18, color: 'var(--ink-soft)' }}>{fmtMoney(service.priceXof, currency)}</span>
            </div>
            {preview.modelCoef !== 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-700)' }}>
                  Modèle · {preview.lockCount} locks{preview.band ? ` · ${bandLabel(preview.band, bands)} (×${preview.band.coef})` : ''}
                </span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{fmtMoney(preview.modelBase, currency)}</span>
              </div>
            )}
            {preview.clientCoef !== 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Coefficient personnel · ×{preview.clientCoef}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--hairline)', marginTop: 10, paddingTop: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Son prix · {service.name}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                  {preview.modelCoef === 1 && !scalesWithModel(service)
                    ? 'cette prestation ne suit pas le modèle'
                    : !preview.band
                      ? 'modèle non renseigné — prix catalogue'
                      : 'figé à ce montant dès la réservation'}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, lineHeight: 1, color: 'var(--trf-success)' }}>
                {fmtMoney(preview.finalP, currency)}
              </div>
            </div>
          </div>
        )}

        {/* Coefficient personnel — facultatif, remplace les sept leviers. */}
        <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              Coefficient personnel de {client.name.split(' ')[0]} · facultatif
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>actuel ×{currentCoef}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <input
              className="mnd-input"
              inputMode="decimal"
              value={coefDraft}
              placeholder={String(currentCoef)}
              onChange={(e) => setCoefDraft(e.target.value)}
              style={{ width: 90, textAlign: 'right' }}
              aria-label="Coefficient personnel"
            />
            <button
              className="trf-act"
              onClick={() => { const v = parseFloat(coefDraft.replace(',', '.')); if (v > 0) { applyCoef(v); setCoefDraft(''); } }}
              disabled={!(parseFloat(coefDraft.replace(',', '.')) > 0)}
            >
              Appliquer
            </button>
            {currentCoef !== 1 && (
              <button className="trf-act trf-act--ghost" onClick={() => { applyCoef(1); setCoefDraft(''); }}>Remettre à ×1</button>
            )}
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              une remise/majoration au cas par cas, en plus du modèle. Laissez à ×1 pour ne dépendre que du modèle.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
