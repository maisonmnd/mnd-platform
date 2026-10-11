import { useEffect, useState } from 'react';
import { COMMUN } from '../contenu';
import { lienWhatsApp, maison, type Maison } from '../maison';
import { mesure } from '../mesure';

/* LE CONTACT — ce qui vit : le numéro de la Maison et sa fiche Google,
   lus dans `branches` sans compte. Le reste de la page est statique. */

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/* LA CARTE COURTE — 11 octobre 2026 (maquette de la réservation validée).
   Sur la page de réservation et celle du rappel, la longue citation des six
   envies pesait sur la colonne et répétait une offre déjà faite ; une ligne
   et le bouton suffisent. La citation entière reste sur la page Contact.
   « ME FAIRE RAPPELER » menait à /reserver/ : depuis /reserver/, un lien vers
   la page elle-même qui perdait le choix ; depuis /rappel/, un renvoi au
   calendrier. Il mène au rappel. */
type Props = { genre?: string };

export default function Contact({ genre }: Props) {
  const [m, setM] = useState<Maison | null>(null);
  useEffect(() => { void maison().then(setM); }, []);
  const court = genre === 'court';
  const wa = lienWhatsApp(m?.whatsapp ?? '', COMMUN.messages.inconnu);
  return (
    <div className="carte-wa">
      <p className="sur">Plus direct</p>
      <h3>{court ? 'Une question ? Écrivez-nous.' : 'Parler à MND sur WhatsApp'}</h3>
      {court
        ? <p className="legende">Sur WhatsApp, au registre de la Maison. Pendant les heures d’ouverture, on vous répond vite.</p>
        : <p className="msg">« {COMMUN.messages.inconnu} »</p>}
      <div className="rangee">
        <a className="btn btn--plein" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'inconnu' })}>Ouvrir WhatsApp</a>
        <a className="btn btn--lien" href={base('/rappel/')}>Me faire rappeler</a>
      </div>
      {m?.fiche && <p className="legende"><a href={m.fiche} target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Notre fiche Google</a> : adresse, horaires, itinéraire.</p>}
      {m && m.ville && <p className="legende">{m.nom} · {m.ville}</p>}
    </div>
  );
}
