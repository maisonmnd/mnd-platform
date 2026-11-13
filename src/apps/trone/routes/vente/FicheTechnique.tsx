import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { OptionsPrestations } from '../_ui';
import { Textarea } from '../../../../ds/components';
import type { FicheTechnique, Service } from '../../../../shared/catalog';
import { fmtMoney } from '../../../../shared/currency';
import { useStaff } from '../../../../shared/auth';
import { useBesoins, prixDAppelDe } from '../../../../shared/besoins';
import { PALIERS_DITS, besoinsDe, palierDe, relie } from '../../../../shared/besoins-pur';
import { useEstDirection } from '../_vie';

/* ══ LA FICHE TECHNIQUE D'UNE PRESTATION — 13 novembre 2026 ═══════════════
   La Consultation, lot 1 (maquette, écran T3). Ce que la prestation soigne,
   pour qui, quand ne pas la faire, ses actifs, et ce qu'on propose avec.
   Dessous : les besoins qui y mènent, et son palier de qualification. Le
   lien besoin ↔ prestation est UN SEUL lien, celui de « Besoins et règles » :
   le poser ici ou là-bas revient au même. */

export type FicheForm = { indications: string; eligibilite: string; contreIndications: string; actifs: string; complements: string[] };

export const ficheVide = (): FicheForm => ({ indications: '', eligibilite: '', contreIndications: '', actifs: '', complements: [] });

export const ficheDuService = (f: FicheTechnique | undefined): FicheForm => ({
  indications: f?.indications ?? '', eligibilite: f?.eligibilite ?? '', contreIndications: f?.contreIndications ?? '',
  actifs: f?.actifs ?? '', complements: [...(f?.complements ?? [])],
});

/** Ce qui s'écrit : rien quand tout est vide, pour ne pas poser une fiche creuse. */
export const ficheAEcrire = (f: FicheForm): FicheTechnique | undefined => {
  const t = (s: string) => s.trim() || undefined;
  const o: FicheTechnique = {
    indications: t(f.indications), eligibilite: t(f.eligibilite), contreIndications: t(f.contreIndications),
    actifs: t(f.actifs), complements: f.complements.length ? f.complements : undefined,
  };
  return Object.values(o).some((v) => v !== undefined) ? o : undefined;
};

export const ficheRemplie = (f: FicheForm): number =>
  [f.indications, f.eligibilite, f.contreIndications, f.actifs].filter((s) => s.trim()).length + (f.complements.length ? 1 : 0);

const lab: CSSProperties = { fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 };
const puce: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, border: '1px solid var(--hairline)', borderRadius: 2, padding: '4px 8px', background: 'var(--surface-card)' };
const croix: CSSProperties = { background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 11, padding: '0 2px' };

