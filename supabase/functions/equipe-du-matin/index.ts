// equipe-du-matin - les rendez-vous du jour a l'equipe, a 6 h, et la question de 9 h ou 10 h.

/* ══════════════════════════════════════════════════════════════════
   L'ÉQUIPE DU MATIN · 21 novembre 2026.

   « Je veux que Perle envoie automatiquement, chaque jour à 6 h, les
   rendez-vous du jour à l'équipe (Gérard, Nassim et Aimé). Quand il n'y a
   pas de rendez-vous, aucun message. Tu peux préparer des messages pour
   venir plus tard, à 9 h au lieu de 8 h, mais ils ne partent que quand je
   donne la permission, les jours sans rendez-vous avant 11 h » (Yéman),
   puis « donne 2 choix, parfois 9 h ou 10 h », sur WhatsApp et au Trône.

   TROIS PORTES, une fonction :
     · le cron (05:00 UTC, 6 h à Cotonou), clé service, { source: 'cron' } :
       la journée à chacune des personnes choisies, et la question à la
       direction quand rien n'est avant 11 h ;
     · le webhook, clé service, { geste: 'repondre', numero, heure, jour } :
       le bouton « À 9 h » ou « À 10 h » ; seul le numéro à qui la question
       est partie répond, et la fonction lui écrit ce qu'elle a fait ;
     · le Trône, une session de la DIRECTION (`est_direction`),
       { geste: 'repondre', heure, branchId } : la même réponse, d'un toucher.
   La réponse se juge à son arrivée (`jugeLaReponse`) : avant la limite
   (7 h 30), une fois, et seulement si aucun rendez-vous n'est arrivé avant
   11 h. Elle pose d'abord le mur du calendrier (`blocages`, jusqu'à 9 h 30
   ou 10 h 30 : plus personne ne réserve avant), puis prévient l'équipe.

   Les messages passent par la salle d'attente, type `equipe-du-matin`, que
   le facteur laisse traverser ses heures calmes. Le facteur muet, ils
   partent d'ici, comme la fête de couronne.

   LES MODÈLES se nomment par leurs secrets, posés une fois approuvés chez
   Meta : WA_TEMPLATE_PLANNING_DU_JOUR, WA_TEMPLATE_EQUIPE_PLUS_TARD,
   WA_TEMPLATE_VENIR_PLUS_TARD. Un secret absent tait sa partie, rien
   d'autre ; la question ne part que si les deux derniers sont posés.

   Les règles vivent dans `src/shared/equipe-du-matin-pur.ts`, recopiées ici
   entre leurs repères par `scripts/terminer-copie-serveur.mjs` (R8 du banc
   des douze lunes). Le banc : `scripts/verifie-l-equipe-du-matin.mjs`.

   AUCUN SECRET ICI. Déploiement : `mise-en-ligne.mjs fonction
   equipe-du-matin --jwt non` (le cron et le webhook n'ont pas de session ;
   la porte du Trône juge la session elle-même).
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '2026-11-21-a · la journée à l’équipe à 6 h, et « À 9 h » ou « À 10 h » à la direction quand rien n’est avant 11 h';
/** La devise de la Maison (DEVISE_COMPLETE, shared/identite) ; le banc la compare. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';
const CLE_DE_L_ETAT = 'mnd_equipe_du_matin';
const DOCUMENTS_DU_MATIN = ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_planning', 'mnd_facteur', CLE_DE_L_ETAT];
const ENVOI_MAX_MS = 10_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'content-type': 'application/json' } });

/* ⟨bouton-de-l-equipe⟩ */
/** LE BOUTON DE LA DIRECTION, « À 9 h » ou « À 10 h » : la réponse rapide du
    modèle porte le jour et l'heure ; le webhook la lit et la rend à la
    fonction `equipe-du-matin`, qui juge. */
export const PREFIXE_DU_BOUTON_DE_L_EQUIPE = 'EQUIPE_TARD';
export const RE_BOUTON_DE_L_EQUIPE = /^EQUIPE_TARD:(\d{4}-\d{2}-\d{2}):(9|10)$/;
export const chargeDuBoutonDeLEquipe = (jour: string, heure: number): string => `${PREFIXE_DU_BOUTON_DE_L_EQUIPE}:${jour}:${heure}`;
export function lisLeBoutonDeLEquipe(id: unknown): { jour: string; heure: number } | null {
  const m = RE_BOUTON_DE_L_EQUIPE.exec(String(id ?? ''));
  return m ? { jour: m[1], heure: Number(m[2]) } : null;
}
/* ⟨/bouton-de-l-equipe⟩ */

/* ⟨equipe-du-matin⟩ */
/** Le type des lignes d'envoi : le facteur le laisse traverser les heures calmes. */
export const TYPE_DE_L_EQUIPE_DU_MATIN = 'equipe-du-matin';
export const PAR_QUI_DE_L_EQUIPE_DU_MATIN = 'Perle · l’équipe du matin';
/** Le passage du matin ne dépose qu'entre 5 h 45 et 8 h (Cotonou) : relancé
    l'après-midi, il ne réveillerait personne avec la journée du matin. */
export const PASSAGE_DES_MIN = 5 * 60 + 45;
export const PASSAGE_JUSQU_A_MIN = 8 * 60;
/** Rien avant 11 h : l'équipe peut venir plus tard. */
export const RIEN_AVANT_MIN = 11 * 60;
/** Les deux heures proposées (« donne 2 choix, parfois 9 h ou 10 h »). */
export const HEURES_PLUS_TARD: readonly number[] = [9, 10];
/** L'heure d'arrivée habituelle. */
export const HEURE_HABITUELLE = 8;
/** Sans réponse à cette heure, l'équipe vient à 8 h. */
export const LIMITE_PAR_DEFAUT = '07:30';
/** Le premier rendez-vous vient une demi-heure après l'arrivée (la règle de 08:30). */
export const INSTALLATION_MIN = 30;
/** La journée tient dans une variable de modèle ; au-delà, « et N autres au Trône ». */
export const LISTE_AU_PLUS = 640;
/** Les rendez-vous qui comptent : ni annulés, ni à reprogrammer. */
export const STATUTS_QUI_COMPTENT: readonly string[] = ['confirmé', 'en attente', 'honoré'];
/** Le maître qui ne se dit pas : la plupart des rendez-vous sont chez Team. */
export const MAITRE_QUI_NE_SE_DIT_PAS = 'Team';
/** Le mot du mur, lisible par une cliente (Ma Couronne lit les blocages). */
export const MOTIF_DU_MUR = 'Ouverture plus tard';
/** Le nombre de matins gardés dans le document d'état. */
export const MATINS_GARDES = 14;

export type DestinataireDuMatin = { staffId: string; appel?: string };
/** `mnd_settings.equipeDuMatin`, écrit dans les Réglages de Perle. */
export type ReglagesDeLEquipeDuMatin = { actif?: boolean; destinataires?: DestinataireDuMatin[]; decideur?: string; limite?: string };
export type ReglagesDuMatinLus = { actif: boolean; destinataires: DestinataireDuMatin[]; decideur: string; limite: string };

const objetDuMatin = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const propreDuMatin = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();
const HHMM_DU_MATIN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Les réglages tels que la base les garde ; une valeur mal écrite se lit
    comme absente. Éteint tant que la direction ne l'a pas allumé. */
export function reglagesDuMatin(brut: unknown): ReglagesDuMatinLus {
  const o = objetDuMatin(brut);
  const vus = new Set<string>();
  const destinataires: DestinataireDuMatin[] = [];
  for (const d of Array.isArray(o.destinataires) ? o.destinataires : []) {
    const x = objetDuMatin(d);
    const staffId = typeof x.staffId === 'string' ? x.staffId.trim() : '';
    if (!staffId || vus.has(staffId) || destinataires.length >= 12) continue;
    vus.add(staffId);
    const appel = propreDuMatin(x.appel).slice(0, 40);
    destinataires.push(appel ? { staffId, appel } : { staffId });
  }
  const l = typeof o.limite === 'string' ? o.limite.trim() : '';
  const limite = HHMM_DU_MATIN.test(l) && l >= '06:00' && l <= '09:00' ? l : LIMITE_PAR_DEFAUT;
  return { actif: o.actif === true, destinataires, decideur: typeof o.decideur === 'string' ? o.decideur.trim() : '', limite };
}

