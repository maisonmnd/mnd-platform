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
import { ACCUEIL, COMMUN, GALERIE } from '../src/apps/revelateur/contenu';
import { etatDeLOffre } from '../src/shared/offres-pur';
import { horairesStructures } from '../src/apps/revelateur/schema-pur';

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
/* Depuis le 24 septembre, c'est le jumeau WebP qui est préchargé, avec son
   type : un navigateur qui ne le lit pas ignore la précharge et prend le JPEG. */
dit('… et le document précharge son jumeau WebP, en le disant', true, !!photoDuPremierEcran && accueil.includes(`<link rel="preload" as="image" href="${photoDuPremierEcran[1].replace(/\.jpe?g$/i, '.webp')}" type="image/webp" fetchpriority="high" />`));
dit('tous les liens du menu sont dans le HTML de l’accueil, script ou pas', [], COMMUN.nav.map((l) => l.vers).filter((v) => !new RegExp(`<nav class="nav"[^>]*>[\\s\\S]*?href="[^"]*${v}"[\\s\\S]*?</nav>`).test(accueil)));
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
const photoDeLaPorte = (parcours: string) => accueil.match(new RegExp(`data-parcours="${parcours}">\\s*(?:<picture><source [^>]*>)?<img src="[^"]*photos/site/([^"]+)"`))?.[1] ?? null;
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

/* ══ LA GALERIE — 26 septembre 2026 ═══════════════════════════════════
   La règle des photos ne connaît pas les pages : une image de cliente servie
   quelque part est inscrite au registre des accords AVANT de partir, et cela
   vaut pour la galerie comme pour la rangée de l'accueil et les vignettes du
   Journal. Elle sert dix-huit photos, dont quatre qui ne servaient plus
   nulle part depuis le 23 septembre.

   ET LA PAGE TIENT DEBOUT SANS SCRIPT. L'animation n'écrit qu'une variable
   de feuille de style ; si le script ne part pas, la constellation garde sa
   place de départ et la grille se lit dessous. On le vérifie sur le HTML
   SERVI, qui est justement ce qu'un navigateur reçoit avant d'exécuter quoi
   que ce soit. */
const galerie = pages.get('/galerie/') ?? '';
dit('la galerie est servie', true, galerie.length > 0);
const photosDeLaGalerie = [...new Set([...GALERIE.boite, ...GALERIE.photos])];
dit('… chaque photo de la galerie existe dans le dossier', [],
  photosDeLaGalerie.filter((f) => !existsSync(`public/assets/photos/site/${f}`)));
dit('… et chacune est inscrite au registre des accords', [],
  photosDeLaGalerie.filter((f) => !inscriteAuRegistre(f)));
dit('… la boîte porte ses dix photos, sans place vide', 10, GALERIE.boite.length);
dit('… le HTML les pose toutes, script ou pas', [],
  GALERIE.boite.filter((f) => !galerie.includes(`photos/site/${f}`)));
dit('… et la grille aussi', [],
  GALERIE.photos.filter((f) => !galerie.includes(`photos/site/${f}`)));
/* Le premier écran ne se charge pas en différé : une image qu'on voit tout
   de suite ne s'attend pas. La grille du dessous, elle, doit l'être. */
dit('… la grille se charge en différé, la constellation non', true,
  (galerie.match(/loading="lazy"/g) ?? []).length === GALERIE.photos.length);
dit('… le menu mène à la galerie', true,
  COMMUN.nav.some((l: { vers: string }) => l.vers === '/galerie/'));
/* AUCUN PRÉNOM, comme partout ailleurs sur ce site. Le contrôle ne porte que
   sur LES IMAGES DE LA GALERIE : un premier jet lisait toute la page et
   tombait sur le texte de remplacement du verrou dans l'en-tête, qui, lui,
   doit bien dire « Maison MND ». Un contrôle trop large crie sur du juste, et
   l'on prend l'habitude de l'ignorer. */
