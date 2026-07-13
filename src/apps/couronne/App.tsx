import { useCallback, useRef, useState } from 'react';
import { useStore } from '../../shared/store';
import { sessionStore, type BookingPrefill } from './lib';
import Onboarding from './Onboarding';
import Booking from './Booking';
import Compose from './Compose';
import { HomeTab, SuiviTab, GammeTab, CercleTab, ProfilTab, Notifications } from './Tabs';

/* Ma Couronne — l'app cliente de la Maison MND.
   Sur desktop : un téléphone 390×844 posé sur un fond sable.
   Sous 480 px : l'app remplit l'écran. */

type TabId = 'accueil' | 'suivi' | 'gamme' | 'cercle' | 'profil';

const TABS: { id: TabId; label: string; glyph: string }[] = [
  { id: 'accueil', label: 'Accueil', glyph: '♛' },
  { id: 'suivi', label: 'Suivi', glyph: '◷' },
  { id: 'gamme', label: 'Gamme', glyph: '⬡' },
  { id: 'cercle', label: 'Cercle', glyph: '✦' },
  { id: 'profil', label: 'Profil', glyph: '◈' },
];

function Shell() {
  const [tab, setTab] = useState<TabId>('accueil');
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
  const [session] = useStore(sessionStore);

  return (
    <div className="mc-stage">
      <header className="mc-stage__head">
        <div className="mc-stage__eyebrow">Espace client · Ma Couronne</div>
        <div className="mc-stage__line">mi nyɔ́ ɖɛkpɛ — le héros, c’est vous. MND vous guide.</div>
      </header>

      <div className="mc-phone">
        <div className="mc-statusbar">
          <span>9:41</span>
          <span className="mc-statusbar__notch" aria-hidden="true" />
          <span className="mc-statusbar__right">
            ▆ ▼ <span className="mc-statusbar__batt">82</span>
          </span>
        </div>
        <div className="mc-screen">{session ? <Shell /> : <Onboarding />}</div>
      </div>

      <div className="mc-stage__foot">Maison MND · Cotonou — réservation, suivi, gamme, cercle et rituel sur-mesure.</div>
    </div>
  );
}
