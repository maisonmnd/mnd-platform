/* UN AUTOMATISME QUI S'EMBALLE SE TAIT — 1er octobre 2026.

   « Lors de la prise de RDV je n'arrive pas à enregistrer ou changer les
   horaires » (Yéman). La pastille disait « Synchronisation… · clients » depuis
   des heures : les fiches clientes se réécrivaient sans arrêt, et à chaque
   réécriture tout l'écran se recalculait, la fenêtre du rendez-vous comprise.
   Le menu de l'heure et les boutons n'avaient plus le temps de répondre.

   Le Trône porte plusieurs automatismes qui écrivent SEULS dans les fiches à
   partir de ce qu'ils lisent : la marque « de passage », les locks défaites, le
   persona, le parrainage, le rattachement des réservations. Chacun est
   idempotent seul. Mais deux postes qui ne lisent pas la même chose (l'un sur
   une ancienne version, l'autre non), ou deux règles qui se contredisent,
   se renvoient la même fiche indéfiniment : l'un écrit, l'autre corrige, le
   premier recorrige. Aucun des deux n'a tort tout seul, et l'écran est mort.

   LA RÈGLE : un automatisme écrit quand il a quelque chose à dire, pas en
   continu. Au-delà de six passages par minute, il se met en pause un quart
   d'heure, et il le dit. Les gestes de la main, eux, ne passent jamais par
   ici : seule l'écriture que personne n'a demandée se limite.

   Ce module n'importe rien, pour que le harnais `verifie-l-ecriture-automatique`
   l'éprouve avec une horloge qu'il tient lui-même. */

export const FENETRE_MS = 60_000;
export const PASSAGES_AU_PLUS = 6;
export const PAUSE_MS = 15 * 60_000;
/* Plusieurs écritures d'un même passage (un effet qui pose cinq champs à la
   suite) comptent pour UNE : c'est le passage qu'on mesure, pas la ligne. */
export const MEME_PASSAGE_MS = 250;

const passages = new Map<string, number[]>();
const pauses = new Map<string, number>();
const ecouteurs = new Set<() => void>();
let instantane = '';

function notifie(maintenant: number): void {
  const neuf = automatismesEnPause(maintenant).join(',');
  if (neuf === instantane) return;
  instantane = neuf;
  ecouteurs.forEach((f) => f());
}

/** Cet automatisme a-t-il le droit d'écrire maintenant ? Compte le passage s'il l'a. */
export function peutEcrireSeul(nom: string, maintenant: number = Date.now()): boolean {
  const fin = pauses.get(nom);
  if (fin !== undefined) {
    if (maintenant < fin) return false;
    pauses.delete(nom);
    passages.delete(nom);
    notifie(maintenant);
  }
  const recents = (passages.get(nom) ?? []).filter((t) => maintenant - t < FENETRE_MS);
  const dernier = recents[recents.length - 1];
  if (dernier !== undefined && maintenant - dernier < MEME_PASSAGE_MS) {
    passages.set(nom, recents);
    return true;
  }
  if (recents.length >= PASSAGES_AU_PLUS) {
    pauses.set(nom, maintenant + PAUSE_MS);
    passages.set(nom, recents);
    console.warn(`[mnd] l'automatisme « ${nom} » a écrit ${recents.length} fois en une minute : il se tait un quart d'heure. Un autre poste ouvert, ou une autre règle, réécrit les mêmes fiches.`);
    notifie(maintenant);
    return false;
  }
  recents.push(maintenant);
  passages.set(nom, recents);
  return true;
}

/** Les automatismes qui se taisent en ce moment, par ordre alphabétique. */
export function automatismesEnPause(maintenant: number = Date.now()): string[] {
  return [...pauses].filter(([, fin]) => maintenant < fin).map(([nom]) => nom).sort();
}

/** Pour la pastille : la liste, en une chaîne stable tant qu'elle ne change pas. */
export const pausesDites = (): string => instantane;
export function ecouteLesPauses(fn: () => void): () => void {
  ecouteurs.add(fn);
  return () => { ecouteurs.delete(fn); };
}

/** Un magasin dont l'écriture AUTOMATIQUE passe par la règle. `get` et le reste
    ne changent pas : on ne garde que la porte par laquelle un automatisme écrit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gardeLEcriture<S extends { set: (...a: any[]) => void }>(nom: string, magasin: S): Pick<S, 'set'> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: ((...a: any[]) => { if (peutEcrireSeul(nom)) magasin.set(...a); }) as S['set'],
  };
}

/** Pour le harnais seulement : repartir d'une ardoise vide. */
export function oublieLesPassages(): void {
  passages.clear();
  pauses.clear();
  instantane = '';
}
