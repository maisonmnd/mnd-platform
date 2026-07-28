import type { Store } from '../../shared/store';
import { clientsStore, personasStore, familiesStore } from '../../shared/clients';
import { appointmentsStore } from '../../shared/agenda';
import {
  invoicesStore, expensesStore, budgetsStore, cashboxesStore,
  expenseCategoriesStore, coffreStore, creditMovementsStore,
} from '../../shared/finance';
import { categoriesStore, servicesStore, productsStore } from '../../shared/catalog';
import { tipsStore } from '../../shared/tips';
import { offersStore, tiersStore, pointsHistoryStore } from '../../shared/offers';
import { clientSessionsStore } from '../../shared/activity';
import { branchesStore } from '../../shared/branches';
import { consultationsQueueStore } from '../../shared/bridges';
import {
  staffStore, campaignsStore, plansStore, subscribersStore,
  formationsStore, apprenantsStore, certifsStore, automationsStore,
} from './routes/equipe/data';
import { academyApplicationsStore, enrollmentsStore } from './routes/equipe/academy';
import {
  payrollParametersStore, advancesStore, attendanceStore, leaveStore, payrollRunsStore,
} from './routes/equipe/payroll';
import { PENDING_REPLACE_KEY } from './houseReset';

/* Sauvegarde de la Maison — l'assurance-vie née de l'incident du 24 juil. 2026
   (rendez-vous et factures effacés du serveur, retrouvés uniquement grâce à une
   table d'import qui avait survécu par accident).

   EXPORT : on photographie TOUTES les clés `mnd_*` du localStorage — c'est le
   miroir exact de l'état vécu de ce poste (magasins synchronisés + réglages
   locaux), y compris les documents (barème, paramètres) et les magasins qui
   naîtront plus tard : rien à tenir à jour ici, rien d'oublié.

   RESTAURATION : elle ne fait qu'AJOUTER ce qui manque (par identifiant), via
   les magasins — donc la synchro repousse les lignes retrouvées au serveur.
   Jamais d'écrasement, jamais de suppression : rejouer un vieux fichier sur une
   Maison saine est sans danger. Les documents (réglages, barème) restent dans
   le fichier mais ne sont pas réappliqués automatiquement — en cas de perte
   totale, ils se restaurent à la main depuis ce même fichier. */

export const LAST_BACKUP_KEY = 'mnd_last_backup_at';

export type BackupFile = {
  format: 'mnd-maison';
  version: 1;
  exportedAt: string;
  keys: Record<string, unknown>;
};

type Row = { id: string };
/* `any` dans la signature : Store<T[]>.set est une propriété-fonction (donc
   contravariance stricte) — impossible autrement de ranger des Store<Client[]>,
   Store<Invoice[]>… hétérogènes dans un même tableau. */
type CollStore = {
  key: string;
  get(): readonly unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(next: (prev: any[]) => any[]): void;
};

/** Les collections restaurables (objets à `id`) — libellé au pluriel pour le bilan. */
const COLLECTIONS: { store: CollStore; label: string }[] = [
  { store: clientsStore, label: 'clientes' },
  { store: appointmentsStore, label: 'rendez-vous' },
  { store: invoicesStore, label: 'factures' },
  { store: servicesStore, label: 'prestations' },
  { store: categoriesStore, label: 'catégories du catalogue' },
  { store: productsStore, label: 'produits' },
  { store: expensesStore, label: 'dépenses' },
  { store: budgetsStore, label: 'budgets' },
  { store: cashboxesStore, label: 'caisses' },
  { store: expenseCategoriesStore, label: 'catégories de dépenses' },
  { store: coffreStore, label: 'mouvements du coffre-fort' },
  { store: creditMovementsStore, label: 'mouvements d’avoir' },
  { store: familiesStore, label: 'familles' },
  { store: personasStore, label: 'personas' },
  { store: tipsStore, label: 'pourboires' },
  { store: offersStore, label: 'offres' },
  { store: tiersStore, label: 'paliers du Cercle' },
  { store: pointsHistoryStore, label: 'événements de points' },
  { store: plansStore, label: 'formules d’abonnement' },
  { store: subscribersStore, label: 'abonnées' },
  { store: formationsStore, label: 'formations' },
  { store: apprenantsStore, label: 'apprenants' },
  { store: certifsStore, label: 'certifications' },
  { store: staffStore, label: 'membres du personnel' },
  { store: campaignsStore, label: 'campagnes' },
  { store: automationsStore, label: 'automations marketing' },
  { store: academyApplicationsStore, label: 'candidatures Académie' },
  { store: enrollmentsStore, label: 'inscriptions Académie' },
  { store: payrollParametersStore, label: 'paramètres de paie' },
  { store: advancesStore, label: 'avances sur salaire' },
  { store: attendanceStore, label: 'présences' },
  { store: leaveStore, label: 'congés' },
  { store: payrollRunsStore, label: 'bulletins de paie' },
  { store: clientSessionsStore, label: 'sessions clientes' },
  { store: branchesStore, label: 'branches' },
  { store: consultationsQueueStore, label: 'consultations en ligne' },
];

