import { useCallback, useEffect, useState } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { supabase } from '../../../../shared/supabase';
import { useStore } from '../../../../shared/store';
import { vitrineConfigStore } from '../../../../shared/bridges';
import { sameName } from '../../../../shared/text';
import { fmtMoney } from '../../../../shared/currency';
import { TABLE_DEMANDES, type DemandeAcademie, type StatutDeLaDemande } from '../../../../shared/academie-demandes';
import { useFormations } from './data';
import { inscriptionDepuisDemande, setEnrollment, enrollmentsStore } from './academy';
import { Pill } from './ui';

/* ══ LES DEMANDES VENUES DU SITE — 17 septembre 2026 ═══════════════════
   « Il faut réserver massivement », puis « brancher un paiement avec KkiaPay
   quand le client choisit de réserver un parcours » (Yéman).

   ELLES ARRIVENT ICI, LÀ OÙ L'ON INSCRIT. Une file que personne ne regarde
   ne sert à rien, et un acompte reçu sans écran qui le montre est pire :
   l'argent serait entré sans que la Maison le sache. « En faire une
   candidature » ouvre l'inscription déjà remplie, dans le Suivi.

   LA FILE NE SE LIT QU'ICI. Le site public dépose et ne relit rien : la base
   le lui interdit (migration 0106). On lit donc en direct, avec la session
   du personnel, sans passer par un magasin partagé — rien de cette file n'a
   sa place dans le navigateur d'une visiteuse. */

const STATUT_DIT: Record<StatutDeLaDemande, { mot: string; ton: 'ok' | 'warn' | 'muted' }> = {
  nouvelle: { mot: 'nouvelle', ton: 'warn' },
  rappelee: { mot: 'rappelée', ton: 'warn' },
  inscrite: { mot: 'inscrite', ton: 'ok' },
  ecartee: { mot: 'écartée', ton: 'muted' },
};

