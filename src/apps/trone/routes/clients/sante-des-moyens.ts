import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../../../../shared/supabase';
import { branchesStore, currentBranchStore } from '../../../../shared/branches';
import { finisLaPanne, inscrisLaPanne } from '../../../../shared/pannes-des-moyens';
import { panneDeLaDemande, pannesDeLaLecture, type CeQueLePosteVoit } from '../../../../shared/pannes-dites-pur';
import {
  RELECTURE_DE_LA_SANTE_MS, echecSuivant, etatDuPrestataire,
  type EchecDuPrestataire, type LectureDuPrestataire, type Prestataire, type SanteDesMoyens,
} from '../../../../shared/choix-du-moyen-pur';

/* ══ LA SANTÉ DES MOYENS · 12 novembre 2026 ═════════════════════════════
   Maquette « Le choix du moyen » : « le Trône relit chaque prestataire
   toutes les minutes pendant que la caisse est ouverte ». Deux sources :

   ① LA LECTURE : la fonction de chaque prestataire, interrogée sans argent
     (GET de `collecte-mtn` : clés posées, interrupteur ouvert ; GET de
     `mnd-pay` : clé FedaPay posée). Une fonction qui ne répond pas, c'est
     un prestataire qu'on ne propose pas.
   ② LA VRAIE DEMANDE : un serveur muet ou en erreur pendant un encaissement
     se retient dix minutes (`signaleUnePanne`) ; une demande qui passe
     l'efface (`signaleUneReussite`). Un refus de la cliente n'est pas une
     panne.

   La mémoire vit sur cet appareil (localStorage) : la fenêtre suivante sait
   déjà ce que la précédente a vu. Les règles sont dans
   `shared/choix-du-moyen-pur.ts`.

   LES PANNES DITES (12 novembre 2026, lot D) : ce que ce poste voit
   s'inscrit AUSSI en base, une ligne par épisode, pour tous les postes et
   pour la direction (`shared/pannes-des-moyens.ts`, 0204) : une lecture
   muette quand l'autre fonction a répondu, une vraie demande sans réponse ;
   jamais hors ligne, jamais un moyen fermé (`shared/pannes-dites-pur.ts`).
   Une demande qui passe finit l'épisode, quel que soit le poste qui l'a vu. */

type Memoire = {
  lectures: Partial<Record<Prestataire, LectureDuPrestataire>>;
  echecs: Partial<Record<Prestataire, EchecDuPrestataire>>;
  /** La dernière lecture de chaque prestataire qui a RÉPONDU : un moyen dit
      fermé le reste tant qu'il ne s'est pas relu ouvert (lot D). */
  reponses: Partial<Record<Prestataire, LectureDuPrestataire>>;
};
const CLE = 'mnd_sante_des_moyens';
const DELAI_DE_LECTURE_MS = 8000;

function lisLaMemoire(): Memoire {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Partial<Memoire> | null;
    if (v && typeof v === 'object') return { lectures: v.lectures ?? {}, echecs: v.echecs ?? {}, reponses: v.reponses ?? {} };
  } catch { /* sans mémoire */ }
  return { lectures: {}, echecs: {}, reponses: {} };
}
let memoire: Memoire = lisLaMemoire();
const ecouteurs = new Set<() => void>();
function ecris(m: Memoire): void {
  memoire = m;
  try { localStorage.setItem(CLE, JSON.stringify(m)); } catch { /* sans mémoire */ }
  ecouteurs.forEach((f) => f());
}
const abonne = (f: () => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };

/** FedaPay allumé dans Paramètres, tel que la fenêtre ouverte le dit. */
let fedapayAllumeVu = true;
const enLigneIci = (): boolean => !!supabase && (typeof navigator === 'undefined' || navigator.onLine !== false);
const ceQueLePosteVoit = (): CeQueLePosteVoit => ({ enLigne: enLigneIci(), fedapayAllume: fedapayAllumeVu, reponses: memoire.reponses });
/** La maison du poste, comme `useBranch` la lit (la première si la sienne n'existe plus). */
const brancheIci = (): string => {
  const id = currentBranchStore.get();
  const toutes = branchesStore.get();
  return (toutes.find((b) => b.id === id) ?? toutes[0])?.id ?? id;
};

