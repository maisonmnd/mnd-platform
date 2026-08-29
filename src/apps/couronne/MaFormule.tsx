import { useMemo } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { useAppointments } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import {
  FAMILLES_FORMULES, activeSubscriberOf, cycleLabel, formuleLaPlusUtile, prixDeLaFormule, moisDuPack,
  prixVenduXof, ecartDuPrixConvenu, valeurALaCarte, remiseSurLaCarte,
  subPaid, subServiceUsage, usePlans, useSubscribers, type Plan, type Subscriber,
} from '../../shared/abonnements';
import { etatDesEcheances, prochaineEcheance, resteDeLEcheancier } from '../../shared/echeancier';
import { libelleCouleur } from '../../shared/couleur';
import { demandeOuverteDe, demandesFormuleStore, useDemandesFormule, formulesVisiblesPour, vitrineConfigStore } from '../../shared/bridges';
import { uid, useStore } from '../../shared/store';
import { useClient } from './lib';
import './couronne.css';

/* ── MA FORMULE — l'abonnement vu par la cliente, 28 août 2026 ────────
   « Build an interactive way for the clients to purchase and follow their
   packs and memberships » (Yéman).

   ELLE VIENT VÉRIFIER TROIS CHOSES, jamais plus : ce qu'il lui reste, ce
   qu'elle doit, ce qu'elle pourrait prendre. L'écran s'ouvre donc sur ses
   crédits, parce que c'est la seule raison pour laquelle elle l'ouvre.

   LES JETONS PLUTÔT QU'UN CHIFFRE. « 4 séances sur 6 » se lit, six pastilles
   se comptent. Le jeton en pointillé est le prochain : elle voit d'un coup
   d'œil ce qu'elle a pris, ce qui l'attend, et combien de fois elle
   reviendra. Un compteur numérique demande un calcul, une rangée non.

   RIEN N'EST STOCKÉ. Les crédits se relisent depuis ses rendez-vous à chaque
   ouverture (`subServiceUsage`). Un compteur écrit à côté de ses rendez-vous
   finit toujours par les contredire — et c'est elle qui aurait raison.

   L'ÉCRAN NE PRÉLÈVE PAS, ET LE BOUTON N'ACHÈTE RIEN. Il écrit à la Maison.
   Laisser une application créer des abonnements que personne n'a validés
   deviendrait ingérable le jour où deux clientes réservent le même créneau
   réservé — et un abonnement porte un créneau, c'est sa promesse. */

const todayIso = () => new Date().toISOString().slice(0, 10);

const frCourt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

/** Les jetons d'une prestation incluse : pris, prochain, à venir. */
function Jetons({ pris, total }: { pris: number; total: number }) {
  /* Au-delà de douze, la rangée cesse d'être lisible d'un coup d'œil : on
     rend alors le compte en clair plutôt qu'un mur de pastilles. */
  if (total > 12) {
    return <div className="cma-jetons__long">{pris} pris sur {total}</div>;
  }
  return (
    <div className="cma-jetons">
      {Array.from({ length: total }, (_, i) => {
        const etat = i < pris ? 'pris' : i === pris ? 'suivant' : '';
        return (
          <span key={i} className={`cma-jeton ${etat}`} aria-hidden="true">
            {etat === 'pris' ? '✓' : etat === 'suivant' ? '→' : ''}
          </span>
        );
      })}
    </div>
  );
}

