import { useCallback, useEffect, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Input, Select } from '../../../../ds/components';
import { supabase } from '../../../../shared/supabase';
import { useAuth, useStaff, vientDeMaCouronne, type CompteEnAttente } from '../../../../shared/auth';
import { staffAccessStore, useStaff as useEquipe } from '../equipe/data';
import { adresseDArrivee, etatDeLArrivee, seRessemblent } from '../../../../shared/arrivee-pure';
import { ANCIENS_DOMAINES, NAV, ROUTES_MAITRE, ROUTES_MAITRE_FERMABLES, ancienDomaineDe, domaineDe } from '../index';
import { useClients } from '../../../../shared/clients';
import { useStore } from '../../../../shared/store';
import './systeme.css';

/* Accès & personnel — le souverain autorise les comptes connectés à entrer dans
   Le Trône, choisit leur rôle, et peut révoquer un accès. Tout passe par des
   fonctions SECURITY DEFINER (migration 0007) qui vérifient elles-mêmes que
   l'appelant est souverain ; sans elles, l'écran reste inerte. */

type Pending = CompteEnAttente;
type StaffFull = { user_id: string; email: string | null; name: string | null; role: string; rubrics: string[]; created_at: string };
type Role = 'souverain' | 'gerant' | 'maitre';

const ROLE_LABEL: Record<string, string> = {
  souverain: 'Souverain·e, accès total',
  gerant: 'Gérant·e, tout sauf le système',
  maitre: 'Maître, clients & vente',
};

