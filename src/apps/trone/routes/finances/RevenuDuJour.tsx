import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useStaff as useMaTete } from '../../../../shared/auth';
import type { Appointment } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import type { Receipt } from '../../../../shared/receipts';
import { usePointages, useClotures } from '../../../../shared/caisse-du-soir';
import {
  revenuDuJour, etatDuPointage, parMoyen, bilanDuPointage, type EtatDuPointage, type Pointage,
} from '../../../../shared/caisse-du-soir-pur';
import { apptLabel, apptNetXof, frShort, useServicesById, useBranchAppointments } from '../clients/_shared';
import { useRegistreEncaissements } from './_shared';
import './caisse-du-soir.css';

/* ══ LE REVENU DU JOUR, POINTÉ — 3 octobre 2026 ══════════════════════════
   Maquette « Le pointage du jour », validée. La fenêtre qu'ouvre une barre
   du tableau de bord. Elle ne listait que des noms et des montants, et son
   total ajoutait les rituels honorés sans facture (aucun franc entré) et
   l'avoir déjà versé un autre jour. Désormais :
     - le total est l'ARGENT REÇU ce jour-là (`revenuDuJour`) ;
     - les lignes se rangent par moyen, avec heure, tiroir et main ;
     - chacune dit si elle est pointée, et comment ; le Mobile Money se
       pointe ici à la main, ou par le relevé MTN (Encaissements) ;
     - les rituels honorés sans argent reçu vont dans « À facturer ». */

const PUCE: Record<EtatDuPointage, { texte: string; classe: string }> = {
  kkiapay: { texte: 'pointé · KkiaPay', classe: 'is-auto' },
  releve: { texte: 'pointé · relevé', classe: 'is-ok' },
  main: { texte: 'pointé', classe: 'is-ok' },
  comptage: { texte: 'pointé · comptage', classe: 'is-ok' },
  'au-comptage': { texte: 'au comptage du soir', classe: 'is-attente' },
  'a-pointer': { texte: 'à pointer', classe: 'is-attente' },
};

const POURQUOI_DU_GROUPE: Record<string, string> = {
  'Espèces': 'se pointent au comptage du tiroir',
  'MTN MoMo': 'relevé MTN ou coche après vérification',
  'Moov Money': 'se pointe à la main',
  'KkiaPay, en ligne': 'vérifié par le serveur',
};

