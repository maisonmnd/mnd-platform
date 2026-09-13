import { useEffect } from 'react';
import { createStore } from '../../../shared/store';
import { signOut } from '../../../shared/auth';

/* ══ LE POSTE PARTAGÉ SE FERME SEUL — 13 septembre 2026 ══════════════════

   « Sur l'ordinateur du comptoir, un compte resté ouvert signe au nom de son
   titulaire. » Arbitrage de Yéman : quinze minutes.

   Depuis la migration 0092, la base signe chaque geste avec le compte
   connecté. Un compte oublié sur le poste commun ferait donc porter à son
   titulaire ce qu'un autre a fait : la trace dirait vrai sur le compte, et
   faux sur la main.

   UN RÉGLAGE PAR POSTE, JAMAIS SYNCHRONISÉ. Un téléphone personnel n'a pas à
   se fermer toutes les quinze minutes ; seul le poste déclaré commun le fait.
   La case vit dans ce navigateur, et survit à la déconnexion (elle n'est pas
   dans les clés purgées) : c'est le poste qui est commun, pas la séance. */

export const DELAI_DU_POSTE_MS = 15 * 60 * 1000;

export const postePartageStore = createStore<boolean>('mnd_poste_partage', false);

export function useVerrouDuPoste(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;
    let dernier = Date.now();
    const bouge = () => { dernier = Date.now(); };
    const verifie = () => {
      if (Date.now() - dernier >= DELAI_DU_POSTE_MS) void signOut();
    };
    const gestes = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const g of gestes) window.addEventListener(g, bouge, { passive: true });
    /* UN ONGLET EN ARRIÈRE-PLAN ENDORT SES MINUTERIES : on revérifie au
       retour, sinon un poste quitté une heure resterait ouvert jusqu'au
       prochain tic. */
    const aLaReprise = () => { if (document.visibilityState === 'visible') verifie(); };
    document.addEventListener('visibilitychange', aLaReprise);
    const tic = window.setInterval(verifie, 30_000);
    return () => {
      for (const g of gestes) window.removeEventListener(g, bouge);
      document.removeEventListener('visibilitychange', aLaReprise);
      window.clearInterval(tic);
    };
  }, [actif]);
}
