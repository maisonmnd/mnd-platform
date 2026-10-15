import { nombreEnChiffres } from './lettres';

/* ══ L'ANNÉE PRÉPARATOIRE — 15 octobre 2026 ═══════════════════════════
   « Comment je gère les petites filles de 15 ans qui ne sont plus à l'école
   et qui souhaitent faire une formation à MND ? Elles sont nombreuses »
   (Yéman). Maquette Ak2z4MUF… validée (« construis »), choix cochés : le
   nom « L'année préparatoire », cinq matinées par semaine, 25 000 F
   d'inscription puis 15 000 F par mois, une classe de huit, seulement le
   métier (le CEP reste à leur charge), la rentrée de janvier 2027, et à 18
   ans l'entretien de La Relève directement.

   UNE FORMATION, PAS UN EMPLOI : des mineures. Les parents inscrivent ;
   jamais le soir, aucun produit chimique, jamais seule sur une cliente,
   jamais « petite main ». Leurs données ne se lisent que par la direction
   (0131) et s'effacent après l'année.

   CE FICHIER EST PUR : le site de l'Académie, le Trône et le banc lisent
   les mêmes règles. */

export const NOM_DE_LA_PREPARATOIRE = 'L’année préparatoire';
export const TABLE_DE_LA_PREPARATOIRE = 'preparatoire_inscriptions';

export type AnneePreparatoire = { cle: string; rentree: string; finDit: string; mois: number; places: number };
/** L'année ouverte : de janvier à septembre 2027, neuf mois, huit places. */
export const ANNEE: AnneePreparatoire = { cle: '2027-01', rentree: '2027-01-04', finDit: 'septembre 2027', mois: 9, places: 8 };
export const AGE_DE_LA_PREPARATOIRE = { min: 15, max: 17 } as const;
export const RYTHME = 'Cinq matinées par semaine';
/** Le prix, comme une école : l'inscription, puis chaque mois. */
export const PRIX = { inscriptionXof: 25000, moisXof: 15000 } as const;
export const totalDeLAnnee = (a: AnneePreparatoire = ANNEE): number => PRIX.inscriptionXof + PRIX.moisXof * a.mois;
export const prixDit = (a: AnneePreparatoire = ANNEE): string =>
  `${nombreEnChiffres(PRIX.inscriptionXof)} F d’inscription, puis ${nombreEnChiffres(PRIX.moisXof)} F par mois pendant ${a.mois} mois, soit ${nombreEnChiffres(totalDeLAnnee(a))} F l’année`;

export const LIENS = ['Sa mère', 'Son père', 'Sa tutrice ou son tuteur'] as const;
export const CLASSES_PREP = ['CI à CM2', '6e', '5e', '4e', '3e', 'Jamais scolarisée'] as const;

export type InscriptionPreparatoire = {
  parent: { nom: string; telephone: string; lien: string };
  jeune: { prenom: string; nom: string; naissance: string; classe: string };
  mains: string;
  pourquoi: string;
  consentement: boolean;
};
export const inscriptionVide = (): InscriptionPreparatoire => ({
  parent: { nom: '', telephone: '', lien: '' }, jeune: { prenom: '', nom: '', naissance: '', classe: '' },
  mains: '', pourquoi: '', consentement: false,
});
export const MIN_POURQUOI = 60;

const ageAu = (naissance: string, jour: string): number | null => {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance ?? '');
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour ?? '');
  if (!n || !j) return null;
  let x = Number(j[1]) - Number(n[1]);
  if (Number(j[2]) < Number(n[2]) || (j[2] === n[2] && Number(j[3]) < Number(n[3]))) x -= 1;
  return x;
};
export const ageALaRentreePrep = (naissance: string, a: AnneePreparatoire = ANNEE): number | null => ageAu(naissance, a.rentree);

