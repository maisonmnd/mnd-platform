import { useMemo, useState } from 'react';
import { useSettings } from '../../../../shared/settings';
import { invoiceResteXof, useInvoices, type Invoice } from '../../../../shared/finance';
import { useClients, useFamilies } from '../../../../shared/clients';
import { useSubscribers } from '../../../../shared/abonnements';
import { appelDe } from '../../../../shared/civilite';
import { fmtMoney } from '../../../../shared/currency';
import { jourDuSalon } from '../../../../shared/envois';
import { jourDit } from '../../../../shared/gestes-conversation';
import { jourLocal } from '../../../../shared/mnd-pay-pur';
import {
  departDesRelances, etatDesRelancesDeLaPiece, jourPlusR, relanceDeLaPiece, type DecalageDesRelances,
} from '../../../../shared/relances-pur';
import { useEnvois } from '../equipe/data';

/* ══ LES RELANCES D'UNE FACTURE, AU COMPTOIR — 18 octobre 2026 ══════════
   Maquette « Les relances » validée : la facture dit où en sont ses
   relances (parties, prochaine), et toute personne qui encaisse peut les
   mettre en pause (« elle passe régler samedi ») ou les reprendre. La pause
   vit sur la facture ; la tournée du serveur la lit. Rien ne s'affiche tant
   que les relances sont éteintes ou que la facture n'en a pas (d'avant le
   lancement, hors rattrapage).

   28 OCTOBRE 2026 : la facture dit à qui part son rappel (le payeur du
   compte famille d'abord), avec quelles autres factures du même numéro, sur
   quel rythme (cliente seule ou compte famille, réglés dans Paramètres), et
   l'on peut « Décaler la prochaine relance » à un jour choisi (« il paie le
   5 »). Jugé comme la tournée de 10 h (`relanceDeLaPiece`). */
const RYTHME_DIT = (c: readonly number[]) => c.map((j) => `J+${j}`).join(', ');

