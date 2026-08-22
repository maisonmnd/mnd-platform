/* LES TIROIRS DE LA MAISON — les calculs d'une caisse, à UNE seule source.

   Extraits de Depenses.tsx le 22 août 2026. Ils y sont nés, mais une caisse
   n'appartient pas aux dépenses : c'est le tiroir par lequel TOUT passe. Le
   jour où les caisses ont mérité leur propre écran, recopier ces deux cents
   lignes aurait fabriqué deux soldes pour un seul tiroir — et l'un des deux
   aurait fini par mentir. C'est exactement ce qui était arrivé au registre des
   encaissements.

   LE FICHIER NE S'APPELLE PAS « caisses » : sur Windows,  et
    sont le MÊME fichier, et l'écran écraserait le module sans un
   mot. Un nom distinct vaut mieux qu'une casse à laquelle on se fie. */

import { useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtIn } from '../../../../shared/currency';
import {
  useCashboxes, useExpenses, useInvoices, useCoffre, useCredits, useTransferts,
  cashboxCurrency, expenseTotal, invoiceReglements, transfertSurCaisse,
  caisseDiscrete, empreinteDuCode,
  type Invoice, type Expense, type CoffreMovement, type CreditMovement,
} from '../../../../shared/finance';
import { usePrets } from '../../../../shared/foyer';
import { useClients, useFamilies } from '../../../../shared/clients';
import { monthKey, monthLabel, todayISO } from './_shared';

/* ── LES CAISSES OUVERTES DE LA SÉANCE — 22 août 2026 ──────────────
   Une caisse discrète se déverrouille pour la SÉANCE, jamais au-delà : ce
   registre vit en mémoire et rien ne l'écrit. Fermer l'onglet, recharger la
   page, revenir demain — elle est refermée. Le retenir sur le disque
   reviendrait à laisser la clé sur la porte. */
const ouvertes = new Set<string>();
const veilleurs = new Set<() => void>();
const prevenir = () => veilleurs.forEach((f) => f());

export const ouvreLaCaisse = (id: string): void => { ouvertes.add(id); prevenir(); };
export const refermeLaCaisse = (id: string): void => { ouvertes.delete(id); prevenir(); };

/** Le code donné ouvre-t-il cette caisse ? La comparaison porte sur les
    empreintes : le code enregistré n'existe nulle part pour être comparé. */
export async function leCodeOuvre(c: { id: string; codeHash?: string }, code: string): Promise<boolean> {
  if (!c.codeHash) return true;
  return (await empreinteDuCode(c.id, code)) === c.codeHash;
}

/** S'abonne au registre : l'écran se redessine quand une caisse s'ouvre. */
export function useCaissesOuvertes(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => { veilleurs.add(cb); return () => { veilleurs.delete(cb); }; },
    () => ouvertes,
    () => ouvertes,
  );
}

/** Le solde de cette caisse se montre-t-il ? */
export const soldeVisible = (c: { id: string; codeHash?: string }, ouvertes: ReadonlySet<string>): boolean =>
  !c.codeHash || ouvertes.has(c.id);

