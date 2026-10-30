/* LA COULEUR SUR LE SITE, ÉPROUVÉE — `node scripts/verifie-la-couleur-du-site.mjs`.

   « En ligne, la couleur n'est pas évidente, on ne voit pas ses services »
   (Yéman, 30 octobre 2026). Maquette 8BpT93dX…, au sélecteur : une page à
   elle, une ligne « Une couleur ? » sous les tuiles, une carte sans photo
   sur l'accueil.

   Ce que le banc tient : la famille YÈKPÈ™ se dit couleur quel que soit son
   nom au catalogue (« La Lumière ») ; la page lit ses gestes au catalogue,
   un par geste, dans l'ordre Couleur, Éclat, Lumière, sans la couleur
   apportée ni ce que le site masque, avec la grille par longueur ; la
   réservation a sa porte et lit `?famille=couleur` ; la page, l'accueil et
   le pied de page y mènent. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { groupesDePrestations, type AgendaDeLaMaison, type PrestationPublique } from '../src/apps/revelateur/agenda';
import { ceQueLaCouleurOffre, gestesDeLaCouleurPourLaPage } from '../src/apps/revelateur/couleur-pure';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`);
};

/* Le catalogue de la couleur tel qu'il est en base le 26 octobre 2026. */
const CATEGORIES = [
  { id: 'atl-ii-gbeji', label: 'La Vie' },
  { id: 'cat-lavages', label: 'Les lavages rituels', parentId: 'atl-ii-gbeji' },
  { id: 'atl-iii-yekpe', label: 'La Lumière', fon: 'YÈKPÈ™' },
];
const S = (id: string, name: string, categoryId: string, o: Partial<PrestationPublique> = {}): PrestationPublique => ({ id, name, categoryId, durationMin: 60, priceXof: 10000, ...o });
const SERVICES: PrestationPublique[] = [
  S('lav', 'KLƆKLƆ™ Essentiel · Le Souffle', 'cat-lavages'),
  S('ancien', 'YÈKPÈ™ Couleur', 'atl-iii-yekpe', { priceXof: 10000, prixParLongueur: { court: 10000, 'mi-long': 15000, long: 20000 } }),
  S('lum', 'YÈKPÈ™ Lumière · La Brillance Signature', 'atl-iii-yekpe', { priceXof: 15000 }),
  S('ecl', 'YÈKPÈ™ Éclat · Le Raviveur de Couleur · Court', 'atl-iii-yekpe', { priceXof: 5000 }),
  S('cou', 'YÈKPÈ™ Couleur · La Révélation Végétale', 'atl-iii-yekpe', { priceXof: 15000, prixParLongueur: { court: 15000, 'mi-long': 20000 } }),
  S('apportee', 'YÈKPÈ™ avec votre couleur · couleur apportée', 'atl-iii-yekpe', { priceXof: 8000 }),
  S('masquee', 'YÈKPÈ™ Sublimation · Masquée au site', 'atl-iii-yekpe', { priceXof: 99000 }),
];
const agenda = { categories: CATEGORIES, services: SERVICES, masques: { services: ['masquee'], categories: [] } } as unknown as AgendaDeLaMaison;

/* ── 1. La famille se dit couleur ─────────────────────────────────── */
const groupes = groupesDePrestations(agenda, SERVICES.filter((s) => s.id !== 'masquee'), 'entretien');
const coul = groupes.find((g) => g.id === 'atl-iii-yekpe');
dit('la famille YÈKPÈ (« La Lumière » au catalogue) se dit couleur, et se reconnaît comme telle',
  ['La couleur végétale · La Lumière', true], [coul?.titre, coul?.couleur]);
dit('un lavage n est pas la couleur', [false], groupes.filter((g) => g.id === 'cat-lavages').map((g) => g.couleur));
const renommee = groupesDePrestations({ ...agenda, categories: [{ id: 'atl-iii-yekpe', label: 'Coloration' }] } as unknown as AgendaDeLaMaison, SERVICES.slice(1, 3), 'entretien');
dit('un nom qui dit deja la couleur reste tel quel', 'Coloration', renommee[0]?.titre);

/* ── 2. Ce que la couleur offre, en mots simples ──────────────────── */
dit('la porte « Une couleur ? » dit ses gestes, dans leur ordre, sans la couleur apportee',
  'Couleur végétale, raviver la couleur et brillance des locks', ceQueLaCouleurOffre(SERVICES));

/* ── 3. La page lit ses gestes au catalogue ───────────────────────── */
const page = gestesDeLaCouleurPourLaPage(agenda);
dit('la page : Couleur, Eclat, Lumiere ; un par geste ; ni apportee ni masquee',
  ['cou', 'ecl', 'lum'], page.map((g) => g.id));
dit('la Couleur garde sa grille par longueur ; les autres leur prix',
  [[{ longueur: 'court', xof: 15000 }, { longueur: 'mi-long', xof: 20000 }], [{ xof: 5000 }], [{ xof: 15000 }]], page.map((g) => g.prix));
const masque = gestesDeLaCouleurPourLaPage({ ...agenda, services: [S('h', 'YÈKPÈ™ Lumière · Cachée', 'atl-iii-yekpe', { priceMode: 'fixe', hidePrice: true })] } as unknown as AgendaDeLaMaison);
dit('un prix masque ne se dit pas', [[]], masque.map((g) => g.prix));

/* ── 4. Le cablage : la reservation, la page, l accueil, le pied ──── */
const racine = path.resolve(import.meta.dirname ?? '.', '..');
const panne = process.env.COULEUR_PANNE ? JSON.parse(process.env.COULEUR_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lis = (f: string): string => {
  const t = readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
  return panne && panne.fichier === f ? t.replace(panne.avant, panne.apres) : t;
};
const reserver = lis('src/apps/revelateur/ilots/Reserver.tsx');
const contenu = lis('src/apps/revelateur/contenu.ts');
const generateur = lis('scripts/genere-revelateur.mjs');
dit('la reservation : la porte « Une couleur ? » sous les tuiles ouvre la couleur seule', true,
  reserver.includes('{groupeDeLaCouleur && (') && reserver.includes('onClick={() => { setLaCouleur(true); setComposer(true); setRepondu(false); setRang(0); }}'));
dit('la reservation lit ?famille=couleur', true, reserver.includes(".get('famille') === 'couleur'") && reserver.includes('useState(laCouleurDeLAdresse)'));
dit('la couleur seule ne demande pas le nombre de locks', true, reserver.includes('const demandeLeCalibre = !consultation && !(laCouleur && groupeDeLaCouleur) && bandes.length > 0'));
dit('la page /couleur-locks/ existe, son bouton ouvre la couleur', true,
  contenu.includes("chemin: '/couleur-locks/'") && contenu.includes("cta: { texte: 'Réserver ma couleur', note: 'Se réserve directement, sans consultation.', famille: 'couleur' }"));
dit('le generateur porte la famille jusqu au lien de reservation', true, generateur.includes('versLaReservation(p.besoin, p.cta.famille)'));
dit('le generateur ecrit les gestes de la couleur et le nuancier', true, generateur.includes("${p.couleur ? rendLaCouleur(p.couleur) : ''}") && generateur.includes(': c.nuancier ? NUANCIER :'));
dit('l accueil a sa carte Couleur vegetale, le pied de page son lien', true,
  contenu.includes("{ titre: 'Couleur végétale', pour: 'Ma couleur'") && contenu.includes("{ texte: 'Couleur végétale', vers: '/couleur-locks/' }"));

console.log(ko === 0 ? '\nLa couleur se voit sur le site.' : `\n${ko} ECHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
