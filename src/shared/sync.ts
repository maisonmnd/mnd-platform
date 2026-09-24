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
  /** LES TABLES QUI VONT RÉESSAYER D'ELLES-MÊMES — une panne passagère, pas
      un refus. La pastille le dit, pour qu'on n'aille pas « refaire une
      modification » à la main. */
  reprises: string[];
  /** LES TABLES DONT LE DIRECT EST TOMBÉ — 14 septembre 2026. L'écriture
      passe toujours ; c'est l'ANNONCE qui manque, et l'écran ne se met à jour
      qu'au filet d'une minute. « Les messages arrivent avec du retard » vient
      de là, et personne ne pouvait le voir. */
  directEnPanne: string[];
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
export function raisonLisible(msg: string | undefined): string {
  const m = (msg ?? '').toLowerCase();
  /* PGRST204 PASSE EN PREMIER, et c'est une faute réparée le 24 septembre
     2026 : son message est « Could not find the 'x' column of 'y' in the
     SCHEMA CACHE », donc la règle de la table absente, juste en dessous, le
     prenait le premier. Une colonne manquante s'annonçait ainsi comme une
     table manquante, et envoyait chercher une migration qui n'aurait rien
     réparé. Le harnais l'a trouvée en éprouvant le vrai message. */
  if (m.includes('pgrst204')) {
    return 'colonne manquante, le schéma de la table ne correspond pas';
  }
  /* PostgREST ne trouve pas la table : la migration n'a pas été collée. */
  if (m.includes('pgrst205') || m.includes('does not exist') || m.includes('schema cache')) {
    return 'table absente en base, une migration n’a pas été collée';
  }
  /* UNE VALEUR ABSENTE N'EST PAS UNE COLONNE ABSENTE — 24 septembre 2026.
     Le mot « column » apparaît dans les deux messages de Postgres, et les
     deux gestes sont OPPOSÉS : l'un se répare en collant une migration,
     l'autre en corrigeant ce que l'application écrit. La phrase d'avant
     disait « colonne manquante » pour les deux, et a envoyé chercher une
     migration qui avait bien été collée (la table `demandes`, dont le
     `genre` n'était jamais fourni). On tranche donc AVANT le cas général,
     sur les mots propres à chacun. */
  if (m.includes('null value in column') || m.includes('not-null constraint')) {
    return 'valeur obligatoire absente, l’application n’écrit pas cette colonne';
  }
  if (m.includes('pgrst204') || m.includes('column')) {
    return 'colonne manquante, le schéma de la table ne correspond pas';
  }
  if (m.includes('violates foreign key') || m.includes('violates check') || m.includes('duplicate key')) {
    return 'écriture refusée par une contrainte de la base';
  }
  /* TOUS LES VISAGES D'UN RÉSEAU QUI MANQUE. Chrome dit « Failed to fetch »,
     Safari dit « Load failed », Node dit « fetch failed », et une passerelle
     qui tombe répond 502, 503 ou 504. Ne reconnaître que le premier envoyait
     les autres dans « refus du serveur, sans message » — une panne passagère
     lue comme un refus, donc jamais retentée. */
  if (m.includes('failed to fetch') || m.includes('load failed') || m.includes('fetch failed')
    || m.includes('networkerror') || m.includes('network request failed') || m.includes('timeout') || m.includes('timed out')
    || m.includes('econnreset') || m.includes('gateway') || /\b50[234]\b/.test(m)) {
    return 'serveur injoignable';
  }
  if (m.includes('jwt') || m.includes('expired')) {
    return 'session expirée, reconnectez-vous';
  }
  return msg?.trim() || 'refus du serveur, sans message';
}
/** ══ CE QUI SE RETENTE TOUT SEUL — 7 septembre 2026 ═══════════════
    « Synchro en échec · appointments, serveur injoignable » (Yéman), alors que
    le serveur répondait en 0,6 s au moment où il le lisait.

    UN RATÉ RÉSEAU N'AVAIT AUCUNE REPRISE. Après un « Failed to fetch », la
    table restait rouge et son écriture au sol jusqu'à ce que quelqu'un
    modifie autre chose ou que le navigateur repasse « en ligne » — la
    pastille disait même « refaites une modification pour relancer ». Une
    coupure de trois secondes devenait une panne jusqu'au prochain geste.

    SEUL CE QUI EST PASSAGER SE RETENTE. Une table absente, une colonne qui
    manque, une contrainte violée ne guériront pas en attendant : les retenter
    ferait clignoter la pastille pour rien et cacherait qu'un humain doit
    agir. Le juge est le même que celui de la phrase lue au comptoir. */
export const estPassager = (msg: string | undefined): boolean =>
  raisonLisible(msg) === 'serveur injoignable';

/** LES DÉLAIS, DU PLUS COURT AU PLAFOND. Trois secondes de coupure se
    rattrapent au premier essai ; une panne d'une heure ne mérite pas d'être
    martelée : on espace, et l'on ne dépasse pas deux minutes, parce qu'une
    écriture qui attend plus longtemps mérite qu'on la voie attendre. */
