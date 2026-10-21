/* LA PAPETERIE DU CLUB DES PETITES COURONNES — `node scripts/fabrique-le-carnet-du-club.mjs <dossier> [aperçus]`.

   21 octobre 2026. « Est-ce que c'est possible de dessiner tout un programme
   amusant pour MND Kids ? » (Yéman), puis, au sélecteur : le Club des Petites
   Couronnes, un collier de cauris ET des tampons, les cadeaux tels quels, le
   « tu » pour l'enfant, et « les cinq lots d'un coup ». Ce script fait le lot
   du papier, d'après la page validée (artefact PsdoECCZh7eH7TCkqt2UhE) :

     · « Le Carnet de la Petite Couronne », A6 : douze pages dans l'ordre (pour
       un imprimeur), et la même chose imposée sur A4 recto verso (deux carnets
       par jeu de trois feuilles : couper en deux, plier, agrafer) ;
     · le tampon du Club, rond, dans la famille des quinze tampons de la Maison
       (PNG transparent et PDF) ;
     · les diplômes A5 couchés : « Petite Couronne » (le collier plein) et
       « Un an », « Deux ans », « Trois ans de couronne ».

   Aucun prix, aucun prénom : le carnet se remplit à la main, l'enfant y écrit
   son nom de couronne. Les polices viennent de `src/ds/fonts` (Cormorant
   Garamond, Jost, la devise), le verrou de `public/assets/vectoriel`.
   Les fichiers intermédiaires (HTML) restent dans un dossier temporaire : le
   dossier donné ne reçoit que les PDF et le PNG du tampon. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEPOT = path.resolve(import.meta.dirname, '..').split(path.sep).join('/');
const SORTIE = path.resolve(process.argv[2] || path.join(tmpdir(), 'papeterie-du-club'));
const APERCUS = path.resolve(process.argv[3] || path.join(SORTIE, 'aperçus'));
const ATELIER = mkdtempSync(path.join(tmpdir(), 'club-atelier-'));
mkdirSync(SORTIE, { recursive: true });
mkdirSync(APERCUS, { recursive: true });

const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';
const svg = (nom) => readFileSync(`${DEPOT}/public/assets/vectoriel/${nom}.svg`, 'utf8').replace(/<\?xml[^>]*>/, '');
/* LES POLICES DE LA MAISON, prises à leur SOURCE (src/ds/fonts) et non dans
   dist-sites : une construction en cours vide dist-sites/revelateur, et la
   première version du carnet est sortie en Arial et Times sans rien dire. Les
   familles portent leur vrai nom ; avant d'imprimer, le script les charge et
   s'arrête si l'une manque (`policesChargees`). */
const police = (f) => pathToFileURL(`${DEPOT}/src/ds/fonts/${f}`).href;

const FONTES = `
@font-face { font-family: 'Cormorant Garamond'; src: url('${police('cormorant-latin.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Cormorant Garamond'; src: url('${police('cormorant-latin-ext.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Cormorant Garamond'; font-style: italic; src: url('${police('cormorant-italique-latin.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Cormorant Garamond'; font-style: italic; src: url('${police('cormorant-italique-latin-ext.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-ext.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF; }
@font-face { font-family: 'Devise'; src: url('${police('devise-fon.woff2')}') format('woff2'); }
`;
/* La charte : l'encre indigo, les filets cuivre, le fond blanc du papier (un
   carnet s'imprime aussi à la maison : pas d'aplat d'ivoire qui boit l'encre),
   le sable seulement en petites touches. Jamais obsidienne. */
const CHARTE = `
:root { --indigo: #1E2150; --cuivre: #9A6036; --cuivre-clair: #B97A4A; --sable: #F1E2C9; --voile: #FAF1E9; --argile: #E7D7C2; --doux: #5E5750; --papier: #FFFFFF; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--papier); color: var(--indigo); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
::-webkit-scrollbar { display: none; }
.sur { font: 500 2.2mm/1.3 'Jost', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: var(--cuivre); }
.titre { font: 400 7.4mm/1.04 'Cormorant Garamond', serif; color: var(--indigo); }
.titre em { font-style: italic; color: var(--cuivre); }
.texte { font: 400 3.3mm/1.5 'Jost', sans-serif; color: var(--indigo); }
.doux { color: var(--doux); }
.devise { font: italic 400 3.2mm/1.3 'Devise', 'Cormorant Garamond', serif; color: var(--cuivre); }
`;

