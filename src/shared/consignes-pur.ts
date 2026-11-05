/* UNE CONSIGNE AUX ASSISTANTS, LOT 1 · 5 novembre 2026.

   Maquette « Une consigne aux assistants » (2AqfEEiPvpdfUUkXzs2XUC, copie
   public/maquette-consigne-aux-assistants.html), validée par Yéman le
   5 novembre 2026 (« construis »). Ses choix, au sélecteur :
     1. QUI ÉCRIT : Yéman et Brice, chaque consigne au nom de qui l'a écrite ;
     2. À QUI : à chaque assistant, choisi au-dessus du champ ; un assistant
        pas encore relié garde la consigne et l'écran le dit ; une consigne
        hors de son domaine passe à l'assistant concerné, et le fil le dit ;
     3. SEUL, puis il le dit : poser, déplacer ou annuler un rendez-vous,
        poser une note, un rappel, une recherche ; JAMAIS SANS LE OUI de la
        direction : un message vers quelqu'un, l'argent, un effacement (une
        carte, le mécanisme `decision.deposer`) ;
     4. « DÉFAIRE » pendant une heure, sur ce qu'un assistant a fait seul ;
     5. UNE NOTIFICATION seulement quand une consigne attend un oui.

   Ce module est PUR (ni Supabase, ni DOM) : il est partagé par la fonction
   `assistants-maison` (consigne.lire, consigne.repondre, consigne.passer),
   l'écran « Les assistants » (la carte « Écrire à un assistant ») et le banc
   `verifie-les-consignes`. La table est `assistants_consignes` (0162). */

import { aCotonou, etatDe, type Assistant, type ReglagesAssistants } from './assistants-pur';

/* ── Les statuts ─────────────────────────────────────────────────────── */

/* ⟨statuts-des-consignes⟩ La contrainte `assistants_consignes_statut` de 0162
   porte exactement cette liste : le banc tient les deux ensemble. */
export const STATUTS_DE_CONSIGNE = ['envoyee', 'lue', 'faite', 'oui-attendu', 'passee', 'en-attente'] as const;
export type StatutDeConsigne = typeof STATUTS_DE_CONSIGNE[number];

/** Ce que dit la pastille du fil (la maquette : Envoyée, Lue, Fait, Votre oui, Passée à…, En attente). */
export const STATUT_DIT: Record<StatutDeConsigne, string> = {
  envoyee: 'Envoyée', lue: 'Lue', faite: 'Fait', 'oui-attendu': 'Votre oui', passee: 'Passée', 'en-attente': 'En attente',
};

/** Pas encore lues par l'assistant qui la tient : ce que le guetteur signale. */
export const STATUTS_NOUVEAUX: readonly StatutDeConsigne[] = ['envoyee', 'passee'];
/** Ce que `consigne.lire` rend : tout ce qui n'est pas fini. Une consigne
    « oui attendu » revient avec l'état de sa carte, pour que l'assistant la
    close (« faite ») une fois le oui exécuté. */
export const STATUTS_A_LIRE: readonly StatutDeConsigne[] = ['envoyee', 'passee', 'lue', 'en-attente', 'oui-attendu'];
/** Ce qu'un assistant peut encore traiter ou passer à un autre. */
export const STATUTS_OUVERTS: readonly StatutDeConsigne[] = ['envoyee', 'passee', 'lue', 'en-attente'];
/** Ce qu'un assistant répond par `consigne.repondre`. */
export const STATUTS_DE_LA_REPONSE: readonly StatutDeConsigne[] = ['faite', 'oui-attendu', 'en-attente'];

export const estStatutDeConsigne = (s: unknown): s is StatutDeConsigne =>
  typeof s === 'string' && (STATUTS_DE_CONSIGNE as readonly string[]).includes(s);
export const estNouvelle = (statut: string | null | undefined): boolean =>
  (STATUTS_NOUVEAUX as readonly string[]).includes(String(statut ?? ''));

/** Les mots de la ligne de commande, et leurs synonymes. */
export function statutDeLaReponse(mot: unknown): StatutDeConsigne | null {
  const m = String(mot ?? '').trim().toLowerCase();
  if (m === 'faite' || m === 'fait') return 'faite';
  if (m === 'oui-attendu' || m === 'oui') return 'oui-attendu';
  if (m === 'en-attente' || m === 'attente') return 'en-attente';
  return null;
}

/* ── Les bornes ──────────────────────────────────────────────────────── */

