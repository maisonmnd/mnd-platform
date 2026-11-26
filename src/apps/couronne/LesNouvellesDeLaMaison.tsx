import { useState } from 'react';
import { clientsStore } from '../../shared/clients';
import { momentDuSalon } from '../../shared/calendrier';
import { BOUTON_ACCORD_OUI, BOUTONS_DE_L_ACCORD, MERCI_DE_L_ACCORD, MERCI_DU_REFUS, QUESTION_DE_L_ACCORD } from '../../shared/accord-whatsapp-pur';
import { accordAPoser, laQuestionSePose } from '../../shared/accord-des-nouvelles-pur';
import { t } from './i18n';
import { useClient } from './lib';

/* ══ LES NOUVELLES DE LA MAISON, DANS MA COURONNE — 26 novembre 2026 ═════
   L'audit du Trône (B1, « construis » de Yéman) : la question des nouvelles
   se pose aussi ici, en carte discrète au bas de l'accueil, tant que sa
   fiche n'a pas répondu (ni oui, ni non, ni STOP ; jamais pour une fiche
   d'enfant). Les mêmes mots et les mêmes deux boutons que sur WhatsApp
   (shared/accord-whatsapp-pur), de poids égal. Sa réponse s'écrit sur SA
   fiche par le chemin que Ma Couronne prend déjà pour elle (la langue, ses
   choix de récompenses) : le magasin des fiches, synchronisé, sous la RLS de
   sa propre ligne — aucune porte nouvelle. Source `couronne`, au jour du
   salon. Après le toucher, le merci de la Maison reste jusqu'à ce qu'elle
   quitte l'accueil. */
export function LesNouvellesDeLaMaison() {
  const client = useClient();
  const [repondu, setRepondu] = useState<boolean | null>(null);

  if (repondu !== null) {
    return (
      <div className="mc-marche" aria-live="polite" data-accord="couronne">
        <div className="mc-marche__k">{t('Les nouvelles de la Maison')}</div>
        <p className="mc-marche__p">{t(repondu ? MERCI_DE_L_ACCORD : MERCI_DU_REFUS)}</p>
      </div>
    );
  }
  if (!client || !laQuestionSePose(client, momentDuSalon().jour)) return null;

  const reponds = (oui: boolean) => {
    /* La fiche relue dans le magasin à l'instant du toucher : jamais par-dessus une réponse. */
    const f = clientsStore.get().find((c) => c.id === client.id);
    const accord = accordAPoser(f, oui, momentDuSalon().jour, 'couronne');
    if (!accord) return;
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, nouvelles: accord } : c)));
    setRepondu(accord.oui);
  };

  return (
    <div className="mc-marche" data-accord="couronne">
      <div className="mc-marche__k">{t('Les nouvelles de la Maison')}</div>
      <p className="mc-marche__p">{t(QUESTION_DE_L_ACCORD)}</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {BOUTONS_DE_L_ACCORD.map((b) => (
          <button key={b.id} type="button" className="mc-cta mc-cta--quiet" style={{ flex: 1 }} onClick={() => reponds(b.id === BOUTON_ACCORD_OUI)}>
            {t(b.titre)}
          </button>
        ))}
      </div>
      <p className="mc-marche__p" style={{ fontSize: 12, marginTop: 10 }}>{t('Sur WhatsApp, au numéro de votre fiche.')}</p>
    </div>
  );
}
