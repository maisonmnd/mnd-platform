/* L'ACADÉMIE, ÉPROUVÉE — `node scripts/verifie-academie.mjs`.

   « Ajoute des toggles up and down pour modifier les positions des titres »
   (Yéman, 16 septembre 2026). Réordonner un module est un geste d'une
   seconde ; la faute qu'il peut coûter est silencieuse : une séance et une
   note ne connaissent leur module que par son rang, et glisseraient vers le
   module d'à côté. */
import { realigneLesModules, type Enrollment } from '../src/apps/trone/routes/equipe/academy';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const ANCIENS = ['La naissance', 'La restauration', 'La couleur végétale', 'Le défaisage'];

const inscription = (o: Partial<Enrollment> = {}): Enrollment => ({
  id: 'e1', learnerName: 'A. B.', formationId: 'fo1', status: 'active' as Enrollment['status'], createdAt: '2026-09-01',
  sessions: [
    { id: 's1', moduleIndex: 0, sessionNumber: 1, scheduledAt: '2026-09-02' },
    { id: 's2', moduleIndex: 2, sessionNumber: 2, scheduledAt: '2026-09-09' },
    { id: 's3', sessionNumber: 3, scheduledAt: '2026-09-16' },
  ] as Enrollment['sessions'],
  practice: [],
  evaluations: [
    { id: 'v1', moduleIndex: 2, attempt: 1 },
    { id: 'v2', moduleIndex: 3, attempt: 1 },
  ] as Enrollment['evaluations'],
  ...o,
});

/* ── ON REMONTE « LA COULEUR VÉGÉTALE » EN TÊTE ────────────────────── */
const remonte = ['La couleur végétale', 'La naissance', 'La restauration', 'Le défaisage'];
const r = realigneLesModules(inscription(), ANCIENS, remonte);
dit('la séance suit son module par son nom', [1, 0, undefined], r.sessions.map((s) => s.moduleIndex));
dit('la note aussi', [0, 3], r.evaluations.map((v) => v.moduleIndex));
dit('la séance sans module reste sans module', false, 'moduleIndex' in r.sessions[2]);

/* ── RIEN NE BOUGE : LE MÊME OBJET REVIENT ─────────────────────────── */
const meme = inscription();
dit('un parcours inchangé rend le même dossier', true, realigneLesModules(meme, ANCIENS, [...ANCIENS]) === meme);

/* ── UN MODULE RETIRÉ ──────────────────────────────────────────────── */
const sansCouleur = ['La naissance', 'La restauration', 'Le défaisage'];
const s = realigneLesModules(inscription(), ANCIENS, sansCouleur);
dit('la séance du module retiré perd son module', [0, undefined, undefined], s.sessions.map((x) => x.moduleIndex));
/* ON N'EFFACE PAS UNE NOTE : elle sort seulement de tout rang. */
dit('la note du module retiré reste, hors de tout rang', [-1, 2], s.evaluations.map((v) => v.moduleIndex));
dit('… et le nombre de notes ne change pas', 2, s.evaluations.length);

/* ── UN MODULE AJOUTÉ AU MILIEU ────────────────────────────────────── */
const avecAjout = ['La naissance', 'Le calibre', 'La restauration', 'La couleur végétale', 'Le défaisage'];
dit('un module ajouté décale les suivants sans les perdre', [0, 3],
  realigneLesModules(inscription(), ANCIENS, avecAjout).sessions.map((x) => x.moduleIndex).slice(0, 2));

/* ── UN RANG HORS DE L'ANCIEN PARCOURS NE SE DEVINE PAS ────────────── */
const casse = inscription({ sessions: [{ id: 's9', moduleIndex: 7, sessionNumber: 1, scheduledAt: '2026-09-02' }] as Enrollment['sessions'] });
dit('une donnée déjà cassée reste telle quelle', 7, realigneLesModules(casse, ANCIENS, remonte).sessions[0].moduleIndex);

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nL’Académie tient.');
