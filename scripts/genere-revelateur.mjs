import { build } from 'esbuild';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE SITE RÉVÉLATEUR : DE VRAIES PAGES, ÉCRITES AVANT TOUT SCRIPT — 17 septembre 2026.

   « Construis » (Yéman). Google ne lit pas une application React : il lit des
   fichiers. Ce script prend le contenu en données (`src/apps/revelateur/contenu.ts`)
   et les dix articles du Journal (`docs/site-revelateur/journal/*.md`), et écrit
   une page HTML par adresse dans `revelateur/<chemin>/index.html` : titre,
   description, H1, textes, liens, balisage structuré, tout est dans le fichier.
   Les îlots React (triage, demande, avis, contact) ne se montent que dans
   leurs emplacements (`data-ilot`), et chaque emplacement porte un repli
   statique. Le dossier `revelateur/` est GÉNÉRÉ (ignoré par git) : Vite le lit
   comme entrées, en développement comme à la construction.

   AUCUN DOMAINE EN DUR : les adresses absolues (canonique, Open Graph, JSON-LD)
   portent le repère `__LIEN_DU_SITE__`, que `build-sites.mjs` remplace en
   lisant le compte GitHub sur le dépôt. Le préfixe des liens internes vient
   de VITE_BASE (`/revelateur/` à la construction ; en développement, le
   dossier lui-même sert de préfixe). */

const racine = path.resolve(import.meta.dirname, '..');
const SORTIE = path.join(racine, 'revelateur');
const BASE = (process.env.VITE_BASE || '/revelateur/').replace(/\/?$/, '/');
const SITE = '__LIEN_DU_SITE__'; // avec sa barre finale, posé par build-sites
const JOURNAL_MD = path.join(racine, 'docs', 'site-revelateur', 'journal');