/* LE CAURIS, dessiné une fois : plein (gagné) ou en pointillé (à gagner). */
const cauris = (plein = true, l = 7) => `<svg viewBox="0 0 40 56" style="width:${l}mm;height:auto;display:block" aria-hidden="true">
  <ellipse cx="20" cy="28" rx="16" ry="24" fill="${plein ? '#F4EBDD' : 'none'}" stroke="${plein ? '#9A6036' : '#B97A4A'}" stroke-width="2"${plein ? '' : ' stroke-dasharray="4 4"'}/>
  ${plein ? '<path d="M20 9c-3 9-3 29 0 38 3-9 3-29 0-38z" fill="#7C4C2C"/><path d="M15 16h3M15 22h3M15 28h3M15 34h3M15 40h3M22 16h3M22 22h3M22 28h3M22 34h3M22 40h3" stroke="#F4EBDD" stroke-width="1.2"/>' : ''}
</svg>`;

/* ═══ LE CARNET, A6 (105 × 148 mm) ════════════════════════════════════ */
const A6 = 'width: 105mm; height: 148mm;';
const page = (contenu, classe = '') => `<section class="a6 ${classe}">${contenu}</section>`;
const pied = (n) => `<p class="folio">${n}</p>`;

const CINQ_MOMENTS = [
  ['Je découvre', 'La première fois, on ne touche pas à tes cheveux. Tu visites l’atelier, tu touches les peignes, tu choisis ton fauteuil.'],
  ['Je choisis', 'À chaque visite, c’est toi qui choisis : une histoire, une musique, ou le silence. Une pause quand tu veux.'],
  ['Je collectionne', 'À chaque visite, un cauris de plus sur ton collier, et un tampon dans ce carnet.'],
  ['Je prends soin', 'Le soir, ton bonnet. Deux fois par semaine, ta brume. Chaque geste, un autocollant.'],
  ['Je fête', 'Chaque année, l’anniversaire de ta couronne : une photo, un diplôme, une coiffure de fête si tu veux.'],
];
const PALIERS = [
  [1, 'Bienvenue', 'ton cordon, ce carnet et l’écusson du Club'],
  [3, 'Le premier rang', 'un bonnet de nuit en satin à ta taille'],
  [6, 'La moitié du collier', 'la trousse « Mon kit de couronne »'],
  [10, 'Petite Couronne', 'le cauris d’or, ton diplôme et ta photo dans ce carnet'],
];
const PROMESSES = [
  ['Douceur', 'On prend le temps. Jamais de mal pour aller plus vite.'],
  ['Sécurité', 'Papa, maman ou un grand de ta famille reste avec toi.'],
  ['Patience', 'Une pause, une histoire, une chanson : tu demandes.'],
  ['Hygiène', 'Des outils propres pour toi, comme pour les grands.'],
  ['Famille', 'Tu peux venir le même jour que ta famille.'],
];
const semaine = (n) => `<div class="semaine">
  <p class="semaine__titre">Semaine ${n}</p>
  <div class="grille"><span></span><b>L</b><b>M</b><b>M</b><b>J</b><b>V</b><b>S</b><b>D</b>
    <span>Mon bonnet</span>${'<i></i>'.repeat(7)}
    <span>Ma brume</span>${'<i></i>'.repeat(7)}
    <span>Mon lavage</span>${'<i></i>'.repeat(7)}
  </div>
  <p class="signe">Signé par papa ou maman : <span></span></p>
</div>`;

