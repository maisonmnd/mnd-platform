import { useState } from 'react';
import { Card } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { supabase } from '../../../../shared/supabase';
import { useSettings } from '../../../../shared/settings';
import { MODES_DEFAUT, TAUX_MOBILE_DEFAUT, type ReglagesMndPay } from '../../../../shared/mnd-pay-pur';

/* ══ LES RÉGLAGES DE MND PAY — 16 octobre 2026 ═════════════════════════
   Maquette UigU1Rr5… : MND PAY s'allume ICI, une fois le compte FedaPay
   ouvert au nom de l'ETS MAISON MND et ses clés posées dans Supabase. Les
   frais sont ajoutés pour la cliente (sa décision) : leur taux se recopie de
   la grille FedaPay. Zelle se note à la main : on n'y pose que l'adresse à
   donner. Le bouton « Vérifier » demande à la fonction ce qu'elle voit
   (jamais une clé, seulement « posée », « live » ou « sandbox »). */
export function CarteMndPay() {
  const [settings, setSettings] = useSettings();
  const r: ReglagesMndPay = settings.mndPay ?? {};
  const pose = (patch: Partial<ReglagesMndPay>) => setSettings((s) => ({ ...s, mndPay: { ...(s.mndPay ?? {}), ...patch } }));
  const poseZelle = (patch: NonNullable<ReglagesMndPay['zelle']>) => pose({ zelle: { ...(r.zelle ?? {}), ...patch } });
  const poseMode = (k: 'mtn' | 'moov' | 'celtiis', v: string) => pose({ modes: { ...(r.modes ?? {}), [k]: v.trim().toLowerCase() } });
  const [verdict, setVerdict] = useState<string | null>(null);

  const verifie = async () => {
    setVerdict('Je demande à la fonction…');
    if (!supabase) { setVerdict('Pas de connexion à la Maison.'); return; }
    const { data, error } = await supabase.functions.invoke('mnd-pay', { method: 'GET' });
    if (error) { setVerdict('La fonction mnd-pay ne répond pas : elle n’est pas encore déployée.'); return; }
    const d = data as { version?: string; secrets?: { fedapay?: boolean; cle?: string } };
    setVerdict(d.secrets?.fedapay
      ? `mnd-pay ${d.version ?? ''} répond, clé FedaPay posée (${d.secrets.cle}).`
      : `mnd-pay ${d.version ?? ''} répond, mais la clé FedaPay n’est pas posée.`);
  };

  const nombre = (v: string): number | undefined => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div className="sys-section__title">MND PAY</div>
      <div className="sys-section__cap">La caisse qui demande le paiement au téléphone de la cliente, ou par un QR pour la carte, et le voit confirmé par FedaPay.</div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Allumer MND PAY</div>
          <div className="sys-row__sub">
            Une fois le compte FedaPay ouvert, la migration 0133 passée et les fonctions mnd-pay et mnd-pay-webhook déployées.
            Éteint, la Caisse reste ce qu’elle était.
          </div>
        </div>
        <Toggle on={!!r.actif} onToggle={() => pose({ actif: !r.actif })} />
      </div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Vérifier le branchement</div>
          <div className="sys-row__sub">{verdict ?? 'Demande à la fonction si la clé est posée, sans jamais la montrer.'}</div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => void verifie()}>Vérifier</button>
      </div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Frais du mobile money, ajoutés pour la cliente</div>
          <div className="sys-row__sub">La grille de FedaPay pour MTN et Moov au Bénin : {TAUX_MOBILE_DEFAUT.toLocaleString('fr-FR')} % (16 octobre 2026).</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input className="sys-select" inputMode="decimal" defaultValue={String(r.tauxMobilePct ?? TAUX_MOBILE_DEFAUT).replace('.', ',')}
            onBlur={(e) => pose({ tauxMobilePct: nombre(e.target.value) ?? TAUX_MOBILE_DEFAUT })}
            style={{ width: 80, textAlign: 'right' }} aria-label="Taux des frais du mobile money, en pourcentage" />
          <span className="sys-row__value">%</span>
        </div>
      </div>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Frais de la carte, ajoutés pour la cliente</div>
          <div className="sys-row__sub">À recopier de votre contrat FedaPay. Vide, la carte prend le taux du mobile money. Un lien envoyé prend le plus haut des deux : la cliente choisit son moyen après.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input className="sys-select" inputMode="decimal" defaultValue={r.tauxCartePct !== undefined ? String(r.tauxCartePct).replace('.', ',') : ''}
            placeholder="?" onBlur={(e) => pose({ tauxCartePct: e.target.value.trim() ? nombre(e.target.value) : undefined })}
            style={{ width: 80, textAlign: 'right' }} aria-label="Taux des frais de la carte, en pourcentage" />
          <span className="sys-row__value">%</span>
        </div>
      </div>
      <details style={{ padding: '10px 0' }}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--copper-700)' }}>Les codes FedaPay de la demande au téléphone</summary>
        <div className="sys-row__sub" style={{ margin: '8px 0' }}>À ne toucher que si le premier essai le demande : la documentation de FedaPay n’est pas d’accord avec elle-même.</div>
        {(['mtn', 'moov', 'celtiis'] as const).map((k) => (
          <div key={k} className="sys-row">
            <div className="sys-row__label">{k === 'mtn' ? 'MTN MoMo' : k === 'moov' ? 'Moov' : 'Celtiis'}</div>
            <input className="sys-select" defaultValue={r.modes?.[k] ?? MODES_DEFAUT[k]} onBlur={(e) => poseMode(k, e.target.value)}
              style={{ width: 140 }} aria-label={`Code FedaPay de ${k}`} />
          </div>
        ))}
      </details>
      <div className="sys-row">
        <div>
          <div className="sys-row__label">Zelle, noté à la main</div>
          <div className="sys-row__sub">Comptes bancaires américains, en dollars. Rien ne le confirme seul : la Caisse donne l’adresse, et l’on encaisse quand le relevé américain montre l’argent.</div>
        </div>
        <Toggle on={!!r.zelle?.actif} onToggle={() => poseZelle({ actif: !r.zelle?.actif })} />
      </div>
      {r.zelle?.actif && (
        <>
          <div className="sys-row">
            <div className="sys-row__label">Adresse Zelle (e-mail ou numéro américain)</div>
            <input className="sys-select" defaultValue={r.zelle?.adresse ?? ''} onBlur={(e) => poseZelle({ adresse: e.target.value.trim() })}
              style={{ width: 240 }} aria-label="Adresse Zelle de la Maison" />
          </div>
          <div className="sys-row">
            <div className="sys-row__label">Au nom de</div>
            <input className="sys-select" defaultValue={r.zelle?.titulaire ?? ''} onBlur={(e) => poseZelle({ titulaire: e.target.value.trim() })}
              style={{ width: 240 }} aria-label="Titulaire du compte Zelle" />
          </div>
        </>
      )}
    </Card>
  );
}
