import { useMemo, useState } from 'react';
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

      {/* ── CE QUE LA MAISON MET DE CÔTÉ, ET POUR QUOI — 22 août 2026 ──
          Le coffre était un seul tas : il recevait, il gardait, mais il ne
          savait pas dire POUR QUOI. Chaque objectif porte sa cible, sa
          progression, et — s'il a donné une date — ce que le rythme promet.
          Ce qui n'est fléché nulle part reste visible : c'est de l'argent
          disponible, pas de l'argent égaré. */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div>
            <div className="mnd-eyebrow" style={{ marginBottom: 2 }}>Ce que la Maison met de côté</div>
            <div className="mnd-muted" style={{ fontSize: 12 }}>
              Un objectif ne bloque rien — il dit seulement où va l’effort.
            </div>
          </div>
          <Button variant="ghost" onClick={() => setObjOuvert({ id: '', nom: '', cible: '', echeance: '', devise: '' })}>+ Objectif</Button>
        </div>

        {objectifsVivants.length === 0 ? (
          <div className="trf-empty" style={{ textAlign: 'left', lineHeight: 1.7, marginTop: 12 }}>
            <b style={{ color: 'var(--color-indigo)', fontWeight: 500 }}>Aucun objectif posé.</b><br />
            Une scolarité, un voyage, un second fauteuil : nommez ce que vous préparez, donnez-lui
            un montant, et chaque versement au coffre pourra le désigner.
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            {objectifsVivants.map((o) => {
              const devise = deviseDuCompartiment(o, currency);
              const etranger = compartimentEtranger(o, currency);
              const recu = recuDansSaDevise(moves, o, currency);
              /* SANS CIBLE, C'EST UN COMPARTIMENT : il contient, il ne vise
                 rien. Ni jauge, ni manque, ni jugement — juste un solde. */
              const compartiment = o.cibleXof <= 0;
              const part = o.cibleXof > 0 ? Math.min(100, Math.round((recu / o.cibleXof) * 100)) : 0;
              const manque = Math.max(0, o.cibleXof - recu);
              const mois = moisPourAtteindre(moves, o);
              /* LE JUGEMENT N'EXISTE QUE S'IL Y A UNE DATE. On ne reproche pas
                 un retard à qui n'a pas donné d'échéance. */
              const retard = (() => {
                if (!o.echeance || mois === null || manque === 0) return null;
                const [y, m] = o.echeance.split('-').map(Number);
                const cible = new Date(y, (m || 1) - 1, 1);
                const fin = new Date();
                fin.setMonth(fin.getMonth() + mois);
                const ecart = (fin.getFullYear() - cible.getFullYear()) * 12 + (fin.getMonth() - cible.getMonth());
                return ecart;
              })();
              return (
                <div className="trf-objectif" key={o.id}>
                  <div className="trf-objectif__tete">
                    <button
                      className="trf-objectif__nom"
                      onClick={() => setObjOuvert({ id: o.id, nom: o.nom, cible: String(o.cibleXof), echeance: o.echeance ?? '', devise: o.devise ?? '' })}
                      title="Modifier cet objectif"
                    >
                      {o.nom}
                    </button>
                    <span className="trf-objectif__chiffres">
                      {fmtIn(recu, devise)}
                      {!compartiment && <i> / {fmtIn(o.cibleXof, devise)}</i>}
                    </span>
                  </div>
                  {!compartiment && (
                    <div className="trf-jauge">
                      <i
                        style={{ width: `${Math.max(1, part)}%` }}
                        className={manque === 0 ? 'est-atteint' : retard !== null && retard > 0 ? 'est-loin' : ''}
                      />
                    </div>
                  )}
                  <div className="trf-objectif__mot" style={compartiment ? { marginTop: 5 } : undefined}>
                    {compartiment
                      ? <span className="mnd-muted">compartiment — sans montant visé</span>
                      : <span>{part} %{manque > 0 ? ` · il manque ${fmtIn(manque, devise)}` : ' · atteint'}</span>}
                    {etranger && <span className="trf-objectif__devise">tenu en {devise}</span>}
                    {o.echeance && <span>échéance {monthLabelLong(o.echeance)}</span>}
                    {manque > 0 && mois !== null && (
                      <span className={`trf-jugement ${retard !== null && retard > 0 ? 'est-retard' : retard !== null ? 'est-tenu' : ''}`}>
                        au rythme actuel : {mois} mois
                        {retard !== null && (retard > 0
                          ? ` — ${retard} mois de retard`
                          : ' — échéance tenue')}
                      </span>
                    )}
                    {manque > 0 && mois === null && <span className="mnd-muted">aucun versement fléché — rien à promettre</span>}
                  </div>
                </div>
              );
            })}
            {/* LES DEVISES NE S'ADDITIONNENT PAS. Le non-fléché ne compte que
                les francs de la Maison ; chaque compartiment en devise dit son
                propre total, plus haut, chez lui. */}
            <div className="trf-objectif__pied">
              <span>Non fléché — disponible</span>
              <b>{fmtMoney(coffreNonFleche(moves), currency)}</b>
            </div>
          </div>
        )}
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
                    {m.kind === 'depot'
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
          onSave={(mv) => {
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
          onSave={(mv) => {
            coffreStore.set((prev) => [...prev, mv]);
            setTransferOpen(false);
          }}
          branchId={branch.id}
        />
      )}
    </div>
  );
}

