import { createStore, useStore, uid } from './store';
import { bindDocument } from './sync';
import { supabase } from './supabase';
import { niveauRetenu, peutValider, type Genre, type Niveau, type StatutDeTache, type Validation } from './ia-validation-pur';
import { objetPourClaude, type Personne } from './ia-anonymise-pur';
import type { Compteur } from './ia-budget-pur';
import type { BriefingRelu, MissionRelue } from './ia-relecture-pur';
import type { FaitsDuJour } from './ia-faits-pur';
import type { GenreDeBriefing } from './ia-prompts-pur';

/* LE CENTRE DE COMMANDE, CÔTÉ TRÔNE — 11 octobre 2026.

   Cahier « Maison MND AI Operating System », phase 1 (fondation) : missions
   et tâches, validation, mémoire, journal des actions, briefings, plafond.

   TOUT VIT DANS LES DOCUMENTS DE LA BASE, comme l'identité ou les offres :
   aucune table nouvelle, donc rien à coller pour que le Centre serve dès sa
   mise en ligne. Le Trône écrit les missions, les notes, les réglages, son
   journal et le relevé du jour ; la fonction `centre-de-commande` écrit les
   briefings, son propre journal et le compteur. Personne n'écrit le
   document de l'autre : aucun geste ne se perd dans un conflit.

   LE MINIMUM PART CHEZ CLAUDE : chaque texte passe par `objetPourClaude`,
   avec les noms des clientes que le Trône connaît, avant l'envoi. */

export type Tache = {
  id: string;
  titre: string;
  agent: string;
  genre: Genre;
  niveau: Niveau;
  statut: StatutDeTache;
  echeance?: string;
  pourquoi?: string;
  relectureExigee?: boolean;
  validation?: Validation;
  creeLe: string;
};

export type StatutDeMission = 'a-relire' | 'en-cours' | 'terminee' | 'abandonnee';

export type Mission = {
  id: string;
  titre: string;
  objectif: string;
  statut: StatutDeMission;
  source: 'main' | 'orchestrateur' | 'briefing';
  consigne?: string;
  creeLe: string;
  creePar: string;
  questions: string[];
  taches: Tache[];
};

export type Note = { id: string; rubrique: string; texte: string; par: string; le: string };

export type Reglages = { plafondUsd: number; automatique: boolean; notifier: boolean };

export type EntreeDuJournal = {
  id: string;
  quand: string;
  qui: string;
  quoi: string;
  pourquoi?: string;
  entree?: string;
  sortie?: string;
  statut: 'ok' | 'refus' | 'erreur' | 'attente';
  erreur?: string;
};

export type Briefing = {
  id: string;
  genre: GenreDeBriefing;
  jour: string;
  creeLe: string;
  source: 'auto' | 'clic';
  modele: string;
  consigne: string;
  cout: number;
  sortie: BriefingRelu;
};

export type Releve = { releveLe: string; jour: string; encaisse: NonNullable<FaitsDuJour['encaisse']> };

export const REGLAGES_PAR_DEFAUT: Reglages = { plafondUsd: 10, automatique: true, notifier: true };

export const missionsStore = createStore<Mission[]>('mnd_ia_missions', []);
export const notesStore = createStore<Note[]>('mnd_ia_memoire', []);
export const reglagesStore = createStore<Reglages>('mnd_ia_reglages', REGLAGES_PAR_DEFAUT);
export const journalStore = createStore<EntreeDuJournal[]>('mnd_ia_journal', []);
export const releveStore = createStore<Releve | null>('mnd_ia_etat', null);
/* Écrits par la fonction seule ; le Trône les lit. */
export const briefingsStore = createStore<Briefing[]>('mnd_ia_briefings', []);
export const journalServeurStore = createStore<EntreeDuJournal[]>('mnd_ia_journal_serveur', []);
export const compteurStore = createStore<Compteur>('mnd_ia_compteur', {});

bindDocument(missionsStore, 'mnd_ia_missions');
bindDocument(notesStore, 'mnd_ia_memoire');
bindDocument(reglagesStore, 'mnd_ia_reglages');
bindDocument(journalStore, 'mnd_ia_journal');
bindDocument(releveStore, 'mnd_ia_etat');
bindDocument(briefingsStore, 'mnd_ia_briefings');
bindDocument(journalServeurStore, 'mnd_ia_journal_serveur');
bindDocument(compteurStore, 'mnd_ia_compteur');

