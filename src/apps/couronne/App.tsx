import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import MaCarte from './MaCarte';
import { useAuth, requireAuth, signOut, signInWithGoogle } from '../../shared/auth';
import { useClients, useFamilies } from '../../shared/clients';
import { ageDe, tetesPortees } from '../../shared/accounts';
import { formulesPourElle, usePlans } from '../../shared/abonnements';
import { formulesVisiblesPour, vitrineConfigStore } from '../../shared/bridges';
import { useStore } from '../../shared/store';
import type { ReleveDuContrat } from '../../shared/abonnee-pur';
import { useEnsureClient, useActivityTracker, useClientId, useClient, useCompteEnDouble, useCompteMaison, useCouronneFermee, useModuleFerme, todayIso, type BookingPrefill } from './lib';
import { registerSW, ensurePush, clearAppNotifications } from '../../shared/push';
import { poseLIdentite } from '../../shared/journal';
import Onboarding from './Onboarding';
import Booking from './Booking';
import Compose from './Compose';
import MesRendezVous from './MesRendezVous';
import { HomeTab, HomeEnfant, SuiviTab, GammeTab, CercleTab, ProfilTab, Notifications, MesCommandes } from './Tabs';
import { MaFormuleTab } from './MaFormule';
import RendezVousTab from './RendezVousTab';
import MonSolde from './MonSolde';
import ReserverIncluse from './ReserverIncluse';
import { FeuilleRegler, type DemandeDeReglement, type GestesDeLAbonnee } from './Abonnee';
import { appelleLaMaison, useReleve } from './releve';
import { t, useLangue, adopteLaLangueDeLaFiche } from './i18n';

/* Ma Couronne — l'app cliente de la Maison MND.
   Une vraie app web : plein écran sur mobile (100dvh, safe-areas) ;
   sur bureau, navigation verticale à gauche et contenu centré large. */

/* ══ LA BARRE DU BAS — 20 octobre 2026 (décision 8, maquette L0 validée) ══
   Accueil · Rendez-vous · Ma formule · Suivi · Profil. Rendez-vous devient un
   onglet (il était un panneau) ; Mon solde est un écran à lui ; la Gamme et le
   Cercle deviennent des cartes de l'accueil et des entrées du Profil. Chaque
   glyphe ne sert qu'une fois : Ma formule et Profil portaient le même. */
type TabId = 'accueil' | 'rdv' | 'formule' | 'suivi' | 'profil';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'accueil', label: 'Accueil', glyph: '♛' },
  { id: 'rdv', label: 'Rendez-vous', glyph: '◷' },
  { id: 'formule', label: 'Ma formule', glyph: '◈' },
  { id: 'suivi', label: 'Suivi', glyph: '✦' },
  { id: 'profil', label: 'Profil', glyph: '◉' },
];

/** Les écrans posés par-dessus l'onglet, ouverts d'une carte ou d'un lien. */
type Ecran = 'gamme' | 'cercle' | 'solde';

