/* ══ VOS ÉTOILES — 22 novembre 2026 ═════════════════════════════════════

   « Parfois les clients sont pressés et n'ont pas le temps de laisser un
   commentaire. Construis la récupération d'avis Google intelligente », puis :
   « easy, rapide et sans prise de tête. Laissez-nous vos étoiles, beauté.
   Stratégique, ça vient au bon moment ! » (Yéman).

   CE QUI CHANGE. La demande d'avis partait dans l'heure qui suit la facture
   réglée, avec « Votre avis nous aide » et un lien dans le texte : elle
   demandait d'écrire à une cliente qui rentrait chez elle. Sur les 31
   demandes parties en deux mois, 14 n'ont jamais été ouvertes.

   · DES ÉTOILES, PAS UN COMMENTAIRE. Le modèle neuf (`vos_etoiles`) dit
     « Laissez-nous vos étoiles, beauté. Un toucher suffit, rien à écrire. »
     et porte UN bouton, « Donner mes étoiles ». Google accepte une note sans
     texte.
   · AU BON MOMENT. Par défaut, le soir même à 19 h, au calme ; au choix dans
     Paramètres, aussitôt réglé. Réglé trop tard pour partir avant les heures
     calmes : le lendemain à 12 h 30, jamais à 8 h.
   · LE TOUCHER SE SAIT. Le bouton porte un jeton : la page de la Maison le
     dit à la fonction `avis-google`, qui note « touché » et rend le lien de
     Google. Aucune adresse n'est écrite ici : la base du bouton vit dans le
     modèle, chez Meta.
   · UN RAPPEL, UN SEUL (`vos_etoiles_rappel`), le lendemain à la même heure,
     seulement si elle n'a pas touché son bouton. Vingt heures au moins après
     la demande : la porte des modèles ne laisse jamais partir deux fois le
     même événement en vingt heures.
   · JAMAIS TOUCHÉ : la Maison redemande à sa prochaine venue, un mois plus
     tard au plus tôt, sans attendre les six mois (`demandeDAvisPermise`,
     avis-fiches-pur.ts).

   Tant que Meta n'a pas approuvé le modèle neuf (secret WA_TEMPLATE_ETOILES
   absent), l'ancien part, à la nouvelle heure, sans jeton ni rappel.

   Pur : aucun import. La fonction `avis-google` porte une copie du bloc
   ⟨etoiles⟩ (scripts/terminer-copie-serveur.mjs) ; `verifie-les-etoiles`
   rejoue la règle. */

/* ⟨etoiles⟩ */
/** Quand part la demande : le soir même à `heure` (à Cotonou), ou aussitôt réglé. */
type ReglagesDesEtoiles = { moment: 'soir' | 'aussitot'; heure: number; rappel: boolean };
const ETOILES_PAR_DEFAUT: ReglagesDesEtoiles = { moment: 'soir', heure: 19, rappel: true };
/** Ce qui ne peut plus partir avant les heures calmes part le lendemain à 12 h 30. */
const HEURE_DU_LENDEMAIN_DES_ETOILES = 12.5;
/** Le rappel ne part que vingt heures (et dix minutes) après la demande : la
    porte des modèles retient le même événement pendant vingt heures. */
const RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS = 20 * 3_600_000 + 10 * 60_000;
/** Le cron passe chaque heure : le rappel se dépose dans l'heure qui précède son départ. */
const RAPPEL_DES_ETOILES_AVANCE_MS = 65 * 60_000;
/** Six heures après son heure, le rappel ne part plus. */
const RAPPEL_DES_ETOILES_TROP_TARD_MS = 6 * 3_600_000;
const DECALAGE_DE_COTONOU_MS = 3_600_000;
/** Le jeton du bouton : quatorze signes, sans voyelle trompeuse ni chiffre ambigu. */
const ALPHABET_DES_ETOILES = '23456789abcdefghjkmnpqrstuvwxyz';
const FORME_DU_JETON_DES_ETOILES = /^[23456789abcdefghjkmnpqrstuvwxyz]{14}$/;
/** Ce que porte le bouton : « e-<jeton> », après la base écrite dans le modèle. */
const PREFIXE_DES_ETOILES = 'e-';
const MODELE_DES_ETOILES = 'vos_etoiles';
const MODELE_DU_RAPPEL_DES_ETOILES = 'vos_etoiles_rappel';

