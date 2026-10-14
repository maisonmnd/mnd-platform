import type { ReactNode } from 'react';
import { useAuth, useStaff as useMaTete } from '../../../../../shared/auth';
import { dateDite, ecartEnJours } from '../../../../../shared/rh-pur';
import '../../pilotage/pilotage.css';
import './rh.css';

/* ══ LES PIÈCES COMMUNES DES ONGLETS RH — 14 octobre 2026 ══════════════
   Les lignes se replient (résumé sur la ligne, un seul panneau ouvert),
   comme tout écran en liste de la Maison : mêmes classes que le secrétariat. */

export function Repliee({ ouverte, surBascule, num, titre, sous, badge, urgent, fait, children }: {
  ouverte: boolean; surBascule: () => void; num: ReactNode; titre: ReactNode; sous?: ReactNode; badge?: ReactNode;
  urgent?: boolean; fait?: boolean; children?: ReactNode;
}) {
  return (
    <div className={`sad-ligne${ouverte ? ' est-ouverte' : ''}`}>
      <button type="button" className="sad-ligne__tete" aria-expanded={ouverte} onClick={surBascule}>
        <span className="sad-ligne__num">{num}</span>
        <span className="sad-ligne__quoi"><b>{titre}</b>{sous ? <small>{sous}</small> : null}</span>
        {badge ? <span className={`sad-badge${urgent ? ' est-urgent' : ''}${fait ? ' est-fait' : ''}`}>{badge}</span> : <span />}
      </button>
      {ouverte && children ? <div className="sad-ligne__corps">{children}</div> : null}
    </div>
  );
}

/** « dans 7 jours », « demain », « aujourd’hui », « dépassé de 2 jours ». */
export function rappelRh(date: string | undefined, jour: string): { badge?: string; urgent?: boolean } {
  if (!date) return {};
  const n = ecartEnJours(jour, date);
  if (n < 0) return { badge: `dépassé de ${-n} jour${n < -1 ? 's' : ''}`, urgent: true };
  if (n === 0) return { badge: 'aujourd’hui', urgent: true };
  if (n === 1) return { badge: 'demain', urgent: true };
  return { badge: `dans ${n} jours`, urgent: n <= 7 };
}

/** Une case à cocher datée : cochée, elle dit le jour où c'est fait. */
export function Coche({ fait, texte, surBascule, aide, desactivee }: {
  fait?: string; texte: ReactNode; surBascule: () => void; aide?: ReactNode; desactivee?: boolean;
}) {
  return (
    <label className="rh-coche">
      <input type="checkbox" checked={!!fait} disabled={desactivee} onChange={surBascule} />
      <span>
        {texte}
        {fait ? <small> · fait le {dateDite(fait)}</small> : null}
        {aide ? <small className="rh-coche__aide">{aide}</small> : null}
      </span>
    </label>
  );
}

export function Compteurs({ items }: { items: { n: ReactNode; dit: string; alerte?: boolean; surClic?: () => void }[] }) {
  return (
    <div className="sad-compteurs">
      {items.map((c) => (
        <button key={c.dit} type="button" className={`sad-compteur${c.alerte ? ' rh-alerte' : ''}`} onClick={c.surClic} disabled={!c.surClic}>
          <b>{c.n}</b><span className="sad-doux">{c.dit}</span>
        </button>
      ))}
    </div>
  );
}

/** Le jour local, AAAA-MM-JJ. */
export const aujourdhuiRh = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Qui écrit : l'id du compte, pour la trace. */
export function useQuiEcrit(): { moi: string; souverain: boolean } {
  const { session } = useAuth();
  const me = useMaTete();
  return { moi: session?.user?.id ?? '', souverain: me?.role === 'souverain' };
}

/** Ce qui reste à confirmer se dit, en cuivre pointillé. */
export function AConfirmer({ children }: { children: ReactNode }) {
  return <span className="rh-a-confirmer">{children}</span>;
}
