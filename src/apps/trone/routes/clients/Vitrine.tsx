import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { usePersonas, clientsStore } from '../../../../shared/clients';
import { useCategories, useProducts, useServices, priceModeOf } from '../../../../shared/catalog';
import { useTiers } from '../../../../shared/offers';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, personalDurationMin, scalesWithModel, bandLabel } from '../../../../shared/pricing';
import { vitrineConfigStore } from '../../../../shared/bridges';
import { ENVIES, QUIZ_POOL, type EnvieKey } from '../../../../shared/quiz';
import { recoPourEnvie, recoSourceLabel } from '../../../../shared/reco';
import { useStore } from '../../../../shared/store';
import { Avatar, apptLabel, frLong, frShort, fromISO, todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';
import './clients.css';

/* Vitrine client — le miroir personnalisé auto-joué pendant le rituel, et la régie
   qui compose ce que chaque cliente voit (catégories/services/produits + quiz IA). */

const SCENE_LABELS = ['La rencontre', 'Un mot pour toi', 'Une question pour toi', 'Ton prochain moment'];

/* LES MOTS DU QUIZ ONT DÉMÉNAGÉ dans `shared/quiz.ts` — questions, envies et
   phrases. Ma Couronne pose désormais le même quiz au seuil de sa réservation :
   deux jeux de mots, c'eussent été deux maisons. Le miroir TUTOIE (`.tu`),
   l'application VOUVOIE. Ce qui se propose en face reste réglé à la Régie. */

export default function Vitrine() {
  const [mode, setMode] = useState<'apercu' | 'couronne' | 'regie'>('apercu');
  const clients = useBranchClients();
  const [cIdx, setCIdx] = useState(0);
  const [query, setQuery] = useState('');
  const safeIdx = Math.min(cIdx, Math.max(0, clients.length - 1));
  const client = clients[safeIdx];
  /* Recherche cliente — le CRM peut compter des centaines de têtes ; on filtre les
     pastilles par nom ou téléphone. La sélection reste ancrée sur l'index dans la
     liste COMPLÈTE (stable), pas dans la liste filtrée. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || (qd.length > 0 && (c.phone ?? '').replace(/\D/g, '').includes(qd)))
      : clients;
  }, [clients, query]);

  if (!client) {
    return (
      <div className="mnd-rise">
        <PageHead eyebrow="Vitrine · L’écran de la cliente" title="La Vitrine." />
        <div className="trc-empty">Aucune tête couronnée sur cette branche — la Vitrine attend sa première cliente.</div>
      </div>
    );
  }

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vitrine · L’écran de la cliente"
        title="La Vitrine."
        actions={
          <Segs<'apercu' | 'couronne' | 'regie'>
            options={[
              { value: 'apercu', label: 'Aperçu' },
              { value: 'couronne', label: 'Ma Couronne' },
              { value: 'regie', label: 'Régie' },
            ]}
            value={mode}
            onChange={setMode}
          />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="trc-microlabel" style={{ margin: 0 }}>Qui est devant le miroir ?</span>
          <input
            className="mnd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une cliente (nom, téléphone)…"
            style={{ flex: '1 1 220px', maxWidth: 320 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 152, overflowY: 'auto', paddingRight: 4 }}>
          {filtered.map((c) => (
            <button
              key={c.id}
              className="trc-chip"
              style={c.id === client.id ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined}
              onClick={() => setCIdx(clients.findIndex((x) => x.id === c.id))}
            >
              {c.name.split(' ')[0]}
            </button>
          ))}
          {filtered.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune cliente ne correspond.</span>}
        </div>
      </div>

      {mode === 'apercu' && <Apercu client={client} />}
      {mode === 'couronne' && <CouronnePreview client={client} />}
      {mode === 'regie' && <Regie client={client} />}
    </div>
  );
}

/* ---------- Aperçu · le miroir auto-joué ---------- */
function Apercu({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const { currency } = useBranch();
  const [personas] = usePersonas();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [cfg] = useStore(vitrineConfigStore);
  const today = todayISO();

  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(cfg.autoplay);
  const [variant, setVariant] = useState(0);
  const [servicesTous] = useServices();
  const [cfgMiroir] = useStore(vitrineConfigStore);
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  /* La naissance de la couronne prime (CRM) ; sinon l'entrée au CRM. */
  const days = Math.max(1, Math.round((Date.now() - fromISO(client.crownSince ?? client.since).getTime()) / 86400000));
  const persona = personas.find((p) => p.id === client.persona);
  const nextAppt = appts
    .filter((a) => a.clientId === client.id && a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const isQuizScene = scene === 2 && cfg.quizEnabled;

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setScene((s) => {
        if (s === 2 && cfg.quizEnabled) return s; // la scène quiz laisse la cliente répondre
        return (s + 1) % SCENE_LABELS.length;
      });
    }, 4200);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, cfg.quizEnabled]);

  const pool = QUIZ_POOL[variant % QUIZ_POOL.length];
  /* LA RECOMMANDATION VIENT DU CATALOGUE, et son prix est celui de la
     cliente — coefficient personnel compris, comme partout ailleurs dans la
     Maison. Plus de tarif inventé, plus de multiplicateur d'humeur : ce qui
     s'affiche au miroir est ce qu'elle paiera. */
  const svcReco = q1
    ? recoPourEnvie(client, q1 as EnvieKey, {
        /* Au miroir, le salon est là : le vivier est le catalogue entier, sans
           le filtre de calibre du tunnel. La CASCADE, elle, est la même — son
           persona, son histoire, le repli de la Maison — pour que les deux
           écrans ne racontent jamais deux histoires à la même tête. */
        offre: servicesTous,
        catalogue: servicesTous,
        personas,
        maison: cfgMiroir.recoParEnvie,
        appointments: appts,
        auto: cfgMiroir.recoAuto,
      })?.service
    : undefined;
  const mot = ENVIES.find((e) => e.k === q1);
  const reco = svcReco && mot ? { title: svcReco.name, line: mot.line.tu } : null;
  const recoPrice = svcReco ? personalPriceXof(svcReco, { clientCoef: client.priceCoef }) : 0;

  const goto = (s: number) => { setScene(s); setPlaying(false); };

  return (
    <div>
      <div className="trc-stage">
        <div className="trc-stage__scene">
          {scene === 0 && (
            <div className="trc-fade" style={{ display: 'flex', alignItems: 'center', gap: 48, maxWidth: 900 }}>
              <div style={{ position: 'relative', flex: 'none' }}>
                <div style={{ position: 'absolute', inset: -10, border: '1px solid rgba(185,122,74,.4)', borderRadius: '50%' }} />
                <Avatar client={client} size={140} />
              </div>
              <div>
                <div className="trc-stage__eyebrow">{persona?.name ?? 'Tête couronnée'}</div>
                <h1 className="trc-stage__title">Bonjour,<br />{client.name.split(' ')[0]}.</h1>
                <div className="trc-stage__line">Cela fait {days} jours que ta couronne grandit. Aujourd’hui, elle franchit un palier.</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
                  <span style={{ width: 34, height: 1, background: 'var(--copper-200)' }} />
                  <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>{days} jours couronnée</span>
                </div>
              </div>
            </div>
          )}

          {scene === 1 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 720 }}>
              <div className="trc-stage__eyebrow" style={{ letterSpacing: '.3em' }}>Un mot pour toi</div>
              <div className="trc-stage__line" style={{ fontSize: 30, color: 'var(--color-ivoire)', marginTop: 24 }}>
                “{persona?.essence ?? 'Ta couronne raconte ta constance — la maison en est l’orfèvre.'}”
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 40 }}>
                <span style={{ width: 40, height: 1, background: 'rgba(246,241,231,.25)' }} />
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--copper-200)' }}>la Maison, rien que pour toi</span>
                <span style={{ width: 40, height: 1, background: 'rgba(246,241,231,.25)' }} />
              </div>
            </div>
          )}

          {scene === 2 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 640, width: '100%' }}>
              {cfg.quizEnabled ? (
                <>
                  <div className="trc-stage__eyebrow">Une question pour toi</div>
                  <h2 className="trc-stage__title" style={{ fontSize: 40 }}>Dis-nous, en deux gestes.</h2>
                  <div className="trc-stage__line" style={{ fontSize: 15, marginTop: 6, marginBottom: 26 }}>
                    Deux réponses, et ta prochaine couronne s’écrit déjà.
                    <button onClick={() => { setVariant((v) => v + 1); setQ1(null); setQ2(null); }} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--copper-200)', borderBottom: '1px solid var(--copper-200)', padding: '0 0 1px', marginLeft: 6 }}>
                      ↻ Autres questions
                    </button>
                  </div>
                  <QuizRow label={pool.q1.tu} opts={pool.q1opts} value={q1} onPick={setQ1} />
                  <div style={{ height: 22 }} />
                  <QuizRow label={pool.q2.tu} opts={pool.q2opts} value={q2} onPick={setQ2} />
                  {q1 && q2 && reco && (
                    <div className="trc-fade" style={{ marginTop: 30, background: 'rgba(185,122,74,.14)', border: '1px solid rgba(185,122,74,.42)', borderRadius: 4, padding: '22px 26px' }}>
                      <div className="trc-stage__eyebrow" style={{ letterSpacing: '.2em' }}>Pour toi, {client.name.split(' ')[0]}</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-ivoire)', marginTop: 7 }}>{reco.title}</div>
                      <div className="trc-stage__line" style={{ fontSize: 16, margin: '8px 0 14px' }}>{reco.line}</div>
                      <span className="trc-stage__piece">{fmtMoney(recoPrice, currency)} · tarif personnalisé</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="trc-stage__line" style={{ fontSize: 20 }}>Le quiz sur-mesure est désactivé pour cette Vitrine. Activez-le dans la Régie.</div>
              )}
            </div>
          )}

          {scene === 3 && (
            <div className="trc-fade" style={{ textAlign: 'center', maxWidth: 560 }}>
              <div className="trc-stage__eyebrow">Ton prochain moment</div>
              <h2 className="trc-stage__title" style={{ fontSize: 50 }}>On t’attend.</h2>
              <div style={{ background: 'rgba(246,241,231,.05)', border: '1px solid rgba(246,241,231,.12)', borderRadius: 4, padding: '26px 30px', marginTop: 24 }}>
                {nextAppt ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--color-ivoire)' }}>{frLong(nextAppt.date)}</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 44, color: 'var(--copper-200)', margin: '4px 0 14px' }}>{nextAppt.time}</div>
                    <div style={{ fontSize: 12, letterSpacing: '.06em', color: 'var(--indigo-100)' }}>avec {nextAppt.master} · {apptLabel(nextAppt, byId)}</div>
                  </>
                ) : (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: 'var(--color-ivoire)' }}>Ton fauteuil t’attend — réserve ton prochain rituel.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="trc-stage__controls">
          <button className="trc-stage__arrow" onClick={() => goto((scene + SCENE_LABELS.length - 1) % SCENE_LABELS.length)} aria-label="Précédent">‹</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 9 }}>
              {SCENE_LABELS.map((label, i) => (
                <button key={label} className={`trc-dot ${i === scene ? 'is-active' : ''}`} style={{ width: i === scene ? 26 : 6 }} title={label} onClick={() => goto(i)} />
              ))}
            </div>
            <button onClick={() => setPlaying((p) => !p)} style={{ cursor: 'pointer', background: 'none', border: '1px solid rgba(246,241,231,.2)', borderRadius: '50%', width: 32, height: 32, color: 'var(--copper-200)', fontSize: 12 }} aria-label={playing ? 'Pause' : 'Lecture'}>
              {playing ? '❙❙' : '▶'}
            </button>
            <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)', minWidth: 150, textAlign: 'center' }}>
              {SCENE_LABELS[scene]}{isQuizScene ? ' · en attente' : ''}
            </span>
          </div>
          <button className="trc-stage__arrow" onClick={() => goto((scene + 1) % SCENE_LABELS.length)} aria-label="Suivant">›</button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-soft)', marginTop: 12 }}>
        La Vitrine se joue d’elle-même pendant le rituel — chaque scène est composée à partir de l’histoire réelle de la cliente.
      </div>
    </div>
  );
}

