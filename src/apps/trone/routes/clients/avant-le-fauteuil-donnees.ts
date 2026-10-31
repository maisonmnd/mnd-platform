import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../../../../shared/auth';
import { useAppointments } from '../../../../shared/agenda';
import { heureDuSalon } from '../../../../shared/salle-des-envois';
import { pushNotifyDirection } from '../../../../shared/push';
import { prenomSeul } from '../../../../shared/civilite';
import { notificationAvantLeFauteuil } from '../../../../shared/avant-le-fauteuil-pur';
import { noteLePassage, useMemoireAvantLeFauteuil } from '../../../../shared/avant-le-fauteuil';
import { memoireLue, passageAvantLeFauteuilDu, type PassageAvantLeFauteuil } from '../../../../shared/avant-le-fauteuil-passage-pur';
import { addDaysISO, todayISO } from './_shared';
import { useEntreesAvantLeFauteuil } from './avant-le-fauteuil-lecture';

/* ══ LA NOTIFICATION DU SOIR ET DU MATIN — 31 octobre 2026 ═══════════════
   « N'oublie pas de me faire un résumé de ce que je dois savoir avant un RDV
   d'un client. Credo vient le 13 novembre, il faut que je me souvienne de
   relire notre conversation. » (Yéman, 31 octobre 2026). Choix 2 de la
   maquette Jx3pJY3ZkzWkr9a9RXUFf3 : la veille vers 19 h pour demain, le
   matin vers 7 h pour aujourd'hui, sur son téléphone.

   LA VOIE CHOISIE POUR LE PUSH (31 octobre 2026). Trois voies existaient :
     · déposer une ligne `envois` au canal `push` pour le facteur
       (envois-partent) : le facteur cible une CLIENTE par `clientId`, et
       passe par la salle d'attente et les heures calmes (rien ne part seul de
       20 h à 8 h), ce qui aurait retenu la notification du soir jusqu'au
       matin ; il aurait fallu un type d'envoi de plus et un cas à part ;
     · un cron au serveur (push-notify, mode staff-cron) : la voie la plus
       juste à terme, mais une fonction Edge à redéployer ;
     · `pushNotifyDirection` (shared/push.ts) : UN appel du Trône à
       push-notify, mode `direction`, déjà prouvé par la paie (14 octobre
       2026) et les tiroirs du soir. La fonction vérifie que l'appel vient
       d'un compte du personnel, puis `sendToDirection` pousse sur tous les
       abonnements des comptes de rôle « souverain » : le téléphone de Yéman.
       Hors ligne, `appelleOuGarde` garde l'appel et le fait partir au retour
       du réseau.
   La troisième : la plus courte, et déjà en service. Le gérant déclenche le
   passage comme le souverain (même règle que Gérard), mais la fonction ne
   pousse qu'aux souverains : c'est elle qui tient la liste, pas le Trône.

   QUAND. Le Trône n'a pas de réveil au serveur pour ce passage : il se fait
   quand la direction a le Trône ouvert (tableau de bord ou Carnet), comme le
   passage de Gérard, une fois par passage et par jour (document
   `mnd_avant_le_fauteuil`). Un Trône ouvert avant l'heure se réveille
   chaque minute pour ne pas la manquer. */

/** Où la notification ouvre : le Carnet, qui porte la ligne cuivre. */
export const CHEMIN_DU_CARNET = '/trone/#/carnet';

/** LE PASSAGE DÛ À CET INSTANT, pour la direction seule ; `null` sinon. La
    lecture des fiches ne tourne QUE si un passage est dû (comme Gérard). */
export function usePassageAvantLeFauteuilDu(): PassageAvantLeFauteuil | null {
  const moi = useStaff();
  const [memoire] = useMemoireAvantLeFauteuil();
  /* Le réveil : un Trône ouvert à 18 h 40 doit prévenir à 18 h 50 sans
     qu'on le touche. Une minute, c'est le pas du facteur. */
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  if (!direction) return null;
  return passageAvantLeFauteuilDu(memoireLue(memoire), todayISO(), heureDuSalon(Date.now()));
}

/** LE PASSAGE : assemble les briefings du jour visé (demain le soir,
    aujourd'hui le matin) avec les MÊMES lectures que l'écran, écrit le jour
    dans la mémoire, puis pousse la notification. Sans rendez-vous, rien ne
    part, mais le passage est noté : on ne recompte pas à 19 h 15. */
export function usePassageAvantLeFauteuil(quand: PassageAvantLeFauteuil): void {
  const moi = useStaff();
  const [memoire] = useMemoireAvantLeFauteuil();
  const [tous] = useAppointments();
  const today = todayISO();
  const jour = quand === 'soir' ? addDaysISO(today, 1) : today;
  const entrees = useEntreesAvantLeFauteuil(jour);
  const fait = useRef(false);
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  useEffect(() => {
    if (!direction || fait.current) return;
    /* LE CARNET VIDE N'EST PAS UN CARNET LU : au premier rendu d'un poste
       neuf, les magasins ne sont pas encore descendus. Noter le passage sur
       rien perdrait la notification du soir ; on attend que le Carnet soit là. */
    if (tous.length === 0) return;
    const m = memoireLue(memoire);
    if ((quand === 'soir' ? m.dernierSoir : m.dernierMatin) === today) return;
    fait.current = true;
    noteLePassage(quand, today);
    const notification = notificationAvantLeFauteuil({
      quand,
      jour,
      briefings: entrees.map((e) => ({
        nom: prenomSeul(e.cliente?.name ?? e.rdv.clientName) || 'Une tête',
        heure: e.rdv.time,
        b: e.briefing,
      })),
    });
    if (!notification) return;
    void pushNotifyDirection(notification.titre, notification.texte, CHEMIN_DU_CARNET);
  }, [direction, memoire, tous.length, today, jour, quand, entrees]);
}

/** Monté seulement quand un passage est dû : c'est lui qui lit les fiches. */
export function LanceurAvantLeFauteuil({ quand }: { quand: PassageAvantLeFauteuil }): null {
  usePassageAvantLeFauteuil(quand);
  return null;
}
