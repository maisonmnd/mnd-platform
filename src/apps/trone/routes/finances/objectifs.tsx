/* ── CE QUE LA MAISON MET DE CÔTÉ ───────────────────────────────────

   LES OBJECTIFS ONT REJOINT LES PRÊTS — 23 août 2026. « Les objectifs
   devraient aller dans l'onglet des prêts, car il y a des apports et des
   remboursements qui se font à ce niveau. » Elle a raison sur le fond : un
   prêt et un objectif sont la même figure — une cible, des mouvements dans le
   temps, un reste à faire. L'écran des prêts les tient donc tous les deux,
   chacun sur son onglet.

   MAIS L'ARGENT, LUI, NE DÉMÉNAGE PAS. Un objectif flèche ce qui dort DANS LE
   COFFRE (`recuParObjectif`, `coffreNonFleche`) : le détacher du coffre
   séparerait un but de ce qui le remplit. Le modèle est intact ; seul
   l'endroit où on le lit a changé. Le Coffre garde le tiroir — total, courbe,
   mouvements, compartiments — et renvoie ici.

   LES DEUX GESTES SUIVENT. « Verser » et « Reprendre » n'auraient servi à
   rien restés au coffre : c'est en regardant un objectif qu'on décide de
   l'alimenter. Les deux modales vivent donc ici, et le Coffre les importe. */

import { useState } from 'react';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtIn } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import { useClients } from '../../../../shared/clients';
import {
  useCoffre, coffreStore, coffreBalance, invoiceRegleXof, useInvoices, useCashboxes,
  useObjectifs, objectifsStore, coffreNonFleche, moisPourAtteindre, type ObjectifCoffre,
  recuDansSaDevise, deviseDuCompartiment, compartimentEtranger, cashboxCurrency,
  caissesEnDevise, motDesCaissesEnDevise,
  type CoffreMovement, type Cashbox,
} from '../../../../shared/finance';
import { ClientPicker } from '../clients/_shared';
import { todayISO, monthKey, monthTitle } from './_shared';
import './finances.css';

/** « septembre 2027 » — l'échéance d'un objectif se dit en toutes lettres. */
const monthLabelLong = (mk: string): string => (mk ? monthTitle(mk) : '');

export function LesObjectifs() {
  const { branch, currency } = useBranch();
  const [moves] = useCoffre();
  const [objectifs, setObjectifs] = useObjectifs();
  const [clients] = useClients();
  const [invoices] = useInvoices();
  const objectifsVivants = objectifs.filter((o) => o.branchId === branch.id && !o.clos);
  const [objOuvert, setObjOuvert] = useState<{ id: string; nom: string; cible: string; echeance: string; devise: string } | null>(null);

  /* LES DEUX GESTES, ICI PLUTÔT QU’AU COFFRE : c’est en regardant un objectif
     qu’on décide de l’alimenter ou d’y reprendre. */
  const [depotOuvert, setDepotOuvert] = useState(false);
  const [repriseOuverte, setRepriseOuverte] = useState(false);
  const balance = coffreBalance(moves.filter((m) => m.branchId === branch.id));

  /* CE QU’UNE CLIENTE A DÉJÀ RÉGLÉ — le dépôt peut s’adosser à son revenu. */
  const clientRevenue = (id: string): number => invoices
    .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.clientId === id)
    .reduce((n, i) => n + invoiceRegleXof(i), 0);
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

  return (
    <>
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
              {balance > 0 && ` Le coffre tient ${fmtMoney(balance, currency)}.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {/* LES DEUX GESTES DE L’ÉPARGNE, à portée de l’objectif qu’ils
                nourrissent — c’est en le regardant qu’on décide d’y verser. */}
            <Button variant="copper" onClick={() => setDepotOuvert(true)}>+ Verser au coffre</Button>
            <Button variant="ghost" onClick={() => setRepriseOuverte(true)} disabled={balance <= 0}>Reprendre du coffre</Button>
            <Button variant="ghost" onClick={() => setObjOuvert({ id: '', nom: '', cible: '', echeance: '', devise: '' })}>+ Objectif</Button>
          </div>
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

      {depotOuvert && (
        <DepositModal
          onClose={() => setDepotOuvert(false)}
          currency={currency}
          clients={clients}
          clientRevenue={clientRevenue}
          onSave={(mv) => { coffreStore.set((prev) => [...prev, mv]); setDepotOuvert(false); }}
          branchId={branch.id}
        />
      )}
      {repriseOuverte && (
        <TransferModal
          onClose={() => setRepriseOuverte(false)}
          currency={currency}
          balance={balance}
          lastBank={moves.find((m) => m.kind === 'virement' && m.bank)?.bank ?? ''}
          onSave={(mv) => { coffreStore.set((prev) => [...prev, mv]); setRepriseOuverte(false); }}
          branchId={branch.id}
        />
      )}
    </>
  );
}

/* ---------- Verser au coffre — dépôt, souvent adossé au revenu d'une cliente ---------- */
export function DepositModal({
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
export function TransferModal({
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
