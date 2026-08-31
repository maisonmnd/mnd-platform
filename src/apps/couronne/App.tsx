import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { useAuth, requireAuth, signOut, signInWithGoogle } from '../../shared/auth';
import { useClients, useFamilies } from '../../shared/clients';
import { ageDe, tetesPortees } from '../../shared/accounts';
import { useEnsureClient, useActivityTracker, useClientId, useClient, useCompteEnDouble, useCompteMaison, useCouronneFermee, useModuleFerme, todayIso, type BookingPrefill } from './lib';
import { registerSW, ensurePush, clearAppNotifications } from '../../shared/push';
import { poseLIdentite } from '../../shared/journal';
import Onboarding from './Onboarding';
import Booking from './Booking';
import Compose from './Compose';
import MesRendezVous from './MesRendezVous';
import { HomeTab, HomeEnfant, SuiviTab, GammeTab, CercleTab, ProfilTab, Notifications, MesCommandes } from './Tabs';
import { MaFormuleTab } from './MaFormule';

/* Ma Couronne — l'app cliente de la Maison MND.
   Une vraie app web : plein écran sur mobile (100dvh, safe-areas) ;
   sur bureau, navigation verticale à gauche et contenu centré large. */

type TabId = 'accueil' | 'suivi' | 'formule' | 'gamme' | 'cercle' | 'profil';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'accueil', label: 'Accueil', glyph: '♛' },
  { id: 'suivi', label: 'Suivi', glyph: '◷' },
  /* MA FORMULE — 28 aout. Entre le Suivi et la Gamme : c'est l'ecran ou
     elle verifie ce qu'il lui reste, juste apres son parcours. */
  { id: 'formule', label: 'Ma formule', glyph: '◈' },
  { id: 'gamme', label: 'Gamme', glyph: '⬡' },
  { id: 'cercle', label: 'Cercle', glyph: '✦' },
  { id: 'profil', label: 'Profil', glyph: '◈' },
];

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
  /* LE SÉLECTEUR DE TÊTE (maquette du 9 août, écran 1). Le compte reste celui
     du parent — le sélecteur ne change pas de session, il change la tête que
     l'application REGARDE. Sans enfant rattaché au compte famille, la ligne
     ne paraît pas du tout ; « Vous » est toujours en premier. */
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
     fiche. Voir `useModuleFerme`. Quand on regarde un ENFANT, les onglets qui
     n'ont pas de sens pour un mineur se ferment : ni Gamme ni Cercle à son nom
     (maquette du 9 août — c'est le compte du parent qui commande et cumule). */
  const ferme = useModuleFerme();
  const visibleTabs = TABS.filter((t) =>
    (t.id === 'accueil' || t.id === 'profil' || !ferme(t.id as 'suivi' | 'gamme' | 'cercle'))
    && !(enfant && (t.id === 'gamme' || t.id === 'cercle')));
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab('accueil');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.hiddenModules?.join('|'), tete]);

  /* Suivi de présence : une session par visite, temps cumulé écrit pour le Trône. */
  useActivityTracker(tab);

  const [booking, setBooking] = useState<{ prefill?: BookingPrefill } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [rdvOpen, setRdvOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  /* Garde GLOBALE : réservation coupée pour cette cliente → aucun chemin
     (bouton, offre, re-réservation) n'ouvre le tunnel — un mot honnête à la place. */
  const openBooking = useCallback((prefill?: BookingPrefill) => {
    if (ferme('reserver')) {
      toast('Les réservations en ligne sont fermées pour votre compte, contactez la maison.');
      return;
    }
    setNotifOpen(false);
    setRdvOpen(false);
    setBooking({ prefill });
  }, [ferme, toast]);

  const openCompose = useCallback(() => {
    if (ferme('compose')) {
      toast('Le rituel sur-mesure est fermé pour votre compte, contactez la maison.');
      return;
    }
    setComposeOpen(true);
  }, [ferme, toast]);

  const openRdv = useCallback(() => {
    setNotifOpen(false);
    setOrdersOpen(false);
    setRdvOpen(true);
  }, []);

  const openOrders = useCallback(() => {
    setNotifOpen(false);
    setRdvOpen(false);
    setOrdersOpen(true);
  }, []);

  return (
    <>
      <div className="mc-scroll mc-appbody">
        {/* UNE SEULE LIGNE S'AJOUTE EN HAUT DE L'ACCUEIL (écran 1) : les têtes
            du compte. Tout le reste de l'application est déjà là. */}
        {tab === 'accueil' && tetes.length > 0 && (
          <div className="mc-pourqui" style={{ padding: '14px 18px 0' }}>
            <button
              type="button"
              className={`mc-pourqui__chip ${!tete ? 'is-on' : ''}`}
              onClick={() => setTete('')}
            >
              Vous
            </button>
            {tetes.map((t) => {
              const a = ageDe(t.birthday, todayIso());
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`mc-pourqui__chip ${tete === t.id ? 'is-on' : ''}`}
                  onClick={() => setTete(t.id)}
                >
                  {t.name.split(' ')[0]}{a !== undefined ? ` · ${a} ans` : ''}
                </button>
              );
            })}
          </div>
        )}
        {tab === 'accueil' && (enfant ? (
          <HomeEnfant enfant={enfant} onOpenBooking={openBooking} onRevenir={() => setTete('')} />
        ) : (
          <HomeTab
            onOpenBooking={openBooking}
            onOpenCompose={openCompose}
            onOpenNotif={() => setNotifOpen(true)}
            onOpenRdv={openRdv}
            goGamme={() => setTab('gamme')}
            toast={toast}
          />
        ))}
        {tab === 'suivi' && <SuiviTab regard={enfant} onOpenBooking={openBooking} onOpenRdv={openRdv} onOpenOrders={openOrders} goGamme={() => setTab('gamme')} />}
        {tab === 'formule' && <MaFormuleTab toast={toast} onReserver={() => setBooking({})} />}
        {tab === 'gamme' && <GammeTab toast={toast} onOpenOrders={openOrders} />}
        {tab === 'cercle' && <CercleTab toast={toast} />}
        {tab === 'profil' && <ProfilTab toast={toast} />}
      </div>

      <nav className="mc-tabbar">
        <img className="mc-nav__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={`mc-tab ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="mc-tab__glyph">{t.glyph}</span>
            <span className="mc-tab__label">{t.label}</span>
          </button>
        ))}
        <button className="mc-nav__signout" onClick={() => void signOut()}>Se déconnecter</button>
      </nav>

      {booking && (
        <Booking
          prefill={booking.prefill}
          onClose={() => setBooking(null)}
          toast={toast}
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
      {notifOpen && <Notifications onClose={() => setNotifOpen(false)} />}
      {rdvOpen && (
        <MesRendezVous
          onClose={() => setRdvOpen(false)}
          onBook={() => openBooking()}
          toast={toast}
        />
      )}
      {ordersOpen && <MesCommandes onClose={() => setOrdersOpen(false)} />}

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
            <h1 className="mc-closed__t">La maison est fermée.</h1>
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
            <h1 className="mc-closed__t">Ce compte tient le Trône.</h1>
            <p className="mc-closed__s">
              Ma Couronne est la porte des clientes, le compte de la maison, lui, ouvre le
              Trône. Pour essayer Ma Couronne, utilisez un compte de test qui n’est pas au
              personnel.
            </p>
            <a className="mc-cta mc-cta--copper" style={{ marginTop: 18, display: 'inline-block', textDecoration: 'none' }} href={lienTrone}>
              Ouvrir le Trône
            </a>
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={() => void signOut()}>
              Se déconnecter
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
            <h1 className="mc-closed__t">Cette adresse a déjà son espace.</h1>
            <p className="mc-closed__s">
              Votre couronne, vos enfants et vos rendez-vous sont bien là. Ils sont attachés à
              l’autre porte de cette même adresse. Reprenez par celle-là, tout vous attend
              derrière. Un doute ? Écrivez à la maison, on vous ouvre.
            </p>
            {/* DEUX PORTES, PAS UNE CONSIGNE. L'écran disait « reconnectez-vous
                par la porte utilisée la première fois » sans dire LAQUELLE, et
                sans rien à toucher : la cliente restait dehors avec un conseil.
                Les deux portes sont ici, elle en pousse une. */}
            <button className="mc-cta" style={{ marginTop: 18 }} onClick={() => void signInWithGoogle()}>
              Continuer avec Google
            </button>
            {/* LE MOT DIT LES DEUX CHOSES : ce bouton DÉCONNECTE, puis rouvre
                la porte ordinaire. « Entrer par e-mail » seul laissait croire
                qu'on restait connecté, et personne n'osait le toucher. */}
            <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={() => void signOut()}>
              Se déconnecter et entrer autrement
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
