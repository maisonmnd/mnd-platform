/* LES FLEURS DES INGRÉDIENTS — 30 septembre 2026. « Rajouter les fleurs de ces
   plantes. Ça ferait très jolies et très exotiques » (Yéman).

   Chaque carte d'ingrédient porte la fleur de sa plante, dessinée en ivoire
   sur la teinte de la carte, comme un motif de la Maison et non comme une
   photo : pas de banque d'images, un trait, une seule encre. Les dessins
   sont botaniques dans l'esprit, pas dans le détail : la colonne d'étamines
   de l'hibiscus, la hampe tubulaire de l'aloès, la boule d'étamines pendante
   du baobab, les étoiles serrées du karité, les panicules du neem et de
   l'avocatier, les cinq pétales inégaux du moringa. On reconnaît, on ne
   confond pas. Une plante sans dessin ici garde le motif seul. */

const IV = '#F6F1E7';

const enveloppe = (dedans) =>
  `<svg class="ingr__fleur" viewBox="0 0 240 240" aria-hidden="true" fill="none" stroke="${IV}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${dedans}</svg>`;

const tourne = (angle, cx, cy, dedans) => `<g transform="rotate(${angle} ${cx} ${cy})">${dedans}</g>`;
const pose = (x, y, dedans, echelle = 1, angle = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${echelle})">${dedans}</g>`;
const plein = (op) => `fill="${IV}" fill-opacity="${op}"`;

/* Une étoile de n pétales pointus, autour de l'origine. */
const etoile = (n, longueur, largeur, op = 0.14) => {
  const petale = `<path d="M0,0 C${-largeur},${-longueur * 0.45} ${-largeur * 0.9},${-longueur * 0.85} 0,${-longueur} C${largeur * 0.9},${-longueur * 0.85} ${largeur},${-longueur * 0.45} 0,0Z" ${plein(op)}/>`;
  let s = '';
  for (let i = 0; i < n; i += 1) s += `<g transform="rotate(${(360 / n) * i})">${petale}</g>`;
  return s + `<circle r="${Math.max(1.4, largeur * 0.35)}" ${plein(0.5)}/>`;
};

/* ── L'hibiscus : cinq larges pétales, et la longue colonne d'étamines ── */
function hibiscus() {
  const cx = 118, cy = 138;
  const petale = `<path d="M${cx},${cy} C${cx - 30},${cy - 18} ${cx - 44},${cy - 60} ${cx - 22},${cy - 82} C${cx - 10},${cy - 94} ${cx + 10},${cy - 94} ${cx + 22},${cy - 82} C${cx + 44},${cy - 60} ${cx + 30},${cy - 18} ${cx},${cy}Z" ${plein(0.13)}/>`;
  let s = '';
  for (let i = 0; i < 5; i += 1) s += tourne(72 * i + 12, cx, cy, petale);
  /* la nervure de chaque pétale */
  for (let i = 0; i < 5; i += 1) s += tourne(72 * i + 12, cx, cy, `<path d="M${cx},${cy - 8} C${cx - 2},${cy - 40} ${cx + 2},${cy - 60} ${cx},${cy - 78}" stroke-opacity=".55"/>`);
  /* la colonne, qui sort du cœur vers le haut à droite */
  const ex = cx + 62, ey = cy - 78;
  s += `<path d="M${cx},${cy} L${ex},${ey}" stroke-width="2.4"/>`;
  for (let t = 0.58; t <= 0.9; t += 0.08) {
    const x = cx + (ex - cx) * t, y = cy + (ey - cy) * t;
    s += `<circle cx="${(x + 4).toFixed(1)}" cy="${(y - 2).toFixed(1)}" r="2.4" ${plein(0.7)}/><circle cx="${(x - 3).toFixed(1)}" cy="${(y + 3).toFixed(1)}" r="2.1" ${plein(0.7)}/>`;
  }
  for (let i = -2; i <= 2; i += 1) {
    const a = Math.atan2(ey - cy, ex - cx) + i * 0.32;
    s += `<path d="M${ex},${ey} l${(Math.cos(a) * 12).toFixed(1)},${(Math.sin(a) * 12).toFixed(1)}"/><circle cx="${(ex + Math.cos(a) * 14).toFixed(1)}" cy="${(ey + Math.sin(a) * 14).toFixed(1)}" r="2.6" ${plein(0.85)}/>`;
  }
  s += `<circle cx="${cx}" cy="${cy}" r="5" ${plein(0.5)}/>`;
  return enveloppe(s);
}

