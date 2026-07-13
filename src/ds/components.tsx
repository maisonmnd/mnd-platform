import { asset } from '../shared/asset';
import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/* MND — primitives React partagées. Styles dans ds.css. */

export function Eyebrow({ children, invert }: { children: ReactNode; invert?: boolean }) {
  return (
    <div className="mnd-eyebrow" style={invert ? { color: 'var(--copper-300)' } : undefined}>
      {children}
    </div>
  );
}

type BtnVariant = 'indigo' | 'copper' | 'ghost' | 'ghost-invert' | 'obsidian';
export function Button({
  variant = 'indigo',
  size,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg' }) {
  const cls = [
    'mnd-btn',
    variant !== 'indigo' ? `mnd-btn--${variant}` : '',
    size ? `mnd-btn--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button className={cls} {...rest} />;
}

export function Card({
  children,
  filet,
  deep,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode;
  filet?: 'copper' | 'indigo';
  deep?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const cls = [
    'mnd-card',
    filet === 'copper' ? 'mnd-card--filet' : '',
    filet === 'indigo' ? 'mnd-card--filet-indigo' : '',
    deep ? 'mnd-card--deep' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  delta,
  trend,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  trend?: 'up' | 'down';
  hint?: ReactNode;
}) {
  return (
    <div className="mnd-stat">
      <div className="mnd-stat__label">{label}</div>
      <div className="mnd-stat__value">{value}</div>
      {delta != null && (
        <div className={`mnd-stat__delta ${trend ? `mnd-stat__delta--${trend}` : ''}`}>
          {trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}
          {delta}
          {hint != null && <span style={{ float: 'right' }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="mnd-field">
      <span className="mnd-field__label">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="mnd-input" {...props} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="mnd-select" {...props} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="mnd-textarea" {...props} />;
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'copper' | 'indigo' | 'solid';
}) {
  return <span className={`mnd-badge ${tone ? `mnd-badge--${tone}` : ''}`}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="mnd-tag">{children}</span>;
}

/** Sceau couronne — monogramme de la maison, 5 couleurs. */
export function Seal({
  color = 'indigo',
  size = 40,
  style,
}: {
  color?: 'indigo' | 'copper' | 'ivoire' | 'obsidian' | 'or';
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={asset(`/assets/monograms/mono-${color}.png`)}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block', ...style }}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  width,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="mnd-overlay" onClick={onClose}>
      <div
        className="mnd-modal"
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mnd-modal__head">
          <div className="mnd-modal__title">{title}</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}
          >
            ✕
          </button>
        </div>
        <div className="mnd-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function Segs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mnd-segs">
      {options.map((o) => (
        <button
          key={o.value}
          className={`mnd-seg ${o.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
