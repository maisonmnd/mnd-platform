import { useEffect, useMemo, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useInvoices, type Invoice } from '../../../../shared/finance';
import { laPieceDuRdv, etatDuLien, type PieceLue } from '../../../../shared/regler-la-seance-pur';
import { adresseDuLien } from '../../../../shared/regler-la-seance';
import { rattrapeLeLien } from '../../../../shared/regler-la-seance-serveur';
import { marqueDeLaFinAuCarnet } from '../../../../shared/terminer-et-regler-pur';
import { heureDuSalon } from '../../../../shared/calendrier';
import {
  ETAPES_DU_FAUTEUIL, NOMS_DES_ETAPES, estFranchie, etapeDuFauteuil, gesteDemande, gesteDit, heureDit,
  leFauteuilDit, moyenDitDuSceau, type EtapeDuFauteuil,
} from '../../../../shared/le-sceau-pur';
import { oublieLeFilDuSceau, souffleSurLeFilDuSceau } from '../../../../shared/le-fil-du-sceau-trone';

/* ══ LE RÈGLEMENT EN DIRECT — 25 octobre 2026 (« Terminer la séance ») ══
   Ce que la cliente fait du lien, sans rafraîchir : la facture écrite, le
   message parti, la page ouverte, l'argent reçu, le reçu parti. Tout se lit
   sur le rendez-vous et sa pièce, que le serveur met à jour (vue 11 du
   canvas du Tableau intelligent).

   ══ LE SCEAU (22 novembre 2026, maquette LK7GvACWPzWgJ7WNZeZigp) ═══════
   Le même suivi, aux cinq étapes de la maquette — le rituel, la note partie,
   sa note ouverte, le sceau posé, scellé — et deux gestes de plus :
   · « Offrir un geste » : le maître tape lui-même un montant en francs ou un
     pourcentage ; la note de la cliente baisse À L'INSTANT, sans qu'elle
     recharge (le geste entre dans la remise de la pièce, `globalDiscountXof`,
     et `gesteDeLaMaison` garde de quoi le retirer sans toucher aux autres
     remises qu'elle porterait) ;
   · le fil : à chaque changement de la pièce, le Trône souffle « relis » sur
     le jeton du rendez-vous. Le signal ne porte RIEN — ni nom, ni montant ;
     c'est la page qui relit son reste au serveur.
   L'argent ne s'écrit jamais ici : il n'entre qu'à la confirmation de MTN ou
   de KkiaPay. */
/* L'heure du salon, jamais celle du poste (20 novembre 2026 : un ordinateur
    à l'heure de Chine disait 22:13 d'un message parti à 15 h 13). */
const heure = heureDuSalon;

const francs = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;

