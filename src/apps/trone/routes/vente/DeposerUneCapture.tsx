import { useRef, useState } from 'react';
import { toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { mimeDImagePermis, peutDemander } from '../../../../shared/ia-maison-pur';
import { CHANTIER_CAPTURE, type LectureDeLaCapture } from '../../../../shared/ia-capture-pur';
import { lisUneCaptureDeposee } from '../../../../shared/ia-capture';
import { staffAccessStore } from '../equipe/data';
import { useDettesDeLaCliente } from '../clients/dettes-de-la-cliente';

export type LecturePosee = Extract<LectureDeLaCapture, { estUnPaiement: true }>;

/* ══ « DÉPOSER UNE CAPTURE » À L'ENCAISSEMENT — 19 octobre 2026 ══════════
   « La même lecture marche dans "Encaisser", en déposant la capture »
   (sa décision). Un bouton, un fichier image du poste, et la lecture de
   Claude remplit les cases de l'écran qui l'a appelé : montant, moyen, jour,
   référence en note. Rien ne s'écrit ici ; l'écran garde son propre bouton
   qui encaisse. Le bouton se tait tant que la fonction n'est pas posée ou
   que la personne n'a pas le chantier.

   Ce qu'elle doit (pour aider Claude à lire le montant, jamais pour le
   corriger) se lit ici, de la fiche donnée : l'écran qui monte le bouton
   n'a qu'une ligne à écrire. Une vente sans fiche n'en dit rien. */
export function DeposerUneCapture({ clientId, onLecture, className }: {
  clientId?: string;
  onLecture: (lecture: LecturePosee) => void;
  className?: string;
}) {
  const sait = useSaitIaMaison();
  const staff = useStaff();
  const [acces] = useStore(staffAccessStore);
  const dettes = useDettesDeLaCliente(clientId);
  const [enCours, setEnCours] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  if (!sait || !peutDemander(staff?.role, CHANTIER_CAPTURE, staff ? acces[staff.user_id] : undefined)) return null;

  const lis = async (f: File | undefined) => {
    if (!f) return;
    if (!mimeDImagePermis(f.type)) { toast('Déposez une image (capture d’écran, photo du reçu).'); return; }
    setEnCours(true);
    try {
      const r = await lisUneCaptureDeposee(f, dettes);
      if (!r.ok) { toast(r.message); return; }
      if (!r.lecture.estUnPaiement) { toast('Claude n’y voit pas un transfert d’argent : saisissez à la main.'); return; }
      onLecture(r.lecture);
      toast(`Capture lue${r.lecture.reference ? ` (réf. ${r.lecture.reference})` : ''} : vérifiez les cases avant d’encaisser.`);
    } finally {
      setEnCours(false);
      if (entree.current) entree.current.value = '';
    }
  };

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input ref={entree} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void lis(e.target.files?.[0])} />
      <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" disabled={enCours} onClick={() => entree.current?.click()}>
        {enCours ? 'Claude lit…' : 'Déposer une capture'}
      </button>
    </span>
  );
}

export default DeposerUneCapture;
