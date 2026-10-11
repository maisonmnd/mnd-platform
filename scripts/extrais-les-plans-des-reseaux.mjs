/* LES PLANS DES RÉSEAUX, LUS DANS LEURS MAQUETTES — 11 octobre 2026.

   Phase 2 du cahier « Maison MND AI Operating System » : le calendrier des
   réseaux ne repart pas de rien. Trois plans ont été préparés et montrés à
   Yéman (trente jours, Instagram des mois deux et trois, LinkedIn sur deux
   mois) ; ce script les lit dans leurs pages et les écrit en données, dans
   `src/shared/ia-plans-des-reseaux.ts`, que l'atelier des contenus importe.

   node scripts/extrais-les-plans-des-reseaux.mjs [--verifie]
   Avec --verifie, il ne réécrit rien et dit si le module est à jour. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const SORTIE = path.join(racine, 'src/shared/ia-plans-des-reseaux.ts');

export const PLANS = [
  { id: 'trente-jours', nom: 'Trente jours de réseaux (28 septembre au 27 octobre 2026)', fichier: 'public/maquette-trente-jours-de-reseaux.html', bloc: 'jours', meta: 'jour__meta' },
  { id: 'instagram-mois-2-3', nom: 'Instagram, mois deux et trois (28 octobre au 27 décembre 2026)', fichier: 'public/maquette-instagram-mois-deux-et-trois.html', bloc: 'jours', meta: 'jour__meta' },
  { id: 'linkedin-deux-mois', nom: 'LinkedIn, deux mois', fichier: 'public/maquette-linkedin-deux-mois.html', bloc: 'posts', meta: 'post__meta' },
];

const MOIS = { janvier: '01', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', août: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12' };
const RESEAUX = { instagram: 'instagram', facebook: 'facebook', linkedin: 'linkedin', tiktok: 'tiktok', youtube: 'youtube', whatsapp: 'whatsapp', reel: 'instagram', story: 'instagram', stories: 'instagram' };

const entites = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const texte = (h) => entites(String(h ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const premier = (h, re) => (re.exec(h) ?? [])[1] ?? '';

/** Le contenu de chaque <li> de premier niveau de la liste `<ol class="bloc">`. */
function lesEntrees(html, bloc) {
  /* Une liste par semaine : on les lit toutes, dans l'ordre de la page. */
  const out = [];
  let debut = html.indexOf(`<ol class="${bloc}"`);
  while (debut >= 0) {
    const fin = html.indexOf('</ol>', debut);
    out.push(...lesLi(html.slice(html.indexOf('>', debut) + 1, fin)));
    debut = html.indexOf(`<ol class="${bloc}"`, fin);
  }
  return out;
}

function lesLi(corps) {
  const out = [];
  let profondeur = 0, depart = -1;
  const re = /<li\b[^>]*>|<\/li>/g;
  let m;
  while ((m = re.exec(corps))) {
    if (m[0].startsWith('<li')) { if (profondeur === 0) depart = m.index; profondeur += 1; }
    else { profondeur -= 1; if (profondeur === 0 && depart >= 0) { out.push(corps.slice(depart, m.index + 5)); depart = -1; } }
  }
  return out;
}