/** Les réglages de la Maison (`mnd_auto_config.etoiles`), ou ceux d'avant. */
function reglagesDesEtoiles(cfg: unknown): ReglagesDesEtoiles {
  const e = (cfg && typeof cfg === 'object' ? (cfg as { etoiles?: unknown }).etoiles : null) as
    { moment?: unknown; heure?: unknown; rappel?: unknown } | null | undefined;
  const h = Number(e?.heure);
  return {
    moment: e?.moment === 'aussitot' ? 'aussitot' : 'soir',
    heure: e?.heure !== undefined && e?.heure !== null && Number.isFinite(h) && h >= 9 && h <= 19.5 ? Math.round(h * 2) / 2 : ETOILES_PAR_DEFAUT.heure,
    rappel: e?.rappel !== false,
  };
}
/** L'instant où il est `heure` à Cotonou, le jour (de Cotonou) de `ms`. */
function ceJourALHeureDeCotonou(heure: number, ms: number): number {
  const local = new Date(ms + DECALAGE_DE_COTONOU_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0) + Math.round(heure * 3_600_000) - DECALAGE_DE_COTONOU_MS;
}
/** Le premier instant, à partir de `apresMs`, où il est `heure` à Cotonou. */
function prochaineHeureDeCotonou(heure: number, apresMs: number): number {
  const ceJour = ceJourALHeureDeCotonou(heure, apresMs);
  return ceJour >= apresMs ? ceJour : ceJour + 86_400_000;
}
/** Les heures calmes de la salle (20 h à 8 h par défaut) : rien n'y part. */
function calmeDesEtoiles(ms: number, salle: { calmeDe: number; calmeA: number }): boolean {
  if (salle.calmeDe === salle.calmeA) return false;
  const d = new Date(ms + DECALAGE_DE_COTONOU_MS);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return salle.calmeDe < salle.calmeA ? (h >= salle.calmeDe && h < salle.calmeA) : (h >= salle.calmeDe || h < salle.calmeA);
}
/** QUAND PART LA DEMANDE. Le soir : à son heure si elle n'est pas passée,
    sinon après la salle d'attente. Aussitôt : après la salle. Ce qui tomberait
    dans les heures calmes part le lendemain à 12 h 30. */
function departDesEtoiles(maintenantMs: number, r: ReglagesDesEtoiles, salle: { salleMin: number; calmeDe: number; calmeA: number }): number {
  const apresLaSalle = maintenantMs + salle.salleMin * 60_000;
  const ceSoir = ceJourALHeureDeCotonou(r.heure, maintenantMs);
  const depart = r.moment === 'soir' && apresLaSalle <= ceSoir ? ceSoir : apresLaSalle;
  return calmeDesEtoiles(depart, salle) ? prochaineHeureDeCotonou(HEURE_DU_LENDEMAIN_DES_ETOILES, depart) : depart;
}
/** QUAND PART LE RAPPEL : le lendemain de la demande, à l'heure des étoiles,
    et jamais moins de vingt heures après elle. */
function departDuRappelDesEtoiles(envoyeMs: number, r: ReglagesDesEtoiles): number {
  return Math.max(ceJourALHeureDeCotonou(r.heure, envoyeMs + 86_400_000), envoyeMs + RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS);
}
/** LE RAPPEL EST-IL À DÉPOSER MAINTENANT ? Son heure de départ, ou `null` :
    éteint, déjà déposé, la demande pas partie, sans jeton (l'ancien modèle),
    son bouton déjà touché, pas encore l'heure, ou l'heure passée depuis trop
    longtemps. */
