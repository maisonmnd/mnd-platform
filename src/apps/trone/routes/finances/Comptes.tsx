import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useClients, clientsStore, useFamilies, familiesStore, type Client, type Family,
} from '../../../../shared/clients';
import {
  useCredits, creditMovementsStore, creditBalanceOf, type CreditHolder, type CreditMovement,
} from '../../../../shared/finance';
import { holderOf, holderLabel } from '../../../../shared/accounts';
import { ClientPicker } from '../clients/_shared';
import { todayISO } from './_shared';
import './finances.css';

/* Comptes & Avoirs — les comptes familles (regroupement + parent payeur) et les
   avoirs (crédit prépayé) qui vivent sur ces comptes. Un avoir se verse d'avance
   et se déduit ensuite à l'encaissement d'un rituel ou à la Caisse. */

const frDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Comptes() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [credits] = useCredits();

  const branchClients = useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
  const branchFamilies = useMemo(() => families.filter((f) => f.branchId === branch.id), [families, branch.id]);
  const nameOf = (id?: string) => branchClients.find((c) => c.id === id)?.name ?? '—';

  const balOf = (holder: CreditHolder) => creditBalanceOf(credits, holder);
  const famBalance = (f: Family) => balOf({ type: 'family', id: f.id });
  const membersOf = (f: Family) => branchClients.filter((c) => c.familyId === f.id);

  /* Avoirs individuels : clientes SANS famille qui ont un solde. */
  const soloAvoirs = useMemo(
    () => branchClients
      .filter((c) => !c.familyId && balOf({ type: 'client', id: c.id }) > 0)
      .map((c) => ({ client: c, bal: balOf({ type: 'client', id: c.id }) }))
      .sort((a, b) => b.bal - a.bal),
    [branchClients, credits],
  );

  const totalAvoirs = branchFamilies.reduce((s, f) => s + famBalance(f), 0)
    + soloAvoirs.reduce((s, a) => s + a.bal, 0);
  const activeCount = branchFamilies.filter((f) => famBalance(f) > 0).length + soloAvoirs.length;

  const [famModal, setFamModal] = useState<Family | 'new' | null>(null);
  const [deposit, setDeposit] = useState<{ holder: CreditHolder; kind: 'depot' | 'remboursement' } | null>(null);
  const [ledgerHolder, setLedgerHolder] = useState<CreditHolder | null>(null);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances · comptes & avoirs"
        title="Comptes & Avoirs."
        sub="Regroupez des clientes en comptes familles (le parent paie pour tous) et gérez les avoirs — un crédit versé d'avance, déduit ensuite à l'encaissement d'un rituel ou à la Caisse."
        actions={
          <>
            <Button variant="ghost" onClick={() => setFamModal('new')}>+ Compte famille</Button>
            <Button variant="copper" onClick={() => setDeposit({ holder: { type: 'client', id: '' }, kind: 'depot' })}>+ Verser un avoir</Button>
          </>
        }
      />

      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Avoirs en circulation</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(totalAvoirs, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>crédit prépayé à solder</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Comptes familles</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{branchFamilies.length}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>regroupements de clientes</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Comptes avec avoir</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{activeCount}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>familles + clientes créditées</div>
        </Card>
      </div>

      {/* Comptes familles */}
      <div className="trc-microlabel" style={{ marginBottom: 10 }}>Comptes familles</div>
      {branchFamilies.length === 0 ? (
        <Card style={{ padding: 22 }}>
          <div className="mnd-muted" style={{ fontSize: 13 }}>
            Aucun compte famille. « + Compte famille » regroupe plusieurs clientes (ex. Famille Adamon) sous un parent payeur.
          </div>
        </Card>
      ) : (
        <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
          {branchFamilies.map((f) => {
            const members = membersOf(f);
            const bal = famBalance(f);
            return (
              <Card key={f.id} filet="copper" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>{f.name}</div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      Parent payeur : <b style={{ color: 'var(--copper-700)' }}>{nameOf(f.payerClientId) || 'à désigner'}</b>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: bal > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>{fmtMoney(bal, currency)}</div>
                    <div className="mnd-muted" style={{ fontSize: 10 }}>avoir disponible</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {members.length === 0 && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Aucun membre — ajoutez-en dans « Modifier ».</span>}
                  {members.map((m) => (
                    <span key={m.id} className="trc-chip" style={{ cursor: 'default' }}>
                      {m.name}{m.id === f.payerClientId ? ' · payeur' : ''}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="copper" onClick={() => setDeposit({ holder: { type: 'family', id: f.id }, kind: 'depot' })}>Verser un avoir</Button>
                  <Button size="sm" variant="ghost" onClick={() => setLedgerHolder({ type: 'family', id: f.id })}>Mouvements</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFamModal(f)}>Modifier</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Avoirs individuels (hors famille) */}
      {soloAvoirs.length > 0 && (
        <>
          <div className="trc-microlabel" style={{ margin: '22px 0 10px' }}>Avoirs individuels</div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {soloAvoirs.map(({ client, bal }) => (
              <div key={client.id} className="trf-coffre-row">
                <span className="trf-coffre-row__icon trf-coffre-row__icon--depot">₣</span>
                <span className="trf-coffre-row__main">
                  <span className="trf-coffre-row__title">{client.name}</span>
                  <span className="trf-coffre-row__meta">avoir individuel</span>
                </span>
                <span className="trf-coffre-row__amount trf-coffre-row__amount--depot">{fmtMoney(bal, currency)}</span>
                <button className="trf-coffre-row__del" style={{ opacity: 0.8, fontSize: 11 }} title="Mouvements" onClick={() => setLedgerHolder({ type: 'client', id: client.id })}>voir</button>
              </div>
            ))}
          </Card>
        </>
      )}

      {famModal && (
        <FamilyModal
          family={famModal === 'new' ? null : famModal}
          branchId={branch.id}
          clients={branchClients}
          onClose={() => setFamModal(null)}
        />
      )}
      {deposit && (
        <DepositModal
          initHolder={deposit.holder}
          kind={deposit.kind}
          currency={currency}
          branchId={branch.id}
          clients={branchClients}
          families={branchFamilies}
          credits={credits}
          onClose={() => setDeposit(null)}
        />
      )}
      {ledgerHolder && (
        <LedgerModal
          holder={ledgerHolder}
          title={holderLabel(ledgerHolder, branchClients, branchFamilies)}
          currency={currency}
          credits={credits}
          clients={branchClients}
          onDeposit={(kind) => { setDeposit({ holder: ledgerHolder, kind }); setLedgerHolder(null); }}
          onClose={() => setLedgerHolder(null)}
        />
      )}
    </div>
  );
}

/* ---------- Créer / modifier un compte famille ---------- */
function FamilyModal({
  family, branchId, clients, onClose,
}: {
  family: Family | null;
  branchId: string;
  clients: Client[];
  onClose: () => void;
}) {
  const [name, setName] = useState(family?.name ?? '');
  const [note, setNote] = useState(family?.note ?? '');
  const initMembers = family ? clients.filter((c) => c.familyId === family.id).map((c) => c.id) : [];
  const [memberIds, setMemberIds] = useState<string[]>(initMembers);
  const [payerId, setPayerId] = useState(family?.payerClientId ?? '');
  const [pick, setPick] = useState('');

  const addMember = (id: string) => {
    if (!id || memberIds.includes(id)) return;
    setMemberIds((prev) => [...prev, id]);
    if (!payerId) setPayerId(id);
    setPick('');
  };
  const removeMember = (id: string) => {
    setMemberIds((prev) => prev.filter((x) => x !== id));
    if (payerId === id) setPayerId('');
  };

  const del = () => {
    if (!family) return;
    if (!window.confirm(`Supprimer le compte « ${family.name} » ? Les clientes ne sont pas effacées, seul le regroupement disparaît (leur avoir familial devient inaccessible).`)) return;
    clientsStore.set((prev) => prev.map((c) => (c.familyId === family.id ? { ...c, familyId: undefined } : c)));
    familiesStore.set((prev) => prev.filter((f) => f.id !== family.id));
    onClose();
  };

  const save = () => {
    if (!name.trim()) return;
    const id = family?.id ?? `fam-${uid()}`;
    const rec: Family = { id, branchId, name: name.trim(), payerClientId: payerId || undefined, note: note.trim() || undefined };
    familiesStore.set((prev) => (family ? prev.map((f) => (f.id === id ? rec : f)) : [...prev, rec]));
    /* Rattachements : membres cochés → familyId, retirés → familyId effacé. */
    clientsStore.set((prev) => prev.map((c) => {
      if (memberIds.includes(c.id)) return c.familyId === id ? c : { ...c, familyId: id };
      if (c.familyId === id) return { ...c, familyId: undefined };
      return c;
    }));
    onClose();
  };

  const memberClients = memberIds.map((mid) => clients.find((c) => c.id === mid)).filter((c): c is Client => !!c);

  return (
    <Modal title={family ? 'Modifier le compte famille.' : 'Nouveau compte famille.'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nom du compte">
          <Input value={name} placeholder="Ex. Famille Adamon" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Membres du compte">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memberClients.length === 0 && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Aucun membre pour l'instant — ajoutez les clientes de la famille.</span>}
            {memberClients.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 10px', background: 'var(--surface-card)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--color-indigo)' }}>{m.name}</span>
                <button type="button" className={`tre-chip ${payerId === m.id ? 'is-on' : ''}`} style={{ flex: 'none' }} onClick={() => setPayerId(m.id)}>
                  {payerId === m.id ? '★ payeur' : 'payeur ?'}
                </button>
                <button type="button" aria-label="Retirer" style={{ flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} onClick={() => removeMember(m.id)}>✕</button>
              </div>
            ))}
            <ClientPicker value={pick} onChange={addMember} placeholder="Ajouter une cliente au compte…" />
            <div className="mnd-muted" style={{ fontSize: 10.5 }}>Le parent payeur (★) est celui qui règle les factures du compte.</div>
          </div>
        </Field>
        <Field label="Note · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. mère + 2 filles, règle en une fois chaque mois…" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          {family && <Button variant="ghost" onClick={del} style={{ color: 'var(--copper-700)' }}>Supprimer</Button>}
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={!name.trim()}>
            {family ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Verser / rembourser un avoir ---------- */
function DepositModal({
  initHolder, kind, currency, branchId, clients, families, credits, onClose,
}: {
  initHolder: CreditHolder;
  kind: 'depot' | 'remboursement';
  currency: string;
  branchId: string;
  clients: Client[];
  families: Family[];
  credits: CreditMovement[];
  onClose: () => void;
}) {
  /* Le porteur peut être fixé d'avance (depuis une famille) ou résolu depuis une
     cliente choisie (bouton « Verser un avoir » global). */
  const fixed = initHolder.id !== '';
  const [clientId, setClientId] = useState(initHolder.type === 'client' ? initHolder.id : '');
  const chosenClient = clients.find((c) => c.id === clientId);
  const holder: CreditHolder = fixed
    ? initHolder
    : chosenClient ? holderOf(chosenClient, families) : { type: 'client', id: '' };
  const holderReady = holder.id !== '';
  const balance = holderReady ? creditBalanceOf(credits, holder) : 0;
  const holderName = holder.type === 'family'
    ? families.find((f) => f.id === holder.id)?.name ?? 'Compte famille'
    : clients.find((c) => c.id === holder.id)?.name ?? '';

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const tooMuch = kind === 'remboursement' && amountNum > balance;
  const canSave = holderReady && amountNum > 0 && !tooMuch;

  const save = () => {
    if (!canSave) return;
    creditMovementsStore.set((prev) => [...prev, {
      id: uid(), branchId, holderType: holder.type, holderId: holder.id, kind,
      amountXof: amountNum, date: date || todayISO(), note: note.trim() || undefined,
    }]);
    onClose();
  };

  const title = kind === 'depot' ? 'Verser un avoir.' : 'Rembourser un avoir.';
  return (
    <Modal title={title} onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!fixed && (
          <Field label="Cliente · son compte reçoit l'avoir">
            <ClientPicker value={clientId} onChange={setClientId} placeholder="Choisir la cliente…" />
            {chosenClient && (
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Compte crédité : <b style={{ color: 'var(--color-indigo)' }}>{holderName}</b>
                {holder.type === 'family' ? ' (compte famille)' : ' (compte individuel)'}
              </div>
            )}
          </Field>
        )}
        {holderReady && (
          <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)' }}>
            <div className="mnd-muted" style={{ fontSize: 12 }}>
              {holderName} · avoir actuel : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(balance, currency)}</b>
            </div>
          </div>
        )}
        <Field label={`Montant ${kind === 'depot' ? 'versé' : 'remboursé'} (${currency})`}>
          <Input inputMode="numeric" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          {tooMuch && <div style={{ fontSize: 11.5, color: '#8f3b30', marginTop: 6 }}>Le remboursement dépasse l'avoir disponible.</div>}
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note · facultatif">
          <Textarea rows={2} value={note} placeholder={kind === 'depot' ? 'Ex. acompte de la famille pour le mois…' : 'Ex. solde rendu en espèces…'} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant={kind === 'depot' ? 'copper' : 'ghost'} style={{ flex: 1 }} onClick={save} disabled={!canSave}>
            {kind === 'depot' ? `Verser ${amountNum > 0 ? fmtMoney(amountNum, currency) : ''}` : `Rembourser ${amountNum > 0 && !tooMuch ? fmtMoney(amountNum, currency) : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Registre des mouvements d'un compte ---------- */
function LedgerModal({
  holder, title, currency, credits, clients, onDeposit, onClose,
}: {
  holder: CreditHolder;
  title: string;
  currency: string;
  credits: CreditMovement[];
  clients: Client[];
  onDeposit: (kind: 'depot' | 'remboursement') => void;
  onClose: () => void;
}) {
  const rows = credits
    .filter((m) => m.holderType === holder.type && m.holderId === holder.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const balance = creditBalanceOf(credits, holder);
  const nameOf = (id?: string) => clients.find((c) => c.id === id)?.name;
  const label = (m: CreditMovement) =>
    m.kind === 'depot' ? 'Dépôt d’avoir'
    : m.kind === 'remboursement' ? 'Remboursement'
    : `Réglé${m.forClientId ? ` · ${nameOf(m.forClientId) ?? 'membre'}` : ''}`;

  return (
    <Modal title={`Avoir · ${title}`} onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mnd-muted" style={{ fontSize: 12 }}>Solde d'avoir</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>{fmtMoney(balance, currency)}</span>
        </div>
        {rows.length === 0 ? (
          <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucun mouvement pour ce compte.</div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {rows.map((m) => (
              <div key={m.id} className="trf-coffre-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span className={`trf-coffre-row__icon trf-coffre-row__icon--${m.kind === 'depot' ? 'depot' : 'virement'}`}>{m.kind === 'depot' ? '↑' : '↓'}</span>
                <span className="trf-coffre-row__main">
                  <span className="trf-coffre-row__title">{label(m)}</span>
                  <span className="trf-coffre-row__meta">{frDay(m.date)}{m.note ? ` · ${m.note}` : ''}</span>
                </span>
                <span className={`trf-coffre-row__amount trf-coffre-row__amount--${m.kind === 'depot' ? 'depot' : 'virement'}`}>
                  {m.kind === 'depot' ? '+' : '−'}{fmtMoney(m.amountXof, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <Button variant="copper" style={{ flex: 1 }} onClick={() => onDeposit('depot')}>Verser</Button>
          <Button variant="ghost" onClick={() => onDeposit('remboursement')} disabled={balance <= 0}>Rembourser</Button>
        </div>
      </div>
    </Modal>
  );
}
