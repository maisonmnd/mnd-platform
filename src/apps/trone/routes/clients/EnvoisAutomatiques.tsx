/* ══ LES ENVOIS AUTOMATIQUES — 18 septembre 2026 ══════════════════════════
   « Comment retrouver toutes les confirmations de RDV WhatsApp qui partent
   chez la cliente ? » (Yéman). Maquette `maquette-le-journal-des-envois.html`,
   arbitrage ④ : un onglet de Conversations, à côté des fils.

   TOUT CE QUE LA MAISON ENVOIE SEULE, message par message : l'accusé d'une
   demande du site, la confirmation, le rappel de la veille, la demande
   d'avis. Chaque ligne dit à qui, pour quel rendez-vous, par quel canal, et
   CE QUE LE MESSAGE EST DEVENU, avec le motif d'un échec en français. La
   lecture vit dans `shared/envois.ts`, éprouvée ; cet écran ne fait que
   montrer. Les messages écrits à la main vivent dans les fils.

   ══ L'ÉCRAN REFAIT — 2 octobre 2026 ══════════════════════════════════════
   « Améliore l'UI et l'UX de cette page » (Yéman), capture d'un écran vide
   sous cinq grandes cases à zéro et trois rangées de filtres. Trois choix :
     · LES CHIFFRES TIENNENT EN UNE LIGNE : une pastille par état, et « à
       regarder » ne s'allume, en brique, que lorsqu'il y a quelque chose ; un
       clic dessus filtre ;
     · LES FILTRES TIENNENT EN UNE RANGÉE : la période en trois boutons
       collés, le type de message dans une liste, « à regarder seulement » en
       case à cocher ;
     · CHAQUE ENVOI EST UNE LIGNE QUI SE LIT : l'heure, la cliente, le
       message et son rendez-vous, puis ce qu'il est devenu, en couleur, avec
       son motif. Sur téléphone, la ligne passe sur deux étages.
   Un écran vide dit pourquoi, et propose d'élargir la période. */

import { useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { heureLisible } from '../../../../shared/rappel';
import { telephoneMasque } from '../../../../shared/demandes';
import {
  lignesDuJournal, envoisDeLaPeriode, compteDuJournal, devenuDe, estARegarder, motifEnClair,
  jourDuSalon, typeDit, canalDit, DEVENU_DIT, type FiltreDuJournal, type TypeDEnvoi,
} from '../../../../shared/envois';
import { useEnvois } from '../equipe/data';
import { SalleDesEnvois } from './SalleDesEnvois';

const FUSEAU = 'Africa/Porto-Novo';

const JOURS: [FiltreDuJournal['jour'], string][] = [
  ['aujourdhui', 'Aujourd’hui'], ['hier', 'Hier'], ['semaine', '7 jours'],
];
const TYPES: [FiltreDuJournal['type'], string][] = [
  ['tout', 'Tous les messages'], ['confirmation', 'Confirmations'], ['rappel-j1', 'Rappels de la veille'],
  ['reprise-j3', 'Reprises proposées'], ['accuse', 'Accusés de demande'], ['avis-google', 'Avis Google'],
  ['fin-de-paquet', 'Fins de paquet'],
];
const PERIODE_DITE: Record<FiltreDuJournal['jour'], string> = {
  aujourdhui: 'aujourd’hui', hier: 'hier', semaine: 'ces 7 derniers jours',
};

/** « jeu. 8 oct. 2026 · 10 h ». L'année depuis le 10 octobre 2026 : une
    reprise ou un rappel vise parfois un rendez-vous de l'an prochain. */
const pourLeRdv = (date?: string, heure?: string): string => {
  if (!date) return '';
  const jour = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return heure ? `${jour} · ${heureLisible(heure)}` : jour;
};

/** La couleur d'un état : vert lu, indigo remis, brique ce qui n'est pas arrivé. */
const tonDu = (d: ReturnType<typeof devenuDe>): { fond: string; encre: string; bord: string } => (
  d === 'lu' ? { fond: '#EEF3EE', encre: '#3F5E46', bord: '#C9D8CC' }
    : d === 'remis' ? { fond: 'var(--indigo-50, #EDEEF4)', encre: 'var(--color-indigo)', bord: '#C9CCE0' }
      : estARegarder(d) ? { fond: '#FBF0ED', encre: '#96412E', bord: '#E4BDB2' }
        : { fond: 'transparent', encre: 'var(--ink-soft)', bord: 'var(--hairline)' });

const pastille = (texte: string, ton: { fond: string; encre: string; bord: string }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '3px 10px', borderRadius: 999,
    whiteSpace: 'nowrap', background: ton.fond, color: ton.encre, border: `1px solid ${ton.bord}`,
  }}>{texte}</span>
);

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
  const periode = envoisDeLaPeriode(ici, filtre.jour, aujourdhui);
  const compte = compteDuJournal(periode);
  const lignes = lignesDuJournal(ici, filtre, aujourdhui);
  const ficheDe = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const surLaSemaine = envoisDeLaPeriode(ici, 'semaine', aujourdhui).length;

  const segment = (actif: boolean): React.CSSProperties => ({
    font: 'inherit', fontSize: 12.5, padding: '6px 14px', cursor: 'pointer', border: 'none',
    background: actif ? 'var(--color-indigo)' : 'transparent', color: actif ? 'var(--color-ivoire, #F6F1E7)' : 'var(--ink)',
  });

  return (
    <div>
      {/* CE QUI VA PARTIR, AVANT QUE ÇA PARTE (2 octobre 2026). */}
      <SalleDesEnvois />

      {/* ── Ce qui est parti : un titre, pour ne pas le confondre avec la salle ── */}
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)', margin: '4px 0 10px' }}>Ce qui est parti</div>

      {/* ── La rangée de commande : la période, le type, les chiffres ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div role="group" aria-label="Période" style={{ display: 'inline-flex', border: '1px solid var(--hairline)', borderRadius: 999, overflow: 'hidden', background: 'var(--paper, #fff)' }}>
          {JOURS.map(([k, mot]) => (
            <button key={k} type="button" aria-pressed={filtre.jour === k} style={segment(filtre.jour === k)} onClick={() => setFiltre((f) => ({ ...f, jour: k }))}>{mot}</button>
          ))}
        </div>
        <select
          aria-label="Type de message"
          value={filtre.type}
          onChange={(e) => setFiltre((f) => ({ ...f, type: e.target.value as 'tout' | TypeDEnvoi }))}
          style={{ font: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--hairline)', background: 'var(--paper, #fff)', color: 'var(--ink)' }}
        >
          {TYPES.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
          <input type="checkbox" checked={filtre.seulementARegarder} onChange={(e) => setFiltre((f) => ({ ...f, seulementARegarder: e.target.checked }))} />
          À regarder seulement
        </label>

        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {pastille(`${compte.partis} parti${compte.partis > 1 ? 's' : ''}`, tonDu('en-route'))}
          {pastille(`${compte.remis} remis`, tonDu('remis'))}
          {pastille(`${compte.lus} lu${compte.lus > 1 ? 's' : ''}`, tonDu('lu'))}
          {compte.aRegarder > 0 && (
            <button
              type="button"
              onClick={() => setFiltre((f) => ({ ...f, seulementARegarder: true }))}
              title="Voir seulement ce qui n’est pas arrivé"
              style={{ font: 'inherit', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            >
              {pastille(`${compte.aRegarder} à regarder`, tonDu('echec'))}
            </button>
          )}
        </span>
      </div>

      {/* ── Les envois, une ligne chacun ── */}
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md, 6px)', background: 'var(--paper, #fff)', overflow: 'hidden' }}>
        {lignes.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>
              {filtre.seulementARegarder ? 'Rien à regarder : tout est arrivé.' : `Aucun envoi ${PERIODE_DITE[filtre.jour]}.`}
            </div>
            <p className="mnd-muted" style={{ fontSize: 12.5, margin: '8px auto 0', maxWidth: 460, lineHeight: 1.6 }}>
              {filtre.type !== 'tout' && periode.length > 0
                ? `${periode.length} autre${periode.length > 1 ? 's' : ''} message${periode.length > 1 ? 's sont partis' : ' est parti'} sur cette période.`
                : 'Les confirmations partent quand un rendez-vous est posé, les rappels de la veille à 18 h, les demandes d’avis dans l’heure qui suit un règlement.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
              {filtre.type !== 'tout' && (
                <button type="button" className="trc-chip" onClick={() => setFiltre((f) => ({ ...f, type: 'tout' }))}>Voir tous les messages</button>
              )}
              {filtre.jour !== 'semaine' && surLaSemaine > 0 && (
                <button type="button" className="trc-chip" onClick={() => setFiltre((f) => ({ ...f, jour: 'semaine' }))}>
                  Voir les 7 derniers jours ({surLaSemaine})
                </button>
              )}
            </div>
          </div>
        ) : lignes.map((e, i) => {
          const fiche = e.clientId ? ficheDe.get(e.clientId) : undefined;
          const numero = (fiche?.phone || e.numero || '').trim();
          const d = devenuDe(e);
          const motif = estARegarder(d) || d === 'personne' || d === 'ecarte' || d === 'perime' ? motifEnClair(e) : '';
          const jour = jourDuSalon(e.quand, FUSEAU);
          const heure = new Date(e.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU });
          return (
            <div key={e.id} className="trc-envoi" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
              <div className="trc-envoi__quand">
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{heure}</span>
                {jour !== aujourdhui && (
                  <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                    {new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="trc-envoi__qui">
                <span style={{ fontWeight: 500, color: 'var(--color-indigo)' }}>
                  {fiche?.name ?? (e.prenom || 'Visiteuse du site')}
                </span>
                <span className="mnd-muted" style={{ display: 'block', fontSize: 12 }}>
                  {typeDit(e.type)} · {canalDit(e.canal)}
                  {e.dateRdv && e.type !== 'avis-google' ? ` · rendez-vous du ${pourLeRdv(e.dateRdv, e.heure)}` : ''}
                  {!fiche && e.numero ? ` · ${telephoneMasque(e.numero)}, sans fiche` : ''}
                </span>
              </div>
              <div className="trc-envoi__etat">
                {pastille(`${d === 'lu' || d === 'remis' ? '✓✓ ' : d === 'en-route' ? '✓ ' : ''}${DEVENU_DIT[d]}`, tonDu(d))}
                {motif && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5, marginTop: 4, maxWidth: 260 }}>{motif}</span>}
              </div>
              <div className="trc-envoi__geste">
                {numero && (
                  <button
                    type="button"
                    onClick={() => onOuvrirLeFil(numero)}
                    style={{ font: 'inherit', fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 0', color: 'var(--copper-700)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Ouvrir le fil
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '10px 2px 0' }}>
        Ce que la Maison envoie seule. « Remis » et « lu » viennent de WhatsApp ; un message non arrivé dit pourquoi.
        Les messages écrits à la main vivent dans les fils.
      </p>
    </div>
  );
}