/* ── L'HEURE DE COTONOU (UTC+1, sans heure d'été) ── */
export const DECALAGE_DE_COTONOU_H = 1;
const aCotonouDuMatin = (ms: number): Date => new Date(ms + DECALAGE_DE_COTONOU_H * 3_600_000);
export const jourDeCotonou = (ms: number): string => aCotonouDuMatin(ms).toISOString().slice(0, 10);
export const minuteDeCotonou = (ms: number): number => {
  const d = aCotonouDuMatin(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
/** L'instant d'une heure « HH:MM » de Cotonou, ce jour-là. */
export function instantDeCotonou(jour: string, hhmm: string): number {
  const [a, m, j] = jour.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return Date.UTC(a, m - 1, j, h, mi) - DECALAGE_DE_COTONOU_H * 3_600_000;
}
export const estLHeureDuPassage = (ms: number): boolean => {
  const m = minuteDeCotonou(ms);
  return m >= PASSAGE_DES_MIN && m < PASSAGE_JUSQU_A_MIN;
};

const JOURS_DU_MATIN = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DU_MATIN = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const utcDuJour = (jour: string): Date => {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j));
};
/** « samedi 22 novembre 2026 » : la date dite avec l'année, comme partout à la Maison. */
export function jourDitDuMatin(jour: string): string {
  const d = utcDuJour(jour);
  const j = d.getUTCDate();
  return `${JOURS_DU_MATIN[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DU_MATIN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** « 8 h 30 », « 11 h ». */
export const heureDuMatin = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
};

/* ── LES RENDEZ-VOUS DU JOUR ── */
export type RdvDuMatin = {
  id?: unknown; branchId?: unknown; date?: unknown; time?: unknown; status?: unknown;
  clientId?: unknown; clientName?: unknown; serviceIds?: unknown; master?: unknown;
};
export const minuteDuRdv = (time: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!m) return null;
  const n = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && n < 24 * 60 ? n : null;
};
export function rendezVousDuJour<R extends RdvDuMatin>(rdvs: readonly R[], jour: string, branchId: string): R[] {
  return rdvs
    .filter((r) => String(r.date ?? '') === jour && String(r.branchId ?? '') === branchId && STATUTS_QUI_COMPTENT.includes(String(r.status ?? '')))
    .sort((a, b) => (minuteDuRdv(a.time) ?? -1) - (minuteDuRdv(b.time) ?? -1) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}
/** Le premier rendez-vous avant 11 h, ou null. Une heure illisible compte
    comme avant : on ne promet pas une matinée qu'on ne sait pas lire. */
export function premierAvant<R extends RdvDuMatin>(rdvs: readonly R[], limiteMin: number = RIEN_AVANT_MIN): R | null {
  return rdvs.find((r) => { const m = minuteDuRdv(r.time); return m === null || m < limiteMin; }) ?? null;
}
export const rienAvant = (rdvs: readonly RdvDuMatin[], limiteMin: number = RIEN_AVANT_MIN): boolean => premierAvant(rdvs, limiteMin) === null;

/** « Awa B. » : le prénom d'usage, et l'initiale du dernier mot du nom. */
export function nomCourtDuMatin(nom: unknown, prenom?: unknown): string {
  const mots = propreDuMatin(nom).split(' ').filter(Boolean);
  const p = propreDuMatin(prenom) || mots[0] || '';
  const dernier = mots.length >= 2 ? mots[mots.length - 1] : '';
  const initiale = dernier && !p.split(' ').includes(dernier) ? `${dernier.charAt(0).toLocaleUpperCase('fr')}.` : '';
  return propreDuMatin(`${p} ${initiale}`);
}

export type LigneDuMatin = { minute: number | null; qui: string; prestations: readonly string[]; maitre?: string };
/** « 8 h 30 Awa B., Reprise et Coiffure », puis la main quand ce n'est pas Team. */
export function ligneDuRendezVous(l: LigneDuMatin): string {
  const heure = l.minute === null ? 'heure à revoir' : heureDuMatin(l.minute);
  const qui = propreDuMatin(l.qui) || 'une cliente';
  const quoi = l.prestations.map(propreDuMatin).filter(Boolean);
  const maitre = propreDuMatin(l.maitre);
  const main = maitre && maitre !== MAITRE_QUI_NE_SE_DIT_PAS ? `, ${maitre}` : '';
  return `${heure} ${qui}${quoi.length ? `, ${quoi.join(' et ')}` : ''}${main}`;
}
/** Les lignes, séparées d'un point médian ; trop longues, « et N autres au Trône ». */
export function listeDuJour(lignes: readonly string[], auPlus: number = LISTE_AU_PLUS): string {
  const tout = lignes.join(' · ');
  if (tout.length <= auPlus) return tout;
  for (let k = lignes.length - 1; k >= 1; k -= 1) {
    const n = lignes.length - k;
    const t = `${lignes.slice(0, k).join(' · ')} · et ${n} autre${n > 1 ? 's' : ''} au Trône`;
    if (t.length <= auPlus) return t;
  }
  const n = lignes.length - 1;
  const queue = n > 0 ? ` · et ${n} autre${n > 1 ? 's' : ''} au Trône` : '';
  return `${lignes[0].slice(0, Math.max(0, auPlus - queue.length - 1))}…${queue}`;
}

/* ── CE QU'ILS LISENT : les trois modèles, et leur copie au fil ── */
/** Meta refuse une variable qui porte un saut de ligne, une tabulation ou
    plus de quatre espaces de suite. */
export const variableDuModele = (s: unknown): string => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
export function nomsDits(noms: readonly string[]): string {
  const n = noms.map(propreDuMatin).filter(Boolean);
  if (n.length === 0) return 'l’équipe';
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`;
}
export const appelDuDestinataire = (d: DestinataireDuMatin, nom: unknown): string =>
  propreDuMatin(d.appel) || propreDuMatin(nom).split(' ')[0] || '';

/** `planning_du_jour` (Utilitaire), le corps APPROUVÉ chez Meta le 21 novembre 2026 (la première
    tournure, « la Maison a {{2}} aujourd’hui, {{3}} : {{4}} », était annoncée Marketing et refusée) :
    « Bonjour {{1}}, votre planning à la Maison : {{2}} aujourd’hui, {{3}}. Horaires : {{4}}. Belle journée à vous. » */
export const variablesDuPlanning = (o: { appel: string; nombre: number; jour: string; liste: string }): string[] =>
  [o.appel, `${o.nombre} rendez-vous`, jourDitDuMatin(o.jour), o.liste].map(variableDuModele);
export const texteDuPlanning = (v: readonly string[], pied: string): string =>
  `Bonjour ${v[0]}, votre planning à la Maison : ${v[1]} aujourd’hui, ${v[2]}. Horaires : ${v[3]}. Belle journée à vous.\n${pied}`;

/** `equipe_plus_tard` (Utilitaire), deux réponses rapides « À 9 h » et « À 10 h » :
    « Bonjour {{1}}, aucun rendez-vous avant 11 h aujourd’hui, {{2}}. Pour {{3}}, l’arrivée peut passer à 9 h ou à 10 h au lieu de 8 h. Que choisissez-vous ? » */
export const BOUTONS_DE_L_ACCORD: readonly string[] = ['À 9 h', 'À 10 h'];
export const variablesDeLAccord = (o: { appel: string; jour: string; noms: readonly string[] }): string[] =>
  [o.appel, jourDitDuMatin(o.jour), nomsDits(o.noms)].map(variableDuModele);
export const texteDeLAccord = (v: readonly string[], pied: string): string =>
  `Bonjour ${v[0]}, aucun rendez-vous avant 11 h aujourd’hui, ${v[1]}. Pour ${v[2]}, l’arrivée peut passer à 9 h ou à 10 h au lieu de 8 h. Que choisissez-vous ?\n${pied}`;

