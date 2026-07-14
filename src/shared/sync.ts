import type { Store } from './store';
import { supabase } from './supabase';

/* Couche de synchronisation « offline-first ».

   Chaque magasin du front reste la source vécue (localStorage, rendu immédiat).
   Quand un backend est configuré (`supabase` non null), on :
     1. hydrate le magasin depuis la base au démarrage (ou on y pousse la semence
        locale si la table est vide) ;
     2. pousse les changements locaux (upsert/delete, avec debounce) ;
     3. applique en retour les changements distants via Realtime.

   Sans backend, chaque `bind*` est un no-op : la Maison tourne en local.

   Convention de stockage : une ligne = un enregistrement, charge utile complète
   dans `data jsonb`, `branch_id` extrait pour l'indexation/RLS. Aucune traduction
   de casse : les formes camelCase du front sont stockées telles quelles. */

const PUSH_DEBOUNCE_MS = 250;

type WithId = { id: string; branchId?: string };

/** Lie un magasin de collection (tableau d'objets à `id`) à une table distante. */
export function bindCollection<T extends WithId>(store: Store<T[]>, table: string): void {
  if (!supabase) return;
  const sb = supabase;

  let applyingRemote = false;
  let lastPushed = new Map<string, string>();

  const snapshot = (items: readonly T[]): Map<string, string> => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.id, JSON.stringify(it));
    return m;
  };

  const rowOf = (it: T) => ({ id: it.id, branch_id: it.branchId ?? null, data: it });

  const pushDiff = async (prev: Map<string, string>, next: Map<string, string>, items: readonly T[]) => {
    const upserts = items.filter((it) => prev.get(it.id) !== next.get(it.id)).map(rowOf);
    const deletes: string[] = [];
    for (const id of prev.keys()) if (!next.has(id)) deletes.push(id);

    if (upserts.length) {
      const { error } = await sb.from(table).upsert(upserts);
      if (error) console.warn(`[mnd-sync] ${table} upsert:`, error.message);
    }
    if (deletes.length) {
      const { error } = await sb.from(table).delete().in('id', deletes);
      if (error) console.warn(`[mnd-sync] ${table} delete:`, error.message);
    }
  };

  // 1. Hydratation (ou amorçage de la semence).
  void (async () => {
    const { data, error } = await sb.from(table).select('id,data');
    if (error) {
      console.warn(`[mnd-sync] ${table} hydrate:`, error.message);
      return;
    }
    if (data && data.length) {
      const items = data.map((r) => (r as { data: T }).data);
      applyingRemote = true;
      store.set(items);
      applyingRemote = false;
      lastPushed = snapshot(items);
    } else {
      const local = store.get();
      lastPushed = snapshot(local);
      if (local.length) await pushDiff(new Map(), lastPushed, local);
    }
  })();

  /* Filet de fraîcheur : au retour de focus, on re-tire l'état distant
     (throttlé, et jamais pendant qu'une poussée locale est en attente)
     — couvre un éventuel événement Realtime manqué en arrière-plan.
     `force` ignore le throttle : utilisé au changement de session (login/logout),
     car sous RLS les données visibles dépendent de l'utilisateur connecté. */
  let lastRefetch = 0;
  const refetch = async (force = false) => {
    if (timer) return; // une écriture locale part bientôt — ne pas écraser
    if (!force && Date.now() - lastRefetch < 15000) return;
    lastRefetch = Date.now();
    const { data, error } = await sb.from(table).select('id,data');
    if (error || !data) return;
    const items = data.map((r) => (r as { data: T }).data);
    const next = snapshot(items);
    const cur = snapshot(store.get());
    const same = next.size === cur.size && [...next].every(([k, v]) => cur.get(k) === v);
    if (same) return;
    applyingRemote = true;
    store.set(items);
    applyingRemote = false;
    lastPushed = next;
  };
  window.addEventListener('focus', () => void refetch());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refetch();
  });
  /* Session prête / connexion / déconnexion : re-tire immédiatement — sous RLS,
     les lignes visibles dépendent de l'utilisateur, et l'hydratation initiale peut
     précéder la restauration de la session (INITIAL_SESSION). */
  sb.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') void refetch(true);
  });

  // 2. Poussée des changements locaux (coalescée).
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    if (applyingRemote) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const items = store.get();
      const next = snapshot(items);
      const prev = lastPushed;
      lastPushed = next;
      void pushDiff(prev, next, items);
    }, PUSH_DEBOUNCE_MS);
  });

  // 3. Application des changements distants (Realtime).
  sb.channel(`mnd:${table}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const items = [...store.get()];
        const at = (id: string) => items.findIndex((x) => x.id === id);
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id as string;
          const i = at(id);
          if (i >= 0) items.splice(i, 1);
        } else {
          const row = payload.new as { id: string; data: T };
          const i = at(row.id);
          if (i >= 0) items[i] = row.data;
          else items.push(row.data);
        }
        applyingRemote = true;
        store.set(items);
        applyingRemote = false;
        lastPushed = snapshot(items);
      },
    )
    .subscribe();
}

/** Lie un magasin singleton (une valeur) à une ligne de `documents` (clé stable). */
export function bindDocument<T>(store: Store<T>, key: string): void {
  if (!supabase) return;
  const sb = supabase;

  let applyingRemote = false;
  let lastPushed: string | undefined;

  const upsert = (val: T) => sb.from('documents').upsert({ key, data: val });

  // 1. Hydratation (ou amorçage). `seed` n'est vrai qu'au premier appel :
  //    les ré-hydratations sur changement de session ne font que lire.
  const hydrate = async (seed: boolean) => {
    const { data, error } = await sb.from('documents').select('data').eq('key', key).maybeSingle();
    if (error) {
      console.warn(`[mnd-sync] doc ${key} hydrate:`, error.message);
      return;
    }
    if (data) {
      applyingRemote = true;
      store.set((data as { data: T }).data);
      applyingRemote = false;
      lastPushed = JSON.stringify((data as { data: T }).data);
    } else if (seed) {
      const local = store.get();
      lastPushed = JSON.stringify(local);
      const { error: upErr } = await upsert(local);
      if (upErr) console.warn(`[mnd-sync] doc ${key} seed:`, upErr.message);
    }
  };
  void hydrate(true);
  /* Session prête / connexion / déconnexion : re-lit (droits RLS changés), sans ré-amorcer. */
  sb.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') void hydrate(false);
  });

  // 2. Poussée locale (coalescée).
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    if (applyingRemote) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const val = store.get();
      const j = JSON.stringify(val);
      if (j === lastPushed) return;
      lastPushed = j;
      const { error } = await upsert(val);
      if (error) console.warn(`[mnd-sync] doc ${key} upsert:`, error.message);
    }, PUSH_DEBOUNCE_MS);
  });

  // 3. Application distante (Realtime).
  sb.channel(`mnd:doc:${key}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'documents', filter: `key=eq.${key}` },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as { data: T } | undefined;
        if (!row) return;
        applyingRemote = true;
        store.set(row.data);
        applyingRemote = false;
        lastPushed = JSON.stringify(row.data);
      },
    )
    .subscribe();
}
