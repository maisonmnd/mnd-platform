import type { Store } from './store';
import { supabase } from './supabase';
import './version'; // veille de version : l'app se recharge quand un déploiement arrive

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

/* ---------- État de synchronisation (affiché en topbar) ----------
   Sans indicateur, un échec de push partait en console.warn : la caissière ne
   savait jamais qu'une facture n'existait que sur son poste. On suit les tables
   « en attente » (écriture locale pas encore poussée) et « en échec », plus
   l'état réseau — le Shell affiche une pastille d'un mot. */
export type SyncState = { enabled: boolean; online: boolean; pending: number; failed: number; failedNames: string[]; lastOkAt: number | null };
const syncListeners = new Set<() => void>();
const dirtyTables = new Set<string>();
/* UN REFUS DE DROIT N'EST PAS UNE PANNE.

   Depuis que des comptes non souverains ouvrent Le Trône, la pastille virait
   au rouge en permanence : un maître ne peut ni lire ni écrire les tables de
   paie, et chaque tentative était comptée comme un échec de synchronisation.

   Ce n'en est pas un. C'est la sécurité de la base qui fait son travail — et
   annoncer une panne quand tout fonctionne apprend à ignorer l'alerte, ce qui
   coûte plus cher que l'alerte elle-même. Ces tables sont mises DE CÔTÉ : on
   cesse d'essayer, on ne crie pas, et le journal le note une fois.

   Un vrai échec — réseau coupé, table absente, contrainte violée — continue
   d'allumer le rouge. */
const horsPortee = new Set<string>();
const estRefusDeDroit = (msg: string | undefined): boolean => {
  const m = (msg ?? '').toLowerCase();
  return m.includes('row-level security') || m.includes('permission denied') || m.includes('42501');
};
const failedTables = new Set<string>();
let lastOkAt: number | null = null;
let syncSnapshot: SyncState = {
  enabled: !!supabase,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  failedNames: [],
  pending: 0,
  failed: 0,
  lastOkAt: null,
};
function bumpSync(): void {
  /* LES NOMS, PAS SEULEMENT LE NOMBRE. « Des écritures n'ont pas pu être
     poussées » n'aide personne : il a fallu ouvrir la console du navigateur
     pour apprendre laquelle, le 6 août, pendant que la Maison tournait. */
  syncSnapshot = {
    enabled: !!supabase, online: navigator.onLine,
    pending: dirtyTables.size, failed: failedTables.size,
    failedNames: [...failedTables].sort(), lastOkAt,
  };
  syncListeners.forEach((f) => f());
}
export function subscribeSync(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => { syncListeners.delete(fn); };
}
export function getSyncState(): SyncState { return syncSnapshot; }
if (typeof window !== 'undefined') {
  window.addEventListener('online', bumpSync);
  window.addEventListener('offline', bumpSync);
}
const syncMark = {
  dirty(t: string) { dirtyTables.add(t); bumpSync(); },
  ok(t: string) { dirtyTables.delete(t); failedTables.delete(t); lastOkAt = Date.now(); bumpSync(); },
  fail(t: string) { dirtyTables.delete(t); failedTables.add(t); bumpSync(); },
  /* La table sort du décompte ET des tentatives : une fois pour la session. */
  horsPortee(t: string) {
    dirtyTables.delete(t);
    failedTables.delete(t);
    if (!horsPortee.has(t)) {
      horsPortee.add(t);
      console.info(`[mnd-sync] ${t} : hors de portée de ce compte — les droits l'y refusent, ce n'est pas une panne.`);
    }
    bumpSync();
  },
  estHorsPortee: (t: string) => horsPortee.has(t),
};

type WithId = { id: string; branchId?: string };