/** `venir_plus_tard` (Utilitaire) : « Bonjour {{1}}, aucun rendez-vous avant 11 h aujourd’hui, {{2}}. Vous pouvez venir à {{3}} au lieu de 8 h. Belle journée à vous. » */
export const variablesDeLArrivee = (o: { appel: string; jour: string; heure: number }): string[] =>
  [o.appel, jourDitDuMatin(o.jour), `${o.heure} h`].map(variableDuModele);
export const texteDeLArrivee = (v: readonly string[], pied: string): string =>
  `Bonjour ${v[0]}, aucun rendez-vous avant 11 h aujourd’hui, ${v[1]}. Vous pouvez venir à ${v[2]} au lieu de 8 h. Belle journée à vous.\n${pied}`;

export const composantsDuCorps = (v: readonly string[]): unknown[] =>
  [{ type: 'body', parameters: v.map((text) => ({ type: 'text', text })) }];
export const composantsDeLAccord = (v: readonly string[], jour: string): unknown[] => [
  ...composantsDuCorps(v),
  ...HEURES_PLUS_TARD.map((h, i) => ({
    type: 'button', sub_type: 'quick_reply', index: String(i),
    parameters: [{ type: 'payload', payload: chargeDuBoutonDeLEquipe(jour, h) }],
  })),
];

/** Ce que la direction lit après son toucher (texte libre : la fenêtre vient de s'ouvrir). */
export const confirmationDuChoix = (heure: number, noms: readonly string[]): string =>
  `C’est noté : ${nomsDits(noms)} ${noms.filter((n) => propreDuMatin(n)).length > 1 ? 'viennent' : 'vient'} à ${heure} h. Personne ne peut réserver avant ${heure} h ${String(INSTALLATION_MIN).padStart(2, '0')} ce matin.`;

/* ── LES IDENTIFIANTS : un par jour, ce qui rend chaque dépôt sans doublon ── */
export const idDuPlanning = (jour: string, staffId: string): string => `equipe-planning-${jour}-${staffId}`;
export const idDeLAccord = (jour: string, branchId: string): string => `equipe-accord-${jour}-${branchId}`;
export const idDeLArrivee = (jour: string, staffId: string): string => `equipe-arrivee-${jour}-${staffId}`;
export const idDuMur = (jour: string, branchId: string): string => `equipe-tard-${jour}-${branchId}`;
/** Le mur du calendrier : de 8 h à la demi-heure qui suit l'arrivée. */
export const murDeLArrivee = (heure: number): { debut: string; fin: string } => ({
  debut: `${String(HEURE_HABITUELLE).padStart(2, '0')}h00`,
  fin: `${String(heure).padStart(2, '0')}h${String(INSTALLATION_MIN).padStart(2, '0')}`,
});

/* ── LE NUMÉRO : la forme que Meta attend (229, puis 01 et huit chiffres) ── */
export const numeroDuMatin = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
/** Un numéro béninois complet : 229, 01, huit chiffres. Le reste ne part pas. */
export const numeroQuiPart = (n: string): boolean => /^22901\d{8}$/.test(n);

/* ── QUI TRAVAILLE, ET LA MAISON OUVRE-T-ELLE ── */
const rangDuLundi = (jour: string): number => (utcDuJour(jour).getUTCDay() + 6) % 7;
const lundiDuMatin = (jour: string): string => new Date(utcDuJour(jour).getTime() - rangDuLundi(jour) * 86_400_000).toISOString().slice(0, 10);
/** Le statut d'une personne ce jour-là (`mnd_planning`, la règle de
    `statutDuJour` de rh-pur) : la semaine qui s'écarte, sinon le modèle. */
export function statutAuPlanning(planning: unknown, staffId: string, jour: string): string {
  const p = objetDuMatin(planning);
  const i = rangDuLundi(jour);
  const dans = (l: unknown): string => (Array.isArray(l) && typeof l[i] === 'string' ? l[i] as string : '');
  return dans(objetDuMatin(objetDuMatin(p.semaines)[lundiDuMatin(jour)])[staffId]) || dans(objetDuMatin(p.modele)[staffId]);
}
export const auReposCeJour = (planning: unknown, staffId: string, jour: string): boolean =>
  ['repos', 'conge'].includes(statutAuPlanning(planning, staffId, jour));
