/* LA REVUE DU 10 OCTOBRE 2026, LOT « ÉQUIPE ET DOCUMENTS » — le harnais.
   Lancé par `node scripts/verifie-revue-equipe-docs.mjs`.

   Ce qu'il tient, constat par constat (les numéros sont ceux de la revue) :
   82. LE DÉPÔT EST PUBLIC : aucun nom de la famille dans le code du dossier
       de bourse. Le demandeur, le second parent, le nom des enfants, leurs
       classes, l'école et la gérante sont des champs (crochets s'ils sont
       vides), le RCCM vient de la fiche NYM SARL. Les mots interdits ne sont
       PAS écrits ici, ni en empreintes (réversibles) : ils se lisent dans un
       fichier privé, hors dépôt (reprise du 10 octobre 2026).
   28. La migration 0122 ne nomme plus l'hébergeant, et les anciennes clés du
       dossier se reconnaissent à leur forme, jamais à son prénom.
   83. (relu : faux) L'acompte de l'Académie est recalculé par la base (0107) ;
       le banc tient ce verrou et se prouve lui-même sur une copie en mémoire.
   87. Le dossier remis refuse une page illisible au lieu de l'omettre, et le
       mot du refus nomme la pièce et la page à redéposer.
   91. Le bulletin imprimé retombe sur le net du run : compte courant,
       indemnités, et plus aucune valeur d'exemple sous un lien de l'ERP. La
       page bulletin.html est EXÉCUTÉE ici, sur un document simulé. Et plus
       aucun tiret cadratin dans ce qu'elle affiche (règle de la Maison).
   92. Renommer un module garde séances, notes et cases cochées à leur rang.
   93. Une demande du site devient une inscription sur la ligne RELUE, et une
       demande déjà inscrite est refusée. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CHAMPS, CLASSES, aJour, membresAJour, documentsDeLaCampagne, lis, rccmDe, campagneDe, quittance, reponsesAuFormulaire } from '../src/shared/bourse-pur';
import { assembleLeDossier, motDuRefus, PageIllisible } from '../src/shared/papiers';
import type { Papier } from '../src/shared/papiers-pur';
import { PAYROLL_PARAMETERS_SEED, bulletinHref, computePay, itsEstActif, tauxCnssSalarial, type PayDeductions, type PayGains } from '../src/apps/trone/routes/equipe/payroll';
import { inscriptionDepuisDemande, modulesFaitsSuivent, realigneLesModules, type Enrollment } from '../src/apps/trone/routes/equipe/academy';
import type { DemandeAcademie } from '../src/shared/academie-demandes';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lisLe = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (f: string) => lisLe(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}');
const sansCommentairesSql = (s: string) => s.replace(/--.*$/gm, '');

/* ══ 82 · 28 · LES NOMS DE LA FAMILLE ══════════════════════════════════ */

/* LA LISTE DES MOTS VIT HORS DU DÉPÔT (10 octobre 2026, reprise de la revue).
   La première version comparait des empreintes sha256 écrites ici, avec leur
   sel et le rôle de chacune : quelques prénoms essayés suffisaient à les
   retourner, et le banc republiait sous une forme réversible ce que le lot
   venait de retirer. Il ne garde donc ici que la FORME (aucun défaut
   nominatif, aucune phrase figée, aucun mot recomposé) ; les mots eux-mêmes
   se lisent dans un fichier privé, posé sur le bureau à côté du script privé
   du dossier, ou au chemin donné par MND_MOTS_PRIVES. Sans ce fichier, le
   banc ÉCHOUE : un contrôle qui se tait faute de liste serait un contrôle
   mort. */
