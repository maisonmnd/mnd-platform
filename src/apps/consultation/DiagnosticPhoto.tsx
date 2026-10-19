import { useEffect, useMemo, useState } from 'react';
import { fmtMoney } from '../../shared/currency';
import {
  MOT_DES_PRODUITS, MOT_PEAU, PHOTOS_MAX, PHRASE_DE_L_ACCORD,
  calibreDit, defautDeLEnvoi, intensiteDite, longueurDite, observationDite, zoneDite,
} from '../../shared/ia-diagnostic-pur';
import { envoieLesPhotos, photoReduite, useDiagnosticOuvert, type LectureRendue } from '../../shared/diagnostic-locks';
import type { PhotoSlot } from './data';

/* ══ LE DIAGNOSTIC PHOTO, DANS LA CONSULTATION — 19 octobre 2026 ════════
   Décisions de Yéman (14 octobre, confirmées le 19) : la cliente qui a
   réglé sa consultation en ligne peut envoyer une à quatre photos ; elle
   lit sa lecture tout de suite, « à confirmer en consultation » ; un maître
   la relit dans la journée ; les photos s'effacent à 90 jours.

   FERMÉ TANT QUE LA DIRECTION NE L'ALLUME PAS : sans l'interrupteur (ou sans
   la fonction posée), ce bloc ne rend rien, et la Consultation reste celle
   d'avant, mot pour mot. Sans paiement vérifié, rien non plus : la porte de
   la fonction est la transaction KkiaPay de CETTE consultation.

   LES PHOTOS DE L'ÉTAPE 2 RESTENT SUR LE TÉLÉPHONE tant qu'elle ne coche pas
   l'accord et ne touche pas « Envoyer » : l'étape 2 le dit, et c'est vrai.
   Les produits conseillés sont MIS DE CÔTÉ pour son prochain passage et se
   règlent au retrait : aucun panier payant n'existe encore côté cliente
   (KkiaPay attendra ce chemin-là). */

type Choisie = { cle: string; nom: string; source: Blob | string };

