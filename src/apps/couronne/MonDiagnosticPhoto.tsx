import { useEffect, useState } from 'react';
import { t, locale, prix } from './i18n';
import {
  MOT_DES_PRODUITS, MOT_PEAU, MOT_RELU, PHOTOS_MAX, PHRASE_DE_L_ACCORD,
  calibreDit, defautDeLEnvoi, intensiteDite, longueurDite, observationDite, texteMontre, zoneDite,
  type Lecture, type Recommandation,
} from '../../shared/ia-diagnostic-pur';
import { envoieLesPhotos, mesDiagnostics, photoReduite, useDiagnosticOuvert, type DiagnosticDeLaCliente } from '../../shared/diagnostic-locks';

/* ══ LE DIAGNOSTIC PHOTO, DANS MA COURONNE — 19 octobre 2026 ════════════
   Décisions de Yéman (14 octobre, confirmées le 19) : une à quatre photos de
   sa couronne, une lecture lue tout de suite (« à confirmer en
   consultation »), relue par un maître dans la journée ; les photos
   s'effacent à 90 jours. FERMÉ tant que la direction ne l'allume pas : ce
   bloc ne rend rien, le Carnet de Suivi reste celui d'avant.

   « RELU PAR LA MAISON », LE PLUS SIMPLE : la cliente relit ses lectures par
   la fonction (geste « lire »), qui rend l'état ; une lecture relue le dit,
   et porte le mot du maître quand il l'a corrigée. Pas d'écoute en direct :
   elle le voit à sa prochaine ouverture du Carnet.

   Les produits conseillés sont mis de côté pour son prochain passage et se
   règlent au retrait : la Gamme n'a pas de paiement en ligne. Ce qu'elle lit
   passe par t() ; la lecture elle-même reste dans sa langue d'écriture. */

