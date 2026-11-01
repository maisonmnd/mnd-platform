/* ══ LES DÉPENSES DU JOUR POSÉES PAR UN ASSISTANT · 1er novembre 2026 ══════
   Maquette « Dépenses du jour et achats » (public/maquette-depenses-du-jour-
   et-achats.html), quatre choix tranchés au sélecteur le 1er novembre 2026 :
   Opale lit les fils de l'équipe, des fournisseurs et celui de Yéman à
   elle-même ; elle propose la dépense au sélecteur ; au toucher « Poser »,
   la fonction `assistants-maison` l'écrit « à valider » (la règle du
   31 août 2026 : une dépense saisie par un autre qu'un souverain attend un
   oui, et ne sort d'aucune caisse avant). Yéman ou Brice la valide au Trône.

   CE QUI SE JUGE ICI, sans base : la lecture de la demande (montant, objet,
   date, catégorie), la caisse, le porteur, le prestataire qui n'est jamais
   une dépense d'assistant (sa mission naît du rituel honoré), le doublon du
   jour, l'identifiant tiré de la clé du geste (le même message ne pose
   jamais deux fois), le reçu et son chemin dans le compartiment des pièces
   jointes. La fonction lit la base, ce module tranche. */

/** Un plafond de bon sens pour une dépense du jour lue dans un message. */
export const MONTANT_AU_PLUS_XOF = 2_000_000;
export const OBJET_AU_PLUS = 80;
/** Une dépense de plus de soixante jours ne se pose pas par un assistant : elle se saisit au Trône. */
export const JOURS_EN_ARRIERE = 60;
/** Le reçu, décodé : cinq mégaoctets au plus. */
export const RECU_AU_PLUS_OCTETS = 5 * 1024 * 1024;
export const TYPES_DE_RECU = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
/** La caisse quand le message n'en dit pas : celle de la Maison au quotidien. */
export const CAISSE_PAR_DEFAUT = 'Caisse Principale';
/** Le compartiment des pièces jointes (`shared/fil`, SEAU_FIL) et le dossier des dépenses (`ChampPieceJointe dossier="depense"`). */
export const COMPARTIMENT_DES_RECUS = 'fil';
export const DOSSIER_DES_RECUS = 'depense';

export const sansAccents = (s: string): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MOTS_VIDES = new Set(['les', 'des', 'pour', 'avec', 'une', 'aux', 'sur', 'par', 'dans', 'chez', 'caisse', 'principale']);

/** Les mots qui portent l'objet : trois lettres au moins, sans accents, sans les petits mots. */
export const motsDeLObjet = (t: string): string[] =>
  sansAccents(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));

const unTexteSain = (t: string, auPlus: number): string | null => {
  const v = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (v.length < 2 || v.length > auPlus) return null;
  if (/\d{8,}/.test(v.replace(/[\s.-]/g, ''))) return null;
  return v;
};

export type DemandeLue = {
  montantXof: number;
  objet: string;
  beneficiaire?: string;
  categorie: string;
  caisse?: string;
  porteur?: string;
  date: string;
  autre: boolean;
};

/** LA DEMANDE, LUE. Un montant en francs entiers (le message l'a dit, rien
    n'est deviné), un objet de deux à quatre-vingts signes sans numéro, une
    date ni future ni de plus de soixante jours, une catégorie nommée. */
