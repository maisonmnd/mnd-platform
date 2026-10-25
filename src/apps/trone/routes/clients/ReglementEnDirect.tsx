import { useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { laPieceDuRdv, etatDuLien, type PieceLue } from '../../../../shared/regler-la-seance-pur';
import { adresseDuLien } from '../../../../shared/regler-la-seance';
import { rattrapeLeLien } from '../../../../shared/regler-la-seance-serveur';

/* ══ LE RÈGLEMENT EN DIRECT — 25 octobre 2026 (« Terminer la séance ») ══
   Ce que la cliente fait du lien, sans rafraîchir : la facture écrite, le
   message parti, la page ouverte, l'argent reçu, le reçu parti. Tout se lit
   sur le rendez-vous et sa pièce, que le serveur met à jour (vue 11 du
   canvas du Tableau intelligent). */
const heure = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

type Etape = { nom: string; quand: string; detail: string; fait: boolean };

export function ReglementEnDirect({ appt }: { appt: Appointment }) {
  const { currency } = useBranch();
  const [rdvs] = useAppointments();
  const [pieces] = useInvoices();
  const [relit, setRelit] = useState(false);
  const rdv = rdvs.find((a) => a.id === appt.id) ?? appt;
  const lien = rdv.lienDeReglement;
  if (!lien) return null;
  const piece = laPieceDuRdv(pieces as unknown as PieceLue[], rdv.id);
  const e = etatDuLien(rdv as unknown as Parameters<typeof etatDuLien>[0], piece);
  const dernier = piece?.reglementsEnLigne?.[piece.reglementsEnLigne.length - 1];
  const m = (x: number) => fmtMoney(x, currency);

  const etapes: Etape[] = [
    { nom: 'Message parti', quand: heure(lien.envoyeLe), detail: 'le reste et le bouton « Régler »', fait: !!lien.envoyeLe },
    { nom: 'Ouvert', quand: heure(lien.ouvertLe), detail: 'elle a touché « Régler »', fait: !!lien.ouvertLe },
    {
      nom: dernier ? `Réglé${dernier.moyen ? ` par ${dernier.moyen}` : ''}` : 'Réglé',
      quand: heure(dernier?.payeLe),
      detail: dernier ? `${m(dernier.montantXof)}${dernier.pourboireXof > 0 ? ` + pourboire ${m(dernier.pourboireXof)}` : ''}` : e.etat === 'reglee' ? 'au comptoir' : 'en attente de KkiaPay',
      fait: !!dernier || e.etat === 'reglee',
    },
    { nom: 'Reçu parti', quand: heure(dernier?.recuLe), detail: 'PDF joint', fait: !!dernier?.recuLe },
  ];

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
          {e.etat === 'reglee' ? 'Soldé' : e.etat === 'a-regler' ? <>Reste <b>{m(e.resteXof)}</b> sur {m(e.totalXof)}</> : ''}
        </span>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        {etapes.map((x) => (
          <li key={x.nom} style={{ border: `1px solid ${x.fait ? '#9FCFC5' : 'var(--line, #EDE4D6)'}`, background: x.fait ? '#EAF4F1' : 'transparent', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: x.fait ? '#0A6B5F' : 'var(--ink-soft, #8A847C)' }}>{x.quand || '…'}</span>
            <strong style={{ fontWeight: 500, fontSize: 13, color: x.fait ? '#0A6B5F' : 'inherit' }}>{x.nom}</strong>
            <span className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>{x.detail}</span>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => { void copie(); }}>Copier le lien</Button>
        {e.etat === 'a-regler' && <Button size="sm" variant="ghost" disabled={relit} onClick={() => { void relis(); }}>{relit ? 'Relecture…' : 'Relire chez KkiaPay'}</Button>}
      </div>
    </section>
  );
}
