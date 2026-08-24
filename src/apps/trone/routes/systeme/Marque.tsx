import { useEffect, useState, type CSSProperties } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Eyebrow, Seal, Textarea } from '../../../../ds/components';
import { DEFAULT_ACCENT, DEFAULT_VERBE, useBrand } from '../../../../shared/settings';
import { maisonNom } from '../../../../shared/identite';
import './systeme.css';

/* Système · Marque & thème — l'âme visible. Accent de prestige, monogramme, verbe
   de la Maison ; aperçu en direct. L'accent se pose à l'instant sur tout le Trône. */

type SealColor = 'indigo' | 'copper' | 'ivoire' | 'obsidian' | 'or';

const ACCENTS: { name: string; hex: string; note?: string }[] = [
  { name: 'Cuivre Noble', hex: '#B97A4A', note: 'recommandé' },
  { name: 'Cuivre Profond', hex: '#9E6238' },
  { name: 'Cuivre Clair', hex: '#C98A53' },
  { name: 'Indigo Royal', hex: '#1E2150' },
  { name: 'Obsidienne', hex: '#2A2A32' },
];

const MONOS: { k: SealColor; name: string }[] = [
  { k: 'copper', name: 'Cuivre' },
  { k: 'indigo', name: 'Indigo' },
  { k: 'or', name: 'Or' },
  { k: 'ivoire', name: 'Ivoire' },
  { k: 'obsidian', name: 'Obsidienne' },
];

const CONFIGURABLE = [
  'L’accent de prestige',
  'Le monogramme',
  'Le verbe de la Maison',
  'La devise affichée',
  'Les rappels & relances',
];
const LOCKED: { l: string; why: string }[] = [
  { l: 'Le serif Cormorant', why: 'la signature typographique de MND' },
  { l: 'Le losange & le filet cuivre', why: 'le motif souverain, commun à toutes les branches' },
  { l: 'La grille des 6 surfaces', why: 'garante de la cohérence d’un atelier à l’autre' },
  { l: 'Le ton de voix', why: 'la voix de la Maison, jamais déléguée' },
];

const asSeal = (s?: string | null): SealColor =>
  (['indigo', 'copper', 'ivoire', 'obsidian', 'or'].includes(s ?? '') ? (s as SealColor) : 'copper');