export function lisLePlan(p, brut) {
  const html = brut.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  return lesEntrees(html, p.bloc).map((li, i) => {
    const meta = premier(li, new RegExp(`<div class="${p.meta}">([\\s\\S]*?)</div>`));
    const dateDite = texte(premier(meta, /<span class="date">([\s\S]*?)<\/span>/));
    const dm = /(\d{1,2})(?:er)?\s+([a-zéû]+)/i.exec(dateDite);
    const date = dm && MOIS[dm[2].toLowerCase()] ? `2026-${MOIS[dm[2].toLowerCase()]}-${dm[1].padStart(2, '0')}` : '';
    const deps = [...meta.matchAll(/<span class="dep( c)?">([\s\S]*?)<\/span>/g)].map((x) => ({ c: !!x[1], t: texte(x[2]) }));
    const plateformes = p.id === 'linkedin-deux-mois'
      ? ['linkedin']
      : [...new Set(deps.filter((d) => !d.c).map((d) => RESEAUX[d.t.toLowerCase()]).filter(Boolean))];
    const visuels = premier(li, /<div class="visuels">([\s\S]*?)<\/div>\s*<div/) || premier(li, /<div class="visuels">([\s\S]*)/);
    const reel = deps.some((d) => /^reel$/i.test(d.t)) || /class="v-reel|class="reel/.test(visuels);
    const story = /class="story"/.test(li.slice(0, 40)) || (/v-story/.test(visuels) && !/v-post/.test(visuels));
    const carrousel = /class="car\b|class="v-car/.test(visuels);
    /* « Le point à trente jours » n'est pas une publication : c'est la revue des chiffres. */
    const bilan = /^Le point à/.test(texte(premier(premier(li, /<p class="titre">([\s\S]*?)<\/p>/), /<b>([\s\S]*?)<\/b>/)));
    const format = bilan ? 'bilan' : p.id === 'linkedin-deux-mois' ? (/v-doc/.test(visuels) ? 'document' : 'post') : reel ? 'reel' : story ? 'story' : carrousel ? 'carrousel' : 'post';
    const titreBloc = premier(li, /<p class="titre">([\s\S]*?)<\/p>/);
    const legende = texte(premier(li, /<div class="legende"[^>]*>([\s\S]*?)<\/div>/) || premier(li, /<div class="texte"[^>]*>([\s\S]*?)<\/div>/));
    const photos = [...visuels.matchAll(/<img class="ph" src="[^"]*\/([^"/]+)"/g)].map((x) => x[1]);
    const surImage = [...visuels.matchAll(/<h4>([\s\S]*?)<\/h4>/g)].map((x) => texte(x[1])).filter(Boolean);
    return {
      id: `${p.id}-${date || 'sans-date'}-${String(i + 1).padStart(2, '0')}`,
      plan: p.id,
      date,
      plateformes,
      format,
      serie: p.id === 'linkedin-deux-mois' ? [deps.find((d) => !d.c)?.t, deps.find((d) => d.c)?.t].filter(Boolean).join(' · ') : (deps.find((d) => d.c)?.t ?? ''),
      sujet: texte(premier(titreBloc, /<b>([\s\S]*?)<\/b>/)).replace(/\.$/, ''),
      description: texte(premier(titreBloc, /<span>([\s\S]*?)<\/span>/)),
      accroche: texte(premier(li, /<p class="accroche">([\s\S]*?)<\/p>/)).replace(/^Avant « voir plus » :\s*/, ''),
      legende,
      visuel: [photos.length ? `Photo : ${photos.join(', ')}` : '', surImage.length ? `Sur l’image : ${surImage.join(' / ')}` : ''].filter(Boolean).join('. '),
      note: [texte(premier(li, /<p class="note">([\s\S]*?)<\/p>/)), texte(premier(li, /<p class="voix">([\s\S]*?)<\/p>/))].filter(Boolean).join(' '),
    };
  }).filter((e) => e.date && e.sujet);
}

export function moduleDesPlans(lis = (f) => readFileSync(path.join(racine, f), 'utf8')) {
  const entrees = PLANS.flatMap((p) => lisLePlan(p, lis(p.fichier)));
  const plans = PLANS.map(({ id, nom }) => ({ id, nom, nombre: entrees.filter((e) => e.plan === id).length }));
  return [
    '/* LES PLANS DES RÉSEAUX DÉJÀ PRÉPARÉS — module ÉCRIT par',
    '   scripts/extrais-les-plans-des-reseaux.mjs à partir des maquettes',
    '   public/maquette-*.html. Ne pas le modifier à la main : refaire le script.',
    '   Le banc `verifie-l-atelier-des-contenus` crie s’il n’est plus à jour. */',
    '',
    'export type EntreeDePlan = { id: string; plan: string; date: string; plateformes: string[]; format: string; serie: string; sujet: string; description: string; accroche: string; legende: string; visuel: string; note: string };',
    '',
    `export const PLANS_DES_RESEAUX: readonly { id: string; nom: string; nombre: number }[] = ${JSON.stringify(plans, null, 1)};`,
    '',
    `export const ENTREES_DES_PLANS: readonly EntreeDePlan[] = ${JSON.stringify(entrees, null, 1)};`,
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('extrais-les-plans-des-reseaux.mjs')) {
  const voulu = moduleDesPlans();
  let present = '';
  try { present = readFileSync(SORTIE, 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
  if (process.argv.includes('--verifie')) {
    console.log(present === voulu ? 'Le module des plans est a jour.' : 'A REFAIRE : le module des plans ne dit plus les maquettes.');
    process.exit(present === voulu ? 0 : 1);
  }
  writeFileSync(SORTIE, voulu);
  const n = (voulu.match(/"id": "/g) ?? []).length;
  console.log(`Module ecrit : ${n} entrees (plans compris).`);
}
