import { useMemo, useState, type ReactNode } from 'react';
import { useBranch } from '../../shared/branches';
import { useAppointments } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { useModelBands, useBandSets, bandsAbonnements, calibreDeLaTete } from '../../shared/pricing';
import { useFamilies } from '../../shared/clients';
import {
  FAMILLES_FORMULES, formuleLaPlusUtile, prixDeLaFormule, moisDuPack,
  etendueDeLaFormule, SELON_LE_CALIBRE, gainPourElle, type TeteConnue,
  formulesPourElle, usePlans, type Plan,
} from '../../shared/abonnements';
import { demandeOuverteDe, useDemandesFormule, formulesVisiblesPour, vitrineConfigStore } from '../../shared/bridges';
import { useStore } from '../../shared/store';
import { useClient } from './lib';
import type { ReleveDeLAbonnee, ReleveDuContrat } from '../../shared/abonnee-pur';
import AchatFormule from './AchatFormule';
import { SesFormules } from './SesFormules';
import type { DemandeDeReglement } from './Abonnee';
import { t, locale, prix } from './i18n';
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

const frCourt = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

/* ── CE QU'ELLE POURRAIT PRENDRE ─────────────────────────────────────── */
function LaVitrine({ plans, onDemande }: { plans: Plan[]; onDemande: (p: Plan) => void }) {
  const { branch, currency } = useBranch();
  const [appts] = useAppointments();
  const [services] = useServices();
  const client = useClient();
  const numero = (branch.phone ?? '').replace(/\D/g, '');

  /* CE QUE LA MAISON SAIT DE SA TÊTE — 1er septembre 2026. Le comptage réel
     passe devant la déclaration : `lockCount` est ce que la Maison a compté,
     `lockCountDeclare` ce que la cliente a dit. Sans l'un ni l'autre, aucun
     calibre, et la vitrine annonce l'étendue au lieu d'un prix. */
  /* ── DEUX BARÈMES, ET ILS NE SE CONFONDENT PAS — 1er sept. 2026 ───
     `bands` dit dans QUELLE tranche tombe une tête : les bornes de locks sont
     communes à toute la Maison, un seul langage de taille.
     `calibresAbo` dit ce que cette tranche COÛTE en abonnement : c'est le
     second cadran, celui qu'on ne majore pas comme une séance. */
  const [bands] = useModelBands();
  const [jeuxDeCalibres] = useBandSets();
  const calibresAbo = useMemo(
    () => bandsAbonnements(jeuxDeCalibres, bands), [jeuxDeCalibres, bands],
  );
  const maTete: TeteConnue = useMemo(() => ({
    bandId: calibreDeLaTete(client?.lockCount ?? client?.lockCountDeclare, bands, client?.margeCalibre)?.id,
    longueur: client?.longueur,
  }), [client?.lockCount, client?.lockCountDeclare, client?.longueur, bands]);

  /* LE GAIN S'ÉCRIT EN FRANCS, PAS EN POURCENTAGE. « −20 % sur la carte »
     demande un calcul debout devant un téléphone ; « vous gagnez 55 000 F »
     ne demande rien. Le pourcentage reste en repli quand la formule ne porte
     aucune prestation chiffrable — mieux vaut un chiffre vrai qu'un beau. */
  /* ══ SON GAIN, PAS CELUI DE LA RÉFÉRENCE — 2 septembre 2026 ═══════
     Le gain se calculait sur `p.priceXof`, le prix de référence, alors que le
     prix affiché juste au-dessus est CELUI DE SA TÊTE. Une tête Micro lisait
     donc « 252 000 F » et « vous gagnez 58 000 F » : deux chiffres qui ne se
     répondent pas. `gainPourElle` chiffre les deux moitiés avec la même tête. */
  const gainDe = (p: Plan): number | null => {
    const g = gainPourElle(p, 'mensuel', maTete, calibresAbo,
      (id) => services.find((x) => x.id === id)?.priceXof);
    return g.gainXof > 0 ? g.gainXof : null;
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
            <div className="cma-hero__lab">{t('Votre calcul')}</div>
            <p className="cma-hero__gd">
              {t('Vos {n} derniers rituels vous auraient coûté', { n: suggestion.rituels })}{' '}
              <em>{t('{montant} de moins', { montant: prix(suggestion.economieXof, currency) })}</em>.
            </p>
            <p className="cma-hero__ss">
              {t('Avec {formule}, au rythme que vous tenez déjà. Ce chiffre est le vôtre, il vient de vos venues, pas d’une moyenne.', { formule: suggestion.plan.name })}
            </p>
            <button type="button" className="cma-hero__cta" onClick={() => versLaFormule(suggestion.plan.id)}>
              {t('Voir cette formule')}
            </button>
          </>
        ) : (
          <>
            <div className="cma-hero__lab">{t('Une formule, c’est')}</div>
            <p className="cma-hero__gd">{t('Votre place gardée, et un prix qui')}{' '}<em>{t('ne bouge plus')}</em>.</p>
            <p className="cma-hero__ss">
              {moments.length > 0
                ? t('Vous venez quand votre couronne le demande. La Maison sait déjà quand vous arrivez, et ce que vous avez déjà payé.')
                : t('La Maison prépare les siennes. En attendant, votre suivi et vos rendez-vous continuent comme d’habitude.')}
            </p>
          </>
        )}
      </div>

      {/* LES TROIS QUESTIONS DU COMPTOIR, répondues avant d'être posées. */}
      {moments.length > 0 && (
        <div className="cma-assur">
          <div><b>{t('Votre')}</b><span>{t('créneau')}</span></div>
          <div><b>{t('Un prix')}</b><span>{t('qui tient')}</span></div>
          <div><b>{t('Sans')}</b><span>{t('paperasse')}</span></div>
        </div>
      )}

      {/* L'ATTENTE CESSE D'ÊTRE UN CUL-DE-SAC : un cadre en pointillés qui dit
          « revenez bientôt » ressemble à une panne. */}
      {moments.length === 0 && (
        <div className="cma-bientot">
          <div className="cma-bientot__mono">◆</div>
          <p className="cma-bientot__t">{t('Bientôt ouvertes')}</p>
          <p className="cma-bientot__s">
            {t('Les formules de la Maison arrivent. Nous vous préviendrons ici même, et par un mot sur votre téléphone.')}
          </p>
        </div>
      )}

      {moments.map((m) => (
        <section key={m.k}>
          <div className="cma-moment">
            <span className="cma-moment__titre">{t(m.titre)}</span>
            <span className="cma-moment__quand">{t(m.quand)}</span>
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
                {/* ══ SON PRIX, OU L'ÉTENDUE DES PRIX — 1er septembre 2026 ══
                    « Les abonnements doivent se facturer au palier comme au
                    catalogue » (Yéman).

                    QUAND SON CALIBRE EST CONNU, elle voit UN prix, le sien, et
                    aucune question ne se pose. Quand il ne l'est pas, la
                    fourchette dit l'étendue honnêtement, et la question vient
                    au moment de prendre — jamais après le paiement.

                    LES DEUX BORNES SONT CALCULÉES, jamais saisies : le jour où
                    un coefficient bouge aux Paramètres, la vitrine suit sans
                    que personne n'y pense. */}
                <span className="cma-offre__prix">
                  {(() => {
                    /* LE MÊME LIBELLÉ QUE PARTOUT AILLEURS : trois formulations
                       du même fait se lisent comme trois offres différentes. */
                    /* Le libellé de `libelleFourchette` (« X à Y »), dit dans sa langue. */
                    const bornes = maTete.bandId ? null : etendueDeLaFormule(p, 'mensuel', calibresAbo);
                    const etendue = bornes
                      ? t('{bas} à {haut}', { bas: prix(bornes.bas, currency), haut: prix(bornes.haut, currency) })
                      : null;
                    return etendue ?? prix(prixDeLaFormule(p, 'mensuel', maTete, calibresAbo).montantXof, currency);
                  })()}
                  <span>
                    {p.mode === 'pack' ? <>{' · '}{t('{n} mois', { n: moisDuPack(p) })}</> : <>{' '}{t('/mois')}</>}
                    {!maTete.bandId && etendueDeLaFormule(p, 'mensuel', calibresAbo) ? <>{' · '}{t(SELON_LE_CALIBRE)}</> : null}
                  </span>
                </span>
                {(() => {
                  const g = gainDe(p);
                  if (g !== null) return <span className="cma-offre__gain">{t('Vous gagnez {montant}', { montant: prix(g, currency) })}</span>;
                  return p.discountPct ? <span className="cma-offre__gain">{t('−{pct} % sur la carte', { pct: p.discountPct })}</span> : null;
                })()}
              </div>
              <button
                type="button"
                className={`cma-btn cma-btn--sm ${suggestion?.plan.id === p.id ? '' : 'ghost'}`}
                onClick={() => onDemande(p)}
              >
                {t('Je veux cette formule')}
              </button>
            </div>
          ))}
        </section>
      ))}

      {/* SANS CETTE PHRASE, elle pouvait croire qu'il fallait sortir sa carte
          bancaire pour prendre une formule. */}
      <div className="cma-pied">
        <p>
          {t('Vous réglez')}{' '}<b>{t('au comptoir ou par MoMo')}</b>{t(', jamais en ligne.')}
          {numero ? (
            <>
              {' '}{t('Un doute ?')}{' '}
              <a href={`https://wa.me/${numero}`} target="_blank" rel="noreferrer">{t('Écrivez à la Maison')}</a>
              {t(', on vous répond.')}
            </>
          ) : <>{' '}{t('Un doute ? Écrivez à la Maison, on vous répond.')}</>}
        </p>
      </div>
    </>
  );
}