export function RevenuDuJour({ iso, onClose, onOpenAppt }: {
  iso: string;
  onClose: () => void;
  /** Un rituel « à facturer » s'ouvre sur sa fiche de rendez-vous. */
  onOpenAppt?: (a: Appointment) => void;
}) {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const me = useMaTete();
  const registre = useRegistreEncaissements();
  const [pointages, setPointages] = usePointages();
  const [clotures] = useClotures();
  const appts = useBranchAppointments();
  const [clientes] = useClients();
  const nomDe = (a: Appointment) => a.clientName || clientes.find((c) => c.id === a.clientId)?.name || 'Cliente';
  const byId = useServicesById();
  const moi = me?.name?.trim() || 'Sans nom';
  const souverain = me?.role === 'souverain';

  const lignes = useMemo(() => revenuDuJour(registre, iso), [registre, iso]);
  const parId = useMemo(() => new Map(pointages.map((p) => [p.id, p] as const)), [pointages]);
  const cloturesIci = useMemo(() => clotures.filter((c) => c.branchId === branch.id), [clotures, branch.id]);
  const etat = (r: Receipt) => etatDuPointage(r, parId, cloturesIci);
  const groupes = parMoyen(lignes);
  const bilan = bilanDuPointage(lignes, etat);

  /* À FACTURER : honoré ce jour, sans pièce et sans le moindre versement.
     Un rituel réglé sans pièce, lui, est déjà au registre (« Rituel · sans
     pièce ») : il a fait entrer de l'argent. */
  const aFacturer = appts.filter((a) => a.branchId === branch.id && a.date === iso && a.status === 'honoré'
    && !a.invoiceId && !(a.paidXof ?? 0) && !(a.payments ?? []).some((p) => p.amountXof > 0));
  const aFacturerXof = aFacturer.reduce((s, a) => s + apptNetXof(a, byId), 0);

  const pointer = (r: Receipt) => {
    const p: Pointage = {
      id: r.id, branchId: branch.id, date: r.date, montantXof: r.amountXof,
      comment: 'main', par: moi, le: new Date().toISOString(),
    };
    setPointages((prev) => [...prev.filter((x) => x.id !== r.id), p]);
  };
  /* Dépointer : la main qui a pointé, ou la direction. Un pointage du relevé
     se défait aussi : le relevé peut s'être trompé de ligne (même montant). */
  const depointer = (r: Receipt) => setPointages((prev) => prev.filter((x) => x.id !== r.id));
  const peutDepointer = (p?: Pointage) => !!p && (souverain || p.par === moi);

  const heureDuPointage = (p?: Pointage) => (p ? new Date(p.le).toTimeString().slice(0, 5) : '');

  return (
    <Modal title={`Revenu · ${frShort(iso)}`} onClose={onClose} width={700}>
      <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        L’argent reçu ce jour-là, par moyen. Les espèces se pointent au comptage du soir, le Mobile Money par le relevé MTN ou à la main.
      </div>
      <div className="cds-tuiles">
        <div className="cds-tuile"><small>Reçu</small><b>{fmtMoney(bilan.recuXof, currency)}</b></div>
        <div className="cds-tuile is-ok"><small>Pointé</small><b>{fmtMoney(bilan.pointeXof, currency)}</b></div>
        <div className={`cds-tuile${bilan.aPointerXof > 0 ? ' is-reste' : ''}`}><small>À pointer</small><b>{fmtMoney(bilan.aPointerXof, currency)}</b></div>
        <div className={`cds-tuile${bilan.auComptageXof > 0 ? ' is-reste' : ''}`}><small>Au comptage</small><b>{fmtMoney(bilan.auComptageXof, currency)}</b></div>
      </div>

      {lignes.length === 0 ? (
        <div className="trc-empty">Aucun argent reçu ce jour-là.</div>
      ) : (
        <div className="cds-defile">
          {groupes.map((g) => (
            <div className="cds-groupe" key={g.famille}>
              <div className="cds-groupe__tete">
                <b>{g.famille}</b>
                {POURQUOI_DU_GROUPE[g.famille] && <span>{POURQUOI_DU_GROUPE[g.famille]}</span>}
                <span className="cds-n">{fmtMoney(g.totalXof, currency)}</span>
              </div>
              {g.lignes.map((r) => {
                const e = etat(r);
                const p = parId.get(r.id);
                const puce = PUCE[e];
                const sous = [
                  r.ref,
                  r.cashbox,
                  r.encaissePar ? `encaissé par ${r.encaissePar}` : null,
                  p && e !== 'kkiapay' ? `${p.comment === 'releve' ? 'relevé' : p.par}, ${heureDuPointage(p)}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <div className="cds-ligne" key={r.id}>
                    <span className="cds-ligne__h">{r.heure ?? ''}</span>
                    <span className="cds-ligne__qui">
                      {r.invoiceId ? (
                        <button type="button" title="Ouvrir la facture" onClick={() => { onClose(); navigate(`/factures?id=${r.invoiceId}`); }}>{r.clientName}</button>
                      ) : (
                        <span className="cds-nom">{r.clientName}</span>
                      )}
                      {sous && <small>{sous}</small>}
                    </span>
                    <span className="cds-ligne__m">{fmtMoney(r.amountXof, currency)}</span>
                    <span className="cds-etat">
                      {e === 'a-pointer' ? (
                        <button type="button" className="cds-bouton" onClick={() => pointer(r)}>Pointer</button>
                      ) : (
                        <span className={`cds-puce ${puce.classe}`}>
                          {puce.texte}
                          {(e === 'main' || e === 'releve') && peutDepointer(p) && (
                            <button type="button" title="Dépointer" aria-label="Dépointer" onClick={() => depointer(r)}>×</button>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {aFacturer.length > 0 && (
        <div className="cds-afacturer">
          <b>À facturer : {aFacturer.length} rituel{aFacturer.length > 1 ? 's' : ''} honoré{aFacturer.length > 1 ? 's' : ''}</b> sans argent reçu ({fmtMoney(aFacturerXof, currency)} au prix du carnet). Ils ne comptent pas dans le revenu tant que l’argent n’est pas entré.
          <ul>
            {aFacturer.map((a) => (
              <li key={a.id}>
                {onOpenAppt
                  ? <button type="button" onClick={() => { onClose(); onOpenAppt(a); }}>{nomDe(a)} · {apptLabel(a, byId)}</button>
                  : <span>{nomDe(a)} · {apptLabel(a, byId)}</span>}
                <span>{fmtMoney(apptNetXof(a, byId), currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lignes.length > 0 && (
        <div className="cds-pied">
          <span>Total reçu</span>
          <b>{fmtMoney(bilan.recuXof, currency)}</b>
        </div>
      )}
    </Modal>
  );
}
