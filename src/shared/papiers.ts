import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { uid } from './store';
import { litToutesLesPages } from './lecture-entiere';
import {
  ajouteAuJournal, cheminDuFichier, remplace, TAILLE_MAX, titreDuPapier, typeDuFichier,
  type LignePapiers, type Page, type Papier, type Personne, type Titulaire,
} from './papiers-pur';

/* LES PAPIERS DE LA MAISON, CÔTÉ TRÔNE — 6 octobre 2026.

   EN LIGNE SEULEMENT, ET C'EST VOULU. Le reste du Trône garde ses tables sur
   l'appareil pour travailler sans réseau ; pas les papiers. Ni les fichiers
   (le compartiment `papiers` ne s'ouvre que par un lien d'une minute, et le
   service hors ligne ne garde jamais ce qui vient du serveur), ni même les
   numéros et les dates : un téléphone perdu ne livre ni une carte d'identité
   ni son numéro. Ce module tient donc ses lignes EN MÉMOIRE, le temps de
   l'écran, et les relit au serveur à chaque ouverture.

   La base garde la porte (0117) : la direction seule lit, écrit, efface. */

/* ══ LA MÉMOIRE DE L'ÉCRAN ═══════════════════════════════════════════ */

type EtatDuClasseur = { lignes: LignePapiers[]; charge: 'jamais' | 'en-cours' | 'pret' | 'refuse'; erreur?: string };
let etat: EtatDuClasseur = { lignes: [], charge: 'jamais' };
const ecouteurs = new Set<() => void>();
const pose = (e: Partial<EtatDuClasseur>) => { etat = { ...etat, ...e }; ecouteurs.forEach((f) => f()); };
const abonne = (f: () => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };

export const useClasseur = (): EtatDuClasseur => useSyncExternalStore(abonne, () => etat, () => etat);
export const papiersDe = (l: readonly LignePapiers[]): Papier[] => l.filter((x): x is Papier => x.genre === 'papier');
export const personnesDe = (l: readonly LignePapiers[]): Personne[] => l.filter((x): x is Personne => x.genre === 'personne');

export const DELAI_DE_LECTURE_MS = 15000;

/** Relit tout le classeur au serveur. Rien n'est gardé sur l'appareil. */
export async function chargeLeClasseur(): Promise<void> {
  if (!supabase) { pose({ charge: 'refuse', erreur: 'Pas de connexion à la Maison : les papiers ne se lisent qu’en ligne.' }); return; }
  const sb = supabase;
  pose({ charge: 'en-cours' });
  /* UNE LIMITE DE QUINZE SECONDES : un réseau qui traîne sans répondre
     laissait l'écran sur « Lecture… » sans fin (vu au banc, 6 octobre). */
  const lecture = litToutesLesPages<{ id: string; data: LignePapiers }>((apres, taille) => {
    const q = sb.from('papiers').select('id,data').order('id', { ascending: true }).limit(taille);
    return apres === null ? q : q.gt('id', apres);
  });
  const delai = new Promise<{ data: null; error: { message: string } }>((ok) =>
    setTimeout(() => ok({ data: null, error: { message: 'Le serveur ne répond pas : réessayez dans un instant.' } }), DELAI_DE_LECTURE_MS));
  const { data, error } = await Promise.race([lecture, delai]);
  if (error) { pose({ charge: 'refuse', erreur: lisible(error.message) }); return; }
  pose({ charge: 'pret', erreur: undefined, lignes: (data ?? []).map((r) => r.data) });
}

/** Oublie le classeur (à la fermeture de l'écran) : la mémoire se vide aussi. */
export const oublieLeClasseur = (): void => pose({ lignes: [], charge: 'jamais', erreur: undefined });

