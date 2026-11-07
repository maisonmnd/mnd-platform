/* ══ LA PASTILLE DES REÇUS — 6 novembre 2026 ═════════════════════════════
   « J'ai vraiment besoin de voir quand un message arrive, parce que c'est
   pas possible : je les loupe toujours » (Yéman). Sur le modèle de la
   pastille de la salle d'attente : elle vit dans la barre du Trône, sur tous
   les écrans, s'allume dès qu'une conversation est reçue (recus-pur : son
   dernier message, que personne de la Maison n'a encore ouvert), dit combien
   et l'heure de la plus récente, et un clic ouvre cette conversation.

   ELLE NE SONNE PAS. La sonnerie des Conversations existe et sonne déjà pour
   ce qui arrive : une seule sonnerie dans la Maison. */

import { useNavigate } from 'react-router-dom';
import { motDeLaPastille, plusRecente, type Recu } from '../../../shared/recus-pur';

export function PastilleDesRecus({ recus }: { recus: readonly Recu[] }) {
  const navigate = useNavigate();
  const premiere = plusRecente(recus);
  if (!premiere) return null;
  return (
    <button
      type="button"
      className="tr-top__salle tr-top__recus"
      onClick={() => navigate(`/gerard?vue=conversations${premiere.adresse ? `&${premiere.adresse}` : ''}`)}
      title={`Ouvrir la conversation reçue la plus récente : ${premiere.nom}`}
    >
      {motDeLaPastille(recus, Date.now())}
    </button>
  );
}