/** Jour d'un mouvement, ex. « 13 juil. » — le même format qu'aux Dépenses. */
const fmtDay = (iso: string): string =>
  (iso ? new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');

/** TOUT CE QU'UNE CAISSE SAIT D'ELLE-MÊME. Une seule porte, deux écrans. */
export function useCaisses(month: string) {
  const { branch, currency } = useBranch();
  const [cashboxes] = useCashboxes();
  const [expenses] = useExpenses();
  const [invoices] = useInvoices();
  const [coffre] = useCoffre();
  const [creditMvts] = useCredits();
  const [prets] = usePrets();
  const [transferts] = useTransferts();
  const [clientes] = useClients();
  const [familles] = useFamilies();

  const branchBoxes = useMemo(
    () => cashboxes.filter((c) => c.branchId === branch.id),
    [cashboxes, branch.id],
  );

  /* Ce qu'un transfert fait à une caisse — négatif au départ, positif à
     l'arrivée. Il appartient à la caisse, donc il vit ici. */
  const transfertsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    transferts
      .filter((t) => t.branchId === branch.id && keep(monthKey(t.date)))
      .reduce((s, t) => s + transfertSurCaisse(t, name), 0);

  /* LA DEVISE SE LIT AU VERSEMENT — les 100 € de Stevie A., 18 août. Le
     tiroir lisait `i.fx`, posé sur la pièce à sa création seulement : un
     second versement en euros sur une pièce existante n'y entrait JAMAIS.
     Chaque versement porte désormais sa devise (`p.fx`), et le repli de
     `invoiceReglements` descend le `fx` des pièces d'avant sur leur versement
     unique — une seule forme à lire. */
  const boxCredit = (i: Invoice, name: string, boxCur: string, foreign: boolean, keep: (mk: string) => boolean): number =>
    foreign
      ? invoiceReglements(i)
          .filter((p) => p.fx && p.fx.code === boxCur
            /* La caisse du versement fait foi ; les versements d'avant le champ
               `cashbox` suivent la pièce, qui nommait le tiroir. */
            && (p.cashbox ?? i.cashbox) === name
            && keep(monthKey(p.date ?? i.date)))
          .reduce((n, p) => n + p.fx!.amount, 0)
      : invoiceReglements(i)
          .filter((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte' && keep(monthKey(p.date ?? '')))
          .reduce((n, p) => n + p.amountXof, 0);

  /* CE QUE CETTE CAISSE A VERSÉ AU COFFRE — 17 août 2026, « le coffre comme
     caisse ». Un dépôt qui nomme sa caisse en SORT : sans cette soustraction,
     les mêmes francs vivraient dans le tiroir et dans le coffre, et la
     trésorerie les compterait deux fois.

     Seuls les mouvements qui NOMMENT une caisse comptent. Ceux d'avant n'en
     portent pas : ils ont été saisis comme une mise de côté symbolique, et les
     rendre débiteurs après coup ferait bouger des soldes déjà arrêtés. */
  const verseAuCoffre = (name: string, keep: (mk: string) => boolean): number =>
    coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot' && m.cashbox === name && keep(monthKey(m.date)))
      .reduce((s: number, m: CoffreMovement) => s + m.amountXof, 0);

  /* LES AVOIRS DE LA CAISSE — 19 août 2026, « verser un avoir doit aller dans
     une caisse et être retracé ». Un dépôt d'avoir qui nomme sa caisse y
     ENTRE (les billets sont dans le tiroir, même si le service n'a pas encore
     eu lieu) ; un remboursement en SORT. L'USAGE ne bouge rien — c'est le
     crédit qui se consomme, pas des billets qui passent. Les mouvements
     d'avant, sans caisse, ne comptent pas : leurs soldes sont arrêtés. */
  const avoirsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    creditMvts
      .filter((m) => m.branchId === branch.id && m.cashbox === name
        && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)))
      .reduce((s, m) => s + (m.kind === 'depot' ? m.amountXof : -m.amountXof), 0);
  /* LES PRÊTS DE LA CAISSE — 22 août 2026. Un prêt qui NOMME sa caisse en
     SORT ; un remboursement y RENTRE. Sans cela, prêter 200 000 F ne les
     retirait d'aucun tiroir : les mêmes francs vivaient dans la caisse et chez
     l'emprunteur, et la trésorerie les comptait deux fois — exactement le mal
     réparé pour le coffre le 17 août et pour les avoirs le 19.
     Les prêts d'avant ne nomment aucune caisse : ils ne bougent rien, leurs
     soldes sont arrêtés, et les rendre débiteurs après coup ferait bouger des
     trésoreries déjà closes. */
  const pretsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    prets
      .filter((p) => p.branchId === branch.id && p.cashbox === name && keep(monthKey(p.date)))
      .reduce((s, p) => s + (p.type === 'pret' ? -p.amountXof : p.amountXof), 0);
  const pretsMouvements = (name: string, keep: (mk: string) => boolean) =>
    prets.filter((p) => p.branchId === branch.id && p.cashbox === name && keep(monthKey(p.date)));

  const avoirsMouvements = (name: string, keep: (mk: string) => boolean) =>
    creditMvts.filter((m) => m.branchId === branch.id && m.cashbox === name
      && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)));
  const porteurDe = (m: CreditMovement): string =>
    m.holderType === 'family'
      ? familles.find((f) => f.id === m.holderId)?.name ?? 'Compte famille'
      : clientes.find((c) => c.id === m.holderId)?.name ?? 'Cliente';

  const boxOf = (name: string) => branchBoxes.find((b) => b.name === name);
  const boxInvoices = (name: string) =>
    invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture'
      && invoiceReglements(i).some((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte'));
  const boxExpenses = (name: string) =>
    expenses.filter((e) => e.branchId === branch.id && !e.stopped && e.cashbox === name);

  /** Solde cumulé d'une caisse — ouverture + tous les flux dont le mois passe `keep`. */
  const boxBalanceWhere = (name: string, keep: (mk: string) => boolean) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, keep), 0);
    const out = boxExpenses(name).filter((e) => keep(monthKey(e.date))).reduce((s, e) => s + expenseTotal(e), 0);
    return (box?.openingXof ?? 0) + inn - out - verseAuCoffre(name, keep) + avoirsDeCaisse(name, keep) + pretsDeCaisse(name, keep) + transfertsDeCaisse(name, keep);
  };
  /** Solde à la FIN du mois affiché (c'est « à ce jour » quand on est sur le mois courant). */
  const boxBalance = (name: string) => boxBalanceWhere(name, (mk) => mk <= month);
  /** Solde au DÉBUT du mois affiché — le point de départ du relevé. */
  const boxBalanceStart = (name: string) => boxBalanceWhere(name, (mk) => mk < month);
  /** Entrées / sorties du SEUL mois affiché — le flux du mois, par caisse. */
  const boxMonthFlux = (name: string) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const avoirs = avoirsMouvements(name, (mk) => mk === month);
    const p = pretsMouvements(name, (mk) => mk === month);
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, (mk) => mk === month), 0)
      + avoirs.filter((m) => m.kind === 'depot').reduce((s, m) => s + m.amountXof, 0)
      + p.filter((x) => x.type === 'remboursement').reduce((s, x) => s + x.amountXof, 0);
    const out = boxExpenses(name).filter((e) => monthKey(e.date) === month).reduce((s, e) => s + expenseTotal(e), 0)
      + verseAuCoffre(name, (mk) => mk === month)
      + avoirs.filter((m) => m.kind === 'remboursement').reduce((s, m) => s + m.amountXof, 0)
      + p.filter((x) => x.type === 'pret').reduce((s, x) => s + x.amountXof, 0);
    return { inn, out };
  };
  /* La trésorerie ne somme QUE les caisses de la maison : additionner des euros
     à des francs donnerait un nombre qui ne veut rien dire. Les caisses en
     devise se lisent séparément, chacune dans son unité. */
  const treasury = branchBoxes
    .filter((b) => cashboxCurrency(b) === currency)
    .reduce((s, b) => s + boxBalance(b.name), 0);

  /* Ce qu'il y a DERRIÈRE le solde d'une caisse. Mêmes règles que `boxBalance`,
     au mot près : solde au début du mois + mouvements du mois = solde affiché.
     Si la liste ne tombe pas sur le chiffre, c'est l'un des deux qui ment. */
  const boxMoves = (name: string) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;

    const inn = boxInvoices(name)
      .filter((i) => boxCredit(i, name, boxCur, foreign, (mk) => mk === month) > 0)
      .map((i) => ({
        date: i.date,
        label: i.clientName?.trim() || 'Cliente de passage',
        sub: [
          i.number,
          (() => {
            /* Les billets étrangers se lisent au versement — même source que le solde. */
            const dev = invoiceReglements(i).filter((p) => p.fx && p.fx.code === boxCur);
            const total = dev.reduce((n, p) => n + p.fx!.amount, 0);
            return total > 0 ? `${total.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${boxCur}` : null;
          })(),
          !foreign && (i.avoirXof ?? 0) > 0 ? `avoir −${fmtIn(i.avoirXof!, boxCur)}` : null,
          /* Le pourboire se DIT sans se compter : il explique pourquoi la
             cliente a remis plus que ce que la caisse inscrit. */
          !foreign && (i.tipXof ?? 0) > 0 ? `pourboire ${fmtIn(i.tipXof!, boxCur)} → Pourboires` : null,
        ].filter(Boolean).join(' · '),
        delta: boxCredit(i, name, boxCur, foreign, (mk) => mk === month),
        invoiceId: i.id, // la ligne s'ouvre sur la facture
        expense: undefined as Expense | undefined,
      }));

    const out = boxExpenses(name)
      .filter((e) => monthKey(e.date) === month)
      .map((e) => ({
        date: e.date,
        label: e.label,
        sub: e.subcategory ? `${e.category} · ${e.subcategory}` : e.category,
        delta: -expenseTotal(e),
        invoiceId: undefined as string | undefined, // une dépense n'a pas de facture
        /* …mais elle a sa fiche : le relevé d'une caisse est l'endroit où l'on
           repère une ligne fausse, il doit donc y mener. */
        expense: e as Expense | undefined,
      }));

    /* Les avoirs du mois — l'entrée dit son porteur, la sortie aussi : « être
       retracé », c'est pouvoir répondre « c'est l'avoir de qui ? » en lisant. */
    const avoirs = avoirsMouvements(name, (mk) => mk === month).map((m) => ({
      date: m.date,
      label: m.kind === 'depot' ? `Avoir versé · ${porteurDe(m)}` : `Avoir remboursé · ${porteurDe(m)}`,
      sub: [m.method, m.note].filter(Boolean).join(' · ') || 'Comptes & Avoirs',
      delta: m.kind === 'depot' ? m.amountXof : -m.amountXof,
      invoiceId: undefined as string | undefined,
      expense: undefined as Expense | undefined,
    }));

    /* LE COFFRE MANQUAIT À L'APPEL — 21 août 2026. `boxBalanceWhere` retranche
       les versements au coffre depuis le 17 août, mais aucune ligne ne les
       disait : dès qu'un dépôt nommait la caisse dans le mois affiché,
       « solde au début + mouvements » ne tombait plus sur le solde affiché —
       exactement ce que le commentaire d'en-tête annonce comme impossible.
       Le relevé et le solde lisent désormais la même chose. */
    const versements = coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot'
        && m.cashbox === name && monthKey(m.date) === month)
      .map((m: CoffreMovement) => ({
        date: m.date,
        label: 'Versé au coffre',
        sub: [m.note, 'Le Coffre'].filter(Boolean).join(' · '),
        delta: -m.amountXof,
        invoiceId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
      }));

    /* Le relevé DIT ce que le solde compte — sinon « solde au début +
       mouvements » ne tomberait plus sur le solde affiché, la faute même
       corrigée le 21 août pour les versements au coffre. */
    const lesPrets = pretsMouvements(name, (mk) => mk === month).map((p) => ({
      date: p.date,
      label: p.type === 'pret' ? `Prêté à ${p.associe}` : `Remboursé par ${p.associe}`,
      sub: [p.method, p.motif].filter(Boolean).join(' · ') || 'Comptes & Avoirs · prêts',
      delta: p.type === 'pret' ? -p.amountXof : p.amountXof,
      invoiceId: undefined as string | undefined,
      expense: undefined as Expense | undefined,
    }));

    const lesTransferts = transferts
      .filter((t) => t.branchId === branch.id && monthKey(t.date) === month && (t.de === name || t.vers === name))
      .map((t) => ({
        date: t.date,
        label: t.de === name ? `Transféré vers ${t.vers}` : `Reçu de ${t.de}`,
        sub: t.note || 'Transfert entre caisses',
        delta: transfertSurCaisse(t, name),
        invoiceId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
      }));

    const moves = [...inn, ...out, ...avoirs, ...versements, ...lesPrets, ...lesTransferts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { boxCur, startBalance: boxBalanceStart(name), moves, balance: boxBalance(name) };
  };
  /* LA TRÉSORERIE TRAHIRAIT LE SECRET. Si elle sommait tout, il suffirait de
     retrancher les caisses visibles pour lire celle qu'on masque. Les caisses
     discrètes encore fermées en sortent donc, et l'écran le DIT — un total
     amputé sans explication vaudrait pire qu'un total complet. */
  const ouvertesMaintenant = useCaissesOuvertes();
  const tresorerieVisible = branchBoxes
    .filter((b) => cashboxCurrency(b) === currency && soldeVisible(b, ouvertesMaintenant))
    .reduce((s, b) => s + boxBalance(b.name), 0);
  const discretesFermees = branchBoxes.filter((b) => caisseDiscrete(b) && !ouvertesMaintenant.has(b.id)).length;

  return {
    branch, currency, branchBoxes,
    boxOf, boxBalance, boxBalanceStart, boxMonthFlux, boxMoves, treasury,
    tresorerieVisible, discretesFermees, ouvertes: ouvertesMaintenant,
  };
}

