import { useEffect } from 'react';
import { useAppointments, venuesHonorees } from '../../../shared/agenda';
import { clientsStore, estDePassage, useClients } from '../../../shared/clients';
import { useAuth } from '../../../shared/auth';

/* ELLE EST REVENUE — Le Trône, 9 août 2026.

   Une cliente de passage cesse de l'être à sa DEUXIÈME venue. Ici, et seulement
   ici, la déduction automatique est légitime : elle porte sur un fait observé —
   elle est revenue — et non sur une supposition quant à sa vie. C'est ce qui la
   distingue de la diaspora, où l'indicatif d'un numéro ne dit pas où quelqu'un
   habite, et où l'on a choisi de DEMANDER plutôt que de deviner.

   Rien à entretenir à la main, donc, et rien à surveiller : le seul geste que ce
   hook sache faire est de RETIRER la marque. Il n'en pose jamais aucune.

   TROIS VERROUS, repris de `usePersonaVivant` — pour les mêmes raisons :

   ① SANS SESSION, ON NE TOUCHE À RIEN. L'écriture des fiches exige le personnel
     (RLS), et sans session les tables protégées rendent zéro ligne : un carnet
     vide ferait « revenir » tout le monde, ou personne.

   ② ON N'AGIT QUE SUR DU CHARGÉ. Ni fiche ni rendez-vous en mémoire = on attend.

   ③ LE GESTE EST À SENS UNIQUE. On ne remet jamais quelqu'un « de passage » :
     la marque se pose à la main, au comptoir, au moment où on la reçoit. Une
     machine qui saurait la reposer finirait par le faire sur une fidèle dont le
     carnet a mal chargé.

   Le calcul est idempotent : une deuxième passe n'écrit rien. */

/** DEUX VENUES, PAS DEUX LIGNES — `venuesHonorees` (shared/agenda.ts) porte la
    règle, la même que celle du Cercle : des jours distincts, et seulement de
    l'honoré. Ici on compte par celle qui S'EST ASSISE (et non par la payeuse,
    comme le fait le Cercle) : la marque dit qu'elle est revenue au fauteuil.

    DEUX SEUILS, ET C'EST VOULU : elle cesse d'être de passage à la 2ᵉ venue —
    la Maison la reconnaît comme une relation — et elle entre au Cercle à la 3ᵉ.
    Être une cliente et être reconnue ne se gagnent pas au même prix. */
const VENUES_POUR_REVENIR = 2;

export function usePassageVivant(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [clients] = useClients();

  useEffect(() => {
    if (!session) return;                                   // ① la session fait foi
    if (!clients.length || !appts.length) return;           // ② rien de chargé

    const passantes = clients.filter(estDePassage);
    if (passantes.length === 0) return;

    const promues = new Set<string>();
    for (const c of passantes) {
      if (venuesHonorees(appts, c.id) >= VENUES_POUR_REVENIR) promues.add(c.id);
    }

    if (promues.size === 0) return;
    clientsStore.set((prev) =>
      prev.map((c) => (promues.has(c.id) ? { ...c, dePassage: undefined } : c)),
    );
  }, [session, appts, clients]);
}