const CHEMIN_DES_MOTS = process.env.MND_MOTS_PRIVES || path.resolve('..', '..', 'Dossier de bourse - mots prives.txt');
const PORTEES = ['partout', 'bourse', 'hebergeant'] as const;
type Portee = (typeof PORTEES)[number];
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function lisLesMots(chemin: string): Record<Portee, string[]> | null {
  if (!existsSync(chemin)) return null;
  const out: Record<Portee, string[]> = { partout: [], bourse: [], hebergeant: [] };
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(partout|bourse|hebergeant)\s*:(.*)$/.exec(ligne);
    if (m) out[m[1] as Portee].push(...sansAccents(m[2]).split(/[^A-Z]+/).filter((x) => x.length >= 4));
  }
  return out;
}
/** Un mot se lit sans accents, en capitales, entre deux non-lettres. */
const motsDe = (texte: string): Set<string> => new Set(sansAccents(texte).split(/[^A-Z]+/).filter((m) => m.length >= 4));
const fautifs = (fichiers: string[], interdits: readonly string[]): string[] => fichiers.filter((f) => {
  let t = ''; try { t = readFileSync(f, 'utf8'); } catch { return false; }
  for (const m of motsDe(t)) if (interdits.includes(m)) return true;
  return false;
}).map((f) => f.split(path.sep).join('/'));

/* Ce que git publierait : les fichiers suivis, et les nouveaux non ignorés. */
const EXTENSIONS = /\.(ts|tsx|mjs|js|cjs|sql|md|html|py|json|css|txt|svg|yml|yaml|toml|sh)$/;
const publiables = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0').filter((f) => f && EXTENSIONS.test(f) && existsSync(f) && statSync(f).size < 8_000_000);
const MODULES_BOURSE = ['src/shared/bourse-pur.ts', 'src/shared/bourse.ts', 'src/apps/trone/routes/pilotage/secretariat/Bourse.tsx', 'src/apps/trone/routes/pilotage/secretariat/RappelDeLaBourse.tsx'];
const HARNAIS_BOURSE = ['scripts/verifie-la-bourse.harnais.ts', 'scripts/verifie-revue-equipe-docs.harnais.ts', 'scripts/verifie-revue-equipe-docs.mjs'];
/* Le type des membres du dossier vit dans secretariat-pur.ts, fichier d'une
   autre équipe ce 10 octobre : il porte encore l'ancienne clé. Il est dit
   à part (RESTE), sans faire échouer ce lot, jusqu'à ce que son lot le
   corrige (la forme des membres, juste en dessous, le dit aussi). */
const SECRETARIAT_PUR = 'src/shared/secretariat-pur.ts';

const mots = lisLesMots(CHEMIN_DES_MOTS);
dit('82 · la liste privee des mots est lue, hors du depot, ses trois portees remplies', [true, true, [true, true, true]],
  [mots !== null, !path.resolve(CHEMIN_DES_MOTS).startsWith(path.resolve('.') + path.sep), PORTEES.map((p) => (mots?.[p].length ?? 0) > 0)]);
if (mots) {
  dit('82 · ni la gerante, ni l ecole, ni le prenom du second parent dans ce que git publierait', [], fautifs(publiables, mots.partout));
  dit('82 · le dossier de bourse et ses harnais ne portent aucun nom de famille', [], fautifs([...MODULES_BOURSE, ...HARNAIS_BOURSE], [...mots.bourse, ...mots.hebergeant]));
  dit('28 · ni migration ni fonction du serveur ne nomme l hebergeant', [], fautifs(publiables.filter((f) => f.startsWith('supabase/')), mots.hebergeant));
  if (fautifs([SECRETARIAT_PUR], mots.hebergeant).length) console.log(`RESTE ${SECRETARIAT_PUR} nomme encore l hebergeant (type des membres, lot du secretariat)`);
}
/* LES CLASSES DES TROIS ENFANTS, ensemble, disent leur âge : le fichier privé
   les donne sur une ligne « trio: ». Une ligne du dossier ou de ses harnais
   qui les cite toutes, sans être la liste entière des classes, est fautive. */
const trio = existsSync(CHEMIN_DES_MOTS)
  ? (/^\s*trio\s*:(.*)$/m.exec(readFileSync(CHEMIN_DES_MOTS, 'utf8'))?.[1] ?? '').trim().split(/\s+/).filter(Boolean) : [];
const lignesDuTrio = [...MODULES_BOURSE, ...HARNAIS_BOURSE].flatMap((f) => lisLe(f).split('\n')
  .filter((l) => trio.every((k) => l.includes(`'${k}'`)) && !CLASSES.every((k) => l.includes(`'${k}'`)))
  .map(() => f));
