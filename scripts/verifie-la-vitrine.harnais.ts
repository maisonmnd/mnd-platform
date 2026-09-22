/* LA VITRINE REVISITÉE, ÉPROUVÉE — `node scripts/verifie-la-vitrine.mjs`.

   Ce harnais lit les PAGES GÉNÉRÉES (chaque index.html sous revelateur/,
   écrit par `node scripts/genere-revelateur.mjs`), pas le contenu : c'est ce que le
   navigateur reçoit qui fait foi. Quatre choses s'y attrapent qu'aucun œil
   ne voit : un lien wa.me sans numéro a l'air d'un lien ; « L'atelier MND »
   peut ressortir d'une réécriture de titre en pleine demande Meta pour
   « Maison MND » ; une bulle posée sur la page qui EST le geste couvrirait
   son bouton d'envoi ; et un rappel promis qui mène au calendrier. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
dit('… et la page le porte au-dessus du titre', true, accueil.indexOf(ACCUEIL.metier) > 0 && accueil.indexOf(ACCUEIL.metier) < accueil.indexOf('<h1>'));
dit('trois promesses sous le grand écran', 3, (accueil.match(/class="promesse"/g) ?? []).length);
dit('… juste après le hero, avant les portes', true,
  accueil.indexOf('class="promesses"') < accueil.indexOf('id="portes"'));
dit('les offres se montent sur l’accueil, en genre accueil', true, accueil.includes('data-ilot="offres" data-genre="accueil"'));

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
