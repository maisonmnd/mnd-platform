import type { ReactNode, CSSProperties } from 'react';
import { Eyebrow } from '../../../ds/components';
import { signeLeMessage } from '../../../shared/identite';

/** Un lien WhatsApp prêt à l'emploi : ouvre WhatsApp avec le numéro et un
    message pré-écrit (signé de la devise). Ne s'affiche pas sans numéro joignable. */
export function WaLien({ phone, message, children = 'WhatsApp', style }: {
  phone?: string;
  message: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(signeLeMessage(message))}`}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'none', ...style }}
    >
      {children}
    </a>
  );
}

/** En-tête de page standard du Trône. */
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`tr-page-head${actions ? ' tr-page-head--actions' : ''}`}>
      <div className="tr-page-head__head">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="tr-page-head__actions">{actions}</div>}
    </div>
  );
}
