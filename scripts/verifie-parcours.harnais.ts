/* LES PARCOURS DE L'ACADÉMIE, ÉPROUVÉS — `node scripts/verifie-parcours.mjs`.

   Poser deux fois les neuf parcours en ferait dix-huit, dont neuf jumeaux, et
   il faudrait les démêler un par un dans une liste qui porte déjà des
   inscriptions. */
import { PARCOURS_MND, parcoursParId, parcoursAPoser } from '../src/shared/parcours';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LES NEUF SONT LÀ, ET COMPLETS ───────────────────────────────
   Un champ vide ne se voit qu'une fois le certificat imprimé. */
dit('neuf parcours', 9, PARCOURS_MND.length);
dit('aucun creux', 0, PARCOURS_MND.filter((p) => !p.id || !p.titre || !p.niveau || !p.duree
  || !p.competences || !p.semaines || !p.seances).length);
dit('des identifiants uniques', 9, new Set(PARCOURS_MND.map((p) => p.id)).size);
dit('des titres uniques', 9, new Set(PARCOURS_MND.map((p) => p.titre)).size);
dit('les trois paliers y sont', 3,
  PARCOURS_MND.filter((p) => p.niveau.startsWith('Palier')).length);
dit('on retrouve un parcours par son nom', 'Affirmation', parcoursParId('affirmation')?.titre);
dit('un identifiant inconnu ne rend rien', undefined, parcoursParId('x'));

/* ── ② ON NE POSE QUE CE QUI MANQUE ────────────────────────────────
   Reposer les neuf sur une Académie qui en porte trois en ferait douze. */
dit('sur une Académie vide, les neuf', 9, parcoursAPoser([]).length);
dit('celle qui est là ne se repose pas', 8,
  parcoursAPoser([{ name: 'Affirmation' }]).length);
dit('… et c’est bien celle-là qui manque en moins', false,
  parcoursAPoser([{ name: 'Affirmation' }]).some((p) => p.id === 'affirmation'));
dit('toutes posées, plus rien à faire', 0,
  parcoursAPoser(PARCOURS_MND.map((p) => ({ name: p.titre }))).length);

/* LA COMPARAISON SE FAIT SUR LE NOM APLATI. La Maison a pu écrire « L'Oeuvre »
   là où la référence dit « L'Œuvre » : deux graphies d'un même parcours restent
   un seul parcours, et le reposer en ferait un doublon. */
dit('l’apostrophe droite ne trompe pas', false,
  parcoursAPoser([{ name: "Maitre MND" }]).some((p) => p.id === 'maitre'));
dit('la casse non plus', false,
  parcoursAPoser([{ name: 'AFFIRMATION' }]).some((p) => p.id === 'affirmation'));
dit('les espaces autour non plus', false,
  parcoursAPoser([{ name: '  Fondation  ' }]).some((p) => p.id === 'fondation'));
/* UNE FORMATION MAISON NE BLOQUE RIEN : elle ne porte aucun de ces noms. */
dit('une formation à elle ne gêne pas', 9,
  parcoursAPoser([{ name: 'Atelier du samedi' }]).length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
