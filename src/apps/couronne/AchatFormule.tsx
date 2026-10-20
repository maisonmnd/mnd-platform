import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { useStore } from '../../shared/store';
import { supabase } from '../../shared/supabase';
import { vitrineConfigStore } from '../../shared/bridges';
import { decoupesEnLigne } from '../../shared/echeancier';
import {
  prixDeLaFormule, etendueDeLaFormule, gainPourElle, usePlans, useSubscribers, type Plan, type TeteConnue,
} from '../../shared/abonnements';
import {
  useModelBands, useBandSets, bandsAbonnements, sortedBands, bandLabel, calibreDeLaTete,
} from '../../shared/pricing';
import { useServices } from '../../shared/catalog';
import { useClients, useFamilies } from '../../shared/clients';
import { tetesPortees } from '../../shared/accounts';
import { decaleLeJour } from '../../shared/ia-faits-pur';
import { jourOuvre, peutAcheterLaFormule, prixPourLaTete, type ReleveDeLAbonnee } from '../../shared/abonnee-pur';
import { kkiapayEnabled, payWithKkiapay, verifyDeposit } from '../../shared/kkiapay';
import { useClient } from './lib';
import { dateDansLaPhrase, leJour, useReleve } from './releve';
import { t, prix } from './i18n';
import './couronne.css';
import './abonnee.css';

/* ── ACHETER SA FORMULE — 29 août 2026, refait le 20 octobre 2026 ─────────
   « Je ne veux pas qu'on envoie une demande au Trône. La cliente réserve
   immédiatement et passe au paiement » (Yéman). Maquette L0 « Le parcours de
   l'abonnée » validée le 20 octobre 2026, écran 6 : UNE SEULE PORTE.

   QUATRE TEMPS, ET LE DERNIER EST UNE PREUVE. La formule (ses séances, son
   prix pour sa tête, sa date de fin dite dès l'achat, ses conditions), sa tête
   (le calibre, ou « Je ne sais pas »), le règlement (1, 2 ou 3 fois, les dates
   exactes ; « Je passerai au comptoir » la RETIENT sept jours), la preuve
   (l'état exact, la référence ABO, la première séance incluse).

   DEUX FORMULES EN MÊME TEMPS (tranché au sélecteur le 20 octobre 2026) : une
   formule en cours ne ferme pas l'achat. Seules la formule fermée et « une
   fois par tête » refusent, et le refus se dit ici, avant de payer.

   « JE NE SAIS PAS » prend le prix du plus petit calibre ; la Maison compte au
   premier rendez-vous et annonce l'écart avant que les échéances changent
   (décision 10). Le Foyer (décision 12) : −15 % pour la deuxième et la
   troisième tête, jamais plus de 25 % sous la valeur à la carte.

   LE PRIX NE VIENT JAMAIS D'ICI. `souscrire_a_une_formule` relit le prix DANS
   la formule, côté serveur, et ignore tout montant que cet écran pourrait
   envoyer. Cet écran AFFICHE ce que le serveur décidera ; s'ils divergeaient,
   le serveur aurait raison, et c'est voulu.

   DEUX OU TROIS FOIS, JAMAIS QUATRE : la découpe en quatre se donne en face,
   au comptoir. */

type Temps = 'formule' | 'tete' | 'reglement' | 'fini';
type Voie = 'ligne' | 'comptoir';

/** Ce que le serveur a réellement créé — la seule vérité. */
type Souscrit = { subId: string; totalXof: number; parts: number; premiereXof: number; reference?: string };

const REFUS: Record<string, string> = {
  aucune_fiche: 'Votre fiche n’est pas encore ouverte. Écrivez à la Maison, on vous ouvre.',
  deja_abonnee: 'Deux formules en même temps s’ouvrent très bientôt en ligne. En attendant, la Maison vous la pose au comptoir.',
  formule_inconnue: 'Cette formule n’est plus au catalogue.',
  prix_absent: 'Cette formule n’a pas encore de prix. La Maison la prépare.',
  decoupe_refusee: 'Ce découpage ne se donne qu’au comptoir.',
  seuil_non_atteint: 'Cette formule se règle en une fois.',
  formule_fermee: 'Cette formule n’est plus proposée.',
  deja_prise: 'Cette formule ne se prend qu’une fois, et vous l’avez déjà prise.',
  apres_une_creation: 'Les Premières Lunes se signent dans les trente jours qui suivent votre création.',
};

