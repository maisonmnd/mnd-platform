import { createStore, useStore, uid } from './store';
import { supabase } from './supabase';
import { ecris, secretariatStore, useSecretariat } from './secretariat';
import { allege, copieEnMemoire, ESSAIS_D_ENVOI } from './papiers';
import { TAILLE_MAX, typeDuFichier } from './papiers-pur';
import { asset } from './asset';
import { dateSurLeRecu, TAMPON_A_DATER, tamponParCle } from './secretariat-tampons';
import {
  marqueFaite, placeDuRecu, prochainNumeroDuCourrier,
  type Cloture, type Contact, type Contrat, type Courrier, type Demarche, type Echeance, type Fichier, type LigneAdministrative, type Sens,
} from './secretariat-admin-pur';
import type { LigneSecretariat } from './secretariat-pur';

/* ══ LE SECRÉTARIAT ADMINISTRATIF, CÔTÉ TRÔNE — 14 octobre 2026 ══════════

   Les six genres neufs vivent dans la table `secretariat` (0116), comme les
   documents : même magasin, même synchronisation, même hors-ligne. La base
   (0129) décide de qui lit et écrit ; ce module écrit, l'écran montre.

   LES FICHIERS (photos du courrier, contrats signés, reçus) vont dans le
   compartiment privé `secretariat`, sous l'id de leur ligne : un fichier se
   lit si sa ligne se lit. Même chemin d'envoi que les Papiers : copié en
   mémoire au choix, allégé, trois essais. */

const maintenant = (): string => new Date().toISOString();
export const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const de = <G extends LigneAdministrative['genre']>(g: G) =>
  (l: readonly LigneSecretariat[]) => l.filter((x): x is Extract<LigneAdministrative, { genre: G }> => x.genre === g);
export const courriersDe = de('courrier');
export const echeancesDe = de('echeance');
export const contratsDe = de('contrat');
export const demarchesDe = de('demarche');
export const contactsDe = de('contact');
export const cloturesDe = de('cloture');
export const administratives = (l: readonly LigneSecretariat[]): LigneAdministrative[] =>
  l.filter((x): x is LigneAdministrative => ['courrier', 'echeance', 'contrat', 'demarche', 'contact', 'cloture'].includes(x.genre));
export { useSecretariat };

const base = (branchId: string, par: string, prive?: boolean) => ({
  branchId, entite: 'mnd' as const, creeLe: maintenant(), creePar: par, ...(prive ? { prive: true } : {}),
});
/** Toute retouche date sa mise à jour : l'écran dit « modifié le ». */
export const retouche = <L extends LigneAdministrative>(l: L, patch: Partial<L>): L => {
  const suite = { ...l, ...patch, majLe: maintenant() } as L;
  ecris(suite);
  return suite;
};

/* ══ LE COURRIER ═════════════════════════════════════════════════════ */

export function nouveauCourrier(o: {
  branchId: string; par: string; sens: Sens; date: string; correspondant: string; contactId?: string; objet: string;
  traitePar?: string; reponseAvant?: string; moyen?: Courrier['moyen']; pieceId?: string; repondA?: string;
  demarcheId?: string; contratId?: string; note?: string; prive?: boolean;
}): Courrier {
  const annee = parseInt(o.date.slice(0, 4), 10) || new Date().getFullYear();
  const numero = prochainNumeroDuCourrier(o.sens, annee, courriersDe(secretariatStore.get()).map((c) => c.numero));
  const { branchId, par, prive, ...reste } = o;
  const c: Courrier = {
    id: `cou-${uid()}`, genre: 'courrier', ...base(branchId, par, prive), ...reste, numero,
    etat: o.sens === 'arrive' ? 'a-traiter' : 'prepare', fichiers: [],
  };
  ecris(c);
  return c;
}

/* ══ LES ÉCHÉANCES ═══════════════════════════════════════════════════ */

export function nouvelleEcheance(o: Omit<Echeance, 'id' | 'genre' | 'entite' | 'creeLe' | 'creePar' | 'faites' | 'branchId'> & { branchId: string; par: string }): Echeance {
  const { branchId, par, prive, ...reste } = o;
  const e: Echeance = { id: `ech-${uid()}`, genre: 'echeance', ...base(branchId, par, prive), ...reste, faites: [] };
  ecris(e);
  return e;
}
export const faitLEcheance = (e: Echeance, par: string): Echeance => retouche(e, marqueFaite(e, maintenant(), par));

/* ══ LES CONTRATS ════════════════════════════════════════════════════ */

export function nouveauContrat(o: Omit<Contrat, 'id' | 'genre' | 'entite' | 'creeLe' | 'creePar' | 'fichiers' | 'branchId'> & { branchId: string; par: string }): Contrat {
  const { branchId, par, prive, ...reste } = o;
  const c: Contrat = { id: `con-${uid()}`, genre: 'contrat', ...base(branchId, par, prive), ...reste, fichiers: [] };
  ecris(c);
  return c;
}