/** Ce que l'écran dit de l'âge : une orientation, jamais un refus. */
export function ditLAgePrep(naissance: string, a: AnneePreparatoire = ANNEE): string {
  const x = ageALaRentreePrep(naissance, a);
  if (x === null) return '';
  if (x >= 18) return `Elle aura ${x} ans à la rentrée : à 18 ans, c’est La Relève qui l’attend. Sa demande sera lue.`;
  if (x < AGE_DE_LA_PREPARATOIRE.min) return `Elle aura ${x} ans à la rentrée : l’année préparatoire commence à 15 ans. Sa demande sera lue.`;
  return `Elle aura ${x} ans à la rentrée de janvier 2027.`;
}

const telephoneSuffit = (t: string): boolean => String(t ?? '').replace(/\D/g, '').length >= 8;
/** Ce qui manque à l'inscription ; '' : elle peut partir. */
export function manqueALInscription(i: InscriptionPreparatoire, a: AnneePreparatoire = ANNEE): string {
  if (!i.parent.nom.trim()) return 'Écrivez votre prénom et votre nom.';
  if (!telephoneSuffit(i.parent.telephone)) return 'Il nous faut votre numéro WhatsApp pour vous répondre.';
  if (!i.parent.lien) return 'Dites-nous qui vous êtes pour elle.';
  if (!i.jeune.prenom.trim() || !i.jeune.nom.trim()) return 'Écrivez son prénom et son nom.';
  const x = ageALaRentreePrep(i.jeune.naissance, a);
  if (x === null) return 'Il nous faut sa date de naissance.';
  if (x < 12 || x > 25) return 'Vérifiez sa date de naissance.';
  if (!i.jeune.classe) return 'Choisissez sa dernière classe.';
  if (i.pourquoi.trim().length < MIN_POURQUOI) return 'Quelques phrases d’elle, encore : pourquoi ce métier.';
  if (!i.consentement) return 'Cochez la case pour envoyer.';
  return '';
}

const ch = (v: unknown, max: number): string => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
/** Une ligne de la boîte relue au Trône : des chaînes bornées ; null si elle ne se lit pas. */
export function inscriptionNettoyee(brut: unknown): InscriptionPreparatoire | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as Record<string, unknown>;
  const p = (b.parent ?? {}) as Record<string, unknown>;
  const j = (b.jeune ?? {}) as Record<string, unknown>;
  const i: InscriptionPreparatoire = {
    parent: { nom: ch(p.nom, 80), telephone: ch(p.telephone, 30), lien: (LIENS as readonly string[]).includes(String(p.lien)) ? String(p.lien) : '' },
    jeune: { prenom: ch(j.prenom, 60), nom: ch(j.nom, 60), naissance: /^\d{4}-\d{2}-\d{2}$/.test(String(j.naissance ?? '')) ? String(j.naissance) : '', classe: ch(j.classe, 40) },
    mains: ch(b.mains, 300),
    pourquoi: ch(b.pourquoi, 1500),
    consentement: b.consentement === true,
  };
  return i.parent.nom && telephoneSuffit(i.parent.telephone) && i.jeune.prenom ? i : null;
}

/* ── LE SUIVI AU TRÔNE ── */
export type StatutPrep = 'nouvelle' | 'entretien' | 'inscrite' | 'ecartee';
export const STATUTS_PREP: Record<StatutPrep, string> = { nouvelle: 'Nouvelle', entretien: 'Entretien prévu', inscrite: 'Inscrite', ecartee: 'Écartée' };
export type SuiviPrep = { statut?: StatutPrep; entretienLe?: string; inscriptionRegleeLe?: string; note?: string };
/** Les places prises : les inscrites de l'année, jamais plus que la classe. */
export const placesPrises = (lignes: readonly { suivi?: SuiviPrep; annee?: string }[], a: AnneePreparatoire = ANNEE): number =>
  lignes.filter((l) => (l.annee ?? a.cle) === a.cle && l.suivi?.statut === 'inscrite').length;
export const classePleine = (lignes: readonly { suivi?: SuiviPrep; annee?: string }[], a: AnneePreparatoire = ANNEE): boolean =>
  placesPrises(lignes, a) >= a.places;
