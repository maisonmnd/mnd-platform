import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/* LA LUMIERE ET LA FIN, EPROUVEES (8 octobre 2026).

   « Il n'y a pas de transition entre les pages de maisonmnd ; on ne sait pas
   quand une page se termine ; regarde leafandflower.com » (Yeman). Le cahier
   du 8 octobre a pose une toile par page (le jour), un soir en sable cuivre
   sur le dernier ecran, l'appel comme derniere lumiere, le pied seule nuit
   profonde, un fondu entre les pages et un eclaircissement des tetes de
   section au defilement. Chaque regle ci-dessous est une PROMESSE faite a la
   proprietaire, pas une lecture du code : l'attente est ecrite ici.

   `node scripts/verifie-la-lumiere.mjs`           eprouve le dist et les sources
   `node scripts/verifie-la-lumiere.mjs --prouve`  rejoue chaque regle sur une
   copie ou sa panne est injectee : elle DOIT crier, sinon le harnais crie.
   Sortie ASCII : OK / RATE. */

const DIST = 'dist-sites/revelateur';
const SOURCES = ['src/apps/revelateur/revelateur.css', 'scripts/genere-revelateur.mjs', 'src/apps/revelateur/main.ts', 'src/apps/revelateur/tons.ts', 'src/apps/revelateur/contenu.ts'];

type Entrees = { feuille: string; pages: Map<string, string>; gen: string; mainTs: string; tonsTs: string; ilots?: Record<string, number> };
type Regle = { nom: string; eprouve: (e: Entrees) => string[]; pannes: { nom: string; mute: (e: Entrees) => Entrees }[] };

let ko = 0;
const dit = (nom: string, ecarts: string[]) => {
  if (ecarts.length) { ko += 1; console.log(`RATE  ${nom}`); for (const x of ecarts.slice(0, 8)) console.log(`      - ${x}`); }
  else console.log(`OK    ${nom}`);
};
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const copie = (e: Entrees): Entrees => ({ ...e, pages: new Map(e.pages) });
const page = (e: Entrees, chemin: string) => e.pages.get(chemin) ?? '';

/* ── Les entrees ─────────────────────────────────────────────────────────── */
function lisLesEntrees(): Entrees {
  const pages = new Map<string, string>();
  const marche = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) marche(p);
      else if (n.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(n)) {
        const rel = '/' + path.relative(DIST, p).replace(/\\/g, '/').replace(/index\.html$/, '');
        pages.set(rel, readFileSync(p, 'utf8'));
      }
    }
  };
  marche(DIST);
  const ilotsFichier = path.join('scratchpad', 'lumiere', 'ilots.json');
  return {
    feuille: readFileSync('src/apps/revelateur/revelateur.css', 'utf8'),
    pages,
    gen: readFileSync('scripts/genere-revelateur.mjs', 'utf8'),
    mainTs: readFileSync('src/apps/revelateur/main.ts', 'utf8'),
    tonsTs: readFileSync('src/apps/revelateur/tons.ts', 'utf8'),
    ilots: existsSync(ilotsFichier) ? JSON.parse(readFileSync(ilotsFichier, 'utf8')) : undefined,
  };
}

/* ── Les couleurs ────────────────────────────────────────────────────────── */
type Rgb = [number, number, number];
const hex = (h: string): Rgb => { const m = /^#([0-9a-f]{6})$/i.exec(h.trim()); if (!m) throw new Error(`pas un hex : ${h}`); const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]: Rgb) => { const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contraste = (a: Rgb, b: Rgb) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const compose = (dessus: Rgb, alpha: number, fond: Rgb): Rgb => [0, 1, 2].map((i) => Math.round(dessus[i] * alpha + fond[i] * (1 - alpha))) as Rgb;
const jeton = (feuille: string, nom: string): string => { const m = new RegExp(`${nom.replace(/[-]/g, '\\-')}:\\s*([^;]+);`).exec(feuille); if (!m) throw new Error(`jeton absent : ${nom}`); return m[1].trim(); };

/* ── Les enfants de <main> ───────────────────────────────────────────────── */
type Enfant = { balise: string; classe: string; id: string };
function enfantsDeMain(html: string): Enfant[] {
  const debut = html.indexOf('<main id="contenu"');
  const fin = html.indexOf('</main>', debut);
  if (debut < 0 || fin < 0) return [];
  const corps = html.slice(html.indexOf('>', debut) + 1, fin).replace(/<script[\s\S]*?<\/script>/g, '<script></script>');
  const enfants: Enfant[] = [];
  let prof = 0;
  const re = /<(\/?)(section|nav|article|div|script|ol|ul|p|figure|header|aside)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corps))) {
    const ferme = m[1] === '/';
    if (ferme) { prof -= 1; continue; }
    if (prof === 0) {
      const attrs = m[3];
      enfants.push({ balise: m[2], classe: (/class="([^"]*)"/.exec(attrs)?.[1] ?? ''), id: (/id="([^"]*)"/.exec(attrs)?.[1] ?? '') });
    }
    if (!/\/>$/.test(m[0])) prof += 1;
  }
  return enfants;
}

/* La fin de l'element dont la balise ouvrante <div commence a `debut` :
   l'indice juste apres son </div>, ou la fin du document. */
function finDeLElement(html: string, debut: number): number {
  const re = /<(\/?)div\b/g;
  re.lastIndex = debut;
  let prof = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] === '/') { prof -= 1; if (prof === 0) return m.index + 6; }
    else prof += 1;
  }
  return html.length;
}

