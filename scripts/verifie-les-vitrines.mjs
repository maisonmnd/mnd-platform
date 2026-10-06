/* LES VITRINES, SÉPARÉES — `node scripts/verifie-les-vitrines.mjs`.

   4 octobre 2026. « Cette page ne sert absolument à rien. Mettre le site
   public sur cette page. Que Ma Couronne soit bien distinguée du site
   public. » Réponses au sélecteur : le miroir retiré, le nom « Les vitrines ».
   Le harnais tient la séparation : trois onglets, le site sans formule (le
   défaut des interrupteurs qui écrivaient les masques d'une cliente), la
   cliente choisie seulement dans Ma Couronne. */
import { readFileSync } from 'node:fs';

let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
};
const sansCommentaires = (f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const page = sansCommentaires('src/apps/trone/routes/clients/Vitrine.tsx');
const site = sansCommentaires('src/apps/trone/routes/clients/VitrineSite.tsx');
const nav = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');

dit('trois onglets : le site public, Ma Couronne, la carte du comptoir', true,
  /value: 'site', label: 'Le site public'/.test(page) && /value: 'couronne', label: 'Ma Couronne'/.test(page) && /value: 'comptoir', label: 'La carte du comptoir'/.test(page));
dit('le miroir est retire (plus d Apercu)', false, /function Apercu\(|<Apercu /.test(page));
dit('le site n a que sa propre portee', true, /<CatalogueEnVitrine portees=\{\['site'\]\} \/>/.test(page));
dit('Ma Couronne regle pour toutes et pour une cliente, jamais le site', true, /portees=\{\['maison', 'cliente'\]\}/.test(page));
dit('les formules ne paraissent jamais sous le site', true, /\{portee !== 'site' && \(<>/.test(page));
dit('la cliente se choisit dans Ma Couronne seulement', true,
  /function VitrineCouronne\(\)[\s\S]*Voir et régler pour une cliente/.test(page) && !/Qui est devant le miroir/.test(page));
dit('le site montre son etat, ses offres, sa reservation, ce qui en revient, ses pages', true,
  ['Les offres sur le site', 'La réservation en ligne', 'Ce qui revient du site', 'Les pages du site', 'Le lien et le QR du site'].every((t) => site.includes(t)));
dit('le site ne touche ni Ma Couronne ni la tablette (il ne les ecrit pas)', false, /vitrineConfigStore\.set|clientsStore\.set/.test(site));
dit('le menu dit « Les vitrines »', true, /path: '\/vitrine', label: 'Les vitrines'/.test(nav));

/* LES CODES DE LA MAISON — 4 octobre 2026 : « plus de facilité pour retrouver
   les codes ». Une recherche, des filtres par moment, un présentoir de tuiles
   avec UN geste ; la fiche complète s'ouvre à part. */
const qr = sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx');
dit('les codes se cherchent et se filtrent par moment', true,
  /placeholder="Chercher un code : momo, wifi, avis, prix, adresse…"/.test(qr) && /'avant'.*'pendant'.*'depart'.*'longtemps'.*'equipe'/s.test(qr) && /a-renseigner/.test(qr));
dit('chaque tuile a un seul geste principal, la fiche complete s ouvre a part', true,
  /<Modal title=\{ouvert\.carte\.nom\}/.test(qr) && /<CarteCode \{\.\.\.ouvert\.carte\} \/>/.test(qr) && !/<Moment\s/.test(qr));

console.log(ko === 0 ? '\nLes trois vitrines tiennent separees.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