function rappelDesEtoilesADeposer(o: {
  statut?: unknown; envoyeLe?: unknown; toucheLe?: unknown; jeton?: unknown;
  rappelDepose: boolean; maintenantMs: number; reglages: ReglagesDesEtoiles; salleMin: number;
}): number | null {
  if (!o.reglages.rappel || o.rappelDepose || o.statut !== 'envoyé' || o.toucheLe) return null;
  if (!FORME_DU_JETON_DES_ETOILES.test(String(o.jeton ?? ''))) return null;
  const envoye = Date.parse(String(o.envoyeLe ?? ''));
  if (!Number.isFinite(envoye)) return null;
  const t = departDuRappelDesEtoiles(envoye, o.reglages);
  if (o.maintenantMs < t - RAPPEL_DES_ETOILES_AVANCE_MS || o.maintenantMs > t + RAPPEL_DES_ETOILES_TROP_TARD_MS) return null;
  return Math.max(t, o.maintenantMs + o.salleMin * 60_000);
}
/** Un jeton tiré de quatorze octets du hasard. */
function jetonDesEtoiles(octets: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < 14; i++) s += ALPHABET_DES_ETOILES[(Number(octets[i]) || 0) % ALPHABET_DES_ETOILES.length];
  return s;
}
/** Les composants du modèle : {{1}} l'appel, puis le bouton à adresse, qui porte le jeton. */
function composantsDesEtoiles(appel: string, jeton: string): unknown[] {
  return [
    { type: 'body', parameters: [{ type: 'text', text: appel }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: `${PREFIXE_DES_ETOILES}${jeton}` }] },
  ];
}
/** Ce que le fil de la Maison montre de la demande, et de son rappel. */
const texteDesEtoiles = (appel: string): string => `Bonjour ${appel}, laissez-nous vos étoiles, beauté. Un toucher suffit, rien à écrire.`;
const texteDuRappelDesEtoiles = (appel: string): string => `Bonjour ${appel}, il reste vos étoiles, beauté. Un toucher suffit, rien à écrire.`;
/* ⟨/etoiles⟩ */

export type { ReglagesDesEtoiles };
export {
  ETOILES_PAR_DEFAUT, HEURE_DU_LENDEMAIN_DES_ETOILES, RAPPEL_DES_ETOILES_AU_PLUS_TOT_MS, RAPPEL_DES_ETOILES_AVANCE_MS, RAPPEL_DES_ETOILES_TROP_TARD_MS,
  FORME_DU_JETON_DES_ETOILES, PREFIXE_DES_ETOILES, MODELE_DES_ETOILES, MODELE_DU_RAPPEL_DES_ETOILES,
  reglagesDesEtoiles, ceJourALHeureDeCotonou, prochaineHeureDeCotonou, calmeDesEtoiles, departDesEtoiles, departDuRappelDesEtoiles,
  rappelDesEtoilesADeposer, jetonDesEtoiles, composantsDesEtoiles, texteDesEtoiles, texteDuRappelDesEtoiles,
};

/* ── Ce que le Trône en dit (hors du bloc recopié) ───────────────────── */

/** Les heures proposées dans Paramètres pour « le soir même ». */
export const HEURES_DES_ETOILES: readonly number[] = [17, 18, 19, 19.5];
/** « 19 h », « 12 h 30 ». */
export const heureDite = (h: number): string => `${Math.floor(h)} h${h % 1 ? ' 30' : ''}`;
/** La phrase des Paramètres et de la rubrique des avis. */
export function ditLeMomentDesEtoiles(r: ReglagesDesEtoiles): string {
  const quand = r.moment === 'aussitot' ? 'dès que sa facture est réglée' : `le soir même à ${heureDite(r.heure)}`;
  return `La demande part ${quand}. ${r.rappel ? 'Un seul rappel le lendemain, si elle n’a pas touché son bouton.' : 'Aucun rappel.'}`;
}
/** Une demande au journal, telle que le Trône la lit. */
export type DemandeDEtoilesLue = { type?: string; statut?: string; quand?: string; etat?: string; jeton?: string; toucheLe?: string; rappelDe?: string };
/** LE BILAN, depuis un instant : combien de clientes ont reçu la demande À
    BOUTON (l'ancien modèle, sans jeton, ne se compte pas : son toucher ne
    se sait pas), combien l'ont lue, combien ont touché leur bouton, combien
    de rappels. Un rappel ne compte pas une cliente de plus. */
export function bilanDesEtoiles(envois: readonly DemandeDEtoilesLue[], depuisIso: string): { demandees: number; lues: number; touchees: number; rappels: number } {
  let demandees = 0, lues = 0, touchees = 0, rappels = 0;
  for (const e of envois) {
    if (e.type !== 'avis-google' || e.statut !== 'envoyé' || !e.jeton || String(e.quand ?? '') < depuisIso) continue;
    if (e.rappelDe) { rappels++; continue; }
    demandees++;
    if (e.etat === 'lu') lues++;
    if (e.toucheLe) touchees++;
  }
  return { demandees, lues, touchees, rappels };
}
