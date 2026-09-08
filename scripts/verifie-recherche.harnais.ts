/* LA RECHERCHE D'UNE PRESTATION, ÉPROUVÉE — `node scripts/verifie-recherche.mjs`.

   La barre de recherche ne vaut que si la frappe RÉELLE trouve : sans accents,
   sans ™, avec les lettres fon tapées au clavier français. Chaque cas ici est
   une frappe qu'une main du salon fera vraiment. */
import { clefDeRecherche, prestationRepond } from '../src/shared/recherche';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LA CLEF : ce qui reste d'un nom ─────────────────────────────
   Le Ɔ fon devient o, le ™ et la ponctuation deviennent de l'air. */
dit('KLƆKLƆ™ se réduit à kloklo',
  'kloklo essentiel le shampoing le souffle',
  clefDeRecherche('KLƆKLƆ™ Essentiel · Le Shampoing « Le Souffle »'));
dit('les accents tombent', 'sinsin elaboree la reprise longue duree',
  clefDeRecherche('SÍNSIN™ Élaborée · La Reprise Longue Durée'));
dit('un texte fait de signes seuls devient vide', '', clefDeRecherche('™ · « » !'));

/* ── ② LA FRAPPE DU SALON ──────────────────────────────────────────
   Personne ne tape Í ni Ɔ : la recherche doit répondre à la frappe nue. */
dit('« sinsin » trouve SÍNSIN™', true,
  prestationRepond('SÍNSIN™ Élaborée · La Reprise Longue Durée', 'sinsin'));
dit('« kloklo » trouve KLƆKLƆ™', true,
  prestationRepond('KLƆKLƆ™ Signature · Le Shampoing « L’Ancrage »', 'kloklo'));
dit('« vekpe » trouve VÈKPÈ™', true,
  prestationRepond('VÈKPÈ™ Kids · La Première Couronne', 'vekpe'));
dit('les majuscules de la saisie ne comptent pas', true,
  prestationRepond('Styling · sortie soignée', 'STYLING'));
/* Et la main qui tape AVEC ses accents ne doit pas être punie non plus. */
dit('une saisie accentuée trouve aussi', true,
  prestationRepond('VÈKPÈ™ Kids · La Première Couronne', 'vèkpé'));

/* ── ③ PLUSIEURS MOTS, ORDRE LIBRE ─────────────────────────────────
   On se souvient de « reprise » et de « sinsin », pas de l'ordre du menu. */
dit('« reprise sinsin » trouve, dans le désordre', true,
  prestationRepond('SÍNSIN™ Élaborée · La Reprise Longue Durée', 'reprise sinsin'));
dit('chaque mot doit répondre — un intrus élimine', false,
  prestationRepond('SÍNSIN™ Essentielle · La Reprise', 'reprise gbigbi'));

/* ── ④ LES BORDS ───────────────────────────────────────────────────
   Ne rien chercher, c'est tout voir : la barre vide n'élimine personne. */
dit('saisie vide : tout répond', true,
  prestationRepond('KÒKÒ™ Origine · Première couronne', ''));
dit('saisie de signes seuls : tout répond aussi', true,
  prestationRepond('KÒKÒ™ Origine · Première couronne', ' · '));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
