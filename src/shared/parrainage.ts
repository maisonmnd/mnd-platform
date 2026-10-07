import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Demande } from './demandes';
import type { Client } from './clients';
import { FORME_DU_CODE, codeDeMarraine, prenomDuNom, type SoinOffert } from './parrainage-pur';

/* LE PARRAINAGE — 28 septembre 2026, maquette « La communauté MND » validée
   (« construis avec les patterns réels de la marque », Yéman).

   UNE MARRAINE est une demande du site, genre `prospect`, profil
   « Marraine », qui porte `codeParrain` : c'est la fonction Edge
   `demande-submit` qui l'écrit, jamais le navigateur (mode `parrainage`).
   UNE FILLEULE est une réservation du site dont le code a été reconnu comme
   un code de marraine (`codeRaison: 'parrainage'`, `parrainDe`) : nouvelle
   cliente seulement, jamais la marraine elle-même.

   Ce fichier ne décide rien que la fonction ne décide déjà : il range, pour
   l'écran Parrainages, ce que la base contient. La FORME du code est le seul
   contrat entre les deux rives ; `verifie-le-parrainage` l'éprouve des deux
   côtés. */

export { FORME_DU_CODE, SIGNES_DU_CODE, racineDuCode, codeDeMarraine, lienDuParrainage, soinsEnAttente, prenomDuNom, MODELES_DE_CARTE } from './parrainage-pur';
export type { SoinOffert, ModeleDeCarte, ResumeParrainage } from './parrainage-pur';

/* ── LES CADEAUX, ÉCRITS PAR LA MAISON ─────────────────────────────────
   Des phrases, pas des montants : « un lavage offert », « 10 % sur la
   première visite ». La fonction les lit (clef de service) et les rend à la
   page quand le code est créé ; le site n'en invente aucun. */
export type ReglageParrainage = {
  actif: boolean;
  cadeauFilleule: string;
  cadeauMarraine: string;
  /** LE SOIN DE LA MARRAINE, pris au catalogue (28 septembre 2026) : la
      caisse passe cette prestation à 100 % quand elle le consomme. Sans lui,
      le soin se pose quand même, et la caisse l'offre sur la ligne choisie. */
  soinMarraineServiceId?: string;
  /** Le remerciement part tout seul sur WhatsApp (modèle `parrainage_merci`)
      dès que Meta l'a approuvé. Éteint par défaut. */
  merciParWhatsApp?: boolean;
  /* LES AMBASSADRICES — 28 septembre 2026 (voir shared/ambassade). */
  remisePct?: number;
  echoPct?: number;
  validiteMois?: number;
  bonusRangs?: Partial<Record<'tresse' | 'couronne' | 'reine', string>>;
  defi?: { actif: boolean; objectif: number; serviceId?: string };
  /** Le classement du mois se montre dans Ma Couronne (au prénom seul). */
  classementVisible?: boolean;
  /** LA REMISE DE BIENVENUE DE L'AMIE (7 octobre 2026) : son pourcentage
      (20 par défaut) et les familles d'entretien qu'elle couvre. Sans
      famille cochée, pas de remise : la phrase du cadeau reprend sa place.
      Voir `remiseDeBienvenue` (parrainage-pur). */
  remiseBienvenuePct?: number;
  remiseBienvenueFamilles?: string[];
};

export const REGLAGE_PARRAINAGE_DEFAUT: ReglageParrainage = {
  actif: true,
  cadeauFilleule: '',
  cadeauMarraine: '',
};

export const parrainageStore = createStore<ReglageParrainage>('mnd_parrainage', REGLAGE_PARRAINAGE_DEFAUT);
export const useParrainage = () => useStore(parrainageStore);
bindDocument(parrainageStore, 'mnd_parrainage');

/* ── LES DEMANDES DU SITE, TELLES QUE LE PARRAINAGE LES LIT ─────────── */
export type DemandeParrainee = Demande & {
  codeParrain?: string;
  code?: string;
  codeRaison?: string;
  parrainDe?: string;
  marraineId?: string;
  marraineClientId?: string;
  /** La récompense de la marraine a été posée (ou remise à la main). */
  cadeauMarraineRemisLe?: string;
  merciEnvoyeLe?: string;
};

export type FicheLue = Pick<Client, 'id' | 'name' | 'phone' | 'since'> & Partial<Pick<Client, 'codeParrain' | 'archived' | 'soinsOfferts' | 'parrainage' | 'phone2'>>;

/* ══ LA CARTE DE CHAQUE CLIENTE — 28 septembre 2026 ═════════════════════
   Le code de chaque fiche. Les amies, les récompenses, les rangs : voir
   `shared/ambassade`. */

/** Les huit derniers chiffres d'un numéro : la même règle que la fonction. */
export const huitDerniers = (t: string | undefined): string => String(t ?? '').replace(/\D/g, '').slice(-8);

/** Un hasard DÉTERMINISTE, tiré de l'identifiant de la fiche : deux postes
    du Trône qui attribuent en même temps écrivent le MÊME code. */
function graine(texte: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** LES CODES À POSER : chaque fiche vivante qui n'en a pas. Une cliente qui a
    déjà demandé son code sur le site (même numéro) GARDE ce code-là : il a
    peut-être déjà été partagé. Sinon, un code tiré de son prénom, unique
    parmi les fiches ET les marraines du site. */
export function codesAAttribuer(clients: readonly FicheLue[], demandes: readonly DemandeParrainee[]): { clientId: string; code: string }[] {
  const desFiches = new Set(clients.map((c) => c?.codeParrain).filter(Boolean) as string[]);
  const duSite = new Map<string, string>();
  for (const d of demandes) {
    if (d?.codeParrain && FORME_DU_CODE.test(d.codeParrain) && huitDerniers(d.telephone).length === 8) duSite.set(huitDerniers(d.telephone), d.codeParrain);
  }
  const pris = new Set<string>([...desFiches, ...duSite.values()]);
  const sortie: { clientId: string; code: string }[] = [];
  const aPoser = clients.filter((c) => c && !c.archived && !c.codeParrain).sort((a, b) => a.id.localeCompare(b.id));
  for (const c of aPoser) {
    const adopte = duSite.get(huitDerniers(c.phone));
    if (adopte && !desFiches.has(adopte)) {
      desFiches.add(adopte);
      sortie.push({ clientId: c.id, code: adopte });
      continue;
    }
    for (let essai = 0; essai < 40; essai++) {
      const code = codeDeMarraine(prenomDuNom(c.name), graine(`${c.id}:${essai}`));
      if (!pris.has(code)) {
        pris.add(code);
        desFiches.add(code);
        sortie.push({ clientId: c.id, code });
        break;
      }
    }
  }
  return sortie;
}

/** LE SOIN CONSOMMÉ À LA CAISSE : daté, avec la pièce. Un soin déjà utilisé
    ne se rouvre pas. */
export function soinUtilise(soins: readonly SoinOffert[] | undefined, id: string, piece: string, quand: string, precise: Partial<SoinOffert> = {}): SoinOffert[] {
  return (soins ?? []).map((s) => (s.id === id && !s.utiliseLe ? { ...s, ...precise, utiliseLe: quand, piece } : s));
}