const PAGES_DU_CARNET = [
  /* 1 · la couverture */
  page(`<div class="couv">
    <div class="couv__verrou">${svg('verrou-debout-indigo')}</div>
    <div class="couv__titre"><p class="sur">Club des Petites Couronnes</p><h1 class="titre">Le Carnet<br>de la <em>Petite Couronne</em></h1></div>
    <div class="couv__collier">${Array.from({ length: 5 }, () => cauris(true, 6)).join('')}</div>
    <p class="sur" style="color:var(--indigo)">Maison MND · MND Kids</p>
  </div>`, 'a6--couv'),
  /* 2 · mon nom de couronne */
  page(`<p class="sur">Ce carnet est à moi</p><h2 class="titre">Mon nom<br>de couronne</h2>
    <p class="texte doux">Un nom que tu inventes, rien qu’à toi.</p>
    <div class="ligne"></div>
    <div class="cadre-dessin grand"><span>Mon portrait,<br>dessiné par moi</span></div>
    <p class="texte doux petit">Mon premier jour au Club : le ____ / ____ / 20____</p>${pied(2)}`),
  /* 3 · bienvenue, les cinq moments */
  page(`<p class="sur">Bienvenue au Club</p><h2 class="titre">Ce qui se passe<br>quand tu viens</h2>
    <ol class="moments">${CINQ_MOMENTS.map(([t, p]) => `<li><b>${t}</b><span>${p}</span></li>`).join('')}</ol>${pied(3)}`),
  /* 4 · mes visites, 1 à 5 */
  page(`<p class="sur">Un tampon par visite</p><h2 class="titre">Mes visites</h2>
    <div class="tampons">${[1, 2, 3, 4, 5].map((n) => `<div class="tampon"><span class="tampon__rond"></span><span class="tampon__n">${n}</span><span class="tampon__date">le __ / __ / 20__</span></div>`).join('')}</div>${pied(4)}`),
  /* 5 · mes visites, 6 à 10, et le collier */
  page(`<p class="sur">Un tampon par visite</p><h2 class="titre">Mes visites <em>(suite)</em></h2>
    <div class="tampons">${[6, 7, 8, 9, 10].map((n) => `<div class="tampon"><span class="tampon__rond"></span><span class="tampon__n">${n}</span><span class="tampon__date">le __ / __ / 20__</span></div>`).join('')}</div>${pied(5)}`),
  /* 6 · mon collier et ses paliers */
  page(`<p class="sur">Mon collier de cauris</p><h2 class="titre">Ce que je gagne</h2>
    <div class="collier">${Array.from({ length: 10 }, (_, i) => `<span class="collier__perle">${cauris(false, 6.2)}<small>${i + 1}</small></span>`).join('')}</div>
    <p class="texte doux petit" style="text-align:center">Colorie un cauris à chaque visite.</p>
    <ul class="paliers">${PALIERS.map(([n, t, c]) => `<li><span class="paliers__n">${n}</span><span><b>${t}</b><br>${c}</span></li>`).join('')}</ul>${pied(6)}`),
  /* 7 · le rituel du soir, semaines 1 et 2 */
  page(`<p class="sur">Entre deux visites</p><h2 class="titre">Mon rituel du soir</h2>
    <p class="texte doux petit">Un autocollant ou une étoile à chaque geste.</p>${semaine(1)}${semaine(2)}${pied(7)}`),
  /* 8 · semaines 3 et 4 */
  page(`<p class="sur">Entre deux visites</p><h2 class="titre">Mon rituel <em>du soir</em></h2>${semaine(3)}${semaine(4)}${pied(8)}`),
  /* 9 · ma couronne grandit, le premier jour */
  page(`<p class="sur">Ma couronne grandit</p><h2 class="titre">Mon premier jour</h2>
    <div class="cadre-photo"><span>La photo<br>de mon premier jour</span></div>
    <p class="texte doux petit">Le ____ / ____ / 20____</p>${pied(9)}`),
  /* 10 · les anniversaires */
  page(`<p class="sur">Ma couronne grandit</p><h2 class="titre">Mes anniversaires<br>de couronne</h2>
    <div class="deux-photos"><div class="cadre-photo moyen"><span>Un an</span></div><div class="cadre-photo moyen"><span>Deux ans</span></div></div>${pied(10)}`),
  /* 11 · ce que j'ai aimé */
  page(`<p class="sur">Mes pages à moi</p><h2 class="titre">Ce que j’ai aimé<br>aujourd’hui</h2>
    <div class="cadre-dessin grand"><span>Un dessin, un mot,<br>une histoire</span></div>${pied(11)}`),
  /* 12 · le dos : les cinq promesses */
  page(`<div class="dos">
    <p class="sur" style="color:#D6A06F">La Maison te promet</p>
    <ul class="promesses">${PROMESSES.map(([t, p]) => `<li><b>${t}</b><span>${p}</span></li>`).join('')}</ul>
    <p class="oui">Et rien ne commence sans ton oui.</p>
    <div class="dos__verrou">${svg('verrou-couche-ivoire')}</div>
    <p class="devise" style="color:#D6A06F">${DEVISE}</p>
  </div>`, 'a6--dos'),
];

