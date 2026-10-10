import type { Bilan } from './bilans';
import type { BilanPdfData } from './pdf';
import { appelDe, civiliteDe, prenomSeul } from './civilite';
import { maisonNom, signeLeMessage } from './identite';
import { envoieSurWhatsApp, jourDit, type ResultatDEnvoi } from './whatsapp';
import { pushToClient } from './push';
import { INGREDIENTS } from '../apps/revelateur/communaute';

/* LE BILAN, HORS DU TRÔNE — 4 octobre 2026.

   Ce qui transforme un bilan signé en papier (le PDF Maison MND), en message
   (WhatsApp, la pièce jointe), et en signe dans sa poche (la notification de
   Ma Couronne). Le Trône et Ma Couronne lisent le même document : un seul
   endroit dit ce qu'il porte. */

type Porteuse = { name: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean };

/** « 4 octobre 2026 ». */
export const dateDite = (iso: string): string => {
  const j = jourDit(iso);
  const a = (iso ?? '').slice(0, 4);
  return /^\d{4}$/.test(a) ? `${j} ${a}` : j;
};

/** « Madame Awa K. » : la civilité, le prénom, l'initiale. Le papier peut
    sortir de ses mains : il ne porte pas son nom entier. */
export function pourQuiDuBilan(c: Porteuse): string {
  const mots = (c.name ?? '').trim().split(/\s+/).filter(Boolean);
  const civ = { madame: 'Madame', mademoiselle: 'Mademoiselle', monsieur: 'Monsieur' }[civiliteDe(c)];
  const initiale = mots.length > 1 ? ` ${mots[mots.length - 1][0].toUpperCase()}.` : '';
  return `${civ} ${prenomSeul(c.name)}${initiale}`.trim();
}

const nomDe = (slug: string) => INGREDIENTS.find((i) => i.slug === slug)?.nom ?? slug;

export function donneesDuBilanPdf(b: Bilan, c: Porteuse): BilanPdfData {
  return {
    houseName: maisonNom(),
    numero: b.numero,
    pourQui: pourQuiDuBilan(c),
    dateSeance: dateDite(b.date),
    prestation: b.prestation,
    praticien: b.praticien,
    diagnostic: b.diagnostic,
    sens: b.sens,
    solutions: b.solutions,
    propositions: (b.propositions ?? []).map((p) => ({ nom: p.nom, quand: p.quand })),
    points: b.points,
    jauges: b.jauges,
    rituel: b.rituel.map((t) => ({ ...t, ingredients: (t.ingredients ?? []).map(nomDe) })),
    prochaineVisite: b.prochaineVisite,
    remisLe: dateDite(b.remisLe),
    filename: `Bilan-${b.numero}.pdf`,
  };
}

/** LE MOT QUI ACCOMPAGNE LE PDF. Celui de l'assistant s'il existe, relu par le
    maître ; sinon celui de la Maison. Toujours signé de la devise. */
export function messageDuBilan(b: Bilan, c: Porteuse): string {
  const mot = b.message?.trim()
    || `Bonjour ${appelDe(c)}, voici le bilan de votre séance du ${dateDite(b.date)}, avec votre routine à la maison. Vous le retrouvez aussi dans Ma Couronne.`;
  return signeLeMessage(mot);
}

/* LE JOUR DE LA SÉANCE SE DIT AVEC SON ANNÉE (10 octobre 2026, revue) : le
   message, le modèle et la notification lisaient `jourDit` (« 4 octobre »),
   quand le PDF disait déjà « 4 octobre 2026 ». Règle de la Maison sur toute
   date qu'une cliente lit. */

/** LE MODÈLE META DU BILAN, en-tête document — à faire approuver (docs/
    BRANCHER-ENVOIS.md). Variables : {{1}} son appel, {{2}} le jour. */
export const MODELE_BILAN = 'bilan_de_seance';

/** Les deux variables du modèle : « Madame Awa », « 4 octobre 2026 ». */
export const variablesDuModeleBilan = (b: Bilan, c: Porteuse): string[] => [appelDe(c), dateDite(b.date)];

/** Ce que dit la notification de Ma Couronne. */
export const annonceDuBilan = (b: Bilan, c: Porteuse): string =>
  `${appelDe(c)}, votre bilan du ${dateDite(b.date)} est prêt, avec votre routine à la maison.`;

/** ENVOIE LE BILAN SUR WHATSAPP. Dans la fenêtre de 24 heures, le PDF part
    avec le mot du bilan ; hors fenêtre, le modèle `bilan_de_seance` le porte
    en en-tête. Tant que Meta ne l'a pas approuvé, le refus est dit tel quel. */
export async function envoieLeBilan(
  b: Bilan,
  c: Porteuse & { id: string; phone: string; branchId: string },
  parQui?: string,
): Promise<ResultatDEnvoi> {
  const { bilanEnPiece } = await import('./pdf');
  const piece = await bilanEnPiece(donneesDuBilanPdf(b, c));
  let r = await envoieSurWhatsApp({
    numero: c.phone, texte: messageDuBilan(b, c), piece, clientId: c.id, branchId: c.branchId, parQui,
  });
  if (!r.ok && /fenêtre/i.test(r.erreur)) {
    r = await envoieSurWhatsApp({
      numero: c.phone, modele: MODELE_BILAN, variables: variablesDuModeleBilan(b, c),
      enTete: 'document', piece, clientId: c.id, branchId: c.branchId, parQui,
    });
  }
  return r;
}

/** LA NOTIFICATION DE MA COURONNE, à la signature. */
export function annonceLeBilan(b: Bilan, c: Porteuse & { id: string; email?: string }): Promise<number> {
  return pushToClient(
    c.id,
    `${maisonNom()} · votre bilan`,
    annonceDuBilan(b, c),
    '/couronne/',
    c.email,
  ).catch(() => 0);
}
