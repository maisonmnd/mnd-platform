import type { ReactNode } from 'react';
import { Eyebrow } from '../../../ds/components';

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
