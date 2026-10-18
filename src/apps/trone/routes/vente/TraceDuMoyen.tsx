import { useEffect, useState } from 'react';
import { Input, Select, toast } from '../../../../ds/components';
import { quiEncaisse } from '../../../../shared/finance';
import {
  AUTRE_BANQUE, BANQUES_DU_BENIN, ditCeQuiManque, peutVoirLaPhoto, traceSuffit,
  type FamilleDeTrace, type TraceDuMoyen,
} from '../../../../shared/trace-du-moyen-pur';
import { adresseDeLaPhoto, deposeLaPhoto, monCompte } from '../../../../shared/traces-coffre';
import { useEstDirection } from '../_vie';

/* ══ LES CHAMPS DE LA TRACE — 18 octobre 2026 ═══════════════════════════
   Maquette « Chèque et carte » validée : sous la tuile Chèque, la banque (une
   liste, plus « Autre banque »), le numéro, « Au nom de » facultatif, ou une
   photo du chèque ; sous la tuile Carte, le n° d'autorisation du ticket (et
   les 4 derniers chiffres, facultatifs), ou une photo du ticket. Un seul
   composant pour l'encaissement du rituel, la Caisse et « Marquer payée ». */
export function ChampsDeLaTrace({ famille, valeur, onChange, branchId, etiquette }: {
  famille: FamilleDeTrace;
  valeur: TraceDuMoyen | undefined;
  onChange: (t: TraceDuMoyen) => void;
  branchId: string;
  /** « Part 2 », pour les lecteurs d'écran quand il y a plusieurs parts. */
  etiquette?: string;
}) {
  const t = valeur ?? {};
  const pose = (patch: Partial<TraceDuMoyen>) => onChange({ ...t, ...patch });
  const [envoi, setEnvoi] = useState(false);
  const [autreBanque, setAutreBanque] = useState(!!t.banque && !BANQUES_DU_BENIN.includes(t.banque));
  const suffit = traceSuffit(famille, t);
  const titre = famille === 'cheque' ? 'La trace du chèque' : 'La trace de la carte';
  const id = (k: string) => `trace-${etiquette ? etiquette.replace(/\W+/g, '-') : 'x'}-${k}`;

  const photo = async (f: File | undefined) => {
    if (!f) return;
    setEnvoi(true);
    const r = await deposeLaPhoto(branchId, f, quiEncaisse());
    setEnvoi(false);
    if (!r.ok) { toast(r.erreur); return; }
    pose({ photo: r.photo });
  };

  return (
    <div data-trace={famille} data-trace-ok={suffit ? '1' : '0'} style={{ display: 'grid', gap: 8, background: '#FFFFFF', border: `1px solid ${suffit ? 'var(--hairline)' : 'var(--copper-300)'}`, borderRadius: 6, padding: 10 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-700)' }}>{titre}</span>
      {famille === 'cheque' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 6 }}>
            <Select
              id={id('banque')}
              aria-label={`Banque du chèque${etiquette ? ` · ${etiquette}` : ''}`}
              value={autreBanque ? AUTRE_BANQUE : (t.banque ?? '')}
              onChange={(e) => {
                const v = e.target.value;
                if (v === AUTRE_BANQUE) { setAutreBanque(true); pose({ banque: '' }); } else { setAutreBanque(false); pose({ banque: v }); }
              }}
            >
              <option value="">Banque…</option>
              {BANQUES_DU_BENIN.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value={AUTRE_BANQUE}>{AUTRE_BANQUE}</option>
            </Select>
            <Input
              id={id('numero')}
              inputMode="numeric"
              autoComplete="off"
              placeholder="N° du chèque"
              aria-label={`Numéro du chèque${etiquette ? ` · ${etiquette}` : ''}`}
              value={t.numero ?? ''}
              onChange={(e) => pose({ numero: e.target.value })}
            />
          </div>
          {autreBanque && (
            <Input id={id('autre')} autoComplete="off" placeholder="Le nom de la banque" aria-label="Le nom de la banque" value={t.banque ?? ''} onChange={(e) => pose({ banque: e.target.value })} />
          )}
          <Input id={id('aunom')} autoComplete="off" placeholder="Au nom de (si ce n’est pas la cliente), facultatif" aria-label="Au nom de" value={t.auNomDe ?? ''} onChange={(e) => pose({ auNomDe: e.target.value })} />
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 6 }}>
          <Input id={id('auto')} autoComplete="off" placeholder="N° d’autorisation du ticket" aria-label={`Numéro d’autorisation${etiquette ? ` · ${etiquette}` : ''}`} value={t.autorisation ?? ''} onChange={(e) => pose({ autorisation: e.target.value })} />
          <Input id={id('quatre')} inputMode="numeric" maxLength={4} autoComplete="off" placeholder="4 derniers chiffres" aria-label="4 derniers chiffres de la carte" value={t.quatre ?? ''} onChange={(e) => pose({ quatre: e.target.value })} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--ink-soft)', letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 9.5 }}>ou</span>
        {t.photo?.chemin ? (
          <>
            <span style={{ color: '#2F6B4F' }}>{famille === 'cheque' ? 'Photo du chèque prise' : 'Photo du ticket prise'}</span>
            <VoirLaPhoto chemin={t.photo.chemin} />
            <button type="button" className="tre-link-btn" onClick={() => pose({ photo: undefined })}>Retirer</button>
          </>
        ) : (
          <label htmlFor={id('photo')} style={{ cursor: 'pointer', border: '1px dashed var(--copper-300)', color: 'var(--copper-700)', borderRadius: 6, padding: '6px 10px' }}>
            {envoi ? 'Envoi de la photo…' : famille === 'cheque' ? 'Prendre le chèque en photo' : 'Prendre le ticket en photo'}
            <input id={id('photo')} type="file" accept="image/*" capture="environment" disabled={envoi} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => { void photo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {!suffit && <span role="status" style={{ fontSize: 12, color: 'var(--color-brique, #96412E)' }}>{ditCeQuiManque(famille)}</span>}
    </div>
  );
}

/** « Voir la photo » : à la direction et à qui l'a prise ; la base refuse les autres. */
export function VoirLaPhoto({ chemin }: { chemin: string }) {
  const estDirection = useEstDirection();
  const [compte, setCompte] = useState<string | undefined>();
  useEffect(() => { void monCompte().then(setCompte); }, []);
  if (!peutVoirLaPhoto(chemin, { estDirection, compte })) return null;
  return (
    <button
      type="button"
      className="tre-link-btn"
      onClick={async () => {
        const url = await adresseDeLaPhoto(chemin);
        if (!url) { toast('La photo ne s’ouvre pas : le coffre la réserve à la direction et à qui l’a prise.'); return; }
        window.open(url, '_blank', 'noopener');
      }}
    >
      Voir la photo
    </button>
  );
}
