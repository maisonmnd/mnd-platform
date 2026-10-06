/* ══ LA PASTILLE DE LA SALLE D'ATTENTE — 2 octobre 2026 ══════════════════
   « Besoin de voir immédiatement les nouveaux messages qui sont prêts à
   partir » (Yéman). Elle vit dans la barre du Trône, sur tous les écrans :
   dès qu'un message entre dans la salle, elle s'allume, dit combien attendent
   et dans combien de minutes part le premier, et sonne une fois, doucement.
   Un clic mène à la salle (Conversations, les envois).

   ELLE NE SONNE QUE POUR CE QUI ENTRE. Les messages déjà en salle quand on
   ouvre le Trône ne sonnent pas : on ne fait pas sursauter un poste qui vient
   de s'allumer. Et le navigateur refuse tout son avant un premier geste ;
   `sonne()` se tait alors d'elle-même, la pastille, elle, s'affiche toujours. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../shared/branches';
import { sonne } from '../../../shared/sonnette';
import { EN_ATTENTE, RETENU, resumeDeLaSalle } from '../../../shared/salle-des-envois';
import { useEnvois } from '../routes/equipe/data';

export function PastilleDeLaSalle() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const [envois] = useEnvois();
  /* Le compte à rebours avance sans qu'aucun magasin ne bouge. */
  const [, bat] = useState(0);

  const enSalle = useMemo(
    () => envois.filter((e) => !!e && (!e.branchId || e.branchId === branch.id) && (e.statut === EN_ATTENTE || e.statut === RETENU)),
    [envois, branch.id],
  );
  const cleDesAttentes = enSalle.filter((e) => e.statut === EN_ATTENTE).map((e) => e.id).sort().join('|');

  useEffect(() => {
    if (enSalle.length === 0) return undefined;
    const t = window.setInterval(() => bat((n) => n + 1), 20_000);
    return () => window.clearInterval(t);
  }, [enSalle.length]);

  /* LE SON, pour ce qui ENTRE seulement. */
  const dejaVus = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(cleDesAttentes ? cleDesAttentes.split('|') : []);
    const avant = dejaVus.current;
    dejaVus.current = ids;
    if (avant === null) return;
    for (const id of ids) {
      if (!avant.has(id)) { sonne(); break; }
    }
  }, [cleDesAttentes]);

  if (enSalle.length === 0) return null;
  const r = resumeDeLaSalle(enSalle, Date.now());
  const mot = r.attente === 0
    ? `${r.tenus} envoi${r.tenus > 1 ? 's' : ''} retenu${r.tenus > 1 ? 's' : ''}`
    : `${r.attente} envoi${r.attente > 1 ? 's partent' : ' part'}${
      r.prochainDansMin === null ? '' : r.prochainDansMin <= 0 ? ' · à l’instant' : r.prochainDansMin <= 60 ? ` · dans ${r.prochainDansMin} min` : ' · au matin'}`;

  return (
    <button
      type="button"
      className={`tr-top__salle${r.attente === 0 ? ' tr-top__salle--tenus' : ''}`}
      onClick={() => navigate('/conversations?envois=1')}
      title="Ouvrir la salle d’attente des envois : retenir, relâcher, envoyer maintenant."
    >
      {mot}
    </button>
  );
}