function QuizRow({ label, opts, value, onPick }: { label: string; opts: [string, string][]; value: string | null; onPick: (k: string) => void }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-ivoire)', marginBottom: 13 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {opts.map(([k, l]) => {
          const on = value === k;
          return (
            <button
              key={k}
              onClick={() => onPick(k)}
              style={{
                cursor: 'pointer', fontSize: 13, letterSpacing: '.04em',
                color: on ? 'var(--color-obsidian)' : 'var(--color-ivoire)',
                background: on ? 'var(--copper-200)' : 'rgba(246,241,231,.06)',
                border: `1px solid ${on ? 'var(--copper-200)' : 'rgba(246,241,231,.22)'}`,
                borderRadius: 999, padding: '11px 22px', transition: 'all .25s',
              }}
            >
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Régie · la configuration de la Vitrine ---------- */
function Regie({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const [servicesRegie] = useServices();
  const [cfg] = useStore(vitrineConfigStore);
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [personas] = usePersonas();
  const persona = personas.find((p) => p.id === client.persona);

  // Initialise les catégories visibles au premier passage : toutes celles activées.
  useEffect(() => {
    if (vitrineConfigStore.get().visibleCategories.length === 0 && categories.length) {
      vitrineConfigStore.set((c) => ({ ...c, visibleCategories: categories.filter((x) => x.enabled).map((x) => x.id) }));
    }
  }, [categories]);

  const catVisible = (id: string) => cfg.visibleCategories.includes(id);
  const svcVisible = (id: string) => !cfg.hiddenServices.includes(id);
  const prodVisible = (id: string) => !cfg.hiddenProducts.includes(id);

  const toggleCat = (id: string) =>
    vitrineConfigStore.set((c) => ({ ...c, visibleCategories: c.visibleCategories.includes(id) ? c.visibleCategories.filter((x) => x !== id) : [...c.visibleCategories, id] }));
  const toggleSvc = (id: string) =>
    vitrineConfigStore.set((c) => ({ ...c, hiddenServices: c.hiddenServices.includes(id) ? c.hiddenServices.filter((x) => x !== id) : [...c.hiddenServices, id] }));
  const toggleProd = (id: string) =>
    vitrineConfigStore.set((c) => ({ ...c, hiddenProducts: c.hiddenProducts.includes(id) ? c.hiddenProducts.filter((x) => x !== id) : [...c.hiddenProducts, id] }));
  const setFlag = (k: 'autoplay' | 'quizEnabled' | 'recoAuto', v: boolean) => vitrineConfigStore.set((c) => ({ ...c, [k]: v }));

  const carpet = useMemo(() => {
    const s = services.filter((x) => svcVisible(x.id) && catVisible(x.categoryId)).map((x) => x.name);
    const p = products.filter((x) => prodVisible(x.id) && catVisible(x.categoryId)).map((x) => x.name);
    return [...s, ...p];
  }, [services, products, cfg]);

  const onCount = carpet.length;
  const offCount = services.length + products.length - onCount;

  const byCat = (catId: string) => ({
    services: services.filter((s) => s.categoryId === catId),
    products: products.filter((p) => p.categoryId === catId),
  });

  return (
    <div className="tr-cols" style={{ '--cols': '340px 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
      {/* Colonne gauche · la cliente + réglages globaux */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--color-indigo)', borderRadius: 4, padding: '22px', color: 'var(--color-ivoire)' }}>
          <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>La cliente devant la régie</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
            <Avatar client={client} size={52} />
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, lineHeight: 1 }}>{client.name.split(' ')[0]}</div>
              <div style={{ fontSize: 11, color: 'var(--copper-200)', marginTop: 5 }}>{persona?.name ?? 'À classer'}</div>
            </div>
          </div>
          {persona && <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 14, lineHeight: 1.5 }}>{persona.essence}</div>}
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, color: 'var(--color-indigo)', lineHeight: 1 }}>{onCount}</div>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', marginTop: 5 }}>sur son tapis</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, color: 'var(--ink-soft)', lineHeight: 1 }}>{offCount}</div>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)', marginTop: 5 }}>hors-champ</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="trc-microlabel" style={{ margin: 0 }}>Réglages de la Vitrine</div>
          <SwitchRow label="Lecture automatique" sub="Le miroir enchaîne les scènes seul." on={cfg.autoplay} onToggle={(v) => setFlag('autoplay', v)} />
          <SwitchRow
            label="Quiz sur-mesure"
            sub="Deux questions à rotation, puis une reco. Au miroir ET au seuil de Ma Couronne."
            on={cfg.quizEnabled}
            onToggle={(v) => setFlag('quizEnabled', v)}
          />

          {/* CE QUE LE QUIZ PROPOSE — pris au catalogue, jamais inventé. Le
              miroir recommandait quatre rituels écrits en dur, à des prix qui
              n existaient nulle part : montrés a une cliente, ils devenaient
              une promesse que la Maison n avait jamais faite. */}
          {cfg.quizEnabled && (
            <>
              <SwitchRow
                label="Son histoire tranche"
                sub="Parmi les prestations désignées, celle que ses rendez-vous rendent la plus juste."
                on={!!cfg.recoAuto}
                onToggle={(v) => setFlag('recoAuto', v)}
              />
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                  <b style={{ fontWeight: 500 }}>Le repli de la Maison</b> — ce qui se propose quand
                  l’archétype de la cliente n’a rien dit. La désignation qui compte se fait{' '}
                  <b style={{ fontWeight: 500 }}>par persona</b> (CRM → Les personas). Rien nulle
                  part = rien n’est recommandé, et le quiz ne s’ouvre pas sur son téléphone. Une
                  prestation masquée à la Vitrine ne se propose jamais.
                </div>
                {ENVIES.map((e) => (
                  <label key={e.k} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5 }}>{e.label}</span>
                    <select
                      className="sys-select"
                      style={{ maxWidth: 230, flex: 1 }}
                      value={cfg.recoParEnvie?.[e.k] ?? ''}
                      onChange={(ev) => vitrineConfigStore.set((c) => ({ ...c, recoParEnvie: { ...(c.recoParEnvie ?? {}), [e.k]: ev.target.value || undefined } }))}
                    >
                      <option value="">— aucune —</option>
                      {servicesRegie.map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <RecoResolue client={client} />
            </>
          )}
        </div>
      </div>

      {/* Colonne droite · la curation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="trc-microlabel" style={{ color: 'var(--copper-700)' }}>La régie de la vitrine</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, color: 'var(--color-indigo)', margin: '2px 0 0' }}>Compose son tapis de cuivre.</h2>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--ink-soft)', marginTop: 5 }}>
            Choisis ce que {client.name.split(' ')[0]} verra — et ce qu’elle ne verra pas.
          </div>
        </div>

        {categories.map((cat) => {
          const { services: cs, products: cp } = byCat(cat.id);
          if (cs.length === 0 && cp.length === 0) return null;
          const catOn = catVisible(cat.id);
          return (
            <div key={cat.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
                <div className="trc-microlabel" style={{ margin: 0 }}>{cat.fon} · {cat.label}</div>
                <button className={`trc-switch ${catOn ? 'is-on' : ''}`} onClick={() => toggleCat(cat.id)} aria-label={`Catégorie ${cat.fon}`} title={catOn ? 'Catégorie visible' : 'Catégorie masquée'} />
              </div>
              <div className="tr-grid tr-grid--2" style={{ opacity: catOn ? 1 : 0.4, pointerEvents: catOn ? 'auto' : 'none' }}>
                {cs.map((s) => (
                  <ToggleCard key={s.id} name={s.name} sub={`${s.palier}`} on={svcVisible(s.id)} onToggle={() => toggleSvc(s.id)} />
                ))}
                {cp.map((p) => (
                  <ToggleCard key={p.id} name={p.name} sub="Produit maison" on={prodVisible(p.id)} onToggle={() => toggleProd(p.id)} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Le tapis de cuivre */}
        <div style={{ background: 'var(--grad-indigo, linear-gradient(160deg,#1E2150,#15173A))', borderRadius: 4, padding: '22px 24px 26px', color: 'var(--color-ivoire)' }}>
          <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>Le tapis de cuivre · {client.name.split(' ')[0]}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)', marginTop: 4 }}>Ce qu’elle foulera, dans cet ordre — rien d’autre.</div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', minHeight: 54 }}>
            {carpet.length === 0 ? (
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-200)' }}>Tapis vide — allume au moins une pièce.</span>
            ) : (
              carpet.map((name) => <span key={name} className="trc-stage__piece">{name}</span>)
            )}
          </div>
        </div>

        {/* L ESSAI EN VRAI, sous les réglages. Régler d un côté et vérifier de
            l autre obligeait à changer d onglet à chaque case cochée : on ne
            voyait jamais l effet du geste qu on venait de faire. Le miroir est
            donc ici, vivant, nourri par la configuration du dessus — coche une
            catégorie, réponds au quiz, et tu vois exactement ce que la cliente
            verra. */}
        <div>
          <div className="trc-microlabel" style={{ color: 'var(--copper-700)' }}>L essai · ce que {client.name.split(' ')[0]} verra</div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 12, lineHeight: 1.55 }}>
            Le miroir tel qu il se jouera devant elle. Réponds aux deux questions pour vérifier la
            prestation proposée et son prix — ce sont les vrais, pris au catalogue.
          </div>
          <Apercu client={client} />
        </div>
      </div>
    </div>
  );
}

