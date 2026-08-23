import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtIn } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import {
  useCoffre, coffreStore, coffreBalance, coffreSignedXof, invoiceRegleXof, useInvoices, useCashboxes,
  useObjectifs, objectifsStore, recuParObjectif, coffreNonFleche, moisPourAtteindre, type ObjectifCoffre,
  recuDansSaDevise, deviseDuCompartiment, compartimentEtranger, coffreBalanceMaison, cashboxCurrency,
  caissesEnDevise, motDesCaissesEnDevise,
  type CoffreMovement, type Cashbox,
} from '../../../../shared/finance';
import { apptNetXof, useServicesById, ClientPicker } from '../clients/_shared';
import { todayISO, monthKey, monthTitle } from './_shared';
import { useCaissesOuvertes, EcranVerrouille, ReglerLeVerrou, CLE_COFFRE } from './tiroirs';
import { DepositModal, TransferModal } from './objectifs';
import { useSettings, settingsStore } from '../../../../shared/settings';

/** « septembre 2027 » — l'échéance d'un objectif se dit en toutes lettres. */
const monthLabelLong = (mk: string): string => (mk ? monthTitle(mk) : '');
import './finances.css';

/* Coffre-fort — l'épargne souveraine de la maison. On y met de côté une part du
   chiffre DÉJÀ gagné (dépôts, souvent adossés à une cliente). C'est un registre
   SÉPARÉ : il n'entre ni dans le chiffre d'affaires ni dans les dépenses.
   VERROU : aucune dépense n'est possible depuis le coffre — la seule sortie est
   un virement vers la banque. Le solde ne fait que grandir, sauf virement. */

const frMoneyDay = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

/* Courbe de croissance — solde cumulé dans le temps, du premier mouvement à
   aujourd'hui. Aire remplie sous la ligne : on VOIT l'argent monter. */
function GrowthChart({ moves, currency }: { moves: CoffreMovement[]; currency: string }) {
  const pts = useMemo(() => {
    if (moves.length === 0) return [];
    const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date));
    const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
    const out: { t: number; bal: number }[] = [];
    let bal = 0;
    out.push({ t: t(sorted[0].date), bal: 0 }); // socle : on part de 0
    for (const m of sorted) {
      bal += coffreSignedXof(m);
      out.push({ t: t(m.date), bal: Math.max(0, bal) });
    }
    const nowIso = todayISO();
    if (t(nowIso) > out[out.length - 1].t) out.push({ t: t(nowIso), bal: Math.max(0, bal) });
    return out;
  }, [moves]);

  if (pts.length < 2) {
    return (
      <div className="trf-coffre-chart trf-coffre-chart--empty">
        Le coffre commence à croître — chaque versement dessinera sa courbe.
      </div>
    );
  }

  const W = 640, H = 170, padB = 22, padT = 12;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const maxBal = Math.max(1, ...pts.map((p) => p.bal));
  const x = (t: number) => (t1 === t0 ? W : ((t - t0) / (t1 - t0)) * W);
  const y = (b: number) => padT + (1 - b / maxBal) * (H - padT - padB);
  /* Ligne en escalier : le solde tient entre deux mouvements. */
  const line: string[] = [];
  pts.forEach((p, i) => {
    if (i === 0) line.push(`M ${x(p.t).toFixed(1)} ${y(p.bal).toFixed(1)}`);
    else {
      line.push(`L ${x(p.t).toFixed(1)} ${y(pts[i - 1].bal).toFixed(1)}`);
      line.push(`L ${x(p.t).toFixed(1)} ${y(p.bal).toFixed(1)}`);
    }
  });
  const linePath = line.join(' ');
  const areaPath = `${linePath} L ${W} ${H - padB} L 0 ${H - padB} Z`;

  return (
    <div className="trf-coffre-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Croissance du coffre-fort">
        <defs>
          <linearGradient id="coffreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-copper)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-copper)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="var(--hairline)" strokeWidth="1" />
        <path d={areaPath} fill="url(#coffreFill)" />
        <path d={linePath} fill="none" stroke="var(--color-copper)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.slice(1).map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.bal)} r="2.6" fill="var(--color-indigo)" />
        ))}
      </svg>
      <div className="trf-coffre-chart__axis">
        <span>{frMoneyDay(new Date(t0).toISOString().slice(0, 10))}</span>
        <span>{fmtMoney(maxBal, currency)} max</span>
        <span>Aujourd’hui</span>
      </div>
    </div>
  );
}