/* ── L'aloès : une hampe droite, des fleurs en tubes penchés, la rosette ── */
function aloes() {
  let s = `<path d="M120,226 C118,180 121,120 120,36" stroke-width="2.2"/>`;
  for (let i = 0; i < 12; i += 1) {
    const y = 42 + i * 9.5, cote = i % 2 ? 1 : -1, rx = 14 - Math.abs(6 - i) * 0.6;
    s += `<ellipse cx="${120 + cote * (rx + 3)}" cy="${y + 5}" rx="${rx.toFixed(1)}" ry="3.6" transform="rotate(${cote * 28} ${120 + cote * (rx + 3)} ${y + 5})" ${plein(0.16)}/>`;
  }
  /* la rosette : cinq feuilles épaisses qui s'ouvrent à la base */
  const feuille = (a, l) => tourne(a, 120, 226, `<path d="M120,226 C110,${226 - l * 0.4} 104,${226 - l * 0.8} 120,${226 - l} C136,${226 - l * 0.8} 130,${226 - l * 0.4} 120,226Z" ${plein(0.1)}/>`);
  s += feuille(-62, 92) + feuille(-32, 108) + feuille(32, 108) + feuille(62, 92) + feuille(-84, 70) + feuille(84, 70);
  /* les dents, quelques traits sur les bords des deux grandes feuilles */
  for (const a of [-32, 32]) for (let k = 1; k <= 4; k += 1) s += tourne(a, 120, 226, `<path d="M${113 - k * 0.6},${226 - k * 20} l-3,-2"/><path d="M${127 + k * 0.6},${226 - k * 20} l3,-2"/>`);
  return enveloppe(s);
}

/* ── Le baobab : la fleur pend, ses pétales se retroussent, la boule d'étamines ── */
function baobab() {
  const px = 120, py = 84;
  let s = `<path d="M120,0 C123,28 117,56 ${px},${py}" stroke-width="2"/>`;
  const petale = `<path d="M${px},${py} C${px - 14},${py - 22} ${px - 12},${py - 52} ${px},${py - 66} C${px + 12},${py - 52} ${px + 14},${py - 22} ${px},${py}Z" ${plein(0.13)}/>`;
  for (const a of [-76, -38, 0, 38, 76]) s += tourne(a, px, py, petale);
  /* la boule : des filets qui rayonnent, une anthère au bout de chacun */
  const bx = 120, by = 146, r = 44;
  for (let i = 0; i < 36; i += 1) {
    const a = (i * 10 + (i % 2) * 5) * Math.PI / 180, l = r * (0.86 + ((i * 7) % 5) * 0.03);
    const x = bx + Math.cos(a) * l, y = by + Math.sin(a) * l;
    s += `<path d="M${bx},${by} L${x.toFixed(1)},${y.toFixed(1)}" stroke-opacity=".8"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" ${plein(0.8)}/>`;
  }
  s += `<path d="M${px},${py} L${bx},${by}" stroke-width="2"/>`;
  s += `<path d="M${bx},${by} L120,226" stroke-width="1.8"/><path d="M114,222 L126,222 M120,216 L120,228"/>`;
  return enveloppe(s);
}

