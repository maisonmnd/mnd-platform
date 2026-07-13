import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { usePersonas } from '../../../../shared/clients';
import { useCategories, useProducts, useServices } from '../../../../shared/catalog';
import { vitrineConfigStore } from '../../../../shared/bridges';
import { useStore } from '../../../../shared/store';
import { Avatar, apptLabel, frLong, fromISO, todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';
import './clients.css';

/* Vitrine client — le miroir personnalisé auto-joué pendant le rituel, et la régie
   qui compose ce que chaque cliente voit (catégories/services/produits + quiz IA). */

const SCENE_LABELS = ['La rencontre', 'Un mot pour toi', 'Une question pour toi', 'Ton prochain moment'];

const QUIZ_POOL: { q1: string; q1opts: [string, string][]; q2: string; q2opts: [string, string][] }[] = [
  { q1: 'Aujourd’hui, qu’est-ce qui compte le plus pour toi ?', q1opts: [['longueur', 'La longueur'], ['eclat', 'L’éclat'], ['protection', 'La protection'], ['transformation', 'Le changement']],
    q2: 'Et pour la suite, tu te verrais bien…', q2opts: [['garder', 'Garder ma ligne'], ['oser', 'Oser plus grand'], ['surprise', 'Me faire surprendre']] },
  { q1: 'Si ta couronne pouvait parler, elle réclamerait…', q1opts: [['longueur', 'De pousser encore'], ['eclat', 'De briller plus'], ['protection', 'D’être protégée'], ['transformation', 'De tout changer']],
    q2: 'Ton humeur du moment, c’est plutôt…', q2opts: [['garder', 'La continuité'], ['oser', 'L’audace'], ['surprise', 'La surprise']] },
  { q1: 'Ce mois-ci, ton geste beauté prioritaire…', q1opts: [['longueur', 'Gagner en longueur'], ['eclat', 'Raviver l’éclat'], ['protection', 'Fortifier'], ['transformation', 'Réinventer']],
    q2: 'Pour ta prochaine venue, tu aimerais…', q2opts: [['garder', 'Rester fidèle à mon style'], ['oser', 'Voir plus grand'], ['surprise', 'Qu’on me guide']] },
];

const RECO: Record<string, { title: string; base: number; line: string }> = {
  longueur: { title: 'Le Soin Allongement', base: 28000, line: 'On nourrit la racine — c’est là que la longueur se gagne.' },
  eclat: { title: 'Le Rituel Éclat Cuivré', base: 32000, line: 'Une lumière posée sur ta couronne, rien que pour la faire chanter.' },
  protection: { title: 'La Coiffure Refuge', base: 24000, line: 'On protège ce que tu as bâti, mèche après mèche.' },
  transformation: { title: 'La Création Nano-locks', base: 120000, line: 'Le grand passage — une œuvre qui change tout.' },
};
const Q2MULT: Record<string, number> = { garder: 1.0, oser: 1.18, surprise: 1.08 };

export default function Vitrine() {
  const [mode, setMode] = useState<'apercu' | 'regie'>('apercu');
  const clients = useBranchClients();
  const [cIdx, setCIdx] = useState(0);
  const safeIdx = Math.min(cIdx, Math.max(0, clients.length - 1));
  const client = clients[safeIdx];

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
          <Segs<'apercu' | 'regie'>
            options={[{ value: 'apercu', label: 'Aperçu' }, { value: 'regie', label: 'Régie' }]}
            value={mode}
            onChange={setMode}
          />
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="trc-microlabel" style={{ margin: 0 }}>Qui est devant le miroir ?</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {clients.map((c, i) => (
            <button
              key={c.id}
              className="trc-chip"
              style={i === safeIdx ? { background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' } : undefined}
              onClick={() => setCIdx(i)}
            >
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {mode === 'apercu' ? <Apercu client={client} /> : <Regie client={client} />}
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
  const reco = q1 ? RECO[q1] : null;
  const recoPrice = reco ? Math.round(reco.base * client.priceCoef * (q2 ? Q2MULT[q2] : 1)) : 0;

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
                  <QuizRow label={pool.q1} opts={pool.q1opts} value={q1} onPick={setQ1} />
                  <div style={{ height: 22 }} />
                  <QuizRow label={pool.q2} opts={pool.q2opts} value={q2} onPick={setQ2} />
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
  const setFlag = (k: 'autoplay' | 'quizEnabled', v: boolean) => vitrineConfigStore.set((c) => ({ ...c, [k]: v }));

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
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18, alignItems: 'start' }}>
      {/* Colonne gauche · la cliente + réglages globaux */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--color-obsidian)', borderRadius: 4, padding: '22px', color: 'var(--color-ivoire)' }}>
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
          <SwitchRow label="Quiz sur-mesure (IA)" sub="Deux questions à rotation, puis une reco." on={cfg.quizEnabled} onToggle={(v) => setFlag('quizEnabled', v)} />
        </div>
      </div>

      {/* Colonne droite · la curation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="trc-microlabel" style={{ color: 'var(--color-copper)' }}>La régie de la vitrine</div>
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
        <div style={{ background: 'var(--grad-obsidian, linear-gradient(135deg,#1b1b23,#14141b))', borderRadius: 4, padding: '22px 24px 26px', color: 'var(--color-ivoire)' }}>
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
      </div>
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
