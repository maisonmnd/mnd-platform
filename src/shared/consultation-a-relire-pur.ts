/* ══ LA FILE A NE MONTRE QUE CE QUI EST À RELIRE · 18 novembre 2026 ══════════
   Le site dépose la consultation AVANT de réserver la visio : la visio a
   besoin de son identifiant (sa Maison, « La suite » après la visio, le devis
   remis au rendez-vous tenu), et un dépôt public ne fait qu'insérer, il ne se
   retire ni ne se marque. Une visio refusée (déjà une à ce numéro, la limite
   des quatre-vingt-dix jours, un numéro sans WhatsApp, la visio fermée)
   laissait donc en file A une consultation « Rendez-vous demandé : Visio »
   sans visio derrière (essai du 18 novembre 2026, dépôts de 06:57 et 06:58).

   La visio réservée se note sur sa consultation (`visio`, écrit par
   visio-salle seul) : une consultation qui a demandé une visio n'est à relire
   qu'une fois sa visio posée. Refusée puis réglée en privée, elle passe en
   file C comme toute privée réglée. MODULE PUR. */

/** Ce que la file A lit d'une consultation déposée. */
export type ConsultationALaFile = {
  modalite?: string;
  status?: string;
  paidXof?: number;
  answers?: Record<string, unknown> | null;
  visio?: unknown;
};

/** Elle a demandé une visio, et aucune visio ne la tient : le site a déposé, la visio a été refusée. */
export const visioSansSuite = (o: ConsultationALaFile): boolean =>
  o.answers?.rendezVous === 'visio' && !o.visio;

/** À RELIRE (file A) : déposée par le site, ni fermée, ni réglée (file C), et
    sa visio posée quand c'est une visio qu'elle a demandée. */
export const estARelire = (o: ConsultationALaFile): boolean =>
  o.modalite === 'auto' && o.status !== 'fermée' && !(Number(o.paidXof) > 0) && !visioSansSuite(o);
