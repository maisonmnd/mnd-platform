/* LE COFFRE DES CERTIFICATS, ÉPROUVÉ — `node scripts/verifie-certificats.mjs`.

   Le chemin d'un certificat au coffre et le nom de son fichier se déduisent
   du numéro et du nom de l'apprenant : un numéro vide, un nom accentué, un
   identifiant douteux ne doivent jamais donner un chemin qui casse, ni deux
   fichiers pour un seul papier. */
import {
  numeroPropre, nomPropre, dossierPropre, nomDuFichierCertificat, cheminDuCertificat, copiesTriees,
} from '../src/shared/certificats-coffre';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LE NUMÉRO ET LE NOM, PROPRES ─────────────────────────────── */
dit('un numéro de la Maison reste tel quel', 'MND-AC-2026-0001', numeroPropre('MND-AC-2026-0001'));
dit('un numéro vide se dit', 'sans-numero', numeroPropre('   '));
dit('un numéro fantaisiste se borne', 'n-12-b', numeroPropre(' n° 12 / b '));
dit('le nom perd ses accents et ses espaces', 'Vioutou-Raimath-Bonou', nomPropre('Vioutou Raïmath Bonou'));
dit('un nom vide se dit', 'apprenant', nomPropre(''));
dit('un identifiant d’inscription garde lettres, chiffres, tirets', 'abc-123_x', dossierPropre(' abc-123_x/../'));

/* ── ② LE FICHIER ET LE CHEMIN ──────────────────────────────────── */
dit('le fichier téléchargé porte le nom puis le numéro',
  'Certificat-MND-Vioutou-Raimath-Bonou-MND-AC-2026-0001.pdf', nomDuFichierCertificat('Vioutou Raïmath Bonou', 'MND-AC-2026-0001'));
dit('le chemin au coffre : un dossier par inscription, un fichier par numéro',
  'ins-42/MND-AC-2026-0001.pdf', cheminDuCertificat('ins-42', 'MND-AC-2026-0001'));
dit('le même numéro donne le même chemin : la copie se remplace, elle ne se double pas',
  true, cheminDuCertificat('ins-42', 'MND-AC-2026-0001') === cheminDuCertificat('ins-42', ' MND-AC-2026-0001 '));

/* ── ③ CE QUE LE COFFRE RANGE ───────────────────────────────────── */
const listing = [
  { name: 'MND-AC-2026-0001.pdf', updated_at: '2026-09-16T10:00:00Z', metadata: { size: 300 } },
  { name: 'MND-AC-2026-0002.pdf', updated_at: '2026-09-16T12:00:00Z', metadata: { size: 400 } },
  { name: 'brouillon.txt', updated_at: '2026-09-16T13:00:00Z', metadata: { size: 10 } },
  { name: 'sous-dossier', updated_at: null, created_at: null, metadata: null },
];
const copies = copiesTriees('ins-42', listing);
dit('seuls les PDF comptent, la plus récente d’abord',
  ['ins-42/MND-AC-2026-0002.pdf', 'ins-42/MND-AC-2026-0001.pdf'], copies.map((c) => c.chemin));
dit('chaque copie dit quand elle a été déposée', '2026-09-16T12:00:00Z', copies[0].deposeLe);
dit('un coffre vide ne rend rien', [], copiesTriees('ins-42', []));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
