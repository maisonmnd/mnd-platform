import './replis.css';
import { createContext, useContext, useId, useState, type ReactNode } from 'react';

/* ═══ LES LIGNES REPLIÉES DU TABLEAU DE BORD — 27 octobre 2026 ═══════════
   « Arrange l'UI de toute la page, que ce soit navigable, que chaque bouton
   serve à prendre des décisions » (Yéman) ; au sélecteur : le mois et ses
   leviers en haut, Aujourd'hui et À traiter repliés. La règle des écrans en
   liste du Trône : la ligne repliée porte un RÉSUMÉ CHIFFRÉ de ce qu'elle
   cache, et UN SEUL panneau s'ouvre à la fois dans un groupe. Le résumé et
   le panneau lisent les mêmes chiffres, calculés une fois par l'écran. */

type Groupe = { ouvert: string | null; ouvre: (id: string | null) => void };
const GroupeCtx = createContext<Groupe | null>(null);

/** Un groupe de lignes repliées : un seul panneau ouvert à la fois. */
export function GroupeDeReplis({ id, titre, sousTitre, children, ouvertAuDepart = null, ouvert: pilote, onOuvre }: {
  id: string; titre: string; sousTitre?: string; children: ReactNode; ouvertAuDepart?: string | null;
  /** Piloté de l'extérieur (un bouton ailleurs ouvre une ligne d'ici). */
  ouvert?: string | null; onOuvre?: (cle: string | null) => void;
}) {
  const [interne, setInterne] = useState<string | null>(ouvertAuDepart);
  const ouvert = pilote !== undefined ? pilote : interne;
  const ouvre = (cle: string | null) => { if (onOuvre) onOuvre(cle); if (pilote === undefined) setInterne(cle); };
  return (
    <section className="trd-groupe" id={id} aria-label={titre}>
      <h3 className="trd-groupe__titre">{titre}{sousTitre ? <span>{sousTitre}</span> : null}</h3>
      <GroupeCtx.Provider value={{ ouvert, ouvre }}>
        <div className="trd-groupe__lignes">{children}</div>
      </GroupeCtx.Provider>
    </section>
  );
}

/** Une ligne repliée : son titre, son résumé chiffré, son geste principal ;
    touchée, elle déplie son panneau (et replie celui qui était ouvert). */
export function Repli({ cle, titre, resume, compte, ton = 'calme', geste, children }: {
  cle: string;
  titre: string;
  resume: string;
  /** Le nombre qui compte, en pastille (rien à 0). */
  compte?: number;
  ton?: 'calme' | 'presse';
  geste?: { dit: string; faire: () => void };
  children: ReactNode;
}) {
  const g = useContext(GroupeCtx);
  const [seul, setSeul] = useState(false);
  const ouvert = g ? g.ouvert === cle : seul;
  const bascule = () => (g ? g.ouvre(ouvert ? null : cle) : setSeul(!seul));
  const idPanneau = useId();
  return (
    <div className={`trd-repli${ouvert ? ' est-ouvert' : ''}${ton === 'presse' ? ' est-presse' : ''}`}>
      <div className="trd-repli__ligne">
        <button type="button" className="trd-repli__bascule" aria-expanded={ouvert} aria-controls={idPanneau} onClick={bascule}>
          <span className="trd-repli__chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
          <span className="trd-repli__titre">{titre}</span>
          {compte ? <span className="trd-repli__compte">{compte}</span> : null}
          <span className="trd-repli__resume">{resume}</span>
        </button>
        {geste && <button type="button" className="trd-repli__geste" onClick={geste.faire}>{geste.dit}</button>}
      </div>
      {ouvert && <div className="trd-repli__panneau" id={idPanneau}>{children}</div>}
    </div>
  );
}