const CSS_CARNET = `
.a6 { ${A6} position: relative; overflow: hidden; padding: 9mm 9mm 10mm; display: flex; flex-direction: column; gap: 3.2mm; background: var(--papier); }
.a6::before { content: ''; position: absolute; inset: 4mm; border: .3mm solid var(--argile); pointer-events: none; }
.a6 .titre em { font-size: .8em; }
.folio { position: absolute; bottom: 5.6mm; left: 0; right: 0; text-align: center; font: 400 2.2mm 'Jost', sans-serif; letter-spacing: .2em; color: var(--cuivre); }
.petit { font-size: 2.8mm; }
.ligne { border-bottom: .3mm solid var(--indigo); height: 9mm; margin-top: -1mm; }
.cadre-dessin, .cadre-photo { border: .4mm dashed var(--cuivre-clair); border-radius: 3mm; display: grid; place-items: center; text-align: center; font: italic 400 3.6mm/1.3 'Cormorant Garamond', serif; color: var(--cuivre); }
.cadre-dessin.grand { flex: 1; }
.cadre-photo { flex: 1; border-style: solid; border-color: var(--argile); background: var(--voile); }
.cadre-photo.moyen { flex: none; height: 46mm; }
.deux-photos { flex: 1; display: grid; gap: 4mm; align-content: start; }
/* La couverture et le dos : un cadre indigo, le papier reste blanc au milieu. */
.a6--couv { padding: 0; border: 4mm solid var(--indigo); }
.a6--couv::before { inset: 2.2mm; border-color: var(--cuivre-clair); }
.couv { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; padding: 9mm 6mm 8mm; }
.couv__verrou { width: 22mm; } .couv__verrou svg { width: 100%; height: auto; display: block; }
.couv__titre { display: grid; gap: 3mm; }
.couv .titre { font-size: 8.6mm; }
.couv__collier { display: flex; gap: 2.6mm; }
.a6--dos { background: var(--indigo); padding: 9mm 8mm 8mm; }
.a6--dos::before { border-color: rgba(246, 241, 231, .25); }
.dos { height: 100%; display: flex; flex-direction: column; gap: 3.4mm; color: #F6F1E7; }
.promesses { list-style: none; display: grid; gap: 2.6mm; }
.promesses li { display: grid; gap: .4mm; font: 400 3mm/1.4 'Jost', sans-serif; }
.promesses b { font: 500 4.2mm/1.1 'Cormorant Garamond', serif; color: #F6F1E7; }
.oui { font: italic 400 4.4mm/1.2 'Cormorant Garamond', serif; color: #F6F1E7; margin-top: auto; }
.dos__verrou { width: 34mm; } .dos__verrou svg { width: 100%; height: auto; display: block; }
.moments { list-style: none; display: grid; gap: 2.4mm; counter-reset: m; }
.moments li { display: grid; grid-template-columns: 6mm 1fr; column-gap: 2mm; font: 400 2.95mm/1.38 'Jost', sans-serif; color: var(--indigo); }
.moments li::before { counter-increment: m; content: counter(m); grid-row: span 2; width: 5.4mm; height: 5.4mm; border-radius: 50%; background: var(--voile); border: .3mm solid var(--cuivre-clair); display: grid; place-items: center; font: 500 2.6mm 'Jost', sans-serif; color: var(--cuivre); }
.moments b { font: 500 3.9mm/1.1 'Cormorant Garamond', serif; }
.tampons { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 4mm; align-content: start; }
.tampon { display: grid; justify-items: center; gap: 1mm; position: relative; }
.tampon:last-child:nth-child(odd) { grid-column: 1 / -1; }
.tampon__rond { width: 25mm; height: 25mm; border-radius: 50%; border: .4mm dashed var(--cuivre-clair); }
.tampon__n { position: absolute; top: 9.2mm; font: italic 400 6mm/1 'Cormorant Garamond', serif; color: var(--argile); }
.tampon__date { font: 400 2.4mm 'Jost', sans-serif; color: var(--doux); letter-spacing: .04em; }
.collier { display: grid; grid-template-columns: repeat(10, 1fr); gap: 1mm; padding: 2mm 0 0; border-top: .4mm solid #7C4C2C; border-radius: 50% 50% 0 0 / 3mm 3mm 0 0; }
.collier__perle { display: grid; justify-items: center; gap: .6mm; }
.collier__perle small { font: 400 2.2mm 'Jost', sans-serif; color: var(--doux); }
.paliers { list-style: none; display: grid; gap: 2.2mm; margin-top: 1mm; }
.paliers li { display: grid; grid-template-columns: 9mm 1fr; align-items: center; gap: 2.6mm; font: 400 2.9mm/1.35 'Jost', sans-serif; color: var(--indigo); }
.paliers b { font: 500 3.9mm/1.1 'Cormorant Garamond', serif; }
.paliers__n { width: 9mm; height: 9mm; border-radius: 50%; background: var(--sable); display: grid; place-items: center; font: 500 3.4mm 'Jost', sans-serif; color: var(--cuivre); }
.semaine { display: grid; gap: 1.6mm; }
.semaine__titre { font: 500 2.4mm 'Jost', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--cuivre); }
.grille { display: grid; grid-template-columns: 17mm repeat(7, 1fr); gap: 1mm; align-items: center; font: 400 2.5mm 'Jost', sans-serif; color: var(--indigo); }
.grille b { font-weight: 500; text-align: center; }
.grille i { aspect-ratio: 1; border-radius: 1.2mm; background: var(--voile); border: .25mm solid var(--argile); }
.signe { font: 400 2.4mm 'Jost', sans-serif; color: var(--doux); display: flex; gap: 2mm; align-items: flex-end; }
.signe span { flex: 1; border-bottom: .25mm solid var(--doux); height: 3.4mm; }
`;

