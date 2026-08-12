import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useClients, clientsStore, useFamilies, familiesStore, remiseFamillePct, REMISE_FAMILLE_DEFAUT,
  type Client, type Family,
} from '../../../../shared/clients';
import {
  useCredits, creditMovementsStore, creditBalanceOf, useInvoices, invoicesStore, invoiceTotal,
  type CreditHolder, type CreditMovement, type Invoice,
} from '../../../../shared/finance';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { holderOf, holderLabel } from '../../../../shared/accounts';
import { ClientPicker, apptDueXof, apptLabel, useServicesById } from '../clients/_shared';
import { PayAppointmentModal } from '../clients/actions';
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
  /* La cliente d'où l'on vient, quand on arrive depuis sa fiche : elle devient
     membre et parent payeur du compte qui s'ouvre. */
  const [prefill, setPrefill] = useState<Client | null>(null);

  /* ARRIVÉE DEPUIS UNE FICHE. Le lien « Rattacher un enfant » y mène ici avec le
     compte visé — sinon il faudrait le retrouver parmi tous, et le geste se
     perdrait en route. Le paramètre est effacé aussitôt : recharger la page ne
     doit pas rouvrir une modale qu'on vient de fermer. */
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const fid = params.get('famille');
    const pid = params.get('parent');
    if (!fid && !pid) return;
    const famille = fid ? branchFamilies.find((f) => f.id === fid) : undefined;
    const parent = pid ? branchClients.find((c) => c.id === pid) : undefined;
    /* Ni l'un ni l'autre trouvé : les données ne sont peut-être pas encore
       chargées. On ne touche à rien, l'effet repassera. */
    if (!famille && !parent) return;
    if (famille) setFamModal(famille);
    else { setFamModal('new'); setPrefill(parent ?? null); }
    setParams({}, { replace: true });
  }, [params, branchFamilies, branchClients, setParams]);
  const [deposit, setDeposit] = useState<{ holder: CreditHolder; kind: 'depot' | 'remboursement' } | null>(null);
  const [ledgerHolder, setLedgerHolder] = useState<CreditHolder | null>(null);
  /* Impayés d'un compte (RDV dus + factures envoyées de ses membres) — pour les
     solder directement par l'avoir. */
  const [unpaidFor, setUnpaidFor] = useState<CreditHolder | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const byId = useServicesById();

  /** Les membres d'un compte : les clientes de la famille, ou la cliente seule. */
  const membersOfHolder = (holder: CreditHolder): Client[] =>
    holder.type === 'family'
      ? branchClients.filter((c) => c.familyId === holder.id)
      : branchClients.filter((c) => c.id === holder.id);

  /** Impayés d'un compte : rituels avec un reste dû + factures « envoyées ». */
  const unpaidOfHolder = (holder: CreditHolder) => {
    const ids = new Set(membersOfHolder(holder).map((c) => c.id));
    const dueAppts = appts
      .filter((a) => a.branchId === branch.id && ids.has(a.clientId) && a.status !== 'annulé' && apptDueXof(a, byId) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const linked = new Set(appts.filter((a) => a.invoiceId).map((a) => a.invoiceId));
    const dueInvoices = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'envoyée'
        && (ids.has(i.clientId) || (i.forClientId ? ids.has(i.forClientId) : false)))
      .map((i) => ({ inv: i, linkedToAppt: linked.has(i.id) }));
    return { dueAppts, dueInvoices };
  };

  /* Solder une facture « envoyée » PAR L'AVOIR : la facture passe payée (paiement
     « Avoir », avoirXof = total → jamais créditée à une caisse physique) et une
     écriture d'usage débite le compte. Réservé aux factures NON liées à un rituel
     (celles-là se soldent par « Encaisser le rituel » — invariant deux-registres). */
  const settleInvoiceByAvoir = (inv: Invoice, holder: CreditHolder) => {
    const total = invoiceTotal(inv);
    const bal = creditBalanceOf(credits, holder);
    if (total <= 0 || bal < total) return;
    if (!window.confirm(`Solder la facture ${inv.number} (${fmtMoney(total, currency)}) par l'avoir du compte ? Le solde d'avoir passera à ${fmtMoney(bal - total, currency)}.`)) return;
    invoicesStore.set((prev) => prev.map((x) => (x.id === inv.id ? { ...x, status: 'payée', payment: 'Avoir', avoirXof: total } : x)));
    creditMovementsStore.set((prev) => [...prev, {
      id: uid(), branchId: branch.id, holderType: holder.type, holderId: holder.id,
      kind: 'usage', amountXof: total, date: todayISO(),
      forClientId: inv.forClientId ?? inv.clientId ?? undefined, invoiceId: inv.id,
    }]);
  };

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
                  <Button size="sm" variant="ghost" onClick={() => setUnpaidFor({ type: 'family', id: f.id })}>Impayés</Button>
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
                <button className="trf-coffre-row__del" style={{ opacity: 0.8, fontSize: 11 }} title="Impayés du compte" onClick={() => setUnpaidFor({ type: 'client', id: client.id })}>impayés</button>
                <button className="trf-coffre-row__del" style={{ opacity: 0.8, fontSize: 11 }} title="Mouvements" onClick={() => setLedgerHolder({ type: 'client', id: client.id })}>voir</button>
              </div>
            ))}
          </Card>
        </>
      )}

      {famModal && (
        <FamilyModal
          family={famModal === 'new' ? null : famModal}
          parent={famModal === 'new' ? prefill : null}
          branchId={branch.id}
          clients={branchClients}
          credits={credits}
          currency={currency}
          onClose={() => { setFamModal(null); setPrefill(null); }}
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

      {/* ===== IMPAYÉS DU COMPTE — solder par l'avoir ===== */}
      {unpaidFor && (() => {
        const holder = unpaidFor;
        const bal = balOf(holder);
        const { dueAppts, dueInvoices } = unpaidOfHolder(holder);
        const nm = (id: string) => branchClients.find((c) => c.id === id)?.name ?? 'Cliente';
        return (
          <Modal title={`Impayés · ${holderLabel(holder, branchClients, branchFamilies)}`} onClose={() => setUnpaidFor(null)} width={560}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mnd-muted" style={{ fontSize: 12 }}>Avoir disponible pour solder</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: bal > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>{fmtMoney(bal, currency)}</span>
              </div>

              {dueAppts.length === 0 && dueInvoices.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucun impayé sur ce compte — tout est réglé.</div>
              )}

              {dueAppts.length > 0 && (
                <div>
                  <div className="trc-microlabel" style={{ marginBottom: 8 }}>Rituels avec un reste dû · {dueAppts.length}</div>
                  {dueAppts.map((a) => (
                    <div key={a.id} className="trf-coffre-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <span className="trf-coffre-row__main">
                        <span className="trf-coffre-row__title">{nm(a.clientId)} · {apptLabel(a, byId)}</span>
                        <span className="trf-coffre-row__meta">{a.date} · {a.time} · {a.master}</span>
                      </span>
                      <span className="trf-coffre-row__amount trf-coffre-row__amount--virement">reste {fmtMoney(apptDueXof(a, byId), currency)}</span>
                      {/* Encaisser ouvre la modale habituelle — le champ « Régler par
                          l'avoir » y est, la facture sort au parent payeur. */}
                      <Button size="sm" variant="copper" onClick={() => { setUnpaidFor(null); setPayAppt(a); }}>Encaisser</Button>
                    </div>
                  ))}
                </div>
              )}

              {dueInvoices.length > 0 && (
                <div>
                  <div className="trc-microlabel" style={{ marginBottom: 8 }}>Factures impayées · {dueInvoices.length}</div>
                  {dueInvoices.map(({ inv, linkedToAppt }) => {
                    const total = invoiceTotal(inv);
                    const canSettle = !linkedToAppt && total > 0 && bal >= total;
                    return (
                      <div key={inv.id} className="trf-coffre-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                        <span className="trf-coffre-row__main">
                          <span className="trf-coffre-row__title">{inv.number} · {inv.clientName ?? nm(inv.clientId)}</span>
                          <span className="trf-coffre-row__meta">{inv.date}{linkedToAppt ? ' · liée à un rituel — encaissez le rituel ci-dessus' : ''}</span>
                        </span>
                        <span className="trf-coffre-row__amount trf-coffre-row__amount--virement">{fmtMoney(total, currency)}</span>
                        {!linkedToAppt && (
                          <Button
                            size="sm"
                            variant="copper"
                            disabled={!canSettle}
                            title={canSettle ? undefined : bal < total ? 'Avoir insuffisant — versez d’abord' : undefined}
                            onClick={() => { settleInvoiceByAvoir(inv, holder); }}
                          >
                            Solder par l’avoir
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}

/* ---------- Créer / modifier un compte famille ---------- */
function FamilyModal({
  family, parent, branchId, clients, credits, currency, onClose,
}: {
  family: Family | null;
  /* La cliente d'où l'on vient, quand le compte s'ouvre depuis sa fiche. */
  parent?: Client | null;
  branchId: string;
  clients: Client[];
  credits: CreditMovement[];
  currency: string;
  onClose: () => void;
}) {
  /* Le libellé part de son nom À ELLE — c'est son compte, et il se corrige juste
     au-dessus. Les enfants, eux, portent le nom de leur père : rien ici ne
     nomme personne d'autre. */
  const nomDeFamille = parent?.name.trim().split(/\s+/).slice(-1)[0] ?? '';
  const [name, setName] = useState(family?.name ?? (nomDeFamille ? `Famille ${nomDeFamille}` : ''));
  const [note, setNote] = useState(family?.note ?? '');
  /* L'avoir du compte, visible et AJUSTABLE ici même : saisir le solde voulu écrit
     une écriture de correction (dépôt ou remboursement de la différence) — jamais
     de mutation silencieuse du registre. */
  const famBalance = family ? creditBalanceOf(credits, { type: 'family', id: family.id }) : 0;
  const [balDraft, setBalDraft] = useState('');
  const balTarget = parseInt(balDraft.replace(/[^0-9]/g, ''), 10);
  const balDiff = Number.isFinite(balTarget) ? balTarget - famBalance : 0;
  const adjustBalance = () => {
    if (!family || !Number.isFinite(balTarget) || balTarget < 0 || balDiff === 0) return;
    creditMovementsStore.set((prev) => [...prev, {
      id: uid(), branchId, holderType: 'family', holderId: family.id,
      kind: balDiff > 0 ? 'depot' : 'remboursement', amountXof: Math.abs(balDiff),
      date: todayISO(), note: 'Ajustement manuel du solde',
    }]);
    setBalDraft('');
  };
  const initMembers = family
    ? clients.filter((c) => c.familyId === family.id).map((c) => c.id)
    : (parent ? [parent.id] : []);
  const [memberIds, setMemberIds] = useState<string[]>(initMembers);
  const [payerId, setPayerId] = useState(family?.payerClientId ?? parent?.id ?? '');
  const [pick, setPick] = useState('');
  /* La remise famille du compte — le juge (`remiseFamillePct`) donne le défaut
     de la Maison quand le compte est muet ; ici on ÉCRIT toujours le taux
     choisi, pour que le compte dise lui-même son avantage. */
  const [remiseStr, setRemiseStr] = useState(String(family ? remiseFamillePct(family) : REMISE_FAMILLE_DEFAUT));
  const remiseNum = Math.max(0, Math.min(100, Math.round(Number(remiseStr.replace(/[^0-9]/g, '')) || 0)));

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
    const rec: Family = { id, branchId, name: name.trim(), payerClientId: payerId || undefined, note: note.trim() || undefined, remisePct: remiseNum };
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
            {/* `allowPassage` : un membre de la famille sans fiche (un enfant,
                un conjoint jamais venu) se crée ICI — prénom + téléphone — et
                rejoint le compte dans le même geste. La fiche naît « de
                passage », comme toute fiche créée depuis le Trône ; sa place
                à la Maison se constate à sa première venue. */}
            <ClientPicker value={pick} onChange={addMember} allowPassage placeholder="Ajouter une cliente au compte…" />
            <div className="mnd-muted" style={{ fontSize: 10.5 }}>Le parent payeur (★) est celui qui règle les factures du compte.</div>
          </div>
        </Field>
        <Field label="Remise famille">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[15, 18, 20].map((p) => (
              <button key={p} type="button" className={`tre-chip ${remiseNum === p ? 'is-on' : ''}`} onClick={() => setRemiseStr(String(p))}>
                −{p}%
              </button>
            ))}
            <Input
              inputMode="numeric"
              value={remiseStr}
              onChange={(e) => setRemiseStr(e.target.value.replace(/[^0-9]/g, ''))}
              style={{ width: 68, textAlign: 'right' }}
              aria-label="Remise famille en pourcentage"
            />
            <span className="mnd-muted" style={{ fontSize: 11.5 }}>%</span>
          </div>
          <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
            L'avantage du compte : posée d'office sur les rendez-vous de chaque membre, et
            nommée « Remise famille » jusqu'à la facture. 0 = pas de remise pour ce compte.
          </div>
        </Field>
        {family && (
          <Field label="Avoir du compte">
            <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span className="mnd-muted" style={{ fontSize: 12 }}>Solde disponible</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: famBalance > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>{fmtMoney(famBalance, currency)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input
                  inputMode="numeric"
                  value={balDraft}
                  placeholder={String(famBalance)}
                  onChange={(e) => setBalDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{ width: 130, textAlign: 'right' }}
                  aria-label="Nouveau solde d'avoir"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!Number.isFinite(balTarget) || balDiff === 0}
                  onClick={adjustBalance}
                  title={balDiff !== 0 && Number.isFinite(balTarget) ? `${balDiff > 0 ? 'Dépôt' : 'Remboursement'} de ${fmtMoney(Math.abs(balDiff), currency)} (ajustement)` : undefined}
                >
                  Ajuster le solde
                </Button>
                <span className="mnd-muted" style={{ fontSize: 10.5 }}>
                  saisir le solde voulu — l’écart s’écrit comme {balDiff >= 0 ? 'un dépôt' : 'un remboursement'} d’ajustement, tracé au registre.
                </span>
              </div>
            </div>
          </Field>
        )}
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
