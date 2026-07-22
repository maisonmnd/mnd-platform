import { useEffect, useMemo, useRef, useState } from 'react';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, type Client } from '../../../../shared/clients';
import { useServices, type Service } from '../../../../shared/catalog';
import { useModelBands, modelBandsStore, sortedBands, bandLabel, roundPrice, pricingOf, scalesWithModel, MODEL_BANDS_SEED } from '../../../../shared/pricing';
import { uid } from '../../../../shared/store';
import './finances.css';

/* Le Juste Prix — tarification souveraine. Sept leviers lisent les signaux d'une
   couronne ; l'intelligence recommande, l'humain décide. La cliente ne voit qu'un
   seul nombre — juste. Coefficient calculé, jamais affiché comme un « tarif spécial ».
   « L'intelligence guide, l'humain décide. » */

type LeverKey = 'palier' | 'densite' | 'regularite' | 'lignee' | 'ltv' | 'deplacement' | 'agenda';

const LEVERS: { k: LeverKey; name: string; reads: string; swing: number }[] = [
  { k: 'palier', name: 'Palier de fidélité', reads: 'Rang dans le Cercle · ancienneté de la couronne', swing: 0.12 },
  { k: 'densite', name: 'Densité & prestation', reads: 'Effort réel · temps fauteuil + matière consommée', swing: 0.1 },
  { k: 'regularite', name: 'Régularité de cadence', reads: 'Rendez-vous tenus · respect du rituel', swing: 0.06 },
  { k: 'lignee', name: 'Lignée & parrainage', reads: 'Têtes amenées · marraine active', swing: 0.08 },
  { k: 'ltv', name: 'Valeur à vie', reads: 'Dépense cumulée · potentiel de la couronne', swing: 0.06 },
  { k: 'deplacement', name: 'Déplacement', reads: 'Distance parcourue pour venir au fauteuil', swing: 0.05 },
  { k: 'agenda', name: 'Tension d’agenda', reads: 'Demande du créneau · rareté à cet instant', swing: 0.07 },
];

const DEFAULT_WEIGHTS: Record<LeverKey, number> = {
  palier: 80, densite: 70, regularite: 60, lignee: 65, ltv: 50, deplacement: 40, agenda: 55,
};

const INTEL_ACTS = [
  'Lit sept signaux par couronne, en continu — sans qu’on le lui demande.',
  'Maintient un plancher et un plafond : aucune cliente ne ressent d’injustice.',
  'Recommande les poids ; vous gardez la main sur chaque commande.',
  'Arrondit toujours au palier de 500 F — jamais un prix qui sonne faux.',
  'N’écrit jamais le calcul là où une cliente pourrait le lire.',
];

const FLOOR = 0.82;
const CEIL = 1.26;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** Lecture des signaux d'une couronne à partir de ses données réelles — chacun dans [-1, 1]. */
function signalsFor(c: Client, sv: Service, homeCity: string): Record<LeverKey, number> {
  const seg = c.segments;
  const has = (x: string) => seg.includes(x);
  const palierBySvc = sv.palier === 'Souveraineté' ? 0.8 : sv.palier === 'Élévation' ? 0.3 : -0.4;
  return {
    palier: clamp((c.priceCoef - 1) / 0.2, -1, 1),
    densite: palierBySvc,
    regularite: clamp((c.loyaltyPoints - 600) / 900, -1, 1),
    lignee: clamp((c.diaspora ? 0.5 : 0) + (has('Cercle') || has('Famille') ? 0.5 : 0) - (has('Nouvelle') ? 0.7 : 0), -1, 1),
    ltv: clamp((c.loyaltyPoints - 700) / 800, -1, 1),
    deplacement: c.city !== homeCity ? (c.diaspora ? 0.9 : 0.5) : -0.2,
    agenda: (hash(c.id + sv.id) % 100) / 50 - 1,
  };
}

