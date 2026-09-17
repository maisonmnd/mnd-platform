import { useEffect, useState } from 'react';
import { COMMUN } from '../contenu';
import { lienWhatsApp, maison, type Maison } from '../maison';
import { mesure } from '../mesure';

/* LE CONTACT — ce qui vit : le numéro de la Maison et sa fiche Google,
   lus dans `branches` sans compte. Le reste de la page est statique. */

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

export default function Contact() {
  const [m, setM] = useState<Maison | null>(null);
  useEffect(() => { void maison().then(setM); }, []);
  const wa = lienWhatsApp(m?.whatsapp ?? '', COMMUN.messages.inconnu);
  return (
    <div className="carte-wa">
      <p className="sur">Plus direct</p>
      <h3>Parler à MND sur WhatsApp</h3>
      <p className="msg">« {COMMUN.messages.inconnu} »</p>
      <div className="rangee">
        <a className="btn btn--plein" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'inconnu' })}>Ouvrir WhatsApp</a>
        <a className="btn btn--lien" href={base('/reserver/')}>Me faire rappeler</a>
      </div>
      {m?.fiche && <p className="legende"><a href={m.fiche} target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Notre fiche Google</a> : adresse, horaires, itinéraire.</p>}
      {m && m.ville && <p className="legende">{m.nom} · {m.ville}</p>}
    </div>
  );
}
