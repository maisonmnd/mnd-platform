import { useEffect, useState } from 'react';
import { asset } from '../../shared/asset';
import { TexteFon } from '../../ds/fon';
import { FORME_DU_JETON_DES_ETOILES } from '../../shared/etoiles-pur';
import { toucheLesEtoiles } from '../../shared/etoiles-serveur';

/* La devise, écrite ici comme dans App.tsx et Mtn.tsx : identite.ts emporterait
   la synchronisation de l'ERP dans une page ouverte sur un téléphone. Le banc
   verifie-les-etoiles la compare à DEVISE_COMPLETE. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

/* ══ VOS ÉTOILES · 22 novembre 2026 ══════════════════════════════════════
   « Easy, rapide et sans prise de tête. Laissez-nous vos étoiles, beauté. »
   (Yéman). Le bouton « Donner mes étoiles » de son message ouvre cette page
   (payer.html?tg=e-<jeton>, puis regler.html?e=<jeton>). Elle ne fait qu'une
   chose : dire à la Maison que le bouton a été touché, puis ouvrir Google,
   où un toucher sur les étoiles suffit. Si Google ne s'ouvre pas seul, le
   bouton est là. Un lien faux ou trop ancien le dit, sans rien demander. */

type Etat = { k: 'va' } | { k: 'pret'; lien: string } | { k: 'perdu' };

export function Etoiles({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<Etat>({ k: 'va' });
  useEffect(() => {
    let vivant = true;
    if (!FORME_DU_JETON_DES_ETOILES.test(jeton)) { setEtat({ k: 'perdu' }); return; }
    void toucheLesEtoiles(jeton).then((r) => {
      if (!vivant) return;
      if (!r.lien) { setEtat({ k: 'perdu' }); return; }
      setEtat({ k: 'pret', lien: r.lien });
      window.location.replace(r.lien);
    });
    return () => { vivant = false; };
  }, [jeton]);

  return (
    <main className="rg">
      <header className="rg-tete">
        <img className="rg-verrou" src={asset('assets/vectoriel/verrou-couche-indigo.svg')} alt="Maison MND" />
      </header>
      <section className="rg-bloc" aria-label="Vos étoiles" aria-live="polite">
        <p className="rg-sur">Vos étoiles</p>
        {etat.k === 'perdu' ? (
          <>
            <h1 className="rg-titre">Ce lien n’est plus valable.</h1>
            <p className="rg-doux">Merci de votre visite à la Maison.</p>
          </>
        ) : (
          <>
            <h1 className="rg-titre">Laissez-nous vos étoiles, beauté.</h1>
            <p className="rg-doux">Un toucher suffit, rien à écrire. Google s’ouvre.</p>
            {etat.k === 'pret' && (
              <a className="rg-regler" href={etat.lien} style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>Donner mes étoiles</a>
            )}
          </>
        )}
      </section>
      <p className="rg-devise"><TexteFon texte={DEVISE} penche /></p>
    </main>
  );
}
