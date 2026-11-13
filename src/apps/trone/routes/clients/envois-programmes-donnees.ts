import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../../../shared/supabase';
import { useAuth } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import { signeLeMessage } from '../../../../shared/identite';
import { useInvoices, type Invoice } from '../../../../shared/finance';
import { appelsStore, marquerAppelFait, useAppels } from '../../../../shared/appels';
import { documentDescendu, tablePrete } from '../../../../shared/sync';
import {
  TYPE_PROGRAMME, PIECE_A_TIRER, A_REVOIR, appelsAConvertir, cheminDuFichier, pieceRefusee,
  type LigneProgrammee, type PieceDuProgramme,
} from '../../../../shared/envois-programmes-pur';
import { envoisStore, useEnvois, type Envoi } from '../equipe/data';
import { useLaPieceEnPdf } from '../vente/pdf-de-la-piece';

/* ══ LES ENVOIS PROGRAMMÉS, CÔTÉ TRÔNE — 13 novembre 2026 ═════════════════
   La règle vit dans `shared/envois-programmes-pur.ts`. Ici : les lignes de
   la branche, le fichier de l'appareil déposé au compartiment privé (0206),
   les gestes écrits au serveur SOUS CONDITION (la règle de la salle : un
   geste ne passe que si la ligne est encore dans l'état que l'écran
   montrait), et la main du Trône : les appels convertis, les pièces tirées
   au moment d'envoyer, l'appel marqué fait quand son envoi est parti. */

export const COMPARTIMENT_DES_ENVOIS = 'envois-programmes';
const commeEnvoi = (l: LigneProgrammee): Envoi => l as unknown as Envoi;

/** Les envois programmés de la branche. */
export function useEnvoisProgrammes(): LigneProgrammee[] {
  const [envois] = useEnvois();
  const { branch } = useBranch();
  return useMemo(
    () => envois.filter((e) => !!e && e.type === (TYPE_PROGRAMME as Envoi['type']) && (!e.branchId || e.branchId === branch.id)) as unknown as LigneProgrammee[],
    [envois, branch.id],
  );
}

/** Le fichier de l'appareil, gardé au compartiment privé jusqu'à l'heure dite. */
export async function deposeLeFichier(lotId: string, f: File): Promise<{ ok: true; piece: PieceDuProgramme } | { ok: false; erreur: string }> {
  const refus = pieceRefusee({ type: f.type, octets: f.size });
  if (refus) return { ok: false, erreur: refus };
  if (!supabase) return { ok: false, erreur: 'Une pièce jointe se garde au serveur de la Maison : ce poste n’y est pas relié.' };
  const chemin = cheminDuFichier(lotId, f.name);
  const { error } = await supabase.storage.from(COMPARTIMENT_DES_ENVOIS).upload(chemin, f, { contentType: f.type, upsert: true });
  if (error) return { ok: false, erreur: `La pièce n’a pas pu se garder (${error.message}). La migration 0206 est-elle passée ?` };
  return { ok: true, piece: { genre: 'fichier', chemin, nom: f.name.slice(0, 120), type: f.type, octets: f.size } };
}

/** Les lignes neuves : par le magasin (sa file d'attente garde le geste hors ligne). */
export function programmeLesLignes(lignes: readonly LigneProgrammee[]): void {
  envoisStore.set((prev) => [...lignes.map(commeEnvoi), ...prev]);
}

export type IssueDuGeste = 'fait' | 'trop-tard' | 'panne';
/** UN GESTE SUR UNE LIGNE, écrit au serveur sous condition (son statut n'a pas
    bougé depuis que l'écran l'a montré) ; sans serveur, le magasin. On
    n'écrit pas dans le magasin quand le serveur existe : sa poussée
    réécrirait la ligne entière et pourrait défaire ce que le facteur vient
    de faire. L'écran suit par le direct. */