export function FicheTechniqueDuVolet({ serviceId, fiche, onChange, services, currency }: {
  serviceId: string | null; fiche: FicheForm; onChange: (f: FicheForm) => void; services: readonly Service[]; currency: string;
}) {
  const [r, ecris] = useBesoins();
  const moi = useStaff();
  /* Les liens et le « sans seuil » s'écrivent dans `mnd_besoins` : la direction seule (0208). */
  const estDirection = useEstDirection();
  const nom = (id: string) => services.find((s) => s.id === id)?.name ?? 'prestation introuvable';
  const champ = (k: 'indications' | 'eligibilite' | 'contreIndications' | 'actifs', titre: string, aide: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={lab}>{titre}</span>
      <span className="mnd-muted" style={{ fontSize: 11.5 }}>{aide}</span>
      <Textarea rows={3} value={fiche[k]} onChange={(e) => onChange({ ...fiche, [k]: e.target.value })} />
    </label>
  );
  const vendables = services.filter((s) => !s.archived && s.id !== serviceId);
  const lies = serviceId ? besoinsDe(r, serviceId) : [];
  const prix = serviceId ? prixDAppelDe(services)(serviceId) : undefined;
  const palier = serviceId ? palierDe(r, serviceId, prix) : 0;
  const libre = !!serviceId && r.sansSeuil.includes(serviceId);
  const par = moi?.name ?? undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {champ('indications', 'Indications', 'Ce qu’elle soigne ou apporte, une idée par ligne.')}
      {champ('eligibilite', 'Éligibilité', 'Pour qui, à quelles conditions (état des locks, consultation faite…).')}
      {champ('contreIndications', 'Contre-indications', 'Quand ne pas la faire.')}
      {champ('actifs', 'Actifs et ingrédients', 'Ce qui permet d’écarter le soin pour une allergie, les huiles essentielles, une peau à vif.')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={lab}>Compléments proposés avec elle</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {fiche.complements.length === 0 && <span className="mnd-muted" style={{ fontSize: 12 }}>Aucun.</span>}
          {fiche.complements.map((id) => (
            <span key={id} style={puce}>{nom(id)}<button type="button" style={croix} aria-label={`Retirer ${nom(id)}`} onClick={() => onChange({ ...fiche, complements: fiche.complements.filter((x) => x !== id) })}>✕</button></span>
          ))}
        </div>
        <select className="mnd-select" style={{ maxWidth: 480, borderStyle: 'dashed', fontSize: 12, color: 'var(--copper-700)' }} value=""
          onChange={(e) => { const v = e.target.value; if (v) onChange({ ...fiche, complements: [...fiche.complements, v] }); }}>
          <option value="" disabled>+ Ajouter un complément…</option>
          <OptionsPrestations services={vendables} exclure={(s) => fiche.complements.includes(s.id)} prix devise={currency} />
        </select>
      </div>

      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...lab, color: 'var(--copper-700)' }}>Les besoins qui y mènent</span>
        {!serviceId ? (
          <span className="mnd-muted" style={{ fontSize: 12.5 }}>Enregistrez d’abord la prestation : elle pourra alors recevoir ses besoins.</span>
        ) : (
          <fieldset disabled={!estDirection} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!estDirection && <span className="mnd-muted" style={{ fontSize: 12 }}>Lecture seule : seule la direction relie les besoins.</span>}
            <span className="mnd-muted" style={{ fontSize: 12 }}>
              Palier {PALIERS_DITS[palier]}{prix !== undefined ? ` (prix d’appel ${fmtMoney(prix, currency)})` : ' (prix au comptage ou au forfait)'} ·{' '}
              {libre ? 'prestation courante, sans seuil de points' : `${r.seuils[palier]} points demandés`}
              {r.paliersPoses[serviceId] !== undefined ? ' · palier posé à la main' : ''}
            </span>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={libre} style={{ accentColor: 'var(--copper-500)' }}
                onChange={(e) => ecris((d) => ({ ...d, sansSeuil: e.target.checked ? [...d.sansSeuil, serviceId] : d.sansSeuil.filter((x) => x !== serviceId) }), par)} />
              Prestation courante : aucun seuil de points (soin, lavage, finition)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lies.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Aucun besoin ne mène encore à elle : la consultation ne la proposera pas.</span>}
              {lies.map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--hairline)', fontSize: 13.5 }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{b.mots}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)' }}>{b.points} pts</span>
                    <button type="button" style={croix} aria-label={`Délier « ${b.mots} »`} onClick={() => ecris((d) => relie(d, b.id, serviceId, false), par)}>✕</button>
                  </span>
                </div>
              ))}
            </div>
            <select className="mnd-select" style={{ maxWidth: 480, borderStyle: 'dashed', fontSize: 12, color: 'var(--copper-700)' }} value=""
              onChange={(e) => { const v = e.target.value; if (v) ecris((d) => relie(d, v, serviceId, true), par); }}>
              <option value="" disabled>+ Relier un besoin…</option>
              {r.familles.map((f) => {
                const bs = r.besoins.filter((b) => b.famille === f.id && !b.prestations.includes(serviceId));
                return bs.length ? <optgroup key={f.id} label={f.nom}>{bs.map((b) => <option key={b.id} value={b.id}>{b.mots}</option>)}</optgroup> : null;
              })}
            </select>
            <span className="mnd-muted" style={{ fontSize: 11.5 }}>
              Les liens s’enregistrent tout de suite. Pour créer un besoin : <Link to="/besoins">Système › Besoins et règles</Link>.
            </span>
          </fieldset>
        )}
      </div>
    </div>
  );
}
