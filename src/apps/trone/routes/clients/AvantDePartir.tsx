import { useMemo } from 'react';
import { fmtMoney } from '../../../../shared/currency';
import type { Product } from '../../../../shared/catalog';
import { PRIX_A_LA_CARTE, articlesEnFinDeRdv } from '../../../../shared/attentions-pur';
import { useArticlesDAttention } from '../../../../shared/attentions';
import './abonnement.css';

/* ══ AVANT DE PARTIR · 6 novembre 2026 ════════════════════════════════════
   Lot 3 de l'abonnement refait. « Ce qui est payant et à proposer aux
   clients, ça vient en upsell à la fin de son rendez-vous, et je pourrais
   choisir ce qu'on met en upsell » ; « des mini-coûts qui ne dépassent jamais
   1 500 francs. C'est entre 800 et 1 500 » (Yéman).

   Au moment d'encaisser, jusqu'à TROIS petits articles à la carte, ceux que
   la Maison a marqués « En fin de rendez-vous » dans la boutique des
   attentions. Proposés à toutes, abonnées ou non. Un toucher l'ajoute au
   ticket, un second le retire.

   RIEN DE NEUF DANS LA CAISSE : le toucher passe par le panier de « La
   Gamme » (`auPanier`), qui met déjà la ligne sur la pièce, l'encaisse et
   tient sa réserve. Le prix affiché est celui du produit du catalogue, le
   seul que la caisse encaisse ; s'il est sorti de la fourchette, l'article
   ne se propose pas. */

export function AvantDePartir({ branchId, produits, panier, auPanier, currency }: {
  branchId: string;
  produits: readonly Product[];
  panier: Record<string, number>;
  auPanier: (id: string, delta: number) => void;
  currency: Parameters<typeof fmtMoney>[1];
}) {
  const [articles] = useArticlesDAttention();
  const proposes = useMemo(() => articlesEnFinDeRdv(articles.filter((a) => !a.branchId || a.branchId === branchId))
    .map((a) => ({ a, produit: produits.find((p) => p.id === a.produitId) }))
    .filter((x): x is { a: typeof x.a; produit: Product } => !!x.produit && x.produit.priceXof >= PRIX_A_LA_CARTE.min && x.produit.priceXof <= PRIX_A_LA_CARTE.max),
  [articles, branchId, produits]);
  if (proposes.length === 0) return null;
  return (
    <div className="trc-avant" aria-label="Avant de partir">
      <span className="trc-avant__t">Avant de partir</span>
      <div className="trc-avant__choix">
        {proposes.map(({ a, produit }) => {
          const q = panier[produit.id] ?? 0;
          return (
            <button key={a.id} type="button" className={`trc-avant__a ${q > 0 ? 'is-on' : ''}`} aria-pressed={q > 0} onClick={() => auPanier(produit.id, q > 0 ? -q : 1)}>
              <b>{produit.name}</b>
              <span className="trc-avant__prix">{fmtMoney(produit.priceXof, currency)}</span>
              <span>{q > 0 ? 'Ajouté au ticket' : 'Ajouter au ticket'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