/* ── Les regles ──────────────────────────────────────────────────────────── */
const TONS = { maison: '#F6F1E7', parcours: '#E7D7C2', offres: '#EDEEF4' } as const;
const PALETTE_CLAIRE = ['#F6F1E7', '#EEE6D6', '#FFFDF9', '#FAF1E9', '#E7D7C2', '#EDEEF4'];
const JETONS_SOMBRES = ['var(--sombre)', 'var(--sombre-2)', '#1E2150', '#15173A', '#272B6C', '#23265E', 'rgba(30, 33, 80', 'rgba(21, 23, 58'];
const JETONS_CLAIRS = ['var(--fond)', 'var(--fond-2)', 'var(--carte)', 'var(--accent-clair)', 'var(--jour)', 'var(--chaude)', 'var(--sable-cuivre)', 'var(--indigo-pale)', '#F6F1E7', '#EEE6D6', '#FFFDF9', '#FAF1E9', '#E7D7C2', '#EDEEF4'];
const LIGNE_JS = `<script>if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js')</script>`;
const BLOC = 'LA LUMIÈRE ET LA FIN';

const regles: Regle[] = [
  {
    nom: 'le ton se dit une fois et partout : data-ton, theme-color, feuille, tons.ts',
    eprouve: (e) => {
      const ecarts: string[] = [];
      for (const [chemin, html] of e.pages) {
        const ton = /<body [^>]*data-ton="([a-z]+)"/.exec(html)?.[1] ?? '';
        if (!(ton in TONS)) { ecarts.push(`${chemin} : data-ton « ${ton} » hors table`); continue; }
        const attendu = /<body [^>]*class="accueil-plein"/.test(html) ? '#1E2150' : TONS[ton as keyof typeof TONS];
        const couleur = /<meta name="theme-color" content="([^"]*)"/.exec(html)?.[1];
        if (couleur !== attendu) ecarts.push(`${chemin} : theme-color ${couleur} pour le ton ${ton} (attendu ${attendu})`);
        if (html.includes('class="barre-mobile">') && ton !== 'parcours') ecarts.push(`${chemin} : barre mobile sans la famille parcours`);
        if (['/les-offres/', '/offrir/', '/parrainage/'].includes(chemin) && ton !== 'offres') ecarts.push(`${chemin} : attendu offres`);
        if (['/contact/', '/journal/', '/notre-histoire/', '/galerie/'].includes(chemin) && ton !== 'maison') ecarts.push(`${chemin} : attendu maison`);
      }
      if (!/body\[data-ton="parcours"\]\s*\{[^}]*--jour:[^}]*--jour-barre:/.test(e.feuille)) ecarts.push('feuille : pas de regle body[data-ton="parcours"] avec --jour et --jour-barre');
      if (!/body\[data-ton="offres"\]\s*\{[^}]*--jour:[^}]*--jour-barre:/.test(e.feuille)) ecarts.push('feuille : pas de regle body[data-ton="offres"]');
      if (/body\[data-ton="maison"\]/.test(e.feuille)) ecarts.push('feuille : body[data-ton="maison"] ecrit (c est le defaut de :root)');
      for (const h of e.tonsTs.match(/#[0-9A-Fa-f]{6}/g) ?? []) if (!PALETTE_CLAIRE.includes(h.toUpperCase())) ecarts.push(`tons.ts : ${h} hors palette`);
      if (/theme-color" content="#/.test(e.gen)) ecarts.push('generateur : un theme-color en dur');
      return ecarts;
    },
    pannes: [
      { nom: 'theme-color indigo en dur', mute: (e) => { const c = copie(e); c.pages.set('/soins-locks/', page(e, '/soins-locks/').replace(/theme-color" content="[^"]*"/, 'theme-color" content="#1E2150"')); return c; } },
      { nom: 'un ton hors table', mute: (e) => ({ ...copie(e), tonsTs: e.tonsTs.replace('#EDEEF4', '#C9A24A') }) },
      { nom: 'la galerie en indigo', mute: (e) => { const c = copie(e); c.pages.set('/galerie/', page(e, '/galerie/').replace(/theme-color" content="[^"]*"/, 'theme-color" content="#1E2150"')); return c; } },
    ],
  },
  {
    nom: 'les tons restent lisibles : 4,5 pour le texte, 3 pour les grands titres, calcule depuis la feuille',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const f = e.feuille;
      const clairs: Record<string, Rgb> = { ivoire: hex(jeton(f, '--fond')), sable: hex(jeton(f, '--fond-2')), carte: hex(jeton(f, '--carte')), lin: hex(jeton(f, '--accent-clair')), argile: hex(jeton(f, '--sable-cuivre')), 'indigo pale': hex(jeton(f, '--indigo-pale')) };
      const texte = hex(jeton(f, '--texte')), doux = hex(jeton(f, '--texte-doux')), titre = hex(jeton(f, '--titre')), profond = hex(jeton(f, '--accent-profond'));
      for (const [nom, fond] of Object.entries(clairs)) {
        const t = [['texte', texte, 4.5], ['texte doux', doux, 4.5], ['cuivre profond', profond, 4.5], ['titre', titre, 3]] as const;
        for (const [quoi, c, mini] of t) { const r = contraste(c, fond); if (r < mini) ecarts.push(`${quoi} sur ${nom} : ${r.toFixed(2)} < ${mini}`); }
      }
      const sombres: Record<string, Rgb> = { indigo: hex(jeton(f, '--sombre')), 'indigo profond': hex(jeton(f, '--sombre-2')), halo: hex('#272B6C') };
      const ivoire = hex(jeton(f, '--fond')), cuivreClair = hex(jeton(f, '--accent-sombre'));
      for (const [nom, fond] of Object.entries(sombres)) {
        const t = [['ivoire', ivoire], ['ivoire .72', compose(ivoire, 0.72, fond)], ['cuivre clair', cuivreClair]] as const;
        for (const [quoi, c] of t) { const r = contraste(c, fond); if (r < 4.5) ecarts.push(`${quoi} sur ${nom} : ${r.toFixed(2)} < 4,5`); }
      }
      return ecarts;
    },
    pannes: [
      { nom: 'un sable cuivre trop chaud (#DCC8AC)', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('--sable-cuivre: #E7D7C2', '--sable-cuivre: #DCC8AC') }) },
      { nom: 'un texte doux eclairci', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('--texte-doux: #5E5750', '--texte-doux: #8A8278') }) },
    ],
  },
  {
    nom: 'aucun degrade ne traverse deux familles (jamais clair vers indigo)',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille).replace(/mask-image:[^;]+;/g, '');
      const re = /(linear|radial)-gradient\(([^;{}]*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sans))) {
        const arrets = m[2];
        if (JETONS_SOMBRES.some((j) => arrets.includes(j)) && JETONS_CLAIRS.some((j) => arrets.includes(j))) ecarts.push(`degrade mixte : ${m[0].slice(0, 90)}`);
      }
      return ecarts;
    },
    pannes: [{ nom: 'un fondu ivoire vers indigo', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\n.diag { background: linear-gradient(var(--fond), var(--sombre)); }\n' }) }],
  },
  {
    nom: 'les conditions de la toile : html sans fond, body sans ancre cassee, la toile unie au ton, vh puis svh',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      const re = /(^|\n)([^{}\n]+)\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sans))) {
        const sel = m[2].trim(), corps = m[3];
        if (/^(html|body|body\.[\w-]+|body\[data-ton="[a-z]+"\]|main)$/.test(sel) && /(^|;|\s)(position|transform|translate|filter|backdrop-filter|perspective|isolation|will-change|contain|opacity|z-index)\s*:/.test(corps)) ecarts.push(`${sel} : une propriete qui casserait l ancre des fixes`);
        if (sel === 'html' && /background/.test(corps)) ecarts.push('html porte un fond');
      }
      if (!/\nbody \{ background: var\(--jour\); min-height: 100vh; min-height: 100svh; \}/.test(sans)) ecarts.push('la toile de body n est pas ecrite comme promise (unie au ton, vh puis svh)');
      if (!/\nbody \{ margin: 0; background: var\(--fond\);/.test(sans)) ecarts.push('le repli « background: var(--fond) » de body a disparu');
      return ecarts;
    },
    pannes: [
      { nom: 'html avec un fond', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\nhtml { background: var(--fond); }\n' }) },
      { nom: 'body transforme', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\nbody { transform: translateZ(0); }\n' }) },
      { nom: 'sans hauteur minimale', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('body { background: var(--jour); min-height: 100vh; min-height: 100svh; }', 'body { background: var(--jour); }') }) },
    ],
  },
  {
    nom: 'la fin est une bande cuivre lisible, et toute page qui finit la porte',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      if (!/\n\.appel \{ border: 0; padding-block: var\(--air\); color: var\(--sombre-2\);\s*background: linear-gradient\(180deg, transparent 0, var\(--accent\) var\(--plume\), var\(--accent\) 100%\); \}/.test(sans)) ecarts.push('l appel n est pas la bande cuivre promise');
      if (!/\.appel h2 \{ color: #F6F1E7; \}/.test(sans)) ecarts.push('le titre de l appel n est pas ivoire');
      if (!/\.appel \.ligne, \.appel \.legende \{ color: var\(--sombre-2\); \}/.test(sans)) ecarts.push('le texte de l appel n est pas indigo profond');
      const cuivre = hex(jeton(e.feuille, '--accent'));
      const titre = hex(jeton(e.feuille, '--sombre-2')), ivoire = hex(jeton(e.feuille, '--fond'));
      if (contraste(titre, cuivre) < 4.5) ecarts.push(`indigo profond sur cuivre : ${contraste(titre, cuivre).toFixed(2)} < 4,5`);
      if (contraste(ivoire, cuivre) < 3) ecarts.push(`ivoire sur cuivre : ${contraste(ivoire, cuivre).toFixed(2)} < 3`);
      for (const [chemin, html] of e.pages) {
        if (chemin === '/m/' || chemin === '/404.html') { if (html.includes('class="appel"')) ecarts.push(`${chemin} : un appel sur une page hors transition`); continue; }
        const blocs = enfantsDeMain(html).filter((x) => x.balise === 'section');
        const dernier = blocs[blocs.length - 1];
        if (!dernier) { ecarts.push(`${chemin} : main sans section`); continue; }
        if (!/\b(appel|devise-bande|recit-fin)\b/.test(dernier.classe)) ecarts.push(`${chemin} : la page finit sans appel, sans devise et sans dernier chapitre (${dernier.classe})`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'l appel revenu au sable', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('background: linear-gradient(180deg, transparent 0, var(--accent) var(--plume), var(--accent) 100%); }', 'background: linear-gradient(180deg, transparent 0, var(--sable-cuivre) var(--plume), var(--sable-cuivre) 100%); }') }) },
      { nom: 'la galerie sans appel de fin', mute: (e) => { const c = copie(e); const g = page(e, '/galerie/'); const i = g.lastIndexOf('<section class="appel">'); c.pages.set('/galerie/', g.slice(0, i) + g.slice(g.indexOf('</section>', i) + 10)); return c; } },
      { nom: 'un appel sur /m/', mute: (e) => { const c = copie(e); c.pages.set('/m/', page(e, '/m/').replace('</main>', '<section class="appel"></section></main>')); return c; } },
    ],
  },
  {
    nom: 'la plume reste sous l air, terme a terme, et l air est l air des sections chaudes et de l appel',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const clamp = (nom: string) => { const m = new RegExp(`${nom}: clamp\\((\\d+)px, (\\d+)vw, (\\d+)px\\)`).exec(e.feuille); if (!m) { ecarts.push(`${nom} : pas un clamp(apx, bvw, cpx)`); return null; } return m.slice(1).map(Number); };
      const p = clamp('--plume'), a = clamp('--air');
      if (p && a) for (let i = 0; i < 3; i++) if (!(p[i] < a[i])) ecarts.push(`la plume depasse l air au terme ${i + 1} (${p[i]} vs ${a[i]})`);
      if (!/\.vt-offres, \.ingredients, \.univers, \.journal \{[^}]*padding-block: var\(--air\)/.test(e.feuille)) ecarts.push('les sections chaudes n ont pas padding-block: var(--air)');
      if (!/\n\.appel \{[^}]*padding-block: var\(--air\)/.test(e.feuille)) ecarts.push('l appel n a pas padding-block: var(--air)');
      return ecarts;
    },
    pannes: [
      { nom: 'une plume plus large que l air', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('--plume: clamp(40px, 6vw, 72px)', '--plume: clamp(40px, 6vw, 220px)') }) },
      { nom: 'un air plus bas que la plume', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('--air: clamp(56px, 8vw, 110px)', '--air: clamp(32px, 8vw, 110px)') }) },
      { nom: 'l appel sans air', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('.appel { border: 0; padding-block: var(--air);', '.appel { border: 0;') }) },
    ],
  },
  {
    nom: 'la coupe contre l indigo est franche, et les voisins des lisieres sont des sections',
    eprouve: (e) => {
      const ecarts: string[] = [];
      if (!e.feuille.includes(':is(section.sombre, .communaute:not(.communaute--claire)) + :is(.vt-offres, .ingredients, .univers, .journal) { --bord-haut: var(--chaude); }')) ecarts.push('la regle du haut franc manque');
      if (!e.feuille.includes(':is(.vt-offres, .ingredients, .univers, .journal):has(+ :not(section.sombre, .communaute:not(.communaute--claire))) { --bord-bas: transparent; }')) ecarts.push('la regle du bas adouci manque ou est collee a l autre');
      const accueil = page(e, '/');
      for (const cls of ['journal', 'vt-offres']) {
        const i = accueil.indexOf(`<section class="${cls}"`);
        if (i < 0) { ecarts.push(`accueil : pas de section ${cls}`); continue; }
        const avant = accueil.slice(0, i).trimEnd();
        if (!avant.endsWith('</section>')) ecarts.push(`accueil : ce qui precede .${cls} n est pas une section (${avant.slice(-30).replace(/\s+/g, ' ')})`);
      }
      if (/<section[^>]*style="background/.test(e.gen)) ecarts.push('generateur : une section porte un fond en ligne');
      const scripts = [...accueil.matchAll(/<script>[\s\S]*?<\/script>/g)];
      const rail = scripts.find((s) => s[0].includes('rail'));
      if (!rail || (rail.index ?? 0) < accueil.indexOf('id="journal"')) ecarts.push('accueil : le script de la communaute n est pas apres le journal');
      return ecarts;
    },
    pannes: [
      { nom: 'le script entre la communaute et le journal', mute: (e) => { const c = copie(e); const a = page(e, '/'); const s = /<script>[\s\S]*?<\/script>/g; const rail = [...a.matchAll(s)].find((m) => m[0].includes('rail'))!; const sans = a.replace(rail[0], ''); c.pages.set('/', sans.replace('<section class="journal"', rail[0] + '\n<section class="journal"')); return c; } },
      { nom: 'le journal avec un fond en ligne', mute: (e) => { const c = copie(e); c.pages.set('/', page(e, '/').replace('<section class="journal" id="journal">', '<section class="journal" id="journal" style="background:var(--fond-2)">')); return { ...c, gen: e.gen.replace('<section class="journal" id="journal">', '<section class="journal" id="journal" style="background:var(--fond-2)">') }; } },
    ],
  },
  {
    nom: 'le pied est la seule nuit profonde, et il se reconnait sans lire (filet cuivre, allover, signature)',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      const re = /(^|\n)([^{}\n]+)\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sans))) {
        const sel = m[2].trim(), corps = m[3];
        if (/:(hover|focus|active)/.test(sel)) continue;
        const plat = /(^|;|\s)background(-color)?:\s*(var\(--sombre-2\)|#15173A)\s*;/i.test(corps);
        if (plat && !['footer', '.devise-bande'].includes(sel)) ecarts.push(`${sel} : l indigo profond a plat hors du pied`);
      }
      if (!/\nfooter \{[^}]*border-top: 1px solid var\(--filet-cuivre\)/.test(sans)) ecarts.push('le pied n a pas son filet cuivre');
      if (!/footer::before \{[^}]*allover-aere-indigo-cuivre\.png[^}]*opacity: \.06/.test(sans)) ecarts.push('le pied n a pas l allover a .06');
      if (!/\.pied-signature \{[^}]*var\(--serif\)[^}]*var\(--accent-sombre\)/.test(sans)) ecarts.push('la signature n est pas en serif cuivre clair');
      if (!/\.accueil-plein footer \{ border-top: 0/.test(sans)) ecarts.push('le pied de l accueil garde son filet');
      if (!/\.devise-bande \{ background: var\(--sombre-2\); outline: 0/.test(sans)) ecarts.push('la devise-bande n est pas la tete du pied');
      if (!/\.recit-fin \{ background: linear-gradient\(180deg, var\(--sombre\) 0, var\(--sombre-2\) 100%\)/.test(sans)) ecarts.push('le dernier chapitre du recit ne se verse pas dans le pied');
      for (const [chemin, html] of e.pages) {
        const accueil = /<body [^>]*class="accueil-plein"/.test(html);
        const pied = html.slice(html.indexOf('<footer>'));
        const signature = pied.indexOf('<p class="pied-signature">mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là</p>');
        if (accueil) { if (signature >= 0) ecarts.push('accueil : deux devises en grand'); if (!html.includes('class="devise-bande sombre"')) ecarts.push('accueil : pas de devise-bande'); }
        else if (signature < 0 || signature > pied.indexOf('<h4>')) ecarts.push(`${chemin} : la signature manque avant les colonnes du pied`);
        if (/pied-bas[\s\S]{0,200}<span class="devise">/.test(pied)) ecarts.push(`${chemin} : la petite devise traine encore dans pied-bas`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'le journal en indigo profond', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\n.journal { background: var(--sombre-2); }\n' }) },
      { nom: 'la signature retiree d une page', mute: (e) => { const c = copie(e); c.pages.set('/soins-locks/', page(e, '/soins-locks/').replace('<p class="pied-signature">mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là</p>', '')); return c; } },
      { nom: 'la signature aussi sur l accueil', mute: (e) => { const c = copie(e); c.pages.set('/', page(e, '/').replace('<footer>\n      <div class="conteneur">', '<footer>\n      <div class="conteneur"><p class="pied-signature">mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là</p>')); return c; } },
    ],
  },
  {
    nom: 'un chapitre n est jamais le dernier bloc avant le pied, et deux chapitres ne se suivent pas',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const chapitre = (x: Enfant) => x.balise === 'section' && (/\bsombre\b/.test(x.classe) || (/\bcommunaute\b/.test(x.classe) && !/communaute--claire/.test(x.classe))) && !/devise-bande|recit-fin/.test(x.classe);
      const chaude = (x: Enfant) => x.balise === 'section' && /\b(vt-offres|ingredients|univers|journal)\b/.test(x.classe);
      for (const [chemin, html] of e.pages) {
        const blocs = enfantsDeMain(html).filter((x) => x.balise !== 'script' && !(x.balise === 'div' && /barre-mobile/.test(x.classe)));
        if (!blocs.length) { ecarts.push(`${chemin} : main sans enfants lisibles`); continue; }
        if (chapitre(blocs[blocs.length - 1])) ecarts.push(`${chemin} : un chapitre indigo colle au pied (${blocs[blocs.length - 1].classe})`);
        for (let i = 1; i < blocs.length; i++) {
          if (chapitre(blocs[i - 1]) && chapitre(blocs[i])) ecarts.push(`${chemin} : deux chapitres se suivent (${blocs[i - 1].classe} / ${blocs[i].classe})`);
          if (chaude(blocs[i - 1]) && chaude(blocs[i])) ecarts.push(`${chemin} : deux sections chaudes collees (${blocs[i - 1].classe} / ${blocs[i].classe})`);
        }
        const appels = blocs.map((b, i) => [b, i] as const).filter(([b]) => b.balise === 'section' && /\bappel\b/.test(b.classe));
        for (const [, i] of appels) if (i < blocs.length - 1 && !blocs.slice(i + 1).some((b) => b.balise === 'section')) ecarts.push(`${chemin} : un appel au milieu que rien ne suit`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'le journal tout de suite apres les ingredients', mute: (e) => { const c = copie(e); const a = page(e, '/'); const i = a.indexOf('<section class="communaute"'); const j = a.indexOf('</section>', i) + '</section>'.length; c.pages.set('/', a.slice(0, i) + a.slice(j)); return c; } },
      { nom: 'un chapitre colle au pied', mute: (e) => { const c = copie(e); const a = page(e, '/soins-locks/'); c.pages.set('/soins-locks/', a.replace('</main>', '<section class="confiance sombre"></section>\n</main>')); return c; } },
    ],
  },
  {
    nom: 'le voile n existe que sous html.js, se rallume au focus, et a un filet de secours (1 a 2 s)',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      const re = /(^|\n)([^{}\n]+)\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sans))) {
        const sel = m[2].trim(), corps = m[3];
        if (/opacity: 0\b|translateY\(/.test(corps) && /data-voile/.test(sel) && !/^html\.js /.test(sel)) ecarts.push(`${sel} : cache sans JavaScript`);
        if (/opacity: 0\b/.test(corps) && /^(section|main > section)/.test(sel)) ecarts.push(`${sel} : une section cachee`);
      }
      if (!/html\.js \[data-voile\]\.vu \{ opacity: 1/.test(sans)) ecarts.push('pas de regle .vu');
      if (!/html\.js \[data-voile\]\.vu--net, html\.js \[data-voile\]:focus-within \{[^}]*transition: none/.test(sans)) ecarts.push('pas de rallumage net au focus');
      const secours = /animation: voile-secours 1ms linear ([\d.]+)s forwards/.exec(sans);
      if (!secours || +secours[1] < 1 || +secours[1] > 2) ecarts.push('le filet de secours manque ou n est pas entre 1 et 2 s');
      if (!/@keyframes voile-secours/.test(sans)) ecarts.push('pas de @keyframes voile-secours');
      const reduce = sans.slice(sans.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
      if (!/html\.js \[data-voile\] \{ opacity: 1 !important; transform: none !important/.test(reduce)) ecarts.push('sous reduce, le voile n est pas remis a 1');
      if (!/@media print, \(forced-colors: active\) \{[^}]*html\.js \[data-voile\] \{ opacity: 1 !important/.test(sans)) ecarts.push('a l impression, le voile n est pas remis a 1');
      return ecarts;
    },
    pannes: [
      { nom: 'le voile sans html.js', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('html.js [data-voile] { opacity: 0;', '[data-voile] { opacity: 0;') }) },
      { nom: 'sans rallumage au focus', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('html.js [data-voile].vu--net, html.js [data-voile]:focus-within {', 'html.js [data-voile].vu--net {') }) },
      { nom: 'un secours a 6 s', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('voile-secours 1ms linear 1.6s forwards', 'voile-secours 1ms linear 6s forwards') }) },
      { nom: 'une section cachee', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\nmain > section { opacity: 0; }\n' }) },
    ],
  },
  {
    nom: 'la classe js vient de <head>, sous garde, une fois par page, jamais de main.ts',
    eprouve: (e) => {
      const ecarts: string[] = [];
      for (const [chemin, html] of e.pages) {
        const n = html.split(LIGNE_JS).length - 1;
        if (n !== 1) ecarts.push(`${chemin} : la ligne js ${n} fois`);
        else if (html.indexOf(LIGNE_JS) > html.indexOf('</head>')) ecarts.push(`${chemin} : la ligne js apres </head>`);
        if (!/<body[^>]*>\s*<a class="evitement"/.test(html)) ecarts.push(`${chemin} : le lien d evitement n est plus colle a <body>`);
      }
      const m = sansCommentaires(e.mainTs);
      if (m.includes("classList.add('js')")) ecarts.push('main.ts pose la classe js (flash apres la premiere peinture)');
      if (!m.includes("classList.remove('js')")) ecarts.push('main.ts ne retire pas js sans IntersectionObserver');
      return ecarts;
    },
    pannes: [
      { nom: 'la garde retiree', mute: (e) => { const c = copie(e); c.pages.set('/', page(e, '/').replace(LIGNE_JS, "<script>document.documentElement.classList.add('js')</script>")); return c; } },
      { nom: 'la ligne apres <body>', mute: (e) => { const c = copie(e); c.pages.set('/', page(e, '/').replace(LIGNE_JS, '').replace('<a class="evitement"', LIGNE_JS + '<a class="evitement"')); return c; } },
      { nom: 'main.ts pose js', mute: (e) => ({ ...copie(e), mainTs: e.mainTs + "\ndocument.documentElement.classList.add('js');\n" }) },
    ],
  },
  {
    nom: 'data-voile jamais au premier ecran, jamais dans un ilot, jamais sur la galerie',
    eprouve: (e) => {
      const ecarts: string[] = [];
      for (const [chemin, html] of e.pages) {
        const premier = html.indexOf('data-voile');
        if (chemin === '/galerie/') { if (premier >= 0) ecarts.push('galerie : un voile'); continue; }
        if (premier < 0) continue;
        if (premier < html.indexOf('</section>')) ecarts.push(`${chemin} : le premier ecran est voile`);
        const re = /data-voile/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          const ilot = html.lastIndexOf('data-ilot="', m.index);
          if (ilot >= 0 && m.index < finDeLElement(html, html.lastIndexOf('<div', ilot))) ecarts.push(`${chemin} : un voile dans un ilot`);
        }
      }
      if ((page(e, '/').match(/data-voile/g) ?? []).length < 6) ecarts.push('accueil : moins de six tetes voilees');
      if (!e.gen.includes('function voile(') || !e.gen.includes('${voile(transition && !finitBien(corps) ? corps + appelDeFin() : corps, classeBody)}')) ecarts.push('generateur : page() ne passe pas par voile()');
      return ecarts;
    },
    pannes: [
      { nom: 'le premier ecran voile', mute: (e) => { const c = copie(e); c.pages.set('/soins-locks/', page(e, '/soins-locks/').replace('<section class="page-hero">', '<section class="page-hero" data-voile>')); return c; } },
      { nom: 'un voile dans l ilot des avis', mute: (e) => { const c = copie(e); c.pages.set('/', page(e, '/').replace('<div data-ilot="avis"><div class="conteneur"><div>', '<div data-ilot="avis"><div class="conteneur"><div data-voile>')); return c; } },
      { nom: 'la galerie voilee', mute: (e) => { const c = copie(e); c.pages.set('/galerie/', page(e, '/galerie/').replace('</main>', '<div data-voile></div></main>')); return c; } },
    ],
  },
  {
    nom: 'main.ts revele une fois, net si deja a l ecran, et ne re-cache jamais',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const m = sansCommentaires(e.mainTs);
      for (const attendu of ["'[data-voile]'", 'IntersectionObserver', 'unobserve', 'boundingClientRect.top < 0', "classList.add('vu', 'vu--net')", 'rootMargin', 'meta[name="theme-color"]', "'#F6F1E7'", "'#1E2150'"]) if (!m.includes(attendu)) ecarts.push(`main.ts sans ${attendu}`);
      if (m.includes("classList.remove('vu')")) ecarts.push('main.ts re-voile en remontant');
      if (m.includes("querySelectorAll('main > section')")) ecarts.push('main.ts voile des sections');
      return ecarts;
    },
    pannes: [
      { nom: 'un re-voilage', mute: (e) => ({ ...copie(e), mainTs: e.mainTs + "\ndocument.body.classList.remove('vu');\n" }) },
      { nom: 'sans revelation nette', mute: (e) => ({ ...copie(e), mainTs: e.mainTs.replace("classList.add('vu', 'vu--net')", "classList.add('vu')") }) },
    ],
  },
  {
    nom: 'l opt-in sous no-preference, les deux opt-out (/m/ et 404) apres la feuille, rien de nomme',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      const n = (sans.match(/@view-transition \{ navigation: auto; \}/g) ?? []).length;
      if (n !== 1) ecarts.push(`${n} opt-in au lieu d un`);
      if (!/@media \(prefers-reduced-motion: no-preference\) \{\s*@view-transition \{ navigation: auto; \}\s*\}/.test(sans)) ecarts.push('l opt-in n est pas sous no-preference');
      const reduce = sans.slice(sans.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
      if (!/::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/.test(reduce)) ecarts.push('sous reduce, les pseudo-elements ne sont pas coupes');
      if (/view-transition-name/.test(sans)) ecarts.push('quelque chose est nomme (premiere livraison : rien)');
      for (const [chemin, html] of e.pages) {
        const horsTransition = chemin === '/m/' || chemin === '/404.html';
        const i = html.indexOf('@view-transition{navigation:none}');
        const feuille = html.lastIndexOf('<link rel="stylesheet"');
        if (horsTransition) {
          if (i < 0) ecarts.push(`${chemin} : pas d opt-out`);
          else if (i < feuille) ecarts.push(`${chemin} : l opt-out est ecrit AVANT la feuille (il perdrait)`);
          if (!html.includes('skipTransition')) ecarts.push(`${chemin} : pas de skipTransition`);
          if (chemin === '/m/' && html.indexOf('skipTransition') > html.indexOf('location.replace(')) ecarts.push('/m/ : skipTransition apres location.replace');
        } else if (i >= 0 || html.includes('skipTransition')) ecarts.push(`${chemin} : un opt-out sur une page qui doit fondre`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'l opt-out dans <head>', mute: (e) => { const c = copie(e); const h = page(e, '/m/'); const ligne = /<style>@view-transition\{navigation:none\}<\/style>/.exec(h)![0]; c.pages.set('/m/', h.replace(ligne, '').replace('<meta name="viewport"', ligne + '<meta name="viewport"')); return c; } },
      { nom: 'la ligne pageswap retiree de /m/', mute: (e) => { const c = copie(e); c.pages.set('/m/', page(e, '/m/').replace(/if\('onpageswap' in window\)addEventListener\('pageswap',function\(e\)\{if\(e\.viewTransition\)e\.viewTransition\.skipTransition\(\)\}\);/, '')); return c; } },
      { nom: 'l opt-out sur toutes les pages', mute: (e) => { const c = copie(e); c.pages.set('/soins-locks/', page(e, '/soins-locks/').replace('</body>', '<style>@view-transition{navigation:none}</style></body>')); return c; } },
      { nom: 'une barre nommee', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\n.barre { view-transition-name: barre; }\n' }) },
      { nom: 'un second opt-in', mute: (e) => ({ ...copie(e), feuille: e.feuille + '\n@view-transition { navigation: auto; }\n' }) },
    ],
  },
  {
    nom: 'la barre de l accueil est pleine des l ancre, par la feuille et par la ligne',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const sans = sansCommentaires(e.feuille);
      const n = (sans.match(/\.accueil-plein:not\(:has\(:target\)\) \.barre:not\(\.solide\)/g) ?? []).length;
      if (n < 7) ecarts.push(`${n} regles prefixees au lieu de 7`);
      if (/\.accueil-plein \.barre:not\(\.solide\)/.test(sans)) ecarts.push('une regle .accueil-plein .barre:not(.solide) sans le prefixe');
      for (const [chemin, html] of e.pages) {
        const accueil = /<body [^>]*class="accueil-plein"/.test(html);
        const i = html.indexOf('classList.add("solide")');
        if (accueil) {
          if (i < 0 || i < html.indexOf('</header>') || i > html.indexOf('<main id="contenu"')) ecarts.push('accueil : la ligne solide n est pas entre </header> et <main>');
          if (!/<body [^>]*class="accueil-plein">\s*<a class="evitement"/.test(html)) ecarts.push('accueil : le lien d evitement ne suit plus <body>');
        } else if (i >= 0) ecarts.push(`${chemin} : la ligne solide hors de l accueil`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'le prefixe oublie sur le .tel', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('.accueil-plein:not(:has(:target)) .barre:not(.solide) .tel {', '.accueil-plein .barre:not(.solide) .tel {') }) },
      { nom: 'la ligne avant le lien d evitement', mute: (e) => { const c = copie(e); const a = page(e, '/'); const ligne = /<script>\(function\(\)\{var b=document\.querySelector\("\.barre"\);[^<]*<\/script>/.exec(a)![0]; c.pages.set('/', a.replace(ligne, '').replace('<a class="evitement"', ligne + '<a class="evitement"')); return c; } },
    ],
  },
  {
    nom: 'les ilots gardent une hauteur : au moins 240 px, jamais plus haute que le montage mesure',
    eprouve: (e) => {
      const ecarts: string[] = [];
      for (const sel of ['[data-ilot="reserver"]', '[data-ilot="offres"]', '[data-ilot="offrir"]', '[data-ilot="joindre"]', '.diag__quiz']) {
        const m = new RegExp(`${sel.replace(/[[\]"]/g, (c) => '\\' + c).replace('.', '\\.')} \\{[^}]*min-height: (\\d+)px`).exec(e.feuille);
        if (!m) { ecarts.push(`${sel} : pas de min-height`); continue; }
        const h = +m[1];
        if (h < 240) ecarts.push(`${sel} : ${h}px < 240`);
        const mesure = e.ilots?.[sel];
        if (mesure !== undefined && h > mesure) ecarts.push(`${sel} : ${h}px plus haut que le montage mesure (${mesure}px)`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'reserver sans min-height', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('[data-ilot="reserver"] { min-height: 420px; }', '') }) },
      { nom: 'plus haut que la mesure', mute: (e) => ({ ...copie(e), ilots: { '[data-ilot="reserver"]': 300 } }) },
    ],
  },
  {
    nom: 'les surfaces peintes restent celles de la Maison, et les textes aussi',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const i = e.feuille.indexOf(BLOC);
      if (i < 0) return ['le bloc « LA LUMIERE ET LA FIN » manque'];
      const bloc = sansCommentaires(e.feuille.slice(e.feuille.lastIndexOf('/*', i)));
      const permis = new Set(['#F6F1E7', '#EEE6D6', '#FFFDF9', '#FAF1E9', '#E7D7C2', '#EDEEF4', '#1E2150', '#15173A', '#272B6C', '#B97A4A', '#D6A06F', '#7C4C2C', '#2A2722', '#5E5750']);
      for (const h of bloc.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? []) if (!permis.has(h.toUpperCase())) ecarts.push(`${h} hors palette dans le bloc`);
      for (const r of bloc.match(/rgba\([^)]*\)/g) ?? []) if (!/^rgba\((246, 241, 231|30, 33, 80|214, 160, 111|21, 23, 58|250, 241, 233|238, 230, 214|231, 215, 194|237, 238, 244)/.test(r)) ecarts.push(`${r} : un rgba hors palette`);
      const apres = e.feuille.slice(e.feuille.indexOf('LA COMMUNAUTÉ MND'));
      if (/radial-gradient\(circle/.test(apres)) ecarts.push('un radial-gradient(circle apres la communaute (le harnais du parrainage le refuse)');
      if (/:hover[^{]*\{[^}]*transform: translate/.test(bloc)) ecarts.push('un survol qui deplace');
      for (const motif of bloc.match(/\/assets\/motifs\/([\w-]+\.png)/g) ?? []) if (!existsSync(path.join('public', motif))) ecarts.push(`motif absent : ${motif}`);
      const neuf = sansCommentaires(e.gen.slice(e.gen.indexOf('function voile('), e.gen.indexOf('/* ── Les sections libres'))).replace(/<!--[\s\S]*?-->/g, '');
      if (!e.gen.includes('const appelDeFin = () => `<section class="appel"><div class="conteneur"><div><h2>')) ecarts.push('l appel de fin ne porte pas la chaine que les harnais lisent');
      if (neuf.includes('—') || /\bsalon\b/i.test(neuf)) ecarts.push('le gabarit neuf porte un tiret cadratin ou « salon »');
      if (!e.gen.includes('<p class="pied-signature">${echappe(DEVISE_COMPLETE)}</p>')) ecarts.push('la signature n est pas DEVISE_COMPLETE');
      return ecarts;
    },
    pannes: [
      { nom: 'du noir dans le masque', mute: (e) => ({ ...copie(e), feuille: e.feuille.replace('mask-image: linear-gradient(90deg, transparent, var(--sombre)', 'mask-image: linear-gradient(90deg, transparent, #000') }) },
      { nom: 'une signature tapee a la main', mute: (e) => ({ ...copie(e), gen: e.gen.replace('<p class="pied-signature">${echappe(DEVISE_COMPLETE)}</p>', '<p class="pied-signature">mi nyɔ́ ɖɛkpɛ — votre beauté est déjà là</p>') }) },
    ],
  },
  {
    nom: 'les chaines que les autres harnais lisent sont intactes',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const accueil = page(e, '/');
      if (!accueil.includes('<section class="hero-plein">')) ecarts.push('accueil : <section class="hero-plein"> modifie');
      if (!accueil.includes('<main id="contenu" tabindex="-1">')) ecarts.push('accueil : <main id="contenu" tabindex="-1"> modifie');
      if (accueil.includes('class="confiance sombre"')) ecarts.push('accueil : la confiance y est revenue');
      for (const [chemin, html] of e.pages) {
        const parcours = html.includes('class="barre-mobile">');
        const n = (html.match(/<section class="appel"><div class="conteneur"><div><h2>/g) ?? []).length;
        if (parcours && n !== 1) ecarts.push(`${chemin} : ${n} appels au lieu d un`);
        if (/<section class="appel [^"]+">/.test(html)) ecarts.push(`${chemin} : la chaine figee de l appel modifiee`);
      }
      if (!/\.hero-plein \{[^}]*margin-top: calc\(var\(--barre-h, 72px\) \* -1\)/.test(e.feuille)) ecarts.push('feuille : .hero-plein n est plus en une regle avec son margin-top');
      return ecarts;
    },
    pannes: [{ nom: 'une classe de plus sur l appel', mute: (e) => { const c = copie(e); c.pages.set('/soins-locks/', page(e, '/soins-locks/').replace('<section class="appel">', '<section class="appel fin">')); return c; } }],
  },
];

