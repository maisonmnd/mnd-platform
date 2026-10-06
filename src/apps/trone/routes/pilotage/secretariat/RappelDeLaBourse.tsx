import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSecretariat } from '../../../../../shared/secretariat';
import { chargeLeClasseur, papiersDe, useClasseur } from '../../../../../shared/papiers';
import { aFaireMaintenant, calendrier, campagneDe, dateEnLettres } from '../../../../../shared/bourse-pur';
import { leDossier } from '../../../../../shared/bourse';

/* LE RAPPEL DE LA BOURSE — 7 octobre 2026 (maquette W7LtTpMS…). Pour la
   direction seule : les gestes du dossier de bourse échus ou à trois jours,
   d'octobre au dépôt. Rien à dire : rien ne s'affiche. */
export function RappelDeLaBourse() {
  const [lignes] = useSecretariat();
  const classeur = useClasseur();
  const navigate = useNavigate();
  useEffect(() => { if (classeur.charge === 'jamais') void chargeLeClasseur(); }, [classeur.charge]);
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dossier = leDossier(lignes);
  const c = campagneDe(jour, dossier?.valeurs.depot);
  /* La campagne vit d'octobre au jour du dépôt. */
  if (jour < `${c.reference}-10-01` || jour > c.depot) return null;
  const papiers = classeur.charge === 'pret' ? papiersDe(classeur.lignes) : [];
  const gestes = aFaireMaintenant(calendrier(c, papiers, dossier?.membres ?? {}, dossier?.valeurs ?? {}), jour);
  if (gestes.length === 0) return null;
  return (
    <div className="sec-bandeau" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ flex: 1, minWidth: 220 }}>
        <b>Bourse scolaire {c.cle} · </b>
        {gestes.slice(0, 2).map((g) => g.titre).join(' · ')}
        {gestes.length > 2 ? ` · et ${gestes.length - 2} autre${gestes.length - 2 > 1 ? 's' : ''}` : ''}
        {` · dépôt au plus tard le ${dateEnLettres(c.depot)}`}
      </span>
      <button type="button" className="trp-af-pill" onClick={() => navigate('/secretariat', { state: { onglet: 'bourse' } })}>Ouvrir le dossier</button>
    </div>
  );
}