/* ── CE QU'ELLE A ────────────────────────────────────────────────────── */
function SaFormule({ sub, plan }: { sub: Subscriber; plan: Plan | undefined }) {
  const { currency, branch } = useBranch();
  const [appts] = useAppointments();
  const [services] = useServices();
  const nomService = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée';

  const usage = useMemo(() => subServiceUsage(sub, plan, appts), [sub, plan, appts]);
  /* « Il vous reste N séances » — la plus contrainte des prestations, celle
     qui s'épuisera la première. Annoncer la plus généreuse ferait une
     promesse que la formule ne tient pas. */
  const restant = usage.reduce<number | null>((m, u) => (
    u.remaining === null ? m : (m === null ? u.remaining : Math.min(m, u.remaining))
  ), null);
  const total = usage.reduce((m, u) => Math.max(m, u.qty ?? 0), 0);

  const etats = sub.echeances?.length
    ? etatDesEcheances(sub.echeances, subPaid(sub), todayIso())
    : [];
  const suivante = prochaineEcheance(etats);

  /* LE BOUTON ÉCRIT À LA MAISON, il ne prélève pas. Une application qui
     prétendrait encaisser seule créerait des paiements que personne n'a vus. */
  const numero = (branch.phone ?? '').replace(/\D/g, '');
  const lienReglement = suivante && numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(
      `Bonjour, je souhaite régler ${fmtMoney(suivante.resteXof, currency)} sur mon abonnement « ${plan?.name ?? ''} ».`)}`
    : '';

  return (
    <>
      <div className="cma-carte">
        <div className="cma-carte__tag">
          {plan?.mode === 'pack' ? `${total} séances · valable ${moisDuPack(plan)} mois` : cycleLabel(sub.cycle ?? 'mensuel')}
        </div>
        <div className="cma-carte__nom">{plan?.name ?? 'Votre formule'}</div>
        {plan?.line && <p className="cma-carte__ligne">{plan.line}</p>}
        <div className="cma-carte__etat">
          <span>Il vous reste</span>
          <b>{restant === null ? 'sans limite' : `${restant} séance${restant > 1 ? 's' : ''}${total ? ` sur ${total}` : ''}`}</b>
        </div>
      </div>

      {sub.couleur && (
        <div className="cma-option">
          <span className="cma-micro">Votre option couleur</span>
          <div className="cma-option__val">{libelleCouleur(sub.couleur)}</div>
        </div>
      )}

      {usage.length > 0 && (
        <div className="cma-credits">
          <span className="cma-micro">Vos crédits</span>
          {usage.map((u) => (
            <div key={u.serviceId} className="cma-credit">
              <div className="cma-credit__tete">
                <span className="cma-credit__nom">{nomService(u.serviceId)}</span>
                <span className="cma-credit__compte">
                  {u.qty === null
                    ? 'sans limite'
                    : `${u.used} pris · ${u.remaining} reste${(u.remaining ?? 0) > 1 ? 'nt' : ''}`}
                </span>
              </div>
              {u.qty !== null && <Jetons pris={u.used} total={u.qty} />}
            </div>
          ))}
        </div>
      )}

      {etats.length > 0 && (
        <div className="cma-ech">
          <span className="cma-micro">Votre règlement · en {etats.length} fois</span>
          {etats.map((e) => (
            <div key={e.numero} className="cma-ech__ligne">
              <span className={`cma-pastille ${e.soldee ? 'ok' : e.enRetard ? 'retard' : 'avenir'}`} />
              <span className="cma-ech__date">
                {e.numero}{e.numero === 1 ? 'ʳᵉ' : 'ᵉ'} · {frCourt(e.dueIso)}
                {e.soldee ? ', réglée'
                  : e.enRetard ? `, en retard de ${e.retardJours} j`
                    : e.regleXof > 0 ? `, ${fmtMoney(e.regleXof, currency)} versés` : ''}
              </span>
              <span className={`cma-ech__mt ${e.soldee ? 'paye' : ''}`}>{fmtMoney(e.amountXof, currency)}</span>
            </div>
          ))}
          {suivante && (
            lienReglement
              ? <a className="cma-btn" href={lienReglement} target="_blank" rel="noreferrer">
                Régler {fmtMoney(suivante.resteXof, currency)}
              </a>
              : <div className="cma-vide">Il reste {fmtMoney(resteDeLEcheancier(etats), currency)} à régler au comptoir.</div>
          )}
          <p className="cma-note">
            La Maison vous envoie le code MoMo et constate votre règlement au comptoir.
          </p>
        </div>
      )}

      {etats.length === 0 && plan && (
        <div className="cma-ech">
          <span className="cma-micro">Votre règlement</span>
          <div className="cma-ech__ligne">
            <span className="cma-pastille avenir" />
            <span className="cma-ech__date">Prochaine échéance · {frCourt(sub.nextIso)}</span>
            {/* SON PRIX, ET CE QUE LA MAISON LUI ACCORDE (décision du 28 août).
                Le prix du catalogue barré à côté du sien : elle mesure le geste
                au lieu de le deviner. Sans prix convenu, rien n'est barré et la
                ligne reste celle d'avant. */}
            <span className="cma-ech__mt">
              {(() => {
                const e = ecartDuPrixConvenu(sub, plan, sub.cycle ?? 'mensuel');
                return e && e.ecartXof < 0 ? (
                  <span className="cma-ech__avant">{fmtMoney(e.catalogueXof, currency)}</span>
                ) : null;
              })()}
              {fmtMoney(prixVenduXof(sub, plan, sub.cycle ?? 'mensuel'), currency)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/* ── CE QU'ELLE POURRAIT PRENDRE ─────────────────────────────────────── */
function LaVitrine({ plans, onDemande }: { plans: Plan[]; onDemande: (p: Plan) => void }) {
  const { branch, currency } = useBranch();
  const [appts] = useAppointments();
  const [services] = useServices();
  const client = useClient();
  const numero = (branch.phone ?? '').replace(/\D/g, '');

  /* LE GAIN S'ÉCRIT EN FRANCS, PAS EN POURCENTAGE. « −20 % sur la carte »
     demande un calcul debout devant un téléphone ; « vous gagnez 55 000 F »
     ne demande rien. Le pourcentage reste en repli quand la formule ne porte
     aucune prestation chiffrable — mieux vaut un chiffre vrai qu'un beau. */
  const gainDe = (p: Plan): number | null => {
    const v = valeurALaCarte(p.included, (id) => services.find((x) => x.id === id)?.priceXof);
    if (v.totalXof <= 0) return null;
    const g = remiseSurLaCarte(v.totalXof, p.priceXof).gainXof;
    return g > 0 ? g : null;
  };

  /* Le héros mène à la formule qu'il nomme : sans ce geste, elle devrait la
     retrouver elle-même dans une liste rangée par moment du parcours. */
  const versLaFormule = (id: string) => {
    const cible = document.getElementById(`formule-${id}`);
    if (!cible) return;
    const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cible.scrollIntoView({ behavior: doux ? 'smooth' : 'auto', block: 'center' });
  };

  /* LA PHRASE QUI VEND, et elle est la sienne : calculée sur SES rendez-vous
     des trois derniers mois. C'est le seul argument qu'on ne peut pas
     discuter, et il ne demande aucun effort de vente au comptoir. */
  const suggestion = useMemo(() => {
    if (!client) return null;
    const depuis = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
    const miens = appts.filter((a) => a.clientId === client.id && a.status === 'honoré' && a.date >= depuis);
    return formuleLaPlusUtile({
      plans,
      rituels: miens.map((a) => ({ serviceIds: a.serviceIds, netXof: a.paidXof ?? 0 })),
      moisObserves: 3,
    });
  }, [client, appts, plans]);

  /* LE MÊME RANGEMENT QUE LE TRÔNE, lu de la même source. Une vitrine qui
     aurait son propre ordre aurait divergé au premier ajout, et la cliente
     aurait vu autre chose que ce que la Maison croit montrer.

     UNE FORMULE SANS MOMENT DU PARCOURS DISPARAISSAIT (corrigé le 29 août).
     Cette vitrine ne gardait que les cinq familles connues et jetait le reste
     en silence : une formule créée au comptoir sans choisir son moment
     n'existait POUR AUCUNE CLIENTE, et rien nulle part ne le disait. Le
     contrat du champ dit pourtant l'inverse depuis toujours, « absent = elle
     se range sous Les autres formules, JAMAIS MASQUÉE » — et Le Trône, lui,
     l'honorait déjà. Deux écrans, deux lectures du même champ : celui qui
     vend voyait la formule, celle qui achète ne l'a jamais vue.

     Le masque de la vitrine (28 août) est le SEUL moyen de cacher une
     formule. Un champ oublié ne doit jamais valoir une décision. */
  const moments = useMemo(() => {
    const groupes = FAMILLES_FORMULES
      .map((f) => ({ ...f, liste: plans.filter((p) => p.famille === f.k) }))
      .filter((g) => g.liste.length > 0);
    const orphelines = plans.filter((p) => !p.famille || !FAMILLES_FORMULES.some((f) => f.k === p.famille));
    return orphelines.length > 0
      ? [...groupes, {
        k: 'autres' as const, titre: 'Les autres formules', quand: 'à découvrir',
        sous: '', liste: orphelines,
      }]
      : groupes;
  }, [plans]);

  return (
    <>
      {/* ══ LE HÉROS ═══════════════════════════════════════════════
          La page s'ouvrait sur un MANQUE, « vous n'avez pas encore de
          formule », et s'arrêtait là. Elle s'ouvre maintenant sur LE CHIFFRE
          QUI EST LE SIEN, calculé sur ses venues à elle : le seul argument
          qu'une cliente ne peut pas discuter. Il dormait en petits caractères
          gris sous le titre. */}
      <div className="cma-hero">
        {suggestion ? (
          <>
            <div className="cma-hero__lab">Votre calcul</div>
            <p className="cma-hero__gd">
              Vos {suggestion.rituels} derniers rituels vous auraient coûté{' '}
              <em>{fmtMoney(suggestion.economieXof, currency)} de moins</em>.
            </p>
            <p className="cma-hero__ss">
              Avec {suggestion.plan.name}, au rythme que vous tenez déjà. Ce chiffre est le vôtre,
              il vient de vos venues, pas d’une moyenne.
            </p>
            <button type="button" className="cma-hero__cta" onClick={() => versLaFormule(suggestion.plan.id)}>
              Voir cette formule
            </button>
          </>
        ) : (
          <>
            <div className="cma-hero__lab">Une formule, c’est</div>
            <p className="cma-hero__gd">Votre place gardée, et un prix qui <em>ne bouge plus</em>.</p>
            <p className="cma-hero__ss">
              {moments.length > 0
                ? 'Vous venez quand votre couronne le demande. La Maison sait déjà quand vous arrivez, et ce que vous avez déjà payé.'
                : 'La Maison prépare les siennes. En attendant, votre suivi et vos rendez-vous continuent comme d’habitude.'}
            </p>
          </>
        )}
      </div>

      {/* LES TROIS QUESTIONS DU COMPTOIR, répondues avant d'être posées. */}
      {moments.length > 0 && (
        <div className="cma-assur">
          <div><b>Votre</b><span>créneau</span></div>
          <div><b>Un prix</b><span>qui tient</span></div>
          <div><b>Sans</b><span>paperasse</span></div>
        </div>
      )}

      {/* L'ATTENTE CESSE D'ÊTRE UN CUL-DE-SAC : un cadre en pointillés qui dit
          « revenez bientôt » ressemble à une panne. */}
      {moments.length === 0 && (
        <div className="cma-bientot">
          <div className="cma-bientot__mono">◆</div>
          <p className="cma-bientot__t">Bientôt ouvertes</p>
          <p className="cma-bientot__s">
            Les formules de la Maison arrivent. Nous vous préviendrons ici même, et par un mot
            sur votre téléphone.
          </p>
        </div>
      )}

      {moments.map((m) => (
        <section key={m.k}>
          <div className="cma-moment">
            <span className="cma-moment__titre">{m.titre}</span>
            <span className="cma-moment__quand">{m.quand}</span>
            <span className="cma-moment__rule" />
          </div>
          {m.liste.map((p) => (
            <div key={p.id} id={`formule-${p.id}`} className={`cma-offre ${suggestion?.plan.id === p.id ? 'phare' : ''}`}>
              <div className="cma-offre__tag">{p.tag}</div>
              <div className="cma-offre__nom">{p.name}</div>
              <p className="cma-offre__ligne">{p.line}</p>
              {/* CE QU'ELLE CONTIENT, LÀ OÙ ELLE DÉCIDE (29 août). Les
                  avantages étaient déjà écrits dans la formule et ne
                  paraissaient nulle part : un nom et un prix ne font pas
                  choisir. Même carte que celle du Composeur. */}
              {p.perks.length > 0 && (
                <ul className="cma-inclus">
                  {p.perks.slice(0, 4).map((av) => (
                    <li key={av}><i>◆</i><span>{av}</span></li>
                  ))}
                </ul>
              )}
              <div className="cma-offre__bas">
                <span className="cma-offre__prix">
                  {fmtMoney(p.priceXof, currency)}
                  <span>{p.mode === 'pack' ? ` · ${moisDuPack(p)} mois` : ' /mois'}</span>
                </span>
                {(() => {
                  const g = gainDe(p);
                  if (g !== null) return <span className="cma-offre__gain">Vous gagnez {fmtMoney(g, currency)}</span>;
                  return p.discountPct ? <span className="cma-offre__gain">−{p.discountPct} % sur la carte</span> : null;
                })()}
              </div>
              <button
                type="button"
                className={`cma-btn cma-btn--sm ${suggestion?.plan.id === p.id ? '' : 'ghost'}`}
                onClick={() => onDemande(p)}
              >
                Je veux cette formule
              </button>
            </div>
          ))}
        </section>
      ))}

      {/* SANS CETTE PHRASE, elle pouvait croire qu'il fallait sortir sa carte
          bancaire pour prendre une formule. */}
      <div className="cma-pied">
        <p>
          Vous réglez <b>au comptoir ou par MoMo</b>, jamais en ligne.
          {numero ? (
            <>
              {' '}Un doute ?{' '}
              <a href={`https://wa.me/${numero}`} target="_blank" rel="noreferrer">Écrivez à la Maison</a>,
              on vous répond.
            </>
          ) : ' Un doute ? Écrivez à la Maison, on vous répond.'}
        </p>
      </div>
    </>
  );
}

