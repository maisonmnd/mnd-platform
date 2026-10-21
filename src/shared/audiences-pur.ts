/* LES AUDIENCES — 21 octobre 2026.

   « Campagnes, Automatisations et Audience ne sont pas reliés » (Yéman).
   L'Audience comptait ses segments sur les fiches de la branche, hors
   passantes ; le registre des Clientes, lui, ne s'ouvrait pas sur un segment,
   et quand il filtre, il le fait sur une autre population (La Maison : têtes
   couronnées, sans la diaspora ni les sorties). « Voir les 38 » en aurait
   montré moins de 38, et le chiffre aurait menti.

   UNE AUDIENCE, UN JUGE : ce fichier dit qui en fait partie, et les deux
   écrans le lisent (Marketing pour compter et écrire, Clientes pour montrer).
   Les audiences calculées se refont à chaque lecture depuis le vécu, sans rien
   poser sur les fiches.

   L'ACCORD POUR LES NOUVELLES (choix de Yéman au sélecteur) : WhatsApp
   n'autorise une campagne qu'à qui l'a accepté ; sans accord noté, personne.
   Un numéro qui envoie des promotions sans accord est signalé, puis bloqué,
   et avec lui tous les rappels et reçus qui partent de ce numéro. Les
   notifications de Ma Couronne, elles, ne partent qu'aux têtes qui les ont
   allumées sur leur téléphone. Pur, éprouvé par `verifie-le-marketing-branche`. */

/** « Nouvelles de la Maison : oui / non », daté, et d'où vient la réponse.
    `stop` : la tête a répondu STOP à une campagne. */
export type AccordDesNouvelles = { oui: boolean; le: string; par: 'comptoir' | 'site' | 'couronne' | 'stop' };

export const aAccepteLesNouvelles = (c: { nouvelles?: AccordDesNouvelles }): boolean => c.nouvelles?.oui === true;

/** Ce qu'une audience lit d'une fiche. */
export type TeteDAudience = {
  id: string;
  branchId: string;
  archived?: boolean;
  segments?: readonly string[];
  birthday?: string;
  phone?: string;
  authUserId?: string;
  nouvelles?: AccordDesNouvelles;
};

/** Ce qu'une audience lit du vécu, préparé par l'écran. */
export type ContexteDAudience = {
  /** AAAA-MM-JJ, au jour du salon. */
  aujourdhui: string;
  /** clientId → les dates (AAAA-MM-JJ) de ses venues honorées. */
  venues: ReadonlyMap<string, readonly string[]>;
  /** Les têtes qui ont un rendez-vous à venir, non annulé. */
  aVenir: ReadonlySet<string>;
  /** Les têtes dont une formule court aujourd'hui. */
  abonnees: ReadonlySet<string>;
};

export type AudienceCalculee = { cle: string; nom: string; dit: string };

export const AUDIENCES_CALCULEES: readonly AudienceCalculee[] = [
  { cle: 'dormantes', nom: 'Dormantes depuis 90 jours', dit: 'dernière venue honorée il y a plus de 90 jours, rien à venir' },
  { cle: 'abonnees', nom: 'Abonnées en cours', dit: 'une formule qui court aujourd’hui' },
  { cle: 'anniversaires', nom: 'Anniversaire ce mois', dit: 'date de naissance sur la fiche' },
  { cle: 'une-venue', nom: 'Venues une seule fois', dit: 'une seule venue honorée, il y a plus de 60 jours, rien à venir' },
];

export const PREFIXE_DU_SEGMENT = 'seg:';
export const cleDuSegment = (segment: string): string => `${PREFIXE_DU_SEGMENT}${segment}`;
export const segmentDeLaCle = (cle: string): string | null =>
  cle.startsWith(PREFIXE_DU_SEGMENT) ? cle.slice(PREFIXE_DU_SEGMENT.length) : null;

/** Le nom d'une audience, pour l'écran. Une clé inconnue se dit telle quelle. */
export function nomDeLAudience(cle: string): string {
  const seg = segmentDeLaCle(cle);
  if (seg !== null) return seg;
  return AUDIENCES_CALCULEES.find((a) => a.cle === cle)?.nom ?? cle;
}

export const estUneAudienceConnue = (cle: string): boolean =>
  segmentDeLaCle(cle) !== null || AUDIENCES_CALCULEES.some((a) => a.cle === cle);

/** AAAA-MM-JJ décalé de `n` jours (midi UTC : aucun changement d'heure ne le fait glisser). */
const jourMoins = (jour: string, n: number): string => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** QUI PEUT ÊTRE D'UNE AUDIENCE : la branche, pas archivée, pas de passage.
    « Une audience est une liste de gens à qui l'on écrit » : la passante n'en
    est pas, lui écrire est du bruit. Même règle que la taille d'hier. */
export function baseDesAudiences<T extends TeteDAudience>(
  clients: readonly T[], branchId: string, estDePassage: (c: T) => boolean,
): T[] {
  return clients.filter((c) => c && c.branchId === branchId && !c.archived && !estDePassage(c));
}

/** La tête est-elle de l'audience ? `base` a déjà été passée par `baseDesAudiences`. */
export function estDansLAudience(cle: string, t: TeteDAudience, ctx: ContexteDAudience): boolean {
  const seg = segmentDeLaCle(cle);
  if (seg !== null) return (t.segments ?? []).includes(seg);
  const venues = ctx.venues.get(t.id) ?? [];
  const derniere = venues.reduce<string>((d, v) => (v > d ? v : d), '');
  switch (cle) {
    case 'dormantes':
      return venues.length > 0 && derniere < jourMoins(ctx.aujourdhui, 90) && !ctx.aVenir.has(t.id);
    case 'abonnees':
      return ctx.abonnees.has(t.id);
    case 'anniversaires':
      return /^\d{4}-\d{2}-\d{2}/.test(t.birthday ?? '') && (t.birthday ?? '').slice(5, 7) === ctx.aujourdhui.slice(5, 7);
    case 'une-venue':
      return venues.length === 1 && derniere < jourMoins(ctx.aujourdhui, 60) && !ctx.aVenir.has(t.id);
    default:
      return false;
  }
}

export function membresDeLAudience<T extends TeteDAudience>(cle: string, base: readonly T[], ctx: ContexteDAudience): T[] {
  return base.filter((t) => estDansLAudience(cle, t, ctx));
}

/** QUI UNE CAMPAGNE ATTEINDRAIT, et par où.
    WhatsApp : l'accord noté ET un numéro. Notification : un abonnement de
    Ma Couronne sur l'identifiant de la fiche ou sur son compte rattaché. */
export type PorteeDeLAudience<T> = { tetes: T[]; whatsapp: T[]; notification: T[]; sansAccord: T[] };

export function porteeDeLAudience<T extends TeteDAudience>(
  membres: readonly T[], abonnesAuxNotifications: ReadonlySet<string>,
): PorteeDeLAudience<T> {
  const whatsapp = membres.filter((t) => aAccepteLesNouvelles(t) && !!(t.phone ?? '').replace(/\D/g, ''));
  const notification = membres.filter((t) => abonnesAuxNotifications.has(t.id) || (!!t.authUserId && abonnesAuxNotifications.has(t.authUserId)));
  const sansAccord = membres.filter((t) => !aAccepteLesNouvelles(t));
  return { tetes: [...membres], whatsapp, notification, sansAccord };
}