export const TEXTE_AU_PLUS = 1000;
export const REPONSE_AU_PLUS = 600;
export const MOT_DE_PASSE_AU_PLUS = 200;
export const GESTES_A_DEFAIRE_AU_PLUS = 5;
export const LIGNE_DE_NOTE_AU_PLUS = 300;
export const CONSIGNES_LUES_AU_PLUS = 50;
/** Défaire se tient UNE heure après « faite ». */
export const DEFAIRE_PENDANT_MS = 60 * 60_000;
/** Le guetteur regarde toutes les 60 secondes : au-delà de trois minutes, il ne regarde plus. */
export const GUETTEUR_FRAIS_MS = 3 * 60_000;

const sansControle = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

/** Le texte d'une consigne, tel qu'on l'écrit ou le dicte : un à mille caractères. */
export function texteDeConsigne(t: unknown): { ok: true; texte: string } | { ok: false; motif: string } {
  const x = sansControle(String(t ?? '')).replace(/\r\n/g, '\n').trim();
  if (!x) return { ok: false, motif: 'texte-vide' };
  if (x.length > TEXTE_AU_PLUS) return { ok: false, motif: 'texte-trop-long' };
  return { ok: true, texte: x };
}

/* ── Défaire : ce qu'un assistant a fait seul ────────────────────────── */

/* Les gestes que la fonction rend avec chaque geste fait seul (`defaire` dans
   la réponse de rdv.poser, rdv.deplacer, rdv.annuler et note.poser) ; l'assistant
   les recopie dans `consigne repondre --defaire`. L'écran les défait par les
   magasins du Trône, jamais par la fonction : Défaire est un geste de la
   direction, et il s'écrit au Journal des gestes à son nom. */
export type GesteADefaire =
  | { genre: 'rdv-pose'; rdvId: string }
  | { genre: 'rdv-deplace'; rdvId: string; avant: { date: string; time: string }; apres: { date: string; time: string } }
  | { genre: 'rdv-annule'; rdvId: string; avant: { status: string } }
  | { genre: 'note'; rdvId: string; ligne: string };

export const GENRES_A_DEFAIRE = ['rdv-pose', 'rdv-deplace', 'rdv-annule', 'note'] as const;
const STATUTS_D_AVANT = ['confirmé', 'en attente', 'honoré'];

export const defaireDeLaPose = (rdvId: string): GesteADefaire => ({ genre: 'rdv-pose', rdvId });
export const defaireDuDeplacement = (rdvId: string, avant: { date: string; time: string }, apres: { date: string; time: string }): GesteADefaire =>
  ({ genre: 'rdv-deplace', rdvId, avant: { date: avant.date, time: avant.time }, apres: { date: apres.date, time: apres.time } });
export const defaireDeLAnnulation = (rdvId: string, statutAvant: string): GesteADefaire => ({ genre: 'rdv-annule', rdvId, avant: { status: statutAvant } });
export const defaireDeLaNote = (rdvId: string, ligne: string): GesteADefaire => ({ genre: 'note', rdvId, ligne });

const idSain = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v : null);
const dateSaine = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const heureSaine = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

/** Ce que l'assistant donne à défaire : un geste ou une liste, relus un à un. */
export function lisLeDefaire(v: unknown): { ok: true; gestes: GesteADefaire[] } | { ok: false; motif: string } {
  if (v === undefined || v === null) return { ok: true, gestes: [] };
  const liste = Array.isArray(v) ? v : [v];
  if (liste.length > GESTES_A_DEFAIRE_AU_PLUS) return { ok: false, motif: `plus de ${GESTES_A_DEFAIRE_AU_PLUS} gestes à défaire` };
  const gestes: GesteADefaire[] = [];
  for (const brut of liste) {
    const g = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
    const rdvId = idSain(g.rdvId);
    if (!rdvId) return { ok: false, motif: 'un geste sans rendez-vous lisible' };
    if (g.genre === 'rdv-pose') { gestes.push(defaireDeLaPose(rdvId)); continue; }
    if (g.genre === 'rdv-deplace') {
      const av = (g.avant ?? {}) as Record<string, unknown>; const ap = (g.apres ?? {}) as Record<string, unknown>;
      const d1 = dateSaine(av.date); const t1 = heureSaine(av.time); const d2 = dateSaine(ap.date); const t2 = heureSaine(ap.time);
      if (!d1 || !t1 || !d2 || !t2) return { ok: false, motif: 'un déplacement sans son avant et son après' };
      gestes.push(defaireDuDeplacement(rdvId, { date: d1, time: t1 }, { date: d2, time: t2 }));
      continue;
    }
    if (g.genre === 'rdv-annule') {
      const s = String(((g.avant ?? {}) as Record<string, unknown>).status ?? '');
      if (!STATUTS_D_AVANT.includes(s)) return { ok: false, motif: 'une annulation sans le statut d avant' };
      gestes.push(defaireDeLAnnulation(rdvId, s));
      continue;
    }
    if (g.genre === 'note') {
      const ligne = typeof g.ligne === 'string' ? g.ligne.trim() : '';
      if (!ligne || ligne.length > LIGNE_DE_NOTE_AU_PLUS || ligne.includes('\n')) return { ok: false, motif: 'une note sans sa ligne' };
      gestes.push(defaireDeLaNote(rdvId, ligne));
      continue;
    }
    return { ok: false, motif: 'un genre de geste inconnu' };
  }
  return { ok: true, gestes };
}