dit('82 · le trio des classes est donne par la liste privee, et aucune ligne du dossier ne le cite', [3, []], [trio.length, lignesDuTrio]);
dit('82 · la liste couvre tout ce que git publierait, pages racine et docs compris', [true, true, true],
  [publiables.includes('bulletin.html'), publiables.some((f) => f.startsWith('docs/')), publiables.includes('scripts/verifie-revue-equipe-docs.harnais.ts')]);
/* La lecture se prouve sur un leurre (aucun vrai nom ici) : accents et casse
   n'y changent rien, un mot plus long qui le contient ne le déclenche pas.
   La preuve sur les vrais mots se fait hors dépôt. */
dit('28 · la comparaison voit un mot interdit, accents et casse compris', [true, false],
  [motsDe('M. Zörglüb, 12 rue X').has('ZORGLUB'), motsDe('M. Zorglubien').has('ZORGLUB')]);

/* La forme, sans aucun nom : les anciennes clés se reconnaissent sans le
   prénom, aucun mot n'est recomposé de morceaux, et les membres du dossier
   ne sont que des rôles. */
dit('28 · une ancienne cle se reconnait a sa forme, jamais a un prenom', [{ hebergeantTel: 'neuf', hebergeantAdresse: 'au lot 3', hebergeDepuis: '2012' }, 't1'],
  [aJour({ oncleAdresse: 'au lot 3', oncleTel: 'vieux', hebergeantTel: 'neuf', oncleDepuis: '2012' }), membresAJour({ oncle: 't1' }).hebergeant]);
