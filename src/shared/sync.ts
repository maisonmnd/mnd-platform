import type { Store } from './store';
import { supabase } from './supabase';
import {
  tableSuivie, CARTE_DES_TABLES, champsChanges, inscrisLesGestes, identiteCourante,
  type Geste, type GesteVerbe, type ChampChange,
} from './journal';

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
export type SyncState = {
  enabled: boolean; online: boolean; pending: number; failed: number;
  failedNames: string[];
  /** Ce qui a été refusé, et POURQUOI — une entrée par table en échec. */
  failedWhy: { table: string; raison: string; brut: string }[];
  /** LES TABLES MISES DE CÔTÉ — refusées par les droits, donc volontairement
      silencieuses (un maître n'a pas à voir de rouge parce que la paie lui est
      fermée). Silencieuses ne veut pas dire invisibles : un écran vide sans
      explication est pire qu'une alerte de trop. Le panneau « Cet appareil »
      les nomme. */
  ecartees: string[];
  lastOkAt: number | null;
};

/* LA RAISON, PAS SEULEMENT LE NOM — 9 août 2026.

   Le 6 août, la pastille ne disait que « des écritures n'ont pas pu être
   poussées » : il a fallu ouvrir la console pour apprendre lesquelles, et on a
   ajouté les noms. Le 9 août, la pastille nommait bien trois tables — et il a
   fallu ouvrir la console pour apprendre pourquoi. Le nom seul ne distingue pas
   une migration jamais collée d'un réseau coupé, alors que l'un se répare en
   trente secondes et l'autre s'attend.

   On traduit donc l'erreur du serveur en une phrase que le comptoir peut lire,
   et on garde le message brut pour qui saura le lire. `supabase/audit_synchro.sql`
   confirme en base ce que cette phrase avance. */
