/* DÉPOSER ET OUVRIR UNE PIÈCE DU COFFRE — les deux gestes que partagent
   les Engagements (15 septembre 2026) et la fiche du personnel (18 septembre
   2026). « Un espace réservé avec sa carte d'identité, exactement comme sur
   la fiche d'engagement des prestataires » (Yéman) : mêmes gestes, mêmes
   mots, un seul endroit où ils vivent. */

import { useRef } from 'react';
import { Button, toast } from '../../../ds/components';
import { adresseDuCoffre } from '../../../shared/engagements-coffre';

/** Dix mégaoctets, le plafond du compartiment (0099). Le dire avant l'envoi
    évite un refus muet au bout d'une minute de téléversement. */
export const TAILLE_MAX = 10 * 1024 * 1024;

/** OUVRIR UNE PIÈCE DU COFFRE. L'onglet s'ouvre AVANT d'attendre le lien :
    ouvert après, le navigateur le prend pour une fenêtre surgissante et le
    bloque. Le lien vaut une heure, et se redemande à chaque ouverture. */
export async function ouvreLaPiece(chemin: string): Promise<void> {
  const onglet = window.open('', '_blank');
  if (!onglet) { toast('Le navigateur a bloqué l’onglet. Autorisez les fenêtres pour le Trône.'); return; }
  const url = await adresseDuCoffre(chemin);
  if (!url) {
    onglet.close();
    toast('La pièce n’a pas pu s’ouvrir. Vos droits ne le permettent peut-être pas.');
    return;
  }
  onglet.opener = null;
  onglet.location.href = url;
}

/** Choisir un fichier depuis l'appareil — une photo prise sur le moment, ou
    un PDF reçu. */
export function ChoisirUnePiece({ libelle, onFichier, disabled, variant = 'ghost', accept = 'image/*,application/pdf' }: {
  libelle: string;
  onFichier: (f: File) => void;
  disabled?: boolean;
  variant?: 'ghost' | 'copper' | 'indigo';
  accept?: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => champ.current?.click()}>{libelle}</Button>
      <input
        ref={champ}
        type="file"
        accept={accept}
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (!f) return;
          if (f.size > TAILLE_MAX) { toast('La pièce dépasse 10 Mo. Photographiez-la plus petit, ou envoyez le PDF.'); return; }
          onFichier(f);
        }}
      />
    </>
  );
}