export default function JustePrix() {
  const { branch, currency } = useBranch();
  const [clients, setClients] = useClients();
  const [services] = useServices();

  const [bands] = useModelBands();
  const branchClients = useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
  const svcList = useMemo(() => services.filter((s) => !s.hidePrice).slice(0, 5), [services]);

  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [weights, setWeights] = useState<Record<LeverKey, number>>(DEFAULT_WEIGHTS);
  const [latitude, setLatitude] = useState(100);
  const [intel, setIntel] = useState(true);

  const client = branchClients.find((c) => c.id === clientId) ?? branchClients[0];
  const service = svcList.find((s) => s.id === serviceId) ?? svcList[0];

  /* Recherche cliente — accents/casse insensibles ; le filtre téléphone ne
     s'applique QUE si la saisie contient des chiffres (sinon `''.includes('')`
     serait vrai pour toutes et le filtre par nom ne servirait à rien). */
  const cnorm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const cdigits = (s: string) => s.replace(/\D/g, '');
  const cq = clientQuery.trim();
  const cqn = cnorm(cq);
  const cqd = cdigits(cq);
  const shownClients = useMemo(
    () => (cq
      ? branchClients.filter((c) => cnorm(c.name).includes(cqn) || (cqd !== '' && cdigits(c.phone).includes(cqd)))
      : branchClients),
    [branchClients, cq, cqn, cqd],
  );

  const engine = useMemo(() => {
    if (!client || !service) return null;
    /* Le moteur part du PRIX DU MODÈLE — catalogue × coef de la tranche de locks
       (si la prestation suit le modèle) — PUIS les leviers l'ajustent. Sans ce
       socle, l'écran affichait le tarif catalogue et ignorait le modèle : Kèmi à
       331 locks apparaissait à 23 000 F au lieu de son vrai tarif. */
    const pr = pricingOf(client, bands);
    const modelCoef = scalesWithModel(service) && pr.band ? pr.band.coef : 1;
    const modelBase = service.priceXof * modelCoef; // prix pour SON modèle, avant leviers
    const lat = latitude / 100;
    const signals = signalsFor(client, service, branch.city);
    const contribs = LEVERS.map((lv) => {
      const frac = (weights[lv.k] / 100) * lv.swing * signals[lv.k] * lat;
      return { k: lv.k, name: lv.name, reads: lv.reads, frac, deltaF: modelBase * frac, weight: weights[lv.k] };
    });
    let mult = 1 + contribs.reduce((a, x) => a + x.frac, 0);
    const clamped = mult < FLOOR || mult > CEIL;
    mult = clamp(mult, FLOOR, CEIL);
    /* Prix final = SON prix : modèle × leviers, arrondi au 500 F. Identique au
       prix figé à la réservation (personalPriceXof) — l'écran ne ment plus. */
    const finalP = roundPrice(modelBase * mult);
    const maxAbs = Math.max(...contribs.map((x) => Math.abs(x.deltaF)), 1);
    const modelBaseShown = modelCoef !== 1 ? roundPrice(modelBase) : service.priceXof;
    return {
      contribs, mult, clamped, finalP, maxAbs,
      modelCoef, modelBase: modelBaseShown, band: pr.band, lockCount: client.lockCount,
      floor: roundPrice(modelBase * FLOOR), ceil: roundPrice(modelBase * CEIL),
    };
  }, [client, service, weights, latitude, branch.city, bands]);

  const rankOf = (c: Client) => c.segments[0] ?? 'Cliente';
  const fmtSigned = (v: number) => `${v >= 0 ? '+' : '−'} ${fmtMoney(Math.round(Math.abs(v) / 100) * 100, currency)}`;
  const deltaCol = (v: number) => (v > 30 ? 'var(--trf-success)' : v < -30 ? 'var(--trf-error)' : 'var(--ink-soft)');

  const applyCoef = () => {
    if (!client || !engine) return;
    const coef = Math.round(engine.mult * 100) / 100;
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, priceCoef: coef } : c)));
  };

  if (!client || !service || !engine) {
    return (
      <div className="mnd-rise">
        <Eyebrow>Tarification souveraine · la main invisible</Eyebrow>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0' }}>Le Juste Prix.</h2>
        <div className="trf-empty" style={{ marginTop: 18 }}>Aucune couronne rattachée à cette branche — le moteur attend une cliente et une prestation.</div>
      </div>
    );
  }

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Tarification souveraine · la main invisible</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Le Juste Prix.</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>L’intelligence</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: intel ? 'var(--trf-success)' : 'var(--ink-soft)', marginTop: 1 }}>{intel ? 'Active' : 'En veille'}</div>
          </div>
          <button className="trf-switch" onClick={() => setIntel((v) => !v)} style={{ background: intel ? 'var(--trf-success)' : 'var(--hairline)' }} aria-label="Basculer l’intelligence">
            <span style={{ left: intel ? 31 : 3 }} />
          </button>
        </div>
      </div>

      <div className="trf-obsidian" style={{ margin: '18px 0 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div>
          <div className="trf-obsidian__eyebrow">Vous êtes à la barre</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: 'var(--color-ivoire)', marginTop: 6, lineHeight: 1.4, maxWidth: 720 }}>
            Aucune couronne ne se ressemble — aucun prix ne le devrait.{' '}
            <span style={{ color: 'var(--copper-200)' }}>Vos commandes fixent la règle ; l’intelligence l’applique en silence. La cliente ne voit qu’un seul nombre — juste.</span>
          </div>
        </div>
      </div>

      {/* ===== BARÈME DES MODÈLES — tranches de locks → coefficient de prix & de durée ===== */}
      <BaremeModeles currency={currency} />

      <div className="trf-jp-grid">
        {/* LES COMMANDES */}
        <div className="trf-panel" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="trf-panel__title" style={{ marginBottom: 0 }}>Les commandes · vos sept leviers</div>
            <button
              onClick={() => { setWeights(DEFAULT_WEIGHTS); setLatitude(100); }}
              style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--copper-600)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              rétablir la recommandation
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
            Chaque levier dit combien un signal de la couronne pèse sur le prix. Tournez-les ; l’intelligence a déjà posé sa recommandation.
          </div>

          {engine.contribs.map((x) => (
            <div className="trf-lever" key={x.k}>
              <div className="trf-lever__head">
                <div>
                  <div className="trf-lever__name">{x.name}</div>
                  <div className="trf-lever__reads">{x.reads}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="trf-lever__delta" style={{ color: intel ? deltaCol(x.deltaF) : 'var(--ink-soft)' }}>{intel ? fmtSigned(x.deltaF) : '—'}</div>
                  <div className="trf-lever__weight">poids {x.weight}</div>
                </div>
              </div>
              <input
                className="trf-range" type="range" min={0} max={100} step={5} value={x.weight}
                onChange={(e) => setWeights((w) => ({ ...w, [x.k]: +e.target.value }))}
              />
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 6, paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)', marginBottom: 6 }}>
              <span>Latitude · l’amplitude que vous autorisez</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--copper-600)' }}>{latitude} %</span>
            </div>
            <input className="trf-range trf-range--indigo" type="range" min={0} max={100} step={5} value={latitude} onChange={(e) => setLatitude(+e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <div className="trf-guard">
              <div className="l">Plancher · garde-fou</div>
              <div className="v">{fmtMoney(engine.floor, currency)}</div>
            </div>
            <div className="trf-guard">
              <div className="l">Plafond · garde-fou</div>
              <div className="v">{fmtMoney(engine.ceil, currency)}</div>
            </div>
          </div>
        </div>

        {/* LA DÉMONSTRATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="trf-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>La couronne</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                {cq ? `${shownClients.length} / ${branchClients.length}` : `${branchClients.length}`} cliente{branchClients.length > 1 ? 's' : ''}
              </span>
            </div>
            <input
              className="mnd-input"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Rechercher une cliente (nom, téléphone)…"
              aria-label="Rechercher une cliente"
              style={{ width: '100%', marginBottom: 12 }}
            />
            {/* Hors recherche, on ne DÉROULE PAS les 181 clientes : on montre juste
                la cliente sélectionnée. Les cartes n'apparaissent qu'en tapant. */}
            {cq ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {shownClients.length === 0 && (
                  <div className="trf-empty" style={{ width: '100%' }}>Aucune cliente ne répond à « {cq} ».</div>
                )}
                {shownClients.slice(0, 12).map((c) => {
                  const on = c.id === client.id;
                  return (
                    <button key={c.id} className={`trf-pick ${on ? 'is-active' : ''}`} style={{ flex: '1 1 30%' }} onClick={() => { setClientId(c.id); setClientQuery(''); }}>
                      <div className="trf-pick__name">{c.name.split(' ')[0]}</div>
                      <div className="trf-pick__sub">{rankOf(c)}</div>
                    </button>
                  );
                })}
                {shownClients.length > 12 && (
                  <div className="trf-empty" style={{ width: '100%', padding: '8px 0' }}>… {shownClients.length - 12} autres — affinez la recherche.</div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button className="trf-pick is-active" style={{ flex: 'none', minWidth: 150 }} title="Cliente sélectionnée">
                  <div className="trf-pick__name">{client.name.split(' ')[0]}</div>
                  <div className="trf-pick__sub">{rankOf(client)}{client.lockCount ? ` · ${client.lockCount} locks` : ''}</div>
                </button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                  cliente en cours — cherchez un nom ci-dessus pour en choisir une autre.
                </span>
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 }}>La prestation</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {svcList.map((s) => {
                const on = s.id === service.id;
                return (
                  <button key={s.id} className={`trf-pick ${on ? 'is-active--sable' : ''}`} style={{ flex: '1 1 30%' }} onClick={() => setServiceId(s.id)}>
                    <div className="trf-pick__name">{s.name}</div>
                    <div className="trf-pick__sub">{fmtMoney(s.priceXof, currency)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CE QUE VOUS VOYEZ */}
          <div className="trf-panel" style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Ce que vous voyez</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>le moteur, à nu</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: engine.modelCoef !== 1 ? 6 : 12, borderBottom: engine.modelCoef !== 1 ? 'none' : '1px solid var(--hairline)', marginBottom: engine.modelCoef !== 1 ? 0 : 4 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>Catalogue</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: engine.modelCoef !== 1 ? 16 : 20, color: engine.modelCoef !== 1 ? 'var(--ink-soft)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{fmtMoney(service.priceXof, currency)}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginLeft: 'auto' }}>{service.name}</span>
            </div>
            {/* Le socle réel : le prix du MODÈLE (tranche de locks). Sans modèle
                connu ou prestation hors périmètre, il est égal au catalogue. */}
            {engine.modelCoef !== 1 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderBottom: '1px solid var(--hairline)', paddingBottom: 12, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-700)' }}>Base modèle</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 20, color: 'var(--color-indigo)', whiteSpace: 'nowrap' }}>{fmtMoney(engine.modelBase, currency)}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--copper-700)', marginLeft: 'auto' }}>
                  {engine.lockCount} locks{engine.band ? ` · ${bandLabel(engine.band, bands)} (×${engine.band.coef})` : ''}
                </span>
              </div>
            )}
            {intel && engine.contribs.map((x) => {
              const w = (Math.abs(x.deltaF) / engine.maxAbs) * 48;
              return (
                <div className="trf-breakrow" key={x.k}>
                  <span className="trf-breakrow__name">{x.name}</span>
                  <div className="trf-breakrow__track">
                    <span className="trf-breakrow__zero" />
                    <span className="trf-breakrow__bar" style={{ left: x.deltaF >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 1)}%`, background: deltaCol(x.deltaF) }} />
                  </div>
                  <span className="trf-breakrow__delta" style={{ color: deltaCol(x.deltaF) }}>{fmtSigned(x.deltaF)}</span>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--hairline)', marginTop: 10, paddingTop: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  Juste prix calculé · ×{engine.mult.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: engine.clamped && intel ? 'var(--trf-warning)' : 'var(--ink-soft)', marginTop: 3 }}>
                  {!intel ? 'personnalisation suspendue' : engine.clamped ? 'garde-fou appliqué — borné au plancher/plafond' : 'dans les bornes · ressenti juste'}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, lineHeight: 1, color: 'var(--trf-success)' }}>
                {/* Intelligence en veille → le prix de son MODÈLE (pas le catalogue) :
                    le barème par tranches s'applique toujours à la réservation. */}
                {fmtMoney(intel ? engine.finalP : engine.modelBase, currency)}
              </div>
            </div>
            <button className="trf-act" style={{ width: '100%', marginTop: 14, padding: 11 }} onClick={applyCoef} disabled={!intel}>
              Appliquer ce coefficient à la fiche de {client.name.split(' ')[0]}
            </button>
          </div>

          {/* CE QU'ELLE VOIT */}
          <div className={`trf-mirror ${intel ? '' : 'trf-mirror--off'}`}>
            <div className="trf-mirror__eyebrow">Ce qu’elle voit · {client.name.split(' ')[0]}</div>
            {intel ? (
              <>
                <div className="trf-mirror__line">{client.name.split(' ')[0]}, voici le tarif de ta prestation —</div>
                <div className="trf-mirror__price">{fmtMoney(engine.finalP, currency)}</div>
                <div className="trf-mirror__foot">Pas de calcul. Pas de « tarif spécial ». <span style={{ color: 'var(--copper-200)' }}>Un prix, présenté comme une évidence.</span></div>
              </>
            ) : (
              <>
                <div className="trf-mirror__price" style={{ marginTop: 14 }}>{fmtMoney(engine.modelBase, currency)}</div>
                <div className="trf-mirror__foot">
                  {engine.modelCoef !== 1
                    ? <>Intelligence en veille — <span style={{ color: 'var(--copper-200)' }}>tarif de son modèle ({engine.lockCount} locks)</span>, sans ajustement personnel.</>
                    : 'Intelligence en veille — chaque couronne paie le même prix.'}
                </div>
              </>
            )}
          </div>

          {/* LA MAIN INVISIBLE */}
          <div className="trf-hand">
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--copper-600)', marginBottom: 12 }}>
              L’intelligence, en arrière-plan
            </div>
            {INTEL_ACTS.map((a) => (
              <div className="trf-hand__row" key={a}>
                <span className="dot">·</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Cellule numérique à VALIDATION AU BLUR — le tableau se trie sur la valeur
   ENREGISTRÉE : enregistrer à chaque frappe re-triait les lignes en pleine
   saisie (taper « 250 » commence par « 2 », la tranche sautait en tête du
   tableau et la suite de la frappe atterrissait dans une autre case). Ici le
   brouillon reste local tant que la case a le focus ; Entrée ou sortie de case
   enregistre, Échap annule, une saisie invalide revient à l'enregistré. */
function NumCell({
  value, onCommit, allowEmpty, decimal, width, placeholder, title, ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  allowEmpty?: boolean; // vide autorisé (∞ — dernière tranche)
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
  /* Une modification venue d'ailleurs (synchro, reset) rafraîchit la case — mais
     jamais pendant que l'on y tape. */
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

/* ===== Barème des modèles — l'intelligence des prix par nombre de locks =====
   Une tranche de locks → un coefficient de PRIX et un coefficient de DURÉE.
   prix personnalisé = catalogue × coef du modèle × Juste Prix de la cliente,
   figé sur le RDV dès la réservation. Le barème est synchronisé (mnd_model_bands)
   et lu par Ma Couronne pour montrer à chaque cliente SON prix. */
function BaremeModeles({ currency }: { currency: string }) {
  const [bands] = useModelBands();
  const sorted = sortedBands(bands);
  const example = 25000; // prestation-témoin pour lire l'effet du barème

  const patchBand = (id: string, p: Partial<(typeof bands)[number]>) =>
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
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 14px', maxWidth: 720 }}>
        Le modèle de la cliente (son nombre de locks, sur sa fiche) choisit sa tranche : le prix ET la durée des
        prestations qui « suivent le modèle » (interrupteur ◈ au Catalogue) sont multipliés par ses coefficients,
        puis par son Juste Prix. La colonne témoin montre l’effet sur une prestation à {fmtMoney(example, currency)}.
      </div>

      <div className="mnd-scroll-x">
        <table className="tre-table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Tranche</th>
              <th>Jusqu’à (locks)</th>
              <th>Coef prix</th>
              <th>Coef durée</th>
              <th style={{ textAlign: 'right' }}>Témoin {fmtMoney(example, currency)}</th>
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
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--copper-700)', whiteSpace: 'nowrap' }}>
                  {fmtMoney(roundPrice(example * b.coef), currency)}
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
