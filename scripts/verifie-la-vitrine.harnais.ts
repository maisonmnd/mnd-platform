/* LA VITRINE REVISITÉE, ÉPROUVÉE — `node scripts/verifie-la-vitrine.mjs`.

   Ce harnais lit les PAGES GÉNÉRÉES (chaque index.html sous revelateur/,
   écrit par `node scripts/genere-revelateur.mjs`), pas le contenu : c'est ce que le
   navigateur reçoit qui fait foi. Quatre choses s'y attrapent qu'aucun œil
   ne voit : un lien wa.me sans numéro a l'air d'un lien ; « L'atelier MND »
   peut ressortir d'une réécriture de titre en pleine demande Meta pour
   « Maison MND » ; une bulle posée sur la page qui EST le geste couvrirait
   son bouton d'envoi ; et un rappel promis qui mène au calendrier. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACCUEIL, COMMUN } from '../src/apps/revelateur/contenu';
import { etatDeLOffre } from '../src/shared/offres-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Toutes les pages générées, par chemin (« /premiere-couronne/ »). */
const pages = new Map<string, string>();
const marche = (dossier: string, chemin: string) => {
  for (const e of readdirSync(dossier)) {
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) marche(p, `${chemin}${e}/`);
    else if (e === 'index.html') pages.set(chemin, readFileSync(p, 'utf8'));
  }
};
marche('revelateur', '/');
dit('les pages sont générées', true, pages.size >= 30);

