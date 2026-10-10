import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  DEVISE, PIED, REGLAGE_LIVRE, etapeSuivante, suiteDeLaPose, tourDeLaCliente, respecteMeta, texteSain,
  reglageDeLAutomate, numeroServi, tenuParLAutomate, silenceDeLAlarme, titreDePlace, chargeGraph, cleCourte,
  intentionDeReserver, jourDitAvecAnnee, quiParle, motsReconnus, civiliteLue, prenomLu, renvoieAUnRdv, uneQuestionAutre,
  type AgendaDuTour, type ContexteDuTour, type EtatDuFil, type FicheDuNumero, type MessageSortant,
  type PrestationDuTour, type ReglageDeLAutomate, type SortieDuTour, type MainDuFil, type VerdictDeLaPose,
  type TiroirDuNumero, type EcritureDuTour,
} from '../src/shared/automate-wa';
import {
  filsDeLaMaison, messagesQuiSonnent, automatesDesFils, numerosTenus, filsAutomateStore, poseLaMain,
  rendsALAutomate, filsSansReponse, sonnentApresLAutomate, type MessageWa, type TeteConnue, type LigneDesFilsAutomate,
} from '../src/shared/conversations';
import { rattachementsAFaire, type Demande } from '../src/shared/demandes';
import { sansCommentaires } from './un-geste-par-passage';

/* LA MAISON RÉPOND ET RÉSERVE SUR WHATSAPP, ÉPROUVÉE · 9 octobre 2026.

   Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026 (façon B :
   une conversation à boutons et à listes qui propose de vraies places
   libres et pose le rendez-vous au toucher « Je confirme »). Décisions de
   la direction du même jour : un rendez-vous CONFIRMÉ, comme le site ; la
   parole sur un rendez-vous et au premier message d'un numéro inconnu ; la
   nuit comprise ; pas de modèle de langue, la main à l'équipe au deuxième
   écart ; un interrupteur éteint, essai, ouvert, LIVRÉ EN ESSAI AVEC UNE
   LISTE VIDE.

   Chaque règle porte une PROMESSE, écrite ici à la main (jamais déduite du
   code qu'elle éprouve), et ses PANNES : des mutations du texte d'un
   fichier du dépôt (le dialogue pur, les conversations, les écrans, la
   migration 0125, les fonctions Edge). Les fonctions Edge sont CHARGÉES ET
   EXÉCUTÉES, telles qu'elles seront collées, sur un faux Supabase, un faux
   Graph et un faux web-push, en mémoire : aucune requête ne part.

   `node scripts/verifie-l-automate-wa.mjs`           éprouve le dépôt
   `node scripts/verifie-l-automate-wa.mjs --prouve`  rejoue chaque règle
   avec chacune de ses pannes : elle DOIT crier, sinon le harnais crie. Une
   mutation introuvable fait elle-même échouer le harnais.

   Sortie ASCII : OK / RATE. */

type Mutation = { fichier: string; avant: string; apres: string };
type Panne = { nom: string; mute: Mutation[] };
type Regle = { id: string; nom: string; eprouve: () => string[] | Promise<string[]>; pannes: Panne[] };
// deno-lint-ignore no-explicit-any
type Any = any;

/* ── Les outils du juge ─────────────────────────────────────────────── */
const lit = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const lf = (s: string): string => s.replace(/\r\n/g, '\n');
const j = (v: unknown): string => JSON.stringify(v);
const ascii = (s: unknown): string => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
function juge() {
  const ecarts: string[] = [];
  const vaut = (nom: string, attendu: unknown, obtenu: unknown) => {
    if (j(attendu) !== j(obtenu)) ecarts.push(`${nom} : attendu ${j(attendu)}, obtenu ${j(obtenu)}`);
  };
  const vrai = (nom: string, v: boolean, detail?: unknown) => { if (!v) ecarts.push(detail === undefined ? nom : `${nom} (${typeof detail === 'string' ? detail : j(detail)})`); };
  return { ecarts, vaut, vrai };
}
const P = (fichier: string, avant: string, apres: string): Mutation => ({ fichier, avant, apres });
const sqlSans = (s: string): string => lf(s).replace(/--.*$/gm, '');
/** Le corps d'une fonction TypeScript de premier niveau : de `debut` à la
    première accolade fermante en colonne zéro. */
const corpsTs = (src: string, debut: string): string => {
  const i = src.indexOf(debut);
  if (i < 0) return '';
  const k = src.indexOf('\n}\n', i);
  return src.slice(i, k < 0 ? undefined : k + 2);
};
/** Le corps d'une fonction SQL : de sa création à son `end $$;`. */
const corpsSql = (sql: string, nom: string): string => {
  const i = sql.indexOf(`create or replace function public.${nom}(`);
  if (i < 0) return '';
  const k = sql.indexOf('end $$;', i);
  return sql.slice(i, k < 0 ? undefined : k + 7);
};
/** Entre les repères d'une copie : `/* ⟨nom⟩ *\/` et `/* ⟨/nom⟩ *\/`. */
const entre = (src: string, nom: string): string | null => {
  const ouvre = `/* ⟨${nom}⟩ */\n`;
  const i = src.indexOf(ouvre);
  const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre.length, k);
};

/* ── Les fichiers ───────────────────────────────────────────────────── */
const AUTO = 'src/shared/automate-wa.ts';
const CONV = 'src/shared/conversations.ts';
const RESA = 'src/shared/reservation-express.ts';
const M0125 = 'supabase/migrations/0125_la_maison_repond_sur_whatsapp.sql';
const F_AUTO = 'supabase/functions/whatsapp-automate/index.ts';
const F_HOOK = 'supabase/functions/whatsapp-webhook/index.ts';
const F_ENVOI = 'supabase/functions/whatsapp-envoi/index.ts';
const F_CONF = 'supabase/functions/confirmation-rdv/index.ts';
const ECRAN_CONV = 'src/apps/trone/routes/clients/Conversations.tsx';
const ECRAN_ALARME = 'src/apps/trone/routes/pilotage/AlarmeWhatsApp.tsx';
const ECRAN_REGLAGES = 'src/apps/trone/routes/systeme/Parametres.tsx';
/* Le mot que la Maison a banni, écrit sans sa forme littérale. */
const BANNI = 'sal' + 'on';

/* ══ LE BANC DU DIALOGUE ═════════════════════════════════════════════
   Une Maison d'essai : mardi à samedi, 9 h à 19 h ; les places libres de
   mardi à samedi, de 9 h à 17 h, de J+1 à J+14, moins ce que d'autres ont
   pris entre-temps. Une création (VÈKPÈ), une restauration (FÍNFÍN) et un
   devis sont laissés « ouverts au site » PAR ERREUR : l'automate ne doit
   jamais les poser. */
type Moteur = { etapeSuivante: typeof etapeSuivante; suiteDeLaPose: typeof suiteDeLaPose; tourDeLaCliente: typeof tourDeLaCliente };
const ORIGINAL: Moteur = { etapeSuivante, suiteDeLaPose, tourDeLaCliente };

const NUM_NAFFI = '2290197000001';
const NUM_INCONNUE = '2290197000077';
const NUM_FRANCE = '33612345678';
const MAITRES = ['Team', 'Expert'];
const cotonou = (iso: string, hhmm: string): number => Date.parse(`${iso}T${hhmm}:00+01:00`);
const isoDe = (ms: number): string => new Date(ms).toISOString();

const PRESTATIONS: PrestationDuTour[] = [
  { id: 'plt-05', name: 'KLƆKLƆ™ Essentiel', categoryId: 'plt-05', durationMin: 45, reservable: true },
  { id: 'sinsin-ess', name: 'SÍNSIN™ Essentiel', categoryId: 'atl-ii-gbeji', durationMin: 60, reservable: true },
  { id: 'sv-koko-ori', name: 'KÒKÒ™ Origine', categoryId: 'koko', durationMin: 45, reservable: true },
  { id: 'sv-koko-sui', name: 'KÒKÒ™ Suivi', categoryId: 'koko', durationMin: 45, reservable: true },
  { id: 'svc-doto-conseil', name: 'Conseil et diagnostic', categoryId: 'doto', durationMin: 30, reservable: true },
  { id: 'vekpe-crea', name: 'VÈKPÈ™ Création', categoryId: 'atl-i-vekpe', durationMin: 240, reservable: true },
  { id: 'finfin', name: 'FÍNFÍN™ Renaissance', categoryId: 'atl-iv-finfin', reservable: true },
  { id: 'sur-devis', name: 'Coloration sur mesure', categoryId: 'atl-iii-yekpe', priceMode: 'devis', reservable: true },
];
const CATEGORIES = [
  { id: 'atl-ii-gbeji' }, { id: 'plt-05', parentId: 'atl-ii-gbeji' }, { id: 'koko' }, { id: 'doto' },
  { id: 'atl-i-vekpe' }, { id: 'atl-iv-finfin' }, { id: 'atl-iii-yekpe' },
];
const SEMAINE = [
  { key: 'dim', open: '09h00', close: '19h00', closed: true },
  { key: 'lun', open: '09h00', close: '19h00', closed: true },
  { key: 'mar', open: '09h00', close: '19h00', closed: false },
  { key: 'mer', open: '09h00', close: '19h00', closed: false },
  { key: 'jeu', open: '09h00', close: '19h00', closed: false },
  { key: 'ven', open: '09h00', close: '19h00', closed: false },
  { key: 'sam', open: '09h00', close: '19h00', closed: false },
];
const OUVERT: ReglageDeLAutomate = { mode: 'ouvert', numerosEssai: [], horizonJours: 14, pauseHeures: 24 };
const NAFFI: FicheDuNumero = {
  id: 'c-naffi', nom: 'Naffi Morou', civilite: 'madame', parPhone: true, numeros: [NUM_NAFFI],
  derniereVenue: { date: '2026-09-12', serviceIds: ['plt-05', 'sinsin-ess'] },
};
const KEMI: FicheDuNumero = { id: 'c-kemi', nom: 'Kemi Morou', parPhone: false, parFamille: true, naissance: '2016-04-02' };

type Parcours = {
  moteur: Moteur; numero: string; fiches: FicheDuNumero[]; reglage: ReglageDeLAutomate; tiroir: TiroirDuNumero;
  etat: EtatDuFil | null; main: MainDuFil | null; envoyes: MessageSortant[]; poses: EcritureDuTour[];
  /** Le geste du toucher qui a produit chaque écriture. */
  gestesDesPoses: string[];
  premier: boolean; n: number; prises: Set<string>; itineraire: string; agenda: Partial<AgendaDuTour>; journal: string[];
};
const parcours = (moteur: Moteur, numero: string, fiches: FicheDuNumero[], reglage: ReglageDeLAutomate = OUVERT): Parcours => ({
  moteur, numero, fiches, reglage, tiroir: 'clientes', etat: null, main: null, envoyes: [], poses: [], gestesDesPoses: [],
  premier: true, n: 0, prises: new Set(), itineraire: 'Cotonou, Haie Vive, derrière la pharmacie.', agenda: {}, journal: [],
});

