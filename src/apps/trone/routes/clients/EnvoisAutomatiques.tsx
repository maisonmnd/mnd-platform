/* ══ LES ENVOIS AUTOMATIQUES — 18 septembre 2026 ══════════════════════════
   « Comment retrouver toutes les confirmations de RDV WhatsApp qui partent
   chez la cliente ? » (Yéman). Maquette `maquette-le-journal-des-envois.html`,
   arbitrage ④ : un onglet de Conversations, à côté des fils.

   TOUT CE QUE LA MAISON ENVOIE SEULE, message par message : l'accusé d'une
   demande du site, la confirmation, le rappel de la veille, la demande
   d'avis. Chaque ligne dit à qui, pour quel rendez-vous, par quel canal, et
   CE QUE LE MESSAGE EST DEVENU, avec le motif d'un échec en français. La
   lecture vit dans `shared/envois.ts`, éprouvée ; cet écran ne fait que
   montrer. Les messages écrits à la main vivent dans les fils. */

import { useMemo, useState } from 'react';
import { Card } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { heureLisible } from '../../../../shared/rappel';
import { telephoneMasque } from '../../../../shared/demandes';
import {
  lignesDuJournal, envoisDeLaPeriode, compteDuJournal, devenuDe, estARegarder, motifEnClair,
  jourDuSalon, typeDit, canalDit, DEVENU_DIT, type FiltreDuJournal, type TypeDEnvoi,
} from '../../../../shared/envois';
import { useEnvois } from '../equipe/data';

const FUSEAU = 'Africa/Porto-Novo';

const JOURS: [FiltreDuJournal['jour'], string][] = [
  ['aujourdhui', 'Aujourd’hui'], ['hier', 'Hier'], ['semaine', '7 derniers jours'],
];
const TYPES: [FiltreDuJournal['type'], string][] = [
  ['tout', 'Tous'], ['accuse', 'Accusés de demande'], ['confirmation', 'Confirmations'],
  ['rappel-j1', 'Rappels de la veille'], ['avis-google', 'Avis Google'],
];

/** « ven. 20 sept. · 10 h » */
const pourLeRdv = (date?: string, heure?: string): string => {
  if (!date) return '';
  const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return heure ? `${jour} · ${heureLisible(heure)}` : jour;
};

const couleurDu = (d: ReturnType<typeof devenuDe>): string => (
  d === 'lu' ? '#4A6B52'
    : d === 'remis' ? 'var(--color-indigo)'
      : estARegarder(d) ? '#96412E'
        : 'var(--ink-soft)');

export function EnvoisAutomatiques({ onOuvrirLeFil }: { onOuvrirLeFil: (numero: string) => void }) {
  const { branch } = useBranch();
  const [envois] = useEnvois();
  const [clients] = useClients();
  const [filtre, setFiltre] = useState<FiltreDuJournal>({ jour: 'aujourdhui', type: 'tout', seulementARegarder: false });
  const aujourdhui = jourDuSalon(new Date().toISOString(), FUSEAU);

  const ici = useMemo(
    () => envois.filter((e) => e && (!e.branchId || e.branchId === branch.id)),
    [envois, branch.id],
  );
  const compte = compteDuJournal(envoisDeLaPeriode(ici, filtre.jour, aujourdhui));
  const lignes = lignesDuJournal(ici, filtre, aujourdhui);
  const ficheDe = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const puce = (actif: boolean, mot: string, onClick: () => void, key: string) => (
    <button key={key} type="button" className={`trc-chip ${actif ? 'is-active' : ''}`} onClick={onClick}>{mot}</button>
  );
  const etiquette = (mot: string) => (
    <span style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginRight: 4 }}>{mot}</span>
  );

  return (
    <div>
      <p className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 760 }}>
        Tout ce que la Maison envoie seule : l’accusé d’une réservation du site, la confirmation, le rappel de
        la veille, la demande d’avis. <b style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>« Remis » et « lu »
        viennent de WhatsApp</b> ; un échec dit pourquoi. Les messages écrits à la main vivent dans les fils.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        {([
          ['Partis', compte.partis, false],
          ['Remis', compte.remis, false],
          ['Lus', compte.lus, false],
          ['En route', compte.enRoute, false],
          ['À regarder', compte.aRegarder, compte.aRegarder > 0],
        ] as [string, number, boolean][]).map(([mot, n, alerte]) => (
          <Card key={mot} style={{ padding: '9px 13px', minWidth: 0, ...(alerte ? { background: '#FBF0ED', borderColor: '#E4BDB2' } : {}) }}>
            <div style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{mot}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1.15, color: alerte ? '#96412E' : 'var(--color-indigo)' }}>{n}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {etiquette('Jour')}
        {JOURS.map(([k, mot]) => puce(filtre.jour === k, mot, () => setFiltre((f) => ({ ...f, jour: k })), k))}
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {etiquette('Message')}
        {TYPES.map(([k, mot]) => puce(filtre.type === k, mot, () => setFiltre((f) => ({ ...f, type: k as 'tout' | TypeDEnvoi })), k))}
        <span style={{ width: 10 }} />
        {etiquette('État')}
        {puce(!filtre.seulementARegarder, 'Tous', () => setFiltre((f) => ({ ...f, seulementARegarder: false })), 'etat-tout')}
        {puce(filtre.seulementARegarder, 'À regarder seulement', () => setFiltre((f) => ({ ...f, seulementARegarder: true })), 'etat-regarder')}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="mnd-scroll-x">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr>
                {['Parti à', 'Cliente', 'Message', 'Pour le rendez-vous', 'Canal', 'Devenu', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontWeight: 400, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', padding: '9px 10px', borderBottom: '1px solid var(--hairline)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '18px 12px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                    {filtre.seulementARegarder ? 'Rien à regarder : tout est arrivé.' : 'Aucun envoi automatique sur cette période.'}
                  </td>
                </tr>
              )}
              {lignes.map((e) => {
                const fiche = e.clientId ? ficheDe.get(e.clientId) : undefined;
                const numero = (fiche?.phone || e.numero || '').trim();
                const d = devenuDe(e);
                const motif = estARegarder(d) || d === 'personne' ? motifEnClair(e) : '';
                const jour = jourDuSalon(e.quand, FUSEAU);
                const heure = new Date(e.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                      {jour !== aujourdhui ? `${new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ` : ''}{heure}
                    </td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top' }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                        {fiche?.name ?? (e.prenom || 'Visiteuse du site')}
                      </span>
                      {!fiche && e.numero && (
                        <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>{telephoneMasque(e.numero)} · sans fiche</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top' }}>
                      <span style={{
                        display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                        border: '1px solid var(--hairline)',
                        ...(e.type === 'accuse' ? { background: '#FAF1E9', borderColor: '#E3C9AE' } : {}),
                        ...(e.type === 'confirmation' ? { background: '#EDEEF4', borderColor: '#C9CDE0' } : {}),
                      }}>
                        {typeDit(e.type)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{pourLeRdv(e.dateRdv, e.heure)}</td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top' }}>{canalDit(e.canal)}</td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top' }}>
                      <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: couleurDu(d), fontWeight: estARegarder(d) ? 600 : 400 }}>
                        {d === 'lu' || d === 'remis' ? '✓✓ ' : d === 'en-route' ? '✓ ' : ''}{DEVENU_DIT[d]}
                      </span>
                      {motif && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{motif}</span>}
                    </td>
                    <td style={{ padding: '9px 10px', verticalAlign: 'top', textAlign: 'right' }}>
                      {numero && (
                        <button type="button" className="tre-link-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => onOuvrirLeFil(numero)}>
                          Ouvrir le fil
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
