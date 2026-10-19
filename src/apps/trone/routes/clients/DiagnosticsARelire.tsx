import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Textarea } from '../../../../ds/components';
import { useStaff as useMaTeteAuTrone } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { clientsStore } from '../../../../shared/clients';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { fmtMoney } from '../../../../shared/currency';
import { staffAccessStore } from '../equipe/data';
import {
  GARDE_DES_PHOTOS_JOURS, MOT_PEAU, calibreDit, dateDuDiagnostic, drapeauDit, intensiteDite, longueurDite,
  observationDite, peutRelire, resumeDepuisLesObservations, zoneDite,
} from '../../../../shared/ia-diagnostic-pur';
import {
  adresseDeLaPhoto, confirmeLaLecture, ecarteLaLecture, useDiagnostics, type DiagnosticAuTrone,
} from '../../../../shared/diagnostics-au-trone';

/* ══ LES DIAGNOSTICS À RELIRE — 19 octobre 2026 ══════════════════════════
   Décisions de Yéman (14 octobre, confirmées le 19) : la cliente lit sa
   lecture tout de suite, « à confirmer en consultation » ; un maître la
   relit DANS LA JOURNÉE, ici ; qui relit : la direction et le département
   Atelier (`peutRelire`), personne d'autre ne voit ce panneau.

   CE QUE CLAUDE A LU EST UNE PROPOSITION : une case teintée cuivre « à
   vérifier ». Le maître regarde les photos (adresse signée de dix minutes),
   garde ou retire chaque rituel et chaque produit, réécrit s'il le veut le
   texte que la cliente lira, puis « Confirmer la lecture » l'inscrit ;
   « Écarter » la sort de la liste. Rien d'autre ne part : aucun message,
   aucun encaissement, aucune réservation. La cliente lit « Relu par la
   Maison » dans Ma Couronne.

   EN LISTE REPLIÉE (sa règle des écrans en liste) : le résumé sur la ligne,
   un seul panneau ouvert. Une alerte touchée arrive ici avec
   `?diagnostic=<id>` et ouvre le sien. */

const dateEtHeure = (iso: string | null | undefined): string => {
  const j = dateDuDiagnostic(iso);
  const d = new Date(String(iso ?? ''));
  if (!j || Number.isNaN(d.getTime())) return j;
  const h = new Date(d.getTime() + 3_600_000);
  return `${j} à ${h.getUTCHours()} h ${String(h.getUTCMinutes()).padStart(2, '0')}`;
};

