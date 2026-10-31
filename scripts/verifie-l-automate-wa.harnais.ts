import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  DEVISE, PIED, REGLAGE_LIVRE, etapeSuivante, suiteDeLaPose, tourDeLaCliente, respecteMeta, texteSain, repriseDuFil,
  reglageDeLAutomate, cleWa, sansAppelVide, lienMapsWa, titreEnFrancaisWa, dureeDiteWa, envoisQuiComptent, numeroServi, tenuParLAutomate, silenceDeLAlarme, titreDePlace, chargeGraph, cleCourte,
  intentionDeReserver, jourDitAvecAnnee, quiParle, motsReconnus, civiliteLue, prenomLu, renvoieAUnRdv, uneQuestionAutre,
  conseilDeLaMaison, fautesDeLaReponse, texteDeLaReponse, type ConseilDeLaMaison,
  jugeLaParole, reglageDeLaReception, laReceptionPeutParler, reponseDeLaReception, tourPourLeParcours, prefaceDeLaReception, secoursDeLaReception,
  demandeLeCheminWa, prestationsDitesWa, estUnMerci, unMerciSansSuite,
  type AgendaDuTour, type ContexteDuTour, type EtatDuFil, type FicheDuNumero, type MessageSortant,
  type PrestationDuTour, type ReglageDeLAutomate, type SortieDuTour, type MainDuFil, type VerdictDeLaPose,
  type TiroirDuNumero, type EcritureDuTour,
} from '../src/shared/automate-wa';
import {
  filsDeLaMaison, messagesQuiSonnent, automatesDesFils, numerosTenus, filsAutomateStore, poseLaMain,
  rendsALAutomate, filsSansReponse, sonnentApresLAutomate, type MessageWa, type TeteConnue, type LigneDesFilsAutomate,
} from '../src/shared/conversations';
import { rattachementsAFaire, type Demande } from '../src/shared/demandes';
import { BROUILLONS_DU_CONSEIL, TEXTES_PROPOSES, correctionProposee, modifieLaReponse, valideLaReponse, valideLesReponses } from '../src/shared/conseil-wa';
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
/* Le composeur du fil (la saisie, la main, le bandeau de l'automate) a quitté
   Conversations.tsx pour ComposeurWhatsApp.tsx le 27 octobre 2026 (lot 3,
   Assistant Maison) : les promesses qui le lisent le suivent, mêmes mots. */
const ECRAN_COMPOSEUR = 'src/apps/trone/routes/clients/ComposeurWhatsApp.tsx';
/* L'hôte du composeur dans l'Assistant Maison (la vue « Les conversations ») :
   « Continuer dans WhatsApp » y vit, et pose la main par la poignée du composeur. */
const ECRAN_LES_CONVERSATIONS = 'src/apps/trone/routes/clients/LesConversations.tsx';
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
  { id: 'dandan-ess', name: 'DÀNDÀN™ Essentiel', categoryId: 'plt-10', durationMin: 30, reservable: true },
  { id: 'klk-int', name: 'KLƆKLƆ™ Intégral', categoryId: 'plt-05', durationMin: 60, reservable: true },
  /* Les formes réelles du catalogue (revue du 13 octobre 2026). */
  { id: 'dandan-soin', name: 'DÀNDÀN™ · Le Soin Hydratant', categoryId: 'plt-10', durationMin: 30, reservable: true },
  { id: 'klk-souffle', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Court', categoryId: 'plt-05', durationMin: 45, reservable: true },
  { id: 'sinsin-reprise', name: 'SÍNSIN™ Essentiel · La Reprise · Court', categoryId: 'atl-ii-gbeji', durationMin: 60, reservable: true },
  /* Les soins du cheveu (13 octobre 2026), avec une version Kids et une « avec votre produit » que la liste écarte. */
  { id: 'vivivo', name: 'VÍVÍVÓ™ · Le Vivifiant', categoryId: 'plt-30', durationMin: 30, reservable: true },
  { id: 'wewe', name: 'WÈWÈ™ · La Purification', categoryId: 'plt-20', durationMin: 30, reservable: true },
  { id: 'wewe-produit', name: 'WÈWÈ™ avec votre produit · masque apporté', categoryId: 'plt-20', durationMin: 30, reservable: true },
  { id: 'gbigbi', name: 'GBÌGBÌ™ · Le Renfort', categoryId: 'plt-40', durationMin: 45, reservable: true },
  { id: 'gbigbi-kids', name: 'GBÌGBÌ™ Kids · Le Renfort', categoryId: 'plt-40', durationMin: 30, reservable: true },
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
  premier: boolean; n: number; prises: Set<string>; itineraire: string; carte?: string; agenda: Partial<AgendaDuTour>; journal: string[];
  /** Le conseil (14 octobre 2026) : les réponses, les prix du jour, la dernière parole de la Maison. */
  conseil?: ConseilDeLaMaison; prix?: Record<string, number>; parole?: string;
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
  maison: { nom: 'Maison MND', itineraire: p.itineraire, ...(p.carte !== undefined ? { carte: p.carte } : {}) },
  agenda: agendaDe(p, ms),
  ...(p.conseil ? { conseil: p.conseil } : {}),
  ...(p.prix ? { prix: p.prix } : {}),
  ...(p.parole ? { derniereParoleDeLaMaison: p.parole } : {}),
});

/* LE CONSEIL DU BANC (14 octobre 2026) : trois réponses validées, et trois
   qui ne doivent jamais partir (un brouillon, un prix tapé, un prix parti). */
const CONSEIL_DU_BANC = {
  reponses: [
    { id: 'r-prix-creation', titre: 'Prix d’une création', mots: ['prix', 'combien', 'tarif', 'création', 'microlocks', 'devis'], texte: 'Une création se chiffre après la consultation Origine ({prix:sv-koko-ori}). À titre de repère, une création commence à {prix:vekpe-crea}.', etat: 'validee', mene: 'creation', ordre: 1 },
    { id: 'r-prix-entretien', titre: 'Prix d’un entretien', mots: ['resserrage', 'entretien', 'racines', 'combien', 'prix'], texte: 'Le resserrage est à {prix:sinsin-ess} pour un Medium.', etat: 'validee', mene: 'entretien', ordre: 2 },
    { id: 'r-duree', titre: 'Durée d’une création', mots: ['combien de temps', 'durée'], texte: 'Quelques heures ou deux jours, selon la méthode.', etat: 'validee', ordre: 3 },
    { id: 'r-brouillon', titre: 'Les extensions', mots: ['extension'], texte: 'Oui, nous posons des extensions.', etat: 'brouillon', ordre: 4 },
    { id: 'r-prix-main', titre: 'Un prix tapé', mots: ['tresses'], texte: 'Les tresses sont à 20 000 F.', etat: 'validee', ordre: 5 },
    { id: 'r-introuvable', titre: 'Une prestation partie', mots: ['coloration'], texte: 'La coloration est à {prix:retiree}.', etat: 'validee', ordre: 6 },
  ],
};
const PRIX_DU_BANC: Record<string, number> = { 'sv-koko-ori': 15000, 'vekpe-crea': 80000, 'sinsin-ess': 25000 };
const avecConseil = (p: Parcours, brut: unknown = CONSEIL_DU_BANC): Parcours => {
  p.conseil = conseilDeLaMaison(brut);
  p.prix = PRIX_DU_BANC;
  return p;
};

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
  const s3 = elle(p, t0 + 60000, { touche: 'Lavage · Essentiel' });
  const s3b = elle(p, t0 + 75000, { touche: "Non, c'est tout" });
  const s4 = elle(p, t0 + 90000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
  const s5 = elle(p, t0 + 100000, { touche: 'Mademoiselle' });
  const s6 = elle(p, t0 + 110000, { texte: 'awa' });
  const s7 = elle(p, t0 + 120000, { touche: 'Je confirme' });
  return { p, t0, s1, s2, s3, s3b, s4, s5, s6, s7 };
}
/* Trois soins le même jour (13 octobre 2026) : Lavage, puis Resserrage,
   puis Hydratation ; le troisième ferme le panier. Dix messages pile. */
function scnTroisSoins(m: Moteur) {
  const p = parcours(m, NUM_INCONNUE, []);
  p.agenda = { formules: [{ serviceIds: ['plt-05'] }, { serviceIds: ['sinsin-ess'] }, { serviceIds: ['dandan-ess'] }, { serviceIds: ['klk-int'] }, { serviceIds: ['plt-05', 'sinsin-ess'] }] };
  const t0 = cotonou('2026-10-09', '10:12');
  elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
  const s2 = elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
  const s3 = elle(p, t0 + 2000, { touche: 'Lavage · Essentiel' });
  const s4 = elle(p, t0 + 3000, { touche: 'Ajouter un soin' });
  const s5 = elle(p, t0 + 4000, { touche: 'Racines · Essentiel' });
  const s6 = elle(p, t0 + 5000, { touche: 'Ajouter un soin' });
  const s7 = elle(p, t0 + 6000, { touche: 'Hydratation · Essentiel' });
  const s8 = elle(p, t0 + 7000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
  const s9 = elle(p, t0 + 8000, { touche: 'Madame' });
  const recap = elle(p, t0 + 9000, { texte: 'Afi' });
  const oui = elle(p, t0 + 10000, { touche: 'Je confirme' });
  return { p, s2, s3, s4, s5, s6, s7, s8, s9, recap, oui };
}
/* Les vrais noms du catalogue : un nom à sous-titre, une formule longue. */
function scnVraisNoms(m: Moteur) {
  const p = parcours(m, NUM_INCONNUE, []);
  p.agenda = { formules: [{ serviceIds: ['klk-souffle', 'sinsin-reprise'] }, { serviceIds: ['dandan-soin'] }, { serviceIds: ['klk-souffle'] }] };
  const t0 = cotonou('2026-10-09', '10:12');
  elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
  const liste = elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
  /* Les soins vivent sous « Un soin » depuis la liste en rubriques (30 octobre 2026). */
  elle(p, t0 + 1500, { touche: 'Un soin' });
  elle(p, t0 + 2000, { touche: 'Hydratation' });
  const mercredi = elle(p, t0 + 3000, { texte: 'Non merci, plutôt mercredi' });
  elle(p, t0 + 4000, { touche: 'Mer. 14 oct. 2026 · 9 h' });
  elle(p, t0 + 5000, { touche: 'Madame' });
  const recap = elle(p, t0 + 6000, { texte: 'Afi' });
  elle(p, t0 + 7000, { touche: 'Je confirme' });
  return { p, liste, mercredi, recap };
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
  elle(p, t0 + 30000, { touche: 'Lavage · Essentiel' });
  elle(p, t0 + 35000, { touche: "Non, c'est tout" });
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
  elle(q, t0 + 20000, { touche: 'Consultation · Origine' });
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
    scnPlafond(m).p, scnVieuxToucher(m).o, scnOuiTape(m).p, scnDiaspora(m).p, scnTroisSoins(m).p, scnVraisNoms(m).p,
  ];
}

/* ── Les juges des textes de la Maison ──────────────────────────────── */
const MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\\.|févr\\.|avr\\.|juil\\.|sept\\.|oct\\.|nov\\.|déc\\.';
const DATE_SANS_ANNEE = new RegExp(`\\b(\\d{1,2}|1er) (${MOIS})(?! \\d{4})`, 'i');
/* « 17/10 » sans son année ; jamais le « 01/20 » du milieu de « 30/01/2027 »
   (relecture du 9 octobre 2026 : le juge criait sur les titres de fin janvier). */
