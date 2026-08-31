import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Gem, LogOut, Menu, X } from 'lucide-react';
import { NAV, peutVoir, accueilDe, premierEcranVisible, type TroneRoute } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { createStore, useStore } from '../../../shared/store';
import NotificationsBell from './Notifications';
import Trouver from './Trouver';
import BarreEquipe from './BarreEquipe';
import { AppelRecuModal } from './AppelRecuModal';
import { useAppels, appelsAActer, marquerAppelFait } from '../../../shared/appels';
import { RdvModal } from '../routes/clients/_shared';

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
   le registre interne ensuite (Yéman, 18 août).

   LA CAISSE POS EN REDESCEND le 25 août : on encaisse depuis « + Encaisser »,
   qui est déjà dans l'en-tête, et depuis le Carnet — la ligne du menu faisait
   double emploi. Elle retrouve sa place sous « Vente ». */
const QUOTIDIEN = ['/', '/calendrier', '/carnet', '/customers', '/factures', '/catalogue', '/fil', '/tableau'];
const menuDeplieStore = createStore<Record<string, boolean>>('mnd_trone_menu_deplie', {});

/* ── LA MAIN RANGE SON MENU — 22 août 2026 ──────────────────────────
   « Me permettre de déplacer moi-même ce que je veux dans le quotidien de la
   navigation bar. Monter et descendre les onglets. »

   L'ordre du menu était écrit dans le code, le même pour tout le monde. Or
   il n'y a pas UN bon ordre : Yéman ouvre le Carnet dix fois par jour, Gérard
   pointe et s'en va. L'ordre est donc une habitude, pas une donnée de la
   Maison — il vit PAR POSTE, comme le repli des groupes, et ne se synchronise
   jamais.

   La clé est le nom du groupe (« Le quotidien », « Pilotage »…) ; la valeur,
   les chemins dans l'ordre voulu. */
const navOrdreStore = createStore<Record<string, string[]>>('mnd_trone_nav_ordre', {});

/** L'ORDRE DE LA MAIN, PUIS CELUI DU CODE. Ce qui a été rangé passe d'abord,
    dans l'ordre voulu ; ce qui n'y figure pas — un écran arrivé depuis, un
    écran qu'un rôle vient d'ouvrir — suit à la fin, à sa place d'origine.
    Ainsi un écran neuf ne disparaît JAMAIS parce qu'un rangement d'hier ne le
    connaissait pas. */
