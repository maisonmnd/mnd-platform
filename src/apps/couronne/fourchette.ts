import { bornesDuModele, type ModelBand } from '../../shared/pricing';
import { locale, t } from './i18n';

/* LA FOURCHETTE DU MODÈLE, DANS MA COURONNE — 16 octobre 2026.
   « Je ne veux plus que les clients voient leur nombre précis de locks, juste
   la marge du modèle » (Yéman). La cliente lit son calibre et la tranche qui
   le définit (« de 251 à 350 locks »), jamais le compte de la Maison, qui
   reste au Trône. La tranche est celle que la Maison facture (marge de
   calibre comprise) : c'est `calibreDeLaTete` qui la choisit. */
export function fourchetteDuModele(b: ModelBand | undefined, bands: ModelBand[]): string {
  if (!b) return '';
  const { min, max } = bornesDuModele(b, bands);
  const n = (v: number) => v.toLocaleString(locale());
  if (min === null) return max === null ? '' : t('jusqu’à {max} locks', { max: n(max) });
  if (max === null) return t('plus de {n} locks', { n: n(min - 1) });
  return t('de {min} à {max} locks', { min: n(min), max: n(max) });
}
