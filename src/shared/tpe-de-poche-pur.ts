/* ══ LE TPE DE POCHE — 25 novembre 2026 ════════════════════════════════
   « Create a terminal of payment for the Trône, a TPE, and I can give the
   access to certain employees to activate it on their phone and collect
   payment from customers » (Yéman). Maquette RsVNQvgB85ZvDVjaKuMrqP, lot 1
   lancé au sélecteur (« Construire le lot 1 maintenant »).

   LE CHEMIN. La direction coche « Peut encaisser » pour un membre de
   l'équipe, puis « Activer un téléphone » : un code de huit signes, valable
   dix minutes, s'affiche en QR. Le téléphone l'ouvre (tpe.html), la fonction
   `tpe-de-poche` lui rend un jeton d'appareil (32 octets, gardé ici en
   empreinte seulement), et le téléphone choisit son code à quatre chiffres.
   Il voit alors les rendez-vous du jour de sa branche ; « Encaisser » ouvre
   la page « Régler » du rendez-vous, celle que la cliente reçoit déjà sur
   WhatsApp, en mode TPE. L'argent ne s'écrit qu'à la confirmation de MTN ou
   de KkiaPay, par `regler-la-seance` et `collecte-mtn`, comme avant.

   LE LOT 1 N'ENCAISSE QUE LES SÉANCES QUI ONT LEUR PIÈCE (le Trône l'écrit à
   « Terminer ») : la page « Régler » n'encaisse un rendez-vous sans pièce que
   si Ma Couronne l'a ouvert. Une séance pas encore terminée se dit, et ne
   s'ouvre pas.

   ENTRE SES REPÈRES ⟨tpe-de-poche⟩, CE MODULE SE RECOPIE TEL QUEL dans la
   fonction `tpe-de-poche` ; `scripts/verifie-le-tpe-de-poche.mjs` tient la
   copie caractère pour caractère. Pur, sans import. */

/* ⟨tpe-de-poche⟩ */
/** L'alphabet des codes d'activation : sans 0, o, 1, i ni l (lus à voix haute). */
export const ALPHABET_DU_TPE = '23456789abcdefghjkmnpqrstuvwxyz';
/** Huit signes : 31⁸ ≈ 8,5 × 10¹¹ codes, pour dix minutes de vie. */
export const LONGUEUR_DU_CODE_DU_TPE = 8;
/** Un code d'activation vit dix minutes. */
export const DUREE_DU_CODE_DU_TPE_MS = 10 * 60_000;
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DU_TPE_MS = 3_600_000;
/** Le téléphone se verrouille après deux minutes sans un toucher. */
export const VERROU_DU_TPE_MS = 2 * 60_000;

/** Le code tel qu'on l'a tapé ou scanné : minuscules, sans espace ni tiret. */
export const codeDuTpePropre = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[\s-]+/g, '');

/** Un code bien formé : huit signes de l'alphabet. */
export const estUnCodeDuTpe = (s: unknown): boolean =>
  typeof s === 'string' && s.length === LONGUEUR_DU_CODE_DU_TPE && [...s].every((c) => ALPHABET_DU_TPE.includes(c));

/** Le code dit à l'écran : « 4k7m-9q2x ». */
export const codeDuTpeDit = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Un code tiré de huit nombres aléatoires (crypto.getRandomValues). */
export function tireUnCodeDuTpe(aleas: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < LONGUEUR_DU_CODE_DU_TPE; i++) s += ALPHABET_DU_TPE[(Number(aleas[i]) >>> 0) % ALPHABET_DU_TPE.length];
  return s;
}

/** Le jeton d'un téléphone : 32 octets en base64url, 43 signes. */
export const estUnJetonDAppareil = (s: unknown): boolean => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Le jour de Cotonou d'un instant : « 2026-11-25 ». */
export const jourDuTpe = (ms: number): string => new Date(ms + DECALAGE_DU_TPE_MS).toISOString().slice(0, 10);

/** La clé d'une ligne : une branche, un membre de l'équipe. */
export const idDuTpe = (branchId: string, membreId: string): string => `${branchId}:${membreId}`;

/** Le nom d'un téléphone, tel qu'il se présente, court et sans balise. */
export const nomDAppareil = (s: unknown): string => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** La ligne de la table `tpe_de_poche`, telle que la base la rend. */
export type LigneDuTpe = {
  id: string; branch_id: string; membre_id: string; nom: string; autorise: boolean;
  appareil_empreinte?: string | null; appareil_nom?: string | null; active_le?: string | null; coupe_le?: string | null;
  activation_empreinte?: string | null; activation_expire_le?: string | null; derniere_vue_le?: string | null;
};

