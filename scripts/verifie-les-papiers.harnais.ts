/* LES PAPIERS DE LA MAISON — le harnais. 6 octobre 2026.

   Ce qu'il tient, et qui ne doit jamais casser en silence :
   1. LES DATES : la durée proposée d'un papier (un 31 qui tombe dans un mois
      court recule au dernier jour) ; rien n'est proposé sans durée connue.
   2. L'ÉTAT : à jour, bientôt (30 jours, 60 pour un passeport), expirée.
   3. CE QUI MANQUE à une entreprise et à une personne.
   4. LE DOSSIER dit ce qui manque ou expire AVANT le guichet ; la marque est
      obligatoire dès qu'un papier d'une personne part ; elle ne porte que du
      latin (une lettre hors du jeu des polices du PDF est retirée).
   5. LES VERSIONS : remplacer garde l'ancienne ; le journal reste borné.
   6. LA BASE (0117) : la direction seule, table et compartiment ; tracée.
   7. RIEN SUR L'APPAREIL : le module ne passe ni par le magasin ni par la
      synchro, n'écrit pas dans le stockage du navigateur, et n'ouvre un
      fichier que par un lien d'une minute ; le service hors ligne ne garde
      rien qui vienne d'une autre origine.
   8. L'ÉCRAN : l'onglet et le rappel sont à la direction seule ; la marque
      ne se décoche pas quand elle est obligatoire. */
import { readFileSync } from 'node:fs';
import {
  ajouteAuJournal, aRenouveler, cheminDuFichier, completude, etatDe, expirationProposee, JOURNAL_MAX, typeDuFichier,
  lignesDuDossier, manquantsDe, marqueObligatoire, numeroDouteux, remplace, texteDeLaMarque, type Papier,
} from '../src/shared/papiers-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sql = readFileSync('supabase/migrations/0117_les_papiers.sql', 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

const piece = (o: Partial<Papier>): Papier => ({
  id: 'p', genre: 'papier', branchId: 'b', titulaire: 'ent:mnd', type: 'rccm', numero: '', delivreLe: '', expireLe: '',
  original: '', note: '', pages: [], versions: [], deposeLe: '2026-10-06T10:00:00Z', deposePar: 'Y', journal: [], ...o,
});

/* ── 1. LES DATES ── */
dit('un certificat de residence : trois mois, et le 31 recule au dernier jour du mois', ['2026-04-30', '2026-04-15'],
  [expirationProposee('residence', '2026-01-31'), expirationProposee('residence', '2026-01-15')]);
dit('une attestation fiscale : l annee', '2027-03-02', expirationProposee('arf', '2026-03-02'));
dit('rien n est propose sans duree connue ni sans date', ['', '', ''],
  [expirationProposee('cni', '2026-01-01'), expirationProposee('rccm', '2026-01-01'), expirationProposee('residence', '')]);

/* ── 2. L'ÉTAT ── */
const J = '2026-10-06';
dit('sans expiration, a jour ; 31 j, a jour ; 30 j, bientot ; hier, expiree', ['ok', 'ok', 'bientot', 'expire'], [
  etatDe({ type: 'rccm', expireLe: '' }, J), etatDe({ type: 'cni', expireLe: '2026-11-06' }, J),
  etatDe({ type: 'cni', expireLe: '2026-11-05' }, J), etatDe({ type: 'cni', expireLe: '2026-10-05' }, J),
]);
dit('un passeport previent 60 jours avant', ['bientot', 'ok'],
  [etatDe({ type: 'passeport', expireLe: '2026-12-01' }, J), etatDe({ type: 'cni', expireLe: '2026-12-01' }, J)]);
const parc = [piece({ id: 'a', type: 'residence', titulaire: 'pers:y', expireLe: '2026-10-20' }), piece({ id: 'b', type: 'cni', titulaire: 'pers:y', expireLe: '2026-01-01' }), piece({ id: 'c' })];
dit('a renouveler : expirees d abord, puis bientot ; les pieces a jour n y sont pas', ['b', 'a'], aRenouveler(parc, J).map((p) => p.id));

/* ── 3. CE QUI MANQUE ── */
dit('une entreprise avec son RCCM attend encore IFU, statuts, ARF, CNSS', [['ifu', 'statuts', 'arf', 'cnss'], { faits: 1, attendus: 5 }],
  [manquantsDe(parc, 'ent:mnd').map((t) => t.cle), completude(parc, 'ent:mnd')]);
