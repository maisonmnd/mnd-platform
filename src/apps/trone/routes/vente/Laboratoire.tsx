import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { invoicesStore, nextInvoiceNumber, useInvoices, type Invoice } from '../../../../shared/finance';
import {
  creerProduitStock, litQuantite, stocksParProduit, useMouvementsStock, useProduitsStock,
} from '../../../../shared/stock';
import {
  PREPARATION_NOMS, annulerFabrication, composerPreparation, coutPreparationXof,
  delierIngredient, fabriquerPreparation, fichePourIngredient, lierIngredient,
  manquesPourFabrication, poserFacture, remettrePreparation, stockReelDuLab,
  supprimerPreparation, usePreparationsLab, type Preparation,
} from '../../../../shared/laboratoire';
import { uid } from '../../../../shared/store';
import { ingredientsDesFormules, parCollection, useFormulesLab, type FormuleLab } from '../../../../shared/formules';
import { ClientPicker, frDay, todayISO, useBranchClients } from '../clients/_shared';
import {
  LAB_CONCERNS, PERF_SEED, REINVENT_SEED,
  buildFormulaView, buildMatches, composeFromStock, labPantry, isAvail,
  type Sub, type StockMap,
} from './lab';
import './vente.css';

/* Le Laboratoire — le formulateur maître, BRANCHÉ AU RÉEL.

   Avant : la réserve était une liste de bascules à la main — même pas
   persistée, un rechargement effaçait tout — et les boutons du bas ne
   faisaient rien. Désormais :

   · chaque ingrédient se LIE à une fiche d'inventaire (Stock & Achats) ; la
     disponibilité est le stock dérivé, plus une opinion ;
   · la composition part d'une CLIENTE et de son besoin, avec des quantités ;
   · FABRIQUER CONSOMME le stock au journal (type `fabrication`,
     référence `prep:<id>`) — rembobinable, comme les rituels ;
   · la préparation se REMET (offerte) ou se FACTURE à son nom — les deux
     existent au salon, l'argent rejoint alors les circuits communs.

   L'ancien onglet « La gamme & le stock » est parti : il écrivait le stock à
   la main, exactement le circuit que le module Stock & Achats a fermé. */

type LabTab = 'atelier' | 'formules' | 'preparations' | 'reserve' | 'perf';
type Mode = 'besoin' | 'ingredients';

const REINVENT_TONE: Record<'red' | 'amber' | 'blue', { bg: string; fg: string; accent: string }> = {
  red: { bg: 'rgba(140,59,46,.12)', fg: 'var(--trv-error)', accent: 'var(--trv-error)' },
  amber: { bg: 'rgba(169,112,43,.14)', fg: 'var(--trv-warning)', accent: 'var(--trv-warning)' },
  blue: { bg: 'var(--indigo-50)', fg: 'var(--color-indigo)', accent: 'var(--color-indigo)' },
};

/* Les dates de la maison, pas celles d'UTC : entre minuit et une heure à
   Cotonou, toISOString datait la veille — la nuit comptable se coupait en deux. */
const jour = todayISO;
const frJour = frDay;

