import { useState } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, signeLeMessage } from '../../../../shared/identite';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { useSettings } from '../../../../shared/settings';
import { compteDeLaDemande } from '../../../../shared/mnd-pay-pur';
import { demandeLePaiement, mndPayOuvert, useSaitLesFraisOfferts } from '../../../../shared/mnd-pay';
import { quiEncaisse } from '../../../../shared/finance';

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
  /* La cliente refuse les frais : la caissière les offre (18 octobre 2026). */
  const [offerts, setOfferts] = useState(false);
  const peutOffrir = useSaitLesFraisOfferts(mndPayOuvert(settings.mndPay));
  if (!mndPayOuvert(settings.mndPay) || resteXof <= 0 || !telephone) return null;
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
    if (!r.ok) { setErreur(r.erreur); return; }
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
        {occupe ? 'Création du lien…' : `Lien MND PAY · carte ou mobile money · ${fmtMoney(c.totalXof, currency)}`}
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
