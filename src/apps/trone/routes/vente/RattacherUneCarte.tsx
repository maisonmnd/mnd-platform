import { useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useAuth } from '../../../../shared/auth';
import { fmtMoney } from '../../../../shared/currency';
import type { CreditHolder } from '../../../../shared/finance';
import {
  useCartesCadeaux, carteParCode, pourquoiOnNeRattachePas, objetDeLaCarte,
} from '../../../../shared/cartes-cadeaux';
import { rattacheLaCarte } from './cartes-actions';
import './vente.css';

/* « AWA VIENT AVEC SON CODE » — 2 octobre 2026, maquette « La carte cadeau
   en ligne », V. Dans l'encaissement d'un rituel (et à la caisse), un champ
   « Carte cadeau ». Le code trouve la carte ; un geste la rattache au compte
   qui paie, et son montant devient un avoir que l'encaissement sait déjà
   utiliser, en une ou plusieurs fois. Rien d'autre ne change ici. */

export function RattacherUneCarte({ porteur, clientId, nom, compact = false }: {
  porteur: CreditHolder | null;
  clientId: string;
  /** Le prénom affiché : « La rattacher à Awa ». */
  nom: string;
  compact?: boolean;
}) {
  const [cartes] = useCartesCadeaux();
  const { session } = useAuth();
  const [saisi, setSaisi] = useState('');
  const [ouvert, setOuvert] = useState(!compact);
  const { carte, ancien } = carteParCode(cartes, saisi);
  const refus = ancien
    ? 'Ce code a été remplacé : la carte porte désormais un autre code.'
    : saisi.trim().length >= 8 ? pourquoiOnNeRattachePas(carte, new Date().toISOString()) : null;

  if (!ouvert) {
    return (
      <button type="button" className="trcc-ouvre" onClick={() => setOuvert(true)}>
        Elle a une carte cadeau ?
      </button>
    );
  }

  const rattache = () => {
    if (!carte || !porteur) return;
    const r = rattacheLaCarte(carte, porteur, clientId, session?.user?.email ?? undefined);
    if (r) { toast(r); return; }
    toast(`Carte rattachée : ${fmtMoney(carte.montantXof ?? 0)} d’avoir pour ${nom}.`);
    setSaisi('');
    if (compact) setOuvert(false);
  };

  return (
    <div className="trcc-rattache">
      <label className="trcc-rattache__l" htmlFor="trcc-code">Carte cadeau</label>
      <input
        id="trcc-code"
        className="mnd-input trcc-rattache__code"
        value={saisi}
        onChange={(e) => setSaisi(e.target.value)}
        placeholder="MND-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
      />
      {carte && !refus && (
        <div className="trcc-rattache__trouve">
          <b>{objetDeLaCarte(carte)}</b>
          <span>Pour {carte.pour || '?'}, de la part de {carte.de || '?'}{carte.valableJusquau ? ` · valable jusqu’au ${new Date(`${carte.valableJusquau}T12:00:00Z`).toLocaleDateString('fr-FR')}` : ''}</span>
          <Button variant="copper" size="sm" onClick={rattache} disabled={!porteur}>
            {porteur ? `La rattacher à ${nom}` : 'Choisissez d’abord la cliente'}
          </Button>
        </div>
      )}
      {refus && <p className="trcc-rattache__refus">{refus}</p>}
      {saisi.trim().length >= 8 && !carte && !refus && <p className="trcc-rattache__refus">Aucune carte ne porte ce code.</p>}
    </div>
  );
}