export const useMissions = () => useStore(missionsStore);
export const useNotes = () => useStore(notesStore);
export const useReglages = () => useStore(reglagesStore);
export const useJournalDuCentre = () => useStore(journalStore);
export const useJournalServeur = () => useStore(journalServeurStore);
export const useBriefings = () => useStore(briefingsStore);
export const useCompteur = () => useStore(compteurStore);
export const useReleve = () => useStore(releveStore);

const maintenant = () => new Date().toISOString();
const MAX_JOURNAL = 400;

/** Une ligne au journal : qui, quoi, quand, pourquoi, entrée, sortie, statut. */
export function journalise(e: Omit<EntreeDuJournal, 'id' | 'quand'>): void {
  const ligne: EntreeDuJournal = { id: uid(), quand: maintenant(), ...e };
  journalStore.set([ligne, ...journalStore.get()].slice(0, MAX_JOURNAL));
}

/** Le jour qui vient après `n` jours, en ISO. */
export function dansNJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le statut d'une tâche neuve : une tâche automatique est « à faire », les
    autres attendent un fondateur avant d'être faites. */
const statutNeuf = (niveau: Niveau): StatutDeTache => (niveau === 'auto' ? 'a-faire' : 'a-valider');

export function nouvelleTache(o: { titre: string; agent: string; genre: string; niveau?: string; echeance?: string; pourquoi?: string }): Tache {
  const niveau = niveauRetenu(o.genre, o.niveau);
  return {
    id: uid(),
    titre: o.titre.trim(),
    agent: o.agent,
    genre: o.genre as Genre,
    niveau,
    statut: statutNeuf(niveau),
    echeance: o.echeance,
    pourquoi: o.pourquoi,
    creeLe: maintenant(),
  };
}

export function creeLaMission(o: { titre: string; objectif: string; par: string; source?: Mission['source']; consigne?: string; questions?: string[]; taches?: Tache[] }): Mission {
  const m: Mission = {
    id: uid(),
    titre: o.titre.trim() || o.objectif.trim().slice(0, 80),
    objectif: o.objectif.trim(),
    statut: 'a-relire',
    source: o.source ?? 'main',
    consigne: o.consigne,
    creeLe: maintenant(),
    creePar: o.par,
    questions: o.questions ?? [],
    taches: o.taches ?? [],
  };
  missionsStore.set([m, ...missionsStore.get()]);
  journalise({ qui: o.par, quoi: `Mission créée : ${m.titre}`, pourquoi: m.objectif.slice(0, 200), statut: 'ok' });
  return m;
}

/** La mission que l'orchestrateur a découpée, posée « à relire ». */
export function missionDeLOrchestrateur(r: MissionRelue, jour: string, par: string, consigne: string): Mission {
  return creeLaMission({
    titre: r.titre,
    objectif: r.objectif,
    par,
    source: 'orchestrateur',
    consigne,
    questions: r.questions,
    taches: r.taches.map((t) => nouvelleTache({ ...t, echeance: dansNJours(jour, t.echeanceJours) })),
  });
}

const changeLaMission = (id: string, f: (m: Mission) => Mission) =>
  missionsStore.set(missionsStore.get().map((m) => (m.id === id ? f(m) : m)));

export function changeLeStatutDeMission(id: string, statut: StatutDeMission, par: string): void {
  changeLaMission(id, (m) => ({ ...m, statut }));
  journalise({ qui: par, quoi: `Mission ${statut === 'en-cours' ? 'lancée' : statut === 'terminee' ? 'terminée' : statut === 'abandonnee' ? 'abandonnée' : 'remise à relire'}`, entree: id, statut: 'ok' });
}

export function ajouteLaTache(missionId: string, t: Tache, par: string): void {
  changeLaMission(missionId, (m) => ({ ...m, taches: [...m.taches, t] }));
  journalise({ qui: par, quoi: `Tâche ajoutée : ${t.titre}`, entree: missionId, statut: 'ok' });
}

export function retireLaTache(missionId: string, tacheId: string, par: string): void {
  changeLaMission(missionId, (m) => ({ ...m, taches: m.taches.filter((t) => t.id !== tacheId) }));
  journalise({ qui: par, quoi: 'Tâche retirée', entree: tacheId, statut: 'ok' });
}

