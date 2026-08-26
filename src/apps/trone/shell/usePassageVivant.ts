import { useEffect } from 'react';
import { useAppointments, venuesHonorees } from '../../../shared/agenda';
import { clientsStore, estDePassage, mouvementsDePassage, useClients, VENUES_POUR_REVENIR } from '../../../shared/clients';
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

   ③ ON NE MARQUE QUE CELLES QUI L'ONT DÉJÀ ÉTÉ (revu le 26 août). Le geste était
     à sens unique — la marque se levait, jamais ne revenait. Une facture
     supprimée ramenait donc une tête à UNE venue, et elle restait « de la
     Maison » : les têtes couronnées gonflaient d'un passage.

     Reposer la marque sur tout le monde reste exclu, pour la raison d'origine :
     une nouvelle inscrite n'a aucune venue sans être de passage pour autant, et
     un carnet mal chargé marquerait des fidèles. Le témoin `futDePassage`
     tranche : SEULE une tête qui l'a déjà été peut le redevenir. Une cliente
     inscrite en bonne et due forme n'est jamais marquée par cette machine.

   Le calcul est idempotent : une deuxième passe n'écrit rien. */

/** DEUX VENUES, PAS DEUX LIGNES — `venuesHonorees` (shared/agenda.ts) porte la
    règle, la même que celle du Cercle : des jours distincts, et seulement de
    l'honoré. Ici on compte par celle qui S'EST ASSISE (et non par la payeuse,
    comme le fait le Cercle) : la marque dit qu'elle est revenue au fauteuil.

    DEUX SEUILS, ET C'EST VOULU : elle cesse d'être de passage à la 2ᵉ venue —
    la Maison la reconnaît comme une relation — et elle entre au Cercle à la 3ᵉ.
    Être une cliente et être reconnue ne se gagnent pas au même prix. */
export function usePassageVivant(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [clients] = useClients();

  useEffect(() => {
    if (!session) return;                                   // ① la session fait foi
    if (!clients.length || !appts.length) return;           // ② rien de chargé

    /* La règle vit dans `mouvementsDePassage` (shared/clients.ts), pure et
       éprouvée par le harnais : celles qui reviennent, celles qui retombent, et
       celles dont on note simplement le souvenir. */
    const { promues, rendues, aMemoriser } = mouvementsDePassage(
      clients, (id) => venuesHonorees(appts, id), VENUES_POUR_REVENIR,
    );

    if (promues.size === 0 && rendues.size === 0 && aMemoriser.size === 0) return;
    clientsStore.set((prev) =>
      prev.map((c) => {
        if (promues.has(c.id)) return { ...c, dePassage: undefined, futDePassage: true };
        if (rendues.has(c.id)) return { ...c, dePassage: true };
        if (aMemoriser.has(c.id)) return { ...c, futDePassage: true };
        return c;
      }),
    );
  }, [session, appts, clients]);
}
