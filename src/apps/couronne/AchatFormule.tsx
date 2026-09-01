import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { useStore } from '../../shared/store';
import { supabase } from '../../shared/supabase';
import { vitrineConfigStore } from '../../shared/bridges';
import { deuxFoisPossible } from '../../shared/echeancier';
import {
  moisDuPack, prixDeLaFormule, etendueDeLaFormule, type Plan, type TeteConnue,
} from '../../shared/abonnements';
import { useModelBands, sortedBands, bandLabel, calibreDeLaTete } from '../../shared/pricing';
import { kkiapayEnabled, payWithKkiapay, verifyDeposit } from '../../shared/kkiapay';
import { useClient } from './lib';
import './couronne.css';

/* ── ACHETER SA FORMULE — 29 août 2026 ────────────────────────────────
   « Je ne veux pas qu'on envoie une demande au Trône. La cliente réserve
   immédiatement et passe au paiement et choisit en 2 fois. Seul moi-même peut
   activer un paiement en 4 fois » (Yéman). Maquette validée le 29 août.

   TROIS TEMPS, ET LE TROISIÈME EST UNE PREUVE. Ce qu'elle prend, comment elle
   règle, c'est ouvert. L'écran final ne dit pas « merci » : il dit ce qu'elle
   a désormais, jusqu'à quand, et ce qu'il lui reste à régler.

   RIEN NE S'ENGAGE AVANT LE GESTE. Tant qu'elle n'a pas choisi sa voie, aucun
   abonnement n'existe. C'est ce qui rend le bouton sûr.

   LE PRIX NE VIENT JAMAIS D'ICI. `souscrire_a_une_formule` (0077) relit le
   prix DANS la formule, côté serveur, et ignore tout montant que cet écran
   pourrait envoyer. Cet écran ne fait qu'AFFICHER ce que le serveur décidera :
   si les deux chiffres divergeaient un jour, c'est le serveur qui aurait
   raison, et c'est voulu.

   DEUX FOIS, JAMAIS QUATRE. La découpe en quatre est un accord qui se donne en
   face, au comptoir. Elle n'est proposée nulle part ici, et la fonction
   serveur la refuse même si on la lui demandait. */

type Temps = 'recap' | 'reglement' | 'fini';
type Voie = 'ligne' | 'comptoir';

/** Ce que le serveur a réellement créé — la seule vérité. */
type Souscrit = { subId: string; totalXof: number; parts: number; premiereXof: number };

const REFUS: Record<string, string> = {
  aucune_fiche: 'Votre fiche n’est pas encore ouverte. Écrivez à la Maison, on vous ouvre.',
  deja_abonnee: 'Vous avez déjà une formule en cours. Une seule à la fois, pour que vos crédits restent clairs.',
  formule_inconnue: 'Cette formule n’est plus au catalogue.',
  prix_absent: 'Cette formule n’a pas encore de prix. La Maison la prépare.',
  decoupe_refusee: 'Ce découpage ne se donne qu’au comptoir.',
  seuil_non_atteint: 'Cette formule se règle en une fois.',
};