/* ── La réponse d'un assistant ───────────────────────────────────────── */

export type ReponseLue = { statut: StatutDeConsigne; reponse: string; gestes: GesteADefaire[]; decisionId: string | null };

/** `consigne.repondre` : qui peut passer à quoi, et avec quoi. */
export function reponseDeConsigne(o: { actuel: string; statut: unknown; reponse: unknown; defaire?: unknown; decision?: unknown })
  : { ok: true; r: ReponseLue } | { ok: false; motif: string; detail?: string } {
  const statut = statutDeLaReponse(o.statut);
  if (!statut) return { ok: false, motif: 'statut-inconnu', detail: 'faite, oui-attendu ou en-attente' };
  const ouvert = (STATUTS_OUVERTS as readonly string[]).includes(o.actuel);
  /* Après le oui (ou le non) de la direction, la carte exécutée : l'assistant clôt. */
  const apresLeOui = o.actuel === 'oui-attendu' && (statut === 'faite' || statut === 'en-attente');
  if (!ouvert && !apresLeOui) return { ok: false, motif: 'deja-close', detail: `la consigne est ${STATUT_DIT[o.actuel as StatutDeConsigne] ?? o.actuel}` };
  const reponse = sansControle(String(o.reponse ?? '')).trim();
  if (!reponse) return { ok: false, motif: 'reponse-vide' };
  if (reponse.length > REPONSE_AU_PLUS) return { ok: false, motif: 'reponse-trop-longue', detail: `${REPONSE_AU_PLUS} caractères au plus` };
  const d = lisLeDefaire(o.defaire);
  if (!d.ok) return { ok: false, motif: 'defaire-refuse', detail: d.motif };
  /* On ne défait que ce qu'un assistant a fait SEUL : jamais ce qu'un oui a permis. */
  if (d.gestes.length && (statut !== 'faite' || o.actuel === 'oui-attendu')) return { ok: false, motif: 'defaire-hors-fait', detail: 'défaire ne vaut que pour ce qui est fait seul' };
  const decisionId = typeof o.decision === 'string' && o.decision.trim() ? o.decision.trim() : null;
  if (statut === 'oui-attendu' && !decisionId) return { ok: false, motif: 'decision-manquante', detail: 'la carte déposée par decision deposer' };
  return { ok: true, r: { statut, reponse, gestes: d.gestes, decisionId } };
}

export const peutPasser = (actuel: string): boolean => (STATUTS_OUVERTS as readonly string[]).includes(actuel);

/* ── La consigne telle que l'écran la lit ────────────────────────────── */

export type Consigne = {
  id: string;
  de: string;
  deUserId?: string | null;
  pour: string;
  texte: string;
  statut: StatutDeConsigne;
  reponse?: string | null;
  defaire?: GesteADefaire[] | null;
  decisionId?: string | null;
  ecriteLe: string;
  lueLe?: string | null;
  faiteLe?: string | null;
  passeeDe?: string | null;
  passeeLe?: string | null;
  passeeMot?: string | null;
  notifieLe?: string | null;
  defaiteLe?: string | null;
  defaitePar?: string | null;
};

export const defaireJusqua = (faiteLe: string | null | undefined): number | null => {
  const t = Date.parse(faiteLe ?? '');
  return Number.isFinite(t) ? t + DEFAIRE_PENDANT_MS : null;
};

