import { useCallback, useEffect, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Input, Select } from '../../../../ds/components';
import { supabase } from '../../../../shared/supabase';
import { useAuth, useStaff } from '../../../../shared/auth';
import './systeme.css';

/* Accès & personnel — le souverain autorise les comptes connectés à entrer dans
   Le Trône, choisit leur rôle, et peut révoquer un accès. Tout passe par des
   fonctions SECURITY DEFINER (migration 0007) qui vérifient elles-mêmes que
   l'appelant est souverain ; sans elles, l'écran reste inerte. */

type Pending = { user_id: string; email: string | null; created_at: string };
type StaffFull = { user_id: string; email: string | null; name: string | null; role: string; rubrics: string[]; created_at: string };
type Role = 'souverain' | 'gerant' | 'maitre';

const ROLE_LABEL: Record<string, string> = {
  souverain: 'Souverain·e — accès total',
  gerant: 'Gérant·e — tout sauf le système',
  maitre: 'Maître — clients & vente',
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
  const [nameFor, setNameFor] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('maitre');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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
    if (!supabase) return;
    if (!window.confirm(`Retirer l'accès de ${m.email ?? m.name ?? 'ce compte'} ? Il pourra se reconnecter mais ne verra plus la Maison.`)) return;
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
        title="Accès & personnel."
        sub="Autorisez les comptes à entrer dans Le Trône et définissez leur rôle. Réservé au souverain."
      />

      {/* Dire VRAI sur la portée : les rôles/rubriques guident l'interface, ils ne
          sont pas une barrière serveur. Sans cette note, on croirait la matrice
          étanche — et on donnerait un accès en pensant cloisonner les finances. */}
      <div style={{ fontSize: 12.5, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '11px 14px', lineHeight: 1.55, marginBottom: 18 }}>
        <b>Portée réelle des rôles.</b> Côté serveur, seule la <b>paie</b> (runs, avances, pointages,
        congés) est réservée au souverain. Le reste des données de la Maison — clientes, rendez-vous,
        factures, dépenses — est accessible à <b>tout compte autorisé ici</b>, quel que soit son rôle :
        n'autorisez que des personnes de confiance. Les rôles et rubriques organisent l'interface,
        ils ne cloisonnent pas les données.
      </div>

      {!supabase ? (
        <Card className="sys-section"><div className="sys-section__cap">Aucun backend configuré — l'accès est géré en local.</div></Card>
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
              Comptes en attente {pending.length > 0 && <span className="sys-badge-count">{pending.length}</span>}
            </div>
            <div className="sys-section__cap">Des personnes se sont connectées mais n'ont pas encore accès. Donnez-leur un rôle pour les faire entrer.</div>

            {loading && <div className="sys-acc-empty">Chargement…</div>}
            {!loading && pending.length === 0 && (
              <div className="sys-acc-empty">Aucun compte en attente. Quand quelqu'un se connectera au Trône, il apparaîtra ici.</div>
            )}
            {pending.map((u) => (
              <div className="sys-acc-row" key={u.user_id}>
                <div className="sys-acc-row__id">
                  <div className="sys-acc-row__email">{u.email ?? '—'}</div>
                  <div className="sys-acc-row__sub">Connecté depuis le {fmtDate(u.created_at)}</div>
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
                  <option value="maitre">Maître — clients & vente</option>
                  <option value="gerant">Gérant·e — tout sauf système</option>
                  <option value="souverain">Souverain·e — accès total</option>
                </Select>
                <Button variant="copper" size="sm" disabled={busy === u.user_id} onClick={() => void authorize(u)}>
                  {busy === u.user_id ? '…' : 'Autoriser'}
                </Button>
              </div>
            ))}
          </Card>

          {/* Personnel autorisé */}
          <Card className="sys-section" style={{ marginTop: 16 }}>
            <div className="sys-section__title">
              Personnel autorisé {team.length > 0 && <span className="sys-badge-count">{team.length}</span>}
            </div>
            <div className="sys-section__cap">Les comptes qui ont accès à la Maison, et leur rôle.</div>

            {!loading && team.length === 0 && <div className="sys-acc-empty">Aucun personnel rattaché.</div>}
            {team.map((m) => {
              const self = m.user_id === myId;
              const lastSouverain = m.role === 'souverain' && team.filter((x) => x.role === 'souverain').length <= 1;
              const editing = editId === m.user_id;
              return (
                <div className="sys-acc-row" key={m.user_id}>
                  <div className="sys-acc-row__id">
                    {editing ? (
                      <Input
                        className="sys-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nom affiché"
                        aria-label="Nom affiché"
                        autoFocus
                      />
                    ) : (
                      <div className="sys-acc-row__email">
                        {m.name || m.email || '—'}{self && <span className="sys-acc-you">vous</span>}
                      </div>
                    )}
                    <div className="sys-acc-row__sub">
                      {m.email}{!editing && ` · ${ROLE_LABEL[m.role] ?? m.role}`}
                    </div>
                  </div>

                  {editing ? (
                    <>
                      <Select
                        className="sys-select sys-acc-row__role"
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as Role)}
                        aria-label="Rôle"
                        disabled={self}
                        title={self ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}
                      >
                        <option value="maitre">Maître — clients & vente</option>
                        <option value="gerant">Gérant·e — tout sauf système</option>
                        <option value="souverain">Souverain·e — accès total</option>
                      </Select>
                      <Button variant="copper" size="sm" disabled={busy === m.user_id} onClick={() => void saveEdit(m)}>
                        {busy === m.user_id ? '…' : 'Enregistrer'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Annuler</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>Modifier</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--trv-error, #b0563e)' }}
                        disabled={busy === m.user_id || self || lastSouverain}
                        title={self ? 'Vous ne pouvez pas retirer votre propre accès.' : lastSouverain ? 'Dernier souverain — accès protégé.' : 'Retirer l’accès'}
                        onClick={() => void revoke(m)}
                      >
                        {busy === m.user_id ? '…' : 'Retirer'}
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
