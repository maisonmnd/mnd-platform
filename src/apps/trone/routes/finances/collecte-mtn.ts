import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../shared/supabase';
import { estVivante, type CollecteMtn } from '../../../../shared/collecte-mtn-pur';

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
  /** L'interrupteur du règlement par MTN (lot B, 0200) : fermé tant qu'il n'est pas lu. */
  reglement?: { ouverte: boolean; rappel: boolean; lu: boolean };
};

export type EssaiDuCompte = LectureDuCompte & {
  jeton?: { ok: boolean; http: number };
  solde?: { xof: number | null; devise: string | null; http: number };
  verifie?: { dit: string; mtn: boolean; actif: boolean | null; nom: string | null } | null;
  numeroIllisible?: boolean;
};

/** Exporté pour le choix du moyen (12 novembre 2026) : ce silence est une panne. */
export const SANS_SERVEUR = 'La fonction collecte-mtn ne répond pas (est-elle posée dans Supabase ?).';

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

/* ══ LOT B : L'ESSAI DE 100 F, L'INTERRUPTEUR, LES RÈGLEMENTS DU JOUR ══ */

export type ReponseDeLaDemande = { reference?: string; etat?: 'attente' | 'recu' | 'refuse'; montantXof?: number; raison?: string; erreur?: string };

/** L'ESSAI DE 100 F depuis le numéro de la direction (500 F au plus) : une
    vraie demande MTN, qu'elle valide elle-même sur son téléphone. */
export const demandeLEssai = (numero: string, montantXof = 100) =>
  appelleLaCollecte<ReponseDeLaDemande>({ action: 'essai-paiement', numero, montantXof });
/** « PAYER PAR MTN » DE LA FENÊTRE ENCAISSER (11 novembre 2026) : le personnel
    envoie la demande au numéro MTN de la cliente, pour ce rendez-vous ; le
    serveur prend le reste de la pièce. `sans_piece` : la pièce n'est pas
    encore montée, on redemande. */
export const demandeDuTrone = (rdvId: string, numero: string, pourboireXof: number) =>
  appelleLaCollecte<ReponseDeLaDemande>({ action: 'demander-trone', rdvId, numero, pourboireXof: Math.max(0, Math.round(pourboireXof)) });
/** Où en est une demande (la même relecture que la page de la cliente). */
export const statutDeLaCollecte = (reference: string) => appelleLaCollecte<ReponseDeLaDemande>({ action: 'statut', reference });
/** Ouvrir ou fermer le règlement par MTN aux clientes ; le serveur n'ouvre qu'après un essai reçu. */
export const basculeLaCollecte = (ouvrir: boolean) => appelleLaCollecte<{ ouverte: boolean; rappel: boolean }>({ action: 'interrupteur', ouvrir });
/** Relire chez MTN toutes les demandes qui attendent. */
export const relisLesCollectes = () => appelleLaCollecte<{ passage: unknown }>({ action: 'relire' });

/** LE REGISTRE, lu par la direction (RLS 0200) : les demandes depuis
    `depuisIso`, relu toutes les 10 s tant qu'une attend, sinon chaque minute. */
export function useCollectesMtn(actif: boolean, depuisIso: string): { collectes: CollecteMtn[]; erreur?: string; relis: () => void } {
  const [collectes, setCollectes] = useState<CollecteMtn[]>([]);
  const [erreur, setErreur] = useState<string | undefined>();
  const [tic, setTic] = useState(0);
  const relis = useCallback(() => setTic((t) => t + 1), []);
  useEffect(() => {
    if (!supabase || !actif) return;
    let vivant = true;
    void supabase.from('collectes_mtn').select('*').gte('demande_le', depuisIso).order('demande_le', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (!vivant) return;
        if (error) { setErreur('Le registre des règlements MTN n’a pas pu être lu (la migration 0200 est-elle passée ?).'); return; }
        setErreur(undefined);
        setCollectes((data ?? []) as CollecteMtn[]);
      });
    return () => { vivant = false; };
  }, [actif, depuisIso, tic]);
  const attend = collectes.some((c) => estVivante(c.etat));
  useEffect(() => {
    if (!actif) return;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') relis(); }, attend ? 10_000 : 60_000);
    return () => window.clearInterval(t);
  }, [actif, attend, relis]);
  return { collectes, erreur, relis };
}

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