/** « Défaire » se montre : fait seul, des gestes à défaire, pas encore défait, dans l'heure. */
export function peutDefaire(c: Pick<Consigne, 'statut' | 'defaire' | 'defaiteLe' | 'faiteLe'>, maintenantMs: number): boolean {
  if (c.statut !== 'faite' || c.defaiteLe) return false;
  if (!Array.isArray(c.defaire) || c.defaire.length === 0) return false;
  const fin = defaireJusqua(c.faiteLe);
  return fin !== null && maintenantMs < fin;
}

/* ── Le plan du défaire, contre les rendez-vous tels qu'ils sont ─────── */

export type RdvLu = { id: string; date: string; time: string; status: string; note?: string | null };
/** Les statuts d'un rendez-vous au Trône (`Appointment.status`, agenda.ts). */
export type StatutDuRdv = 'confirmé' | 'en attente' | 'honoré' | 'annulé';
export type ChangementDuDefaire = { rdvId: string; apres: { date?: string; time?: string; status?: StatutDuRdv; note?: string; annuleeLe?: string; annuleePar?: 'maison' } };

/** Ce que Défaire changera, geste par geste, du dernier au premier. Un geste
    déjà défait (la note retirée à la main, le rendez-vous revenu) se passe ;
    un rendez-vous qui a bougé autrement depuis BLOQUE tout : rien n'est
    défait, et l'écran dit pourquoi. Tout ou rien. */
export function planDuDefaire(gestes: readonly GesteADefaire[], rdvs: Readonly<Record<string, RdvLu | undefined>>, maintenantMs: number)
  : { ok: true; changements: ChangementDuDefaire[]; dits: string[] } | { ok: false; pourquoi: string[] } {
  const travail: Record<string, RdvLu> = {};
  const touches = new Set<string>();
  const pourquoi: string[] = [];
  const dits: string[] = [];
  for (const g of [...gestes].reverse()) {
    const lu = travail[g.rdvId] ?? (rdvs[g.rdvId] ? { ...(rdvs[g.rdvId] as RdvLu) } : undefined);
    /* Absent du poste : peut-être pas encore arrivé par la synchro. On ne
       devine jamais qu'il est déjà défait. */
    if (!lu) { pourquoi.push('le rendez-vous n’est pas encore sur ce poste : relisez le Carnet, puis recommencez'); continue; }
    if (g.genre === 'rdv-pose') {
      if (lu.status === 'annulé') continue;
      if (lu.status === 'honoré') { pourquoi.push('le rendez-vous posé est déjà honoré'); continue; }
      travail[g.rdvId] = { ...lu, status: 'annulé' }; touches.add(g.rdvId);
      dits.push(`le rendez-vous posé du ${jourDit(lu.date)} à ${heureDite(lu.time)} est annulé`);
      continue;
    }
    if (g.genre === 'rdv-deplace') {
      if (lu.date === g.avant.date && lu.time === g.avant.time) continue;
      if (lu.date !== g.apres.date || lu.time !== g.apres.time) {
        pourquoi.push(`le rendez-vous a encore bougé depuis : il est au ${jourDit(lu.date)} à ${heureDite(lu.time)}`);
        continue;
      }
      travail[g.rdvId] = { ...lu, date: g.avant.date, time: g.avant.time }; touches.add(g.rdvId);
      dits.push(`le rendez-vous revient au ${jourDit(g.avant.date)} à ${heureDite(g.avant.time)}`);
      continue;
    }
    if (g.genre === 'rdv-annule') {
      if (lu.status === g.avant.status) continue;
      if (lu.status !== 'annulé') { pourquoi.push(`le rendez-vous n’est plus annulé : il est ${lu.status}`); continue; }
      travail[g.rdvId] = { ...lu, status: g.avant.status }; touches.add(g.rdvId);
      dits.push(`le rendez-vous du ${jourDit(lu.date)} à ${heureDite(lu.time)} redevient ${g.avant.status}`);
      continue;
    }
    /* La note : la DERNIÈRE ligne identique s'en va, les autres restent. */
    const lignes = String(lu.note ?? '').split('\n');
    const i = lignes.lastIndexOf(g.ligne);
    if (i < 0) continue;
    lignes.splice(i, 1);
    travail[g.rdvId] = { ...lu, note: lignes.join('\n') }; touches.add(g.rdvId);
    dits.push('la note posée sur le rendez-vous est retirée');
  }
  if (pourquoi.length) return { ok: false, pourquoi };
  const quand = new Date(maintenantMs).toISOString();
  const changements: ChangementDuDefaire[] = [...touches].map((rdvId) => {
    const avant = rdvs[rdvId]; const apres = travail[rdvId];
    const patch: ChangementDuDefaire['apres'] = {};
    if (!avant || avant.date !== apres.date) patch.date = apres.date;
    if (!avant || avant.time !== apres.time) patch.time = apres.time;
    if (!avant || avant.status !== apres.status) {
      patch.status = apres.status as StatutDuRdv;
      if (apres.status === 'annulé') { patch.annuleeLe = quand; patch.annuleePar = 'maison'; }
    }
    if (!avant || String(avant.note ?? '') !== String(apres.note ?? '')) patch.note = String(apres.note ?? '');
    return { rdvId, apres: patch };
  });
  return { ok: true, changements, dits };
}

