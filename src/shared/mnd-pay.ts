import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { motifDuRefus } from './whatsapp';
import { cashboxesStore } from './finance';
import {
  CAISSE_MND_PAY, CAISSE_ZELLE, compteDeLaDemande, modeFedaPay, saitTapGo,
  type DemandeMndPay, type MoyenMndPay, type ReglagesMndPay,
} from './mnd-pay-pur';

/* ══ MND PAY AU TRÔNE — 16 octobre 2026 ═════════════════════════════════
   Les règles vivent dans `mnd-pay-pur` ; ici, les gestes et l'écoute.

   L'ÉCOUTE EST DIRECTE, PAS PAR LA SYNCHRO DES MAGASINS. Les demandes sont
   écrites par le serveur seul (0133) : le Trône n'a rien à pousser, et une
   table liée à la synchro générale ferait virer la pastille au rouge tant
   que la migration n'est pas passée. On lit donc les demandes du mois de la
   branche, puis on écoute la table en temps réel : la ligne qui passe
   « payée » arrive au comptoir à l'instant.

   UNE DEMANDE NE PART JAMAIS EN DIFFÉRÉ. Les envois WhatsApp hors ligne
   attendent le réseau (`appels-en-attente`) ; une demande de paiement, non :
   envoyée une heure plus tard, elle ferait sonner le téléphone d'une cliente
   partie depuis longtemps. Sans réseau, on le dit, et l'on encaisse autrement. */

let demandes: DemandeMndPay[] = [];
const abonnes = new Set<() => void>();
const notifie = () => { for (const f of abonnes) f(); };
function pose(d: DemandeMndPay | undefined | null): void {
  if (!d?.id) return;
  const i = demandes.findIndex((x) => x.id === d.id);
  demandes = i >= 0 ? demandes.map((x, k) => (k === i ? d : x)) : [d, ...demandes];
  notifie();
}

let brancheEcoutee = '';
let canal: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