/* ══ LES DÉMARCHES ═══════════════════════════════════════════════════ */

export function nouvelleDemarche(o: { branchId: string; par: string; titre: string; type: Demarche['type']; aupres: string; contactId?: string; etapes: string[]; prochaine?: string; prochaineLe?: string; prive?: boolean; note?: string }): Demarche {
  const { branchId, par, prive, etapes, ...reste } = o;
  const d: Demarche = {
    id: `dem-${uid()}`, genre: 'demarche', ...base(branchId, par, prive), ...reste,
    etapes: etapes.map((texte) => ({ id: uid(), texte })), etat: 'en-cours', pieceIds: [], frais: [], fichiers: [],
  };
  ecris(d);
  return d;
}
export const basculeEtape = (d: Demarche, etapeId: string): Demarche =>
  retouche(d, { etapes: d.etapes.map((e) => (e.id === etapeId ? (e.faiteLe ? { id: e.id, texte: e.texte } : { ...e, faiteLe: maintenant() }) : e)) });
export const termineLaDemarche = (d: Demarche): Demarche => retouche(d, { etat: 'terminee', termineeLe: aujourdhui() });

/* ══ LES CONTACTS ════════════════════════════════════════════════════ */

export function nouveauContact(o: Omit<Contact, 'id' | 'genre' | 'entite' | 'creeLe' | 'creePar' | 'branchId'> & { branchId: string; par: string }): Contact {
  const { branchId, par, prive, ...reste } = o;
  const c: Contact = { id: `ctc-${uid()}`, genre: 'contact', ...base(branchId, par, prive), ...reste };
  ecris(c);
  return c;
}

/* ══ LES ARCHIVES : clore une année (la direction) ═══════════════════ */

export function clotureLAnnee(branchId: string, annee: number, par: string): Cloture {
  const c: Cloture = { id: `clo-${annee}`, genre: 'cloture', ...base(branchId, par), annee, closeLe: maintenant(), closePar: par };
  ecris(c);
  return c;
}

/** Effacer une ligne : la direction seule (la base le tient, 0116). */
export const effaceLaLigne = (l: LigneAdministrative): void => secretariatStore.set((prev) => prev.filter((x) => x.id !== l.id));

/* ══ LES FICHIERS ════════════════════════════════════════════════════ */

const COMPARTIMENT = 'secretariat';
const dit = (m: string): string =>
  /bucket not found|not found/i.test(m) ? 'Le compartiment du secrétariat n’existe pas encore : la migration 0129 n’a pas été passée.'
    : /row-level security|permission|unauthorized|42501|403/i.test(m) ? 'Seul le secrétariat dépose des fichiers.'
      : /fetch|network|load failed|timed out|aborted/i.test(m) ? `Le fichier n’a pas pu partir (le réseau a coupé). Réessayez, en Wi-Fi si possible. Détail : ${m}`
        : m;

/** Copier les fichiers choisis en mémoire, tout de suite (un fichier resté
    dans le cloud du téléphone se dit à cet instant, pas à l'envoi). */
export async function prendsLesFichiers(liste: FileList | readonly File[]): Promise<{ fichiers: File[]; erreur?: string }> {
  const fichiers: File[] = [];
  for (const f of Array.from(liste)) {
    const r = await copieEnMemoire(f);
    if (r.erreur) return { fichiers, erreur: r.erreur };
    if (r.fichier) fichiers.push(r.fichier);
  }
  return { fichiers };
}

const chargeLImage = (src: string): Promise<HTMLImageElement> => new Promise((ok, ko) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => ko(new Error('image'));
  i.src = src;
});
const enDataUrl = (b: Blob): Promise<string | null> => new Promise((ok) => {
  const f = new FileReader();
  f.onloadend = () => ok(typeof f.result === 'string' ? f.result : null);
  f.onerror = () => ok(null);
  f.readAsDataURL(b);
});

/** La photo d'un courrier arrivé reçoit le tampon « REÇU LE », daté du jour
    d'arrivée (placeDuRecu). Si le tampon ne se charge pas, la photo part
    telle quelle : mieux vaut une lettre sans tampon qu'une lettre perdue. */