export default function AchatFormule({
  plan, releve: releveDonne, onClose, onReserver, toast,
}: {
  plan: Plan;
  /** Son relevé : ce qui court déjà, ce qui refuse. Absent (le composeur),
      l'écran le lit lui-même : la même porte, le même juge. */
  releve?: ReleveDeLAbonnee | null;
  onClose: () => void;
  onReserver: () => void;
  toast: (m: string) => void;
}) {
  const { branch, currency } = useBranch();
  const client = useClient();
  const releveLu = useReleve(releveDonne === undefined ? client?.id : undefined);
  const releve = releveDonne ?? releveLu;
  const [cfg] = useStore(vitrineConfigStore);
  const [plans] = usePlans();
  const [services] = useServices();
  const jour = leJour();

  const [temps, setTemps] = useState<Temps>('formule');
  const [parts, setParts] = useState<1 | 2 | 3>(1);
  const [lu, setLu] = useState(false);
  const [occupe, setOccupe] = useState<Voie | null>(null);
  const [souscrit, setSouscrit] = useState<Souscrit | null>(null);
  const [regleXof, setRegleXof] = useState(0);

  /* ══ LE PRIX SUIT SA TÊTE — 1er septembre 2026 ═════════════════════
     Ce que la Maison a COMPTÉ, sinon ce que la cliente avait DÉCLARÉ, sinon ce
     qu'elle choisit ici. `bands` dit dans quelle tranche tombe une tête ;
     `calibresAbo` dit ce que cette tranche coûte en abonnement. */
  const [bands] = useModelBands();
  const [jeuxDeCalibres] = useBandSets();
  const calibresAbo = useMemo(() => bandsAbonnements(jeuxDeCalibres, bands), [jeuxDeCalibres, bands]);
  const calibres = useMemo(() => sortedBands(calibresAbo), [calibresAbo]);
  const calibreSu = calibreDeLaTete(client?.lockCount ?? client?.lockCountDeclare, bands, client?.margeCalibre)?.id;
  const [calibreDit, setCalibreDit] = useState<string | null>(null);
  const prixDu = (bandId: string | undefined) => prixDeLaFormule(plan, 'mensuel', { bandId, longueur: client?.longueur }, calibresAbo).montantXof;

  /* La question ne se pose que si la formule VARIE et que la tête est inconnue. */
  const varie = etendueDeLaFormule(plan, 'mensuel', calibresAbo) !== null;
  const doitDemander = varie && !calibreSu;
  /* « JE NE SAIS PAS » = LE PLUS PETIT CALIBRE (point tranché de la maquette). */
  const lePlusPetit = useMemo(() => {
    let meilleur: { id: string; xof: number } | null = null;
    for (const b of calibres) {
      const x = prixDu(b.id);
      if (!meilleur || x < meilleur.xof) meilleur = { id: b.id, xof: x };
    }
    return meilleur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibres, plan, client?.longueur]);
  const bandId = calibreSu ?? calibreDit ?? (doitDemander ? lePlusPetit?.id : undefined);
  const maTete: TeteConnue = { bandId, longueur: client?.longueur };
  const prixTete = prixDeLaFormule(plan, 'mensuel', maTete, calibresAbo).montantXof;

  /* ══ LE FOYER (décision 12) — la deuxième et la troisième tête. Le rang
     vient des têtes de SON compte qui portent déjà une formule ; le serveur
     relit et décide. */
  const [subs] = useSubscribers();
  const [tous] = useClients();
  const [familles] = useFamilies();
  const rang = useMemo(() => {
    if (!client) return 1;
    const autres = new Set(tetesPortees(client, tous, familles, jour).map((x) => x.id));
    const avecFormule = new Set(subs.filter((s) => s.clientId && autres.has(s.clientId) && s.status !== 'churn'
      && (!s.expiresIso || s.expiresIso >= jour)).map((s) => s.clientId as string));
    return 1 + avecFormule.size;
  }, [client, tous, familles, subs, jour]);
  const carte = gainPourElle(plan, 'mensuel', maTete, calibresAbo, (id) => services.find((x) => x.id === id)?.priceXof).carteXof;
  const foyer = prixPourLaTete({ prixTeteXof: prixTete, valeurCarteXof: carte, rangDansLeFoyer: rang });
  const total = foyer.prixXof;

  /* EN 1, 2 OU 3 FOIS, quand le serveur le tient (`decoupesEnLigne`). Le
     franc impair part sur la PREMIÈRE échéance, comme au comptoir. */
  const offertes = decoupesEnLigne(total, cfg);
  const deuxFois = offertes.includes(2);
  const troisFois = offertes.includes(3);
  const moitie = total - Math.floor(total / 2);
  const tiers = total - 2 * Math.floor(total / 3);
  const premiere = parts === 3 ? tiers : parts === 2 ? moitie : total;
  /* LES DATES EXACTES, l'année toujours ; un dimanche passe au lundi. */
  const dans = (n: number) => jourOuvre(decaleLeJour(jour, n));
  const retenueJusquau = dans(7);
  const finDuPaquet = plan.mode === 'pack' ? decaleLeJour(jour, plan.validityDays ?? 365) : null;

  /* LE REFUS SE DIT ICI, PAS AU MOMENT DE PAYER. */
  const verdict = releve ? peutAcheterLaFormule(plan, releve, plans) : { ok: true as const };
  const enCours = releve?.contrats.filter((c) => c.etat === 'en-cours' || c.etat === 'en-pause') ?? [];

  /** Crée l'abonnement CÔTÉ SERVEUR. Rend `null` et parle si le serveur refuse. */
  const souscrire = async (): Promise<Souscrit | null> => {
    if (!supabase) { toast(t('La Maison est hors ligne, réessayez dans un instant.')); return null; }
    const { data, error } = await supabase.rpc('souscrire_a_une_formule', {
      p_plan_id: plan.id,
      p_parts: parts,
      /* LE CALIBRE VOYAGE, LE PRIX NON : le serveur le relit dans la grille. */
      p_band_id: bandId ?? null,
      p_longueur: client?.longueur ?? null,
    });
    if (error) {
      toast(t('La souscription n’est pas encore ouverte, la Maison la prépare.'));
      return null;
    }
    const r = (data ?? {}) as { ok?: boolean; erreur?: string; raison?: string; subId?: string; totalXof?: number; parts?: number; premiereXof?: number; reference?: string };
    const refus = r.erreur ?? r.raison;
    if (refus) { toast(REFUS[refus] ? t(REFUS[refus]) : t('La souscription n’a pas abouti.')); return null; }
    if (!r.ok || !r.subId) { toast(t('La souscription n’a pas abouti.')); return null; }
    return {
      subId: r.subId,
      totalXof: Number(r.totalXof ?? total),
      parts: Number(r.parts ?? parts),
      premiereXof: Number(r.premiereXof ?? premiere),
      ...(r.reference ? { reference: r.reference } : {}),
    };
  };

  /* ── LA VOIE DU COMPTOIR : retenue sept jours, rien n'est dû ─────── */
  const auComptoir = async () => {
    setOccupe('comptoir');
    const s = await souscrire();
    setOccupe(null);
    if (!s) return;
    setSouscrit(s);
    setRegleXof(0);
    setTemps('fini');
  };

  /* ── LA VOIE EN LIGNE : l'abonnement naît d'abord, le paiement s'y
     rattache après vérification. Si elle échoue, la formule reste retenue. */
  const enLigne = async () => {
    setOccupe('ligne');
    const s = await souscrire();
    if (!s) { setOccupe(null); return; }
    setSouscrit(s);
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: s.premiereXof, partnerId: s.subId, branchId: branch.id,
        clientId: client?.id, phone: client?.phone, name: client?.name, email: client?.email,
      });
      const v = await verifyDeposit({
        transactionId, apptId: '', subId: s.subId, expectedXof: s.premiereXof, branchId: branch.id, clientId: client?.id,
      });
      setRegleXof(v.ok ? v.amountXof : 0);
      if (!v.ok) toast(t('Le paiement n’a pas été confirmé. Votre formule est retenue, réglez au comptoir.'));
    } catch (e) {
      setRegleXof(0);
      toast(e instanceof Error && e.message ? t(e.message) : t('Paiement interrompu. Votre formule reste retenue.'));
    }
    setOccupe(null);
    setTemps('fini');
  };

  const seances = (plan.included ?? []).reduce((m, i) => Math.max(m, i.qty ?? 0), 0);
  const ETAPES: Temps[] = doitDemander ? ['formule', 'tete', 'reglement', 'fini'] : ['formule', 'reglement', 'fini'];
  const NOMS: Record<Temps, string> = { formule: t('Votre formule'), tete: t('Votre tête'), reglement: t('Le règlement'), fini: t('C’est fait') };

  return (
    <div className="mc-flow">
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <span className="mc-micro-eyebrow">{t('Acheter · une seule porte')}</span>
          <button className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
        </div>
        <div className="ab-fil">
          {ETAPES.map((e, i) => (
            <span key={e} style={{ display: 'contents' }}>
              {i > 0 && <span>›</span>}
              <b className={temps === e ? 'is-on' : ''}>{NOMS[e]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">
        <div className="ab-page" style={{ padding: 0 }}>

          {/* ── ① LA FORMULE ─────────────────────────────────────────── */}
          {temps === 'formule' && (
            <>
              {enCours.length > 0 && verdict.ok && (
                <div className="ab-foyer">
                  <b>{t('Deux en même temps.')}</b>{' '}
                  {t('Vous pouvez la prendre en plus de votre formule en cours ; à chaque réservation, la formule qui finit le plus tôt est proposée d’office, et vous pouvez choisir l’autre.')}
                </div>
              )}
              <div className="cma-offre">
                {plan.tag ? <div className="cma-offre__tag">{plan.tag}</div> : null}
                <div className="cma-offre__nom">{plan.name}</div>
                {plan.line ? <p className="cma-offre__ligne">{plan.line}</p> : null}
                {plan.perks.length > 0 && (
                  <ul className="cma-inclus">
                    {plan.perks.slice(0, 5).map((av) => <li key={av}><i>◆</i><span>{av}</span></li>)}
                  </ul>
                )}
                <div className="cma-somme">
                  <span>{doitDemander && !calibreDit ? t('À partir de') : t('Pour votre tête')}</span>
                  <b>{foyer.foyerJoue && foyer.foyerXof > 0 ? <s style={{ fontSize: '0.6em', marginRight: 8, color: 'var(--ink-mute)' }}>{prix(prixTete, currency)}</s> : null}{prix(total, currency)}</b>
                </div>
                <div className="cma-somme__sous">
                  {finDuPaquet
                    ? t('Valable jusqu’au {date}. Les séances non prises à cette date sont perdues.', { date: dateDansLaPhrase(finDuPaquet) })
                    : t('Chaque lune, réglée avant la lune, tant que vous la gardez.')}
                </div>
              </div>
              {foyer.foyerJoue && (
                <div className="ab-foyer">
                  {foyer.foyerXof > 0
                    ? t('Remise Foyer, {rang} tête du foyer : {avant} → {apres}, soit {ecart} de moins (la remise s’arrête à 25 % sous la valeur à la carte).', {
                      rang: rang === 2 ? t('deuxième') : t('troisième'), avant: prix(prixTete, currency), apres: prix(total, currency), ecart: prix(foyer.foyerXof, currency),
                    })
                    : t('La remise Foyer ne s’ajoute pas : cette formule donne déjà le plus haut avantage, 25 % sous la valeur à la carte.')}
                </div>
              )}
              <div className="ab-verrou">
                <dl>
                  <div><dt>{t('Annuler ou déplacer')}</dt><dd>{t('Plus de 24 h avant : rien n’est compté, la séance revient à votre formule.')}</dd></div>
                  <div><dt>{t('À moins de 24 h, ou absente')}</dt><dd>{t('La séance est comptée et marquée « Manquée ». Pour un motif justifié, la Maison peut la rendre.')}</dd></div>
                  {finDuPaquet && <div><dt>{t('Fin')}</dt><dd>{t('Le {date}. Sur demande, la Maison peut la repousser, avec un motif.', { date: dateDansLaPhrase(finDuPaquet) })}</dd></div>}
                  <div><dt>{t('Le prix')}</dt><dd>{t('S’il est revu après le comptage de votre calibre, la Maison vous l’annonce ici et par WhatsApp avant que vos échéances changent.')}</dd></div>
                </dl>
              </div>
              {!verdict.ok ? (
                <p className="ab-choix__refus">{t(verdict.raison === 'fermee' ? REFUS.formule_fermee : REFUS.deja_prise)}</p>
              ) : (
                <button type="button" className="cma-btn" onClick={() => setTemps(doitDemander ? 'tete' : 'reglement')}>{t('Continuer')}</button>
              )}
            </>
          )}

          {/* ── ② SA TÊTE ───────────────────────────────────────────── */}
          {temps === 'tete' && (
            <>
              <div className="cma-calibre__q">{t('Combien de locks portez-vous ?')}</div>
              <p className="ab-meta">{t('Cela change le temps que la Maison vous consacre, donc le prix. Une estimation suffit, on comptera ensemble au premier rendez-vous.')}</p>
              <div className="ab-calibres">
                {calibres.map((b) => (
                  <button key={b.id} type="button" className={`ab-cal ${calibreDit === b.id ? 'is-on' : ''}`} onClick={() => setCalibreDit(b.id)}>
                    <b>{bandLabel(b, calibres)}</b>
                    <em>{prix(prixDu(b.id), currency)}</em>
                  </button>
                ))}
                <button type="button" className={`ab-cal ${calibreDit === null ? 'is-on' : ''}`} onClick={() => setCalibreDit(null)}>
                  <b>{t('Je ne sais pas')}</b>
                  <span>{t('Le prix du plus petit calibre. La Maison compte au premier rendez-vous et vous annonce l’écart, ici et par WhatsApp, avant vos échéances.')}</span>
                  <em>{lePlusPetit ? prix(lePlusPetit.xof, currency) : ''}</em>
                </button>
              </div>
              <button type="button" className="cma-btn" onClick={() => setTemps('reglement')}>{t('Continuer')}</button>
              <button type="button" className="cma-lien" onClick={() => setTemps('formule')}>{t('Revenir à la formule')}</button>
            </>
          )}

          {/* ── ③ LE RÈGLEMENT ──────────────────────────────────────── */}
          {temps === 'reglement' && (
            <>
              <button type="button" className={`ab-choix ${parts === 1 ? 'is-on' : ''}`} onClick={() => setParts(1)}>
                <span className="ab-choix__haut"><span className="ab-choix__n">{t('En une fois')}</span><span className="ab-choix__m">{prix(total, currency)}</span></span>
                <span className="ab-choix__s">{t('Aujourd’hui, {date}.', { date: dateDansLaPhrase(jour) })}</span>
              </button>
              {deuxFois ? (
                <button type="button" className={`ab-choix ${parts === 2 ? 'is-on' : ''}`} onClick={() => setParts(2)}>
                  <span className="ab-choix__haut"><span className="ab-choix__n">{t('En deux fois')}</span><span className="ab-choix__m">{prix(moitie, currency)}</span></span>
                  <span className="ab-choix__s">{t('{premiere} aujourd’hui, puis {seconde} le {date}.', { premiere: prix(moitie, currency), seconde: prix(total - moitie, currency), date: dateDansLaPhrase(dans(30)) })}</span>
                </button>
              ) : null}
              {troisFois ? (
                <button type="button" className={`ab-choix ${parts === 3 ? 'is-on' : ''}`} onClick={() => setParts(3)}>
                  <span className="ab-choix__haut"><span className="ab-choix__n">{t('En trois fois')}</span><span className="ab-choix__m">{prix(tiers, currency)}</span></span>
                  <span className="ab-choix__s">{t('{premiere} aujourd’hui, puis {tiers} le {date1} et le {date2}.', { premiere: prix(tiers, currency), tiers: prix(Math.floor(total / 3), currency), date1: dateDansLaPhrase(dans(30)), date2: dateDansLaPhrase(dans(60)) })}</span>
                </button>
              ) : null}
              <p className="ab-meta">{t('Un rappel vous arrive sur WhatsApp la veille de chaque échéance.')}</p>
              <label className="ab-lu">
                <input type="checkbox" checked={lu} onChange={(e) => setLu(e.target.checked)} />
                <span>{t('J’ai lu ce qui est convenu : les séances non prises à la date de fin sont perdues ; à moins de 24 h, ou absente, la séance est comptée.')}</span>
              </label>
              {kkiapayEnabled() && (
                <button type="button" className="cma-btn cma-btn--indigo" disabled={!!occupe || !lu} onClick={() => void enLigne()}>
                  {occupe === 'ligne' ? t('Un instant…') : t('Régler {montant} maintenant', { montant: prix(premiere, currency) })}
                </button>
              )}
              <button type="button" className="cma-btn ghost" disabled={!!occupe || !lu} onClick={() => void auComptoir()}>
                {occupe === 'comptoir' ? t('Un instant…') : t('Je passerai au comptoir · retenue jusqu’au {date}', { date: dateDansLaPhrase(retenueJusquau) })}
              </button>
              <p className="ab-meta">{t('Au comptoir : la formule est retenue sept jours, rien n’est dû ; sans règlement, elle s’efface le lendemain. Aucune séance incluse avant le premier règlement.')}</p>
              <button type="button" className="cma-lien" disabled={!!occupe} onClick={() => setTemps(doitDemander ? 'tete' : 'formule')}>{t('Revenir')}</button>
            </>
          )}

          {/* ── ④ LA PREUVE ─────────────────────────────────────────── */}
          {temps === 'fini' && souscrit && (
            <>
              <div className="cma-fini">
                <div className="cma-fini__mono">◆</div>
                <p className="cma-fini__t">{regleXof > 0 ? t('Votre formule est ouverte.') : t('Votre formule est retenue.')}</p>
                <p className="cma-fini__s">
                  {regleXof > 0
                    ? t('Réglé : {montant}.', { montant: prix(regleXof, currency) })
                    : t('Retenue jusqu’au {date} au soir : réglez {montant} pour l’ouvrir. Sans règlement, elle s’efface le lendemain, et rien n’est dû.', { date: dateDansLaPhrase(retenueJusquau), montant: prix(souscrit.premiereXof, currency) })}
                  {regleXof > 0 && souscrit.totalXof - regleXof > 0
                    ? <>{' '}{t('Il restera {montant} à régler, aux dates convenues.', { montant: prix(souscrit.totalXof - regleXof, currency) })}</>
                    : null}
                </p>
              </div>
              <div className="ab-recap">
                <div className="ab-recap__l"><span>{t('La formule')}</span><span>{plan.name}</span></div>
                <div className="ab-recap__l"><span>{t('Référence')}</span><span>{souscrit.reference ?? t('donnée au premier règlement')}</span></div>
                {finDuPaquet && <div className="ab-recap__l"><span>{t('Fin')}</span><span>{dateDansLaPhrase(finDuPaquet)}</span></div>}
                {seances > 0 && <div className="ab-recap__l"><span>{t('Séances')}</span><span>{seances}</span></div>}
              </div>
              {regleXof > 0 ? (
                <button type="button" className="cma-btn" onClick={onReserver}>{t('Réserver ma première séance incluse')}</button>
              ) : (
                <p className="ab-raison">{t('Aucune séance incluse avant le premier règlement.')}</p>
              )}
              <button type="button" className="cma-btn ghost" onClick={onClose}>{t('Plus tard')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
