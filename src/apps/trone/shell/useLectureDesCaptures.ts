import { useEffect } from 'react';
import { useAuth, useStaff } from '../../../shared/auth';
import { clientsStore } from '../../../shared/clients';
import { messagesWaStore, numeroWa } from '../../../shared/conversations';
import { quandDocumentDescendu, quandTablePrete, tablePrete } from '../../../shared/sync';
import { useStore } from '../../../shared/store';
import { useSaitIaMaison } from '../../../shared/ia-maison';
import { peutDemander } from '../../../shared/ia-maison-pur';
import { CHANTIER_CAPTURE, CLE_DES_CAPTURES } from '../../../shared/ia-capture-pur';
import { litLesCaptures } from '../../../shared/ia-capture';
import { staffAccessStore } from '../routes/equipe/data';
import { dettesDeLaClienteMaintenant } from '../routes/clients/dettes-de-la-cliente';

/* ══ LES CAPTURES SE LISENT SEULES — 19 octobre 2026 (chantier `capture`) ══
   Sa décision : « Tout seul, pour une cliente qui doit de l'argent : chaque
   image reçue d'une cliente avec un reste à payer est lue. Les autres images
   (photos de locks) ne sont pas lues. »

   MONTÉ UNE FOIS, DANS LE SHELL. Il ne lit que si la fonction `ia-maison`
   est posée (`useSaitIaMaison`) et si la personne connectée a le droit du
   chantier (`peutDemander` : la direction, la Clientèle, la Vente, les
   Finances). Il attend que les messages, les fiches, les rendez-vous et les
   pièces soient descendus (`quandTablePrete`), et que le document des
   captures le soit aussi : sinon il relirait, à prix d'or, ce qu'un autre
   poste a déjà lu. Chaque passage attend quelques secondes au hasard, pour
   que deux Trônes ouverts ne partent pas au même instant.

   RIEN NE S'INSCRIT ICI. Le passage range des lectures « à vérifier » ; la
   main les inscrit ou les écarte dans Conversations. */

const ATTENTE_MIN_MS = 4_000;
const ATTENTE_HASARD_MS = 20_000;
const TOUR_MS = 5 * 60_000;

export function useLectureDesCaptures(): void {
  const { session } = useAuth();
  const staff = useStaff();
  const sait = useSaitIaMaison();
  const [acces] = useStore(staffAccessStore);
  const [messages] = useStore(messagesWaStore);
  const peut = !!session && sait === true && peutDemander(staff?.role, CHANTIER_CAPTURE, staff ? acces[staff.user_id] : undefined);
  /* Le nombre d'images entrantes rangées : c'est lui qui réveille le passage,
     pas chaque accusé de lecture ni chaque réaction. */
  const images = messages.filter((m) => m.sens === 'entrant' && m.piece?.chemin && m.piece.type?.startsWith('image/')).length;

  useEffect(() => {
    if (!peut) return;
    let vivant = true;
    let minuterie: number | undefined;
    const passage = () => {
      if (!vivant) return;
      if (!tablePrete('clients') || !tablePrete('appointments') || !tablePrete('invoices')) return;
      const clientIdDuNumero = (numero: string): string | undefined => {
        const n = numeroWa(numero);
        return clientsStore.get().find((c) => !c.archived && (numeroWa(c.phone) === n || (!!c.phone2 && numeroWa(c.phone2) === n)))?.id;
      };
      void litLesCaptures({ messages: messagesWaStore.get(), clientIdDuNumero, dettesDe: dettesDeLaClienteMaintenant })
        .then((r) => { if (r.refus) console.warn('[captures] lecture arrêtée :', r.refus); })
        .catch((e) => console.warn('[captures] passage en panne :', (e as Error)?.message ?? e));
    };
    quandTablePrete('messages_wa', () => {
      void quandDocumentDescendu(CLE_DES_CAPTURES).then(() => {
        if (!vivant) return;
        minuterie = window.setTimeout(passage, ATTENTE_MIN_MS + Math.random() * ATTENTE_HASARD_MS);
      });
    });
    const tour = window.setInterval(passage, TOUR_MS);
    return () => { vivant = false; if (minuterie) window.clearTimeout(minuterie); window.clearInterval(tour); };
  }, [peut, images]);
}