const carnetDansLOrdre = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}${CSS_CARNET}
@page { size: 105mm 148mm; margin: 0; }
.a6 { break-after: page; }
</style></head><body>${PAGES_DU_CARNET.join('')}</body></html>`;

/* L'IMPOSITION : douze pages, trois feuilles pliées l'une dans l'autre. Chaque
   face d'une feuille porte deux pages A6 côte à côte (un A5 couché) ; la page A4
   porte la même face deux fois, l'une sous l'autre : on imprime recto verso
   (retourner sur le bord long), on coupe l'A4 en deux, on plie, on agrafe, et
   l'on a deux carnets. */
const FACES = [[12, 1], [2, 11], [10, 3], [4, 9], [8, 5], [6, 7]];
const faceA5 = ([g, d]) => `<div class="planche"><div class="moitie">${PAGES_DU_CARNET[g - 1]}</div><div class="moitie">${PAGES_DU_CARNET[d - 1]}</div></div>`;
const carnetImpose = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}${CSS_CARNET}
@page { size: A4 portrait; margin: 0; }
.feuille { width: 210mm; height: 297mm; display: grid; grid-template-rows: 148.5mm 148.5mm; break-after: page; position: relative; }
.planche { display: grid; grid-template-columns: 105mm 105mm; align-items: center; }
.moitie { display: grid; place-items: center; }
.feuille::after { content: ''; position: absolute; left: 0; right: 0; top: 148.5mm; border-top: .2mm dashed #B97A4A; }
.coupe { position: absolute; left: 3mm; top: 146mm; font: 400 2mm 'Jost', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #B97A4A; }
</style></head><body>${FACES.map((f) => `<div class="feuille">${faceA5(f)}${faceA5(f)}<p class="coupe">Couper ici · plier au milieu</p></div>`).join('')}</body></html>`;

