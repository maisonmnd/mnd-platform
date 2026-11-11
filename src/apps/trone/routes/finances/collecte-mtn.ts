import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../shared/supabase';

/* ══ LE COMPTE DE COLLECTE MTN, CE QUE LE TRÔNE DEMANDE AU SERVEUR ══════
   11 novembre 2026, maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5).
   Le serveur, c'est la fonction `collecte-mtn` : elle seule parle à MTN,
   par le relais de la Maison. Le numéro du compte de collecte ne s'écrit
   pas dans le dépôt (public) : le serveur le rend, lu dans son réglage, à
   la direction seule. Les règles vivent dans `shared/collecte-mtn-pur`. */

export type LectureDuCompte = {
  le?: string;
  numero?: string | null;
  compte?: string | null;
  soldeXof?: number | null;
  devise?: string | null;
  souci?: string | null;
  erreur?: string;
};

export type EssaiDuCompte = LectureDuCompte & {
  jeton?: { ok: boolean; http: number };
  solde?: { xof: number | null; devise: string | null; http: number };
  verifie?: { dit: string; mtn: boolean; actif: boolean | null; nom: string | null } | null;
  numeroIllisible?: boolean;
};

const SANS_SERVEUR = 'La fonction collecte-mtn ne répond pas (est-elle posée dans Supabase ?).';

type Reponse<T> = Partial<T> & { erreur?: string };
export async function appelleLaCollecte<T extends object>(corps: Record<string, unknown>): Promise<Reponse<T>> {
  if (!supabase) return { erreur: 'Le Trône n’est pas relié à Supabase.' } as Reponse<T>;
  try {
    const { data, error } = await supabase.functions.invoke('collecte-mtn', { body: corps });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const lu = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      return { ...(lu ?? {}), erreur: (lu as { erreur?: string; souci?: string } | null)?.erreur ?? (lu as { souci?: string } | null)?.souci ?? SANS_SERVEUR } as Reponse<T>;
    }
    return (data ?? {}) as Reponse<T>;
  } catch {
    return { erreur: SANS_SERVEUR } as Reponse<T>;
  }
}

export const lisLeCompteDeCollecte = () => appelleLaCollecte<LectureDuCompte>({ action: 'solde' });

/** L'ESSAI SANS ARGENT : jeton, solde, et un numéro vérifié chez MTN. */
export const essaieLeCompteDeCollecte = (numero: string) => appelleLaCollecte<EssaiDuCompte>({ action: 'essai', numero });

/** LE SOLDE EN DIRECT : relu à l'ouverture, puis chaque minute tant que
    l'écran est ouvert et visible, et d'un geste (« Relire maintenant »). */
export function useCompteDeCollecte(actif: boolean): { lecture: LectureDuCompte | null; luLe: number | null; enCours: boolean; relire: () => void } {
  const [lecture, setLecture] = useState<LectureDuCompte | null>(null);
  const [luLe, setLuLe] = useState<number | null>(null);
  const [enCours, setEnCours] = useState(false);
  const vivant = useRef(true);
  const enVol = useRef(false);
  const relire = useCallback(() => {
    if (enVol.current) return;
    enVol.current = true;
    setEnCours(true);
    void lisLeCompteDeCollecte().then((r) => {
      enVol.current = false;
      if (!vivant.current) return;
      setEnCours(false);
      setLecture(r as LectureDuCompte);
      setLuLe(Date.now());
    });
  }, []);
  useEffect(() => {
    vivant.current = true;
    if (!actif) return () => { vivant.current = false; };
    relire();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') relire(); }, 60_000);
    const revient = () => { if (document.visibilityState === 'visible') relire(); };
    document.addEventListener('visibilitychange', revient);
    return () => { vivant.current = false; window.clearInterval(t); document.removeEventListener('visibilitychange', revient); };
  }, [actif, relire]);
  return { lecture, luLe, enCours, relire };
}