const placesDe = (p: Parcours, maintenantMs: number) => (ids: readonly string[]) => {
  if (ids.length === 0) return [];
  const out: { iso: string; heure: string }[] = [];
  const jour0 = new Date(maintenantMs + 3600000).toISOString().slice(0, 10);
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(`${jour0}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 1) continue;
    const iso = d.toISOString().slice(0, 10);
    for (const h of ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']) {
      if (!p.prises.has(`${iso} ${h}`)) out.push({ iso, heure: h });
    }
  }
  return out;
};
const agendaDe = (p: Parcours, ms: number): AgendaDuTour => ({
  branchId: 'b1',
  prestations: PRESTATIONS,
  categories: CATEGORIES,
  formules: [{ serviceIds: ['plt-05'] }, { serviceIds: ['plt-05', 'sinsin-ess'] }, { serviceIds: ['vekpe-crea'] }],
  consultationParParcours: { creation: 'sv-koko-ori', reparation: 'sv-koko-sui', enfant: 'svc-doto-conseil' },
  semaine: SEMAINE,
  exceptions: [],
  places: placesDe(p, ms),
  ...p.agenda,
});
const ctxDe = (p: Parcours, ms: number): ContexteDuTour => ({
  maintenantMs: ms, numero: p.numero, tiroir: p.tiroir, reglage: p.reglage,
  fiches: p.fiches, premierMessage: p.premier, main: p.main,
  maison: { nom: 'Maison MND', itineraire: p.itineraire },
  agenda: agendaDe(p, ms),
});

/** Elle écrit (`texte`), touche un choix du dernier message (`touche`, son
    titre) ou un identifiant précis (`id`, un vieux bouton). */
function elle(p: Parcours, ms: number, o: { texte?: string; touche?: string; id?: string; type?: string; waId?: string; verdict?: (s: SortieDuTour) => VerdictDeLaPose }): SortieDuTour {
  p.n += 1;
  const waId = o.waId ?? `wamid.${p.numero}.${p.n}`;
  let bouton: { id: string; texte: string } | undefined;
  if (o.id) bouton = { id: o.id, texte: o.touche ?? '' };
  else if (o.touche) {
    const der = [...p.envoyes].reverse().find((m) => m.forme !== 'texte');
    const tous = [...(der?.boutons ?? []), ...(der?.lignes ?? [])];
    const c = tous.find((x) => x.titre === o.touche) ?? tous.find((x) => x.titre.startsWith(o.touche!));
    if (!c) throw new Error(`choix introuvable : ${o.touche} parmi ${tous.map((x) => x.titre).join(' / ')}`);
    bouton = { id: c.id, texte: c.titre };
  }
  const tour = p.moteur.tourDeLaCliente([{
    waId, quand: isoDe(ms), texte: o.texte ?? bouton?.texte ?? '', type: o.type ?? (bouton ? 'interactive' : 'text'), sens: 'entrant',
    ...(bouton ? { bouton } : {}),
  }], p.etat?.traites ?? []);
  const ctx = ctxDe(p, ms);
  let s = p.moteur.etapeSuivante(p.etat, tour, ctx);
  if (s.ecritures.length > 0) {
    p.poses.push(...s.ecritures);
    p.gestesDesPoses.push(/^MND:\d+:([a-z-]+)/.exec(bouton?.id ?? '')?.[1] ?? `texte « ${o.texte ?? ''} »`);
    p.journal.push(j(s));
    const verdict = o.verdict ? o.verdict(s) : { ok: true as const, id: s.ecritures[0].rdv.id, verdict: 'pose' as const };
    s = p.moteur.suiteDeLaPose(s.etat, verdict, ctx);
  }
  p.journal.push(j(s));
  if (s.pris) p.etat = s.etat;
  p.envoyes.push(...s.messages);
  p.premier = false;
  return s;
}
const lignesDe = (s: SortieDuTour | undefined): string[] => (s?.messages[0]?.lignes ?? []).map((l) => l.titre);
const boutonsDe = (s: SortieDuTour | undefined): string[] => (s?.messages[0]?.boutons ?? []).map((b) => b.titre);
const corps = (s: SortieDuTour | undefined): string => s?.messages[0]?.corps ?? '';

/* ── Les parcours, rejoués sur l'original et sur la copie Edge ──────── */
function scnConnue(m: Moteur, reglage: ReglageDeLAutomate = OUVERT, tiroir: TiroirDuNumero = 'clientes') {
  const p = parcours(m, NUM_NAFFI, [NAFFI], reglage);
  p.tiroir = tiroir;
  const t0 = cotonou('2026-10-09', '21:04');
  const s1 = elle(p, t0, { texte: 'Bonsoir, je voudrais passer samedi pour mes racines' });
  const s2 = elle(p, t0 + 60000, { touche: 'La même chose' });
  const s3 = elle(p, t0 + 90000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  const s4 = elle(p, t0 + 120000, { touche: 'Je confirme' });
  const avantMerci = p.envoyes.length;
  const merci = elle(p, t0 + 200000, { texte: 'Merci beaucoup !' });
  return { p, t0, s1, s2, s3, s4, merci, avantMerci };
}
function scnInconnue(m: Moteur) {
  const p = parcours(m, NUM_INCONNUE, []);
  const t0 = cotonou('2026-10-09', '10:12');
  const s1 = elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
  const s2 = elle(p, t0 + 30000, { touche: 'Entretenir mes locks' });
  const s3 = elle(p, t0 + 60000, { touche: 'KLƆKLƆ™ Essentiel' });
  const s4 = elle(p, t0 + 90000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
  const s5 = elle(p, t0 + 100000, { touche: 'Mademoiselle' });
  const s6 = elle(p, t0 + 110000, { texte: 'awa' });
  const s7 = elle(p, t0 + 120000, { touche: 'Je confirme' });
  return { p, t0, s1, s2, s3, s4, s5, s6, s7 };
}
function scnPlacePrise(m: Moteur) {
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  const t0 = cotonou('2026-10-09', '15:00');
  elle(p, t0, { texte: 'Je voudrais un rendez-vous samedi matin' });
  const s2 = elle(p, t0 + 10000, { touche: 'La même chose' });
  elle(p, t0 + 20000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  p.prises.add('2026-10-10 09:00');
  const s4 = elle(p, t0 + 30000, { touche: 'Je confirme' });
  const posesApresPrise = p.poses.length;
  p.prises.delete('2026-10-10 09:00');
  elle(p, t0 + 40000, { touche: 'Sam. 10 oct. 2026 · 10 h' });
  const s6 = elle(p, t0 + 50000, { touche: 'Je confirme', verdict: () => ({ ok: false, raison: 'creneau_pris' }) });
  const etapeApresRefus = p.etat?.etape;
  const s7 = elle(p, t0 + 60000, { touche: 'Sam. 10 oct. 2026 · 11 h' });
  const s8 = elle(p, t0 + 70000, { touche: 'Je confirme', verdict: () => ({ ok: false, raison: 'erreur_technique' }) });
  return { p, s2, s4, posesApresPrise, s6, etapeApresRefus, s7, s8 };
}
function scnEcarts(m: Moteur) {
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  const t0 = cotonou('2026-10-09', '11:00');
  elle(p, t0, { texte: 'Bonjour, une place cette semaine ?' });
  const s2 = elle(p, t0 + 10000, { texte: 'euh je ne sais pas trop' });
  const ecarts1 = p.etat?.ecarts;
  const s3 = elle(p, t0 + 20000, { texte: 'hmm' });
  const motif = p.etat?.motifMain;
  const tenue = tenuParLAutomate(p.etat, null, t0 + 30000);
  /* Après la main, même une vraie demande de rendez-vous ne le réveille pas :
     l'équipe a la main. */
  /* Sans point d'interrogation : une question d'autre chose se tairait
     d'elle-même (R22), et ne prouverait rien ici. */
  const s4 = elle(p, t0 + 40000, { texte: 'allo, je voudrais un rendez-vous samedi' });
  p.main = { pauseLe: isoDe(t0 + 50000), jusqua: isoDe(t0 + 50000 + 3600000), rendueLe: isoDe(t0 + 60000) };
  const s5 = elle(p, t0 + 70000, { touche: 'La même chose' });
  return { p, t0, s2, ecarts1, s3, motif, tenue, s4, s5 };
}
function scnCreation(m: Moteur) {
  const p = parcours(m, NUM_INCONNUE, []);
  const t0 = cotonou('2026-10-09', '12:00');
  elle(p, t0, { texte: 'Bonjour' });
  const s2 = elle(p, t0 + 10000, { touche: 'Créer mes locks' });
  const s3 = elle(p, t0 + 20000, { texte: 'Non je veux directement la création' });
  elle(p, t0 + 30000, { touche: 'Voir les places' });
  elle(p, t0 + 40000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
  elle(p, t0 + 50000, { touche: 'Madame' });
  elle(p, t0 + 60000, { texte: "je m'appelle Grâce" });
  elle(p, t0 + 70000, { touche: 'Je confirme' });
  return { p, s2, s3 };
}
function scnEnfant(m: Moteur) {
  const p = parcours(m, NUM_INCONNUE, []);
  const t0 = cotonou('2026-10-09', '12:00');
  elle(p, t0, { texte: 'Bonjour, un rendez-vous pour ma fille' });
  const s2 = elle(p, t0 + 10000, { touche: 'Pour mon enfant' });
  elle(p, t0 + 20000, { touche: 'Mer. 14 oct. 2026 · 9 h' });
  elle(p, t0 + 30000, { touche: 'Madame' });
  elle(p, t0 + 40000, { texte: 'Sika' });
  elle(p, t0 + 50000, { touche: 'Je confirme' });
  return { p, s2 };
}
function scnFamille(m: Moteur) {
  const p = parcours(m, NUM_NAFFI, [NAFFI, KEMI]);
  const t0 = cotonou('2026-10-09', '09:30');
  const s1 = elle(p, t0, { texte: 'Bonjour je voudrais un rdv' });
  const s2 = elle(p, t0 + 10000, { touche: 'Pour Kemi' });
  elle(p, t0 + 20000, { touche: 'Entretenir ses locks' });
  elle(p, t0 + 30000, { touche: 'KLƆKLƆ™ Essentiel' });
  const s5 = elle(p, t0 + 40000, { touche: 'Mar. 13 oct. 2026 · 14 h' });
  const s6 = elle(p, t0 + 50000, { touche: 'Je confirme' });
  const q = parcours(m, NUM_NAFFI, [NAFFI, KEMI]);
  elle(q, t0, { texte: 'Bonjour je voudrais un rdv' });
  const s7 = elle(q, t0 + 10000, { touche: 'Une autre personne' });
  return { p, q, s1, s2, s5, s6, s7 };
}
function scnRien(m: Moteur) {
  const t0 = cotonou('2026-10-09', '10:00');
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  const s1 = elle(p, t0, { texte: 'Merci pour hier, je suis ravie' });
  const s2 = elle(p, t0 + 1000, { texte: 'je serai en retard de 10 minutes' });
  const s3 = elle(p, t0 + 2000, { texte: "C'est combien la reprise de racines ?" });
  const i = parcours(m, NUM_INCONNUE, []);
  const s4 = elle(i, t0, { texte: 'Bonsoir' });
  const k = parcours(m, NUM_INCONNUE, []);
  k.premier = false;
  const s5 = elle(k, t0, { texte: 'Bonsoir' });
  const v = parcours(m, NUM_INCONNUE, []);
  const s6 = elle(v, t0, { texte: '', type: 'audio' });
  return { parcours: [p, i, k, v], s1, s2, s3, s4, s5, s6 };
}
function scnNuit(m: Moteur) {
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  const t0 = cotonou('2026-10-09', '23:10');
  const s1 = elle(p, t0, { texte: 'Je voudrais réserver' });
  const s2 = elle(p, t0 + 10000, { touche: 'Parler à la Maison' });
  const q = parcours(m, NUM_NAFFI, [NAFFI]);
  const t1 = cotonou('2026-10-10', '20:30');
  elle(q, t1, { texte: 'Je voudrais réserver' });
  const s3 = elle(q, t1 + 10000, { touche: 'Parler à la Maison' });
  const r = parcours(m, NUM_NAFFI, [NAFFI]);
  const t2 = cotonou('2026-10-13', '02:00');
  elle(r, t2, { texte: 'Je voudrais réserver' });
  const s4 = elle(r, t2 + 10000, { touche: 'Parler à la Maison' });
  const s = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(s, cotonou('2026-10-09', '11:00'), { texte: 'Je voudrais réserver' });
  const s5 = elle(s, cotonou('2026-10-09', '11:01'), { touche: 'Parler à la Maison' });
  /* Elle réserve en pleine nuit, jusqu'au bout. */
  const n = parcours(m, NUM_NAFFI, [NAFFI]);
  const t3 = cotonou('2026-10-09', '23:40');
  elle(n, t3, { texte: 'Je voudrais un rendez-vous' });
  elle(n, t3 + 10000, { touche: 'La même chose' });
  elle(n, t3 + 20000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  const s6 = elle(n, t3 + 30000, { touche: 'Je confirme' });
  return { parcours: [p, q, r, s, n], p, s1, s2, s3, s4, s5, n, s6 };
}
function scnAnnulations(m: Moteur) {
  const t0 = cotonou('2026-10-09', '11:00');
  const jm = parcours(m, NUM_NAFFI, [NAFFI]);
  const s1 = elle(jm, t0, { texte: "Est-ce que je peux passer aujourd'hui ?" });
  const k = parcours(m, NUM_NAFFI, [NAFFI]);
  const s2 = elle(k, t0, { texte: 'Bonjour, je dois annuler mon rendez-vous de samedi' });
  const k2 = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(k2, t0, { texte: 'Je voudrais un rendez-vous' });
  const s3 = elle(k2, t0 + 10000, { texte: 'non finalement annuler' });
  const k3 = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(k3, t0, { texte: 'Je voudrais un rendez-vous' });
  const s4 = elle(k3, t0 + 10000, { texte: 'en fait je voudrais décaler mon rdv de mardi' });
  const l = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(l, t0, { texte: 'Je voudrais un rendez-vous' });
  const s5 = elle(l, t0 + 10000, { texte: 'Et ça coûte combien ?' });
  const md = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(md, t0, { texte: 'Je voudrais un rendez-vous' });
  const s6 = elle(md, t0 + 10000, { type: 'image', texte: 'une photo' });
  /* Juste après une confirmation, « je dois annuler » : il se tait. */
  const apres = scnConnue(m);
  const s7 = elle(apres.p, apres.t0 + 400000, { texte: 'Finalement je dois annuler ce rendez-vous' });
  return { parcours: [jm, k, k2, k3, l, md, apres.p], jm, k, k2, k3, l, md, apres, s1, s2, s3, s4, s5, s6, s7 };
}
function scnPorte(m: Moteur) {
  const t0 = cotonou('2026-10-09', '12:00');
  /* Les formules de la Maison nomment par erreur une création, une
     restauration et un devis ; le catalogue les laisse « ouverts ». */
  const p = parcours(m, NUM_INCONNUE, []);
  p.agenda = { formules: [{ serviceIds: ['vekpe-crea'] }, { serviceIds: ['finfin'] }, { serviceIds: ['sur-devis'] }, { serviceIds: ['plt-05'] }, { serviceIds: ['plt-05', 'vekpe-crea'] }] };
  elle(p, t0, { texte: 'Bonjour, je voudrais un rendez-vous' });
  const s2 = elle(p, t0 + 10000, { touche: 'Entretenir mes locks' });
  /* La consultation d'un parcours a changé d'identifiant : toutes les
     consultations sont proposées, jamais la création. */
  const q = parcours(m, NUM_INCONNUE, []);
  q.agenda = { consultationParParcours: { creation: 'sv-koko-ancienne' } };
  elle(q, t0, { texte: 'Bonjour' });
  const s3 = elle(q, t0 + 10000, { touche: 'Créer mes locks' });
  elle(q, t0 + 20000, { touche: 'KÒKÒ™ Origine' });
  elle(q, t0 + 30000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
  elle(q, t0 + 40000, { touche: 'Madame' });
  elle(q, t0 + 50000, { texte: 'Afi' });
  elle(q, t0 + 60000, { touche: 'Je confirme' });
  /* Sa dernière venue était une création : jamais « La même chose ». */
  const r = parcours(m, NUM_NAFFI, [{ ...NAFFI, derniereVenue: { date: '2026-09-12', serviceIds: ['vekpe-crea'] } }]);
  const s4 = elle(r, t0, { texte: 'Je voudrais un rendez-vous' });
  return { parcours: [p, q, r], p, q, r, s2, s3, s4 };
}
function scnPlafond(m: Moteur) {
  const t0 = cotonou('2026-10-09', '11:00');
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
  elle(p, t0 + 1000, { touche: 'La même chose' });
  let t = t0 + 2000;
  let tours = 0;
  while (p.envoyes.length < 10 && tours < 30) {
    const der = p.envoyes.at(-1);
    if (der?.etape === 'places') {
      const place = (der.lignes ?? []).find((l) => /^MND:\d+:place:/.test(l.id));
      if (!place) throw new Error('plus de place a toucher');
      elle(p, t, { touche: place.titre });
    } else elle(p, t, { touche: 'Une autre heure' });
    t += 1000;
    tours += 1;
  }
  const dix = p.envoyes.length;
  const onzieme = elle(p, t, { touche: (p.envoyes.at(-1)?.lignes ?? []).find((l) => /:place:/.test(l.id))?.titre ?? 'Une autre heure' });
  /* Dix messages d'hier ne comptent plus. */
  const q = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(q, t0, { texte: 'Je voudrais un rendez-vous' });
  q.etat!.envois = Array.from({ length: 10 }, (_, i) => isoDe(t0 + 3000 - 25 * 3600000 - i * 60000));
  const veille = elle(q, t0 + 3000, { touche: 'La même chose' });
  return { p, q, dix, onzieme, veille };
}
function scnVieuxToucher(m: Moteur) {
  const t0 = cotonou('2026-10-09', '11:00');
  const o = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(o, t0, { texte: 'Je voudrais un rendez-vous' });
  elle(o, t0 + 1000, { touche: 'La même chose' });
  const vieuxPlaces = o.envoyes.at(-1)!;
  elle(o, t0 + 2000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  const premierRecap = o.envoyes.at(-1)!;
  const vieille = (vieuxPlaces.lignes ?? []).find((l) => l.titre === 'Mar. 13 oct. 2026 · 9 h')!;
  const sV = elle(o, t0 + 3000, { id: vieille.id, touche: vieille.titre });
  /* Une autre heure, une autre place : le PREMIER « Je confirme » est
     désormais un vieux toucher, il ne pose rien. */
  elle(o, t0 + 4000, { touche: 'Une autre heure' });
  elle(o, t0 + 5000, { touche: 'Mar. 13 oct. 2026 · 14 h' });
  const vieuxOui = (premierRecap.boutons ?? []).find((b) => b.titre === 'Je confirme')!;
  const sOui = elle(o, t0 + 6000, { id: vieuxOui.id, touche: 'Je confirme' });
  const posesApresVieuxOui = o.poses.length;
  const sNeuf = elle(o, t0 + 7000, { touche: 'Je confirme' });
  return { o, sV, sOui, posesApresVieuxOui, sNeuf };
}
function scnOuiTape(m: Moteur) {
  const t0 = cotonou('2026-10-09', '11:00');
  const p = parcours(m, NUM_NAFFI, [NAFFI]);
  elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
  elle(p, t0 + 1000, { touche: 'La même chose' });
  elle(p, t0 + 2000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  const s1 = elle(p, t0 + 3000, { texte: 'oui' });
  const s2 = elle(p, t0 + 4000, { texte: 'Je confirme' });
  return { p, s1, s2 };
}
function scnDiaspora(m: Moteur) {
  const t0 = cotonou('2026-10-09', '11:00');
  const p = parcours(m, NUM_FRANCE, [{ ...NAFFI, numeros: [NUM_FRANCE] }]);
  elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
  const s2 = elle(p, t0 + 1000, { touche: 'La même chose' });
  const s3 = elle(p, t0 + 2000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
  return { p, s2, s3 };
}
/** Tous les parcours, pour les juges des textes et des écritures. */
function tousLesParcours(m: Moteur): Parcours[] {
  const f = scnFamille(m);
  return [
    scnConnue(m).p, scnInconnue(m).p, scnPlacePrise(m).p, scnEcarts(m).p, scnCreation(m).p, scnEnfant(m).p,
    f.p, f.q, ...scnRien(m).parcours, ...scnNuit(m).parcours, ...scnAnnulations(m).parcours, ...scnPorte(m).parcours,
    scnPlafond(m).p, scnVieuxToucher(m).o, scnOuiTape(m).p, scnDiaspora(m).p,
  ];
}

/* ── Les juges des textes de la Maison ──────────────────────────────── */
const MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\\.|févr\\.|avr\\.|juil\\.|sept\\.|oct\\.|nov\\.|déc\\.';
const DATE_SANS_ANNEE = new RegExp(`\\b(\\d{1,2}|1er) (${MOIS})(?! \\d{4})`, 'i');
/* « 17/10 » sans son année ; jamais le « 01/20 » du milieu de « 30/01/2027 »
   (relecture du 9 octobre 2026 : le juge criait sur les titres de fin janvier). */
const DATE_CHIFFRES_SANS_ANNEE = /(?<![\d/])\d{2}\/\d{2}(?!\/\d{4})/;
const textesDe = (m: MessageSortant): string[] => [m.corps, m.pied ?? '', m.bouton ?? '', ...(m.boutons ?? []).map((b) => b.titre), ...(m.lignes ?? []).flatMap((l) => [l.titre, l.description ?? ''])];
function fautesDesTextes(messages: readonly MessageSortant[]): string[] {
  const fautes: string[] = [];
  for (const m of messages) {
    for (const f of respecteMeta(m)) fautes.push(`Meta : ${f}`);
    for (const t of textesDe(m)) {
      for (const f of texteSain(t)) fautes.push(`${f} dans « ${t} »`);
      if (DATE_SANS_ANNEE.test(t)) fautes.push(`date sans annee : « ${t} »`);
      if (DATE_CHIFFRES_SANS_ANNEE.test(t)) fautes.push(`date chiffree sans annee : « ${t} »`);
      for (const mt of MAITRES) if (new RegExp(`\\b${mt}\\b`).test(t)) fautes.push(`nom de maitre dans « ${t} »`);
    }
    const civ = /\b(Madame|Mademoiselle|Monsieur)\b/.test(m.corps) || (m.lignes ?? []).some((l) => /^(Madame|Mademoiselle|Monsieur)$/.test(l.titre));
    if (!civ) fautes.push(`sans civilite : « ${m.corps} »`);
    const devise = m.corps.includes(DEVISE);
    if (devise !== (m.etape === 'confirme')) fautes.push(`devise ${devise ? 'hors de' : 'absente de'} la confirmation : « ${m.corps} »`);
    if (m.forme !== 'texte' && m.pied !== PIED) fautes.push('pied absent');
    if (!j(chargeGraph(m, NUM_NAFFI)).includes('"messaging_product":"whatsapp"')) fautes.push('charge Graph malformee');
  }
  return fautes;
}

/* ══ LE BANC DES FONCTIONS EDGE ══════════════════════════════════════
   Les vraies fonctions du dépôt, transformées par esbuild, branchées l'une
   à l'autre sur un faux Supabase (les RPC de 0102 et 0125 en JavaScript,
   au plus près du SQL ; plafond de mille lignes), un faux Graph et un faux
   web-push. L'horloge est figée au jeudi 15 octobre 2026, 10 h à Cotonou ;
   l'attente de 2,5 s « en train d'écrire » ne dure rien. */
const ENV: Record<string, string> = {
  WA_APP_SECRET: 'secret-de-l-app', CLE_SERVICE: 'cle-service-du-banc', SUPABASE_URL: 'https://banc.supabase.co',
  WA_TOKEN: 'jeton-meta', WA_PHONE_ID: 'PHONE', VAPID_PUBLIC: 'pub', VAPID_PRIVATE: 'priv', SUPABASE_ANON_KEY: 'anon',
};
const MAINTENANT_DU_BANC = Date.parse('2026-10-15T09:00:00Z');
const B = (): Any => (globalThis as Any).__BASE;
const numeroWaF = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
const CLE_TABLE: Record<string, string> = { documents: 'key', staff: 'user_id', push_subscriptions: 'endpoint' };
const cleDeTable = (t: string): string => CLE_TABLE[t] ?? 'id';
const table = (nom: string): Map<string, Any> => {
  const b = B();
  if (!b.tables[nom]) b.tables[nom] = new Map();
  return b.tables[nom];
};
const valeur = (ligne: Any, col: string): string | null => {
  const m = /^data((?:->[a-zA-Z0-9_]+)*)->>([a-zA-Z0-9_]+)$/.exec(col);
  if (m) {
    let v = ligne.data;
    for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
    v = v?.[m[2]];
    if (v === undefined || v === null) return null;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return ligne[col] ?? null;
};
class Requete {
  nom: string; filtres: ((l: Any) => boolean)[] = []; ordre: { c: string; asc: boolean } | null = null; borne: number | null = null;
  mode = 'select'; unique = false; cols = '*'; lignes: Any[] = []; ignore = false; patch: Any = null; rendLesEcrites = false;
  constructor(nom: string) { this.nom = nom; }
  select(cols = '*') { if (this.mode === 'upsert') { this.rendLesEcrites = true; return this; } this.cols = cols; return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) >= String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set((vs ?? []).map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  /* `or('a.is.null,a.neq.v')`, comme PostgREST (10 octobre 2026 : la fenetre de
     whatsapp-envoi ecarte les demandes du site). Une comparaison avec null
     n'est jamais vraie, sauf `is.null`. */
  or(txt: string) {
    const fs = txt.split(',').map((x) => {
      const m = /^(.+)\.(is|eq|neq)\.(.*)$/.exec(x.trim());
      if (!m) throw new Error(`or illisible : ${x}`);
      const [, c, op, v] = m;
      return (l: Any) => { const x2 = valeur(l, c); return op === 'is' ? (v === 'null' && x2 === null) : x2 !== null && (op === 'eq' ? String(x2) === v : String(x2) !== v); };
    });
    this.filtres.push((l) => fs.some((g) => g(l)));
    return this;
  }
  order(c: string, o: Any = {}) { this.ordre = { c, asc: o.ascending !== false }; return this; }
  limit(n: number) { this.borne = n; return this; }
  maybeSingle() { this.unique = true; return this; }
  single() { this.unique = true; return this; }
  upsert(lignes: Any, o: Any = {}) { this.mode = 'upsert'; this.lignes = Array.isArray(lignes) ? lignes : [lignes]; this.ignore = !!o.ignoreDuplicates; return this; }
  insert(lignes: Any) { this.mode = 'upsert'; this.lignes = Array.isArray(lignes) ? lignes : [lignes]; this.ignore = false; return this; }
  update(patch: Any) { this.mode = 'update'; this.patch = patch; return this; }
  delete() { this.mode = 'delete'; return this; }
  then(ok: Any, ko: Any) { return Promise.resolve().then(() => this.execute()).then(ok, ko); }
  execute(): Any {
    const b = B();
    b.requetes.push({ table: this.nom, mode: this.mode, cols: this.cols });
    if (b.pannes?.[this.nom]) return { data: null, error: { message: `panne simulee sur ${this.nom}` } };
    const t = table(this.nom);
    const cle = cleDeTable(this.nom);
    const maintenant = new Date().toISOString();
    if (this.mode === 'upsert') {
      const ecrites: Any[] = [];
      for (const l of this.lignes) {
        const id = l[cle];
        if (t.has(id) && this.ignore) continue;
        const ligne = { ...structuredClone(l), updated_at: maintenant };
        t.set(id, ligne);
        ecrites.push(structuredClone(ligne));
      }
      return { data: this.rendLesEcrites ? ecrites.map((l) => ({ id: l[cle] })) : null, error: null };
    }
    let lignes = [...t.values()].filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      b.misesAJour.push({ table: this.nom, patch: structuredClone(this.patch) });
      for (const l of lignes) { Object.assign(l, structuredClone(this.patch)); l.updated_at = maintenant; }
      return { data: null, error: null };
    }
    if (this.mode === 'delete') {
      for (const l of lignes) t.delete(l[cle]);
      return { data: null, error: null };
    }
    if (this.ordre) {
      const { c, asc } = this.ordre;
      lignes.sort((x, y) => { const a = String(valeur(x, c) ?? ''); const z = String(valeur(y, c) ?? ''); return (a < z ? -1 : a > z ? 1 : 0) * (asc ? 1 : -1); });
    }
    lignes = lignes.slice(0, Math.min(this.borne ?? 1000, 1000));
    const vues = lignes.map((l) => (this.cols === 'id' ? { id: l.id } : structuredClone(l)));
    if (this.unique) return { data: vues[0] ?? null, error: null };
    return { data: vues, error: null };
  }
}
const ISO_FIL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const pauseActiveF = (main: Any, ici: string): boolean => {
  if (!main || typeof main !== 'object') return false;
  if (!ISO_FIL.test(main.pauseLe ?? '') || !ISO_FIL.test(main.jusqua ?? '')) return false;
  if (!(Date.parse(main.jusqua) > Date.parse(ici))) return false;
  return !(ISO_FIL.test(main.rendueLe ?? '') && Date.parse(main.rendueLe) >= Date.parse(main.pauseLe));
};
const minutesF = (t: unknown): number | null => { const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(t ?? '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const dureeDuRdvF = (a: Any): number => {
  const e = String(a?.dureeMin ?? '').trim();
  if (/^\d{1,6}(\.\d+)?$/.test(e) && Number(e) >= 1) return Math.min(1440, Math.round(Number(e)));
  const svc = table('catalog_services');
  const ids = Array.isArray(a?.serviceIds) ? a.serviceIds : [];
  const total = ids.reduce((s: number, id: string) => { const d = svc.get(id)?.data?.durationMin; return s + (/^\d{1,6}$/.test(String(d ?? '')) ? Number(d) : 60); }, 0);
  return Math.max(60, total || 60);
};
const jourDeCotonouF = (plus = 0): string => new Date(Date.now() + 3600000 + plus * 86400000).toISOString().slice(0, 10);
const RPC: Record<string, (a: Any, client: Any) => Any> = {
  tete_du_numero: ({ n }) => B().tetes[numeroWaF(n)] ?? { tiroir: 'clientes' },
  tiroir_du_numero: ({ n }) => (B().tetes[numeroWaF(n)] ?? { tiroir: 'clientes' }).tiroir,
  is_staff: (_a, client) => /^Bearer staff/.test(client.auth ?? ''),
  est_direction: (_a, client) => /^Bearer staff-direction/.test(client.auth ?? ''),
  fiches_du_numero: ({ n }) => {
    const num = numeroWaF(n);
    if (num.length < 8) return [];
    const vivants = [...table('clients').values()].filter((c) => String(c.data?.archived ?? '') !== 'true');
    const trouvees = vivants.filter((c) => numeroWaF(c.data?.phone) === num || numeroWaF(c.data?.phone2) === num)
      .map((c) => ({ c, parPhone: numeroWaF(c.data?.phone) === num, parFamille: false }));
    const fams = new Set(trouvees.map((t) => t.c.data?.familyId).filter(Boolean));
    const famille = vivants.filter((c) => fams.has(c.data?.familyId) && !trouvees.some((t) => t.c.id === c.id))
      .map((c) => ({ c, parPhone: false, parFamille: true }));
    const rdvs = [...table('appointments').values()];
    return [...trouvees, ...famille]
      .sort((a, b) => (Number(b.parPhone) - Number(a.parPhone)) || (Number(a.parFamille) - Number(b.parFamille)) || (a.c.id < b.c.id ? -1 : 1))
      .slice(0, 8)
      .map(({ c, parPhone, parFamille }) => {
        const d = c.data ?? {};
        const venue = rdvs.filter((a) => a.data?.clientId === c.id && a.data?.status === 'honoré')
          .sort((x, y) => (`${y.data.date} ${y.data.time ?? ''}` > `${x.data.date} ${x.data.time ?? ''}` ? 1 : -1))[0];
        const f: Any = { id: c.id, nom: d.name ?? '', parPhone, numeros: [...new Set([numeroWaF(d.phone), numeroWaF(d.phone2)].filter(Boolean))] };
        if (d.birthday) f.naissance = d.birthday;
        const prochain = parFamille ? undefined : rdvs.filter((a) => a.data?.clientId === c.id && ['confirmé', 'en attente'].includes(a.data?.status) && a.data?.date >= jourDeCotonouF(0))
          .sort((x, y) => (`${x.data.date} ${x.data.time ?? ''}` < `${y.data.date} ${y.data.time ?? ''}` ? -1 : 1))[0];
        if (prochain) f.prochainRdv = { date: prochain.data.date, time: prochain.data.time ?? '' };
        if (['madame', 'mademoiselle', 'monsieur'].includes(d.civilite)) f.civilite = d.civilite;
        if (d.auMasculin === true) f.auMasculin = true;
        if (d.branchId) f.branchId = d.branchId;
        if (d.familyId) f.familyId = d.familyId;
        if (parFamille) f.parFamille = true;
        if (venue) f.derniereVenue = { date: venue.data.date, serviceIds: Array.isArray(venue.data.serviceIds) ? venue.data.serviceIds : [] };
        return f;
      });
  },
  creneaux_occupes: ({ p_branch, p_du, p_au }) => [...table('appointments').values()]
    .filter((a) => a.data?.branchId === p_branch && a.data?.date >= p_du && a.data?.date <= p_au
      && (a.data?.status ?? '') !== 'annulé' && (a.data?.time ?? '') !== '')
    .map((a) => ({ jour: a.data.date, maitre: a.data.master ?? '', debut: a.data.time, duree: dureeDuRdvF(a.data) })),
  pose_si_libre: ({ p_rdv, p_maitres, p_demande, p_envoi }) => {
    const b = B();
    b.poses.push({ p_rdv, p_maitres });
    const id = String(p_rdv?.id ?? '').trim();
    const branche = String(p_rdv?.branchId ?? '').trim();
    const jour = p_rdv?.date ?? '';
    const heure = p_rdv?.time ?? '';
    const cid = String(p_rdv?.clientId ?? '').trim();
    const num = numeroWaF(p_demande?.telephone ?? p_envoi?.numero ?? '');
    if (!/^rdv-/.test(id) || !branche || !/^\d{4}-\d{2}-\d{2}$/.test(jour) || !/^\d{2}:\d{2}$/.test(heure)
      || !['confirmé', 'en attente'].includes(p_rdv?.status)) return { ok: false, raison: 'creneau_invalide' };
    if (jour <= jourDeCotonouF(0) || jour > jourDeCotonouF(90)) return { ok: false, raison: 'creneau_hors_fenetre' };
    const appts = table('appointments');
    if (appts.has(id)) return { ok: true, verdict: 'deja', id, master: appts.get(id).data.master ?? '' };
    const vivants = [...appts.values()].filter((a) => a.data?.branchId === branche && a.data?.date === jour && (a.data?.status ?? '') !== 'annulé');
    const deja = vivants.find((a) => a.data.time === heure && ((cid && a.data.clientId === cid)
      || (!cid && num.length >= 8 && [...table('demandes').values()].some((d) => d.data?.apptId === a.id && numeroWaF(d.data?.telephone) === num))));
    if (deja) return { ok: true, verdict: 'deja_pose', id: deja.id, master: deja.data.master ?? '' };
    const reg = table('documents').get('mnd_settings')?.data ?? {};
    const capMaison = Math.floor(Number(reg.maxRdvParJourMaison ?? 0)) || 0;
    const capMaitre = Math.floor(Number(reg.maxRdvParJourMaitre ?? 0)) || 0;
    const sieges = Math.floor(Number(table('branches').get(branche)?.data?.seats ?? 0)) || 0;
    const debut = minutesF(heure) ?? 0;
    const duree = dureeDuRdvF(p_rdv);
    const avecHeure = vivants.filter((a) => (a.data.time ?? '') !== '');
    if (capMaison > 0 && avecHeure.length >= capMaison) return { ok: false, raison: 'creneau_plafond' };
    const chevauche = (a: Any) => { const d = minutesF(a.data.time); return d !== null && debut < d + dureeDuRdvF(a.data) && debut + duree > d; };
    if (sieges > 0 && vivants.filter(chevauche).length >= sieges) return { ok: false, raison: 'creneau_pris', detail: 'fauteuils' };
    let choisi: string | null = null;
    for (const m of (p_maitres?.length ? p_maitres : [''])) {
      const siens = vivants.filter((a) => (a.data.master ?? '') === m);
      if (capMaitre > 0 && siens.filter((a) => (a.data.time ?? '') !== '').length >= capMaitre) continue;
      if (!siens.some(chevauche)) { choisi = m; break; }
    }
    if (choisi === null) return { ok: false, raison: 'creneau_pris' };
    appts.set(id, { id, branch_id: branche, data: { ...p_rdv, id, branchId: branche, master: choisi, dureeMin: duree }, updated_at: new Date().toISOString() });
    if (p_demande && p_demande.id && !table('demandes').has(p_demande.id)) {
      table('demandes').set(p_demande.id, { id: p_demande.id, branch_id: branche, data: { ...p_demande, apptId: id } });
    }
    const ide = `conf-${id}-whatsapp`;
    if (p_envoi && !table('envois').has(ide)) table('envois').set(ide, { id: ide, branch_id: branche, data: { ...p_envoi, id: ide, apptId: id } });
    return { ok: true, verdict: 'pose', id, master: choisi, dureeMin: duree };
  },
  avance_le_fil: ({ p_numero, p_version, p_data, p_branch }) => {
    const num = numeroWaF(p_numero);
    if (num.length < 8 || !p_data || typeof p_data !== 'object') return null;
    /* UN AUTRE APPEL PASSE AVANT (le banc d'une course) : une fois. */
    const avant = B().avantAvance;
    if (avant) { B().avantAvance = null; avant(num); }
    const fils = table('fils_automate');
    if (pauseActiveF(fils.get(`main-${num}`)?.data, new Date().toISOString())) return null;
    const actuelle = Number(fils.get(`fil-${num}`)?.data?.version ?? 0) || 0;
    if (p_version === null || p_version === undefined || actuelle !== p_version) return null;
    B().ecrituresDuFil += 1;
    fils.set(`fil-${num}`, { id: `fil-${num}`, branch_id: p_branch ?? fils.get(`fil-${num}`)?.branch_id ?? null, data: { ...structuredClone(p_data), id: `fil-${num}`, numero: num, version: actuelle + 1 }, updated_at: new Date().toISOString() });
    return actuelle + 1;
  },
  pause_le_fil: ({ p_numero, p_par, p_motif }) => {
    const num = numeroWaF(p_numero);
    if (num.length < 8) return null;
    const heures = Math.min(72, Math.max(1, Number(table('documents').get('mnd_auto_config')?.data?.automateWa?.pauseHeures ?? 24) || 24));
    const ici = new Date();
    const ligne = { id: `main-${num}`, numero: num, pauseLe: ici.toISOString(), jusqua: new Date(ici.getTime() + heures * 3600000).toISOString(), motif: p_motif ?? 'envoi-equipe', ...(p_par ? { par: p_par } : {}) };
    table('fils_automate').set(`main-${num}`, { id: `main-${num}`, data: ligne, updated_at: ici.toISOString() });
    return ligne;
  },
};
const fauxSupabase = {
  createClient(_url: string, cle: string, opts: Any = {}) {
    const client: Any = {
      auth: opts?.global?.headers?.authorization ?? `Bearer ${cle}`,
      from: (nom: string) => new Requete(nom),
      rpc: async (nom: string, args: Any = {}) => {
        B().rpcs.push(nom);
        if (B().pannes?.[`rpc:${nom}`]) return { data: null, error: { message: `panne simulee : ${nom}` } };
        const f = RPC[nom];
        if (!f) return { data: null, error: { message: `function ${nom} does not exist` } };
        return { data: structuredClone(f(structuredClone(args), client)), error: null };
      },
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    };
    return client;
  },
  webpush: {
    setVapidDetails() {},
    async sendNotification(sub: Any, payload: string) { B().pushs.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return {}; },
  },
};
(globalThis as Any).__fauxSupabase = fauxSupabase;

/* Le dossier des fonctions transformées et des copies, effacé à la fin. */
let dossierDuBanc: string | null = null;
const dossier = (): string => (dossierDuBanc ??= mkdtempSync(path.join(os.tmpdir(), 'automate-wa-')));
let esbuildCharge: Promise<Any> | null = null;
const esbuild = (): Promise<Any> => (esbuildCharge ??= import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href));

type Fonction = (req: Request) => Promise<Response>;
const fonctionsChargees = new Map<string, Promise<Fonction>>();
/* Les chargements se suivent, jamais ensemble : chacun pose son `Deno.serve`
   juste avant d'évaluer son module. */
let fileDesChargements: Promise<unknown> = Promise.resolve();
function chargeLaFonction(nom: string): Promise<Fonction> {
  let p = fonctionsChargees.get(nom);
  if (!p) {
    const avant = fileDesChargements;
    p = avant.catch(() => null).then(async () => {
      const cale = path.join(dossier(), 'faux-npm.mjs');
      if (!existsSync(cale)) {
        writeFileSync(cale, `const f = globalThis.__fauxSupabase;
export const createClient = (...a) => f.createClient(...a);
export default { setVapidDetails: (...a) => f.webpush.setVapidDetails(...a), sendNotification: (...a) => f.webpush.sendNotification(...a) };
`);
      }
      const url = pathToFileURL(cale).href;
      const brut = lf(lit(`supabase/functions/${nom}/index.ts`));
      if (!brut) throw new Error(`fonction ${nom} introuvable`);
      const src = brut.split("'npm:@supabase/supabase-js@2'").join(`'${url}'`).split("'npm:web-push@3.6.7'").join(`'${url}'`);
      const { transform } = await esbuild();
      const { code } = await transform(src, { loader: 'ts', format: 'esm' });
      const f = path.join(dossier(), `${nom}.mjs`);
      writeFileSync(f, code);
      let h: Fonction | null = null;
      (globalThis as Any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (x: Fonction) => { h = x; } };
      await import(pathToFileURL(f).href);
      if (!h) throw new Error(`${nom} n ouvre pas sa porte (Deno.serve)`);
      return h as Fonction;
    });
    fileDesChargements = p;
    fonctionsChargees.set(nom, p);
  }
  return p;
}

/* L'horloge figée, l'attente raccourcie, le réseau et le journal des
   fonctions : posés le temps d'une règle du banc, rendus après. */
const VraiDate = Date;
const vraiSetTimeout = globalThis.setTimeout;
const vraiFetch = globalThis.fetch;
const vraiLog = console.log;
const vraiErreur = console.error;
const journal: string[] = [];
const graph: Any[] = [];
const pushNotify: Any[] = [];
const enFond: Promise<unknown>[] = [];
let appelsAutomate = 0;
async function avecLeBanc<T>(f: () => Promise<T>): Promise<T> {
  const decalage = MAINTENANT_DU_BANC - VraiDate.now();
  class DateDuBanc extends VraiDate {
    constructor(...a: Any[]) { if (a.length === 0) super(VraiDate.now() + decalage); else super(...(a as [Any])); }
    static now() { return VraiDate.now() + decalage; }
  }
  (globalThis as Any).Date = DateDuBanc;
  (globalThis as Any).setTimeout = (fn: Any, ms?: number, ...a: Any[]) => vraiSetTimeout(fn, (ms ?? 0) >= 1000 ? 2 : ms, ...a);
  console.log = (...a: Any[]) => { const t = a.join(' '); if (/^(whatsapp-|confirmation-rdv)/.test(t)) journal.push(t); else vraiLog(...a); };
  console.error = (...a: Any[]) => { const t = a.join(' '); if (/^(whatsapp-|confirmation-rdv)/.test(t)) journal.push(t); else vraiErreur(...a); };
  (globalThis as Any).fetch = async (url: Any, init: Any = {}) => {
    const u = String(url);
    if (u.startsWith('https://graph.facebook.com/')) {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      graph.push({ url: u, body });
      if (body.status === 'read') return new Response(JSON.stringify({ success: true }), { status: 200 });
      if (B().refuseGraph > 0) {
        B().refuseGraph -= 1;
        return new Response(JSON.stringify({ error: { message: 'Re-engagement message', code: 131047 } }), { status: 400 });
      }
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out-${graph.length}` }] }), { status: 200 });
    }
    if (u === `${ENV.SUPABASE_URL}/functions/v1/whatsapp-automate`) {
      appelsAutomate += 1;
      B().confies.push(JSON.parse(String(init.body)));
      if (B().porte) await B().porte;
      const automate = await chargeLaFonction('whatsapp-automate');
      return automate(new Request(u, init));
    }
    if (u === `${ENV.SUPABASE_URL}/functions/v1/push-notify`) {
      pushNotify.push(JSON.parse(String(init.body ?? '{}')));
      return new Response(JSON.stringify({ sent: 1 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  try {
    return await f();
  } finally {
    (globalThis as Any).Date = VraiDate;
    (globalThis as Any).setTimeout = vraiSetTimeout;
    (globalThis as Any).fetch = vraiFetch;
    console.log = vraiLog;
    console.error = vraiErreur;
  }
}
/** Le banc d'une règle : s'il plante, la règle crie, et les écarts déjà
    relevés (les lectures du texte) restent dits. */
async function auBanc(ecarts: string[], f: () => Promise<void>): Promise<void> {
  try { await avecLeBanc(f); } catch (e) { ecarts.push(`banc : plante : ${String((e as Error)?.stack ?? e).split('\n').slice(0, 2).join(' / ')}`); }
}
const avecTacheDeFond = (oui: boolean) => {
  if (oui) (globalThis as Any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { enFond.push(p); } };
  else delete (globalThis as Any).EdgeRuntime;
};

/* La Maison du banc : ouverte tous les jours de 9 h à 18 h, deux fauteuils,
   deux maîtres, Naffi venue le 12 septembre 2026 pour un lavage et ses
   racines. */
const SEMAINE_DU_BANC = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '18h00', closed: false }));
const NAFFI_E = '2290197000001';
const INCONNUE_E = '2290197000099';
const PRESTA_E = '2290197000077';
const indexe = (arr: Any[], cle = 'id') => new Map(arr.map((x) => [x[cle], x]));
function remetsLaBase(automateWa: Any, plus: Any = {}) {
  (globalThis as Any).__BASE = {
    tables: {
      documents: indexe([
        { key: 'mnd_settings', data: { hours: SEMAINE_DU_BANC, maxRdvParJourMaison: 0, maxRdvParJourMaitre: 0 } },
        { key: 'mnd_horaires_exceptions', data: [] },
        { key: 'mnd_vitrine_config', data: { siteMasques: {}, formulesRapides: [{ serviceIds: ['sv-klk-ess', 'sv-sinsin-ess'], venues: 5 }] } },
        { key: 'mnd_house_identity', data: { nom: 'Maison MND' } },
        { key: 'mnd_auto_config', data: { itineraire: 'Nous sommes à Akpakpa, face à la pharmacie.', ...(automateWa ? { automateWa } : {}) } },
        ...(plus.documents ?? []),
      ], 'key'),
      branches: indexe([{ id: 'maison', data: { flagship: true, status: 'active', masters: MAITRES, seats: 2 } }]),
      catalog_services: indexe([
        { id: 'sv-klk-ess', data: { name: 'KLƆKLƆ™ Essentiel', categoryId: 'cat-lavage', durationMin: 60, priceMode: 'fixe', priceXof: 5000 } },
        { id: 'sv-sinsin-ess', data: { name: 'SÍNSIN™ Essentiel', categoryId: 'cat-racines', durationMin: 90, priceMode: 'fixe', priceXof: 15000 } },
        { id: 'sv-koko-ori', data: { name: 'KÒKÒ™ Origine', categoryId: 'koko', durationMin: 45 } },
        { id: 'sv-vekpe', data: { name: 'VÈKPÈ™ Naissance', categoryId: 'atl-i-vekpe', durationMin: 240 } },
      ]),
      catalog_categories: indexe([
        { id: 'atl-ii-gbeji', data: { label: 'Entretien' } },
        { id: 'cat-lavage', data: { label: 'Lavages', parentId: 'atl-ii-gbeji' } },
        { id: 'cat-racines', data: { label: 'Racines', parentId: 'atl-ii-gbeji' } },
        { id: 'koko', data: { label: 'KÒKÒ' } },
        { id: 'atl-i-vekpe', data: { label: 'Naissance' } },
      ]),
      clients: indexe(plus.clients ?? [{ id: 'cli-naffi', data: { name: 'Naffi Morou', phone: '+229 01 97 00 00 01', branchId: 'maison' } }]),
      appointments: indexe([
        { id: 'rdv-old-1', branch_id: 'maison', data: { id: 'rdv-old-1', clientId: 'cli-naffi', branchId: 'maison', date: '2026-09-12', time: '10:00', status: 'honoré', serviceIds: ['sv-klk-ess', 'sv-sinsin-ess'] } },
        ...(plus.rdvs ?? []),
      ]),
      staff: indexe([{ user_id: 'u-dir', role: 'souverain' }, { user_id: 'u-staff', role: 'coiffeuse' }], 'user_id'),
      push_subscriptions: indexe([
        { endpoint: 'e-dir', p256dh: 'p', auth: 'a', client_id: 'u-dir' },
        { endpoint: 'e-staff', p256dh: 'p', auth: 'a', client_id: 'u-staff' },
      ], 'endpoint'),
      fils_automate: new Map(), messages_wa: new Map(), envois: indexe(plus.envois ?? []), demandes: new Map(), blocages: new Map(), traces: new Map(),
    },
    tetes: { [PRESTA_E]: { tiroir: 'prestataires', prestataireId: 'p-1' } },
    pannes: plus.pannes ?? {},
    requetes: [], rpcs: [], poses: [], pushs: [], confies: [], misesAJour: [], refuseGraph: 0, ecrituresDuFil: 0, porte: null,
  };
  graph.length = 0;
  pushNotify.length = 0;
  journal.length = 0;
  appelsAutomate = 0;
}
const T = (n: string) => table(n);
let horlogeMeta = 0;
let compteurMeta = 0;
const signe = (c: string) => `sha256=${createHmac('sha256', ENV.WA_APP_SECRET).update(Buffer.from(c, 'utf8')).digest('hex')}`;
const chargeMeta = (msgs: Any[]) => JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: 'PHONE' },
    contacts: msgs.map((m) => ({ wa_id: m.from, profile: { name: 'Profil' } })), messages: msgs,
  } }] }],
});
const message = (from: string, contenu: Any) => {
  horlogeMeta = Math.max(horlogeMeta + 3, Math.floor(Date.now() / 1000));
  compteurMeta += 1;
  const base = { from, id: `wamid.in-${compteurMeta}`, timestamp: String(horlogeMeta) };
  return typeof contenu === 'string' ? { ...base, type: 'text', text: { body: contenu } } : { ...base, ...contenu };
};
const requeteDeMeta = (c: string) => new Request('https://banc/functions/v1/whatsapp-webhook', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signe(c) }, body: c,
});
async function livre(c: string, o: { attendsLeFond?: boolean } = {}) {
  const webhook = await chargeLaFonction('whatsapp-webhook');
  const r = await webhook(requeteDeMeta(c));
  const rep = await r.json().catch(() => ({}));
  if (o.attendsLeFond !== false) await Promise.all(enFond.splice(0));
  return rep;
}
const ecrit = async (from: string, contenu: Any, o?: { attendsLeFond?: boolean }) => { const m = message(from, contenu); const c = chargeMeta([m]); await livre(c, o); return { m, c }; };
const touche = (from: string, ch: Any) => {
  if (!ch) throw new Error('choix introuvable dans le dernier message');
  return ecrit(from, ch.liste
    ? { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: ch.id, title: ch.titre } } }
    : { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: ch.id, title: ch.titre } } });
};
const ecritsA = (num: string) => graph.filter((g) => g.body.to === num && !g.body.status).map((g) => g.body);
const dernierA = (num: string) => ecritsA(num).at(-1);
const choixDe = (b: Any): Any[] => {
  if (b?.type !== 'interactive') return [];
  const i = b.interactive;
  if (i.type === 'button') return i.action.buttons.map((x: Any) => ({ id: x.reply.id, titre: x.reply.title }));
  return i.action.sections.flatMap((s: Any) => s.rows).map((x: Any) => ({ id: x.id, titre: x.title, description: x.description, liste: true }));
};
const corpsDe = (b: Any): string => (b?.type === 'text' ? b.text.body : b?.interactive?.body?.text ?? '');
const toutLeTexte = (b: Any) => [corpsDe(b), b?.interactive?.footer?.text ?? '', b?.interactive?.action?.button ?? '',
  ...choixDe(b).flatMap((c) => [c.titre, c.description ?? ''])].join('\n');
