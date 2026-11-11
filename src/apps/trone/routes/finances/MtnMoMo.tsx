import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments } from '../../../../shared/agenda';
import { supabase } from '../../../../shared/supabase';
import { ETAT_DE_L_ENVOI_DIT, type EnvoiMtn } from '../../../../shared/paie-par-mtn-pur';
import { PageHead } from '../_ui';
import { CompteDeCollecteMtn } from './CompteDeCollecteMtn';
import { RechercheMtn, ReleveMtn } from './ReleveMtn';
import { PayAppointmentModal } from '../clients/actions';
import { lisChezMtn } from '../equipe/paie-par-mtn';
import './finances.css';

/* ══ MTN MOMO, UNE PAGE À PART — 11 novembre 2026 ══════════════════════
   « Je préfère une page à part pour MTN collecte et disbursement. Je ne
   veux pas ça dans Encaissements » (Yéman). La direction seule.

   · LA COLLECTE (encaisser) : le compte de collecte, son solde en direct,
     les essais, l'interrupteur, les règlements MTN du jour ; le panneau qui
     vivait en tête d'Encaissements, inchangé.
   · LE DÉCAISSEMENT (payer l'équipe) : le solde du compte de décaissement
     chez MTN, relu par la fonction paie-mtn, et les derniers envois. La paie
     elle-même se programme toujours dans Les paiements.

   Aucun numéro de compte dans le code (dépôt public) : les serveurs les
   rendent, à la direction seule. */

const PHRASE = { fontSize: 13, color: 'var(--indigo-100)', lineHeight: 1.5 } as const;
const PETIT = { fontSize: 12, color: 'var(--indigo-200)' } as const;

const jourCourt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Porto-Novo' }) : '';
};

