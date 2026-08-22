import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  useCredits, creditMovementsStore, creditBalanceOf, useInvoices, invoicesStore, invoiceTotal, invoiceResteXof, useCashboxes, cashboxCurrency,
  caissesEnDevise, motDesCaissesEnDevise,
  type CreditHolder, type CreditMovement, type Invoice,
} from '../../../../shared/finance';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { holderOf, holderLabel, estMineur, ageDe } from '../../../../shared/accounts';
import { ClientPicker, apptDueXof, apptLabel, useServicesById } from '../clients/_shared';
import { PayAppointmentModal } from '../clients/actions';
import { todayISO } from './_shared';

/** Le genre d'un emprunteur, en français — ce que l'œil lit sur la carte. */
const LIBELLE_GENRE: Record<GenreEmprunteur, string> = {
  foyer: 'foyer', associe: 'associé', equipe: 'équipe', cliente: 'cliente', tiers: 'tiers',
};

const frJour = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
import { usePrets, soldesParEmprunteur, detteEnCours, type GenreEmprunteur, type Pret } from '../../../../shared/foyer';
import './finances.css';

/* Comptes & Avoirs — les comptes familles (regroupement + parent payeur) et les
   avoirs (crédit prépayé) qui vivent sur ces comptes. Un avoir se verse d'avance
   et se déduit ensuite à l'encaissement d'un rituel ou à la Caisse. */

const frDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/* LA REMISE SE CHANGE SUR LA CARTE (14 août, demande de Yéman) — sans ouvrir
   le foyer. Elle s'écrit à la frappe, comme les Paramètres : rien à valider.
   Le champ libre COMMET AU REPOS (Entrée, ou quand on le quitte) — écrire à
   chaque frappe ferait passer « 22 » par « 2 », et le compte aurait vécu une
   seconde à 2 %. */