/* ── L'ONGLET ────────────────────────────────────────────────────────── */
export function MaFormuleTab({ toast }: { toast: (m: string) => void }) {
  const { branch } = useBranch();
  const client = useClient();
  const [plans] = usePlans();
  /* CE QU'ELLE A LE DROIT DE VOIR — « je ne veux pas rendre visible tous les
     abonnements en ligne sur Ma Couronne » (Yéman, 28 août). Le socle de la
     Maison et le masque de sa fiche s'ajoutent, jugés par `formulesVisiblesPour`.

     LA FORMULE QU'ELLE PORTE DÉJÀ N'EST PAS CONCERNÉE : le masque ne touche
     que la VITRINE. Masquer une formule ne la retire à personne, et son suivi
     continue de s'afficher plus haut — c'est tout l'intérêt de masquer plutôt
     que d'effacer. */
  const [cfgVitrine] = useStore(vitrineConfigStore);
  const moi = useClient();
  const enVitrine = useMemo(
    () => formulesVisiblesPour({ cfg: cfgVitrine, masques: moi?.vitrineMasques, plans }),
    [cfgVitrine, moi?.vitrineMasques, plans],
  );
  const [subs] = useSubscribers();
  const [demandes] = useDemandesFormule();

  const sub = client ? activeSubscriberOf(subs, client.id) : undefined;
  const plan = sub ? plans.find((p) => p.id === sub.planId) : undefined;
  const ouverte = client ? demandeOuverteDe(demandes, client.id) : undefined;

  const demander = (p: Plan) => {
    if (!client) return;
    demandesFormuleStore.set((prev) => [...prev, {
      id: `df-${uid()}`,
      clientId: client.id,
      clientName: client.name,
      planId: p.id,
      planName: p.name,
      demandeeLe: todayIso(),
    }]);
    toast('Votre demande est partie, la Maison vous répond très vite.');
  };

  const numero = (branch.phone ?? '').replace(/\D/g, '');

  return (
    <div className="cma-wrap">
      {sub ? (
        <SaFormule sub={sub} plan={plan} />
      ) : ouverte ? (
        /* L'ATTENTE PORTE UNE DATE : elle engage la Maison, là où « en cours
           de traitement » n'engage personne et laisse la cliente se demander
           si le bouton a marché. */
        <div className="cma-attente">
          <div className="cma-attente__tag">Demande envoyée</div>
          <p className="cma-attente__nom">{ouverte.planName}</p>
          <p className="cma-attente__dit">
            La Maison a reçu votre demande le {frCourt(ouverte.demandeeLe)}. Elle vous répond très
            vite, et vous réglerez au comptoir ou par MoMo.
          </p>
          {numero && (
            <a
              className="cma-btn cma-btn--sm ghost"
              href={`https://wa.me/${numero}?text=${encodeURIComponent(`Bonjour, je vous ai demandé la formule « ${ouverte.planName} ».`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Écrire à la Maison
            </a>
          )}
        </div>
      ) : (
        <LaVitrine plans={enVitrine} onDemande={demander} />
      )}
    </div>
  );
}