const DATE_CHIFFRES_SANS_ANNEE = /(?<![\d/])\d{2}\/\d{2}(?!\/\d{4})/;
const TRACE_D_APPEL_VIDE = / ,|,[ \t]*[?!:;.]|,[ \t]*,/;
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
    /* JAMAIS MADAME SUPPOSÉ (13 octobre 2026) : un message peut ne nommer
       personne (une inconnue avant sa civilité) ; il ne garde alors aucune
       trace de l'appel absent. */
    if (TRACE_D_APPEL_VIDE.test(m.corps)) fautes.push(`trace d un appel vide : « ${m.corps} »`);
    const devise = m.corps.includes(DEVISE);
    /* Le plan et le lien qui suivent la confirmation (29 octobre 2026) ne la
       signent pas : la devise est sur la confirmation, une fois. */
    if (devise !== (m.etape === 'confirme' && !m.accessoire)) fautes.push(`devise ${devise ? 'hors de' : 'absente de'} la confirmation : « ${m.corps} »`);
    if (m.forme !== 'texte' && m.forme !== 'image' && m.pied !== PIED) fautes.push('pied absent');
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
/* La clé pour comparer, comme `cle_du_numero_wa` (0128). */
const cleWaF = (brut: unknown): string => { const d = numeroWaF(brut); return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d; };
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
  tete_du_numero: ({ n }) => B().tetes[numeroWaF(n)] ?? B().tetes[cleWaF(n)] ?? { tiroir: 'clientes' },
  tiroir_du_numero: ({ n }) => (B().tetes[numeroWaF(n)] ?? B().tetes[cleWaF(n)] ?? { tiroir: 'clientes' }).tiroir,
  is_staff: (_a, client) => /^Bearer staff/.test(client.auth ?? ''),
  est_direction: (_a, client) => /^Bearer staff-direction/.test(client.auth ?? ''),
  fiches_du_numero: ({ n }) => {
    const num = cleWaF(n);
    if (num.length < 8) return [];
    const vivants = [...table('clients').values()].filter((c) => String(c.data?.archived ?? '') !== 'true');
    const trouvees = vivants.filter((c) => cleWaF(c.data?.phone) === num || cleWaF(c.data?.phone2) === num)
      .map((c) => ({ c, parPhone: cleWaF(c.data?.phone) === num, parFamille: false }));
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
      branches: indexe([{ id: 'maison', data: { flagship: true, status: 'active', masters: MAITRES, seats: 2, mapsUrl: 'https://maps.app.goo.gl/AbCdEf12345?g_st=ac' } }]),
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
      clients: indexe(plus.clients ?? [{ id: 'cli-naffi', data: { name: 'Naffi Morou', civilite: 'madame', phone: '+229 01 97 00 00 01', branchId: 'maison' } }]),
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
    if (TRACE_D_APPEL_VIDE.test(corpsDe(b))) fautes.push(`trace d un appel vide : ${corpsDe(b).slice(0, 60)}`);
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
        && corps(a.s1).startsWith('Bonsoir Mme Naffi, merci de votre message. Votre dernière venue : Lavage rituel (KLƆKLƆ™ Essentiel) et Reprise des racines (SÍNSIN™ Essentiel), le samedi 12 septembre 2026.'), corps(a.s1));
      vaut('A1 ... ses trois boutons', ['La même chose', 'Autre chose', 'Parler à la Maison'], boutonsDe(a.s1));
      vrai('A2 les places : le samedi voulu d abord, deux par jour, l annee dans le titre', a.s2.messages[0]?.etape === 'places'
        && lignesDe(a.s2)[0] === 'Sam. 10 oct. 2026 · 9 h' && lignesDe(a.s2)[1] === 'Sam. 10 oct. 2026 · 14 h' && (lignesDe(a.s2)[2] ?? '').startsWith('Sam. 17 oct. 2026'), lignesDe(a.s2).join(' | '));
      vrai('A2 ... sept places au plus, puis Un autre jour et Parler a la Maison', lignesDe(a.s2).length <= 9 && lignesDe(a.s2).at(-2) === 'Un autre jour' && lignesDe(a.s2).at(-1) === 'Parler à la Maison');
      vaut('A3 le recapitulatif', 'Voici votre rendez-vous, Mme Naffi : Lavage rituel (KLƆKLƆ™ Essentiel) et Reprise des racines (SÍNSIN™ Essentiel), samedi 10 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(a.s3));
      vaut('A3 ... Je confirme, Une autre heure, Parler a la Maison', ['Je confirme', 'Une autre heure', 'Parler à la Maison'], boutonsDe(a.s3));
      vrai('A4 c est confirme, avec la devise', a.s4.messages[0]?.etape === 'confirme'
        && corps(a.s4).startsWith("C'est confirmé, Mme Naffi : votre rendez-vous est retenu le samedi 10 octobre 2026 à 9 h. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.")
        && corps(a.s4).endsWith(DEVISE), corps(a.s4));
      vaut('A4 l alerte au personnel : le prenom seul, la date avec l annee', { titre: 'Nouveau rendez-vous par WhatsApp', corps: 'Naffi, samedi 10 octobre 2026 à 9 h' },
        { titre: a.s4.alerte?.titre, corps: a.s4.alerte?.corps });
      vaut('A  quatre messages de la Maison pour toute la reservation, et le plan qui suit la confirmation', 5, a.avantMerci);
      vaut('A  une pose, sur sa fiche, confirmee, source whatsapp, sa duree, sans demande', { n: 1, clientId: 'c-naffi', status: 'confirmé', source: 'whatsapp', dureeMin: 105, date: '2026-10-10', time: '09:00', demande: false },
        { n: a.p.poses.length, clientId: a.p.poses[0]?.rdv.clientId, status: a.p.poses[0]?.rdv.status, source: a.p.poses[0]?.rdv.source, dureeMin: a.p.poses[0]?.rdv.dureeMin, date: a.p.poses[0]?.rdv.date, time: a.p.poses[0]?.rdv.time, demande: !!a.p.poses[0]?.demande });
      vrai('A  jamais le maitre : la Maison attribue (aucun champ master)', !a.p.poses.some((x) => 'master' in x.rdv));
      const b = scnInconnue(ORIGINAL);
      vaut('B1 bienvenue, comment prendre soin de votre couronne', 'Bonjour, bienvenue à la Maison MND. Comment pouvons-nous prendre soin de votre couronne ?', corps(b.s1));
      vaut('B1 ... les quatre besoins et la Maison', ['Entretenir mes locks', 'Créer mes locks', 'Réparer mes locks', 'Pour mon enfant', 'Parler à la Maison'], lignesDe(b.s1));
      vaut('B2 quel entretien : la liste en rubriques (30 octobre 2026), la venue, chaque lavage, chaque reprise, un soin, la Maison', ['Entretien · Essentiel', 'Lavage · Essentiel', 'Lavage · Le Souffle', 'Lavage · Intégral', 'Racines · Essentiel', 'Racines · La Reprise', 'Un soin', 'Parler à la Maison'], lignesDe(b.s2));
      vaut('B2 ... ses rubriques, dans l ordre', ['Lavage et racines', 'Lavage seul', 'Lavage seul', 'Lavage seul', 'Racines seules', 'Racines seules', 'Autre chose', 'Autre chose'], (b.s2.messages[0]?.lignes ?? []).map((l) => l.section));
      vrai('B3 un rituel choisi : un autre soin le meme jour ?', b.s3.messages[0]?.etape === 'encore' && boutonsDe(b.s3).join(' | ') === "Ajouter un soin | Non, c'est tout | Parler à la Maison", `${corps(b.s3)} ${boutonsDe(b.s3).join(' | ')}`);
      vrai('B4 la civilite, en liste', b.s4.messages[0]?.etape === 'civilite' && b.s4.messages[0]?.forme === 'liste'
        && corps(b.s4) === 'Pour inscrire votre rendez-vous, comment devons-nous vous appeler ?', corps(b.s4));
      vaut('B5 et votre prenom, Mademoiselle, a ecrire en message', 'Et votre prénom, Mademoiselle ? Écrivez-le simplement dans un message, en réponse.', corps(b.s5));
      vaut('B6 le recapitulatif dit Mlle Awa', 'Voici votre rendez-vous, Mlle Awa : Lavage rituel (KLƆKLƆ™ Essentiel), mardi 13 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(b.s6));
      vrai('B7 c est confirme, Mlle Awa', corps(b.s7).startsWith("C'est confirmé, Mlle Awa : votre rendez-vous est retenu le mardi 13 octobre 2026 à 9 h."), corps(b.s7));
      vaut('B  huit messages de la Maison, et le plan qui suit la confirmation', 9, b.p.envoyes.length);
      const d = b.p.poses[0]?.demande;
      vaut('B  la demande : whatsapp, rdv, sa civilite, son prenom, +229, le consentement a l heure du Je confirme, sans fiche',
        { source: 'whatsapp', genre: 'rdv', civilite: 'mademoiselle', prenom: 'Awa', telephone: `+${NUM_INCONNUE}`, consentementLe: isoDe(b.t0 + 120000), besoin: 'entretien', clientId: '', clientName: 'Awa', apptId: b.p.poses[0]?.rdv.id },
        { source: d?.source, genre: d?.genre, civilite: d?.civilite, prenom: d?.prenom, telephone: d?.telephone, consentementLe: d?.consentementLe, besoin: d?.besoin, clientId: b.p.poses[0]?.rdv.clientId, clientName: b.p.poses[0]?.rdv.clientName, apptId: d?.apptId });
      return ecarts;
    },
    pannes: [
      { nom: 'une connue repasse par le besoin (plus de La meme chose)', mute: [P(AUTO, '    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, salue);', '    if (fiches.length === 1 && titulaire) return dire(msgBesoin(false, salue));')] },
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
        && corps(o.s1) === "Touchez l'un des choix ci-dessous, Mme Naffi, ou Parler à la Maison.", corps(o.s1));
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
      const cleB = cleCourte(`wamid.${NUM_INCONNUE}.8`);
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
      vaut('prise avant le Je confirme : les places les plus proches', "Cette heure vient d'être prise, Mme Naffi. Voici les places les plus proches.", corps(c.s4));
      vrai('... rien n est pose, et l heure prise n est plus proposee', c.posesApresPrise === 0 && c.s4.ecritures.length === 0 && !lignesDe(c.s4).includes('Sam. 10 oct. 2026 · 9 h') && lignesDe(c.s4)[0] === 'Sam. 10 oct. 2026 · 10 h', lignesDe(c.s4).join(' | '));
      vaut('refusee par le verrou : les places les plus proches', "Cette heure vient d'être prise, Mme Naffi. Voici les places les plus proches.", corps(c.s6));
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
      vaut('une premiere couronne : le KOKO Origine et ses places', 'Une première couronne commence toujours par une consultation : la consultation Origine (KÒKÒ™ Origine). Nous y étudions votre texture et votre cuir chevelu, et choisissons ensemble votre calibre. Voici les prochaines places.', corps(e.s2));
      vrai('elle insiste : la creation se decide apres la consultation', corps(e.s3) === 'La création se décide après la consultation. Une personne de la Maison peut vous en dire plus.'
        && j(boutonsDe(e.s3)) === j(['Voir les places', 'Parler à la Maison']), corps(e.s3));
      vaut('la pose ne porte que la consultation', [['sv-koko-ori'], 'creation'], [e.p.poses[0]?.rdv.serviceIds, e.p.poses[0]?.demande?.besoin]);
      const f = scnEnfant(ORIGINAL);
      vaut('pour un enfant : la consultation MND Kids, Conseil et diagnostic', 'Pour un enfant, tout commence par un échange avec ses parents : le Conseil et diagnostic. Voici les prochaines places.', corps(f.s2));
      vaut('... et c est elle qui se pose', [['svc-doto-conseil'], 'enfant'], [f.p.poses[0]?.rdv.serviceIds, f.p.poses[0]?.demande?.besoin]);
      const r = scnPorte(ORIGINAL);
      vaut('des formules qui nomment creation, restauration ou devis ne sont jamais proposees', ['Lavage · Essentiel', 'Lavage · Le Souffle', 'Lavage · Intégral', 'Racines · Essentiel', 'Racines · La Reprise', 'Un soin', 'Parler à la Maison'], lignesDe(r.s2));
      vrai('une consultation renommee : toutes les consultations, jamais la creation', corps(r.s3) === 'Quelle consultation souhaitez-vous ?'
        && j(lignesDe(r.s3)) === j(['Consultation · Origine', 'Consultation · Suivi', 'Conseil et diagnostic', 'Parler à la Maison']), `${corps(r.s3)} ${lignesDe(r.s3).join(' | ')}`);
      vaut('... et la pose est la consultation choisie', ['sv-koko-ori'], r.q.poses[0]?.rdv.serviceIds);
      vrai('une derniere venue de creation : jamais La meme chose', r.s4.messages[0]?.etape === 'besoin', corps(r.s4));
      const toutes = tousLesParcours(ORIGINAL).flatMap((p) => p.poses);
      vaut('dans tous les parcours, aucune creation, restauration ni devis pose', [], toutes.flatMap((x) => x.rdv.serviceIds).filter((id) => ['vekpe-crea', 'finfin', 'sur-devis'].includes(id)));
      const an = scnAnnulations(ORIGINAL);
      vrai('le jour meme : la main passe, dite, rien n est pose', corps(an.s1) === "Pour aujourd'hui, une personne de la Maison vous répond ici, Mme Naffi." && an.jm.etat?.motifMain === 'jour-meme' && an.jm.poses.length === 0, corps(an.s1));
      return ecarts;
    },
    pannes: [
      { nom: 'une creation devient reservable', mute: [P(AUTO, "    !!s && s.reservable && (estUneConsultation(s, cats) || (!exigeConsultation(s, cats) && priceModeOf(s) !== 'devis'));", '    !!s && s.reservable;')] },
      { nom: 'creer passe par les rituels, sans consultation', mute: [P(AUTO, "    if (b === 'entretien') return dire(msgEntretien(false) ?? msgRituel(false, formulesOffertes()), 'autre-soin');", "    if (b === 'entretien' || b === 'creation') return dire(msgEntretien(false) ?? msgRituel(false, formulesOffertes()), 'autre-soin');")] },
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
      vrai('premier ecart : la relance, la meme etape', d.s2.messages[0]?.etape === 'meme' && corps(d.s2) === "Touchez l'un des choix ci-dessous, Mme Naffi, ou Parler à la Maison." && d.ecarts1 === 1, corps(d.s2));
      vaut('second ecart : une personne de la Maison repond ici (le jour)', 'Une personne de la Maison vous répond ici, Mme Naffi.', corps(d.s3));
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
      { nom: 'les envois de la veille comptent encore', mute: [P(AUTO, '    return ms - t < JOUR_WA && !(Number.isFinite(rendue) && t <= rendue);', '    return !(Number.isFinite(rendue) && t <= rendue);')] },
    ],
  },

  /* ══ R8 ══════════════════════════════════════════════════════════════ */
  {
    id: 'R8', nom: 'R8 l annulation n est jamais faite : transmise a l equipe, ou le parcours s arrete, rien ne s ecrit',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const an = scnAnnulations(ORIGINAL);
      vrai('annuler un rendez-vous : transmis, la main passe, aucune ecriture', corps(an.s2) === 'Nous transmettons votre demande, Mme Naffi. La Maison vous répond ici.'
        && an.k.etat?.motifMain === 'annulation' && an.s2.ecritures.length === 0 && an.k.poses.length === 0, corps(an.s2));
      vrai('annuler en plein parcours : rien n est reserve, le parcours s arrete', corps(an.s3) === "C'est noté, Mme Naffi : rien n'est réservé. Écrivez-nous quand vous le souhaitez." && an.k2.etat?.etape === 'clos' && an.s3.ecritures.length === 0, corps(an.s3));
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
      const ecran = sansCommentaires(lit(ECRAN_COMPOSEUR));
      const hote = sansCommentaires(lit(ECRAN_LES_CONVERSATIONS));
      vrai('l ecran pose la main a la premiere lettre, sur un geste, un envoi, Continuer dans WhatsApp (l hote, par la poignee du composeur), Reprendre la main',
        ["prendsLaMain('frappe')", "prendsLaMain('geste')", "prendsLaMain(modele ? 'modele' : 'envoi')", "prendsLaMain('reprendre', true)"].every((x) => ecran.includes(x))
        && hote.includes("poignee.current?.prendsLaMain('whatsapp')"));
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
          body: JSON.stringify({ numero: NAFFI_E, texte: 'Avec plaisir, Mme Naffi.', parQui: 'Y. B.' }),
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
      { nom: 'l ecran ne pose plus la main a la frappe', mute: [P(ECRAN_COMPOSEUR, "if (e.target.value.trim()) prendsLaMain('frappe');", 'if (e.target.value.trim()) void 0;')] },
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
      vaut('chaque confirmation est signee de la devise', [], messages.filter((m) => m.etape === 'confirme' && !m.accessoire && !m.corps.endsWith(DEVISE)).map((m) => m.corps));
      vaut('... le plan qui la suit est une image, a son adresse publique, sans legende', [], messages.filter((m) => m.forme === 'image' && !(m.accessoire && m.corps === '' && m.image === 'https://maisonmnd.com/assets/itineraire/plan-depuis-super-u.png')).map((m) => m.image));
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
      vrai('le juge crie sur la trace d un appel vide', fautesDesTextes([{ forme: 'texte', etape: 'recap', corps: 'Quel rituel souhaitez-vous,  ?' }]).some((f) => f.startsWith('trace d un appel vide')));
      return ecarts;
    },
    pannes: [
      { nom: 'le mot banni dans la bienvenue', mute: [P(AUTO, 'bienvenue à la ${maisonNomWa}.', `bienvenue au ${BANNI} \${maisonNomWa}.`)] },
      { nom: 'une date sans son annee', mute: [P(AUTO, '${MOIS_LONGS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`', '${MOIS_LONGS_WA[d.getUTCMonth()]}`')] },
      { nom: 'la devise sur tous les textes', mute: [P(AUTO, "  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps: propre(corps) });", "  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps: [propre(corps), DEVISE].join(' ') });")] },
      { nom: 'un titre de place trop long', mute: [P(AUTO, '  if (a.length <= 24) return a;', '  return a;')] },
      { nom: 'le plan signe la confirmation a sa place (accessoire perdu)', mute: [P(AUTO, "{ forme: 'image', etape: 'confirme', corps: '', image: PLAN_POUR_VENIR, accessoire: true },", "{ forme: 'image', etape: 'confirme', corps: '', image: PLAN_POUR_VENIR },")] },
      { nom: 'le juge ne voit plus le tiret cadratin', mute: [P(AUTO, "  if (s.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');", '')] },
    ],
  },

  /* ══ R12 ═════════════════════════════════════════════════════════════ */
  {
    id: 'R12', nom: 'R12 la nuit, il repond et reserve ; Parler a la Maison dit quand la Maison repond, avec l annee',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const n = scnNuit(ORIGINAL);
      vrai('a 23 h 10, il repond (Bonsoir)', corps(n.s1).startsWith('Bonsoir Mme Naffi'), corps(n.s1));
      vaut('Parler a la Maison la nuit : demain des 9 h', 'La Maison vous répond demain dès 9 h, Mme Naffi.', corps(n.s2));
      vaut('samedi soir (dimanche et lundi fermes) : mardi, avec l annee', 'La Maison vous répond mardi 13 octobre 2026 dès 9 h, Mme Naffi.', corps(n.s3));
      vaut('a 2 h un mardi : aujourd hui des 9 h', "La Maison vous répond aujourd'hui dès 9 h, Mme Naffi.", corps(n.s4));
      vaut('le jour : une personne repond ici', 'Une personne de la Maison vous répond ici, Mme Naffi.', corps(n.s5));
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
      const ORDRE = ['lecture-entiere', 'agenda-pur', 'catalogue-pur', 'qualification', 'place-du-serveur', 'prochaines-places', 'gestes-en-francais', 'automate-wa', 'prix-calibre'];
      const ORIGINAUX: Record<string, { fichier: string; extrait: (s: string) => string | null }> = {
        'lecture-entiere': { fichier: 'src/shared/lecture-entiere.ts', extrait: (s) => { const i = s.indexOf('export const PAGE_DE_LECTURE'); return i < 0 ? null : s.slice(i).trimEnd(); } },
        'agenda-pur': { fichier: 'src/shared/agenda-pur.ts', extrait: (s) => entre(s, 'agenda-pur') },
        'catalogue-pur': { fichier: 'src/shared/catalogue-pur.ts', extrait: (s) => entre(s, 'catalogue-pur') },
        'gestes-en-francais': { fichier: 'src/shared/gestes-en-francais.ts', extrait: (s) => entre(s, 'gestes-en-francais') },
        qualification: { fichier: 'src/shared/qualification.ts', extrait: (s) => entre(s, 'qualification') },
        'place-du-serveur': { fichier: 'src/shared/place-du-serveur.ts', extrait: (s) => entre(s, 'place-du-serveur') },
        'prochaines-places': { fichier: RESA, extrait: (s) => entre(s, 'prochaines-places') },
        'automate-wa': { fichier: AUTO, extrait: (s) => entre(s, 'automate-wa') },
        /* Le barème du site, pour le prix dit dès le choix (30 octobre 2026). */
        'prix-calibre': { fichier: 'src/apps/revelateur/prix-calibre.ts', extrait: (s) => entre(s, 'prix-calibre') },
      };
      const positions = ORDRE.map((n) => edge.indexOf(`/* ⟨${n}⟩ */\n`));
      vrai('whatsapp-automate porte ses neuf blocs, dans l ordre ou ils s appuient', positions.every((x, i) => x > 0 && (i === 0 || x > positions[i - 1])), ORDRE.map((n, i) => `${n}:${positions[i]}`).join(' '));
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
      const repond: MessageWa = { id: 'wa-2', sens: 'sortant', numero: NUM, texte: 'Bonsoir Mme Naffi', quand: isoDe(T0 + 3000), parQui: 'Le Trône', auto: 'automate' } as MessageWa;
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
      /* Le juge compte aussi les points du chat du site (`point-avant`, `point-recu`) ; la panne retire tous les `auto` d'un coup (motif remis à jour le 27 octobre 2026). */
      { nom: 'un message de l automate repond a la place de la Maison', mute: [P(CONV, "        && ((!!x.modele && estEnvoiAutomatique(x.parQui)) || x.auto === 'automate' || x.auto === 'point-avant' || x.auto === 'point-recu'))) ?? dernier;", '        && ((!!x.modele && estEnvoiAutomatique(x.parQui))))) ?? dernier;')] },
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
      for (const f of [ECRAN_CONV, ECRAN_COMPOSEUR, ECRAN_ALARME, ECRAN_REGLAGES]) {
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
      /* Le webhook dit sa version du jour (2026-10-27-a, l'Assistant Maison entend) : la panne la recule avant le 9 octobre. */
      { nom: 'la version du webhook n est pas celle du 9 octobre', mute: [P(F_HOOK, "const VERSION = '2026-10-28-", "const VERSION = '2026-10-08-")] },
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
        vrai('banc : la meme chose ? avec la civilite, la derniere venue et son annee', /Mme Naffi/.test(corpsDe(b1)) && /12 septembre 2026/.test(corpsDe(b1)) && j(choixDe(b1).map((x) => x.titre)) === j(['La même chose', 'Autre chose', 'Parler à la Maison']), corpsDe(b1));
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
        /* Son rituel est un SÍNSIN : chez Team, seul (24 octobre 2026). */
        vaut('banc : ... la Maison attribue : un SINSIN va chez Team seul, et le verrou le prend', [['Team'], 'Team'], [B().poses[0]?.p_maitres, rdv?.data.master]);
        /* TROIS BULLES (29 octobre 2026) : la confirmation courte, le plan en
           image, puis la Maison sur Google Maps par le site. */
        const [b4, plan, venir] = ecritsA(NAFFI_E).slice(-3);
        vrai('banc : la confirmation en texte, l annee, le plan annonce, la devise, plus le long itineraire', b4?.type === 'text' && /^C'est confirmé, Mme Naffi/.test(corpsDe(b4)) && /2026 à/.test(corpsDe(b4))
          && corpsDe(b4).includes('Le plan pour venir à la Maison suit ce message.') && !/Akpakpa/.test(corpsDe(b4)) && corpsDe(b4).endsWith(DEVISE), corpsDe(b4));
        vaut('banc : puis le plan en image, puis la Maison sur Google Maps par le site, jamais le lien de Google lui-meme',
          ['image', 'https://maisonmnd.com/assets/itineraire/plan-depuis-super-u.png', 'text', 'Maison MND sur Google Maps : https://maisonmnd.com/venir/'],
          [plan?.type, plan?.image?.link, venir?.type, corpsDe(venir)]);
        const ligne = T('envois').get(`conf-${rdv?.id}-whatsapp`)?.data;
        vrai('banc : la ligne de confirmation passe a envoye, avec l identifiant de Meta', ligne?.statut === 'envoyé' && /^wamid\.out-/.test(ligne?.waMessageId ?? ''), ligne);
        vrai('banc : la seule alerte, le rendez-vous pose, au prenom seul', pushsDepuis(p0).length === 2 && pushsDepuis(p0).every((x: Any) => x.title === 'Nouveau rendez-vous par WhatsApp' && /^Naffi, /.test(x.body) && /2026/.test(x.body)), pushsDepuis(p0));
        vaut('banc : quatre messages de la Maison, le plan et le lien pour venir', 6, ecritsA(NAFFI_E).length);
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
        vaut('banc : l inconnue : sept messages et les deux qui suivent la confirmation, le rendez-vous sans fiche, la demande avec sa civilite, aucune fiche creee',
          { messages: 9, clientId: '', clientName: 'Awa', source: 'whatsapp', civilite: 'mademoiselle', telephone: `+${INCONNUE_E}`, apptId: rdvB?.id, fiches: 1 },
          { messages: ecritsA(INCONNUE_E).length, clientId: rdvB?.data.clientId, clientName: rdvB?.data.clientName, source: dem?.data.source, civilite: dem?.data.civilite, telephone: dem?.data.telephone, apptId: dem?.data.apptId, fiches: T('clients').size });
        vaut('banc : les juges de la Maison, sur ses neuf messages', [], fautesDuBanc(INCONNUE_E));
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
          && /Cette heure vient d'être prise, Mme Naffi/.test(corpsDe(dernierA(NAFFI_E))) && !choixDe(dernierA(NAFFI_E)).some((x) => x.id.endsWith(arg)), corpsDe(dernierA(NAFFI_E)));
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
        vrai('banc : le controle de sante dit sa version datee (9 octobre 2026 ou apres) et des longueurs, jamais le secret', ((/^(\d{4}-\d{2}-\d{2})/.exec(String(sante.version ?? ''))?.[1] ?? '') >= '2026-10-09') && sante.secrets?.CLE_SERVICE === ENV.CLE_SERVICE.length && !j(sante).includes(ENV.CLE_SERVICE), sante);
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
        && corps(s1) === 'Bonjour, merci de votre message. Pour qui est ce rendez-vous ?', corps(s1));
      vaut('... Pour Kemi, Pour moi, Une autre personne, la Maison', ['Pour Kemi', 'Pour moi', 'Une autre personne', 'Parler à la Maison'], lignesDe(s1));
      const s2 = elle(m, t0 + 1000, { touche: 'Pour moi' });
      vrai('Pour moi : le parcours d une inconnue', s2.messages[0]?.etape === 'besoin', corps(s2));
      elle(m, t0 + 2000, { touche: 'Entretenir mes locks' });
      elle(m, t0 + 3000, { touche: 'Lavage · Essentiel' });
      elle(m, t0 + 3500, { touche: "Non, c'est tout" });
      elle(m, t0 + 4000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      elle(m, t0 + 5000, { touche: 'Madame' });
      elle(m, t0 + 6000, { texte: 'Grâce' });
      const s8 = elle(m, t0 + 7000, { touche: 'Je confirme' });
      vaut('... la pose est sans fiche, sa demande a son prenom (jamais sur la fiche de Kemi)', { clientId: '', clientName: 'Grâce', demande: 'Grâce' },
        { clientId: m.poses[0]?.rdv.clientId, clientName: m.poses[0]?.rdv.clientName, demande: m.poses[0]?.demande?.prenom });
      vrai('... c est confirme, Mme Grace', corps(s8).startsWith("C'est confirmé, Mme Grâce"), corps(s8));
      const k = parcours(ORIGINAL, NUM_NAFFI, [KEMI_SEULE]);
      elle(k, t0, { texte: 'Bonjour, je voudrais un rendez-vous' });
      const k2 = elle(k, t0 + 1000, { touche: 'Pour Kemi' });
      vaut('Pour Kemi : sa derniere venue, dite d elle', 'La dernière venue de Kemi : Lavage rituel (KLƆKLƆ™ Essentiel), le samedi 12 septembre 2026. Souhaitez-vous la même chose ?', corps(k2));
      /* Le mari d Awa ecrit du numero range en second numero sur sa fiche. */
      const AWA: FicheDuNumero = { id: 'c-awa', nom: 'Awa Sossa', civilite: 'madame', parPhone: false, numeros: ['2290196000000', NUM_NAFFI], derniereVenue: { date: '2026-09-12', serviceIds: ['plt-05'] } };
      const a = parcours(ORIGINAL, NUM_NAFFI, [AWA]);
      const a1 = elle(a, t0, { texte: 'je voudrais prendre rendez-vous pour moi' });
      vrai('un second numero : Pour qui, ni Mme Awa ni la venue d Awa', a1.messages[0]?.etape === 'qui' && !/Awa/.test(corps(a1)) && !/septembre/.test(corps(a1)), corps(a1));
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
      elle(e, t0 + 2000, { touche: 'Lavage · Essentiel' });
      elle(e, t0 + 2500, { touche: "Non, c'est tout" });
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
    id: 'R21', nom: 'R21 elle parle d un rendez-vous qu elle a deja : il se tait, l equipe repond (et une vraie demande parle toujours) ; un rendez-vous a venir ou une Maison qui a ecrit ne le font plus taire (14 octobre 2026)',
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
      vaut('un rendez-vous a venir, sur sa fiche ou dans la famille : il parle (14 octobre 2026)', ['parle', 'parle'],
        [dit('Je voudrais un rendez-vous', { fiches: [{ ...NAFFI, prochainRdv: { date: '2026-10-17', time: '09:00' } }] }),
          dit('Je voudrais un rendez-vous', { fiches: [NAFFI, { ...KEMI, prochainRdv: { date: '2026-10-17' } }] })]);
      const rendue: MainDuFil = { pauseLe: isoDe(t0 - 2 * 86400000), jusqua: isoDe(t0 - 86400000), rendueLe: isoDe(t0 - 3600000) };
      vaut('la Maison a ecrit il y a deux jours, huit jours, ou rendue depuis : il parle toujours', ['parle', 'parle', 'parle'],
        [dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 2 * 86400000) }),
          dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 8 * 86400000) }),
          dit('Je voudrais un rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 2 * 86400000), main: rendue })]);
      vaut('... une annulation aussi : il la transmet', 'parle', dit('Je dois annuler mon rendez-vous', { derniereParoleDeLaMaison: isoDe(t0 - 3600000) }));
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
        vrai('banc : la Maison a ecrit hier : l automate prend quand meme (14 octobre 2026)', appelsAutomate === 1 && ecritsA(NAFFI_E).length === 1 && fil(NAFFI_E)?.etape === 'meme', { ecrits: ecritsA(NAFFI_E).length, etape: fil(NAFFI_E)?.etape });
        /* Ses propres messages ne comptent pas : l automate d hier n empeche rien. */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] });
        T('messages_wa').set('wa-auto', { id: 'wa-auto', data: { id: 'wa-auto', sens: 'sortant', numero: NAFFI_E, texte: 'Bonjour Mme Naffi', quand: hier, parQui: 'Le Trône', auto: 'automate' } });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous samedi');
        vrai('banc : un message de l automate d hier n empeche rien', ecritsA(NAFFI_E).length === 1 && fil(NAFFI_E)?.etape === 'meme');
        /* Un rendez-vous a venir sur sa fiche : il prend quand meme (14 octobre 2026). */
        remetsLaBase({ mode: 'ouvert', numerosEssai: [] }, { rdvs: [{ id: 'rdv-avenir', branch_id: 'maison', data: { id: 'rdv-avenir', clientId: 'cli-naffi', branchId: 'maison', date: '2026-10-20', time: '10:00', status: 'confirmé', serviceIds: ['sv-klk-ess'] } }] });
        await ecrit(NAFFI_E, 'Je voudrais un rendez-vous samedi');
        vrai('banc : un rendez-vous a venir : l automate prend quand meme', ecritsA(NAFFI_E).length === 1 && fil(NAFFI_E)?.etape === 'meme', { ecrits: ecritsA(NAFFI_E).length, etape: fil(NAFFI_E)?.etape });
      });
      return ecarts;
    },
    pannes: [
      { nom: 'un rendez-vous existant passe pour une envie de reserver', mute: [P(AUTO, 'function renvoieAUnRdv(texte: string): boolean {\n', 'function renvoieAUnRdv(texte: string): boolean {\n  if (texte) return false;\n')] },
      { nom: 'un rendez-vous a venir fait de nouveau taire', mute: [P(AUTO, '  } else if (renvoieAUnRdv(tour.texte)) {', '  } else if (renvoieAUnRdv(tour.texte) || fiches.some((f) => !f.parFamille && !!f.prochainRdv)) {')] },
      { nom: 'la regle des sept jours revient', mute: [P(AUTO, '  } else if (mots.deplacer || mots.annuler) {\n    /* Un prix dans la même phrase', '  } else if (laMaisonAParle(ctx)) {\n    parle = false;\n  } else if (mots.deplacer || mots.annuler) {\n    /* Un prix dans la même phrase')] },
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
        && corps(q) === 'Une personne de la Maison vous répond ici, Mme Naffi.' && p.etat?.motifMain === 'question'
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
      { nom: 'au repos, une question d autre chose lance un parcours', mute: [P(AUTO, '    parle = conseilActif(ctx.conseil);\n', '    parle = true;\n')] },
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
      { nom: 'le juge du prix d avant (le f de fevrier)', mute: [P(AUTO, "  if (!prixPermis && /\\d[\\d\\s.,]*\\s?(fcfa|cfa|xof|francs?|f)(?![\\p{L}])/iu.test(s)) fautes.push('un prix');", "  if (!prixPermis && /\\d[\\d\\s.,]*\\s?(f|fcfa|cfa|xof|francs?)\\b/i.test(s)) fautes.push('un prix');")] },
      { nom: 'le juge du prix ne voit plus les francs', mute: [P(AUTO, "  if (!prixPermis && /\\d[\\d\\s.,]*\\s?(fcfa|cfa|xof|francs?|f)(?![\\p{L}])/iu.test(s)) fautes.push('un prix');", '')] },
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
        /* La confirmation est la premiere des trois bulles : c'est elle qui revient non remise. */
        const conf = [...T('messages_wa').values()].map((l: Any) => l.data)
          .find((d: Any) => d.sens === 'sortant' && d.numero === NAFFI_E && d.etape === 'confirme' && /^C'est confirmé/.test(d.texte ?? ''));
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
    id: 'R27', nom: 'R27 le plafond n avale jamais Je confirme ; la question d un autre soin ne mange pas sa marge (dix, plus elle)',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const p = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(p, t0 + 2000, { touche: 'Lavage · Essentiel' });
      elle(p, t0 + 2500, { touche: "Non, c'est tout" });
      elle(p, t0 + 3000, { touche: 'Un autre jour' });
      elle(p, t0 + 4000, { touche: 'Mardi 13 oct. 2026' });
      elle(p, t0 + 5000, { touche: 'Un autre jour' });
      elle(p, t0 + 6000, { touche: 'Mercredi 14 oct. 2026' });
      elle(p, t0 + 7000, { touche: 'Mer. 14 oct. 2026 · 9 h' });
      elle(p, t0 + 8000, { touche: 'Madame' });
      const recap = elle(p, t0 + 9000, { texte: 'Awa' });
      vaut('le recapitulatif est son onzieme message : dix, plus la question d un autre soin', [11, 'recap'], [p.envoyes.length, recap.messages[0]?.etape]);
      const oui = elle(p, t0 + 10000, { touche: 'Je confirme' });
      vrai('Je confirme pose et confirme quand meme', p.poses.length === 1 && oui.messages[0]?.etape === 'confirme' && corps(oui).startsWith("C'est confirmé, Mme Awa"), corps(oui));
      const q = parcours(ORIGINAL, NUM_INCONNUE, []);
      for (const [i, x] of [[0, { texte: 'Bonjour, je voudrais prendre rendez-vous' }], [1, { touche: 'Entretenir mes locks' }], [2, { touche: 'Lavage · Essentiel' }],
        [2.5, { touche: "Non, c'est tout" }], [3, { touche: 'Un autre jour' }], [4, { touche: 'Mardi 13 oct. 2026' }], [5, { touche: 'Un autre jour' }],
        [6, { touche: 'Mercredi 14 oct. 2026' }], [7, { touche: 'Mer. 14 oct. 2026 · 9 h' }], [8, { touche: 'Madame' }], [9, { texte: 'Awa' }]] as const) elle(q, t0 + i * 1000, x);
      const autre = elle(q, t0 + 10000, { touche: 'Une autre heure' });
      vrai('... un autre toucher, lui, reste sous le plafond : la main passe sans un mot', autre.pris && autre.messages.length === 0 && q.etat?.motifMain === 'plafond' && q.poses.length === 0);
      return ecarts;
    },
    pannes: [
      { nom: 'le plafond avale Je confirme (le tour)', mute: [P(AUTO, "    if (envoisQuiComptent(base.envois, ctx.main, ms) >= plafondDuFil(base) && !confirme && !sansPlafondWa(ctx.reglage, ctx.numero)) return laMain('plafond', false);", "    if (envoisQuiComptent(base.envois, ctx.main, ms) >= plafondDuFil(base) && !sansPlafondWa(ctx.reglage, ctx.numero)) return laMain('plafond', false);")] },
      { nom: 'le plafond avale Je confirme (la porte)', mute: [P(AUTO, '  if (envois >= plafondDuFil(etat) && !confirmeValide(etat, tour, courante) && !sansPlafondWa(ctx.reglage, ctx.numero))', '  if (envois >= plafondDuFil(etat) && !sansPlafondWa(ctx.reglage, ctx.numero))')] },
      { nom: 'la question d un autre soin mange la marge du plafond', mute: [P(AUTO, '  return PLAFOND_DE_L_AUTOMATE + Math.min(6, Math.max(0, etat?.panier?.horsPlafond ?? 0));', '  return PLAFOND_DE_L_AUTOMATE;')] },
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
      vrai('les memes mots encore : un ecart (la relance)', corps(s4) === "Touchez l'un des choix ci-dessous, Mme Naffi, ou Parler à la Maison." && p.etat?.ecarts === 1, corps(s4));
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
        elle(p, t0 + 2000, { touche: 'Lavage · Essentiel' });
        elle(p, t0 + 2500, { touche: "Non, c'est tout" });
        elle(p, t0 + 3000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
        return { p, s: elle(p, t0 + 4000, { texte }), t0 };
      };
      const a = jusquALaCivilite('Madame');
      vaut('« Madame » ecrit a la civilite : et votre prenom, Madame', 'Et votre prénom, Madame ? Écrivez-le simplement dans un message, en réponse.', corps(a.s));
      const a2 = elle(a.p, a.t0 + 5000, { texte: 'Je m appelle Grace' });
      vrai('... « Je m appelle Grace » : le recapitulatif de Mme Grace', a2.messages[0]?.etape === 'recap' && corps(a2).startsWith('Voici votre rendez-vous, Mme Grace'), corps(a2));
      const b = jusquALaCivilite('Mme Grace');
      vrai('« Mme Grace » ecrit a la civilite : directement le recapitulatif', b.s.messages[0]?.etape === 'recap' && corps(b.s).startsWith('Voici votre rendez-vous, Mme Grace'), corps(b.s));
      const c = jusquALaCivilite('M. Koffi');
      vrai('« M. Koffi » : M. Koffi', corps(c.s).startsWith('Voici votre rendez-vous, M. Koffi'), corps(c.s));
      const d = jusquALaCivilite('euh');
      vrai('un texte qui n est pas une civilite reste un ecart', corps(d.s) === "Touchez l'un des choix ci-dessous, ou Parler à la Maison." && d.p.etat?.ecarts === 1, corps(d.s));
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
  /* ══ R31 · la clé du numéro, 13 octobre 2026 ═════════════════════════ */
  {
    id: 'R31', nom: 'R31 la cle du numero : 229 97 00 00 99 (Meta) et 229 01 97 00 00 99 (la fiche, la liste d essai) sont le meme numero, partout',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const essai: ReglageDeLAutomate = { ...REGLAGE_LIVRE, numerosEssai: ['2290197000099'] };
      vaut('cleWa reunit les deux formes, et laisse un numero etranger', ['22997000099', '22997000099', '22997000099', '33612345678'],
        [cleWa('22997000099'), cleWa('+229 01 97 00 00 99'), cleWa('97000099'), cleWa('+33 6 12 34 56 78')]);
      vaut('listee au plan de 2024, servie sous l ancien numero de Meta (le premier essai de Yeman)', [true, true, false],
        [numeroServi(essai, '22997000099', 'clientes'), numeroServi(essai, '2290197000099', 'equipe'), numeroServi(essai, '22997000098', 'clientes')]);
      const auto = lit(F_AUTO), hook = lit(F_HOOK), conv = lit(CONV), sql = lit('supabase/migrations/0128_la_cle_du_numero.sql');
      vrai('la fonction rattache la fiche du numero par cle', auto.includes("(f.numeros ?? []).some((x) => cleWa(x) === cleWa(o.numero))"));
      vrai('le webhook lit les fiches par cle quand la RPC manque', hook.includes('f.numeros.some((x) => cleWa(x) === cle)'));
      vrai('le Trone trouve la tete d un numero par cle', conv.includes('cleDuNumeroWa(t.phone) !== n && cleDuNumeroWa(t.phone2) !== n'));
      vrai('la base compare les fiches, la tete et la reserve par cle (0128)', sql.includes("public.cle_du_numero_wa(c.data->>'phone') = (select v from num) as par_phone") && sql.includes("and (public.cle_du_numero_wa(c.data->>'phone') = (select v from num)") && /cle_du_numero_wa\(t\.data->>'phone'\)/.test(sql) && /cle_du_numero_wa\(m\.data->>'numero'\)/.test(sql));
      vrai('la base garde numero_wa tel quel : les envois et les fils ne changent pas', !/create or replace function public\.numero_wa/.test(sql));
      return ecarts;
    },
    pannes: [
      { nom: 'l essai compare les chiffres a l egal', mute: [P(AUTO, "  if (reglage.numerosEssai.some((x) => cleWa(x) === n)) return true;", "  if (reglage.numerosEssai.includes(String(numero ?? '').replace(/\\D/g, ''))) return true;")] },
      { nom: 'la fonction rattache la fiche a l egal', mute: [P(F_AUTO, "(f.numeros ?? []).some((x) => cleWa(x) === cleWa(o.numero))", "(f.numeros ?? []).includes(o.numero)")] },
      { nom: 'le Trone cherche la tete a l egal', mute: [P(CONV, 'cleDuNumeroWa(t.phone) !== n && cleDuNumeroWa(t.phone2) !== n', 'numeroWa(t.phone) !== n && numeroWa(t.phone2) !== n')] },
      { nom: 'la base compare les fiches a l egal', mute: [P('supabase/migrations/0128_la_cle_du_numero.sql', "public.cle_du_numero_wa(c.data->>'phone') = (select v from num) as par_phone", "public.numero_wa(c.data->>'phone') = (select v from num) as par_phone")] },
    ],
  },
  /* ══ R32 · plusieurs soins, le français d'abord, le prénom en message (13 octobre 2026) ═══ */
  {
    id: 'R32', nom: 'R32 la cliente lit le francais d abord, ajoute jusqu a trois soins le meme jour, et sait qu elle repond son prenom en message',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const b = scnInconnue(ORIGINAL);
      vaut('la liste dit le geste en francais : Lavage · Essentiel', ['Entretien · Essentiel', 'Lavage · Essentiel', 'Lavage · Le Souffle', 'Lavage · Intégral', 'Racines · Essentiel', 'Racines · La Reprise', 'Un soin', 'Parler à la Maison'], lignesDe(b.s2));
      vaut('... et dessous, ce que fait le geste, la duree reservee (une heure au moins), le nom fon en dernier',
        ['Lavage et reprise des racines · 1 h 45 · KLƆKLƆ™ + SÍNSIN™', 'Cuir chevelu et longueurs, rinçage soigné · 1 h · KLƆKLƆ™'],
        (b.s2.messages[0]?.lignes ?? []).slice(0, 2).map((l) => l.description));
      const lignes = tousLesParcours(ORIGINAL).flatMap((p) => p.envoyes).flatMap((m) => m.lignes ?? []);
      vrai('dans tous les parcours, chaque titre tient en 24 signes et chaque description en 72', lignes.length > 20 && lignes.every((l) => l.titre.length <= 24 && (l.description ?? '').length <= 72),
        lignes.filter((l) => l.titre.length > 24 || (l.description ?? '').length > 72).map((l) => `${l.titre} / ${l.description ?? ''}`).join(' | '));
      vrai('un rituel choisi : un autre soin le meme jour ?', b.s3.messages[0]?.etape === 'encore' && corps(b.s3) === 'Souhaitez-vous ajouter un autre soin le même jour ?', corps(b.s3));
      vaut('... Ajouter un soin, Non c est tout, la Maison', ['Ajouter un soin', "Non, c'est tout", 'Parler à la Maison'], boutonsDe(b.s3));
      vrai('Non, c est tout : les places', b.s3b.messages[0]?.etape === 'places', corps(b.s3b));
      vaut('le prenom se repond en message, et c est dit', 'Et votre prénom, Mademoiselle ? Écrivez-le simplement dans un message, en réponse.', corps(b.s5));
      const d = scnTroisSoins(ORIGINAL);
      vrai('Ajouter un soin : quel soin ajouter, les soins restants en francais, jamais celui deja pris ni un second lavage', corps(d.s4) === 'Quel soin ajouter ?'
        && j(lignesDe(d.s4)) === j(['Racines · Essentiel', 'Racines · La Reprise', 'Réparer mes locks', 'Autre soin', 'Parler à la Maison']), `${corps(d.s4)} ${lignesDe(d.s4).join(' | ')}`);
      vrai('le lavage et les racines pris : les soins du cheveu viennent d eux-memes', lignesDe(d.s6).includes('Hydratation · Essentiel') && !lignesDe(d.s6).some((x) => x.startsWith('Lavage') || x.startsWith('Racines')), lignesDe(d.s6).join(' | '));
      vrai('le second soin s ajoute au premier : la question revient', d.s5.messages[0]?.etape === 'encore', corps(d.s5));
      vaut('le troisieme soin ferme le panier : droit aux places, sans question', 'places', d.s7.messages[0]?.etape);
      vaut('le recapitulatif dit les trois soins, en francais puis la marque',
        'Voici votre rendez-vous, Mme Afi : Lavage rituel (KLƆKLƆ™ Essentiel), Reprise des racines (SÍNSIN™ Essentiel) et Hydratation (DÀNDÀN™ Essentiel), mardi 13 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(d.recap));
      vaut('la pose porte les trois soins, dans l ordre choisi, et leur duree', [['plt-05', 'sinsin-ess', 'dandan-ess'], 135, 'confirme'],
        [d.p.poses[0]?.rdv.serviceIds, d.p.poses[0]?.rdv.dureeMin, d.oui.messages[0]?.etape]);
      /* Ecrit au lieu de touche : « non » file aux places, « oui » ouvre les soins. */
      const n = parcours(ORIGINAL, NUM_INCONNUE, []);
      const t0 = cotonou('2026-10-09', '10:12');
      elle(n, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(n, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(n, t0 + 2000, { touche: 'Lavage · Essentiel' });
      const non = elle(n, t0 + 3000, { texte: 'Non merci' });
      vaut('« Non merci » ecrit : les places', 'places', non.messages[0]?.etape);
      const o = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(o, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(o, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(o, t0 + 2000, { touche: 'Lavage · Essentiel' });
      const oui = elle(o, t0 + 3000, { texte: 'Oui' });
      vrai('« Oui » ecrit : les soins a ajouter', oui.messages[0]?.etape === 'rituel' && corps(oui) === 'Quel soin ajouter ?', corps(oui));
      return ecarts;
    },
    pannes: [
      { nom: 'la liste revient aux marques fon', mute: [P(AUTO, "    if (noms.length <= 1) return titreEnFrancaisWa(noms[0] ?? '');", "    if (noms.length <= 1) return coupeWa(noms[0] ?? '', 24);")] },
      { nom: 'un rituel choisi file aux places sans proposer un autre soin', mute: [P(AUTO, "            return apresLeChoix('rituel');", '            return dire(msgPlaces({}));')] },
      { nom: 'le second soin remplace le premier', mute: [P(AUTO, '            const deja = base.panier.enAjout ? (base.panier.serviceIds ?? []) : [];', '            const deja: string[] = [];')] },
      { nom: 'le panier n a plus de plafond : un quatrieme soin se propose', mute: [P(AUTO, 'const SOINS_PAR_RENDEZ_VOUS = 3;', 'const SOINS_PAR_RENDEZ_VOUS = 9;')] },
      { nom: 'le prenom ne dit plus qu il se repond en message', mute: [P(AUTO, '      : `Et votre prénom, ${civ} ? Écrivez-le simplement dans un message, en réponse.`, []);', '      : `Et votre prénom, ${civ} ?`, []);')] },
      { nom: 'le recapitulatif ne dit plus le francais', mute: [P(AUTO, '    const gestes = gestesDitsEnFrancaisWa(nomsDe(p.serviceIds));', '    const gestes = gestesDitsWa(nomsDe(p.serviceIds));')] },
    ],
  },
  /* ══ R33 · la revue du 13 octobre 2026, et rendre le fil apres la pose ═══ */
  {
    id: 'R33', nom: 'R33 les vrais noms du catalogue se lisent sans coupe ; non merci garde le jour voulu ; rendu apres une pose, l automate reprend, et le plafond compte depuis la main rendue',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      vaut('un nom a sous-titre : le geste seul, jamais « · · »', ['Hydratation', 'Reconstruction', 'Lavage · Chaque Lune', 'Lavage · Essentiel', 'Consultation · Origine'],
        ['DÀNDÀN™ · Le Soin Hydratant', 'GBÌGBÌ™ · Le Renfort', 'KLƆKLƆ™ · Chaque Lune', 'KLƆKLƆ™ Essentiel · « Le Souffle » · Court', 'KÒKÒ™ Origine · Avant Création'].map((n) => titreEnFrancaisWa(n)));
      vaut('devant « + 1 », le titre se compose dans sa place, sans mot coupe', ['Racines Essentiel', 'Reconstruction'],
        [titreEnFrancaisWa('SÍNSIN™ Essentiel', 18), titreEnFrancaisWa('GBÌGBÌ™ Essentiel', 18)]);
      vaut('la duree dite', ['45 min', '1 h', '1 h 45', ''], [dureeDiteWa(45), dureeDiteWa(60), dureeDiteWa(105), dureeDiteWa(0)]);
      const v = scnVraisNoms(ORIGINAL);
      vaut('la liste des vrais noms : en francais, en 24 signes, deux gammes pareilles distinguees par le nom de la Maison', ['Entretien · Essentiel', 'Lavage · Essentiel', 'Lavage · Le Souffle', 'Lavage · Intégral', 'Racines · Essentiel', 'Racines · La Reprise', 'Un soin', 'Parler à la Maison'], lignesDe(v.liste));
      const desc = (v.liste.messages[0]?.lignes ?? []).map((l) => l.description ?? '');
      vaut('la venue : ses gestes en francais, la duree, les marques en dernier ; un lavage : ce qu il fait, la duree, son nom fon',
        ['Lavage Le Souffle et reprise des racines · 1 h 45 · KLƆKLƆ™ + SÍNSIN™', 'Cuir chevelu et longueurs, rinçage soigné · 1 h · KLƆKLƆ™ · Le Souffle'], [desc[0], desc[2]]);
      vrai('« Non merci, plutot mercredi » : les places, le mercredi d abord (sans lui, samedi viendrait en tete)', v.mercredi.messages[0]?.etape === 'places' && lignesDe(v.mercredi)[0] === 'Mer. 14 oct. 2026 · 9 h', lignesDe(v.mercredi).join(' | '));
      vaut('le recapitulatif dit le geste en francais, le nom reel entre parentheses', 'Voici votre rendez-vous, Mme Afi : Hydratation (DÀNDÀN™ · Le Soin Hydratant), mercredi 14 octobre 2026 à 9 h, à la Maison MND. Nous le posons ?', corps(v.recap));
      /* Une venue de trois gestes garde la ligne de ses noms : ils se coupent, la duree reste. */
      const longue = parcours(ORIGINAL, NUM_INCONNUE, []);
      longue.agenda = { formules: [{ serviceIds: ['klk-souffle', 'sinsin-reprise', 'dandan-soin'] }] };
      const tl = cotonou('2026-10-09', '10:12');
      elle(longue, tl, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      const d0 = elle(longue, tl + 1000, { touche: 'Entretenir mes locks' }).messages[0]?.lignes?.[0]?.description ?? '';
      vrai('une formule longue : les noms se coupent, la duree reste, en 72 signes', d0.endsWith(' · 2 h 15') && d0.length <= 72, d0);
      /* Ecrit a « un autre soin ? » */
      const ecrit = (texte: string) => {
        const q = parcours(ORIGINAL, NUM_INCONNUE, []);
        const t0 = cotonou('2026-10-09', '10:12');
        elle(q, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
        elle(q, t0 + 1000, { touche: 'Entretenir mes locks' });
        elle(q, t0 + 2000, { touche: 'Lavage · Essentiel' });
        return elle(q, t0 + 3000, { texte }).messages[0]?.etape;
      };
      vaut('« Merci, c est tout », « C est bon pour moi » : les places ; « Je voudrais aussi un resserrage », « Oui » : la liste',
        ['places', 'places', 'rituel', 'rituel'], ['Merci, c’est tout', 'C’est bon pour moi', 'Je voudrais aussi un resserrage', 'Oui'].map(ecrit));
      /* Rendre apres la pose */
      const b = scnInconnue(ORIGINAL);
      const t1 = b.t0 + 3600000;
      const tue = elle(b.p, t1, { texte: 'Je voudrais un autre rendez-vous' });
      vrai('apres un rendez-vous pose, il laisse la Maison repondre', !tue.pris && tue.messages.length === 0);
      b.p.main = { rendueLe: isoDe(b.t0 - 60000) };
      const avant = elle(b.p, t1 + 60000, { texte: 'Je voudrais un autre rendez-vous' });
      vrai('... une main rendue AVANT la pose ne rouvre rien', !avant.pris && avant.messages.length === 0);
      b.p.main = { rendueLe: isoDe(t1 + 120000) };
      const re = elle(b.p, t1 + 180000, { texte: 'Je voudrais un autre rendez-vous' });
      vaut('rendu apres la pose : il reprend, un parcours neuf', 'besoin', re.messages[0]?.etape);
      elle(b.p, t1 + 190000, { touche: 'Entretenir mes locks' });
      elle(b.p, t1 + 200000, { touche: 'Lavage · Essentiel' });
      elle(b.p, t1 + 210000, { touche: "Non, c'est tout" });
      elle(b.p, t1 + 220000, { touche: 'Mer. 14 oct. 2026 · 9 h' });
      elle(b.p, t1 + 230000, { touche: 'Madame' });
      elle(b.p, t1 + 240000, { texte: 'Afi' });
      elle(b.p, t1 + 250000, { touche: 'Je confirme' });
      vaut('... et le second parcours va au bout : seize messages en une heure, le plafond compte depuis la main rendue', [2, 'confirme'], [b.p.poses.length, b.p.envoyes.at(-1)?.etape]);
      vaut('le compte du plafond : les messages d avant la main rendue ne comptent plus', [3, 1],
        [envoisQuiComptent([isoDe(t1 - 3 * 3600000), isoDe(t1 - 2 * 3600000), isoDe(t1 - 3600000)], null, t1),
          envoisQuiComptent([isoDe(t1 - 3 * 3600000), isoDe(t1 - 2 * 3600000), isoDe(t1 - 3600000)], { rendueLe: isoDe(t1 - 90 * 60000) }, t1)]);
      const conv = lit(ECRAN_COMPOSEUR);
      const debut = conv.indexOf("if (vue.tenue === 'fini' && vue.etape === 'confirme')");
      const suite = conv.indexOf('  if (vue.tenue', debut + 20);
      const bandeau = debut < 0 ? '' : conv.slice(debut, suite > debut ? suite : debut + 2400);
      vrai('le Trone offre « Rendre a l automate » sur le bandeau de la pose, et dit jusqu a quand', /onClick=\{surRendre\}>Rendre à l’automate</.test(bandeau) && bandeau.includes('L’automate laisse la Maison répondre'));
      return ecarts;
    },
    pannes: [
      { nom: 'le point du sous-titre reste en tete de la variante', mute: [P('src/shared/gestes-en-francais.ts', "  const reste = brutDuReste.replace(/^[·:–-]\\s*/u, '');", '  const reste = brutDuReste;')] },
      { nom: 'la duree tombe a la coupe', mute: [P(AUTO, '    return `${coupeWa(gestesDitsWa(nomsDe(ids)), 72 - suite.length)}${suite}`;', '    return coupeWa(`${gestesDitsWa(nomsDe(ids))}${suite}`, 72);')] },
      { nom: 'non merci oublie le mercredi', mute: [P(AUTO, '          if (desMots) retiensLesMots();\n          return dire(msgPlaces({}));', '          return dire(msgPlaces({}));')] },
      { nom: 'un fil confirme ne se rend pas', mute: [P(AUTO, "    if (Number.isFinite(rendue) && Number.isFinite(maj) && rendue >= maj) return 'repos';\n", '')] },
      { nom: 'le plafond compte les messages d avant la main rendue', mute: [P(AUTO, '    return ms - t < JOUR_WA && !(Number.isFinite(rendue) && t <= rendue);', '    return ms - t < JOUR_WA;')] },
      { nom: 'le Trone n offre pas Rendre a l automate apres la pose', mute: [P(ECRAN_COMPOSEUR, '{/* rendre après la pose */}<Button variant="ghost" size="sm" onClick={surRendre}>Rendre à l’automate</Button>', '')] },
    ],
  },
  /* ══ R34 · le lien Google Maps de la Maison, 13 octobre 2026 ═══════════ */
  {
    id: 'R34', nom: 'R34 la confirmation porte le lien Google Maps de la Maison, sans le parametre de partage, et jamais un lien etranger',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const confirme = (carte?: string): string => laConfirmation(carte).messages.map((m) => m.corps).join('\n\n');
      const laConfirmation = (carte?: string): SortieDuTour => {
        const a = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
        if (carte !== undefined) a.carte = carte;
        const t0 = cotonou('2026-10-09', '11:00');
        elle(a, t0, { texte: 'Je voudrais un rendez-vous' });
        elle(a, t0 + 1000, { touche: 'La même chose' });
        elle(a, t0 + 2000, { touche: 'Sam. 10 oct. 2026 · 9 h' });
        return elle(a, t0 + 3000, { touche: 'Je confirme' });
      };
      const s = laConfirmation('https://maps.app.goo.gl/AbCdEf12345?g_st=ac');
      vaut('la Maison sur Google Maps ferme la confirmation, apres le plan, par le site (la photo de Google ne part plus)',
        ['texte', 'image', 'Maison MND sur Google Maps : https://maisonmnd.com/venir/'], [s.messages[0]?.forme, s.messages[1]?.forme, s.messages[2]?.corps]);
      vrai('sans lien, aucune ligne', !confirme().includes('Google Maps'));
      vrai('un lien qui n est pas Google Maps ne part jamais', !confirme('https://exemple.com/piege').includes('exemple.com'));
      vaut('lienMapsWa : la branche d abord, puis les Parametres ; un lien sans g_st reste tel quel ; http et le reste refuses',
        ['https://maps.app.goo.gl/X1', 'https://www.google.com/maps/search/?api=1&query=6.37,2.46', '', 'https://maps.app.goo.gl/X2', ''],
        [lienMapsWa('https://maps.app.goo.gl/X1?g_st=ac', 'https://maps.app.goo.gl/X2'), lienMapsWa('https://www.google.com/maps/search/?api=1&query=6.37,2.46'),
          lienMapsWa('http://maps.app.goo.gl/X1', 'javascript:alert(1)'), lienMapsWa('', 'https://maps.app.goo.gl/X2'), lienMapsWa('https://maps.app.goo.gl.exemple.com/X')]);
      vrai('la fonction prend le lien de la branche du tour, puis celui des Parametres', lit(F_AUTO).includes('const carte = lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, maison.carte);')
        && lit(F_AUTO).includes("carte: typeof cfg?.mapsLink === 'string' ? cfg.mapsLink : '',"));
      return ecarts;
    },
    pannes: [
      { nom: 'le lien pour venir ne part pas', mute: [P(AUTO, "        ...(lienPourVenir ? [{ ...texte('confirme', lienPourVenir), accessoire: true }] : []),\n", '')] },
      { nom: 'le parametre de partage reste', mute: [P(AUTO, "      if (!u.searchParams.has('g_st')) return brut;", '      return brut;')] },
      { nom: 'un lien etranger passe', mute: [P(AUTO, '    if (!google.test(brut)) continue;', '    if (!brut) continue;')] },
      { nom: 'la fonction ignore le lien de la branche', mute: [P(F_AUTO, 'const carte = lienMapsWa(agenda?.lignes.branche.data?.mapsUrl, maison.carte);', 'const carte = lienMapsWa(maison.carte);')] },
    ],
  },
  /* ══ R35 · jamais Madame supposé, 13 octobre 2026 ══════════════════════ */
  {
    id: 'R35', nom: 'R35 jamais Madame suppose : une inconnue n est appelee de rien avant sa civilite, une fiche muette par son prenom seul, sans trace',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const b = scnInconnue(ORIGINAL);
      vaut('une inconnue : bonjour, sans Madame', 'Bonjour, bienvenue à la Maison MND. Comment pouvons-nous prendre soin de votre couronne ?', corps(b.s1));
      vaut('... quel entretien, sans Madame', 'Quel entretien souhaitez-vous ?', corps(b.s2));
      vrai('... la civilite choisie, elle est dite (Mlle Awa au recapitulatif)', corps(b.s6).startsWith('Voici votre rendez-vous, Mlle Awa :'), corps(b.s6));
      const muette: FicheDuNumero = { ...NAFFI, civilite: undefined };
      const p = parcours(ORIGINAL, NUM_NAFFI, [muette]);
      const t0 = cotonou('2026-10-09', '11:00');
      const s1 = elle(p, t0, { texte: 'Je voudrais un rendez-vous' });
      vrai('une fiche muette : son prenom seul, jamais Madame', corps(s1).startsWith('Bonjour Naffi, merci de votre message.') && !/Madame/.test(corps(s1)), corps(s1));
      const c = scnConnue(ORIGINAL);
      vrai('une fiche dite Madame : sa civilite est dite, Mme Naffi', corps(c.s1).startsWith('Bonsoir Mme Naffi, merci de votre message.'), corps(c.s1));
      vaut('sansAppelVide : virgules et espaces sans appel', ['Quel rituel souhaitez-vous ?', 'Bonjour, merci.', "C'est confirmé : retenu.", 'Voici les places.', 'Touchez, ou Parler.'],
        ['Quel rituel souhaitez-vous,  ?', 'Bonjour , merci.', "C'est confirmé,  : retenu.", 'Voici les places, .', 'Touchez, , ou Parler.'].map(sansAppelVide));
      return ecarts;
    },
    pannes: [
      { nom: 'la civilite perdue (le prenom seul)', mute: [P(AUTO, '    if (titulaire) return appelDe({ name: titulaire.nom, civilite: titulaire.civilite, auMasculin: titulaire.auMasculin });', '    if (titulaire) return prenomDuNomWa(titulaire.nom);')] },
      { nom: 'une inconnue redevient Madame', mute: [P(AUTO, "       ne suppose plus Madame : la phrase se dit sans appel (`sansAppelVide`). */\n    return '';", "       ne suppose plus Madame : la phrase se dit sans appel (`sansAppelVide`). */\n    return appelDe(null);")] },
      { nom: 'l appel vide laisse sa trace', mute: [P(AUTO, '  const propre = (corps: string): string => (appel() ? corps : sansAppelVide(corps));', '  const propre = (corps: string): string => corps;')] },
      { nom: 'une fiche muette redevient Madame', mute: [P('src/shared/civilite.ts', "  if (!connue) return prenom || 'Madame, Monsieur';", "  if (!connue) return prenom ? `Madame ${prenom}` : 'Madame';")] },
    ],
  },
  /* ══ R36 · Autre soin ouvre les soins du cheveu ; la réparation se joint à l'entretien, 13 octobre 2026 ═══ */
  {
    id: 'R36', nom: 'R36 Autre soin ouvre les soins du cheveu (DANDAN, VIVIVO, WEWE, GBIGBI) en francais ; la reparation se joint a l entretien le meme jour',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const p = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      const r1 = elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
      const autre = (r1.messages[0]?.lignes ?? []).find((l) => l.titre === 'Un soin');
      vaut('Un soin dit les soins qu il ouvre', 'Hydratation, activateur de pousse, purification et reconstruction', autre?.description);
      const s = elle(p, t0 + 2000, { touche: 'Un soin' });
      vrai('Autre soin : la liste des soins, en francais, sans Kids ni « avec votre produit »', corps(s) === 'Quel soin souhaitez-vous ?'
        && j(lignesDe(s)) === j(['Hydratation', 'Hydratation · Essentiel', 'Activateur de pousse', 'Purification', 'Reconstruction', 'Autre soin', 'Parler à la Maison']), `${corps(s)} ${lignesDe(s).join(' | ')}`);
      const v = elle(p, t0 + 3000, { touche: 'Activateur de pousse' });
      vaut('un soin choisi : un autre soin ?', 'encore', v.messages[0]?.etape);
      elle(p, t0 + 4000, { touche: "Non, c'est tout" });
      elle(p, t0 + 5000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      elle(p, t0 + 6000, { touche: 'Madame' });
      const recap = elle(p, t0 + 7000, { texte: 'Afi' });
      vrai('le recapitulatif dit le soin en francais', corps(recap).includes('Activateur de pousse (VÍVÍVÓ™ · Le Vivifiant)'), corps(recap));
      elle(p, t0 + 8000, { touche: 'Je confirme' });
      vaut('la pose porte le soin choisi', [['vivivo']], p.poses.map((x) => x.rdv.serviceIds));
      /* Dans la liste des soins, Autre soin passe la main. */
      const q = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(q, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(q, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(q, t0 + 2000, { touche: 'Un soin' });
      const main = elle(q, t0 + 3000, { touche: 'Autre soin' });
      vrai('depuis la liste des soins, Autre soin : une personne de la Maison', q.etat?.etape === 'main' && q.etat?.motifMain === 'autre-soin', corps(main));
      /* Entretenir ET reparer : la consultation de reparation dans Ajouter un soin. */
      const e = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(e, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(e, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(e, t0 + 2000, { touche: 'Lavage · Essentiel' });
      const aj = elle(e, t0 + 3000, { touche: 'Ajouter un soin' });
      const rep = (aj.messages[0]?.lignes ?? []).find((l) => l.titre === 'Réparer mes locks');
      vrai('Ajouter un soin propose la reparation, consultation d abord', !!rep && (rep.description ?? '').startsWith("consultation d'abord · KÒKÒ™ Suivi"), j(rep));
      const r2 = elle(e, t0 + 4000, { touche: 'Réparer mes locks' });
      vaut('la reparation ajoutee : un autre soin ?', 'encore', r2.messages[0]?.etape);
      elle(e, t0 + 5000, { touche: "Non, c'est tout" });
      elle(e, t0 + 6000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      elle(e, t0 + 7000, { touche: 'Madame' });
      const re = elle(e, t0 + 8000, { texte: 'Afi' });
      vrai('le recapitulatif dit l entretien et la consultation', corps(re).includes('Lavage rituel (KLƆKLƆ™ Essentiel) et Consultation (KÒKÒ™ Suivi)'), corps(re));
      elle(e, t0 + 9000, { touche: 'Je confirme' });
      vaut('la pose porte les deux', [['plt-05', 'sv-koko-sui']], e.poses.map((x) => x.rdv.serviceIds));
      vaut('un sous-titre ne se colle pas au geste sans point', ['Activateur de pousse', 'Reconstruction · Protéiné'], [titreEnFrancaisWa('VÍVÍVÓ™ · Le Vivifiant'), titreEnFrancaisWa('GBÌGBÌ™ Protéiné · Le Soin', 26)]);
      return ecarts;
    },
    pannes: [
      { nom: 'Autre soin passe toujours la main', mute: [P(AUTO, "            if (!base.panier.dansLesSoins && soinsDuCheveu().some((ids) => !dejaLa(ids))) return dire(msgRituel(false, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}));\n", '')] },
      { nom: 'la reparation ne se joint pas', mute: [P(AUTO, '    const liste = [...restes, ...soins, ...(r ? [[r]] : [])];', '    const liste = [...restes, ...soins];')] },
      { nom: 'les versions Kids entrent dans la liste des soins', mute: [P(AUTO, "&& !/\\bkids\\b|avec votre produit/i.test(s.name))", '&& true)')] },
      { nom: 'le sous-titre se colle au geste', mute: [P(AUTO, '    : sansNiveau ? [`${g.court} · ${variante}`, g.long, g.court]\n', '    : sansNiveau ? [`${g.court} · ${variante}`, `${g.court} ${variante}`, g.long, g.court]\n')] },
    ],
  },
  /* ══ R37 · rendre à l'automate le fait reprendre tout de suite, 13 octobre 2026 ═══ */
  {
    id: 'R37', nom: 'R37 rendu a l automate, il reprend tout de suite l etape ou il etait ; jamais sans main rendue, ni pendant une pause, ni apres une pose ; seul le personnel le demande, fenetre de 24 h ouverte',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const p = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(p, t0 + 2000, { touche: 'Lavage · Essentiel' });
      elle(p, t0 + 3000, { touche: "Non, c'est tout" });
      elle(p, t0 + 4000, { touche: 'Parler à la Maison' });
      vaut('Parler a la Maison : la main passe', 'main', p.etat?.etape);
      const ms1 = t0 + 60000;
      vrai('sans main rendue, la reprise ne dit rien', !repriseDuFil(p.etat, ctxDe(p, ms1)).pris);
      /* Un fil EN COURS dont l'équipe a pris la main (« Reprendre la main ») : rien. */
      const q = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(q, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(q, t0 + 1000, { touche: 'Entretenir mes locks' });
      q.main = { pauseLe: isoDe(t0 + 2000), jusqua: isoDe(t0 + 24 * 3600000) };
      vrai('pendant une pause de l equipe sur un fil en cours, rien', q.etat?.etape === 'rituel' && !repriseDuFil(q.etat, ctxDe(q, t0 + 5000)).pris);
      p.main = { rendueLe: isoDe(t0 + 50000) };
      const r = repriseDuFil(p.etat, ctxDe(p, ms1));
      vrai('rendue : il renvoie les places, a neuf, pas la relance', r.pris && r.messages[0]?.etape === 'places' && corps(r) === 'Voici les prochaines places.', `${r.pris} ${corps(r)}`);
      p.etat = r.etat;
      p.envoyes.push(...r.messages);
      const suite = elle(p, ms1 + 60000, { touche: 'Mar. 13 oct. 2026 · 9 h' });
      vaut('la liste renvoyee se touche : la civilite vient', 'civilite', suite.messages[0]?.etape);
      const b = scnInconnue(ORIGINAL);
      b.p.main = { rendueLe: isoDe(b.t0 + 3600000) };
      vrai('apres une pose, rien a reprendre', !repriseDuFil(b.p.etat, ctxDe(b.p, b.t0 + 3600000 + 60000)).pris);
      const fn = lit(F_AUTO);
      vrai('la fonction : seul le personnel demande la reprise (is_staff, refus sinon)', /if \(demande\?\.reprise && service && urlBase && anon && recue\) \{[\s\S]{0,300}commeAppelant\.rpc\('is_staff'\);\s*if \(errStaff \|\| estPersonnel !== true\) return jsonCors\(\{ repris: false, erreur: 'réservé au personnel' \}, 403\);/.test(fn));
      vrai('la fonction : la fenetre de 24 heures fermee, rien ne part', fn.includes("if (!Number.isFinite(quand) || ms - quand >= JOUR_WA) return { repris: false, raison: 'fenetre' };"));
      vrai('la fonction : elle attend la main rendue par le Trone', fn.includes('if (Number.isFinite(voulue) && Number.isFinite(rendue) && rendue >= voulue) break;'));
      vrai('le Trone demande la reprise en rendant', lit(ECRAN_COMPOSEUR).includes("supabase.functions.invoke('whatsapp-automate', { body: { reprise: { numero: fil.numero, tiroir: fil.tiroir, rendueLe } } })"));
      return ecarts;
    },
    pannes: [
      { nom: 'la reprise ne lit pas la main rendue', mute: [P(AUTO, "  const courante = tour || reprise ? etapeCourante(ancien, ctx.main, ms, pauseH) : (ancien?.etape ?? 'repos');", "  const courante = tour ? etapeCourante(ancien, ctx.main, ms, pauseH) : (ancien?.etape ?? 'repos');")] },
      { nom: 'la reprise passe pendant une pause', mute: [P(AUTO, '  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir) || pauseActive(ctx.main, ctx.maintenantMs)) return rien(ancien);', '  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return rien(ancien);')] },
      { nom: 'n importe quel jeton demande la reprise', mute: [P(F_AUTO, "      if (errStaff || estPersonnel !== true) return jsonCors({ repris: false, erreur: 'réservé au personnel' }, 403);\n", '')] },
      { nom: 'la reprise ecrit hors de la fenetre', mute: [P(F_AUTO, "  if (!Number.isFinite(quand) || ms - quand >= JOUR_WA) return { repris: false, raison: 'fenetre' };\n", '')] },
      { nom: 'le Trone ne demande pas la reprise', mute: [P(ECRAN_COMPOSEUR, "    void supabase.functions.invoke('whatsapp-automate', { body: { reprise: { numero: fil.numero, tiroir: fil.tiroir, rendueLe } } })\n", '    void Promise.resolve({ data: {} })\n')] },
    ],
  },
  /* ══ R38 · le conseil : « Une question ? », les réponses validées, mot pour mot, 14 octobre 2026 ═══ */
  {
    id: 'R38', nom: 'R38 le conseil : Une question ? n offre que les reponses validees et sans faute, chacune part mot pour mot avec les prix du catalogue du jour, et Reserver mene ou la direction l a dit',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const sans = parcours(ORIGINAL, NUM_INCONNUE, []);
      const b0 = elle(sans, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      vrai('sans conseil, le menu reste celui d avant', !lignesDe(b0).includes('Une question ?'), lignesDe(b0));
      const p = avecConseil(parcours(ORIGINAL, NUM_INCONNUE, []));
      const s1 = elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      vrai('le menu offre Une question ?', lignesDe(s1).includes('Une question ?'), lignesDe(s1));
      const s2 = elle(p, t0 + 1000, { touche: 'Une question ?' });
      vaut('la liste : les seules reponses validees, sans prix tape, sans prix introuvable', ['Prix d’une création', 'Prix d’un entretien', 'Durée d’une création', 'Parler à la Maison'], lignesDe(s2));
      const s3 = elle(p, t0 + 2000, { touche: 'Prix d’une création' });
      vaut('la reponse part mot pour mot, les jetons remplaces par le catalogue du jour', 'Une création se chiffre après la consultation Origine (15 000 F). À titre de repère, une création commence à 80 000 F.', corps(s3));
      vaut('sous la reponse : Reserver, Une autre question, la Maison', ['Réserver', 'Une autre question', 'Parler à la Maison'], boutonsDe(s3));
      const m3 = s3.messages[0];
      vrai('le message porte sa reponse et ses prix du catalogue', !!m3 && m3.reponseId === 'r-prix-creation' && m3.prixDuCatalogue === true);
      vrai('Meta l accepte, et le juge ne le laisse passer que parce que ses prix viennent du catalogue', !!m3 && respecteMeta(m3).length === 0 && texteSain(m3.corps, true).length === 0 && texteSain(m3.corps).length > 0);
      const s4 = elle(p, t0 + 3000, { touche: 'Réserver' });
      vaut('Reserver mene ou la direction l a dit : la consultation de creation, ses places', 'places', s4.messages[0]?.etape);
      vrai('une reponse sans jeton part aussi sans les prix du jour', texteDeLaReponse(conseilDeLaMaison(CONSEIL_DU_BANC).reponses[2]) === 'Quelques heures ou deux jours, selon la méthode.');
      return ecarts;
    },
    pannes: [
      { nom: 'un brouillon part', mute: [P(AUTO, "  if (r.etat !== 'validee') return null;\n  const aDesJetons", '  const aDesJetons')] },
      { nom: 'un prix tape a la main passe', mute: [P(AUTO, '  for (const x of texteSain(sansJetons)) f.push(', '  for (const x of texteSain(sansJetons, true)) f.push(')] },
      { nom: 'un prix introuvable passe', mute: [P(AUTO, "      if (!((prix[ref] ?? 0) > 0)) f.push(`un prix introuvable au catalogue (${ref})`);\n", '')] },
      { nom: 'le menu oublie Une question ?', mute: [P(AUTO, "      ...(envoyables().length > 0 ? [{ id: choix('questions'), titre: 'Une question ?' }] : []),\n", '')] },
      { nom: 'la reponse part sans ses prix', mute: [P(AUTO, '`${salutDuConseil(avecSalut)}${e.texte}`', '`${salutDuConseil(avecSalut)}${e.r.texte}`')] },
      { nom: 'Reserver ne mene plus ou la direction l a dit', mute: [P(AUTO, "            if (arg === 'entretien' || arg === 'creation' || arg === 'reparation' || arg === 'enfant') return choisisLeBesoin(arg);\n", '')] },
    ],
  },
  /* ══ R39 · le conseil lit les questions écrites, et se tait où il doit, 14 octobre 2026 ═══ */
  {
    id: 'R39', nom: 'R39 le conseil lit une question ecrite au repos (et salue une inconnue), propose la liste a egalite, repond meme quand la Maison a ecrit ou qu un rendez-vous attend, se tait sur un rendez-vous existant sans question reconnue, et la nuit seulement accuse une question qu il ne sait pas',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const jour = cotonou('2026-10-09', '10:12');
      const nuit = cotonou('2026-10-09', '23:15');
      const a = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      const sa = elle(a, jour, { texte: 'Bonjour, combien pour des microlocks ?' });
      vrai('une cliente connue : la reponse validee, tout de suite', sa.pris && sa.messages[0]?.reponseId === 'r-prix-creation', corps(sa));
      const b = avecConseil(parcours(ORIGINAL, NUM_INCONNUE, []));
      const sb2 = elle(b, nuit, { texte: 'Bonsoir, c’est combien pour des microlocks ?' });
      vrai('une inconnue, la nuit : saluee, puis la reponse', corps(sb2).startsWith('Bonsoir, bienvenue à la Maison MND.\n\nUne création se chiffre'), corps(sb2));
      const c = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      const sc = elle(c, jour, { texte: 'C’est combien ?' });
      vaut('deux reponses a egalite : la liste des deux', ['Prix d’une création', 'Prix d’un entretien', 'Parler à la Maison'], lignesDe(sc));
      vrai('la liste dit pourquoi', corps(sc).includes('plusieurs sujets'), corps(sc));
      const d = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      d.parole = isoDe(jour - 2 * 3600000);
      const sd = elle(d, jour, { texte: 'Combien pour des microlocks ?' });
      vrai('la Maison a ecrit cette semaine : il repond quand meme (14 octobre 2026)', sd.pris && sd.messages[0]?.reponseId === 'r-prix-creation');
      const e = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [{ ...NAFFI, prochainRdv: { date: '2026-10-17', time: '10:00' } }]));
      const se = elle(e, jour, { texte: 'Combien pour des microlocks ?' });
      vrai('un rendez-vous attend : il repond quand meme (14 octobre 2026)', se.pris && se.messages[0]?.reponseId === 'r-prix-creation');
      const k = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      vrai('elle parle de son rendez-vous sans question reconnue : la Maison repond, pas de parcours', !elle(k, jour, { texte: 'Je confirme mon rendez-vous de samedi' }).pris);
      const k2 = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      const sk2 = elle(k2, jour, { texte: 'Je confirme mon rendez-vous de samedi, et combien pour des microlocks ?' });
      vrai('... avec une question reconnue : il y repond', sk2.pris && sk2.messages[0]?.reponseId === 'r-prix-creation', corps(sk2));
      const f = avecConseil(parcours(ORIGINAL, NUM_INCONNUE, []));
      const sf = elle(f, nuit, { texte: 'Vous faites aussi les tissages ?' });
      vrai('la nuit, une question qu il ne sait pas : l accuse, la main passe', sf.pris && f.etat?.etape === 'main' && f.etat?.motifMain === 'question' && corps(sf).includes('vous répond'), `${sf.pris} ${f.etat?.etape} ${corps(sf)}`);
      const g = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      vrai('le jour, une question qu il ne sait pas : la Maison la lit, comme avant', !elle(g, jour, { texte: 'Vous faites aussi les tissages ?' }).pris);
      const h = parcours(ORIGINAL, NUM_INCONNUE, []);
      vrai('sans conseil, la nuit, rien ne change : il se tait', !elle(h, nuit, { texte: 'Vous faites aussi les tissages ?' }).pris);
      return ecarts;
    },
    pannes: [
      { nom: 'le conseil ne parle jamais au repos', mute: [P(AUTO, '  } else if (leConseilParle(tour.texte, ctx.conseil)) {', '  } else if (false) {')] },
      { nom: 'la Maison qui a ecrit fait de nouveau taire le conseil', mute: [P(AUTO, '  } else if (mots.deplacer || mots.annuler) {\n    /* Un prix dans la même phrase', '  } else if (laMaisonAParle(ctx)) {\n    parle = false;\n  } else if (mots.deplacer || mots.annuler) {\n    /* Un prix dans la même phrase')] },
      { nom: 'la nuit, la question inconnue reste sans accuse', mute: [P(AUTO, '          if (quand === null) return silence();\n          base.prisLe = maintenant;\n          return laMain', '          return silence();\n          base.prisLe = maintenant;\n          return laMain')] },
      { nom: 'le jour, la question inconnue recoit l accuse', mute: [P(AUTO, '          if (quand === null) return silence();\n', '')] },
      { nom: 'sur un rendez-vous existant, la question reconnue reste sans reponse', mute: [P(AUTO, '    parle = leConseilParle(tour.texte, ctx.conseil);\n', '    parle = false;\n')] },
      { nom: 'sur je confirme, il ouvre un parcours', mute: [P(AUTO, '    parle = leConseilParle(tour.texte, ctx.conseil);\n', '    parle = true;\n')] },
      { nom: 'a egalite, il choisit seul', mute: [P(AUTO, "    if (trouvees.length > 1) return dire(msgQuestions(0, trouvees, avecSalut), 'question');", '    if (trouvees.length > 1) return dire(msgReponse(trouvees[0], avecSalut));')] },
    ],
  },
  /* ══ R40 · le cuir chevelu ne se soigne pas à distance, 14 octobre 2026 ═══ */
  {
    id: 'R40', nom: 'R40 le cuir chevelu : aucun conseil, ni produit ; la consultation, le medecin, et la main passe, au repos comme en plein parcours ; les mots de la direction font foi',
    eprouve: () => {
      const { ecarts, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const a = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      const sa = elle(a, t0, { texte: 'Bonjour, j’ai des plaques et ça gratte beaucoup sous mes locks, je mets quoi ?' });
      vrai('au repos : la main passe, motif cuir chevelu', a.etat?.etape === 'main' && a.etat?.motifMain === 'sante', `${a.etat?.etape} ${a.etat?.motifMain}`);
      vrai('elle lit : pas de soin a distance, le medecin ou le dermatologue', corps(sa).includes('ne conseille pas de soin à distance') && corps(sa).includes('dermatologue'), corps(sa));
      vrai('aucune reponse de la Maison, aucun prix', !sa.messages[0]?.reponseId && !sa.messages[0]?.prixDuCatalogue);
      const b = avecConseil(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(b, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(b, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(b, t0 + 2000, { texte: 'mon cuir chevelu me démange' });
      vrai('en plein parcours aussi', b.etat?.etape === 'main' && b.etat?.motifMain === 'sante', `${b.etat?.etape} ${b.etat?.motifMain}`);
      const c = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      elle(c, t0, { texte: 'Combien pour un resserrage ? ça me gratte beaucoup' });
      vrai('le cuir chevelu passe devant une reponse reconnue', c.etat?.motifMain === 'sante', c.etat?.motifMain);
      const d = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]), { ...CONSEIL_DU_BANC, motsSante: ['pellicules'] });
      elle(d, t0, { texte: 'J’ai des pellicules partout' });
      vrai('les mots ecrits par la direction font foi', d.etat?.motifMain === 'sante', d.etat?.motifMain);
      return ecarts;
    },
    pannes: [
      { nom: 'le cuir chevelu est ignore', mute: [P(AUTO, '    if (lu.sante) {', '    if (false) {')] },
      { nom: 'le medecin n est plus nomme', mute: [P(AUTO, " Si la gêne est forte ou s'étend, un médecin ou un dermatologue saura vous examiner.", '')] },
      { nom: 'les mots de la direction sont ignores', mute: [P(AUTO, '  return { reponses, motsSante: sante.length > 0 ? sante : [...MOTS_SANTE_LIVRES] };', '  return { reponses, motsSante: [...MOTS_SANTE_LIVRES] };')] },
    ],
  },
  /* ══ R41 · en plein parcours, et après une réponse, 14 octobre 2026 ═══ */
  {
    id: 'R41', nom: 'R41 une question de prix en plein parcours recoit sa reponse et Continuer reprend l etape ; sans conseil la main passe comme avant ; merci ne relance rien ; la fonction lit le conseil, juge le prix du catalogue et trace la reponse',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-09', '10:12');
      const p = avecConseil(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p, t0 + 1000, { touche: 'Entretenir mes locks' });
      const s3 = elle(p, t0 + 2000, { texte: 'c’est combien le resserrage ?' });
      vaut('la reponse du resserrage, au prix du jour', 'Le resserrage est à 25 000 F pour un Medium.', corps(s3));
      vaut('Continuer, plutot que Reserver', ['Continuer', 'Une autre question', 'Parler à la Maison'], boutonsDe(s3));
      const s4 = elle(p, t0 + 3000, { touche: 'Continuer' });
      vaut('Continuer : la liste des rituels revient', 'rituel', s4.messages[0]?.etape);
      const q = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(q, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(q, t0 + 1000, { touche: 'Entretenir mes locks' });
      const q3 = elle(q, t0 + 2000, { texte: 'c’est combien le resserrage ?' });
      vrai('sans conseil, comme avant : la main passe sans un mot', q3.messages.length === 0 && q.etat?.etape === 'main' && q.etat?.motifMain === 'prix', `${q3.messages.length} ${q.etat?.etape} ${q.etat?.motifMain}`);
      const r = avecConseil(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      elle(r, t0, { texte: 'Combien pour des microlocks ?' });
      const avant = r.envoyes.length;
      const merci = elle(r, t0 + 60000, { texte: 'Merci beaucoup !' });
      vrai('merci apres une reponse : rien ne repart, la Maison le lit', !merci.pris && r.envoyes.length === avant);
      const resa = elle(r, t0 + 120000, { texte: 'Je voudrais réserver samedi' });
      vrai('une envie de reserver apres une reponse ouvre le parcours', ['meme', 'besoin'].includes(resa.messages[0]?.etape ?? ''), resa.messages[0]?.etape);
      const fn = lf(lit(F_AUTO));
      vrai('la fonction lit les reponses de la Maison', fn.includes("'mnd_house_identity', 'mnd_reponses_maison', 'mnd_assistant_wa', 'mnd_tri_des_messages', 'mnd_model_bands', 'mnd_model_band_sets']") && fn.includes("conseil: conseilDeLaMaison(docs.get('mnd_reponses_maison')),"));
      vrai('la fonction donne les prix du catalogue du jour au tour', fn.includes('...(agenda ? { prix: prixDuCatalogue(agenda.lignes.services) } : {}),'));
      vrai('le juge de la fonction ne laisse passer un prix que venu du catalogue', (fn.match(/texteSain\(toutLeTexteWa\(m\), m\.prixDuCatalogue === true\)/g) ?? []).length === 3 && !/texteSain\(toutLeTexteWa\(m\)\)/.test(fn));
      vrai('la trace porte la reponse envoyee', fn.includes('...(o.m.reponseId ? { reponse: o.m.reponseId } : {}),'));
      return ecarts;
    },
    pannes: [
      { nom: 'Continuer est perdu', mute: [P(AUTO, '    const suite = base.panier.reprendre\n', '    const suite = false && base.panier.reprendre\n')] },
      { nom: 'en plein parcours, le prix passe la main malgre le conseil', mute: [P(AUTO, '    if (mots.prix && !leConseilParle(tour.texte, ctx.conseil)) return', '    if (mots.prix) return')] },
      { nom: 'merci relance', mute: [P(AUTO, "      return silence();\n    }\n    /* UNE QUESTION QUI N'EST PAS", "      return ecart();\n    }\n    /* UNE QUESTION QUI N'EST PAS")] },
      { nom: 'le juge de la fonction oublie le catalogue', mute: [P(F_AUTO, 'texteSain(toutLeTexteWa(m), m.prixDuCatalogue === true)', 'texteSain(toutLeTexteWa(m))')] },
      { nom: 'la trace oublie la reponse', mute: [P(F_AUTO, '      ...(o.m.reponseId ? { reponse: o.m.reponseId } : {}),\n', '')] },
      { nom: 'la fonction ne lit pas le conseil', mute: [P(F_AUTO, "'mnd_house_identity', 'mnd_reponses_maison', 'mnd_assistant_wa', 'mnd_tri_des_messages', 'mnd_model_bands', 'mnd_model_band_sets']", "'mnd_house_identity', 'mnd_assistant_wa', 'mnd_tri_des_messages', 'mnd_model_bands', 'mnd_model_band_sets']")] },
    ],
  },
  /* ══ R42 · au Trône : les brouillons, la validation de la direction, 14 octobre 2026 ═══ */
  {
    id: 'R42', nom: 'R42 au Trone : les brouillons de depart sont des brouillons lisibles et sans faute de la Maison ; toucher au sens d une reponse validee la renvoie en brouillon ; la direction seule valide, jamais une reponse fautive ; un fil dit pourquoi l automate se tait',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const lus = conseilDeLaMaison({ reponses: BROUILLONS_DU_CONSEIL });
      vaut('les treize brouillons se lisent tous', 13, lus.reponses.length);
      vrai('tous en brouillon : rien ne part avant la validation', BROUILLONS_DU_CONSEIL.every((r) => r.etat === 'brouillon'));
      const prixDesJetons: Record<string, number> = {};
      for (const r of BROUILLONS_DU_CONSEIL) for (const m of r.texte.matchAll(/\{prix:([^}]+)\}/g)) prixDesJetons[m[1]] = 1000;
      const fautifs = lus.reponses.filter((r) => fautesDeLaReponse(r, prixDesJetons).length > 0).map((r) => r.id);
      vaut('seule la longueur reste a ecrire par la Maison', ['r-longueur'], fautifs);
      const c0 = { reponses: [{ ...BROUILLONS_DU_CONSEIL[4] }] };
      const c1 = valideLaReponse(c0, 'r-consultation', 'direction', '2026-10-14T10:00:00Z');
      vaut('valider pose la date et la main', ['validee', '2026-10-14T10:00:00Z'], [c1.reponses[0].etat, c1.reponses[0].valideeLe]);
      const c2 = modifieLaReponse(c1, 'r-consultation', { texte: 'Pour une création, oui.' });
      vrai('changer le texte d une reponse validee la renvoie en brouillon, sans sa date', c2.reponses[0].etat === 'brouillon' && !c2.reponses[0].valideeLe);
      const c3 = modifieLaReponse(c1, 'r-consultation', { ordre: 7 });
      vrai('changer son rang ne la devalide pas', c3.reponses[0].etat === 'validee');
      const ecran = lf(lit('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx'));
      vrai('la direction seule voit Valider', ecran.includes("{direction && r.etat !== 'validee' && ("));
      vrai('Valider se refuse a une reponse fautive', ecran.includes('variant="copper" size="sm" disabled={fautes.length > 0}'));
      vrai('l onglet vit dans les Conversations', lf(lit(ECRAN_CONV)).includes('<ReponsesDeLaMaison'));
      const conv = lf(lit(ECRAN_COMPOSEUR));
      vrai('un fil qu il n a jamais mene dit la main de l equipe, et la rend', conv.includes('if (pauseActive(mainDuFil, Date.now())) {') && conv.includes('rendsALAutomate(fil.numero, { branchId: branch.id });'));
      vrai('un numero que l automate ne sert pas le dit, avec le reglage', conv.includes('if (!numeroServi(reglageAutomate, fil.numero, fil.tiroir)) {') && conv.includes('L’automate ne répond pas à ce numéro'));
      return ecarts;
    },
    pannes: [
      { nom: 'toucher une reponse validee la laisse validee', mute: [P('src/shared/conseil-wa.ts', "      if (!sensChange || r.etat !== 'validee') return neuve;", '      return neuve;')] },
      { nom: 'tout le personnel valide', mute: [P('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx', "{direction && r.etat !== 'validee' && (", "{r.etat !== 'validee' && (")] },
      { nom: 'une reponse fautive se valide', mute: [P('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx', 'variant="copper" size="sm" disabled={fautes.length > 0}', 'variant="copper" size="sm" disabled={false}')] },
      { nom: 'la main de l equipe redevient invisible', mute: [P(ECRAN_COMPOSEUR, 'if (pauseActive(mainDuFil, Date.now())) {', 'if (false) {')] },
      { nom: 'un numero non servi ne se dit plus', mute: [P(ECRAN_COMPOSEUR, 'if (!numeroServi(reglageAutomate, fil.numero, fil.tiroir)) {', 'if (false) {')] },
      { nom: 'un brouillon livre deja valide', mute: [P('src/shared/conseil-wa.ts', "  id, titre, ...(description ? { description } : {}), mots, texte, etat: 'brouillon',", "  id, titre, ...(description ? { description } : {}), mots, texte, etat: 'validee',")] },
    ],
  },
  /* ══ R43 · la réception : l'assistant qui répond là où l'automate se taisait, 27 octobre 2026 ═══ */
  {
    id: 'R43', nom: 'R43 la reception : elle ne parle que la ou le juge se tait, sur un numero qu elle sert, sans main de l equipe ; sa reponse clot le fil (l alarme se tait) ou passe la main ; les calibres se touchent ; un rendez-vous ouvre le parcours ; jamais un silence',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-27', '23:40');
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const tour = tourDeLaCliente([{ waId: 'wamid.merci', quand: isoDe(t0), texte: 'Merci beaucoup pour hier', type: 'text', sens: 'entrant' }], []);
      const ctx = ctxDe(p, t0);
      vaut('un merci : le juge se tait', 'silence', jugeLaParole(null, tour, ctx).parole);
      const TOUS = reglageDeLaReception({ mode: 'tous' });
      vaut('le reglage : livre en essai, un mode inconnu redevient essai', ['essai', 'essai', 'tous', 'non'],
        [reglageDeLaReception(undefined).mode, reglageDeLaReception({ mode: 'robot' }).mode, TOUS.mode, reglageDeLaReception({ mode: 'non' }).mode]);
      vaut('qui elle sert : essai sans le numero non, essai avec oui, tous oui, non non', [false, true, true, false], [
        laReceptionPeutParler(null, tour, ctx, reglageDeLaReception({ mode: 'essai' })),
        laReceptionPeutParler(null, tour, { ...ctx, reglage: { ...ctx.reglage, numerosEssai: [NUM_NAFFI] } }, reglageDeLaReception({ mode: 'essai' })),
        laReceptionPeutParler(null, tour, ctx, TOUS),
        laReceptionPeutParler(null, tour, ctx, reglageDeLaReception({ mode: 'non' })),
      ]);
      const pause: MainDuFil = { numero: NUM_NAFFI, pauseLe: isoDe(t0 - 3600000), jusqua: isoDe(t0 + 3600000) } as MainDuFil;
      const mainPassee = { ...reponseDeLaReception(null, tour, ctx, { texte: 'x', suite: 'equipe' }).etat };
      vaut('jamais l equipe, jamais pendant la main de l equipe, jamais apres une main passee, jamais un tour perime', [false, false, false, false], [
        laReceptionPeutParler(null, tour, { ...ctx, tiroir: 'equipe' }, TOUS),
        laReceptionPeutParler(null, tour, { ...ctx, main: pause }, TOUS),
        laReceptionPeutParler(mainPassee, tour, ctx, TOUS),
        laReceptionPeutParler(null, tour, { ...ctx, maintenantMs: t0 + 20 * 60000 }, TOUS),
      ]);
      const rien = reponseDeLaReception(null, tour, ctx, { texte: 'Avec plaisir, Mme Naffi. À très bientôt à la Maison.', suite: 'rien' });
      vaut('rien : son mot part tel quel, signe de la reception, le fil se dit clos', [true, 'Avec plaisir, Mme Naffi. À très bientôt à la Maison.', true, true, 'clos'],
        [rien.pris, rien.messages[0]?.corps, rien.messages[0]?.deLaReception === true, rien.messages[0]?.prixDuCatalogue === true, rien.etat.etape]);
      vaut('... et l alarme se tait : le fil est fini, son mot traite', ['fini', true], [tenuParLAutomate(rien.etat, null, t0), silenceDeLAlarme('fini', rien.etat, tour.quand, t0)]);
      const eq = reponseDeLaReception(null, tour, ctx, { texte: 'Merci de nous le dire. Une personne de la Maison vous rappelle demain avant 10 h.', suite: 'equipe' });
      vaut('equipe : la main passe, l equipe est prevenue, son mot dit qui prend le relais', ['main', 'question', 'main', 'Merci de nous le dire. Une personne de la Maison vous rappelle demain avant 10 h.', true],
        [eq.etat.etape, eq.etat.motifMain, eq.alerte ? 'main' : null, eq.messages[0]?.corps, eq.messages[0]?.deLaReception === true]);
      const cal = reponseDeLaReception(null, tour, ctx, { texte: 'Combien de locks portez-vous, approximativement ?', suite: 'calibre', lignes: [{ id: 'calibre:jumbo', titre: 'Jumbo', description: 'jusqu’à 80 locks' }, { id: 'calibre:inconnu', titre: 'Je ne sais pas' }] });
      vaut('calibre : une liste a toucher, ses calibres, et toujours la Maison', ['liste', 'Choisir mon calibre', ['Jumbo', 'Je ne sais pas', 'Parler à la Maison'], 'clos'],
        [cal.messages[0]?.forme, cal.messages[0]?.bouton, (cal.messages[0]?.lignes ?? []).map((l) => l.titre), cal.etat.etape]);
      const idJumbo = cal.messages[0]?.lignes?.[0]?.id ?? '';
      vrai('les calibres portent l identifiant de la Maison, sans quoi le toucher se perd', /^MND:\d+:calibre:jumbo$/.test(idJumbo), idJumbo);
      const touche = tourDeLaCliente([{ waId: 'wamid.cal', quand: isoDe(t0 + 60000), texte: 'Jumbo', type: 'interactive', sens: 'entrant', bouton: { id: idJumbo, texte: 'Jumbo' } }], cal.etat.traites);
      const ctx2 = ctxDe(p, t0 + 60000);
      vaut('le calibre touche repasse par le juge, qui se tait, et la reception reprend', ['silence', true], [jugeLaParole(cal.etat, touche, ctx2).parole, laReceptionPeutParler(cal.etat, touche, ctx2, TOUS)]);
      const tp = tourPourLeParcours(tour);
      const s = etapeSuivante(null, tp, ctx);
      vaut('un rendez-vous : son intention dite simplement ouvre le parcours', ['parle', true], [jugeLaParole(null, tp, ctx).parole, ['meme', 'besoin', 'qui', 'rituel'].includes(s.messages[0]?.etape ?? '')]);
      vrai('... et son mot precede la liste, signe de la reception', prefaceDeLaReception('Avec plaisir.', 'besoin').deLaReception === true);
      const ouvert = secoursDeLaReception(cotonou('2026-10-27', '10:00'), SEMAINE, []);
      const ferme = secoursDeLaReception(cotonou('2026-10-26', '22:00'), SEMAINE, []);
      vaut('jamais un silence : le secours dit quand la Maison repond, et la main passe', ['equipe', true, true],
        [ferme.suite, /dans un instant/.test(ouvert.texte), /^Merci pour votre message\. La Maison vous répond /.test(ferme.texte)]);
      const fn = lf(lit(F_AUTO));
      vrai('la fonction ne demande la reception que la ou elle peut parler', fn.includes('if (!laReceptionPeutParler(fil, tour, ctxLeger, reglageDeLaReception(docs.get(CLE_DE_LA_RECEPTION)))) return { pris: false };') && fn.includes('reception = await demandeALaReception(o, { tour, fiches, docs, ms });'));
      vrai('la fonction appelle reception-wa avec sa cle, et prend le secours sans reponse sure', fn.includes('`${base}/functions/v1/reception-wa`') && (fn.match(/return secours\(\);/g) ?? []).length >= 3);
      vrai('un mot refuse par les juges laisse place au secours', fn.includes('if (direct && sortie.messages.some((m) => juge2(m).length > 0)) {'));
      vrai('la trace dit Assistant Maison et se compte', fn.includes("parQui: o.m.deLaReception ? 'Assistant Maison' : 'Le Trône',") && fn.includes('...(o.m.deLaReception ? { reception: true } : {}),'));
      return ecarts;
    },
    pannes: [
      { nom: 'en essai, la reception sert un numero non liste', mute: [P(AUTO, "  if (r.mode === 'essai') return numerosEssai.some((n) => cleWa(n) === cleWa(numero));", "  if (r.mode === 'essai') return true;")] },
      { nom: 'la reception parle pendant la main de l equipe', mute: [P(AUTO, "  if (pauseActive(ctx.main, ms)) return false;\n  if (tour.waIds.length === 0) return false;", "  if (tour.waIds.length === 0) return false;")] },
      { nom: 'la reception parle apres une main passee', mute: [P(AUTO, "  return etapeCourante(etat, ctx.main, ms, ctx.reglage.pauseHeures) !== 'main';", '  return true;')] },
      { nom: 'sa reponse laisse le fil au repos : l alarme sonne', mute: [P(AUTO, "    passe('clos');\n    /* LE CHEMIN (30 octobre 2026)", "    /* LE CHEMIN (30 octobre 2026)")] },
      { nom: 'sa reponse ne se signe plus', mute: [P(AUTO, '    const signe = (m: MessageSortant): MessageSortant => ({ ...m, deLaReception: true, prixDuCatalogue: true });', '    const signe = (m: MessageSortant): MessageSortant => m;')] },
      { nom: 'equipe ne passe pas la main', mute: [P(AUTO, "    if (r.suite === 'equipe') {\n      const s = laMain('question', true, r.texte, true);", "    if (false) {\n      const s = laMain('question', true, r.texte, true);")] },
      { nom: 'la fonction ne demande jamais la reception', mute: [P(F_AUTO, 'reception = await demandeALaReception(o, { tour, fiches, docs, ms });', "reception = { texte: '', suite: 'rien' };")] },
      { nom: 'un mot refuse laisse la cliente sans reponse', mute: [P(F_AUTO, 'if (direct && sortie.messages.some((m) => juge2(m).length > 0)) {', 'if (false) {')] },
      { nom: 'la trace ne dit plus Assistant Maison', mute: [P(F_AUTO, "parQui: o.m.deLaReception ? 'Assistant Maison' : 'Le Trône',", "parQui: 'Le Trône',")] },
      { nom: 'les calibres gardent leur identifiant court : le toucher se perd', mute: [P(AUTO, "id: l.id.startsWith('calibre:') ? choix('calibre', l.id.slice('calibre:'.length)) : l.id", 'id: l.id')] },
      { nom: 'un calibre touche relance le parcours au lieu de la reception', mute: [P(AUTO, "    parle = lisLeChoix(tour.choix.id)?.geste !== 'calibre';", '    parle = true;')] },
    ],
  },

  /* ══ R44 · une main passée par la réception n'arrête pas une réservation, 28 octobre 2026 ═══
     L'essai de Yéman, à 0 h 41 : sur « Bonjour », la réception a passé la
     main à l'équipe, la Maison fermée ; « Je veux un RDV » puis « Pour le
     jeudi à 9h » sont restés sans réponse. */
  {
    id: 'R44', nom: 'R44 la main de la reception : une envie de reserver rouvre le parcours, sans second bonjour ; la main d une personne ou de l automate tient',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-28', '00:41');
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const ctx = ctxDe(p, t0);
      const bonjour = tourDeLaCliente([{ waId: 'wamid.bj', quand: isoDe(t0), texte: 'Bonjour', type: 'text', sens: 'entrant' }], []);
      const eq = reponseDeLaReception(null, bonjour, ctx, { texte: 'Une personne de la Maison prend le relais dès 8 h.', suite: 'equipe' });
      vaut('la reception passe la main en le disant', ['main', true], [eq.etat.etape, eq.etat.mainDeLaReception === true]);
      const sec = reponseDeLaReception(null, bonjour, ctx, secoursDeLaReception(t0, SEMAINE, []));
      vrai('son secours aussi', sec.etat.mainDeLaReception === true);
      const t1 = t0 + 60000;
      const ctx1 = ctxDe(p, t1);
      const rdv = tourDeLaCliente([{ waId: 'wamid.rdv', quand: isoDe(t1), texte: 'Je veux un RDV', type: 'text', sens: 'entrant' }], eq.etat.traites);
      vaut('« Je veux un RDV » apres sa main : le juge parle', 'parle', jugeLaParole(eq.etat, rdv, ctx1).parole);
      const s = etapeSuivante(eq.etat, rdv, ctx1);
      vaut('... et le parcours s ouvre, la main de la reception levee', [true, true, false, undefined], [
        s.pris, ['meme', 'besoin', 'qui', 'rituel'].includes(s.messages[0]?.etape ?? ''), s.etat.etape === 'main', s.etat.mainDeLaReception]);
      const merci = tourDeLaCliente([{ waId: 'wamid.mc', quand: isoDe(t1), texte: 'Merci', type: 'text', sens: 'entrant' }], eq.etat.traites);
      const sienne = { ...eq.etat, mainDeLaReception: undefined };
      const pause: MainDuFil = { numero: NUM_NAFFI, pauseLe: isoDe(t1 - 30000), jusqua: isoDe(t1 + 3600000) } as MainDuFil;
      vaut('ce qui tient : un merci apres sa main, la main de l automate, la pause d une personne', ['silence', 'silence', 'silence'], [
        jugeLaParole(eq.etat, merci, ctx1).parole, jugeLaParole(sienne, rdv, ctx1).parole, jugeLaParole(eq.etat, rdv, { ...ctx1, main: pause }).parole]);
      const ouvert = etapeSuivante(null, tourPourLeParcours(bonjour), ctx);
      const seul = etapeSuivante(null, { ...bonjour, texte: 'Je voudrais prendre rendez-vous.' }, ctx);
      vaut('apres le mot de la reception, le parcours ne salue pas une seconde fois ; seul, il salue', [false, true], [
        /^(Bonjour|Bonsoir)\b/.test(ouvert.messages[0]?.corps ?? ''), /^(Bonjour|Bonsoir)\b/.test(seul.messages[0]?.corps ?? '')]);
      return ecarts;
    },
    pannes: [
      { nom: 'la main de la reception arrete encore la reservation', mute: [P(AUTO, "  if (courante === 'main' && etat?.mainDeLaReception && tour && intentionDeReserver(tour.texte)) return 'repos';\n", '')] },
      { nom: 'toute main cede a une envie de reserver', mute: [P(AUTO, "  if (courante === 'main' && etat?.mainDeLaReception && tour && intentionDeReserver(tour.texte)) return 'repos';", "  if (courante === 'main' && tour && intentionDeReserver(tour.texte)) return 'repos';")] },
      { nom: 'la reception ne dit plus qu elle a passe la main', mute: [P(AUTO, "      const s = laMain('question', true, r.texte, true);", "      const s = laMain('question', true, r.texte);")] },
      { nom: 'le parcours resalue apres le mot de la reception', mute: [P(AUTO, '    const salue = !tour?.deLaReception;', '    const salue = true;')] },
      { nom: 'le tour du parcours ne se dit plus de la reception', mute: [P(AUTO, 'media: false, deLaReception: true });', 'media: false });')] },
    ],
  },

  /* ══ R45 · le chemin demandé à la réception, 30 octobre 2026 ═══════════
     L'essai de Yéman, à 0 h 05 : « Comment venir chez vous? » puis « Envoie
     moi la localisation » ; la réception a donné l'adresse en mots, et
     « je ne peux pas vous transmettre de localisation ». */
  {
    id: 'R45', nom: 'R45 le chemin : a « comment venir » ou « la localisation », la reception dit l adresse, puis le plan et la Maison sur Google Maps, comme apres une confirmation',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-30', '00:05');
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      p.carte = 'https://maps.app.goo.gl/AbCdEf12345?g_st=ac';
      const ctx = ctxDe(p, t0);
      const dit = (texte: string) => tourDeLaCliente([{ waId: `wamid.${texte.length}`, quand: isoDe(t0), texte, type: 'text', sens: 'entrant' }], []);
      const OUI = ['Comment venir chez vous?', 'Envoie moi la localisation', 'Envoie-moi la loc', 'Vous êtes où exactement ?', 'C’est où ?',
        'Quelle est votre adresse ?', 'Je veux l’itinéraire', 'Où êtes-vous situés ?', 'Comment faire pour vous trouver'];
      const NON = ['Prend moi RDV pour demain 8h30 pour un shampoing', 'Merci beaucoup pour hier', 'Quelle est votre adresse mail ?', 'Comment allez-vous ?',
        'Bonjour', 'Où est mon rendez-vous de samedi ?', 'Combien pour refaire mes racines ?'];
      vaut('les questions de chemin se reconnaissent', [], OUI.filter((x) => !demandeLeCheminWa(x)));
      vaut('... et rien d autre', [], NON.filter((x) => demandeLeCheminWa(x)));
      const mot = 'Avec plaisir, Mme Naffi. La Maison MND vous reçoit à l’Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, à Cotonou. Le plan pour venir suit ce message.';
      const v = reponseDeLaReception(null, dit('Comment venir chez vous?'), ctx, { texte: mot, suite: 'venir' });
      vaut('venir : son mot, le plan en image, puis la Maison sur Google Maps par le site', [
        ['texte', mot, false], ['image', 'https://maisonmnd.com/assets/itineraire/plan-depuis-super-u.png', true], ['texte', 'Maison MND sur Google Maps : https://maisonmnd.com/venir/', true],
      ], v.messages.map((m) => [m.forme, m.forme === 'image' ? m.image : m.corps, m.accessoire === true]));
      vaut('... les trois signes de la reception, le fil clos, l alarme se tait', [[true, true, true], 'clos', 'fini'],
        [v.messages.map((m) => m.deLaReception === true), v.etat.etape, tenuParLAutomate(v.etat, null, t0)]);
      vaut('... et chacun passe les juges de Meta et de la Maison', [], v.messages.flatMap((m) => [...respecteMeta(m), ...texteSain(m.corps, true)]));
      const r = reponseDeLaReception(null, dit('Envoie moi la localisation'), ctx, { texte: 'Mme Naffi, la Maison MND se trouve à l’Ilot 130-F, Maison 88.', suite: 'rien' });
      vaut('Claude dit rien a une question de chemin : le plan part quand meme', ['texte', 'image', 'texte'], r.messages.map((m) => m.forme));
      const merci = reponseDeLaReception(null, dit('Merci beaucoup pour hier'), ctx, { texte: 'Avec plaisir, Mme Naffi.', suite: 'rien' });
      vaut('un merci reste un seul mot', ['texte'], merci.messages.map((m) => m.forme));
      const sans = reponseDeLaReception(null, dit('Comment venir chez vous?'), ctxDe({ ...p, carte: '' }, t0), { texte: mot, suite: 'venir' });
      vaut('sans lien Google Maps de la Maison : le plan seul, comme la confirmation', ['texte', 'image'], sans.messages.map((m) => m.forme));
      const fn = lf(lit(F_AUTO));
      vrai('la fonction connait la suite venir', fn.includes("const SUITES_CONNUES = ['rien', 'reserver', 'creation', 'reparation', 'calibre', 'equipe', 'venir'];"));
      return ecarts;
    },
    pannes: [
      { nom: 'la suite venir n envoie plus le plan', mute: [P(AUTO, "    if (r.suite === 'venir' || (r.suite === 'rien' && !!tour && (demandeLeCheminWa(tour.texte) || enRouteWa(tour.texte)))) {", '    if (false) {')] },
      { nom: 'seul venir envoie le plan, pas une question de chemin dite rien', mute: [P(AUTO, "    if (r.suite === 'venir' || (r.suite === 'rien' && !!tour && (demandeLeCheminWa(tour.texte) || enRouteWa(tour.texte)))) {", "    if (r.suite === 'venir') {")] },
      { nom: 'le plan part sans le lien', mute: [P(AUTO, "        ...(lien ? [signe({ forme: 'texte', etape: 'clos', corps: lien, accessoire: true })] : []),\n", '')] },
      { nom: 'le plan n est plus un accessoire', mute: [P(AUTO, "        signe({ forme: 'image', etape: 'clos', corps: '', image: PLAN_POUR_VENIR, accessoire: true }),", "        signe({ forme: 'image', etape: 'clos', corps: '', image: PLAN_POUR_VENIR }),")] },
      { nom: 'une adresse e-mail se lit comme un chemin', mute: [P(AUTO, "(?!\\p{L})(?! ?(?:e-?mail|mail|courriel|[ée]lectronique))/u,", '(?!\\p{L})/u,')] },
      { nom: 'ou se lit avec un bord d ASCII et rate', mute: [P(AUTO, "    /(?<!\\p{L})(?:vous [êe]tes|c'est|la maison est|se trouve)(?: situ[ée]e?s?)? o[uù](?!\\p{L})/u,", "    /\\b(?:vous [êe]tes|c'est|la maison est|se trouve)(?: situ[ée]e?s?)? o[uù]\\b/,")] },
      { nom: 'la fonction ignore la suite venir', mute: [P(F_AUTO, "const SUITES_CONNUES = ['rien', 'reserver', 'creation', 'reparation', 'calibre', 'equipe', 'venir'];", "const SUITES_CONNUES = ['rien', 'reserver', 'creation', 'reparation', 'calibre', 'equipe'];")] },
    ],
  },

  /* ══ R46 · le service qu'elle nomme, 30 octobre 2026 ══════════════════
     L'essai de Yéman, à 0 h 06 : « Prend moi RDV pour demain 8h30 pour un
     shampoing » ; l'automate a répondu par sa dernière venue (une coiffure),
     « Souhaitez-vous la même chose ? ». « Il faut absolument qu'il puisse
     lire et reconnaître les services du catalogue. » */
  {
    id: 'R46', nom: 'R46 le service nomme : un shampoing ouvre les lavages avant la meme chose (sauf s il etait dans sa derniere venue), l heure dite entoure les places, la reception garde ses mots',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-30', '00:06');
      const LAVAGES = ['plt-05', 'klk-int', 'klk-souffle'];
      /* Les vrais messages du 8 et du 23 octobre 2026 : un s de moins, une racine au singulier. */
      vaut('les vrais messages : Shampooing et reserrage, Shampooing et reprise de racine, un champoing', [
        [...LAVAGES, 'sinsin-ess', 'sinsin-reprise'].sort(), [...LAVAGES, 'sinsin-ess', 'sinsin-reprise'].sort(), LAVAGES], [
        prestationsDitesWa('Bonjour, / Shampooing et reserrage.', PRESTATIONS).sort(), prestationsDitesWa('Shampooing et reprise  de racine', PRESTATIONS).sort(),
        prestationsDitesWa('je veux un champoing', PRESTATIONS)]);
      vaut('les gestes nommes : un shampoing, des racines, rien', [LAVAGES, ['sinsin-ess', 'sinsin-reprise'], [], []], [
        prestationsDitesWa('Prend moi RDV pour demain 8h30 pour un shampoing', PRESTATIONS),
        prestationsDitesWa('Je voudrais refaire mes racines', PRESTATIONS),
        prestationsDitesWa('Je voudrais un rendez-vous samedi', PRESTATIONS),
        prestationsDitesWa('Merci beaucoup pour hier', PRESTATIONS),
      ]);
      vaut('l heure dite : 8h30, a 15 h, ni 48h, ni 5h, ni une heure niee', ['08:30', '15:00', undefined, undefined, undefined], [
        motsReconnus('Prend moi RDV pour demain 8h30', t0).heure, motsReconnus('samedi à 15 h', t0).heure,
        motsReconnus('je reponds sous 48h', t0).heure, motsReconnus('il est 5h, je dors encore', t0).heure, motsReconnus('demain mais pas à 9h', t0).heure]);
      const FIFI: FicheDuNumero = { ...NAFFI, derniereVenue: { date: '2026-10-25', serviceIds: ['dandan-soin'] } };
      const p = parcours(ORIGINAL, NUM_NAFFI, [FIFI]);
      const s1 = elle(p, t0, { texte: 'Prend moi RDV pour demain 8h30 pour un shampoing' });
      vaut('un shampoing apres une hydratation : les lavages, pas la meme chose', ['liste', 'rituel', 'Bonsoir Mme Naffi, merci de votre message. Pour votre lavage, quel rituel souhaitez-vous ?'],
        [s1.messages[0]?.forme, s1.etat.etape, s1.messages[0]?.corps]);
      vaut('... chaque lavage du catalogue, Kids et produit apporte ecartes', LAVAGES, (s1.etat.panier.rituels ?? []).map((ids) => ids[0]));
      elle(p, t0 + 30000, { touche: (s1.messages[0]?.lignes ?? [])[0]?.titre ?? '' });
      const s3 = elle(p, t0 + 60000, { touche: 'Non' });
      vaut('... et les places entourent demain 8 h 30', [true, 'Sam. 31 oct. 2026 · 9 h'],
        [/^Voici les places les plus proches de demain à 8 h 30, Mme Naffi\.$/.test(s3.messages[0]?.corps ?? ''), s3.messages[0]?.lignes?.[0]?.titre]);
      const q = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const m = elle(q, t0, { texte: 'Prend moi RDV pour demain 8h30 pour un shampoing' });
      vaut('un shampoing quand sa derniere venue avait un lavage : la meme chose reste la question', 'meme', m.etat.etape);
      const r = parcours(ORIGINAL, NUM_NAFFI, [FIFI]);
      const ctx = ctxDe(r, t0);
      const tour = tourDeLaCliente([{ waId: 'wamid.shp', quand: isoDe(t0), texte: 'Bonsoir, je voudrais un shampoing samedi', type: 'text', sens: 'entrant' }], []);
      const viaReception = etapeSuivante(null, tourPourLeParcours(tour), ctx);
      vaut('ouvert par la reception : ses mots a elle comptent encore (le lavage, samedi)', ['rituel', 'samedi'], [viaReception.etat.etape, viaReception.etat.panier.jourVoulu]);
      const inconnue = parcours(ORIGINAL, '22997000111', []);
      const i1 = elle(inconnue, t0, { texte: 'Je veux un shampoing' });
      vrai('une inconnue qui nomme un shampoing voit les lavages', i1.etat.etape === 'rituel' && /^Bonsoir, merci de votre message\. Pour votre lavage, quel rituel souhaitez-vous \?$/.test(i1.messages[0]?.corps ?? ''), i1.messages[0]?.corps);
      return ecarts;
    },
    pannes: [
      { nom: 'les gestes nommes sont ignores', mute: [P(AUTO, '    return dire(msgDits(avecSalut) ?? msgMeme(false, avecSalut) ?? msgBesoin(false, avecSalut));', '    return dire(msgMeme(false, avecSalut) ?? msgBesoin(false, avecSalut));')] },
      { nom: 'shampoing ne se lit plus', mute: [P(AUTO, '(?:(?:sh|ch)ampo+ings?|shampoo|lavages?|laver|kloklo)', '(?:lavages?|laver|kloklo)')] },
      { nom: 'reserrage et racine au singulier ne se lisent plus', mute: [P(AUTO, '(?:res+errages?|res+errer|retwists?|racines?|sinsin)', '(?:resserrages?|resserrer|retwists?|racines|sinsin)')] },
      { nom: 'l heure dite est oubliee', mute: [P(AUTO, '    const voulue = o.proche ? null : placeVoulue(offertes);', '    const voulue = o.proche ? null : null;')] },
      { nom: 'la reception perd ses mots', mute: [P(AUTO, 'texteDOrigine: tour.texte, ', '')] },
      { nom: 'ce qui etait dans sa venue ne propose plus la meme chose', mute: [P(AUTO, '    if (v && dansSaVenue) return null;\n', '')] },
      { nom: 'une heure hors de la journee se lit', mute: [P(AUTO, '    if (n < 7 || n > 21 || nieLeMotWa(t, debut, debut + h[0].length)) continue;', '    if (nieLeMotWa(t, debut, debut + h[0].length)) continue;')] },
    ],
  },
  /* ══ R47 · les vrais messages de la banque, 30 octobre 2026 ═══════════
     La maquette « Banque de scénarios » (8c48d9mc…) : 32 vrais messages
     rejoués, et les réponses que Yéman a choisies pour ceux à corriger. */
  {
    id: 'R47', nom: 'R47 la banque : lavage et resserrage ensemble en formule, lundi ferme propose les places voisines, decaler propose des places que l equipe deplace, une date ecrite se lit, en route recoit le plan',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-30', '10:00');
      const FIFI: FicheDuNumero = { ...NAFFI, derniereVenue: { date: '2026-10-25', serviceIds: ['dandan-soin'] } };
      const dit = (texte: string, ms = t0) => tourDeLaCliente([{ waId: `wamid.${texte.length}`, quand: isoDe(ms), texte, type: 'text', sens: 'entrant' }], []);
      /* « Bonjour, / Shampooing et reserrage. » : par la reception, qui ouvre le parcours. */
      const r = parcours(ORIGINAL, NUM_NAFFI, [FIFI]);
      const f = etapeSuivante(null, tourPourLeParcours(dit('Bonjour, / Shampooing et reserrage.')), ctxDe(r, t0));
      vaut('lavage et resserrage nommes ensemble : la formule qui les reunit, en un seul choix', ['rituel', [['plt-05', 'sinsin-ess']], 'Pour votre lavage et vos racines, quel rituel souhaitez-vous, Mme Naffi ?'],
        [f.etat.etape, f.etat.panier.rituels, f.messages[0]?.corps]);
      /* « Lundi prochain m'arrangerait dans l'apres midi » : la Maison est fermee le lundi. */
      vrai('m arrangerait se lit comme une envie de reserver', intentionDeReserver('Lundi prochain m’arrangerait dans l’apres midi'));
      const l = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      elle(l, t0, { texte: 'Lundi prochain m’arrangerait dans l’apres midi' });
      const lp = elle(l, t0 + 30000, { touche: 'La même chose' });
      vaut('lundi ferme : il le dit, et les places voisines gardent l apres-midi', [true, true],
        [lp.messages[0]?.corps === 'La Maison est fermée le lundi, Mme Naffi. Voici les places les plus proches, l’après-midi.'.replace('’', "'"), /à 1[4-7] h/.test(lp.messages[0]?.lignes?.[0]?.description ?? '')]);
      /* « Je vais devoir reprogrammer ça pour un autre jour » : des places, puis l'equipe. */
      const d = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const d1 = elle(d, t0, { texte: 'Je ne pourrai malheureusement pas passer demain, je vais devoir reprogrammer ça pour un autre jour.' });
      vaut('decaler : les places de sa derniere venue, a toucher', ['places', true], [d1.etat.etape, (d1.messages[0]?.corps ?? '').startsWith('Pour déplacer votre rendez-vous, voici les prochaines places, Mme Naffi.')]);
      const d2 = elle(d, t0 + 30000, { touche: (d1.messages[0]?.lignes ?? [])[0]?.titre ?? '' });
      vaut('... la place touchee passe a l equipe, rien n est pose', ['main', 'annulation', 0, true],
        [d2.etat.etape, d2.etat.motifMain, d2.ecritures.filter((e) => e.genre === 'pose').length, /^Bien noté, Mme Naffi : vous souhaitez venir le .+\. Une personne de la Maison déplace votre rendez-vous et vous le confirme ici\.$/.test(d2.messages[0]?.corps ?? '')]);
      vaut('reprogrammer se lit comme decaler', true, motsReconnus('je vais devoir reprogrammer', t0).deplacer);
      /* Les dates ecrites. */
      const t2 = cotonou('2026-10-02', '10:00');
      vaut('une date ecrite : 30 octobre 2026, mardi 13 octobre, le 1er novembre, ni le 31 septembre, pas le 3 novembre', ['2026-10-30', '2026-10-13', '2026-11-01', undefined, '2026-11-03'], [
        motsReconnus('Pourriez-vous reporter au 30 octobre 2026 à 9h30 ?', t2).jourVoulu, motsReconnus('Et le mardi 13 octobre a 13 h est ce possible ?', t2).jourVoulu,
        motsReconnus('le 1er novembre', t2).jourVoulu, motsReconnus('le 31 septembre', t2).jourVoulu, motsReconnus('pas le 3 novembre', t2).jourEvite]);
      /* « Je suis en route pour le shampooing » : bien note, et le plan. */
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      p.carte = 'https://maps.app.goo.gl/AbCdEf12345';
      const ctx = ctxDe(p, t0);
      const route = reponseDeLaReception(null, dit('Je suis en route pour le shampooing'), ctx, { texte: 'Bien noté, Mme Naffi, nous vous attendons.', suite: 'rien' });
      vaut('en route : son mot, le plan, le lien', ['texte', 'image', 'texte'], route.messages.map((m) => m.forme));
      const la = reponseDeLaReception(null, dit('Je suis arrivée devant la porte'), ctx, { texte: 'Bien noté, Mme Naffi.', suite: 'rien' });
      vaut('... arrivee devant la porte : un mot seul', ['texte'], la.messages.map((m) => m.forme));
      return ecarts;
    },
    pannes: [
      { nom: 'deux gestes nommes ensemble restent separes', mute: [P(AUTO, '    const m = msgRituel(false, ensemble.length > 0 ? ensemble : dits);', '    const m = msgRituel(false, dits);')] },
      { nom: 'le lundi ferme trie encore les places', mute: [P(AUTO, '    const j = jourFermeVoulu() ? undefined : base.panier.jourVoulu;', '    const j = base.panier.jourVoulu;')] },
      { nom: 'le lundi ferme ne se dit plus', mute: [P(AUTO, '        if (ferme) {', '        if (false) {')] },
      { nom: 'm arrangerait ne se lit plus', mute: [P(AUTO, "|m'?arrangerait|m'?arrange|me conviendrait", '|me conviendrait')] },
      { nom: 'decaler passe la main sans proposer de places', mute: [P(AUTO, '      const d = deplaceLeRendezVous(mots);', '      const d = null;')] },
      { nom: 'la place d un deplacement se pose comme un rendez-vous', mute: [P(AUTO, '    if (base.panier.deplace !== undefined) {', '    if (false) {')] },
      { nom: 'reprogrammer ne se lit plus', mute: [P(AUTO, '(decal|report|deplac|reprogramm)', '(decal|report|deplac)')] },
      { nom: 'le jour de la semaine passe devant la date ecrite', mute: [P(AUTO, '    jourVoulu = iso;\n    break;', '    jourVoulu = jourVoulu ?? iso;\n    break;')] },
      { nom: 'en route ne recoit plus le plan', mute: [P(AUTO, ' || enRouteWa(tour.texte)', '')] },
    ],
  },

  /* ══ R48 · le plafond levé pour les numéros d'essai, 30 octobre 2026 ══
     Les essais de Yéman, à 1 h 31 : après « Shampooing et reserrage », son
     choix, « reprogrammer » et « en route » sont restés sans réponse, le
     dixième message de la nuit passé. */
  {
    id: 'R48', nom: 'R48 les numeros d essai n ont pas de plafond, les clientes le gardent ; reprogrammer n est pas une envie de reserver',
    eprouve: () => {
      const { ecarts, vaut } = juge();
      const t0 = cotonou('2026-10-30', '01:31');
      const p = parcours(ORIGINAL, NUM_NAFFI, [NAFFI]);
      const plein: EtatDuFil = {
        numero: NUM_NAFFI, version: 9, etape: 'repos', depuis: isoDe(t0 - 3600000), versionDeLEtape: 9, majLe: isoDe(t0 - 60000),
        traites: [], panier: {}, ecarts: 0, envois: Array.from({ length: 12 }, (_, i) => isoDe(t0 - (i + 1) * 60000)),
      };
      const tour = tourDeLaCliente([{ waId: 'wamid.plafond', quand: isoDe(t0), texte: 'Je voudrais un rendez-vous', type: 'text', sens: 'entrant' }], []);
      const essai = { ...ctxDe(p, t0), reglage: { ...OUVERT, numerosEssai: [NUM_NAFFI] } };
      const cliente = ctxDe(p, t0);
      vaut('douze messages dans la nuit : le numero d essai est servi, la cliente passe la main sans un mot', ['parle', 'main-silencieuse'],
        [jugeLaParole(plein, tour, essai).parole, jugeLaParole(plein, tour, cliente).parole]);
      const s = etapeSuivante(plein, tour, essai);
      vaut('... et le tour du numero d essai repond vraiment', [true, true], [s.pris, s.messages.length > 0 && s.etat.etape !== 'main']);
      vaut('reprogrammer : un report, pas une envie de reserver', [false, true],
        [intentionDeReserver('Je vais devoir reprogrammer mon RDV'), motsReconnus('Je vais devoir reprogrammer mon RDV', t0).deplacer]);
      return ecarts;
    },
    pannes: [
      { nom: 'le juge plafonne encore les essais', mute: [P(AUTO, ' && !sansPlafondWa(ctx.reglage, ctx.numero)) return { parole', ') return { parole')] },
      { nom: 'le tour plafonne encore les essais', mute: [P(AUTO, ' && !confirme && !sansPlafondWa(ctx.reglage, ctx.numero)) return laMain', ' && !confirme) return laMain')] },
      { nom: 'les clientes perdent leur plafond', mute: [P(AUTO, '  reglage.numerosEssai.some((n) => cleWa(n) === cleWa(numero));', '  true;')] },
      { nom: 'reprogrammer redevient une envie de reserver', mute: [P(AUTO, '(annul|decal|report|deplac|reprogramm|retard)', '(annul|decal|report|deplac|retard)')] },
    ],
  },

  /* ══ R49 · valider les réponses de la Maison en cochant, 30 octobre 2026 ══
     « Montre-moi les 13 réponses à valider », puis « sur un écran à cocher ». */
  {
    id: 'R49', nom: 'R49 valider en cochant : la direction seule, seules les reponses qui peuvent partir se cochent, la correction proposee retire la phrase au prix introuvable ou remplit le texte vide',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const PRIX = { 'sv-koko-ori': 15000, 'sv-atl-ii-e': 20000 };
      const creation = BROUILLONS_DU_CONSEIL.find((r) => r.id === 'r-prix-creation')!;
      const corr = correctionProposee(creation, PRIX);
      vaut('la creation : la phrase aux prix introuvables s en va, le reste demeure', [true, false, true],
        [!!corr, (corr?.texte ?? '').includes('À titre de repère'), (corr?.texte ?? '').startsWith('Une création se chiffre après la consultation Origine (KÒKÒ™ Origine, {prix:sv-koko-ori})')]);
      vaut('la longueur vide : le texte propose (une photo) ; une reponse qui peut partir : rien a proposer', [TEXTES_PROPOSES['r-longueur'], null],
        [correctionProposee({ id: 'r-longueur', texte: '' }, PRIX)?.texte, correctionProposee(BROUILLONS_DU_CONSEIL.find((r) => r.id === 'r-duree')!, PRIX)]);
      const c = valideLesReponses({ reponses: [...BROUILLONS_DU_CONSEIL] }, ['r-duree', 'r-consultation'], 'direction', '2026-10-30T09:00:00Z');
      vaut('valider les cochees : celles-la, et elles seules', ['validee', 'validee', 'brouillon'],
        [c.reponses.find((r) => r.id === 'r-duree')?.etat, c.reponses.find((r) => r.id === 'r-consultation')?.etat, c.reponses.find((r) => r.id === 'r-formation')?.etat]);
      const ecran = lf(lit('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx'));
      vrai('l ecran : la carte a cocher pour la direction seule, une case grisee quand la reponse ne peut pas partir',
        ecran.includes('{direction && brouillons.length > 0 && (') && ecran.includes('disabled={fautes.length > 0} onChange={() => coche(r.id)}'));
      return ecarts;
    },
    pannes: [
      { nom: 'la correction garde la phrase au prix introuvable', mute: [P('src/shared/conseil-wa.ts', '  const reste = phrases.filter((p) => !introuvable(p)).join', '  const reste = phrases.join')] },
      { nom: 'le texte vide n a rien de propose', mute: [P('src/shared/conseil-wa.ts', '    return p ? { texte: p, pourquoi:', '    return false ? { texte: p, pourquoi:')] },
      { nom: 'valider les cochees valide tout', mute: [P('src/shared/conseil-wa.ts', '  return ids.reduce((acc, id) => valideLaReponse(acc, id, par, quand), c);', '  return c.reponses.reduce((acc, r) => valideLaReponse(acc, r.id, par, quand), c);')] },
      { nom: 'le personnel coche aussi', mute: [P('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx', '{direction && brouillons.length > 0 && (', '{brouillons.length > 0 && (')] },
      { nom: 'une reponse fautive se coche', mute: [P('src/apps/trone/routes/clients/ReponsesDeLaMaison.tsx', 'disabled={fautes.length > 0} onChange={() => coche(r.id)}', 'disabled={false} onChange={() => coche(r.id)}')] },
    ],
  },

  /* ══ R50 · la liste de l'entretien en rubriques, le prix dès le choix, 30 octobre 2026 ══
     « Il y a trois lavage essentiel, le client ne saura pas quoi choisir »,
     « rajoute le prix une fois le client sélectionné », « si c'est un ancien
     client, le système reconnaît son nombre de locks grâce au numéro ; si
     c'est un nouveau client, demander le nombre de locks avant de finaliser
     le RDV » (Yéman, maquette S6XZotKV…). */
  {
    id: 'R50', nom: 'R50 la liste de l entretien en rubriques ; le prix des le choix, lu sur la fiche, sinon apres son nombre de locks et sa longueur ; un prix ferme passe avant ; jamais celui d une consultation ; le serveur suit le bareme du site',
    eprouve: async () => {
      const { ecarts, vaut, vrai } = juge();
      const PALIERS = [{ palier: 'jusqu’à 80 locks', nom: 'Jumbo', locks: 80 }, { palier: '81 à 150 locks', nom: 'Medium', locks: 150 },
        { palier: '151 à 250 locks', nom: 'Mini', locks: 250 }, { palier: 'plus de 250 locks', nom: 'Micro', locks: 350 }];
      const RACINES = [20000, 20000, 20000, 30000];
      const LAVAGE: Record<string, number> = { court: 8000, 'mi-long': 10000, long: 12000 };
      const prixDe = (id: string, tete: { locks?: number; longueur?: string }): number | undefined => {
        if (id === 'plt-05') return LAVAGE[tete.longueur ?? 'court'];
        if (id === 'sinsin-ess') { const i = PALIERS.findIndex((p) => (tete.locks ?? 0) <= p.locks); return RACINES[tete.locks ? (i < 0 ? 3 : i) : 0]; }
        if (id === 'dandan-ess') return 6000;
        if (id === 'sv-koko-ori' || id === 'sv-koko-sui') return 15000;
        return undefined;
      };
      const avecLePrix = (p: Parcours): Parcours => {
        p.agenda = {
          prixDe, paliers: PALIERS,
          prestations: PRESTATIONS.map((s) => (s.id === 'plt-05' ? { ...s, prixALaLongueur: true } : s.id === 'sinsin-ess' ? { ...s, prixAuxLocks: true } : s)),
        };
        return p;
      };
      const tousLesTextes = (p: Parcours): string[] => p.envoyes.map((m) => m.corps);
      const sainsEtConformes = (p: Parcours): string[] => p.envoyes.flatMap((m) => [...respecteMeta(m), ...texteSain(m.corps, m.prixDuCatalogue === true)]);
      const t0 = cotonou('2026-10-30', '10:12');

      /* 1. La liste en rubriques, telle que Meta la recoit. */
      const p0 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p0, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      const l0 = elle(p0, t0 + 1000, { touche: 'Entretenir mes locks' });
      const sections = ((chargeGraph(l0.messages[0]!, NUM_INCONNUE).interactive as { action: { sections: { title?: string; rows: unknown[] }[] } }).action.sections);
      vaut('Meta recoit une section par rubrique, dans l ordre', [['Lavage et racines', 1], ['Lavage seul', 3], ['Racines seules', 2], ['Autre chose', 2]], sections.map((s) => [s.title, s.rows.length]));
      vaut('la liste en rubriques passe les juges de Meta', [], respecteMeta(l0.messages[0]!));

      /* 2. Une cliente connue : sa fiche dit ses locks et sa longueur, le prix vient aussitot. */
      const connue: FicheDuNumero = { id: 'c-awa', nom: 'Awa Dossou', civilite: 'madame', parPhone: true, numeros: [NUM_INCONNUE], tete: { locks: 120, longueur: 'mi-long' } };
      const p1 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, [connue]));
      elle(p1, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p1, t0 + 1000, { touche: 'Entretenir mes locks' });
      const c1 = elle(p1, t0 + 2000, { touche: 'Entretien · Essentiel' });
      vaut('connue : le prix d apres sa fiche, puis un autre soin ?', [
        'Votre rendez-vous : 30 000 F, d’après votre fiche (environ 120 locks, mi-long).\nLavage Essentiel 10 000 F · Racines Essentiel 20 000 F', 'encore',
      ], [c1.messages[0]?.corps, c1.messages[1]?.etape]);
      elle(p1, t0 + 3000, { touche: "Non, c'est tout" });
      const r1 = elle(p1, t0 + 4000, { touche: 'Sam. 31 oct. 2026 · 9 h' });
      vrai('connue : le recapitulatif redit le prix', corps(r1).includes('Reprise des racines (SÍNSIN™ Essentiel), 30 000 F, samedi 31 octobre 2026'), corps(r1));
      vaut('connue : chaque message passe les juges (le prix vient du catalogue)', [], sainsEtConformes(p1));

      /* 3. Une nouvelle cliente : son nombre de locks (ecrit), puis sa longueur, puis le prix. */
      const p2 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p2, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p2, t0 + 1000, { touche: 'Entretenir mes locks' });
      const q1 = elle(p2, t0 + 2000, { touche: 'Entretien · Essentiel' });
      vaut('nouvelle : combien de locks, les paliers et Je ne sais pas', ['locks', 'Pour vous donner le prix juste : combien de locks environ ? Comptez vos locks à peu près, ou touchez « Je ne sais pas ».',
        ['Jusqu’à 80 locks', '81 à 150 locks', '151 à 250 locks', 'Plus de 250 locks', 'Je ne sais pas', 'Parler à la Maison']], [q1.messages[0]?.etape, corps(q1), lignesDe(q1)]);
      const q2 = elle(p2, t0 + 3000, { texte: 'environ 120' });
      vaut('nouvelle : 120 ecrit se lit, puis sa longueur', ['longueur', 'Et leur longueur ?', ['Court', 'Mi-long', 'Long', 'Parler à la Maison']], [q2.messages[0]?.etape, corps(q2), lignesDe(q2)]);
      const q3 = elle(p2, t0 + 4000, { touche: 'Mi-long' });
      vaut('nouvelle : le prix juste, puis un autre soin ?', ['Votre rendez-vous : 30 000 F.\nLavage Essentiel 10 000 F · Racines Essentiel 20 000 F', 'encore'], [q3.messages[0]?.corps, q3.messages[1]?.etape]);
      vaut('nouvelle : chaque message passe les juges', [], sainsEtConformes(p2));

      /* 4. Elle ne sait pas : la fourchette, et le comptage a la Maison. */
      const p3 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p3, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p3, t0 + 1000, { touche: 'Entretenir mes locks' });
      elle(p3, t0 + 2000, { touche: 'Entretien · Essentiel' });
      elle(p3, t0 + 3000, { touche: 'Je ne sais pas' });
      const f3 = elle(p3, t0 + 4000, { texte: 'elles sont courtes' });
      vaut('ne sait pas : de 28 000 a 38 000 F, et le comptage a la Maison',
        'Votre rendez-vous : de 28 000 à 38 000 F.\nLavage Essentiel 8 000 F · Racines Essentiel de 20 000 à 30 000 F\nSelon votre nombre de locks : nous les compterons ensemble à la Maison.', f3.messages[0]?.corps);

      /* 5. Un prix ferme : rien a demander, son prix a elle. */
      const ferme: FicheDuNumero = { ...connue, tete: undefined, prixFixes: { 'sinsin-ess': 15000 } };
      const p4 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, [ferme]));
      elle(p4, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p4, t0 + 1000, { touche: 'Entretenir mes locks' });
      const f4 = elle(p4, t0 + 2000, { touche: 'Racines · Essentiel' });
      vaut('un prix ferme : aucune question, son prix', ['Racines · Essentiel : 15 000 F.', 'encore'], [f4.messages[0]?.corps, f4.messages[1]?.etape]);

      /* 6. Une consultation : jamais de prix, seule ou jointe a l entretien. */
      const p5 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p5, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p5, t0 + 1000, { touche: 'Créer mes locks' });
      vrai('une consultation : aucun prix dit', !tousLesTextes(p5).some((t) => /\d\s?F\b/.test(t)), tousLesTextes(p5).join(' | '));
      const p7 = avecLePrix(parcours(ORIGINAL, NUM_INCONNUE, [connue]));
      elle(p7, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p7, t0 + 1000, { touche: 'Entretenir mes locks' });
      const l7 = elle(p7, t0 + 2000, { touche: 'Lavage · Essentiel' });
      elle(p7, t0 + 3000, { touche: 'Ajouter un soin' });
      const r7 = elle(p7, t0 + 4000, { touche: 'Réparer mes locks' });
      vaut('le lavage seul a son prix (sa longueur seule compte) ; la reparation jointe, plus aucun prix (la consultation d abord)', ['Lavage · Essentiel : 10 000 F, d’après votre fiche (mi-long).', 1, 'encore'],
        [l7.messages[0]?.corps, r7.messages.length, r7.messages[0]?.etape]);

      /* 7. Sans prix du serveur : ni question ni prix, comme avant. */
      const p6 = parcours(ORIGINAL, NUM_INCONNUE, []);
      elle(p6, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      elle(p6, t0 + 1000, { touche: 'Entretenir mes locks' });
      const s6 = elle(p6, t0 + 2000, { touche: 'Entretien · Essentiel' });
      vaut('sans prix du serveur : directement un autre soin ?', [1, 'encore'], [s6.messages.length, s6.messages[0]?.etape]);

      /* 8. Le serveur : le bareme du site, la marge, le Juste Prix sur l Atelier seul, la longueur. */
      const fn = lf(lit(F_AUTO));
      vrai('la fonction lit le bareme et la tete des fiches', fn.includes('return { lignes, agenda, tarif: tarifDesDocuments(docs) };')
        && fn.includes(".select('id, locks:data->lockCount, longueur:data->>longueur, marge:data->margeCalibre, coef:data->priceCoef, fixes:data->prixFixes')")
        && fn.includes('...depend(s.id),') && fn.includes('...(prixDe ? { prixDe, paliers } : {}),'));
      const a = fn.indexOf('/* ⟨prix-calibre⟩ */');
      const b = fn.indexOf('/* ⟨/prix-calibre⟩ */');
      const c = fn.indexOf('type TarifDuTour = ');
      const d = fn.indexOf('function agendaDuTourWa(');
      if (a < 0 || b < 0 || c < 0 || d < 0) ecarts.push('le bareme ou le prix du serveur est introuvable dans la fonction');
      else {
        const { transform } = await esbuild();
        const { code } = await transform(`${fn.slice(a, b)}\n${fn.slice(c, d)}\nexport { prixPourLaTeteWa as __prix };\n`, { loader: 'ts', format: 'esm' });
        const f = path.join(dossier(), `prix-du-serveur-${Date.now()}.mjs`);
        writeFileSync(f, code);
        const m = await import(pathToFileURL(f).href) as Any;
        const bande = (id: string, maxLocks: number) => ({ id, name: id, maxLocks, coef: 1, durCoef: 1 });
        const tarif = { bandes: [bande('cal-jumbo', 80), bande('cal-medium', 150), bande('cal-mini', 250), bande('cal-micro', 350)], sets: {}, baremeSuspendu: false };
        const cats = [{ id: 'atl-ii-gbeji', parentId: 'atl-ii' }, { id: 'atl-ii' }, { id: 'plt-05' }];
        const brutes = [{ id: 'atl-ii-gbeji', data: { parentId: 'atl-ii' } }, { id: 'atl-ii', data: { maison: 'atelier' } }, { id: 'plt-05', data: {} }];
        const racines = { id: 'sv-atl-ii-e', data: { categoryId: 'atl-ii-gbeji', priceXof: 20000, tarifMode: 'calibre', priceFloors: { 'cal-jumbo': 20000, 'cal-medium': 20000, 'cal-mini': 20000, 'cal-micro': 30000 } } };
        const lavage = { id: 'sv-plt-05-ess-c', data: { categoryId: 'plt-05', priceXof: 8000, prixParLongueur: { court: 8000, 'mi-long': 10000, long: 12000 } } };
        const px = (l: unknown, tete: unknown) => m.__prix(l, tete, tarif, cats, brutes);
        vaut('le serveur : au calibre, la marge d un cran, le Juste Prix sur l Atelier seul, la longueur avant tout', [20000, 30000, 20000, 18000, 10000, 12000, 8000, 10000],
          [px(racines, { locks: 120 }), px(racines, { locks: 260 }), px(racines, { locks: 260, marge: true }), px(racines, { locks: 120, coef: 0.9 }),
            px(lavage, { longueur: 'mi-long' }), px(lavage, { longueur: 'long' }), px(lavage, {}), px(lavage, { longueur: 'mi-long', coef: 0.9 })]);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'la liste de l entretien revient a plat', mute: [P(AUTO, "    if (b === 'entretien') return dire(msgEntretien(false) ?? msgRituel(", "    if (b === 'entretien') return dire(null ?? msgRituel(")] },
      { nom: 'les rubriques ne partent pas chez Meta', mute: [P(AUTO, '  if (lignes.some((l) => l.section)) {', '  if (false) {')] },
      { nom: 'le prix ne se dit pas apres le choix', mute: [P(AUTO, '    const prix = msgPrix();\n', '    const prix = null as MessageSortant | null;\n')] },
      { nom: 'la fiche n est pas lue : on demande a une cliente connue', mute: [P(AUTO, '    const f = ficheChoisie()?.tete;', '    const f = undefined as TeteDuPrix | undefined;')] },
      { nom: 'la longueur n est jamais demandee', mute: [P(AUTO, "    if (ps.some((s) => s.prixALaLongueur) && !tete.longueur) return 'longueur';\n", '')] },
      { nom: 'le prix ferme est ignore', mute: [P(AUTO, '    return typeof v === \'number\' && v > 0 ? Math.round(v) : undefined;\n  };\n  /** CE QU\'IL MANQUE', '    return undefined;\n  };\n  /** CE QU\'IL MANQUE')] },
      { nom: 'une consultation recoit un prix', mute: [P(AUTO, 'ps.some((s) => !s || estUneConsultation(s, cats) || s.hidePrice', 'ps.some((s) => !s || s.hidePrice')] },
      { nom: 'le prix part sans son drapeau du catalogue', mute: [P(AUTO, "corps: lignes.join('\\n'), prixDuCatalogue: true };", "corps: lignes.join('\\n') };")] },
      { nom: 'le serveur oublie la marge', mute: [P(F_AUTO, '  if (!marge || brut <= 0) return tri[brut];', '  return tri[brut];')] },
      { nom: 'le Juste Prix touche aussi le plateau', mute: [P(F_AUTO, ' && deLAtelierWa(String(d.categoryId ?? \'\'), catsBrutes) ? tete.coef : 1;', ' ? tete.coef : 1;')] },
    ],
  },

  /* ══ R51 · la couleur s'ouvre au prix, 30 octobre 2026 ═══════════════
     Yéman : « quand un client veut faire une coloration et veut connaître
     les prix, le catalogue de la coloration ne s'ouvre pas. Vérifie et
     construis. » L'automate se taisait sur « c'est combien ? », la liste de
     l'entretien ne menait jamais à la couleur, et ses titres disaient
     « Couleur · Couleur ». */
  {
    id: 'R51', nom: 'R51 la couleur : son prix demande ouvre sa liste (avant le conseil), « Une couleur » dans la liste de l entretien, des titres lisibles, le prix au choix, Reserver apres la reponse ouvre sa liste',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const COULEURS: PrestationDuTour[] = [
        { id: 'yek-lum', name: 'YÈKPÈ™ Lumière · La Brillance Signature', categoryId: 'atl-iii-yekpe', durationMin: 60, reservable: true },
        { id: 'yek-ecl', name: 'YÈKPÈ™ Éclat · Le Raviveur de Couleur · Court', categoryId: 'atl-iii-yekpe', durationMin: 75, reservable: true },
        { id: 'yek-cou', name: 'YÈKPÈ™ Couleur · La Révélation Végétale', categoryId: 'atl-iii-yekpe', durationMin: 150, reservable: true, prixALaLongueur: true },
        { id: 'yek-apportee', name: 'YÈKPÈ™ avec votre couleur · couleur apportée', categoryId: 'atl-iii-yekpe', durationMin: 30, reservable: true },
      ];
      const COULEUR: Record<string, number> = { court: 15000, 'mi-long': 20000, long: 25000 };
      const prixDe = (id: string, tete: { longueur?: string }): number | undefined =>
        (id === 'yek-cou' ? (tete.longueur ? COULEUR[tete.longueur] : undefined) : id === 'yek-ecl' ? 8000 : id === 'yek-lum' ? 15000 : undefined);
      const avecLaCouleur = (p: Parcours): Parcours => { p.agenda = { prixDe, prestations: [...PRESTATIONS, ...COULEURS] }; return p; };
      const t0 = cotonou('2026-10-30', '11:40');
      const TITRES = ['Couleur végétale', 'Raviver la couleur', 'Brillance des locks', 'Autre soin', 'Parler à la Maison'];
      const QUESTION = 'Pour votre couleur, quel rituel souhaitez-vous ?';
      const AU_PRIX = 'Bonjour, merci de votre message. Pour votre couleur, quel rituel souhaitez-vous ? Choisissez-en un : nous vous donnons son prix.';

      /* 1. Le juge : le prix d'une famille nommee parle, un prix sans famille se tait. */
      const pj = avecLaCouleur(parcours(ORIGINAL, NUM_NAFFI, [NAFFI]));
      pj.premier = false;
      const dit = (texte: string): string => jugeLaParole(null, tourDeLaCliente([{ waId: `wamid.j${texte.length}`, quand: isoDe(t0), texte, type: 'text', sens: 'entrant' }], []), ctxDe(pj, t0)).parole;
      vaut('le juge : coloration et combien, colorations au pluriel, teinture parlent ; une creation au prix se tait comme avant', ['parle', 'parle', 'parle', 'silence'],
        [dit('Bonjour, je voudrais faire une coloration. C’est combien ?'), dit('Quel est le prix de vos colorations ?'), dit('Une teinture au henné, c’est quel tarif ?'), dit('Combien coûte une création ?')]);

      /* 2. Une inconnue demande le prix : la liste de la couleur, puis sa longueur, puis le prix. */
      const p1 = avecLaCouleur(parcours(ORIGINAL, NUM_INCONNUE, []));
      const s1 = elle(p1, t0, { texte: 'Bonjour, je voudrais faire une coloration. C’est combien ?' });
      vaut('le prix demande : la liste de la couleur, dans son ordre, sans la couleur apportee', ['rituel', AU_PRIX, TITRES], [s1.etat.etape, corps(s1), lignesDe(s1)]);
      vaut('la liste de la couleur passe les juges de Meta', [], respecteMeta(s1.messages[0]!));
      const s2 = elle(p1, t0 + 1000, { touche: 'Couleur végétale' });
      vaut('la couleur choisie : sa longueur d abord', 'longueur', s2.messages[0]?.etape);
      const s3 = elle(p1, t0 + 2000, { touche: 'Long' });
      vaut('puis son prix, et un autre soin ?', ['Couleur végétale : 25 000 F.', 'encore'], [corps(s3), s3.messages[1]?.etape]);

      /* 3. Sa couleur etait dans sa derniere venue : au prix, la liste ; sans prix, la meme chose. */
      const venue: FicheDuNumero = { ...NAFFI, derniereVenue: { date: '2026-10-03', serviceIds: ['yek-cou'] } };
      const p2 = avecLaCouleur(parcours(ORIGINAL, NUM_NAFFI, [venue]));
      p2.premier = false;
      const v1 = elle(p2, t0, { texte: 'Combien pour ma couleur ?' });
      vaut('une habituee demande le prix : la liste, pas la meme chose', ['rituel', TITRES], [v1.etat.etape, lignesDe(v1)]);
      const p3 = avecLaCouleur(parcours(ORIGINAL, NUM_NAFFI, [venue]));
      p3.premier = false;
      vaut('sans prix demande : la meme chose reste la question', 'meme', elle(p3, t0, { texte: 'Je voudrais un rendez-vous samedi pour ma couleur' }).etat.etape);

      /* 4. La liste de l entretien mene a la couleur. */
      const p4 = avecLaCouleur(parcours(ORIGINAL, NUM_INCONNUE, []));
      elle(p4, t0, { texte: 'Bonjour, je voudrais prendre rendez-vous' });
      const e1 = elle(p4, t0 + 1000, { touche: 'Entretenir mes locks' });
      const ligne = (e1.messages[0]?.lignes ?? []).find((l) => l.titre === 'Une couleur');
      vaut('« Une couleur » dans Autre chose, ce qu elle offre dessous', ['Autre chose', 'Couleur végétale, raviver la couleur et brillance des locks'], [ligne?.section, ligne?.description]);
      vaut('la liste de l entretien avec la couleur passe les juges de Meta', [], respecteMeta(e1.messages[0]!));
      const e2 = elle(p4, t0 + 2000, { touche: 'Une couleur' });
      vaut('« Une couleur » ouvre sa liste', ['rituel', QUESTION, TITRES], [e2.etat.etape, corps(e2), lignesDe(e2)]);

      /* 5. Le conseil : le prix de la couleur passe avant ses mots de prix ; Reserver apres sa reponse ouvre la liste. */
      const p5 = avecConseil(avecLaCouleur(parcours(ORIGINAL, NUM_INCONNUE, [])));
      const c1 = elle(p5, t0, { texte: 'Combien coûte une coloration ?' });
      vaut('avec le conseil : le prix de la couleur ouvre sa liste, jamais le prix d une creation', ['rituel', TITRES], [c1.etat.etape, lignesDe(c1)]);
      const p6 = avecConseil(avecLaCouleur(parcours(ORIGINAL, NUM_INCONNUE, [])), {
        reponses: [{ id: 'r-couleur', titre: 'La couleur végétale', mots: ['couleur', 'coloration'], texte: 'Oui, avec YÈKPÈ™, notre couleur 100 % végétale.', etat: 'validee', ordre: 1 }],
      });
      const r1 = elle(p6, t0, { texte: 'Vous faites des colorations ?' });
      vrai('une question sur la couleur : la reponse de la Maison, et Reserver', r1.etat.etape === 'reponse' && boutonsDe(r1).includes('Réserver'), `${r1.etat.etape} ${boutonsDe(r1).join('/')}`);
      const r2 = elle(p6, t0 + 1000, { touche: 'Réserver' });
      vaut('Reserver apres la reponse : la liste de la couleur', ['rituel', QUESTION, TITRES], [r2.etat.etape, corps(r2), lignesDe(r2)]);
      return ecarts;
    },
    pannes: [
      { nom: 'le juge se tait sur le prix d une famille nommee', mute: [P(AUTO, '  } else if (mots.prix && familleNommeeWa(tour.texte)) {', '  } else if (false && familleNommeeWa(tour.texte)) {')] },
      { nom: 'le conseil passe avant la liste de la couleur', mute: [P(AUTO, ' && !auPrixDUnGeste) {', ') {')] },
      { nom: 'la liste de l entretien perd la couleur', mute: [P(AUTO, "...(couleurs.length > 0 ? [{ id: choix('couleur')", "...(false ? [{ id: choix('couleur')")] },
      { nom: 'Une couleur ne mene a rien', mute: [P(AUTO, "          if (g === 'couleur') {", "          if (g === 'couleur-jamais') {")] },
      { nom: 'les titres redeviennent Couleur · Couleur', mute: [P(AUTO, '    if (propre) return propre;\n', '')] },
      { nom: 'Reserver apres la reponse mene au menu', mute: [P(AUTO, '            return dire(msgDits(false) ?? msgBesoin(false, false));\n          }\n          if (g === \'reprendre\') {', '            return dire(msgBesoin(false, false));\n          }\n          if (g === \'reprendre\') {')] },
      { nom: 'les colorations au pluriel ne se lisent plus', mute: [P(AUTO, '(?:couleurs?|colorations?|colorer|teintures?|teindre|henne|yekpe)', '(?:couleur|coloration|yekpe)')] },
      { nom: 'au prix, une habituee recoit la meme chose', mute: [P(AUTO, 'const v = auPrix ? null : venueReprenable(ficheChoisie());', 'const v = venueReprenable(ficheChoisie());')] },
      { nom: 'la phrase du prix au choix disparait', mute: [P(AUTO, "const prixDit = prixAuChoix ? ' Choisissez-en un : nous vous donnons son prix.' : '';", "const prixDit = '';")] },
      { nom: 'la couleur apportee entre dans la liste', mute: [P(AUTO, 'avec votre (?:produit|couleur)/i', 'avec votre produit/i')] },
    ],
  },
  /* ══ R52 · un merci sans question n'attend rien, 31 octobre 2026 ═════
     W. N. a reçu la confirmation de son rendez-vous (le modèle du Trône) et
     a répondu « Ok ». La réception a écrit trois phrases, dont un vocal et
     un shampoing du 21 septembre : « très peu professionnel pour Maison
     MND » (Yéman). Un merci après un mot de la Maison sans question : rien
     ne part, avant même « en train d'écrire » ; la notification habituelle
     sonne, et le Trône le range avec les merci (les mêmes mots). */
  {
    id: 'R52', nom: 'R52 un merci apres un mot sans question : l automate se tait avant d ecrire ; apres une question, ok est un oui ; les memes mots que le Trone',
    eprouve: () => {
      const { ecarts, vaut, vrai } = juge();
      const t0 = cotonou('2026-10-30', '18:50');
      const tour = (texte: string, type = 'text') => tourDeLaCliente([{ waId: `wamid.m${texte.length}${type}`, quand: isoDe(t0), texte, type, sens: 'entrant' }], []);
      const CONFIRMATION = { texte: 'Bonjour W., c’est confirmé : votre rendez-vous est retenu samedi 31 octobre 2026 à 9 h. Nous vous attendons. Merci de nous prévenir en cas d’empêchement.', quand: isoDe(t0 - 60_000) };
      const QUESTION = { texte: 'Souhaitez-vous que nous gardions mardi à 10 h ?', quand: isoDe(t0 - 60_000) };
      vaut('Ok, Merci beaucoup, un pouce apres la confirmation : rien a repondre', [true, true, true],
        [unMerciSansSuite(tour('Ok'), CONFIRMATION), unMerciSansSuite(tour('Merci beaucoup !'), CONFIRMATION), unMerciSansSuite(tour('👍'), CONFIRMATION)]);
      /* Une photo puis « Merci », dans la même rafale : la photo attend un regard. */
      const photoPuisMerci = tourDeLaCliente([
        { waId: 'wamid.photo', quand: isoDe(t0 - 5_000), texte: '', type: 'image', sens: 'entrant' },
        { waId: 'wamid.merci', quand: isoDe(t0), texte: 'Merci', type: 'text', sens: 'entrant' },
      ], []);
      vaut('ok apres une question, une question, une demande, une photo puis merci, aucun mot de la Maison : la reception parle', [false, false, false, false, false],
        [unMerciSansSuite(tour('Ok'), QUESTION), unMerciSansSuite(tour('Ok, et pour une couleur ?'), CONFIRMATION), unMerciSansSuite(tour('Merci. Je voudrais aussi une couleur'), CONFIRMATION),
          unMerciSansSuite(photoPuisMerci, CONFIRMATION), unMerciSansSuite(tour('Ok'), null)]);
      vaut('oui n est pas un merci', false, estUnMerci('oui'));
      const pur = lf(lit('src/shared/a-traiter-pur.ts'));
      vrai('le Trone lit le merci de l automate, sans copie de ses mots', pur.includes("import { estUnMerci } from './automate-wa';") && !pur.includes('MOTS_DU_MERCI'));
      const src = lf(lit(F_AUTO));
      const recep = src.indexOf('/* ⑤ bis LA RÉCEPTION');
      const silence = src.indexOf('if (unMerciSansSuite(tour, await leDernierMotDeLaMaison(sb, o.numero))) {', recep);
      const peut = src.indexOf('if (!laReceptionPeutParler(fil, tour, ctxLeger,', recep);
      const ecrit = src.indexOf('await enTrainDEcrire(', recep);
      vrai('le serveur se tait sur le merci apres laReceptionPeutParler et avant en train d ecrire', recep > 0 && peut > recep && silence > peut && ecrit > silence, { peut, silence, ecrit });
      vrai('... sans un mot ni le secours : pris faux, la notification habituelle', /if \(unMerciSansSuite\(tour, await leDernierMotDeLaMaison\(sb, o\.numero\)\)\) \{ dis\('[^']+'\); return \{ pris: false \}; \}/.test(src));
      const dernier = corpsTs(src, 'async function leDernierMotDeLaMaison(');
      vrai('le dernier mot de la Maison : un message sortant, le plus recent, remis', dernier.includes(".eq('data->>sens', 'sortant')") && dernier.includes(".order('data->>quand', { ascending: false })") && dernier.includes("x.etat !== 'non-remis'"));
      return ecarts;
    },
    pannes: [
      { nom: 'ok apres une question tenu pour un merci', mute: [P(AUTO, "return estUnMerci(tour.texte) && !dernier.texte.includes('?');", 'return estUnMerci(tour.texte);')] },
      { nom: 'une photo avec merci tenue pour un merci', mute: [P(AUTO, 'if (tour.media || tour.choix || !dernier) return false;', 'if (!dernier) return false;')] },
      { nom: 'le serveur oublie le merci', mute: [P(F_AUTO, "    if (unMerciSansSuite(tour, await leDernierMotDeLaMaison(sb, o.numero))) { dis('un merci sans question : rien a repondre'); return { pris: false }; }\n", '')] },
      { nom: 'le merci juge apres en train d ecrire', mute: [
        P(F_AUTO, "    if (unMerciSansSuite(tour, await leDernierMotDeLaMaison(sb, o.numero))) { dis('un merci sans question : rien a repondre'); return { pris: false }; }\n", ''),
        P(F_AUTO, '      dejaEcrit = true;\n', "      dejaEcrit = true;\n    if (unMerciSansSuite(tour, await leDernierMotDeLaMaison(sb, o.numero))) { dis('un merci sans question : rien a repondre'); return { pris: false }; }\n"),
      ] },
      { nom: 'un message refuse par Meta compte comme le dernier mot', mute: [P(F_AUTO, "find((x) => x.etat !== 'non-remis' && typeof x.quand === 'string')", "find((x) => typeof x.quand === 'string')")] },
      { nom: 'le Trone garde sa copie des mots', mute: [P('src/shared/a-traiter-pur.ts', "export { estUnMerci };\n", "export { estUnMerci };\nconst MOTS_DU_MERCI = new Set(['merci']);\n")] },
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
