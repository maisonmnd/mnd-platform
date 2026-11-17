/* LE BADGE « SUGGÉRÉ » — 15 novembre 2026 (le rendez-vous suggéré,
   shared/rendez-vous-suggere-pur.ts). À côté du nom, au Carnet et au
   Calendrier : la Maison l'a proposé, elle n'a pas encore dit oui. La tuile
   se dessine en pointillés cuivre (`est-suggere`) ; il devient plein,
   « Confirmé », à son « Je confirme » ou quand le comptoir note son oui.
   Maquette PeiD4o4yfCY4GajdGJ52Ez, « Au Carnet ».

   ET LE BADGE « EN ATTENTE » — 17 novembre 2026 (le rendez-vous en attente,
   shared/rendez-vous-en-attente-pur.ts). Un rendez-vous pris en ligne naît en
   attente : la place est tenue deux heures, elle se confirme par son
   « Je confirme » sur WhatsApp (et son acompte, quand un geste en porte un).
   La même tuile en pointillés, un autre mot : « En attente », avec l'heure où
   la place se libère au survol. Libérée, la tuile annulée le dit : « Place
   libérée ». Un rendez-vous confirmé ne porte aucun badge. */
import { jourCourtAn } from '../../../../shared/calendrier';
import { fmtMoney } from '../../../../shared/currency';
import { useBranch } from '../../../../shared/branches';
import { ceQueDitLaSuggestion, estSuggere, type MarquesDeLaSuggestion } from '../../../../shared/rendez-vous-suggere-pur';
import { ceQueDitLAttente, estEnAttente, etatDeLAttente, type MarquesDeLAttente } from '../../../../shared/rendez-vous-en-attente-pur';

const aujourdhuiIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type Marques = MarquesDeLaSuggestion & MarquesDeLAttente;

/** La classe de la tuile : pointillés cuivre tant qu'elle n'a pas dit oui, ou
    que son acompte n'est pas reçu. */
export const classeDuSuggere = (a: Marques): string => (estSuggere(a) || estEnAttente(a) ? 'est-suggere' : '');

const STYLE_DU_BADGE = {
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
} as const;

export function BadgeSuggere({ a }: { a: Marques & { date?: string } }) {
  const { currency } = useBranch();
  const court = (iso: string): string => jourCourtAn(iso).replace(/^\S+\s/, '');
  /* NÉ EN ATTENTE D'UNE PORTE EN LIGNE : son état d'abord, il dit plus juste que « Suggéré ». */
  const attente = etatDeLAttente(a);
  if (attente === 'sans-reponse' || attente === 'acompte' || attente === 'liberee') {
    const dit = ceQueDitLAttente(a, { court, francs: (x) => fmtMoney(x, currency) });
    return (
      <span
        className={attente === 'liberee' ? 'trc-badge-liberee' : 'trc-badge-suggere trc-badge-attente'}
        title={attente === 'liberee' ? `${dit}.` : `${dit}. Pris en ligne : la place se libère seule sans son oui.`}
        style={attente === 'liberee' ? { ...STYLE_DU_BADGE, border: '1px solid var(--line, rgba(0,0,0,.18))', color: 'inherit', opacity: 0.75 } : STYLE_DU_BADGE}
      >
        {attente === 'liberee' ? 'Place libérée' : 'En attente'}
      </span>
    );
  }
  if (!estSuggere(a)) return null;
  const dit = ceQueDitLaSuggestion(a, { court, aujourdhui: aujourdhuiIso() });
  return (
    <span
      className="trc-badge-suggere"
      title={`${dit}. Suggéré par la Maison : elle ne l’a pas encore confirmé.`}
      style={STYLE_DU_BADGE}
    >
      Suggéré
    </span>
  );
}