export default function AchatFormule({
  plan, onClose, onReserver, toast,
}: {
  plan: Plan;
  onClose: () => void;
  onReserver: () => void;
  toast: (m: string) => void;
}) {
  const { branch, currency } = useBranch();
  const client = useClient();
  const [cfg] = useStore(vitrineConfigStore);

  const [temps, setTemps] = useState<Temps>('recap');
  const [parts, setParts] = useState<1 | 2>(1);
  const [occupe, setOccupe] = useState<Voie | null>(null);
  const [souscrit, setSouscrit] = useState<Souscrit | null>(null);
  const [regleXof, setRegleXof] = useState(0);

  /* ══ LE PRIX SUIT SA TÊTE — 1er septembre 2026 ═════════════════════
     « Les abonnements doivent se facturer au palier comme au catalogue »
     (Yéman).

     TROIS SOURCES, DANS CET ORDRE : ce que la Maison a COMPTÉ, ce que la
     cliente avait DÉCLARÉ, et ce qu'elle choisit ici. La troisième ne se
     propose que si les deux premières manquent — on ne redemande pas à
     quelqu'un ce qu'on sait déjà de lui.

     CE QUE CET ÉCRAN AFFICHE N'ENGAGE RIEN : le serveur relit la grille et
     recalcule (migration 0081). En cas d'écart, c'est le sien qui s'inscrit,
     comme pour tout prix depuis la 0077. */
  const [bands] = useModelBands();
  const calibres = useMemo(() => sortedBands(bands), [bands]);
  /* LA MARGE SUIT LA FORMULE AUSSI : la faveur posée sur sa fiche vaudrait
     sur ses rituels et pas sur son abonnement, ce qui ne s'expliquerait pas. */
  const calibreSu = calibreDeLaTete(client?.lockCount ?? client?.lockCountDeclare, bands, client?.margeCalibre)?.id;
  const [calibreDit, setCalibreDit] = useState<string | null>(null);
  const bandId = calibreSu ?? calibreDit ?? undefined;
  const maTete: TeteConnue = { bandId, longueur: client?.longueur };

  /* La question ne se pose que si la formule VARIE et que la tête est
     inconnue. Une formule à prix unique n'en parle jamais. */
  const varie = etendueDeLaFormule(plan, 'mensuel', bands) !== null;
  const doitDemander = varie && !calibreSu;

  const total = prixDeLaFormule(plan, 'mensuel', maTete, bands).montantXof;
  const deuxFois = deuxFoisPossible(total, cfg.seuilDeuxFoisXof);
  /* Ce que l'écran ANNONCE. Le serveur recalculera la même chose ; en cas
     d'écart, c'est le sien qui s'inscrit. */
  const premiere = parts === 2 ? total - Math.floor(total / 2) : total;

  /** Crée l'abonnement CÔTÉ SERVEUR. Rend `null` et parle si le serveur refuse. */
  const souscrire = async (): Promise<Souscrit | null> => {
    if (!supabase) { toast('La Maison est hors ligne, réessayez dans un instant.'); return null; }
    const { data, error } = await supabase.rpc('souscrire_a_une_formule', {
      p_plan_id: plan.id,
      p_parts: parts,
      /* LE CALIBRE VOYAGE, LE PRIX NON : le serveur le relit dans la grille.
         Envoyer un montant ouvrirait la porte que la 0077 a fermée. */
      p_band_id: bandId ?? null,
      p_longueur: client?.longueur ?? null,
    });
    if (error) {
      /* UN REFUS SE DIT, TOUJOURS. Le plus probable ici : la fonction 0077
         n'est pas encore posée dans Supabase. */
      toast('La souscription n’est pas encore ouverte, la Maison la prépare.');
      return null;
    }
    const r = (data ?? {}) as { ok?: boolean; erreur?: string; subId?: string; totalXof?: number; parts?: number; premiereXof?: number };
    if (r.erreur) { toast(REFUS[r.erreur] ?? 'La souscription n’a pas abouti.'); return null; }
    if (!r.ok || !r.subId) { toast('La souscription n’a pas abouti.'); return null; }
    return {
      subId: r.subId,
      totalXof: Number(r.totalXof ?? total),
      parts: Number(r.parts ?? parts),
      premiereXof: Number(r.premiereXof ?? premiere),
    };
  };

  /* ── LA VOIE DU COMPTOIR ────────────────────────────────────────
     Aucun argent ne circule : la formule est retenue à son nom, non réglée.
     C'est la voie la plus sûre, et celle qui ne change rien à la voix de la
     Maison — « au comptoir ou par MoMo, jamais en ligne ». */
  const auComptoir = async () => {
    setOccupe('comptoir');
    const s = await souscrire();
    setOccupe(null);
    if (!s) return;
    setSouscrit(s);
    setRegleXof(0);
    setTemps('fini');
  };

  /* ── LA VOIE EN LIGNE ───────────────────────────────────────────
     L'abonnement naît D'ABORD, non réglé, puis le paiement s'y rattache après
     vérification chez KkiaPay. Dans cet ordre, et jamais l'inverse : un
     paiement dont l'abonnement n'existe pas encore serait un encaissement
     orphelin, et c'est le pire des états. Si la vérification échoue, la
     formule reste retenue à son nom, à régler au comptoir. */
  const enLigne = async () => {
    setOccupe('ligne');
    const s = await souscrire();
    if (!s) { setOccupe(null); return; }
    setSouscrit(s);
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: s.premiereXof,
        partnerId: s.subId,
        branchId: branch.id,
        clientId: client?.id,
        phone: client?.phone,
        name: client?.name,
        email: client?.email,
      });
      const v = await verifyDeposit({
        transactionId,
        apptId: '',
        subId: s.subId,
        expectedXof: s.premiereXof,
        branchId: branch.id,
        clientId: client?.id,
      });
      setRegleXof(v.ok ? v.amountXof : 0);
      if (!v.ok) toast('Le paiement n’a pas été confirmé. Votre formule est retenue, réglez au comptoir.');
    } catch (e) {
      /* Elle a fermé le widget, ou la vérification a échoué. SA FORMULE EST
         DÉJÀ RETENUE : on ne la perd pas, on le lui dit. */
      setRegleXof(0);
      toast(e instanceof Error && e.message ? e.message : 'Paiement interrompu. Votre formule reste retenue.');
    }
    setOccupe(null);
    setTemps('fini');
  };

  const jetons = (plan.included ?? []).reduce((n, i) => n + (i.qty ?? 0), 0);

  return (
    <div className="mc-flow">
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <span className="mc-micro-eyebrow">Votre formule</span>
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>

        {/* LE FIL DES TROIS TEMPS. Elle doit savoir où elle en est et combien
            il en reste : un tunnel sans fil d'Ariane se referme au premier
            doute. */}
        <div className="cma-fil">
          <b className={temps === 'recap' ? 'is-on' : ''}>Sa formule</b>
          <span>›</span>
          <b className={temps === 'reglement' ? 'is-on' : ''}>Règlement</b>
          <span>›</span>
          <b className={temps === 'fini' ? 'is-on' : ''}>C’est ouvert</b>
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">

        {/* ── ① CE QU'ELLE PREND ──────────────────────────────────── */}
        {temps === 'recap' && (
          <div className="mc-fade">
            <div className="cma-offre">
              {plan.tag ? <div className="cma-offre__tag">{plan.tag}</div> : null}
              <div className="cma-offre__nom">{plan.name}</div>
              {plan.line ? <p className="cma-offre__ligne">{plan.line}</p> : null}
              {plan.perks.length > 0 && (
                <ul className="cma-inclus">
                  {plan.perks.slice(0, 5).map((av) => (
                    <li key={av}><i>◆</i><span>{av}</span></li>
                  ))}
                </ul>
              )}
              <div className="cma-somme">
                <span>À régler</span>
                <b>{fmtMoney(total, currency)}</b>
              </div>
              <div className="cma-somme__sous">
                {plan.mode === 'pack' ? `Valable ${moisDuPack(plan)} mois` : 'Chaque mois, tant que vous la gardez'}
              </div>
            </div>

            <div className="cma-verrou">
              Votre créneau se pose ensuite avec la Maison, à la cadence de votre couronne.
              <b> Rien ne s’engage tant que vous n’avez pas choisi.</b>
            </div>

            {/* ══ COMBIEN DE LOCKS PORTEZ-VOUS ? — 1er septembre 2026 ══════
                La question se pose AVANT le paiement, jamais après : elle voit
                le vrai prix avant de sortir son téléphone.

                « JE NE SAIS PAS » N'EST PAS UN PIÈGE. La formule se prend au
                prix de référence, et le comptage du premier rendez-vous fixe
                le vrai. L'écart se règle au comptoir, dit à l'avance et par
                écrit — plutôt que de la laisser deviner, ou de lui facturer le
                plus cher par précaution. */}
            {doitDemander && (
              <div className="cma-calibre">
                <div className="cma-calibre__q">Combien de locks portez-vous ?</div>
                <p className="cma-calibre__d">
                  Cela change le temps que la Maison vous consacre, donc le prix.
                  Une estimation suffit, on comptera ensemble au premier rendez-vous.
                </p>
                {calibres.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`cma-calibre__opt ${calibreDit === b.id ? 'is-on' : ''}`}
                    onClick={() => setCalibreDit(b.id)}
                  >
                    <span>{bandLabel(b, calibres)}</span>
                    <b>{fmtMoney(prixDeLaFormule(plan, 'mensuel', { bandId: b.id, longueur: client?.longueur }, bands).montantXof, currency)}</b>
                  </button>
                ))}
                <button
                  type="button"
                  className={`cma-calibre__opt ${calibreDit === null ? 'is-on' : ''}`}
                  onClick={() => setCalibreDit(null)}
                >
                  <span>Je ne sais pas</span>
                  <b className="cma-calibre__flou">la Maison comptera</b>
                </button>
              </div>
            )}

            <button type="button" className="cma-btn" onClick={() => setTemps('reglement')}>
              Passer au règlement
            </button>
          </div>
        )}

        {/* ── ② COMMENT ELLE RÈGLE ────────────────────────────────── */}
        {temps === 'reglement' && (
          <div className="mc-fade">
            <button
              type="button"
              className={`cma-choix ${parts === 1 ? 'is-on' : ''}`}
              onClick={() => setParts(1)}
            >
              <span className="cma-choix__t">
                <span className="cma-choix__n">En une fois</span>
                <span className="cma-choix__m">{fmtMoney(total, currency)}</span>
              </span>
              <span className="cma-choix__d">Vous réglez tout aujourd’hui, et il n’y a plus rien à y penser.</span>
            </button>

            {deuxFois ? (
              <button
                type="button"
                className={`cma-choix ${parts === 2 ? 'is-on' : ''}`}
                onClick={() => setParts(2)}
              >
                <span className="cma-choix__t">
                  <span className="cma-choix__n">En deux fois</span>
                  <span className="cma-choix__m">{fmtMoney(premiere, currency)}</span>
                </span>
                <span className="cma-choix__d">La première moitié aujourd’hui, la seconde dans trente jours.</span>
                <span className="cma-ech2">
                  <span><span>Aujourd’hui</span><b>{fmtMoney(premiere, currency)}</b></span>
                  <span><span>Dans 30 jours</span><b>{fmtMoney(total - premiere, currency)}</b></span>
                </span>
              </button>
            ) : null}
            {/* CE QUI NE LA REGARDE PAS NE S'AFFICHE PAS — 29 août 2026.
                Deux cadres expliquaient ici le SEUIL des deux fois et la
                règle des quatre fois. C'est de la politique de maison : la
                cliente n'a rien demandé, rien ne lui a été refusé, et lui
                dire qu'un découpage existe ailleurs ne fait que l'inviter à
                le réclamer. Elle voit ce qu'elle peut prendre, et rien de
                plus. Le seuil reste réglé au Trône. */}

            {kkiapayEnabled() && (
              <button type="button" className="cma-btn cma-btn--indigo" disabled={!!occupe} onClick={() => void enLigne()}>
                {occupe === 'ligne' ? 'Un instant…' : `Régler ${fmtMoney(premiere, currency)} maintenant`}
              </button>
            )}
            <button type="button" className="cma-btn ghost" disabled={!!occupe} onClick={() => void auComptoir()}>
              {occupe === 'comptoir' ? 'Un instant…' : 'Je réglerai au comptoir'}
            </button>
            <button type="button" className="cma-lien" disabled={!!occupe} onClick={() => setTemps('recap')}>
              Revenir à la formule
            </button>
          </div>
        )}

        {/* ── ③ C'EST OUVERT ──────────────────────────────────────── */}
        {temps === 'fini' && souscrit && (
          <div className="mc-fade">
            <div className="cma-fini">
              <div className="cma-fini__mono">◆</div>
              <p className="cma-fini__t">Votre formule est ouverte.</p>
              <p className="cma-fini__s">
                {plan.name}
                {plan.mode === 'pack' ? ` · valable ${moisDuPack(plan)} mois.` : '.'}
                {regleXof > 0
                  ? ` Vous avez réglé ${fmtMoney(regleXof, currency)}.`
                  : ' Vous réglerez au comptoir ou par MoMo.'}
                {souscrit.parts === 2
                  ? ` Il restera ${fmtMoney(souscrit.totalXof - Math.max(regleXof, 0), currency)} à régler.`
                  : ''}
              </p>
              {jetons > 0 && (
                <div className="cma-jetons">
                  {Array.from({ length: Math.min(jetons, 12) }, (_, i) => (
                    <span key={i} className="cma-jeton">{i === 0 ? '›' : ''}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="cma-offre" style={{ marginTop: 14 }}>
              <div className="cma-offre__tag">La suite</div>
              <ul className="cma-inclus" style={{ borderTop: 'none', paddingTop: 0 }}>
                <li><i>◆</i><span>Prenez votre première venue quand vous voulez</span></li>
                <li><i>◆</i><span>Votre suivi paraît dans « Ma formule »</span></li>
                {souscrit.parts === 2
                  ? <li><i>◆</i><span>Un mot vous rappellera la seconde échéance</span></li>
                  : <li><i>◆</i><span>La Maison vous écrit si quelque chose manque</span></li>}
              </ul>
            </div>

            <button type="button" className="cma-btn" onClick={onReserver}>
              Prendre mon premier rendez-vous
            </button>
            <button type="button" className="cma-btn ghost" onClick={onClose}>
              Plus tard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
