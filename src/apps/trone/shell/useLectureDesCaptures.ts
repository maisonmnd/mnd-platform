import { useEffect } from 'react';
import { useAuth, useStaff } from '../../../shared/auth';
import { clientsStore } from '../../../shared/clients';
import { cleDuNumeroWa, messagesWaStore, type MessageWa } from '../../../shared/conversations';
import { quandDocumentDescendu, quandTablePrete, tablePrete } from '../../../shared/sync';
import { useStore } from '../../../shared/store';
import { useSaitIaMaison } from '../../../shared/ia-maison';
import { CLE_DES_CAPTURES, peutLireSeule } from '../../../shared/ia-capture-pur';
import { litLesCaptures } from '../../../shared/ia-capture';
import { staffAccessStore } from '../routes/equipe/data';
import { dettesDeLaClienteMaintenant } from '../routes/clients/dettes-de-la-cliente';

/* ══ LES CAPTURES SE LISENT SEULES — 19 octobre 2026 (chantier `capture`) ══
   Sa décision : « Tout seul, pour une cliente qui doit de l'argent : chaque
   image reçue d'une cliente avec un reste à payer est lue. Les autres images
   (photos de locks) ne sont pas lues. »

   MONTÉ UNE FOIS, DANS LE SHELL. Il ne lit que si la fonction `ia-maison`
   est posée (`useSaitIaMaison`) et si la personne connectée est de la
   direction ou de la Clientèle (`peutLireSeule`) : un poste de caisse ou des
   Finances voit la carte, il ne lit pas seul. Il attend que les messages,
   les fiches, les rendez-vous et les pièces soient descendus
   (`quandTablePrete`), et que le document des captures le soit aussi :
   sinon il relirait, à prix d'or, ce qu'un autre poste a déjà lu. Chaque
   passage attend quelques secondes au hasard, pour que deux Trônes ouverts
   ne partent pas au même instant.

   LE SHELL NE SE REDESSINE PAS À CHAQUE MESSAGE. Le crochet écoute le
   magasin des messages de l'intérieur (`subscribe`), et ne réveille un
   passage que quand le nombre d'images entrantes rangées change : ni un
   accusé de lecture, ni une réaction ne le réveillent. Le Shell porte tout
   le Trône ; le redessiner pour chaque message se mesurerait.

   RIEN NE S'INSCRIT ICI. Le passage range des lectures « à vérifier » ; la
   main les inscrit ou les écarte dans Conversations. */

const ATTENTE_MIN_MS = 4_000;
const ATTENTE_HASARD_MS = 20_000;
const TOUR_MS = 5 * 60_000;

/** Les images entrantes rangées : c'est leur nombre qui réveille un passage. */
const imagesRangees = (messages: readonly MessageWa[]): number =>
  messages.reduce((n, m) => n + (m.sens === 'entrant' && !!m.piece?.chemin && !!m.piece.type?.startsWith('image/') ? 1 : 0), 0);

/** La fiche d'un numéro, par la clé de comparaison de la Maison (Meta dit
    229 97…, la fiche porte 229 01 97…). Une fiche archivée ne doit plus. */
const clientIdDuNumero = (numero: string): string | undefined => {
  const n = cleDuNumeroWa(numero);
  if (!n) return undefined;
  return clientsStore.get().find((c) => !c.archived && (cleDuNumeroWa(c.phone) === n || (!!c.phone2 && cleDuNumeroWa(c.phone2) === n)))?.id;
};

export function useLectureDesCaptures(): void {
  const { session } = useAuth();
  const staff = useStaff();
  const sait = useSaitIaMaison();
  const [acces] = useStore(staffAccessStore);
  const peut = !!session && sait === true && peutLireSeule(staff?.role, staff ? acces[staff.user_id] : undefined);

  useEffect(() => {
    if (!peut) return;
    let vivant = true;
    let pret = false;
    let minuterie: number | undefined;
    const passage = () => {
      if (!vivant || !pret) return;
      if (!tablePrete('clients') || !tablePrete('appointments') || !tablePrete('invoices')) return;
      void litLesCaptures({ messages: messagesWaStore.get(), clientIdDuNumero, dettesDe: dettesDeLaClienteMaintenant })
        .then((r) => { if (r.refus) console.warn('[captures] lecture arrêtée :', r.refus); })
        .catch((e) => console.warn('[captures] passage en panne :', (e as Error)?.message ?? e));
    };
    const plusTard = () => {
      if (minuterie) window.clearTimeout(minuterie);
      minuterie = window.setTimeout(passage, ATTENTE_MIN_MS + Math.random() * ATTENTE_HASARD_MS);
    };
    quandTablePrete('messages_wa', () => {
      void quandDocumentDescendu(CLE_DES_CAPTURES).then(() => {
        if (!vivant) return;
        pret = true;
        plusTard();
      });
    });
    let images = imagesRangees(messagesWaStore.get());
    const desabonne = messagesWaStore.subscribe(() => {
      const n = imagesRangees(messagesWaStore.get());
      if (n === images) return;
      images = n;
      plusTard();
    });
    const tour = window.setInterval(passage, TOUR_MS);
    return () => { vivant = false; desabonne(); if (minuterie) window.clearTimeout(minuterie); window.clearInterval(tour); };
  }, [peut]);
}
