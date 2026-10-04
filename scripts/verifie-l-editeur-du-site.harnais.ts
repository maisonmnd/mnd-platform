/* L'ÉDITEUR DU SITE, ÉPROUVÉ — `node scripts/verifie-l-editeur-du-site.mjs`.

   4 octobre 2026. L'attente vient de la maquette validée et des réponses au
   sélecteur : un clic publie (le serveur refabrique le site, depuis `main`
   tenu à jour par chaque mise en ligne) ; les textes et photos des pages
   existantes ; Brice et Yéman seuls ; « Notre histoire » protégée ; les règles
   de la Maison veillent ; chaque modification se défait. */
import { readFileSync } from 'node:fs';
import { ACCUEIL, PAGES } from '../src/apps/revelateur/contenu';
import {
  appliqueLesRetouches, bloquants, champsDeLaPage, gardesDuTexte, publie, retouchee,
} from '../src/shared/site-retouches';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu).slice(0, 200)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu).slice(0, 200)}`);
};

/* 1. Ce qu'on peut modifier : tout ce qui s'écrit sur une page existante. */
const pc = PAGES.find((p) => p.chemin === '/premiere-couronne/')!;
const champs = champsDeLaPage(pc);
const cles = champs.map((c) => c.cle);
dit('Google, titres, bouton, pas, questions et photo sont modifiables', true,
  ['titre', 'description', 'h1', 'sur', 'ligne', 'cta.texte', 'cta.note', 'pas.items.0.0', 'faq.2.1', 'image'].every((c) => cles.includes(c)));
dit('les reperes techniques ne le sont pas (chemin, besoin, jsonld)', false, cles.some((c) => ['chemin', 'besoin', 'jsonld'].includes(c)));
dit('la photo est reconnue comme une photo', 'photo', champs.find((c) => c.cle === 'image')?.genre);
dit('le titre Google porte sa limite de 60 signes', 60, champs.find((c) => c.cle === 'titre')?.max);
dit('les questions se nomment comme on les lit', ['Question 3', 'Réponse 3'], [champs.find((c) => c.cle === 'faq.2.0')?.libelle, champs.find((c) => c.cle === 'faq.2.1')?.libelle]);
dit('l accueil aussi se modifie', true, champsDeLaPage(ACCUEIL).length > 5);

/* 2. Une retouche s'applique, sans jamais inventer un champ. */
const r = retouchee(pc, { h1: 'Votre première couronne', 'faq.2.1': 'Sur devis, après la consultation.', 'champ.inexistant': 'x' });
dit('le grand titre et une reponse changent', ['Votre première couronne', 'Sur devis, après la consultation.'], [r.h1, (r.faq as [string, string][])[2][1]]);
dit('un champ qui n existe pas n est pas cree', false, 'champ' in (r as Record<string, unknown>));
dit('l original n est pas touche', 'La première couronne : créer ses dreadlocks à Cotonou', pc.h1);
const copie = PAGES.map((p) => ({ ...p }));
const accueil = { ...(ACCUEIL as unknown as Record<string, unknown>) };
const n = appliqueLesRetouches(copie, accueil, { pages: { '/premiere-couronne/': { h1: 'Neuf' }, '/': { h1: 'Accueil neuf' } } });
dit('le generateur applique les retouches publiees aux pages et a l accueil', [2, 'Neuf', 'Accueil neuf'],
  [n, copie.find((p) => p.chemin === '/premiere-couronne/')?.h1, accueil.h1]);
dit('sans retouches publiees, rien ne change', 0, appliqueLesRetouches(PAGES.map((p) => ({ ...p })), undefined, null));

/* 3. Les règles de la Maison. */
const niveaux = (t: string, page = '/premiere-couronne/') => gardesDuTexte(t, page).map((g) => g.niveau);
dit('un tiret long est signale', ['signale'], niveaux('Une couronne — la vôtre'));
dit('« salon » est signale', ['signale'], niveaux('Venez au salon'));
dit('un montant est signale', ['signale'], niveaux('Dès 25 000 F'));
dit('Kolétan hors de Notre histoire bloque la publication', ['bloque'], niveaux('Pour Kolétan'));
dit('... dans Notre histoire, il est chez lui', [], niveaux('Kolétan Bright', '/notre-histoire/'));
dit('un titre Google trop long est signale, pas interdit', ['signale'], gardesDuTexte('x'.repeat(70), '/', { max: 60, genre: 'court' }).map((g) => g.niveau));
dit('ce qui bloque se liste avant de publier', [{ page: '/faq/', cle: 'h1', dit: 'Kolétan n’apparaît que dans « Notre histoire ».' }], bloquants({ '/faq/': { h1: 'Kolétan' } }));

/* 4. Publier, défaire, revenir. */
const v1 = publie(undefined, { '/faq/': { h1: 'FAQ neuve' } }, '2026-10-04T10:00:00Z', 'Yéman');
const v2 = publie(v1, { '/faq/': { h1: '' }, '/contact/': { h1: 'Contact' } }, '2026-10-04T11:00:00Z', 'Yéman',
  [{ photo: 'https://x/storage/v1/object/public/site/pages/a.jpg', page: '/contact/', accordLe: '2026-10-04' }]);
dit('une chaine vide revient au texte d origine', false, '/faq/' in v2.pages);
dit('la publication d avant reste a un clic (un cran)', [{ '/faq/': { h1: 'FAQ neuve' } }, undefined], [v2.precedent?.pages, (v2.precedent as { precedent?: unknown } | undefined)?.precedent]);
dit('chaque photo publiee entre au registre avec son accord', ['/contact/', '2026-10-04'], [v2.registre?.[0].page, v2.registre?.[0].accordLe]);

/* 5. Le câblage, de bout en bout. */
const lis = (f: string) => readFileSync(f, 'utf8');
const gen = lis('scripts/genere-revelateur.mjs');
dit('le generateur lit les retouches publiees avant d ecrire les pages', true,
  /documentsPublics\(\['mnd_site_publie'\]\)/.test(gen) && /contenu\.appliqueLesRetouches\(PAGES, ACCUEIL/.test(gen)
  && gen.indexOf('appliqueLesRetouches(PAGES') < gen.indexOf('function page('));
dit('une photo deposee au Trone se sert telle quelle, sans jumeau WebP', true,
  /const estPhoto = \(nom\) => !photoEnLigne\(nom\)/.test(gen) && /src="\$\{attr\(srcDe\(nom\)\)\}"/.test(gen));
const pub = lis('scripts/publie.mjs');
dit('chaque mise en ligne envoie le code sur GitHub, jamais depuis le serveur', true,
  /if \(!process\.env\.GITHUB_ACTIONS && !process\.env\.MND_SANS_CODE\)/.test(pub) && /git\(\['push', 'origin', 'HEAD:main'\]\)/.test(pub));
const wf = lis('.github/workflows/publier-le-site.yml');
dit('le serveur ecoute « site-publier » et ne publie que le site public', true,
  /types: \[site-publier\]/.test(wf) && /node scripts\/publie\.mjs revelateur\n?/.test(wf) && /ref: main/.test(wf));
const fn = lis('supabase/functions/site-publier/index.ts');
dit('la fonction ne repond qu a Brice et Yeman', true, /role !== 'souverain' && role !== 'gerant'/.test(fn) && /event_type: 'site-publier'/.test(fn));
const sql = lis('supabase/migrations/0114_l_editeur_du_site.sql');
dit('la base : publie lisible, ecrit par la direction, photos publiques', true,
  /'mnd_site_publie'/.test(sql) && /not public\.est_direction\(\)/.test(sql) && /values \('site', 'site', true/.test(sql));
const ed = lis('src/apps/trone/routes/clients/EditeurDuSite.tsx');
dit('l editeur : publier est a la direction, la photo demande l accord, Notre histoire demande confirmation', true,
  /if \(!estDirection\) return;/.test(ed) && /if \(!accord\) \{ toast\(/.test(ed) && /chemin !== PAGE_PROTEGEE \|\| histoireOuverte/.test(ed));

console.log(ko === 0 ? '\nL editeur du site tient ce qui a ete decide.' : `\n${ko} controle(s) en echec.`);
