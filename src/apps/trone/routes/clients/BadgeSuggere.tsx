/* LE BADGE « SUGGÉRÉ » — 15 novembre 2026 (le rendez-vous suggéré,
   shared/rendez-vous-suggere-pur.ts). À côté du nom, au Carnet et au
   Calendrier : la Maison l'a proposé, elle n'a pas encore dit oui. La tuile
   se dessine en pointillés cuivre (`est-suggere`) ; il devient plein,
   « Confirmé », à son « Je confirme » ou quand le comptoir note son oui.
   Maquette PeiD4o4yfCY4GajdGJ52Ez, « Au Carnet ». */
import { jourCourtAn } from '../../../../shared/calendrier';
import { ceQueDitLaSuggestion, estSuggere, type MarquesDeLaSuggestion } from '../../../../shared/rendez-vous-suggere-pur';

const aujourdhuiIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** La classe de la tuile : pointillés cuivre tant qu'elle n'a pas dit oui. */
export const classeDuSuggere = (a: MarquesDeLaSuggestion): string => (estSuggere(a) ? 'est-suggere' : '');

export function BadgeSuggere({ a }: { a: MarquesDeLaSuggestion & { date?: string } }) {
  if (!estSuggere(a)) return null;
  const dit = ceQueDitLaSuggestion(a, { court: (iso) => jourCourtAn(iso).replace(/^\S+\s/, ''), aujourdhui: aujourdhuiIso() });
  return (
    <span
      className="trc-badge-suggere"
      title={`${dit}. Suggéré par la Maison : elle ne l’a pas encore confirmé.`}
      style={{
        display: 'inline-block',
        marginLeft: 6,
        padding: '0 6px',
        border: '1px dashed var(--color-copper)',
        borderRadius: 2,
        color: 'var(--copper-700)',
        fontSize: 9.5,
        lineHeight: '15px',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        fontWeight: 600,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      Suggéré
    </span>
  );
}