/* CE QU'ELLE VERRA VRAIMENT, envie par envie — la cascade rendue lisible.
   Désigner sur le persona d'un côté et vérifier de l'autre laisserait deviner
   quel cran a répondu : on le dit, ici, pour la cliente qu'on regarde. */
function RecoResolue({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const [servicesTous] = useServices();
  const [personas] = usePersonas();
  const [cfg] = useStore(vitrineConfigStore);
  const appts = useBranchAppointments();
  const persona = personas.find((p) => p.id === client.persona);

  return (
    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <div className="trc-microlabel" style={{ margin: '0 0 8px' }}>
        Pour {client.name.split(' ')[0]} · {persona?.name ?? 'persona à classer'}
      </div>
      {ENVIES.map((e) => {
        const r = recoPourEnvie(client, e.k, {
          offre: servicesTous,
          catalogue: servicesTous,
          personas,
          maison: cfg.recoParEnvie,
          appointments: appts,
          auto: cfg.recoAuto,
        });
        return (
          <div key={e.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 11.5, padding: '4px 0' }}>
            <span style={{ color: 'var(--ink-soft)', flex: 'none' }}>{e.label}</span>
            <span style={{ textAlign: 'right', minWidth: 0 }}>
              {r ? (
                <>
                  {r.service.name}
                  <span style={{ color: 'var(--copper-700)' }}> · {recoSourceLabel(r.source)}</span>
                </>
              ) : (
                <span className="mnd-muted">rien à proposer</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ToggleCard({ name, sub, on, onToggle }: { name: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <button className={`trc-toggle ${on ? 'is-on' : ''}`} onClick={onToggle}>
      <div className="trc-toggle__row">
        <span className="trc-toggle__name">{name}</span>
        <span className="trc-toggle__check">{on ? '✓' : ''}</span>
      </div>
      <span className="trc-toggle__sub">{sub}</span>
    </button>
  );
}

function SwitchRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{sub}</div>
      </div>
      <button className={`trc-switch ${on ? 'is-on' : ''}`} onClick={() => onToggle(!on)} aria-label={label} />
    </div>
  );
}

/* ---------- Ma Couronne · l'aperçu de l'app cliente + les modules par cliente ----
   Ce que VERRA cette cliente dans Ma Couronne, calculé sur les MÊMES données que
   l'app (catalogue visible, barème des modèles, Juste Prix, paliers, RDV, reco) —
   pour tester chaque écran AVANT de lancer les réservations. Et, par cliente, des
   modules à couper : Réserver · Composer · Suivi · Gamme · Cercle · Offres
   (fiche.hiddenModules, lus par l'app). */

const COURONNE_MODULES: { k: string; label: string; sub: string }[] = [
  { k: 'reserver', label: 'Réserver', sub: 'La prise de rendez-vous en ligne (tunnel en sept temps).' },
  { k: 'compose', label: 'Composer', sub: 'Le rituel sur-mesure (composeur).' },
  { k: 'suivi', label: 'Carnet de Suivi', sub: 'Onglet Suivi — parcours, photos, recommandation.' },
  { k: 'gamme', label: 'La Gamme', sub: 'Onglet boutique — produits maison, commandes.' },
  { k: 'cercle', label: 'Le Cercle', sub: 'Onglet fidélité — points et paliers.' },
  { k: 'offres', label: 'Offres instantanées', sub: 'Les offres du Marketing sur son accueil.' },
];

const fmtDur = (min: number): string =>
  min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}` : `${min} min`;

function CouronnePreview({ client }: { client: ReturnType<typeof useBranchClients>[0] }) {
  const { currency } = useBranch();
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [tiers] = useTiers();
  const [bands] = useModelBands();
  const [cfg] = useStore(vitrineConfigStore);
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const today = todayISO();

  const [screen, setScreen] = useState<'accueil' | 'reserver' | 'suivi' | 'cercle'>('accueil');

  const hidden = client.hiddenModules ?? [];
  const isOff = (k: string) => hidden.includes(k);
  const toggleModule = (k: string) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id
      ? { ...c, hiddenModules: (c.hiddenModules ?? []).includes(k) ? (c.hiddenModules ?? []).filter((x) => x !== k) : [...(c.hiddenModules ?? []), k] }
      : c)));

  /* Le catalogue VISIBLE côté cliente — mêmes règles que useVisibleCatalog. */
  const catOk = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c || !c.enabled) return false;
    return cfg.visibleCategories.length === 0 || cfg.visibleCategories.includes(id);
  };
  const visServices = useMemo(
    () => services.filter((s) => catOk(s.categoryId) && !cfg.hiddenServices.includes(s.id)).slice().sort((a, b) => a.order - b.order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, categories, cfg],
  );

  /* SES prix, SA durée — le même moteur que l'app et le comptoir. */
  const [sets] = useBandSets();
  const pricing = pricingOf(client, bands, sets, categories);
  const priceLabel = (s: (typeof services)[number]) => {
    const mode = priceModeOf(s);
    if (mode === 'devis') return 'Prix en salon';
    const p = fmtMoney(personalPriceXof(s, pricing), currency);
    return mode === 'variable' ? `à partir de ${p}` : p;
  };

  /* Paliers du Cercle — la même échelle que l'app. */
  const points = client.loyaltyPoints ?? 0;
  const ladder = useMemo(() => [...tiers].sort((a, b) => a.pts - b.pts), [tiers]);
  const nextTier = ladder.find((t) => points < t.pts);
  const attained = ladder.filter((t) => t.pts <= points);

  const nextAppt = appts
    .filter((a) => a.clientId === client.id && a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const honoredCount = appts.filter((a) => a.clientId === client.id && a.status === 'honoré').length;
  const lastVisit = appts
    .filter((a) => a.clientId === client.id && a.status === 'honoré')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const reco = products.find((p) => p.id === client.recoProductId);
  const first = client.name.split(' ')[0];

  const screenOff = (k: 'suivi' | 'cercle') => (isOff(k) ? (
    <div style={{ margin: '30px 14px', padding: '18px 16px', textAlign: 'center', border: '1px dashed var(--copper-300)', borderRadius: 4, color: 'var(--copper-700)', fontSize: 12.5, lineHeight: 1.5 }}>
      Module coupé pour {first} — cet onglet n'existe pas dans son application.
    </div>
  ) : null);

  return (
    <div className="tr-cols" style={{ '--cols': 'minmax(300px, 360px) 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>
      {/* ----- Colonne gauche : les modules de la cliente ----- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--color-indigo)', borderRadius: 4, padding: 22, color: 'var(--color-ivoire)' }}>
          <div className="trc-microlabel" style={{ color: 'var(--copper-200)', margin: 0 }}>Son application Ma Couronne</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
            <Avatar client={client} size={52} />
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, lineHeight: 1 }}>{first}</div>
              <div style={{ fontSize: 11, color: 'var(--copper-200)', marginTop: 5 }}>
                {client.lockCount ? `Modèle · ${client.lockCount} locks` : 'Modèle à renseigner (Clientes · colonne Locks)'}
              </div>
            </div>
          </div>
          {pricing.band && (
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 12, lineHeight: 1.5 }}>
              Tranche {bandLabel(pricing.band, bands)} · prix ×{pricing.band.coef} · durée ×{pricing.band.durCoef}
              {pricing.clientCoef !== 1 ? ` · coefficient personnel ×${pricing.clientCoef}` : ''}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Modules · rien que pour elle</div>
            <span className="mnd-muted" style={{ fontSize: 10.5 }}>{COURONNE_MODULES.length - hidden.length}/{COURONNE_MODULES.length} ouverts</span>
          </div>
          {COURONNE_MODULES.map((m) => (
            <div key={m.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: isOff(m.k) ? 'var(--ink-soft)' : 'var(--ink)' }}>{m.label}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{m.sub}</div>
              </div>
              <button className={`trc-switch ${!isOff(m.k) ? 'is-on' : ''}`} onClick={() => toggleModule(m.k)} aria-label={`Module ${m.label}`} title={isOff(m.k) ? 'Module coupé — cliquer pour l’ouvrir' : 'Module ouvert — cliquer pour le couper'} />
            </div>
          ))}
          <div className="mnd-muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
            Coupé = l'onglet disparaît de SON application (et les gestes associés se ferment avec un mot honnête).
            L'Accueil et le Profil restent toujours ouverts. Réglage synchronisé — effet immédiat sur son téléphone.
          </div>
        </div>

        <a
          className="mnd-btn mnd-btn--ghost"
          style={{ textAlign: 'center', textDecoration: 'none' }}
          /* Chemin relatif à l'origine (même compte GitHub que Le Trône) : marche
             sur yemanb.github.io comme sur maisonmnd.github.io, sans domaine figé. */
          href="/couronne/"
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir Ma Couronne →
        </a>
      </div>

      {/* ----- Colonne droite : le téléphone ----- */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {([['accueil', 'Accueil'], ['reserver', 'Réserver'], ['suivi', 'Suivi'], ['cercle', 'Cercle']] as const).map(([k, l]) => (
            <button key={k} className="trc-chip" style={screen === k ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined} onClick={() => setScreen(k)}>
              {l}{((k === 'reserver' && isOff('reserver')) || (k === 'suivi' && isOff('suivi')) || (k === 'cercle' && isOff('cercle'))) ? ' · coupé' : ''}
            </button>
          ))}
        </div>

        <div style={{ width: 384, maxWidth: '100%', background: 'var(--color-ivoire)', border: '10px solid var(--color-indigo)', borderRadius: 26, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', textAlign: 'center', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', padding: '7px 0 9px' }}>
            Ma Couronne · {first}
          </div>
          <div style={{ minHeight: 470, maxHeight: 560, overflowY: 'auto' }}>
            {/* ======= ACCUEIL ======= */}
            {screen === 'accueil' && (
              <div style={{ padding: 14 }}>
                <div style={{ background: 'var(--grad-indigo, var(--color-indigo))', borderRadius: 6, padding: '20px 16px', color: 'var(--color-ivoire)' }}>
                  <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Votre couronne</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, marginTop: 4 }}>Bonjour, {first}.</div>
                </div>
                <div style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, background: 'var(--surface-card)', padding: '12px 14px', marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{client.crownStyle ?? 'Votre couronne'}</span>
                    {attained.length > 0 && <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--copper-700)', border: '1px solid var(--copper-300)', borderRadius: 999, padding: '2px 9px' }}>Palier {attained.length}</span>}
                  </div>
                  {ladder.length > 0 && (
                    <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                      {nextTier ? `Prochain palier à ${nextTier.pts.toLocaleString('fr-FR')} points — elle en a ${points}.` : 'Tous les paliers sont honorés.'}
                    </div>
                  )}
                </div>
                <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '14px 16px', color: 'var(--color-ivoire)', marginTop: 12 }}>
                  <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Prochain rituel</div>
                  {nextAppt ? (
                    <>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginTop: 5 }}>{frLong(nextAppt.date)} · {nextAppt.time}</div>
                      <div style={{ fontSize: 11, color: 'var(--indigo-100)', marginTop: 3 }}>{apptLabel(nextAppt, byId)} · {nextAppt.master}</div>
                    </>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, marginTop: 5 }}>Aucun rituel à venir</div>
                  )}
                </div>
                {!isOff('reserver') && (
                  <div style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', textAlign: 'center', borderRadius: 3, padding: '12px 10px', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 12 }}>Réserver un rituel</div>
                )}
                {!isOff('compose') && (
                  <div style={{ border: '1px solid var(--color-indigo)', color: 'var(--color-indigo)', textAlign: 'center', borderRadius: 3, padding: '11px 10px', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 8 }}>✦ Composez votre rituel sur-mesure</div>
                )}
                {isOff('reserver') && (
                  <div className="mnd-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>Réservation coupée — le bouton n'existe pas chez elle.</div>
                )}
                {reco && (
                  <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '11px 13px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>Du Carnet de Suivi</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', marginTop: 3 }}>{reco.name}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--copper-700)', flex: 'none' }}>{fmtMoney(reco.priceXof, currency)}</span>
                  </div>
                )}
              </div>
            )}

            {/* ======= RÉSERVER · SES prix ======= */}
            {screen === 'reserver' && (
              <div style={{ padding: 14 }}>
                {isOff('reserver') && (
                  <div style={{ margin: '0 0 12px', padding: '12px 14px', border: '1px dashed var(--copper-300)', borderRadius: 4, color: 'var(--copper-700)', fontSize: 12, lineHeight: 1.5 }}>
                    Module Réserver coupé — elle ne peut PAS ouvrir ce tunnel. Aperçu de ses tarifs quand même :
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--copper-700)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {pricing.band
                    ? `Ses prix — modèle ${client.lockCount} locks · ${bandLabel(pricing.band, bands)}`
                    : 'Modèle non renseigné — elle voit les prix catalogue'}
                </div>
                {categories.filter((c) => catOk(c.id) && visServices.some((s) => s.categoryId === c.id)).map((cat) => (
                  <div key={cat.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 6 }}>{cat.fon} · {cat.label}</div>
                    {visServices.filter((s) => s.categoryId === cat.id).map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--hairline)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--color-indigo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div className="mnd-muted" style={{ fontSize: 10 }}>
                            {fmtDur(personalDurationMin(s, pricing))}
                            {scalesWithModel(s) && pricing.band ? ' · suit son modèle' : ''}
                          </div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--copper-700)', flex: 'none', whiteSpace: 'nowrap' }}>{priceLabel(s)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {visServices.length === 0 && <div className="mnd-muted" style={{ fontSize: 12, fontStyle: 'italic' }}>Aucune prestation visible — vérifiez la Régie et le Catalogue.</div>}
              </div>
            )}

            {/* ======= SUIVI ======= */}
            {screen === 'suivi' && (screenOff('suivi') ?? (
              <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[[client.lockCount ?? '—', 'Locks'], [honoredCount, 'Rituels honorés'], [lastVisit ? frShort(lastVisit.date) : '—', 'Dernière visite']].map(([v, l]) => (
                    <div key={String(l)} style={{ flex: 1, border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)', padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{v}</div>
                      <div className="mnd-muted" style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {reco ? (
                  <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, background: 'var(--copper-50)', padding: '12px 14px', marginTop: 12 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>La maison vous recommande</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 5 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>{reco.name}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--copper-700)' }}>{fmtMoney(reco.priceXof, currency)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, fontStyle: 'italic' }}>
                    Aucun produit recommandé — choisissez-le sur sa fiche (La couronne · Produit recommandé).
                  </div>
                )}
              </div>
            ))}

            {/* ======= CERCLE ======= */}
            {screen === 'cercle' && (screenOff('cercle') ?? (
              <div style={{ padding: 14 }}>
                <div style={{ background: 'var(--color-indigo)', borderRadius: 6, padding: '16px', color: 'var(--color-ivoire)', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>Reconnaissance de la maison</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, marginTop: 4 }}>{points.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--indigo-100)' }}>points de reconnaissance</div>
                </div>
                {ladder.length === 0 && <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, fontStyle: 'italic' }}>Aucun palier défini (Cercle MND).</div>}
                {ladder.map((t, i) => {
                  const svc = services.find((s) => s.id === t.serviceId);
                  const on = points >= t.pts;
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '9px 2px', borderBottom: '1px solid var(--hairline)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>{svc?.name ?? 'Prestation de la maison'}</div>
                        <div className="mnd-muted" style={{ fontSize: 10 }}>palier {i + 1} · {t.pts.toLocaleString('fr-FR')} points</div>
                      </div>
                      <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: on ? 'var(--trf-success, #4c7a4c)' : 'var(--ink-soft)', flex: 'none' }}>{on ? 'Obtenu' : `${points}/${t.pts}`}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Barre d'onglets du téléphone — les modules coupés n'y figurent pas. */}
          <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid var(--hairline)', background: 'var(--surface-card)', padding: '9px 4px 11px' }}>
            {([['accueil', '♛', 'Accueil'], ['suivi', '◷', 'Suivi'], ['gamme', '⬡', 'Gamme'], ['cercle', '✦', 'Cercle'], ['profil', '◈', 'Profil']] as const).map(([k, g, l]) => {
              const off = (k === 'suivi' || k === 'gamme' || k === 'cercle') && isOff(k);
              if (off) return null;
              return (
                <div key={k} style={{ textAlign: 'center', color: k === screen ? 'var(--color-copper)' : 'var(--ink-soft)' }}>
                  <div style={{ fontSize: 13 }}>{g}</div>
                  <div style={{ fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>{l}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11, textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>
          Aperçu calculé sur les mêmes données que son application : catalogue visible, barème des modèles,
          paliers du Cercle, rendez-vous et recommandation. Ce qu'elle verra, sans se connecter à sa place.
        </div>
      </div>
    </div>
  );
}