/* ── Le temps, à Cotonou, toujours avec l'année sur une date entière ─── */

const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 10:00 » → « 10 h », « 14:30 » → « 14 h 30 ». */
export const heureDite = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  return m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`;
};
/** « jeudi 26 novembre 2026 » */
export const jourDit = (dateISO: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO ?? '')) return dateISO ?? '';
  const d = new Date(`${dateISO}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS_LONGS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const heureDeLInstant = (ms: number): string => {
  const c = aCotonou(ms);
  return c.minute ? `${c.heure} h ${String(c.minute).padStart(2, '0')}` : `${c.heure} h`;
};
/** « à 11 h 52 », « hier à 11 h 52 », « le 3 novembre 2026 à 11 h 52 ». */
export function momentDit(iso: string | null | undefined, maintenantMs: number): string {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '';
  const jour = aCotonou(ms).dateISO;
  const h = heureDeLInstant(ms);
  if (jour === aCotonou(maintenantMs).dateISO) return `à ${h}`;
  if (jour === aCotonou(maintenantMs - 86_400_000).dateISO) return `hier à ${h}`;
  const d = new Date(`${jour}T12:00:00Z`);
  return `le ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS_LONGS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${h}`;
}

/* ── Qui veille ──────────────────────────────────────────────────────── */

/** Les assistantes : le registre dit « l'assistante de Yéman ». Les autres s'accordent au masculin. */
const FEMININS = new Set(['opale']);
export const accorde = (id: string, mot: string): string => (FEMININS.has(id) ? `${mot}e` : mot);

export type Veille = { cle: 'veille' | 'eveille' | 'endormi' | 'empeche' | 'pas-relie'; mot: string; phrase: string };

/** Ce que la carte dit de l'assistant choisi, au-dessus du champ. */
export function veilleDe(
  a: (Pick<Assistant, 'id' | 'nom' | 'aUnJeton' | 'vuLe' | 'etat'> & { guetteLe?: string | null }) | null,
  p: { id: string; nom: string; tient: string },
  maintenantMs: number,
  r: Required<ReglagesAssistants>,
): Veille {
  if (!a || !a.aUnJeton) {
    return { cle: 'pas-relie', mot: p.tient, phrase: `${p.nom} n’est pas encore ${accorde(p.id, 'relié')}, sa consigne attend.` };
  }
  const guette = Date.parse(a.guetteLe ?? '');
  if (Number.isFinite(guette) && maintenantMs - guette < GUETTEUR_FRAIS_MS) {
    const min = Math.max(0, Math.floor((maintenantMs - guette) / 60_000));
    return { cle: 'veille', mot: 'veille', phrase: `${a.nom} veille, ${accorde(p.id, 'vu')} ${min < 1 ? 'à l’instant' : `il y a ${min} min`} : la consigne est vue en une minute environ.` };
  }
  const e = etatDe(a, maintenantMs, r);
  if (e.etat === 'eveille') return { cle: 'eveille', mot: accorde(p.id, 'éveillé'), phrase: `${a.nom} est ${accorde(p.id, 'éveillé')}, sans guetteur : la consigne est lue à son prochain passage.` };
  if (e.etat === 'empeche') return { cle: 'empeche', mot: accorde(p.id, 'empêché'), phrase: `${a.nom} est ${e.detail.replace(/^empêché/, accorde(p.id, 'empêché'))} : sa consigne attend.` };
  if (e.detail === 'jamais passé') return { cle: 'endormi', mot: accorde(p.id, 'endormi'), phrase: `${a.nom} n’est jamais ${accorde(p.id, 'passé')} au Trône : sa consigne attend son réveil.` };
  return { cle: 'endormi', mot: /au repos/.test(e.detail) ? 'au repos' : accorde(p.id, 'endormi'), phrase: `${a.nom} est ${e.detail.replace(/^endormi/, accorde(p.id, 'endormi'))} : sa consigne attend son réveil.` };
}