export default function Marque() {
  const [brand, setBrand] = useBrand();
  const [saved, setSaved] = useState(false);

  // L'accent se pose à l'instant sur tout le Trône.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', brand.accent);
  }, [brand.accent]);

  const accentName = ACCENTS.find((a) => a.hex.toLowerCase() === brand.accent.toLowerCase())?.name ?? 'Personnalisé';

  const apply = () => { setSaved(true); window.setTimeout(() => setSaved(false), 2400); };
  const reset = () => setBrand({ accent: DEFAULT_ACCENT, mono: 'copper', verbe: DEFAULT_VERBE });

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · L’âme visible"
        title="Marque & thème."
        sub="L’accent de prestige, le monogramme et le verbe de la Maison, le reste, MND le garde souverain."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={reset}>Réinitialiser</Button>
            <Button variant="copper" onClick={apply}>Appliquer</Button>
          </div>
        }
      />

      {saved && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span>
          <span>Thème appliqué, l’accent {accentName} se pose sur tout le Trône.</span>
        </div>
      )}

      <div className="tr-cols" style={{ '--cols': 'minmax(0,1fr) 360px', gap: 22, alignItems: 'start' } as CSSProperties}>
        {/* LEFT · contrôles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card className="sys-section">
            <div className="sys-section__title">L’accent de prestige</div>
            <div className="sys-section__cap">Le cuivre ponctue toute la Maison. Choisis sa nuance, elle se pose à l’instant sur tout le Trône.</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
              {ACCENTS.map((a) => {
                const on = a.hex.toLowerCase() === brand.accent.toLowerCase();
                return (
                  <button key={a.hex} type="button" className={`sys-swatch ${on ? 'is-on' : ''}`} onClick={() => setBrand({ ...brand, accent: a.hex })}>
                    <span className="sys-swatch__dot" style={{ background: a.hex, outline: on ? '2px solid var(--color-indigo)' : '2px solid transparent' }} />
                    <span className="sys-swatch__name">{a.name}</span>
                    {a.note && <span className="sys-swatch__note">{a.note}</span>}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="sys-section">
            <div className="sys-section__title">Le monogramme</div>
            <div className="sys-section__cap">Le sceau de la Maison sur ses documents et ses écrans.</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {MONOS.map((m) => (
                <button key={m.k} type="button" className={`sys-mono ${brand.mono === m.k ? 'is-on' : ''}`} onClick={() => setBrand({ ...brand, mono: m.k })}>
                  <Seal color={m.k} size={34} />
                  <span className="sys-mono__name">{m.name}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="sys-section">
            <div className="sys-section__title">Le verbe de la Maison</div>
            <div className="sys-section__cap">La phrase qui signe chaque document et chaque Vitrine.</div>
            <Textarea
              rows={3}
              value={brand.verbe}
              onChange={(e) => setBrand({ ...brand, verbe: e.target.value })}
              style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--color-indigo)' }}
            />
          </Card>

          <div className="tre-deep" style={{ display: 'block' }}>
            <div className="tre-deep__eyebrow">Souveraineté de la marque</div>
            <div className="tr-cols" style={{ '--cols': '1fr 1fr', '--cols-md': '1fr 1fr', '--cols-sm': '1fr', gap: 22, marginTop: 14 } as CSSProperties}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8bab7f', marginBottom: 11 }}>Configurable</div>
                {CONFIGURABLE.map((c) => (
                  <div key={c} style={{ fontSize: 12.5, color: 'var(--color-ivoire)', padding: '5px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ color: '#8bab7f' }}>○</span>{c}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-300)', marginBottom: 11 }}>Verrouillé par MND</div>
                {LOCKED.map((k) => (
                  <div key={k.l} style={{ padding: '5px 0' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--color-ivoire)', display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ color: 'var(--copper-300)' }}>⬩</span>{k.l}
                    </div>
                    <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'rgba(246,241,231,.55)', margin: '1px 0 0 21px' }}>{k.why}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT · aperçu en direct */}
        <div style={{ position: 'sticky', top: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 }}>
            Aperçu en direct · {accentName}
          </div>
          <div className="sys-preview">
            <div className="sys-preview__head">
              <div className="sys-preview__accent-top" style={{ background: brand.accent }} />
              <Seal color={asSeal(brand.mono)} size={42} style={{ margin: '0 auto' }} />
              <div className="sys-preview__name">{maisonNom()}</div>
              <div className="sys-preview__rule" style={{ background: brand.accent }} />
              <div className="sys-preview__verbe">“{brand.verbe}”</div>
            </div>
            <div className="sys-preview__body">
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: brand.accent }} />
                <div style={{ fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Recette du jour</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 34, color: brand.accent, marginTop: 6, lineHeight: 1 }}>—</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, padding: '9px 12px', background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4 }}>
                <span style={{ width: 5, height: 5, background: brand.accent, transform: 'rotate(45deg)', flex: '0 0 auto' }} />
                <span style={{ fontSize: 12.5, color: 'var(--color-indigo)' }}>Tableau de bord</span>
              </div>
              <button style={{ marginTop: 16, width: '100%', cursor: 'default', background: brand.accent, color: 'var(--color-ivoire)', border: 'none', borderRadius: 2, padding: 12, fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.06em' }}>
                + Encaisser
              </button>
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Eyebrow>Le changement se pose à l’instant sur tout le Trône</Eyebrow>
          </div>
        </div>
      </div>
    </div>
  );
}
