import { asset } from '../shared/asset';
import { TELEPHONE_PAYS, decoupeTelephone } from '../shared/geo';
import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/* MND — primitives React partagées. Styles dans ds.css. */

/* LA QUESTION DE LA MAISON SE PREND ICI — 22 septembre 2026. Elle vit dans
   `ds/demande.tsx`, mais les quatre-vingt-neuf écrans qui la posent importent
   déjà `ds/components` : la faire passer par la même porte évite d'ajouter
   une ligne d'import à chacun, et surtout évite qu'on la cherche. */
export { demande, type DemandeDeLaMaison } from './demande';

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

/* CHAMP TÉLÉPHONE — indicatif du pays + numéro local (25 août). Le menu pose
   l'indicatif (défaut : le pays de la branche) ; on ne tape que le numéro local,
   et la valeur est stockée au format international (« +33 6 12 34 56 78 »), ce
   qui fiabilise les liens WhatsApp. Les Antilles (Guadeloupe/Martinique) et les
   voisins de la diaspora sont dans la liste ; un indicatif hors liste déjà
   enregistré s'affiche quand même. */
export function ChampTelephone({ value, onChange, dialDefaut, id }: {
  value: string;
  onChange: (v: string) => void;
  dialDefaut: string;
  id?: string;
}) {
  const { dial, local } = decoupeTelephone(value, dialDefaut);
  const options = TELEPHONE_PAYS.some((p) => p.dial === dial)
    ? TELEPHONE_PAYS
    : [{ name: dial, dial }, ...TELEPHONE_PAYS];
  const compose = (d: string, l: string) => `${d} ${l}`.trim();
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <Select
        value={dial}
        onChange={(e) => onChange(compose(e.target.value, local))}
        aria-label="Indicatif du pays"
        style={{ maxWidth: 176, flex: '0 0 auto' }}
      >
        {options.map((p) => (
          <option key={`${p.name}-${p.dial}`} value={p.dial}>{p.name} {p.dial}</option>
        ))}
      </Select>
      <Input
        id={id}
        value={local}
        onChange={(e) => onChange(compose(dial, e.target.value))}
        placeholder="numéro"
        inputMode="tel"
        autoComplete="tel-national"
        style={{ flex: 1, minWidth: 0 }}
      />
    </div>
  );
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
  poseLeBandeau(message, ms, false);
}

/** UNE ALERTE N'EST PAS UNE RÉUSSITE — 22 septembre 2026.

    Trente-cinq `window.alert` disaient les refus de la Maison : une commande
    qui ne part pas, un fichier illisible, une caisse qu'on ne peut pas
    fermer. Or le navigateur propose, au bout de deux ou trois fenêtres,
    de « ne plus afficher de boîtes de dialogue sur cette page ». Qui coche,
    par réflexe, ne voit PLUS AUCUN de ces refus : le geste échoue en silence
    et l'on croit qu'il est passé. C'est la leçon d'Accès du 5 septembre,
    jamais appliquée ailleurs.

    Pourquoi un bandeau à part plutôt que `toast` : un refus qu'on doit lire
    et une réussite qu'on peut manquer n'ont ni la même urgence ni le même
    temps de lecture. Celui-ci se tient plus longtemps, porte la brique de la
    Maison, et s'annonce en `role="alert"` pour que les lecteurs d'écran
    l'interrompent au lieu d'attendre leur tour. */
export function alerte(message: string, ms = 7000): void {
  poseLeBandeau(message, ms, true);
}

/** UN REFUS SANS MOTIF RESTE UN REFUS — 22 septembre 2026.

    Les gestes de la Maison rendent `{ ok, erreur? }`, où le motif est
    FACULTATIF : rien, dans le type, n'oblige un refus à dire pourquoi. Tant
    que ces messages passaient par `window.alert`, un refus muet affichait
    « undefined » en pleine figure, et personne ne l'a jamais signalé, parce
    qu'une fenêtre qu'on ferme vite ne se raconte pas.

    Ici, un refus muet le dit. La phrase est volontairement gênante : elle
    désigne un trou à combler dans le geste qui a refusé, au lieu de le
    masquer derrière un « une erreur est survenue » qui n'apprend rien.

    ⚠ Le vrai remède est ailleurs : lier `ok: false` à un motif obligatoire
    dans les types de `shared/`. Ce jour-là, cette fonction deviendra inutile
    et c'est très bien. */
export const refus = (motif?: string): void =>
  alerte(motif?.trim() || 'Ce geste n’a pas pu être fait, et la Maison n’a pas dit pourquoi.');

/** LES BANDEAUX S'EMPILENT, ILS NE SE RECOUVRENT PAS — 22 septembre 2026.

    `window.alert` faisait la queue : deux refus d'affilée se lisaient l'un
    après l'autre. Un bandeau, lui, est posé à un endroit fixe, et le second
    masquerait le premier sans laisser de trace. Or un message qu'on ne voit
    pas est pire que pas de message : l'écran a l'air d'avoir répondu.

    Chaque nouveau bandeau se pose donc AU-DESSUS de ceux qui tiennent
    encore. La hauteur se lit sur le document, jamais dans un compteur en
    mémoire : un bandeau peut disparaître avant les autres, et un compteur
    se serait décalé au premier départ. */
const HAUTEUR_DU_BANDEAU = 54;

function poseLeBandeau(message: string, ms: number, estUneAlerte: boolean): void {
  const el = document.createElement('div');
  el.className = estUneAlerte ? 'mnd-toast mnd-toast--alerte' : 'mnd-toast';
  el.setAttribute('role', estUneAlerte ? 'alert' : 'status');
  const deja = document.querySelectorAll('.mnd-toast:not(.is-out)').length;
  if (deja > 0) el.style.bottom = `${26 + deja * HAUTEUR_DU_BANDEAU}px`;
  /* LE TEXTE, PAS DU HTML : ces messages portent des noms saisis à la main
     (une cliente, une caisse, un motif), qui ne doivent jamais être lus
     comme du balisage. */
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 400);
  }, ms);
}