/** L'ordre du choix : mes assistants reliés, les autres reliés, puis la
    caisse, l'équipe et les clientes (la maquette), puis le reste derrière
    « Les autres… ». Quatre se montrent d'emblée. */
export function ordreDuChoix<P extends { id: string }>(
  pros: readonly P[], assistants: readonly Pick<Assistant, 'id' | 'aUnJeton' | 'porteurUserId'>[], monUserId: string | null, montres = 4,
): { visibles: P[]; autres: P[] } {
  const relie = (id: string) => assistants.find((a) => a.id === id)?.aUnJeton === true;
  const mien = (id: string) => !!monUserId && assistants.find((a) => a.id === id)?.porteurUserId === monUserId;
  const MAQUETTE = ['grenat', 'topaze', 'perle'];
  const rang = (p: P): number => {
    if (relie(p.id) && mien(p.id)) return 0;
    if (relie(p.id)) return 1;
    const i = MAQUETTE.indexOf(p.id);
    return i >= 0 ? 2 + i : 10;
  };
  const tries = pros.map((p, i) => ({ p, i })).sort((x, y) => rang(x.p) - rang(y.p) || x.i - y.i).map((x) => x.p);
  return { visibles: tries.slice(0, montres), autres: tries.slice(montres) };
}

/* ── Une ligne du fil ────────────────────────────────────────────────── */

export type LigneDuFil = { pastille: string; ton: 'fait' | 'attente' | 'alerte'; ligne: string; attend: string | null };

/** La pastille, la petite ligne des heures, et ce qui attend. */
export function ligneDuFil(c: Consigne, ctx: { nomDe: (id: string) => string; prenomDe: (nom: string) => string; veilleDuPour: Veille | null }, maintenantMs: number): LigneDuFil {
  const pour = ctx.nomDe(c.pour);
  const morceaux = [`À ${pour}`, `de ${ctx.prenomDe(c.de)}`, `envoyée ${momentDit(c.ecriteLe, maintenantMs)}`];
  if (c.passeeLe && c.passeeDe) morceaux.push(`passée par ${ctx.nomDe(c.passeeDe)} ${momentDit(c.passeeLe, maintenantMs)}`);
  if (c.lueLe) morceaux.push(`lue ${momentDit(c.lueLe, maintenantMs)}`);
  if (c.faiteLe && c.statut === 'faite') morceaux.push(`faite ${momentDit(c.faiteLe, maintenantMs)}`);
  if (c.defaiteLe) morceaux.push(`défaite ${momentDit(c.defaiteLe, maintenantMs)}`);
  const ligne = morceaux.join(' · ');
  if (c.defaiteLe) return { pastille: 'Défait', ton: 'attente', ligne, attend: null };
  const attend = (c.statut === 'envoyee' || c.statut === 'passee') && ctx.veilleDuPour && ctx.veilleDuPour.cle !== 'veille'
    ? ctx.veilleDuPour.phrase : null;
  if (c.statut === 'passee') return { pastille: `Passée à ${pour}`, ton: 'attente', ligne, attend };
  if (c.statut === 'faite') return { pastille: STATUT_DIT.faite, ton: 'fait', ligne, attend: null };
  if (c.statut === 'oui-attendu') return { pastille: STATUT_DIT['oui-attendu'], ton: 'alerte', ligne, attend: null };
  return { pastille: STATUT_DIT[c.statut] ?? c.statut, ton: 'attente', ligne, attend };
}

/* ── Le guetteur et la notification ──────────────────────────────────── */

/** Le début d'un texte sur une ligne : soixante caractères au plus. */
export const debutDuTexte = (t: string, auPlus = 60): string => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  return x.length > auPlus ? `${x.slice(0, auPlus - 1).trimEnd()}…` : x;
};
/** UNE ligne par consigne nouvelle (le guetteur la recopie, le banc les compare). */
export const ligneDuGuetteur = (c: { id: string; pour: string; texte: string }): string => `consigne ${c.id} pour ${c.pour} : ${debutDuTexte(c.texte)}`;

/** La notification d'une consigne qui attend un oui : jamais un nom de cliente, jamais un extrait. */
export const notificationDuOui = (nomDeLAssistant: string): { titre: string; corps: string } =>
  ({ titre: 'Une consigne attend votre oui', corps: `${nomDeLAssistant} a préparé une carte dans Les assistants.` });