/* ── LE RELEVÉ D'UNE CAISSE ─────────────────────────────────────────
   Ce qu'il y a DERRIÈRE le solde : solde au début du mois + mouvements =
   solde affiché, au mot près. Si la liste ne tombe pas sur le chiffre, c'est
   l'un des deux qui ment — et c'est arrivé deux fois cette semaine (les
   versements au coffre le 21, les prêts le 22).

   Il vit ici parce que DEUX écrans l'ouvrent : les Dépenses depuis la pastille
   de caisse d'une ligne, et les Caisses depuis la carte du tiroir. */
export function ReleveCaisse({
  nom, month, onClose, onExpense,
}: {
  nom: string;
  month: string;
  onClose: () => void;
  onExpense?: (e: Expense) => void;
}) {
  const navigate = useNavigate();
  const { currency, boxMoves } = useCaisses(month);
  const monthName = monthLabel(month);
  const isCurrent = month === monthKey(todayISO());
  /* UNE CAISSE DISCRÈTE NE S'OUVRE PAS SANS SON CODE — et le relevé est
     précisément ce qu'elle cache : ses mouvements disent son solde ligne à
     ligne. On le refuse donc AVANT de le calculer. */
  const { branchBoxes, ouvertes } = useCaisses(month);
  const laCaisse = branchBoxes.find((b) => b.name === nom);
  const fermee = !!laCaisse && !soldeVisible(laCaisse, ouvertes);
  const { boxCur, startBalance, moves, balance } = boxMoves(nom);
  const openEdit = onExpense ?? (() => {});
  if (fermee) {
    return (
      <Modal title={`${nom} · caisse discrète`} onClose={onClose} width={420}>
        <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          Cette caisse est fermée. Son relevé dirait son solde ligne à ligne —
          il faut donc l’ouvrir d’abord, depuis l’écran des Caisses.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="mnd-btn" onClick={onClose}>Fermer</button>
        </div>
      </Modal>
    );
  }
  const boxDrill = nom;
  const setBoxDrill = (_: string | null) => onClose();
  void boxDrill; void setBoxDrill;
  return (
          <Modal title={`${boxDrill} · mouvements`} onClose={() => setBoxDrill(null)} width={620}>
            <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {monthName}{boxCur !== currency ? ` · caisse en ${boxCur}` : ''} — encaissements crédités (avoir déduit, pourboire inclus), dépenses vivantes débitées.
            </div>

            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {/* Le point de départ du relevé : l'ouverture + TOUT l'historique
                  d'avant le mois. Sans lui, la liste ne peut pas tomber sur le
                  solde affiché en bas. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>Solde au début de {monthName}</div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>ouverture + tout l’historique antérieur</div>
                </div>
                <div className="mnd-serif" style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{fmtIn(startBalance, boxCur)}</div>
              </div>

              {moves.length === 0 && (
                <div className="trf-empty" style={{ marginTop: 10 }}>
                  Aucun mouvement en {monthName} — ni encaissement, ni dépense.
                </div>
              )}

              {moves.map((m, i) => {
                const body = (
                  <>
                    <div style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span className="trf-datepill" style={{ flex: 'none' }}>{fmtDay(m.date)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.label}</div>
                        <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.sub}</div>
                      </div>
                    </div>
                    <div
                      className="mnd-serif"
                      style={{ fontSize: 15, flex: 'none', color: m.delta >= 0 ? 'var(--trv-success, var(--color-indigo))' : 'var(--color-copper)' }}
                    >
                      {m.delta >= 0 ? '+' : '−'} {fmtIn(Math.abs(m.delta), boxCur)}
                    </div>
                  </>
                );
                /* `border: none` d'abord, puis la seule bordure qu'on garde :
                   l'inverse annulerait le trait sur les lignes-boutons. */
                const rowStyle = {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: 12, padding: '9px 0',
                  width: '100%', textAlign: 'left' as const, background: 'none',
                  border: 'none', borderBottom: '1px solid var(--hairline)',
                  font: 'inherit', color: 'inherit',
                };
                /* Un encaissement s'ouvre sur sa facture, une dépense sur sa
                   fiche. Seule une ligne qui ne mène nulle part reste inerte. */
                return m.invoiceId ? (
                  <button
                    key={`${m.date}-${m.label}-${i}`}
                    style={{ ...rowStyle, cursor: 'pointer' }}
                    title="Ouvrir la facture"
                    onClick={() => { setBoxDrill(null); navigate(`/factures?id=${m.invoiceId}`); }}
                  >
                    {body}
                  </button>
                ) : m.expense ? (
                  <button
                    key={`${m.date}-${m.label}-${i}`}
                    style={{ ...rowStyle, cursor: 'pointer' }}
                    title="Modifier cette dépense"
                    onClick={() => { const e = m.expense!; setBoxDrill(null); openEdit(e); }}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={`${m.date}-${m.label}-${i}`} style={rowStyle}>{body}</div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-argile)' }}>
              <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                Solde · {isCurrent ? 'à ce jour' : `fin ${monthName}`}
              </span>
              <span className="mnd-serif" style={{ fontSize: 24, color: 'var(--color-indigo)' }}>{fmtIn(balance, boxCur)}</span>
            </div>
          </Modal>
  );
}
