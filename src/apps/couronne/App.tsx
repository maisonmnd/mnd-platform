import { useCallback, useRef, useState } from 'react';
import { asset } from '../../shared/asset';
import { useAuth, requireAuth, signOut } from '../../shared/auth';
import { useEnsureClient, useActivityTracker, type BookingPrefill } from './lib';
import Onboarding from './Onboarding';
import Booking from './Booking';
import Compose from './Compose';
import { HomeTab, SuiviTab, GammeTab, CercleTab, ProfilTab, Notifications } from './Tabs';

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

  const [tab, setTab] = useState<TabId>('accueil');

  /* Suivi de présence : une session par visite, temps cumulé écrit pour le Trône. */
  useActivityTracker(tab);

  const [booking, setBooking] = useState<{ prefill?: BookingPrefill } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const openBooking = useCallback((prefill?: BookingPrefill) => {
    setNotifOpen(false);
    setBooking({ prefill });
  }, []);

  return (
    <>
      <div className="mc-scroll mc-appbody">
        {tab === 'accueil' && (
          <HomeTab
            onOpenBooking={openBooking}
            onOpenCompose={() => setComposeOpen(true)}
            onOpenNotif={() => setNotifOpen(true)}
            goGamme={() => setTab('gamme')}
            toast={toast}
          />
        )}
        {tab === 'suivi' && <SuiviTab onOpenBooking={openBooking} />}
        {tab === 'gamme' && <GammeTab toast={toast} />}
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