const imagesDeLaGalerie = [
  ...(galerie.match(/<div class="gal-carte"[\s\S]*?<\/div>/g) ?? []),
  ...(galerie.match(/<figure>[\s\S]*?<\/figure>/g) ?? []),
].join('');
dit('… et aucune photo n’y est nommée', false, /alt="[^"]+"/.test(imagesDeLaGalerie));
dit('… alors que le verrou de l’en-tête, lui, se nomme', true, /alt="[^"]+"/.test(galerie));

/* LE JOURNAL NOMME SES VIGNETTES, ET UNE CLIENTE N'ILLUSTRE PAS UN DÉFAUT.
   La règle est écrite en haut de docs/site-revelateur/photos.md. Elle tient à
   une chose qu'aucun œil ne rattrape à la relecture : une cliente a dit oui
   pour PARAÎTRE sur le site, et son visage posé sur « Peut-on réparer des
   dreadlocks abîmées ? » devient une affirmation sur elle que personne ne lui
   a demandée. Tant que la vignette se tirait au sort sur le rang du fichier
   dans le dossier, le prochain article ajouté pouvait l'y poser tout seul. */
const VIGNETTES_DE_CLIENTES = ['journal-4.jpg', 'journal-5.jpg', 'journal-6.jpg',
  /* 24 septembre 2026 : trois de plus, dont un ENFANT (journal-7). La règle
     compte double pour lui. journal-9 est `cliente-2.jpg`, descendue de
     l'accueil au Journal. */
  'journal-7.jpg', 'journal-9.jpg',
  /* 26 septembre 2026 : `journal-10` est `cliente-8.jpg`, descendue du rang de
     l'accueil où elle doublait `cliente-7` — c'est la même femme. `journal-8`
     a quitté le site le même jour : sa place était la seule qu'elle occupait,
     et le contrôle d'en bas veut qu'une photo de cliente publiée serve quelque
     part. Elle n'est pas détruite, son original reste chez Yéman ; elle n'est
     simplement plus servie. */
  'journal-10.jpg'];
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
  .matchAll(/class="article" href="[^"]*\/journal\/([^/"]+)\/">(?:<picture><source [^>]*>)?<img src="[^"]*photos\/site\/([^"]+)"/g)]
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

/* ── L'ÉTAT DES LIEUX DU 24 SEPTEMBRE 2026, TENU ────────────────────── */

/* 9 · Le lien d'évitement : premier de chaque page, cible focalisable,
   visible seulement au clavier (déplacé hors écran, jamais display:none). */
dit('chaque page ouvre sur le lien d’évitement, avant tout le reste', [],
  [...pages].filter(([, h]) => !/<body[^>]*>\s*<a class="evitement" href="#contenu">Aller au contenu<\/a>/.test(h)).map(([c]) => c));
dit('… et le contenu principal porte sa cible, focalisable', [],
  [...pages].filter(([, h]) => !h.includes('<main id="contenu" tabindex="-1">')).map(([c]) => c));
const regleEvitement = feuille.match(/\.evitement\s*\{[^}]*\}/)?.[0] ?? '';
dit('… sorti de l’écran par un déplacement, jamais par display:none', true,
  /transform:\s*translateY\(-/.test(regleEvitement) && !/display:\s*none/.test(regleEvitement) && /\.evitement:focus\s*\{[^}]*transform:\s*none/.test(feuille));

/* 6 · Les photos offrent leur WebP. L'attente vient de la règle : TOUTE image
   du dossier des photos servie en JPEG est enveloppée d'un <picture> qui
   propose le jumeau, et tout JPEG du dossier a un jumeau plus léger. */
const jumeau = (f: string) => f.replace(/\.jpe?g$/i, '.webp');
const photosNues = [...pages].flatMap(([c, h]) => {
  const toutes = [...h.matchAll(/<img[^>]* src="\/assets\/photos\/site\/[^"]+\.jpe?g"/g)].length;
  const vetues = [...h.matchAll(/<picture><source type="image\/webp" srcset="\/assets\/photos\/site\/([^"]+)\.webp"><img[^>]* src="\/assets\/photos\/site\/\1\.jpe?g"/g)].length;
  return toutes === vetues ? [] : [`${c} : ${toutes - vetues} photo(s) sans WebP`];
});
dit('chaque photo servie est enveloppée d’un <picture> qui offre son WebP', [], photosNues);
const jpgs = readdirSync('public/assets/photos/site').filter((f) => /\.jpe?g$/i.test(f));
dit('chaque JPEG du dossier des photos a son jumeau WebP', [], jpgs.filter((f) => !existsSync(`public/assets/photos/site/${jumeau(f)}`)));
/* Et la construction fabrique les jumeaux elle-même, avant de construire :
   une photo ajoutée sans conversion n'existe pas comme cas. */
dit('… et build-sites les fabrique avant toute construction', true,
  /execSync\('node scripts\/photos-en-webp\.mjs'[\s\S]*?for \(const site of SITES\)/.test(readFileSync('scripts/build-sites.mjs', 'utf8')));
dit('… plus léger que lui', [], jpgs.filter((f) => existsSync(`public/assets/photos/site/${jumeau(f)}`) && statSync(`public/assets/photos/site/${jumeau(f)}`).size >= statSync(`public/assets/photos/site/${f}`).size));
dit('… et l’image de partage reste le JPEG, que les aperçus lisent partout', true, /og:image" content="[^"]*\.jpg"/.test(accueil));

/* LA BOÎTE EFFACÉE ET L'ENFANT QUI NE DESSINE RIEN — 24 septembre 2026, au
   soir. `picture { display: contents }` efface la boîte du <picture> mais
   PROMEUT ses enfants au rang d'éléments du conteneur : la <source>, qui ne
   dessine rien, prenait quand même une case sur la grille des fondateurs, la
   photo passait à droite et le texte à la ligne. Rien ne le disait dans le
   HTML ni dans la feuille lue séparément, et c'est Yéman qui l'a vu en ligne.

   Cette règle tient la CAUSE : une boîte effacée n'a le droit de l'être que
   si ce qu'elle contient et qui ne dessine rien l'est aussi. La mise en page
   elle-même se prouve au rendu, pas ici. */
const efface = (selecteur: string, valeur: string) =>
  /* String.raw, et non un gabarit nu : dans un gabarit, `\}` vaut « } » et
     `\s` vaut « s », ce qui rend le motif inoffensif et le contrôle MORT. Il
     l'a été le temps d'un essai, et c'est la panne remise qui l'a dit. */
  new RegExp(String.raw`(^|\})\s*${selecteur}\s*\{[^}]*display:\s*${valeur}`, 'm').test(feuille);
dit('quand la feuille efface la boîte du <picture>, sa <source> ne peut pas prendre une case', [],
  efface('picture', 'contents') && !efface(String.raw`(?:picture\s*>\s*)?source`, 'none')
    ? ['picture efface sa boîte, la <source> garde la sienne'] : []);

/* 6 · L'icône d'onglet est une icône : chaque <link> d'icône nomme sa taille,
   le fichier existe et fait exactement cette taille (lue dans l'en-tête PNG). */
const taillePng = (f: string) => { const b = readFileSync(f); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
const icones = [...accueil.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*sizes="(\d+x\d+)"[^>]*href="([^"]+)"/g)].map((m) => ({ taille: m[1], href: m[2] }));
dit('l’onglet et l’écran d’accueil ont leurs icônes, aux tailles annoncées', ['180x180', '192x192', '32x32'],
  icones.map((i) => (existsSync(`public${i.href}`) && taillePng(`public${i.href}`) === i.taille ? i.taille : `${i.taille} manquante ou fausse`)).sort());
dit('… plus jamais le monogramme de 1600 pixels en icône', false, /<link rel="icon"[^>]*monograms/.test(accueil));
const manifeste = accueil.match(/<link rel="manifest" href="([^"]+)"/)?.[1] ?? '';
const manifesteLu = manifeste && existsSync(`public${manifeste}`) ? JSON.parse(readFileSync(`public${manifeste}`, 'utf8')) : null;
dit('le manifeste existe, et ses icônes aussi, à leur taille', ['192x192', '512x512'],
  (manifesteLu?.icons ?? []).map((i: { src: string; sizes: string }) => (existsSync(`public${i.src}`) && taillePng(`public${i.src}`) === i.sizes ? i.sizes : `${i.sizes} manquante ou fausse`)));
dit('… et reste un site, pas une application', 'browser', manifesteLu?.display);

/* 4 et 8 · La fiche structurée relie exactement les comptes que le contenu
   nomme, le pied les porte dans le même ordre, et la position n'est écrite
   que si le contenu la connaît. Les horaires viennent du Trône : la forme
   pure s'éprouve ici sans réseau. */
const graphe = JSON.parse(accueil.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}')['@graph'] ?? [];
const fiche = graphe.find((n: { '@type': string }) => n['@type'] === 'HairSalon') ?? {};
const comptes = (['instagram', 'facebook', 'tiktok', 'google'] as const).map((k) => COMMUN.comptes?.[k]).filter(Boolean);
dit('la fiche structurée relie exactement les comptes que le contenu nomme', comptes, fiche.sameAs ?? []);
/* UNE ADRESSE LUE DANS DU HTML SE DÉSÉCHAPPE — 26 septembre 2026. L'adresse de
   la fiche Google porte maintenant un `&`, et le générateur l'écrit `&amp;`,
   ce qui est la bonne façon de l'écrire : un navigateur relit bien `&`. Ce
   contrôle, lui, comparait le texte brut de l'attribut et criait sur une page
   juste. Aucune des adresses du pied n'avait jamais porté de `&` avant ce
   jour, et le défaut dormait là depuis le début. */
const deshtml = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
dit('… le pied du site les porte, dans le même ordre, en nouvel onglet', comptes,
  [...(accueil.split('<footer>')[1] ?? '').matchAll(/<a href="([^"]+)" target="_blank" rel="noopener">/g)]
    .map((m) => deshtml(m[1])));
dit('… la position seulement si le contenu la connaît', COMMUN.position ?? null,
  fiche.geo ? { latitude: fiche.geo.latitude, longitude: fiche.geo.longitude } : null);
dit('… la fiche Google est la carte', COMMUN.comptes?.google ?? null, fiche.hasMap ?? null);
/* L'ADRESSE DE LA FICHE S'OUVRE SUR UN TÉLÉPHONE — 26 septembre 2026. Elle
   s'écrivait `maps/place/?q=place_id:…`. L'application Maps l'attrape avant le
   navigateur, prend l'identifiant pour du TEXTE À CHERCHER et affiche « No
   results found » ; Yéman est tombé dessus, capture à l'appui. C'est une panne
   qu'aucun contrôle de page ne voyait, parce que le lien EXISTE, pointe vers
   google.com et rend 200 : seul son FORMAT est faux. On tient donc le format,
   pas la présence. */
const lienGoogle = COMMUN.comptes?.google ?? '';
dit('la fiche Google s’écrit dans la forme que Google documente', true,
  /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&/.test(lienGoogle));
dit('… elle nomme le lieu par son identifiant', true, /[?&]query_place_id=[A-Za-z0-9_-]{10,}/.test(lienGoogle));
dit('… et porte le `query` que Google exige', true, /[?&]query=[^&]+/.test(lienGoogle));
dit('… plus jamais la forme que l’application prend pour une recherche', false,
  lienGoogle.includes('place_id:'));
/* LE REPLI TOMBE SUR LA PORTE. Si l'identifiant n'est pas honoré, c'est
   `query` qui décide seul de ce qu'on trouve : il doit porter les coordonnées
   de la Maison, pas celles d'ailleurs, et pas un nom qu'elle quitte. */
const q = decodeURIComponent((lienGoogle.match(/[?&]query=([^&]+)/) ?? [])[1] ?? '');
const [qLat, qLon] = q.split(',').map(Number);
dit('… et son repli tombe sur la porte de la Maison', true,
  Number.isFinite(qLat) && Number.isFinite(qLon)
  && Math.abs(qLat - (COMMUN.position?.latitude ?? 0)) < 1e-5
  && Math.abs(qLon - (COMMUN.position?.longitude ?? 0)) < 1e-5);
dit('… un ordre de grandeur, jamais un chiffre', true, fiche.priceRange === '$$' && !/\d/.test(String(fiche.priceRange)));
if (fiche.openingHoursSpecification) {
  dit('… les horaires écrits ouvrent avant de fermer, un jour au moins chacun', [],
    (fiche.openingHoursSpecification as { dayOfWeek: string[]; opens: string; closes: string }[]).filter((r) => !r.dayOfWeek.length || !(r.opens < r.closes)));
} else console.log('—     la fiche ne porte pas d’horaires : base non lue à la génération, ou semaine vide au Trône.');
dit('les horaires du Trône se regroupent par jours consécutifs aux mêmes heures, et un jour fermé n’écrit rien',
  [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' },
   { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '14:00' }],
  horairesStructures([
    { key: 'dim', open: '09:00', close: '18:00', closed: true },
    ...['lun', 'mar', 'mer', 'jeu', 'ven'].map((key) => ({ key, open: '09:00', close: '18:00', closed: false })),
    { key: 'sam', open: '09:00', close: '14:00', closed: false },
  ]));
dit('… une heure mal écrite ou à l’envers ne sort pas', [], horairesStructures([{ key: 'lun', open: '18:00', close: '09:00', closed: false }, { key: 'mar', open: '9h', close: '18:00', closed: false }]));
/* Le Trône écrit « 08h00 » et « 20h30 » : lus tels quels, écrits « 08:00 ». */
dit('… et la forme du Trône, « 08h00 », s’écrit « 08:00 »',
  [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday'], opens: '08:00', closes: '20:30' }],
  horairesStructures([{ key: 'lun', open: '08h00', close: '19h00', closed: true }, { key: 'mar', open: '08h00', close: '20h30', closed: false }, { key: 'mer', open: '08h00', close: '20h30', closed: false }]));

/* 7 · Les offres sont dans la page avant le script, quand la construction a
   pu lire la base. La règle : l'onglet ouvert montre les offres en cours,
   sinon celles à venir ; l'accueil montre les offres en cours, sans onglets ;
   chaque carte écrit son code ; le JSON ne peut pas fermer son script. */
const pageOffres = pages.get('/les-offres/') ?? '';
const initialesBrutes = pageOffres.match(/<div data-ilot="offres">\s*<script type="application\/json" data-initiales>([\s\S]*?)<\/script>/)?.[1];
if (initialesBrutes === undefined) {
  console.log('—     les offres ne sont pas écrites dans la page (base non lue à la génération) : l’îlot les montera, rien à éprouver ici.');
} else {
  const initiales = JSON.parse(initialesBrutes) as { code?: string; active?: boolean; du?: string; au?: string }[];
  const enCours = initiales.filter((o) => etatDeLOffre(o) === 'cours');
  const aVenir = initiales.filter((o) => etatDeLOffre(o) === 'venir');
  const cartes = (h: string) => (h.match(/<article class="offre-site/g) ?? []).length;
  dit('la page des offres écrit ses cartes dans le HTML : en cours, sinon à venir', enCours.length || aVenir.length, cartes(pageOffres));
  dit('… l’accueil écrit les offres en cours, sans onglets', enCours.length, cartes(accueil));
  dit('… et n’y pose aucun onglet', false, accueil.includes('role="tablist"'));
  const montrees = enCours.length ? enCours : aVenir;
  dit('… chaque carte écrit son code en toutes lettres', [], montrees.filter((o) => o.code && !pageOffres.includes(`<b>${o.code}</b>`)).map((o) => o.code));
  dit('… le JSON ne peut pas fermer son script', false, /<\/|<script/i.test(initialesBrutes));
  dit('… et l’accueil porte les mêmes données', true, accueil.includes(`<script type="application/json" data-initiales>${initialesBrutes}</script>`));
}

console.log(ko === 0 ? '\nTout est juste.' : `\n${ko} vérification(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