/* ── Le karité : un bouquet d'étoiles serrées au bout du rameau, deux feuilles ── */
function karite() {
  let s = `<path d="M120,232 C117,200 122,160 120,124" stroke-width="2"/>`;
  const feuille = (m) => `<path d="M120,166 C${120 - m * 26},${152} ${120 - m * 60},${158} ${120 - m * 82},${184} C${120 - m * 56},${186} ${120 - m * 24},${180} 120,166Z" ${plein(0.1)}/><path d="M120,166 C${120 - m * 30},${170} ${120 - m * 56},${176} ${120 - m * 78},${183}" stroke-opacity=".6"/>`;
  s += feuille(1) + feuille(-1);
  const places = [[120, 78], [92, 92], [148, 92], [104, 112], [136, 112], [78, 116], [162, 116], [120, 104], [96, 66], [144, 66], [120, 54]];
  places.forEach(([x, y], i) => {
    const e = 0.78 + ((i * 3) % 4) * 0.08;
    let fleur = etoile(8, 15, 3.4, 0.16);
    for (let k = 0; k < 8; k += 1) fleur += `<g transform="rotate(${45 * k + 22})"><path d="M0,-9 L0,-19" stroke-opacity=".7"/><circle cy="-20.5" r="1.4" ${plein(0.8)}/></g>`;
    s += pose(x, y, fleur, e, (i * 37) % 60);
    s += `<path d="M120,124 C${(120 + (x - 120) * 0.5).toFixed(1)},${(124 + (y - 124) * 0.4).toFixed(1)} ${x},${y + 6} ${x},${y}" stroke-opacity=".5"/>`;
  });
  return enveloppe(s);
}

/* ── Le neem : des panicules de petites étoiles, une feuille composée ── */
function neem() {
  let s = `<path d="M96,234 C100,200 110,160 122,120" stroke-width="2"/>`;
  const rameaux = [[122, 120, 150, 64], [122, 120, 178, 92], [118, 132, 90, 74], [116, 140, 60, 108], [120, 126, 134, 46], [122, 120, 196, 128], [117, 136, 74, 142]];
  rameaux.forEach(([x1, y1, x2, y2]) => {
    s += `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1 - 6} ${(x1 + x2) / 2},${y2 + 6} ${x2},${y2}" stroke-opacity=".75"/>`;
    s += pose(x2, y2, etoile(5, 11, 3.2, 0.18), 1);
    const mx = (x1 + x2) / 2 + 6, my = (y1 + y2) / 2 - 8;
    s += `<path d="M${(x1 + x2) / 2},${(y1 + y2) / 2} L${mx},${my}" stroke-opacity=".6"/>` + pose(mx, my, etoile(5, 8, 2.4, 0.18), 1);
  });
  /* la feuille pennée, à gauche du pied */
  s += `<path d="M98,226 C80,210 66,192 52,166" stroke-width="1.6"/>`;
  for (let k = 0; k < 5; k += 1) {
    const t = 0.15 + k * 0.19, x = 98 - 46 * t, y = 226 - 60 * t;
    s += `<path d="M${x.toFixed(1)},${y.toFixed(1)} C${(x - 10).toFixed(1)},${(y - 14).toFixed(1)} ${(x - 20).toFixed(1)},${(y - 16).toFixed(1)} ${(x - 24).toFixed(1)},${(y - 8).toFixed(1)} C${(x - 18).toFixed(1)},${(y - 4).toFixed(1)} ${(x - 8).toFixed(1)},${(y - 2).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}Z" ${plein(0.1)}/>`;
    s += `<path d="M${x.toFixed(1)},${y.toFixed(1)} C${(x + 8).toFixed(1)},${(y - 14).toFixed(1)} ${(x + 18).toFixed(1)},${(y - 18).toFixed(1)} ${(x + 24).toFixed(1)},${(y - 12).toFixed(1)} C${(x + 16).toFixed(1)},${(y - 6).toFixed(1)} ${(x + 6).toFixed(1)},${(y - 2).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}Z" ${plein(0.1)}/>`;
  }
  return enveloppe(s);
}

