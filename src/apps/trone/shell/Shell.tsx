import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Gem, LogOut, Menu, X } from 'lucide-react';
import { NAV, peutVoir, accueilDe } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { useStore } from '../../../shared/store';
import NotificationsBell from './Notifications';
import { useReconcileClients } from './useReconcileClients';
import { useBranch } from '../../../shared/branches';
import { Seal, Button, toast } from '../../../ds/components';
import { useAuth, useStaff, signOut } from '../../../shared/auth';
import { subscribeSync, getSyncState } from '../../../shared/sync';
import { useClients, clientsStore } from '../../../shared/clients';
import { useAppointments, appointmentsStore } from '../../../shared/agenda';
import { useInvoices, invoicesStore } from '../../../shared/finance';
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
  const role = staff?.role;
  /* Les domaines ouverts EN PLUS a cette personne. Clef : son identifiant de
     compte — le seul qui ne change pas quand un nom se corrige. */
  const acces = useStore(staffAccessStore)[0];
  const mesDomaines = acces[staff?.user_id ?? ''] ?? {};
  const navigate = useNavigate();
  const emplacement = useLocation();
  const [allClients] = useClients();

  /* CACHER UN LIEN NE SUFFIT PAS. Une adresse tapée à la main, un favori posé
     un jour où l'accès était ouvert, un lien reçu d'un collègue : la barre ne
     protège rien. On renvoie donc vers l'écran d'accueil du rôle dès que la
     route demandée ne lui est pas ouverte.

     Ce n'est toujours qu'une garde D'ÉCRAN — la vraie barrière est côté
     serveur, dans les politiques RLS de Supabase. Un maître déterminé lit la
     base par l'API, quoi qu'affiche Le Trône. */
  useEffect(() => {
    if (!role) return;
    if (peutVoir(role, emplacement.pathname, mesDomaines)) return;
    navigate(accueilDe(role), { replace: true });
  }, [role, emplacement.pathname, navigate, mesDomaines]);

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

  const [allAppts] = useAppointments();

  /* Réajustement PONCTUEL des rituels déjà SOLDÉS sans prix d'origine : on fige
     leur prix sur ce qui a RÉELLEMENT été encaissé (règlements + acompte
     vérifié), remises effacées (déjà reflétées dans l'encaissé) — sinon ces
     rituels se relisaient au catalogue du jour et l'histoire dérivait à chaque
     changement de tarif. Une fois, marqueur synchronisé, après hydratation. */
  useEffect(() => {
    if (houseSettingsStore.get()['bills_refreeze_2026_07']) return;
    const list = appointmentsStore.get();
    if (list.length === 0) return; // pas encore hydraté — on repassera
    const needs = (a: (typeof list)[number]) =>
      a.priceXof == null
      && a.status === 'honoré'
      && !(a.seriesIndex && a.seriesIndex > 1)
      && ((a.paidXof ?? 0) + (a.depositConfirmed ? a.depositXof ?? 0 : 0)) > 0;
    if (list.some(needs)) {
      appointmentsStore.set((prev) => prev.map((a) => {
        if (!needs(a)) return a;
        const charged = (a.paidXof ?? 0) + (a.depositConfirmed ? a.depositXof ?? 0 : 0);
        return { ...a, priceXof: charged, discountPct: undefined, discountXof: undefined };
      }));
    }
    houseSettingsStore.set((prev) => ({ ...prev, bills_refreeze_2026_07: true }));
  }, [allAppts]);

  const [allInvoices] = useInvoices();
  /* Correction PONCTUELLE (28 juil. 2026) : (1) un RDV À VENIR ne peut pas être
     « honoré » (quirk de l'ancien import) → remis en « confirmé » ; (2) une facture
     ne doit exister QUE si le RDV est TERMINÉ (payé, ou honoré et déjà passé) → on
     retire les factures prématurées des RDV non terminés, en libérant leur invoiceId.
     Une fois, marqueur synchronisé, après hydratation (RDV + factures) — sinon un
     passage à vide « consommerait » la correction. */
  useEffect(() => {
    if (houseSettingsStore.get()['fix_future_rdv_invoices_2026_07']) return;
    const appts = appointmentsStore.get();
    const invs = invoicesStore.get();
    if (appts.length === 0 || invs.length === 0) return; // pas encore hydraté — on repassera
    const today = new Date().toISOString().slice(0, 10);
    // 1. RDV à venir marqués « honoré » → « confirmé »
    if (appts.some((a) => a.status === 'honoré' && a.date > today)) {
      appointmentsStore.set((prev) => prev.map((a) =>
        (a.status === 'honoré' && a.date > today ? { ...a, status: 'confirmé' } : a)));
    }
    // 2. Factures prématurées (RDV non terminé, non payées) → retirées + invoiceId libéré
    const cur = appointmentsStore.get();
    const invById = new Map(invs.map((i) => [i.id, i] as const));
    const drop = new Set<string>();
    const freed = new Set<string>();
    for (const a of cur) {
      if (!a.invoiceId) continue;
      const inv = invById.get(a.invoiceId);
      if (!inv) continue;
      const keep = inv.status === 'payée' || (a.status === 'honoré' && a.date <= today);
      if (!keep) { drop.add(a.invoiceId); freed.add(a.id); }
    }
    if (drop.size > 0) {
      invoicesStore.set((prev) => prev.filter((i) => !drop.has(i.id)));
      appointmentsStore.set((prev) => prev.map((a) => (freed.has(a.id) ? { ...a, invoiceId: undefined } : a)));
    }
    houseSettingsStore.set((prev) => ({ ...prev, fix_future_rdv_invoices_2026_07: true }));
  }, [allAppts, allInvoices]);

  /* SAUVETAGE du 23 juil. 2026 — RETIRÉ le 30 juil. 2026.
     Il re-créait les prestations depuis une photographie du 21 juillet, à chaque
     montage du Shell. Sa mission (rendre aux rendez-vous leurs libellés après un
     effacement accidentel) était accomplie depuis une semaine ; il ne restait
     qu'un mécanisme qui REMPLIT le catalogue sans qu'on le lui demande.
     Le 30 juillet, après une remise à zéro complète, il a rétabli 94 prestations
     avec `ensureStarterServices` — la Maison ne pouvait plus avoir un catalogue
     vide. `ensureRescuedServices()` existe toujours dans rescueServices.ts, mais
     PLUS RIEN NE L'APPELLE : c'est désormais un geste, pas un réflexe. */

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
          {/* CHAQUE ROLE NE VOIT QUE CE QU'IL OUVRE. Un groupe dont tous les
              ecrans sont fermes disparait avec eux : un titre seul ne dit rien
              d'autre que ce qu'on ne peut pas atteindre. */}
          {NAV.map((g) => ({ ...g, items: g.items.filter((it) => peutVoir(role, it.path, mesDomaines)) }))
            .filter((g) => g.items.length > 0)
            .map((g) => (
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
