import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { ChampDeDate, ChampDeMois } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useCashboxes, useEntreesHorsActivite, entreesHorsActiviteStore, type MouvementHorsActivite,
} from '../../../../shared/finance';
import {
  MOTIF_PRELEVEMENT, MOTIF_REMBOURSEMENT, lignesDuCompteCourant, soldeDuCompteCourant,
  retenuesEnAttenteXof, periodeSuivante, pourquoiRetenueImpossible, type RetenueCompteCourant,
} from '../../../../shared/compte-courant';
import { useStaff, staffStore } from '../equipe/data';
import { usePayrollRuns } from '../equipe/payroll';
import { useMotifsFoyer } from '../../../../shared/foyer';
import { todayISO } from './_shared';

/* LE COMPTE COURANT D'ASSOCIÉ — 27 septembre 2026 au soir, maquette validée
   (`public/maquette-la-societe-et-les-depenses-perso.html`, « construis »).
   Une page par associé : ce que la Maison a avancé pour lui, ce qu'il a
   rendu en caisse, ce que ses bulletins ont retenu, et le solde. Trois
   gestes : un prélèvement, un remboursement en caisse, une retenue posée
   sur un bulletin à venir. Le calcul vit dans `shared/compte-courant`,
   éprouvé par `verifie-le-compte-courant` ; cet écran ne fait que montrer.

   QUI EST ASSOCIÉ se coche sur la fiche du membre (Équipe → Personnel,
   « Associé de la société »), par la direction : le relevé ne devine pas. */

const DEVISE = 'XOF';
const litXof = (s: string): number => Math.round(parseFloat(s.replace(/[\s  ]/g, '').replace(',', '.')) || 0);

type Geste = 'prelevement' | 'remboursement' | 'retenue';

