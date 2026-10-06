import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aRenouveler, etatDe, etatDit, manquantsDe, titreDuPapier } from '../../../../../shared/papiers-pur';
import { chargeLeClasseur, papiersDe, personnesDe, useClasseur } from '../../../../../shared/papiers';

/* LE RAPPEL DES PAPIERS — 6 octobre 2026 (maquette « Les papiers »).
   Pour la direction seule : ce qui expire sous 30 jours (60 pour un
   passeport), ce qui est expiré, et combien de papiers attendus manquent.
   Lu au serveur à l'ouverture, jamais gardé sur l'appareil. Rien à dire :
   rien ne s'affiche. */
export function RappelDesPapiers({ titulairesEntreprises }: { titulairesEntreprises: string[] }) {
  const classeur = useClasseur();
  const navigate = useNavigate();
  useEffect(() => { if (classeur.charge === 'jamais') void chargeLeClasseur(); }, [classeur.charge]);
  if (classeur.charge !== 'pret') return null;
  const jour = new Date().toISOString().slice(0, 10);
  const papiers = papiersDe(classeur.lignes);
  const renouv = aRenouveler(papiers, jour);
  const titulaires = [...titulairesEntreprises, ...personnesDe(classeur.lignes).map((p) => `pers:${p.id}`)];
  const manquent = titulaires.reduce((n, t) => n + manquantsDe(papiers, t).length, 0);
  if (renouv.length === 0 && manquent === 0) return null;
  return (
    <div className="sec-bandeau" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ flex: 1, minWidth: 220 }}>
        <b>Les papiers · </b>
        {renouv.slice(0, 3).map((p) => `${titreDuPapier(p)} (${etatDe(p, jour) === 'expire' ? 'expiré' : etatDit(p, jour)})`).join(' · ')}
        {renouv.length > 3 ? ` · et ${renouv.length - 3} autre${renouv.length - 3 > 1 ? 's' : ''}` : ''}
        {renouv.length && manquent ? ' · ' : ''}
        {manquent ? `${manquent} papier${manquent > 1 ? 's' : ''} à déposer` : ''}
      </span>
      <button type="button" className="trp-af-pill" onClick={() => navigate('/secretariat', { state: { onglet: 'papiers' } })}>Ouvrir les papiers</button>
    </div>
  );
}
