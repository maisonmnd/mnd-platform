/* LE CODE DE MARRAINE, SANS MAGASIN — 28 septembre 2026. Lu par le site
   (qui ne doit jamais charger la synchro du Trône) et par l'écran
   Parrainages ; la fonction Edge `demande-submit` en porte une copie, que
   `verifie-le-parrainage` confronte à celle-ci. */

/** PRENOM-XXX : six lettres du prénom au plus, un tiret, trois signes sans
    ambiguïté (ni O ni 0, ni I ni 1, ni L). */
export const FORME_DU_CODE = /^[A-Z]{1,6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
export const SIGNES_DU_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Le début du code, tiré du prénom : sans accents, lettres seules. */
export function racineDuCode(prenom: string): string {
  const r = prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return r || 'MND';
}

export function codeDeMarraine(prenom: string, hasard: () => number = Math.random): string {
  let fin = '';
  for (let i = 0; i < 3; i++) fin += SIGNES_DU_CODE[Math.floor(hasard() * SIGNES_DU_CODE.length) % SIGNES_DU_CODE.length];
  return `${racineDuCode(prenom)}-${fin}`;
}

/** Le lien que la marraine partage : la page de réservation, code posé. */
export const lienDuParrainage = (site: string, code: string): string =>
  `${site.replace(/\/?$/, '/')}reserver/?code=${encodeURIComponent(code)}`;

/* ── LA CARTE DE MARRAINE DE CHAQUE CLIENTE — 28 septembre 2026 ─────────
   Maquette « La carte de marraine MND » validée. Chaque cliente de la
   Maison a son code, sa carte et ses soins offerts ; ces trois champs vivent
   sur SA fiche (table `clients`), écrits par le Trône seul. La migration
   0110 les réimpose à toute écriture qui ne vient pas du personnel : une
   cliente lit sa carte dans Ma Couronne, elle ne s'offre pas un soin. */

export type ModeleDeCarte = 'indigo' | 'ivoire' | 'cuivre';
export const MODELES_DE_CARTE: readonly ModeleDeCarte[] = ['indigo', 'ivoire', 'cuivre'];

/** Un soin offert à la marraine quand une amie est venue grâce à elle. */
export type SoinOffert = {
  /** `parr-<id de la demande de la filleule>` : un par amie venue, jamais deux. */
  id: string;
  libelle: string;
  /** La prestation du catalogue que la caisse passe à 100 %. */
  serviceId?: string;
  /** « Pour la venue de Grâce ». */
  raison: string;
  poseLe: string;
  utiliseLe?: string;
  /** Le numéro de la facture qui l'a consommé. */
  piece?: string;
};

export type EtatDeLaFilleule = 'sans-rdv' | 'a-venir' | 'venue' | 'annulee';

/** Ce que la cliente voit de ses filleules dans Ma Couronne : un prénom,
    un état, une date. Rien d'autre ne quitte le Trône. */
export type ResumeParrainage = {
  filleules: { prenom: string; etat: EtatDeLaFilleule; date?: string }[];
};

export const soinsEnAttente = (soins: readonly SoinOffert[] | undefined): SoinOffert[] =>
  (soins ?? []).filter((s) => s && !s.utiliseLe);

/** Le prénom d'une fiche : la fiche n'a qu'un nom complet. */
export const prenomDuNom = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';
