/* LE CONSEIL DU MATIN, SAPHIR VERSION SIMPLE · 2 novembre 2026.
   Le socle de la Maison intelligente (maquette CrtJrZzF8E6K39dbPeHwwt) :
   chaque matin à 7 h (Cotonou), Saphir lit ce que la Maison a fait et ce qui
   l'attend, et écrit une page pour la direction, sur le téléphone.

   Version simple : AUCUN appel à Claude. La page est composée ici, à partir
   de faits comptés par la fonction `conseil-du-matin` : zéro crédit, et
   chaque phrase se prouve au banc `verifie-le-conseil-du-matin`.

   Ce que la page ne porte JAMAIS : un nom de cliente, un numéro, un texte de
   message, un mot libre d'un bilan, un montant d'encaissement. Elle ne lit des
   faits que leurs nombres, le registre des dix, les prénoms de l'équipe pour
   les fauteuils, et le nom des tâches du serveur passé au filtre. Les cibles
   chiffrées viennent de la base (`mnd_settings.conseil`), jamais du dépôt.

   Module PUR : ni Supabase, ni DOM. */
import {
  aCotonou, dansLaVeille, decisionEnAttente, etatDe, reglagesComplets,
  type Assistant, type ReglagesAssistants,
} from './assistants-pur';
import {
  PORTEURS, PROFESSIONNELS, STATUT_DIT, dollarsDits, livreDuMois, moisDeCotonou, passeAuTrone, professionnel,
  type ReglagesDuLivre,
} from './maison-intelligente-pur';

export const VERSION_DU_CONSEIL = '2026-11-02-a';
/** Le nombre de lignes de « Ce qui presse » : le reste se compte. */
export const PRESSE_AU_PLUS = 5;
/** Une carte qui attend depuis plus longtemps presse. */
export const CARTE_ANCIENNE_H = 24;

/* ── Les faits, tels que la fonction les compte ───────────────────────── */

export type AssistantVu = {
  id: string; nom?: string | null; aUnJeton: boolean; vuLe?: string | null;
  etat?: Assistant['etat'] | null; loinDepuis?: string | null;
};
export type CarteEnAttente = { assistant: string; genre: string; creeLe: string; echeance?: string | null; tranchee?: string | null };
export type BilanLu = { assistant: string; jour: string; comptes?: Record<string, unknown> | null; [k: string]: unknown };
/** Un rendez-vous du jour : seuls `time`, `master` et `status` sont lus. */
export type RdvDuJour = { time?: unknown; master?: unknown; status?: unknown; [k: string]: unknown };
export type TacheEnEchec = { tache?: unknown; echecs?: unknown; [k: string]: unknown };
export type CibleDuConseil = { le: string; valeur: number };
export type ReglagesDuConseil = { actives90?: { depart?: number; cibles?: CibleDuConseil[] } };

export type FaitsDuConseil = {
  assistants: AssistantVu[];
  reglagesAssistants?: ReglagesAssistants | null;
  cartes: CarteEnAttente[];
  relais: { hier: number; aTraiter: number };
  bilans: BilanLu[];
  /** Les gestes du journal d'hier, par porte. */
  gestesHier: Record<string, number>;
  rdvDuJour: RdvDuJour[];
  /** L'équipe : id → nom (on n'en dit que le prénom). */
  equipe: Record<string, string>;
  depensesAValider: number;
  tachesEnEchec: TacheEnEchec[];
  /** Les documents des compteurs de crédits (CLES_DES_COMPTEURS). */
  compteurs: Record<string, unknown>;
  livre?: ReglagesDuLivre | null;
  /** Le lundi seulement : les clientes distinctes avec un rituel honoré dans les 90 derniers jours. */
  actives90?: number | null;
  conseil?: ReglagesDuConseil | null;
  /** Ce que la fonction n'a pas pu lire ce matin (clés de LACUNES_DITES). */
  lacunes?: string[];
};

/** Ce que Saphir dit quand une lecture a manqué : une liste fermée. */
export const LACUNES_DITES: Record<string, string> = {
  assistants: 'le registre des professionnels', cartes: 'les cartes', relais: 'les relais', bilans: 'les bilans',
  journal: 'le journal', rdv: 'les rendez-vous du jour', equipe: "l'équipe", depenses: 'les dépenses', taches: 'les tâches de la nuit',
  compteurs: 'les compteurs de crédits', actives: 'les clientes actives', reglages: 'les réglages',
};

/* ── La page ──────────────────────────────────────────────────────────── */

