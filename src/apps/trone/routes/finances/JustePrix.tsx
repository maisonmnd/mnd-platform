import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore, type Client } from '../../../../shared/clients';
import { useCategories, useServices, useProducts, catsDansLOrdre, LONGUEURS, type Service } from '../../../../shared/catalog';
import { tarifModeOf,
  useModelBands, modelBandsStore, sortedBands, bandLabel, roundPrice, bandOf, scalesWithModel,
  pricingOf, personalPriceXof, isFixedPrice, servesBand, bandForService, MODEL_BANDS_SEED, VEKPE_BANDS_SEED,
  bandSetsStore, useBandSets, regimeTarifaire, ecrisCalibresPartout, type ModelBand,
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
  const [maison] = useModelBands();
  const [sets] = useBandSets();
  const [services] = useServices();
  const [categories] = useCategories();

  /* QUEL ATELIER ON REGLE. '' = le bareme de la Maison, celui qui s'applique
     partout ou l'atelier n'a pas le sien.

     Un seul bareme pour toute la Maison ne tenait pas : une creation ne
     progresse pas comme un resserrage. De Jumbo a Nano, le SINSIN va de x0,8 a
     x2,2 ; le VEKPE de x0,53 a x3,33. Poser des locks fines coute du temps de
     facon bien plus que proportionnelle. Appliquer le bareme de GBEJI a une
     creation Nano la sous-facturerait d'un tiers. */
  const bands = maison;
  const sorted = sortedBands(bands);

  /* LES COLONNES DU TABLEAU — un bareme par atelier, cote a cote.

     Les CALIBRES sont communs a toute la Maison : c'est la colonne vertebrale
     de l'arborescence, « un seul langage de taille, de la naissance a
     l'entretien ». Seuls les COEFFICIENTS changent d'un atelier a l'autre.
     Les afficher derriere des onglets obligeait a basculer pour comparer, et a
     ressaisir les tranches autant de fois qu'il y a d'ateliers. */
  const colonnes = [
    { id: '', titre: 'La Maison', bands: maison },
    ...categories.filter((c) => sets[c.id]?.length).map((c) => ({ id: c.id, titre: c.fon, bands: sets[c.id] })),
  ];

  /* Ecrire dans le bareme d'une colonne. */
  const write = (scope: string, fn: (prev: ModelBand[]) => ModelBand[]) => {
    if (!scope) modelBandsStore.set(fn);
    else bandSetsStore.set((prev) => ({ ...prev, [scope]: fn(prev[scope] ?? MODEL_BANDS_SEED) }));
  };
  /* Une TRANCHE se definit une seule fois : ajouter, retirer ou deplacer une
     borne s'applique a TOUS les baremes — le juge partagé vit dans pricing.ts,
     les Paramètres (« Les calibres des modèles ») écrivent par lui aussi. */
  const writeToutes = ecrisCalibresPartout;
  /* Le coefficient d'une tranche DANS UNE COLONNE. La tranche peut manquer d'un
     bareme d'atelier cree avant elle : on la cree a l'identique. */
  const coefDe = (scope: string, id: string, champ: 'coef' | 'durCoef'): number => {
    const col = colonnes.find((c) => c.id === scope);
    return col?.bands.find((b) => b.id === id)?.[champ] ?? 1;
  };
  const setCoef = (scope: string, id: string, champ: 'coef' | 'durCoef', v: number) =>
    write(scope, (prev) => (prev.some((b) => b.id === id)
      ? prev.map((b) => (b.id === id ? { ...b, [champ]: v } : b))
      : [...prev, { ...(maison.find((b) => b.id === id) ?? { id, maxLocks: null, coef: 1, durCoef: 1 }), [champ]: v }]));
  const ateliers = categories.filter((c) => sets[c.id]?.length);
  const sansBareme = categories.filter((c) => !sets[c.id]?.length);
  /* Doter un atelier de son propre bareme : il part de celui qu'on regarde,
     puis diverge. Retirer le bareme d'un atelier le remet sous celui de la Maison. */
  const doter = (catId: string) => {
    if (!catId) return;
    const depart = catId === 'atl-i-vekpe' ? VEKPE_BANDS_SEED : maison;
    bandSetsStore.set((prev) => ({ ...prev, [catId]: depart.map((b) => ({ ...b })) }));
  };
  const retirer = (catId: string) => {
    const nom = categories.find((c) => c.id === catId)?.fon ?? catId;
    if (!window.confirm(`Retirer le barème propre à ${nom} ? Cet atelier suivra de nouveau celui de la Maison.`)) return;
    bandSetsStore.set((prev) => { const n = { ...prev }; delete n[catId]; return n; });
  };

  /* Prestation témoin : celle sur laquelle on lit (et saisit) les montants. Par
     défaut, la première prestation à prix fixe qui suit le modèle. */
  const modelServices = useMemo(
    () => services.filter((s) => !s.hidePrice && scalesWithModel(s)).sort((a, b) => a.priceXof - b.priceXof),
    [services],
  );
  const fallback = useMemo(() => services.filter((s) => !s.hidePrice), [services]);
  const [refId, setRefId] = useState('');
  const refService = modelServices.find((s) => s.id === refId) ?? modelServices[Math.floor(modelServices.length / 2)] ?? fallback[0];
  /* BASE DU BAREME — saisissable. La Maison cale ses coefficients sur un montant
     ROND (100 000 F), pas sur le prix d'une prestation prise au hasard dans le
     catalogue : c'est plus facile a lire et a discuter qu'un multiple de 22 000.
     Vide = on retombe sur le prix de la prestation temoin, comme avant. */
  const [refAmount, setRefAmount] = useState('');
  const saisi = parseInt(refAmount.replace(/[^0-9]/g, ''), 10);
  const refPrice = Number.isFinite(saisi) && saisi > 0 ? saisi : (refService?.priceXof ?? 25000);
  /* LE COEFFICIENT EST-IL SEULEMENT UTILISE ? Une prestation qui porte un tarif
     au lock ou des planchers par calibre tire son prix du Catalogue : le
     coefficient du bareme ne la touche pas. Le montant de la colonne reste une
     indication de bareme, pas le prix que paiera la cliente — et l'ecran doit
     le dire, sinon on edite un levier qui ne commande rien. */
  const coefUtile = !!refService
    && !refService.ratePerLock
    && !Object.keys(refService.priceFloors ?? {}).length;

  const patchBand = (id: string, p: Partial<ModelBand>) =>
    writeToutes((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const removeBand = (id: string) => {
    if (bands.length <= 1) return;
    if (!window.confirm('Retirer cette tranche du barème ?')) return;
    writeToutes((prev) => prev.filter((b) => b.id !== id));
  };
  const addBand = () => {
    const lastMax = sorted.reduce((m, b) => Math.max(m, b.maxLocks ?? 0), 0);
    writeToutes((prev) => [...prev, { id: `mb-${uid()}`, maxLocks: lastMax + 100, coef: 1, durCoef: 1 }]);
  };
  const resetBands = () => {
    if (!window.confirm('Rétablir le barème recommandé (6 tranches) ? Vos tranches actuelles seront remplacées.')) return;
    modelBandsStore.set(() => MODEL_BANDS_SEED.map((b) => ({ ...b })));
    bandSetsStore.set((prev) => (prev['atl-i-vekpe'] ? { ...prev, 'atl-i-vekpe': VEKPE_BANDS_SEED.map((b) => ({ ...b })) } : prev));
  };
  /* Saisie d'un MONTANT → coefficient = montant ÷ prix témoin (borné ≥ 0,01). */
  const setAmount = (scope: string, id: string, amount: number | null) => {
    if (amount == null || refPrice <= 0) return;
    setCoef(scope, id, 'coef', Math.max(0.01, Math.round((amount / refPrice) * 100) / 100));
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
      {/* LES BAREMES PAR ATELIER. Chaque atelier peut avoir le sien ; ceux qui
          n'en ont pas suivent la Maison. C'est la seule facon de tarifer
          honnetement deux gestes que le calibre n'affecte pas de la meme facon. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 4px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
          {colonnes.length} barème{colonnes.length > 1 ? 's' : ''} · calibres communs
        </span>
        <select
          className="mnd-select"
          value=""
          onChange={(e) => doter(e.target.value)}
          style={{ maxWidth: 260, fontSize: 12 }}
          title="Donner son propre barème à un atelier"
        >
          <option value="">+ Barème propre à un atelier…</option>
          {sansBareme.map((c) => (
            <option key={c.id} value={c.id}>{c.fon} · {c.label}</option>
          ))}
        </select>
        {ateliers.map((c) => (
          <button
            key={c.id}
            onClick={() => retirer(c.id)}
            style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--copper-600)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            retirer le barème {c.fon}
          </button>
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 14px', maxWidth: 760 }}>
        Les tranches se définissent UNE FOIS — elles valent pour tous les barèmes. Seuls les
        coefficients changent d’un atelier à l’autre : une création ne progresse pas comme un
        resserrage. Un atelier sans barème propre suit celui de la Maison.{' '}
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
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Base du bareme</span>
          <input
            className="mnd-input"
            inputMode="numeric"
            value={refAmount}
            onChange={(e) => setRefAmount(e.target.value)}
            placeholder={String(refService?.priceXof ?? 100000)}
            aria-label="Montant de base du bareme"
            style={{ width: 120, textAlign: 'right' }}
          />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)' }}>
            {saisi > 0 ? `base ${fmtMoney(refPrice, currency)}` : `catalogue ${fmtMoney(refPrice, currency)}`}
            {!coefUtile && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--copper-700)', marginTop: 5, lineHeight: 1.55, maxWidth: 420 }}>
                Cette prestation est pilotée par son <strong style={{ fontWeight: 500 }}>tarif au lock</strong> ou ses
                <strong style={{ fontWeight: 500 }}> planchers par calibre</strong>, réglés au Catalogue. Le coefficient
                ci-dessous ne change pas son prix — les montants affichés ne sont qu'une lecture du barème.
              </div>
            )}
          </span>
        </div>
      )}

      <div className="mnd-scroll-x">
        <table className="tre-table" style={{ minWidth: 620 + colonnes.length * 260 }}>
          <thead>
            <tr>
              <th>Tranche</th>
              <th>Jusqu’à (locks)</th>
              {colonnes.map((col) => (
                <th key={`h-${col.id}`} colSpan={3} style={{ textAlign: 'center', borderLeft: '1px solid var(--line)' }}>
                  {col.titre}
                </th>
              ))}
              <th />
            </tr>
            <tr>
              <th /><th />
              {colonnes.map((col) => (
                <>
                  <th
                    key={`c1-${col.id}`}
                    style={{ borderLeft: '1px solid var(--line)', opacity: coefUtile ? 1 : 0.4 }}
                    title={coefUtile ? undefined : 'Sans effet sur la prestation témoin choisie — son prix vient du Catalogue'}
                  >
                    Coef prix
                  </th>
                  <th key={`c2-${col.id}`}>Coef durée</th>
                  <th key={`c3-${col.id}`} style={{ textAlign: 'right' }}>Montant</th>
                </>
              ))}
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
                    title="Vide = sans plafond (dernière tranche). La tranche vaut pour TOUS les barèmes."
                    ariaLabel="Plafond de la tranche (locks)"
                    onCommit={(v) => patchBand(b.id, { maxLocks: v })}
                  />
                </td>
                {colonnes.map((col) => (
                  <>
                    <td key={`p-${col.id}-${b.id}`} style={{ borderLeft: '1px solid var(--line)' }}>
                      <NumCell
                        value={coefDe(col.id, b.id, 'coef')}
                        decimal
                        width={72}
                        ariaLabel={`Coefficient de prix · ${col.titre}`}
                        onCommit={(v) => { if (v != null) setCoef(col.id, b.id, 'coef', v); }}
                      />
                    </td>
                    <td key={`d-${col.id}-${b.id}`}>
                      <NumCell
                        value={coefDe(col.id, b.id, 'durCoef')}
                        decimal
                        width={72}
                        ariaLabel={`Coefficient de durée · ${col.titre}`}
                        onCommit={(v) => { if (v != null) setCoef(col.id, b.id, 'durCoef', v); }}
                      />
                    </td>
                    <td key={`m-${col.id}-${b.id}`} style={{ textAlign: 'right' }}>
                      <NumCell
                        value={roundPrice(refPrice * coefDe(col.id, b.id, 'coef'))}
                        width={104}
                        ariaLabel={`Montant · ${col.titre}`}
                        title="Saisissez le montant voulu — le coefficient se recalcule"
                        onCommit={(v) => setAmount(col.id, b.id, v)}
                      />
                    </td>
                  </>
                ))}
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
  const navigate = useNavigate();
  const [clients, setClients] = useClients();
  const [services] = useServices();
  /* Les produits de la Gamme — une composition de forfait peut en porter, et
     le moteur les compte dans le prix du forfait. */
  const [produits] = useProducts();
  const [bands] = useModelBands();

  const branchClients = useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
  /* Services témoins = les prestations qui « suivent le modèle » (leur prix change
     selon la cliente), FÍNFÍN™ Éveil exclu. Ce sont elles qu'on montre dans
     l'aperçu, avec le prix propre à la cliente. À défaut (aucune ne suit le
     modèle), on retombe sur les premières prestations à prix affiché. */
  const temoins = useMemo(() => {
    const t = services.filter((s) => !s.hidePrice && scalesWithModel(s));
    return (t.length ? t : services.filter((s) => !s.hidePrice && !isFixedPrice(s))).slice(0, 8);
  }, [services]);

  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [serviceId, setServiceId] = useState('');

  const client = branchClients.find((c) => c.id === clientId) ?? branchClients[0];
  const service = temoins.find((s) => s.id === serviceId) ?? temoins[0];

  /* Contexte tarifaire de la cliente — sert à afficher le prix témoin de CHAQUE
     prestation pour elle (les montants de la liste se modifient selon la cliente). */
  const [sets] = useBandSets();
  const [categories] = useCategories();
  const pricing = useMemo(() => pricingOf(client, bands, sets, categories), [client, bands, sets, categories]);

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
    /* La tranche de SON atelier — pas celle de la Maison : une création ne
       progresse pas comme un resserrage. */
    const band = bandForService(service, pricing);
    /* HORS CALIBRE — une création liée à un calibre ne concerne pas cette
       cliente. Appliquer le coefficient Mini au prix du Jumbo donnait
       « 80 000 × 1,4 = 112 000 F » : un prix qui ne correspond à rien, pour une
       prestation qu'on ne peut de toute façon pas lui vendre. */
    const sert = servesBand(service, band);
    const modelCoef = sert && scalesWithModel(service) && band ? band.coef : 1;
    const clientCoef = client.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1;
    /* Le VRAI prix passe par le moteur — tarif au lock, plancher du calibre,
       Juste Prix personnel — au lieu d'être recalculé ici de façon divergente. */
    const finalP = sert ? personalPriceXof(service, pricing) : service.priceXof;
    const modelBase = sert ? roundPrice(finalP / clientCoef) : service.priceXof;
    /* CE QUI PILOTE REELLEMENT LE PRIX. L'ecran annoncait « (×2,5) » sur une
       prestation dont le prix vient de son plancher : 20 000 × 2,5 ne fait pas
       55 000, et la ligne justifiait le bon montant par le mauvais mecanisme.
       Pour toute prestation portant un tarif au lock ou des planchers, le
       coefficient du bareme est inerte — c'est le Catalogue qui commande. */
    const mode = tarifModeOf(service);
    const auLockBrut = service.ratePerLock && client.lockCount ? client.lockCount * service.ratePerLock : undefined;
    const plancher = band ? service.priceFloors?.[band.id] : undefined;
    const pilote: 'coef' | 'lock' | 'plancher' =
      !sert || (!auLockBrut && plancher === undefined) ? 'coef'
        : mode === 'calibre' && plancher !== undefined ? 'plancher'
          : plancher !== undefined && (auLockBrut ?? 0) < plancher && mode !== 'lock' ? 'plancher'
            : 'lock';
    return { band, modelCoef, clientCoef, modelBase, finalP, sert, lockCount: client.lockCount,
             pilote, auLockBrut, plancher };
  }, [client, service, pricing]);

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

      {/* LES SYSTÈMES DE PRIX — L'ENDROIT UNIQUE (13 août, demande de Yéman :
          « un endroit dans mon ERP où je gère chaque système de prix »).
          Chaque prestation obéit à UN modèle (choisi sur sa fiche, au
          Catalogue) ; d'ici, chaque système s'ouvre au Catalogue déjà
          regroupé sur ses prestations. */}
      <div className="trf-panel" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div className="trf-panel__title">Les systèmes de prix</div>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {([
            { k: 'modele' as const, t: 'Barème du modèle', d: 'prix de base × coef de la tranche — le barème ci-dessus' },
            { k: 'lock' as const, t: 'Comptage des locks', d: 'locks comptés × tarif' },
            { k: 'calibre' as const, t: 'Prix par calibre', d: 'le prix de la tranche est le prix' },
            { k: 'longueur' as const, t: 'Grille par longueur', d: 'trois prix saisis — court, mi-long, long' },
            { k: 'hors' as const, t: 'Hors Juste Prix', d: 'prix fermes et devis — le coefficient ne les touche pas' },
          ]).map((row) => {
            const n = row.k === 'hors'
              ? services.filter((s) => !regimeTarifaire(s, categories).justePrix).length
              : services.filter((s) => regimeTarifaire(s, categories).k === row.k).length;
            return (
              <div key={row.k} style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--hairline)', paddingBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-indigo)', minWidth: 170 }}>{row.t}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: n ? 'var(--copper-700)' : 'var(--ink-soft)', flex: 'none' }}>{n}</span>
                <span className="mnd-muted" style={{ fontSize: 11.5, flex: '1 1 220px' }}>{row.d}</span>
                <button className="trf-act trf-act--ghost" onClick={() => navigate(`/catalogue?regime=${row.k}`)}>
                  Gérer au Catalogue →
                </button>
              </div>
            );
          })}
        </div>
      </div>

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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Services témoins</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
            prix pour {client.name.split(' ')[0]}
            {pricing.band ? ` · ${client.lockCount} locks` : ' · modèle à renseigner'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {/* SEULEMENT CE QUI LA CONCERNE. Les créations d'un autre calibre ne sont
              pas « moins pertinentes » : elles n'existent pas pour elle. Les
              afficher grisées entretenait la confusion — on lisait six prix pour
              une cliente qui n'en a qu'un. */}
          {temoins.filter((s) => servesBand(s, bandForService(s, pricing))).map((s) => {
            const pp = personalPriceXof(s, pricing);
            const changed = pp !== s.priceXof;
            /* HORS CALIBRE — une création liée à un calibre ne concerne pas cette
               cliente : un VÈKPÈ™ Jumbo, c'est 50 à 100 locks, au-delà il n'existe
               pas. La griser dit la vérité ; l'afficher comme les autres laissait
               croire qu'on pouvait la lui vendre. */
            const sert = servesBand(s, bandForService(s, pricing));
            return (
              <button
                key={s.id}
                className={`trf-pick ${s.id === service.id ? 'is-active--sable' : ''}`}
                style={{ flex: '1 1 30%', opacity: sert ? 1 : 0.42 }}
                onClick={() => setServiceId(s.id)}
                title={sert ? undefined : `Hors du calibre de ${client?.name ?? 'la cliente'} — cette création ne la concerne pas`}
              >
                <div className="trf-pick__name">{s.name}</div>
                <div className="trf-pick__sub">
                  {sert ? (
                    <>
                      <span style={{ color: changed ? 'var(--color-indigo)' : undefined, fontWeight: changed ? 600 : undefined }}>{fmtMoney(pp, currency)}</span>
                      {changed && <span style={{ marginLeft: 6, textDecoration: 'line-through', opacity: 0.55 }}>{fmtMoney(s.priceXof, currency)}</span>}
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>hors calibre</span>
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>{fmtMoney(s.priceXof, currency)}</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Le détail du prix de cette cliente pour cette prestation. */}
        {preview && (
          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: preview.modelCoef !== 1 ? 6 : 0 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Catalogue</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: preview.modelCoef !== 1 ? 15 : 18, color: 'var(--ink-soft)' }}>{fmtMoney(service.priceXof, currency)}</span>
            </div>
            {!preview.sert && (
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-600)', margin: '2px 0 8px', lineHeight: 1.5 }}>
                Hors calibre — {client?.name} porte {preview.lockCount} locks, cette création n’existe pas pour elle.
                Son prix reste celui du catalogue.
              </div>
            )}
            <div style={{ display: 'none' }}>
            </div>
            {(preview.modelCoef !== 1 || preview.pilote !== 'coef') && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-700)' }}>
                    Modèle · {preview.lockCount} locks{preview.band ? ` · ${bandLabel(preview.band, bands)}` : ''}
                    {preview.pilote === 'coef' && preview.band ? ` (×${preview.band.coef})` : ''}
                  </span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{fmtMoney(preview.modelBase, currency)}</span>
                </div>
                {preview.pilote !== 'coef' && (
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.6 }}>
                    {preview.auLockBrut !== undefined && (
                      <div>
                        au lock · {preview.lockCount} × {fmtMoney(service?.ratePerLock ?? 0, currency)} = {fmtMoney(preview.auLockBrut, currency)}
                        {preview.pilote === 'lock' ? ' — retenu' : ''}
                      </div>
                    )}
                    {preview.plancher !== undefined && (
                      <div>
                        plancher {preview.band ? bandLabel(preview.band, bands) : ''} = {fmtMoney(preview.plancher, currency)}
                        {preview.pilote === 'plancher' ? ' — retenu' : ''}
                      </div>
                    )}
                    <div style={{ marginTop: 3 }}>
                      Ce prix vient du Catalogue, pas du coefficient du barème.
                    </div>
                  </div>
                )}
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

        {/* ═══ TOUS SES JUSTE PRIX — LE MIROIR COMPLET (13 août). La question
            de Yéman : « comment voir tous les 79, et comment ils changent quand
            je change une variable ? » Réponse : ils sont TOUS ici, rangés par
            atelier, calculés par LE moteur (`personalPriceXof`) pour la cliente
            choisie — et ils se recalculent à CHAQUE geste : ses locks et sa
            longueur (ci-dessous, écrits sur sa fiche), son coefficient
            personnel (au-dessus), le barème des modèles (plus haut). Quand le
            prix diffère du catalogue, le catalogue reste lisible, barré. */}
        {(() => {
          /* LES SERVICES À PART, LES FORFAITS À PART (13 août — « trop d'infos,
             pas assez de structure ») : mêler un abonnement composé de 730 000 F
             aux soins de 15 000 F rendait la liste illisible. Et UNE seule
             encre par ligne : le prix d'elle, en indigo quand il est
             personnalisé — le catalogue barré partout doublait chaque nombre. */
          const jp = services.filter((s) => regimeTarifaire(s, categories).justePrix);
          const jpPresta = jp.filter((s) => !s.includes?.length);
          const jpForfaits = jp.filter((s) => !!s.includes?.length);
          const groupes = catsDansLOrdre(categories)
            .map((c) => ({ cat: c, list: jpPresta.filter((s) => s.categoryId === c.id).sort((a, b) => a.order - b.order) }))
            .filter((g) => g.list.length > 0);
          const orphelins = jpPresta.filter((s) => !categories.some((c) => c.id === s.categoryId));
          const prenom = client.name.split(' ')[0];
          /* LE CODE COULEUR (13 août, demande de Yéman) : INDIGO = le Juste
             Prix a modulé ce montant pour elle ; CUIVRE = le prix vient d'une
             GRILLE PAR LONGUEUR (il varie par la longueur, pas par le
             coefficient) ; GRIS = inchangé — le Juste Prix ne joue pas ici.
             La légende sous les variables dit la même chose en un mot. */
          const Ligne = ({ s }: { s: Service }) => {
            const sien = personalPriceXof(s, pricing, services, produits);
            const sert = servesBand(s, bandForService(s, pricing));
            const parLongueur = regimeTarifaire(s, categories).k === 'longueur';
            const bouge = sert && sien !== s.priceXof;
            const couleur = parLongueur ? 'var(--copper-700)' : bouge ? 'var(--color-indigo)' : 'var(--ink-soft)';
            const explique = parLongueur
              ? `Grille par longueur${bouge ? ` — catalogue : ${fmtMoney(s.priceXof, currency)}` : ''}`
              : bouge ? `Modulé par le Juste Prix — catalogue : ${fmtMoney(s.priceXof, currency)}` : undefined;
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 12.5, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                  {!sert ? (
                    <span className="mnd-muted" title={`Hors du calibre de ${prenom} — cette création ne la concerne pas`} style={{ fontSize: 11 }}>
                      hors calibre
                    </span>
                  ) : (
                    <b style={{ fontWeight: parLongueur || bouge ? 600 : 400, color: couleur }} title={explique}>
                      {fmtMoney(sien, currency)}
                    </b>
                  )}
                </span>
              </div>
            );
          };
          return (
            <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  Tous ses Juste Prix · {jp.length}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                  les prix de {prenom} — ils bougent à chaque variable touchée
                </span>
              </div>

              {/* SES VARIABLES, à portée de main : locks et longueur s'écrivent
                  sur SA fiche — les mêmes valeurs que le comptoir et Ma
                  Couronne lisent. Rien n'est une simulation jetable. */}
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Ses locks</span>
                  <NumCell
                    value={client.lockCount ?? null}
                    allowEmpty
                    width={86}
                    placeholder="à compter"
                    ariaLabel="Nombre de locks de la cliente"
                    title="Écrit sur sa fiche — le comptoir et Ma Couronne lisent la même valeur"
                    onCommit={(v) => setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, lockCount: v ?? undefined } : c)))}
                  />
                </label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Sa longueur</span>
                  {LONGUEURS.map((l) => {
                    const on = client.longueur === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        className="trf-act"
                        style={on ? { background: 'var(--color-copper)', borderColor: 'var(--color-copper)', color: 'var(--color-ivoire)' } : undefined}
                        title={on ? 'Retirer la longueur de sa fiche' : 'Écrire cette longueur sur sa fiche (point de départ — chaque RDV fige la sienne)'}
                        onClick={() => setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, longueur: on ? undefined : l.id } : c)))}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </span>
              </div>

              {/* La légende des encres — un mot par couleur, pas plus. */}
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, marginTop: 6, color: 'var(--ink-soft)' }}>
                <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>● indigo</b> modulé par le Juste Prix
                {' · '}
                <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>● cuivre</b> grille par longueur
                {' · '}
                <span>● gris — inchangé, le Juste Prix ne joue pas</span>
              </div>

              {/* ── LES PRESTATIONS, par atelier ── */}
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', borderBottom: '2px solid var(--copper-300)', paddingBottom: 6, marginTop: 16 }}>
                Prestations · {jpPresta.length}
              </div>
              {[...groupes, ...(orphelins.length ? [{ cat: { id: '__orphelins__', fon: 'À RECLASSER', label: 'sans catégorie' }, list: orphelins }] : [])].map((g) => (
                <div key={g.cat.id} style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', borderBottom: '1px solid var(--hairline)', paddingBottom: 4 }}>
                    {g.cat.fon} <span style={{ textTransform: 'none', letterSpacing: 0 }}>· {g.list.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '5px 22px', marginTop: 7 }}>
                    {g.list.map((s) => <Ligne key={s.id} s={s} />)}
                  </div>
                </div>
              ))}

              {/* ── LES FORFAITS & ABONNEMENTS, à part — leur prix est une
                  composition, il ne se lit pas à côté d'un soin. ── */}
              {jpForfaits.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)', borderBottom: '2px solid var(--copper-300)', paddingBottom: 6, marginTop: 22 }}>
                    Forfaits &amp; abonnements · {jpForfaits.length}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '5px 22px', marginTop: 8 }}>
                    {jpForfaits.map((s) => <Ligne key={s.id} s={s} />)}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