export default function Laboratoire() {
  const { branch, currency } = useBranch();
  const clients = useBranchClients();

  const [tab, setTab] = useState<LabTab>('atelier');
  const [mode, setMode] = useState<Mode>('besoin');
  const [concern, setConcern] = useState('hydratation');
  const [clientId, setClientId] = useState('');
  const [swaps, setSwaps] = useState<Record<string, Sub>>({});
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [composerFormule, setComposerFormule] = useState<FormuleLab | null>(null);
  const [lier, setLier] = useState<string | null>(null);

  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [preparations] = usePreparationsLab();
  const [formules] = useFormulesLab();
  const produitsBranche = useMemo(() => produits.filter((p) => p.branchId === branch.id), [produits, branch.id]);
  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);

  /* La réserve rassemble les DEUX bibliothèques : les formules vitrine du code,
     et les formules maîtres venues de la base. Un même nom canonique — une
     seule fiche, où qu'il apparaisse. */
  const pantry = useMemo(() => {
    const noms = labPantry();
    for (const n of ingredientsDesFormules(formules)) if (!noms.includes(n)) noms.push(n);
    return noms;
  }, [formules]);
  /* LA RÉSERVE N'EST PLUS UNE OPINION : lié → stock dérivé positif ; jamais
     lié → réputé disponible, et marqué « à relier » pour qu'on le voie. */
  const stockReel: StockMap = useMemo(
    () => stockReelDuLab(pantry, produitsBranche, mouvements),
    [pantry, produitsBranche, mouvements],
  );

  const view = useMemo(() => buildFormulaView(concern, swaps, stockReel), [concern, swaps, stockReel]);
  const matches = useMemo(() => buildMatches(stockReel), [stockReel]);
  const availCount = pantry.filter((p) => isAvail(stockReel, p)).length;
  const liesCount = pantry.filter((p) => fichePourIngredient(p, produitsBranche)).length;

  const cliente = clients.find((c) => c.id === clientId);
  const mesPreps = useMemo(
    () => preparations.filter((p) => p.branchId === branch.id).sort((a, b) => b.composeeLe.localeCompare(a.composeeLe)),
    [preparations, branch.id],
  );
  const enAttente = mesPreps.filter((p) => p.statut === 'proposee').length;

  const restoreAll = () =>
    setSwaps((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${concern}:`)) delete next[k]; });
      return next;
    });
  const restoreOne = (key: string) =>
    setSwaps((prev) => { const next = { ...prev }; delete next[key]; return next; });
  const pickSub = (key: string, opt: Sub) => {
    setSwaps((prev) => ({ ...prev, [key]: opt }));
    setOpenSub(null);
  };
  const compose = (k: string) => {
    setConcern(k);
    setMode('besoin');
    setSwaps((prev) => composeFromStock(k, prev, stockReel));
    setOpenSub(null);
    setNote('L’intelligence a recomposé depuis la réserve réelle — vérifie les substituts, puis compose pour une cliente.');
  };

  const f = view.base;

  const TABS: { k: LabTab; l: string }[] = [
    { k: 'atelier', l: 'L’atelier' },
    { k: 'formules', l: `Formules maîtres · ${formules.length}` },
    { k: 'preparations', l: `Préparations${enAttente ? ` · ${enAttente} à fabriquer` : ''}` },
    { k: 'reserve', l: `La réserve · ${liesCount}/${pantry.length} reliés` },
    { k: 'perf', l: 'Performance' },
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · l’atelier des formules"
        title="Le Laboratoire."
        sub="Une cliente, un besoin, une formule — composée depuis la réserve réelle, fabriquée en consommant le stock, remise ou facturée à son nom."
      />

      <div className="trv-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`trv-tab ${tab === t.k ? 'is-active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {note && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span><span>{note}</span>
          <button className="trv-linkbtn trv-linkbtn--muted" style={{ marginLeft: 'auto' }} onClick={() => setNote(null)}>fermer</button>
        </div>
      )}

      {/* ===== L'ATELIER — le formulateur ===== */}
      {tab === 'atelier' && (
        <div>
          <div className="trv-lab-voice">
            <div>
              <div className="mnd-eyebrow" style={{ color: 'var(--copper-200)' }}>La parole de la formulatrice</div>
              <div className="quote">« Dites-moi ce dont la couronne souffre — <em>je connais l’ingrédient juste, sa terre d’origine et le geste qui le réveille.</em> »</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 3, border: '1px solid var(--hairline)', borderRadius: 999, padding: 3, background: 'var(--surface-card)' }}>
              {(['besoin', 'ingredients'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setOpenSub(null); }}
                  style={{
                    cursor: 'pointer', border: 'none', borderRadius: 999, padding: '8px 18px',
                    fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.08em',
                    background: mode === m ? 'var(--color-indigo)' : 'transparent',
                    color: mode === m ? 'var(--color-ivoire)' : 'var(--ink-soft)',
                  }}
                >
                  {m === 'besoin' ? 'Par besoin' : 'Par ingrédients disponibles'}
                </button>
              ))}
            </div>
            {/* LA CLIENTE D'ABORD : c'est pour elle qu'on formule. */}
            <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
              <ClientPicker value={clientId} onChange={setClientId} placeholder="Pour quelle cliente ? (nom, téléphone)…" />
            </div>
          </div>

          {mode === 'besoin' && (
            <div>
              <div className="trv-sec-label">Quel est le besoin de {cliente ? cliente.name.split(' ')[0] : 'la cliente'} ?</div>
              <div className="tr-cols" style={{ '--cols': 'repeat(6, 1fr)', '--cols-md': 'repeat(3, minmax(0,1fr))', '--cols-sm': 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 24 } as CSSProperties}>
                {LAB_CONCERNS.map((c) => (
                  <button key={c.k} className={`trv-concern ${concern === c.k ? 'is-active' : ''}`} onClick={() => setConcern(c.k)}>
                    <div className="g">{c.glyph}</div>
                    <div className="l">{c.label}</div>
                  </button>
                ))}
              </div>

              {view.swapCount > 0 && (
                <div className="trv-recomposed">
                  <span>
                    <span style={{ color: 'var(--copper-700)', fontWeight: 500 }}>Formule recomposée</span> — l’intelligence a remplacé {view.swapCount} ingrédient{view.swapCount > 1 ? 's' : ''} par des substituts de même rôle. Origines et protocole ajustés.
                  </span>
                  <button className="trv-minibtn" onClick={restoreAll}>Tout rétablir</button>
                </div>
              )}

              <div className="tr-cols" style={{ '--cols': '1.05fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
                {/* gauche — identité + origines */}
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
                  <div className="trv-formula-band" style={{ background: f.band.bg }}>
                    <div className="eyebrow" style={{ color: f.band.eyebrow }}>Formule souveraine · {f.concernLabel}</div>
                    <div className="name" style={{ color: f.band.title }}>{view.name}</div>
                    <div className="forme" style={{ color: f.band.forme }}>{f.forme} · {f.contenance}</div>
                  </div>
                  <div style={{ padding: '20px 24px 24px' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink)' }}>{f.description}</div>
                    <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '22px 0 12px' }}>Les origines · le meilleur du monde</div>
                    <div>
                      {view.origins.map((o) => {
                        const fiche = fichePourIngredient(o.ingredient, produitsBranche);
                        const reserve = fiche ? (stocks.get(fiche.id) ?? 0) : undefined;
                        return (
                          <div key={o.key} className={`trv-origin ${o.rowClass}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                              <div>
                                <div className="ing">{o.ingredient}</div>
                                <div className="role">{o.role}</div>
                              </div>
                              <div style={{ textAlign: 'right', flex: 'none' }}>
                                <div className="origin">{o.origin}</div>
                                <div className="grade">{o.grade}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 8, flexWrap: 'wrap' }}>
                              {/* LE VRAI CHIFFRE À CÔTÉ DU VERDICT : « En réserve · 340 ml »
                                  se discute mieux qu'un feu vert sans preuve. */}
                              <span className="trv-origin-status" style={{ color: o.statusFg }}>
                                {o.statusLabel}
                                {fiche && reserve !== undefined ? ` · ${reserve.toLocaleString('fr-FR')} ${fiche.unite}` : ''}
                              </span>
                              {!fiche && (
                                /* On lie l'ingrédient AFFICHÉ — après substitution, viser
                                   l'original créait une fiche pour le mauvais nom. */
                                <button className="trv-linkbtn trv-linkbtn--muted" onClick={() => { setLier(o.ingredient); }}>
                                  à relier au stock ›
                                </button>
                              )}
                              {o.swapped && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, fontStyle: 'italic', color: 'var(--ink-soft)' }}>au lieu de {o.origName}</span>}
                              {o.subOptions.length > 0 && (
                                <button className="trv-linkbtn" onClick={() => setOpenSub(openSub === o.key ? null : o.key)}>Remplacer ›</button>
                              )}
                              {o.swapped && <button className="trv-linkbtn trv-linkbtn--muted" onClick={() => restoreOne(o.key)}>Rétablir l’original</button>}
                            </div>
                            {openSub === o.key && (
                              <div className="trv-subpanel">
                                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Substituts de même rôle · proposés par l’intelligence</div>
                                {o.subOptions.map((opt) => (
                                  <button key={opt.ingredient} className="trv-subopt" onClick={() => pickSub(o.key, opt)}>
                                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{opt.ingredient}</span>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)' }}>{opt.origin} · {opt.grade}</span>
                                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: opt.stockFg, whiteSpace: 'nowrap' }}>{opt.stockLabel}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* droite — protocole & décision */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: 'var(--color-sable)', borderRadius: 4, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 0 }}>Le protocole · de l’atelier au cuir</div>
                      {view.protoChanged && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-ivoire)', background: 'var(--color-copper)', borderRadius: 999, padding: '2px 9px' }}>Recalibré</span>}
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginLeft: 'auto' }}>{f.protocolTime}</span>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      {view.protocol.map((p) => (
                        <div key={p.n} className="trv-proto-step">
                          <div className="n">{p.n}</div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{p.title}</span>
                              {p.changed && <span className="trv-adjusted">ajusté</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 3 }}>{p.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="tr-cols" style={{ '--cols': '1fr 1fr', '--cols-md': '1fr 1fr', '--cols-sm': '1fr', gap: 12 } as CSSProperties}>
                    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '15px 17px' }}>
                      <div className="mnd-eyebrow">Coût matière indicatif</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--ink)', marginTop: 7 }}>{fmtMoney(f.coutMatN, currency)}</div>
                    </div>
                    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '15px 17px' }}>
                      <div className="mnd-eyebrow">Prix conseillé</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--trv-success)', marginTop: 7 }}>{fmtMoney(f.prixN, currency)}</div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '15px 18px' }}>
                    <div className="mnd-eyebrow" style={{ color: 'var(--copper-700)' }}>Le mot du maître</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', marginTop: 6 }}>{f.maitreNote}</div>
                  </div>

                  {/* LE GESTE RÉEL — plus de bouton qui ne fait rien. */}
                  <Button
                    variant="copper"
                    disabled={!cliente}
                    title={cliente ? `Composer « ${view.name} » pour ${cliente.name}` : 'Choisissez d’abord une cliente'}
                    onClick={() => setComposer(true)}
                  >
                    {cliente ? `Composer pour ${cliente.name.split(' ')[0]} ›` : 'Choisissez une cliente pour composer'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ===== PAR INGRÉDIENTS DISPONIBLES ===== */}
          {mode === 'ingredients' && (
            <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 20, alignItems: 'start' } as CSSProperties}>
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '20px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div className="trv-sec-label" style={{ marginBottom: 0 }}>Ce que le laboratoire a en réserve</div>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{availCount}/{pantry.length}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
                  Le vrai stock parle — un ingrédient s’éteint quand sa fiche est épuisée. Cliquer ouvre sa liaison.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pantry.map((p) => {
                    const fiche = fichePourIngredient(p, produitsBranche);
                    const on = isAvail(stockReel, p);
                    return (
                      <button
                        key={p}
                        className={`trv-pantry-chip ${on ? 'on' : ''}`}
                        title={fiche ? `${fiche.code} · ${(stocks.get(fiche.id) ?? 0).toLocaleString('fr-FR')} ${fiche.unite}` : 'Pas encore relié au stock'}
                        onClick={() => setLier(p)}
                      >
                        {p}
                        <span style={{ fontSize: 10 }}>{fiche ? (on ? '✓' : '∅') : '·'}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 12 }}>
                  ✓ en réserve · ∅ épuisé · « · » pas encore relié (réputé disponible)
                </div>
              </div>

              <div>
                <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 4 }}>Ce que l’intelligence peut composer</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Classé par couverture du stock — elle substitue d’elle-même ce qui manque.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {matches.map((m) => (
                    <div key={m.k} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '15px 17px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{m.name}</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 1 }}>{m.label} · {m.forme}</div>
                        </div>
                        <span className="trv-origin-status" style={{ color: m.readyFg, whiteSpace: 'nowrap' }}>{m.readyLabel}</span>
                      </div>
                      <div className="trv-perf-bar" style={{ margin: '12px 0 7px' }}><div style={{ width: `${m.coverPct}%`, background: m.barFill }} /></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{m.summary}</span>
                        <Button size="sm" onClick={() => compose(m.k)}>Composer celle-ci ›</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== LES FORMULES MAÎTRES ===== */}
      {tab === 'formules' && (
        <OngletFormules
          cliente={cliente ? { id: cliente.id, name: cliente.name } : undefined}
          clientPicker={
            <div style={{ maxWidth: 380 }}>
              <ClientPicker value={clientId} onChange={setClientId} placeholder="Pour quelle cliente ? (nom, téléphone)…" />
            </div>
          }
          onComposer={setComposerFormule}
          onLier={setLier}
        />
      )}

      {/* ===== LES PRÉPARATIONS ===== */}
      {tab === 'preparations' && <OngletPreparations />}

      {/* ===== LA RÉSERVE — les liaisons ===== */}
      {tab === 'reserve' && <OngletReserve onLier={setLier} />}

      {/* ===== PERFORMANCE ===== */}
      {tab === 'perf' && (
        <div className="tr-cols" style={{ '--cols': '1.4fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '20px 22px' }}>
            <div className="trv-sec-label" style={{ marginBottom: 4 }}>Le palmarès des formules</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 16 }}>Rachat, résultats consignés au Carnet, satisfaction et vitesse de vente — combinés en un Indice de mérite.</div>
            {PERF_SEED.length === 0 && (
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', padding: '14px 0', borderTop: '1px solid var(--hairline)' }}>
                Le palmarès se mérite — il naîtra des premières préparations remises et des résultats consignés au Carnet.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--color-indigo)', borderRadius: 4, padding: '20px 22px' }}>
              <div className="mnd-eyebrow" style={{ color: 'var(--copper-200)' }}>À réinventer · l’atelier ne dort jamais</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-ivoire)', marginTop: 7, lineHeight: 1.35 }}>Une grande formule cesse de l’être le jour où on la croit finie.</div>
            </div>
            {REINVENT_SEED.length === 0 && (
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '16px 18px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                Rien à réinventer pour l’instant — les signaux viendront des remises et des retours consignés au Carnet.
              </div>
            )}
            {REINVENT_SEED.map((r) => {
              const t = REINVENT_TONE[r.flagK];
              return (
                <div key={r.name} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${t.accent}`, borderRadius: 4, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{r.name}</span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.fg, background: t.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', flex: 'none' }}>{r.flag}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 8 }}>{r.why}</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: 'var(--copper-700)', marginTop: 8 }}>→ {r.move}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {composer && cliente && (
        <ComposerModal
          cliente={{ id: cliente.id, name: cliente.name }}
          concernK={concern}
          nomFormule={view.name}
          forme={f.forme}
          prixConseille={f.prixN}
          ingredients={view.origins.map((o) => ({ nom: o.ingredient }))}
          onClose={() => setComposer(false)}
          onFait={() => { setComposer(false); setTab('preparations'); setNote(`« ${view.name} » composée pour ${cliente.name} — à fabriquer quand l’atelier est prêt.`); }}
        />
      )}

      {/* Composer depuis une formule maître : les QUANTITÉS DU CLASSEUR sont
          pré-remplies — le maître ajuste, il ne ressaisit pas. */}
      {composerFormule && cliente && (
        <ComposerModal
          cliente={{ id: cliente.id, name: cliente.name }}
          concernK={`${composerFormule.collection}${composerFormule.niveau ? ` · ${composerFormule.niveau}` : ''}`}
          nomFormule={`${composerFormule.nom} · ${composerFormule.code}`}
          forme={composerFormule.usage ?? composerFormule.collection}
          prixConseille={0}
          ingredients={composerFormule.ingredients.map((x) => ({ nom: x.nom, qte: x.qte, unite: x.unite }))}
          onClose={() => setComposerFormule(null)}
          onFait={() => { const nomF = composerFormule.nom; setComposerFormule(null); setTab('preparations'); setNote(`« ${nomF} » composée pour ${cliente.name} — à fabriquer quand l’atelier est prêt.`); }}
        />
      )}

      {lier && <LierModal ingredient={lier} onClose={() => setLier(null)} />}
    </div>
  );
}

/* ═══════════ Composer — la formule devient une préparation ═══════════ */

function ComposerModal({ cliente, concernK, nomFormule, forme, prixConseille, ingredients, onClose, onFait }: {
  cliente: { id: string; name: string };
  concernK: string;
  nomFormule: string;
  forme: string;
  prixConseille: number;
  /** Avec `qte`, la quantité du classeur est pré-remplie — on ajuste, on ne
      ressaisit pas. Sans elle, le champ attend le maître. */
  ingredients: { nom: string; qte?: number; unite?: string }[];
  onClose: () => void;
  onFait: () => void;
}) {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const produitsBranche = useMemo(() => produits.filter((p) => p.branchId === branch.id), [produits, branch.id]);
  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const [qtes, setQtes] = useState<Record<string, string>>(() =>
    Object.fromEntries(ingredients.filter((x) => x.qte !== undefined).map((x) => [x.nom, String(x.qte)])));
  const [prix, setPrix] = useState(String(prixConseille));
  const [notes, setNotes] = useState('');

  const lignesVue = ingredients.map(({ nom }) => {
    const fiche = fichePourIngredient(nom, produitsBranche);
    return { nom, fiche, stock: fiche ? (stocks.get(fiche.id) ?? 0) : undefined };
  });
  const coutEstime = lignesVue.reduce((s, l) => {
    const q = litQuantite(qtes[l.nom] ?? '');
    return s + (l.fiche && Number.isFinite(q) ? q * l.fiche.prixAchatXof : 0);
  }, 0);

  const enregistrer = () => {
    const lignes = lignesVue
      .filter((l) => l.fiche)
      .map((l) => ({ produitId: l.fiche!.id, quantite: litQuantite(qtes[l.nom] ?? '') || 0 }));
    const r = composerPreparation(
      branch.id, cliente.id,
      { concernK, nomFormule, forme, ingredientsTexte: ingredients.map((x) => x.nom), prixXof: parseInt(prix.replace(/[^0-9]/g, ''), 10) || 0, notes },
      lignes, jour(),
    );
    if (!r.ok) { window.alert(r.erreur); return; }
    onFait();
  };

  return (
    <Modal title={`Composer pour ${cliente.name}.`} onClose={onClose} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          « {nomFormule} » — les quantités ci-dessous seront CONSOMMÉES du stock à la fabrication.
          Un ingrédient sans fiche liée reste sur la composition écrite, mais rien ne sera décompté pour lui.
        </div>

        {lignesVue.map((l) => (
          <div key={l.nom} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13 }}>{l.nom}</span>
              <span className="mnd-muted" style={{ fontSize: 10.5 }}>
                {l.fiche
                  ? `${l.fiche.code} · ${l.stock!.toLocaleString('fr-FR')} ${l.fiche.unite} en réserve`
                  : 'pas de fiche liée — voir La réserve'}
              </span>
            </span>
            {l.fiche ? (
              <Input
                inputMode="decimal"
                placeholder={l.fiche.unite}
                value={qtes[l.nom] ?? ''}
                onChange={(e) => setQtes((prev) => ({ ...prev, [l.nom]: e.target.value }))}
                style={{ width: 110, textAlign: 'right' }}
              />
            ) : (
              <span className="mnd-muted" style={{ fontSize: 11, fontStyle: 'italic', flex: 'none' }}>non décomptée</span>
            )}
          </div>
        ))}

        <div className="tr-grid tr-grid--2">
          <Field label="Prix (F CFA)">
            <Input inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} />
          </Field>
          <div>
            <div className="mnd-eyebrow" style={{ marginBottom: 6 }}>Coût matière estimé</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: 'var(--copper-700)' }}>{fmtMoney(Math.round(coutEstime), currency)}</div>
          </div>
        </div>
        <Field label="Note d’atelier (facultative)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cuir sensible — moitié de menthe…" />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" onClick={enregistrer}>Composer la préparation</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════ Les formules maîtres — le classeur, vivant ═══════════ */

/* AUCUN CONTENU ICI. Les formules réelles vivent en base (`lab_formules`,
   personnel seul) et arrivent par la synchronisation — le dépôt est public,
   le bundle se télécharge sans compte, et un secret de fabrique écrit dans le
   code n'en serait plus un. Ce composant ne sait que les AFFICHER. */
function OngletFormules({ cliente, clientPicker, onComposer, onLier }: {
  cliente?: { id: string; name: string };
  clientPicker: React.ReactNode;
  onComposer: (f: FormuleLab) => void;
  onLier: (nom: string) => void;
}) {
  const { branch } = useBranch();
  const [formules] = useFormulesLab();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const produitsBranche = useMemo(() => produits.filter((p) => p.branchId === branch.id), [produits, branch.id]);
  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  const [selId, setSelId] = useState<string | null>(null);

  const groupes = useMemo(() => parCollection(formules), [formules]);
  const sel = formules.find((x) => x.id === selId) ?? [...groupes.values()][0]?.[0];

  if (formules.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.7, color: 'var(--ink-soft)', padding: '18px 2px', maxWidth: 640 }}>
        La bibliothèque est vide. Les formules maîtres ne vivent qu’en base, réservées au personnel —
        collez le fichier local <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontStyle: 'normal' }}>supabase/import_formules_maitres.sql</span> dans
        l’éditeur SQL, et elles apparaîtront ici à la prochaine synchronisation.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {clientPicker}
        <span className="mnd-muted" style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Confidentiel · réservé au personnel — jamais dans le dépôt
        </span>
      </div>

      <div className="tr-cols" style={{ '--cols': '0.62fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
        {/* ── la table des matières ── */}
        <div>
          {[...groupes.entries()].map(([collection, liste]) => (
            <section key={collection} style={{ marginBottom: 18 }}>
              <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 8 }}>{collection}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {liste.map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => setSelId(fm.id)}
                    style={{
                      textAlign: 'left', cursor: 'pointer', font: 'inherit', width: '100%',
                      background: sel?.id === fm.id ? 'var(--indigo-50)' : 'var(--surface-card)',
                      border: '1px solid var(--hairline)',
                      borderLeft: `3px solid ${sel?.id === fm.id ? 'var(--color-copper)' : 'var(--hairline)'}`,
                      borderRadius: 3, padding: '9px 12px',
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, color: 'var(--color-indigo)', minWidth: 0 }}>{fm.nom}</span>
                      <span className="mnd-muted" style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, whiteSpace: 'nowrap' }}>{fm.code}</span>
                    </span>
                    <span className="mnd-muted" style={{ display: 'block', fontSize: 10.5, marginTop: 2 }}>
                      {[fm.niveau, fm.externe ? 'formulé en externe' : null].filter(Boolean).join(' · ') || fm.usage}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── la fiche ouverte ── */}
        {sel && (
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
            <div className="trv-formula-band" style={{ background: 'var(--color-indigo)' }}>
              <div className="eyebrow" style={{ color: 'var(--copper-200)' }}>
                {sel.collection}{sel.niveau ? ` · ${sel.niveau}` : ''} · {sel.code}
              </div>
              <div className="name" style={{ color: 'var(--color-ivoire)' }}>{sel.nom}</div>
              {sel.usage && <div className="forme" style={{ color: 'rgba(244,240,232,.72)' }}>{sel.usage}</div>}
            </div>
            <div style={{ padding: '18px 22px 22px' }}>
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                {[
                  sel.fabricant,
                  sel.externe && sel.referenceExterne ? `réf. ${sel.referenceExterne}` : null,
                  sel.rendement ? `rendement ${sel.rendement}` : null,
                  sel.conservation,
                  sel.phCible ? `pH cible ${sel.phCible}` : null,
                ].filter(Boolean).join(' · ')}
              </div>

              <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '16px 0 8px' }}>La formule</div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tre-table">
                  <thead>
                    <tr><th>Code</th><th>Ingrédient</th><th style={{ textAlign: 'right' }}>Qté</th><th>Rôle</th><th>Réserve</th></tr>
                  </thead>
                  <tbody>
                    {sel.ingredients.map((ing) => {
                      const fiche = fichePourIngredient(ing.nom, produitsBranche);
                      const s = fiche ? (stocks.get(fiche.id) ?? 0) : undefined;
                      return (
                        <tr key={ing.ord}>
                          <td style={{ fontFamily: 'var(--font-sans)', fontSize: 10, whiteSpace: 'nowrap' }}>{ing.code ?? '—'}</td>
                          <td style={{ fontSize: 12.5 }}>{ing.nom}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {ing.qte !== undefined ? `${ing.qte} ${ing.unite ?? ''}` : 'selon profil'}
                            {ing.temp ? <span className="mnd-muted" style={{ fontSize: 10 }}> · {ing.temp}</span> : null}
                          </td>
                          <td className="mnd-muted" style={{ fontSize: 10.5 }}>{ing.role ?? ing.categorie ?? ''}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 10.5 }}>
                            {fiche
                              ? <span style={{ color: s! > 0 ? 'var(--trv-success)' : 'var(--trv-error)' }}>{s!.toLocaleString('fr-FR')} {fiche.unite}</span>
                              : <button className="trv-linkbtn trv-linkbtn--muted" onClick={() => onLier(ing.nom)}>lier ›</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '18px 0 8px' }}>Protocole de réalisation</div>
              {sel.protocole.map((p) => (
                <div key={p.n} className="trv-proto-step">
                  <div className="n">{p.n}</div>
                  <div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{p.titre}</span>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 3 }}>{p.detail}</div>
                  </div>
                </div>
              ))}

              {sel.controle.length > 0 && (
                <>
                  <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '18px 0 8px' }}>
                    {sel.controleTitre ?? 'Contrôle qualité avant conditionnement'}
                  </div>
                  {sel.controle.map((c, ix) => (
                    <div key={ix} className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, paddingLeft: 12, borderLeft: '2px solid var(--copper-300)', marginBottom: 6 }}>{c}</div>
                  ))}
                </>
              )}

              {sel.notes && sel.notes.length > 0 && (
                <>
                  <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '18px 0 8px' }}>Notes du classeur</div>
                  {sel.notes.map((n, ix) => (
                    <div key={ix} style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 6 }}>{n}</div>
                  ))}
                </>
              )}

              <Button
                variant="copper"
                style={{ marginTop: 16, width: '100%' }}
                disabled={!cliente}
                title={cliente ? `Composer « ${sel.nom} » pour ${cliente.name} — quantités du classeur pré-remplies` : 'Choisissez d’abord une cliente en haut de l’onglet'}
                onClick={() => onComposer(sel)}
              >
                {cliente ? `Composer pour ${cliente.name.split(' ')[0]} ›` : 'Choisissez une cliente pour composer'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════ Les préparations — de la proposition à la remise ═══════════ */

function OngletPreparations() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const clients = useBranchClients();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [preparations] = usePreparationsLab();
  const [invoices] = useInvoices();

  const liste = useMemo(
    () => preparations.filter((p) => p.branchId === branch.id).sort((a, b) => b.composeeLe.localeCompare(a.composeeLe)),
    [preparations, branch.id],
  );
  const nomCliente = (id: string) => clients.find((c) => c.id === id)?.name ?? 'une cliente';
  const concernLabel = (k: string) => LAB_CONCERNS.find((c) => c.k === k)?.label ?? k;

  const fabriquer = (prep: Preparation) => {
    const manques = manquesPourFabrication(prep, produits, mouvements);
    const detail = manques.length
      ? `\n\nATTENTION — la réserve est courte :\n${manques.map((m) => `· ${m.produit.nom} : ${m.stock.toLocaleString('fr-FR')} ${m.produit.unite} en réserve, il en faut ${(m.stock + m.manque).toLocaleString('fr-FR')}`).join('\n')}\n\nFabriquer quand même laissera un stock négatif — qui dit la vérité.`
      : '';
    if (!window.confirm(`Fabriquer « ${prep.nomFormule} » pour ${nomCliente(prep.clientId)} ? Les ingrédients seront décomptés du stock.${detail}`)) return;
    const r = fabriquerPreparation(prep, jour());
    if (!r.ok) window.alert(r.erreur);
  };

  /* LA FACTURE REJOINT LES CIRCUITS COMMUNS : impayés, encaissements, avoirs —
     rien de spécial au Laboratoire, c'est une facture comme les autres. */
  /* LA GARDE D'ABORD, LA PIÈCE ENSUITE. L'ordre inverse laissait, au double
     clic, une facture orpheline au même numéro — le fantôme d'impayés que les
     rituels avaient déjà coûté 212 000 F. `poserFacture` se garde contre le
     magasin ; le verrou local coupe la rafale du même doigt. */
  const facturationEnCours = useRef(false);
  const facturer = (prep: Preparation) => {
    if (facturationEnCours.current) return;
    facturationEnCours.current = true;
    try {
      const inv: Invoice = {
        id: `inv-${uid()}`,
        branchId: branch.id,
        kind: 'facture',
        number: nextInvoiceNumber(invoices, 'MND'),
        clientId: prep.clientId,
        date: jour(),
        lines: [{ id: uid(), label: `Préparation du Laboratoire · ${prep.nomFormule}`, qty: 1, unitXof: prep.prixXof, discountPct: 0 }],
        globalDiscountPct: 0,
        theme: 'Aube',
        status: 'envoyée',
      };
      const r = poserFacture(prep, inv.id);
      if (!r.ok) { window.alert(r.erreur); return; }
      invoicesStore.set((prev) => [inv, ...prev]);
      navigate(`/factures?id=${inv.id}`);
    } finally {
      facturationEnCours.current = false;
    }
  };

  return (
    <div>
      {liste.length === 0 && (
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', padding: '18px 2px' }}>
          Aucune préparation — composez-en une depuis L’atelier : une cliente, son besoin, la formule.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {liste.map((prep) => {
          const cout = coutPreparationXof(prep, produits);
          return (
            <div key={prep.id} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '14px 17px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{prep.nomFormule}</span>
                  <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 10 }}>
                    pour <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>{nomCliente(prep.clientId)}</b>
                    {' · '}{concernLabel(prep.concernK)} · {frJour(prep.composeeLe)}
                  </span>
                </span>
                <span className="trv-origin-status" style={{ color: prep.statut === 'remise' ? 'var(--trv-success)' : prep.statut === 'fabriquee' ? 'var(--copper-700)' : 'var(--ink-soft)', flex: 'none' }}>
                  {PREPARATION_NOMS[prep.statut]}{prep.invoiceId ? ' · facturée' : ''}
                </span>
              </div>

              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {prep.ingredientsTexte.join(' · ')}
                {prep.notes ? <span style={{ fontStyle: 'italic' }}> — {prep.notes}</span> : null}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                  {fmtMoney(prep.prixXof, currency)}
                  {cout > 0 && <> · coût matière {fmtMoney(cout, currency)}{prep.prixXof > 0 ? ` · marge ${Math.round(((prep.prixXof - cout) / prep.prixXof) * 100)} %` : ''}</>}
                </span>
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {prep.statut === 'proposee' && (
                    <>
                      <Button size="sm" variant="copper" onClick={() => fabriquer(prep)}>Fabriquer</Button>
                      <button className="trv-minibtn" onClick={() => { if (window.confirm('Retirer cette proposition ?')) supprimerPreparation(prep); }}>Retirer</button>
                    </>
                  )}
                  {prep.statut === 'fabriquee' && (
                    <Button size="sm" variant="indigo" onClick={() => { const r = remettrePreparation(prep, jour()); if (!r.ok) window.alert(r.erreur); }}>
                      Remettre à {nomCliente(prep.clientId).split(' ')[0]}
                    </Button>
                  )}
                  {prep.statut !== 'proposee' && !prep.invoiceId && (
                    <Button size="sm" variant="ghost" onClick={() => facturer(prep)}>Facturer</Button>
                  )}
                  {prep.invoiceId && (
                    <button className="trv-minibtn" onClick={() => navigate(`/factures?id=${prep.invoiceId}`)}>Voir la facture</button>
                  )}
                  {prep.statut !== 'proposee' && !prep.invoiceId && (
                    <button
                      className="trv-minibtn"
                      title="Retire les sorties du journal — la réserve remonte"
                      onClick={() => { if (window.confirm('Annuler la fabrication ? Les ingrédients reviennent au stock.')) { const r = annulerFabrication(prep); if (!r.ok) window.alert(r.erreur); } }}
                    >
                      Annuler la fabrication
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════ La réserve — chaque ingrédient tient à une fiche ═══════════ */

function OngletReserve({ onLier }: { onLier: (nom: string) => void }) {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [formules] = useFormulesLab();
  const produitsBranche = useMemo(() => produits.filter((p) => p.branchId === branch.id), [produits, branch.id]);
  const stocks = useMemo(() => stocksParProduit(mouvements), [mouvements]);
  /* Vitrine ET formules maîtres — un nom canonique, une fiche. */
  const pantry = useMemo(() => {
    const noms = labPantry();
    for (const n of ingredientsDesFormules(formules)) if (!noms.includes(n)) noms.push(n);
    return noms;
  }, [formules]);

  return (
    <div>
      <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 640, marginBottom: 14 }}>
        Chaque ingrédient des formules se lie à une fiche du module Stock &amp; Achats. Une fois lié,
        sa disponibilité cesse d’être une opinion : c’est son stock, tenu par le journal — les achats
        le font monter, les fabrications le font descendre. Un ingrédient jamais lié reste réputé
        disponible.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tre-table">
          <thead>
            <tr><th>Ingrédient</th><th>Fiche liée</th><th style={{ textAlign: 'right' }}>En réserve</th><th>Prix d’achat</th><th></th></tr>
          </thead>
          <tbody>
            {pantry.map((nom) => {
              const fiche = fichePourIngredient(nom, produitsBranche);
              const s = fiche ? (stocks.get(fiche.id) ?? 0) : undefined;
              return (
                <tr key={nom}>
                  <td style={{ fontSize: 13 }}>{nom}</td>
                  <td className="mnd-muted" style={{ fontSize: 11.5 }}>
                    {fiche ? `${fiche.code} · ${fiche.nom}` : '— à relier'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: fiche && s! <= 0 ? 'var(--trv-error)' : undefined }}>
                    {fiche ? `${s!.toLocaleString('fr-FR')} ${fiche.unite}` : '—'}
                  </td>
                  <td className="mnd-muted" style={{ fontSize: 11.5 }}>{fiche ? `${fmtMoney(fiche.prixAchatXof, currency)} / ${fiche.unite}` : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="trv-minibtn" onClick={() => onLier(nom)}>{fiche ? 'Changer' : 'Lier'}</button>
                    {fiche && <>{' '}<button className="trv-minibtn" onClick={() => delierIngredient(nom)}>Délier</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════ Lier un ingrédient à une fiche — ou la créer ═══════════ */

function LierModal({ ingredient, onClose }: { ingredient: string; onClose: () => void }) {
  const { branch } = useBranch();
  const [produits] = useProduitsStock();
  const produitsBranche = useMemo(
    () => produits.filter((p) => p.branchId === branch.id && p.actif && p.famille !== 'revente')
      .sort((a, b) => a.code.localeCompare(b.code)),
    [produits, branch.id],
  );
  const dejaLie = fichePourIngredient(ingredient, produitsBranche);
  const [choix, setChoix] = useState(dejaLie?.id ?? '');
  const [creation, setCreation] = useState(false);
  const [unite, setUnite] = useState('ml');
  const [prixAchat, setPrixAchat] = useState('');
  const [stockInitial, setStockInitial] = useState('0');

  const lierExistante = () => {
    if (!choix) return;
    lierIngredient(choix, ingredient);
    onClose();
  };

  const creerEtLier = () => {
    /* « 2,5 » restait « 25 » : le parseInt concaténait les chiffres en
       arrachant la virgule — l'inventaire initial gonflait de dix fois. */
    const r = creerProduitStock(branch.id, {
      nom: ingredient, famille: 'consommable', unite,
      prixAchatXof: Math.round(litQuantite(prixAchat) || 0),
    }, litQuantite(stockInitial) || 0, jour());
    if (!r.ok || !r.id) { window.alert(r.erreur); return; }
    lierIngredient(r.id, ingredient);
    onClose();
  };

  return (
    <Modal title={`${ingredient}.`} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!creation && (
          <>
            <Field label="Lier à une fiche d’inventaire existante">
              <Select value={choix} onChange={(e) => setChoix(e.target.value)}>
                <option value="">—</option>
                {produitsBranche.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.nom} ({p.unite})</option>
                ))}
              </Select>
            </Field>
            <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
              Une fiche ne porte qu’un ingrédient — relier ici déplace le lien si la fiche en avait un.
              Pas de fiche qui convienne ? Créez-la : elle naîtra en Consommable, avec son
              « Inventaire initial » au journal.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setCreation(true)}>+ Créer la fiche</Button>
              <span style={{ display: 'inline-flex', gap: 10 }}>
                <Button variant="ghost" onClick={onClose}>Annuler</Button>
                <Button onClick={lierExistante} disabled={!choix}>Lier</Button>
              </span>
            </div>
          </>
        )}
        {creation && (
          <>
            <div className="tr-grid tr-grid--2">
              <Field label="Unité (ml, g, pièce…)">
                <Input value={unite} onChange={(e) => setUnite(e.target.value)} autoFocus />
              </Field>
              <Field label="Prix d’achat (F CFA / unité)">
                <Input inputMode="numeric" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} placeholder="20" />
              </Field>
            </div>
            <Field label="Quantité en réserve aujourd’hui">
              <Input inputMode="numeric" value={stockInitial} onChange={(e) => setStockInitial(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setCreation(false)}>Retour</Button>
              <Button variant="copper" onClick={creerEtLier}>Créer et lier</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