/* UN MESSAGE PAR GESTE — 6 octobre 2026. « Sur les portables je ne peux pas
   enregistrer un document, ça dit : pas de réseau, les papiers ne se lisent
   qu'en ligne » (Yéman). Toute panne de requête devenait ce message de
   LECTURE, même pendant un enregistrement : on ne savait ni quelle étape
   cassait, ni quoi faire. Chaque geste a désormais sa phrase, et le détail
   technique reste lisible en fin de message. */
const lisible = (m: string, geste: 'lire' | 'ecrire' = 'lire'): string =>
  /relation .*papiers.* does not exist|PGRST205/i.test(m) ? 'La table des papiers n’existe pas encore : la migration 0117 n’a pas été passée.'
    : /row-level security|permission|42501/i.test(m) ? 'Les papiers sont réservés à la direction.'
      : /fetch|network|load failed|timed out|aborted/i.test(m)
        ? (geste === 'lire'
          ? 'Pas de réseau : les papiers ne se lisent qu’en ligne.'
          : `La pièce n’a pas pu partir au serveur (le réseau a coupé pendant l’envoi). Réessayez, en Wi-Fi si possible. Détail : ${m}`)
        : m;

/** Écrire une ligne ET le savoir : la base dit ce qu'elle a vraiment gardé. */
async function ecris(ligne: LignePapiers): Promise<{ ok: boolean; erreur?: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const { data, error } = await supabase.from('papiers').upsert({ id: ligne.id, branch_id: ligne.branchId, data: ligne }).select('id');
  if (error) return { ok: false, erreur: lisible(error.message, 'ecrire') };
  if ((data?.length ?? 0) !== 1) return { ok: false, erreur: 'La base n’a rien gardé.' };
  pose({ lignes: etat.lignes.some((x) => x.id === ligne.id) ? etat.lignes.map((x) => (x.id === ligne.id ? ligne : x)) : [...etat.lignes, ligne] });
  return { ok: true };
}

const maintenant = () => new Date().toISOString();

/* ══ LES FICHIERS ════════════════════════════════════════════════════ */

/** LIRE LE FICHIER TOUT DE SUITE, au moment où on le choisit — 6 octobre 2026.
    Au téléphone, un fichier pris dans OneDrive, Google Drive ou iCloud n'est
    souvent qu'un LIEN vers le cloud : au moment de l'envoyer, le téléphone ne
    sait plus le lire, et le navigateur ne dit qu'une erreur de réseau. On le
    copie donc en mémoire dès le choix ; s'il ne se lit pas, on le dit à cet
    instant, avec la bonne explication. */
export async function copieEnMemoire(f: File): Promise<{ fichier?: File; erreur?: string }> {
  const type = typeDuFichier(f.name, f.type);
  if (!type) return { erreur: `« ${f.name} » : seuls les PDF et les photos sont acceptés.` };
  try {
    const octets = await f.arrayBuffer();
    if (octets.byteLength === 0) throw new Error('vide');
    return { fichier: new File([octets], f.name, { type }) };
  } catch {
    return { erreur: `« ${f.name} » ne se lit pas sur ce téléphone : il est sans doute resté dans le cloud (OneDrive, Drive, iCloud). Ouvrez-le d’abord pour l’enregistrer sur le téléphone, ou prenez le papier en photo.` };
  }
}

/** Une photo s'allège avant de partir : 2 200 px au plus, en JPEG (une photo
    HEIC d'iPhone y est convertie). Elle reste lisible à l'impression ; un PDF
    part tel quel. */
async function allege(f: File): Promise<Blob> {
  if (f.type === 'application/pdf') return f;
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('photo illisible')); i.src = url; });
    const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext('2d');
    if (!x) return f;
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? f), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

export const ESSAIS_D_ENVOI = 3;