export function ReglementEnDirect({ appt }: { appt: Appointment }) {
  const { currency } = useBranch();
  const [rdvs] = useAppointments();
  const [pieces, setPieces] = useInvoices();
  const [relit, setRelit] = useState(false);
  /* Le tiroir du geste : ouvert, son mode, ce qu'il tape. */
  const [gesteOuvert, setGesteOuvert] = useState(false);
  const [mode, setMode] = useState<'xof' | 'pct'>('xof');
  const [saisie, setSaisie] = useState('');

  const rdv = rdvs.find((a) => a.id === appt.id) ?? appt;
  const lien = rdv.lienDeReglement;
  const piece = laPieceDuRdv(pieces as unknown as PieceLue[], rdv.id);
  const facture = piece ? (pieces as Invoice[]).find((p) => p.id === piece.id) ?? null : null;
  const e = etatDuLien(rdv as unknown as Parameters<typeof etatDuLien>[0], piece);
  const etape = etapeDuFauteuil({ lien, etat: e.etat });
  const dernier = piece?.reglementsEnLigne?.[piece.reglementsEnLigne.length - 1];
  const m = (x: number) => fmtMoney(x, currency);
  const jeton = lien?.jeton ?? '';

  /* ELLE A TERMINÉ ELLE-MÊME (6 novembre 2026, Terminer et régler) : aucun
     message n'est parti, c'est elle qui a ouvert le règlement. La marque dit
     où elle en est. */
  const fin = rdv.termineParElle;
  const marque = fin ? marqueDeLaFinAuCarnet(rdv, piece ? { resteXof: e.resteXof, versements: piece.payments ?? [] } : null) : null;
  const PORTE_DITE = { couronne: 'depuis Ma Couronne', site: 'depuis le site', whatsapp: 'sur le WhatsApp de la Maison' } as const;

  /* LES CINQ ÉTAPES, chacune avec son instant et son détail. */
  const quand: Record<EtapeDuFauteuil, string> = {
    rituel: fin ? heure(fin.le) : '',
    note: heure(lien?.envoyeLe),
    page: heure(lien?.ouvertLe),
    regle: heure(lien?.sceauLe),
    scelle: heure(dernier?.payeLe) || (e.etat === 'reglee' ? '—' : ''),
  };
  const detail: Record<EtapeDuFauteuil, string> = {
    rituel: fin ? (PORTE_DITE[fin.par] ?? 'en ligne') : 'la note, ou le médaillon',
    note: lien?.envoyeLe ? 'sur son WhatsApp' : 'à envoyer',
    page: lien?.ouvertLe ? 'elle lit sa note' : 'pas encore ouverte',
    regle: lien?.sceauLe ? (moyenDitDuSceau(lien.moyen)?.par ?? 'le sceau est posé') : 'le sceau, une seconde',
    scelle: dernier
      ? `${m(dernier.montantXof)}${dernier.pourboireXof > 0 ? ` + merci ${m(dernier.pourboireXof)}` : ''}`
      : e.etat === 'reglee' ? 'réglé au comptoir' : 'en attente du paiement',
  };

  /* ══ LE FIL : un souffle à chaque changement de la pièce ═══════════════
     L'empreinte ne retient que ce qui se VOIT chez elle : ses lignes, la
     remise (donc le geste), et le reste. Pas le nom, pas le numéro. */
  const empreinte = useMemo(() => {
    if (!jeton || !piece) return '';
    return [piece.id, (piece.lines ?? []).length, piece.globalDiscountXof ?? 0, piece.globalDiscountPct ?? 0, e.resteXof].join('|');
  }, [jeton, piece, e.resteXof]);
  const premierSouffle = useMemo(() => ({ fait: false }), [jeton]);
  useEffect(() => {
    if (!jeton || !empreinte) return;
    /* Le premier passage est celui du montage : la page vient de se lire, le
       souffle n'apprendrait rien. */
    if (!premierSouffle.fait) { premierSouffle.fait = true; return; }
    souffleSurLeFilDuSceau(jeton);
  }, [jeton, empreinte, premierSouffle]);
  useEffect(() => () => { if (jeton) oublieLeFilDuSceau(jeton); }, [jeton]);

  /* ══ LE GESTE OFFERT ═══════════════════════════════════════════════════ */
  const geste = piece?.gesteDeLaMaison;
  const baseDuGeste = Math.max(0, e.resteXof);
  const lu = gesteDemande(saisie, mode, baseDuGeste);

  const poserLeGeste = () => {
    if (!lu.ok || !facture) return;
    const avant = Number(facture.globalDiscountXof) || 0;
    const neuve: Invoice = {
      ...facture,
      globalDiscountXof: avant + lu.xof,
      gesteDeLaMaison: { xof: lu.xof, mode: lu.mode, dit: lu.dit, quand: new Date().toISOString() },
    };
    setPieces((prev) => prev.map((x) => (x.id === neuve.id ? neuve : x)));
    setGesteOuvert(false);
    setSaisie('');
    toast(`Geste offert : ${francs(lu.xof)}. Sa note vient de baisser sur son téléphone.`);
  };

  const retirerLeGeste = () => {
    if (!facture || !geste?.xof) return;
    const avant = Number(facture.globalDiscountXof) || 0;
    const { gesteDeLaMaison: _g, ...sans } = facture;
    const neuve: Invoice = { ...sans, globalDiscountXof: Math.max(0, avant - Number(geste.xof)) };
    setPieces((prev) => prev.map((x) => (x.id === neuve.id ? neuve : x)));
    setGesteOuvert(false);
    toast('Le geste est retiré. Sa note remonte.');
  };

  if (!lien) return null;

  const copie = async () => {
    try { await navigator.clipboard.writeText(adresseDuLien(lien.jeton)); toast('Lien copié : collez-le dans sa conversation.'); }
    catch { toast(adresseDuLien(lien.jeton), 9000); }
  };
  const relis = async () => {
    setRelit(true);
    const r = await rattrapeLeLien(lien.jeton);
    setRelit(false);
    toast(r.ok ? (Number(r.rattrapes) > 0 ? 'Un paiement retrouvé chez KkiaPay : il est posé sur la facture.' : 'Rien de neuf chez KkiaPay pour ce rendez-vous.') : `Relecture impossible : ${r.error ?? 'réseau'}.`);
  };

  return (
    <section aria-label="Le règlement en direct" style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--paper, #FFFDF9)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ font: '500 11px Jost, system-ui, sans-serif', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper, #9A6036)' }}>Le règlement en direct</span>
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {e.etat === 'reglee' ? 'Scellé' : e.etat === 'a-regler' ? <>Reste <b>{m(e.resteXof)}</b> sur {m(e.totalXof)}</> : ''}
        </span>
      </div>
      {marque && (
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong style={{ fontWeight: 500 }}>{marque.dit}</strong>
          <span className="mnd-muted"> · {marque.sous}</span>
        </p>
      )}
      {/* CE QUE LE TRÔNE VOIT DU FAUTEUIL, en une phrase (maquette). */}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }} aria-live="polite">
        {leFauteuilDit({ etape, moyen: lien.moyen, sceauLe: lien.sceauLe })}
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8 }}>
        {ETAPES_DU_FAUTEUIL.map((k) => {
          const fait = estFranchie(etape, k);
          const ici = k === etape;
          return (
            <li key={k} style={{ border: `1px solid ${fait || ici ? '#9FCFC5' : 'var(--line, #EDE4D6)'}`, background: fait ? '#EAF4F1' : 'transparent', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: fait || ici ? '#0A6B5F' : 'var(--ink-soft, #8A847C)' }}>{quand[k] || '…'}</span>
              <strong style={{ fontWeight: ici ? 600 : 500, fontSize: 13, color: fait || ici ? '#0A6B5F' : 'inherit' }}>{NOMS_DES_ETAPES[k]}</strong>
              <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>{detail[k]}</span>
            </li>
          );
        })}
      </ol>
      {dernier?.recuLe && <p style={{ margin: 0, fontSize: 12 }} className="mnd-muted">Reçu parti à {heure(dernier.recuLe)}, la facture jointe.</p>}

      {/* LE GESTE OFFERT — 22 novembre 2026. */}
      <div style={{ borderTop: '1px solid var(--line, #EDE4D6)', paddingTop: 10, display: 'grid', gap: 8 }}>
        {geste?.xof ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13 }}>
            <span><b style={{ fontWeight: 500 }}>Geste de la Maison</b> <span className="mnd-muted">· {geste.mode === 'pct' ? `${String(geste.dit).replace('.', ',')} %` : ''} elle le voit sur sa note</span></span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>− {m(Number(geste.xof))}</span>
          </div>
        ) : null}
        {gesteOuvert ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant={mode === 'xof' ? 'indigo' : 'ghost'} onClick={() => { setMode('xof'); setSaisie(''); }}>En francs</Button>
              <Button size="sm" variant={mode === 'pct' ? 'indigo' : 'ghost'} onClick={() => { setMode('pct'); setSaisie(''); }}>En pourcentage</Button>
            </div>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <span className="mnd-muted">{mode === 'pct' ? 'Le pourcentage offert' : 'Le montant offert, en francs'}</span>
              <input
                inputMode={mode === 'pct' ? 'decimal' : 'numeric'} autoComplete="off"
                value={saisie} placeholder={mode === 'pct' ? '10' : '1 000'}
                onChange={(ev) => setSaisie(ev.target.value)}
                style={{ border: '1px solid var(--line, #E5D8C6)', borderRadius: 4, padding: '6px 9px', font: 'inherit', fontSize: 14, width: 140, fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12 }} className="mnd-muted">{gesteDit(saisie, mode, baseDuGeste, francs)}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button size="sm" variant="indigo" disabled={!lu.ok} onClick={poserLeGeste}>Offrir ce geste</Button>
              <Button size="sm" variant="ghost" onClick={() => { setGesteOuvert(false); setSaisie(''); }}>Fermer</Button>
              {geste?.xof ? <Button size="sm" variant="ghost" onClick={retirerLeGeste}>Retirer le geste</Button> : null}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" disabled={!facture || e.etat === 'reglee'}
              onClick={() => { setMode(geste?.mode ?? 'xof'); setSaisie(geste?.dit ? String(geste.dit).replace('.', ',') : ''); setGesteOuvert(true); }}>
              {geste?.xof ? 'Modifier le geste' : 'Offrir un geste'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { void copie(); }}>Copier le lien</Button>
            {e.etat === 'a-regler' && <Button size="sm" variant="ghost" disabled={relit} onClick={() => { void relis(); }}>{relit ? 'Relecture…' : 'Relire chez KkiaPay'}</Button>}
          </div>
        )}
      </div>
    </section>
  );
}