export async function gesteSurLEnvoi(id: string, faire: (l: LigneProgrammee) => LigneProgrammee | null): Promise<IssueDuGeste> {
  const ligne = envoisStore.get().find((e) => e.id === id) as unknown as LigneProgrammee | undefined;
  if (!ligne) return 'trop-tard';
  const apres = faire(ligne);
  if (!apres) return 'trop-tard';
  if (!supabase) {
    envoisStore.set((prev) => prev.map((e) => (e.id === id ? commeEnvoi(apres) : e)));
    return 'fait';
  }
  const { data, error } = await supabase.from('envois').update({ data: apres }).eq('id', id).eq('data->>statut', ligne.statut).select('id');
  if (error) return 'panne';
  return (data ?? []).length > 0 ? 'fait' : 'trop-tard';
}
export const motDuGeste = (v: IssueDuGeste): string =>
  (v === 'panne' ? 'Le serveur n’a pas répondu : le geste n’est pas passé. Réessayez.' : v === 'trop-tard' ? 'Trop tard : la ligne vient de bouger (partie, ou touchée d’un autre poste).' : '');

/** La pièce, comme fichier, pour la partager d'un second geste (par l'app). */
export async function laPieceEnFichier(p: PieceDuProgramme): Promise<File | null> {
  if (!supabase || !p.chemin) return null;
  const { data, error } = await supabase.storage.from(COMPARTIMENT_DES_ENVOIS).download(p.chemin);
  if (error || !data) return null;
  return new File([data], String(p.nom ?? 'piece'), { type: String(p.type ?? data.type ?? 'application/octet-stream') });
}

/** La pièce du Trône qu'une ligne tirera : sa facture la plus récente, ou son
    dernier reçu (une pièce qui porte un versement), au moment d'envoyer. */
export function pieceATirerDe(invoices: readonly Invoice[], clientId: string | undefined, genre: 'facture' | 'recu', invoiceId?: string): Invoice | null {
  if (invoiceId) return invoices.find((i) => i.id === invoiceId) ?? null;
  if (!clientId) return null;
  const siennes = invoices
    .filter((i) => i.kind === 'facture' && (i.clientId === clientId || i.forClientId === clientId) && (genre === 'facture' || (i.payments ?? []).length > 0))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(b.number ?? '').localeCompare(String(a.number ?? '')));
  return siennes[0] ?? null;
}

const fait = new Set<string>();

/* ══ LA MAIN DU TRÔNE POUR LES ENVOIS PROGRAMMÉS ══════════════════════════
   Montée une fois dans la coquille (comme la main de Grenat) :
   ① LES APPELS DÉJÀ NOTÉS, une fois par séance : chaque appel « à rappeler »
      non fait devient un envoi « à valider d'un toucher » (identifiant tiré
      de l'appel : deux postes ne font qu'une ligne), et l'appel porte la
      marque de son envoi. Un appel sans numéro reste au journal des appels.
   ② LA PIÈCE DU TRÔNE, TIRÉE AU MOMENT D'ENVOYER : une ligne « à-préparer »
      reçoit le PDF de la pièce telle qu'elle est maintenant (le même PDF que
      le comptoir), rangé au compartiment privé, et repart aussitôt. Un seul
      poste la tire : l'écriture ne passe que si elle est encore à préparer.
   ③ L'APPEL MARQUÉ FAIT quand l'envoi qui le suivait est parti. */