const codeBourse = MODULES_BOURSE.map(sansCommentaires).join('\n');
dit('28 · aucun mot recompose de morceaux de chaines dans le code du dossier', false, /(['`])[A-Za-z]+\1\s*\+\s*(['`])[A-Za-z]+\2/.test(codeBourse));
const ROLES = ['yeman', 'brice', 'e1', 'e2', 'e3', 'hebergeant'];
const membresDuType = (/membres:\s*\{([^}]*)\}/.exec(sansCommentaires(SECRETARIAT_PUR))?.[1] ?? '').match(/\b\w+(?=\?:)/g) ?? [];
const horsRoles = membresDuType.filter((k) => !ROLES.includes(k));
if (horsRoles.length) console.log(`RESTE ${SECRETARIAT_PUR} : ${horsRoles.length} cle(s) de membres hors des roles (a retirer par le lot du secretariat)`);
const typeBourse = /export type Membres = \{([^}]*)\}/.exec(sansCommentaires('src/shared/bourse-pur.ts'))?.[1] ?? '';
dit('28 · les membres du dossier de bourse ne sont que des roles', ROLES, typeBourse.match(/\b\w+(?=\?:)/g) ?? []);

const SANS_DEFAUT = ['demandeur', 'demandeurPhrase', 'gerante', 'p2Nom', 'p2Prenoms', 'nomEnfants', 'famille', 'ecole', 'e1Classe2027', 'e2Classe2027', 'e3Classe2027'];
dit('82 · aucun champ nominatif n a de valeur par defaut', [], SANS_DEFAUT.filter((k) => CHAMPS.find((c) => c.cle === k)?.defaut !== undefined || !CHAMPS.some((c) => c.cle === k)));
dit('82 · vides, ils s ecrivent entre crochets', true, SANS_DEFAUT.every((k) => lis({}, k).startsWith('[')));

const c = campagneDe('2026-10-10');
const v = {
  demandeur: 'ESSAI épouse TEST Ada', demandeurPhrase: 'Mme Ada ESSAI épouse TEST', gerante: 'Mme R. ESSAI',
  p2Nom: 'TEST', p2Prenoms: 'Jean Paul', nomEnfants: 'TEST', famille: 'TEST · ESSAI', ecole: 'École d’essai, Cotonou',
  e1Prenom: 'Aïna', e2Prenom: 'Élie', e3Prenom: 'Noa', e1Classe2027: 'CP', e2Classe2027: 'CM1', e3Classe2027: '5e', logement: 'au lot 12, Cotonou',
};
const docs = documentsDeLaCampagne(v, c, 'M. X', 'RB/COT/00 B 0000 (ancien n° 0.000-B)');
const q = quittance(v, '2026-12', '06');
dit('82 · les quittances nomment les parents saisis', ['M. et Mme Jean TEST', true], [q.destinataire.split('\n')[0], q.corps.includes('reçu de M. et Mme Jean TEST, occupants')]);
dit('82 · l attestation NYM SARL dit le demandeur, les enfants, la gerante et le RCCM saisis', [true, true, true, true], [
  docs[1].corps.includes('· Mme Ada ESSAI épouse TEST, née le'), docs[1].corps.includes('Aïna TEST, Élie TEST, Noa TEST'),
  docs[1].corps.includes('gérante de la société, Mme R. ESSAI'), docs[1].corps.includes('sous le numéro RB/COT/00 B 0000 (ancien n° 0.000-B), atteste'),
]);
dit('82 · sans RCCM sur la fiche, l attestation garde ses crochets', true, documentsDeLaCampagne(v, c, 'M. X')[1].corps.includes('[numéro RCCM de NYM SARL]'));
dit('82 · le RCCM se lit dans les mentions de la fiche', ['RB/COT/00 B 0000 (ancien n° 0.000-B)', 'RB/COT/1', ''],
  [rccmDe('Société · RCCM RB/COT/00 B 0000 (ancien n° 0.000-B) · IFU 0000'), rccmDe('RCCM RB/COT/1'), rccmDe('IFU 1')]);
dit('82 · le formulaire nomme les enfants par le nom saisi, a la classe saisie', true,
  reponsesAuFormulaire(v, c).some((b) => b.lignes.some(([, r]) => r.startsWith('TEST Aïna · École d’essai, Cotonou · CP'))));
const ecran = sansCommentaires('src/apps/trone/routes/pilotage/secretariat/Bourse.tsx');
const bordereau = sansCommentaires('src/shared/bourse.ts');
dit('82 · l en-tete et le bordereau lisent le nom de la famille saisi', [true, true],
  [ecran.includes("`Famille ${lis(v, 'famille')}`"), bordereau.includes("`Famille ${lis(v, 'famille')}, Cotonou.")]);
dit('82 · un choix sans defaut s ouvre sur « A choisir », pas sur la premiere classe', true, ecran.includes('{!d.defaut && <option value="">À choisir…</option>}'));
dit('82 · le RCCM part de la fiche NYM SARL', true, bordereau.includes('rccmDe(nym.mentions)'));

/* ══ 83 · L'ACOMPTE DE L'ACADÉMIE, TENU PAR LA BASE ═══════════════════ */
const tientLAcompte = (sql: string): boolean => {
  const s = sansCommentairesSql(sql);
  return /create or replace function public\.academie_demande_nettoie\(\)/.test(s)
    && /select t\.prix_xof into prix from public\.academie_tarifs t where t\.parcours_id = new\.data->>'parcoursId'/.test(s)
    && /\|\| jsonb_build_object\('acompteXof', round\(prix \* 40 \/ 100\.0\)\)/.test(s)
    && /if prix is null then\s+raise exception/.test(s)
    && /create trigger academie_demandes_nettoie before insert or update on public\.academie_demandes/.test(s);
};
const m0107 = lisLe('supabase/migrations/0107_le_serveur_fixe_lacompte_de_lacademie.sql');
const apres0107 = readdirSync('supabase/migrations').filter((n) => /^\d{4}_.*\.sql$/.test(n) && n.slice(0, 4) > '0107').map((n) => sansCommentairesSql(lisLe(`supabase/migrations/${n}`))).join('\n');
dit('83 · 0107 recalcule prix et acompte depuis les tarifs, refuse un parcours inconnu', true, tientLAcompte(m0107));
dit('83 · aucune migration plus recente ne retire ce verrou', false,
  /drop (trigger|function)[^;]*academie_demande(s)?_nettoie|academie_demande_nettoie\(\)[\s\S]{0,40}returns trigger/.test(apres0107));
dit('83 · le controle crie si le recalcul disparait (copie en memoire)', false,
  tientLAcompte(m0107.replace("|| jsonb_build_object('acompteXof', round(prix * 40 / 100.0))", '')));

/* ══ 87 · LE DOSSIER REMIS NE TAIT PAS UNE PAGE ═══════════════════════ */
const png1x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const papier = (id: string, pages: string[]): Papier => ({
  id, genre: 'papier', branchId: 'br', titulaire: 'ent:mnd', type: 'rccm', numero: '', delivreLe: '', expireLe: '', original: '', note: '',
  pages: pages.map((chemin) => ({ chemin, nom: `${chemin}.png`, type: 'image/png', taille: 1 })), versions: [], deposeLe: '', deposePar: '', journal: [],
} as unknown as Papier);
const pieces = [{ papier: papier('p1', ['a', 'b']), titulaireNom: 'Maison' }, { papier: papier('p2', ['c']), titulaireNom: 'Maison' }];
const entier = await assembleLeDossier({ pieces, destinataire: 'Banque', jour: '10 octobre 2026', maison: 'Les papiers', lis: async () => png1x1 });
const { PDFDocument } = await import('pdf-lib');
dit('87 · toutes les pages lues : la garde puis trois pages', 4, (await PDFDocument.load(entier)).getPageCount());
let refus: unknown = null;
try {
  await assembleLeDossier({ pieces, destinataire: 'Banque', jour: '10 octobre 2026', maison: 'Les papiers', lis: async (ch) => (ch === 'b' ? null : png1x1) });
} catch (e) { refus = e; }
dit('87 · une page illisible arrete l assemblage et se nomme', [true, true], [refus instanceof PageIllisible, String((refus as Error | null)?.message ?? '').includes('b.png')]);
dit('87 · le mot du refus nomme la piece et la page a redeposer, sinon dit le refus seul', [true, true, 'Le dossier n’a pas pu être assemblé.'],
  [motDuRefus(refus).includes('· Maison · b.png est illisible'), motDuRefus(refus).includes('Redéposez-la'), motDuRefus(new Error('réseau'))]);

/* ══ 91 · LE BULLETIN IMPRIMÉ DIT LE NET DU RUN ═══════════════════════ */
/* bulletin.html est exécutée telle quelle, sur un document simulé : chaque
   élément porteur d'un id, avec la valeur d'exemple de son champ. */
function netDuBulletin(lien: string): number {
  const html = lisLe('bulletin.html');
  const elements = new Map<string, { value: string; textContent: string; classList: { toggle(): void }; addEventListener(): void }>();
  for (const m of html.matchAll(/<(\w+)\b([^>]*?)\sid="([^"]+)"([^>]*)>/g)) {
    const attrs = `${m[2]} ${m[4]}`;
    const valeur = /\svalue="([^"]*)"/.exec(` ${attrs}`)?.[1] ?? '';
    elements.set(m[3], { value: valeur, textContent: '', classList: { toggle() {} }, addEventListener() {} });
  }
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const document = { getElementById: (id: string) => elements.get(id) ?? null, querySelectorAll: () => [] };
  const location = { search: lien.slice(lien.indexOf('?')), href: '' };
  new Function('document', 'location', 'window', scripts[scripts.length - 1])(document, location, { open() {} });
  return Number((elements.get('m-net')?.textContent ?? '').replace(/\D/g, ''));
}
const p = { ...PAYROLL_PARAMETERS_SEED };
const gains: PayGains = { base: 300_000, heuresSup: 0, prime: 0, pourboires: 0, commission: 0, indemnites: 20_000 };
const ded: PayDeductions = { avance: 0, autresRetenues: 0, retenueCompteCourant: 50_000 };
const run = computePay(gains, ded, p);
const lien = bulletinHref('/bulletin.html', {
  nom: 'A. E.', periode: '2026-10', base: gains.base, hs: gains.heuresSup, prime: gains.prime, pourboires: gains.pourboires,
  commission: gains.commission, indemnites: gains.indemnites, avance: ded.avance, retenue: ded.autresRetenues, pret: ded.retenuePret,
  cc: ded.retenueCompteCourant, cnssPct: tauxCnssSalarial(p), itsActif: itsEstActif(p),
});
const u = new URL(lien, 'http://x');
dit('91 · le lien porte le compte courant et les indemnites', ['50000', '20000'], [u.searchParams.get('cc'), u.searchParams.get('indemnites')]);
dit('91 · sans compte courant, le lien n en dit rien', false, bulletinHref('/b.html', { nom: 'S', periode: '2026-10', base: 1 }).includes('cc='));
dit('91 · bulletin.html, executee, imprime le net du run (associe, indemnites, sans prime)', run.net, netDuBulletin(lien));
const simple = computePay({ ...gains, indemnites: 0 }, { avance: 0, autresRetenues: 0 }, p);
dit('91 · un salarie sans prime ni avance : aucune valeur d exemple au bulletin', simple.net,
  netDuBulletin(bulletinHref('/bulletin.html', { nom: 'S. D.', periode: '2026-10', base: 300_000, cnssPct: tauxCnssSalarial(p), itsActif: itsEstActif(p) })));
