import type { ModeleDeCarte } from '../../../shared/cartes-cadeaux-pur';

/* L'IMAGE DE LA CARTE — 2 octobre 2026. « Enregistrer la carte » : la même
   carte qu'à l'écran, au modèle choisi, avec son code et sa date, en une
   image qu'on garde, imprime ou transfère. Elle se dessine ici, dans le
   navigateur de l'acheteur : le code ne repasse par aucun serveur de plus.

   Le verrou et les motifs sont LES FICHIERS DE LA MAISON, posés tels quels,
   jamais redessinés. */

const L = 1586;
const H = 1000;

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

function charge(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${src}`));
    img.src = src;
  });
}

const SERIF = '"MND Fon", "Cormorant Garamond", Georgia, serif';
const SANS = '"MND Fon", "Jost", system-ui, sans-serif';

/** Coupe un texte en lignes qui tiennent dans `largeur`. */
function lignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const out: string[] = [];
  let ligne = '';
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(essai).width > largeur && ligne) { out.push(ligne); ligne = mot; } else ligne = essai;
  }
  if (ligne) out.push(ligne);
  return out;
}

export async function imageDeLaCarte(o: {
  modele: ModeleDeCarte; pour: string; objet: string; mot: string; code: string; valable: string;
}): Promise<Blob> {
  const ivoire = o.modele === 'ivoire';
  const [verrou, motif] = await Promise.all([
    charge(base(ivoire ? '/assets/vectoriel/verrou-couche-indigo.svg' : '/assets/vectoriel/verrou-couche-ivoire.svg')),
    charge(base(o.modele === 'medaillon' ? '/assets/motifs/medaillon-seul-cuivre.png'
      : o.modele === 'allover' ? '/assets/motifs/allover-aere-indigo-ivoire.png'
        : '/assets/motifs/medaillon-aere-ivoire-cuivre.png')),
  ]);
  try { await document.fonts.ready; } catch { /* les polices de repli suffisent */ }

  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');

  /* Le fond, comme `.carte-cadeau--<modèle>` du site. */
  if (o.modele === 'medaillon') {
    const g = ctx.createLinearGradient(0, 0, L, H);
    g.addColorStop(0, '#23265E'); g.addColorStop(0.45, '#1E2150'); g.addColorStop(1, '#15173A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, H);
    const t = L * 0.44;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(motif, L - L * 0.04 - t, H * 0.15, t, t);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = ivoire ? '#F6F1E7' : '#1E2150';
    ctx.fillRect(0, 0, L, H);
    const pas = ivoire ? 320 : 336;
    for (let y = 0; y < H; y += pas) for (let x = 0; x < L; x += pas) ctx.drawImage(motif, x, y, pas, pas);
    const voile = ctx.createLinearGradient(0, 0, L, 0);
    if (ivoire) {
      voile.addColorStop(0, 'rgba(246,241,231,.98)'); voile.addColorStop(0.5, 'rgba(246,241,231,.92)'); voile.addColorStop(1, 'rgba(246,241,231,.18)');
    } else {
      voile.addColorStop(0, 'rgba(30,33,80,.97)'); voile.addColorStop(0.46, 'rgba(30,33,80,.9)'); voile.addColorStop(1, 'rgba(30,33,80,.3)');
    }
    ctx.fillStyle = voile; ctx.fillRect(0, 0, L, H);
  }

  const encre = ivoire ? '#1E2150' : '#F6F1E7';
  const douce = ivoire ? 'rgba(30,33,80,.62)' : 'rgba(246,241,231,.7)';
  const marge = 90;

  /* Le haut : le verrou, et « Carte cadeau ». */
  const hv = 64;
  ctx.drawImage(verrou, marge, marge - 10, (verrou.naturalWidth / verrou.naturalHeight) * hv || hv * 3.2, hv);
  ctx.fillStyle = douce;
  ctx.font = `400 26px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText('CARTE CADEAU', L - marge, marge + 34);
  ctx.textAlign = 'left';

  /* Le milieu : pour qui, ce qu'elle offre, le mot. */
  let y = H * 0.42;
  ctx.fillStyle = douce;
  ctx.font = `400 30px ${SANS}`;
  ctx.fillText((o.pour ? `Pour ${o.pour}` : 'Pour vous').toUpperCase(), marge, y);
  y += 92;
  ctx.fillStyle = encre;
  ctx.font = `400 84px ${SERIF}`;
  for (const l of lignes(ctx, o.objet, L * 0.62).slice(0, 2)) { ctx.fillText(l, marge, y); y += 92; }
  if (o.mot) {
    ctx.fillStyle = ivoire ? 'rgba(30,33,80,.8)' : 'rgba(246,241,231,.82)';
    ctx.font = `italic 400 40px ${SERIF}`;
    for (const l of lignes(ctx, o.mot, L * 0.6).slice(0, 2)) { ctx.fillText(l, marge, y); y += 50; }
  }

  /* Le bas : la devise, et le code. */
  ctx.fillStyle = ivoire ? '#7C4C2C' : '#D6A06F';
  ctx.font = `italic 400 50px ${SERIF}`;
  ctx.fillText('Mi nyɔ́ ɖɛkpɛ.', marge, H - marge);
  ctx.textAlign = 'right';
  ctx.fillStyle = encre;
  ctx.font = `500 52px ${SANS}`;
  ctx.fillText(o.code, L - marge, H - marge - 44);
  ctx.fillStyle = douce;
  ctx.font = `400 26px ${SANS}`;
  ctx.fillText(o.valable ? `valable jusqu’au ${o.valable}` : '', L - marge, H - marge);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('image'))), 'image/png'));
}