export const DELAIS_DE_REPRISE_MS = [5_000, 15_000, 45_000, 120_000] as const;

export const delaiDeReprise = (essai: number): number =>
  DELAIS_DE_REPRISE_MS[Math.min(Math.max(0, essai), DELAIS_DE_REPRISE_MS.length - 1)];

/* Comment repousser chaque table, et les reprises programmées. */
const relances = new Map<string, () => void>();
const reprises = new Map<string, ReturnType<typeof setTimeout>>();
const essaisDeReprise = new Map<string, number>();

const annuleLaReprise = (t: string): void => {
  const r = reprises.get(t);
  if (r) { clearTimeout(r); reprises.delete(t); }
};
const programmeUneReprise = (t: string): void => {
  if (reprises.has(t) || !relances.has(t)) return;
  const essai = essaisDeReprise.get(t) ?? 0;
  essaisDeReprise.set(t, essai + 1);
  const delai = delaiDeReprise(essai);
  console.info(`[mnd-sync] ${t} : serveur injoignable, nouvel essai dans ${Math.round(delai / 1000)} s.`);
  reprises.set(t, setTimeout(() => {
    reprises.delete(t);
    bumpSync();
    relances.get(t)?.();
  }, delai));
};

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
/** Les canaux temps réel à terre — voir `SyncState.directEnPanne`. */
const canauxMorts = new Set<string>();

/* ══ UNE PASTILLE QUI BAT N'EST PAS UNE PASTILLE — 14 septembre 2026 ═══

   « Le bouton vert et le bouton rouge se suivent chaque seconde. Ils
   n'arrêtent pas » (Yéman).

   UN CANAL QUI SE REJOINT PUIS RETOMBE faisait basculer la pastille à chaque
   aller-retour. Le comptoir voyait un clignotant, et un clignotant permanent
   n'apprend rien : on cesse de le regarder, et le jour où il dit vrai
   personne ne le voit. Le pire état d'un indicateur n'est pas d'être faux,
   c'est d'être ignoré.

   ON LAISSE DONC AU CANAL LE TEMPS DE SE RELEVER. Une chute de moins de
   quinze secondes ne se dit pas : elle se répare avant qu'on ait fini de lire
   le mot. Ce qui se dit, c'est une panne qui DURE.

   MAIS UN BATTEMENT N'EST PAS UNE SANTÉ. Un canal qui tombe trois fois de
   suite ne va pas bien, même s'il se relève chaque fois avant le délai : on
   le nomme alors sans plus attendre. Sinon l'hystérésis deviendrait un
   silence, et l'on aurait remplacé un clignotant par un mensonge. */
const DELAI_AVANT_DE_DIRE_LA_PANNE_MS = 15_000;
const CHUTES_AVANT_DE_LE_DIRE = 3;

/* ══ ET ELLE NE REDIT « VERT » QU'APRÈS AVOIR TENU — 15 septembre 2026 ══

   « Le bouton synchronisé passe du rouge au vert » (Yéman), le lendemain.

   L'HYSTÉRÉSIS DU 14 NE JOUAIT QUE DANS UN SENS. Un canal déclaré à terre
   redevenait vert à la seconde où il disait « je suis là », retombait deux
   secondes plus tard, était redit à terre aussitôt (trois chutes, on le dit
   tout de suite), puis revenait… Le silence de quinze secondes existait pour
   annoncer la panne, pas pour annoncer la guérison, et un canal qui bat
   faisait battre la pastille exactement comme avant.

   LA GUÉRISON SE PROUVE COMME LA PANNE : quinze secondes de tenue avant de
   dire « vert ». Un canal qui retombe avant reste à terre, sans un mot de
   plus. */
const DELAI_AVANT_DE_DIRE_LA_GUERISON_MS = DELAI_AVANT_DE_DIRE_LA_PANNE_MS;

const deuilsEnAttente = new Map<string, ReturnType<typeof setTimeout>>();
const guerisonsEnAttente = new Map<string, ReturnType<typeof setTimeout>>();
const chutesDuCanal = new Map<string, number>();
/** Les écritures en sursis : refusées par un réseau qui coupe, retentées,
    et pas encore dites en rouge. Voir `syncMark.fail`. */
const sursisDEcriture = new Map<string, ReturnType<typeof setTimeout>>();
/* « HORS LIGNE » NE SE DIT PAS À LA PREMIÈRE SECONDE NON PLUS. Un réseau qui
   coupe et revient fait battre `navigator.onLine`, et « Hors ligne » en rouge
   suivait chaque battement. Cinq secondes de coupure avant de le dire ; le
   retour, lui, se dit tout de suite. */