function raisonLisible(msg: string | undefined): string {
  const m = (msg ?? '').toLowerCase();
  /* PostgREST ne trouve pas la table : la migration n'a pas été collée. */
  if (m.includes('pgrst205') || m.includes('does not exist') || m.includes('schema cache')) {
    return 'table absente en base, une migration n’a pas été collée';
  }
  if (m.includes('pgrst204') || m.includes('column')) {
    return 'colonne manquante, le schéma de la table ne correspond pas';
  }
  if (m.includes('violates foreign key') || m.includes('violates check') || m.includes('duplicate key')) {
    return 'écriture refusée par une contrainte de la base';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('timeout')) {
    return 'serveur injoignable';
  }
  if (m.includes('jwt') || m.includes('expired')) {
    return 'session expirée, reconnectez-vous';
  }
  return msg?.trim() || 'refus du serveur, sans message';
}
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
/** Les tables en échec ET le message brut du serveur, table → message. */
const failedTables = new Map<string, string>();
let lastOkAt: number | null = null;
let syncSnapshot: SyncState = {
  enabled: !!supabase,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  failedNames: [],
  failedWhy: [],
  ecartees: [],
  pending: 0,
  failed: 0,
  lastOkAt: null,
};
function bumpSync(): void {
  /* LES NOMS, PAS SEULEMENT LE NOMBRE. « Des écritures n'ont pas pu être
     poussées » n'aide personne : il a fallu ouvrir la console du navigateur
     pour apprendre laquelle, le 6 août, pendant que la Maison tournait. */
  const noms = [...failedTables.keys()].sort();
  syncSnapshot = {
    enabled: !!supabase, online: navigator.onLine,
    pending: dirtyTables.size, failed: failedTables.size,
    failedNames: noms,
    failedWhy: noms.map((t) => {
      const brut = failedTables.get(t) ?? '';
      return { table: t, raison: raisonLisible(brut), brut };
    }),
    ecartees: [...horsPortee].sort(),
    lastOkAt,
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
  /* Le message du serveur voyage avec l'échec : sans lui, la pastille nomme une
     table et laisse deviner la cause — ce qui envoie ouvrir la console. */
  fail(t: string, msg?: string) { dirtyTables.delete(t); failedTables.set(t, msg ?? ''); bumpSync(); },
  /* La table sort du décompte ET des tentatives : une fois pour la session. */
  horsPortee(t: string) {
    dirtyTables.delete(t);
    failedTables.delete(t);
    if (!horsPortee.has(t)) {
      horsPortee.add(t);
      console.info(`[mnd-sync] ${t} : hors de portée de ce compte, les droits l'y refusent, ce n'est pas une panne.`);
    }
    bumpSync();
  },
  estHorsPortee: (t: string) => horsPortee.has(t),
};

/* ---------- La fenêtre d'avant-hydratation — 10 août 2026 ----------

   Entre l'ouverture du poste et la PREMIÈRE lecture d'une table, le magasin
   local n'est que le cache d'hier : ce qui s'y écrivait n'était pas poussé
   (`lu` est faux), puis la lecture arrivait et REMPLAÇAIT tout — la vente
   tapée dans cette fenêtre disparaissait sans un mot, facture comprise.
   La fenêtre se referme en deux temps : `bindCollection` rejoue les écritures
   du froid sur l'état du serveur (voir `premiereLecture`), et les modules qui
   DÉRIVENT du journal (le stock) demandent ici où en est la table pour
   différer leurs gestes (voir shared/stock.ts).

   « Prête » = la première lecture est RÉSOLUE : réussie, refusée par les
   droits, ou échouée (poste hors ligne — le cache est alors tout ce qu'on a,
   et le comptoir doit vivre). Sans backend, tout est prêt d'emblée. */
const tablesResolues = new Set<string>();
const attentesLecture = new Map<string, Array<() => void>>();
const marqueTableResolue = (t: string): void => {
  if (tablesResolues.has(t)) return;
  tablesResolues.add(t);
  const fns = attentesLecture.get(t);
  attentesLecture.delete(t);
  fns?.forEach((f) => f());
};
export const tablePrete = (t: string): boolean => !supabase || tablesResolues.has(t);
/** Appelle `fn` dès que la table est prête — tout de suite si elle l'est déjà. */
export function quandTablePrete(t: string, fn: () => void): void {
  if (tablePrete(t)) { fn(); return; }
  const fns = attentesLecture.get(t) ?? [];
  fns.push(fn);
  attentesLecture.set(t, fns);
}

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
/* ── LA PURGE DÉCLARÉE — 19 août 2026 ──────────────────────────────
   Le garde-fou des suppressions bloque tout effacement de masse : c'est lui
   qui a sauvé les prestations le 23-07 et la branche le 08-08. Mais il ne
   distinguait pas l'ACCIDENT du GESTE : « reconstruire les parts de
   pourboire depuis le registre » efface délibérément presque toute la table,
   et le garde-fou annulait le geste en silence — les parts revenaient du
   serveur, et l'écran semblait ne rien faire.

   Un écran qui va VOLONTAIREMENT effacer en masse le déclare ici, juste
   avant d'écrire. Le laissez-passer vaut UNE poussée : consommé aussitôt,
   utilisé ou non, il ne peut jamais couvrir l'accident de demain. Les tables
   structurelles restent intouchables — aucun laissez-passer ne les ouvre. */
const purgesAutorisees = new Set<string>();
export function autoriserLaPurge(table: string): void { purgesAutorisees.add(table); }

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

  /* LES ÉCRITURES DU FROID. Tant que la première lecture n'est pas arrivée,
     chaque geste local s'enregistre ici — dernière valeur par id, suppressions
     par id — pour être REJOUÉ sur l'état du serveur au lieu d'être effacé par
     lui. Le repère `vuFroid` part du cache : seuls les gestes de CETTE session
     comptent, jamais les lignes d'hier (qui, elles, cèdent devant le serveur). */
  let vuFroid = snapshot(store.get());
  const froidModifies = new Map<string, string>();
  const froidSupprimes = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /* LE REGISTRE DE NOS PROPRES ÉCHOS — 18 août 2026, le champ « ce que la
     maison observe d'elle » qui refusait de finir une phrase.

     Supabase renvoie à l'émetteur ce qu'il vient d'écrire. L'ancien garde ne
     sautait cet écho que s'il était IDENTIQUE au local — or pendant une
     saisie, le local a déjà une frappe d'avance : l'écho de la poussée
     précédente passait le garde et REMBOBINAIT le champ au milieu du mot.

     On note donc CE QU'ON POUSSE, ligne par ligne, et l'on saute tout
     événement qui rend exactement une de nos poussées récentes — c'est notre
     écho, pas une nouvelle. Le vrai changement d'un autre poste ne correspond
     jamais à ce registre et passe toujours. Vingt secondes de mémoire : un
     écho met moins d'une, et un registre sans fin garderait de vieux états
     qu'un autre poste pourrait légitimement réécrire à l'identique. */
  const ECHO_MEMOIRE_MS = 20_000;
  const echosAttendus = new Map<string, { j: string; at: number }[]>();
  const noteLesPoussees = (rows: { id: string; data: T }[]) => {
    const now = Date.now();
    for (const r of rows) {
      const liste = (echosAttendus.get(r.id) ?? []).filter((e) => now - e.at < ECHO_MEMOIRE_MS);
      liste.push({ j: JSON.stringify(r.data), at: now });
      echosAttendus.set(r.id, liste);
    }
  };
  const estNotreEcho = (id: string, j: string): boolean => {
    const now = Date.now();
    const liste = (echosAttendus.get(id) ?? []).filter((e) => now - e.at < ECHO_MEMOIRE_MS);
    echosAttendus.set(id, liste);
    return liste.some((e) => e.j === j);
  };

  const rowOf = (it: T) => ({ id: it.id, branch_id: it.branchId ?? null, data: it });

  const pushDiff = async (prev: Map<string, string>, next: Map<string, string>, items: readonly T[]) => {
    /* Le premier refus rencontré porte l'explication qui remontera à la
       pastille — un échec sans son message renvoie le comptoir à la console. */
    let refus: string | undefined;
    const upserts = items.filter((it) => prev.get(it.id) !== next.get(it.id)).map(rowOf);
    const deletes: string[] = [];
    for (const id of prev.keys()) if (!next.has(id)) deletes.push(id);
    /* Le laissez-passer de purge se consomme ICI, qu'il serve ou non : une
       poussée l'épuise, il ne peut pas rester traîner pour couvrir un
       accident futur. */
    const purgeVoulue = purgesAutorisees.delete(table);

    /* Une table hors de portée ne se retente pas : on épargne au serveur des
       refus certains, et au comptoir une pastille qui clignote pour rien.

       MAIS ON NE DIT PLUS « C'EST ÉCRIT » — 16 août 2026. Ce chemin rendait
       `true`, et l'appelant avançait alors son repère `lastPushed` : la ligne
       refusée sortait de TOUS les diffs suivants. Le geste était perdu sans un
       mot, et sans retour possible — c'est ainsi qu'une annulation faite sur Ma
       Couronne n'est jamais revenue au Trône. Silence sur l'ALERTE, oui ; jamais
       sur le fait. Le repère ne bouge pas, et si les droits s'ouvrent (session
       rafraîchie, rôle changé), la poussée suivante emporte le geste. */
    if (syncMark.estHorsPortee(table)) return false;
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
            `[mnd-sync] ${table} : écrasement de masse BLOQUÉ (${upserts.length} lignes), le serveur porte ${inconnues.length} ligne(s) que ce poste n'a jamais vues. Rien n'a été écrit ; on se réaligne sur le serveur.`,
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
      /* AVANT l'envoi : l'écho peut revenir pendant que la requête vole. */
      noteLesPoussees(upserts as { id: string; data: T }[]);
      const { error } = await sb.from(table).upsert(upserts);
      /* Refus de droit : on cesse d'insister, mais on ne prétend PAS avoir
         écrit (voir plus haut) — le repère doit rester en arrière. */
      if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(table); return false; }
      if (error) { ok = false; refus ??= error.message; console.warn(`[mnd-sync] ${table} upsert:`, error.message); }
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
      /* UNE SEULE LIGNE N'EST JAMAIS UN VIDAGE — 22 août 2026.
         « À chaque fois que je retire une enveloppe, elle revient. »

         Ce garde-fou existe contre un cache périmé qui effacerait une table
         entière. Mais avec `>= prev.size`, il frappait aussi le cas le plus
         banal qui soit : retirer LA dernière ligne. Une table à une enveloppe,
         une caisse, une catégorie, un persona devenait inexpugnable — la
         suppression était bloquée, le poste se réalignait sur le serveur, et
         la ligne réapparaissait sans un mot d'explication.

         Un clic sur « Supprimer » n'est pas un accident de synchronisation. Le
         seuil part donc de DEUX : au-delà, le doute reste entier ; à un, le
         geste est délibéré, et son coût — une ligne — est sans commune mesure
         avec celui de ne plus jamais pouvoir supprimer. */
      const videTout = prev.size > 1 && deletes.length >= prev.size;
      const enMasse = deletes.length >= 10 && deletes.length * 4 >= prev.size;
      /* LE JOURNAL DES MOUVEMENTS SE REMBOBINE PAR RÉFÉRENCE : annuler une
         fabrication à douze ingrédients ou la suppression d'une facture retire
         d'un bloc une grappe de lignes — un geste LÉGITIME qui, dans un journal
         encore jeune, ressemble au seuil de masse. Pour cette table, seul
         « vider tout » reste interdit : le rembobinage laisse toujours le
         journal debout. */
      const journalRembobinable = table === 'stock_mouvements';
      /* Le laissez-passer (consommé en tête de poussée) lève « vider tout »
         et « en masse » — jamais la protection des tables structurelles. */
      const massive = structurelle || ((videTout || (enMasse && !journalRembobinable)) && !purgeVoulue);
      if (massive) {
        const motif = structurelle
          ? 'table structurelle, une suppression ne peut venir que du SQL'
          : videTout
            ? 'ce diff VIDERAIT la table'
            : 'état local suspect';
        console.warn(`[mnd-sync] ${table} : suppression BLOQUÉE (${deletes.length}/${prev.size} lignes), ${motif}. Rien n'a été effacé du serveur.`);
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
        if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(table); return false; }
        if (error) { ok = false; refus ??= error.message; console.warn(`[mnd-sync] ${table} delete:`, error.message); }
      }
    }
    /* ── LE JOURNAL DES GESTES — 21 août 2026 ─────────────────────
       LA GREFFE UNIQUE. Toute écriture de toute collection passe ici : c'est
       le seul endroit où l'on sait, sans qu'aucun écran ait à le déclarer, ce
       qui vient d'être POSÉ (absent d'avant), MODIFIÉ (présent des deux
       côtés) ou EFFACÉ. Instrumenter les vingt-huit écrans aurait laissé des
       trous, et un journal troué ment plus qu'il n'informe.

       TROIS PRÉCAUTIONS, dans cet ordre d'importance :
       ① elle ne s'exécute qu'après une écriture RÉUSSIE — les chemins bloqués
         par les garde-fous sont sortis plus haut, rien n'y est journalisé ;
       ② elle n'attend rien (`void`) et avale ses propres erreurs : une trace
         manquée ne doit jamais faire échouer la vente qu'elle observe ;
       ③ elle ne connaît QUE les tables de la carte — la mécanique interne
         (files d'attente, sessions, échos) ne dit rien de personne.

       Les échos du serveur n'y passent pas : ils avancent `lastPushed` sans
       créer de diff, donc `upserts` et `deletes` sont vides pour eux. */
    if (ok && tableSuivie(table)) {
      try {
        const qui = identiteCourante();
        const carte = CARTE_DES_TABLES[table];
        const instant = new Date().toISOString();
        const gestes: Geste[] = [];
        const ligne = (
          verbe: GesteVerbe, id: string, data: Record<string, unknown>, champs?: ChampChange[],
        ) => gestes.push({
          id: `g-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          branchId: (data.branchId as string) ?? undefined,
          quand: instant,
          parMail: qui.mail,
          /* Le nom est FIGÉ ici : un compte renommé demain ne réécrit pas un
             geste d'hier. Même règle que la provenance des dépenses. */
          parNom: qui.nom,
          porte: qui.porte,
          verbe,
          table,
          ecran: carte.ecran,
          pieceId: id,
          piece: carte.nomme(data),
          ...(champs && champs.length ? { champs } : {}),
        });

        for (const u of upserts) {
          const avantJson = prev.get(u.id);
          const apres = u.data as unknown as Record<string, unknown>;
          if (avantJson === undefined) { ligne('pose', u.id, apres); continue; }
          const avant = JSON.parse(avantJson) as Record<string, unknown>;
          ligne('modifie', u.id, apres, champsChanges(avant, apres));
        }
        for (const id of deletes) {
          const avantJson = prev.get(id);
          if (!avantJson) continue;
          ligne('efface', id, JSON.parse(avantJson) as Record<string, unknown>);
        }
        void inscrisLesGestes(gestes);
      } catch {
        /* Silence volontaire — voir ② ci-dessus. */
      }
    }

    if (ok) syncMark.ok(table); else syncMark.fail(table, refus);
    return ok;
  };

  /* La poussée locale, coalescée — un seul chemin, que l'écriture vienne d'un
     écran ou du rejeu de la fenêtre froide. */
  const planifiePoussee = (): void => {
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
  };

  /* LA PREMIÈRE LECTURE NE REMPLACE PLUS — ELLE REJOUE. Le serveur fait foi
     sur tout ce que ce poste n'a pas touché dans cette session ; les gestes
     posés pendant la fenêtre froide (une vente, un rembobinage) se
     réappliquent par-dessus, puis repartent par la poussée normale.
     `lastPushed` reste l'état SERVEUR : c'est le diff qui porte les gestes. */
  const premiereLecture = (serverItems: T[]): void => {
    const aRejouer = froidModifies.size > 0 || froidSupprimes.size > 0;
    let items = serverItems;
    if (aRejouer) {
      const parId = new Map<string, T>(serverItems.map((it) => [it.id, it]));
      for (const id of froidSupprimes) parId.delete(id);
      for (const [id, j] of froidModifies) parId.set(id, JSON.parse(j) as T);
      items = [...parId.values()];
    }
    applyingRemote = true;
    store.set(items);
    applyingRemote = false;
    lastPushed = snapshot(serverItems);
    lu = true;
    froidModifies.clear();
    froidSupprimes.clear();
    marqueTableResolue(table);
    if (aRejouer) planifiePoussee();
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
    /* ON ATTEND LA SESSION, ON N'ABANDONNE PLUS — 21 août 2026, le MacBook de
       la Maison. Cette ligne rendait `return` quand la session n'était pas
       encore restaurée, et s'en remettait entièrement à deux secours : un
       événement d'authentification, ou un retour de focus.

       Les deux peuvent manquer. L'événement `INITIAL_SESSION` est émis UNE
       fois, très tôt : si le magasin s'abonne après lui, il ne le verra
       jamais. Et le focus ne revient que si l'on quitte la fenêtre pour y
       revenir — ce qu'on ne fait pas quand on ouvre Le Trône et qu'on regarde
       l'écran. Sur un poste où la restauration du jeton est un peu plus lente
       (Safari, démarrage à froid), la table restait donc VIDE indéfiniment,
       et rien à l'écran ne disait pourquoi : trois comptes souverains
       différents, zéro cliente, à chaque redémarrage.

       On attend désormais la session, jusqu'à vingt secondes. Passé ce délai,
       le poste est réellement déconnecté et les secours reprennent la main. */
    let session = (await sb.auth.getSession()).data.session;
    for (let essai = 0; essai < 50 && !session; essai += 1) {
      await new Promise((r) => setTimeout(r, 400));
      session = (await sb.auth.getSession()).data.session;
    }
    if (!session) return;
    const { data, error } = await sb.from(table).select('id,data');
    if (error) {
      /* Une LECTURE ratee doit se voir elle aussi. La pastille restait « Synchronise »
         sur un poste qui travaillait en realite sur son seul cache local — table
         absente, RLS, reseau au demarrage. Dans les deux cas la table est
         RÉSOLUE : ce poste n'attendra pas mieux, les gestes différés partent
         sur ce qu'il a. */
      if (estRefusDeDroit(error.message)) { syncMark.horsPortee(table); marqueTableResolue(table); return; }
      console.warn(`[mnd-sync] ${table} hydrate:`, error.message);
      syncMark.fail(table, error.message);
      marqueTableResolue(table);
      return;
    }
    if (data && data.length) {
      premiereLecture(data.map((r) => (r as { data: T }).data));
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
         de l'usage »). Et si un poste avait des lignes d'HIER que le serveur
         n'a jamais reçues, elles cèdent devant lui. C'est le sens de « le
         serveur fait foi » : une seule vérité, la même pour tous les
         appareils, qu'on peut effacer pour de bon. Seuls les gestes de CETTE
         session — la fenêtre froide — se rejouent par-dessus : posés il y a
         quelques secondes, ils ne peuvent pas être périmés. */
      premiereLecture([]);
    }
  })();

  /* Filet de fraîcheur : au retour de focus, on re-tire l'état distant
     (throttlé, et jamais pendant qu'une poussée locale est en attente)
     — couvre un éventuel événement Realtime manqué en arrière-plan.
     `force` ignore le throttle : utilisé au changement de session (login/logout),
     car sous RLS les données visibles dépendent de l'utilisateur connecté. */
  let lastRefetch = 0;
  const refetch = async (force = false) => {
    if (timer) {
      /* Une écriture locale part bientôt : relire maintenant l'écraserait.
         Mais un refetch FORCÉ vient d'un changement de session (connexion,
         déconnexion, jeton rafraîchi) — sous RLS, ce que le poste a le droit
         de voir vient de changer. Le perdre laissait l'écran sur les données
         de l'utilisateur précédent, ou sur rien du tout. On le repose juste
         après la poussée au lieu de le jeter. */
      if (force) setTimeout(() => void refetch(true), PUSH_DEBOUNCE_MS + 300);
      return;
    }
    if (!force && Date.now() - lastRefetch < 15000) return;
    lastRefetch = Date.now();
    const { data, error } = await sb.from(table).select('id,data');
    if (error || !data) return;
    const items = data.map((r) => (r as { data: T }).data);
    /* Le refetch vaut lecture : c'est souvent LUI qui hydrate pour de bon,
       quand la session arrive apres le chargement du module — et il rejoue
       alors les gestes de la fenêtre froide comme l'hydratation. */
    if (!lu) { premiereLecture(items); return; }
    const next = snapshot(items);
    const cur = snapshot(store.get());
    const same = next.size === cur.size && [...next].every(([k, v]) => cur.get(k) === v);
    if (same) return;
    applyingRemote = true;
    store.set(items);
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
  /* LE CANAL SE REJOINT AVEC LA NOUVELLE IDENTITÉ — 17 août 2026.

     Ce bloc ne re-tirait que les DONNÉES. Or le canal temps réel, lui, se
     joignait au CHARGEMENT DU MODULE — donc en anonyme, la session arrivant
     toujours après (`getSession` est asynchrone). Et Postgres Changes évalue la
     RLS avec l'identité du moment où l'on REJOINT : pour un anonyme,
     `appointments`, `invoices` et `clients` ne contiennent aucune ligne
     (vérifié : 200, zéro ligne). Aucun événement n'était donc jamais livré, et
     la Maison ne voyait le travail de l'autre poste qu'en rafraîchissant.

     Seul `catalog_services`, lisible par un anonyme, arrivait en direct — ce
     qui rendait la panne invisible au diagnostic : « le temps réel marche ».
     Il marchait, sur la seule table qui n'en avait pas besoin.

     On rejoint donc à chaque changement d'IDENTITÉ. Pas au renouvellement de
     jeton : il tombe toutes les heures et ne change pas ce que la RLS accorde,
     tandis que chaque rejointure ouvre une brèche de quelques instants. */
  let rejoindreLeCanal: () => void = () => {};
  sb.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') rejoindreLeCanal();
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') void refetch(true);
  });

  // 2. Poussée des changements locaux (coalescée).
  store.subscribe(() => {
    if (applyingRemote) {
      /* Écriture DISTANTE (Realtime) pendant la fenêtre froide : le repère
         suit, pour ne pas prendre ces lignes pour des gestes locaux. */
      if (!lu) vuFroid = snapshot(store.get());
      return;
    }
    if (!lu) {
      /* LA FENÊTRE D'AVANT-HYDRATATION : l'écriture ne s'abandonne plus — elle
         s'enregistre, id par id, pour être rejouée sur l'état du serveur à la
         première lecture (voir `premiereLecture`). */
      const cur = snapshot(store.get());
      for (const [id, j] of cur) {
        if (vuFroid.get(id) !== j) { froidModifies.set(id, j); froidSupprimes.delete(id); }
      }
      for (const id of vuFroid.keys()) {
        if (!cur.has(id)) { froidSupprimes.add(id); froidModifies.delete(id); }
      }
      vuFroid = cur;
      return;
    }
    planifiePoussee();
  });

  // 3. Application des changements distants (Realtime).
  const surChangement =
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
          const j = JSON.stringify(row.data);
          /* NOTRE PROPRE ÉCHO, RECONNU AU REGISTRE — 18 août 2026. L'ancien
             garde (« identique au local ? ») laissait passer l'écho d'une
             poussée VIEILLE D'UNE FRAPPE : le local avait avancé, l'écho ne
             lui était plus identique, et il rembobinait la phrase en cours —
             « la case ne permet pas d'écrire jusqu'au bout » (Yéman, le champ
             d'observation de la fiche cliente). Ce qu'on a poussé soi-même ne
             revient jamais s'appliquer ; le changement d'un AUTRE poste ne
             figure pas au registre et passe toujours. */
          if (estNotreEcho(row.id, j)) return;
          if (i >= 0 && JSON.stringify(items[i]) === j) return;
          if (i >= 0) items[i] = row.data;
          else items.push(row.data);
        }
        applyingRemote = true;
        store.set(items);
        applyingRemote = false;
        lastPushed = snapshot(items);
      };

  let canal: ReturnType<typeof sb.channel> | null = null;
  rejoindreLeCanal = () => {
    /* On retire l'ancien AVANT d'en ouvrir un neuf. Un doublon transitoire ne
       ferait pas de mal — le gestionnaire est idempotent, il compare avant
       d'appliquer — mais un canal anonyme laissé ouvert écoute pour rien. */
    if (canal) void sb.removeChannel(canal);
    canal = sb.channel(`mnd:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, surChangement)
      .subscribe();
  };
  rejoindreLeCanal();
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
  /* Même faille qu'en collection : le canal se joignait en anonyme au
     chargement du module et n'était jamais rejoint. Il se rejoint désormais
     avec l'identité — voir le commentaire long dans `bindCollection`. */
  let rejoindreLeCanal: () => void = () => {};
  sb.auth.onAuthStateChange((event) => {
    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'TOKEN_REFRESHED') return;
    if (event !== 'TOKEN_REFRESHED') rejoindreLeCanal();
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
      if (error) { syncMark.fail(`doc:${key}`, error.message); console.warn(`[mnd-sync] doc ${key} upsert:`, error.message); }
      else syncMark.ok(`doc:${key}`);
    }, PUSH_DEBOUNCE_MS);
  });

  // 3. Application distante (Realtime).
  const surChangement =
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
      };

  let canal: ReturnType<typeof sb.channel> | null = null;
  rejoindreLeCanal = () => {
    if (canal) void sb.removeChannel(canal);
    canal = sb.channel(`mnd:doc:${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `key=eq.${key}` },
        surChangement,
      )
      .subscribe();
  };
  rejoindreLeCanal();
}