export async function tamponneLaPhoto(photo: Blob, recuLe: string): Promise<Blob> {
  if (!photo.type.startsWith('image/')) return photo;
  const def = tamponParCle(TAMPON_A_DATER);
  if (!def) return photo;
  const url = URL.createObjectURL(photo);
  try {
    const r = await fetch(asset(`/assets/tampons/${def.fichier}`));
    if (!r.ok) return photo;
    const brut = await enDataUrl(await r.blob());
    const date = brut ? await dateSurLeRecu(brut, recuLe) : null;
    if (!date) return photo;
    const [tampon, image] = await Promise.all([chargeLImage(date), chargeLImage(url)]);
    const c = document.createElement('canvas');
    c.width = image.naturalWidth; c.height = image.naturalHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return photo;
    ctx.drawImage(image, 0, 0);
    const p = placeDuRecu(c.width, c.height, def.ratio);
    /* L'encre se pose SUR le papier : le blanc du papier reste, comme un vrai
       tampon ; une légère inclinaison, comme une main. */
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(p.x + p.l / 2, p.y + p.h / 2);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.drawImage(tampon, -p.l / 2, -p.h / 2, p.l, p.h);
    const sortie = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
    return sortie ?? photo;
  } catch {
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Déposer des fichiers sous une ligne ; rend ceux qui sont partis.
    `recuLe` : la date d'arrivée d'un courrier, et ses photos sont tamponnées. */
export async function deposeLesFichiers(ligneId: string, fichiers: readonly File[], deja = 0, recuLe?: string): Promise<{ fichiers: Fichier[]; erreur?: string }> {
  if (!supabase) return { fichiers: [], erreur: 'Pas de connexion à la Maison.' };
  const partis: Fichier[] = [];
  const t0 = Date.now();
  for (let i = 0; i < fichiers.length; i += 1) {
    const f = fichiers[i];
    if (!typeDuFichier(f.name, f.type)) return { fichiers: partis, erreur: `« ${f.name} » : seuls les PDF et les photos sont acceptés.` };
    let corps: Blob;
    try { corps = await allege(f); } catch { return { fichiers: partis, erreur: `« ${f.name} » : cette photo ne s’ouvre pas sur ce téléphone.` }; }
    if (recuLe) corps = await tamponneLaPhoto(corps, recuLe);
    if (corps.size > TAILLE_MAX) return { fichiers: partis, erreur: `« ${f.name} » dépasse 10 Mo.` };
    const type = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(corps.type) ? corps.type : 'image/jpeg';
    const chemin = `${ligneId}/${deja + i + 1}-${t0}.${type === 'application/pdf' ? 'pdf' : 'jpg'}`;
    let derniere = '';
    for (let essai = 1; essai <= ESSAIS_D_ENVOI; essai += 1) {
      const { error } = await supabase.storage.from(COMPARTIMENT).upload(chemin, corps, { contentType: type, upsert: true });
      if (!error) { derniere = ''; break; }
      derniere = error.message;
      if (!/fetch|network|load failed|timed out|aborted/i.test(derniere)) break;
      await new Promise((r) => setTimeout(r, 1500 * essai));
    }
    if (derniere) return { fichiers: partis, erreur: `« ${f.name} » : ${dit(derniere)}` };
    partis.push({ chemin, nom: f.name, type, taille: corps.size });
  }
  return { fichiers: partis };
}

/** Un lien qui expire en une minute : une capture du lien ne mène nulle part. */
export async function lienDuFichier(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60);
  return data?.signedUrl ?? null;
}

/* ══ LE RÔLE ET L'ÉQUIPE ═════════════════════════════════════════════
   Les titulaires du secrétariat (0129) et le nom de chaque compte, lus au
   serveur et gardés sur l'appareil pour le hors-ligne. Ils ne décident de
   rien : la base relit `tient_le_secretariat()` à chaque écriture. */

export const titulairesStore = createStore<string[]>('mnd_secretariat_titulaires', []);
export const useTitulaires = () => useStore(titulairesStore);
export const equipeDuSecretariatStore = createStore<{ id: string; nom: string; tient: boolean }[]>('mnd_secretariat_equipe', []);
export const useEquipeDuSecretariat = () => useStore(equipeDuSecretariatStore);

export async function chargeLesTitulaires(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('secretariat_titulaires').select('user_id');
  if (!error && data) titulairesStore.set(data.map((r: { user_id: string }) => r.user_id));
}

export async function chargeLEquipe(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('secretariat_equipe');
  if (!error && Array.isArray(data)) equipeDuSecretariatStore.set(data.map((r: { user_id: string; nom: string; tient?: boolean }) => ({ id: r.user_id, nom: r.nom, tient: r.tient === true })));
}

/** Donner ou retirer le rôle (la direction : la base refuse les autres). */
export async function donneLeRole(userId: string, oui: boolean, par: string): Promise<{ ok: boolean; erreur?: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const { error } = oui
    ? await supabase.from('secretariat_titulaires').upsert({ user_id: userId, donne_par: par })
    : await supabase.from('secretariat_titulaires').delete().eq('user_id', userId);
  if (error) {
    return { ok: false, erreur: /secretariat_titulaires.*does not exist|PGRST205/i.test(error.message)
      ? 'La migration 0129 n’a pas encore été passée.' : /row-level security|42501/i.test(error.message) ? 'Seule la direction donne ce rôle.' : error.message };
  }
  await chargeLesTitulaires();
  return { ok: true };
}
