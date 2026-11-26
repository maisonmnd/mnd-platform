import { useState } from 'react';
import { BOUTON_ACCORD_OUI, BOUTONS_DE_L_ACCORD, MERCI_DE_L_ACCORD, MERCI_DU_REFUS, QUESTION_DE_L_ACCORD } from '../../shared/accord-whatsapp-pur';
import { questionAdressee } from '../../shared/accord-des-nouvelles-pur';
import { repondsAuxNouvelles } from '../../shared/regler-la-seance-serveur';

/* ══ LES NOUVELLES DE LA MAISON, À LA SORTIE — 26 novembre 2026 ══════════
   L'audit du Trône (B1, « construis » de Yéman) : une poignée de fiches
   seulement avait répondu à la question des nouvelles. Ici, sur le « Merci. »
   de sa séance réglée, la même question que sur WhatsApp, avec les mêmes deux
   boutons, de poids égal : « Oui, volontiers » ne passe pas devant « Non
   merci ». Elle ne paraît que si la fonction l'a dit (`accordADemander` : sa
   fiche n'a pas encore répondu, ce n'est pas un enfant) ; App.tsx la retire
   au TPE de poche, pour l'invitée de « régler à deux » et pour le foyer. La
   réponse s'écrit au serveur (`nouvelles`), jamais par-dessus une autre. La
   question porte son prénom : le lien a pu être partagé. */

type Etat = 'question' | 'envoi' | 'souci' | { oui: boolean } | 'deja';

export function LesNouvelles({ jeton, prenom }: { jeton: string; prenom: string }) {
  const [etat, setEtat] = useState<Etat>('question');

  const reponds = async (oui: boolean): Promise<void> => {
    if (etat === 'envoi') return;
    setEtat('envoi');
    const r = await repondsAuxNouvelles(jeton, oui);
    if (r.ok && r.deja === true) { setEtat('deja'); return; }
    if (r.ok) { setEtat({ oui }); return; }
    setEtat('souci');
  };

  if (typeof etat === 'object' || etat === 'deja') {
    return (
      <div className="rg-merci rg-nouvelles" aria-live="polite">
        <p className="rg-sur">Les nouvelles de la Maison</p>
        <p className="rg-doux">{etat === 'deja' ? 'Votre réponse est déjà notée.' : etat.oui ? MERCI_DE_L_ACCORD : MERCI_DU_REFUS}</p>
      </div>
    );
  }

  return (
    <div className="rg-merci rg-nouvelles" aria-live="polite">
      <p className="rg-sur">Les nouvelles de la Maison</p>
      <p className="rg-doux">{questionAdressee(prenom, QUESTION_DE_L_ACCORD)}</p>
      <div className="rg-puces">
        {BOUTONS_DE_L_ACCORD.map((b) => (
          <button key={b.id} type="button" className="rg-autre" style={{ flex: 1 }} disabled={etat === 'envoi'}
            onClick={() => { void reponds(b.id === BOUTON_ACCORD_OUI); }}>
            {b.titre}
          </button>
        ))}
      </div>
      <p className="rg-doux rg-petit">Sur WhatsApp, au numéro de votre fiche.</p>
      {etat === 'souci' && <p className="rg-souci" role="alert">La réponse n’est pas passée. Réessayez, ou dites-la à l’accueil.</p>}
    </div>
  );
}
