import { asset } from '../shared/asset';
import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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

/* UN CHAMP — et le piège que ce composant portait depuis le début (14 août).

   `Field` enveloppe son contenu dans un `<label>`. Or un `<label>` sans `for`
   transmet TOUT clic à son PREMIER descendant étiquetable — et un `<button>`
   en est un. Partout où un champ porte des pastilles (le mode de prix, le
   palier, les membres d'un compte, la remise famille…), cliquer sur le
   libellé ou dans le vide à côté APPUYAIT sur la première pastille : le taux
   personnalisé saisi redevenait le barème, le premier membre devenait payeur,
   le mode de prix retombait sur le premier. Rien ne le disait, et la main
   croyait à un caprice de l'écran.

   On garde le `<label>` — il nomme le champ pour les lecteurs d'écran — mais
   on coupe le renvoi : un clic hors commande donne le focus au premier vrai
   champ de saisie, et n'actionne plus jamais un bouton. */
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLLabelElement>(null);
  return (
    <label
      ref={ref}
      className="mnd-field"
      onClick={(e) => {
        /* Clic sur une vraie commande : elle fait son travail, on ne touche à rien. */
        if ((e.target as HTMLElement).closest('input, select, textarea, button, a, [role="button"]')) return;
        e.preventDefault();
        ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
      }}
    >
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
  /* Échap ferme (intention explicite). Le clic sur le voile NE ferme PLUS : au
     comptoir, un clic à 5 px de la modale effaçait sans confirmation un
     encaissement en cours de saisie (montant, pourboire, acompte coché). La
     fermeture passe par ✕ ou Échap — jamais par accident. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="mnd-overlay">
      <div
        className="mnd-modal"
        role="dialog"
        aria-modal="true"
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
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

/** Toast non bloquant — pour les confirmations de succès. Un `window.alert`
    ajoute un clic « OK » à l'action la plus fréquente du comptoir et casse la
    marque ; le toast informe sans rien interrompre. Réserver l'alert aux
    erreurs qui DOIVENT être vues (ex. pourboire non attribuable). */
export function toast(message: string, ms = 3800): void {
  const el = document.createElement('div');
  el.className = 'mnd-toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 400);
  }, ms);
}
