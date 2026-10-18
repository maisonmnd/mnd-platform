import { useSettings } from '../../../../shared/settings';
import { invoiceResteXof, type Invoice } from '../../../../shared/finance';
import { jourDuSalon } from '../../../../shared/envois';
import { jourDit } from '../../../../shared/gestes-conversation';
import { jourLocal } from '../../../../shared/mnd-pay-pur';
import { CADENCE_DES_RELANCES, departDesRelances, etatDesRelances, jourPlusR } from '../../../../shared/relances-pur';
import { useEnvois } from '../equipe/data';

/* ══ LES RELANCES D'UNE FACTURE, AU COMPTOIR — 18 octobre 2026 ══════════
   Maquette « Les relances » validée : la facture dit où en sont ses
   relances (parties, prochaine), et toute personne qui encaisse peut les
   mettre en pause (« elle passe régler samedi ») ou les reprendre. La pause
   vit sur la facture ; la tournée du serveur la lit. Rien ne s'affiche tant
   que les relances sont éteintes ou que la facture n'en a pas (d'avant le
   lancement, hors rattrapage). */
export function BlocRelances({ facture, qui, pose }: {
  facture: Invoice;
  qui?: string;
  pose: (patch: Partial<Invoice>) => void;
}) {
  const [settings] = useSettings();
  const [envois] = useEnvois();
  const depart = departDesRelances(facture, settings.relances, jourDuSalon);
  const reste = invoiceResteXof(facture);
  if (!depart || facture.kind !== 'facture' || facture.status === 'brouillon' || !(reste > 0)) return null;
  const enPause = !!facture.relancesPause;
  const aujourdhui = jourLocal(new Date().toISOString());
  const e = etatDesRelances({ factureId: facture.id, depart, journal: envois, resteXof: reste, enPause, aujourdhui, jourDe: jourDuSalon });
  const total = CADENCE_DES_RELANCES.length;
  /* La tournée passe à 10 h : passé cette heure, la relance « du jour » partira demain. */
  const prochaine = e.prochaine && e.prochaine <= aujourdhui && new Date().getHours() >= 10 ? jourPlusR(aujourdhui, 1) : e.prochaine;
  const dit = enPause
    ? `En pause depuis le ${jourDit(jourDuSalon(facture.relancesPause!.le))}${facture.relancesPause!.par ? `, par ${facture.relancesPause!.par}` : ''}.`
    : e.fini
      ? `Les ${total} relances sont parties, la dernière le ${jourDit(e.derniereLe ?? aujourdhui)}. La direction l’appelle.`
      : `${e.parties === 0 ? 'Aucune relance partie' : `${e.parties} sur ${total} partie${e.parties > 1 ? 's' : ''}`}${prochaine ? ` · prochaine le ${jourDit(prochaine)} à 10 h` : ''}.`;
  return (
    <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--hairline, #E2D8C6)', borderRadius: 8 }} data-relances={enPause ? 'pause' : e.fini ? 'fini' : String(e.parties)}>
      <span style={{ fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--color-cuivre, #9A6036)' }}>Relances sur WhatsApp</span>
      <span style={{ fontSize: 13 }}>{dit}</span>
      {!e.fini && (
        <button
          type="button"
          className="trv-wa-btn"
          style={{ border: 'none', cursor: 'pointer', justifySelf: 'start' }}
          onClick={() => pose(enPause ? { relancesPause: undefined } : { relancesPause: { le: new Date().toISOString(), ...(qui ? { par: qui } : {}) } })}
        >
          {enPause ? 'Reprendre les relances' : 'Mettre en pause'}
        </button>
      )}
    </div>
  );
}
