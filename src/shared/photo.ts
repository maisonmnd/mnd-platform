/* ── LE POIDS DES PHOTOS — 29 août 2026 ──────────────────────────────
   « Organization exceeded its quota. Projects will be restricted from
   23 Sep, 2026. » Le relevé a désigné un seul coupable, et sans appel :

     · la base pèse 71 Mo sur 500 accordés — ce n'est pas elle ;
     · le coffre de fichiers 2,7 Mo sur 1 Go — ce n'est pas lui ;
     · CHAQUE OUVERTURE de l'application télécharge 3,7 Mo, dont
       2 874 ko de PHOTOS DE FICHES, soit 98,5 %.

   Les photos vivent en base64 DANS la fiche cliente. La synchronisation lit
   les tables entières à chaque chargement : cinquante photos redescendent
   donc à chaque ouverture, sur chaque poste, pour chaque cliente. Cinq
   gigaoctets de trafic mensuel tiennent 1 400 ouvertures. Le salon les épuise.

   ELLES SONT DIX FOIS TROP GRANDES POUR CE QU'ON EN FAIT. Elles sont réduites
   à 512 px, et s'affichent dans un rond de 48. Une vignette de 192 px pèse sept
   fois moins et ne change rien à l'écran.

   ON NE TOUCHE PAS À L'ARCHITECTURE POUR UNE ALARME. Sortir les photos vers
   un compartiment de fichiers serait le bon dessin à terme ; c'est un chantier
   — un compartiment, ses règles, un envoi, une migration, un affichage à la
   demande. La vignette rend 85 % du trafic pour un centième du travail, et
   laisse ce chantier possible plus tard. */

/** Le côté d'une vignette d'avatar. Elle s'affiche dans un rond de 48 px ;
    192 couvre les écrans à trois fois la densité, et rien au-delà ne se voit. */
export const COTE_VIGNETTE = 192;

/** La qualité JPEG d'une vignette. Sur un visage de 48 px, l'œil ne distingue
    pas 0,72 de 0,82, mais la balance, si. */
export const QUALITE_VIGNETTE = 0.72;

/** Au-delà de ce poids, une photo mérite d'être allégée. Une vignette réussie
    pèse entre 5 et 9 ko ; on laisse le double avant de la reprendre, pour ne
    pas recomprimer indéfiniment ce qui est déjà bien. */
export const SEUIL_PHOTO_OCTETS = 18_000;

/** Le poids RÉEL d'une donnée en `data:` — la partie base64 pèse trois quarts
    de sa longueur. Sert à mesurer sans décoder. */
export function poidsDataUrl(d: string | null | undefined): number {
  if (!d) return 0;
  const i = d.indexOf(',');
  const b64 = i >= 0 ? d.slice(i + 1) : d;
  return Math.round((b64.length * 3) / 4);
}

/** Une photo est-elle trop lourde pour ce qu'on en fait ? */
export const photoTropLourde = (d: string | null | undefined): boolean =>
  poidsDataUrl(d) > SEUIL_PHOTO_OCTETS;

/** Réduit une image (fichier OU `data:` déjà en base) à une vignette.

    RENVOIE L'ORIGINAL PLUTÔT QUE RIEN si l'image est illisible : un format
    exotique, un GIF animé, un canvas refusé par le navigateur. Perdre la photo
    d'une cliente pour gagner huit kilo-octets serait un mauvais échange. */
export async function enVignette(
  source: File | string,
  max = COTE_VIGNETTE,
  qualite = QUALITE_VIGNETTE,
): Promise<string> {
  const dataUrl = typeof source === 'string'
    ? source
    : await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      r.readAsDataURL(source);
    });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible.'));
      i.src = dataUrl;
    });
    const echelle = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * echelle));
    const h = Math.max(1, Math.round(img.height * echelle));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const petite = canvas.toDataURL('image/jpeg', qualite);
    /* ON NE REND JAMAIS PLUS LOURD. Une photo déjà minuscule, ou un PNG très
       compressé, peut ressortir plus gros d'un passage en JPEG. */
    return poidsDataUrl(petite) < poidsDataUrl(dataUrl) ? petite : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** CE QUE PÈSENT LES PHOTOS D'UN CARNET, et ce qu'on peut lui rendre. */
export type BilanPhotos = {
  /** Combien de fiches portent une photo. */
  avecPhoto: number;
  /** Le poids total, en octets. */
  totalOctets: number;
  /** Combien dépassent le seuil et gagneraient à être reprises. */
  aAlleger: number;
  /** Le poids de celles-là seulement. */
  aAllegerOctets: number;
};

export function bilanDesPhotos(fiches: readonly { photo?: string | null }[]): BilanPhotos {
  let avecPhoto = 0;
  let totalOctets = 0;
  let aAlleger = 0;
  let aAllegerOctets = 0;
  for (const f of fiches) {
    const p = poidsDataUrl(f.photo);
    if (p === 0) continue;
    avecPhoto += 1;
    totalOctets += p;
    if (p > SEUIL_PHOTO_OCTETS) { aAlleger += 1; aAllegerOctets += p; }
  }
  return { avecPhoto, totalOctets, aAlleger, aAllegerOctets };
}

/** Un poids lisible — « 2,9 Mo », « 57 ko ». */
export function poidsLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
