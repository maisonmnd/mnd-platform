/* ══ LA NOUVELLE GRILLE, POSÉE DEPUIS LE TRÔNE — 10 octobre 2026 ═════════
   La carte et son juge vivent dans `nouvelle-grille-pur.ts`. Ici, le seul
   geste : appliquer la phase « maintenant » une fois, depuis le Trône seul
   (jamais depuis le navigateur d'une cliente), comme le nom de la Maison le
   23 septembre. Le juge ne touche qu'une ligne restée telle qu'on la connaît,
   et rejoué il ne fait rien : un deuxième poste, ou un deuxième démarrage,
   n'écrit pas une ligne de plus.

   TROIS VERROUS, parce qu'on écrit le catalogue de toute la Maison :
   ① UNE SESSION. Sans elle, les lectures sont refusées et les magasins ne
     tiennent que le cache du poste (ou rien) ; rien ne s'écrit.
   ② UN CATALOGUE RECONNU. « Table prête » veut aussi dire « lecture
     échouée » : appliquer la grille à un catalogue vide ferait naître les
     nouveautés seules, puis la marquerait posée pour toujours.
   ③ LA VITRINE LUE SUR LE SERVEUR. Les masques s'écrivent sur la version du
     serveur, relue à l'instant, jamais sur un défaut local : la promesse de
     descente d'un document se tient au bout de 5 s même si rien n'est venu,
     et écrire alors pousserait une vitrine vide par-dessus la vraie. Pas de
     lecture, pas d'écriture, pas de marque : on retentera.

   Les masques d'abord, le catalogue ensuite : une nouveauté ne paraît
   jamais sur le site ou dans Ma Couronne avant d'être masquée.

   La phase « janvier » (les hausses, Ma Couronne) a son propre déclencheur,
   qui fige d'abord les rendez-vous déjà pris : elle n'est pas posée ici. */
import { categoriesStore, servicesStore, type CatalogCategory, type Service } from './catalog';
import { vitrineConfigStore, type VitrineConfig } from './bridges';
import { quandTablePrete } from './sync';
import { supabase } from './supabase';
import { appliqueLaGrille, masquesDeLaGrille } from './nouvelle-grille-pur';
import { isoDuJour } from './offres-pur';

const MARQUEUR = 'mnd_nouvelle_grille_2026_10_maintenant';
const FIN = Date.parse('2026-12-31T23:59:59+01:00');

/** Le catalogue de la Maison est-il là ? Trois lignes qu'il porte depuis le
    premier jour : le resserrage, le lavage, la venue de GBÈJÍ™. */
const catalogueCharge = (): boolean => {
  const sv = servicesStore.get();
  const cats = categoriesStore.get();
  return sv.some((x) => x.id === 'sv-atl-ii-e') && sv.some((x) => x.id === 'sv-plt-05-ess-c')
    && cats.some((x) => x.id === 'atl-ii-gbeji');
};

/** Les masques, posés sur la vitrine RELUE AU SERVEUR. Vrai si la vitrine a
    été lue (masquée ou déjà masquée), faux sinon. */
const masquee = async (): Promise<boolean> => {
  if (!supabase) return false;
  const { data, error } = await supabase.from('documents').select('data').eq('key', 'mnd_vitrine_config').maybeSingle();
  const cfgServeur = (data as { data?: VitrineConfig } | null)?.data;
  if (error || !cfgServeur || typeof cfgServeur !== 'object') return false;
  const cfg = masquesDeLaGrille(cfgServeur, 'maintenant');
  if (cfg) vitrineConfigStore.set(cfg);
  return true;
};

const posee = (): void => {
  const b = appliqueLaGrille(
    { services: servicesStore.get() as unknown as { id: string }[], categories: categoriesStore.get() as unknown as { id: string }[] },
    'maintenant',
    isoDuJour(new Date()),
  );
  if (!b) return;
  categoriesStore.set(b.categories as unknown as CatalogCategory[]);
  servicesStore.set(b.services as unknown as Service[]);
};

const marque = () => { try { localStorage.setItem(MARQUEUR, new Date().toISOString()); } catch { /* sans stockage, on rejouera : sans effet */ } };

/** À appeler une fois, au démarrage du Trône seulement. */
export function migreLaNouvelleGrille(): void {
  if (Date.now() > FIN || !supabase) return;
  try { if (localStorage.getItem(MARQUEUR)) return; } catch { /* on tente */ }
  const sb = supabase;
  let services = false;
  let categories = false;
  let enCours = false;
  let faite = false;
  const essaie = async () => {
    if (faite || enCours || !services || !categories) return;
    if (!catalogueCharge()) return;
    enCours = true;
    try {
      if (!(await sb.auth.getSession()).data.session) return;   // ①
      if (!catalogueCharge()) return;                               // ②
      if (!(await masquee())) return;                               // ③
      posee();
      marque();
      faite = true;
    } finally { enCours = false; }
  };
  /* Le catalogue peut arriver après le signal (cache, puis serveur), et la
     session après le démarrage (la porte de connexion) : on réessaie à
     chaque fois, tant que ce n'est pas fait. */
  servicesStore.subscribe(() => { if (!faite) setTimeout(() => void essaie(), 0); });
  categoriesStore.subscribe(() => { if (!faite) setTimeout(() => void essaie(), 0); });
  sb.auth.onAuthStateChange((evenement) => {
    if (!faite && (evenement === 'SIGNED_IN' || evenement === 'INITIAL_SESSION' || evenement === 'TOKEN_REFRESHED')) {
      setTimeout(() => void essaie(), 0);
    }
  });
  quandTablePrete('catalog_services', () => { services = true; void essaie(); });
  quandTablePrete('catalog_categories', () => { categories = true; void essaie(); });
}