/** Écoute les demandes de la branche (idempotent). */
export function ecouteMndPay(branchId: string): void {
  const sb = supabase;
  if (!sb || !branchId || brancheEcoutee === branchId) return;
  brancheEcoutee = branchId;
  if (canal) { void sb.removeChannel(canal); canal = null; }
  demandes = [];
  notifie();
  const depuis = new Date(Date.now() - 31 * 86_400_000).toISOString();
  void sb.from('mnd_pay').select('data').eq('branch_id', branchId).gte('updated_at', depuis)
    .order('updated_at', { ascending: false }).limit(500)
    .then(({ data, error }) => {
      if (error) { console.warn('[mnd-pay] lecture :', error.message); return; }
      const lues = (data ?? []).map((r) => r.data as DemandeMndPay).filter((d) => d?.id);
      /* Ce que le temps réel a déjà apporté pendant la lecture garde la main. */
      const recents = new Map(demandes.map((d) => [d.id, d]));
      demandes = [...recents.values(), ...lues.filter((d) => !recents.has(d.id))];
      notifie();
    });
  canal = sb.channel(`mnd-pay-${branchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mnd_pay', filter: `branch_id=eq.${branchId}` },
      (p: { new?: { data?: DemandeMndPay } }) => pose(p.new?.data))
    .subscribe();
}

const lis = () => demandes;
const abonne = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

/** Les demandes MND PAY de la branche, en direct. */
export function useDemandesMndPay(branchId: string, actif: boolean): DemandeMndPay[] {
  useEffect(() => { if (actif) ecouteMndPay(branchId); }, [branchId, actif]);
  return useSyncExternalStore(abonne, lis, lis);
}

/** MND PAY est-il ouvert sur ce poste ? Les réglages, et une connexion. */
export const mndPayOuvert = (r: ReglagesMndPay | undefined): boolean => !!r?.actif && !!supabase;

export type Demande = {
  branchId: string;
  genre: 'comptoir' | 'lien';
  moyen: MoyenMndPay;
  montantXof: number;
  pourboireXof?: number;
  pieceId: string;
  pieceNumero?: string;
  clientId?: string;
  telephone?: string;
  libelle: string;
  reglages: ReglagesMndPay | undefined;
};

export type ReponseDeLaDemande =
  | { ok: true; id: string; url: string; directe: boolean; raison?: string; demande: DemandeMndPay }
  | { ok: false; erreur: string };

/** DEMANDER LE PAIEMENT. Les frais (sa décision : ajoutés pour la cliente) se
    calculent ICI, avec les réglages de la Maison, et voyagent en clair : le
    serveur additionne, FedaPay demande le total. */
export async function demandeLePaiement(e: Demande): Promise<ReponseDeLaDemande> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : demandez autrement (espèces, code MoMo).' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, erreur: 'Pas de réseau : une demande de paiement ne part pas en différé. Encaissez autrement.' };
  }
  const c = compteDeLaDemande({ montantXof: e.montantXof, pourboireXof: e.pourboireXof, moyen: e.moyen, reglages: e.reglages });
  const auTel = e.moyen === 'mtn' || e.moyen === 'moov' || e.moyen === 'celtiis';
  const { data, error } = await supabase.functions.invoke('mnd-pay', {
    body: {
      action: 'demander',
      branchId: e.branchId, genre: e.genre, moyen: e.moyen,
      montantXof: c.montantXof, pourboireXof: c.pourboireXof, fraisXof: c.fraisXof,
      pieceId: e.pieceId, pieceNumero: e.pieceNumero, clientId: e.clientId,
      telephone: e.telephone, libelle: e.libelle,
      ...(auTel ? { mode: modeFedaPay(e.moyen as 'mtn' | 'moov' | 'celtiis', e.reglages) } : {}),
    },
  });
  if (error) return { ok: false, erreur: await motifDuRefus(error) };
  const r = data as { id: string; url: string; directe: boolean; raison?: string };
  /* La demande s'affiche tout de suite ; la lecture et le temps réel la
     remplaceront par la ligne du serveur. */
  const provisoire: DemandeMndPay = {
    id: r.id, branchId: e.branchId, genre: e.genre, moyen: e.moyen,
    montantXof: c.montantXof, ...(c.pourboireXof ? { pourboireXof: c.pourboireXof } : {}),
    fraisXof: c.fraisXof, totalXof: c.totalXof, pieceId: e.pieceId, pieceNumero: e.pieceNumero,
    clientId: e.clientId, libelle: e.libelle, statut: 'en_attente', url: r.url,
    creeLe: new Date().toISOString(),
    ...(r.raison ? { raison: `envoi au téléphone refusé (${r.raison}) : faites scanner le QR` } : {}),
  };
  pose(provisoire);
  void relisLaDemande(r.id);
  return { ok: true, id: r.id, url: r.url, directe: r.directe, raison: r.raison, demande: provisoire };
}

/** REDEMANDER À FEDAPAY où en est une demande (le filet si le webhook
    tarde). Rend la demande à jour, ou null. `chercher` : pour une attente
    Tap & Go, relire aussi les dernières transactions de FedaPay. */
export async function relisLaDemande(id: string, chercher = false): Promise<DemandeMndPay | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('mnd-pay', { body: { action: 'statut', id, ...(chercher ? { chercher: true } : {}) } });
  if (error) return null;
  const d = (data as { demande?: DemandeMndPay })?.demande ?? null;
  pose(d);
  return d;
}

/** La caissière renonce. Si la cliente paie quand même, le webhook l'inscrit. */
export async function annuleLaDemande(id: string): Promise<DemandeMndPay | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('mnd-pay', { body: { action: 'annuler', id } });
  if (error) return null;
  const d = (data as { demande?: DemandeMndPay })?.demande ?? null;
  pose(d);
  return d;
}

/** LA CAISSE MND PAY DE LA BRANCHE, idempotente : l'argent reçu dort chez
    FedaPay jusqu'au reversement, ce n'est pas le tiroir. Identifiant
    déterministe : un second poste ne crée pas de doublon. Zelle a la sienne,
    en dollars, quand la Maison l'ouvre. */
export function assureLesCaissesMndPay(branchId: string, r: ReglagesMndPay | undefined): void {
  if (!branchId) return;
  const boxes = cashboxesStore.get();
  const a: typeof boxes = [];
  if (r?.actif && !boxes.some((b) => b.branchId === branchId && b.name === CAISSE_MND_PAY)) {
    a.push({ id: `cb-mndpay-${branchId}`, branchId, name: CAISSE_MND_PAY, sub: 'FedaPay · avant le reversement', glyph: '◈', openingXof: 0 });
  }
  if (r?.zelle?.actif && !boxes.some((b) => b.branchId === branchId && b.name === CAISSE_ZELLE)) {
    a.push({ id: `cb-zelle-${branchId}`, branchId, name: CAISSE_ZELLE, sub: 'Compte aux États-Unis', glyph: '$', openingXof: 0, currency: 'USD' });
  }
  if (a.length) cashboxesStore.set((prev) => [...prev, ...a]);
}

/** LA VERSION DE `mnd-pay`, lue une fois par ouverture du Trône (un échec
    ne se garde pas : on redemandera). */
let versionLue: Promise<string> | null = null;
export function versionDeMndPay(): Promise<string> {
  const sb = supabase;
  if (!sb) return Promise.resolve('');
  if (!versionLue) {
    versionLue = sb.functions.invoke('mnd-pay', { method: 'GET' })
      .then(({ data, error }) => (error ? '' : String((data as { version?: string } | null)?.version ?? '')))
      .catch(() => '')
      .then((v) => { if (!v) versionLue = null; return v; });
  }
  return versionLue;
}
/** Tap & Go s'offre-t-il au comptoir ? Seulement quand le serveur le sait. */
export function useSaitTapGo(actif: boolean): boolean {
  const [version, setVersion] = useState('');
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    void versionDeMndPay().then((v) => { if (vivant) setVersion(v); });
    return () => { vivant = false; };
  }, [actif]);
  return saitTapGo(version);
}

/** Relit, toutes les quelques secondes, une demande qu'on attend au
    comptoir : le filet du webhook. S'arrête dès qu'elle est finie. */
export function useRelecture(id: string | null, enAttente: boolean, toutesLesMs = 4000, chercher = false): void {
  useEffect(() => {
    if (!id || !enAttente) return;
    let tours = 0;
    const t = setInterval(() => {
      tours += 1;
      /* Trois minutes, puis on laisse le webhook et le bouton « Relire ». */
      if (tours > Math.ceil(180_000 / toutesLesMs)) { clearInterval(t); return; }
      void relisLaDemande(id, chercher);
    }, toutesLesMs);
    return () => clearInterval(t);
  }, [id, enAttente, toutesLesMs, chercher]);
}
