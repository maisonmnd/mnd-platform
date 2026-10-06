import { useState } from 'react';
import { Modal, toast } from '../../../../ds/components';
import { settingsStore, useSettings } from '../../../../shared/settings';
import { useCashboxes } from '../../../../shared/finance';
import { useBranch } from '../../../../shared/branches';
import { monthKey, todayISO } from './_shared';

/** « octobre 2026 » : le départ porte son année. */
export const moisEtAn = (mk: string): string =>
  /^\d{4}-\d{2}$/.test(mk) ? new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : mk;

/* ══ LE DÉPART DES CAISSES — 4 octobre 2026 ═══════════════════════════
   « Comment je peux mettre toutes les caisses à 0 à partir d'aujourd'hui ?
   Je commence une nouvelle comptabilité à partir du 01 octobre. Le reste
   sera des corrections du passé » (Yéman).

   UN MOIS DE DÉPART, PAS UN EFFACEMENT. Les factures, dépenses, transferts
   et versements d'avant restent où ils sont, lisibles, corrigeables ; ils ne
   bougent simplement plus aucun solde. Chaque caisse part de son solde
   d'ouverture, remis à 0 ici si on le demande (ce qu'on a compté dans le
   tiroir le 1er au matin s'y écrit ensuite, caisse par caisse).

   Le réglage vaut pour toutes les caisses de la Maison ; le coffre n'en est
   pas une et garde son histoire. */
export function DepartDesCaisses({ onClose }: { onClose: () => void }) {
  const [reglages] = useSettings();
  const { branch } = useBranch();
  const [caisses, setCaisses] = useCashboxes();
  const [mois, setMois] = useState(reglages.caissesDepuis ?? monthKey(todayISO()));
  const [aZero, setAZero] = useState(true);
  const lesNotres = caisses.filter((c) => c.branchId === branch.id);
  const avecOuverture = lesNotres.filter((c) => (c.openingXof ?? 0) !== 0);

  const poser = () => {
    if (!/^\d{4}-\d{2}$/.test(mois)) { toast('Choisissez un mois.'); return; }
    settingsStore.set((prev) => ({ ...prev, caissesDepuis: mois }));
    if (aZero && avecOuverture.length > 0) {
      setCaisses((prev) => prev.map((c) => (c.branchId === branch.id ? { ...c, openingXof: 0 } : c)));
    }
    toast(`Les caisses comptent depuis ${moisEtAn(mois)}${aZero ? ', à partir de 0' : ''}.`);
    onClose();
  };
  const retirer = () => {
    settingsStore.set((prev) => { const { caissesDepuis: _, ...reste } = prev; return reste; });
    toast('Les caisses comptent de nouveau depuis toujours.');
    onClose();
  };

  return (
    <Modal title="Le départ des caisses" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
          À partir de ce mois, les soldes des caisses ne comptent que ce qui entre et sort
          depuis le 1er. Tout ce qui est daté d’avant reste dans les relevés, se lit et se
          corrige, mais ne bouge plus aucun solde. Le coffre garde son histoire.
        </div>
        <label className="mnd-field">
          <span className="mnd-field__label">Les caisses comptent à partir du 1er</span>
          <input className="mnd-input" type="month" value={mois} onChange={(e) => setMois(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={aZero} onChange={(e) => setAZero(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Remettre le solde d’ouverture de chaque caisse à <b>0</b>
            <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>
              {avecOuverture.length === 0
                ? 'Toutes les caisses partent déjà de 0.'
                : `${avecOuverture.length} caisse${avecOuverture.length > 1 ? 's ont' : ' a'} un solde d’ouverture aujourd’hui : ${avecOuverture.map((c) => c.name).join(', ')}.`}
              {' '}S’il y avait de l’argent dans un tiroir le 1er au matin, écrivez-le ensuite dans sa fiche.
            </span>
          </span>
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {reglages.caissesDepuis ? (
            <button className="mnd-btn mnd-btn--ghost" onClick={retirer}>Compter depuis toujours</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="mnd-btn mnd-btn--ghost" onClick={onClose}>Annuler</button>
            <button className="mnd-btn" onClick={poser}>Partir de {moisEtAn(mois)}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
