import { useEffect, useState } from 'react';
import { avisChoisis, avisGoogle, maison, type AvisGoogle } from '../maison';
import { avisAMontrer, mentionDuTri } from '../../../shared/avis-google-pur';

/* LES AVIS GOOGLE, TELS QUELS. « Insérer les avis Google » (Yéman).

   Rien n'est écrit ici : la note, le nombre et les avis viennent du
   document `mnd_avis_google`, que la fonction `avis-google-releve` remplit
   depuis Google. Tant qu'il n'existe pas, la section ne montre que les deux
   liens (voir la fiche, écrire un avis), jamais un chiffre inventé. */

/* Le lien d'avis de la Maison, public par nature : c'est celui qu'on DONNE
   (le même repli que la fonction avis-google et le Trône). */
const LIEN_AVIS_DEFAUT = 'https://g.page/r/CYEt1s4BqvZDEBE/review';

const etoiles = (n: number): string => '★'.repeat(Math.round(Math.max(0, Math.min(5, n))));

export default function Avis() {
  const [avis, setAvis] = useState<AvisGoogle | null | undefined>(undefined);
  const [fiche, setFiche] = useState('');
  const [choisis, setChoisis] = useState<string[]>([]);
  useEffect(() => {
    void avisGoogle().then(setAvis).catch(() => setAvis(null));
    void avisChoisis().then(setChoisis).catch(() => setChoisis([]));
    void maison().then((m) => setFiche(m?.fiche ?? ''));
  }, []);

  const lienFiche = avis?.fiche || fiche || '';
  const lienEcrire = avis?.ecrire || LIEN_AVIS_DEFAUT;
  /* LES AVIS QUE LA MAISON A CHOISIS — 10 octobre 2026 : ceux cochés au
     Trône, encore renvoyés par Google, dans l'ordre de la Maison ; sinon
     ceux de Google. La mention du tri est exigée par Google. */
  const vue = avis ? avisAMontrer(avis.avis, choisis) : null;

  return (
    <div className="conteneur">
      <div>
        {/* LE LOGO DE GOOGLE À CÔTÉ DU MOT — 27 septembre 2026 : « maintenir les
            avis Google importés depuis l'API de Google et rajouter le logo de
            Google » (Yéman). Le « G » aux quatre couleurs, dessiné en ligne,
            rien à charger ; il dit d'où viennent les avis avant qu'on lise. */}
        <p className="sur avis-google">
          <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" /><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
          <span>Avis Google</span>
        </p>
        <h2 style={{ marginTop: 10 }}>Ce que disent nos clientes</h2>
        {avis && (
          <div className="note">
            <b>{avis.note.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
            <span><span className="etoiles">{etoiles(avis.note)}</span><br /><span className="g">{avis.nombre} avis sur Google</span></span>
          </div>
        )}
        <div className="rangee" style={{ marginTop: 18 }}>
          {lienFiche && <a className="btn" href={lienFiche} target="_blank" rel="noopener">Voir tous les avis sur Google</a>}
          <a className="btn btn--lien" href={lienEcrire} target="_blank" rel="noopener">Laisser un avis</a>
        </div>
        {avis === null && <p className="legende" style={{ marginTop: 12 }}>Les avis de la Maison se lisent sur sa fiche Google.</p>}
      </div>
      {vue && vue.avis.length > 0 && (
        <div className="avis-liste">
          {/* TOUS CEUX QUE GOOGLE DONNE — 17 septembre 2026 : « choisir au
              moins 5 avis » (Yéman). L'écran en coupait trois alors que les
              cinq étaient rangés. Google n'en rend jamais plus de cinq, c'est
              lui qui borne, pas nous : un nombre écrit ici en cacherait
              silencieusement d'autres le jour où il en donnerait davantage. */}
          {vue.avis.map((a, i) => (
            <div className="avis-carte" key={i}>
              <span className="etoiles">{etoiles(a.note)}</span>
              <p>{a.texte.length > 280 ? a.texte.slice(0, 277).trimEnd() + '…' : a.texte}</p>
              <div className="qui">{a.photo ? <img src={a.photo} alt="" loading="lazy" /> : <i />}<span>{a.auteur}{a.quand ? ` · ${a.quand}` : ''}</span></div>
            </div>
          ))}
          <p className="legende" style={{ gridColumn: '1 / -1', marginTop: 4 }}>{mentionDuTri(vue.mode)}</p>
        </div>
      )}
    </div>
  );
}
