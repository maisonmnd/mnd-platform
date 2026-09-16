import type { Service } from './catalog';
import { servicesStore } from './catalog';
import { CATALOG_V6 } from './catalog-v6';
import { TOUT_KIDS } from './kids';
import { SERVICES_PROTOCOLE, SERVICES_RAVIVEUR } from './protocoles';
import type { Palier } from './paliers';

/* ══ LE RÉFÉRENTIEL DES PALIERS — 16 septembre 2026 ═══════════════════
   « Selon ce que nous savons des paliers, peux-tu réorganiser les services
   du catalogue selon chaque palier » (Yéman).

   LE PALIER D'UNE PRESTATION EST ÉCRIT DANS LA SEMENCE, une fois, avec la
   raison à côté (catalog-v6, kids, protocoles). Le catalogue vivant, lui,
   a été posé un jour puis retouché fiche par fiche ; quand la Maison tranche
   une règle nouvelle, sept fiches à rouvrir à la main, c'est une oubliée.

   MÊME GESTE QUE « MND Kids · N à remettre au tarif » : un bouton qui dit
   combien de fiches s'écartent du référentiel, et qui les reprend d'un
   coup. Il ne touche QUE le palier : prix, durée, nom, tout le reste est à
   la Maison. Une fiche que le référentiel ne connaît pas (créée au
   Catalogue) garde le palier qu'on lui a donné.

   TROIS RÈGLES, TRANCHÉES LE 16 SEPTEMBRE : un lavage reste un lavage
   (Fondation) ; le resserrage est Élévation, même la reprise simple ; un
   forfait prend le palier de son acte le plus haut. Les petits gestes
   (reprise frontale essentielle, retouches post restauration) et le
   raviveur de couleur restent en Fondation, sur décision de la Maison. */

/** Le palier voulu par la Maison pour chaque prestation semée, par identifiant. */
export const PALIER_DU_REFERENTIEL: ReadonlyMap<string, Palier> = new Map(
  [...CATALOG_V6, ...TOUT_KIDS, ...SERVICES_PROTOCOLE, ...SERVICES_RAVIVEUR].map((s) => [s.id, s.palier] as const),
);

export type EcartDePalier = { id: string; name: string; actuel: Palier; voulu: Palier };

/** LES FICHES QUI S'ÉCARTENT du référentiel : présentes au catalogue, connues
    de la semence, et pas au palier voulu. Pur, pour être éprouvé. */
export const ecartsDePalier = (
  services: readonly Pick<Service, 'id' | 'name' | 'palier'>[],
  referentiel: ReadonlyMap<string, Palier> = PALIER_DU_REFERENTIEL,
): EcartDePalier[] => {
  const ecarts: EcartDePalier[] = [];
  for (const s of services) {
    const voulu = referentiel.get(s.id);
    if (voulu && voulu !== s.palier) ecarts.push({ id: s.id, name: s.name, actuel: s.palier, voulu });
  }
  return ecarts;
};

/** Combien de fiches le bouton reprendrait. */
export const paliersAReprendre = (services: readonly Service[]): number => ecartsDePalier(services).length;

/** REPREND LES PALIERS DU RÉFÉRENTIEL sur le catalogue vivant, et dit
    combien de fiches ont changé. Idempotent : un second clic ne fait rien. */
export function reprendLesPaliers(): number {
  let touchees = 0;
  servicesStore.set((prev) => prev.map((s) => {
    const voulu = PALIER_DU_REFERENTIEL.get(s.id);
    if (!voulu || voulu === s.palier) return s;
    touchees += 1;
    return { ...s, palier: voulu };
  }));
  return touchees;
}
