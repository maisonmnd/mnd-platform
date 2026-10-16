import { useState } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, signeLeMessage } from '../../../../shared/identite';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { useSettings } from '../../../../shared/settings';
import { compteDeLaDemande } from '../../../../shared/mnd-pay-pur';
import { demandeLePaiement, mndPayOuvert } from '../../../../shared/mnd-pay';

/* ══ LE LIEN MND PAY D'UNE PIÈCE — 16 octobre 2026 ═════════════════════
   « À distance : une échéance, un acompte, une cliente de la diaspora »
   (maquette UigU1Rr5…). Le lien vaut pour CE montant et CETTE pièce ; la
   cliente choisit sur la page de FedaPay : mobile money ou carte (Visa,
   Mastercard, débit compris, d'ici ou de l'étranger). Payé, la pièce se règle
   seule (`useMndPayRattache`), Trône ouvert ou non.

   Les frais sont ajoutés (sa décision) et le message les dit : un montant
   plus haut que la facture, sans explication, passe pour une erreur. */
export function LienMndPay({ branchId, pieceId, pieceNumero, clientId, telephone, appel, resteXof, currency }: {
  branchId: string;
  pieceId: string;
  pieceNumero: string;
  clientId?: string;
  telephone: string;
  appel: string;
  resteXof: number;
  currency: string;
}) {
  const [settings] = useSettings();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!mndPayOuvert(settings.mndPay) || resteXof <= 0 || !telephone) return null;
  const c = compteDeLaDemande({ montantXof: resteXof, moyen: 'au_choix', reglages: settings.mndPay });

  const envoie = async () => {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    const r = await demandeLePaiement({
      branchId, genre: 'lien', moyen: 'au_choix', montantXof: resteXof, pieceId, pieceNumero, clientId,
      libelle: `${maisonNom()} · ${pieceNumero}`, reglages: settings.mndPay,
    });
    setOccupe(false);
    if (!r.ok) { setErreur(r.erreur); return; }
    const msg = signeLeMessage(
      `${maisonNom()}\n` +
      `Bonjour ${appel}, pour régler ${fmtMoney(resteXof, currency)} par mobile money ou par carte, ouvrez cette page de paiement sécurisée : ${fmtMoney(c.totalXof, currency)}, frais de paiement compris.\n${r.url}\n` +
      `Référence ${pieceNumero}`,
    );
    window.location.hash = `#${cheminDeLaConversation(telephone, msg) ?? '/conversations'}`;
  };

  return (
    <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6 }}>
      <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer' }} disabled={occupe} onClick={() => void envoie()}>
        {occupe ? 'Création du lien…' : `Lien MND PAY · carte ou mobile money · ${fmtMoney(c.totalXof, currency)}`}
      </button>
      {erreur && <span role="alert" style={{ fontSize: 12, color: 'var(--color-brique, #96412E)' }}>{erreur}</span>}
    </div>
  );
}
