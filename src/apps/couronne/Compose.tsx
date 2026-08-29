import { asset } from '../../shared/asset';
import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import {
  composeStore, vitrineConfigStore, surMesureDe, formulesVisiblesPour,
  demandesFormuleStore, useDemandesFormule, demandeOuverteDe, type ComposePayload,
} from '../../shared/bridges';
import { usePlans, moisDuPack, FAMILLES_FORMULES, type Plan } from '../../shared/abonnements';
import { useStore } from '../../shared/store';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, estProposable } from '../../shared/pricing';
import { pushNotifyStaff } from '../../shared/push';
import { uid } from '../../shared/store';
import { useAppointments, venuesHonorees } from '../../shared/agenda';
import { useFamilies } from '../../shared/clients';
import { fmtDuration, useClient, useVisibleCatalog } from './lib';
import Cycle, { semainesDuForfait } from './Cycle';
import { priceModeOf, sousArbreOf, useCategories, useServices, useProducts, type Service, type ServiceInclus } from '../../shared/catalog';

/* RITUEL SUR-MESURE — mix & match.
   Ponctuel −10 % · Abonnement −15 % (l'entretien et la réparation, 3 prestations minimum).
   « Composer » publie le payload sur le pont mnd_couronne_compose → Le Trône.

   TROIS ONGLETS DEPUIS LE 16 AOÛT (demande de Yéman : « le Ponctuel et
   l'Abonnement vendent les mêmes choses »). Les deux premiers restent LE
   COMPOSEUR — elle bâtit son pack, seuls le taux, le minimum et les ateliers
   ouverts les séparent. Le troisième est neuf : LES FORFAITS DE LA CARTE, ceux
   que la Maison a déjà composés au Catalogue. Ils n'avaient aucune vitrine ici
   alors qu'ils sont son offre la plus travaillée.

   LE GESTE SUIT LE FORFAIT (décision de Yéman) : une seule séance se RÉSERVE —
   le tunnel s'ouvre dessus, elle choisit son créneau — plusieurs séances se
   DEMANDENT, parce qu'un cycle de trois mois ou de douze ne se programme pas
   en enfilade au téléphone : la Maison le cale avec elle. */

/* Catégories éligibles à l'abonnement, PAR IDENTIFIANT — ce sont ceux du
   Catalogue, pas les noms fon. La nomenclature a été refondue : SÍNSIN™
   (entretien) et GBÈZÀ™ (shampooing) vivent désormais tous deux sous
   `gbeji` « L'entretien des locks ». Les anciens ids `sinsin` et `gbeza`
   n'existent plus en base — les laisser ici ne levait aucune erreur, ça
   vidait simplement l'abonnement de tout sauf FÍNFÍN™, en silence.
   Toute refonte des catégories doit repasser par cette ligne. */
type Props = {
  onClose: () => void;
  toast: (msg: string) => void;
  /** Ouvre le tunnel sur un forfait de la carte — une séance, un créneau. */
  onReserver: (serviceId: string) => void;
};