/** Avancer une tâche. Une tâche qui attend un fondateur ne se marque pas
    « faite » sans avoir été validée « oui ». */
export function avanceLaTache(missionId: string, tacheId: string, statut: StatutDeTache, par: string): { ok: boolean; pourquoi?: string } {
  const m = missionsStore.get().find((x) => x.id === missionId);
  const t = m?.taches.find((x) => x.id === tacheId);
  if (!m || !t) return { ok: false, pourquoi: 'Tâche introuvable.' };
  if ((statut === 'faite' || statut === 'en-cours') && t.niveau !== 'auto' && t.validation?.verdict !== 'oui') {
    journalise({ qui: par, quoi: `Refus : « ${t.titre} » attend la validation d’un fondateur`, entree: tacheId, statut: 'refus' });
    return { ok: false, pourquoi: 'Cette tâche attend d’abord la validation de Yéman ou Brice.' };
  }
  changeLaMission(missionId, (x) => ({ ...x, taches: x.taches.map((y) => (y.id === tacheId ? { ...y, statut } : y)) }));
  journalise({ qui: par, quoi: `Tâche « ${t.titre} » : ${statut}`, entree: tacheId, statut: 'ok' });
  return { ok: true };
}

/** La validation d'un fondateur. Seul le rôle `souverain` valide. */
export function valideLaTache(
  missionId: string, tacheId: string, verdict: 'oui' | 'non',
  qui: { user_id: string; name: string; role: string } | null, mot?: string,
): { ok: boolean; pourquoi?: string } {
  if (!qui || !peutValider(qui.role)) {
    journalise({ qui: qui?.name ?? 'inconnu', quoi: 'Refus : validation hors des fondateurs', entree: tacheId, statut: 'refus' });
    return { ok: false, pourquoi: 'Seuls Yéman et Brice valident.' };
  }
  const v: Validation = { par: qui.user_id, nom: qui.name, le: maintenant(), verdict, mot: mot?.trim() || undefined };
  changeLaMission(missionId, (m) => ({
    ...m,
    taches: m.taches.map((t) => (t.id === tacheId ? { ...t, validation: v, statut: verdict === 'oui' ? 'validee' : 'refusee' } : t)),
  }));
  journalise({ qui: qui.name, quoi: `${verdict === 'oui' ? 'Validé' : 'Refusé'}`, entree: tacheId, pourquoi: mot, statut: 'ok' });
  return { ok: true };
}

/* ── La mémoire, les réglages ───────────────────────────────────────────── */
export function ajouteUneNote(rubrique: string, texte: string, par: string): void {
  const n: Note = { id: uid(), rubrique: rubrique.trim(), texte: texte.trim(), par, le: maintenant() };
  if (!n.texte) return;
  notesStore.set([n, ...notesStore.get()]);
  journalise({ qui: par, quoi: 'Note ajoutée à la mémoire', entree: n.rubrique, sortie: n.texte.slice(0, 200), statut: 'ok' });
}

export function retireLaNote(id: string, par: string): void {
  notesStore.set(notesStore.get().filter((n) => n.id !== id));
  journalise({ qui: par, quoi: 'Note retirée de la mémoire', entree: id, statut: 'ok' });
}

export function changeLesReglages(r: Partial<Reglages>, par: string): void {
  const avant = { ...REGLAGES_PAR_DEFAUT, ...reglagesStore.get() };
  const apres = { ...avant, ...r };
  reglagesStore.set(apres);
  journalise({ qui: par, quoi: 'Réglages du Centre changés', entree: JSON.stringify(avant), sortie: JSON.stringify(apres), statut: 'ok' });
}

/** Le relevé de l'encaissé, pour le briefing du matin (la fonction ne
    recalcule pas l'argent : elle lit ce que le Trône a compté, et le dit
    avec son heure). Écrit au plus une fois par heure. */
export function noteLeReleve(r: Releve): void {
  const avant = releveStore.get();
  if (avant && avant.jour === r.jour && Date.parse(r.releveLe) - Date.parse(avant.releveLe) < 3_600_000
    && avant.encaisse.aCeJour === r.encaisse.aCeJour) return;
  releveStore.set(r);
}