/* ── AUCUNE PAGE NE DIT « L'ATELIER MND » ──────────────────────────── */
const atelier = [...pages].filter(([, h]) => /L[’']atelier MND/i.test(h)).map(([c]) => c);
dit('aucune page ne nomme « L’atelier MND »', [], atelier);

/* ── CHAQUE LIEN WHATSAPP PORTE UN NUMÉRO DÈS LA CONSTRUCTION ─────── */
const sansNumero = [...pages].flatMap(([c, h]) =>
  [...h.matchAll(/href="https:\/\/wa\.me\/(\d*)\?/g)].filter((m) => m[1].length < 8).map(() => c));
dit('chaque lien wa.me porte un numéro', [], [...new Set(sansNumero)]);
const numeroRegistre = COMMUN.editeur.telephone.replace(/\D/g, '');
dit('… celui du registre, jamais un chiffre en dur', true,
  [...pages.values()].every((h) => [...h.matchAll(/https:\/\/wa\.me\/(\d+)\?/g)].every((m) => m[1] === numeroRegistre)));

/* ── LA BULLE « NOUS JOINDRE » : partout, sauf sur les pages qui SONT le geste ── */
const sansBulle = ['/reserver/', '/contact/', '/rappel/'];
const manque = [...pages].filter(([c, h]) => !sansBulle.includes(c) && !h.includes('class="joindre"')).map(([c]) => c);
dit('la bulle est sur toutes les pages de lecture', [], manque);
const enTrop = sansBulle.filter((c) => pages.get(c)?.includes('class="joindre"'));
dit('… et jamais sur le calendrier, le contact ni le rappel', [], enTrop);
const accueil = pages.get('/') ?? '';
dit('la bulle appelle le numéro du registre', true, accueil.includes(`href="tel:${COMMUN.editeur.telephone.replace(/\s/g, '')}"`));
dit('… et n’est jamais ouverte d’avance', true, accueil.includes('id="joindre-volet" role="group" aria-labelledby="joindre-titre" hidden'));
dit('… sans tiret cadratin dans ses mots', false, (accueil.split('class="joindre"')[1] ?? '').split('</script>')[0].includes('—'));

/* ── LE PREMIER ÉCRAN DIT LE MÉTIER, ET TROIS PROMESSES SUIVENT ───── */
dit('le premier écran nomme les locks et Cotonou', true, /locks/i.test(ACCUEIL.metier) && /Cotonou/.test(ACCUEIL.metier));
/* « La phrase est beaucoup trop longue » (Yéman, 22 septembre 2026) : le titre
   tient en six mots, le paragraphe en deux phrases courtes. */
dit('… son titre tient en six mots', true, ACCUEIL.h1.trim().split(/\s+/).length <= 6);

/* ── LE PREMIER ÉCRAN PLEINE LARGEUR — 23 septembre 2026 ──────────────
   Trois pièges silencieux, nommés par l'autre session avant la construction :
   un menu qui n'existe que par script fait disparaître la navigation de la
   page la plus visitée ; une photo pleine largeur paresseuse ouvre l'accueil
   sur un trou ; un voile réglé à l'œil ne survit pas à la photo suivante. */
dit('l’accueil est en pleine largeur, l’entête posée dessus', true, /<body [^>]*class="accueil-plein"/.test(accueil) && accueil.includes('<section class="hero-plein">'));
dit('… la ligne du métier est une pastille', true, accueil.includes(`<p class="pastille metier">${ACCUEIL.metier}</p>`));
/* Sur téléphone elle descend sous les boutons, elle ne disparaît pas : c'est
   la seule ligne du premier écran qui dit ce que la Maison fait (arbitrage
   de Yéman, 23 septembre 2026). */
dit('… et la feuille ne la cache sur aucun écran', false, /\.pastille[^{]*\{[^}]*display:\s*none/.test(readFileSync('src/apps/revelateur/revelateur.css', 'utf8')));
/* Deux pièges de téléphone, nommés par l'autre session : une hauteur en svh
   sans repli en vh s'effondre sur les navigateurs d'avant 2022 (les Android
   anciens de Cotonou) ; et une ligne du métier sous 11 px est présente mais
   illisible, ce qui revient à la cacher. */
const feuilleSite = readFileSync('src/apps/revelateur/revelateur.css', 'utf8');
dit('toute hauteur en svh est précédée de son repli en vh, dans la même règle', [],
  [...feuilleSite.matchAll(/\{[^}]*\}/g)].map((m) => m[0]).filter((r) => /:\s*[^;]*\bsvh\b/.test(r) && !/min-height:\s*\d+vh;\s*min-height:\s*\d+svh/.test(r)).map((r) => r.slice(0, 60)));
dit('la ligne du métier ne descend jamais sous 11 px', [],
  [...feuilleSite.matchAll(/\.pastille[^{]*\{[^}]*font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1])).filter((px) => px < 11));
dit('… les promesses sont dans le bandeau sombre', true, accueil.includes('class="promesses promesses--sombre"'));
const photoDuPremierEcran = accueil.match(/<img class="hero-plein__photo" src="([^"]+)"[^>]*>/);
dit('la photo du premier écran n’est jamais paresseuse', true, !!photoDuPremierEcran && !photoDuPremierEcran[0].includes('loading="lazy"') && photoDuPremierEcran[0].includes('fetchpriority="high"'));
dit('… et le document la précharge', true, !!photoDuPremierEcran && accueil.includes(`<link rel="preload" as="image" href="${photoDuPremierEcran[1]}"`));
dit('les cinq liens du menu sont dans le HTML de l’accueil, script ou pas', [], COMMUN.nav.map((l) => l.vers).filter((v) => !new RegExp(`<nav class="nav"[^>]*>[\\s\\S]*?href="[^"]*${v}"[\\s\\S]*?</nav>`).test(accueil)));
dit('… repliés par une case à cocher, jamais par un bouton qui attend un script', true, accueil.includes('<input class="menu-etat cache" type="checkbox" id="menu-etat"') && !accueil.includes('<button class="menu-bouton"'));
/* La case doit rester dans le parcours du clavier : cachée par un clip
   (.cache), jamais par display:none, hidden ou tabindex="-1", sinon Tab ne
   l'atteint plus et le menu redevient un geste qui attend un script. */
const laCase = accueil.match(/<input class="menu-etat cache"[^>]*>/)?.[0] ?? '';
dit('… et la case reste atteignable au clavier', true, !!laCase && !/tabindex="-1"|aria-hidden|\bhidden\b/.test(laCase));
const feuille = readFileSync('src/apps/revelateur/revelateur.css', 'utf8');
dit('… ni display:none dans la feuille', [], [...feuille.matchAll(/^[^{\n]*\.(menu-etat|cache)\b[^{]*\{[^}]*display:\s*none/gm)].map((m) => m[0].slice(0, 50)));
/* Les photos des 22 et 23 septembre : les cauris au premier écran (et en image
   de partage), le portrait sur la première porte, les trois couronnes sur
   l'entretien, la mère et l'enfant sur MND Kids. Plus aucune porte sans photo. */
dit('le premier écran porte les cauris', true, /<img class="hero-plein__photo" src="[^"]*photos\/site\/cauris-accueil\.jpg" alt="[^"]+"/.test(accueil));
/* L'image de partage est un PAYSAGE taillé dans la même photo : WhatsApp et
   Facebook coupent un portrait vertical au milieu, et le visage sort du cadre. */
dit('… et l’image de partage est le paysage taillé dedans, avec ses dimensions', true,
  /og:image" content="[^"]*photos\/site\/partage-accueil\.jpg"/.test(accueil) && accueil.includes('og:image:width" content="800"'));
const photoDeLaPorte = (parcours: string) => accueil.match(new RegExp(`data-parcours="${parcours}">\\s*<img src="[^"]*photos/site/([^"]+)"`))?.[1] ?? null;
dit('les portes portent chacune leur photo', ['portrait-accueil.jpg', 'attention.jpg', 'trois-couronnes.jpg', 'mnd-kids.jpg', 'brice.jpg'],
  ['creation', 'reparation', 'entretien', 'enfant', 'formation'].map(photoDeLaPorte));
dit('… et aucune ne dit « photo à venir »', false, (accueil.split('class="portes"')[1] ?? '').split('</section>')[0].includes('Photo de la séance à venir'));
/* LES VISAGES DE LA MAISON (23 septembre 2026) : la paire au-dessus des avis,
   et les vignettes du Journal. Ces vérifications portent la RÈGLE, jamais le
   nombre : le soir du 23, cinq portraits sont devenus deux, et un harnais qui
   comptait cinq aurait crié sur un changement voulu tout en laissant passer
   une sixième photo non inscrite. On vérifie donc, pour TOUTE image de
   personne servie : elle existe dans le dossier, elle porte une ligne au
   registre des accords, et aucun alt ne nomme quelqu'un. */
const registre = readFileSync('docs/site-revelateur/photos.md', 'utf8');
const inscriteAuRegistre = (f: string) => registre.includes('`' + f + '`');
const figuresDeLaBande = [...(accueil.split('class="couronnes__bande"')[1] ?? '').split('</div>')[0]
  .matchAll(/<img src="[^"]*photos\/site\/([^"]+)" alt="([^"]*)"/g)];
dit('la bande sert exactement ce que le contenu nomme', ACCUEIL.couronnes.images, figuresDeLaBande.map((m) => m[1]));
dit('… chacune existe dans le dossier des photos', [], ACCUEIL.couronnes.images.filter((f) => !existsSync(`public/assets/photos/site/${f}`)));
dit('… et chacune est inscrite au registre des accords', [], ACCUEIL.couronnes.images.filter((f) => !inscriteAuRegistre(f)));
/* Les alt sont VIDES depuis le 23 septembre 2026 : la ligne de la section les
   couvre toutes, et répéter la même phrase sous chaque portrait la fait lire
   autant de fois par un lecteur d'écran. Les rétablir serait une régression. */
dit('… et aucune ne répète une description déjà lue au-dessus', [], figuresDeLaBande.map((m) => m[2]).filter(Boolean));
dit('… sans prénom', false, /alt="[^"]*\b(?:Mme|Madame|Mlle)\b/.test(accueil));

/* LE JOURNAL NOMME SES VIGNETTES, ET UNE CLIENTE N'ILLUSTRE PAS UN DÉFAUT.
   La règle est écrite en haut de docs/site-revelateur/photos.md. Elle tient à
   une chose qu'aucun œil ne rattrape à la relecture : une cliente a dit oui
   pour PARAÎTRE sur le site, et son visage posé sur « Peut-on réparer des
   dreadlocks abîmées ? » devient une affirmation sur elle que personne ne lui
   a demandée. Tant que la vignette se tirait au sort sur le rang du fichier
   dans le dossier, le prochain article ajouté pouvait l'y poser tout seul. */
const VIGNETTES_DE_CLIENTES = ['journal-4.jpg', 'journal-5.jpg', 'journal-6.jpg'];
/* Les mots par lesquels un article nomme un défaut. La liste s'allonge avec
   le Journal : un article qui parlera de chute, d'odeur ou de moisissure
   s'ajoute ici le jour où il est écrit. */
const NOMME_UN_DEFAUT = /abîm|cass|trop lourd|fine|perdue|néglig|chute|pellicule|moisi|odeur|créées ailleurs/i;
const articlesDuJournal = readdirSync('docs/site-revelateur/journal')
  .filter((f) => f.endsWith('.md') && f !== 'index.md')
  .map((f) => {
    const tete = readFileSync(join('docs/site-revelateur/journal', f), 'utf8').replace(/\r\n/g, '\n').split('\n---\n')[0];
    const champ = (c: string) => tete.match(new RegExp(`^${c}:\\s*"?(.*?)"?\\s*$`, 'm'))?.[1] ?? '';
    return { fichier: f, slug: champ('slug'), titre: champ('titre'), image: champ('image') };
  });
dit('le Journal a ses dix articles', 10, articlesDuJournal.length);
dit('… et chacun NOMME sa vignette, au lieu de la tirer au sort', [], articlesDuJournal.filter((a) => !a.image).map((a) => a.fichier));
dit('… chaque vignette existe dans le dossier des photos', [], articlesDuJournal.filter((a) => !existsSync(`public/assets/photos/site/${a.image}`)).map((a) => a.image));
dit('… et chaque vignette est inscrite au registre des accords', [], articlesDuJournal.filter((a) => !inscriteAuRegistre(a.image)).map((a) => a.image));
const vignettesServies = [...(pages.get('/journal/') ?? '')
  .matchAll(/class="article" href="[^"]*\/journal\/([^/"]+)\/"><img src="[^"]*photos\/site\/([^"]+)"/g)]
  .map((m) => `${m[1]} · ${m[2]}`);
dit('… et la page servie pose bien celle-là sur cet article-là',
  articlesDuJournal.map((a) => `${a.slug} · ${a.image}`), vignettesServies);
dit('AUCUNE CLIENTE n’illustre un article qui nomme un défaut', [],
  articlesDuJournal.filter((a) => VIGNETTES_DE_CLIENTES.includes(a.image) && NOMME_UN_DEFAUT.test(a.titre))
    .map((a) => `${a.image} sur « ${a.titre} »`));
dit('… et chaque vignette de cliente sert bien quelque part', [],
  VIGNETTES_DE_CLIENTES.filter((v) => !articlesDuJournal.some((a) => a.image === v)));
dit('… et la page le porte au-dessus du titre', true, accueil.indexOf(ACCUEIL.metier) > 0 && accueil.indexOf(ACCUEIL.metier) < accueil.indexOf('<h1>'));
dit('trois promesses sous le grand écran', 3, (accueil.match(/class="promesse"/g) ?? []).length);
dit('… juste après le hero, avant les portes', true,
  accueil.indexOf('class="promesses"') < accueil.indexOf('id="portes"'));
dit('les offres se montent sur l’accueil, en genre accueil', true, accueil.includes('data-ilot="offres" data-genre="accueil"'));
/* AUCUN ÎLOT NE POSE UN LIEN RELATIF — 24 septembre 2026.

   « Quand on appuie le bouton J'en profite ce n'est branché à rien » (Yéman).
   Ce n'était pas un bouton sans destination : l'îlot des offres écrivait
   `../reserver/`, ce qui tombe juste depuis /revelateur/les-offres/ et sort du
   site depuis /revelateur/, sur une page qui répond 404. Le MÊME composant
   sert les deux pages : un îlot ne connaît pas la profondeur de celle qui le
   monte, donc aucun `../` ne peut être juste partout.

   Cette vérification lit la SOURCE et non les pages, et c'est tout l'intérêt :
   un îlot se monte par script, son lien n'existe dans aucun HTML généré. Le
   reste de ce harnais n'aurait jamais pu l'attraper. Les liens des îlots
   passent par `base()`, qui lit la base posée à la construction. */
const ILOTS = 'src/apps/revelateur/ilots';
/* Les commentaires sont effacés AVANT la lecture, en gardant les retours à la
   ligne. Sans cela la vérification s'attrape elle-même : le commentaire qui
   explique la panne cite `../reserver/`, et un exemple dans une explication
   n'est pas un lien. */
const sansCommentaires = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '));
const liensRelatifs = readdirSync(ILOTS).filter((f) => f.endsWith('.tsx')).flatMap((f) => sansCommentaires(readFileSync(join(ILOTS, f), 'utf8'))
  .split('\n')
  .filter((l) => /['"`]\.\.\//.test(l) && !/\bfrom\s*['"]\.\./.test(l) && !l.trim().startsWith('//'))
  .map((l) => `${f} · ${l.trim().slice(0, 52)}`));
dit('aucun îlot ne pose un lien relatif', [], liensRelatifs);
dit('… et l’îlot des offres bâtit ses portes depuis la base du site', true,
  readFileSync(join(ILOTS, 'Offres.tsx'), 'utf8').includes("import.meta.env.BASE_URL"));

/* ── L'ACCUEIL ÉPURÉ, ET DES MOTS QUI AFFIRMENT — 22 septembre 2026 ────
   « Le salon existe depuis 2010 », « épure-moi cette page », « évite les
   mots négatifs » (Yéman). Le bandeau et la bande de confiance ne vivent plus
   sur l'accueil ; les phrases retirées ne doivent pas revenir par une
   réécriture. */
dit('la Maison existe depuis 2010, nulle part 2014', true, accueil.includes('depuis 2010') && !accueil.includes('2014'));
dit('… sur chaque page servie', [], [...pages].filter(([, h]) => h.includes('2014')).map(([c]) => c));
dit('le bandeau de l’offre ne vit plus sur l’accueil', false, accueil.includes('data-ilot="bandeau-offre"'));
dit('la bande de confiance non plus', false, accueil.includes('class="confiance sombre"'));
dit('le titre des offres affirme', false, /à quelles conditions|Aucun prix|ne solde pas|non cumulable|Rien à payer/.test(accueil));

/* ── AUCUN ACCENT GRAVE DANS UN COMMENTAIRE DE GABARIT ──────────────
   Les gabarits de genere-revelateur.mjs sont des template literals : un
   accent grave dans un commentaire HTML les referme, et le générateur plante
   sans rien écrire. Trois notes écrites (REPRENDRE.md:279 et :711,
   lettres-du-pret.ts:176) n'ont pas suffi, le 22 septembre 2026 le piège
   s'est refermé une troisième fois. Une règle qui ne vit qu'en prose se
   lit après avoir écrit ; celle-ci se lit avant de publier. */
const generateur = readFileSync('scripts/genere-revelateur.mjs', 'utf8');
const commentairesAvecAccentGrave = [...generateur.matchAll(/<!--([\s\S]*?)-->/g)]
  .filter((m) => m[1].includes('`'))
  .map((m) => m[1].trim().slice(0, 60));
dit('aucun accent grave dans un commentaire HTML du générateur', [], commentairesAvecAccentGrave);

/* ── LE RAPPEL PROMIS EXISTE ───────────────────────────────────────── */
dit('la page /rappel/ est écrite', true, pages.has('/rappel/'));
dit('… et monte le formulaire de rappel', true, (pages.get('/rappel/') ?? '').includes('data-ilot="demande"'));
/* Les consultations se réservent en ligne (RESERVABLES : creation, reparation,
   entretien, enfant) ; seule la formation passe par le rappel. */
const premiere = pages.get('/premiere-couronne/') ?? '';
const formations = pages.get('/formations/') ?? '';
dit('« Me faire rappeler » mène au rappel, avec le parcours', true, formations.includes('/rappel/?besoin=formation">Me faire rappeler'));
dit('… et plus au calendrier', false, /\/reserver\/\?besoin=\w+">Me faire rappeler/.test(formations));
dit('le pied envoie « Me faire rappeler » au rappel, sur chaque page', true,
  [...pages.values()].every((h) => /rappel\/">Me faire rappeler/.test(h)));
dit('l’accueil envoie « Laisser mes coordonnées » au rappel', true, /rappel\/"[^>]*>Laisser mes coordonnées/.test(accueil));

/* ── LA BARRE DU BAS NE RÉPÈTE PLUS LE MÊME LIEN ───────────────────── */
const entretien = pages.get('/entretien-locks/') ?? '';
dit('la barre du bas d’une page réservable offre WhatsApp en second', true,
  /class="barre-mobile">.*data-wa="entretien"/s.test(entretien) && !entretien.includes('Autre heure'));
dit('… sur la Première Couronne aussi, sans « Autre heure »', true,
  /class="barre-mobile">.*data-wa="creation"/s.test(premiere) && !premiere.includes('Autre heure'));
dit('celle d’une page non réservable offre le rappel', true, /class="barre-mobile">.*\/rappel\/\?besoin=formation">Me faire rappeler/s.test(formations));

/* ── L'APPEL DE FIN NE RÉPÈTE PLUS LE TITRE ────────────────────────── */
const h1 = premiere.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? '';
dit('l’appel de fin de page ne répète pas le H1', false, premiere.includes(`<section class="appel"><div class="conteneur"><div><h2>${h1}</h2>`));

/* ── UNE OFFRE DE VITRINE EST EN COURS SANS DATES ──────────────────── */
dit('une offre active sans dates est « en cours »', 'cours', etatDeLOffre({ active: true }));
dit('… inactive, elle dort', 'dort', etatDeLOffre({ active: false }));

console.log(ko === 0 ? '\nTout est juste.' : `\n${ko} vérification(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
