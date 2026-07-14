import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { useAuth, requireAuth, signOut } from '../../shared/auth';
import { useEnsureClient, useActivityTracker, useClientId, type BookingPrefill } from './lib';
import { registerSW, ensurePush } from '../../shared/push';
import Onboarding from './Onboarding';
import Booking from './Booking';
import Compose from './Compose';
import MesRendezVous from './MesRendezVous';
import { HomeTab, SuiviTab, GammeTab, CercleTab, ProfilTab, Notifications, MesCommandes } from './Tabs';

/* Ma Couronne — l'app cliente de la Maison MND.
   Une vraie app web : plein écran sur mobile (100dvh, safe-areas) ;
   sur bureau, navigation verticale à gauche et contenu centré large. */

type TabId = 'accueil' | 'suivi' | 'gamme' | 'cercle' | 'profil';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'accueil', label: 'Accueil', glyph: '♛' },
  { id: 'suivi', label: 'Suivi', glyph: '◷' },
  { id: 'gamme', label: 'Gamme', glyph: '⬡' },
  { id: 'cercle', label: 'Cercle', glyph: '✦' },
  { id: 'profil', label: 'Profil', glyph: '◈' },
];

function Shell() {
  /* Le dossier de la cliente est garanti dès l'entrée dans l'app. */
  useEnsureClient();
  const clientId = useClientId();

  /* Web Push : on enregistre le service worker au chargement, et on ré-abonne
     silencieusement si la cliente a déjà accordé la permission (nouvel appareil,
     abonnement expiré). La 1re demande de permission se fait à la réservation. */
  useEffect(() => {
    void registerSW();
    if (clientId && clientId !== 'c-local') void ensurePush(clientId);
  }, [clientId]);

  const [tab, setTab] = useState<TabId>('accueil');

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

  const openBooking = useCallback((prefill?: BookingPrefill) => {
    setNotifOpen(false);
    setRdvOpen(false);
    setBooking({ prefill });
  }, []);

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
        {tab === 'accueil' && (
          <HomeTab
            onOpenBooking={openBooking}
            onOpenCompose={() => setComposeOpen(true)}
            onOpenNotif={() => setNotifOpen(true)}
            onOpenRdv={openRdv}
            goGamme={() => setTab('gamme')}
            toast={toast}
          />
        )}
        {tab === 'suivi' && <SuiviTab onOpenBooking={openBooking} onOpenRdv={openRdv} onOpenOrders={openOrders} />}
        {tab === 'gamme' && <GammeTab toast={toast} onOpenOrders={openOrders} />}
        {tab === 'cercle' && <CercleTab toast={toast} />}
        {tab === 'profil' && <ProfilTab toast={toast} />}
      </div>

      <nav className="mc-tabbar">
        <img className="mc-nav__seal" src={asset('/assets/monograms/mono-copper.png')} alt="" />
        {TABS.map((t) => (
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
      {composeOpen && <Compose onClose={() => setComposeOpen(false)} toast={toast} />}
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

  return (
    <div className={`mc-app mc-app--${authed ? 'shell' : 'auth'}`}>
      <div className="mc-viewport">{authed ? <Shell /> : <Onboarding />}</div>
    </div>
  );
}
