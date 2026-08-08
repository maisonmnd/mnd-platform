import { useEffect } from 'react';
import { useAppointments } from '../../../shared/agenda';
import { useServices } from '../../../shared/catalog';
import { clientsStore, useClients, usePersonas } from '../../../shared/clients';
import { evaluePersona, personaDe, usePersonaRegles } from '../../../shared/persona';
import { useAuth } from '../../../shared/auth';

/* LE PERSONA SUIT LE CARNET — Le Trône, 8 août 2026.

   À chaque rendez-vous ajouté ou honoré, la Maison relit les signaux de la
   cliente et corrige son archétype si — et seulement si — la lecture est
   franche. La règle de décision vit dans `shared/persona.ts` ; ce fichier ne
   fait que la déclencher et écrire.

   QUATRE VERROUS, parce qu'une écriture automatique sur 185 fiches est
   exactement le genre de geste qui a coûté cher à cette Maison :

   ① SANS SESSION, ON NE TOUCHE À RIEN. L'écriture des fiches exige le personnel
     (RLS), et surtout : sans session, les tables protégées rendent zéro ligne.
     Un carnet vide ferait retomber toute la Maison sur le seuil d'accueil.

   ② ON N'AGIT QUE SUR DU CHARGÉ. Ni cliente, ni rendez-vous, ni catalogue en
     mémoire = on attend. Un catalogue absent rendrait toutes les prestations
     illisibles et effacerait les archétypes qui en dépendent.

   ③ SEUL UN VERDICT CONFIANT ÉCRIT. Un doute laisse la fiche telle quelle. On
     ne rétrograde jamais vers le seuil d'accueil : ne rien dire vaut mieux que
     dire faux.

   ④ UNE FICHE FIGÉE À LA MAIN NE BOUGE PLUS (`personaFige`).

   Le calcul est idempotent : une deuxième passe sur les mêmes données n'écrit
   rien. C'est ce qui permet de le laisser tourner à chaque changement du carnet
   sans jamais boucler. */

export function usePersonaVivant(): void {
  const { session } = useAuth();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [personas] = usePersonas();
  const [services] = useServices();
  /* Les règles de pesée se modifient au Trône : la lecture suit le réglage
     courant, sans redéploiement. */
  const [regles] = usePersonaRegles();

  useEffect(() => {
    if (!session) return;                                   // ① la session fait foi
    if (!clients.length || !appts.length || !services.length) return;  // ② rien de chargé
    if (!personas.length) return;

    const parId = new Map(services.map((s) => [s.id, s]));
    const aujourdhui = new Date().toISOString().slice(0, 10);

    /* Les rendez-vous d'une cliente, groupés une fois : 185 fiches × 406
       rituels se relisent autrement à chaque passe. */
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) {
      const l = parCliente.get(a.clientId);
      if (l) l.push(a);
      else parCliente.set(a.clientId, [a]);
    }

    const aEcrire = new Map<string, string>();
    for (const c of clients) {
      if (c.personaFige) continue;                          // ④ la main l'emporte
      const siens = parCliente.get(c.id);
      if (!siens?.length) continue;                         // sans carnet, rien à lire
      const v = evaluePersona(c, siens, parId, aujourdhui, regles);
      if (!v.confiant) continue;                            // ③ le doute n'écrit pas
      const cible = personaDe(personas, v.cle);
      if (!cible || cible.id === c.persona) continue;
      aEcrire.set(c.id, cible.id);
    }

    if (aEcrire.size === 0) return;
    clientsStore.set((prev) =>
      prev.map((c) => {
        const id = aEcrire.get(c.id);
        return id ? { ...c, persona: id } : c;
      }),
    );
  }, [session, appts, clients, personas, services, regles]);
}