/* ── L'ONGLET ────────────────────────────────────────────────────────── */
export function MaFormuleTab({ toast, onReserver, releve, prenom, selecteur, onRegler, onRenoncer, onSolde, onOpenRdv, onReserverIncluse }: {
  toast: (m: string) => void;
  onReserver: () => void;
  /** LE RELEVÉ DE LA TÊTE REGARDÉE (20 octobre 2026) : ses formules, lues
      par le juge unique. Sans formule ni passée, l'onglet reste la vitrine. */
  releve: ReleveDeLAbonnee | null;
  /** Le prénom de la tête portée ; absent : c'est elle. */
  prenom?: string;
  selecteur?: ReactNode;
  onRegler: (d: DemandeDeReglement) => void;
  onRenoncer?: (c: ReleveDuContrat) => void;
  onSolde: () => void;
  onOpenRdv: (id: string) => void;
  onReserverIncluse: () => void;
}) {
  /* ── ELLE PREND SA FORMULE ELLE-MÊME — 29 août 2026 ──────────────
     « Je ne veux pas qu'on envoie une demande au Trône. La cliente réserve
     immédiatement et passe au paiement » (Yéman). Le bouton n'écrit plus une
     demande : il ouvre l'achat, une seule porte (20 octobre 2026). */
  const [achat, setAchat] = useState<Plan | null>(null);
  /* « PRENDRE UNE AUTRE FORMULE » : deux formules peuvent courir ensemble
     (tranché au sélecteur le 20 octobre 2026), la vitrine s'ouvre donc aussi
     à celle qui en porte une. */
  const [vitrine, setVitrine] = useState(false);
  const { branch } = useBranch();
  const client = useClient();
  const [plans] = usePlans();
  /* CE QU'ELLE A LE DROIT DE VOIR — « je ne veux pas rendre visible tous les
     abonnements en ligne sur Ma Couronne » (Yéman, 28 août). Le socle de la
     Maison et le masque de sa fiche s'ajoutent, jugés par `formulesVisiblesPour`.

     LA FORMULE QU'ELLE PORTE DÉJÀ N'EST PAS CONCERNÉE : le masque ne touche
     que la VITRINE. Masquer une formule ne la retire à personne, et son suivi
     continue de s'afficher plus haut. */
  const [cfgVitrine] = useStore(vitrineConfigStore);
  const moi = useClient();
  /* SON FOYER, OU PAS — même règle que le composeur, même juge. */
  const [famillesMc] = useFamilies();
  const aUnFoyer = !!moi?.familyId && famillesMc.some((f) => f.id === moi.familyId);
  const enVitrine = useMemo(
    () => formulesPourElle(
      formulesVisiblesPour({ cfg: cfgVitrine, masques: moi?.vitrineMasques, plans }),
      aUnFoyer,
    ),
    [cfgVitrine, moi?.vitrineMasques, plans, aUnFoyer],
  );
  const [demandes] = useDemandesFormule();
  const ouverte = client ? demandeOuverteDe(demandes, client.id) : undefined;
  const sesFormules = !!releve && (releve.contrats.length > 0 || releve.anciens.length > 0);

  const numero = (branch.phone ?? '').replace(/\D/g, '');

  if (achat) {
    return (
      <AchatFormule
        plan={achat}
        releve={releve}
        toast={toast}
        onClose={() => { setAchat(null); setVitrine(false); }}
        onReserver={() => { setAchat(null); setVitrine(false); onReserver(); }}
      />
    );
  }

  /* LA FORMULE D'UNE TÊTE PORTÉE SE PREND AU COMPTOIR : la souscription en
     ligne signe au nom du compte. On lit la sienne, on n'en achète pas ici. */
  if (sesFormules && releve && !vitrine) {
    return (
      <SesFormules
        releve={releve}
        prenom={prenom}
        selecteur={selecteur}
        onRegler={onRegler}
        onRenoncer={onRenoncer}
        onSolde={onSolde}
        onOpenRdv={onOpenRdv}
        onReserverIncluse={onReserverIncluse}
        onAcheter={prenom || enVitrine.length === 0 ? undefined : () => setVitrine(true)}
      />
    );
  }

  return (
    <div className="cma-wrap">
      {selecteur && <div style={{ padding: '14px 18px 0' }}>{selecteur}</div>}
      {vitrine && (
        <button type="button" className="mc-linkback" style={{ margin: '14px 18px 0', alignSelf: 'flex-start' }} onClick={() => setVitrine(false)}>
          ← {t('Ma formule')}
        </button>
      )}
      {prenom ? (
        <div className="cma-attente">
          <div className="cma-attente__tag">{t('Aucune formule en cours')}</div>
          <p className="cma-attente__dit">{t('La formule de {prenom} se prend au comptoir de la Maison.', { prenom })}</p>
        </div>
      ) : ouverte && !vitrine ? (
        /* L'ATTENTE PORTE UNE DATE : elle engage la Maison, là où « en cours
           de traitement » n'engage personne et laisse la cliente se demander
           si le bouton a marché. */
        <div className="cma-attente">
          <div className="cma-attente__tag">{t('Demande envoyée')}</div>
          <p className="cma-attente__nom">{ouverte.planName}</p>
          <p className="cma-attente__dit">
            {t('La Maison a reçu votre demande le {date}. Elle vous répond très vite, et vous réglerez au comptoir ou par MoMo.', { date: frCourt(ouverte.demandeeLe) })}
          </p>
          {numero && (
            <a
              className="cma-btn cma-btn--sm ghost"
              href={`https://wa.me/${numero}?text=${encodeURIComponent(`Bonjour, je vous ai demandé la formule « ${ouverte.planName} ».`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('Écrire à la Maison')}
            </a>
          )}
        </div>
      ) : (
        <LaVitrine plans={enVitrine} onDemande={(p) => setAchat(p)} />
      )}
    </div>
  );
}