/* ═══ LE TAMPON DU CLUB ══════════════════════════════════════════════
   Dans la famille du sceau de la Maison (mnd-1-sceau) : deux cercles, le nom
   sur l'anneau, deux étoiles, le pictogramme au cœur ; ici le cauris en plus. */
const TAMPON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <path id="haut" d="M 82 300 A 218 218 0 0 1 518 300"/>
    <path id="bas" d="M 64 300 A 236 236 0 0 0 536 300"/>
  </defs>
  <g fill="none" stroke="#1E2150">
    <circle cx="300" cy="300" r="290" stroke-width="7"/>
    <circle cx="300" cy="300" r="276" stroke-width="2.5"/>
    <circle cx="300" cy="300" r="186" stroke-width="5"/>
  </g>
  <text font-family="Cormorant Garamond" font-weight="500" font-size="54" letter-spacing="9" fill="#1E2150" text-anchor="middle"><textPath href="#haut" startOffset="50%">CLUB DES PETITES</textPath></text>
  <text font-family="Jost" font-weight="500" font-size="40" letter-spacing="7" fill="#1E2150" text-anchor="middle"><textPath href="#bas" startOffset="50%">COURONNES · MAISON MND</textPath></text>
  <path transform="translate(42 300) scale(1.25)" d="M0-14 4.1-4.6 14.3-4.3 6.2 2 9 12 0 6.2-9 12-6.2 2-14.3-4.3-4.1-4.6Z" fill="#1E2150"/>
  <path transform="translate(558 300) scale(1.25)" d="M0-14 4.1-4.6 14.3-4.3 6.2 2 9 12 0 6.2-9 12-6.2 2-14.3-4.3-4.1-4.6Z" fill="#1E2150"/>
  <g transform="translate(222 158) scale(0.19)" fill="#1E2150">${svg('pictogramme-indigo').replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
  <text x="300" y="352" font-family="Cormorant Garamond" font-style="italic" font-size="54" fill="#1E2150" text-anchor="middle">MND Kids</text>
  <line x1="262" y1="378" x2="338" y2="378" stroke="#1E2150" stroke-width="5"/>
  <g transform="translate(282 394) scale(0.9)"><ellipse cx="20" cy="28" rx="16" ry="24" fill="none" stroke="#1E2150" stroke-width="4"/><path d="M20 9c-3 9-3 29 0 38 3-9 3-29 0-38z" fill="#1E2150"/></g>
</svg>`;
const tampon = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}
@page { size: 50mm 50mm; margin: 0; }
html, body { margin: 0; background: transparent; overflow: hidden; }
::-webkit-scrollbar { display: none; }
body { width: 600px; height: 600px; }
.t { width: 600px; height: 600px; }
.t svg { display: block; }
@media print { body { width: 50mm; height: 50mm; } .t { width: 50mm; height: 50mm; } .t svg { width: 50mm; height: 50mm; } }
</style></head><body><div class="t">${TAMPON_SVG}</div></body></html>`;

/* ═══ LES DIPLÔMES, A5 COUCHÉ (210 × 148 mm) ═════════════════════════ */
const diplome = (sur, titre, phrase) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}
@page { size: 210mm 148mm; margin: 0; }
body { width: 210mm; height: 148mm; }
.d { position: relative; width: 210mm; height: 148mm; padding: 13mm 18mm 11mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
.d::before { content: ''; position: absolute; inset: 5mm; border: 1.2mm solid var(--indigo); }
.d::after { content: ''; position: absolute; inset: 7.6mm; border: .3mm solid var(--cuivre-clair); }
.verrou { width: 44mm; } .verrou svg { width: 100%; height: auto; display: block; }
.d .sur { font-size: 2.6mm; }
.d h1 { font: italic 400 15mm/1 'Cormorant Garamond', serif; color: var(--cuivre); }
.phrase { font: 400 3.8mm/1.5 'Jost', sans-serif; color: var(--indigo); max-width: 140mm; }
.nom { width: 110mm; border-bottom: .35mm solid var(--indigo); height: 9mm; }
.nom-dit { font: 400 2.3mm 'Jost', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--doux); margin-top: 1mm; }
.collier { display: flex; gap: 1.6mm; }
.bas { width: 100%; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8mm; }
.bas p { font: 400 3.2mm/1.5 'Jost', sans-serif; color: var(--indigo); }
.bas .gauche { text-align: left; } .bas .droite { text-align: right; }
.signature { font: italic 500 5mm/1.1 'Cormorant Garamond', serif; color: var(--indigo); }
.place-tampon { width: 24mm; height: 24mm; border-radius: 50%; border: .3mm dashed var(--argile); display: grid; place-items: center; font: 400 2mm 'Jost', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--doux); }
.devise { font-size: 3.1mm; }
</style></head><body><div class="d">
  <div class="verrou">${svg('verrou-couche-indigo')}</div>
  <div style="display:grid;gap:3mm;justify-items:center">
    <p class="sur">Club des Petites Couronnes · ${sur}</p>
    <h1>${titre}</h1>
    <p class="phrase">${phrase}</p>
  </div>
  <div style="display:grid;justify-items:center"><div class="nom"></div><p class="nom-dit">Mon nom de couronne</p></div>
  <div class="collier">${Array.from({ length: 10 }, () => cauris(true, 4.2)).join('')}</div>
  <div class="bas">
    <p class="gauche">Le ____ / ____ / 20____<br>à Cotonou</p>
    <div class="place-tampon">le tampon</div>
    <p class="droite"><span class="signature">La Maison MND</span><br><span class="devise">${DEVISE}</span></p>
  </div>
