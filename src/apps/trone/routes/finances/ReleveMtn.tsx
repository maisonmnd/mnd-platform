import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { supabase } from '../../../../shared/supabase';
import { fraisDeMtn } from '../../../../shared/collecte-mtn-pur';
import {
  PERIODES_DU_RELEVE, bornesDites, bornesDuReleve, etatDuMouvementDit, jourACotonou, lireDepuisIso, mouvementsDeLaCollecte,
  mouvementsDuDecaissement, releveDeLaPeriode, releveEnCsv,
  type CollectePourLeReleve, type EnvoiPourLeReleve, type MouvementMtn, type PeriodeDuReleve,
} from '../../../../shared/releve-mtn-pur';

/* ══ LE RELEVÉ D'UN COMPTE MTN · 12 novembre 2026 ═══════════════════════
   « Consulter le relevé (hier, ce mois, le mois dernier, l'année...) »
   (Yéman). Sous chaque compte de Finances › MTN MoMo : une période, ses
   totaux confirmés par MTN, ses lignes, et l'export pour le comptable.
   Les règles vivent dans `shared/releve-mtn-pur`. Lecture par pages de
   1 000 (le plafond de Supabase), direction seule (RLS des deux tables). */

const PETIT = { fontSize: 12, color: 'var(--indigo-200)' } as const;
const PAGE = 1000;
const PAGES_MAX = 20;

async function litTout<T>(table: 'paie_envois_mtn' | 'collectes_mtn', colonne: string, depuisIso: string): Promise<{ lignes: T[]; erreur?: string }> {
  if (!supabase) return { lignes: [], erreur: 'Le Trône n’est pas relié au serveur.' };
  const lignes: T[] = [];
  for (let p = 0; p < PAGES_MAX; p += 1) {
    const { data, error } = await supabase.from(table).select('*').gte(colonne, depuisIso).order(colonne, { ascending: true }).range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) return { lignes, erreur: 'Le registre MTN n’a pas pu être lu.' };
    lignes.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { lignes };
}

const heureCourte = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 60 * 60 * 1000);
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} · ${d.getUTCHours()} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const masque = (msisdn?: string | null): string => {
  const c = String(msisdn ?? '').replace(/\D/g, '');
  return c.length >= 2 ? `01 •• •• •• ${c.slice(-2)}` : '';
};

