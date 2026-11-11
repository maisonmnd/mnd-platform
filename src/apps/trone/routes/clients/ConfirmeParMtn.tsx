import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useInvoices } from '../../../../shared/finance';
import type { Appointment } from '../../../../shared/agenda';
import { heureDeCotonou } from '../../../../shared/regler-la-seance-pur';
import { estUneTraceMtn } from '../../../../shared/collecte-mtn-pur';

/* ══ CONFIRMÉ PAR MTN · 11 novembre 2026 (« Régler par MTN, QR ») ═══════
   Sur l'encaissement du rendez-vous : ce que MTN a confirmé, à quelle heure,
   depuis quel numéro (masqué), dans quelle caisse, et la référence MTN. La
   ligne naît seulement quand la fonction collecte-mtn a relu « réussi » chez
   MTN et posé l'argent sur la pièce ; jamais sur le retour de la page. */

const heureDite = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const [h, m] = heureDeCotonou(new Date(ms)).split(':');
  return `${Number(h)} h ${m}`;
};

export function ConfirmeParMtn({ appt }: { appt: Appointment }) {
  const { currency } = useBranch();
  const [pieces] = useInvoices();
  const traces = pieces
    .filter((p) => p.apptId === appt.id)
    .flatMap((p) => (p.reglementsEnLigne ?? []).filter(estUneTraceMtn));
  if (!traces.length) return null;
  return (
    <section aria-label="Confirmé par MTN" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {traces.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderRadius: 4, padding: '10px 14px', fontSize: 13, lineHeight: 1.5 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--copper-200)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 1 }}><path d="M5 12l5 5 9-10" /></svg>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Confirmé par MTN à {heureDite(t.payeLe)} · numéro {t.numeroMasque} · caisse « {t.caisse} »</span>
            <span style={{ color: 'var(--indigo-200)' }}>
              Réglé par MTN {fmtMoney(t.montantXof + (t.pourboireXof ?? 0), currency)}
              {t.pourboireXof > 0 ? `, dont ${fmtMoney(t.pourboireXof, currency)} de merci pour l’équipe` : ''}
              {' · '}frais MTN {fmtMoney(t.fraisXof, currency)} · réf. {t.referenceMtn.slice(0, 8)}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
