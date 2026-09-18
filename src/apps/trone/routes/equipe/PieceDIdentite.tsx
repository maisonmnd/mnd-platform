/* LA PIÈCE D'IDENTITÉ, DANS LA FICHE DU PERSONNEL — 18 septembre 2026.

   « Je veux avoir un espace réservé dans la fiche du personnel avec sa
   carte d'identité, exactement comme quand je crée la fiche d'engagement
   pour les prestataires avec leur carte » (Yéman).

   LES MÊMES GESTES que la fiche d'engagement (Ouvrir, Remplacer, Effacer,
   un lien d'une heure), le même coffre et la même règle : direction seule,
   tenue par la base et non par cet écran (0099). Ce qui change : la fiche ne
   garde pas la pièce, c'est le coffre qu'on lit (`engagements-coffre.ts`).

   GARDÉE TANT QUE LA FICHE VIT, effacée quand on la retire de l'équipe
   (`remove` dans Personnel). */

import { useEffect, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { FORMATS_DE_L_IDENTITE, jourLongDit } from '../../../../shared/engagements';
import {
  deposeLIdentiteDuPersonnel, identiteDuPersonnel, retireDuCoffre, type IdentiteRangee,
} from '../../../../shared/engagements-coffre';
import { ouvreLaPiece, ChoisirUnePiece } from '../_piece';

const cadre = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px', fontSize: 13,
} as const;

export default function PieceDIdentite({ staffId, estDirection }: {
  /** La fiche, une fois enregistrée ; absente pour une fiche nouvelle. */
  staffId: string | null;
  estDirection: boolean;
}) {
  /* 'lecture' : on interroge le coffre ; null : il n'a pas répondu. */
  const [rangees, setRangees] = useState<IdentiteRangee[] | null | 'lecture'>('lecture');
  const [occupe, setOccupe] = useState(false);
  /* EFFACER SE CONFIRME SUR LE BOUTON, pas par `window.confirm`, qu'un
     navigateur peut taire (voir Accès & personnel) : un clic arme, le second
     efface. */
  const [arme, setArme] = useState(false);

  useEffect(() => {
    if (!estDirection || !staffId) return;
    let vivant = true;
    setRangees('lecture');
    void identiteDuPersonnel(staffId).then((r) => { if (vivant) setRangees(r); });
    return () => { vivant = false; };
  }, [staffId, estDirection]);

  const piece = Array.isArray(rangees) ? rangees[0] : undefined;

  const depose = async (f: File) => {
    if (!staffId) return;
    setOccupe(true);
    const p = await deposeLIdentiteDuPersonnel(staffId, f);
    if (!p) { setOccupe(false); toast('La pièce n’a pas pu être déposée.'); return; }
    /* UNE SEULE CARTE PAR FICHE : les précédentes ne restent pas derrière. */
    const anciennes = Array.isArray(rangees) ? rangees.map((r) => r.chemin) : [];
    if (anciennes.length > 0) await retireDuCoffre(anciennes);
    /* CE QUE LE COFFRE DIT, relu : la date du dépôt est la sienne. */
    const relues = await identiteDuPersonnel(staffId);
    setOccupe(false);
    setRangees(relues ?? [{ chemin: p.chemin, nom: p.nom, deposeLe: '' }]);
    toast('Pièce d’identité rangée. Seule la direction l’ouvre.');
  };

  const efface = async () => {
    if (!Array.isArray(rangees) || rangees.length === 0) return;
    if (!arme) { setArme(true); return; }
    setArme(false);
    setOccupe(true);
    const ok = await retireDuCoffre(rangees.map((r) => r.chemin));
    setOccupe(false);
    if (!ok) { toast('La pièce n’a pas pu être retirée du coffre.'); return; }
    setRangees([]);
    toast('Pièce d’identité effacée du coffre.');
  };

  return (
    <>
      <div className="tre-sec-label" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>La pièce d’identité</div>
      <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: -6 }}>
        Direction seule. Effacée quand la fiche est retirée de l’équipe.
      </div>
      {!estDirection ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Réservée à la direction.</div>
      ) : !staffId ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Ajoutez d’abord le membre à l’équipe : sa pièce se dépose ensuite, depuis sa fiche.</div>
      ) : rangees === 'lecture' ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Lecture du coffre…</div>
      ) : rangees === null ? (
        <div className="mnd-muted" style={{ fontSize: 12.5 }}>Le coffre n’a pas répondu. Rouvrez la fiche dans un instant.</div>
      ) : piece ? (
        <div style={cadre}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <b style={{ fontWeight: 500 }}>{piece.nom}</b>
            <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
              {piece.deposeLe ? `déposée le ${jourLongDit(piece.deposeLe)} · ` : ''}gardée tant que la fiche vit
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => void ouvreLaPiece(piece.chemin)}>Ouvrir</Button>
            <ChoisirUnePiece libelle="Remplacer" accept={FORMATS_DE_L_IDENTITE} disabled={occupe} onFichier={(f) => void depose(f)} />
            <button type="button" className="tre-link-btn" disabled={occupe} onClick={() => void efface()}>
              {arme ? 'Confirmer l’effacement' : 'Effacer'}
            </button>
          </span>
        </div>
      ) : (
        <div style={cadre}>
          <span className="mnd-muted">Aucune pièce. JPEG ou PNG, lisible, recto et verso sur la même photo.</span>
          <ChoisirUnePiece libelle="Déposer sa pièce" accept={FORMATS_DE_L_IDENTITE} disabled={occupe} onFichier={(f) => void depose(f)} />
        </div>
      )}
    </>
  );
}