function Shell() {
  /* Le dossier de la cliente est garanti dès l'entrée dans l'app. */
  useEnsureClient();
  const clientId = useClientId();

  /* QUI TIENT LA PLUME — 21 août 2026. Une réservation faite ici est un geste
     comme un autre, mais son auteur n'est pas du personnel : le journal du
     Trône l'inscrit sous sa PORTE D'ENTRÉE plutôt que sous un nom propre.
     Savoir qu'un rendez-vous vient de l'application vaut mieux que de le
     croire saisi au comptoir. */
  useEffect(() => {
    poseLIdentite({ nom: 'Une cliente', porte: 'couronne' });
  }, []);

  /* Web Push : on enregistre le service worker au chargement, et on ré-abonne
     silencieusement si la cliente a déjà accordé la permission (nouvel appareil,
     abonnement expiré). La 1re demande de permission se fait à la réservation. */
  useEffect(() => {
    void registerSW();
    if (clientId && clientId !== 'c-local') void ensurePush(clientId);
  }, [clientId]);

  /* Vide le tiroir + badge d'icône à chaque reprise (ouverture, focus, BFCache). */
  useEffect(() => {
    const clear = () => { void clearAppNotifications(); };
    clear();
    const onVis = () => { if (!document.hidden) clear(); };
    window.addEventListener('focus', clear);
    window.addEventListener('pageshow', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', clear);
      window.removeEventListener('pageshow', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const [tab, setTab] = useState<TabId>('accueil');

  /* Modules coupés par la Maison (Vitrine du Trône) : les onglets désactivés
     disparaissent ; si l'onglet courant se ferme, on revient à l'Accueil. */
  const me = useClient();
  /* SA LANGUE LA SUIT D'UN TÉLÉPHONE À L'AUTRE : la fiche la porte, un
     appareil neuf l'adopte (sauf choix déjà fait ici). Voir i18n.ts. */
  const lg = useLangue();
  useEffect(() => { adopteLaLangueDeLaFiche(me?.langue); }, [me?.langue]);
  /* LE SÉLECTEUR DE TÊTE (maquette du 9 août, écran 1). Le compte reste celui
     du parent — le sélecteur ne change pas de session, il change la tête que
     l'application REGARDE. Sans enfant rattaché au compte famille, la ligne
     ne paraît pas du tout ; « Vous » est toujours en premier. Depuis le 20
     octobre 2026, il suit l'Accueil, Rendez-vous, Ma formule et Mon solde. */
  const [tousClients] = useClients();
  const [familles] = useFamilies();
  const tetes = me ? tetesPortees(me, tousClients, familles, todayIso()) : [];
  const [tete, setTete] = useState('');
  const enfant = tetes.find((t) => t.id === tete);
  /* La tête regardée peut sortir du compte (majorité, détachement) : le regard
     revient à soi au lieu de fixer le vide. */
  useEffect(() => {
    if (tete && !enfant) setTete('');
  }, [tete, enfant]);
  /* UN SEUL JUGE pour les deux fermetures — celle de la Maison et celle de sa
     fiche. Voir `useModuleFerme`. Quand on regarde un ENFANT, les écrans qui
     n'ont pas de sens pour un mineur se ferment : ni Gamme ni Cercle à son nom
     (maquette du 9 août — c'est le compte du parent qui commande et cumule). */
  const ferme = useModuleFerme();
  const visibleTabs = TABS.filter((t) => t.id !== 'suivi' || !ferme('suivi'));
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab('accueil');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.hiddenModules?.join('|'), tete]);

  /* Suivi de présence : une session par visite, temps cumulé écrit pour le Trône. */
  useActivityTracker(tab);

  /* LE RELEVÉ DE LA TÊTE REGARDÉE (20 octobre 2026) : le juge unique de
     l'abonnée, le même que le Trône. Tous les écrans de la formule le lisent. */
  const teteId = enfant?.id ?? (clientId && clientId !== 'c-local' ? clientId : me?.id);
  const releve = useReleve(teteId);
  const prenomTete = enfant ? (enfant.name.split(' ')[0] || enfant.name) : undefined;

  /* LA VITRINE DES FORMULES EST-ELLE OUVERTE POUR ELLE ? Même juge que
     l'onglet Ma formule (`formulesVisiblesPour`). */
  const [plans] = usePlans();
  const [cfgVitrine] = useStore(vitrineConfigStore);
  const aUnFoyer = !!me?.familyId && familles.some((f) => f.id === me.familyId);
  const peutAcheter = useMemo(
    () => formulesPourElle(formulesVisiblesPour({ cfg: cfgVitrine, masques: me?.vitrineMasques, plans }), aUnFoyer).length > 0,
    [cfgVitrine, me?.vitrineMasques, plans, aUnFoyer],
  );

  const [booking, setBooking] = useState<{ prefill?: BookingPrefill } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  /* MES RENDEZ-VOUS, ouvert sur la fiche d'UN rendez-vous (`{ ouvrir }`) —
     7 octobre 2026, « le rendez-vous s'ouvre partout ». Depuis le 20 octobre
     2026, la liste est un onglet ; la fiche peut s'ouvrir sur un geste. */
  const [rdv, setRdv] = useState<{ ouvrir?: string; geste?: 'annuler' | 'deplacer' } | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [carteOpen, setCarteOpen] = useState(false);
  const [ecran, setEcran] = useState<Ecran | null>(null);
  const [incluse, setIncluse] = useState<{ debut: 'choix' | 'quoi' } | null>(null);
  const [regler, setRegler] = useState<DemandeDeReglement | null>(null);
  const [renonce, setRenonce] = useState<ReleveDuContrat | null>(null);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  /* Garde GLOBALE : réservation coupée pour cette cliente → aucun chemin
     (bouton, offre, re-réservation) n'ouvre le tunnel — un mot honnête à la place. */
  const openBookingDirect = useCallback((prefill?: BookingPrefill) => {
    if (ferme('reserver')) {
      toast(t('Les réservations en ligne sont fermées pour votre compte, contactez la maison.'));
      return;
    }
    setNotifOpen(false);
    setRdv(null);
    setIncluse(null);
    setBooking({ prefill });
  }, [ferme, toast]);

  /* RÉSERVER, SANS AUTRE PRÉCISION : quand une formule peut porter la séance,
     le choix vient d'abord (« Une séance de ma formule » / « Un autre soin »).
     Une offre, un « refaire », un soin désigné ouvrent le tunnel directement. */
  const openBooking = useCallback((prefill?: BookingPrefill) => {
    if (!prefill && releve?.porte.peutReserverIncluse && !ferme('reserver')) {
      setNotifOpen(false);
      setRdv(null);
      setIncluse({ debut: 'choix' });
      return;
    }
    openBookingDirect(prefill);
  }, [releve?.porte.peutReserverIncluse, ferme, openBookingDirect]);

  const openIncluse = useCallback(() => {
    if (ferme('reserver')) {
      toast(t('Les réservations en ligne sont fermées pour votre compte, contactez la maison.'));
      return;
    }
    setNotifOpen(false);
    setRdv(null);
    setEcran(null);
    setIncluse({ debut: 'quoi' });
  }, [ferme, toast]);

  const openCompose = useCallback(() => {
    if (ferme('compose')) {
      toast(t('Le rituel sur-mesure est fermé pour votre compte, contactez la maison.'));
      return;
    }
    setComposeOpen(true);
  }, [ferme, toast]);

  /* SANS IDENTIFIANT, LA LISTE : c'est l'onglet Rendez-vous. AVEC, la fiche. */
  const openRdv = useCallback((id?: string) => {
    setNotifOpen(false);
    setOrdersOpen(false);
    if (!id) { setRdv(null); setEcran(null); setTab('rdv'); return; }
    setRdv({ ouvrir: id });
  }, []);

  /* LE LIEN D'UNE NOTIFICATION — `#/rdv/<id>` ouvre la fiche de CE
     rendez-vous, à l'ouverture comme quand l'app est déjà là. Le fragment
     s'efface ensuite : revenir en arrière ne la rouvre pas en boucle. */
  useEffect(() => {
    const lis = () => {
      const m = /^#\/rdv\/([A-Za-z0-9_-]+)$/.exec(window.location.hash);
      if (!m) return;
      openRdv(m[1]);
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sans historique, tant pis */ }
    };
    lis();
    window.addEventListener('hashchange', lis);
    return () => window.removeEventListener('hashchange', lis);
  }, [openRdv]);

  /* LES LIENS DE L'ABONNÉE (20 octobre 2026) : chaque WhatsApp et chaque
     notification ouvrent l'écran dont ils parlent — `#/formule`, `#/solde`,
     `#/reserver/incluse`. */
  useEffect(() => {
    const lisLesLiens = () => {
      const h = window.location.hash;
      if (h === '#/formule') { setEcran(null); setTab('formule'); }
      else if (h === '#/solde') setEcran('solde');
      else if (h === '#/reserver/incluse') openIncluse();
      else return;
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sans historique, tant pis */ }
    };
    lisLesLiens();
    window.addEventListener('hashchange', lisLesLiens);
    return () => window.removeEventListener('hashchange', lisLesLiens);
  }, [openIncluse]);

  const openOrders = useCallback(() => {
    setNotifOpen(false);
    setRdv(null);
    setOrdersOpen(true);
  }, []);

  /* RENONCER À UNE FORMULE RETENUE (décision 7) : rien n'est dû, elle
     s'efface. Le serveur l'écrit ; tant qu'il n'est pas posé, on le dit. */
  const renoncer = async (c: ReleveDuContrat) => {
    setRenonce(null);
    const r = await appelleLaMaison<{ ok?: boolean; raison?: string }>('renoncer_a_la_formule', { p_sub_id: c.sub.id });
    if (r.ok) toast(t('C’est fait : la formule est effacée, rien n’est dû.'));
    else if (r.absente) toast(t('Renoncer en ligne ouvre très bientôt. Écrivez à la Maison : elle l’efface pour vous.'));
    else toast(t('La Maison n’a pas pu effacer la formule. Écrivez-lui.'));
  };

  const versLeCercle = !enfant && !ferme('cercle') ? () => setEcran('cercle') : undefined;
  const versLaGamme = !enfant && !ferme('gamme') ? () => setEcran('gamme') : undefined;
  const gestes: GestesDeLAbonnee = {
    releve,
    peutAcheter: peutAcheter && !enfant,
    onRegler: setRegler,
    onRenoncer: (c) => setRenonce(c),
    onSolde: () => setEcran('solde'),
    onFormule: () => { setEcran(null); setTab('formule'); },
    onReserverIncluse: openIncluse,
    onAcheter: () => { setEcran(null); setTab('formule'); },
    goGamme: versLaGamme,
    goCercle: versLeCercle,
  };

  /* LE SÉLECTEUR DE TÊTE, posé sur chaque écran qui regarde une tête. */
  const selecteur = tetes.length > 0 ? (
    <div className="mc-pourqui">
      <button
        type="button"
        className={`mc-pourqui__chip ${!tete ? 'is-on' : ''}`}
        onClick={() => setTete('')}
      >
        {t('Vous')}
      </button>
      {tetes.map((tt) => {
        const a = ageDe(tt.birthday, todayIso());
        return (
          <button
            key={tt.id}
            type="button"
            className={`mc-pourqui__chip ${tete === tt.id ? 'is-on' : ''}`}
            onClick={() => setTete(tt.id)}
          >
            {tt.name.split(' ')[0]}{a !== undefined ? <> · {t('{age} ans', { age: a })}</> : ''}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {/* `key` : changer de langue remonte l'écran, rien ne garde une phrase d'avant. */}
      <div className="mc-scroll mc-appbody" key={lg}>
        {/* UNE SEULE LIGNE S'AJOUTE EN HAUT DE L'ACCUEIL (écran 1) : les têtes
            du compte. Tout le reste de l'application est déjà là. */}
        {tab === 'accueil' && selecteur && (
          <div style={{ padding: '14px 18px 0' }}>{selecteur}</div>
        )}
        {tab === 'accueil' && (enfant ? (
          <HomeEnfant enfant={enfant} abonnee={gestes} onOpenBooking={openBooking} onRevenir={() => setTete('')} onOpenRdv={openRdv} />
        ) : (
          <HomeTab
            onOpenBooking={openBooking}
            onOpenCompose={openCompose}
            onOpenNotif={() => setNotifOpen(true)}
            onOpenRdv={openRdv}
            goGamme={() => setEcran('gamme')}
            toast={toast}
            onOpenCarte={() => (!ferme('cercle') ? setEcran('cercle') : setCarteOpen(true))}
            goFormule={visibleTabs.some((t) => t.id === 'formule') ? () => setTab('formule') : undefined}
            abonnee={gestes}
          />
        ))}
        {tab === 'rdv' && releve && (
          <RendezVousTab
            releve={releve}
            prenom={prenomTete}
            selecteur={selecteur}
            onOpenRdv={(id) => openRdv(id)}
            onGeste={(id, geste) => { setNotifOpen(false); setRdv({ ouvrir: id, geste }); }}
            onReserver={() => (enfant ? openBookingDirect({ pourId: enfant.id }) : openBooking())}
          />
        )}
        {tab === 'suivi' && <SuiviTab regard={enfant} onOpenBooking={openBooking} onOpenRdv={openRdv} onOpenOrders={openOrders} goGamme={() => setEcran('gamme')} />}
        {tab === 'formule' && (
          <MaFormuleTab
            toast={toast}
            onReserver={openIncluse}
            releve={releve}
            prenom={prenomTete}
            selecteur={selecteur}
            onRegler={setRegler}
            onRenoncer={(c) => setRenonce(c)}
            onSolde={() => setEcran('solde')}
            onOpenRdv={(id) => openRdv(id)}
            onReserverIncluse={openIncluse}
          />
        )}
        {tab === 'profil' && (
          <ProfilTab toast={toast} entrees={{ solde: () => setEcran('solde'), gamme: versLaGamme, cercle: versLeCercle }} />
        )}
      </div>

      <nav className="mc-tabbar">
        <img className="mc-nav__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
        {visibleTabs.map((onglet) => (
          <button
            key={onglet.id}
            className={`mc-tab ${tab === onglet.id ? 'is-on' : ''}`}
            onClick={() => { setEcran(null); setTab(onglet.id); }}
            aria-current={tab === onglet.id ? 'page' : undefined}
          >
            <span className="mc-tab__glyph">{onglet.glyph}</span>
            <span className="mc-tab__label">{t(onglet.label)}</span>
          </button>
        ))}
        <button className="mc-nav__signout" onClick={() => void signOut()}>{t('Se déconnecter')}</button>
      </nav>

      {/* LA GAMME ET LE CERCLE, posés par-dessus : ils ont quitté la barre. */}
      {(ecran === 'gamme' || ecran === 'cercle') && (
        <div className="mc-overlayscreen mc-slide" style={{ zIndex: 41 }}>
          <div className="mc-flowhead" style={{ paddingBottom: 10 }}>
            <div className="mc-flowhead__row">
              <button type="button" className="mc-linkback" onClick={() => setEcran(null)}>← {t('Retour')}</button>
              <button type="button" className="mc-x" aria-label={t('Fermer')} onClick={() => setEcran(null)}>✕</button>
            </div>
          </div>
          <div className="mc-scroll" style={{ flex: 1 }}>
            {ecran === 'gamme' ? <GammeTab toast={toast} onOpenOrders={openOrders} /> : <CercleTab toast={toast} />}
          </div>
        </div>
      )}
      {ecran === 'solde' && releve && (
        <MonSolde releve={releve} prenom={prenomTete} selecteur={selecteur} onClose={() => setEcran(null)} onRegler={setRegler} />
      )}
      {incluse && releve && teteId && (
        <ReserverIncluse
          releve={releve}
          prenom={prenomTete}
          teteId={teteId}
          estElle={!enfant}
          debut={incluse.debut}
          onClose={() => setIncluse(null)}
          onAutreSoin={() => { setIncluse(null); openBookingDirect(enfant ? { pourId: enfant.id } : undefined); }}
          onVoirRdv={(id) => { setIncluse(null); openRdv(id); }}
          toast={toast}
        />
      )}

      {booking && (
        <Booking
          prefill={booking.prefill}
          onClose={() => setBooking(null)}
          toast={toast}
          onVoirRdv={(id) => { setBooking(null); openRdv(id); }}
        />
      )}
      {/* UN FORFAIT À UNE SÉANCE SE RÉSERVE (16 août) : le composeur se ferme et
          le tunnel s'ouvre POSÉ dessus — elle n'a plus qu'à choisir son moment.
          `openBooking` garde sa garde : réservation coupée pour ce compte, le
          tunnel ne s'ouvre pas et la cliente le lit en toutes lettres. */}
      {composeOpen && (
        <Compose
          onClose={() => setComposeOpen(false)}
          toast={toast}
          onReserver={(serviceId) => { setComposeOpen(false); openBooking({ serviceId }); }}
        />
      )}
      {notifOpen && <Notifications onClose={() => setNotifOpen(false)} onOpenRdv={openRdv} />}
      {rdv && (
        <MesRendezVous
          onClose={() => setRdv(null)}
          onBook={() => openBooking()}
          toast={toast}
          ouvrir={rdv.ouvrir}
          geste={rdv.geste}
          onRefaire={(a) => openBooking({
            serviceId: a.serviceIds[0],
            serviceIds: a.serviceIds,
            ...(me && a.clientId !== me.id ? { pourId: a.clientId } : {}),
          })}
        />
      )}
      {ordersOpen && <MesCommandes onClose={() => setOrdersOpen(false)} />}
      {carteOpen && <MaCarte onClose={() => setCarteOpen(false)} toast={toast} />}

      {/* LA FEUILLE « RÉGLER » ET « RENONCER », au-dessus de tout écran. */}
      {regler && <FeuilleRegler demande={regler} onClose={() => setRegler(null)} toast={toast} />}
      {renonce && (
        <>
          <div className="ab-voile" onClick={() => setRenonce(null)} />
          <div className="ab-feuille" role="dialog" aria-modal="true" aria-label={t('Renoncer')}>
            <span className="ab-feuille__poignee" aria-hidden="true" />
            <div className="mc-micro-eyebrow">{t('Renoncer')}</div>
            <div className="ab-feuille__t">{renonce.nom}</div>
            <p className="ab-meta">{t('Rien n’est dû : la formule retenue s’efface aujourd’hui. Vous pourrez en reprendre une quand vous voudrez.')}</p>
            <button type="button" className="mc-cta mc-cta--danger" onClick={() => void renoncer(renonce)}>{t('Renoncer à cette formule')}</button>
            <button type="button" className="mc-cta mc-cta--quiet" onClick={() => setRenonce(null)}>{t('Garder ma formule')}</button>
          </div>
        </>
      )}

      {toastMsg && <div className="mc-toast mc-rise">{toastMsg}</div>}
    </>
  );
}

export default function App() {
  const { session, loading } = useAuth();
  const { fermee, mot } = useCouronneFermee();
  /* Cette session est-elle la SECONDE porte ouverte sur une même adresse ?
     (mot de passe d'un côté, Google de l'autre — 14 août, Valerie). */
  const double = useCompteEnDouble();
  /* Ou le compte de la MAISON, qui n'a rien à faire ici ? Le Trône est sa
     porte — ici, il se fabriquait une fiche cliente (14 août). */
  const maison = useCompteMaison();

  /* Splash bref pendant la restauration de session. */
  if (loading) {
    return (
      <div className="mc-app mc-app--auth">
        <div className="mc-viewport">
          <div className="mc-splash"><img src={asset('/assets/monograms/mono-copper.png')} alt="" /></div>
        </div>
      </div>
    );
  }

  /* Verrou : quand l'auth est imposée et qu'aucune session n'existe → connexion.
     Sans backend (dev local), l'app s'ouvre directement. */
  const authed = !requireAuth || !!session;

  /* LA PORTE EST CLOSE — la Maison a fermé Ma Couronne pour toutes. On le dit
     AVANT la connexion : demander son mot de passe à quelqu'un pour lui montrer
     ensuite une maison fermée, c'est lui faire perdre deux fois son temps. */
  if (fermee) {
    return (
      <div className="mc-app mc-app--auth">
        <div className="mc-viewport">
          <div className="mc-closed">
            <img className="mc-closed__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
            <h1 className="mc-closed__t">{t('La maison est fermée.')}</h1>
            <p className="mc-closed__s">{mot}</p>
          </div>
        </div>
      </div>
    );
  }

  /* LE COMPTE DE LA MAISON N'OUVRE PAS MA COURONNE. Le Trône est sa porte —
     ici, il se fabriquait une fiche cliente à côté du carnet qu'il tient. */
  if (authed && maison) {
    const lienTrone = `${window.location.origin}${window.location.pathname.startsWith('/couronne') ? '/trone/' : '/trone.html'}`;
    return (
      <div className="mc-app mc-app--auth">
        <div className="mc-viewport">
          <div className="mc-closed">
            <img className="mc-closed__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
            <h1 className="mc-closed__t">{t('Ce compte tient le Trône.')}</h1>
            <p className="mc-closed__s">
              {t('Ma Couronne est la porte des clientes, le compte de la maison, lui, ouvre le Trône. Pour essayer Ma Couronne, utilisez un compte de test qui n’est pas au personnel.')}
            </p>
            <a className="mc-cta mc-cta--copper" style={{ marginTop: 18, display: 'inline-block', textDecoration: 'none' }} href={lienTrone}>
              {t('Ouvrir le Trône')}
            </a>
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={() => void signOut()}>
              {t('Se déconnecter')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* LA PORTE EST DÉJÀ OUVERTE AILLEURS. Cette adresse a son espace — ouvert
     par une autre porte de connexion. Ouvrir un second espace vide à côté du
     vrai (sans famille, sans enfants, sans historique) serait pire que de
     refermer : on le dit, et on raccompagne. */
  if (authed && double) {
    return (
      <div className="mc-app mc-app--auth">
        <div className="mc-viewport">
          <div className="mc-closed">
            <img className="mc-closed__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
            <h1 className="mc-closed__t">{t('Cette adresse a déjà son espace.')}</h1>
            <p className="mc-closed__s">
              {t('Votre couronne, vos enfants et vos rendez-vous sont bien là. Ils sont attachés à l’autre porte de cette même adresse. Reprenez par celle-là, tout vous attend derrière. Un doute ? Écrivez à la maison, on vous ouvre.')}
            </p>
            {/* DEUX PORTES, PAS UNE CONSIGNE. L'écran disait « reconnectez-vous
                par la porte utilisée la première fois » sans dire LAQUELLE, et
                sans rien à toucher : la cliente restait dehors avec un conseil.
                Les deux portes sont ici, elle en pousse une. */}
            <button className="mc-cta" style={{ marginTop: 18 }} onClick={() => void signInWithGoogle()}>
              {t('Continuer avec Google')}
            </button>
            {/* LE MOT DIT LES DEUX CHOSES : ce bouton DÉCONNECTE, puis rouvre
                la porte ordinaire. « Entrer par e-mail » seul laissait croire
                qu'on restait connecté, et personne n'osait le toucher. */}
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={() => void signOut()}>
              {t('Se déconnecter et entrer autrement')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`mc-app mc-app--${authed ? 'shell' : 'auth'}`}>
      <div className="mc-viewport">{authed ? <Shell /> : <Onboarding />}</div>
    </div>
  );
}