/* ── Le contenu, lu par esbuild comme le font les harnais ────────────── */
const dossierTmp = mkdtempSync(path.join(tmpdir(), 'genere-revelateur-'));
const entree = path.join(dossierTmp, 'entree.ts');
writeFileSync(entree, `export * from '${path.join(racine, 'src/apps/revelateur/contenu.ts').replace(/\\/g, '/')}';
export { DEVISE_COMPLETE } from '${path.join(racine, 'src/shared/identite.ts').replace(/\\/g, '/')}';
`);
const module_ = path.join(dossierTmp, 'contenu.mjs');
let contenu;
try {
  await build({
    entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', outfile: module_, logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: BASE }) },
    banner: { js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };` },
  });
  contenu = await import(pathToFileURL(module_).href);
} finally {
  rmSync(dossierTmp, { recursive: true, force: true });
}
const { COMMUN, ACCUEIL, PAGES, DEVISE_COMPLETE } = contenu;

/* ── Petits outils ───────────────────────────────────────────────────── */
const echappe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = echappe;
/* Les sœurs vivent sur la même origine, hors de ce site : en ligne sous
   `/couronne/` et `/academie/` (build-sites les nomme), en développement
   sous leur page `.html`. Jamais un domaine. */
const SOEURS = {
  couronne: process.env.VITE_LINK_COURONNE || '/couronne.html',
  academie: process.env.VITE_LINK_ACADEMIE || '/academie.html',
};
const lien = (vers) => {
  if (vers.startsWith('whatsapp:')) return null;
  if (vers.startsWith('soeur:')) return SOEURS[vers.slice('soeur:'.length)] ?? BASE;
  if (vers.startsWith('#')) return `${BASE}${vers}`;
  if (vers.startsWith('/#')) return `${BASE}${vers.slice(1)}`;
  return `${BASE}${vers.replace(/^\//, '')}`;
};
const bouton = (l, classe = 'btn') => {
  if (l.vers.startsWith('whatsapp:')) {
    const besoin = l.vers.slice('whatsapp:'.length);
    return `<a class="${classe}" data-wa="${attr(besoin)}" href="https://wa.me/?text=${encodeURIComponent(COMMUN.messages[besoin] ?? COMMUN.messages.inconnu)}"><svg><use href="#i-wa"/></svg>${echappe(l.texte)}</a>`;
  }
  return `<a class="${classe}" href="${attr(lien(l.vers))}">${echappe(l.texte)}</a>`;
};
const image = (nom, alt = '', extra = '') => `<img src="/assets/photos/site/${attr(nom)}" alt="${attr(alt)}" width="800" height="1000" loading="lazy"${extra}>`;
const ICONES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-wa" viewBox="0 0 24 24"><path d="M4 20l1.3-3.9A8 8 0 1 1 8.3 19L4 20z" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
  <symbol id="i-fleche" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
</svg>`;

/* ── Le balisage structuré ───────────────────────────────────────────── */
const noeudMaison = () => ({
  '@type': 'HairSalon', '@id': `${SITE}#maison`,
  name: COMMUN.nom, url: SITE, image: `${SITE}assets/photos/site/hero.jpg`, logo: `${SITE}assets/monograms/mono-indigo.png`,
  description: 'Maison boutique de soin et de création de dreadlocks afro à Cotonou.',
  address: { '@type': 'PostalAddress', addressLocality: COMMUN.ville, addressCountry: 'BJ' },
  areaServed: `${COMMUN.ville}, Bénin`, knowsLanguage: 'fr',
  founder: [{ '@type': 'Person', name: 'Brice Ahouansou' }, { '@type': 'Person', name: 'Yéman Ahouansou' }],
});
const noeudSite = () => ({ '@type': 'WebSite', '@id': `${SITE}#site`, name: COMMUN.nom, url: SITE, inLanguage: 'fr', publisher: { '@id': `${SITE}#maison` } });
const filAriane = (etapes) => ({
  '@type': 'BreadcrumbList',
  itemListElement: etapes.map(([nom, chemin], i) => ({ '@type': 'ListItem', position: i + 1, name: nom, item: `${SITE}${chemin.replace(/^\//, '')}` })),
});
const jsonld = (noeuds) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': noeuds })}</script>`;

/* ── Le gabarit ──────────────────────────────────────────────────────── */
function page({ chemin, titre, description, corps, noeuds, image: og, classeBody = '' }) {
  const canon = `${SITE}${chemin.replace(/^\//, '')}`;
  const nav = COMMUN.nav.map((l) => `<a href="${attr(lien(l.vers))}">${echappe(l.texte)}</a>`).join('\n      ');
  const colonnes = COMMUN.pied.colonnes.map((c) => `<div><h4>${echappe(c.titre)}</h4><ul>${c.liens.map((l) => `<li>${bouton(l, '')}</li>`).join('')}</ul></div>`).join('\n    ');
  const legal = COMMUN.pied.legal.map((l) => `<a href="${attr(lien(l.vers))}">${echappe(l.texte)}</a>`).join(' · ');
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1E2150" />
    <link rel="icon" type="image/png" href="/assets/monograms/mono-indigo.png" />
    <title>${echappe(titre)}</title>
    <meta name="description" content="${attr(description)}" />
    <link rel="canonical" href="${canon}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${attr(COMMUN.nom)}" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:title" content="${attr(titre)}" />
    <meta property="og:description" content="${attr(description)}" />
    <meta property="og:url" content="${canon}" />
    <meta property="og:image" content="${SITE}assets/photos/site/${attr(og || 'hero.jpg')}" />
    <meta name="twitter:card" content="summary_large_image" />
    ${jsonld(noeuds)}
  </head>
  <body data-surface="revelateur"${classeBody ? ` class="${classeBody}"` : ''}>
    ${ICONES}
    <header class="barre">
      <div class="conteneur">
        <a class="logo" href="${BASE}" aria-label="${attr(COMMUN.nom)}, accueil"><img src="/assets/photos/site/mono-indigo.png" alt="MND" width="240" height="198"></a>
        <nav class="nav" aria-label="Navigation">
      ${nav}
        </nav>
        <a class="btn btn--plein" href="${lien('/reserver/')}">Prendre rendez-vous</a>
      </div>
    </header>
    <main>
${corps}
    </main>
    <footer>
      <div class="conteneur">
        <div>
          <a class="logo" href="${BASE}" aria-label="${attr(COMMUN.nom)}"><img src="/assets/photos/site/mono-ivoire.png" alt="MND" width="240" height="198"></a>
          <p style="margin-top:14px; max-width:32ch">${echappe(COMMUN.pied.phrase)}</p>
        </div>
    ${colonnes}
        <div class="pied-bas">
          <span class="devise">${echappe(DEVISE_COMPLETE)}</span>
          <span>${legal}</span>
        </div>
      </div>
    </footer>
    <script type="module" src="/src/apps/revelateur/main.ts"></script>
  </body>
</html>
`;
}

/* ── Les sections libres ─────────────────────────────────────────────── */
/* LES QUATRE PORTES, CHACUNE SA TEINTE — 17 septembre 2026. « Sur les icônes
   mets différentes couleurs du pictogramme de la maison, le cuivre,
   l'indigo » (Yéman). Les quatre cartes portaient le même monogramme ivoire
   sur le même bandeau indigo.

   LE BANDEAU SUIT LE PICTOGRAMME, il ne le précède pas : un monogramme
   indigo sur un bandeau indigo ne se verrait pas. Chaque teinte va donc avec
   le fond qui la fait lire, et les quatre alternent clair et sombre, ce qui
   donne son rythme à la rangée. L'obsidienne n'y est pas : règle de marque,
   l'indigo pour les surfaces sombres.

   La teinte suit le RANG de la carte. Réordonner les portes réordonne les
   couleurs, et c'est sans conséquence : elles ne portent aucun sens, elles
   distinguent. */
const TEINTES = [
  { classe: 'or', mono: 'mono-or.png' },          // sur bandeau indigo
  { classe: 'cuivre', mono: 'mono-copper.png' },  // sur bandeau crème
  { classe: 'ivoire', mono: 'mono-ivoire.png' },  // sur bandeau cuivre
  { classe: 'indigo', mono: 'mono-indigo.png' },  // sur bandeau crème claire
];

function rendSection(s) {
  const tete = (s.sur || s.titre) ? `<div class="tete">${s.sur ? `<p class="sur">${echappe(s.sur)}</p>` : ''}${s.titre ? `<h2>${echappe(s.titre)}</h2>` : ''}</div>` : '';
  switch (s.type) {
    case 'texte':
      return `<section class="serre"><div class="conteneur">${tete}${s.image ? `<div class="fondateurs"><div class="conteneur" style="padding:0">${image(s.image)}<div class="corps">${s.corps}</div></div></div>` : `<div class="corps">${s.corps}</div>`}</div></section>`;
    case 'grille': {
      if (s.style === 'portes') {
        /* La même bande de cartes qu'à l'accueil : la photo et le nom court
           viennent de la page de service que chaque item désigne. */
        const cartes = s.items.map((it) => {
          const p = PAGES.find((x) => x.chemin === it.vers);
          return `<a class="porte" href="${attr(lien(it.vers))}" data-mesure="parcours_choisi" data-parcours="${attr(p?.besoin ?? 'inconnu')}">
          ${p?.image ? image(p.image) : `<div class="tuile">${echappe(p?.court ?? it.titre)}<small>Photo de la séance à venir</small></div>`}
          <div class="porte-corps"><h3>${echappe(it.titre)}</h3><p>${echappe(it.texte)}</p><span class="suite">${echappe(it.suite ?? p?.court ?? 'Découvrir')} <svg><use href="#i-fleche"/></svg></span></div>
        </a>`;
        }).join('\n        ');
        return `<section class="serre"><div class="conteneur">${tete}<div class="portes">${cartes}</div></div></section>`;
      }
      if (s.style === 'cartes') {
        const cartes = s.items.map((it, i) => {
          const t = TEINTES[i % TEINTES.length];
          const corps = `<div class="carte-porte__tete"><span class="carte-porte__rang">${String(i + 1).padStart(2, '0')}</span><img src="/assets/photos/site/${t.mono}" alt="" width="240" height="198"><b>${echappe(it.titre)}</b></div><div class="carte-porte__corps"><p>${echappe(it.texte)}</p>${it.vers ? `<span class="suite">${echappe(it.suite ?? 'Découvrir')} <svg><use href="#i-fleche"/></svg></span>` : '<span class="suite suite--muette">Réservé à la Maison</span>'}</div>`;
          const classe = `carte-porte carte-porte--${t.classe}`;
          return it.vers ? `<a class="${classe}" href="${attr(lien(it.vers))}">${corps}</a>` : `<div class="${classe}">${corps}</div>`;
        }).join('\n        ');
        return `<section class="serre"><div class="conteneur">${tete}<div class="cartes">${cartes}</div></div></section>`;
      }
      return `<section class="serre"><div class="conteneur">${tete}<div class="grille">${s.items.map((it) => it.vers
        ? `<a class="grille-item" href="${attr(lien(it.vers))}"><b>${echappe(it.titre)}</b><p>${echappe(it.texte)}</p></a>`
        : `<div class="grille-item"><b>${echappe(it.titre)}</b><p>${echappe(it.texte)}</p></div>`).join('')}</div></div></section>`;
    }
    case 'confiance': {
      const c = ACCUEIL.confiance;
      return `<section class="confiance sombre"><div class="conteneur">
        <div><p class="sur">${echappe(c.sur)}</p><p class="citation" style="margin-top:12px">${echappe(c.citation)}</p></div>
        <div class="gages">${c.gages.map((g) => `<div class="gage"><b>${echappe(g.titre)}</b><p>${echappe(g.ligne)}</p></div>`).join('')}</div>
      </div></section>`;
    }
    case 'pas':
      return `<section class="serre"><div class="conteneur">${tete}<ol class="pas${s.liste ? ' pas--liste' : ''}">${s.items.map(([t, l]) => `<li><div><b>${echappe(t)}</b><span>${echappe(l)}</span></div></li>`).join('')}</ol></div></section>`;
    case 'faq':
      return `<section class="serre"><div class="conteneur">${tete}<div class="faq">${s.items.map(([q, r], i) => `<details${i === 0 ? ' open' : ''}><summary>${echappe(q)}</summary><p>${echappe(r)}</p></details>`).join('')}</div></div></section>`;
    case 'citation':
      return `<section class="serre"><div class="conteneur"><p class="citation citation--claire">${echappe(s.texte)}</p>${s.qui ? `<p class="legende" style="margin-top:10px">${echappe(s.qui)}</p>` : ''}</div></section>`;
    case 'appel':
      return `<section class="appel"><div class="conteneur"><div><h2>${echappe(s.titre)}</h2>${s.ligne ? `<p class="ligne" style="margin-top:8px">${echappe(s.ligne)}</p>` : ''}</div><div class="rangee">${s.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--fort' : 'btn')).join('')}</div></div></section>`;
    default:
      return '';
  }
}

/* ── L'emplacement d'un îlot, avec son repli statique ────────────────── */
/* CE QUI SE RÉSERVE EN LIGNE — 17 septembre 2026. Une création et une
   réparation passent par une consultation, un entretien et des soins se
   prennent tels quels : les quatre mènent au calendrier. Un enfant commence
   par un échange avec ses parents, une formation est une candidature : ces
   deux-là mènent au rappel.

   MND KIDS A REJOINT LA LISTE le 17 septembre : « la consultation de MND Kids
   c'est Conseil et diagnostic » (Yéman). L'échange avec les parents reste le
   premier geste, il se prend simplement au calendrier. */
const RESERVABLES = new Set(['creation', 'reparation', 'entretien', 'enfant']);
const versLaReservation = (besoin) => `${lien('/reserver/')}?besoin=${besoin ?? 'inconnu'}`;

function ilot(nom, p) {
  if (nom === 'triage') {
    const repli = PAGES.filter((x) => x.besoin && x.chemin !== p.chemin).slice(0, 5)
      .map((x) => `<li><a href="${attr(lien(x.chemin))}">${echappe(x.h1)}</a></li>`).join('');
    return `<section class="serre"><div class="conteneur"><div data-ilot="triage"><p class="ligne">Trois questions, et la bonne porte.</p><ul class="corps" style="margin-top:12px">${repli}</ul></div></div></section>`;
  }
  if (nom === 'demande' || nom === 'reserver') {
    const f = COMMUN.formulaire;
    const titre = nom === 'reserver' ? 'Choisissez votre place.' : echappe(f.titre);
    const ligne = nom === 'reserver'
      ? 'Le geste, le jour, l\u2019heure. Votre numéro pour confirmer, et rien de plus.'
      : echappe(f.ligne);
    return `<section class="reserver serre"><div class="conteneur">
      <div><div class="tete"><p class="sur">Réserver</p><h2>${titre}</h2><p class="ligne">${ligne}</p></div>
        <div data-ilot="${nom}" data-genre="rdv"><p class="corps">Le calendrier se charge. Vous pouvez aussi nous écrire sur WhatsApp.</p><p style="margin-top:12px">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div>
      </div>
      <aside class="ensuite">
        <div><p class="sur">Ce qui se passe ensuite</p><ol>${f.suite.map(([t, l]) => `<li><div><b>${echappe(t)}</b><p>${echappe(l)}</p></div></li>`).join('')}</ol></div>
        <div data-ilot="contact"></div>
        <p class="compte">Aucun compte à créer, rien à payer aujourd’hui.</p>
      </aside>
    </div></section>`;
  }
  if (nom === 'contact') {
    return `<section class="serre"><div class="conteneur"><div data-ilot="contact" style="max-width:560px"><p class="corps">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div></div></section>`;
  }
  return '';
}

/* ── Une page de service ─────────────────────────────────────────────── */
function rendService(p) {
  const reservable = RESERVABLES.has(p.besoin ?? '');
  const cta = p.cta
    ? (reservable
      ? `<a class="btn btn--plein" href="${attr(versLaReservation(p.besoin))}" data-mesure="parcours_choisi" data-parcours="${attr(p.besoin ?? 'inconnu')}">${echappe(p.cta.texte)}</a>`
      /* LA DESTINATION DU CTA L'EMPORTE — 18 septembre 2026. `bouton()` a
         toujours su suivre n'importe quelle adresse, `soeur:` comprise ;
         c'est ICI qu'on l'écrasait en codant WhatsApp en dur. Sans `vers`,
         la coalescence retombe mot pour mot sur l'ancien comportement.
         ⚠ La branche du dessus, celle des pages RÉSERVABLES, ne passe pas
         par `bouton()` et ignorerait un `cta.vers`. Si l'on rend un jour la
         formation réservable, son lien vers l'Académie disparaîtrait sans
         bruit : il faudra alors le porter là aussi. */
      : bouton({ texte: p.cta.texte, vers: p.cta.vers ?? `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--plein'))
    : '';
  /* Le second geste : écrire à la Maison, toujours possible, jamais le premier. */
  const secondaire = bouton({ texte: 'Écrire sur WhatsApp', vers: `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--lien');
  const visuel = p.image ? image(p.image, '', ' fetchpriority="high"').replace(' loading="lazy"', '') : `<div class="tuile">${echappe(p.court)}<small>Photo de la séance à venir</small></div>`;
  const pas = p.pas ? `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">${echappe(p.pas.sur)}</p><h2>${echappe(p.pas.titre)}</h2></div><ol class="pas${p.pas.liste ? ' pas--liste' : ''}">${p.pas.items.map(([t, l]) => `<li><div><b>${echappe(t)}</b><span>${echappe(l)}</span></div></li>`).join('')}</ol></div></section>` : '';
  const geste = p.geste ? `<section class="serre"><div class="conteneur"><div class="geste"><span>${p.geste}</span>${p.temps ? '<div class="temps"><span>Purifier</span><span>Nourrir</span><span>Sceller</span><span>Couronner</span></div>' : ''}</div></div></section>` : '';
  const rassure = p.rassure ? `<section class="serre"><div class="conteneur"><div class="rassure"><p>${echappe(p.rassure)}</p><div class="colonne">${cta}${p.cta?.note ? `<span class="legende">${echappe(p.cta.note)}</span>` : ''}</div></div></div></section>` : '';
  const faq = p.faq?.length ? `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">Vos questions</p></div><div class="faq">${p.faq.map(([q, r], i) => `<details${i === 0 ? ' open' : ''}><summary>${echappe(q)}</summary><p>${echappe(r)}</p></details>`).join('')}</div></div></section>` : '';
  const galerie = `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">À la Maison</p></div><div class="galerie">
    <figure>${image('brice.jpg', 'Brice Ahouansou')}<figcaption>Brice, maître loctician.</figcaption></figure>
    <figure>${image('yeman.jpg', 'Yéman Ahouansou')}<figcaption>Yéman vous accueille.</figcaption></figure>
    <figure>${image('regard.jpg')}<figcaption>Une couronne établie, suivie à la Maison.</figcaption></figure>
  </div></div></section>`;
  const sections = (p.sections ?? []).map(rendSection).join('\n');
  const appel = `<section class="appel"><div class="conteneur"><div><h2>${echappe(p.h1)}</h2>${p.ligne ? `<p class="ligne" style="margin-top:8px">${echappe(p.cta?.note ?? '')}</p>` : ''}</div><div class="rangee">${cta}${reservable ? secondaire : ''}</div></div></section>`;
  const mobile = p.cta ? `<div class="barre-mobile">${cta}<a class="btn" href="${attr(versLaReservation(p.besoin))}">${reservable ? 'Autre heure' : 'Me faire rappeler'}</a></div>` : '';
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li><a href="${BASE}#portes">Services</a></li><li>·</li><li>${echappe(p.court)}</li></ol></nav>
      <section class="page-hero"><div class="conteneur">
        <div>${p.sur ? `<p class="sur">${echappe(p.sur)}</p>` : ''}<h1>${echappe(p.h1)}</h1>${p.ligne ? `<p class="ligne">${echappe(p.ligne)}</p>` : ''}
          ${p.cta ? `<div class="rangee" style="margin-top:22px">${cta}${reservable ? secondaire : `<a class="btn btn--lien" href="${attr(versLaReservation(p.besoin))}">Me faire rappeler</a>`}</div>` : ''}
          ${p.cta?.note ? `<p class="legende" style="margin-top:10px">${echappe(p.cta.note)}</p>` : ''}
        </div>
        <div>${visuel}</div>
      </div></section>
${geste}
${pas}
${rassure}
${sections}
${faq}
${galerie}
${appel}
${mobile}`;
}

/* ── Une page libre ──────────────────────────────────────────────────── */
function rendLibre(p, supplement = '') {
  const sections = (p.sections ?? []).map(rendSection).join('\n');
  const ilotHtml = p.ilot ? ilot(p.ilot, p) : '';
  const visuel = p.image ? `<div>${image(p.image)}</div>` : '';
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li>${echappe(p.court)}</li></ol></nav>
      <section class="page-hero${visuel ? '' : ' page-hero--simple'}"><div class="conteneur">
        <div>${p.sur ? `<p class="sur">${echappe(p.sur)}</p>` : ''}<h1>${echappe(p.h1)}</h1>${p.ligne ? `<p class="ligne">${echappe(p.ligne)}</p>` : ''}
          ${p.cta ? `<div class="rangee" style="margin-top:22px">${bouton({ texte: p.cta.texte, vers: `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--plein')}</div>` : ''}
        </div>${visuel}
      </div></section>
${p.ilot === 'triage' ? ilotHtml : ''}
${sections}
${p.ilot && p.ilot !== 'triage' ? ilotHtml : ''}
${supplement}`;
}

/* ── L'accueil ───────────────────────────────────────────────────────── */
function rendAccueil(articles) {
  const a = ACCUEIL;
  const cartes = a.portes.cartes.map((c) => {
    const p = PAGES.find((x) => x.chemin === c.vers);
    return `<a class="porte" href="${attr(lien(c.vers))}" data-mesure="parcours_choisi" data-parcours="${attr(p?.besoin ?? 'inconnu')}">
          ${c.image ? image(c.image) : `<div class="tuile">${echappe(c.titre.length > 18 ? p?.court ?? c.titre : c.titre)}<small>Photo de la séance à venir</small></div>`}
          <div class="porte-corps"><h3>${echappe(c.titre)}</h3><p>${echappe(c.ligne)}</p><span class="suite">${echappe(c.suite)} <svg><use href="#i-fleche"/></svg></span></div>
        </a>`;
  }).join('\n        ');
  const journal = articles.slice(0, 3).map((art, i) => `<a class="article" href="${attr(lien(`/journal/${art.slug}/`))}"><img src="/assets/photos/site/journal-${(i % 3) + 1}.jpg" alt="" loading="lazy" width="960" height="600"><h3>${echappe(art.titre)}</h3><p>${echappe(art.description)}</p></a>`).join('\n        ');
  return `
      <section class="hero sombre"><div class="conteneur">
        <div>
          <p class="devise">${echappe(a.devise.fon)}<small>${echappe(a.devise.sens)}</small></p>
          <h1>${echappe(a.h1)}</h1>
          <p class="ligne">${echappe(a.ligne)}</p>
          <div class="rangee">${a.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--plein' : 'btn')).join('')}</div>
          <p class="legende" style="margin-top:14px">${echappe(a.regle)}</p>
        </div>
        <figure class="hero-image"><img src="/assets/photos/site/hero.jpg" alt="Une couronne de locks relevée, de profil" width="960" height="1200" fetchpriority="high"></figure>
      </div></section>

      <section id="portes"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.portes.sur)}</p><h2>${echappe(a.portes.titre)}</h2></div>
        <div class="portes">
        ${cartes}
        </div>
        <div class="repli"><p>${echappe(a.portes.repli)}</p>${bouton(a.portes.repliBouton, 'btn btn--fort')}</div>
      </div></section>

      <section class="confiance sombre"><div class="conteneur">
        <div><p class="sur">${echappe(a.confiance.sur)}</p><p class="citation" style="margin-top:12px">${echappe(a.confiance.citation)}</p></div>
        <div class="gages">${a.confiance.gages.map((g) => `<div class="gage"><b>${echappe(g.titre)}</b><p>${echappe(g.ligne)}</p></div>`).join('')}</div>
      </div></section>

      <section class="avis" id="avis"><div data-ilot="avis"><div class="conteneur"><div><p class="sur">Avis Google</p><h2 style="margin-top:10px">Ce que disent nos clientes</h2><p class="legende" style="margin-top:12px">Les avis de la Maison se lisent sur sa fiche Google.</p></div></div></div></section>

      <section class="fondateurs" id="maison"><div class="conteneur">
        ${image(a.fondateurs.image, 'Brice et Yéman Ahouansou')}
        <div><p class="sur">${echappe(a.fondateurs.sur)}</p><h2 style="margin-top:10px">${echappe(a.fondateurs.titre)}</h2><p class="ligne" style="margin-top:12px">${echappe(a.fondateurs.ligne)}</p>
          <p class="message">${echappe(a.fondateurs.message)}</p>
          <div class="trois">${a.fondateurs.trois.map((t) => `<b>${echappe(t)}</b>`).join('')}</div>
        </div>
      </div></section>

      <section class="journal" id="journal" style="background:var(--fond-2); border-block:1px solid var(--filet)"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.journal.sur)}</p><h2>${echappe(a.journal.titre)}</h2></div>
        <div class="articles">
        ${journal}
        </div>
        <p style="margin-top:18px"><a class="btn btn--lien" href="${lien('/journal/')}">Tous les articles</a></p>
      </div></section>

      <section class="appel"><div class="conteneur">
        <div><h2>${echappe(a.appel.titre)}</h2><p class="ligne" style="margin-top:8px">${echappe(a.appel.ligne)}</p></div>
        <div class="rangee">${a.appel.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--fort' : 'btn')).join('')}</div>
      </div></section>`;
}

/* ── Le Journal, depuis les fichiers Markdown ────────────────────────── */
const PARCOURS_DU_JOURNAL = {
  'premiere-couronne': { chemin: '/premiere-couronne/', besoin: 'creation' },
  reparation: { chemin: '/reparation-locks/', besoin: 'reparation' },
  entretien: { chemin: '/entretien-locks/', besoin: 'entretien' },
  'mnd-kids': { chemin: '/mnd-kids/', besoin: 'enfant' },
  formations: { chemin: '/formations/', besoin: 'formation' },
};

function litArticle(fichier) {
  const brut = readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  const m = brut.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const tete = {};
  let cle = null;
  for (const ligne of m[1].split('\n')) {
    const kv = ligne.match(/^(\w+):\s*(.*)$/);
    if (kv) { cle = kv[1]; tete[cle] = kv[2].replace(/^"(.*)"$/, '$1').trim(); if (tete[cle] === '') tete[cle] = []; continue; }
    const item = ligne.match(/^\s*-\s+(.*)$/);
    if (item && cle && Array.isArray(tete[cle])) tete[cle].push(item[1].trim());
  }
  return { ...tete, corps: m[2].trim() };
}

const enLigne = (t) => echappe(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function markdownEnHtml(corps) {
  const lignes = corps.split('\n');
  const out = [];
  let para = [];
  let liste = null;
  let enMaison = false;
  const videParagraphe = () => { if (para.length) { out.push(`<p>${enLigne(para.join(' '))}</p>`); para = []; } };
  const videListe = () => { if (liste) { out.push(`<ul>${liste.map((l) => `<li>${enLigne(l)}</li>`).join('')}</ul>`); liste = null; } };
  const dernier = lignes.filter((l) => l.trim()).at(-1)?.trim() ?? '';
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i];
    if (l.startsWith('# ')) continue; // le H1 vient du titre
    if (l.trim() === dernier && i === lignes.length - 1) break; // l'appel à l'action, rendu à part
    if (l.startsWith('## ')) {
      videParagraphe(); videListe();
      const titre = l.slice(3).trim();
      if (enMaison) { out.push('</div>'); enMaison = false; }
      if (/^Ce que la Maison en dit/i.test(titre)) { out.push('<div class="maison">'); enMaison = true; }
      out.push(`<h2>${enLigne(titre)}</h2>`);
      continue;
    }
    if (/^\s*-\s+/.test(l)) { videParagraphe(); liste = liste ?? []; liste.push(l.replace(/^\s*-\s+/, '')); continue; }
    if (l.trim() === '') { videParagraphe(); videListe(); continue; }
    para.push(l.trim());
  }
  videParagraphe(); videListe();
  if (enMaison) out.push('</div>');
  return { html: out.join('\n'), appel: dernier };
}

function litLeJournal() {
  if (!existsSync(JOURNAL_MD)) return [];
  return readdirSync(JOURNAL_MD).filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => litArticle(path.join(JOURNAL_MD, f))).filter(Boolean);
}

function rendArticle(art) {
  const { html, appel } = markdownEnHtml(art.corps);
  const p = PARCOURS_DU_JOURNAL[art.parcours] ?? PARCOURS_DU_JOURNAL['premiere-couronne'];
  /* ⚠ LA DESTINATION EST CODÉE EN DUR ICI — 18 septembre 2026. Ce bouton
     part toujours sur WhatsApp, avec le message du besoin. Aujourd'hui aucun
     des dix articles du Journal ne vise le parcours « formations », donc le
     cas ne se présente pas ; le jour où l'un le visera, son bouton « Et
     maintenant » enverra sur WhatsApp alors que la page Formations, elle,
     conduit désormais à l'Académie. Il faudra alors lire la destination de
     la page visée au lieu de la reconstruire. */
  const cta = bouton({ texte: appel || 'Trouver mon parcours', vers: `whatsapp:${p.besoin}` }, 'btn btn--plein');
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li><a href="${lien('/journal/')}">Journal</a></li><li>·</li><li>${echappe(art.titre)}</li></ol></nav>
      <section class="page-hero page-hero--simple"><div class="conteneur"><div><p class="sur">Le Journal MND</p><h1>${echappe(art.titre)}</h1><p class="ligne">${echappe(art.description)}</p></div></div></section>
      <section class="serre"><div class="conteneur"><div class="prose">${html}</div></div></section>
      <section class="appel"><div class="conteneur"><div><h2>Et maintenant</h2><p class="ligne" style="margin-top:8px">Le parcours qui correspond à cet article vous attend.</p></div><div class="rangee">${cta}<a class="btn" href="${attr(lien(p.chemin))}">Voir le parcours</a></div></div></section>`;
}

/* ── Les pages légales, sobres et vraies ─────────────────────────────── */
const LEGALES = [
  { chemin: '/mentions-legales/', court: 'Mentions légales', titre: 'Mentions légales · Maison MND', description: 'Lisez qui édite ce site, qui l’héberge et comment joindre la Maison MND à Cotonou.', h1: 'Mentions légales', corps: `<p><b>Éditeur.</b> ${echappe(COMMUN.nom)}, ${echappe(COMMUN.ville)}, Bénin. Les informations d’immatriculation sont à renseigner par la Maison.</p><p><b>Direction de la publication.</b> Yéman Ahouansou.</p><p><b>Hébergement.</b> GitHub Pages (GitHub, Inc.).</p><p><b>Nous joindre.</b> Par WhatsApp, depuis n’importe quelle page du site, ou en laissant vos coordonnées.</p><p><b>Photographies.</b> Les images de ce site appartiennent à la Maison MND ou lui ont été confiées avec l’accord des personnes qui y figurent.</p>` },
  { chemin: '/confidentialite/', court: 'Confidentialité', titre: 'Politique de confidentialité · Maison MND', description: 'Découvrez ce que la Maison MND garde de vos coordonnées, pourquoi, combien de temps, et comment demander leur effacement.', h1: 'Vos données, et rien d’autre', corps: `<p><b>Ce que nous recevons.</b> Quand vous laissez vos coordonnées, nous recevons votre prénom, votre numéro, parfois votre e-mail, ce dont vous avez besoin et le mot que vous nous laissez.</p><p><b>Pourquoi.</b> Pour vous rappeler et prendre soin de votre couronne. Rien d’autre : pas de revente, pas de liste partagée.</p><p><b>Qui les lit.</b> Le personnel de la Maison, seul, depuis son outil interne.</p><p><b>Combien de temps.</b> Le temps de vous répondre, puis, si vous devenez cliente, le temps de votre suivi. Vous pouvez demander l’effacement à tout moment, par WhatsApp.</p><p><b>La mesure d’audience.</b> Elle compte les pages vues et les parcours choisis, sans nom ni numéro.</p>` },
  { chemin: '/conditions/', court: 'Conditions', titre: 'Conditions de réservation · Maison MND', description: 'Comprenez comment se prend, se confirme et se déplace un rendez-vous à la Maison MND, et ce qu’engage un devis.', h1: 'Conditions de réservation', corps: `<p><b>La consultation d’abord.</b> Une création ou une réparation commence par une consultation. Un entretien se réserve directement.</p><p><b>Le devis.</b> Rien ne commence sans une proposition écrite que vous avez acceptée. Les prix sont donnés au cas par cas.</p><p><b>La confirmation.</b> Votre place est confirmée par la Maison, sur WhatsApp ou par téléphone. Certains rendez-vous demandent un acompte, indiqué avant.</p><p><b>Déplacer ou annuler.</b> Prévenez-nous dès que possible ; nous déplaçons votre rendez-vous. Les délais précis vous sont indiqués à la confirmation.</p>` },
];

/* ── On écrit ────────────────────────────────────────────────────────── */
rmSync(SORTIE, { recursive: true, force: true });
const ecrit = (chemin, html) => {
  const dossier = path.join(SORTIE, chemin.replace(/^\//, ''));
  mkdirSync(dossier, { recursive: true });
  writeFileSync(path.join(dossier, 'index.html'), html);
};

const articles = litLeJournal();
const pagesEcrites = [];

ecrit('/', page({
  chemin: '/', titre: ACCUEIL.titre, description: ACCUEIL.description, corps: rendAccueil(articles),
  noeuds: [noeudMaison(), noeudSite(), filAriane([['Accueil', '/']])],
}));
pagesEcrites.push('/');

for (const p of PAGES) {
  const estService = !!(p.cta || p.pas);
  let corps;
  if (p.chemin === '/journal/') {
    const liste = articles.map((art, i) => `<a class="article" href="${attr(lien(`/journal/${art.slug}/`))}"><img src="/assets/photos/site/journal-${(i % 3) + 1}.jpg" alt="" loading="lazy" width="960" height="600"><h3>${echappe(art.titre)}</h3><p>${echappe(art.description)}</p></a>`).join('\n        ');
    corps = rendLibre(p, `<section class="serre"><div class="conteneur"><div class="articles">${liste}</div></div></section>`);
  } else corps = estService ? rendService(p) : rendLibre(p);
  const noeuds = [noeudSite(), filAriane([['Accueil', '/'], [p.court, p.chemin]])];
  if (p.jsonld === 'maison') noeuds.unshift(noeudMaison());
  if (p.jsonld === 'service') noeuds.push({ '@type': 'Service', name: p.h1, description: p.description, provider: { '@id': `${SITE}#maison` }, areaServed: `${COMMUN.ville}, Bénin`, url: `${SITE}${p.chemin.replace(/^\//, '')}` });
  if (p.jsonld === 'course') noeuds.push({ '@type': 'Course', name: p.h1, description: p.description, provider: { '@type': 'Organization', name: COMMUN.nom, '@id': `${SITE}#maison` } });
  const faqItems = p.jsonld === 'faq' ? (p.sections ?? []).filter((s) => s.type === 'faq').flatMap((s) => s.items) : [];
  if (faqItems.length) noeuds.push({ '@type': 'FAQPage', mainEntity: faqItems.map(([q, r]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: r } })) });
  ecrit(p.chemin, page({ chemin: p.chemin, titre: p.titre, description: p.description, corps, noeuds, image: p.image, classeBody: p.cta ? 'a-barre-mobile' : '' }));
  pagesEcrites.push(p.chemin);
}

for (const art of articles) {
  const chemin = `/journal/${art.slug}/`;
  ecrit(chemin, page({
    chemin, titre: `${art.titre} · Maison MND`.slice(0, 60), description: art.description, corps: rendArticle(art),
    noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Journal', '/journal/'], [art.titre, chemin]]), {
      '@type': 'Article', headline: art.titre, description: art.description, inLanguage: 'fr',
      author: { '@type': 'Organization', name: COMMUN.nom }, publisher: { '@id': `${SITE}#maison` },
      mainEntityOfPage: `${SITE}${chemin.replace(/^\//, '')}`, keywords: (art.motsCles ?? []).join(', '),
    }],
  }));
  pagesEcrites.push(chemin);
}

for (const l of LEGALES) {
  ecrit(l.chemin, page({
    chemin: l.chemin, titre: l.titre, description: l.description,
    corps: `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li>${echappe(l.court)}</li></ol></nav>
      <section class="page-hero page-hero--simple"><div class="conteneur"><div><h1>${echappe(l.h1)}</h1></div></div></section>
      <section class="serre"><div class="conteneur"><div class="corps">${l.corps}</div></div></section>`,
    noeuds: [noeudSite(), filAriane([['Accueil', '/'], [l.court, l.chemin]])],
  }));
  pagesEcrites.push(l.chemin);
}

/* La page 404 n'est qu'une page d'erreur : jamais un routeur. */
writeFileSync(path.join(SORTIE, '404.html'), page({
  chemin: '/404.html', titre: 'Page introuvable · Maison MND', description: 'Cette page n’existe pas ou plus. Retrouvez votre parcours depuis l’accueil de la Maison MND.',
  corps: `<section class="page-hero page-hero--simple"><div class="conteneur"><div><p class="sur">Page introuvable</p><h1>Cette page n’existe pas.</h1><p class="ligne">Reprenez depuis l’accueil, ou trouvez votre parcours en trois questions.</p><div class="rangee" style="margin-top:22px"><a class="btn btn--plein" href="${BASE}">Retour à l’accueil</a><a class="btn" href="${lien('/mon-parcours/')}">Trouver mon parcours</a></div></div></div></section>`,
  noeuds: [noeudSite()],
}).replace('<link rel="canonical"', '<meta name="robots" content="noindex" /><link rel="canonical"'));

writeFileSync(path.join(SORTIE, 'pages.json'), JSON.stringify(pagesEcrites, null, 2));
console.log(`Site révélateur : ${pagesEcrites.length} pages écrites dans revelateur/ (base ${BASE}).`);