/* ── Le moringa : cinq pétales inégaux, un dressé et quatre rabattus, en grappe ── */
function moringa() {
  let s = `<path d="M84,234 C96,196 108,160 122,126" stroke-width="2"/>`;
  const fleur = () => {
    let f = '';
    const lots = [[0, 20, 5.2], [-70, 13, 4], [70, 13, 4], [-140, 11, 3.6], [140, 11, 3.6]];
    for (const [a, l, w] of lots) f += `<g transform="rotate(${a})"><path d="M0,0 C${-w},${-l * 0.4} ${-w * 0.8},${-l * 0.85} 0,${-l} C${w * 0.8},${-l * 0.85} ${w},${-l * 0.4} 0,0Z" ${plein(0.15)}/></g>`;
    for (let k = -1; k <= 1; k += 1) f += `<path d="M0,0 L${k * 4},${-9}" stroke-opacity=".7"/><circle cx="${k * 4.6}" cy="-10.5" r="1.3" ${plein(0.8)}/>`;
    return f;
  };
  const places = [[122, 126, -20], [150, 96, 24], [96, 100, -40], [136, 66, 10], [108, 64, -12], [166, 128, 46], [78, 132, -52], [122, 40, 0]];
  places.forEach(([x, y, a]) => {
    s += `<path d="M122,126 C${(122 + (x - 122) * 0.45).toFixed(1)},${(126 + (y - 126) * 0.3).toFixed(1)} ${x},${y + 8} ${x},${y}" stroke-opacity=".6"/>` + pose(x, y, fleur(), 1, a);
  });
  /* la feuille composée aux folioles rondes, à droite du pied */
  s += `<path d="M100,214 C124,206 150,204 180,194" stroke-width="1.5"/>`;
  for (let k = 0; k < 4; k += 1) {
    const t = 0.2 + k * 0.22, x = 100 + 80 * t, y = 214 - 20 * t;
    s += `<path d="M${x.toFixed(1)},${y.toFixed(1)} l-4,-16 M${x.toFixed(1)},${y.toFixed(1)} l6,14" stroke-opacity=".6"/>`;
    for (const [dx, dy] of [[-2, -9], [-5, -17], [3, 7], [7, 15]]) s += `<ellipse cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" rx="3.2" ry="2.4" ${plein(0.14)}/>`;
  }
  return enveloppe(s);
}

/* ── L'avocatier : une grappe de petites fleurs à six tépales, une feuille, le fruit ── */
function avocat() {
  let s = `<path d="M60,234 C74,196 92,160 112,128" stroke-width="2"/>`;
  /* la panicule */
  const places = [[112, 128, 1], [134, 104, 1], [92, 104, 1], [126, 80, 0.9], [102, 78, 0.9], [150, 88, 0.85], [76, 90, 0.85], [116, 56, 0.85], [140, 62, 0.8], [88, 60, 0.8], [160, 116, 0.8], [66, 118, 0.8]];
  places.forEach(([x, y, e], i) => {
    s += `<path d="M112,128 C${(112 + (x - 112) * 0.5).toFixed(1)},${(128 + (y - 128) * 0.35).toFixed(1)} ${x},${y + 7} ${x},${y}" stroke-opacity=".55"/>`;
    /* six tépales : trois grands, trois petits en quinconce */
    s += pose(x, y, etoile(3, 12, 3.6, 0.16) + `<g transform="rotate(60)">${etoile(3, 8.5, 2.8, 0.16)}</g>`, e, (i * 29) % 90);
  });
  /* la feuille, elliptique, à droite */
  s += `<path d="M112,180 C136,150 176,146 206,166 C182,190 140,196 112,180Z" ${plein(0.1)}/><path d="M112,180 C142,172 176,168 204,166" stroke-opacity=".6"/>`;
  for (let k = 1; k <= 4; k += 1) s += `<path d="M${112 + k * 20},${181 - k * 3} C${118 + k * 20},${170 - k * 3} ${126 + k * 20},${164 - k * 2} ${134 + k * 20},${160 - k * 2}" stroke-opacity=".35"/>`;
  /* le fruit, qui pend à gauche */
  s += `<path d="M58,120 C60,140 56,150 52,160" stroke-width="1.8"/><path d="M52,160 C34,160 22,184 26,206 C30,228 74,228 78,206 C82,184 70,160 52,160Z" ${plein(0.13)}/>`;
  for (let k = 0; k < 14; k += 1) s += `<circle cx="${(36 + ((k * 13) % 34)).toFixed(1)}" cy="${(172 + ((k * 29) % 46)).toFixed(1)}" r=".9" ${plein(0.7)} stroke="none"/>`;
  return enveloppe(s);
}

const FLEURS = { hibiscus, aloes, baobab, karite, neem, moringa, avocat };

/** Le dessin de la fleur d'une plante, ou rien si la Maison n'en a pas encore. */
export const fleurDe = (slug) => (FLEURS[slug] ? FLEURS[slug]() : '');
export const PLANTES_DESSINEES = Object.keys(FLEURS);
