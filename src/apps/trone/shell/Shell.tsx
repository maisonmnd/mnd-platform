import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Gem, LogOut, Menu, X } from 'lucide-react';
import { NAV, peutVoir, accueilDe, type TroneRoute } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { createStore, useStore } from '../../../shared/store';
import NotificationsBell from './Notifications';
import Trouver from './Trouver';
import BarreEquipe from './BarreEquipe';

/* LE MENU À DEUX ÉTAGES (chantier ③). Le QUOTIDIEN — les gestes du comptoir —
   reste toujours déplié ; le reste se replie, et s'en souvient PAR POSTE
   (jamais synchronisé : l'habitude d'un écran n'est pas une donnée de la
   Maison).

   LE CARNET ET LE CATALOGUE Y ENTRENT le 16 août (demande de Yéman). Le
   Carnet vivait sous « Clients & agenda », replié, alors qu'on l'ouvre autant
   que le Calendrier — c'est là qu'on lit la journée qui vient et qu'on
   encaisse au passage. Le Catalogue vivait sous « Vente » : c'est pourtant la
   carte de la Maison, ouverte à chaque prix qu'on vérifie et à chaque
   prestation qu'on retouche. */
/* Le Fil et le Tableau APRÈS le Catalogue — l'ordre du comptoir d'abord,
   le registre interne ensuite (Yéman, 18 août). */
const QUOTIDIEN = ['/', '/calendrier', '/carnet', '/caisse', '/customers', '/factures', '/catalogue', '/fil', '/tableau'];
const menuDeplieStore = createStore<Record<string, boolean>>('mnd_trone_menu_deplie', {});
import { useReconcileClients } from './useReconcileClients';
import { usePersonaVivant } from './usePersonaVivant';
import { usePassageVivant } from './usePassageVivant';
import { useBranch } from '../../../shared/branches';
import { useHouseIdentity, fuseauIana } from '../../../shared/identite';
import { Seal, Button, toast } from '../../../ds/components';
import { useAuth, useStaff, signOut } from '../../../shared/auth';
import { useFil, mesDemandes } from '../../../shared/fil';
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
  /* EN ÉCHEC, ON NOMME — ET ON DIT POURQUOI. Nommer les tables (6 août) a évité
     d'ouvrir la console pour savoir LESQUELLES ; le 9 août il a fallu la rouvrir
     pour savoir POURQUOI. Or la cause change tout : une migration jamais collée
     se répare en trente secondes, un réseau coupé s'attend. Les causes se
     regroupent — trois tables absentes font une phrase, pas trois.
     `supabase/audit_synchro.sql` confirme en base ce que cette phrase avance. */
  const parRaison = new Map<string, string[]>();
  for (const f of s.failedWhy) {
    const l = parRaison.get(f.raison);
    if (l) l.push(f.table);
    else parRaison.set(f.raison, [f.table]);
  }
  const causes = [...parRaison.entries()].map(([raison, tables]) => `${tables.join(', ')} — ${raison}`);
  const premiere = [...parRaison.entries()][0];
  const label = mode === 'off' ? 'Hors ligne'
    : mode === 'err'
      ? (premiere
          ? `Synchro en échec · ${premiere[1].length > 2 ? `${premiere[1].length} tables` : premiere[1].join(', ')} — ${premiere[0]}`
          : 'Synchro en échec')
    : mode === 'wait' ? 'Synchronisation…' : 'Synchronisé';
  const color = mode === 'ok' ? '#6e7c5c' : mode === 'wait' ? 'var(--color-copper)' : '#8f3b30';
  const title =
    mode === 'off' ? 'Hors ligne — les écritures restent sur ce poste et partiront au retour du réseau.'
    : mode === 'err'
      ? `Refusé par le serveur :\n${causes.join('\n') || '—'}\n\nUn refus de DROIT n'allume pas cette pastille : ce qui s'affiche ici est une vraie panne. Refaites une modification pour relancer.`
    : mode === 'wait' ? 'Écritures locales en cours d’envoi.'
    : 'Toutes les écritures sont sur le serveur.';
  return (
    <span className="tr-top__sync" title={title} role="status">
      <span className="tr-top__sync-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

/* LA DATE DU SALON, PAS CELLE DU TÉLÉPHONE. Le fuseau des Paramètres entre
   ici : la Souveraine en voyage voit le jour du salon en haut du Trône. */
const fmtDate = (d: Date, timeZone: string) =>
  d
    .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone })
    .toUpperCase();

