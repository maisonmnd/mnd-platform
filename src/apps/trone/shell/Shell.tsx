import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Gem, LogOut } from 'lucide-react';
import { NAV } from '../routes/index';
import { useBranch } from '../../../shared/branches';
import { Seal, Button } from '../../../ds/components';
import { useAuth, useStaff, signOut } from '../../../shared/auth';

const fmtDate = (d: Date) =>
  d
    .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase();

export default function Shell() {
  const { branch, branches, setBranch, currency } = useBranch();
  const { session } = useAuth();
  const staff = useStaff();
  const navigate = useNavigate();
  const today = new Date();

  return (
    <div className="tr-shell">
      <aside className="tr-side">
        <div className="tr-side__brand">
          <Seal color="or" size={34} />
          <div>
            <h1 className="mnd-serif">Maison MND</h1>
            <div className="tr-side__powered">Propulsé par LOKAA</div>
          </div>
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
                <NavLink key={it.path} to={it.path} end={it.path === '/'} className="tr-nav__item">
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
          <div className="tr-top__trail">
            Le Trône · {branch.city} · {fmtDate(today)}
          </div>
          <div className="tr-top__chip">
            {currency} · <span className="mnd-copper">{branch.country}</span>
          </div>
          <button className="tr-top__bell" aria-label="Notifications">
            <Bell size={15} />
            <span className="tr-top__bell-count">4</span>
          </button>
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