/** Photographie complète : toutes les clés `mnd_*` du localStorage, valeurs décodées. */
export function collectBackup(): BackupFile {
  const keys: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('mnd_')) continue;
    const raw = localStorage.getItem(k);
    if (raw === null) continue;
    try { keys[k] = JSON.parse(raw); } catch { keys[k] = raw; }
  }
  return { format: 'mnd-maison', version: 1, exportedAt: new Date().toISOString(), keys };
}

/** Télécharge la sauvegarde et consigne la date du geste (locale à ce poste). */
export function downloadBackup(): { fileName: string } {
  const file = collectBackup();
  const fileName = `sauvegarde-maison-mnd-${file.exportedAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_BACKUP_KEY, file.exportedAt);
  return { fileName };
}

export type RestoreReport = {
  exportedAt: string | null;
  added: { label: string; n: number }[];
  totalAdded: number;
};

/** Restaure un fichier de sauvegarde.
 *  - par défaut (add-only) : n'AJOUTE que les fiches manquantes (par `id`), rien
 *    d'existant n'est touché — rejouer un vieux fichier reste sans danger ;
 *  - `overwrite: true` : MET À JOUR les fiches déjà présentes portant le même `id`
 *    (et ajoute les nouvelles). Utile après une correction de données (migration) :
 *    le fichier redevient la source de vérité pour les fiches qu'il contient. */
export function restoreBackup(parsed: unknown, opts?: { overwrite?: boolean }): RestoreReport {
  const overwrite = opts?.overwrite ?? false;
  const file = parsed as Partial<BackupFile> | null;
  if (!file || file.format !== 'mnd-maison' || typeof file.keys !== 'object' || file.keys === null) {
    throw new Error('ce fichier n’est pas une sauvegarde de la Maison.');
  }
  const keys = file.keys as Record<string, unknown>;
  const added: { label: string; n: number }[] = [];
  let totalAdded = 0;
  for (const { store, label } of COLLECTIONS) {
    const val = keys[store.key];
    if (!Array.isArray(val)) continue;
    const incoming = val.filter(
      (x): x is Row => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string',
    );
    if (!incoming.length) continue;
    if (overwrite) {
      const byId = new Map(incoming.map((x) => [x.id, x] as const));
      store.set((prev) => {
        const rows = prev as Row[];
        const had = new Set(rows.map((x) => x.id));
        const merged = rows.map((x) => byId.get(x.id) ?? x); // remplace les existants
        for (const x of incoming) if (!had.has(x.id)) merged.push(x); // ajoute les nouveaux
        return merged;
      });
      added.push({ label, n: incoming.length });
      totalAdded += incoming.length;
    } else {
      const have = new Set((store.get() as Row[]).map((x) => x.id));
      const missing = incoming.filter((x) => !have.has(x.id));
      if (!missing.length) continue;
      store.set((prev) => [...prev, ...missing]);
      added.push({ label, n: missing.length });
      totalAdded += missing.length;
    }
  }
  return { exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : null, added, totalAdded };
}

/** Applique le fichier mis en attente par « Remplacer la Maison » (voir
    replaceHouseFromFile), après le redémarrage à blanc : la Maison est VIDE, on la
    peuple exactement avec le contenu du fichier (overwrite). Renvoie true si un
    fichier a été appliqué. À appeler AU DÉMARRAGE, avant le premier rendu. */
export function applyPendingReplace(): boolean {
  const raw = localStorage.getItem(PENDING_REPLACE_KEY);
  if (!raw) return false;
  localStorage.removeItem(PENDING_REPLACE_KEY);
  try {
    const parsed = JSON.parse(raw) as { format?: string; keys?: Record<string, unknown> };
    if (parsed.format !== 'mnd-maison' || !parsed.keys) return false;
    /* 1. Réglages-DOCUMENTS (identité, horaires, thème, marque, barèmes…) + scalaires
       (branche courante…) : écrits directement en localStorage. Ce sont les clés NON
       gérées par COLLECTIONS. La Maison est à blanc (serveur vidé) : au montage, chaque
       magasin-document lira SA valeur restaurée et la poussera au serveur (bindDocument
       garde le local quand le serveur est vide). Ainsi « Remplacer » ne perd RIEN. */
    const collKeys = new Set(COLLECTIONS.map((c) => c.store.key));
    for (const [k, v] of Object.entries(parsed.keys)) {
      if (collKeys.has(k)) continue; // les collections passent par restoreBackup ci-dessous
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota localStorage */ }
    }
    /* 2. COLLECTIONS (clientes, RDV, factures, catalogue…) : via les magasins, pour
       l'état en mémoire ET la poussée au serveur (overwrite = le fichier fait foi). */
    restoreBackup(parsed, { overwrite: true });
    return true;
  } catch {
    return false;
  }
}