const choix = (num: string, titre: string) => choixDe(dernierA(num)).find((c) => c.titre === titre);
const fil = (num: string) => T('fils_automate').get(`fil-${num}`)?.data;
const pushsDepuis = (n: number) => B().pushs.slice(n);
/* Un MOT de mois (« demain » contient « mai », « semaine » aussi). */
const MOIS_RE = /(?:^|[^\p{L}])(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\.|févr\.|avr\.|juil\.|sept\.|oct\.|nov\.|déc\.)(?![\p{L}])/u;
function fautesDuBanc(num: string): string[] {
  const fautes: string[] = [];
  for (const b of ecritsA(num)) {
    const t = toutLeTexte(b);
    if (new RegExp(BANNI, 'i').test(t)) fautes.push('le mot banni');
    if (t.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');
    if (/\d[\d\s.,]*\s?(fcfa|cfa|xof|francs?|f)(?![\p{L}])/iu.test(t)) fautes.push(`un prix : ${t.slice(0, 60)}`);
    if (/\b(Team|Expert)\b/.test(t)) fautes.push('le nom d un maitre');
    if (!/\b(Madame|Mademoiselle|Monsieur)\b/.test(t)) fautes.push(`sans civilite : ${corpsDe(b).slice(0, 60)}`);
    for (const ligne of t.split('\n')) if (MOIS_RE.test(ligne) && !/20\d\d|\d{2}\/\d{2}\/20\d\d/.test(ligne)) fautes.push(`une date sans annee : ${ligne.slice(0, 60)}`);
    if (b.type === 'interactive') {
      const c = choixDe(b);
      if (!c.some((x) => /^MND:\d+:maison$/.test(x.id))) fautes.push('pas de sortie Parler a la Maison');
      if (b.interactive.type === 'button' && (c.length > 3 || c.some((x) => x.titre.length > 20))) fautes.push('boutons hors limites');
      if (b.interactive.type === 'list' && (c.length > 10 || c.some((x) => x.titre.length > 24 || (x.description ?? '').length > 72) || b.interactive.action.button.length > 20)) fautes.push('liste hors limites');
    }
  }
  return fautes;
}
const leJournalSeTait = (...nums: string[]): boolean => !journal.some((l) => nums.some((n) => l.includes(n) || l.includes(n.slice(3)))
  || /je voudrais|Naffi|Awa|rendez-vous samedi/i.test(l));

/* ══ LA COPIE EDGE DU DIALOGUE, EXÉCUTÉE ═════════════════════════════ */
async function laCopieDuDialogue(): Promise<Moteur> {
  const src = lf(lit(F_AUTO));
  const debut = src.indexOf('/* ⟨lecture-entiere⟩ */');
  const fin = src.indexOf('/* ⟨/automate-wa⟩ */');
  if (debut < 0 || fin < 0) throw new Error('la copie Edge n a pas ses reperes');
  const blocs = src.slice(debut, fin + '/* ⟨/automate-wa⟩ */'.length);
  const { transform } = await esbuild();
  const { code } = await transform(`${blocs}\nexport { etapeSuivante as __etapeSuivante, suiteDeLaPose as __suiteDeLaPose, tourDeLaCliente as __tourDeLaCliente };\n`, { loader: 'ts', format: 'esm' });
  const f = path.join(dossier(), `copie-du-dialogue-${Date.now()}.mjs`);
  writeFileSync(f, code);
  const m = await import(pathToFileURL(f).href) as Any;
  return { etapeSuivante: m.__etapeSuivante, suiteDeLaPose: m.__suiteDeLaPose, tourDeLaCliente: m.__tourDeLaCliente };
}

/* ══ LES RÈGLES ══════════════════════════════════════════════════════ */
const regles: Regle[] = [
  /* ══ R1 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R1', nom: 'R1 les parcours de la maquette : une cliente connue en quatre messages, une inconnue en sept',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const a = scnConnue(ORIGINAL);
      vrai('A1 la meme chose ? Bonsoir, la civilite, la derniere venue avec son annee', a.s1.messages[0]?.etape === 'meme'
        && corps(a.s1).startsWith('Bonsoir Madame Naffi, merci de votre message. Votre dernière venue : KLƆKLƆ™ Essentiel et SÍNSIN™ Essentiel, le samedi 12 septembre 2026.'), corps(a.s1));
      vaut('A1 ... ses trois boutons', ['La même chose', 'Autre chose', 'Parler à la Maison'], boutonsDe(a.s1));
      vrai('A2 les places : le samedi voulu d abord, deux par jour, l annee dans le titre', a.s2.messages[0]?.etape === 'places'
        && lignesDe(a.s2)[0] === 'Sam. 10 oct. 2026 · 9 h' && lignesDe(a.s2)[1] === 'Sam. 10 oct. 2026 · 14 h' && (lignesDe(a.s2)[2] ?? '').startsWith('Sam. 17 oct. 2026'), lignesDe(a.s2).join(' | '));
      vrai('A2 ... sept places au plus, puis Un autre jour et Parler a la Maison', lignesDe(a.s2).length <= 9 && lignesDe(a.s2).at(-2) === 'Un autre jour' && lignesDe(a.s2).at(-1) === 'Parler à la Maison');
      vaut('A3 le recapitulatif', 'Voici votre rendez-vous, Madame Naffi : KLƆKLƆ™ Essentiel et SÍNSIN™ Essentiel, samedi 10 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(a.s3));
      vaut('A3 ... Je confirme, Une autre heure, Parler a la Maison', ['Je confirme', 'Une autre heure', 'Parler à la Maison'], boutonsDe(a.s3));
      vrai('A4 c est confirme, avec la devise', a.s4.messages[0]?.etape === 'confirme'
        && corps(a.s4).startsWith("C'est confirmé, Madame Naffi : votre rendez-vous est retenu le samedi 10 octobre 2026 à 9 h. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.")
        && corps(a.s4).endsWith(DEVISE), corps(a.s4));
      vaut('A4 l alerte au personnel : le prenom seul, la date avec l annee', { titre: 'Nouveau rendez-vous par WhatsApp', corps: 'Naffi, samedi 10 octobre 2026 à 9 h' },
        { titre: a.s4.alerte?.titre, corps: a.s4.alerte?.corps });
      vaut('A  quatre messages de la Maison pour toute la reservation', 4, a.avantMerci);
      vaut('A  une pose, sur sa fiche, confirmee, source whatsapp, sa duree, sans demande', { n: 1, clientId: 'c-naffi', status: 'confirmé', source: 'whatsapp', dureeMin: 105, date: '2026-10-10', time: '09:00', demande: false },
        { n: a.p.poses.length, clientId: a.p.poses[0]?.rdv.clientId, status: a.p.poses[0]?.rdv.status, source: a.p.poses[0]?.rdv.source, dureeMin: a.p.poses[0]?.rdv.dureeMin, date: a.p.poses[0]?.rdv.date, time: a.p.poses[0]?.rdv.time, demande: !!a.p.poses[0]?.demande });
      vrai('A  jamais le maitre : la Maison attribue (aucun champ master)', !a.p.poses.some((x) => 'master' in x.rdv));
      const b = scnInconnue(ORIGINAL);
      vaut('B1 bienvenue, comment prendre soin de votre couronne', 'Bonjour Madame, bienvenue à la Maison MND. Comment pouvons-nous prendre soin de votre couronne ?', corps(b.s1));
      vaut('B1 ... les quatre besoins et la Maison', ['Entretenir mes locks', 'Créer mes locks', 'Réparer mes locks', 'Pour mon enfant', 'Parler à la Maison'], lignesDe(b.s1));
      vaut('B2 quel rituel : les formules reservables, Autre soin, la Maison', ['KLƆKLƆ™ Essentiel', 'KLƆKLƆ™ Essentiel + 1', 'Autre soin', 'Parler à la Maison'], lignesDe(b.s2));
      vrai('B4 la civilite, en liste', b.s4.messages[0]?.etape === 'civilite' && b.s4.messages[0]?.forme === 'liste'
        && corps(b.s4) === 'Pour inscrire votre rendez-vous, comment devons-nous vous appeler ?', corps(b.s4));
      vaut('B5 et votre prenom, Mademoiselle', 'Et votre prénom, Mademoiselle ?', corps(b.s5));
      vaut('B6 le recapitulatif dit Mademoiselle Awa', 'Voici votre rendez-vous, Mademoiselle Awa : KLƆKLƆ™ Essentiel, mardi 13 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(b.s6));
      vrai('B7 c est confirme, Mademoiselle Awa', corps(b.s7).startsWith("C'est confirmé, Mademoiselle Awa : votre rendez-vous est retenu le mardi 13 octobre 2026 à 9 h."), corps(b.s7));
      vaut('B  sept messages de la Maison', 7, b.p.envoyes.length);
      const d = b.p.poses[0]?.demande;
      vaut('B  la demande : whatsapp, rdv, sa civilite, son prenom, +229, le consentement a l heure du Je confirme, sans fiche',
        { source: 'whatsapp', genre: 'rdv', civilite: 'mademoiselle', prenom: 'Awa', telephone: `+${NUM_INCONNUE}`, consentementLe: isoDe(b.t0 + 120000), besoin: 'entretien', clientId: '', clientName: 'Awa', apptId: b.p.poses[0]?.rdv.id },
        { source: d?.source, genre: d?.genre, civilite: d?.civilite, prenom: d?.prenom, telephone: d?.telephone, consentementLe: d?.consentementLe, besoin: d?.besoin, clientId: b.p.poses[0]?.rdv.clientId, clientName: b.p.poses[0]?.rdv.clientName, apptId: d?.apptId });
      return ecarts;
    },
    pannes: [
      { nom: 'une connue repasse par le besoin (plus de La meme chose)', mute: [P(AUTO, '    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, true);', '    if (fiches.length === 1 && titulaire) return dire(msgBesoin(false, true));')] },
      { nom: 'l inconnue sans civilite (le prenom d abord)', mute: [P(AUTO, '      if (!base.panier.civilite) return dire(msgCivilite(false));', '      if (!base.panier.civilite && base.panier.prenom) return dire(msgCivilite(false));')] },
    ],
  },

  /* ══ R2 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R2', nom: 'R2 rien ne se pose sans le toucher Je confirme : ni un oui tape, ni un vieux bouton',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const a = scnConnue(ORIGINAL);
      vaut('la meme chose, l heure, le recapitulatif n ecrivent rien', [0, 0, 0], [a.s1, a.s2, a.s3].map((s) => s.ecritures.length));
      vaut('une seule ecriture, et c est le toucher Je confirme (geste oui)', ['oui'], a.p.gestesDesPoses);
      const o = scnOuiTape(ORIGINAL);
      vrai('un oui tape au recapitulatif ne pose rien : la relance, la meme etape', o.s1.ecritures.length === 0 && o.s1.messages[0]?.etape === 'recap'
        && corps(o.s1) === "Touchez l'un des choix ci-dessous, Madame Naffi, ou Parler à la Maison.", corps(o.s1));
      vrai('« Je confirme » tape (un second ecart) ne pose rien : la main passe', o.s2.ecritures.length === 0 && o.p.etat?.motifMain === 'ecarts' && o.p.poses.length === 0);
      const v = scnVieuxToucher(ORIGINAL);
      vrai('un Je confirme d un ancien recapitulatif ne pose rien, il renvoie le recapitulatif', v.posesApresVieuxOui === 0 && v.sOui.ecritures.length === 0 && v.sOui.messages[0]?.etape === 'recap', corps(v.sOui));
      vrai('... le Je confirme du recapitulatif en cours pose la place choisie en dernier', v.o.poses.length === 1 && v.o.poses[0].rdv.date === '2026-10-13' && v.o.poses[0].rdv.time === '14:00', j(v.o.poses.map((x) => [x.rdv.date, x.rdv.time])));
      const tous = tousLesParcours(ORIGINAL);
      const gestes = tous.flatMap((p) => p.gestesDesPoses);
      vrai('dans tous les parcours, chaque ecriture vient du toucher Je confirme (geste oui)', gestes.length >= 6 && gestes.every((g) => g === 'oui'), gestes.join(', '));
      return ecarts;
    },
    pannes: [
      { nom: 'un oui tape pose le rendez-vous', mute: [P(AUTO, "      case 'recap':\n        if (desMots) {", "      case 'recap':\n        if (/\\boui\\b|confirm/.test(sansAccentsWa(t.texte))) return poseLeRendezVous();\n        if (desMots) {")] },
      { nom: 'un vieux Je confirme pose encore', mute: [P(AUTO, '      const valide = ch.version >= base.versionDeLEtape && ch.version < version;', '      const valide = ch.version < version;')] },
    ],
  },

  /* ══ R3 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R3', nom: 'R3 l identifiant vient du toucher : rdv-wa-<cle du waId>, et une seconde livraison de Meta ne pose rien',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const a = scnConnue(ORIGINAL);
      const cle = cleCourte(`wamid.${NUM_NAFFI}.4`);
      const pose = a.p.poses[0];
      vaut('le rendez-vous, la ligne d envoi : tires du waId du Je confirme', { rdv: `rdv-wa-${cle}`, envoi: `conf-rdv-wa-${cle}-whatsapp`, statut: 'en cours', apptId: `rdv-wa-${cle}` },
        { rdv: pose?.rdv.id, envoi: pose?.envoi.id, statut: pose?.envoi.statut, apptId: pose?.envoi.apptId });
      const b = scnInconnue(ORIGINAL);
      const cleB = cleCourte(`wamid.${NUM_INCONNUE}.7`);
      vaut('la demande d une inconnue porte la meme cle', { rdv: `rdv-wa-${cleB}`, demande: `dem-wa-${cleB}` }, { rdv: b.p.poses[0]?.rdv.id, demande: b.p.poses[0]?.demande?.id });
      vrai('la cle est stable, courte, et deux messages font deux cles (2000 essais)', (() => {
        const vues = new Set<string>();
        for (let i = 0; i < 2000; i += 1) {
          const w = `wamid.HBgLMjI5MDE5NzAwMDAwMRUCABIYFDNB${i}`;
          const c = cleCourte(w);
          if (c !== cleCourte(w) || !/^[0-9a-z]{14}$/.test(c)) return false;
          vues.add(c);
        }
        return vues.size === 2000;
      })());
      /* LA SECONDE LIVRAISON : le même message, une fois le tour écrit. */
      const t = a.t0 + 120000;
      const double = tourDeLaCliente([{ waId: `wamid.${NUM_NAFFI}.4`, quand: isoDe(t), texte: 'Je confirme', type: 'interactive', sens: 'entrant', bouton: { id: 'MND:3:oui', texte: 'Je confirme' } }], a.p.etat?.traites ?? []);
      vaut('la seconde livraison du Je confirme n est pas neuve', [], double.waIds);
      const s = etapeSuivante(a.p.etat, double, ctxDe(a.p, t + 1000));
      vaut('... et ne fait ni message, ni ecriture, ni tour', { pris: false, messages: 0, ecritures: 0 }, { pris: s.pris, messages: s.messages.length, ecritures: s.ecritures.length });
      const c = scnConnue(ORIGINAL);
      const relivre = tourDeLaCliente([{ waId: `wamid.${NUM_NAFFI}.2`, quand: isoDe(c.t0 + 60000), texte: 'La même chose', type: 'interactive', sens: 'entrant', bouton: { id: 'MND:1:meme', texte: 'La même chose' } }], c.p.etat?.traites ?? []);
      vaut('une relivraison d un toucher plus ancien non plus', [], relivre.waIds);
      const deux = tourDeLaCliente([
        { waId: 'w1', quand: isoDe(a.t0), texte: 'Bonjour', type: 'text', sens: 'entrant' },
        { waId: 'w2', quand: isoDe(a.t0 + 2000), texte: 'je voudrais un rendez-vous', type: 'text', sens: 'entrant' },
      ], []);
      vaut('deux messages coup sur coup font un seul tour', { waIds: ['w1', 'w2'], texte: 'Bonjour\nje voudrais un rendez-vous' }, { waIds: deux.waIds, texte: deux.texte });
      const sql = sqlSans(lit(M0125));
      vrai('le verrou (pose_si_libre) reconnait la meme pose rejouee : deja, rien de plus', /where a\.id = rdv_id;\s*if found then\s*return jsonb_build_object\('ok', true, 'verdict', 'deja'/.test(corpsSql(sql, 'pose_si_libre')));
      return ecarts;
    },
    pannes: [
      { nom: 'la cle vient de l horloge', mute: [P(AUTO, '    const cle = cleCourte(waId);', '    const cle = cleCourte(`${waId}:${maintenant}`);')] },
      { nom: 'une seconde livraison redevient neuve', mute: [P(AUTO, ".filter((m) => (m.sens ?? 'entrant') === 'entrant' && m.canal !== 'site' && !!m.waId && !deja.has(m.waId))", ".filter((m) => (m.sens ?? 'entrant') === 'entrant' && m.canal !== 'site' && !!m.waId)")] },
      { nom: 'les messages traites s oublient', mute: [P(AUTO, '    base.traites = [...new Set([...base.traites, ...tour.waIds])].slice(-5);', '    base.traites = [];')] },
      { nom: 'le verrou repose une pose rejouee', mute: [P(M0125, "    return jsonb_build_object('ok', true, 'verdict', 'deja', 'id', deja.id, 'master', deja.maitre);", '    null;')] },
    ],
  },

  /* ══ R4 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R4', nom: 'R4 la place prise entre-temps : rien n est pose, et les places les plus proches',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const c = scnPlacePrise(ORIGINAL);
      vrai('samedi matin d abord, deux par jour', lignesDe(c.s2)[0] === 'Sam. 10 oct. 2026 · 9 h' && lignesDe(c.s2)[1] === 'Sam. 10 oct. 2026 · 10 h' && lignesDe(c.s2)[2] === 'Sam. 17 oct. 2026 · 9 h', lignesDe(c.s2).join(' | '));
      vaut('prise avant le Je confirme : les places les plus proches', "Cette heure vient d'être prise, Madame Naffi. Voici les places les plus proches.", corps(c.s4));
      vrai('... rien n est pose, et l heure prise n est plus proposee', c.posesApresPrise === 0 && c.s4.ecritures.length === 0 && !lignesDe(c.s4).includes('Sam. 10 oct. 2026 · 9 h') && lignesDe(c.s4)[0] === 'Sam. 10 oct. 2026 · 10 h', lignesDe(c.s4).join(' | '));
      vaut('refusee par le verrou : les places les plus proches', "Cette heure vient d'être prise, Madame Naffi. Voici les places les plus proches.", corps(c.s6));
      vrai('... sans la place refusee, et l etape revient aux places', !lignesDe(c.s6).includes('Sam. 10 oct. 2026 · 10 h') && c.etapeApresRefus === 'places', lignesDe(c.s6).join(' | '));
      vrai('... aucune alerte de rendez-vous pose', !c.s6.alerte && !c.s4.alerte);
      vrai('une autre erreur du verrou : la main passe, dite', c.s7.messages[0]?.etape === 'recap' && c.s8.messages[0]?.etape === 'main' && c.p.etat?.motifMain === 'erreur', corps(c.s8));
      return ecarts;
    },
    pannes: [
      { nom: 'le Je confirme ne rejoue pas la place', mute: [P(AUTO, '    if (!libre) return placePrise(place);\n', '')] },
      { nom: 'le refus du verrou passe la main au lieu de reproposer', mute: [P(AUTO, "    if (['creneau_pris', 'creneau_plafond', 'creneau_complet', 'creneau_hors_ouverture', 'creneau_ferme'].includes(verdict.raison) && p.date && p.time) {", '    if (false) {')] },
      { nom: 'la place refusee est reproposee', mute: [P(AUTO, '      .filter((p) => !(o.exclure && p.iso === o.exclure.iso && p.heure === o.exclure.heure));', '      .filter(() => true);')] },
    ],
  },

  /* ══ R5 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R5', nom: 'R5 la porte de la consultation : creation, enfant, restauration, devis jamais poses ; le jour meme passe la main',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const e = scnCreation(ORIGINAL);
      vaut('une premiere couronne : le KOKO Origine et ses places', 'Une première couronne commence toujours par une consultation, Madame : le KÒKÒ™ Origine. Nous y étudions votre texture et votre cuir chevelu, et choisissons ensemble votre calibre. Voici les prochaines places.', corps(e.s2));
      vrai('elle insiste : la creation se decide apres la consultation', corps(e.s3) === 'La création se décide après la consultation, Madame. Une personne de la Maison peut vous en dire plus.'
        && j(boutonsDe(e.s3)) === j(['Voir les places', 'Parler à la Maison']), corps(e.s3));
      vaut('la pose ne porte que la consultation', [['sv-koko-ori'], 'creation'], [e.p.poses[0]?.rdv.serviceIds, e.p.poses[0]?.demande?.besoin]);
      const f = scnEnfant(ORIGINAL);
      vaut('pour un enfant : la consultation MND Kids, Conseil et diagnostic', 'Pour un enfant, tout commence par un échange avec ses parents, Madame : le Conseil et diagnostic. Voici les prochaines places.', corps(f.s2));
      vaut('... et c est elle qui se pose', [['svc-doto-conseil'], 'enfant'], [f.p.poses[0]?.rdv.serviceIds, f.p.poses[0]?.demande?.besoin]);
      const r = scnPorte(ORIGINAL);
      vaut('des formules qui nomment creation, restauration ou devis ne sont jamais proposees', ['KLƆKLƆ™ Essentiel', 'Autre soin', 'Parler à la Maison'], lignesDe(r.s2));
      vrai('une consultation renommee : toutes les consultations, jamais la creation', corps(r.s3) === 'Quelle consultation souhaitez-vous, Madame ?'
        && j(lignesDe(r.s3)) === j(['KÒKÒ™ Origine', 'KÒKÒ™ Suivi', 'Conseil et diagnostic', 'Parler à la Maison']), `${corps(r.s3)} ${lignesDe(r.s3).join(' | ')}`);
      vaut('... et la pose est la consultation choisie', ['sv-koko-ori'], r.q.poses[0]?.rdv.serviceIds);
      vrai('une derniere venue de creation : jamais La meme chose', r.s4.messages[0]?.etape === 'besoin', corps(r.s4));
      const toutes = tousLesParcours(ORIGINAL).flatMap((p) => p.poses);
      vaut('dans tous les parcours, aucune creation, restauration ni devis pose', [], toutes.flatMap((x) => x.rdv.serviceIds).filter((id) => ['vekpe-crea', 'finfin', 'sur-devis'].includes(id)));
      const an = scnAnnulations(ORIGINAL);
      vrai('le jour meme : la main passe, dite, rien n est pose', corps(an.s1) === "Pour aujourd'hui, une personne de la Maison vous répond ici, Madame Naffi." && an.jm.etat?.motifMain === 'jour-meme' && an.jm.poses.length === 0, corps(an.s1));
      return ecarts;
    },
    pannes: [
      { nom: 'une creation devient reservable', mute: [P(AUTO, "    !!s && s.reservable && (estUneConsultation(s, cats) || (!exigeConsultation(s, cats) && priceModeOf(s) !== 'devis'));", '    !!s && s.reservable;')] },
      { nom: 'creer passe par les rituels, sans consultation', mute: [P(AUTO, "    if (b === 'entretien') return dire(msgRituel(false, formulesOffertes()), 'autre-soin');", "    if (b === 'entretien' || b === 'creation') return dire(msgRituel(false, formulesOffertes()), 'autre-soin');")] },
      { nom: 'l enfant recoit la consultation de la creation', mute: [P(AUTO, '    const laSienne = sienne ? toutes.filter((s) => s.id === sienne) : [];', '    const laSienne = toutes.filter((s) => s.id === agenda?.consultationParParcours?.creation);')] },
      { nom: 'le jour meme se reserve', mute: [P(AUTO, '    jourMeme: ditAujourdhui && !jourVoulu,', '    jourMeme: false,')] },
    ],
  },

  /* ══ R6 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R6', nom: 'R6 deux ecarts : la main passe a l equipe, et l automate se tait ensuite',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const d = scnEcarts(ORIGINAL);
      vrai('premier ecart : la relance, la meme etape', d.s2.messages[0]?.etape === 'meme' && corps(d.s2) === "Touchez l'un des choix ci-dessous, Madame Naffi, ou Parler à la Maison." && d.ecarts1 === 1, corps(d.s2));
      vaut('second ecart : une personne de la Maison repond ici (le jour)', 'Une personne de la Maison vous répond ici, Madame Naffi.', corps(d.s3));
      vaut('... motif ecarts, alerte au prenom seul, le fil en main passee', ['ecarts', 'Naffi · deux réponses non comprises', 'main'], [d.motif, d.s3.alerte?.corps, d.tenue]);
      vrai('apres la main, l automate se tait', !d.s4.pris && d.s4.messages.length === 0);
      vaut('rendue a l automate, il reprend l etape ou il en etait', 'places', d.s5.messages[0]?.etape);
      return ecarts;
    },
    pannes: [
      { nom: 'trois ecarts avant la main', mute: [P(AUTO, 'const ECARTS_AVANT_LA_MAIN = 2;', 'const ECARTS_AVANT_LA_MAIN = 3;')] },
      { nom: 'les ecarts ne se comptent pas', mute: [P(AUTO, '    base.ecarts = (base.ecarts ?? 0) + 1;', '    base.ecarts = 0;')] },
      { nom: 'apres la main, il repond encore', mute: [P(AUTO, "  if (courante === 'main' || courante === 'confirme') return { parole: 'silence' };", "  if (courante === 'confirme') return { parole: 'silence' };")] },
    ],
  },

  /* ══ R7 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R7', nom: 'R7 dix messages au plus par fil et par 24 heures glissantes, puis la main passe sans un mot',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const m = scnPlafond(ORIGINAL);
      vaut('le parcours a envoye dix messages', 10, m.dix);
      vrai('le onzieme tour : aucun message, la main passe (plafond), l equipe est alertee', m.onzieme.pris && m.onzieme.messages.length === 0 && m.p.etat?.motifMain === 'plafond'
        && m.onzieme.alerte?.corps === 'Naffi · dix messages en 24 heures', j({ pris: m.onzieme.pris, n: m.onzieme.messages.length, motif: m.p.etat?.motifMain }));
      vaut('... et rien n est ecrit', 0, m.onzieme.ecritures.length);
      vrai('dix messages d il y a plus de 24 heures ne comptent plus', m.veille.pris && m.veille.messages.length === 1 && m.veille.messages[0].etape === 'places', corps(m.veille));
      return ecarts;
    },
    pannes: [
      { nom: 'onze messages', mute: [P(AUTO, 'const PLAFOND_DE_L_AUTOMATE = 10;', 'const PLAFOND_DE_L_AUTOMATE = 11;')] },
      { nom: 'les envois ne se comptent pas', mute: [P(AUTO, '    for (let i = 0; i < messages.length; i += 1) base.envois.push(maintenant);', '')] },
      { nom: 'les envois de la veille comptent encore', mute: [P(AUTO, '  const envois = (etat?.envois ?? []).filter((e) => ms - msWa(e) < JOUR_WA).length;', '  const envois = (etat?.envois ?? []).length;')] },
    ],
  },

  /* ══ R8 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R8', nom: 'R8 l annulation n est jamais faite : transmise a l equipe, ou le parcours s arrete, rien ne s ecrit',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const an = scnAnnulations(ORIGINAL);
      vrai('annuler un rendez-vous : transmis, la main passe, aucune ecriture', corps(an.s2) === 'Nous transmettons votre demande, Madame Naffi. La Maison vous répond ici.'
        && an.k.etat?.motifMain === 'annulation' && an.s2.ecritures.length === 0 && an.k.poses.length === 0, corps(an.s2));
      vrai('annuler en plein parcours : rien n est reserve, le parcours s arrete', corps(an.s3) === "C'est noté, Madame Naffi : rien n'est réservé. Écrivez-nous quand vous le souhaitez." && an.k2.etat?.etape === 'clos' && an.s3.ecritures.length === 0, corps(an.s3));
      vrai('decaler en plein parcours : transmis', corps(an.s4).startsWith('Nous transmettons votre demande') && an.s4.ecritures.length === 0, corps(an.s4));
      vrai('annuler juste apres la confirmation : il se tait, l alarme sonnera', !an.s7.pris && an.s7.messages.length === 0 && an.s7.ecritures.length === 0);
      const ecritures = tousLesParcours(ORIGINAL).flatMap((p) => p.poses);
      vaut('toute ecriture de tous les parcours est une pose confirmee', [], ecritures.filter((e) => e.genre !== 'pose' || e.rdv.status !== 'confirmé').map((e) => e.genre));
      /* La fonction et la base : aucune annulation, aucun rendez-vous retouché. */
      const fonction = sansCommentaires(lf(lit(F_AUTO)));
      vrai('whatsapp-automate ne touche jamais la table appointments', !/\.from\(\s*'appointments'\s*\)/.test(fonction));
      vrai('... et n ecrit jamais « annule »', !fonction.includes("'annulé'") && !fonction.includes('"annulé"'));
      const bloc = entre(lf(lit(AUTO)), 'automate-wa') ?? '';
      vrai('le dialogue ne nomme aucun statut annule', bloc.length > 1000 && !/annulé/.test(sansCommentaires(bloc)));
      const sql = sqlSans(lit(M0125));
      vrai('0125 ne retouche aucun rendez-vous (aucun update de appointments)', !/update public\.appointments/i.test(sql) && !/delete from public\.appointments/i.test(sql));
      return ecarts;
    },
    pannes: [
      { nom: 'annuler en plein parcours annule', mute: [P(AUTO, "    if (mots.annuler && enCours) {\n      passe('clos');", "    if (mots.annuler && enCours) {\n      return { messages: [], etat: base, ecritures: [{ genre: 'annule', rdv: { status: 'annulé' } } as never], pris: true };\n      passe('clos');")] },
      { nom: 'la fonction annule un rendez-vous', mute: [P(F_AUTO, "  const { data, error } = await sb.rpc('pose_si_libre', {", "  await sb.from('appointments').update({ data: { ...rdv, status: 'annulé' } }).eq('id', rdv.id);\n  const { data, error } = await sb.rpc('pose_si_libre', {")] },
      { nom: 'le verrou retouche un statut', mute: [P(M0125, "  return jsonb_build_object('ok', true, 'verdict', 'pose', 'id', rdv_id, 'master', choisi, 'dureeMin', duree);", "  update public.appointments set data = data where false;\n  return jsonb_build_object('ok', true, 'verdict', 'pose', 'id', rdv_id, 'master', choisi, 'dureeMin', duree);")] },
    ],
  },

  /* ══ R9 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R9', nom: 'R9 l interrupteur et les numeros d essai : la valeur livree (essai, liste vide) ne sert personne',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      vaut('la valeur livree : essai, aucun numero, 14 jours, 24 heures', { mode: 'essai', numerosEssai: [], horizonJours: 14, pauseHeures: 24 }, REGLAGE_LIVRE);
      vaut('un reglage absent vaut la valeur livree', REGLAGE_LIVRE, reglageDeLAutomate(undefined));
      vaut('un reglage abime : essai, numeros reduits, bornes', { mode: 'essai', numerosEssai: ['2290197000001'], horizonJours: 30, pauseHeures: 1 },
        reglageDeLAutomate({ mode: 'robot', numerosEssai: ['+229 01 97 00 00 01', '12'], horizonJours: 99, pauseHeures: 0 }));
      const t0 = cotonou('2026-10-09', '11:00');
      const veut = (r: ReglageDeLAutomate, tiroir: TiroirDuNumero, numero = NUM_NAFFI) => {
        const p = parcours(ORIGINAL, numero, numero === NUM_NAFFI ? [NAFFI] : [], r);
        p.tiroir = tiroir;
        return elle(p, t0, { texte: 'Je voudrais un rendez-vous' }).pris;
      };
      const essai = { ...REGLAGE_LIVRE, numerosEssai: [NUM_NAFFI] };
      vaut('qui est servi : livree, eteint (meme liste), essai liste, essai non liste, essai equipe listee, ouvert cliente, ouvert equipe, prestataire liste',
        [false, false, true, false, true, true, false, false],
        [veut(REGLAGE_LIVRE, 'clientes'), veut({ ...OUVERT, mode: 'eteint', numerosEssai: [NUM_NAFFI] }, 'clientes'), veut(essai, 'clientes'),
          veut(essai, 'clientes', NUM_INCONNUE), veut(essai, 'equipe'), veut(OUVERT, 'clientes'), veut(OUVERT, 'equipe'), veut({ ...OUVERT, numerosEssai: [NUM_NAFFI] }, 'prestataires')]);
      vrai('numeroServi : la valeur livree ne sert pas une cliente', !numeroServi(REGLAGE_LIVRE, NUM_NAFFI, 'clientes') && numeroServi(OUVERT, NUM_NAFFI, 'clientes'));
      const n = scnConnue(ORIGINAL, essai);
      vaut('en essai, la note du rendez-vous le dit', 'Pris sur WhatsApp · réponse automatique · essai', n.p.poses[0]?.rdv.note);
      /* La base : l'interrupteur est à la direction, et toujours remis en forme. */
      const sql = sqlSans(lit(M0125));
      const garde = corpsSql(sql, 'auto_config_garde_l_automate');
      vrai('0125 : hors direction, automateWa reprend sa valeur d avant', /if auth\.uid\(\) is not null and not public\.est_direction\(\) then\s+new\.data := new\.data - 'automateWa';\s+if avant is not null and \(avant \? 'automateWa'\) then\s+new\.data := new\.data \|\| jsonb_build_object\('automateWa', avant->'automateWa'\);/.test(garde));
      vrai('0125 : une ecriture qui omet automateWa le garde', /if not \(new\.data \? 'automateWa'\) and avant is not null and \(avant \? 'automateWa'\) then/.test(garde));
      vrai('0125 : la garde est posee sur documents pour mnd_auto_config', /create trigger auto_config_garde_l_automate before insert or update on public\.documents\s+for each row\s+when \(new\.key = 'mnd_auto_config'\)/.test(sql));
      vrai('0125 : un reglage vide vaut essai, personne', /return jsonb_build_object\('mode', 'essai', 'numerosEssai', '\[\]'::jsonb, 'horizonJours', 14, 'pauseHeures', 24\);/.test(corpsSql(sql, 'reglage_automate_net')));
      /* L'écran : la direction seule, et l'avertissement de la valeur livrée. */
      const ecran = sansCommentaires(lit(ECRAN_REGLAGES));
      vrai('les reglages : modifiables par la direction seule', /if \(!estDirection\) \{ toast\('Ce réglage appartient à la direction\.'\); return; \}/.test(ecran) && /disabled=\{!estDirection\}/.test(ecran));
      vrai('les reglages : « Personne n est servi » en essai a liste vide', /const personne = r\.mode === 'eteint' \|\| \(r\.mode === 'essai' && r\.numerosEssai\.length === 0\);/.test(ecran) && ecran.includes('Personne n’est servi.'));
      /* La fonction : l'interrupteur avant toute autre lecture. */
      const servir = corpsTs(sansCommentaires(lf(lit(F_AUTO))), 'async function servirLeNumero(');
      vrai('whatsapp-automate juge l interrupteur avant le premier tour', servir.indexOf('numeroServi(') > 0 && servir.indexOf('numeroServi(') < servir.indexOf('unTour('));
      /* EXÉCUTÉ : la valeur livrée sur la vraie chaîne webhook → automate. */
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        remetsLaBase(undefined);
        const p0 = B().pushs.length;
        await ecrit(NAFFI_E, 'Bonsoir, je voudrais passer samedi');
        vaut('banc : le message neuf est confie a l automate, qui ne sert personne', { confies: 1, messages: 0, fils: 0 }, { confies: appelsAutomate, messages: ecritsA(NAFFI_E).length, fils: T('fils_automate').size });
        vrai('banc : ... la notification habituelle part (direction et equipe)', pushsDepuis(p0).length === 2 && pushsDepuis(p0).every((x: Any) => x.title === 'Naffi vous écrit sur WhatsApp'), pushsDepuis(p0));
        vrai('banc : ... et le journal ne dit ni numero ni texte', leJournalSeTait(NAFFI_E), journal.slice(0, 4));
      });
      return ecarts;
    },
    pannes: [
      { nom: 'la valeur livree est ouverte', mute: [P(AUTO, "const REGLAGE_LIVRE: ReglageDeLAutomate = { mode: 'essai', numerosEssai: [], horizonJours: 14, pauseHeures: 24 };", "const REGLAGE_LIVRE: ReglageDeLAutomate = { mode: 'ouvert', numerosEssai: [], horizonJours: 14, pauseHeures: 24 };")] },
      { nom: 'l essai sert toutes les clientes', mute: [P(AUTO, "  return reglage.mode === 'ouvert' && (tiroir ?? 'clientes') === 'clientes';", "  return (tiroir ?? 'clientes') === 'clientes';")] },
      { nom: 'un prestataire liste est servi', mute: [P(AUTO, "  if (!n || tiroir === 'prestataires' || reglage.mode === 'eteint') return false;", "  if (!n || reglage.mode === 'eteint') return false;")] },
      { nom: 'eteint sert encore la liste', mute: [P(AUTO, "  if (!n || tiroir === 'prestataires' || reglage.mode === 'eteint') return false;", "  if (!n || tiroir === 'prestataires') return false;")] },
      { nom: 'le personnel change l interrupteur (0125)', mute: [P(M0125, '  if auth.uid() is not null and not public.est_direction() then', '  if false then')] },
      { nom: 'l avertissement se tait en essai', mute: [P(ECRAN_REGLAGES, "  const personne = r.mode === 'eteint' || (r.mode === 'essai' && r.numerosEssai.length === 0);", "  const personne = r.mode === 'eteint';")] },
      { nom: 'tout le personnel regle l automate', mute: [P(ECRAN_REGLAGES, "    if (!estDirection) { toast('Ce réglage appartient à la direction.'); return; }", '')] },
      { nom: 'la fonction ne juge plus l interrupteur d abord', mute: [P(F_AUTO, '  if (!numeroServi(reglage, o.numero, o.tiroir)) {', '  if (false) {')] },
      { nom: 'le journal dit le numero', mute: [P(F_AUTO, "    dis('numero non servi', { mode: reglage.mode,", "    dis('numero non servi', { numero: o.numero, mode: reglage.mode,")] },
    ],
  },

  /* ══ R10 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R10', nom: 'R10 une main de l equipe fait taire l automate : a l ecran, a l envoi, et dans la base',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '11:00');
      const pz = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(pz, t0, { texte: 'Je voudrais un rendez-vous' });
      pz.main = { pauseLe: isoDe(t0 + 1000), jusqua: isoDe(t0 + 86400000), motif: 'frappe' };
      const sP = elle(pz, t0 + 2000, { touche: 'La même chose' });
      vrai('l equipe a la main : l automate se tait, rien n est pose', !sP.pris && sP.messages.length === 0 && sP.ecritures.length === 0 && tenuParLAutomate(pz.etat, pz.main, t0 + 3000) === 'pause');
      vaut('quiParle le dit : silence', 'silence', quiParle(pz.etat, tourDeLaCliente([{ waId: 'x1', quand: isoDe(t0 + 4000), texte: 'Je voudrais un rendez-vous', sens: 'entrant' }], []),
        { maintenantMs: t0 + 4000, numero: NUM_NAFFI, tiroir: 'clientes', reglage: OUVERT, fiches: [NAFFI], premierMessage: false, main: pz.main }));
      const ech = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      ech.main = { pauseLe: isoDe(t0 - 49 * 3600000), jusqua: isoDe(t0 - 25 * 3600000) };
      vrai('une main echue ne tient plus', elle(ech, t0, { texte: 'Je voudrais un rendez-vous' }).pris);
      const d = scnEcarts(ORIGINAL);
      vaut('une main rendue : il reprend la ou il en etait', 'places', d.s5.messages[0]?.etape);
      const sql = sqlSans(lit(M0125));
      const avance = corpsSql(sql, 'avance_le_fil');
      vrai('0125 : avance_le_fil n ecrit rien pendant une pause', /select f\.data into la_main from public\.fils_automate f where f\.id = 'main-' \|\| num;\s*if public\.pause_du_fil_active\(la_main, ici\) then\s*return null;\s*end if;/.test(avance));
      vrai('0125 : pause_le_fil pose la main pour la duree lue en base', /'pauseLe', public\.iso_de_l_instant\(now\(\)\)/.test(corpsSql(sql, 'pause_le_fil')) && /least\(72, greatest\(1, brut::int\)\)/.test(corpsSql(sql, 'pause_le_fil')));
      const envoi = sansCommentaires(lf(lit(F_ENVOI)));
      const iTrace = envoi.indexOf("from('messages_wa').upsert(");
      const iPause = envoi.indexOf("await sb.rpc('pause_le_fil', {");
      vrai('whatsapp-envoi pose la main apres sa trace, sans jamais faire echouer l envoi', iTrace > 0 && iPause > iTrace && /try \{\s*const \{ error: errPause \} = await sb\.rpc\('pause_le_fil', \{[\s\S]{0,200}\} catch \(e\) \{/.test(envoi));
      const ecran = sansCommentaires(lit(ECRAN_CONV));
      vrai('l ecran pose la main a la premiere lettre, sur un geste, un envoi, Continuer dans WhatsApp, Reprendre la main',
        ["prendsLaMain('frappe')", "prendsLaMain('geste')", "prendsLaMain(modele ? 'modele' : 'envoi')", "prendsLaMain('whatsapp')", "prendsLaMain('reprendre', true)"].every((x) => ecran.includes(x)));
      /* EXÉCUTÉ : l'équipe écrit par whatsapp-envoi, l'automate se tait. */
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        /* Elle a écrit (la fenêtre de 24 heures est ouverte), l'automate ne
           l'a pas prise : l'équipe lui répond de sa main. */
        await ecrit(NAFFI_E, 'Merci pour hier, c etait parfait');
        vrai('banc : merci pour hier ne fait ni message ni etat', ecritsA(NAFFI_E).length === 0 && T('fils_automate').size === 0);
        const envoyer = await chargeLaFonction('whatsapp-envoi');
        const r = await envoyer(new Request('https://banc/functions/v1/whatsapp-envoi', {
          method: 'POST', headers: { authorization: 'Bearer staff-direction', 'content-type': 'application/json' },
          body: JSON.stringify({ numero: NAFFI_E, texte: 'Avec plaisir, Madame Naffi.', parQui: 'Y. B.' }),
        }));
        const main = T('fils_automate').get(`main-${NAFFI_E}`)?.data;
        vrai('banc : le message de l equipe part, et la main se pose (24 h, motif, signature)', r.status === 200 && main?.motif === 'envoi-equipe' && main?.par === 'Y. B.'
          && Math.round((Date.parse(main.jusqua) - Date.parse(main.pauseLe)) / 3600000) === 24, main);
        const n0 = ecritsA(NAFFI_E).length;
        const p0 = B().pushs.length;
        await ecrit(NAFFI_E, 'Je voudrais aussi un rendez-vous samedi');
        vrai('banc : pendant la main de l equipe, l automate se tait et l equipe est prevenue', ecritsA(NAFFI_E).length === n0 && !fil(NAFFI_E) && pushsDepuis(p0).length === 2);
      });
      return ecarts;
    },
    pannes: [
      { nom: 'la pause ne fait plus taire', mute: [P(AUTO, "  if (pauseActive(ctx.main, ms)) return { parole: 'silence' };", '')] },
      { nom: 'une main rendue tient encore', mute: [P(AUTO, '  return !(Number.isFinite(rendue) && rendue >= pose);', '  return true;')] },
      { nom: 'avance_le_fil ecrit pendant la pause (0125)', mute: [P(M0125, '  if public.pause_du_fil_active(la_main, ici) then\n    return null;\n  end if;\n', '')] },
      { nom: 'whatsapp-envoi ne pose plus la main', mute: [P(F_ENVOI, "    const { error: errPause } = await sb.rpc('pause_le_fil', {", "    const { error: errPause } = await sb.rpc('pause_le_fil_oubliee', {")] },
      { nom: 'l ecran ne pose plus la main a la frappe', mute: [P(ECRAN_CONV, "if (e.target.value.trim()) prendsLaMain('frappe');", 'if (e.target.value.trim()) void 0;')] },
    ],
  },

  /* ══ R11 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R11', nom: 'R11 ce que la Maison ecrit : appelDe, l annee, ni mot banni ni tiret cadratin ni prix ni maitre, la devise sur la confirmation seule, les limites de Meta',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const tous = tousLesParcours(ORIGINAL);
      const messages = tous.flatMap((p) => p.envoyes);
      vrai(`les ${messages.length} messages de tous les parcours passent les juges`, messages.length >= 60 && fautesDesTextes(messages).length === 0, fautesDesTextes(messages).slice(0, 4).join(' | '));
      vaut('la devise est celle de la Maison (DEVISE_COMPLETE)', /DEVISE_COMPLETE = '([^']+)'/.exec(lit('src/shared/identite.ts'))?.[1], DEVISE);
      vaut('chaque confirmation est signee de la devise', [], messages.filter((m) => m.etape === 'confirme' && !m.corps.endsWith(DEVISE)).map((m) => m.corps));
      const titres = [titreDePlace('2026-10-17', '09:00'), titreDePlace('2026-09-23', '14:30'), titreDePlace('2026-03-17', '14:30'), titreDePlace('2026-11-01', '09:00'), titreDePlace('2026-02-28', '16:45')];
      vrai('un titre de place : 24 signes au plus, l annee toujours', titres.every((t) => t.length <= 24 && /2026/.test(t)), titres.join(' | '));
      vaut('le premier du mois se dit 1er, avec l annee', 'dimanche 1er novembre 2026', jourDitAvecAnnee('2026-11-01'));
      /* L'itinéraire ne passe que s'il passe les juges. */
      const a = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      a.itineraire = 'Parking a 500 F la journee, derriere la pharmacie.';
      const t0 = cotonou('2026-10-09', '11:00');
      elle(a, t0, { texte: 'Je voudrais un rendez-vous' });
      elle(a, t0 + 1000, { touche: 'La même chose' });
      elle(a, t0 + 2000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
      const conf = elle(a, t0 + 3000, { touche: 'Je confirme' });
      vrai('un itineraire qui dit un prix ne part pas', conf.messages[0]?.etape === 'confirme' && !/500/.test(corps(conf)), corps(conf));
      /* Les juges crient dans l'autre sens. */
      vrai('texteSain crie : le mot banni, le tiret cadratin, un prix ; se tait sur une date', texteSain(`Bienvenue au ${BANNI}`).length > 0 && texteSain(`a ${String.fromCharCode(0x2014)} b`).length > 0
        && texteSain('15 000 F').length > 0 && texteSain('samedi 10 octobre 2026 à 9 h').length === 0);
      const faux: MessageSortant = { forme: 'boutons', etape: 'meme', corps: 'x', pied: PIED, boutons: [
        { id: 'MND:1:a', titre: 'Un titre beaucoup trop long' }, { id: 'MND:1:b', titre: 'b' }, { id: 'MND:1:c', titre: 'c' }, { id: 'MND:1:d', titre: 'd' }] };
      vrai('respecteMeta crie : quatre boutons, un titre trop long, pas de sortie', respecteMeta(faux).length >= 3, respecteMeta(faux));
      vrai('le juge des dates crie sur « le 12 septembre » et se tait avec l annee', DATE_SANS_ANNEE.test('le 12 septembre.') && !DATE_SANS_ANNEE.test('le 12 septembre 2026') && DATE_SANS_ANNEE.test('Sam. 17 oct. · 9 h') && DATE_CHIFFRES_SANS_ANNEE.test('17/10 · 9 h'));
      vrai('le juge de la civilite crie sur un message sans Madame', fautesDesTextes([{ forme: 'texte', etape: 'recap', corps: 'Voici votre rendez-vous, Naffi.' }]).some((f) => f.startsWith('sans civilite')));
      return ecarts;
    },
    pannes: [
      { nom: 'le mot banni dans la bienvenue', mute: [P(AUTO, 'bienvenue à la ${maisonNomWa}.', `bienvenue au ${BANNI} \${maisonNomWa}.`)] },
      { nom: 'une date sans son annee', mute: [P(AUTO, '${MOIS_LONGS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`', '${MOIS_LONGS_WA[d.getUTCMonth()]}`')] },
      { nom: 'la civilite perdue (le prenom seul)', mute: [P(AUTO, '    if (titulaire) return appelDe({ name: titulaire.nom, civilite: titulaire.civilite, auMasculin: titulaire.auMasculin });', '    if (titulaire) return prenomDuNomWa(titulaire.nom);')] },
      { nom: 'la devise sur tous les textes', mute: [P(AUTO, "  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps });", "  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps: [corps, DEVISE].join(' ') });")] },
      { nom: 'un titre de place trop long', mute: [P(AUTO, '  if (a.length <= 24) return a;', '  return a;')] },
      { nom: 'l itineraire part sans les juges', mute: [P(AUTO, "        itineraire && texteSain(itineraire).length === 0 ? coupeWa(itineraire, 600) : '',", "        itineraire ? coupeWa(itineraire, 600) : '',")] },
      { nom: 'le juge ne voit plus le tiret cadratin', mute: [P(AUTO, "  if (s.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');", '')] },
    ],
  },

  /* ══ R12 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R12', nom: 'R12 la nuit, il repond et reserve ; Parler a la Maison dit quand la Maison repond, avec l annee',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const n = scnNuit(ORIGINAL);
      vrai('a 23 h 10, il repond (Bonsoir)', corps(n.s1).startsWith('Bonsoir Madame Naffi'), corps(n.s1));
      vaut('Parler a la Maison la nuit : demain des 9 h', 'La Maison vous répond demain dès 9 h, Madame Naffi.', corps(n.s2));
      vaut('samedi soir (dimanche et lundi fermes) : mardi, avec l annee', 'La Maison vous répond mardi 13 octobre 2026 dès 9 h, Madame Naffi.', corps(n.s3));
      vaut('a 2 h un mardi : aujourd hui des 9 h', "La Maison vous répond aujourd'hui dès 9 h, Madame Naffi.", corps(n.s4));
      vaut('le jour : une personne repond ici', 'Une personne de la Maison vous répond ici, Madame Naffi.', corps(n.s5));
      vrai('a 23 h 40, elle reserve jusqu au bout, confirme', n.s6.messages[0]?.etape === 'confirme' && n.n.poses.length === 1, corps(n.s6));
      const q = scnDiaspora(ORIGINAL);
      vaut('hors du Benin, « heure de Cotonou » dans la liste', 'samedi 10 octobre 2026 à 9 h (heure de Cotonou)', q.s2.messages[0]?.lignes?.[0]?.description);
      vrai('... et dans le recapitulatif', corps(q.s3).includes('samedi 10 octobre 2026 à 9 h (heure de Cotonou)'), corps(q.s3));
      return ecarts;
    },
    pannes: [
      { nom: 'la nuit il se tait', mute: [P(AUTO, "  const ms = ctx.maintenantMs;\n  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return { parole: 'silence' };", "  const ms = ctx.maintenantMs;\n  if (instantACotonou(ms).min >= 21 * 60) return { parole: 'silence' };\n  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return { parole: 'silence' };")] },
      { nom: 'la nuit, une personne repond ici (faux)', mute: [P(AUTO, '  if (!ce.closed && ici.min >= ce.openMin && ici.min < ce.closeMin) return null;', '  return null;')] },
    ],
  },

  /* ══ R13 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R13', nom: 'R13 la copie Edge : whatsapp-automate porte chaque bloc caractere pour caractere, et la copie executee rend les memes tours',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const edge = lf(lit(F_AUTO));
      const ORDRE = ['lecture-entiere', 'agenda-pur', 'catalogue-pur', 'qualification', 'place-du-serveur', 'prochaines-places', 'automate-wa'];
      const ORIGINAUX: Record<string, { fichier: string; extrait: (s: string) => string | null }> = {
        'lecture-entiere': { fichier: 'src/shared/lecture-entiere.ts', extrait: (s) => { const i = s.indexOf('export const PAGE_DE_LECTURE'); return i < 0 ? null : s.slice(i).trimEnd(); } },
        'agenda-pur': { fichier: 'src/shared/agenda-pur.ts', extrait: (s) => entre(s, 'agenda-pur') },
        'catalogue-pur': { fichier: 'src/shared/catalogue-pur.ts', extrait: (s) => entre(s, 'catalogue-pur') },
        qualification: { fichier: 'src/shared/qualification.ts', extrait: (s) => entre(s, 'qualification') },
        'place-du-serveur': { fichier: 'src/shared/place-du-serveur.ts', extrait: (s) => entre(s, 'place-du-serveur') },
        'prochaines-places': { fichier: RESA, extrait: (s) => entre(s, 'prochaines-places') },
        'automate-wa': { fichier: AUTO, extrait: (s) => entre(s, 'automate-wa') },
      };
      const positions = ORDRE.map((n) => edge.indexOf(`/* ⟨${n}⟩ */\n`));
      vrai('whatsapp-automate porte les sept blocs, dans l ordre ou ils s appuient', positions.every((x, i) => x > 0 && (i === 0 || x > positions[i - 1])), ORDRE.map((n, i) => `${n}:${positions[i]}`).join(' '));
      for (const n of ORDRE) {
        const copie = entre(edge, n);
        const ori = ORIGINAUX[n].extrait(lf(lit(ORIGINAUX[n].fichier)));
        if (!ori || ori.length < 100) { ecarts.push(`${ORIGINAUX[n].fichier} : l original de ⟨${n}⟩ est introuvable`); continue; }
        if (copie === null) { ecarts.push(`⟨${n}⟩ absent de whatsapp-automate`); continue; }
        if (copie.trimEnd() !== ori) {
          let k = 0;
          while (k < Math.min(copie.length, ori.length) && copie[k] === ori[k]) k += 1;
          ecarts.push(`⟨${n}⟩ differe de ${ORIGINAUX[n].fichier} au caractere ${k} : « ${ori.slice(k, k + 30)} » / « ${copie.slice(k, k + 30)} »`);
        }
      }
      const bloc = entre(lf(lit(AUTO)), 'automate-wa') ?? '';
      vrai('le bloc automate-wa n a ni import ni export', bloc.length > 1000 && !/^\s*(import|export)\b/m.test(bloc));
      const appelDe = (src: string) => { const a = src.indexOf('const appelDe = ('); return a < 0 ? null : src.slice(a, src.indexOf('\n};\n', a) + 3); };
      vrai('appelDe : la meme copie compacte que confirmation-rdv', !!appelDe(edge) && appelDe(edge) === appelDe(lf(lit(F_CONF))));
      /* La copie, exécutée : les mêmes tours que l'original, à l'octet près. */
      const copie = await laCopieDuDialogue();
      const scenarios: [string, (m: Moteur) => Parcours[]][] = [
        ['connue', (m) => [scnConnue(m).p]], ['inconnue', (m) => [scnInconnue(m).p]], ['place prise', (m) => [scnPlacePrise(m).p]],
        ['ecarts', (m) => [scnEcarts(m).p]], ['creation', (m) => [scnCreation(m).p]], ['famille', (m) => { const f = scnFamille(m); return [f.p, f.q]; }],
        ['annulations', (m) => scnAnnulations(m).parcours], ['nuit', (m) => scnNuit(m).parcours], ['porte', (m) => scnPorte(m).parcours], ['plafond', (m) => [scnPlafond(m).p]],
      ];
      for (const [nom, scn] of scenarios) {
        const a = scn(ORIGINAL).map((p) => p.journal);
        let b: string[][] = [];
        try { b = scn(copie).map((p) => p.journal); } catch (e) { ecarts.push(`la copie plante sur « ${nom} » : ${String((e as Error)?.message ?? e).slice(0, 120)}`); continue; }
        if (j(a) !== j(b)) ecarts.push(`la copie executee differe de l original sur « ${nom} »`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'un caractere change dans la copie automate-wa', mute: [P(F_AUTO, 'const PLAFOND_DE_L_AUTOMATE = 10;', 'const PLAFOND_DE_L_AUTOMATE = 11;')] },
      { nom: 'l original du dialogue change seul', mute: [P(AUTO, 'const JOURS_PROPOSES = 9;', 'const JOURS_PROPOSES = 8;')] },
      { nom: 'la copie de prochaines-places differe', mute: [P(F_AUTO, 'export const PLACES_PAR_JOUR = 2;', 'export const PLACES_PAR_JOUR = 3;')] },
      { nom: 'un bloc perd son repere', mute: [P(F_AUTO, '/* ⟨prochaines-places⟩ */\n', '/* prochaines-places */\n')] },
      { nom: 'la copie ne se comporte plus comme l original (texte de la relance)', mute: [P(F_AUTO, "Touchez l'un des choix ci-dessous", "Touchez l'un des boutons ci-dessous")] },
    ],
  },

  /* ══ R14 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R14', nom: 'R14 fils_automate : RLS dans le meme fichier, rien pour la cle publique, la garde des postes, le temps reel, sans trace, chaque ligne porte son id',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const sql = sqlSans(lit(M0125));
      for (const c of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z0-9_]+)/gi)) {
        const t = c[1];
        vrai(`0125 : ${t} recoit RLS dans le meme fichier`, new RegExp(`alter table (?:public\\.)?${t} enable row level security;`, 'i').test(sql.slice(c.index ?? 0)));
      }
      vrai('0125 cree bien fils_automate', /create table if not exists public\.fils_automate \(/.test(sql));
      vrai('lecture : le personnel (hors numeros reserves) et la direction, connectes', /create policy fils_automate_lire on public\.fils_automate for select to authenticated\s+using \(public\.est_direction\(\)\s+or \(public\.is_staff\(\) and not public\.numero_est_reserve\(data->>'numero'\)\)\);/.test(sql));
      const politiques = [...sql.matchAll(/create policy (\w+) on public\.fils_automate for (\w+) to ([a-z_, ]+?)\s*(?:\n|using|with)/gi)];
      vrai('quatre politiques, toutes pour les seuls connectes (rien pour la cle publique)', politiques.length === 4
        && politiques.every((m) => m[3].split(',').map((x) => x.trim()).join() === 'authenticated'), politiques.map((m) => `${m[1]}:${m[3]}`));
      vrai('aucun droit de table pour anon', !/grant [^;]*on (?:table )?public\.fils_automate[^;]*\banon\b/i.test(sql));
      vrai('seule la direction efface', /create policy fils_automate_effacer on public\.fils_automate for delete to authenticated\s+using \(public\.est_direction\(\)\);/.test(sql));
      const garde = corpsSql(sql, 'fils_automate_garde');
      vrai('la garde : le serveur passe, un poste n ecrit jamais une ligne fil- (ignoree sans refus)', /if auth\.uid\(\) is null then\s+return new;\s+end if;\s+if new\.id not like 'main-%' then\s+return null;\s+end if;/.test(garde));
      vrai('la garde : la main est remise en forme et signee par la base', /public\.main_du_fil_nette\(old\.data, new\.data, num, auth\.jwt\(\)->>'email', now\(\)\)/.test(garde) && /create trigger fils_automate_garde before insert or update on public\.fils_automate/.test(sql));
      vrai('le temps reel', /alter publication supabase_realtime add table public\.fils_automate;/.test(sql));
      vrai('pas de trace (le panier ne vit pas douze mois)', /drop trigger if exists trace_le_geste on public\.fils_automate;/.test(sql) && !/create trigger trace_le_geste[^;]*on public\.fils_automate/i.test(sql));
      for (const [f, sig] of [['fiches_du_numero', 'text'], ['pose_si_libre', 'jsonb, text\\[\\], jsonb, jsonb'], ['avance_le_fil', 'text, int, jsonb, text'], ['pause_le_fil', 'text, text, text']] as const) {
        vrai(`${f} : reservee au serveur (revoke public, anon, authenticated ; grant service_role ; security definer)`,
          new RegExp(`revoke all on function public\\.${f}\\(${sig}\\) from public, anon, authenticated;`).test(sql)
          && new RegExp(`grant execute on function public\\.${f}\\(${sig}\\) to service_role;`).test(sql)
          && !new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*\\b(anon|authenticated)\\b`).test(sql)
          && /security definer/.test(corpsSql(sql, f)));
      }
      /* LA SYNCHRO DU TRÔNE FAIT DE `data` L'OBJET DU MAGASIN : une ligne sans
         son identifiant dans `data` arrive sans `id` sur le poste, et la
         poussée suivante l'efface du serveur (la pause disparaît). */
      vrai('avance_le_fil ecrit l etat avec son id (fil-<numero>)', /p_data \|\| jsonb_build_object\('id', 'fil-' \|\| num, 'numero', num, 'version', actuelle \+ 1\)/.test(corpsSql(sql, 'avance_le_fil')));
      vrai('pause_le_fil ecrit la main avec son id (main-<numero>)', /jsonb_build_object\(\s*'id',\s+'main-' \|\| num,/.test(corpsSql(sql, 'pause_le_fil')));
      vrai('main_du_fil_nette rend la main avec son id', /jsonb_build_object\(\s*'id',\s+'main-' \|\| num,/.test(corpsSql(sql, 'main_du_fil_nette')));
      /* Aucune migration plus récente n'ouvre la table. */
      for (const nom of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && f > '0125').sort()) {
        const s = sqlSans(lit(`supabase/migrations/${nom}`));
        vrai(`${nom} n ouvre pas fils_automate`, !/alter table (?:public\.)?fils_automate (?:disable|no force) row level security/i.test(s) && !/on (?:table )?public\.fils_automate[^;]*\bto (?:anon|public)\b/i.test(s));
      }
      return ecarts;
    },
    pannes: [
      { nom: 'la RLS de fils_automate enlevee', mute: [P(M0125, 'alter table public.fils_automate enable row level security;', '')] },
      { nom: 'une politique pour la cle publique', mute: [P(M0125, 'create policy fils_automate_lire on public.fils_automate for select to authenticated', 'create policy fils_automate_lire on public.fils_automate for select to anon, authenticated')] },
      { nom: 'le personnel efface', mute: [P(M0125, 'create policy fils_automate_effacer on public.fils_automate for delete to authenticated\n  using (public.est_direction());', 'create policy fils_automate_effacer on public.fils_automate for delete to authenticated\n  using (public.is_staff());')] },
      { nom: 'la trace revient', mute: [P(M0125, 'drop trigger if exists trace_le_geste on public.fils_automate;', 'create trigger trace_le_geste after insert or update on public.fils_automate for each row execute function public.trace_le_geste();')] },
      { nom: 'avance_le_fil ouverte au personnel', mute: [P(M0125, 'revoke all on function public.avance_le_fil(text, int, jsonb, text) from public, anon, authenticated;', 'revoke all on function public.avance_le_fil(text, int, jsonb, text) from public, anon;')] },
      { nom: 'un poste ecrit le parcours', mute: [P(M0125, "  if new.id not like 'main-%' then\n    return null;\n  end if;\n", '')] },
      { nom: 'sans temps reel', mute: [P(M0125, '    alter publication supabase_realtime add table public.fils_automate;', '    null;')] },
      { nom: 'l etat ecrit sans son id', mute: [P(M0125, "p_data || jsonb_build_object('id', 'fil-' || num, 'numero', num, 'version', actuelle + 1)", "p_data || jsonb_build_object('numero', num, 'version', actuelle + 1)")] },
      { nom: 'la main du serveur sans son id', mute: [P(M0125, "  ligne := jsonb_strip_nulls(jsonb_build_object(\n    'id',      'main-' || num,\n", "  ligne := jsonb_strip_nulls(jsonb_build_object(\n")] },
    ],
  },

  /* ══ R15 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R15', nom: 'R15 l alarme : un message de l automate ne repond pas ; un fil qu il mene se tait ; main passee, pause et mot d apres sonnent',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const NUM = '2290197000001';
      const NUM2 = '2290197000002';
      const T0 = Date.parse('2026-10-09T20:04:00Z');
      const MAINT = T0 + 5 * 60000;
      const tete: TeteConnue = { id: 'c-naffi', name: 'Naffi Morou', phone: '+229 01 97 00 00 01', branchId: 'b1' };
      const elleEcrit: MessageWa = { id: 'wa-1', sens: 'entrant', numero: NUM, texte: 'Je voudrais un rendez-vous samedi', quand: isoDe(T0) } as MessageWa;
      const repond: MessageWa = { id: 'wa-2', sens: 'sortant', numero: NUM, texte: 'Bonsoir Madame Naffi', quand: isoDe(T0 + 3000), parQui: 'Le Trône', auto: 'automate' } as MessageWa;
      const etat = (o: Partial<EtatDuFil>): LigneDesFilsAutomate => ({
        id: `fil-${NUM}`, numero: NUM, version: 2, etape: 'places', depuis: isoDe(T0 + 3000), versionDeLEtape: 2, majLe: isoDe(T0 + 3000),
        prisLe: isoDe(T0 + 3000), traites: ['wamid.1'], dernierEntrantQuand: isoDe(T0), panier: {}, ecarts: 0, envois: [isoDe(T0 + 3000)], ...o,
      } as unknown as LigneDesFilsAutomate);
      const leFil = (msgs: MessageWa[], lignes?: LigneDesFilsAutomate[], ms = MAINT) =>
        filsDeLaMaison(msgs, [tete], [], ms, undefined, lignes ? automatesDesFils(lignes) : undefined).find((f) => f.numero === NUM)!;
      vaut('sans la table des fils, un message de l automate ne repond pas : elle attend', true, leFil([elleEcrit, repond]).attendUneReponse);
      vaut('un fil que l automate mene, dont il a traite le dernier mot : il ne sonne pas', [false, 'tenu'], [leFil([elleEcrit, repond], [etat({})]).attendUneReponse, leFil([elleEcrit, repond], [etat({})]).automate?.tenue]);
      const mainPassee = etat({ etape: 'main', mainPasseeLe: isoDe(T0 + 3000), motifMain: 'ecarts' });
      vaut('la main passee : elle attend, pastille Main passee', [true, 'main', 'ecarts'], [leFil([elleEcrit, repond], [mainPassee]).attendUneReponse, leFil([elleEcrit, repond], [mainPassee]).automate?.tenue, leFil([elleEcrit, repond], [mainPassee]).automate?.motif]);
      const pause: LigneDesFilsAutomate = { id: `main-${NUM}`, numero: NUM, pauseLe: isoDe(T0 + 4000), jusqua: isoDe(T0 + 86400000), motif: 'frappe' } as LigneDesFilsAutomate;
      vaut('une pause de l equipe : elle attend (c est a l equipe)', [true, 'pause'], [leFil([elleEcrit, repond], [etat({}), pause]).attendUneReponse, leFil([elleEcrit, repond], [etat({}), pause]).automate?.tenue]);
      const confirme = etat({ etape: 'confirme', rdvId: 'rdv-wa-x' });
      const merci: MessageWa = { id: 'wa-3', sens: 'entrant', numero: NUM, texte: 'Merci !', quand: isoDe(T0 + 4 * 60000) } as MessageWa;
      vaut('fini, rien de plus : il ne sonne pas ; un mot apres la confirmation : il sonne', [false, true],
        [leFil([elleEcrit, repond], [confirme]).attendUneReponse, leFil([elleEcrit, repond, merci], [confirme]).attendUneReponse]);
      const unJour = 25 * 3600000;
      const vieux = etat({ majLe: isoDe(T0 + 3000), dernierEntrantQuand: isoDe(T0) });
      vaut('retombe au repos sans main passee : son dernier mot a eu sa reponse ; un mot apres, si', [false, true],
        [leFil([elleEcrit, repond], [vieux], T0 + unJour).attendUneReponse, leFil([elleEcrit, repond, merci], [vieux], T0 + unJour).attendUneReponse]);
      vaut('silenceDeLAlarme : la main et la pause ne se taisent jamais', [false, false], [silenceDeLAlarme('main', null, isoDe(T0), MAINT), silenceDeLAlarme('pause', null, isoDe(T0), MAINT)]);
      /* La sonnette et l'alarme du tableau de bord. */
      const automates = automatesDesFils([etat({}), { ...etat({}), id: `fil-${NUM2}`, numero: NUM2, etape: 'main', mainPasseeLe: isoDe(T0 + 3000), motifMain: 'prix' } as unknown as LigneDesFilsAutomate]);
      vaut('numerosTenus : le fil mene, pas la main passee', [NUM], [...numerosTenus(automates, MAINT)]);
      const sonnent = messagesQuiSonnent({ avant: [], apres: [{ ...elleEcrit, id: 'n1' }, { ...elleEcrit, id: 'n2', numero: NUM2 }] as MessageWa[], premiereLecture: false, tenus: numerosTenus(automates, MAINT) });
      vaut('la sonnette se tait sur le fil mene, sonne sur la main passee', ['n2'], sonnent.map((m) => m.id));
      const alarme = filsSansReponse(filsDeLaMaison([elleEcrit, repond, { ...elleEcrit, id: 'z1', numero: NUM2 }, { ...repond, id: 'z2', numero: NUM2 }], [tete], [], MAINT, undefined, automates), {}).map((f) => f.numero);
      vaut('l alarme du tableau de bord : la main passee seule', [NUM2], alarme);
      vaut('une ligne sans id se reconnait a sa forme', ['places', 'frappe'], (() => {
        const a = automatesDesFils([{ numero: NUM, etape: 'places', version: 1, majLe: isoDe(T0) } as unknown as LigneDesFilsAutomate, { numero: NUM, pauseLe: isoDe(T0), jusqua: isoDe(T0 + 3600000), motif: 'frappe' } as unknown as LigneDesFilsAutomate]).get(NUM);
        return [a?.fil?.etape, a?.main?.motif];
      })());
      /* Les deux écrans passent la table des fils au juge et à la sonnette. */
      for (const f of [ECRAN_CONV, ECRAN_ALARME]) {
        const s = sansCommentaires(lit(f));
        vrai(`${f} : filsDeLaMaison recoit les automates, la sonnette les fils tenus`, /filsDeLaMaison\(messages, tetes, prives, tick, branch\.id, automates\)/.test(s) && /tenus: numerosTenus\(automates, Date\.now\(\)\)/.test(s));
      }
      return ecarts;
    },
    pannes: [
      { nom: 'un message de l automate repond a la place de la Maison', mute: [P(CONV, "        && ((!!x.modele && estEnvoiAutomatique(x.parQui)) || x.auto === 'automate'))) ?? dernier;", '        && ((!!x.modele && estEnvoiAutomatique(x.parQui))))) ?? dernier;')] },
      { nom: 'la main passee se tait', mute: [P(AUTO, "  if (tenue !== 'tenu' && tenue !== 'fini') return false;", "  if (tenue === 'aucun') return false;")] },
      { nom: 'un mot apres la confirmation se tait', mute: [P(AUTO, '  if (Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return true;', '  if (Number.isFinite(elle)) return true;')] },
      { nom: 'la sonnette sonne sur un fil mene', mute: [P(CONV, '    && !(ouvert && numeroWa(m.numero) === ouvert)\n    && !tenus.has(numeroWa(m.numero)));', '    && !(ouvert && numeroWa(m.numero) === ouvert));')] },
      { nom: 'l alarme du tableau de bord ignore l automate', mute: [P(ECRAN_ALARME, '    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id, automates),', '    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id),')] },
    ],
  },

  /* ══ R16 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R16', nom: 'R16 le Trone ne touche que la main : poseLaMain et rendsALAutomate n ecrivent que main-<numero>, 72 heures au plus ; les reglages gardent le document',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const NUM = '2290197000001';
      const T1 = Date.parse('2026-10-09T10:00:00Z');
      const parcoursDuServeur = { id: `fil-${NUM}`, numero: NUM, etape: 'places', version: 3, panier: { date: '2026-10-17' } } as unknown as LigneDesFilsAutomate;
      filsAutomateStore.set([parcoursDuServeur]);
      const avant = j(filsAutomateStore.get()[0]);
      poseLaMain('+229 01 97 00 00 01', 'frappe', { maintenant: T1, pauseHeures: 24 });
      const apres = filsAutomateStore.get();
      vaut('poseLaMain : deux lignes, le parcours intact, la main a cote', [`fil-${NUM}`, `main-${NUM}`], apres.map((l) => l.id));
      vaut('... le parcours du serveur n a pas bouge', avant, j(apres[0]));
      const main = apres.find((l) => l.id === `main-${NUM}`) as Any;
      vaut('... la main : quatre champs et son numero, 24 heures', { id: `main-${NUM}`, numero: NUM, pauseLe: isoDe(T1), jusqua: isoDe(T1 + 24 * 3600000), motif: 'frappe' },
        { id: main?.id, numero: main?.numero, pauseLe: main?.pauseLe, jusqua: main?.jusqua, motif: main?.motif });
      poseLaMain(NUM, 'reprendre', { maintenant: T1 + 1000, pauseHeures: 500 });
      const longue = filsAutomateStore.get().find((l) => l.id === `main-${NUM}`) as Any;
      vaut('une main ne tient jamais plus de 72 heures', 72, Math.round((Date.parse(longue.jusqua) - Date.parse(longue.pauseLe)) / 3600000));
      rendsALAutomate(NUM, { maintenant: T1 - 60000 });
      const rendue = filsAutomateStore.get().find((l) => l.id === `main-${NUM}`) as Any;
      vrai('rendre la main : jamais avant la pause, meme si l horloge du poste retarde', Date.parse(rendue.rendueLe) >= Date.parse(rendue.pauseLe), rendue);
      vaut('... et le parcours n a toujours pas bouge', avant, j(filsAutomateStore.get().find((l) => l.id === `fil-${NUM}`)));
      vaut('aucune ligne fil- ne nait du Trone', 1, filsAutomateStore.get().filter((l) => String(l.id).startsWith('fil-')).length);
      filsAutomateStore.set([]);
      /* Les écrans n'écrivent la table que par ces deux gestes. */
      for (const f of [ECRAN_CONV, ECRAN_ALARME, ECRAN_REGLAGES]) {
        vrai(`${f} n ecrit jamais filsAutomateStore lui-meme`, !/filsAutomateStore\.set\(/.test(sansCommentaires(lit(f))));
      }
      const reglages = sansCommentaires(lit(ECRAN_REGLAGES));
      vrai('Parametres : le melange part du document entier (...autoCfgRaw)', /const autoCfg: AutoConfig = \{\s*\.\.\.autoCfgRaw,/.test(reglages));
      vrai('Parametres : la carte ecrit automateWa dans le document entier', /setAutoCfgRaw\(\{ \.\.\.autoCfg, automateWa: r \}\)/.test(reglages));
      return ecarts;
    },
    pannes: [
      { nom: 'poseLaMain ecrit le parcours', mute: [P(CONV, '  const id = `main-${n}`;\n  const heures', '  const id = `fil-${n}`;\n  const heures')] },
      { nom: 'la main depasse 72 heures', mute: [P(CONV, '  const heures = Math.min(72, Math.max(1, Math.round(Number(o.pauseHeures) || REGLAGE_LIVRE.pauseHeures)));', '  const heures = Math.max(1, Math.round(Number(o.pauseHeures) || REGLAGE_LIVRE.pauseHeures));')] },
      { nom: 'rendre la main suit l horloge du poste', mute: [P(CONV, '    const rendue = Math.max(maintenant, instantDuFil(avant?.pauseLe), instantDuFil(o.mainPasseeLe));', '    const rendue = maintenant;')] },
      { nom: 'les reglages se recomposent sans le document (la faute du 9 octobre)', mute: [P(ECRAN_REGLAGES, '  const autoCfg: AutoConfig = {\n    ...autoCfgRaw,\n', '  const autoCfg: AutoConfig = {\n')] },
    ],
  },

  /* ══ R17 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R17', nom: 'R17 confirmation-rdv : une reservation WhatsApp deja confirmee dans la conversation ne recoit pas le modele ; une parole ratee, si',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const conf = sansCommentaires(lf(lit(F_CONF)));
      vrai('confirmationEstNeuve traite WhatsApp comme le site', /if \(a\.source === 'site' \|\| a\.source === 'whatsapp'\) return true;/.test(conf));
      await auBanc(ecarts, async () => {
        const ici = new Date().toISOString();
        const rdv = (id: string, clientId: string, source: string) => ({ id, branch_id: 'maison', updated_at: ici, data: { id, branchId: 'maison', clientId, clientName: '', date: '2026-10-17', time: '09:00', status: 'confirmé', source, creeLe: ici, serviceIds: ['sv-klk-ess'] } });
        const ligne = (rdvId: string, statut: string) => ({ id: `conf-${rdvId}-whatsapp`, branch_id: 'maison', data: { id: `conf-${rdvId}-whatsapp`, type: 'confirmation', canal: 'whatsapp', apptId: rdvId, statut, quand: ici } });
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] }, {
          documents: [{ key: 'mnd_facteur', data: { vuLe: ici } }],
          clients: [
            { id: 'c-dite', data: { name: 'Awa Dite', phone: '+229 01 97 10 00 01' } },
            { id: 'c-en-cours', data: { name: 'Bella EnCours', phone: '+229 01 97 10 00 02' } },
            { id: 'c-ratee', data: { name: 'Chantal Ratee', phone: '+229 01 97 10 00 03' } },
            { id: 'c-site', data: { name: 'Dina Site', phone: '+229 01 97 10 00 04' } },
          ],
          rdvs: [rdv('rdv-wa-dite', 'c-dite', 'whatsapp'), rdv('rdv-wa-en-cours', 'c-en-cours', 'whatsapp'), rdv('rdv-wa-ratee', 'c-ratee', 'whatsapp'), rdv('rdv-wa-sans-fiche', '', 'whatsapp'), rdv('rdv-site', 'c-site', 'site')],
          envois: [ligne('rdv-wa-dite', 'envoyé'), ligne('rdv-wa-en-cours', 'en cours'), ligne('rdv-wa-ratee', 'échec'), ligne('rdv-wa-sans-fiche', 'en cours')],
        });
        const confirmer = await chargeLaFonction('confirmation-rdv');
        const r = await confirmer(new Request('https://banc/functions/v1/confirmation-rdv', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }));
        const rep = await r.json().catch(() => ({}));
        vrai('banc : la fonction tourne, la salle est ouverte', r.status === 200 && rep.salle === true, rep);
        const modeles = graph.filter((g) => g.body.type === 'template').map((g) => g.body.to);
        vaut('banc : le modele ne part que pour la parole ratee', ['2290197100003'], modeles);
        vaut('banc : les lignes deja dites ne sont pas reecrites', ['envoyé', 'en cours'], [T('envois').get('conf-rdv-wa-dite-whatsapp')?.data.statut, T('envois').get('conf-rdv-wa-en-cours-whatsapp')?.data.statut]);
        vrai('banc : la parole ratee passe a envoye, avec son identifiant Meta', T('envois').get('conf-rdv-wa-ratee-whatsapp')?.data.statut === 'envoyé' && /^wamid\.out-/.test(T('envois').get('conf-rdv-wa-ratee-whatsapp')?.data.waMessageId ?? ''), T('envois').get('conf-rdv-wa-ratee-whatsapp')?.data);
        vaut('banc : elle a reserve elle-meme, son push part tout de suite (jamais la salle)', ['c-dite', 'c-en-cours', 'c-ratee'], pushNotify.map((x) => x.clientId).sort());
        vaut('banc : ... et la salle garde ce que la Maison pose (le site)', 'en-attente', T('envois').get('conf-rdv-site-push')?.data.statut);
        vrai('banc : une inconnue sans fiche ne recoit rien avant son rattachement', !pushNotify.some((x) => x.clientId === '') && !T('envois').has('conf-rdv-wa-sans-fiche-push'));
      });
      return ecarts;
    },
    pannes: [
      { nom: 'la ligne d envoi ne verrouille plus', mute: [P(F_CONF, "      .filter((r) => !SE_RETENTE.has((r.data as { statut?: string } | null)?.statut ?? ''))", '      .filter(() => false)')] },
      { nom: 'une confirmation en cours se retente', mute: [P(F_CONF, "const SE_RETENTE = new Set(['échec', 'périmé']);", "const SE_RETENTE = new Set(['échec', 'périmé', 'en cours']);")] },
      { nom: 'WhatsApp passe par la salle d attente', mute: [P(F_CONF, "    const enSalle = salleOuverte && a.source !== 'couronne' && a.source !== 'whatsapp';", "    const enSalle = salleOuverte && a.source !== 'couronne';")] },
    ],
  },

  /* ══ R18 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R18', nom: 'R18 le webhook : il range, confie les seuls messages neufs en tache de fond, repond 200 sans attendre, previent comme avant ; Pas de robot, mis a jour et date',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const tete = lf(lit(F_HOOK)).slice(0, 12000);
      vrai('l en-tete garde « Pas de robot » et le date du 9 octobre 2026', tete.includes('Pas de robot : la Maison reconnaît, range, prévient.')
        && tete.includes('══ LA MAISON RÉPOND ET RÉSERVE · décision de la direction, 9 octobre 2026 ══')
        && tete.includes('« PAS DE ROBOT » A VALU JUSQU\'À CE JOUR.'));
      vrai('... il dit : les clientes seulement, la nuit, sans modele de langue, jamais d annulation, livre en essai a liste vide, aucun robot pour l equipe',
        ['pour les CLIENTES', 'la nuit comprise', 'pas de modèle de langue', "L'ANNULATION N'EST JAMAIS AUTOMATIQUE", 'LIVRÉ EN ESSAI AVEC UNE LISTE VIDE', "L'ÉQUIPE ET LES PRESTATAIRES N'ONT TOUJOURS AUCUN ROBOT", 'EdgeRuntime.waitUntil'].every((x) => tete.includes(x)));
      /* Le 9 octobre 2026 ou plus tard : la revue du 10 octobre a avance
         whatsapp-webhook et whatsapp-envoi (2026-10-10-a). */
      vrai('les quatre fonctions touchees disent leur version du 9 octobre 2026 ou d apres', [F_HOOK, F_ENVOI, F_CONF, F_AUTO].every((f) => (/const VERSION = '(\d{4}-\d{2}-\d{2})/.exec(lit(f))?.[1] ?? '') >= '2026-10-09'),
        [F_HOOK, F_ENVOI, F_CONF, F_AUTO].filter((f) => !/const VERSION = '2026-10-09/.test(lit(f))));
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        /* Le 200 part avant l'automate : on retient l'automate à sa porte. */
        remetsLaBase({ mode: 'essai', numerosEssai: [NAFFI_E] });
        let ouvre: () => void = () => {};
        B().porte = new Promise<void>((r) => { ouvre = r; });
        const webhook = await chargeLaFonction('whatsapp-webhook');
        const c = chargeMeta([message(NAFFI_E, 'Bonjour, je voudrais prendre rendez-vous samedi')]);
        const reponse = webhook(requeteDeMeta(c));
        const course = await Promise.race([reponse.then((r) => r.status), new Promise((r) => vraiSetTimeout(() => r('trop lent'), 1500))]);
        vaut('banc : le webhook repond 200 sans attendre l automate', 200, course);
        vrai('banc : ... rien n est encore parti a la cliente', ecritsA(NAFFI_E).length === 0);
        ouvre();
        await reponse;
        await Promise.all(enFond.splice(0));
        B().porte = null;
        vrai('banc : ... puis l automate repond, en tache de fond', ecritsA(NAFFI_E).length === 1 && appelsAutomate === 1);
        const n0 = ecritsA(NAFFI_E).length;
        const p0 = B().pushs.length;
        await livre(c);
        vrai('banc : une seconde livraison de Meta n est pas confiee, ne repond rien, ne sonne pas', appelsAutomate === 1 && ecritsA(NAFFI_E).length === n0 && B().pushs.length === p0);
        /* Un prestataire, même inscrit en essai : jamais l'automate. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [PRESTA_E] });
        await ecrit(PRESTA_E, 'Je voudrais un rendez-vous pour livrer');
        vrai('banc : un prestataire n est jamais confie ; la direction seule est prevenue', appelsAutomate === 0 && ecritsA(PRESTA_E).length === 0 && B().pushs.length === 1 && B().pushs[0].endpoint === 'e-dir', B().pushs);
        /* L'automate ne prend pas le tour : la notification habituelle part. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(NAFFI_E, 'Merci pour hier, c etait parfait');
        vrai('banc : merci pour hier : confie, l automate ne prend pas, la notification habituelle part', appelsAutomate === 1 && ecritsA(NAFFI_E).length === 0 && B().pushs.length === 2 && B().pushs[0].title === 'Naffi vous écrit sur WhatsApp', B().pushs);
        /* Sans tâche de fond : le webhook attend l'automate, borné. */
        avecTacheDeFond(false);
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(INCONNUE_E, 'Bonjour, je voudrais prendre rendez-vous', { attendsLeFond: false });
        vrai('banc : sans EdgeRuntime, la reponse est partie avant que le webhook ne reponde', ecritsA(INCONNUE_E).length === 1 && enFond.length === 0);
        const sante = await (await webhook(new Request('https://banc/functions/v1/whatsapp-webhook', { method: 'GET' }))).json();
        vaut('banc : le controle de sante dit la tache de fond absente', false, sante.tacheDeFond);
        avecTacheDeFond(true);
        const sante2 = await (await webhook(new Request('https://banc/functions/v1/whatsapp-webhook', { method: 'GET' }))).json();
        vaut('banc : ... et presente', true, sante2.tacheDeFond);
      });
      return ecarts;
    },
    pannes: [
      { nom: 'le webhook confie les relivraisons', mute: [P(F_HOOK, '        if (!neufs.has(`wa-${e.waId}`) || !tetes.has(e.numero)) continue;', '        if (!tetes.has(e.numero)) continue;')] },
      { nom: 'le webhook confie les prestataires', mute: [P(F_HOOK, "        if (tiroir !== 'clientes' && tiroir !== 'equipe') continue;", '')] },
      { nom: 'le webhook attend l automate avant de repondre', mute: [P(F_HOOK, '        if (enFond) enFond(tache);', '        if (enFond) { await tache; enFond(tache); }')] },
      { nom: 'pas de notification de repli', mute: [P(F_HOOK, '    await alerteLePersonnel(sb, repli);', '')] },
      { nom: 'l en-tete oublie que Pas de robot a change', mute: [P(F_HOOK, '   « PAS DE ROBOT » A VALU JUSQU\'À CE JOUR. Depuis, pour les CLIENTES', '   Depuis, pour les CLIENTES')] },
      { nom: 'l en-tete ne dit plus que l annulation n est jamais automatique', mute: [P(F_HOOK, "     · L'ANNULATION N'EST JAMAIS AUTOMATIQUE : elle se transmet à l'équipe ;\n", '')] },
      { nom: 'la version du webhook n est pas celle du 9 octobre', mute: [P(F_HOOK, "const VERSION = '2026-10-10-", "const VERSION = '2026-10-08-")] },
    ],
  },

  /* ══ R19 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R19', nom: 'R19 whatsapp-automate : il pose par pose_si_libre au Je confirme, ecrit l etat par avance_le_fil seulement, dit la confirmation, passe la main si Meta refuse',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const corpsF = sansCommentaires(lf(lit(F_AUTO)));
      const horsBlocs = corpsF.slice(corpsF.indexOf('type AgendaLu ='));
      vrai('l etat du fil ne s ecrit jamais en direct (seulement par avance_le_fil)', horsBlocs.length > 1000 && !/\.from\(\s*'fils_automate'\s*\)\s*\.(?:upsert|insert|update|delete)\(/.test(horsBlocs) && /sb\.rpc\('avance_le_fil'/.test(horsBlocs));
      vrai('la pose passe par pose_si_libre, avec les maitres du juge', /sb\.rpc\('pose_si_libre', \{\s*p_rdv: rdv,\s*p_maitres: place\.maitres,/.test(horsBlocs));
      vrai('la ligne de confirmation ne bouge que si elle est encore « en cours »', /\.update\(\{ data: neuf, updated_at: maintenant \}\)\s*\.eq\('id', id\)\.eq\('data->>statut', 'en cours'\)/.test(horsBlocs));
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        /* ═ Une cliente connue, en essai : quatre messages. ═ */
        remetsLaBase({ mode: 'essai', numerosEssai: [NAFFI_E] });
        const p0 = B().pushs.length;
        await ecrit(NAFFI_E, 'Bonsoir, je voudrais passer samedi');
        const b1 = dernierA(NAFFI_E);
        vrai('banc : la meme chose ? avec la civilite, la derniere venue et son annee', /Madame Naffi/.test(corpsDe(b1)) && /12 septembre 2026/.test(corpsDe(b1)) && j(choixDe(b1).map((x) => x.titre)) === j(['La même chose', 'Autre chose', 'Parler à la Maison']), corpsDe(b1));
        vrai('banc : l etat ecrit par avance_le_fil (meme, version 1), avec son id', fil(NAFFI_E)?.etape === 'meme' && fil(NAFFI_E)?.version === 1 && fil(NAFFI_E)?.id === `fil-${NAFFI_E}`);
        const trace = [...T('messages_wa').values()].find((l: Any) => l.data.sens === 'sortant');
        vrai('banc : la trace dit Le Trone, automate, l etape et les choix', trace?.data.parQui === 'Le Trône' && trace?.data.auto === 'automate' && trace?.data.etape === 'meme' && trace?.data.choix?.length === 3);
        await touche(NAFFI_E, choix(NAFFI_E, 'La même chose'));
        const places = choixDe(dernierA(NAFFI_E)).filter((x) => /^MND:\d+:place:/.test(x.id));
        vrai('banc : les places, samedi en tete, l annee dans chaque titre, jamais le jour meme', places.length >= 1 && places.length <= 7 && places[0].titre.startsWith('Sam.') && places.every((x) => /2026/.test(x.titre))
          && places.every((x) => x.id.split(':')[3].slice(0, 8) > '20261015'), places.map((x) => x.titre).join(' | '));
        await touche(NAFFI_E, places[0]);
        vrai('banc : rien n est pose avant Je confirme', ![...T('appointments').keys()].some((k) => k.startsWith('rdv-wa-')) && B().poses.length === 0);
        const { m: oui, c: corpsOui } = await touche(NAFFI_E, choix(NAFFI_E, 'Je confirme'));
        const rdv = [...T('appointments').values()].find((a: Any) => a.id.startsWith('rdv-wa-'));
        vaut('banc : Je confirme pose le rendez-vous : son id, confirme, whatsapp, sa fiche, sa duree, la note d essai',
          { id: `rdv-wa-${cleCourte(oui.id)}`, status: 'confirmé', source: 'whatsapp', clientId: 'cli-naffi', dureeMin: 150, note: 'Pris sur WhatsApp · réponse automatique · essai' },
          { id: rdv?.id, status: rdv?.data.status, source: rdv?.data.source, clientId: rdv?.data.clientId, dureeMin: rdv?.data.dureeMin, note: rdv?.data.note });
        vaut('banc : ... la Maison attribue : les maitres libres du juge, le premier pris par le verrou', [['Team', 'Expert'], 'Team'], [B().poses[0]?.p_maitres, rdv?.data.master]);
        const b4 = dernierA(NAFFI_E);
        vrai('banc : la confirmation en texte, l annee, l itineraire, la devise', b4?.type === 'text' && /^C'est confirmé, Madame Naffi/.test(corpsDe(b4)) && /2026 à/.test(corpsDe(b4)) && /Akpakpa/.test(corpsDe(b4)) && corpsDe(b4).endsWith(DEVISE), corpsDe(b4));
        const ligne = T('envois').get(`conf-${rdv?.id}-whatsapp`)?.data;
        vrai('banc : la ligne de confirmation passe a envoye, avec l identifiant de Meta', ligne?.statut === 'envoyé' && /^wamid\.out-/.test(ligne?.waMessageId ?? ''), ligne);
        vrai('banc : la seule alerte, le rendez-vous pose, au prenom seul', pushsDepuis(p0).length === 2 && pushsDepuis(p0).every((x: Any) => x.title === 'Nouveau rendez-vous par WhatsApp' && /^Naffi, /.test(x.body) && /2026/.test(x.body)), pushsDepuis(p0));
        vaut('banc : quatre messages de la Maison', 4, ecritsA(NAFFI_E).length);
        vaut('banc : les juges de la Maison passent sur chaque message', [], fautesDuBanc(NAFFI_E));
        await livre(corpsOui);
        vaut('banc : une seconde livraison du Je confirme ne pose rien de plus', 1, [...T('appointments').keys()].filter((k) => k.startsWith('rdv-wa-')).length);
        vrai('banc : aucun numero ni texte au journal', leJournalSeTait(NAFFI_E), journal.slice(0, 3));
        vaut('banc : aucun rendez-vous retouche, aucune annulation', [], B().misesAJour.filter((x: Any) => x.table === 'appointments' || j(x.patch).includes('annulé')));
        /* ═ Une inconnue, en ouvert : sept messages, la demande, sa civilité. ═ */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(INCONNUE_E, 'Bonjour');
        await touche(INCONNUE_E, choix(INCONNUE_E, 'Entretenir mes locks'));
        await touche(INCONNUE_E, choixDe(dernierA(INCONNUE_E))[0]);
        const pl = choixDe(dernierA(INCONNUE_E)).filter((x) => /:place:/.test(x.id));
        await touche(INCONNUE_E, pl[1] ?? pl[0]);
        await touche(INCONNUE_E, choix(INCONNUE_E, 'Mademoiselle'));
        await ecrit(INCONNUE_E, 'awa');
        const { m: ouiB } = await touche(INCONNUE_E, choix(INCONNUE_E, 'Je confirme'));
        const rdvB = [...T('appointments').values()].find((a: Any) => a.id.startsWith('rdv-wa-'));
        const dem = T('demandes').get(`dem-wa-${cleCourte(ouiB.id)}`);
        vaut('banc : l inconnue : sept messages, le rendez-vous sans fiche, la demande avec sa civilite, aucune fiche creee',
          { messages: 7, clientId: '', clientName: 'Awa', source: 'whatsapp', civilite: 'mademoiselle', telephone: `+${INCONNUE_E}`, apptId: rdvB?.id, fiches: 1 },
          { messages: ecritsA(INCONNUE_E).length, clientId: rdvB?.data.clientId, clientName: rdvB?.data.clientName, source: dem?.data.source, civilite: dem?.data.civilite, telephone: dem?.data.telephone, apptId: dem?.data.apptId, fiches: T('clients').size });
        vaut('banc : les juges de la Maison, sur ses sept messages', [], fautesDuBanc(INCONNUE_E));
        /* ═ La place prise entre-temps (les deux fauteuils) : rien n'est posé. ═ */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(NAFFI_E, 'Je voudrais passer samedi');
        await touche(NAFFI_E, choix(NAFFI_E, 'La même chose'));
        const p = choixDe(dernierA(NAFFI_E)).filter((x) => /:place:/.test(x.id))[0];
        await touche(NAFFI_E, p);
        const arg = p.id.split(':')[3];
        const date = `${arg.slice(0, 4)}-${arg.slice(4, 6)}-${arg.slice(6, 8)}`;
        const heure = `${arg.slice(9, 11)}:${arg.slice(11, 13)}`;
        for (const [i, m] of [[1, 'Team'], [2, 'Expert']] as const) T('appointments').set(`rdv-x${i}`, { id: `rdv-x${i}`, data: { id: `rdv-x${i}`, branchId: 'maison', date, time: heure, status: 'confirmé', master: m, dureeMin: 150 } });
        await touche(NAFFI_E, choix(NAFFI_E, 'Je confirme'));
        vrai('banc : la place prise entre-temps : rien n est pose, les places les plus proches sans elle', ![...T('appointments').keys()].some((k) => k.startsWith('rdv-wa-'))
          && /Cette heure vient d'être prise, Madame Naffi/.test(corpsDe(dernierA(NAFFI_E))) && !choixDe(dernierA(NAFFI_E)).some((x) => x.id.endsWith(arg)), corpsDe(dernierA(NAFFI_E)));
        /* ═ Meta refuse : la main passe, sans un mot de plus. ═ */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        B().refuseGraph = 1;
        const p1 = B().pushs.length;
        await ecrit(NAFFI_E, 'Je voudrais prendre rendez-vous');
        vaut('banc : Meta refuse : main passee, motif envoi-refuse, un seul essai', { etape: 'main', motif: 'envoi-refuse', essais: 1 }, { etape: fil(NAFFI_E)?.etape, motif: fil(NAFFI_E)?.motifMain, essais: ecritsA(NAFFI_E).length });
        vrai('banc : ... et l equipe est alertee', pushsDepuis(p1).length === 2 && pushsDepuis(p1).every((x: Any) => x.title === 'WhatsApp · la main passe'), pushsDepuis(p1));
        /* ═ Créer ses locks : la consultation, jamais la création. ═ */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(INCONNUE_E, 'Bonjour');
        await touche(INCONNUE_E, choix(INCONNUE_E, 'Créer mes locks'));
        await touche(INCONNUE_E, choixDe(dernierA(INCONNUE_E)).find((x) => /:place:/.test(x.id)));
        await touche(INCONNUE_E, choix(INCONNUE_E, 'Madame'));
        await ecrit(INCONNUE_E, "Je m'appelle Grace");
        await touche(INCONNUE_E, choix(INCONNUE_E, 'Je confirme'));
        const rdvC = [...T('appointments').values()].find((a: Any) => a.id.startsWith('rdv-wa-'));
        vaut('banc : une premiere couronne : seul le KOKO Origine se pose', ['sv-koko-ori'], rdvC?.data.serviceIds);
        /* ═ La porte : le webhook seul, par la clé de service. ═ */
        const automate = await chargeLaFonction('whatsapp-automate');
        const url = `${ENV.SUPABASE_URL}/functions/v1/whatsapp-automate`;
        const sans = await automate(new Request(url, { method: 'POST', body: JSON.stringify({ numero: NAFFI_E, waIds: ['x'] }) }));
        const mauvaise = await automate(new Request(url, { method: 'POST', headers: { authorization: 'Bearer cle-service-du-banX' }, body: '{}' }));
        vrai('banc : sans la cle de service, ou avec une autre : 401, les longueurs seules', sans.status === 401 && mauvaise.status === 401 && !j(await mauvaise.json()).includes('cle-service'));
        const sante = await (await automate(new Request(url, { method: 'GET' }))).json();
        vrai('banc : le controle de sante dit la version du 9 octobre et des longueurs, jamais le secret', /^2026-10-09/.test(sante.version) && sante.secrets?.CLE_SERVICE === ENV.CLE_SERVICE.length && !j(sante).includes(ENV.CLE_SERVICE), sante);
      });
      return ecarts;
    },
    pannes: [
      { nom: 'l etat s ecrit en direct', mute: [P(F_AUTO, "  const { data: version, error: errAvance } = await sb.rpc('avance_le_fil', {", "  await sb.from('fils_automate').upsert({ id: `fil-${o.numero}`, data: sortie.etat });\n  const { data: version, error: errAvance } = await sb.rpc('avance_le_fil', {")] },
      { nom: 'le premier maitre de la liste, sans regarder', mute: [P(F_AUTO, '    p_maitres: place.maitres,', '    p_maitres: [place.maitres[0], ...place.maitres].slice(1, 2),')] },
      { nom: 'la confirmation oubliee (la ligne reste en cours)', mute: [P(F_AUTO, '  if (posee) await ditLaConfirmation(sb, posee, laConfirmation', '  if (false) await ditLaConfirmation(sb, posee, laConfirmation')] },
      { nom: 'un refus de Meta reste muet', mute: [P(F_AUTO, "      refus = 'envoi-refuse';", '      refus = null;')] },
      { nom: 'la ligne de confirmation se reecrit sans condition', mute: [P(F_AUTO, ".eq('id', id).eq('data->>statut', 'en cours');", ".eq('id', id);")] },
      { nom: 'la porte de l automate s ouvre sans la cle', mute: [P(F_AUTO, '  if (!service || !memeCle(recue, service)) {', '  if (!service) {')] },
    ],
  },
  /* ══ R20 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R20', nom: 'R20 le numero ne dit pas toujours qui ecrit : une mineure, un second numero, deux adultes passent par Pour qui, rien de personne n est dit avant ; l essai ne pose que sur la fiche de son premier numero',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '11:00');
      /* Kemi, dix ans, porte le numero de sa maman, qui n a pas de fiche. */
      const KEMI_SEULE: FicheDuNumero = { id: 'c-kemi', nom: 'Kemi Morou', parPhone: true, naissance: '2016-04-02', numeros: [NUM_NAFFI], derniereVenue: { date: '2026-09-12', serviceIds: ['plt-05'] } };
      const m = parcours(ORIGINAL, NUM_NAFFI, [KEMI_SEULE]);
      const s1 = elle(m, t0, { texte: 'Bonjour, je voudrais un rendez-vous pour moi' });
      vrai('une mineure seule sur le numero : Pour qui, sans son nom ni sa derniere venue', s1.messages[0]?.etape === 'qui'
        && corps(s1) === 'Bonjour Madame, merci de votre message. Pour qui est ce rendez-vous ?', corps(s1));
      vaut('... Pour Kemi, Pour moi, Une autre personne, la Maison', ['Pour Kemi', 'Pour moi', 'Une autre personne', 'Parler à la Maison'], lignesDe(s1));
      const s2 = elle(m, t0 + 1000, { touche: 'Pour moi' });
      vrai('Pour moi : le parcours d une inconnue', s2.messages[0]?.etape === 'besoin', corps(s2));
      elle(m, t0 + 2000, { touche: 'Entretenir mes locks' });
      elle(m, t0 + 3000, { touche: 'KLƆKLƆ™ Essentiel' });
      elle(m, t0 + 4000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      elle(m, t0 + 5000, { touche: 'Madame' });
      elle(m, t0 + 6000, { texte: 'Grâce' });
      const s8 = elle(m, t0 + 7000, { touche: 'Je confirme' });
      vaut('... la pose est sans fiche, sa demande a son prenom (jamais sur la fiche de Kemi)', { clientId: '', clientName: 'Grâce', demande: 'Grâce' },
        { clientId: m.poses[0]?.rdv.clientId, clientName: m.poses[0]?.rdv.clientName, demande: m.poses[0]?.demande?.prenom });
      vrai('... c est confirme, Madame Grace', corps(s8).startsWith("C'est confirmé, Madame Grâce"), corps(s8));
      const k = parcours(ORIGINAL, NUM_NAFFI, [KEMI_SEULE]);
      elle(k, t0, { texte: 'Bonjour, je voudrais un rendez-vous' });
      const k2 = elle(k, t0 + 1000, { touche: 'Pour Kemi' });
      vaut('Pour Kemi : sa derniere venue, dite d elle', 'La dernière venue de Kemi, Madame : KLƆKLƆ™ Essentiel, le samedi 12 septembre 2026. Souhaitez-vous la même chose ?', corps(k2));
      /* Le mari d Awa ecrit du numero range en second numero sur sa fiche. */
      const AWA: FicheDuNumero = { id: 'c-awa', nom: 'Awa Sossa', civilite: 'madame', parPhone: false, numeros: ['2290196000000', NUM_NAFFI], derniereVenue: { date: '2026-09-12', serviceIds: ['plt-05'] } };
      const a = parcours(ORIGINAL, NUM_NAFFI, [AWA]);
      const a1 = elle(a, t0, { texte: 'je voudrais prendre rendez-vous pour moi' });
      vrai('un second numero : Pour qui, ni Madame Awa ni la venue d Awa', a1.messages[0]?.etape === 'qui' && !/Awa/.test(corps(a1)) && !/septembre/.test(corps(a1)), corps(a1));
      vaut('... Pour Awa, Pour moi, Une autre personne', ['Pour Awa', 'Pour moi', 'Une autre personne', 'Parler à la Maison'], lignesDe(a1));
      /* Deux adultes sur le meme premier numero : on demande, sans Pour moi. */
      const deux = parcours(ORIGINAL, NUM_NAFFI, [NAFFI, { id: 'c-soeur', nom: 'Sika Morou', parPhone: true, numeros: [NUM_NAFFI] }]);
      vaut('deux adultes sur le meme numero : Pour Naffi, Pour Sika', ['Pour Naffi', 'Pour Sika', 'Une autre personne', 'Parler à la Maison'], lignesDe(elle(deux, t0, { texte: 'Je voudrais un rendez-vous' })));
      vaut('une adulte seule par son premier numero : La meme chose, directement', 'meme', scnConnue(ORIGINAL).s1.messages[0]?.etape);
      /* ESSAI : le numero de la direction est le second numero d une proche,
         et une enfant de la famille est trouvee par lui. */
      const essai: ReglageDeLAutomate = { mode: 'essai', numerosEssai: [NUM_NAFFI], horizonJours: 14, pauseHeures: 24 };
      const e = parcours(ORIGINAL, NUM_NAFFI, [AWA, KEMI], essai);
      const e1 = elle(e, t0, { texte: 'Je voudrais un rendez-vous' });
      vrai('en essai, une fiche du second numero ou de la famille n est jamais proposee', e1.messages[0]?.etape === 'besoin' && !lignesDe(e1).some((x) => /Awa|Kemi/.test(x)), `${corps(e1)} ${lignesDe(e1).join(' | ')}`);
      elle(e, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(e, t0 + 2000, { touche: 'KLƆKLƆ™ Essentiel' });
      elle(e, t0 + 3000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      elle(e, t0 + 4000, { touche: 'Madame' });
      elle(e, t0 + 5000, { texte: 'Yeman' });
      elle(e, t0 + 6000, { touche: 'Je confirme' });
      vaut('... la pose d essai se fait sans fiche, jamais sur celle de la proche', ['', 'Pris sur WhatsApp · réponse automatique · essai'], [e.poses[0]?.rdv.clientId, e.poses[0]?.rdv.note]);
      return ecarts;
    },
    pannes: [
      { nom: 'le titulaire est la premiere fiche trouvee, meme par le second numero', mute: [P(AUTO, '  const adultes = fiches.filter((f) => f.parPhone && !mineureWa(f.naissance, aujourdhuiIso));\n  return adultes.length === 1 ? adultes[0] : undefined;', '  return fiches.find((f) => f.parPhone) ?? (fiches.filter((f) => !f.parFamille).length === 1 ? fiches.find((f) => !f.parFamille) : undefined);')] },
      { nom: 'une mineure passe pour celle qui ecrit', mute: [P(AUTO, '  return age < 18;', '  return age < 0;')] },
      { nom: 'l essai sert toutes les fiches du numero', mute: [P(AUTO, "  return ctx.reglage.mode === 'essai' ? ctx.fiches.filter((f) => f.parPhone) : ctx.fiches;", '  return ctx.fiches;')] },
      { nom: 'Pour moi disparait', mute: [P(AUTO, "      ...(pourMoiPossible ? [{ id: choix('moi'), titre: 'Pour moi' }] : []),\n", '')] },
    ],
  },

  /* ══ R21 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R21', nom: 'R21 un rendez-vous qu elle a deja, une Maison qui vient d ecrire : il se tait, l equipe repond (et une vraie demande parle toujours)',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '11:00');
      const ctxL = (o: Partial<ContexteDuTour> = {}): ContexteDuTour => ({ maintenantMs: t0, numero: NUM_NAFFI, tiroir: 'clientes', reglage: OUVERT, fiches: [NAFFI], premierMessage: false, main: null, maison: { nom: 'Maison MND' }, ...o });
      const dit = (texte: string, o: Partial<ContexteDuTour> = {}) => quiParle(null, tourDeLaCliente([{ waId: 'w-1', quand: isoDe(t0), texte, sens: 'entrant' }], []), ctxL(o));
      const existants = [
        'Bonjour, je confirme mon rendez-vous de samedi', 'Je serai bien là demain pour mon rdv',
        'Est-ce que je peux venir avec ma fille à mon rendez-vous de samedi ?', "j'ai réservé sur le site pour samedi, c'est bien noté ?",
        'Je suis devant la porte pour mon rendez-vous', 'A quelle heure est mon rdv demain ?',
        "Merci pour le rendez-vous d'hier, c'était super", 'Mon rendez-vous de samedi tient toujours ?', 'Oui d accord pour le rdv de samedi 10h',
      ];
      vaut('un rendez-vous qu elle a deja : silence', existants.map(() => 'silence'), existants.map((x) => dit(x)));
      vrai('renvoieAUnRdv crie sur chacune, se tait sur une demande neuve', existants.every((x) => renvoieAUnRdv(x)) && !renvoieAUnRdv('Bonjour, je voudrais prendre rendez-vous samedi'));
      const neufs = ['Bonjour, je voudrais prendre rendez-vous', 'Je voudrais un rendez-vous samedi', 'Est-ce que je peux passer jeudi ?', 'Bonjour, une place cette semaine ?'];
      vaut('... une vraie demande parle toujours', neufs.map(() => 'parle'), neufs.map((x) => dit(x)));
      vaut('sa fiche porte un rendez-vous a venir : silence ; celui de la famille ne compte pas', ['silence', 'parle'],
        [dit('Je voudrais un rendez-vous', { fiches: [{ ...NAFFI, prochainRdv: { date: '2026-10-17', time: '09:00' } }] }),
          dit('Je voudrais un rendez-vous', { fiches: [NAFFI, { ...KEMI, prochainRdv: { date: '2026-10-17' } }] })]);
      const rendue: MainDuFil = { pauseLe: isoDe(t0 - 2 * 86400000), jusqua: isoDe(t0 - 86400000), rendueLe: isoDe(t0 - 3600000) };
      vaut('la Maison a ecrit il y a deux jours : silence ; huit jours : il parle ; rendue depuis : il parle', ['silence', 'parle', 'parle'],
        [dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 2 * 86400000) }),
          dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 8 * 86400000) }),
          dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 2 * 86400000), main: rendue })]);
      vaut('... meme une annulation : la Maison mene, il se tait', 'silence', dit('Je dois annuler mon rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 3600000) }));
      const sql = sqlSans(lit(M0125));
      vrai('0125 : fiches_du_numero rend le prochain rendez-vous (confirme ou en attente, d aujourd hui a Cotonou), pas pour la famille',
        /'prochainRdv', case when not r\.par_famille then/.test(sql) && /coalesce\(a\.data->>'status', ''\) in \('confirmé', 'en attente'\)\s+and a\.data->>'date' >= to_char\(now\(\) at time zone 'Africa\/Porto-Novo', 'YYYY-MM-DD'\)/.test(sql));
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        /* L equipe lui a ecrit hier de sa main : sa reponse est pour l equipe. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        const hier = new Date(Date.now() - 86400000).toISOString();
        T('messages_wa').set('wa-equipe', { id: 'wa-equipe', data: { id: 'wa-equipe', sens: 'sortant', numero: NAFFI_E, texte: 'Je vous propose samedi 10 h.', quand: hier, parQui: 'Y. B.' } });
        await ecrit(NAFFI_E, 'Oui je voudrais un rendez-vous samedi 10h');
        vrai('banc : la Maison a ecrit hier : l automate ne prend pas, la notification habituelle part', appelsAutomate === 1 && ecritsA(NAFFI_E).length === 0 && !fil(NAFFI_E)
          && B().pushs.length === 2 && B().pushs[0].title === 'Naffi vous écrit sur WhatsApp', B().pushs);
        /* Ses propres messages ne comptent pas : l automate d hier n empeche rien. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        T('messages_wa').set('wa-auto', { id: 'wa-auto', data: { id: 'wa-auto', sens: 'sortant', numero: NAFFI_E, texte: 'Bonjour Madame Naffi', quand: hier, parQui: 'Le Trône', auto: 'automate' } });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous samedi');
        vrai('banc : un message de l automate d hier n empeche rien', ecritsA(NAFFI_E).length === 1 && fil(NAFFI_E)?.etape === 'meme');
        /* Un rendez-vous a venir sur sa fiche : il se tait. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] }, { rdvs: [{ id: 'rdv-avenir', branch_id: 'maison', data: { id: 'rdv-avenir', clientId: 'cli-naffi', branchId: 'maison', date: '2026-10-20', time: '10:00', status: 'confirmé', serviceIds: ['sv-klk-ess'] } }] });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous samedi');
        vrai('banc : un rendez-vous a venir : l automate ne prend pas, la notification part', ecritsA(NAFFI_E).length === 0 && !fil(NAFFI_E) && B().pushs.length === 2, B().pushs);
      });
      return ecarts;
    },
    pannes: [
      { nom: 'un rendez-vous existant passe pour une envie de reserver', mute: [P(AUTO, 'function renvoieAUnRdv(texte: string): boolean {\n', 'function renvoieAUnRdv(texte: string): boolean {\n  if (texte) return false;\n')] },
      { nom: 'le prochain rendez-vous ne compte pas', mute: [P(AUTO, ' || fiches.some((f) => !f.parFamille && !!f.prochainRdv)', '')] },
      { nom: 'la parole de la Maison ne compte pas', mute: [P(AUTO, '  if (!Number.isFinite(le) || ctx.maintenantMs - le >= LA_MAISON_A_PARLE_MS) return false;', '  return false;')] },
      { nom: 'la fonction ne lit pas la parole de la Maison', mute: [P(F_AUTO, '    ...(parole ? { derniereParoleDeLaMaison: parole } : {}),\n', '')] },
      { nom: 'la fonction perd le prochain rendez-vous des fiches', mute: [P(F_AUTO, '      ...(prochain ? { prochainRdv: prochain } : {}),\n', '')] },
      { nom: '0125 ne rend plus le prochain rendez-vous', mute: [P(M0125, "           'prochainRdv', case when not r.par_famille then", "           'prochainRdvOublie', case when not r.par_famille then")] },
    ],
  },

  /* ══ R22 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R22', nom: 'R22 une question qui n est pas de reserver ne s avale jamais : au repos il se tait, en plein parcours la main passe, dite',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '11:00');
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
      elle(p, t0 + 1000, { touche: 'La même chose' });
      const q = elle(p, t0 + 2000, { texte: 'Je dois venir avec les cheveux lavés ?' });
      vrai('en plein parcours : la main passe, dite, motif question, l equipe alertee', q.messages[0]?.etape === 'main'
        && corps(q) === 'Une personne de la Maison vous répond ici, Madame Naffi.' && p.etat?.motifMain === 'question'
        && q.alerte?.corps === 'Naffi · une question à lire', j({ corps: corps(q), motif: p.etat?.motifMain, alerte: q.alerte }));
      vrai('... et l alarme sonne (le fil est en main passee)', tenuParLAutomate(p.etat, null, t0 + 3000) === 'main');
      const r = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(r, t0, { texte: 'Je voudrais un rendez-vous' });
      elle(r, t0 + 1000, { touche: 'La même chose' });
      const s = elle(r, t0 + 2000, { texte: "Mardi c'est possible ?" });
      vrai('une question sur le jour reste de la reservation : les places de mardi', s.messages[0]?.etape === 'places' && (lignesDe(s)[0] ?? '').startsWith('Mar.'), lignesDe(s).join(' | '));
      const ctxL = (o: Partial<ContexteDuTour> = {}): ContexteDuTour => ({ maintenantMs: t0, numero: NUM_INCONNUE, tiroir: 'clientes', reglage: OUVERT, fiches: [], premierMessage: true, main: null, maison: { nom: 'Maison MND' }, ...o });
      const dit = (texte: string, o: Partial<ContexteDuTour> = {}) => quiParle(null, tourDeLaCliente([{ waId: 'w-q', quand: isoDe(t0), texte, sens: 'entrant' }], []), ctxL(o));
      vaut('au repos : la question d autre chose se tait, meme melee a une demande ; celle du jour parle', ['silence', 'silence', 'parle', 'parle'],
        [dit('Bonjour, vous êtes où exactement ?'), dit('Vous vendez le sérum ? Et je voudrais un rdv samedi', { fiches: [NAFFI], premierMessage: false }),
          dit('Vous êtes ouverts samedi ?'), dit('Bonjour')]);
      vrai('uneQuestionAutre : oui pour le serum, non pour samedi ni pour une demande', uneQuestionAutre('Vous vendez le sérum ?', t0)
        && !uneQuestionAutre('Est-ce que je peux passer jeudi ?', t0) && !uneQuestionAutre('Une place samedi matin ?', t0) && !uneQuestionAutre('Bonjour, je voudrais un rdv', t0));
      return ecarts;
    },
    pannes: [
      { nom: 'une question d autre chose est un ecart', mute: [P(AUTO, "    if (uneQuestionAutre(t.texte, ms)) return laMain('question', true);\n", '')] },
      { nom: 'au repos, une question d autre chose lance un parcours', mute: [P(AUTO, '  } else if (uneQuestionAutre(tour.texte, ms)) {\n    parle = false;\n', '')] },
      { nom: 'le juge des questions ne voit plus rien', mute: [P(AUTO, '    if (!intentionDeReserver(phrase) && !m.jourVoulu && !m.jourEvite && !m.moment && !m.jourMeme) return true;', '')] },
    ],
  },

  /* ══ R23 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R23', nom: 'R23 fevrier n est pas un prix : toute date de fevrier passe les juges, un vrai prix crie toujours',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const dates: string[] = [];
      for (const an of [2026, 2027]) {
        for (let d = 1; d <= 28; d += 1) {
          const iso = `${an}-02-${String(d).padStart(2, '0')}`;
          dates.push(jourDitAvecAnnee(iso), titreDePlace(iso, '09:00'), titreDePlace(iso, '14:30'), `le ${jourDitAvecAnnee(iso)} à 9 h`);
        }
      }
      vaut('aucune date de fevrier (2026, 2027), en titre ou en corps, ne passe pour un prix', [], dates.filter((x) => texteSain(x).length > 0));
      const prix = ['5000 F', '5 000 FCFA', '15000 francs', '3 000 f.', '2500F', '10 000 XOF', '7.500 cfa', 'Ça fait 12 000 F, merci'];
      vaut('un vrai prix crie toujours', prix.map(() => true), prix.map((x) => texteSain(x).includes('un prix')));
      /* Venue le 5 fevrier 2026 : La meme chose ? passe les juges. */
      const v = parcours(ORIGINAL, NUM_NAFFI, [{ ...NAFFI, derniereVenue: { date: '2026-02-05', serviceIds: ['plt-05'] } }]);
      const s1 = elle(v, cotonou('2026-10-09', '11:00'), { texte: 'Je voudrais un rendez-vous' });
      vrai('venue le 5 fevrier 2026 : La meme chose ? sans faute', /5 février 2026/.test(corps(s1)) && fautesDesTextes(s1.messages).length === 0, corps(s1));
      /* Fin janvier 2027 : les places de fevrier, le recapitulatif, la confirmation. */
      const f = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const t = cotonou('2027-01-29', '11:00');
      elle(f, t, { texte: 'Je voudrais un rendez-vous mardi' });
      const l = elle(f, t + 1000, { touche: 'La même chose' });
      const fev = (l.messages[0]?.lignes ?? []).find((x) => /févr\. 2027/.test(x.titre));
      vrai('les places de fevrier se proposent', !!fev, lignesDe(l).join(' | '));
      if (fev) {
        elle(f, t + 2000, { id: fev.id, touche: fev.titre });
        elle(f, t + 3000, { touche: 'Je confirme' });
      }
      vrai('... recapitulatif et confirmation de fevrier : aucun juge ne crie', f.envoyes.some((m) => m.etape === 'confirme' && /février 2027/.test(m.corps)) && fautesDesTextes(f.envoyes).length === 0,
        fautesDesTextes(f.envoyes).slice(0, 3));
      return ecarts;
    },
    pannes: [
      { nom: 'le juge du prix d avant (le f de fevrier)', mute: [P(AUTO, "  if (/\\d[\\d\\s.,]*\\s?(fcfa|cfa|xof|francs?|f)(?![\\p{L}])/iu.test(s)) fautes.push('un prix');", "  if (/\\d[\\d\\s.,]*\\s?(f|fcfa|cfa|xof|francs?)\\b/i.test(s)) fautes.push('un prix');")] },
      { nom: 'le juge du prix ne voit plus les francs', mute: [P(AUTO, "  if (/\\d[\\d\\s.,]*\\s?(fcfa|cfa|xof|francs?|f)(?![\\p{L}])/iu.test(s)) fautes.push('un prix');", '')] },
    ],
  },

  /* ══ R24 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R24', nom: 'R24 l alarme ne s eteint pas a tort : rendue apres une main passee, une reponse non remise ; la main qui passe sonne',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const NUM = '2290197000001';
      const T0 = Date.parse('2026-10-09T10:04:00Z');
      const MAINT = T0 + 5 * 60000;
      const tete: TeteConnue = { id: 'c-naffi', name: 'Naffi Morou', phone: '+229 01 97 00 00 01', branchId: 'b1' };
      const prix: MessageWa = { id: 'wa-1', sens: 'entrant', numero: NUM, texte: 'c est combien le retwist ?', quand: isoDe(T0) } as MessageWa;
      const auto: MessageWa = { id: 'wa-2', sens: 'sortant', numero: NUM, texte: 'Voici les prochaines places', quand: isoDe(T0 + 3000), parQui: 'Le Trône', auto: 'automate', etat: 'remis' } as MessageWa;
      const etat = (o: Partial<EtatDuFil>): LigneDesFilsAutomate => ({
        id: `fil-${NUM}`, numero: NUM, version: 3, etape: 'places', depuis: isoDe(T0), versionDeLEtape: 2, majLe: isoDe(T0 + 3000),
        prisLe: isoDe(T0 - 60000), traites: ['wamid.1'], dernierEntrantQuand: isoDe(T0), panier: {}, ecarts: 0, envois: [isoDe(T0 + 3000)], ...o,
      } as unknown as LigneDesFilsAutomate);
      const leFil = (msgs: MessageWa[], lignes: LigneDesFilsAutomate[]) =>
        filsDeLaMaison(msgs, [tete], [], MAINT, undefined, automatesDesFils(lignes)).find((f) => f.numero === NUM)!;
      /* La main a passe sur sa question de prix ; l equipe touche « Rendre a l automate » sans repondre. */
      const mainPassee = etat({ etape: 'main', motifMain: 'prix', mainPasseeLe: isoDe(T0 + 1000), etapeAvantLaMain: 'places', versionAvantLaMain: 2 });
      const rendue: LigneDesFilsAutomate = { id: `main-${NUM}`, numero: NUM, rendueLe: isoDe(T0 + 120000) } as LigneDesFilsAutomate;
      const f1 = leFil([prix], [mainPassee, rendue]);
      vaut('rendue a l automate apres la main : le fil se dit mene, mais sa question attend toujours', ['tenu', true], [f1.automate?.tenue, f1.attendUneReponse]);
      vaut('... silenceDeLAlarme le dit', false, silenceDeLAlarme('tenu', mainPassee as unknown as EtatDuFil, isoDe(T0), MAINT));
      vaut('... un nouveau tour qu il a traite, lui, se tait', true, silenceDeLAlarme('tenu', etat({ etape: 'places' }) as unknown as EtatDuFil, isoDe(T0), MAINT));
      /* Sa reponse est revenue « non remis » : elle n a rien recu. */
      vaut('une reponse de l automate remise : il ne sonne pas ; non remise : elle attend', [false, true],
        [leFil([prix, auto], [etat({})]).attendUneReponse, leFil([prix, { ...auto, etat: 'non-remis' } as MessageWa], [etat({})]).attendUneReponse]);
      /* La sonnette du passage. */
      const avant = new Map([[NUM, { attend: false, tenue: 'tenu' as const }]]);
      const apres = [{ numero: NUM, attendUneReponse: true, automate: { tenue: 'main' as const } }];
      vaut('la main qui passe sonne ; pas au premier chargement, pas le fil ouvert, pas deux fois', [[NUM], [], [], []],
        [sonnentApresLAutomate({ avant, fils: apres }).numeros, sonnentApresLAutomate({ avant: null, fils: apres }).numeros,
          sonnentApresLAutomate({ avant, fils: apres, filOuvert: '+229 01 97 00 00 01' }).numeros,
          sonnentApresLAutomate({ avant: new Map([[NUM, { attend: true, tenue: 'main' as const }]]), fils: apres }).numeros]);
      vaut('... un fil qui n etait pas tenu a deja sonne a l arrivee de son message : rien de plus', [[], []],
        [sonnentApresLAutomate({ avant: new Map([[NUM, { attend: false, tenue: 'fini' as const }]]), fils: apres }).numeros,
          sonnentApresLAutomate({ avant: new Map([[NUM, { attend: false }]]), fils: apres }).numeros]);
      vaut('... un tour en echec sur un fil tenu (il attend, toujours tenu) sonne aussi', [NUM],
        sonnentApresLAutomate({ avant, fils: [{ numero: NUM, attendUneReponse: true, automate: { tenue: 'tenu' as const } }] }).numeros);
      for (const f of [ECRAN_CONV, ECRAN_ALARME]) {
        vrai(`${f} : la main qui passe sonne (sonnentApresLAutomate sur tous les fils)`, /sonnentApresLAutomate\(\{ avant: vusDeLAutomate\.current, fils: tous/.test(sansCommentaires(lit(f))) && /\}, \[tous\]\);/.test(lit(f)));
      }
      return ecarts;
    },
    pannes: [
      { nom: 'rendre a l automate eteint l alarme', mute: [P(AUTO, "  if (fil?.etape === 'main' && Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return false;\n", '')] },
      { nom: 'une reponse non remise passe pour une reponse', mute: [P(CONV, '    const repondueParLAutomate = elleAttend && !reponseNonRemise && !!vue && !!auto', '    const repondueParLAutomate = elleAttend && !!vue && !!auto')] },
      { nom: 'la main qui passe ne sonne pas', mute: [P(CONV, '    numeros.push(n);\n  }\n  return { numeros, vue };', '  }\n  return { numeros, vue };')] },
      { nom: 'un fil fini sonne deux fois', mute: [P(CONV, "    if (!o.avant || !avant || avant.attend || avant.tenue !== 'tenu') continue;", '    if (!o.avant || !avant || avant.attend) continue;')] },
      { nom: 'l alarme du tableau de bord ne sonne pas au passage', mute: [P(ECRAN_ALARME, '    const { numeros, vue } = sonnentApresLAutomate({ avant: vusDeLAutomate.current, fils: tous });', '    const { numeros, vue } = { numeros: [] as string[], vue: new Map() };')] },
    ],
  },

  /* ══ R25 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R25', nom: 'R25 Meta refuse apres coup un message de l automate : le webhook le rend a l automate, la main passe, l equipe est prevenue',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const statuts = (s: Any[]) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: 'PHONE' }, statuses: s } }] }] });
      const dernierSortant = (num: string) => [...T('messages_wa').values()].filter((l: Any) => l.data.sens === 'sortant' && l.data.numero === num && l.data.auto === 'automate')
        .sort((a: Any, b: Any) => (a.data.quand < b.data.quand ? -1 : 1)).at(-1)?.data;
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous');
        await touche(NAFFI_E, choix(NAFFI_E, 'La même chose'));
        vaut('banc : en plein parcours (les places)', 'places', fil(NAFFI_E)?.etape);
        const liste = dernierSortant(NAFFI_E);
        const n0 = ecritsA(NAFFI_E).length;
        const p0 = B().pushs.length;
        const a0 = appelsAutomate;
        await livre(statuts([{ id: liste?.waId, status: 'failed', recipient_id: NAFFI_E, timestamp: String(Math.floor(Date.now() / 1000)), errors: [{ code: 131026, title: 'Message undeliverable' }] }]));
        vaut('banc : la liste revient non remise, le fil passe la main (envoi-refuse)', { etat: 'non-remis', etape: 'main', motif: 'envoi-refuse' },
          { etat: dernierSortant(NAFFI_E)?.etat, etape: fil(NAFFI_E)?.etape, motif: fil(NAFFI_E)?.motifMain });
        vrai('banc : ... l automate est appele une fois, ne lui ecrit rien de plus', appelsAutomate === a0 + 1 && ecritsA(NAFFI_E).length === n0, { appels: appelsAutomate - a0, messages: ecritsA(NAFFI_E).length - n0 });
        vrai('banc : ... l equipe est prevenue, au prenom seul', pushsDepuis(p0).length === 2 && pushsDepuis(p0).every((x: Any) => x.title === 'WhatsApp · la main passe' && x.body === 'Naffi · un message refusé par Meta'), pushsDepuis(p0));
        const p1 = B().pushs.length;
        await livre(statuts([{ id: liste?.waId, status: 'failed', recipient_id: NAFFI_E, timestamp: String(Math.floor(Date.now() / 1000)) }]));
        vrai('banc : un second accuse du meme refus ne refait rien', appelsAutomate === a0 + 1 && B().pushs.length === p1);
        /* Un fil qui n est plus en parcours (la confirmation non remise) ne bouge pas : le modele prend le relais. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous');
        await touche(NAFFI_E, choix(NAFFI_E, 'La même chose'));
        await touche(NAFFI_E, choixDe(dernierA(NAFFI_E)).find((x) => /:place:/.test(x.id)));
        await touche(NAFFI_E, choix(NAFFI_E, 'Je confirme'));
        const conf = dernierSortant(NAFFI_E);
        const p2 = B().pushs.length;
        await livre(statuts([{ id: conf?.waId, status: 'failed', recipient_id: NAFFI_E, timestamp: String(Math.floor(Date.now() / 1000)) }]));
        const rdv = [...T('appointments').values()].find((x: Any) => x.id.startsWith('rdv-wa-'));
        vaut('banc : la confirmation non remise : le fil reste confirme, la ligne passe a echec (le modele prend le relais), rien ne sonne',
          { etape: 'confirme', statut: 'échec', pushs: 0 }, { etape: fil(NAFFI_E)?.etape, statut: T('envois').get(`conf-${rdv?.id}-whatsapp`)?.data.statut, pushs: B().pushs.length - p2 });
      });
      return ecarts;
    },
    pannes: [
      { nom: 'le webhook garde le refus pour lui', mute: [P(F_HOOK, '          if (n) refusesApresCoup.add(n);', '          void n;')] },
      { nom: 'l automate ignore le rattrapage', mute: [P(F_AUTO, "  if (corps.apresCoup === 'envoi-refuse') {", "  if (corps.apresCoup === 'jamais') {")] },
      { nom: 'le rattrapage ne passe pas la main', mute: [P(F_AUTO, "  const apres = mainApresCoup(fil, 'envoi-refuse', ctx);", "  const apres = { etat: fil, alerte: undefined };")] },
    ],
  },

  /* ══ R26 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R26', nom: 'R26 un rendez-vous pose ne se perd jamais : pas de rejeu apres la pose, Meta a dix secondes, une ligne en cours trop vieille se retente',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const envoie = corpsTs(sansCommentaires(lf(lit(F_AUTO))), 'async function envoieAGraph(');
      vrai('whatsapp-automate : chaque appel a Graph porte un delai (dix secondes)', /signal: AbortSignal\.timeout\(DELAI_DE_META_MS\)/.test(envoie) && /const DELAI_DE_META_MS = 10_000;/.test(lit(F_AUTO)));
      await auBanc(ecarts, async () => {
        avecTacheDeFond(true);
        /* LA COURSE : elle touche « Je confirme », et une question de prix,
           envoyee juste apres, fait avancer le fil par un autre appel
           pendant la pose. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous');
        await touche(NAFFI_E, choix(NAFFI_E, 'La même chose'));
        await touche(NAFFI_E, choixDe(dernierA(NAFFI_E)).find((x) => /:place:/.test(x.id)));
        const n0 = ecritsA(NAFFI_E).length;
        const p0 = B().pushs.length;
        B().avantAvance = (num: string) => {
          const l = T('fils_automate').get(`fil-${num}`);
          const vus = [...T('messages_wa').values()].filter((m: Any) => m.data.sens === 'entrant' && m.data.numero === num).map((m: Any) => m.data.waId);
          l.data = { ...l.data, version: l.data.version + 1, etape: 'main', motifMain: 'prix', mainPasseeLe: new Date().toISOString(), traites: vus.slice(-5) };
        };
        await touche(NAFFI_E, choix(NAFFI_E, 'Je confirme'));
        const rdv = [...T('appointments').values()].find((x: Any) => x.id.startsWith('rdv-wa-'));
        vrai('banc : le rendez-vous est au carnet', !!rdv && rdv.data.status === 'confirmé');
        vaut('banc : ... sa ligne de confirmation passe a echec (le modele prend le relais), jamais en cours', 'échec', T('envois').get(`conf-${rdv?.id}-whatsapp`)?.data.statut);
        vrai('banc : ... l equipe est prevenue du rendez-vous pose', pushsDepuis(p0).some((x: Any) => x.title === 'Nouveau rendez-vous par WhatsApp'), pushsDepuis(p0));
        vaut('banc : ... le fil garde la main passee de l autre appel, et connait le rendez-vous', { etape: 'main', rdvId: rdv?.id }, { etape: fil(NAFFI_E)?.etape, rdvId: fil(NAFFI_E)?.rdvId });
        vaut('banc : ... rien de plus ne lui est ecrit par l automate (la main est a l equipe)', n0, ecritsA(NAFFI_E).length);
        /* confirmation-rdv : une ligne « en cours » de plus de dix minutes se retente. */
        const ici = Date.now();
        const rdvC = (id: string, clientId: string) => ({ id, branch_id: 'maison', updated_at: new Date(ici).toISOString(), data: { id, branchId: 'maison', clientId, clientName: '', date: '2026-10-17', time: '09:00', status: 'confirmé', source: 'whatsapp', creeLe: new Date(ici - 15 * 60000).toISOString(), serviceIds: ['sv-klk-ess'] } });
        const ligne = (rdvId: string, ilYA: number) => ({ id: `conf-${rdvId}-whatsapp`, branch_id: 'maison', data: { id: `conf-${rdvId}-whatsapp`, type: 'confirmation', canal: 'whatsapp', apptId: rdvId, statut: 'en cours', quand: new Date(ici - ilYA).toISOString() } });
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] }, {
          clients: [{ id: 'c-vieille', data: { name: 'Vera Vieille', phone: '+229 01 97 20 00 01' } }, { id: 'c-fraiche', data: { name: 'Fifi Fraiche', phone: '+229 01 97 20 00 02' } }],
          rdvs: [rdvC('rdv-wa-vieille', 'c-vieille'), rdvC('rdv-wa-fraiche', 'c-fraiche')],
          envois: [ligne('rdv-wa-vieille', 11 * 60000), ligne('rdv-wa-fraiche', 2 * 60000)],
        });
        const confirmer = await chargeLaFonction('confirmation-rdv');
        await confirmer(new Request('https://banc/functions/v1/confirmation-rdv', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }));
        vaut('banc : confirmation-rdv : le modele part pour la ligne en cours de onze minutes, pas pour celle de deux', ['2290197200001'], graph.filter((g) => g.body.type === 'template').map((g) => g.body.to));
        vaut('banc : ... la vieille ligne passe a envoye, la fraiche reste en cours', ['envoyé', 'en cours'],
          [T('envois').get('conf-rdv-wa-vieille-whatsapp')?.data.statut, T('envois').get('conf-rdv-wa-fraiche-whatsapp')?.data.statut]);
      });
      return ecarts;
    },
    pannes: [
      { nom: 'un tour rejoue apres une pose (la pose se perd)', mute: [P(F_AUTO, '    if (!tient && essai === 0 && !posee) {', '    if (!tient && essai === 0) {')] },
      { nom: 'Meta sans delai', mute: [P(F_AUTO, '      body: JSON.stringify(charge),\n      signal: AbortSignal.timeout(DELAI_DE_META_MS),\n', '      body: JSON.stringify(charge),\n')] },
      { nom: 'une ligne en cours verrouille pour toujours', mute: [P(F_CONF, '      .filter((r) => !enCoursPerime(r.data as { statut?: string; quand?: string } | null, Date.now()))\n', '')] },
      { nom: 'le rendez-vous pose ne rejoint pas le fil', mute: [P(F_AUTO, '      if (!tient) await rattacheLaPose(sb, o.numero, posee, branchId);\n', '')] },
    ],
  },

  /* ══ R27 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R27', nom: 'R27 le plafond n avale jamais Je confirme : au dixieme message, le toucher du recapitulatif pose et confirme',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const p = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(p, t0 + 2000, { touche: 'KLƆKLƆ™ Essentiel' });
      elle(p, t0 + 3000, { touche: 'Un autre jour' });
      elle(p, t0 + 4000, { touche: 'Mardi 13 oct. 2026' });
      elle(p, t0 + 5000, { touche: 'Un autre jour' });
      elle(p, t0 + 6000, { touche: 'Mercredi 14 oct. 2026' });
      elle(p, t0 + 7000, { touche: 'Mer. 14 oct. 2026 · 9 h' });
      elle(p, t0 + 8000, { touche: 'Madame' });
      const recap = elle(p, t0 + 9000, { texte: 'Awa' });
      vaut('le recapitulatif est son dixieme message', [10, 'recap'], [p.envoyes.length, recap.messages[0]?.etape]);
      const oui = elle(p, t0 + 10000, { touche: 'Je confirme' });
      vrai('Je confirme pose et confirme quand meme', p.poses.length === 1 && oui.messages[0]?.etape === 'confirme' && corps(oui).startsWith("C'est confirmé, Madame Awa"), corps(oui));
      const q = parcours(ORIGINAL, NUM_INCONNUE, []);
      for (const [i, x] of [[0, { texte: 'Bonjour, je voudrais prendre rendez-vous' }], [1, { touche: 'Entretenir mes locks' }], [2, { touche: 'KLƆKLƆ™ Essentiel' }],
        [3, { touche: 'Un autre jour' }], [4, { touche: 'Mardi 13 oct. 2026' }], [5, { touche: 'Un autre jour' }], [6, { touche: 'Mercredi 14 oct. 2026' }],
        [7, { touche: 'Mer. 14 oct. 2026 · 9 h' }], [8, { touche: 'Madame' }], [9, { texte: 'Awa' }]] as const) elle(q, t0 + i * 1000, x);
      const autre = elle(q, t0 + 10000, { touche: 'Une autre heure' });
      vrai('... un autre toucher, lui, reste sous le plafond : la main passe sans un mot', autre.pris && autre.messages.length === 0 && q.etat?.motifMain === 'plafond' && q.poses.length === 0);
      return ecarts;
    },
    pannes: [
      { nom: 'le plafond avale Je confirme (le tour)', mute: [P(AUTO, "    if (base.envois.length >= PLAFOND_DE_L_AUTOMATE && !confirme) return laMain('plafond', false);", "    if (base.envois.length >= PLAFOND_DE_L_AUTOMATE) return laMain('plafond', false);")] },
      { nom: 'le plafond avale Je confirme (la porte)', mute: [P(AUTO, '  if (envois >= PLAFOND_DE_L_AUTOMATE && !confirmeValide(etat, tour, courante))', '  if (envois >= PLAFOND_DE_L_AUTOMATE)')] },
    ],
  },

  /* ══ R28 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R28', nom: 'R28 les mots ne tournent pas en rond : pas samedi ecarte samedi, les memes mots deux fois sont un ecart',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '11:00');
      const lu = (x: string) => { const m = motsReconnus(x, t0); return [m.jourVoulu ?? '', m.jourEvite ?? '', m.moment ?? '']; };
      vaut('la negation se lit, avant et apres le mot ; la ponctuation l arrete',
        [['', 'samedi', ''], ['', 'samedi', ''], ['', 'samedi', ''], ['samedi', '', ''], ['samedi', '', 'apres-midi'], ['mardi', 'samedi', ''], ['samedi', '', '']],
        ['Je ne peux pas samedi', 'samedi je ne peux pas', 'non pas samedi svp', 'Pas de souci, samedi', 'je peux passer samedi, pas le matin', 'pas samedi, plutot mardi', 'Je voudrais passer samedi'].map(lu));
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
      const s2 = elle(p, t0 + 1000, { touche: 'La même chose' });
      vrai('les places commencent par samedi', (lignesDe(s2)[0] ?? '').startsWith('Sam.'), lignesDe(s2).join(' | '));
      const s3 = elle(p, t0 + 2000, { texte: 'Je ne peux pas samedi' });
      vrai('« Je ne peux pas samedi » : plus aucun samedi dans la liste', s3.messages[0]?.etape === 'places' && !lignesDe(s3).some((x) => x.startsWith('Sam.')) && lignesDe(s3).some((x) => x.startsWith('Mar.')), lignesDe(s3).join(' | '));
      const s4 = elle(p, t0 + 3000, { texte: 'non pas samedi svp' });
      vrai('les memes mots encore : un ecart (la relance)', corps(s4) === "Touchez l'un des choix ci-dessous, Madame Naffi, ou Parler à la Maison." && p.etat?.ecarts === 1, corps(s4));
      elle(p, t0 + 4000, { texte: 'je ne peux pas samedi' });
      vaut('... et la troisieme fois, la main passe (deux ecarts), bien avant le plafond', ['main', 'ecarts', true], [p.etat?.etape, p.etat?.motifMain, p.envoyes.length < 10]);
      const r = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(r, t0, { texte: 'Je voudrais un rendez-vous' });
      const r2 = elle(r, t0 + 1000, { texte: 'samedi' });
      const r3 = elle(r, t0 + 2000, { texte: 'samedi' });
      vrai('« samedi » repete a La meme chose : retenu une fois, puis un ecart', r2.messages[0]?.etape === 'meme' && corps(r2).startsWith('Votre dernière venue') && corps(r3).startsWith("Touchez l'un des choix"), `${corps(r2)} / ${corps(r3)}`);
      return ecarts;
    },
    pannes: [
      { nom: 'la negation ne se lit plus', mute: [P(AUTO, '    if (nieLeMotWa(t, debut, debut + j[0].length)) jourEvite = jourEvite ?? v;', '    if (false) jourEvite = jourEvite ?? v;')] },
      { nom: 'les memes mots ne sont jamais un ecart', mute: [P(AUTO, "      if ([jourVoulu, moment, jourEvite].join('|') === avant) return false;\n", '')] },
      { nom: 'le jour ecarte revient dans la liste', mute: [P(AUTO, '    const offertes = horsEvite.length > 0 ? horsEvite : toutes;', '    const offertes = toutes;')] },
    ],
  },

  /* ══ R29 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R29', nom: 'R29 la civilite et le prenom ecrits se lisent : Madame, Mme Grace, M. Koffi, je m appelle Grace',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      vaut('civiliteLue : les formes et le prenom qui suit', [
        { civilite: 'madame' }, { civilite: 'madame', prenom: 'Grace' }, { civilite: 'mademoiselle', prenom: 'Awa' }, { civilite: 'monsieur', prenom: 'Koffi' },
        { civilite: 'monsieur', prenom: 'Koffi' }, null, null,
      ], ['Madame', 'Mme Grace', 'mlle awa', 'M. Koffi', 'Monsieur Koffi.', 'Grace', 'Mardi'].map((x) => civiliteLue(x)));
      vaut('prenomLu : « je m appelle » sans apostrophe, et jamais une civilite pour un prenom', ['Grace', 'Grace', null], [prenomLu('Je m appelle Grace'), prenomLu("je m'appelle grace"), prenomLu('Mme Grace')]);
      const jusquALaCivilite = (texte: string) => {
        const p = parcours(ORIGINAL, NUM_INCONNUE, []);
        const t0 = cotonou('2026-10-09', '10:12');
        elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
        elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
        elle(p, t0 + 2000, { touche: 'KLƆKLƆ™ Essentiel' });
        elle(p, t0 + 3000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
        return { p, s: elle(p, t0 + 4000, { texte }), t0 };
      };
      const a = jusquALaCivilite('Madame');
      vaut('« Madame » ecrit a la civilite : et votre prenom, Madame', 'Et votre prénom, Madame ?', corps(a.s));
      const a2 = elle(a.p, a.t0 + 5000, { texte: 'Je m appelle Grace' });
      vrai('... « Je m appelle Grace » : le recapitulatif de Madame Grace', a2.messages[0]?.etape === 'recap' && corps(a2).startsWith('Voici votre rendez-vous, Madame Grace'), corps(a2));
      const b = jusquALaCivilite('Mme Grace');
      vrai('« Mme Grace » ecrit a la civilite : directement le recapitulatif', b.s.messages[0]?.etape === 'recap' && corps(b.s).startsWith('Voici votre rendez-vous, Madame Grace'), corps(b.s));
      const c = jusquALaCivilite('M. Koffi');
      vrai('« M. Koffi » : Monsieur Koffi', corps(c.s).startsWith('Voici votre rendez-vous, Monsieur Koffi'), corps(c.s));
      const d = jusquALaCivilite('euh');
      vrai('un texte qui n est pas une civilite reste un ecart', corps(d.s) === "Touchez l'un des choix ci-dessous, Madame, ou Parler à la Maison." && d.p.etat?.ecarts === 1, corps(d.s));
      return ecarts;
    },
    pannes: [
      { nom: 'la civilite ecrite ne se lit pas', mute: [P(AUTO, 'function civiliteLue(brut: string): { civilite: CiviliteDuFil; prenom?: string } | null {\n', 'function civiliteLue(brut: string): { civilite: CiviliteDuFil; prenom?: string } | null {\n  if (brut) return null;\n')] },
      { nom: 'je m appelle sans apostrophe ne se lit pas', mute: [P(AUTO, "je m(?:'|’|\\s)?appelle", "je m'?appelle")] },
    ],
  },

  /* ══ R30 · relecture du 9 octobre 2026 ═══════════════════════════════ */
  {
    id: 'R30', nom: 'R30 le rattachement : le second numero d une fiche ne la capte pas ; sur WhatsApp, la fiche du numero ne capte que son prenom',
    eprouve: () => {
      const { ecarts, vaut } = juge();
      const demande = (o: Partial<Demande>): Demande => ({ id: 'd1', genre: 'rdv', createdAt: '2026-10-09T09:00:00.000Z', branchId: 'b1', prenom: 'Kemi', telephone: '+2290197000000',
        besoin: 'entretien', source: 'site', consentementLe: '2026-10-09T09:00:00.000Z', statut: 'nouvelle', apptId: 'rdv-1', ...o } as Demande);
      const rdv = [{ id: 'rdv-1', status: 'confirmé', clientId: '' }];
      const fiche = (r: ReturnType<typeof rattachementsAFaire>) => r[0]?.ficheExistante?.id ?? null;
      vaut('le site : une fiche qui ne porte ce numero qu en second (sa soeur) ne capte rien ; en premier, oui', [null, 'c-kemi'], [
        fiche(rattachementsAFaire(rdv, [demande({})], [{ id: 'c-awa', name: 'Awa Sossa', phone: '+2290196000000', phone2: '0197000000' }])),
        fiche(rattachementsAFaire(rdv, [demande({})], [{ id: 'c-kemi', name: 'Kemi Sossa', phone: '0197000000' }])),
      ]);
      vaut('WhatsApp : la maman qui reserve pour elle ne devient pas sa fille ; son prenom sur la fiche, oui', [null, 'c-grace'], [
        fiche(rattachementsAFaire(rdv, [demande({ source: 'whatsapp', prenom: 'Grâce' })], [{ id: 'c-kemi', name: 'Kemi Morou', phone: '0197000000' }])),
        fiche(rattachementsAFaire(rdv, [demande({ source: 'whatsapp', prenom: 'Grâce' })], [{ id: 'c-grace', name: 'Grace Morou', phone: '+229 01 97 00 00 00' }])),
      ]);
      return ecarts;
    },
    pannes: [
      { nom: 'le second numero capte encore', mute: [P('src/shared/demandes.ts', "      ? clients.find((c) => !c.archived && telephoneNormalise(c.phone ?? '') === numero\n", "      ? clients.find((c) => !c.archived && (telephoneNormalise(c.phone ?? '') === numero || telephoneNormalise(c.phone2 ?? '') === numero)\n")] },
      { nom: 'sur WhatsApp, le numero suffit (sans le prenom)', mute: [P('src/shared/demandes.ts', "        && (demande.source !== 'whatsapp' || memePrenom(c.name, demande.prenom)))", '        )')] },
    ],
  },
];

/* ── Le passage ─────────────────────────────────────────────────────── */
if (process.env.AUTOMATE_WA_LISTE) {
  vraiLog(JSON.stringify(regles.map((r) => ({ id: r.id, nom: r.nom, pannes: r.pannes }))));
  process.exit(0);
}
const seule = process.env.AUTOMATE_WA_REGLE;
let ko = 0;
try {
  for (const r of regles) {
    if (seule && r.id !== seule) continue;
    let ecarts: string[];
    try { ecarts = await r.eprouve(); } catch (e) { ecarts = [`plante : ${String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' / ')}`]; }
    if (ecarts.length) {
      ko += 1;
      vraiLog(`RATE  ${r.nom}`);
      for (const x of ecarts.slice(0, 8)) vraiLog(`      - ${ascii(x).slice(0, 400)}`);
    } else vraiLog(`OK    ${r.nom}`);
  }
} finally {
  if (dossierDuBanc) rmSync(dossierDuBanc, { recursive: true, force: true });
}
vraiLog(ko === 0 ? '\nLa Maison repond et reserve, comme promis.' : `\n${ko} RATE.`);
process.exit(ko ? 1 : 0);
