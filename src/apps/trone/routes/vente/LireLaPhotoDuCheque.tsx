import { useState } from 'react';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { demandeAClaude, useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import {
  CHANTIER_DU_RECU, SCHEMA_DU_CHEQUE, USAGE_DU_RECU, chequeDit, consigneDuCheque, lectureDuCheque, type ChequeLu,
} from '../../../../shared/ia-recu-pur';
import { BANQUES_DU_BENIN } from '../../../../shared/trace-du-moyen-pur';
import { COFFRE_DES_TRACES } from '../../../../shared/traces-coffre';
import { staffAccessStore } from '../equipe/data';

/* ══ « LIRE LA PHOTO » DU CHÈQUE — 19 octobre 2026 (chantier `recu`) ═════
   Maquette validée : « Même geste pour un chèque à l'encaissement : la banque
   et le numéro se lisent sur la photo, la trace est faite. »

   LA PHOTO EST DÉJÀ AU COFFRE (`traces-privees`, 0134) : on ne la renvoie
   pas, on donne son chemin à la fonction, qui la lit avec sa clé. Ce que
   Claude rend est revalidé (`lectureDuCheque`) puis posé en cuivre dans la
   banque et le numéro ; la personne vérifie, et c'est l'encaissement, comme
   avant, qui inscrit. Le montant et le tireur lus se disent à côté, pour
   comparer, sans remplir « Au nom de » (il ne sert que si ce n'est pas la
   cliente). */
export function LireLaPhotoDuCheque({ chemin, onLu }: { chemin: string; onLu: (l: ChequeLu) => void }) {
  /* Les crochets d'abord, le retour anticipé ensuite. */
  const moi = useStaff();
  const acces = useStore(staffAccessStore)[0][moi?.user_id ?? ''];
  const sait = useSaitIaMaison();
  const [etat, setEtat] = useState<'repos' | 'lecture'>('repos');
  const [mot, setMot] = useState<string | null>(null);
  if (sait !== true || !peutDemander(moi?.role, CHANTIER_DU_RECU, acces)) return null;

  const lire = async () => {
    setEtat('lecture'); setMot(null);
    const d = new Date();
    const aujourdhui = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await demandeAClaude<unknown>({
      chantier: CHANTIER_DU_RECU,
      usage: USAGE_DU_RECU,
      systeme: consigneDuCheque({ aujourdhui, banques: BANQUES_DU_BENIN }),
      messages: [{ role: 'user', content: 'Lis ce chèque et rends ce que tu lis, rien de plus.' }],
      images: [{ coffre: COFFRE_DES_TRACES, chemin }],
      schema: SCHEMA_DU_CHEQUE,
      maxTokens: 600,
    });
    setEtat('repos');
    if (!r.ok) { setMot(`${r.message} Notez la banque et le numéro.`); return; }
    const lu = lectureDuCheque(r.data, { aujourdhui, banques: BANQUES_DU_BENIN });
    if (!lu) { setMot('Rien d’utilisable n’a été lu sur la photo : notez la banque et le numéro.'); return; }
    setMot(`Lu : ${chequeDit(lu)}.${lu.avertissements.length ? ` ${lu.avertissements.join(' ')}` : ''} Vérifiez les cases cuivrées.`);
    onLu(lu);
  };

  return (
    <>
      <button type="button" className="tre-link-btn" disabled={etat === 'lecture'} onClick={() => void lire()}>
        {etat === 'lecture' ? 'Lecture de la photo…' : 'Lire la photo'}
      </button>
      {mot && <span role="status" style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--copper-700)', lineHeight: 1.5 }}>{mot}</span>}
    </>
  );
}