/* TABLES DONT UNE LIGNE NE SE SUPPRIME JAMAIS DEPUIS UN POSTE — 8 août 2026.

   `branches` est l'axe de toute la Maison : chaque cliente, chaque rendez-vous,
   chaque facture porte un `branch_id`, et l'écran filtre tout par la branche
   choisie. Perdre cette ligne ne perd aucune donnée — elle les rend toutes
   invisibles d'un coup, ce qui se vit exactement comme une perte totale.

   C'est arrivé le 8 août : la fiche de L'atelier MND a disparu de la table, et
   la branche par défaut du code s'est insérée à sa place. Les 406 rendez-vous,
   185 clientes et 58 factures étaient intacts, orphelins d'une carte d'identité.

   Le garde-fou de masse ne pouvait rien : il exige ≥ 10 lignes, et cette table
   n'en portera jamais dix. Une suppression de branche est un geste rare et grave
   — elle se fait au SQL, en connaissance de cause (voir
   `supabase/0016_supprimer_branche_studio.sql`), jamais par le diff d'un cache. */
const SANS_SUPPRESSION = new Set(['branches']);

/** Lie un magasin de collection (tableau d'objets à `id`) à une table distante. */
export function bindCollection<T extends WithId>(store: Store<T[]>, table: string): void {
  if (!supabase) return;
  const sb = supabase;

  let applyingRemote = false;
  let lastPushed = new Map<string, string>();
  /* AUCUNE POUSSÉE AVANT D'AVOIR LU. Tant que le poste n'a pas vu le serveur,
     `lastPushed` est vide : tout lui paraît nouveau, et le moindre changement
     local déclenche une poussée massive que les garde-fous bloquent. On attend
     donc la première lecture réussie — le serveur fait foi, y compris sur
     l'ordre des choses. */
  let lu = false;

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

    /* Une table hors de portée ne se retente pas : on épargne au serveur des
       refus certains, et au comptoir une pastille qui clignote pour rien. */
    if (syncMark.estHorsPortee(table)) return true;
    let ok = true;
    if (upserts.length) {
      /* GARDE-FOU ÉCRASEMENT de MASSE (incident du 02-08-2026 : une fenêtre
         restée ouverte pendant un import a réécrit 175 fiches clientes par son
         cache d'avant, effaçant 158 téléphones au passage).

         Le garde-fou des suppressions ne couvrait pas ce cas : ici rien n'était
         supprimé, tout était RÉ-ÉCRIT. Le symptôme est pourtant le même — un
         état local périmé qui se croit la vérité.

         La règle : avant une poussée massive, on demande au serveur ce qu'il
         porte. S'il contient des lignes que ce poste n'a JAMAIS vues, c'est lui
         qui est en avance — on abandonne la poussée et on se réaligne sur lui.
         Une modification en masse légitime (réécriture de descriptions, import
         local) connaît toutes les lignes du serveur et passe sans obstacle. */
      const massif = upserts.length >= 10 && upserts.length * 4 >= prev.size;
      if (massif) {
        const { data: distant } = await sb.from(table).select('id,data');
        const inconnues = (distant ?? []).filter((r) => !next.has((r as { id: string }).id));
        if (inconnues.length) {
          console.warn(
            `[mnd-sync] ${table} : écrasement de masse BLOQUÉ (${upserts.length} lignes) — le serveur porte ${inconnues.length} ligne(s) que ce poste n'a jamais vues. Rien n'a été écrit ; on se réaligne sur le serveur.`,
          );
          const items2 = (distant ?? []).map((r) => (r as { data: T }).data);
          applyingRemote = true;
          store.set(items2);
          applyingRemote = false;
          lastPushed = snapshot(items2);
          /* LE GARDE-FOU A FAIT SON TRAVAIL : la poussée périmée est abandonnée
             et le poste porte maintenant EXACTEMENT ce que porte le serveur.
             Il n'y a donc plus rien en attente — annoncer « en échec » serait
             faux, et ce faux a coûté cher : la pastille restait rouge jusqu'au
             prochain rechargement, et l'on finissait par ne plus la croire.
             On dit ce qui s'est passé dans le journal, et on repart au vert. */
          syncMark.ok(table);
          return;
        }
      }
      const { error } = await sb.from(table).upsert(upserts);
      if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(table); return true; }
      if (error) { ok = false; console.warn(`[mnd-sync] ${table} upsert:`, error.message); }
    }
    if (deletes.length) {
      /* GARDE-FOU des suppressions (incident du 23-07 : 28 prestations effacées
         du serveur d'un geste local ; incident du 08-08 : la fiche de la seule
         branche, emportée par un cache neuf). Un diff qui efface est presque
         toujours un état local corrompu ou vidé — cache purgé, hydratation
         ratée. On REFUSE de le propager, on le dit en console, et on va
         rechercher la vérité au serveur.

         Trois refus, et non plus un seul :

         ① les tables structurelles (voir `SANS_SUPPRESSION`) ne perdent jamais
            une ligne par un diff — quelle que soit leur taille ;
         ② un diff qui VIDE une table entière n'est jamais légitime : les
            suppressions vraies se font une à une à l'écran, et personne n'efface
            sa dernière branche, sa dernière caisse ou son dernier persona en
            passant. C'est la signature d'un cache purgé ou d'une hydratation
            ratée — celle du 8 août, où une table d'UNE ligne a été vidée sans
            que le seuil des dix ne bronche ;
         ③ le seuil de masse d'origine (≥ 10 lignes ET ≥ 25 % de la table).

         Ce qui reste permis : retirer un persona parmi six, une caisse parmi
         trois — un geste délibéré, qui laisse la table debout. */
      const structurelle = SANS_SUPPRESSION.has(table);
      const videTout = prev.size > 0 && deletes.length >= prev.size;
      const enMasse = deletes.length >= 10 && deletes.length * 4 >= prev.size;
      const massive = structurelle || videTout || enMasse;
      if (massive) {
        const motif = structurelle
          ? 'table structurelle — une suppression ne peut venir que du SQL'
          : videTout
            ? 'ce diff VIDERAIT la table'
            : 'état local suspect';
        console.warn(`[mnd-sync] ${table} : suppression BLOQUÉE (${deletes.length}/${prev.size} lignes) — ${motif}. Rien n'a été effacé du serveur.`);
        /* ON NE SE CONTENTE PLUS DE REFUSER. Un état local jugé suspect le
           reste tant qu'on ne le remplace pas : la poussée suivante
           représentait la même demande d'effacement, indéfiniment, et la
           pastille restait rouge jusqu'au rechargement manuel.
           On va donc rechercher la vérité au serveur et on s'aligne dessus.
           Le poste redevient sain sans qu'on ait à lui demander quoi que ce
           soit, et rien n'a été détruit. */
        const { data: distant } = await sb.from(table).select('id,data');
        const items2 = (distant ?? []).map((r) => (r as { data: T }).data);
        applyingRemote = true;
        store.set(items2);
        applyingRemote = false;
        lastPushed = snapshot(items2);
        syncMark.ok(table);
        return true;
      } else {
        const { error } = await sb.from(table).delete().in('id', deletes);
        if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(table); return true; }
        if (error) { ok = false; console.warn(`[mnd-sync] ${table} delete:`, error.message); }
      }
    }
    if (ok) syncMark.ok(table); else syncMark.fail(table);
    return ok;
  };

  // 1. Hydratation — MAIS PAS AVANT QUE LA SESSION SOIT LÀ.
  void (async () => {
    /* SANS SESSION, « zéro ligne » NE VEUT PAS DIRE « serveur vide ».
       L'hydratation partait dès le chargement du module, avant que Supabase
       n'ait restauré la session. Les tables publiques — le catalogue, les
       branches — répondaient normalement ; celles que la RLS protège —
       clientes, rendez-vous, factures, familles — rendaient zéro ligne, et
       ce zéro était lu comme « le serveur ne porte rien, alignons-nous ».
       Le cache local était effacé.
       La session arrivait une fraction de seconde plus tard et tout se
       rechargeait, mais dans cet intervalle une poussée pouvait partir sur du
       vide : les garde-fous la bloquaient, et la pastille restait rouge.
       C'était la cause des quatre tables toujours citées ensemble.
       On attend donc la session ; l'écouteur ci-dessous hydratera dès qu'elle
       est là. */
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data, error } = await sb.from(table).select('id,data');
    if (error) {
      /* Une LECTURE ratee doit se voir elle aussi. La pastille restait « Synchronise »
         sur un poste qui travaillait en realite sur son seul cache local — table
         absente, RLS, reseau au demarrage. */
      if (estRefusDeDroit(error.message)) { syncMark.horsPortee(table); return; }
      console.warn(`[mnd-sync] ${table} hydrate:`, error.message);
      syncMark.fail(table);
      return;
    }
    if (data && data.length) {
      const items = data.map((r) => (r as { data: T }).data);
      applyingRemote = true;
      store.set(items);
      applyingRemote = false;
      lastPushed = snapshot(items);
      lu = true;
    } else {
      /* Table serveur VIDE — ET LE SERVEUR FAIT FOI. On aligne le magasin local
         sur ce vide, sans rien pousser.

         AVANT, ce chemin poussait le cache du navigateur vers le serveur : une
         table vide était lue comme « maison neuve à amorcer ». Le 30-07-2026,
         cette ligne a ressuscité 792 rendez-vous, puis 344 clientes, puis 81
         prestations — à chaque fois qu'on vidait la base, le premier onglet
         ouvert la remplissait à nouveau. Aucun effacement ne pouvait tenir, et
         la Maison ne pouvait pas décider d'avoir un catalogue vide.

         Le prix, assumé : une Maison vraiment neuve démarre sans catégories de
         départ (SERVICES_SEED et PRODUCTS_SEED étaient déjà vides — « tout naît
         de l'usage »). Et si un poste avait des lignes créées hors ligne que le
         serveur n'a jamais reçues, elles cèdent devant lui. C'est le sens de
         « le serveur fait foi » : une seule vérité, la même pour tous les
         appareils, qu'on peut effacer pour de bon. */
      applyingRemote = true;
      store.set([] as unknown as T[]);
      applyingRemote = false;
      lastPushed = new Map();
      lu = true;
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
    /* Le refetch vaut lecture : c'est souvent LUI qui hydrate pour de bon,
       quand la session arrive apres le chargement du module. */
    lu = true;
    applyingRemote = false;
    lastPushed = next;
  };
  /* RETOUR DU RESEAU : on relance une poussee. Sans cela, les ecritures faites
     hors ligne attendaient qu'on les re-modifie a la main pour repartir. */
  window.addEventListener('online', () => {
    const items = store.get();
    void pushDiff(lastPushed, snapshot(items), items).then((ok) => {
      if (ok) lastPushed = snapshot(store.get());
    });
  });
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
    if (applyingRemote || !lu) return;
    syncMark.dirty(table);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      /* `timer` DOIT etre libere ici. Il n'etait jusqu'ici que `clearTimeout`e,
         jamais remis a undefined : le garde `if (timer) return` de refetch()
         restait donc vrai a vie des la premiere ecriture locale de la session,
         et TOUS les rattrapages — focus, retour d'onglet, changement de session —
         sortaient sans rien faire. Le filet de fraicheur n'existait plus. */
      timer = undefined;
      const items = store.get();
      const next = snapshot(items);
      const prev = lastPushed;
      /* On n'avance le repere qu'APRES un envoi reussi. En l'avancant avant, une
         poussee en echec (hors ligne, RLS, reseau) sortait ses lignes de tout
         diff futur : l'ecriture etait perdue sans retour possible, et le
         rechargement suivant l'effacait. */
      void pushDiff(prev, next, items).then((ok) => {
        if (ok) lastPushed = next;
      });
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
          /* L'ECHO DE NOTRE PROPRE ECRITURE, et lui seul. Supabase renvoie a
             l'emetteur ce qu'il vient d'ecrire ; reappliquer cet echo pendant
             une saisie REMBOBINE le champ, et la frappe se met a sauter.

             On ne saute que ce qui est deja identique en local : un vrai
             changement venu d'un autre poste passe toujours. Un garde plus
             large — « ignorer tant qu'une poussee attend » — aurait perdu en
             silence ce qu'une collegue vient d'enregistrer. */
          if (i >= 0 && JSON.stringify(items[i]) === JSON.stringify(row.data)) return;
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
      if (estRefusDeDroit(error.message)) { syncMark.horsPortee(`doc:${key}`); return; }
      console.warn(`[mnd-sync] doc ${key} hydrate:`, error.message);
      return;
    }
    if (data) {
      applyingRemote = true;
      store.set((data as { data: T }).data);
      applyingRemote = false;
      lastPushed = JSON.stringify((data as { data: T }).data);
    } else if (seed && !syncMark.estHorsPortee(`doc:${key}`)) {
      const local = store.get();
      lastPushed = JSON.stringify(local);
      const { error: upErr } = await upsert(local);
      if (upErr) console.warn(`[mnd-sync] doc ${key} seed:`, upErr.message);
    }
  };
  /* MÊME RÈGLE QU'AUX COLLECTIONS : sans session, une lecture vide ne prouve
     rien, et amorcer le serveur avec le cache local serait une faute. On
     n'amorce donc qu'une fois la session connue — et une seule fois. */
  let amorce = false;
  void (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    amorce = true;
    await hydrate(true);
  })();
  sb.auth.onAuthStateChange((event) => {
    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'TOKEN_REFRESHED') return;
    const premier = !amorce;
    amorce = true;
    void hydrate(premier);
  });

  // 2. Poussée locale (coalescée).
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    if (applyingRemote) return;
    syncMark.dirty(`doc:${key}`);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      /* LE GARDE SE REARME. Sans cette remise a zero, `timer` reste verite a
         vie apres la premiere ecriture, et la garde de frappe ci-dessous ne
         laisserait plus JAMAIS passer une mise a jour distante. */
      timer = undefined;
      const val = store.get();
      const j = JSON.stringify(val);
      if (j === lastPushed) { syncMark.ok(`doc:${key}`); return; }
      lastPushed = j;
      const { error } = await upsert(val);
      if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(`doc:${key}`); return; }
      if (error) { syncMark.fail(`doc:${key}`); console.warn(`[mnd-sync] doc ${key} upsert:`, error.message); }
      else syncMark.ok(`doc:${key}`);
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
        const j = JSON.stringify(row.data);
        /* L'ECHO DE NOTRE PROPRE ECRITURE. Supabase renvoie a l'emetteur les
           changements qu'il vient de faire. Appliquer cet echo tel quel
           REMBOBINE la saisie en cours : on tape « Les reprises », la poussee
           part a « Les reprise », l'echo revient et efface le « s » qu'on
           venait d'ajouter. Le champ ecrivait alors ce qu'il voulait, et la
           pastille de synchro semblait se battre contre le clavier.
           Ce qui revient identique a ce qu'on a pousse n'apprend rien. */
        if (j === lastPushed) return;
        /* UNE FRAPPE EN COURS EST PLUS RECENTE QUE LE SERVEUR. Tant qu'une
           poussee est en attente, l'etat local vaut mieux que ce qui arrive :
           on laisse la poussee partir, et l'echo suivant fera foi. */
        if (timer) return;
        applyingRemote = true;
        store.set(row.data);
        applyingRemote = false;
        lastPushed = j;
      },
    )
    .subscribe();
}