export function DiagnosticsARelire() {
  const moi = useMaTeteAuTrone();
  const [acces] = useStore(staffAccessStore);
  const peut = peutRelire(moi?.role, acces[moi?.user_id ?? '']);
  const { diagnostics, pret, erreur } = useDiagnostics(peut);
  const [clients] = useStore(clientsStore);
  const [file] = useStore(consultationsQueueStore);
  const location = useLocation();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [voirRelus, setVoirRelus] = useState(false);

  /* Une alerte touchée ouvre son diagnostic. */
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('diagnostic');
    if (id) setOuvert(id);
  }, [location.search]);

  const aRelire = useMemo(() => diagnostics.filter((d) => d.etat === 'a-relire'), [diagnostics]);
  const relus = useMemo(() => diagnostics.filter((d) => d.etat !== 'a-relire').slice(0, 20), [diagnostics]);

  if (!peut) return null;
  if (!pret) return null;
  if (erreur && !diagnostics.length) {
    return <p className="trc-sub" style={{ margin: '0 0 16px' }} data-diagnostic="erreur">{erreur}</p>;
  }
  if (!diagnostics.length) return null;

  /* Qui est-ce : la fiche (Ma Couronne) ou la consultation (son nom, au Trône seulement). */
  const quiEst = (d: DiagnosticAuTrone): string => {
    const fiche = d.client_id ? clients.find((c) => c.id === d.client_id) : undefined;
    if (fiche) return fiche.name;
    const consultation = d.data.consultationId ? file.find((c) => c.id === d.data.consultationId) : undefined;
    return consultation?.client.name || d.data.appel || 'Une cliente';
  };

  const ligne = (d: DiagnosticAuTrone) => {
    const peau = d.data.recommandation?.peauInquiete === true || (d.data.lecture?.peau.length ?? 0) > 0;
    const nb = d.data.photos?.length ?? 0;
    return (
      <div key={d.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
        <button
          type="button"
          onClick={() => setOuvert(ouvert === d.id ? null : d.id)}
          aria-expanded={ouvert === d.id}
          style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '10px 0', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
        >
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{quiEst(d)}</span>
          <span className="trc-sub">{dateEtHeure(d.cree_le)} · {d.source === 'consultation' ? 'La Consultation' : 'Ma Couronne'} · {d.data.photosEffaceesLe ? 'photos effacées' : `${nb} photo${nb > 1 ? 's' : ''}`}</span>
          {peau && <span className="trc-pill" style={{ borderColor: 'var(--color-brique, #96412E)', color: '#6E2618', background: '#F7E4E0' }}>Peau à regarder</span>}
          {d.data.sansLecture && <span className="trc-pill trc-pill--attente">À lire à la main</span>}
          {d.etat === 'relu' && <span className="trc-pill trc-pill--honore">Relu</span>}
          {d.etat === 'ferme' && <span className="trc-pill trc-pill--honore">Écarté</span>}
        </button>
        {ouvert === d.id && <PanneauDuDiagnostic d={d} uid={moi?.user_id ?? ''} onFini={() => setOuvert(null)} />}
      </div>
    );
  };

  return (
    <section style={{ margin: '0 0 22px', padding: '14px 18px', border: '1px solid var(--hairline)', borderRadius: 4, background: 'var(--surface-card)' }} data-diagnostic="panneau">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>Diagnostics photo à relire</span>
        <span className={`trc-pill ${aRelire.length ? 'trc-pill--new' : 'trc-pill--honore'}`}>{aRelire.length}</span>
        <span className="trc-sub">La cliente a déjà lu « à confirmer en consultation ». Relisez dans la journée.</span>
      </div>
      {erreur && <p className="trc-sub" role="alert" style={{ margin: '6px 0 0' }}>{erreur}</p>}
      {aRelire.length === 0 && <p className="trc-sub" style={{ margin: '8px 0 0' }}>Aucune lecture n’attend.</p>}
      <div style={{ marginTop: 6 }}>{aRelire.map(ligne)}</div>
      {relus.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="trc-sub" onClick={() => setVoirRelus((v) => !v)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
            {voirRelus ? 'Masquer les lectures relues' : `Les lectures relues (${relus.length})`}
          </button>
          {voirRelus && <div style={{ marginTop: 4 }}>{relus.map(ligne)}</div>}
        </div>
      )}
    </section>
  );
}

