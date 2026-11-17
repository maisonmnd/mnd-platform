import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import {
  REGLAGES_DE_DEPART, reglagesSurs, resumeSur,
  type Creneau, type ReglagesDeLaVisio, type ResumeDeLaVisio, type StatutDeLaVisio,
} from './visio-pur';
import type { OnlineConsultation } from './bridges';
import type { MomentChoisi } from './consultation-privee-pur';

/* ══ LES VISIOS, CÔTÉ TRÔNE — 13 novembre 2026 (la Consultation, lot 3) ════
   Deux sources :
     · le document `mnd_visio` (les jours et les quarts d'heure ouverts),
       écrit par la direction seule (0209), amorcé par le premier poste ;
     · la table `visios` (0209), que la fonction `visio-salle` remplit à
       chaque réservation. L'équipe la lit et y écrit l'état et le résumé ;
       elle ne crée jamais de ligne (c'est la fonction, avec son jeton).
   La table n'est pas dans le magasin : la file B la relit toutes les trente
   secondes, et à chaque geste. */

export const visioStore = createStore<ReglagesDeLaVisio>('mnd_visio', REGLAGES_DE_DEPART());
bindDocument(visioStore, 'mnd_visio');

export function useReglagesDeLaVisio(): [ReglagesDeLaVisio, (fn: (r: ReglagesDeLaVisio) => ReglagesDeLaVisio, par?: string) => void] {
  const [brut] = useStore(visioStore);
  const r = useMemo(() => reglagesSurs(brut), [brut]);
  const ecris = (fn: (r: ReglagesDeLaVisio) => ReglagesDeLaVisio, par?: string) =>
    visioStore.set((avant) => ({ ...fn(reglagesSurs(avant)), modifieLe: new Date().toISOString(), ...(par ? { modifiePar: par } : {}) }));
  return [r, ecris];
}

export type Visio = {
  id: string;
  consultationId: string | null;
  debut: string;
  fin: string;
  nom: string;
  telephone: string;
  statut: StatutDeLaVisio;
  resume: ResumeDeLaVisio | null;
  /* 0216 (17 novembre 2026) : absents tant que la migration n'est pas passée. */
  /** Combien de fois la cliente a changé l'heure. */
  deplacements: number;
  /** L'heure d'avant le dernier changement. */
  deplaceeDe: string | null;
  /** Son rendez-vous du Carnet, quand la Maison les y inscrit. */
  rdvId: string | null;
  /** `whatsapp` : son lien d'entrée est parti ; `a-envoyer` : il reste à envoyer ; `a-la-main` : la Maison l'a envoyé. */
  lienEtat: 'whatsapp' | 'a-envoyer' | 'a-la-main' | null;
  annuleePar: 'cliente' | 'maison' | null;
  /** Elle a vu la suite sur sa page. */
  suiteVueLe: string | null;
};

/** CE QUE LA CONSULTATION GARDE DE SON RENDEZ-VOUS (17 novembre 2026). Écrit
    par `visio-salle` : `rdvId`, le rendez-vous du Carnet (la consultation
    privée, ou la visio quand la Maison l'y inscrit) ; `momentVoulu`, le moment
    choisi au paiement tant qu'il n'est pas posé ; `momentRefuse`, pourquoi il
    ne l'a pas été. La file B y écrit l'état de la visio. */
export type ConsultationSuivie = OnlineConsultation & {
  rdvId?: string;
  rdv?: { id: string; date: string; time: string; master?: string; poseLe?: string };
  momentVoulu?: MomentChoisi;
  momentRefuse?: MomentChoisi & { raison: string; le: string };
  visio?: { id: string; debut: string; statut?: StatutDeLaVisio; tenueLe?: string };
};

const versVisio = (l: Record<string, unknown>): Visio => ({
  id: String(l.id),
  consultationId: typeof l.consultation_id === 'string' ? l.consultation_id : null,
  debut: String(l.debut),
  fin: String(l.fin),
  nom: String(l.nom ?? ''),
  telephone: String(l.telephone ?? ''),
  statut: (String(l.statut) as StatutDeLaVisio),
  resume: resumeSur(l.resume),
  deplacements: Math.max(0, Math.round(Number(l.deplacements ?? 0)) || 0),
  deplaceeDe: typeof l.deplacee_de === 'string' ? l.deplacee_de : null,
  rdvId: typeof l.rdv_id === 'string' && l.rdv_id ? l.rdv_id : null,
  lienEtat: l.lien_etat === 'whatsapp' || l.lien_etat === 'a-envoyer' || l.lien_etat === 'a-la-main' ? l.lien_etat : null,
  annuleePar: l.annulee_par === 'cliente' || l.annulee_par === 'maison' ? l.annulee_par : null,
  suiteVueLe: typeof l.suite_vue_le === 'string' ? l.suite_vue_le : null,
});

