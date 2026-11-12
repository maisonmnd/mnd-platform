import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../../../../shared/supabase';
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
   `shared/choix-du-moyen-pur.ts`. */

type Memoire = {
  lectures: Partial<Record<Prestataire, LectureDuPrestataire>>;
  echecs: Partial<Record<Prestataire, EchecDuPrestataire>>;
};
const CLE = 'mnd_sante_des_moyens';
const DELAI_DE_LECTURE_MS = 8000;

function lisLaMemoire(): Memoire {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Partial<Memoire> | null;
    if (v && typeof v === 'object') return { lectures: v.lectures ?? {}, echecs: v.echecs ?? {} };
  } catch { /* sans mémoire */ }
  return { lectures: {}, echecs: {} };
}
let memoire: Memoire = lisLaMemoire();
const ecouteurs = new Set<() => void>();
function ecris(m: Memoire): void {
  memoire = m;
  try { localStorage.setItem(CLE, JSON.stringify(m)); } catch { /* sans mémoire */ }
  ecouteurs.forEach((f) => f());
}
const abonne = (f: () => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };

/** Une vraie demande a échoué faute de réponse du prestataire. */
export function signaleUnePanne(p: Prestataire): void {
  ecris({ ...memoire, echecs: { ...memoire.echecs, [p]: echecSuivant(memoire.echecs[p], Date.now()) } });
}
/** Une vraie demande est passée : la panne est finie. */
export function signaleUneReussite(p: Prestataire): void {
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
    ecris({ ...memoire, lectures: { mtn, fedapay } });
  })().finally(() => { enCours = null; });
  return enCours;
}

/** LA SANTÉ DES DEUX PRESTATAIRES, relue chaque minute tant que `actif`
    (la fenêtre Encaisser est ouverte) et que l'écran est visible. */
export function useLaSanteDesMoyens(actif: boolean, fedapayAllume: boolean): SanteDesMoyens {
  const m = useSyncExternalStore(abonne, () => memoire);
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
