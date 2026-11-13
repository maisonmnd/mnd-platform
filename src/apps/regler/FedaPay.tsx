import { useEffect, useState } from 'react';
import { compteDuLien, ditDuLien } from '../../shared/regler-par-fedapay-pur';
import { demandeFedaPay, fedapayOuvertPourLaPage, type ReponseFedaPay } from '../../shared/regler-par-fedapay-serveur';

/* ══ PAYER PAR FEDAPAY, LE SECOURS DE KKIAPAY · 12 novembre 2026 ════════
   Le choix du moyen, lot C (« chacun secours de l'autre »). Ce bloc ne
   paraît que quand KkiaPay ne peut pas s'ouvrir : pas de clé, son script
   injoignable, une erreur technique. Jamais quand elle annule elle-même :
   KkiaPay reste alors le seul bouton, comme avant.

   Les frais de FedaPay s'AJOUTENT pour elle (la décision de la Maison) et se
   disent avant le geste, au taux que le serveur rend (`regler-ouvert`), par
   la même règle que lui (`compteDuLien`) : le montant que FedaPay demandera
   est celui que le serveur calcule, la page ne fait que l'annoncer. Elle
   choisit mobile money ou carte sur la page de FedaPay, qui la ramène ici. */

const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

export function PayerParFedaPay({ jeton, reste, merciXof, merciPermis, bloque }: {
  jeton: string;
  /** Le reste que la page a lu au serveur (le serveur le relit à la demande). */
  reste: number;
  /** Le merci qu'elle a choisi sur la page (le serveur le plafonne et le refuse si la pièce en porte un). */
  merciXof: number;
  merciPermis: boolean;
  /** Une demande MTN en cours, un paiement qui part, un retour de FedaPay qui se confirme. */
  bloque: boolean;
}) {
  const [ouvert, setOuvert] = useState<{ ouverte: boolean; taux?: ReponseFedaPay['taux'] } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    void fedapayOuvertPourLaPage(jeton).then((r) => { if (vivant) setOuvert({ ouverte: r.ok === true && r.ouverte === true, taux: r.taux }); });
    return () => { vivant = false; };
  }, [jeton]);

  if (!ouvert) return <p className="rg-doux rg-petit rg-centre" aria-live="polite">KkiaPay ne répond pas : la Maison cherche un autre moyen…</p>;
  if (!ouvert.ouverte) {
    return <p className="rg-doux rg-petit rg-centre">Le paiement en ligne ne répond pas pour l’instant. Réessayez dans un moment, ou réglez à l’accueil.</p>;
  }
  const compte = compteDuLien({ resteXof: reste, merciXof, merciPermis, reglages: { actif: true, ...(ouvert.taux ?? {}) } });
  if (!compte.ok) return null;

  const paie = async () => {
    if (envoi || bloque) return;
    setEnvoi(true);
    setErreur('');
    const r = await demandeFedaPay(jeton, merciPermis ? merciXof : 0, `${window.location.origin}${window.location.pathname}`);
    if (r.ok && r.url && /^https:\/\//.test(r.url)) { window.location.assign(r.url); return; }
    setEnvoi(false);
    setErreur(ditDuLien(r.erreur));
  };

  return (
    <div className="rg-mtn">
      <p className="rg-mtn-titre">Payer par FedaPay</p>
      <p className="rg-doux rg-petit">KkiaPay ne répond pas pour l’instant : FedaPay prend le relais. Mobile money (MTN, Moov, Celtiis) ou carte, sur la page sécurisée de FedaPay.</p>
      <div className="rg-lignes">
        <div className="rg-ligne rg-doux"><span>Frais de FedaPay, ajoutés</span><span>+ {francs(compte.fraisXof)}</span></div>
        <div className="rg-ligne rg-fort"><span>Total demandé par FedaPay</span><span>{francs(compte.totalXof)}</span></div>
      </div>
      <button type="button" className="rg-regler" disabled={bloque || envoi} onClick={() => { void paie(); }}>
        {envoi ? 'Ouverture de FedaPay…' : `Payer par FedaPay · ${francs(compte.totalXof)}`}
      </button>
      {erreur && <p className="rg-souci" role="alert">{erreur}</p>}
    </div>
  );
}