const COLONNES_D_AVANT = 'id, consultation_id, debut, fin, nom, telephone, statut, resume';
const COLONNES = `${COLONNES_D_AVANT}, deplacements, deplacee_de, rdv_id, lien_etat, annulee_par, suite_vue_le`;

/** Les visios d'hier à dans quinze jours, relues toutes les trente secondes. `absente` : la table n'existe pas encore (0209). */
export function useVisios(): { visios: Visio[]; absente: boolean; relis: () => Promise<void> } {
  const [visios, setVisios] = useState<Visio[]>([]);
  const [absente, setAbsente] = useState(false);
  const relis = useCallback(async () => {
    if (!supabase) return;
    const depuis = new Date(Date.now() - 86_400_000).toISOString();
    const jusque = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const lis = (colonnes: string) => supabase!.from('visios').select(colonnes)
      .gte('debut', depuis).lte('debut', jusque).order('debut', { ascending: true }).limit(200);
    let { data, error } = await lis(COLONNES);
    /* Avant 0216, les colonnes neuves manquent : la file se lit comme avant. */
    if (error && /column/i.test(error.message)) ({ data, error } = await lis(COLONNES_D_AVANT));
    if (error) { setAbsente(/does not exist|relation|schema cache/i.test(error.message)); return; }
    setAbsente(false);
    setVisios(((data ?? []) as unknown as Record<string, unknown>[]).map(versVisio));
  }, []);
  useEffect(() => {
    void relis();
    const t = window.setInterval(() => { void relis(); }, 30_000);
    return () => window.clearInterval(t);
  }, [relis]);
  return { visios, absente, relis };
}

/** L'état d'une visio (tenue, manquée, annulée), et le résumé quand il y en a un. */
export async function ecrisLaVisio(id: string, x: { statut?: StatutDeLaVisio; resume?: ResumeDeLaVisio }): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('visios').update({
    ...(x.statut ? { statut: x.statut } : {}),
    ...(x.resume ? { resume: x.resume } : {}),
    maj_le: new Date().toISOString(),
  }).eq('id', id);
  return !error;
}

/** L'entrée de la Maison dans la salle (propriétaire), par la session de l'équipe. */
export async function entreeDeLaMaison(id: string): Promise<{ url?: string; motif?: string; maintenant?: string }> {
  if (!supabase) return { motif: 'hors-ligne' };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: { geste: 'entrer-maison', id } });
  if (!error) {
    const d = (data ?? {}) as { ok?: boolean; url?: string; motif?: string; maintenant?: string };
    return d.ok && d.url ? { url: d.url, maintenant: d.maintenant } : { motif: d.motif ?? 'erreur', maintenant: d.maintenant };
  }
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as { motif?: string; maintenant?: string }) : null;
    if (d?.motif) return { motif: d.motif, maintenant: d.maintenant };
  } catch { /* corps illisible */ }
  return { motif: 'erreur' };
}

/** Ce que `visio-salle` répond, refus compris : un refus (403, 409) porte sa raison dans le corps. */
async function appelleLaSalle(corps: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!supabase) return { ok: false, motif: 'hors-ligne' };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: corps });
  if (!error) return (data ?? {}) as Record<string, unknown>;
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as Record<string, unknown>) : null;
    if (d) return d;
  } catch { /* corps illisible */ }
  return { ok: false, motif: 'erreur' };
}

/** Les quarts d'heure libres, pour déplacer une visio depuis la file B. */
export async function creneauxDeLaVisio(): Promise<Creneau[]> {
  const r = await appelleLaSalle({ geste: 'creneaux' });
  return r.ok && Array.isArray(r.creneaux) ? (r.creneaux as Creneau[]) : [];
}

/** DÉPLACER (17 novembre 2026) : la Maison change l'heure d'une visio réservée.
    La nouvelle heure part sur WhatsApp, avec un lien neuf. */
export async function deplaceLaVisio(id: string, debut: string): Promise<{ ok: boolean; motif?: string; parWhatsApp?: boolean }> {
  const r = await appelleLaSalle({ geste: 'deplacer', id, debut });
  return r.ok ? { ok: true, parWhatsApp: r.parWhatsApp === true } : { ok: false, motif: String(r.motif ?? 'erreur') };
}

/** APRÈS LA VISIO : dépose sur WhatsApp les affiches que le résumé propose. */
export async function envoieLaSuite(id: string): Promise<{ ok: boolean; rituel?: string; privee?: string; motif?: string }> {
  const r = await appelleLaSalle({ geste: 'suite', id });
  return r.ok ? { ok: true, rituel: String(r.rituel ?? ''), privee: String(r.privee ?? '') } : { ok: false, motif: String(r.motif ?? 'erreur') };
}

