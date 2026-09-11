import { useEffect } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useServices, defaitLaCouronne, fondeLaCouronne } from '../../../shared/catalog';
import { clientsStore, mouvementsSansLocks, useClients, type LectureDesLocks } from '../../../shared/clients';
import { useAuth } from '../../../shared/auth';

/* ELLE A DÉFAIT SES LOCKS — Le Trône, 11 septembre 2026.

   « Quand une cliente a fait le Gbata, le défaisage, elle n'a plus de locks
   donc ce n'est plus une cliente de l'atelier MND » (Yéman).

   Ici, comme pour `usePassageVivant`, la déduction automatique est légitime :
   elle porte sur un FAIT OBSERVÉ — un défaisage honoré au fauteuil, une
   création qui n'est pas venue après — et non sur une supposition quant à la
   vie de quelqu'un. C'est ce qui la distingue de la diaspora, où l'indicatif
   d'un numéro ne dit pas où l'on habite, et où la Maison a choisi de DEMANDER
   plutôt que de deviner.

   UN CHAMP, PAS UN SECOND JUGE. Tout ce que ce hook fait, c'est tenir
   `locksDefaits` à jour depuis le carnet. Le champ existait déjà — posé à la
   main depuis « celles qui ont glissé » et depuis À faire — et cinq portes le
   lisent déjà : les prédictions, le rythme de reprise, la reprise à la
   clôture, les constats au fauteuil, le registre. Toutes héritent donc de la
   règle du Gbàtà sans qu'on y touche. Écrire un second prédicat à côté aurait
   donné deux vérités pour une notion, et la Diaspora a déjà appris ça à la
   Maison au mois d'août.

   DANS LES DEUX SENS, et c'est ce qui rend la sortie automatique acceptable :
   une tête sortie n'est jamais enterrée. Un VÈKPÈ™ honoré lui rend ses locks
   le jour du geste, un VÈKPÈ™ déjà inscrit au carnet la retient avant même
   qu'elle sorte. Celle qui défait mardi pour refaire le mois prochain ne
   bouge pas d'une heure.

   TROIS VERROUS, repris de `usePassageVivant` — pour les mêmes raisons :

   ① SANS SESSION, ON NE TOUCHE À RIEN. L'écriture des fiches exige le
     personnel (RLS), et sans session les tables protégées rendent zéro ligne :
     un carnet vide ferait « revenir » tout le monde, ou personne.

   ② ON N'AGIT QUE SUR DU CHARGÉ. Ni fiche, ni rendez-vous, ni catalogue en
     mémoire = on attend. Sans le catalogue en particulier, aucun rituel ne se
     reconnaîtrait, et TOUTES les marques tomberaient d'un coup.

   ③ CE QUE LA MAIN A POSÉ, LA MACHINE N'Y TOUCHE PAS : `resteDeLaMaison`
     (le bouton « La ramener dans la Maison ») est lu par la règle pure, et
     aucune fiche verrouillée n'entre dans les deux ensembles.

   Le calcul est idempotent : une deuxième passe n'écrit rien. */

/** LE JOUR, EN DATE LOCALE — jamais un slice d'UTC : à Cotonou la nuit
    comptable ne se coupe pas en deux, et un rendez-vous de ce soir se
    lirait « hier ». Chaque module de la Maison porte ce calcul chez lui
    plutôt que de nouer les couches pour trois lignes. */
const jourISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useSansLocksVivant(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [services] = useServices();

  useEffect(() => {
    if (!session) return;                                              // ① la session fait foi
    if (!clients.length || !appts.length || !services.length) return;  // ② rien de chargé

    /* LES DEUX FAMILLES DE RITUELS, PAR LA CATÉGORIE — jamais par le nom.
       Une règle qui reconnaît « Le Défaisage » se tait le jour où quelqu'un
       le renomme, et personne ne voit qu'elle s'est tue (leçon du 18 août). */
    const gbataIds = new Set(services.filter(defaitLaCouronne).map((s) => s.id));
    const vekpeIds = new Set(services.filter(fondeLaCouronne).map((s) => s.id));
    if (gbataIds.size === 0) return;  // aucun défaisage au catalogue : rien à lire

    const today = jourISO();
    const lectures = new Map<string, LectureDesLocks>();
    for (const a of appts) {
      if (!a.clientId) continue;
      const gbata = a.serviceIds.some((id) => gbataIds.has(id));
      const vekpe = a.serviceIds.some((id) => vekpeIds.has(id));
      if (!gbata && !vekpe) continue;
      const l = lectures.get(a.clientId) ?? {};
      if (a.status === 'honoré') {
        if (gbata && (!l.gbata || a.date > l.gbata)) l.gbata = a.date;
        if (vekpe && (!l.vekpe || a.date > l.vekpe)) l.vekpe = a.date;
      } else if (vekpe && a.status !== 'annulé' && a.date >= today) {
        /* UNE CRÉATION AU CARNET LA RETIENT. Un rendez-vous à venir est un
           fait, pas une prédiction : la Maison l'attend, elle ne sort pas. */
        l.vekpeAVenir = true;
      }
      lectures.set(a.clientId, l);
    }

    /* La règle vit dans `mouvementsSansLocks` (shared/clients.ts), pure et
       éprouvée par le harnais : celles que le carnet sort, celles à qui il
       rend leurs locks. */
    const { sorties, rendues } = mouvementsSansLocks(
      clients, (id) => lectures.get(id) ?? {},
    );

    if (sorties.size === 0 && rendues.size === 0) return;
    clientsStore.set((prev) =>
      prev.map((c) => {
        if (sorties.has(c.id)) return { ...c, locksDefaits: true };
        if (rendues.has(c.id)) return { ...c, locksDefaits: undefined };
        return c;
      }),
    );
  }, [session, appts, clients, services]);
}