const selonLaMain = <T extends { path: string }>(voulu: string[] | undefined, items: T[]): T[] => {
  if (!voulu || voulu.length === 0) return items;
  const rang = new Map(voulu.map((p, i) => [p, i]));
  const connus = items.filter((it) => rang.has(it.path)).sort((a, b) => rang.get(a.path)! - rang.get(b.path)!);
  const nouveaux = items.filter((it) => !rang.has(it.path));
  return [...connus, ...nouveaux];
};
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
  const causes = [...parRaison.entries()].map(([raison, tables]) => `${tables.join(', ')}, ${raison}`);
  const premiere = [...parRaison.entries()][0];
  const label = mode === 'off' ? 'Hors ligne'
    : mode === 'err'
      ? (premiere
          ? `Synchro en échec · ${premiere[1].length > 2 ? `${premiere[1].length} tables` : premiere[1].join(', ')}, ${premiere[0]}`
          : 'Synchro en échec')
    : mode === 'wait' ? 'Synchronisation…' : 'Synchronisé';
  const color = mode === 'ok' ? '#6e7c5c' : mode === 'wait' ? 'var(--color-copper)' : '#8f3b30';
  const title =
    mode === 'off' ? 'Hors ligne, les écritures restent sur ce poste et partiront au retour du réseau.'
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
    /* ON NE RENVOIE QUE VERS UNE PORTE OUVERTE — 31 août 2026. Renvoyer vers
       `accueilDe(role)` sans vérifier faisait tourner l'application sur
       elle-même le jour où cet écran-là se fermait : la garde refuse, la
       redirection y retourne, et personne n'entre plus. */
    const ou = premierEcranVisible(role, mesDomaines);
    if (ou && ou !== emplacement.pathname) navigate(ou, { replace: true });
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
  const [appelOpen, setAppelOpen] = useState(false);
  const [appelInitial, setAppelInitial] = useState<{ phone?: string; nom?: string } | null>(null);
  const [rdvPour, setRdvPour] = useState<{ clientId: string; appelId: string; avant: number } | null>(null);
  /* + RDV — poser un rendez-vous depuis N'IMPORTE OÙ, comme on encaisse depuis
     n'importe où : le geste du comptoir ne doit pas dépendre de l'écran où l'on
     se trouve (demande du 25 août). */
  const [rdvNouveau, setRdvNouveau] = useState(false);
  const [appels] = useAppels();
  const appelsEnAttente = appelsAActer(appels, branch.id).length;

  /* PARTAGER → LE TRÔNE (25 août). Depuis les appels récents du téléphone,
     « Partager » vers l'app installée arrive ici avec le numéro (share_target du
     manifest). On ouvre « Appel reçu » pré-rempli, puis on nettoie l'URL pour
     qu'un rafraîchissement ne rouvre pas le modale. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const texte = [params.get('text'), params.get('title'), params.get('url')].filter(Boolean).join(' ').trim();
    if (!texte) return;
    const m = texte.match(/\+?\d[\d\s().-]{5,}\d/);
    const phone = m ? m[0].replace(/[().-]/g, '').trim() : undefined;
    setAppelInitial({ phone, nom: phone ? undefined : texte.slice(0, 60) });
    setAppelOpen(true);
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }, []);
  const closeSide = () => setSideOpen(false);

  /* Le menu à deux étages ne s'impose que s'il fait gagner quelque chose :
     un menu déjà court (un maître, deux écrans) se rend à plat. Le groupe de
     l'écran OUVERT se déplie de lui-même — arriver par Trouver ne doit pas
     cacher où l'on est. */
  const [deplies, setDeplies] = useStore(menuDeplieStore);
  const [ordreNav, setOrdreNav] = useStore(navOrdreStore);
  /* Le mode rangement : les onglets cessent de conduire quelque part et se
     laissent monter ou descendre. Un mode, pas un réglage caché — on le quitte
     du même bouton qui l'a ouvert. */
  const [rangement, setRangement] = useState(false);

  /** Monter ou descendre un onglet dans son groupe. On enregistre la liste
      ENTIÈRE des chemins visibles, jamais un simple décalage : le rangement
      reste lisible même si un écran s'ouvre ou se ferme entre-temps. */
  const deplacer = (cle: string, liste: TroneRoute[], index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= liste.length) return;
    const chemins = liste.map((it) => it.path);
    [chemins[index], chemins[cible]] = [chemins[cible], chemins[index]];
    setOrdreNav((prev) => ({ ...prev, [cle]: chemins }));
  };
  const visibles = NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.horsMenu && peutVoir(role, it.path, mesDomaines)) }))
    .filter((g) => g.items.length > 0);
  const deuxEtages = visibles.reduce((s, g) => s + g.items.length, 0) > 8;
  const quotidien = selonLaMain(ordreNav['Le quotidien'], QUOTIDIEN
    .map((p) => visibles.flatMap((g) => g.items).find((it) => it.path === p))
    .filter((it): it is TroneRoute => !!it));
  const [filTous] = useFil();
  const [factures] = useInvoices();
  const monMailShell = (session?.user?.email ?? '').trim().toLowerCase();
  const replies = visibles
    .map((g) => ({ ...g, items: selonLaMain(ordreNav[g.group], g.items.filter((it) => !QUOTIDIEN.includes(it.path))) }))
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

  /* EN RANGEMENT, L'ONGLET NE CONDUIT PLUS NULLE PART. Le laisser naviguer
     ferait quitter l'écran au premier clic manqué, et l'on perdrait le fil de
     ce qu'on était en train d'arranger. */
  const lienRangeable = (cle: string, liste: TroneRoute[]) => (it: TroneRoute, i: number) => (
    <div className="tr-nav__range" key={it.path}>
      <span className="tr-nav__range__nom"><it.icon />{it.label}</span>
      <button
        className="tr-nav__range__fleche"
        disabled={i === 0}
        aria-label={`Monter ${it.label}`}
        title="Monter"
        onClick={() => deplacer(cle, liste, i, -1)}
      >
        ↑
      </button>
      <button
        className="tr-nav__range__fleche"
        disabled={i === liste.length - 1}
        aria-label={`Descendre ${it.label}`}
        title="Descendre"
        onClick={() => deplacer(cle, liste, i, 1)}
      >
        ↓
      </button>
    </div>
  );

  /* ── AUCUN ÉCRAN OUVERT — 31 août 2026 ────────────────────────────
     Depuis que le calendrier lui-même se ferme, un compte peut n'avoir aucune
     porte. L'application s'ouvrait alors sur du vide : un menu sans ligne, une
     page blanche, et personne pour dire pourquoi. On le dit. */
  if (role === 'maitre' && premierEcranVisible(role, mesDomaines) === null) {
    return (
      <div className="tr-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
        <div style={{
          maxWidth: 460, textAlign: 'center', background: 'var(--surface-card)',
          border: '1px solid var(--hairline)', borderRadius: 4, padding: '30px 28px',
        }}>
          <Seal color="or" size={40} />
          <div className="mnd-eyebrow" style={{ marginTop: 10 }}>Rien ne vous est ouvert</div>
          <h1 className="mnd-serif" style={{ fontWeight: 300, fontSize: 27, color: 'var(--color-indigo)', margin: '8px 0 10px' }}>
            Aucun écran ne vous attend.
          </h1>
          <p className="mnd-muted" style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            Votre compte est bien rattaché à la Maison, mais aucun écran ne vous a encore été
            ouvert. Demandez-le à un souverain, il le fait d'un clic dans « Accès &amp; personnel ».
          </p>
          <button
            type="button"
            className="mnd-btn"
            style={{ marginTop: 18 }}
            onClick={() => void signOut()}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

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
                {rangement ? g.items.map(lienRangeable(g.group, g.items)) : g.items.map(lien)}
              </div>
            ))
          ) : (
            <>
              <div>
                <div className="tr-nav__group">Le quotidien</div>
                {rangement ? quotidien.map(lienRangeable('Le quotidien', quotidien)) : quotidien.map(lien)}
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
                    {ouvert && (rangement ? g.items.map(lienRangeable(g.group, g.items)) : g.items.map(lien))}
                  </div>
                );
              })}
            </>
          )}
          {/* LE BOUTON QUI RANGE — discret, en pied de menu : on n'y vient
              qu'une fois, le jour où l'ordre du code ne convient plus. */}
          <button
            className={`tr-nav__ranger ${rangement ? 'is-on' : ''}`}
            onClick={() => setRangement((v) => !v)}
            title={rangement ? 'Revenir au menu' : 'Monter et descendre les onglets'}
          >
            {rangement ? 'Terminer le rangement' : 'Ranger le menu'}
          </button>
          {rangement && (
            <div className="tr-nav__aide">
              Les flèches montent et descendent chaque onglet. L’ordre est le vôtre, sur CE poste
              seulement, il ne change rien pour les autres.
              {Object.keys(ordreNav).length > 0 && (
                <button className="tr-nav__reset" onClick={() => setOrdreNav({})}>
                  Revenir à l’ordre d’origine
                </button>
              )}
            </div>
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
          <Button variant="ghost" onClick={() => setAppelOpen(true)} title="Poser un appel reçu">
            Appel reçu{appelsEnAttente > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--color-copper)', color: '#fff', borderRadius: 999, fontSize: 11, padding: '0 6px', fontWeight: 600 }}>{appelsEnAttente}</span>
            )}
          </Button>
          <Button variant="ghost" onClick={() => setRdvNouveau(true)} title="Poser un rendez-vous">+ RDV</Button>
          <Button onClick={() => navigate('/caisse')}>+ Encaisser</Button>
          {session && (
            <button
              className="tr-top__bell"
              aria-label="Se déconnecter"
              title={`${staff?.name ?? 'Personnel'}, se déconnecter`}
              onClick={() => void signOut()}
            >
              <LogOut size={15} />
            </button>
          )}
        </header>

        <AppelRecuModal
          open={appelOpen}
          initial={appelInitial}
          onClose={() => { setAppelOpen(false); setAppelInitial(null); }}
          onPoserRdv={(clientId, appelId) => setRdvPour({ clientId, appelId, avant: appointmentsStore.get().filter((x) => x.clientId === clientId).length })}
        />
        {rdvNouveau && <RdvModal title="Nouveau rendez-vous" onClose={() => setRdvNouveau(false)} />}
        {rdvPour && (
          <RdvModal
            title="Rendez-vous depuis un appel"
            initial={{ clientId: rdvPour.clientId }}
            onClose={() => {
              const apres = appointmentsStore.get().filter((x) => x.clientId === rdvPour.clientId).length;
              if (apres > rdvPour.avant) marquerAppelFait(rdvPour.appelId);
              setRdvPour(null);
            }}
          />
        )}

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