export default function Coffre() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [allMoves] = useCoffre();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [invoices] = useInvoices();
  const byId = useServicesById();

  const moves = useMemo(
    () => allMoves.filter((m) => m.branchId === branch.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [allMoves, branch.id],
  );
  /* LE SOLDE NE MÊLE PAS LES MONNAIES — les billets étrangers en sont exclus ;
     chaque compartiment en devise dit son propre total, chez lui. Additionner
     des euros à des francs ferait un nombre qui n'existe nulle part. */
  const balance = coffreBalanceMaison(moves);
  const totalIn = moves.filter((m) => m.kind === 'depot').reduce((s, m) => s + m.amountXof, 0);
  const totalOut = moves.filter((m) => m.kind === 'virement').reduce((s, m) => s + m.amountXof, 0);
  const thisMonth = monthKey(todayISO());
  const inThisMonth = moves
    .filter((m) => m.kind === 'depot' && monthKey(m.date) === thisMonth)
    .reduce((s, m) => s + m.amountXof, 0);

  /* Chiffre réalisé d'une cliente — pour proposer une part à mettre de côté.
     Rituels honorés (net) + factures payées hors règlements de RDV. */
  const clientRevenue = useMemo(() => {
    const linked = new Set(appts.filter((a) => a.invoiceId).map((a) => a.invoiceId));
    return (clientId: string) => {
      const hon = appts.filter((a) => a.branchId === branch.id && a.clientId === clientId && a.status === 'honoré');
      /* Ce que la cliente a RÉELLEMENT versé sur ses pièces hors rituel — le
         statut ne suffit plus, une pièce peut être à moitié réglée. */
      const extras = invoices.filter(
        (i) => i.branchId === branch.id && i.clientId === clientId && i.kind === 'facture'
          && !linked.has(i.id) && !i.lines.some((l) => l.label.startsWith('Règlement ·')),
      );
      return hon.reduce((s, a) => s + apptNetXof(a, byId), 0) + extras.reduce((s, i) => s + invoiceRegleXof(i), 0);
    };
  }, [appts, invoices, branch.id, byId]);

  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const removeMove = (m: CoffreMovement) => {
    const label = m.kind === 'depot' ? 'ce dépôt' : 'ce virement';
    if (!window.confirm(`Retirer ${label} du registre ? (correction d’écriture — n’envoie ni ne rend d’argent)`)) return;
    coffreStore.set((prev) => prev.filter((x) => x.id !== m.id));
  };

  /* Les objectifs vivants de cette branche, et la modale qui les pose. Une
     seule porte : « + Objectif » et le nom d'un objectif l'ouvrent tous deux. */
  const [objectifs, setObjectifs] = useObjectifs();
  const objectifsVivants = objectifs.filter((o) => o.branchId === branch.id && !o.clos);
  const [objOuvert, setObjOuvert] = useState<{ id: string; nom: string; cible: string; echeance: string; devise: string } | null>(null);
  /* REPRENDRE DU COFFRE — 22 août 2026. Le coffre n'avait qu'une sortie, la
     banque : reprendre 100 000 F pour payer un fournisseur ne s'écrivait
     nulle part, et se contournait donc par une fausse écriture. Un retour
     daté, nommé et rendu à une caisse fausse infiniment moins les soldes.
     Ce qui reste verrouillé : on ne DÉPENSE toujours pas depuis le coffre —
     l'argent revient d'abord dans un tiroir, et ce retour se voit. */
  /* ── LE VERROU DU COFFRE — 22 août 2026 ──────────────────────────
     Même mécanique que l'écran des caisses, même pièce partagée : deux
     verrous recopiés seraient deux verrous à corriger le jour où l'un se
     révèle troué. Sans code posé, la porte reste ouverte. */
  const [reglages] = useSettings();
  const ouvertesIci = useCaissesOuvertes();
  const coffreVerrouille = !!reglages.codeCoffreHash && !ouvertesIci.has(CLE_COFFRE);
  const [verrouOuvert, setVerrouOuvert] = useState(false);

  const [retraitOuvert, setRetraitOuvert] = useState(false);
  const [caissesToutes] = useCashboxes();
  const caissesDuCoffre = caissesToutes.filter((c) => c.branchId === branch.id && cashboxCurrency(c) === currency);
  const caissesAutresDevises = caissesEnDevise(caissesToutes, branch.id, currency);
  const [fRetrait, setFRetrait] = useState({ montant: '', cashbox: '', objectifId: '', note: '', date: todayISO() });

  const enregistrerRetrait = () => {
    const montant = parseInt(fRetrait.montant.replace(/[^0-9]/g, ''), 10) || 0;
    if (montant <= 0) return;
    coffreStore.set((prev) => [...prev, {
      id: uid(), branchId: branch.id, kind: 'retrait', amountXof: montant,
      date: fRetrait.date || todayISO(),
      cashbox: fRetrait.cashbox || undefined,
      objectifId: fRetrait.objectifId || undefined,
      note: fRetrait.note.trim() || undefined,
    }]);
    setRetraitOuvert(false);
    setFRetrait((f) => ({ ...f, montant: '', note: '' }));
  };
  /* L'écriture qu'on corrige — montant, date, note, objectif. Le SENS ne se
     change pas ici : un versement ne devient pas un virement d'un clic, ce
     serait renverser un mouvement d'argent sans s'en apercevoir. Pour cela,
     on retire la ligne et on la repose. */
  const [mvtOuvert, setMvtOuvert] = useState<{ id: string; montant: string; date: string; note: string; objectifId: string } | null>(null);

  const enregistrerMouvement = () => {
    if (!mvtOuvert) return;
    const montant = parseInt(mvtOuvert.montant.replace(/[^0-9]/g, ''), 10) || 0;
    if (montant <= 0) return;
    coffreStore.set((prev) => prev.map((m) => (m.id === mvtOuvert.id
      ? {
        ...m,
        amountXof: montant,
        date: mvtOuvert.date || m.date,
        note: mvtOuvert.note.trim() || undefined,
        objectifId: mvtOuvert.objectifId || undefined,
      }
      : m)));
    setMvtOuvert(null);
  };

  const enregistrerObjectif = () => {
    if (!objOuvert) return;
    const nom = objOuvert.nom.trim();
    /* La cible est FACULTATIVE : sans elle, on pose un compartiment. Seul le
       nom est requis — un compartiment sans nom ne se retrouverait pas. */
    const cible = parseInt(objOuvert.cible.replace(/[^0-9]/g, ''), 10) || 0;
    if (!nom) return;
    setObjectifs((prev) => (objOuvert.id
      ? prev.map((o) => (o.id === objOuvert.id
        ? { ...o, nom, cibleXof: cible, echeance: objOuvert.echeance || undefined, devise: objOuvert.devise || undefined }
        : o))
      : [...prev, {
        id: uid(), branchId: branch.id, nom, cibleXof: cible,
        echeance: objOuvert.echeance || undefined,
        devise: objOuvert.devise || undefined,
      } as ObjectifCoffre]));
    setObjOuvert(null);
  };

  /* CLORE PLUTÔT QU'EFFACER : un objectif atteint quitte la liste vivante sans
     emporter son histoire — les versements qui l'ont nourri restent fléchés
     vers lui, et le coffre se retrouve toujours. */
  const cloreObjectif = () => {
    if (!objOuvert?.id) return;
    const o = objectifs.find((x) => x.id === objOuvert.id);
    if (!o || !window.confirm(`Refermer « ${o.nom} » ? Il quitte la liste, et les versements qui lui étaient destinés gardent leur trace.`)) return;
    setObjectifs((prev) => prev.map((x) => (x.id === o.id ? { ...x, clos: true } : x)));
    setObjOuvert(null);
  };

  if (coffreVerrouille) {
    return <EcranVerrouille titre="Le coffre est verrouillé." cle={CLE_COFFRE} hash={reglages.codeCoffreHash} />;
  }

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances · épargne souveraine"
        title="Le Coffre-fort."
        sub="Mettez de côté une part du chiffre déjà gagné. Le coffre est verrouillé : aucune dépense possible — la seule sortie est un virement vers la banque."
        actions={
          <>
            <Button variant="ghost" onClick={() => setVerrouOuvert(true)}>
              {reglages.codeCoffreHash ? 'Code de l’écran' : 'Protéger cet écran'}
            </Button>
            <Button variant="ghost" onClick={() => setRetraitOuvert(true)} disabled={balance <= 0}>Reprendre du coffre</Button>
            <Button variant="ghost" onClick={() => setTransferOpen(true)} disabled={balance <= 0}>Virement bancaire</Button>
            <Button variant="copper" onClick={() => setDepositOpen(true)}>+ Verser au coffre</Button>
          </>
        }
      />

      {/* Solde — la pièce maîtresse : l'argent qui grandit. */}
      <Card className="trf-coffre-hero" style={{ padding: 24, marginBottom: 18 }}>
        <div className="trf-coffre-hero__label">Solde du coffre-fort · {branch.name}</div>
        <div className="trf-coffre-hero__value">{fmtMoney(balance, currency)}</div>
        <div className="trf-coffre-hero__lock">
          <span className="trf-coffre-hero__lockdot" /> Verrouillé — aucune dépense possible, sortie uniquement par virement bancaire.
        </div>
        <GrowthChart moves={moves} currency={currency} />
      </Card>

      {/* LES OBJECTIFS ONT REJOINT LES PRÊTS — 23 août 2026. « Il y a des
          apports et des remboursements qui se font à ce niveau » : un prêt et
          un objectif sont la même figure — une cible, des mouvements dans le
          temps, un reste à faire. L’ARGENT, LUI, N’A PAS BOUGÉ : les objectifs
          flèchent toujours ce qui dort ICI. Le coffre garde le tiroir, et dit
          où on les lit. */}
      <Card style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="mnd-eyebrow" style={{ marginBottom: 2 }}>Ce que la Maison met de côté</div>
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.65, maxWidth: '62ch' }}>
              {objectifsVivants.length > 0
                ? `${objectifsVivants.length} objectif${objectifsVivants.length > 1 ? 's' : ''} en cours. Ils flèchent cet argent-ci — il ne bouge pas d’ici.`
                : 'Aucun objectif posé. Une scolarité, un voyage, un second fauteuil : nommez ce que vous préparez.'}
              {" "}Non fléché — disponible : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(coffreNonFleche(moves), currency)}</b>.
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate('/prets?onglet=objectifs')}>Les objectifs →</Button>
        </div>
      </Card>
      <div className="tr-grid tr-grid--3" style={{ marginBottom: 18 }}>
        <Card filet="copper" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Total versé</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(totalIn, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>depuis l’ouverture du coffre</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Versé ce mois</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(inThisMonth, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>épargne du mois en cours</div>
        </Card>
        <Card filet="indigo" style={{ padding: 18 }}>
          <div className="mnd-stat__label">Sorti vers la banque</div>
          <div className="mnd-stat__value" style={{ fontSize: 28 }}>{fmtMoney(totalOut, currency)}</div>
          <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6 }}>virements bancaires cumulés</div>
        </Card>
      </div>

      {/* Registre des mouvements */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="trf-coffre-ledger__head">
          <span>Mouvements du coffre · {moves.length}</span>
        </div>
        {moves.length === 0 ? (
          <div className="trf-empty" style={{ padding: 28 }}>
            Le coffre est vide. « Verser au coffre » met de côté une part du chiffre — l’argent commencera à grandir.
          </div>
        ) : (
          <div className="trf-coffre-ledger">
            {moves.map((m) => (
              <div className="trf-coffre-row" key={m.id}>
                <span className={`trf-coffre-row__icon trf-coffre-row__icon--${m.kind}`}>{m.kind === 'depot' ? '↑' : '↓'}</span>
                {/* LA LIGNE S'OUVRE — 22 août 2026, « rendre éditable les
                    montants au coffre ». Une écriture fausse ne se corrigeait
                    que d'une façon : l'effacer et la refaire, en perdant sa
                    cliente, sa caisse et sa note au passage. */}
                <button
                  className="trf-coffre-row__main trf-coffre-row__main--btn"
                  onClick={() => setMvtOuvert({
                    id: m.id,
                    montant: String(m.amountXof),
                    date: m.date,
                    note: m.note ?? '',
                    objectifId: m.objectifId ?? '',
                  })}
                  title="Corriger cette écriture"
                >
                  <span className="trf-coffre-row__title">
                    {/* UN FLÉCHAGE N’EST NI UNE ENTRÉE NI UNE SORTIE — 23 août
                        2026. « Repris du coffre » mentirait : rien n en est
                        sorti, une part a seulement pris un nom. */}
                    {m.flechage
                      ? (m.kind === 'depot' ? 'Fléché vers un objectif' : 'Quitte le disponible')
                      : m.kind === 'depot'
                        ? (m.clientName ? `Versement · ${m.clientName}` : 'Versement au coffre')
                        : m.kind === 'retrait'
                          ? `Repris du coffre${m.cashbox ? ` · vers ${m.cashbox}` : ''}`
                          : `Virement bancaire${m.bank ? ` · ${m.bank}` : ''}`}
                  </span>
                  <span className="trf-coffre-row__meta">
                    {frMoneyDay(m.date)}{m.note ? ` · ${m.note}` : ''}
                    {m.objectifId ? ` · ${objectifs.find((o) => o.id === m.objectifId)?.nom ?? 'objectif retiré'}` : ''}
                  </span>
                </button>
                <span className={`trf-coffre-row__amount trf-coffre-row__amount--${m.kind}`}>
                  {m.kind === 'depot' ? '+' : '−'}{fmtMoney(m.amountXof, currency)}
                </span>
                <button className="trf-coffre-row__del" title="Retirer cette écriture (correction)" aria-label="Retirer cette écriture" onClick={() => removeMove(m)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {mvtOuvert && (() => {
        const m = moves.find((x) => x.id === mvtOuvert.id);
        const montantNum = parseInt(mvtOuvert.montant.replace(/[^0-9]/g, ''), 10) || 0;
        return (
          <Modal title="Corriger cette écriture" onClose={() => setMvtOuvert(null)} width={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {m && (
                <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {m.kind === 'depot' ? 'Versement au coffre' : 'Virement bancaire'}
                  {m.cashbox ? ` · depuis ${m.cashbox}` : ''}
                  {m.clientName ? ` · ${m.clientName}` : ''}
                  {m.bank ? ` · ${m.bank}` : ''}
                  <br />
                  Le sens du mouvement ne se change pas ici — pour cela, retirez la ligne et reposez-la.
                </div>
              )}
              <Field label={`Montant · ${currency}`}>
                <Input
                  inputMode="numeric"
                  value={mvtOuvert.montant}
                  onChange={(e) => setMvtOuvert((f) => (f ? { ...f, montant: e.target.value.replace(/[^0-9]/g, '') } : f))}
                  style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={mvtOuvert.date}
                  onChange={(e) => setMvtOuvert((f) => (f ? { ...f, date: e.target.value } : f))}
                />
              </Field>
              {objectifsVivants.length > 0 && (
                <Field label="Pour quel objectif · facultatif">
                  <Select
                    value={mvtOuvert.objectifId}
                    onChange={(e) => setMvtOuvert((f) => (f ? { ...f, objectifId: e.target.value } : f))}
                  >
                    <option value="">Sans objectif — argent disponible</option>
                    {objectifsVivants.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Note · facultatif">
                <Input
                  value={mvtOuvert.note}
                  onChange={(e) => setMvtOuvert((f) => (f ? { ...f, note: e.target.value } : f))}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => setMvtOuvert(null)}>Annuler</button>
                <button
                  className="mnd-btn"
                  disabled={montantNum <= 0}
                  title={montantNum <= 0 ? 'Saisissez un montant supérieur à zéro' : undefined}
                  onClick={enregistrerMouvement}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {verrouOuvert && (
        <ReglerLeVerrou
          cle={CLE_COFFRE}
          hash={reglages.codeCoffreHash}
          onClose={() => setVerrouOuvert(false)}
          onPose={(h) => settingsStore.set((prev) => ({ ...prev, codeCoffreHash: h }))}
        />
      )}

      {retraitOuvert && (
        <Modal title="Reprendre du coffre" onClose={() => setRetraitOuvert(false)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              L’argent quitte le coffre et <b>rentre dans une caisse</b> : il redevient disponible
              au comptoir. Le coffre reste verrouillé pour les dépenses — on ne dépense jamais
              directement depuis lui, et ce retour se voit.
            </div>
            <Field label={`Montant repris · ${currency}`}>
              <Input
                inputMode="numeric"
                value={fRetrait.montant}
                placeholder="0"
                onChange={(e) => setFRetrait((f) => ({ ...f, montant: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-indigo)' }}
              />
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
                Disponible au coffre : {fmtMoney(balance, currency)}
              </div>
            </Field>
            <Field label="Dans quelle caisse rentre-t-il ?">
              <Select value={fRetrait.cashbox} onChange={(e) => setFRetrait((f) => ({ ...f, cashbox: e.target.value }))}>
                <option value="">Choisir une caisse…</option>
                {caissesDuCoffre.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                La caisse choisie monte d’autant — l’argent se déplace, il ne se duplique pas.
                {motDesCaissesEnDevise(caissesAutresDevises, currency) && (
                  <div style={{ marginTop: 5 }}>{motDesCaissesEnDevise(caissesAutresDevises, currency)}</div>
                )}
              </div>
            </Field>
            {objectifsVivants.length > 0 && (
              <Field label="Repris de quel compartiment · facultatif">
                <Select value={fRetrait.objectifId} onChange={(e) => setFRetrait((f) => ({ ...f, objectifId: e.target.value }))}>
                  <option value="">De la part non fléchée</option>
                  {objectifsVivants.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Date">
              <Input type="date" value={fRetrait.date} onChange={(e) => setFRetrait((f) => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Pourquoi · facultatif">
              <Input
                value={fRetrait.note}
                placeholder="Ex. règlement d’un fournisseur, besoin du comptoir…"
                onChange={(e) => setFRetrait((f) => ({ ...f, note: e.target.value }))}
              />
            </Field>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setRetraitOuvert(false)}>Annuler</button>
              <button className="mnd-btn" onClick={enregistrerRetrait}>Reprendre</button>
            </div>
          </div>
        </Modal>
      )}

      {objOuvert && (
        <Modal title={objOuvert.id ? 'Modifier l’objectif' : 'Un nouvel objectif'} onClose={() => setObjOuvert(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Ce que la Maison prépare">
              <Input
                value={objOuvert.nom}
                placeholder="Scolarité 2027 · Voyage · Second fauteuil…"
                onChange={(e) => setObjOuvert((o) => (o ? { ...o, nom: e.target.value } : o))}
              />
            </Field>
            <Field label="Devise tenue">
              <Select
                value={objOuvert.devise}
                onChange={(e) => setObjOuvert((o) => (o ? { ...o, devise: e.target.value } : o))}
              >
                <option value="">{currency} — la devise de la Maison</option>
                {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                Un compartiment en devise compte SES billets et ne s’additionne jamais au solde
                en {currency} — deux monnaies ne font pas un total.
              </div>
            </Field>
            <Field label={`Montant à réunir · ${objOuvert.devise || currency} · facultatif`}>
              <Input
                inputMode="numeric"
                value={objOuvert.cible}
                placeholder="0"
                onChange={(e) => setObjOuvert((o) => (o ? { ...o, cible: e.target.value.replace(/[^0-9]/g, '') } : o))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
              {/* LAISSER VIDE A UN SENS : c'est ainsi qu'on pose un simple
                  coffre dans le coffre — il contient, il ne vise rien. */}
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                Laissez vide pour un simple compartiment : un coffre dans le coffre, qui contient
                sans viser de montant. Avec un montant, il devient un objectif — jauge, manque et rythme.
              </div>
            </Field>
            <Field label="Pour quand · facultatif">
              <Input
                type="month"
                value={objOuvert.echeance}
                onChange={(e) => setObjOuvert((o) => (o ? { ...o, echeance: e.target.value } : o))}
              />
              {/* L'ABSENCE DE DATE A UN SENS, et il faut le dire : sans elle,
                  l'objectif ne sera JAMAIS annoncé en retard. */}
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.55 }}>
                Sans date, Le Trône dira le rythme mais ne parlera jamais de retard —
                on ne reproche pas un retard à qui n’a pas donné d’échéance.
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
              {objOuvert.id
                ? <button className="mnd-btn mnd-btn--ghost" onClick={cloreObjectif}>Refermer l’objectif</button>
                : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => setObjOuvert(null)}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerObjectif}>
                  {objOuvert.id ? 'Enregistrer' : 'Poser l’objectif'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {depositOpen && (
        <DepositModal
          onClose={() => setDepositOpen(false)}
          currency={currency}
          clients={clients.filter((c) => c.branchId === branch.id && !c.archived)}
          clientRevenue={clientRevenue}
          onSave={(mv: CoffreMovement) => {
            coffreStore.set((prev) => [...prev, mv]);
            setDepositOpen(false);
          }}
          branchId={branch.id}
        />
      )}
      {transferOpen && (
        <TransferModal
          onClose={() => setTransferOpen(false)}
          currency={currency}
          balance={balance}
          lastBank={moves.find((m) => m.kind === 'virement' && m.bank)?.bank ?? ''}
          onSave={(mv: CoffreMovement) => {
            coffreStore.set((prev) => [...prev, mv]);
            setTransferOpen(false);
          }}
          branchId={branch.id}
        />
      )}
    </div>
  );
}