const dateLisible = (iso: string | null | undefined): string => {
  const d = new Date(String(iso ?? ''));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

function LaLecture({ lecture, recommandation, texte, mot }: { lecture: Lecture | null; recommandation: Recommandation | null; texte: string; mot: string }) {
  const peau = recommandation?.peauInquiete === true;
  if (peau) return <p className="mc-ed-texte">{t(MOT_PEAU)}</p>;
  return (
    <>
      {texte && <p className="mc-ed-texte">{texte}</p>}
      {lecture && lecture.observations.length > 0 && (
        <ul className="mc-ed-doux" style={{ margin: '6px 0', paddingLeft: 18 }}>
          {lecture.observations.map((o) => (
            <li key={`${o.cle}-${o.zone}`}>{t('{observation} ({intensite}), sur {zone}', { observation: t(observationDite(o.cle)), intensite: t(intensiteDite(o.intensite)), zone: t(zoneDite(o.zone)) })}</li>
          ))}
        </ul>
      )}
      {lecture && (
        <p className="mc-ed-doux">{t('Calibre estimé : {calibre} · Longueur estimée : {longueur}', { calibre: t(calibreDit(lecture.calibre)), longueur: t(longueurDite(lecture.longueur)) })}</p>
      )}
      {recommandation && recommandation.rituels.length > 0 && (
        <>
          <div className="mc-micro-eyebrow" style={{ marginTop: 10 }}>{t('Les rituels à envisager')}</div>
          {recommandation.rituels.map((r) => <p key={r.id} className="mc-ed-doux" style={{ margin: '2px 0' }}>{r.nom}</p>)}
        </>
      )}
      {recommandation && recommandation.produits.length > 0 && (
        <>
          <div className="mc-micro-eyebrow" style={{ marginTop: 10 }}>{t('Conseillés pour vous, {suite}', { suite: t(MOT_DES_PRODUITS) })}</div>
          {recommandation.produits.map((p) => <p key={p.id} className="mc-ed-doux" style={{ margin: '2px 0' }}>{p.nom} · {prix(p.prixXof)}</p>)}
          <p className="mc-ed-doux">{t('Réglés au retrait, à la Maison. Rien n’est encaissé ici.')}</p>
        </>
      )}
      {mot && <p className="mc-ed-doux" style={{ marginTop: 8 }}>{t(mot)}</p>}
    </>
  );
}

export function MonDiagnosticPhoto() {
  const ouvert = useDiagnosticOuvert();
  const [miens, setMiens] = useState<DiagnosticDeLaCliente[]>([]);
  const [saisie, setSaisie] = useState(false);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [accord, setAccord] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [rendu, setRendu] = useState<DiagnosticDeLaCliente | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    let vivant = true;
    void mesDiagnostics().then((l) => { if (vivant) setMiens(l); });
    return () => { vivant = false; };
  }, [ouvert, rendu?.id]);

  if (!ouvert) return null;

  const defaut = defautDeLEnvoi(fichiers.length, accord);
  const ajoute = (liste: FileList | null) => {
    if (!liste) return;
    setFichiers((f) => [...f, ...Array.from(liste)].slice(0, PHOTOS_MAX));
  };
  const envoie = async () => {
    if (envoi || defaut) return;
    setEnvoi(true);
    setRefus(null);
    try {
      const r = await envoieLesPhotos(await Promise.all(fichiers.map((f) => photoReduite(f))));
      if (!r.ok) { setRefus(r.message); return; }
      setRendu({
        id: r.id, cree_le: new Date().toISOString(), etat: r.etat, lecture: r.lecture, recommandation: r.recommandation,
        texte: r.texte, correction: null, relu_le: null, photosEffaceesLe: null, mot: r.mot,
      });
      setSaisie(false); setFichiers([]); setAccord(false);
    } catch {
      setRefus('Vos photos ne sont pas parties. Réessayez dans un moment.');
    } finally {
      setEnvoi(false);
    }
  };
  const anciens = miens.filter((d) => d.id !== rendu?.id).slice(0, 5);

  return (
    <div className="mc-ed">
      {rendu ? (
        <div className="mc-ed-carte">
          <div className="mc-micro-eyebrow">{t('La lecture de vos photos')}</div>
          <LaLecture lecture={rendu.lecture} recommandation={rendu.recommandation} texte={rendu.texte} mot={rendu.mot} />
          <p className="mc-ed-doux">{t('Un maître de la Maison relit cette lecture dans la journée.')}</p>
          <button type="button" className="mc-cta mc-cta--outline" onClick={() => setRendu(null)}>{t('Fermer')}</button>
        </div>
      ) : saisie ? (
        <div className="mc-ed-carte">
          <div className="mc-micro-eyebrow">{t('Le diagnostic photo')}</div>
          <p className="mc-ed-doux">{t('Une à quatre photos, à la lumière du jour : le dessus, un profil, la nuque. Une première lecture, automatique, s’affiche aussitôt ; un maître de la Maison la relit dans la journée.')}</p>
          <label className="mc-ed-champ"><span>{t('Vos photos ({n} sur {max})', { n: fichiers.length, max: PHOTOS_MAX })}</span>
            <input type="file" accept="image/*" multiple disabled={fichiers.length >= PHOTOS_MAX} onChange={(e) => { ajoute(e.target.files); e.target.value = ''; }} />
          </label>
          {fichiers.length > 0 && (
            <p className="mc-ed-doux">
              {fichiers.map((f) => f.name).join(', ')}{' '}
              <button type="button" className="mc-ed-lien" onClick={() => setFichiers([])}>{t('Tout retirer')}</button>
            </p>
          )}
          <label className="mc-ed-champ" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} />
            <span>{t(PHRASE_DE_L_ACCORD)}</span>
          </label>
          {refus && <p className="mc-ed-erreur" role="alert">{t(refus)}</p>}
          <button type="button" className="mc-cta mc-cta--copper" disabled={!!defaut || envoi} onClick={() => void envoie()}>
            {envoi ? t('Envoi en cours') : t('Envoyer mes photos à la Maison')}
          </button>
          <button type="button" className="mc-cta mc-cta--outline" onClick={() => { setSaisie(false); setRefus(null); }}>{t('Plus tard')}</button>
        </div>
      ) : (
        <button type="button" className="mc-ed-lien" onClick={() => setSaisie(true)}>{t('Faire lire vos locks en photo par la Maison.')}</button>
      )}

      {anciens.length > 0 && (
        <div className="mc-ed-histoire">
          <div className="mc-sectionlabel" style={{ margin: '18px 0 8px' }}>{t('Vos lectures de photos')}</div>
          {anciens.map((d) => (
            <details key={d.id} className="mc-ed-ligne">
              <summary style={{ cursor: 'pointer' }}>
                <span className="mc-ed-date">{dateLisible(d.cree_le)}</span>{' '}
                <span className={`mc-ed-etat${d.etat === 'relu' ? ' est-traite' : ''}`}>{d.etat === 'relu' ? t(MOT_RELU) : t('À confirmer en consultation.')}</span>
              </summary>
              <LaLecture lecture={d.lecture} recommandation={d.recommandation} texte={texteMontre(d)} mot={d.mot} />
              {d.photosEffaceesLe && <p className="mc-ed-doux">{t('Les photos ont été effacées le {date}, comme prévu.', { date: dateLisible(d.photosEffaceesLe) })}</p>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