/** Les moments libres de la consultation privée (l'agenda, jamais le jour même, 08:30). */
export async function momentsDeLaPrivee(): Promise<MomentChoisi[]> {
  const r = await appelleLaSalle({ geste: 'moments-privee' });
  return r.ok && Array.isArray(r.moments) ? (r.moments as MomentChoisi[]) : [];
}

/** La consultation privée réglée prend sa place au Carnet (sous le verrou des places). */
export async function poseLaPrivee(consultationId: string, moment?: MomentChoisi): Promise<{ ok: boolean; motif?: string; rdvId?: string }> {
  const r = await appelleLaSalle({ geste: 'reserver-privee', consultationId, ...(moment ? { moment } : {}) });
  return r.ok ? { ok: true, rdvId: String(r.rdvId ?? '') } : { ok: false, motif: String(r.motif ?? 'erreur') };
}

/** UN LIEN D'ENTRÉE NEUF pour la cliente (l'ancien cesse d'ouvrir la salle) : rend le chemin, relatif à l'origine. */
export async function nouveauLien(id: string): Promise<{ chemin?: string; motif?: string }> {
  if (!supabase) return { motif: 'hors-ligne' };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: { geste: 'nouveau-lien', id } });
  if (!error) {
    const d = (data ?? {}) as { ok?: boolean; chemin?: string; motif?: string };
    return d.ok && d.chemin ? { chemin: d.chemin } : { motif: d.motif ?? 'erreur' };
  }
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as { motif?: string }) : null;
    if (d?.motif) return { motif: d.motif };
  } catch { /* corps illisible */ }
  return { motif: 'erreur' };
}

/** Le message WhatsApp des affiches d'après la visio, pour la main de la Maison
    (les modèles partent seuls quand Meta les a approuvés) : les mêmes liens que sa page. */
export function messageDeLaSuite(prenom: string, o: { rituel?: { nom: string; noms: string[]; lien: string }; privee?: { nom: string; ligne: string; lien: string } }): string {
  return [
    `Bonjour${prenom ? ` ${prenom}` : ''}, merci pour votre visio avec la Maison MND.`,
    ...(o.rituel ? [`${o.rituel.nom}${o.rituel.noms.length ? ` : ${o.rituel.noms.join(', ')}` : ''}. Il ne vous reste qu’à choisir votre jour et votre heure :`, o.rituel.lien] : []),
    ...(o.privee ? [`${o.privee.nom}. ${o.privee.ligne} :`, o.privee.lien] : []),
  ].join('\n');
}

/** Le message WhatsApp qui porte le lien : prénom, jour, heure, et ce qui va se passer. */
export function messageDuLien(prenom: string, quand: string, lien: string): string {
  return [
    `Bonjour${prenom ? ` ${prenom}` : ''}, voici votre visio gratuite avec la Maison MND : ${quand}.`,
    'Votre lien d’entrée, sans mot de passe (la salle s’ouvre cinq minutes avant) :',
    lien,
    'Quinze minutes, pas une de plus : à treize minutes, on résume et on vous propose la suite.',
  ].join('\n');
}

/** La clé du service de visio est-elle posée ? (la fonction le dit sans la montrer) */
export async function etatDuService(): Promise<{ joignable: boolean; cle: boolean; actif: boolean }> {
  if (!supabase) return { joignable: false, cle: false, actif: false };
  const { data, error } = await supabase.functions.invoke('visio-salle', { body: { geste: 'creneaux' } });
  const d = (data ?? {}) as { ok?: boolean; cle?: boolean; actif?: boolean };
  if (error || !d.ok) return { joignable: false, cle: false, actif: false };
  return { joignable: true, cle: d.cle === true, actif: d.actif === true };
}

/* ── LES LOCKS TÉMOINS (compartiment `temoins`, 0209) ───────────────── */

export const COMPARTIMENT_DES_TEMOINS = 'temoins';

/** Dépose une photo de témoin ; rend son chemin. */
export async function deposeUnTemoin(consultationId: string, f: File): Promise<string | null> {
  if (!supabase) return null;
  const ext = /png$/i.test(f.type) ? 'png' : /webp$/i.test(f.type) ? 'webp' : 'jpg';
  const chemin = `${consultationId}/${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage.from(COMPARTIMENT_DES_TEMOINS).upload(chemin, f, { contentType: f.type || 'image/jpeg', upsert: false });
  return error ? null : chemin;
}

/** Une adresse de lecture d'un témoin, valable une heure. */
export async function voirUnTemoin(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(COMPARTIMENT_DES_TEMOINS).createSignedUrl(chemin, 3600);
  return error ? null : data?.signedUrl ?? null;
}
