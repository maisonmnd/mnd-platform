import { useState } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, signeLeMessage } from '../../../../shared/identite';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { useSettings } from '../../../../shared/settings';
import { compteDeLaDemande } from '../../../../shared/mnd-pay-pur';
import { demandeLePaiement, mndPayOuvert, useSaitLesFraisOfferts } from '../../../../shared/mnd-pay';
import { quiEncaisse } from '../../../../shared/finance';
import { appointmentsStore } from '../../../../shared/agenda';
import { adresseDuLien, poseLeLienDeReglement } from '../../../../shared/regler-la-seance';
import { motDuLienRegler } from '../../../../shared/regler-par-fedapay-pur';
import { signaleUnePanne, signaleUneReussite, useLaSanteDesMoyens } from '../clients/sante-des-moyens';
import { toast } from '../../../../ds/components';

/* ══ LE LIEN MND PAY D'UNE PIÈCE — 16 octobre 2026 ═════════════════════
   « À distance : une échéance, un acompte, une cliente de la diaspora »
   (maquette UigU1Rr5…). Le lien vaut pour CE montant et CETTE pièce ; la
   cliente choisit sur la page de FedaPay : mobile money ou carte (Visa,
   Mastercard, débit compris, d'ici ou de l'étranger). Payé, la pièce se règle
   seule (`useMndPayRattache`), Trône ouvert ou non.

   Les frais sont ajoutés (sa décision) et le message les dit : un montant
   plus haut que la facture, sans explication, passe pour une erreur.

   FEDAPAY NE RÉPOND PAS (12 novembre 2026, le choix du moyen, lot C,
   « chacun secours de l'autre ») : la santé des moyens (relue chaque minute,
   et retenue dix minutes après une vraie demande muette) le dit en une
   ligne, et le Trône propose À LA PLACE la page « Régler » du rendez-vous de
   la pièce (KkiaPay, plus MTN), le même lien et la même phrase que
   « Envoyer le lien de paiement » de Factures. Une pièce sans rendez-vous :
   la ligne le dit, rien d'autre. */
export function LienMndPay({ branchId, pieceId, pieceNumero, clientId, telephone, appel, resteXof, currency, apptId }: {
  branchId: string;
  pieceId: string;
  pieceNumero: string;
  clientId?: string;
  telephone: string;
  appel: string;
  resteXof: number;
  currency: string;
  /** Le rendez-vous de la pièce (une facture de rituel) : sa page « Régler » est le secours. */
  apptId?: string;
}) {
  const [settings] = useSettings();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* La cliente refuse les frais : la caissière les offre (18 octobre 2026). */
  const [offerts, setOfferts] = useState(false);
  const peutOffrir = useSaitLesFraisOfferts(mndPayOuvert(settings.mndPay));
  const sante = useLaSanteDesMoyens(mndPayOuvert(settings.mndPay) && resteXof > 0 && !!telephone, mndPayOuvert(settings.mndPay));
  if (!mndPayOuvert(settings.mndPay) || resteXof <= 0 || !telephone) return null;

  /* LE SECOURS : FedaPay branché mais muet. */
  if (sante.fedapay.ouvert && !sante.fedapay.repond) {
    const aSonRdv = !!apptId && appointmentsStore.get().some((a) => a.id === apptId);
    const pourquoi = sante.fedapay.pourquoi ?? 'FedaPay ne répond pas';
    const ligne = `${pourquoi.charAt(0).toUpperCase()}${pourquoi.slice(1)} : ${aSonRdv
      ? 'envoyez plutôt la page « Régler » de sa séance (KkiaPay, ou MTN).'
      : 'cette pièce n’a pas de rendez-vous, donc pas de page « Régler ». Réessayez plus tard, ou encaissez au comptoir.'}`;
    /* Le jeton se pose AU TOUCHER, jamais à l'affichage (la règle de Factures). */
    const envoieRegler = () => {
      const j = apptId ? poseLeLienDeReglement(apptId) : null;
      if (!j) { toast('Le lien n’a pas pu se poser : le rendez-vous de cette pièce est introuvable.'); return; }
      const msg = signeLeMessage(`${maisonNom()}
${motDuLienRegler(appel, fmtMoney(resteXof, currency), adresseDuLien(j))}`);
      window.location.hash = `#${cheminDeLaConversation(telephone, msg) ?? '/conversations'}`;
    };
    return (
      <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6 }}>
        <span role="status" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{ligne}</span>
        {aSonRdv && (
          <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer' }} onClick={envoieRegler}>
            {`Lien « Régler » · KkiaPay ou MTN · ${fmtMoney(resteXof, currency)}`}
          </button>
        )}
      </div>
    );
  }
  const dus = compteDeLaDemande({ montantXof: resteXof, moyen: 'au_choix', reglages: settings.mndPay }).fraisXof;
  const offre = peutOffrir && offerts && dus > 0;
  const c = compteDeLaDemande({ montantXof: resteXof, moyen: 'au_choix', reglages: settings.mndPay, fraisOfferts: offre });

  const envoie = async () => {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    const r = await demandeLePaiement({
      branchId, genre: 'lien', moyen: 'au_choix', montantXof: resteXof, pieceId, pieceNumero, clientId,
      libelle: `${maisonNom()} · ${pieceNumero}`, reglages: settings.mndPay,
      ...(offre ? { fraisOfferts: true, offertsPar: quiEncaisse() } : {}),
    });
    setOccupe(false);
    /* La santé l'apprend : une panne (5xx, fonction muette) bascule la ligne au secours ; une réussite l'efface. */
    if (!r.ok) { if (r.panne) signaleUnePanne('fedapay'); setErreur(r.erreur); return; }
    signaleUneReussite('fedapay');
    /* Jamais de numéro de pièce dans un message à la cliente (18 octobre
       2026, sa décision) : seul le PDF le porte. */
    const msg = signeLeMessage(
      `${maisonNom()}\n` +
      `Bonjour ${appel}, pour régler ${fmtMoney(resteXof, currency)} par mobile money ou par carte, ouvrez cette page de paiement sécurisée${offre ? '' : ` : ${fmtMoney(c.totalXof, currency)}, frais de paiement compris`}.\n${r.url}`,
    );
    window.location.hash = `#${cheminDeLaConversation(telephone, msg) ?? '/conversations'}`;
  };

  return (
    <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6 }}>
      <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer' }} disabled={occupe} onClick={() => void envoie()}>
        {occupe ? 'Création du lien…' : `Lien FedaPay · carte ou mobile money · ${fmtMoney(c.totalXof, currency)}`}
      </button>
      {peutOffrir && dus > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={offerts} onChange={(e) => setOfferts(e.target.checked)} aria-label="Offrir les frais du lien" />
          <span>Offrir les frais ({fmtMoney(dus, currency)}) : elle paie {fmtMoney(resteXof, currency)} tout rond</span>
        </label>
      )}
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-brique, #96412E)' }}>{erreur}</span>}
    </div>
  );
}