export default function Compose({ onClose, toast, onReserver }: Props) {
  const { currency } = useBranch();
  const { cats, services, products } = useVisibleCatalog();
  /* ON AFFICHE AVEC LA CARTE ÉLAGUÉE, ON JUGE SUR L'ARBRE ENTIER (15 août).
     `cats` ne porte que ce que CETTE cliente voit : un atelier dont rien ne
     s'adresse à elle en disparaît, ses familles restent — l'arbre y est cassé.
     Deux conséquences réparées ici : ① le Juste Prix personnel ne s'applique
     qu'à l'Atelier (`coefJustePrix` remonte à la racine), et il s'éteignait
     quand la racine manquait — le sur-mesure annonçait alors un autre prix que
     le comptoir ; ② `sousArbreOf` sur l'arbre cassé ne retrouvait plus les
     familles d'un atelier d'abonnement (GBÈJÍ™ → SÍNSIN™, KLƆKLƆ™…), et
     l'abonnement pouvait se présenter VIDE. Les groupes affichés, eux,
     continuent de sortir de la carte élaguée : rien d'invisible ne fuit. */
  const [tousCats] = useCategories();
  const client = useClient();
  /* LES RÉGLAGES DU SUR-MESURE viennent du Trône (12 août) — remises,
     minimum et ateliers d'abonnement ne sont plus écrits ici. */
  const [cfgV] = useStore(vitrineConfigStore);
  const sm = surMesureDe(cfgV);
  /* SES PRIX (12 août) : la page affichait les prix CATALOGUE quand le tunnel
     Réserver montrait les siens — même moteur partout désormais. */
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const pricing = pricingOf(client ?? undefined, bands, sets, tousCats);
  /* LE PRIX D'UN FORFAIT SE RÉSOUT SUR LE CATALOGUE ENTIER (16 août) — même
     règle que l'arbre des catégories. `personalPriceXof` ne se sert de ces deux
     listes que pour SOMMER la composition d'un forfait : sur la carte élaguée,
     une prestation masquée à cette cliente sortait de la somme en silence et le
     pack s'annonçait moins cher que ce que le comptoir encaissera. Elle achète
     le forfait entier — son prix ne dépend pas de ce qu'on lui montre. */
  const [tousServices] = useServices();
  const [tousProduits] = useProducts();
  const prixDe = (s: Service): number => personalPriceXof(s, pricing, tousServices, tousProduits);

  /* ── LE PONCTUEL EST RETIRÉ — 29 août 2026 ──────────────────────
     « Deux options disponibles qui disent presque la même chose. Je veux
     enlever ponctuel et garder abonnement dès 3, jusqu'à 15 %, et je veux
     avoir un autre côté où j'ai mes propres abonnements prêts pour l'achat »
     (Yéman).

     Le Ponctuel et l'Abonnement composaient DÉJÀ la même chose : même
     catalogue, même geste, seuls le taux et le minimum les séparaient. Deux
     portes vers une seule pièce font hésiter, elles ne font pas vendre.

     À sa place, LES ABONNEMENTS DE LA MAISON — ceux qu'elle a écrits, prêts à
     être pris. Ils vivaient dans l'onglet « Ma formule », que la cliente
     n'atteignait qu'après avoir cherché. Ils s'ouvrent maintenant en premier,
     là où elle vient déjà. */
  const [mode, setMode] = useState<'formules' | 'abonnement' | 'forfaits'>('formules');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [done, setDone] = useState<ComposePayload | null>(null);
  /* LE FORFAIT À PLUSIEURS SÉANCES OUVRE SON CYCLE (16 août) — il ne se
     « demande » plus : ses dates se posent à la cadence du Catalogue, elle
     confirme ou déplace, et règle en deux fois. */
  const [cycleOuvert, setCycleOuvert] = useState<Service | null>(null);

  /* Prestations composables : visibles, prix affichable. UN FORFAIT DE LA CARTE
     N'EST PAS UNE BRIQUE : il a son onglet, il ne se compose pas dans un autre
     forfait (on additionnerait deux remises sur la même prestation). */
  const groups = useMemo(
    () =>
      cats
        .map((c) => ({ cat: c, items: services.filter((s) => s.categoryId === c.id && !s.hidePrice && !s.includes?.length) }))
        .filter((g) => g.items.length > 0),
    [cats, services]
  );

  /* ---- LES FORFAITS DE LA CARTE ----
     Le juge d'éligibilité est celui de la Maison (`estProposable`) : calibre
     servi, seuil de venues atteint, et réserve aux comptes famille. Défaut
     FERMÉ pour la famille — un pack ne fuit jamais par oubli d'écran. */
  const [appts] = useAppointments();
  const [familles] = useFamilies();
  const aFamille = !!(client?.familyId && familles.some((f) => f.id === client.familyId));
  const venues = client ? venuesHonorees(appts, client.id) : 0;
  const forfaits = useMemo(
    () => services.filter((s) => !!s.includes?.length && !s.hidePrice && estProposable(s, pricing, venues, aFamille)),
    [services, pricing, venues, aFamille],
  );
  /* Ce qu'un forfait contient, en clair. Une ligne « au choix dans l'atelier »
     se nomme par l'atelier ; un produit, par la Gamme. Une prestation que la
     Maison lui masque garde son nom générique — le forfait, lui, est offert. */
  const nomInclus = (inc: ServiceInclus): string => {
    if (inc.productId) return products.find((p) => p.id === inc.productId)?.name ?? 'Un soin de la Gamme';
    if (inc.categoryId) return cats.find((c) => c.id === inc.categoryId)?.fon ?? 'Au choix';
    return services.find((x) => x.id === inc.serviceId)?.name ?? 'Une prestation de la Maison';
  };
  /* UN ATELIER COCHÉ OUVRE TOUT SON SOUS-ARBRE (12 août) : les prestations de
     GBÈJÍ vivent dans ses FAMILLES (SÍNSIN, KLƆKLƆ…) — comparer l'atelier aux
     seules catégories directes laissait l'abonnement vide quand on le cochait.
     LES DEUX RÉGIMES SONT SCINDÉS : chacun sa liste. Ponctuel sans liste =
     tout le catalogue visible (l'historique). */
  const sousArbreDe = (liste: string[]): Set<string> => {
    const ids = new Set<string>();
    /* Sur l'ARBRE ENTIER : la descendance d'un atelier ne dépend pas de ce que
       cette cliente-ci peut voir. Le filtrage se fait après, sur les groupes. */
    for (const id of liste) for (const x of sousArbreOf(tousCats, id)) ids.add(x);
    return ids;
  };
  /* LES DEUX RÉGIMES SE LISENT PAREIL (corrigé le 29 août). Le ponctuel
     traitait déjà « liste vide = tout le catalogue » ; l'abonnement, lui,
     traitait « liste vide = rien du tout ». La même absence disait donc deux
     choses opposées selon l'onglet.

     ET UNE LISTE QUI NE DÉSIGNE PLUS RIEN VAUT UNE LISTE VIDE : les ateliers
     du catalogue ont été renommés (`gbeji` → `atl-ii-gbeji`) et le réglage
     pointait dans le vide. Plutôt que de fermer l'écran en silence, on rouvre
     tout : la Maison retranche ensuite ce qu'elle veut, à la Vitrine. */
  const aboSousArbre = useMemo(() => {
    if (sm.aboCats.length === 0) return null;
    const arbre = sousArbreDe(sm.aboCats);
    return arbre.size > 0 ? arbre : null;
  }, [tousCats, sm.aboCats]);
  const ponctuelSousArbre = useMemo(
    () => (sm.ponctuelCats.length ? sousArbreDe(sm.ponctuelCats) : null),
    [tousCats, sm.ponctuelCats],
  );
  /* LES ABONNEMENTS DE LA MAISON, prêts à l'achat. Même source et même juge
     que l'onglet « Ma formule » : deux vitrines qui filtreraient chacune de
     leur côté finiraient par montrer deux offres différentes. */
  const [tousPlans] = usePlans();
  const [demandes] = useDemandesFormule();
  const maDemande = client ? demandeOuverteDe(demandes, client.id) : undefined;
  const mesFormules = useMemo(
    () => formulesVisiblesPour({ cfg: cfgV, masques: client?.vitrineMasques, plans: tousPlans }),
    [cfgV, client?.vitrineMasques, tousPlans],
  );
  /* LE MÊME RANGEMENT QUE PARTOUT, orphelines comprises : une formule sans
     moment du parcours se range sous « Les autres », jamais dans le vide. */
  const momentsFormules = useMemo(() => {
    const groupes = FAMILLES_FORMULES
      .map((f) => ({ k: f.k as string, titre: f.titre, quand: f.quand, liste: mesFormules.filter((x) => x.famille === f.k) }))
      .filter((g) => g.liste.length > 0);
    const orphelines = mesFormules.filter((x) => !x.famille || !FAMILLES_FORMULES.some((f) => f.k === x.famille));
    return orphelines.length > 0
      ? [...groupes, { k: 'autres', titre: 'Les autres formules', quand: 'à découvrir', liste: orphelines }]
      : groupes;
  }, [mesFormules]);

  const demanderFormule = (pl: Plan) => {
    if (!client) return;
    /* UNE SEULE DEMANDE À LA FOIS. Deux demandes ouvertes pour la même tête,
       c'est la Maison qui tranche deux fois et la cliente qui attend deux
       réponses pour une seule envie. */
    if (maDemande) { toast('Une demande est déjà en cours, la Maison vous répond très vite.'); return; }
    demandesFormuleStore.set((prev) => [...prev, {
      id: `df-${uid()}`,
      clientId: client.id,
      clientName: client.name,
      planId: pl.id,
      planName: pl.name,
      demandeeLe: new Date().toISOString().slice(0, 10),
    }]);
    toast('Demande transmise. La Maison vous répond très vite.');
  };

  const activeGroups = mode === 'abonnement'
    ? (aboSousArbre ? groups.filter((g) => aboSousArbre.has(g.cat.id)) : groups)
    : (ponctuelSousArbre ? groups.filter((g) => ponctuelSousArbre.has(g.cat.id)) : groups);

  const switchMode = (m: 'formules' | 'abonnement' | 'forfaits') => {
    setMode(m);
    /* Les deux VITRINES ne composent rien : la composition les attend intacte. */
    if (m === 'forfaits' || m === 'formules') return;
    /* Chaque régime a SES ateliers — ce qui n'appartient pas au régime choisi
       quitte la composition, dans les deux sens. */
    const scope = m === 'abonnement' ? aboSousArbre : ponctuelSousArbre;
    if (scope) {
      setQty((prev) => {
        const next: Record<string, number> = {};
        for (const [id, q] of Object.entries(prev)) {
          const s = services.find((x) => x.id === id);
          if (s && scope.has(s.categoryId)) next[id] = q;
        }
        return next;
      });
    }
  };

  const lines = activeGroups.flatMap((g) =>
    g.items
      .filter((s) => (qty[s.id] ?? 0) > 0)
      .map((s) => ({ service: s, cat: g.cat, q: qty[s.id], line: prixDe(s) * qty[s.id] }))
  );
  const count = lines.reduce((a, l) => a + l.q, 0);
  const subtotal = lines.reduce((a, l) => a + l.line, 0);
  /* UN SEUL RÉGIME COMPOSE DÉSORMAIS : le taux ne se demande plus. */
  const discountPct = sm.aboPct;
  const discount = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discount;
  const aboBlocked = mode === 'abonnement' && count < sm.aboMin;
  const canCompose = count > 0 && !aboBlocked;

  const bump = (id: string, d: 1 | -1) =>
    setQty((prev) => {
      const next = { ...prev };
      const q = Math.max(0, Math.min(12, (next[id] ?? 0) + d));
      if (q === 0) delete next[id];
      else next[id] = q;
      return next;
    });

  const compose = () => {
    if (!canCompose || mode !== 'abonnement') return;
    const payload: ComposePayload = {
      id: uid(),
      createdAt: new Date().toISOString(),
      client: client?.name ?? 'Cliente Ma Couronne',
      clientId: client?.id,
      /* L'onglet des forfaits ne passe jamais par ici — il DEMANDE, il ne
         compose pas. Le garde ci-dessus le dit au compilateur comme au lecteur. */
      mode,
      discountPct,
      items: lines.map((l) => ({
        service: (l.q > 1 ? `${l.q}× ` : '') + l.service.name,
        category: l.cat.fon,
        priceXof: l.line,
      })),
      totalXof: total,
    };
    composeStore.set(payload);
    /* LA MAISON EST PRÉVENUE (12 août) — la promesse « elle revient vers vous
       sur WhatsApp » ne s'appuyait sur rien : personne n'était averti. */
    void pushNotifyStaff(
      mode === 'abonnement' ? 'Abonnement sur-mesure · Ma Couronne' : 'Rituel sur-mesure · Ma Couronne',
      `${payload.client} · ${count} prestation${count > 1 ? 's' : ''} · ${fmtMoney(total, currency)}`,
      '/trone/#/',
    );
    setDone(payload);
    toast(mode === 'abonnement' ? 'Abonnement sur-mesure transmis.' : 'Rituel sur-mesure transmis.');
  };

  /* « DEMANDER CE FORFAIT » EST MORT LE 16 AOÛT — « pourquoi demander ? Je
     veux passer au paiement directement » (Yéman). Un forfait à plusieurs
     séances ouvre désormais SON CYCLE (`Cycle.tsx`) : les dates s'y posent à
     la cadence du Catalogue, elle confirme ou déplace, et règle en deux fois.
     Le mode `forfait` du pont reste reconnu par le Tableau de bord — une
     demande partie avant ce jour doit encore se lire. */

  /* ================= LE CYCLE D'UN FORFAIT ================= */
  if (cycleOuvert) {
    return (
      <Cycle
        forfait={cycleOuvert}
        onClose={() => setCycleOuvert(null)}
        onFini={onClose}
        toast={toast}
      />
    );
  }

  /* ================= CONFIRMATION ================= */
  if (done) {
    const doneSubtotal = done.items.reduce((a, l) => a + l.priceXof, 0);
    const doneDiscount = doneSubtotal - done.totalXof;
    return (
      <div className="mc-overlayscreen mc-slide">
        <div className="mc-confirm mc-rise" style={{ margin: 'auto 0', padding: '0 24px' }}>
          <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 46, opacity: 0.92 }} />
          <h2 style={{ marginTop: 18 }}>Transmis au Trône.</h2>
          <p>
            Votre composition est entre les mains de la maison. Elle revient vers vous sur WhatsApp pour sceller
            les créneaux, mèche après mèche.
          </p>
          <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
            <div className="mc-recapcard__name">
              {done.mode === 'abonnement' ? 'Mon abonnement sur-mesure'
                : done.mode === 'forfait' ? 'Le forfait demandé'
                  : 'Mon rituel sur-mesure'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {done.items.map((l, i) => (
                <div key={i} className="mc-recapcard__line">
                  <span>{l.service}</span>
                  <span>{fmtMoney(l.priceXof, currency)}</span>
                </div>
              ))}
            </div>
            <div className="mc-hairline" />
            {/* Un forfait de la carte n'a pas d'avantage composé : son prix EST
                celui de la carte. Annoncer « −0 % » serait un mot pour rien. */}
            {done.discountPct > 0 && (
              <div className="mc-recapcard__line mc-recapcard__line--deal">
                <span>{done.mode === 'abonnement' ? 'Avantage abonné' : 'Avantage ponctuel'} · −{done.discountPct} %</span>
                <span>− {fmtMoney(doneDiscount, currency)}</span>
              </div>
            )}
            <div className="mc-recapcard__total">
              <span>Total</span>
              <span>{fmtMoney(done.totalXof, currency)}{done.mode === 'abonnement' ? <em> / cycle</em> : null}</span>
            </div>
          </div>
          <button className="mc-cta mc-cta--indigo" style={{ marginTop: 22 }} onClick={onClose}>
            Revenir à l’accueil
          </button>
        </div>
      </div>
    );
  }

  /* ================= COMPOSITION ================= */
  return (
    <div className="mc-overlayscreen mc-slide">
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <span className="mc-micro-eyebrow">Sur-mesure · vous composez</span>
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <h1 className="mc-flowhead__h1" style={{ marginTop: 6 }}>Votre rituel, votre signature.</h1>

        {/* TROIS ONGLETS, ET UN SEUL COMPOSE. Nos abonnements d'abord, ceux que
            la Maison a écrits et qui n'attendent qu'un oui ; puis le composeur,
            pour celle qui veut le sien ; puis la carte des forfaits.

            LE PONCTUEL A ÉTÉ RETIRÉ (29 août) : il composait exactement la même
            chose que l'Abonnement, même catalogue et même geste, seuls le taux
            et le minimum les séparaient. Deux portes vers une seule pièce font
            hésiter, elles ne font pas vendre. */}
        <div className="mc-modetoggle">
          {mesFormules.length > 0 && (
            <button className={`mc-mode ${mode === 'formules' ? 'is-abo' : ''}`} onClick={() => switchMode('formules')}>
              <span className="mc-mode__name">Nos abonnements</span>
              <span className="mc-mode__sub">tout prêts · {mesFormules.length}</span>
            </button>
          )}
          <button className={`mc-mode ${mode === 'abonnement' ? 'is-abo' : ''}`} onClick={() => switchMode('abonnement')}>
            <span className="mc-mode__name">Composez le vôtre</span>
            <span className="mc-mode__sub">−{sm.aboPct} % · dès {sm.aboMin} soins</span>
          </button>
          {forfaits.length > 0 && (
            <button className={`mc-mode ${mode === 'forfaits' ? 'is-pack' : ''}`} onClick={() => switchMode('forfaits')}>
              <span className="mc-mode__name">Les forfaits</span>
              <span className="mc-mode__sub">tout faits · {forfaits.length}</span>
            </button>
          )}
        </div>
      </div>

      <div className="mc-scroll mc-flowbody" style={{ paddingBottom: 8 }}>
        {/* ---------- LES ABONNEMENTS DE LA MAISON ----------
             « Je veux avoir un autre côté où j'ai mes propres abonnements
             disponibles prêts pour l'achat » (Yéman, 29 août). Ils vivaient
             dans l'onglet « Ma formule », que la cliente n'atteignait qu'après
             avoir cherché. Ils s'ouvrent maintenant en premier, là où elle
             vient déjà. Même source et même juge que « Ma formule » : deux
             vitrines qui filtreraient chacune de leur côté finiraient par
             montrer deux offres différentes. */}
        {mode === 'formules' && (
          <div className="mc-fade">
            {maDemande ? (
              <div className="mc-packintro">
                Vous avez demandé « {maDemande.planName} ». La Maison vous répond très vite,
                et vous réglerez au comptoir ou par MoMo.
              </div>
            ) : (
              <div className="mc-packintro">
                Ceux que la Maison a écrits, prêts à être pris. Chacun réserve un créneau rien
                qu'à vous, et se règle au comptoir ou par MoMo, jamais en ligne.
              </div>
            )}
            {momentsFormules.map((g) => (
              <section key={g.k}>
                <div className="cma-moment">
                  <span className="cma-moment__titre">{g.titre}</span>
                  <span className="cma-moment__quand">{g.quand}</span>
                  <span className="cma-moment__rule" />
                </div>
                {g.liste.map((pl) => (
                  <div key={pl.id} className="cma-offre">
                    {pl.tag ? <div className="cma-offre__tag">{pl.tag}</div> : null}
                    <div className="cma-offre__nom">{pl.name}</div>
                    {pl.line ? <p className="cma-offre__ligne">{pl.line}</p> : null}
                    {/* CE QU'ELLE CONTIENT, LÀ OÙ ELLE DÉCIDE. Les avantages
                        étaient déjà écrits dans la formule et ne paraissaient
                        nulle part : un nom et un prix ne font pas choisir. */}
                    {pl.perks.length > 0 && (
                      <ul className="cma-inclus">
                        {pl.perks.slice(0, 4).map((av) => (
                          <li key={av}><i>◆</i><span>{av}</span></li>
                        ))}
                      </ul>
                    )}
                    <div className="cma-offre__bas">
                      <span className="cma-offre__prix">
                        {fmtMoney(pl.priceXof, currency)}
                        <span>{pl.mode === 'pack' ? ` · ${moisDuPack(pl)} mois` : ' /mois'}</span>
                      </span>
                      {pl.discountPct ? <span className="cma-offre__gain">−{pl.discountPct} % sur la carte</span> : null}
                    </div>
                    <button
                      type="button"
                      className="cma-btn cma-btn--sm"
                      /* UNE DEMANDE NE VAUT QUE POUR LA FORMULE DEMANDÉE.
                         Le bouton lisait « une demande est ouverte » et non
                         « CETTE formule est demandée » : les treize cartes
                         basculaient ensemble sur « Demande en cours », et la
                         cliente croyait avoir tout demandé d'un clic. */
                      disabled={!!maDemande}
                      onClick={() => demanderFormule(pl)}
                    >
                      {maDemande?.planId === pl.id
                        ? 'Demande en cours'
                        : maDemande ? 'Une demande est ouverte' : 'Je veux cette formule'}
                    </button>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

        {/* ---------- LES FORFAITS DE LA CARTE ---------- */}
        {mode === 'forfaits' && (
          <div className="mc-fade">
            <div className="mc-packintro">
              Ceux que la Maison a composés pour vous, leur prix tient déjà compte de ce
              qu’ils réunissent.
            </div>
            {forfaits.map((s) => {
              const lignes = s.includes ?? [];
              const noms = lignes.slice(0, 3).map(nomInclus);
              const reste = lignes.length - noms.length;
              /* UNE SÉANCE SE RÉSERVE AU TUNNEL, UN CYCLE OUVRE LE SIEN. Le juge
                 est LA CADENCE (`semainesDuForfait`) et non le champ `sessions`,
                 qui la contredit sur deux fiches — « Forfait VÈKPÈ™ Initiation »
                 annonce une séance et sa cadence en dessine trois : passé au
                 tunnel, deux séances se seraient perdues. */
              const semaines = semainesDuForfait(s, tousServices);
              const nbSeances = Math.max(1, semaines.length);
              const cycle = semaines.length > 1;
              return (
                <div key={s.id} className="mc-pack">
                  <div className="mc-pack__head">
                    <span className="mc-pack__name">{s.name}</span>
                    <span className="mc-pack__price">
                      {priceModeOf(s) === 'variable' ? 'dès ' : ''}{fmtMoney(prixDe(s), currency)}
                      {cycle && <em> / cycle</em>}
                    </span>
                  </div>
                  <div className="mc-pack__meta">
                    {lignes.length} prestation{lignes.length > 1 ? 's' : ''} · {nbSeances} séance{nbSeances > 1 ? 's' : ''}
                    {' · '}{fmtDuration(s.durationMin)}
                  </div>
                  <div className="mc-pack__quoi">
                    {noms.join(' · ')}{reste > 0 ? ` · et ${reste} autre${reste > 1 ? 's' : ''}` : ''}
                  </div>
                  {s.description && <div className="mc-pack__mot">{s.description}</div>}
                  <button
                    className="mc-cta mc-cta--copper mc-pack__cta"
                    onClick={() => (cycle ? setCycleOuvert(s) : onReserver(s.id))}
                  >
                    Réserver ce forfait
                  </button>
                  {cycle && (
                    <div className="mc-pack__note">
                      Vos {nbSeances} dates se posent toutes seules, à la cadence de la Maison,
                      vous n’avez qu’à confirmer. Règlement en deux fois.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mode === 'abonnement' && activeGroups.length === 0 && (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">✦</div>
            <div className="mc-emptyzone__t">Le sur-mesure se prépare.</div>
            <div className="mc-emptyzone__s">
              {mode === 'abonnement'
                ? 'Les soins d’abonnement seront bientôt disponibles à la composition.'
                : 'Les prestations composables arrivent, la maison affine sa carte, mèche après mèche.'}
            </div>
          </div>
        )}
        {mode === 'abonnement' && activeGroups.map((g) => (
          <div key={g.cat.id} className="mc-cmgroup">
            <div className="mc-cmgroup__head">
              <span className="mc-cmgroup__fon">{g.cat.fon}</span>
              <span className="mc-cmgroup__sub">{g.cat.label}</span>
            </div>
            <div className="mc-stack" style={{ gap: 7 }}>
              {g.items.map((s) => {
                const q = qty[s.id] ?? 0;
                return (
                  <div key={s.id} className={`mc-cmitem ${q > 0 ? 'is-on' : ''}`}>
                    <div className="mc-cmitem__body">
                      <div className="mc-cmitem__name">{s.name}</div>
                      <div className="mc-cmitem__meta">
                        {fmtDuration(s.durationMin)} · {s.sessions} séance{s.sessions > 1 ? 's' : ''} · {priceModeOf(s) === 'variable' ? 'dès ' : ''}{fmtMoney(prixDe(s), currency)}
                      </div>
                    </div>
                    <div className="mc-cmitem__qty">
                      <button
                        className="mc-qtybtn mc-qtybtn--minus"
                        disabled={q === 0}
                        aria-label={`Retirer ${s.name}`}
                        onClick={() => bump(s.id, -1)}
                      >
                        −
                      </button>
                      <span className={`mc-cmitem__count ${q > 0 ? 'is-on' : ''}`}>{q}</span>
                      <button
                        className={`mc-qtybtn mc-qtybtn--plus ${q > 0 ? 'is-on' : ''}`}
                        aria-label={`Ajouter ${s.name}`}
                        onClick={() => bump(s.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* -------- pied collant : totaux + verrou abonnement --------
          L'onglet des forfaits ne compose rien : chaque carte porte son geste,
          et un pied qui annoncerait « 0 prestation » ne dirait que du vide. */}
      {mode === 'abonnement' && (
      <div className="mc-cmfooter">
        {count > 0 && (
          <>
            <div className="mc-cmfooter__row"><span>Sous-total</span><span>{fmtMoney(subtotal, currency)}</span></div>
            <div className="mc-cmfooter__row mc-cmfooter__row--deal">
              <span>{mode === 'abonnement' ? 'Avantage abonné' : 'Avantage ponctuel'} · −{discountPct} %</span>
              <span>− {fmtMoney(discount, currency)}</span>
            </div>
          </>
        )}
        <div className="mc-cmfooter__total">
          <span>{count} prestation{count > 1 ? 's' : ''}</span>
          <strong>
            {fmtMoney(total, currency)}
            {mode === 'abonnement' ? <em> / cycle</em> : null}
          </strong>
        </div>
        {aboBlocked && (
          <div className="mc-cmfooter__hint">
            <span>⚑</span>
            <span>Abonnement · {sm.aboMin} prestations minimum ({count}/{sm.aboMin}), complétez vos soins pour activer l’avantage −{sm.aboPct} %.</span>
          </div>
        )}
        {count === 0 && !aboBlocked && (
          <div className="mc-cmfooter__hint mc-cmfooter__hint--soft">Ajoutez au moins une prestation pour composer.</div>
        )}
        <button className={`mc-cta ${canCompose ? 'mc-cta--indigo' : 'mc-cta--locked'}`} disabled={!canCompose} onClick={compose}>
          Composer · transmettre au Trône
        </button>
      </div>
      )}
    </div>
  );
}
