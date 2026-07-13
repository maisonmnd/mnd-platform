import type { ReactNode } from 'react';
import { Eyebrow } from '../../../ds/components';

/** En-tête de page standard du Trône. */
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tr-page-head" style={actions ? { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 } : undefined}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 12, flex: 'none' }}>{actions}</div>}
    </div>
  );
}
