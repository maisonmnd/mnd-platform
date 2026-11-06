import { useExceptionsHoraires, useSettings } from '../../shared/settings';
import { fermetureAnnoncee, phraseDeLaFermeture, phraseDeLaFermetureEn } from '../../shared/fermeture-pur';
import { useLangue } from './i18n';
import { todayIso } from './lib';

/* LA FERMETURE ANNONCÉE DANS MA COURONNE — 6 novembre 2026.

   « Il faut notifier [...] sur Ma Couronne que le salon est fermé » (Yéman).
   La réservation de Ma Couronne ferme déjà ces jours-là (`openingForIso`) ;
   cette carte le dit sur l'accueil et en tête de la réservation. La règle et
   la phrase viennent de `shared/fermeture-pur.ts`, les mêmes que le site.
   Rien à annoncer : rien ne s'affiche. La note de la Maison (« Fermeture
   annuelle ») reste en français, comme le mot de fermeture. */
export default function FermetureAnnoncee() {
  const [reglages] = useSettings();
  const [exceptions] = useExceptionsHoraires();
  const langue = useLangue();
  const aujourdhui = todayIso();
  const f = fermetureAnnoncee({ aujourdhui, semaine: reglages.hours ?? [], exceptions: exceptions ?? [] });
  if (!f) return null;
  const dit = langue === 'en' ? phraseDeLaFermetureEn(f, aujourdhui) : phraseDeLaFermeture(f, aujourdhui);
  return (
    <div className="mc-fermeture" role="note">
      <span className="mc-fermeture__dot" aria-hidden="true" />
      <span className="mc-fermeture__txt">
        {f.note && langue !== 'en' && <span className="mc-fermeture__tag">{f.note}</span>}
        <b>{dit.ferme}</b>
        {dit.reprise && <span> {dit.reprise}</span>}
      </span>
    </div>
  );
}
