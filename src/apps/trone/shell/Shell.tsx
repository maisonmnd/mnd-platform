import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, Gem, LogOut, Menu, X } from 'lucide-react';
import { NAV } from '../routes/index';
import NotificationsBell from './Notifications';
import { useReconcileClients } from './useReconcileClients';
import { useBranch } from '../../../shared/branches';
import { Seal, Button } from '../../../ds/components';
import { useAuth, useStaff, signOut } from '../../../shared/auth';
import { subscribeSync, getSyncState } from '../../../shared/sync';
import { useClients, clientsStore } from '../../../shared/clients';
import { pointsHistoryStore } from '../../../shared/offers';
import { houseSettingsStore } from '../routes/equipe/data';

/* Pastille de synchronisation — l'angle mort du comptoir : sans elle, un échec
   de poussée restait en console et une facture pouvait n'exister que sur ce
   poste sans que personne ne le sache. Un mot, une couleur, la vérité. */
function SyncDot() {
  const s = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  if (!s.enabled) return null;
  const mode = !s.online ? 'off' : s.failed > 0 ? 'err' : s.pending > 0 ? 'wait' : 'ok';
  const label = mode === 'off' ? 'Hors ligne' : mode === 'err' ? 'Synchro en échec' : mode === 'wait' ? 'Synchronisation…' : 'Synchronisé';
  const color = mode === 'ok' ? '#6e7c5c' : mode === 'wait' ? 'var(--color-copper)' : '#8f3b30';
  const title =
    mode === 'off' ? 'Hors ligne — les écritures restent sur ce poste et partiront au retour du réseau.'
    : mode === 'err' ? 'Des écritures n’ont pas pu être poussées au serveur — vérifiez la connexion, puis refaites une modification pour relancer.'
    : mode === 'wait' ? 'Écritures locales en cours d’envoi.'
    : 'Toutes les écritures sont sur le serveur.';
  return (
    <span className="tr-top__sync" title={title} role="status">
      <span className="tr-top__sync-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

const fmtDate = (d: Date) =>
  d
    .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();

export default function Shell() {
  const { branch, branches, setBranch, currency } = useBranch();
  const { session } = useAuth();
  const staff = useStaff();
  const navigate = useNavigate();
  const [allClients] = useClients();

  /* Remise à zéro PONCTUELLE des points Cercle (décision maison, juil. 2026) :
     compteurs à 0 + historique vidé, UNE fois — marqueur synchronisé pour ne
     jamais rejouer. On attend l'hydratation (liste non vide) avant de poser le
     marqueur, sinon un passage à vide « consommerait » la remise à zéro.
     L'attribution reste coupée tant que Cercle MND ne l'active pas. */
  useEffect(() => {
    if (houseSettingsStore.get()['points_reset_2026_07']) return;
    const list = clientsStore.get();
    if (list.length === 0) return; // pas encore hydraté — on repassera
    if (list.some((c) => (c.loyaltyPoints ?? 0) > 0)) {
      clientsStore.set((prev) => prev.map((c) => ((c.loyaltyPoints ?? 0) > 0 ? { ...c, loyaltyPoints: 0 } : c)));
    }
    if (pointsHistoryStore.get().length > 0) pointsHistoryStore.set(() => []);
    houseSettingsStore.set((prev) => ({ ...prev, points_reset_2026_07: true }));
  }, [allClients]);
  /* Toute réservation/facture Ma Couronne orpheline devient une vraie fiche cliente. */
  useReconcileClients();
  const today = new Date();
  const [sideOpen, setSideOpen] = useState(false);
  const closeSide = () => setSideOpen(false);

  return (
    <div className={`tr-shell ${sideOpen ? 'is-side-open' : ''}`}>
      {sideOpen && <div className="tr-side-veil" onClick={closeSide} />}
      <aside className="tr-side">
        <div className="tr-side__brand">
          <Seal color="or" size={34} />
          <div>
            <h1 className="mnd-serif">Maison MND</h1>
            <div className="tr-side__powered">Propulsé par LOKAA</div>
          </div>
          <button className="tr-side__close" onClick={closeSide} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>

        <div className="tr-branch" title="Changer de branche">
          <div className="tr-branch__label">
            <Gem size={10} /> Branche · {currency}
          </div>
          <div className="tr-branch__name">
            {branch.name} <ChevronDown size={12} style={{ verticalAlign: -2, opacity: 0.6 }} />
          </div>
          <select value={branch.id} onChange={(e) => setBranch(e.target.value)} aria-label="Branche">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.currency}
              </option>
            ))}
          </select>
        </div>

        <nav className="tr-nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="tr-nav__group">{g.group}</div>
              {g.items.map((it) => (
                <NavLink key={it.path} to={it.path} end={it.path === '/'} className="tr-nav__item" onClick={closeSide}>
                  <it.icon />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="tr-main">
        <header className="tr-top">
          <button className="tr-burger" onClick={() => setSideOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <div className="tr-top__trail">
            Le Trône · {branch.city} · {fmtDate(today)}
          </div>
          <SyncDot />
          <div className="tr-top__chip">
            {currency} · <span className="mnd-copper">{branch.country}</span>
          </div>
          <NotificationsBell />
          <Button onClick={() => navigate('/caisse')}>+ Encaisser</Button>
          {session && (
            <button
              className="tr-top__bell"
              aria-label="Se déconnecter"
              title={`${staff?.name ?? 'Personnel'} — se déconnecter`}
              onClick={() => void signOut()}
            >
              <LogOut size={15} />
            </button>
          )}
        </header>

        <main className="tr-content">
          <div className="tr-content__inner">
            <Suspense fallback={<div className="mnd-muted" style={{ padding: 48 }}>…</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