export function BlocRelances({ facture, qui, pose }: {
  facture: Invoice;
  qui?: string;
  pose: (patch: Partial<Invoice>) => void;
}) {
  const [settings] = useSettings();
  const [envois] = useEnvois();
  const [factures, setFactures] = useInvoices();
  const [clients] = useClients();
  const [familles] = useFamilies();
  const [contrats] = useSubscribers();
  const [jourChoisi, setJourChoisi] = useState('');
  const aujourdhui = jourLocal(new Date().toISOString());
  const r = settings.relances;

  const piecesDesContrats = useMemo(() => new Set(contrats.map((c) => c.invoiceId).filter((x): x is string => !!x)), [contrats]);
  const estFormule = (p: Invoice) => piecesDesContrats.has(p.id) || /^Abonnement\b/.test(p.note ?? '');
  /* La facture ouverte telle qu'on la voit, avec ses retouches pas encore relues du magasin. */
  const pieces = useMemo(() => [facture, ...factures.filter((f) => f.id !== facture.id)], [facture, factures]);
  const rel = useMemo(() => relanceDeLaPiece({
    piece: facture, pieces, fiches: clients, familles, reglages: r, journal: envois, aujourdhui,
    jourDe: jourDuSalon, resteDe: invoiceResteXof, estFormule,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [facture, pieces, clients, familles, r, envois, aujourdhui, piecesDesContrats]);

  /* La pièce d'une formule garde sa suite d'échéances (le contrat fait foi). */
  if (estFormule(facture)) return <BlocDUneFormule facture={facture} qui={qui} pose={pose} />;
  if (!rel || facture.kind !== 'facture' || facture.status === 'brouillon') return null;

  const e = rel.etat;
  /* La tournée passe à 10 h : passé cette heure, la relance « du jour » partira demain. */
  const prochaine = e.prochaine && e.prochaine <= aujourdhui && new Date().getHours() >= 10 ? jourPlusR(aujourdhui, 1) : e.prochaine;
  const groupe = rel.membres.length > 1;
  const nomDe = (p: Invoice) => clients.find((c) => c.id === (p.forClientId ?? p.clientId))?.name?.split(/\s+/)[0] || p.clientName || 'Cliente';
  const aQui = rel.destinataire ? appelDe(clients.find((c) => c.id === rel.destinataire?.id) ?? rel.destinataire) : 'personne : aucun numéro';
  const pause = rel.membres.find((p) => !!p.relancesPause)?.relancesPause;
  const porteLaPause = rel.membres.find((p) => !!p.relancesPause);

  /* Poser sur une autre facture du rappel : le magasin, comme l'écran des factures. */
  const poseSur = (ids: readonly string[], patch: (p: Invoice) => Partial<Invoice>) => {
    if (ids.includes(facture.id)) pose(patch(facture));
    const autres = ids.filter((id) => id !== facture.id);
    if (autres.length) setFactures((avant) => avant.map((p) => (autres.includes(p.id) ? { ...p, ...patch(p) } : p)));
  };
  const basculeLaPause = () => {
    if (pause) poseSur(rel.membres.filter((p) => !!p.relancesPause).map((p) => p.id), () => ({ relancesPause: undefined }));
    else pose({ relancesPause: { le: new Date().toISOString(), ...(qui ? { par: qui } : {}) } });
  };
  const decale = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jourChoisi) || jourChoisi <= aujourdhui) return;
    const d: DecalageDesRelances = { au: jourChoisi, rang: e.parties + 1, le: new Date().toISOString(), ...(qui ? { par: qui } : {}) };
    pose({ relancesDecalage: d });
    setJourChoisi('');
  };
  const annuleLeDecalage = () => poseSur(rel.membres.filter((p) => !!p.relancesDecalage).map((p) => p.id), () => ({ relancesDecalage: undefined }));

  const aQuiDit = `Part à ${aQui}${rel.famille ? ', payeur du compte famille' : ''} · rythme ${rel.famille ? 'compte famille' : 'cliente seule'} : ${RYTHME_DIT(rel.cadence)}.`;
  const groupeDit = groupe
    ? `Un seul rappel pour ses ${rel.membres.length} factures (${rel.membres.map(nomDe).join(', ')}) : ${fmtMoney(rel.resteXof, 'XOF')}.`
    : '';
  const suiteDit = rel.forme === 'attend'
    ? 'Des jours différents : ce rappel attend le modèle Meta « rappel_du_point ». Dès qu’il est approuvé et nommé, il part seul.'
    : pause
      ? `En pause depuis le ${jourDit(jourDuSalon(pause.le))}${pause.par ? `, par ${pause.par}` : ''}${porteLaPause && porteLaPause.id !== facture.id ? `, sur la facture de ${nomDe(porteLaPause)}` : ''}.`
      : e.fini
        ? `Les ${e.total} relances sont parties, la dernière le ${jourDit(e.derniereLe ?? aujourdhui)}. La direction appelle.`
        : `${e.parties === 0 ? 'Aucune relance partie' : `${e.parties} sur ${e.total} partie${e.parties > 1 ? 's' : ''}`}${prochaine ? ` · prochaine le ${jourDit(prochaine)} à 10 h` : ''}.`;

  return (
    <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--hairline, #E2D8C6)', borderRadius: 8 }}
      data-relances={pause ? 'pause' : rel.forme === 'attend' ? 'attend' : e.fini ? 'fini' : String(e.parties)} data-forme={rel.forme}>
      <span style={{ fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--color-cuivre, #9A6036)' }}>Relances sur WhatsApp</span>
      <span style={{ fontSize: 13 }}>{aQuiDit}</span>
      {groupeDit && <span style={{ fontSize: 13 }}>{groupeDit}</span>}
      <span style={{ fontSize: 13 }}>{suiteDit}</span>
      {rel.decalage && !e.fini && (
        <span style={{ fontSize: 12.5, color: 'var(--color-gris, #6B6259)' }}>
          Décalée au {jourDit(rel.decalage.au)}{rel.decalage.par ? ` par ${rel.decalage.par}` : ''}.{' '}
          <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer', padding: '2px 8px' }} onClick={annuleLeDecalage}>Annuler le décalage</button>
        </span>
      )}
      {!e.fini && rel.forme !== 'attend' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer' }} onClick={basculeLaPause}>
            {pause ? 'Reprendre les relances' : 'Mettre en pause'}
          </button>
          {!pause && (
            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <label htmlFor={`decale-${facture.id}`}>Décaler la prochaine relance au</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input id={`decale-${facture.id}`} type="date" value={jourChoisi} min={jourPlusR(aujourdhui, 1)} onChange={(x) => setJourChoisi(x.target.value)} style={{ flex: '1 1 140px', minWidth: 140 }} />
                <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer', flex: '0 0 auto', width: 'auto' }} disabled={!jourChoisi || jourChoisi <= aujourdhui} onClick={decale}>Décaler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* La pièce d'une formule : sa suite d'échéances, comme avant, au rythme de son échéancier (J+1, J+3, J+7, J+14 après le jour dû). */
function BlocDUneFormule({ facture, qui, pose }: { facture: Invoice; qui?: string; pose: (patch: Partial<Invoice>) => void }) {
  const [settings] = useSettings();
  const [envois] = useEnvois();
  const depart = departDesRelances(facture, settings.relances, jourDuSalon);
  const reste = invoiceResteXof(facture);
  const journalDeLaPiece = envois.filter((x) => x.id.startsWith(`rl-${facture.id}-`));
  if (!journalDeLaPiece.length && (!depart || !(reste > 0))) return null;
  const enPause = !!facture.relancesPause;
  const aujourdhui = jourLocal(new Date().toISOString());
  const e = etatDesRelancesDeLaPiece({ factureId: facture.id, depart, journal: envois, resteXof: reste, enPause, aujourdhui, jourDe: jourDuSalon });
  const dit = enPause
    ? `En pause depuis le ${jourDit(jourDuSalon(facture.relancesPause!.le))}${facture.relancesPause!.par ? `, par ${facture.relancesPause!.par}` : ''}.`
    : e.fini
      ? `Les ${e.total} relances de son échéance sont parties, la dernière le ${jourDit(e.derniereLe ?? aujourdhui)}.`
      : `${e.parties === 0 ? 'Aucune relance partie pour son échéance' : `${e.parties} sur ${e.total} partie${e.parties > 1 ? 's' : ''}`}.`;
  return (
    <div className="trv-doc-actions__row" style={{ display: 'grid', gap: 6, padding: '10px 12px', border: '1px solid var(--hairline, #E2D8C6)', borderRadius: 8 }} data-relances={enPause ? 'pause' : e.fini ? 'fini' : String(e.parties)} data-forme="formule">
      <span style={{ fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--color-cuivre, #9A6036)' }}>Relances sur WhatsApp</span>
      <span style={{ fontSize: 13 }}>{dit} Une formule se relance sur son échéancier.</span>
      {!e.fini && (
        <button type="button" className="trv-wa-btn" style={{ border: 'none', cursor: 'pointer', justifySelf: 'start' }}
          onClick={() => pose(enPause ? { relancesPause: undefined } : { relancesPause: { le: new Date().toISOString(), ...(qui ? { par: qui } : {}) } })}>
          {enPause ? 'Reprendre les relances' : 'Mettre en pause'}
        </button>
      )}
    </div>
  );
}