export function useLaMainDesEnvoisProgrammes(): void {
  const { session } = useAuth();
  const { branch } = useBranch();
  const [envois] = useEnvois();
  const [appels] = useAppels();
  const [clients] = useClients();
  const [invoices] = useInvoices();
  const { buildPdfData } = useLaPieceEnPdf();
  const converti = useRef(false);
  const enCours = useRef(false);

  /* ① Les appels déjà notés. */
  useEffect(() => {
    if (converti.current) return;
    if (supabase && (!session || !tablePrete('envois') || !documentDescendu('mnd_appels') || !tablePrete('clients'))) return;
    converti.current = true;
    const ids = new Set(envois.map((e) => e.id));
    const ficheDe = new Map(clients.map((c) => [c.id, c]));
    const qui = (session?.user?.email ?? '').split('@')[0];
    const r = appelsAConvertir(appels, {
      dejaLa: (id) => ids.has(id),
      fiche: (id) => ficheDe.get(id),
      appelDe: (f, nom) => appelDe((f ?? null) as Parameters<typeof appelDe>[0], nom),
      signe: signeLeMessage,
      maintenantMs: Date.now(),
      auteur: qui ? `le journal des appels (${qui})` : 'le journal des appels',
    });
    void (async () => {
      if (r.lignes.length) {
        if (supabase) {
          const { error } = await supabase.from('envois').upsert(
            r.lignes.map((l) => ({ id: l.id, branch_id: l.branchId ?? null, data: l })), { onConflict: 'id', ignoreDuplicates: true },
          );
          if (error) { converti.current = false; return; }
        } else programmeLesLignes(r.lignes);
      }
      if (r.marques.length) {
        const parAppel = new Map(r.marques.map((m) => [m.appelId, m.envoiId]));
        appelsStore.set((prev) => prev.map((a) => (parAppel.has(a.id) && !a.envoiId ? { ...a, envoiId: parAppel.get(a.id) } : a)));
      }
    })();
  }, [session, envois, appels, clients]);

  /* ② Les pièces à tirer. */
  useEffect(() => {
    if (enCours.current || (supabase && (!session || !tablePrete('envois') || !tablePrete('invoices')))) return;
    const aTirer = (envois as unknown as LigneProgrammee[]).filter((e) => !!e && e.type === TYPE_PROGRAMME && e.statut === PIECE_A_TIRER
      && (e.branchId ?? branch.id) === branch.id && !fait.has(e.id) && !!e.colis?.piece && e.colis.piece.genre !== 'fichier');
    if (!aTirer.length) return;
    enCours.current = true;
    void (async () => {
      try {
        for (const l of aTirer) {
          fait.add(l.id);
          const p = l.colis.piece as Extract<PieceDuProgramme, { genre: 'facture' | 'recu' }>;
          const piece = pieceATirerDe(invoices, l.clientId, p.genre, p.invoiceId);
          if (!piece) {
            await gesteSurLEnvoi(l.id, (x) => (x.statut === PIECE_A_TIRER ? { ...x, statut: A_REVOIR, detail: p.genre === 'facture' ? 'elle n’a pas de facture à joindre' : 'elle n’a pas de reçu à joindre' } : null));
            continue;
          }
          const { invoiceEnPiece } = await import('../../../../shared/pdf');
          const doc = await invoiceEnPiece(buildPdfData(piece));
          const nom = `${p.genre === 'facture' ? 'Facture' : 'Reçu'} ${piece.number || piece.id}.pdf`;
          let chemin = '';
          let octets = 0;
          if (supabase) {
            const blob = await (await fetch(doc.donnees)).blob();
            octets = blob.size;
            chemin = `${l.lotId ?? l.serieId}/${p.genre}-${l.id}.pdf`;
            const { error } = await supabase.storage.from(COMPARTIMENT_DES_ENVOIS).upload(chemin, blob, { contentType: 'application/pdf', upsert: true });
            if (error) { fait.delete(l.id); continue; }
          }
          const maintenant = Date.now();
          await gesteSurLEnvoi(l.id, (x) => (x.statut !== PIECE_A_TIRER ? null : {
            ...x, statut: 'en-attente', partA: new Date(maintenant).toISOString(), calme: false,
            colis: { ...x.colis, piece: { genre: p.genre, invoiceId: piece.id, chemin, nom, type: 'application/pdf', octets, tireeLe: new Date(maintenant).toISOString() } },
          }));
        }
      } catch (err) {
        console.warn('[les envois programmés] pièce :', err);
      } finally {
        enCours.current = false;
      }
    })();
  }, [session, envois, invoices, branch.id, buildPdfData]);

  /* ③ L'appel fait quand son envoi est parti. */
  useEffect(() => {
    const partis = new Set((envois as unknown as LigneProgrammee[])
      .filter((e) => !!e && e.type === TYPE_PROGRAMME && e.statut === 'envoyé' && !!e.depuisUnAppel).map((e) => String(e.depuisUnAppel)));
    for (const a of appels) if (!a.fait && partis.has(a.id)) marquerAppelFait(a.id);
  }, [envois, appels]);
}