/** Une vraie demande a échoué faute de réponse du prestataire. */
export function signaleUnePanne(p: Prestataire): void {
  ecris({ ...memoire, echecs: { ...memoire.echecs, [p]: echecSuivant(memoire.echecs[p], Date.now()) } });
  if (panneDeLaDemande(p, ceQueLePosteVoit())) void inscrisLaPanne(p, 'demande', brancheIci());
}
/** Une vraie demande est passée : la panne est finie. */
export function signaleUneReussite(p: Prestataire): void {
  if (enLigneIci()) void finisLaPanne(p, brancheIci());
  if (!memoire.echecs[p]) return;
  const echecs = { ...memoire.echecs };
  delete echecs[p];
  ecris({ ...memoire, echecs });
}
/** Le règlement par MTN s'est dit fermé pendant une demande : on n'attend pas la minute suivante. */
export function signaleMtnFerme(): void {
  const l = memoire.lectures.mtn;
  ecris({ ...memoire, lectures: { ...memoire.lectures, mtn: { pret: l?.pret ?? true, ouvert: false, le: Date.now() } } });
}

async function lisLaFonction(nom: 'collecte-mtn' | 'mnd-pay'): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  try {
    const lecture = supabase.functions.invoke(nom, { method: 'GET' }).then(({ data, error }) => (error ? null : (data as Record<string, unknown> | null)));
    const delai = new Promise<null>((ok) => { window.setTimeout(() => ok(null), DELAI_DE_LECTURE_MS); });
    return await Promise.race([lecture, delai]);
  } catch {
    return null;
  }
}

let enCours: Promise<void> | null = null;
/** Relire les deux prestataires (une seule lecture à la fois). */
export function relisLaSante(): Promise<void> {
  if (enCours) return enCours;
  enCours = (async () => {
    const [m, f] = await Promise.all([lisLaFonction('collecte-mtn'), lisLaFonction('mnd-pay')]);
    const le = Date.now();
    const mtn: LectureDuPrestataire = m ? { pret: m.pret === true, ouvert: m.ouverte === true, le } : null;
    const secrets = (f?.secrets ?? null) as { fedapay?: unknown } | null;
    const fedapay: LectureDuPrestataire = f ? { pret: secrets?.fedapay === true, le } : null;
    /* Une lecture muette ne touche pas la dernière réponse : un moyen qui
       s'y disait fermé reste fermé, et sa fonction muette ne s'inscrit pas. */
    const reponses = { ...memoire.reponses, ...(mtn ? { mtn } : {}), ...(fedapay ? { fedapay } : {}) };
    ecris({ ...memoire, lectures: { mtn, fedapay }, reponses });
    for (const p of pannesDeLaLecture({ mtn, fedapay }, ceQueLePosteVoit())) void inscrisLaPanne(p, 'lecture', brancheIci());
  })().finally(() => { enCours = null; });
  return enCours;
}

/** LA SANTÉ DES DEUX PRESTATAIRES, relue chaque minute tant que `actif`
    (la fenêtre Encaisser est ouverte) et que l'écran est visible. */
export function useLaSanteDesMoyens(actif: boolean, fedapayAllume: boolean): SanteDesMoyens {
  const m = useSyncExternalStore(abonne, () => memoire);
  /* Avant la lecture : FedaPay éteint n'est jamais en panne. */
  useEffect(() => { fedapayAllumeVu = fedapayAllume; }, [fedapayAllume]);
  useEffect(() => {
    if (!actif || !supabase) return;
    void relisLaSante();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void relisLaSante(); }, RELECTURE_DE_LA_SANTE_MS);
    return () => window.clearInterval(t);
  }, [actif]);
  const maintenantMs = Date.now();
  const enLigne = !!supabase && (typeof navigator === 'undefined' || navigator.onLine !== false);
  return {
    mtn: etatDuPrestataire('mtn', { enLigne, lecture: m.lectures.mtn, echec: m.echecs.mtn, maintenantMs }),
    fedapay: etatDuPrestataire('fedapay', { enLigne, allume: fedapayAllume, lecture: m.lectures.fedapay, echec: m.echecs.fedapay, maintenantMs }),
  };
}