const DELAI_AVANT_DE_DIRE_HORS_LIGNE_MS = 5_000;
let ditHorsLigne = typeof navigator !== 'undefined' && !navigator.onLine;
let horsLigneEnAttente: ReturnType<typeof setTimeout> | undefined;

let lastOkAt: number | null = null;
let syncSnapshot: SyncState = {
  enabled: !!supabase,
  online: !ditHorsLigne,
  failedNames: [],
  failedWhy: [],
  ecartees: [],
  reprises: [],
  directEnPanne: [],
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
    enabled: !!supabase, online: !ditHorsLigne,
    pending: dirtyTables.size, failed: failedTables.size,
    failedNames: noms,
    failedWhy: noms.map((t) => {
      const brut = failedTables.get(t) ?? '';
      return { table: t, raison: raisonLisible(brut), brut };
    }),
    ecartees: [...horsPortee].sort(),
    reprises: [...reprises.keys()].sort(),
    directEnPanne: [...canauxMorts].sort(),
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
  window.addEventListener('online', () => {
    if (horsLigneEnAttente) { clearTimeout(horsLigneEnAttente); horsLigneEnAttente = undefined; }
    ditHorsLigne = false;
    bumpSync();
  });
  window.addEventListener('offline', () => {
    if (horsLigneEnAttente) return;
    horsLigneEnAttente = setTimeout(() => {
      horsLigneEnAttente = undefined;
      if (navigator.onLine) return;
      ditHorsLigne = true;
      bumpSync();
    }, DELAI_AVANT_DE_DIRE_HORS_LIGNE_MS);
  });
}
const syncMark = {
  /* CHAQUE TABLE DIT COMMENT ON LA REPOUSSE, une fois, à son branchement.
     La reprise ne connaît ni les magasins ni les diffs : elle rappelle. */
  relance(t: string, fn: () => void) { relances.set(t, fn); },
  /* LE DIRECT SE DIT, LUI AUSSI — 14 septembre 2026. Un canal à terre ne
     perd aucune écriture, il retarde ce qu'on VOIT : la pastille le nomme
     plutôt que de laisser croire à un écran qui traîne. */
  directOk(t: string) {
    const attente = deuilsEnAttente.get(t);
    if (attente) { clearTimeout(attente); deuilsEnAttente.delete(t); }
    if (!canauxMorts.has(t)) {
      /* LE COMPTE DES CHUTES NE SE REMET À ZÉRO QU'ICI, et seulement si le
         canal tient vraiment : on l'efface au bout du délai qu'on lui
         laissait, pas à la seconde où il dit « je suis là ». */
      const t0 = setTimeout(() => { chutesDuCanal.delete(t); }, DELAI_AVANT_DE_DIRE_LA_PANNE_MS);
      if (typeof t0 === 'object' && 'unref' in t0) (t0 as { unref: () => void }).unref();
      return;
    }
    /* DÉCLARÉ À TERRE, IL DOIT TENIR AVANT D'ÊTRE DIT DEBOUT. Une guérison
       déjà en attente ne se redemande pas. */
    if (guerisonsEnAttente.has(t)) return;
    guerisonsEnAttente.set(t, setTimeout(() => {
      guerisonsEnAttente.delete(t);
      chutesDuCanal.delete(t);
      if (canauxMorts.delete(t)) bumpSync();
    }, DELAI_AVANT_DE_DIRE_LA_GUERISON_MS));
  },
  directPerdu(t: string) {
    /* RETOMBÉ AVANT D'AVOIR TENU : la guérison s'annule, la pastille n'a
       rien dit, et ne dit rien de plus. */
    const guerison = guerisonsEnAttente.get(t);
    if (guerison) { clearTimeout(guerison); guerisonsEnAttente.delete(t); }
    if (canauxMorts.has(t) || deuilsEnAttente.has(t)) return;
    const chutes = (chutesDuCanal.get(t) ?? 0) + 1;
    chutesDuCanal.set(t, chutes);
    /* TROIS CHUTES, ON LE DIT TOUT DE SUITE : ce canal-là ne se relève pas,
       il bat. */
    if (chutes >= CHUTES_AVANT_DE_LE_DIRE) { canauxMorts.add(t); bumpSync(); return; }
    deuilsEnAttente.set(t, setTimeout(() => {
      deuilsEnAttente.delete(t);
      canauxMorts.add(t);
      bumpSync();
    }, DELAI_AVANT_DE_DIRE_LA_PANNE_MS));
  },
  dirty(t: string) { dirtyTables.add(t); bumpSync(); },
  ok(t: string) {
    const sursis = sursisDEcriture.get(t);
    if (sursis) { clearTimeout(sursis); sursisDEcriture.delete(t); }
    dirtyTables.delete(t); failedTables.delete(t); lastOkAt = Date.now();
    essaisDeReprise.delete(t); annuleLaReprise(t);
    bumpSync();
  },
  /* Le message du serveur voyage avec l'échec : sans lui, la pastille nomme une
     table et laisse deviner la cause — ce qui envoie ouvrir la console. */
  fail(t: string, msg?: string) {
    if (!estPassager(msg)) {
      dirtyTables.delete(t); failedTables.set(t, msg ?? '');
      bumpSync();
      return;
    }
    /* ══ UNE COUPURE DE RÉSEAU NE ROUGIT PAS AVANT QUINZE SECONDES ══
       15 septembre 2026 : « le bouton synchronisé passe du rouge au vert »,
       un jour où le réseau du salon coupait et revenait (la publication
       elle-même a échoué sur « Connection was reset », puis passé). Chaque
       coupure rougissait la pastille, la reprise de cinq secondes la
       reverdissait, et le comptoir voyait un clignotant.

       CE QUI EST PASSAGER SE RETENTE EN SILENCE : l'écriture reste « en
       attente » (la pastille dit « Synchronisation… »), la reprise part, et
       le rouge n'arrive que si la panne DURE, quinze secondes, comme pour le
       direct. Une panne qui dure se dit alors avec sa raison et son prochain
       essai, comme avant. */
    programmeUneReprise(t);
    if (failedTables.has(t)) { failedTables.set(t, msg ?? ''); bumpSync(); return; }
    dirtyTables.add(t);
    if (!sursisDEcriture.has(t)) {
      sursisDEcriture.set(t, setTimeout(() => {
        sursisDEcriture.delete(t);
        if (!dirtyTables.has(t)) return;
        dirtyTables.delete(t);
        failedTables.set(t, msg ?? '');
        bumpSync();
      }, DELAI_AVANT_DE_DIRE_LA_PANNE_MS));
    }
    bumpSync();
  },
  /* La table sort du décompte ET des tentatives : une fois pour la session. */
  horsPortee(t: string) {
    dirtyTables.delete(t);
    failedTables.delete(t);
    annuleLaReprise(t);
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
/* ══ UN SEUL CANAL POUR TOUTE LA MAISON — 14 septembre 2026, au soir ═══

   « Direct en panne est toujours là. La page ne se stabilise pas. Elle
   retombe toujours » (Yéman) — après que les six tables muettes eurent été
   publiées, donc la publication n'était plus en cause.

   LA MÉCANIQUE SE MORDAIT LA QUEUE. Chaque magasin ouvrait SON canal, et
   chacun écoutait `onAuthStateChange` pour le rejoindre avec la bonne
   identité. Or `supabase-js` émet `SIGNED_IN` à chaque retour de focus sur
   l'onglet, pas seulement à la connexion : un simple aller-retour vers une
   autre fenêtre déclenchait SOIXANTE ET UNE rejointures simultanées.

   ET UNE REJOINTURE N'EST PAS INSTANTANÉE. `removeChannel` est asynchrone ;
   le canal neuf naît avant que l'ancien soit parti, et deux canaux portent
   alors le MÊME nom. Le serveur en ferme un — et cette fermeture est lue
   comme une panne, qui déclenche une reprise, qui rouvre un doublon. La
   pastille battait parce que le Trône se battait contre lui-même.

   ON N'EN OUVRE PLUS QU'UN. Il écoute le schéma `public` en entier et
   distribue par le NOM DE LA TABLE. Soixante-deux canaux deviennent un :
   plus de doublons possibles, une seule rejointure à coordonner, une seule
   reprise. C'est le remède ② noté le matin même, que l'on ne pouvait écrire
   qu'en sachant ce que la base publie — on le sait depuis 0095 et 0096.

   CE QUE CELA CHANGE POUR LE SERVEUR : une seule règle de sécurité à évaluer
   par changement, au lieu de soixante-deux. C'est moins cher, pas plus.

   CE QUE CELA CHANGE POUR LE POSTE : il reçoit les changements des tables
   qu'il n'écoute pas. La RLS décide toujours de ce qu'il a le droit de voir
   — aucune porte ne s'ouvre — et une table sans écoute est ignorée en une
   comparaison. La Maison écrit quelques dizaines de lignes par heure : le
   surcoût est nul, et l'on cesse de payer soixante et un canaux pour le
   rendre. */
type EcouteDeTable = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => void;

const ecoutesParTable = new Map<string, EcouteDeTable>();

/** LE NOM SOUS LEQUEL LE DIRECT SE DIT. Un seul canal : quand il tombe, tout
    tombe ensemble, et nommer les soixante-trois tables ne dirait rien de plus
    qu'un mot. La pastille reste lisible. */
const LE_DIRECT = 'le direct de la Maison';

let canalDeLaMaison: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
/* ══ CHAQUE CANAL PORTE SON PROPRE NOM — 16 septembre 2026 ═══════════════

   La console de Yéman, filtrée sur `mnd-sync` : « le direct de la Maison :
   CLOSED (essai 1) … (essai 5) », puis « essai 1 » de nouveau, sans fin, sans
   aucune erreur du serveur. Le direct battait depuis le 14 septembre, et la
   pastille ne faisait que le montrer.

   LE TRÔNE SE FERMAIT LUI-MÊME. `sb.channel('mnd:maison')` RÉUTILISE l'objet
   déjà inscrit sous ce nom, et `removeChannel` est asynchrone : au moment
   de rejoindre, l'ancien canal était encore inscrit, `channel()` rendait
   DONC L'ANCIEN, en train de partir, `subscribe()` n'y faisait rien, et la
   fermeture de ce départ arrivait sur ce qui était devenu « le canal
   courant » : CLOSED, panne, reprise… qui recommençait exactement pareil.
   Pire : `removeChannel` d'un canal déjà fermé déclenche sa fermeture
   IMMÉDIATEMENT, en synchrone, avant même que le neuf existe, et cette
   fermeture-là aussi passait pour la sienne.

   DEUX GARDES. Chaque canal porte un numéro de génération dans son nom :
   `channel()` ne peut plus rendre l'ancien. Et l'ancien est décroché
   (`canalDeLaMaison = null`) AVANT qu'on lui demande de partir : ce qu'il dit
   en partant ne concerne plus personne. Le nom du canal n'a aucune
   importance pour le serveur : `postgres_changes` n'écoute que le schéma. */
let generationDuCanal = 0;
let essaisDeLaMaison = 0;
let repriseDeLaMaison: ReturnType<typeof setTimeout> | undefined;
let filetDeLaMaison: ReturnType<typeof setInterval> | undefined;
/** LES ESSAIS NE RETOMBENT À ZÉRO QU'APRÈS UNE TENUE (15 septembre 2026).
    Ils retombaient à chaque « SUBSCRIBED » : un canal qui mourait deux
    secondes après s'être joint repartait à deux secondes d'attente, pour
    toujours. La reprise doit s'espacer tant que le canal ne tient pas. */
let tenueDeLaMaison: ReturnType<typeof setTimeout> | undefined;
/** Ce qu'il faut relire quand le canal revient, ou pendant qu'il est à terre :
    un canal ne rejoue JAMAIS ce qui s'est dit pendant son absence. */
const relecturesDuDirect = new Map<string, () => void>();

/* ON NE RELIT PAS SOIXANTE-SEPT TABLES TOUTES LES DEUX SECONDES. Un canal qui
   bat rejoignait, relisait tout, retombait, rejoignait… et la Maison tirait
   ses soixante-sept tables à chaque tour. La relecture se coalesce : tout de
   suite si la dernière date de plus de vingt secondes, sinon une seule, à
   l'échéance, pour tous les retours entre-temps. Rien n'est perdu : ce qui
   s'est dit pendant l'absence se relit à cette échéance. */
const ECART_MIN_ENTRE_RELECTURES_MS = 20_000;
let derniereRelectureDuDirect = 0;
let relectureDuDirectPlanifiee: ReturnType<typeof setTimeout> | undefined;

const relitToutLeDirect = () => {
  derniereRelectureDuDirect = Date.now();
  for (const relit of relecturesDuDirect.values()) relit();
};

const relitLeDirectSansSEssouffler = () => {
  const depuis = Date.now() - derniereRelectureDuDirect;
  if (depuis >= ECART_MIN_ENTRE_RELECTURES_MS) { relitToutLeDirect(); return; }
  if (relectureDuDirectPlanifiee) return;
  relectureDuDirectPlanifiee = setTimeout(() => {
    relectureDuDirectPlanifiee = undefined;
    relitToutLeDirect();
  }, ECART_MIN_ENTRE_RELECTURES_MS - depuis);
};

/** REJOINDRE, MAIS UNE SEULE FOIS.

    `bindCollection` et `bindDocument` s'exécutent 118 fois au chargement du
    module. Sans cette garde, chaque appel détruirait le canal du précédent
    pour en ouvrir un neuf : exactement la tempête qu'on éteint.

    `force` n'est vrai que lorsqu'il FAUT repartir — changement de session (le
    canal doit porter la nouvelle identité) ou reprise après panne. */
const rejointLeCanalDeLaMaison = (force = false) => {
  const sb = supabase;
  if (!sb) return;
  if (canalDeLaMaison && !force) return;
  if (repriseDeLaMaison) { clearTimeout(repriseDeLaMaison); repriseDeLaMaison = undefined; }
  /* L'ANCIEN EST DÉCROCHÉ AVANT DE PARTIR : sa fermeture, même déclenchée en
     synchrone, trouve `canalDeLaMaison` vide et se tait. */
  const ancien = canalDeLaMaison;
  canalDeLaMaison = null;
  if (ancien) void sb.removeChannel(ancien);
  generationDuCanal += 1;
  const neuf = sb.channel(`mnd:maison:${generationDuCanal}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      (payload: { table?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
        const t = payload.table ? String(payload.table) : '';
        if (!t) return;
        ecoutesParTable.get(t)?.(payload);
      },
    );
  canalDeLaMaison = neuf;
  neuf.subscribe((statut, erreur) => {
    /* UN VERDICT DE CANAL REMPLACÉ NE NOUS CONCERNE PLUS : `removeChannel`
       fait dire « CLOSED » à l'ancien, et le prendre pour une panne
       relancerait une rejointure à chaque changement de session. */
    if (canalDeLaMaison !== neuf) return;
    if (statut === 'SUBSCRIBED') {
      /* UN CANAL DEBOUT N'A PAS BESOIN D'UNE REPRISE : une reprise programmée
         par une fausse chute le refermerait pour rien. */
      if (repriseDeLaMaison) { clearTimeout(repriseDeLaMaison); repriseDeLaMaison = undefined; }
      if (tenueDeLaMaison) clearTimeout(tenueDeLaMaison);
      tenueDeLaMaison = setTimeout(() => { tenueDeLaMaison = undefined; essaisDeLaMaison = 0; }, DELAI_AVANT_DE_DIRE_LA_GUERISON_MS);
      if (filetDeLaMaison) { clearInterval(filetDeLaMaison); filetDeLaMaison = undefined; }
      syncMark.directOk(LE_DIRECT);
      relitLeDirectSansSEssouffler();
      return;
    }
    if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT' || statut === 'CLOSED') {
      if (tenueDeLaMaison) { clearTimeout(tenueDeLaMaison); tenueDeLaMaison = undefined; }
      /* LA RAISON S'ÉCRIT, sinon la panne se cherche pendant des jours : le
         serveur la donne avec le verdict, et personne ne la lisait. */
      console.warn(`[mnd-sync] ${LE_DIRECT} : ${statut}${erreur ? ` · ${erreur.message}` : ''} (canal ${generationDuCanal}, essai ${essaisDeLaMaison + 1}, prise ${sb.realtime.connectionState()})`);
      syncMark.directPerdu(LE_DIRECT);
      /* TANT QUE LE DIRECT EST À TERRE, on relit chaque minute. Moins bien que
         le direct, infiniment mieux que rien. */
      if (!filetDeLaMaison) {
        filetDeLaMaison = setInterval(() => {
          if (typeof document === 'undefined' || !document.hidden) relitToutLeDirect();
        }, 60_000);
      }
      if (repriseDeLaMaison) return;
      const attente = Math.min(60_000, 2000 * 2 ** Math.min(essaisDeLaMaison, 5)) + Math.random() * 1000;
      essaisDeLaMaison += 1;
      repriseDeLaMaison = setTimeout(() => {
        repriseDeLaMaison = undefined;
        rejointLeCanalDeLaMaison(true);
      }, attente);
    }
  });
};

/** UN CHANGEMENT DE SESSION, UNE SEULE REJOINTURE.

    Les 118 magasins écoutent chacun `onAuthStateChange`, et `supabase-js`
    émet `SIGNED_IN` à chaque retour de focus : sans ce rassemblement, revenir
    sur l'onglet rejoindrait le canal 118 fois. La première demande arme le
    battement, les 117 suivantes ne font rien. */
let rejointDeLaMaisonPlanifie: ReturnType<typeof setTimeout> | undefined;

const redemandeLeCanalDeLaMaison = () => {
  if (rejointDeLaMaisonPlanifie) return;
  rejointDeLaMaisonPlanifie = setTimeout(() => {
    rejointDeLaMaisonPlanifie = undefined;
    rejointLeCanalDeLaMaison(true);
  }, 80);
};

/** S'INSCRIRE AU DIRECT DE LA MAISON. Un magasin dit quelle table il écoute,
    ce qu'il en fait, et comment se relire quand le canal revient. */
const ecouteLeDirect = (table: string, surChangement: EcouteDeTable, relit: () => void): void => {
  ecoutesParTable.set(table, surChangement);
  relecturesDuDirect.set(table, relit);
  rejointLeCanalDeLaMaison();
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

export function bindCollection<T extends WithId>(
  store: Store<T[]>,
  table: string,
  /* DES COLONNES EN PLUS DE `data` — 24 septembre 2026. Presque toutes les
     tables de la Maison rangent tout dans `data jsonb` et n'ont, à côté, que
     des colonnes fournies (`id`, `branch_id`) ou pourvues d'un défaut
     (`updated_at`). UNE seule fait exception : `demandes.genre` est `not
     null` sans défaut (migration 0108), et le Trône ne le fournissait
     jamais. Postgres forme le tuple, `genre` est NULL, et la contrainte
     saute AVANT la résolution du conflit : la table refusait donc TOUTE
     écriture du Trône, même sur une ligne existante. Marquer une demande
     « rappelée » ne se gardait pas.

     On ouvre une porte étroite plutôt que de généraliser : c'est le seul cas
     du dépôt, vérifié table par table. */
  options?: { colonnes?: (it: T) => Record<string, unknown> },
): void {
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

  const rowOf = (it: T) => ({ id: it.id, branch_id: it.branchId ?? null, data: it, ...(options?.colonnes?.(it) ?? {}) });

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
  /* LA REPRISE REPASSE PAR LE MÊME CHEMIN QU'UNE ÉCRITURE : le diff se
     recalcule depuis `lastPushed`, resté en arrière tant que rien n'est parti,
     et rien n'est envoyé deux fois. */
  syncMark.relance(table, planifiePoussee);

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

  /* ══ LE DIRECT SE SURVEILLE ET SE RELÈVE — 14 septembre 2026 ═════════
     « Les messages arrivent avec du retard » (Yéman), sur les Conversations.

     L'ABONNEMENT PARTAIT SANS JAMAIS LIRE SON VERDICT. `subscribe()` rend le
     statut à qui le demande ; personne ne le demandait. Un canal refusé
     (droits, quota) ou tombé (réseau, veille de l'appareil) restait mort
     jusqu'au prochain changement de session, et l'écran n'apprenait plus rien
     qu'au retour de focus, throttlé à quinze secondes. Rien n'était perdu :
     tout arrivait EN RETARD, ce qui est la panne la plus difficile à nommer.

     TROIS REMÈDES, dans cet ordre : on se rejoint tout seul, de plus en plus
     espacé ; tant que le canal est à terre, la table se relit chaque minute
     (moins bien que le direct, infiniment mieux que rien) ; et la pastille du
     comptoir le dit, parce qu'un écran qui traîne sans explication finit par
     passer pour un écran qui ment.

     ON RELIT EN SE REJOIGNANT : un canal ne rejoue jamais ce qui s'est dit
     pendant son absence.

     ── 14 septembre, au soir : UN SEUL CANAL POUR TOUTE LA MAISON ──
     Cette table n'ouvre plus le sien. Voir le commentaire long au-dessus de
     `tablePrete` : soixante et un canaux qui se rejoignaient ensemble à
     chaque retour de focus se faisaient fermer en doublon, et la pastille
     battait. La surveillance, la reprise et le filet d'une minute vivent
     désormais en un seul endroit ; ici on ne fait que dire ce qu'on écoute et
     comment se relire. */
  ecouteLeDirect(table, surChangement as EcouteDeTable, () => { void refetch(); });
  rejoindreLeCanal = redemandeLeCanalDeLaMaison;
}

/** Lie un magasin singleton (une valeur) à une ligne de `documents` (clé stable). */
/* ── SAVOIR QUAND UN DOCUMENT EST DESCENDU — 31 août 2026 ───────────
   « Je vois d'abord tout le montant des dépenses de la Maison pendant 3
   secondes, ensuite ça disparaît » (Yéman).

   Un magasin vide se lit exactement comme un magasin dont rien n'a encore été
   dit. La matrice des accès n'y échappait pas : `{}` en attendant le serveur,
   et `{}` veut dire « aucun refus posé », donc tout ouvert. L'écran s'ouvrait
   large, puis se refermait. Un écran fermé après coup n'a jamais été fermé.

   ON PROMET DONC LA DESCENTE, et le Trône attend cette promesse avant de se
   dessiner. Elle se tient DANS TOUS LES CAS, y compris ceux où rien ne
   descendra jamais : pas de serveur configuré, pas de session, lecture
   refusée par la RLS, panne de réseau. Une garde qui peut ne jamais rendre la
   main n'est pas une garde, c'est un écran figé. */
const descentes = new Map<string, { faite: boolean; promesse: Promise<void>; tenir: () => void }>();
const registre = (key: string) => {
  let d = descentes.get(key);
  if (!d) {
    let tenir: () => void = () => {};
    const promesse = new Promise<void>((res) => { tenir = () => { const e = descentes.get(key); if (e) e.faite = true; res(); }; });
    d = { faite: false, promesse, tenir };
    descentes.set(key, d);
  }
  return d;
};

/** Vrai si ce document est déjà descendu (ou si l'on sait qu'il ne descendra pas). */
export const documentDescendu = (key: string): boolean => registre(key).faite;

/** La promesse de sa descente. Elle se tient toujours, au pire au bout de 5 s. */
export const quandDocumentDescendu = (key: string): Promise<void> => {
  const d = registre(key);
  if (!d.faite) {
    /* LA CEINTURE DES 5 SECONDES : réseau lent, serveur muet, onglet réveillé
       d'une mise en veille. On rend la main, et les gardes reprennent leur
       défaut, qui est de fermer ce qui touche à l'argent. */
    setTimeout(d.tenir, 5000);
  }
  return d.promesse;
};

/* ══ LES DOCUMENTS PASSENT PAR LE CANAL DE LA MAISON ═════════════════

   Les 57 magasins de réglages vivent TOUS dans la table `documents`. Chacun
   ouvrait son canal avec un filtre sur sa clé : cinquante-sept canaux pour
   une table. Le matin du 14 septembre on les a réunis en un ; au soir, ce
   canal-là a rejoint celui de toute la Maison.

   IL RESTE UNE DISTRIBUTION À FAIRE ICI, et une seule : le canal rend une
   ligne de `documents`, il faut savoir à quel magasin elle appartient. C'est
   la CLÉ qui le dit. Une clé sans magasin est ignorée en une comparaison. */
const abonnesAuxDocuments = new Map<string, {
  surChangement: (row: Record<string, unknown>) => void;
  rehydrate: () => void;
}>();

/** LA DISTRIBUTION PAR CLÉ, posée une seule fois sur la table `documents`.
    La ligne neuve porte la clé ; l'ancienne la porte aussi quand on efface. */
const distribueLesDocuments: EcouteDeTable = (payload) => {
  const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
  const k = row?.key ? String(row.key) : '';
  if (!k) return;
  const abonne = abonnesAuxDocuments.get(k);
  if (abonne && payload.new) abonne.surChangement(payload.new);
};

const relitTousLesDocuments = () => {
  for (const a of abonnesAuxDocuments.values()) a.rehydrate();
};

export function bindDocument<T>(store: Store<T>, key: string): void {
  /* Sans Supabase, rien ne descendra jamais : on le dit tout de suite. */
  if (!supabase) { registre(key).tenir(); return; }
  const sb = supabase;

  let applyingRemote = false;
  let lastPushed: string | undefined;

  const upsert = (val: T) => sb.from('documents').upsert({ key, data: val });

  // 1. Hydratation (ou amorçage). `seed` n'est vrai qu'au premier appel :
  //    les ré-hydratations sur changement de session ne font que lire.
  const hydrate = async (seed: boolean) => {
    /* QUOI QU'IL ARRIVE CI-DESSOUS, la promesse est tenue en sortant : refus de
       droit, erreur réseau, document absent. Sinon un seul cas oublié figerait
       l'application sur son voile d'attente. */
    try {
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
    } finally { registre(key).tenir(); }
  };
  /* MÊME RÈGLE QU'AUX COLLECTIONS : sans session, une lecture vide ne prouve
     rien, et amorcer le serveur avec le cache local serait une faute. On
     n'amorce donc qu'une fois la session connue — et une seule fois. */
  let amorce = false;
  void (async () => {
    const { data: { session } } = await sb.auth.getSession();
    /* PAS DE SESSION, RIEN NE DESCENDRA : la porte de connexion n'a pas à
       attendre un document qu'elle ne lira jamais. */
    if (!session) { registre(key).tenir(); return; }
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
  const envoie = async () => {
    /* LE GARDE SE REARME. Sans cette remise a zero, `timer` reste verite a
       vie apres la premiere ecriture, et la garde de frappe ci-dessous ne
       laisserait plus JAMAIS passer une mise a jour distante. */
    timer = undefined;
    const val = store.get();
    const j = JSON.stringify(val);
    if (j === lastPushed) { syncMark.ok(`doc:${key}`); return; }
    const { error } = await upsert(val);
    if (error && estRefusDeDroit(error.message)) { syncMark.horsPortee(`doc:${key}`); return; }
    if (error) { syncMark.fail(`doc:${key}`, error.message); console.warn(`[mnd-sync] doc ${key} upsert:`, error.message); return; }
    /* LE REPÈRE N'AVANCE QU'APRÈS UN ENVOI RÉUSSI — 7 septembre 2026. Il
       avançait AVANT : après un raté, la reprise comparait le document au
       repère déjà égal, disait « rien à envoyer », et l'écriture ne partait
       jamais. La même leçon avait été apprise pour les collections. */
    lastPushed = j;
    syncMark.ok(`doc:${key}`);
  };
  const planifieLEnvoi = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void envoie(), PUSH_DEBOUNCE_MS);
  };
  syncMark.relance(`doc:${key}`, planifieLEnvoi);
  store.subscribe(() => {
    if (applyingRemote) return;
    syncMark.dirty(`doc:${key}`);
    planifieLEnvoi();
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

  /* ON S'INSCRIT AU CANAL COMMUN, on n'en ouvre plus un à soi. Voir le
     commentaire long au-dessus de `bindDocument` : cinquante-sept canaux pour
     une seule table, c'est ce qui faisait dépasser le plafond de cent. */
  abonnesAuxDocuments.set(key, {
    surChangement: surChangement as (row: Record<string, unknown>) => void,
    rehydrate: () => { void hydrate(false); },
  });
  rejoindreLeCanal = redemandeLeCanalDeLaMaison;
  /* ON S'INSCRIT À SA CLÉ, et la table `documents` n'est branchée qu'UNE fois
     au canal de la Maison — `ecouteLeDirect` remplace l'entrée, pas la
     cinquante-septième qui l'écrase inutilement. */
  ecouteLeDirect('documents', distribueLesDocuments, relitTousLesDocuments);
}