</div></body></html>`;

const DIPLOMES = [
  ['Diplôme · Petite Couronne · A5', diplome('Diplôme', 'Petite Couronne', 'La Maison remet ce diplôme à l’enfant qui a rempli son collier : dix visites, dix cauris, et une couronne qui grandit.')],
  ['Diplôme · Un an de couronne · A5', diplome('Anniversaire', 'Un an de couronne', 'Il y a un an, ta couronne est née à la Maison. Joyeux anniversaire de couronne !')],
  ['Diplôme · Deux ans de couronne · A5', diplome('Anniversaire', 'Deux ans de couronne', 'Il y a deux ans, ta couronne est née à la Maison. Joyeux anniversaire de couronne !')],
  ['Diplôme · Trois ans de couronne · A5', diplome('Anniversaire', 'Trois ans de couronne', 'Il y a trois ans, ta couronne est née à la Maison. Joyeux anniversaire de couronne !')],
];

/* ═══ LE RENDU ═══════════════════════════════════════════════════════ */
const TRAVAUX = [
  { nom: 'Carnet de la Petite Couronne · A6', html: carnetDansLOrdre, pdf: { paperWidth: 105 / 25.4, paperHeight: 148 / 25.4 }, apercu: { l: 397, h: 559 }, pages: PAGES_DU_CARNET.length },
  { nom: 'Carnet de la Petite Couronne · à imprimer recto verso sur A4', html: carnetImpose, pdf: { paperWidth: 8.27, paperHeight: 11.69 }, apercu: { l: 794, h: 1123 } },
  { nom: 'Tampon du Club', html: tampon, pdf: { paperWidth: 50 / 25.4, paperHeight: 50 / 25.4 }, png: { l: 600, h: 600 }, transparent: true },
  ...DIPLOMES.map(([nom, html]) => ({ nom, html, pdf: { paperWidth: 210 / 25.4, paperHeight: 148 / 25.4 }, apercu: { l: 794, h: 559 } })),
];
const fichier = (nom) => nom.replace(/[\\/:*?"<>|]/g, '-');
for (const t of TRAVAUX) writeFileSync(path.join(ATELIER, `${fichier(t.nom)}.html`), t.html);

const dbg = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
  `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'club-chrome-'))}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((x) => x.type === 'page'); } catch { /* pas encore */ } }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Page.enable');