/** Déposer les pages d'une pièce dans le compartiment privé. */
export async function deposeLesPages(titulaire: Titulaire, papierId: string, fichiers: readonly File[]): Promise<{ pages: Page[]; erreur?: string }> {
  if (!supabase) return { pages: [], erreur: 'Pas de connexion à la Maison.' };
  const pages: Page[] = [];
  const t0 = Date.now();
  for (let i = 0; i < fichiers.length; i += 1) {
    const f = fichiers[i];
    if (!typeDuFichier(f.name, f.type)) return { pages, erreur: `« ${f.name} » : seuls les PDF et les photos sont acceptés.` };
    let corps: Blob;
    try { corps = await allege(f); } catch {
      return { pages, erreur: `« ${f.name} » : cette photo ne s’ouvre pas sur ce téléphone. Prenez le papier en photo avec l’appareil photo, ou envoyez un PDF.` };
    }
    if (corps.size > TAILLE_MAX) return { pages, erreur: `« ${f.name} » dépasse 10 Mo.` };
    const type = corps.type === 'image/jpeg' || corps.type === 'application/pdf' || corps.type === 'image/png' || corps.type === 'image/webp' ? corps.type : 'image/jpeg';
    const chemin = cheminDuFichier(titulaire, papierId, i + 1, type === 'application/pdf' ? 'pdf' : 'jpg', t0);
    /* TROIS ESSAIS : le réseau d'un téléphone coupe une seconde, un envoi
       repart. Le même chemin resservirait mal un envoi à moitié arrivé :
       `upsert` le remplace proprement. */
    let derniere = '';
    for (let essai = 1; essai <= ESSAIS_D_ENVOI; essai += 1) {
      const { error } = await supabase.storage.from('papiers').upload(chemin, corps, { contentType: type, upsert: true });
      if (!error) { derniere = ''; break; }
      derniere = error.message;
      if (!/fetch|network|load failed|timed out|aborted/i.test(derniere)) break;
      await new Promise((r) => setTimeout(r, 1500 * essai));
    }
    if (derniere) return { pages, erreur: `Page ${i + 1} (« ${f.name} ») : ${lisible(derniere, 'ecrire')}` };
    pages.push({ chemin, nom: f.name, type, taille: corps.size });
  }
  return { pages };
}

/** Un lien qui expire en UNE MINUTE : une capture du lien ne mène nulle part. */
export async function lienDUnePage(chemin: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from('papiers').createSignedUrl(chemin, 60);
  return data?.signedUrl ?? null;
}

export async function octetsDUnePage(chemin: string): Promise<Uint8Array | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from('papiers').download(chemin);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/* ══ LES GESTES ══════════════════════════════════════════════════════ */

export async function gardeUnPapier(o: Omit<Papier, 'id' | 'genre' | 'versions' | 'journal' | 'deposeLe'> & { id?: string }, qui: string): Promise<{ ok: boolean; erreur?: string; papier?: Papier }> {
  const quand = maintenant();
  const papier: Papier = {
    ...o, id: o.id ?? `pap-${uid()}`, genre: 'papier', versions: [], deposeLe: quand,
    journal: [{ quand, qui, quoi: 'pièce déposée' }],
  };
  const r = await ecris(papier);
  return r.ok ? { ...r, papier } : r;
}

export async function modifieUnPapier(p: Papier, patch: Partial<Pick<Papier, 'type' | 'numero' | 'delivreLe' | 'expireLe' | 'original' | 'note' | 'titre'>>, qui: string): Promise<{ ok: boolean; erreur?: string }> {
  return ecris({ ...p, ...patch, journal: ajouteAuJournal(p.journal, { quand: maintenant(), qui, quoi: 'informations corrigées' }) });
}

export async function remplaceUnPapier(p: Papier, neuf: { pages: Page[]; numero: string; delivreLe: string; expireLe: string }, qui: string): Promise<{ ok: boolean; erreur?: string }> {
  return ecris(remplace(p, neuf, qui, maintenant()));
}

/** Noter un regard ou une remise au journal de la pièce. */
export async function noteAuJournal(p: Papier, qui: string, quoi: string): Promise<void> {
  await ecris({ ...p, journal: ajouteAuJournal(p.journal, { quand: maintenant(), qui, quoi }) });
}

