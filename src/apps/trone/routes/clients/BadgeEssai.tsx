/* LE PETIT BADGE « ESSAI » — 7 novembre 2026 (fiches d'essai, shared/essai-pur.ts).
   À côté du nom d'une cliente d'essai, dans la fiche, le calendrier et la liste
   des conversations : on voit d'un coup d'œil que rien de cette fiche ne
   compte. Cuivre sur fond clair, jamais de rouge ni de vert. */
import { MOT_ESSAI } from '../../../../shared/essai-pur';

export function BadgeEssai({ titre }: { titre?: string }) {
  return (
    <span
      className="trc-badge-essai"
      title={titre ?? 'Fiche d’essai : rien de ses rendez-vous ni de ses paiements ne compte'}
      style={{
        display: 'inline-block',
        marginLeft: 6,
        padding: '0 6px',
        border: '1px solid var(--color-copper)',
        borderRadius: 2,
        color: 'var(--color-copper)',
        fontSize: 9.5,
        lineHeight: '15px',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        fontWeight: 600,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {MOT_ESSAI}
    </span>
  );
}