/* ---------- Verser au coffre — dépôt, souvent adossé au revenu d'une cliente ---------- */
function DepositModal({
  onClose, currency, clients, clientRevenue, onSave, branchId,
}: {
  onClose: () => void;
  currency: string;
  clients: ReturnType<typeof useClients>[0];
  clientRevenue: (id: string) => number;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
}) {
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  /* D'OÙ SORT L'ARGENT — 17 août 2026, « le coffre comme caisse ». Un dépôt
     DÉBITE la caisse nommée : sans elle, les mêmes francs vivraient dans le
     tiroir et dans le coffre, et la trésorerie les compterait deux fois.
     « Hors caisse » reste possible pour une mise de côté qui ne sort d'aucun
     tiroir — une somme reçue ailleurs, portée directement à l'abri. */
  const [caisses] = useCashboxes();
  const boxes = caisses.filter((c: Cashbox) => c.branchId === branchId);
  const [cashbox, setCashbox] = useState(boxes[0]?.name ?? '');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const rev = clientId ? clientRevenue(clientId) : 0;
  const clientName = clients.find((c) => c.id === clientId)?.name;

  /* VERS QUEL OBJECTIF — 22 août 2026. Facultatif, et son absence est un état
     normal : cet argent-là reste disponible, il n'est pas égaré. */
  const [objectifs] = useObjectifs();
  const objectifsVivants = objectifs.filter((o) => o.branchId === branchId && !o.clos);
  const [objectifId, setObjectifId] = useState('');
  /* SI LE COMPARTIMENT TIENT UNE AUTRE DEVISE, on saisit les billets réels et
     leur taux : le franc reste la base comptable, mais le compartiment doit
     pouvoir dire « 200 € », pas leur contre-valeur d'un jour. */
  const objChoisi = objectifsVivants.find((o) => o.id === objectifId);
  const deviseChoisie = objChoisi ? deviseDuCompartiment(objChoisi, currency) : currency;
  const enDevise = deviseChoisie !== currency;
  const [fxMontant, setFxMontant] = useState('');
  const [fxTaux, setFxTaux] = useState('');
  const fxMontantNum = parseFloat(fxMontant.replace(',', '.')) || 0;
  const fxTauxNum = parseFloat(fxTaux.replace(',', '.')) || 0;

  const save = () => {
    const xof = enDevise ? Math.round(fxMontantNum * fxTauxNum) : amountNum;
    if (xof <= 0) return;
    onSave({
      id: uid(), branchId, kind: 'depot', amountXof: xof, date: date || todayISO(),
      clientId: clientId || undefined, clientName: clientName || undefined,
      cashbox: cashbox || undefined,
      objectifId: objectifId || undefined,
      ...(enDevise ? { fx: { code: deviseChoisie, rate: fxTauxNum, amount: fxMontantNum } } : {}),
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Verser au coffre-fort." onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="De quelle caisse sort cet argent ?">
          <Select value={cashbox} onChange={(e) => setCashbox(e.target.value)}>
            {boxes.map((c: Cashbox) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
            <option value="">Hors caisse — reçu ailleurs, porté directement à l'abri</option>
          </Select>
          <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
            La caisse choisie baisse d'autant : l'argent se déplace, il ne se duplique pas.
          </div>
        </Field>
        {objectifsVivants.length > 0 && (
          <Field label="Pour quel objectif · facultatif">
            <Select value={objectifId} onChange={(e) => setObjectifId(e.target.value)}>
              <option value="">Sans objectif — argent disponible</option>
              {objectifsVivants.map((o) => (
                <option key={o.id} value={o.id}>{o.nom}</option>
              ))}
            </Select>
            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
              Le fléchage est une lecture, jamais une serrure : cet argent reste disponible,
              et un virement pourra toujours partir.
            </div>
          </Field>
        )}
        {enDevise && (
          <>
            <Field label={`Billets déposés · ${deviseChoisie}`}>
              <Input
                inputMode="decimal"
                value={fxMontant}
                placeholder="0"
                onChange={(e) => setFxMontant(e.target.value.replace(/[^0-9.,]/g, ''))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>
            <Field label={`Taux du jour · 1 ${deviseChoisie} = ? ${currency}`}>
              <Input
                inputMode="decimal"
                value={fxTaux}
                placeholder="0"
                onChange={(e) => setFxTaux(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fxMontantNum > 0 && fxTauxNum > 0
                  ? `Soit ${fmtMoney(Math.round(fxMontantNum * fxTauxNum), currency)} — la base comptable de la Maison. Le compartiment, lui, comptera ${fxMontant} ${deviseChoisie}.`
                  : 'Le taux fige la contre-valeur du jour ; le compartiment, lui, garde ses billets.'}
              </div>
            </Field>
          </>
        )}
        <Field label="Adosser à une cliente · facultatif">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Choisir la cliente dont on met de côté le revenu…" />
        </Field>

        {clientId && (
          <div className="trf-coffre-suggest">
            <div className="trf-coffre-suggest__rev">
              Chiffre réalisé de {clientName?.split(' ')[0]} : <b>{fmtMoney(rev, currency)}</b>
            </div>
            <div className="trf-coffre-suggest__chips">
              {[10, 20, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="tre-chip"
                  disabled={rev <= 0}
                  onClick={() => setAmount(String(Math.round((rev * pct) / 100)))}
                >
                  {pct}%{rev > 0 ? ` · ${fmtMoney(Math.round((rev * pct) / 100), currency)}` : ''}
                </button>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 10.5 }}>
              Le versement met de côté cette somme — le chiffre d’affaires déjà réalisé reste inchangé.
            </div>
          </div>
        )}

        {/* En devise, le montant vient des billets et du taux — le saisir une
            seconde fois en francs ouvrirait deux vérités pour un seul dépôt. */}
        {!enDevise && (
          <Field label={`Montant à verser (${currency})`}>
            <Input inputMode="numeric" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
        )}
        <Field label="Date du versement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. épargne du mois, mise de côté prudente…" onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={amountNum <= 0}>
            Verser {amountNum > 0 ? fmtMoney(amountNum, currency) : ''} au coffre
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Virement vers la banque — la SEULE sortie autorisée ---------- */
function TransferModal({
  onClose, currency, balance, lastBank, onSave, branchId,
}: {
  onClose: () => void;
  currency: string;
  balance: number;
  lastBank: string;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [bank, setBank] = useState(lastBank);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const tooMuch = amountNum > balance;
  const canSave = amountNum > 0 && !tooMuch && bank.trim() !== '';

  const save = () => {
    if (!canSave) return;
    onSave({
      id: uid(), branchId, kind: 'virement', amountXof: amountNum, date: date || todayISO(),
      bank: bank.trim(), note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Virement vers la banque." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)' }}>
          <div className="mnd-muted" style={{ fontSize: 12 }}>
            Solde disponible : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(balance, currency)}</b>. C’est la seule sortie du coffre — l’argent va vers la banque, jamais vers une dépense.
          </div>
        </div>
        <Field label="Banque / compte destinataire">
          <Input value={bank} placeholder="Ex. Ecobank · MND Épargne" onChange={(e) => setBank(e.target.value)} />
        </Field>
        <Field label={`Montant du virement (${currency})`}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          {tooMuch && <div style={{ fontSize: 11.5, color: '#8f3b30', marginTop: 6 }}>Le virement dépasse le solde du coffre.</div>}
        </Field>
        <Field label="Date du virement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Référence · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. n° de bordereau, motif…" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="indigo" style={{ flex: 1 }} onClick={save} disabled={!canSave}>
            Virer {amountNum > 0 && !tooMuch ? fmtMoney(amountNum, currency) : ''} vers la banque
          </Button>
        </div>
      </div>
    </Modal>
  );
}
