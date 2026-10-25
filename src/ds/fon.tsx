import { Fragment } from 'react';
import { morceauxDuFon } from './fon-pur';

/** La devise (ou tout texte fon) avec l'accent de « nyɔ́ » dessiné au-dessus
    du ɔ (règle : fon-pur.ts, feuille : tokens/fonts.css). `penche` : le texte
    est en italique, l'accent penche avec lui. */
export function TexteFon({ texte, penche }: { texte: string; penche?: boolean }) {
  return (
    <>
      {morceauxDuFon(texte).map((m, i) => (m.oa
        ? <span key={i} className={penche ? 'fon-oa fon-oa--penche' : 'fon-oa'}>{m.t}</span>
        : <Fragment key={i}>{m.t}</Fragment>))}
    </>
  );
}