const CLES_DES_JOURS_DU_MATIN = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
/** « 08h00 » en minutes ; illisible : null. */
const minuteDeLHoraire = (h: unknown): number | null => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(String(h ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null;
};
/** L'OUVERTURE DE LA MAISON CE JOUR-LÀ, en minutes, ou null si elle est
    fermée (`mnd_settings.hours`, puis `mnd_horaires_exceptions` sans
    personne). La règle d'`ouvertureDuJour` : sans semaine connue, fermée ;
    une exception ferme, ou déplace l'heure, elle n'ouvre pas un jour fermé. */
export function ouvertureDuMatin(hours: unknown, exceptions: unknown, jour: string): number | null {
  const cle = CLES_DES_JOURS_DU_MATIN[utcDuJour(jour).getUTCDay()];
  const h = (Array.isArray(hours) ? hours : []).map(objetDuMatin).find((x) => x.key === cle);
  if (!h || h.closed === true) return null;
  const ex = (Array.isArray(exceptions) ? exceptions : []).map(objetDuMatin).find((e) => e.date === jour && !e.staffId);
  if (ex && ex.closed === true) return null;
  return minuteDeLHoraire(ex?.open) ?? minuteDeLHoraire(h.open) ?? HEURE_HABITUELLE * 60;
}
export const ouvertCeJour = (hours: unknown, exceptions: unknown, jour: string): boolean => ouvertureDuMatin(hours, exceptions, jour) !== null;

/* ── LE PLAN DU MATIN : qui reçoit quoi, branche par branche ── */
export type MembreDuMatin = { id: string; name?: unknown; phone?: unknown; branchId?: unknown; archiveeLe?: unknown };
export type QuiRecoit = { staffId: string; appel: string; numero: string };
export type PlanDUneBranche = {
  branchId: string;
  ouvert: boolean;
  rdvs: number;
  /** Ceux qui reçoivent la journée (vide sans rendez-vous). */
  planning: QuiRecoit[];
  /** La question à la direction, quand rien n'est avant 11 h, un jour qui
      ouvre à 8 h (le samedi ouvre à 9 h : « 9 h au lieu de 8 h » n'y a pas de sens). */
  accord: { decideur: QuiRecoit; destinataires: QuiRecoit[] } | null;
  /** Ce qui ne part pas, et pourquoi (en nombres). */
  sautes: Record<string, number>;
};
export function planDuMatin(o: {
  jour: string;
  reglages: ReglagesDuMatinLus;
  equipe: readonly MembreDuMatin[];
  rdvs: readonly RdvDuMatin[];
  hours: unknown;
  exceptions: unknown;
  planning: unknown;
}): PlanDUneBranche[] {
  if (!o.reglages.actif) return [];
  const fiches = new Map(o.equipe.map((m) => [m.id, m]));
  const quiRecoit = (d: DestinataireDuMatin): QuiRecoit | null => {
    const f = fiches.get(d.staffId);
    const numero = numeroDuMatin(f?.phone);
    return f && numeroQuiPart(numero) ? { staffId: d.staffId, appel: appelDuDestinataire(d, f.name), numero } : null;
  };
  const decideurFiche = fiches.get(o.reglages.decideur);
  const decideur = o.reglages.decideur ? quiRecoit({ staffId: o.reglages.decideur }) : null;
  const branches: string[] = [];
  for (const d of o.reglages.destinataires) {
    const b = String(fiches.get(d.staffId)?.branchId ?? '');
    if (b && !branches.includes(b)) branches.push(b);
  }
  return branches.map((branchId) => {
    const sautes: Record<string, number> = {};
    const saute = (k: string) => { sautes[k] = (sautes[k] ?? 0) + 1; };
    const ouverture = ouvertureDuMatin(o.hours, o.exceptions, o.jour);
    const ouvert = ouverture !== null;
    const duJour = rendezVousDuJour(o.rdvs, o.jour, branchId);
    const presents: QuiRecoit[] = [];
    for (const d of o.reglages.destinataires) {
      const f = fiches.get(d.staffId);
      if (!f || String(f.branchId ?? '') !== branchId) continue;
      if (propreDuMatin(f.archiveeLe)) { saute('partie'); continue; }
      if (auReposCeJour(o.planning, d.staffId, o.jour)) { saute('au-repos'); continue; }
      const q = quiRecoit(d);
      if (!q) { saute('sans-numero'); continue; }
      presents.push(q);
    }
    if (!ouvert) return { branchId, ouvert, rdvs: duJour.length, planning: [], accord: null, sautes: { ...sautes, ferme: 1 } };
    const planning = duJour.length > 0 ? presents : [];
    let accord: PlanDUneBranche['accord'] = null;
    if (rienAvant(duJour) && presents.length > 0) {
      if (ouverture !== null && ouverture > HEURE_HABITUELLE * 60) saute('ouvre-apres-8-h');
      else if (!decideur || String(decideurFiche?.branchId ?? branchId) !== branchId) saute('sans-decideur');
      else accord = { decideur, destinataires: presents };
    }
    return { branchId, ouvert, rdvs: duJour.length, planning, accord, sautes };
  });
}

/* ── LA QUESTION DU MATIN, ET SA RÉPONSE ── */
export type PropositionDuMatin = {
  jour: string;
  branchId: string;
  etat: 'proposee' | 'choisie' | 'refusee';
  proposeeLe: string;
  /** L'instant au-delà duquel la réponse ne vaut plus (ISO). */
  limite: string;
  destinataires: QuiRecoit[];
  /** Le numéro à qui la question est partie : seul son bouton répond. */
  numeroDuDecideur: string;
  heure?: number;
  choisieLe?: string;
  par?: string;
  motif?: string;
};
/** Le document `mnd_equipe_du_matin`. */
export type EtatDuMatin = { propositions: PropositionDuMatin[] };
export function etatDuMatin(brut: unknown): EtatDuMatin {
  const liste = Array.isArray(objetDuMatin(brut).propositions) ? objetDuMatin(brut).propositions as unknown[] : [];
  const propositions = liste.map(objetDuMatin)
    .filter((p) => typeof p.jour === 'string' && typeof p.branchId === 'string' && ['proposee', 'choisie', 'refusee'].includes(String(p.etat)))
    .map((p) => p as unknown as PropositionDuMatin);
  return { propositions };
}
export const laPropositionDe = (etat: EtatDuMatin, jour: string, branchId: string): PropositionDuMatin | null =>
  etat.propositions.find((p) => p.jour === jour && p.branchId === branchId) ?? null;
export const estOuverte = (p: PropositionDuMatin | null | undefined, maintenantMs: number): boolean =>
  !!p && p.etat === 'proposee' && maintenantMs <= Date.parse(p.limite);
/** L'état avec cette proposition à sa place ; les plus anciens matins tombent. */
export function avecLaProposition(etat: EtatDuMatin, p: PropositionDuMatin): EtatDuMatin {
  const autres = etat.propositions.filter((x) => !(x.jour === p.jour && x.branchId === p.branchId));
  return { propositions: [p, ...autres].sort((a, b) => b.jour.localeCompare(a.jour)).slice(0, MATINS_GARDES) };
}
export function nouvelleProposition(o: { jour: string; branchId: string; maintenantMs: number; limite: string; destinataires: QuiRecoit[]; decideur: QuiRecoit }): PropositionDuMatin {
  return {
    jour: o.jour, branchId: o.branchId, etat: 'proposee', proposeeLe: new Date(o.maintenantMs).toISOString(),
    limite: new Date(instantDeCotonou(o.jour, o.limite)).toISOString(), destinataires: o.destinataires, numeroDuDecideur: o.decideur.numero,
  };
}

export type VerdictDuMatin =
  | { ok: true; heure: number }
  | { ok: false; code: 'aucune' | 'deja' | 'trop-tard' | 'heure' | 'un-rendez-vous'; motif: string };
/** LA RÉPONSE SE JUGE AU MOMENT OÙ ELLE ARRIVE : une fois seulement, avant
    la limite, et seulement si rien n'est arrivé avant 11 h depuis 6 h. */
export function jugeLaReponse(o: { proposition: PropositionDuMatin | null | undefined; heure: unknown; maintenantMs: number; rdvsDuJour: readonly RdvDuMatin[] }): VerdictDuMatin {
  const p = o.proposition;
  if (!p) return { ok: false, code: 'aucune', motif: 'Rien n’est proposé ce matin.' };
  if (p.etat === 'choisie') return { ok: false, code: 'deja', motif: `C’est déjà décidé : l’équipe vient à ${p.heure} h.` };
  if (p.etat !== 'proposee') return { ok: false, code: 'aucune', motif: p.motif || 'Rien n’est proposé ce matin.' };
  if (o.maintenantMs > Date.parse(p.limite)) {
    return { ok: false, code: 'trop-tard', motif: `Il est passé ${heureDuMatin(minuteDeCotonou(Date.parse(p.limite)))} : l’équipe vient à ${HEURE_HABITUELLE} h, comme d’habitude.` };
  }
  const heure = Number(o.heure);
  if (!HEURES_PLUS_TARD.includes(heure)) return { ok: false, code: 'heure', motif: 'Seulement 9 h ou 10 h.' };
  const avant = premierAvant(o.rdvsDuJour);
  if (avant) {
    const m = minuteDuRdv(avant.time);
    return { ok: false, code: 'un-rendez-vous', motif: `Un rendez-vous est arrivé avant 11 h (${m === null ? 'heure à revoir' : heureDuMatin(m)}) : l’équipe vient à ${HEURE_HABITUELLE} h.` };
  }
  return { ok: true, heure };
}
/* ⟨/equipe-du-matin⟩ */

/* ⟨arret-d-avance⟩ */
/** Un message arrêté d'avance : sa clé, qui l'a arrêté et quand ; « Remettre » pose `remisLe`. */
type ArretDAvance = { id?: string; cle?: string; arreteLe?: string; arretePar?: string; remisLe?: string; remisPar?: string; [k: string]: unknown };
/** Un modèle Meta en pause chez nous : `enPause` vrai, qui, quand, pourquoi ; « Reprendre » le remet à faux. */
type PauseDuModele = { id?: string; modele?: string; enPause?: boolean; par?: string; le?: string; motif?: string; parOpale?: boolean; [k: string]: unknown };
/** Ce que la porte d'avance décide d'une ligne. `repli` : le modèle est en pause, son repli part à sa place. */
type VerdictDAvance =
  | { verdict: 'arrete'; cle: string; par: string; le: string; motif: string }
  | { verdict: 'en-pause'; modele: string; motif: string }
  | { verdict: 'repli'; modele: string; motif: string };
/** Ce qu'une ligne d'envoi porte et que la clé lit. */
type LigneDAvance = {
  id?: unknown; type?: unknown; genre?: unknown; apptId?: unknown; seanceId?: unknown; invoiceId?: unknown; rang?: unknown;
  clientId?: unknown; teteId?: unknown; subId?: unknown; campagneId?: unknown; dateRdv?: unknown; anniversaire?: unknown;
  colis?: { genre?: unknown; modele?: unknown; repli?: { modele?: unknown } | null } | null;
  [k: string]: unknown;
};

/** Le mot qui ouvre le détail d'une ligne arrêtée d'avance : le Trône le lit. */
const MARQUE_DE_L_ARRET = 'arrêté d’avance';
/** Opale signale un modèle au deuxième « non remis » de suite, le met en pause au cinquième. */
const NON_REMIS_SIGNALE_AU = 2;
const NON_REMIS_EN_PAUSE_AU = 5;

const motDAvance = (v: unknown): string => String(v ?? '').trim();

/** LA CLÉ D'UN MESSAGE : la même pour la prévision, la ligne en salle et la
    ligne prise par le facteur. Une ligne que rien ne décrit n'est qu'elle-même. */
function cleDuMessage(l: LigneDAvance | null | undefined): string {
  const type = motDAvance(l?.type);
  const id = motDAvance(l?.id);
  const rdv = motDAvance(l?.apptId);
  if ((type === 'rappel-j1' || type === 'confirmation' || type === 'reprise-j3') && rdv) return `${type}:${rdv}`;
  if (type === 'point-apres' || type === 'point-avant') {
    const seance = motDAvance(l?.seanceId) || rdv;
    if (seance) return `${type}:${seance}`;
  }
  if (type === 'relance-facture') {
    const m = /^rl-(.+)-(\d+)-whatsapp$/.exec(id);
    if (m) return `relance:${m[1]}:${m[2]}`;
    if (motDAvance(l?.invoiceId) && motDAvance(l?.rang)) return `relance:${motDAvance(l?.invoiceId)}:${motDAvance(l?.rang)}`;
  }
  if (type === 'rappel-echeance' || type === 'prix-revu') {
    const m = /^(?:rv|pr)-(.+)-whatsapp$/.exec(id);
    if (m) return `${type === 'prix-revu' ? 'prix-revu' : 'echeance'}:${m[1]}`;
  }
  if (type === 'fete-de-couronne') {
    const m = /^fc-(.+)-(\d{4})-whatsapp$/.exec(id);
    if (m) return `fete:${m[1]}:${m[2]}`;
  }
  if (type === 'avis-google' && motDAvance(l?.invoiceId)) return `avis:${motDAvance(l?.invoiceId)}`;
  if (type === 'papier-de-la-piece' && motDAvance(l?.invoiceId)) return `papier:${motDAvance(l?.invoiceId)}`;
  if (type === 'campagne' && motDAvance(l?.campagneId)) return `campagne:${motDAvance(l?.campagneId)}:${motDAvance(l?.clientId)}`;
  if (type === 'gerard') {
    const genre = motDAvance(l?.genre);
    const jour = /^gerard-(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1] ?? '';
    if (genre === 'garder' && rdv) return `garder:${rdv}`;
    if (genre === 'anniversaire' && motDAvance(l?.clientId) && jour) return `anniv:${motDAvance(l?.clientId)}:${jour.slice(0, 4)}`;
    if (genre && motDAvance(l?.clientId) && jour) return `perle:${genre}:${motDAvance(l?.clientId)}:${jour}`;
  }
  return `ligne:${id}`;
}

/** L'ARRÊT EN VIGUEUR pour cette clé, ou null. Remis après le dernier arrêt : plus d'arrêt. */
function arretEnVigueur(cle: string, arrets: readonly (ArretDAvance | null | undefined)[] | null | undefined): ArretDAvance | null {
  if (!cle) return null;
  for (const a of arrets ?? []) {
    if (!a || motDAvance(a.cle ?? a.id) !== cle || !motDAvance(a.arreteLe)) continue;
    if (motDAvance(a.remisLe) && motDAvance(a.remisLe) >= motDAvance(a.arreteLe)) continue;
    return a;
  }
  return null;
}

/** LE MODÈLE EST-IL EN PAUSE ? La pause en vigueur, ou null. */
function modeleEnPause(modele: unknown, pauses: readonly (PauseDuModele | null | undefined)[] | null | undefined): PauseDuModele | null {
  const m = motDAvance(modele);
  if (!m) return null;
  for (const p of pauses ?? []) if (p && motDAvance(p.modele ?? p.id) === m && p.enPause === true) return p;
  return null;
}

/** « mercredi 4 novembre 2026 à 21 h 40 », à l'heure de Cotonou (UTC + 1, sans heure d'été). */
function momentDAvance(iso: unknown): string {
  const t = Date.parse(motDAvance(iso));
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 3_600_000);
  const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = d.getUTCDate();
  const mi = d.getUTCMinutes();
  return `${JOURS_DITS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_DITS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${d.getUTCHours()} h${mi ? ` ${String(mi).padStart(2, '0')}` : ''}`;
}