await cdp('Runtime.enable');

/* LE DÉBORD SE MESURE, il ne se devine pas : un texte qui sort de sa page A6
   (ou de son diplôme) est un défaut, et le script s'arrête sur lui. */
const DEBORD = `(() => [...document.querySelectorAll('.a6, .d, .t')].flatMap((p, i) => { const b = p.getBoundingClientRect(); return [...p.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > b.right + 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1); }).slice(0, 2).map((e) => 'page ' + (i + 1) + ' : ' + (e.className || e.tagName)); }))()`;
/* LES POLICES SE CHARGENT, OU RIEN NE S'IMPRIME : chaque face de la Maison est
   demandée, puis vérifiée ; une seule absente, et le script s'arrête au lieu
   d'imprimer en police de repli. */
const POLICES_CHARGEES = `(async () => {
  const faces = ['16px "Cormorant Garamond"', 'italic 16px "Cormorant Garamond"', '500 16px "Cormorant Garamond"', '16px "Jost"', '500 16px "Jost"', '16px "Devise"'];
  const manque = [];
  for (const f of faces) {
    try { const l = await document.fonts.load(f, f.includes('Devise') ? 'ɔɖɛ' : 'Couronne'); if (!l.length || !document.fonts.check(f)) manque.push(f); }
    catch { manque.push(f); }
  }
  return manque;
})()`;
let fautes = 0;
for (const t of TRAVAUX) {
  const url = pathToFileURL(path.join(ATELIER, `${fichier(t.nom)}.html`)).href;
  const taille = t.png ?? t.apercu;
  await cdp('Emulation.setDeviceMetricsOverride', { width: taille.l, height: taille.h, deviceScaleFactor: t.png ? 1 : 2, mobile: false });
  await cdp('Emulation.setDefaultBackgroundColorOverride', t.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await cdp('Page.navigate', { url });
  await attend(1500);
  await evalue('document.fonts.ready.then(() => true)');
  const manque = await evalue(POLICES_CHARGEES);
  if (manque?.length) { ws.close(); chrome.kill(); console.log(`POLICES ABSENTES dans « ${t.nom} » : ${manque.join(', ')}. Rien n est imprime.`); process.exit(1); }
  const debord = await evalue(DEBORD);
  if (debord?.length) { fautes += 1; console.log(`DEBORD ${t.nom} : ${debord.join(', ')}`); }
  const r = await cdp('Page.printToPDF', { ...t.pdf, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true });
  writeFileSync(path.join(SORTIE, `${fichier(t.nom)}.pdf`), Buffer.from(r.result.data, 'base64'));
  if (t.png) {
    const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: taille.l, height: taille.h, scale: 1 } });
    writeFileSync(path.join(SORTIE, `${fichier(t.nom)}.png`), Buffer.from(img.result.data, 'base64'));
  }
  /* Les aperçus : chaque page du carnet, une par une ; une image par diplôme. */
  if (t.pages) {
    for (let i = 0; i < t.pages; i++) {
      await evalue(`(() => { document.querySelectorAll('.a6').forEach((p, j) => { p.style.display = j === ${i} ? '' : 'none'; }); return true; })()`);
      const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: taille.l, height: taille.h, scale: 1 } });
      writeFileSync(path.join(APERCUS, `carnet-page-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(img.result.data, 'base64'));
    }
  } else if (t.apercu) {
    const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: taille.l, height: taille.h, scale: 1 } });
    writeFileSync(path.join(APERCUS, `${fichier(t.nom)}.png`), Buffer.from(img.result.data, 'base64'));
  }
  console.log('fait', t.nom);
}
ws.close(); chrome.kill();
if (fautes) { console.log(`${fautes} document(s) debordent : rien n est bon tant qu ils debordent.`); process.exit(1); }
console.log('Tout tient dans ses pages.');