const ROLE_COURT: Record<string, string> = {
  souverain: 'Souverain·e',
  gerant: 'Gérant·e',
  maitre: 'Maître',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const nameFromEmail = (email: string | null) => {
  const local = (email ?? '').split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Compte';
};

export default function Acces() {
  const { session } = useAuth();
  const me = useStaff();
  const myId = session?.user?.id;
  const isSouverain = me?.role === 'souverain';

  const [pending, setPending] = useState<Pending[]>([]);
  const [team, setTeam] = useState<StaffFull[]>([]);
  const [roleFor, setRoleFor] = useState<Record<string, Role>>({});
  /* LA MATRICE DES DOMAINES. Elle vivait dans le modele sans lecteur ; elle
     commande desormais la barre de navigation. Clef : l'identifiant de compte,
     le seul qui ne bouge pas quand un nom se corrige. */
  const [acces, setAcces] = useStore(staffAccessStore);
  /* ── UNE PERSONNE À LA FOIS — 22 septembre 2026 ────────────────────────
     « Too congested. Je ne sais plus sur quel membre je suis quand je fais
     défiler » (Yéman). L'écran dépliait les quarante-quatre écrans de chaque
     maître, les uns sous les autres : aucune séparation entre deux personnes,
     et nulle part où lire ce qu'une personne atteint sans tout parcourir.

     Désormais chaque personne tient sur une ligne qui dit son résumé, un seul
     panneau s'ouvre à la fois, et une barre collante porte son nom tant qu'on
     règle ses écrans. Les domaines se déplient un par un. */
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [domOuverts, setDomOuverts] = useState<string[]>([]);
  const [requete, setRequete] = useState('');
  const [vue, setVue] = useState<'gens' | 'ecrans'>('gens');
  /* DISTINGUER UNE CLIENTE D'UNE FUTURE COLLÈGUE.

     `list_pending_staff` rend TOUT compte qui n'est pas encore au personnel —
     et une cliente qui s'inscrit sur Ma Couronne en crée un. Elle atterrissait
     donc dans cette liste, à côté des vraies candidatures, avec un bouton
     « Autoriser » à portée de clic. L'autoriser par mégarde lui ouvrait l'ERP.

     La reconnaissance est rétroactive et ne demande aucune migration :
     l'identifiant d'une fiche cliente EST l'identifiant de son compte
     (`useClientId`). Un compte en attente qui porte déjà une fiche vient donc
     de Ma Couronne, et non du Trône. */
  const [clients] = useClients();
  /* LES DEUX FAÇONS D'ÊTRE SA FICHE. À l'origine, l'identifiant d'une fiche
     cliente ÉTAIT celui de son compte ; depuis l'adoption (0045), une cliente
     reconnue garde l'identifiant de son ANCIENNE fiche et son compte s'inscrit
     dans `authUserId`. Ne lire que le premier renvoyait toutes les adoptées
     dans la file du Trône. */
  const fichesClientes = new Set(clients.flatMap((c) => [c.id, c.authUserId ?? '']));
  const estCliente = (userId: string) => fichesClientes.has(userId);
  /* ROMPRE LE SILENCE D'UNE LETTRE MAL RECOPIÉE — 22 septembre 2026.

     Depuis que la direction prépare la place d'une recrue AVANT son arrivée
     (migration 0109), une faute d'une seule lettre dans l'adresse préparée
     produit un silence : la recrue s'inscrit, rien ne se rattache, elle tombe
     dans cette file, et personne ne comprend pourquoi. Le même silence que
     « acceuil@ » écrit pour « accueil@ ».

     La file rapproche donc d'elle-même. CE N'EST QU'UN INDICE, jamais un
     rattachement : une ressemblance ne prouve rien, et c'est la direction qui
     tranche, du même geste qu'avant. Une adresse qui ressemble à DEUX places
     préparées n'en désigne aucune : une ambiguïté ne se tranche pas en
     faveur de celui qui entre. */
  const [equipe] = useEquipe();
  const ceJour = new Date().toISOString().slice(0, 10);
  const placesPreparees = equipe
    .filter((m) => etatDeLArrivee(m, ceJour) === 'invitee')
    .map((m) => ({ nom: (m.name ?? '').trim(), adresse: adresseDArrivee(m) }));
  const placeVoisine = (mail: string | null) => {
    const a = (mail ?? '').trim().toLowerCase();
    if (!a) return null;
    const proches = placesPreparees.filter((p) => seRessemblent(a, p.adresse));
    return proches.length === 1 ? proches[0] : null;
  };
  const attenteTrone = pending.filter((u) => !vientDeMaCouronne(u, estCliente));
  const attenteCouronne = pending.filter((u) => vientDeMaCouronne(u, estCliente));
  const nomCliente = (userId: string) =>
    clients.find((c) => c.authUserId === userId || c.id === userId)?.name ?? 'Cliente Ma Couronne';
  /* ── OUVERTS D'OFFICE, FERMABLES À LA MAIN — 31 août 2026 ────────
     `/mon-mois`, `/fil` et `/tableau` ne se cochent pas comme les autres : ils
     sont ouverts TANT QU'ON NE LES A PAS FERMÉS. Les traiter comme les autres
     aurait tout retiré aux comptes déjà autorisés, dont la matrice ne porte
     aucune case pour eux.

     ILS NE DÉPENDENT PAS DU DOMAINE : ouvrir « Équipe & croissance » en entier
     ne doit pas rouvrir un fil qu'on vient de fermer à quelqu'un. */
  const estFermable = (path: string) => ROUTES_MAITRE_FERMABLES.includes(path);
  /* UNE CASE COCHÉE AVANT LES DÉPARTEMENTS VAUT ENCORE, écran par écran :
     l'ancien domaine « clients » ouvrait aussi les Personas, qui vivent
     désormais sous Marketing. Même juge que `peutVoir` (routes/index). */
  const ouvertParLAncienDomaine = (userId: string, path: string) => {
    const ancien = ancienDomaineDe(path);
    return !!ancien && acces[userId]?.[ancien] === true;
  };
  const ecranOuvert = (userId: string, path: string, toutOuvert: boolean) =>
    (estFermable(path)
      ? acces[userId]?.[path] !== false
      : (toutOuvert || acces[userId]?.[path] === true || ouvertParLAncienDomaine(userId, path)));
  const basculeEcran = (userId: string, path: string, toutOuvert: boolean) => {
    if (!estFermable(path)) { basculeDomaine(userId, path); return; }
    const ouvert = acces[userId]?.[path] !== false;
    setAcces((prev) => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [path]: !ouvert } }));
    void toutOuvert;
  };

  const basculeDomaine = (userId: string, d: string) =>
    setAcces((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [d]: !(prev[userId]?.[d]) },
    }));

  /* ── CE QU'UNE PERSONNE ATTEINT, EN UN NOMBRE ──────────────────────────
     Le résumé de la ligne repliée et le compte de chaque domaine sortent
     d'ici, donc ils ne peuvent pas se contredire. Un gérant ou un souverain
     ouvre tout : on ne compte pas, on le dit. */
  const domaineDuGroupe = (ecrans: { path: string }[]) => domaineDe(ecrans[0]?.path ?? '');
  /* LE DÉPARTEMENT EST « DONNÉ » s'il l'est par sa clef, ou si chacun de ses
     écrans l'est par un ancien domaine : dans les deux cas la pastille est
     pleine, et le même clic referme tout. */
  const toutLeDomaine = (userId: string, ecrans: { path: string }[]) => {
    const d = domaineDuGroupe(ecrans);
    if (!!d && acces[userId]?.[d] === true) return true;
    return ecrans.length > 0 && ecrans.every((it) => ouvertParLAncienDomaine(userId, it.path));
  };
  /* DONNER OU REPRENDRE UN DÉPARTEMENT — 22 septembre 2026. Reprendre
     convertit d'abord les anciens domaines qui le couvraient : chacun
     s'éteint, et les écrans qu'il ouvrait AILLEURS reçoivent leur propre
     case. Rien d'autre ne bouge : ni élargissement, ni fermeture silencieuse
     dans un autre département. Une case fermée à la main reste fermée. */
  const basculeDepartement = (userId: string, ecrans: { path: string }[]) => {
    const d = domaineDuGroupe(ecrans);
    if (!d) return;
    const ouvert = toutLeDomaine(userId, ecrans);
    setAcces((prev) => {
      const mien = { ...(prev[userId] ?? {}) };
      if (!ouvert) { mien[d] = true; return { ...prev, [userId]: mien }; }
      mien[d] = false;
      const ici = new Set(ecrans.map((it) => it.path));
      for (const [ancien, chemins] of Object.entries(ANCIENS_DOMAINES)) {
        if (mien[ancien] !== true || !chemins.some((c) => ici.has(c))) continue;
        mien[ancien] = false;
        for (const c of chemins) if (!ici.has(c) && mien[c] !== false) mien[c] = true;
      }
      return { ...prev, [userId]: mien };
    });
  };
  const compteDuDomaine = (m: StaffFull, ecrans: { path: string }[]): [number, number] => {
    if (m.role !== 'maitre') return [ecrans.length, ecrans.length];
    const tout = toutLeDomaine(m.user_id, ecrans);
    return [ecrans.filter((it) => ecranOuvert(m.user_id, it.path, tout)).length, ecrans.length];
  };
  /* Générique : le groupe garde ses libellés, qu'on affiche sur chaque pastille. */
  const ecransDuGroupe = <T extends { path: string }>(items: T[]): T[] =>
    items.filter((it) => !ROUTES_MAITRE.includes(it.path));

  /* QUI ATTEINT CET ÉCRAN : la même question, prise par l'autre bout. On se
     la pose après avoir fermé la Caisse à quelqu'un, et y répondre demandait
     d'ouvrir les personnes une par une. */
  const quiAtteint = (path: string, ecrans: { path: string }[]) =>
    team.filter((m) => m.role !== 'maitre' || ecranOuvert(m.user_id, path, toutLeDomaine(m.user_id, ecrans)));

  const initiales = (m: StaffFull) =>
    (m.name || nameFromEmail(m.email)).split(/[\s.·-]+/).filter(Boolean).slice(0, 2)
      .map((s) => s[0]).join('').toUpperCase();

  const clefDom = (userId: string, groupe: string) => `${userId}::${groupe}`;
  const basculeGroupe = (clef: string) =>
    setDomOuverts((prev) => (prev.includes(clef) ? prev.filter((x) => x !== clef) : [...prev, clef]));

  /* La recherche cherche ce qui est écrit à l'écran : un nom, une adresse,
     un rôle. Elle ne cherche pas dans ce qui est caché. */
  const cherche = requete.trim().toLowerCase();
  const gensVus = team.filter((m) => !cherche
    || [m.name, m.email, ROLE_LABEL[m.role] ?? m.role].some((x) => (x ?? '').toLowerCase().includes(cherche)));
  const [nameFor, setNameFor] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('maitre');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  /* ══ LA CONFIRMATION SE DEMANDE DANS LA PAGE — 5 septembre 2026 ════
     « Quand j'appuie le bouton Écarter rien ne se passe » (Yéman).

     `window.confirm` NE S'AFFICHE PAS TOUJOURS. Le navigateur laisse cocher
     « empêcher cette page de créer d'autres dialogues », et dès lors la
     fonction rend `false` SANS RIEN MONTRER : le geste est refusé au nom de
     l'utilisateur, en silence. « Autoriser », qui ne demande rien, marchait ;
     « Écarter », qui demandait, ne faisait rien. Le symptôme exact.

     ON NE DEMANDE PLUS RIEN AU NAVIGATEUR. La question se pose dans la ligne
     elle-même, avec deux boutons : elle ne peut pas être supprimée, et elle
     dit ce qui va se passer là où le geste se fait. */
  const [aConfirmer, setAConfirmer] = useState<{ quoi: 'ecarter' | 'retirer'; id: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !isSouverain) { setLoading(false); return; }
    setLoading(true);
    const [p, s] = await Promise.all([
      supabase.rpc('list_pending_staff'),
      supabase.rpc('list_staff_full'),
    ]);
    if (!p.error && p.data) setPending(p.data as Pending[]);
    if (!s.error && s.data) setTeam(s.data as StaffFull[]);
    if (p.error) setMsg({ kind: 'err', text: p.error.message });
    setLoading(false);
  }, [isSouverain]);

  useEffect(() => { void load(); }, [load]);

  const authorize = async (u: Pending) => {
    if (!supabase) return;
    setBusy(u.user_id); setMsg(null);
    const role = roleFor[u.user_id] ?? 'maitre';
    const name = (nameFor[u.user_id] ?? nameFromEmail(u.email)).trim();
    const { error } = await supabase.rpc('authorize_staff', {
      target: u.user_id, display_name: name, new_role: role,
    });
    setBusy(null);
    if (error) { setMsg({ kind: 'err', text: error.message }); return; }
    setMsg({ kind: 'ok', text: `${name || u.email} a été autorisé (${role}).` });
    await load();
  };

  /* ── ÉCARTER UN COMPTE DE LA FILE — 31 août 2026 ──────────────────
     « Il faut régler de façon définitive » (Yéman).

     L'application marque désormais chaque compte à sa porte, et les comptes
     du passé se rangent à leur prochaine ouverture. Restent ceux qui
     n'ouvriront plus jamais Ma Couronne : ils resteraient dans la file pour
     toujours. Ce bouton les en sort, côté serveur, une fois pour toutes.

     ÉCARTER N'EST PAS SUPPRIMER, et le mot le dit. Le compte existe encore,
     sa cliente entre sur Ma Couronne quand elle veut. Détruire un compte
     d'authentification depuis un écran de gestion est un geste qui ne se
     rattrape pas ; celui-ci se défait d'un clic sur « Autoriser ». */
  const ecarter = async (u: Pending) => {
    if (!supabase) { setMsg({ kind: 'err', text: 'Aucun serveur : la file ne se range qu’en ligne.' }); return; }
    setAConfirmer(null);
    setBusy(u.user_id); setMsg(null);
    const { error } = await supabase.rpc('ecarter_du_personnel', { target: u.user_id });
    setBusy(null);
    if (error) {
      /* UNE FONCTION ABSENTE SE DIT AUTREMENT QU'UN REFUS. PostgREST répond
         « Could not find the function » quand la migration n'a pas été collée :
         le message brut n'apprend rien au comptoir. */
      const brut = error.message ?? '';
      setMsg({
        kind: 'err',
        text: /could not find the function|does not exist|PGRST202/i.test(brut)
          ? 'Ce geste attend sa migration côté Supabase (0080). Collez-la, puis réessayez.'
          : brut,
      });
      return;
    }
    setMsg({ kind: 'ok', text: `${u.email ?? 'Ce compte'} a été écarté de la file.` });
    /* ON LE RETIRE DE LA LISTE TOUT DE SUITE. `load()` le fera aussi, mais une
       seconde plus tard : entre les deux, l'écran semblait n'avoir rien fait,
       et c'est ce silence qu'on est venu corriger. */
    setPending((prev) => prev.filter((x) => x.user_id !== u.user_id));
    await load();
  };

  const startEdit = (m: StaffFull) => {
    setEditId(m.user_id);
    setEditName(m.name ?? '');
    setEditRole((['souverain', 'gerant', 'maitre'].includes(m.role) ? m.role : 'maitre') as Role);
    setMsg(null);
  };

  const saveEdit = async (m: StaffFull) => {
    if (!supabase) return;
    setBusy(m.user_id); setMsg(null);
    const { error } = await supabase.rpc('authorize_staff', {
      target: m.user_id, display_name: editName.trim(), new_role: editRole,
    });
    setBusy(null);
    if (error) { setMsg({ kind: 'err', text: error.message }); return; }
    setEditId(null);
    setMsg({ kind: 'ok', text: `${editName.trim() || m.email} mis à jour.` });
    await load();
  };

  const revoke = async (m: StaffFull) => {
    /* MÊME MAL, MÊME REMÈDE que « Écarter » : la question se pose dans la
       ligne, jamais au navigateur. */
    if (!supabase) { setMsg({ kind: 'err', text: 'Aucun serveur : les accès ne se règlent qu’en ligne.' }); return; }
    setAConfirmer(null);
    setBusy(m.user_id); setMsg(null);
    const { error } = await supabase.rpc('revoke_staff', { target: m.user_id });
    setBusy(null);
    if (error) { setMsg({ kind: 'err', text: error.message }); return; }
    setMsg({ kind: 'ok', text: `Accès retiré à ${m.email ?? m.name ?? 'ce compte'}.` });
    await load();
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · Accès"
        title="Accès & rôles."
        sub="Qui entre dans la Maison, et dans quels départements. Réservé au souverain."
      />

      {/* Dire VRAI sur la portée : les rôles/rubriques guident l'interface, ils ne
          sont pas une barrière serveur. Sans cette note, on croirait la matrice
          étanche — et on donnerait un accès en pensant cloisonner les finances. */}
      <div style={{ fontSize: 12.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '11px 14px', lineHeight: 1.55, marginBottom: 18 }}>
        <b>Portée réelle des rôles.</b> Côté serveur, seule la <b>paie</b> (runs, avances, pointages,
        congés) est réservée au souverain. Le reste des données de la Maison, clientes, rendez-vous,
        factures, dépenses, est accessible à <b>tout compte autorisé ici</b>, quel que soit son rôle :
        n'autorisez que des personnes de confiance. Les rôles et rubriques organisent l'interface,
        ils ne cloisonnent pas les données.
      </div>

      {!supabase ? (
        <Card className="sys-section"><div className="sys-section__cap">Aucun backend configuré, l'accès est géré en local.</div></Card>
      ) : !isSouverain ? (
        <Card className="sys-section">
          <div className="sys-section__title">Réservé au souverain</div>
          <div className="sys-section__cap">Seul un compte souverain peut autoriser ou retirer des accès.</div>
        </Card>
      ) : (
        <>
          {msg && (
            <div className={`sys-acc-msg ${msg.kind === 'err' ? 'is-err' : 'is-ok'}`}>{msg.text}</div>
          )}

          {/* Comptes en attente d'autorisation */}
          <Card className="sys-section">
            <div className="sys-section__title">
              Comptes en attente · Le Trône {attenteTrone.length > 0 && <span className="sys-badge-count">{attenteTrone.length}</span>}
            </div>
            <div className="sys-section__cap">
              Des personnes se sont connectées au Trône mais n'ont pas encore accès.
              Donnez-leur un rôle pour les faire entrer.
              {/* LES CLIENTES NE SONT PLUS ICI. Chaque compte porte désormais la
                  porte par laquelle il est né, et Ma Couronne la repose à chaque
                  session : les comptes d'avant se rangent d'eux-mêmes dès leur
                  prochaine ouverture. Un compte qui n'a encore jamais ouvert Ma
                  Couronne peut rester ici un temps, d'où la phrase qui suit. */}
              <span style={{ display: 'block', marginTop: 6 }}>
                Vérifiez l’adresse avant d’autoriser. Une inscrite de Ma Couronne qui n’a jamais
                ouvert l’application peut encore apparaître ici, le temps de sa première visite.
              </span>
            </div>

            {loading && <div className="sys-acc-empty">Chargement…</div>}
            {!loading && attenteTrone.length === 0 && (
              <div className="sys-acc-empty">Aucun compte en attente. Quand quelqu'un se connectera au Trône, il apparaîtra ici.</div>
            )}
            {attenteTrone.map((u) => (
              <div className="sys-acc-row" key={u.user_id}>
                <div className="sys-acc-row__id">
                  <div className="sys-acc-row__email">{u.email ?? '—'}</div>
                  <div className="sys-acc-row__sub">
                    {aConfirmer?.quoi === 'ecarter' && aConfirmer.id === u.user_id
                      ? 'Il quittera la file. Son compte reste intact, il peut continuer à ouvrir Ma Couronne. Confirmez, ou cliquez ailleurs.'
                      : `Connecté depuis le ${fmtDate(u.created_at)}`}
                  </div>
                  {(() => {
                    const v = placeVoisine(u.email);
                    if (!v) return null;
                    return (
                      <div className="sys-acc-row__sub" style={{ color: 'var(--copper)' }}>
                        Ressemble à la place préparée{v.nom ? ` de ${v.nom}` : ''} ({v.adresse}).
                        Une lettre a peut-être été mal recopiée : corrigez l’e-mail de connexion sur sa fiche,
                        ou autorisez ce compte ici.
                      </div>
                    );
                  })()}
                </div>
                <Input
                  className="sys-input sys-acc-row__name"
                  value={nameFor[u.user_id] ?? nameFromEmail(u.email)}
                  onChange={(e) => setNameFor((n) => ({ ...n, [u.user_id]: e.target.value }))}
                  placeholder="Nom affiché"
                  aria-label="Nom affiché"
                />
                <Select
                  className="sys-select sys-acc-row__role"
                  value={roleFor[u.user_id] ?? 'maitre'}
                  onChange={(e) => setRoleFor((r) => ({ ...r, [u.user_id]: e.target.value as Role }))}
                  aria-label="Rôle"
                >
                  <option value="maitre">Maître, clients & vente</option>
                  <option value="gerant">Gérant·e, tout sauf système</option>
                  <option value="souverain">Souverain·e, accès total</option>
                </Select>
                <Button variant="copper" size="sm" disabled={busy === u.user_id} onClick={() => void authorize(u)}>
                  {busy === u.user_id ? '…' : 'Autoriser'}
                </Button>
                {aConfirmer?.quoi === 'ecarter' && aConfirmer.id === u.user_id ? (
                  <Button variant="ghost" size="sm" disabled={busy === u.user_id} onClick={() => void ecarter(u)}>
                    {busy === u.user_id ? '…' : 'Confirmer'}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === u.user_id}
                    title="Ce n'est pas une candidature. Le retirer de la file, sans toucher à son compte."
                    onClick={() => { setMsg(null); setAConfirmer({ quoi: 'ecarter', id: u.user_id }); }}
                  >
                    Écarter
                  </Button>
                )}
              </div>
            ))}
          </Card>

          {/* ── LES COMPTES DE MA COURONNE ────────────────────────────
              Ce ne sont pas des candidatures : ce sont tes clientes. Elles
              n'ont rien à faire dans Le Trône, et le bouton « Autoriser » leur
              ouvrirait l'ERP entier. On les montre pour que la liste du haut
              soit franche — sans elles, on se demanderait où elles sont
              passées — et on n'y met aucun bouton. */}
          {attenteCouronne.length > 0 && (
            <Card className="sys-section" style={{ marginTop: 16 }}>
              <div className="sys-section__title">
                Comptes de Ma Couronne <span className="sys-badge-count">{attenteCouronne.length}</span>
              </div>
              <div className="sys-section__cap">
                Des clientes inscrites sur Ma Couronne. Elles n'ont pas à entrer dans Le Trône,
                leur compte leur sert à réserver et à suivre leurs rituels. Reconnues à la porte
                par laquelle elles se sont inscrites, ou à leur fiche cliente.
              </div>
              {attenteCouronne.map((u) => (
                <div className="sys-acc-row" key={u.user_id}>
                  <div className="sys-acc-row__id">
                    <div className="sys-acc-row__email">{nomCliente(u.user_id)}</div>
                    <div className="sys-acc-row__sub">
                      {u.email ?? '—'} · inscrite le {fmtDate(u.created_at)}
                    </div>
                  </div>
                  <span className="mnd-muted" style={{ fontSize: 12 }}>Cliente, aucun accès à l’ERP</span>
                </div>
              ))}
              <div className="mnd-muted" style={{ fontSize: 11.5, padding: '10px 2px 2px', lineHeight: 1.55 }}>
                Si l’une d’elles rejoint vraiment l’équipe, ouvre-lui un compte avec une AUTRE
                adresse : mêler sa fiche cliente et son accès au personnel rendrait ses propres
                rendez-vous indiscernables de ceux qu’elle exécute.
              </div>
            </Card>
          )}

          {/* ── PERSONNEL AUTORISÉ ─────────────────────────────────────────
              Une personne, une ligne. Ce qu'elle atteint se lit sans ouvrir ;
              ouvrir sert à régler, et un seul panneau s'ouvre à la fois. */}
          <Card className="sys-section" style={{ marginTop: 16 }}>
            <div className="sys-section__title">
              Personnel autorisé {team.length > 0 && <span className="sys-badge-count">{team.length}</span>}
            </div>
            <div className="sys-section__cap">
              Un département est un rôle : le donner ouvre ses écrans. Une personne en cumule
              autant qu’il faut ; le rang et les départements se lisent sur la ligne, et l’on
              ouvre une personne pour donner, reprendre, ou régler un écran seul.
            </div>

            <div className="sys-acc-outils">
              <Input
                className="sys-input sys-acc-rech"
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder={vue === 'gens' ? 'Trouver une personne, un rôle…' : 'Trouver un écran…'}
                aria-label="Filtrer"
              />
              <div className="sys-acc-vues" role="group" aria-label="Façon de lire les accès">
                <button type="button" aria-pressed={vue === 'gens'} onClick={() => setVue('gens')}>Par personne</button>
                <button type="button" aria-pressed={vue === 'ecrans'} onClick={() => setVue('ecrans')}>Par écran</button>
              </div>
            </div>

            {/* CE QUE CHAQUE ALLURE VEUT DIRE, DIT UNE SEULE FOIS. Elle était
                répétée sous chaque maître, six fois le même paragraphe. */}
            <div className="sys-acc-legende">
              <span><i className="sys-acces__chip is-on" /> ouvert</span>
              <span><i className="sys-acces__chip is-herite" /> ouvert par le domaine</span>
              <span><i className="sys-acces__chip" /> fermé</span>
              <span><i className="sys-acces__chip is-barre" /> retiré alors qu’il est ouvert d’office</span>
            </div>

            {!loading && team.length === 0 && <div className="sys-acc-empty">Aucun personnel rattaché.</div>}

            {vue === 'gens' && team.length > 0 && gensVus.length === 0 && (
              <div className="sys-acc-empty">Personne ne répond à « {requete} ».</div>
            )}

            {vue === 'gens' && gensVus.map((m) => {
              const self = m.user_id === myId;
              const lastSouverain = m.role === 'souverain' && team.filter((x) => x.role === 'souverain').length <= 1;
              const editing = editId === m.user_id;
              const ouvert = ouvertId === m.user_id;
              const toutOuvertPartout = m.role !== 'maitre';
              return (
                <div className={`sys-acc-carte${ouvert ? ' est-ouvert' : ''}`} key={m.user_id}>
                  <button
                    type="button"
                    className="sys-acc-tete"
                    aria-expanded={ouvert}
                    onClick={() => {
                      setMsg(null);
                      setAConfirmer(null);
                      setOuvertId(ouvert ? null : m.user_id);
                    }}
                  >
                    <span className="sys-acc-jeton" aria-hidden="true">{initiales(m)}</span>
                    <span className="sys-acc-qui">
                      <span className="sys-acc-qui__nom">
                        {m.name || m.email || '—'}{self && <span className="sys-acc-you">vous</span>}
                      </span>
                      <span className="sys-acc-qui__mail">{m.email}</span>
                    </span>
                    {/* LE RÉSUMÉ : un jeton par domaine touché, et son compte.
                        C'est la réponse à « qui a accès à quoi », sans ouvrir. */}
                    <span className="sys-acc-resume">
                      {toutOuvertPartout
                        ? <span className="sys-acc-dom est-total">Accès total</span>
                        : (() => {
                          const jetons = NAV.map((g) => {
                            const ecrans = ecransDuGroupe(g.items);
                            if (!ecrans.length) return null;
                            const [n, t] = compteDuDomaine(m, ecrans);
                            if (!n) return null;
                            return (
                              <span className={`sys-acc-dom ${n === t ? 'est-plein' : 'est-part'}`} key={g.group}>
                                {g.group} {n === t ? 'tout' : `${n}/${t}`}
                              </span>
                            );
                          }).filter(Boolean);
                          return jetons.length ? jetons : <span className="sys-acc-dom">Rien d’ouvert en plus</span>;
                        })()}
                    </span>
                    <span className={`sys-acc-role${m.role === 'souverain' ? ' est-souverain' : m.role === 'gerant' ? ' est-gerant' : ''}`}>
                      {ROLE_COURT[m.role] ?? m.role}
                    </span>
                    <svg className="sys-acc-fleche" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </button>

                  {ouvert && (
                    <div className="sys-acc-panneau">
                      {/* LA BARRE QUI SUIT LE DÉFILEMENT. C'est elle qui répond à
                          « je ne sais plus sur quel membre je suis » : tant qu'on
                          règle ses écrans, son nom reste sous les yeux. */}
                      <div className="sys-acc-suit">
                        <b>{m.name || m.email || '—'}</b>
                        <small>{m.email} · {ROLE_LABEL[m.role] ?? m.role}</small>
                        <span className="sys-acc-suit__actions">
                          {editing ? (
                            <>
                              <Button variant="copper" size="sm" disabled={busy === m.user_id} onClick={() => void saveEdit(m)}>
                                {busy === m.user_id ? '…' : 'Enregistrer'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Annuler</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>Nom &amp; rôle</Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy === m.user_id || self || lastSouverain}
                                title={self ? 'Vous ne pouvez pas retirer votre propre accès.' : lastSouverain ? 'Dernier souverain, accès protégé.' : 'Retirer l’accès'}
                                onClick={() => {
                                  if (aConfirmer?.quoi === 'retirer' && aConfirmer.id === m.user_id) { void revoke(m); return; }
                                  setMsg(null);
                                  setAConfirmer({ quoi: 'retirer', id: m.user_id });
                                }}
                              >
                                {busy === m.user_id ? '…'
                                  : aConfirmer?.quoi === 'retirer' && aConfirmer.id === m.user_id ? 'Confirmer le retrait'
                                  : 'Retirer'}
                              </Button>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="sys-acc-corps">
                        {editing && (
                          <div className="sys-acc-edit">
                            <Input
                              className="sys-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Nom affiché"
                              aria-label="Nom affiché"
                              autoFocus
                            />
                            <Select
                              className="sys-select"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as Role)}
                              aria-label="Rôle"
                              disabled={self}
                              title={self ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}
                            >
                              <option value="maitre">Maître, clients &amp; vente</option>
                              <option value="gerant">Gérant·e, tout sauf système</option>
                              <option value="souverain">Souverain·e, accès total</option>
                            </Select>
                          </div>
                        )}

                        {/* DEUX CASQUETTES, UN SEUL COMPTE. Un maître n'atteint que Mon
                            mois et le Calendrier. Ouvrir un domaine lui rend les écrans
                            de ce domaine, c'est ainsi qu'une personne qui tient le
                            secrétariat ET le fauteuil garde un seul pointage, une seule
                            part de pourboire et une seule prime.

                            Rien à cocher pour un gérant ou un souverain : ils ouvrent
                            tout, et des cases sans effet feraient croire au contraire. */}
                        {toutOuvertPartout ? (
                          <div className="sys-acc-note">
                            {ROLE_LABEL[m.role] ?? m.role} : tous les écrans sont ouverts, il n’y a rien à
                            cocher ici. Des cases feraient croire le contraire.
                          </div>
                        ) : (
                          <>
                            {NAV.map((g) => {
                              const ecrans = ecransDuGroupe(g.items);
                              if (!ecrans.length) return null;
                              const toutOuvert = toutLeDomaine(m.user_id, ecrans);
                              const [n, t] = compteDuDomaine(m, ecrans);
                              const clef = clefDom(m.user_id, g.group);
                              const deplie = domOuverts.includes(clef);
                              return (
                                <section className={`sys-acc-grp${deplie ? ' est-deplie' : ''}`} key={g.group}>
                                  <button type="button" className="sys-acc-grp__tete" aria-expanded={deplie} onClick={() => basculeGroupe(clef)}>
                                    <svg className="sys-acc-fleche" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                                    <span className="sys-acc-grp__nom">{g.group}</span>
                                    <span className="sys-acc-grp__compte">{n === t ? 'tout' : `${n} sur ${t}`}</span>
                                    <span className="sys-acc-jauge" aria-hidden="true">
                                      <i className={n === t ? 'est-plein' : ''} style={{ width: `${Math.round((n / t) * 100)}%` }} />
                                    </span>
                                  </button>
                                  {deplie && (
                                    <div className="sys-acc-grp__corps">
                                      {/* LE DÉPARTEMENT ENTIER : c'est le rôle qu'on donne. Un
                                          écran seul reste possible en dessous, pour le réglage fin. */}
                                      <button
                                        className={`sys-acces__chip est-tout ${toutOuvert ? 'is-on' : ''}`}
                                        aria-pressed={toutOuvert}
                                        onClick={() => basculeDepartement(m.user_id, ecrans)}
                                      >
                                        tout le département
                                      </button>
                                      {ecrans.map((it) => {
                                        /* TROIS ÉTATS, ET ON LES DIT — 31 août 2026. Ouvert
                                           d'un clic, ouvert PARCE QUE le domaine entier
                                           l'est, ou fermé. Le deuxième s'éteindra en même
                                           temps que « tout » : le confondre avec le premier
                                           ferait croire à douze réglages posés à la main. */
                                        const ouvertIci = ecranOuvert(m.user_id, it.path, toutOuvert);
                                        const propre = acces[m.user_id]?.[it.path] === true;
                                        const herite = ouvertIci && !propre && !estFermable(it.path);
                                        const barre = estFermable(it.path) && !ouvertIci;
                                        return (
                                          <button
                                            key={it.path}
                                            className={[
                                              'sys-acces__chip',
                                              herite ? 'is-herite' : (ouvertIci ? 'is-on' : ''),
                                              barre ? 'is-barre' : '',
                                            ].filter(Boolean).join(' ')}
                                            aria-pressed={ouvertIci}
                                            onClick={() => basculeEcran(m.user_id, it.path, toutOuvert)}
                                            title={estFermable(it.path)
                                              ? (ouvertIci
                                                ? 'Ouvert d’office ; cliquez pour le fermer à cette personne.'
                                                : 'Fermé à cette personne ; cliquez pour le rouvrir.')
                                              : (herite ? 'Ouvert par le domaine entier' : undefined)}
                                          >
                                            {it.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </section>
                              );
                            })}
                            <div className="sys-acc-note">
                              Sans rien de donné : le Calendrier, Le Fil, Le Tableau et Mon mois, sans les montants. Lui donner
                              <strong> Vente &amp; Caisse</strong> ou <strong>Finances</strong>, ou ouvrir la
                              <strong> Caisse</strong> ou les <strong>Factures</strong>, lui rend aussi les prix.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── PAR ÉCRAN : la même question, prise par l'autre bout ──────
                Qui voit le Coffre-fort ? Y répondre demandait d'ouvrir chaque
                personne, l'une après l'autre, et de retenir. */}
            {vue === 'ecrans' && NAV.map((g) => {
              const ecrans = ecransDuGroupe(g.items);
              const vus = ecrans.filter((it) => !cherche
                || it.label.toLowerCase().includes(cherche) || g.group.toLowerCase().includes(cherche));
              if (!vus.length) return null;
              return vus.map((it) => {
                const dedans = quiAtteint(it.path, ecrans);
                return (
                  <div className="sys-acc-ecran" key={it.path}>
                    <span className="sys-acc-ecran__grp">{g.group}</span>
                    <span className="sys-acc-ecran__nom">{it.label}</span>
                    <span className="sys-acc-ecran__gens">
                      {dedans.length === 0
                        ? <span className="sys-acc-ecran__vide">personne</span>
                        : dedans.map((m) => (
                          <span
                            className={`sys-acc-mini${m.role === 'maitre' ? ' est-maitre' : ''}`}
                            key={m.user_id}
                            title={`${m.name || m.email} · ${ROLE_COURT[m.role] ?? m.role}`}
                          >
                            {initiales(m)}
                          </span>
                        ))}
                    </span>
                  </div>
                );
              });
            })}
          </Card>
        </>
      )}
    </div>
  );
}