function CompteDeDecaissementMtn() {
  const navigate = useNavigate();
  const { currency } = useBranch();
  const [solde, setSolde] = useState<{ xof: number | null; souci?: string } | null>(null);
  /* Le numéro du compte, rendu par paie-mtn (secret MOMO_PROD_DISBURSEMENT_NUMERO), jamais écrit ici. */
  const [numero, setNumero] = useState<string | null>(null);
  const [luLe, setLuLe] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [envois, setEnvois] = useState<EnvoiMtn[]>([]);
  const [erreur, setErreur] = useState<string | undefined>();

  const relire = useCallback(async () => {
    setEnCours(true);
    const r = await lisChezMtn([]);
    setEnCours(false);
    setSolde({ xof: typeof r.soldeXof === 'number' ? r.soldeXof : null, souci: r.erreur });
    if (typeof r.numero === 'string' && r.numero) setNumero(r.numero);
    setLuLe(Date.now());
  }, []);

  useEffect(() => {
    void relire();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void relire(); }, 60_000);
    return () => window.clearInterval(t);
  }, [relire]);

  useEffect(() => {
    if (!supabase) return;
    let vivant = true;
    void supabase.from('paie_envois_mtn').select('*').order('programme_le', { ascending: false }).limit(12)
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { setErreur('Le registre des envois MTN n’a pas pu être lu.'); return; }
        setErreur(undefined);
        setEnvois((data ?? []) as EnvoiMtn[]);
      });
    return () => { vivant = false; };
  }, [luLe]);

  return (
    <section className="trf-obsidian" aria-label="Compte de décaissement MTN" style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div className="trf-obsidian__eyebrow">Compte de décaissement MTN · payer l’équipe</div>
        <span style={PETIT}>{enCours && !luLe ? 'Lecture chez MTN…' : luLe ? `relu à ${new Date(luLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Pas encore lu'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        {/* Le numéro, écrit comme celui de la collecte (Yéman, 12 nov. 2026). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={PETIT}>Numéro de décaissement</span>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--color-ivoire)' }}>{numero ?? 'numéro à poser'}</span>
          <span style={PETIT}>MAISON MND</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={PETIT}>Solde disponible chez MTN</span>
          <span className="trf-obsidian__value" style={{ fontSize: 40 }}>{solde?.xof != null ? fmtMoney(solde.xof, currency) : '·'}</span>
        </div>
      </div>
      {solde?.souci && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--copper-200)' }}>{solde.souci}</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost-invert" disabled={enCours} onClick={() => { void relire(); }}>{enCours ? 'Lecture…' : 'Relire maintenant'}</Button>
        <Button size="sm" variant="ghost-invert" onClick={() => navigate('/paiements')}>Les paiements ›</Button>
        <span style={PHRASE}>La paie, les avances et les pourboires partent de ce compte, par MTN, vers le numéro de chaque personne.</span>
      </div>
      <div style={{ borderTop: '1px solid var(--hairline-invert)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="trf-obsidian__eyebrow">Les derniers envois</div>
        {erreur && <span style={PHRASE}>{erreur}</span>}
        {!erreur && envois.length === 0 && <span style={PHRASE}>Aucun envoi MTN pour l’instant.</span>}
        {envois.map((e) => (
          <div key={e.reference} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline', fontSize: 13, color: 'var(--color-ivoire)' }}>
            <span style={PETIT}>{jourCourt(e.programme_le)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nom}{e.genre === 'essai' ? ' · essai' : ''} · <span style={PETIT}>{ETAT_DE_L_ENVOI_DIT[e.etat] ?? e.etat}</span></span>
            <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(e.montant_xof, currency)}</b>
          </div>
        ))}
      </div>
      <ReleveMtn compte="decaissement" />
    </section>
  );
}

/* LES COULEURS DE LA CHARTE — 12 novembre 2026 (« mets-moi plusieurs modes
   de couleur de la charte », Yéman). Quatre fonds de la Maison : indigo (la
   nuit, d'origine), ivoire, cuivre, sable ; jamais d'obsidienne. Le choix
   reste sur l'appareil (préférence de lecture, pas une donnée de la Maison). */
type ModeDeCouleur = 'indigo' | 'ivoire' | 'cuivre' | 'sable';
const MODES_DE_COULEUR: readonly { cle: ModeDeCouleur; dit: string; pastille: string }[] = [
  { cle: 'indigo', dit: 'Indigo', pastille: '#1E2150' },
  { cle: 'ivoire', dit: 'Ivoire', pastille: '#F6F1E7' },
  { cle: 'cuivre', dit: 'Cuivre', pastille: '#B97A4A' },
  { cle: 'sable', dit: 'Sable', pastille: '#E7D7C2' },
];
const CLE_DU_MODE = 'mnd_mtn_couleurs';
const modeGarde = (): ModeDeCouleur => {
  try { const v = localStorage.getItem(CLE_DU_MODE); return MODES_DE_COULEUR.some((m) => m.cle === v) ? v as ModeDeCouleur : 'indigo'; } catch { return 'indigo'; }
};

export default function MtnMoMo() {
  const [mode, setMode] = useState<ModeDeCouleur>(modeGarde);
  const choisisLeMode = (m: ModeDeCouleur) => {
    setMode(m);
    try { localStorage.setItem(CLE_DU_MODE, m); } catch { /* sans stockage, le choix vaut pour la visite */ }
  };
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const [rdvs] = useAppointments();
  const [rdvAOuvrir, setRdvAOuvrir] = useState<string | null>(null);
  const rdvOuvert = rdvAOuvrir ? rdvs.find((a) => a.id === rdvAOuvrir) ?? null : null;

  return (
    <div className="mnd-rise">
      <PageHead eyebrow="Finances · trésorerie" title="MTN MoMo." sub="Encaisser par MTN, payer l’équipe par MTN : les deux comptes, en direct." />
      {!direction ? (
        <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Cette page est réservée à la direction.</p>
      ) : (
        <div className={`trf-mtn trf-mtn--${mode}`}>
          {/* Les couleurs de la charte, au choix, gardées sur cet appareil (12 nov. 2026). */}
          <div className="trf-mtn__outils">
            <div className="trf-mtn__modes" role="group" aria-label="Les couleurs de la page">
              <span>Couleurs</span>
              {MODES_DE_COULEUR.map((m) => (
                <button key={m.cle} type="button" aria-pressed={mode === m.cle} onClick={() => choisisLeMode(m.cle)} title={m.dit}>
                  <i style={{ background: m.pastille }} aria-hidden="true" />{m.dit}
                </button>
              ))}
            </div>
            <RechercheMtn />
          </div>
          <CompteDeCollecteMtn onOuvreLeRdv={setRdvAOuvrir} />
          <CompteDeDecaissementMtn />
        </div>
      )}
      {rdvOuvert && <PayAppointmentModal appt={rdvOuvert} onClose={() => setRdvAOuvrir(null)} />}
    </div>
  );
}
