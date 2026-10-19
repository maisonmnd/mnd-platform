import { useRef, useState } from 'react';
import { Button } from '../../../../ds/components';
import { demandeAClaude, photoPourClaude, useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import {
  CHANTIER_DU_RECU, SCHEMA_DU_RECU, USAGE_DU_RECU, champsRemplis, consigneDuRecu, lectureDuRecu, type RecuLu,
} from '../../../../shared/ia-recu-pur';
import { deposerFichier } from '../../../../shared/fil';
import type { PieceJointe } from '../../../../shared/finance';

/* ══ « PHOTOGRAPHIER LE REÇU » — 19 octobre 2026 (chantier `recu`) ═══════
   Maquette validée : « Dans Dépenses, "Photographier le reçu". La photo reste
   jointe à la dépense. Les cases cuivrées viennent de la photo : vérifiez-les
   (Montant, Date, Fournisseur, Catégorie). Les articles sont repris en
   lignes. »

   DEUX VOYAGES EN MÊME TEMPS. La photo part au compartiment privé de la
   Maison (celui des pièces des dépenses, `fil/<branche>/depense/…`, 0059) ET
   chez Claude, réduite. Si Claude ne répond pas, la photo est jointe quand
   même : la preuve compte plus que la lecture.

   CE COMPOSANT N'INSCRIT RIEN. Il rend la lecture au formulaire, qui la pose
   dans des cases cuivre ; « Écarter la lecture » rend le formulaire d'avant ;
   seul le bouton de la dépense (« Enregistrer » ou « Soumettre pour
   validation ») inscrit, par le même chemin qu'une saisie à la main, avec le
   même statut (sa décision : « sa dépense attend votre validation, comme
   aujourd'hui »).

   LE BOUTON NE PARAÎT QUE SI la fonction `ia-maison` est posée
   (`useSaitIaMaison`) et si le rôle ou le département l'ouvre
   (`peutDemander`, tous les départements pour `recu`). */
export function PhotoDuRecu({ role, acces, branchId, categories, aujourdhui, onPhoto, onLecture, onEcarter }: {
  role: string | undefined;
  acces: Record<string, boolean> | undefined;
  branchId: string;
  /** Les catégories de dépenses du Trône, telles qu'elles s'écrivent. */
  categories: readonly string[];
  aujourdhui: string;
  /** La photo déposée au coffre : elle se joint à la dépense aussitôt. */
  onPhoto: (p: PieceJointe) => void;
  /** Ce que la photo dit, revalidé : le formulaire le pose en cuivre. */
  onLecture: (l: RecuLu) => void;
  /** La personne écarte la lecture : le formulaire d'avant revient. */
  onEcarter: () => void;
}) {
  /* Les crochets d'abord, le retour anticipé ensuite (règle du 16 octobre 2026). */
  const sait = useSaitIaMaison();
  const [etat, setEtat] = useState<'repos' | 'lecture'>('repos');
  const [mot, setMot] = useState<string | null>(null);
  const [lu, setLu] = useState<RecuLu | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  if (sait !== true || !peutDemander(role, CHANTIER_DU_RECU, acces)) return null;

  const lire = async (f: File | undefined) => {
    if (!f) return;
    setEtat('lecture'); setMot(null); setLu(null);
    const [piece, image] = await Promise.all([
      deposerFichier(branchId, f, 'depense').catch(() => null),
      photoPourClaude(f).catch(() => null),
    ]);
    if (piece) onPhoto(piece);
    const jointe = piece ? ' La photo reste jointe.' : ' La photo n’a pas pu être jointe : réessayez par « Joindre le reçu ».';
    if (!image) { setEtat('repos'); setMot(`Cette photo ne se lit pas comme une image : saisissez à la main.${jointe}`); return; }
    const r = await demandeAClaude<unknown>({
      chantier: CHANTIER_DU_RECU,
      usage: USAGE_DU_RECU,
      systeme: consigneDuRecu({ categories, aujourdhui }),
      messages: [{ role: 'user', content: 'Lis ce reçu et rends ce que tu lis, rien de plus.' }],
      images: [image],
      schema: SCHEMA_DU_RECU,
      maxTokens: 2500,
    });
    setEtat('repos');
    if (!r.ok) { setMot(`${r.message}${jointe} Saisissez à la main.`); return; }
    const lecture = lectureDuRecu(r.data, { categories, aujourdhui });
    if (!lecture) { setMot(`Rien d’utilisable n’a été lu sur cette photo : saisissez à la main.${jointe}`); return; }
    setLu(lecture);
    onLecture(lecture);
  };

  const remplies = lu ? champsRemplis(lu).length : 0;
  return (
    <div data-photo-du-recu style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="button" variant="copper" size="sm" disabled={etat === 'lecture'} onClick={() => champ.current?.click()}>
          {etat === 'lecture' ? 'Lecture de la photo…' : 'Photographier le reçu'}
        </Button>
        <input
          ref={champ}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label="Photographier le reçu"
          onChange={(e) => { void lire(e.target.files?.[0]); e.target.value = ''; }}
        />
        <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          La photo reste jointe à la dépense ; les cases cuivrées viennent d’elle, vérifiez-les.
        </span>
      </div>
      {mot && <span role="status" style={{ fontSize: 12, color: 'var(--copper-700)', lineHeight: 1.5 }}>{mot}</span>}
      {lu && (
        <div role="status" style={{ border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: 1.6, display: 'grid', gap: 4 }}>
          <span>
            <b>Lu sur la photo</b> · {remplies} case{remplies > 1 ? 's' : ''} remplie{remplies > 1 ? 's' : ''}
            {lu.lignes.length ? ` · ${lu.lignes.length} ligne${lu.lignes.length > 1 ? 's' : ''}` : ''}
            {lu.moyen ? ` · payé en ${lu.moyen}` : ''}
            {` · confiance ${Math.round(lu.confiance * 100)} %`}
          </span>
          {lu.avertissements.map((a) => <span key={a} style={{ color: 'var(--copper-700)' }}>{a}</span>)}
          <span>
            Vérifiez les cases cuivrées, puis enregistrez comme d’habitude.{' '}
            <button type="button" className="trf-act" onClick={() => { setLu(null); onEcarter(); }}>Écarter la lecture</button>
          </span>
        </div>
      )}
    </div>
  );
}