/** LA PORTE D'AVANCE : l'arrêt de la direction d'abord, quel que soit le
    canal (le SMS d'un rappel arrêté ne part pas non plus) ; puis, pour un
    modèle WhatsApp, la pause : son repli part s'il en a un qui n'est pas en
    pause, sinon rien. `null` : rien ne l'arrête ici. */
function laPorteDAvance(
  l: LigneDAvance | null | undefined,
  o: { arrets?: readonly (ArretDAvance | null | undefined)[] | null; pauses?: readonly (PauseDuModele | null | undefined)[] | null },
): VerdictDAvance | null {
  const cle = cleDuMessage(l);
  const arret = arretEnVigueur(cle, o.arrets);
  if (arret) {
    const par = motDAvance(arret.arretePar) || 'la direction';
    const le = motDAvance(arret.arreteLe);
    const quand = momentDAvance(le);
    return { verdict: 'arrete', cle, par, le, motif: `${MARQUE_DE_L_ARRET} par ${par}${quand ? `, ${quand}` : ''}` };
  }
  if (motDAvance(l?.colis?.genre) !== 'whatsapp') return null;
  const modele = motDAvance(l?.colis?.modele);
  const pause = modeleEnPause(modele, o.pauses);
  if (!pause) return null;
  const repli = motDAvance(l?.colis?.repli?.modele);
  if (repli && repli !== modele && !modeleEnPause(repli, o.pauses)) {
    return { verdict: 'repli', modele: repli, motif: `le modèle ${modele} est en pause : ${repli} part à sa place` };
  }
  const par = motDAvance(pause.par);
  return { verdict: 'en-pause', modele, motif: `le modèle ${modele} est en pause${par ? ` (${par === 'Opale' ? 'mis en pause par Opale' : `par ${par}`})` : ''}` };
}

/** CE QUE LA LIGNE DEVIENT quand elle ne part pas. Arrêtée : « écarté », par
    qui l'a arrêtée ; le colis reste, « Remettre » peut la rendre tant que
    son heure n'est pas passée. En pause : « périmé », marqué par Opale (les
    fonctions ne la redéposent pas). Un repli n'écrit rien : la ligne part. */
function ligneRetenueDAvance(v: VerdictDAvance, maintenantIso: string): Record<string, unknown> | null {
  if (v.verdict === 'arrete') {
    return { statut: 'écarté', ecartePar: v.par, ecarteLe: maintenantIso, detail: v.motif, arretDAvance: { cle: v.cle, par: v.par, le: v.le } };
  }
  if (v.verdict === 'en-pause') return { statut: 'périmé', detail: `retenu par Opale : ${v.motif}`, modeleEnPause: v.modele };
  return null;
}

/** LA SÉRIE DES « NON REMIS » d'un modèle : du plus récent au plus ancien, les
    messages sortants que WhatsApp a jugés, comptés tant qu'ils sont « non
    remis ». Un message encore en route ne compte ni pour ni contre. */
function serieDeNonRemis(messages: readonly ({ sens?: unknown; etat?: unknown; quand?: unknown } | null | undefined)[]): number {
  const juges = messages
    .filter((m): m is { sens?: unknown; etat?: unknown; quand?: unknown } => !!m && motDAvance(m.sens) === 'sortant'
      && ['non-remis', 'remis', 'lu'].includes(motDAvance(m.etat)) && Number.isFinite(Date.parse(motDAvance(m.quand))))
    .sort((a, b) => Date.parse(motDAvance(b.quand)) - Date.parse(motDAvance(a.quand)));
  let n = 0;
  for (const m of juges) {
    if (motDAvance(m.etat) !== 'non-remis') break;
    n += 1;
  }
  return n;
}

/** CE QU'OPALE FAIT D'UNE SÉRIE : rien, le signaler, ou mettre le modèle en pause. */
function veilleDuModele(serie: number): 'rien' | 'signale' | 'pause' {
  if (serie >= NON_REMIS_EN_PAUSE_AU) return 'pause';
  if (serie >= NON_REMIS_SIGNALE_AU) return 'signale';
  return 'rien';
}

