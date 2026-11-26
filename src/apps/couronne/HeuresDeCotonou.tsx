import { horlogeAilleurs } from '../../shared/calendrier';
import { t } from './i18n';

/* « HEURES DE COTONOU » — 26 novembre 2026 (« La diaspora, avant les fêtes »).

   Les places de Ma Couronne se jugent à l'heure du salon (`momentDuSalon`) ;
   une cliente dont le téléphone vit ailleurs (Paris, Montréal, New York) lit
   « 14:00 » comme ses quatorze heures à elle. La ligne le lui dit, sans plus :
   rien ne s'affiche quand le téléphone est déjà à l'heure de Cotonou. */
export default function HeuresDeCotonou() {
  if (!horlogeAilleurs()) return null;
  return <div className="mc-emptyline" role="note">{t('Heures de Cotonou.')}</div>;
}