export default function CompteCourant() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [mouvements] = useEntreesHorsActivite();
  const [cashboxes] = useCashboxes();
  const [runs] = usePayrollRuns();
  const associes = useMemo(
    () => staff.filter((m) => m && m.branchId === branch.id && m.associe === true),
    [staff, branch.id],
  );
  const [choisiId, setChoisiId] = useState<string>('');
  const associe = associes.find((m) => m.id === choisiId) ?? associes[0];
  const caisses = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);

  const retenues: RetenueCompteCourant[] = associe?.retenuesCompteCourant ?? [];
  const lignes = useMemo(
    () => (associe ? lignesDuCompteCourant(mouvements, branch.id, associe.id, retenues) : []),
    [mouvements, branch.id, associe, retenues],
  );
  const solde = soldeDuCompteCourant(lignes);
  const enAttente = retenuesEnAttenteXof(retenues);
  const prevues = retenues.filter((r) => !r.runId);

  /* La période proposée pour une retenue : le run en brouillon s'il y en a
     un, sinon le mois qui suit le dernier run, sinon le mois qui vient. */
  const periodeProposee = useMemo(() => {
    const dIci = runs.filter((r) => r.branchId === branch.id);
    const brouillon = dIci.find((r) => r.status === 'brouillon');
    if (brouillon) return brouillon.period;
    const dernier = dIci.map((r) => r.period).sort().pop();
    return dernier ? periodeSuivante(dernier) : periodeSuivante(todayISO().slice(0, 7));
  }, [runs, branch.id]);

  /* LE POURQUOI PARLE LA LANGUE DU FOYER — 28 septembre 2026 (Yéman, au
     sélecteur) : les mêmes motifs que Salon & Foyer (Maison, Nourriture,
     École, Santé…), lus dans leur magasin pour suivre un motif renommé, et
     une phrase en plus. Le foyer, lui, vit sur les salaires : ce qui sort
     ici de la caisse pour lui va sur la page de Yéman, décision du même
     jour. */
  const [motifsFoyer] = useMotifsFoyer();
  const [geste, setGeste] = useState<Geste | null>(null);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [phrase, setPhrase] = useState('');
  const [caisse, setCaisse] = useState('');
  const [date, setDate] = useState(todayISO());
  const [periode, setPeriode] = useState(periodeProposee);
  const ouvre = (g: Geste) => {
    setGeste(g); setPhrase(''); setMotif(''); setDate(todayISO()); setCaisse(caisses[0]?.name ?? ''); setPeriode(periodeProposee);
    setMontant(g === 'retenue' ? String(Math.max(0, solde - enAttente)) : '');
  };
  const ferme = () => setGeste(null);

  const enregistre = () => {
    if (!associe) return;
    const xof = litXof(montant);
    if (geste === 'retenue') {
      const quoi = pourquoiRetenueImpossible(xof, solde, enAttente);
      if (quoi) { toast(quoi); return; }
      const neuve: RetenueCompteCourant = { id: `rcc-${uid()}`, period: periode, amountXof: xof, poseLe: new Date().toISOString() };
      staffStore.set((prev) => prev.map((m) => (m.id === associe.id
        ? { ...m, retenuesCompteCourant: [...(m.retenuesCompteCourant ?? []), neuve] }
        : m)));
      toast(`${fmtMoney(xof, DEVISE)} seront retenus sur le bulletin de ${periode}. Le relevé le comptera au règlement du run.`);
      ferme();
      return;
    }
    if (!(xof > 0)) { toast('Écrivez le montant.'); return; }
    if (!caisse.trim()) { toast(geste === 'prelevement' ? 'Choisissez la caisse d’où sort l’argent.' : 'Choisissez la caisse qui reçoit l’argent.'); return; }
    if (geste === 'prelevement' && !motif && !phrase.trim()) { toast('Dites à quoi cet argent a servi, un motif ou un mot : dans six mois, il faudra le savoir.'); return; }
    const pourquoi = [motif, phrase.trim()].filter(Boolean).join(' · ');
    const mouvement: MouvementHorsActivite = {
      id: `hors-${uid()}`,
      branchId: branch.id,
      date,
      sens: geste === 'prelevement' ? 'sortie' : 'entree',
      motif: geste === 'prelevement' ? MOTIF_PRELEVEMENT : MOTIF_REMBOURSEMENT,
      label: geste === 'prelevement'
        ? `${associe.name} · ${pourquoi}`
        : `${associe.name} · remboursement du compte courant${phrase.trim() ? ` · ${phrase.trim()}` : ''}`,
      amountXof: xof,
      cashbox: caisse,
      staffId: associe.id,
    };
    entreesHorsActiviteStore.set((prev) => [...prev, mouvement]);
    toast(geste === 'prelevement'
      ? `Prélèvement inscrit au compte de ${associe.name}. Il ne touche pas au résultat.`
      : `Remboursement reçu dans « ${caisse} ». Le solde de ${associe.name} baisse d’autant.`);
    ferme();
  };

  const retireLaRetenuePrevue = (id: string) => {
    if (!associe) return;
    staffStore.set((prev) => prev.map((m) => (m.id === associe.id
      ? { ...m, retenuesCompteCourant: (m.retenuesCompteCourant ?? []).filter((r) => r.id !== id || !!r.runId) }
      : m)));
  };

  const cellule: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid var(--hairline)', verticalAlign: 'top', fontSize: 13.5 };
  const num: React.CSSProperties = { ...cellule, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

  return (
    <div>
      <style>{'@media print { .cc-actions, .trf-tabs, .tr-page-head .sub { display: none !important; } }'}</style>
      <PageHead
        eyebrow="Finances · les associés"
        title="Le compte courant d’associé."
        sub="Ce que la Maison a avancé pour un associé, ce qu’il a rendu, ce que ses bulletins ont retenu. Hors du résultat, toujours."
        actions={associe && (
          <div className="cc-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="copper" onClick={() => ouvre('prelevement')}>+ Prélèvement</Button>
            <Button onClick={() => ouvre('remboursement')}>Remboursement en caisse</Button>
            <Button onClick={() => ouvre('retenue')}>Retenir sur un bulletin</Button>
            <Button variant="ghost" onClick={() => window.print()}>Imprimer le relevé</Button>
          </div>
        )}
      />

      {associes.length === 0 ? (
        <Card style={{ padding: 22 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>Aucun associé n’est déclaré.</div>
          <p className="mnd-muted" style={{ marginTop: 8, maxWidth: 560, lineHeight: 1.6 }}>
            Le relevé ne devine pas qui est associé. Sur la fiche de chaque associé (Équipe → Personnel), la direction coche « Associé de la société », et sa page apparaît ici.
          </p>
          <p style={{ marginTop: 12 }}><Link to="/personnel" className="tre-link-btn">Ouvrir le personnel</Link></p>
        </Card>
      ) : (
        <>
          {associes.length > 1 && (
            <div className="trf-tabs">
              {associes.map((m) => (
                <button key={m.id} className={`trf-tab ${associe?.id === m.id ? 'is-active' : ''}`} onClick={() => setChoisiId(m.id)}>{m.name}</button>
              ))}
            </div>
          )}
          {associe && (
            <>
              <div className="tr-grid tr-grid--3" style={{ marginTop: 14 }}>
                <Card style={{ padding: 18 }}>
                  <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                    {solde > 0 ? 'Solde dû à la Maison' : solde < 0 ? 'La Maison lui doit' : 'Solde'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, marginTop: 4, color: solde > 0 ? 'var(--color-copper)' : solde < 0 ? 'var(--color-indigo)' : '#2F5D50' }}>
                    {solde === 0 ? 'À zéro' : fmtMoney(Math.abs(solde), DEVISE)}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>{associe.name}</div>
                </Card>
                <Card style={{ padding: 18 }}>
                  <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>Prévu sur les bulletins</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, marginTop: 4, color: 'var(--color-indigo)' }}>{enAttente > 0 ? fmtMoney(enAttente, DEVISE) : 'Rien'}</div>
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {prevues.length === 0 ? 'Aucune retenue en attente.' : prevues.map((r) => `${r.period} · ${fmtMoney(r.amountXof, DEVISE)}`).join(' · ')}
                  </div>
                </Card>
                <Card style={{ padding: 18 }}>
                  <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>Reste à prévoir</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, marginTop: 4, color: 'var(--color-indigo)' }}>
                    {Math.max(0, solde - enAttente) > 0 ? fmtMoney(solde - enAttente, DEVISE) : 'Rien'}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>Ce qui est dû et qu’aucun bulletin ne retient encore.</div>
                </Card>
              </div>

              {prevues.length > 0 && (
                <Card style={{ padding: 14, marginTop: 14, borderLeft: '3px solid var(--color-copper)' }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Retenues prévues.</b>
                    {' '}Elles se posent sur le bulletin de la période à la création du run, et ne comptent au relevé qu’au règlement.
                    {' '}
                    {prevues.map((r) => (
                      <span key={r.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 10 }}>
                        {r.period} · {fmtMoney(r.amountXof, DEVISE)}
                        <button className="tre-link-btn cc-actions" onClick={() => retireLaRetenuePrevue(r.id)}>retirer</button>
                      </span>
                    ))}
                  </div>
                </Card>
              )}

              <Card style={{ padding: 0, marginTop: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Date', 'Quoi', 'Caisse', 'Prélèvement', 'Retour'].map((t, i) => (
                        <th key={t} style={{ ...cellule, textAlign: i >= 3 ? 'right' : 'left', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)', background: 'var(--surface-2, transparent)' }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.length === 0 && (
                      <tr><td colSpan={5} className="mnd-muted" style={{ ...cellule, padding: 18 }}>Rien encore. Le premier prélèvement, ou le solde de départ au 30 septembre, s’inscrit avec « + Prélèvement ».</td></tr>
                    )}
                    {lignes.map((l) => (
                      <tr key={l.id}>
                        <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{l.date.split('-').reverse().join('/')}</td>
                        <td style={cellule}>{l.quoi}</td>
                        <td style={{ ...cellule, color: 'var(--ink-soft)' }}>{l.ou}</td>
                        <td style={{ ...num, color: 'var(--color-copper)' }}>{l.prelevementXof > 0 ? fmtMoney(l.prelevementXof, DEVISE) : ''}</td>
                        <td style={{ ...num, color: 'var(--color-indigo)' }}>{l.retourXof > 0 ? fmtMoney(l.retourXof, DEVISE) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}

      {geste && associe && (
        <Modal
          title={geste === 'prelevement' ? `Un prélèvement · ${associe.name}.` : geste === 'remboursement' ? `Un remboursement en caisse · ${associe.name}.` : `Retenir sur un bulletin · ${associe.name}.`}
          onClose={ferme}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {geste === 'retenue' ? (
              <>
                <Field label="Le bulletin visé"><ChampDeMois value={periode} onChange={(iso: string) => setPeriode(iso)} /></Field>
                <Field label="Montant à retenir"><Input inputMode="numeric" autoFocus value={montant} onChange={(e) => setMontant(e.target.value)} /></Field>
                <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                  Dû aujourd’hui : {fmtMoney(solde, DEVISE)}{enAttente > 0 ? `, dont ${fmtMoney(enAttente, DEVISE)} déjà prévus` : ''}. La retenue respecte le plafond de la Maison sur le net du mois ; ce qu’il ne laisse pas passer se reporte au mois suivant.
                </div>
              </>
            ) : (
              <>
                {geste === 'prelevement' && (
                  <Field label="À quoi cet argent a servi · les motifs du foyer">
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {motifsFoyer.map((m) => (
                        <button key={m.id} type="button" className={`tre-chip ${motif === m.name ? 'is-on' : ''}`} onClick={() => setMotif(motif === m.name ? '' : m.name)}>{m.name}</button>
                      ))}
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6 }}>Pour le foyer, la page de Yéman porte le prélèvement (décision du 28 septembre).</div>
                  </Field>
                )}
                <Field label={geste === 'prelevement' ? 'Un mot, en plus du motif' : 'Un mot, si vous voulez'}>
                  <Input autoFocus value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={geste === 'prelevement' ? 'Solde de départ au 30 septembre' : ''} />
                </Field>
                <div className="tr-grid tr-grid--2">
                  <Field label="Montant"><Input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} /></Field>
                  <Field label={geste === 'prelevement' ? 'D’où sort l’argent' : 'Où entre l’argent'}>
                    <Select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
                      {caisses.length === 0 && <option value="">Aucune caisse ouverte</option>}
                      {caisses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Date"><ChampDeDate compact sens="arriere" value={date} onChange={(iso: string) => setDate(iso)} /></Field>
                <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--copper-50)', padding: '11px 14px', fontSize: 12.5, lineHeight: 1.6 }}>
                  {geste === 'prelevement'
                    ? <><b style={{ fontWeight: 600, color: 'var(--color-indigo)' }}>Ce n’est pas une charge.</b> La caisse baisse, le résultat ne bouge pas : l’associé doit cette somme à la Maison.</>
                    : <><b style={{ fontWeight: 600, color: 'var(--color-indigo)' }}>Ce n’est pas un gain.</b> La caisse monte, le chiffre d’affaires ne bouge pas : l’associé rend ce qu’il devait.</>}
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={ferme}>Annuler</Button>
              <Button variant="copper" onClick={enregistre}>
                {geste === 'prelevement' ? 'Inscrire le prélèvement' : geste === 'remboursement' ? 'Inscrire le remboursement' : 'Poser la retenue'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