/** Où en est le TPE d'un membre :
    `sans` (pas autorisé), `pret` (autorisé, aucun téléphone), `code` (un code
    attend d'être scanné), `actif` (un téléphone encaisse), `coupe` (la
    direction l'a arrêté ; « Activer » le rouvre). */
export type EtatDuTpe = 'sans' | 'pret' | 'code' | 'actif' | 'coupe';
export function etatDuTpe(l: Pick<LigneDuTpe, 'autorise' | 'appareil_empreinte' | 'activation_empreinte' | 'activation_expire_le' | 'coupe_le'> | null | undefined, maintenantMs: number): EtatDuTpe {
  if (!l || !l.autorise) return 'sans';
  if (l.appareil_empreinte) return 'actif';
  if (l.activation_empreinte && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs) return 'code';
  if (l.coupe_le) return 'coupe';
  return 'pret';
}

/** Un code d'activation encore bon pour cette ligne. */
export const codeEncoreBon = (l: Pick<LigneDuTpe, 'autorise' | 'activation_expire_le'> | null | undefined, maintenantMs: number): boolean =>
  !!l && l.autorise === true && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs;

/** La marque qu'un TPE pose sur le lien de règlement du rendez-vous qu'il
    ouvre : qui, et quand. Le Trône en tire son journal du jour. */
export type MarqueDuTpe = { nom: string; membreId: string; le: string };

/** Le rendez-vous tel que le TPE le lit. */
export type RdvDuTpe = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; clientName?: string;
  serviceIds?: string[];
  lienDeReglement?: { jeton?: string; payeLe?: string; tpe?: MarqueDuTpe } | null;
};

/** Les rendez-vous d'un jour qu'un TPE montre : ce jour-là, jamais un
    annulé, dans l'ordre de l'heure. */
export function rdvsDuJourAuTpe<R extends RdvDuTpe>(rdvs: readonly R[], jour: string): R[] {
  return rdvs
    .filter((r) => r && String(r.date ?? '').slice(0, 10) === jour && r.status !== 'annulé')
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')) || String(a.id).localeCompare(String(b.id)));
}

/** Ce qu'un rendez-vous permet au TPE : encaisser (il a sa pièce et doit
    encore), rien (réglé), ou attendre que le Trône termine la séance. */
export type EtatAuTpe = 'a-encaisser' | 'reglee' | 'pas-terminee';
export function etatAuTpe(aUnePiece: boolean, resteXof: number | null): EtatAuTpe {
  if (!aUnePiece) return 'pas-terminee';
  return resteXof !== null && resteXof <= 0 ? 'reglee' : 'a-encaisser';
}

/** Ce que le téléphone reçoit d'un rendez-vous : rien d'autre que ce qu'il
    affiche. Ni numéro, ni nom de famille. */
export type LigneDuJourAuTpe = {
  id: string; heure: string; prenom: string; prestations: string; etat: EtatAuTpe; resteXof: number | null; essai: boolean;
};

/** Le téléphone se verrouille-t-il ? Deux minutes sans un toucher. */
export const tpeAVerrouiller = (dernierToucherMs: number, maintenantMs: number): boolean =>
  !(dernierToucherMs > 0) || maintenantMs - dernierToucherMs >= VERROU_DU_TPE_MS;

/** Un code à quatre chiffres. */
export const estUnCodeSecretDuTpe = (s: unknown): boolean => typeof s === 'string' && /^\d{4}$/.test(s);
/* ⟨/tpe-de-poche⟩ */

/** L'adresse que le QR d'activation porte, à côté du Trône servi : aucun nom
    de domaine écrit ici (la règle de la Maison), l'origine et le chemin
    viennent de la page qui l'affiche. */
export function adresseDActivation(origine: string, cheminDuTrone: string, code: string): string {
  const base = cheminDuTrone.endsWith('/') ? cheminDuTrone : `${cheminDuTrone}/`;
  return `${origine}${base}tpe.html?a=${encodeURIComponent(code)}`;
}

/** L'adresse de la page « Régler » d'un lien, en mode TPE (`tpe=1`), à côté
    de la page qui la demande. */
export function adresseDuReglementAuTpe(cheminDuSite: string, jetonDuLien: string): string {
  const base = cheminDuSite.endsWith('/') ? cheminDuSite : `${cheminDuSite}/`;
  return `${base}payer.html?tg=r-${encodeURIComponent(jetonDuLien)}&tpe=1`;
}