function PanneauDuDiagnostic({ d, uid, onFini }: { d: DiagnosticAuTrone; uid: string; onFini: () => void }) {
  const lecture = d.data.lecture ?? null;
  const reco = d.data.recommandation ?? null;
  const texteDeClaude = d.data.texte ?? '';
  const [mot, setMot] = useState(d.data.correction ?? texteDeClaude);
  const [retires, setRetires] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const relu = d.etat !== 'a-relire';

  const voirLesPhotos = async () => {
    const urls = await Promise.all((d.data.photos ?? []).map((c) => adresseDeLaPhoto(c)));
    setPhotos(urls.filter((u): u is string => !!u));
    if (urls.some((u) => !u)) setRefus('Une photo ne s’ouvre pas : la migration 0137 est-elle collée ?');
  };
  const bascule = (id: string) => setRetires((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  const confirme = async () => {
    if (occupe || !uid) return;
    setOccupe(true);
    setRefus(null);
    const correction = mot.trim() && mot.trim() !== texteDeClaude.trim() ? mot : undefined;
    const r = await confirmeLaLecture(d, {
      correction,
      rituelsRetires: retires.filter((id) => reco?.rituels.some((x) => x.id === id)),
      produitsRetires: retires.filter((id) => reco?.produits.some((x) => x.id === id)),
    }, uid);
    setOccupe(false);
    if (r) { setRefus(r); return; }
    onFini();
  };
  const ecarte = async () => {
    if (occupe || !uid) return;
    setOccupe(true);
    const r = await ecarteLaLecture(d, uid);
    setOccupe(false);
    if (r) { setRefus(r); return; }
    onFini();
  };

  return (
    <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }} data-diagnostic="ouvert">
      {/* LA PROPOSITION, TEINTÉE CUIVRE : ce que Claude a lu, à vérifier. */}
      <div style={{ background: 'var(--copper-50)', border: '1px solid var(--copper-200)', borderRadius: 4, padding: '12px 14px' }} data-proposition="a-verifier">
        <div className="trc-microlabel" style={{ margin: 0, color: 'var(--copper-700)' }}>À vérifier · la lecture des photos</div>
        {d.data.sansLecture || !lecture ? (
          <p className="trc-sub" style={{ margin: '6px 0 0' }}>Les photos n’ont pas été lues : la cliente lit « la Maison relit vos photos ». Écrivez ci-dessous ce qu’elle lira.</p>
        ) : (
          <>
            {lecture.peau.length > 0 && (
              <p style={{ margin: '6px 0 0', color: '#6E2618', fontSize: 13 }}>
                <b>Peau à regarder :</b> {lecture.peau.map(drapeauDit).join(', ')}. Aucun produit ni rituel n’est proposé ; la cliente a lu : « {MOT_PEAU} » Appelez-la.
              </p>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {lecture.observations.map((o) => <li key={`${o.cle}-${o.zone}`}>{observationDite(o.cle)} {intensiteDite(o.intensite)}, sur {zoneDite(o.zone)}</li>)}
              {lecture.observations.length === 0 && <li>Aucune observation.</li>}
            </ul>
            <p className="trc-sub" style={{ margin: '6px 0 0' }}>
              Calibre estimé : {calibreDit(lecture.calibre)} · Longueur estimée : {longueurDite(lecture.longueur)} · Photos : {lecture.qualite}
              {d.data.modele ? ` · lu par ${d.data.modele}` : ''}
            </p>
            <p className="trc-sub" style={{ margin: '4px 0 0' }}>Composé des listes : {resumeDepuisLesObservations(lecture)}</p>
          </>
        )}
        {reco && (reco.rituels.length > 0 || reco.produits.length > 0) && (
          <div style={{ marginTop: 10 }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Proposés à la cliente (décochez ce qui ne convient pas)</div>
            {reco.rituels.map((r) => (
              <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!retires.includes(r.id)} disabled={relu} onChange={() => bascule(r.id)} /> Rituel · {r.nom}
              </label>
            ))}
            {reco.produits.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!retires.includes(p.id)} disabled={relu} onChange={() => bascule(p.id)} /> Produit à mettre de côté · {p.nom} · {fmtMoney(p.prixXof)}
              </label>
            ))}
          </div>
        )}
        <label style={{ display: 'block', marginTop: 10 }}>
          <span className="trc-microlabel" style={{ margin: 0 }}>Ce que la cliente lira</span>
          <Textarea value={mot} onChange={(e) => setMot(e.target.value)} rows={4} disabled={relu} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {d.data.photosEffaceesLe ? (
          <span className="trc-sub">Photos effacées le {dateDuDiagnostic(d.data.photosEffaceesLe)} ({GARDE_DES_PHOTOS_JOURS} jours, comme promis).</span>
        ) : photos ? (
          photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--hairline)' }} /></a>)
        ) : (
          <Button variant="ghost" size="sm" onClick={() => void voirLesPhotos()}>Voir les photos</Button>
        )}
      </div>

      {refus && <p className="trc-sub" role="alert" style={{ margin: 0, color: '#6E2618' }}>{refus}</p>}
      {relu ? (
        <p className="trc-sub" style={{ margin: 0 }}>
          {d.etat === 'relu' ? 'Relu' : 'Écarté'} le {dateEtHeure(d.relu_le)}{d.data.correction ? ', avec le mot du maître' : ''}.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="indigo" size="sm" disabled={occupe || !mot.trim()} onClick={() => void confirme()}>Confirmer la lecture</Button>
          <Button variant="ghost" size="sm" disabled={occupe} onClick={() => void ecarte()}>Écarter</Button>
        </div>
      )}
    </div>
  );
}
