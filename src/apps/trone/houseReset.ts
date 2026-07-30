import { supabase } from '../../shared/supabase';

/* Réinitialisation TOTALE de la Maison (« repartir à zéro ») — pour un nouvel
   import depuis une autre plateforme.

   On SUPPRIME directement côté serveur toutes les tables de données (chemin
   volontaire qui contourne le garde-fou anti-suppression-de-masse), en GARDANT :
     · `branches` — l'app a besoin d'au moins une branche ;
     · `staff` / `staff_branches` — ce sont les comptes d'ACCÈS (auth), sinon
       plus personne ne pourrait se reconnecter.
   Puis on pose le drapeau « Maison à blanc » (mnd_house_blank) et on purge le
   localStorage : au rechargement, les semences de collection ne repeuplent plus
   (voir HOUSE_BLANK dans store.ts), et l'app repart vide.

   La table de sauvegarde froide `import_appointments` n'est PAS concernée.
   ⚠ Irréversible sans la sauvegarde JSON exportée au préalable. */

/* Toutes les tables de COLLECTION (une ligne = un enregistrement) à vider.
   `branches` en est ABSENTE à dessein ; les tables d'auth `staff`/`staff_branches`
   ne sont pas des magasins synchronisés et n'y figurent pas non plus. */
const WIPE_TABLES = [
  'appointments', 'invoices', 'clients', 'personas', 'families',
  'catalog_categories', 'catalog_services', 'catalog_products',
  'expenses', 'budgets', 'cashboxes', 'expense_categories',
  'coffre_movements', 'credit_movements', 'tips',
  'consultations_queue', 'consult_forms', 'client_sessions',
  'team', 'campaigns', 'plans', 'subscribers',
  'formations', 'apprenants', 'certifications',
  'academy_applications', 'academy_enrollments',
  'salary_advances', 'attendance', 'leave_requests', 'payroll_runs',
  /* `payments` (KkiaPay) est né le 28-07-2026, APRÈS l'écriture de cette liste :
     il en manquait. Une « réinitialisation totale » laissait donc les paiements
     au serveur, et l'hydratation les ramenait dans une maison censée être neuve.
     Toute table de collection ajoutée plus tard doit venir ici — c'est le seul
     endroit qui décide ce que « repartir à zéro » veut dire. */
  'payments',
];

/** Vide toutes les tables de données sur le serveur. Renvoie la liste des échecs
    (vide = tout est passé). Sans backend : renvoie une liste vide (rien à faire
    côté serveur — le vidage local suffit). */
export async function factoryResetServer(): Promise<string[]> {
  if (!supabase) return [];
  const sb = supabase;
  const failed: string[] = [];
  /* Séquentiel : plus lent mais plus sûr (on n'inonde pas la connexion, et un
     échec isolé n'emporte pas les autres). `not id is null` = toutes les lignes. */
  for (const t of WIPE_TABLES) {
    const { error } = await sb.from(t).delete().not('id', 'is', null);
    if (error) failed.push(`${t} : ${error.message}`);
  }
  /* Tous les documents-singletons (réglages, barème, paliers, offres, RH…). Les
     réglages-objets se reposeront sur leurs valeurs par défaut au rechargement. */
  const { error } = await sb.from('documents').delete().not('key', 'is', null);
  if (error) failed.push(`documents : ${error.message}`);
  return failed;
}

/** Fichier mis en attente par « Remplacer la Maison » — survit à la purge (dans KEEP)
    et est appliqué au redémarrage par applyPendingReplace() (voir backup.ts). */
export const PENDING_REPLACE_KEY = 'mnd_pending_replace';

/** Pose le mode « Maison à blanc », purge le cache local (sauf le drapeau lui-même),
    puis recharge : l'app ré-hydrate d'un serveur vide sans repeupler les semences. */
export function activateBlankAndReload(): void {
  const KEEP = new Set(['mnd_house_blank', 'mnd_reset_v4', PENDING_REPLACE_KEY]);
  Object.keys(localStorage)
    .filter((k) => k.startsWith('mnd_') && !KEEP.has(k))
    .forEach((k) => localStorage.removeItem(k));
  localStorage.setItem('mnd_house_blank', '1');
  window.location.reload();
}

/** « Remplacer TOUTE la Maison par un fichier » : vide le serveur, met le fichier en
    attente (il survit à la purge), passe en Maison à blanc et recharge. Au redémarrage,
    applyPendingReplace() applique le fichier sur une Maison VIDE — le résultat est donc
    EXACTEMENT le contenu du fichier (ajouts, mises à jour ET suppressions), là où la
    restauration classique ne fait qu'ajouter/mettre à jour sans jamais supprimer. */
export async function replaceHouseFromFile(parsed: unknown): Promise<void> {
  const file = parsed as { format?: string } | null;
  if (!file || file.format !== 'mnd-maison') {
    throw new Error('ce fichier n’est pas une sauvegarde de la Maison.');
  }
  await factoryResetServer();
  localStorage.setItem(PENDING_REPLACE_KEY, JSON.stringify(parsed));
  activateBlankAndReload();
}