dit('une personne avec carte et residence attend passeport et casier', ['passeport', 'casier'], manquantsDe(parc, 'pers:y').map((t) => t.cle));

/* ── 4. LE DOSSIER ET LA MARQUE ── */
const banque = lignesDuDossier('banque', 'ent:mnd', 'pers:y', parc, J);
dit('le dossier banque dit ce qui manque et ce qui expire', [
  ['rccm', undefined], ['ifu', 'manque'], ['statuts', 'manque'], ['pv', 'manque'], ['cni', 'expire'], ['residence', 'bientot'],
], banque.map((l) => [l.type, l.alerte]));
dit('l apostrophe typographique devient une apostrophe, jamais un trou', "COPIE REMISE À BANQUE D'ÉPARGNE · 6 OCT. 2026 · USAGE UNIQUE", texteDeLaMarque('Banque d’épargne', '6 oct. 2026'));
dit('marque obligatoire des qu un papier d une personne part', [true, false],
  [marqueObligatoire([{ titulaire: 'ent:mnd' }, { titulaire: 'pers:y' }]), marqueObligatoire([{ titulaire: 'ent:mnd' }])]);
const marque = texteDeLaMarque('Banque ɖɛ Cotonou', '6 oct. 2026', 'ouverture de compte');
dit('la marque : majuscules, latin seulement, usage unique', ['COPIE REMISE À BANQUE COTONOU · 6 OCT. 2026 · OUVERTURE DE COMPTE · USAGE UNIQUE', false],
  [marque, /[^\u0020-\u007E\u00A0-\u00FF]/.test(marque)]);

/* ── 5. LES VERSIONS, LE JOURNAL, LES FICHIERS ── */
const ancienne = piece({ numero: 'A1', pages: [{ chemin: 'x/1.jpg', nom: '1.jpg', type: 'image/jpeg', taille: 1 }] });
const neuve = remplace(ancienne, { pages: [{ chemin: 'x/2.jpg', nom: '2.jpg', type: 'image/jpeg', taille: 1 }], numero: 'A2', delivreLe: '', expireLe: '' }, 'B', '2026-10-06T12:00:00Z');
dit('remplacer garde l ancienne version, et le dit au journal', [['A2', 'x/2.jpg'], ['A1', 'x/1.jpg', '2026-10-06T12:00:00Z'], 'nouvelle version déposée'],
  [[neuve.numero, neuve.pages[0]?.chemin], [neuve.versions[0]?.numero, neuve.versions[0]?.pages[0]?.chemin, neuve.versions[0]?.remplaceeLe], neuve.journal[0]?.quoi]);
let j: Papier['journal'] = [];
for (let i = 0; i < JOURNAL_MAX + 20; i += 1) j = ajouteAuJournal(j, { quand: String(i), qui: 'Y', quoi: 'vue' });
dit('le journal garde les cent dernieres lignes, la plus recente d abord', [JOURNAL_MAX, String(JOURNAL_MAX + 19)], [j.length, j[0].quand]);
dit('un chemin de fichier sans espace ni accent', 'pers-Yeman/pap-a1/1700-1.jpg', cheminDuFichier('pers:Yéman', 'pap a1', 1, 'JPG', 1700));
dit('un IFU qui n a pas 13 chiffres est signale, sans bloquer', [true, false, false],
  [numeroDouteux('ifu', '12345'), numeroDouteux('ifu', '3202 3000 00000'), numeroDouteux('rccm', '12')]);

/* ── 6. LA BASE (0117) ── */
const politique = (nom: string) => sql.slice(sql.indexOf(`create policy ${nom}`), sql.indexOf(';', sql.indexOf(`create policy ${nom}`)));
dit('la table : direction seule pour lire, ecrire, modifier, effacer', [true, true, true, true],
  ['papiers_lire', 'papiers_ecrire', 'papiers_modifier', 'papiers_effacer'].map((n) => /public\.est_direction\(\)/.test(politique(n)) && !/is_staff/.test(politique(n))));
dit('le compartiment : prive, et direction seule', [true, true, true, true, true], [
  sql.includes("values ('papiers', 'papiers', false"),
  ...['papiers_fichiers_lire', 'papiers_fichiers_deposer', 'papiers_fichiers_remplacer', 'papiers_fichiers_retirer']
    .map((n) => /bucket_id = 'papiers' and public\.est_direction\(\)/.test(politique(n))),
]);
dit('la table est protegee et tracee', [true, true], [
  sql.includes('alter table public.papiers enable row level security'),
  /create trigger trace_le_geste after insert or update or delete on public\.papiers/.test(sql),
]);

