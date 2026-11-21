/* L'ÉQUIPE DU MATIN · 21 novembre 2026.

   « Je veux que Perle envoie automatiquement, chaque jour à 6 h, les
   rendez-vous du jour à l'équipe (Gérard, Nassim et Aimé), depuis le Trône.
   Quand il n'y a pas de rendez-vous, aucun message. Tu peux préparer des
   messages pour venir plus tard, à 9 h au lieu de 8 h, c'est un avantage,
   mais ils ne partent que quand je donne la permission. Prépare-les les jours
   où il n'y a pas de rendez-vous à la Maison avant 11 h » (Yéman, traduit
   de l'anglais). Puis : « donne 2 choix, parfois 9 h ou 10 h », et la
   question lui arrive sur WhatsApp ET au Trône.

   CE QUI SE PASSE, chaque matin, par la fonction `equipe-du-matin` (cron
   05:00 UTC, 6 h à Cotonou) :
     ① la Maison ouverte et au moins un rendez-vous ce jour-là : chacune des
        personnes choisies (Réglages de Perle) reçoit la journée entière,
        heure, cliente (prénom et initiale), prestations, et la main quand
        ce n'est pas « Team ». Sans rendez-vous : rien ;
     ② rien avant 11 h : la direction reçoit « À 9 h » / « À 10 h ». Son
        toucher (ou celui du Trône) pose un mur au calendrier jusqu'à 9 h 30
        ou 10 h 30, puis prévient l'équipe. Sans réponse à 7 h 30, rien ne
        part : l'équipe vient à 8 h. Un rendez-vous arrivé avant 11 h entre
        6 h et la réponse, et rien ne part non plus.

   Les messages passent par la salle d'attente (le facteur, `envois-partent`),
   et traversent ses heures calmes : ils sont pour l'équipe, pas pour une
   cliente, et 6 h est l'heure demandée.

   Module PUR. Entre ses repères, recopié dans la fonction Edge (et le bouton
   dans `whatsapp-webhook`) par `scripts/terminer-copie-serveur.mjs` ; R8 du
   banc des douze lunes les confronte. Aucun import entre les repères. */

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
