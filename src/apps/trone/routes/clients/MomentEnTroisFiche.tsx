import { useMemo } from 'react';
import { Button } from '../../../../ds/components';
import type { Appointment } from '../../../../shared/agenda';
import type { Client } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import {
  francsDuTiers, jourDuTiers, lisLesPlansDeLaCliente, motDeLEtat, phraseEncaisserLeTiers, tiersAEncaisser,
} from '../../../../shared/le-moment-en-trois-pur';
import { todayISO } from './_shared';

/* ══ L'ÉCHÉANCIER DU MOMENT, SUR LA FICHE — 7 novembre 2026 ═════════════════
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Maquette « Le Moment en trois venues », écran 2 : trois lignes
   (date, montant, état), le reste dû, et « Encaisser le tiers du jour ».

   La carte ne calcule rien qu'elle puisse lire : elle demande au plan
   (shared/le-moment-en-trois-pur.ts) ce que disent les trois rendez-vous. Le
   reste dû se lit ICI, jamais dans la clôture du jour : la clôture ne compte
   que le tiers encaissé ce jour-là. Peu de mots, comme les fiches voisines. */
export function MomentEnTroisFiche({ client, appts, onEncaisser }: {
  client: Client;
  appts: readonly Appointment[];
  onEncaisser: (a: Appointment) => void;
}) {
  const aujourdhui = todayISO();
  const plans = useMemo(() => lisLesPlansDeLaCliente(appts, client.id, aujourdhui), [appts, client.id, aujourdhui]);
  /* Un plan soldé se retire de la fiche : il se relit dans les rendez-vous. */
  const ouverts = plans.filter((p) => p.lecture.resteXof > 0);
  if (ouverts.length === 0) return null;
  const appel = appelDe(client, undefined);
  return (
    <div className="mnd-card" style={{ padding: '14px 16px', margin: '12px 0' }} aria-label="Le Moment en trois venues">
      {ouverts.map(({ planId, lecture }) => {
        const duJour = lecture.tiersDuJour;
        const rdvDuJour = duJour?.rdvId ? appts.find((a) => a.id === duJour.rdvId) : undefined;
        const aEncaisser = rdvDuJour ? tiersAEncaisser(rdvDuJour) : 0;
        return (
          <div key={planId} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--color-copper)' }}>Le Moment · 3 venues</div>
            {lecture.lignes.map((l) => (
              <div key={l.rang} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ minWidth: 0 }}>
                  {l.rang}. {jourDuTiers(l.dateIso)}
                  <span className="mnd-muted" style={{ marginLeft: 8, fontSize: 12 }}>{motDeLEtat(l.etat)}</span>
                </span>
                <b style={{ fontWeight: 600 }}>{francsDuTiers(l.montantXof)}</b>
              </div>
            ))}
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              Reste dû : <b>{francsDuTiers(lecture.resteXof)}</b>
              {lecture.enPause ? ' · le Moment attend ce tiers' : ''}
            </p>
            {aEncaisser > 0 && rdvDuJour && (
              <div style={{ marginTop: 8 }}>
                <Button variant="copper" size="sm" onClick={() => onEncaisser(rdvDuJour)}>
                  {phraseEncaisserLeTiers(appel, aEncaisser)}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
