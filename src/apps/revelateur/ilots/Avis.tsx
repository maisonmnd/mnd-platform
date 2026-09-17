import { useEffect, useState } from 'react';
import { avisGoogle, maison, type AvisGoogle } from '../maison';

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
  useEffect(() => {
    void avisGoogle().then(setAvis).catch(() => setAvis(null));
    void maison().then((m) => setFiche(m?.fiche ?? ''));
  }, []);

  const lienFiche = avis?.fiche || fiche || '';
  const lienEcrire = avis?.ecrire || LIEN_AVIS_DEFAUT;

  return (
    <div className="conteneur">
      <div>
        <p className="sur">Avis Google</p>
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
      {avis && avis.avis.length > 0 && (
        <div className="avis-liste">
          {avis.avis.slice(0, 3).map((a, i) => (
            <div className="avis-carte" key={i}>
              <span className="etoiles">{etoiles(a.note)}</span>
              <p>{a.texte.length > 280 ? a.texte.slice(0, 277).trimEnd() + '…' : a.texte}</p>
              <div className="qui">{a.photo ? <img src={a.photo} alt="" loading="lazy" /> : <i />}<span>{a.auteur}{a.quand ? ` · ${a.quand}` : ''}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