export function ReleveMtn({ compte }: { compte: 'collecte' | 'decaissement' }) {
  const { currency } = useBranch();
  const F = (n: number) => fmtMoney(n, currency);
  const [periode, setPeriode] = useState<PeriodeDuReleve>('ce-mois');
  const [libre, setLibre] = useState(() => { const j = jourACotonou(Date.now()); return { du: `${j.slice(0, 8)}01`, au: j }; });
  const [ouvert, setOuvert] = useState(false);
  const [mouvements, setMouvements] = useState<MouvementMtn[]>([]);
  const [etat, setEtat] = useState<{ charge: boolean; erreur?: string }>({ charge: false });
  const bornes = useMemo(() => bornesDuReleve(periode, Date.now(), libre), [periode, libre]);

  useEffect(() => {
    if (!ouvert || !bornes) return;
    let vivant = true;
    setEtat({ charge: true });
    void (async () => {
      const depuis = lireDepuisIso(bornes);
      if (compte === 'decaissement') {
        /* Un envoi programmé d'avance se date à sa réponse : on lit tout ce
           qui a bougé depuis le début de la période (updated_at). */
        const r = await litTout<EnvoiPourLeReleve>('paie_envois_mtn', 'updated_at', new Date(bornes.depuisMs).toISOString());
        if (!vivant) return;
        setMouvements(mouvementsDuDecaissement(r.lignes));
        setEtat({ charge: false, erreur: r.erreur });
      } else {
        const r = await litTout<CollectePourLeReleve>('collectes_mtn', 'demande_le', depuis);
        if (!vivant) return;
        setMouvements(mouvementsDeLaCollecte(r.lignes, fraisDeMtn));
        setEtat({ charge: false, erreur: r.erreur });
      }
    })();
    return () => { vivant = false; };
  }, [ouvert, compte, bornes]);

  const releve = useMemo(() => (bornes ? releveDeLaPeriode(mouvements, bornes) : null), [mouvements, bornes]);

  const exporte = () => {
    if (!releve || !bornes) return;
    const blob = new Blob([`﻿${releveEnCsv(releve)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `releve-mtn-${compte}-${bornes.du}-${bornes.au}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  };

  const sens = compte === 'collecte' ? 'Encaissé' : 'Envoyé';
  return (
    <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="trf-obsidian__eyebrow">Le relevé</span>
        <button type="button" className="trf-releve__lien" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>{ouvert ? 'Fermer le relevé' : 'Consulter le relevé'}</button>
      </div>
      {ouvert && (
        <>
          <div className="trf-releve__periodes" role="group" aria-label="La période du relevé">
            {PERIODES_DU_RELEVE.map((p) => (
              <button key={p.cle} type="button" aria-pressed={periode === p.cle} onClick={() => setPeriode(p.cle)}>{p.dit}</button>
            ))}
          </div>
          {periode === 'libre' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', ...PETIT }}>
              <label>Du <input type="date" className="trf-releve__date" value={libre.du} onChange={(e) => setLibre({ ...libre, du: e.target.value })} /></label>
              <label>au <input type="date" className="trf-releve__date" value={libre.au} onChange={(e) => setLibre({ ...libre, au: e.target.value })} /></label>
              {!bornes && <span style={{ color: 'var(--copper-200)' }}>La fin vient après le début.</span>}
            </div>
          )}
          {bornes && releve && (
            <>
              <div className="trf-releve__chiffres">
                <div><span style={PETIT}>{sens} · {bornesDites(bornes)}</span><b>{F(releve.totalXof)}</b><span style={PETIT}>{releve.recus} confirmé{releve.recus > 1 ? 's' : ''} par MTN</span></div>
                <div><span style={PETIT}>Frais MTN</span><b>{F(releve.fraisXof)}</b><span style={PETIT}>{compte === 'collecte' ? `net ${F(releve.netXof)}` : 'aucun frais par l’API'}</span></div>
                <div><span style={PETIT}>Par nature</span><span style={{ fontSize: 13, color: 'var(--color-ivoire)' }}>{releve.parNature.length ? releve.parNature.map((n) => `${n.nature} ${n.nombre} · ${F(n.totalXof)}`).join(' · ') : '–'}</span>{(releve.refuses > 0 || releve.enCours > 0) && <span style={PETIT}>{[releve.refuses ? `${releve.refuses} refusé${releve.refuses > 1 ? 's' : ''}` : '', releve.enCours ? `${releve.enCours} en cours` : ''].filter(Boolean).join(' · ')}, hors total</span>}</div>
              </div>
              {etat.charge && <span style={PETIT}>Lecture du registre…</span>}
              {etat.erreur && <span role="alert" style={{ fontSize: 13, color: 'var(--copper-200)' }}>{etat.erreur}</span>}
              {!etat.charge && !etat.erreur && releve.lignes.length === 0 && <span style={PETIT}>Aucun mouvement par MTN sur cette période.</span>}
              {releve.lignes.length > 0 && (
                <div className="trf-releve__lignes">
                  {releve.lignes.map((x) => (
                    <div key={x.reference} className={`trf-releve__ligne${x.etat !== 'recu' ? ' trf-releve__ligne--autre' : ''}`}>
                      <span style={PETIT}>{heureCourte(x.quand)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.qui} · <span style={PETIT}>{x.nature}{x.etat !== 'recu' ? ` · ${etatDuMouvementDit(x.etat)}` : ''}</span></span>
                        <span style={{ ...PETIT, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[masque(x.msisdn), x.transaction ? `transaction ${x.transaction}` : '', `réf. ${x.reference.slice(0, 8)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <b style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 16 }}>{F(x.montantXof)}</b>
                        {x.fraisXof > 0 && <span style={{ ...PETIT, display: 'block' }}>frais {F(x.fraisXof)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={PETIT}>D’après le registre du Trône : un dépôt, un retrait ou un transfert fait hors du Trône n’y figure pas.</span>
                {releve.lignes.length > 0 && <button type="button" className="trf-releve__lien" onClick={exporte}>Exporter (CSV)</button>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