export type TonDuConseil = 'alerte' | 'attention' | 'calme';
export type LigneDuConseil = { texte: string; ton: TonDuConseil };
export type ProDuConseil = { id: string; nom: string; tient: string; porteurs: string; dit: string; ton: 'ok' | 'alerte' | 'calme' };

export type PageDuConseil = {
  jour: string;
  titre: string;
  jourDit: string;
  ecritLe: string;
  version: string;
  presse: LigneDuConseil[];
  /** Tous les points qui pressent, même au-delà des cinq lignes. */
  pressentEnTout: number;
  hier: string[];
  aujourdhui: string[];
  dix: ProDuConseil[];
  credits: { mois: string; totalUsd: number; enveloppeUsd: number; dit: string; alertes: string[] };
  lundi?: { actives90: number; dit: string } | null;
  revue?: string | null;
  notification: { titre: string; corps: string };
  /** Quand la notification du matin est partie (la fonction le garde d'une écriture à l'autre). */
  notifieLe?: string | null;
};

/* ── Les mots ─────────────────────────────────────────────────────────── */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « lundi 2 novembre 2026 » (le jour donné en AAAA-MM-JJ). */
export function jourDit(jourISO: string): string {
  const d = new Date(`${jourISO}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return jourISO;
  const j = d.getUTCDate();
  return `${JOURS[d.getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « 2 février 2027 », sans le jour de la semaine. */
export function dateDite(jourISO: string): string {
  const d = new Date(`${jourISO}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return jourISO;
  const j = d.getUTCDate();
  return `${j === 1 ? '1er' : j} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « novembre 2026 » pour « 2026-11 ». */
export const moisDit = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return Number.isFinite(a) && m >= 1 && m <= 12 ? `${MOIS[m - 1]} ${a}` : mois;
};

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);
const nombreDit = (n: number, un: string, plusieurs: string) => `${n} ${pluriel(n, un, plusieurs)}`;
const capitale = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** « d'Opale », « de Saphir ». */
export const de = (nom: string) => (/^[aeiouyhàâéèêîôûAEIOUYHÀÂÉÈÊÎÔÛ]/.test(nom) ? `d'${nom}` : `de ${nom}`);

/** « 9 h », « 9 h 30 ». */
export function heureDite(hhmm: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return mi ? `${h} h ${String(mi).padStart(2, '0')}` : `${h} h`;
}

/** Le prénom d'un membre de l'équipe, seulement s'il est fait de lettres. */
export function prenomPropre(nom: unknown): string | null {
  const p = String(nom ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'-]{0,19}$/u.test(p) ? p : null;
}

/** Le nom d'une tâche du serveur, s'il est sage : des lettres, des chiffres
    courts, des tirets. Sinon, « une tâche du serveur ». */
export function tacheDite(t: unknown): string {
  const s = String(t ?? '').trim();
  if (!s || s.length > 60 || /\d{5,}/.test(s.replace(/[\s_-]/g, '')) || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(s)) return 'une tâche du serveur';
  return `la tâche « ${s} »`;
}

const entier = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/* ── Les rubriques ────────────────────────────────────────────────────── */

/** Le nom d'un professionnel par son id : celui du registre, jamais un texte de la base. */
const nomDe = (id: string): string | null => professionnel(id)?.nom ?? null;

type PointQuiPresse = { rang: number; texte: string; ton: TonDuConseil };

function pointsQuiPressent(f: FaitsDuConseil, maintenantMs: number, livre: ReturnType<typeof livreDuMois>): PointQuiPresse[] {
  const points: PointQuiPresse[] = [];
  const r = reglagesComplets(f.reglagesAssistants ?? null);
  const heure = aCotonou(maintenantMs).heure;

  /* ⓪ Ce que Saphir n'a pas pu lire : la page le dit d'abord, elle ne fait pas semblant. */
  const manquees = [...new Set((f.lacunes ?? []).map((l) => LACUNES_DITES[l]).filter(Boolean))];
  if (manquees.length) points.push({ rang: 0, ton: 'alerte', texte: `Saphir n'a pas pu lire ${manquees.join(', ')} ce matin : la page est incomplète.` });

  /* ① Les tâches de la nuit en échec. */
  for (const t of f.tachesEnEchec ?? []) {
    const n = entier(t.echecs);
    if (n === 0) continue;
    points.push({ rang: 1, ton: 'alerte', texte: `${capitale(tacheDite(t.tache))} a échoué ${n === 1 ? 'une fois' : `${n} fois`} depuis hier matin.` });
  }

  /* ② Un assistant relié qui dort dans la veille, ou qui est empêché. */
  for (const p of PROFESSIONNELS) {
    if (!passeAuTrone(p)) continue;
    const a = (f.assistants ?? []).find((x) => x.id === p.id);
    if (!a || !a.aUnJeton) continue;
    const e = etatDe({ aUnJeton: a.aUnJeton, vuLe: a.vuLe ?? null, etat: a.etat ?? {} }, maintenantMs, r);
    if (e.etat === 'empeche') points.push({ rang: 2, ton: 'alerte', texte: `${p.nom} est ${e.detail}.` });
    else if (e.etat === 'endormi' && dansLaVeille(heure, r)) {
      points.push({ rang: 2, ton: 'alerte', texte: e.detail.startsWith('endormi depuis ') ? `${p.nom} dort ${e.detail.slice('endormi '.length)}.` : `${p.nom} dort : ${e.detail}.` });
    }
  }

  /* ③ Les cartes qui attendent depuis plus d'un jour, par professionnel. */
  const vieilles = new Map<string, number>();
  for (const c of f.cartes ?? []) {
    if (!decisionEnAttente({ tranchee: (c.tranchee ?? null) as Parameters<typeof decisionEnAttente>[0]['tranchee'], echeance: c.echeance ?? null }, maintenantMs)) continue;
    const ne = Date.parse(c.creeLe);
    if (!Number.isFinite(ne) || maintenantMs - ne < CARTE_ANCIENNE_H * 3_600_000) continue;
    const qui = nomDe(c.assistant) ?? 'un professionnel';
    vieilles.set(qui, (vieilles.get(qui) ?? 0) + 1);
  }
  for (const [qui, n] of vieilles) {
    points.push({ rang: 3, ton: 'attention', texte: `${n === 1 ? 'Une carte attend' : `${n} cartes attendent`} depuis plus d'un jour chez ${qui}.` });
  }

  /* ④ Les crédits proches du plafond ou au-delà. */
  if (livre.alerte !== 'ok') {
    points.push({ rang: 4, ton: livre.alerte === 'depasse' ? 'alerte' : 'attention',
      texte: `Les crédits de la Maison : ${dollarsDits(livre.totalUsd)} sur ${livre.enveloppeUsd} $ en ${moisDit(livre.mois)}.` });
  }
  for (const l of livre.lignes) {
    if (l.alerte === 'ok') continue;
    points.push({ rang: 4, ton: l.alerte === 'depasse' ? 'alerte' : 'attention',
      texte: l.alerte === 'depasse'
        ? `${l.nom} a dépassé son plafond : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.`
        : `${l.nom} approche de son plafond : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.` });
  }

  /* ⑤ Les dépenses à valider. */
  const dep = entier(f.depensesAValider);
  if (dep > 0) points.push({ rang: 5, ton: 'attention', texte: dep === 1 ? 'Une dépense attend sa validation.' : `${dep} dépenses attendent leur validation.` });

  /* ⑥ Les places tenues sans réponse. */
  const places = (f.cartes ?? []).filter((c) => c.genre === 'place-tenue' && decisionEnAttente({ tranchee: (c.tranchee ?? null) as Parameters<typeof decisionEnAttente>[0]['tranchee'], echeance: c.echeance ?? null }, maintenantMs)).length;
  if (places > 0) points.push({ rang: 6, ton: 'attention', texte: `${places === 1 ? 'Une place tenue attend' : `${places} places tenues attendent`} une réponse.` });

  return points.sort((a, b) => a.rang - b.rang);
}

const PORTES_DITES: Record<string, string> = {
  trone: 'au Trône', assistant: 'par les assistants', couronne: 'depuis Ma Couronne', automate: 'par l\'automate WhatsApp',
  serveur: 'par le serveur', site: 'depuis le site', comptoir: 'au comptoir',
};

function hier(f: FaitsDuConseil, jour: string, jourDHier: string): string[] {
  const lignes: string[] = [];
  /* Les gestes du journal, par porte. */
  const parPorte = new Map<string, number>();
  for (const [porte, n] of Object.entries(f.gestesHier ?? {})) {
    const c = entier(n); if (!c) continue;
    const dite = PORTES_DITES[porte] ?? 'ailleurs';
    parPorte.set(dite, (parPorte.get(dite) ?? 0) + c);
  }
  const total = [...parPorte.values()].reduce((a, b) => a + b, 0);
  if (total === 0) lignes.push('Hier, aucun geste au journal.');
  else {
    const detail = [...parPorte.entries()].sort((a, b) => b[1] - a[1]).map(([dite, n]) => `${n} ${dite}`).join(', ');
    lignes.push(`Hier, ${nombreDit(total, 'geste', 'gestes')} au journal : ${detail}.`);
  }

  /* Les bilans déposés pour hier (ou ce matin) : des compteurs seulement. */
  const COMPTES_DITS: [string, string, string][] = [
    ['lus', 'lu', 'lus'], ['repondus', 'réponse', 'réponses'], ['pouces', 'pouce', 'pouces'], ['rdvPoses', 'rendez-vous posé', 'rendez-vous posés'],
    ['depenses', 'dépense', 'dépenses'], ['cartes', 'carte', 'cartes'], ['relais', 'relais', 'relais'], ['publications', 'publication', 'publications'],
  ];
  const parQui = new Map<string, BilanLu>();
  for (const b of f.bilans ?? []) {
    if (b.jour !== jour && b.jour !== jourDHier) continue;
    if (!nomDe(b.assistant)) continue;
    const deja = parQui.get(b.assistant);
    if (!deja || String(b.jour) > String(deja.jour)) parQui.set(b.assistant, b);
  }
  for (const [id, b] of parQui) {
    const comptes = (b.comptes ?? {}) as Record<string, unknown>;
    const parts = COMPTES_DITS.map(([k, un, plusieurs]) => [entier(comptes[k]), un, plusieurs] as const).filter(([n]) => n > 0).map(([n, un, plusieurs]) => nombreDit(n, un, plusieurs));
    lignes.push(`Le bilan ${de(nomDe(id) as string)} : ${parts.length ? parts.join(', ') : 'rien à compter'}.`);
  }
  const relies = PROFESSIONNELS.filter((p) => passeAuTrone(p) && (f.assistants ?? []).some((a) => a.id === p.id && a.aUnJeton));
  if (relies.length && parQui.size === 0) lignes.push('Aucun bilan déposé ce matin.');

  /* Les relais. */
  const rh = entier(f.relais?.hier); const rt = entier(f.relais?.aTraiter);
  if (rh === 0 && rt === 0) lignes.push('Aucun relais hier.');
  else lignes.push(`${capitale(nombreDit(rh, 'relais', 'relais'))} entre professionnels hier${rt ? `, ${rt} encore à traiter` : ''}.`);
  return lignes;
}

function aujourdhui(f: FaitsDuConseil): string[] {
  const rdvs = (f.rdvDuJour ?? []).filter((r) => String(r.status ?? '') !== 'annulé');
  if (rdvs.length === 0) return ['Aucun rendez-vous aujourd\'hui.'];
  const heures = rdvs.map((r) => String(r.time ?? '')).filter((t) => heureDite(t)).sort();
  const premiere = heures.length ? heureDite(heures[0]) : null;
  const lignes = [`${capitale(nombreDit(rdvs.length, 'rendez-vous', 'rendez-vous'))} aujourd'hui${premiere ? `, le premier à ${premiere}` : ''}.`];
  const parFauteuil = new Map<string, number>();
  for (const r of rdvs) {
    const p = prenomPropre(f.equipe?.[String(r.master ?? '')]) ?? 'sans maître nommé';
    parFauteuil.set(p, (parFauteuil.get(p) ?? 0) + 1);
  }
  lignes.push(`Par fauteuil : ${[...parFauteuil.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p, n]) => `${p} ${n}`).join(', ')}.`);
  return lignes;
}

function lesDix(f: FaitsDuConseil, maintenantMs: number): ProDuConseil[] {
  const r = reglagesComplets(f.reglagesAssistants ?? null);
  return PROFESSIONNELS.map((p) => {
    const porteurs = p.porteurs.map((k) => PORTEURS[k].prenom).join(' et ');
    const base = { id: p.id, nom: p.nom, tient: p.tient, porteurs };
    if (passeAuTrone(p)) {
      const a = (f.assistants ?? []).find((x) => x.id === p.id);
      if (!a || !a.aUnJeton) return { ...base, dit: 'Pas encore relié au Trône.', ton: 'calme' as const };
      const e = etatDe({ aUnJeton: true, vuLe: a.vuLe ?? null, etat: a.etat ?? {} }, maintenantMs, r);
      const loin = a.loinDepuis && Number.isFinite(Date.parse(a.loinDepuis)) ? ' Mode « Je suis loin ».' : '';
      if (e.etat === 'eveille') return { ...base, dit: `En veille, ${e.detail}.${loin}`, ton: 'ok' as const };
      const alerte = e.etat === 'empeche' || dansLaVeille(aCotonou(maintenantMs).heure, r);
      return { ...base, dit: `${capitale(e.detail)}.${loin}`, ton: alerte ? 'alerte' as const : 'calme' as const };
    }
    return { ...base, dit: `${capitale(STATUT_DIT[p.statut])}, ${p.ouDit}.`, ton: p.statut === 'en-ligne' ? 'ok' as const : 'calme' as const };
  });
}

/** Le chiffre du lundi : les clientes actives à 90 jours, le départ et la cible du trimestre (de la base). */
function lundi(f: FaitsDuConseil, jour: string): { actives90: number; dit: string } | null {
  if (typeof f.actives90 !== 'number' || !Number.isFinite(f.actives90) || f.actives90 < 0) return null;
  const n = Math.round(f.actives90);
  const c = f.conseil?.actives90;
  const depart = typeof c?.depart === 'number' && Number.isFinite(c.depart) && c.depart >= 0 ? Math.round(c.depart) : null;
  const cibles = (Array.isArray(c?.cibles) ? c.cibles : [])
    .filter((x): x is CibleDuConseil => !!x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.le)) && typeof x.valeur === 'number' && Number.isFinite(x.valeur) && x.valeur > 0)
    .sort((a, b) => a.le.localeCompare(b.le));
  const cible = cibles.find((x) => x.le >= jour) ?? null;
  let dit = `Le chiffre du lundi : ${nombreDit(n, 'cliente active', 'clientes actives')} à 90 jours.`;
  if (depart !== null) dit += ` Au départ : ${depart}.`;
  if (cible) dit += ` Cible au ${dateDite(cible.le)} : ${Math.round(cible.valeur)}.`;
  return { actives90: n, dit };
}

/* ── La page entière ──────────────────────────────────────────────────── */

export function ecrisLeConseil(f: FaitsDuConseil, maintenantMs: number): PageDuConseil {
  const c = aCotonou(maintenantMs);
  const jour = c.dateISO;
  const jourDHier = aCotonou(maintenantMs - 86_400_000).dateISO;
  const livre = livreDuMois(f.compteurs ?? {}, moisDeCotonou(maintenantMs), f.livre ?? null);
  const points = pointsQuiPressent(f, maintenantMs, livre);
  const presse = points.slice(0, PRESSE_AU_PLUS).map(({ texte, ton }) => ({ texte, ton }));
  if (points.length > PRESSE_AU_PLUS) {
    const reste = points.length - (PRESSE_AU_PLUS - 1);
    presse[PRESSE_AU_PLUS - 1] = { texte: `Et ${reste} autres points, dans Les assistants.`, ton: 'attention' };
  }
  const alertes = livre.lignes.filter((l) => l.alerte !== 'ok').map((l) => `${l.nom} : ${dollarsDits(l.usd)} sur ${dollarsDits(l.plafond)}.`);
  const part = Math.round(livre.partDeLEnveloppe * 100);
  const n = points.length;
  return {
    jour,
    titre: 'Le Conseil du matin',
    jourDit: jourDit(jour),
    ecritLe: new Date(maintenantMs).toISOString(),
    version: VERSION_DU_CONSEIL,
    presse,
    pressentEnTout: n,
    hier: hier(f, jour, jourDHier),
    aujourdhui: aujourdhui(f),
    dix: lesDix(f, maintenantMs),
    credits: {
      mois: livre.mois, totalUsd: livre.totalUsd, enveloppeUsd: livre.enveloppeUsd,
      dit: `${capitale(moisDit(livre.mois))} : ${dollarsDits(livre.totalUsd)} sur ${livre.enveloppeUsd} $ (${part} %).`,
      alertes,
    },
    lundi: c.jour === 1 ? lundi(f, jour) : null,
    revue: jour.endsWith('-01') ? 'La revue du mois, aujourd\'hui, à deux : trente minutes avec Saphir.' : null,
    notification: {
      titre: 'Le Conseil du matin',
      corps: n === 0 ? 'Rien ne presse ce matin. La page vous attend dans Les assistants.'
        : n === 1 ? 'Un point presse ce matin.' : `${n} points pressent ce matin.`,
    },
  };
}

/** La page vide d'un premier matin, quand la fonction n'a encore rien lu. */
export const faitsVides = (): FaitsDuConseil => ({
  assistants: [], cartes: [], relais: { hier: 0, aTraiter: 0 }, bilans: [], gestesHier: {}, rdvDuJour: [], equipe: {},
  depensesAValider: 0, tachesEnEchec: [], compteurs: {},
});