export function DiagnosticPhoto({ consultationId, transactionId, photos, devise = 'XOF' }: {
  consultationId: string | null;
  /** La référence KkiaPay, seulement quand le serveur a dit « reçu ». */
  transactionId: string | null;
  /** Les photos de l'étape 2, proposées d'office (elles ne partent qu'à l'envoi). */
  photos: PhotoSlot[];
  devise?: string;
}) {
  const ouvert = useDiagnosticOuvert();
  const deLEtape = useMemo<Choisie[]>(
    () => photos.filter((p) => p.url).map((p) => ({ cle: `etape-${p.key}`, nom: p.label, source: p.url as string })),
    [photos],
  );
  const [ajoutees, setAjoutees] = useState<Choisie[]>([]);
  const [prises, setPrises] = useState<string[]>([]);
  const [accord, setAccord] = useState(false);
  const [etat, setEtat] = useState<'choix' | 'envoi' | 'lu'>('choix');
  const [refus, setRefus] = useState<string | null>(null);
  const [rendu, setRendu] = useState<Extract<LectureRendue, { ok: true }> | null>(null);
  const [apercus, setApercus] = useState<Record<string, string>>({});

  /* Les photos de l'étape 2 sont cochées d'office, quatre au plus. */
  useEffect(() => {
    setPrises((p) => (p.length ? p : deLEtape.slice(0, PHOTOS_MAX).map((x) => x.cle)));
  }, [deLEtape]);
  /* Les aperçus des photos ajoutées ici, rendus à la fermeture. */
  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const a of ajoutees) if (a.source instanceof Blob) urls[a.cle] = URL.createObjectURL(a.source);
    setApercus(urls);
    return () => { for (const u of Object.values(urls)) URL.revokeObjectURL(u); };
  }, [ajoutees]);

  if (!ouvert || !consultationId || !transactionId) return null;

  const toutes = [...deLEtape, ...ajoutees];
  const choisies = toutes.filter((c) => prises.includes(c.cle));
  const defaut = defautDeLEnvoi(choisies.length, accord);
  const bascule = (cle: string) => setPrises((p) => (p.includes(cle) ? p.filter((x) => x !== cle) : p.length >= PHOTOS_MAX ? p : [...p, cle]));
  const ajoute = (f: File | null | undefined) => {
    if (!f) return;
    const cle = `ajout-${Date.now()}`;
    setAjoutees((a) => [...a, { cle, nom: f.name, source: f }]);
    setPrises((p) => (p.length >= PHOTOS_MAX ? p : [...p, cle]));
  };

  const envoie = async () => {
    if (etat === 'envoi' || defaut) return;
    setEtat('envoi');
    setRefus(null);
    try {
      const reduites = await Promise.all(choisies.map(async (c) => photoReduite(typeof c.source === 'string' ? await (await fetch(c.source)).blob() : c.source)));
      const r = await envoieLesPhotos(reduites, { consultationId, transactionId });
      if (!r.ok) { setRefus(r.message); setEtat('choix'); return; }
      setRendu(r);
      setEtat('lu');
    } catch {
      setRefus('Vos photos ne sont pas parties. Réessayez dans un moment.');
      setEtat('choix');
    }
  };

  if (etat === 'lu' && rendu) {
    const reco = rendu.recommandation;
    const peau = reco?.peauInquiete === true;
    return (
      <div className="lc-panel" style={{ marginTop: 22, borderColor: 'var(--color-copper)' }}>
        <div className="lc-label lc-label--copper">La lecture de vos photos</div>
        {peau ? (
          <p className="lc-intro" style={{ marginTop: 10 }}>{MOT_PEAU}</p>
        ) : (
          <>
            {rendu.texte && <p className="lc-intro" style={{ marginTop: 10 }}>{rendu.texte}</p>}
            {rendu.lecture && rendu.lecture.observations.length > 0 && (
              <div className="lc-flags" style={{ marginTop: 8 }}>
                {rendu.lecture.observations.map((o) => (
                  <div key={`${o.cle}-${o.zone}`} className="lc-flag">
                    <span className="lc-dot lc-dot--veille" />
                    <span>{observationDite(o.cle)} {intensiteDite(o.intensite)}, sur {zoneDite(o.zone)}</span>
                  </div>
                ))}
              </div>
            )}
            {rendu.lecture && (
              <div className="lc-hint" style={{ marginTop: 10 }}>
                Calibre estimé : {calibreDit(rendu.lecture.calibre)} · Longueur estimée : {longueurDite(rendu.lecture.longueur)}
              </div>
            )}
            {reco && reco.rituels.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="lc-label">Les rituels à envisager</div>
                {reco.rituels.map((r) => <div key={r.id} className="lc-hint">{r.nom}</div>)}
              </div>
            )}
            {reco && reco.produits.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="lc-label">Conseillés pour vous, {MOT_DES_PRODUITS}</div>
                {reco.produits.map((p) => (
                  <div key={p.id} className="lc-hint">{p.nom} · {fmtMoney(p.prixXof, devise)}</div>
                ))}
                <div className="lc-hint" style={{ marginTop: 6 }}>Réglés au retrait, à la Maison. Rien n’est encaissé ici.</div>
              </div>
            )}
          </>
        )}
        <div className="lc-note" style={{ marginTop: 14 }}>
          <span>{rendu.mot || 'À confirmer en consultation.'} Un maître de la Maison relit cette lecture dans la journée.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="lc-panel" style={{ marginTop: 22 }}>
      <div className="lc-label lc-label--copper">Le diagnostic photo</div>
      <p className="lc-intro" style={{ marginTop: 10, maxWidth: 640 }}>
        Si vous le voulez, vos photos partent à la Maison. Une première lecture, automatique, s’affiche
        aussitôt ; un maître de la Maison la relit dans la journée. Elle ne remplace pas la consultation,
        et une photo ne dit pas tout de votre couronne.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {toutes.map((c) => {
          const src = typeof c.source === 'string' ? c.source : apercus[c.cle];
          const prise = prises.includes(c.cle);
          return (
            <label key={c.cle} style={{ width: 120, cursor: 'pointer', opacity: prise ? 1 : 0.55 }}>
              {src && <img src={src} alt={c.nom} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 3, border: `2px solid ${prise ? 'var(--color-copper)' : 'var(--hairline)'}` }} />}
              <span className="lc-hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input type="checkbox" checked={prise} onChange={() => bascule(c.cle)} />
                {c.nom.length > 18 ? `${c.nom.slice(0, 17)}…` : c.nom}
              </span>
            </label>
          );
        })}
        {toutes.length < PHOTOS_MAX + 2 && (
          <label className="lc-chip" style={{ alignSelf: 'center', cursor: 'pointer' }}>
            Ajouter une photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { ajoute(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <div className="lc-hint" style={{ marginTop: 8 }}>Une à quatre photos, à la lumière du jour : le dessus, un profil, la nuque.</div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer', maxWidth: 640 }}>
        <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} style={{ marginTop: 3 }} />
        <span className="lc-hint" style={{ margin: 0 }}>{PHRASE_DE_L_ACCORD}</span>
      </label>

      {refus && <div className="lc-err" style={{ marginTop: 10 }}>{refus}</div>}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className={`lc-next lc-next--copper${defaut ? ' is-off' : ''}`}
          disabled={!!defaut || etat === 'envoi'}
          onClick={() => void envoie()}
        >
          {etat === 'envoi' ? 'Envoi en cours…' : 'Envoyer mes photos à la Maison'}
        </button>
        {defaut && toutes.length > 0 && <div className="lc-hint" style={{ marginTop: 6 }}>{defaut}</div>}
      </div>
    </div>
  );
}