function RemiseSurCarte({ famille, autoPct, onClose }: {
  famille: Family;
  autoPct: number;
  onClose: () => void;
}) {
  const pose = (v: number | undefined) =>
    familiesStore.set((prev) => prev.map((f) => (f.id === famille.id ? { ...f, remisePct: v } : f)));
  const [libre, setLibre] = useState(famille.remisePct === undefined ? '' : String(famille.remisePct));
  const commit = () => {
    const n = libre.replace(/[^0-9]/g, '');
    if (n === '') return;
    pose(Math.max(0, Math.min(100, parseInt(n, 10))));
  };
  const estAuto = famille.remisePct === undefined;
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--copper-300)', borderRadius: 3, background: 'var(--surface-card)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`tre-chip ${estAuto ? 'is-on' : ''}`}
          onClick={() => { pose(undefined); setLibre(''); }}
          title="1 enfant → 10 % · 2 et plus → 15 % — le taux suit la famille"
        >
          Barème · −{autoPct}%
        </button>
        {[10, 15, 18, 20].map((p) => (
          <button
            key={p}
            type="button"
            className={`tre-chip ${!estAuto && famille.remisePct === p ? 'is-on' : ''}`}
            onClick={() => { pose(p); setLibre(String(p)); }}
          >
            −{p}%
          </button>
        ))}
        <Input
          inputMode="numeric"
          value={libre}
          placeholder="—"
          onChange={(e) => setLibre(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: 62, textAlign: 'right' }}
          aria-label={`Remise personnalisée de ${famille.name}`}
        />
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>%</span>
        <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => { commit(); onClose(); }}>Fermer</Button>
      </div>
      <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>
        {estAuto
          ? <>Le barème suit le foyer — un enfant de plus, et le taux monte. Un taux à la main devient une remise personnalisée.</>
          : <>Remise personnalisée — la main fait foi (0 = pas de remise). Posée hors forfaits, déjà réduits.</>}
      </div>
    </div>
  );
}

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

  /* DEUX REGISTRES, JAMAIS MÊLÉS (14 août — la page mêlait le foyer et
     l'argent : seize cartes annonçaient « 0 F » pour qu'une seule dise un
     solde). On ouvre sur les foyers : c'est ce qu'on vient chercher. */
  const [registre, setRegistre] = useState<'foyers' | 'avoirs' | 'prets'>('foyers');

  /* ── LES PRÊTS — 22 août 2026 ───────────────────────────────────────
     « Comment contrôler les prêts et les remboursements ? »

     Le registre vivait dans Salon & Foyer, qui est l'affaire du foyer. Or une
     avance sur salaire est l'affaire de la MAISON : sa place est ici, auprès
     des avoirs, avec lesquels il forme la paire — un avoir est de l'argent que
     la cliente a déjà remis, un prêt est de l'argent qu'elle doit. Deux sens
     opposés, un même écran : ce que la Maison doit, et ce qu'on lui doit.

     Salon & Foyer garde sa conversion « dépassement du mois → prêt » : ce
     mouvement-là reste un geste du foyer. */
  const [prets, setPrets] = usePrets();
  const soldes = useMemo(() => soldesParEmprunteur(prets, branch.id), [prets, branch.id]);
  const dette = detteEnCours(prets, branch.id);
  const [pretOuvert, setPretOuvert] = useState(false);
  /* CORRIGER OU EFFACER UNE LIGNE DE PRÊT — 22 août 2026. Une ligne posée sur
     la mauvaise caisse déplaçait de l’argent qui n’a jamais bougé, et rien ne
     permettait de la reprendre. Même modale que la saisie : deux formulaires
     pour une même écriture finissent toujours par se contredire. */
  const [pretEdite, setPretEdite] = useState<Pret | null>(null);
  const corrigerLePret = (p: Pret) => {
    setFPret({
      type: p.type,
      genre: (p.genre ?? 'tiers') as GenreEmprunteur,
      nom: p.associe, personneId: p.personneId ?? '',
      motif: p.motif ?? '', montant: String(p.amountXof),
      cashbox: p.cashbox ?? '', method: p.method ?? 'Espèces', date: p.date.slice(0, 10),
    });
    setPretEdite(p);
  };
  const effacerLePret = () => {
    if (!pretEdite) return;
    setPrets((prev) => prev.filter((x) => x.id !== pretEdite.id));
    setPretEdite(null);
  };
  const [fPret, setFPret] = useState({
    type: 'pret' as 'pret' | 'remboursement',
    genre: 'equipe' as GenreEmprunteur,
    nom: '', personneId: '', motif: '', montant: '',
    cashbox: '', method: 'Espèces', date: todayISO(),
  });
  const [toutesCaisses] = useCashboxes();
  const caissesMaison = toutesCaisses.filter((c) => c.branchId === branch.id && cashboxCurrency(c) === currency);
  const caissesAutresDevises = caissesEnDevise(toutesCaisses, branch.id, currency);

  const enregistrerPret = () => {
    const montant = parseInt(fPret.montant.replace(/[^0-9]/g, ''), 10) || 0;
    const nom = fPret.nom.trim();
    if (!nom || montant <= 0) return;
    const ligne: Pret = {
      id: `prt-${uid()}`,
      branchId: branch.id,
      date: fPret.date || todayISO(),
      type: fPret.type,
      associe: nom,
      motif: fPret.motif.trim() || (fPret.type === 'pret' ? 'Prêt' : 'Remboursement'),
      amountXof: montant,
      genre: fPret.genre,
      personneId: fPret.personneId || undefined,
      /* LA CAISSE EST LE POINT DE TOUTE CETTE PIÈCE : sans elle, prêter
         200 000 F ne les retire d'aucun tiroir, et les mêmes francs vivent
         dans la caisse ET chez l'emprunteur. */
      cashbox: fPret.cashbox || undefined,
      method: fPret.method || undefined,
    };
    if (pretEdite) {
      /* L’IDENTIFIANT NE BOUGE PAS : le journal des gestes suit la pièce par
         lui, et une correction doit rester la MÊME écriture, corrigée. */
      setPrets((prev) => prev.map((x) => (x.id === pretEdite.id ? { ...ligne, id: pretEdite.id } : x)));
      setPretEdite(null);
      setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '' }));
      return;
    }
    setPrets((prev) => [...prev, ligne]);
    setPretOuvert(false);
    setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '' }));
  };
  /* La remise s'ouvre sur la carte ; les gestes rares sous les trois points. */
  const [remiseOuverte, setRemiseOuverte] = useState<string | null>(null);
  const [plusOuvert, setPlusOuvert] = useState<string | null>(null);

  const [famModal, setFamModal] = useState<Family | 'new' | null>(null);
  /* La cliente d'où l'on vient, quand on arrive depuis sa fiche : elle devient
     membre et parent payeur du compte qui s'ouvre. */
  const [prefill, setPrefill] = useState<Client | null>(null);

  /* ARRIVÉE DEPUIS UNE FICHE. Le lien « Rattacher un enfant » y mène ici avec le
     compte visé — sinon il faudrait le retrouver parmi tous, et le geste se
     perdrait en route. Le paramètre est effacé aussitôt : recharger la page ne
     doit pas rouvrir une modale qu'on vient de fermer. */
  const [params, setParams] = useSearchParams();
  /* ARRIVÉE DEPUIS LE REGISTRE DES ENCAISSEMENTS — 22 août 2026. La ligne y
     est en lecture seule ; « Corriger » mène ici, à la pièce, et ouvre la
     modale sur elle. Le paramètre est effacé aussitôt : recharger ne doit pas
     rouvrir une modale qu’on vient de fermer. */
  useEffect(() => {
    const aid = params.get('avoir');
    if (!aid) return;
    const m = credits.find((x) => x.id === aid);
    if (m) {
      setDeposit({ holder: { type: m.holderType, id: m.holderId }, kind: m.kind === 'remboursement' ? 'remboursement' : 'depot', edite: m });
      setRegistre('avoirs');
    }
    const p2 = new URLSearchParams(params);
    p2.delete('avoir');
    setParams(p2, { replace: true });
  }, [params, credits, setParams]);

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
  const [deposit, setDeposit] = useState<{ holder: CreditHolder; kind: 'depot' | 'remboursement'; edite?: CreditMovement } | null>(null);
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
    /* CE QUI RESTE DÛ, pas le total : une pièce déjà réglée à moitié ne se
       solde que de son solde, sinon l'avoir paierait deux fois la même part. */
    const total = invoiceResteXof(inv);
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

  /* CE QUI PRESSE — les foyers dont la payeuse n'a pas d'adresse : ils ne se
     retrouveront pas sur Ma Couronne (l'adoption se fait par l'adresse). */
  const sansAdresse = branchFamilies.filter((f) => {
    const p = branchClients.find((c) => c.id === f.payerClientId);
    return p && !p.authUserId && !(p.email ?? '').trim();
  }).length;

  /* Le registre de l'argent — familles créditées ET clientes seules, mêlées :
     un porteur, un solde. Le dernier mouvement dit si le solde dort. */
  const lignesAvoirs = useMemo(() => {
    const dernier = (h: CreditHolder) => credits
      .filter((m) => m.holderType === h.type && m.holderId === h.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const desFamilles = branchFamilies
      .map((f) => ({ holder: { type: 'family' as const, id: f.id }, nom: f.name, sous: `Compte famille · payeuse ${nameOf(f.payerClientId)}`, bal: famBalance(f) }))
      .filter((r) => r.bal > 0);
    const desClientes = soloAvoirs
      .map(({ client, bal }) => ({ holder: { type: 'client' as const, id: client.id }, nom: client.name, sous: 'Cliente · avoir individuel', bal }));
    return [...desFamilles, ...desClientes]
      .map((r) => ({ ...r, mvt: dernier(r.holder) }))
      .sort((a, b) => b.bal - a.bal);
  }, [branchFamilies, soloAvoirs, credits, branchClients]);

  const MOT_MVT: Record<string, string> = { depot: 'Dépôt', usage: 'Usage', remboursement: 'Remboursement' };

  /* ── LES AVOIRS ÉPUISÉS GARDENT LEUR HISTOIRE — 20 août 2026 ──────
     « Quand l'avoir est à 0, c'est passé. Mais besoin de voir comment a été
     utilisé l'avoir du client. » L'onglet ne listait que les soldes
     positifs : un avoir consommé disparaissait AVEC tout son registre —
     précisément ce qu'on veut relire (qui a versé, quels rituels l'ont
     consommé, quand). Un porteur qui a EU des mouvements garde sa ligne,
     à zéro, avec la porte vers son registre. */
  const avoirsEteints = useMemo(() => {
    const aBouge = (h: CreditHolder) => credits.some((m) => m.holderType === h.type && m.holderId === h.id);
    const dernier = (h: CreditHolder) => credits
      .filter((m) => m.holderType === h.type && m.holderId === h.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const totalVerse = (h: CreditHolder) => credits
      .filter((m) => m.holderType === h.type && m.holderId === h.id && m.kind === 'depot')
      .reduce((s, m) => s + m.amountXof, 0);
    const desFamilles = branchFamilies
      .map((f) => ({ holder: { type: 'family' as const, id: f.id }, nom: f.name }))
      .filter((r) => famBalance(branchFamilies.find((f) => f.id === r.holder.id)!) === 0 && aBouge(r.holder));
    const desClientes = branchClients
      .filter((c) => !c.familyId)
      .map((c) => ({ holder: { type: 'client' as const, id: c.id }, nom: c.name }))
      .filter((r) => balOf(r.holder) === 0 && aBouge(r.holder));
    return [...desFamilles, ...desClientes]
      .map((r) => ({ ...r, mvt: dernier(r.holder), verse: totalVerse(r.holder) }))
      .sort((a, b) => (b.mvt?.date ?? '').localeCompare(a.mvt?.date ?? ''));
  }, [branchFamilies, branchClients, credits]);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances"
        title={registre === 'foyers' ? 'Les foyers.' : registre === 'prets' ? 'Les prêts.' : 'Les avoirs.'}
        sub={registre === 'foyers'
          ? "Un foyer regroupe une famille sous un parent payeur : il règle pour tous, la remise s'applique d'office, et les enfants le suivent sur Ma Couronne."
          : registre === 'prets'
            ? "Ce que la Maison a prêté et ce qu'on lui doit encore. Un prêt sort d'une caisse, un remboursement y rentre — l'argent se déplace, il ne se duplique pas."
            : "Un crédit versé d'avance, déduit ensuite à l'encaissement d'un rituel ou à la Caisse. Seuls les porteurs qui ont un solde figurent ici."}
        actions={registre === 'foyers'
          ? <Button variant="copper" onClick={() => setFamModal('new')}>+ Compte famille</Button>
          : registre === 'prets'
            ? <Button variant="copper" onClick={() => setPretOuvert(true)}>+ Prêt ou remboursement</Button>
            : <Button variant="copper" onClick={() => setDeposit({ holder: { type: 'client', id: '' }, kind: 'depot' })}>+ Verser un avoir</Button>}
      />

      {/* Les deux registres — le foyer d'un côté, l'argent de l'autre. */}
      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--hairline)', margin: '0 0 18px' }}>
        {([
          { k: 'foyers' as const, mot: 'Les foyers', n: String(branchFamilies.length) },
          { k: 'avoirs' as const, mot: 'Les avoirs', n: fmtMoney(totalAvoirs, currency) },
          { k: 'prets' as const, mot: 'Les prêts', n: fmtMoney(dette, currency) },
        ]).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setRegistre(t.k)}
            aria-current={registre === t.k ? 'page' : undefined}
            style={{
              appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
              padding: '10px 2px', display: 'inline-flex', alignItems: 'baseline', gap: 9,
              fontSize: 14.5, color: registre === t.k ? 'var(--color-indigo)' : 'var(--ink-soft)',
              fontWeight: registre === t.k ? 600 : 400,
              borderBottom: `2px solid ${registre === t.k ? 'var(--color-copper)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t.mot}
            <span style={{
              fontSize: 11, letterSpacing: '.02em',
              color: registre === t.k ? 'var(--copper-700)' : 'var(--ink-soft)',
              border: `1px solid ${registre === t.k ? 'var(--copper-300)' : 'var(--hairline)'}`,
              borderRadius: 999, padding: '1px 9px',
            }}>{t.n}</span>
          </button>
        ))}
      </div>

      {/* ══════════ LES FOYERS ══════════ */}
      {registre === 'foyers' && (
        <>
          {sansAdresse > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: 'var(--copper-50, #F7EDE4)', border: '1px solid var(--copper-300)',
              borderRadius: 3, padding: '11px 14px', marginBottom: 16, fontSize: 13,
            }}>
              <span>
                <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>{sansAdresse} foyer{sansAdresse > 1 ? 's' : ''}</b> n’{sansAdresse > 1 ? 'ont' : 'a'} pas
                l’adresse de {sansAdresse > 1 ? 'leur' : 'sa'} payeuse — {sansAdresse > 1 ? 'leurs' : 'ses'} enfants resteront invisibles sur Ma Couronne.
              </span>
            </div>
          )}

          {branchFamilies.length === 0 ? (
            <Card style={{ padding: 22 }}>
              <div className="mnd-muted" style={{ fontSize: 13 }}>
                Aucun foyer. « + Compte famille » regroupe plusieurs clientes sous un parent payeur.
              </div>
            </Card>
          ) : (
            <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
              {branchFamilies.map((f) => {
                const members = membersOf(f);
                const bal = famBalance(f);
                const payeuse = branchClients.find((c) => c.id === f.payerClientId);
                const autres = members.filter((m) => m.id !== f.payerClientId);
                const mineurs = autres.filter((m) => estMineur(m, todayISO())).length;
                const autoPct = mineurs >= 2 ? 15 : mineurs === 1 ? 10 : 0;
                const pct = remiseFamillePct(f, branchClients, todayISO());
                const sansNaissance = autres.filter((m) => !(m.birthday ?? '').trim()).length;
                const adresseAbsente = !!payeuse && !payeuse.authUserId && !(payeuse.email ?? '').trim();
                return (
                  <Card key={f.id} filet="indigo" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)', minWidth: 0 }}>{f.name}</div>
                      {/* LA REMISE EN TÊTE — et modifiable ici même. */}
                      <button
                        type="button"
                        onClick={() => setRemiseOuverte(remiseOuverte === f.id ? null : f.id)}
                        title={f.remisePct === undefined ? 'Barème du foyer — toucher pour changer' : 'Remise personnalisée — toucher pour changer'}
                        style={{
                          flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600,
                          letterSpacing: '.03em', borderRadius: 999, padding: '3px 11px',
                          color: pct > 0 ? 'var(--copper-700)' : 'var(--ink-soft)',
                          background: pct > 0 ? 'var(--copper-50, #F7EDE4)' : 'transparent',
                          border: `1px solid ${pct > 0 ? 'var(--copper-300)' : 'var(--hairline)'}`,
                        }}
                      >
                        {pct > 0 ? `−${pct} %` : 'aucune'}
                      </button>
                    </div>

                    <div className="mnd-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      ★ <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>{nameOf(f.payerClientId) || 'payeur à désigner'}</b> règle pour tous
                    </div>

                    {remiseOuverte === f.id && (
                      <RemiseSurCarte famille={f} autoPct={autoPct} onClose={() => setRemiseOuverte(null)} />
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {autres.length === 0 && <span className="mnd-muted" style={{ fontSize: 11.5 }}>Aucun membre rattaché</span>}
                      {autres.map((m) => {
                        const a = ageDe(m.birthday, todayISO());
                        return (
                          <span key={m.id} className="trc-chip" style={{ cursor: 'default' }}>
                            {m.name}{a !== undefined ? <span style={{ color: 'var(--ink-soft)' }}> · {a}</span> : ''}
                          </span>
                        );
                      })}
                    </div>

                    {(adresseAbsente || sansNaissance > 0) && (
                      <div style={{ marginTop: 9, fontSize: 12, color: 'var(--copper-700)', lineHeight: 1.5 }}>
                        {adresseAbsente && <div>— Adresse e-mail absente : elle ne retrouvera pas ses enfants en s’inscrivant sur Ma Couronne.</div>}
                        {sansNaissance > 0 && <div>— {sansNaissance} naissance{sansNaissance > 1 ? 's' : ''} manquante{sansNaissance > 1 ? 's' : ''} : {sansNaissance > 1 ? 'ces enfants n’apparaîtront pas' : 'cet enfant n’apparaîtra pas'} dans son espace.</div>}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--hairline)' }}>
                      <Button size="sm" variant="ghost" onClick={() => setFamModal(f)}>Ouvrir le foyer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setUnpaidFor({ type: 'family', id: f.id })}>Impayés</Button>
                      {bal > 0 && (
                        <button
                          type="button"
                          onClick={() => setLedgerHolder({ type: 'family', id: f.id })}
                          style={{
                            cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--color-indigo)',
                            background: 'var(--surface-card)', border: '1px solid var(--hairline)',
                            borderRadius: 2, padding: '4px 10px',
                          }}
                        >
                          Avoir · {fmtMoney(bal, currency)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPlusOuvert(plusOuvert === f.id ? null : f.id)}
                        aria-label="Autres gestes"
                        aria-expanded={plusOuvert === f.id}
                        style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 17, letterSpacing: '.12em', padding: '0 4px' }}
                      >
                        ⋯
                      </button>
                    </div>

                    {plusOuvert === f.id && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <Button size="sm" variant="ghost" onClick={() => { setDeposit({ holder: { type: 'family', id: f.id }, kind: 'depot' }); setPlusOuvert(null); }}>Verser un avoir</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setLedgerHolder({ type: 'family', id: f.id }); setPlusOuvert(null); }}>Mouvements</Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════ LES AVOIRS ══════════ */}
      {/* ══════════ LES PRÊTS ══════════ */}
      {registre === 'prets' && (
        <>
          {soldes.length === 0 ? (
            <Card style={{ padding: 22 }}>
              <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Aucun prêt enregistré.</b><br />
                Une avance sur salaire, un dépannage, un prêt au foyer : notez-le ici, et chaque
                remboursement viendra s’imputer dessus. Le solde de chacun se tient tout seul.
              </div>
            </Card>
          ) : (
            <>
              <Card style={{ padding: 18, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div className="mnd-stat__label">Dette en cours envers la Maison</div>
                    <div className="mnd-stat__value" style={{ fontSize: 30 }}>{fmtMoney(dette, currency)}</div>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, maxWidth: 380, lineHeight: 1.55 }}>
                    La somme de ce que chacun doit encore. Un trop-remboursé n’y devient jamais une
                    dette de la Maison — c’est une erreur de saisie, pas un dû.
                  </div>
                </div>
              </Card>

              {soldes.map((d) => {
                const lignes = prets
                  .filter((p) => p.branchId === branch.id && p.associe.trim().toLowerCase() === d.nom.toLowerCase())
                  .sort((a, b) => (a.date < b.date ? 1 : -1));
                return (
                  <Card key={d.nom} filet={d.reste > 0 ? 'copper' : 'indigo'} style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                        <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', fontWeight: 400 }}>{d.nom}</b>
                        <span className="trc-src">{LIBELLE_GENRE[d.genre]}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: d.reste > 0 ? 'var(--copper-700)' : 'var(--trf-success)' }}>
                        {d.reste > 0 ? `reste ${fmtMoney(d.reste, currency)}` : `soldé le ${frJour(d.dernier)}`}
                      </span>
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      prêté {fmtMoney(d.prete, currency)} · remboursé {fmtMoney(d.rembourse, currency)}
                    </div>
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
                      {lignes.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => corrigerLePret(p)}
                          title="Corriger ou effacer cette ligne"
                          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5, flexWrap: 'wrap', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                        >
                          <span>
                            <span style={{ color: p.type === 'pret' ? 'var(--copper-700)' : 'var(--trf-success)' }}>
                              {p.type === 'pret' ? 'Prêté' : 'Remboursé'}
                            </span>
                            {' · '}{frJour(p.date)}
                            {p.motif ? ` · ${p.motif}` : ''}
                            {p.cashbox ? <span className="mnd-muted"> · {p.cashbox}</span> : null}
                          </span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>
                            {fmtMoney(p.amountXof, currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}

      {registre === 'avoirs' && (
        <>
          {lignesAvoirs.length === 0 ? (
            <Card style={{ padding: 22 }}>
              <div className="mnd-muted" style={{ fontSize: 13 }}>
                Aucun avoir en circulation — la maison ne doit rien d’avance.
              </div>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {lignesAvoirs.map((r) => (
                <div key={`${r.holder.type}-${r.holder.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '13px 16px', borderBottom: '1px solid var(--hairline)',
                }}>
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{r.nom}</span>
                    <span className="mnd-muted" style={{ fontSize: 11.5 }}>{r.sous}</span>
                  </span>
                  <span className="mnd-muted" style={{ flex: 'none', fontSize: 12 }}>
                    {r.mvt ? `${MOT_MVT[r.mvt.kind] ?? r.mvt.kind} · ${frDay(r.mvt.date)}` : 'aucun mouvement'}
                  </span>
                  <span style={{ flex: 'none', fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--copper-700)', minWidth: 110, textAlign: 'right' }}>
                    {fmtMoney(r.bal, currency)}
                  </span>
                  <span style={{ display: 'flex', gap: 8, flex: 'none' }}>
                    <Button size="sm" variant="ghost" onClick={() => setUnpaidFor(r.holder)}>Impayés</Button>
                    <Button size="sm" variant="ghost" onClick={() => setLedgerHolder(r.holder)}>Mouvements</Button>
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '13px 16px', background: 'var(--surface-alt, #F3EDE1)' }}>
                <span className="mnd-muted" style={{ fontSize: 12.5 }}>Crédit prépayé que la maison doit encore</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}>{fmtMoney(totalAvoirs, currency)}</span>
              </div>
            </Card>
          )}

          {/* L'HISTOIRE DES AVOIRS CONSOMMÉS — à zéro, mais pas effacés. */}
          {avoirsEteints.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="trc-microlabel" style={{ color: 'var(--ink-soft)' }}>Avoirs épuisés · l’histoire reste · {avoirsEteints.length}</div>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {avoirsEteints.map((r) => (
                  <div key={`${r.holder.type}-${r.holder.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                    padding: '11px 16px', borderBottom: '1px solid var(--hairline)', opacity: 0.85,
                  }}>
                    <span style={{ flex: '1 1 200px', minWidth: 0, fontFamily: 'var(--font-serif)', fontSize: 15.5, color: 'var(--color-indigo)' }}>{r.nom}</span>
                    <span className="mnd-muted" style={{ flex: 'none', fontSize: 12 }}>
                      {fmtMoney(r.verse, currency)} versés en tout
                      {r.mvt ? ` · dernier mouvement ${frDay(r.mvt.date)}` : ''}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setLedgerHolder(r.holder)}>Voir comment il a servi</Button>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {branchFamilies.length > lignesAvoirs.length && (
            <div className="mnd-muted" style={{ fontSize: 12.5, marginTop: 12, fontStyle: 'italic' }}>
              Les autres foyers n’ont pas d’avoir — ils vivent sous « Les foyers ».
            </div>
          )}
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
      {(pretOuvert || pretEdite) && (
        <Modal
          title={pretEdite ? (pretEdite.type === 'pret' ? "Corriger ce prêt" : "Corriger ce remboursement") : "Prêt ou remboursement"}
          onClose={() => { setPretOuvert(false); setPretEdite(null); }}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="De quel geste s’agit-il ?">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {([['pret', 'La Maison prête'], ['remboursement', 'On lui rembourse']] as const).map(([k, mot]) => (
                  <button
                    key={k}
                    type="button"
                    className={`trc-chip ${fPret.type === k ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, type: k }))}
                  >
                    {mot}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="À qui">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
                {(['equipe', 'cliente', 'tiers', 'associe', 'foyer'] as GenreEmprunteur[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`trc-chip ${fPret.genre === g ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, genre: g, nom: g === 'foyer' ? 'Foyer' : f.nom, personneId: '' }))}
                  >
                    {LIBELLE_GENRE[g]}
                  </button>
                ))}
              </div>
              {/* Une cliente se choisit à la fiche : c'est ce lien qui permettra
                  de relire le prêt depuis son dossier, dans l'autre sens. */}
              {fPret.genre === 'cliente' ? (
                <ClientPicker
                  value={fPret.personneId}
                  onChange={(id) => setFPret((f) => ({
                    ...f, personneId: id,
                    nom: clients.find((c) => c.id === id)?.name ?? f.nom,
                  }))}
                  placeholder="Choisir la cliente…"
                />
              ) : (
                <Input
                  value={fPret.nom}
                  placeholder={fPret.genre === 'equipe' ? 'Nom du membre de l’équipe' : 'Nom de la personne'}
                  onChange={(e) => setFPret((f) => ({ ...f, nom: e.target.value }))}
                />
              )}
            </Field>

            <Field label={`Montant · ${currency}`}>
              <Input
                inputMode="numeric"
                value={fPret.montant}
                placeholder="0"
                onChange={(e) => setFPret((f) => ({ ...f, montant: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>

            <Field label={fPret.type === 'pret' ? 'De quelle caisse sort cet argent ?' : 'Dans quelle caisse rentre-t-il ?'}>
              <Select value={fPret.cashbox} onChange={(e) => setFPret((f) => ({ ...f, cashbox: e.target.value }))}>
                {caissesMaison.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="">Hors caisse — l’argent n’est pas passé par un tiroir</option>
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fPret.type === 'pret'
                  ? 'La caisse choisie baisse d’autant : l’argent se déplace, il ne se duplique pas.'
                  : 'La caisse choisie monte d’autant — l’argent revient dans le tiroir.'}
                {motDesCaissesEnDevise(caissesAutresDevises, currency) && (
                  <div style={{ marginTop: 5 }}>{motDesCaissesEnDevise(caissesAutresDevises, currency)}</div>
                )}
              </div>
            </Field>

            <Field label="Par quel moyen">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {['Espèces', 'Mobile Money', 'Virement', 'Autre'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`trc-chip ${fPret.method === m ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, method: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Motif · facultatif">
              <Input
                value={fPret.motif}
                placeholder="Avance sur salaire · dépannage · …"
                onChange={(e) => setFPret((f) => ({ ...f, motif: e.target.value }))}
              />
            </Field>

            <Field label="Date">
              <Input type="date" value={fPret.date} onChange={(e) => setFPret((f) => ({ ...f, date: e.target.value }))} />
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              {/* EFFACER VIT DANS LA FICHE, à gauche, loin d’Enregistrer : un
                  geste sans retour ne voisine pas avec le geste courant.
                  Effacer un prêt REND l’argent à sa caisse — c’est bien ce
                  qu’on veut d’une ligne qui n’aurait jamais dû exister. */}
              {pretEdite ? (
                <button
                  className="mnd-btn mnd-btn--ghost"
                  style={{ color: 'var(--copper-700)' }}
                  onClick={effacerLePret}
                >
                  Effacer cette ligne
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => { setPretOuvert(false); setPretEdite(null); }}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerPret}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Modal>
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
          edite={deposit.edite}
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
          onCorriger={(m) => { setDeposit({ holder: ledgerHolder, kind: m.kind as 'depot' | 'remboursement', edite: m }); setLedgerHolder(null); }}
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
                    const total = invoiceResteXof(inv);
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
  /* LA REMISE FAMILLE — deux régimes (14 août, décision de Yéman) :
     · BARÈME DU FOYER (compte muet) : 1 enfant mineur → 10 %, 2 et plus →
       15 %, aucun → 0. Il suit la famille tout seul — un enfant s'ajoute,
       le taux monte.
     · PERSONNALISÉE (taux posé) : la main fait foi, 0 = remise coupée.
     Elle ne porte jamais sur les forfaits, déjà réduits.
     UN SEUL ÉTAT — 'auto' ou le taux saisi. Deux états séparés (drapeau +
     valeur) se sont désynchronisés à l'écran de Yéman le jour même : 22
     saisi, barème encore en vedette. Un seul état ne peut pas mentir. */
  const [remiseChoix, setRemiseChoix] = useState<string>(
    family ? (family.remisePct === undefined ? 'auto' : String(family.remisePct)) : 'auto',
  );
  const remiseAuto = remiseChoix === 'auto';
  const remiseNum = remiseAuto ? 0 : Math.max(0, Math.min(100, Math.round(Number(remiseChoix.replace(/[^0-9]/g, '')) || 0)));

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
    /* Barème du foyer = remisePct ABSENT — le juge décide, et suit la famille. */
    const rec: Family = { id, branchId, name: name.trim(), payerClientId: payerId || undefined, note: note.trim() || undefined, remisePct: remiseAuto ? undefined : remiseNum };
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
          <Input value={name} placeholder="Ex. Famille A." onChange={(e) => setName(e.target.value)} />
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
          {(() => {
            /* Le barème, lu sur les membres COCHÉS ICI — l'aperçu dit ce que
               le compte donnera une fois enregistré, pas l'état d'hier. */
            const mineurs = memberClients.filter((m) => m.id !== payerId && estMineur(m, todayISO())).length;
            const autoPct = mineurs >= 2 ? 15 : mineurs === 1 ? 10 : 0;
            return (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`tre-chip ${remiseAuto ? 'is-on' : ''}`}
                    onClick={() => setRemiseChoix('auto')}
                    title="1 enfant → 10 % · 2 et plus → 15 % — le taux suit la famille tout seul"
                  >
                    Barème du foyer · −{autoPct}%
                  </button>
                  {[10, 15, 18, 20].map((p) => (
                    <button key={p} type="button" className={`tre-chip ${!remiseAuto && remiseNum === p ? 'is-on' : ''}`} onClick={() => setRemiseChoix(String(p))}>
                      −{p}%
                    </button>
                  ))}
                  {/* Le champ libre : taper un chiffre BASCULE en personnalisée
                      (le même état porte les deux — rien à désynchroniser).
                      Vider le champ ne repasse pas en barème d'autorité : on
                      lit alors « 0 », et la chip du barème est à un clic. */}
                  <Input
                    inputMode="numeric"
                    value={remiseAuto ? '' : String(remiseNum)}
                    placeholder="—"
                    onChange={(e) => setRemiseChoix(e.target.value.replace(/[^0-9]/g, '') || '0')}
                    style={{ width: 68, textAlign: 'right' }}
                    aria-label="Remise famille personnalisée en pourcentage"
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>%</span>
                </div>
                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
                  {remiseAuto
                    ? <>Le barème suit le foyer : 1 enfant → −10 %, 2 et plus → −15 % — ce compte donne
                        aujourd’hui −{autoPct}%. Un taux saisi à la main devient une remise personnalisée.</>
                    : <>Remise personnalisée · <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>−{remiseNum}%</b> — la main fait foi
                        (0 = pas de remise pour ce compte). Revenir au barème : touchez « Barème du foyer ».</>}
                  {' '}Posée d’office sur les rendez-vous des membres, hors forfaits — déjà réduits —,
                  et nommée « Remise famille » jusqu’à la facture.
                </div>
              </>
            );
          })()}
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

/* ---------- Verser / rembourser / CORRIGER un avoir ---------- */
/* CORRIGER PASSE PAR LA MÊME MODALE — 22 août 2026, « je veux lui changer de
   caisse ». Un second formulaire aurait dérivé du premier au premier champ
   ajouté, et les deux se seraient contredits sur la même écriture : c’est la
   faute du registre des encaissements, refaite trois fois cette semaine.
   `edite` bascule la modale de « poser » à « reprendre ». */
function DepositModal({
  initHolder, kind, currency, branchId, clients, families, credits, edite, onClose,
}: {
  initHolder: CreditHolder;
  kind: 'depot' | 'remboursement';
  edite?: CreditMovement;
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
  /* Le solde de référence est celui SANS ce mouvement : sinon, corriger un
     dépôt le compterait deux fois — une fois tel qu’il est, une fois tel
     qu’on le réécrit. */
  const autresMouvements = edite ? credits.filter((m) => m.id !== edite.id) : credits;
  const balance = holderReady ? creditBalanceOf(autresMouvements, holder) : 0;
  const holderName = holder.type === 'family'
    ? families.find((f) => f.id === holder.id)?.name ?? 'Compte famille'
    : clients.find((c) => c.id === holder.id)?.name ?? '';

  const [amount, setAmount] = useState(edite ? String(edite.amountXof) : '');
  const [date, setDate] = useState(edite?.date?.slice(0, 10) ?? todayISO());
  const [note, setNote] = useState(edite?.note ?? '');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const tooMuch = kind === 'remboursement' && amountNum > balance;
  /* ON NE RABOTE PAS UN AVOIR DÉJÀ CONSOMMÉ. Ramener ce dépôt sous ce que la
     cliente a déjà utilisé rendrait son compte débiteur — un solde négatif
     qu’aucun écran ne sait lire. On le refuse en le disant. */
  const troppeu = kind === 'depot' && !!edite && balance + amountNum < 0;
  const canSave = holderReady && amountNum > 0 && !tooMuch && !troppeu;

  /* ── L'ARGENT A UNE CAISSE — 19 août 2026 ────────────────────────
     « Verser un avoir doit aller dans une caisse et être retracé. » Le
     compte de la cliente se créditait, et les billets n'entraient nulle
     part : aucun tiroir ne les connaissait. Le dépôt nomme désormais sa
     caisse (elle ENTRE) et son moyen ; le remboursement aussi (elle SORT).
     Le relevé de la caisse, dans Dépenses, les montre ligne à ligne. */
  const [cashboxes] = useCashboxes();
  const caissesMaison = cashboxes.filter((b) => b.branchId === branchId && cashboxCurrency(b) === currency);
  const caissesAutresDevises = caissesEnDevise(cashboxes, branchId, currency);
  const caisseParDefaut = (caissesMaison.find((b) => b.name === 'Caisse principale') ?? caissesMaison[0])?.name ?? 'Caisse principale';
  const [boxName, setBoxName] = useState(edite?.cashbox ?? '');
  const caisseActive = caissesMaison.some((b) => b.name === boxName) ? boxName : caisseParDefaut;
  const MOYENS = ['Espèces', 'Mobile Money', 'Virement', 'Autre'];
  const [moyen, setMoyen] = useState(edite?.method && MOYENS.includes(edite.method) ? edite.method : MOYENS[0]);

  const save = () => {
    if (!canSave) return;
    const corps = {
      amountXof: amountNum,
      date: date || todayISO(),
      note: note.trim() || undefined,
      cashbox: caisseActive,
      method: moyen,
    };
    if (edite) {
      /* L’IDENTIFIANT NE BOUGE PAS : la ligne du registre des encaissements
         en est dérivée (`r-cre-<id>`), et le journal des gestes suit la pièce
         par lui. Une correction doit rester la MÊME écriture, corrigée. */
      creditMovementsStore.set((prev) => prev.map((m) => (m.id === edite.id ? { ...m, ...corps } : m)));
      onClose();
      return;
    }
    creditMovementsStore.set((prev) => [...prev, {
      id: uid(), branchId, holderType: holder.type, holderId: holder.id, kind,
      ...corps,
    }]);
    onClose();
  };

  const title = edite
    ? (kind === 'depot' ? 'Corriger ce versement.' : 'Corriger ce remboursement.')
    : (kind === 'depot' ? 'Verser un avoir.' : 'Rembourser un avoir.');
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
          {troppeu && (
            <div style={{ fontSize: 11.5, color: '#8f3b30', marginTop: 6 }}>
              Ce compte a déjà utilisé plus que cela. Descendre si bas le rendrait débiteur —
              il faut d’abord reprendre les usages.
            </div>
          )}
        </Field>
        <Field label={kind === 'depot' ? 'Moyen de règlement' : 'Rendu par'}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MOYENS.map((p) => (
              <button key={p} type="button" className={`tre-chip ${moyen === p ? 'is-on' : ''}`} onClick={() => setMoyen(p)}>{p}</button>
            ))}
          </div>
        </Field>
        <Field label={kind === 'depot' ? 'Caisse créditée' : 'Caisse débitée'}>
          {caissesMaison.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {caissesMaison.map((b) => (
                <button key={b.id} type="button" className={`tre-chip ${caisseActive === b.name ? 'is-on' : ''}`} onClick={() => setBoxName(b.name)}>{b.name}</button>
              ))}
            </div>
          ) : (
            <span className="mnd-muted" style={{ fontSize: 12 }}>Aucune caisse en {currency} — l'écriture citera « Caisse principale ».</span>
          )}
          {motDesCaissesEnDevise(caissesAutresDevises, currency) && (
            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }}>{motDesCaissesEnDevise(caissesAutresDevises, currency)}</div>
          )}
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
            {edite
              ? 'Enregistrer la correction'
              : kind === 'depot' ? `Verser ${amountNum > 0 ? fmtMoney(amountNum, currency) : ''}` : `Rembourser ${amountNum > 0 && !tooMuch ? fmtMoney(amountNum, currency) : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Registre des mouvements d'un compte ---------- */
function LedgerModal({
  holder, title, currency, credits, clients, onDeposit, onCorriger, onClose,
}: {
  holder: CreditHolder;
  title: string;
  currency: string;
  credits: CreditMovement[];
  clients: Client[];
  onDeposit: (kind: 'depot' | 'remboursement') => void;
  /* CORRIGER SE FAIT D’OÙ L’ON VOIT — 22 août 2026. Le registre du compte est
     l’endroit où l’on repère une ligne fausse ; il doit donc y mener. */
  onCorriger: (m: CreditMovement) => void;
  onClose: () => void;
}) {
  const rows = credits
    .filter((m) => m.holderType === holder.type && m.holderId === holder.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const balance = creditBalanceOf(credits, holder);
  const nameOf = (id?: string) => clients.find((c) => c.id === id)?.name;
  /* L'USAGE NOMME SA FACTURE — 20 août : « besoin de voir comment a été
     utilisé l'avoir ». « Réglé · Faith » disait qui, jamais QUOI : la pièce
     se retrouve par son numéro, et s'ouvre d'un clic. */
  const [invoices] = useInvoices();
  const navigate = useNavigate();
  const factureDe = (m: CreditMovement) => invoices.find((i) => i.id === m.invoiceId);
  const label = (m: CreditMovement) => {
    if (m.kind === 'depot') return 'Dépôt d’avoir';
    if (m.kind === 'remboursement') return 'Remboursement';
    const inv = factureDe(m);
    return `Réglé${inv ? ` · ${inv.number}` : ''}${m.forClientId ? ` · ${nameOf(m.forClientId) ?? 'membre'}` : ''}`;
  };

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
                  <span className="trf-coffre-row__meta">{frDay(m.date)}{m.cashbox ? ` · ${m.cashbox}` : ''}{m.method ? ` · ${m.method}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
                  {m.kind !== 'usage' && (
                    <button
                      type="button"
                      onClick={() => onCorriger(m)}
                      style={{ alignSelf: 'flex-start', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--copper-700)' }}
                    >
                      Corriger
                    </button>
                  )}
                  {m.kind === 'usage' && factureDe(m) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/factures?id=${m.invoiceId}`)}
                      style={{ alignSelf: 'flex-start', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 600, color: 'var(--copper-700)' }}
                    >
                      Ouvrir la facture →
                    </button>
                  )}
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