export default function Shell() {
  const { branch, branches, setBranch, currency } = useBranch();
  /* L'identité signe la barre latérale et règle l'horloge (Paramètres). */
  const [identite] = useHouseIdentity();
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
  /* L'archétype de chaque cliente se relit à chaque mouvement du carnet — sauf
     s'il a été figé à la main. Voir shared/persona.ts pour la pesée. */
  usePersonaVivant();
  /* Une cliente de passage cesse de l'être dès sa 2ᵉ venue — le seul geste de ce
     hook est de RETIRER la marque, jamais d'en poser une. */
  usePassageVivant();
  const today = new Date();
  const [sideOpen, setSideOpen] = useState(false);
  const closeSide = () => setSideOpen(false);

  /* Le menu à deux étages ne s'impose que s'il fait gagner quelque chose :
     un menu déjà court (un maître, deux écrans) se rend à plat. Le groupe de
     l'écran OUVERT se déplie de lui-même — arriver par Trouver ne doit pas
     cacher où l'on est. */
  const [deplies, setDeplies] = useStore(menuDeplieStore);
  const visibles = NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.horsMenu && peutVoir(role, it.path, mesDomaines)) }))
    .filter((g) => g.items.length > 0);
  const deuxEtages = visibles.reduce((s, g) => s + g.items.length, 0) > 8;
  const quotidien = QUOTIDIEN
    .map((p) => visibles.flatMap((g) => g.items).find((it) => it.path === p))
    .filter((it): it is TroneRoute => !!it);
  const [filTous] = useFil();
  const [factures] = useInvoices();
  const monMailShell = (session?.user?.email ?? '').trim().toLowerCase();
  const replies = visibles
    .map((g) => ({ ...g, items: g.items.filter((it) => !QUOTIDIEN.includes(it.path)) }))
    .filter((g) => g.items.length > 0);
  /* ── UNE DEMANDE QUI ATTEND SE VOIT DEPUIS PARTOUT — 18 août 2026.
     « Comment savoir si j'ai une nouvelle demande à traiter dans les fils ? »
     (Yéman). Elle ne se voyait qu'UNE FOIS DANS LE FIL — c'est-à-dire jamais,
     puisqu'il faut déjà y être. La pastille vit donc dans le menu, à côté du
     Fil : on la croise en allant ailleurs, et c'est là qu'elle sert. */
  const demandesQuiAttendent = mesDemandes(filTous, branch.id, monMailShell, factures).length;
  const lien = (it: TroneRoute) => (
    <NavLink key={it.path} to={it.path} end={it.path === '/'} className="tr-nav__item" onClick={closeSide}>
      <it.icon />
      {it.label}
      {it.path === '/fil' && demandesQuiAttendent > 0 && (
        <span className="tr-nav__pastille" title={`${demandesQuiAttendent} demande(s) à traiter`}>
          {demandesQuiAttendent}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className={`tr-shell ${sideOpen ? 'is-side-open' : ''} ${staff?.role === 'maitre' ? 'tr-shell--barre' : ''}`}>
      {sideOpen && <div className="tr-side-veil" onClick={closeSide} />}
      <aside className="tr-side">
        <div className="tr-side__brand">
          <Seal color="or" size={34} />
          <div>
            <h1 className="mnd-serif">{identite.nom.trim() || 'Maison MND'}</h1>
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
          {!deuxEtages ? (
            visibles.map((g) => (
              <div key={g.group}>
                <div className="tr-nav__group">{g.group}</div>
                {g.items.map(lien)}
              </div>
            ))
          ) : (
            <>
              <div>
                <div className="tr-nav__group">Le quotidien</div>
                {quotidien.map(lien)}
              </div>
              {replies.map((g) => {
                const ouvert = deplies[g.group] === true || g.items.some((it) => emplacement.pathname === it.path);
                return (
                  <div key={g.group}>
                    <button
                      className="tr-nav__fold"
                      aria-expanded={ouvert}
                      onClick={() => setDeplies((prev) => ({ ...prev, [g.group]: !(prev[g.group] === true) }))}
                    >
                      <span>{g.group}</span>
                      <ChevronDown size={13} className={`tr-nav__chev ${ouvert ? 'is-open' : ''}`} />
                    </button>
                    {ouvert && g.items.map(lien)}
                  </div>
                );
              })}
            </>
          )}
        </nav>
      </aside>

      <div className="tr-main">
        <header className="tr-top">
          <button className="tr-burger" onClick={() => setSideOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={20} />
          </button>
          <div className="tr-top__trail">
            Le Trône · {branch.city} · {fmtDate(today, fuseauIana(identite.fuseau))}
          </div>
          {/* Trouver — la recherche globale (Ctrl K), chantier ② de la refonte. */}
          <Trouver />
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

      {/* La barre de gestes de l'équipe — téléphone seulement, rôle maître seulement. */}
      <BarreEquipe />
    </div>
  );
}
