import type { FormuleRapide } from '../../shared/reservation-express';
import type { ExceptionDHoraire, HeureDeLaSemaine, MurPose } from '../../shared/agenda-pur';
import type { MasquesDuSite } from '../../shared/catalogue-pur';
import type { Bande } from './prix-calibre';
import type { AgendaDeLaMaison, CategoriePublique, PrestationPublique } from './agenda';

/* L'ASSEMBLAGE DE L'AGENDA, PUR — 11 octobre 2026 (la vitesse du calendrier).

   Le calendrier paraissait en 4,9 s sur un téléphone lent : huit lectures à
   la base derrière la bibliothèque Supabase, en cascade après React. La
   même règle d'assemblage sert maintenant à deux endroits :
     · au navigateur (agenda.ts), depuis les lignes lues à la base ;
     · à la construction (genere-revelateur.mjs), depuis les mêmes lignes lues
       par REST avec la même clef publique, pour ÉCRIRE l'agenda dans la page
       de réservation : les gestes, les formules et les prix paraissent dès
       que le code arrive, sans attendre la base.
   Une règle tenue à deux endroits finit toujours par diverger ; elle vit ici,
   sans réseau, et le harnais la lit. Les MURS et les CRÉNEAUX PRIS ne
   s'écrivent jamais dans la page : ils se lisent en vif, et les places ne se
   proposent qu'une fois les occupés frais arrivés (Reserver.tsx). Le serveur
   reste seul juge à l'envoi : un agenda écrit hier ne réserve rien de faux. */

export type LigneLue = { id?: string; key?: string; data?: unknown };
export type LignesDeLAgenda = {
  services: LigneLue[];
  categories: LigneLue[];
  docs: LigneLue[];
  blocages: LigneLue[];
  branches: LigneLue[];
};

const lignes = <T,>(rows: LigneLue[]): T[] => rows.map((x) => x.data).filter(Boolean) as T[];
const doc = <T,>(rows: LigneLue[], key: string): T | undefined => rows.find((d) => d.key === key)?.data as T | undefined;

/** SANS BRANCHE DONNÉE, LA BRANCHE VEDETTE (la règle de `maison()`) : la
    vedette active, sinon la première. `null` : aucune branche, donc aucun
    calendrier. */
export function assembleLAgenda(l: LignesDeLAgenda, branchIdDonne?: string): AgendaDeLaMaison | null {
  const reglages = doc<{ hours?: HeureDeLaSemaine[]; maxRdvParJourMaison?: number; maxRdvParJourMaitre?: number; baremeSuspendu?: boolean }>(l.docs, 'mnd_settings') ?? {};
  const bandes = doc<Bande[]>(l.docs, 'mnd_model_bands');
  const bandSets = doc<Record<string, Bande[]>>(l.docs, 'mnd_model_band_sets');
  const exceptions = doc<ExceptionDHoraire[]>(l.docs, 'mnd_horaires_exceptions') ?? [];
  type LigneBranche = { id?: string; data?: { masters?: string[]; seats?: number; flagship?: boolean; status?: string } };
  const toutes = l.branches as LigneBranche[];
  const branche = branchIdDonne
    ? toutes.find((b) => b.id === branchIdDonne)
    : toutes.find((b) => b.data?.flagship && b.data?.status !== 'paused') ?? toutes[0];
  if (!branche || !branche.id) return null;
  const vitrine = doc<{ siteMasques?: MasquesDuSite; formulesRapides?: FormuleRapide[] }>(l.docs, 'mnd_vitrine_config');
  const masques = vitrine?.siteMasques ?? {};
  const formules = (Array.isArray(vitrine?.formulesRapides) ? vitrine.formulesRapides : [])
    .filter((f) => f && Array.isArray(f.serviceIds) && f.serviceIds.length > 0);
  return {
    branchId: branche.id,
    maitres: (branche.data?.masters ?? []).filter(Boolean),
    services: lignes<PrestationPublique>(l.services).filter((s) => s.enabled !== false && !s.archived),
    categories: lignes<CategoriePublique>(l.categories),
    /* Sans horaires descendus, la semaine reste VIDE et chaque jour se dit
       fermé : mieux vaut ne rien proposer que d'ouvrir un jour que la
       Maison ferme (la leçon du lundi 12 octobre, 5 septembre). */
    semaine: Array.isArray(reglages.hours) ? reglages.hours : [],
    exceptions: Array.isArray(exceptions) ? exceptions : [],
    murs: lignes<MurPose>(l.blocages),
    capMaison: Number(reglages.maxRdvParJourMaison ?? 0),
    capMaitre: Number(reglages.maxRdvParJourMaitre ?? 0),
    sieges: Math.max(0, Number(branche.data?.seats ?? 0)),
    masques,
    bandes: Array.isArray(bandes) ? bandes.filter((b) => b && b.id && b.name) : [],
    bandSets: bandSets && typeof bandSets === 'object' ? bandSets : {},
    baremeSuspendu: reglages.baremeSuspendu === true,
    formules,
  };
}

/* L'ÉLAGAGE POUR LA PAGE : seuls les champs que le calendrier lit
   (PrestationPublique), jamais une description, jamais un champ du Trône. La
   liste est celle du type ; un champ de prix oublié ici donnerait un prix
   faux en silence, et c'est pourquoi le harnais relit la page. */
const CHAMPS_DE_LA_PRESTATION = [
  'id', 'name', 'categoryId', 'durationMin', 'scalesWithModel', 'priceFloors', 'bandId', 'bandIds', 'ratePerLock',
  'tarifMode', 'prixParLongueur', 'paliersDeLocks', 'priceXof', 'priceMode', 'hidePrice', 'consultationAvant',
  'enabled', 'archived', 'master',
] as const;
export function elagueLaPrestation(s: PrestationPublique): PrestationPublique {
  const brut = s as unknown as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  for (const k of CHAMPS_DE_LA_PRESTATION) if (brut[k] !== undefined) o[k] = brut[k];
  return o as unknown as PrestationPublique;
}
export function elagueLAgenda(a: AgendaDeLaMaison): AgendaDeLaMaison {
  return {
    ...a,
    services: a.services.map(elagueLaPrestation),
    categories: a.categories.map((c) => ({
      id: c.id, label: c.label,
      ...(c.fon ? { fon: c.fon } : {}), ...(c.parentId ? { parentId: c.parentId } : {}), ...(c.enabled !== undefined ? { enabled: c.enabled } : {}),
    })),
    /* Les murs se lisent en vif, jamais dans la page. */
    murs: [],
  };
}