/** Ce qu'une fonction donne pour lire : la base, telle que le client Supabase la présente. */
type BaseDAvance = { from(t: string): { select(c: string): { range(de: number, a: number): PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
/** LA LECTURE AU DÉPÔT : une fonction qui dépose lit les arrêts et les pauses
    une fois par passage. Une lecture qui échoue n'arrête rien ici : le
    facteur, lui, ne laisse rien partir sans les avoir lus. */
async function litLesArretsEtLesPauses(sb: BaseDAvance): Promise<{ arrets: ArretDAvance[]; pauses: PauseDuModele[] }> {
  const lis = async (t: string): Promise<Record<string, unknown>[]> => {
    try {
      const { data, error } = await sb.from(t).select('id, data').range(0, 4999);
      if (error) return [];
      return ((data ?? []) as { id?: unknown; data?: Record<string, unknown> | null }[]).map((r) => ({ ...(r?.data ?? {}), id: String(r?.id ?? '') }));
    } catch {
      return [];
    }
  };
  const [arrets, pauses] = await Promise.all([lis('envois_arretes'), lis('modeles_en_pause')]);
  return { arrets: arrets as ArretDAvance[], pauses: pauses as PauseDuModele[] };
}
/* ⟨/arret-d-avance⟩ */

/* LE FACTEUR VIT-IL ? (la règle de fete-de-couronne) Sa marque `mnd_facteur`
   date de moins de cinq minutes : la salle d'attente porte. Sinon, on
   envoie d'ici. */
const FACTEUR_VIVANT_MS = 5 * 60_000;
const facteurVivant = (vuLe: unknown, maintenantMs: number): boolean => {
  const t = Date.parse(String(vuLe ?? ''));
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};

// deno-lint-ignore no-explicit-any
type Sb = any;
type Modeles = { planning: string; accord: string; arrivee: string };
type Meta = { token: string; phoneId: string };

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/* ── CE QUE LA FONCTION LIT ── */
async function litLesDocuments(sb: Sb): Promise<Map<string, unknown>> {
  const { data, error } = await sb.from('documents').select('key, data').in('key', DOCUMENTS_DU_MATIN);
  if (error) throw new Error(`documents : ${error.message}`);
  const docs = new Map<string, unknown>();
  for (const d of (data ?? []) as { key: string; data: unknown }[]) docs.set(d.key, d.data);
  return docs;
}
async function litLEquipe(sb: Sb, ids: string[]): Promise<MembreDuMatin[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb.from('team').select('id, data').in('id', ids);
  if (error) throw new Error(`équipe : ${error.message}`);
  return ((data ?? []) as { id: string; data: Record<string, unknown> }[]).map((r) => ({ ...(r.data ?? {}), id: r.id }));
}
async function litLesRdvsDuJour(sb: Sb, jour: string): Promise<(RdvDuMatin & { id: string })[]> {
  const out: (RdvDuMatin & { id: string })[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('appointments').select('id, data').eq('data->>date', jour).order('id').range(de, de + 999);
    if (error) throw new Error(`rendez-vous : ${error.message}`);
    const lignes = (data ?? []) as { id: string; data: Record<string, unknown> }[];
    for (const r of lignes) out.push({ ...(r.data ?? {}), id: r.id });
    if (lignes.length < 1000) break;
  }
  return out;
}
/** Les lignes de la journée : la cliente (prénom et initiale), les prestations, la main. */
async function lignesDeLaJournee(sb: Sb, rdvs: readonly (RdvDuMatin & { id: string })[]): Promise<string[]> {
  const idsClientes = [...new Set(rdvs.map((r) => String(r.clientId ?? '')).filter(Boolean))];
  const idsPrestations = [...new Set(rdvs.flatMap((r) => (Array.isArray(r.serviceIds) ? r.serviceIds.map(String) : [])))];
  const fiches = new Map<string, Record<string, unknown>>();
  const prestations = new Map<string, string>();
  for (let i = 0; i < idsClientes.length; i += 200) {
    const { data } = await sb.from('clients').select('id, data').in('id', idsClientes.slice(i, i + 200));
    for (const l of (data ?? []) as { id: string; data: Record<string, unknown> }[]) fiches.set(l.id, l.data ?? {});
  }
  for (let i = 0; i < idsPrestations.length; i += 200) {
    const { data } = await sb.from('services').select('id, data').in('id', idsPrestations.slice(i, i + 200));
    for (const l of (data ?? []) as { id: string; data: Record<string, unknown> }[]) prestations.set(l.id, String(l.data?.name ?? ''));
  }
  return rdvs.map((r) => {
    const f = fiches.get(String(r.clientId ?? ''));
    return ligneDuRendezVous({
      minute: minuteDuRdv(r.time),
      qui: nomCourtDuMatin(f?.name ?? r.clientName, f?.prenomUsage),
      prestations: (Array.isArray(r.serviceIds) ? r.serviceIds.map(String) : []).map((id) => prestations.get(id) ?? '').filter(Boolean),
      maitre: String(r.master ?? ''),
    });
  });
}

/* ── ENVOYER : par la salle d'attente, ou d'ici quand le facteur se tait ── */
type Depot = {
  id: string; branchId: string; jour: string; genre: 'planning' | 'accord' | 'arrivee';
  staffId: string; numero: string; modele: string; composants: unknown[]; texteAuFil: string;
};
type IssueDuDepot = 'depose' | 'deja' | 'arrete' | 'envoye' | 'echec';

async function envoieDIci(sb: Sb, meta: Meta, l: Record<string, unknown>, d: Depot): Promise<IssueDuDepot> {
  let statut = 'échec';
  let detail = '';
  let waId = '';
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${meta.phoneId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${meta.token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: d.numero, type: 'template', template: { name: d.modele, language: { code: 'fr' }, components: d.composants } }),
    });
    const corps = await r.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { message?: string } };
    waId = String(corps?.messages?.[0]?.id ?? '');
    if (r.ok) statut = 'envoyé';
    else detail = String(corps?.error?.message ?? `HTTP ${r.status}`);
  } catch (e) {
    detail = String(e);
  }
  const { colis: _c, partA: _p, ...base } = l;
  await sb.from('envois').upsert({
    id: d.id, branch_id: d.branchId,
    data: { ...base, statut, quand: new Date().toISOString(), ...(detail ? { detail: detail.slice(0, 300) } : {}), ...(waId ? { waMessageId: waId } : {}) },
  }, { onConflict: 'id' });
  if (statut === 'envoyé' && waId) {
    const idFil = `wa-${waId}`;
    await sb.from('messages_wa').upsert({
      id: idFil, branch_id: d.branchId,
      data: { id: idFil, waId, branchId: d.branchId, sens: 'sortant', numero: d.numero, texte: d.texteAuFil, type: 'text', quand: new Date().toISOString(), etat: 'en-route', modele: d.modele, parQui: PAR_QUI_DE_L_EQUIPE_DU_MATIN },
    }, { onConflict: 'id' });
  }
  return statut === 'envoyé' ? 'envoye' : 'echec';
}

async function depose(
  sb: Sb, d: Depot, o: { avance: { arrets: ArretDAvance[]; pauses: PauseDuModele[] }; salleOuverte: boolean; meta: Meta },
): Promise<IssueDuDepot> {
  const maintenant = new Date().toISOString();
  const ligne: Record<string, unknown> = {
    id: d.id, branchId: d.branchId, type: TYPE_DE_L_EQUIPE_DU_MATIN, genre: d.genre, canal: 'whatsapp',
    apptId: '', dateRdv: '', staffId: d.staffId, numero: d.numero, jour: d.jour, quand: maintenant,
    statut: 'en-attente', deposeLe: maintenant, partA: maintenant,
    colis: { genre: 'whatsapp', numero: d.numero, modele: d.modele, parQui: PAR_QUI_DE_L_EQUIPE_DU_MATIN, texteAuFil: d.texteAuFil, composants: d.composants },
  };
  /* Déjà là (un second passage le même matin) : rien ne repart. */
  const { data: deja } = await sb.from('envois').select('id').eq('id', d.id).limit(1);
  if ((deja ?? []).length > 0) return 'deja';
  /* Arrêté d'avance par la direction, ou son modèle en pause : écrit tel qu'il partirait, et retenu. */
  const dAvance = laPorteDAvance(ligne as never, o.avance);
  if (dAvance && dAvance.verdict !== 'repli') {
    await sb.from('envois').upsert({ id: d.id, branch_id: d.branchId, data: { ...ligne, ...ligneRetenueDAvance(dAvance, maintenant) } }, { onConflict: 'id' });
    return 'arrete';
  }
  if (o.salleOuverte) {
    const { data: posee, error } = await sb.from('envois')
      .upsert({ id: d.id, branch_id: d.branchId, data: ligne }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) return 'echec';
    return (posee ?? []).length > 0 ? 'depose' : 'deja';
  }
  if (!o.meta.token || !o.meta.phoneId) return 'echec';
  return await envoieDIci(sb, o.meta, ligne, d);
}

