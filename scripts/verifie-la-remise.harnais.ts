import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { courtDeLaPhrase, dateDite, jourACotonou, remiseDuJour, remisesAEcrire } from '../src/apps/revelateur/remise-pure';

/* LA REMISE QUI REVIENT, ÉPROUVÉE — 11 octobre 2026.
   `node scripts/verifie-la-remise.mjs [--prouve]`. Maquette validée
   (« construis », Yéman) : un bandeau en haut, une pastille sur le bord, une
   fenêtre à mi-page, un rappel avant le pied, seulement quand une offre
   datée court. LES ATTENTES VIENNENT DE LA PROMESSE, pas du code : les
   pages exclues, les dates et les mots sont écrits ici en toutes lettres.
   Avec --prouve, chaque règle est rejouée avec sa panne, et doit crier. */

const DIST = 'dist-sites/revelateur';
const EXCLUES = ['/reserver/', '/rappel/', '/conditions/', '/confidentialite/', '/mentions-legales/', '/plan-du-site/', '/les-offres/', '/m/', '/404.html'];
const SANS_FENETRE = ['/mon-parcours/', '/offrir/', '/parrainage/', '/testeuse/'];

type Entrees = { gen: string; remiseTs: string; pages: Map<string, string>; construitLe: string };
type Regle = { nom: string; eprouve: (e: Entrees) => string[]; pannes: { nom: string; mute: (e: Entrees) => Entrees }[] };

let ko = 0;
const dit = (nom: string, ecarts: string[]) => {
  if (ecarts.length) { ko += 1; console.log(`RATE  ${nom}`); for (const x of ecarts.slice(0, 8)) console.log(`      - ${x}`); }
  else console.log(`OK    ${nom}`);
};
const copie = (e: Entrees): Entrees => ({ ...e, pages: new Map(e.pages) });
const remisesDe = (html: string): string | null => /<script type="application\/json" id="remises"[^>]*>([^<]*)<\/script>/.exec(html)?.[1] ?? null;

function lisLesEntrees(): Entrees {
  const pages = new Map<string, string>();
  const marche = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'assets') marche(p); }
      else if (n.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(n)) {
        const rel = '/' + path.relative(DIST, p).replace(/\\/g, '/').replace(/index\.html$/, '');
        pages.set(rel, readFileSync(p, 'utf8'));
      }
    }
  };
  marche(DIST);
  return {
    gen: readFileSync('scripts/genere-revelateur.mjs', 'utf8'),
    remiseTs: readFileSync('src/apps/revelateur/remise.ts', 'utf8'),
    pages,
    construitLe: jourACotonou(statSync(path.join(DIST, 'index.html')).mtime),
  };
}

/* Joue la ligne en ligne du gabarit, telle qu'écrite, un jour donné. */
function joueLeBandeau(code: string, json: string, jour: string): string | null {
  const VraieDate = Date;
  const poses: { attrs: Record<string, string> }[] = [];
  const fauxElement = () => ({ attrs: {} as Record<string, string>, className: '', href: '', textContent: '', setAttribute(k: string, v: string) { this.attrs[k] = v; }, appendChild(x: unknown) { return x; } });
  const document = {
    currentScript: { parentNode: { insertBefore(x: { attrs: Record<string, string> }) { poses.push(x); } }, nextSibling: null },
    getElementById: (id: string) => (id === 'remises' ? { textContent: json } : null),
    createElement: fauxElement,
    createTextNode: (t: string) => ({ t }),
  };
  class DateDuJour extends VraieDate {
    constructor(...a: unknown[]) {
      if (a.length) super(...(a as [string])); else super(`${jour}T12:00:00+01:00`);
    }
  }
  new Function('document', 'Date', code)(document, DateDuJour);
  return poses[0]?.attrs['data-remise-bande'] ?? null;
}

/* Deux offres datées qui se suivent, une vitrine sans dates, une éteinte, une sans remise dite. */
const ESSAI = [
  { id: 'nov', title: 'Novembre', deal: '−10 %', sub: 'Sur les lavages, pour repartir net.', code: 'NOV10', parcours: 'entretien', active: true, du: '2026-11-01', au: '2026-11-30' },
  { id: 'oct', title: 'Octobre Rose', tag: 'Engagement', deal: '−15 %', sub: 'Sur les soins, et la Maison reverse une part à la lutte contre le cancer du sein.', code: 'ROSE15', bouton: 'Réserver mon soin', parcours: 'entretien', active: true, du: '2026-10-01', au: '2026-10-31' },
  { id: 'vitrine', title: 'Accueil', deal: 'Offert', sub: 'Toujours.', active: true, vitrine: true },
  { id: 'eteinte', title: 'Éteinte', deal: '−5 %', active: false, du: '2026-10-01', au: '2026-10-31' },
  { id: 'muette', title: 'Sans remise', deal: '', active: true, du: '2026-10-01', au: '2026-10-31' },
];
/* La promesse, jour par jour : bornes comprises, rien hors saison. */
const ATTENDU: [string, string | null][] = [
  ['2026-09-30', null], ['2026-10-01', 'oct'], ['2026-10-31', 'oct'], ['2026-11-01', 'nov'], ['2026-11-30', 'nov'], ['2026-12-01', null],
];

