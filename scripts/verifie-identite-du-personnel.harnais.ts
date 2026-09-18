/* LA PIÈCE D'IDENTITÉ DU PERSONNEL, ÉPROUVÉE — `node scripts/verifie-identite-du-personnel.mjs`.

   « Un espace réservé dans la fiche du personnel avec sa carte d'identité,
   exactement comme pour les prestataires » (Yéman, 18 septembre 2026).

   La porte est en base (0099) et elle lit LE CHEMIN : un deuxième segment
   `identite` = direction seule, `pieces` = tout le personnel. Se tromper de
   chemin ouvrirait une carte d'identité à toute l'équipe, sans erreur ni
   bruit. C'est ce que ce harnais garde. */
import {
  cheminDeLaPiece, dossierDeLIdentiteDuPersonnel, nomSansJeton,
} from '../src/shared/engagements-coffre';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* `storage.foldername(name)` de Postgres : les dossiers, sans le fichier. */
const dossiersDe = (chemin: string) => chemin.split('/').slice(0, -1);

const FICHE = 'k3f9a2mxq1';
const dossier = dossierDeLIdentiteDuPersonnel(FICHE);
/* Ce que `deposeLIdentiteDuPersonnel` écrit : le dossier du personnel. */
const [racine, , fiche] = dossier.split('/');
const depot = cheminDeLaPiece(racine, fiche, 'identite', 'Carte d’identité recto verso.jpg', 'ab12cd34ef');

dit('① la carte du personnel porte « identite » en deuxième dossier : direction seule',
  'identite', dossiersDe(depot)[1]);
dit('② et c’est bien la même règle que la carte d’un prestataire',
  dossiersDe(cheminDeLaPiece('b1', 'eng1', 'identite', 'x.jpg', 't'))[1], dossiersDe(depot)[1]);
dit('③ ce qu’on dépose est dans le dossier qu’on relit',
  true, depot.startsWith(`${dossier}/`));
dit('④ un seul niveau sous la fiche : la liste du dossier la trouve',
  dossier, dossiersDe(depot).join('/'));
dit('⑤ deux fiches, deux dossiers', false,
  dossierDeLIdentiteDuPersonnel('a1') === dossierDeLIdentiteDuPersonnel('a2'));
dit('⑥ le nom se nettoie mais reste lisible',
  'ab12cd34ef-Carte-d-identite-recto-verso.jpg', depot.split('/').pop());
dit('⑦ et se relit sans le jeton de dépôt',
  'Carte-d-identite-recto-verso.jpg', nomSansJeton(depot.split('/').pop()!));
dit('⑧ un nom sans jeton ne se mutile pas', 'carte.jpg', nomSansJeton('carte.jpg'));

/* ── Les engagements n'ont pas bougé ─────────────────────────────── */
dit('⑨ un devis de prestataire reste lisible par toute l’équipe',
  'b1/pieces/eng1/t-devis.pdf', cheminDeLaPiece('b1', 'eng1', 'devis', 'devis.pdf', 't'));
dit('⑩ la carte d’un prestataire reste à la direction',
  'b1/identite/eng1/t-carte.jpg', cheminDeLaPiece('b1', 'eng1', 'identite', 'carte.jpg', 't'));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