const paie = sansCommentaires('src/apps/trone/routes/equipe/Paie.tsx');
const bulletinFor = paie.slice(paie.indexOf('const bulletinFor'), paie.indexOf('const exportCsv'));
dit('91 · le lien Bulletin de la Paie passe le compte courant et les indemnites', [true, true],
  [bulletinFor.includes('cc: l.deductions.retenueCompteCourant'), bulletinFor.includes('indemnites: l.gains.indemnites')]);
/* Pas de tiret cadratin dans ce que lit le salarié (reprise du 10 octobre
   2026) : titre, libellés, mentions « suspendu », partage et courriel. Les
   commentaires sont effacés avant la lecture ; un tiret SEUL, posé comme
   valeur vide (« — » d'un champ non rempli), reste admis, comme dans le Trône. */
const pageDuBulletin = lisLe('bulletin.html')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/(["'>])—(["'<])/g, '$1$2');
dit('91 · bulletin.html n affiche aucun tiret cadratin entre deux mots', [], [...pageDuBulletin.matchAll(/.{0,30}—.{0,30}/g)].map((m) => m[0].trim()));
dit('91 · ses libelles disent la virgule, ses titres le point median', [true, true, true, true], [
  pageDuBulletin.includes('<title>Bulletin de Paie · Maison MND</title>'), pageDuBulletin.includes('CNSS, part salariale'),
  pageDuBulletin.includes("'suspendu, non appliqué'"), pageDuBulletin.includes("encodeURIComponent('Votre bulletin de paie · Maison MND')"),
]);

/* ══ 92 · RENOMMER N'EST PAS RETIRER ═══════════════════════════════════ */
const ANCIENS = ['La naissance', 'La restauration', 'La couleur végétale', 'Le défaisage'];
const inscription = (): Enrollment => ({
  id: 'e1', learnerName: 'A. B.', formationId: 'fo1', status: 'inscrit', createdAt: '2026-09-01', practice: [],
  sessions: [{ id: 's1', moduleIndex: 0 }, { id: 's2', moduleIndex: 2 }, { id: 's3' }] as Enrollment['sessions'],
  evaluations: [{ id: 'v1', moduleIndex: 2 }, { id: 'v2', moduleIndex: 3 }] as Enrollment['evaluations'],
});
const renomme = ['La naissance', 'La restauration', 'La couleur végétale (henné)', 'Le défaisage'];
const r1 = realigneLesModules(inscription(), ANCIENS, renomme, [0, 1, 2, 3]);
dit('92 · renommer garde seances et notes au meme rang', [[0, 2, undefined], [2, 3]], [r1.sessions.map((s) => s.moduleIndex), r1.evaluations.map((x) => x.moduleIndex)]);
const r2 = realigneLesModules(inscription(), ANCIENS, ['La naissance', 'La restauration', 'Le défaisage'], [0, 1, 3]);
dit('92 · retirer une ligne detache, sans effacer la note', [[0, undefined, undefined], [-1, 2]], [r2.sessions.map((s) => s.moduleIndex), r2.evaluations.map((x) => x.moduleIndex)]);
const r3 = realigneLesModules(inscription(), ANCIENS, ['Le calibre', 'La couleur (henné)', 'La naissance', 'La restauration', 'Le défaisage'], [undefined, 2, 0, 1, 3]);
dit('92 · deplacer, renommer et ajouter a la fois : chacun suit sa ligne', [[2, 1, undefined], [1, 4]], [r3.sessions.map((s) => s.moduleIndex), r3.evaluations.map((x) => x.moduleIndex)]);
dit('92 · sans origines (appel d avant), on suit encore le nom', [0, 1], realigneLesModules(inscription(), ANCIENS, ['La couleur végétale', 'Le défaisage'], undefined).evaluations.map((x) => x.moduleIndex));
dit('92 · les cases cochees suivent la ligne renommee', [true, false, true, false], modulesFaitsSuivent([true, false, true, false], 4, [0, 1, 2, undefined]));
const academie = sansCommentaires('src/apps/trone/routes/equipe/Academie.tsx');
dit('92 · le formulaire garde l origine et la passe au realignement', [true, true, true], [
  academie.includes("contenu: ligne?.contenu ?? '', origine: i }"),
  academie.includes('realigneLesModules(e, oldNames, modules, origines)'),
  academie.includes('modulesFaitsSuivent(a.modulesDone, oldNames.length, origines)'),
]);

/* ══ 93 · LA DEMANDE RELUE AU CLIC ════════════════════════════════════ */
const demande = (o: Partial<DemandeAcademie> = {}): DemandeAcademie => ({
  id: 'd1', branchId: 'br', creeLe: '2026-10-01T10:00:00Z', parcoursId: 'fondation', parcoursTitre: 'Fondation', nom: 'A. E.', telephone: '22900000000',
  public: 'debutante', prixXof: 150_000, acompteXof: 60_000, statut: 'nouvelle', ...o,
});
const payee = inscriptionDepuisDemande(demande({ acompteConfirme: true, acompteVerseXof: 60_000, payeLe: '2026-10-02T09:00:00Z', transactionId: 't1' }), 'fo1');
dit('93 · relue avec un acompte confirme, l inscription porte le reglement verse', [true, 60_000, '2026-10-02', 'KkiaPay'],
  payee.ok ? [true, payee.inscription.payments?.[0]?.amountXof, payee.inscription.payments?.[0]?.date, payee.inscription.payments?.[0]?.method] : [false]);
const nue = inscriptionDepuisDemande(demande(), 'fo1');
dit('93 · sans acompte, aucun reglement invente', [true, 0, 150_000], nue.ok ? [true, nue.inscription.payments?.length ?? 0, nue.inscription.priceXof] : [false]);
dit('93 · une demande deja inscrite, ou deja liee a un dossier, est refusee', [false, false],
  [inscriptionDepuisDemande(demande({ statut: 'inscrite' }), 'fo1').ok, inscriptionDepuisDemande(demande({ enrollmentId: 'enr-1' }), 'fo1').ok]);
const ecranDemandes = sansCommentaires('src/apps/trone/routes/equipe/AcademieDemandes.tsx');
const corps = ecranDemandes.slice(ecranDemandes.indexOf('const inscrire'), ecranDemandes.indexOf('if (demandes === null)'));
const ordre = (a: string, b: string) => corps.indexOf(a) >= 0 && corps.indexOf(b) > corps.indexOf(a);
dit('93 · relire la ligne, puis marquer la demande, puis creer le dossier, boutons tenus', [true, true, true, true], [
  ordre(".select('data').eq('id', d0.id).maybeSingle()", 'inscriptionDepuisDemande(d, fo.id)'),
  ordre('inscriptionDepuisDemande(d, fo.id)', "await ecris(d, { statut: 'inscrite', enrollmentId: r.inscription.id })"),
  ordre("await ecris(d, { statut: 'inscrite', enrollmentId: r.inscription.id })", 'enrollmentsStore.set('),
  /finally \{\s*setOccupe\(false\);\s*\}/.test(corps),
]);

console.log(ko === 0 ? '\nLe lot equipe-docs tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
