import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react';
import { asset } from '../../../../../shared/asset';
import { DEVISE_COMPLETE } from '../../../../../shared/identite';
import {
  borneDansLaZone, dateDite, dimsDuTampon, nomsDansLaZone, paragraphes, PAGE, SIGNATURE_MM, Y_DES_NOMS, ZONE, type Pose,
} from '../../../../../shared/secretariat-pur';
import type { DocumentResolu } from '../../../../../shared/secretariat';

/* L'APERÇU A4 — la page telle qu'elle sortira.

   LA MÊME MISE EN PAGE QUE LE PDF, en millimètres (secretariat-pur, PAGE) :
   Arial a les mêmes chasses que l'Helvetica du PDF, les lignes passent au
   même endroit. La zone de signature est ANCRÉE après la politesse : on y
   glisse signatures et tampon, et le PDF les pose au même endroit, même
   quand la lettre passe sur deux pages. */

export function Apercu({ r, signaturesAttendues, glissable, surPoses }: {
  r: DocumentResolu;
  /** Les signatures pas encore posées : un cadre pointillé à leur nom. */
  signaturesAttendues: { cle: string; nom: string }[];
  glissable: boolean;
  surPoses: (poses: Pose[]) => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [mm, setMm] = useState(2.4);
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const mesure = () => setMm(el.clientWidth / PAGE.largeur);
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const p = r.piece;
  const e = r.enTete;
  const px = (v: number) => `${v * mm}px`;
  const pt = (v: number) => `${(v * 25.4 / 72) * mm}px`; // points → mm → px
  const corps: CSSProperties = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: pt(PAGE.corpsPt), lineHeight: px(PAGE.ligne), color: '#14141B' };

  const zone = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ cle: string; x0: number; y0: number; px0: number; py0: number } | null>(null);
  const debut = (q: Pose) => (ev: PE<HTMLDivElement>) => {
    if (!glissable) return;
    glisse.current = { cle: q.cle, x0: ev.clientX, y0: ev.clientY, px0: q.x, py0: q.y };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const bouge = (ev: PE<HTMLDivElement>) => {
    const g = glisse.current;
    if (!g) return;
    const x = g.px0 + (ev.clientX - g.x0) / mm;
    const y = g.py0 + (ev.clientY - g.y0) / mm;
    surPoses(p.poses.map((q) => (q.cle === g.cle ? borneDansLaZone({ ...q, x, y }) : q)));
  };
  const fin = () => { glisse.current = null; };

  const tamponPose = p.poses.find((q) => q.cle === 'tampon');
  const dims = r.tampon ? dimsDuTampon(r.tampon.ratio) : null;
  const places = nomsDansLaZone(p, r.noms);
  const dest = r.texte.destinataire.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div ref={boite} className="sec-feuille" style={{ padding: `${px(14)} ${px(PAGE.marge)} ${px(20)}`, position: 'relative' }}>
      {/* L'en-tête de l'entité */}
      {e.verrou ? (
        <img src={asset('/assets/verrous/verrou-couche-indigo.png')} alt={e.nom} style={{ width: px(46), display: 'block' }} />
      ) : e.expediteur.length ? (
        <div style={{ ...corps, lineHeight: px(5) }}>
          {e.expediteur.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#14141B' : '#6b6b73', fontSize: i === 0 ? pt(11) : pt(9.5) }}>{l}</div>)}
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: '"Times New Roman", Times, serif', fontWeight: 700, fontSize: pt(21), color: e.encre, letterSpacing: px(0.6) }}>{e.nom}</div>
          {e.lignes.map((l, i) => <div key={i} style={{ ...corps, fontSize: pt(8.5), lineHeight: px(4.2), color: '#6b6b73' }}>{l}</div>)}
        </div>
      )}
      {e.entite !== 'perso' && <div style={{ borderBottom: `${px(0.5)} solid ${e.verrou ? '#B97A4A' : e.encre}`, marginTop: px(3) }} />}
      <div style={{ position: 'absolute', top: px(12), right: px(PAGE.marge), ...corps, fontSize: pt(8.5), fontWeight: 700, color: p.etat === 'signe' ? e.encre : '#9A8F80' }}>
        {p.etat === 'signe' ? (p.numero ? `N° ${p.numero}` : '') : 'BROUILLON · NON SIGNÉ'}
      </div>

      <div style={{ ...corps, textAlign: 'right', marginTop: px(8) }}>{`${p.lieu || e.ville}, le ${dateDite(p.date)}`}</div>
      {dest.length > 0 && (
        <div style={{ ...corps, marginLeft: px(PAGE.xDestinataire - PAGE.marge), marginTop: px(5) }}>
          {dest.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? e.encre : '#14141B' }}>{l}</div>)}
        </div>
      )}
      {r.texte.objet.trim() && (
        <div style={{ ...corps, marginTop: px(6) }}><b style={{ color: e.encre }}>Objet : </b>{r.texte.objet.trim()}</div>
      )}
      {p.remplace && <div style={{ ...corps, fontStyle: 'italic', color: '#6b6b73', fontSize: pt(9) }}>Ce document remplace le document n° {p.remplace}.</div>}
      <div style={{ ...corps, marginTop: px(4) }}>
        {[r.texte.appel, ...paragraphes(r.texte.corps), r.texte.cloture].filter((t) => t.trim()).map((t, i) => (
          <p key={i} style={{ margin: `0 0 ${px(3)}`, whiteSpace: 'pre-wrap' }}>{t.trim()}</p>
        ))}
      </div>

      {/* La zone de signature, ancrée après la politesse */}
      <div
        ref={zone}
        className={glissable ? 'sec-zone sec-zone--active' : 'sec-zone'}
        style={{ position: 'relative', width: px(ZONE.largeur), height: px(ZONE.hauteur), marginTop: px(4) }}
        onPointerMove={bouge}
        onPointerUp={fin}
        onPointerCancel={fin}
      >
        {tamponPose && r.tampon && dims && (
          <div
            className="sec-pose"
            onPointerDown={debut(tamponPose)}
            style={{ left: px(tamponPose.x), top: px(tamponPose.y), width: px(dims.l), height: px(dims.h), cursor: glissable ? 'grab' : 'default' }}
            aria-label="Le tampon"
          >
            <img src={r.tampon.image} alt="Tampon" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
          </div>
        )}
        {p.poses.filter((q) => q.cle.startsWith('sig:')).map((q) => {
          const attendue = signaturesAttendues.find((s) => s.cle === q.cle);
          return (
            <div
              key={q.cle}
              className="sec-pose"
              onPointerDown={debut(q)}
              style={{ left: px(q.x), top: px(q.y), width: px(SIGNATURE_MM.largeur), height: px(SIGNATURE_MM.hauteur), cursor: glissable ? 'grab' : 'default' }}
              aria-label={attendue ? `Signature attendue : ${attendue.nom}` : 'Signature'}
            >
              {q.image
                ? <img src={q.image} alt="Signature" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center', pointerEvents: 'none' }} />
                : <span className="sec-attendue" style={{ fontSize: pt(7.5) }}>Signature de {attendue?.nom ?? '…'}</span>}
            </div>
          );
        })}
        {/* Les noms : en colonnes sous chaque signature, ou empilés sous le
            cadre ; la même réponse que le PDF (nomsDansLaZone). */}
        {(places.colonnes ? places.noms.map((n) => [n]) : [places.noms]).map((groupe, g) => (
          <div key={g} style={{ position: 'absolute', left: px(groupe[0]?.x ?? 0), top: px(Y_DES_NOMS - 4), pointerEvents: 'none', maxWidth: px(places.colonnes ? 44 : 80) }}>
            {groupe.map((n, i) => (
              <div key={i}>
                <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: pt(12), color: e.encre, lineHeight: px(4.6) }}>{n.nom}</div>
                {n.qualite && <div style={{ ...corps, fontSize: pt(9), color: '#6b6b73', lineHeight: px(4.4) }}>{n.qualite}</div>}
              </div>
            ))}
            {e.entite !== 'perso' && !places.colonnes && <div style={{ fontFamily: '"Times New Roman", Times, serif', fontWeight: 700, fontSize: pt(12), color: e.encre }}>{e.nom}</div>}
          </div>
        ))}
        {e.entite !== 'perso' && places.colonnes && (
          <div style={{ position: 'absolute', left: px(places.xEntite), top: px(Y_DES_NOMS - 4 + 9), fontFamily: '"Times New Roman", Times, serif', fontWeight: 700, fontSize: pt(12), color: e.encre, pointerEvents: 'none' }}>{e.nom}</div>
        )}
      </div>

      {(e.pied.length > 0 || e.devise) && (
        <div style={{ marginTop: px(10), borderTop: `${px(0.2)} solid #D9CFBC`, paddingTop: px(2), textAlign: 'center', ...corps, fontSize: pt(7.5), lineHeight: px(3.6), color: '#6b6b73' }}>
          {e.pied.map((l, i) => <div key={i}>{l}</div>)}
          {e.devise && <div style={{ fontFamily: 'var(--font-devise, "Cormorant Garamond", Georgia, serif)', fontStyle: 'italic', color: '#B97A4A', fontSize: pt(8) }}>{DEVISE_COMPLETE}</div>}
        </div>
      )}
    </div>
  );
}
