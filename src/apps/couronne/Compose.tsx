import { asset } from '../../shared/asset';
import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { composeStore, type ComposePayload } from '../../shared/bridges';
import { uid } from '../../shared/store';
import { fmtDuration, useClient, useVisibleCatalog } from './lib';

/* RITUEL SUR-MESURE — mix & match.
   Ponctuel −10 % · Abonnement −15 % (SÍNSIN/FÍNFÍN/GBÈZÀ, 3 prestations minimum).
   « Composer » publie le payload sur le pont mnd_couronne_compose → Le Trône. */

const ABO_CATS = ['sinsin', 'finfin', 'gbeza'];

type Props = { onClose: () => void; toast: (msg: string) => void };

export default function Compose({ onClose, toast }: Props) {
  const { currency } = useBranch();
  const { cats, services } = useVisibleCatalog();
  const client = useClient();

  const [mode, setMode] = useState<'ponctuel' | 'abonnement'>('ponctuel');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [done, setDone] = useState<ComposePayload | null>(null);

  /* Prestations composables : visibles, prix affichable. */
  const groups = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, items: services.filter((s) => s.categoryId === c.id && !s.hidePrice) }))
        .filter((g) => g.items.length > 0),
    [cats, services]
  );
  const activeGroups = mode === 'abonnement' ? groups.filter((g) => ABO_CATS.includes(g.cat.id)) : groups;

  const switchMode = (m: 'ponctuel' | 'abonnement') => {
    setMode(m);
    if (m === 'abonnement') {
      /* L'abonnement est réservé aux soins — les autres lignes quittent la composition. */
      setQty((prev) => {
        const next: Record<string, number> = {};
        for (const [id, q] of Object.entries(prev)) {
          const s = services.find((x) => x.id === id);
          if (s && ABO_CATS.includes(s.categoryId)) next[id] = q;
        }
        return next;
      });
    }
  };

  const lines = activeGroups.flatMap((g) =>
    g.items
      .filter((s) => (qty[s.id] ?? 0) > 0)
      .map((s) => ({ service: s, cat: g.cat, q: qty[s.id], line: s.priceXof * qty[s.id] }))
  );
  const count = lines.reduce((a, l) => a + l.q, 0);
  const subtotal = lines.reduce((a, l) => a + l.line, 0);
  const discountPct = mode === 'abonnement' ? 15 : 10;
  const discount = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discount;
  const aboBlocked = mode === 'abonnement' && count < 3;
  const canCompose = count > 0 && !aboBlocked;

  const bump = (id: string, d: 1 | -1) =>
    setQty((prev) => {
      const next = { ...prev };
      const q = Math.max(0, Math.min(12, (next[id] ?? 0) + d));
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });

  const compose = () => {
    if (!canCompose) return;
    const payload: ComposePayload = {
      id: uid(),
      createdAt: new Date().toISOString(),
      client: client?.name ?? 'Cliente Ma Couronne',
      mode,
      discountPct,
      items: lines.map((l) => ({
        service: (l.q > 1 ? `${l.q}× ` : '') + l.service.name,
        category: l.cat.fon,
        priceXof: l.line,
      })),
      totalXof: total,
    };
    composeStore.set(payload);
    setDone(payload);
    toast(mode === 'abonnement' ? 'Abonnement sur-mesure transmis.' : 'Rituel sur-mesure transmis.');
  };

  /* ================= CONFIRMATION ================= */
  if (done) {
    const doneSubtotal = done.items.reduce((a, l) => a + l.priceXof, 0);
    const doneDiscount = doneSubtotal - done.totalXof;
    return (
      <div className="mc-overlayscreen mc-slide">
        <div className="mc-confirm mc-rise" style={{ margin: 'auto 0', padding: '0 24px' }}>
          <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 46, opacity: 0.92 }} />
          <h2 style={{ marginTop: 18 }}>Transmis au Trône.</h2>
          <p>
            Votre composition est entre les mains de la maison. Elle revient vers vous sur WhatsApp pour sceller
            les créneaux, mèche après mèche.
          </p>
          <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
            <div className="mc-recapcard__name">
              {done.mode === 'abonnement' ? 'Mon abonnement sur-mesure' : 'Mon rituel sur-mesure'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {done.items.map((l, i) => (
                <div key={i} className="mc-recapcard__line">
                  <span>{l.service}</span>
                  <span>{fmtMoney(l.priceXof, currency)}</span>
                </div>
              ))}
            </div>
            <div className="mc-hairline" />
            <div className="mc-recapcard__line mc-recapcard__line--deal">
              <span>{done.mode === 'abonnement' ? 'Avantage abonné' : 'Avantage ponctuel'} · −{done.discountPct} %</span>
              <span>− {fmtMoney(doneDiscount, currency)}</span>
            </div>
            <div className="mc-recapcard__total">
              <span>Total</span>
              <span>{fmtMoney(done.totalXof, currency)}{done.mode === 'abonnement' ? <em> / cycle</em> : null}</span>
            </div>
          </div>
          <button className="mc-cta mc-cta--indigo" style={{ marginTop: 22 }} onClick={onClose}>
            Revenir à l’accueil
          </button>
        </div>
      </div>
    );
  }

  /* ================= COMPOSITION ================= */
  return (
    <div className="mc-overlayscreen mc-slide">
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <span className="mc-micro-eyebrow">Sur-mesure · vous composez</span>
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <h1 className="mc-flowhead__h1" style={{ marginTop: 6 }}>Votre rituel, votre signature.</h1>

        <div className="mc-modetoggle">
          <button className={`mc-mode ${mode === 'ponctuel' ? 'is-ritual' : ''}`} onClick={() => switchMode('ponctuel')}>
            <span className="mc-mode__name">Ponctuel</span>
            <span className="mc-mode__sub">−10 % · une fois</span>
          </button>
          <button className={`mc-mode ${mode === 'abonnement' ? 'is-abo' : ''}`} onClick={() => switchMode('abonnement')}>
            <span className="mc-mode__name">Abonnement</span>
            <span className="mc-mode__sub">−15 % · soins SÍNSIN · FÍNFÍN · GBÈZÀ</span>
          </button>
        </div>
      </div>

      <div className="mc-scroll mc-flowbody" style={{ paddingBottom: 8 }}>
        {activeGroups.map((g) => (
          <div key={g.cat.id} className="mc-cmgroup">
            <div className="mc-cmgroup__head">
              <span className="mc-cmgroup__fon">{g.cat.fon}</span>
              <span className="mc-cmgroup__sub">{g.cat.label}</span>
            </div>
            <div className="mc-stack" style={{ gap: 7 }}>
              {g.items.map((s) => {
                const q = qty[s.id] ?? 0;
                return (
                  <div key={s.id} className={`mc-cmitem ${q > 0 ? 'is-on' : ''}`}>
                    <div className="mc-cmitem__body">
                      <div className="mc-cmitem__name">{s.name}</div>
                      <div className="mc-cmitem__meta">
                        {fmtDuration(s.durationMin)} · {s.sessions} séance{s.sessions > 1 ? 's' : ''} · {fmtMoney(s.priceXof, currency)}
                      </div>
                    </div>
                    <div className="mc-cmitem__qty">
                      <button
                        className="mc-qtybtn mc-qtybtn--minus"
                        disabled={q === 0}
                        aria-label={`Retirer ${s.name}`}
                        onClick={() => bump(s.id, -1)}
                      >
                        −
                      </button>
                      <span className={`mc-cmitem__count ${q > 0 ? 'is-on' : ''}`}>{q}</span>
                      <button
                        className={`mc-qtybtn mc-qtybtn--plus ${q > 0 ? 'is-on' : ''}`}
                        aria-label={`Ajouter ${s.name}`}
                        onClick={() => bump(s.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* -------- pied collant : totaux + verrou abonnement -------- */}
      <div className="mc-cmfooter">
        {count > 0 && (
          <>
            <div className="mc-cmfooter__row"><span>Sous-total</span><span>{fmtMoney(subtotal, currency)}</span></div>
            <div className="mc-cmfooter__row mc-cmfooter__row--deal">
              <span>{mode === 'abonnement' ? 'Avantage abonné' : 'Avantage ponctuel'} · −{discountPct} %</span>
              <span>− {fmtMoney(discount, currency)}</span>
            </div>
          </>
        )}
        <div className="mc-cmfooter__total">
          <span>{count} prestation{count > 1 ? 's' : ''}</span>
          <strong>
            {fmtMoney(total, currency)}
            {mode === 'abonnement' ? <em> / cycle</em> : null}
          </strong>
        </div>
        {aboBlocked && (
          <div className="mc-cmfooter__hint">
            <span>⚑</span>
            <span>Abonnement · 3 prestations minimum ({count}/3) — complétez vos soins pour activer l’avantage −15 %.</span>
          </div>
        )}
        {count === 0 && !aboBlocked && (
          <div className="mc-cmfooter__hint mc-cmfooter__hint--soft">Ajoutez au moins une prestation pour composer.</div>
        )}
        <button className={`mc-cta ${canCompose ? 'mc-cta--indigo' : 'mc-cta--locked'}`} disabled={!canCompose} onClick={compose}>
          Composer · transmettre au Trône
        </button>
      </div>
    </div>
  );
}