const quand = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function AcademieDemandes() {
  const { branch, currency } = useBranch();
  const [formations] = useFormations();
  const [cfg] = useStore(vitrineConfigStore);
  const [demandes, setDemandes] = useState<DemandeAcademie[] | null>(null);
  const [occupe, setOccupe] = useState(false);

  /* LA BRANCHE SE DÉCLARE AU SITE. Sans elle, la vitrine prend les demandes
     mais n'ouvre pas le paiement : une page sans compte ne peut pas deviner
     de quelle maison il s'agit. On l'estampille une fois, ici, où la Maison
     tient son Académie. */
  useEffect(() => {
    if (cfg.branchId === branch.id) return;
    vitrineConfigStore.set((c) => ({ ...c, branchId: branch.id }));
  }, [cfg.branchId, branch.id]);

  const relire = useCallback(async () => {
    if (!supabase) { setDemandes([]); return; }
    const { data, error } = await supabase
      .from(TABLE_DEMANDES).select('data').order('updated_at', { ascending: false }).limit(200);
    if (error) { console.warn('[mnd-academie] file illisible :', error.message); setDemandes([]); return; }
    setDemandes((data ?? []).map((r) => (r as { data: DemandeAcademie }).data).filter(Boolean));
  }, []);

  useEffect(() => { void relire(); }, [relire]);

  /** Écrit la demande ; rend `true` si la base l'a prise. */
  const ecris = async (d: DemandeAcademie, patch: Partial<DemandeAcademie>): Promise<boolean> => {
    if (!supabase) return false;
    const suite: DemandeAcademie = { ...d, ...patch, traiteLe: new Date().toISOString() };
    const { error } = await supabase.from(TABLE_DEMANDES).update({ data: suite }).eq('id', d.id);
    if (error) return false;
    setDemandes((prev) => (prev ?? []).map((x) => (x.id === d.id ? suite : x)));
    return true;
  };
  const poser = async (d: DemandeAcademie, patch: Partial<DemandeAcademie>) => {
    setOccupe(true);
    const ok = await ecris(d, patch);
    setOccupe(false);
    if (!ok) toast('La demande n’a pas pu être mise à jour.');
  };

  /* EN FAIRE UNE CANDIDATURE : l'inscription s'ouvre déjà remplie. On relie
     le parcours du site à la formation de l'Académie PAR SON NOM — le site
     porte l'identifiant de la semence, le Suivi celui de la formation
     vivante, et les deux ne sont pas les mêmes.
     10 octobre 2026 (revue) : la ligne est RELUE au clic (un acompte
     confirmé après l'ouverture de la file entre au dossier), la demande est
     marquée « inscrite » AVANT que l'inscription naisse (un échec d'écriture
     ne laisse pas un dossier orphelin qu'un second clic doublerait), et les
     boutons restent tenus tout du long. */
  const inscrire = async (d0: DemandeAcademie) => {
    if (!supabase) return;
    const fo = formations.find((f) => sameName(f.name, d0.parcoursTitre));
    if (!fo) {
      toast(`Aucune formation ne porte le nom « ${d0.parcoursTitre} » dans l’Académie. Créez-la, puis reprenez.`);
      return;
    }
    setOccupe(true);
    try {
      const { data, error } = await supabase.from(TABLE_DEMANDES).select('data').eq('id', d0.id).maybeSingle();
      const d = (data as { data?: DemandeAcademie } | null)?.data;
      if (error || !d) { toast('La demande n’a pas pu être relue. Reprenez dans un instant.'); return; }
      setDemandes((prev) => (prev ?? []).map((x) => (x.id === d.id ? d : x)));
      const r = inscriptionDepuisDemande(d, fo.id);
      if (!r.ok) { toast(r.raison); return; }
      if (!(await ecris(d, { statut: 'inscrite', enrollmentId: r.inscription.id }))) {
        toast('La demande n’a pas pu être mise à jour : rien n’est inscrit. Reprenez.');
        return;
      }
      enrollmentsStore.set((prev) => [r.inscription, ...prev]);
      setEnrollment(r.inscription.id, {});
      toast(`${d.nom} est inscrite. Son dossier est ouvert dans le Suivi.`);
    } finally {
      setOccupe(false);
    }
  };

  if (demandes === null) return <div className="mnd-muted" style={{ fontSize: 12.5 }}>La file se lit…</div>;

  const vivantes = demandes.filter((d) => d.statut !== 'ecartee');
  const ecartees = demandes.filter((d) => d.statut === 'ecartee');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0, maxWidth: '68ch' }}>
          Ce que le site public a reçu. Une place n’est tenue qu’à l’acompte : celles qui l’ont réglé en
          ligne le portent ici, vérifié par le serveur.
        </p>
        <Button variant="ghost" size="sm" onClick={() => void relire()}>Relire la file</Button>
      </div>

      {vivantes.length === 0 && (
        <div className="tre-empty">
          <div className="tre-empty__title">Aucune demande.</div>
          <div className="tre-empty__sub">Le site de l’Académie déposera ici chaque réservation.</div>
        </div>
      )}

      {vivantes.map((d) => (
        <div key={d.id} className="tre-card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', padding: '14px 16px' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{d.nom}</span>
              <Pill tone={STATUT_DIT[d.statut].ton}>{STATUT_DIT[d.statut].mot}</Pill>
              {d.acompteConfirme && <Pill tone="ok">acompte reçu</Pill>}
            </div>
            <div className="mnd-muted" style={{ fontSize: 12, marginTop: 3 }}>
              {d.parcoursTitre} · {d.public === 'debutante' ? 'débutante' : 'professionnelle'}
              {d.ville ? ` · ${d.ville}` : ''} · {d.telephone} · reçue le {quand(d.creeLe)}
            </div>
            {d.mot && <div style={{ fontSize: 12.5, marginTop: 6, fontStyle: 'italic', color: 'var(--ink-soft)' }}>« {d.mot} »</div>}
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              {d.acompteConfirme
                ? `${fmtMoney(d.acompteVerseXof ?? d.acompteXof, currency)} reçus · référence ${d.transactionId ?? '—'}`
                : `acompte attendu ${fmtMoney(d.acompteXof, currency)} sur ${fmtMoney(d.prixXof, currency)}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {d.statut !== 'inscrite' && (
              <Button variant="copper" size="sm" disabled={occupe} onClick={() => void inscrire(d)}>En faire une candidature</Button>
            )}
            {d.statut === 'nouvelle' && (
              <Button variant="ghost" size="sm" disabled={occupe} onClick={() => void poser(d, { statut: 'rappelee' })}>Rappelée</Button>
            )}
            <a className="tre-link-btn" href={`https://wa.me/${d.telephone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>
            {d.statut !== 'inscrite' && (
              <button type="button" className="tre-link-btn tre-link-btn--danger" disabled={occupe} onClick={() => void poser(d, { statut: 'ecartee' })}>Écarter</button>
            )}
          </div>
        </div>
      ))}

      {ecartees.length > 0 && (
        <details>
          <summary className="mnd-muted" style={{ fontSize: 12, cursor: 'pointer' }}>
            {ecartees.length} demande{ecartees.length > 1 ? 's' : ''} écartée{ecartees.length > 1 ? 's' : ''}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {ecartees.map((d) => (
              <div key={d.id} className="mnd-muted" style={{ fontSize: 12 }}>
                {d.nom} · {d.parcoursTitre} · {d.telephone}
                <button type="button" className="tre-link-btn" style={{ marginLeft: 10 }} disabled={occupe} onClick={() => void poser(d, { statut: 'nouvelle' })}>Reprendre</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
