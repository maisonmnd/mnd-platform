import type { ReactNode } from 'react';

/* Petites pièces partagées des modules Équipe & Croissance / Système.
   Styles : equipe.css (tre-) — importé par les routes. */

/** Onglets filet cuivre — la grammaire des écrans du Trône. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { k: T; l: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="tre-tabs">
      {tabs.map((t) => (
        <button
          key={t.k}
          className={`tre-tab ${t.k === value ? 'is-active' : ''}`}
          onClick={() => onChange(t.k)}
        >
          {t.l}
        </button>
      ))}
    </div>
  );
}

/** Interrupteur — piste cuivre quand ouvert. */
export function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: ReactNode }) {
  return (
    <button className={`tre-toggle ${on ? 'is-on' : ''}`} onClick={onToggle} type="button" aria-pressed={on}>
      <span className="tre-toggle__track">
        <span className="tre-toggle__knob" />
      </span>
      {label != null && <span className="tre-toggle__label">{label}</span>}
    </button>
  );
}

/** Barre de progression fine. */
export function Bar({ pct, fill }: { pct: number; fill?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className="tre-bar">
      <span className="tre-bar__fill" style={{ width: `${w}%`, background: fill ?? 'var(--color-copper)' }} />
    </span>
  );
}

/** Jauge cuivre — arc SVG tracé à la main, valeur en Cormorant. */
export function Gauge({ value, max = 100, label, size = 92 }: { value: number; max?: number; label: ReactNode; size?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 38;
  const c = Math.PI * r; // demi-cercle
  const stroke = c * pct;
  return (
    <div className="tre-gauge" style={{ width: size }}>
      <svg viewBox="0 0 100 58" width={size} height={size * 0.58} aria-hidden="true">
        <path d="M 12 52 A 38 38 0 0 1 88 52" fill="none" stroke="var(--hairline)" strokeWidth="5" />
        <path
          d="M 12 52 A 38 38 0 0 1 88 52"
          fill="none"
          stroke="var(--color-copper)"
          strokeWidth="5"
          strokeDasharray={`${stroke} ${c}`}
        />
      </svg>
      <div className="tre-gauge__value">{value}</div>
      <div className="tre-gauge__label">{label}</div>
    </div>
  );
}

/** Bandeau obsidienne — la voix éditoriale de la Maison. */
export function DeepNote({ eyebrow, children, actions }: { eyebrow?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tre-deep">
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow != null && <div className="tre-deep__eyebrow">{eyebrow}</div>}
        <div className="tre-deep__body">{children}</div>
      </div>
      {actions != null && <div className="tre-deep__actions">{actions}</div>}
    </div>
  );
}

/** Pastille de statut. */
export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'error' | 'muted' | 'copper'; children: ReactNode }) {
  return <span className={`tre-pill tre-pill--${tone}`}>{children}</span>;
}
