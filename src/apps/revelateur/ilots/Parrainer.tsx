import { PARRAINAGE } from '../communaute';

/* PARRAINER UNE AMIE — 28 septembre 2026, maquette « La communauté MND »
   validée. Jusqu'au 9 octobre, un prénom et un numéro suffisaient : la
   fonction Edge `demande-submit` (son mode « parrainage ») rendait un code
   de marraine à quiconque le demandait, et l'ancien code d'une fiche à qui
   tapait son numéro.

   DE MAIN EN MAIN — 9 octobre 2026. La carte ne se demande plus, elle se
   GAGNE à la Maison : au fil de ses visites, la cliente devient Graine, et
   sa carte arrive dans Ma Couronne. Le site ne crée donc plus aucun code
   (le serveur répond `parrainage_ferme` à l'ancien appel) ; l'îlot devient
   un bloc fixe, qui mène à la réservation et à Ma Couronne. Ses mots vivent
   dans `communaute.ts` (`PARRAINAGE.carte`) : la page écrite par
   `genere-revelateur` dit EXACTEMENT la même chose, script ou pas. */

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;
/* Ma Couronne vit sur la même origine, hors de ce site : `/couronne/` en
   ligne (build-sites pose VITE_LINK_COURONNE), sa page `.html` en
   développement. Même règle que les liens `soeur:` de la construction. */
const COURONNE = String(import.meta.env.VITE_LINK_COURONNE || '/couronne.html');

export default function Parrainer() {
  const c = PARRAINAGE.carte;
  return (
    <div className="bon sombre">
      <p className="sur">{c.sur}</p>
      <h3>{c.titre}</h3>
      <p className="bon__petit">{c.ligne}</p>
      <div className="rangee">
        <a className="btn btn--plein" href={base('/reserver/')}>{c.reserver}</a>
        <a className="btn" href={COURONNE}>{c.couronne}</a>
      </div>
      <p className="bon__petit">{c.amie}</p>
    </div>
  );
}