/** L'ÉTAT DU MATIN SE CHANGE SUR CE QU'IL EST, PAS SUR CE QU'ON A LU : relu,
    transformé, puis écrit seulement s'il n'a pas bougé entre-temps (sinon
    relu encore). Deux réponses au même instant (le Trône et WhatsApp) ne
    gagnent pas toutes les deux, et le Trône qui amorce le document vide
    (`bindDocument`) ne fait rien perdre. `transforme` rend null : rien à
    écrire (la proposition n'est plus ouverte). */
async function changeLEtat(sb: Sb, transforme: (e: EtatDuMatin) => EtatDuMatin | null): Promise<boolean> {
  for (let essai = 0; essai < 3; essai += 1) {
    const { data: lu, error: errLu } = await sb.from('documents').select('data, updated_at').eq('key', CLE_DE_L_ETAT).maybeSingle();
    if (errLu) return false;
    const neuf = transforme(etatDuMatin(lu?.data));
    if (!neuf) return false;
    const maintenant = new Date().toISOString();
    const { data: ecrit, error } = lu
      ? await sb.from('documents').update({ data: neuf, updated_at: maintenant }).eq('key', CLE_DE_L_ETAT).eq('updated_at', lu.updated_at).select('key')
      : await sb.from('documents').upsert({ key: CLE_DE_L_ETAT, data: neuf, updated_at: maintenant }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
    if (!error && (ecrit ?? []).length > 0) return true;
  }
  return false;
}

/* ── ① LE PASSAGE DE 6 H ── */
async function passage(sb: Sb, o: { maintenantMs: number; force: boolean; modeles: Modeles; meta: Meta }): Promise<Record<string, unknown>> {
  const jour = jourDeCotonou(o.maintenantMs);
  if (!o.force && !estLHeureDuPassage(o.maintenantMs)) return { version: VERSION, jour, passage: 'pas-l-heure' };
  const docs = await litLesDocuments(sb);
  const reglagesMaison = objet(docs.get('mnd_settings'));
  const reglages = reglagesDuMatin(reglagesMaison.equipeDuMatin);
  if (!reglages.actif) return { version: VERSION, jour, passage: 'eteint' };
  const ids = [...new Set([...reglages.destinataires.map((d) => d.staffId), reglages.decideur].filter(Boolean))];
  const equipe = await litLEquipe(sb, ids);
  const rdvs = await litLesRdvsDuJour(sb, jour);
  const plans = planDuMatin({
    jour, reglages, equipe, rdvs, hours: reglagesMaison.hours, exceptions: docs.get('mnd_horaires_exceptions'), planning: docs.get('mnd_planning'),
  });
  const salleOuverte = facteurVivant(objet(docs.get('mnd_facteur')).vuLe, o.maintenantMs);
  const avance = await litLesArretsEtLesPauses(sb);
  const etat = etatDuMatin(docs.get(CLE_DE_L_ETAT));
  const compte: Record<string, number> = {};
  const note = (k: string) => { compte[k] = (compte[k] ?? 0) + 1; };
  const parBranche: Record<string, unknown>[] = [];

  for (const plan of plans) {
    let proposee = false;
    if (plan.planning.length > 0) {
      if (!o.modeles.planning) note('planning-sans-modele');
      else {
        const duJour = rendezVousDuJour(rdvs, jour, plan.branchId);
        const liste = listeDuJour(await lignesDeLaJournee(sb, duJour));
        for (const q of plan.planning) {
          const v = variablesDuPlanning({ appel: q.appel, nombre: plan.rdvs, jour, liste });
          note(`planning-${await depose(sb, {
            id: idDuPlanning(jour, q.staffId), branchId: plan.branchId, jour, genre: 'planning', staffId: q.staffId, numero: q.numero,
            modele: o.modeles.planning, composants: composantsDuCorps(v), texteAuFil: texteDuPlanning(v, DEVISE),
          }, { avance, salleOuverte, meta: o.meta })}`);
        }
      }
    }
    if (plan.accord) {
      if (!o.modeles.accord || !o.modeles.arrivee) note('accord-sans-modele');
      else if (laPropositionDe(etat, jour, plan.branchId)) note('accord-deja');
      else {
        const p = nouvelleProposition({ jour, branchId: plan.branchId, maintenantMs: o.maintenantMs, limite: reglages.limite, destinataires: plan.accord.destinataires, decideur: plan.accord.decideur });
        const v = variablesDeLAccord({ appel: plan.accord.decideur.appel, jour, noms: plan.accord.destinataires.map((d) => d.appel) });
        const issue = await depose(sb, {
          id: idDeLAccord(jour, plan.branchId), branchId: plan.branchId, jour, genre: 'accord', staffId: plan.accord.decideur.staffId, numero: plan.accord.decideur.numero,
          modele: o.modeles.accord, composants: composantsDeLAccord(v, jour), texteAuFil: texteDeLAccord(v, DEVISE),
        }, { avance, salleOuverte, meta: o.meta });
        note(`accord-${issue}`);
        if (issue === 'depose' || issue === 'envoye') {
          proposee = await changeLEtat(sb, (e) => (laPropositionDe(e, jour, plan.branchId) ? null : avecLaProposition(e, p)));
          if (!proposee) note('etat-non-ecrit');
        }
      }
    }
    parBranche.push({ branchId: plan.branchId, ouvert: plan.ouvert, rdvs: plan.rdvs, planning: plan.planning.length, accord: !!plan.accord, proposee, sautes: plan.sautes });
  }
  return { version: VERSION, jour, passage: 'fait', salle: salleOuverte, compte, parBranche };
}

/* ── ② LA RÉPONSE : « À 9 h » ou « À 10 h » ── */
type Reponse = { ok: boolean; motif?: string; heure?: number; noms?: string[]; code?: string };
async function reponds(
  sb: Sb, o: { maintenantMs: number; heure: unknown; jour?: string; branchId?: string; numero?: string; par: string; modeles: Modeles; meta: Meta },
): Promise<Reponse> {
  const jour = jourDeCotonou(o.maintenantMs);
  if (o.jour && o.jour !== jour) return { ok: false, code: 'aucune', motif: 'Ce bouton est celui d’un autre matin : rien ne change.' };
  /* Sans le modèle d'arrivée, un « oui » ne pourrait prévenir personne : il ne se prend pas. */
  if (!o.modeles.arrivee) return { ok: false, code: 'aucune', motif: 'Le message d’arrivée n’est pas encore approuvé chez Meta : rien ne part, l’équipe vient à 8 h.' };
  const docs = await litLesDocuments(sb);
  const etat = etatDuMatin(docs.get(CLE_DE_L_ETAT));
  /* SEUL LE NUMÉRO QUESTIONNÉ RÉPOND : par WhatsApp, la proposition du jour
     partie à ce numéro ; au Trône, celle de la branche. */
  const p = o.numero !== undefined
    ? etat.propositions.find((x) => x.jour === jour && x.numeroDuDecideur.slice(-8) === numeroDuMatin(o.numero).slice(-8)) ?? null
    : laPropositionDe(etat, jour, String(o.branchId ?? ''));
  if (!p) return { ok: false, code: 'aucune', motif: 'Rien n’est proposé ce matin.' };
  const duJour = rendezVousDuJour(await litLesRdvsDuJour(sb, jour), jour, p.branchId);
  const v = jugeLaReponse({ proposition: p, heure: o.heure, maintenantMs: o.maintenantMs, rdvsDuJour: duJour });
  if (!v.ok) {
    /* Un rendez-vous arrivé avant 11 h ferme la question : la carte du Trône s'en va. */
    if (v.code === 'un-rendez-vous') {
      await changeLEtat(sb, (e) => {
        const cur = laPropositionDe(e, jour, p.branchId);
        return cur && cur.etat === 'proposee' ? avecLaProposition(e, { ...cur, etat: 'refusee', motif: v.motif }) : null;
      });
    }
    return { ok: false, code: v.code, motif: v.motif };
  }
  const choisie: PropositionDuMatin = { ...p, etat: 'choisie', heure: v.heure, choisieLe: new Date(o.maintenantMs).toISOString(), par: o.par };
  /* LE CHOIX SE PREND SUR L'ÉTAT DU MOMENT : encore ouverte, sinon une autre réponse a gagné. */
  const pris = await changeLEtat(sb, (e) => {
    const cur = laPropositionDe(e, jour, p.branchId);
    return cur && cur.etat === 'proposee' ? avecLaProposition(e, choisie) : null;
  });
  if (!pris) {
    return { ok: false, code: 'deja', motif: 'Une autre réponse vient d’arriver : rien ne change.' };
  }
  /* LE MUR D'ABORD : plus personne ne réserve avant l'heure, puis l'équipe est prévenue. */
  const mur = murDeLArrivee(v.heure);
  const idMur = idDuMur(jour, p.branchId);
  const { error: errMur } = await sb.from('blocages').upsert({
    id: idMur, branch_id: p.branchId, data: { id: idMur, branchId: p.branchId, date: jour, debut: mur.debut, fin: mur.fin, motif: MOTIF_DU_MUR },
  }, { onConflict: 'id' });
  if (errMur) console.error('equipe-du-matin: mur', errMur.message);
  const salleOuverte = facteurVivant(objet(docs.get('mnd_facteur')).vuLe, o.maintenantMs);
  const avance = await litLesArretsEtLesPauses(sb);
  for (const d of p.destinataires) {
    const va = variablesDeLArrivee({ appel: d.appel, jour, heure: v.heure });
    const issue = await depose(sb, {
      id: idDeLArrivee(jour, d.staffId), branchId: p.branchId, jour, genre: 'arrivee', staffId: d.staffId, numero: d.numero,
      modele: o.modeles.arrivee, composants: composantsDuCorps(va), texteAuFil: texteDeLArrivee(va, DEVISE),
    }, { avance, salleOuverte, meta: o.meta });
    if (issue === 'echec' || issue === 'arrete') console.error('equipe-du-matin: arrivée', d.staffId, issue);
  }
  return { ok: true, heure: v.heure, noms: p.destinataires.map((d) => d.appel) };
}

/** Par WhatsApp, la direction lit ce que son toucher a fait (la fenêtre vient de s'ouvrir). */
async function reponsAuDecideur(sb: Sb, meta: Meta, numero: string, texte: string): Promise<void> {
  if (!meta.token || !meta.phoneId) return;
  const to = numeroDuMatin(numero);
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${meta.phoneId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${meta.token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texte } }),
    });
    const corps = await r.json().catch(() => ({})) as { messages?: { id?: string }[] };
    const waId = String(corps?.messages?.[0]?.id ?? '');
    if (r.ok && waId) {
      const idFil = `wa-${waId}`;
      await sb.from('messages_wa').upsert({
        id: idFil, branch_id: null,
        data: { id: idFil, waId, sens: 'sortant', numero: to, texte, type: 'text', quand: new Date().toISOString(), etat: 'en-route', parQui: PAR_QUI_DE_L_EQUIPE_DU_MATIN },
      }, { onConflict: 'id' });
    }
  } catch (e) {
    console.error('equipe-du-matin: réponse au décideur', String(e).slice(0, 160));
  }
}