/* ── L'appel à la fonction ──────────────────────────────────────────────── */
export type EtatDeLaFonction = { posee: boolean; version?: string; mois?: string; depense?: number; plafond?: number; raison?: string };

async function messageDeLaFonction(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response })?.context;
  let detail = '';
  if (ctx && typeof ctx.status === 'number') {
    if (ctx.status === 404) return 'La fonction « centre-de-commande » n’est pas encore collée dans Supabase.';
    try { detail = (JSON.parse(await ctx.clone().text()) as { detail?: string; error?: string }).detail ?? ''; } catch { /* pas du JSON */ }
    if (ctx.status === 403) return 'Réservé à Yéman et Brice.';
    if (ctx.status === 429) return detail || 'Le plafond du mois est atteint : les agents se sont arrêtés.';
  }
  if ((e as { name?: string })?.name === 'FunctionsFetchError') return 'La fonction « centre-de-commande » ne répond pas : elle n’est sans doute pas encore collée (dossier du bureau « A recoller - centre de commande »).';
  const d = detail.toLowerCase();
  if (d.includes('credit') || d.includes('billing')) return 'Le compte Anthropic n’a plus de crédit.';
  return detail ? `L’orchestrateur n’a pas répondu : ${detail}` : 'L’orchestrateur n’a pas répondu, réessayez dans un instant.';
}

/** L'appel à la fonction `centre-de-commande`, pour le Centre et l'atelier des contenus. */
export async function appelle<T>(corps: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Le Centre demande le serveur de la Maison.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Hors ligne : l’orchestrateur demande le réseau.');
  const { data, error } = await supabase.functions.invoke('centre-de-commande', { body: corps });
  if (error) throw new Error(await messageDeLaFonction(error));
  const d = data as { error?: string; detail?: string } & T;
  if (d?.error) throw new Error(d.detail || d.error);
  return d;
}

/** La fonction répond-elle ? Un appel sans Claude, qui ne coûte rien. */
export async function etatDeLaFonction(delaiMs = 10_000): Promise<EtatDeLaFonction> {
  /* UNE QUESTION QUI NE RÉPOND PAS SE DIT : hors ligne, supabase-js peut
     attendre sans fin un jeton qu'il ne rafraîchira pas. Passé le délai, on
     dit que l'orchestrateur ne répond pas, au lieu de « on interroge ». */
  const delai = new Promise<never>((_, refuse) => setTimeout(() => refuse(new Error('L’orchestrateur ne répond pas (réseau ou fonction pas encore posée).')), delaiMs));
  try {
    const r = await Promise.race([appelle<{ version: string; mois: string; depense: number; plafond: number }>({ mode: 'etat' }), delai]);
    return { posee: true, ...r };
  } catch (e) {
    return { posee: false, raison: e instanceof Error ? e.message : String(e) };
  }
}

/** Un briefing demandé d'un clic (la fonction le range elle-même). */
export async function demandeUnBriefing(genre: GenreDeBriefing, par: string): Promise<void> {
  journalise({ qui: par, quoi: `Briefing demandé (${genre})`, statut: 'attente' });
  try {
    await appelle({ mode: 'briefing', genre });
    journalise({ qui: par, quoi: `Briefing reçu (${genre})`, statut: 'ok' });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    journalise({ qui: par, quoi: `Briefing non reçu (${genre})`, statut: 'erreur', erreur: m });
    throw e;
  }
}

/** Un objectif en une phrase, découpé par l'orchestrateur : rien n'est
    écrit avant que la réponse soit relue ; la mission entre « à relire ». */
export async function decoupeLObjectif(objectif: string, clientes: readonly Personne[], jour: string, par: string): Promise<Mission> {
  const propre = objetPourClaude(objectif, clientes);
  journalise({ qui: par, quoi: 'Mission confiée à l’orchestrateur', entree: propre.slice(0, 300), statut: 'attente' });
  try {
    const r = await appelle<{ mission: MissionRelue; consigne: string }>({ mode: 'mission', objectif: propre });
    const m = missionDeLOrchestrateur(r.mission, jour, par, r.consigne);
    journalise({ qui: 'orchestrateur', quoi: `Mission découpée : ${m.taches.length} tâches`, sortie: m.titre, statut: 'ok' });
    return m;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    journalise({ qui: par, quoi: 'Mission non découpée', statut: 'erreur', erreur: msg });
    throw e;
  }
}
