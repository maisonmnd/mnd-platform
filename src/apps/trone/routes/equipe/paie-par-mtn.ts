import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../../shared/supabase';
import {
  estFinal, triDesEnvois,
  type EnvoiMtn, type ItemAEnvoyer, type LectureMtn, type NomMtnVu,
} from '../../../../shared/paie-par-mtn-pur';

/* ══ LA PAIE PAR MTN, CE QUE LE TRÔNE DEMANDE AU SERVEUR · 5 novembre 2026 ══
   Lot 2 de la paie (maquette 6bNGeh7nyABotDAXppWRoX). Le serveur, c'est la
   fonction `paie-mtn` : elle seule parle à MTN, par le relais de la Maison,
   et tient le registre des envois (`paie_envois_mtn`, 0163), que la
   direction lit ici. Les règles vivent dans `shared/paie-par-mtn-pur`. */

export type EtatDuServeurMtn = {
  pret: boolean;
  version?: string;
  cles?: { utilisateur: boolean; cle: boolean; abonnement: boolean };
  relais?: boolean;
  erreur?: string;
};

const SANS_SERVEUR = 'La fonction paie-mtn ne répond pas (est-elle posée dans Supabase ?).';

type Reponse<T> = Partial<T> & { erreur?: string };
async function appelle<T extends object>(corps: Record<string, unknown>): Promise<Reponse<T>> {
  if (!supabase) return { erreur: 'Le Trône n’est pas relié à Supabase.' } as Reponse<T>;
  try {
    const { data, error } = await supabase.functions.invoke('paie-mtn', { body: corps });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const lu = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
      return { ...(lu ?? {}), erreur: (lu as { erreur?: string } | null)?.erreur ?? SANS_SERVEUR } as Reponse<T>;
    }
    return (data ?? {}) as Reponse<T>;
  } catch {
    return { erreur: SANS_SERVEUR } as Reponse<T>;
  }
}

/** Une référence d'envoi neuve : le X-Reference-Id que MTN attend (UUID v4). */
export const nouvelleReference = (): string => crypto.randomUUID();

/* ── L'état du serveur : les clés posées ? (jamais leurs valeurs) ── */
let etatGarde: { a: number; v: EtatDuServeurMtn } | null = null;
export function useServeurMtn(): EtatDuServeurMtn & { charge: boolean } {
  const [v, setV] = useState<EtatDuServeurMtn | null>(etatGarde?.v ?? null);
  useEffect(() => {
    if (etatGarde && Date.now() - etatGarde.a < 5 * 60_000) { setV(etatGarde.v); return; }
    let vivant = true;
    void appelle<EtatDuServeurMtn>({ action: 'etat' }).then((r) => {
      const e: EtatDuServeurMtn = { pret: r.pret === true, version: r.version, cles: r.cles, relais: r.relais, ...(r.erreur ? { erreur: r.erreur } : {}) };
      etatGarde = { a: Date.now(), v: e };
      if (vivant) setV(e);
    });
    return () => { vivant = false; };
  }, []);
  return { ...(v ?? { pret: false }), charge: v !== null };
}

/* ── Les gestes ── */
export const lisChezMtn = (numeros: string[]) =>
  appelle<LectureMtn>({ action: 'lire', numeros });

/** `prevenir` : la personne reçoit « Ta paie … est partie » quand MTN dit reçu (0164) ; l'équipe oui, prestataires et entreprises non. */
export type EnvoiAProgrammer = ItemAEnvoyer & { reference: string; runId: string; periode: string; partA: string; prevenir?: boolean };
export const programme = (envois: EnvoiAProgrammer[]) =>
  appelle<{ inscrits: string[]; refuses: { reference: string; erreur: string }[] }>({ action: 'programmer', envois });

export const teste = (essaiId: string, items: ItemAEnvoyer[]) =>
  appelle<{ inscrits: string[]; refuses: { reference: string; erreur: string }[] }>({
    action: 'tester', essaiId, envois: items.map((x) => ({ ...x, reference: nouvelleReference() })),
  });

export const annule = (references: string[]) =>
  appelle<{ annules: number }>({ action: 'annuler', references });

export const renvoie = (reference: string, msisdn?: string) =>
  appelle<{ inscrits: string[] }>({ action: 'renvoyer', reference, nouvelle: nouvelleReference(), ...(msisdn ? { msisdn } : {}) });

export const relis = () => appelle<{ passage: unknown }>({ action: 'relire' });

/** Programmer ce qui peut partir d'un run, d'un seul geste : le tri
    (numéro, montant, envoi déjà vivant, nom chez MTN), puis le serveur. */
export async function programmeLeRun(o: {
  runId: string; periode: string; partA: string;
  items: ItemAEnvoyer[]; envois: EnvoiMtn[]; lecture?: LectureMtn;
  vus: (employeeId: string) => NomMtnVu | undefined;
  /** Prévenir chacun quand MTN dit reçu : vrai pour l'équipe. */
  prevenir: boolean;
}) {
  const tri = triDesEnvois({ runId: o.runId, items: o.items, envois: o.envois, lecture: o.lecture, vus: o.vus });
  if (!tri.partent.length) return { tri, inscrits: [] as string[], refuses: [] as { reference: string; erreur: string }[] };
  const r = await programme(tri.partent.map((x) => ({ ...x, reference: nouvelleReference(), runId: o.runId, periode: o.periode, partA: o.partA, prevenir: o.prevenir })));
  return { tri, inscrits: r.inscrits ?? [], refuses: r.refuses ?? [], erreur: r.erreur };
}

/* ── Le registre, lu par la direction (RLS 0163) ── */
export function useEnvoisMtn(f: { runId?: string; essais?: boolean; actif?: boolean }): { envois: EnvoiMtn[]; relis: () => void; erreur?: string } {
  const [envois, setEnvois] = useState<EnvoiMtn[]>([]);
  const [erreur, setErreur] = useState<string | undefined>();
  const [tic, setTic] = useState(0);
  const relisLeRegistre = useCallback(() => setTic((t) => t + 1), []);
  useEffect(() => {
    if (!supabase || f.actif === false || (!f.runId && !f.essais)) return;
    let vivant = true;
    let q = supabase.from('paie_envois_mtn').select('*').order('programme_le', { ascending: false }).limit(200);
    q = f.essais ? q.eq('genre', 'essai') : q.eq('genre', 'paie').eq('run_id', f.runId as string);
    void q.then(({ data, error }) => {
      if (!vivant) return;
      if (error) { setErreur('Le registre des envois MTN n’a pas pu être lu.'); return; }
      setErreur(undefined);
      setEnvois((data ?? []) as EnvoiMtn[]);
    });
    return () => { vivant = false; };
  }, [f.runId, f.essais, f.actif, tic]);
  /* Tant qu'un envoi attend sa réponse, le registre se relit toutes les 30 s. */
  const attend = envois.some((e) => !estFinal(e.etat));
  useEffect(() => {
    if (!attend) return;
    const t = window.setInterval(relisLeRegistre, 30_000);
    return () => window.clearInterval(t);
  }, [attend, relisLeRegistre]);
  return { envois, relis: relisLeRegistre, erreur };
}
