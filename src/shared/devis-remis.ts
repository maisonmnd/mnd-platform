/* ══ LE DEVIS SE REMET AU RENDEZ-VOUS, CÔTÉ TRÔNE — 17 novembre 2026 ══════
   La règle est pure (`devis-remis-pur`, `peutEtreRemis`). Ici, seulement ce
   qu'elle lit au Trône : les consultations, les visios, le Carnet, les
   numéros des fiches ; et le geste qui pose la marque de la remise.

   LES VISIOS NE SONT PAS DANS LE MAGASIN (0209 : l'équipe seule les lit,
   elles portent un numéro). On ne les garde donc qu'en mémoire, relues toutes
   les minutes tant qu'un écran les regarde. `visios.ts` ne lit que d'hier à
   dans quinze jours : une visio tenue il y a cinq jours doit compter ici. */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { useStore } from './store';
import { consultationsQueueStore } from './bridges';
import { useAppointments } from './agenda';
import { useClients } from './clients';
import { invoicesStore } from './finance';
import {
  estRemis, horsRegle, marqueDeLaRemise,
  type ConsultationDeLaRemise, type ContexteDeLaRemise, type VisioDeLaRemise,
} from './devis-remis-pur';

const JOURS_DE_VISIOS = 365;
const RELECTURE_MS = 60_000;

let visios: readonly VisioDeLaRemise[] = [];
let luLe = 0;
let enVol: Promise<void> | null = null;
const ecoutes = new Set<() => void>();

async function relisLesVisios(): Promise<void> {
  if (!supabase) return;
  if (enVol) return enVol;
  const sb = supabase;
  enVol = (async () => {
    try {
      const depuis = new Date(Date.now() - JOURS_DE_VISIOS * 86_400_000).toISOString();
      const { data, error } = await sb.from('visios')
        .select('id, consultation_id, telephone, statut, debut')
        .gte('debut', depuis).order('debut', { ascending: false }).limit(2000);
      /* Une lecture ratée ne dit rien : on garde ce qu'on savait, la règle reste fermée faute de preuve. */
      if (error) return;
      visios = ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l.id),
        consultationId: typeof l.consultation_id === 'string' ? l.consultation_id : null,
        telephone: String(l.telephone ?? ''),
        statut: String(l.statut ?? ''),
        debut: String(l.debut ?? ''),
      }));
      luLe = Date.now();
      ecoutes.forEach((f) => f());
    } finally {
      enVol = null;
    }
  })();
  return enVol;
}

const ecoute = (f: () => void): (() => void) => { ecoutes.add(f); return () => { ecoutes.delete(f); }; };
const lisLesVisios = (): readonly VisioDeLaRemise[] => visios;

/** Les visios de l'année (tenues, réservées, manquées), relues toutes les minutes. */
export function useVisiosDeLaRemise(): readonly VisioDeLaRemise[] {
  const v = useSyncExternalStore(ecoute, lisLesVisios, lisLesVisios);
  useEffect(() => {
    if (Date.now() - luLe > RELECTURE_MS / 2) void relisLesVisios();
    const t = window.setInterval(() => { void relisLesVisios(); }, RELECTURE_MS);
    return () => window.clearInterval(t);
  }, []);
  return v;
}

/** Ce que `peutEtreRemis` lit : les consultations, les visios, le Carnet, les numéros. */
export function useContexteDeLaRemise(): ContexteDeLaRemise {
  const [queue] = useStore(consultationsQueueStore);
  const [rdvs] = useAppointments();
  const [clients] = useClients();
  const v = useVisiosDeLaRemise();
  return useMemo(() => {
    const numeros = new Map(clients.map((c) => [c.id, c.phone]));
    return {
      consultations: queue as readonly ConsultationDeLaRemise[],
      visios: v,
      rdvs,
      telephoneDe: (id: string) => numeros.get(id),
    };
  }, [queue, rdvs, clients, v]);
}

/** La Maison remet le devis : sa marque, une seule fois. Ni une commande de la
    Boutique, ni un devis déjà remis. À N'APPELER QU'APRÈS `peutEtreRemis`. */
export function remetsLeDevis(id: string, par?: string): void {
  const quand = new Date().toISOString();
  invoicesStore.set((prev) => prev.map((i) => (i.id === id && !horsRegle(i) && !estRemis(i)
    ? { ...i, ...marqueDeLaRemise(i, quand, par) }
    : i)));
}