export function lisLaDemandeDeDepense(
  d: Record<string, unknown>,
  aujourdhui: string,
): { ok: true; v: DemandeLue } | { ok: false; motif: string; detail?: string } {
  const brut = d.montantXof;
  const montant = typeof brut === 'number' ? brut : typeof brut === 'string' && /^\s*\d[\d\s.]*$/.test(brut) ? Number(brut.replace(/[\s.]/g, '')) : NaN;
  if (!Number.isFinite(montant) || montant <= 0) return { ok: false, motif: 'montant', detail: 'un montant en francs, plus grand que zéro' };
  if (!Number.isInteger(montant)) return { ok: false, motif: 'montant', detail: 'des francs entiers' };
  if (montant > MONTANT_AU_PLUS_XOF) return { ok: false, motif: 'montant-hors-borne', detail: `plus de ${MONTANT_AU_PLUS_XOF} F : à saisir au Trône` };
  const objet = unTexteSain(String(d.objet ?? ''), OBJET_AU_PLUS);
  if (!objet) return { ok: false, motif: 'objet', detail: `deux à ${OBJET_AU_PLUS} signes, sans numéro` };
  let beneficiaire: string | undefined;
  if (d.beneficiaire !== undefined && String(d.beneficiaire).trim()) {
    const b = unTexteSain(String(d.beneficiaire), 60);
    if (!b) return { ok: false, motif: 'beneficiaire', detail: 'deux à 60 signes, sans numéro' };
    beneficiaire = b;
  }
  const categorie = String(d.categorie ?? '').trim();
  if (!categorie) return { ok: false, motif: 'categorie' };
  let date = aujourdhui;
  if (d.date !== undefined && d.date !== '') {
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(`${d.date}T12:00:00Z`))) return { ok: false, motif: 'date-invalide' };
    if (d.date > aujourdhui) return { ok: false, motif: 'date-future' };
    const ecart = (Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${d.date}T12:00:00Z`)) / 86_400_000;
    if (ecart > JOURS_EN_ARRIERE) return { ok: false, motif: 'date-ancienne', detail: `plus de ${JOURS_EN_ARRIERE} jours : à saisir au Trône` };
    date = d.date;
  }
  const caisse = String(d.caisse ?? '').trim() || undefined;
  const porteur = String(d.porteur ?? '').trim() || undefined;
  return { ok: true, v: { montantXof: montant, objet, ...(beneficiaire ? { beneficiaire } : {}), categorie, ...(caisse ? { caisse } : {}), ...(porteur ? { porteur } : {}), date, autre: d.autre === true } };
}

/** La catégorie telle que la Maison l'écrit (« logistique » → « Logistique »), ou rien. */
export function categorieConnue(nom: string, categories: readonly { name?: unknown }[]): string | null {
  const cle = sansAccents(nom).trim();
  for (const c of categories) {
    const n = String(c.name ?? '').trim();
    if (n && sansAccents(n) === cle) return n;
  }
  return null;
}

export type CaisseLue = { name?: unknown; branchId?: unknown; archiveeLe?: unknown };
const vivantesDe = (caisses: readonly CaisseLue[], branchId: string): string[] =>
  caisses.filter((c) => String(c.branchId ?? '') === branchId && !c.archiveeLe).map((c) => String(c.name ?? '').trim()).filter(Boolean);

/** LA CAISSE : celle que le message nomme, si elle vit dans cette maison ;
    sans nom, la Caisse Principale si elle vit, sinon la première vivante. */
export function caisseDeLaDepense(
  nom: string | undefined, caisses: readonly CaisseLue[], branchId: string,
): { ok: true; caisse: string } | { ok: false; caisses: string[] } {
  const vivantes = vivantesDe(caisses, branchId);
  if (nom) {
    const trouvee = vivantes.find((c) => sansAccents(c) === sansAccents(nom).trim());
    return trouvee ? { ok: true, caisse: trouvee } : { ok: false, caisses: vivantes };
  }
  return { ok: true, caisse: vivantes.find((c) => sansAccents(c) === sansAccents(CAISSE_PAR_DEFAUT)) ?? vivantes[0] ?? CAISSE_PAR_DEFAUT };
}

/** LE PORTEUR, tel que la liste de la Maison l'écrit (« brice » → « Brice
    Ahouansou ») : le nom entier, ou un premier mot qui ne désigne qu'une
    personne. Une faute de frappe ne fabrique jamais un second porteur. */
export function porteurConnu(nom: string, liste: readonly unknown[]): string | null {
  const noms = liste.map((x) => String(x ?? '').trim()).filter(Boolean);
  const cle = sansAccents(nom).trim();
  if (!cle) return null;
  const exact = noms.find((n) => sansAccents(n) === cle);
  if (exact) return exact;
  const parPrenom = noms.filter((n) => sansAccents(n).split(/\s+/)[0] === cle.split(/\s+/)[0] && cle.split(/\s+/).length === 1);
  return parPrenom.length === 1 ? parPrenom[0] : null;
}

/** UN PRESTATAIRE N'EST JAMAIS UNE DÉPENSE D'ASSISTANT : sa mission naît
    du rituel honoré, et son paiement fait la charge Sous-traitance. Rend le
    nom du prestataire que l'objet ou le bénéficiaire nomme. */
export function prestataireNomme(textes: readonly (string | undefined)[], prestataires: readonly { name?: unknown; archived?: unknown }[]): string | null {
  const mots = new Set(textes.flatMap((t) => sansAccents(t ?? '').split(/[^a-z0-9]+/)).filter(Boolean));
  for (const p of prestataires) {
    if (p.archived === true) continue;
    const nom = String(p.name ?? '').trim();
    const premier = sansAccents(nom).split(/[^a-z0-9]+/).find((m) => m.length >= 3);
    if (premier && mots.has(premier)) return nom;
  }
  return null;
}

export type DepenseExistante = {
  id: string; branchId?: string; date?: string; amountXof?: number; label?: string; porteur?: string;
  validation?: { etat?: string; soumisPar?: string; soumisLe?: string };
};

/** LE DOUBLON DU JOUR : même maison, même date, même montant, non refusée,
    et un objet voisin (un mot porteur en commun, ou un libellé sans mot
    porteur). « Gaz 6 000 » saisi par Brice à 12 h 10 n'est pas reposé. */
export function doublonDeLaDepense(
  n: { branchId: string; date: string; amountXof: number; label: string },
  existantes: readonly DepenseExistante[],
): DepenseExistante | null {
  const siens = new Set(motsDeLObjet(n.label));
  for (const e of existantes) {
    if (String(e.branchId ?? '') !== n.branchId || e.date !== n.date) continue;
    if (Math.round(Number(e.amountXof ?? -1)) !== n.amountXof) continue;
    if (e.validation?.etat === 'refusee') continue;
    const leurs = motsDeLObjet(String(e.label ?? ''));
    if (siens.size === 0 || leurs.length === 0 || leurs.some((m) => siens.has(m))) return e;
  }
  return null;
}

/** Qui a saisi la dépense déjà là : celui qui l'a soumise, sinon son porteur, sinon la Maison. */
export const saisiePar = (e: DepenseExistante): string => String(e.validation?.soumisPar ?? '').trim() || String(e.porteur ?? '').trim() || 'la Maison';

/** Le libellé de la ligne : « bénéficiaire · objet », ou l'objet seul. */
export const libelleDeLaDepense = (objet: string, beneficiaire?: string): string => (beneficiaire ? `${beneficiaire} · ${objet}` : objet);

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** L'IDENTIFIANT TIRÉ DE LA CLÉ DU GESTE : le même message rejoué après un
    redémarrage retombe sur la même ligne, et rien ne se pose deux fois. */
export async function idDeLaDepense(assistantId: string, idempotence: string): Promise<string> {
  const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${assistantId}|${String(idempotence ?? '').trim()}`));
  return `exp-${assistantId}-${hex(new Uint8Array(h)).slice(0, 20)}`;
}

