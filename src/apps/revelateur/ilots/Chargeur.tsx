/* LE CHARGEUR ET SON REPLI — 3 novembre 2026. « Improve the "Les places se
   chargent" experience with a visible loader and error fallback » (Yéman).
   Une ligne seule, « Les places se chargent. », se lisait comme une page
   figée sur un réseau lent. Trois points cuivre disent que la Maison
   cherche ; après douze secondes, ou à la première panne, le repli dit ce
   qui se passe, propose de RÉESSAYER pour de bon et garde WhatsApp devant.
   Partagé par la réservation et la page du rendez-vous ; sans mouvement
   pour qui l'a demandé (la feuille respecte prefers-reduced-motion). */

export function Chargeur({ texte }: { texte: string }) {
  return (
    <p className="chargeur" role="status" aria-live="polite">
      <span className="chargeur__points" aria-hidden="true"><i /><i /><i /></span>
      <span>{texte}</span>
    </p>
  );
}

export function RepliDuChargement({ phrase, wa, surReessayer }: { phrase: string; wa: string; surReessayer?: () => void }) {
  return (
    <div className="chargeur-repli" role="alert">
      <p className="corps">{phrase} {surReessayer ? 'Réessayez, ou écrivez-nous : nous trouvons l’heure ensemble.' : 'Écrivez-nous : nous trouvons l’heure ensemble.'}</p>
      <p className="rangee">
        {surReessayer && <button type="button" className="btn btn--fort" onClick={surReessayer}>Réessayer</button>}
        <a className="btn btn--plein" href={wa} target="_blank" rel="noopener">Parler à MND sur WhatsApp</a>
      </p>
    </div>
  );
}
