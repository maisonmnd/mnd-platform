import { salonHoursStore } from '../equipe/data';

/* LES HEURES DU SALON, AUJOURD'HUI — sorti de Conversations.tsx le 18
   septembre 2026, pour que l'alarme du tableau de bord se taise la nuit
   exactement comme la sonnette de l'écran des conversations. Deux écrans
   qui sonnent, une seule définition de la nuit. */

export const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const;

/** L'ouverture et la fermeture d'aujourd'hui, au format `HH:MM` que
    `cestLaNuit` attend. Un jour fermé rend une journée entière de nuit. */
export const heuresDuJour = (): [string | undefined, string | undefined] => {
  const h = salonHoursStore.get()[JOURS_COURTS[new Date().getDay()]];
  if (!h) return [undefined, undefined];
  if (h.closed) return ['23:59', '00:00'];
  const enDeuxPoints = (s: string) => s.replace(/h/i, ':').replace(/^(\d):/, '0$1:');
  return [enDeuxPoints(h.open), enDeuxPoints(h.close)];
};