export type RecuLu = { nom: string; type: string; octets: Uint8Array };

/** LE REÇU, en base64 : un type connu, cinq mégaoctets au plus. Absent : `null`. */
export function lisLeRecu(r: unknown): { ok: true; recu: RecuLu | null } | { ok: false; motif: string } {
  if (r === undefined || r === null) return { ok: true, recu: null };
  if (typeof r !== 'object') return { ok: false, motif: 'recu-illisible' };
  const o = r as { nom?: unknown; type?: unknown; base64?: unknown };
  const type = String(o.type ?? '').toLowerCase();
  if (!(TYPES_DE_RECU as readonly string[]).includes(type)) return { ok: false, motif: 'recu-type' };
  const b64 = String(o.base64 ?? '').replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, motif: 'recu-illisible' };
  if (Math.floor((b64.length * 3) / 4) > RECU_AU_PLUS_OCTETS + 3) return { ok: false, motif: 'recu-trop-lourd' };
  let octets: Uint8Array;
  try {
    const bin = atob(b64);
    octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  } catch { return { ok: false, motif: 'recu-illisible' }; }
  if (octets.length === 0) return { ok: false, motif: 'recu-illisible' };
  if (octets.length > RECU_AU_PLUS_OCTETS) return { ok: false, motif: 'recu-trop-lourd' };
  const nom = String(o.nom ?? '').trim() || `recu.${type === 'application/pdf' ? 'pdf' : type.split('/')[1]}`;
  return { ok: true, recu: { nom: nom.slice(-120), type, octets } };
}

/** Le chemin du reçu, comme `deposerFichier` (shared/fil) l'écrit pour une pièce jointe de dépense. */
export function cheminDuRecu(branchId: string, depenseId: string, nom: string): string {
  const propre = String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  return `${branchId}/${DOSSIER_DES_RECUS}/${depenseId}-${propre}`;
}

const fr = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** La ligne du journal des gestes : le montant et la catégorie, jamais l'objet (il peut porter un nom). */
export const pieceDuJournal = (montantXof: number, categorie: string): string => `Dépense à valider, ${fr(montantXof)}, ${categorie}`;