/* ⟨cle-du-cron⟩ */
/** Deux clés sont-elles la même ? À TEMPS CONSTANT : `===` s'arrête au
    premier caractère qui diffère, et ce temps-là se mesure de l'extérieur,
    caractère après caractère. Une clé vide ne vaut jamais : un secret qui
    n'est pas posé n'ouvre rien. */
const memeCle = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
};

/** Une clé refusée se dit AU JOURNAL de la fonction, en longueurs seules
    (sb_secret ≈ 40 à 50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien de
    posé de ce côté-là) : elles suffisent à situer la panne. Jamais dans la
    réponse : celui qui frappe sans la clé n'a pas à les lire. */
const noteLeRefus = (porte: string, attendue: string, recue: string): void => {
  console.error(`${porte} : clé refusée`, { attendueLg: attendue.length, recueLg: recue.length });
};
/* ⟨/cle-du-cron⟩ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const modeles: Modeles = {
    planning: (Deno.env.get('WA_TEMPLATE_PLANNING_DU_JOUR') ?? '').trim(),
    accord: (Deno.env.get('WA_TEMPLATE_EQUIPE_PLUS_TARD') ?? '').trim(),
    arrivee: (Deno.env.get('WA_TEMPLATE_VENIR_PLUS_TARD') ?? '').trim(),
  };
  const meta: Meta = { token: Deno.env.get('WA_TOKEN') ?? '', phoneId: Deno.env.get('WA_PHONE_ID') ?? '' };

  /* ⓪ LE CONTRÔLE DE SANTÉ : la version, et les secrets en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'equipe-du-matin', version: VERSION,
      secrets: {
        WA_TEMPLATE_PLANNING_DU_JOUR: modeles.planning.length, WA_TEMPLATE_EQUIPE_PLUS_TARD: modeles.accord.length,
        WA_TEMPLATE_VENIR_PLUS_TARD: modeles.arrivee.length, CLE_SERVICE: service.length, WA_TOKEN: meta.token.length, WA_PHONE_ID: meta.phoneId.length,
      },
    });
  }
  if (req.method !== 'POST') return json({ erreur: 'POST seulement' }, 405);
  const corps = objet(await req.json().catch(() => ({})));
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const sb = createClient(urlBase, service);
  const maintenantMs = Date.now();

  try {
    /* LA CLÉ SERVICE : le cron (le passage) ou le webhook (un bouton). */
    if (service && memeCle(cleRecue, service)) {
      if (corps.geste === 'repondre') {
        const numero = String(corps.numero ?? '');
        if (!numero) return json({ erreur: 'le numéro manque' }, 400);
        const r = await reponds(sb, { maintenantMs, heure: corps.heure, jour: String(corps.jour ?? ''), numero, par: 'WhatsApp', modeles, meta });
        await reponsAuDecideur(sb, meta, numero, `${r.ok ? confirmationDuChoix(r.heure ?? 0, r.noms ?? []) : r.motif}\n${DEVISE}`);
        return json({ version: VERSION, ...r });
      }
      return json(await passage(sb, { maintenantMs, force: corps.force === true, modeles, meta }));
    }
    /* UNE SESSION DU TRÔNE : la direction seule répond. */
    if (!cleRecue || !anon) {
      noteLeRefus('equipe-du-matin', service, cleRecue);
      return json({ erreur: 'réservé au cron, au webhook et à la direction' }, 401);
    }
    const commeAppelant = createClient(urlBase, anon, { global: { headers: { Authorization: `Bearer ${cleRecue}` } } });
    const { data: estDirection, error: errDirection } = await commeAppelant.rpc('est_direction');
    if (errDirection || estDirection !== true) return json({ erreur: 'Réservé à la direction.' }, 403);
    if (corps.geste !== 'repondre') return json({ erreur: 'geste inconnu' }, 400);
    /* Qui a répondu : son nom au Trône, jamais son adresse (le document se lit de toute l'équipe). */
    const { data: qui } = await commeAppelant.auth.getUser(cleRecue);
    const { data: fiche } = qui?.user?.id ? await sb.from('staff').select('name').eq('user_id', qui.user.id).maybeSingle() : { data: null };
    const par = String(fiche?.name || 'la direction').slice(0, 60);
    return json({ version: VERSION, ...(await reponds(sb, { maintenantMs, heure: corps.heure, branchId: String(corps.branchId ?? ''), par: `${par} · le Trône`, modeles, meta })) });
  } catch (e) {
    console.error('equipe-du-matin', String(e).slice(0, 300));
    return json({ version: VERSION, erreur: String(e).slice(0, 200) }, 500);
  }
});
