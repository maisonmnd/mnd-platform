import { toast } from '../../../../ds/components';
import { quiEncaisse } from '../../../../shared/finance';
import { panierDit, tempsDuPanier, type PanierDAttention } from '../../../../shared/attentions-pur';
import { arriveeAuFauteuil, remiseAuFauteuil, useArticlesDAttention, usePaniersDAttention } from '../../../../shared/attentions';
import './abonnement.css';

/* ══ LE PANIER DE LA SÉANCE, ET SES DEUX GESTES · 6 novembre 2026 ═════════
   Lot 3 de l'abonnement refait : « Arrivée », puis « Remise ». Le même bloc
   sert la fiche du rendez-vous et la ligne du jour d'Abonnements.

   · « Arrivée » : l'équipe l'accueille ; le panier dit ce qu'il faut servir
     et remettre. Dans Ma Couronne, son pli lui souhaite la bienvenue.
   · « Remise » : le présent et la carte sont remis. Le panier se fige, la
     réserve comptée baisse, et l'attention se lit dans Ma Couronne avec le
     mot de sa carte.

   Tant que le panier n'est pas validé (onglet « Les attentions »), aucun
   geste : on ne remet pas une attention que la Maison n'a pas choisie. */

const heureDe = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: 'Africa/Porto-Novo' }).format(d);
  return h.replace(':', ' h ');
};

/** Les deux gestes d'un panier, et son état en une phrase. */
export function GestesDuPanier({ panier, compact }: { panier: PanierDAttention | undefined; compact?: boolean }) {
  const [articles] = useArticlesDAttention();
  const temps = tempsDuPanier(panier);
  const maintenant = (): string => new Date().toISOString();
  return (
    <>
      {!compact && <span className="trc-seance-formule__s">{panierDit(panier, articles, heureDe)}</span>}
      {panier && temps === 'pret' && (
        <button type="button" className="trc-abo__btn is-plein" onClick={() => { arriveeAuFauteuil(panier.id, maintenant(), quiEncaisse()); toast('Arrivée notée.'); }}>Arrivée</button>
      )}
      {panier && temps === 'arrivee' && (
        <button type="button" className="trc-abo__btn is-plein" onClick={() => {
          if (remiseAuFauteuil(panier.id, maintenant(), quiEncaisse())) toast('Remise notée : elle retrouve son attention dans Ma Couronne.');
        }}>Remise</button>
      )}
      {temps === 'remis' && <span className="trc-abo__fait">Remis</span>}
    </>
  );
}

/** Le panier d'un rendez-vous, par son identifiant. */
export function usePanierDuRendezVous(apptId: string | undefined): PanierDAttention | undefined {
  const [paniers] = usePaniersDAttention();
  return apptId ? paniers.find((p) => p.id === apptId) : undefined;
}

/** Sur la fiche du rendez-vous d'une séance de formule : son attention. */
export function PanierDeLaSeance({ apptId }: { apptId: string }) {
  const panier = usePanierDuRendezVous(apptId);
  const [articles] = useArticlesDAttention();
  const nom = (id: string | undefined): string | undefined => (id ? articles.find((a) => a.id === id)?.nom : undefined);
  const fige = panier?.recu;
  const lignes: [string, string | undefined][] = panier ? [
    ['À boire', fige?.boire ?? nom(panier.boire)],
    ['À goûter', fige?.gout ?? nom(panier.gout)],
    ['Le présent', fige?.present ?? nom(panier.present)],
    ['La carte', panier.carte ? `${panier.carte.serie} n° ${String(panier.carte.numero).padStart(2, '0')}` : undefined],
  ] : [];
  return (
    <div className="trc-attention">
      <span className="trc-attention__t">L’attention{panier?.or ? ' · sceau d’or' : ''}</span>
      {panier && panier.etat === 'valide' && (
        <dl className="trc-attention__lignes">
          {lignes.filter(([, v]) => !!v).map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
          {panier.mot && <div><dt>Le mot</dt><dd className="trc-attention__mot">« {panier.mot} »</dd></div>}
        </dl>
      )}
      <div className="trc-abo__gestes"><GestesDuPanier panier={panier} /></div>
    </div>
  );
}