/** Supprimer une pièce : la ligne ET ses fichiers, toutes versions comprises. */
export async function effaceUnPapier(p: Papier): Promise<{ ok: boolean; erreur?: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  const { data, error } = await supabase.from('papiers').delete().eq('id', p.id).select('id');
  if (error) return { ok: false, erreur: lisible(error.message, 'ecrire') };
  if ((data?.length ?? 0) !== 1) return { ok: false, erreur: 'La base n’a rien effacé.' };
  const chemins = [...p.pages, ...p.versions.flatMap((v) => v.pages)].map((x) => x.chemin);
  if (chemins.length) await supabase.storage.from('papiers').remove(chemins);
  pose({ lignes: etat.lignes.filter((x) => x.id !== p.id) });
  return { ok: true };
}

/** UNE PERSONNE N'A QU'UNE CHEMISE — 6 octobre 2026 (« comment supprimer le
    2e Yéman Boya » : deux clics rapides sur la suggestion en avaient créé
    deux). Un nom déjà présent est refusé, quelle que soit la casse. */
export async function ajouteUnePersonne(o: { branchId: string; nom: string; qualite: string }): Promise<{ ok: boolean; erreur?: string; personne?: Personne }> {
  const nom = o.nom.trim().toLowerCase();
  if (!nom) return { ok: false, erreur: 'Le nom.' };
  if (etat.lignes.some((x) => x.genre === 'personne' && x.nom.trim().toLowerCase() === nom)) {
    return { ok: false, erreur: `${o.nom.trim()} a déjà sa chemise.` };
  }
  const personne: Personne = { id: `pers-${uid()}`, genre: 'personne', branchId: o.branchId, nom: o.nom.trim(), qualite: o.qualite.trim() };
  const r = await ecris(personne);
  return r.ok ? { ...r, personne } : r;
}

/** Retirer la chemise d'une personne : VIDE seulement. Ses papiers se
    suppriment d'abord, un à un, en connaissance de cause. */
export async function retireUnePersonne(p: Personne): Promise<{ ok: boolean; erreur?: string }> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison.' };
  if (etat.lignes.some((x) => x.genre === 'papier' && x.titulaire === `pers:${p.id}`)) {
    return { ok: false, erreur: 'Cette chemise contient des papiers : supprimez-les d’abord.' };
  }
  const { data, error } = await supabase.from('papiers').delete().eq('id', p.id).select('id');
  if (error) return { ok: false, erreur: lisible(error.message, 'ecrire') };
  if ((data?.length ?? 0) !== 1) return { ok: false, erreur: 'La base n’a rien effacé.' };
  pose({ lignes: etat.lignes.filter((x) => x.id !== p.id) });
  return { ok: true };
}

/* ══ LE DOSSIER À REMETTRE : un seul PDF, marqué ═════════════════════ */

/** Une page du compartiment n'a pas pu être lue (réseau, fichier retiré). */
export class PageIllisible extends Error {
  readonly page: string;
  constructor(page: string) { super(`Page illisible : ${page}`); this.name = 'PageIllisible'; this.page = page; }
}

/** Ce que l'écran dit d'un dossier refusé (10 octobre 2026, reprise de la
    revue) : la pièce et la page en cause quand c'est une page illisible,
    sinon le refus seul. Sans le nom, la direction devait rouvrir chaque
    papier coché pour trouver quelle page redéposer. */
export const motDuRefus = (e: unknown): string => (e instanceof PageIllisible
  ? `Le dossier n’a pas pu être assemblé : la page ${e.page} est illisible. Redéposez-la dans son papier, puis recommencez.`
  : 'Le dossier n’a pas pu être assemblé.');

/** Assemble les pièces en un PDF : une page de garde (à qui, quand, quoi),
    puis chaque page de chaque pièce, la marque en travers de chacune. */