/* ── 7. RIEN SUR L'APPAREIL ── */
const module = sansCommentaires('src/shared/papiers.ts');
dit('ni magasin ni synchro ni stockage du navigateur', [false, false, false],
  [/createStore|bindCollection/.test(module), /localStorage|sessionStorage|indexedDB/.test(module), /from '\.\/sync'/.test(module)]);
dit('lire le classeur a une limite de temps (quinze secondes)', [true, true], [/export const DELAI_DE_LECTURE_MS = 15000;/.test(module), /Promise\.race\(\[lecture, delai\]\)/.test(module)]);
dit('un fichier ne s ouvre que par un lien d une minute', [true, false],
  [/createSignedUrl\(chemin, 60\)/.test(module), /getPublicUrl/.test(module)]);
const sw = readFileSync('public/sw.js', 'utf8');
dit('le service hors ligne ne garde rien d une autre origine', true, /if \(url\.origin !== self\.location\.origin \|\|[^\n]*\) return;/.test(sw));

/* ── 8. L'ÉCRAN ── */
const page = sansCommentaires('src/apps/trone/routes/pilotage/Secretariat.tsx');
dit('l onglet des papiers est a la direction seule', [true, true], [
  page.includes("const vueDesPapiers = onglet === 'papiers' && direction;"),
  /\{direction && \(\s*<div className="sec-onglets"/.test(page),
]);
const ecran = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Papiers.tsx');
dit('la marque ne se decoche pas quand elle est obligatoire, et part avec le dossier', [true, true, true], [
  ecran.includes('const avecMarque = obligatoire || marque;'),
  ecran.includes('disabled={obligatoire}'),
  ecran.includes('marque: avecMarque ? texteDeLaMarque('),
]);
dit('le choix des fichiers est un vrai bouton, hors de toute etiquette', [true, false], [
  ecran.includes('onClick={() => entree.current?.click()}'),
  /<Field[^>]*>\s*<ChoixDesFichiers/.test(ecran),
]);
const aFaire = sansCommentaires('src/apps/trone/routes/pilotage/AFaire.tsx');
dit('le rappel d A faire est a la direction seule', true, aFaire.includes('{estDirection && <RappelDesPapiers'));

/* ── 9. AU TÉLÉPHONE — 6 octobre 2026 (« sur les portables je ne peux pas
   enregistrer un document, ça dit : pas de réseau ») ── */
dit('le type se devine par l extension (Android donne parfois un type vide), un HEIC est accepte pour conversion',
  ['application/pdf', 'image/heic', 'image/jpeg', '', 'image/png'],
  [typeDuFichier('Scan.PDF', ''), typeDuFichier('IMG_1.HEIC', ''), typeDuFichier('photo.jpg', 'image/jpeg'), typeDuFichier('lettre.docx', ''), typeDuFichier('x', 'image/png')]);
dit('le fichier est lu en memoire des qu on le choisit, pas a l envoi', [true, true], [
  /export async function copieEnMemoire\(f: File\)[\s\S]{0,400}await f\.arrayBuffer\(\)/.test(module),
  /const r = await copieEnMemoire\(f\);/.test(ecran),
]);
dit('une panne pendant un enregistrement ne se dit plus « ne se lisent qu en ligne »', [true, true], [
  /geste === 'lire'\s*\?\s*'Pas de réseau : les papiers ne se lisent qu’en ligne\.'\s*:\s*`La pièce n’a pas pu partir au serveur/.test(module),
  /erreur: `Page \$\{i \+ 1\} \(« \$\{f\.name\} »\) : \$\{lisible\(derniere, 'ecrire'\)\}`/.test(module),
]);
dit('chaque page est retentee trois fois', [true, true],
  [/export const ESSAIS_D_ENVOI = 3;/.test(module), /for \(let essai = 1; essai <= ESSAIS_D_ENVOI; essai \+= 1\)/.test(module)]);
dit('le bouton ne reste jamais sur « Envoi… »', true, /try \{ await gardeVraiment\(\); \} catch[\s\S]{0,200}finally \{ setEnvoi\(false\); \}/.test(ecran));

console.log(ko === 0 ? '\nLes papiers tiennent leurs regles.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