/* ── La fraicheur, puis les regles, puis la preuve ──────────────────────── */
if (!existsSync(path.join(DIST, 'version.json'))) { console.log(`RATE  construis d abord : node scripts/build-sites.mjs (${DIST} absent)`); process.exit(1); }
const dist = statSync(path.join(DIST, 'version.json')).mtimeMs;
const perimes = SOURCES.filter((s) => existsSync(s) && statSync(s).mtimeMs > dist);
if (perimes.length) { console.log(`RATE  le dist est plus vieux que ${perimes.join(', ')} : construis d abord (node scripts/build-sites.mjs)`); process.exit(1); }
console.log('OK    le dist est plus recent que ses sources');

const entrees = lisLesEntrees();
console.log(`OK    ${entrees.pages.size} pages lues dans ${DIST}`);
for (const r of regles) dit(r.nom, r.eprouve(entrees));

if (process.argv.includes('--prouve')) {
  console.log('\n-- la preuve : chaque panne doit faire crier sa regle --');
  for (const r of regles) {
    for (const p of r.pannes) {
      let crie = false;
      try { crie = r.eprouve(p.mute(entrees)).length > 0; } catch { crie = true; }
      if (crie) console.log(`OK    crie : ${p.nom}`);
      else { ko += 1; console.log(`RATE  muet devant « ${p.nom} » (${r.nom})`); }
    }
  }
}

console.log(ko === 0 ? '\nTout tient.' : `\n${ko} RATE.`);
if (ko) process.exit(1);