const regles: Regle[] = [
  {
    nom: 'le bandeau en ligne choisit, jour par jour, la remise promise (bornes comprises, rien hors saison)',
    eprouve: (e) => {
      const code = /const BANDEAU_EN_LIGNE = `([^`]*)`;/.exec(e.gen)?.[1];
      if (!code) return ['BANDEAU_EN_LIGNE introuvable dans le gabarit'];
      const json = JSON.stringify(remisesAEcrire(ESSAI));
      const ecarts: string[] = [];
      for (const [jour, voulu] of ATTENDU) {
        const pose = joueLeBandeau(code, json, jour);
        if (pose !== voulu) ecarts.push(`${jour} : le bandeau pose ${pose}, la promesse dit ${voulu}`);
        const regle = remiseDuJour(remisesAEcrire(ESSAI), jour)?.id ?? null;
        if (regle !== voulu) ecarts.push(`${jour} : la regle pure dit ${regle}, la promesse dit ${voulu}`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'la borne du debut exclue', mute: (e) => ({ ...e, gen: e.gen.replace('j>=o.du', 'j>o.du') }) },
      { nom: 'la fin oubliee', mute: (e) => ({ ...e, gen: e.gen.replace('&&(!o.au||j<=o.au)', '') }) },
    ],
  },
  {
    nom: 'rien ne revient sur la reservation, le rappel, les pages legales, les offres, le lien court, la page introuvable',
    eprouve: (e) => EXCLUES.filter((c) => e.pages.has(c) && remisesDe(e.pages.get(c)!) !== null).map((c) => `${c} porte des remises`),
    pannes: [
      { nom: 'des remises sur la reservation', mute: (e) => { const c = copie(e); c.pages.set('/reserver/', (c.pages.get('/reserver/') ?? '').replace('<header class="barre">', '<script type="application/json" id="remises" data-fenetre="oui">[]</script><header class="barre">')); return c; } },
    ],
  },
  {
    nom: 'quand une offre court, chaque autre page porte les memes remises, posees avant la barre, et la fenetre se retient sur les formulaires',
    eprouve: (e) => {
      const ecarts: string[] = [];
      const accueil = remisesDe(e.pages.get('/') ?? '');
      const autres = [...e.pages.keys()].filter((c) => !EXCLUES.includes(c));
      if (accueil === null) {
        /* Aucune offre ne court à la construction : aucune page n'en porte. */
        for (const c of autres) if (remisesDe(e.pages.get(c)!) !== null) ecarts.push(`${c} porte des remises alors que l accueil n en porte pas`);
        return ecarts;
      }
      for (const c of autres) {
        const h = e.pages.get(c)!;
        if (remisesDe(h) !== accueil) { ecarts.push(`${c} : remises absentes ou differentes de l accueil`); continue; }
        const i = h.indexOf('id="remises"'), ev = h.indexOf('class="evitement"'), barre = h.indexOf('<header class="barre">');
        if (!(ev >= 0 && ev < i && i < barre)) ecarts.push(`${c} : les remises ne sont pas entre le lien d evitement et la barre`);
        if (!/id="remises"[^>]*>[^<]*<\/script><script>\(function\(\)\{try\{var s=document\.currentScript/.test(h)) ecarts.push(`${c} : la ligne du bandeau ne suit pas les remises`);
        const fenetre = /id="remises" data-fenetre="(oui|non)"/.exec(h)?.[1];
        const voulue = SANS_FENETRE.includes(c) ? 'non' : 'oui';
        if (fenetre !== voulue) ecarts.push(`${c} : fenetre ${fenetre}, attendue ${voulue}`);
      }
      return ecarts;
    },
    pannes: [
      { nom: 'la fenetre d elle-meme sur la carte cadeau', mute: (e) => { const c = copie(e); c.pages.set('/offrir/', (c.pages.get('/offrir/') ?? '').replace('data-fenetre="non"', 'data-fenetre="oui"')); return c; } },
      { nom: 'la ligne du bandeau apres la barre', mute: (e) => { const c = copie(e); const h = c.pages.get('/soins-locks/') ?? ''; const m = /<script type="application\/json" id="remises"[\s\S]*?<\/script><script>[\s\S]*?<\/script>/.exec(h); if (m) c.pages.set('/soins-locks/', h.replace(m[0], '').replace('</header>', '</header>' + m[0])); return c; } },
    ],
  },
  {
    nom: 'une page ecrite un jour ne porte aucune offre deja finie ce jour-la',
    eprouve: (e) => {
      const json = remisesDe(e.pages.get('/') ?? '');
      if (!json) return [];
      return (JSON.parse(json) as { titre: string; au: string }[]).filter((r) => r.au && r.au < e.construitLe).map((r) => `${r.titre} finie le ${r.au}, page du ${e.construitLe}`);
    },
    pannes: [
      { nom: 'une offre de septembre restee dans la page', mute: (e) => { const c = copie(e); const h = c.pages.get('/') ?? ''; c.pages.set('/', h.replace(/(id="remises"[^>]*>)\[/, '$1[{"titre":"Rentree","au":"2026-09-30"},')); return c; } },
    ],
  },
  {
    nom: 'la fenetre est un vrai dialogue : nommee, fermable, une fois par visite, jamais sur un champ en cours',
    eprouve: (e) => {
      const s = e.remiseTs, ecarts: string[] = [];
      if (!/el\('dialog'/.test(s)) ecarts.push('pas de <dialog>');
      if (!/setAttribute\('aria-labelledby', 'remise-titre'\)/.test(s)) ecarts.push('le dialogue n est pas nomme par son titre');
      if (!/showModal\(\)/.test(s)) ecarts.push('pas de showModal (focus garde, Echap)');
      if (!/setAttribute\('aria-label', 'Fermer'\)/.test(s)) ecarts.push('le bouton de fermeture n a pas de nom');
      if (!/sessionStorage\.getItem\(DEJA_VUE\)/.test(s) || !/noteLaVisite\(r\)/.test(s)) ecarts.push('la fenetre ne se retient pas pour la visite');
      if (!/INPUT\|TEXTAREA\|SELECT/.test(s)) ecarts.push('la fenetre peut s ouvrir pendant qu on ecrit');
      if (!/fenetreAuto/.test(s)) ecarts.push('la fenetre ignore data-fenetre');
      return ecarts;
    },
    pannes: [
      { nom: 'le dialogue sans nom', mute: (e) => ({ ...e, remiseTs: e.remiseTs.replace("setAttribute('aria-labelledby', 'remise-titre')", "setAttribute('data-x', 'y')") }) },
      { nom: 'la fenetre a chaque page', mute: (e) => ({ ...e, remiseTs: e.remiseTs.replace('sessionStorage.getItem(DEJA_VUE)', 'null') }) },
    ],
  },
];

/* ── Les mots et les dates de la règle pure, contre la promesse ── */
const purs: [string, unknown, unknown][] = [
  ['une vitrine sans dates, une offre eteinte, une offre sans remise ne reviennent pas', remisesAEcrire(ESSAI).map((r) => r.id), ['oct', 'nov']],
  ['… et une offre finie avant le jour de construction reste dehors', remisesAEcrire(ESSAI, '2026-11-01').map((r) => r.id), ['nov']],
  ['la premiere proposition de la phrase fait le bandeau', courtDeLaPhrase('Sur les soins, et la Maison reverse une part.'), 'sur les soins'],
  ['… et une phrase trop longue ne le fait pas', courtDeLaPhrase('Sur les lavages rituels et les reprises de racines du mois entier pour tout le monde'), ''],
  ['la date se dit avec son annee', dateDite('2026-10-31'), '31 octobre 2026'],
  ['… et le premier du mois est le 1er', dateDite('2026-11-01'), '1er novembre 2026'],
  ['la porte d une remise d entretien porte le code jusqu a la reservation', remisesAEcrire(ESSAI).find((r) => r.id === 'oct')?.porte, '/reserver/?besoin=entretien&code=ROSE15'],
  ['le bouton est celui de l offre', remisesAEcrire(ESSAI).find((r) => r.id === 'oct')?.bouton, 'Réserver mon soin'],
];
for (const [nom, vu, voulu] of purs) dit(nom, JSON.stringify(vu) === JSON.stringify(voulu) ? [] : [`vu ${JSON.stringify(vu)}, promis ${JSON.stringify(voulu)}`]);

if (!existsSync(path.join(DIST, 'index.html'))) throw new Error('pas de site construit : node scripts/build-sites.mjs');
const entrees = lisLesEntrees();
console.log(`OK    ${entrees.pages.size} pages lues, construites le ${entrees.construitLe}`);
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
console.log(ko ? `\n${ko} RATE.` : '\nTout tient.');
process.exitCode = ko ? 1 : 0;
