import { useMemo } from 'react';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { invoiceTotal, useInvoices } from '../../../../shared/finance';
import { useVisios } from '../../../../shared/visios';
import { LIBELLE_DE_LA_DEDUCTION, mesureDeLaConsultation, pourcentDit } from '../../../../shared/mesure-de-la-consultation-pur';

/* ══ LA MESURE — 13 novembre 2026 (la Consultation, lot 4) ═════════════════
   En tête de Consultations, sur quatre-vingt-dix jours : A, B, C, l'entonnoir
   des devis nés d'une consultation, et l'écart entre l'estimation du site et
   le prix ferme. Des chiffres et des filets, pas de graphique de librairie. */

const JOURS = 90;
const lab = { fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)', fontWeight: 600 };
const chiffre = { fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, lineHeight: 1.1, color: 'var(--color-indigo)' };

export function ConsultationsMesure() {
  const [queue] = useStore(consultationsQueueStore);
  const [invoices] = useInvoices();
  const { visios } = useVisios();
  const { currency } = useBranch();
  const m = useMemo(() => mesureDeLaConsultation(
    queue,
    invoices.filter((i) => i.kind === 'devis').map((i) => ({
      id: i.id, kind: i.kind, status: i.status, date: i.date, consultationId: i.consultationId, totalXof: invoiceTotal(i),
      deduitXof: i.discountLabel === LIBELLE_DE_LA_DEDUCTION ? i.globalDiscountXof ?? 0 : 0,
    })),
    visios,
    Date.now() - JOURS * 86_400_000,
  ), [queue, invoices, visios]);
  if (!m.gratuites && !m.visios.reservees) return null;

  /* L'entonnoir : trois filets, la largeur de chacun relative au premier. */
  const etapes = [
    { dit: 'estimés', n: m.devis.estimes },
    { dit: 'confirmés', n: m.devis.confirmes },
    { dit: 'payés', n: m.devis.payes },
  ];
  const haut = Math.max(1, m.gratuites);

  return (
    <section style={{ marginBottom: 26, border: '1px solid var(--hairline)', borderRadius: 3, background: 'var(--surface-card)', padding: '14px 16px', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>La mesure</span>
        <span className="mnd-muted" style={{ fontSize: 12 }}>{JOURS} derniers jours · ce que la consultation rapporte</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <div><div style={lab}>A · gratuites</div><div style={chiffre}>{m.gratuites}</div><div className="mnd-muted" style={{ fontSize: 12 }}>déposées sur le site</div></div>
        <div><div style={lab}>B · visios</div><div style={chiffre}>{m.visios.reservees}</div><div className="mnd-muted" style={{ fontSize: 12 }}>{m.visios.tenues} tenue{m.visios.tenues > 1 ? 's' : ''} · {m.visios.manquees} manquée{m.visios.manquees > 1 ? 's' : ''}</div></div>
        <div><div style={lab}>C · privées réglées</div><div style={chiffre}>{m.reglees}</div><div className="mnd-muted" style={{ fontSize: 12 }}>{fmtMoney(m.encaisseXof, currency)} encaissés</div></div>
        <div>
          <div style={lab}>Écart estimation · prix ferme</div>
          <div style={chiffre}>{m.ecart.moyennePct === null ? '—' : pourcentDit(m.ecart.moyennePct)}</div>
          <div className="mnd-muted" style={{ fontSize: 12 }}>{m.ecart.n ? `${m.ecart.n} devis ferme${m.ecart.n > 1 ? 's' : ''} · ${m.ecart.dansLaFourchette} dans la fourchette` : 'aucun devis ferme encore'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={lab}>Les devis nés d’une consultation</div>
        {etapes.map((e) => (
          <div key={e.dit} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 36px', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span>{e.dit}</span>
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" style={{ width: '100%', height: 4 }} aria-hidden="true">
              <rect x="0" y="0" width="100" height="4" rx="1" fill="var(--hairline)" />
              <rect x="0" y="0" width={Math.min(100, (e.n / haut) * 100)} height="4" rx="1" fill="var(--copper-500)" />
            </svg>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.n}</span>
          </div>
        ))}
        <p className="mnd-muted" style={{ fontSize: 12, margin: 0 }}>Chaque filet se lit sur les {m.gratuites} consultation{m.gratuites > 1 ? 's' : ''} gratuite{m.gratuites > 1 ? 's' : ''} de la période. Un écart qui reste grand dit où corriger les seuils et les fourchettes.</p>
      </div>
    </section>
  );
}