export async function assembleLeDossier(o: {
  pieces: { papier: Papier; titulaireNom: string }[];
  destinataire: string;
  jour: string;
  marque?: string;
  maison: string;
  /** D'où viennent les octets d'une page : le compartiment privé, sauf au banc. */
  lis?: (chemin: string) => Promise<Uint8Array | null>;
}): Promise<Uint8Array> {
  const lis = o.lis ?? octetsDUnePage;
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fort = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const latin = (s: string) => s.normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '');
  const A4: [number, number] = [595.28, 841.89];

  /* La page de garde */
  const garde = doc.addPage(A4);
  garde.drawText(latin(o.maison), { x: 56, y: 770, size: 20, font: fort, color: rgb(0.118, 0.129, 0.314) });
  garde.drawText(latin(`Dossier remis à ${o.destinataire || '…'}`), { x: 56, y: 730, size: 14, font: fort, color: rgb(0.15, 0.14, 0.12) });
  garde.drawText(latin(`Le ${o.jour}`), { x: 56, y: 710, size: 11, font: normal, color: rgb(0.4, 0.4, 0.38) });
  let y = 670;
  o.pieces.forEach(({ papier, titulaireNom }, i) => {
    garde.drawText(latin(`${i + 1}. ${titreDuPapier(papier)} · ${titulaireNom}${papier.numero ? ` · n° ${papier.numero}` : ''}`), { x: 56, y, size: 11, font: normal, color: rgb(0.15, 0.14, 0.12) });
    y -= 18;
  });

  /* Les pages de chaque pièce. UNE PAGE ILLISIBLE ARRÊTE TOUT (10 octobre
     2026, revue) : la page de garde l'a déjà annoncée, un dossier qui
     l'omettrait mentirait au destinataire, et l'écran noterait « remise » au
     journal. On lève : chaque appel de l'écran attrape, dit « une page est
     peut-être illisible » et ne trace rien. */
  for (const { papier, titulaireNom } of o.pieces) {
    for (const page of papier.pages) {
      const octets = await lis(page.chemin);
      if (!octets) throw new PageIllisible(`${titreDuPapier(papier)} · ${titulaireNom} · ${page.nom}`);
      if (page.type === 'application/pdf') {
        const source = await PDFDocument.load(octets, { ignoreEncryption: true });
        const copiees = await doc.copyPages(source, source.getPageIndices());
        copiees.forEach((p) => doc.addPage(p));
      } else {
        const image = page.type === 'image/png' ? await doc.embedPng(octets) : await doc.embedJpg(octets);
        const p = doc.addPage(A4);
        const marge = 36;
        const k = Math.min((A4[0] - 2 * marge) / image.width, (A4[1] - 2 * marge) / image.height);
        const l = image.width * k; const h = image.height * k;
        p.drawImage(image, { x: (A4[0] - l) / 2, y: (A4[1] - h) / 2, width: l, height: h });
      }
    }
  }

  /* La marque, en travers de CHAQUE page (la garde comprise) */
  if (o.marque) {
    const texte = latin(o.marque);
    for (const p of doc.getPages()) {
      const { width, height } = p.getSize();
      const taille = Math.max(10, Math.min(18, width / 38));
      const largeur = fort.widthOfTextAtSize(texte, taille);
      for (let i = -2; i <= 2; i += 1) {
        p.drawText(texte, {
          x: width / 2 - (largeur / 2) * Math.cos(Math.PI / 6),
          y: height / 2 - (largeur / 2) * Math.sin(Math.PI / 6) + i * height / 5,
          size: taille, font: fort, color: rgb(0.56, 0.23, 0.15), opacity: 0.3, rotate: degrees(30),
        });
      }
    }
  }
  return doc.save();
}

/** Le PDF en pièce jointe (data URL), pour WhatsApp. */
export const enDataUrl = (octets: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:application/pdf;base64,${btoa(bin)}`;
};
